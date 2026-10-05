// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");

// Package resolution and privileged chown are external boundaries. The fixture
// records those calls; bash, package imports, chmod and permission checks run.
export function runUploaderImageAssembly(installStatus = 0) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-uploader-assembly-"));
  try {
    const dockerfile = fs.readFileSync(path.join(root, "agents/hermes/Dockerfile"), "utf8");
    const payload = dockerfile.match(
      /FROM scratch AS hermes-local-uploader-payload\n([\s\S]*?)\nFROM /,
    )?.[1];
    const command = dockerfile.match(
      /^RUN cd \/opt\/nemoclaw-sandbox-mcp-server[\s\S]*?(?=\n\n)/m,
    )?.[0];
    if (!payload || !command) throw new Error("Uploader assembly stage is missing");
    const stage = path.join(directory, "payload");
    const imageRoot = path.join(directory, "image");
    fs.mkdirSync(stage);
    fs.mkdirSync(imageRoot);
    for (const line of payload.trim().split("\n")) {
      const copy = line.match(/^COPY (\S+) (\S+)$/);
      if (!copy) throw new Error("Unsupported uploader payload instruction");
      fs.cpSync(path.join(root, copy[1]), path.join(stage, copy[2]), { recursive: true });
    }
    const commandOffset = dockerfile.indexOf(command);
    const finalStage = dockerfile.slice(
      dockerfile.lastIndexOf("\nFROM ", commandOffset),
      commandOffset,
    );
    for (const line of finalStage.split("\n")) {
      const copy = line.match(/^COPY --from=hermes-local-uploader-payload (\S+) (\S+)$/);
      if (copy)
        fs.cpSync(path.join(stage, copy[1]), path.join(imageRoot, copy[2]), { recursive: true });
    }
    const bin = path.join(directory, "tools");
    fs.mkdirSync(bin);
    fs.writeFileSync(
      path.join(bin, "uv"),
      `#!/usr/bin/env python3
import json, os, pathlib, shutil, sys, tomllib
target = pathlib.Path(os.environ['UV_PROJECT_ENVIRONMENT'])
pathlib.Path(os.environ['INSTALL_RECEIPT']).write_text(json.dumps({'args': sys.argv[1:], 'target': str(target)}))
if int(os.environ['INSTALL_STATUS']):
    raise SystemExit(int(os.environ['INSTALL_STATUS']))
tomllib.loads(pathlib.Path('uv.lock').read_text())
target.joinpath('bin').mkdir(parents=True)
target.joinpath('lib').mkdir()
shutil.copytree('src/sandbox_mcp_server', target / 'lib/sandbox_mcp_server')
target.joinpath('lib/fastmcp.py').write_text('''import json
class FastMCP:
    def __init__(self, name): self.name = name
    def tool(self): return lambda function: function
    def run(self, **kwargs): print(json.dumps(dict(name=self.name, **kwargs)))
''')
target.joinpath('lib/httpx.py').write_text('')
target.joinpath('bin/python').write_text('#!/bin/sh\\nexec python3 "$@"\\n')
entry = tomllib.loads(pathlib.Path('pyproject.toml').read_text())['project']['scripts']['sandbox-mcp-server']
module, function = entry.split(':')
target.joinpath('bin/sandbox-mcp-server').write_text('#!/bin/sh\\nexec python3 -c "from ' + module + ' import ' + function + '; ' + function + '()"\\n')
for executable in target.joinpath('bin').iterdir(): executable.chmod(0o777)
`,
      { mode: 0o755 },
    );
    fs.writeFileSync(
      path.join(bin, "chown"),
      `#!/usr/bin/env python3
import json, os, pathlib, sys
pathlib.Path(os.environ['OWNERSHIP_RECEIPT']).write_text(json.dumps(sys.argv[1:]))
`,
      { mode: 0o755 },
    );
    fs.writeFileSync(
      path.join(bin, "find"),
      `#!/usr/bin/env python3
import os, sys
args = [str(os.getuid()) if value == 'root' else value for value in sys.argv[1:]]
if sys.platform == 'darwin':
    args = ['+022' if value == '/022' else value for value in args]
os.execv('/usr/bin/find', ['find', *args])
`,
      { mode: 0o755 },
    );
    const environment = path.join(imageRoot, "sandbox/.venvs/sandbox-mcp-server");
    // The image probe uses -I, so a fixture wrapper installs its dependency
    // doubles explicitly rather than relying on PYTHONPATH's isolated behavior.
    const python = path.join(bin, "python3");
    const hostPython = spawnSync("which", ["python3"], { encoding: "utf8" }).stdout.trim();
    fs.writeFileSync(
      python,
      `#!/bin/sh
exec ${hostPython} -B -c 'import runpy, sys; sys.path.insert(0, sys.argv[1]); args=sys.argv[2:]; args.remove("-I") if "-I" in args else None; exec(args[1]) if args[0] == "-c" else runpy.run_path(args[0], run_name="__main__")' '${environment}/lib' "$@"
`,
      { mode: 0o755 },
    );
    // The uv fixture itself needs the host interpreter before installation.
    const uv = fs
      .readFileSync(path.join(bin, "uv"), "utf8")
      .replace("#!/usr/bin/env python3", `#!${hostPython}`);
    fs.writeFileSync(path.join(bin, "uv"), uv, { mode: 0o755 });
    fs.writeFileSync(
      path.join(bin, "chown"),
      fs
        .readFileSync(path.join(bin, "chown"), "utf8")
        .replace("#!/usr/bin/env python3", `#!${hostPython}`),
    );
    fs.writeFileSync(
      path.join(bin, "find"),
      fs
        .readFileSync(path.join(bin, "find"), "utf8")
        .replace("#!/usr/bin/env python3", `#!${hostPython}`),
    );
    const installReceipt = path.join(directory, "install.json");
    const ownershipReceipt = path.join(directory, "ownership.json");
    const result = spawnSync(
      "bash",
      [
        "-ec",
        command
          .slice(4)
          .replaceAll("/opt/", `${imageRoot}/opt/`)
          .replaceAll("/sandbox/", `${imageRoot}/sandbox/`),
      ],
      {
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          INSTALL_RECEIPT: installReceipt,
          OWNERSHIP_RECEIPT: ownershipReceipt,
          INSTALL_STATUS: String(installStatus),
        },
      },
    );
    const entrypoint = spawnSync(path.join(environment, "bin/sandbox-mcp-server"), [], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      timeout: 5000,
    });
    return {
      result,
      entrypoint,
      install: JSON.parse(fs.readFileSync(installReceipt, "utf8")),
      ownership: fs.existsSync(ownershipReceipt)
        ? JSON.parse(fs.readFileSync(ownershipReceipt, "utf8"))
        : null,
      environment,
      executableMode: fs.existsSync(path.join(environment, "bin/sandbox-mcp-server"))
        ? fs.statSync(path.join(environment, "bin/sandbox-mcp-server")).mode & 0o777
        : null,
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
