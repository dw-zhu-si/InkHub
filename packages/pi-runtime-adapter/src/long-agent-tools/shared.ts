import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { createHash } from "node:crypto";
import { Type, type Static, type TSchema } from "typebox";
import {
  LongWorkspaceOperationError,
  createEmptyLongMarkdownFileReference,
  longChapterBodyFileId,
  longChapterCardFileId,
  longChapterCharacterStateFileId,
  longChapterContinuityFilePath,
  longChapterFilePath,
  longChapterForeshadowingChangesFileId,
  longChapterHandoffFileId,
  longCharacterCoreProfileFileId,
  longCharacterCurrentStateFileId,
  longCharacterFilePath,
  longCharacterHistoryFileId,
  longCharacterRelationshipsFileId,
  longStoryPlotBodyFileId,
  longStoryPlotFilePath,
  longWorldbuildingContentPath,
  longWorldbuildingFileId,
  longWorldbuildingItemContentPath,
  longWorldbuildingItemFileId,
  longWorldbuildingOverviewContentPath,
  longWorldbuildingOverviewFileId,
  previewLongWorkspaceOperations,
  type CommandResult,
  type LongWorkspaceFileReference,
  type LongWorkspaceIndexSnapshot,
  type LongWorkspaceOperation,
  type LongWorkspaceOperationBatch,
  type LongWorkspaceRoot
} from "@deepwrite/contracts";
import { LONG_MUTATION_PARAMETERS } from "./schemas";
import { chapterVolumeConflictMessage } from "./formatting";
import type { LongAgentToolDetails, LongCommandExecutor } from "./index";

export function textResult(
  text: string,
  details: LongAgentToolDetails = { kind: "none" }
): AgentToolResult<LongAgentToolDetails> {
  return { content: [{ type: "text", text }], details };
}
export function preflightLongMutationProposal(
  index: LongWorkspaceIndexSnapshot,
  batch: LongWorkspaceOperationBatch
): AgentToolResult<LongAgentToolDetails> | undefined {
  if (batch.operations.length === 0) return undefined;
  const chapterConflict = chapterVolumeConflictMessage(index, batch);
  if (chapterConflict) return textResult(chapterConflict);
  try {
    // The agent index snapshot does not necessarily carry file revisions that
    // were refreshed by readDocument in the same tool call. Validate structure
    // here and leave document-revision checks to the client's existing preview.
    previewLongWorkspaceOperations(index, {
      ...batch,
      documentWrites: []
    });
    return undefined;
  } catch (error: unknown) {
    if (!(error instanceof LongWorkspaceOperationError)) throw error;
    const reasonLabels: Record<typeof error.code, string> = {
      revision_conflict: "工作区版本已经变化",
      not_found: "目标条目不存在",
      already_exists: "目标条目已经存在",
      invalid_reference: "引用关系无效",
      cascade_required: "需要明确级联处理",
      cascade_impact_mismatch: "级联影响与声明不一致",
      committed_prefix_protected: "已提交连续性前缀受保护",
      invalid_order: "排序范围或顺序不完整",
      invalid_document_write: "文档写入目标或修订无效",
      invalid_result: "操作后的结构不满足长篇约束"
    };
    return textResult(
      [
        `未形成长篇结构变更提案：${reasonLabels[error.code]}（${error.code}）。`,
        `校验详情：${error.message}`,
        "不会生成审批卡。请先根据最新结构修正操作；如果修正会改变用户原意，请直接告知用户当前约束和可选方案，不要重复提交相同参数，也不要声称变更已经保存。"
      ].join("\n")
    );
  }
}

export function defineTool<T extends TSchema>(definition: {
  name: string;
  label: string;
  description: string;
  parameters: T;
  execute: (
    toolCallId: string,
    params: Static<T>,
    signal?: AbortSignal
  ) => Promise<AgentToolResult<LongAgentToolDetails>>;
  executionMode?: AgentTool["executionMode"];
}): AgentTool<T, LongAgentToolDetails> {
  return {
    name: definition.name,
    label: definition.label,
    description: definition.description,
    parameters: definition.parameters,
    execute: definition.execute,
    ...(definition.executionMode ? { executionMode: definition.executionMode } : {})
  };
}

export function literalUnion<T extends string>(values: readonly T[]) {
  if (values.length === 1) return Type.Literal(values[0]!);
  return Type.Union(values.map((value) => Type.Literal(value)));
}


