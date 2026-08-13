<template>
  <view class="page">
    <view class="header">
      <text class="app-name">TalkScape.</text>
      <text class="tagline">{{ t('home.tagline') }}</text>
    </view>

    <view class="stats-row">
      <view class="stat-item">
        <text class="stat-value">{{ stats.days }}</text>
        <text class="stat-label">{{ t('home.practiceDays') }}</text>
      </view>
      <view class="stat-divider"></view>
      <view class="stat-item">
        <text class="stat-value">{{ stats.conversations }}</text>
        <text class="stat-label">{{ t('home.totalConversations') }}</text>
      </view>
      <view class="stat-divider"></view>
      <view class="stat-item">
        <text class="stat-value">{{ stats.completedScenes }}</text>
        <text class="stat-label">{{ t('home.completedScenes') }}</text>
      </view>
    </view>

    <view class="section">
      <view class="section-header">
        <text class="section-title">{{ t('home.myScenes') }}</text>
        <text class="section-count">{{ myScenes.length }}</text>
      </view>
      <view v-if="myScenes.length === 0" class="empty-hint">
        <text>{{ t('home.emptyScenes') }}</text>
      </view>
      <scroll-view v-else scroll-x class="scene-strip" show-scrollbar="false">
        <view class="scene-strip-inner">
          <scene-card
            v-for="s in myScenes"
            :key="s.id"
            :scene="s"
            variant="mine"
            :showRemove="true"
            :statusText="scenarioStore.isScenarioCompleted(s.id) ? '已完成' : '已添加'"
            :statusClass="scenarioStore.isScenarioCompleted(s.id) ? 'completed' : 'added'"
            :summary="sceneBrief(s)"
            :metaText="formatSceneMeta(s)"
            @open="goToScenario"
            @remove="removeScene"
          />
        </view>
      </scroll-view>
    </view>

    <view class="section">
      <text class="section-title">{{ t('home.quickAccess') }}</text>
      <view class="quick-list">
        <view class="quick-item" @click="goToBookmark">
          <view class="quick-icon"><text>📖</text></view>
          <view class="quick-info">
            <text class="quick-title">{{ t('home.bookmarks') }}</text>
            <text class="quick-desc">{{ t('home.bookmarkCount', { count: stats.bookmarks }) }}</text>
          </view>
          <text class="quick-arrow">→</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { scenarioStore } from '../../store/scenario';
import { settingsStore } from '../../store/settings';
import { profileApi } from '../../utils/request';
import { getAppText, normalizeNativeLanguage } from '../../utils/app-language';

