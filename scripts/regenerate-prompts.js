/**
 * 重新生成场景 & 子任务提示词（纯英文版）
 * 运行方式: node scripts/regenerate-prompts.js
 */
const path = require('path');

process.chdir(path.join(__dirname, '..'));

const knex = require('../src/db/knex');

// ===== 工具函数 =====

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
    '- Use short, practical follow-up questions that match this scene.',
  ].filter(Boolean);

  return {
    id: `prompt-conversation-scenario-${scenario.id}`,
    promptCode: `conversation.scenario.${scenario.id}.default`,
    title: `${scenario.title || title}场景默认提示词`,
    description: `${scenario.title || title}场景的默认提示词。`,
    layerCode: 'scenario',
    feature: 'conversation',
    subFeatureCode: 'roleplay',
    flowCode: 'reply',
    targetId: scenario.id,
    categoryKey: `scenario.${scenario.id}`,
    sourceRef: `seed/features/conversation/scenario/${scenario.id}`,
    sortOrder: 60,
    isBuiltin: 1,
    content: promptLines.join('\n'),
  };
}

function buildSubScenarioPromptSeed(scenario, subtask) {
  const scenarioTitle = scenario.title_en || scenario.title || scenario.id;
  const stepTitle = subtask.title || '';
  const promptLines = [
    `Current step: ${stepTitle}.`,
    `This step belongs to the "${scenarioTitle}" scene.`,
    'Keep the conversation focused on this current step until the learner clearly completes it.',
    'Use natural follow-up questions and prompts to move the conversation forward.',
  ].filter(Boolean);

  return {
    id: `prompt-conversation-sub-scenario-${subtask.id}`,
    promptCode: `conversation.sub-scenario.${subtask.id}.default`,
    title: `${subtask.title}关卡默认提示词`,
    description: `${scenario.title || scenarioTitle}场景下 ${subtask.title} 关卡的默认提示词。`,
    layerCode: 'sub_scenario',
    feature: 'conversation',
    subFeatureCode: 'roleplay',
    flowCode: 'reply',
    targetId: subtask.id,
    categoryKey: `sub-scenario.${scenario.id}`,
    sourceRef: `seed/features/conversation/sub-scenario/${subtask.id}`,
    sortOrder: 70,
    isBuiltin: 1,
    content: promptLines.join('\n'),
  };
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
      is_active: 1,
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
      updated_at: knex.fn.now(),
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
      is_active: 1,
    })
    .onConflict([
      'owner_type',
      'owner_id',
      'feature',
      'sub_feature_code',
      'flow_code',
      'layer_code',
      'prompt_id',
    ])
    .merge({
      sort_order: knex.raw('VALUES(sort_order)'),
      is_active: 1,
      updated_at: knex.fn.now(),
    });
}

