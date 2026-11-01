<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Phase 4 Evidence: Image Variant Publication Workflow

No image was pushed in this phase.

## Release rules

`scripts/openclaw-image-release.sh` owns the rules, and
`test/openclaw-image-release.test.ts` tests them with a fake `docker` that
records every registry call. 38 tests pass. When the existing-tag check and
the tools tag grammar were broken on purpose, 12 tests failed.

| Behavior | Test result |
| --- | --- |
| tools plan: one tag, base from `Dockerfile.tools` by digest, no moving alias | Pass |
| standard plan: `<tag>`, `<tag>-amd64`, `<tag>-arm64`, then `latest` and `openclaw-<version>` | Pass |
| Wrong grammar per variant, including `-tools.` on standard, `-r<n>` and arch suffixes on tools, `-tools.0` | Rejected before any registry call |
| Shell-sensitive tags: `$(...)`, newline, space | Rejected before any registry call |
| Unknown variant | Rejected |
| Repository other than `derekhsu/NemoClaw`, ref other than `feat/image-only-cli`, image other than `docker.io/derekhsu/openshell-openclaw` | Rejected |
| Standard tag version differs from `Dockerfile` `OPENCLAW_VERSION` | Rejected |
| tools base by tag, other repository, or intermediate base image | Rejected |
| Existing release tag, including one architecture tag | Rejected; no write |
| Registry error other than "not found" | Stops; no output |
| tools tag version differs from the image's `openclaw --version` | Rejected |
| Publish rechecks existing tags before the first write | Rejected; no write |
| Missing architecture digest, or digest outside the release image | Rejected; no write |
| Later tag write fails | Summary lists both digests and the tags already written; aliases not moved |
| First tag write fails | Summary lists both digests and no tags |

## Workflow runs

| Run | Source | Result |
| --- | --- | --- |
| [41256173645](https://github.com/derekhsu/NemoClaw/actions/runs/41256173645) | Publish workflow dispatched from `codex/issue-16-tools-image` with `tools` / `2026.9.2-tools.1` | Expected rejection: `publication runs only from refs/heads/feat/image-only-cli`; build, publish, and report jobs skipped |
| [41256151173](https://github.com/derekhsu/NemoClaw/actions/runs/41256151173) | `c615495`: verify workflow switched to the publish workflow's buildx build | 23/24; `fontconfig_cache` failed on both architectures |
| [41258407762](https://github.com/derekhsu/NemoClaw/actions/runs/41258407762), [41259637481](https://github.com/derekhsu/NemoClaw/actions/runs/41259637481), [41260650758](https://github.com/derekhsu/NemoClaw/actions/runs/41260650758) | Diagnostics and partial fixes | `FC_DEBUG=16` showed cache and directory mtimes differing |
| [41261560595](https://github.com/derekhsu/NemoClaw/actions/runs/41261560595) | `994d434`: font directory mtimes truncated before `fc-cache` | 24/24 fixtures pass on amd64 and arm64; tools layer adds 0 fixable CRITICAL/HIGH findings (11 inherited from the base) |

Image size in run 41261560595: amd64 adds 3,362,445,605 bytes (5.62 GB
total) and arm64 adds 3,262,412,888 bytes (5.53 GB total). Each job took
about 11 minutes.

## Font cache and BuildKit export

fontconfig accepts a cache only when the font directory mtime matches it,
including nanoseconds. The BuildKit export used by `docker/build-push-action`
drops nanoseconds and drops a layer change that only touches a directory
mtime. `Dockerfile.tools` therefore truncates each font directory mtime,
following symlinks, to its own whole second before `fc-cache`. The earlier
`docker build` path kept nanoseconds, so this did not appear in Phase 2 or 3.

## Not exercised without a push

The Docker Hub login, push by digest, `imagetools create`, and the untagged
digest report job run only during a real publication. The release script's
publish behavior is covered by the tests above with a fake registry. The
first real publication must be dispatched from `feat/image-only-cli` after
this branch is merged.

Partial writes: Docker Hub has no atomic multi-tag write. A failed
architecture writes no tag and leaves the other architecture pushed by
digest only; the report job lists it. A failed tag write leaves earlier tags
in place and lists them. Nothing is deleted automatically. Retry with a new
`-tools.<n>` or `-r<n>` tag.
