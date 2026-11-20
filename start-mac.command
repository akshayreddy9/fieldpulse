#!/bin/bash
# Double-click to start MSR Pulse on a Mac. (First time: right-click > Open, or run: chmod +x start-mac.command)
cd "$(dirname "$0")"
if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js is not installed. Download the LTS version from https://nodejs.org, install it, then run this again."
  read -n 1 -s -r -p "Press any key to close"; exit 1
fi
[ -d node_modules ] || npm install
echo "Building the app..."
npm run build >/dev/null
(sleep 4; open http://localhost:8787) &
npm run server
