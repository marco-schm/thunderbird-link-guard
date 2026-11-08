# Privacy

Link Guard is built to work without sending anything anywhere.

## What stays on your computer

- **Your mail.** Messages are inspected inside Thunderbird. No message content, link,
  host name or decision is sent to anyone.
- **Your settings.** Everything is stored in Thunderbird's local extension storage for
  your profile. Nothing is synchronised to a cloud service.
- **Domain checks.** Lookalike detection and whole-domain scopes use the Public Suffix
  List bundled with the add-on. Link Guard never looks up domains online.

Link Guard contains no telemetry, no analytics and no update checks. It does not
update itself either: new versions are installed from the
[releases page](https://github.com/marco-schm/thunderbird-link-guard/releases) like the
first one.

## What is stored

| Stored item | Content |
| --- | --- |
| `enabled` | whether protection is on |
| `showDestinations` | whether destination labels are shown next to links |
| `customAllowedHosts` | your exact permanent approvals |
| `blockedHosts` | your exact blocks |
| `broadAllowedDomains` | your whole-domain approvals |
| `blockedDomains` | your whole-domain blocks |
| `importedLists` | imported host lists: name, type, category, entries, source URL, enabled state, update settings and the time and result of the last automatic update |
| `disabledWarnings` | built-in warnings you switched off |
| `customWarnings` | your own warning rules |
| `warningLists` | imported warning lists: name, rules, source URL and enabled state |

Temporary approvals are kept only in memory for the message on screen and are discarded
when you show another message.

Removing Link Guard in **Add-ons and Themes** removes its stored data with it.

## Network requests

Link Guard makes network requests **only** to list sources that you add yourself:

- when you click **Check remote list** or **Review remote update** in Settings, and
- for automatic updates of enabled remote **blocklists**, about once a day per list.

Each request:

- goes over HTTPS to exactly the URL you entered, without following redirects,
- carries no cookies or other credentials and no referrer,
- contains nothing about your mail, your links or your decisions.

Like any web request it reveals your IP address to the server of the list. Because the
request is a cross-origin request, the server also sees Link Guard's per-installation
extension origin (a random identifier of the form `moz-extension://…`). Add lists only
from sources you trust, and switch off **Update automatically** for a list if you do not
want daily requests.

Opening an approved link is done by your browser, not by Link Guard, and is subject to
your browser's own privacy settings.
