<template>
  <view class="page-no-tab">
    <view class="hero">
      <view class="nav-inner">
        <view class="nav-back" @click="goBack"><text>←</text></view>
        <view class="nav-main">
          <text class="nav-title">{{ t('settings.pageTitle') }}</text>
          <text class="nav-subtitle">{{ t('settings.pageSubtitle') }}</text>
        </view>
      </view>
    </view>

    <view v-for="(group, gi) in settings" :key="gi" class="section">
      <text class="section-label">{{ t(group.labelKey) }}</text>
      <view class="settings-card">
        <view v-for="(item, ii) in group.items" :key="ii" class="setting-row" :class="{ toggle: item.type === 'toggle', readonly: !canSelectItem(item) }" @click="item.type !== 'toggle' && canSelectItem(item) && handleAction(item)">
          <view class="setting-info">
            <text class="setting-name">{{ t(item.nameKey) }}</text>
            <text class="setting-desc">{{ t(item.descKey) }}</text>
          </view>
          <text v-if="item.type === 'toggle'">
            <switch :checked="item.value" @change="(e) => toggleSetting(item, e)" color="#000" />
          </text>
          <text v-else class="setting-value">{{ item.displayValue || item.value || '' }}<template v-if="canSelectItem(item)"> →</template></text>
        </view>
      </view>
    </view>

    <view class="tip-card">
      <text class="tip-title">{{ t('settings.tipTitle') }}</text>
      <text class="tip-text">{{ t('settings.tipText') }}</text>
    </view>

    <view class="reset-area" @click="resetAll"><text class="reset-btn">{{ t('settings.resetButton') }}</text></view>

    <view v-if="difficultyModalVisible" class="difficulty-modal-mask" @tap="closeDifficultyModal">
      <view class="difficulty-modal" @tap.stop>
        <view class="difficulty-modal-head">
          <text class="difficulty-modal-title">{{ t('settings.difficultyModal.title') }}</text>
          <view class="difficulty-modal-close" @tap="closeDifficultyModal"><text>×</text></view>
        </view>

        <view class="difficulty-chart">
          <view class="difficulty-current-label">{{ t('settings.difficultyModal.current') }}</view>
          <view class="difficulty-bars">
            <view
              v-for="level in difficultyLevels"
              :key="level.value"
              class="difficulty-bar-item"
              :class="{ active: draftLearningDifficulty === level.value }"
              @tap="selectDifficultyLevel(level.value)"
            >
              <view class="difficulty-pointer" v-if="draftLearningDifficulty === level.value"></view>
              <view class="difficulty-bar" :style="{ height: level.height + 'px' }">
                <text class="difficulty-bar-label">{{ level.value }}</text>
              </view>
            </view>
          </view>
          <view class="difficulty-progress-track">
            <view class="difficulty-progress-fill" :style="{ width: difficultyProgressWidth }"></view>
          </view>
        </view>

        <view class="difficulty-detail">
          <text class="difficulty-detail-title">{{ currentDifficultyMeta.title }}</text>
          <text class="difficulty-detail-desc">{{ currentDifficultyMeta.desc }}</text>
          <view class="difficulty-example-block">
            <text class="difficulty-example-label">{{ t('settings.difficultyModal.example') }}</text>
            <text class="difficulty-example-text">{{ currentDifficultyMeta.example }}</text>
          </view>
        </view>

        <view class="difficulty-actions">
          <view class="difficulty-save-btn" @tap="confirmDifficultySelection">
            <text>{{ t('settings.difficultyModal.save') }}</text>
          </view>
        </view>
      </view>
    </view>

  </view>
</template>

<script>
import { authStore } from '../../store/auth';
import { settingsStore } from '../../store/settings';
import {
  getAppText,
  getConversationStyleOptions,
  getLearningDifficultyLabel,
  getLearningDifficultyOptions,
  getLearningLanguageOptions,
  getNativeLanguageOptions,
  normalizeLearningDifficulty,
  normalizeNativeLanguage
} from '../../utils/app-language';

const SPEED_OPTIONS = [
  { label: '0.5x', value: 0.5 },
  { label: '0.8x', value: 0.8 },
  { label: '1.0x', value: 1.0 },
  { label: '1.2x', value: 1.2 },
  { label: '1.5x', value: 1.5 }
];

const AUTO_REMOVE_OPTIONS = [
  { label: '1 次', value: 1 },
  { label: '2 次', value: 2 },
  { label: '3 次', value: 3 }
];

const DIFFICULTY_LEVELS = [
  { value: 'A1', height: 72 },
  { value: 'A2', height: 96 },
  { value: 'B1', height: 120 },
  { value: 'B2', height: 144 },
  { value: 'C1', height: 168 },
  { value: 'C2', height: 192 }
];

