import {
  InkHubCoverStyleSchema,
  type InkHubCoverStyle,
  type InkHubCoverStyleId
} from "@deepwrite/contracts";
import coverSkill from "../renderer/src/skills/media/inkhub-cover-art-direction/SKILL.md?raw";

export const INKHUB_COVER_SKILL_ID = "inkhub-cover-art-direction";
export const INKHUB_COVER_SKILL_TITLE = "小说封面艺术指导";
export const INKHUB_COVER_SKILL_CONTENT = coverSkill.trimEnd() + "\n";
export const INKHUB_COVER_METHOD_SOURCE = "https://github.com/adrianpunk/Punk-Skill";
export const INKHUB_COVER_METHOD_REF = "50ea29b65b98788f9ed1df62818dbe530855bfb3";

interface CoverOverlay {
  titleColor: string;
  authorColor: string;
  shade: string;
  placement: "top" | "center" | "bottom";
  align: "left" | "center" | "right";
  font: "serif" | "sans";
}

interface CoverStyleDefinition extends InkHubCoverStyle {
  direction: string;
  avoid: string;
  overlay: CoverOverlay;
}

const SOURCE_REF = `${INKHUB_COVER_METHOD_SOURCE}@${INKHUB_COVER_METHOD_REF}`;
const serifBottom: CoverOverlay = { titleColor: "#fff8e7", authorColor: "#f0d7a3", shade: "linear-gradient(180deg,rgba(4,8,7,.05) 10%,rgba(4,8,7,.26) 48%,rgba(4,8,7,.9) 100%)", placement: "bottom", align: "left", font: "serif" };
const sansBottom: CoverOverlay = { titleColor: "#ffffff", authorColor: "#d9e5e2", shade: "linear-gradient(180deg,rgba(3,8,10,.04) 12%,rgba(3,8,10,.34) 55%,rgba(3,8,10,.92) 100%)", placement: "bottom", align: "left", font: "sans" };
const lightTop: CoverOverlay = { titleColor: "#171915", authorColor: "#4d544d", shade: "linear-gradient(180deg,rgba(248,244,232,.9) 0%,rgba(248,244,232,.18) 42%,rgba(248,244,232,.04) 100%)", placement: "top", align: "left", font: "serif" };

