export interface InkHubPlotSkill {
  id: string;
  title: string;
  description: string;
  focus: string;
  sourceLabel: string;
  sourceUrl: string;
  sourceRef: string;
  license: "MIT" | "Apache-2.0";
  workflow: readonly string[];
  output: readonly string[];
}

const STORY_SKILLS_REF = "c482d48f4eb9b488f033a77a51f9fae55cc0d75f";
const CREATIVE_WRITING_REF = "fd7a3ad9cd7697a0645ff6ff4bd5e809cf7673a3";
const WEBNOVEL_SKILLS_REF = "0986c4882137d7d350700f3d13617ebec9889dd1";

export const INKHUB_PLOT_SKILLS: readonly InkHubPlotSkill[] = [
  {
    id: "premise-reader-promise",
    title: "故事立项与读者承诺",
    description: "把模糊灵感变成可验证的核心命题、主角目标、阻力、代价与读者承诺。",
    focus: "选题 · 核心冲突 · 读者预期",
    sourceLabel: "ai-novel-writing-skills 方法研究",
    sourceUrl: "https://github.com/imerzzhu/ai-novel-writing-skills",
    sourceRef: WEBNOVEL_SKILLS_REF,
    license: "MIT",
    workflow: [
      "只使用作者给出的题材、受众、禁区和已有正文，先区分已确定事实与待选择假设。",
      "用一句话写清主角、目标、阻力、失败代价和故事独有变化，不用流行作品名称代替定义。",
      "给出三条机制不同的候选方向，并逐条说明新鲜度、展开空间和潜在风险。",
      "为选中方向定义开篇兑现、阶段兑现和结局兑现，避免承诺与实际类型错位。",
      "列出需要作者决定的最多三个关键分歧；未获选择时不擅自固化为设定。"
    ],
    output: ["一句话核心命题", "读者承诺表", "三案比较", "待决策清单"]
  },
  {
    id: "volume-arc-architecture",
    title: "分卷架构与卷弧设计",
    description: "按卷拆分全书主线，让每卷拥有独立目标、升级、高潮、结算与跨卷牵引。",
    focus: "分卷 · 升级阶梯 · 跨卷连续性",
    sourceLabel: "ai-novel-writing-skills 分卷方法研究",
    sourceUrl: "https://github.com/imerzzhu/ai-novel-writing-skills",
    sourceRef: WEBNOVEL_SKILLS_REF,
    license: "MIT",
    workflow: [
      "先锁定全书起点、终局和不可逆转折，再确定每卷结束时世界与人物必须发生的状态变化。",
      "每卷分别定义表层目标、深层命题、主要对手、代价升级、高潮选择和卷末结算。",
      "卷内冲突必须升级，卷间冲突必须换挡；禁止只换地图而重复同一问题。",
      "记录每卷新埋、推进、误导、回收的伏笔，以及跨卷仍未关闭的承诺。",
      "检查相邻卷的因果桥：上一卷结算必须直接制造下一卷的新局面。"
    ],
    output: ["全书卷表", "每卷状态变化", "跨卷因果桥", "伏笔迁移表"]
  },
  {
    id: "plot-arc-and-turns",
    title: "剧情弧与关键转折",
    description: "设计由人物选择驱动的因果链、剧情弧、关键转折与高潮回报。",
    focus: "因果链 · 转折 · 高潮",
    sourceLabel: "story-skills/plot-structure 适配",
    sourceUrl: "https://github.com/danjdewhurst/story-skills",
    sourceRef: STORY_SKILLS_REF,
    license: "MIT",
    workflow: [
      "把剧情事件写成‘因为某人做了什么，所以局面怎样改变’，拒绝只按时间罗列。",
      "为主线和重要支线分别标出触发、承诺、升级、中点改写、最低点、高潮选择与余波。",
      "每个转折必须改变目标、方法、关系、信息或代价中的至少一项。",
      "验证高潮解决的是故事早期承诺，而不是临时出现的新问题。",
      "标记可以删除而不影响因果链的段落，作为结构压缩候选。"
    ],
    output: ["因果链", "剧情弧表", "转折验证", "可删段落候选"]
  },
  {
    id: "scene-beat-cards",
    title: "章节节拍与场景卡",
    description: "把卷纲拆成可写的章节任务和场景节拍，控制目标、冲突、信息与钩子。",
    focus: "章节细纲 · 场景功能 · 节奏",
    sourceLabel: "creative-writing-skills/story-planning 适配",
    sourceUrl: "https://github.com/haowjy/creative-writing-skills",
    sourceRef: CREATIVE_WRITING_REF,
    license: "Apache-2.0",
    workflow: [
      "先写本章开始状态与结束状态，二者没有实质差异时重新定义章节目的。",
      "每个场景卡包含视角人物、即时目标、阻力、策略、转折、获得信息和离场状态。",
      "相邻场景用因果或人物选择连接，避免‘然后又发生’式拼接。",
      "安排强弱节拍和信息密度，连续高压后提供必要的理解与情绪空间。",
      "章末钩子必须来自新问题、新代价、新选择或既有承诺推进，不使用空泛惊叹。"
    ],
    output: ["章节任务卡", "场景卡序列", "信息释放表", "章末钩子"]
  },
  {
    id: "character-arc-relations",
    title: "人物弧与关系张力",
    description: "让人物的欲望、误信、选择、代价和关系变化共同推动剧情。",
    focus: "人物弧 · 关系 · 行动逻辑",
    sourceLabel: "story-skills/character-management 适配",
    sourceUrl: "https://github.com/danjdewhurst/story-skills",
    sourceRef: STORY_SKILLS_REF,
    license: "MIT",
    workflow: [
      "分别记录人物想要什么、真正需要什么、害怕什么、误信什么，以及绝不愿付出的代价。",
      "把人物弧拆成可观察的选择与后果，不用性格标签替代行为证据。",
      "为主要关系定义双方目标、权力差、信息差、未说出口的需求和当前裂缝。",
      "检查人物只知道自己有渠道获知的信息，避免为了推进剧情突然全知。",
      "每次重要转变都要有触发、抵抗、选择和余波，禁止无过渡改性格。"
    ],
    output: ["人物驱动链", "关系张力表", "知识边界", "转变证据"]
  },
  {
    id: "foreshadowing-promises",
    title: "悬念、伏笔与承诺回收",
    description: "管理疑问、信息差、伏笔和读者承诺，防止遗忘、过早揭露或无效反转。",
    focus: "悬念 · 伏笔 · 回收",
    sourceLabel: "story-skills promise/question 方法适配",
    sourceUrl: "https://github.com/danjdewhurst/story-skills",
    sourceRef: STORY_SKILLS_REF,
    license: "MIT",
    workflow: [
      "区分谜面、伏笔、明示承诺和角色误解，分别记录读者与角色知道什么。",
      "每条线索标记首次出现、强化、误导、部分揭示、最终回收和回收后的剧情后果。",
      "反转必须同时满足可回看、会改写理解、由既有因果支持三项条件。",
      "检查长期悬念是否持续获得新证据，避免只靠拖延不提供进展。",
      "回收后更新人物选择或局面；只解释真相但不产生后果不算有效回收。"
    ],
    output: ["悬念台账", "读者/角色信息差", "反转可回看证据", "回收状态"]
  },
  {
    id: "world-rules-consequences",
    title: "世界规则与代价系统",
    description: "把世界观写成能约束人物选择、冲突升级和日常生活的规则系统。",
    focus: "规则 · 资源 · 社会后果",
    sourceLabel: "story-skills/worldbuilding 适配",
    sourceUrl: "https://github.com/danjdewhurst/story-skills",
    sourceRef: STORY_SKILLS_REF,
    license: "MIT",
    workflow: [
      "只建立当前剧情真正需要的规则，分别说明能力、限制、代价、例外和可验证后果。",
      "追踪资源从哪里来、由谁控制、如何交换，以及稀缺性怎样制造权力关系。",
      "把地理、制度、技术与文化规则落实到交通、工作、饮食、战争和日常选择。",
      "新设定必须检查与旧规则是否冲突；若要破例，必须提前留下条件或代价。",
      "列出会直接改变情节的世界事实，和仅作氛围但不得占用大量篇幅的装饰事实。"
    ],
    output: ["规则卡", "代价与例外", "资源/权力链", "剧情影响清单"]
  },
  {
    id: "reader-simulation-revision",
    title: "读者模拟与修订路线",
    description: "从信息理解、期待、情绪和阅读阻力出发，把诊断转成可执行修订顺序。",
    focus: "读者体验 · 诊断 · 修订",
    sourceLabel: "creative-writing-skills/story-review 与 reader-sim 适配",
    sourceUrl: "https://github.com/haowjy/creative-writing-skills",
    sourceRef: CREATIVE_WRITING_REF,
    license: "Apache-2.0",
    workflow: [
      "先以首次阅读者视角记录每个阶段理解了什么、期待什么、困惑什么，不替作者补脑。",
      "把问题分为事实矛盾、因果断裂、人物不可信、节奏阻塞、语言噪声和个人偏好。",
      "按影响面排序：先修会改变后文的大结构，再修场景功能，最后修句段表达。",
      "每条建议写清证据、影响、最小修法和可能副作用，不只给抽象评价。",
      "修订后重新检查原承诺、人物状态和连续性，防止局部改好却制造新矛盾。"
    ],
    output: ["读者体验轨迹", "问题分级", "修订顺序", "回归检查表"]
  }
] as const;

