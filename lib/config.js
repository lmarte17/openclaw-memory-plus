import os from "node:os";
import path from "node:path";

export const pluginConfigSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    autoRecall: { type: "boolean" },
    autoCapture: { type: "boolean" },
    enableSlowPathLifecycle: { type: "boolean" },
    defaultAgentId: { type: "string", minLength: 1 },
    storeRoot: { type: "string", minLength: 1 },
    debug: { type: "boolean" },
    classifier: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        timeoutMs: { type: "number" },
        providers: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
            properties: {
              type: { type: "string", enum: ["openai", "gemini", "keyword"] },
              model: { type: "string" },
              endpoint: { type: "string" },
              apiKeyEnv: { type: "string" }
            },
            required: ["type"]
          }
        }
      }
    }
  },
  required: []
};

export function parseConfig(rawConfig = {}) {
  return {
    autoRecall: rawConfig.autoRecall !== false,
    autoCapture: rawConfig.autoCapture !== false,
    enableSlowPathLifecycle: rawConfig.enableSlowPathLifecycle !== false,
    defaultAgentId:
      typeof rawConfig.defaultAgentId === "string" && rawConfig.defaultAgentId.trim()
        ? rawConfig.defaultAgentId.trim()
        : "main",
    storeRoot:
      typeof rawConfig.storeRoot === "string" && rawConfig.storeRoot.trim()
        ? rawConfig.storeRoot.trim()
        : null,
    debug: rawConfig.debug === true,
    classifier: rawConfig.classifier && typeof rawConfig.classifier === "object"
      ? rawConfig.classifier
      : {}
  };
}

export function resolveOpenClawHome(api) {
  const candidate =
    api?.openclawHome ||
    api?.homeDir ||
    process.env.OPENCLAW_HOME ||
    path.join(os.homedir(), ".openclaw");

  return path.resolve(String(candidate));
}

export function resolveAgentId(api, ctx, config) {
  const candidates = [
    ctx?.agentId,
    ctx?.agent?.id,
    api?.agentId,
    config.defaultAgentId
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "main";
}

export function resolveStoreRoot(homeDir, agentId, config) {
  if (config.storeRoot) {
    return path.resolve(
      homeDir,
      config.storeRoot.replaceAll("{agentId}", agentId)
    );
  }

  return path.join(homeDir, "agents", agentId, "memory-plus");
}
