<script setup lang="ts">
import { computed, onBeforeUnmount, type ComponentPublicInstance } from "vue";
import type {
  LongArcId,
  LongAgentProfile,
  LongBookSummary,
  LongChapterCardId,
  LongCharacterId,
  LongLedgerCommitIndexEntry,
  LongWorkspaceIndexSnapshot,
  LongWorkspaceOperationBatch,
  LongWriteDocumentResult,
  ThinkingLevel,
  UserPromptAttachment
} from "@deepwrite/contracts";
import type { AgentConversationController } from "../composables/useAgentConversation";
import type { LongWorkspaceProposalItem } from "../composables/useLongWorkspaceProposals";
import type { LongWorkspaceEditorPort } from "../composables/useLongWorkspaceSessionCoordinator";
import type { LongWritingOrchestrator } from "../composables/useLongWritingOrchestrator";
import type {
  LongWorkspaceFileContext,
  LongWorkspaceRefreshStatus
} from "../stores/longWorkspaceStore";
import type {
  AgentApprovalMode,
  ComposerReferenceOption
} from "../types/conversation";
import type {
  LongStructureMutationCompletion,
  LongWorkspaceSelection
} from "../types/longWorkspace";
import {
  LONG_WORKSPACE_ROOT_LABELS
} from "../utils/longWorkspaceResourceTree";
import AgentConversation from "./AgentConversation.vue";
import AppIcon from "./AppIcon.vue";
import { LongWorkspaceEditor } from "./lazyAppComponents";

const props = defineProps<{
  conversationController: AgentConversationController | null;
  writingOrchestrator: LongWritingOrchestrator;
  book: LongBookSummary | null;
  selection: LongWorkspaceSelection | null;
  workspaceIndex: LongWorkspaceIndexSnapshot | null;
  agentProfile: LongAgentProfile | null;
  availableSkillReferences: ComposerReferenceOption[];
  availableMaterialReferences: ComposerReferenceOption[];
  proposalItems: LongWorkspaceProposalItem[];
  latestCommit: LongLedgerCommitIndexEntry | undefined;
  refreshStatus: LongWorkspaceRefreshStatus | null;
  revisionSyncRequired: boolean;
  runtimeAvailable: boolean;
  sendContextReady: boolean;
  sendPreflightPending: boolean;
  editorLocked: boolean;
  editorLockedReason: string | undefined;
  loading: boolean;
  leftCollapsed: boolean;
  rightPane: Readonly<{
    collapsed: boolean;
    minWidth: number;
    maxWidth: number;
    width: number;
  }>;
}>();

const emit = defineEmits<{
  "update:draft": [value: string];
  editorPortChange: [port: LongWorkspaceEditorPort | null];
  expandLeft: [];
  toggleLeft: [];
  toggleRight: [];
  collapseRight: [];
  resizeStart: [event: PointerEvent];
  resizeKeydown: [event: KeyboardEvent];
  newConversation: [];
  selectConversation: [sessionId: string];
  send: [attachments: UserPromptAttachment[]];
  stop: [];
  suggestion: [value: string];
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
  approveLongProposal: [eventId: string];
  rejectLongProposal: [eventId: string];
  retryLongProposalPreview: [eventId: string];
  locateLongProposal: [eventId: string];
  retryWorkspaceRefresh: [];
  retryWritingWorkflow: [];
  cancelWritingWorkflow: [];
  finishWritingWorkflow: [];
  saved: [result: LongWriteDocumentResult];
  contextChange: [context: LongWorkspaceFileContext | null];
  rollback: [];
  selectCharacter: [
    characterId: LongCharacterId,
    done?: (accepted: boolean) => void
  ];
  selectPlotPoint: [plotPointId: LongArcId];
  selectChapterCard: [chapterCardId: LongChapterCardId];
  renameCharacter: [
    input: { characterId: LongCharacterId; name: string },
    completion: (succeeded: boolean) => void
  ];
  renameStructureTitle: [
    input: {
      kind: "worldbuilding" | "volume" | "plotPoint" | "chapterCard";
      id: string;
      title: string;
    },
    completion: (succeeded: boolean) => void
  ];
  createCharacter: [];
  createWorldbuildingItem: [];
  createPlotPoint: [];
  createChapterCard: [];
  createVolume: [];
  deleteStructure: [
    input: {
      kind: "character" | "volume" | "plotPoint" | "chapterCard";
      id: string;
      title: string;
    },
    completion: (succeeded: boolean) => void
  ];
  saveVolumeOutline: [
    input: { volumeId: string; outline: string },
    completion: (succeeded: boolean) => void
  ];
  savePlotPointContent: [
    input: {
      plotPointId: LongArcId;
      field: "summary";
      content: string;
    },
    completion: (succeeded: boolean) => void
  ];
  mutation: [
    batch: LongWorkspaceOperationBatch,
    completion: LongStructureMutationCompletion
  ];
}>();

