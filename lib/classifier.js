import { inferConfidence, inferHint, inferTags, qualifySentence } from "./capture.js";
import { normalizeText } from "./utils.js";

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a memory classifier for a personal AI assistant. Given a list of conversation sentences, decide which ones are worth storing in long-term memory.

Assign ONE label per sentence:
- skip         — AI reasoning/thinking, task planning, conversational filler, questions without answers, markdown headers/bullets without substance, JSON or code fragments, partial phrases, anything the AI said about what it's about to do
- preference   — a user's stated preference, work style, communication habit, or tool choice
- fact         — a factual statement about the user, their project, their environment, or their identity
- decision     — an architectural or project decision that was reached
- architecture — information about how the project or system is structured

Rules:
- Err strongly toward "skip" for anything ambiguous
- "I need to...", "I should...", "Let me...", "We need to..." = almost always skip (AI task planning)
- "If you want...", "You can..." = skip (conversational filler)
- Markdown headers (##, **bold**) or lone bullet fragments = skip
- Only label non-skip if it would be genuinely useful to recall in a future unrelated conversation

Return ONLY a JSON array, one entry per input sentence, preserving order:
[{"i":0,"label":"skip"},{"i":1,"label":"preference","confidence":0.9},...]

Confidence (0–1) is optional for non-skip labels. Omit it for "skip".`;

function buildPrompt(sentences) {
  const numbered = sentences.map((s, i) => `${i}: ${s}`).join("\n");
  return `${SYSTEM_PROMPT}\n\nSentences:\n${numbered}`;
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function extractJsonArray(text) {
  const match = String(text || "").match(/\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON array in response");
  return JSON.parse(match[0]);
}

function labelToTags(label) {
  const map = {
    preference: ["preference"],
    fact: [],
    decision: ["decision"],
    architecture: ["architecture"]
  };
  return map[label] || [];
}

function labelToConfidence(label, provided) {
  if (typeof provided === "number" && provided >= 0 && provided <= 1) return provided;
  const defaults = { preference: 0.86, decision: 0.84, architecture: 0.80, fact: 0.78 };
  return defaults[label] ?? 0.75;
}

function parseClassifierResponse(raw, sentences) {
  const entries = extractJsonArray(raw);
  if (!Array.isArray(entries)) throw new Error("Expected array");
  return entries
    .filter((entry) => entry && typeof entry.i === "number" && entry.label && entry.label !== "skip")
    .map((entry) => {
      const text = sentences[entry.i];
      if (!text) return null;
      const tags = labelToTags(entry.label);
      return {
        text,
        confidence: labelToConfidence(entry.label, entry.confidence),
        tags,
        hint: inferHint(tags)
      };
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

async function callOpenAI(sentences, provider, timeoutMs) {
  const apiKey = process.env[provider.apiKeyEnv || "OPENAI_API_KEY"];
  if (!apiKey) return null;

  const endpoint = provider.endpoint || "https://api.openai.com/v1/chat/completions";
  const model = provider.model || "gpt-4o-mini";

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: buildPrompt(sentences) }],
        max_tokens: 800,
        temperature: 0
      })
    },
    timeoutMs
  );

  if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty OpenAI response");
  return parseClassifierResponse(text, sentences);
}

async function callGemini(sentences, provider, timeoutMs) {
  const apiKey = process.env[provider.apiKeyEnv || "GEMINI_API_KEY"];
  if (!apiKey) return null;

  const model = provider.model || "gemini-2.0-flash-lite";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(sentences) }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 }
      })
    },
    timeoutMs
  );

  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return parseClassifierResponse(text, sentences);
}

// ---------------------------------------------------------------------------
// Keyword fallback (mirrors capture.js logic without the async overhead)
// ---------------------------------------------------------------------------

function keywordClassify(sentences) {
  return sentences
    .filter((sentence) => qualifySentence(sentence))
    .map((sentence) => {
      const tags = inferTags(sentence);
      return {
        text: sentence,
        confidence: inferConfidence(tags),
        tags,
        hint: inferHint(tags)
      };
    });
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

const DEFAULT_PROVIDERS = [
  { type: "openai", model: "gpt-4o-mini", apiKeyEnv: "OPENAI_API_KEY" },
  { type: "gemini", model: "gemini-2.0-flash-lite", apiKeyEnv: "GEMINI_API_KEY" },
  { type: "keyword" }
];

export function createClassifier(config = {}) {
  const timeoutMs = config.timeoutMs ?? 5000;
  const providers = Array.isArray(config.providers) && config.providers.length
    ? config.providers
    : DEFAULT_PROVIDERS;

  return {
    async classify(sentences) {
      if (!sentences.length) return [];

      for (const provider of providers) {
        try {
          if (provider.type === "openai") {
            const result = await callOpenAI(sentences, provider, timeoutMs);
            if (result !== null) return result;
          } else if (provider.type === "gemini") {
            const result = await callGemini(sentences, provider, timeoutMs);
            if (result !== null) return result;
          } else if (provider.type === "keyword") {
            return keywordClassify(sentences);
          }
        } catch {
          // fall through to next provider
        }
      }

      // ultimate safety net
      return keywordClassify(sentences);
    }
  };
}
