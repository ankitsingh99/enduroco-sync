#!/usr/bin/env bash

# Helper script to install a daily crontab on macOS
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRON_CMD="0 6 * * * cd $PROJECT_DIR && /opt/homebrew/bin/node bin/cli.js sync >> $PROJECT_DIR/data/sync.log 2>&1"

# Check if cron job already exists
(crontab -l 2>/dev/null | grep -F "$PROJECT_DIR") >/dev/null

if [ $? -eq 0 ]; then
  echo "Crontab entry already installed for $PROJECT_DIR"
else
  (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
  echo "Daily cron job installed to run at 06:00 AM."
fi
