const knex = require('./knex');
const { loadLevelScenarioCatalog } = require('../utils/scene-design-parser');
const {
  PROMPT_BINDING_OWNER_TYPES,
  PROMPT_LAYER_CODES,
  isCodeManagedLayer,
  listDefaultPromptBindings,
  listDefaultPromptSeeds
} = require('../prompts/prompt-seeds');
const { isPromptLayerEditable } = require('../prompts/prompt-feature-meta');

function getDb() {
  return knex;
}

async function upsertScenarioCategory(category) {
  await knex('scenario_categories')
    .insert({
      id: category.id,
      title: category.title,
      title_en: category.titleEn || '',
      icon: category.icon || '📚',
      description: category.description || '',
      description_en: category.descriptionEn || '',
      sort_order: category.sortOrder || 0,
      is_active: 1
    })
    .onConflict('id')
    .merge({
      title: knex.raw('VALUES(title)'),
      title_en: knex.raw('VALUES(title_en)'),
      icon: knex.raw('VALUES(icon)'),
      description: knex.raw('VALUES(description)'),
      description_en: knex.raw('VALUES(description_en)'),
      sort_order: knex.raw('VALUES(sort_order)'),
      is_active: 1,
      updated_at: knex.fn.now()
    });
}

async function upsertScenario(scenario) {
  await knex('scenarios')
    .insert({
      id: scenario.id,
      title: scenario.title,
      title_en: scenario.title_en || '',
      description: scenario.description || '',
      description_en: scenario.description_en || '',
      difficulty: scenario.difficulty || 'beginner',
      icon: scenario.icon || '💬',
      tags: scenario.tags || '[]',
      sort_order: scenario.sort_order || 0,
      max_turns: scenario.max_turns || 10,
      scene_type: scenario.scene_type || 'level',
      category_id: scenario.category_id || null,
      is_featured: scenario.is_featured || 0,
      is_active: 1
    })
    .onConflict('id')
    .merge({
      title: knex.raw('VALUES(title)'),
      title_en: knex.raw('VALUES(title_en)'),
      description: knex.raw('VALUES(description)'),
      description_en: knex.raw('VALUES(description_en)'),
      difficulty: knex.raw('VALUES(difficulty)'),
      icon: knex.raw('VALUES(icon)'),
      tags: knex.raw('VALUES(tags)'),
      sort_order: knex.raw('VALUES(sort_order)'),
      max_turns: knex.raw('VALUES(max_turns)'),
      scene_type: knex.raw('VALUES(scene_type)'),
      category_id: knex.raw('VALUES(category_id)'),
      is_featured: knex.raw('VALUES(is_featured)'),
      is_active: 1,
      updated_at: knex.fn.now()
    });
}

async function upsertScenarioSubtask(subtask) {
  await knex('scenario_subtasks')
    .insert({
      id: subtask.id,
      scenario_id: subtask.scenarioId,
      task_key: subtask.taskKey,
      title: subtask.title,
      description: subtask.description || '',
      prompt_hint: subtask.promptHint || '',
      sort_order: subtask.sortOrder || 0,
      is_active: 1
    })
    .onConflict(['scenario_id', 'task_key'])
    .merge({
      title: knex.raw('VALUES(title)'),
      description: knex.raw('VALUES(description)'),
      prompt_hint: knex.raw('VALUES(prompt_hint)'),
      sort_order: knex.raw('VALUES(sort_order)'),
      is_active: 1,
      updated_at: knex.fn.now()
    });
}

function buildManualScenes() {
  return [
    {
      id: 'free-talk',
      title: '自由对话',
      title_en: 'Free Talk',
      description: '不设固定关卡，自由进入一个真实场景开展英语对话练习。',
      description_en: 'Open-ended English speaking practice in a natural roleplay setting.',
      difficulty: 'beginner',
      icon: '🎙️',
      tags: JSON.stringify(['free', 'open-conversation']),
      sort_order: 1,
      max_turns: 10,
      scene_type: 'free',
      category_id: null,
      is_featured: 0
    },
    {
      id: 'wordbook-review',
      title: '词本闯关',
      title_en: 'Wordbook Challenge',
      description: '围绕你的收藏单词进行引导式对话，帮助你把词真正说出来。',
      description_en: 'Practice speaking with your bookmarked vocabulary in guided conversations.',
      difficulty: 'intermediate',
      icon: '📚',
      tags: JSON.stringify(['featured', 'wordbook', 'review']),
      sort_order: 1,
      max_turns: 12,
      scene_type: 'featured',
      category_id: null,
      is_featured: 1
    }
  ];
}

