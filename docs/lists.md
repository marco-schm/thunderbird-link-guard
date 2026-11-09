# Host lists

Host lists let you share approvals and blocks between computers or people: an
**allowlist** approves hosts, a **blocklist** blocks them. Lists are imported in
[Settings](settings.md#custom-and-remote-lists) from a JSON file or an HTTPS URL, shown
for review, and start disabled.

Lists are treated as untrusted input. A blocklist can only remove access, never grant
it; an allowlist cannot unlock links with a warning; and every list is validated strictly
before you see it.

## Format

```json
{
  "format": "link-guard-hosts",
  "version": 1,
  "kind": "block",
  "name": "My blocklist",
  "category": "other",
  "hosts": ["phishing.example.org", "*.example.net"]
}
```

| Field | Required | Value |
| --- | --- | --- |
| `format` | yes | always `"link-guard-hosts"` |
| `version` | yes | always `1` |
| `kind` | no | `"allow"` (default) or `"block"` |
| `name` | yes | 1 to 60 characters; no control characters, no `<` or `>`, no bidirectional control characters |
| `category` | yes | `"news"`, `"social"`, `"companies"` or `"other"` – a label for your overview only |
| `hosts` | yes | 1 to 5,000 unique entries (see below) |

No other fields are allowed; a list with an unknown field is rejected.

### Entries

- **Allowlists** contain exact DNS host names only: `example.org`, `www.example.org`.
- **Blocklists** may also contain whole-domain entries such as `*.example.net`, which
  block `example.net` and every subdomain. The domain must be a registrable domain
  according to the bundled Public Suffix List; entries like `*.co.uk` are refused when you
  save and ignored if they ever end up in storage.
- Not allowed: URLs, paths, ports, user names, IP addresses and any other wildcard.
- Entries are normalised (lower case, no trailing dot, internationalized names in `xn--`
  form). Two entries that are the same after normalisation make the list invalid.

### Limits

| Limit | Value |
| --- | --- |
| File size | 512 KiB (524,288 bytes, UTF-8) |
| Entries per list | 5,000 |
| Imported lists | 20 |

### Examples

The repository contains ready-made examples:
[allowlist](https://github.com/marco-schm/thunderbird-link-guard/blob/main/examples/hosts-example.json)
and
[blocklist](https://github.com/marco-schm/thunderbird-link-guard/blob/main/examples/blocklist-example.json).

## How lists take effect

| | Allowlist | Blocklist |
| --- | --- | --- |
| Effect when enabled | approves its exact hosts | blocks its hosts and `*.` domains |
| Overrides your approvals | – | yes |
| Unlocks links with a warning | no – they need an exact approval | – |
| Can be overridden by | your exact block, your whole-domain block, any enabled blocklist | nothing – change or disable the list |
| Updates itself | never | optionally, about once a day |

While an enabled blocklist blocks a host, approving that host permanently is refused;
disable the list or edit its entries first. In a message, such a host shows a note and
**Open settings** instead of the usual actions.

## Remote sources

A list can be loaded from an HTTPS URL. The fetch is deliberately strict:

| Requirement | Detail |
| --- | --- |
| Protocol | `https://` only |
| URL | no user name or password, no port, no `?query`, no `#fragment`; must point to a file, not to a directory ending in `/`; the host must be a domain name, not an IP address |
| CORS | the server must allow cross-origin requests, for example with `Access-Control-Allow-Origin: *` |
| Redirects | not followed – the URL must answer directly |
| Content type | `application/json` or `text/plain` |
| Size | at most 512 KiB for host lists and 64 KiB for warning lists; larger responses are aborted |
| Encoding | valid UTF-8 |
| Time | aborted after 10 seconds |

Requests are sent without cookies or other credentials, without a referrer, and
bypass the cache. They contain no information about your mail.

### Hosting a list

Any static host that sends a CORS header works. Two simple options:

- **GitHub** – a file in a public repository, loaded from
  `https://raw.githubusercontent.com/<user>/<repo>/<branch>/<path>.json`, or published
  with GitHub Pages.
- **Your own web server** – serve the file with CORS allowed, for example in nginx:

  ```nginx
  location = /link-guard/blocklist.json {
      default_type application/json;
      add_header Access-Control-Allow-Origin * always;
  }
  ```

Avoid URLs that redirect, for example from `http://` to `https://` or to a CDN; they
are rejected.

## Automatic updates

Remote **blocklists** can keep themselves up to date. Each has the option **Update
automatically about once a day (replaces local edits)**, which is on by default when you
import it. Allowlists and warning lists never update themselves, and disabled lists are
never fetched.

When an update is due, Link Guard fetches the list with the same restrictions as a manual
import. Checks happen when Thunderbird starts and whenever a message is displayed,
at most about once a day per list, and about an hour after a failed attempt.

An update **replaces only the entries** of a list that is still enabled and still a
blocklist from the same URL. It never enables a list and never approves anything. It is
**held for your review** instead of applied if it:

- adds more than 50 entries,
- grows the list to more than twice its size (and more than 25 entries),
- shrinks a list of ten or more entries by more than half, or
- would block a host or domain that you have approved.

The list card in Settings shows the outcome:

| Message | Meaning |
| --- | --- |
| *Last automatic check: \<date\>* | the update was applied or nothing changed |
| *Automatic update failed on \<date\>. The previous list stays active.* | the source could not be fetched or was invalid |
| *The source now declares a different list type, so the list was not changed. Review it manually.* | the source turned from a blocklist into an allowlist |
| *The automatic update was not applied because it is large or would block something you approved. The previous list stays active; use "Review remote update".* | one of the review conditions above applied |

In every case except a successful update, the stored list stays exactly as it was.

## Trust and privacy

- Subscribe only to sources you trust. A compromised source – for example an expired
  domain that someone re-registered – can block legitimate sites within the limits
  above. It can never approve a site or silence a warning.
- Each fetch reveals your IP address to the list host, and the CORS request reveals
  Link Guard's per-installation extension origin. No mail content and no link targets
  are sent.
