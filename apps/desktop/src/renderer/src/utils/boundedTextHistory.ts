export interface TextSelectionRange {
  start: number;
  end: number;
}

export interface TextHistoryRestoreResult extends TextSelectionRange {
  content: string;
  nonWhitespaceDelta: number;
}

export interface TextHistoryRecordResult {
  nonWhitespaceDelta: number;
}

export interface TextInputHistoryChange {
  beforeContent: string;
  afterContent: string;
  selectionBefore: TextSelectionRange;
  selectionAfter: TextSelectionRange;
  inputType: string;
  timestamp?: number;
}

export interface TextHistoryChange {
  beforeContent: string;
  afterContent: string;
  selectionBefore: TextSelectionRange;
  selectionAfter: TextSelectionRange;
  timestamp?: number;
}

export interface BoundedTextHistoryOptions {
  maxEntries?: number;
  maxRetainedCharacters?: number;
  coalesceWindowMs?: number;
}

export interface BoundedTextHistoryStats {
  undoEntries: number;
  redoEntries: number;
  retainedCharacters: number;
}

export interface BoundedTextHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  clear(): void;
  recordInput(change: TextInputHistoryChange): TextHistoryRecordResult | null;
  recordChange(change: TextHistoryChange): TextHistoryRecordResult | null;
  undo(content: string): TextHistoryRestoreResult | null;
  redo(content: string): TextHistoryRestoreResult | null;
  stats(): BoundedTextHistoryStats;
}

type TextEditMergeKind = "insert" | "delete-backward" | "delete-forward" | null;

interface TextEdit {
  start: number;
  deletedText: string;
  insertedLength: number;
  insertedHash: number;
  redoInsertedText: string | null;
  beforeLength: number;
  afterLength: number;
  selectionBefore: TextSelectionRange;
  selectionAfter: TextSelectionRange;
  mergeKind: TextEditMergeKind;
  timestamp: number;
}

interface DerivedTextEdit {
  edit: TextEdit;
  insertedText: string;
}

const DEFAULT_MAX_ENTRIES = 120;
const DEFAULT_MAX_RETAINED_CHARACTERS = 4 * 1024 * 1024;
const DEFAULT_COALESCE_WINDOW_MS = 750;
const TEXT_HASH_OFFSET = 2_166_136_261;
const TEXT_HASH_PRIME = 16_777_619;

const COALESCED_INSERT_INPUT_TYPES = new Set([
  "insertText",
  "insertCompositionText"
]);

function clampIndex(value: number, contentLength: number): number {
  if (!Number.isFinite(value)) return contentLength;
  return Math.max(0, Math.min(contentLength, Math.trunc(value)));
}

function normalizeSelection(
  selection: TextSelectionRange,
  contentLength: number
): TextSelectionRange {
  const start = clampIndex(selection.start, contentLength);
  const end = clampIndex(selection.end, contentLength);
  return start <= end ? { start, end } : { start: end, end: start };
}

function hashTextRange(
  content: string,
  start = 0,
  end = content.length,
  initialHash = TEXT_HASH_OFFSET
): number {
  let hash = initialHash;
  for (let index = start; index < end; index += 1) {
    hash = Math.imul(hash ^ content.charCodeAt(index), TEXT_HASH_PRIME);
  }
  return hash >>> 0;
}

