import { recencyScore, overlapScore, safeFileStem, uniq, createStableId, nowIso } from "./utils.js";

const CATEGORY_BY_KIND = {
  preference: "semantic/preferences.yaml",
  project: "semantic/projects.yaml",
  entity: "semantic/entities.yaml",
  fact: "semantic/user-facts.yaml"
};

function inferKind(candidate) {
  const text = candidate.text.toLowerCase();
  if (candidate.tags.includes("preference")) return "preference";
  if (candidate.tags.includes("project") || /project|plugin|workspace|repo/.test(text)) return "project";
  if (/entity|named|person|service/.test(text)) return "entity";
  return "fact";
}

function inferSubject(candidate, kind) {
  if (kind === "project") return "project";
  if (kind === "entity") return "entity";
  return "user";
}

function inferKey(candidate, kind) {
  const text = candidate.text.toLowerCase();
  if (/concise/.test(text) && /practical/.test(text)) return "response_style";
  if (/upgrade-safe|minimally invasive|fork|plugin-only/.test(text)) return "integration_strategy";
  if (/continuity|re-explain/.test(text)) return "continuity_expectation";
  if (/treat this directory/.test(text)) return "openclaw_home_mapping";
  return `${kind}_${safeFileStem(candidate.text, "fact").replaceAll("-", "_")}`;
}

function inferValue(candidate, key) {
  const text = candidate.text.trim();
  if (key === "response_style") return "concise_practical";
  if (key === "integration_strategy") return "upgrade_safe_plugin_only";
  if (key === "continuity_expectation") return "avoid_repeated_reexplanation";
  if (key === "openclaw_home_mapping") return "current_directory_is_openclaw_home";
  return text;
}

function fileForRecord(record) {
  return CATEGORY_BY_KIND[record.kind] || "semantic/user-facts.yaml";
}

export function createSemanticRecordFromCandidate(candidate, provenanceSource = "candidate") {
  const kind = inferKind(candidate);
  const key = inferKey(candidate, kind);
  return {
    id: createStableId("sem", `${candidate.id}:${key}`),
    kind,
    subject: inferSubject(candidate, kind),
    key,
    value: inferValue(candidate, key),
    confidence: candidate.confidence,
    provenance: {
      source: provenanceSource,
      source_ref: candidate.id
    },
    created_at: nowIso(),
    updated_at: nowIso(),
    tags: uniq(candidate.tags)
  };
}

export function semanticSimilarity(left, right) {
  if (left.subject === right.subject && left.key === right.key) {
    return 1;
  }

  return (
    overlapScore(`${left.subject} ${left.key} ${left.value}`, `${right.subject} ${right.key} ${right.value}`) *
      0.8 +
    overlapScore(left.tags.join(" "), right.tags.join(" ")) * 0.2
  );
}

export async function upsertSemanticRecord(store, record, policies) {
  const relativePath = fileForRecord(record);
  const document = await store.readSemanticFile(relativePath);
  const existing = document.records.find(
    (candidate) =>
      semanticSimilarity(candidate, record) >= policies.dedupe.semantic_similarity_threshold
  );

  if (existing) {
    existing.value = typeof existing.value === "string" ? existing.value : record.value;
    existing.confidence = Math.max(existing.confidence, record.confidence);
    existing.updated_at = nowIso();
    existing.tags = uniq([...(existing.tags || []), ...(record.tags || [])]);
    if (record.provenance?.source_ref) {
      existing.provenance = record.provenance;
    }
    await store.writeSemanticFile(relativePath, document);
    return { action: "merged", record: existing, file: relativePath };
  }

  document.records.push(record);
  await store.writeSemanticFile(relativePath, document);
  return { action: "created", record, file: relativePath };
}

export async function searchSemantic(store, query, limit = 8) {
  const records = await store.readAllSemanticRecords();
  return records
    .map((record) => ({
      ...record,
      score:
        overlapScore(query, `${record.subject} ${record.key} ${record.value} ${record.tags.join(" ")}`) *
          0.65 +
        record.confidence * 0.2 +
        recencyScore(record.updated_at) * 0.15
    }))
    .filter((record) => record.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export async function deleteSemanticRecord(store, id) {
  const files = ["semantic/preferences.yaml", "semantic/user-facts.yaml", "semantic/projects.yaml", "semantic/entities.yaml"];
  for (const relativePath of files) {
    const document = await store.readSemanticFile(relativePath);
    const remaining = document.records.filter((record) => record.id !== id);
    if (remaining.length !== document.records.length) {
      await store.writeSemanticFile(relativePath, { records: remaining });
      return { removed: true, file: relativePath };
    }
  }
  return { removed: false };
}
