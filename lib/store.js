import fs from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_POLICIES,
  IDENTITY_FILES,
  LOCK_FILE_CONTENT,
  PLUGIN_ID,
  PLUGIN_VERSION,
  REFLECTIVE_OVERVIEW_FILES,
  REQUIRED_LAYOUT,
  SCHEMA_VERSION,
  SEMANTIC_FILES
} from "./constants.js";
import { formatFrontmatter, parseFrontmatter } from "./frontmatter.js";
import {
  assertValid,
  validateAuditEvent,
  validateCandidate,
  validateEpisodeDocument,
  validateIndex,
  validatePolicies,
  validateReflectionDocument,
  validateSemanticFile
} from "./schemas.js";
import { createStableId, normalizeText, nowIso } from "./utils.js";
import { parseYaml, serializeYaml } from "./yaml.js";

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursive(rootPath, extensionFilter = null) {
  if (!(await exists(rootPath))) {
    return [];
  }

  const output = [];
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      output.push(...(await listFilesRecursive(entryPath, extensionFilter)));
      continue;
    }
    if (!extensionFilter || entry.name.endsWith(extensionFilter)) {
      output.push(entryPath);
    }
  }
  return output.sort();
}

export class MemoryPlusStore {
  constructor({ homeDir, agentId, storeRoot }) {
    this.homeDir = homeDir;
    this.agentId = agentId;
    this.root = storeRoot;
  }

  resolve(relativePath) {
    return path.join(this.root, relativePath);
  }

  relative(absolutePath) {
    return path.relative(this.root, absolutePath).replaceAll(path.sep, "/");
  }

  async ensureLayout() {
    await fs.mkdir(this.root, { recursive: true });

    for (const relativePath of REQUIRED_LAYOUT) {
      await fs.mkdir(this.resolve(relativePath), { recursive: true });
    }

    const lockPath = this.resolve("locks/memory.lock");
    if (!(await exists(lockPath))) {
      await fs.writeFile(lockPath, LOCK_FILE_CONTENT, "utf8");
    }

    if (!(await exists(this.resolve("policies.yaml")))) {
      await this.writeYaml("policies.yaml", DEFAULT_POLICIES);
    }

    if (!(await exists(this.resolve("index.yaml")))) {
      const index = this.buildIndexSkeleton(nowIso());
      await this.writeYaml("index.yaml", index);
    }

    for (const relativePath of SEMANTIC_FILES) {
      if (!(await exists(this.resolve(relativePath)))) {
        await this.writeYaml(relativePath, { records: [] });
      }
    }

    for (const relativePath of IDENTITY_FILES) {
      if (!(await exists(this.resolve(relativePath)))) {
        await this.writeText(relativePath, `# ${path.basename(relativePath)}\n\nPending curation.\n`);
      }
    }

    for (const relativePath of REFLECTIVE_OVERVIEW_FILES) {
      if (!(await exists(this.resolve(relativePath)))) {
        await this.writeText(
          relativePath,
          `---\nid: ${createStableId("reflection_overview", relativePath)}\ntitle: ${path.basename(
            relativePath,
            ".md"
          )}\ntimestamp: ${nowIso()}\nconfidence: 0\nevidence: []\n---\n\n## Pattern\n\nNo distilled reflections yet.\n\n## Evidence\n\n- None yet.\n\n## When To Use\n\n- Use this file as a curated overview once reflections exist.\n`
        );
      }
    }

    if (!(await exists(this.resolve("audit/events.jsonl")))) {
      await fs.writeFile(this.resolve("audit/events.jsonl"), "", "utf8");
    }
  }

  buildIndexSkeleton(timestamp) {
    return {
      schema_version: SCHEMA_VERSION,
      plugin_id: PLUGIN_ID,
      plugin_version: PLUGIN_VERSION,
      agent_id: this.agentId,
      created_at: timestamp,
      updated_at: timestamp,
      semantic: {
        files: [...SEMANTIC_FILES],
        counts: {
          total: 0,
          preferences: 0,
          user_facts: 0,
          projects: 0,
          entities: 0,
          fact_files: 0
        }
      },
      episodic: {
        years: {}
      },
      reflective: {
        files: [...REFLECTIVE_OVERVIEW_FILES]
      },
      identity: {
        files: [...IDENTITY_FILES]
      },
      candidates: {
        latest: null
      },
      audit: {
        latest: "audit/events.jsonl"
      },
      cache: {
        embeddings_entries: 0,
        query_entries: 0
      },
      counts: {
        semantic_records: 0,
        episode_documents: 0,
        reflection_documents: 0,
        candidate_records: 0
      }
    };
  }

