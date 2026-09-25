import { z } from "zod";
import {
  LinkedMaterialIdsByKindSchema,
  LinkedSkillIdsByKindSchema,
  MaterialKindSchema,
  SkillKindSchema
} from "./catalog";

export const LONG_WORKSPACE_SCHEMA_VERSION = 1 as const;
export const LONG_PROJECT_MANIFEST_SCHEMA_VERSION = 1 as const;
export const LONG_WORKSPACE_INDEX_PATH = "long/index.json" as const;
export const LONG_AGENTS_MD_PATH = "AGENTS.md" as const;
export const LONG_AGENTS_MD_MAX_CHARACTERS = 10_000;

export const DEFAULT_LONG_AGENTS_MD = `# 长篇上下文

本文说明本书五个工作阶段各自负责什么。请按阶段边界协作，不要越权改写其他阶段的权威内容。

## 世界观阶段

维护世界规则、势力、地理、历史、术语、境界、物品等设定。
- 文本型分类以分类本身为正文；列表型分类再拆成概览和条目。
- 可查看全书结构与人物作对照，但不要把未读取的剧情或正文当成事实，也不要修改剧情结构和章节正文。
- 按章连续性记录只作参考，不接管或锁定世界观正文。

## 人物阶段

维护人物核心档案、人物关系、当前状态、历史轨迹，以及一份手动维护的人物概览。
- 每名人物有四份独立文档；概览用于统计人物身份、分组、别名和一句话定位。
- 可结合世界观与剧情框架检查冲突，但人物内容仍以人物文档为准。
- 按章连续性记录只作参考，不接管或锁定人物文档。

## 剧情点阶段

维护全书故事线、分卷、剧情点、故事情节、章卡、故事事件、叙事落点与伏笔。
- 剧情点是大剧情发展脉络；故事事件是具体发生的事，挂到所属剧情点。
- 世界观与人物只读，用于设计剧情或检查结构冲突。
- 可以调度正文写作，但连续性记录只供参考，不锁定剧情结构。

## 正文阶段

规划正文进度、调度连续章节，并在选中章卡时直接撰写或修改该章小说正文。
- 每张章卡对应一份独立 Markdown 正文；未锁定章卡时只规划或调度，不改其他章。
- 写作产物只限当前锁定章的小说正文，不创建章节结构，也不编写连续性文件。
- 已有连续性记录仍可参考，但不限制正文修订。

## 持续性账本阶段

按章留存人物轨迹、世界观揭露、既有伏笔触点变化、章末状态和下一章接续包。
- 以本章正文为事实证据；章末状态与接续包每章必须写入。
- 伏笔总览是设计源，账本只能核验既有伏笔线和触点，不能自行新增伏笔。
- 记录只供后续参考，不锁定正文、人物资料或剧情结构。
`;

export function longAgentsMdCharacterCount(content: string): number {
  return Array.from(content).length;
}

export const LongWorkspaceSchemaVersionSchema = z.literal(
  LONG_WORKSPACE_SCHEMA_VERSION
);
export type LongWorkspaceSchemaVersion = z.infer<
  typeof LongWorkspaceSchemaVersionSchema
>;

export const LongProjectManifestSchemaVersionSchema = z.literal(
  LONG_PROJECT_MANIFEST_SCHEMA_VERSION
);
export type LongProjectManifestSchemaVersion = z.infer<
  typeof LongProjectManifestSchemaVersionSchema
>;

const LongTimestampSchema = z.string().datetime();
const LongRevisionSchema = z.number().int().nonnegative();
const LongTitleSchema = z.string().trim().min(1).max(256);
const LongTextSchema = z.string().max(200_000);
const LongShortTextSchema = z.string().max(4_000);

/**
 * Long-form ids are opaque and stable. Display names and mutable ordering must
 * never be encoded as the identity of an entity.
 */
export const LongStableIdSchema = z
  .string()
  .trim()
  .min(3)
  .max(160)
  .regex(
    /^[a-z][a-z0-9-]*_[A-Za-z0-9](?:[A-Za-z0-9._:-]*[A-Za-z0-9])?$/,
    "Long-form ids must be opaque, prefixed stable ids."
  );
export type LongStableId = z.infer<typeof LongStableIdSchema>;

function stableIdWithPrefix(prefix: string) {
  return LongStableIdSchema.refine((value) => value.startsWith(`${prefix}_`), {
    message: `Expected a stable ${prefix}_ id.`
  });
}

export const LongBookIdSchema = stableIdWithPrefix("longbook");
export type LongBookId = z.infer<typeof LongBookIdSchema>;
export const LongWorldbuildingCategoryIdSchema =
  stableIdWithPrefix("world");
export type LongWorldbuildingCategoryId = z.infer<
  typeof LongWorldbuildingCategoryIdSchema
>;
export const LongWorldbuildingItemIdSchema =
  stableIdWithPrefix("worlditem");
export type LongWorldbuildingItemId = z.infer<
  typeof LongWorldbuildingItemIdSchema
>;
export const LongCharacterIdSchema = stableIdWithPrefix("character");
export type LongCharacterId = z.infer<typeof LongCharacterIdSchema>;
export const LongCustomCharacterTypeIdSchema = stableIdWithPrefix("chartype");
export type LongCustomCharacterTypeId = z.infer<
  typeof LongCustomCharacterTypeIdSchema
>;
export const LongVolumeIdSchema = stableIdWithPrefix("volume");
export type LongVolumeId = z.infer<typeof LongVolumeIdSchema>;
export const LongArcIdSchema = stableIdWithPrefix("arc");
export type LongArcId = z.infer<typeof LongArcIdSchema>;
export const LongChapterCardIdSchema = stableIdWithPrefix("chapter");
export type LongChapterCardId = z.infer<typeof LongChapterCardIdSchema>;
export const LongStoryEventIdSchema = stableIdWithPrefix("event");
export type LongStoryEventId = z.infer<typeof LongStoryEventIdSchema>;
/** Plot-point-bound story plot entries shown in the「故事情节」tab. */
export const LongStoryPlotIdSchema = stableIdWithPrefix("storyplot");
export type LongStoryPlotId = z.infer<typeof LongStoryPlotIdSchema>;
export const LongEventConnectionIdSchema =
  stableIdWithPrefix("connection");
export type LongEventConnectionId = z.infer<
  typeof LongEventConnectionIdSchema
>;
export const LongNarrativePlacementIdSchema =
  stableIdWithPrefix("placement");
export type LongNarrativePlacementId = z.infer<
  typeof LongNarrativePlacementIdSchema
>;
export const LongForeshadowingIdSchema = stableIdWithPrefix("foreshadow");
export type LongForeshadowingId = z.infer<
  typeof LongForeshadowingIdSchema
>;
export const LongForeshadowingBeatIdSchema = stableIdWithPrefix("beat");
export type LongForeshadowingBeatId = z.infer<
  typeof LongForeshadowingBeatIdSchema
>;
export const LongLedgerCommitIdSchema = stableIdWithPrefix("commit");
export type LongLedgerCommitId = z.infer<typeof LongLedgerCommitIdSchema>;
export const LongContinuityFactIdSchema = stableIdWithPrefix("fact");
export type LongContinuityFactId = z.infer<
  typeof LongContinuityFactIdSchema
>;
export const LongContinuityOpenLoopIdSchema = stableIdWithPrefix("loop");
export type LongContinuityOpenLoopId = z.infer<
  typeof LongContinuityOpenLoopIdSchema
>;
export const LongFileIdSchema = stableIdWithPrefix("file");
export type LongFileId = z.infer<typeof LongFileIdSchema>;

function isSafeLongProjectPath(value: string): boolean {
  if (
    value.startsWith("/") ||
    /^[a-zA-Z]:\//u.test(value) ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    return false;
  }
  const segments = value.split("/");
  return (
    segments.length > 1 &&
    segments.every(
      (segment) =>
        segment.length > 0 && segment !== "." && segment !== ".."
    ) &&
    (value.endsWith(".md") || value.endsWith(".json"))
  );
}

export const LongProjectRelativePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .refine(isSafeLongProjectPath, {
    message:
      "Long-form project paths must be safe relative Markdown or JSON paths."
  });
export type LongProjectRelativePath = z.infer<
  typeof LongProjectRelativePathSchema
>;

export const LongFileRevisionSchema = z
  .string()
  // Current revisions contain at most a safe-integer byte count and a
  // 64-character SHA-256. Bound the wire value before applying the regexp so
  // an untrusted command cannot turn this small token into an unbounded
  // allocation/scanning surface.
  .max(96)
  .regex(/^(?:v1:\d+:[0-9a-f]{8}|v2:\d+:[0-9a-f]{64})$/);
export type LongFileRevision = z.infer<typeof LongFileRevisionSchema>;

export const LongWorkspaceFileReferenceSchema = z
  .object({
    id: LongFileIdSchema,
    path: LongProjectRelativePathSchema,
    revision: LongFileRevisionSchema,
    updatedAt: LongTimestampSchema
  })
  .strict();
export type LongWorkspaceFileReference = z.infer<
  typeof LongWorkspaceFileReferenceSchema
>;

export const LongMarkdownFileReferenceSchema =
  LongWorkspaceFileReferenceSchema.refine(
    (file) => file.path.endsWith(".md"),
    {
      path: ["path"],
      message: "This long-form file must use a .md path."
    }
  );
export type LongMarkdownFileReference = z.infer<
  typeof LongMarkdownFileReferenceSchema
>;

export const LongJsonFileReferenceSchema =
  LongWorkspaceFileReferenceSchema.refine(
    (file) => file.path.endsWith(".json"),
    {
      path: ["path"],
      message: "This long-form file must use a .json path."
    }
  );
export type LongJsonFileReference = z.infer<
  typeof LongJsonFileReferenceSchema
>;

export function longWorldbuildingFileId(categoryId: string): string {
  return `file_${categoryId}:content`;
}

export function longWorldbuildingOverviewFileId(categoryId: string): string {
  return `file_${categoryId}:overview`;
}

export function longWorldbuildingItemFileId(itemId: string): string {
  return `file_${itemId}:content`;
}

export const LONG_CHARACTER_OVERVIEW_FILE_ID =
  "file_characters:overview" as const;
export const LONG_CHARACTER_OVERVIEW_PATH =
  "long/characters/overview.md" as const;

export function longCharacterOverviewFileId(): string {
  return LONG_CHARACTER_OVERVIEW_FILE_ID;
}

export function longCharacterOverviewContentPath(): string {
  return LONG_CHARACTER_OVERVIEW_PATH;
}

export function longCharacterCoreProfileFileId(characterId: string): string {
  return `file_${characterId}:core-profile`;
}

export function longCharacterRelationshipsFileId(characterId: string): string {
  return `file_${characterId}:relationships`;
}

export function longCharacterCurrentStateFileId(characterId: string): string {
  return `file_${characterId}:current-state`;
}

export function longCharacterHistoryFileId(characterId: string): string {
  return `file_${characterId}:history`;
}

export function longStoryPlotBodyFileId(storyPlotId: string): string {
  return `file_${storyPlotId}:body`;
}

export function longChapterBodyFileId(chapterCardId: string): string {
  return `file_${chapterCardId}:body`;
}

export function longChapterCardFileId(chapterCardId: string): string {
  return `file_${chapterCardId}:card`;
}

export function longChapterCharacterStateFileId(
  chapterCardId: string
): string {
  return `file_${chapterCardId}:character-state`;
}

export function longChapterHandoffFileId(chapterCardId: string): string {
  return `file_${chapterCardId}:handoff`;
}

export function longChapterForeshadowingChangesFileId(
  chapterCardId: string
): string {
  return `file_${chapterCardId}:continuity:foreshadowing-changes`;
}

export function longChapterWorldRevealsFileId(
  chapterCardId: string
): string {
  return `file_${chapterCardId}:continuity:world-reveals`;
}

export function longChapterCharacterCurrentStateFileId(
  chapterCardId: string,
  characterId: string
): string {
  return `file_${chapterCardId}:continuity:character:${characterId}:current-state`;
}

export function longChapterCharacterHistoryFileId(
  chapterCardId: string,
  characterId: string
): string {
  return `file_${chapterCardId}:continuity:character:${characterId}:history`;
}

export function longLedgerCommitFileId(commitId: string): string {
  return `file_${commitId}:ledger`;
}

export const EMPTY_LONG_MARKDOWN_REVISION =
  "v2:0:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" as LongFileRevision;

export const LongChapterBodyStatusSchema = z.enum(["empty", "written"]);
export type LongChapterBodyStatus = z.infer<
  typeof LongChapterBodyStatusSchema
>;

export function longWorldbuildingContentPath(categoryId: string): string {
  return `long/worldbuilding/${categoryId}/content.md`;
}

export function longWorldbuildingOverviewContentPath(
  categoryId: string
): string {
  return `long/worldbuilding/${categoryId}/overview.md`;
}

export function longWorldbuildingItemContentPath(
  categoryId: string,
  itemId: string
): string {
  return `long/worldbuilding/${categoryId}/items/${itemId}.md`;
}

export function longCharacterFilePath(
  characterId: string,
  filename:
    | "core-profile.md"
    | "relationships.md"
    | "current-state.md"
    | "history.md"
): string {
  return `long/characters/${characterId}/${filename}`;
}

export function longChapterFilePath(
  chapterCardId: string,
  filename: "body.md" | "card.md" | "character-state.md" | "handoff.md"
): string {
  return `long/chapters/${chapterCardId}/${filename}`;
}

export function longChapterContinuityFilePath(
  chapterCardId: string,
  filename: "foreshadowing-changes.md" | "world-reveals.md"
): string {
  return `long/continuity/chapters/${chapterCardId}/${filename}`;
}

export function longChapterCharacterContinuityFilePath(
  chapterCardId: string,
  characterId: string,
  filename: "current-state.md" | "history.md"
): string {
  return `long/continuity/chapters/${chapterCardId}/characters/${characterId}/${filename}`;
}

export function longStoryPlotFilePath(
  storyPlotId: string,
  filename: "body.md" = "body.md"
): string {
  return `long/story-plots/${storyPlotId}/${filename}`;
}

export function createEmptyLongMarkdownFileReference(
  id: string,
  path: string,
  updatedAt: string
): LongMarkdownFileReference {
  return LongMarkdownFileReferenceSchema.parse({
    id,
    path,
    revision: EMPTY_LONG_MARKDOWN_REVISION,
    updatedAt
  });
}

export const LONG_BOOK_LINE_FILE_ID = "file_long-book-line" as const;
export const LONG_WORKSPACE_INDEX_FILE_ID =
  "file_long-workspace-index" as const;

export const LongWorldbuildingFormatSchema = z.enum(["list", "text"]);
export type LongWorldbuildingFormat = z.infer<
  typeof LongWorldbuildingFormatSchema
>;

export const LongWorldbuildingItemLayoutSchema = z.enum([
  "top-tabs",
  "right-list",
  "left-tree"
]);
export type LongWorldbuildingItemLayout = z.infer<
  typeof LongWorldbuildingItemLayoutSchema
>;

export const DEFAULT_LONG_WORKSPACE_FEATURE_SETTINGS = {
  worldbuildingItemLayout: "top-tabs",
  characterAndContinuityItemLayout: "top-tabs",
  plotItemLayout: "top-tabs"
} as const;

export const LongWorkspaceFeatureSettingsSchema = z
  .object({
    worldbuildingItemLayout: LongWorldbuildingItemLayoutSchema.default(
      DEFAULT_LONG_WORKSPACE_FEATURE_SETTINGS.worldbuildingItemLayout
    ),
    characterAndContinuityItemLayout: LongWorldbuildingItemLayoutSchema.default(
      DEFAULT_LONG_WORKSPACE_FEATURE_SETTINGS.characterAndContinuityItemLayout
    ),
    plotItemLayout: LongWorldbuildingItemLayoutSchema.default(
      DEFAULT_LONG_WORKSPACE_FEATURE_SETTINGS.plotItemLayout
    )
  })
  .strict();
