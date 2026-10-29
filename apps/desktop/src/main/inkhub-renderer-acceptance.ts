import type { BrowserWindow } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface InkHubRendererAcceptanceResult {
  title: string;
  visited: string[];
  skillStatus: string;
  viewport: { width: number; height: number };
  documentWidth: { client: number; scroll: number };
  unnamedControls: number;
  writingGuideReady: boolean;
  topicArchiveReady: boolean;
  outlineReportReady: boolean;
  topicBookReady: boolean;
  authorPreferencesReady: boolean;
  novelHealthReady: boolean;
  outlineContentReady: boolean;
  reader: { chapters: number; volumeGroups: number; repairReady: boolean; aiRepairReady: boolean; aiRepairSelectionReady: boolean; deepQualityReady: boolean; storyStateReady: boolean; continuationReady: boolean; forecastReady: boolean; searchResults: number; qualityCoverage: string };
}

const acceptanceScript = String.raw`
(async () => {
  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const waitFor = async (selector, timeout = 15000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const element = document.querySelector(selector);
      if (element) return element;
      await sleep(60);
    }
    throw new Error('Timed out waiting for ' + selector);
  };
  const waitForVisible = async (selector, timeout = 15000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const element = document.querySelector(selector);
      if (element && element.getClientRects().length > 0) return element;
      await sleep(60);
    }
    throw new Error('Timed out waiting for visible ' + selector);
  };
  const clickSelector = async (selector, expected) => {
    const button = await waitFor(selector);
    button.click();
    return waitForVisible(expected);
  };
  const clickTab = async (label, expected) => {
    const navigation = await waitFor('.library-tabs');
    const button = Array.from(navigation.querySelectorAll('button')).find(
      (candidate) => candidate.textContent && candidate.textContent.includes(label)
    );
    if (!button) throw new Error('Missing library tab: ' + label);
    button.click();
    return waitForVisible(expected);
  };
  const captureCheckpoint = async (id) => {
    if (!window.__INKHUB_CAPTURE_SCREENSHOTS__) return;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await sleep(160);
    window.__INKHUB_CAPTURE_SCREENSHOTS_STEP__ = id;
    while (window.__INKHUB_CAPTURE_SCREENSHOTS_ACK__ !== id) {
      await sleep(50);
    }
  };

  await waitFor('.desktop-shell');
  const visited = ['workspace'];
  await clickSelector('[data-nav-id="inkhub-library"]', '.inkhub-library');
  visited.push('novels');

  const moreToggle = await waitFor('[data-nav-id="more"]');
  moreToggle.click();
  const guideEntry = await waitFor('[data-feature-id="writing-guide"]');
  guideEntry.focus();
  guideEntry.click();
  const guideDialog = await waitFor('.getting-started-dialog');
  if (guideDialog.getAttribute('role') !== 'dialog' || guideDialog.getAttribute('aria-modal') !== 'true') {
    throw new Error('Writing guide is not exposed as an accessible modal dialog.');
  }
  const workflowButtons = Array.from(guideDialog.querySelectorAll('.getting-started-workflows button'));
  if (workflowButtons.length !== 3) throw new Error('Writing guide does not offer short, script and long workflows.');
  workflowButtons[2].click();
  await sleep(80);
  if (workflowButtons[2].getAttribute('aria-pressed') !== 'true') {
    throw new Error('Writing guide could not switch to the long-novel workflow.');
  }
  const guideSteps = Array.from(guideDialog.querySelectorAll('.getting-started-steps button'));
  if (guideSteps.length !== 6) throw new Error('Writing guide does not contain the six-step creation journey.');
  guideSteps[1].click();
  await sleep(80);
  if (!(guideDialog.querySelector('.getting-started-detail')?.textContent || '').includes('剧情点与章卡都归属到对应卷')) {
    throw new Error('Long-novel guide does not explain volume-separated structure.');
  }
  const skipStep = Array.from(guideDialog.querySelectorAll('.getting-started-actions button')).find(
    (button) => button.textContent && button.textContent.includes('跳过此步')
  );
  if (!skipStep) throw new Error('Writing guide cannot skip a step.');
  skipStep.click();
  let savedGuideState = null;
  const guideSaveStarted = Date.now();
  while (Date.now() - guideSaveStarted < 3000) {
    await sleep(60);
    try {
      savedGuideState = JSON.parse(localStorage.getItem('inkhub-writing-getting-started-v1') || 'null');
    } catch {
      savedGuideState = null;
    }
    if (savedGuideState?.statuses?.long?.outline === 'skipped') break;
  }
  if (savedGuideState?.statuses?.long?.outline !== 'skipped') {
    throw new Error('Writing guide progress was not persisted locally.');
  }
  await sleep(100);
  await captureCheckpoint('09-writing-guide-1440x900');
  guideDialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(80);
  if (document.querySelector('.getting-started-dialog')) {
    throw new Error('Writing guide does not close on Escape.');
  }
  if (document.activeElement !== guideEntry) {
    throw new Error('Writing guide did not return focus to its opener.');
  }
  visited.push('writing-guide');

  const topicArchiveEntry = await waitFor('[data-feature-id="topic-archive"]');
  topicArchiveEntry.click();
  const topicArchive = await waitFor('.topic-archive-dialog');
  const newTopic = Array.from(topicArchive.querySelectorAll('button')).find((button) =>
    (button.textContent || '').includes('新建选题')
  );
  if (!newTopic) throw new Error('Topic archive cannot create a new record.');
  newTopic.click();
  const topicTitle = await waitFor('.topic-archive-form input[maxlength="160"]');
  topicTitle.value = '验收用选题档案';
  topicTitle.dispatchEvent(new Event('input', { bubbles: true }));
  const topicSave = await waitFor('.topic-archive-form button[type="submit"]');
  topicSave.click();
  await waitFor('.topic-archive-record-header h3');
  const proofLabel = await waitFor('.topic-archive-evidence-form input[maxlength="200"]');
  proofLabel.value = '作者提供样本';
  proofLabel.dispatchEvent(new Event('input', { bubbles: true }));
  const proofNote = await waitFor('.topic-archive-evidence-form textarea');
  proofNote.value = '验证可追溯证据记录';
  proofNote.dispatchEvent(new Event('input', { bubbles: true }));
  const proofAdd = await waitFor('.topic-archive-evidence-form button[type="submit"]');
  proofAdd.click();
  await waitFor('.topic-archive-proof');
  const savedTopics = JSON.parse(localStorage.getItem('inkhub-topic-archive-v1') || '[]');
  if (!savedTopics.some((record) => record.title === '验收用选题档案' && record.evidence?.length === 1)) {
    throw new Error('Topic archive record or its provenance evidence was not persisted locally.');
  }
  await sleep(150);
  await captureCheckpoint('10-topic-archive-1440x900');
  topicArchive.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(80);
  if (document.querySelector('.topic-archive-dialog')) throw new Error('Topic archive does not close on Escape.');
  visited.push('topic-archive');

  (await waitFor('[data-feature-id="author-preferences"]')).click();
  const preferencesDialog = await waitFor('.author-preferences-dialog');
  Array.from(preferencesDialog.querySelectorAll('button')).find((button) => button.textContent.includes('新增偏好')).click();
  const preferenceLabel = await waitFor('.author-preferences-form input[maxlength="80"]');
  preferenceLabel.value = '验收表达习惯'; preferenceLabel.dispatchEvent(new Event('input', { bubbles: true }));
  const preferenceContent = await waitFor('.author-preferences-form textarea');
  preferenceContent.value = '通过人物动作呈现紧张，保留含蓄对白。'; preferenceContent.dispatchEvent(new Event('input', { bubbles: true }));
  (await waitFor('.author-preferences-form button[type="submit"]')).click();
  await waitFor('.author-preference-item');
  const storedPreferences = JSON.parse(localStorage.getItem('inkhub-author-preferences-v1') || '[]');
  if (!storedPreferences.some((item) => item.enabled && item.label === '验收表达习惯' && item.scopes.length)) throw new Error('Author preference was not persisted with its scope.');
  const disablePreference = Array.from(preferencesDialog.querySelectorAll('button')).find((button) => button.textContent === '停用');
  disablePreference.click(); await sleep(80);
  if (JSON.parse(localStorage.getItem('inkhub-author-preferences-v1'))[0].enabled) throw new Error('Author preference disable did not persist.');
  Array.from(preferencesDialog.querySelectorAll('button')).find((button) => button.textContent === '启用').click(); await sleep(80);
  await captureCheckpoint('12-author-preferences');
  (await waitFor('[aria-label="关闭作者偏好"]')).click();
  await sleep(80);
  visited.push('author-preferences');

  await clickTab('Skills', '.skill-layout');
  const earlySkillStatusNode = await waitFor('.capability-status span');
  const earlySkillStarted = Date.now();
  while (
    Date.now() - earlySkillStarted < 20000 &&
    /正在|检查/u.test(earlySkillStatusNode.textContent || '')
  ) {
    await sleep(100);
  }
  if (!/(\d+)\/(\d+) 个小说 Skills 已安装/u.test(earlySkillStatusNode.textContent || '')) {
    throw new Error('Native capabilities were not installed before repair acceptance: ' + (earlySkillStatusNode.textContent || '').trim());
  }
  await clickTab('小说库', '.novel-layout');

  const fixtureSnapshot = await window.deepwrite.inkHub.listNovels();
  if (fixtureSnapshot.entries.length !== 1) {
    throw new Error('Acceptance fixture library is not isolated: ' + fixtureSnapshot.entries.length);
  }
  const fixtureEntry = fixtureSnapshot.entries[0];
  const fixtureIndex = await window.deepwrite.inkHub.buildNovelIndex(fixtureEntry.id);
  if (fixtureIndex.chapterCount !== 3 || fixtureIndex.indexedDocumentCount !== 3 || !fixtureIndex.contentComplete) {
    throw new Error('Fixture full-book index is incomplete: ' + JSON.stringify(fixtureIndex));
  }
  const refreshIndexStatus = Array.from(document.querySelectorAll('.index-actions button')).find(
    (candidate) => candidate.textContent && candidate.textContent.includes('刷新状态')
  );
  refreshIndexStatus?.click();
  await sleep(500);
  await captureCheckpoint('01-library-1440x900');
  const storyState = await window.deepwrite.inkHub.reconstructStoryState({ entryId: fixtureEntry.id, confirmBillable: true });
  const storyStateReady = storyState.summary.status === 'ready' && storyState.summary.analyzedChapters === 3 && storyState.summary.factCount === 3;
  if (!storyStateReady) throw new Error('Structured story state is incomplete: ' + JSON.stringify(storyState.summary));
  await clickTab('作品体检', '.novel-health-panel');
  (await waitFor('.health-check')).click();
  await waitFor('.health-index[data-status="current"]');
  await waitFor('.health-facts[data-status="current"]');
  await waitFor('.health-summaries[data-status="current"]');
  await captureCheckpoint('13-novel-health');
  visited.push('novel-health');
  await clickTab('小说库', '.novel-layout');
  const continuation = await window.deepwrite.inkHub.generateStoryContinuation({ entryId: fixtureEntry.id, authorIntent: '承接上一章继续写', currentFocus: '林舟', targetCharacters: 1000, confirmBillable: true });
  const continuationReady = continuation.canonical === false && continuation.writebackPerformed === false && continuation.draft.length > 0;
  if (!continuationReady) throw new Error('In-app continuation did not remain a non-writeback draft.');
  const forecast = await window.deepwrite.inkHub.generateStoryForecast({ entryId: fixtureEntry.id, question: '下一步如何发展？', branchCount: 2, confirmBillable: true });
  const forecastReady = forecast.canonical === false && forecast.stale === false && forecast.branches.length === 2;
  if (!forecastReady) throw new Error('Noncanonical forecast acceptance failed.');
  const novelCard = await waitFor('.novel-card');
  novelCard.click();
  await clickSelector('.reader-action', '.reader-shell');
  visited.push('reader');
  await waitFor('.reading-article', 20000);
  const chapterButtons = document.querySelectorAll('.volume-group > button');
  if (chapterButtons.length !== 3) throw new Error('Reader did not index all fixture chapters.');
  const volumeGroups = document.querySelectorAll('.volume-group').length;
  if (volumeGroups !== 2) throw new Error('Reader did not separate fixture volumes: ' + volumeGroups);
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth) {
    throw new Error('Reader has horizontal document overflow.');
  }
  await captureCheckpoint('02-volume-reader-1440x900');

  const readerTabs = await waitFor('.reader-tabs');
  const searchTab = Array.from(readerTabs.querySelectorAll('button')).find(
    (candidate) => candidate.textContent && candidate.textContent.includes('全文搜索')
  );
  if (!searchTab) throw new Error('Missing full-text search tab.');
  searchTab.click();
  const searchInput = await waitFor('.search-form input');
  searchInput.value = '星河暗号';
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  const searchForm = await waitFor('.search-form');
  searchForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await waitFor('.search-results > button');
  const searchResults = document.querySelectorAll('.search-results > button').length;
  if (searchResults < 3) throw new Error('Full-text search did not match chapter, reference and backup content.');
  await captureCheckpoint('03-fulltext-index-1440x900');
  visited.push('reader-search');

  const qualityTab = Array.from(readerTabs.querySelectorAll('button')).find(
    (candidate) => candidate.textContent && candidate.textContent.includes('质检与续写')
  );
  if (!qualityTab) throw new Error('Missing quality tab.');
  qualityTab.click();
  const localQuality = Array.from((await waitFor('.workflow-actions')).querySelectorAll('button')).find(
    (candidate) => candidate.textContent && candidate.textContent.includes('本地全书质检')
  );
  if (!localQuality) throw new Error('Missing local quality action.');
  localQuality.click();
  const qualityReport = await waitFor('.quality-report');
  const qualityCoverage = (qualityReport.querySelector('header span')?.textContent || '').trim();
  if (!qualityCoverage.includes('3/3')) throw new Error('Quality coverage is incomplete: ' + qualityCoverage);
  const deepReport = await window.deepwrite.inkHub.runNovelDeepQuality({ entryId: fixtureEntry.id, confirmBillable: true });
  const deepTask = await window.deepwrite.inkHub.getNovelDeepQualityTask(fixtureEntry.id);
  const deepQualityReady = deepReport.coverage.length === 7 && deepTask?.status === 'completed' && deepTask.progress.completedWindows === deepTask.progress.totalWindows;
  if (!deepQualityReady) throw new Error('Deep-quality persisted workflow is incomplete.');
  const aiRepairAction = Array.from(qualityReport.querySelectorAll('button')).find(
    (candidate) => candidate.textContent && candidate.textContent.includes('一键 AI 修复全部')
  );
  if (!aiRepairAction) throw new Error('Quality report has no all-issues AI repair action.');
  aiRepairAction.click();
  await waitFor('#ai-repair-confirm-title');
  const confirmAiRepair = Array.from(document.querySelectorAll('.repair-confirm-backdrop button')).find(
    (candidate) => candidate.textContent && candidate.textContent.includes('确认并开始 AI 修复')
  );
  if (!confirmAiRepair) throw new Error('AI repair has no billable confirmation action.');
  confirmAiRepair.click();
  const repairProgress = await waitFor('.ai-repair-status', 20000);
  if (!(repairProgress.textContent || '').match(/AI 一键修复进度|批/u)) {
    throw new Error('AI repair does not expose persistent progress.');
  }
  const aiRepairReview = await waitFor('.ai-repair-review', 20000);
  const aiRepairReady = aiRepairReview.querySelectorAll('.repair-card').length > 0 &&
    (aiRepairReview.textContent || '').includes('Agents') &&
    (aiRepairReview.textContent || '').includes('Skills') &&
    Array.from(aiRepairReview.querySelectorAll('button')).some(
      (button) => button.textContent && button.textContent.includes('确认写回')
    );
  if (!aiRepairReady) throw new Error('AI repair review does not expose Agent/Skill routes and batch review.');
  const initialSelection = (aiRepairReview.querySelector('.repair-review__batch')?.textContent || '').trim();
  if (!initialSelection.includes('已选择 0 /')) {
    throw new Error('Generated repair drafts were silently pre-approved: ' + initialSelection);
  }
  const firstRepairArticle = aiRepairReview.querySelector('.repair-card');
  const acceptRepair = Array.from(firstRepairArticle?.querySelectorAll('button') || []).find(
    (candidate) => candidate.textContent && candidate.textContent.includes('接受修复')
  );
  if (!acceptRepair) throw new Error('AI repair proposal has no explicit accept action.');
  acceptRepair.click();
  await sleep(80);
  const selectionText = (aiRepairReview.querySelector('.repair-review__batch')?.textContent || '').trim();
  const confirmSelectedRepair = Array.from(aiRepairReview.querySelectorAll('.repair-review__batch button')).find(
    (candidate) => candidate.textContent && candidate.textContent.includes('确认写回 1 章')
  );
  const aiRepairSelectionReady =
    acceptRepair.getAttribute('aria-pressed') === 'true' &&
    selectionText.includes('已选择 1 /') &&
    Boolean(confirmSelectedRepair) &&
    !confirmSelectedRepair?.hasAttribute('disabled');
  if (!aiRepairSelectionReady) {
    throw new Error('Accept repair action did not expose a visible writeback-ready state: ' + selectionText);
  }
  const reviewTop = aiRepairReview.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: Math.max(0, reviewTop - 220), behavior: 'instant' });
  await sleep(5200);
  await captureCheckpoint('04-quality-repair-1440x900');
  const repairAction = Array.from(qualityReport.querySelectorAll('button')).find(
    (candidate) => candidate.textContent && candidate.textContent.includes('开始修复')
  );
  if (!repairAction) throw new Error('Quality report has no repair action.');
  repairAction.click();
  const repairEditor = await waitFor('.repair-editor');
  const repairReady = Boolean(repairEditor.querySelector('textarea')) &&
    Array.from(repairEditor.querySelectorAll('button')).some((button) => button.textContent && button.textContent.includes('确认写回原稿'));
  if (!repairReady) throw new Error('Repair workbench is incomplete.');
  visited.push('reader-quality');
  (await waitFor('.back-button')).click();
  await waitFor('.inkhub-library');

  await clickTab('Skills', '.skill-layout');
  visited.push('skills');
  const skillStatusNode = await waitFor('.capability-status span');
  const skillStarted = Date.now();
  while (
    Date.now() - skillStarted < 20000 &&
    /正在|检查/u.test(skillStatusNode.textContent || '')
  ) {
    await sleep(100);
  }
  const skillStatus = (skillStatusNode.textContent || '').trim();
  const skillMatch = skillStatus.match(/(\d+)\/(\d+) 个小说 Skills 已安装；(\d+)\/(\d+) 个剧情设计 Skills 已安装；(\d+)\/(\d+) 个全书创作内核 Skills 已安装；(\d+)\/(\d+) 个小说封面 Skills 已安装；(\d+)\/(\d+) 个通用文风预设已安装；(\d+)\/(\d+) 位专家智能体已加入团队/u);
  if (!skillMatch || skillMatch[1] !== skillMatch[2] || skillMatch[3] !== skillMatch[4] || skillMatch[5] !== skillMatch[6] || skillMatch[7] !== skillMatch[8] || skillMatch[9] !== skillMatch[10] || skillMatch[11] !== skillMatch[12]) {
    const [shortTeams, scriptTeams, longTeams] = await Promise.all([
      window.deepwrite.agentTeams.list('short'),
      window.deepwrite.agentTeams.list('script'),
      window.deepwrite.longAgentTeams.list()
    ]);
    const teamCounts = [shortTeams, scriptTeams, longTeams].map((settings) =>
      settings.teams.reduce((total, team) => total + team.subagents.length, 0)
    );
    const notices = Array.from(document.querySelectorAll('[role="alert"], .toast'))
      .map((element) => (element.textContent || '').trim())
      .filter(Boolean)
      .join(' | ');
    throw new Error(
      'Native capability installation is incomplete: ' + skillStatus +
      '; team counts=' + teamCounts.join('/') +
      (notices ? '; notice=' + notices : '')
    );
  }
  const styleCards = document.querySelectorAll('.style-preset-grid > article');
  if (styleCards.length !== 29) throw new Error('Expected 8 plot skills, 1 cover skill and 20 visible style presets.');
  await sleep(5200);
  await captureCheckpoint('05-skills-1440x900');

  await clickTab('Agents', '.agent-grid');
  visited.push('agents');
  await captureCheckpoint('06-agents-1440x900');
  await clickTab('视觉工坊', '.media-grid');
  visited.push('media');
  const coverStyles = await window.deepwrite.inkHubMedia.listCoverStyles();
  if (coverStyles.length !== 24) throw new Error('Expected 24 project-owned cover styles.');
  await waitFor('.cover-style-note');
  await captureCheckpoint('07-cover-illustration-1440x900');

  await clickSelector('[data-nav-id="directory"]', '.workspace-settings-panel');
  visited.push('directory');
  const modelPanel = await clickSelector(
    '[data-nav-id="models"]',
    '.workspace-settings-panel.is-model-config'
  );
  visited.push('models');
  if (/DeepWrite 官方模型|DeepWrite 免费模型|官方令牌/u.test(modelPanel.textContent || '')) {
    throw new Error('Legacy DeepWrite model UI is still visible.');
  }
  await captureCheckpoint('08-model-settings-1440x900');

  await clickSelector('[data-nav-id="inkhub-library"]', '.inkhub-library');
  const moreForTopic = await waitFor('[data-nav-id="more"]');
  if (moreForTopic.getAttribute('aria-expanded') !== 'true') moreForTopic.click();
  (await waitFor('[data-feature-id="topic-archive"]')).click();
  await waitFor('.topic-archive-record-header');
  (await waitFor('[data-topic-create-book]')).click();
  const seededTitle = await waitFor('.create-short-book-form input[type="text"]');
  if (seededTitle.value !== '验收用选题档案') throw new Error('Topic title did not prefill book creation.');
  const longTab = Array.from(document.querySelectorAll('.create-workspace-type-tab')).find((button) => (button.textContent || '').includes('长篇'));
  if (!longTab) throw new Error('Missing long-novel creation route.');
  longTab.click();
  const longTitle = await waitFor('input[placeholder="请输入长篇书名"]');
  longTitle.value = '结构报告验收作品';
  longTitle.dispatchEvent(new Event('input', { bubbles: true }));
  const createLongButton = await waitFor('.create-short-book-form button[type="submit"]');
  createLongButton.click();
  const longMenu = await waitFor('[aria-label="结构报告验收作品更多操作"]');
  const topicLinkStarted = Date.now();
  while (Date.now() - topicLinkStarted < 3000 && !JSON.parse(localStorage.getItem('inkhub-topic-archive-v1') || '[]')[0]?.bookLink) await sleep(60);
  const linkedTopic = JSON.parse(localStorage.getItem('inkhub-topic-archive-v1') || '[]')[0];
  if (linkedTopic?.bookLink?.workspaceType !== 'long' || linkedTopic.bookLink.title !== '结构报告验收作品') throw new Error('Created book was not linked back to the topic.');
  (await waitFor('[data-feature-id="topic-archive"]')).click();
  const unsavedEvidence = await waitFor('.topic-archive-evidence-form textarea');
  unsavedEvidence.value = '尚未保存的选题证据';
  unsavedEvidence.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(60);
  const originalConfirm = window.confirm;
  let discardAsked = false;
  window.confirm = () => { discardAsked = true; return false; };
  try { (await waitFor('[data-topic-open-book]')).click(); } finally { window.confirm = originalConfirm; }
  await sleep(60);
  if (!discardAsked || !document.querySelector('.topic-archive-dialog') || unsavedEvidence.value !== '尚未保存的选题证据') throw new Error('Opening topic planning silently discarded unsaved evidence.');
  unsavedEvidence.value = '';
  unsavedEvidence.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(60);
  (await waitFor('[data-topic-open-book]')).click();
  const planningStarted = Date.now();
  while (document.querySelector('.topic-archive-dialog') && Date.now() - planningStarted < 15000) await sleep(60);
  if (document.querySelector('.topic-archive-dialog')) throw new Error('Associated book planning did not open from its topic.');
  visited.push('topic-book');
  (await waitFor('[aria-label="结构报告验收作品更多操作"]')).click();
  await waitForVisible('.tree-node-action-menu');
  const manageStructure = Array.from(document.querySelectorAll('[role="menuitem"]')).find((button) => (button.textContent || '').includes('结构管理'));
  if (!manageStructure) throw new Error('Missing long-novel structure management route.');
  manageStructure.click();
  const outlinePanel = await waitFor('.outline-completeness');
  const outlineDetails = outlinePanel.querySelector('details');
  outlineDetails.querySelector('summary').click();
  await sleep(100);
  if (!outlineDetails.open || !outlinePanel.querySelector('[data-severity="action"]') || !outlinePanel.textContent.includes('人工确认')) {
    throw new Error('New-book outline report did not show actionable missing layers: ' + outlinePanel.textContent);
  }
  if (outlinePanel.scrollWidth > outlinePanel.clientWidth + 1) throw new Error('Outline report overflows its container.');
  (await waitFor('[data-action="inspect-outline-content"]')).click();
  const contentDetails = await waitFor('.outline-content-results');
  contentDetails.querySelector('summary').click(); await sleep(80);
  const contentReport = await waitFor('.outline-content-report');
  if (!contentReport.textContent.includes('已检查 2 / 2') || contentReport.querySelectorAll('[data-content-status="empty"]').length !== 2) throw new Error('New-book mainline and chapter content inspection failed: ' + contentReport.textContent);
  visited.push('outline-content');
  await captureCheckpoint('11-outline-report-1440x900');
  (await waitFor('[aria-label="关闭结构管理"]')).click();
  await sleep(100);
  visited.push('outline-report');

  await clickSelector('[data-nav-id="agent-teams"]', '.agent-team-settings');
  visited.push('agent-teams');
  await clickSelector('[aria-label="打开设置"]', '.settings-page');
  visited.push('settings');

  const unnamedControlNodes = Array.from(
    document.querySelectorAll('button, input, select, textarea, [role="button"]')
  ).filter((element) => {
    const text = (element.textContent || '').trim();
    const label = element.getAttribute('aria-label') || element.getAttribute('title') || '';
    if (element instanceof HTMLInputElement && element.type !== 'button') {
      return !label && !element.closest('label');
    }
    return !text && !label;
  });
  const unnamedControls = unnamedControlNodes.length;
  if (unnamedControls > 0) {
    const details = unnamedControlNodes.map((element) =>
      element.tagName.toLowerCase() +
      (element.getAttribute('type') ? '[type=' + element.getAttribute('type') + ']' : '') +
      (element.className ? '.' + String(element.className).replace(/\s+/gu, '.') : '')
    ).join(',');
    throw new Error('Found unnamed interactive controls: ' + unnamedControls + ' (' + details + ')');
  }

  if (document.documentElement.scrollWidth > document.documentElement.clientWidth) {
    throw new Error('The application has horizontal document overflow.');
  }

  return {
    title: document.title,
    visited,
    skillStatus,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    documentWidth: {
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth
    },
    unnamedControls,
    reader: { chapters: chapterButtons.length, volumeGroups, repairReady, aiRepairReady, aiRepairSelectionReady, deepQualityReady, storyStateReady, continuationReady, forecastReady, searchResults, qualityCoverage },
    writingGuideReady: true,
    topicArchiveReady: true,
    outlineReportReady: true,
    topicBookReady: true,
    authorPreferencesReady: true,
    novelHealthReady: true,
    outlineContentReady: true
  };
})()
`;

