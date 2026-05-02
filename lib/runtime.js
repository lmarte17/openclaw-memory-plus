import { resolveAgentId, resolveOpenClawHome, resolveStoreRoot } from "./config.js";
import { buildCandidatesFromText, buildExplicitCandidate } from "./capture.js";
import { createClassifier } from "./classifier.js";
import { runDoctor } from "./doctor.js";
import { createEpisodeFromCandidates, deleteEpisode } from "./episodic.js";
import { promotePendingCandidates } from "./promotion.js";
import { generateReflections, deleteReflection } from "./reflective.js";
import { buildRecallFrame, searchMemory } from "./retrieval.js";
import { deleteSemanticRecord } from "./semantic.js";
import { collectStrings, createStableId, nowIso } from "./utils.js";
import { MemoryPlusStore } from "./store.js";

function sessionKeyFor(agentId, ctx = {}) {
  return ctx.sessionKey || `agent:${agentId}:${agentId}`;
}

function auditEvent(type, details) {
  return {
    id: createStableId("audit", `${type}:${JSON.stringify(details)}:${nowIso()}`),
    timestamp: nowIso(),
    type,
    details
  };
}

export function createMemoryRuntime(api, config) {
  const classifier = config.classifier?.enabled !== false
    ? createClassifier(config.classifier || {})
    : null;

  function logger(level, message, extra = null) {
    if (!config.debug && level === "debug") return;
    const sink = api?.logger?.[level] || api?.logger?.info || console.log;
    sink.call(api?.logger || console, message, extra || undefined);
  }

  async function contextToStore(ctx = {}) {
    const homeDir = resolveOpenClawHome(api);
    const agentId = ctx.agentId || resolveAgentId(api, ctx, config);
    const storeRoot = resolveStoreRoot(homeDir, agentId, config);
    const store = new MemoryPlusStore({ homeDir, agentId, storeRoot });
    await store.ensureLayout();
    return { homeDir, agentId, store };
  }

  async function appendAudit(store, type, details) {
    await store.appendAudit(auditEvent(type, details));
  }

  return {
    async init(ctx = {}) {
      const { store } = await contextToStore(ctx);
      const index = await store.rebuildIndex();
      await appendAudit(store, "rebuild", { reason: "init" });
      return index;
    },

    async status(ctx = {}) {
      const { store } = await contextToStore(ctx);
      return store.readIndex();
    },

    async inspect(ctx = {}) {
      const { store } = await contextToStore(ctx);
      const [index, policies] = await Promise.all([store.readIndex(), store.readPolicies()]);
      return { index, policies };
    },

    async search(query, ctx = {}) {
      const { store } = await contextToStore(ctx);
      const policies = await store.readPolicies();
      return searchMemory(store, policies, query);
    },

    async get({ id = null, path = null }, ctx = {}) {
      const { store } = await contextToStore(ctx);
      if (path) {
        return {
          type: "file",
          path,
          content: await store.readText(path, "")
        };
      }

      const [semanticRecords, candidates, auditEvents] = await Promise.all([
        store.readAllSemanticRecords(),
        store.readCandidates(),
        store.readAuditEvents()
      ]);

      const semanticRecord = semanticRecords.find((record) => record.id === id);
      if (semanticRecord) return { type: "semantic", record: semanticRecord };

      const candidate = candidates.find((record) => record.id === id);
      if (candidate) return { type: "candidate", record: candidate };

      for (const relativePath of await store.listEpisodePaths()) {
        const episode = await store.readEpisode(relativePath);
        if (episode.frontmatter.id === id) return { type: "episode", record: episode };
      }

      for (const relativePath of await store.listReflectionPaths()) {
        const reflection = await store.readReflection(relativePath);
        if (reflection.frontmatter.id === id) return { type: "reflection", record: reflection };
      }

      const auditEventRecord = auditEvents.find((record) => record.id === id);
      if (auditEventRecord) return { type: "audit", record: auditEventRecord };

      return null;
    },

    async captureText(text, ctx = {}, options = {}) {
      const { store, agentId } = await contextToStore(ctx);
      const timestamp = options.timestamp || nowIso();
      const sessionKey = options.sessionKey || sessionKeyFor(agentId, ctx);
      const sourceType = options.sourceType || "turn";
      const candidates = await buildCandidatesFromText(text, {
        agentId,
        sessionKey,
        sourceType,
        timestamp,
        classify: classifier ? classifier.classify.bind(classifier) : null
      });

      const paths = [];
      for (const candidate of candidates) {
        paths.push(await store.appendCandidate(candidate));
        await appendAudit(store, "candidate_creation", {
          candidate_id: candidate.id,
          target_file: paths.at(-1)
        });
      }
      await store.rebuildIndex();
      return { count: candidates.length, candidates, paths };
    },

    async storeCandidate(input, ctx = {}) {
      const { store, agentId } = await contextToStore(ctx);
      const candidate = buildExplicitCandidate({
        agentId,
        sessionKey: input.sessionKey || sessionKeyFor(agentId, ctx),
        sourceType: input.sourceType || "tool",
        timestamp: input.timestamp || nowIso(),
        memoryTypeHint: input.memoryTypeHint || "semantic",
        text: input.text,
        confidence: input.confidence,
        tags: input.tags || []
      });
      const filePath = await store.appendCandidate(candidate);
      await appendAudit(store, "candidate_creation", {
        candidate_id: candidate.id,
        target_file: filePath
      });
      await store.rebuildIndex();
      return candidate;
    },

    async promote(ctx = {}, options = {}) {
      const { store } = await contextToStore(ctx);
      const policies = await store.readPolicies();
      return promotePendingCandidates(store, policies, {
        sessionKey: options.sessionKey || null,
        summarize: options.summarize !== false,
        reflect: options.reflect === true
      });
    },

    async summarize(ctx = {}, options = {}) {
      const { store } = await contextToStore(ctx);
      const pending = await store.readCandidates({ status: "pending" });
      const relevant = options.sessionKey
        ? pending.filter((candidate) => candidate.session_key === options.sessionKey)
        : pending.filter(
            (candidate) =>
              candidate.memory_type_hint === "episodic" ||
              candidate.tags.includes("decision") ||
              candidate.tags.includes("architecture")
          );
      const episode = await createEpisodeFromCandidates(store, {
        candidates: relevant,
        title: options.title,
        sessionKey: options.sessionKey
      });
      if (episode) {
        await store.updateCandidateStatuses(relevant.map((candidate) => candidate.id), "promoted");
        await appendAudit(store, "episode_generation", {
          episode_path: episode.path,
          candidate_ids: relevant.map((candidate) => candidate.id)
        });
        await store.rebuildIndex();
      }
      return episode;
    },

    async reflect(ctx = {}, options = {}) {
      const { store } = await contextToStore(ctx);
      const policies = await store.readPolicies();
      const reflections = await generateReflections(store, policies, {
        force: options.force === true
      });
      await store.rebuildIndex();
      return reflections;
    },

    async forget(input, ctx = {}) {
      const { store } = await contextToStore(ctx);
      const kind = input.kind || "auto";
      let result = null;

      if (kind === "candidate" || kind === "auto") {
        const candidates = await store.readCandidates();
        if (candidates.some((candidate) => candidate.id === input.id)) {
          await store.updateCandidateStatuses([input.id], "forgotten");
          result = { removed: true, kind: "candidate" };
        }
      }

      if (!result && (kind === "semantic" || kind === "auto")) {
        const semantic = await deleteSemanticRecord(store, input.id);
        if (semantic.removed) {
          result = { removed: true, kind: "semantic", ...semantic };
        }
      }

      if (!result && (kind === "episode" || kind === "auto")) {
        const episode = await deleteEpisode(store, input.id);
        if (episode.removed) {
          result = { removed: true, kind: "episode", ...episode };
        }
      }

      if (!result && (kind === "reflection" || kind === "auto")) {
        const reflection = await deleteReflection(store, input.id);
        if (reflection.removed) {
          result = { removed: true, kind: "reflection", ...reflection };
        }
      }

      if (result?.removed) {
        await appendAudit(store, "forget", {
          id: input.id,
          kind: result.kind
        });
        await store.rebuildIndex();
      }

      return result || { removed: false };
    },

    async rebuildIndex(ctx = {}) {
      const { store } = await contextToStore(ctx);
      const index = await store.rebuildIndex();
      await appendAudit(store, "rebuild", { reason: "manual" });
      return index;
    },

    async doctor(ctx = {}) {
      const { store } = await contextToStore(ctx);
      return runDoctor(store);
    },

    async buildRecall(prompt, ctx = {}) {
      const { store } = await contextToStore(ctx);
      const policies = await store.readPolicies();
      return buildRecallFrame(store, policies, prompt);
    },

    extractRelevantText(event = {}, ctx = {}) {
      if (event?.toolName) {
        const parts = collectStrings([
          `tool:${event.toolName}`,
          event.error ? `error:${event.error}` : null,
          event.result
        ]);
        return [...new Set(parts)].join("\n");
      }

      // Scope capture to the user's message and the assistant's direct reply only.
      // Avoid event.output / event.messages / event.input — they include reasoning
      // blocks, tool call internals, and other noise that should not be captured.
      const parts = collectStrings([
        ctx?.lastUserMessage,
        ctx?.lastAssistantMessage
      ]);
      return [...new Set(parts)].join("\n");
    },

    logger
  };
}
