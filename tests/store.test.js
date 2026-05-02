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
