# Security policy

## Supported version and reporting

Only the latest release is supported. Earlier releases and local development
builds are not maintained. Please use GitHub's **Report a vulnerability** entry in the
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
Approving a hostname permits all eligible HTTP(S) URLs on that exact hostname,
so a compromised or multi-tenant site remains a risk. Sender identity is
outside the current scope.

Imported lists are untrusted input. The parser accepts only a bounded JSON
schema with exact DNS hostnames, and imported lists start disabled. A list
marked `"kind": "block"` is a blocklist and may also contain `*.example.com`
whole-domain entries; blocking can only remove access, and wildcards that are
not a registrable domain according to the bundled Public Suffix List are
refused on save and ignored if found in storage. A hostile or compromised
blocklist source can therefore block legitimate sites, never approve any, which
is why a refreshed list is previewed and disabled until the user enables it. Remote
fetches happen only after a user action; they require HTTPS and CORS, omit
credentials, reject redirects, and are bounded by time and bytes. A remote
refresh is previewed and disables the list until the user enables it again.
The source URL is stored for refreshing the list. Allowlists are refreshed only
manually. An enabled remote blocklist refreshes itself about
once a day unless the user switches that off for the list. An automatic refresh
uses the same restrictions as a manual one, replaces only the entries of an
enabled list that is still a blocklist from the same URL, and cannot enable a
list or approve a host. It is also held for manual review if it adds more than
50 entries, more than doubles or halves the list, or would block a host or
domain the user approved. A failed fetch, a changed list type or a held update
leaves the stored list in place. Entries from imported blocklists never remove a
domain from the references used for lookalike warnings, so a hostile list
cannot silence those warnings. A compromised list source (for example an
expired and re-registered domain) can still block ordinary sites within these
limits and sees the user's IP address and per-installation extension origin. Each fetch discloses the user's IP address to the list host. No email content or link
target is sent to a list source.

Risky HTTP(S) links may be opened only after explicit approval of every
involved exact host in the message. They retain an inline warning. This
includes embedded credentials and misleading visible text. An explicit port
is not a risk: a link to another port follows the approval of its host.
Plain HTTP is not treated as a risk either: it is neither flagged nor held
back, so an approved host can also be opened over HTTP. Direct IP links may
only be approved temporarily in the current message. Imported lists and
broad-domain approvals do not unlock risky links.

Link Guard treats as a link every element that Thunderbird itself opens on a
click (`BrowserUtils.hrefAndLinkNodeForClickEvent`): HTML anchors and image
maps, SVG anchors (including the legacy `xlink:href` attribute), MathML elements
with an `href`, and any of these inside open or closed shadow trees. They are
disabled until approved, and clicks on them are intercepted as well. HTML
`<link>` elements, which Thunderbird also opens and which message CSS can style
into a clickable box, are hidden with an inline `!important` rule; their `href`
is kept so stylesheets still apply. Every destination is classified as
Thunderbird resolves it, against the document base URI, so a `<base href>` in
the message cannot turn a `#fragment` or an empty `href` into an unchecked web
link. Any new element type that Thunderbird starts to open as a link would need
to be added here as well.

The approval panel and the inline labels next to links are hosts with every
property reset and set by inline `!important` styles, and their text lives in a
closed shadow root. Message-authored CSS therefore cannot hide, move, fade,
resize or restyle them by selector, and shadow-scoped `!important` rules stop
message CSS from injecting text through `::before`/`::after` or fading it through
`::first-line`/`::first-letter`. Two limits remain, as for any content shown
inside the message: a message can draw other content over the panel or a label
with a higher stacking order, and it can clip a label through an ancestor while
moving the link itself out of that ancestor. The panel still lists every host
with its warnings, and the toolbar badge, which lives outside the message, stays
an independent signal.

Warning settings can only add warnings or remove built-in ones the user switched
off; nothing in them approves a link. Custom and imported rules are regular
expressions from a restricted syntax that is compiled to an automaton and matched
in linear time, never by the backtracking JavaScript engine, so a hostile rule
or message cannot cause catastrophic backtracking. Patterns are limited to 200
characters and 512 compiled instructions, repetition counts to 50, and the work
per message scan is capped; a link that could not be checked within the cap gets
a warning and stays inactive. Imported warning lists use the same transport
restrictions as host lists, are previewed, start disabled and are never refreshed
automatically. Rule labels and patterns may not contain control, bidirectional or
zero-width characters, and labels are always shown together with their source.
A hostile warning list can at most add misleading or excessive warnings.

No built-in trust list is shipped. Only reviewed public URL shorteners are
special warning signals and require a second, red confirmation for temporary
approval in the current message.

Links whose path, query or fragment contains script or HTML code (the shape of
a reflected XSS payload against the linked site) can likewise only be allowed
for the current message, even when their host is approved permanently. The
check normalises stacked encodings before matching narrow signatures; it is
signature-based and can miss novel forms.

A destination that a link visibly carries (a full URL in a parameter or the
path, a base64-encoded URL, or the formats of Microsoft Safe Links and
Proofpoint URL Defense) raises a warning that names it, but only when it leaves
the link's own registrable domain and is not approved. Link Guard does not warn
merely because a link looks like a redirect: branded email tracking and wrapped
links to approved sites stay quiet. Redirects decided by the server, opaque
tracking IDs and anything after the first page load remain invisible, so a
permanently approved host may still redirect elsewhere without another prompt,
and a trusted server can change behaviour later or serve attacker-controlled
content. Thunderbird cannot enforce the final destination in an external
browser. See [URL-CONTENT-RESEARCH.md](URL-CONTENT-RESEARCH.md),
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

An exact block covers one host. A whole-domain block is displayed as
`*.example.com` and covers `example.com` and every subdomain; it takes priority
over both saved and imported approvals. The `*.` syntax is accepted only in
the editable whole-domain rules and is checked against the bundled Public
Suffix List. Imported allowlists remain exact-host-only; imported blocklists
may use the same syntax and take priority over saved and imported approvals.

Please report security issues privately to the maintainers before publishing
details. Use synthetic messages and remove real URLs, tokens and mail contents
from reports.