export type LongWorkspaceFeatureSettings = z.infer<
  typeof LongWorkspaceFeatureSettingsSchema
>;

export const LongWorldbuildingItemSchema = z
  .object({
    id: LongWorldbuildingItemIdSchema,
    title: LongTitleSchema,
    order: z.number().int().positive(),
    file: LongMarkdownFileReferenceSchema
  })
  .strict()
  .superRefine((item, context) => {
    if (item.file.id !== longWorldbuildingItemFileId(item.id)) {
      context.addIssue({
        code: "custom",
        path: ["file", "id"],
        message:
          "Worldbuilding item file id must match its stable item id."
      });
    }
  });
export type LongWorldbuildingItem = z.infer<
  typeof LongWorldbuildingItemSchema
>;

const LongWorldbuildingCategorySharedShape = {
  id: LongWorldbuildingCategoryIdSchema,
  title: LongTitleSchema,
  order: z.number().int().positive()
};

export const LongWorldbuildingListCategorySchema = z
  .object({
    ...LongWorldbuildingCategorySharedShape,
    format: z.literal("list"),
    contentAuthority: z.literal("files"),
    /**
     * Optional only for loading pre-overview v1 projects. All newly-created
     * list categories include this file, and the project store migrates older
     * categories before exposing them.
     */
    overview: LongMarkdownFileReferenceSchema.optional(),
    items: z.array(LongWorldbuildingItemSchema).max(10_000)
  })
  .strict()
  .superRefine((category, context) => {
    if (
      category.overview &&
      category.overview.id !== longWorldbuildingOverviewFileId(category.id)
    ) {
      context.addIssue({
        code: "custom",
        path: ["overview", "id"],
        message:
          "Worldbuilding overview file id must match its stable category id."
      });
    }
    const ids = new Set<string>();
    const fileIds = new Set<string>();
    const paths = new Set<string>();
    category.items.forEach((item, index) => {
      if (ids.has(item.id)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "id"],
          message: `Duplicate worldbuilding item id: ${item.id}`
        });
      }
      if (fileIds.has(item.file.id)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "file", "id"],
          message: `Duplicate worldbuilding item file id: ${item.file.id}`
        });
      }
      if (paths.has(item.file.path)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "file", "path"],
          message: `Duplicate worldbuilding item file path: ${item.file.path}`
        });
      }
      ids.add(item.id);
      fileIds.add(item.file.id);
      paths.add(item.file.path);
    });
  });
export type LongWorldbuildingListCategory = z.infer<
  typeof LongWorldbuildingListCategorySchema
>;

export const LongWorldbuildingTextCategorySchema = z
  .object({
    ...LongWorldbuildingCategorySharedShape,
    format: z.literal("text"),
    contentAuthority: z.literal("markdown"),
    file: LongMarkdownFileReferenceSchema
  })
  .strict()
  .superRefine((category, context) => {
    if (category.file.id !== longWorldbuildingFileId(category.id)) {
      context.addIssue({
        code: "custom",
        path: ["file", "id"],
        message:
          "Worldbuilding text file id must match its stable category id."
      });
    }
  });
export type LongWorldbuildingTextCategory = z.infer<
  typeof LongWorldbuildingTextCategorySchema
>;

export const LongWorldbuildingCategorySchema = z.discriminatedUnion("format", [
  LongWorldbuildingListCategorySchema,
  LongWorldbuildingTextCategorySchema
]);
export type LongWorldbuildingCategory = z.infer<
  typeof LongWorldbuildingCategorySchema
>;

export const LONG_BUILTIN_CHARACTER_TYPE_IDS = [
  "protagonist",
  "major_supporting",
  "minor_supporting",
  "passerby"
] as const;
/** @deprecated Use LONG_BUILTIN_CHARACTER_TYPE_IDS. */
export const LONG_CHARACTER_GROUPS = LONG_BUILTIN_CHARACTER_TYPE_IDS;
export const LongCharacterTypeIdSchema = z.union([
  z.enum(LONG_BUILTIN_CHARACTER_TYPE_IDS),
  LongCustomCharacterTypeIdSchema
]);
export type LongCharacterTypeId = z.infer<typeof LongCharacterTypeIdSchema>;
/** @deprecated The serialized `group` field now stores a character type id. */
export const LongCharacterGroupSchema = LongCharacterTypeIdSchema;
export type LongCharacterGroup = z.infer<typeof LongCharacterGroupSchema>;

export const LongCharacterTypeSchema = z
  .object({
    id: LongCharacterTypeIdSchema,
    title: LongTitleSchema,
    order: z.number().int().positive()
  })
  .strict();
export type LongCharacterType = z.infer<typeof LongCharacterTypeSchema>;

export const DEFAULT_LONG_CHARACTER_TYPES: readonly LongCharacterType[] = [
  { id: "protagonist", title: "主角", order: 1 },
  { id: "major_supporting", title: "主要配角", order: 2 },
  { id: "minor_supporting", title: "次要配角", order: 3 },
  { id: "passerby", title: "路人", order: 4 }
];

const UniqueAliasListSchema = z
  .array(z.string().trim().min(1).max(120))
  .max(64)
  .superRefine((values, context) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: `Duplicate character alias: ${value}`
        });
      }
      seen.add(value);
    });
  });

export const LongCharacterSchema = z
  .object({
    id: LongCharacterIdSchema,
    name: LongTitleSchema,
    group: LongCharacterGroupSchema,
    order: z.number().int().positive(),
    aliases: UniqueAliasListSchema
  })
  .strict();
export type LongCharacter = z.infer<typeof LongCharacterSchema>;

export const LongCharacterFileIndexEntrySchema = z
  .object({
    characterId: LongCharacterIdSchema,
    coreProfile: LongMarkdownFileReferenceSchema,
    relationships: LongMarkdownFileReferenceSchema,
    currentState: LongMarkdownFileReferenceSchema,
    history: LongMarkdownFileReferenceSchema
  })
  .strict()
  .superRefine((entry, context) => {
    const expectedIds = [
      longCharacterCoreProfileFileId(entry.characterId),
      longCharacterRelationshipsFileId(entry.characterId),
      longCharacterCurrentStateFileId(entry.characterId),
      longCharacterHistoryFileId(entry.characterId)
    ];
    const files = [
      entry.coreProfile,
      entry.relationships,
      entry.currentState,
      entry.history
    ];
    const fields = [
      "coreProfile",
      "relationships",
      "currentState",
      "history"
    ] as const;
    files.forEach((file, index) => {
      if (file.id !== expectedIds[index]) {
        context.addIssue({
          code: "custom",
          path: [fields[index]!, "id"],
          message:
            "Character file id must match its stable character id and role."
        });
      }
    });
  });
export type LongCharacterFileIndexEntry = z.infer<
  typeof LongCharacterFileIndexEntrySchema
>;

export const LongVolumeSchema = z
  .object({
    id: LongVolumeIdSchema,
    title: LongTitleSchema,
    order: z.number().int().positive(),
    summary: LongTextSchema
  })
  .strict();
export type LongVolume = z.infer<typeof LongVolumeSchema>;

export const LongArcSchema = z
  .object({
    id: LongArcIdSchema,
    volumeId: LongVolumeIdSchema,
    title: LongTitleSchema,
    order: z.number().int().positive(),
    summary: LongTextSchema.optional(),
    outline: LongTextSchema
  })
  .strict();
export type LongArc = z.infer<typeof LongArcSchema>;

const UniqueCharacterReferenceListSchema = z
  .array(LongCharacterIdSchema)
  .max(1_024)
  .superRefine((values, context) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: `Duplicate character reference: ${value}`
        });
      }
      seen.add(value);
    });
  });

const UniqueArcReferenceListSchema = z
  .array(LongArcIdSchema)
  .max(1_024)
  .superRefine((values, context) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: `Duplicate arc reference: ${value}`
        });
      }
      seen.add(value);
    });
  });

/**
 * A chapter card under a volume. The card owns one Markdown body file
 * (`card.md` in the chapter directory) that holds the chapter plan text;
 * content is written through the plot-design write/edit tools, mirroring the
 * story-plot pattern. Legacy structured fields (outline / worldConstraints /
 * characterIds) were removed and are migrated into the card file at load time.
 */
export const LongChapterCardSchema = z
  .object({
    id: LongChapterCardIdSchema,
    volumeId: LongVolumeIdSchema,
    primaryArcId: LongArcIdSchema.nullable(),
    title: LongTitleSchema,
    narrativeOrder: z.number().int().positive()
  })
  .strict();
export type LongChapterCard = z.infer<typeof LongChapterCardSchema>;

export const LongStoryTimeModeSchema = z.enum([
  "exact",
  "relative",
  "sequence",
  "unknown"
]);
export type LongStoryTimeMode = z.infer<typeof LongStoryTimeModeSchema>;

export const LongStoryEventSchema = z
  .object({
    id: LongStoryEventIdSchema,
    title: LongTitleSchema,
    summary: LongTextSchema,
    timeMode: LongStoryTimeModeSchema,
    timeLabel: z.string().max(1_000),
    /** Machine-sortable or source-specific time value kept separate from its display label. */
    timeValue: z.string().max(1_000).optional(),
    storyOrder: z.number().int().positive(),
    location: z.string().max(1_000),
    arcIds: UniqueArcReferenceListSchema,
    characterIds: UniqueCharacterReferenceListSchema
  })
  .strict();
export type LongStoryEvent = z.infer<typeof LongStoryEventSchema>;

/**
 * A story-plot beat under a plot point (arc). Each entry owns one Markdown body
 * file; the arc.outline field is retained only for legacy compatibility and is
 * no longer the UI editing surface for「故事情节」.
 */
export const LongStoryPlotSchema = z
  .object({
    id: LongStoryPlotIdSchema,
    arcId: LongArcIdSchema,
    title: LongTitleSchema,
    order: z.number().int().positive(),
    file: LongMarkdownFileReferenceSchema
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.file.id !== longStoryPlotBodyFileId(entry.id)) {
      context.addIssue({
        code: "custom",
        path: ["file", "id"],
        message:
          "Story-plot file id must match its stable story-plot id and body role."
      });
    }
  });
export type LongStoryPlot = z.infer<typeof LongStoryPlotSchema>;

export const LONG_EVENT_CONNECTION_TYPES = [
  "before",
  "same_time",
  "overlaps",
  "causes",
  "enables",
  "conceals"
] as const;
export const LongEventConnectionTypeSchema = z.enum(
  LONG_EVENT_CONNECTION_TYPES
);
export type LongEventConnectionType = z.infer<
  typeof LongEventConnectionTypeSchema
>;

export const LongEventConnectionSchema = z
  .object({
    id: LongEventConnectionIdSchema,
    sourceEventId: LongStoryEventIdSchema,
    targetEventId: LongStoryEventIdSchema,
    type: LongEventConnectionTypeSchema,
    note: LongShortTextSchema
  })
  .strict()
  .superRefine((connection, context) => {
    if (connection.sourceEventId === connection.targetEventId) {
      context.addIssue({
        code: "custom",
        path: ["targetEventId"],
        message: "Event connections cannot reference the same event twice."
      });
    }
  });
export type LongEventConnection = z.infer<
  typeof LongEventConnectionSchema
>;

export const LONG_NARRATIVE_MODES = [
  "scene",
  "flashback",
  "retelling",
  "clue",
  "misdirection",
  "reveal",
  "dream",
  "prophecy"
] as const;
export const LongNarrativeModeSchema = z.enum(LONG_NARRATIVE_MODES);
export type LongNarrativeMode = z.infer<typeof LongNarrativeModeSchema>;

export const LongDisclosureLevelSchema = z.enum([
  "hint",
  "partial",
  "full",
  "false"
]);
export type LongDisclosureLevel = z.infer<
  typeof LongDisclosureLevelSchema
>;

export const LongExecutionStatusSchema = z.enum([
  "planned",
  "written",
  "committed",
  "missed"
]);
export type LongExecutionStatus = z.infer<
  typeof LongExecutionStatusSchema
>;

function validateExecutionCommit(
  value: { status: LongExecutionStatus; commitId: string | null },
  context: z.core.$RefinementCtx<unknown>
): void {
  const finalized =
    value.status === "committed" || value.status === "missed";
  if (finalized !== (value.commitId !== null)) {
    context.addIssue({
      code: "custom",
      path: ["commitId"],
      message:
        "Only committed or missed execution records may reference a ledger commit."
    });
  }
}

export const LongNarrativePlacementSchema = z
  .object({
    id: LongNarrativePlacementIdSchema,
    eventId: LongStoryEventIdSchema,
    chapterCardId: LongChapterCardIdSchema,
    orderInChapter: z.number().int().positive(),
    mode: LongNarrativeModeSchema,
    disclosure: LongDisclosureLevelSchema,
    writingPrompt: LongShortTextSchema,
    status: LongExecutionStatusSchema,
    commitId: LongLedgerCommitIdSchema.nullable()
  })
  .strict()
  .superRefine(validateExecutionCommit);
export type LongNarrativePlacement = z.infer<
  typeof LongNarrativePlacementSchema
>;

export const LONG_FORESHADOWING_BEAT_TYPES = [
  "source",
  "plant",
  "reinforce",
  "misdirect",
  "partial_reveal",
  "reveal",
  "payoff",
  "aftermath"
] as const;
export const LongForeshadowingBeatTypeSchema = z.enum(
  LONG_FORESHADOWING_BEAT_TYPES
);
export type LongForeshadowingBeatType = z.infer<
  typeof LongForeshadowingBeatTypeSchema
>;

export const LONG_FORESHADOWING_SPANS = [
  "local",
  "within_volume",
  "cross_volume"
] as const;
export const LongForeshadowingSpanSchema = z.enum(
  LONG_FORESHADOWING_SPANS
);
export type LongForeshadowingSpan = z.infer<
  typeof LongForeshadowingSpanSchema
>;

export const LongForeshadowingBeatSchema = z
  .object({
    id: LongForeshadowingBeatIdSchema,
    type: LongForeshadowingBeatTypeSchema,
    order: z.number().int().positive(),
    /**
     * Planning anchors are intentionally independent from chapter execution
     * anchors. A beat may first be assigned only to a volume, then refined to
     * a plot point before its concrete event/chapter placement is known.
     */
    volumeId: LongVolumeIdSchema.nullable().optional(),
    arcId: LongArcIdSchema.nullable().optional(),
    eventId: LongStoryEventIdSchema.nullable(),
    placementId: LongNarrativePlacementIdSchema.nullable(),
    chapterCardId: LongChapterCardIdSchema.nullable(),
    plannedScope: z.string().max(1_000),
    note: LongShortTextSchema,
    status: LongExecutionStatusSchema,
    commitId: LongLedgerCommitIdSchema.nullable()
  })
  .strict()
  .superRefine((beat, context) => {
    validateExecutionCommit(beat, context);
    if (
      beat.commitId !== null &&
      beat.chapterCardId === null &&
      beat.placementId === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["chapterCardId"],
        message:
          "A finalized foreshadowing beat must resolve to a concrete chapter."
      });
    }
    if (
      beat.eventId === null &&
      beat.placementId === null &&
      beat.chapterCardId === null &&
      (beat.volumeId ?? null) === null &&
      (beat.arcId ?? null) === null &&
      beat.plannedScope.trim().length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["plannedScope"],
        message:
          "A foreshadowing beat must reference a planning/execution anchor or a planned scope."
      });
    }
  });
export type LongForeshadowingBeat = z.infer<
  typeof LongForeshadowingBeatSchema
>;

export const LongForeshadowingStatusSchema = z.enum([
  "planned",
  "open",
  "progressing",
  "resolved",
  "abandoned"
]);
export type LongForeshadowingStatus = z.infer<
  typeof LongForeshadowingStatusSchema
>;

