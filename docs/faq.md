# FAQ

## General

### Why are the links in my email not clickable?

That is Link Guard working. Every web link stays inactive until you approve its
destination host. Click the notice at the top of the message, check the hosts, and
choose **Allow temporarily** or **Allow permanently**. See
[Getting started](getting-started.md#your-first-message).

### Does Link Guard send my mail anywhere?

No. Messages are checked inside Thunderbird and nothing about them is sent anywhere.
The only network requests are fetches of list sources you add yourself. See
[Privacy](privacy.md).

### Does it come with a list of trusted sites?

No. Link Guard ships no trust list – you decide what to trust. To start quickly, approve
the domains you use often as whole domains, or import an allowlist that your
organisation provides.

### Is this a virus scanner?

No. Link Guard shows you where links go and asks you to decide. It does not scan
websites or attachments. See [Security model](security.md#what-it-does-not-do).

### How do I update Link Guard?

Install the newer XPI from the
[releases page](https://github.com/marco-schm/thunderbird-link-guard/releases) the same
way as the first one. Your settings are kept. Link Guard does not update itself.

### Which languages are supported?

Chinese (Simplified and Traditional), Czech, Danish, Dutch, English, Finnish, French,
German, Hungarian, Italian, Japanese, Korean, Polish, Portuguese (Brazil), Russian,
Spanish, Swedish, Turkish and Ukrainian. Link Guard follows Thunderbird's interface
language and falls back to English for others.

## Approving and blocking

### What is the difference between "Allow temporarily" and "Allow permanently"?

A temporary approval applies to the message on screen and ends when you show another
message. A permanent approval is remembered and appears in Settings.

### Should I approve the exact host or the whole domain?

Approve the **exact host** when you trust only that service, for example
`login.example.org`. Approve the **whole domain** (`example.org` and all subdomains) only
for organisations you trust completely, ideally domains you control. See
[Approvals and blocks](approvals-and-blocks.md#exact-host-or-whole-domain).

### Why can't I approve `docs.google.com` (or a `github.io` site) as a whole domain?

Anyone can publish documents or pages on these hosts. A whole-domain approval would
also approve content written by strangers, so Link Guard only offers an exact approval.
See [Shared-content hosts](approvals-and-blocks.md#shared-content-hosts).

### Why can short links like bit.ly only be allowed for one message?

A short link hides its destination; approving the shortener permanently would approve
every destination anyone links to through it. If you do not want this protection, switch
off the **Public URL shortener** warning in Settings.

### Why can't I approve a link to an IP address permanently?

IP addresses change owners and say nothing about who runs a server. Links like
`https://192.0.2.10/` can be allowed for the current message only.

### I approved the whole domain, but a link on it is still inactive. Why?

Either the link has a warning – links with warnings need an approval of their **exact**
host – or the host is a shared-content host, or a block covers it. The notice shows which
applies. See [Troubleshooting](troubleshooting.md#a-link-stays-inactive-after-i-approved-it).

### How do I undo a decision?

Open [Settings](settings.md), remove the line from the relevant card and click **Save
changes**.

## Warnings

### Why does Link Guard warn about a link I know is fine?

Warnings are heuristics. A lookalike warning can hit two legitimate, similar names; an
internationalized domain can be genuine; link text can name a domain while the link goes
through a tracking service. Approve the exact host if you are sure. If a type of warning
is consistently unhelpful for you, switch it off in
[Settings](settings.md#built-in-warnings).

### The warning stays after I approved the host. Is that a bug?

No. Warnings stay visible next to the link on purpose, so that the reason for caution is
never hidden once a link works.

### Why do Outlook "safelinks" links say *Possible redirect to …*?

Microsoft Safe Links and similar services wrap every link in your organisation's mail.
The visible host is the wrapper, not the site you will reach. Link Guard reads the real
destination from the wrapped link and names it, so you can judge it. Once that
destination is approved, the warning disappears. See
[Warnings](warnings.md#link-redirects-to-a-site-you-have-not-approved).

### Why can a link to my bank only be allowed for this message?

Its address contains script or HTML code. That is how cross-site scripting attacks a site
you trust, so a lasting approval of the host is deliberately not enough. See
[Warnings](warnings.md#script-or-html-code-in-the-link).

### Why don't I get lookalike warnings?

The lookalike check compares links with domains you have approved. With no approvals
yet, there is nothing to compare against. See [Warnings](warnings.md#lookalike-domain).

## Layout

### The labels next to links break the layout of some newsletters. Can I turn them off?

Yes. Switch off **Show link destinations** in [Settings](settings.md#show-link-destinations).
This hides the grey **↗ host** labels next to ordinary links. Red warning labels and the
notice remain.

### Can a message hide the notice?

A message cannot hide, restyle or fade the notice or the labels with its own styles. It
can draw something on top of them. The **Link Guard** toolbar button is outside the
message and always shows the real count. See
[Security model](security.md#trustworthy-display).

## Lists and rules

### Where do I get lists?

Link Guard does not recommend list providers. You can write your own (the
[format](lists.md#format) is simple JSON) or use a list maintained by your organisation.

### My remote list does not load. What is wrong?

The source must use HTTPS, allow CORS, answer without a redirect, use the content type
`application/json` or `text/plain`, and stay under 64 KiB. See
[Troubleshooting](troubleshooting.md#a-remote-list-does-not-load).

### Can a list approve links I have not reviewed?

A list does nothing until you have reviewed it in the preview, enabled it and saved.
Allowlists never update themselves. Blocklists can update themselves, but an update can
only block, never approve.

### Can I use any regular expression in warning rules?

Most everyday features are supported: classes, groups, alternatives, anchors and
quantifiers. Backreferences, lookaround and `\b` are not, because they would allow
patterns that freeze the program. See [Warning rules](warning-rules.md#pattern-syntax).
