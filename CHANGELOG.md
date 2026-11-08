# Changelog

## Unreleased

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
