# Approvals and blocks

Link Guard decides per **host**: the part of a link between `https://` and the next `/`,
for example `login.example.org`. This page explains how decisions are evaluated, what a
scope covers, and which links need extra care.

## Evaluation order

For every host in a link, Link Guard checks these rules in order. The first one that
applies decides.

1. **A temporary approval** for the current message allows the host – even if it is
   blocked.
2. **A block** denies the host. This includes your own exact and whole-domain blocks and
   every enabled imported blocklist. A block overrides every permanent approval and every
   allowlist.
3. **A permanent approval** allows the host: your exact approvals, your whole-domain
   approvals and every enabled imported allowlist. A host with a warning still needs an
   exact approval (see [Links with warnings](#links-with-warnings)).
4. **Everything else** stays inactive until you decide.

A link is clickable only when its host is allowed.

## Exact host or whole domain

Every permanent approval and every block has a scope.

**Exact host** – one host name and nothing else. Parent domains and subdomains are
separate decisions:

| Approved exactly | `login.example.org` | `example.org` | `www.login.example.org` |
| --- | --- | --- | --- |
| `login.example.org` | allowed | not covered | not covered |

**Whole domain** – written `*.example.org` in Settings. It covers the registrable
domain itself and every subdomain at any depth:

| Approved whole domain | `example.org` | `www.example.org` | `a.b.example.org` | `example.org.evil.net` | `example.com` |
| --- | --- | --- | --- | --- | --- |
| `*.example.org` | allowed | allowed | allowed | not covered | not covered |

### What counts as a domain

Link Guard uses the bundled [Public Suffix List](https://publicsuffix.org/) to find the
registrable domain of a host. That is why:

- `*.co.uk` or `*.com` can never be approved or blocked – they are public suffixes.
- On hosting services listed as private suffixes, such as `github.io`, each customer's
  site (`alice.github.io`) is its own domain. Approving one does not approve another.
- Hosts under a suffix the list does not know get no whole-domain option at all; you
  can still approve them exactly.

The bundled list is a snapshot that is updated before releases. A suffix added upstream
after that snapshot is not known yet.

### Shared-content hosts

Some services let anyone publish pages or documents under their domain. A whole-domain
approval of the provider would silently approve content from strangers, so these hosts
are excluded from whole-domain approvals and can only be approved exactly:

`docs.google.com`, `drive.google.com`, `sites.google.com`, `forms.gle`,
`onedrive.live.com`, `sharepoint.com`, `gist.github.com`, `github.io`, `gitlab.io`,
`pages.dev`, `workers.dev`, `vercel.app`, `netlify.app`, `web.app`, `firebaseapp.com`,
`appspot.com`, and all of their subdomains.

For example, approving `*.google.com` does **not** make links to `docs.google.com` work.
For these hosts the notice offers only **Only <host>** and explains *Others can publish
content here. Approve only this host.* Blocking them as a whole domain is possible.

This list is a limited catalogue. New services of this kind appear all the time, and
an exact approval of such a host still allows every page on it. Use whole-domain
approvals only for domains you control or fully trust.

## Links with warnings

A link with a warning needs a **deliberate approval of its exact host**: either
**Allow temporarily** in the message, or a permanent approval of exactly that host.
Whole-domain approvals and imported allowlists do **not** unlock it. This applies to:

- lookalike and internationalized domains,
- link text that names a different host,
- user names or passwords in the link,
- links to an unusual port,
- matches of your own or imported [warning rules](warning-rules.md),
- links whose checks could not run (*Domain check unavailable*, *Warning rules could not
  be checked for this link*).

The red warning stays visible next to the link even after you approve the host.
If you switch a built-in warning off in [Settings](settings.md#built-in-warnings), its
extra approval requirement goes away too.

### Public URL shorteners

Shorteners such as `bit.ly`, `tinyurl.com` or `t.co` hide the real destination. Their
links can only be allowed **for the current message**, after a second confirmation.
They can never be approved permanently, and imported allowlists cannot approve them
either. If you switch off the **Public URL shortener** warning, they are handled like
any other host.

Recognised shorteners: `bit.ly`, `bitly.is`, `bitly.com`, `j.mp`, `tinyurl.com`, `t.co`,
`lnkd.in`, `buff.ly`, `ow.ly`, `rb.gy`, `rebrand.ly`, `s.gy`, `short.gy`, `is.gd`, `v.gd`,
`tiny.cc`, `cutt.ly`, `bl.ink`, and their subdomains.

### Links to IP addresses

Links such as `https://192.0.2.10/` or `https://[2001:db8::1]/` can only be allowed for
the current message. They can be neither approved permanently nor blocked, because IP
addresses change hands and say nothing about who runs the server.

## How decisions affect each other

Decisions made in a message keep your rules consistent:

| You … | Link Guard also … |
| --- | --- |
| approve a host exactly | removes your exact block of that host |
| approve a whole domain | removes your whole-domain block of that domain and your exact block of the host you clicked |
| block a host exactly | removes your exact approval of that host |
| block a whole domain | removes the whole-domain approval and every exact approval inside that domain |

Some permanent decisions are refused, and the notice shows *Decision could not be
saved*:

- approving a host that an **enabled imported blocklist** blocks – disable the list or
  remove the entry first;
- approving a host exactly while **your own whole-domain block** covers it – remove the
  `*.domain` block first.

A temporary approval for the current message always works.

## Approvals and lookalike warnings

Your approvals also teach Link Guard which domains you trust. The registrable domains
of your exact approvals, your whole-domain approvals and your enabled allowlists form
the reference set for the [lookalike warning](warnings.md#lookalike-domain): a host that
differs from one of them by a single character gets a warning. Imported blocklists never
shrink this set, so a hostile list cannot silence lookalike warnings.
