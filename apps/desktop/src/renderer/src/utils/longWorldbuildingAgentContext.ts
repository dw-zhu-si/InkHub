import {
  LONG_WORLDBUILDING_FOCUS_MAX_CHARACTERS,
  LONG_WORLDBUILDING_OVERVIEW_FOCUS_MAX_CHARACTERS,
  type LongBookId,
  type LongFileId,
  type LongReadDocumentInput,
  type LongReadDocumentResult,
  type LongWorldbuildingFocusSnapshot
} from "@deepwrite/contracts";
import type { LongWorkspaceSelection } from "../types/longWorkspace";

type ReadLongDocument = (
  input: LongReadDocumentInput
) => Promise<LongReadDocumentResult>;

function snapshotText(
  page: LongReadDocumentResult,
  maximum: number
): LongWorldbuildingFocusSnapshot["currentStage"]["text"] {
  const characters = Array.from(page.content).slice(0, maximum);
  const content = characters.join("");
  return page.totalCharacters > characters.length
    ? {
        content,
        truncated: true,
        originalLength: page.totalCharacters
      }
    : { content };
}

async function readFocusText(
  readDocument: ReadLongDocument,
  bookId: LongBookId,
  fileId: LongFileId,
  maximum: number
): Promise<LongWorldbuildingFocusSnapshot["currentStage"]["text"]> {
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
    throw new Error("长篇世界观阶段读取结果与当前选择不一致。");
  }
  return snapshotText(page, maximum);
}

export async function buildLongWorldbuildingFocusSnapshot(input: {
  bookId: LongBookId;
  selection: LongWorkspaceSelection | null;
  activeFileId: LongFileId | null;
  readDocument: ReadLongDocument;
}): Promise<LongWorldbuildingFocusSnapshot | undefined> {
  const { bookId, selection, activeFileId, readDocument } = input;
  if (
    selection?.root !== "worldbuilding" ||
    !selection.worldbuildingFormat ||
    !activeFileId
  ) {
    return undefined;
  }

  const activeFile = selection.files.find(
    ({ file }) => file.id === activeFileId
  );
  if (!activeFile) return undefined;

  if (selection.worldbuildingFormat === "text") {
    return {
      categoryTitle: selection.title,
      format: "text",
      currentStage: {
        kind: "text",
        title: selection.title,
        text: await readFocusText(
          readDocument,
          bookId,
          activeFileId,
          LONG_WORLDBUILDING_FOCUS_MAX_CHARACTERS
        )
      }
    };
  }

  const overviewFile = selection.files.find(
    ({ role }) => role === "overview"
  );
  const activeItem = selection.worldbuildingItems?.find(
    ({ file }) => file.id === activeFileId
  );
  if (activeItem) {
    const stageMaximum =
      LONG_WORLDBUILDING_FOCUS_MAX_CHARACTERS -
      LONG_WORLDBUILDING_OVERVIEW_FOCUS_MAX_CHARACTERS;
    const [stageText, overviewText] = await Promise.all([
      readFocusText(
        readDocument,
        bookId,
        activeItem.file.id,
        stageMaximum
      ),
      overviewFile
        ? readFocusText(
            readDocument,
            bookId,
            overviewFile.file.id,
            LONG_WORLDBUILDING_OVERVIEW_FOCUS_MAX_CHARACTERS
          )
        : Promise.resolve({ content: "" })
    ]);
    return {
      categoryTitle: selection.title,
      format: "list",
      currentStage: {
        kind: "item",
        title: activeItem.title,
        text: stageText
      },
      overview: overviewText
    };
  }

  if (overviewFile?.file.id !== activeFileId) return undefined;
  return {
    categoryTitle: selection.title,
    format: "list",
    currentStage: {
      kind: "overview",
      title: "概览",
      text: await readFocusText(
        readDocument,
        bookId,
        overviewFile.file.id,
        LONG_WORLDBUILDING_FOCUS_MAX_CHARACTERS
      )
    }
  };
}
