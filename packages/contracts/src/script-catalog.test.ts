import { describe, expect, it } from "vitest";
import {
  BookSchema,
  CatalogCommandEnvelopeSchema,
  CatalogCreateScriptBookAtPathCommandEnvelopeSchema,
  CatalogCreateScriptBookCommandEnvelopeSchema,
  CatalogSnapshotSchema,
  CommandEnvelopeSchema,
  CreateLibraryAtPathInputSchema,
  CreateLibraryInputSchema,
  CreateScriptBookAtPathInputSchema,
  CreateScriptBookInputSchema,
  CurrentBookProjectManifestSchema,
  SCRIPT_BOOK_GENRES,
  ScriptBookSchema,
  ScriptBookProjectManifestSchema,
  createDefaultCreativePlotStages,
  createCatalogDraftDirectory,
  createDefaultScriptDraft,
  createEnvelope,
  createScriptCatalogDraftDirectory
} from "./index";

const timestamp = "2026-07-26T00:00:00.000Z";
const linkedMaterialIdsByKind = {
  character: [],
  gimmick: [],
  plot: [],
  draft: [],
  other: []
};
const linkedSkillIdsByKind = {
  general: [],
  plot: [],
  style: [],
  other: []
};

function scriptBook() {
  return {
    id: "script_1",
    title: "测试剧本",
    bookType: "script" as const,
    genre: "悬疑" as const,
    status: "editing" as const,
    linkedMaterialIdsByKind,
    linkedSkillIdsByKind,
    documents: [],
    draft: createScriptCatalogDraftDirectory(timestamp),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function shortBook() {
  return {
    id: "short_1",
    title: "测试短篇",
    bookType: "short" as const,
    genre: "悬疑" as const,
    status: "editing" as const,
    linkedMaterialIdsByKind,
    linkedSkillIdsByKind,
    documents: [],
    draft: createCatalogDraftDirectory(timestamp),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function scriptManifest() {
  const plotStages = createDefaultCreativePlotStages();
  return {
    schemaVersion: 4 as const,
    revision: 0,
    kind: "deepwrite.book" as const,
    id: "script_1",
    title: "测试剧本",
    createdAt: timestamp,
    updatedAt: timestamp,
    bookType: "script" as const,
    genre: "悬疑" as const,
    status: "editing" as const,
    linkedMaterialIdsByKind,
    linkedSkillIdsByKind,
    characterStructure: { format: "text" as const },
    plotStages,
    documents: [
      {
        id: "character_design",
        title: "人物设计",
        path: "documents/character_design.md",
        createdAt: timestamp,
        updatedAt: timestamp
      },
      ...plotStages.map((stage) => ({
        id: stage.id,
        title: stage.title,
        path: `documents/${stage.id}.md`,
        createdAt: timestamp,
        updatedAt: timestamp
      }))
    ],
    draft: {
      id: "draft" as const,
      title: "正文",
      sections: [
        {
            id: "episode-1",
          title: "第一集",
          wordCountRequirement: "",
          body: {
              id: "draft-section:episode-1:body",
            title: "第一集",
              path: "draft/episode-1.md",
            createdAt: timestamp,
            updatedAt: timestamp
          },
          characterState: {
              id: "draft-section:episode-1:character-state",
            title: "第一集 · 人物状态",
              path: "draft/episode-1-character-state.md",
            createdAt: timestamp,
            updatedAt: timestamp
          },
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ],
      createdAt: timestamp,
      updatedAt: timestamp
    }
  };
}

describe("script catalog contracts", () => {
  it("creates one empty first episode without an intro", () => {
    expect(createDefaultScriptDraft()).toEqual({
      sections: [
        {
          id: "episode-1",
          title: "第一集",
          wordCountRequirement: "",
          body: "",
          characterState: ""
        }
      ]
    });
    const directory = createScriptCatalogDraftDirectory(timestamp);
    expect(directory.title).toBe("剧集");
    expect(directory.sections).toHaveLength(1);
    expect(directory.sections[0]?.title).toBe("第一集");
    expect(directory.sections.some(({ id }) => id === "intro")).toBe(false);
  });

  it("keeps script genres and book schemas independently addressable", () => {
    expect(SCRIPT_BOOK_GENRES).toEqual(["世情", "追妻", "科幻", "悬疑", "其他"]);
    expect(ScriptBookSchema.parse(scriptBook()).bookType).toBe("script");
    expect(BookSchema.parse(scriptBook()).bookType).toBe("script");
    expect(BookSchema.parse(shortBook()).bookType).toBe("short");
    expect(() =>
      BookSchema.parse({ ...scriptBook(), bookType: "long" })
    ).toThrow();
  });

  it("allows mixed short and script books in the catalog snapshot", () => {
    const snapshot = CatalogSnapshotSchema.parse({
      schemaVersion: 1,
      revision: 1,
      books: [shortBook(), scriptBook()],
      materials: [],
      materialGroups: [],
      skills: [],
      skillGroups: [],
      updatedAt: timestamp
    });
    expect(snapshot.books.map(({ bookType }) => bookType)).toEqual([
      "short",
      "script"
    ]);
  });

  it("parses a current script project manifest through the book discriminator", () => {
    expect(ScriptBookProjectManifestSchema.parse(scriptManifest()).bookType).toBe(
      "script"
    );
    expect(CurrentBookProjectManifestSchema.parse(scriptManifest()).bookType).toBe(
      "script"
    );
  });

  it("accepts create-script inputs and command envelopes", () => {
    const input = CreateScriptBookInputSchema.parse({
      title: "测试剧本",
      genre: "悬疑"
    });
    const atPath = CreateScriptBookAtPathInputSchema.parse({
      parentDirectory: "/tmp/scripts",
      input
    });
    expect(atPath.input.title).toBe("测试剧本");

    const create = createEnvelope("catalog.createScriptBook", input, {
      id: "create_script"
    });
    const createAtPath = createEnvelope(
      "catalog.createScriptBookAtPath",
      atPath,
      { id: "create_script_at_path" }
    );
    expect(
      CatalogCreateScriptBookCommandEnvelopeSchema.parse(create).type
    ).toBe("catalog.createScriptBook");
    expect(
      CatalogCreateScriptBookAtPathCommandEnvelopeSchema.parse(createAtPath).type
    ).toBe("catalog.createScriptBookAtPath");
    expect(CatalogCommandEnvelopeSchema.parse(create).type).toBe(
      "catalog.createScriptBook"
    );
    expect(CatalogCommandEnvelopeSchema.parse(createAtPath).type).toBe(
      "catalog.createScriptBookAtPath"
    );
    expect(CommandEnvelopeSchema.parse(create).type).toBe(
      "catalog.createScriptBook"
    );
    expect(CommandEnvelopeSchema.parse(createAtPath).type).toBe(
      "catalog.createScriptBookAtPath"
    );
  });

  it("keeps library type optional and short-compatible while accepting script", () => {
    const legacyCompatible = CreateLibraryInputSchema.parse({
      domain: "material",
      name: "人物库",
      materialKind: "character"
    });
    expect(legacyCompatible.libraryType ?? "short").toBe("short");
    expect(
      CreateLibraryInputSchema.parse({
        domain: "skill",
        name: "剧本风格库",
        skillKind: "style",
        libraryType: "script"
      }).libraryType
    ).toBe("script");
    expect(
      CreateLibraryAtPathInputSchema.parse({
        domain: "material",
        name: "剧本人物库",
        materialKind: "character",
        libraryType: "script",
        parentDirectory: "/tmp/libraries"
      }).libraryType
    ).toBe("script");
  });
});
