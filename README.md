# Link Guard for Thunderbird

Link Guard makes web links in displayed email inactive until you approve their destination host. It shows a compact, collapsible notice when a decision is needed. Links with descriptive text also display the actual host beside the link. No default trust list is included.

[![CI](https://github.com/marco-schm/thunderbird-link-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/marco-schm/thunderbird-link-guard/actions/workflows/ci.yml)

## What it does

- Approves exact hosts, or an explicitly chosen registrable domain and its subdomains. `login.example.org` and `example.org` are separate exact decisions.
- Keeps temporary approvals in the current message only. Permanent approvals and blocks are editable in Settings.
- Displays prominent warnings for lookalike and internationalized domains, insecure HTTP, URL credentials, direct IP addresses, unusual ports, misleading visible URLs, and known public shorteners.
- Requires a second confirmation for public shorteners such as `bit.ly`; these can only be approved for the current message.
- Excludes selected shared-content hosts such as `docs.google.com` and `*.pages.dev` from broad parent-domain approvals. An exact-host decision remains possible.
- Supports English, German, Spanish, French, Brazilian Portuguese, Italian,
  Polish, Russian, Japanese, and Simplified Chinese, following Thunderbird's
  interface language. Other interface languages fall back to English.
- Lets users import exact-host lists from a local JSON file or manually fetch an HTTPS JSON list. Imports start disabled, and refreshed lists need review again.

Link Guard works locally on displayed messages. It does not upload mail or inspect link targets. The only network request made by the add-on is a user-initiated remote-list fetch; it sends no mail content or link targets.

## Status and installation

Version 0.9.1 supports ten UI languages. Spanish and the English fallback for
an unsupported Thunderbird language were tested live in Thunderbird 159 on
macOS. The link policy was tested manually
in Thunderbird 159 on macOS with a synthetic OpenPGP message, a user-initiated
HTTPS list preview, and a restored message after restart. Other Thunderbird
versions and operating systems have not been tested live.

Download the XPI from a [GitHub release](https://github.com/marco-schm/thunderbird-link-guard/releases) or build it from source. In Thunderbird, open **Add-ons and Themes**, choose **Install Add-on From File**, select the XPI, and review the requested permissions. Link Guard requests `messagesRead`, `scripting`, and `storage`; it requests no blanket host permission. Thunderbird 151 or newer is required by the manifest. Development testing was performed with Thunderbird 159 on macOS.

## Trust decisions

A permanent exact-host approval covers that hostname. A separate whole-domain choice covers the registrable domain and all subdomains, except the selected shared-content hosts. Broad approval is intentionally a wider permission. Exact blocks override persistent approvals and imported lists; a temporary approval can override a block only in the current message.

The add-on removes the `href` of unapproved HTML anchors and image-map areas and intercepts ordinary clicks. It checks up to 500 links per displayed message; additional links remain inactive. `mailto:`, `tel:`, `cid:`, and in-message fragments are outside web-domain approval. The notice disappears when all web links are approved and have no active warning.

### Imported list format

```json
{
  "format": "link-guard-hosts",
  "version": 1,
  "name": "My reviewed hosts",
  "category": "other",
  "hosts": ["example.org", "www.example.org"]
}
```

`category` may be `news`, `social`, `companies`, or `other`. Entries must be exact DNS hostnames: no URLs, ports, IP addresses, wildcards, or duplicates. Each list is limited to 500 hosts and 64 KiB; at most 20 lists may be stored. Remote sources must use HTTPS and CORS; credentials, redirects, custom ports, queries, and fragments are rejected. A remote list is fetched only when the user asks, is previewed, and is disabled until explicitly enabled. A refresh never silently widens approvals.

## Security boundaries

Host approval is not sender authentication or a guarantee that a page is safe. An approved host may serve content written by another person or redirect to another host. Link Guard checks the URL in Thunderbird; it cannot enforce Safari's final destination. QR codes, attachments, image-only links, and non-web actions are outside its web-link checks. See [SECURITY.md](SECURITY.md), [redirect research](REDIRECT-RESEARCH.md), and [Safari limitations](SAFARI-REDIRECTS.md).

## Develop

```sh
npm test
npm run package
```

Node.js 20 or newer is needed only to run tests and build the XPI. There are no npm dependencies. The package script writes `dist/link-guard-<version>.xpi`; `dist/` is ignored by Git. Keep `package.json` and `manifest.json` versions equal. Run the tests and inspect the XPI contents before publishing. A [changelog](CHANGELOG.md) records user-visible changes.

The Public Suffix List is bundled under its MPL 2.0 license. Its source, version, and checksum are in [vendor/README.md](vendor/README.md). Link Guard's own source is MIT licensed; see [LICENSE](LICENSE).

Official releases require a [YubiKey-signed tag](release/README.md); source
builds and ordinary CI do not. The release workflow verifies the tag before
building the published XPI.

## Maintenance

Ordinary bug reports and feature ideas are welcome as GitHub Issues. Please do not post exploit details, private messages, or reset URLs in public Issues. External pull requests are not accepted as a maintenance policy for this security-sensitive extension; the MIT license still permits independent forks. See [SECURITY.md](SECURITY.md) for private vulnerability reporting.
