<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type {
  BookResourceDialogMode,
  CatalogResourceNodeActionPayload,
  CatalogLibraryEntryDragPayload,
  DialogMode,
  IconName,
  LongBookResourceNodeActionPayload,
  LongTreeItemAction,
  ResourceDomain,
  ResourceSectionActionPayload,
  ResourceTreeNode,
  ResourceTreeSection
} from "../types/workspace";
import AppIcon from "./AppIcon.vue";
import TreeSection from "./TreeSection.vue";
import TreeNodeItem from "./TreeNodeItem.vue";
import { uiMessage } from "../ui-feedback";
import type { UpdateState } from "@deepwrite/contracts";
import {
  collectPinnedResourceNodes,
  excludePinnedResourceNodes,
  flattenResourceNodes,
  parsePinnedResourceIds,
  pinnableResourceNodes,
  PINNED_RESOURCE_STORAGE_KEY
} from "../utils/pinnedResources";

const props = defineProps<{
  sections: ResourceTreeSection[];
  selectedId: string;
  imitationRunning?: boolean;
  libraryEntryClipboardDomain?: "skill" | "material" | undefined;
  activePrimaryFeature:
    | PrimaryFeatureId
    | "skill-marketplace"
    | "cloud-backup"
    | undefined;
  marketplaceDisplayName?: string | undefined;
  longTreeActionsDisabled?: boolean;
}>();

const emit = defineEmits<{
  collapse: [];
  createBook: [];
  openConversation: [];
  openDialog: [mode: DialogMode];
  openAgentTeams: [];
  openMarketplace: [];
  openCloudBackup: [];
  openSettings: [];
  selectResource: [node: ResourceTreeNode];
  bookAction: [mode: BookResourceDialogMode, node: ResourceTreeNode];
  exportBook: [node: ResourceTreeNode];
  longBookAction: [payload: LongBookResourceNodeActionPayload];
  resourceAction: [payload: ResourceSectionActionPayload];
  resourceNodeAction: [payload: CatalogResourceNodeActionPayload];
  moveLibraryEntry: [payload: CatalogLibraryEntryDragPayload];
  createExpertSection: [node: ResourceTreeNode];
  createLongDraftSection: [node: ResourceTreeNode];
  longDraftSectionAction: [action: "move-up" | "move-down" | "delete", node: ResourceTreeNode];
  createLongTreeItem: [node: ResourceTreeNode];
  longTreeItemAction: [action: LongTreeItemAction, node: ResourceTreeNode];
  removeExpertSection: [node: ResourceTreeNode];
  expertSectionAction: [action: "move-up" | "move-down", node: ResourceTreeNode];
  createCharacterItem: [node: ResourceTreeNode];
  characterItemAction: [action: "rename" | "move-up" | "move-down" | "delete", node: ResourceTreeNode];
}>();

const DEFAULT_USER_NAME = "作者";

const accountMenuRoot = ref<HTMLElement | null>(null);
const accountMenuOpen = ref(false);
const profileDialog = ref<"update" | null>(null);
const displayedUserName = computed(
  () => props.marketplaceDisplayName?.trim() || DEFAULT_USER_NAME
);
const avatarInitial = computed(
  () => Array.from(displayedUserName.value.trim())[0] ?? "作"
);
const updateState = ref<UpdateState>({
  status: "idle",
  currentVersion: "—",
  releaseNotes: [],
  mandatory: false,
  canDownload: false,
  canInstall: false
});
let unsubscribeUpdates: (() => void) | undefined;

const updateChecking = computed(() => updateState.value.status === "checking");
const updateDownloading = computed(() => updateState.value.status === "downloading");
const updateInstalling = computed(() => updateState.value.status === "installing");
const updateProgressLabel = computed(() =>
  `${Math.round(updateState.value.percent ?? 0)}%`
);

