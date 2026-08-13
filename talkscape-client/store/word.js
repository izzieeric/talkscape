import { defineStore } from 'pinia';

export const wordStore = defineStore('word', {
  state: () => ({
    currentWord: null,
    currentContext: '',
    wordPopupVisible: false,
    bookmarkedWords: [],
    wordHistory: []
  }),

  actions: {
    showWordPopup(word, context = '') {
      this.currentWord = word;
      this.currentContext = context;
      this.wordPopupVisible = true;

      // 记录点击历史
      this.logWordClick(word, context);
    },

    hideWordPopup() {
      this.wordPopupVisible = false;
    },

    async logWordClick(word, context) {
      // TODO: 调用 API 记录点击
      // await uni.request({
      //   url: '/api/words/click',
      //   method: 'POST',
      //   data: { word, context }
      // });
    },

    async fetchBookmarks() {
      // TODO: 调用 API 获取收藏列表
      // const res = await uni.request({ url: '/api/bookmarks' });
      // this.bookmarkedWords = res.data;
    },

    async addBookmark(wordData) {
      // TODO: 调用 API 添加收藏
      // await uni.request({
      //   url: '/api/bookmarks',
      //   method: 'POST',
      //   data: wordData
      // });
      // await this.fetchBookmarks();
    },

    async removeBookmark(word) {
      // TODO: 调用 API 删除收藏
      // await uni.request({
      //   url: `/api/bookmarks/${word}`,
      //   method: 'DELETE'
      // });
      // await this.fetchBookmarks();
    }
  }
});

export const wordState = wordStore.state;
