import { createStableId, nowIso } from "./utils.js";
import { createEpisodeFromCandidates } from "./episodic.js";
import { generateReflections } from "./reflective.js";
import { createSemanticRecordFromCandidate, upsertSemanticRecord } from "./semantic.js";
import { isNoiseSentence } from "./capture.js";

function isEpisodeCandidate(candidate) {
  return (
    candidate.memory_type_hint === "episodic" ||
    candidate.tags.includes("decision") ||
    candidate.tags.includes("architecture")
  );
}

function shouldPromoteSemantic(candidate, policies) {
  return (
    candidate.memory_type_hint === "semantic" &&
    (candidate.confidence >= policies.promotion.semantic_min_confidence ||
      candidate.tags.includes("explicit_memory"))
  );
}

function auditEvent(type, details) {
  return {
    id: createStableId("audit", `${type}:${JSON.stringify(details)}:${nowIso()}`),
    timestamp: nowIso(),
    type,
    details
  };
}

export async function promotePendingCandidates(
  store,
  policies,
  { sessionKey = null, summarize = true, reflect = false } = {}
) {
  const pending = await store.readCandidates({ status: "pending" });
  const candidates = sessionKey
    ? pending.filter((candidate) => candidate.session_key === sessionKey)
    : pending;

  const promotedIds = [];
  const semanticActions = [];
  const episodicCandidates = [];

  for (const candidate of candidates) {
    if (isNoiseSentence(candidate.text)) {
      continue;
    }

    if (shouldPromoteSemantic(candidate, policies)) {
      const record = createSemanticRecordFromCandidate(candidate);
      const action = await upsertSemanticRecord(store, record, policies);
      semanticActions.push(action);
      promotedIds.push(candidate.id);
      await store.appendAudit(
        auditEvent(action.action === "created" ? "promotion" : "merge", {
          candidate_id: candidate.id,
          semantic_id: action.record.id,
          target_file: action.file
        })
      );
    }

    if (isEpisodeCandidate(candidate)) {
      episodicCandidates.push(candidate);
      promotedIds.push(candidate.id);
    }
  }

  let episode = null;
  if (summarize && policies.maintenance.create_episode_on_meaningful_session && episodicCandidates.length) {
    episode = await createEpisodeFromCandidates(store, {
      candidates: episodicCandidates,
      sessionKey: sessionKey || episodicCandidates[0].session_key
    });
    if (episode) {
      await store.appendAudit(
        auditEvent("episode_generation", {
          episode_path: episode.path,
          candidate_ids: episodicCandidates.map((candidate) => candidate.id)
        })
      );
    }
  }

  if (promotedIds.length) {
    await store.updateCandidateStatuses([...new Set(promotedIds)], "promoted");
  }

  let reflections = [];
  if (reflect && policies.maintenance.auto_reflect) {
    reflections = await generateReflections(store, policies);
    for (const reflection of reflections) {
      await store.appendAudit(
        auditEvent("reflection_generation", {
          reflection_path: reflection.path,
          reflection_id: reflection.frontmatter.id
        })
      );
    }
  }

  const index = await store.rebuildIndex();
  return {
    promoted_candidate_ids: [...new Set(promotedIds)],
    semantic_actions: semanticActions,
    episode,
    reflections,
    index
  };
}
