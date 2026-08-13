const Router = require('@koa/router');
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');
const { withHttpBasePath } = require('../config/http-paths');

const router = new Router({ prefix: withHttpBasePath('/api/auth') });

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', requireAuth, authController.me);

module.exports = router;
