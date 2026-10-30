<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Published Base Inspection

## Selected artifact

The maintainer explicitly selected `2026.9.2-r2` on 2026-10-30. Use this release
identity and its inspected index digest:

```text
docker.io/derekhsu/openshell-openclaw:2026.9.2-r2
docker.io/derekhsu/openshell-openclaw@sha256:8f951046eaf0de9f2e00fb7ff7d8d33de62e5c5890758289e27ec405fb5c1d02
```

The bare `2026.9.2` tag points to an older image with index digest
`sha256:cead50532cd8fba03ea0c9c8e3b3361dbf7185be58e195841bcdbad9c22ac1c1`
and source commit `6e1e7682f5bf5466a1cdc3d84509c72f6f29cd89`. It is not the
selected input. The observed `openclaw-2026.9.2` alias matched r2; pin the digest
instead of relying on that mutable alias.

The r2 source label identifies `70ff5c849b369c0cf467df3b2431dd4f00b795c9`,
which matches this track's source base. The corresponding fork publication run
is [40887443460](https://github.com/derekhsu/NemoClaw/actions/runs/40887443460).

## Manifest and image configuration

| Property | linux/amd64 | linux/arm64 |
| --- | --- | --- |
| Platform manifest | `sha256:204f395e649d9f0c987ad4895bd716fbc9d24dcbb1ef2072d66fd7f6a7da4ff1` | `sha256:c4a45dc250b39111e94f411fe47fdfbe0529a1ac0ed8960c1b466c963d475a65` |
| Configuration | `sha256:e3e1d74bbd44d36ab5efa1c0bb04c2133e2035a2e5615d5d253b8c18856d4a6c` | `sha256:1951213643605682c114b2f9517963466258107fcbdd4550545ab807ef77e564` |
| Created UTC | 2026-10-29 14:13:28 | 2026-10-29 14:13:57 |
| Compressed layer bytes | 960352419 | 958747715 |
| Runtime user | `sandbox` | `sandbox` |
| Working directory | `/sandbox` | `/sandbox` |
| Entrypoint | `/usr/local/bin/nemoclaw-start` | `/usr/local/bin/nemoclaw-start` |
| Command | `/bin/bash` | `/bin/bash` |
| Healthcheck | Present | Present |

Registry manifests, configurations, and inspected layers were fetched over
verified HTTPS. SHA-256 values were checked against their content descriptors.
Only selected regular-file members were read from layers; archive paths were
not extracted into the host filesystem.

Both final runtime layers contain OpenClaw package metadata with name
`openclaw`, version `2026.9.2`, and file SHA-256
`aaba2fdde13e3d1a676102fc53195bac94d6236e9d9bef192c84dca04cf9ea5b`.
This artifact inspection is separate from the process execution below.

## Offline non-root process checks

Both selected platform images were executed locally with the stock non-root
user, an overridden inspection entrypoint, no network, a read-only root, a
64 MiB writable `/tmp`, no Linux capabilities, and no-new-privileges. No gateway
or OpenShell sandbox was created. amd64 execution used local Docker emulation;
this is not native amd64 qualification.

The inspection ran these commands in each platform image:

```bash
id
pwd
node --version
python3 --version
openclaw --version
cat /usr/local/share/nemoclaw/security-packages.txt
dpkg-query -W -f='${binary:Package}\t${Version}\n'
```

Both executions returned status 0 and reported:

```text
uid=998(sandbox) gid=998(sandbox) groups=998(sandbox)
/sandbox
v24.22.1
Python 3.13.5
OpenClaw 2026.9.2 (3928bad)
```

All 27 controlled package versions matched actual dpkg-query results on both
architectures. The runtime query produced 184 dpkg records per platform.
The inventory member has owner/group `0:0` and mode `0444`. Its SHA-256 differs
because its architecture header differs:

- amd64: `aa0c6ee7271dba63ec4a17c93506c55dcce6bb3f0829ec7c32fe2b03ade50fd2`
- arm64: `7faf7147f04da0d1e431f3ee444f305287b98927ea9790e2ffe279b10727e1f4`

Machine-readable identity evidence is in [base-image.json](base-image.json).
The controlled lists are [amd64](base-security-amd64.txt) and
[arm64](base-security-arm64.txt). Final dpkg records are
[amd64](base-packages-amd64.tsv) and [arm64](base-packages-arm64.tsv).

## Boundaries of this result

These checks provide base-artifact evidence for Task 1.1. They do not qualify
additional tools, apt compatibility, policy-enforced browser access, Office
conversion, native amd64 behavior, or deployment startup. The tools image has
not been built or published.

The first Python request failed because its default CA bundle lacked the local
issuer. Request-local `SSL_CERT_FILE=/etc/ssl/cert.pem` resolved the failure.
Peer verification stayed enabled; no host trust store was changed.