function formatBytes(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

function showUpdateError(state: UpdateState): void {
  if (state.status === "error") {
    uiMessage.error(state.message ?? "更新操作失败，请稍后重试");
  }
}

function toggleAccountMenu(): void {
  accountMenuOpen.value = !accountMenuOpen.value;
}

async function openUpdateDialog(): Promise<void> {
  accountMenuOpen.value = false;
  profileDialog.value = "update";
  if (!window.deepwrite?.updates) {
    updateState.value = {
      ...updateState.value,
      status: "unsupported",
      message: "当前环境不支持桌面端更新检查。"
    };
    return;
  }
  try {
    updateState.value = await window.deepwrite.updates.getState();
    if (!["downloading", "downloaded", "installing"].includes(updateState.value.status)) {
      updateState.value = await window.deepwrite.updates.check();
    }
  } catch (error: unknown) {
    uiMessage.error(error instanceof Error ? error.message : "检查更新失败");
  }
}

async function checkUpdate(): Promise<void> {
  try {
    updateState.value = await window.deepwrite!.updates.check();
  } catch (error: unknown) {
    uiMessage.error(error instanceof Error ? error.message : "检查更新失败");
  }
}

async function downloadUpdate(): Promise<void> {
  try {
    updateState.value = await window.deepwrite!.updates.download();
  } catch (error: unknown) {
    uiMessage.error(error instanceof Error ? error.message : "下载更新失败");
  }
}

async function installUpdate(): Promise<void> {
  try {
    await window.deepwrite!.updates.install();
  } catch (error: unknown) {
    if (updateState.value.status !== "error") {
      uiMessage.error(error instanceof Error ? error.message : "启动更新安装失败");
    }
  }
}

function closeProfileDialog(): void {
  if (updateInstalling.value) return;
  profileDialog.value = null;
}

function openSettings(): void {
  accountMenuOpen.value = false;
  emit("openSettings");
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (
    accountMenuOpen.value &&
    event.target instanceof Node &&
    !accountMenuRoot.value?.contains(event.target)
  ) {
    accountMenuOpen.value = false;
  }
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  if (profileDialog.value) {
    closeProfileDialog();
    return;
  }
  accountMenuOpen.value = false;
}

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  document.addEventListener("keydown", handleDocumentKeydown);
  unsubscribeUpdates = window.deepwrite?.updates?.subscribe((state) => {
    updateState.value = state;
    showUpdateError(state);
  });
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
  document.removeEventListener("keydown", handleDocumentKeydown);
  unsubscribeUpdates?.();
});

const primaryModifierLabel = /Mac|iPhone|iPad/u.test(navigator.platform) ? "⌘ N" : "Ctrl N";

const newBookItem = {
  id: "create-book",
  label: "新建书籍",
  icon: "plus",
  shortcut: primaryModifierLabel
} as const;

type PrimaryFeatureId = DialogMode | "agent-teams" | "conversation";

const navItems: Array<{
  id: PrimaryFeatureId;
  label: string;
  icon: "directory" | "model" | "wand" | "brain" | "library" | "message";
}> = [
  { id: "conversation", label: "AI 创作对话", icon: "message" },
  { id: "inkhub-library", label: "我的小说", icon: "library" },
  { id: "directory", label: "工作目录", icon: "directory" },
  { id: "models", label: "模型配置", icon: "model" },
  { id: "agent-teams", label: "智能体团队", icon: "brain" }
];

function loadPinnedResourceIds(): string[] {
  try {
    const stored = localStorage.getItem(PINNED_RESOURCE_STORAGE_KEY);
    if (pinnableResourceNodes(props.sections).length) {
      return parsePinnedResourceIds(stored, props.sections);
    }
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed)
      ? [
          ...new Set(
            parsed.filter((id): id is string => typeof id === "string")
          )
        ]
      : [];
  } catch {
    return [];
  }
}

const moreExpanded = ref(false);
const pinnedResourceIds = ref(loadPinnedResourceIds());
const pinnedResourceNodes = computed(() =>
  collectPinnedResourceNodes(props.sections, pinnedResourceIds.value)
);
const unpinnedSections = computed(() =>
  excludePinnedResourceNodes(props.sections, pinnedResourceIds.value)
);
const resourceDomainsByNodeId = computed(
  () =>
    new Map(
      props.sections.flatMap((section) =>
        flattenResourceNodes(section.nodes).map(
          (node) => [node.id, section.id] as const
        )
      )
    )
);
const moreFeatures: Array<{
  id: "imitation" | "runtime";
  label: string;
  description: string;
  icon: IconName;
}> = [
  { id: "imitation", label: "短篇学习仿写", description: "学习范文并生成同类短篇", icon: "wand" },
  { id: "runtime", label: "运行设置", description: "智能体与工具边界", icon: "model" }
];

function activateMoreFeature(
  id: "imitation" | "runtime"
): void {
  if (id === "imitation") {
    emit("openDialog", "imitation");
    return;
  }
  openSettings();
}

