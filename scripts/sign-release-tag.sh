#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
version=$(node -p "require('./package.json').version")
test "$(node -p "require('./manifest.json').version")" = "$version"
tag="v$version"
key="${LINK_GUARD_RELEASE_KEY:-$HOME/.ssh/link_guard_release_sk}"
test -f "$key"
test -f "$key.pub"
test "$(git branch --show-current)" = main
test -z "$(git status --porcelain)"
test "$(git rev-parse HEAD)" = "$(git rev-parse refs/remotes/origin/main)"
if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  echo "Tag $tag already exists" >&2
  exit 1
fi
test "$(ssh-keygen -lf "$key.pub" | awk '{print $2}')" = \
  'SHA256:bEWcJGg/lNuGFwZwY0Qra47sB/MsEnOC0W2lxNtHXUc'

npm test
npm run package
SSH_SK_PROVIDER="${SSH_SK_PROVIDER:-/opt/homebrew/opt/openssh-sk-provider/lib/sk-libfido2.dylib}" \
  git -c gpg.format=ssh -c user.signingkey="$key" tag -s "$tag" \
    -m "Link Guard $version release"
git -c gpg.format=ssh \
  -c gpg.ssh.allowedSignersFile="$(pwd)/release/allowed_signers" \
  verify-tag "$tag"
echo "Signed $tag at $(git rev-parse HEAD). Push with: git push origin refs/tags/$tag"