async function upsertPromptSeed(row) {
  await knex('admin_ai_prompts')
    .insert({
      id: row.id,
      prompt_code: row.promptCode,
      title: row.title,
      description: row.description || '',
      layer_code: row.layerCode,
      feature: row.feature || '',
      sub_feature_code: row.subFeatureCode || '',
      flow_code: row.flowCode || '',
      target_id: row.targetId || '',
      category_key: row.categoryKey || '',
      source_ref: row.sourceRef || '',
      content: row.content,
      sort_order: row.sortOrder || 0,
      is_builtin: row.isBuiltin ? 1 : 0,
      is_active: 1
    })
    .onConflict('prompt_code')
    .merge({
      title: knex.raw('VALUES(title)'),
      description: knex.raw('VALUES(description)'),
      layer_code: knex.raw('VALUES(layer_code)'),
      feature: knex.raw('VALUES(feature)'),
      sub_feature_code: knex.raw('VALUES(sub_feature_code)'),
      flow_code: knex.raw('VALUES(flow_code)'),
      target_id: knex.raw('VALUES(target_id)'),
      category_key: knex.raw('VALUES(category_key)'),
      source_ref: knex.raw('VALUES(source_ref)'),
      content: knex.raw('VALUES(content)'),
      sort_order: knex.raw('VALUES(sort_order)'),
      is_builtin: knex.raw('VALUES(is_builtin)'),
      is_active: 1,
      updated_at: knex.fn.now()
    });
}

async function upsertPromptBinding(row) {
  await knex('admin_prompt_bindings')
    .insert({
      owner_type: row.ownerType,
      owner_id: row.ownerId || 'default',
      feature: row.feature || '',
      sub_feature_code: row.subFeatureCode || '',
      flow_code: row.flowCode || '',
      layer_code: row.layerCode,
      prompt_id: row.promptId,
      sort_order: row.sortOrder || 0,
      is_active: 1
    })
    .onConflict(['owner_type', 'owner_id', 'feature', 'sub_feature_code', 'flow_code', 'layer_code', 'prompt_id'])
    .merge({
      sort_order: knex.raw('VALUES(sort_order)'),
      is_active: 1,
      updated_at: knex.fn.now()
    });
}

async function hasPromptForTarget({
  layerCode,
  feature = '',
  subFeatureCode = '',
  flowCode = '',
  targetId = ''
} = {}) {
  const row = await knex('admin_ai_prompts')
    .select('id')
    .where({
      layer_code: layerCode,
      feature: feature || '',
      sub_feature_code: subFeatureCode || '',
      flow_code: flowCode || '',
      target_id: targetId || ''
    })
    .first();

  return Boolean(row?.id);
}

async function hasPromptById(promptId = '') {
  const row = await knex('admin_ai_prompts')
    .select('id')
    .where('id', String(promptId || '').trim())
    .first();
  return Boolean(row?.id);
}

async function hasBindingForSlot({
  ownerType,
  ownerId = 'default',
  feature = '',
  subFeatureCode = '',
  flowCode = '',
  layerCode
} = {}) {
  const row = await knex('admin_prompt_bindings')
    .select('id')
    .where({
      owner_type: ownerType,
      owner_id: ownerId || 'default',
      feature: feature || '',
      sub_feature_code: subFeatureCode || '',
      flow_code: flowCode || '',
      layer_code: layerCode,
      is_active: 1
    })
    .first();
  return Boolean(row?.id);
}

function getCodeManagedLayerCodes() {
  return Object.values(PROMPT_LAYER_CODES).filter((layerCode) => isCodeManagedLayer(layerCode));
}