export async function runInkHubRendererAcceptance(
  window: BrowserWindow
): Promise<InkHubRendererAcceptanceResult> {
  const screenshotDirectory = process.env.INKHUB_ACCEPTANCE_SCREENSHOTS_DIR?.trim();
  if (screenshotDirectory) {
    await mkdir(screenshotDirectory, { recursive: true });
    window.setContentSize(1440, 900);
    window.show();
    await window.webContents.executeJavaScript(
      "window.__INKHUB_CAPTURE_SCREENSHOTS__ = true; window.__INKHUB_CAPTURE_SCREENSHOTS_ACK__ = '';",
      true
    );
  }

  const execution = window.webContents.executeJavaScript(acceptanceScript, true) as Promise<unknown>;
  let rendererFailure: unknown;
  void execution.catch((error: unknown) => { rendererFailure = error; });
  if (screenshotDirectory) {
    const checkpoints = [
      "09-writing-guide-1440x900",
      "10-topic-archive-1440x900",
      "12-author-preferences",
      "01-library-1440x900",
      "13-novel-health",
      "02-volume-reader-1440x900",
      "03-fulltext-index-1440x900",
      "04-quality-repair-1440x900",
      "05-skills-1440x900",
      "06-agents-1440x900",
      "07-cover-illustration-1440x900",
      "08-model-settings-1440x900",
      "11-outline-report-1440x900"
    ];
    for (const checkpoint of checkpoints) {
      const startedAt = Date.now();
      while (Date.now() - startedAt < 30_000) {
        if (rendererFailure) throw rendererFailure;
        const current = await window.webContents.executeJavaScript(
          "window.__INKHUB_CAPTURE_SCREENSHOTS_STEP__ || ''",
          true
        ) as string;
        if (current === checkpoint) break;
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      const current = await window.webContents.executeJavaScript(
        "window.__INKHUB_CAPTURE_SCREENSHOTS_STEP__ || ''",
        true
      ) as string;
      if (current !== checkpoint) {
        throw new Error(`Timed out waiting for screenshot checkpoint ${checkpoint}; current=${current}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      const image = await window.webContents.capturePage();
      await writeFile(join(screenshotDirectory, `${checkpoint}.jpg`), image.toJPEG(94));
      await window.webContents.executeJavaScript(
        `window.__INKHUB_CAPTURE_SCREENSHOTS_ACK__ = ${JSON.stringify(checkpoint)};`,
        true
      );
    }
  }
  const raw = await execution;
  if (!raw || typeof raw !== "object") {
    throw new Error("Renderer acceptance returned an invalid result.");
  }
  const result = raw as Partial<InkHubRendererAcceptanceResult>;
  if (
    result.title !== "墨枢" ||
    !Array.isArray(result.visited) ||
    result.visited.length !== 19 ||
    typeof result.skillStatus !== "string" ||
    result.unnamedControls !== 0 ||
    !result.reader ||
    result.reader.chapters !== 3 ||
    result.reader.volumeGroups !== 2 ||
    !result.reader.repairReady ||
    !result.reader.aiRepairReady ||
    !result.reader.aiRepairSelectionReady ||
    !result.reader.deepQualityReady ||
    !result.reader.storyStateReady ||
    !result.reader.continuationReady ||
    !result.reader.forecastReady ||
    result.writingGuideReady !== true ||
    result.topicArchiveReady !== true ||
    result.outlineReportReady !== true ||
    result.topicBookReady !== true || result.authorPreferencesReady !== true || result.novelHealthReady !== true || result.outlineContentReady !== true ||
    result.reader.searchResults < 3 ||
    !result.reader.qualityCoverage.includes("3/3")
  ) {
    throw new Error(`Renderer acceptance assertions failed: ${JSON.stringify(raw)}`);
  }
  return result as InkHubRendererAcceptanceResult;
}
