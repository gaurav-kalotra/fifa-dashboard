#!/usr/bin/env bash
# Cast the World Cup dashboard to your Chromecast.
# Requires: pip3 install catt
# Usage: ./chromecast.sh [device-name]
#   device-name  (optional) exact name from `catt scan`; omits for default device

set -euo pipefail

PI_IP="192.168.1.10"
PORT=4173
URL="http://${PI_IP}:${PORT}/?tv=1"

DEVICE="${1:-}"

echo "Casting ${URL} to Chromecast${DEVICE:+ \"$DEVICE\"}…"

if [ -n "$DEVICE" ]; then
  catt -d "$DEVICE" cast_site "$URL"
else
  catt cast_site "$URL"
fi
