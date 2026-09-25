import {
  LONG_CHARACTER_CORE_FOCUS_MAX_CHARACTERS,
  LONG_CHARACTER_FOCUS_MAX_CHARACTERS,
  LONG_CHARACTER_OVERVIEW_FOCUS_MAX_CHARACTERS,
  type LongBookId,
  type LongCharacterFocusSnapshot,
  type LongFileId,
  type LongReadDocumentInput,
  type LongReadDocumentResult,
  type LongWorkspaceFileReference
} from "@deepwrite/contracts";
import type {
  LongWorkspaceFileRole,
  LongWorkspaceSelection
} from "../types/longWorkspace";

type ReadLongDocument = (
  input: LongReadDocumentInput
) => Promise<LongReadDocumentResult>;

const CHARACTER_DOCUMENTS: Partial<
  Record<
    LongWorkspaceFileRole,
    {
      kind: Exclude<
        LongCharacterFocusSnapshot["currentDocument"]["kind"],
        "overview"
      >;
      title: string;
    }
  >
> = {
  "core-profile": { kind: "core_profile", title: "核心档案" },
  relationships: { kind: "relationships", title: "人物关系" },
  "current-state": { kind: "current_state", title: "当前状态" },
  history: { kind: "history", title: "历史轨迹" }
};

function snapshotText(
  page: LongReadDocumentResult,
  maximum: number
): LongCharacterFocusSnapshot["currentDocument"]["text"] {
  const characters = Array.from(page.content).slice(0, maximum);
  const content = characters.join("");
  return page.totalCharacters > characters.length
    ? { content, truncated: true, originalLength: page.totalCharacters }
    : { content };
}

async function readFocusText(
  readDocument: ReadLongDocument,
  bookId: LongBookId,
  fileId: LongFileId,
  maximum: number
): Promise<LongCharacterFocusSnapshot["currentDocument"]["text"]> {
  const page = await readDocument({
    bookId,
    fileId,
    offset: 0,
    maxCharacters: maximum
  });
  if (
    page.bookId !== bookId ||
    page.file.id !== fileId ||
    page.offset !== 0
  ) {
    throw new Error("长篇人物阶段读取结果与当前选择不一致。");
  }
  return snapshotText(page, maximum);
}

export async function buildLongCharacterFocusSnapshot(input: {
  bookId: LongBookId;
  selection: LongWorkspaceSelection | null;
  activeFileId: LongFileId | null;
  characterOverviewFile?: LongWorkspaceFileReference | null;
  readDocument: ReadLongDocument;
}): Promise<LongCharacterFocusSnapshot | undefined> {
  const {
    bookId,
    selection,
    activeFileId,
    characterOverviewFile,
    readDocument
  } = input;
  if (selection?.root !== "character_design" || !activeFileId) {
    return undefined;
  }

  const overviewFile =
    selection.files.find(({ role }) => role === "overview")?.file ??
    characterOverviewFile ??
    null;

  if (selection.key === "character-overview") {
    if (!overviewFile || overviewFile.id !== activeFileId) return undefined;
    return {
      currentDocument: {
        kind: "overview",
        title: "概览",
        text: await readFocusText(
          readDocument,
          bookId,
          overviewFile.id,
          LONG_CHARACTER_FOCUS_MAX_CHARACTERS
        )
      }
    };
  }

  if (
    !selection.characterId ||
    !selection.characterGroup
  ) {
    return undefined;
  }
  const active = selection.files.find(({ file }) => file.id === activeFileId);
  if (!active) return undefined;
  const document = CHARACTER_DOCUMENTS[active.role];
  if (!document) return undefined;

  const coreProfile = selection.files.find(
    ({ role }) => role === "core-profile"
  );
  const isCoreProfile = document.kind === "core_profile";
  if (!isCoreProfile && !coreProfile) return undefined;

  const reserved =
    LONG_CHARACTER_OVERVIEW_FOCUS_MAX_CHARACTERS +
    (isCoreProfile ? 0 : LONG_CHARACTER_CORE_FOCUS_MAX_CHARACTERS);
  const currentMaximum = LONG_CHARACTER_FOCUS_MAX_CHARACTERS - reserved;
  const [currentText, overviewText, coreText] = await Promise.all([
    readFocusText(readDocument, bookId, activeFileId, currentMaximum),
    overviewFile
      ? readFocusText(
          readDocument,
          bookId,
          overviewFile.id,
          LONG_CHARACTER_OVERVIEW_FOCUS_MAX_CHARACTERS
        )
      : Promise.resolve({ content: "" }),
    !isCoreProfile && coreProfile
      ? readFocusText(
          readDocument,
          bookId,
          coreProfile.file.id,
          LONG_CHARACTER_CORE_FOCUS_MAX_CHARACTERS
        )
      : Promise.resolve(undefined)
  ]);
  return {
    characterName: selection.title,
    group: selection.characterGroup,
    currentDocument: {
      kind: document.kind,
      title: document.title,
      text: currentText
    },
    overview: overviewText,
    ...(coreText ? { coreProfile: coreText } : {})
  };
}
