#!/bin/bash
set -u

APP_DIR="${1:-$HOME/company-esign}"
ZIP="${2:-$APP_DIR/company-esign-cpanel.zip}"

echo "=== Fix permissions + .next for cPanel ==="
echo "App dir: $APP_DIR"
echo

cd "$APP_DIR" || exit 1

if [ -f "$HOME/package-lock.json" ] && [ ! -f "$HOME/package.json" ]; then
  echo "Removing stray lockfile in home: $HOME/package-lock.json"
  rm -f "$HOME/package-lock.json"
fi

if [ -d "$HOME/node_modules" ] && [ ! -f "$HOME/package.json" ]; then
  echo "Removing stray node_modules in home"
  rm -rf "$HOME/node_modules"
fi

if [ -f "$ZIP" ]; then
  echo "Re-extracting .next from ZIP..."
  rm -rf .next
  unzip -o "$ZIP" ".next/*" -d "$APP_DIR" >/dev/null
else
  echo "ZIP not found at $ZIP — fixing permissions on existing .next only"
fi

echo "Setting permissions..."
find .next -type d -exec chmod 755 {} \; 2>/dev/null || true
find .next -type f -exec chmod 644 {} \; 2>/dev/null || true
chmod -R u+rwX,go+rX .next 2>/dev/null || chmod -R 755 .next
chmod 755 server.js 2>/dev/null || true
chmod 700 data storage storage/offices 2>/dev/null || true

echo
echo "Check:"
ls -ld .next .next/static 2>/dev/null || echo "MISSING .next/static"
echo
echo "Test: node server.js"