function activateNav(id: "create-book" | PrimaryFeatureId): void {
  if (id === "create-book") {
    emit("createBook");
    return;
  }
  if (id === "conversation") {
    emit("openConversation");
    return;
  }
  if (id === "agent-teams") {
    emit("openAgentTeams");
    return;
  }
  emit("openDialog", id);
}

function toggleResourcePin(node: ResourceTreeNode): void {
  const pinned = pinnedResourceIds.value.includes(node.id);
  pinnedResourceIds.value = pinned
    ? pinnedResourceIds.value.filter((id) => id !== node.id)
    : [...pinnedResourceIds.value, node.id];

  try {
    localStorage.setItem(PINNED_RESOURCE_STORAGE_KEY, JSON.stringify(pinnedResourceIds.value));
  } catch {
    uiMessage.warning("置顶状态暂时无法保存，但本次操作仍然有效");
  }

  uiMessage.success(pinned ? `已取消置顶“${node.label}”` : `已置顶“${node.label}”`);
}

function resourceDomainFor(node: ResourceTreeNode): ResourceDomain {
  return resourceDomainsByNodeId.value.get(node.id) ?? "creation";
}

watch(
  () =>
    pinnableResourceNodes(props.sections).map((node) => node.id),
  (validIds) => {
    const validIdSet = new Set(validIds);
    if (validIdSet.size === 0) {
      return;
    }
    const nextIds = pinnedResourceIds.value.filter((id) => validIdSet.has(id));
    if (nextIds.length === pinnedResourceIds.value.length) {
      return;
    }
    pinnedResourceIds.value = nextIds;
    try {
      localStorage.setItem(PINNED_RESOURCE_STORAGE_KEY, JSON.stringify(nextIds));
    } catch {
      // The in-memory state is still kept in sync when storage is unavailable.
    }
  }
);
</script>

