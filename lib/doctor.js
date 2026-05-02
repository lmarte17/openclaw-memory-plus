import { IDENTITY_FILES, REFLECTIVE_OVERVIEW_FILES, SEMANTIC_FILES } from "./constants.js";

export async function runDoctor(store) {
  const errors = [];
  const warnings = [];

  try {
    await store.readIndex();
  } catch (error) {
    errors.push(`index.yaml: ${error.message}`);
  }

  try {
    await store.readPolicies();
  } catch (error) {
    errors.push(`policies.yaml: ${error.message}`);
  }

  for (const relativePath of SEMANTIC_FILES) {
    try {
      await store.readSemanticFile(relativePath);
    } catch (error) {
      errors.push(`${relativePath}: ${error.message}`);
    }
  }

  for (const relativePath of IDENTITY_FILES) {
    const content = await store.readText(relativePath, null);
    if (content === null) {
      errors.push(`${relativePath}: missing`);
    }
  }

  for (const relativePath of REFLECTIVE_OVERVIEW_FILES) {
    const content = await store.readText(relativePath, null);
    if (content === null) {
      warnings.push(`${relativePath}: missing overview document`);
    }
  }

  const candidates = await store.readCandidates();
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));

  for (const relativePath of await store.listEpisodePaths()) {
    const episode = await store.readEpisode(relativePath);
    for (const candidateId of episode.frontmatter.derived_semantic_candidates) {
      if (!candidateIds.has(candidateId)) {
        warnings.push(`${relativePath}: references missing candidate ${candidateId}`);
      }
    }
  }

  const index = await store.rebuildIndex();
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    counts: index.counts
  };
}
