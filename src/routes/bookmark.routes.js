const Router = require('@koa/router');
const bookmarkController = require('../controllers/bookmark.controller');
const { requireAuth } = require('../middleware/auth');
const { withHttpBasePath } = require('../config/http-paths');

const router = new Router({ prefix: withHttpBasePath('/api/bookmarks') });

router.use(requireAuth);

router.get('/', bookmarkController.getAll);
router.post('/', bookmarkController.add);
router.post('/review-success', bookmarkController.recordWordbookSuccesses);
router.put('/:word/practiced', bookmarkController.markPracticed);
router.put('/:word/active', bookmarkController.reactivate);
router.delete('/:word', bookmarkController.remove);
router.get('/check/:word', bookmarkController.check);

module.exports = router;
