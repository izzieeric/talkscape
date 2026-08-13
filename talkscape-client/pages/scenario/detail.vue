<template>
  <view class="page">
    <view class="nav">
      <view class="nav-back" @click="goBack">‹</view>
      <view class="nav-center">
        <text class="nav-title">关卡介绍</text>
        <text class="nav-sub">先了解内容，再开始挑战</text>
      </view>
      <view class="nav-side"></view>
    </view>

    <view v-if="loading" class="loading-state">
      <text class="loading-text">正在加载关卡信息...</text>
    </view>

    <view v-else-if="scenario" class="content">
      <view class="hero-card">
        <view class="hero-top">
          <text class="hero-icon">{{ scenario.icon || '📚' }}</text>
          <view class="hero-meta">
            <text class="hero-title">{{ scenario.title }}</text>
            <text class="hero-subtitle">{{ sceneTypeLabel }}</text>
          </view>
        </view>
        <text class="hero-desc">{{ scenario.description || scenario.title_en || '开始这个主题练习。' }}</text>
        <view class="hero-tags">
          <text class="hero-tag">{{ scenario.categoryTitle || '通用主题' }}</text>
          <text class="hero-tag">共 {{ scenario.subTaskCount || 0 }} 个关卡</text>
          <text v-if="isCompleted" class="hero-tag completed">已完成挑战</text>
          <text class="hero-tag">{{ scenarioStore.isUserScenario(scenario.id) ? '已加入我的场景' : '开始后加入我的场景' }}</text>
        </view>
      </view>

      <view class="section">
        <text class="section-title">你将练到什么</text>
        <view class="info-card">
          <text class="info-line">主题：{{ scenario.title }}</text>
          <text class="info-line">分类：{{ scenario.categoryTitle || '未分类' }}</text>
          <text class="info-line">模式：{{ sceneTypeLabel }}</text>
          <text class="info-line">默认起始关卡：{{ selectedTaskTitle }}</text>
        </view>
      </view>

      <view class="section">
        <text class="section-title">关卡内容</text>
        <view v-if="scenario.subTasks && scenario.subTasks.length" class="task-list">
          <view
            v-for="task in scenario.subTasks"
            :key="task.id"
            class="task-card"
            :class="{ active: selectedSubTaskId === task.id }"
          >
            <view class="task-head">
              <text class="task-index">关卡 {{ task.sortOrder || 1 }}</text>
              <text v-if="selectedSubTaskId === task.id" class="task-badge">起始</text>
            </view>
            <text class="task-title">{{ task.title }}</text>
            <text class="task-desc">{{ task.description || task.promptHint || '进入后开始这一关的口语挑战。' }}</text>
          </view>
        </view>
        <view v-else class="info-card">
          <text class="info-line">这个场景会直接从主题对话开始，不拆分独立关卡。</text>
        </view>
      </view>
    </view>

    <view v-else class="loading-state">
      <text class="loading-text">未找到这个关卡</text>
    </view>

    <view v-if="scenario" class="footer">
      <button class="start-btn" :disabled="starting" @click="startChallenge">
        {{ starting ? '正在进入...' : (isCompleted ? '再次挑战' : '开始挑战') }}
      </button>
      <text class="footer-hint">{{ isCompleted ? '你已完成过这个关卡场景，可以再次挑战。' : '点击开始挑战后，才会加入“我的场景”。' }}</text>
    </view>
  </view>
</template>

<script>
import { scenarioStore } from '../../store/scenario';

