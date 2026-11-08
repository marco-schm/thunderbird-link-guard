# Development

Link Guard is plain JavaScript with no runtime or npm dependencies. This page covers
building and testing, the architecture, translations, the Public Suffix List, releases
and these documentation pages.

The project does not accept external pull requests, because the add-on is
security-sensitive. Bug reports and ideas are welcome as
[GitHub issues](https://github.com/marco-schm/thunderbird-link-guard/issues), and the MIT
license permits independent forks.

## Build and test

Requirements: Node.js 20 or newer, `zip` and `unzip`.

```sh
npm test            # unit tests (node --test tests/*.test.js)
npm run package     # builds dist/link-guard-<version>.xpi
```

`npm run package` refuses to build when the versions in `package.json` and
`manifest.json` differ. The package script lists every shipped file explicitly; a test
checks that it includes every script, stylesheet and locale the manifest loads.

To try a build, install the XPI in Thunderbird with **Install Add-on From File…**, or
load the source directory as a temporary add-on from **Debug Add-ons**
(`about:debugging`).

## Project layout

| File | Role |
| --- | --- |
| `manifest.json` | Manifest V3; permissions, background scripts, message display scripts, options page |
| `background.js` | state, decisions, Public Suffix List, domain analysis, list refresh, toolbar badge |
| `display.js` | runs in every displayed message: finds links, removes and restores addresses, intercepts clicks, draws the notice and labels |
| `policy.js` | pure functions: host normalisation, link inspection, lookalike and text checks |
| `access.js` | the decision whether a link may open, from its inspection and the current state |
| `domain-scope.js` | Public Suffix List parsing and registrable-domain lookup |
| `import-list.js` | host list schema, remote fetching, stored-list cleaning, automatic-update rules |
| `warning-rules.js` | warning rule and warning list schema, evaluation and budget |
| `safe-regex.js` | the linear-time regular-expression engine used by warning rules |
| `panel-style.js` | styles for the notice and the shared shadow-root guard, as strings |
| `display.css` | legacy label styles; labels are styled inline by `display.js` |
| `options.html`, `options.css`, `options.js` | the Settings page |
| `english.js`, `locale.js`, `_locales/` | English fallback catalogue, locale selection, 20 translations |
| `vendor/public_suffix_list.dat` | bundled Public Suffix List (MPL 2.0) |
| `examples/` | example host list, blocklist and warning list |
| `tests/` | unit tests, one file per module |
| `scripts/` | packaging and release-tag signing |
| `release/` | trusted release signer and release notes |
| `docs/` | this documentation |

## Architecture

Link Guard has three parts that talk through runtime messages.

**Background** (`background.js` and the pure modules it loads) owns all persistent
state. It cleans everything it reads from storage, so a corrupt or hand-edited value can
never grant access, and it serialises permanent decisions in a queue so that two clicks
cannot overwrite each other.

**Message display script** (`display.js` and the modules before it in the manifest) is
injected into every displayed message at `document_start`. Its click listener is
installed before the settings arrive, so links fail closed from the start. It then:

1. collects link candidates from the document and every shadow tree in it,
2. inspects each destination as Thunderbird resolves it,
3. removes the address of every link that is not allowed and restores approved ones,
4. draws the notice in a closed shadow root and the labels next to links,
5. reports counts for the toolbar badge,
6. re-scans when the message DOM or the settings change.

At startup the background also injects the scripts into messages that were already
open, after checking that they are not protected yet.

**Settings page** (`options.*`) edits storage directly, validates everything before
saving, and refuses to save when storage changed while the page was open.

### Runtime messages

The background accepts messages only from tabs.

| Message | Direction | Purpose |
| --- | --- | --- |
| `link-guard-state` | message → background | read the effective state; also triggers due list updates |
| `link-guard-decision` | message → background | store a permanent approval or block |
| `link-guard-scope` | message → background | registrable domain of a host, for the scope choice |
| `link-guard-analyze` | message → background | lookalike and internationalized-name analysis of hosts |
| `link-guard-roots` | message → background | registrable domains for comparing link text with destinations |
| `link-guard-status` | message → background | counts for the toolbar badge |
| `link-guard-validate-broad` | settings → background | check whole-domain rules against the Public Suffix List |
| `link-guard-reset-temporary` | background → message | drop temporary approvals when another message is shown |

Temporary approvals never leave the message page; the background neither accepts nor
stores them.

### How link detection must match Thunderbird

Thunderbird decides what a click opens in `BrowserUtils.hrefAndLinkNodeForClickEvent`
(in `omni.ja`, `modules/BrowserUtils.sys.mjs`) and hands web links to the external
browser in `StrictLinkClickHandlerChild` (`actors/LinkClickHandlerChild.sys.mjs`).
Link Guard's notion of a link must be at least as wide:

- every element that function treats as a link must be a candidate in `display.js`
  (currently `<a>` in any namespace, `<area>`, MathML elements and HTML `<link>`),
- the search must follow the composed tree into shadow roots,
- destinations must be resolved against the document base URI, exactly as Thunderbird
  does.

**Invariant:** any element from which Thunderbird resolves an `http:` or `https:` URL
must be classified by Link Guard as `web` or `blocked` – never as `skip`, and never be
missed. When a new Thunderbird version changes those two files, re-check them against
`display.js`.

`display.js` has no DOM unit tests. Changes to it are verified in Thunderbird with
synthetic `.eml` messages that use reserved domains such as `example.net`.

## Tests

| Test file | Covers |
| --- | --- |
| `policy.test.js` | host normalisation, link inspection, base-URI resolution, text checks |
| `access.test.js` | the allow/deny decision for links |
| `decisions.test.js` | the background: state, decisions, scopes, imported lists, analysis |
| `domain-scope.test.js` | registrable domains for ICANN and private suffixes |
| `import-list.test.js` | list schema, remote fetching limits, automatic updates |
| `warning-rules.test.js` | rule and list validation, evaluation, budget |
| `safe-regex.test.js` | regex syntax, agreement with `RegExp`, linear running time |
| `locales.test.js` | completeness and placeholders of all 20 catalogues |
| `startup.test.js` | manifest, startup injection, packaging, panel styles |

## Translations

Link Guard ships 20 catalogues in `_locales/<locale>/messages.json` and follows
Thunderbird's interface language; unsupported languages fall back to English.

- Every catalogue must contain exactly the keys of `_locales/en/messages.json`, with the
  same placeholders. `npm test` checks this.
- `english.js` holds the same English catalogue as a script, so the add-on can fall back
  to English even when Thunderbird's secondary language is supported. It must stay
  identical to `_locales/en/messages.json`; a test compares them.
- Every message key used in `background.js`, `display.js`, `options.js` and
  `options.html` must exist; a test checks this as well.

To add a string, add it to `_locales/en/messages.json`, to `english.js` at the same
position, and to all 19 other catalogues.

## Public Suffix List

`vendor/public_suffix_list.dat` is a snapshot of the canonical list from
[publicsuffix.org](https://publicsuffix.org/list/public_suffix_list.dat), including the
ICANN and private sections. `vendor/README.md` records the upstream version, commit and
SHA-256. Update it from the canonical URL before a release, record the new values, and
run the tests.

## Releases

Official releases are built by GitHub Actions only from an annotated tag signed with a
dedicated YubiKey FIDO key listed in `release/allowed_signers`.

1. Update the version in `package.json` and `manifest.json`, move the changelog entries
   from *Unreleased* to the new version, and add `release/notes/<version>.md`.
2. Commit and push `main`.
3. Run `sh scripts/sign-release-tag.sh`. It checks the branch and working tree, runs the
   tests, builds the package and creates the signed tag; touch the YubiKey when prompted.
4. Inspect the tag and push it with the command the script prints.

The release workflow then verifies the tag signature against `release/allowed_signers`,
whose SHA-256 is pinned in the workflow, checks that the tag matches the version, runs
the tests, builds the XPI, writes `SHA256SUMS` and publishes the GitHub release with the
notes file. All workflow actions are pinned to commit hashes.

This gate protects the repository's automated releases. Anyone can build the open-source
XPI locally, and a repository administrator could change the workflow or its trusted key;
protect those settings with GitHub access controls. See `release/README.md` for key
handling.

## These documentation pages

The pages in `docs/` are the source of the Link Guard website. They are written to work
with any static site generator and on GitHub:

- plain Markdown with tables and fenced code blocks; no generator-specific syntax,
- one `#` heading per page, used as the page title,
- relative links between pages (`settings.md#show-link-destinations`); absolute GitHub
  links for files outside `docs/`,
- images from `docs/screenshots/`, made with synthetic messages and reserved example
  domains only,
- the page order is the table on [the start page](index.md).

When a change affects behaviour, settings or limits, update the matching page in the
same change as the code and the changelog.
