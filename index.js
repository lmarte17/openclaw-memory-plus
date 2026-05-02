import { pluginConfigSchema, parseConfig } from "./lib/config.js";
import { registerCli } from "./lib/cli.js";
import { buildCaptureHandler, buildRecallHandler } from "./lib/hooks.js";
import { MEMORY_KIND, PLUGIN_ID, PLUGIN_NAME } from "./lib/constants.js";
import { createMemoryRuntime } from "./lib/runtime.js";
import { registerTools } from "./lib/tools.js";

export default {
  id: PLUGIN_ID,
  name: PLUGIN_NAME,
  description:
    "Structured, file-first memory for OpenClaw with semantic, episodic, reflective, and identity layers.",
  kind: MEMORY_KIND,
  configSchema: pluginConfigSchema,

  register(api) {
    const config = parseConfig(api.pluginConfig || {});
    const runtime = createMemoryRuntime(api, config);

    registerCli(api, runtime);
    registerTools(api, runtime);

    if (config.autoRecall) {
      api.on("before_agent_start", buildRecallHandler(runtime));
    }

    if (config.autoCapture) {
      api.on("agent_end", buildCaptureHandler(runtime));
      api.on("tool_result", buildCaptureHandler(runtime, { sourceType: "tool" }));
    }

    api.registerService({
      id: PLUGIN_ID,
      start: async () => {
        await runtime.init();
        runtime.logger("info", `${PLUGIN_ID}: ready`);
      },
      stop: () => {
        runtime.logger("info", `${PLUGIN_ID}: stopped`);
      }
    });
  }
};
