# OpenClaw Memory Plus Analysis

## 1. Overview & Purpose
The `openclaw-memory-plus` extension is a specialized, non-redundant core plugin that manages structured long-term memory. It implements an architecture with four layers: semantic, episodic, reflective, and identity. 

It registers a full suite of memory tools for the agents:
- `memory_search`
- `memory_get`
- `memory_store_candidate`
- `memory_promote`
- `memory_episode_summarize`
- `memory_reflect`
- `memory_forget`
- `memory_flush`
- `memory_inspect`

## 2. How It Works
It functions in two distinct modes simultaneously:
1. **Passive/Automatic**: Hooks into `before_agent_start`, `agent_end`, and `tool_result` events. If configured, it automatically recalls relevant context before a prompt and automatically captures candidate memories from the conversation into a JSONL queue.
2. **Active/Manual**: Exposes the `memory_*` tools to the agents, allowing them to explicitly search their past, inspect their identity, and formally promote fleeting memories into durable semantic facts or episodic summaries.

## 3. Agent Implementation Check (Misconfigurations Found)
According to the `AGENTS.md` and `SOUL.md` files in the agent workspace, the primary agent (`main`) is explicitly instructed to:
> "Prefer the memory plugin tools/CLI when available: `memory_search`, `memory_inspect`, `memory_promote`..." 

However, looking at `.openclaw/openclaw.json`, **none of the `memory_*` tools are actually present in the `tools.allow` list for any agent**.

- **The Issue**: Because `autoRecall: true` and `autoCapture: true` are enabled in the plugin config, the agents are benefiting from *passive* memory injection. However, because the tools are blocked from their allowlists, the agents literally cannot follow their own `AGENTS.md` directives to *actively* curate, promote, or inspect their memory-plus store.

## 4. Architectural Findings
- This extension is **not redundant**. It is a standalone, well-architected replacement/enhancement for standard LLM memory. 
- It operates safely alongside the new `openclaw-inter-agent-tasks` system without duplicating background filesystems.

## 5. Resolution
All 9 `memory_*` tools have been added to the `main` agent's `tools.allow` list. The `orchestrator` agent does not have memory tools — it operates statelessly, with the observer pipeline running passively in the background for it.

## 6. Known Issue: `enableSlowPathLifecycle` is dead configuration
`enableSlowPathLifecycle` is declared in the plugin schema (`openclaw.plugin.json`), parsed by `lib/config.js` (line 44), and set to `true` in `openclaw.json` — but it is **never read by any runtime code**. The slow-path promotion logic in `lib/hooks.js` (lines 20-27) triggers directly on `ctx.preCompaction === true` or `event.flushMemory === true` flags, bypassing this config value entirely. The flag has no effect and should either be wired into `hooks.js` as a gate or removed from the schema.