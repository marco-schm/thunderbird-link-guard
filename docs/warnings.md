# Warnings

Link Guard warns about patterns that are common in phishing. A warning appears in red
in the notice and as a red label next to the link. A link with a warning stays inactive
until you approve its **exact** host – temporarily in the message or permanently.
Whole-domain approvals and imported allowlists do not unlock it.

Every built-in warning except *Domain check unavailable* can be switched off in
[Settings](settings.md#built-in-warnings). Switching a warning off also removes the
extra approval it requires.

## Overview

| Warning in Settings | In the notice | Next to the link |
| --- | --- | --- |
| Domain resembles an approved domain | *Resembles example.org.* | ⚠ Similar to example.org |
| Internationalized domain name | *Similar-looking characters may be present.* | ⚠ Similar characters |
| Link text shows a different host | *Link text and destination differ.* | ⚠ Text ≠ destination |
| User name or password in the link | *Credentials in the URL.* | ⚠ Credentials in URL |
| IP address instead of a host name | *Direct IP address.* | ⚠ IP address |
| Unusual port | *Unusual port.* | ⚠ Unusual port |
| Public URL shortener | *Short link: destination hidden.* | ⚠ Short link |
| *(always on)* | *Domain check unavailable.* | ⚠ Domain unchecked |
| *(your rules)* | *My rule: Label* or *List name: Label* | ⚠ Label |
| *(your rules)* | *Warning rules could not be checked for this link.* | ⚠ Rules not checked |

Plain `http://` links are not a warning. They are handled like `https://` links, so an
approved host can also be opened over HTTP.

## Lookalike domain

Attackers register names that differ from a trusted domain by one character:
`gogle.de`, `googel.de` or `goog1e.de` instead of `google.de`.

Link Guard compares the registrable domain of each link with the domains **you have
approved** (exactly, as a whole domain, or through an enabled allowlist). It warns when
the two differ by a single inserted, removed or replaced character, or by two swapped
neighbouring characters – either in the whole name (`google.cmo` for `google.com`) or
in the first label with the same suffix.

Limits of this check:

- With no approvals yet, there is nothing to compare against and no lookalike warning
  appears. The check becomes more useful as you approve the domains you use.
- Names whose first label is shorter than four characters are not compared, because
  almost every short name is one edit away from another.
- A different top-level domain (`google.com` versus `google.de`) is not a lookalike.
- Visual similarity is heuristic. Expect occasional false alarms and missed attacks.

## Internationalized domain name

Domain names can contain non-Latin letters. Some of them look identical to Latin ones,
so `аpple.com` with a Cyrillic *а* is a different domain from `apple.com`. Such names
are encoded with labels starting with `xn--`, and Link Guard warns about every host that
contains one. If you switch this warning off, an internationalized name that resembles
one of your approved domains still gets the lookalike warning.

If you regularly receive mail from legitimate internationalized domains, approve them
exactly or switch this warning off.

## Link text shows a different host

A link can display one address and lead to another. Link Guard compares the visible
link text with the real destination:

| Link text | Destination | Warning? |
| --- | --- | --- |
| `https://www.paypal.com` | `evil.example.net` | yes – the text names a URL |
| `www.paypal.com` | `paypal.com` | yes – a URL in the text must name the exact host |
| `sparkasse.de` | `account-check.example.net` | yes – different registrable domain |
| `PAYPAL.COM` | `paypal.com.evil.example.net` | yes – the destination belongs to `example.net` |
| `firma.de` | `www.firma.de` | no – same registrable domain |
| `Mehr auf sparkasse.de` | `news.sparkasse.de` | no – same registrable domain |
| `datei.pdf` | `cdn.example.org` | no – `pdf` is not a top-level domain |
| `Order now` | `shop.example.org` | no – the text names no host; a destination label shows it |

Two rules apply:

- **Text with a scheme or `www.`** (`https://…`, `www.…`) claims an exact address, so it
  must name exactly the destination host.
- **A bare domain** (`example.org`) is first checked against the Public Suffix List, so
  file names and similar text are not mistaken for domains. It then only has to belong
  to the same registrable domain as the destination.

Until Link Guard has checked a bare domain, the link stays inactive; if the check cannot
run, the link warns rather than passing unchecked. Email addresses in link text
(`info@example.org`) are not treated as claims about the destination.

## User name or password in the link

A link like `https://www.bank.example@evil.example.net/` looks as if it leads to the
bank, but everything before `@` is a user name and the real host is `evil.example.net`.
Link Guard warns about any link that contains a user name or password.

## IP address instead of a host name

Links such as `http://192.0.2.10/login` bypass domain names entirely. They are warned
about and can only be allowed for the current message; see
[Approvals and blocks](approvals-and-blocks.md#links-to-ip-addresses).

## Unusual port

A link with an explicit port, such as `https://example.org:8443/`, reaches a different
service than the normal website. Default ports (`:443` for HTTPS, `:80` for HTTP) do not
count.

## Public URL shortener

Short links hide where they lead. They are warned about and can only be allowed for the
current message after a second confirmation; see
[Approvals and blocks](approvals-and-blocks.md#public-url-shorteners) for the list of
recognised services. Branded click-tracking domains of newsletters are not shorteners;
they are ordinary hosts that you approve or not.

## Domain check unavailable

The lookalike and internationalized-name checks run in Link Guard's background process.
If that check fails, every affected host shows *Domain check unavailable* and stays
inactive. This warning cannot be switched off, because the alternative would be to let
links through unchecked.

## Your own warning rules

You can add warnings with regular-expression rules on the host, the full URL or the link
text, or import them as warning lists. A matching rule shows its label as a warning and
works exactly like a built-in warning. Matching is bounded so that no message can slow
Thunderbird down; a link that could not be checked in time shows *Rules not checked*
instead of passing silently. See [Warning rules](warning-rules.md).
