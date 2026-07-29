#!/bin/bash
set -u

APP_DIR="${1:-$HOME/company-esign}"

echo "=== Company E-Sign cPanel check ==="
echo "App dir: $APP_DIR"
echo

if [ ! -d "$APP_DIR" ]; then
  echo "ERROR: Folder not found: $APP_DIR"
  echo "Fix: extract company-esign-cpanel.zip in home directory."
  exit 1
fi

cd "$APP_DIR" || exit 1

check_file() {
  if [ -e "$1" ]; then
    echo "OK   $1"
  else
    echo "MISS $1"
  fi
}

check_file "server.js"
check_file "package.json"
check_file ".next/BUILD_ID"
check_file "node_modules/next/package.json"

if [ ! -f "node_modules/next/package.json" ]; then
  echo
  echo "Installing Linux node_modules (required once)..."
  npm ci --omit=dev
fi

echo
echo "Node version:"
node -v 2>&1 || echo "ERROR: node command not found"

echo
echo "Quick start test (8 seconds):"
set +e
timeout 8 node server.js 2>&1
echo
echo "If you saw 'Company E-Sign running on port', go to cPanel > Setup Node.js App > Restart."
echo "Startup file must be: server.js"
