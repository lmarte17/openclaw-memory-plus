import { parseYaml, serializeYaml } from "./yaml.js";

export function parseFrontmatter(documentText) {
  if (!documentText.startsWith("---\n")) {
    return { attributes: {}, body: documentText };
  }

  const endMarker = documentText.indexOf("\n---\n", 4);
  if (endMarker === -1) {
    return { attributes: {}, body: documentText };
  }

  const rawAttributes = documentText.slice(4, endMarker);
  const body = documentText.slice(endMarker + 5);
  return {
    attributes: parseYaml(rawAttributes),
    body
  };
}

export function formatFrontmatter(attributes, body) {
  const normalizedBody = String(body || "").trim();
  return `---\n${serializeYaml(attributes).trimEnd()}\n---\n\n${normalizedBody}\n`;
}
