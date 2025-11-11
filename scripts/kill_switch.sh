#!/bin/bash
# Kill Switch - Emergency Feature Toggle
# PR9: Canary Rollout
# 
# Quickly disables all Brain-First Core features in production

set -e

echo "[Kill Switch] Emergency disable of Brain-First Core features..."

# Set all features to off in .env
ENV_FILE="${ENV_FILE:-.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "[Kill Switch] No .env file found at $ENV_FILE"
  exit 1
fi

# Backup .env
cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"

# Disable all features
sed -i.bak \
  -e 's/^MEMORY_V2=on/MEMORY_V2=off/' \
  -e 's/^PERSONA_V1=on/PERSONA_V1=off/' \
  -e 's/^EMOTION_GATES=on/EMOTION_GATES=off/' \
  -e 's/^CANARY_PERCENT=.*/CANARY_PERCENT=0/' \
  "$ENV_FILE"

echo "[Kill Switch] All Brain-First Core features disabled"
echo "[Kill Switch] Backup saved to: $ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
echo "[Kill Switch] Restart services to apply changes"

