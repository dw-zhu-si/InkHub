import { describe, expect, it, vi } from "vitest";
import {
  INKHUB_DEEP_QUALITY_DOMAINS,
  InkHubDeepQualityService,
  type InkHubDeepQualityExecutorInput
} from "./inkhub-deep-quality-service";

const chapters = [
  {
    chapterId: "volume-one-chapter-one",
    chapterTitle: "第1章",
    volumeTitle: "第一卷",
    relativePath: "第一卷/第1章.md",
    ordinal: 1,
    sourceRevision: "a".repeat(64),
    content: "沈砚在雨夜抵达河州。"
  },
  {
    chapterId: "volume-one-chapter-two",
    chapterTitle: "第2章",
    volumeTitle: "第一卷",
    relativePath: "第一卷/第2章.md",
    ordinal: 2,
    sourceRevision: "b".repeat(64),
    content: "第二日，沈砚离开河州。"
  },
  {
    chapterId: "volume-two-chapter-one",
    chapterTitle: "第1章",
    volumeTitle: "第二卷",
    relativePath: "第二卷/第1章.md",
    ordinal: 3,
    sourceRevision: "c".repeat(64),
    content: "三年后，沈砚再次来到河州。"
  }
] as const;

describe("InkHubDeepQualityService", () => {
  it("orchestrates all seven audit domains without mixing volumes", async () => {
    const calls: InkHubDeepQualityExecutorInput[] = [];
    const service = new InkHubDeepQualityService({
      now: () => new Date("2026-08-28T08:00:00.000Z"),
      executor: {
        async execute(input) {
          calls.push(input);
          const chapter = input.chapters[0]!;
          return {
            content: JSON.stringify({
              findings: [{
                severity: "warning",
                title: `${input.domain} 检查项`,
                detail: "存在需要作者复核的连续性迹象。",
                evidence: [{
                  chapterId: chapter.chapterId,
                  startOffset: 0,
                  endOffset: 2,
                  excerpt: chapter.content.slice(0, 2)
                }],
                repairInstruction: "以正文证据为准做最小修订。"
              }]
            })
          };
        }
      }
    });

    const report = await service.audit({ entryId: "novel-one", chapters });

    expect(report.version).toBe(1);
    expect(report.generatedAt).toBe("2026-08-28T08:00:00.000Z");
    expect(report.coverage.map(({ domain }) => domain)).toEqual([
      ...INKHUB_DEEP_QUALITY_DOMAINS
    ]);
    expect(new Set(report.findings.map(({ domain }) => domain))).toEqual(
      new Set(INKHUB_DEEP_QUALITY_DOMAINS)
    );
    expect(report.findings.every(({ evidence, severity, agents, skills }) =>
      evidence.length > 0 && severity === "warning" && agents.length > 0 && skills.length > 0
    )).toBe(true);
    expect(report.findings[0]?.evidence[0]).toMatchObject({
      ordinal: 1,
      sourceRevision: "a".repeat(64)
    });
    expect(calls).toHaveLength(INKHUB_DEEP_QUALITY_DOMAINS.length * 2);
    expect(calls.every(({ chapters: auditChapters }) =>
      new Set(auditChapters.map(({ volumeTitle }) => volumeTitle)).size === 1
    )).toBe(true);
  });

  it("produces stable finding ids and removes duplicates from overlapping windows", async () => {
    const overlapChapters = [
      ...chapters.slice(0, 2),
      {
        chapterId: "volume-one-chapter-three",
        chapterTitle: "第3章",
        volumeTitle: "第一卷",
        relativePath: "第一卷/第3章.md",
        ordinal: 3,
        sourceRevision: "d".repeat(64),
        content: "第三日，沈砚返回河州。"
      }
    ];
    const executor = {
      execute: vi.fn(async (input: InkHubDeepQualityExecutorInput) => ({
        content: JSON.stringify({
          findings: input.domain === "timeline" && input.chapters.some(({ chapterId }) => chapterId === "volume-one-chapter-two") ? [{
            severity: "error",
            title: "时间跳跃缺少过渡",
            detail: "叙事从当夜直接跳到第二日。",
            evidence: [{
              chapterId: "volume-one-chapter-two",
              startOffset: 0,
              endOffset: 3,
              excerpt: "第二日"
            }]
          }] : []
        })
      }))
    };
    const options = {
      executor,
      now: () => new Date("2026-08-28T08:00:00.000Z"),
      maxChaptersPerWindow: 2
    };

    const first = await new InkHubDeepQualityService(options).audit({ entryId: "novel-one", chapters: overlapChapters });
    const second = await new InkHubDeepQualityService(options).audit({ entryId: "novel-one", chapters: overlapChapters });

    expect(first.findings).toHaveLength(1);
    expect(first.findings[0]?.id).toMatch(/^deep-quality-[a-f0-9]{24}$/u);
    expect(second.findings[0]?.id).toBe(first.findings[0]?.id);
  });

  it("rejects model findings whose evidence does not match the source text", async () => {
    const service = new InkHubDeepQualityService({
      executor: {
        async execute(input) {
          const chapter = input.chapters[0]!;
          return {
            content: JSON.stringify({
              findings: [{
                severity: "warning",
                title: "无效证据",
                detail: "模型给出了不存在的引文。",
                evidence: [{
                  chapterId: chapter.chapterId,
                  startOffset: 0,
                  endOffset: 2,
                  excerpt: "不存在"
                }]
              }]
            })
          };
        }
      }
    });

    await expect(service.audit({ entryId: "novel-one", chapters: chapters.slice(0, 1) }))
      .rejects.toThrow("证据与章节原文不一致");
  });

  it("preserves significant whitespace in exact source evidence", async () => {
    const whitespaceChapter = {
      ...chapters[0],
      content: " 沈砚在雨夜抵达河州。"
    };
    const service = new InkHubDeepQualityService({
      executor: {
        async execute(input) {
          const chapter = input.chapters[0]!;
          return {
            content: JSON.stringify({
              findings: input.domain === "style" ? [{
                severity: "info",
                title: "段首空格",
                detail: "段首包含一个空格。",
                evidence: [{
                  chapterId: chapter.chapterId,
                  startOffset: 0,
                  endOffset: 2,
                  excerpt: " 沈"
                }]
              }] : []
            })
          };
        }
      }
    });

    const report = await service.audit({ entryId: "novel-one", chapters: [whitespaceChapter] });

    expect(report.findings[0]?.evidence[0]?.excerpt).toBe(" 沈");
  });
});
