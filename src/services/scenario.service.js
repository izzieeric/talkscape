const { randomUUID } = require('crypto');
const db = require('../db');
const promptConfigService = require('./prompt-config.service');

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBoolean(value) {
  return value === true || value === 'true' || value === '1' || value === 1 || value === 'on';
}

function slugifyToken(value, fallback = 'item') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function buildScenarioId(value, fallbackTitle = '') {
  return slugifyToken(value || fallbackTitle, `scene-${randomUUID().slice(0, 8)}`);
}

function buildSubtaskId(scenarioId, taskKey) {
  return `${scenarioId}-${slugifyToken(taskKey, randomUUID().slice(0, 8))}`;
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => normalizeText(item)).filter(Boolean))];
  }

  return [...new Set(
    String(value || '')
      .split(/[\n,，]/)
      .map((item) => normalizeText(item))
      .filter(Boolean)
  )];
}

function normalizeScenarioInput(input = {}, { existingId = '' } = {}) {
  const title = normalizeText(input.title);
  const id = normalizeText(existingId || input.id || buildScenarioId(input.id, title));

  if (!title) {
    const error = new Error('场景标题不能为空');
    error.status = 400;
    throw error;
  }

  return {
    id,
    title,
    title_en: normalizeText(input.titleEn || input.title_en),
    description: normalizeText(input.description),
    description_en: normalizeText(input.descriptionEn || input.description_en),
    difficulty: normalizeText(input.difficulty, 'beginner'),
    icon: normalizeText(input.icon, '💬'),
    tags: normalizeTags(input.tagsText || input.tags),
    sort_order: normalizeInteger(input.sortOrder || input.sort_order, 0),
    max_turns: Math.max(1, normalizeInteger(input.maxTurns || input.max_turns, 10)),
    scene_type: normalizeText(input.sceneType || input.scene_type, 'level'),
    category_id: normalizeText(input.categoryId || input.category_id) || null,
    is_featured: normalizeBoolean(input.isFeatured || input.is_featured) ? 1 : 0,
    is_active: 1
  };
}

function normalizeSubtasksInput(rawValue, scenarioId) {
  let parsed = rawValue;
  if (typeof rawValue === 'string') {
    try {
      parsed = JSON.parse(rawValue || '[]');
    } catch {
      const error = new Error('关卡数据格式不正确');
      error.status = 400;
      throw error;
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item, index) => {
      const title = normalizeText(item?.title);
      const taskKey = slugifyToken(item?.taskKey || item?.task_key || title, `task-${index + 1}`);
      if (!title) return null;

      return {
        id: normalizeText(item?.id) || buildSubtaskId(scenarioId, taskKey),
        scenario_id: scenarioId,
        task_key: taskKey,
        title,
        description: normalizeText(item?.description),
        prompt_hint: normalizeText(item?.promptHint || item?.prompt_hint),
        sort_order: normalizeInteger(item?.sortOrder || item?.sort_order, (index + 1) * 10),
        is_active: 1
      };
    })
    .filter(Boolean);
}

async function syncScenarioSubtasks(trx, scenarioId, subtasks = []) {
  const existingRows = await trx('scenario_subtasks')
    .where({ scenario_id: scenarioId })
    .select('id');
  const existingIds = new Set(existingRows.map((item) => item.id));
  const keepIds = new Set();

  for (const item of subtasks) {
    keepIds.add(item.id);

    if (existingIds.has(item.id)) {
      await trx('scenario_subtasks')
        .where({ id: item.id })
        .update({
          task_key: item.task_key,
          title: item.title,
          description: item.description,
          prompt_hint: item.prompt_hint,
          sort_order: item.sort_order,
          is_active: 1,
          updated_at: trx.fn.now()
        });
    } else {
      await trx('scenario_subtasks').insert(item);
    }
  }

  const removedIds = [...existingIds].filter((id) => !keepIds.has(id));
  if (removedIds.length) {
    await trx('scenario_subtasks')
      .whereIn('id', removedIds)
      .update({
        is_active: 0,
        updated_at: trx.fn.now()
      });
  }
}

