#!/usr/bin/env bash
# Run this ONCE on the Pi to install and enable the dashboard service.
# Assumes the repo is already cloned to ~/claude-projects/fifa-dashboard

set -euo pipefail

REPO_DIR="$HOME/claude-projects/fifa-dashboard"
SERVICE_NAME="worldcup"

echo "==> Installing Node deps…"
cd "$REPO_DIR"
npm install

echo "==> Building…"
npm run build

echo "==> Installing systemd service…"
sudo cp deploy/worldcup.service /etc/systemd/system/${SERVICE_NAME}.service

# Patch the user field to match the current user
sudo sed -i "s/^User=pi$/User=$(whoami)/" /etc/systemd/system/${SERVICE_NAME}.service
sudo sed -i "s|/home/pi/|/home/$(whoami)/|g"   /etc/systemd/system/${SERVICE_NAME}.service

sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}
sudo systemctl restart ${SERVICE_NAME}

echo ""
echo "==> Done. Dashboard is live at:"
echo "    http://$(hostname -I | awk '{print $1}'):4173"
echo "    TV screensaver: http://$(hostname -I | awk '{print $1}'):4173/?tv=1"
echo ""
echo "==> To cast to Chromecast (install catt first: pip3 install catt):"
echo "    catt cast_site http://$(hostname -I | awk '{print $1}'):4173/?tv=1"