export default {
  data() {
    return {
      sStore: null,
      nativeLanguage: 'zh-CN',
      difficultyModalVisible: false,
      draftLearningDifficulty: 'A1',
      difficultyLevels: DIFFICULTY_LEVELS,
      settings: [
        { labelKey: 'settings.section.goal', items: [
          { nameKey: 'settings.item.learningLanguage.name', descKey: 'settings.item.learningLanguage.desc', key: 'learningLanguage', value: 'en', type: 'select', optionType: 'learningLanguage' },
          { nameKey: 'settings.item.learningDifficulty.name', descKey: 'settings.item.learningDifficulty.desc', key: 'learningDifficulty', value: 'A1', type: 'select', optionType: 'learningDifficulty' },
          { nameKey: 'settings.item.nativeLanguage.name', descKey: 'settings.item.nativeLanguage.desc', key: 'nativeLanguage', value: 'zh-CN', type: 'select', optionType: 'nativeLanguage' }
        ]},
        { labelKey: 'settings.section.voice', items: [
          { nameKey: 'settings.item.voiceSpeed.name', descKey: 'settings.item.voiceSpeed.desc', key: 'voiceSpeed', value: 1.0, type: 'select', options: SPEED_OPTIONS },
          { nameKey: 'settings.item.autoPlayVoice.name', descKey: 'settings.item.autoPlayVoice.desc', key: 'autoPlayVoice', value: true, type: 'toggle' },
          { nameKey: 'settings.item.voiceOnly.name', descKey: 'settings.item.voiceOnly.desc', key: 'voiceOnly', value: false, type: 'toggle' }
        ]},
        { labelKey: 'settings.section.ai', items: [
          { nameKey: 'settings.item.conversationStyle.name', descKey: 'settings.item.conversationStyle.desc', key: 'conversationStyle', value: 'normal', type: 'select', optionType: 'conversationStyle' }
        ]},
        { labelKey: 'settings.section.aid', items: [
          { nameKey: 'settings.item.showTranslation.name', descKey: 'settings.item.showTranslation.desc', key: 'showTranslation', value: true, type: 'toggle' },
          { nameKey: 'settings.item.showHints.name', descKey: 'settings.item.showHints.desc', key: 'showHints', value: true, type: 'toggle' },
          { nameKey: 'settings.item.showHintExamples.name', descKey: 'settings.item.showHintExamples.desc', key: 'showHintExamples', value: true, type: 'toggle' },
          { nameKey: 'settings.item.smartExplainEnabled.name', descKey: 'settings.item.smartExplainEnabled.desc', key: 'smartExplainEnabled', value: false, type: 'toggle' }
        ]},
        { labelKey: 'settings.section.wordbook', items: [
          { nameKey: 'settings.item.wordbookAutoRemoveCount.name', descKey: 'settings.item.wordbookAutoRemoveCount.desc', key: 'wordbookAutoRemoveCount', value: 1, type: 'select', options: AUTO_REMOVE_OPTIONS }
        ]}
      ]
    };
  },
  onShow() {
    const auth = authStore();
    auth.bootstrap();
    if (!auth.isLoggedIn) {
      uni.redirectTo({ url: '/pages/auth/login?redirect=%2Fpages%2Fprofile%2Fsettings' });
      return;
    }
    this.sStore = settingsStore();
    this.sStore.loadSettings().then(() => this.syncFromStore());
  },
  methods: {
    t(key, params = {}) {
      return getAppText(this.nativeLanguage, key, params);
    },
    getOptions(item) {
      if (item.optionType === 'learningLanguage') {
        return getLearningLanguageOptions(this.nativeLanguage);
      }
      if (item.optionType === 'learningDifficulty') {
        return getLearningDifficultyOptions(this.nativeLanguage);
      }
      if (item.optionType === 'nativeLanguage') {
        return getNativeLanguageOptions(this.nativeLanguage);
      }
      if (item.optionType === 'conversationStyle') {
        return getConversationStyleOptions(this.nativeLanguage);
      }
      return item.options || [];
    },
    canSelectItem(item) {
      return this.getOptions(item).length > 1;
    },
    getItemDisplayValue(item) {
      if (item.type === 'toggle') return item.value;
      const match = this.getOptions(item).find((option) => option.value === item.value);
      return match?.label || item.value;
    },
    getDifficultyMeta(value) {
      const level = normalizeLearningDifficulty(value, 'A1');
      return {
        value: level,
        title: this.t(`settings.difficultyModal.level.${level}.title`),
        desc: this.t(`settings.difficultyModal.level.${level}.desc`),
        example: this.t(`settings.difficultyModal.level.${level}.example`)
      };
    },
    getSettingItem(key) {
      for (const group of this.settings) {
        const found = group.items.find((item) => item.key === key);
        if (found) return found;
      }
      return null;
    },
    openDifficultyModal() {
      const current = this.getSettingItem('learningDifficulty');
      this.draftLearningDifficulty = normalizeLearningDifficulty(current?.value || this.sStore?.learningDifficulty || 'A1', 'A1');
      this.difficultyModalVisible = true;
    },
    closeDifficultyModal() {
      this.difficultyModalVisible = false;
    },
    selectDifficultyLevel(value) {
      this.draftLearningDifficulty = normalizeLearningDifficulty(value, 'A1');
    },
    async confirmDifficultySelection() {
      const item = this.getSettingItem('learningDifficulty');
      if (!item) {
        this.closeDifficultyModal();
        return;
      }
      item.value = normalizeLearningDifficulty(this.draftLearningDifficulty, 'A1');
      item.displayValue = getLearningDifficultyLabel(item.value, this.nativeLanguage);
      await this.syncToStore();
      this.syncFromStore();
      this.closeDifficultyModal();
      uni.showToast({ title: this.t('settings.updated', { name: this.t(item.nameKey) }), icon: 'none' });
    },
    syncFromStore() {
      if (!this.sStore) return;
      this.nativeLanguage = normalizeNativeLanguage(this.sStore.nativeLanguage || 'zh-CN');
      for (const group of this.settings) {
        for (const item of group.items) {
          if (item.key in this.sStore) {
            item.value = this.sStore[item.key];
            item.displayValue = this.getItemDisplayValue(item);
          }
        }
      }
    },
    async syncToStore() {
      if (!this.sStore) return;
      const nextSettings = {};
      for (const group of this.settings) {
        for (const item of group.items) {
          if (item.key) {
            nextSettings[item.key] = item.value;
            item.displayValue = this.getItemDisplayValue(item);
          }
        }
      }
      await this.sStore.updateSettings(nextSettings);
    },
    goBack() { uni.navigateBack(); },
    async toggleSetting(item, e) {
      item.value = e.detail.value;
      await this.syncToStore();
      uni.showToast({ title: item.value ? this.t('common.on') : this.t('common.off'), icon: 'none' });
    },
    handleAction(item) {
      if (item.key === 'learningDifficulty') {
        this.openDifficultyModal();
        return;
      }
      const options = this.getOptions(item);
      if (!options.length) return;
      uni.showActionSheet({
        itemList: options.map((option) => option.label),
        success: async ({ tapIndex }) => {
          const selected = options[tapIndex];
          if (!selected) return;
          item.value = selected.value;
          if (item.key === 'nativeLanguage') {
            this.nativeLanguage = normalizeNativeLanguage(selected.value, 'zh-CN');
          }
          item.displayValue = selected.label;
          await this.syncToStore();
          this.syncFromStore();
          uni.showToast({ title: this.t('settings.updated', { name: this.t(item.nameKey) }), icon: 'none' });
        }
      });
    },
    resetAll() {
      uni.showModal({
        title: this.t('settings.resetTitle'),
        content: this.t('settings.resetContent'),
        confirmText: this.t('settings.resetConfirm'),
        cancelText: this.t('settings.resetCancel'),
        success: async ({ confirm }) => {
          if (!confirm) return;
          this.sStore.resetDefaults();
          await this.sStore.syncRemote();
          this.syncFromStore();
          uni.showToast({ title: this.t('settings.restored'), icon: 'success' });
        }
      });
    }
  },
  computed: {
    currentDifficultyMeta() {
      return this.getDifficultyMeta(this.draftLearningDifficulty);
    },
    difficultyProgressWidth() {
      const index = this.difficultyLevels.findIndex((item) => item.value === this.draftLearningDifficulty);
      const safeIndex = index < 0 ? 0 : index;
      return `${((safeIndex + 1) / this.difficultyLevels.length) * 100}%`;
    }
  }
};
</script>

