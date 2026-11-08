# Warning rules

Warning rules add your own warnings. A rule has a **label**, a **target** and a
**pattern**; when the pattern matches, the label is shown as a warning and the link
behaves like any link with a warning: it stays inactive until you approve its exact host,
and the label stays visible next to it.

Rules can only **add** warnings. Nothing in a rule or warning list can approve a link or
remove a block.

You can add rules in two ways:

- **My warning rules** in [Settings](settings.md#my-warning-rules) – up to 50 rules
  written directly on the page.
- **Warning lists** – rules imported from a JSON file or an HTTPS URL, reviewed and
  enabled like host lists.

## Targets

| Target | Setting label | Matched against |
| --- | --- | --- |
| `host` | Host | the destination host, e.g. `login.example.org` |
| `url` | Full URL | the full destination URL, both as written and percent-decoded |
| `text` | Link text | the visible text of the link (its first 1,024 characters) |

The full URL is the destination as Thunderbird would open it, resolved against a
`<base href>` in the message where there is one. Matching it percent-decoded as well
means `%77p-admin` cannot slip past a rule for `wp-admin`.

## Pattern syntax

Patterns are regular expressions from a deliberately small syntax that can be matched
in linear time. They are **case-insensitive** and **match anywhere** in the target
unless anchored.

| Syntax | Meaning |
| --- | --- |
| `abc` | literal characters |
| `.` | any character, **including line breaks** (unlike JavaScript) |
| `[abc]`, `[a-z]`, `[^/]` | character classes, ranges and negated classes |
| `\d` `\w` `\s` | digit, word character (`a–z`, `A–Z`, `0–9`, `_`), whitespace |
| `\D` `\W` `\S` | their negations |
| `\t` `\n` `\r` | tab, line feed, carriage return |
| `\.` `\/` `\(` … | escaped punctuation, matched literally |
| `( … )`, `(?: … )` | groups (both only group; nothing is captured) |
| `a\|b` | alternatives |
| `^`, `$` | start and end of the target |
| `*` `+` `?` | zero or more, one or more, optional |
| `{n}` `{n,}` `{n,m}` | repetition, with counts up to 50 |

A lazy marker after a quantifier (`*?`, `+?`) is accepted and has no effect, since only
whether a pattern matches is relevant.

**Not supported**, and rejected with a message: backreferences (`\1`), lookahead and
lookbehind (`(?=…)`, `(?<=…)`), word boundaries (`\b`, `\B`), `\u`, `\x` and other
letter escapes, and named groups. These features either need backtracking or are easy to
misread.

### Limits

| Limit | Value |
| --- | --- |
| Pattern length | 200 characters |
| Repetition count | 50 |
| Group nesting | 16 levels |
| Compiled size | 512 instructions (a pattern like `(a{50}){50}` is too complex) |
| Label | 1 to 60 characters |
| Characters | no control, bidirectional or zero-width characters in labels or patterns |
| Own rules | 50 |
| Warning lists | 10, with up to 50 rules each |
| Rules in effect | 200 in total |

### Why matching cannot freeze Thunderbird

Patterns never run on the JavaScript regular-expression engine. Link Guard compiles them
into a small automaton and simulates it breadth-first, so the work grows linearly with
the length of the input. Patterns such as `(a+)+$`, which can take exponential time in
ordinary engines, run in milliseconds.

The total matching work per message is also capped. If a message exhausts it, the
remaining links show **⚠ Rules not checked** and stay inactive until you approve them,
rather than passing unchecked.

## Examples

- **Archive download** – target *Full URL*, links ending in an archive file:

  ```text
  \.(zip|rar|7z|iso)$
  ```

- **Login page outside the usual path** – target *Full URL*, login-like paths:

  ```text
  /(login|signin|verify)[-./]
  ```

- **Payment request** – target *Link text*, pressure phrases in the link text:

  ```text
  pay\s*now|invoice|overdue
  ```

- **Free hosting subdomain** – target *Host*, sites on free hosting platforms:

  ```text
  \.(web\.app|pages\.dev|netlify\.app)$
  ```

- **ZIP domain** – target *Host*, hosts under the `.zip` top-level domain:

  ```text
  \.zip$
  ```

- **Campaign link** – target *Full URL*, links with tracking parameters:

  ```text
  [?&]utm_
  ```

Rules can only say *"warn if this matches"*. A rule such as *"warn about every host of
our domain except the login host"* would need lookahead, which is not supported; write
a rule for the hosts you want to warn about instead.

## Warning list format

```json
{
  "format": "link-guard-warnings",
  "version": 1,
  "name": "Example warning rules",
  "rules": [
    { "label": "Archive download", "target": "url", "pattern": "\\.(zip|rar|7z|iso)$" },
    { "label": "Payment request", "target": "text", "pattern": "pay\\s*now|invoice|overdue" }
  ]
}
```

| Field | Value |
| --- | --- |
| `format` | always `"link-guard-warnings"` |
| `version` | always `1` |
| `name` | 1 to 60 characters, same character restrictions as labels |
| `rules` | 1 to 50 rules, each with exactly `label`, `target` (`host`, `url` or `text`) and `pattern` |

In JSON, every backslash in a pattern is written twice: the pattern `\.zip$` becomes
`"\\.zip$"`.

Warning lists use the same file-size limit (64 KiB) and the same
[remote-source requirements](lists.md#remote-sources) as host lists. They are shown for
review, start disabled and change only when you click **Review remote update** – they
are never updated automatically.

In the notice, a rule's warning names its source, for example *My rule: Archive
download* or *Example warning rules: Archive download*, so you can always tell which
list raised it.

A complete example is in the repository:
[warnings-example.json](https://github.com/marco-schm/thunderbird-link-guard/blob/main/examples/warnings-example.json).

## What a hostile warning list can do

Very little: it can add misleading or excessive warnings, which keep links inactive until
you approve them. It cannot approve a link, remove a block, switch off a built-in warning
or slow Thunderbird down. Labels are always shown together with the name of the list that
contains them.