export function deriveLongForeshadowingStatusFromCommittedBeats(
  beats: ReadonlyArray<
    Pick<LongForeshadowingBeat, "status" | "type">
  >
): Exclude<LongForeshadowingStatus, "abandoned"> {
  const committedTypes = new Set(
    beats
      .filter(({ status }) => status === "committed")
      .map(({ type }) => type)
  );
  if (committedTypes.has("reveal") || committedTypes.has("payoff")) {
    return "resolved";
  }
  if (
    committedTypes.has("reinforce") ||
    committedTypes.has("misdirect") ||
    committedTypes.has("partial_reveal")
  ) {
    return "progressing";
  }
  if (committedTypes.has("plant")) return "open";
  return "planned";
}

export const LongForeshadowingSchema = z
  .object({
    id: LongForeshadowingIdSchema,
    title: LongTitleSchema,
    coreQuestion: LongTextSchema,
    hiddenTruth: LongTextSchema.optional(),
    plannedSpan: LongForeshadowingSpanSchema.optional(),
    truthEventId: LongStoryEventIdSchema.nullable(),
    expectedReaderEffect: LongTextSchema,
    status: LongForeshadowingStatusSchema,
    beats: z.array(LongForeshadowingBeatSchema).max(10_000)
  })
  .strict();
export type LongForeshadowing = z.infer<
  typeof LongForeshadowingSchema
>;

export const LongPlotIndexSchema = z
  .object({
    volumes: z.array(LongVolumeSchema).min(1).max(10_000),
    arcs: z.array(LongArcSchema).max(100_000),
    chapterCards: z.array(LongChapterCardSchema).max(100_000),
    storyEvents: z.array(LongStoryEventSchema).max(200_000),
    storyPlots: z.array(LongStoryPlotSchema).max(200_000).default([]),
    eventConnections: z
      .array(LongEventConnectionSchema)
      .max(400_000),
    narrativePlacements: z
      .array(LongNarrativePlacementSchema)
      .max(400_000),
    foreshadowing: z.array(LongForeshadowingSchema).max(100_000)
  })
  .strict();
export type LongPlotIndex = z.infer<typeof LongPlotIndexSchema>;

export const LongChapterCharacterContinuityFileIndexEntrySchema = z
  .object({
    characterId: LongCharacterIdSchema,
    currentState: LongMarkdownFileReferenceSchema,
    history: LongMarkdownFileReferenceSchema
  })
  .strict();
export type LongChapterCharacterContinuityFileIndexEntry = z.infer<
  typeof LongChapterCharacterContinuityFileIndexEntrySchema
>;

const LongChapterFileIndexEntryObjectSchema = z
  .object({
    chapterCardId: LongChapterCardIdSchema,
    body: LongMarkdownFileReferenceSchema,
    card: LongMarkdownFileReferenceSchema,
    characterState: LongMarkdownFileReferenceSchema,
    handoff: LongMarkdownFileReferenceSchema,
    foreshadowingChanges: LongMarkdownFileReferenceSchema.optional(),
    worldReveals: LongMarkdownFileReferenceSchema.nullable().default(null),
    characterContinuity: z
      .array(LongChapterCharacterContinuityFileIndexEntrySchema)
      .max(100_000)
      .default([]),
    bodyStatus: LongChapterBodyStatusSchema.optional(),
    commitId: LongLedgerCommitIdSchema.nullable()
  })
  .strict();

export const LongChapterFileIndexEntrySchema =
  LongChapterFileIndexEntryObjectSchema.transform((entry) => ({
    ...entry,
    bodyStatus: entry.bodyStatus ?? "empty",
    foreshadowingChanges:
      entry.foreshadowingChanges ??
      createEmptyLongMarkdownFileReference(
        longChapterForeshadowingChangesFileId(entry.chapterCardId),
        longChapterContinuityFilePath(
          entry.chapterCardId,
          "foreshadowing-changes.md"
        ),
        entry.body.updatedAt
      )
  }))
  .superRefine((entry, context) => {
    const files = [entry.body, entry.card, entry.characterState, entry.handoff];
    const expectedIds = [
      longChapterBodyFileId(entry.chapterCardId),
      longChapterCardFileId(entry.chapterCardId),
      longChapterCharacterStateFileId(entry.chapterCardId),
      longChapterHandoffFileId(entry.chapterCardId)
    ];
    const fields = ["body", "card", "characterState", "handoff"] as const;
    files.forEach((file, index) => {
      if (file.id !== expectedIds[index]) {
        context.addIssue({
          code: "custom",
          path: [fields[index]!, "id"],
          message:
            "Chapter file id must match its stable chapter-card id and role."
        });
      }
    });

    if (
      entry.foreshadowingChanges.id !==
      longChapterForeshadowingChangesFileId(entry.chapterCardId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["foreshadowingChanges", "id"],
        message:
          "Foreshadowing changes file id must match its stable chapter-card id."
      });
    }
    if (
      entry.foreshadowingChanges.path !==
      longChapterContinuityFilePath(
        entry.chapterCardId,
        "foreshadowing-changes.md"
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["foreshadowingChanges", "path"],
        message:
          "Foreshadowing changes must use the chapter continuity path."
      });
    }
    if (entry.worldReveals) {
      if (
        entry.worldReveals.id !==
        longChapterWorldRevealsFileId(entry.chapterCardId)
      ) {
        context.addIssue({
          code: "custom",
          path: ["worldReveals", "id"],
          message:
            "World reveals file id must match its stable chapter-card id."
        });
      }
      if (
        entry.worldReveals.path !==
        longChapterContinuityFilePath(
          entry.chapterCardId,
          "world-reveals.md"
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["worldReveals", "path"],
          message: "World reveals must use the chapter continuity path."
        });
      }
    }

    const characterIds = new Set<string>();
    entry.characterContinuity.forEach((character, index) => {
      if (characterIds.has(character.characterId)) {
        context.addIssue({
          code: "custom",
          path: ["characterContinuity", index, "characterId"],
          message:
            "Chapter character continuity entries must have unique character ids."
        });
      }
      characterIds.add(character.characterId);
      const expectedCurrentStateId =
        longChapterCharacterCurrentStateFileId(
          entry.chapterCardId,
          character.characterId
        );
      const expectedHistoryId = longChapterCharacterHistoryFileId(
        entry.chapterCardId,
        character.characterId
      );
      const expectedCurrentStatePath =
        longChapterCharacterContinuityFilePath(
          entry.chapterCardId,
          character.characterId,
          "current-state.md"
        );
      const expectedHistoryPath =
        longChapterCharacterContinuityFilePath(
          entry.chapterCardId,
          character.characterId,
          "history.md"
        );
      if (character.currentState.id !== expectedCurrentStateId) {
        context.addIssue({
          code: "custom",
          path: ["characterContinuity", index, "currentState", "id"],
          message:
            "Character current-state file id must match its chapter and character ids."
        });
      }
      if (character.currentState.path !== expectedCurrentStatePath) {
        context.addIssue({
          code: "custom",
          path: ["characterContinuity", index, "currentState", "path"],
          message:
            "Character current-state must use the chapter continuity path."
        });
      }
      if (character.history.id !== expectedHistoryId) {
        context.addIssue({
          code: "custom",
          path: ["characterContinuity", index, "history", "id"],
          message:
            "Character history file id must match its chapter and character ids."
        });
      }
      if (character.history.path !== expectedHistoryPath) {
        context.addIssue({
          code: "custom",
          path: ["characterContinuity", index, "history", "path"],
          message: "Character history must use the chapter continuity path."
        });
      }
    });
  });
export type LongChapterFileIndexEntry = z.infer<
  typeof LongChapterFileIndexEntrySchema
>;

const UniquePlacementIdListSchema = z
  .array(LongNarrativePlacementIdSchema)
  .max(100_000)
  .superRefine((values, context) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: `Duplicate placement decision: ${value}`
        });
      }
      seen.add(value);
    });
  });

const UniqueForeshadowingBeatIdListSchema = z
  .array(LongForeshadowingBeatIdSchema)
  .max(100_000)
  .superRefine((values, context) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: `Duplicate foreshadowing-beat decision: ${value}`
        });
      }
      seen.add(value);
    });
  });

export const LONG_CONTINUITY_DOMAINS = [
  "character",
  "relationship",
  "world",
  "plot",
  "foreshadowing"
] as const;
export const LongContinuityDomainSchema = z.enum(
  LONG_CONTINUITY_DOMAINS
);
export type LongContinuityDomain = z.infer<
  typeof LongContinuityDomainSchema
>;

export const LongContinuityFactFieldSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((value) => !/[\r\n\0]/u.test(value), {
    message: "Continuity fact fields must use one safe line."
  });
export type LongContinuityFactField = z.infer<
  typeof LongContinuityFactFieldSchema
>;

const LongContinuityEvidenceSchema = z.string().trim().min(1).max(4_000);
const LongContinuityFactValueSchema = z
  .string()
  .trim()
  .min(1)
  .max(200_000);

export const LongContinuityFactSchema = z
  .object({
    factId: LongContinuityFactIdSchema,
    domain: LongContinuityDomainSchema,
    subjectId: LongStableIdSchema,
    field: LongContinuityFactFieldSchema,
    value: LongContinuityFactValueSchema,
    sourceCommitId: LongLedgerCommitIdSchema,
    sourceChapterCardId: LongChapterCardIdSchema,
    evidence: LongContinuityEvidenceSchema
  })
  .strict();
export type LongContinuityFact = z.infer<
  typeof LongContinuityFactSchema
>;

function continuityFactKey(
  value: Pick<LongContinuityFact, "domain" | "subjectId" | "field">
): string {
  return `${value.domain}\0${value.subjectId}\0${value.field.normalize("NFC")}`;
}

export const LongContinuityFactListSchema = z
  .array(LongContinuityFactSchema)
  .max(200_000)
  .superRefine((facts, context) => {
    const ids = new Set<string>();
    const keys = new Set<string>();
    facts.forEach((fact, index) => {
      if (ids.has(fact.factId)) {
        context.addIssue({
          code: "custom",
          path: [index, "factId"],
          message: `Duplicate continuity fact id: ${fact.factId}`
        });
      }
      ids.add(fact.factId);
      const key = continuityFactKey(fact);
      if (keys.has(key)) {
        context.addIssue({
          code: "custom",
          path: [index, "field"],
          message:
            "Continuity facts must be unique by domain, subject id and field."
        });
      }
      keys.add(key);
    });
  });

export const LONG_CONTINUITY_AUDIENCE_TYPES = [
  "reader",
  "character",
  "faction"
] as const;
export const LongContinuityAudienceTypeSchema = z.enum(
  LONG_CONTINUITY_AUDIENCE_TYPES
);
export type LongContinuityAudienceType = z.infer<
  typeof LongContinuityAudienceTypeSchema
>;

export const LONG_CONTINUITY_KNOWLEDGE_LEVELS = [
  "unknown",
  "suspects",
  "believes",
  "knows",
  "misled"
] as const;
export const LongContinuityKnowledgeLevelSchema = z.enum(
  LONG_CONTINUITY_KNOWLEDGE_LEVELS
);
export type LongContinuityKnowledgeLevel = z.infer<
  typeof LongContinuityKnowledgeLevelSchema
>;

export const LongContinuityKnowledgeSchema = z
  .object({
    factId: LongContinuityFactIdSchema,
    audienceType: LongContinuityAudienceTypeSchema,
    audienceId: LongStableIdSchema.nullable(),
    level: LongContinuityKnowledgeLevelSchema,
    sourceCommitId: LongLedgerCommitIdSchema,
    sourceChapterCardId: LongChapterCardIdSchema,
    evidence: LongContinuityEvidenceSchema
  })
  .strict()
  .superRefine((knowledge, context) => {
    if (
      (knowledge.audienceType === "reader") !==
      (knowledge.audienceId === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["audienceId"],
        message:
          "Reader knowledge must use a null audience id; character and faction knowledge require one."
      });
    }
    if (
      knowledge.audienceType === "character" &&
      !knowledge.audienceId?.startsWith("character_")
    ) {
      context.addIssue({
        code: "custom",
        path: ["audienceId"],
        message: "Character knowledge requires a stable character id."
      });
    }
  });
export type LongContinuityKnowledge = z.infer<
  typeof LongContinuityKnowledgeSchema
>;

function continuityKnowledgeKey(
  value: Pick<
    LongContinuityKnowledge,
    "factId" | "audienceType" | "audienceId"
  >
): string {
  return `${value.factId}\0${value.audienceType}\0${value.audienceId ?? ""}`;
}

export const LongContinuityKnowledgeListSchema = z
  .array(LongContinuityKnowledgeSchema)
  .max(400_000)
  .superRefine((entries, context) => {
    const keys = new Set<string>();
    entries.forEach((entry, index) => {
      const key = continuityKnowledgeKey(entry);
      if (keys.has(key)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message:
            "Continuity knowledge must be unique by fact and audience."
        });
      }
      keys.add(key);
    });
  });

export const LONG_CONTINUITY_OPEN_LOOP_KINDS = [
  "character",
  "relationship",
  "world",
  "plot",
  "foreshadowing",
  "knowledge",
  "continuity"
] as const;
export const LongContinuityOpenLoopKindSchema = z.enum(
  LONG_CONTINUITY_OPEN_LOOP_KINDS
);
export type LongContinuityOpenLoopKind = z.infer<
  typeof LongContinuityOpenLoopKindSchema
>;

export const LONG_CONTINUITY_OPEN_LOOP_STATUSES = [
  "open",
  "progressing",
  "resolved",
  "abandoned"
] as const;
export const LongContinuityOpenLoopStatusSchema = z.enum(
  LONG_CONTINUITY_OPEN_LOOP_STATUSES
);
export type LongContinuityOpenLoopStatus = z.infer<
  typeof LongContinuityOpenLoopStatusSchema
>;

export const LongContinuityOpenLoopSchema = z
  .object({
    loopId: LongContinuityOpenLoopIdSchema,
    kind: LongContinuityOpenLoopKindSchema,
    status: LongContinuityOpenLoopStatusSchema,
    detail: z.string().trim().min(1).max(200_000),
    subjectId: LongStableIdSchema.nullable(),
    factId: LongContinuityFactIdSchema.nullable(),
    sourceCommitId: LongLedgerCommitIdSchema,
    sourceChapterCardId: LongChapterCardIdSchema,
    evidence: LongContinuityEvidenceSchema
  })
  .strict();
export type LongContinuityOpenLoop = z.infer<
  typeof LongContinuityOpenLoopSchema
>;

export const LongContinuityOpenLoopListSchema = z
  .array(LongContinuityOpenLoopSchema)
  .max(200_000)
  .superRefine((loops, context) => {
    const ids = new Set<string>();
    loops.forEach((loop, index) => {
      if (ids.has(loop.loopId)) {
        context.addIssue({
          code: "custom",
          path: [index, "loopId"],
          message: `Duplicate continuity open-loop id: ${loop.loopId}`
        });
      }
      ids.add(loop.loopId);
    });
  });

const UniqueContinuityTextListSchema = z
  .array(z.string().trim().min(1).max(4_000))
  .max(1_024)
  .superRefine((values, context) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      const key = value.normalize("NFC");
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: "Continuity handoff lists cannot contain duplicates."
        });
      }
      seen.add(key);
    });
  });

const UniqueContinuityOpenLoopIdListSchema = z
  .array(LongContinuityOpenLoopIdSchema)
  .max(100_000)
  .superRefine((values, context) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: `Duplicate continuity open-loop reference: ${value}`
        });
      }
      seen.add(value);
    });
  });

export const LongContinuityHandoffSchema = z
  .object({
    summary: z.string().trim().min(1).max(200_000),
    mustCarry: UniqueContinuityTextListSchema,
    nextChapterConstraints: UniqueContinuityTextListSchema,
    openLoops: UniqueContinuityOpenLoopIdListSchema
  })
  .strict();
export type LongContinuityHandoff = z.infer<
  typeof LongContinuityHandoffSchema
>;

export const LongContinuityLatestHandoffSchema =
  LongContinuityHandoffSchema.extend({
    chapterCardId: LongChapterCardIdSchema,
    commitId: LongLedgerCommitIdSchema
  });
