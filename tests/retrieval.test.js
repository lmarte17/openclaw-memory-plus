import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { MemoryPlusStore } from "../lib/store.js";
import { buildExplicitCandidate } from "../lib/capture.js";
import { createSemanticRecordFromCandidate, upsertSemanticRecord } from "../lib/semantic.js";
import { DEFAULT_POLICIES } from "../lib/constants.js";
import { searchMemory } from "../lib/retrieval.js";

test("semantic search returns promoted preference records", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-plus-search-"));
  const store = new MemoryPlusStore({
    homeDir: root,
    agentId: "main",
    storeRoot: path.join(root, "agents", "main", "memory-plus")
  });

  await store.ensureLayout();

  const candidate = buildExplicitCandidate({
    text: "User prefers concise practical technical answers.",
    tags: ["preference"],
    timestamp: "2026-03-21T00:00:00Z"
  });
  const record = createSemanticRecordFromCandidate(candidate);
  await upsertSemanticRecord(store, record, DEFAULT_POLICIES);

  const results = await searchMemory(store, DEFAULT_POLICIES, "concise practical");
  assert.equal(results.semantic.length, 1);
  assert.equal(results.semantic[0].key, "response_style");
});
