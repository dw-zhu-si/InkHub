import { describe, expect, it } from "vitest";
import source from "./LongPlotStructureManager.vue?raw";

describe("LongPlotStructureManager", () => {
  it("covers every plot entity through proposal-only mutation builders", () => {
    for (const method of [
      "createStoryEvent",
      "updateStoryEvent",
      "reorderStoryEvent",
      "deleteStoryEvent",
      "createEventConnection",
      "updateEventConnection",
      "deleteEventConnection",
      "createNarrativePlacement",
      "updateNarrativePlacement",
      "reorderNarrativePlacement",
      "deleteNarrativePlacement",
      "createForeshadowing",
      "updateForeshadowing",
      "reorderForeshadowing",
      "deleteForeshadowing",
      "createForeshadowingBeat",
      "updateForeshadowingBeat",
      "reorderForeshadowingBeat",
      "deleteForeshadowingBeat"
    ]) {
      expect(source).toContain(`builder.${method}`);
    }
    expect(source).toContain(
      "build(createLongStructureMutationBuilder(props.snapshot))"
    );
    expect(source).not.toContain("window.deepwrite");
    expect(source).not.toContain("applyOperations");
    expect(source).not.toContain("previewOperations");
  });

  it("keeps a submitted draft locked until the real apply result arrives", () => {
    expect(source).toContain("completion: LongStructureMutationCompletion");
    expect(source).toContain("const pendingMutation = ref<");
    expect(source).toContain(
      'succeed: () => finishMutation(requestId, "succeeded")'
    );
    expect(source).toContain(
      'fail: () => finishMutation(requestId, "failed")'
    );
    expect(source).toContain("appliedButRefreshFailed");
    expect(source).toContain('if (outcome === "failed") return');
    expect(source).toContain('}, "form")');
    expect(source).toContain('}, "delete")');
    expect(source).not.toContain("if (succeeded) closeForm()");
    expect(source).not.toContain("if (succeeded) {\n    closeDelete()");
    expect(source).toContain(
      '<fieldset class="modal-body" :disabled="mutationLocked">'
    );
  });

  it("shows and edits imported fields, including machine story time", () => {
    for (const field of [
      "timeMode",
      "timeLabel",
      "timeValue",
      "location",
      "arcIds",
      "characterIds",
      "sourceEventId",
      "targetEventId",
      "connectionType",
      "eventId",
      "chapterCardId",
      "narrativeMode",
      "disclosure",
      "writingPrompt",
      "coreQuestion",
      "truthEventId",
      "expectedReaderEffect",
      "foreshadowingStatus",
      "threadId",
      "beatType",
      "placementId",
      "plannedScope",
      "executionStatus",
      "commitId"
    ]) {
      expect(source).toContain(`draft.${field}`);
    }
    expect(source).toContain("缺失引用");
    expect(source).toContain("uiMessage.warning");
    expect(source).toContain("由章节提交/回滚流程维护");
  });

  it("keeps reference choices reactive and uses themed shared controls", () => {
    expect(source).toContain("const eventOptions = computed");
    expect(source).toContain("const chapterOptions = computed");
    expect(source).toContain("const placementOptions = computed");
    expect(source).toContain("const threadOptions = computed");
    expect(source.match(/<PopupSelect/gu)?.length).toBeGreaterThanOrEqual(10);
    expect(source).not.toContain("<select");
    expect(source).toContain('type="checkbox"');
    expect(source).toContain('<Teleport to="body">');
    expect(source).toContain('role="alertdialog"');
    expect(source).toContain('aria-describedby="long-plot-delete-description"');
    expect(source).toContain("cascadeDelete");
    for (const token of [
      "--surface-main",
      "--surface-raised",
      "--surface-muted",
      "--surface-hover",
      "--theme-line",
      "--theme-line-soft",
      "--text-primary",
      "--text-secondary",
      "--text-tertiary",
      "--accent",
      "--accent-soft",
      "--neutral-solid"
    ]) {
      expect(source).toContain(`var(${token})`);
    }
    expect(source).toContain("@media (max-width: 42rem)");
    expect(source).toContain('@keydown.esc.stop="closeForm"');
    expect(source).toContain('@keydown.esc.stop="closeDelete"');
  });

  it("does not lock plot entities after continuity recording", () => {
    expect(source).toContain("editLocked: false");
    expect(source).toContain("deleteLocked: false");
    expect(source).toContain("reorderLocked: false");
    expect(source).not.toContain("committedEventIds");
  });

  it("uses direct tabs to switch narrative structure types", () => {
    expect(source).toContain('aria-label="剧情叙事结构类型"');
    expect(source).toContain('class="plot-section-tabs"');
    expect(source).toContain('role="tab"');
    expect(source).toContain('@click="setSection(section.value)"');
  });
});