  async readText(relativePath, fallback = null) {
    const targetPath = this.resolve(relativePath);
    if (!(await exists(targetPath))) {
      return fallback;
    }
    return fs.readFile(targetPath, "utf8");
  }

  async writeText(relativePath, contents) {
    const targetPath = this.resolve(relativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, contents, "utf8");
  }

  async readYaml(relativePath, fallback = null) {
    const raw = await this.readText(relativePath);
    if (raw === null) {
      return fallback;
    }
    return parseYaml(raw);
  }

  async writeYaml(relativePath, value) {
    await this.writeText(relativePath, serializeYaml(value));
  }

  async appendJsonl(relativePath, value) {
    const targetPath = this.resolve(relativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.appendFile(targetPath, `${JSON.stringify(value)}\n`, "utf8");
  }

  async readJsonl(relativePath) {
    const raw = await this.readText(relativePath, "");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  async readIndex() {
    const index = await this.readYaml("index.yaml", this.buildIndexSkeleton(nowIso()));
    assertValid("index", validateIndex, index);
    return index;
  }

  async writeIndex(index) {
    assertValid("index", validateIndex, index);
    await this.writeYaml("index.yaml", index);
  }

  async readPolicies() {
    const policies = await this.readYaml("policies.yaml", DEFAULT_POLICIES);
    assertValid("policies", validatePolicies, policies);
    return policies;
  }

  async writePolicies(policies) {
    assertValid("policies", validatePolicies, policies);
    await this.writeYaml("policies.yaml", policies);
  }

  async readSemanticFile(relativePath) {
    const document = await this.readYaml(relativePath, { records: [] });
    assertValid(relativePath, validateSemanticFile, document);
    return document;
  }

  async writeSemanticFile(relativePath, document) {
    assertValid(relativePath, validateSemanticFile, document);
    await this.writeYaml(relativePath, document);
  }

  async readAllSemanticRecords() {
    const records = [];
    for (const relativePath of SEMANTIC_FILES) {
      const document = await this.readSemanticFile(relativePath);
      for (const record of document.records) {
        records.push({ ...record, _file: relativePath });
      }
    }

    const factPaths = await listFilesRecursive(this.resolve("semantic/facts"), ".yaml");
    for (const absolutePath of factPaths) {
      const relativePath = this.relative(absolutePath);
      const document = await this.readSemanticFile(relativePath);
      for (const record of document.records) {
        records.push({ ...record, _file: relativePath });
      }
    }

    return records;
  }

  async listEpisodePaths() {
    const absolutePaths = await listFilesRecursive(this.resolve("episodic"), ".md");
    return absolutePaths.map((absolutePath) => this.relative(absolutePath));
  }

  async readEpisode(relativePath) {
    const raw = await this.readText(relativePath, "");
    assertValid(relativePath, validateEpisodeDocument, raw);
    const { attributes, body } = parseFrontmatter(raw);
    return { path: relativePath, frontmatter: attributes, body };
  }

  async writeEpisode(relativePath, frontmatter, body) {
    const document = formatFrontmatter(frontmatter, body);
    assertValid(relativePath, validateEpisodeDocument, document);
    await this.writeText(relativePath, document);
  }

  async listReflectionPaths() {
    const absolutePaths = await listFilesRecursive(this.resolve("reflective/distilled"), ".md");
    return absolutePaths.map((absolutePath) => this.relative(absolutePath));
  }

  async readReflection(relativePath) {
    const raw = await this.readText(relativePath, "");
    assertValid(relativePath, validateReflectionDocument, raw);
    const { attributes, body } = parseFrontmatter(raw);
    return { path: relativePath, frontmatter: attributes, body };
  }

  async writeReflection(relativePath, frontmatter, body) {
    const document = formatFrontmatter(frontmatter, body);
    assertValid(relativePath, validateReflectionDocument, document);
    await this.writeText(relativePath, document);
  }

  async listCandidatePaths() {
    const absolutePaths = await listFilesRecursive(this.resolve("candidates"), ".jsonl");
    return absolutePaths.map((absolutePath) => this.relative(absolutePath));
  }

  async readCandidates({ status = null } = {}) {
    const records = [];
    for (const relativePath of await this.listCandidatePaths()) {
      const fileRecords = await this.readJsonl(relativePath);
      for (const record of fileRecords) {
        assertValid("candidate", validateCandidate, record);
        if (!status || record.status === status) {
          records.push({ ...record, _file: relativePath });
        }
      }
    }
    return records;
  }

  async writeCandidateFile(relativePath, records) {
    for (const record of records) {
      assertValid("candidate", validateCandidate, record);
    }
    const lines = records.map((record) => JSON.stringify(record)).join("\n");
    await this.writeText(relativePath, lines ? `${lines}\n` : "");
  }

  async appendCandidate(record) {
    assertValid("candidate", validateCandidate, record);
    const date = record.timestamp.slice(0, 10);
    const year = date.slice(0, 4);
    const relativePath = `candidates/${year}/${date}.jsonl`;

    // Dedup: skip if normalized text already exists in today's file
    const normalized = normalizeText(record.text);
    const existing = await this.readJsonl(relativePath).catch(() => []);
    if (existing.some((r) => normalizeText(r.text) === normalized)) {
      return relativePath;
    }

    await this.appendJsonl(relativePath, record);
    return relativePath;
  }

  async updateCandidateStatuses(ids, nextStatus) {
    const idSet = new Set(ids);
    for (const relativePath of await this.listCandidatePaths()) {
      const records = await this.readJsonl(relativePath);
      let changed = false;
      const updated = records.map((record) => {
        if (idSet.has(record.id)) {
          changed = true;
          return { ...record, status: nextStatus };
        }
        return record;
      });
      if (changed) {
        await this.writeCandidateFile(relativePath, updated);
      }
    }
  }

  async appendAudit(event) {
    assertValid("audit", validateAuditEvent, event);
    await this.appendJsonl("audit/events.jsonl", event);
  }

  async readAuditEvents() {
    const events = await this.readJsonl("audit/events.jsonl");
    for (const event of events) {
      assertValid("audit", validateAuditEvent, event);
    }
    return events;
  }

  async rebuildIndex() {
    const previous = await this.readYaml("index.yaml", null);
    const timestamp = nowIso();
    const semanticRecords = await this.readAllSemanticRecords();
    const episodePaths = await this.listEpisodePaths();
    const reflectionPaths = await this.listReflectionPaths();
    const candidatePaths = await this.listCandidatePaths();
    const candidateRecords = await this.readCandidates();
    const embeddings = await listFilesRecursive(this.resolve("cache/embeddings"));
    const queryCache = await listFilesRecursive(this.resolve("cache/query"));

    const episodeYears = {};
    for (const relativePath of episodePaths) {
      const year = relativePath.split("/")[1];
      episodeYears[year] ??= { count: 0, files: [] };
      episodeYears[year].count += 1;
      episodeYears[year].files.push(relativePath);
    }

    const semanticCounts = {
      total: semanticRecords.length,
      preferences: semanticRecords.filter((record) => record._file === "semantic/preferences.yaml").length,
      user_facts: semanticRecords.filter((record) => record._file === "semantic/user-facts.yaml").length,
      projects: semanticRecords.filter((record) => record._file === "semantic/projects.yaml").length,
      entities: semanticRecords.filter((record) => record._file === "semantic/entities.yaml").length,
      fact_files: semanticRecords.filter((record) => record._file.startsWith("semantic/facts/")).length
    };

    const index = {
      schema_version: SCHEMA_VERSION,
      plugin_id: PLUGIN_ID,
      plugin_version: PLUGIN_VERSION,
      agent_id: this.agentId,
      created_at: previous?.created_at || timestamp,
      updated_at: timestamp,
      semantic: {
        files: [
          ...SEMANTIC_FILES,
          ...(await listFilesRecursive(this.resolve("semantic/facts"), ".yaml")).map((absolutePath) =>
            this.relative(absolutePath)
          )
        ],
        counts: semanticCounts
      },
      episodic: {
        years: episodeYears
      },
      reflective: {
        files: [
          ...REFLECTIVE_OVERVIEW_FILES,
          ...reflectionPaths
        ]
      },
      identity: {
        files: IDENTITY_FILES.filter(Boolean)
      },
      candidates: {
        latest: candidatePaths.at(-1) || null
      },
      audit: {
        latest: "audit/events.jsonl"
      },
      cache: {
        embeddings_entries: embeddings.length,
        query_entries: queryCache.length
      },
      counts: {
        semantic_records: semanticRecords.length,
        episode_documents: episodePaths.length,
        reflection_documents: reflectionPaths.length,
        candidate_records: candidateRecords.length
      }
    };

    await this.writeIndex(index);
    return index;
  }
}