const rawStyles: readonly CoverStyleDefinition[] = [
  { id: "ink-gold-fantasy", label: "水墨鎏金玄幻", description: "墨色山水、鎏金裂光与单一奇观主体，保留东方叙事的克制和纵深。", bestFor: "仙侠、玄幻、东方奇幻", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "以大面积墨色留白承托一个清晰奇观主体，用少量鎏金光线串起远中近景，材质像宣纸、水墨与金箔。", avoid: "仙侠人物拼贴、廉价游戏海报、满屏金光、复杂文字纹样", overlay: serifBottom },
  { id: "crimson-silhouette-suspense", label: "黑红剪影悬疑", description: "黑色负形、克制猩红与高压光影形成危险感。", bestFor: "悬疑、犯罪、复仇", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "用黑色剪影和一处猩红证据构成强烈负形，背景简洁，光源像审讯灯或远处警示光。", avoid: "血腥特写、恐怖片廉价字体、武器陈列、无关霓虹", overlay: { ...sansBottom, titleColor: "#fff5ee", authorColor: "#ffafa1" } },
  { id: "dynasty-scroll-epic", label: "王朝长卷史诗", description: "古典长卷空间、城阙与行军线条表现历史尺度。", bestFor: "历史、战争、权谋", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "采用古典长卷式纵深，一座城阙或关隘为主景，人物只作为尺度参照，纸张旧化但细节清楚。", avoid: "电视剧演员脸、朝代元素混用、龙纹堆砌、旅游纪念品风", overlay: { ...serifBottom, titleColor: "#f5dfb3" } },
  { id: "neon-cyber-night", label: "霓虹赛博夜城", description: "冷色夜城、单点高饱和霓虹和巨型空间压迫。", bestFor: "科幻、赛博朋克、都市异能", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "构建雨夜城市纵深，以青蓝黑为底，一处洋红或琥珀霓虹照亮人物或关键装置，强调尺度与反射。", avoid: "霓虹招牌乱码、密集 UI、全彩光污染、通用赛博人物头像", overlay: sansBottom },
  { id: "retro-sci-fi-animation", label: "复古科幻动画", description: "手绘赛璐璐、颗粒天空与清晰动作剪影。", bestFor: "太空、机甲、青春冒险", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "用复古赛璐璐动画质感表现一个动作瞬间，轮廓明确，背景使用颗粒星空和有限色板。", avoid: "复制知名动画角色、模型玩具质感、过多爆炸、现代 3D 渲染", overlay: { ...sansBottom, titleColor: "#fff1b8", authorColor: "#c9d9ff" } },
  { id: "minimal-symbolic", label: "极简意象", description: "单一物件、大片留白和精准阴影表达主题。", bestFor: "文学、哲思、现实题材", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "只保留一个与故事核心有关的实体意象，让形状、材质和投影形成第二层含义，背景极简且安静。", avoid: "装饰性小图标、PPT 封面、口号感、无意义几何", overlay: lightTop },
  { id: "torn-paper-mystery", label: "手撕纸谜案", description: "档案纸、撕裂边缘与局部遮挡制造信息差。", bestFor: "多线叙事、秘密、调查", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "以两到三层撕裂档案纸构成空间，照片或线索只露出关键局部，胶带、铅笔线和旧纸纹理服务于谜面。", avoid: "线索墙模板、密集便签、真实身份证件、乱码报纸", overlay: lightTop },
  { id: "block-world-adventure", label: "方块世界冒险", description: "模块化地形和清楚路径表现系统与闯关。", bestFor: "游戏异界、系统流、轻冒险", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "用简化的模块化地形搭建一条可读冒险路径，主角体量小但位置明确，色块清爽且带轻微玩具质感。", avoid: "复制具体游戏画面、像素噪声、复杂面板、儿童积木广告", overlay: sansBottom },
  { id: "brick-kingdom", label: "积木王国", description: "可拼装结构、建造过程和群像尺度适合经营成长。", bestFor: "建设、经营、群像成长", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "把城市、门派或团队抽象成正在搭建的实体结构，构件之间有清楚关系，强调从无到有的成长。", avoid: "品牌积木造型、儿童玩具包装、零散无逻辑组件、教程图", overlay: sansBottom },
  { id: "giant-title-impact", label: "巨题冲击", description: "强尺度主体和为本地巨型书名预留的明确负形。", bestFor: "爽文、热血、强情节网文", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "用一个高速动作或巨大物体制造冲击，在画面上半部或中央留出干净负形供本地巨型书名排版，色彩高对比。", avoid: "模型直接生成文字、人物大头、元素爆炸、短视频缩略图风", overlay: { ...sansBottom, placement: "top", align: "left", titleColor: "#ffffff" } },
  { id: "editorial-fiction", label: "文学杂志封面", description: "编辑摄影感、克制网格和有余韵的人物或场景。", bestFor: "都市、职场、社会观察", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "使用高级编辑摄影感构图，人物或场景保持真实尺度，以克制色彩、干净边缘和一处意外细节形成故事感。", avoid: "商业杂志 logo、名人肖像、财经图表、广告摄影", overlay: { ...lightTop, font: "sans" } },
  { id: "archive-dossier", label: "档案调查册", description: "编号资料、地图痕迹和受控纸张层次形成调查感。", bestFor: "谍战、推理、纪实感故事", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "以档案册、地图折痕和一件关键物证构成整洁调查桌面，信息层次少而准确，强调时间与地点。", avoid: "可识别真实证件、密集英文、随意印章、犯罪教学细节", overlay: lightTop },
  { id: "diffuse-dream", label: "弥散梦境", description: "柔和渐变、漂浮光斑和朦胧景深营造情绪。", bestFor: "言情、治愈、青春、幻想", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "用柔和弥散渐变包裹一个克制人物或物件，轮廓部分清晰、部分融入光雾，颜色保持两到三种主调。", avoid: "糖果色堆叠、磨皮人像、婚纱摄影、满屏散景", overlay: { ...serifBottom, titleColor: "#ffffff", authorColor: "#f5eaff" } },
  { id: "monochrome-geometry", label: "黑白先锋几何", description: "锐利几何、黑白层次和单一空间矛盾。", bestFor: "心理、实验、冷峻寓言", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "使用黑白灰几何体制造一个不可能空间或心理夹角，主体极少，光影边缘精准，允许一处低饱和强调色。", avoid: "企业品牌图形、随机三角形、纯装饰抽象、PPT 风", overlay: { ...sansBottom, titleColor: "#ffffff", authorColor: "#cfcfcf" } },
  { id: "midcentury-surreal", label: "中世纪错位超现实", description: "复古人物、现代物件与一个克制时代错位隐喻。", bestFor: "穿越、时间、荒诞现实", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "采用中世纪编辑插画的平涂与纸张颗粒，让旧时代场景只出现一个现代物件，错位必须直接服务故事主题。", avoid: "复古元素大杂烩、恶搞拼图、现代品牌 logo、无关怀旧滤镜", overlay: lightTop },
  { id: "lonely-public-space", label: "孤独公共空间", description: "大尺度建筑、微小人物和冷静自然光表现疏离。", bestFor: "城市文学、成长、疏离", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "用清晨或黄昏的公共空间摄影感构图，建筑占据大部分画面，人物很小但动作可读，色彩安静。", avoid: "旅游宣传照、空洞豪宅、夸张广角、无人物纯建筑", overlay: sansBottom },
  { id: "retro-architecture", label: "复古建筑海报", description: "地标结构、丝网印刷色块和清晰旅行叙事。", bestFor: "城市、旅行、地域奇谭", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "把关键城市或建筑简化成复古丝网印刷海报，使用有限色板、粗颗粒和强透视，保留地方特征。", avoid: "真实城市 logo、廉价旅游海报、地标拼盘、过度怀旧", overlay: { ...sansBottom, titleColor: "#fff4d2", authorColor: "#e9c88d" } },
  { id: "ink-dot-metaphor", label: "油墨点阵隐喻", description: "复古点阵、机械纹理和具象隐喻连接科技与人。", bestFor: "科技悬疑、系统、研究题材", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "以油墨点阵和机械剖面构造一个具象隐喻，让人物、装置或城市在网点密度中显现，保持复古印刷限制。", avoid: "数据大屏、随机代码、科技公司广告、满屏蓝光", overlay: { ...sansBottom, titleColor: "#f5f0dc" } },
  { id: "black-modernist", label: "黑色现代主义", description: "深黑底、精确硬光和少量复古暖色形成冷硬质感。", bestFor: "黑色电影、冷硬派、权力故事", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "以深黑空间和一道硬光雕刻主体，使用少量赭石或奶油色，几何秩序稳定，像完成度高的现代主义书封。", avoid: "纯黑看不清、黑帮人物拼贴、枪械特写、奢侈品广告", overlay: { ...serifBottom, titleColor: "#f3e3bd", authorColor: "#bfa986" } },
  { id: "silver-blue-premium", label: "银箔蓝调", description: "银色材料、冷蓝线条和克制反射体现未来与精密。", bestFor: "商战、未来、精英成长", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "使用银箔、磨砂金属和冷蓝线条构建一个精密物件或路径，反射受控，背景留有清楚层次。", avoid: "金属字乱码、豪车手表广告、镜面过曝、金融图表", overlay: { ...sansBottom, titleColor: "#edf7ff", authorColor: "#9dc8ff" } },
  { id: "constructivist-megastructure", label: "构成主义巨构", description: "红黑米白色块、斜向动势和巨大结构表现冲突。", bestFor: "战争、灾变、竞技、宏大科幻", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "以红黑米白的构成主义色块和强斜线组织巨大结构，人物作为尺度，画面方向感必须与故事冲突一致。", avoid: "政治符号照搬、宣传口号、元素拥堵、随机俄文字母", overlay: { ...sansBottom, titleColor: "#fff4d6", authorColor: "#ffd0b8" } },
  { id: "french-ink-poetry", label: "法式墨线诗意", description: "细墨线、柔和纸色和轻微留白表现关系与选择。", bestFor: "爱情、关系、温柔现实主义", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "以少量流动墨线勾勒人物关系或空间，一到两块低饱和水彩承载情绪，大面积纸色留白。", avoid: "时尚插画摆拍、甜腻心形、密集花朵、手写乱码", overlay: lightTop },
  { id: "fate-thread-connection", label: "命运连线", description: "路径、线索与多个远距节点表现人物羁绊和因果。", bestFor: "群像、羁绊、双线与多线叙事", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "用一条连续但有张力的线连接两到四个空间节点，每个节点只保留一个代表物，线的交汇体现关系变化。", avoid: "社交网络图、流程图、品牌连接图标、过多头像", overlay: sansBottom },
  { id: "paper-acrylic-quiet", label: "纸感丙烯留白", description: "粗糙白纸、鲜明丙烯色块与微小主体形成安静寓意。", bestFor: "童话、治愈、寓言、轻文学", sourceLabel: "墨枢清洁室适配", sourceRef: SOURCE_REF, adaptation: "clean-room", direction: "在粗糙白纸上用薄墨线和两到三块鲜明丙烯色表现一个微小主体，大面积留白承载距离和希望。", avoid: "儿童涂鸦杂乱、彩虹配色、可爱贴纸、复杂场景", overlay: lightTop }
] as const;

