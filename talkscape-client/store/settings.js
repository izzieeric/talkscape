import { defineStore } from 'pinia';
import { authStore } from './auth';
import { settingsApi } from '../utils/request';
import { normalizeSettingsPayload } from '../utils/app-language';

const DEFAULT_SETTINGS = {
  learningLanguage: 'en',
  learningDifficulty: 'A1',
  nativeLanguage: 'zh-CN',
  voiceSpeed: 1.0,
  autoPlayVoice: true,
  voiceOnly: false,
  showTranslation: true,
  showHints: true,
  showHintExamples: true,
  wordbookAutoRemoveCount: 1,
  conversationStyle: 'normal',
  smartExplainEnabled: false
};

function normalizeVoiceSpeed(value, fallback = DEFAULT_SETTINGS.voiceSpeed) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.min(4, Math.max(0.25, numericValue));
}

function normalizeSettings(value = {}) {
  const normalized = normalizeSettingsPayload({ ...DEFAULT_SETTINGS, ...(value || {}) });
  return {
    ...normalized,
    voiceSpeed: normalizeVoiceSpeed(normalized.voiceSpeed, DEFAULT_SETTINGS.voiceSpeed),
    autoPlayVoice: normalized.autoPlayVoice === undefined ? DEFAULT_SETTINGS.autoPlayVoice : Boolean(normalized.autoPlayVoice),
    voiceOnly: normalized.voiceOnly === undefined ? DEFAULT_SETTINGS.voiceOnly : Boolean(normalized.voiceOnly),
    showTranslation: normalized.showTranslation === undefined ? DEFAULT_SETTINGS.showTranslation : Boolean(normalized.showTranslation),
    showHints: normalized.showHints === undefined ? DEFAULT_SETTINGS.showHints : Boolean(normalized.showHints),
    showHintExamples: normalized.showHintExamples === undefined ? DEFAULT_SETTINGS.showHintExamples : Boolean(normalized.showHintExamples),
    smartExplainEnabled: normalized.smartExplainEnabled === undefined ? DEFAULT_SETTINGS.smartExplainEnabled : Boolean(normalized.smartExplainEnabled)
  };
}

function settingsEqual(left = {}, right = {}) {
  return JSON.stringify(normalizeSettings(left)) === JSON.stringify(normalizeSettings(right));
}

export const settingsStore = defineStore('settings', {
  state: () => ({
    ...DEFAULT_SETTINGS
  }),

  actions: {
    async loadSettings() {
      let localSettings = {};
      try {
        const saved = uni.getStorageSync('settings');
        if (saved) {
          localSettings = JSON.parse(saved) || {};
        }
      } catch {}

      Object.assign(this.$state, normalizeSettings(localSettings));

      const auth = authStore();
      auth.bootstrap();
      if (!auth.isLoggedIn) {
        this.saveLocal();
        return this.$state;
      }

      try {
        const res = await settingsApi.get();
        const remoteSettings = normalizeSettings(res?.data || {});
        const mergedSettings = normalizeSettings({
          ...remoteSettings,
          ...localSettings
        });

        Object.assign(this.$state, mergedSettings);
        this.saveLocal();

        if (!settingsEqual(remoteSettings, mergedSettings)) {
          await settingsApi.update(mergedSettings);
        }
      } catch {
        this.saveLocal();
      }

      return this.$state;
    },

    saveLocal() {
      uni.setStorageSync('settings', JSON.stringify(this.$state));
    },

    async syncRemote() {
      const auth = authStore();
      auth.bootstrap();
      if (!auth.isLoggedIn) return this.$state;

      const res = await settingsApi.update(this.$state);
      Object.assign(this.$state, normalizeSettings(res?.data || this.$state));
      this.saveLocal();
      return this.$state;
    },

    async updateSetting(key, value, options = {}) {
      this[key] = value;
      this.saveLocal();
      if (options.syncRemote === false) {
        return this.$state;
      }
      return this.syncRemote();
    },

    async updateSettings(settings = {}, options = {}) {
      Object.assign(this.$state, settings || {});
      this.saveLocal();
      if (options.syncRemote === false) {
        return this.$state;
      }
      return this.syncRemote();
    },

    resetDefaults() {
      Object.assign(this.$state, DEFAULT_SETTINGS);
      this.saveLocal();
    }
  }
});
