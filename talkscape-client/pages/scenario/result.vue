<template>
  <view class="page-no-tab">
    <!-- Hero -->
    <view class="result-hero">
      <view class="result-bg"></view>
      <view class="result-content">
        <view class="score-circle">
          <text class="score-num">{{ totalScore }}</text>
          <text class="score-lbl">分数</text>
        </view>
        <view class="stars">
          <text v-for="i in 5" :key="i" class="star" :class="{ filled: i <= starCount }">★</text>
        </view>
        <text class="result-title">太棒了！</text>
        <text class="result-desc">{{ scenarioName }} 场景练习完成</text>
      </view>
    </view>

    <!-- Stats -->
    <view class="stats-row">
      <view class="stat-mini"><text class="stat-mini-val">{{ stats.totalMessages }}</text><text class="stat-mini-lbl">消息</text></view>
      <view class="stat-mini"><text class="stat-mini-val">{{ stats.userMessages }}</text><text class="stat-mini-lbl">你</text></view>
      <view class="stat-mini"><text class="stat-mini-val">{{ stats.aiMessages }}</text><text class="stat-mini-lbl">AI</text></view>
      <view class="stat-mini"><text class="stat-mini-val">{{ stats.wordsLearned }}</text><text class="stat-mini-lbl">新词</text></view>
    </view>

    <!-- Feedback -->
    <view class="section">
      <text class="section-title">评价反馈</text>
      <view class="feedback-list">
        <view class="feedback-item">
          <text class="feedback-icon">✓</text>
          <text class="feedback-text">关键词发音很好</text>
        </view>
        <view class="feedback-item">
          <text class="feedback-icon">✓</text>
          <text class="feedback-text">礼貌用语使用恰当</text>
        </view>
        <view class="feedback-item">
          <text class="feedback-icon">!</text>
          <text class="feedback-text">可以尝试放慢语速</text>
        </view>
      </view>
    </view>

    <!-- Words -->
    <view class="section">
      <text class="section-title">学习单词</text>
      <view class="words-list">
        <view v-for="(w, i) in words" :key="i" class="word-item">
          <text class="word-t">{{ w.word }}</text>
          <text class="word-p">{{ w.phonetic }}</text>
          <text class="word-d">{{ w.definition_cn || w.definition }}</text>
        </view>
      </view>
    </view>

    <!-- Actions -->
    <view class="actions-row">
      <view class="btn btn-primary" @click="retry">🔄 再来一次</view>
      <view class="btn btn-outline" @click="goHome">🏠 首页</view>
    </view>
  </view>
</template>

<script>
import { conversationApi } from '../../utils/request';

export default {
  data() {
    return {
      sessionId: null,
      totalScore: 0, starCount: 0, scenarioName: '',
      words: [],
      stats: { totalMessages: 0, userMessages: 0, aiMessages: 0, wordsLearned: 0 }
    };
  },
  onLoad(options) {
    if (options.id) {
      this.sessionId = options.id;
      this.loadResult(options.id);
    }
  },
  methods: {
    async loadResult(id) {
      try {
        const res = await conversationApi.getResult(id);
        const data = res.data;
        this.scenarioName = data.session?.scenario_id || 'Restaurant';
        this.stats = data.stats;
        this.words = data.words || [];
        // Mock score for now - in production this comes from AI evaluation
        this.totalScore = Math.min(100, 60 + this.stats.userMessages * 5);
        this.starCount = Math.ceil(this.totalScore / 20);
      } catch {
        this.totalScore = 85;
        this.starCount = 4;
        this.scenarioName = '对话练习';
        this.words = [];
      }
    },
    retry() { uni.navigateBack(); },
    goHome() { uni.reLaunch({ url: '/pages/index/index' }); }
  }
};
</script>

<style scoped>
.page-no-tab { min-height: auto; background: #fff; padding-bottom: 32px; }
.result-hero { position: relative; padding: 60px 24px 32px; text-align: center; overflow: hidden; }
.result-bg { position: absolute; top: 0; left: 0; right: 0; height: 240px; background: #000; border-radius: 0 0 20px 20px; }
.result-content { position: relative; z-index: 1; }
.score-circle { width: 110px; height: 110px; border-radius: 50%; background: rgba(255,255,255,0.1); display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 0 auto; }
.score-num { font-size: 40px; font-weight: 700; color: #fff; line-height: 1; }
.score-lbl { font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 2px; }
.stars { margin-top: 10px; }
.star { font-size: 22px; color: rgba(255,255,255,0.2); margin: 0 2px; }
.star.filled { color: #fff; }
.result-title { display: block; font-size: 22px; font-weight: 700; color: #fff; margin-top: 10px; }
.result-desc { display: block; font-size: 13px; color: rgba(255,255,255,0.5); margin-top: 4px; }
.stats-row { display: flex; gap: 8px; padding: 0 16px; margin-top: -14px; position: relative; z-index: 2; }
.stat-mini { flex: 1; background: #fff; padding: 10px 8px; border-radius: 10px; text-align: center; border: 1px solid #f0f0f0; }
.stat-mini-val { display: block; font-size: 16px; font-weight: 700; color: #000; }
.stat-mini-lbl { display: block; font-size: 9px; color: #999; margin-top: 1px; }
.section { padding: 0 16px; margin-top: 20px; }
.section-title { font-size: 15px; font-weight: 600; color: #000; display: block; margin-bottom: 10px; }
.feedback-list { background: #fff; border: 1px solid #f0f0f0; border-radius: 12px; padding: 12px 16px; }
.feedback-item { display: flex; align-items: flex-start; gap: 10px; padding: 6px 0; }
.feedback-icon { width: 20px; height: 20px; border-radius: 50%; background: #f5f5f5; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; flex-shrink: 0; margin-top: 1px; color: #666; }
.feedback-text { font-size: 13px; color: #666; line-height: 1.5; }
.words-list { background: #fff; border: 1px solid #f0f0f0; border-radius: 12px; overflow: hidden; }
.word-item { padding: 12px 16px; border-bottom: 1px solid #f5f5f5; }
.word-item:last-child { border-bottom: none; }
.word-t { display: block; font-size: 14px; font-weight: 600; color: #000; }
.word-p { display: block; font-size: 11px; color: #999; margin-top: 1px; }
.word-d { display: block; font-size: 12px; color: #666; margin-top: 2px; }
.actions-row { display: flex; gap: 8px; padding: 24px 16px; }
.btn { flex: 1; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 10px; font-size: 14px; font-weight: 500; transition: all 0.1s; }
.btn:active { transform: scale(0.97); }
.btn-primary { background: #000; color: #fff; }
.btn-outline { border: 1px solid #eee; color: #000; }
.btn-outline:active { background: #f9f9f9; }
</style>
