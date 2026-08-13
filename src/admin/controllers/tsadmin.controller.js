const adminService = require('../../services/admin.service');
const tsadminService = require('../services/tsadmin.service');
const { clearAdminCookie, setAdminCookie } = require('../middleware/admin-auth');
const scenarioService = require('../../services/scenario.service');
const promptConfigService = require('../../services/prompt-config.service');
const aiFunctionConfigService = require('../../services/ai-function-config.service');
const aiClient = require('../../services/ai-client');
const { getAiProviderMeta } = require('../../ai/ai-function-meta');
const { isPromptLayerEditable } = require('../../prompts/prompt-feature-meta');
const { TSADMIN_ASSETS_PATH, TSADMIN_BASE_PATH } = require('../../config/http-paths');

async function render(ctx, view, payload = {}) {
  await ctx.render(`pages/${view}`, {
    title: payload.title || 'tsadmin',
    adminAssetsPath: TSADMIN_ASSETS_PATH,
    adminBasePath: TSADMIN_BASE_PATH,
    pageKey: payload.pageKey || '',
    user: payload.user || null,
    query: payload.query || {},
    data: payload.data || {},
    notice: payload.notice || '',
    errorMessage: payload.errorMessage || ''
  });
}

function buildPromptPageQuery(input = {}) {
  const query = new URLSearchParams();
  const setIf = (key, value) => {
    if (value != null && String(value).trim() !== '') {
      query.set(key, String(value));
    }
  };

  setIf('feature', input.feature || 'conversation');
  setIf('scenarioId', input.scenarioId);
  setIf('subTaskId', input.subTaskId);
  setIf('slotKey', input.slotKey);
  setIf('saved', input.saved);
  return query.toString();
}

function buildPromptLibraryPageQuery(input = {}) {
  const query = new URLSearchParams();
  const setIf = (key, value) => {
    if (value != null && String(value).trim() !== '') {
      query.set(key, String(value));
    }
  };

  setIf('libraryFeature', input.libraryFeature);
  setIf('libraryLayerCode', input.libraryLayerCode);
  setIf('libraryKeyword', input.libraryKeyword);
  setIf('libraryPromptId', input.libraryPromptId);
  setIf('saved', input.saved);
  return query.toString();
}

function buildModelConfigPageQuery(input = {}) {
  const query = new URLSearchParams();
  const setIf = (key, value) => {
    if (value != null && String(value).trim() !== '') {
      query.set(key, String(value));
    }
  };

  setIf('saved', input.saved);
  setIf('savedCount', input.savedCount);
  return query.toString();
}

function buildScenarioPageQuery(input = {}) {
  const query = new URLSearchParams();
  const setIf = (key, value) => {
    if (value != null && String(value).trim() !== '') {
      query.set(key, String(value));
    }
  };

  setIf('scenarioId', input.scenarioId);
  setIf('create', input.create);
  setIf('saved', input.saved);
  return query.toString();
}

function isAjaxRequest(ctx) {
  const requestedWith = String(ctx.get('X-Requested-With') || '').trim().toLowerCase();
  const accept = String(ctx.get('Accept') || '').trim().toLowerCase();
  return requestedWith === 'xmlhttprequest' || accept.includes('application/json');
}

exports.loginPage = async (ctx) => {
  if (ctx.state.adminUser) {
    ctx.redirect(TSADMIN_BASE_PATH);
    return;
  }

  await render(ctx, 'login', {
    title: '登录后台',
    pageKey: 'login',
    query: ctx.query,
    errorMessage: ctx.query?.error === '1' ? '用户名或密码错误' : ''
  });
};

exports.loginSubmit = async (ctx) => {
  try {
    const result = await adminService.loginAdmin({
      username: ctx.request.body?.username,
      password: ctx.request.body?.password,
      loginIp: ctx.ip
    });
    setAdminCookie(ctx, result.token);
    ctx.redirect(ctx.request.body?.redirect || TSADMIN_BASE_PATH);
  } catch (error) {
    if (error.status === 401 || error.status === 400 || error.status === 403) {
      ctx.redirect(`${TSADMIN_BASE_PATH}/login?error=1&redirect=${encodeURIComponent(ctx.request.body?.redirect || TSADMIN_BASE_PATH)}`);
      return;
    }
    throw error;
  }
};

