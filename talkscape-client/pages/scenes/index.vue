<template>
  <view class="page">
    <view class="header">
      <view class="title-row">
        <text class="h1">场景实战</text>
        <text class="title-emoji">🎯</text>
      </view>
      <text class="header-sub">沉浸式口语对练，在真实语境中提升表达</text>
    </view>

    <view class="stats-row">
      <view class="stat-item">
        <text class="stat-val">{{ myScenes.length }}</text>
        <text class="stat-lbl">已添加</text>
      </view>
      <view class="stat-divider"></view>
      <view class="stat-item">
        <text class="stat-val">{{ allScenes.length - myScenes.length }}</text>
        <text class="stat-lbl">可添加</text>
      </view>
      <view class="stat-divider"></view>
      <view class="stat-item">
        <text class="stat-val">{{ completedSceneCount }}</text>
        <text class="stat-lbl">已完成</text>
      </view>
    </view>

    <view class="section">
      <view class="section-header">
        <text class="section-title">我的场景</text>
        <text class="section-count">{{ myScenes.length }}</text>
      </view>
      <view v-if="myScenes.length === 0" class="empty-card">
        <text class="empty-text">还没有添加场景，从下方添加吧</text>
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
            :metaText="sceneProgressLabel(s)"
            @open="openScene"
            @remove="removeScene"
          />
        </view>
      </scroll-view>
    </view>

    <view v-if="featuredScenes.length" class="section">
      <view class="section-header">
        <text class="section-title">特色场景</text>
      </view>
      <scroll-view scroll-x class="scene-strip" show-scrollbar="false">
        <view class="scene-strip-inner">
          <scene-card
            v-for="s in featuredScenes"
            :key="s.id"
            :scene="s"
            variant="featured"
            :statusText="scenarioStore.isScenarioCompleted(s.id) ? '已完成' : (scenarioStore.isUserScenario(s.id) ? '已添加' : '未开始')"
            :statusClass="scenarioStore.isScenarioCompleted(s.id) ? 'completed' : (scenarioStore.isUserScenario(s.id) ? 'added' : 'default')"
            :summary="sceneBrief(s)"
            metaText="特色练习"
            @open="openScene"
          />
        </view>
      </scroll-view>
    </view>

    <view v-for="category in levelCategories" :key="category.id" class="section">
      <view class="section-header">
        <text class="section-title">{{ category.title }}</text>
        <text class="section-count">{{ category.scenes.length }}</text>
      </view>
      <scroll-view scroll-x class="scene-strip" show-scrollbar="false">
        <view class="scene-strip-inner">
          <scene-card
            v-for="s in category.scenes"
            :key="s.id"
            :scene="s"
            variant="level"
            :statusText="scenarioStore.isScenarioCompleted(s.id) ? '已完成' : (scenarioStore.isUserScenario(s.id) ? '已添加' : '未开始')"
            :statusClass="scenarioStore.isScenarioCompleted(s.id) ? 'completed' : (scenarioStore.isUserScenario(s.id) ? 'added' : 'default')"
            :summary="sceneBrief(s)"
            :metaText="sceneProgressLabel(s)"
            @open="openLevelScene"
          />
        </view>
      </scroll-view>
    </view>

    <view v-if="freeScenes.length" class="section">
      <view class="section-header">
        <text class="section-title">自由场景</text>
      </view>
      <scroll-view scroll-x class="scene-strip" show-scrollbar="false">
        <view class="scene-strip-inner">
          <scene-card
            v-for="s in freeScenes"
            :key="s.id"
            :scene="s"
            variant="free"
            statusText="自由"
            statusClass="default"
            :summary="sceneBrief(s)"
            metaText="开放对话"
            @open="openScene"
          />
        </view>
      </scroll-view>
    </view>

    <view class="create-section">
      <view class="create-card" @click="createScene">
        <text class="create-icon">+</text>
        <text class="create-text">创建新场景</text>
        <text class="create-desc">自定义你的专属对话场景</text>
      </view>
    </view>

    <view style="height:32px;"></view>

    <app-dialog
      :visible="dialog.visible"
      :title="dialog.title"
      :message="dialog.message"
      :actions="dialog.actions"
      :show-cancel="dialog.showCancel"
      :cancel-text="dialog.cancelText"
      @close="closeDialog"
      @select="onDialogSelect"
    />
  </view>
</template>

<script>
import { scenarioStore } from '../../store/scenario';