export type LongContinuityLatestHandoff = z.infer<
  typeof LongContinuityLatestHandoffSchema
>;

export const LongContinuityProjectionSchema = z
  .object({
    throughCommitId: LongLedgerCommitIdSchema.nullable(),
    facts: LongContinuityFactListSchema,
    knowledge: LongContinuityKnowledgeListSchema,
    openLoops: LongContinuityOpenLoopListSchema,
    latestHandoff: LongContinuityLatestHandoffSchema.nullable()
  })
  .strict()
  .superRefine((projection, context) => {
    const factIds = new Set(projection.facts.map(({ factId }) => factId));
    projection.knowledge.forEach((knowledge, index) => {
      if (!factIds.has(knowledge.factId)) {
        context.addIssue({
          code: "custom",
          path: ["knowledge", index, "factId"],
          message: "Continuity knowledge must reference a projected fact."
        });
      }
    });
    const loopIds = new Set(projection.openLoops.map(({ loopId }) => loopId));
    projection.latestHandoff?.openLoops.forEach((loopId, index) => {
      if (!loopIds.has(loopId)) {
        context.addIssue({
          code: "custom",
          path: ["latestHandoff", "openLoops", index],
          message:
            "The latest continuity handoff must reference a projected open loop."
        });
      }
    });
    if (
      projection.latestHandoff &&
      projection.latestHandoff.commitId !== projection.throughCommitId
    ) {
      context.addIssue({
        code: "custom",
        path: ["latestHandoff", "commitId"],
        message:
          "The latest handoff commit must match the projection watermark."
      });
    }
  });
export type LongContinuityProjection = z.infer<
  typeof LongContinuityProjectionSchema
>;

export const EMPTY_LONG_CONTINUITY_PROJECTION: LongContinuityProjection = {
  throughCommitId: null,
  facts: [],
  knowledge: [],
  openLoops: [],
  latestHandoff: null
};

export const LongLedgerCommitIndexEntrySchema = z
  .object({
    id: LongLedgerCommitIdSchema,
    mode: z
      .enum(["structured", "text_files", "import_checkpoint"])
      .default("structured"),
    sequence: z.number().int().positive(),
    chapterCardId: LongChapterCardIdSchema,
    committedAt: LongTimestampSchema,
    reversible: z.boolean(),
    sourceRevision: LongRevisionSchema,
    placementIds: UniquePlacementIdListSchema,
    foreshadowingBeatIds: UniqueForeshadowingBeatIdListSchema,
    recordFile: LongJsonFileReferenceSchema
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.recordFile.id !== longLedgerCommitFileId(entry.id)) {
      context.addIssue({
        code: "custom",
        path: ["recordFile", "id"],
        message: "Ledger record file id must match its stable commit id."
      });
    }
  });
export type LongLedgerCommitIndexEntry = z.infer<
  typeof LongLedgerCommitIndexEntrySchema
>;

export const LongLedgerCommitIndexSchema = z
  .object({
    committedThroughChapterId: LongChapterCardIdSchema.nullable(),
    commits: z.array(LongLedgerCommitIndexEntrySchema).max(100_000),
    projection: LongContinuityProjectionSchema.default(
      EMPTY_LONG_CONTINUITY_PROJECTION
    )
  })
  .strict();
export type LongLedgerCommitIndex = z.infer<
  typeof LongLedgerCommitIndexSchema
>;

const LongWorkspaceIndexSnapshotObjectSchema = z
  .object({
    schemaVersion: LongWorkspaceSchemaVersionSchema,
    revision: LongRevisionSchema,
    bookId: LongBookIdSchema,
    updatedAt: LongTimestampSchema,
    bookLine: LongMarkdownFileReferenceSchema,
    featureSettings: LongWorkspaceFeatureSettingsSchema.default(
      DEFAULT_LONG_WORKSPACE_FEATURE_SETTINGS
    ),
    worldbuilding: z
      .array(LongWorldbuildingCategorySchema)
      .max(10_000),
    /**
     * Optional only for loading pre-overview projects. All newly-created books
     * include this file, and the project store migrates older indexes before
     * exposing them.
     */
    characterOverview: LongMarkdownFileReferenceSchema.optional(),
    characterTypes: z
      .array(LongCharacterTypeSchema)
      .min(1)
      .max(10_000)
      .default(() => DEFAULT_LONG_CHARACTER_TYPES.map((value) => ({ ...value }))),
    characters: z.array(LongCharacterSchema).max(100_000),
    characterFiles: z
      .array(LongCharacterFileIndexEntrySchema)
      .max(100_000),
    plot: LongPlotIndexSchema,
    chapters: z
      .array(LongChapterFileIndexEntrySchema)
      .max(100_000),
    ledger: LongLedgerCommitIndexSchema
  })
  .strict();

type LongWorkspaceIndexSnapshotInput = z.infer<
  typeof LongWorkspaceIndexSnapshotObjectSchema
>;

type ValidationPath = Array<string | number>;

function addIssue(
  context: z.core.$RefinementCtx<unknown>,
  path: ValidationPath,
  message: string
): void {
  context.addIssue({ code: "custom", path, message });
}

function validateUniqueValues(
  values: readonly string[],
  pathForIndex: (index: number) => ValidationPath,
  label: string,
  context: z.core.$RefinementCtx<unknown>
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      addIssue(
        context,
        pathForIndex(index),
        `Duplicate ${label}: ${value}`
      );
    }
    seen.add(value);
  });
}

function validateContiguousOrder(
  entries: ReadonlyArray<{ index: number; order: number }>,
  pathForIndex: (index: number) => ValidationPath,
  label: string,
  context: z.core.$RefinementCtx<unknown>
): void {
  const sorted = [...entries].sort((left, right) => left.order - right.order);
  sorted.forEach((entry, index) => {
    if (entry.order !== index + 1) {
      addIssue(
        context,
        pathForIndex(entry.index),
        `${label} order must be unique and contiguous from 1.`
      );
    }
  });
}

function groupOrderedEntries<T>(
  values: readonly T[],
  groupFor: (value: T) => string,
  orderFor: (value: T) => number
): Map<string, Array<{ index: number; order: number }>> {
  const groups = new Map<
    string,
    Array<{ index: number; order: number }>
  >();
  values.forEach((value, index) => {
    const group = groupFor(value);
    const entries = groups.get(group) ?? [];
    entries.push({ index, order: orderFor(value) });
    groups.set(group, entries);
  });
  return groups;
}

function hasBeforeCycle(
  eventIds: readonly string[],
  connections: LongEventConnection[]
): boolean {
  const adjacency = new Map<string, string[]>(
    eventIds.map((eventId) => [eventId, []])
  );
  const indegree = new Map<string, number>(
    eventIds.map((eventId) => [eventId, 0])
  );
  for (const connection of connections) {
    if (connection.type !== "before") continue;
    if (
      !adjacency.has(connection.sourceEventId) ||
      !indegree.has(connection.targetEventId)
    ) {
      continue;
    }
    adjacency.get(connection.sourceEventId)!.push(connection.targetEventId);
    indegree.set(
      connection.targetEventId,
      indegree.get(connection.targetEventId)! + 1
    );
  }
  const ready = eventIds.filter((eventId) => indegree.get(eventId) === 0);
  let head = 0;
  let visited = 0;
  while (head < ready.length) {
    const eventId = ready[head++]!;
    visited += 1;
    for (const target of adjacency.get(eventId) ?? []) {
      const next = indegree.get(target)! - 1;
      indegree.set(target, next);
      if (next === 0) ready.push(target);
    }
  }
  return visited !== eventIds.length;
}

