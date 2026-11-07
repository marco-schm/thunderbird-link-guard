# YubiKey release authorization

Official GitHub releases require an annotated Git tag signed by the dedicated
YubiKey FIDO key in `allowed_signers`. The release workflow checks the tag's
signature and target commit before it runs tests, builds the XPI, or publishes
assets. The public key is not an SSH login key. Its private key handle remains
on the maintainer's computer; signing also requires the physical YubiKey.

To release, update both version fields and the changelog, commit and push
`main`, then run `sh scripts/sign-release-tag.sh`. Touch the YubiKey when
prompted. Inspect the signed tag and push it using the command printed by the
script. Back up the local key-handle file securely. The FIDO credential on this
YubiKey cannot be copied to a spare device; register a second signing key in a
reviewed change before losing the first one. Losing the key handle or YubiKey
blocks releases until the trusted public key is changed.

Anyone can build this open-source XPI locally. This gate controls only the
repository's official automated releases. A repository administrator or an
actor allowed to change the workflow, its trusted public key, or GitHub release
settings can bypass a repository-local check. Protect those settings and files
with GitHub access controls and review changes to them carefully.