function mapSubtask(row) {
  return {
    id: row.id,
    scenario_id: row.scenario_id,
    scenarioId: row.scenario_id,
    task_key: row.task_key,
    taskKey: row.task_key,
    title: row.title,
    description: row.description || '',
    prompt_hint: row.prompt_hint || '',
    promptHint: row.prompt_hint || '',
    sort_order: row.sort_order || 0,
    sortOrder: row.sort_order || 0
  };
}

async function attachScenarioRelations(rows = []) {
  const knex = db.getDb();
  const categories = await knex('scenario_categories')
    .where('is_active', 1);
  const categoryMap = new Map(categories.map((item) => [item.id, item]));

  const subtasks = await knex('scenario_subtasks')
    .where('is_active', 1)
    .orderBy([{ column: 'sort_order', order: 'asc' }, { column: 'id', order: 'asc' }]);
  
  const subtaskMap = new Map();
  for (const item of subtasks) {
    if (!subtaskMap.has(item.scenario_id)) {
      subtaskMap.set(item.scenario_id, []);
    }
    subtaskMap.get(item.scenario_id).push(mapSubtask(item));
  }

  return rows.map((row) => {
    const category = row.category_id ? categoryMap.get(row.category_id) : null;
    const scenarioSubtasks = subtaskMap.get(row.id) || [];
    return {
      ...row,
      tags: parseJsonArray(row.tags),
      scene_type: row.scene_type || 'level',
      sceneType: row.scene_type || 'level',
      is_featured: Number(row.is_featured || 0),
      isFeatured: Number(row.is_featured || 0) === 1,
      category_id: row.category_id || '',
      categoryId: row.category_id || '',
      category_title: category?.title || '',
      categoryTitle: category?.title || '',
      category_title_en: category?.title_en || '',
      categoryTitleEn: category?.title_en || '',
      category_icon: category?.icon || '',
      categoryIcon: category?.icon || '',
      category_sort_order: category?.sort_order || 0,
      categorySortOrder: category?.sort_order || 0,
      subTasks: scenarioSubtasks,
      subTaskCount: scenarioSubtasks.length,
      defaultSubTaskId: scenarioSubtasks[0]?.id || ''
    };
  });
}

exports.getAllScenarios = async () => {
  const knex = db.getDb();
  const rows = await knex('scenarios')
    .where('is_active', 1)
    .orderByRaw(`
      CASE scene_type WHEN 'featured' THEN 0 WHEN 'free' THEN 1 ELSE 2 END,
      COALESCE(category_id, ''),
      sort_order ASC,
      id ASC
    `);
  return await attachScenarioRelations(rows);
};

exports.getScenarioById = async (id) => {
  const knex = db.getDb();
  const row = await knex('scenarios').where({ id }).first();
  return row ? (await attachScenarioRelations([row]))[0] : null;
};

exports.getScenarioConfig = async (scenarioId) => {
  const knex = db.getDb();
  const configs = await knex('scenario_configs').select('config_key', 'config_value').where({ scenario_id: scenarioId });
  const configMap = {};
  for (const row of configs) {
    configMap[row.config_key] = row.config_value;
  }
  return configMap;
};

