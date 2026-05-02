# OpenClaw Memory Plus

`openclaw-memory-plus` is a local, upgrade-safe memory plugin for OpenClaw. It keeps authoritative state in human-readable files under `~/.openclaw/agents/<agentId>/memory-plus/` and separates memory into:

- identity
- semantic
- episodic
- reflective

It follows a two-speed pipeline:

- fast path: bounded recall + candidate capture
- slow path: promotion, summarization, reflection, index maintenance

## Layout

When this plugin is active, the authoritative store lives at:

```text
~/.openclaw/agents/<agentId>/memory-plus/
```

This plugin expects the exact file-first layout from the memory build spec, including:

- `index.yaml`
- `policies.yaml`
- `audit/events.jsonl`
- `candidates/YYYY/YYYY-MM-DD.jsonl`
- `semantic/*.yaml`
- `episodic/YYYY/*.md`
- `reflective/*.md`
- `identity/*.md`

## Install

Because this repository is being treated as the OpenClaw home directory, the plugin is already in the native local extension location:

```text
~/.openclaw/extensions/openclaw-memory-plus/
```

If you want to install it elsewhere later:

```bash
openclaw plugins install /absolute/path/to/openclaw-memory-plus
```

Then enable/select it:

```bash
openclaw plugins enable openclaw-memory-plus
openclaw config set plugins.slots.memory openclaw-memory-plus
```

## Configuration

The plugin uses `plugins.entries.openclaw-memory-plus.config` in `~/.openclaw/openclaw.json`.

Supported fields:

- `autoRecall` default `true`
- `autoCapture` default `true`
- `enableSlowPathLifecycle` default `true`
- `defaultAgentId` default `main`
- `storeRoot` optional path override, relative to OpenClaw home
- `debug` default `false`

## CLI

The plugin registers:

```bash
openclaw memory-plus init
openclaw memory-plus status
openclaw memory-plus search "upgrade-safe"
openclaw memory-plus inspect
openclaw memory-plus capture "Remember this preference"
openclaw memory-plus promote
openclaw memory-plus summarize
openclaw memory-plus reflect
openclaw memory-plus forget <id>
openclaw memory-plus rebuild-index
openclaw memory-plus doctor
```

## Tools

The plugin registers:

- `memory_search`
- `memory_get`
- `memory_store_candidate`
- `memory_promote`
- `memory_episode_summarize`
- `memory_reflect`
- `memory_forget`
- `memory_inspect`

## Validation

Once OpenClaw and Node are available, run:

```bash
cd ~/.openclaw/extensions/openclaw-memory-plus
node --test tests/*.test.js
```

For an end-to-end command sequence, see [`scripts/validate-memory-plus.sh`](./scripts/validate-memory-plus.sh).
