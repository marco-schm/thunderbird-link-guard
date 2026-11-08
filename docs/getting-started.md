# Getting started

## Requirements

- Thunderbird **151 or newer**. Link Guard is developed and tested with Thunderbird 159
  on macOS; other versions and platforms are expected to work but are not tested
  regularly.
- Messages displayed as HTML or plain text. Link Guard works in the message pane, in
  message tabs and in separate message windows.

## Install

1. Download the file `link-guard-<version>.xpi` from the
   [latest release](https://github.com/marco-schm/thunderbird-link-guard/releases/latest).
2. In Thunderbird, open **Add-ons and Themes** (menu **Tools**, or the ≡ menu).
3. Click the gear icon and choose **Install Add-on From File…**, then select the XPI.
4. Confirm the permission prompt.

Messages that are already open are protected right after installation; you do not
need to restart Thunderbird.

### Check the download (optional)

Each release also contains a `SHA256SUMS` file. Compare it with the checksum of your
download:

```sh
shasum -a 256 link-guard-<version>.xpi    # macOS
sha256sum link-guard-<version>.xpi        # Linux
```

```powershell
Get-FileHash link-guard-<version>.xpi -Algorithm SHA256   # Windows
```

Official releases are built automatically from a release tag signed with the
maintainer's hardware key. See [Development](development.md#releases) for how that works.

### Build it yourself

You can also build the XPI from source with Node.js 20 or newer:

```sh
git clone https://github.com/marco-schm/thunderbird-link-guard.git
cd thunderbird-link-guard
npm test
npm run package          # creates dist/link-guard-<version>.xpi
```

## Permissions

Link Guard asks for three permissions and no access to any website:

| Permission | Why it is needed |
| --- | --- |
| `messagesRead` | to run in displayed messages and to know when another message is shown |
| `scripting` | to protect messages that were already open when Link Guard was installed or updated |
| `storage` | to keep your approvals, blocks, lists and settings on this computer |

## Your first message

Open any message with web links. Instead of clickable links you will see a notice at
the top of the message, for example **Links pending: 3**.

1. **Click the notice** to expand it. It lists every destination host in the message,
   with its status and any warnings.
2. **Check the destination** independently of the email: is this a host you expect
   this sender to link to?
3. **Decide** for each host:
   - **Allow temporarily** makes its links work in this message only.
   - **Allow permanently** asks whether to approve only this host or its whole domain,
     and remembers the decision.
   - **Block** asks for the same scope and keeps its links inactive from now on.

Once every link is approved and none has a warning, the notice disappears. Your
permanent decisions appear in [Settings](settings.md), where you can edit them at any
time.

> **Tip:** Clicking an inactive link does not open anything. It expands the notice and
> scrolls it into view so you can decide.

## Where to go next

- [Using Link Guard](using-link-guard.md) explains everything you see in a message.
- [Approvals and blocks](approvals-and-blocks.md) explains how decisions combine.
- [Settings](settings.md) shows how to import lists and adjust warnings.
