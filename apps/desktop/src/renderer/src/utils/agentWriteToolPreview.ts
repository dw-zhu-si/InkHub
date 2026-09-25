export interface WriteToolPreviewSource {
  args?: unknown;
  argumentsText?: string;
}

function decodeJsonStringFragment(source: string): string {
  let result = "";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (character !== "\\") {
      result += character;
      continue;
    }
    const escaped = source[index + 1];
    if (escaped === undefined) break;
    index += 1;
    const simpleEscapes: Record<string, string> = {
      '"': '"',
      "\\": "\\",
      "/": "/",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t"
    };
    if (escaped === "u") {
      const code = source.slice(index + 1, index + 5);
      if (/^[0-9a-fA-F]{4}$/.test(code)) {
        result += String.fromCharCode(Number.parseInt(code, 16));
        index += 4;
      }
      continue;
    }
    result += simpleEscapes[escaped] ?? escaped;
  }
  return result;
}

function streamedStringFieldBounds(
  source: string,
  field: string,
  fromIndex: number
): { start: number; end: number; closed: boolean } | undefined {
  const match = new RegExp(`"${field}"\\s*:\\s*"`).exec(source.slice(fromIndex));
  if (!match) return undefined;
  const start = fromIndex + (match.index ?? 0) + match[0].length;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      return { start, end: index, closed: true };
    }
  }
  return { start, end: source.length, closed: false };
}

function streamedStringField(source: string, field: string): string {
  const bounds = streamedStringFieldBounds(source, field, 0);
  if (!bounds) return "";
  return decodeJsonStringFragment(source.slice(bounds.start, bounds.end));
}

function streamedStringFields(source: string, field: string): string[] {
  const values: string[] = [];
  let fromIndex = 0;
  while (fromIndex < source.length) {
    const bounds = streamedStringFieldBounds(source, field, fromIndex);
    if (!bounds) break;
    values.push(decodeJsonStringFragment(source.slice(bounds.start, bounds.end)));
    if (!bounds.closed) break;
    fromIndex = bounds.end + 1;
  }
  return values;
}

function completedReplacementText(replacements: unknown[]): string {
  return replacements
    .flatMap((replacement) =>
      replacement &&
      typeof replacement === "object" &&
      typeof (replacement as Record<string, unknown>).new_text === "string"
        ? [(replacement as Record<string, unknown>).new_text as string]
        : []
    )
    .join("\n\n");
}

function completedSectionText(sections: unknown[]): string {
  return sections
    .flatMap((section) => {
      if (!section || typeof section !== "object") return [];
      const value = section as Record<string, unknown>;
      return [
        [
          typeof value.title === "string" ? `## ${value.title}` : "",
          typeof value.body === "string" ? value.body : ""
        ]
          .filter(Boolean)
          .join("\n")
      ];
    })
    .join("\n\n");
}

/**
 * Visible write-tool preview and character count.
 *
 * Completed args keep their full replacement list. While arguments are still
 * streaming, every `new_text` already present in the partial JSON is included
 * so later replacements keep accumulating instead of waiting for the tool end.
 */
export function writeToolText(tool: WriteToolPreviewSource): string {
  if (tool.args && typeof tool.args === "object") {
    const args = tool.args as Record<string, unknown>;
    if (typeof args.text === "string") return args.text;
    if (typeof args.content === "string") return args.content;
    if (Array.isArray(args.replacements)) {
      return completedReplacementText(args.replacements);
    }
    if (Array.isArray(args.sections)) {
      return completedSectionText(args.sections);
    }
  }
  const source = tool.argumentsText ?? "";
  return (
    streamedStringField(source, "text") ||
    streamedStringField(source, "content") ||
    streamedStringField(source, "body") ||
    streamedStringFields(source, "new_text").join("\n\n")
  );
}
