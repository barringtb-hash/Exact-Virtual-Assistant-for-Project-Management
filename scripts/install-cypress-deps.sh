#!/usr/bin/env bash
set -euo pipefail

# Only run on Debian/Ubuntu (Codespaces & GH runners)
if ! command -v apt-get >/dev/null 2>&1; then
  echo "apt-get not found; skipping system dependency install."
  exit 0
fi

sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  xvfb \
  libgtk-3-0 \
  libgtk2.0-0 \
  libgbm1 \
  libnss3 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libxss1 \
  libxrandr2 \
  libxdamage1 \
  libxcomposite1 \
  libxfixes3 \
  libx11-xcb1 \
  libxshmfence1 \
  libglu1-mesa \
  xauth \
  x11-xkb-utils \
  fonts-liberation \
  ca-certificates \
  wget \
  curl

echo "Cypress system dependencies installed."
