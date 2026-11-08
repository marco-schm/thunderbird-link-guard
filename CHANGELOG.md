# Changelog

## Unreleased

- Settings: switch off the destination label shown next to links whose text does
  not name their target, for messages whose layout it disturbs. It is on by
  default. Warning labels and the panel are not affected.
- Security: decide a link's destination from the URL it resolves to instead of
  from its `href` attribute. A message that carried a `<base href>` could point
  an empty `href` or a bare `#fragment` at the web, and those were treated as
  in-message anchors: the destination was never checked, the host never listed
  and the link stayed clickable. Relative targets now resolve against the base
  as well, so they are offered for approval instead of being refused as
  malformed. Genuine in-message anchors, `mailto:`, `tel:` and `cid:` are
  unaffected. Own warning rules are matched against the resolved destination.
- Security: cover every element Thunderbird opens as a link. MathML elements with
  an `href` and links inside open or closed shadow trees were neither inspected
  nor disabled and opened without approval. HTML `<link>` elements, which a
  message could style into a clickable box, are now hidden; their stylesheets
  still apply.
- Security: harden the inline labels next to links like the panel. Message CSS
  could fade, shrink or move them (`opacity`, size, `position`), and inject text
  into them or into the panel through `::before`/`::after` or fade it through
  `::first-line`. Labels now use inline `!important` styles and a closed shadow
  root, and labels inside shadow trees are styled as well.
- Warn when link text names a bare domain (`sparkasse.de`) of a different
  registrable domain than the destination. Before, only text with a scheme or
  `www.` was compared. Names that are not real domains (`datei.pdf`) are
  recognised through the Public Suffix List and do not warn.
- Bound the work per message by the 500-link limit: links beyond it are disabled
  without rule matching or inline labels. A message with 60,000 links became
  protected in about 10 instead of 46 seconds.

## 0.12.1 — 2026-11-08

- Settings: align the input boxes. Rule cards in the same row now have their
  text boxes at the same height, and the fields of a warning rule share one
  height.

## 0.12.0 — 2026-11-08

- Settings: choose which built-in warnings are shown. Switching one off also
  removes the extra exact-host approval it requires.
- Add own warning rules as regular expressions for the host, the full URL or the
  link text, and import warning lists from a JSON file or an HTTPS URL. Patterns
  are matched by a linear-time engine (no backtracking) within a per-message
  budget; links that cannot be checked in time keep a warning.
- Stop flagging plain `http://` links. They no longer show a warning or need an
  extra exact-host approval, so an approved host can also be opened over HTTP.
- Security: disable SVG anchors that carry their destination in `xlink:href`.
  They were previously neither inspected nor blocked.
- Security: render the approval panel inside a closed shadow root with inline
  `!important` box styles, so message-authored CSS can no longer hide or restyle
  it. The panel stylesheet moved from `display.css` to `panel-style.js`.
- Settings: split the rule lists into four separate cards, so exact hosts and
  whole domains are edited apart for both approvals and blocks. Stored data is
  unchanged. Blocked whole domains (`*.example.com`) now have their own card
  instead of sharing the blocked-hosts list.

## 0.11.0 — 2026-11-08

- Add ten UI languages: Czech, Danish, Dutch, Finnish, Hungarian, Korean,
  Swedish, Traditional Chinese, Turkish and Ukrainian. Link Guard now has
  twenty complete UI catalogs. Right-to-left languages are not supported yet.
- Support remote and local blocklists: add an optional `"kind": "block"` to the
  JSON list format. Blocklists may contain `*.example.com` whole-domain entries,
  start disabled like all imports, and override approvals and imported
  allowlists once enabled. Existing lists are unaffected and remain allowlists.
- Remote blocklists update themselves about once a day once enabled, with a
  per-list "Update automatically about once a day" checkbox (on by default) to
  switch it off. Allowlists never refresh themselves; failures and changed list
  types keep the stored list. No new permission is required.
- Hold an automatic blocklist update for manual review when it is large or would
  block a host or domain you approved.
- Keep lookalike warnings for approved domains even when an imported blocklist
  blocks them.
- Make state requests cheaper (about 1 ms instead of about 40 ms with full
  lists) by caching cleaned lists and not sending lists to message pages.
- Refuse a permanent approval of a host that an enabled imported blocklist
  blocks, instead of saving an approval that has no effect.

## 0.10.1 — 2026-11-08

- Correct the rule-list labels so whole-domain `*.` entries are not described
  as exact hostnames.

## 0.10.0 — 2026-11-08

- Ask whether a block applies to one exact host or its registrable domain.
- Show whole-domain approval and block rules as `*.example.com` in Settings;
  this notation also covers `example.com` itself.
- Keep existing exact-host blocks exact, and give whole-domain blocks priority
  over saved and imported approvals.

## 0.9.1 — 2026-11-08

- Make the English fallback independent of Thunderbird's secondary languages.
  An unsupported primary language now displays Link Guard in English even if
  Thunderbird has another supported language installed.

## 0.9.0 — 2026-11-07

- Add Spanish, French, Brazilian Portuguese, Italian, Polish, Russian,
  Japanese, and Simplified Chinese. Link Guard now has ten complete UI catalogs.
- Use English when Thunderbird's interface language has no Link Guard catalog.
- Clarify the short-link warning text so it matches the actual approval rule.

## 0.8.0 — 2026-11-07

- Publish the first regular GitHub release with explicit installation and
  security notes. The Link Guard runtime and permissions are unchanged from
  0.7.3.

## 0.7.3 — 2026-11-07

- Fetch the annotated tag object before verifying its YubiKey signature in
  GitHub Actions. The 0.7.2 tag did not produce a release because checkout
  replaced that tag ref with the commit during the first verification attempt.

## 0.7.2 — 2026-11-07

- Require a dedicated YubiKey FIDO signature on the release tag before the
  official GitHub workflow builds and publishes an XPI. Runtime behavior is
  unchanged from 0.7.1.

## 0.7.1 — 2026-11-07

- Register message protection in the manifest so Thunderbird can apply it as
  restored messages load after restart. Repair already open message tabs when
  the extension starts.
- Require Thunderbird 151 or newer for manifest-based message scripts.
- Add an inert example JSON list for testing and documenting remote import.

## 0.7.0 — 2026-11-07

- Show the actual destination host beside links with descriptive text.
- Require an exact-host decision for selected shared-content providers even
  when the provider's parent domain has a broad approval.
- Detect one-edit lookalikes across the full registrable domain, including
  a mistyped suffix.
- Refresh the bundled Public Suffix List from its canonical source.
- Clarify Safari redirect limitations and the add-on's security boundary.

Earlier 0.x builds were local development versions and are not published as
separate releases from this repository.