function validateLongWorkspaceIndexSnapshot(
  snapshot: LongWorkspaceIndexSnapshotInput,
  context: z.core.$RefinementCtx<unknown>
): void {
  if (snapshot.bookLine.id !== LONG_BOOK_LINE_FILE_ID) {
    addIssue(
      context,
      ["bookLine", "id"],
      `Book-line file id must be ${LONG_BOOK_LINE_FILE_ID}.`
    );
  }
  if (
    snapshot.characterOverview &&
    snapshot.characterOverview.id !== LONG_CHARACTER_OVERVIEW_FILE_ID
  ) {
    addIssue(
      context,
      ["characterOverview", "id"],
      `Character overview file id must be ${LONG_CHARACTER_OVERVIEW_FILE_ID}.`
    );
  }
  if (
    snapshot.characterOverview &&
    snapshot.characterOverview.path !== LONG_CHARACTER_OVERVIEW_PATH
  ) {
    addIssue(
      context,
      ["characterOverview", "path"],
      `Character overview file path must be ${LONG_CHARACTER_OVERVIEW_PATH}.`
    );
  }

  validateUniqueValues(
    snapshot.worldbuilding.map(({ id }) => id),
    (index) => ["worldbuilding", index, "id"],
    "worldbuilding category id",
    context
  );
  validateContiguousOrder(
    snapshot.worldbuilding.map(({ order }, index) => ({ index, order })),
    (index) => ["worldbuilding", index, "order"],
    "Worldbuilding category",
    context
  );
  const worldbuildingIds = new Set(
    snapshot.worldbuilding.map(({ id }) => id)
  );
  validateUniqueValues(
    snapshot.worldbuilding.flatMap((category) =>
      category.format === "list"
        ? category.items.map(({ id }) => id)
        : []
    ),
    (index) => ["worldbuilding", index, "items"],
    "worldbuilding item id",
    context
  );
  snapshot.worldbuilding.forEach((category, categoryIndex) => {
    if (category.format !== "list") return;
    validateContiguousOrder(
      category.items.map(({ order }, index) => ({ index, order })),
      (index) => ["worldbuilding", categoryIndex, "items", index, "order"],
      "Worldbuilding item",
      context
    );
  });

  validateUniqueValues(
    snapshot.characterTypes.map(({ id }) => id),
    (index) => ["characterTypes", index, "id"],
    "character type id",
    context
  );
  validateContiguousOrder(
    snapshot.characterTypes.map(({ order }, index) => ({ index, order })),
    (index) => ["characterTypes", index, "order"],
    "Character type",
    context
  );
  const characterTypeIds = new Set(
    snapshot.characterTypes.map(({ id }) => id)
  );
  snapshot.characters.forEach((character, index) => {
    if (!characterTypeIds.has(character.group)) {
      addIssue(
        context,
        ["characters", index, "group"],
        "Character group must reference an existing character type."
      );
    }
  });

  validateUniqueValues(
    snapshot.characters.map(({ id }) => id),
    (index) => ["characters", index, "id"],
    "character id",
    context
  );
  for (const [group, entries] of groupOrderedEntries(
    snapshot.characters,
    ({ group }) => group,
    ({ order }) => order
  )) {
    validateContiguousOrder(
      entries,
      (index) => ["characters", index, "order"],
      `Character group ${group}`,
      context
    );
  }

  const characterIds = new Set(
    snapshot.characters.map(({ id }) => id)
  );
  validateUniqueValues(
    snapshot.characterFiles.map(({ characterId }) => characterId),
    (index) => ["characterFiles", index, "characterId"],
    "character file index",
    context
  );
  snapshot.characterFiles.forEach((entry, index) => {
    if (!characterIds.has(entry.characterId)) {
      addIssue(
        context,
        ["characterFiles", index, "characterId"],
        "Character file index must reference an existing character."
      );
    }
  });
  const characterFileIds = new Set(
    snapshot.characterFiles.map(({ characterId }) => characterId)
  );
  for (const characterId of characterIds) {
    if (!characterFileIds.has(characterId)) {
      addIssue(
        context,
        ["characterFiles"],
        `Missing file index for character ${characterId}.`
      );
    }
  }

  const {
    volumes,
    arcs,
    chapterCards,
    storyEvents,
    storyPlots,
    eventConnections,
    narrativePlacements,
    foreshadowing
  } = snapshot.plot;

  validateUniqueValues(
    volumes.map(({ id }) => id),
    (index) => ["plot", "volumes", index, "id"],
    "volume id",
    context
  );
  validateContiguousOrder(
    volumes.map(({ order }, index) => ({ index, order })),
    (index) => ["plot", "volumes", index, "order"],
    "Volume",
    context
  );
  const volumeById = new Map(volumes.map((volume) => [volume.id, volume]));

  validateUniqueValues(
    arcs.map(({ id }) => id),
    (index) => ["plot", "arcs", index, "id"],
    "arc id",
    context
  );
  arcs.forEach((arc, index) => {
    if (!volumeById.has(arc.volumeId)) {
      addIssue(
        context,
        ["plot", "arcs", index, "volumeId"],
        "Arc must reference an existing volume."
      );
    }
  });
  for (const [volumeId, entries] of groupOrderedEntries(
    arcs,
    ({ volumeId }) => volumeId,
    ({ order }) => order
  )) {
    validateContiguousOrder(
      entries,
      (index) => ["plot", "arcs", index, "order"],
      `Arc group ${volumeId}`,
      context
    );
  }
  const arcById = new Map(arcs.map((arc) => [arc.id, arc]));

  validateUniqueValues(
    chapterCards.map(({ id }) => id),
    (index) => ["plot", "chapterCards", index, "id"],
    "chapter-card id",
    context
  );
  chapterCards.forEach((card, index) => {
    const volume = volumeById.get(card.volumeId);
    const arc =
      card.primaryArcId === null
        ? undefined
        : arcById.get(card.primaryArcId);
    if (!volume) {
      addIssue(
        context,
        ["plot", "chapterCards", index, "volumeId"],
        "Chapter card must reference an existing volume."
      );
    }
    if (card.primaryArcId !== null && !arc) {
      addIssue(
        context,
        ["plot", "chapterCards", index, "primaryArcId"],
        "Chapter card must reference an existing primary arc."
      );
    } else if (arc && arc.volumeId !== card.volumeId) {
      addIssue(
        context,
        ["plot", "chapterCards", index, "primaryArcId"],
        "Chapter card and primary arc must belong to the same volume."
      );
    }
  });
  for (const [volumeId, entries] of groupOrderedEntries(
    chapterCards,
    ({ volumeId }) => volumeId,
    ({ narrativeOrder }) => narrativeOrder
  )) {
    validateContiguousOrder(
      entries,
      (index) => [
        "plot",
        "chapterCards",
        index,
        "narrativeOrder"
      ],
      `Chapter narrative order in ${volumeId}`,
      context
    );
  }
  const chapterById = new Map(
    chapterCards.map((chapter) => [chapter.id, chapter])
  );

  validateUniqueValues(
    storyPlots.map(({ id }) => id),
    (index) => ["plot", "storyPlots", index, "id"],
    "story-plot id",
    context
  );
  storyPlots.forEach((storyPlot, index) => {
    if (!arcById.has(storyPlot.arcId)) {
      addIssue(
        context,
        ["plot", "storyPlots", index, "arcId"],
        "Story plot must reference an existing arc."
      );
    }
  });
  for (const [arcId, entries] of groupOrderedEntries(
    storyPlots,
    ({ arcId }) => arcId,
    ({ order }) => order
  )) {
    validateContiguousOrder(
      entries,
      (index) => ["plot", "storyPlots", index, "order"],
      `Story-plot group ${arcId}`,
      context
    );
  }

  validateUniqueValues(
    storyEvents.map(({ id }) => id),
    (index) => ["plot", "storyEvents", index, "id"],
    "story-event id",
    context
  );
  validateContiguousOrder(
    storyEvents.map(({ storyOrder }, index) => ({
      index,
      order: storyOrder
    })),
    (index) => ["plot", "storyEvents", index, "storyOrder"],
    "Story event",
    context
  );
  const eventById = new Map(storyEvents.map((event) => [event.id, event]));
  storyEvents.forEach((event, index) => {
    event.arcIds.forEach((arcId, arcIndex) => {
      if (!arcById.has(arcId)) {
        addIssue(
          context,
          ["plot", "storyEvents", index, "arcIds", arcIndex],
          "Story event must reference an existing arc."
        );
      }
    });
    event.characterIds.forEach((characterId, characterIndex) => {
      if (!characterIds.has(characterId)) {
        addIssue(
          context,
          [
            "plot",
            "storyEvents",
            index,
            "characterIds",
            characterIndex
          ],
          "Story event must reference an existing character."
        );
      }
    });
  });

  validateUniqueValues(
    eventConnections.map(({ id }) => id),
    (index) => ["plot", "eventConnections", index, "id"],
    "event-connection id",
    context
  );
  validateUniqueValues(
    eventConnections.map(
      ({ sourceEventId, targetEventId, type }) =>
        `${sourceEventId}\0${targetEventId}\0${type}`
    ),
    (index) => ["plot", "eventConnections", index],
    "event connection",
    context
  );
  eventConnections.forEach((connection, index) => {
    if (!eventById.has(connection.sourceEventId)) {
      addIssue(
        context,
        ["plot", "eventConnections", index, "sourceEventId"],
        "Event connection source must reference an existing event."
      );
    }
    if (!eventById.has(connection.targetEventId)) {
      addIssue(
        context,
        ["plot", "eventConnections", index, "targetEventId"],
        "Event connection target must reference an existing event."
      );
    }
  });
  if (
    hasBeforeCycle(
      storyEvents.map(({ id }) => id),
      eventConnections
    )
  ) {
    addIssue(
      context,
      ["plot", "eventConnections"],
      "Before-event connections cannot form a cycle."
    );
  }

  validateUniqueValues(
    narrativePlacements.map(({ id }) => id),
    (index) => ["plot", "narrativePlacements", index, "id"],
    "narrative-placement id",
    context
  );
  narrativePlacements.forEach((placement, index) => {
    if (!eventById.has(placement.eventId)) {
      addIssue(
        context,
        ["plot", "narrativePlacements", index, "eventId"],
        "Narrative placement must reference an existing event."
      );
    }
    if (!chapterById.has(placement.chapterCardId)) {
      addIssue(
        context,
        ["plot", "narrativePlacements", index, "chapterCardId"],
        "Narrative placement must reference an existing chapter card."
      );
    }
  });
  for (const [chapterCardId, entries] of groupOrderedEntries(
    narrativePlacements,
    ({ chapterCardId }) => chapterCardId,
    ({ orderInChapter }) => orderInChapter
  )) {
    validateContiguousOrder(
      entries,
      (index) => [
        "plot",
        "narrativePlacements",
        index,
        "orderInChapter"
      ],
      `Narrative placement order in ${chapterCardId}`,
      context
    );
  }
  const placementById = new Map(
    narrativePlacements.map((placement) => [placement.id, placement])
  );

  validateUniqueValues(
    foreshadowing.map(({ id }) => id),
    (index) => ["plot", "foreshadowing", index, "id"],
    "foreshadowing id",
    context
  );
  const beatById = new Map<
    string,
    { beat: LongForeshadowingBeat; threadIndex: number; beatIndex: number }
  >();
  foreshadowing.forEach((thread, threadIndex) => {
    if (thread.status !== "abandoned") {
      const derivedStatus =
        deriveLongForeshadowingStatusFromCommittedBeats(thread.beats);
      if (thread.status !== derivedStatus) {
        addIssue(
          context,
          ["plot", "foreshadowing", threadIndex, "status"],
          `Foreshadowing status must be ${derivedStatus}, derived from its committed beats, unless it is explicitly abandoned.`
        );
      }
    }
    if (
      thread.truthEventId !== null &&
      !eventById.has(thread.truthEventId)
    ) {
      addIssue(
        context,
        ["plot", "foreshadowing", threadIndex, "truthEventId"],
        "Foreshadowing truth must reference an existing event."
      );
    }
    validateContiguousOrder(
      thread.beats.map(({ order }, beatIndex) => ({
        index: beatIndex,
        order
      })),
      (beatIndex) => [
        "plot",
        "foreshadowing",
        threadIndex,
        "beats",
        beatIndex,
        "order"
      ],
      `Foreshadowing beats in ${thread.id}`,
      context
    );
    thread.beats.forEach((beat, beatIndex) => {
      if (beatById.has(beat.id)) {
        addIssue(
          context,
          [
            "plot",
            "foreshadowing",
            threadIndex,
            "beats",
            beatIndex,
            "id"
          ],
          `Duplicate foreshadowing-beat id: ${beat.id}`
        );
      } else {
        beatById.set(beat.id, { beat, threadIndex, beatIndex });
      }
      const plannedVolumeId = beat.volumeId ?? null;
      const plannedArcId = beat.arcId ?? null;
      const plannedVolume =
        plannedVolumeId === null
          ? undefined
          : volumeById.get(plannedVolumeId);
      const plannedArc =
        plannedArcId === null ? undefined : arcById.get(plannedArcId);
      if (plannedVolumeId !== null && !plannedVolume) {
        addIssue(
          context,
          [
            "plot",
            "foreshadowing",
            threadIndex,
            "beats",
            beatIndex,
            "volumeId"
          ],
          "Foreshadowing beat must reference an existing planning volume."
        );
      }
      if (plannedArcId !== null && !plannedArc) {
        addIssue(
          context,
          [
            "plot",
            "foreshadowing",
            threadIndex,
            "beats",
            beatIndex,
            "arcId"
          ],
          "Foreshadowing beat must reference an existing planning arc."
        );
      }
      if (
        plannedVolume &&
        plannedArc &&
        plannedArc.volumeId !== plannedVolume.id
      ) {
        addIssue(
          context,
          [
            "plot",
            "foreshadowing",
            threadIndex,
            "beats",
            beatIndex,
            "arcId"
          ],
          "Foreshadowing beat planning arc must belong to its planning volume."
        );
      }
      if (beat.eventId !== null && !eventById.has(beat.eventId)) {
        addIssue(
          context,
          [
            "plot",
            "foreshadowing",
            threadIndex,
            "beats",
            beatIndex,
            "eventId"
          ],
          "Foreshadowing beat must reference an existing event."
        );
      }
      const placement =
        beat.placementId === null
          ? undefined
          : placementById.get(beat.placementId);
      if (beat.placementId !== null && !placement) {
        addIssue(
          context,
          [
            "plot",
            "foreshadowing",
            threadIndex,
            "beats",
            beatIndex,
            "placementId"
          ],
          "Foreshadowing beat must reference an existing placement."
        );
      }
      if (
        beat.chapterCardId !== null &&
        !chapterById.has(beat.chapterCardId)
      ) {
        addIssue(
          context,
          [
            "plot",
            "foreshadowing",
            threadIndex,
            "beats",
            beatIndex,
            "chapterCardId"
          ],
          "Foreshadowing beat must reference an existing chapter card."
        );
      }
      const anchoredChapter =
        beat.chapterCardId !== null
          ? chapterById.get(beat.chapterCardId)
          : placement
            ? chapterById.get(placement.chapterCardId)
            : undefined;
      if (
        plannedVolume &&
        anchoredChapter &&
        anchoredChapter.volumeId !== plannedVolume.id
      ) {
        addIssue(
          context,
          [
            "plot",
            "foreshadowing",
            threadIndex,
            "beats",
            beatIndex,
            "volumeId"
          ],
          "Foreshadowing beat planning volume must match its concrete chapter."
        );
      }
      if (
        plannedArc &&
        anchoredChapter &&
        anchoredChapter.primaryArcId !== null &&
        anchoredChapter.primaryArcId !== plannedArc.id
      ) {
        addIssue(
          context,
          [
            "plot",
            "foreshadowing",
            threadIndex,
            "beats",
            beatIndex,
            "arcId"
          ],
          "Foreshadowing beat planning arc must match its concrete chapter."
        );
      }
      const anchoredEvent =
        beat.eventId === null ? undefined : eventById.get(beat.eventId);
      if (
        plannedVolume &&
        anchoredEvent &&
        !anchoredEvent.arcIds.some(
          (arcId) => arcById.get(arcId)?.volumeId === plannedVolume.id
        )
      ) {
        addIssue(
          context,
          [
            "plot",
            "foreshadowing",
            threadIndex,
            "beats",
            beatIndex,
            "volumeId"
          ],
          "Foreshadowing beat planning volume must match its concrete event."
        );
      }
      if (
        plannedArc &&
        anchoredEvent &&
        !anchoredEvent.arcIds.includes(plannedArc.id)
      ) {
        addIssue(
          context,
          [
            "plot",
            "foreshadowing",
            threadIndex,
            "beats",
            beatIndex,
            "arcId"
          ],
          "Foreshadowing beat planning arc must match its concrete event."
        );
      }
      if (
        placement &&
        beat.eventId !== null &&
        placement.eventId !== beat.eventId
      ) {
        addIssue(
          context,
          [
            "plot",
            "foreshadowing",
            threadIndex,
            "beats",
            beatIndex,
            "eventId"
          ],
          "Foreshadowing beat event must match its placement event."
        );
      }
      if (placement && beat.status === "committed") {
        if (placement.status !== "committed") {
          addIssue(
            context,
            [
              "plot",
              "foreshadowing",
              threadIndex,
              "beats",
              beatIndex,
              "placementId"
            ],
            "A committed foreshadowing beat requires its bound placement to be committed."
          );
        }
        if (beat.eventId !== placement.eventId) {
          addIssue(
            context,
            [
              "plot",
              "foreshadowing",
              threadIndex,
              "beats",
              beatIndex,
              "eventId"
            ],
            "A committed foreshadowing beat must carry the same event as its bound placement."
          );
        }
        if (beat.commitId !== placement.commitId) {
          addIssue(
            context,
            [
              "plot",
              "foreshadowing",
              threadIndex,
              "beats",
              beatIndex,
              "commitId"
            ],
            "A committed foreshadowing beat and its bound placement must share one ledger commit."
          );
        }
      }
      if (
        placement &&
        beat.chapterCardId !== null &&
        placement.chapterCardId !== beat.chapterCardId
      ) {
        addIssue(
          context,
          [
            "plot",
            "foreshadowing",
            threadIndex,
            "beats",
            beatIndex,
            "chapterCardId"
          ],
          "Foreshadowing beat chapter must match its placement chapter."
        );
      }
    });
  });

  validateUniqueValues(
    snapshot.chapters.map(({ chapterCardId }) => chapterCardId),
    (index) => ["chapters", index, "chapterCardId"],
    "chapter file index",
    context
  );
  const chapterFilesById = new Map(
    snapshot.chapters.map((chapter) => [
      chapter.chapterCardId,
      chapter
    ])
  );
  snapshot.chapters.forEach((chapter, index) => {
    if (!chapterById.has(chapter.chapterCardId)) {
      addIssue(
        context,
        ["chapters", index, "chapterCardId"],
        "Chapter file index must reference an existing chapter card."
      );
    }
    chapter.characterContinuity.forEach((character, characterIndex) => {
      if (!characterIds.has(character.characterId)) {
        addIssue(
          context,
          [
            "chapters",
            index,
            "characterContinuity",
            characterIndex,
            "characterId"
          ],
          "Chapter character continuity must reference an existing character."
        );
      }
    });
  });
  for (const chapterCard of chapterCards) {
    if (!chapterFilesById.has(chapterCard.id)) {
      addIssue(
        context,
        ["chapters"],
        `Missing three-file index for chapter ${chapterCard.id}.`
      );
    }
  }

  const allFiles: Array<{
    file: LongWorkspaceFileReference;
    path: ValidationPath;
  }> = [
    { file: snapshot.bookLine, path: ["bookLine"] },
    ...snapshot.worldbuilding.flatMap((category, index) =>
      category.format === "text"
        ? [{
            file: category.file,
            path: ["worldbuilding", index, "file"] as ValidationPath
          }]
        : [
            ...(category.overview
              ? [{
                  file: category.overview,
                  path: [
                    "worldbuilding",
                    index,
                    "overview"
                  ] as ValidationPath
                }]
              : []),
            ...category.items.map((item, itemIndex) => ({
              file: item.file,
              path: [
                "worldbuilding",
                index,
                "items",
                itemIndex,
                "file"
              ] as ValidationPath
            }))
          ]
    ),
    ...(snapshot.characterOverview
      ? [{
          file: snapshot.characterOverview,
          path: ["characterOverview"] as ValidationPath
        }]
      : []),
    ...snapshot.characterFiles.flatMap((entry, index) =>
      [
        ["coreProfile", entry.coreProfile],
        ["relationships", entry.relationships],
        ["currentState", entry.currentState],
        ["history", entry.history]
      ].map(([field, file]) => ({
        file: file as LongWorkspaceFileReference,
        path: ["characterFiles", index, field as string] as ValidationPath
      }))
    ),
    ...snapshot.chapters.flatMap((entry, index) =>
      [
        ["body", entry.body],
        ["card", entry.card],
        ["characterState", entry.characterState],
        ["handoff", entry.handoff],
        ["foreshadowingChanges", entry.foreshadowingChanges],
        ...(entry.worldReveals
          ? [["worldReveals", entry.worldReveals]]
          : []),
        ...entry.characterContinuity.flatMap(
          (character, characterIndex) => [
            [
              `characterContinuity.${characterIndex}.currentState`,
              character.currentState
            ],
            [
              `characterContinuity.${characterIndex}.history`,
              character.history
            ]
          ]
        )
      ].map(([field, file]) => ({
        file: file as LongWorkspaceFileReference,
        path: ["chapters", index, field as string] as ValidationPath
      }))
    ),
    ...snapshot.plot.storyPlots.map((entry, index) => ({
      file: entry.file,
      path: ["plot", "storyPlots", index, "file"] as ValidationPath
    })),
    ...snapshot.ledger.commits.map((entry, index) => ({
      file: entry.recordFile,
      path: ["ledger", "commits", index, "recordFile"] as ValidationPath
    }))
  ];
  validateUniqueValues(
    allFiles.map(({ file }) => file.id),
    (index) => [...allFiles[index]!.path, "id"],
    "long-form file id",
    context
  );
  validateUniqueValues(
    allFiles.map(({ file }) =>
      file.path.normalize("NFC").toLocaleLowerCase("en-US")
    ),
    (index) => [...allFiles[index]!.path, "path"],
    "portable long-form file path",
    context
  );

  const commits = snapshot.ledger.commits;
  validateUniqueValues(
    commits.map(({ id }) => id),
    (index) => ["ledger", "commits", index, "id"],
    "ledger commit id",
    context
  );
  validateUniqueValues(
    commits.map(({ chapterCardId }) => chapterCardId),
    (index) => ["ledger", "commits", index, "chapterCardId"],
    "committed chapter",
    context
  );
  commits.forEach((commit, index) => {
    if (
      index > 0 &&
      commit.sequence <= commits[index - 1]!.sequence
    ) {
      addIssue(
        context,
        ["ledger", "commits", index, "sequence"],
        "Ledger record sequence must be strictly increasing and stored in order."
      );
    }
    if (!chapterById.has(commit.chapterCardId)) {
      addIssue(
        context,
        ["ledger", "commits", index, "chapterCardId"],
        "Ledger commit must reference an existing chapter card."
      );
    }
  });
  const commitById = new Map(commits.map((commit) => [commit.id, commit]));
  const placementIdsByCommitId = new Map(
    commits.map((commit) => [commit.id, new Set(commit.placementIds)])
  );
  const beatIdsByCommitId = new Map(
    commits.map((commit) => [
      commit.id,
      new Set(commit.foreshadowingBeatIds)
    ])
  );
  const commitByChapterId = new Map(
    commits.map((commit) => [commit.chapterCardId, commit])
  );

  const orderedChapters = [...chapterCards].sort((left, right) => {
    const leftVolumeOrder =
      volumeById.get(left.volumeId)?.order ?? Number.MAX_SAFE_INTEGER;
    const rightVolumeOrder =
      volumeById.get(right.volumeId)?.order ?? Number.MAX_SAFE_INTEGER;
    return (
      leftVolumeOrder - rightVolumeOrder ||
      left.narrativeOrder - right.narrativeOrder
    );
  });
  orderedChapters.forEach((chapter) => {
    const expectedCommitId = commitByChapterId.get(chapter.id)?.id ?? null;
    const fileIndex = chapterFilesById.get(chapter.id);
    if (fileIndex && fileIndex.commitId !== expectedCommitId) {
      const fileIndexPosition = snapshot.chapters.findIndex(
        ({ chapterCardId }) => chapterCardId === chapter.id
      );
      addIssue(
        context,
        ["chapters", fileIndexPosition, "commitId"],
        "Chapter record id must match its ledger record."
      );
    }
  });

  let expectedCommittedThrough: string | null = null;
  for (const chapter of orderedChapters) {
    if (!commitByChapterId.has(chapter.id)) break;
    expectedCommittedThrough = chapter.id;
  }
  if (
    snapshot.ledger.committedThroughChapterId !==
    expectedCommittedThrough
  ) {
    addIssue(
      context,
      ["ledger", "committedThroughChapterId"],
      "Committed-through chapter must match the highest contiguous recorded chapter."
    );
  }

  commits.forEach((commit, commitIndex) => {
    commit.placementIds.forEach((placementId, placementIndex) => {
      const placement = placementById.get(placementId);
      if (!placement) {
        addIssue(
          context,
          [
            "ledger",
            "commits",
            commitIndex,
            "placementIds",
            placementIndex
          ],
          "Ledger placement decision must reference an existing placement."
        );
      } else {
        if (placement.chapterCardId !== commit.chapterCardId) {
          addIssue(
            context,
            [
              "ledger",
              "commits",
              commitIndex,
              "placementIds",
              placementIndex
            ],
            "Ledger placement decision must belong to the committed chapter."
          );
        }
        if (placement.commitId !== commit.id) {
          addIssue(
            context,
            [
              "ledger",
              "commits",
              commitIndex,
              "placementIds",
              placementIndex
            ],
            "Ledger placement decision must carry the same commit id."
          );
        }
      }
    });
    commit.foreshadowingBeatIds.forEach((beatId, beatIndex) => {
      const beatRecord = beatById.get(beatId);
      if (!beatRecord) {
        addIssue(
          context,
          [
            "ledger",
            "commits",
            commitIndex,
            "foreshadowingBeatIds",
            beatIndex
          ],
          "Ledger beat decision must reference an existing beat."
        );
      } else {
        const { beat } = beatRecord;
        const beatPlacement =
          beat.placementId === null
            ? undefined
            : placementById.get(beat.placementId);
        const resolvedChapterId =
          beat.chapterCardId ?? beatPlacement?.chapterCardId;
        if (resolvedChapterId !== commit.chapterCardId) {
          addIssue(
            context,
            [
              "ledger",
              "commits",
              commitIndex,
              "foreshadowingBeatIds",
              beatIndex
            ],
            "Ledger beat decision must resolve to and belong to the committed chapter."
          );
        }
        if (beat.commitId !== commit.id) {
          addIssue(
            context,
            [
              "ledger",
              "commits",
              commitIndex,
              "foreshadowingBeatIds",
              beatIndex
            ],
            "Ledger beat decision must carry the same commit id."
          );
        }
      }
    });
  });

  narrativePlacements.forEach((placement, index) => {
    const chapterCommit = commitByChapterId.get(placement.chapterCardId);
    if (chapterCommit && placement.commitId !== chapterCommit.id) {
      addIssue(
        context,
        ["plot", "narrativePlacements", index, "commitId"],
        "Every placement in a committed chapter must be decided by that chapter commit."
      );
    }
    if (!chapterCommit && placement.commitId !== null) {
      addIssue(
        context,
        ["plot", "narrativePlacements", index, "commitId"],
        "A placement in an uncommitted chapter cannot reference a ledger commit."
      );
    }
    if (placement.commitId === null) return;
    const commit = commitById.get(placement.commitId);
    if (!commit) {
      addIssue(
        context,
        ["plot", "narrativePlacements", index, "commitId"],
        "Placement commit id must reference an indexed ledger commit."
      );
    } else if (!placementIdsByCommitId.get(commit.id)!.has(placement.id)) {
      addIssue(
        context,
        ["plot", "narrativePlacements", index, "commitId"],
        "Committed placement must be indexed by its ledger commit."
      );
    }
  });
  for (const { beat, threadIndex, beatIndex } of beatById.values()) {
    const beatPlacement =
      beat.placementId === null
        ? undefined
        : placementById.get(beat.placementId);
    const resolvedChapterId =
      beat.chapterCardId ?? beatPlacement?.chapterCardId;
    const chapterCommit =
      resolvedChapterId === undefined || resolvedChapterId === null
        ? undefined
        : commitByChapterId.get(resolvedChapterId);
    if (chapterCommit && beat.commitId !== chapterCommit.id) {
      addIssue(
        context,
        [
          "plot",
          "foreshadowing",
          threadIndex,
          "beats",
          beatIndex,
          "commitId"
        ],
        "Every foreshadowing beat in a committed chapter must be decided by that chapter commit."
      );
    }
    if (!chapterCommit && beat.commitId !== null) {
      addIssue(
        context,
        [
          "plot",
          "foreshadowing",
          threadIndex,
          "beats",
          beatIndex,
          "commitId"
        ],
        "A foreshadowing beat without a committed chapter cannot reference a ledger commit."
      );
    }
    if (beat.commitId === null) continue;
    const commit = commitById.get(beat.commitId);
    if (!commit) {
      addIssue(
        context,
        [
          "plot",
          "foreshadowing",
          threadIndex,
          "beats",
          beatIndex,
          "commitId"
        ],
        "Foreshadowing beat commit id must reference an indexed ledger commit."
      );
    } else if (!beatIdsByCommitId.get(commit.id)!.has(beat.id)) {
      addIssue(
        context,
        [
          "plot",
          "foreshadowing",
          threadIndex,
          "beats",
          beatIndex,
          "commitId"
        ],
        "Committed foreshadowing beat must be indexed by its ledger commit."
      );
    }
  }

  const projection = snapshot.ledger.projection;
  const throughCommit =
    projection.throughCommitId === null
      ? undefined
      : commitById.get(projection.throughCommitId);
  if (projection.throughCommitId !== null && !throughCommit) {
    addIssue(
      context,
      ["ledger", "projection", "throughCommitId"],
      "Continuity projection watermark must reference an indexed ledger commit."
    );
  }
  if (
    projection.latestHandoff &&
    commitById.get(projection.latestHandoff.commitId)?.chapterCardId !==
      projection.latestHandoff.chapterCardId
  ) {
    addIssue(
      context,
      ["ledger", "projection", "latestHandoff", "chapterCardId"],
      "The latest continuity handoff chapter must match its source commit."
    );
  }

  const plotSubjectIds = new Set<string>([
    snapshot.bookId,
    ...volumes.map(({ id }) => id),
    ...arcs.map(({ id }) => id),
    ...chapterCards.map(({ id }) => id),
    ...storyEvents.map(({ id }) => id),
    ...storyPlots.map(({ id }) => id),
    ...eventConnections.map(({ id }) => id),
    ...narrativePlacements.map(({ id }) => id)
  ]);
  const foreshadowingSubjectIds = new Set<string>([
    ...foreshadowing.map(({ id }) => id),
    ...beatById.keys()
  ]);
  const projectionSubjectExists = (
    domain: LongContinuityDomain,
    subjectId: string
  ): boolean => {
    if (domain === "character" || domain === "relationship") {
      return characterIds.has(subjectId);
    }
    if (domain === "world") return worldbuildingIds.has(subjectId);
    if (domain === "plot") return plotSubjectIds.has(subjectId);
    return foreshadowingSubjectIds.has(subjectId);
  };
  const validateProjectionProvenance = (
    value: {
      sourceCommitId: string;
      sourceChapterCardId: string;
    },
    path: ValidationPath
  ): void => {
    const sourceCommit = commitById.get(value.sourceCommitId);
    if (!sourceCommit) {
      addIssue(
        context,
        [...path, "sourceCommitId"],
        "Continuity projection entries must reference an indexed source commit."
      );
      return;
    }
    if (sourceCommit.chapterCardId !== value.sourceChapterCardId) {
      addIssue(
        context,
        [...path, "sourceChapterCardId"],
        "Continuity projection entry chapter must match its source commit."
      );
    }
    if (throughCommit && sourceCommit.sequence > throughCommit.sequence) {
      addIssue(
        context,
        [...path, "sourceCommitId"],
        "Continuity projection entries cannot come from after the projection watermark."
      );
    }
  };
  projection.facts.forEach((fact, index) => {
    const path = ["ledger", "projection", "facts", index] as ValidationPath;
    validateProjectionProvenance(fact, path);
    if (!projectionSubjectExists(fact.domain, fact.subjectId)) {
      addIssue(
        context,
        [...path, "subjectId"],
        "Continuity facts must reference an existing object in their domain."
      );
    }
  });
  projection.knowledge.forEach((knowledge, index) => {
    const path = [
      "ledger",
      "projection",
      "knowledge",
      index
    ] as ValidationPath;
    validateProjectionProvenance(knowledge, path);
    if (
      knowledge.audienceType === "character" &&
      knowledge.audienceId !== null &&
      !characterIds.has(knowledge.audienceId)
    ) {
      addIssue(
        context,
        [...path, "audienceId"],
        "Character knowledge must reference an existing character."
      );
    }
  });
  projection.openLoops.forEach((loop, index) => {
    const path = [
      "ledger",
      "projection",
      "openLoops",
      index
    ] as ValidationPath;
    validateProjectionProvenance(loop, path);
    if (
      loop.subjectId !== null &&
      loop.kind !== "knowledge" &&
      loop.kind !== "continuity" &&
      !projectionSubjectExists(loop.kind, loop.subjectId)
    ) {
      addIssue(
        context,
        [...path, "subjectId"],
        "Continuity open-loop subjects must reference an existing object in their domain."
      );
    }
  });
}