const conversationDraft = computed({
  get: () => props.conversationController?.draft.value ?? "",
  set: (value: string) => emit("update:draft", value)
});
const activeStageLabel = computed(
  () => LONG_WORKSPACE_ROOT_LABELS[props.selection?.root ?? "worldbuilding"]
);

let currentEditorPort: LongWorkspaceEditorPort | null = null;

function captureEditorPort(
  instance: Element | ComponentPublicInstance | null
): void {
  const nextPort = instance as LongWorkspaceEditorPort | null;
  if (nextPort === currentEditorPort) return;
  currentEditorPort = nextPort;
  emit("editorPortChange", nextPort);
}

function forwardSelectCharacter(
  characterId: LongCharacterId,
  done?: (accepted: boolean) => void
): void {
  emit("selectCharacter", characterId, done);
}

function forwardRenameCharacter(
  input: { characterId: LongCharacterId; name: string },
  completion: (succeeded: boolean) => void
): void {
  emit("renameCharacter", input, completion);
}

function forwardRenameStructureTitle(
  input: {
    kind: "worldbuilding" | "volume" | "plotPoint" | "chapterCard";
    id: string;
    title: string;
  },
  completion: (succeeded: boolean) => void
): void {
  emit("renameStructureTitle", input, completion);
}

function forwardDeleteStructure(
  input: {
    kind: "character" | "volume" | "plotPoint" | "chapterCard";
    id: string;
    title: string;
  },
  completion: (succeeded: boolean) => void
): void {
  emit("deleteStructure", input, completion);
}

function forwardSaveVolumeOutline(
  input: { volumeId: string; outline: string },
  completion: (succeeded: boolean) => void
): void {
  emit("saveVolumeOutline", input, completion);
}

function forwardSavePlotPointContent(
  input: {
    plotPointId: LongArcId;
    field: "summary";
    content: string;
  },
  completion: (succeeded: boolean) => void
): void {
  emit("savePlotPointContent", input, completion);
}

function forwardMutation(
  batch: LongWorkspaceOperationBatch,
  completion: LongStructureMutationCompletion
): void {
  emit("mutation", batch, completion);
}

onBeforeUnmount(() => {
  if (!currentEditorPort) return;
  currentEditorPort = null;
  emit("editorPortChange", null);
});
</script>

