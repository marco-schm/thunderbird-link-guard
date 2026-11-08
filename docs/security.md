# Security model

This page describes what Link Guard protects against, how it does so, and where its
protection ends. To report a vulnerability, follow the
[security policy](https://github.com/marco-schm/thunderbird-link-guard/blob/main/SECURITY.md)
and use GitHub's private vulnerability reporting.

## What Link Guard is for

Phishing mail tries to make you open a page you would not open if you saw its real
address. Link Guard makes that address visible and puts a decision in front of every
unknown destination:

- every web link is inactive until its host is approved,
- every destination is listed, with warnings for common deception patterns,
- you decide per exact host or per registrable domain, for one message or permanently.

## What it does not do

- **It is not a malware or website scanner.** It never contacts link targets. An
  approved host can still serve harmful content, be compromised later, or host pages
  written by other people.
- **It does not follow redirects.** Approving a host allows every URL on it. Link Guard
  names a destination that a link visibly carries (see
  [Warnings](warnings.md#link-redirects-to-a-site-you-have-not-approved)), but a redirect
  that the server decides on – a click tracker with an opaque ID, an open redirect whose
  target is not in the link – is followed by the browser without asking Link Guard.
  Thunderbird cannot enforce the final destination of a link opened in an external
  browser.
- **It does not check the sender.** Sender identity, SPF, DKIM and DMARC are outside its
  scope.
- **It does not inspect attachments, QR codes or text that only looks like a link.** An
  address written as plain text or inside an image is not a link.

## How links are held

Link Guard runs inside every displayed message. For each link it removes the `href`
until the destination is approved, and it intercepts clicks on links that are not
approved. Without a `href`, Thunderbird has nothing to open, so a click, a middle-click,
dragging the link or *Copy Link* from the context menu all yield nothing. When you
approve a host, the original addresses are put back.

The protection is in place before your settings are loaded: until then, every link fails
closed. If the settings cannot be loaded at all, links stay inactive and the notice says
so.

### Covered link types

Link Guard treats as a link every element that Thunderbird itself opens on a click:

| Element | Handling |
| --- | --- |
| HTML anchors `<a href>` and image maps `<area href>` | address removed until approved |
| SVG anchors, including the legacy `xlink:href` attribute | address removed until approved |
| MathML elements with an `href` | address removed until approved |
| Any of these inside shadow trees, open or closed | address removed until approved; clicks intercepted inside the tree |
| HTML `<link>` elements | hidden with an inline rule; their address is kept so stylesheets still apply |

Every destination is classified as Thunderbird resolves it – against the document's base
address. A `<base href>` in a message therefore cannot turn a `#fragment` or an empty
`href` into an unchecked web link.

JavaScript is disabled in displayed mail by Thunderbird, so a message cannot add or
change links after Link Guard has checked them.

If a future Thunderbird version starts to open another kind of element as a link, Link
Guard has to learn about it too. The test suite and the
[development notes](development.md#how-link-detection-must-match-thunderbird) describe
how to check this.

### Limits per message

The first 500 links of a message are checked and listed. Further links are made
inactive without being listed. The work spent on warning rules is capped as well; a link
that could not be checked in time gets a warning instead of passing.

## Trustworthy display

A message controls its own layout and styles, so Link Guard protects what it draws:

- The **notice** and the **labels next to links** have every style property reset and
  set inline with `!important`, which no rule in the message can override.
- Their text lives in a **closed shadow root**. Shadow-scoped `!important` rules also
  stop a message from inserting text through `::before`/`::after` or fading it through
  `::first-line`/`::first-letter`.
- The **toolbar button** and its badge are drawn by Thunderbird outside the message and
  cannot be touched by it.

Two limits remain, as for any content shown inside a message:

- a message can **draw other content over** the notice or a label, with a higher stacking
  order;
- a message can **clip a label** through an ancestor element while moving the link itself
  out of that ancestor.

In both cases the link itself stays inactive, and the toolbar badge still shows the
number of inactive links and the **!** warning marker. If the badge disagrees with what
the message shows, trust the badge.

## Decisions and their scope

- **Exact hosts are exact.** `login.example.org` and `example.org` are separate
  decisions.
- **Whole-domain decisions** are limited to registrable domains according to the bundled
  Public Suffix List. They never cover a public suffix such as `co.uk`, and they exclude a
  catalogue of shared-content hosts such as `docs.google.com` and `github.io` sites. That
  catalogue is necessarily incomplete; use whole-domain approvals only for domains you
  control.
- **Risky links** – with credentials, misleading text, lookalike or
  internationalized names, or matches of warning rules – open only after an approval of
  the exact host. Whole-domain approvals and allowlists do not count.
- **Short links, links with code and IP addresses** can only be allowed for the current
  message.
- **Blocks win** over every permanent approval and allowlist. Only a temporary approval in
  the current message overrides a block.

## Imported lists

Imported lists are untrusted input:

- They are validated against a strict, bounded schema, shown in full for review, and
  start disabled.
- A **blocklist** can only remove access. A hostile or compromised blocklist can block
  legitimate sites, but never approve one and never shrink the reference set for lookalike
  warnings.
- An **allowlist** never unlocks a link with a warning and never updates itself.
- **Remote sources** must use HTTPS with CORS; credentials, redirects, custom ports, query
  strings and fragments are refused, and every fetch is bounded in time and size.
- **Automatic updates** apply to enabled remote blocklists only. They replace entries of
  a list that is still a blocklist from the same URL, never enable a list or approve a
  host, and are held for review when they are large or would block something you
  approved.
- A **warning list** can only add warnings. Its labels and patterns may not contain
  control, bidirectional or zero-width characters, and every label is shown with the name
  of its list.

See [Host lists](lists.md) and [Warning rules](warning-rules.md) for details.

## Warning rules and performance

Custom and imported patterns never run on the backtracking JavaScript regular-expression
engine. They are compiled to an automaton and matched in linear time, limited to 200
characters, 512 compiled instructions and repetition counts of 50, and charged to a
per-message budget. No pattern and no message can freeze Thunderbird through
catastrophic backtracking.

## Privacy

Link Guard inspects mail locally and stores its settings only on your computer. The only
network requests it ever makes are fetches of list sources you added. See
[Privacy](privacy.md).

## Release integrity

Official releases are built by GitHub Actions only from a release tag signed with a
hardware-backed key held by the maintainer. The workflow verifies that signature and the
tagged commit before it tests, builds and publishes the XPI together with a `SHA256SUMS`
file. See [Development](development.md#releases).

## Reporting a vulnerability

Please report security issues privately through GitHub's **Report a vulnerability** entry
in the repository's Security tab. Include a minimal synthetic `.eml`, your Thunderbird
version and operating system, and the observed versus expected result. Leave out real
mail, tokens, credentials and reset links. See the
[security policy](https://github.com/marco-schm/thunderbird-link-guard/blob/main/SECURITY.md).
