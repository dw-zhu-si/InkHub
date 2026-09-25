import { Type, type TSchema } from "typebox";
import {
  LONG_WORKSPACE_ROOTS,
  type LongWorkspaceRoot
} from "@deepwrite/contracts";
import { literalUnion } from "./shared";

export const ALL_ROOTS = new Set<LongWorkspaceRoot>(LONG_WORKSPACE_ROOTS);
export const STABLE_ID_SUFFIX_PATTERN =
  "[A-Za-z0-9](?:[A-Za-z0-9._:-]*[A-Za-z0-9])?";
export const CLIENT_REFERENCE_PATTERN =
  "ref:[A-Za-z0-9](?:[A-Za-z0-9._:-]*[A-Za-z0-9])?";

export function strictObject<T extends Record<string, TSchema>>(
  properties: T,
  options: Record<string, unknown> = {}
) {
  return Type.Object(properties, {
    additionalProperties: false,
    ...options
  });
}

export function providerObjectUnion<T extends TSchema[]>(schemas: [...T]) {
  // OpenAI-compatible providers require every function parameter schema to
  // declare an object at the root, even when the valid shapes are expressed
  // as a discriminated union.
  return {
    ...Type.Union(schemas),
    type: "object" as const
  };
}

export function stableIdParameter(prefix: string) {
  return Type.String({
    minLength: 3,
    maxLength: 160,
    pattern: `^${prefix}_${STABLE_ID_SUFFIX_PATTERN}$`
  });
}

export function entityReferenceParameter(prefix: string, description?: string) {
  return Type.Union(
    [
      stableIdParameter(prefix),
      Type.String({
        minLength: 5,
        maxLength: 84,
        pattern: `^${CLIENT_REFERENCE_PATTERN}$`
      })
    ],
    description ? { description } : {}
  );
}

export const clientReferenceParameter = Type.Optional(
  Type.String({
    minLength: 1,
    maxLength: 80,
    pattern: "^[A-Za-z0-9](?:[A-Za-z0-9._:-]*[A-Za-z0-9])?$"
  })
);
export const titleParameter = Type.String({ minLength: 1, maxLength: 256 });
export const worldbuildingCategoryIdParameter = stableIdParameter("world");
export const worldbuildingItemIdParameter = stableIdParameter("worlditem");
export const worldbuildingReadModeParameter = literalUnion([
  "preview",
  "full"
] as const);
export const plotItemKindParameter = literalUnion([
  "book_line",
  "volume",
  "arc",
  "story_plot",
  "chapter",
  "event",
  "connection",
  "placement"
] as const);
export const textParameter = Type.String({ maxLength: 200_000 });
export const shortTextParameter = Type.String({ maxLength: 4_000 });
export const aliasesParameter = Type.Array(
  Type.String({ minLength: 1, maxLength: 120 }),
  { maxItems: 64, uniqueItems: true }
);
export const characterTypeIdParameter = Type.Union([
  literalUnion([
    "protagonist",
    "major_supporting",
    "minor_supporting",
    "passerby"
  ] as const),
  stableIdParameter("chartype")
]);
export const characterDocumentParameter = literalUnion([
  "core_profile",
  "relationships",
  "current_state",
  "history"
] as const);
export const continuityFileTargetParameter = Type.Union([
  strictObject({
    document: literalUnion([
      "foreshadowing_changes",
      "world_reveals",
      "chapter_end_state",
      "handoff"
    ] as const)
  }),
  strictObject({
    document: literalUnion([
      "character_current_state",
      "character_history"
    ] as const),
    character_id: stableIdParameter("character")
  })
]);
export const continuityCreateTargetParameter = Type.Union([
  strictObject({ document: Type.Literal("world_reveals") }),
  strictObject({
    document: Type.Literal("character"),
    character_id: stableIdParameter("character")
  })
]);
export const storyTimeModeParameter = literalUnion([
  "exact",
  "relative",
  "sequence",
  "unknown"
] as const);
export const connectionTypeParameter = literalUnion([
  "before",
  "same_time",
  "overlaps",
  "causes",
  "enables",
  "conceals"
] as const);
export const narrativeModeParameter = literalUnion([
  "scene",
  "flashback",
  "retelling",
  "clue",
  "misdirection",
  "reveal",
  "dream",
  "prophecy"
] as const);
export const disclosureParameter = literalUnion([
  "hint",
  "partial",
  "full",
  "false"
] as const);
export const beatTypeParameter = literalUnion([
  "source",
  "plant",
  "reinforce",
  "misdirect",
  "partial_reveal",
  "reveal",
  "payoff",
  "aftermath"
] as const);
export const foreshadowingSpanParameter = Type.Union(
  [
    Type.Literal("local"),
    Type.Literal("within_volume"),
    Type.Literal("cross_volume")
  ],
  {
    description:
      "伏笔计划跨度：local 为局部剧情点，within_volume 为卷内，cross_volume 为跨卷。"
  }
);
export const foreshadowingHiddenTruthParameter = Type.String({
  maxLength: 200_000,
  description: "作者掌握但暂不向读者公开的伏笔真相。"
});
export function nullableEntityReferenceParameter(
  prefix: string,
  description: string
) {
  return Type.Union(
    [entityReferenceParameter(prefix), Type.Null()],
    { description }
  );
}

export function patchParameter<T extends Record<string, TSchema>>(
  properties: T
) {
  return strictObject(properties, { minProperties: 1 });
}