function isWhitespaceCodeUnit(code: number): boolean {
  return (
    (code >= 0x0009 && code <= 0x000d) ||
    code === 0x0020 ||
    code === 0x00a0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}

/** Counts JavaScript `\s` characters without allocating a filtered copy. */
export function countNonWhitespaceCharacters(
  content: string,
  start = 0,
  end = content.length
): number {
  let count = 0;
  for (let index = start; index < end; index += 1) {
    if (!isWhitespaceCodeUnit(content.charCodeAt(index))) count += 1;
  }
  return count;
}

function textRangeMatchesHash(
  content: string,
  start: number,
  length: number,
  expectedHash: number
): boolean {
  if (start < 0 || length < 0 || start + length > content.length) return false;
  return hashTextRange(content, start, start + length) === expectedHash;
}

function mergeKindForInput(
  inputType: string,
  deletedText: string,
  insertedLength: number,
  selectionBefore: TextSelectionRange,
  selectionAfter: TextSelectionRange
): TextEditMergeKind {
  const beforeCollapsed = selectionBefore.start === selectionBefore.end;
  const afterCollapsed = selectionAfter.start === selectionAfter.end;
  if (!beforeCollapsed || !afterCollapsed) return null;
  if (
    deletedText.length === 0 &&
    insertedLength > 0 &&
    COALESCED_INSERT_INPUT_TYPES.has(inputType)
  ) {
    return "insert";
  }
  if (
    deletedText.length > 0 &&
    insertedLength === 0 &&
    inputType === "deleteContentBackward"
  ) {
    return "delete-backward";
  }
  if (
    deletedText.length > 0 &&
    insertedLength === 0 &&
    inputType === "deleteContentForward"
  ) {
    return "delete-forward";
  }
  return null;
}

function createEditAtRange(
  beforeContent: string,
  afterContent: string,
  start: number,
  end: number,
  selectionBefore: TextSelectionRange,
  selectionAfter: TextSelectionRange,
  inputType: string,
  timestamp: number
): DerivedTextEdit | null {
  if (start < 0 || end < start || end > beforeContent.length) return null;
  const deletedLength = end - start;
  const insertedLength = afterContent.length - (beforeContent.length - deletedLength);
  if (
    insertedLength < 0 ||
    start + insertedLength > afterContent.length ||
    (deletedLength === 0 && insertedLength === 0)
  ) {
    return null;
  }
  const deletedText = beforeContent.slice(start, end);
  const insertedText = afterContent.slice(start, start + insertedLength);
  return {
    insertedText,
    edit: {
      start,
      deletedText,
      insertedLength,
      insertedHash: hashTextRange(insertedText),
      redoInsertedText: null,
      beforeLength: beforeContent.length,
      afterLength: afterContent.length,
      selectionBefore,
      selectionAfter,
      mergeKind: mergeKindForInput(
        inputType,
        deletedText,
        insertedLength,
        selectionBefore,
        selectionAfter
      ),
      timestamp
    }
  };
}

function createEditByDiff(
  beforeContent: string,
  afterContent: string,
  selectionBefore: TextSelectionRange,
  selectionAfter: TextSelectionRange,
  timestamp: number
): DerivedTextEdit | null {
  if (beforeContent === afterContent) return null;
  const shortestLength = Math.min(beforeContent.length, afterContent.length);
  let start = 0;
  while (
    start < shortestLength &&
    beforeContent.charCodeAt(start) === afterContent.charCodeAt(start)
  ) {
    start += 1;
  }

  let beforeEnd = beforeContent.length;
  let afterEnd = afterContent.length;
  while (
    beforeEnd > start &&
    afterEnd > start &&
    beforeContent.charCodeAt(beforeEnd - 1) ===
      afterContent.charCodeAt(afterEnd - 1)
  ) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  const derived = createEditAtRange(
    beforeContent,
    afterContent,
    start,
    beforeEnd,
    selectionBefore,
    selectionAfter,
    "",
    timestamp
  );
  if (!derived) return null;

  // The diff path is used by programmatic replacements and unusual browser
  // input events. Keep those edits as explicit undo boundaries.
  derived.edit.mergeKind = null;
  return derived;
}

function deriveInputEdit(change: TextInputHistoryChange): DerivedTextEdit | null {
  const {
    beforeContent,
    afterContent,
    inputType
  } = change;
  if (beforeContent === afterContent) return null;
  const selectionBefore = normalizeSelection(
    change.selectionBefore,
    beforeContent.length
  );
  const selectionAfter = normalizeSelection(
    change.selectionAfter,
    afterContent.length
  );
  const timestamp = change.timestamp ?? Date.now();

  if (selectionBefore.start !== selectionBefore.end) {
    return createEditAtRange(
      beforeContent,
      afterContent,
      selectionBefore.start,
      selectionBefore.end,
      selectionBefore,
      selectionAfter,
      inputType,
      timestamp
    ) ?? createEditByDiff(
      beforeContent,
      afterContent,
      selectionBefore,
      selectionAfter,
      timestamp
    );
  }

  if (
    inputType === "insertText" ||
    inputType === "insertCompositionText" ||
    inputType === "insertLineBreak" ||
    inputType === "insertParagraph" ||
    inputType === "insertFromPaste" ||
    inputType === "insertFromDrop" ||
    inputType === "insertFromYank"
  ) {
    return createEditAtRange(
      beforeContent,
      afterContent,
      selectionBefore.start,
      selectionBefore.end,
      selectionBefore,
      selectionAfter,
      inputType,
      timestamp
    ) ?? createEditByDiff(
      beforeContent,
      afterContent,
      selectionBefore,
      selectionAfter,
      timestamp
    );
  }

  if (inputType.endsWith("Backward")) {
    const start = Math.min(selectionBefore.start, selectionAfter.start);
    return createEditAtRange(
      beforeContent,
      afterContent,
      start,
      selectionBefore.start,
      selectionBefore,
      selectionAfter,
      inputType,
      timestamp
    ) ?? createEditByDiff(
      beforeContent,
      afterContent,
      selectionBefore,
      selectionAfter,
      timestamp
    );
  }

  if (inputType.startsWith("delete")) {
    const deletedLength = beforeContent.length - afterContent.length;
    if (deletedLength >= 0) {
      return createEditAtRange(
        beforeContent,
        afterContent,
        selectionBefore.start,
        selectionBefore.start + deletedLength,
        selectionBefore,
        selectionAfter,
        inputType,
        timestamp
      ) ?? createEditByDiff(
        beforeContent,
        afterContent,
        selectionBefore,
        selectionAfter,
        timestamp
      );
    }
  }

  return createEditByDiff(
    beforeContent,
    afterContent,
    selectionBefore,
    selectionAfter,
    timestamp
  );
}

function deriveProgrammaticEdit(change: TextHistoryChange): DerivedTextEdit | null {
  const selectionBefore = normalizeSelection(
    change.selectionBefore,
    change.beforeContent.length
  );
  const selectionAfter = normalizeSelection(
    change.selectionAfter,
    change.afterContent.length
  );
  return createEditByDiff(
    change.beforeContent,
    change.afterContent,
    selectionBefore,
    selectionAfter,
    change.timestamp ?? Date.now()
  );
}

function selectionsEqual(
  left: TextSelectionRange,
  right: TextSelectionRange
): boolean {
  return left.start === right.start && left.end === right.end;
}

function tryMergeEdits(
  previous: TextEdit,
  next: TextEdit,
  nextInsertedText: string,
  coalesceWindowMs: number
): boolean {
  if (
    !previous.mergeKind ||
    previous.mergeKind !== next.mergeKind ||
    next.timestamp < previous.timestamp ||
    next.timestamp - previous.timestamp > coalesceWindowMs ||
    previous.afterLength !== next.beforeLength ||
    !selectionsEqual(previous.selectionAfter, next.selectionBefore)
  ) {
    return false;
  }

  if (
    previous.mergeKind === "insert" &&
    previous.start + previous.insertedLength === next.start
  ) {
    previous.insertedHash = hashTextRange(
      nextInsertedText,
      0,
      nextInsertedText.length,
      previous.insertedHash
    );
    previous.insertedLength += next.insertedLength;
  } else if (
    previous.mergeKind === "delete-backward" &&
    next.start + next.deletedText.length === previous.start
  ) {
    previous.start = next.start;
    previous.deletedText = next.deletedText + previous.deletedText;
  } else if (
    previous.mergeKind === "delete-forward" &&
    previous.start === next.start
  ) {
    previous.deletedText += next.deletedText;
  } else {
    return false;
  }

  previous.afterLength = next.afterLength;
  previous.selectionAfter = next.selectionAfter;
  previous.timestamp = next.timestamp;
  return true;
}

function replaceTextRange(
  content: string,
  start: number,
  removedLength: number,
  replacement: string
): string {
  return (
    content.slice(0, start) +
    replacement +
    content.slice(start + removedLength)
  );
}

export function createBoundedTextHistory(
  options: BoundedTextHistoryOptions = {}
): BoundedTextHistory {
  const maxEntries = Math.max(1, Math.trunc(options.maxEntries ?? DEFAULT_MAX_ENTRIES));
  const maxRetainedCharacters = Math.max(
    1,
    Math.trunc(
      options.maxRetainedCharacters ?? DEFAULT_MAX_RETAINED_CHARACTERS
    )
  );
  const coalesceWindowMs = Math.max(
    0,
    options.coalesceWindowMs ?? DEFAULT_COALESCE_WINDOW_MS
  );
  const undoEntries: TextEdit[] = [];
  const redoEntries: TextEdit[] = [];

  function retainedCharacters(): number {
    let total = 0;
    for (const entry of undoEntries) {
      total += entry.deletedText.length;
    }
    for (const entry of redoEntries) {
      total += entry.deletedText.length + (entry.redoInsertedText?.length ?? 0);
    }
    return total;
  }

  function removeOldestReachableEntry(): boolean {
    const totalEntries = undoEntries.length + redoEntries.length;
    if (totalEntries <= 1) return false;
    if (undoEntries.length > 0) {
      undoEntries.shift();
      return true;
    }
    redoEntries.shift();
    return true;
  }

  function trim(): void {
    while (
      undoEntries.length + redoEntries.length > maxEntries &&
      removeOldestReachableEntry()
    ) {
      // Keep the most recently reachable history entries.
    }
    while (
      retainedCharacters() > maxRetainedCharacters &&
      removeOldestReachableEntry()
    ) {
      // A single oversized atomic edit is retained so it remains undoable.
      // Memory cannot then grow beyond that one operation.
    }
  }

  function recordDerived(
    derived: DerivedTextEdit | null,
    coalesce: boolean
  ): TextHistoryRecordResult | null {
    if (!derived) return null;
    const nonWhitespaceDelta =
      countNonWhitespaceCharacters(derived.insertedText) -
      countNonWhitespaceCharacters(derived.edit.deletedText);
    redoEntries.length = 0;
    const previous = undoEntries.at(-1);
    if (
      !coalesce ||
      !previous ||
      !tryMergeEdits(
        previous,
        derived.edit,
        derived.insertedText,
        coalesceWindowMs
      )
    ) {
      undoEntries.push(derived.edit);
    }
    trim();
    return { nonWhitespaceDelta };
  }

  function clear(): void {
    undoEntries.length = 0;
    redoEntries.length = 0;
  }

  return {
    get canUndo() {
      return undoEntries.length > 0;
    },
    get canRedo() {
      return redoEntries.length > 0;
    },
    clear,
    recordInput(change) {
      return recordDerived(deriveInputEdit(change), true);
    },
    recordChange(change) {
      return recordDerived(deriveProgrammaticEdit(change), false);
    },
    undo(content) {
      const entry = undoEntries.at(-1);
      if (
        !entry ||
        content.length !== entry.afterLength ||
        !textRangeMatchesHash(
          content,
          entry.start,
          entry.insertedLength,
          entry.insertedHash
        )
      ) {
        if (entry) clear();
        return null;
      }
      undoEntries.pop();
      const insertedText = content.slice(
        entry.start,
        entry.start + entry.insertedLength
      );
      entry.redoInsertedText = insertedText;
      const restoredContent = replaceTextRange(
        content,
        entry.start,
        entry.insertedLength,
        entry.deletedText
      );
      redoEntries.push(entry);
      trim();
      return {
        content: restoredContent,
        start: entry.selectionBefore.start,
        end: entry.selectionBefore.end,
        nonWhitespaceDelta:
          countNonWhitespaceCharacters(entry.deletedText) -
          countNonWhitespaceCharacters(insertedText)
      };
    },
    redo(content) {
      const entry = redoEntries.at(-1);
      const insertedText = entry?.redoInsertedText;
      if (
        !entry ||
        insertedText == null ||
        content.length !== entry.beforeLength ||
        !content.startsWith(entry.deletedText, entry.start)
      ) {
        if (entry) clear();
        return null;
      }
      redoEntries.pop();
      const restoredContent = replaceTextRange(
        content,
        entry.start,
        entry.deletedText.length,
        insertedText
      );
      entry.redoInsertedText = null;
      undoEntries.push(entry);
      trim();
      return {
        content: restoredContent,
        start: entry.selectionAfter.start,
        end: entry.selectionAfter.end,
        nonWhitespaceDelta:
          countNonWhitespaceCharacters(insertedText) -
          countNonWhitespaceCharacters(entry.deletedText)
      };
    },
    stats() {
      return {
        undoEntries: undoEntries.length,
        redoEntries: redoEntries.length,
        retainedCharacters: retainedCharacters()
      };
    }
  };
}
