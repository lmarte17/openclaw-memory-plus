import { createStableId, normalizeText, nowIso, splitSentences, uniq } from "./utils.js";

const NOISE_PATTERNS = [
  /encrypted_content/i,
  /"type"\s*:\s*"reasoning"/i,
  /\bold_string\b/i,
  /\bnew_string\b/i,
  /\bapplypatch\b/i,
  /\*\*\*\s*begin patch/i,
  /\*\*\*\s*end patch/i,
  /^@@\s/m
];

function looksLikeEncodedBlob(text) {
  const chunks = String(text || "").match(/[A-Za-z0-9+/=_-]{120,}/g) || [];
  return chunks.length > 0;
}

export function isNoiseSentence(sentence) {
  const text = String(sentence || "");
  if (!text.trim()) return true;
  if (NOISE_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (looksLikeEncodedBlob(text)) return true;
  return false;
}

export function inferTags(text) {
  const tags = [];
  const normalized = normalizeText(text);

  if (
    /(prefer|preference|likes|dislikes|wants|avoid|tone|style|response|concise|practical)/.test(
      normalized
    )
  ) {
    tags.push("preference");
  }
  if (
    /(project|build|building|plugin|architecture|upgrade-safe|minimally invasive|fork|core)/.test(
      normalized
    )
  ) {
    tags.push("architecture");
  }
  if (/(decision|decided|choose|chosen|must|should|will)/.test(normalized)) {
    tags.push("decision");
  }
  if (/(remember this|remember that|please remember|treat this directory)/.test(normalized)) {
    tags.push("explicit_memory");
  }
  if (/(frustrat|re-explain|continuity)/.test(normalized)) {
    tags.push("continuity");
  }
  if (/(project|workspace|repo|agent)/.test(normalized)) {
    tags.push("project");
  }

  return uniq(tags);
}

export function inferHint(tags) {
  if (
    tags.includes("preference") ||
    tags.includes("continuity") ||
    tags.includes("explicit_memory")
  ) {
    return "semantic";
  }
  if (tags.includes("decision") || tags.includes("architecture")) {
    return "episodic";
  }
  return "semantic";
}

export function inferConfidence(tags) {
  if (tags.includes("explicit_memory")) return 0.96;
  if (tags.includes("preference")) return 0.86;
  if (tags.includes("decision")) return 0.84;
  if (tags.includes("architecture")) return 0.8;
  return 0.72;
}

export function qualifySentence(sentence) {
  const normalized = normalizeText(sentence);
  if (normalized.length < 18) return false;
  if (isNoiseSentence(sentence)) return false;
  return (
    /(prefer|want|need|avoid|remember|decision|decided|architecture|upgrade-safe|continuity|project|plugin|fork|core)/.test(
      normalized
    ) || normalized.length > 120
  );
}

export function buildExplicitCandidate({
  agentId = "main",
  sessionKey = `agent:${agentId}:${agentId}`,
  sourceType = "tool",
  timestamp = nowIso(),
  memoryTypeHint = "semantic",
  text,
  confidence = 0.95,
  tags = []
}) {
  const normalizedTags = uniq(tags.length ? tags : inferTags(text));
  return {
    id: createStableId("cand", `${timestamp}:${text}`),
    timestamp,
    session_key: sessionKey,
    source_type: sourceType,
    memory_type_hint: memoryTypeHint,
    text: text.trim(),
    confidence,
    status: "pending",
    tags: normalizedTags
  };
}

export async function buildCandidatesFromText(text, options = {}) {
  const {
    agentId = "main",
    sessionKey = `agent:${agentId}:${agentId}`,
    sourceType = "turn",
    timestamp = nowIso(),
    classify = null
  } = options;

  // Split and strip noise first (always, regardless of classify path)
  const sentences = splitSentences(text).filter((s) => !isNoiseSentence(s));
  if (!sentences.length) return [];

  // LLM classifier path
  if (typeof classify === "function") {
    const classified = await classify(sentences);
    return classified.map(({ text: sentText, confidence, tags, hint }) =>
      buildExplicitCandidate({
        agentId,
        sessionKey,
        sourceType,
        timestamp,
        memoryTypeHint: hint || inferHint(tags || []),
        text: sentText,
        confidence: confidence ?? 0.75,
        tags: tags || []
      })
    );
  }

  // Keyword fallback path
  const candidates = [];
  const seen = new Set();

  for (const sentence of sentences) {
    if (!qualifySentence(sentence)) continue;
    const normalized = normalizeText(sentence);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    const tags = inferTags(sentence);
    candidates.push(
      buildExplicitCandidate({
        agentId,
        sessionKey,
        sourceType,
        timestamp,
        memoryTypeHint: inferHint(tags),
        text: sentence,
        confidence: inferConfidence(tags),
        tags
      })
    );
  }

  return candidates;
}
