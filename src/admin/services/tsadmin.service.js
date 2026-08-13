const knex = require('../../db/knex');
const scenarioService = require('../../services/scenario.service');
const bookmarkService = require('../../services/bookmark.service');
const promptConfigService = require('../../services/prompt-config.service');
const aiFunctionConfigService = require('../../services/ai-function-config.service');
const {
  getPromptFeatureMeta,
  isPromptLayerEditable,
  getSupportedLayerOptions,
  listPromptFeatureMeta
} = require('../../prompts/prompt-feature-meta');

function toCount(value) {
  return Number(value || 0);
}

async function getDashboardData(user) {
  const scenarios = await scenarioService.getAllScenarios();
  const [promptConfigRow, bookmarkRow, sessionRow, recentSessions] = await Promise.all([
    knex('admin_ai_prompts').count('* as count').where('is_active', 1).first(),
    knex('word_bookmarks').count('* as count').whereNot('status', 'deleted').first(),
    knex('conversation_sessions').count('* as count').where('del', 0).first(),
    knex('conversation_sessions as cs')
      .leftJoin('scenarios as s', 's.id', 'cs.scenario_id')
      .leftJoin('scenario_subtasks as st', 'st.id', 'cs.sub_task_id')
      .leftJoin('users as u', 'u.id', 'cs.user_id')
      .select(
        'cs.id',
        'cs.scenario_id',
        'cs.sub_task_id',
        'cs.status',
        'cs.current_turn',
        'cs.max_turns',
        'cs.started_at',
        's.title as scenario_title',
        'st.title as subtask_title',
        'u.username'
      )
      .where('cs.del', 0)
      .orderBy('cs.started_at', 'desc')
      .limit(8)
  ]);
  const stats = {
    scenarioCount: scenarios.length,
    levelCount: scenarios.filter((item) => item.sceneType === 'level').length,
    promptConfigCount: toCount(promptConfigRow?.count),
    bookmarkCount: toCount(bookmarkRow?.count),
    sessionCount: toCount(sessionRow?.count)
  };

  return {
    user,
    stats,
    recentSessions
  };
}

async function getScenarioManagementData() {
  const scenarios = await scenarioService.getAllScenarios();
  const categories = await scenarioService.listScenarioCategories();
  return {
    totals: {
      all: scenarios.length,
      level: scenarios.filter((item) => item.sceneType === 'level').length,
      free: scenarios.filter((item) => item.sceneType === 'free').length,
      featured: scenarios.filter((item) => item.sceneType === 'featured').length
    },
    scenarios,
    categories
  };
}

const SLOT_LABELS = {
  system: { label: '系统级', desc: '系统托管，只读。用于全局规则与安全边界。' },
  feature: { label: '功能级', desc: '系统托管，只读。用于功能公共约束。' },
  sub_feature: { label: '子功能级', desc: '系统托管，只读。用于子能力公共约束。' },
  business: { label: '业务级', desc: '可编辑。只描述具体业务行为逻辑，不处理系统变量与结构。' },
  flow: { label: '流程级', desc: '系统托管，只读。用于输出格式、字段结构和系统替换规则。' },
  scenario: { label: '场景级', desc: '可编辑。用于具体场景下的业务逻辑与角色设定。' },
  sub_scenario: { label: '关卡级', desc: '可编辑。用于具体关卡下的业务逻辑。' }
};

const OWNER_TYPE_LABELS = {
  system: '系统设置',
  scenario: '场景配置',
  sub_scenario: '关卡配置'
};

const SCENE_TYPE_LABELS = {
  level: '关卡场景',
  free: '自由场景',
  featured: '特色场景'
};

const PROMPT_WORKBENCHES = listPromptFeatureMeta()
  .filter((item) => item.value !== 'legacy' && item.workbenchDesc)
  .reduce((acc, item) => {
    acc[item.value] = {
      code: item.value,
      label: item.label,
      desc: item.workbenchDesc,
      subFeatureCode: item.defaultSubFeatureCode,
      flowCode: item.defaultFlowCode,
      supportsScenario: item.supportsScenario
    };
    return acc;
  }, {});

