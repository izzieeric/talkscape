<template>
  <view class="page">
    <view class="topbar">
      <view class="topbar-main">
        <view>
          <view class="topbar-title-row">
            <text class="topbar-title">单词收藏</text>
            <text class="title-emoji">📖</text>
          </view>
          <text class="topbar-subtitle">把重点单词沉淀成复习库</text>
        </view>
        <view class="topbar-count">{{ bookmarkedWords.length }}</view>
      </view>
    </view>
    
    <view class="overview-grid">
      <view class="overview-card">
        <text class="overview-value">{{ bookmarkedWords.length }}</text>
        <text class="overview-label">总收藏</text>
      </view>
      <view class="overview-divider"></view>
      <view class="overview-card">
        <text class="overview-value">{{ activeWords.length }}</text>
        <text class="overview-label">收藏中</text>
      </view>
      <view class="overview-divider"></view>
      <view class="overview-card">
        <text class="overview-value">{{ practicedWords.length }}</text>
        <text class="overview-label">已练习</text>
      </view>
    </view>

    <view class="content">
      <view v-if="loading" class="state-card">
        <text class="state-title">正在加载收藏单词...</text>
        <text class="state-desc">稍等一下，马上为你同步最新数据</text>
      </view>

      <view v-else-if="hasVisibleWords" class="bookmark-sections">
        <view v-if="filteredPracticed.length" class="list-section">
          <view class="section-head">
            <text class="section-title">已练习</text>
            <text class="section-count">{{ filteredPracticed.length }}</text>
          </view>
          <view class="state-inline">
            <text class="state-inline-text">这些单词暂时不会进入词本闯关，但仍保留在你的收藏里。</text>
          </view>
          <view class="word-list">
            <view v-for="item in filteredPracticed" :key="item.word" class="word-card practiced" @click="openDetail(item)">
              <view class="card-top">
                <view class="word-main">
                  <view class="word-line">
                    <view class="word-line-main">
                      <text class="word-text">{{ item.word }}</text>
                      <text class="word-phonetic inline">{{ item.phonetic || '暂无音标' }}</text>
                    </view>
                  </view>
                </view>
                <view class="corner-btn remove" :class="{ disabled: isPending(item.word, 'remove') }" @click.stop="removeBookmark(item)">
                  {{ isPending(item.word, 'remove') ? '…' : '✕' }}
                </view>
              </view>

              <text class="word-meaning">{{ item.definition }}</text>

              <view class="card-actions practiced-actions">
                <view class="corner-btn reactivate" :class="{ disabled: isPending(item.word, 'reactivate') }" @click.stop="reactivateBookmark(item)">
                  {{ isPending(item.word, 'reactivate') ? '…' : '↩' }}
                </view>
              </view>
            </view>
          </view>
        </view>

        <view v-if="filteredActive.length" class="list-section">
          <view class="section-head">
            <text class="section-title">收藏中</text>
            <text class="section-count">{{ filteredActive.length }}</text>
          </view>
          <view class="word-list">
            <view v-for="item in filteredActive" :key="item.word" class="word-card" :class="{ practiced: item.isPracticed }" @click="openDetail(item)">
              <view class="card-top">
                <view class="word-main">
                  <view class="word-line">
                    <view class="word-line-main">
                      <text class="word-text">{{ item.word }}</text>
                      <text class="word-phonetic inline">{{ item.phonetic || '暂无音标' }}</text>
                    </view>
                  </view>
                </view>
                <view class="corner-btn remove" :class="{ disabled: isPending(item.word, 'remove') }" @click.stop="removeBookmark(item)">
                  {{ isPending(item.word, 'remove') ? '…' : '✕' }}
                </view>
              </view>

              <text class="word-meaning">{{ item.definition }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-else class="state-card empty">
        <text class="state-title">还没有收藏单词</text>
        <text class="state-desc">在场景对话中点击单词并收藏，练习完成的单词也会留在这里</text>
        <view class="state-btn" @click="goPractice">开始练习</view>
      </view>
    </view>

    <view v-if="showDetail && selectedWord" class="overlay" @click="closeDetail">
      <view class="sheet" @click.stop>
        <view class="sheet-handle"><view class="handle-bar"></view></view>
        <scroll-view class="sheet-body" scroll-y>
          <view class="detail-hero">
  <text class="detail-word">{{ selectedWord.word }}</text>
  <text class="detail-phonetic">{{ selectedWord.phonetic || '暂无音标' }}</text>
  <view class="badge-group center-badge">
  <view class="mini-badge" v-if="selectedWord.sourceLabel">{{ selectedWord.sourceLabel }}</view>
  <view class="mini-badge practiced-badge" v-if="selectedWord.isPracticed">已练习</view>
</view>
  <text v-if="selectedWord.isPracticed" class="detail-status">当前在已练习中，暂不参与词本闯关</text>
</view>

          <view class="detail-section">
            <text class="detail-label">中文释义</text>
            <text class="detail-text">{{ selectedWord.definition || '暂无释义' }}</text>
          </view>

          <view v-if="selectedWord.partOfSpeech.length" class="detail-section">
            <text class="detail-label">词性</text>
            <view class="tag-row">
              <text v-for="(tag, index) in selectedWord.partOfSpeech" :key="index" class="tag">{{ tag }}</text>
            </view>
          </view>

          <view v-if="selectedWord.wordRoot" class="detail-section">
            <text class="detail-label">词源</text>
            <text class="detail-subtext">{{ selectedWord.wordRoot }}</text>
          </view>

          <view class="detail-section">
            <text class="detail-label">例句</text>
            <view v-if="selectedWord.examples.length">
              <view v-for="(example, index) in selectedWord.examples" :key="index" class="example-card">
                <text class="example-en">{{ example.english }}</text>
                <text class="example-cn">{{ example.chinese || '暂无中文释义' }}</text>
              </view>
            </view>
            <view v-else class="empty-example">
              <text class="empty-example-text">暂无例句</text>
            </view>
          </view>

          <view v-if="selectedWord.sourceSentence" class="detail-section">
            <text class="detail-label">收藏时上下文</text>
            <text class="detail-subtext">{{ selectedWord.sourceSentence }}</text>
          </view>
        </scroll-view>

        <view class="sheet-footer">
          <view v-if="selectedWord.isPracticed" class="sheet-actions dual">
            <view class="footer-btn secondary" :class="{ disabled: wordVoiceLoading }" @click="playSelectedWordVoice">
              {{ wordVoiceLoading ? '播放中...' : '朗读' }}
            </view>
            <view class="footer-btn secondary" :class="{ disabled: isPending(selectedWord.word, 'remove') }" @click="removeBookmark(selectedWord)">
              {{ isPending(selectedWord.word, 'remove') ? '移除中...' : '取消收藏' }}
            </view>
            <view class="footer-btn" :class="{ disabled: isPending(selectedWord.word, 'reactivate') }" @click="reactivateBookmark(selectedWord)">
              {{ isPending(selectedWord.word, 'reactivate') ? '恢复中...' : '重新加入练习' }}
            </view>
          </view>
          <view v-else class="sheet-actions dual">
            <view class="footer-btn secondary" :class="{ disabled: wordVoiceLoading }" @click="playSelectedWordVoice">
              {{ wordVoiceLoading ? '播放中...' : '朗读' }}
            </view>
            <view class="footer-btn" :class="{ disabled: isPending(selectedWord.word, 'remove') }" @click="removeBookmark(selectedWord)">
              {{ isPending(selectedWord.word, 'remove') ? '移除中...' : '取消收藏' }}
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { authStore } from '../../store/auth';
import { settingsStore } from '../../store/settings';
import { bookmarkApi, voiceApi } from '../../utils/request';
import { getApiBaseUrl } from '../../utils/env';

const BASE_URL = getApiBaseUrl();

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeExamples(value) {
  return parseJsonArray(value)
    .map((item) => ({
      english: normalizeText(item?.english || item?.sentence || item?.en),
      chinese: normalizeText(item?.chinese || item?.translation || item?.cn)
    }))
    .filter((item) => item.english)
    .slice(0, 3);
}

export default {
  data() {
    return {
      loading: false,
      pendingActionKey: '',
      bookmarkedWords: [],
      showDetail: false,
      selectedWord: null,
      wordVoiceLoading: false,
      voiceSpeed: 1.0
    };
  },
  onHide() {
    this.destroyAudio();
  },
  onUnload() {
    this.destroyAudio();
  },
  computed: {
    activeWords() {
      return this.bookmarkedWords.filter((item) => !item.isPracticed);
    },
    practicedWords() {
      return this.bookmarkedWords.filter((item) => item.isPracticed);
    },
    filteredActive() {
      return this.filterWords(this.activeWords);
    },
    filteredPracticed() {
      return this.filterWords(this.practicedWords);
    },
    hasVisibleWords() {
      return this.filteredActive.length > 0 || this.filteredPracticed.length > 0;
    }
  },
  onShow() {
    const store = authStore();
    store.bootstrap();
    if (!store.isLoggedIn) {
      uni.navigateTo({ url: '/pages/auth/login?redirect=%2Fpages%2Findex%2Findex' });
      return;
    }
    this.loadSettings();
    this.loadBookmarks();
  },
  methods: {
    async loadSettings() {
      const sStore = settingsStore();
      await sStore.loadSettings();
      this.voiceSpeed = Number(sStore.voiceSpeed) || 1.0;
    },
    filterWords(list) {
      return list;
    },
    isPending(word, action) {
      return this.pendingActionKey === `${action}:${String(word || '').toLowerCase()}`;
    },
    setPending(word, action) {
      this.pendingActionKey = `${action}:${String(word || '').toLowerCase()}`;
    },
    clearPending() {
      this.pendingActionKey = '';
    },
    mapBookmark(row) {
      const partOfSpeech = parseJsonArray(row.part_of_speech).map((item) => normalizeText(item)).filter(Boolean);
      const examples = normalizeExamples(row.example_sentence);
      const source = normalizeText(row.source_scenario_id);
      const status = normalizeText(row.status, 'active');

      return {
        word: normalizeText(row.word),
        phonetic: normalizeText(row.phonetic),
        definition: normalizeText(row.definition_cn || row.definition || '暂无中文释义'),
        source,
        sourceLabel: source ? source.replace(/-/g, ' ') : '手动收藏',
        sourceSentence: normalizeText(row.source_sentence),
        wordRoot: normalizeText(row.word_root),
        partOfSpeech,
        examples,
        status,
        isPracticed: status === 'practiced',
        practicedAt: normalizeText(row.practiced_at)
      };
    },
    async refreshBookmarks() {
      await this.loadBookmarks();
    },
    async loadBookmarks() {
      this.loading = true;
      try {
        const res = await bookmarkApi.getAll({ includePracticed: 1 });
        this.bookmarkedWords = (res.data || []).map((item) => this.mapBookmark(item));
        if (this.selectedWord && this.showDetail) {
          this.selectedWord = this.bookmarkedWords.find((item) => item.word === this.selectedWord.word) || null;
          this.showDetail = Boolean(this.selectedWord);
        }
      } catch (e) {
        if (e.statusCode !== 401) {
          uni.showToast({ title: e.message || '加载收藏失败', icon: 'none' });
        }
      } finally {
        this.loading = false;
      }
    },
    openDetail(item) {
      this.selectedWord = item;
      this.showDetail = true;
    },
    closeDetail() {
      this.destroyAudio();
      this.showDetail = false;
      this.selectedWord = null;
    },
    destroyAudio() {
      if (!this._audioCtx) return;
      const ctx = this._audioCtx;
      ctx.__destroyedByApp = true;
      this._audioCtx = null;
      ctx.stop();
      ctx.src = '';
      ctx.destroy();
    },
    startAudioPlayback(url) {
      if (!url) {
        uni.showToast({ title: '暂无语音', icon: 'none' });
        return;
      }
      this.destroyAudio();
      const ctx = uni.createInnerAudioContext();
      ctx.__destroyedByApp = false;
      this._audioCtx = ctx;
      ctx.src = url.startsWith('http') ? url : BASE_URL + url;
      ctx.play();
      ctx.onEnded(() => {
        if (this._audioCtx !== ctx || ctx.__destroyedByApp) return;
        ctx.__destroyedByApp = true;
        ctx.destroy();
        this._audioCtx = null;
      });
      ctx.onError(() => {
        if (this._audioCtx !== ctx || ctx.__destroyedByApp) return;
        ctx.__destroyedByApp = true;
        ctx.destroy();
        this._audioCtx = null;
        uni.showToast({ title: '语音播放失败', icon: 'none' });
      });
    },
    async playSelectedWordVoice() {
      const targetWord = normalizeText(this.selectedWord?.word);
      if (!targetWord || this.wordVoiceLoading) return;

      this.wordVoiceLoading = true;
      try {
        const res = await voiceApi.tts(targetWord, {
          speed: this.voiceSpeed
        });
        const voicePath = res?.data?.url || '';
        if (!voicePath) {
          uni.showToast({ title: '语音获取失败', icon: 'none' });
          return;
        }
        this.startAudioPlayback(voicePath);
      } catch (e) {
        uni.showToast({ title: e?.message || '语音获取失败', icon: 'none' });
      } finally {
        this.wordVoiceLoading = false;
      }
    },
    async reactivateBookmark(item) {
      if (!item?.word || this.pendingActionKey) return;
      this.setPending(item.word, 'reactivate');
      try {
        await bookmarkApi.reactivate(item.word);
        await this.refreshBookmarks();
        uni.showToast({ title: '已重新加入练习', icon: 'success' });
      } catch (e) {
        uni.showToast({ title: e.message || '重新加入练习失败', icon: 'none' });
      } finally {
        this.clearPending();
      }
    },
    async removeBookmark(item) {
      if (!item?.word || this.pendingActionKey) return;

      this.setPending(item.word, 'remove');
      try {
        await bookmarkApi.remove(item.word);
        await this.refreshBookmarks();
        uni.showToast({ title: '已取消收藏', icon: 'none' });
      } catch (e) {
        uni.showToast({ title: e.message || '取消收藏失败', icon: 'none' });
      } finally {
        if (this.selectedWord?.word === item.word && !this.bookmarkedWords.find((entry) => entry.word === item.word)) {
          this.closeDetail();
          this.selectedWord = null;
        }
        this.clearPending();
      }
    },
    goPractice() {
      uni.switchTab({ url: '/pages/scenes/index' });
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
.topbar { background: #000; padding: 56px 24px 28px; }
.topbar-main { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.topbar-title-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.topbar-title { font-size: 36px; font-weight: 700; color: #fff; letter-spacing: -1px; line-height: 1; }
.title-emoji { font-size: 26px; transform: translateY(-2px); }
.topbar-subtitle { display: block; font-size: 13px; color: rgba(255,255,255,0.5); }
.topbar-count { display: none; }

.overview-grid { display: flex; align-items: center; background: #fff; margin: -14px 16px 20px; padding: 14px 12px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border: 1px solid #f0f0f0; position: relative; z-index: 2; }
.overview-card { flex: 1; text-align: center; }
.overview-value { display: block; font-size: 18px; font-weight: 700; color: #000; }
.overview-label { display: block; font-size: 11px; color: #999; margin-top: 1px; }
.overview-divider { width: 1px; height: 28px; background: #eee; }

.content {
  padding: 0 16px;
  box-sizing: border-box;
}
.bookmark-sections { display: flex; flex-direction: column; gap: 14px; }
.list-section { display: flex; flex-direction: column; gap: 10px; }
.section-head { display: flex; align-items: center; justify-content: space-between; padding: 0 4px; margin-bottom: 2px; }
.section-title { font-size: 16px; font-weight: 700; color: #101828; }
.section-count { min-width: 24px; height: 24px; padding: 0 8px; border-radius: 999px; background: #f1f5f9; color: #64748b; font-size: 11px; display: flex; align-items: center; justify-content: center; font-weight: 600; }
.state-inline { padding: 10px 12px; border-radius: 12px; background: #f8fafc; border: 1px solid #f1f5f9; }
.state-inline-text { display: block; font-size: 11px; line-height: 1.6; color: #64748b; }
.word-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; overflow: visible; }
.word-card { position: relative; min-width: 0; background: #fff; border-radius: 16px; padding: 14px 14px; border: 1px solid #f0f0f0; box-shadow: 0 2px 8px rgba(0,0,0,0.02); box-sizing: border-box; overflow: visible; transition: all 0.15s ease; }
.word-card:active { background: #fcfcfc; border-color: #e5e5e5; }
.word-card.practiced { border: 1px solid #e0e7ff; background: #fcfdff; }
.card-top { display: block; }
.word-main { flex: 1; min-width: 0; }
.word-line { display: flex; align-items: flex-start; gap: 6px; min-width: 0; }
.word-line-main { display: flex; align-items: baseline; gap: 5px; flex-wrap: wrap; min-width: 0; flex: 1; }
.word-text { display: block; font-size: 17px; line-height: 1.2; font-weight: 700; color: #000; word-break: break-word; letter-spacing: -0.3px; }
.word-phonetic { display: block; margin-top: 4px; font-size: 11px; color: #999; }
.word-phonetic.inline { margin-top: 1px; }
.badge-group { display: flex; flex-wrap: wrap; justify-content: flex-start; gap: 5px; max-width: 100%; }
.badge-group.inline { display: inline-flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; margin-left: auto; max-width: 52%; }
.badge-group.center-badge { justify-content: center; margin-top: 10px; }
.mini-badge { padding: 3px 7px; border-radius: 999px; background: #eef2f6; color: #475467; font-size: 9px; line-height: 1.2; }
.mini-badge.dark { background: #111827; color: #fff; }
.mini-badge.practiced-badge { background: #111827; color: #fff; }
.word-meaning { display: block; margin-top: 10px; min-height: 36px; font-size: 13px; line-height: 1.5; color: #475467; }
.card-actions { display: block; margin-top: 0; height: 0; }
.practiced-actions { height: 0; }
.corner-btn { position: absolute; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-weight: 700; box-sizing: border-box; z-index: 2; }
.corner-btn.remove { top: -6px; right: -6px; width: 24px; height: 24px; border-radius: 50%; background: #f3f4f6; color: #94a3b8; font-size: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
.corner-btn.reactivate { right: -6px; bottom: -6px; width: 28px; height: 28px; border-radius: 50%; background: #111827; color: #fff; font-size: 12px; box-shadow: 0 4px 10px rgba(17,24,39,0.12); }
.corner-btn.disabled { opacity: 0.45; pointer-events: none; }
.state-card { margin-top: 10px; background: #fff; border-radius: 18px; padding: 32px 20px; text-align: center; border: 1px solid #f0f0f0; }
.state-card.empty { margin-top: 26px; }
.state-title { display: block; font-size: 18px; font-weight: 700; color: #111; }
.state-desc { display: block; margin-top: 8px; font-size: 13px; line-height: 1.7; color: #7b8491; }
.state-btn { margin: 18px auto 0; width: 124px; height: 44px; border-radius: 999px; background: #111; color: #fff; font-weight: 600; font-size: 13px; display: flex; align-items: center; justify-content: center; }
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.36); display: flex; align-items: flex-end; z-index: 1000; }
.sheet { width: 100%; height: 74vh; background: #fff; border-radius: 22px 22px 0 0; display: flex; flex-direction: column; overflow: hidden; }
.sheet-handle { display: flex; justify-content: center; padding: 12px 0 4px; }
.handle-bar { width: 34px; height: 4px; border-radius: 999px; background: #d7dbe2; }
.sheet-body { flex: 1; min-height: 0; padding: 0 20px 16px; box-sizing: border-box; }
.detail-hero { text-align: center; padding: 12px 0 20px; }
.detail-word { display: block; font-size: 32px; font-weight: 800; color: #111; letter-spacing: -0.5px; }
.detail-phonetic { display: block; margin-top: 4px; font-size: 14px; color: #8a8a8a; }
.detail-source { display: none; }
.detail-status { display: block; margin-top: 14px; font-size: 12px; line-height: 1.6; color: #475467; background: #f8fafc; padding: 8px; border-radius: 8px; }
.detail-section { margin-bottom: 20px; }
.detail-label { display: block; margin-bottom: 8px; font-size: 12px; font-weight: 700; color: #111827; }
.detail-text { display: block; font-size: 15px; line-height: 1.7; color: #111; }
.detail-subtext { display: block; font-size: 14px; line-height: 1.7; color: #4e5662; }
.tag-row { display: flex; flex-wrap: wrap; gap: 8px; }
.tag { padding: 6px 10px; border-radius: 999px; background: #111827; color: #fff; font-size: 11px; }
.example-card { padding: 12px; border-radius: 12px; background: #f8fafc; margin-bottom: 8px; border: 1px solid #f1f5f9; }
.example-en { display: block; font-size: 14px; line-height: 1.7; color: #111; }
.example-cn { display: block; margin-top: 4px; font-size: 12px; line-height: 1.6; color: #6c7480; }
.empty-example { padding: 14px; border-radius: 12px; background: #f7f8fb; }
.empty-example-text { display: block; text-align: center; font-size: 12px; color: #98a0ad; }
.sheet-footer { padding: 12px 20px calc(12px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid #edf0f4; background: #fff; }
.sheet-actions { display: flex; gap: 12px; }
.sheet-actions .footer-btn { flex: 1; }
.footer-btn { height: 46px; border-radius: 14px; background: #111; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; }
.footer-btn.secondary { background: #eef2f6; color: #344054; }
.footer-btn.disabled { opacity: 0.45; pointer-events: none; }
</style>
