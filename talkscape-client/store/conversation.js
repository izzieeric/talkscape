import { defineStore } from 'pinia';

export const conversationStore = defineStore('conversation', {
  state: () => ({
    sessionId: null,
    messages: [],
    currentTurn: 0,
    isAiThinking: false,
    isUserTurn: true,
    userHint: null,
    userHintCn: null,
    isCompleted: false,
    scenarioId: null
  }),

  actions: {
    async createSession(scenarioId) {
      // TODO: 调用 API 创建会话
      // const res = await uni.request({
      //   url: '/api/conversations/sessions',
      //   method: 'POST',
      //   data: { scenarioId }
      // });
      // this.sessionId = res.data.id;
      // this.scenarioId = scenarioId;
    },

    async sendMessage(text) {
      if (!this.sessionId) return;

      this.isAiThinking = true;

      try {
        // 添加用户消息
        this.messages.push({
          role: 'user',
          english: text,
          chinese: '',
          voiceUrl: null
        });

        // TODO: 调用 API 发送消息并获取 AI 回复
        // const res = await uni.request({
        //   url: `/api/conversations/sessions/${this.sessionId}/messages`,
        //   method: 'POST',
        //   data: { role: 'user', english: text }
        // });

        // const aiResponse = res.data;
        // this.messages.push({
        //   role: 'ai',
        //   english: aiResponse.english,
        //   chinese: aiResponse.chinese,
        //   voiceUrl: aiResponse.voiceUrl
        // });

        // this.userHint = aiResponse.userHint;
        // this.userHintCn = aiResponse.userHintCn;
      } finally {
        this.isAiThinking = false;
      }
    },

    async loadMessages() {
      if (!this.sessionId) return;

      // TODO: 调用 API 获取消息历史
      // const res = await uni.request({
      //   url: `/api/conversations/sessions/${this.sessionId}/messages`
      // });
      // this.messages = res.data;
    },

    reset() {
      this.sessionId = null;
      this.messages = [];
      this.currentTurn = 0;
      this.isAiThinking = false;
      this.isUserTurn = true;
      this.userHint = null;
      this.userHintCn = null;
      this.isCompleted = false;
      this.scenarioId = null;
    }
  }
});

export const conversationState = conversationStore.state;
