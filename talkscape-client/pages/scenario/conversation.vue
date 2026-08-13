<template>
  <view class="conversation-page">
    <!-- Fixed top bar -->
    <view class="conversation-top">
      <view class="conv-nav">
        <view class="nav-inner">
          <view class="nav-back" @click="goBack"><text>←</text></view>
          <view class="nav-center">
            <text class="nav-title">{{ currentScenario.title }}</text>
            <text class="nav-subtitle">{{ currentScenarioSubtitle }}</text>
          </view>
          <view class="nav-back" @click="showMenu"><text>⋯</text></view>
        </view>
      </view>
    </view>

    <!-- Chat -->
    <scroll-view class="chat-area" scroll-y scroll-with-animation :scroll-into-view="scrollToId" @scroll="handleChatScroll">
      <view class="chat-inner">
        <view v-if="isWordbookScenario() && wordbookLoading" class="wordbook-banner">
          <text class="wordbook-banner-text">{{ t('conversation.wordbookPreparing') }}</text>
        </view>
        <view v-else-if="isWordbookScenario() && !wordbookTargets.length" class="wordbook-panel">
          <view class="wordbook-head">
            <view>
              <text class="wordbook-title">{{ t('conversation.wordbookTitle') }}</text>
              <text class="wordbook-subtitle">{{ t('conversation.wordbookSubtitle') }}</text>
            </view>
          </view>
          <view class="wordbook-empty">
            <text class="wordbook-empty-text">{{ t('conversation.wordbookEmpty') }}</text>
          </view>
        </view>

        <view v-if="sessionInitError && !messages.length" class="conversation-error-card">
          <text class="conversation-error-title">{{ t('conversation.sessionLoadFailed') }}</text>
          <text class="conversation-error-text">{{ sessionInitErrorMessage || t('common.retryLater') }}</text>
          <view class="conversation-error-btn" @click="retryConversationInit">{{ t('conversation.sessionLoadRetry') }}</view>
        </view>

        <view v-if="replyErrorMessage" class="conversation-error-inline">
          <view class="conversation-error-copy">
            <text class="conversation-error-title small">{{ t('conversation.replyFailed') }}</text>
            <text class="conversation-error-text small">{{ replyErrorMessage }}</text>
            <text v-if="pendingReplyText" class="conversation-error-sub">{{ t('conversation.replyPendingSaved') }}</text>
          </view>
          <view v-if="pendingReplyText && !isAiThinking" class="conversation-error-btn inline" @click="retryPendingReply">
            {{ t('conversation.replyRetry') }}
          </view>
        </view>

        <!-- Message Bubble (inline) -->
        <view v-for="(msg, i) in messages" :key="msg.id || i" :id="'msg-'+i"
          class="msg" :class="'msg-' + msg.role">
          <view v-if="msg.role === 'ai'" class="msg-label scenario-icon">{{ currentScenario.icon || '🤖' }}</view>
          <view class="msg-body">
            <view
              v-if="msg.role === 'user' && msg.isVoice"
              class="voice-msg-card"
              @click="playUserVoice(msg)"
            >
              <view class="voice-msg-main">
                <view class="voice-msg-wave" :class="{ active: activeVoiceMessageId === msg.playbackKey }">
                  <view class="voice-bar"></view>
                  <view class="voice-bar"></view>
                  <view class="voice-bar"></view>
                  <view class="voice-bar"></view>
                  <view class="voice-bar"></view>
                </view>
                <text class="voice-msg-duration">{{ formatDuration(msg.voiceDuration || 0) }}</text>
              </view>
              <text v-if="msg.english" class="voice-msg-transcript">{{ msg.english }}</text>
            </view>
            <view v-else class="msg-bubble" v-show="!(msg.role === 'ai' && voiceOnly)">
              <view class="msg-english">
                <text v-for="(word, wi) in splitWords(msg.english)" :key="wi"
                  class="msg-word" @click="onWordClick(extractCleanWord(word), msg.english)">
                  {{ word + ' ' }}
                </text>
              </view>
              <text v-if="showTranslation" class="msg-chinese">{{ msg.chinese }}</text>
            </view>
            <view v-if="showMessageActions(msg)" class="msg-actions">
              <view class="msg-action-group">
                <view class="msg-action-btn play" :class="{ loading: msg.voiceLoading, disabled: msg.voiceLoading }" @click="playVoice(msg)">
                  <text class="icon">{{ msg.voiceLoading ? '⋯' : '🔊' }}</text>
                  <text class="label">{{ msg.voiceLoading ? t('common.playing') : t('common.play') }}</text>
                </view>
                <view v-if="smartExplainEnabled && msg.role === 'ai'" class="msg-action-btn explain" :class="{ loading: msg.explanationLoading }" @click="openAiExplanation(msg)">
                  <text class="icon">{{ msg.explanationLoading ? '⋯' : '✨' }}</text>
                  <text class="label">智能讲解</text>
                </view>
                <view
                  v-if="showRollbackAction(msg, i)"
                  class="msg-action-btn rollback"
                  :class="{ disabled: rollbackLoading }"
                  @click="promptRollbackToMessage(msg, i)"
                >
                  <text class="icon">{{ rollbackLoading ? '⋯' : '↶' }}</text>
                  <text class="label">{{ rollbackLoading ? t('conversation.rollingBack') : t('conversation.rollback') }}</text>
                </view>
              </view>
            </view>
            <view v-if="smartExplainEnabled && msg.role === 'user' && msg.feedback && msg.feedback.hasIssues" class="msg-feedback-card" @click="openUserFeedback(msg)">
              <text class="msg-feedback-title">{{ msg.feedback.summaryCn || t('conversation.feedbackDefault') }}</text>
              <text v-if="msg.feedback.issues?.[0]?.suggestion" class="msg-feedback-sub">{{ msg.feedback.issues[0].suggestion }}</text>
            </view>
          </view>
          <view v-if="msg.role === 'user'" class="msg-label user-label">我</view>
        </view>

        <!-- Loading AI (inline) -->
        <view v-if="isAiThinking" class="loading-ai">
          <view class="ldot">{{ currentScenario.icon || '🤖' }}</view>
          <view class="lbubble">
            <view class="ldots">
              <view class="ldot-anim"></view>
              <view class="ldot-anim"></view>
              <view class="ldot-anim"></view>
            </view>
          </view>
        </view>

        <!-- User Hint (inline) -->
        <view v-if="(userHintIdea || userHintExample) && !isAiThinking && showHints" class="hint-card">
          <view v-if="userHintIdea" class="hint-section">
            <view class="hint-row">
              <view class="hint-dot"></view>
              <text class="hint-label">{{ t('conversation.hintIdea') }}</text>
            </view>
            <text class="hint-idea">{{ userHintIdeaCn || userHintIdea }}</text>
          </view>
          <view v-if="showHintExamples && userHintExample" class="hint-section example">
            <view class="hint-row">
              <view class="hint-dot"></view>
              <text class="hint-label">{{ t('conversation.hintExample') }}</text>
            </view>
            <view class="hint-en">
              <text>"</text>
              <text v-for="(word, index) in splitWords(userHintExample)" :key="index" class="hint-word" @click="onWordClick(extractCleanWord(word), userHintExample)">
                {{ word + ' ' }}
              </text>
              <text>"</text>
            </view>
            <text class="hint-cn">{{ userHintExampleCn }}</text>
            <view class="hint-actions">
              <view class="hint-btn icon-only" :class="{ disabled: hintVoiceLoading }" @click="playDemoVoice(userHintExample)">
                <text class="icon">{{ hintVoiceLoading ? '⋯' : '🔊' }}</text>
              </view>
              <view class="hint-btn icon-only" @click="copyHint">
                <text class="icon">📋</text>
              </view>
              <view class="hint-btn icon-only" :class="{ disabled: hintRefreshLoading }" @click="refreshHintExample">
                <text class="icon">{{ hintRefreshLoading ? '⋯' : '↻' }}</text>
              </view>
              <view class="hint-btn icon-only" @click="openHintComposer">
                <text class="icon">💡</text>
              </view>
            </view>
          </view>
        </view>

        <view id="chat-bottom" style="height:1px;"></view>
      </view>
    </scroll-view>

    <!-- Toolbar -->
    <view class="toolbar-wrapper">
      <view class="toolbar">
        <view class="toolbar-item" @click="toggleQuickSetting('showTranslation')" :class="{ active: showTranslation }">
          <view class="toolbar-icon">译</view>
          <text class="toolbar-label">{{ t('conversation.translation') }}</text>
        </view>
        <view class="toolbar-item" @click="toggleQuickSetting('showHints')" :class="{ active: showHints }">
          <view class="toolbar-icon">💡</view>
          <text class="toolbar-label">{{ t('conversation.hints') }}</text>
        </view>
        <view class="toolbar-item" @click="toggleQuickSetting('smartExplainEnabled')" :class="{ active: smartExplainEnabled }">
          <view class="toolbar-icon">✨</view>
          <text class="toolbar-label">智能讲解</text>
        </view>
        <view class="toolbar-item" @click="toggleQuickSetting('voiceOnly')" :class="{ active: voiceOnly }">
          <view class="toolbar-icon">🎧</view>
          <text class="toolbar-label">{{ t('conversation.voiceOnly') }}</text>
        </view>
      </view>
    </view>

    <!-- Input -->
    <view class="input-bar">
      <!-- 模式切换按钮 -->
      <view class="mode-toggle" @click="toggleInputMode">
        <text class="icon">{{ inputMode === 'voice' ? '⌨️' : '🎙️' }}</text>
      </view>

      <!-- 语音模式 -->
      <view v-if="inputMode === 'voice'" class="voice-btn-wrapper">
        <view class="voice-cta-btn" :class="{ recording, busy: transcribingVoice || isAiThinking }" @tap="toggleVoiceRecording">
          <text class="voice-cta-text">{{ voiceButtonTitle || t('common.startRecording') }}</text>
        </view>
      </view>

      <!-- 文本模式 -->
      <view v-else class="text-entry">
        <view class="input-wrap">
          <input class="input-field" v-model="inputText" :placeholder="inputPlaceholder" :disabled="isInputDisabled" @confirm="sendMessage" />
        </view>
        <view class="send-btn" :class="{ active: inputText.trim() && !isInputDisabled }" @click="sendMessage">
          <text>→</text>
        </view>
      </view>
    </view>

    <view v-if="showConversationMenu" class="menu-sheet-overlay" @click="closeConversationMenu">
      <view class="menu-sheet" @click.stop>
        <view class="menu-sheet-handle"></view>
        <view class="menu-sheet-head">
          <text class="menu-sheet-title">{{ t('conversation.sceneActions') }}</text>
          <text class="menu-sheet-subtitle">{{ t('conversation.sceneActionsDesc') }}</text>
        </view>
        <view class="menu-sheet-list">
          <view class="menu-sheet-item" @click="handleConversationMenu('restart')">
            <view class="menu-sheet-item-main">
              <text class="menu-sheet-item-title">{{ t('conversation.restart') }}</text>
              <text class="menu-sheet-item-desc">{{ t('conversation.restartDesc') }}</text>
            </view>
            <text class="menu-sheet-item-arrow">↻</text>
          </view>
          <view class="menu-sheet-item" @click="handleConversationMenu('settings')">
            <view class="menu-sheet-item-main">
              <text class="menu-sheet-item-title">{{ t('conversation.talkSettings') }}</text>
              <text class="menu-sheet-item-desc">{{ t('conversation.talkSettingsDesc') }}</text>
            </view>
            <text class="menu-sheet-item-arrow">⚙</text>
          </view>
        </view>
        <view class="menu-sheet-cancel" @click="closeConversationMenu">
          <text class="menu-sheet-cancel-text">{{ t('common.cancel') }}</text>
        </view>
      </view>
    </view>

    <view v-if="restartDialogVisible" class="custom-dialog-overlay" @click="closeRestartDialog">
      <view class="custom-dialog" @click.stop>
        <view class="custom-dialog-head">
          <text class="custom-dialog-title">{{ t('conversation.restartDialogTitle') }}</text>
        </view>
        <view class="custom-dialog-body">
          <text class="custom-dialog-message">{{ t('conversation.restartDialogMessage') }}</text>
        </view>
        <view class="custom-dialog-actions">
          <view class="custom-dialog-btn cancel" @click="closeRestartDialog">
            <text>{{ t('conversation.restartDialogCancel') }}</text>
          </view>
          <view class="custom-dialog-btn confirm" @click="confirmRestart">
            <text>{{ t('conversation.restartDialogConfirm') }}</text>
          </view>
        </view>
      </view>
    </view>

    <view v-if="rollbackDialogVisible" class="custom-dialog-overlay" @click="closeRollbackDialog">
      <view class="custom-dialog" @click.stop>
        <view class="custom-dialog-head">
          <text class="custom-dialog-title">{{ t('conversation.rollbackDialogTitle') }}</text>
        </view>
        <view class="custom-dialog-body">
          <text class="custom-dialog-message">{{ t('conversation.rollbackDialogMessage') }}</text>
          <view v-if="rollbackTargetMessageText" class="rollback-preview">
            <text class="rollback-preview-label">{{ t('conversation.rollbackDialogTarget') }}</text>
            <text class="rollback-preview-text">{{ rollbackTargetMessageText }}</text>
          </view>
        </view>
        <view class="custom-dialog-actions">
          <view class="custom-dialog-btn cancel" @click="closeRollbackDialog">
            <text>{{ t('conversation.rollbackDialogCancel') }}</text>
          </view>
          <view class="custom-dialog-btn confirm" :class="{ disabled: rollbackLoading }" @click="confirmRollback">
            <text>{{ rollbackLoading ? t('conversation.rollingBack') : t('conversation.rollbackDialogConfirm') }}</text>
          </view>
        </view>
      </view>
    </view>

    <view v-if="completionDialogVisible" class="custom-dialog-overlay" @click="closeCompletionDialog">
      <view class="custom-dialog" @click.stop>
        <view class="custom-dialog-head">
          <text class="custom-dialog-title">{{ completionDialogTitle }}</text>
        </view>
        <view class="custom-dialog-body">
          <text class="custom-dialog-message">{{ completionDialogMessage }}</text>
        </view>
        <view class="custom-dialog-actions">
          <view class="custom-dialog-btn primary" @click="closeCompletionDialog">
            <text>知道了</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 录音提示浮层 -->
    <view v-if="recording" class="record-overlay">
      <view class="record-box">
        <view class="record-ripple">
          <view class="ripple-circle"></view>
          <view class="ripple-circle delay"></view>
          <view class="record-cancel-btn" @tap="cancelRec">
            <text class="record-icon">✕</text>
          </view>
        </view>
        <text class="record-timer">{{ formatDuration(recordDuration) }}</text>
        <text class="record-hint-text">点击底部按钮发送，点击叉号取消</text>
      </view>
    </view>

    <view v-if="showHintComposer" class="hint-compose-overlay" @click="closeHintComposer">
      <view class="hint-compose-sheet" @click.stop>
        <text class="hint-compose-title">{{ t('conversation.composeTitle') }}</text>
        <text class="hint-compose-subtitle">{{ t('conversation.composeSubtitle') }}</text>
        <textarea
          v-model="hintComposeText"
          class="hint-compose-input"
          maxlength="120"
          :placeholder="t('conversation.composePlaceholder')"
        />
        <view class="hint-compose-actions">
          <view class="hint-compose-btn light" @click="closeHintComposer">{{ t('common.cancel') }}</view>
          <view class="hint-compose-btn dark" :class="{ disabled: hintRefreshLoading }" @click="submitHintComposer">
            {{ hintRefreshLoading ? t('common.refreshing') : t('conversation.refreshExampleAction') }}
          </view>
        </view>
      </view>
    </view>

    <view v-if="showSmartExplainSheet" class="smart-sheet-overlay" :class="smartExplainMode === 'ai' ? 'mode-ai' : 'mode-user'" @click="closeSmartExplainSheet">
      <view class="smart-sheet" :class="smartExplainMode === 'ai' ? 'from-left' : 'from-right'" @click.stop>
        <view class="smart-sheet-head">
          <text class="smart-sheet-title">{{ smartExplainMode === 'ai' ? t('conversation.aiExplainTitle') : t('conversation.userFeedbackTitle') }}</text>
          <view class="smart-sheet-close" @click="closeSmartExplainSheet"><text>✕</text></view>
        </view>
        <scroll-view class="smart-sheet-body" scroll-y>
          <view v-if="smartExplainSourceText" class="smart-source-card">
            <text class="smart-source-label">{{ smartExplainMode === 'ai' ? t('conversation.sourceAi') : t('conversation.sourceUser') }}</text>
            <text class="smart-source-text">{{ smartExplainSourceText }}</text>
          </view>

          <view v-if="smartExplainData.summaryCn" class="smart-block">
            <text class="smart-block-title">{{ smartExplainMode === 'ai' ? t('conversation.basicExplain') : t('conversation.overallExplain') }}</text>
            <text class="smart-block-text">{{ smartExplainData.summaryCn }}</text>
          </view>

          <view v-if="smartExplainMode === 'ai' && smartExplainData.basicMeaningCn" class="smart-block">
            <text class="smart-block-title">{{ t('conversation.sentenceMeaning') }}</text>
            <text class="smart-block-text">{{ smartExplainData.basicMeaningCn }}</text>
          </view>

          <view v-if="smartExplainMode === 'ai' && smartExplainData.expressionFocusCn" class="smart-block">
            <text class="smart-block-title">{{ t('conversation.expressionStyle') }}</text>
            <text class="smart-block-text">{{ smartExplainData.expressionFocusCn }}</text>
          </view>

          <view v-if="smartExplainMode === 'ai' && smartExplainData.phrases?.length" class="smart-block">
            <text class="smart-block-title">{{ t('conversation.phraseBreakdown') }}</text>
            <view v-for="(item, idx) in smartExplainData.phrases" :key="`phrase-${idx}`" class="smart-list-card">
              <text class="smart-list-key">{{ item.phrase }}</text>
              <text v-if="item.meaningCn" class="smart-list-text">{{ item.meaningCn }}</text>
              <text v-if="item.noteCn" class="smart-list-sub">{{ item.noteCn }}</text>
            </view>
          </view>

          <view v-if="smartExplainData.issues?.length || smartExplainData.difficultPoints?.length" class="smart-block">
            <text class="smart-block-title">{{ smartExplainMode === 'ai' ? t('conversation.difficultPoints') : t('conversation.improvablePoints') }}</text>
            <view
              v-for="(item, idx) in (smartExplainData.issues?.length ? smartExplainData.issues : smartExplainData.difficultPoints)"
              :key="`issue-${idx}`"
              class="smart-list-card"
            >
              <text class="smart-list-key">{{ item.title }}</text>
              <text v-if="item.detail" class="smart-list-text">{{ item.detail }}</text>
              <text v-if="item.suggestion" class="smart-list-sub">{{ t('conversation.suggestionPrefix') }}{{ item.suggestion }}</text>
              <text v-if="item.betterExample" class="smart-list-example">{{ item.betterExample }}</text>
            </view>
          </view>

          <view v-if="smartExplainMode === 'user' && smartExplainData.contextVerdictCn" class="smart-block">
            <text class="smart-block-title">{{ t('conversation.contextCheck') }}</text>
            <text class="smart-block-text">{{ smartExplainData.contextVerdictCn }}</text>
          </view>

          <view v-if="smartExplainMode === 'user' && smartExplainData.logicVerdictCn" class="smart-block">
            <text class="smart-block-title">{{ t('conversation.logicCheck') }}</text>
            <text class="smart-block-text">{{ smartExplainData.logicVerdictCn }}</text>
          </view>

          <view v-if="smartExplainMode === 'user' && smartExplainData.encouragementCn" class="smart-block">
            <text class="smart-block-title">{{ t('conversation.extraAdvice') }}</text>
            <text class="smart-block-text">{{ smartExplainData.encouragementCn }}</text>
          </view>
        </scroll-view>
      </view>
    </view>

    <!-- Word Popup (inline) -->
    <view v-if="showWordPopup" class="overlay" @click="showWordPopup = false">
      <view class="sheet" @click.stop>
        <view class="sheet-handle"><view class="handle-bar"></view></view>
        <scroll-view class="sheet-body" scroll-y enable-flex>
          <view class="word-hero">
            <text class="word-hero-text">{{ selectedWord }}</text>
            <text class="word-hero-phonetic">{{ wordData.phonetic || t('conversation.noPhonetic') }}</text>
            <text class="word-meta">{{ wordData.providerLabel }}</text>
            <text v-if="wordLoading" class="word-status">{{ wordLoadingText }}</text>
            <text v-else-if="wordLoadFailed" class="word-status error">{{ t('conversation.wordCardLoadFailed') }}</text>
          </view>
          <view class="def-section" v-if="wordData.partOfSpeech.length">
            <text class="def-label">{{ t('conversation.partOfSpeech') }}</text>
            <view class="tag-row">
              <text v-for="(pos, index) in wordData.partOfSpeech" :key="index" class="tag-chip">{{ pos }}</text>
            </view>
          </view>
          <view class="def-section">
            <text class="def-label">{{ t('conversation.meaning') }}</text>
            <text class="def-text">{{ wordData.definitionCn || t('conversation.defaultDefinition') }}</text>
          </view>
          <view class="def-section" v-if="wordData.usageNotes.length">
            <text class="def-label">{{ t('conversation.usageNotes') }}</text>
            <text v-for="(note, index) in wordData.usageNotes" :key="index" class="bullet-line">- {{ note }}</text>
          </view>
          <view class="def-section" v-if="wordData.synonyms.length">
            <text class="def-label">{{ t('conversation.synonyms') }}</text>
            <view class="tag-row">
              <text v-for="(item, index) in wordData.synonyms" :key="index" class="tag-chip light">{{ item }}</text>
            </view>
          </view>
          <view class="def-section" v-if="wordData.wordRoot">
            <text class="def-label">{{ t('conversation.wordRoot') }}</text>
            <text class="def-subtext">{{ wordData.wordRoot }}</text>
          </view>
          <view class="ex-section">
            <text class="ex-label">{{ t('conversation.examples') }}</text>
            <view v-if="wordData.exampleSentences.length">
              <view v-for="(ex, ei) in wordData.exampleSentences" :key="ei" class="ex-item">
                <view class="ex-en">
                  <text v-for="(word, wordIndex) in splitWords(ex.english)" :key="wordIndex" class="example-word" @click="onWordClick(extractCleanWord(word), ex.english)">
                    {{ word + ' ' }}
                  </text>
                </view>
                <text class="ex-cn">{{ ex.chinese || t('conversation.defaultDefinition') }}</text>
              </view>
            </view>
            <view v-else class="empty-card">
              <text class="empty-card-text">{{ t('conversation.noExamples') }}</text>
            </view>
          </view>
        </scroll-view>
        <view class="sheet-footer">
          <view class="actions">
            <view class="action-btn primary" :class="{ disabled: selectedWordVoiceLoading }" @click="playSelectedWordVoice">{{ selectedWordVoiceLoading ? t('common.loadingDots') : `🔊 ${t('common.readAloud')}` }}</view>
            <view class="action-btn outline" :class="{ disabled: bookmarkLoading || wordLoading }" @click="toggleSave">{{ bookmarkLoading ? t('conversation.bookmarkProcessing') : (isSaved ? t('conversation.saved') : t('conversation.saveWord')) }}</view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { bookmarkApi, conversationApi, wordApi, voiceApi } from '../../utils/request';
