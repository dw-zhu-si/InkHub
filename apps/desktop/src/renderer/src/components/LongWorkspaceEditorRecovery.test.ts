import { describe, expect, it } from "vitest";
import editorSource from "./LongWorkspaceEditor.vue?raw";

describe("long workspace editor crash recovery", () => {
  it("persists dirty long documents with a debounced write and an unload flush", () => {
    expect(editorSource).toContain(
      'const RECOVERY_STORAGE_PREFIX = "deepwrite:long-editor-recovery:v1:"'
    );
    expect(editorSource).toContain("bookId: state.bookId");
    expect(editorSource).toContain("fileId: state.file.id");
    expect(editorSource).toContain("content: state.content");
    expect(editorSource).toContain("savedContent: state.savedContent");
    expect(editorSource).toContain("baseRevision: state.file.revision");
    expect(editorSource).toContain(
      "workspaceRevision: state.workspaceRevision"
    );
    expect(editorSource).toContain("projectRevision: state.projectRevision");
    expect(editorSource).toContain("timestamp: Date.now()");
    expect(editorSource).toContain("scheduleRecoveryWrite(key)");
    expect(editorSource).toContain("RECOVERY_WRITE_DEBOUNCE_MS");
    expect(editorSource).toContain(
      "function flushAllRecoveryRecords(): void"
    );
    expect(editorSource).toContain(
      "function handleBeforeUnload(event: BeforeUnloadEvent)"
    );
    expect(editorSource).toMatch(
      /handleBeforeUnload[\s\S]*flushAllRecoveryRecords\(\)/
    );
    expect(editorSource).toMatch(
      /onBeforeUnmount\(\(\) => \{[\s\S]*flushAllRecoveryRecords\(\)/
    );
  });

  it("isolates recovery keys by both book and file", () => {
    expect(editorSource).toContain(
      "`${RECOVERY_STORAGE_PREFIX}${encodeURIComponent(bookId)}:${encodeURIComponent(fileId)}`"
    );
    expect(editorSource).toContain('return `${bookId}\\u0000${fileId}`');
    expect(editorSource).toContain("value.bookId !== expectedBookId");
    expect(editorSource).toContain("value.fileId !== expectedFileId");
    expect(editorSource).toContain(
      "readRecoveryRecord(bookId, firstPage.file.id)"
    );
  });

  it("automatically restores only a recovery based on the current disk revision", () => {
    expect(editorSource).toContain(
      "recovery?.baseRevision === firstPage.file.revision"
    );
    expect(editorSource).toContain(
      "recoveryMatchesDisk && recovery.content !== content"
    );
    expect(editorSource).toContain("content: recoveredContent");
    expect(editorSource).toContain("savedContent: content");
    expect(editorSource).toContain("已恢复");
    expect(editorSource).toContain("本机未保存内容");
  });

  it("keeps a stale recovery without replacing disk content and offers explicit reconciliation", () => {
    expect(editorSource).toMatch(
      /else if \(recovery\) \{[\s\S]*staleRecoveryByKey\.value[\s\S]*磁盘内容未被覆盖/
    );
    expect(editorSource).toContain("发现旧版本恢复副本");
    expect(editorSource).toContain("复制副本");
    expect(editorSource).toContain("载入副本核对");
    expect(editorSource).toContain(
      "磁盘文件尚未被修改"
    );
    expect(editorSource).toContain(
      "baseRevision: state.file.revision"
    );
    expect(editorSource).toContain(
      "baseWorkspaceRevision: state.workspaceRevision"
    );
    expect(editorSource).toContain(
      "baseProjectRevision: state.projectRevision"
    );
  });

  it("clears a recovery after a successful clean save or a manual revert to disk", () => {
    expect(editorSource).toMatch(
      /if \(content === state\.savedContent\) \{[\s\S]*clearRecoveryRecordForKey/
    );
    expect(editorSource).toMatch(
      /const savedState = documentStates\.value\[key\][\s\S]*savedState\?\.content === savedState\?\.savedContent[\s\S]*clearRecoveryRecordForKey/
    );
    expect(editorSource).toContain(
      "resolveRecoveryStorage()?.removeItem(recoveryStorageKey(bookId, fileId))"
    );
    expect(editorSource).toMatch(
      /else if \(savedState\) \{[\s\S]*persistRecoveryForKey\(key\)/
    );
  });

  it("rejects corrupt, oversized, expired, future-dated, and non-editable recovery data safely", () => {
    expect(editorSource).toContain(
      "raw.length > RECOVERY_MAX_RECORD_CHARACTERS"
    );
    expect(editorSource).toContain("value.schemaVersion !== 1");
    expect(editorSource).toContain(
      "now - value.timestamp > RECOVERY_MAX_AGE_MS"
    );
    expect(editorSource).toContain(
      "value.timestamp > now + RECOVERY_CLOCK_SKEW_MS"
    );
    expect(editorSource).toMatch(
      /const record = parseStoredRecovery[\s\S]*storage\.removeItem\(storageKey\)/
    );
    expect(editorSource).toContain("isEditableLongFile(state.file)");
    expect(editorSource).toContain("!selectedFile.readOnly");
    expect(editorSource).toContain(
      "`locked` is a transient write barrier"
    );
    expect(editorSource).not.toMatch(
      /const editable =[\s\S]{0,120}!props\.locked/
    );
    expect(editorSource).toContain(
      "A disabled or unavailable localStorage must never break the editor"
    );
  });

  it("never exposes stale text as editable when a revision reload fails", () => {
    expect(editorSource).toContain("const dirty =");
    expect(editorSource).toContain("loaded: dirty,");
    expect(editorSource).toContain(
      "Clean revision refreshes stay"
    );
    expect(editorSource).toMatch(
      /catch \(error: unknown\)[\s\S]*loaded: false,[\s\S]*loadError: message/
    );
    expect(editorSource).toContain(
      "never keep it editable after"
    );
    expect(editorSource).toContain("!state.loaded");
    expect(editorSource).toContain("重新读取");
    expect(editorSource).toContain("@click=\"loadSelectedDocument(true)\"");
  });

  it("does not report a leave-save as clean when typing continues during the write", () => {
    expect(editorSource).toContain("const bookId = state.bookId");
    expect(editorSource).toMatch(
      /const saved = await runExclusiveSave[\s\S]*return !Object\.entries\(documentStates\.value\)\.some/
    );
    expect(editorSource).toContain(
      "workspaceRevision: Math.max("
    );
    expect(editorSource).toContain("Never regress to the older read baseline");
    expect(editorSource.match(/props\.bookId === bookId/gu)).toHaveLength(2);
    expect(editorSource).toContain(
      "保存期间的新修改仍待保存"
    );
  });
});
