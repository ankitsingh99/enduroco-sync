#!/usr/bin/env bash

# Helper script to install a daily crontab on macOS at 12:00 PM
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRON_CMD="0 12 * * * cd $PROJECT_DIR && /opt/homebrew/bin/node bin/cli.js sync >> $PROJECT_DIR/data/sync.log 2>&1"

# Check if cron job already exists
(crontab -l 2>/dev/null | grep -F "$PROJECT_DIR") >/dev/null

if [ $? -eq 0 ]; then
  # Replace existing entry with 12:00 PM
  (crontab -l 2>/dev/null | grep -v -F "$PROJECT_DIR"; echo "$CRON_CMD") | crontab -
  echo "Crontab entry updated to run daily at 12:00 PM."
else
  (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
  echo "Daily cron job installed to run at 12:00 PM."
fi
