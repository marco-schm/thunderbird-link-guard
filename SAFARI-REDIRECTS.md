# Safari redirect boundary

Link Guard runs inside Thunderbird. It checks the URL stored in the displayed
message and cannot see the URL that Safari eventually loads. The Thunderbird
extension must not claim to validate a redirect chain.

Safari users face an additional boundary. Apple's compatibility documentation
states that Safari Web Extensions do not support `webRequestBlocking` or a
blocking `BlockingResponse`. `webRequest.onBeforeRedirect` is informational;
it cannot cancel that redirect. Safari's Declarative Net Request API can block
or redirect matching requests, but its rules match URL patterns rather than
the context of one particular clicked mail link. A rule allowing an approved
starting host therefore does not establish that the eventual destination is
approved. An ordinary content script runs after navigation has begun and is
too late to guarantee that a target did not receive the request.

For this reason, no Safari companion is shipped or enabled. A future Safari
component must satisfy all of these before it can be described as redirect
protection:

1. It identifies a specific mail-initiated browser navigation without granting
   trust to unrelated browsing tabs.
2. It checks every cross-host hop *before* the target request is sent, including
   HTTP redirects, client-side redirects and a user clicking a second link on
   the landing page.
3. It does not prefetch or resolve secret-bearing reset URLs through an external
   service, local proxy, or preview request.
4. It keeps link decisions local and does not silently import or broaden
   Thunderbird approvals.
5. It is tested against a controlled local redirect chain in the actual Safari
   version and macOS profile where it will run.

If Safari cannot satisfy these properties, the honest alternative is to limit
the feature to Thunderbird's initial URL check. A dedicated managed browsing
environment with a strict navigation allowlist is a separate product design:
it would require broad browser permissions and would affect browsing outside
email. It must be evaluated and consented to separately.

Sources:

- Apple, Safari Web Extension compatibility:
  https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility
- Apple, Declarative Net Request in Safari:
  https://developer.apple.com/documentation/safariservices/blocking-content-with-your-safari-web-extension
- Mozilla, `webRequest.onBeforeRedirect` is informational:
  https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/onBeforeRedirect
