<template>
  <view class="page">
    <view class="hero">
      <text class="title">TalkScape</text>
      <text class="subtitle">登录后同步你的练习记录、收藏和个性设置</text>
    </view>

    <view class="card">
      <view class="tabs">
        <view class="tab" :class="{ active: mode === 'login' }" @click="mode = 'login'">登录</view>
        <view class="tab" :class="{ active: mode === 'register' }" @click="mode = 'register'">注册</view>
      </view>

      <view class="form">
        <input v-if="mode === 'register'" v-model="displayName" class="input" placeholder="昵称" />
        <input v-model="username" class="input" placeholder="用户名（4-20位字母/数字/下划线）" />
        <input v-model="password" password class="input" placeholder="密码（至少6位）" />
        <button class="submit" :disabled="submitting" @click="submit">{{ submitting ? '提交中...' : (mode === 'login' ? '登录' : '注册') }}</button>
      </view>

      <text class="hint">后续可平滑扩展邮箱、手机号验证码和第三方登录。</text>
    </view>
  </view>
</template>

<script>
import { authStore } from '../../store/auth';

export default {
  data() {
    return {
      mode: 'login',
      username: '',
      password: '',
      displayName: '',
      submitting: false,
      redirect: '/pages/index/index'
    };
  },
  onLoad(options) {
    if (options.mode === 'register') this.mode = 'register';
    if (options.redirect) this.redirect = decodeURIComponent(options.redirect);
  },
  methods: {
    async submit() {
      if (!this.username.trim() || !this.password.trim()) {
        uni.showToast({ title: '请填写用户名和密码', icon: 'none' });
        return;
      }

      this.submitting = true;
      const store = authStore();
      store.bootstrap();

      try {
        if (this.mode === 'login') {
          await store.login({
            username: this.username,
            password: this.password
          });
        } else {
          await store.register({
            username: this.username,
            password: this.password,
            displayName: this.displayName
          });
        }

        uni.showToast({ title: this.mode === 'login' ? '登录成功' : '注册成功', icon: 'success' });
        setTimeout(() => {
          uni.reLaunch({ url: this.redirect || '/pages/index/index' });
        }, 300);
      } catch (e) {
        uni.showToast({ title: e.message || '操作失败', icon: 'none' });
      } finally {
        this.submitting = false;
      }
    }
  }
};
</script>

<style scoped>
.page { min-height: auto; background: #fff; padding: calc(72px + env(safe-area-inset-top)) 20px 24px; }
.hero { margin-bottom: 24px; }
.title { display: block; font-size: 32px; font-weight: 700; color: #000; }
.subtitle { display: block; font-size: 14px; color: #666; margin-top: 8px; line-height: 1.6; }
.card { border: 1px solid #f0f0f0; border-radius: 18px; padding: 20px; background: #fff; }
.tabs { display: flex; gap: 8px; margin-bottom: 20px; }
.tab { flex: 1; text-align: center; padding: 10px 0; border-radius: 10px; background: #f5f5f5; color: #666; font-size: 14px; font-weight: 600; }
.tab.active { background: #000; color: #fff; }
.form { display: flex; flex-direction: column; gap: 12px; }
.input { height: 46px; border-radius: 12px; background: #f7f7f7; padding: 0 14px; font-size: 14px; color: #000; }
.submit { margin-top: 4px; height: 46px; line-height: 46px; border: none; border-radius: 12px; background: #000; color: #fff; font-size: 15px; font-weight: 600; }
.submit[disabled] { opacity: 0.65; }
.hint { display: block; margin-top: 16px; color: #999; font-size: 12px; line-height: 1.6; }
</style>