<template>
  <template v-if="book">
    <div class="long-agent-column" aria-label="长篇创作空间">
      <button
        v-if="leftCollapsed && !(conversationController && agentProfile)"
        class="icon-button long-workspace-expand-sidebar"
        type="button"
        aria-label="展开左侧栏"
        @click="emit('expandLeft')"
      >
        <AppIcon name="panel-left" :size="18" />
      </button>
      <AgentConversation
        v-if="conversationController && agentProfile"
        class="long-agent-conversation"
        v-model:draft="conversationDraft"
        :messages="conversationController.messages.value"
        :conversation-history="conversationController.history.value"
        :current-session-id="conversationController.sessionId.value"
        :responding="conversationController.isBusy.value"
        :can-send="
          !sendPreflightPending &&
          sendContextReady &&
          conversationController.canSend.value
        "
        :can-send-attachments="
          conversationController.canSendAttachments.value
        "
        :can-stop="conversationController.canStop.value"
        :runtime-available="runtimeAvailable"
        :models="conversationController.configuredModels.value"
        :selected-model-id="conversationController.selectedModelId.value"
        :thinking-level="conversationController.thinkingLevel.value"
        :temperature="conversationController.temperature.value"
        :approval-mode="conversationController.approvalMode.value"
        allow-live-edit-review
        :context-title="selection?.title ?? book.title"
        :book-title="book.title"
        :stage-label="activeStageLabel"
        :agent-label="agentProfile.label"
        :agent-id="agentProfile.id"
        agent-workspace-type="long"
        :library-domain="undefined"
        :library-skills="undefined"
        :welcome-shortcuts="agentProfile.welcomeShortcuts"
        :available-skills="availableSkillReferences"
        :available-materials="availableMaterialReferences"
        :editor-references="[]"
        :long-proposal-items="proposalItems"
        :long-workspace-index="workspaceIndex"
        :left-collapsed="leftCollapsed"
        :right-collapsed="rightPane.collapsed"
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
        @approve-long-proposal="emit('approveLongProposal', $event)"
        @reject-long-proposal="emit('rejectLongProposal', $event)"
        @retry-long-proposal-preview="
          emit('retryLongProposalPreview', $event)
        "
        @locate-long-proposal="emit('locateLongProposal', $event)"
      />
      <section
        v-if="refreshStatus?.error"
        class="long-workspace-refresh-status is-error"
        aria-live="polite"
      >
        <span v-if="revisionSyncRequired">
          账本回滚已完成，但最新版本尚未同步；正文编辑已锁定以防止版本冲突。
        </span>
        <span v-else>
          最新工作区索引尚未同步，长篇智能体已暂停发送。
        </span>
        <button
          type="button"
          @click="emit('retryWorkspaceRefresh')"
        >
          重新同步
        </button>
      </section>
      <section
        v-if="
          writingOrchestrator.state.value.phase !== 'idle' &&
          writingOrchestrator.state.value.bookId === book.id
        "
        class="long-writing-workflow-status"
        aria-live="polite"
      >
        <div>
          <strong>串行写作计划</strong>
          <span v-if="writingOrchestrator.currentChapter.value">
            {{ writingOrchestrator.currentChapter.value.title }}
            ·
            {{
              Math.min(
                writingOrchestrator.state.value.currentIndex + 1,
                writingOrchestrator.state.value.chapters.length
              )
            }}/{{ writingOrchestrator.state.value.chapters.length }}
          </span>
          <span v-else>已完成</span>
        </div>
        <small
          v-if="writingOrchestrator.state.value.error"
          class="is-error"
        >
          {{ writingOrchestrator.state.value.error }}
        </small>
        <small v-else>
          {{
            writingOrchestrator.state.value.phase ===
            "awaiting_writer_approval"
              ? "等待你审阅本章正文写入提案"
              : writingOrchestrator.state.value.phase === "complete"
                ? "本次计划已完成"
                : "正在核对文件与保存屏障"
          }}
        </small>
        <div
          v-if="writingOrchestrator.state.value.phase !== 'complete'"
          class="long-writing-workflow-actions"
        >
          <button
            v-if="writingOrchestrator.state.value.phase === 'error'"
            type="button"
            @click="emit('retryWritingWorkflow')"
          >
            重试当前章
          </button>
          <button
            type="button"
            @click="emit('cancelWritingWorkflow')"
          >
            取消计划
          </button>
        </div>
        <button
          v-if="writingOrchestrator.state.value.phase === 'complete'"
          type="button"
          @click="emit('finishWritingWorkflow')"
        >
          完成
        </button>
      </section>
    </div>
    <template v-if="workspaceIndex">
      <LongWorkspaceEditor
        v-show="!rightPane.collapsed"
        :ref="captureEditorPort"
        :book-id="book.id"
        :selection="selection"
        :workspace-index="workspaceIndex"
        :latest-commit="latestCommit"
        :locked="editorLocked"
        :locked-reason="editorLockedReason"
        @saved="emit('saved', $event)"
        @context-change="emit('contextChange', $event)"
        @collapse="emit('collapseRight')"
        @rollback="emit('rollback')"
        @select-character="forwardSelectCharacter"
        @select-plot-point="emit('selectPlotPoint', $event)"
        @select-chapter-card="emit('selectChapterCard', $event)"
        @rename-character="forwardRenameCharacter"
        @rename-structure-title="forwardRenameStructureTitle"
        @create-character="emit('createCharacter')"
        @create-worldbuilding-item="emit('createWorldbuildingItem')"
        @create-plot-point="emit('createPlotPoint')"
        @create-chapter-card="emit('createChapterCard')"
        @create-volume="emit('createVolume')"
        @delete-structure="forwardDeleteStructure"
        @save-volume-outline="forwardSaveVolumeOutline"
        @save-plot-point-content="forwardSavePlotPointContent"
        @mutation="forwardMutation"
      />
    </template>
    <div
      v-else-if="!rightPane.collapsed"
      class="long-workspace-editor-loading-state"
      aria-live="polite"
    >
      <span class="long-workspace-loading-icon">
        <AppIcon name="book" :size="28" />
      </span>
      <strong>
        {{
          loading
            ? "正在打开长篇工作区…"
            : "长篇工作区尚未载入"
        }}
      </strong>
      <span>
        {{
          loading
            ? "正在读取轻量导航索引，正文将在选择文件后按需读取。"
            : "请再次选择左侧长篇书籍重试。"
        }}
      </span>
    </div>
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
  <template v-else>
    <button
      v-if="leftCollapsed"
      class="icon-button long-workspace-expand-sidebar"
      type="button"
      aria-label="展开左侧栏"
      @click="emit('expandLeft')"
    >
      <AppIcon name="panel-left" :size="18" />
    </button>
    <div class="long-workspace-loading-state">
      <span class="long-workspace-loading-icon">
        <AppIcon name="book" :size="28" />
      </span>
      <strong>
        {{
          loading
            ? "正在打开长篇工作区…"
            : "长篇工作区尚未载入"
        }}
      </strong>
      <span>
        {{
          loading
            ? "先加载轻量导航索引，正文将在选择文件后按需读取。"
            : "请再次选择左侧长篇书籍重试。"
        }}
      </span>
    </div>
  </template>
</template>
