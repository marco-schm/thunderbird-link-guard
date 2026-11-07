# Security policy

## Supported version and reporting

The current 0.9.x line is supported. Earlier local development builds are not
maintained. Please use GitHub's **Report a vulnerability** entry in the
repository's Security tab when available. If that entry is unavailable, open
a public Issue that asks for a private contact channel **without** including
exploit details, private messages, credentials, or reset links. Ordinary bugs
without sensitive details can be reported as public Issues. External pull
requests are not accepted under this project's maintenance policy.

Please include a minimal synthetic `.eml`, Thunderbird version, operating
system, and the observed versus expected result when you can do so safely.

## Security boundaries

Link Guard is a warning aid, not a malware scanner or a guarantee that an
approved site is trustworthy. It inspects displayed mail locally and never
contacts link targets during analysis. A message can contain malicious QR
codes, attachments, or links hidden behind a trusted site's redirector.
Approving a hostname permits all eligible HTTPS URLs on that exact hostname,
so a compromised or multi-tenant site remains a risk. Sender identity is
outside the current scope.

Imported lists are untrusted input. The parser accepts only a bounded JSON
schema with exact DNS hostnames, and imported lists start disabled. Remote
fetches happen only after a user action; they require HTTPS and CORS, omit
credentials, reject redirects, and are bounded by time and bytes. A remote
refresh is previewed and disables the list until the user enables it again.
The source URL is stored only for manual refresh. No email content or link
target is sent to a list source.

Risky HTTP(S) links may be opened only after explicit approval of every
involved exact host in the message. They retain an inline warning. This
includes HTTP, embedded credentials, unusual ports and misleading visible
text. Direct IP links may only be approved temporarily in the current
message. An HTTP-to-HTTPS redirect cannot protect the first insecure request
unless the browser already knows an HSTS policy for that host. Imported lists and
broad-domain approvals do not unlock risky links.

No built-in trust list is shipped. Only reviewed public URL shorteners are
special warning signals and require a second, red confirmation for temporary
approval in the current message. Branded email tracking, shared-content hosts
and generic redirect-looking paths or parameters are not given red redirect
warnings. This is a deliberate noise reduction: a permanently approved host
may redirect to a different destination without another prompt. A trusted
server can also change behavior later or serve attacker-controlled content.
Thunderbird cannot enforce the final destination in an external browser. See
[REDIRECT-RESEARCH.md](REDIRECT-RESEARCH.md) and
[SAFARI-REDIRECTS.md](SAFARI-REDIRECTS.md).

Whole-domain approval covers all subdomains of a verified registrable domain.
Selected shared-content hosts are excluded from broad approvals and require
an exact-host decision. This is a limited catalogue: an exact-host approval
still permits attacker-authored pages on that host, and new shared services
can appear. Use broad approval only when that scope is intended. The bundled Public Suffix List is a
snapshot; an outdated private-suffix rule can make a proposed scope too broad.
Unknown suffixes do not receive a whole-domain option. Typos and Punycode
domains receive prominent warnings, but visual similarity detection is
heuristic and can have false positives or miss attacks. A red warning does
not disappear merely because the user has approved the exact hostname.

Please report security issues privately to the maintainers before publishing
details. Use synthetic messages and remove real URLs, tokens and mail contents
from reports.
