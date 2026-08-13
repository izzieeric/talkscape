const Router = require('@koa/router');
const scenarioController = require('../controllers/scenario.controller');
const { requireAuth } = require('../middleware/auth');
const { withHttpBasePath } = require('../config/http-paths');

const router = new Router({ prefix: withHttpBasePath('/api/scenarios') });

router.get('/', scenarioController.getAll);
router.get('/mine', requireAuth, scenarioController.getMine);
router.get('/progress', requireAuth, scenarioController.getProgress);
router.post('/mine', requireAuth, scenarioController.addMine);
router.delete('/mine/:scenarioId', requireAuth, scenarioController.removeMine);
router.get('/:id/prompt-config', scenarioController.getPromptConfig);
router.put('/:id/prompt-config', requireAuth, scenarioController.savePromptConfig);
router.get('/:id', scenarioController.getById);
router.get('/:id/config', scenarioController.getConfig);

module.exports = router;
