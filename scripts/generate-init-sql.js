const fs = require('fs');
const path = require('path');
const { loadLevelScenarioCatalog } = require('../src/utils/scene-design-parser');
const { listDefaultPromptBindings, listDefaultPromptSeeds } = require('../src/prompts/prompt-seeds');

const outputPath = path.join(__dirname, '../database/init-data.sql');

function sql(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/\\/g, '\\\\').replace(/\0/g, '\\0').replace(/'/g, "''")}'`;
}

function insert(table, columns, values) {
  const names = columns.map((column) => `\`${column}\``).join(', ');
  const updates = columns.map((column) => `\`${column}\`=VALUES(\`${column}\`)`).join(', ');
  return `INSERT INTO \`${table}\` (${names}) VALUES (${values.map(sql).join(', ')}) ON DUPLICATE KEY UPDATE ${updates};`;
}

const lines = [
  '-- Generated from repository-owned definitions. Do not edit manually.',
  '-- Contains no users, credentials, conversations, caches, or generated media.',
  'SET NAMES utf8mb4;',
  'SET FOREIGN_KEY_CHECKS=0;',
  'START TRANSACTION;',
  ''
];

const scenarioColumns = ['id', 'title', 'title_en', 'description', 'description_en', 'difficulty', 'icon', 'tags', 'sort_order', 'max_turns', 'scene_type', 'category_id', 'is_featured', 'is_active'];
for (const category of loadLevelScenarioCatalog()) {
  lines.push(insert('scenario_categories', ['id', 'title', 'title_en', 'icon', 'description', 'description_en', 'sort_order', 'is_active'], [category.id, category.title, category.titleEn || '', category.icon || '📚', category.description || '', category.descriptionEn || '', category.sortOrder || 0, 1]));
  for (const scene of category.scenes) {
    lines.push(insert('scenarios', scenarioColumns, [scene.id, scene.title, scene.titleEn || '', scene.description || '', scene.descriptionEn || '', scene.difficulty || 'beginner', scene.icon || category.icon || '📚', JSON.stringify(scene.tags || ['level']), scene.sortOrder || 0, scene.maxTurns || 8, 'level', category.id, 0, 1]));
    for (const task of scene.subTasks || []) {
      lines.push(insert('scenario_subtasks', ['id', 'scenario_id', 'task_key', 'title', 'description', 'prompt_hint', 'sort_order', 'is_active'], [task.id, scene.id, task.taskKey, task.title, task.description || '', task.promptHint || '', task.sortOrder || 0, 1]));
    }
  }
}

const manualScenarios = [
  ['free-talk', '自由对话', 'Free Talk', '不设固定关卡，自由进入一个真实场景开展口语练习。', 'Open-ended language speaking practice in a natural roleplay setting.', 'beginner', '🎙️', JSON.stringify(['free', 'open-conversation']), 1, 10, 'free', null, 0, 1],
  ['wordbook-review', '词本闯关', 'Wordbook Challenge', '围绕你的收藏单词进行引导式对话，帮助你把词真正说出来。', 'Practice speaking with your bookmarked vocabulary in guided conversations.', 'intermediate', '📚', JSON.stringify(['featured', 'wordbook', 'review']), 1, 12, 'featured', null, 1, 1]
];
for (const values of manualScenarios) lines.push(insert('scenarios', scenarioColumns, values));

const promptColumns = ['id', 'prompt_code', 'title', 'description', 'layer_code', 'feature', 'sub_feature_code', 'flow_code', 'target_id', 'category_key', 'source_ref', 'content', 'sort_order', 'is_builtin', 'is_active'];
for (const seed of listDefaultPromptSeeds()) {
  lines.push(insert('admin_ai_prompts', promptColumns, [seed.id, seed.promptCode, seed.title, seed.description || '', seed.layerCode, seed.feature || '', seed.subFeatureCode || '', seed.flowCode || '', seed.targetId || '', seed.categoryKey || '', seed.sourceRef || '', seed.content, seed.sortOrder || 0, seed.isBuiltin ? 1 : 0, 1]));
}
for (const binding of listDefaultPromptBindings()) {
  lines.push(insert('admin_prompt_bindings', ['owner_type', 'owner_id', 'feature', 'sub_feature_code', 'flow_code', 'layer_code', 'prompt_id', 'sort_order', 'is_active'], [binding.ownerType, binding.ownerId || 'default', binding.feature || '', binding.subFeatureCode || '', binding.flowCode || '', binding.layerCode, binding.promptId, binding.sortOrder || 0, 1]));
}

lines.push('', 'COMMIT;', 'SET FOREIGN_KEY_CHECKS=1;', '');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
console.log(`Generated ${outputPath}`);