exports.logout = async (ctx) => {
  clearAdminCookie(ctx);
  ctx.redirect(`${TSADMIN_BASE_PATH}/login`);
};

exports.dashboard = async (ctx) => {
  await render(ctx, 'dashboard', {
    title: '后台首页',
    pageKey: 'dashboard',
    user: ctx.state.adminUser,
    data: await tsadminService.getDashboardData(ctx.state.adminUser),
    notice: ctx.query?.saved === '1' ? '保存成功' : ''
  });
};

exports.scenarios = async (ctx) => {
  const data = await tsadminService.getScenarioManagementData();
  const selectedScenarioId = ctx.query?.scenarioId || '';
  const createMode = ctx.query?.create === '1';
  const selectedScenario = !createMode
    ? ((selectedScenarioId && (data.scenarios || []).find((item) => item.id === selectedScenarioId)) || null)
    : null;

  await render(ctx, 'scenarios', {
    title: '场景管理',
    pageKey: 'scenarios',
    user: ctx.state.adminUser,
    query: ctx.query,
    notice: ctx.query?.saved === '1' ? '场景已保存' : '',
    data: {
      ...data,
      selectedScenario,
      createMode
    }
  });
};

exports.saveScenario = async (ctx) => {
  const scenarioId = ctx.request.body?.scenarioId || '';
  const payload = {
    id: ctx.request.body?.id || '',
    title: ctx.request.body?.title || '',
    titleEn: ctx.request.body?.titleEn || '',
    description: ctx.request.body?.description || '',
    descriptionEn: ctx.request.body?.descriptionEn || '',
    difficulty: ctx.request.body?.difficulty || '',
    icon: ctx.request.body?.icon || '',
    tagsText: ctx.request.body?.tagsText || '',
    sortOrder: ctx.request.body?.sortOrder || 0,
    maxTurns: ctx.request.body?.maxTurns || 10,
    sceneType: ctx.request.body?.sceneType || 'level',
    categoryId: ctx.request.body?.categoryId || '',
    isFeatured: ctx.request.body?.isFeatured,
    subtasksJson: ctx.request.body?.subtasksJson || '[]'
  };

  const saved = scenarioId
    ? await scenarioService.updateScenario(scenarioId, payload)
    : await scenarioService.createScenario(payload);

  ctx.redirect(`${TSADMIN_BASE_PATH}/scenarios?${buildScenarioPageQuery({
    scenarioId: saved.id,
    saved: '1'
  })}`);
};

exports.deleteScenario = async (ctx) => {
  await scenarioService.deleteScenario(ctx.request.body?.scenarioId || '');
  ctx.redirect(`${TSADMIN_BASE_PATH}/scenarios`);
};

exports.prompts = async (ctx) => {
  try {
    await render(ctx, 'prompts', {
      title: '提示词管理',
      pageKey: 'prompts',
      user: ctx.state.adminUser,
      query: ctx.query,
      notice: ctx.query?.saved === '1' ? '提示词已保存' : '',
      data: await tsadminService.getPromptManagementData({
        feature: ctx.query?.feature || 'conversation',
        scenarioId: ctx.query?.scenarioId || '',
        subTaskId: ctx.query?.subTaskId || '',
        slotKey: ctx.query?.slotKey || ''
      })
    });
  } catch (error) {
    throw error;
  }
};

exports.promptLibrary = async (ctx) => {
  await render(ctx, 'prompt-library', {
    title: '提示词库',
    pageKey: 'prompt-library',
    user: ctx.state.adminUser,
    query: ctx.query,
    notice: ctx.query?.saved === '1' ? '提示词已保存' : '',
    data: await tsadminService.getPromptLibraryManagementData({
      libraryFeature: ctx.query?.libraryFeature || '',
      libraryLayerCode: ctx.query?.libraryLayerCode || '',
      libraryKeyword: ctx.query?.libraryKeyword || '',
      libraryPromptId: ctx.query?.libraryPromptId || ''
    })
  });
};