async function cleanupCodeManagedPromptCatalog() {
  const codeManagedLayers = getCodeManagedLayerCodes();
  if (!codeManagedLayers.length) return;

  await knex.transaction(async (trx) => {
    const codeManagedPromptIds = await trx('admin_ai_prompts')
      .pluck('id')
      .whereIn('layer_code', codeManagedLayers);

    await trx('admin_prompt_bindings')
      .whereIn('layer_code', codeManagedLayers)
      .delete();

    if (codeManagedPromptIds.length) {
      await trx('admin_prompt_bindings')
        .whereIn('prompt_id', codeManagedPromptIds)
        .delete();
    }

    await trx('admin_ai_prompts')
      .whereIn('layer_code', codeManagedLayers)
      .delete();
  });
}

function buildScenarioPromptSeed(scenario) {
  const sceneType = String(scenario.scene_type || 'level').trim() || 'level';
  const title = scenario.title_en || scenario.title || scenario.id;
  const focus = scenario.description_en || scenario.description || '';
  const categoryTitle = scenario.category_title || '';
  const promptLines = [
    `You are running the "${title}" conversation scene in TalkScape.`,
    '',
    'Scene focus:',
    focus ? `- ${focus}` : '',
    categoryTitle ? `- Category: ${categoryTitle}.` : '',
    sceneType === 'level'
      ? '- Keep the roleplay realistic and move through the level step by step.'
      : sceneType === 'featured'
        ? '- Keep the conversation aligned with the featured gameplay while sounding natural.'
        : '- Keep the conversation open-ended, natural, and easy to continue.',
    '- Stay inside the scene setting and keep the learner on-topic.',
    '- Use short, practical follow-up questions that match this scene.'
  ].filter(Boolean);

  return {
    id: `prompt-conversation-scenario-${scenario.id}`,
    promptCode: `conversation.scenario.${scenario.id}.default`,
    title: `${scenario.title || title}场景默认提示词`,
    description: `${scenario.title || title}场景的默认提示词。`,
    layerCode: PROMPT_LAYER_CODES.SCENARIO,
    feature: 'conversation',
    subFeatureCode: 'roleplay',
    flowCode: 'reply',
    targetId: scenario.id,
    categoryKey: `scenario.${scenario.id}`,
    sourceRef: `seed/features/conversation/scenario/${scenario.id}`,
    sortOrder: 60,
    isBuiltin: 1,
    content: promptLines.join('\n')
  };
}

function buildSubScenarioPromptSeed(scenario, subtask) {
  const scenarioTitle = scenario.title_en || scenario.title || scenario.id;
  const stepTitle = subtask.title || '';
  const stepDescription = subtask.description || '';
  const stepHint = subtask.prompt_hint || '';
  const promptLines = [
    `Current step: ${stepTitle}.`,
    stepDescription ? `What to do: ${stepDescription}` : '',
    stepHint ? `Coaching note: Guide the learner naturally through "${stepTitle}". Help them practice the target conversation without explicitly revealing the hidden curriculum.` : '',
    `This step belongs to the "${scenarioTitle}" scene.`,
    'Keep the conversation focused on this current step until the learner clearly completes it.',
    'Use natural follow-up questions and prompts to move the conversation forward.'
  ].filter(Boolean);

  return {
    id: `prompt-conversation-sub-scenario-${subtask.id}`,
    promptCode: `conversation.sub-scenario.${subtask.id}.default`,
    title: `${subtask.title}关卡默认提示词`,
    description: `${scenario.title || scenarioTitle}场景下 ${subtask.title} 关卡的默认提示词。`,
    layerCode: PROMPT_LAYER_CODES.SUB_SCENARIO,
    feature: 'conversation',
    subFeatureCode: 'roleplay',
    flowCode: 'reply',
    targetId: subtask.id,
    categoryKey: `sub-scenario.${scenario.id}`,
    sourceRef: `seed/features/conversation/sub-scenario/${subtask.id}`,
    sortOrder: 70,
    isBuiltin: 1,
    content: promptLines.join('\n')
  };
}

