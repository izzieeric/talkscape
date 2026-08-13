const { randomUUID } = require('crypto');
const knex = require('../db/knex');
const {
  getLegacySourceByPromptId,
  PROMPT_BINDING_OWNER_TYPES: OWNER_TYPES,
  PROMPT_LAYER_CODES: LAYER_CODES,
  getPromptSeedById,
  getTemplatePromptSeed,
  isCodeManagedLayer,
  listDefaultPromptBindings,
  listDefaultPromptSeeds,
  listDefaultPromptBindingsForSlot
} = require('../prompts/prompt-seeds');
const {
  getPromptFeatureMeta,
  isPromptLayerEditable
} = require('../prompts/prompt-feature-meta');
const { getLanguageMeta } = require('../utils/language-utils');
const { logPromptAssembly } = require('../middleware/logger');

function normalizeText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slugifyToken(value, fallback = 'custom') {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function shortId(value = randomUUID()) {
  return String(value).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase() || 'manual';
}

function createPromptError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function renderTemplate(content, variables = {}) {
  const source = String(content || '');
  return source.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = variables[key];
    return value == null ? '' : String(value);
  });
}

function buildVariables(input = {}) {
  const learningLanguage = getLanguageMeta(input.learningLanguage, 'en');
  const nativeLanguage = getLanguageMeta(input.nativeLanguage, 'zh-CN');

  return {
    FEATURE: normalizeText(input.feature),
    SUB_FEATURE: normalizeText(input.subFeatureCode),
    FLOW_CODE: normalizeText(input.flowCode),
    SCENARIO_ID: normalizeText(input.scenarioId),
    SUB_SCENARIO_ID: normalizeText(input.subScenarioId),
    SCENARIO_TITLE: normalizeText(input.scenarioTitle),
    DIFFICULTY: normalizeText(input.difficulty, 'beginner'),
    SCENARIO_DIFFICULTY: normalizeText(input.difficulty, 'beginner'),
    LEARNING_DIFFICULTY: normalizeText(input.learningDifficulty, 'A1'),
    LEARNER_LEVEL: normalizeText(input.learningDifficulty, 'A1'),
    TARGET_WORD: normalizeText(input.targetWord),
    CONTEXT_SENTENCE: normalizeText(input.contextSentence),
    LEARNING_LANGUAGE: learningLanguage.code,
    LEARNING_LANGUAGE_NAME: learningLanguage.englishName,
    LEARNING_LANGUAGE_LOCAL_NAME: learningLanguage.localName,
    NATIVE_LANGUAGE: nativeLanguage.code,
    NATIVE_LANGUAGE_NAME: nativeLanguage.englishName,
    NATIVE_LANGUAGE_LOCAL_NAME: nativeLanguage.localName,
    ...Object.entries(input.variables || {}).reduce((acc, [key, value]) => {
      acc[String(key)] = value == null ? '' : String(value);
      return acc;
    }, {})
  };
}

function mapPromptRow(row) {
  if (!row) return null;

  const legacySource = getLegacySourceByPromptId(row.id);
  return {
    id: row.id,
    promptId: row.id,
    promptCode: row.prompt_code,
    title: row.title,
    description: row.description || '',
    layerCode: row.layer_code,
    feature: row.feature || '',
    subFeatureCode: row.sub_feature_code || '',
    flowCode: row.flow_code || '',
    targetId: row.target_id || '',
    categoryKey: row.category_key || '',
    sourceRef: row.source_ref || '',
    content: row.content,
    sortOrder: Number(row.sort_order || 0),
    isBuiltin: Number(row.is_builtin || 0) === 1,
    isActive: Number(row.is_active || 0) === 1,
    legacySourceId: legacySource?.legacyPromptId || '',
    legacySourceTitle: legacySource?.title || '',
    legacySourceCode: legacySource?.promptCode || '',
    legacySourceDescription: legacySource?.description || '',
    updatedAt: row.updated_at || '',
    createdAt: row.created_at || ''
  };
}

