import fs from "node:fs/promises";

import { bullets, createStableId, excerpt, nowIso, overlapScore, recencyScore, safeFileStem, uniq } from "./utils.js";
import { isNoiseSentence } from "./capture.js";

function deriveTopics(candidates) {
  const topics = [];
  for (const candidate of candidates) {
    for (const tag of candidate.tags || []) {
      if (!["explicit_memory"].includes(tag)) {
        topics.push(tag);
      }
    }
  }
  return uniq(topics).slice(0, 5);
}

function deriveTitle(candidates, fallback = "Memory episode") {
  const preferred =
    candidates.find((candidate) => candidate.tags.includes("decision")) ||
    candidates.find((candidate) => candidate.tags.includes("architecture")) ||
    candidates[0];

  return preferred ? excerpt(preferred.text, 70) : fallback;
}

function linesFromCandidates(candidates, predicate) {
  return uniq(
    candidates
      .filter(predicate)
      .map((candidate) => candidate.text.trim())
      .slice(0, 5)
  );
}

function buildEpisodeBody(candidates) {
  const summary = uniq(candidates.map((candidate) => candidate.text.trim())).slice(0, 3);
  const decisions = linesFromCandidates(
    candidates,
    (candidate) => candidate.tags.includes("decision") || candidate.tags.includes("architecture")
  );
  const constraints = linesFromCandidates(
    candidates,
    (candidate) =>
      candidate.tags.includes("architecture") ||
      candidate.tags.includes("explicit_memory") ||
      /must|should|avoid|treat this directory/i.test(candidate.text)
  );
  const preferences = linesFromCandidates(
    candidates,
    (candidate) => candidate.tags.includes("preference") || candidate.tags.includes("continuity")
  );
  const implications = linesFromCandidates(
    candidates,
    (candidate) => candidate.tags.includes("project") || candidate.tags.includes("architecture")
  );

  return [
    "## Summary",
    bullets(summary),
    "",
    "## Decisions",
    bullets(decisions),
    "",
    "## Constraints",
    bullets(constraints),
    "",
    "## Open Questions",
    "- None captured in this episode.",
    "",
    "## Important User Preferences Observed",
    bullets(preferences),
    "",
    "## Follow-On Implications",
    bullets(implications)
  ].join("\n");
}

export async function createEpisodeFromCandidates(store, { candidates, title, sessionKey }) {
  const cleanCandidates = candidates.filter((candidate) => !isNoiseSentence(candidate.text));
  if (!cleanCandidates.length) {
    return null;
  }

  const timestamp = cleanCandidates.at(-1)?.timestamp || nowIso();
  const episodeTitle = title || deriveTitle(cleanCandidates);
  const frontmatter = {
    id: createStableId("ep", `${sessionKey}:${episodeTitle}:${timestamp}`),
    title: episodeTitle,
    timestamp,
    session_key: sessionKey || cleanCandidates[0]?.session_key || `agent:${store.agentId}:${store.agentId}`,
    topics: deriveTopics(cleanCandidates),
    derived_semantic_candidates: cleanCandidates
      .filter((candidate) => candidate.memory_type_hint === "semantic")
      .map((candidate) => candidate.id),
    derived_reflections: []
  };

  const fileName = `${timestamp.slice(0, 10)}-${safeFileStem(episodeTitle)}.md`;
  const relativePath = `episodic/${timestamp.slice(0, 4)}/${fileName}`;
  const body = buildEpisodeBody(cleanCandidates);
  await store.writeEpisode(relativePath, frontmatter, body);
  return { path: relativePath, frontmatter, body };
}

export async function searchEpisodes(store, query, limit = 3) {
  const episodes = [];
  for (const relativePath of await store.listEpisodePaths()) {
    const episode = await store.readEpisode(relativePath);
    const corpus = `${episode.frontmatter.title} ${episode.frontmatter.topics.join(" ")} ${episode.body}`;
    const score = overlapScore(query, corpus) * 0.7 + recencyScore(episode.frontmatter.timestamp) * 0.3;
    if (score > 0) {
      episodes.push({
        ...episode,
        summary: excerpt(episode.body.replaceAll("#", ""), 180),
        score
      });
    }
  }

  return episodes.sort((left, right) => right.score - left.score).slice(0, limit);
}

export async function deleteEpisode(store, input) {
  for (const relativePath of await store.listEpisodePaths()) {
    const episode = await store.readEpisode(relativePath);
    if (episode.path === input || episode.frontmatter.id === input) {
      await fs.unlink(store.resolve(relativePath));
      return { removed: true, path: relativePath };
    }
  }
  return { removed: false };
}