export function renderInkHubPlotSkill(skill: InkHubPlotSkill): string {
  return [
    `# ${skill.title}`,
    "",
    skill.description,
    "",
    `重点：${skill.focus}`,
    "",
    "## 执行流程",
    ...skill.workflow.map((item, index) => `${index + 1}. ${item}`),
    "",
    "## 输出合同",
    ...skill.output.map((item) => `- ${item}`),
    "",
    "## 安全与创作边界",
    "- 只把当前作品、作者明确提供的材料和墨枢已授权索引当作事实来源。",
    "- 不自动写入或覆盖小说源文件；需要落盘时先返回修订方案，由作者审阅确认。",
    "- 不自动调用脚本、Hook、插件、MCP、网络或外部仓库，也不索取任何凭证。",
    "- 不以在世作者或受保护作品的可识别文风为目标；优先抽象为可组合的技法参数。",
    "- 证据不足时标注假设，不把模型补全当成既有设定。",
    "",
    `来源研究：${skill.sourceLabel} · ${skill.sourceUrl} · ${skill.sourceRef} · ${skill.license}`,
    `<!-- inkhub-plot-skill:${skill.id}; adaptation:clean-room; source-ref:${skill.sourceRef}; license:${skill.license}; external-execution:false -->`,
    ""
  ].join("\n");
}