exports.modelConfigs = async (ctx) => {
  const savedCount = Number(ctx.query?.savedCount || 0) || 0;
  await render(ctx, 'model-configs', {
    title: '模型配置',
    pageKey: 'model-configs',
    user: ctx.state.adminUser,
    query: ctx.query,
    notice: ctx.query?.saved === '1'
      ? `模型配置已保存${savedCount > 0 ? `（${savedCount} 项）` : ''}`
      : '',
    data: await tsadminService.getModelConfigManagementData()
  });
};

exports.savePrompt = async (ctx) => {
  try {
    const targetType = ctx.request.body?.targetType || 'scenario';
    const workbenchFeature = ctx.request.body?.workbenchFeature || ctx.request.body?.feature || 'conversation';
    const bindingFeature = ctx.request.body?.feature || '';
    const scenarioId = ctx.request.body?.scenarioId || '';
    const subTaskId = ctx.request.body?.subTaskId || '';
    const promptId = ctx.request.body?.promptId || '';
    const layerCode = ctx.request.body?.layerCode || '';

    if (!isPromptLayerEditable(layerCode)) {
      const error = new Error('该层级由系统托管，后台不可修改绑定');
      error.status = 400;
      throw error;
    }

    if (targetType === 'system') {
      await promptConfigService.replacePromptBindings({
        ownerType: promptConfigService.OWNER_TYPES.SYSTEM,
        ownerId: 'default',
        layerCode,
        feature: bindingFeature,
        subFeatureCode: ctx.request.body?.subFeatureCode || '',
        flowCode: ctx.request.body?.flowCode || '',
        promptIds: promptId
      });
    } else {
      await promptConfigService.replacePromptBindings({
        ownerType: subTaskId ? promptConfigService.OWNER_TYPES.SUB_SCENARIO : promptConfigService.OWNER_TYPES.SCENARIO,
        ownerId: subTaskId || scenarioId,
        layerCode: subTaskId ? promptConfigService.LAYER_CODES.SUB_SCENARIO : promptConfigService.LAYER_CODES.SCENARIO,
        feature: bindingFeature,
        subFeatureCode: ctx.request.body?.subFeatureCode || '',
        flowCode: ctx.request.body?.flowCode || '',
        targetId: subTaskId || scenarioId,
        promptIds: promptId
      });
    }

    ctx.redirect(`${TSADMIN_BASE_PATH}/prompts?${buildPromptPageQuery({
      feature: workbenchFeature,
      scenarioId,
      subTaskId,
      slotKey: ctx.request.body?.slotKey || '',
      saved: '1'
    })}`);
  } catch (error) {
    throw error;
  }
};

exports.saveModelConfig = async (ctx) => {
  try {
    let savedCount = 0;
    let savedEntry = null;
    if (ctx.request.body?.payloadJson) {
      const payload = JSON.parse(ctx.request.body.payloadJson);
      const entries = Array.isArray(payload) ? payload : payload?.configs;
      const savedEntries = await aiFunctionConfigService.saveFunctionConfigs(entries || []);
      savedCount = savedEntries.length;
      savedEntry = savedEntries[0] || null;
    } else {
      const functionCode = ctx.request.body?.functionCode || '';
      savedEntry = await aiFunctionConfigService.saveFunctionConfig(functionCode, {
        provider: ctx.request.body?.provider || '',
        baseUrl: ctx.request.body?.baseUrl || '',
        model: ctx.request.body?.model || '',
        ttsModel: ctx.request.body?.ttsModel || '',
        ttsVoice: ctx.request.body?.ttsVoice || ''
      });
      savedCount = 1;
    }
    aiClient.resetClient();
    if (isAjaxRequest(ctx)) {
      const providerLabel = savedEntry?.provider ? (getAiProviderMeta(savedEntry.provider)?.label || savedEntry.provider) : '';
      ctx.body = {
        success: true,
        data: savedEntry ? {
          ...savedEntry,
          providerLabel
        } : null,
        savedCount
      };
      return;
    }
    ctx.redirect(`${TSADMIN_BASE_PATH}/model-configs?${buildModelConfigPageQuery({ saved: '1', savedCount })}`);
  } catch (error) {
    if (isAjaxRequest(ctx)) {
      ctx.status = error.status || 500;
      ctx.body = {
        success: false,
        error: error.message || '保存失败'
      };
      return;
    }
    throw error;
  }
};

