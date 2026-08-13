import { defineStore } from 'pinia';
import { scenarioApi } from '../utils/request';
import { authStore } from './auth';

const USER_SCENARIOS_KEY = 'userScenarios';
const COMPLETED_SCENARIOS_KEY = 'completedScenarios';

function normalizeScenarioIds(list) {
  return [...new Set((Array.isArray(list) ? list : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean))];
}

export const scenarioStore = defineStore('scenario', {
  state: () => ({
    scenarios: [],
    currentScenario: null,
    scenarioConfig: null,
    userScenarios: [],  // 用户已添加的场景 ID 列表
    userScenarioMeta: {},
    completedScenarios: []
  }),

  getters: {
    featuredScenes: (state) => state.scenarios.filter((item) => item.sceneType === 'featured' || item.scene_type === 'featured'),
    freeScenes: (state) => state.scenarios.filter((item) => item.sceneType === 'free' || item.scene_type === 'free'),
    levelScenes: (state) => state.scenarios.filter((item) => (item.sceneType || item.scene_type || 'level') === 'level'),
    levelCategories() {
      const groupMap = new Map();

      this.levelScenes.forEach((scenario) => {
        const key = scenario.categoryId || scenario.category_id || 'uncategorized';
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            id: key,
            title: scenario.categoryTitle || scenario.category_title || '未分类',
            title_en: scenario.categoryTitleEn || scenario.category_title_en || '',
            icon: scenario.categoryIcon || scenario.category_icon || '📚',
            sortOrder: Number(scenario.categorySortOrder || scenario.category_sort_order || 0),
            scenes: []
          });
        }
        groupMap.get(key).scenes.push(scenario);
      });

      return Array.from(groupMap.values())
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((category) => ({
          ...category,
          scenes: category.scenes.slice().sort((a, b) => Number(a.sort_order || a.sortOrder || 0) - Number(b.sort_order || b.sortOrder || 0))
        }));
    }
  },

  actions: {
    async fetchScenarios() {
      try {
        const res = await scenarioApi.getAll();
        this.scenarios = res.data || [];
      } catch (e) {
        console.warn('Failed to fetch scenarios:', e.message);
      }
    },

    async fetchScenarioById(id) {
      try {
        const res = await scenarioApi.getById(id);
        this.currentScenario = res.data;
      } catch (e) {
        console.warn('Failed to fetch scenario:', e.message);
      }
    },

    async fetchScenarioConfig(id) {
      try {
        const res = await scenarioApi.getConfig(id);
        this.scenarioConfig = res.data;
      } catch (e) {
        console.warn('Failed to fetch config:', e.message);
      }
    },

    loadUserScenariosFromLocal() {
      try {
        const saved = uni.getStorageSync(USER_SCENARIOS_KEY);
        return normalizeScenarioIds(saved ? JSON.parse(saved) : []);
      } catch {
        return [];
      }
    },

    persistUserScenariosToLocal() {
      uni.setStorageSync(USER_SCENARIOS_KEY, JSON.stringify(this.userScenarios));
    },

    loadCompletedScenariosFromLocal() {
      try {
        const saved = uni.getStorageSync(COMPLETED_SCENARIOS_KEY);
        return normalizeScenarioIds(saved ? JSON.parse(saved) : []);
      } catch {
        return [];
      }
    },

    persistCompletedScenariosToLocal() {
      uni.setStorageSync(COMPLETED_SCENARIOS_KEY, JSON.stringify(this.completedScenarios));
    },

    // 用户场景管理（登录后走服务端，未登录走本地存储）
    async loadUserScenarios() {
      const store = authStore();
      store.bootstrap();

      if (!store.isLoggedIn) {
        this.userScenarios = this.loadUserScenariosFromLocal();
        this.userScenarioMeta = {};
        return this.userScenarios;
      }

      try {
        const res = await scenarioApi.getMine();
        const serverRows = res.data || [];
        this.userScenarios = normalizeScenarioIds(serverRows.map((item) => item?.id || item?.scenario_id || item?.scenarioId));
        this.userScenarioMeta = serverRows.reduce((acc, item) => {
          const scenarioId = String(item?.id || item?.scenario_id || item?.scenarioId || '').trim();
          if (!scenarioId) return acc;
          acc[scenarioId] = item;
          return acc;
        }, {});
        this.persistUserScenariosToLocal();
      } catch (e) {
        console.warn('Failed to load user scenarios from server:', e.message);
        this.userScenarios = this.loadUserScenariosFromLocal();
        this.userScenarioMeta = {};
      }

      return this.userScenarios;
    },

    async addUserScenario(scenarioId) {
      const nextId = String(scenarioId || '').trim();
      if (!nextId) return this.userScenarios;

      const store = authStore();
      store.bootstrap();

      if (store.isLoggedIn) {
        const res = await scenarioApi.addMine(nextId);
        const scenario = res?.data || null;
        if (scenario?.id) {
          this.userScenarioMeta = {
            ...this.userScenarioMeta,
            [scenario.id]: {
              ...scenario,
              resumeSessionId: '',
              resumeSubTaskId: '',
              resumeSessionStatus: ''
            }
          };
        }
      }

      if (!this.userScenarios.includes(nextId)) {
        this.userScenarios = [...this.userScenarios, nextId];
        this.persistUserScenariosToLocal();
      }

      return this.userScenarios;
    },

    async loadUserScenarioProgress() {
      const store = authStore();
      store.bootstrap();

      if (!store.isLoggedIn) {
        this.completedScenarios = this.loadCompletedScenariosFromLocal();
        return this.completedScenarios;
      }

      try {
        const res = await scenarioApi.getProgress();
        this.completedScenarios = normalizeScenarioIds(res?.data?.completedScenarioIds || []);
        this.persistCompletedScenariosToLocal();
      } catch (e) {
        console.warn('Failed to load scenario progress from server:', e.message);
        this.completedScenarios = this.loadCompletedScenariosFromLocal();
      }

      return this.completedScenarios;
    },

    markScenarioCompleted(scenarioId) {
      const nextId = String(scenarioId || '').trim();
      if (!nextId) return this.completedScenarios;

      if (!this.completedScenarios.includes(nextId)) {
        this.completedScenarios = [...this.completedScenarios, nextId];
        this.persistCompletedScenariosToLocal();
      }

      return this.completedScenarios;
    },

    async removeUserScenario(scenarioId) {
      const nextId = String(scenarioId || '').trim();
      if (!nextId) return this.userScenarios;

      const store = authStore();
      store.bootstrap();

      if (store.isLoggedIn) {
        await scenarioApi.removeMine(nextId);
      }

      this.userScenarios = this.userScenarios.filter((id) => id !== nextId);
      if (this.userScenarioMeta[nextId]) {
        const nextMeta = { ...this.userScenarioMeta };
        delete nextMeta[nextId];
        this.userScenarioMeta = nextMeta;
      }
      this.persistUserScenariosToLocal();
      return this.userScenarios;
    },

    isUserScenario(scenarioId) {
      return this.userScenarios.includes(scenarioId);
    },

    isScenarioCompleted(scenarioId) {
      return this.completedScenarios.includes(scenarioId);
    },

    getUserScenarioMeta(scenarioId) {
      return this.userScenarioMeta[String(scenarioId || '').trim()] || null;
    },

    decorateScenario(scenario) {
      if (!scenario?.id) return scenario || null;
      const meta = this.getUserScenarioMeta(scenario.id);
      return meta ? { ...scenario, ...meta } : scenario;
    },

    getScenarioByIdLocal(scenarioId) {
      const scenario = this.scenarios.find((item) => item.id === scenarioId) || null;
      return this.decorateScenario(scenario);
    },

    getDefaultSubTaskId(scenarioId) {
      const scenario = this.getScenarioByIdLocal(scenarioId);
      return scenario?.defaultSubTaskId || scenario?.subTasks?.[0]?.id || '';
    },

    getScenarioSubTask(scenarioId, subTaskId) {
      const scenario = this.getScenarioByIdLocal(scenarioId);
      if (!scenario || !subTaskId) return null;
      return (scenario.subTasks || []).find((item) => item.id === subTaskId) || null;
    }
  }
});
