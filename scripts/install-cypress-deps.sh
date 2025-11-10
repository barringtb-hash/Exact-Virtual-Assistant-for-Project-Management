#!/usr/bin/env bash
set -euo pipefail

if command -v apt-get >/dev/null 2>&1; then
  if [ "$(id -u)" -eq 0 ]; then
    APT_PREFIX=""
  else
    APT_PREFIX="sudo"
  fi

  $APT_PREFIX apt-get update

  packages_to_install=()
  while IFS= read -r line; do
    [[ -z "$line" || "$line" =~ ^# ]] && continue

    read -r -a candidates <<<"$line"
    for candidate in "${candidates[@]}"; do
      if apt-cache show "$candidate" >/dev/null 2>&1; then
        packages_to_install+=("$candidate")
        break
      fi
    done
  done <<'PKGLIST'
libgtk2.0-0t64 libgtk2.0-0
libgtk-3-0t64 libgtk-3-0
libgbm1 libgbm-dev
libnotify4 libnotify-bin
libnss3
libxss1
libasound2t64 libasound2
libxtst6
fonts-noto-color-emoji
PKGLIST

  if ((${#packages_to_install[@]})); then
    $APT_PREFIX apt-get install -y "${packages_to_install[@]}"
  fi
else
  echo "apt-get not found; skipping Cypress system dependency installation" >&2
fi