function mapPromptSeed(seed) {
  if (!seed) return null;

  const legacySource = getLegacySourceByPromptId(seed.id);
  return {
    id: seed.id,
    promptId: seed.id,
    promptCode: seed.promptCode,
    title: seed.title,
    description: seed.description || '',
    layerCode: seed.layerCode,
    feature: seed.feature || '',
    subFeatureCode: seed.subFeatureCode || '',
    flowCode: seed.flowCode || '',
    targetId: seed.targetId || '',
    categoryKey: seed.categoryKey || '',
    sourceRef: seed.sourceRef || '',
    content: seed.content,
    sortOrder: Number(seed.sortOrder || 0),
    isBuiltin: Number(seed.isBuiltin || 0) === 1 || seed.isBuiltin === true,
    isActive: true,
    legacySourceId: legacySource?.legacyPromptId || '',
    legacySourceTitle: legacySource?.title || '',
    legacySourceCode: legacySource?.promptCode || '',
    legacySourceDescription: legacySource?.description || '',
    updatedAt: '',
    createdAt: ''
  };
}

function comparePromptDefinitions(a, b) {
  return String(a.layerCode || '').localeCompare(String(b.layerCode || ''))
    || Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
    || String(a.promptCode || '').localeCompare(String(b.promptCode || ''))
    || String(a.id || '').localeCompare(String(b.id || ''));
}

function filterPromptDefinitions(items = [], {
  layerCode = '',
  feature = '',
  subFeatureCode = '',
  flowCode = '',
  targetId = '',
  includeInactive = false,
  keyword = '',
  includeSystemWithFeature = false,
  editableOnly = false
} = {}) {
  const normalizedKeyword = normalizeText(keyword).toLowerCase();

  return items
    .filter((item) => includeInactive || item.isActive)
    .filter((item) => !editableOnly || isPromptLayerEditable(item.layerCode))
    .filter((item) => !layerCode || item.layerCode === layerCode)
    .filter((item) => {
      if (!feature) return true;
      if (includeSystemWithFeature && item.layerCode === LAYER_CODES.SYSTEM) return true;
      return item.feature === feature;
    })
    .filter((item) => !subFeatureCode || item.subFeatureCode === subFeatureCode)
    .filter((item) => !flowCode || item.flowCode === flowCode)
    .filter((item) => !targetId || item.targetId === targetId)
    .filter((item) => {
      if (!normalizedKeyword) return true;
      return [
        item.promptCode,
        item.title,
        item.description,
        item.layerCode,
        item.feature,
        item.subFeatureCode,
        item.flowCode,
        item.targetId,
        item.categoryKey
      ].some((value) => String(value || '').toLowerCase().includes(normalizedKeyword));
    });
}

function listCodeManagedPromptDefinitions() {
  const usageMap = listDefaultPromptBindings().reduce((acc, binding) => {
    const promptId = normalizeText(binding.promptId);
    if (!promptId) return acc;
    acc.set(promptId, (acc.get(promptId) || 0) + 1);
    return acc;
  }, new Map());

  return listDefaultPromptSeeds()
    .filter((seed) => isCodeManagedLayer(seed.layerCode))
    .map(mapPromptSeed)
    .map((item) => ({
      ...item,
      bindingCount: usageMap.get(item.id) || 0
    }));
}