function coverStylePublicFields(style: CoverStyleDefinition): InkHubCoverStyle {
  return InkHubCoverStyleSchema.parse({
    id: style.id,
    label: style.label,
    description: style.description,
    bestFor: style.bestFor,
    sourceLabel: style.sourceLabel,
    sourceRef: style.sourceRef,
    adaptation: style.adaptation
  });
}

export const INKHUB_COVER_STYLES: readonly CoverStyleDefinition[] = rawStyles.map((style) => ({
  ...coverStylePublicFields(style),
  direction: style.direction,
  avoid: style.avoid,
  overlay: style.overlay
}));

export function coverStyleById(id: InkHubCoverStyleId): CoverStyleDefinition {
  const style = INKHUB_COVER_STYLES.find((candidate) => candidate.id === id);
  if (!style) throw new Error("没有找到小说封面风格。");
  return style;
}

export function publicCoverStyle(style: CoverStyleDefinition): InkHubCoverStyle {
  return coverStylePublicFields(style);
}

export function compileInkHubCoverBackgroundPrompt(input: {
  title: string;
  author: string;
  visualDirection: string;
  styleId: InkHubCoverStyleId;
}): string {
  const style = coverStyleById(input.styleId);
  return [
    `为中文小说《${input.title}》创作一张专业封面底图。`,
    `使用“${style.label}”单一视觉风格：${style.direction}`,
    `小说画面方向：${input.visualDirection.trim()}`,
    input.author.trim() ? `作者署名将由应用在本地叠加为“${input.author.trim()}”，底图不要自行绘制署名。` : "底图不要生成作者署名。",
    "主体清晰，缩略图仍能辨认；为书名与作者名保留干净安全区，空间层次完整。",
    `避免：${style.avoid}。`,
    "不要生成任何文字、字母、数字、水印、边框、徽标、二维码或界面元素。只输出一张完整封面底图。"
  ].join("\n");
}

export function coverOverlayByStyleId(id: InkHubCoverStyleId): CoverOverlay {
  return { ...coverStyleById(id).overlay };
}
