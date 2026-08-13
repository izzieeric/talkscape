<template>
  <view class="page">
    <view class="profile-header">
      <view class="ph-bg"></view>
      <view class="ph-content">
        <view class="ph-avatar">
          <text class="ph-avatar-text">{{ profileUser.avatarText || 'T' }}</text>
          <view class="ph-level">{{ isLoggedIn ? t('profile.loggedIn') : t('profile.guest') }}</view>
        </view>
        <text class="ph-name">{{ profileUser.displayName }}</text>
        <text class="ph-desc">{{ profileUser.bio || (isLoggedIn ? '@' + profileUser.username : t('profile.loginToSync')) }}</text>
        <view class="ph-actions">
          <view v-if="isLoggedIn" class="ph-btn light" @click="goToAccount">{{ t('profile.editProfile') }}</view>
          <view v-else class="ph-btn light" @click="goToLogin">{{ t('profile.loginRegister') }}</view>
          <view v-if="isLoggedIn" class="ph-btn dark" @click="logout">{{ t('profile.logout') }}</view>
        </view>
      </view>
      <view class="ph-stats">
        <view class="ph-stat">
          <text class="ph-stat-val">{{ stats.totalSessions }}</text>
          <text class="ph-stat-lbl">{{ t('profile.practice') }}</text>
        </view>
        <view class="ph-stat">
          <text class="ph-stat-val">{{ stats.totalBookmarks }}</text>
          <text class="ph-stat-lbl">{{ t('profile.words') }}</text>
        </view>
        <view class="ph-stat">
          <text class="ph-stat-val">{{ stats.streakDays }}</text>
          <text class="ph-stat-lbl">{{ t('profile.streak') }}</text>
        </view>
      </view>
    </view>

    <view class="menu-card">
      <view class="menu-item" @click="goToBookmark">
        <view class="menu-icon"><text>📖</text></view>
        <view class="menu-info">
          <text class="menu-title">{{ t('profile.menuBookmarks') }}</text>
          <text class="menu-desc">{{ t('profile.menuBookmarkDesc', { count: stats.totalBookmarks }) }}</text>
        </view>
        <text class="menu-arrow">→</text>
      </view>
      <view class="menu-item" @click="goToSettings">
        <view class="menu-icon"><text>⚙️</text></view>
        <view class="menu-info">
          <text class="menu-title">{{ t('profile.menuSettings') }}</text>
          <text class="menu-desc">{{ t('profile.menuSettingsDesc') }}</text>
        </view>
        <text class="menu-arrow">→</text>
      </view>
    </view>

    <view class="section">
      <text class="section-title">{{ t('profile.achievements') }}</text>
      <view class="ach-grid">
        <view v-for="(a, i) in achievements" :key="i" class="ach-item" :class="{ locked: !a.unlocked }">
          <text class="ach-icon">{{ a.icon }}</text>
          <text class="ach-name">{{ a.name }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { authStore } from '../../store/auth';
import { settingsStore } from '../../store/settings';
import { getAppText, normalizeNativeLanguage } from '../../utils/app-language';

export default {
  data() {
    return {
      nativeLanguage: 'zh-CN',
      profileUser: {
        username: '',
        displayName: '',
        avatarText: 'T',
        bio: ''
      },
      stats: {
        totalSessions: 0,
        totalBookmarks: 0,
        streakDays: 0
      },
      achievements: [
        { icon: '🎯', name: '首次', unlocked: true }, { icon: '🔥', name: '7天', unlocked: true },
        { icon: '📚', name: '50词', unlocked: true }, { icon: '🌟', name: '100词', unlocked: true },
        { icon: '🏆', name: '高手', unlocked: false }, { icon: '💎', name: '大师', unlocked: false }
      ]
    };
  },
  computed: {
    isLoggedIn() {
      const store = authStore();
      store.bootstrap();
      return store.isLoggedIn;
    }
  },
  async onShow() {
    const store = authStore();
    store.bootstrap();
    const sStore = settingsStore();
    await sStore.loadSettings();
    this.nativeLanguage = normalizeNativeLanguage(sStore.nativeLanguage || 'zh-CN');

    if (!store.isLoggedIn) {
      this.profileUser = { username: '', displayName: this.t('profile.notLoggedIn'), avatarText: 'T', bio: '' };
      this.stats = { totalSessions: 0, totalBookmarks: 0, streakDays: 0 };
      return;
    }

    try {
      const profile = await store.fetchProfile();
      this.profileUser = profile.user;
      this.stats = profile.stats;
    } catch (e) {
      uni.showToast({ title: e.message || this.t('common.loadFailed'), icon: 'none' });
    }
  },
  methods: {
    t(key, params = {}) {
      return getAppText(this.nativeLanguage, key, params);
    },
    goToLogin() {
      uni.navigateTo({ url: '/pages/auth/login?redirect=%2Fpages%2Fprofile%2Findex' });
    },
    goToAccount() { uni.navigateTo({ url: '/pages/profile/account' }); },
    ensureAuth(target) {
      if (this.isLoggedIn) {
        target();
        return;
      }

      uni.navigateTo({ url: '/pages/auth/login?redirect=%2Fpages%2Fprofile%2Findex' });
    },
    goToBookmark() { this.ensureAuth(() => uni.switchTab({ url: '/pages/word/bookmark' })); },
    goToSettings() { this.ensureAuth(() => uni.navigateTo({ url: '/pages/profile/settings' })); },
    logout() {
      const store = authStore();
      store.logout();
      this.profileUser = { username: '', displayName: this.t('profile.notLoggedIn'), avatarText: 'T', bio: '' };
      this.stats = { totalSessions: 0, totalBookmarks: 0, streakDays: 0 };
      uni.showToast({ title: this.t('profile.loggedOutToast'), icon: 'none' });
    }
  }
};
</script>

<style scoped>
.page { padding-top: 0; background: #fff; }
.profile-header { position: relative; padding: 56px 20px 0; overflow: hidden; }
.ph-bg { position: absolute; top: 0; left: 0; right: 0; height: 280px; background: #000; border-radius: 0 0 24px 24px; }
.ph-content { position: relative; z-index: 1; text-align: center; padding-bottom: 20px; }
.ph-avatar { width: 76px; height: 76px; border-radius: 20px; background: #1a1a1a; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; position: relative; }
.ph-avatar-text { font-size: 30px; font-weight: 700; color: #fff; }
.ph-level { position: absolute; bottom: -4px; right: -4px; background: #fff; color: #000; padding: 2px 8px; border-radius: 100px; font-size: 10px; font-weight: 700; }
.ph-name { display: block; font-size: 22px; font-weight: 700; color: #fff; }
.ph-desc { display: block; font-size: 13px; color: rgba(255,255,255,0.5); margin-top: 2px; }
.ph-actions { display: flex; justify-content: center; gap: 8px; margin-top: 14px; }
.ph-btn { min-width: 90px; padding: 8px 14px; border-radius: 999px; font-size: 12px; font-weight: 600; text-align: center; }
.ph-btn.light { background: #fff; color: #000; }
.ph-btn.dark { background: rgba(255,255,255,0.15); color: #fff; border: 1px solid rgba(255,255,255,0.2); }
.ph-stats { display: flex; gap: 8px; padding: 16px 0 20px; position: relative; z-index: 1; }
.ph-stat { flex: 1; background: #fff; padding: 12px 8px; border-radius: 12px; text-align: center; }
.ph-stat-val { display: block; font-size: 20px; font-weight: 700; color: #000; }
.ph-stat-lbl { display: block; font-size: 11px; font-weight: 500; color: #888; margin-top: 2px; }
.menu-card { margin: 16px; background: #fff; border-radius: 14px; border: 1px solid #f0f0f0; overflow: hidden; }
.menu-item { display: flex; align-items: center; padding: 14px 16px; border-bottom: 1px solid #f5f5f5; transition: background 0.1s; }
.menu-item:last-child { border-bottom: none; }
.menu-item:active { background: #fafafa; }
.menu-icon { width: 34px; height: 34px; border-radius: 8px; background: #f5f5f5; display: flex; align-items: center; justify-content: center; font-size: 15px; margin-right: 12px; }
.menu-info { flex: 1; }
.menu-title { display: block; font-size: 15px; font-weight: 600; color: #000; }
.menu-desc { display: block; font-size: 12px; color: #999; margin-top: 1px; }
.menu-arrow { font-size: 14px; color: #ccc; }
.section { padding: 0 16px; margin-bottom: 24px; }
.section-title { font-size: 16px; font-weight: 600; color: #000; display: block; margin-bottom: 12px; }
.ach-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.ach-item { width: calc(33.33% - 6px); background: #fff; border: 1px solid #f0f0f0; padding: 14px 8px; border-radius: 12px; text-align: center; }
.ach-item.locked { opacity: 0.35; }
.ach-icon { font-size: 22px; display: block; margin-bottom: 4px; }
.ach-name { font-size: 11px; color: #666; display: block; }
</style>
