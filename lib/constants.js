export const PLUGIN_ID = "openclaw-memory-plus";
export const PLUGIN_NAME = "OpenClaw Memory Plus";
export const PLUGIN_VERSION = "1.0.0";
export const SCHEMA_VERSION = 1;
export const MEMORY_ROOT_NAME = "memory-plus";
export const MEMORY_KIND = "memory";

export const DEFAULT_POLICIES = {
  promotion: {
    semantic_min_confidence: 0.75,
    reflective_min_confidence: 0.85,
    reflective_min_evidence_count: 2
  },
  retrieval: {
    semantic_max_records: 8,
    episodic_max_records: 3,
    reflective_max_records: 2,
    identity_max_sections: 3
  },
  dedupe: {
    semantic_similarity_threshold: 0.9,
    episodic_similarity_threshold: 0.85
  },
  privacy: {
    allow_group_to_semantic: false,
    allow_group_to_reflective: false
  },
  maintenance: {
    create_episode_on_meaningful_session: true,
    auto_reflect: true,
    prune_low_confidence_candidates_after_days: 14
  }
};

export const SEMANTIC_FILES = [
  "semantic/preferences.yaml",
  "semantic/user-facts.yaml",
  "semantic/projects.yaml",
  "semantic/entities.yaml"
];

export const IDENTITY_FILES = [
  "identity/self.md",
  "identity/user.md",
  "identity/persona.md"
];

export const REFLECTIVE_OVERVIEW_FILES = [
  "reflective/patterns.md",
  "reflective/workflow-lessons.md"
];

export const REQUIRED_LAYOUT = [
  "audit",
  "candidates",
  "semantic",
  "semantic/facts",
  "episodic",
  "reflective",
  "reflective/distilled",
  "identity",
  "cache",
  "cache/embeddings",
  "cache/query",
  "locks"
];

export const LOCK_FILE_CONTENT = "# Managed by openclaw-memory-plus\n";
