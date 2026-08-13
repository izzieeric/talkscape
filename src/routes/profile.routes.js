const Router = require('@koa/router');
const profileController = require('../controllers/profile.controller');
const { requireAuth } = require('../middleware/auth');
const { withHttpBasePath } = require('../config/http-paths');

const router = new Router({ prefix: withHttpBasePath('/api/profile') });

router.use(requireAuth);

router.get('/me', profileController.getMe);
router.put('/me', profileController.updateMe);
router.get('/history', profileController.getHistory);

module.exports = router;