export const LongWorkspaceIndexSnapshotSchema =
  LongWorkspaceIndexSnapshotObjectSchema.superRefine(
    validateLongWorkspaceIndexSnapshot
  );
export type LongWorkspaceIndexSnapshot = z.infer<
  typeof LongWorkspaceIndexSnapshotSchema
>;

export const LongWorkspaceNavigationCountsSchema = z
  .object({
    worldbuildingCategories: z.number().int().nonnegative(),
    characters: z.number().int().nonnegative(),
    volumes: z.number().int().nonnegative(),
    arcs: z.number().int().nonnegative(),
    chapterCards: z.number().int().nonnegative(),
    storyEvents: z.number().int().nonnegative(),
    storyPlots: z.number().int().nonnegative().default(0),
    foreshadowingThreads: z.number().int().nonnegative(),
    committedChapters: z.number().int().nonnegative()
  })
  .strict();
export type LongWorkspaceNavigationCounts = z.infer<
  typeof LongWorkspaceNavigationCountsSchema
>;

const LongWorldbuildingNavigationEntrySchema = z
  .object({
    id: LongWorldbuildingCategoryIdSchema,
    title: LongTitleSchema,
    order: z.number().int().positive(),
    format: LongWorldbuildingFormatSchema
  })
  .strict();
const LongCharacterNavigationEntrySchema = z
  .object({
    id: LongCharacterIdSchema,
    name: LongTitleSchema,
    group: LongCharacterGroupSchema,
    order: z.number().int().positive()
  })
  .strict();
const LongCharacterTypeNavigationEntrySchema = LongCharacterTypeSchema;
const LongVolumeNavigationEntrySchema = z
  .object({
    id: LongVolumeIdSchema,
    title: LongTitleSchema,
    order: z.number().int().positive()
  })
  .strict();
const LongArcNavigationEntrySchema = z
  .object({
    id: LongArcIdSchema,
    volumeId: LongVolumeIdSchema,
    title: LongTitleSchema,
    order: z.number().int().positive()
  })
  .strict();
const LongChapterCardNavigationEntrySchema = z
  .object({
    id: LongChapterCardIdSchema,
    volumeId: LongVolumeIdSchema,
    primaryArcId: LongArcIdSchema.nullable(),
    title: LongTitleSchema,
    narrativeOrder: z.number().int().positive(),
    bodyStatus: LongChapterBodyStatusSchema.default("empty")
  })
  .strict();

/**
 * Lightweight catalog/navigation projection. It intentionally excludes file
 * references, chapter bodies, long outlines, event details and ledger records.
 */
export const LongWorkspaceNavigationSnapshotSchema = z
  .object({
    schemaVersion: LongWorkspaceSchemaVersionSchema,
    revision: LongRevisionSchema,
    bookId: LongBookIdSchema,
    updatedAt: LongTimestampSchema,
    counts: LongWorkspaceNavigationCountsSchema,
    worldbuilding: z
      .array(LongWorldbuildingNavigationEntrySchema)
      .max(10_000),
    characterTypes: z
      .array(LongCharacterTypeNavigationEntrySchema)
      .min(1)
      .max(10_000)
      .default(() => DEFAULT_LONG_CHARACTER_TYPES.map((value) => ({ ...value }))),
    characters: z.array(LongCharacterNavigationEntrySchema).max(100_000),
    volumes: z.array(LongVolumeNavigationEntrySchema).min(1).max(10_000),
    arcs: z.array(LongArcNavigationEntrySchema).max(100_000),
    chapterCards: z
      .array(LongChapterCardNavigationEntrySchema)
      .max(100_000),
    committedThroughChapterId: LongChapterCardIdSchema.nullable()
  })
  .strict()
  .superRefine((snapshot, context) => {
    const expectedCounts = {
      worldbuildingCategories: snapshot.worldbuilding.length,
      characters: snapshot.characters.length,
      volumes: snapshot.volumes.length,
      arcs: snapshot.arcs.length,
      chapterCards: snapshot.chapterCards.length
    };
    for (const [key, expected] of Object.entries(expectedCounts)) {
      if (
        snapshot.counts[
          key as keyof typeof expectedCounts
        ] !== expected
      ) {
        context.addIssue({
          code: "custom",
          path: ["counts", key],
          message: `Navigation count ${key} must match its index entries.`
        });
      }
    }
    if (
      snapshot.counts.committedChapters > snapshot.counts.chapterCards
    ) {
      context.addIssue({
        code: "custom",
        path: ["counts", "committedChapters"],
        message: "Committed chapter count cannot exceed chapter count."
      });
    }
    if (
      snapshot.committedThroughChapterId !== null &&
      !snapshot.chapterCards.some(
        ({ id }) => id === snapshot.committedThroughChapterId
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["committedThroughChapterId"],
        message: "Recorded-through navigation chapter must exist."
      });
    }

    validateUniqueValues(
      snapshot.worldbuilding.map(({ id }) => id),
      (index) => ["worldbuilding", index, "id"],
      "navigation worldbuilding id",
      context
    );
    validateContiguousOrder(
      snapshot.worldbuilding.map(({ order }, index) => ({ index, order })),
      (index) => ["worldbuilding", index, "order"],
      "Navigation worldbuilding",
      context
    );

    validateUniqueValues(
      snapshot.characterTypes.map(({ id }) => id),
      (index) => ["characterTypes", index, "id"],
      "navigation character type id",
      context
    );
    validateContiguousOrder(
      snapshot.characterTypes.map(({ order }, index) => ({ index, order })),
      (index) => ["characterTypes", index, "order"],
      "Navigation character type",
      context
    );
    const characterTypeIds = new Set(
      snapshot.characterTypes.map(({ id }) => id)
    );
    snapshot.characters.forEach((character, index) => {
      if (!characterTypeIds.has(character.group)) {
        context.addIssue({
          code: "custom",
          path: ["characters", index, "group"],
          message:
            "Navigation character group must reference an existing character type."
        });
      }
    });

    validateUniqueValues(
      snapshot.characters.map(({ id }) => id),
      (index) => ["characters", index, "id"],
      "navigation character id",
      context
    );
    for (const [group, entries] of groupOrderedEntries(
      snapshot.characters,
      ({ group }) => group,
      ({ order }) => order
    )) {
      validateContiguousOrder(
        entries,
        (index) => ["characters", index, "order"],
        `Navigation character group ${group}`,
        context
      );
    }

    validateUniqueValues(
      snapshot.volumes.map(({ id }) => id),
      (index) => ["volumes", index, "id"],
      "navigation volume id",
      context
    );
    validateContiguousOrder(
      snapshot.volumes.map(({ order }, index) => ({ index, order })),
      (index) => ["volumes", index, "order"],
      "Navigation volume",
      context
    );
    const volumeById = new Map(
      snapshot.volumes.map((volume) => [volume.id, volume])
    );

    validateUniqueValues(
      snapshot.arcs.map(({ id }) => id),
      (index) => ["arcs", index, "id"],
      "navigation arc id",
      context
    );
    snapshot.arcs.forEach((arc, index) => {
      if (!volumeById.has(arc.volumeId)) {
        addIssue(
          context,
          ["arcs", index, "volumeId"],
          "Navigation arc must reference an existing volume."
        );
      }
    });
    for (const [volumeId, entries] of groupOrderedEntries(
      snapshot.arcs,
      ({ volumeId }) => volumeId,
      ({ order }) => order
    )) {
      validateContiguousOrder(
        entries,
        (index) => ["arcs", index, "order"],
        `Navigation arcs in ${volumeId}`,
        context
      );
    }
    const arcById = new Map(snapshot.arcs.map((arc) => [arc.id, arc]));

    validateUniqueValues(
      snapshot.chapterCards.map(({ id }) => id),
      (index) => ["chapterCards", index, "id"],
      "navigation chapter-card id",
      context
    );
    snapshot.chapterCards.forEach((chapter, index) => {
      const arc =
        chapter.primaryArcId === null
          ? undefined
          : arcById.get(chapter.primaryArcId);
      if (!volumeById.has(chapter.volumeId)) {
        addIssue(
          context,
          ["chapterCards", index, "volumeId"],
          "Navigation chapter must reference an existing volume."
        );
      }
      if (chapter.primaryArcId !== null && !arc) {
        addIssue(
          context,
          ["chapterCards", index, "primaryArcId"],
          "Navigation chapter must reference an existing primary arc."
        );
      } else if (arc && arc.volumeId !== chapter.volumeId) {
        addIssue(
          context,
          ["chapterCards", index, "primaryArcId"],
          "Navigation chapter and primary arc must share a volume."
        );
      }
    });
    for (const [volumeId, entries] of groupOrderedEntries(
      snapshot.chapterCards,
      ({ volumeId }) => volumeId,
      ({ narrativeOrder }) => narrativeOrder
    )) {
      validateContiguousOrder(
        entries,
        (index) => ["chapterCards", index, "narrativeOrder"],
        `Navigation chapter order in ${volumeId}`,
        context
      );
    }

    const orderedChapters = [...snapshot.chapterCards].sort(
      (left, right) => {
        const leftVolumeOrder =
          volumeById.get(left.volumeId)?.order ?? Number.MAX_SAFE_INTEGER;
        const rightVolumeOrder =
          volumeById.get(right.volumeId)?.order ?? Number.MAX_SAFE_INTEGER;
        return (
          leftVolumeOrder - rightVolumeOrder ||
          left.narrativeOrder - right.narrativeOrder
        );
      }
    );
    void orderedChapters;
  });
