# Redirect and short-link warning research

Reviewed 2026-11-07. Only the public short-link hosts in the first table trigger a red redirect
warning. They never grant access. A matching link requires confirmation and
approval for the current message, even if its host was approved permanently.

| Signal | Hostnames or pattern | Primary evidence |
| --- | --- | --- |
| Bitly short links, including legacy domains | `bit.ly`, `bitly.is`, `bitly.com`, `j.mp` | [Bitly short links](https://support.bitly.com/hc/en-us/articles/230897368-How-does-a-shortened-link-work), [legacy domains](https://support.bitly.com/hc/es/articles/4423884643725--Qu%C3%A9-pas%C3%B3-con-los-enlaces-cortos-de-j-mp-y-bitly-com) |
| TinyURL | `tinyurl.com` | [TinyURL service](https://tinyurl.com/) |
| X and LinkedIn | `t.co`, `lnkd.in` | [X link service](https://help.x.com/en/using-x/url-shortener), [LinkedIn examples](https://business.linkedin.com/content/dam/lem/business/en/advertise/linkedin-pages/linkedin-pages-playbook.pdf) |
| Buffer and Hootsuite | `buff.ly`, `ow.ly` | [Buffer support](https://support.buffer.com/articles/shortening-and-unshortening-links-dgev2p41yY), [Hootsuite support](https://help.hootsuite.com/s/article/shorten-track-links) |
| Rebrandly | `rb.gy`, `rebrand.ly` | [Rebrandly support](https://support.rebrandly.com/en/articles/469545-isn-t-rebrandly-a-free-link-shortener), [Rebrandly API](https://developers.rebrandly.com/docs/get-started) |
| Short.io | `*.s.gy`, legacy `short.gy` | [Short.io free domains](https://docs.short.io/articles/managing-your-account-and-domains/manage-your-domain/how-can-i-add-a-free-short.gy-subdomain), [Short.io change log](https://docs.short.io/changelog/tags/fix) |
| is.gd and v.gd | `is.gd`, `v.gd` | [is.gd FAQ](https://www.is.gd/faq.php), [developer documentation](https://www.is.gd/developers.php) |
| Tiny.cc and Cuttly | `tiny.cc`, `cutt.ly` | [Tiny.cc](https://tiny.cc/about), [Cuttly](https://cutt.ly/resources/tools/url-shortener) |
| BL.INK | `bl.ink` | [BL.INK support](https://help.bl.ink/support/solutions/articles/36000248442-anatomy-of-a-short-link) |
## Documented services intentionally excluded from red redirect warnings

[Amazon SES](https://docs.aws.amazon.com/ses/latest/dg/configure-custom-open-click-domains.html),
[SendGrid](https://help.twilio.com/articles/47303840249755),
[Postmark](https://postmarkapp.com/support/article/1060-how-does-link-tracking-work)
and [Microsoft Safe Links](https://support.microsoft.com/en-au/outlook/advanced-outlook-com-security-for-microsoft-365-subscribers)
can redirect links but occur routinely in mail. SendGrid uses branded domains
and a normal `/ls/click` path, including branded customer domains.
These hosts and paths now follow the ordinary host approval. Shared-content
services and generic redirect-looking URL components also do not trigger a
red redirect warning. URL syntax risks such as HTTP, credentials and a
misleading visible link text remain separate warning checks.

Update 2026-11-08: a destination that a link visibly carries is now named in a
warning when it is not approved; generic redirect-looking components without a
readable destination still raise none. See
[URL-CONTENT-RESEARCH.md](URL-CONTENT-RESEARCH.md).

The catalogue cannot be complete. Providers offer arbitrary branded tracking
domains; opaque redirects can hide the target until a browser visits the URL.
Link Guard does not fetch mail links or inspect the final browser navigation.
Adding a broad hostname on weak evidence can create excessive warnings, so
new entries require an operator source and a test. The original destination
is never assumed safe merely because the redirect service is legitimate.