<style scoped>
.page-no-tab { min-height: auto; background: #f5f7fb; padding-bottom: 32px; }
.hero { padding: calc(52px + env(safe-area-inset-top)) 16px 12px; background: linear-gradient(180deg, #111827 0%, #1f2937 100%); border-radius: 0 0 24px 24px; }
.nav-inner { display: flex; align-items: center; gap: 14px; }
.nav-back { width: 36px; height: 36px; border-radius: 12px; background: rgba(255,255,255,0.12); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 18px; }
.nav-main { flex: 1; min-width: 0; }
.nav-title { display: block; font-size: 24px; font-weight: 700; color: #fff; }
.nav-subtitle { display: block; margin-top: 4px; font-size: 12px; line-height: 1.6; color: rgba(255,255,255,0.68); }
.section { padding: 0 16px; margin-top: 18px; }
.section-label { display: block; font-size: 11px; font-weight: 700; color: #98a2b3; letter-spacing: 1px; margin-bottom: 10px; padding: 0 6px; }
.settings-card { background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 12px 30px rgba(15,23,42,0.05); }
.setting-row { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid #f2f4f7; transition: background 0.1s; }
.setting-row:last-child { border-bottom: none; }
.setting-row:active { background: #fafcff; }
.setting-info { flex: 1; }
.setting-name { display: block; font-size: 15px; font-weight: 600; color: #111827; }
.setting-desc { display: block; font-size: 12px; line-height: 1.6; color: #98a2b3; margin-top: 4px; padding-right: 12px; }
.setting-value { font-size: 13px; color: #667085; }
.tip-card { margin: 20px 16px 0; padding: 16px; border-radius: 18px; background: #fff; box-shadow: 0 12px 30px rgba(15,23,42,0.05); }
.tip-title { display: block; font-size: 14px; font-weight: 700; color: #111827; }
.tip-text { display: block; margin-top: 8px; font-size: 12px; line-height: 1.7; color: #667085; }
.reset-area { padding: 24px 16px; text-align: center; }
.reset-btn { color: #667085; font-size: 14px; }
.difficulty-modal-mask { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.38); display: flex; align-items: flex-end; justify-content: center; z-index: 50; padding: 18px 14px calc(18px + env(safe-area-inset-bottom)); }
.difficulty-modal { width: 100%; max-width: 760px; background: #f8fafc; border-radius: 28px; padding: 18px 18px 22px; box-sizing: border-box; box-shadow: 0 18px 60px rgba(15,23,42,0.18); }
.difficulty-modal-head { display: flex; align-items: center; justify-content: center; position: relative; min-height: 44px; }
.difficulty-modal-title { font-size: 20px; font-weight: 700; color: #111827; }
.difficulty-modal-close { position: absolute; right: 0; top: 0; width: 40px; height: 40px; border-radius: 20px; background: rgba(15,23,42,0.06); display: flex; align-items: center; justify-content: center; font-size: 24px; color: #667085; }
.difficulty-chart { margin-top: 12px; }
.difficulty-current-label { font-size: 12px; font-weight: 700; color: #2f95f6; margin-bottom: 10px; }
.difficulty-bars { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; min-height: 228px; }
.difficulty-bar-item { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
.difficulty-pointer { width: 2px; height: 26px; background: #2f95f6; position: relative; margin-bottom: 8px; }
.difficulty-pointer::before { content: ''; position: absolute; top: -8px; left: 50%; transform: translateX(-50%); width: 10px; height: 10px; border: 3px solid #2f95f6; border-radius: 50%; background: #fff; box-sizing: border-box; }
.difficulty-bar { width: 100%; border-radius: 18px; border: 1px solid #dbe3ef; background: #fff; display: flex; align-items: center; justify-content: center; box-sizing: border-box; transition: all 0.18s ease; }
.difficulty-bar-label { font-size: 22px; font-weight: 700; color: #111827; }
.difficulty-bar-item.active .difficulty-bar { background: #2f95f6; border-color: #2f95f6; box-shadow: 0 8px 16px rgba(47,149,246,0.24); }
.difficulty-bar-item.active .difficulty-bar-label { color: #fff; }
.difficulty-progress-track { height: 10px; border-radius: 999px; background: #e5e7eb; margin-top: 16px; overflow: hidden; }
.difficulty-progress-fill { height: 100%; border-radius: 999px; background: #2f95f6; transition: width 0.18s ease; }
.difficulty-detail { margin-top: 18px; padding-top: 18px; border-top: 1px solid #e5e7eb; }
.difficulty-detail-title { display: block; font-size: 18px; font-weight: 700; color: #111827; }
.difficulty-detail-desc { display: block; margin-top: 10px; font-size: 14px; line-height: 1.8; color: #667085; }
.difficulty-example-block { margin-top: 16px; }
.difficulty-example-label { display: block; font-size: 13px; font-weight: 700; color: #98a2b3; }
.difficulty-example-text { display: block; margin-top: 10px; font-size: 15px; line-height: 1.8; color: #111827; }
.difficulty-actions { margin-top: 22px; }
.difficulty-save-btn { height: 54px; border-radius: 18px; background: #2f95f6; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 18px; font-weight: 700; box-shadow: inset 0 -4px 0 rgba(0,0,0,0.08); }
</style>