export const LONG_MUTATION_OPERATION_PARAMETER = Type.Union([
  strictObject({
    type: Type.Literal("worldbuilding.create"),
    client_ref: clientReferenceParameter,
    title: titleParameter,
    format: Type.Optional(literalUnion(["list", "text"] as const))
  }),
  strictObject({
    type: Type.Literal("worldbuilding.update"),
    id: entityReferenceParameter("world"),
    patch: patchParameter({
      title: Type.Optional(titleParameter),
      format: Type.Optional(literalUnion(["list", "text"] as const))
    })
  }),
  strictObject({
    type: Type.Literal("worldbuilding.delete"),
    id: entityReferenceParameter("world"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("worldbuilding.reorder"),
    orderedIds: Type.Array(entityReferenceParameter("world"), {
      maxItems: 400_000,
      uniqueItems: true
    })
  }),
  strictObject({
    type: Type.Literal("worldbuildingItem.create"),
    client_ref: clientReferenceParameter,
    categoryId: entityReferenceParameter("world"),
    title: titleParameter
  }),
  strictObject({
    type: Type.Literal("worldbuildingItem.update"),
    categoryId: entityReferenceParameter("world"),
    id: entityReferenceParameter("worlditem"),
    patch: patchParameter({
      title: Type.Optional(titleParameter)
    })
  }),
  strictObject({
    type: Type.Literal("worldbuildingItem.delete"),
    categoryId: entityReferenceParameter("world"),
    id: entityReferenceParameter("worlditem"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("worldbuildingItem.reorder"),
    categoryId: entityReferenceParameter("world"),
    orderedIds: Type.Array(entityReferenceParameter("worlditem"), {
      maxItems: 10_000,
      uniqueItems: true
    })
  }),

  strictObject({
    type: Type.Literal("character.create"),
    client_ref: clientReferenceParameter,
    name: titleParameter,
    type_id: characterTypeIdParameter,
    aliases: Type.Optional(aliasesParameter)
  }),
  strictObject({
    type: Type.Literal("character.update"),
    id: entityReferenceParameter("character"),
    patch: patchParameter({
      name: Type.Optional(titleParameter),
      aliases: Type.Optional(aliasesParameter)
    })
  }),
  strictObject({
    type: Type.Literal("character.delete"),
    id: entityReferenceParameter("character"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("character.move"),
    id: entityReferenceParameter("character"),
    to_type_id: characterTypeIdParameter,
    beforeCharacterId: Type.Optional(
      entityReferenceParameter("character")
    )
  }),
  strictObject({
    type: Type.Literal("character.reorder"),
    type_id: characterTypeIdParameter,
    orderedIds: Type.Array(entityReferenceParameter("character"), {
      maxItems: 400_000,
      uniqueItems: true
    })
  }),

  strictObject({
    type: Type.Literal("volume.create"),
    client_ref: clientReferenceParameter,
    title: titleParameter,
    summary: Type.Optional(textParameter)
  }),
  strictObject({
    type: Type.Literal("volume.update"),
    id: entityReferenceParameter("volume"),
    patch: patchParameter({
      title: Type.Optional(titleParameter),
      summary: Type.Optional(textParameter)
    })
  }),
  strictObject({
    type: Type.Literal("volume.delete"),
    id: entityReferenceParameter("volume"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("volume.reorder"),
    orderedIds: Type.Array(entityReferenceParameter("volume"), {
      maxItems: 400_000,
      uniqueItems: true
    })
  }),

  strictObject({
    type: Type.Literal("arc.create"),
    client_ref: clientReferenceParameter,
    volumeId: entityReferenceParameter("volume"),
    title: titleParameter,
    summary: Type.Optional(textParameter),
    outline: Type.Optional(textParameter)
  }),
  strictObject({
    type: Type.Literal("arc.update"),
    id: entityReferenceParameter("arc"),
    patch: patchParameter({
      title: Type.Optional(titleParameter),
      outline: Type.Optional(textParameter)
    })
  }),
  strictObject({
    type: Type.Literal("arc.delete"),
    id: entityReferenceParameter("arc"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("arc.move"),
    id: entityReferenceParameter("arc"),
    toVolumeId: entityReferenceParameter("volume"),
    beforeArcId: Type.Optional(entityReferenceParameter("arc"))
  }),
  strictObject({
    type: Type.Literal("arc.reorder"),
    volumeId: entityReferenceParameter("volume"),
    orderedIds: Type.Array(entityReferenceParameter("arc"), {
      maxItems: 400_000,
      uniqueItems: true
    })
  }),

  strictObject({
    type: Type.Literal("chapter.create"),
    client_ref: clientReferenceParameter,
    volumeId: entityReferenceParameter("volume"),
    primaryArcId: Type.Union([entityReferenceParameter("arc"), Type.Null()]),
    title: titleParameter
  }),
  strictObject({
    type: Type.Literal("chapter.update"),
    id: entityReferenceParameter("chapter"),
    patch: patchParameter({
      title: Type.Optional(titleParameter)
    })
  }),
  strictObject({
    type: Type.Literal("chapter.delete"),
    id: entityReferenceParameter("chapter"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("chapter.move"),
    id: entityReferenceParameter("chapter"),
    toVolumeId: entityReferenceParameter(
      "volume",
      "章卡移动后的目标分卷；toPrimaryArcId 非空时必须属于该分卷。"
    ),
    toPrimaryArcId: Type.Union([
      entityReferenceParameter(
        "arc",
        "章卡移动后绑定的剧情点；非空时必须属于 toVolumeId。"
      ),
      Type.Null()
    ]),
    beforeChapterCardId: Type.Optional(
      entityReferenceParameter("chapter")
    )
  }),
  strictObject({
    type: Type.Literal("chapter.reorder"),
    volumeId: entityReferenceParameter("volume"),
    orderedIds: Type.Array(entityReferenceParameter("chapter"), {
      maxItems: 400_000,
      uniqueItems: true
    })
  }),

  strictObject({
    type: Type.Literal("event.create"),
    client_ref: clientReferenceParameter,
    title: titleParameter,
    summary: Type.Optional(textParameter),
    timeMode: storyTimeModeParameter,
    timeLabel: Type.Optional(Type.String({ maxLength: 1_000 })),
    timeValue: Type.Optional(Type.String({ maxLength: 1_000 })),
    location: Type.Optional(Type.String({ maxLength: 1_000 })),
    arcIds: Type.Optional(
      Type.Array(entityReferenceParameter("arc"), {
        maxItems: 1_024,
        uniqueItems: true
      })
    ),
    characterIds: Type.Optional(
      Type.Array(entityReferenceParameter("character"), {
        maxItems: 1_024,
        uniqueItems: true
      })
    )
  }),
  strictObject({
    type: Type.Literal("event.update"),
    id: entityReferenceParameter("event"),
    patch: patchParameter({
      title: Type.Optional(titleParameter),
      summary: Type.Optional(textParameter),
      timeMode: Type.Optional(storyTimeModeParameter),
      timeLabel: Type.Optional(Type.String({ maxLength: 1_000 })),
      timeValue: Type.Optional(Type.String({ maxLength: 1_000 })),
      location: Type.Optional(Type.String({ maxLength: 1_000 })),
      arcIds: Type.Optional(
        Type.Array(entityReferenceParameter("arc"), {
          maxItems: 1_024,
          uniqueItems: true
        })
      ),
      characterIds: Type.Optional(
        Type.Array(entityReferenceParameter("character"), {
          maxItems: 1_024,
          uniqueItems: true
        })
      )
    })
  }),
  strictObject({
    type: Type.Literal("event.delete"),
    id: entityReferenceParameter("event"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("event.reorder"),
    orderedIds: Type.Array(entityReferenceParameter("event"), {
      maxItems: 400_000,
      uniqueItems: true
    })
  }),

  strictObject({
    type: Type.Literal("storyPlot.create"),
    client_ref: clientReferenceParameter,
    arcId: entityReferenceParameter("arc"),
    title: titleParameter
  }),
  strictObject({
    type: Type.Literal("storyPlot.update"),
    id: entityReferenceParameter("storyplot"),
    patch: patchParameter({
      title: Type.Optional(titleParameter)
    })
  }),
  strictObject({
    type: Type.Literal("storyPlot.delete"),
    id: entityReferenceParameter("storyplot"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("storyPlot.reorder"),
    arcId: entityReferenceParameter("arc"),
    orderedIds: Type.Array(entityReferenceParameter("storyplot"), {
      maxItems: 100_000,
      uniqueItems: true
    })
  }),

  strictObject({
    type: Type.Literal("connection.create"),
    client_ref: clientReferenceParameter,
    sourceEventId: entityReferenceParameter("event"),
    targetEventId: entityReferenceParameter("event"),
    connectionType: connectionTypeParameter,
    note: Type.Optional(shortTextParameter)
  }),
  strictObject({
    type: Type.Literal("connection.update"),
    id: entityReferenceParameter("connection"),
    patch: patchParameter({
      sourceEventId: Type.Optional(entityReferenceParameter("event")),
      targetEventId: Type.Optional(entityReferenceParameter("event")),
      connectionType: Type.Optional(connectionTypeParameter),
      note: Type.Optional(shortTextParameter)
    })
  }),
  strictObject({
    type: Type.Literal("connection.delete"),
    id: entityReferenceParameter("connection"),
    cascade: Type.Boolean()
  }),

  strictObject({
    type: Type.Literal("placement.create"),
    client_ref: clientReferenceParameter,
    eventId: entityReferenceParameter("event"),
    chapterCardId: entityReferenceParameter("chapter"),
    mode: narrativeModeParameter,
    disclosure: disclosureParameter,
    writingPrompt: Type.Optional(shortTextParameter)
  }),
  strictObject({
    type: Type.Literal("placement.update"),
    id: entityReferenceParameter("placement"),
    patch: patchParameter({
      eventId: Type.Optional(entityReferenceParameter("event")),
      mode: Type.Optional(narrativeModeParameter),
      disclosure: Type.Optional(disclosureParameter),
      writingPrompt: Type.Optional(shortTextParameter)
    })
  }),
  strictObject({
    type: Type.Literal("placement.delete"),
    id: entityReferenceParameter("placement"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("placement.move"),
    id: entityReferenceParameter("placement"),
    toChapterCardId: entityReferenceParameter("chapter"),
    beforePlacementId: Type.Optional(
      entityReferenceParameter("placement")
    )
  }),
  strictObject({
    type: Type.Literal("placement.reorder"),
    chapterCardId: entityReferenceParameter("chapter"),
    orderedIds: Type.Array(entityReferenceParameter("placement"), {
      maxItems: 400_000,
      uniqueItems: true
    })
  }),

  strictObject({
    type: Type.Literal("foreshadowing.create"),
    client_ref: clientReferenceParameter,
    title: titleParameter,
    coreQuestion: Type.Optional(textParameter),
    hiddenTruth: Type.Optional(foreshadowingHiddenTruthParameter),
    plannedSpan: Type.Optional(foreshadowingSpanParameter),
    truthEventId: Type.Optional(
      Type.Union([entityReferenceParameter("event"), Type.Null()])
    ),
    expectedReaderEffect: Type.Optional(textParameter),
    status: Type.Optional(Type.Literal("planned"))
  }),
  strictObject({
    type: Type.Literal("foreshadowing.update"),
    id: entityReferenceParameter("foreshadow"),
    patch: patchParameter({
      title: Type.Optional(titleParameter),
      coreQuestion: Type.Optional(textParameter),
      hiddenTruth: Type.Optional(foreshadowingHiddenTruthParameter),
      plannedSpan: Type.Optional(foreshadowingSpanParameter),
      truthEventId: Type.Optional(
        Type.Union([entityReferenceParameter("event"), Type.Null()])
      ),
      expectedReaderEffect: Type.Optional(textParameter),
      status: Type.Optional(literalUnion(["planned", "abandoned"] as const))
    })
  }),
  strictObject({
    type: Type.Literal("foreshadowing.delete"),
    id: entityReferenceParameter("foreshadow"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("foreshadowing.reorder"),
    orderedIds: Type.Array(entityReferenceParameter("foreshadow"), {
      maxItems: 400_000,
      uniqueItems: true
    })
  }),

  strictObject({
    type: Type.Literal("foreshadowingBeat.create"),
    client_ref: clientReferenceParameter,
    threadId: entityReferenceParameter("foreshadow"),
    beatType: beatTypeParameter,
    volumeId: Type.Optional(
      nullableEntityReferenceParameter(
        "volume",
        "卷级计划锚点；触点尚未细化到剧情点时使用，传 null 可清空。"
      )
    ),
    arcId: Type.Optional(
      nullableEntityReferenceParameter(
        "arc",
        "剧情点计划锚点（内部 LongArc）；传 null 可清空。"
      )
    ),
    eventId: Type.Optional(
      Type.Union([entityReferenceParameter("event"), Type.Null()])
    ),
    placementId: Type.Optional(
      Type.Union([entityReferenceParameter("placement"), Type.Null()])
    ),
    chapterCardId: Type.Optional(
      Type.Union([entityReferenceParameter("chapter"), Type.Null()])
    ),
    plannedScope: Type.Optional(Type.String({ maxLength: 1_000 })),
    note: Type.Optional(shortTextParameter)
  }),
  strictObject({
    type: Type.Literal("foreshadowingBeat.update"),
    id: entityReferenceParameter("beat"),
    patch: patchParameter({
      beatType: Type.Optional(beatTypeParameter),
      volumeId: Type.Optional(
        nullableEntityReferenceParameter(
          "volume",
          "更新卷级计划锚点；传 null 可清空。"
        )
      ),
      arcId: Type.Optional(
        nullableEntityReferenceParameter(
          "arc",
          "更新剧情点计划锚点（内部 LongArc）；传 null 可清空。"
        )
      ),
      eventId: Type.Optional(
        Type.Union([entityReferenceParameter("event"), Type.Null()])
      ),
      placementId: Type.Optional(
        Type.Union([entityReferenceParameter("placement"), Type.Null()])
      ),
      chapterCardId: Type.Optional(
        Type.Union([entityReferenceParameter("chapter"), Type.Null()])
      ),
      plannedScope: Type.Optional(Type.String({ maxLength: 1_000 })),
      note: Type.Optional(shortTextParameter)
    })
  }),
  strictObject({
    type: Type.Literal("foreshadowingBeat.delete"),
    id: entityReferenceParameter("beat"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("foreshadowingBeat.move"),
    id: entityReferenceParameter("beat"),
    toThreadId: entityReferenceParameter("foreshadow"),
    beforeBeatId: Type.Optional(entityReferenceParameter("beat"))
  }),
  strictObject({
    type: Type.Literal("foreshadowingBeat.reorder"),
    threadId: entityReferenceParameter("foreshadow"),
    orderedIds: Type.Array(entityReferenceParameter("beat"), {
      maxItems: 400_000,
      uniqueItems: true
    })
  })
]);

export const LONG_DOCUMENT_UPDATE_PARAMETER = Type.Union([
  strictObject({
    target: strictObject({ kind: Type.Literal("book_line") }),
    content: Type.String({ maxLength: 10_000_000 }),
    reason: Type.String({ minLength: 1, maxLength: 1_000 })
  }),
  strictObject({
    target: strictObject({
      kind: Type.Literal("worldbuilding"),
      categoryId: entityReferenceParameter("world"),
      itemId: Type.Optional(entityReferenceParameter("worlditem"))
    }),
    content: Type.String({ maxLength: 10_000_000 }),
    reason: Type.String({ minLength: 1, maxLength: 1_000 })
  }),
  strictObject({
    target: strictObject({
      kind: Type.Literal("character"),
      characterId: entityReferenceParameter("character"),
      role: literalUnion([
        "core_profile",
        "relationships",
        "current_state",
        "history"
      ] as const)
    }),
    content: Type.String({ maxLength: 10_000_000 }),
    reason: Type.String({ minLength: 1, maxLength: 1_000 })
  })
]);

export const LONG_MUTATION_PARAMETERS = strictObject({
  operations: Type.Array(LONG_MUTATION_OPERATION_PARAMETER, {
    minItems: 1,
    maxItems: 10_000
  }),
  document_updates: Type.Optional(
    Type.Array(LONG_DOCUMENT_UPDATE_PARAMETER, { maxItems: 10_000 })
  ),
  summary: Type.String({ minLength: 1, maxLength: 1_000 })
});

export const LONG_WORLDBUILDING_STRUCTURE_OPERATION_PARAMETER = Type.Union([
  strictObject({
    type: Type.Literal("worldbuilding.create"),
    client_ref: clientReferenceParameter,
    title: titleParameter,
    format: Type.Optional(literalUnion(["list", "text"] as const))
  }),
  strictObject({
    type: Type.Literal("worldbuilding.update"),
    id: entityReferenceParameter("world"),
    patch: patchParameter({
      title: Type.Optional(titleParameter),
      format: Type.Optional(literalUnion(["list", "text"] as const))
    })
  }),
  strictObject({
    type: Type.Literal("worldbuilding.delete"),
    id: entityReferenceParameter("world"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("worldbuilding.reorder"),
    orderedIds: Type.Array(entityReferenceParameter("world"), {
      maxItems: 400_000,
      uniqueItems: true
    })
  }),
  strictObject({
    type: Type.Literal("worldbuildingItem.update"),
    categoryId: entityReferenceParameter("world"),
    id: entityReferenceParameter("worlditem"),
    patch: patchParameter({
      title: Type.Optional(titleParameter)
    })
  }),
  strictObject({
    type: Type.Literal("worldbuildingItem.delete"),
    categoryId: entityReferenceParameter("world"),
    id: entityReferenceParameter("worlditem"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("worldbuildingItem.reorder"),
    categoryId: entityReferenceParameter("world"),
    orderedIds: Type.Array(entityReferenceParameter("worlditem"), {
      maxItems: 10_000,
      uniqueItems: true
    })
  })
]);

export const LONG_WORLDBUILDING_MUTATION_PARAMETERS = strictObject({
  operations: Type.Array(
    LONG_WORLDBUILDING_STRUCTURE_OPERATION_PARAMETER,
    {
      minItems: 1,
      maxItems: 10_000
    }
  ),
  summary: Type.String({ minLength: 1, maxLength: 1_000 })
});

export const LONG_CHARACTER_STRUCTURE_OPERATION_PARAMETER = Type.Union([
  strictObject({
    type: Type.Literal("character.update"),
    id: entityReferenceParameter("character"),
    patch: patchParameter({
      name: Type.Optional(titleParameter),
      aliases: Type.Optional(aliasesParameter)
    })
  }),
  strictObject({
    type: Type.Literal("character.delete"),
    id: entityReferenceParameter("character"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("character.move"),
    id: entityReferenceParameter("character"),
    to_type_id: characterTypeIdParameter,
    beforeCharacterId: Type.Optional(
      entityReferenceParameter("character")
    )
  }),
  strictObject({
    type: Type.Literal("character.reorder"),
    type_id: characterTypeIdParameter,
    orderedIds: Type.Array(entityReferenceParameter("character"), {
      maxItems: 100_000,
      uniqueItems: true
    })
  })
]);

export const LONG_CHARACTER_MUTATION_PARAMETERS = strictObject({
  operations: Type.Array(LONG_CHARACTER_STRUCTURE_OPERATION_PARAMETER, {
    minItems: 1,
    maxItems: 10_000
  }),
  summary: Type.String({ minLength: 1, maxLength: 1_000 })
});

export const LONG_SETTING_STRUCTURE_OPERATION_PARAMETER = Type.Union([
  LONG_WORLDBUILDING_STRUCTURE_OPERATION_PARAMETER,
  LONG_CHARACTER_STRUCTURE_OPERATION_PARAMETER
]);

export const LONG_SETTING_MUTATION_PARAMETERS = strictObject({
  operations: Type.Array(LONG_SETTING_STRUCTURE_OPERATION_PARAMETER, {
    minItems: 1,
    maxItems: 10_000
  }),
  summary: Type.String({ minLength: 1, maxLength: 1_000 })
});

export const settingCharacterDocumentParameter = literalUnion([
  "overview",
  "core_profile",
  "relationships",
  "current_state",
  "history"
] as const);

export const LONG_PLOT_STRUCTURE_OPERATION_PARAMETER = Type.Union([
  strictObject({
    type: Type.Literal("volume.update"),
    id: entityReferenceParameter("volume"),
    patch: patchParameter({ title: Type.Optional(titleParameter) })
  }),
  strictObject({
    type: Type.Literal("volume.delete"),
    id: entityReferenceParameter("volume"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("volume.reorder"),
    orderedIds: Type.Array(entityReferenceParameter("volume"), {
      maxItems: 10_000,
      uniqueItems: true,
      description: "必须按最终顺序完整列出当前全部分卷 ID，不能遗漏或附加其它 ID。"
    })
  }),
  strictObject({
    type: Type.Literal("arc.update"),
    id: entityReferenceParameter("arc"),
    patch: patchParameter({ title: Type.Optional(titleParameter) })
  }),
  strictObject({
    type: Type.Literal("arc.delete"),
    id: entityReferenceParameter("arc"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("arc.move"),
    id: entityReferenceParameter("arc"),
    toVolumeId: entityReferenceParameter("volume"),
    beforeArcId: Type.Optional(
      entityReferenceParameter(
        "arc",
        "可选插入位置；必须是移动后目标分卷内的剧情点。"
      )
    )
  }),
  strictObject({
    type: Type.Literal("arc.reorder"),
    volumeId: entityReferenceParameter("volume"),
    orderedIds: Type.Array(entityReferenceParameter("arc"), {
      maxItems: 100_000,
      uniqueItems: true,
      description: "必须按最终顺序完整列出 volumeId 分卷内当前全部剧情点 ID。"
    })
  }),
  strictObject({
    type: Type.Literal("chapter.update"),
    id: entityReferenceParameter("chapter"),
    patch: patchParameter({ title: Type.Optional(titleParameter) })
  }),
  strictObject({
    type: Type.Literal("chapter.delete"),
    id: entityReferenceParameter("chapter"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("chapter.move"),
    id: entityReferenceParameter("chapter"),
    toVolumeId: entityReferenceParameter(
      "volume",
      "章卡移动后的目标分卷；toPrimaryArcId 非空时必须属于该分卷。"
    ),
    toPrimaryArcId: Type.Union([
      entityReferenceParameter(
        "arc",
        "章卡移动后关联的剧情点；非空时必须属于 toVolumeId。"
      ),
      Type.Null()
    ]),
    beforeChapterCardId: Type.Optional(
      entityReferenceParameter(
        "chapter",
        "可选插入位置；必须是移动后目标分卷内且位于未提交后缀的章卡。"
      )
    )
  }),
  strictObject({
    type: Type.Literal("chapter.reorder"),
    volumeId: entityReferenceParameter("volume"),
    orderedIds: Type.Array(entityReferenceParameter("chapter"), {
      maxItems: 100_000,
      uniqueItems: true,
      description: "必须按最终顺序完整列出 volumeId 分卷内当前全部章卡 ID，并保持已提交前缀不变。"
    })
  }),
  strictObject({
    type: Type.Literal("event.update"),
    id: entityReferenceParameter("event"),
    patch: patchParameter({ title: Type.Optional(titleParameter) })
  }),
  strictObject({
    type: Type.Literal("event.delete"),
    id: entityReferenceParameter("event"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("event.reorder"),
    orderedIds: Type.Array(entityReferenceParameter("event"), {
      maxItems: 200_000,
      uniqueItems: true,
      description: "必须按最终故事发生顺序完整列出当前全部故事事件 ID；已进入提交事实的事件不能改变位置。"
    })
  }),
  strictObject({
    type: Type.Literal("storyPlot.update"),
    id: entityReferenceParameter("storyplot"),
    patch: patchParameter({ title: Type.Optional(titleParameter) })
  }),
  strictObject({
    type: Type.Literal("storyPlot.delete"),
    id: entityReferenceParameter("storyplot"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("storyPlot.reorder"),
    arcId: entityReferenceParameter("arc"),
    orderedIds: Type.Array(entityReferenceParameter("storyplot"), {
      maxItems: 100_000,
      uniqueItems: true,
      description: "必须按最终顺序完整列出 arcId 剧情点下当前全部故事情节 ID。"
    })
  }),
  strictObject({
    type: Type.Literal("connection.update"),
    id: entityReferenceParameter("connection"),
    patch: patchParameter({
      sourceEventId: Type.Optional(entityReferenceParameter("event")),
      targetEventId: Type.Optional(entityReferenceParameter("event")),
      connectionType: Type.Optional(connectionTypeParameter)
    })
  }),
  strictObject({
    type: Type.Literal("connection.delete"),
    id: entityReferenceParameter("connection"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("placement.update"),
    id: entityReferenceParameter("placement"),
    patch: patchParameter({
      eventId: Type.Optional(entityReferenceParameter("event")),
      mode: Type.Optional(narrativeModeParameter),
      disclosure: Type.Optional(disclosureParameter)
    })
  }),
  strictObject({
    type: Type.Literal("placement.delete"),
    id: entityReferenceParameter("placement"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("placement.move"),
    id: entityReferenceParameter("placement"),
    toChapterCardId: entityReferenceParameter("chapter"),
    beforePlacementId: Type.Optional(
      entityReferenceParameter(
        "placement",
        "可选插入位置；必须是目标章卡内的叙事落点。"
      )
    )
  }),
  strictObject({
    type: Type.Literal("placement.reorder"),
    chapterCardId: entityReferenceParameter("chapter"),
    orderedIds: Type.Array(entityReferenceParameter("placement"), {
      maxItems: 400_000,
      uniqueItems: true,
      description: "必须按最终顺序完整列出 chapterCardId 章卡内当前全部叙事落点 ID。"
    })
  }),
  strictObject({
    type: Type.Literal("foreshadowing.create"),
    client_ref: clientReferenceParameter,
    title: titleParameter,
    coreQuestion: Type.Optional(textParameter),
    hiddenTruth: Type.Optional(foreshadowingHiddenTruthParameter),
    plannedSpan: Type.Optional(foreshadowingSpanParameter),
    truthEventId: Type.Optional(
      Type.Union([entityReferenceParameter("event"), Type.Null()])
    ),
    expectedReaderEffect: Type.Optional(textParameter),
    status: Type.Optional(Type.Literal("planned"))
  }),
  strictObject({
    type: Type.Literal("foreshadowing.update"),
    id: entityReferenceParameter("foreshadow"),
    patch: patchParameter({
      title: Type.Optional(titleParameter),
      coreQuestion: Type.Optional(textParameter),
      hiddenTruth: Type.Optional(foreshadowingHiddenTruthParameter),
      plannedSpan: Type.Optional(foreshadowingSpanParameter),
      truthEventId: Type.Optional(
        Type.Union([entityReferenceParameter("event"), Type.Null()])
      ),
      expectedReaderEffect: Type.Optional(textParameter),
      status: Type.Optional(literalUnion(["planned", "abandoned"] as const))
    })
  }),
  strictObject({
    type: Type.Literal("foreshadowing.delete"),
    id: entityReferenceParameter("foreshadow"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("foreshadowing.reorder"),
    orderedIds: Type.Array(entityReferenceParameter("foreshadow"), {
      maxItems: 100_000,
      uniqueItems: true,
      description: "必须按最终顺序完整列出当前全部伏笔线 ID。"
    })
  }),
  strictObject({
    type: Type.Literal("foreshadowingBeat.create"),
    client_ref: clientReferenceParameter,
    threadId: entityReferenceParameter("foreshadow"),
    beatType: beatTypeParameter,
    volumeId: Type.Optional(nullableEntityReferenceParameter("volume", "卷级计划锚点；传 null 可清空。")),
    arcId: Type.Optional(nullableEntityReferenceParameter("arc", "剧情点计划锚点；传 null 可清空。")),
    eventId: Type.Optional(Type.Union([entityReferenceParameter("event"), Type.Null()])),
    placementId: Type.Optional(Type.Union([entityReferenceParameter("placement"), Type.Null()])),
    chapterCardId: Type.Optional(Type.Union([entityReferenceParameter("chapter"), Type.Null()])),
    plannedScope: Type.Optional(Type.String({ maxLength: 1_000 })),
    note: Type.Optional(shortTextParameter)
  }),
  strictObject({
    type: Type.Literal("foreshadowingBeat.update"),
    id: entityReferenceParameter("beat"),
    patch: patchParameter({
      beatType: Type.Optional(beatTypeParameter),
      volumeId: Type.Optional(nullableEntityReferenceParameter("volume", "更新卷级计划锚点；传 null 可清空。")),
      arcId: Type.Optional(nullableEntityReferenceParameter("arc", "更新剧情点计划锚点；传 null 可清空。")),
      eventId: Type.Optional(Type.Union([entityReferenceParameter("event"), Type.Null()])),
      placementId: Type.Optional(Type.Union([entityReferenceParameter("placement"), Type.Null()])),
      chapterCardId: Type.Optional(Type.Union([entityReferenceParameter("chapter"), Type.Null()])),
      plannedScope: Type.Optional(Type.String({ maxLength: 1_000 })),
      note: Type.Optional(shortTextParameter)
    })
  }),
  strictObject({
    type: Type.Literal("foreshadowingBeat.delete"),
    id: entityReferenceParameter("beat"),
    cascade: Type.Boolean()
  }),
  strictObject({
    type: Type.Literal("foreshadowingBeat.move"),
    id: entityReferenceParameter("beat"),
    toThreadId: entityReferenceParameter("foreshadow"),
    beforeBeatId: Type.Optional(
      entityReferenceParameter(
        "beat",
        "可选插入位置；必须是目标伏笔线内的触点。"
      )
    )
  }),
  strictObject({
    type: Type.Literal("foreshadowingBeat.reorder"),
    threadId: entityReferenceParameter("foreshadow"),
    orderedIds: Type.Array(entityReferenceParameter("beat"), {
      maxItems: 10_000,
      uniqueItems: true,
      description: "必须按最终顺序完整列出 threadId 伏笔线内当前全部触点 ID。"
    })
  })
]);

export const LONG_PLOT_MUTATION_PARAMETERS = strictObject({
  operations: Type.Array(LONG_PLOT_STRUCTURE_OPERATION_PARAMETER, {
    minItems: 1,
    maxItems: 10_000
  }),
  summary: Type.String({ minLength: 1, maxLength: 1_000 })
});

export const LONG_PLOT_CREATE_PARAMETERS = strictObject({
  item: Type.Union([
    strictObject({
      kind: Type.Literal("volume"),
      title: titleParameter,
      summary: Type.Optional(textParameter)
    }),
    strictObject({
      kind: Type.Literal("arc"),
      volume_id: entityReferenceParameter("volume"),
      title: titleParameter,
      summary: Type.Optional(textParameter),
      outline: Type.Optional(textParameter)
    }),
    strictObject({
      kind: Type.Literal("story_plot"),
      arc_id: entityReferenceParameter("arc"),
      title: titleParameter
    }),
    strictObject({
      kind: Type.Literal("chapter"),
      volume_id: entityReferenceParameter(
        "volume",
        "章卡所属分卷；primary_arc_id 非空时必须属于该分卷。"
      ),
      primary_arc_id: Type.Union([
        entityReferenceParameter(
          "arc",
          "章卡关联的剧情点；非空时必须属于 volume_id。"
        ),
        Type.Null()
      ]),
      title: titleParameter
    }),
    strictObject({
      kind: Type.Literal("event"),
      title: titleParameter,
      summary: Type.Optional(textParameter),
      time_mode: storyTimeModeParameter,
      time_label: Type.Optional(Type.String({ maxLength: 1_000 })),
      time_value: Type.Optional(Type.String({ maxLength: 1_000 })),
      location: Type.Optional(Type.String({ maxLength: 1_000 })),
      arc_ids: Type.Optional(
        Type.Array(entityReferenceParameter("arc"), {
          maxItems: 1_024,
          uniqueItems: true
        })
      ),
      character_ids: Type.Optional(
        Type.Array(entityReferenceParameter("character"), {
          maxItems: 1_024,
          uniqueItems: true
        })
      )
    }),
    strictObject({
      kind: Type.Literal("connection"),
      source_event_id: entityReferenceParameter("event"),
      target_event_id: entityReferenceParameter("event"),
      connection_type: connectionTypeParameter,
      note: Type.Optional(shortTextParameter)
    }),
    strictObject({
      kind: Type.Literal("placement"),
      event_id: entityReferenceParameter("event"),
      chapter_card_id: entityReferenceParameter("chapter"),
      mode: narrativeModeParameter,
      disclosure: disclosureParameter,
      writing_prompt: Type.Optional(shortTextParameter)
    }),
    strictObject({
      kind: Type.Literal("placements"),
      items: Type.Array(
        strictObject({
          event_id: entityReferenceParameter("event"),
          chapter_card_id: entityReferenceParameter("chapter"),
          mode: narrativeModeParameter,
          disclosure: disclosureParameter,
          writing_prompt: Type.Optional(shortTextParameter)
        }),
        { minItems: 1, maxItems: 50 }
      )
    })
  ]),
  summary: Type.Optional(Type.String({ minLength: 1, maxLength: 1_000 }))
});

export const LONG_PLOT_ITEM_TARGET_PARAMETER = Type.Union([
  strictObject({ kind: Type.Literal("book_line") }),
  strictObject({ kind: Type.Literal("volume"), volume_id: stableIdParameter("volume") }),
  strictObject({ kind: Type.Literal("arc"), arc_id: stableIdParameter("arc") }),
  strictObject({ kind: Type.Literal("story_plot"), story_plot_id: stableIdParameter("storyplot") }),
  strictObject({ kind: Type.Literal("chapter"), chapter_card_id: stableIdParameter("chapter") }),
  strictObject({ kind: Type.Literal("event"), event_id: stableIdParameter("event") }),
  strictObject({ kind: Type.Literal("connection"), connection_id: stableIdParameter("connection") }),
  strictObject({ kind: Type.Literal("placement"), placement_id: stableIdParameter("placement") })
]);

export const LONG_PLOT_WRITE_PARAMETERS = strictObject({
  item: Type.Union([
    strictObject({ kind: Type.Literal("book_line"), text: Type.String({ minLength: 1, maxLength: 1_000_000 }) }),
    strictObject({ kind: Type.Literal("volume"), volume_id: stableIdParameter("volume"), summary: textParameter }),
    strictObject({ kind: Type.Literal("arc"), arc_id: stableIdParameter("arc"), summary: textParameter, outline: textParameter }),
    strictObject({ kind: Type.Literal("story_plot"), story_plot_id: stableIdParameter("storyplot"), text: Type.String({ minLength: 1, maxLength: 1_000_000 }) }),
    strictObject({
      kind: Type.Literal("chapter"),
      chapter_card_id: stableIdParameter("chapter"),
      text: Type.String({ minLength: 1, maxLength: 1_000_000 })
    }),
    strictObject({
      kind: Type.Literal("event"),
      event_id: stableIdParameter("event"),
      summary: textParameter,
      time_mode: storyTimeModeParameter,
      time_label: Type.String({ maxLength: 1_000 }),
      time_value: Type.Optional(Type.String({ maxLength: 1_000 })),
      location: Type.String({ maxLength: 1_000 }),
      arc_ids: Type.Array(entityReferenceParameter("arc"), { maxItems: 1_024, uniqueItems: true }),
      character_ids: Type.Array(entityReferenceParameter("character"), { maxItems: 1_024, uniqueItems: true })
    }),
    strictObject({ kind: Type.Literal("connection"), connection_id: stableIdParameter("connection"), note: shortTextParameter }),
    strictObject({ kind: Type.Literal("placement"), placement_id: stableIdParameter("placement"), writing_prompt: shortTextParameter })
  ]),
  allow_overwrite_existing: Type.Optional(Type.Boolean()),
  summary: Type.Optional(Type.String({ minLength: 1, maxLength: 1_000 }))
});

export const LONG_PLOT_EDIT_PARAMETERS = strictObject({
  item: Type.Union([
    strictObject({
      kind: Type.Literal("book_line"),
      replacements: Type.Array(
        strictObject({
          original_text: Type.String({ minLength: 1, maxLength: 2_400 }),
          new_text: Type.String({ maxLength: 20_000 })
        }),
        { minItems: 1, maxItems: 20 }
      )
    }),
    strictObject({ kind: Type.Literal("volume"), volume_id: stableIdParameter("volume"), patch: patchParameter({ summary: Type.Optional(textParameter) }) }),
    strictObject({ kind: Type.Literal("arc"), arc_id: stableIdParameter("arc"), patch: patchParameter({ summary: Type.Optional(textParameter), outline: Type.Optional(textParameter) }) }),
    strictObject({
      kind: Type.Literal("story_plot"),
      story_plot_id: stableIdParameter("storyplot"),
      replacements: Type.Array(
        strictObject({
          original_text: Type.String({ minLength: 1, maxLength: 2_400 }),
          new_text: Type.String({ maxLength: 20_000 })
        }),
        { minItems: 1, maxItems: 20 }
      )
    }),
    strictObject({
      kind: Type.Literal("chapter"),
      chapter_card_id: stableIdParameter("chapter"),
      replacements: Type.Array(
        strictObject({
          original_text: Type.String({ minLength: 1, maxLength: 2_400 }),
          new_text: Type.String({ maxLength: 20_000 })
        }),
        { minItems: 1, maxItems: 20 }
      )
    }),
    strictObject({
      kind: Type.Literal("event"), event_id: stableIdParameter("event"),
      patch: patchParameter({
        summary: Type.Optional(textParameter),
        time_mode: Type.Optional(storyTimeModeParameter),
        time_label: Type.Optional(Type.String({ maxLength: 1_000 })),
        time_value: Type.Optional(Type.String({ maxLength: 1_000 })),
        location: Type.Optional(Type.String({ maxLength: 1_000 })),
        arc_ids: Type.Optional(Type.Array(entityReferenceParameter("arc"), { maxItems: 1_024, uniqueItems: true })),
        character_ids: Type.Optional(Type.Array(entityReferenceParameter("character"), { maxItems: 1_024, uniqueItems: true }))
      })
    }),
    strictObject({ kind: Type.Literal("connection"), connection_id: stableIdParameter("connection"), patch: patchParameter({ note: Type.Optional(shortTextParameter) }) }),
    strictObject({ kind: Type.Literal("placement"), placement_id: stableIdParameter("placement"), patch: patchParameter({ writing_prompt: Type.Optional(shortTextParameter) }) })
  ]),
  summary: Type.Optional(Type.String({ minLength: 1, maxLength: 1_000 }))
});