function supportsEditablePromptLayers(meta) {
  return (meta?.supportedLayers || []).some((layerCode) => isPromptLayerEditable(layerCode));
}

const PROMPT_FEATURE_OPTIONS = [
  { value: '', label: '全部功能' },
  ...listPromptFeatureMeta()
    .filter((item) => supportsEditablePromptLayers(item))
    .map((item) => ({
      value: item.value,
      label: item.label
    }))
];

function getPreferredLibraryLayerCode(feature = '', layerOptions = []) {
  if (!feature) return '';

  const layerCodes = layerOptions
    .map((item) => item.value)
    .filter(Boolean);

  if (!layerCodes.length) return '';
  if (layerCodes.includes('scenario')) return 'scenario';
  if (layerCodes.includes('business')) return 'business';
  return layerCodes[0] || '';
}

function buildSlotKey(slot) {
  return [
    slot.ownerType,
    slot.layerCode,
    slot.ownerId || 'default',
    slot.feature || '',
    slot.subFeatureCode || '',
    slot.flowCode || ''
  ].join('|');
}

function getSceneTypeLabel(sceneType) {
  return SCENE_TYPE_LABELS[sceneType] || sceneType || '';
}

function getScenarioCategoryLabel(scenario) {
  if (scenario?.categoryTitle) {
    return scenario.categoryTitle;
  }
  return getSceneTypeLabel(scenario?.sceneType) || '未分类';
}

function selectDefaultScenario(scenarios = []) {
  return scenarios.find((item) => item.id === 'restaurant')
    || scenarios.find((item) => item.sceneType === 'level')
    || scenarios[0]
    || null;
}

function buildSlotScopeText(slot, selectedScenario) {
  if (slot.ownerType === 'system') {
    return '作用于系统默认配置';
  }

  if (slot.ownerType === 'sub_scenario') {
    const subTask = (selectedScenario?.subTasks || []).find((item) => item.id === slot.ownerId);
    if (subTask) {
      return `作用于关卡「${subTask.title}」`;
    }
    return `作用于关卡 ${slot.ownerId}`;
  }

  if (selectedScenario?.id === slot.ownerId) {
    return `作用于场景「${selectedScenario.title}」`;
  }

  return `作用于场景 ${slot.ownerId}`;
}

function decorateSlot(slot, workbench, { isActive = false } = {}) {
  const meta = SLOT_LABELS[slot.layerCode] || { label: slot.layerCode, desc: '' };
  const isEditable = isPromptLayerEditable(slot.layerCode);
  return {
    ...slot,
    slotKey: buildSlotKey(slot),
    slotLabel: meta.label,
    slotDesc: meta.desc,
    featureLabel: workbench.label,
    ownerLabel: OWNER_TYPE_LABELS[slot.ownerType] || slot.ownerType,
    isEditable,
    manageModeLabel: isEditable ? '可操作' : '系统托管',
    isActive
  };
}

async function buildCompiledPreviewBundle({ workbench, scenarioId = '', subTaskId = '' } = {}) {
  if (workbench.supportsScenario && scenarioId) {
    return await promptConfigService.getScenarioPromptBundle({
      scenarioId,
      subScenarioId: subTaskId,
      feature: workbench.code,
      subFeatureCode: workbench.subFeatureCode,
      flowCode: workbench.flowCode
    });
  }

  const compiled = await promptConfigService.buildPrompt({
    feature: workbench.code,
    subFeatureCode: workbench.subFeatureCode,
    flowCode: workbench.flowCode,
    scenarioId,
    subScenarioId: subTaskId,
    targetWord: 'reservation',
    contextSentence: 'Do you have a reservation?',
    nativeLanguage: 'zh-CN',
    learningLanguage: 'en'
  });

  return {
    feature: workbench.code,
    subFeatureCode: workbench.subFeatureCode,
    flowCode: workbench.flowCode,
    compiledPrompt: compiled.content,
    layers: compiled.layers,
    systemSlots: await promptConfigService.getSystemPromptSelectionBundle({
      feature: workbench.code,
      subFeatureCode: workbench.subFeatureCode,
      flowCode: workbench.flowCode
    }),
    scenarioSlots: []
  };
}