function normalizePromptPayload(input = {}, { existingId = '' } = {}) {
  const layerCode = normalizeText(input.layerCode);
  const feature = normalizeText(input.feature);
  const subFeatureCode = normalizeText(input.subFeatureCode);
  const flowCode = normalizeText(input.flowCode);
  const targetId = normalizeText(input.targetId);
  const title = normalizeText(input.title);
  const explicitPromptCode = normalizeText(input.promptCode);
  const promptCode = explicitPromptCode || [
    slugifyToken(feature || 'global', 'global'),
    slugifyToken(subFeatureCode || layerCode || 'prompt', 'prompt'),
    slugifyToken(flowCode || targetId || title || 'manual', 'manual'),
    shortId(existingId || input.id || randomUUID())
  ].join('.');
  const categoryKey = normalizeText(input.categoryKey) || [
    slugifyToken(layerCode || 'prompt', 'prompt'),
    slugifyToken(feature || 'global', 'global'),
    slugifyToken(subFeatureCode || flowCode || targetId || 'default', 'default')
  ].join('.');
  const sourceRef = normalizeText(input.sourceRef) || 'admin/manual';
  const normalized = {
    id: normalizeText(input.id || existingId || randomUUID()),
    promptCode,
    title,
    description: normalizeText(input.description),
    layerCode,
    feature,
    subFeatureCode,
    flowCode,
    targetId,
    categoryKey,
    sourceRef,
    content: String(input.content || '').trim(),
    sortOrder: normalizeInteger(input.sortOrder, 0),
    isBuiltin: Number(input.isBuiltin) === 1 || input.isBuiltin === true,
    isActive: input.isActive === undefined ? true : (Number(input.isActive) === 1 || input.isActive === true)
  };

  if (!normalized.promptCode) throw createPromptError('promptCode 不能为空');
  if (!normalized.title) throw createPromptError('title 不能为空');
  if (!normalized.layerCode) throw createPromptError('layerCode 不能为空');
  if (!normalized.content) throw createPromptError('content 不能为空');

  if (normalized.layerCode === LAYER_CODES.SYSTEM) {
    normalized.feature = '';
    normalized.subFeatureCode = '';
    normalized.flowCode = '';
    normalized.targetId = '';
  } else if (normalized.layerCode === LAYER_CODES.FEATURE) {
    if (!normalized.feature) throw createPromptError('功能级提示词必须选择 feature');
    normalized.subFeatureCode = '';
    normalized.flowCode = '';
    normalized.targetId = '';
  } else if (normalized.layerCode === LAYER_CODES.SUB_FEATURE) {
    if (!normalized.feature || !normalized.subFeatureCode) {
      throw createPromptError('子功能级提示词必须填写 feature 和 subFeatureCode');
    }
    normalized.flowCode = '';
    normalized.targetId = '';
  } else if (normalized.layerCode === LAYER_CODES.BUSINESS) {
    if (!normalized.feature || !normalized.subFeatureCode || !normalized.flowCode) {
      throw createPromptError('业务级提示词必须填写 feature、subFeatureCode 和 flowCode');
    }
    normalized.targetId = '';
  } else if (normalized.layerCode === LAYER_CODES.FLOW) {
    if (!normalized.feature || !normalized.subFeatureCode || !normalized.flowCode) {
      throw createPromptError('流程级提示词必须填写 feature、subFeatureCode 和 flowCode');
    }
    normalized.targetId = '';
  } else if (normalized.layerCode === LAYER_CODES.SCENARIO || normalized.layerCode === LAYER_CODES.SUB_SCENARIO) {
    if (!normalized.feature || !normalized.subFeatureCode || !normalized.flowCode) {
      throw createPromptError('场景级提示词必须填写 feature、subFeatureCode 和 flowCode');
    }
  } else if (normalized.layerCode === LAYER_CODES.TEMPLATE) {
    normalized.subFeatureCode = '';
    normalized.flowCode = '';
  }

  return normalized;
}

async function getPromptById(promptId, options = {}) {
  const includeInactive = options.includeInactive === true;
  const seed = getPromptSeedById(normalizeText(promptId));
  if (seed && isCodeManagedLayer(seed.layerCode)) {
    return mapPromptSeed(seed);
  }
  const row = await knex('admin_ai_prompts')
    .where('id', normalizeText(promptId))
    .first();
  const prompt = mapPromptRow(row);
  if (!prompt) return null;
  if (isCodeManagedLayer(prompt.layerCode)) return null;
  if (!includeInactive && !prompt.isActive) return null;
  return prompt;
}

async function listPromptUsageStats() {
  const rows = await knex('admin_prompt_bindings')
    .select('prompt_id')
    .count('* as binding_count')
    .where('is_active', 1)
    .groupBy('prompt_id');
  return new Map(rows.map((item) => [item.prompt_id, Number(item.binding_count || 0)]));
}

