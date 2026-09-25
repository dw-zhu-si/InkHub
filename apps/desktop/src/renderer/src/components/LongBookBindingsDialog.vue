<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import type {
  LinkedMaterialIdsByKind,
  LinkedSkillIdsByKind,
  MaterialKind,
  MaterialLibrary,
  SkillKind,
  SkillLibrary
} from "@deepwrite/contracts";
import AppIcon from "./AppIcon.vue";
import PopupSelect from "./PopupSelect.vue";

type LongBindingDomain = "skill" | "material";

const props = withDefaults(
  defineProps<{
    mode: LongBindingDomain | null;
    bookTitle: string;
    materials?: readonly MaterialLibrary[];
    skills?: readonly SkillLibrary[];
    linkedMaterialIdsByKind: LinkedMaterialIdsByKind;
    linkedSkillIdsByKind: LinkedSkillIdsByKind;
    submitting?: boolean;
  }>(),
  {
    materials: () => [],
    skills: () => [],
    submitting: false
  }
);

const emit = defineEmits<{
  close: [];
  submit: [
    payload: {
      linkedMaterialIdsByKind: LinkedMaterialIdsByKind;
      linkedSkillIdsByKind: LinkedSkillIdsByKind;
    }
  ];
}>();

const materialKinds: ReadonlyArray<{
  id: MaterialKind;
  label: string;
  description: string;
}> = [
  { id: "character", label: "人设素材库", description: "人物与关系设定" },
  { id: "gimmick", label: "梗素材库", description: "核心创意与钩子" },
  { id: "plot", label: "剧情素材库", description: "剧情、导语与细化" },
  { id: "draft", label: "正文素材库", description: "正文片段与表达参考" },
  { id: "other", label: "其他素材库", description: "未归入以上分类的素材" }
];
const skillKinds: ReadonlyArray<{
  id: SkillKind;
  label: string;
  description: string;
}> = [
  { id: "general", label: "通用技能库", description: "多个阶段均可使用" },
  { id: "plot", label: "剧情设计技能库", description: "人物、剧情与大纲方法" },
  { id: "style", label: "文风写作技能库", description: "正文与章节写作方法" },
  { id: "other", label: "其他技能库", description: "自定义写作方法" }
];

const selectedMaterials = reactive<Record<MaterialKind, string[]>>({
  character: [],
  gimmick: [],
  plot: [],
  draft: [],
  other: []
});
const selectedSkills = reactive<Record<SkillKind, string[]>>({
  general: [],
  plot: [],
  style: [],
  other: []
});
const materialCandidates = reactive<Record<MaterialKind, string>>({
  character: "",
  gimmick: "",
  plot: "",
  draft: "",
  other: ""
});
const skillCandidates = reactive<Record<SkillKind, string>>({
  general: "",
  plot: "",
  style: "",
  other: ""
});
const dialog = ref<HTMLElement | null>(null);

const title = computed(() =>
  props.mode === "skill" ? "技能库绑定" : "素材库绑定"
);
const heading = computed(() =>
  props.mode === "skill" ? "绑定技能库" : "关联素材库"
);
const description = computed(() =>
  props.mode === "skill"
    ? "智能体只会按当前阶段和读取范围加载已绑定技能；每类可绑定多个技能库。"
    : "按用途关联当前长篇使用的素材库；每类可关联多个素材库。"
);

function materialOptions(kind: MaterialKind): Array<{
  value: string;
  label: string;
}> {
  const selected = new Set(selectedMaterials[kind]);
  return [
    { value: "", label: "添加一个素材库…" },
    ...props.materials
      .filter(
        (library) =>
          (library.materialKind === kind || library.materialKind === "mixed") &&
          !selected.has(library.id)
      )
      .map((library) => ({
        value: library.id,
        label: library.title
      }))
  ];
}

