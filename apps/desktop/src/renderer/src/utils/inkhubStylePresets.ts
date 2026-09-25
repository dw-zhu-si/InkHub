export interface InkHubStylePreset {
  id: string;
  title: string;
  summary: string;
  perspective: string;
  sentence: string;
  dialogue: string;
  pacing: string;
  lexicon: string;
  emotion: string;
  hook: string;
  environment: string;
  opening: string;
  avoid: string;
}

function preset(
  id: string,
  title: string,
  summary: string,
  dimensions: Omit<InkHubStylePreset, "id" | "title" | "summary">
): InkHubStylePreset {
  return { id, title, summary, ...dimensions };
}

const INKHUB_STYLE_PRESET_CANDIDATES: readonly InkHubStylePreset[] = [
  preset("light-contrast-xianxia", "轻松反差仙侠", "用日常反应解构宏大仙侠场景，以反差制造幽默。", { perspective: "第三人称限知，重要爆点允许短暂切到旁观者反应。", sentence: "短句与单句段为主，中句承载必要信息。", dialogue: "对话占比较高，反应快，同一笑点最多追加一次反应。", pacing: "平静进场，小偏差升级，反差爆点，迅速收束。", lexicon: "通俗现代语感与少量世界术语对照使用。", emotion: "轻快、自嘲，避免持续嘈杂和强行煽情。", hook: "以出乎预料的决定或旁观者误判收尾。", environment: "只保留能触发动作或反差的空间细节。", opening: "前二百字内给出目标、场景规则和一处不协调。", avoid: "禁止密集网络梗、连续吐槽和为搞笑破坏人物动机。" }),
  preset("mentor-disciple-power-gap", "师徒反差爽文", "以师徒认知差和隐藏实力驱动笑点与爽点。", { perspective: "第三人称跟随徒弟或旁观者，师父的真实边界延后显露。", sentence: "短段、动作句优先，爆发时进一步压缩。", dialogue: "师徒台词在自信与谨慎之间对撞。", pacing: "互动铺垫、危机逼近、一次显露、余波反应。", lexicon: "功法名称简洁，避免面板和层级过度堖叠。", emotion: "底色轻松，保留护持关系的温情。", hook: "以更大的隐藏实力或新任务开口收尾。", environment: "环境主要服务于实力对比和旁观反应。", opening: "先展示一个师徒习惯动作，再打破日常。", avoid: "禁止无成本连续碾压，每次显露必须改变关系或局势。" }),
  preset("northern-folklore-mystery", "北方民俗灵异", "以具体地方生活和民俗规则建立惊异感。", { perspective: "贴近普通人经验的限知视角，不提前解释超自然真相。", sentence: "口语短句与克制叙述交替。", dialogue: "地方口吻体现在语序和称呼，不用拼写式方言炫技。", pacing: "日常细节、轻微异常、规则显形、代价落地。", lexicon: "选择可核对的民俗物件与动作，少用空泛阴森形容词。", emotion: "恐惧与人情温度并存。", hook: "章末留下一个规则被破坏的可见证据。", environment: "写温度、气味、声音和物件位置的变化。", opening: "从一个可见可闻的生活细节入场。", avoid: "禁止把真实民俗群体神秘化，禁止用万能咒语解决冲突。" }),
  preset("ensemble-mystery-comedy", "群像推理喜剧", "让多人互动承载线索，用克制幽默缓冲高压推理。", { perspective: "围绕一个主视点，场景切换时才交接视点。", sentence: "推理句中长，行动和台词短促。", dialogue: "每个角色拥有不同信息和语用习惯，笑点不得覆盖线索。", pacing: "提问、小证据、错误路径、局部翻转。", lexicon: "使用可回指的物证名词，避免抽象的“他感觉不对”。", emotion: "紧张为主，幽默是人物应对压力的方式。", hook: "揭示一个旧证据的新意义。", environment: "只描写可影响证词或行动的空间要素。", opening: "从倒计时、失踪物或矛盾证词切入。", avoid: "禁止侦探凭空获得信息，翻转前必须有可复查埋点。" }),
  preset("elder-hidden-power", "老年隐强苟道", "以衰老外表与长期经验形成实力错判。", { perspective: "多从轻视主角的人物视点进入。", sentence: "平时舒缓，决断时极短。", dialogue: "主角少说结论，通过追问和日常话隐藏计算。", pacing: "观察、忍让、确认退路、一次行动。", lexicon: "使用时间、旧物和身体习惯显示经验。", emotion: "克制、冷静，爽感来自准备而非噱头。", hook: "在出手后留下一个更早布置的线索。", environment: "空间描写服务于退路、距离与隐蔽。", opening: "从一件被他人忽视的小事入场。", avoid: "禁止无理由知晓一切，禁止把年龄只当作搞笑道具。" }),
  preset("vernacular-supernatural-progression", "半文半白灵异升级", "在古朴叙述与直白行动之间切换，让升级发生在可见代价之后。", { perspective: "第三人称限知，主角的未知与读者同步。", sentence: "氛围句稍长，异常与奖励句短。", dialogue: "对话直白，不用说教代替规则展示。", pacing: "任务准备、异常升级、代价或收获、新问题。", lexicon: "文言连接词少量点缀，关键规则用白话落实。", emotion: "惊异、冷意与可控的成就感。", hook: "收获带出未知来源或隐藏代价。", environment: "用火光、声音、气味和物质变化承载恐怖。", opening: "从一项具体工作流程开始，让异常混入流程。", avoid: "禁止奖励补偿所有风险，禁止古风辞藻连续堆叠。" }),
  preset("patient-immortal-survival", "长生谨慎修行", "用时间跨度和延迟决策制造长线回报。", { perspective: "稳定限知，通过他人的寿命变化显示时间。", sentence: "平和短段，时间跳跃用清楚标记。", dialogue: "对话重判断和试探，少用热血宣言。", pacing: "积累、等待、变化、延迟兑现。", lexicon: "常用季节、物价、技艺和人际更替标记时间。", emotion: "平静中含有生存焦虑与时间感。", hook: "用一个旧承诺终于到期收尾。", environment: "环境以长期变化为主，不逐场铺陈。", opening: "从对资源或风险的小心核算开始。", avoid: "禁止把谨慎写成无限拖延，每次等待必须有新信息。" }),
  preset("rule-puzzle-suspense", "规则谜题惊悚", "让恐惧来自不完整规则与可验证后果。", { perspective: "跟随观察力强但信息有限的行动者。", sentence: "观察句简洁，危险发生时使用不完全句。", dialogue: "角色通过提问、质疑和试探暴露风险偏好。", pacing: "异常、试验、局部规则、更大未知。", lexicon: "使用空间、次数、时间和物件状态的精确词。", emotion: "压迫为主，可用少量冷幽默提供呼吸口。", hook: "新证据否定了一条已信任的规则。", environment: "环境每次变化都必须可被后文利用。", opening: "从一个简单禁令和第一次轻微违反开始。", avoid: "禁止临时发明无法推导的规则，禁止仅用血腥代替恐惧。" }),
  preset("streetwise-xianxia", "江湖痞气反差修仙", "用生存者的现实逻辑碰撞庄严修行秩序。", { perspective: "紧贴主角利益判断，不用上帝视角保护笑点。", sentence: "口语短句、精确动词，设定解释分散到行动。", dialogue: "台词带试探和讨价还价，对手必须有有效反应。", pacing: "机会、误判、现实解法、后果。", lexicon: "使用交易、距离、重量和风险词汇落地奇观。", emotion: "快乐来自机灵，不来自羞辱弱者。", hook: "主角的实用选择意外打开更大局面。", environment: "重点写可变现、可藏身、可利用的细节。", opening: "从一个不合时宜但合乎生存逻辑的念头开始。", avoid: "禁止无底线破坏可信关系，禁止靠侮辱弱者制造爽感。" }),
  preset("institutional-apocalypse", "组织力量末世群像", "用组织流程、分工和信息网络重写个人英雄叙事。", { perspective: "多线程群像，每个场景仅保留一个主视点。", sentence: "会话与操作句简短，信息汇总使用清晰小段。", dialogue: "职业语气与个人情绪并存，调度信息要可执行。", pacing: "发现、上报、协同、反馈、下一级风险。", lexicon: "使用职能、资源、通信和责任边界词汇。", emotion: "冷幽默与危机中的公共信任。", hook: "以新数据推翻个人对危机规模的理解。", environment: "写基础设施、通信盲区和物资流向。", opening: "从一个异常被普通岗位发现开始。", avoid: "禁止把组织写成无错机器，需展示延误、误判和责任。" }),
  preset("cold-death-game", "冷峻死亡博弈", "用明确约束与不对称信息推动高压决策。", { perspective: "紧跟决策者，只展示当下可用信息。", sentence: "冷静、精确，极少装饰。", dialogue: "台词同时承载立场、试探和风险。", pacing: "观察、假设、行动、代价、新约束。", lexicon: "使用数量、时间、位置和行动后果的明确词汇。", emotion: "压抑但不滥情，稀少幽默必须暴露人性。", hook: "证明前一次胜利也是更大机制的一环。", environment: "环境是规则边界，不仅是氛围。", opening: "从无法回避的倒计时或选择开始。", avoid: "禁止角色为翻转而突然降智，禁止隐藏本应可见的线索。" }),
  preset("classical-fantasy-intrigue", "传统玄幻智谋暗线", "以礼法表面与利益暗线形成多层对话。", { perspective: "限知多视点，仅在场景交接处切换。", sentence: "白话为骨架，少量典雅词汇标记秩序。", dialogue: "台词的字面意与真实意图保持可推导距离。", pacing: "礼节、试探、让步、暗中转向。", lexicon: "围绕权限、承诺、家族、名分和资源建立词汇。", emotion: "冷幽默与谨慎野心并存。", hook: "在表面协议达成后显示一个漏洞。", environment: "用座次、门禁、礼器和通报流程表现权力。", opening: "从一场有明确礼节但双方目标不同的会面开始。", avoid: "禁止把智谋简化为故意不说话，禁止用作者解说代替交锋。" }),
  preset("warm-daily-mystery", "温情日常悬疑", "让日常关系提供情感锚点，以轻微异常持续牵引。", { perspective: "贴近主角的家庭和朋友关系。", sentence: "自然中句为主，笑点和异常处用短句。", dialogue: "台词先服务关系，线索通过不经意的语气差出现。", pacing: "日常任务、关系细节、异常暗线、克制悬念。", lexicon: "使用饮食、通勤、家务和小物件稳定现实感。", emotion: "温暖而不煽情，悬疑而不持续尖叫。", hook: "一个日常物件显示出不可能的状态。", environment: "环境通过熟悉与微小改变建立悬疑。", opening: "先让人物完成一件平常小事。", avoid: "禁止用突如其来的惨事强行催泪，禁止日常段落与主线无关。" }),
  preset("dark-revenge-satire", "黑暗复仇讽刺", "以制度性不公与具体个人代价推动复仇。", { perspective: "限知视角，保留主角的道德盲区。", sentence: "铺垫克制，冲突时锋利短句。", dialogue: "讽刺必须针对权力逻辑，不只是嘲骂。", pacing: "压迫证据、道德决定、反击、难以撤回的后果。", lexicon: "使用契约、审判、债务和身份词汇体现权力。", emotion: "愤怒、克制与不完全的释放。", hook: "复仇成功后显示新的道德负债。", environment: "写权力如何体现在建筑、通行和资源中。", opening: "从一项被视作正常的不公流程开始。", avoid: "禁止用无限暴力代替价值冲突，禁止让受害者成为工具人。" }),
  preset("absurd-urban-action", "荒诞都市高武", "在严肃秩序中植入一套自洽但意外的行动逻辑。", { perspective: "视角跟随常识一方，让荒诞来自可理解的崩溃反应。", sentence: "极短台词与简洁动作组合。", dialogue: "一本正经地推导出非常规结论，反应者不得只会震惊。", pacing: "秩序展示、逻辑偏移、行动爆点、平静收束。", lexicon: "日常办事词汇与战斗术语并置。", emotion: "黑色幽默，底层保留对困境的严肃态度。", hook: "荒诞解法被制度正式接纳或造成新麻烦。", environment: "用现代公共空间的规则制造对撞。", opening: "从一个非常标准的城市流程开始。", avoid: "禁止连续复制同一反差，禁止让所有配角失去判断力。" }),
  preset("cosmic-dark-humor", "宇宙恐怖黑色幽默", "以人类的小算计面对不可理解系统，在荒诞中保留后果。", { perspective: "主角限知，不提供完整宇宙解释。", sentence: "严肃描述与突然的日常短句对照。", dialogue: "幽默是人物的防御机制，不得取消危险的实际代价。", pacing: "常识、不可理解介入、临时策略、更大失控。", lexicon: "将官僚、服务和合同词汇用于描述非人存在。", emotion: "荒诞、不安和冷静求生。", hook: "一次成功交易暴露条款的真正尺度。", environment: "环境中的比例、声音和因果出现微小错位。", opening: "从一项看似可以谈判的异常服务开始。", avoid: "禁止只堆叠不可名状形容词，禁止用吐槽消解所有恐怖。" }),
  preset("hot-blooded-wanderer", "热血浪子武侠", "用直接行动、快速友谊和江湖代价塑造浪子。", { perspective: "限知跟随行动者，他人实力从动作反推。", sentence: "短句分行，关键动作单独成段。", dialogue: "台词短、留白多，幽默来自胆量与后果的反差。", pacing: "遇见、不平、立即行动、伤痕与情义。", lexicon: "具体兵器、道路、酒食和伤势优先。", emotion: "热血外层包着孤独与忠诚。", hook: "行动的代价或新同伴的真实立场出现。", environment: "空间用于显示距离、速度和逃生可能。", opening: "从一次不经思考但符合人物底线的干预开始。", avoid: "禁止热血口号代替具体行动，禁止无代价地连胜。" }),
  preset("desert-martial-mystery", "沙漠冒险武侠悬疑", "让缺水、距离和方向成为推理与友谊的压力。", { perspective: "围绕观察者的限知视角。", sentence: "环境句精准，友人互损用短句。", dialogue: "调侃与试探并行，称呼变化显示关系距离。", pacing: "方向问题、资源变化、人际怀疑、行动反转。", lexicon: "使用地形、风向、日影、水量和驮兽状态。", emotion: "友情缓冲生存压力，危险不因幽默消失。", hook: "一个方向或距离证据与众人记忆不符。", environment: "沙漠不只是景观，必须持续改变决策。", opening: "从一项资源计算或地标异常开始。", avoid: "禁止忽略旅程物理条件，禁止线索只靠巧合出现。" }),
  preset("melancholic-romantic-wuxia", "苍凉浪漫武侠", "用物件、空白和未说完的关系表达江湖悲歌。", { perspective: "限知视点，尽量不直接说明人物最深情绪。", sentence: "短句、留白和重复意象建立节奏。", dialogue: "台词少，没有回答的问题也承载关系。", pacing: "氛围、试探、短促冲突、余韵。", lexicon: "围绕一至两个主意象变化，避免广泛古风词堆叠。", emotion: "苍凉、克制，豪情从不得不做的选择中出现。", hook: "用一个已经改变意义的物件收尾。", environment: "冷、光、距离和空缺比繁复景色更重要。", opening: "从人物和一个熟悉物件的异样重逢开始。", avoid: "禁止只通过断句模仿特定作家，禁止把含蓄写成信息缺失。" }),
  preset("joyful-found-family-wuxia", "欢乐温情武侠", "以底层互助、互相拆台和小规模智取建立欢乐江湖。", { perspective: "群像但场景视点稳定，关注关系反应。", sentence: "短句明快，关键温情处反而放慢。", dialogue: "互损不伤人，笑点后必须保留人物的细微照顾。", pacing: "生活难题、友人介入、小智谋、温情收束。", lexicon: "食物、钱、衣物、住处和小伤口建立亲近感。", emotion: "欢乐是共担困境的结果，不是忽视困境。", hook: "一个小胜利引来新朋友或更难的日常问题。", environment: "写共享空间如何留下每个人的痕迹。", opening: "从一顿饭、一笔小债或一件不合身的衣服开始。", avoid: "禁止靠恶意羞辱制造笑点，禁止温情只靠作者总结。" }),
  preset("investigative-frontier-fantasy", "边境勘探奇幻", "用地理勘探、族群交往和资源冲突驱动奇幻冒险。", { perspective: "跟随记录者或向导，认知会因新证据修正。", sentence: "勘探结果精确，危险反应简短。", dialogue: "对话中展示双方对地方的不同知识。", pacing: "假设、实地验证、本地交流、风险修正。", lexicon: "使用地形、水源、物候、资源和通道词汇。", emotion: "好奇、谨慎，对本地人的知识保持尊重。", hook: "地图上的空白被证明是人为留下。", environment: "环境必须影响交通、补给、战斗或聚落。", opening: "从一处地图、实地和本地说法不一致的地方开始。", avoid: "禁止把本地文化当作神秘布景，禁止忽略地理对行动的限制。" }),
  preset("domestic-magical-realism", "日常微奇幻", "让微小奇幻规则改变家庭和社区关系，不追求宏大解释。", { perspective: "贴近日常生活的限知视角。", sentence: "自然中句，奇幻现象以平实语气描述。", dialogue: "人物先讨论实际影响，而非发表世界观感叹。", pacing: "日常需求、奇异帮助、关系变化、微妙代价。", lexicon: "家务、邻里、时间表和小店铺词汇为主。", emotion: "温柔、幽默，保留一点无法解释的遗憾。", hook: "奇异现象消失后留下一个真实改变。", environment: "通过家中物件的微小偏移显示奇幻。", opening: "从一个习以为常的家务出现小异常开始。", avoid: "禁止把一切都解释为梦，禁止奇幻规则无条件解决人际问题。" }),
  preset("forensic-courtroom-suspense", "证据链法庭悬疑", "以证据可采性、证词冲突和程序时限推进。", { perspective: "限知跟随调查或辩论一方，对方逻辑必须完整。", sentence: "证据描述精确，庭上交锋简短。", dialogue: "每个问句都有可验证目标，少用演说式台词。", pacing: "证据入场、质疑来源、替代解释、暂时裁定。", lexicon: "使用时间戳、保管链、位置、来源和推断层级词汇。", emotion: "克制紧张，人性压力来自选择的后果。", hook: "一项看似有利的证据因来源问题失效。", environment: "空间重点是位置、可见性和取得路径。", opening: "从一份时间或来源不合的材料开始。", avoid: "禁止用突袭新证据解决全案，禁止把专业角色写成空壳。" }),
  preset("quiet-literary-coming-of-age", "静水成长文学", "用微小选择、物件变化和关系距离呈现成长。", { perspective: "严格限知，不为人物总结他尚未理解的成长。", sentence: "中句为主，重要情绪使用简单短句落地。", dialogue: "台词保留误解和未说出的部分。", pacing: "日常事件、微小选择、关系反馈、余波。", lexicon: "使用季节、身体感觉、磨损物件和具体劳动。", emotion: "克制、真诚，避免大声宣告成长。", hook: "人物重复一个旧动作，但意义已改变。", environment: "环境是时间证据，需可与早前场景对照。", opening: "从一件早已习惯但突然无法照旧完成的事开始。", avoid: "禁止作者代替人物发表人生感悟，禁止为氛围堆叠无功能细节。" })
] as const;

