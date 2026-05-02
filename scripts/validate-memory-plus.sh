#!/usr/bin/env bash
set -euo pipefail

openclaw memory-plus init
openclaw memory-plus capture "User prefers upgrade-safe plugin approaches over forking core."
openclaw memory-plus capture "User prefers concise practical technical answers."
openclaw memory-plus promote
openclaw memory-plus search "upgrade-safe plugin"
openclaw memory-plus summarize --title "Memory-plus validation episode"
openclaw memory-plus reflect
openclaw memory-plus inspect

test -f ~/.openclaw/agents/main/memory-plus/index.yaml
test -f ~/.openclaw/agents/main/memory-plus/policies.yaml
test -f ~/.openclaw/agents/main/memory-plus/audit/events.jsonl
test -f ~/.openclaw/agents/main/memory-plus/semantic/preferences.yaml

echo "memory-plus validation complete"
