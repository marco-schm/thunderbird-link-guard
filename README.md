# Link Guard for Thunderbird

[![CI](https://github.com/marco-schm/thunderbird-link-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/marco-schm/thunderbird-link-guard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Link Guard makes web links in displayed email inactive until you approve their destination host. A notice bar in Thunderbird's style shows which hosts a message links to, grouped by what needs your attention, flags suspicious links, and lets you allow or block each host or its whole domain. No trust list is bundled, and nothing is uploaded: your mail never leaves Thunderbird.

**Website:** [link-guard.nullringresearch.de](https://link-guard.nullringresearch.de/) · **Documentation:** [link-guard.nullringresearch.de/thunderbird](https://link-guard.nullringresearch.de/thunderbird/)

<p align="center">
  <img src="docs/screenshots/message-panel.png" alt="Link Guard notice in Thunderbird style: hosts grouped into Needs attention and Not yet approved, with warnings for a short link, a lookalike domain and misleading link text" width="720">
</p>

<sub>Screenshots use synthetic messages and reserved example domains.</sub>

## Features

- **Per-host approval.** Allow or block an exact host, or a whole registrable domain (`*.example.org`, which includes `example.org`). `login.example.org` and `example.org` are separate decisions.
- **Temporary or permanent.** A temporary approval applies to the current message only. Permanent rules are editable in Settings.
- **Phishing signals.** Prominent warnings for lookalike and internationalized domains, URL credentials, IP addresses, misleading link text, script code in the link, redirects to unapproved sites, and public URL shorteners. Links with descriptive text also show their real host; this label can be switched off in Settings if it disturbs a message's layout.
- **Safer defaults.** Shorteners can only be approved for one message, and shared-content hosts such as `docs.google.com` are excluded from broad domain approvals.
- **Configurable warnings.** Switch built-in warnings off, or add your own as regular expressions for the host, URL or link text, also from imported warning lists. See [Warnings](#warnings).
- **Allowlists and blocklists.** Import hosts from a JSON file or an HTTPS URL. Remote blocklists can update themselves daily within strict limits. See [Lists](#lists).
- **Localized.** 20 languages follow Thunderbird's interface language, and others fall back to English: Chinese (Simplified and Traditional), Czech, Danish, Dutch, English, Finnish, French, German, Hungarian, Italian, Japanese, Korean, Polish, Portuguese (Brazil), Russian, Spanish, Swedish, Turkish and Ukrainian.

## Installation

1. Download the XPI from the [latest release](https://github.com/marco-schm/thunderbird-link-guard/releases), or [build it](#development) from source.
2. In Thunderbird, open **Add-ons and Themes**, choose **Install Add-on From File**, and select the XPI.

Thunderbird 151 or newer is required. Link Guard requests only `messagesRead`, `scripting` and `storage`, and no host permissions. It is developed and tested with Thunderbird 159 on macOS; other versions and platforms are untested.

## How it works

Link Guard removes the `href` of unapproved links and intercepts clicks on them. It covers every element Thunderbird itself opens as a link: HTML anchors and image maps, SVG anchors, MathML elements with an `href`, and links inside shadow trees. HTML `<link>` elements, which a message could style into a clickable box, are hidden. Each destination is taken as Thunderbird resolves it, including a `<base href>` in the message, so a `#fragment` or empty `href` that a base points at the web is treated as a web link. It checks up to 500 links per message; further links stay inactive. `mailto:`, `tel:`, `cid:` and fragments within the message are not subject to host approval. The notice disappears once every web link is approved and has no warning.

Rules are evaluated in this order:

1. A **block** (your own, or from an enabled imported blocklist) denies the host. It overrides every approval, including one for the current message. A blocked host offers only **Unblock** in the notice, with a confirmation; a host blocked by an imported list links to Settings instead.
2. A **temporary approval** for the current message allows the host.
3. A **permanent approval** (exact host, whole domain, or an enabled imported allowlist) allows the host. Links with a risk such as credentials or misleading link text still need an explicit approval of their exact host.
4. Everything else stays inactive until you decide.

<p align="center">
  <img src="docs/screenshots/settings-rules.png" alt="Settings page with separate cards for approved hosts, blocked hosts, approved whole domains and blocked whole domains" width="720">
</p>

## Lists

Settings can import lists of hosts from a local file or an HTTPS URL. Every list is shown for review before it is staged, and imports start **disabled** until you enable them.

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

| Field | Meaning |
| --- | --- |
| `kind` | `"allow"` (default) or `"block"`. |
| `category` | `news`, `social`, `companies` or `other`. |
| `hosts` | Up to 5,000 unique DNS hostnames. No URLs, ports, IP addresses or other wildcards. **Blocklists only** may also use `*.example.net`, which blocks the registrable domain and all subdomains. |

Limits: 512 KiB and 5,000 hosts per list, at most 20 lists. Examples: [allowlist](examples/hosts-example.json), [blocklist](examples/blocklist-example.json).

**Remote sources** must use HTTPS with CORS. Credentials, redirects, custom ports, query strings and fragments are rejected, and each fetch is bounded in time and size.

**Blocklists** override your own approvals and imported allowlists. Wildcards are checked against the bundled Public Suffix List, so entries such as `*.co.uk` are refused. Approving a host that an enabled blocklist blocks is refused until you disable the list or remove the entry.

<p align="center">
  <img src="docs/screenshots/settings-lists.png" alt="Imported lists: an enabled allowlist, an enabled remote blocklist that updates itself and a disabled one" width="720">
</p>

### Automatic updates

Remote **blocklists** refresh about once a day while they are enabled. Each list has its own **Update automatically** checkbox, which is on by default and can be switched off. Allowlists never update themselves, and disabled lists are never fetched.

An automatic update replaces only the entries of a list that is still a blocklist from the same URL. It never enables a list or changes your approvals, and it is held for manual review if it:

- adds more than 50 entries, more than doubles the list, or shrinks a list of ten or more entries by more than half, or
- would block a host or domain you have approved.

If a fetch fails, the source changes the list type, or an update is held, the stored list stays active and Settings shows the reason. Each fetch discloses your IP address to the list host, so subscribe only to sources you trust. Link Guard sends no mail content or link targets.

## Warnings

Settings lets you switch each built-in warning off: lookalike domains, internationalized domain names, misleading link text, credentials in the URL, IP addresses, URL shorteners, script or HTML code in the link, and redirects to sites you have not approved. Switching a warning off also removes the extra exact-host approval it requires. A link whose analysis failed always warns.

**Misleading link text** compares the destination with a URL or domain shown in the link text. A text with a scheme or `www.` (`https://example.org`) must name the exact host. A bare domain (`example.org`) is checked against the Public Suffix List, so `datei.pdf` is not mistaken for one, and must belong to the same registrable domain: `example.org` linking to `www.example.org` does not warn, linking to `example.org.other.net` does.

**Own rules** show their label as a warning when the pattern matches the link's host, full URL or visible text. A link with a custom warning behaves like any risky link: it opens only after its exact host is approved, and the label stays visible next to it.

**Warning lists** bring rules from a JSON file or an HTTPS URL, using the same transport limits as host lists. They are shown for review, start disabled and change only when you refresh them by hand.

```json
{
  "format": "link-guard-warnings",
  "version": 1,
  "name": "Example warning rules",
  "rules": [{ "label": "Archive download", "target": "url", "pattern": "\\.(zip|rar|7z)$" }]
}
```

`target` is `host`, `url` or `text`. Labels have 1 to 60 characters without control, bidirectional or zero-width characters. Limits: 50 own rules, 10 lists of 50 rules, 200 rules in effect. See the [example](examples/warnings-example.json).

**Pattern syntax.** Patterns are case-insensitive and match anywhere unless anchored with `^` or `$`. Supported: literals, `.`, classes such as `[a-z]` and `[^/]`, `\d \w \s` and their negations, groups `(…)` and `(?:…)`, `|`, and the quantifiers `* + ? {n} {n,} {n,m}` (up to 50). Backreferences, lookaround, `\b` and `\u` escapes are rejected. Unlike JavaScript, `.` also matches line breaks. Patterns have at most 200 characters. URLs are matched both as written and percent-decoded, as the destination Thunderbird would open (resolved against a `<base href>` in the message).

Patterns never run on the JavaScript regular-expression engine. Link Guard compiles them into a small automaton whose matching time grows linearly with the input, so no pattern can freeze Thunderbird through catastrophic backtracking. Matching per message is additionally capped; a link that could not be checked within the cap shows a "rules not checked" warning instead of passing silently.

<p align="center">
  <img src="docs/screenshots/settings-warnings.png" alt="Warning settings with built-in toggles and an own regex rule" width="720">
</p>

## Security

Link Guard is a warning aid, not a malware scanner. An approved host may still serve harmful content or redirect elsewhere, and QR codes, attachments and image-only links are outside its checks. Thunderbird cannot enforce the final destination of a link opened in an external browser.

Imported lists are treated as untrusted input: schema-validated, size-bounded, disabled until reviewed, and, for blocklists, able only to remove access, never to grant it. The full threat model is in [SECURITY.md](SECURITY.md), with background in the [redirect research](REDIRECT-RESEARCH.md), the [research on code and destinations in links](URL-CONTENT-RESEARCH.md) and [Safari notes](SAFARI-REDIRECTS.md). Please report vulnerabilities privately as described there.

## Development

```sh
npm test            # unit tests, Node.js 20 or newer
npm run package     # builds dist/link-guard-<version>.xpi
```

There are no runtime or npm dependencies. Keep the versions in `package.json` and `manifest.json` equal and list user-visible changes in the [changelog](CHANGELOG.md). Official releases are built from a signed tag; see [release/README.md](release/README.md).

The bundled [Public Suffix List](vendor/README.md) is licensed under MPL 2.0. Link Guard itself is released under the [MIT License](LICENSE).

## Contributing

Bug reports and feature ideas are welcome as GitHub Issues; please leave out exploit details, private messages and reset links. This security-sensitive extension does not accept external pull requests, but the MIT license permits independent forks.