// The audited source pack contains exactly twenty candidates. Keep the public
// compatibility set at that size; later InkHub-original experiments stay out
// of installation until they have their own product review.
export const INKHUB_STYLE_PRESETS: readonly InkHubStylePreset[] = INKHUB_STYLE_PRESET_CANDIDATES.slice(0, 20);

export function renderInkHubStylePresetSkill(style: InkHubStylePreset): string {
  return `---
name: inkhub-${style.id}
description: ${style.title}：${style.summary}
metadata:
  source: inkhub-clean-room-adaptation
  research: oscar-wang-xin/xin-skills@b358929d9c6eb4a9dcf278573e2d0539a9e8baa0
  upstream-content-copied: false
---

# ${style.title}

## 使用边界

这是墨枢独立编写的通用文风预设，只控制高层叙事属性。作品的事实、人物、时间线和用户自有文风指纹永远优先。同一次任务只启用一个通用文风预设。

不得复现参考文本中的连续表达、专属名词、人物关系或情节；不得模仿在世作者或特定作品的可识别表达。

## 十维文风指纹

1. **叙事视角**：${style.perspective}
2. **句式节奏**：${style.sentence}
3. **对话体系**：${style.dialogue}
4. **叙事节奏**：${style.pacing}
5. **词汇与修辞**：${style.lexicon}
6. **情绪基调**：${style.emotion}
7. **章末钩子**：${style.hook}
8. **环境描写**：${style.environment}
9. **行文禁忌**：${style.avoid}
10. **开篇习惯**：${style.opening}

## 执行要求

- 写作前先从当前作品全文索引提取用户自有文风指纹，本预设仅在不冲突的维度生效。
- 每章结束后检查视角、句长、对话比例、情绪曲线与钩子是否符合目标，但不为达到比例而破坏情节。
- 如果用户提供的参考要求与原创性或作品事实冲突，停止模仿部分，保留高层属性并说明。

<!-- inkhub-style-preset:${style.id}; upstream-content-copied:false -->
`;
}
