# Code and destinations carried inside a link

Reviewed 2026-11-08. Two built-in warnings look at what a link carries in its path,
query and fragment rather than at its host: **script or HTML code** (the shape of a
reflected XSS payload aimed at the linked site) and **a destination the link passes
the visitor on to** (redirectors, open redirects and mail security wrappers).

Both run locally on the URL stored in the message. Link Guard still never fetches a
link, so it cannot see redirects that a server decides on (HTTP 30x, script or
`<meta>` redirects), opaque tracking IDs, or anything that happens after the first
page loads. See [REDIRECT-RESEARCH.md](REDIRECT-RESEARCH.md) for that boundary.

## Script or HTML code

### Why

Reflected XSS lets an attacker run script on a site the victim trusts, for example
to steal a session, by sending a link to that very site. Host approval does not help:
the host is legitimate. A link carrying such code therefore needs an approval **for
the current message**, like a public short link; a lasting approval of the host is
not enough.

### Method

1. **Normalise first.** Filters are commonly evaded by stacking encodings
   ([OWASP XSS Filter Evasion Cheat Sheet][owasp-evasion]): HTML character references
   in decimal or hex with optional leading zeros and semicolons, tabs and newlines
   inside `javascript:`, percent-encoding (also twice or three times), and JavaScript
   escapes. The path, query and fragment are therefore checked in every form: as
   written, percent-decoded up to three times (`+` read as a space), with character
   references and `\u`/`\x` escapes resolved, and with control characters removed.
   Everything is compared in lower case.
2. **Then match narrow signatures**, following the vector categories of the OWASP Core
   Rule Set XSS rules ([CRS rule overview][crs-rules]): script and other dangerous tags,
   event-handler attributes, script URIs, `data:` documents, and script globals and
   calls.

| Signature | Example | Kept narrow because |
| --- | --- | --- |
| Opening or closing tag from a list of dangerous elements, or `<!--` | `<script>`, `<svg/onload=…>`, `"><img src=x …>` | `a<b` or `<vector>` in a search query are not tags that run code |
| A known event-handler attribute where an attribute can start | `" onerror=`, `/onload=` | A query parameter such as `&onload=true` or a path such as `/onboarding` is ordinary; CRS rule 941120 is known for false positives on plain text ([report][crs-941120-fp]) |
| Script URI | `javascript:`, `vbscript:`, also `java&#x09;script:` | – |
| Script document | `data:text/html`, `data:image/svg+xml` | `?format=text/html` is not a `data:` URI |
| DOM access | `document.cookie`, `window.location`, `location.href` | – |
| Script call | `alert(`, `eval(`, `atob(`, `String.fromCharCode(`, ``alert`1` `` | Requires the bracket right after the name: "fire alert (2024)" in a search does not warn |
| `srcdoc=` attribute | `<iframe srcdoc=…>` | – |

The path is checked too: CRS was reported to miss payloads outside the query string
([report][crs-pathinfo]), and Unicode-escaped payloads are resolved before matching.

### Results

- The test corpus in `tests/url-checks.test.js` covers 23 attack forms (plain,
  single, double and triple percent-encoding, entities, escapes, path and fragment
  payloads) and 17 ordinary links that resemble code; all are classified correctly.
- None of the 2,010 real URLs in the bundled Public Suffix List comments is flagged.
- The patterns have no nested quantifiers; a crafted 8 KB URL takes about 0.5 ms.

## Destinations carried in the link

### Why this changed

Earlier, generic redirect-looking parameters deliberately raised no warning, because
mail tracking and security services rewrite many legitimate links and a generic
"redirect" warning would fire on most newsletters. The new check keeps that concern in
view: it does not warn because a link *looks like* a redirect, but names the
destination it carries and warns **only when that destination leaves the link's own
registrable domain and is not approved**. Wrapped links to approved sites stay quiet,
and for wrappers such as Microsoft Safe Links the warning now shows the real target
that the wrapper host hides.

### Where destinations are found

| Form | Example |
| --- | --- |
| A full URL in any parameter value, percent-encoded up to three times | `?q=https://…`, `?url=https%3A%2F%2F…` (Microsoft Safe Links carries the original in `url=`, [Microsoft][ms-safelinks]) |
| A full URL in the path | `/web/2020/https://…`, Proofpoint URL Defense v3 `/v3/__https://…__;` ([Stanford][stanford-urldefense], [Proofpoint][proofpoint-decode]) |
| Proofpoint URL Defense v2 encoding | `?u=https-3A__evil.example_path` (`-3A` for `:`, `_` for `/`) |
| A scheme-relative or backslash form in a destination parameter | `?to=//evil.example`, `?dest=https:\\evil.example` |
| A base64-encoded URL (starts with `aHR0c`, the encoding of `http`) in a parameter or path segment | `?u=aHR0cHM6Ly9…` |
| Parameters in the fragment | `#next=https://…` |

Parameter names vary widely in practice; besides the usual `url`, `next`, `redirect`
or `goto`, names such as `RelayState`, `u`, `n` and `forward` are used, so any
parameter is examined by its value ([Bug Bounty Bootcamp, ch. 7][bbb-ch7]). Only a
destination **without a scheme** (`//host`) requires a destination-like parameter name,
because such values are otherwise ambiguous. At most five destinations per link are
reported.

### When it warns

A carried destination raises *Possible redirect to \<host\> (not approved)* unless:

- it is the link's own host or shares its registrable domain (Public Suffix List), or
- it is approved: temporarily, exactly, as a whole domain or through an allowlist,
  without a warning of its own (a lookalike destination is not approved).

Until these checks have run, the link stays inactive. The warning works like other
link warnings: the link needs an exact approval of its own host.

### Results

- The corpus covers 17 destination forms, including Safe Links, both Proofpoint
  formats, base64, double encoding, backslash tricks, path embedding and fragments,
  and 10 links without a destination (tracking IDs, JWTs, relative `next=/account`);
  all are classified correctly.
- No destination was found in the 2,010 real URLs of the Public Suffix List.

## Limits

- Detection is signature-based. Novel encodings or payloads outside the covered
  categories can pass; the warning is an aid, not a guarantee.
- Encrypted, signed or opaque redirect parameters (most click trackers) reveal no
  destination and raise no warning.
- A destination found in a link is not proof that the server redirects there; it is
  what the link visibly carries.

[owasp-evasion]: https://cheatsheetseries.owasp.org/cheatsheets/XSS_Filter_Evasion_Cheat_Sheet.html
[crs-rules]: https://coreruleset.org/docs/3-about-rules/rules/
[crs-941120-fp]: https://lightrun.com/answers/coreruleset-coreruleset-rule-941120-false-positive-for-the-russian-language
[crs-pathinfo]: https://lightrun.com/answers/coreruleset-coreruleset-xss-in-uri--path_info-going-undetected-
[ms-safelinks]: https://learn.microsoft.com/en-us/defender-office-365/safe-links-about
[stanford-urldefense]: https://uit.stanford.edu/security/url-defense/faq
[proofpoint-decode]: https://help.proofpoint.com/Threat_Insight_Dashboard/Concepts/How_do_I_decode_a_rewritten_URL%3F
[bbb-ch7]: https://Nostarch.com/download/samples/BugBountyBootcampSampleC7h.pdf