export default {
  data() {
    return {
      scenarioStore: null,
      scenarioId: '',
      selectedSubTaskId: '',
      loading: true,
      starting: false
    };
  },
  computed: {
    scenario() {
      if (!this.scenarioStore || !this.scenarioId) return null;
      return this.scenarioStore.currentScenario?.id === this.scenarioId
        ? this.scenarioStore.currentScenario
        : this.scenarioStore.getScenarioByIdLocal(this.scenarioId);
    },
    selectedTask() {
      if (!this.scenario) return null;
      const fallbackId = this.scenario.defaultSubTaskId || this.scenario.subTasks?.[0]?.id || '';
      const taskId = this.selectedSubTaskId || fallbackId;
      return (this.scenario.subTasks || []).find((item) => item.id === taskId) || this.scenario.subTasks?.[0] || null;
    },
    selectedTaskTitle() {
      return this.selectedTask?.title || '主题开场';
    },
    isCompleted() {
      return Boolean(this.scenarioStore?.isScenarioCompleted(this.scenarioId));
    },
    sceneTypeLabel() {
      const type = this.scenario?.sceneType || this.scenario?.scene_type || 'level';
      if (type === 'featured') return '特色挑战';
      if (type === 'free') return '自由场景';
      return '关卡挑战';
    }
  },
  async onLoad(options) {
    this.scenarioStore = scenarioStore();
    this.scenarioId = options.id || '';
    this.selectedSubTaskId = options.subTaskId || '';
    await this.loadScenario();
  },
  methods: {
    async loadScenario() {
      this.loading = true;
      try {
        await Promise.all([
          this.scenarioStore.fetchScenarios(),
          this.scenarioStore.loadUserScenarios(),
          this.scenarioStore.loadUserScenarioProgress()
        ]);
        if (this.scenarioId) {
          await this.scenarioStore.fetchScenarioById(this.scenarioId);
        }
        if (!this.selectedSubTaskId) {
          this.selectedSubTaskId = this.scenario?.defaultSubTaskId || this.scenario?.subTasks?.[0]?.id || '';
        }
      } catch (e) {
        uni.showToast({ title: e.message || '加载关卡失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },
    goBack() {
      uni.navigateBack();
    },
    async startChallenge() {
      if (!this.scenario || this.starting) return;
      this.starting = true;
      try {
        if (!this.scenarioStore.isUserScenario(this.scenario.id)) {
          await this.scenarioStore.addUserScenario(this.scenario.id);
        }
        const taskId = this.selectedSubTaskId || this.scenario.defaultSubTaskId || this.scenario.subTasks?.[0]?.id || '';
        const url = taskId
          ? `/pages/scenario/conversation?id=${this.scenario.id}&subTaskId=${encodeURIComponent(taskId)}`
          : `/pages/scenario/conversation?id=${this.scenario.id}`;
        uni.navigateTo({ url });
      } catch (e) {
        uni.showToast({ title: e.message || '开始挑战失败', icon: 'none' });
      } finally {
        this.starting = false;
      }
    }
  }
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 56px 16px 120px;
  background: #f8fafc;
  box-sizing: border-box;
}

.nav {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.nav-back,
.nav-side {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-back {
  border-radius: 999px;
  background: #ffffff;
  color: #111827;
  font-size: 24px;
  line-height: 1;
}

.nav-center {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.nav-title {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}

.nav-sub {
  margin-top: 2px;
  font-size: 12px;
  color: #667085;
}

.loading-state {
  padding: 40px 20px;
  text-align: center;
}

.loading-text {
  font-size: 14px;
  color: #667085;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hero-card,
.info-card,
.task-card {
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05);
}

.hero-card {
  padding: 18px;
}

.hero-top {
  display: flex;
  align-items: center;
  gap: 14px;
}

.hero-icon {
  font-size: 36px;
  line-height: 1;
}

.hero-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.hero-title {
  font-size: 22px;
  font-weight: 700;
  color: #111827;
}

.hero-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: #667085;
}

.hero-desc {
  margin-top: 16px;
  font-size: 14px;
  line-height: 1.7;
  color: #475467;
}

.hero-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 16px;
}

.hero-tag {
  padding: 6px 10px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 11px;
}

.hero-tag.completed {
  background: #dcfce7;
  color: #166534;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}

.info-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-line {
  font-size: 13px;
  color: #475467;
  line-height: 1.6;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-card {
  padding: 16px;
}

.task-card.active {
  border: 1px solid #c7d2fe;
  background: #f8faff;
}

.task-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.task-index {
  font-size: 11px;
  color: #667085;
}

.task-badge {
  padding: 4px 8px;
  border-radius: 999px;
  background: #111827;
  color: #ffffff;
  font-size: 10px;
}

.task-title {
  margin-top: 8px;
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}

.task-desc {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.6;
  color: #667085;
}

.footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, 0.96);
  border-top: 1px solid #e5e7eb;
}

.start-btn {
  width: 100%;
  height: 48px;
  border: none;
  border-radius: 14px;
  background: #111827;
  color: #ffffff;
  font-size: 16px;
  font-weight: 700;
}

.start-btn[disabled] {
  opacity: 0.7;
}

.footer-hint {
  display: block;
  margin-top: 8px;
  text-align: center;
  font-size: 11px;
  color: #667085;
}
</style>
