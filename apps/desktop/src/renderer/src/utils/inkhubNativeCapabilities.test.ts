import {
  CatalogSnapshotSchema,
  DEFAULT_AGENT_TEAM_SETTINGS,
  DEFAULT_LONG_AGENT_TEAM_SETTINGS
} from "@deepwrite/contracts";
import { describe, expect, it } from "vitest";
import {
  INKHUB_NATIVE_AGENTS,
  INKHUB_COVER_LIBRARY_TITLE,
  INKHUB_PLOT_LIBRARY_TITLE,
  INKHUB_SKILL_LIBRARY_TITLE,
  INKHUB_STORY_KERNEL_LIBRARY_TITLE,
  INKHUB_STYLE_LIBRARY_TITLE,
  bundledInkHubStoryKernelAttachments,
  bundledInkHubStylePresetAttachments,
  inkHubStoryKernelAttachments,
  inkHubStylePresetAttachments,
  mergeLongAgents,
  mergeWorkspaceAgents
} from "./inkhubNativeCapabilities";
import { INKHUB_COVER_SKILLS, renderInkHubCoverSkill } from "./inkhubCoverSkills";
import { INKHUB_STORY_KERNEL_SKILLS, renderInkHubStoryKernelSkill } from "./inkhubStoryKernelSkills";
import { INKHUB_STYLE_PRESETS, renderInkHubStylePresetSkill } from "./inkhubStylePresets";
import installerSource from "./inkhubNativeCapabilities.ts?raw";
import workspaceSource from "../WorkspaceShell.vue?raw";
import conversationSource from "../composables/useAgentConversation.ts?raw";

const NOW = "2026-08-17T08:00:00.000Z";