function skillOptions(kind: SkillKind): Array<{
  value: string;
  label: string;
}> {
  const selected = new Set(selectedSkills[kind]);
  return [
    { value: "", label: "添加一个技能库…" },
    ...props.skills
      .filter(
        (library) =>
          library.skillKind === kind &&
          !selected.has(library.id)
      )
      .map((library) => ({
        value: library.id,
        label: library.isBuiltin ? `${library.title} · 官方` : library.title
      }))
  ];
}

function reset(): void {
  for (const { id } of materialKinds) {
    selectedMaterials[id] = [...props.linkedMaterialIdsByKind[id]];
    materialCandidates[id] = "";
  }
  for (const { id } of skillKinds) {
    selectedSkills[id] = [...props.linkedSkillIdsByKind[id]];
    skillCandidates[id] = "";
  }
}

function selectedMaterialLinks(): LinkedMaterialIdsByKind {
  return Object.fromEntries(
    materialKinds.map(({ id }) => [id, [...selectedMaterials[id]]])
  ) as LinkedMaterialIdsByKind;
}

function selectedSkillLinks(): LinkedSkillIdsByKind {
  return Object.fromEntries(
    skillKinds.map(({ id }) => [id, [...selectedSkills[id]]])
  ) as LinkedSkillIdsByKind;
}

function addMaterial(kind: MaterialKind, value: unknown): void {
  const id = String(value ?? "").trim();
  materialCandidates[kind] = "";
  if (!id || selectedMaterials[kind].includes(id)) return;
  selectedMaterials[kind] = [...selectedMaterials[kind], id];
}

function addSkill(kind: SkillKind, value: unknown): void {
  const id = String(value ?? "").trim();
  skillCandidates[kind] = "";
  if (!id || selectedSkills[kind].includes(id)) return;
  selectedSkills[kind] = [...selectedSkills[kind], id];
}

function materialLabel(id: string): string {
  return (
    props.materials.find((candidate) => candidate.id === id)?.title ??
    `${id} · Catalog 中缺失`
  );
}

function skillLabel(id: string): string {
  const library = props.skills.find((candidate) => candidate.id === id);
  if (!library) return `${id} · Catalog 中缺失`;
  return library.isBuiltin ? `${library.title} · 官方` : library.title;
}

function requestClose(): void {
  if (!props.submitting) emit("close");
}

function submit(): void {
  emit("submit", {
    linkedMaterialIdsByKind: selectedMaterialLinks(),
    linkedSkillIdsByKind: selectedSkillLinks()
  });
}

function handleKeydown(event: KeyboardEvent): void {
  if (props.mode && event.key === "Escape") requestClose();
}

