import { parseFrontmatter } from "./frontmatter.js";

function check(condition, message, errors) {
  if (!condition) {
    errors.push(message);
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateCandidate(candidate) {
  const errors = [];
  check(isNonEmptyString(candidate?.id), "candidate.id is required", errors);
  check(isNonEmptyString(candidate?.timestamp), "candidate.timestamp is required", errors);
  check(isNonEmptyString(candidate?.session_key), "candidate.session_key is required", errors);
  check(isNonEmptyString(candidate?.source_type), "candidate.source_type is required", errors);
  check(
    isNonEmptyString(candidate?.memory_type_hint),
    "candidate.memory_type_hint is required",
    errors
  );
  check(isNonEmptyString(candidate?.text), "candidate.text is required", errors);
  check(typeof candidate?.confidence === "number", "candidate.confidence is required", errors);
  check(isNonEmptyString(candidate?.status), "candidate.status is required", errors);
  check(Array.isArray(candidate?.tags), "candidate.tags must be an array", errors);
  return errors;
}

export function validateSemanticRecord(record) {
  const errors = [];
  check(isNonEmptyString(record?.id), "semantic.id is required", errors);
  check(isNonEmptyString(record?.kind), "semantic.kind is required", errors);
  check(isNonEmptyString(record?.subject), "semantic.subject is required", errors);
  check(isNonEmptyString(record?.key), "semantic.key is required", errors);
  check(record?.value !== undefined, "semantic.value is required", errors);
  check(typeof record?.confidence === "number", "semantic.confidence is required", errors);
  check(record?.provenance && typeof record.provenance === "object", "semantic.provenance is required", errors);
  check(isNonEmptyString(record?.created_at), "semantic.created_at is required", errors);
  check(isNonEmptyString(record?.updated_at), "semantic.updated_at is required", errors);
  check(Array.isArray(record?.tags), "semantic.tags must be an array", errors);
  return errors;
}

export function validateSemanticFile(document) {
  const errors = [];
  check(Array.isArray(document?.records), "semantic document must contain records[]", errors);
  for (const record of document?.records || []) {
    errors.push(...validateSemanticRecord(record));
  }
  return errors;
}

export function validateAuditEvent(event) {
  const errors = [];
  check(isNonEmptyString(event?.id), "audit.id is required", errors);
  check(isNonEmptyString(event?.timestamp), "audit.timestamp is required", errors);
  check(isNonEmptyString(event?.type), "audit.type is required", errors);
  check(event?.details && typeof event.details === "object", "audit.details is required", errors);
  return errors;
}

export function validateIndex(index) {
  const errors = [];
  check(index?.schema_version === 1, "index.schema_version must be 1", errors);
  check(isNonEmptyString(index?.plugin_id), "index.plugin_id is required", errors);
  check(isNonEmptyString(index?.plugin_version), "index.plugin_version is required", errors);
  check(isNonEmptyString(index?.agent_id), "index.agent_id is required", errors);
  check(isNonEmptyString(index?.updated_at), "index.updated_at is required", errors);
  check(index?.semantic && typeof index.semantic === "object", "index.semantic is required", errors);
  check(index?.episodic && typeof index.episodic === "object", "index.episodic is required", errors);
  check(index?.reflective && typeof index.reflective === "object", "index.reflective is required", errors);
  check(index?.identity && typeof index.identity === "object", "index.identity is required", errors);
  return errors;
}

export function validatePolicies(policies) {
  const errors = [];
  check(policies?.promotion && typeof policies.promotion === "object", "policies.promotion is required", errors);
  check(policies?.retrieval && typeof policies.retrieval === "object", "policies.retrieval is required", errors);
  check(policies?.dedupe && typeof policies.dedupe === "object", "policies.dedupe is required", errors);
  check(policies?.privacy && typeof policies.privacy === "object", "policies.privacy is required", errors);
  check(policies?.maintenance && typeof policies.maintenance === "object", "policies.maintenance is required", errors);
  return errors;
}

export function validateEpisodeDocument(documentText) {
  const errors = [];
  const { attributes, body } = parseFrontmatter(documentText);
  check(isNonEmptyString(attributes?.id), "episode.id is required", errors);
  check(isNonEmptyString(attributes?.title), "episode.title is required", errors);
  check(isNonEmptyString(attributes?.timestamp), "episode.timestamp is required", errors);
  check(isNonEmptyString(attributes?.session_key), "episode.session_key is required", errors);
  check(Array.isArray(attributes?.topics), "episode.topics must be an array", errors);
  check(
    Array.isArray(attributes?.derived_semantic_candidates),
    "episode.derived_semantic_candidates must be an array",
    errors
  );
  check(
    Array.isArray(attributes?.derived_reflections),
    "episode.derived_reflections must be an array",
    errors
  );
  check(body.includes("## Summary"), "episode body must include a Summary section", errors);
  check(body.includes("## Decisions"), "episode body must include a Decisions section", errors);
  check(body.includes("## Constraints"), "episode body must include a Constraints section", errors);
  return errors;
}

export function validateReflectionDocument(documentText) {
  const errors = [];
  const { attributes, body } = parseFrontmatter(documentText);
  check(isNonEmptyString(attributes?.id), "reflection.id is required", errors);
  check(isNonEmptyString(attributes?.title), "reflection.title is required", errors);
  check(isNonEmptyString(attributes?.timestamp), "reflection.timestamp is required", errors);
  check(typeof attributes?.confidence === "number", "reflection.confidence is required", errors);
  check(Array.isArray(attributes?.evidence), "reflection.evidence must be an array", errors);
  check(body.includes("## Pattern"), "reflection body must include a Pattern section", errors);
  check(body.includes("## Evidence"), "reflection body must include an Evidence section", errors);
  check(body.includes("## When To Use"), "reflection body must include a When To Use section", errors);
  return errors;
}

export function assertValid(name, validator, value) {
  const errors = validator(value);
  if (errors.length) {
    throw new Error(`${name} validation failed: ${errors.join("; ")}`);
  }
}