import { getApiBaseUrl } from '../../utils/env';
import { scenarioStore } from '../../store/scenario';
import { settingsStore } from '../../store/settings';
import { authStore } from '../../store/auth';
import {
  getAppText,
  getLearningLanguageLabel,
  normalizeLearningLanguage,
  normalizeNativeLanguage
} from '../../utils/app-language';

const BASE_URL = getApiBaseUrl();
const WORDBOOK_SCENARIO_ID = 'wordbook-review';
const THEME_FREE_MODE_SUBTASK_ID = '__theme_free_mode__';

function getBaseOrigin(url = '') {
  const normalized = String(url || '').replace(/\/+$/, '');
  const match = normalized.match(/^(https?:\/\/[^/]+)(\/.*)?$/i);
  return match ? match[1] : normalized;
}

function getBasePath(url = '') {
  const normalized = String(url || '').replace(/\/+$/, '');
  const match = normalized.match(/^(https?:\/\/[^/]+)(\/.*)?$/i);
  return match ? (match[2] || '') : '';
}

function resolveServiceUrl(pathname = '') {
  const normalizedPath = String(pathname || '').trim();
  if (!normalizedPath) return '';
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;

  const baseOrigin = getBaseOrigin(BASE_URL);
  const basePath = getBasePath(BASE_URL);
  if (basePath && (normalizedPath === basePath || normalizedPath.startsWith(`${basePath}/`))) {
    return `${baseOrigin}${normalizedPath}`;
  }

  return `${BASE_URL}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`;
}

function normalizeText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function getPreferredRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg'
  ];
  return candidates.find((item) => MediaRecorder.isTypeSupported(item)) || '';
}

function normalizeStringArray(value, maxItems = 6) {
  if (!Array.isArray(value)) return [];

  return [
    ...new Set(
      value
        .map((item) => normalizeText(item))
        .filter(Boolean)
    )
  ].slice(0, maxItems);
}

function normalizeUsageNotes(value) {
  return normalizeStringArray(value, 4);
}

function parseMaybeJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeExampleSentences(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => ({
      english: normalizeText(item?.english || item?.sentence || item?.en),
      chinese: normalizeText(item?.chinese || item?.translation || item?.cn)
    }))
    .filter((item) => item.english)
    .slice(0, 3);
}

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

function buildWordForms(word = '') {
  const lower = normalizeText(word).toLowerCase();
  if (!lower) return [];

  const forms = new Set([lower]);
  if (lower.endsWith('ies') && lower.length > 3) {
    forms.add(`${lower.slice(0, -3)}y`);
  }
  if (/(ses|xes|zes|ches|shes|oes)$/.test(lower) && lower.length > 2) {
    forms.add(lower.slice(0, -2));
  }
  if (lower.endsWith('s') && !lower.endsWith('ss') && lower.length > 1) {
    forms.add(lower.slice(0, -1));
  }
  if (!lower.endsWith('s')) {
    forms.add(`${lower}s`);
    if (/[bcdfghjklmnpqrstvwxyz]y$/.test(lower)) {
      forms.add(`${lower.slice(0, -1)}ies`);
    }
    if (/(s|x|z|ch|sh|o)$/.test(lower)) {
      forms.add(`${lower}es`);
    }
  }

  return Array.from(forms).filter(Boolean);
}

