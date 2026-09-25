import { z } from "zod";
import { LongWorldbuildingItemIdSchema } from "./long-workspace";

export const LONG_WORLDBUILDING_LIST_HEADER =
  "<!-- deepwrite-worldbuilding-list:v1 -->" as const;
const ITEM_MARKER_PREFIX = "<!-- deepwrite-world-item:";
const ITEM_MARKER_PATTERN =
  /^<!-- deepwrite-world-item:(worlditem_[A-Za-z0-9](?:[A-Za-z0-9._:-]*[A-Za-z0-9])?) -->$/u;

export const LongWorldbuildingMarkdownItemSchema = z
  .object({
    id: LongWorldbuildingItemIdSchema,
    title: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .refine((value) => !/[\r\n]/u.test(value), {
        message: "Worldbuilding item titles must use one line."
      }),
    content: z.string().max(1_000_000)
  })
  .strict()
  .superRefine((item, context) => {
    if (item.content.includes(ITEM_MARKER_PREFIX)) {
      context.addIssue({
        code: "custom",
        path: ["content"],
        message:
          "Worldbuilding item content cannot contain the reserved item marker."
      });
    }
  });
export type LongWorldbuildingMarkdownItem = z.infer<
  typeof LongWorldbuildingMarkdownItemSchema
>;

export const LongWorldbuildingMarkdownListSchema = z
  .array(LongWorldbuildingMarkdownItemSchema)
  .max(10_000)
  .superRefine((items, context) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.id)) {
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `Duplicate worldbuilding item id: ${item.id}`
        });
      }
      seen.add(item.id);
    });
  });
export type LongWorldbuildingMarkdownList = z.infer<
  typeof LongWorldbuildingMarkdownListSchema
>;

export function serializeLongWorldbuildingMarkdownList(
  rawItems: LongWorldbuildingMarkdownList
): string {
  const items = LongWorldbuildingMarkdownListSchema.parse(rawItems);
  const sections = items.map((item) => {
    const body = item.content.replace(/\s+$/u, "");
    return [
      `<!-- deepwrite-world-item:${item.id} -->`,
      `## ${item.title}`,
      ...(body ? ["", body] : [])
    ].join("\n");
  });
  return `${LONG_WORLDBUILDING_LIST_HEADER}\n${
    sections.length ? `\n${sections.join("\n\n")}\n` : ""
  }`;
}

export function parseLongWorldbuildingMarkdownList(
  markdown: string
): LongWorldbuildingMarkdownList {
  if (typeof markdown !== "string" || markdown.length > 16 * 1024 * 1024) {
    throw new Error("Worldbuilding Markdown exceeds the safety budget.");
  }
  const normalized = markdown.replace(/\r\n?/gu, "\n");
  const lines = normalized.split("\n");
  if (lines[0]?.trim() !== LONG_WORLDBUILDING_LIST_HEADER) {
    throw new Error("Worldbuilding list is missing its v1 format header.");
  }
  const items: LongWorldbuildingMarkdownItem[] = [];
  let index = 1;
  while (index < lines.length) {
    while (index < lines.length && lines[index]!.trim() === "") index += 1;
    if (index >= lines.length) break;
    const marker = ITEM_MARKER_PATTERN.exec(lines[index]!.trim());
    if (!marker) {
      throw new Error(
        `Unexpected worldbuilding content at line ${index + 1}.`
      );
    }
    const id = marker[1]!;
    const titleLine = lines[index + 1];
    if (!titleLine?.startsWith("## ") || titleLine.slice(3).trim() === "") {
      throw new Error(
        `Worldbuilding item ${id} is missing its Markdown title.`
      );
    }
    const title = titleLine.slice(3).trim();
    index += 2;
    if (lines[index]?.trim() === "") index += 1;
    const contentStart = index;
    while (
      index < lines.length &&
      !ITEM_MARKER_PATTERN.test(lines[index]!.trim())
    ) {
      index += 1;
    }
    const content = lines
      .slice(contentStart, index)
      .join("\n")
      .replace(/\s+$/u, "");
    items.push({ id, title, content });
  }
  return LongWorldbuildingMarkdownListSchema.parse(items);
}
