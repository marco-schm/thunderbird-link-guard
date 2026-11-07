# Changelog

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
