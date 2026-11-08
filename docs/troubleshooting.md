# Troubleshooting

## Links are clickable without any notice

- **Is protection on?** Open [Settings](settings.md) and check **Enable Link Guard**. The
  toolbar tooltip reads *Link Guard is disabled* when it is off.
- **Are they web links?** `mailto:`, `tel:`, `cid:` and jumps within the message are not
  subject to approval.
- **Are they already approved?** Hosts you approved permanently, as a whole domain or
  through an enabled allowlist work without a notice, as long as they have no warning.
- **Is the add-on running?** Check **Add-ons and Themes**: Link Guard must be enabled,
  and Thunderbird must be version 151 or newer. A message that was open while Link Guard
  was installed or updated is protected automatically; if in doubt, show another message
  and come back.

## A link stays inactive after I approved it

Expand the notice and look at the host's row:

| What the notice shows | Cause | What to do |
| --- | --- | --- |
| a red warning on the host | links with warnings need an approval of the **exact** host; whole-domain approvals and allowlists do not count | **Allow temporarily**, or **Allow permanently → Only \<host\>** |
| *Others can publish content here* | a shared-content host such as `docs.google.com` is excluded from whole-domain approvals | approve the exact host |
| **Blocked** | your own block or an enabled blocklist covers the host | click **Unblock** and confirm; for a list block, **Open settings** and change or disable the list |
| *Short link: destination hidden* | short links can only be allowed for one message | **Allow temporarily** and confirm |
| *Direct IP address* | IP links can only be allowed for one message | **Allow temporarily** |
| *Domain check unavailable* | the background check failed | show the message again; restart Thunderbird if it persists |
| *More than 500 links* (at the end of the notice) | links beyond the first 500 are never activated | open the content in your browser by another route, for example the sender's website |

## "Decision could not be saved. The link remains blocked."

A permanent decision was refused. Common reasons:

- An **enabled imported blocklist** blocks the host or its domain. Disable the list or
  remove the entry under **View and edit list**, save, and try again.
- One of **your own whole-domain blocks** covers the host. Remove the `*.domain` line
  under **Block whole domains** first.
- A card already holds **500 entries**.

## "Approvals could not be loaded. Web links remain blocked."

Link Guard could not read its settings from its background process. Links stay inactive
for safety. Show the message again; if the message persists, restart Thunderbird and
check that the add-on is enabled.

## A remote list does not load

The error message tells you which rule failed:

| Message | Cause |
| --- | --- |
| *Only an HTTPS file URL without credentials, port, query, or fragment is allowed.* | The URL is not `https://`, contains `user@`, a `:port`, a `?query` or `#fragment`, ends with `/`, or uses an IP address. |
| *Remote list could not be loaded safely. Check HTTPS, JSON, CORS, and redirects.* | The server did not answer with status 200, redirected, does not allow CORS, sent a content type other than `application/json` or `text/plain`, did not answer within 10 seconds, or the file is not valid UTF-8. |
| *List is too large (maximum 64 KiB).* | The file is larger than 65,536 bytes. |
| *Invalid list format. Expected: format, version, name, category, and hosts.* | A field is missing, has a wrong value, or the list contains an unknown field or an invalid host. |
| *List contains a duplicate hostname.* | Two entries are the same after normalisation, e.g. `Example.org` and `example.org.` |

You can check the server's answer with `curl`:

```sh
curl -sSI https://lists.example.org/link-guard/blocklist.json
```

Look for a `200` status (not `301` or `302`), a `content-type` of `application/json` or
`text/plain`, and an `access-control-allow-origin` header. See
[Host lists](lists.md#remote-sources).

## An automatic list update was not applied

The list card in Settings shows why. *The automatic update was not applied because it is
large or would block something you approved* means the update added more than 50 entries,
more than doubled the list, halved a larger list, or would block one of your approvals.
Click **Review remote update**, check the changes, stage them and enable the list again.
See [Automatic updates](lists.md#automatic-updates).

## Settings cannot be saved

| Message | Cause |
| --- | --- |
| *Invalid hostname on line N.* | The line is not a valid host name – check for `https://`, paths, ports, spaces or IP addresses. |
| *Up to 500 hostnames per list.* | The card has more than 500 lines. |
| *\<domain\> is not a registrable domain according to the bundled Public Suffix List.* | A `*.` rule names a public suffix such as `co.uk` or a hosting service such as `github.io`. Use the full registrable domain, e.g. `*.example.co.uk`. |
| *Rule N: …* | A warning rule is invalid; the message names the problem. See [Warning rules](warning-rules.md#pattern-syntax). |
| *Too many warning rules: at most 50 of your own and 200 in effect.* | Reduce your rules or disable a warning list. |
| *Lists changed elsewhere. Reload this page before saving.* | You approved or blocked a host in a message while Settings was open. Reload the page and repeat your edits. |

## Labels break the layout of a message

Switch off **Show link destinations** in [Settings](settings.md#show-link-destinations).
This removes the grey **↗ host** labels next to ordinary links. Red warning labels stay,
because they mark a concrete risk.

## A very large message opens slowly

Link Guard checks the first 500 links in full and only disables the rest, so the extra
work per message is bounded. Messages with tens of thousands of links are still slow to
display in Thunderbird itself.

## Starting over

To remove all approvals, blocks and rules, clear the cards in Settings and remove the
imported lists, then save. Uninstalling Link Guard in **Add-ons and Themes** deletes all
of its stored data.

## Reporting a bug

Open an issue on [GitHub](https://github.com/marco-schm/thunderbird-link-guard/issues)
with your Thunderbird version, operating system and a description of what you expected.
Do not attach real messages, links from real mail, credentials or reset links. For
security problems, follow the
[security policy](https://github.com/marco-schm/thunderbird-link-guard/blob/main/SECURITY.md)
instead.
