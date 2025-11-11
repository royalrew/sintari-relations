#!/bin/bash
# Rollback Script - Restore Previous Configuration
# PR9: Canary Rollout
#
# Usage: ./rollback.sh emotion
# Usage: ./rollback.sh memory
# Usage: ./rollback.sh all

set -e

COMPONENT="${1:-all}"

echo "[Rollback] Rolling back component: $COMPONENT"

case "$COMPONENT" in
  emotion)
    echo "[Rollback] Rolling back emotion_thresholds.json..."
    
    # Find latest tagged version
    LAST_TAG=$(git tag | grep "emotion@" | sort -V | tail -n 1)
    
    if [ -z "$LAST_TAG" ]; then
      echo "[Rollback] No emotion@ tag found in git history"
      exit 1
    fi
    
    echo "[Rollback] Found tag: $LAST_TAG"
    
    # Restore from tag
    git show "$LAST_TAG:config/emotion_thresholds.json" > config/emotion_thresholds.json
    
    echo "[Rollback] Restored emotion_thresholds.json from $LAST_TAG"
    ;;
  
  memory)
    echo "[Rollback] Rolling back memory configuration..."
    
    # Memory v2 doesn't have separate config yet
    echo "[Rollback] No memory config to rollback"
    ;;
  
  all)
    echo "[Rollback] Rolling back all components..."
    bash "$0" emotion
    bash "$0" memory
    ;;
  
  *)
    echo "[Rollback] Unknown component: $COMPONENT"
    echo "Usage: $0 [emotion|memory|all]"
    exit 1
    ;;
esac

echo "[Rollback] Rollback complete"

