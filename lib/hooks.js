export function buildRecallHandler(runtime) {
  return async (event = {}, ctx = {}) => {
    const prompt = String(event.prompt || runtime.extractRelevantText(event, ctx)).trim();
    if (prompt.length < 5) return;
    const recall = await runtime.buildRecall(prompt, ctx);
    if (!recall.frame) return;
    return { prependContext: recall.frame };
  };
}

export function buildCaptureHandler(runtime, defaults = {}) {
  return async (event = {}, ctx = {}) => {
    const text = runtime.extractRelevantText(event, ctx);
    if (!text.trim()) return;

    await runtime.captureText(text, ctx, {
      sourceType: defaults.sourceType || event.sourceType || "turn"
    });

    const shouldSlowPath =
      ctx?.preCompaction === true ||
      event?.preCompaction === true ||
      event?.flushMemory === true;

    if (shouldSlowPath) {
      await runtime.promote(ctx, { reflect: true });
    }
  };
}
