function parseAiResponse(content) {
  try {
    const parsed = JSON.parse(content);
    const userHintExample = parsed.userHintExample || parsed.userHint || null;
    const userHintExampleCn = parsed.userHintExampleCn || parsed.userHintCn || null;
    return {
      english: parsed.english || '',
      chinese: parsed.chinese || '',
      userHint: userHintExample,
      userHintCn: userHintExampleCn,
      userHintIdea: parsed.userHintIdea || parsed.userHintIdeaCn || null,
      userHintIdeaCn: parsed.userHintIdeaCn || parsed.userHintIdea || null,
      userHintExample,
      userHintExampleCn
    };
  } catch (error) {
    // 如果不是 JSON 格式，尝试文本解析
    return {
      english: content,
      chinese: '',
      userHint: null,
      userHintCn: null,
      userHintIdea: null,
      userHintIdeaCn: null,
      userHintExample: null,
      userHintExampleCn: null
    };
  }
}

function extractWords(text) {
  // 提取英文单词
  const words = text.match(/[a-zA-Z]+/g) || [];
  return [...new Set(words.map(w => w.toLowerCase()))];
}

function cleanText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

module.exports = {
  parseAiResponse,
  extractWords,
  cleanText
};