function buildPromptSelectionSummary({ workbench, selectedScenario = null, selectedSubTask = null, selectedSlot = null, candidatePrompts = [], currentLayers = [] } = {}) {
  const summary = [];

  if (workbench) {
    summary.push({
      label: '当前功能',
      value: workbench.label,
      desc: workbench.desc
    });
  }

  if (selectedScenario) {
    summary.push({
      label: '当前场景',
      value: selectedScenario.title,
      desc: getSceneTypeLabel(selectedScenario.sceneType)
    });
  }

  if (selectedSubTask) {
    summary.push({
      label: '当前关卡',
      value: selectedSubTask.title,
      desc: '只影响这个关卡的专属提示词'
    });
  }

  if (selectedSlot) {
    summary.push({
      label: '当前层级',
      value: selectedSlot.slotLabel,
      desc: `${selectedSlot.ownerLabel} · ${buildSlotScopeText(selectedSlot, selectedScenario)}`
    });
  }

  summary.push({
    label: '候选数量',
    value: String(candidatePrompts.length),
    desc: '当前层级可绑定的提示词条数'
  });

  summary.push({
    label: '编译层数',
    value: String(currentLayers.length),
    desc: '当前最终拼装进运行时的提示词层数'
  });

  return summary;
}

async function buildPromptLibraryBundle({
  libraryFeature = '',
  libraryLayerCode = '',
  libraryKeyword = '',
  libraryPromptId = ''
} = {}) {
  const featureLayerOptions = (libraryFeature
    ? getSupportedLayerOptions(libraryFeature, { includeAll: true })
    : getSupportedLayerOptions('', { includeAll: true }))
    .filter((item) => !item.value || isPromptLayerEditable(item.value));
  const preferredLayerCode = getPreferredLibraryLayerCode(libraryFeature, featureLayerOptions);
  const resolvedLayerCode = featureLayerOptions.some((item) => item.value === libraryLayerCode)
    ? libraryLayerCode
    : preferredLayerCode;
  const prompts = await promptConfigService.listPromptDefinitions({
    includeInactive: true,
    feature: libraryFeature,
    layerCode: resolvedLayerCode,
    keyword: libraryKeyword,
    includeSystemWithFeature: false,
    editableOnly: true
  });
  const isCreating = libraryPromptId === '__new__';
  const selectedPrompt = isCreating
    ? null
    : (libraryPromptId ? prompts.find((item) => item.id === libraryPromptId) || null : null);

  return {
    filters: {
      feature: libraryFeature,
      layerCode: resolvedLayerCode,
      keyword: libraryKeyword
    },
    prompts: prompts.map((item) => {
      const isEditable = isPromptLayerEditable(item.layerCode);
      return {
        ...item,
        isEditable,
        manageModeLabel: isEditable ? '可编辑' : '系统托管',
        canDelete: isEditable && !item.isBuiltin
      };
    }),
    isCreating,
    selectedPrompt,
    layerOptions: featureLayerOptions,
    featureOptions: PROMPT_FEATURE_OPTIONS
  };
}

