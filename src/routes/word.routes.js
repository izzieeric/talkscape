const Router = require('@koa/router');
const wordController = require('../controllers/word.controller');
const { attachUser, requireAuth } = require('../middleware/auth');
const { withHttpBasePath } = require('../config/http-paths');

const router = new Router({ prefix: withHttpBasePath('/api/words') });

router.get('/detail', attachUser, wordController.getDetail);
router.post('/click', requireAuth, wordController.logClick);

module.exports = router;
