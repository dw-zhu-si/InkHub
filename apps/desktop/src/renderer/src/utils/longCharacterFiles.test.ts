import { describe, expect, it } from "vitest";
import {
  EMPTY_LONG_MARKDOWN_REVISION,
  LONG_CHARACTER_OVERVIEW_FILE_ID,
  LONG_CHARACTER_OVERVIEW_PATH,
  longCharacterCoreProfileFileId,
  longCharacterCurrentStateFileId,
  longCharacterFilePath,
  longCharacterHistoryFileId,
  longCharacterRelationshipsFileId
} from "@deepwrite/contracts";
import {
  findLongCharacterFile,
  longCharacterFiles
} from "./longCharacterFiles";

const updatedAt = "2026-07-31T00:00:00.000Z";
const overview = {
  id: LONG_CHARACTER_OVERVIEW_FILE_ID,
  path: LONG_CHARACTER_OVERVIEW_PATH,
  revision: EMPTY_LONG_MARKDOWN_REVISION,
  updatedAt
};
const characterFiles = [{
  characterId: "character_alice",
  coreProfile: {
    id: longCharacterCoreProfileFileId("character_alice"),
    path: longCharacterFilePath("character_alice", "core-profile.md"),
    revision: EMPTY_LONG_MARKDOWN_REVISION,
    updatedAt
  },
  relationships: {
    id: longCharacterRelationshipsFileId("character_alice"),
    path: longCharacterFilePath("character_alice", "relationships.md"),
    revision: EMPTY_LONG_MARKDOWN_REVISION,
    updatedAt
  },
  currentState: {
    id: longCharacterCurrentStateFileId("character_alice"),
    path: longCharacterFilePath("character_alice", "current-state.md"),
    revision: EMPTY_LONG_MARKDOWN_REVISION,
    updatedAt
  },
  history: {
    id: longCharacterHistoryFileId("character_alice"),
    path: longCharacterFilePath("character_alice", "history.md"),
    revision: EMPTY_LONG_MARKDOWN_REVISION,
    updatedAt
  }
}];

describe("long character file indexing", () => {
  it("indexes the stage overview before character documents", () => {
    expect(
      longCharacterFiles({
        characterOverview: overview,
        characterFiles
      }).map(({ id }) => id)
    ).toEqual([
      LONG_CHARACTER_OVERVIEW_FILE_ID,
      longCharacterCoreProfileFileId("character_alice"),
      longCharacterRelationshipsFileId("character_alice"),
      longCharacterCurrentStateFileId("character_alice"),
      longCharacterHistoryFileId("character_alice")
    ]);
  });

  it("finds the stage overview by the file id used by agent proposals", () => {
    expect(
      findLongCharacterFile(
        { characterOverview: overview, characterFiles },
        LONG_CHARACTER_OVERVIEW_FILE_ID
      )?.path
    ).toBe(LONG_CHARACTER_OVERVIEW_PATH);
  });
});