async function buildPromptLibraryFormOptions() {
  const scenarios = await scenarioService.getAllScenarios();
  const subScenarioOptions = scenarios.flatMap((scenario) => (scenario.subTasks || []).map((subTask) => ({
    value: subTask.id,
    label: `${getScenarioCategoryLabel(scenario)} / ${scenario.title} / ${subTask.title}`,
    scenarioId: scenario.id
  })));

  return {
    defaultLayerOptions: getSupportedLayerOptions('', { includeAll: false }).filter((item) => isPromptLayerEditable(item.value)),
    layerOptionsByFeature: listPromptFeatureMeta().reduce((acc, item) => {
      acc[item.value] = getSupportedLayerOptions(item.value, { includeAll: false }).filter((option) => isPromptLayerEditable(option.value));
      return acc;
    }, {}),
    featureOptions: listPromptFeatureMeta().map((item) => ({
      value: item.value,
      label: item.label,
      subFeatures: item.subFeatures,
      flows: item.flows,
      supportedLayers: item.supportedLayers
    })),
    scenarioOptions: scenarios.map((item) => ({
      value: item.id,
      label: `${getScenarioCategoryLabel(item)} / ${item.title} / ${getSceneTypeLabel(item.sceneType)}`
    })),
    subScenarioOptions
  };
}

async function getPromptManagementData({
  feature = 'conversation',
  scenarioId = '',
  subTaskId = '',
  slotKey = ''
} = {}) {
  const workbenches = Object.values(PROMPT_WORKBENCHES);
  const workbench = PROMPT_WORKBENCHES[feature] || PROMPT_WORKBENCHES.conversation;
  const scenarios = (await scenarioService.getAllScenarios()).map((item) => ({
    ...item,
    sceneTypeLabel: getSceneTypeLabel(item.sceneType),
    categoryLabel: getScenarioCategoryLabel(item)
  }));
  const selectedScenario = workbench.supportsScenario
    ? (scenarioId ? scenarios.find((item) => item.id === scenarioId) : selectDefaultScenario(scenarios))
    : null;
  const resolvedScenarioId = selectedScenario?.id || '';
  const resolvedSubTaskId = workbench.supportsScenario ? subTaskId || '' : '';
  const selectedSubTask = resolvedSubTaskId
    ? (selectedScenario?.subTasks || []).find((item) => item.id === resolvedSubTaskId) || null
    : null;
  const promptBundle = workbench.supportsScenario
    ? (resolvedScenarioId ? await buildCompiledPreviewBundle({ workbench, scenarioId: resolvedScenarioId, subTaskId: resolvedSubTaskId }) : null)
    : await buildCompiledPreviewBundle({ workbench });

  const allSlots = [
    ...((promptBundle?.systemSlots || []).map((slot) => decorateSlot(slot, workbench))),
    ...((promptBundle?.scenarioSlots || []).map((slot) => decorateSlot(slot, workbench)))
  ];
  const selectedSlot = allSlots.find((item) => item.slotKey === slotKey)
    || allSlots.find((item) => item.isEditable)
    || allSlots[0]
    || null;
  const decoratedSlots = allSlots.map((item) => ({
    ...item,
    isActive: selectedSlot ? item.slotKey === selectedSlot.slotKey : false
  }));
  const candidatePrompts = selectedSlot
    ? selectedSlot.options.map((item) => ({
      ...item,
      isCurrent: selectedSlot.currentPromptId === item.id,
      preview: String(item.content || ''),
      usageText: [
        SLOT_LABELS[item.layerCode]?.label || item.layerCode,
        item.feature || 'global',
        item.subFeatureCode || '',
        item.flowCode || '',
        item.targetId || ''
      ].filter(Boolean).join(' / ')
    }))
    : [];
  const currentLayers = (promptBundle?.layers || []).map((item, index) => ({
    ...item,
    orderIndex: index + 1,
    layerLabel: SLOT_LABELS[item.layerCode]?.label || item.layerCode,
    isEditable: isPromptLayerEditable(item.layerCode),
    manageModeLabel: isPromptLayerEditable(item.layerCode) ? '可操作' : '系统托管'
  }));
  const selectionSummary = buildPromptSelectionSummary({
    workbench,
    selectedScenario,
    selectedSubTask,
    selectedSlot,
    candidatePrompts,
    currentLayers
  });

  return {
    workbenches,
    selectedFeature: workbench.code,
    selectedWorkbench: workbench,
    scenarios,
    selectedScenario,
    selectedScenarioId: resolvedScenarioId,
    selectedSubTask,
    selectedSubTaskId: resolvedSubTaskId,
    promptBundle,
    slots: decoratedSlots,
    selectedSlot,
    candidatePrompts,
    selectionSummary,
    currentLayers
  };
}