watch(
  () => props.mode,
  (mode) => {
    if (!mode) return;
    reset();
    void nextTick(() => dialog.value?.focus());
  },
  { immediate: true }
);
onMounted(() => document.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <Teleport to="body">
    <div
      v-if="mode"
      class="dialog-backdrop"
      @mousedown.self="requestClose"
    >
      <section
        ref="dialog"
        class="workspace-dialog book-binding-dialog long-binding-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`long-binding-title-${mode}`"
        tabindex="-1"
      >
        <header>
          <div>
            <span class="dialog-eyebrow">{{ bookTitle }}</span>
            <h2 :id="`long-binding-title-${mode}`">{{ title }}</h2>
          </div>
          <button
            class="dialog-close"
            type="button"
            aria-label="关闭"
            :disabled="submitting"
            @click="requestClose"
          >
            ×
          </button>
        </header>

        <form
          class="dialog-content create-short-book-form"
          @submit.prevent="submit"
        >
          <section
            class="create-short-binding-panel"
            :aria-labelledby="`long-binding-heading-${mode}`"
          >
            <div class="create-short-binding-heading">
              <span class="create-short-binding-icon">
                <AppIcon :name="mode === 'skill' ? 'library' : 'archive'" :size="17" />
              </span>
              <div>
                <h3 :id="`long-binding-heading-${mode}`">{{ heading }}</h3>
                <p>{{ description }}</p>
              </div>
            </div>

            <div v-if="mode === 'material'" class="create-short-kind-grid">
              <div
                v-for="kind in materialKinds"
                :key="kind.id"
                class="create-short-kind-field long-binding-kind-field"
              >
                <span>
                  <strong>{{ kind.label }}</strong>
                  <small>{{ kind.description }}</small>
                </span>
                <div v-if="selectedMaterials[kind.id].length" class="long-binding-chips">
                  <span
                    v-for="id in selectedMaterials[kind.id]"
                    :key="id"
                    class="long-binding-chip"
                  >
                    {{ materialLabel(id) }}
                    <button
                      type="button"
                      :aria-label="`解除${kind.label}绑定：${materialLabel(id)}`"
                      :disabled="submitting"
                      @click="
                        selectedMaterials[kind.id] =
                          selectedMaterials[kind.id].filter(
                            (candidate) => candidate !== id
                          )
                      "
                    >
                      ×
                    </button>
                  </span>
                </div>
                <small v-else class="long-binding-empty">当前未关联</small>
                <PopupSelect
                  :model-value="materialCandidates[kind.id]"
                  :options="materialOptions(kind.id)"
                  :accessible-label="`添加${kind.label}`"
                  size="large"
                  :disabled="submitting || materialOptions(kind.id).length <= 1"
                  :menu-min-width="260"
                  :menu-z-index="230"
                  @update:model-value="addMaterial(kind.id, $event)"
                />
              </div>
            </div>

            <div v-else class="create-short-kind-grid">
              <div
                v-for="kind in skillKinds"
                :key="kind.id"
                class="create-short-kind-field long-binding-kind-field"
              >
                <span>
                  <strong>{{ kind.label }}</strong>
                  <small>{{ kind.description }}</small>
                </span>
                <div v-if="selectedSkills[kind.id].length" class="long-binding-chips">
                  <span
                    v-for="id in selectedSkills[kind.id]"
                    :key="id"
                    class="long-binding-chip"
                  >
                    {{ skillLabel(id) }}
                    <button
                      type="button"
                      :aria-label="`解除${kind.label}绑定：${skillLabel(id)}`"
                      :disabled="submitting"
                      @click="
                        selectedSkills[kind.id] =
                          selectedSkills[kind.id].filter(
                            (candidate) => candidate !== id
                          )
                      "
                    >
                      ×
                    </button>
                  </span>
                </div>
                <small v-else class="long-binding-empty">当前未绑定</small>
                <PopupSelect
                  :model-value="skillCandidates[kind.id]"
                  :options="skillOptions(kind.id)"
                  :accessible-label="`添加${kind.label}`"
                  size="large"
                  :disabled="submitting || skillOptions(kind.id).length <= 1"
                  :menu-min-width="260"
                  :menu-z-index="230"
                  @update:model-value="addSkill(kind.id, $event)"
                />
              </div>
            </div>
            <p class="create-short-stable-hint">
              Catalog 中暂时缺失的已有绑定仍会保留，只有点击移除才会解除已有绑定。
            </p>
          </section>

          <div class="dialog-actions create-short-book-actions">
            <button
              class="dialog-secondary-button"
              type="button"
              :disabled="submitting"
              @click="requestClose"
            >
              取消
            </button>
            <button
              class="dialog-primary-button"
              type="submit"
              :disabled="submitting"
            >
              {{ submitting ? "保存中…" : "保存绑定" }}
            </button>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.long-binding-dialog {
  max-height: min(820px, calc(100vh - 40px));
}

.long-binding-dialog .dialog-content {
  overflow-y: auto;
}

.long-binding-kind-field {
  align-content: start;
}

.long-binding-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.long-binding-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 4px 6px 4px 8px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 999px;
  background: var(--surface-main);
  color: var(--text-secondary);
  font-size: 0.714286rem;
  overflow-wrap: anywhere;
}

.long-binding-chip button {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--surface-hover);
  color: var(--text-tertiary);
}

.long-binding-empty {
  color: var(--text-tertiary);
  font-size: 0.714286rem;
}

@media (max-width: 640px) {
  .long-binding-dialog {
    width: min(100vw - 24px, 760px);
  }

  .long-binding-dialog .create-short-kind-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
