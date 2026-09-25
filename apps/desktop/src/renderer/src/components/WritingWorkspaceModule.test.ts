import { describe, expect, it } from "vitest";
import appSource from "../WorkspaceShell.vue?raw";
import source from "./WritingWorkspaceModule.vue?raw";

describe("WritingWorkspaceModule boundary", () => {
  it("owns the default short and script conversation/editor surface", () => {
    expect(source).toContain("<AgentConversation");
    expect(source).toContain("<RightEditorPane");
    expect(source).toContain('class="pane-resizer pane-resizer-right"');
    expect(source).toContain('v-if="!rightPane.collapsed"');
    expect(appSource).toContain("<WritingWorkspaceModule");
    expect(appSource).toContain("activeFeature === 'conversation'");
    expect(appSource).not.toContain("<RightEditorPane");
  });

  it("keeps high-frequency conversation refs inside the module", () => {
    expect(source).toContain(
      "conversationController: AgentConversationController"
    );
    expect(source).toContain("conversationContext: WritingConversationContext");
    expect(source).toContain('v-bind="conversationContext"');
    expect(source).toContain(
      ':messages="conversationController.messages.value"'
    );
    expect(source).toContain(':draft="conversationController.draft.value"');
    expect(source).toContain('v-bind="editor"');
    expect(source).toContain("AgentConversationPublicProps");
    expect(source).toContain("RightEditorPanePublicProps");
    expect(source).not.toMatch(/\bany\b/u);
    expect(appSource).toContain(
      ':conversation-controller="activeConversation"'
    );
    expect(appSource).toContain(
      ':conversation-context="writingConversationContext"'
    );
    expect(appSource).toContain('@update:draft="updateComposerDraft"');
    expect(appSource).not.toContain("const writingWorkspaceViewModel");
    expect(appSource).not.toContain("const composerDraft = computed");
    expect(appSource).toContain('@save="applyDocument"');
    expect(appSource).toContain(
      '@resize-start="startPaneResize(\'right\', $event)"'
    );
  });

  it("keeps the left navigation resizer in the App shell", () => {
    expect(appSource).toContain('class="pane-resizer pane-resizer-left"');
    expect(source).not.toContain("pane-resizer-left");
    expect(source).not.toContain("workspaceMainView");
  });
});
