import { defineStore } from 'pinia';
import { authApi, profileApi } from '../utils/request';
import { clearClientCache } from '../utils/app-cache';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

export const authStore = defineStore('auth', {
  state: () => ({
    initialized: false,
    token: '',
    user: null,
    profile: null
  }),

  getters: {
    isLoggedIn: (state) => Boolean(state.token && state.user),
    displayName: (state) => state.profile?.user?.displayName || state.user?.displayName || state.user?.username || '未登录'
  },

  actions: {
    bootstrap() {
      if (this.initialized) return;

      try {
        this.token = uni.getStorageSync(TOKEN_KEY) || '';
        this.user = uni.getStorageSync(USER_KEY) || null;
      } catch {
        this.token = '';
        this.user = null;
      }

      this.initialized = true;
    },

    persist() {
      uni.setStorageSync(TOKEN_KEY, this.token || '');
      uni.setStorageSync(USER_KEY, this.user || null);
    },

    clearAuth() {
      clearClientCache();
      this.initialized = true;
      this.token = '';
      this.user = null;
      this.profile = null;
    },

    async register(payload) {
      const res = await authApi.register(payload);
      this.token = res.data.token;
      this.user = res.data.user;
      this.persist();
      await this.fetchProfile();
      return res.data;
    },

    async login(payload) {
      const res = await authApi.login(payload);
      this.token = res.data.token;
      this.user = res.data.user;
      this.persist();
      await this.fetchProfile();
      return res.data;
    },

    async fetchMe() {
      this.bootstrap();
      if (!this.token) return null;

      const res = await authApi.me();
      this.token = res.data.token;
      this.user = res.data.user;
      this.persist();
      return res.data.user;
    },

    async fetchProfile() {
      this.bootstrap();
      if (!this.token) return null;

      const res = await profileApi.getMe();
      this.profile = res.data;
      if (res.data?.user) {
        this.user = res.data.user;
        this.persist();
      }
      return res.data;
    },

    async updateProfile(payload) {
      const res = await profileApi.updateMe(payload);
      this.user = res.data;
      if (this.profile?.stats || this.profile?.weekData) {
        this.profile = {
          ...this.profile,
          user: res.data
        };
      }
      this.persist();
      return res.data;
    },

    logout() {
      this.clearAuth();
    }
  }
});