async function listPromptDefinitions({
  layerCode = '',
  feature = '',
  subFeatureCode = '',
  flowCode = '',
  targetId = '',
  includeInactive = false,
  keyword = '',
  includeSystemWithFeature = false,
  editableOnly = false
} = {}) {
  const usageMap = await listPromptUsageStats();
  const rows = await knex('admin_ai_prompts')
    .orderBy([
      { column: 'layer_code', order: 'asc' },
      { column: 'sort_order', order: 'asc' },
      { column: 'prompt_code', order: 'asc' },
      { column: 'id', order: 'asc' }
    ]);

  const databaseItems = rows
    .map(mapPromptRow)
    .map((item) => ({
      ...item,
      bindingCount: usageMap.get(item.id) || 0
    }))
    .filter((item) => !isCodeManagedLayer(item.layerCode));
  const codeManagedItems = listCodeManagedPromptDefinitions();

  return filterPromptDefinitions([
    ...databaseItems,
    ...codeManagedItems
  ], {
    layerCode,
    feature,
    subFeatureCode,
    flowCode,
    targetId,
    includeInactive,
    keyword,
    includeSystemWithFeature,
    editableOnly
  }).sort(comparePromptDefinitions);
}

async function createPromptDefinition(input = {}) {
  const payload = normalizePromptPayload(input);
  if (!isPromptLayerEditable(payload.layerCode)) {
    throw createPromptError('该层级由系统托管，只允许查看，不允许编辑');
  }

  try {
    await knex('admin_ai_prompts').insert({
      id: payload.id,
      prompt_code: payload.promptCode,
      title: payload.title,
      description: payload.description,
      layer_code: payload.layerCode,
      feature: payload.feature,
      sub_feature_code: payload.subFeatureCode,
      flow_code: payload.flowCode,
      target_id: payload.targetId,
      category_key: payload.categoryKey,
      source_ref: payload.sourceRef,
      content: payload.content,
      sort_order: payload.sortOrder,
      is_builtin: payload.isBuiltin ? 1 : 0,
      is_active: payload.isActive ? 1 : 0
    });
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) {
      throw createPromptError('promptCode 已存在');
    }
    throw error;
  }

  return getPromptById(payload.id, { includeInactive: true });
}

async function updatePromptDefinition(promptId, input = {}) {
  const existing = await getPromptById(promptId, { includeInactive: true });
  if (!existing) {
    throw createPromptError('Prompt not found', 404);
  }
  if (!isPromptLayerEditable(existing.layerCode)) {
    throw createPromptError('该提示词属于系统托管层，不允许修改');
  }

  const payload = normalizePromptPayload({
    ...existing,
    ...input,
    id: existing.id
  }, { existingId: existing.id });

  const slotChanged = [
    'layerCode',
    'feature',
    'subFeatureCode',
    'flowCode',
    'targetId'
  ].some((key) => normalizeText(existing[key]) !== normalizeText(payload[key]));

  try {
    await knex('admin_ai_prompts')
      .where('id', existing.id)
      .update({
        prompt_code: payload.promptCode,
        title: payload.title,
        description: payload.description,
        layer_code: payload.layerCode,
        feature: payload.feature,
        sub_feature_code: payload.subFeatureCode,
        flow_code: payload.flowCode,
        target_id: payload.targetId,
        category_key: payload.categoryKey,
        source_ref: payload.sourceRef,
        content: payload.content,
        sort_order: payload.sortOrder,
        is_builtin: payload.isBuiltin ? 1 : 0,
        is_active: payload.isActive ? 1 : 0,
        updated_at: knex.fn.now()
      });
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) {
      throw createPromptError('promptCode 已存在');
    }
    throw error;
  }

  if (slotChanged) {
    await knex('admin_prompt_bindings')
      .where('prompt_id', existing.id)
      .delete();
  }

  return getPromptById(existing.id, { includeInactive: true });
}

async function deletePromptDefinition(promptId) {
  const existing = await getPromptById(promptId, { includeInactive: true });
  if (!existing) {
    throw createPromptError('Prompt not found', 404);
  }
  if (!isPromptLayerEditable(existing.layerCode)) {
    throw createPromptError('该提示词属于系统托管层，不允许删除');
  }

  await knex.transaction(async (trx) => {
    await trx('admin_prompt_bindings')
      .where('prompt_id', existing.id)
      .delete();
    await trx('admin_ai_prompts')
      .where('id', existing.id)
      .delete();
  });

  return existing;
}

