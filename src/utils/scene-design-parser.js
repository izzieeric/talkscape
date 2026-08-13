const fs = require('fs');
const path = require('path');

const DESIGN_FILE = path.join(__dirname, '../data/scenario-catalog.json');

const LEGACY_SCENARIO_ID_MAP = {
  '1.1': 'restaurant',
  '2.1': 'airport',
  '5.1': 'job-interview'
};

function normalizeText(value, fallback = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function splitTableRow(line = '') {
  return String(line)
    .split('|')
    .map((item) => item.trim())
    .filter((item) => item);
}

function buildLevelScenarioId(sceneCode, sceneTitle) {
  if (LEGACY_SCENARIO_ID_MAP[sceneCode]) {
    return LEGACY_SCENARIO_ID_MAP[sceneCode];
  }

  const safeCode = String(sceneCode || '').replace(/\./g, '-');
  const safeTitle = normalizeText(sceneTitle)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);

  return safeTitle ? `level-${safeCode}-${safeTitle}` : `level-${safeCode}`;
}

function buildCategoryDescription(categoryTitle, scenes = []) {
  if (!scenes.length) {
    return `${categoryTitle}相关的英语口语关卡练习`;
  }

  const sampleScenes = scenes.slice(0, 3).map((item) => item.title).join('、');
  return `${categoryTitle}类场景，包含 ${sampleScenes} 等分阶段口语练习。`;
}

function buildScenarioDescription(sceneTitle, tasks = []) {
  if (!tasks.length) {
    return `${sceneTitle}相关的英语口语闯关练习`;
  }

  const sampleTasks = tasks.slice(0, 3).map((item) => item.title).join('、');
  return `${sceneTitle}场景下的闯关练习，涵盖 ${sampleTasks} 等关键对话步骤。`;
}

function inferDifficultyByCategoryIndex(index) {
  if (index <= 4) return 'beginner';
  if (index <= 10) return 'intermediate';
  return 'advanced';
}

function parseSceneDesignMarkdown(markdown = '') {
  const lines = String(markdown || '').split(/\r?\n/);
  const categories = [];
  let currentCategory = null;
  let currentScenario = null;
  let categorySortOrder = 0;

  for (const rawLine of lines) {
    const line = String(rawLine || '').trim();
    if (!line) continue;

    const categoryMatch = line.match(/^##\s+(.+?)(?:\s+([^\s]+))?$/);
    if (categoryMatch && !/^##\s+汇总统计/.test(line)) {
      categorySortOrder += 1;
      const title = normalizeText(categoryMatch[1]).replace(/^[一二三四五六七八九十百零]+、/, '');
      const icon = normalizeText(categoryMatch[2]);
      currentCategory = {
        id: `level-category-${categorySortOrder}`,
        title,
        titleEn: '',
        icon: icon || '📚',
        description: '',
        descriptionEn: '',
        sortOrder: categorySortOrder,
        scenes: []
      };
      categories.push(currentCategory);
      currentScenario = null;
      continue;
    }

    const sceneMatch = line.match(/^###\s+场景\s+(\d+\.\d+)\s+·\s+(.+)$/);
    if (sceneMatch && currentCategory) {
      const sceneCode = normalizeText(sceneMatch[1]);
      const sceneTitle = normalizeText(sceneMatch[2]);
      currentScenario = {
        id: buildLevelScenarioId(sceneCode, sceneTitle),
        sceneCode,
        title: sceneTitle,
        titleEn: '',
        description: '',
        descriptionEn: '',
        difficulty: inferDifficultyByCategoryIndex(currentCategory.sortOrder),
        icon: currentCategory.icon || '📚',
        tags: ['level', currentCategory.id, sceneCode],
        sceneType: 'level',
        categoryId: currentCategory.id,
        sortOrder: currentCategory.scenes.length + 1,
        maxTurns: 6,
        subTasks: []
      };
      currentCategory.scenes.push(currentScenario);
      continue;
    }

    if (!currentScenario || !line.startsWith('|')) continue;

    const cells = splitTableRow(line);
    if (cells.length < 2) continue;
    if (cells[0] === '#' || /^-+$/.test(cells[0])) continue;
    if (!/^\d+$/.test(cells[0])) continue;

    const taskIndex = Number(cells[0]);
    const taskTitle = normalizeText(cells[1]);
    const taskDescription = normalizeText(cells[2] || taskTitle);

    currentScenario.subTasks.push({
      id: `${currentScenario.id}-task-${taskIndex}`,
      scenarioId: currentScenario.id,
      taskKey: `${currentScenario.sceneCode}.${taskIndex}`,
      title: taskTitle,
      description: taskDescription,
      promptHint: `当前目标是完成“${taskTitle}”这一环节，围绕该环节推进真实自然的英文对话。`,
      sortOrder: taskIndex
    });
  }

  return categories.map((category) => {
    const scenes = category.scenes.map((scene) => {
      const maxTurns = Math.max(4, Math.min(12, scene.subTasks.length + 2));
      return {
        ...scene,
        description: buildScenarioDescription(scene.title, scene.subTasks),
        maxTurns
      };
    });

    return {
      ...category,
      description: buildCategoryDescription(category.title, scenes),
      scenes
    };
  });
}

function loadLevelScenarioCatalog() {
  if (!fs.existsSync(DESIGN_FILE)) {
    return [];
  }

  const catalog = JSON.parse(fs.readFileSync(DESIGN_FILE, 'utf-8'));
  return Array.isArray(catalog) ? catalog : [];
}

module.exports = {
  DESIGN_FILE,
  LEGACY_SCENARIO_ID_MAP,
  loadLevelScenarioCatalog,
  parseSceneDesignMarkdown
};
