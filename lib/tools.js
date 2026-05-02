function textResult(text, details = {}) {
  return {
    content: [{ type: "text", text }],
    details
  };
}

export function registerTools(api, runtime) {
  api.registerTool(
    {
      name: "memory_search",
      label: "Memory Search",
      description: "Search semantic, episodic, and reflective memory.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string", description: "Memory search query" }
        },
        required: ["query"]
      },
      async execute(_toolCallId, params) {
        const results = await runtime.search(params.query);
        const lines = [
          `Identity sections: ${results.identity.length}`,
          ...results.semantic.map((record) => `semantic: ${record.key} = ${record.value}`),
          ...results.episodes.map((episode) => `episode: ${episode.frontmatter.title}`),
          ...results.reflections.map((reflection) => `reflection: ${reflection.frontmatter.title}`)
        ];
        return textResult(lines.join("\n") || "No memory results.", results);
      }
    },
    { name: "memory_search" }
  );

  api.registerTool(
    {
      name: "memory_get",
      label: "Memory Get",
      description: "Fetch a memory object by id or read a memory file by path.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          path: { type: "string" }
        }
      },
      async execute(_toolCallId, params) {
        const result = await runtime.get(params);
        return textResult(result ? JSON.stringify(result, null, 2) : "No matching memory object found.", result || {});
      }
    },
    { name: "memory_get" }
  );

  api.registerTool(
    {
      name: "memory_store_candidate",
      label: "Memory Store Candidate",
      description: "Create a candidate memory explicitly.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          memoryTypeHint: { type: "string" },
          confidence: { type: "number" },
          tags: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["text"]
      },
      async execute(_toolCallId, params) {
        const candidate = await runtime.storeCandidate(params);
        return textResult(`Stored candidate ${candidate.id}.`, candidate);
      }
    },
    { name: "memory_store_candidate" }
  );

  api.registerTool(
    {
      name: "memory_promote",
      label: "Memory Promote",
      description: "Promote pending candidates into durable memory.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          sessionKey: { type: "string" },
          reflect: { type: "boolean" }
        }
      },
      async execute(_toolCallId, params) {
        const result = await runtime.promote({}, params);
        return textResult(
          `Promoted ${result.promoted_candidate_ids.length} candidate(s).`,
          result
        );
      }
    },
    { name: "memory_promote" }
  );

  api.registerTool(
    {
      name: "memory_episode_summarize",
      label: "Memory Episode Summarize",
      description: "Generate or refresh episodic summaries from pending candidates.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          sessionKey: { type: "string" },
          title: { type: "string" }
        }
      },
      async execute(_toolCallId, params) {
        const episode = await runtime.summarize({}, params);
        return textResult(
          episode ? `Created episode ${episode.path}.` : "No pending episodic candidates available.",
          episode || {}
        );
      }
    },
    { name: "memory_episode_summarize" }
  );

  api.registerTool(
    {
      name: "memory_reflect",
      label: "Memory Reflect",
      description: "Generate or refresh reflective memory conservatively.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          force: { type: "boolean" }
        }
      },
      async execute(_toolCallId, params) {
        const reflections = await runtime.reflect({}, params);
        return textResult(
          reflections.length
            ? `Created or refreshed ${reflections.length} reflection(s).`
            : "No new reflections met the promotion threshold.",
          { reflections }
        );
      }
    },
    { name: "memory_reflect" }
  );

  api.registerTool(
    {
      name: "memory_forget",
      label: "Memory Forget",
      description: "Forget or supersede a memory object by id.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          kind: { type: "string" }
        },
        required: ["id"]
      },
      async execute(_toolCallId, params) {
        const result = await runtime.forget(params);
        return textResult(
          result.removed ? `Forgot ${params.id}.` : `Nothing matched ${params.id}.`,
          result
        );
      }
    },
    { name: "memory_forget" }
  );

  api.registerTool(
    {
      name: "memory_flush",
      label: "Memory Flush",
      description:
        "Promote all pending candidates, create an episode summary, and generate reflections. " +
        "Use when the user says 'remember this', 'remember this conversation', or similar.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", description: "Optional episode title override" }
        }
      },
      async execute(_toolCallId, params) {
        const result = await runtime.promote({}, { summarize: true, reflect: true });
        const lines = [
          `Promoted ${result.promoted_candidate_ids.length} candidate(s) to durable memory.`,
          result.episode ? `Created episode: ${result.episode.path}` : null,
          result.reflections?.length
            ? `Generated ${result.reflections.length} reflection(s).`
            : null,
          !result.promoted_candidate_ids.length && !result.episode
            ? "No pending memory found — nothing to flush."
            : null
        ].filter(Boolean);
        return textResult(lines.join("\n"), result);
      }
    },
    { name: "memory_flush" }
  );

  api.registerTool(
    {
      name: "memory_inspect",
      label: "Memory Inspect",
      description: "Inspect memory state, counts, and references.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {}
      },
      async execute() {
        const result = await runtime.inspect();
        return textResult(JSON.stringify(result, null, 2), result);
      }
    },
    { name: "memory_inspect" }
  );
}