export default {
  watch: {
    'messages.length'(nextLength, previousLength) {
      if (nextLength === previousLength) return;
      this.scrollBottom(true);
    },
    isAiThinking(nextValue) {
      if (nextValue) {
        this.scrollBottom(true);
      }
    }
  },
  data() {
    return {
      inputMode: 'voice',
      sessionId: null,
      sessionStatus: 'active',
      pageActive: true,
      viewToken: 0,
      inputText: '', recording: false, isAiThinking: false, transcribingVoice: false,
      recordDuration: 0, recordTimerInterval: null,
      showWordPopup: false, selectedWord: '', selectedWordContext: '', isSaved: false, bookmarkLoading: false, wordLoading: false, wordLoadFailed: false, wordData: { phonetic: '', definitionCn: '', wordRoot: '', partOfSpeech: [], usageNotes: [], synonyms: [], exampleSentences: [], provider: 'ai-structured', providerLabel: '' },
      scrollToId: '',
      showTranslation: true,
      showHints: true,
      showHintExamples: true,
      autoPlayVoice: true,
      smartExplainEnabled: false,
      learningLanguage: 'en',
      nativeLanguage: 'zh-CN',
      voiceSpeed: 1.0,
      voiceOnly: false,
      wordbookAutoRemoveCount: 1,
      wordbookLoading: false,
      wordbookTargets: [],
      userHint: '', userHintCn: '',
      userHintIdea: '', userHintIdeaCn: '',
      userHintExample: '', userHintExampleCn: '',
      hintVoiceLoading: false,
      hintRefreshLoading: false,
      selectedWordVoiceLoading: false,
      showHintComposer: false,
      hintComposeText: '',
      showConversationMenu: false,
      restartDialogVisible: false,
      rollbackDialogVisible: false,
      rollbackTargetMessageId: null,
      rollbackTargetMessageText: '',
      rollbackLoading: false,
      completionDialogVisible: false,
      completionDialogTitle: '',
      completionDialogMessage: '',
      completionDialogActions: [
        { key: 'done', label: '知道了', variant: 'primary' }
      ],
      showSmartExplainSheet: false,
      smartExplainMode: 'ai',
      smartExplainData: {},
      smartExplainSourceText: '',
      pendingAutoPlayTimers: [],
      activeVoiceMessageId: null,
      chatAreaHeight: 0,
      isNearChatBottom: true,
      asyncSyncTimer: null,
      asyncSyncAttempts: 0,
      asyncSyncMaxAttempts: 10,
      asyncSyncTargetAiMessageId: null,
      asyncSyncTargetUserMessageId: null,
      asyncSyncHintExpected: false,
      asyncSyncReviewExpected: false,
      asyncSyncShouldStickBottom: false,
      requestedSessionId: '',
      currentScenario: { id: 'restaurant', title: 'Restaurant', title_en: '', icon: '🤖', subTaskId: '', subTaskTitle: '', categoryTitle: '', sceneType: 'level' },
      messages: [],
      sessionInitError: false,
      sessionInitErrorMessage: '',
      replyErrorMessage: '',
      pendingReplyText: '',
      pendingReplyMessageId: null
    };
  },
  computed: {
    voiceButtonTitle() {
      if (this.recording) return this.t('common.stopRecording');
      if (this.transcribingVoice) return this.t('common.recognizing');
      if (this.isAiThinking) return this.t('common.aiReplying');
      return this.t('common.startRecording');
    },
    learningLanguageLabel() {
      return getLearningLanguageLabel(this.learningLanguage, this.nativeLanguage);
    },
    wordLoadingText() {
      return this.t('conversation.wordLoading', { language: this.learningLanguageLabel });
    },
    currentScenarioSubtitle() {
      if (this.isThemeFreeMode()) {
        return this.t('conversation.themeFreeMode');
      }
      if (this.currentScenario.subTaskTitle) {
        return this.currentScenario.subTaskTitle;
      }
      if (this.currentScenario.categoryTitle) {
        return this.currentScenario.categoryTitle;
      }
      return this.currentScenario.title_en || '';
    },
    isInputDisabled() {
      return this.rollbackLoading
        || this.isAiThinking
        || this.transcribingVoice
        || this.recording
        || (this.sessionStatus === 'completed' && !this.isThemeFreeMode());
    },
    inputPlaceholder() {
      if (this.transcribingVoice) return this.t('common.recognizing');
      if (this.sessionStatus === 'completed' && !this.isThemeFreeMode()) {
        return this.t('conversation.completedInputPlaceholder');
      }
      return this.t('conversation.inputPlaceholder');
    }
  },
  onShow() {
    this.markPageActive();
    this.measureChatArea();
    if (!this.sessionId) return;
    this.loadSettings();
    this.loadSessionMessages(this.sessionId, { autoPlayLatest: false }).catch(() => {});
  },
  onReady() {
    this.measureChatArea();
  },
  onLoad(options) {
    this.markPageActive();
    this.resetConversationRuntime();
    if (options.id) this.currentScenario.id = options.id;
    if (options.sessionId) this.requestedSessionId = options.sessionId;
    if (options.subTaskId) this.currentScenario.subTaskId = options.subTaskId;
    this.bootstrapConversationPage();
  },
  methods: {
    t(key, params = {}) {
      return getAppText(this.nativeLanguage, key, params);
    },
    isUnauthorizedError(error) {
      return Number(error?.statusCode || error?.status || 0) === 401;
    },
    buildConversationRedirectUrl() {
      const params = [`id=${encodeURIComponent(this.currentScenario.id || 'restaurant')}`];
      if (this.requestedSessionId) {
        params.push(`sessionId=${encodeURIComponent(this.requestedSessionId)}`);
      }
      if (this.currentScenario.subTaskId) {
        params.push(`subTaskId=${encodeURIComponent(this.currentScenario.subTaskId)}`);
      }
      return `/pages/scenario/conversation?${params.join('&')}`;
    },
    redirectToLoginPage() {
      uni.redirectTo({
        url: `/pages/auth/login?redirect=${encodeURIComponent(this.buildConversationRedirectUrl())}`
      });
    },
    async ensureAuthReady() {
      const auth = authStore();
      auth.bootstrap();
      if (!auth.token) {
        return false;
      }

      try {
        await auth.fetchMe();
        return true;
      } catch (error) {
        if (this.isUnauthorizedError(error)) {
          auth.clearAuth();
          return false;
        }

        console.warn('Auth bootstrap failed:', error?.message || error);
        return true;
      }
    },
    async bootstrapConversationPage() {
      const isAuthenticated = await this.ensureAuthReady();
      if (!isAuthenticated) {
        this.redirectToLoginPage();
        return;
      }

      this.loadSettings();
      this.loadScenarioInfo()
        .catch(() => {})
        .finally(() => {
          this.initSession();
        });
    },
    resetConversationRuntime() {
      this.destroyAudio();
      this.clearAutoPlayTimers();
      this.stopAsyncMessageSync();
      this.clearRecordTimer();
      this.stopRecordingSilently();
      this.destroyWebRecorder();
      this.sessionId = null;
      this.requestedSessionId = '';
      this.sessionStatus = 'active';
      this.messages = [];
      this.inputText = '';
      this.scrollToId = '';
      this.rollbackDialogVisible = false;
      this.rollbackTargetMessageId = null;
      this.rollbackTargetMessageText = '';
      this.rollbackLoading = false;
      this.clearSessionInitError();
      this.clearReplyError();
      this.clearHints();
      this.currentScenario = {
        id: 'restaurant',
        title: 'Restaurant',
        title_en: '',
        icon: '🤖',
        subTaskId: '',
        subTaskTitle: '',
        categoryTitle: '',
        sceneType: 'level'
      };
    },
    toggleInputMode() {
      this.inputMode = this.inputMode === 'voice' ? 'text' : 'voice';
      uni.setStorageSync('talkscape_input_mode', this.inputMode);
    },
    markPageActive() {
      if (!this.pageActive) {
        this.viewToken += 1;
      }
      this.pageActive = true;
    },
    markPageInactive() {
      this.pageActive = false;
      this.viewToken += 1;
      this.stopAsyncMessageSync();
      this.isAiThinking = false;
      this.recording = false;
      this.transcribingVoice = false;
      this.rollbackLoading = false;
      this.rollbackDialogVisible = false;
      this.hintVoiceLoading = false;
      this.selectedWordVoiceLoading = false;
      this.clearAutoPlayTimers();
      this.clearRecordTimer();
      this.stopRecordingSilently();
      this.destroyWebRecorder();
      this.destroyAudio();
    },
    isViewAlive(token) {
      return this.pageActive && this.viewToken === token;
    },
    scheduleAutoPlay(callback, delay = 200) {
      const viewToken = this.viewToken;
      const timerId = setTimeout(() => {
        this.pendingAutoPlayTimers = this.pendingAutoPlayTimers.filter((item) => item !== timerId);
        if (!this.isViewAlive(viewToken)) return;
        callback();
      }, delay);
      this.pendingAutoPlayTimers.push(timerId);
    },
    clearAutoPlayTimers() {
      this.pendingAutoPlayTimers.forEach((timerId) => clearTimeout(timerId));
      this.pendingAutoPlayTimers = [];
    },
    measureChatArea() {
      this.$nextTick(() => {
        const query = uni.createSelectorQuery().in(this);
        query.select('.chat-area').boundingClientRect((rect) => {
          if (rect?.height) {
            this.chatAreaHeight = rect.height;
          }
        }).exec();
      });
    },
    handleChatScroll(event = {}) {
      const detail = event?.detail || {};
      const scrollHeight = Number(detail.scrollHeight || 0);
      if (!scrollHeight || !this.chatAreaHeight) {
        return;
      }
      const scrollTop = Number(detail.scrollTop || 0);
      this.isNearChatBottom = (scrollHeight - (scrollTop + this.chatAreaHeight)) <= 80;
    },
    clearRecordTimer() {
      if (this.recordTimerInterval) {
        clearInterval(this.recordTimerInterval);
        this.recordTimerInterval = null;
      }
    },
    supportsWebRecorder() {
      return typeof MediaRecorder !== 'undefined'
        && typeof navigator !== 'undefined'
        && !!navigator.mediaDevices?.getUserMedia;
    },
    async initWebRecorder() {
      if (this._mediaRecorder) return true;
      if (!this.supportsWebRecorder()) return false;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = getPreferredRecorderMimeType();
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        this._mediaRecorderStream = stream;
        this._mediaRecorderChunks = [];
        this._mediaRecorder = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            this._mediaRecorderChunks.push(event.data);
          }
        };
        recorder.onstop = async () => {
          const shouldIgnore = this._ignoreNextRecordedClip;
          this._ignoreNextRecordedClip = false;
          this.recording = false;
          this.clearRecordTimer();

          if (shouldIgnore || !this.pageActive || !this._mediaRecorderChunks?.length) {
            this._mediaRecorderChunks = [];
            return;
          }

          const viewToken = this.viewToken;
          this.transcribingVoice = true;
          try {
            const blob = new Blob(this._mediaRecorderChunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
            const localVoiceUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
              ? URL.createObjectURL(blob)
              : '';
            const voiceDuration = Number(this.recordDuration || 0);
            this._mediaRecorderChunks = [];
            const sttRes = await voiceApi.stt(blob);
            if (!this.isViewAlive(viewToken)) return;

            const recognizedText = normalizeText(sttRes?.data?.text || sttRes?.text || '');
            if (!recognizedText) {
              uni.showToast({ title: this.t('conversation.retryVoiceInput'), icon: 'none' });
              return;
            }

            this.inputText = recognizedText;
            this.transcribingVoice = false;
            await this.submitUserMessage(
              recognizedText,
              true,
              localVoiceUrl,
              voiceDuration,
              sttRes?.data?.audioUrl || sttRes?.audioUrl || ''
            );
          } catch (e) {
            if (!this.isViewAlive(viewToken)) return;
            this.transcribingVoice = false;
            uni.showToast({ title: e.message || '语音识别失败', icon: 'none' });
          }
        };
        recorder.onerror = (event) => {
          this.recording = false;
          this.transcribingVoice = false;
          this.clearRecordTimer();
          this._ignoreNextRecordedClip = false;
          uni.showToast({ title: event?.error?.message || '录音失败', icon: 'none' });
        };

        return true;
      } catch (e) {
        uni.showToast({ title: e.message || '浏览器未授予麦克风权限', icon: 'none' });
        return false;
      }
    },
    destroyWebRecorder() {
      if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
        try {
          this._mediaRecorder.stop();
        } catch {}
      }
      if (this._mediaRecorderStream) {
        this._mediaRecorderStream.getTracks().forEach((track) => track.stop());
      }
      this._mediaRecorder = null;
      this._mediaRecorderStream = null;
      this._mediaRecorderChunks = [];
    },
    initRecorder() {
      if (this._recorderManager || typeof uni.getRecorderManager !== 'function') {
        return Boolean(this._recorderManager);
      }

      const recorder = uni.getRecorderManager();
      this._recorderManager = recorder;

      recorder.onStop(async (res = {}) => {
        const shouldIgnore = this._ignoreNextRecordedClip;
        this._ignoreNextRecordedClip = false;
        this.recording = false;
        this.clearRecordTimer();

        if (shouldIgnore || !res.tempFilePath || !this.pageActive) {
          return;
        }

        const viewToken = this.viewToken;
        this.transcribingVoice = true;
        try {
          const sttRes = await voiceApi.stt(res.tempFilePath);
          if (!this.isViewAlive(viewToken)) return;

          const recognizedText = normalizeText(sttRes?.data?.text || sttRes?.text || '');
          if (!recognizedText) {
            uni.showToast({ title: this.t('conversation.retryVoiceInput'), icon: 'none' });
            return;
          }

          this.inputText = recognizedText;
          this.transcribingVoice = false;
          await this.submitUserMessage(
            recognizedText,
            true,
            '',
            Number(this.recordDuration || 0),
            sttRes?.data?.audioUrl || sttRes?.audioUrl || ''
          );
        } catch (e) {
          if (!this.isViewAlive(viewToken)) return;
          this.transcribingVoice = false;
          uni.showToast({ title: e.message || '语音识别失败', icon: 'none' });
        }
      });

      recorder.onError((error) => {
        this.recording = false;
        this.transcribingVoice = false;
        this.clearRecordTimer();
        this._ignoreNextRecordedClip = false;
        uni.showToast({ title: error?.errMsg || '录音失败', icon: 'none' });
      });

      return true;
    },
    stopRecordingSilently() {
      this._ignoreNextRecordedClip = true;
      this.clearRecordTimer();
      if (this._recorderManager) {
        try {
          this._recorderManager.stop();
        } catch {}
      }
      if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
        try {
          this._mediaRecorder.stop();
        } catch {}
      }
    },
    getProviderLabel(provider) {
      if (provider === 'ai-fallback') return this.t('conversation.tempWordCard');
      if (provider === 'ai-structured') return this.t('conversation.aiWordCard', { language: this.learningLanguageLabel });
      return this.t('conversation.wordCard', { language: this.learningLanguageLabel });
    },
    normalizeWordData(data = {}) {
      const provider = normalizeText(data.provider, 'ai-structured');

      return {
        phonetic: normalizeText(data.phonetic),
        definitionCn: normalizeText(data.definitionCn || data.definition_cn, this.t('conversation.defaultDefinition')),
        wordRoot: normalizeText(data.wordRoot || data.word_root),
        partOfSpeech: normalizeStringArray(data.partOfSpeech || data.part_of_speech, 4),
        usageNotes: normalizeUsageNotes(data.usageNotes || data.usage_notes),
        synonyms: normalizeStringArray(data.synonyms, 6),
        exampleSentences: normalizeExampleSentences(data.exampleSentences || data.example_sentences),
        provider,
        providerLabel: normalizeText(data.providerLabel, this.getProviderLabel(provider))
      };
    },
    splitWords(text) {
      return String(text || '').split(/\s+/).filter(Boolean);
    },
    extractCleanWord(word) {
      return String(word || '').replace(/[^\w'-]/g, '').trim();
    },
    canRequestVoice(message = {}) {
      return message.role === 'ai' && Boolean(message.english);
    },
    showMessageActions(message = {}) {
      return this.canRequestVoice(message) || message.role === 'ai';
    },
    showRollbackAction(message = {}, index = -1) {
      return !this.rollbackLoading
        && !this.isAiThinking
        && !this.transcribingVoice
        && !this.recording
        && message.role === 'ai'
        && Boolean(message.id)
        && index >= 0
        && index < this.messages.length - 1;
    },
    createMessageState(message = {}) {
      const feedback = parseMaybeJson(message.ai_feedback || message.aiFeedback, null);
      const explanation = parseMaybeJson(message.ai_explanation || message.aiExplanation, null);
      return {
        id: message.id || null,
        playbackKey: message.playbackKey || message.id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: message.role,
        english: message.english,
        chinese: message.chinese,
        isVoice: Boolean(message.isVoice || message.user_input_type === 'voice' || message.userInputType === 'voice'),
        localVoiceUrl: message.localVoiceUrl || null,
        voiceDuration: Number(message.voiceDuration || message.voice_duration || 0),
        userHint: message.user_hint || message.userHint || '',
        userHintCn: message.user_hint_cn || message.userHintCn || '',
        userHintIdea: message.user_hint_idea || message.userHintIdea || '',
        userHintIdeaCn: message.user_hint_idea_cn || message.userHintIdeaCn || '',
        userHintExample: message.user_hint_example || message.userHintExample || message.user_hint || message.userHint || '',
        userHintExampleCn: message.user_hint_example_cn || message.userHintExampleCn || message.user_hint_cn || message.userHintCn || '',
        voiceUrl: message.voice_url || message.voiceUrl || null,
        userInputType: message.user_input_type || message.userInputType || 'typed',
        isCorrect: message.is_correct ?? message.isCorrect ?? null,
        feedback,
        explanation,
        voiceLoading: false,
        voicePromise: null,
        explanationLoading: false
      };
    },
    mergeMessageState(message = {}) {
      const nextMessage = this.createMessageState(message);
      const existingMessage = nextMessage.id
        ? this.messages.find((item) => String(item.id || '') === String(nextMessage.id))
        : null;
      if (!existingMessage) {
        return nextMessage;
      }

      return {
        ...nextMessage,
        playbackKey: existingMessage.playbackKey || nextMessage.playbackKey,
        localVoiceUrl: existingMessage.localVoiceUrl || nextMessage.localVoiceUrl,
        voiceLoading: existingMessage.voiceLoading,
        voicePromise: existingMessage.voicePromise,
        explanationLoading: existingMessage.explanationLoading,
        explanation: nextMessage.explanation || existingMessage.explanation
      };
    },
    getMessageById(messageId, sourceMessages = this.messages) {
      if (!messageId) return null;
      return sourceMessages.find((item) => String(item.id || '') === String(messageId)) || null;
    },
    hasHintData(message = {}) {
      return Boolean(
        message?.user_hint_idea
        || message?.userHintIdea
        || message?.user_hint_example
        || message?.userHintExample
        || message?.user_hint
        || message?.userHint
      );
    },
    hasReviewData(message = {}) {
      return (
        (message?.is_correct !== null && message?.is_correct !== undefined)
        || (message?.isCorrect !== null && message?.isCorrect !== undefined)
        || Boolean(message?.feedback || message?.ai_feedback || message?.aiFeedback)
      );
    },
    syncMessagesFromServer(rawMessages = [], options = {}) {
      const previousAiMessage = this.getMessageById(options.targetAiMessageId);
      const previousUserMessage = this.getMessageById(options.targetUserMessageId);
      this.messages = rawMessages.map((item) => this.mergeMessageState(item));
      this.syncHintFromMessages(rawMessages);

      const nextAiMessage = this.getMessageById(options.targetAiMessageId);
      const nextUserMessage = this.getMessageById(options.targetUserMessageId);
      const hintReady = !options.hintExpected || this.hasHintData(nextAiMessage);
      const reviewReady = !options.reviewExpected || this.hasReviewData(nextUserMessage);
      const hintUpdated = Boolean(options.hintExpected && !this.hasHintData(previousAiMessage) && this.hasHintData(nextAiMessage));
      const reviewUpdated = Boolean(options.reviewExpected && !this.hasReviewData(previousUserMessage) && this.hasReviewData(nextUserMessage));

      if (options.stickToBottom && (hintUpdated || reviewUpdated)) {
        this.scrollBottom(true);
      } else if (options.forceScrollBottom) {
        this.scrollBottom(true);
      }

      return {
        hintReady,
        reviewReady,
        hintUpdated,
        reviewUpdated
      };
    },
    isWordbookScenario() {
      return this.currentScenario.id === WORDBOOK_SCENARIO_ID;
    },
    isThemeFreeMode() {
      return this.currentScenario.subTaskId === THEME_FREE_MODE_SUBTASK_ID;
    },
    mapWordbookTarget(item = {}) {
      const word = normalizeText(item.word).toLowerCase();
      return {
        word,
        forms: buildWordForms(word),
        phonetic: normalizeText(item.phonetic),
        definition: normalizeText(item.definition_cn || item.definition_en, this.t('conversation.defaultDefinition')),
        context: normalizeText(item.source_sentence),
        partOfSpeech: parseJsonArray(item.part_of_speech).map((entry) => normalizeText(entry)).filter(Boolean),
        hitCount: Math.max(0, Number(item.review_count) || 0)
      };
    },
    async loadWordbookTargets() {
      if (!this.isWordbookScenario()) return;

      this.wordbookLoading = true;
      try {
        const res = await bookmarkApi.getAll({ wordbookEligible: 1 });
        this.wordbookTargets = (res.data || []).map((item) => this.mapWordbookTarget(item));
      } catch (e) {
        this.wordbookTargets = [];
        if (e.statusCode !== 401) {
          uni.showToast({ title: e.message || this.t('conversation.wordbookLoadFailed'), icon: 'none' });
        }
      } finally {
        this.wordbookLoading = false;
      }
    },
    getMatchedWordbookWords(text) {
      const words = new Set(
        this.splitWords(text)
          .map((item) => this.extractCleanWord(item).toLowerCase())
          .filter(Boolean)
      );

      return this.wordbookTargets
        .filter((item) => {
          const forms = Array.isArray(item.forms) && item.forms.length ? item.forms : [item.word];
          return forms.some((form) => words.has(form));
        })
        .map((item) => item.word);
    },
    async handleWordbookHits(text) {
      if (!this.isWordbookScenario() || !this.wordbookTargets.length) return;

      const matchedWords = this.getMatchedWordbookWords(text);
      if (!matchedWords.length) return;

      try {
        const res = await bookmarkApi.recordWordbookSuccesses(matchedWords);
        const removedWords = Array.isArray(res.data?.removedWords) ? res.data.removedWords : [];
        if (this.selectedWord && removedWords.includes(String(this.selectedWord).toLowerCase())) {
          this.isSaved = false;
        }
        await this.loadWordbookTargets();
      } catch (e) {
        uni.showToast({ title: e.message || this.t('common.loadFailed'), icon: 'none' });
      }
    },
    async loadScenarioInfo() {
      const sStore = scenarioStore();
      await sStore.fetchScenarioById(this.currentScenario.id);
      if (sStore.currentScenario) {
        this.currentScenario.title = sStore.currentScenario.title;
        this.currentScenario.title_en = sStore.currentScenario.title_en || '';
        this.currentScenario.icon = sStore.currentScenario.icon || '🤖';
        this.currentScenario.categoryTitle = sStore.currentScenario.categoryTitle || sStore.currentScenario.category_title || '';
        this.currentScenario.sceneType = sStore.currentScenario.sceneType || sStore.currentScenario.scene_type || 'level';
        if (this.isThemeFreeMode()) {
          this.currentScenario.subTaskTitle = this.t('conversation.themeFreeMode');
          return;
        }
        const subTasks = sStore.currentScenario.subTasks || [];
        const defaultSubTaskId = sStore.currentScenario.defaultSubTaskId || subTasks[0]?.id || '';
        const activeSubTask = subTasks.find((item) => item.id === this.currentScenario.subTaskId);
        if (!activeSubTask) {
          this.currentScenario.subTaskId = defaultSubTaskId;
        }
        const resolvedSubTask = subTasks.find((item) => item.id === this.currentScenario.subTaskId);
        this.currentScenario.subTaskTitle = resolvedSubTask?.title || '';
      }
    },
    loadSettings() {
      const sStore = settingsStore();
      sStore.loadSettings().then(() => {
        this.learningLanguage = normalizeLearningLanguage(sStore.learningLanguage || 'en');
        this.nativeLanguage = normalizeNativeLanguage(sStore.nativeLanguage || 'zh-CN');
        this.showTranslation = sStore.showTranslation;
        this.showHints = sStore.showHints;
        this.showHintExamples = sStore.showHintExamples;
        this.autoPlayVoice = sStore.autoPlayVoice;
        this.voiceOnly = Boolean(sStore.voiceOnly);
        this.voiceSpeed = Number(sStore.voiceSpeed) || 1.0;
        this.smartExplainEnabled = Boolean(sStore.smartExplainEnabled);
        this.wordbookAutoRemoveCount = Math.max(1, Number(sStore.wordbookAutoRemoveCount) || 1);
        this.restartDialogActions = [
          {
            key: 'confirm',
            label: this.t('conversation.restart'),
            desc: this.t('conversation.restartDesc'),
            variant: 'danger'
          }
        ];
        
        const savedMode = uni.getStorageSync('talkscape_input_mode');
        if (savedMode === 'text' || savedMode === 'voice') {
          this.inputMode = savedMode;
        }

        if (this.isWordbookScenario()) {
          this.loadWordbookTargets();
        }
      });
    },
    async toggleQuickSetting(key) {
      const sStore = settingsStore();
      const previousValue = Boolean(this[key]);
      const nextValue = !previousValue;
      this[key] = nextValue;
      try {
        await sStore.updateSetting(key, nextValue);
      } catch (error) {
        this[key] = previousValue;
        uni.showToast({ title: error?.message || this.t('common.retryLater'), icon: 'none' });
      }
    },
    clearReplyError() {
      this.replyErrorMessage = '';
      this.pendingReplyText = '';
      this.pendingReplyMessageId = null;
    },
    setReplyError(message, options = {}) {
      this.replyErrorMessage = normalizeText(message, this.t('common.retryLater'));
      this.pendingReplyText = normalizeText(options.pendingReplyText || '');
      this.pendingReplyMessageId = options.pendingReplyMessageId || null;
    },
    clearSessionInitError() {
      this.sessionInitError = false;
      this.sessionInitErrorMessage = '';
    },
    closeCompletionDialog() {
      this.completionDialogVisible = false;
    },
    handleScenarioCompleted(result = {}) {
      if ((this.currentScenario.sceneType || 'level') !== 'level' || this.isThemeFreeMode()) {
        return;
      }
      const outcome = String(result.completionOutcome || '').trim().toLowerCase();
      const sStore = scenarioStore();
      if (outcome === 'success') {
        sStore.markScenarioCompleted(this.currentScenario.id);
      }
      this.completionDialogTitle = result.completionDialogTitle || (outcome === 'failed' ? '本轮挑战结束' : '恭喜完成挑战');
      this.completionDialogMessage = result.completionDialogMessage
        || (outcome === 'failed'
          ? `${this.currentScenario.title} 本轮未完成，建议根据当前关卡目标调整表达后重新挑战。`
          : `${this.currentScenario.title} 已完成挑战，场景列表会显示“已完成”标识。`);
      this.completionDialogVisible = true;
    },
    // 构造可访问的语音 URL
    getVoiceUrl(msg) {
      if (!msg) return null;
      if (msg.localVoiceUrl) return msg.localVoiceUrl;
      if (!msg.voiceUrl) return null;
      return resolveServiceUrl(msg.voiceUrl);
    },
    async ensureVoiceReady(msg) {
      if (!msg) return null;
      if (!this.canRequestVoice(msg)) return null;
      if (msg.voiceUrl) return msg.voiceUrl;
      if (!msg.id || !this.sessionId) return null;
      if (msg.voicePromise) return msg.voicePromise;

      const viewToken = this.viewToken;
      msg.voiceLoading = true;
      msg.voicePromise = conversationApi.ensureMessageVoice(this.sessionId, msg.id, {
        speed: this.voiceSpeed
      })
        .then((res) => {
          if (!this.isViewAlive(viewToken)) {
            return null;
          }
          const voiceUrl = res?.data?.voiceUrl || null;
          if (voiceUrl) {
            msg.voiceUrl = voiceUrl;
          }
          return voiceUrl;
        })
        .finally(() => {
          msg.voiceLoading = false;
          msg.voicePromise = null;
        });

      return msg.voicePromise;
    },
    startAudioPlayback(url, playbackKey = null) {
      if (!url) {
        uni.showToast({ title: this.t('conversation.noVoice'), icon: 'none' });
        return;
      }
      if (this._audioCtx) {
        this._audioCtx.stop();
        this._audioCtx.src = '';
        this._audioCtx.destroy();
      }

      this.activeVoiceMessageId = playbackKey;
      const ctx = uni.createInnerAudioContext();
      ctx.__destroyedByApp = false;
      this._audioCtx = ctx;
      ctx.src = url;
      ctx.play();
      ctx.onEnded(() => {
        if (this._audioCtx !== ctx || ctx.__destroyedByApp) return;
        ctx.__destroyedByApp = true;
        ctx.destroy();
        this._audioCtx = null;
        this.activeVoiceMessageId = null;
      });
      ctx.onError(() => {
        if (this._audioCtx !== ctx || ctx.__destroyedByApp) return;
        ctx.__destroyedByApp = true;
        ctx.destroy();
        this._audioCtx = null;
        this.activeVoiceMessageId = null;
        uni.showToast({ title: this.t('conversation.voicePlayFailed'), icon: 'none' });
      });
    },
    // 播放语音
    async playVoice(msg) {
      if (!this.pageActive || !msg || !this.canRequestVoice(msg) || msg.voiceLoading) return;
      const viewToken = this.viewToken;
      let url = this.getVoiceUrl(msg);
      if (!url) {
        const voiceUrl = await this.ensureVoiceReady(msg);
        if (!this.isViewAlive(viewToken)) return;
        if (voiceUrl) {
          url = this.getVoiceUrl(msg);
        }
      }
      if (!url) {
        uni.showToast({ title: this.t('conversation.noVoice'), icon: 'none' });
        return;
      }
      this.startAudioPlayback(url, msg.playbackKey || msg.id || null);
    },
    playUserVoice(msg) {
      const voiceUrl = msg?.localVoiceUrl || this.getVoiceUrl(msg);
      if (!voiceUrl) {
        uni.showToast({ title: this.t('conversation.voiceUnavailable'), icon: 'none' });
        return;
      }
      this.startAudioPlayback(voiceUrl, msg.playbackKey || msg.id || null);
    },
    destroyAudio() {
      if (this._audioCtx) {
        const ctx = this._audioCtx;
        ctx.__destroyedByApp = true;
        this._audioCtx = null;
        ctx.stop();
        ctx.src = '';
        ctx.destroy();
      }
      this.activeVoiceMessageId = null;
    },
    async requestAndPlayTextVoice(text, stateKey) {
      const normalizedText = normalizeText(text);
      if (!normalizedText || this[stateKey]) return;

      const viewToken = this.viewToken;
      this.destroyAudio();
      this[stateKey] = true;
      try {
        const res = await voiceApi.tts(normalizedText, {
          speed: this.voiceSpeed
        });
        if (!this.isViewAlive(viewToken)) {
          return;
        }
        const voicePath = res?.data?.url || '';
        if (!voicePath) {
          uni.showToast({ title: this.t('conversation.voiceFetchFailed'), icon: 'none' });
          return;
        }

        const ctx = uni.createInnerAudioContext();
        ctx.__destroyedByApp = false;
        this._audioCtx = ctx;
        ctx.src = resolveServiceUrl(voicePath);
        ctx.play();
        ctx.onEnded(() => {
          if (this._audioCtx !== ctx || ctx.__destroyedByApp) return;
          ctx.__destroyedByApp = true;
          ctx.destroy();
          this._audioCtx = null;
          this.activeVoiceMessageId = null;
        });
        ctx.onError(() => {
          if (this._audioCtx !== ctx || ctx.__destroyedByApp) return;
          ctx.__destroyedByApp = true;
          ctx.destroy();
          this._audioCtx = null;
          this.activeVoiceMessageId = null;
          uni.showToast({ title: this.t('conversation.voicePlayFailed'), icon: 'none' });
        });
      } catch {
        uni.showToast({ title: this.t('conversation.voiceFetchFailed'), icon: 'none' });
      } finally {
        this[stateKey] = false;
      }
    },
    syncHintFromMessages(rawMessages = []) {
      const lastAi = [...rawMessages].reverse().find((item) => item.role === 'ai');
      this.userHintIdea = lastAi?.user_hint_idea || lastAi?.userHintIdea || '';
      this.userHintIdeaCn = lastAi?.user_hint_idea_cn || lastAi?.userHintIdeaCn || this.userHintIdea;
      this.userHintExample = lastAi?.user_hint_example || lastAi?.userHintExample || lastAi?.user_hint || lastAi?.userHint || '';
      this.userHintExampleCn = lastAi?.user_hint_example_cn || lastAi?.userHintExampleCn || lastAi?.user_hint_cn || lastAi?.userHintCn || '';
      this.userHint = this.userHintExample;
      this.userHintCn = this.userHintExampleCn;
    },
    async loadSessionMessages(sessionId, options = {}) {
      const viewToken = this.viewToken;
      const msgRes = await conversationApi.getMessages(sessionId);
      if (!this.isViewAlive(viewToken)) return;
      const rawMessages = msgRes.data || [];
      this.syncMessagesFromServer(rawMessages, {
        forceScrollBottom: options.forceScrollBottom !== false
      });

      const lastMsg = this.messages[this.messages.length - 1];
      if (lastMsg && lastMsg.role === 'ai' && this.autoPlayVoice && options.autoPlayLatest !== false) {
        this.scheduleAutoPlay(() => this.playVoice(lastMsg), 300);
      }
    },
    stopAsyncMessageSync() {
      if (this.asyncSyncTimer) {
        clearTimeout(this.asyncSyncTimer);
      }
      this.asyncSyncTimer = null;
      this.asyncSyncAttempts = 0;
      this.asyncSyncTargetAiMessageId = null;
      this.asyncSyncTargetUserMessageId = null;
      this.asyncSyncHintExpected = false;
      this.asyncSyncReviewExpected = false;
      this.asyncSyncShouldStickBottom = false;
    },
    startAsyncMessageSync({
      aiMessageId = null,
      userMessageId = null,
      hintExpected = false,
      reviewExpected = false,
      stickToBottom = false
    } = {}) {
      this.stopAsyncMessageSync();
      if (!this.sessionId || (!hintExpected && !reviewExpected)) {
        return;
      }
      this.asyncSyncTargetAiMessageId = aiMessageId || null;
      this.asyncSyncTargetUserMessageId = userMessageId || null;
      this.asyncSyncHintExpected = Boolean(hintExpected);
      this.asyncSyncReviewExpected = Boolean(reviewExpected);
      this.asyncSyncShouldStickBottom = Boolean(stickToBottom);
      this.scheduleAsyncMessageSync();
    },
    scheduleAsyncMessageSync() {
      if (!this.pageActive || !this.sessionId) {
        this.stopAsyncMessageSync();
        return;
      }
      if (this.asyncSyncAttempts >= this.asyncSyncMaxAttempts) {
        this.stopAsyncMessageSync();
        return;
      }
      this.asyncSyncTimer = setTimeout(() => {
        this.runAsyncMessageSync();
      }, 1200);
    },
    async runAsyncMessageSync() {
      const sessionId = this.sessionId;
      const viewToken = this.viewToken;
      const targetAiMessageId = this.asyncSyncTargetAiMessageId;
      const targetUserMessageId = this.asyncSyncTargetUserMessageId;
      const hintExpected = this.asyncSyncHintExpected;
      const reviewExpected = this.asyncSyncReviewExpected;
      const stickToBottom = this.asyncSyncShouldStickBottom;
      this.asyncSyncTimer = null;
      this.asyncSyncAttempts += 1;

      try {
        const msgRes = await conversationApi.getMessages(sessionId);
        if (!this.isViewAlive(viewToken) || sessionId !== this.sessionId) return;

        const syncResult = this.syncMessagesFromServer(msgRes.data || [], {
          targetAiMessageId,
          targetUserMessageId,
          hintExpected,
          reviewExpected,
          stickToBottom
        });

        if (syncResult.hintReady && syncResult.reviewReady) {
          this.stopAsyncMessageSync();
          return;
        }
      } catch (error) {
        console.warn('Async conversation sync failed:', error?.message || error);
      }

      if (this.isViewAlive(viewToken) && sessionId === this.sessionId) {
        this.scheduleAsyncMessageSync();
      }
    },
    async ensureOpeningMessageIfNeeded() {
      if (!this.sessionId || this.messages.length || !this.pageActive) return;

      const viewToken = this.viewToken;
      this.isAiThinking = true;
      try {
        const res = await conversationApi.ensureOpeningMessage(this.sessionId);
        if (!this.isViewAlive(viewToken)) return;
        const data = res?.data;
        if (!data) {
          return;
        }

        const aiMessage = this.createMessageState({
          id: data.messageId || null,
          role: 'ai',
          english: data.english,
          chinese: data.chinese,
          voiceUrl: data.voiceUrl || null,
          userHintIdea: data.userHintIdea || '',
          userHintIdeaCn: data.userHintIdeaCn || '',
          userHintExample: data.userHintExample || '',
          userHintExampleCn: data.userHintExampleCn || ''
        });
        this.messages.push(aiMessage);
        this.userHintIdea = data.userHintIdea || data.userHintIdeaCn || '';
        this.userHintIdeaCn = data.userHintIdeaCn || data.userHintIdea || '';
        this.userHintExample = data.userHintExample || data.userHint || '';
        this.userHintExampleCn = data.userHintExampleCn || data.userHintCn || '';
        this.userHint = this.userHintExample;
        this.userHintCn = this.userHintExampleCn;
        this.clearReplyError();
        this.clearSessionInitError();

        if (this.autoPlayVoice) {
          this.scheduleAutoPlay(() => this.playVoice(aiMessage), 200);
        }
      } catch (e) {
        if (this.isViewAlive(viewToken)) {
          console.warn('Opening message failed:', e.message);
          this.sessionInitError = true;
          this.sessionInitErrorMessage = e.message || this.t('conversation.openingFailed');
        }
      } finally {
        if (this.isViewAlive(viewToken)) {
          this.isAiThinking = false;
          this.scrollBottom(true);
        }
      }
    },
    async initSession(options = {}) {
      const allowSubTaskFallback = options.allowSubTaskFallback !== false;
      const viewToken = this.viewToken;
      this.clearSessionInitError();
      this.clearReplyError();
      try {
        if (this.requestedSessionId) {
          try {
            const sessionRes = await conversationApi.getSession(this.requestedSessionId);
            if (!this.isViewAlive(viewToken)) return;
            const requestedSession = sessionRes?.data || null;
            if (requestedSession) {
              this.sessionId = requestedSession.id;
              this.sessionStatus = requestedSession.status || 'active';
              if (requestedSession.scenario_id && requestedSession.scenario_id !== this.currentScenario.id) {
                this.currentScenario.id = requestedSession.scenario_id;
              }
              this.currentScenario.subTaskId = requestedSession.sub_task_id || '';
              await this.loadScenarioInfo().catch(() => {});
              await this.loadSessionMessages(this.sessionId);
              await this.ensureOpeningMessageIfNeeded();
              return;
            }
          } catch (_error) {
            this.requestedSessionId = '';
          }
        }

        const latestRes = await conversationApi.getLatestSession(this.currentScenario.id);
        if (!this.isViewAlive(viewToken)) return;
        const latestSession = latestRes.data || null;

        if (latestSession) {
          this.sessionId = latestSession.id;
          this.sessionStatus = latestSession.status || 'active';
          this.currentScenario.subTaskId = latestSession.sub_task_id || '';
          await this.loadScenarioInfo().catch(() => {});
          await this.loadSessionMessages(this.sessionId);
          await this.ensureOpeningMessageIfNeeded();
          return;
        }

        const res = await conversationApi.createSession({
          scenarioId: this.currentScenario.id,
          subTaskId: this.currentScenario.subTaskId || null
        });
        if (!this.isViewAlive(viewToken)) return;
        this.sessionId = res.data.id;
        this.sessionStatus = res.data.status || 'active';
        this.currentScenario.subTaskId = res.data.subTaskId || '';
        await this.loadScenarioInfo().catch(() => {});
        this.messages = [];
        this.clearHints();
        await this.ensureOpeningMessageIfNeeded();
        this.scrollBottom(true);
      } catch (e) {
        if (!this.isViewAlive(viewToken)) return;
        if (allowSubTaskFallback && /Sub-task not found/i.test(String(e?.message || ''))) {
          this.requestedSessionId = '';
          this.currentScenario.subTaskId = '';
          await this.loadScenarioInfo().catch(() => {});
          if (!this.isViewAlive(viewToken)) return;
          return this.initSession({ allowSubTaskFallback: false });
        }
        console.warn('Session init failed:', e.message);
        this.messages = [];
        this.clearHints();
        this.sessionInitError = true;
        this.sessionInitErrorMessage = e.message || this.t('conversation.sessionLoadFailed');
      }
    },
    retryConversationInit() {
      if (this.isAiThinking) return;
      this.sessionId = null;
      this.sessionStatus = 'active';
      this.messages = [];
      this.clearHints();
      this.initSession();
    },
    scrollBottom(force = false) {
      this.$nextTick(() => {
        this.isNearChatBottom = true;
        if (force) {
          this.scrollToId = '';
          this.$nextTick(() => {
            this.scrollToId = 'chat-bottom';
          });
          return;
        }

        this.scrollToId = 'chat-bottom';
      });
    },
    clearHints() {
      this.userHint = '';
      this.userHintCn = '';
      this.userHintIdea = '';
      this.userHintIdeaCn = '';
      this.userHintExample = '';
      this.userHintExampleCn = '';
    },
    goBack() {
      this.markPageInactive();
      uni.navigateBack();
    },
    showMenu() {
      this.showConversationMenu = true;
    },
    closeConversationMenu() {
      this.showConversationMenu = false;
    },
    handleConversationMenu(action) {
      this.closeConversationMenu();
      if (action === 'restart') {
        this.handleRestart();
        return;
      }
      if (action === 'settings') {
        uni.navigateTo({ url: '/pages/profile/settings' });
      }
    },
    handleRestart() {
      if (!this.sessionId) {
        this.initSession();
        return;
      }
      this.restartDialogVisible = true;
    },
    closeRestartDialog() {
      this.restartDialogVisible = false;
    },
    closeRollbackDialog() {
      if (this.rollbackLoading) return;
      this.rollbackDialogVisible = false;
      this.rollbackTargetMessageId = null;
      this.rollbackTargetMessageText = '';
    },
    promptRollbackToMessage(message = {}, index = -1) {
      if (!this.showRollbackAction(message, index)) return;
      this.rollbackTargetMessageId = message.id || null;
      this.rollbackTargetMessageText = normalizeText(message.english || message.chinese || '');
      this.rollbackDialogVisible = true;
    },
    async confirmRollback() {
      if (!this.sessionId || !this.rollbackTargetMessageId || this.rollbackLoading) return;
      const viewToken = this.viewToken;
      const targetMessageId = this.rollbackTargetMessageId;
      this.rollbackLoading = true;
      try {
        this.destroyAudio();
        this.stopAsyncMessageSync();
        this.clearReplyError();
        this.closeCompletionDialog();
        this.closeSmartExplainSheet();
        await conversationApi.rollbackToMessage(this.sessionId, targetMessageId);
        if (!this.isViewAlive(viewToken)) return;
        this.sessionStatus = 'active';
        await this.loadSessionMessages(this.sessionId, {
          forceScrollBottom: false,
          autoPlayLatest: false
        });
        if (!this.isViewAlive(viewToken)) return;
        this.inputText = '';
        this.rollbackDialogVisible = false;
        this.rollbackTargetMessageId = null;
        this.rollbackTargetMessageText = '';
        this.scrollBottom(true);
        uni.showToast({ title: this.t('conversation.rollbackSuccess'), icon: 'success' });
      } catch (e) {
        if (!this.isViewAlive(viewToken)) return;
        uni.showToast({ title: e.message || this.t('conversation.rollbackFailed'), icon: 'none' });
      } finally {
        if (this.isViewAlive(viewToken)) {
          this.rollbackLoading = false;
        }
      }
    },
    async confirmRestart() {
      this.closeRestartDialog();
      try {
        this.destroyAudio();
        const res = await conversationApi.restartSession(this.sessionId, {
          scenarioId: this.currentScenario.id,
          subTaskId: this.currentScenario.subTaskId || null
        });
        this.sessionId = res.data.id;
        this.sessionStatus = res.data.status || 'active';
        this.currentScenario.subTaskId = res.data.subTaskId || '';
        await this.loadScenarioInfo().catch(() => {});
        this.messages = [];
        this.clearHints();
        this.inputText = '';
        this.scrollBottom(true);
        uni.showToast({ title: this.t('conversation.restarted'), icon: 'success' });
        await this.ensureOpeningMessageIfNeeded();
      } catch (e) {
        uni.showToast({ title: e.message || this.t('conversation.restartFailed'), icon: 'none' });
      }
    },
    async retryPendingReply() {
      const text = normalizeText(this.pendingReplyText);
      if (!text || !this.sessionId || this.isAiThinking || this.rollbackLoading) return;
      const viewToken = this.viewToken;
      const wasCompleted = this.sessionStatus === 'completed';
      const shouldStickBottom = this.isNearChatBottom;
      const pendingReplyMessageId = this.pendingReplyMessageId || null;
      this.isAiThinking = true;
      try {
        const res = await conversationApi.sendMessage(this.sessionId, text);
        if (!this.isViewAlive(viewToken)) return;
        const data = res.data;
        this.sessionStatus = data.isComplete ? 'completed' : 'active';
        const aiMessage = this.createMessageState({
          id: data.messageId || null,
          role: 'ai',
          english: data.english,
          chinese: data.chinese,
          voiceUrl: data.voiceUrl || null
        });
        this.messages.push(aiMessage);
        this.userHintIdea = data.userHintIdea || data.userHintIdeaCn || '';
        this.userHintIdeaCn = data.userHintIdeaCn || data.userHintIdea || '';
        this.userHintExample = data.userHintExample || data.userHint || '';
        this.userHintExampleCn = data.userHintExampleCn || data.userHintCn || '';
        this.userHint = this.userHintExample;
        this.userHintCn = this.userHintExampleCn;
        this.clearReplyError();
        if (data.isComplete && !wasCompleted) {
          this.handleScenarioCompleted(data);
        }
        this.startAsyncMessageSync({
          aiMessageId: data.messageId || null,
          userMessageId: pendingReplyMessageId || data.userFeedbackMessageId || null,
          hintExpected: Boolean(data.asyncHintPending),
          reviewExpected: Boolean(data.asyncReviewPending && this.smartExplainEnabled),
          stickToBottom: shouldStickBottom
        });
        if (this.autoPlayVoice) {
          this.scheduleAutoPlay(() => this.playVoice(aiMessage), 200);
        }
      } catch (e) {
        if (!this.isViewAlive(viewToken)) return;
        this.setReplyError(e.message || this.t('conversation.replyFailed'), {
          pendingReplyText: text,
          pendingReplyMessageId
        });
        uni.showToast({ title: this.t('common.retryLater'), icon: 'none' });
      } finally {
        if (this.isViewAlive(viewToken)) {
          this.isAiThinking = false;
          this.scrollBottom(true);
        }
      }
    },
    async submitUserMessage(rawText = '', isVoice = false, localVoiceUrl = '', voiceDuration = 0, persistedVoiceUrl = '') {
      const text = normalizeText(rawText);
      if (!text || this.isAiThinking || this.transcribingVoice || this.rollbackLoading) return;
      const viewToken = this.viewToken;
      const wasCompleted = this.sessionStatus === 'completed';
      const shouldStickBottom = this.isNearChatBottom;
      this.clearReplyError();
      const localUserMessage = this.createMessageState({
        role: 'user',
        english: text,
        chinese: '',
        isVoice,
        localVoiceUrl,
        voiceDuration,
        voiceUrl: persistedVoiceUrl,
        userInputType: isVoice ? 'voice' : 'typed'
      });
      this.messages.push(localUserMessage);
      this.inputText = '';
      this.scrollBottom(true);
      this.isAiThinking = true;
      let userMessageSaved = false;

      try {
        // 1. 先发送用户消息到后端（后端会在 AI 回复中自动生成语音）
        // 先 addMessage，再 sendMessage
        if (this.sessionStatus !== 'completed') {
          const added = await conversationApi.addMessage(this.sessionId, {
            role: 'user',
            english: text,
            chinese: '',
            voiceUrl: persistedVoiceUrl || null,
            voiceDuration: Number(voiceDuration || 0) || null,
            userInputType: isVoice ? 'voice' : 'typed'
          });
          localUserMessage.id = added?.data?.messageId || localUserMessage.id;
          await this.handleWordbookHits(text);
          userMessageSaved = true;
        }
        const res = await conversationApi.sendMessage(this.sessionId, text);
        if (!this.isViewAlive(viewToken)) return;
        const data = res.data;
        this.sessionStatus = data.isComplete ? 'completed' : 'active';
        if (this.smartExplainEnabled && data.userFeedback && (data.userFeedbackMessageId === localUserMessage.id || !data.userFeedbackMessageId)) {
          localUserMessage.feedback = data.userFeedback;
          localUserMessage.isCorrect = 0;
        }

        // 2. 添加 AI 回复到消息列表
        const aiMessage = this.createMessageState({
          id: data.messageId || null,
          role: 'ai',
          english: data.english,
          chinese: data.chinese,
          voiceUrl: data.voiceUrl || null
        });
        this.messages.push(aiMessage);
        this.userHintIdea = data.userHintIdea || data.userHintIdeaCn || '';
        this.userHintIdeaCn = data.userHintIdeaCn || data.userHintIdea || '';
        this.userHintExample = data.userHintExample || data.userHint || '';
        this.userHintExampleCn = data.userHintExampleCn || data.userHintCn || '';
        this.userHint = this.userHintExample;
        this.userHintCn = this.userHintExampleCn;
        this.clearReplyError();
        this.clearSessionInitError();
        this.startAsyncMessageSync({
          aiMessageId: data.messageId || null,
          userMessageId: localUserMessage.id || data.userFeedbackMessageId || null,
          hintExpected: Boolean(data.asyncHintPending),
          reviewExpected: Boolean(data.asyncReviewPending && this.smartExplainEnabled),
          stickToBottom: shouldStickBottom
        });
        if (data.isComplete && !wasCompleted) {
          this.handleScenarioCompleted(data);
        }

        // 3. 自动播放语音（如果设置开启）
        if (this.autoPlayVoice) {
          this.scheduleAutoPlay(() => this.playVoice(aiMessage), 200);
        }
      } catch (e) {
        if (!this.isViewAlive(viewToken)) return;
        console.warn('API call failed:', e.message);
        if (!userMessageSaved) {
          this.messages = this.messages.filter((item) => item !== localUserMessage);
          this.inputText = text;
        }
        this.setReplyError(e.message || this.t('conversation.replyFailed'), {
          pendingReplyText: userMessageSaved ? text : '',
          pendingReplyMessageId: userMessageSaved ? (localUserMessage.id || null) : null
        });
        uni.showToast({ title: userMessageSaved ? this.t('conversation.replyFailed') : this.t('common.retryLater'), icon: 'none' });
      }
      if (this.isViewAlive(viewToken)) {
        this.isAiThinking = false;
        this.scrollBottom(true);
      }
    },
    sendMessage() {
      if (this.rollbackLoading) return;
      if (this.sessionStatus === 'completed' && !this.isThemeFreeMode()) {
        uni.showToast({ title: this.t('conversation.completedGuard'), icon: 'none' });
        return;
      }
      return this.submitUserMessage(this.inputText, false);
    },
    formatDuration(seconds) {
      const m = Math.floor(seconds / 60).toString().padStart(2, '0');
      const s = (seconds % 60).toString().padStart(2, '0');
      return `${m}:${s}`;
    },
    async toggleVoiceRecording() {
      if (this.rollbackLoading) return;
      if (this.sessionStatus === 'completed' && !this.isThemeFreeMode()) {
        uni.showToast({ title: this.t('conversation.completedGuard'), icon: 'none' });
        return;
      }
      if (this.recording) {
        this.stopRec();
        return;
      }
      if (this.transcribingVoice) return;
      if (this.isAiThinking) {
        uni.showToast({ title: this.t('conversation.aiBusy'), icon: 'none' });
        return;
      }
      if (!this.sessionId) {
        uni.showToast({ title: this.t('conversation.sceneInitializing'), icon: 'none' });
        return;
      }
      const recorderReady = (this.supportsWebRecorder() && await this.initWebRecorder()) || this.initRecorder();
      if (!recorderReady) {
        uni.showToast({ title: this.t('conversation.recordingUnsupported'), icon: 'none' });
        return;
      }
      this.startRec();
    },
    startRec() {
      this.destroyAudio();
      this._ignoreNextRecordedClip = false;
      this.recordDuration = 0;
      this.recording = true;
      try {
        if (this._mediaRecorder) {
          this._mediaRecorderChunks = [];
          this._mediaRecorder.start();
          this.clearRecordTimer();
          this.recordTimerInterval = setInterval(() => {
            this.recordDuration++;
          }, 1000);
          return;
        }

        if (this._recorderManager) {
          this._recorderManager.start({
            duration: 60000,
            sampleRate: 16000,
            numberOfChannels: 1,
            encodeBitRate: 96000,
            format: 'mp3'
          });
          this.clearRecordTimer();
          this.recordTimerInterval = setInterval(() => {
            this.recordDuration++;
          }, 1000);
          return;
        }

        throw new Error('录音器不可用');
      } catch (e) {
        this.recording = false;
        this.clearRecordTimer();
        uni.showToast({ title: e.message || '无法开始录音', icon: 'none' });
      }
    },
    stopRec() {
      if (!this.recording) return;
      this.clearRecordTimer();
      try {
        if (this._recorderManager) {
          this._recorderManager.stop();
          return;
        }
        if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
          this._mediaRecorder.stop();
          return;
        }
      } catch (e) {
        this.recording = false;
        this.clearRecordTimer();
        uni.showToast({ title: e.message || '录音停止失败', icon: 'none' });
      }
    },
    cancelRec() {
      if (!this.recording) return;
      this.recording = false;
      this.transcribingVoice = false;
      this.clearRecordTimer();
      this.recordDuration = 0;
      this.stopRecordingSilently();
    },
    playDemoVoice(text = '') {
      this.requestAndPlayTextVoice(text || this.userHintExample, 'hintVoiceLoading');
    },
    copyHint() { uni.setClipboardData({ data: this.userHintExample || '' }); uni.showToast({ title: this.t('common.copied'), icon: 'none' }); },
    closeSmartExplainSheet() {
      this.showSmartExplainSheet = false;
      this.smartExplainData = {};
      this.smartExplainSourceText = '';
    },
    openUserFeedback(msg) {
      if (!this.smartExplainEnabled || !msg?.feedback?.hasIssues) return;
      this.smartExplainMode = 'user';
      this.smartExplainData = msg.feedback;
      this.smartExplainSourceText = msg.english || '';
      this.showSmartExplainSheet = true;
    },
    async openAiExplanation(msg) {
      if (!this.smartExplainEnabled) return;
      if (!msg?.id || msg.explanationLoading) return;
      if (msg.explanation) {
        this.smartExplainMode = 'ai';
        this.smartExplainData = msg.explanation;
        this.smartExplainSourceText = msg.english || '';
        this.showSmartExplainSheet = true;
        return;
      }
      const viewToken = this.viewToken;
      msg.explanationLoading = true;
      try {
        const res = await conversationApi.getMessageExplanation(this.sessionId, msg.id);
        if (!this.isViewAlive(viewToken)) return;
        msg.explanation = res?.data?.explanation || {};
        this.smartExplainMode = 'ai';
        this.smartExplainData = msg.explanation;
        this.smartExplainSourceText = msg.english || '';
        this.showSmartExplainSheet = true;
      } catch (e) {
        if (!this.isViewAlive(viewToken)) return;
        uni.showToast({ title: e.message || this.t('conversation.explanationLoadFailed'), icon: 'none' });
      } finally {
        if (this.isViewAlive(viewToken)) {
          msg.explanationLoading = false;
        }
      }
    },
    openHintComposer() {
      this.hintComposeText = '';
      this.showHintComposer = true;
    },
    closeHintComposer() {
      if (this.hintRefreshLoading) return;
      this.showHintComposer = false;
      this.hintComposeText = '';
    },
    applyHintPayload(data = {}) {
      this.destroyAudio();
      this.userHintIdea = data.userHintIdea || data.userHintIdeaCn || '';
      this.userHintIdeaCn = data.userHintIdeaCn || data.userHintIdea || '';
      this.userHintExample = data.userHintExample || data.userHint || '';
      this.userHintExampleCn = data.userHintExampleCn || data.userHintCn || '';
      this.userHint = this.userHintExample;
      this.userHintCn = this.userHintExampleCn;

      const targetMessageId = data.messageId || null;
      const lastAiMessage = targetMessageId
        ? [...this.messages].reverse().find((item) => String(item.id || '') === String(targetMessageId))
        : [...this.messages].reverse().find((item) => item.role === 'ai');
      if (lastAiMessage) {
        lastAiMessage.userHintIdea = this.userHintIdea;
        lastAiMessage.userHintIdeaCn = this.userHintIdeaCn;
        lastAiMessage.userHintExample = this.userHintExample;
        lastAiMessage.userHintExampleCn = this.userHintExampleCn;
        lastAiMessage.user_hint_idea = this.userHintIdea;
        lastAiMessage.user_hint_idea_cn = this.userHintIdeaCn;
        lastAiMessage.user_hint_example = this.userHintExample;
        lastAiMessage.user_hint_example_cn = this.userHintExampleCn;
      }
    },
    async refreshHintExample(extraWish = '') {
      if (!this.sessionId || this.hintRefreshLoading) return;
      if (!this.userHintExample && !this.userHintIdea) {
        uni.showToast({ title: this.t('conversation.noHintToRefresh'), icon: 'none' });
        return;
      }
      const viewToken = this.viewToken;
      this.hintRefreshLoading = true;
      try {
        const res = await conversationApi.regenerateHintExample(this.sessionId, { extraWish });
        if (!this.isViewAlive(viewToken)) return;
        this.applyHintPayload(res?.data || {});
        if (extraWish) {
          this.showHintComposer = false;
          this.hintComposeText = '';
        }
        uni.showToast({ title: this.t('conversation.hintUpdated'), icon: 'none' });
      } catch (e) {
        if (!this.isViewAlive(viewToken)) return;
        uni.showToast({ title: e.message || '刷新例句失败', icon: 'none' });
      } finally {
        if (this.isViewAlive(viewToken)) {
          this.hintRefreshLoading = false;
        }
      }
    },
    submitHintComposer() {
      const extraWish = normalizeText(this.hintComposeText);
      this.refreshHintExample(extraWish);
    },
    findContextByWord(word, preferredContext = '') {
      if (preferredContext) return preferredContext;
      const target = String(word || '').toLowerCase();
      if (!target) return '';

      const matchedMessage = this.messages.find((message) => {
        if (!message.english) return false;
        const words = message.english
          .split(/\s+/)
          .map((item) => this.extractCleanWord(item).toLowerCase())
          .filter(Boolean);
        return words.includes(target);
      });

      return matchedMessage?.english || '';
    },
    async playSelectedWordVoice() {
      this.requestAndPlayTextVoice(this.selectedWord, 'selectedWordVoiceLoading');
    },
    async syncBookmarkState(word) {
      if (!word) {
        this.isSaved = false;
        return;
      }

      try {
        const res = await bookmarkApi.check(word);
        this.isSaved = Boolean(res?.data?.exists);
      } catch {
        this.isSaved = false;
      }
    },
    async onWordClick(word, preferredContext = '') {
      if (!word) return;
      this.selectedWord = word;
      this.selectedWordContext = preferredContext || '';
      this.showWordPopup = true;
      this.wordLoading = true;
      this.wordLoadFailed = false;
      this.isSaved = false;
      this.wordData = this.normalizeWordData({
        phonetic: '',
        definitionCn: this.t('common.loadingDots'),
        provider: 'ai-structured',
        providerLabel: `正在生成${this.learningLanguageLabel}词卡`
      });
      const context = this.findContextByWord(word, preferredContext);
      this.selectedWordContext = context;
      try {
        if (this.sessionId) {
          wordApi.logClick({
            word,
            sessionId: this.sessionId,
            scenarioId: this.currentScenario.id,
            context
          }).catch(() => {});
        }

        const res = await wordApi.getDetail(word, context, {
          scenarioId: this.currentScenario.id,
          subScenarioId: this.currentScenario.subTaskId || ''
        });
        if (res.data) {
          this.wordData = this.normalizeWordData(res.data);
        }
        await this.syncBookmarkState(word);
      } catch {
        this.wordLoadFailed = true;
        this.wordData = this.normalizeWordData({
          definitionCn: this.t('conversation.wordCardFallback'),
          usageNotes: [this.t('common.retryLater')],
          provider: 'ai-fallback',
          providerLabel: this.t('conversation.wordCardLoadFailed')
        });
      } finally {
        this.wordLoading = false;
      }
    },
    async toggleSave() {
      if (!this.selectedWord || this.wordLoading || this.bookmarkLoading) return;

      this.bookmarkLoading = true;
      try {
        if (this.isSaved) {
          await bookmarkApi.remove(this.selectedWord);
          this.isSaved = false;
          if (this.isWordbookScenario()) {
            await this.loadWordbookTargets();
          }
          uni.showToast({ title: this.t('conversation.bookmarkRemoved'), icon: 'none' });
          return;
        }

        await bookmarkApi.add({
          word: this.selectedWord,
          phonetic: this.wordData.phonetic,
          partOfSpeech: this.wordData.partOfSpeech,
          definitionCn: this.wordData.definitionCn,
          definitionEn: '',
          exampleSentence: this.wordData.exampleSentences,
          wordRoot: this.wordData.wordRoot,
          sourceScenarioId: this.currentScenario.id,
          sourceSentence: this.selectedWordContext,
          tags: this.wordData.synonyms.slice(0, 4)
        });
        this.isSaved = true;
        if (this.isWordbookScenario()) {
          await this.loadWordbookTargets();
        }
        uni.showToast({ title: this.t('conversation.bookmarkAdded'), icon: 'success' });
      } catch (e) {
        uni.showToast({ title: e.message || this.t('conversation.bookmarkFailed'), icon: 'none' });
      } finally {
        this.bookmarkLoading = false;
      }
    }
  },
  onHide() {
    this.markPageInactive();
  },
  onUnload() {
    this.markPageInactive();
  }
};
</script>

