import { createHash } from "node:crypto";

export function nowIso(input = new Date()) {
  return input instanceof Date ? input.toISOString() : new Date(input).toISOString();
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function safeFileStem(value, fallback = "memory-item") {
  const stem = slugify(value).slice(0, 64);
  return stem || fallback;
}

export function createStableId(prefix, seed) {
  const hash = createHash("sha1").update(String(seed)).digest("hex").slice(0, 10);
  return `${prefix}_${hash}`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value) {
  return uniq(
    normalizeText(value)
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1)
  );
}

export function overlapScore(left, right) {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const rightSet = new Set(rightTokens);
  const hits = leftTokens.filter((token) => rightSet.has(token)).length;
  return hits / Math.max(leftTokens.length, rightTokens.length);
}

export function recencyScore(timestamp) {
  if (!timestamp) return 0;
  const ageMs = Date.now() - new Date(timestamp).getTime();
  const ageDays = ageMs / 86_400_000;
  if (!Number.isFinite(ageDays)) return 0;
  return clamp(1 - ageDays / 30, 0, 1);
}

export function excerpt(text, maxLength = 180) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

export function bullets(lines) {
  if (!lines.length) {
    return "- None recorded.";
  }

  return lines.map((line) => `- ${line}`).join("\n");
}

export function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

export function collectStrings(value, output = []) {
  if (typeof value === "string" && value.trim()) {
    output.push(value.trim());
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, output);
    }
    return output;
  }

  if (isPlainObject(value)) {
    // Skip entire reasoning blocks — their summary text is internal AI thinking
    if (value.type === "reasoning" || value.type === "thinking") return output;

    for (const [key, nested] of Object.entries(value)) {
      if (
        key === "access" ||
        key === "refresh" ||
        key === "token" ||
        key === "encrypted_content" ||
        key === "old_string" ||
        key === "new_string"
      ) {
        continue;
      }
      collectStrings(nested, output);
    }
  }

  return output;
}

export function splitSentences(text) {
  return uniq(
    String(text || "")
      .split(/[\n\r]+|(?<=[.!?])\s+/)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length >= 18)
  );
}