exports.getUserScenarios = async (userId) => {
  const knex = db.getDb();
  const rows = await knex('user_scenarios as us')
    .select('s.*')
    .innerJoin('scenarios as s', 's.id', 'us.scenario_id')
    .where('us.user_id', userId)
    .andWhere('us.del', 0)
    .andWhere('s.is_active', 1)
    .orderBy([
      { column: 'us.updated_at', order: 'desc' },
      { column: 's.sort_order', order: 'asc' }
    ]);

  const scenarios = await attachScenarioRelations(rows);
  const scenarioIds = scenarios.map((item) => item.id).filter(Boolean);
  if (!scenarioIds.length) {
    return scenarios;
  }

  const sessionRows = await knex('conversation_sessions')
    .select('id', 'scenario_id', 'sub_task_id', 'status', 'started_at', 'completed_at')
    .where({ user_id: userId, del: 0 })
    .whereIn('scenario_id', scenarioIds)
    .orderByRaw("scenario_id ASC, CASE WHEN status = 'active' THEN 0 ELSE 1 END ASC, COALESCE(completed_at, started_at) DESC");

  const sessionMap = new Map();
  for (const row of sessionRows) {
    if (!sessionMap.has(row.scenario_id)) {
      sessionMap.set(row.scenario_id, row);
    }
  }

  return scenarios.map((item) => {
    const resumeSession = sessionMap.get(item.id);
    return {
      ...item,
      resumeSessionId: resumeSession?.id || '',
      resumeSubTaskId: resumeSession?.sub_task_id || '',
      resumeSessionStatus: resumeSession?.status || ''
    };
  });
};

exports.getUserScenarioProgress = async (userId) => {
  const knex = db.getDb();
  const hasCompletionOutcome = await knex.schema.hasColumn('conversation_sessions', 'completion_outcome');
  const rows = await knex('conversation_sessions')
    .select('scenario_id')
    .max('completed_at as completed_at')
    .where({ user_id: userId, status: 'completed', del: 0 })
    .modify((query) => {
      if (hasCompletionOutcome) {
        query.andWhere('completion_outcome', 'success');
      }
    })
    .whereNotNull('completed_at')
    .groupBy('scenario_id')
    .orderBy('completed_at', 'desc');

  const completedScenarioIds = rows
    .map((item) => String(item?.scenario_id || '').trim())
    .filter(Boolean);

  const completedScenarioMap = rows.reduce((acc, item) => {
    const scenarioId = String(item?.scenario_id || '').trim();
    if (!scenarioId) return acc;
    acc[scenarioId] = {
      completed: true,
      completedAt: item.completed_at || null
    };
    return acc;
  }, {});

  return {
    completedScenarioIds,
    completedScenarioMap
  };
};

exports.addUserScenario = async (userId, scenarioId) => {
  const knex = db.getDb();
  const scenarioRow = await knex('scenarios').where({ id: scenarioId }).first();

  if (!scenarioRow || scenarioRow.is_active !== 1) {
    const error = new Error('Scenario not found');
    error.status = 404;
    throw error;
  }

  await knex('user_scenarios')
    .insert({
      user_id: userId,
      scenario_id: scenarioId,
      updated_at: knex.fn.now(),
      del: 0,
      deleted_at: null
    })
    .onConflict(['user_id', 'scenario_id'])
    .merge({
      updated_at: knex.fn.now(),
      del: 0,
      deleted_at: null
    });

  return await exports.getScenarioById(scenarioId);
};

exports.removeUserScenario = async (userId, scenarioId) => {
  const knex = db.getDb();
  await knex('user_scenarios')
    .where({ user_id: userId, scenario_id: scenarioId, del: 0 })
    .update({
      del: 1,
      deleted_at: knex.fn.now(),
      updated_at: knex.fn.now()
    });

  return { userId, scenarioId };
};

exports.saveScenarioConfig = async (scenarioId, key, value) => {
  const knex = db.getDb();
  await knex('scenario_configs')
    .insert({
      scenario_id: scenarioId,
      config_key: key,
      config_value: value
    })
    .onConflict(['scenario_id', 'config_key'])
    .merge({
      config_value: value
    });
};

exports.getScenarioSubtaskById = async (scenarioId, subtaskId) => {
  const knex = db.getDb();
  const row = await knex('scenario_subtasks')
    .where({
      scenario_id: scenarioId,
      id: subtaskId,
      is_active: 1
    })
    .first();

  return row ? mapSubtask(row) : null;
};

