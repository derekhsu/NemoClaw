---
name: himalaya
description: "Himalaya v2 CLI for email over IMAP/SMTP, JMAP, Gmail, Microsoft Graph, or Maildir: list, search, read, compose, reply, forward, copy, move, flag, delete."
homepage: https://github.com/pimalaya/himalaya
metadata:
  {
    "openclaw":
      {
        "emoji": "📧",
        "requires": { "bins": ["himalaya"] },
        "install":
          [
            {
              "id": "brew",
              "kind": "brew",
              "formula": "himalaya",
              "bins": ["himalaya"],
              "label": "Install Himalaya (brew)",
            },
          ],
      },
  }
---

<!-- NemoClaw tools image override of the bundled OpenClaw himalaya skill, which
     documents the Himalaya v1 CLI (openclaw/openclaw#129034). Remove this copy
     when the bundled skill documents v2. -->

# Himalaya

Use `himalaya` (v2) to manage email from the shell. Check the version first:

```bash
himalaya --version
```

Every command has `--help`, which is the source of truth for its flags. Himalaya
v1 commands such as `folder list`, `account configure`, `message write`, and
`template send` do not exist in v2.

## References

- `references/configuration.md`: account config, authentication, proxies, and
  the v1-to-v2 config changes.

## Setup

Config path: `~/.config/himalaya/config.toml`, or pass `-c <path>`.

- Running `himalaya` with no config starts an interactive wizard that discovers
  the servers from an email address and prints the account TOML.
- `himalaya account list` shows the accounts and their backends. An empty
  `BACKENDS` column means the account uses the v1 config format.
- `himalaya account check` tests the connection.

Do not paste passwords into chat, logs, or the config file. Use a
`password.command` that prints the secret (see `references/configuration.md`).

## Read and search

`-m/--mailbox` takes a mailbox name, alias, or role (`inbox`, `sent`, `drafts`,
`trash`) and defaults to the inbox. Message IDs come from `envelope list` and
are backend-specific strings.

```bash
himalaya mailbox list
himalaya envelope list
himalaya envelope list -m sent --page 2
himalaya --json envelope search from alice and after 2026-01-01 order by date desc
himalaya message read <id>
himalaya attachment download <id> --dir /tmp/attachments
```

`envelope search` conditions: `date`, `after`, `from`, `to`, `subject`, `body`,
`flag <seen|answered|flagged|draft>`, combined with `and`, `or`, `not`, and
parentheses; sort with `order by <date|from|to|subject> [asc|desc]`. Put
`--json` before the query, because every word after `search` is part of the
query.

## Write

`message compose`, `reply`, and `forward` print the message to stdout unless
`--send` or `--save <mailbox>` is given.

```bash
himalaya message compose --to bob@example.com --subject "Report" --body-file /tmp/body.txt
himalaya message compose --to bob@example.com --subject "Report" --body "See attached." --attach /tmp/report.pdf --send
himalaya message reply <id> --body "Thanks, received." --send
himalaya message forward <id> --to carol@example.com --send
himalaya message send < /tmp/message.eml
himalaya message add -m drafts --flag draft < /tmp/message.eml
```

## Organize

```bash
himalaya message copy --to Archive <id>
himalaya message move --from INBOX --to Archive <id> <id>
himalaya message delete <id>
himalaya flag add --flag seen <id>
himalaya flag remove --flag seen <id>
```

`message delete` moves messages to the trash, and deletes them for good when
they are already in the trash.

## Safety

- Show the composed message and confirm before running anything with `--send`.
- Confirm before deleting or moving many messages.
- Use `-a/--account <name>` when several accounts exist.
- Quote exact message IDs in summaries.
- Debug with `--log-level debug`; logs go to stderr.