async function listBindingsForSlot({
  ownerType,
  ownerId = 'default',
  layerCode,
  feature = '',
  subFeatureCode = '',
  flowCode = ''
} = {}) {
  const rows = await knex('admin_prompt_bindings as b')
    .innerJoin('admin_ai_prompts as p', 'p.id', 'b.prompt_id')
    .select(
      'b.id as binding_id',
      'b.owner_type',
      'b.owner_id',
      'b.layer_code as binding_layer_code',
      'b.feature as binding_feature',
      'b.sub_feature_code as binding_sub_feature_code',
      'b.flow_code as binding_flow_code',
      'b.sort_order as binding_sort_order',
      'p.*'
    )
    .where({
      'b.owner_type': normalizeText(ownerType),
      'b.owner_id': normalizeText(ownerId, 'default'),
      'b.layer_code': normalizeText(layerCode),
      'b.feature': normalizeText(feature),
      'b.sub_feature_code': normalizeText(subFeatureCode),
      'b.flow_code': normalizeText(flowCode),
      'b.is_active': 1,
      'p.is_active': 1
    })
    .orderBy([
      { column: 'b.sort_order', order: 'asc' },
      { column: 'p.sort_order', order: 'asc' },
      { column: 'p.prompt_code', order: 'asc' },
      { column: 'p.id', order: 'asc' }
    ]);

  return rows.map((row) => ({
    bindingId: row.binding_id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    layerCode: row.binding_layer_code,
    feature: row.binding_feature || '',
    subFeatureCode: row.binding_sub_feature_code || '',
    flowCode: row.binding_flow_code || '',
    bindingSortOrder: Number(row.binding_sort_order || 0),
    prompt: mapPromptRow(row)
  }));
}

