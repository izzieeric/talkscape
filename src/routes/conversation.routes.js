const Router = require('@koa/router');
const conversationController = require('../controllers/conversation.controller');
const { requireAuth } = require('../middleware/auth');
const { createUserRateLimit } = require('../middleware/rate-limit');
const rateLimitConfig = require('../config/rate-limit-config');
const { withHttpBasePath } = require('../config/http-paths');

const router = new Router({ prefix: withHttpBasePath('/api/conversations') });
const sendMessageRateLimit = createUserRateLimit(rateLimitConfig.routes.conversationSend);
const messageExplanationRateLimit = createUserRateLimit(rateLimitConfig.routes.messageExplanation);

router.use(requireAuth);

// 会话管理
router.post('/sessions', conversationController.createSession);
router.get('/sessions/latest', conversationController.getLatestSession);
router.get('/sessions/:id', conversationController.getSession);
router.put('/sessions/:id/complete', conversationController.completeSession);
router.post('/sessions/:id/restart', conversationController.restartSession);
router.get('/sessions/:id/result', conversationController.getResult);

// 消息
router.post('/sessions/:id/messages', conversationController.addMessage);
router.get('/sessions/:id/messages', conversationController.getMessages);
router.post('/sessions/:id/messages/:messageId/rollback', conversationController.rollbackToMessage);
router.post('/sessions/:id/opening', conversationController.ensureOpeningMessage);
router.post('/sessions/:id/messages/:messageId/voice', conversationController.ensureMessageVoice);
router.get('/sessions/:id/messages/:messageId/explanation', messageExplanationRateLimit, conversationController.getMessageExplanation);
router.post('/sessions/:id/hint-example', conversationController.regenerateHintExample);
router.post('/sessions/:id/send', sendMessageRateLimit, conversationController.sendMessage);

module.exports = router;