<template>
  <aside class="left-sidebar" aria-label="墨枢导航与资源树">
    <header class="sidebar-brand-row">
      <button class="brand-button" type="button" aria-label="墨枢工作区菜单">
        <span class="brand-mark"><AppIcon name="logo" :size="19" /></span>
        <span class="brand-name">墨枢</span>
      </button>
      <button class="icon-button" type="button" aria-label="收起左侧栏" @click="emit('collapse')">
        <AppIcon name="panel-left" :size="18" />
      </button>
    </header>

    <nav class="primary-nav new-book-nav" aria-label="新建书籍">
      <button
        class="nav-row"
        type="button"
        :data-nav-id="newBookItem.id"
        @click="activateNav(newBookItem.id)"
      >
        <AppIcon :name="newBookItem.icon" :size="17" />
        <span>{{ newBookItem.label }}</span>
        <kbd>{{ newBookItem.shortcut }}</kbd>
      </button>
    </nav>

    <div class="sidebar-scroll">
      <nav class="primary-nav scrollable-primary-nav" aria-label="主要功能">
        <button
          v-for="item in navItems"
          :key="item.id"
          class="nav-row"
          :class="{ 'is-active': item.id === props.activePrimaryFeature }"
          type="button"
          :data-nav-id="item.id"
          :aria-current="item.id === props.activePrimaryFeature ? 'page' : undefined"
          @click="activateNav(item.id)"
        >
          <AppIcon :name="item.icon" :size="17" />
          <span>{{ item.label }}</span>
        </button>

        <button
          class="nav-row more-toggle"
          :class="{ 'is-expanded': moreExpanded }"
          type="button"
          data-nav-id="more"
          :aria-expanded="moreExpanded"
          aria-controls="more-feature-list"
          @click="moreExpanded = !moreExpanded"
        >
          <AppIcon name="more" :size="17" />
          <span>更多功能</span>
          <AppIcon class="more-toggle-chevron" name="chevron" :size="13" />
        </button>

        <div v-if="moreExpanded" id="more-feature-list" class="more-feature-list">
          <button
            v-for="feature in moreFeatures"
            :key="feature.id"
            class="more-feature-row"
            :class="{ 'is-active': feature.id === props.activePrimaryFeature }"
            type="button"
            :data-feature-id="feature.id"
            :title="feature.description"
            :aria-current="feature.id === props.activePrimaryFeature ? 'page' : undefined"
            @click="activateMoreFeature(feature.id)"
          >
            <span class="more-feature-icon"><AppIcon :name="feature.icon" :size="15" /></span>
            <span class="more-feature-copy">
              <strong>{{ feature.label }}</strong>
              <small>{{ feature.description }}</small>
            </span>
            <span
              v-if="feature.id === 'imitation' && props.imitationRunning"
              class="nav-background-status"
              title="学习仿写正在后台运行"
            >
              <i aria-hidden="true" />后台中
            </span>
          </button>
        </div>
      </nav>

      <div class="resource-list">
        <section v-if="pinnedResourceNodes.length" class="resource-section pinned-resource-section">
          <div class="pinned-resource-heading">
            <AppIcon name="pin" :size="15" />
            <span>置顶</span>
          </div>
          <ul class="resource-tree pinned-resource-tree" aria-label="置顶的书籍、技能库和素材库">
            <TreeNodeItem
              v-for="node in pinnedResourceNodes"
              :key="node.id"
              :node="node"
              :depth="0"
              :selected-id="selectedId"
              pinnable
              pinned
              :pinned-ids="pinnedResourceIds"
              :resource-domain="resourceDomainFor(node)"
              :library-entry-clipboard-domain="libraryEntryClipboardDomain"
              :long-tree-actions-disabled="longTreeActionsDisabled"
              @select="emit('selectResource', $event)"
              @toggle-pin="toggleResourcePin"
              @book-action="(mode, book) => emit('bookAction', mode, book)"
              @export-book="emit('exportBook', $event)"
              @long-book-action="emit('longBookAction', $event)"
              @resource-node-action="emit('resourceNodeAction', $event)"
              @move-library-entry="emit('moveLibraryEntry', $event)"
              @create-expert-section="emit('createExpertSection', $event)"
              @create-long-draft-section="emit('createLongDraftSection', $event)"
              @long-draft-section-action="(action, sectionNode) => emit('longDraftSectionAction', action, sectionNode)"
              @create-long-tree-item="emit('createLongTreeItem', $event)"
              @long-tree-item-action="(action, itemNode) => emit('longTreeItemAction', action, itemNode)"
              @remove-expert-section="emit('removeExpertSection', $event)"
              @expert-section-action="(action, sectionNode) => emit('expertSectionAction', action, sectionNode)"
              @create-character-item="emit('createCharacterItem', $event)"
              @character-item-action="(action, itemNode) => emit('characterItemAction', action, itemNode)"
            />
          </ul>
        </section>

        <TreeSection
          v-for="section in unpinnedSections"
          :key="section.id"
          :section="section"
          :selected-id="selectedId"
          :long-tree-actions-disabled="longTreeActionsDisabled"
          :pinned-ids="pinnedResourceIds"
          :library-entry-clipboard-domain="libraryEntryClipboardDomain"
          @select="emit('selectResource', $event)"
          @toggle-pin="toggleResourcePin"
          @book-action="(mode, book) => emit('bookAction', mode, book)"
          @export-book="emit('exportBook', $event)"
          @long-book-action="emit('longBookAction', $event)"
          @resource-action="emit('resourceAction', $event)"
          @resource-node-action="emit('resourceNodeAction', $event)"
          @move-library-entry="emit('moveLibraryEntry', $event)"
          @create-expert-section="emit('createExpertSection', $event)"
          @create-long-draft-section="emit('createLongDraftSection', $event)"
          @long-draft-section-action="(action: 'move-up' | 'move-down' | 'delete', sectionNode: ResourceTreeNode) => emit('longDraftSectionAction', action, sectionNode)"
          @create-long-tree-item="emit('createLongTreeItem', $event)"
          @long-tree-item-action="(action: LongTreeItemAction, itemNode: ResourceTreeNode) => emit('longTreeItemAction', action, itemNode)"
          @remove-expert-section="emit('removeExpertSection', $event)"
          @expert-section-action="(action: 'move-up' | 'move-down', sectionNode: ResourceTreeNode) => emit('expertSectionAction', action, sectionNode)"
          @create-character-item="emit('createCharacterItem', $event)"
          @character-item-action="(action, itemNode) => emit('characterItemAction', action, itemNode)"
        />
      </div>
    </div>

    <footer class="sidebar-footer">
      <div class="account-controls">
        <div ref="accountMenuRoot" class="account-profile">
          <button
            class="account-row account-identity-button"
            type="button"
            aria-haspopup="menu"
            :aria-expanded="accountMenuOpen"
            aria-controls="account-menu"
            @click="toggleAccountMenu"
          >
            <span class="avatar">{{ avatarInitial }}</span>
            <span class="account-copy">
              <strong :title="displayedUserName">{{ displayedUserName }}</strong>
            </span>
          </button>

          <div v-if="accountMenuOpen" id="account-menu" class="account-menu" role="menu">
            <button type="button" role="menuitem" @click="openSettings">
              <AppIcon name="settings" :size="16" />
              <span>设置</span>
            </button>
            <button type="button" role="menuitem" @click="openUpdateDialog">
              <AppIcon name="download" :size="16" />
              <span>版本更新</span>
            </button>
          </div>
        </div>

        <button
          class="icon-button account-settings-button"
          type="button"
          aria-label="打开设置"
          title="设置"
          @click="openSettings"
        >
          <AppIcon name="settings" :size="16" />
        </button>
      </div>
    </footer>
  </aside>

  <Teleport to="body">
    <div
      v-if="profileDialog === 'update'"
      class="dialog-backdrop"
      @mousedown.self="closeProfileDialog"
    >
      <section
        class="workspace-dialog profile-dialog update-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="version-update-dialog-title"
      >
        <header>
          <div>
            <span class="dialog-eyebrow">墨枢</span>
            <h2 id="version-update-dialog-title">版本更新</h2>
          </div>
          <button
            class="dialog-close"
            type="button"
            aria-label="关闭"
            :disabled="updateInstalling"
            @click="closeProfileDialog"
          >
            ×
          </button>
        </header>

        <div class="dialog-content update-dialog-content">
          <div class="update-version-summary">
            <div>
              <span>当前版本</span>
              <strong>v{{ updateState.currentVersion }}</strong>
            </div>
            <div v-if="updateState.latestVersion">
              <span>最新版本</span>
              <strong>v{{ updateState.latestVersion }}</strong>
            </div>
            <span v-if="updateState.mandatory" class="update-required-badge">重要更新</span>
          </div>

          <div v-if="updateChecking" class="update-checking" aria-live="polite">
            <span class="update-spinner" aria-hidden="true" />
            <span>正在检查更新…</span>
          </div>

          <div v-else-if="updateInstalling" class="update-checking" aria-live="assertive">
            <span class="update-spinner" aria-hidden="true" />
            <span>正在安全退出并准备安装…</span>
          </div>

          <template v-else>
            <div v-if="updateState.title" class="update-release-copy">
              <strong>{{ updateState.title }}</strong>
              <ul v-if="updateState.releaseNotes.length">
                <li v-for="note in updateState.releaseNotes" :key="note">{{ note }}</li>
              </ul>
            </div>

            <div v-if="updateDownloading" class="update-progress" aria-live="polite">
              <div class="update-progress-heading">
                <span>正在后台下载</span>
                <strong>{{ updateProgressLabel }}</strong>
              </div>
              <div class="update-progress-track" role="progressbar" :aria-valuenow="updateState.percent ?? 0">
                <span :style="{ width: `${updateState.percent ?? 0}%` }" />
              </div>
              <small>
                {{ formatBytes(updateState.transferred) }} / {{ formatBytes(updateState.total) }}
                <template v-if="updateState.bytesPerSecond">
                  · {{ formatBytes(updateState.bytesPerSecond) }}/s
                </template>
              </small>
            </div>

            <p v-if="updateState.message && updateState.status !== 'error'" class="update-status-message" :data-status="updateState.status">
              {{ updateState.message }}
            </p>
          </template>

          <div class="dialog-actions">
            <button
              v-if="updateState.status === 'error' || updateState.status === 'not-available' || updateState.status === 'unsupported'"
              class="dialog-secondary-button"
              type="button"
              :disabled="updateChecking"
              @click="checkUpdate"
            >
              重新检查
            </button>
            <button
              v-if="updateState.canDownload"
              class="dialog-primary-button"
              type="button"
              @click="downloadUpdate"
            >
              后台下载更新
            </button>
            <button
              v-else-if="updateState.canInstall"
              class="dialog-primary-button"
              type="button"
              @click="installUpdate"
            >
              {{ updateState.status === "error" ? "重试安装" : "重启并安装" }}
            </button>
            <button
              v-else-if="updateInstalling"
              class="dialog-primary-button"
              type="button"
              disabled
            >
              正在安装…
            </button>
            <button
              v-else-if="!updateChecking && !updateDownloading && !updateInstalling"
              class="dialog-primary-button"
              type="button"
              @click="closeProfileDialog"
            >
              关闭
            </button>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>