async function syncScenarioPromptCatalog() {
  const scenarios = await knex('scenarios as s')
    .select('s.id', 's.title', 's.title_en', 's.description', 's.scene_type', 'c.title as category_title')
    .leftJoin('scenario_categories as c', 'c.id', 's.category_id')
    .where('s.is_active', 1)
    .orderBy([{ column: 's.sort_order', order: 'asc' }, { column: 's.created_at', order: 'asc' }]);

  for (const scenario of scenarios) {
    if (!(await hasPromptForTarget({
      layerCode: PROMPT_LAYER_CODES.SCENARIO,
      feature: 'conversation',
      subFeatureCode: 'roleplay',
      flowCode: 'reply',
      targetId: scenario.id
    }))) {
      const prompt = buildScenarioPromptSeed(scenario);
      await upsertPromptSeed(prompt);
      await upsertPromptBinding({
        ownerType: PROMPT_BINDING_OWNER_TYPES.SCENARIO,
        ownerId: scenario.id,
        feature: 'conversation',
        subFeatureCode: 'roleplay',
        flowCode: 'reply',
        layerCode: PROMPT_LAYER_CODES.SCENARIO,
        promptId: prompt.id,
        sortOrder: 60
      });
    }
  }

  const subtasks = await knex('scenario_subtasks as st')
    .select('st.id', 'st.title', 'st.description', 'st.prompt_hint', 'st.scenario_id', 's.title as scenario_title', 's.title_en as scenario_title_en')
    .innerJoin('scenarios as s', 's.id', 'st.scenario_id')
    .where('st.is_active', 1)
    .orderBy([{ column: 'st.sort_order', order: 'asc' }, { column: 'st.created_at', order: 'asc' }]);

  for (const subtask of subtasks) {
    if (!(await hasPromptForTarget({
      layerCode: PROMPT_LAYER_CODES.SUB_SCENARIO,
      feature: 'conversation',
      subFeatureCode: 'roleplay',
      flowCode: 'reply',
      targetId: subtask.id
    }))) {
      const prompt = buildSubScenarioPromptSeed({
        id: subtask.scenario_id,
        title: subtask.scenario_title,
        title_en: subtask.scenario_title_en
      }, subtask);
      await upsertPromptSeed(prompt);
      await upsertPromptBinding({
        ownerType: PROMPT_BINDING_OWNER_TYPES.SUB_SCENARIO,
        ownerId: subtask.id,
        feature: 'conversation',
        subFeatureCode: 'roleplay',
        flowCode: 'reply',
        layerCode: PROMPT_LAYER_CODES.SUB_SCENARIO,
        promptId: prompt.id,
        sortOrder: 70
      });
    }
  }
}

async function initPromptCatalog() {
  await cleanupCodeManagedPromptCatalog();

  const seeds = listDefaultPromptSeeds().filter((seed) => isPromptLayerEditable(seed.layerCode));
  for (const seed of seeds) {
    if (!String(seed.content || '').trim()) continue;
    if (!(await hasPromptById(seed.id))) {
      await upsertPromptSeed(seed);
    }
  }

  const bindings = listDefaultPromptBindings().filter((binding) => isPromptLayerEditable(binding.layerCode));
  for (const binding of bindings) {
    if (!(await hasBindingForSlot(binding))) {
      await upsertPromptBinding(binding);
    }
  }

  await syncScenarioPromptCatalog();
}

async function initScenarioCatalog() {
  const levelCategories = loadLevelScenarioCatalog();

  for (const category of levelCategories) {
    await upsertScenarioCategory(category);
    for (const scene of category.scenes) {
      await upsertScenario({
        id: scene.id,
        title: scene.title,
        title_en: scene.titleEn || '',
        description: scene.description,
        description_en: scene.descriptionEn || '',
        difficulty: scene.difficulty || 'beginner',
        icon: scene.icon || category.icon || '📚',
        tags: JSON.stringify(scene.tags || ['level']),
        sort_order: scene.sortOrder || 0,
        max_turns: scene.maxTurns || 8,
        scene_type: 'level',
        category_id: category.id,
        is_featured: 0
      });

      for (const subtask of scene.subTasks || []) {
        await upsertScenarioSubtask(subtask);
      }
    }
  }

  for (const scenario of buildManualScenes()) {
    await upsertScenario(scenario);
  }
}

async function init() {
  console.log('Initializing database seeds...');
  await initScenarioCatalog();
  await initPromptCatalog();
  console.log('Database seeds initialized');
}

module.exports = {
  getDb,
  init
};
