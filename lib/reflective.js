import fs from "node:fs/promises";

import { bullets, createStableId, excerpt, nowIso, overlapScore, recencyScore, safeFileStem } from "./utils.js";

const REFLECTION_PATTERNS = [
  {
    key: "upgrade_safe_integrations",
    title: "Prefer reversible, upgrade-safe integrations first",
    matcher: /upgrade-safe|minimally invasive|plugin-only|avoid.*fork|no core/i,
    whenToUse: [
      "When platform changes can be delivered through plugins or supported extension points.",
      "When upstream upgrade friction matters."
    ],
    whenNotToUse: [
      "When the user explicitly asks for a fork or invasive core patch."
    ]
  },
  {
    key: "continuity_breaks_are_costly",
    title: "Continuity failures create user friction",
    matcher: /re-explain|continuity|frustrat/i,
    whenToUse: [
      "When deciding whether a preference or project fact should be promoted into durable memory."
    ],
    whenNotToUse: [
      "When the detail is transient or not worth persisting."
    ]
  },
  {
    key: "concise_practical_responses",
    title: "Favor concise, practical technical responses",
    matcher: /concise|practical/i,
    whenToUse: [
      "When framing technical explanations or implementation tradeoffs."
    ],
    whenNotToUse: [
      "When the user explicitly asks for long-form detail."
    ]
  }
];

function buildReflectionBody(pattern, evidence, semanticRefs, episodeRefs, confidence) {
  return [
    "## Pattern",
    pattern.title,
    "",
    "## Evidence",
    bullets(evidence.map((item) => `${item.ref}: ${item.excerpt}`)),
    "",
    "## Confidence",
    `- ${confidence.toFixed(2)}`,
    "",
    "## When To Use",
    bullets(pattern.whenToUse),
    "",
    "## When Not To Use",
    bullets(pattern.whenNotToUse),
    "",
    "## Related Semantic Records",
    bullets(semanticRefs),
    "",
    "## Related Episodes",
    bullets(episodeRefs)
  ].join("\n");
}

async function refreshOverviews(store) {
  const reflections = [];
  for (const relativePath of await store.listReflectionPaths()) {
    reflections.push(await store.readReflection(relativePath));
  }

  const summaryLines =
    reflections.length === 0
      ? ["No distilled reflections promoted yet."]
      : reflections.map(
          (reflection) =>
            `${reflection.frontmatter.title} (${reflection.frontmatter.confidence.toFixed(2)})`
        );

  const patternsDoc = [
    "---",
    `id: reflective_patterns_overview`,
    `title: Reflective patterns overview`,
    `timestamp: ${nowIso()}`,
    "confidence: 0",
    "evidence: []",
    "---",
    "",
    "## Pattern",
    "Curated list of currently active reflective patterns.",
    "",
    "## Evidence",
    bullets(summaryLines),
    "",
    "## When To Use",
    "- Review this file before updating durable reflections."
  ].join("\n");

  const workflowDoc = [
    "---",
    `id: reflective_workflow_lessons_overview`,
    `title: Workflow lessons overview`,
    `timestamp: ${nowIso()}`,
    "confidence: 0",
    "evidence: []",
    "---",
    "",
    "## Pattern",
    "Curated workflow-level lessons derived from repeated episodes.",
    "",
    "## Evidence",
    bullets(summaryLines),
    "",
    "## When To Use",
    "- Review this file when choosing between architectural options."
  ].join("\n");

  await store.writeText("reflective/patterns.md", `${patternsDoc}\n`);
  await store.writeText("reflective/workflow-lessons.md", `${workflowDoc}\n`);
}

export async function generateReflections(store, policies, { force = false } = {}) {
  const episodes = [];
  for (const relativePath of await store.listEpisodePaths()) {
    episodes.push(await store.readEpisode(relativePath));
  }

  const semanticRecords = await store.readAllSemanticRecords();
  const outputs = [];

  for (const pattern of REFLECTION_PATTERNS) {
    const episodeEvidence = episodes
      .filter((episode) =>
        pattern.matcher.test(`${episode.frontmatter.title}\n${episode.frontmatter.topics.join(" ")}\n${episode.body}`)
      )
      .map((episode) => ({
        type: "episode",
        ref: episode.path,
        excerpt: excerpt(episode.frontmatter.title, 90)
      }));

    if (!force && episodeEvidence.length < policies.promotion.reflective_min_evidence_count) {
      continue;
    }

    const confidence = force
      ? policies.promotion.reflective_min_confidence
      : Math.min(0.99, 0.8 + episodeEvidence.length * 0.05);

    if (!force && confidence < policies.promotion.reflective_min_confidence) {
      continue;
    }

    const semanticRefs = semanticRecords
      .filter((record) =>
        pattern.matcher.test(`${record.key}\n${record.value}\n${record.tags.join(" ")}`)
      )
      .map((record) => record.id);
    const episodeRefs = episodeEvidence.map((item) => item.ref);
    const frontmatter = {
      id: createStableId("refl", pattern.key),
      title: pattern.title,
      timestamp: nowIso(),
      confidence,
      evidence: episodeEvidence.map((item) => item.ref)
    };
    const relativePath = `reflective/distilled/${safeFileStem(pattern.key)}.md`;
    const body = buildReflectionBody(pattern, episodeEvidence, semanticRefs, episodeRefs, confidence);
    await store.writeReflection(relativePath, frontmatter, body);
    outputs.push({ path: relativePath, frontmatter, body });
  }

  await refreshOverviews(store);
  return outputs;
}

export async function searchReflections(store, query, limit = 2) {
  const results = [];
  for (const relativePath of await store.listReflectionPaths()) {
    const reflection = await store.readReflection(relativePath);
    const score =
      overlapScore(query, `${reflection.frontmatter.title} ${reflection.body}`) * 0.75 +
      recencyScore(reflection.frontmatter.timestamp) * 0.1 +
      reflection.frontmatter.confidence * 0.15;
    if (score > 0) {
      results.push({ ...reflection, score });
    }
  }
  return results.sort((left, right) => right.score - left.score).slice(0, limit);
}

export async function deleteReflection(store, input) {
  for (const relativePath of await store.listReflectionPaths()) {
    const reflection = await store.readReflection(relativePath);
    if (reflection.path === input || reflection.frontmatter.id === input) {
      await fs.unlink(store.resolve(relativePath));
      await refreshOverviews(store);
      return { removed: true, path: relativePath };
    }
  }
  return { removed: false };
}