describe("InkHub native capabilities", () => {
  it("defines thirteen executable, inherited-model expert agents", () => {
    expect(INKHUB_NATIVE_AGENTS).toHaveLength(13);
    expect(new Set(INKHUB_NATIVE_AGENTS.map((agent) => agent.id)).size).toBe(13);
    expect(INKHUB_NATIVE_AGENTS.every((agent) => agent.enabled)).toBe(true);
    expect(INKHUB_NATIVE_AGENTS.every((agent) => agent.modelMode === "inherit")).toBe(true);
    expect(INKHUB_NATIVE_AGENTS.every((agent) => agent.systemPrompt.length > 40)).toBe(true);
  });

  it("uses a dedicated native skill library instead of a decorative registry", () => {
    expect(INKHUB_SKILL_LIBRARY_TITLE).toContain("本机小说 Skills");
    expect(INKHUB_PLOT_LIBRARY_TITLE).toContain("剧情设计 Skills");
    expect(INKHUB_STORY_KERNEL_LIBRARY_TITLE).toContain("全书创作内核 Skills");
    expect(INKHUB_COVER_LIBRARY_TITLE).toContain("小说封面 Skills");
    expect(installerSource).toContain('skillKind: "plot"');
    expect(installerSource).toContain("INKHUB_STORY_KERNEL_SKILLS");
    expect(installerSource).toContain('skillKind: "other"');
    expect(installerSource).toContain("INKHUB_COVER_SKILLS");
  });

  it("installs capabilities during desktop startup and de-duplicates concurrent startup calls", () => {
    expect(workspaceSource).toContain("await ensureInkHubCapabilities(window.deepwrite)");
    expect(installerSource).toContain("capabilityInstallPromise ??=");
    expect(installerSource).toContain("await api.inkHub!.installSkills()");
  });

  it("uses provenance and full agent fingerprints instead of trusting title or id collisions", () => {
    expect(installerSource).toContain("entry.body.includes(nativeSkillProvenance(skill))");
    expect(installerSource).toContain("entryId: existing.id");
    expect(installerSource).toContain("agent.systemPrompt === expected.systemPrompt");
    expect(installerSource).toContain("agent.modelMode === expected.modelMode");
  });

  it("preserves user overrides on an existing native workspace agent", () => {
    const userAgent = {
      ...INKHUB_NATIVE_AGENTS.find((agent) => agent.id === "inkhub_narratologist")!,
      systemPrompt: "用户自定义的叙事审阅提示词。",
      enabled: false,
      modelMode: "custom" as const,
      modelId: "user-selected-model",
      thinkingLevel: "medium" as const
    };
    const settings = structuredClone(DEFAULT_AGENT_TEAM_SETTINGS);
    settings.teams.find((team) => team.parentAgentId === "plot_design")!
      .subagents.push(userAgent);

    const merged = mergeWorkspaceAgents(settings);

    expect(
      merged.value.teams
        .find((team) => team.parentAgentId === "plot_design")!
        .subagents.find((agent) => agent.id === userAgent.id)
    ).toEqual(userAgent);
  });

  it("does not restore a removed workspace native agent after the team was seeded", () => {
    const initial = mergeWorkspaceAgents(structuredClone(DEFAULT_AGENT_TEAM_SETTINGS));
    const plotTeam = initial.value.teams.find(
      (team) => team.parentAgentId === "plot_design"
    )!;
    plotTeam.subagents = plotTeam.subagents.filter(
      (agent) => agent.id !== "inkhub_narratologist"
    );

    const mergedAgain = mergeWorkspaceAgents(initial.value);

    expect(
      mergedAgain.value.teams
        .find((team) => team.parentAgentId === "plot_design")!
        .subagents.some((agent) => agent.id === "inkhub_narratologist")
    ).toBe(false);
    expect(mergedAgain.added).toBe(0);
  });

  it("preserves user overrides on existing long-workspace native agents", () => {
    const userAgent = {
      ...INKHUB_NATIVE_AGENTS.find((agent) => agent.id === "inkhub_psychologist")!,
      systemPrompt: "仅核对人物动机，不自动改写。",
      enabled: false
    };
    const settings = structuredClone(DEFAULT_LONG_AGENT_TEAM_SETTINGS);
    settings.teams.find((team) => team.parentAgentId === "setting")!
      .subagents.push(userAgent);

    const merged = mergeLongAgents(settings);

    expect(
      merged.value.teams
        .find((team) => team.parentAgentId === "setting")!
        .subagents.find((agent) => agent.id === userAgent.id)
    ).toEqual(userAgent);
  });

  it("makes all verified clean-room style presets available to load_skill", () => {
    const catalog = CatalogSnapshotSchema.parse({
      schemaVersion: 1,
      revision: 1,
      updatedAt: NOW,
      books: [],
      materials: [],
      materialGroups: [],
      skills: [{
        id: "inkhub-style-library",
        title: INKHUB_STYLE_LIBRARY_TITLE,
        skillType: "short",
        skillKind: "style",
        overview: "",
        isBuiltin: false,
        entries: INKHUB_STYLE_PRESETS.map((style) => ({
          id: style.id,
          stageId: "draft",
          title: `[文风预设] ${style.title}`,
          body: renderInkHubStylePresetSkill(style),
          createdAt: NOW,
          updatedAt: NOW
        })),
        createdAt: NOW,
        updatedAt: NOW
      }],
      skillGroups: []
    });
    const attached = inkHubStylePresetAttachments(catalog);
    expect(attached).toHaveLength(20);
    expect(attached.every((skill) => skill.kind === "style" && skill.source === "attached-skill")).toBe(true);
    expect(bundledInkHubStylePresetAttachments()).toEqual(attached);
    expect(conversationSource).toContain("...inkHubStyleSkills");
    expect(conversationSource).toContain("...inkHubStoryKernelSkills");
  });

  it("installs the ten project-owned story-kernel Skills as exact standard definitions", () => {
    const catalog = CatalogSnapshotSchema.parse({
      schemaVersion: 1,
      revision: 1,
      updatedAt: NOW,
      books: [],
      materials: [],
      materialGroups: [],
      skills: [{
        id: "inkhub-story-kernel-library",
        title: INKHUB_STORY_KERNEL_LIBRARY_TITLE,
        skillType: "short",
        skillKind: "general",
        overview: "",
        isBuiltin: false,
        entries: INKHUB_STORY_KERNEL_SKILLS.map((skill) => ({
          id: skill.id,
          stageId: "draft",
          title: `[创作内核] ${skill.title}`,
          body: renderInkHubStoryKernelSkill(skill),
          createdAt: NOW,
          updatedAt: NOW
        })),
        createdAt: NOW,
        updatedAt: NOW
      }],
      skillGroups: []
    });

    const attached = inkHubStoryKernelAttachments(catalog);
    expect(attached).toHaveLength(10);
    expect(attached.every((skill) => skill.kind === "general" && skill.source === "attached-skill")).toBe(true);
    expect(bundledInkHubStoryKernelAttachments()).toEqual(attached);
  });

  it("bundles one project-owned cover Skill without upstream executable content", () => {
    expect(INKHUB_COVER_SKILLS).toHaveLength(1);
    const rendered = renderInkHubCoverSkill(INKHUB_COVER_SKILLS[0]!);
    expect(rendered).toContain("upstream-content-copied:false");
    expect(rendered).toContain("external-execution:false");
    expect(rendered).toContain("本机 ModelHub");
  });
});