export type LongWorkspaceNavigationSnapshot = z.infer<
  typeof LongWorkspaceNavigationSnapshotSchema
>;

export function createLongWorkspaceNavigationSnapshot(
  workspace: LongWorkspaceIndexSnapshot
): LongWorkspaceNavigationSnapshot {
  return LongWorkspaceNavigationSnapshotSchema.parse({
    schemaVersion: workspace.schemaVersion,
    revision: workspace.revision,
    bookId: workspace.bookId,
    updatedAt: workspace.updatedAt,
    counts: {
      worldbuildingCategories: workspace.worldbuilding.length,
      characters: workspace.characters.length,
      volumes: workspace.plot.volumes.length,
      arcs: workspace.plot.arcs.length,
      chapterCards: workspace.plot.chapterCards.length,
      storyEvents: workspace.plot.storyEvents.length,
      storyPlots: workspace.plot.storyPlots.length,
      foreshadowingThreads: workspace.plot.foreshadowing.length,
      committedChapters: workspace.ledger.commits.length
    },
    worldbuilding: workspace.worldbuilding.map(
      ({ id, title, order, format }) => ({ id, title, order, format })
    ),
    characterTypes: workspace.characterTypes.map(({ id, title, order }) => ({
      id,
      title,
      order
    })),
    characters: workspace.characters.map(
      ({ id, name, group, order }) => ({ id, name, group, order })
    ),
    volumes: workspace.plot.volumes.map(({ id, title, order }) => ({
      id,
      title,
      order
    })),
    arcs: workspace.plot.arcs.map(
      ({ id, volumeId, title, order }) => ({
        id,
        volumeId,
        title,
        order
      })
    ),
    chapterCards: workspace.plot.chapterCards.map(
      ({ id, volumeId, primaryArcId, title, narrativeOrder }) => ({
        id,
        volumeId,
        primaryArcId,
        title,
        narrativeOrder,
        bodyStatus:
          workspace.chapters.find(({ chapterCardId }) => chapterCardId === id)
            ?.bodyStatus ?? "empty"
      })
    ),
    committedThroughChapterId:
      workspace.ledger.committedThroughChapterId
  });
}

const LongBookSharedShape = {
  id: LongBookIdSchema,
  title: LongTitleSchema,
  bookType: z.literal("long"),
  genre: z.string().trim().min(1).max(120),
  status: z.enum(["editing", "completed"]),
  linkedMaterialIdsByKind: LinkedMaterialIdsByKindSchema,
  linkedSkillIdsByKind: LinkedSkillIdsByKindSchema,
  createdAt: LongTimestampSchema,
  updatedAt: LongTimestampSchema
} as const;

export const LongBookSchema = z
  .object({
    schemaVersion: LongWorkspaceSchemaVersionSchema,
    ...LongBookSharedShape,
    projectRevision: LongRevisionSchema.optional(),
    workspaceIndex: LongWorkspaceIndexSnapshotSchema
  })
  .strict()
  .superRefine((book, context) => {
    if (book.workspaceIndex.bookId !== book.id) {
      context.addIssue({
        code: "custom",
        path: ["workspaceIndex", "bookId"],
        message: "Long book and workspace index ids must match."
      });
    }
    if (
      book.projectRevision !== undefined &&
      book.projectRevision !== book.workspaceIndex.revision
    ) {
      context.addIssue({
        code: "custom",
        path: ["projectRevision"],
        message:
          "Long book project revision must match its workspace index revision."
      });
    }
    if (book.updatedAt !== book.workspaceIndex.updatedAt) {
      context.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message:
          "Long book and workspace index update timestamps must match."
      });
    }
  });
export type LongBook = z.infer<typeof LongBookSchema>;

export const LongBookSummarySchema = z
  .object({
    schemaVersion: LongWorkspaceSchemaVersionSchema,
    kind: z.literal("deepwrite.long-book"),
    ...LongBookSharedShape,
    projectRevision: LongRevisionSchema,
    navigation: LongWorkspaceNavigationSnapshotSchema
  })
  .strict()
  .superRefine((book, context) => {
    if (book.navigation.bookId !== book.id) {
      context.addIssue({
        code: "custom",
        path: ["navigation", "bookId"],
        message: "Long book summary and navigation ids must match."
      });
    }
    if (book.projectRevision !== book.navigation.revision) {
      context.addIssue({
        code: "custom",
        path: ["projectRevision"],
        message:
          "Long book summary project revision must match its navigation revision."
      });
    }
    if (book.updatedAt !== book.navigation.updatedAt) {
      context.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message:
          "Long book summary and navigation update timestamps must match."
      });
    }
  });
export type LongBookSummary = z.infer<typeof LongBookSummarySchema>;

export function createLongBookSummary(book: LongBook): LongBookSummary {
  return LongBookSummarySchema.parse({
    schemaVersion: book.schemaVersion,
    kind: "deepwrite.long-book",
    id: book.id,
    title: book.title,
    bookType: book.bookType,
    genre: book.genre,
    status: book.status,
    linkedMaterialIdsByKind: book.linkedMaterialIdsByKind,
    linkedSkillIdsByKind: book.linkedSkillIdsByKind,
    projectRevision: book.projectRevision ?? book.workspaceIndex.revision,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
    navigation: createLongWorkspaceNavigationSnapshot(book.workspaceIndex)
  });
}

export const LongWorkspaceIndexFileReferenceSchema =
  LongJsonFileReferenceSchema.superRefine((file, context) => {
    if (file.id !== LONG_WORKSPACE_INDEX_FILE_ID) {
      context.addIssue({
        code: "custom",
        path: ["id"],
        message:
          `Long workspace index id must be ${LONG_WORKSPACE_INDEX_FILE_ID}.`
      });
    }
    if (file.path !== LONG_WORKSPACE_INDEX_PATH) {
      context.addIssue({
        code: "custom",
        path: ["path"],
        message:
          `Long workspace index path must be ${LONG_WORKSPACE_INDEX_PATH}.`
      });
    }
  });
export type LongWorkspaceIndexFileReference = z.infer<
  typeof LongWorkspaceIndexFileReferenceSchema
>;

/**
 * The physical long-book manifest stays intentionally small. Structure and
 * file indexes live in `long/index.json`; chapter body content stays in the
 * indexed Markdown files.
 */
export const LongProjectManifestSchema = z
  .object({
    schemaVersion: LongProjectManifestSchemaVersionSchema,
    revision: LongRevisionSchema,
    kind: z.literal("deepwrite.long-book"),
    ...LongBookSharedShape,
    workspaceIndexFile: LongWorkspaceIndexFileReferenceSchema
  })
  .strict();
export type LongProjectManifest = z.infer<
  typeof LongProjectManifestSchema
>;

export const LONG_AGENT_IDS = [
  "setting",
  "plot_design",
  "draft",
  "continuity_ledger"
] as const;
export const LongAgentIdSchema = z.enum(LONG_AGENT_IDS);
export type LongAgentId = z.infer<typeof LongAgentIdSchema>;

export const LONG_WORKSPACE_ROOTS = [
  "worldbuilding",
  "character_design",
  "plot_design",
  "draft",
  "continuity_ledger"
] as const;
export const LongWorkspaceRootSchema = z.enum(LONG_WORKSPACE_ROOTS);
export type LongWorkspaceRoot = z.infer<typeof LongWorkspaceRootSchema>;

export const LONG_AGENT_CAPABILITIES = [
  "query_structure",
  "mutate_structure",
  "dispatch_chapter_writer",
  "write_chapter_files",
  "commit_ledger"
] as const;
export const LongAgentCapabilitySchema = z.enum(
  LONG_AGENT_CAPABILITIES
);
export type LongAgentCapability = z.infer<
  typeof LongAgentCapabilitySchema
>;

function uniqueEnumValuesSchema<T extends string>(
  schema: z.ZodType<T>,
  maxLength: number,
  label: string
) {
  return z
    .array(schema)
    .max(maxLength)
    .superRefine((values, context) => {
      const seen = new Set<string>();
      values.forEach((value, index) => {
        if (seen.has(value)) {
          context.addIssue({
            code: "custom",
            path: [index],
            message: `Duplicate ${label}: ${value}`
          });
        }
        seen.add(value);
      });
    });
}

export const LongAgentReadAccessSchema = z
  .object({
    workspaceRoots: uniqueEnumValuesSchema(
      LongWorkspaceRootSchema,
      LONG_WORKSPACE_ROOTS.length,
      "long workspace root"
    ),
    materialKinds: uniqueEnumValuesSchema(
      MaterialKindSchema,
      5,
      "material kind"
    ),
    skillKinds: uniqueEnumValuesSchema(
      SkillKindSchema,
      4,
      "skill kind"
    )
  })
  .strict();
export type LongAgentReadAccess = z.infer<
  typeof LongAgentReadAccessSchema
>;

export const LongAgentWriteAccessSchema = z
  .object({
    workspaceRoots: uniqueEnumValuesSchema(
      LongWorkspaceRootSchema,
      LONG_WORKSPACE_ROOTS.length,
      "long workspace write root"
    ),
    capabilities: uniqueEnumValuesSchema(
      LongAgentCapabilitySchema,
      LONG_AGENT_CAPABILITIES.length,
      "long agent capability"
    )
  })
  .strict();
export type LongAgentWriteAccess = z.infer<
  typeof LongAgentWriteAccessSchema
>;

export const LongAgentProfileSchema = z
  .object({
    workspaceType: z.literal("long"),
    id: LongAgentIdSchema,
    label: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(1_000),
    systemPrompt: z
      .string()
      .min(1)
      .max(200_000)
      .refine((value) => value.trim().length > 0, {
        message: "Long agent system prompt must contain non-whitespace text."
      }),
    welcomeShortcuts: z.tuple([
      z.string().trim().min(1).max(200),
      z.string().trim().min(1).max(200),
      z.string().trim().min(1).max(200)
    ]),
    readAccess: LongAgentReadAccessSchema,
    writeAccess: LongAgentWriteAccessSchema
  })
  .strict()
  .superRefine((profile, context) => {
    profile.writeAccess.workspaceRoots.forEach((root, index) => {
      if (!profile.readAccess.workspaceRoots.includes(root)) {
        context.addIssue({
          code: "custom",
          path: ["writeAccess", "workspaceRoots", index],
          message:
            "A long-form agent cannot write a workspace root it cannot read."
        });
      }
    });
  });
export type LongAgentProfile = z.infer<typeof LongAgentProfileSchema>;

export const LONG_WORKSPACE_ROOT_TO_AGENT_ID = {
  worldbuilding: "setting",
  character_design: "setting",
  plot_design: "plot_design",
  draft: "draft",
  continuity_ledger: "continuity_ledger"
} as const satisfies Record<LongWorkspaceRoot, LongAgentId>;

export function resolveLongAgentIdForRoot(
  root: LongWorkspaceRoot
): LongAgentId {
  return LONG_WORKSPACE_ROOT_TO_AGENT_ID[root];
}

export function longAgentAcceptsWorldbuildingDirectory(
  agentId: LongAgentId
): boolean {
  return (
    agentId === "setting" ||
    agentId === "plot_design" ||
    agentId === "draft"
  );
}

const LONG_DEFAULT_SHORTCUTS = {
  setting: ["完善当前设定", "检查设定与人物冲突", "补充相关世界规则"],
  plot_design: ["完善剧情结构", "检查时间线", "梳理伏笔落点"],
  draft: ["写当前章", "续写当前章", "规划下一章"],
  continuity_ledger: ["提交当前章", "批量提交所有未提交章节", "检查连续性"]
} as const satisfies Record<
  LongAgentId,
  readonly [string, string, string]
>;

function longDefaultProfile(
  input: Omit<
    LongAgentProfile,
    "workspaceType" | "welcomeShortcuts"
  >
): LongAgentProfile {
  return LongAgentProfileSchema.parse({
    workspaceType: "long",
    ...input,
    welcomeShortcuts: LONG_DEFAULT_SHORTCUTS[input.id]
  });
}