function abortError(): Error {
  const error = new Error("Long workspace query was aborted.");
  error.name = "AbortError";
  return error;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

export function requireExecutor(
  executor: LongCommandExecutor | undefined
): LongCommandExecutor {
  if (!executor) {
    throw new Error("Long workspace Core bridge is unavailable.");
  }
  return executor;
}

export function requireAccepted(result: CommandResult): unknown {
  if (result.status === "rejected") {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.payload;
}

export function rootForOperation(operation: LongWorkspaceOperation): LongWorkspaceRoot {
  const prefix = operation.type.split(".", 1)[0];
  if (prefix === "worldbuilding" || prefix === "worldbuildingItem") {
    return "worldbuilding";
  }
  if (prefix === "character") return "character_design";
  if (prefix === "chapterContinuity") return "continuity_ledger";
  // Chapter cards are plot structure. Their three Markdown files live under
  // the draft root, but generic structure proposals may only create those
  // empty files; chapter prose is owned by the typed chapter draft tools.
  if (prefix === "chapter") return "plot_design";
  return "plot_design";
}

export function createdFileRootForOperation(
  operation: LongWorkspaceOperation
): LongWorkspaceRoot {
  if (operation.type === "chapter.create") return "draft";
  return rootForOperation(operation);
}

export function filePathBelongsToRoot(
  file: LongWorkspaceFileReference,
  root: LongWorkspaceRoot
): boolean {
  if (
    root === "plot_design" &&
    file.id.startsWith("file_chapter_") &&
    file.id.endsWith(":card") &&
    file.path.startsWith("long/chapters/") &&
    file.path.endsWith("/card.md")
  ) {
    return true;
  }
  const prefixes: Record<LongWorkspaceRoot, readonly string[]> = {
    worldbuilding: ["long/worldbuilding/"],
    character_design: ["long/characters/"],
    plot_design: ["long/plot/", "long/story-plots/"],
    draft: ["long/chapters/"],
    continuity_ledger: ["long/continuity/", "long/ledger/"]
  };
  return prefixes[root].some((prefix) => file.path.startsWith(prefix));
}

function addFile(
  map: Map<string, { root: LongWorkspaceRoot; file: LongWorkspaceFileReference }>,
  root: LongWorkspaceRoot,
  file: LongWorkspaceFileReference
): void {
  map.set(file.id, { root, file });
}

export function fileRootMap(
  index: LongWorkspaceIndexSnapshot
): Map<string, { root: LongWorkspaceRoot; file: LongWorkspaceFileReference }> {
  const map = new Map<
    string,
    { root: LongWorkspaceRoot; file: LongWorkspaceFileReference }
  >();
  addFile(map, "plot_design", index.bookLine);
  for (const storyPlot of index.plot.storyPlots) {
    addFile(map, "plot_design", storyPlot.file);
  }
  for (const category of index.worldbuilding) {
    if (category.format === "text") {
      addFile(map, "worldbuilding", category.file);
    } else {
      if (category.overview) {
        addFile(map, "worldbuilding", category.overview);
      }
      for (const item of category.items) {
        addFile(map, "worldbuilding", item.file);
      }
    }
  }
  if (index.characterOverview) {
    addFile(map, "character_design", index.characterOverview);
  }
  for (const entry of index.characterFiles) {
    addFile(map, "character_design", entry.coreProfile);
    addFile(map, "character_design", entry.relationships);
    addFile(map, "character_design", entry.currentState);
    addFile(map, "character_design", entry.history);
  }
  for (const entry of index.chapters) {
    addFile(map, "draft", entry.body);
    addFile(map, "plot_design", entry.card);
    addFile(map, "draft", entry.characterState);
    addFile(map, "draft", entry.handoff);
    addFile(map, "continuity_ledger", entry.foreshadowingChanges);
    if (entry.worldReveals) {
      addFile(map, "continuity_ledger", entry.worldReveals);
    }
    for (const character of entry.characterContinuity) {
      addFile(map, "continuity_ledger", character.currentState);
      addFile(map, "continuity_ledger", character.history);
    }
  }
  for (const entry of index.ledger.commits) {
    addFile(map, "continuity_ledger", entry.recordFile);
  }
  return map;
}

export function collectOperationFiles(
  operation: LongWorkspaceOperation
): LongWorkspaceFileReference[] {
  if (operation.type === "worldbuilding.create") {
    return operation.category.format === "text"
      ? [operation.category.file]
      : [
          ...(operation.category.overview
            ? [operation.category.overview]
            : []),
          ...operation.category.items.map(({ file }) => file)
        ];
  }
  if (operation.type === "worldbuildingItem.create") {
    return [operation.item.file];
  }
  if (operation.type === "storyPlot.create") {
    return [operation.storyPlot.file];
  }
  if (operation.type === "character.create") {
    return [
      operation.files.coreProfile,
      operation.files.relationships,
      operation.files.currentState,
      operation.files.history
    ];
  }
  if (operation.type === "chapter.create") {
    return [
      operation.files.body,
      operation.files.card,
      operation.files.characterState,
      operation.files.handoff,
      operation.files.foreshadowingChanges
    ];
  }
  if (operation.type === "chapterContinuity.worldReveals.create") {
    return [operation.file];
  }
  if (operation.type === "chapterContinuity.character.create") {
    return [operation.currentState, operation.history];
  }
  return [];
}

type LongMutationToolParameters = Static<typeof LONG_MUTATION_PARAMETERS>;
export type LongMutationToolOperation =
  LongMutationToolParameters["operations"][number];
type LongDocumentUpdateParameter = NonNullable<
  LongMutationToolParameters["document_updates"]
>[number];

const CREATE_OPERATION_PREFIX = {
  "worldbuilding.create": "world",
  "worldbuildingItem.create": "worlditem",
  "character.create": "character",
  "volume.create": "volume",
  "arc.create": "arc",
  "chapter.create": "chapter",
  "event.create": "event",
  "storyPlot.create": "storyplot",
  "connection.create": "connection",
  "placement.create": "placement",
  "foreshadowing.create": "foreshadow",
  "foreshadowingBeat.create": "beat"
} as const;

function allEntityIds(index: LongWorkspaceIndexSnapshot): Set<string> {
  return new Set([
    ...index.worldbuilding.map(({ id }) => id),
    ...index.worldbuilding.flatMap((category) =>
      category.format === "list"
        ? category.items.map(({ id }) => id)
        : []
    ),
    ...index.characters.map(({ id }) => id),
    ...index.plot.volumes.map(({ id }) => id),
    ...index.plot.arcs.map(({ id }) => id),
    ...index.plot.chapterCards.map(({ id }) => id),
    ...index.plot.storyEvents.map(({ id }) => id),
    ...index.plot.storyPlots.map(({ id }) => id),
    ...index.plot.eventConnections.map(({ id }) => id),
    ...index.plot.narrativePlacements.map(({ id }) => id),
    ...index.plot.foreshadowing.flatMap((thread) => [
      thread.id,
      ...thread.beats.map(({ id }) => id)
    ])
  ]);
}

export function stableHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const STABLE_ENTITY_ID_HEX_LENGTH = 8;

export function stableEntityId(prefix: string, seed: string): string {
  return `${prefix}_${stableHash(seed).slice(0, STABLE_ENTITY_ID_HEX_LENGTH)}`;
}

function createRuntimeStableId(
  prefix: string,
  seed: string,
  occupied: Set<string>
): string {
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const id = stableEntityId(prefix, `${seed}:${attempt}`);
    if (!occupied.has(id)) {
      occupied.add(id);
      return id;
    }
  }
  throw new Error(`Unable to allocate a stable ${prefix} id.`);
}

function resolveEntityReference(
  value: string,
  prefix: string,
  clientReferences: ReadonlyMap<string, string>
): string {
  if (value.startsWith("ref:")) {
    const resolved = clientReferences.get(value.slice(4));
    if (!resolved) {
      throw new Error(`Unknown long mutation client reference: ${value}`);
    }
    if (!resolved.startsWith(`${prefix}_`)) {
      throw new Error(`Long mutation client reference ${value} has the wrong entity type.`);
    }
    return resolved;
  }
  if (!value.startsWith(`${prefix}_`)) {
    throw new Error(`Expected a ${prefix} entity reference.`);
  }
  return value;
}

function resolveOptionalReference(
  value: string | null | undefined,
  prefix: string,
  clientReferences: ReadonlyMap<string, string>
): string | null | undefined {
  return typeof value === "string"
    ? resolveEntityReference(value, prefix, clientReferences)
    : value;
}

export function maxOrder(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

function incrementCounter(
  counters: Map<string, number>,
  key: string
): number {
  const next = (counters.get(key) ?? 0) + 1;
  counters.set(key, next);
  return next;
}

export function buildRuntimeOperations(input: {
  rawOperations: LongMutationToolOperation[];
  index: LongWorkspaceIndexSnapshot;
  timestamp: string;
  idSeed: string;
}): {
  operations: LongWorkspaceOperation[];
  clientReferences: ReadonlyMap<string, string>;
} {
  const occupied = allEntityIds(input.index);
  const generatedIds = new Map<number, string>();
  const clientReferences = new Map<string, string>();

  input.rawOperations.forEach((operation, operationIndex) => {
    const prefix =
      CREATE_OPERATION_PREFIX[
        operation.type as keyof typeof CREATE_OPERATION_PREFIX
      ];
    if (!prefix) return;
    const id = createRuntimeStableId(
      prefix,
      `${input.idSeed}:${operationIndex}:${operation.type}`,
      occupied
    );
    generatedIds.set(operationIndex, id);
    const clientRef =
      "client_ref" in operation ? operation.client_ref : undefined;
    if (clientRef) {
      if (clientReferences.has(clientRef)) {
        throw new Error(
          `Duplicate long mutation client reference: ${clientRef}`
        );
      }
      clientReferences.set(clientRef, id);
    }
  });

  let worldOrder = maxOrder(
    input.index.worldbuilding.map(({ order }) => order)
  );
  const characterOrders = new Map(
    input.index.characterTypes.map(
      ({ id }) =>
        [
          id,
          maxOrder(
            input.index.characters
              .filter((character) => character.group === id)
              .map(({ order }) => order)
          )
        ] as const
    )
  );
  let volumeOrder = maxOrder(
    input.index.plot.volumes.map(({ order }) => order)
  );
  const arcOrders = new Map<string, number>();
  for (const arc of input.index.plot.arcs) {
    arcOrders.set(
      arc.volumeId,
      Math.max(arcOrders.get(arc.volumeId) ?? 0, arc.order)
    );
  }
  const chapterOrders = new Map<string, number>();
  for (const chapter of input.index.plot.chapterCards) {
    chapterOrders.set(
      chapter.volumeId,
      Math.max(
        chapterOrders.get(chapter.volumeId) ?? 0,
        chapter.narrativeOrder
      )
    );
  }
  let storyOrder = maxOrder(
    input.index.plot.storyEvents.map(({ storyOrder: order }) => order)
  );
  const storyPlotOrders = new Map<string, number>();
  for (const storyPlot of input.index.plot.storyPlots) {
    storyPlotOrders.set(
      storyPlot.arcId,
      Math.max(storyPlotOrders.get(storyPlot.arcId) ?? 0, storyPlot.order)
    );
  }
  const placementOrders = new Map<string, number>();
  for (const placement of input.index.plot.narrativePlacements) {
    placementOrders.set(
      placement.chapterCardId,
      Math.max(
        placementOrders.get(placement.chapterCardId) ?? 0,
        placement.orderInChapter
      )
    );
  }
  const beatOrders = new Map<string, number>(
    input.index.plot.foreshadowing.map((thread) => [
      thread.id,
      maxOrder(thread.beats.map(({ order }) => order))
    ])
  );

  const ref = (value: string, prefix: string) =>
    resolveEntityReference(value, prefix, clientReferences);
  const refs = (values: readonly string[], prefix: string) =>
    values.map((value) => ref(value, prefix));
  const optionalRef = (
    value: string | null | undefined,
    prefix: string
  ) => resolveOptionalReference(value, prefix, clientReferences);

  return {
    clientReferences,
    operations: input.rawOperations.map((operation, operationIndex) => {
      const generatedId = generatedIds.get(operationIndex);
      switch (operation.type) {
        case "worldbuilding.create": {
          const id = generatedId!;
          worldOrder += 1;
          return operation.format === "list"
            ? {
                type: operation.type,
                category: {
                  id,
                  title: operation.title,
                  order: worldOrder,
                  format: "list" as const,
                  contentAuthority: "files" as const,
                  overview: createEmptyLongMarkdownFileReference(
                    longWorldbuildingOverviewFileId(id),
                    longWorldbuildingOverviewContentPath(id),
                    input.timestamp
                  ),
                  items: []
                }
              }
            : {
                type: operation.type,
                category: {
                  id,
                  title: operation.title,
                  order: worldOrder,
                  format: "text" as const,
                  contentAuthority: "markdown" as const,
                  file: createEmptyLongMarkdownFileReference(
                    longWorldbuildingFileId(id),
                    longWorldbuildingContentPath(id),
                    input.timestamp
                  )
                }
              };
        }
        case "worldbuilding.update":
        case "worldbuilding.delete":
          return {
            ...operation,
            id: ref(operation.id, "world")
          } as LongWorkspaceOperation;
        case "worldbuilding.reorder":
          return {
            type: operation.type,
            orderedIds: refs(operation.orderedIds, "world")
          };
        case "worldbuildingItem.create": {
          const id = generatedId!;
          const categoryId = ref(operation.categoryId, "world");
          const category = input.index.worldbuilding.find(
            (candidate) => candidate.id === categoryId
          );
          if (!category || category.format !== "list") {
            throw new Error(
              "Worldbuilding items can only be created in an existing list category."
            );
          }
          const priorCreates = input.rawOperations
            .slice(0, operationIndex)
            .filter(
              (candidate) =>
                candidate.type === "worldbuildingItem.create" &&
                ref(candidate.categoryId, "world") === categoryId
            ).length;
          return {
            type: operation.type,
            categoryId,
            item: {
              id,
              title: operation.title,
              order: category.items.length + priorCreates + 1,
              file: createEmptyLongMarkdownFileReference(
                longWorldbuildingItemFileId(id),
                longWorldbuildingItemContentPath(categoryId, id),
                input.timestamp
              )
            }
          };
        }
        case "worldbuildingItem.update":
        case "worldbuildingItem.delete":
          return {
            ...operation,
            categoryId: ref(operation.categoryId, "world"),
            id: ref(operation.id, "worlditem")
          } as LongWorkspaceOperation;
        case "worldbuildingItem.reorder":
          return {
            type: operation.type,
            categoryId: ref(operation.categoryId, "world"),
            orderedIds: refs(operation.orderedIds, "worlditem")
          };

        case "character.create": {
          const id = generatedId!;
          const order = incrementCounter(characterOrders, operation.type_id);
          return {
            type: operation.type,
            character: {
              id,
              name: operation.name,
              group: operation.type_id,
              order,
              aliases: operation.aliases ?? []
            },
            files: {
              characterId: id,
              coreProfile: createEmptyLongMarkdownFileReference(
                longCharacterCoreProfileFileId(id),
                longCharacterFilePath(id, "core-profile.md"),
                input.timestamp
              ),
              relationships: createEmptyLongMarkdownFileReference(
                longCharacterRelationshipsFileId(id),
                longCharacterFilePath(id, "relationships.md"),
                input.timestamp
              ),
              currentState: createEmptyLongMarkdownFileReference(
                longCharacterCurrentStateFileId(id),
                longCharacterFilePath(id, "current-state.md"),
                input.timestamp
              ),
              history: createEmptyLongMarkdownFileReference(
                longCharacterHistoryFileId(id),
                longCharacterFilePath(id, "history.md"),
                input.timestamp
              )
            }
          };
        }
        case "character.update":
        case "character.delete":
          return {
            ...operation,
            id: ref(operation.id, "character")
          } as LongWorkspaceOperation;
        case "character.move":
          return {
            type: operation.type,
            id: ref(operation.id, "character"),
            toGroup: operation.to_type_id,
            ...(operation.beforeCharacterId
              ? {
                  beforeCharacterId: ref(
                    operation.beforeCharacterId,
                    "character"
                  )
                }
              : {})
          };
        case "character.reorder":
          return {
            type: operation.type,
            group: operation.type_id,
            orderedIds: refs(operation.orderedIds, "character")
          };

        case "volume.create":
          volumeOrder += 1;
          return {
            type: operation.type,
            volume: {
              id: generatedId!,
              title: operation.title,
              order: volumeOrder,
              summary: operation.summary ?? ""
            }
          };
        case "volume.update":
        case "volume.delete":
          return {
            ...operation,
            id: ref(operation.id, "volume")
          } as LongWorkspaceOperation;
        case "volume.reorder":
          return {
            type: operation.type,
            orderedIds: refs(operation.orderedIds, "volume")
          };

        case "arc.create": {
          const volumeId = ref(operation.volumeId, "volume");
          return {
            type: operation.type,
            arc: {
              id: generatedId!,
              volumeId,
              title: operation.title,
              order: incrementCounter(arcOrders, volumeId),
              ...(operation.summary === undefined
                ? {}
                : { summary: operation.summary }),
              outline: operation.outline ?? ""
            }
          };
        }
        case "arc.update":
        case "arc.delete":
          return {
            ...operation,
            id: ref(operation.id, "arc")
          } as LongWorkspaceOperation;
        case "arc.move":
          return {
            type: operation.type,
            id: ref(operation.id, "arc"),
            toVolumeId: ref(operation.toVolumeId, "volume"),
            ...(operation.beforeArcId
              ? { beforeArcId: ref(operation.beforeArcId, "arc") }
              : {})
          };
        case "arc.reorder":
          return {
            type: operation.type,
            volumeId: ref(operation.volumeId, "volume"),
            orderedIds: refs(operation.orderedIds, "arc")
          };

        case "chapter.create": {
          const id = generatedId!;
          const volumeId = ref(operation.volumeId, "volume");
          return {
            type: operation.type,
            chapterCard: {
              id,
              volumeId,
              primaryArcId:
                operation.primaryArcId === null
                  ? null
                  : ref(operation.primaryArcId, "arc"),
              title: operation.title,
              narrativeOrder: incrementCounter(chapterOrders, volumeId)
            },
            files: {
              chapterCardId: id,
              bodyStatus: "empty",
              body: createEmptyLongMarkdownFileReference(
                longChapterBodyFileId(id),
                longChapterFilePath(id, "body.md"),
                input.timestamp
              ),
              card: createEmptyLongMarkdownFileReference(
                longChapterCardFileId(id),
                longChapterFilePath(id, "card.md"),
                input.timestamp
              ),
              characterState: createEmptyLongMarkdownFileReference(
                longChapterCharacterStateFileId(id),
                longChapterFilePath(id, "character-state.md"),
                input.timestamp
              ),
              handoff: createEmptyLongMarkdownFileReference(
                longChapterHandoffFileId(id),
                longChapterFilePath(id, "handoff.md"),
                input.timestamp
              ),
              foreshadowingChanges: createEmptyLongMarkdownFileReference(
                longChapterForeshadowingChangesFileId(id),
                longChapterContinuityFilePath(
                  id,
                  "foreshadowing-changes.md"
                ),
                input.timestamp
              ),
              worldReveals: null,
              characterContinuity: [],
              commitId: null
            }
          };
        }
        case "chapter.update":
          return {
            type: operation.type,
            id: ref(operation.id, "chapter"),
            patch: operation.patch
          };
        case "chapter.delete":
          return {
            ...operation,
            id: ref(operation.id, "chapter")
          };
        case "chapter.move":
          return {
            type: operation.type,
            id: ref(operation.id, "chapter"),
            toVolumeId: ref(operation.toVolumeId, "volume"),
            toPrimaryArcId:
              operation.toPrimaryArcId === null
                ? null
                : ref(operation.toPrimaryArcId, "arc"),
            ...(operation.beforeChapterCardId
              ? {
                  beforeChapterCardId: ref(
                    operation.beforeChapterCardId,
                    "chapter"
                  )
                }
              : {})
          };
        case "chapter.reorder":
          return {
            type: operation.type,
            volumeId: ref(operation.volumeId, "volume"),
            orderedIds: refs(operation.orderedIds, "chapter")
          };

        case "event.create":
          storyOrder += 1;
          return {
            type: operation.type,
            event: {
              id: generatedId!,
              title: operation.title,
              summary: operation.summary ?? "",
              timeMode: operation.timeMode,
              timeLabel: operation.timeLabel ?? "",
              ...(operation.timeValue !== undefined
                ? { timeValue: operation.timeValue }
                : {}),
              storyOrder,
              location: operation.location ?? "",
              arcIds: refs(operation.arcIds ?? [], "arc"),
              characterIds: refs(
                operation.characterIds ?? [],
                "character"
              )
            }
          };
        case "event.update":
          return {
            type: operation.type,
            id: ref(operation.id, "event"),
            patch: {
              ...operation.patch,
              ...(operation.patch.arcIds
                ? { arcIds: refs(operation.patch.arcIds, "arc") }
                : {}),
              ...(operation.patch.characterIds
                ? {
                    characterIds: refs(
                      operation.patch.characterIds,
                      "character"
                    )
                  }
                : {})
            }
          };
        case "event.delete":
          return {
            ...operation,
            id: ref(operation.id, "event")
          };
        case "event.reorder":
          return {
            type: operation.type,
            orderedIds: refs(operation.orderedIds, "event")
          };

        case "storyPlot.create": {
          const id = generatedId!;
          const arcId = ref(operation.arcId, "arc");
          return {
            type: operation.type,
            storyPlot: {
              id,
              arcId,
              title: operation.title,
              order: incrementCounter(storyPlotOrders, arcId),
              file: createEmptyLongMarkdownFileReference(
                longStoryPlotBodyFileId(id),
                longStoryPlotFilePath(id),
                input.timestamp
              )
            }
          };
        }
        case "storyPlot.update":
        case "storyPlot.delete":
          return {
            ...operation,
            id: ref(operation.id, "storyplot")
          } as LongWorkspaceOperation;
        case "storyPlot.reorder":
          return {
            type: operation.type,
            arcId: ref(operation.arcId, "arc"),
            orderedIds: refs(operation.orderedIds, "storyplot")
          };

        case "connection.create":
          return {
            type: operation.type,
            connection: {
              id: generatedId!,
              sourceEventId: ref(operation.sourceEventId, "event"),
              targetEventId: ref(operation.targetEventId, "event"),
              type: operation.connectionType,
              note: operation.note ?? ""
            }
          };
        case "connection.update": {
          const { connectionType, ...patch } = operation.patch;
          return {
            type: operation.type,
            id: ref(operation.id, "connection"),
            patch: {
              ...patch,
              ...(patch.sourceEventId
                ? { sourceEventId: ref(patch.sourceEventId, "event") }
                : {}),
              ...(patch.targetEventId
                ? { targetEventId: ref(patch.targetEventId, "event") }
                : {}),
              ...(connectionType !== undefined
                ? { type: connectionType }
                : {})
            }
          };
        }
        case "connection.delete":
          return {
            ...operation,
            id: ref(operation.id, "connection")
          };

        case "placement.create": {
          const chapterCardId = ref(
            operation.chapterCardId,
            "chapter"
          );
          return {
            type: operation.type,
            placement: {
              id: generatedId!,
              eventId: ref(operation.eventId, "event"),
              chapterCardId,
              orderInChapter: incrementCounter(
                placementOrders,
                chapterCardId
              ),
              mode: operation.mode,
              disclosure: operation.disclosure,
              writingPrompt: operation.writingPrompt ?? "",
              status: "planned",
              commitId: null
            }
          };
        }
        case "placement.update":
          return {
            type: operation.type,
            id: ref(operation.id, "placement"),
            patch: {
              ...operation.patch,
              ...(operation.patch.eventId
                ? { eventId: ref(operation.patch.eventId, "event") }
                : {})
            }
          };
        case "placement.delete":
          return {
            ...operation,
            id: ref(operation.id, "placement")
          };
        case "placement.move":
          return {
            type: operation.type,
            id: ref(operation.id, "placement"),
            toChapterCardId: ref(
              operation.toChapterCardId,
              "chapter"
            ),
            ...(operation.beforePlacementId
              ? {
                  beforePlacementId: ref(
                    operation.beforePlacementId,
                    "placement"
                  )
                }
              : {})
          };
        case "placement.reorder":
          return {
            type: operation.type,
            chapterCardId: ref(operation.chapterCardId, "chapter"),
            orderedIds: refs(operation.orderedIds, "placement")
          };

        case "foreshadowing.create":
          beatOrders.set(generatedId!, 0);
          return {
            type: operation.type,
            thread: {
              id: generatedId!,
              title: operation.title,
              coreQuestion: operation.coreQuestion ?? "",
              ...(operation.hiddenTruth !== undefined
                ? { hiddenTruth: operation.hiddenTruth }
                : {}),
              ...(operation.plannedSpan !== undefined
                ? { plannedSpan: operation.plannedSpan }
                : {}),
              truthEventId:
                optionalRef(operation.truthEventId, "event") ?? null,
              expectedReaderEffect: operation.expectedReaderEffect ?? "",
              status: operation.status ?? "planned",
              beats: []
            }
          };
        case "foreshadowing.update":
          return {
            type: operation.type,
            id: ref(operation.id, "foreshadow"),
            patch: {
              ...operation.patch,
              ...(operation.patch.truthEventId !== undefined
                ? {
                    truthEventId: optionalRef(
                      operation.patch.truthEventId,
                      "event"
                    )
                  }
                : {})
            }
          };
        case "foreshadowing.delete":
          return {
            ...operation,
            id: ref(operation.id, "foreshadow")
          };
        case "foreshadowing.reorder":
          return {
            type: operation.type,
            orderedIds: refs(operation.orderedIds, "foreshadow")
          };

        case "foreshadowingBeat.create": {
          const threadId = ref(operation.threadId, "foreshadow");
          return {
            type: operation.type,
            threadId,
            beat: {
              id: generatedId!,
              type: operation.beatType,
              order: incrementCounter(beatOrders, threadId),
              ...(operation.volumeId !== undefined
                ? {
                    volumeId: optionalRef(
                      operation.volumeId,
                      "volume"
                    )
                  }
                : {}),
              ...(operation.arcId !== undefined
                ? { arcId: optionalRef(operation.arcId, "arc") }
                : {}),
              eventId: optionalRef(operation.eventId, "event") ?? null,
              placementId:
                optionalRef(operation.placementId, "placement") ?? null,
              chapterCardId:
                optionalRef(operation.chapterCardId, "chapter") ?? null,
              plannedScope: operation.plannedScope ?? "",
              note: operation.note ?? "",
              status: "planned",
              commitId: null
            }
          };
        }
        case "foreshadowingBeat.update": {
          const {
            beatType,
            volumeId,
            arcId,
            eventId,
            placementId,
            chapterCardId,
            ...patch
          } = operation.patch;
          return {
            type: operation.type,
            id: ref(operation.id, "beat"),
            patch: {
              ...patch,
              ...(beatType !== undefined ? { type: beatType } : {}),
              ...(volumeId !== undefined
                ? {
                    volumeId: optionalRef(volumeId, "volume")
                  }
                : {}),
              ...(arcId !== undefined
                ? { arcId: optionalRef(arcId, "arc") }
                : {}),
              ...(eventId !== undefined
                ? { eventId: optionalRef(eventId, "event") }
                : {}),
              ...(placementId !== undefined
                ? {
                    placementId: optionalRef(
                      placementId,
                      "placement"
                    )
                  }
                : {}),
              ...(chapterCardId !== undefined
                ? {
                    chapterCardId: optionalRef(
                      chapterCardId,
                      "chapter"
                    )
                  }
                : {})
            }
          };
        }
        case "foreshadowingBeat.delete":
          return {
            ...operation,
            id: ref(operation.id, "beat")
          };
        case "foreshadowingBeat.move":
          return {
            type: operation.type,
            id: ref(operation.id, "beat"),
            toThreadId: ref(operation.toThreadId, "foreshadow"),
            ...(operation.beforeBeatId
              ? {
                  beforeBeatId: ref(
                    operation.beforeBeatId,
                    "beat"
                  )
                }
              : {})
          };
        case "foreshadowingBeat.reorder":
          return {
            type: operation.type,
            threadId: ref(operation.threadId, "foreshadow"),
            orderedIds: refs(operation.orderedIds, "beat")
          };
      }
    })
  };
}

export function nextContentRevision(
  currentRevision: string,
  content: string
): string {
  if (!/^(?:v1|v2):\d+:[0-9a-f]+$/u.test(currentRevision)) {
    throw new Error("The current long document has an invalid revision.");
  }
  return `v2:${new TextEncoder().encode(content).byteLength}:${stableHash(
    content
  )}`;
}

export function resolveDocumentUpdateTarget(
  update: LongDocumentUpdateParameter,
  index: LongWorkspaceIndexSnapshot,
  clientReferences: ReadonlyMap<string, string>
): {
  root: LongWorkspaceRoot;
  file: LongWorkspaceFileReference;
} {
  if (update.target.kind === "book_line") {
    return { root: "plot_design", file: index.bookLine };
  }
  if (update.target.kind === "worldbuilding") {
    const categoryId = resolveEntityReference(
      update.target.categoryId,
      "world",
      clientReferences
    );
    const category = index.worldbuilding.find(({ id }) => id === categoryId);
    if (!category) {
      throw new Error(
        "New worldbuilding documents remain empty until the proposal is applied; update them in a later run."
      );
    }
    if (category.format === "text") {
      if (update.target.itemId !== undefined) {
        throw new Error("Text worldbuilding categories do not have items.");
      }
      return { root: "worldbuilding", file: category.file };
    }
    if (!update.target.itemId) {
      if (!category.overview) {
        throw new Error("Worldbuilding overview does not exist.");
      }
      return { root: "worldbuilding", file: category.overview };
    }
    const itemId = resolveEntityReference(
      update.target.itemId,
      "worlditem",
      clientReferences
    );
    const item = category.items.find(({ id }) => id === itemId);
    if (!item) {
      throw new Error("Worldbuilding item does not exist.");
    }
    return { root: "worldbuilding", file: item.file };
  }
  if (update.target.kind !== "character") {
    throw new Error(
      "Draft and ledger documents are not valid generic mutation targets."
    );
  }
  const characterId = resolveEntityReference(
    update.target.characterId,
    "character",
    clientReferences
  );
  const files = index.characterFiles.find(
    (entry) => entry.characterId === characterId
  );
  if (!files) {
    throw new Error(
      "New character documents remain empty until the proposal is applied; update them in a later run."
    );
  }
  const roles = {
    core_profile: files.coreProfile,
    relationships: files.relationships,
    current_state: files.currentState,
    history: files.history
  } as const;
  return {
    root: "character_design",
    file: roles[update.target.role]
  };
}

export function buildRuntimeDocumentWrites(input: {
  updates: readonly LongDocumentUpdateParameter[];
  index: LongWorkspaceIndexSnapshot;
  clientReferences: ReadonlyMap<string, string>;
  writableRoots: ReadonlySet<LongWorkspaceRoot>;
  liveRevisions: ReadonlyMap<string, string>;
  timestamp: string;
  idSeed: string;
}): LongWorkspaceOperationBatch["documentWrites"] {
  const seenFileIds = new Set<string>();
  return input.updates.map((update, updateIndex) => {
    const target = resolveDocumentUpdateTarget(
      update,
      input.index,
      input.clientReferences
    );
    if (
      target.root === "draft" ||
      !input.writableRoots.has(target.root)
    ) {
      throw new Error(
        "Document update proposal is outside the agent's write roots."
      );
    }
    if (seenFileIds.has(target.file.id)) {
      throw new Error(
        `A mutation proposal may update ${target.file.id} only once.`
      );
    }
    seenFileIds.add(target.file.id);
    const expectedRevision =
      input.liveRevisions.get(target.file.id) ?? target.file.revision;
    return {
      proposalId: `proposal_${stableHash(
        `${input.idSeed}:document:${updateIndex}`
      ).slice(0, 24)}`,
      fileId: target.file.id,
      content: update.content,
      mode: "replace" as const,
      expectedRevision,
      nextRevision: nextContentRevision(
        expectedRevision,
        update.content
      ),
      updatedAt: input.timestamp,
      reason: update.reason.trim()
    };
  });
}

export function projectIndex(
  index: LongWorkspaceIndexSnapshot,
  projectRevision: number,
  allowedRoots: ReadonlySet<LongWorkspaceRoot>
): Record<string, unknown> {
  const roots: Partial<Record<LongWorkspaceRoot, unknown>> = {};
  if (allowedRoots.has("worldbuilding")) {
    roots.worldbuilding = { categories: index.worldbuilding };
  }
  if (allowedRoots.has("character_design")) {
    roots.character_design = {
      characters: index.characters,
      files: index.characterFiles
    };
  }
  if (allowedRoots.has("plot_design")) {
    roots.plot_design = {
      bookLine: index.bookLine,
      plot: index.plot
    };
  }
  if (allowedRoots.has("draft")) {
    roots.draft = {
      chapterCards: index.plot.chapterCards,
      chapters: index.chapters
    };
  }
  if (allowedRoots.has("continuity_ledger")) {
    roots.continuity_ledger = { ledger: index.ledger };
  }
  return {
    bookId: index.bookId,
    workspaceRevision: index.revision,
    projectRevision,
    updatedAt: index.updatedAt,
    roots
  };
}
