#!/usr/bin/env bash
set -euo pipefail

# Only run on Debian/Ubuntu (Codespaces & GH runners)
if ! command -v apt-get >/dev/null 2>&1; then
  echo "apt-get not found; skipping system dependency install."
  exit 0
fi

echo "Detecting Ubuntu version..."

# Detect Ubuntu version for t64 package transition (Ubuntu 24.04+)
UBUNTU_VERSION=""
if [ -f /etc/os-release ]; then
  . /etc/os-release
  UBUNTU_VERSION="${VERSION_ID:-}"
  echo "Detected Ubuntu version: $UBUNTU_VERSION"
fi

# Determine which libasound package to use
# Ubuntu 24.04 (noble) and later use libasound2t64 due to time64 transition
LIBASOUND_PKG="libasound2"
if [ -n "$UBUNTU_VERSION" ]; then
  # Compare version (24.04 and higher use t64)
  if awk "BEGIN {exit !($UBUNTU_VERSION >= 24.04)}"; then
    LIBASOUND_PKG="libasound2t64"
    echo "Using t64 package variant for Ubuntu 24.04+"
  fi
fi

echo "Installing Cypress system dependencies..."
sudo apt-get update

# Install dependencies with version-aware package selection
sudo apt-get install -y --no-install-recommends \
  xvfb \
  libgtk-3-0 \
  libgtk2.0-0 \
  libgbm1 \
  libnss3 \
  "$LIBASOUND_PKG" \
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
  ca-certificates

echo "Cypress system dependencies installed successfully."