export default {
  data() {
    return {
      stats: { days: 0, conversations: 0, completedScenes: 0, bookmarks: 0 },
      scenarioStore: null,
      nativeLanguage: 'zh-CN'
    };
  },
  computed: {
    myScenes() {
      if (!this.scenarioStore) return [];
      return this.scenarioStore.userScenarios
        .map(id => this.scenarioStore.decorateScenario(this.scenarioStore.scenarios.find(s => s.id === id)))
        .filter(Boolean);
    }
  },
  async onShow() {
    this.scenarioStore = scenarioStore();
    await Promise.all([
      this.scenarioStore.loadUserScenarios(),
      this.scenarioStore.loadUserScenarioProgress(),
      this.scenarioStore.fetchScenarios()
    ]);
    // 加载设置
    const sStore = settingsStore();
    await sStore.loadSettings();
    this.nativeLanguage = normalizeNativeLanguage(sStore.nativeLanguage || 'zh-CN');
    await this.loadStats();
  },
  methods: {
    t(key, params = {}) {
      return getAppText(this.nativeLanguage, key, params);
    },
    difficultyLabel(difficulty) {
      if (difficulty === 'intermediate') return this.t('difficulty.intermediate');
      if (difficulty === 'advanced') return this.t('difficulty.advanced');
      return this.t('difficulty.beginner');
    },
    async loadStats() {
      try {
        const res = await profileApi.getMe();
        const rawStats = res?.data?.stats || {};
        this.stats = {
          days: Number(rawStats.activeDayCount || 0),
          conversations: Number(rawStats.totalConversationMessages || 0),
          completedScenes: Number(rawStats.completedScenarioCount || 0),
          bookmarks: Number(rawStats.totalBookmarks || 0)
        };
      } catch {
        this.stats = { days: 0, conversations: 0, completedScenes: 0, bookmarks: 0 };
      }
    },
    goToScenario(s) {
      const resumeSessionId = s?.resumeSessionId || '';
      const resumeSubTaskId = s?.resumeSubTaskId || '';
      const params = [`id=${encodeURIComponent(s.id)}`];
      if (resumeSessionId) params.push(`sessionId=${encodeURIComponent(resumeSessionId)}`);
      if (!resumeSessionId) {
        const subTaskId = resumeSubTaskId || s?.defaultSubTaskId || s?.subTasks?.[0]?.id || '';
        if (subTaskId) params.push(`subTaskId=${encodeURIComponent(subTaskId)}`);
      }
      const url = `/pages/scenario/conversation?${params.join('&')}`;
      uni.navigateTo({ url });
    },
    formatSceneMeta(scene) {
      if (scene?.sceneType === 'level' || scene?.scene_type === 'level') {
        return `${scene.categoryTitle || scene.category_title || this.t('home.levelScene')} · ${this.t('home.levelCount', { count: scene.subTaskCount || 0 })}`;
      }
      if (scene?.sceneType === 'featured' || scene?.scene_type === 'featured') {
        return this.t('home.featuredScene');
      }
      return this.t('home.freeScene');
    },
    sceneBrief(scene) {
      if (scene?.sceneType === 'level' || scene?.scene_type === 'level') {
        const taskTitles = (scene?.subTasks || [])
          .slice(0, 2)
          .map((item) => item.title)
          .filter(Boolean);
        if (taskTitles.length) {
          return taskTitles.join(' · ');
        }
      }
      return scene?.description || scene?.title_en || this.t('home.start');
    },
    goToBookmark() { uni.switchTab({ url: '/pages/word/bookmark' }); },
    async removeScene(s) {
      try {
        await this.scenarioStore.removeUserScenario(s.id);
        uni.showToast({ title: `已移除 ${s.title}`, icon: 'none' });
      } catch (e) {
        uni.showToast({ title: e.message || '移除场景失败', icon: 'none' });
      }
    }
  }
};
</script>

<style scoped>
.page {
  min-height: auto;
  padding-top: 0;
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  background: #fff;
}
.header { background: #000; padding: 56px 24px 28px; }
.app-name { display: block; font-size: 36px; font-weight: 700; color: #fff; letter-spacing: -1px; line-height: 1; margin-bottom: 6px; }
.tagline { display: block; font-size: 13px; color: rgba(255,255,255,0.5); }
.stats-row { display: flex; align-items: center; background: #fff; margin: -14px 16px 20px; padding: 14px 12px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border: 1px solid #f0f0f0; position: relative; z-index: 2; }
.stat-item { flex: 1; text-align: center; }
.stat-value { display: block; font-size: 18px; font-weight: 700; color: #000; }
.stat-label { display: block; font-size: 11px; color: #999; margin-top: 1px; }
.stat-divider { width: 1px; height: 28px; background: #eee; }
.section { padding: 0 16px; margin-bottom: 24px; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.section-title { font-size: 17px; font-weight: 600; color: #000; }
.section-count { font-size: 12px; color: #999; background: #f5f5f5; padding: 2px 10px; border-radius: 100px; font-weight:500; }
.section-action { font-size: 13px; color: #666; font-weight: 500; }
.empty-hint { padding: 24px; text-align: center; border: 1px dashed #ddd; border-radius: 12px; font-size: 13px; color: #999; }
.scene-strip { white-space: nowrap; scrollbar-width: none; -ms-overflow-style: none; }
.scene-strip::-webkit-scrollbar { display: none; width: 0; height: 0; }
.scene-strip-inner { display: inline-flex; gap: 8px; padding-right: 16px; }
.quick-list { display: flex; flex-direction: column; gap: 8px; }
.quick-item { display: flex; align-items: center; background: #fff; padding: 14px 16px; border-radius: 12px; border: 1px solid #f0f0f0; transition: all 0.15s; }
.quick-item:active { background: #f9f9f9; }
.quick-icon { width: 36px; height: 36px; border-radius: 8px; background: #f5f5f5; display: flex; align-items: center; justify-content: center; font-size: 16px; margin-right: 12px; }
.quick-info { flex: 1; }
.quick-title { display: block; font-size: 15px; font-weight: 600; color: #000; }
.quick-desc { display: block; font-size: 12px; color: #999; margin-top: 1px; }
.quick-arrow { font-size: 14px; color: #ccc; }
</style>
