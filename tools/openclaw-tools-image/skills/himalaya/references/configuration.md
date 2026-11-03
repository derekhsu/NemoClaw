# Himalaya v2 configuration

Himalaya reads the first config file that exists:

1. `$XDG_CONFIG_HOME/himalaya/config.toml`
2. `~/.config/himalaya/config.toml`
3. `~/.himalayarc`

`-c <path>` overrides the path. Several paths separated by `:` are merged, the
later ones on top of the first.

The upstream template with every option is `config.sample.toml` in
<https://github.com/pimalaya/himalaya> (tag `v2.2.1`).

## IMAP and SMTP account

```toml
[accounts.work]
default = true
email = "alice@example.com"
display-name = "Alice"

imap.server = "imaps://imap.example.com:993"
imap.sasl.plain.username = "alice@example.com"
imap.sasl.plain.password.command = "cat ~/.config/himalaya/work-password"

smtp.server = "smtps://smtp.example.com:465"
smtp.sasl.plain.username = "alice@example.com"
smtp.sasl.plain.password.command = "cat ~/.config/himalaya/work-password"

mailbox.alias.sent = "Sent"
mailbox.alias.drafts = "Drafts"
mailbox.alias.trash = "Trash"
```

- A bare host (`imap.server = "imap.example.com"`) uses implicit TLS (`imaps`).
- For STARTTLS, use `imap://host:143` or `smtp://host:587` with
  `imap.starttls = true` or `smtp.starttls = true`.
- A server with a private certificate authority needs `imap.tls.cert` or
  `smtp.tls.cert` set to a PEM file.
- Other SASL mechanisms: `login`, `oauthbearer`, `xoauth2`, `scram-sha-256`,
  `anonymous`. OAuth tokens come from a `token.command`; v2 has no built-in
  OAuth flow.

## Secrets

Each `password` or `token` field takes `.raw = "..."` or `.command = "..."`
(a string or an argument list). The command prints the secret on stdout. Keep
the secret in a file only the sandbox user can read (`chmod 600`), or in a
password manager CLI. Do not use `.raw` outside of tests. v2 has no keyring
integration.

## Proxies

Network backends read `all_proxy` and `https_proxy` when the account has no
`proxy` block. A per-account proxy:

```toml
proxy.url = "http://proxy.example.com:3128"
```

`proxy.url` accepts `http://`, `socks5://`, and `socks5h://`.

## Local mail

```toml
[accounts.local]
maildir.root = "~/Mail/local"
mailbox.alias.inbox = "INBOX"
```

Without an alias, the inbox role resolves to the `inbox` directory under the
Maildir root, and Linux paths are case-sensitive.

`mbox.*`, `m2dir.root`, and `pimdir.*` are also available.

## Changes from v1

| v1 | v2 |
| --- | --- |
| `backend.type = "imap"`, `backend.host`, `backend.port` | `imap.server = "imaps://host:993"` |
| `backend.login`, `backend.auth.cmd` | `imap.sasl.plain.username`, `imap.sasl.plain.password.command` |
| `message.send.backend.*` | `smtp.server`, `smtp.sasl.*` |
| `folder.alias.*` | `mailbox.alias.*` |
| Keyring and OAuth settings | `password.command` or `token.command` |
| `himalaya account configure` | `himalaya` (no config) runs the wizard |
| `himalaya folder list` | `himalaya mailbox list` |
| `himalaya message write`, `template send` | `himalaya message compose`, `message send` |

Himalaya ignores a v1 `backend` table. `himalaya account list` then shows the
account with an empty `BACKENDS` column, and commands fail with
"configures no supported backend".