function listCodeManagedBindingsForSlot({
  ownerType,
  ownerId = 'default',
  layerCode,
  feature = '',
  subFeatureCode = '',
  flowCode = ''
} = {}) {
  return listDefaultPromptBindingsForSlot({
    ownerType,
    ownerId,
    layerCode,
    feature,
    subFeatureCode,
    flowCode
  })
    .map((binding) => {
      const seed = getPromptSeedById(binding.promptId);
      if (!seed || !String(seed.content || '').trim()) return null;
      return {
        bindingId: `seed:${binding.promptId}`,
        ownerType: binding.ownerType,
        ownerId: binding.ownerId,
        layerCode: binding.layerCode,
        feature: binding.feature || '',
        subFeatureCode: binding.subFeatureCode || '',
        flowCode: binding.flowCode || '',
        bindingSortOrder: Number(binding.sortOrder || 0),
        prompt: mapPromptSeed(seed)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.bindingSortOrder - b.bindingSortOrder || a.prompt.sortOrder - b.prompt.sortOrder || a.prompt.promptCode.localeCompare(b.prompt.promptCode));
}

async function getAvailablePromptsForSlot({
  layerCode,
  feature = '',
  subFeatureCode = '',
  flowCode = '',
  targetId = ''
} = {}) {
  return (await listPromptDefinitions({
    layerCode,
    feature: layerCode === LAYER_CODES.SYSTEM ? '' : normalizeText(feature),
    subFeatureCode: layerCode === LAYER_CODES.SUB_FEATURE || layerCode === LAYER_CODES.BUSINESS || layerCode === LAYER_CODES.FLOW || layerCode === LAYER_CODES.SCENARIO || layerCode === LAYER_CODES.SUB_SCENARIO
      ? normalizeText(subFeatureCode)
      : '',
    flowCode: layerCode === LAYER_CODES.BUSINESS || layerCode === LAYER_CODES.FLOW || layerCode === LAYER_CODES.SCENARIO || layerCode === LAYER_CODES.SUB_SCENARIO
      ? normalizeText(flowCode)
      : '',
    includeInactive: false
  })).filter((item) => {
    if (layerCode === LAYER_CODES.SCENARIO || layerCode === LAYER_CODES.SUB_SCENARIO) {
      return !item.targetId || item.targetId === normalizeText(targetId);
    }
    return !item.targetId;
  });
}

function assertPromptMatchesSlot(prompt, slot) {
  if (!prompt) {
    const error = new Error('Prompt not found');
    error.status = 404;
    throw error;
  }

  if (prompt.layerCode !== slot.layerCode) throw createPromptError('Prompt layer does not match target slot');
  if (normalizeText(slot.feature) !== normalizeText(prompt.feature)) throw createPromptError('Prompt feature does not match target slot');
  if (normalizeText(slot.subFeatureCode) !== normalizeText(prompt.subFeatureCode)) throw createPromptError('Prompt sub-feature does not match target slot');
  if (normalizeText(slot.flowCode) !== normalizeText(prompt.flowCode)) throw createPromptError('Prompt flow does not match target slot');

  if ((slot.layerCode === LAYER_CODES.SCENARIO || slot.layerCode === LAYER_CODES.SUB_SCENARIO)
    && prompt.targetId
    && prompt.targetId !== normalizeText(slot.targetId)) {
    throw createPromptError('Prompt target does not match scenario slot');
  }
}

async function replacePromptBindings({
  ownerType,
  ownerId = 'default',
  layerCode,
  feature = '',
  subFeatureCode = '',
  flowCode = '',
  targetId = '',
  promptIds = []
} = {}) {
  if (isCodeManagedLayer(layerCode) || !isPromptLayerEditable(layerCode)) {
    throw createPromptError('该层级由系统托管，只允许查看，不允许替换绑定');
  }

  const normalizedPromptIds = Array.isArray(promptIds)
    ? promptIds.map((item) => normalizeText(item)).filter(Boolean)
    : [normalizeText(promptIds)].filter(Boolean);

  await knex.transaction(async (trx) => {
    await trx('admin_prompt_bindings')
      .where({
        owner_type: normalizeText(ownerType),
        owner_id: normalizeText(ownerId, 'default'),
        layer_code: normalizeText(layerCode),
        feature: normalizeText(feature),
        sub_feature_code: normalizeText(subFeatureCode),
        flow_code: normalizeText(flowCode)
      })
      .delete();

    for (let index = 0; index < normalizedPromptIds.length; index += 1) {
      const promptId = normalizedPromptIds[index];
      const prompt = await getPromptById(promptId, { includeInactive: true });
      assertPromptMatchesSlot(prompt, { layerCode, feature, subFeatureCode, flowCode, targetId });

      await trx('admin_prompt_bindings').insert({
        owner_type: normalizeText(ownerType),
        owner_id: normalizeText(ownerId, 'default'),
        feature: normalizeText(feature),
        sub_feature_code: normalizeText(subFeatureCode),
        flow_code: normalizeText(flowCode),
        layer_code: normalizeText(layerCode),
        prompt_id: promptId,
        sort_order: (index + 1) * 10,
        is_active: 1
      });
    }
  });
}

async function buildSelectedPromptLayers({
  feature = '',
  subFeatureCode = '',
  flowCode = '',
  scenarioId = '',
  subScenarioId = '',
  variables = {}
} = {}) {
  const slots = [
    {
      ownerType: OWNER_TYPES.SYSTEM,
      ownerId: 'default',
      layerCode: LAYER_CODES.SYSTEM,
      feature: '',
      subFeatureCode: '',
      flowCode: '',
      source: 'system-binding'
    },
    {
      ownerType: OWNER_TYPES.SYSTEM,
      ownerId: 'default',
      layerCode: LAYER_CODES.FEATURE,
      feature,
      subFeatureCode: '',
      flowCode: '',
      source: 'system-binding'
    }
  ];

  if (subFeatureCode) {
    slots.push({
      ownerType: OWNER_TYPES.SYSTEM,
      ownerId: 'default',
      layerCode: LAYER_CODES.SUB_FEATURE,
      feature,
      subFeatureCode,
      flowCode: '',
      source: 'system-binding'
    });
  }

  if (flowCode) {
    slots.push({
      ownerType: OWNER_TYPES.SYSTEM,
      ownerId: 'default',
      layerCode: LAYER_CODES.BUSINESS,
      feature,
      subFeatureCode,
      flowCode,
      source: 'system-binding'
    });
  }

  if (flowCode) {
    slots.push({
      ownerType: OWNER_TYPES.SYSTEM,
      ownerId: 'default',
      layerCode: LAYER_CODES.FLOW,
      feature,
      subFeatureCode,
      flowCode,
      source: 'system-binding'
    });
  }

  if (scenarioId) {
    slots.push({
      ownerType: OWNER_TYPES.SCENARIO,
      ownerId: scenarioId,
      layerCode: LAYER_CODES.SCENARIO,
      feature,
      subFeatureCode,
      flowCode,
      source: 'scenario-binding'
    });
  }

  if (subScenarioId) {
    slots.push({
      ownerType: OWNER_TYPES.SUB_SCENARIO,
      ownerId: subScenarioId,
      layerCode: LAYER_CODES.SUB_SCENARIO,
      feature,
      subFeatureCode,
      flowCode,
      source: 'sub-scenario-binding'
    });
  }

  const layers = [];
  for (const slot of slots) {
    const bindings = isCodeManagedLayer(slot.layerCode)
      ? listCodeManagedBindingsForSlot(slot)
      : await listBindingsForSlot(slot);
    for (const item of bindings) {
      layers.push({
        layerCode: slot.layerCode,
        feature: slot.feature || '',
        subFeatureCode: slot.subFeatureCode || '',
        flowCode: slot.flowCode || '',
        targetId: item.ownerId,
        promptId: item.prompt.id,
        promptCode: item.prompt.promptCode,
        promptTitle: item.prompt.title,
        categoryKey: item.prompt.categoryKey,
        sourceRef: item.prompt.sourceRef,
        sortOrder: item.bindingSortOrder,
        source: slot.source,
        sourceKey: `${slot.ownerType}/${slot.ownerId}/${slot.layerCode}/${item.prompt.promptCode}`,
        content: renderTemplate(item.prompt.content, variables)
      });
    }
  }

  return layers;
}

async function buildPrompt(options = {}) {
  const variables = buildVariables(options);
  const layers = (await buildSelectedPromptLayers({ ...options, variables }))
    .filter((item) => normalizeText(item.content));
  const content = layers.map((item) => item.content).join('\n\n');

  logPromptAssembly({
    requestId: options.requestId,
    feature: options.feature,
    subFeatureCode: options.subFeatureCode,
    flowCode: options.flowCode,
    scenarioId: options.scenarioId,
    subScenarioId: options.subScenarioId,
    variables,
    layers,
    content
  });

  return {
    layers,
    content
  };
}

async function getPromptAssetContent({
  feature = 'legacy',
  targetId = '',
  variables = {}
} = {}) {
  const normalizedFeature = normalizeText(feature, 'legacy');
  const normalizedTargetId = normalizeText(targetId);
  const seed = getTemplatePromptSeed(normalizedTargetId, normalizedFeature);
  const content = seed?.content || '';
  if (!variables || Object.keys(variables).length === 0) {
    return content;
  }
  return renderTemplate(content, variables);
}

async function buildSlotBundle({
  ownerType,
  ownerId = 'default',
  layerCode,
  feature = '',
  subFeatureCode = '',
  flowCode = '',
  targetId = ''
} = {}) {
  const currentBindings = isCodeManagedLayer(layerCode)
    ? listCodeManagedBindingsForSlot({
        ownerType,
        ownerId,
        layerCode,
        feature,
        subFeatureCode,
        flowCode
      })
    : await listBindingsForSlot({
        ownerType,
        ownerId,
        layerCode,
        feature,
        subFeatureCode,
        flowCode
      });

  return {
    ownerType,
    ownerId,
    layerCode,
    feature,
    subFeatureCode,
    flowCode,
    currentPromptId: currentBindings[0]?.prompt?.id || '',
    currentPrompt: currentBindings[0]?.prompt || null,
    bindings: currentBindings,
    options: isCodeManagedLayer(layerCode)
      ? currentBindings.map((item) => item.prompt)
      : await getAvailablePromptsForSlot({
          layerCode,
          feature,
          subFeatureCode,
          flowCode,
          targetId: targetId || ownerId
        })
  };
}

async function getSystemPromptSelectionBundle({ feature = '', subFeatureCode = '', flowCode = '' } = {}) {
  const supportedLayers = new Set(getPromptFeatureMeta(feature)?.supportedLayers || []);
  const slots = [
    {
      ownerType: OWNER_TYPES.SYSTEM,
      ownerId: 'default',
      layerCode: LAYER_CODES.SYSTEM
    },
    {
      ownerType: OWNER_TYPES.SYSTEM,
      ownerId: 'default',
      layerCode: LAYER_CODES.FEATURE,
      feature
    }
  ];

  if (subFeatureCode && supportedLayers.has(LAYER_CODES.SUB_FEATURE)) {
    slots.push({
      ownerType: OWNER_TYPES.SYSTEM,
      ownerId: 'default',
      layerCode: LAYER_CODES.SUB_FEATURE,
      feature,
      subFeatureCode
    });
  }

  if (flowCode && supportedLayers.has(LAYER_CODES.BUSINESS)) {
    slots.push({
      ownerType: OWNER_TYPES.SYSTEM,
      ownerId: 'default',
      layerCode: LAYER_CODES.BUSINESS,
      feature,
      subFeatureCode,
      flowCode
    });
  }

  if (flowCode && supportedLayers.has(LAYER_CODES.FLOW)) {
    slots.push({
      ownerType: OWNER_TYPES.SYSTEM,
      ownerId: 'default',
      layerCode: LAYER_CODES.FLOW,
      feature,
      subFeatureCode,
      flowCode
    });
  }

  return Promise.all(slots.map((slot) => buildSlotBundle(slot)));
}

async function getScenarioPromptBundle({
  scenarioId,
  subScenarioId = '',
  feature = 'conversation',
  subFeatureCode = 'roleplay',
  flowCode = 'reply'
}) {
  const scenario = await knex('scenarios')
    .select('title', 'title_en', 'difficulty')
    .where('id', scenarioId)
    .first();

  if (!scenario) {
    const error = new Error('Scenario not found');
    error.status = 404;
    throw error;
  }

  const bundle = await buildPrompt({
    feature,
    subFeatureCode,
    flowCode,
    scenarioId,
    subScenarioId,
    scenarioTitle: scenario.title_en || scenario.title || '',
    difficulty: scenario.difficulty || 'beginner'
  });

  const scenarioSlots = await Promise.all([
    buildSlotBundle({
      ownerType: OWNER_TYPES.SCENARIO,
      ownerId: scenarioId,
      layerCode: LAYER_CODES.SCENARIO,
      feature,
      subFeatureCode,
      flowCode,
      targetId: scenarioId
    }),
    subScenarioId
      ? buildSlotBundle({
        ownerType: OWNER_TYPES.SUB_SCENARIO,
        ownerId: subScenarioId,
        layerCode: LAYER_CODES.SUB_SCENARIO,
        feature,
        subFeatureCode,
        flowCode,
        targetId: subScenarioId
      })
      : null
  ]);

  return {
    feature,
    subFeatureCode,
    flowCode,
    scenarioId,
    subScenarioId,
    compiledPrompt: bundle.content,
    layers: bundle.layers,
    systemSlots: await getSystemPromptSelectionBundle({ feature, subFeatureCode, flowCode }),
    scenarioSlots: scenarioSlots.filter(Boolean)
  };
}

module.exports = {
  LAYER_CODES,
  OWNER_TYPES,
  buildPrompt,
  createPromptDefinition,
  deletePromptDefinition,
  getPromptAssetContent,
  getPromptById,
  getScenarioPromptBundle,
  getSystemPromptSelectionBundle,
  listPromptDefinitions,
  replacePromptBindings,
  updatePromptDefinition
};
