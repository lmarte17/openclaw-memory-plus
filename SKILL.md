# Memory Plus Skill

Structured, file-first long-term memory for OpenClaw agents. Implements four memory layers: semantic facts, episodic summaries, reflective insights, and identity. Works in both passive (automatic) and active (agent-driven) modes.

All tools use the `memory_` prefix. Memory is stored per-agent under `.openclaw/agents/<agentId>/memory-plus/`.

---

## Architecture

### Four memory layers

| Layer | What it stores | Durability |
|-------|---------------|------------|
| **Semantic** | Key-value facts: preferences, constants, domain knowledge | Permanent until forgotten |
| **Episodic** | Narrative summaries of past conversations and sessions | Permanent until forgotten |
| **Reflective** | Higher-order patterns inferred across multiple episodes | Permanent, regenerated periodically |
| **Identity** | Core agent identity, mission, and persona sections | Permanent, manually managed |

### Passive mode (always running)

These run automatically without any tool call:

| Hook | Trigger | What it does | Config gate |
|------|---------|-------------|-------------|
| `before_agent_start` | Before every prompt | Recalls relevant memory and prepends it to context | `autoRecall: true` |
| `agent_end` | When a session ends | Captures conversation text as memory candidates | `autoCapture: true` |
| `tool_result` | After every tool call | Captures tool output as memory candidates | `autoCapture: true` |

Memory captured passively lands in a **candidate queue** (JSONL file). Candidates are not yet durable memory — they must be promoted.

### Active mode

The `memory_*` tools let agents explicitly search, curate, promote, and inspect their memory store. The passive mode keeps the queue filled; the active tools let agents control what actually gets promoted to durable memory.

---

## Promotion pipeline

```
conversation / tool results
        ↓
memory_store_candidate  (or passive capture via autoCapture)
        ↓
  candidates queue  (pending JSONL)
        ↓
memory_promote          → semantic facts + identity updates
memory_episode_summarize → episodic summaries
memory_reflect          → reflective insights (from episodes)
        ↓
  durable memory store
```

`memory_flush` runs all three promotion steps in one call.

---

## Tool reference

### Search and retrieval

#### `memory_search`
Search across all four memory layers simultaneously.

```json
{ "query": "NetBox authentication configuration" }
```

```json
{ "query": "how the user prefers to receive reports" }
```

Returns matching semantic facts, episodes, reflections, and identity sections. Call this at the start of a workflow to surface relevant past context that the passive recall may not have included.

---

#### `memory_get`
Fetch a specific memory object by ID or file path.

```json
{ "id": "sem_abc123" }
```

```json
{ "path": "agents/main/memory-plus/semantic/netbox-auth.md" }
```

---

#### `memory_inspect`
Inspect the full memory state: layer counts, store root, pending candidate count, recent activity.

```json
{}
```

Call this to understand the current state of the memory store before a promote or flush operation.

---

### Candidate management

#### `memory_store_candidate`
Explicitly create a memory candidate. Use when you want to flag something for promotion immediately, rather than waiting for passive capture.

```json
{
  "text": "The user prefers rack density reports formatted as a table sorted by utilization descending",
  "memoryTypeHint": "semantic",
  "confidence": 0.9,
  "tags": ["preferences", "reporting", "racks"]
}
```

```json
{
  "text": "Successfully resolved the ny01 rack decommission workflow using bulk PATCH. Key lesson: always remap device_type IDs against the target environment before bulk creates.",
  "memoryTypeHint": "episodic",
  "confidence": 0.85,
  "tags": ["netbox", "workflow", "lessons-learned"]
}
```

`memoryTypeHint` values: `semantic`, `episodic`, `reflective`. The classifier uses this as a hint, not a hard override.

---

### Promotion tools

#### `memory_promote`
Promote pending candidates into durable semantic facts and identity updates.

```json
{}
```

```json
{
  "sessionKey": "2026-03-25-rack-audit",
  "reflect": true
}
```

