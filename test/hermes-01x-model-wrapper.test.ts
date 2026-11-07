// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// OpenShell 0.1.x Hermes wrapper (agents/hermes-01x/hermes-wrapper.py, #52):
// `hermes model` on the integrity-pinned default profile must not leave a
// config.yaml the .config-hash no longer matches. The wrapper restores the
// original bytes and submits the picker's result through write-model-config.
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const WRAPPER = path.resolve(import.meta.dirname, "../agents/hermes-01x/hermes-wrapper.py");

const ORIGINAL = `model:
  default: gpt-6-luna
  provider: custom:clawshell-openai-official
providers:
  clawshell-openai-official:
    api_key: openshell:resolve:env:sb1
  clawshell-openai-alt:
    api_key: openshell:resolve:env:sb2
mcp_servers: {}
`;
const PICKED = ORIGINAL.replace(
  "provider: custom:clawshell-openai-official",
  "provider: custom:clawshell-openai-alt",
);

// Stand-in for the real Hermes CLI: writes what `hermes model` would.
const STUB_HERMES = `import os, sys
home = os.environ["FX_HOME"]
open(os.environ["FX_ARGV"], "w").write(" ".join(sys.argv[1:]))
mode = os.environ.get("FX_MODE", "noop")
if mode in ("pick", "pick-env"):
    open(os.path.join(home, "config.yaml"), "w").write(os.environ["FX_PICKED"])
if mode == "pick-wait":
    import time
    open(os.path.join(home, "config.yaml"), "w").write(os.environ["FX_PICKED"])
    time.sleep(30)
if mode in ("env", "pick-env"):
    open(os.path.join(home, ".env"), "a").write("OPENAI_API_KEY=sk-typed\\n")
raise SystemExit(int(os.environ.get("FX_RC", "0")))
`;

// Stand-in for hermes-mcp-config-transaction.py (marker: model_sections_only).
const STUB_TRANSACTION = `import os, sys, json
payload = sys.stdin.read()
config = open(os.path.join(os.environ["FX_HOME"], "config.yaml")).read()
json.dump({"argv": sys.argv[1:], "payload": json.loads(payload), "config_at_call": config},
          open(os.environ["FX_TX"], "w"))
code = int(os.environ.get("FX_TX_EXIT", "0"))
if code:
    print("write-model-config accepts only OpenShell credential placeholders as new api_key values",
          file=sys.stderr)
raise SystemExit(code)
`;

const sha256 = (text: string) => crypto.createHash("sha256").update(text).digest("hex");
const python = spawnSync("python3", ["-c", "import sys; print(sys.executable)"], {
  encoding: "utf8",
}).stdout.trim();

