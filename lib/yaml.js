import { isPlainObject } from "./utils.js";

function indentText(depth) {
  return " ".repeat(depth);
}

function formatKey(key) {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : JSON.stringify(key);
}

function formatScalar(value) {
  if (value === null) return "null";
  if (value === true || value === false) return String(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "string") {
    if (value === "") return '""';
    if (/^[A-Za-z0-9_.:/@+-]+$/.test(value)) return value;
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}

function isEmptyContainer(value) {
  return (
    (Array.isArray(value) && value.length === 0) ||
    (isPlainObject(value) && Object.keys(value).length === 0)
  );
}

function render(value, depth) {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value
      .map((item) => {
        if (Array.isArray(item) || isPlainObject(item)) {
          if (isEmptyContainer(item)) {
            return `${indentText(depth)}- ${render(item, 0)}`;
          }
          return `${indentText(depth)}-\n${render(item, depth + 2)}`;
        }
        return `${indentText(depth)}- ${formatScalar(item)}`;
      })
      .join("\n");
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    return entries
      .map(([key, nested]) => {
        if (Array.isArray(nested) || isPlainObject(nested)) {
          if (isEmptyContainer(nested)) {
            return `${indentText(depth)}${formatKey(key)}: ${render(nested, 0)}`;
          }
          const rendered = render(nested, depth + 2);
          return `${indentText(depth)}${formatKey(key)}:\n${rendered}`;
        }
        return `${indentText(depth)}${formatKey(key)}: ${formatScalar(nested)}`;
      })
      .join("\n");
  }

  return `${indentText(depth)}${formatScalar(value)}`;
}

export function serializeYaml(value) {
  return `${render(value, 0)}\n`;
}

function countIndent(line) {
  let depth = 0;
  while (depth < line.length && line[depth] === " ") {
    depth += 1;
  }
  return depth;
}

function parseScalar(value) {
  if (value === "null") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "[]") return [];
  if (value === "{}") return {};
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    try {
      return JSON.parse(value.replace(/^'|'$/g, '"'));
    } catch {
      return value.slice(1, -1);
    }
  }

  return value;
}

function trimComments(line) {
  return line;
}

function prepareLines(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => trimComments(line))
    .filter((line) => line.trim().length > 0);
}

function parseBlock(lines, startIndex, indent) {
  if (startIndex >= lines.length) {
    return { value: {}, nextIndex: startIndex };
  }

  const firstLine = lines[startIndex];
  const firstIndent = countIndent(firstLine);
  if (firstIndent < indent) {
    return { value: {}, nextIndex: startIndex };
  }

  if (firstLine.slice(firstIndent).startsWith("-")) {
    return parseArray(lines, startIndex, indent);
  }

  if (!firstLine.slice(firstIndent).includes(":")) {
    return {
      value: parseScalar(firstLine.slice(firstIndent).trim()),
      nextIndex: startIndex + 1
    };
  }

  return parseObject(lines, startIndex, indent);
}

function parseArray(lines, startIndex, indent) {
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    const depth = countIndent(line);
    if (depth < indent) break;
    if (depth > indent) {
      throw new Error(`Invalid array indentation at line: ${line}`);
    }

    const trimmed = line.slice(depth);
    if (!trimmed.startsWith("-")) break;

    const rest = trimmed.slice(1).trim();
    if (!rest) {
      const nextLine = index + 1 < lines.length ? lines[index + 1] : null;
      const nextIndent = nextLine ? countIndent(nextLine) : indent + 2;
      const nextTrimmed = nextLine ? nextLine.trim() : "";
      if (
        nextLine &&
        nextIndent > indent &&
        !nextTrimmed.startsWith("-") &&
        !nextTrimmed.includes(":")
      ) {
        items.push(parseScalar(nextTrimmed));
        index += 2;
        continue;
      }
      const nested = parseBlock(lines, index + 1, nextIndent);
      items.push(nested.value);
      index = nested.nextIndex;
      continue;
    }

    items.push(parseScalar(rest));
    index += 1;
  }

  return { value: items, nextIndex: index };
}

function parseObject(lines, startIndex, indent) {
  const object = {};
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    const depth = countIndent(line);
    if (depth < indent) break;
    if (depth > indent) {
      throw new Error(`Invalid object indentation at line: ${line}`);
    }

    const trimmed = line.slice(depth);
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) {
      throw new Error(`Invalid YAML line: ${line}`);
    }

    const rawKey = trimmed.slice(0, colonIndex).trim();
    const key =
      rawKey.startsWith('"') && rawKey.endsWith('"')
        ? JSON.parse(rawKey)
        : rawKey.replace(/^'|'$/g, "");
    const rest = trimmed.slice(colonIndex + 1).trim();

    if (!rest) {
      const nextLine = index + 1 < lines.length ? lines[index + 1] : null;
      const nextIndent = nextLine ? countIndent(nextLine) : indent + 2;
      const nextTrimmed = nextLine ? nextLine.trim() : "";
      if (
        nextLine &&
        nextIndent > indent &&
        !nextTrimmed.startsWith("-") &&
        !nextTrimmed.includes(":")
      ) {
        object[key] = parseScalar(nextTrimmed);
        index += 2;
        continue;
      }
      const nested = parseBlock(lines, index + 1, nextIndent);
      object[key] = nested.value;
      index = nested.nextIndex;
      continue;
    }

    object[key] = parseScalar(rest);
    index += 1;
  }

  return { value: object, nextIndex: index };
}

export function parseYaml(text) {
  const lines = prepareLines(text);
  if (lines.length === 0) {
    return {};
  }

  return parseBlock(lines, 0, countIndent(lines[0])).value;
}
