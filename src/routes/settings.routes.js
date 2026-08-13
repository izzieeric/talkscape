const Router = require('@koa/router');
const settingsController = require('../controllers/settings.controller');
const { requireAuth } = require('../middleware/auth');
const { withHttpBasePath } = require('../config/http-paths');

const router = new Router({ prefix: withHttpBasePath('/api/settings') });

router.use(requireAuth);

router.get('/', settingsController.get);
router.put('/', settingsController.update);

module.exports = router;
