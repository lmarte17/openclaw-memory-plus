import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { MemoryPlusStore } from "../lib/store.js";

test("store initializes the required layout and index", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-plus-store-"));
  const store = new MemoryPlusStore({
    homeDir: root,
    agentId: "main",
    storeRoot: path.join(root, "agents", "main", "memory-plus")
  });

  await store.ensureLayout();
  const index = await store.rebuildIndex();

  assert.equal(index.agent_id, "main");
  assert.equal(index.schema_version, 1);
  assert.equal(index.semantic.counts.total, 0);
});

test("store reads observer-compatible daily JSONL candidates", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-plus-candidates-"));
  const store = new MemoryPlusStore({
    homeDir: root,
    agentId: "main",
    storeRoot: path.join(root, "agents", "main", "memory-plus")
  });

  await store.ensureLayout();
  await store.appendJsonl("candidates/2026/2026-05-02.jsonl", {
    id: "fac_session_000",
    timestamp: "2026-05-02T12:00:00.000Z",
    session_key: "observer:session",
    source_type: "observer",
    memory_type_hint: "semantic",
    text: "{\"key\":\"preferred_memory_format\",\"value\":\"daily JSONL\"}",
    confidence: 0.91,
    status: "pending",
    tags: ["fact_hunter", "preference"]
  });

  const candidates = await store.readCandidates({ status: "pending" });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].source_type, "observer");
  assert.equal(candidates[0]._file, "candidates/2026/2026-05-02.jsonl");
});