describe.skipIf(process.platform === "win32" || !python)(
  "hermes-wrapper.py `hermes model` (0.1.x default profile)",
  () => {
    let dir: string;
    let home: string;
    let wrapper: string;
    let transaction: string;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-01x-model-wrapper-"));
      home = path.join(dir, ".hermes");
      fs.mkdirSync(home);
      fs.writeFileSync(path.join(home, "config.yaml"), ORIGINAL, { mode: 0o640 });
      fs.writeFileSync(path.join(home, ".env"), "API_SERVER_KEY=x\n", { mode: 0o640 });
      fs.writeFileSync(path.join(home, ".config-hash"), "pinned\n");
      transaction = path.join(dir, "hermes-mcp-config-transaction.py");
      fs.writeFileSync(transaction, `# model_sections_only\n${STUB_TRANSACTION}`);
      fs.writeFileSync(path.join(dir, "hermes.real"), `#!${python}\n${STUB_HERMES}`, {
        mode: 0o755,
      });
      wrapper = path.join(dir, "hermes-wrapper.py");
      const source = fs
        .readFileSync(WRAPPER, "utf8")
        .replace(
          '_MODEL_HERMES_HOME = "/sandbox/.hermes"',
          `_MODEL_HERMES_HOME = ${JSON.stringify(home)}`,
        )
        .replace(
          '_MODEL_TRANSACTION = "/usr/local/lib/nemoclaw/hermes-mcp-config-transaction.py"',
          `_MODEL_TRANSACTION = ${JSON.stringify(transaction)}`,
        )
        .replace(
          '_MODEL_TRANSACTION_PYTHON = "/opt/hermes/.venv/bin/python3"',
          `_MODEL_TRANSACTION_PYTHON = ${JSON.stringify(python)}`,
        );
      expect(source).toContain(`_MODEL_HERMES_HOME = ${JSON.stringify(home)}`);
      expect(source).toContain(`_MODEL_TRANSACTION = ${JSON.stringify(transaction)}`);
      fs.writeFileSync(wrapper, source);
    });

    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    function hermes(args: string[], env: Record<string, string> = {}) {
      return spawnSync(python, ["-I", wrapper, ...args], {
        encoding: "utf8",
        timeout: 20000,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: dir,
          FX_HOME: home,
          FX_ARGV: path.join(dir, "argv"),
          FX_TX: path.join(dir, "tx.json"),
          FX_PICKED: PICKED,
          ...env,
        },
      });
    }
    const config = () => fs.readFileSync(path.join(home, "config.yaml"), "utf8");
    const dotenv = () => fs.readFileSync(path.join(home, ".env"), "utf8");
    const tx = () =>
      fs.existsSync(path.join(dir, "tx.json"))
        ? JSON.parse(fs.readFileSync(path.join(dir, "tx.json"), "utf8"))
        : null;

    it("submits the picked model through write-model-config from the original bytes", () => {
      const result = hermes(["model", "--refresh"], { FX_MODE: "pick" });
      expect(result.status, result.stderr).toBe(0);
      expect(fs.readFileSync(path.join(dir, "argv"), "utf8")).toBe("model --refresh");
      const call = tx();
      expect(call.argv).toEqual(["write-model-config"]);
      expect(call.payload).toEqual({
        expected_config_sha256: sha256(ORIGINAL),
        config: PICKED,
        model_sections_only: true,
      });
      // The transaction sees the hash-matching original, never Hermes' direct write.
      expect(call.config_at_call).toBe(ORIGINAL);
      expect(fs.statSync(path.join(home, "config.yaml")).mode & 0o777).toBe(0o640);
      expect(result.stderr).toContain("Model choice saved");
    });

    it("keeps the original config when the transaction refuses the choice", () => {
      const result = hermes(["model"], { FX_MODE: "pick", FX_TX_EXIT: "2" });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Model choice was not saved");
      expect(result.stderr).toContain("only OpenShell credential placeholders");
      expect(config()).toBe(ORIGINAL);
    });

    it("does nothing when the picker changes nothing", () => {
      const result = hermes(["model"], { FX_MODE: "noop", FX_RC: "4" });
      expect(result.status).toBe(4);
      expect(tx()).toBeNull();
      expect(config()).toBe(ORIGINAL);
    });

    it("reverts a picker write to the pinned .env", () => {
      const result = hermes(["model"], { FX_MODE: "pick-env" });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("tried to change ~/.hermes/.env");
      expect(dotenv()).toBe("API_SERVER_KEY=x\n");
      expect(tx().payload.config).toBe(PICKED);
    });

    it("still reconciles when the wrapper is stopped while the picker runs", async () => {
      const child = spawn(python, ["-I", wrapper, "model"], {
        env: {
          PATH: process.env.PATH ?? "",
          HOME: dir,
          FX_HOME: home,
          FX_ARGV: path.join(dir, "argv"),
          FX_TX: path.join(dir, "tx.json"),
          FX_PICKED: PICKED,
          FX_MODE: "pick-wait",
        },
        stdio: "ignore",
      });
      const deadline = Date.now() + 10000;
      while (config() !== PICKED && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(config()).toBe(PICKED);
      const exited = new Promise<number | null>((resolve) =>
        child.on("exit", (code) => resolve(code)),
      );
      child.kill("SIGTERM");
      expect(await exited).toBe(128 + 15);
      // Hermes' direct write never outlives the wrapper: the transaction got it.
      expect(tx().config_at_call).toBe(ORIGINAL);
      expect(tx().payload.config).toBe(PICKED);
    });

    it("leaves other homes, help and images without the transaction to Hermes", () => {
      const gate = (args: string[], env: Record<string, string> = {}) =>
        spawnSync(
          python,
          [
            "-I",
            "-c",
            "import importlib.util, json, sys\n" +
              "spec = importlib.util.spec_from_file_location('w', sys.argv[1])\n" +
              "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)\n" +
              "print(json.dumps(m._model_reconcile_home(json.loads(sys.argv[2]))))",
            wrapper,
            JSON.stringify(args),
          ],
          { encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: dir, ...env } },
        ).stdout.trim();
      expect(gate(["model"])).toBe(JSON.stringify(home));
      expect(gate(["model", "--help"])).toBe("null");
      expect(gate(["chat"])).toBe("null");
      expect(gate(["-p", "api", "model"])).toBe("null");
      expect(gate(["model"], { HERMES_HOME: path.join(dir, "elsewhere") })).toBe("null");
      fs.writeFileSync(transaction, STUB_TRANSACTION.replace(/model_sections_only/g, ""));
      expect(gate(["model"])).toBe("null");
    });
  },
);