export const DEFAULT_LONG_AGENT_PROFILES: readonly LongAgentProfile[] = [
  longDefaultProfile({
    id: "setting",
    label: "设定智能体",
    description:
      "维护世界规则、势力、地理、历史、术语、境界、物品，以及人物核心设定、关系、当前状态和历史。",
    systemPrompt: `你负责长篇设定，同时维护世界观与人物设计。模型只使用对应领域的业务标识：
- 世界观：文本型分类以 category_id 唯一定位；列表型分类以 category_id 和 item_id 唯一定位。
- 人物：每名人物以 character_id 唯一定位；人物内容按 core_profile、relationships、current_state、history 四种 document 区分。人物设计阶段另有一份手动维护的概览，用于统计全部人物的 character_id、姓名、分组、别名与一句话定位。
- 查询、搜索、读取、创建空白文件、整篇写入和局部修改一律使用带 domain 的设定工具：domain=worldbuilding 或 domain=character。其余实现细节由工具内部处理；不要索取、推断或复述。

能力范围：
1. 可以查看和搜索世界观分类、列表条目、人物概览、人物列表和各人物文档，并结合当前页面、固定上下文中的长篇结构导航、关联素材与技能回答问题、补充设计或检查设定与人物、剧情框架的冲突。
2. 可以创建文本型或列表型世界观分类，重命名、删除和排序分类及已有列表条目；也可以创建一名人物及其四份独立文档，重命名人物、调整别名和分组、删除人物或修改人物顺序。
3. 可以为世界观文本型分类、列表型分类概览或具体条目，以及人物文档与人物概览撰写、整体重写或局部修改 Markdown 正文。按章连续性记录只作参考，不接管或锁定人物文档。

操作要求：
1. 当前上下文足以回答时可以直接处理；需要了解世界观或人物结构时，使用 list_setting、search_setting 和 read_setting，并指定 domain。固定上下文已包含长篇结构导航时，把它当作剧情框架对照，不得把未读取的剧情正文当成事实，也不得修改剧情结构。
2. 读取世界观：文本型分类和列表型分类概览省略 item_id；读取列表条目时同时提供 category_id 和 item_id。读取人物正文时同时提供 character_id 和 document；读取人物概览时指定 document=overview，不传 character_id。搜索结果、列表和 preview 只用于定位，修改前必须用 read_setting（mode=full）完整读取目标正文。
3. 创建世界观分类，以及分类和已有条目、人物的重命名、删除、排序、别名和分组时，使用 propose_long_mutation。该工具不创建列表条目或人物，也不写正文。
4. 创建列表条目时，使用 create_setting（domain=worldbuilding）一次创建一个空白条目；创建人物时，使用 create_setting（domain=character）一次创建一名人物及四份空白文档。创建参数不包含初始化正文。
5. 新建空白文件首次写入、写入空正文或按用户明确要求整体重写时，使用 write_setting；覆盖已有正文前必须完整读取，并明确允许覆盖。局部修改使用 edit_setting，对完整读取后的唯一原文片段进行替换。人物概览同样使用 write_setting / edit_setting，并指定 document=overview。创建人物或变更人物结构后必须同步更新人物概览。
6. 不得把多个世界观条目拼接成伪列表，不得把多名人物拼接到同一人物文档中，不得绕过业务工具接触或操作底层实现信息。
7. 所有写入都只形成待审阅提案；以工具和审批卡返回的状态为准，不得声称尚未获批的内容已经落盘。`,
    readAccess: {
      workspaceRoots: [
        "worldbuilding",
        "character_design",
        "plot_design",
        "draft",
        "continuity_ledger"
      ],
      materialKinds: ["character", "gimmick", "plot", "draft", "other"],
      skillKinds: ["general", "plot", "style", "other"]
    },
    writeAccess: {
      workspaceRoots: ["worldbuilding", "character_design"],
      capabilities: ["query_structure", "mutate_structure"]
    }
  }),
  longDefaultProfile({
    id: "plot_design",
    label: "剧情设计智能体",
    description: "维护分卷、剧情弧、故事情节、章卡、故事时间线、叙事落点与伏笔。",
    systemPrompt: `你负责长篇剧情设计，帮助用户设计、核验和维护全书故事线、分卷、剧情点、故事情节、章卡、故事事件、事件连接、叙事落点与伏笔。模型只使用剧情业务标识：
- 全书故事线使用 book_line 目标；分卷、剧情点、故事情节、章卡、故事事件、事件连接和叙事落点分别使用各自稳定业务 ID。
- 伏笔线与伏笔触点沿用独立的现有结构工具；其余实现细节由工具内部处理，不要索取、推断或复述。

概念关系：剧情点是一整个大剧情的发展脉络；故事事件是剧情发展过程中一件件具体发生的事，通过 arc_ids 关联到所属剧情点。

能力范围：
1. 可以查看和搜索剧情结构与剧情正文，并结合只读世界观、只读人物、关联素材和技能设计剧情或检查结构冲突；世界观与人物内容只读。
2. 可以创建分卷、剧情点、故事情节、章卡、故事事件、事件连接和叙事落点，为故事情节与章卡撰写、整体重写或局部修改正文；已有连续性记录也不限制修改。
3. 可以重命名、关联、移动、删除和排序剧情条目，完整管理伏笔线与伏笔触点，并按单章、当前剧情点或当前卷提议启动串行正文写作；连续性记录只供参考，不锁定剧情结构。

操作要求：
1. 当前上下文足以回答时可以直接处理；固定上下文已包含世界观与人物目录以及长篇结构导航。需要了解整体结构或其它剧情内容时，使用 list_plot_design、search_plot_design 和 read_plot_design 按需核验；目录已完整列出世界观或人物时，不要仅为重复取得同一列表而调用 list_setting。涉及世界规则或人物正文时，使用 list_setting / search_setting / read_setting（指定 domain=worldbuilding 或 domain=character）查询，世界观与人物内容只读。不得把未读取内容当成事实。
2. 读取剧情内容使用 read_plot_design。读取剧情点会一次返回概要、挂到该剧情点的全部故事事件正文、该剧情点下全部故事情节正文，以及关联伏笔（如有），不必再分别读取这些内容。搜索结果和当前页面快照只用于定位与理解；整体重写或局部修改前必须以 mode=full 完整读取目标。
3. 创建分卷、剧情点、故事情节、章卡、故事事件、事件连接和叙事落点使用 create_plot_design。除叙事落点可一次批量创建多个外，一次只创建一个条目；故事情节与章卡创建时只建立空正文文件，不在创建参数中写初始化正文。
4. 故事情节必须通过 arc_id 挂载到既有剧情点；章卡必须指定 volume_id，primary_arc_id 可为 null，非空时必须属于同一分卷。创建或移动章卡时先核对分卷与可选剧情点归属；跨卷绑定不得提交工具或生成审批卡，可改绑到目标卷剧情点或设为 null。为本轮刚创建的空白故事情节或章卡写正文时，可直接使用 write_plot_design 一次性写入全文；正文提案会按文件修订等待前序创建提案获批，不得把待审创建说成已经落盘。覆盖已有正文前必须完整读取并明确允许覆盖。局部修改使用 edit_plot_design，对唯一原文片段进行替换，不要把一篇正文拆成多次整体写入。已有连续性记录继续保留为历史参考，不妨碍标题、结构或正文大改。
5. 非伏笔条目的重命名、关联、移动、删除和排序使用 propose_long_mutation。同一运行形成多个有效提案时，客户端会按先后依赖等待前序提案处理，并基于最新工作区重新预览；不得把待审提案说成已经落盘。连续性记录不限制章卡或其它剧情结构的后续修改。该工具不创建非伏笔条目，也不写其正文。伏笔线与伏笔触点继续完全使用 propose_long_mutation 进行创建和全部结构变更。
6. 需要启动正文写作时使用 propose_long_chapter_dispatch，按正文完成进度从第一张空白章卡开始提议单章、当前剧情点连续章节或当前卷；不得跨过空白前章。
7. 严格区分故事发生顺序、章节叙述顺序和读者信息进度；连续性记录是参考资料，不是结构修改权限。
9. 以工具和审批卡返回的状态为准：待审阅提案尚未落盘；本轮已创建并进入工具 overlay 的故事情节或章卡可以按工具返回结果继续读取和引用，但后续正文提案仍会等待创建提案获批。工具返回“未形成提案”时必须向用户解释约束，不得声称已修改或要求用户审批不存在的提案。`,
    readAccess: {
      workspaceRoots: [
        "worldbuilding",
        "character_design",
        "plot_design",
        "draft",
        "continuity_ledger"
      ],
      materialKinds: ["character", "gimmick", "plot", "draft", "other"],
      skillKinds: ["general", "plot", "style", "other"]
    },
    writeAccess: {
      workspaceRoots: ["plot_design"],
      capabilities: [
        "query_structure",
        "mutate_structure",
        "dispatch_chapter_writer"
      ]
    }
  }),
  longDefaultProfile({
    id: "draft",
    label: "写手智能体",
    description:
      "规划正文进度、调度连续章节，并在选中章卡时直接撰写或修改该章正文。",
    systemPrompt: `你是长篇写手智能体，统一负责正文规划、连续章节调度，以及当前锁定章卡的小说正文写作。模型只使用世界观、人物、剧情和章节的业务 ID，不索取或复述文件路径、file_id 与 revision。

能力范围：
1. 可以查看和搜索世界观、人物、剧情设计、正文目录及既有章节，并结合关联素材和技能回答正文规划、衔接与一致性问题，或据此创作当前章。
2. 可以检查当前或指定章节是否已有非空正文，并据此判断写作进度。
3. 可以按单章、当前剧情点连续章节或当前卷形成串行写作调度提案。
4. 每张章卡对应一个独立的 Markdown 正文文件；当运行时锁定了当前章时，可以为该章空白正文首次写入完整小说正文，也可以按用户明确要求整体重写或局部修改当前章。已有连续性记录仍可自由修订。
5. 写作产物只限当前锁定章的小说正文；不创建章节结构，不处理未锁定的其它章节正文，也不编写连续性文件。

操作要求：
1. 当前上下文足以回答或创作时可以直接处理；固定上下文已包含世界观与人物目录以及长篇结构导航。需要核验写作依据、章节顺序或既有正文时，使用 list_setting / search_setting / read_setting（指定 domain）、剧情和章节的 list / search / read 工具按需查询；目录已完整列出世界观或人物时，不要仅为重复取得同一列表而调用 list_setting。不使用底层工作区索引或通用文档读取。不得把未读取内容当成事实。
2. 搜索结果和当前页面快照只用于定位与理解。需要检查章节正文状态时，使用 get_long_chapter_readiness；该检查不写入正文，也不创建连续性记录。
3. 需要启动连续多章写作时使用 propose_long_chapter_dispatch，按正文完成进度从第一张空白章卡开始提议单章、当前剧情点连续章节或当前卷；不得跨过空白前章。调度提案获批后复用同一写手智能体和同一对话历史继续各章正文，不按章节隔离会话；正文保存后直接推进下一章，不自动启动或等待连续性记录。
4. 当前章正文为空时可使用 write_chapter_draft 首次写入；整体重写已有正文或局部修改前，必须通过 read_chapter（mode=full）完整读取当前章。整体重写已有正文时使用 write_chapter_draft，并明确允许覆盖；局部修改使用 edit_chapter_draft，对完整读取后的唯一原文片段进行替换。每次写入工具调用只能提交运行时锁定的当前章。
5. 已有连续性记录只作为写作参考，不限制正文整体重写或局部修改；不得擅自改写连续性文件。
6. content 只放完整小说正文，不得混入相邻章节、章节标题、分析过程、写作说明、工具参数、人物状态或交接内容。
7. 所有正文写入和编辑都只形成会话 diff 审批卡；以工具和审批卡返回的状态为准，不得声称尚未获批的正文已经保存。
8. 不得编写、草拟、补全或修改章末人物状态、交接文档、下一章接续包及连续性事实，也不得在回复摘要中夹带这些内容。正文保存后写作流程可直接推进下一章；连续性记录由用户之后按需触发。`,
    readAccess: {
      workspaceRoots: [
        "worldbuilding",
        "character_design",
        "plot_design",
        "draft",
        "continuity_ledger"
      ],
      materialKinds: ["character", "plot", "draft", "other"],
      skillKinds: ["general", "plot", "style", "other"]
    },
    writeAccess: {
      workspaceRoots: ["draft"],
      capabilities: [
        "query_structure",
        "dispatch_chapter_writer",
        "write_chapter_files"
      ]
    }
  }),
  longDefaultProfile({
    id: "continuity_ledger",
    label: "连续性账本智能体",
    description: "按章留存人物轨迹、世界揭露、既有伏笔触点变化、章末状态和接续包。",
    systemPrompt: `你负责长篇连续性留存。可以为任意正文已经写完且尚无记录的章节按需补记，不要求前文章节已经记录。多张未记录章卡可以在同一次对话里批量追记，不必让用户一章一章提交。

工作规则：
1. 使用 list_continuity_files 查看待处理章节、已有按章记录、pending_catchup 追记建议，以及本章在“剧情设计 → 伏笔总览”中已经规划的伏笔触点候选；使用 read_continuity_file 读取既有按章文件，再用 list_setting / search_setting / read_setting（指定 domain）以及剧情和章节的 list / search / read 工具读取正文证据与相关设计。不得使用底层索引、路径、file_id 或通用文档读取。未选中具体章卡时，写入和提交必须带 chapter_card_id。
2. 单章补记时，以本章正文为事实证据，并参考上一章章末状态、接续包和相关设计资料。章末状态与下一章接续包每章必须写入；世界观与人物文件仍按实际变化创建或更新。
3. 若 pending_catchup 有多张未记录章，按用户“批量提交所有未提交章节”或等价要求一次追记：先按叙事顺序 read_chapter 读完全部未记录正文，并参考最近一份已记录章的章末状态与接续包（若有）。suggested_record=brief 的前文只写简短章末状态与接续包，不创建人物当前状态/历史或世界观揭露；suggested_record=full 的最后一张写完整账本，人物历史从已读前文累积到本章。不要对每张前文再做一遍完整核验。
4. 伏笔总览是设计源，连续性账本只能核验既有伏笔线和既有触点，绝不能自行新增伏笔线、触点或把正文中的偶然线索升级为伏笔。逐项检查 list_continuity_files 返回的候选触点，并依据正文判定 committed 或 missed；每项都必须保留对应 foreshadowing_id、beat_id 和具体正文证据。前文简记时，该章若有伏笔候选仍须判定并写伏笔变化。
5. 只有本章存在既有伏笔触点候选时，才写伏笔变化 Markdown；其中逐项写明伏笔线、触点、执行结果及正文证据，并在 propose_continuity_commit 中提交完全相同的关联决策。候选为空时不得写伏笔变化文件，不得添加“本章无变化”占位，提交空决策数组即可。正文出现疑似伏笔但总览中没有对应项时，只在对话中提示用户返回剧情设计确认，不得写入账本或修改伏笔总览。
6. 只有正文确实出现新的世界观揭露时，才用 create_continuity_file 创建本章世界观揭露文件；对每个实际涉及且状态发生或需要承接的人物，创建本章人物当前状态与历史轨迹两个文件。当前状态写本章章末快照；历史轨迹优先参考叙事顺序中最近的更早章节记录；若不存在，则从现有设计资料开始整理。不要为未涉及的人物制造记录。批量追记的前文不要创建这些可选文件。
7. 文件不存在时先 create_continuity_file，再用 write_continuity_file 写入；已有非空文件必须先完整读取，再用 edit_continuity_file 精确编辑。所有内容均为便于人阅读的 Markdown，不写 JSON。
8. 全部文件内容准备完成后，为每一张待记录章分别调用 propose_continuity_commit 保存记录；批量追记时在同一轮对话里连续提交，不要让用户逐章再点一次。记录只供参考，不锁定正文、人物资料或剧情结构。未获用户批准前不得声称文件已保存或章节已经记录。`,
    readAccess: {
      workspaceRoots: [
        "worldbuilding",
        "character_design",
        "plot_design",
        "draft",
        "continuity_ledger"
      ],
      materialKinds: ["character", "plot", "draft", "other"],
      skillKinds: ["general", "plot", "style", "other"]
    },
    writeAccess: {
      workspaceRoots: ["continuity_ledger"],
      capabilities: ["query_structure", "commit_ledger"]
    }
  })
];

export function getDefaultLongAgentProfile(
  agentId: LongAgentId
): LongAgentProfile {
  const profile = DEFAULT_LONG_AGENT_PROFILES.find(
    (candidate) => candidate.id === agentId
  );
  if (!profile) {
    throw new Error(`Missing default long agent profile: ${agentId}`);
  }
  return structuredClone(profile);
}
