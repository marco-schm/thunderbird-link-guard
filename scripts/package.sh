#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
version=$(node -p "require('./package.json').version")
test "$(node -p "require('./manifest.json').version")" = "$version"
mkdir -p dist
archive="dist/link-guard-$version.xpi"
rm -f "$archive"
zip -q -X "$archive" \
  manifest.json background.js policy.js access.js import-list.js domain-scope.js display.js display.css \
  options.html options.css options.js icons/shield.svg \
  _locales/de/messages.json _locales/en/messages.json \
  vendor/public_suffix_list.dat vendor/MPL-2.0.txt
unzip -t "$archive" >/dev/null
printf 'Built %s\n' "$archive"
