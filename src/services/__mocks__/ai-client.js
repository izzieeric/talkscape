/**
 * AI 客户端 Mock — 所有 AI 调用返回固定数据，避免真实 API 调用
 */
const mockWordExplanations = {
  reservation: {
    term: 'reservation',
    language: 'en',
    nativeLanguage: 'zh-CN',
    phonetic: '/ˌrezərˈveɪʃn/',
    partOfSpeech: ['noun'],
    definitionCn: 'n. 预订；预约',
    definitionEn: 'an arrangement to have something reserved',
    exampleSentences: [
      { english: 'Do you have a reservation?', chinese: '请问您有预约吗？' }
    ],
    usageNotes: ['常用于餐厅、酒店、门票等预约场景。'],
    synonyms: ['booking'],
    wordRoot: 'from Latin "reservare" — to keep back'
  },
  menu: {
    term: 'menu',
    language: 'en',
    nativeLanguage: 'zh-CN',
    phonetic: '/ˈmenjuː/',
    partOfSpeech: ['noun'],
    definitionCn: '菜单；菜谱',
    definitionEn: 'a list of food and drinks available',
    exampleSentences: [
      { english: 'Can I see the menu?', chinese: '我可以看看菜单吗？' }
    ],
    usageNotes: ['在餐厅点餐时非常常用。'],
    synonyms: ['bill of fare'],
    wordRoot: ''
  },
  default: {
    term: 'default',
    language: 'en',
    nativeLanguage: 'zh-CN',
    phonetic: '/.../',
    partOfSpeech: ['unknown'],
    definitionCn: '测试释义',
    definitionEn: 'test definition',
    exampleSentences: [],
    usageNotes: [],
    synonyms: [],
    wordRoot: ''
  }
};

class MockAIClient {
  async chat(messages, options = {}) {
    const lastMsg = messages[messages.length - 1]?.content || '';
    return {
      content: JSON.stringify({
        english: 'This is a mock AI response for testing purposes.',
        chinese: '这是用于测试的模拟 AI 回复。',
        userHintIdea: '可以先表达你的需求或说明你的情况。',
        userHintIdeaCn: '可以先表达你的需求或说明你的情况。',
        userHintExample: 'I would like to book a table for two.',
        userHintExampleCn: '我想订一张两人桌。'
      })
    };
  }

  async textToSpeech(text, options = {}) {
    const filePath = options.outputPath || path.join(VOICE_DIR, 'mock-test.mp3');
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, Buffer.from('mock-mp3-data'));
    }
    return options.outputUrl || '/data/system/test/mock-test.mp3';
  }

  async speechToText(audioPath, language) {
    return 'this is a mock transcription';
  }

  async generateWordExplanation(word, context, options = {}) {
    const base = mockWordExplanations[word.toLowerCase()] || mockWordExplanations.default;
    if (options.learningLanguage === 'ja') {
      return {
        ...base,
        term: word,
        language: 'ja',
        nativeLanguage: options.nativeLanguage || 'zh-CN',
        definitionCn: `日语词条解释：${word}`,
        definitionEn: '',
        exampleSentences: [
          { english: `${word} の例文です。`, chinese: `${word} 的日语例句。` }
        ],
        usageNotes: [`这是 ${word} 的日语词卡示例。`]
      };
    }
    return {
      ...base,
      term: word,
      language: options.learningLanguage || base.language,
      nativeLanguage: options.nativeLanguage || base.nativeLanguage
    };
  }
}

// 替换真实客户端
const path = require('path');
const fs = require('fs');
const VOICE_DIR = path.join(__dirname, '../../../data/static/system/test');
if (!fs.existsSync(VOICE_DIR)) fs.mkdirSync(VOICE_DIR, { recursive: true });

const mockInstance = new MockAIClient();

// Mock audio.speech.create response
mockInstance.client = {
  audio: {
    speech: {
      create: async () => ({
        arrayBuffer: async () => Buffer.from('mock-mp3-data').buffer
      })
    }
  }
};

module.exports = {
  getClient: () => mockInstance,
  resetClient: () => {},
  chat: (...args) => mockInstance.chat(...args),
  textToSpeech: (...args) => mockInstance.textToSpeech(...args),
  speechToText: (...args) => mockInstance.speechToText(...args),
  generateWordExplanation: (...args) => mockInstance.generateWordExplanation(...args),
  AIClient: MockAIClient
};