async function getPromptLibraryManagementData({
  libraryFeature = '',
  libraryLayerCode = '',
  libraryKeyword = '',
  libraryPromptId = ''
} = {}) {
  const promptLibraryBundle = await buildPromptLibraryBundle({
    libraryFeature,
    libraryLayerCode,
    libraryKeyword,
    libraryPromptId
  });

  return {
    promptLibrary: promptLibraryBundle.prompts,
    selectedLibraryPrompt: promptLibraryBundle.selectedPrompt
      ? {
          ...promptLibraryBundle.selectedPrompt,
          isEditable: isPromptLayerEditable(promptLibraryBundle.selectedPrompt.layerCode),
          manageModeLabel: isPromptLayerEditable(promptLibraryBundle.selectedPrompt.layerCode) ? '可编辑' : '系统托管',
          canDelete: isPromptLayerEditable(promptLibraryBundle.selectedPrompt.layerCode) && !promptLibraryBundle.selectedPrompt.isBuiltin
        }
      : null,
    isCreatingLibraryPrompt: promptLibraryBundle.isCreating,
    isLibraryModalOpen: Boolean(promptLibraryBundle.selectedPrompt || promptLibraryBundle.isCreating),
    promptLibraryFilters: promptLibraryBundle.filters,
    promptLibraryLayerOptions: promptLibraryBundle.layerOptions,
    promptLibraryFeatureOptions: promptLibraryBundle.featureOptions,
    promptFormOptions: await buildPromptLibraryFormOptions()
  };
}

async function getModelConfigManagementData() {
  return {
    functionConfigs: await aiFunctionConfigService.listFunctionConfigsForAdmin()
  };
}

async function getConversationManagementData({ scenarioId = '' } = {}) {
  const scenarios = await scenarioService.getAllScenarios();
  const query = knex('conversation_sessions as cs')
    .leftJoin('scenarios as s', 's.id', 'cs.scenario_id')
    .leftJoin('scenario_subtasks as st', 'st.id', 'cs.sub_task_id')
    .leftJoin('users as u', 'u.id', 'cs.user_id')
    .select(
      'cs.id',
      'cs.scenario_id',
      'cs.sub_task_id',
      'cs.user_id',
      'cs.status',
      'cs.current_turn',
      'cs.max_turns',
      'cs.started_at',
      'cs.completed_at',
      's.title as scenario_title',
      'st.title as subtask_title',
      'u.username'
    )
    .where('cs.del', 0)
    .orderBy('cs.started_at', 'desc')
    .limit(30);

  if (scenarioId) {
    query.andWhere('cs.scenario_id', scenarioId);
  }

  const rows = await query;

  return {
    scenarios,
    selectedScenarioId: scenarioId,
    sessions: rows
  };
}

async function getBookmarkManagementData({ keyword = '' } = {}) {
  const rows = await bookmarkService.getAllBookmarks('default', { includePracticed: true });
  const normalizedKeyword = String(keyword || '').trim().toLowerCase();
  const bookmarks = normalizedKeyword
    ? rows.filter((item) => {
      return [item.word, item.definition_cn, item.definition_en, item.source_scenario_id]
        .some((value) => String(value || '').toLowerCase().includes(normalizedKeyword));
    })
    : rows;

  return {
    keyword,
    bookmarks: bookmarks.slice(0, 100)
  };
}

module.exports = {
  getBookmarkManagementData,
  getConversationManagementData,
  getDashboardData,
  getModelConfigManagementData,
  getPromptManagementData,
  getPromptLibraryManagementData,
  getScenarioManagementData
};
