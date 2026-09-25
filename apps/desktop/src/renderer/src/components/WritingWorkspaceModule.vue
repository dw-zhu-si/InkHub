<script setup lang="ts">
import type {
  ThinkingLevel,
  UserPromptAttachment
} from "@deepwrite/contracts";
import type {
  AgentApprovalMode,
  EditorTextReference
} from "../types/conversation";
import type { AgentConversationController } from "../composables/useAgentConversation";
import AgentConversation from "./AgentConversation.vue";
import RightEditorPane from "./RightEditorPane.vue";

type AgentConversationPublicProps = InstanceType<
  typeof AgentConversation
>["$props"];
type RightEditorPanePublicProps = InstanceType<
  typeof RightEditorPane
>["$props"];

type WritingConversationContext = Readonly<
  Pick<
    AgentConversationPublicProps,
    | "runtimeAvailable"
    | "contextTitle"
    | "bookTitle"
    | "stageLabel"
    | "agentLabel"
    | "agentId"
    | "agentWorkspaceType"
    | "allowLiveEditReview"
    | "libraryDomain"
    | "librarySkills"
    | "welcomeShortcuts"
    | "availableSkills"
    | "availableMaterials"
    | "editorReferences"
    | "leftCollapsed"
    | "rightCollapsed"
  >
>;

type WritingEditorViewModel = Readonly<
  Pick<
    RightEditorPanePublicProps,
    | "document"
    | "resourceId"
    | "draftState"
    | "locateReference"
    | "locked"
    | "lockedLabel"
    | "saving"
    | "autoSaveEnabled"
    | "boundToCurrentBook"
    | "sectionTabs"
    | "activeSectionId"
    | "sectionTabsLabel"
    | "canCreateSection"
    | "createSectionLabel"
    | "showDeleteSection"
    | "canDeleteSection"
    | "deleteSectionLabel"
  >
>;

defineProps<{
  conversationController: AgentConversationController;
  conversationContext: WritingConversationContext;
  editor: WritingEditorViewModel;
  rightPane: Readonly<{
    collapsed: boolean;
    minWidth: number;
    maxWidth: number;
    width: number;
  }>;
}>();

const emit = defineEmits<{
  "update:draft": [value: string];
  clearEditorReferences: [];
  removeEditorReference: [referenceId: string];
  locateEditorReference: [reference: EditorTextReference];
  newConversation: [];
  selectConversation: [sessionId: string];
  send: [attachments: UserPromptAttachment[]];
  stop: [];
  suggestion: [value: string];
  toggleLeft: [];
  toggleRight: [];
  selectModel: [modelId: string];
  selectThinking: [level: ThinkingLevel];
  selectTemperature: [temperature: number];
  selectApproval: [mode: AgentApprovalMode];
  reviewEdit: [payload: {
    runId: string;
    proposalId: string;
    decision: "accept" | "reject";
  }];
  locateEditProposal: [payload: { runId: string; proposalId: string }];
  collapse: [];
  save: [payload: { id: string; title: string; content: string }];
  liveChange: [payload: { id: string; title: string; content: string }];
  insertSelection: [reference: EditorTextReference];
  selectSection: [sectionId: string];
  createSection: [];
  deleteSection: [];
  selectDraftFile: [fileKind: "body" | "character-state"];
  resizeStart: [event: PointerEvent];
  resizeKeydown: [event: KeyboardEvent];
}>();
</script>

<template>
  <AgentConversation
    v-bind="conversationContext"
    :messages="conversationController.messages.value"
    :conversation-history="conversationController.history.value"
    :current-session-id="conversationController.sessionId.value"
    :draft="conversationController.draft.value"
    :responding="conversationController.isBusy.value"
    :can-send="conversationController.canSend.value"
    :can-send-attachments="conversationController.canSendAttachments.value"
    :can-stop="conversationController.canStop.value"
    :models="conversationController.configuredModels.value"
    :selected-model-id="conversationController.selectedModelId.value"
    :thinking-level="conversationController.thinkingLevel.value"
    :temperature="conversationController.temperature.value"
    :approval-mode="conversationController.approvalMode.value"
    @update:draft="emit('update:draft', $event)"
    @new-conversation="emit('newConversation')"
    @select-conversation="emit('selectConversation', $event)"
    @send="emit('send', $event)"
    @stop="emit('stop')"
    @suggestion="emit('suggestion', $event)"
    @toggle-left="emit('toggleLeft')"
    @toggle-right="emit('toggleRight')"
    @select-model="emit('selectModel', $event)"
    @select-thinking="emit('selectThinking', $event)"
    @select-temperature="emit('selectTemperature', $event)"
    @select-approval="emit('selectApproval', $event)"
    @review-edit="emit('reviewEdit', $event)"
    @locate-edit-proposal="emit('locateEditProposal', $event)"
    @clear-editor-references="emit('clearEditorReferences')"
    @remove-editor-reference="emit('removeEditorReference', $event)"
    @locate-editor-reference="emit('locateEditorReference', $event)"
  />

  <RightEditorPane
    v-if="!rightPane.collapsed"
    v-bind="editor"
    @collapse="emit('collapse')"
    @save="emit('save', $event)"
    @live-change="emit('liveChange', $event)"
    @insert-selection="emit('insertSelection', $event)"
    @select-section="emit('selectSection', $event)"
    @create-section="emit('createSection')"
    @delete-section="emit('deleteSection')"
    @select-draft-file="emit('selectDraftFile', $event)"
  />

  <div
    v-if="!rightPane.collapsed"
    class="pane-resizer pane-resizer-right"
    role="separator"
    aria-label="调整右侧栏宽度"
    aria-orientation="vertical"
    :aria-valuemin="rightPane.minWidth"
    :aria-valuemax="rightPane.maxWidth"
    :aria-valuenow="rightPane.width"
    tabindex="0"
    @pointerdown="emit('resizeStart', $event)"
    @keydown="emit('resizeKeydown', $event)"
  />
</template>