async function main() {
  console.log('=== 开始重新生成场景提示词 ===\n');

  // 获取所有 level 场景的 ID
  const levelScenarios = await knex('scenarios')
    .select('id')
    .where('scene_type', 'level')
    .where('is_active', 1);
  const levelIds = levelScenarios.map((s) => s.id);
  console.log(`Level 场景数: ${levelIds.length}`);

  // 获取所有 level 场景的子任务 ID
  const levelSubtasks = await knex('scenario_subtasks')
    .select('id')
    .whereIn('scenario_id', levelIds);
  const subtaskIds = levelSubtasks.map((st) => st.id);
  console.log(`子任务数: ${subtaskIds.length}`);

  // step 1: 先删 bindings（外键约束，必须先删）
  if (levelIds.length > 0) {
    const delBindScenario = await knex('admin_prompt_bindings')
      .where('owner_type', 'scenario')
      .whereIn('owner_id', levelIds)
      .del();
    console.log(`已删除 ${delBindScenario} 个场景 bindings`);
  }

  if (subtaskIds.length > 0) {
    const delBindSub = await knex('admin_prompt_bindings')
      .where('owner_type', 'sub_scenario')
      .whereIn('owner_id', subtaskIds)
      .del();
    console.log(`已删除 ${delBindSub} 个子任务 bindings`);
  }

  // step 2: 删 prompts
  if (levelIds.length > 0) {
    const delPromptScenario = await knex('admin_ai_prompts')
      .whereIn('target_id', levelIds)
      .where('layer_code', 'scenario')
      .del();
    console.log(`已删除 ${delPromptScenario} 个场景 prompts`);
  }

  if (subtaskIds.length > 0) {
    const delPromptSub = await knex('admin_ai_prompts')
      .whereIn('target_id', subtaskIds)
      .where('layer_code', 'sub_scenario')
      .del();
    console.log(`已删除 ${delPromptSub} 个子任务 prompts`);
  }

  // step 3: 重新生成场景提示词
  const scenarios = await knex('scenarios as s')
    .select(
      's.id',
      's.title',
      's.title_en',
      's.description',
      's.description_en',
      's.scene_type',
      'c.title as category_title'
    )
    .leftJoin('scenario_categories as c', 'c.id', 's.category_id')
    .where('s.is_active', 1)
    .orderBy([
      { column: 's.sort_order', order: 'asc' },
      { column: 's.created_at', order: 'asc' },
    ]);

  let scenarioCount = 0;
  for (const scenario of scenarios) {
    // 跳过 5 个手工场景（已有 prompt-seeds 生成）
    const existing = await knex('admin_ai_prompts')
      .where({
        layer_code: 'scenario',
        feature: 'conversation',
        sub_feature_code: 'roleplay',
        flow_code: 'reply',
        target_id: scenario.id,
      })
      .first();

    if (existing) {
      console.log(`  跳过: ${scenario.title_en || scenario.title}`);
      continue;
    }

    const prompt = buildScenarioPromptSeed(scenario);
    await upsertPromptSeed(prompt);
    await upsertPromptBinding({
      ownerType: 'scenario',
      ownerId: scenario.id,
      feature: 'conversation',
      subFeatureCode: 'roleplay',
      flowCode: 'reply',
      layerCode: 'scenario',
      promptId: prompt.id,
      sortOrder: 60,
    });
    scenarioCount++;
    console.log(`  + ${scenario.title_en || scenario.title}`);
  }

  // step 4: 重新生成子任务提示词
  const subtasks = await knex('scenario_subtasks as st')
    .select(
      'st.id',
      'st.title',
      'st.description',
      'st.prompt_hint',
      'st.scenario_id',
      's.title as scenario_title',
      's.title_en as scenario_title_en'
    )
    .innerJoin('scenarios as s', 's.id', 'st.scenario_id')
    .where('st.is_active', 1)
    .orderBy([
      { column: 'st.sort_order', order: 'asc' },
      { column: 'st.created_at', order: 'asc' },
    ]);

  let subCount = 0;
  for (const subtask of subtasks) {
    const existing = await knex('admin_ai_prompts')
      .where({
        layer_code: 'sub_scenario',
        feature: 'conversation',
        sub_feature_code: 'roleplay',
        flow_code: 'reply',
        target_id: subtask.id,
      })
      .first();
    if (existing) continue;

    const prompt = buildSubScenarioPromptSeed(
      {
        id: subtask.scenario_id,
        title: subtask.scenario_title,
        title_en: subtask.scenario_title_en,
      },
      subtask
    );

    await upsertPromptSeed(prompt);
    await upsertPromptBinding({
      ownerType: 'sub_scenario',
      ownerId: subtask.id,
      feature: 'conversation',
      subFeatureCode: 'roleplay',
      flowCode: 'reply',
      layerCode: 'sub_scenario',
      promptId: prompt.id,
      sortOrder: 70,
    });
    subCount++;
  }

  console.log(`\n=== 完成 ===`);
  console.log(`新增场景提示词: ${scenarioCount}`);
  console.log(`新增子任务提示词: ${subCount}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('出错:', err);
    process.exit(1);
  });