<style scoped>
.conversation-page { --conv-safe-top: var(--status-bar-height, 44px); --conv-nav-height: 44px; --conv-top-height: calc(var(--conv-safe-top) + var(--conv-nav-height)); display:flex; flex-direction:column; height:100vh; background:#fff; overflow:hidden; }
.conversation-top { position:fixed; top:0; left:0; right:0; z-index:80; background:rgba(255,255,255,0.92); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); border-bottom:1px solid #eee; }
.conv-nav { padding-top:var(--conv-safe-top); }
.conv-nav .nav-inner { display:flex; align-items:center; height:var(--conv-nav-height); padding:0 14px; }
.conv-nav .nav-back { width:36px; height:36px; display:flex; align-items:center; justify-content:center; font-size:20px; color:#000; border-radius:6px; }
.conv-nav .nav-back:active { background:#f0f0f0; }
.conv-nav .nav-center { flex:1; text-align:center; }
.conv-nav .nav-title { display:block; font-size:16px; font-weight:600; color:#000; }
.conv-nav .nav-subtitle { display:block; font-size:11px; color:#999; margin-top:1px; }
.wordbook-banner { margin:0 0 2px; padding:12px 14px; border-radius:16px; background:#f5f5f5; }
.wordbook-banner-text { display:block; font-size:12px; color:#666; }
.wordbook-panel { margin:0 0 2px; padding:14px; border-radius:18px; background:linear-gradient(180deg,#111827 0%,#1f2937 100%); box-shadow:0 12px 28px rgba(15,23,42,0.18); }
.wordbook-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
.wordbook-title { display:block; font-size:18px; font-weight:700; color:#fff; }
.wordbook-subtitle { display:block; margin-top:6px; font-size:12px; line-height:1.7; color:rgba(255,255,255,0.7); }
.wordbook-empty { margin-top:12px; padding:14px; border-radius:14px; background:rgba(255,255,255,0.08); }
.wordbook-empty-text { display:block; font-size:12px; line-height:1.7; color:rgba(255,255,255,0.74); }
.conversation-error-card,
.conversation-error-inline { padding:14px; border-radius:16px; background:#fff7ed; border:1px solid #fed7aa; }
.conversation-error-inline { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.conversation-error-copy { flex:1; display:flex; flex-direction:column; gap:4px; }
.conversation-error-title { font-size:14px; font-weight:700; color:#9a3412; }
.conversation-error-title.small { font-size:13px; }
.conversation-error-text { font-size:12px; line-height:1.6; color:#9a3412; }
.conversation-error-text.small,
.conversation-error-sub { font-size:11px; line-height:1.6; color:#c2410c; }
.conversation-error-btn { display:inline-flex; align-items:center; justify-content:center; margin-top:10px; padding:8px 12px; border-radius:999px; background:#111827; color:#fff; font-size:12px; font-weight:600; }
.conversation-error-btn.inline { margin-top:0; flex-shrink:0; }
.chat-area { flex:1; min-height:0; margin-top:var(--conv-top-height); overflow:hidden; }
.chat-inner { padding:12px 16px 16px; display:flex; flex-direction:column; gap:12px; box-sizing:border-box; }
.msg { display:flex; gap:6px; max-width:88%; }
.msg-ai { align-self:flex-start; }
.msg-user { align-self:flex-end; flex-direction:row-reverse; }
.msg-label { width:24px; height:24px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:600; flex-shrink:0; margin-top:6px; background:#000; color:#fff; }
.user-label { background:#e5e5e5; color:#000; }
.msg-body { display:flex; flex-direction:column; }
.msg-user .msg-body { align-items:flex-end; }
.msg-bubble { padding:10px 14px; border-radius:14px; line-height:1.5; }
.msg-ai .msg-bubble { background:#f5f5f5; border-bottom-left-radius:4px; }
.msg-user .msg-bubble { background:#000; border-bottom-right-radius:4px; }
.msg-english { font-size:15px; display:inline; }
.msg-ai .msg-english { color:#000; }
.msg-user .msg-english { color:#fff; }
.voice-msg-card { min-width:156px; max-width:260px; padding:10px 14px; border-radius:14px; border-bottom-right-radius:4px; background:#000; color:#fff; }
.voice-msg-main { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.voice-msg-wave { display:flex; align-items:flex-end; gap:3px; height:18px; }
.voice-bar { width:3px; border-radius:999px; background:rgba(255,255,255,0.9); }
.voice-bar:nth-child(1) { height:7px; opacity:0.65; }
.voice-bar:nth-child(2) { height:13px; opacity:0.82; }
.voice-bar:nth-child(3) { height:18px; }
.voice-bar:nth-child(4) { height:13px; opacity:0.82; }
.voice-bar:nth-child(5) { height:7px; opacity:0.65; }
.voice-msg-wave.active .voice-bar { animation:voiceWave 0.9s ease-in-out infinite; }
.voice-msg-wave.active .voice-bar:nth-child(2) { animation-delay:0.15s; }
.voice-msg-wave.active .voice-bar:nth-child(3) { animation-delay:0.3s; }
.voice-msg-wave.active .voice-bar:nth-child(4) { animation-delay:0.45s; }
.voice-msg-wave.active .voice-bar:nth-child(5) { animation-delay:0.6s; }
.voice-msg-duration { font-size:12px; color:rgba(255,255,255,0.78); font-variant-numeric:tabular-nums; }
.voice-msg-tip { display:block; margin-top:6px; font-size:11px; color:rgba(255,255,255,0.82); }
.voice-msg-transcript { display:block; margin-top:6px; font-size:11px; line-height:1.5; color:rgba(255,255,255,0.62); }
@keyframes voiceWave {
  0%, 100% { transform:scaleY(0.7); opacity:0.72; }
  50% { transform:scaleY(1.15); opacity:1; }
}
.msg-word { transition:opacity 0.15s; }
.msg-ai .msg-word:active { opacity:0.5; }
.msg-user .msg-word:active { opacity:0.7; }
.msg-chinese { display:block; font-size:12px; margin-top:3px; }
.msg-ai .msg-chinese { color:#999; }
.msg-user .msg-chinese { color:rgba(255,255,255,0.6); }
.msg-actions { display:flex; padding:6px 4px 0; }
.msg-user .msg-actions { justify-content:flex-end; }
.msg-action-group { display:inline-flex; align-items:center; gap:6px; background:#fff; padding:3px 6px; border-radius:10px; border:1px solid #f0f0f0; box-shadow:0 2px 6px rgba(0,0,0,0.02); }
.msg-action-btn { display:flex; align-items:center; gap:3px; padding:3px 8px; border-radius:6px; transition:all 0.15s; }
.msg-action-btn:active { background:#f5f5f5; }
.msg-action-btn.disabled { opacity:0.45; pointer-events:none; }
.msg-action-btn .icon { font-size:12px; }
.msg-action-btn .label { font-size:11px; font-weight:600; color:#333; }
.msg-action-btn.play { background:#f8f8f8; }
.msg-action-btn.explain { background:#fff7ed; border:1px solid #ffedd5; }
.msg-action-btn.explain .label { color:#c2410c; }
.msg-action-btn.rollback { background:#eff6ff; border:1px solid #dbeafe; }
.msg-action-btn.rollback .label { color:#1d4ed8; }
.msg-feedback-card { margin-top:6px; max-width:260px; padding:10px 12px; border-radius:12px; background:#fff7ed; border:1px solid #fed7aa; }
.msg-feedback-title { display:block; font-size:12px; font-weight:600; color:#9a3412; }
.msg-feedback-sub { display:block; margin-top:4px; font-size:11px; line-height:1.5; color:#c2410c; }
.loading-ai { align-self:flex-start; display:flex; gap:6px; }
.ldot { width:24px; height:24px; border-radius:6px; background:#000; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:600; color:#fff; flex-shrink:0; margin-top:6px; }
.lbubble { background:#f5f5f5; padding:12px 16px; border-radius:12px; border-bottom-left-radius:4px; }
.ldots { display:flex; gap:4px; }
.ldot-anim { width:7px; height:7px; border-radius:50%; background:#000; animation:bounce 1.4s infinite ease-in-out both; }
.ldot-anim:nth-child(1) { animation-delay:-0.32s; }
.ldot-anim:nth-child(2) { animation-delay:-0.16s; }
@keyframes bounce { 0%,80%,100% { transform:scale(0); } 40% { transform:scale(1); } }
.hint-card { background:#f9f9f9; border:1px solid #eee; border-radius:12px; padding:14px 16px; width:100%; }
.hint-section + .hint-section { margin-top:12px; padding-top:12px; border-top:1px solid #ececec; }
.hint-row { display:flex; align-items:center; gap:5px; margin-bottom:8px; }
.hint-dot { width:5px; height:5px; border-radius:50%; background:#000; }
.hint-label { font-size:10px; font-weight:600; color:#666; }
.hint-idea { display:block; font-size:14px; color:#333; line-height:1.6; }
.hint-en { display:block; font-size:15px; font-weight:600; color:#000; font-style:italic; margin-bottom:3px; line-height:1.7; }
.hint-word { transition:opacity 0.15s; }
.hint-word:active { opacity:0.5; }
.hint-cn { display:block; font-size:12px; color:#999; margin-bottom:10px; }
.hint-actions { display:flex; gap:8px; }
.hint-btn { padding:6px 14px; background:#fff; border:1px solid #eee; border-radius:8px; font-size:11px; color:#000; transition:all 0.1s; }
.hint-btn.icon-only { padding:0; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:50%; }
.hint-btn.icon-only .icon { font-size:16px; }
.hint-btn:active { background:#f0f0f0; }
.hint-btn.disabled { opacity:0.45; pointer-events:none; }
.free-mode-banner { padding:12px 14px; border-radius:14px; background:#f8fafc; border:1px solid #e7edf5; display:flex; align-items:center; gap:12px; }
.free-mode-copy { flex:1; min-width:0; }
.free-mode-title { display:block; font-size:14px; font-weight:700; color:#111827; }
.free-mode-desc { display:block; margin-top:4px; font-size:12px; line-height:1.5; color:#667085; }
.free-mode-btn { flex-shrink:0; padding:10px 12px; border-radius:999px; background:#111827; color:#fff; font-size:12px; font-weight:600; }
.toolbar-wrapper { padding:8px 14px 0; background:#f9f9f9; }
.toolbar { display:flex; align-items:center; justify-content:space-around; gap:6px; padding:6px; background:#fff; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.02); }
.toolbar-item { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; padding:6px 0; border-radius:8px; transition:all 0.15s; background:#f9f9f9; color:#999; }
.toolbar-item.active { background:#eef2ff; color:#3b82f6; }
.toolbar-item:active { opacity:0.8; }
.toolbar-icon { font-size:16px; display:flex; align-items:center; justify-content:center; }
.toolbar-label { font-size:10px; font-weight:600; }
.input-bar { flex-shrink:0; display:flex; align-items:center; gap:10px; padding:10px 14px; padding-bottom:calc(10px + env(safe-area-inset-bottom,0px)); background:#f9f9f9; border-top:1px solid #eee; position:relative; z-index:1000; }
.mode-toggle { width:38px; height:38px; display:flex; align-items:center; justify-content:center; background:#fff; border:1px solid #e0e0e0; border-radius:50%; font-size:18px; flex-shrink:0; transition:background 0.15s; }
.mode-toggle:active { background:#eee; }
.voice-btn-wrapper { flex:1; }
.voice-cta-btn { width:100%; height:42px; display:flex; align-items:center; justify-content:center; background:#fff; border:1px solid #e0e0e0; border-radius:21px; font-size:15px; font-weight:600; color:#333; transition:all 0.15s; user-select:none; -webkit-user-select:none; touch-action:none; cursor:pointer; }
.voice-cta-text { display:block; color:inherit; font-size:15px; font-weight:600; line-height:1; }
.voice-cta-btn:active { background:#e5e5e5; }
.voice-cta-btn.recording { background:#007aff; color:#fff; border-color:#007aff; box-shadow:0 4px 12px rgba(0,122,255,0.3); }
.voice-cta-btn.busy { opacity:0.6; }
.text-entry { flex:1; display:flex; align-items:center; gap:8px; }
.input-wrap { flex:1; height:42px; display:flex; align-items:center; background:#fff; border:1px solid #e0e0e0; border-radius:21px; padding:0 14px; min-width:0; }
.input-field { flex:1; font-size:15px; color:#000; background:transparent; border:none; outline:none; }
.send-btn { width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:#eee; transition:all 0.15s; }
.send-btn.active { background:#000; }
.send-btn text { font-size:17px; color:#fff; }
.send-btn:not(.active) text { color:#bbb; }
.record-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:transparent; display:flex; align-items:center; justify-content:center; z-index:999; pointer-events:none; }
.record-box { width:160px; height:160px; padding:16px; box-sizing:border-box; background:rgba(30,30,30,0.45); border-radius:24px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; transition:all 0.2s; pointer-events:auto; box-shadow:0 8px 32px rgba(0,0,0,0.08); }
.record-ripple { position:relative; width:60px; height:60px; display:flex; align-items:center; justify-content:center; margin-bottom:14px; }
.record-cancel-btn { position:relative; z-index:2; width:56px; height:56px; border-radius:50%; background:rgba(220,53,69,0.45); border:1px solid rgba(220,53,69,0.3); display:flex; align-items:center; justify-content:center; pointer-events:auto; box-shadow:0 4px 12px rgba(220,53,69,0.2); }
.record-cancel-btn:active { background:rgba(220,53,69,0.65); transform:scale(0.95); }
.record-icon { font-size:24px; color:#fff; position:relative; z-index:2; font-weight:300; }
.ripple-circle { position:absolute; top:0; left:0; right:0; bottom:0; background:rgba(220,53,69,0.25); border-radius:50%; animation:ripple 1.5s infinite ease-out; }
.ripple-circle.delay { animation-delay:0.75s; }
@keyframes ripple { 0% { transform:scale(1); opacity:1; } 100% { transform:scale(1.8); opacity:0; } }
.record-timer { font-size:18px; font-weight:600; font-variant-numeric:tabular-nums; letter-spacing:0.5px; margin-bottom:4px; text-shadow:0 1px 3px rgba(0,0,0,0.8); }
.record-hint-text { font-size:11px; color:#fff; font-weight:500; margin-top:4px; text-align:center; text-shadow:0 1px 3px rgba(0,0,0,0.8); }
.menu-sheet-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.22); display:flex; align-items:flex-end; z-index:1080; }
.menu-sheet { width:100%; padding:10px 16px calc(16px + env(safe-area-inset-bottom,0px)); background:#f8fafc; border-radius:24px 24px 0 0; box-sizing:border-box; }
.menu-sheet-handle { width:42px; height:5px; border-radius:999px; background:#d0d5dd; margin:0 auto 14px; }
.menu-sheet-head { padding:0 4px 14px; }
.menu-sheet-title { display:block; font-size:18px; font-weight:700; color:#111827; }
.menu-sheet-subtitle { display:block; margin-top:6px; font-size:12px; line-height:1.6; color:#667085; }
.menu-sheet-list { display:flex; flex-direction:column; gap:10px; }
.menu-sheet-item { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px; border-radius:18px; background:#fff; box-shadow:0 10px 24px rgba(15,23,42,0.06); }
.menu-sheet-item:active { background:#fdfdfd; }
.menu-sheet-item-main { flex:1; min-width:0; }
.menu-sheet-item-title { display:block; font-size:15px; font-weight:700; color:#111827; }
.menu-sheet-item-desc { display:block; margin-top:4px; font-size:12px; line-height:1.6; color:#667085; }
.menu-sheet-item-arrow { width:36px; height:36px; border-radius:12px; display:flex; align-items:center; justify-content:center; background:#f3f4f6; color:#111827; font-size:16px; flex-shrink:0; }
.menu-sheet-cancel { margin-top:12px; height:48px; border-radius:16px; background:#fff; display:flex; align-items:center; justify-content:center; box-shadow:0 10px 24px rgba(15,23,42,0.05); }
.menu-sheet-cancel:active { background:#fdfdfd; }
.menu-sheet-cancel-text { font-size:15px; font-weight:700; color:#111827; }
.hint-compose-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.22); display:flex; align-items:flex-end; z-index:1100; }
.hint-compose-sheet { width:100%; padding:18px 16px calc(16px + env(safe-area-inset-bottom,0px)); background:#fff; border-radius:18px 18px 0 0; box-sizing:border-box; }
.hint-compose-title { display:block; font-size:16px; font-weight:700; color:#111827; }
.hint-compose-subtitle { display:block; margin-top:6px; font-size:12px; color:#667085; }
.hint-compose-input { width:100%; min-height:96px; margin-top:14px; padding:12px 14px; box-sizing:border-box; border-radius:14px; background:#f8fafc; border:1px solid #e5e7eb; font-size:14px; color:#111827; }
.hint-compose-actions { display:flex; gap:10px; margin-top:14px; }
.hint-compose-btn { flex:1; height:42px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:600; }
.hint-compose-btn.light { background:#f3f4f6; color:#111827; }
.hint-compose-btn.dark { background:#111827; color:#fff; }
.hint-compose-btn.disabled { opacity:0.5; pointer-events:none; }
.smart-sheet-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.18); display:flex; z-index:1150; }
.smart-sheet-overlay.mode-ai { justify-content:flex-start; }
.smart-sheet-overlay.mode-user { justify-content:flex-end; }
.smart-sheet { width:min(88vw, 420px); height:100vh; background:#fff; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 24px 48px rgba(15,23,42,0.18); }
.smart-sheet.from-left { border-radius:0 24px 24px 0; animation:smartDrawerInLeft 0.18s ease-out; }
.smart-sheet.from-right { border-radius:24px 0 0 24px; animation:smartDrawerInRight 0.18s ease-out; }
.smart-sheet-head { display:flex; align-items:center; justify-content:space-between; padding:16px; border-bottom:1px solid #f1f5f9; }
.smart-sheet-title { font-size:16px; font-weight:700; color:#111827; }
.smart-sheet-close { width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:#f3f4f6; color:#111827; }
.smart-sheet-body { flex:1; min-height:0; padding:16px; box-sizing:border-box; }
.smart-source-card { padding:12px 14px; border-radius:14px; background:#f8fafc; border:1px solid #e5e7eb; margin-bottom:14px; }
.smart-source-label { display:block; font-size:11px; font-weight:700; color:#94a3b8; letter-spacing:0.4px; }
.smart-source-text { display:block; margin-top:6px; font-size:14px; line-height:1.7; color:#111827; }
.smart-block + .smart-block { margin-top:14px; }
.smart-block-title { display:block; font-size:12px; font-weight:700; color:#64748b; margin-bottom:8px; }
.smart-block-text { display:block; font-size:14px; line-height:1.8; color:#111827; }
.smart-list-card { padding:12px 14px; border-radius:14px; background:#f8fafc; border:1px solid #e5e7eb; }
.smart-list-card + .smart-list-card { margin-top:8px; }
.smart-list-key { display:block; font-size:14px; font-weight:700; color:#111827; }
.smart-list-text { display:block; margin-top:6px; font-size:13px; line-height:1.7; color:#334155; }
.smart-list-sub { display:block; margin-top:6px; font-size:12px; line-height:1.6; color:#475569; }
.smart-list-example { display:block; margin-top:8px; font-size:13px; line-height:1.7; color:#111827; font-style:italic; }
@keyframes smartDrawerInLeft {
  from { transform:translateX(-24px); opacity:0; }
  to { transform:translateX(0); opacity:1; }
}
@keyframes smartDrawerInRight {
  from { transform:translateX(24px); opacity:0; }
  to { transform:translateX(0); opacity:1; }
}
.overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.4); display:flex; align-items:flex-end; z-index:1000; }
.sheet { width:100%; height:78vh; max-height:calc(100vh - 24px); background:#fff; border-radius:22px 22px 0 0; overflow:hidden; display:flex; flex-direction:column; box-sizing:border-box; }
.sheet-handle { display:flex; justify-content:center; padding:12px 0 4px; }
.handle-bar { width:32px; height:4px; background:#ddd; border-radius:2px; }
.sheet-body { flex:1; min-height:0; height:0; box-sizing:border-box; padding:0 20px 28px; }
.sheet-footer { flex-shrink:0; padding:12px 20px calc(12px + env(safe-area-inset-bottom,0px)); border-top:1px solid #eee; background:#fff; }
.word-hero { text-align:center; padding:12px 0 20px; }
.word-hero-text { display:block; font-size:28px; font-weight:700; color:#000; }
.word-hero-phonetic { display:block; font-size:14px; color:#999; margin-top:4px; }
.word-meta { display:block; font-size:11px; color:#666; margin-top:8px; }
.word-status { display:block; font-size:12px; color:#999; margin-top:6px; }
.word-status.error { color:#d14b4b; }
.def-section { margin-bottom:20px; }
.def-label { display:block; font-size:10px; font-weight:600; color:#999; letter-spacing:1px; margin-bottom:6px; }
.def-text { display:block; font-size:15px; color:#000; line-height:1.5; }
.tag-row { display:flex; flex-wrap:wrap; gap:8px; }
.tag-chip { display:inline-flex; align-items:center; justify-content:center; padding:6px 10px; border-radius:999px; background:#111; color:#fff; font-size:12px; line-height:1; }
.tag-chip.light { background:#f3f3f3; color:#333; }
.bullet-line { display:block; font-size:14px; color:#333; line-height:1.6; margin-top:4px; }
.ex-section { margin-bottom:20px; }
.ex-label { display:block; font-size:10px; font-weight:600; color:#999; letter-spacing:1px; margin-bottom:8px; }
.ex-item { padding:10px 12px; background:#f9f9f9; border-radius:8px; margin-bottom:6px; }
.ex-en { display:block; font-size:14px; color:#000; font-style:italic; line-height:1.7; }
.example-word { transition:opacity 0.15s; }
.example-word:active { opacity:0.5; }
.ex-cn { display:block; font-size:12px; color:#666; margin-top:2px; }
.empty-card { padding:12px; background:#f9f9f9; border-radius:8px; }
.empty-card-text { display:block; font-size:12px; color:#999; text-align:center; }
.actions { display:flex; gap:8px; }
.action-btn { flex:1; height:44px; display:flex; align-items:center; justify-content:center; border-radius:10px; font-size:14px; font-weight:500; transition:all 0.1s; }
.action-btn:active { transform:scale(0.97); }
.action-btn.primary { background:#000; color:#fff; }
.action-btn.outline { border:1px solid #e5e5e5; color:#000; }
.action-btn.outline:active { background:#f9f9f9; }
.action-btn.disabled { opacity:0.45; pointer-events:none; }
.custom-dialog-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.4); display:flex; align-items:center; justify-content:center; z-index:1200; padding:32px; box-sizing:border-box; }
.custom-dialog { width:100%; max-width:320px; background:#fff; border-radius:24px; overflow:hidden; box-shadow:0 24px 48px rgba(15,23,42,0.18); display:flex; flex-direction:column; animation:dialogPopIn 0.2s ease-out; }
.custom-dialog-head { padding:24px 20px 8px; text-align:center; }
.custom-dialog-title { font-size:18px; font-weight:700; color:#111827; }
.custom-dialog-body { padding:0 20px 24px; text-align:center; }
.custom-dialog-message { font-size:14px; line-height:1.6; color:#667085; }
.custom-dialog-actions { display:flex; padding:0 16px 16px; gap:12px; }
.custom-dialog-btn { flex:1; height:48px; border-radius:14px; display:flex; align-items:center; justify-content:center; font-size:15px; font-weight:700; transition:all 0.1s; }
.custom-dialog-btn.cancel { background:#f3f4f6; color:#475569; }
.custom-dialog-btn.cancel:active { background:#e2e8f0; }
.custom-dialog-btn.confirm { background:#ef4444; color:#fff; }
.custom-dialog-btn.confirm:active { background:#dc2626; }
.custom-dialog-btn.primary { background:#111827; color:#fff; }
.custom-dialog-btn.primary:active { background:#1f2937; }
.custom-dialog-btn.disabled { opacity:0.6; pointer-events:none; }
.rollback-preview { margin-top:14px; padding:12px; border-radius:14px; background:#f8fafc; border:1px solid #e2e8f0; text-align:left; }
.rollback-preview-label { display:block; margin-bottom:6px; font-size:12px; font-weight:600; color:#475569; }
.rollback-preview-text { display:block; font-size:13px; line-height:1.6; color:#111827; word-break:break-word; }
@keyframes dialogPopIn {
  from { transform:scale(0.96); opacity:0; }
  to { transform:scale(1); opacity:1; }
}
</style>