export default {
  data() {
    return {
      scenarioStore: null,
      dialog: {
        visible: false,
        title: '',
        message: '',
        actions: [],
        showCancel: true,
        cancelText: '取消'
      }
    };
  },
  computed: {
    allScenes() {
      return this.scenarioStore?.scenarios || [];
    },
    featuredScenes() {
      return this.scenarioStore?.featuredScenes || [];
    },
    freeScenes() {
      return this.scenarioStore?.freeScenes || [];
    },
    levelCategories() {
      return this.scenarioStore?.levelCategories || [];
    },
    levelSceneCount() {
      return this.levelCategories.reduce((sum, item) => sum + item.scenes.length, 0);
    },
    myScenes() {
      if (!this.scenarioStore) return [];
      return this.scenarioStore.scenarios
        .filter(s => this.scenarioStore.isUserScenario(s.id))
        .map((s) => this.scenarioStore.decorateScenario(s));
    },
    completedSceneCount() {
      return this.scenarioStore?.completedScenarios?.length || 0;
    }
  },
  async onShow() {
    this.scenarioStore = scenarioStore();
    await Promise.all([
      this.scenarioStore.loadUserScenarios(),
      this.scenarioStore.loadUserScenarioProgress(),
      this.scenarioStore.fetchScenarios()
    ]);
  },
  methods: {
    buildConversationUrl(s, preferredSubTaskId = '') {
      const decoratedScenario = this.scenarioStore?.decorateScenario(s) || s;
      const resumeSessionId = decoratedScenario?.resumeSessionId || '';
      const params = [`id=${encodeURIComponent(decoratedScenario.id)}`];
      if (resumeSessionId) params.push(`sessionId=${encodeURIComponent(resumeSessionId)}`);
      if (!resumeSessionId) {
        const subTaskId = preferredSubTaskId || decoratedScenario?.defaultSubTaskId || decoratedScenario?.subTasks?.[0]?.id || '';
        if (subTaskId) params.push(`subTaskId=${encodeURIComponent(subTaskId)}`);
      }
      return `/pages/scenario/conversation?${params.join('&')}`;
    },
    openScene(s) {
      const url = this.buildConversationUrl(s);
      uni.navigateTo({ url });
    },
    startLevelTask(s, task) {
      const taskId = task?.id || s?.defaultSubTaskId || s?.subTasks?.[0]?.id || '';
      const url = this.buildConversationUrl(s, taskId);
      uni.navigateTo({ url });
    },
    openLevelScene(s) {
      if (this.scenarioStore.isUserScenario(s.id)) {
        this.startLevelTask(s, (s.subTasks || [])[0]);
        return;
      }
      const defaultSubTaskId = s?.defaultSubTaskId || s?.subTasks?.[0]?.id || '';
      const url = defaultSubTaskId
        ? `/pages/scenario/detail?id=${s.id}&subTaskId=${encodeURIComponent(defaultSubTaskId)}`
        : `/pages/scenario/detail?id=${s.id}`;
      uni.navigateTo({ url });
    },
    sceneProgressLabel(scene) {
      if (this.scenarioStore?.isScenarioCompleted(scene?.id)) {
        return '已完成';
      }
      if (scene?.sceneType === 'level' || scene?.scene_type === 'level') {
        return `关卡 ${scene.subTaskCount || 0}`;
      }
      if (scene?.sceneType === 'featured' || scene?.scene_type === 'featured') {
        return '特色模式';
      }
      return '自由练习';
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
      return scene?.description || scene?.title_en || '开始这个主题练习';
    },
    async removeScene(s) {
      try {
        await this.scenarioStore.removeUserScenario(s.id);
        uni.showToast({ title: `已移除 ${s.title}`, icon: 'none' });
      } catch (e) {
        uni.showToast({ title: e.message || '移除场景失败', icon: 'none' });
      }
    },
    async addScene(s) {
      try {
        await this.scenarioStore.addUserScenario(s.id);
        uni.showToast({ title: `已添加 ${s.title}`, icon: 'none' });
      } catch (e) {
        uni.showToast({ title: e.message || '添加场景失败', icon: 'none' });
      }
    },
    createScene() {
      this.dialog = {
        visible: true,
        title: '创建场景',
        message: '自定义场景功能即将上线，敬请期待。',
        actions: [
          { key: 'ok', label: '知道了', variant: 'primary' }
        ],
        showCancel: false,
        cancelText: '取消'
      };
    },
    closeDialog() {
      this.dialog.visible = false;
    },
    onDialogSelect() {
      this.closeDialog();
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
.title-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.h1 { font-size: 36px; font-weight: 700; color: #fff; letter-spacing: -1px; line-height: 1; }
.title-emoji { font-size: 26px; transform: translateY(-2px); }
.header-sub { display: block; font-size: 13px; color: rgba(255,255,255,0.5); }

.stats-row { display: flex; align-items: center; background: #fff; margin: -14px 16px 24px; padding: 14px 12px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border: 1px solid #f0f0f0; position: relative; z-index: 2; }
.stat-item { flex: 1; text-align: center; }
.stat-val { display: block; font-size: 18px; font-weight: 700; color: #000; }
.stat-lbl { display: block; font-size: 11px; color: #999; margin-top: 1px; }
.stat-divider { width: 1px; height: 28px; background: #eee; }

.section { padding: 0 16px; margin-bottom: 18px; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.section-title { font-size: 16px; font-weight: 600; color: #000; }
.section-count { font-size: 12px; color: #999; background: #f5f5f5; padding: 2px 10px; border-radius: 100px; }

.empty-card { padding: 32px; text-align: center; border: 1px dashed #ddd; border-radius: 12px; }
.empty-text { font-size: 13px; color: #999; }

.scene-strip { white-space: nowrap; scrollbar-width: none; -ms-overflow-style: none; }
.scene-strip::-webkit-scrollbar { display: none; width: 0; height: 0; }
.scene-strip-inner { display: inline-flex; gap: 8px; padding-right: 16px; }

.create-section { padding: 0 16px; }
.create-card { border: 1px dashed #ccc; border-radius: 12px; padding: 24px; text-align: center; transition: all 0.15s; }
.create-card:active { border-color: #000; background: #fafafa; }
.create-icon { display: block; font-size: 28px; color: #000; margin-bottom: 8px; }
.create-text { display: block; font-size: 15px; font-weight: 600; color: #000; margin-bottom: 4px; }
.create-desc { display: block; font-size: 12px; color: #999; }
</style>