Pass `reflect: true` to also generate reflective insights after promoting. Returns the count of promoted candidates and any new reflection paths.

---

#### `memory_episode_summarize`
Generate an episodic summary from pending candidates.

```json
{}
```

```json
{
  "sessionKey": "2026-03-25-rack-audit",
  "title": "ny01 Rack Density Audit"
}
```

Creates a narrative markdown summary of the session in the episodic store. Pass `title` to override the auto-generated title.

---

#### `memory_reflect`
Generate or refresh reflective insights from the episodic store. Conservative by default — only writes new reflections when the evidence threshold is met.

```json
{}
```

```json
{ "force": true }
```

Pass `force: true` to regenerate all reflections regardless of threshold. Use sparingly.

---

#### `memory_flush`
Promote all pending candidates, create an episode summary, and generate reflections in one call. The canonical "remember this conversation" operation.

```json
{}
```

```json
{ "title": "ny01 Rack Density Audit — March 2026" }
```

Call this when the user says "remember this", "save this conversation", or at the end of a significant workflow. Reports how many candidates were promoted, which episode was created, and how many reflections were generated.

---

### Forgetting

#### `memory_forget`
Forget or supersede a memory object by ID.

```json
{ "id": "sem_abc123" }
```

```json
{ "id": "ep_xyz789", "kind": "episodic" }
```

The record is marked as superseded rather than hard-deleted, preserving audit history.

---

## Common workflows

### Start of a complex workflow — surface relevant memory

```
1. memory_search  query="<topic or domain>"   → surface relevant past context
2. memory_search  query="user preferences for <task type>"  → surface preferences
3. [use results to inform approach before calling any other tools]
```

### End of a significant workflow — lock in what was learned

```
1. memory_flush  title="<descriptive session title>"
   → promotes candidates, creates episode, generates reflections
```

Or step by step:
```
1. memory_inspect              → check pending candidate count
2. memory_promote              → promote semantic facts
3. memory_episode_summarize    → create narrative summary
4. memory_reflect              → generate insights from episodes
```

### Explicitly capture a specific insight

```
1. memory_store_candidate  text="...", memoryTypeHint=semantic, confidence=0.9
2. memory_promote          → flush it to durable memory immediately
```

### Correct stale or wrong memory

```
1. memory_search  query="<topic>"              → find the old record
2. memory_get     id=<id>                       → read the full content
3. memory_forget  id=<id>                       → mark it superseded
4. memory_store_candidate  text="<correction>"  → store the correct fact
5. memory_promote                               → promote immediately
```

### Audit memory state

```
1. memory_inspect                        → counts and store overview
2. memory_search  query="<domain>"       → check what's actually stored
```

---

## Memory type guide

Use these hints when calling `memory_store_candidate`:

| Type | Use for |
|------|---------|
| `semantic` | Facts, preferences, constants, config values, domain knowledge that doesn't change often |
| `episodic` | What happened in a session — the narrative of a completed workflow, decisions made, outcomes |
| `reflective` | Patterns across sessions — "the user consistently prefers X when Y", "this class of operation tends to fail because Z" |

When in doubt, use `episodic` for workflow outcomes and `semantic` for preferences and facts.

---

## Tips

- `memory_flush` is the right default at the end of any significant session. It's a single call that handles the entire pipeline.
- `memory_search` before a workflow is as valuable as `memory_flush` after it — past context can prevent repeating mistakes.
- The passive `autoRecall` hook prepends memory automatically, but it's keyword-based. `memory_search` lets you do a targeted retrieval when you know what you're looking for.
- Pending candidates don't survive a process restart unprocessed. If you've captured important context, flush before the session ends.
- `memory_reflect` is conservative by default — it won't write a reflection unless there's sufficient episodic evidence. Don't call it after every session; call it periodically or after a series of related workflows.
- `memory_inspect` is a cheap diagnostic — use it any time you're unsure why recall isn't surfacing something expected.
