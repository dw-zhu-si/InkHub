import { describe, expect, it } from "vitest";
import {
  formatLoadSkillToolResult,
  normalizeLoadSkillName,
  resolveAttachedSkill,
  skillEntryShortName,
  skillLibraryTitle,
  type LoadSkillCandidate
} from "./resolve-attached-skill";

const skills: LoadSkillCandidate[] = [
  {
    id: "skill:lib-plot:entry-1",
    title: "剧情设计技能库 · 三幕式因果",
    content: "三幕正文",
    kind: "plot"
  },
  {
    id: "skill:lib-plot:entry-2",
    title: "剧情设计技能库 · 反转节点",
    content: "反转正文",
    kind: "plot"
  },
  {
    id: "skill:lib-style:entry-1",
    title: "文风技能 · 文风执行",
    content: "文风正文",
    kind: "style"
  },
  {
    id: "skill:lib-general:entry-1",
    title: "通用方法 · 访谈提纲",
    content: "访谈正文",
    kind: "general"
  }
];

const readableKinds = new Set(["general", "plot", "other"]);
const isReadable = (item: LoadSkillCandidate) =>
  item.kind !== undefined && readableKinds.has(item.kind);

describe("resolveAttachedSkill", () => {
  it("matches full title, entry short name, and strips trailing kind tags", () => {
    expect(skillEntryShortName("剧情设计技能库 · 三幕式因果")).toBe("三幕式因果");
    expect(skillLibraryTitle("剧情设计技能库 · 三幕式因果")).toBe("剧情设计技能库");
    expect(normalizeLoadSkillName("三幕式因果 [plot]")).toBe("三幕式因果");

    const byTitle = resolveAttachedSkill("剧情设计技能库 · 三幕式因果", skills, isReadable);
    expect(byTitle).toMatchObject({
      status: "found",
      skill: { title: "剧情设计技能库 · 三幕式因果" }
    });

    const byShort = resolveAttachedSkill("三幕式因果", skills, isReadable);
    expect(byShort).toMatchObject({
      status: "found",
      skill: { content: "三幕正文" }
    });

    const byTagged = resolveAttachedSkill("三幕式因果 [plot]", skills, isReadable);
    expect(byTagged).toMatchObject({ status: "found", skill: { content: "三幕正文" } });
  });

  it("matches unique library-title fuzzy queries like 剧情设计", () => {
    const singlePlot: LoadSkillCandidate[] = [
      skills[0]!,
      skills[2]!,
      skills[3]!
    ];
    const result = resolveAttachedSkill("剧情设计", singlePlot, isReadable);
    expect(result).toMatchObject({
      status: "found",
      skill: { title: "剧情设计技能库 · 三幕式因果" }
    });
  });

  it("returns ambiguous candidates when short or fuzzy name hits multiple skills", () => {
    const result = resolveAttachedSkill("剧情设计", skills, isReadable);
    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") return;
    expect(result.matches.map((item) => item.title)).toEqual([
      "剧情设计技能库 · 三幕式因果",
      "剧情设计技能库 · 反转节点"
    ]);
  });

  it("reports out-of-scope when title exists but kind is not readable", () => {
    const result = resolveAttachedSkill("文风执行", skills, isReadable);
    expect(result.status).toBe("out_of_scope");
    if (result.status !== "out_of_scope") return;
    expect(result.matches[0]?.title).toBe("文风技能 · 文风执行");

    const text = formatLoadSkillToolResult("文风执行", result, skills.filter(isReadable));
    expect(text).toContain("不在当前智能体读取范围内");
    expect(text).toContain("三幕式因果");
    expect(text).not.toContain("文风正文");
  });

  it("lists readable skills when nothing matches", () => {
    const result = resolveAttachedSkill("不存在的技能", skills, isReadable);
    expect(result.status).toBe("not_found");
    const text = formatLoadSkillToolResult("不存在的技能", result, skills.filter(isReadable));
    expect(text).toContain("没有找到可读取的同名已附加技能");
    expect(text).toContain("短名：访谈提纲");
    expect(text).not.toContain("文风执行");
  });
});