exports.savePromptDefinition = async (ctx) => {
  try {
    const promptId = ctx.request.body?.editingPromptId || '';
    if (!isPromptLayerEditable(ctx.request.body?.layerCode || '')) {
      const error = new Error('该层级由系统托管，只允许查看，不允许编辑');
      error.status = 400;
      throw error;
    }

    if (promptId) {
      const existingPrompt = await promptConfigService.getPromptById(promptId, { includeInactive: true });
      if (!existingPrompt) {
        const error = new Error('Prompt not found');
        error.status = 404;
        throw error;
      }
      if (!isPromptLayerEditable(existingPrompt.layerCode)) {
        const error = new Error('该提示词属于系统托管层，不允许在后台修改');
        error.status = 400;
        throw error;
      }
    }

    const payload = {
      promptCode: ctx.request.body?.promptCode || '',
      title: ctx.request.body?.title || '',
      description: ctx.request.body?.description || '',
      layerCode: ctx.request.body?.layerCode || '',
      feature: ctx.request.body?.promptFeature || '',
      subFeatureCode: ctx.request.body?.promptSubFeatureCode || '',
      flowCode: ctx.request.body?.promptFlowCode || '',
      targetId: ctx.request.body?.promptTargetId || '',
      categoryKey: ctx.request.body?.categoryKey || '',
      sourceRef: ctx.request.body?.sourceRef || '',
      content: ctx.request.body?.content || '',
      sortOrder: ctx.request.body?.sortOrder || 0,
      isActive: ctx.request.body?.isActive === '1'
    };

    const savedPrompt = promptId
      ? await promptConfigService.updatePromptDefinition(promptId, payload)
      : await promptConfigService.createPromptDefinition(payload);

    ctx.redirect(`${TSADMIN_BASE_PATH}/prompt-library?${buildPromptLibraryPageQuery({
      libraryFeature: ctx.request.body?.libraryFeature || '',
      libraryLayerCode: ctx.request.body?.libraryLayerCode || '',
      libraryKeyword: ctx.request.body?.libraryKeyword || '',
      libraryPromptId: savedPrompt.id,
      saved: '1'
    })}`);
  } catch (error) {
    throw error;
  }
};

exports.deletePromptDefinition = async (ctx) => {
  try {
    const prompt = await promptConfigService.getPromptById(ctx.request.body?.promptId || '', { includeInactive: true });
    if (!prompt) {
      const error = new Error('Prompt not found');
      error.status = 404;
      throw error;
    }
    if (!isPromptLayerEditable(prompt.layerCode) || prompt.isBuiltin) {
      const error = new Error('系统托管或内建提示词不允许删除');
      error.status = 400;
      throw error;
    }

    await promptConfigService.deletePromptDefinition(prompt.id);

    ctx.redirect(`${TSADMIN_BASE_PATH}/prompt-library?${buildPromptLibraryPageQuery({
      libraryFeature: ctx.request.body?.libraryFeature || '',
      libraryLayerCode: ctx.request.body?.libraryLayerCode || '',
      libraryKeyword: ctx.request.body?.libraryKeyword || '',
      saved: '1'
    })}`);
  } catch (error) {
    throw error;
  }
};

exports.conversations = async (ctx) => {
  await render(ctx, 'conversations', {
    title: '会话巡检',
    pageKey: 'conversations',
    user: ctx.state.adminUser,
    query: ctx.query,
    data: await tsadminService.getConversationManagementData({
      scenarioId: ctx.query?.scenarioId || ''
    })
  });
};

exports.bookmarks = async (ctx) => {
  await render(ctx, 'bookmarks', {
    title: '收藏词巡检',
    pageKey: 'bookmarks',
    user: ctx.state.adminUser,
    query: ctx.query,
    data: await tsadminService.getBookmarkManagementData({
      keyword: ctx.query?.keyword || ''
    })
  });
};
