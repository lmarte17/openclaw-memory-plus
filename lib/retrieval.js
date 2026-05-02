import { IDENTITY_FILES } from "./constants.js";
import { searchEpisodes } from "./episodic.js";
import { searchReflections } from "./reflective.js";
import { searchSemantic } from "./semantic.js";
import { excerpt } from "./utils.js";

async function readIdentitySections(store, maxSections) {
  const sections = [];
  for (const relativePath of IDENTITY_FILES.slice(0, maxSections)) {
    const content = await store.readText(relativePath, "");
    if (!content.trim()) continue;
    sections.push({
      path: relativePath,
      text: excerpt(content.replace(/^#.*$/m, "").trim(), 220)
    });
  }
  return sections;
}

function formatRecallFrame({ identity, semantic, episodes, reflections }) {
  const parts = [
    "The following is structured long-term memory context.",
    "Use it silently to inform your response. Do not proactively bring it up unless the user is already on that topic."
  ];

  if (identity.length) {
    parts.push(
      "## Identity",
      identity.map((item) => `- ${item.text}`).join("\n")
    );
  }

  if (semantic.length) {
    parts.push(
      "## Semantic Memory",
      semantic.map((item) => `- ${item.key}: ${item.value}`).join("\n")
    );
  }

  if (episodes.length) {
    parts.push(
      "## Relevant Episodes",
      episodes.map((item) => `- ${item.frontmatter.timestamp.slice(0, 10)}: ${item.frontmatter.title}`).join("\n")
    );
  }

  if (reflections.length) {
    parts.push(
      "## Relevant Reflection",
      reflections.map((item) => `- ${item.frontmatter.title}`).join("\n")
    );
  }

  return `${parts.join("\n\n")}\n`;
}

export async function searchMemory(store, policies, query) {
  const [identity, semantic, episodes, reflections] = await Promise.all([
    readIdentitySections(store, policies.retrieval.identity_max_sections),
    searchSemantic(store, query, policies.retrieval.semantic_max_records),
    searchEpisodes(store, query, policies.retrieval.episodic_max_records),
    searchReflections(store, query, policies.retrieval.reflective_max_records)
  ]);

  return {
    identity,
    semantic,
    episodes,
    reflections
  };
}

export async function buildRecallFrame(store, policies, query) {
  const results = await searchMemory(store, policies, query);
  const hasRecall =
    results.identity.length ||
    results.semantic.length ||
    results.episodes.length ||
    results.reflections.length;

  return {
    ...results,
    frame: hasRecall ? formatRecallFrame(results) : null
  };
}