exports.getScenarioPromptBundle = async (scenarioId, subTaskId = '') => {
  return await promptConfigService.getScenarioPromptBundle({
    scenarioId,
    subScenarioId: subTaskId,
    feature: 'conversation',
    subFeatureCode: 'roleplay',
    flowCode: 'reply'
  });
};

exports.saveScenarioPromptConfig = async (scenarioId, {
  subTaskId = '',
  promptId = '',
  promptIds = []
} = {}) => {
  const scenario = await exports.getScenarioById(scenarioId);
  if (!scenario) {
    const error = new Error('Scenario not found');
    error.status = 404;
    throw error;
  }

  if (subTaskId) {
    const subTask = await exports.getScenarioSubtaskById(scenarioId, subTaskId);
    if (!subTask) {
      const error = new Error('Sub-task not found');
      error.status = 404;
      throw error;
    }
  }

  await promptConfigService.replacePromptBindings({
    ownerType: subTaskId ? promptConfigService.OWNER_TYPES.SUB_SCENARIO : promptConfigService.OWNER_TYPES.SCENARIO,
    ownerId: subTaskId || scenarioId,
    layerCode: subTaskId ? promptConfigService.LAYER_CODES.SUB_SCENARIO : promptConfigService.LAYER_CODES.SCENARIO,
    feature: 'conversation',
    subFeatureCode: 'roleplay',
    flowCode: 'reply',
    targetId: subTaskId || scenarioId,
    promptIds: promptIds.length ? promptIds : promptId
  });

  return await exports.getScenarioPromptBundle(scenarioId, subTaskId);
};

exports.listScenarioCategories = async () => {
  const knex = db.getDb();
  return knex('scenario_categories')
    .where('is_active', 1)
    .orderBy([
      { column: 'sort_order', order: 'asc' },
      { column: 'id', order: 'asc' }
    ]);
};

exports.createScenario = async (input = {}) => {
  const knex = db.getDb();
  const payload = normalizeScenarioInput(input);
  const subtasks = normalizeSubtasksInput(input.subtasks || input.subtasksJson || [], payload.id);

  const exists = await knex('scenarios').where({ id: payload.id }).first();
  if (exists) {
    const error = new Error('场景 ID 已存在');
    error.status = 409;
    throw error;
  }

  await knex.transaction(async (trx) => {
    await trx('scenarios').insert({
      ...payload,
      tags: JSON.stringify(payload.tags)
    });
    await syncScenarioSubtasks(trx, payload.id, subtasks);
  });

  return exports.getScenarioById(payload.id);
};

exports.updateScenario = async (scenarioId, input = {}) => {
  const knex = db.getDb();
  const existing = await knex('scenarios').where({ id: scenarioId }).first();
  if (!existing) {
    const error = new Error('场景不存在');
    error.status = 404;
    throw error;
  }

  const payload = normalizeScenarioInput({ ...existing, ...input, id: scenarioId }, { existingId: scenarioId });
  const subtasks = normalizeSubtasksInput(input.subtasks || input.subtasksJson || [], scenarioId);

  await knex.transaction(async (trx) => {
    await trx('scenarios')
      .where({ id: scenarioId })
      .update({
        ...payload,
        tags: JSON.stringify(payload.tags),
        updated_at: trx.fn.now()
      });
    await syncScenarioSubtasks(trx, scenarioId, subtasks);
  });

  return exports.getScenarioById(scenarioId);
};

exports.deleteScenario = async (scenarioId) => {
  const knex = db.getDb();
  const existing = await knex('scenarios').where({ id: scenarioId }).first();
  if (!existing) {
    const error = new Error('场景不存在');
    error.status = 404;
    throw error;
  }

  await knex.transaction(async (trx) => {
    await trx('scenario_subtasks')
      .where({ scenario_id: scenarioId })
      .update({
        is_active: 0,
        updated_at: trx.fn.now()
      });

    await trx('scenarios')
      .where({ id: scenarioId })
      .update({
        is_active: 0,
        updated_at: trx.fn.now()
      });
  });

  return { id: scenarioId, deleted: true };
};
