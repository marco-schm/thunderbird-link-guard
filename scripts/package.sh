#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
version=$(node -p "require('./package.json').version")
test "$(node -p "require('./manifest.json').version")" = "$version"
mkdir -p dist
archive="dist/link-guard-$version.xpi"
rm -f "$archive"
zip -q -X "$archive" \
  manifest.json background.js english.js locale.js policy.js access.js import-list.js safe-regex.js warning-rules.js domain-scope.js panel-style.js display.js display.css \
  options.html options.css options.js icons/shield.svg \
  _locales/de/messages.json _locales/en/messages.json _locales/es/messages.json \
  _locales/fr/messages.json _locales/pt_BR/messages.json _locales/it/messages.json \
  _locales/pl/messages.json _locales/ru/messages.json _locales/ja/messages.json \
  _locales/zh_CN/messages.json _locales/zh_TW/messages.json \
  _locales/cs/messages.json _locales/da/messages.json _locales/fi/messages.json \
  _locales/hu/messages.json _locales/ko/messages.json _locales/nl/messages.json \
  _locales/sv/messages.json _locales/tr/messages.json _locales/uk/messages.json \
  vendor/public_suffix_list.dat vendor/MPL-2.0.txt
unzip -t "$archive" >/dev/null
printf 'Built %s\n' "$archive"
