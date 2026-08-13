<template>
  <view class="page-no-tab">
    <view class="nav">
      <view class="nav-inner">
        <view class="nav-back" @click="goBack"><text>←</text></view>
        <text class="nav-title">个人资料</text>
        <view style="width:36px;"></view>
      </view>
    </view>

    <view class="form-card">
      <view class="avatar-box">
        <view class="avatar">{{ form.avatarText || 'T' }}</view>
        <text class="username">@{{ user?.username || '' }}</text>
      </view>

      <view class="field">
        <text class="label">昵称</text>
        <input v-model="form.displayName" class="input" placeholder="请输入昵称" />
      </view>

      <view class="field">
        <text class="label">头像字母</text>
        <input v-model="form.avatarText" class="input" maxlength="2" placeholder="最多2个字符" />
      </view>

      <view class="field">
        <text class="label">个人简介</text>
        <textarea v-model="form.bio" class="textarea" maxlength="120" placeholder="介绍一下你的学习目标" />
      </view>

      <button class="submit" :disabled="saving" @click="save">{{ saving ? '保存中...' : '保存资料' }}</button>
    </view>
  </view>
</template>

<script>
import { authStore } from '../../store/auth';

export default {
  data() {
    return {
      user: null,
      saving: false,
      form: {
        displayName: '',
        avatarText: '',
        bio: ''
      }
    };
  },
  async onShow() {
    const store = authStore();
    store.bootstrap();

    if (!store.isLoggedIn) {
      uni.redirectTo({ url: '/pages/auth/login?redirect=%2Fpages%2Fprofile%2Faccount' });
      return;
    }

    if (!store.profile) {
      await store.fetchProfile();
    }

    this.user = store.user;
    this.form.displayName = store.user?.displayName || '';
    this.form.avatarText = store.user?.avatarText || '';
    this.form.bio = store.user?.bio || '';
  },
  methods: {
    goBack() {
      uni.navigateBack();
    },
    async save() {
      this.saving = true;
      try {
        const store = authStore();
        await store.updateProfile(this.form);
        uni.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => uni.navigateBack(), 300);
      } catch (e) {
        uni.showToast({ title: e.message || '保存失败', icon: 'none' });
      } finally {
        this.saving = false;
      }
    }
  }
};
</script>

<style scoped>
.page-no-tab { min-height: auto; background: #fff; }
.form-card { margin: 16px; padding: 18px; border: 1px solid #f0f0f0; border-radius: 16px; background: #fff; }
.avatar-box { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.avatar { width: 54px; height: 54px; border-radius: 16px; background: #000; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; }
.username { color: #666; font-size: 13px; }
.field { margin-bottom: 14px; }
.label { display: block; margin-bottom: 8px; color: #333; font-size: 13px; font-weight: 600; }
.input { height: 44px; border-radius: 12px; background: #f7f7f7; padding: 0 14px; font-size: 14px; }
.textarea { width: 100%; min-height: 120px; border-radius: 12px; background: #f7f7f7; padding: 12px 14px; font-size: 14px; box-sizing: border-box; }
.submit { margin-top: 8px; height: 46px; line-height: 46px; border: none; border-radius: 12px; background: #000; color: #fff; font-size: 15px; font-weight: 600; }
.submit[disabled] { opacity: 0.65; }
</style>
