const Router = require('@koa/router');
const controller = require('../controllers/tsadmin.controller');
const { attachAdminUser, requireAdminPageAuth } = require('../middleware/admin-auth');
const { TSADMIN_BASE_PATH } = require('../../config/http-paths');

const router = new Router({ prefix: TSADMIN_BASE_PATH });

router.use(attachAdminUser);

router.get('/login', controller.loginPage);
router.post('/login', controller.loginSubmit);
router.post('/logout', controller.logout);

router.use(requireAdminPageAuth);

router.get('/', controller.dashboard);
router.get('/scenarios', controller.scenarios);
router.post('/scenarios', controller.saveScenario);
router.post('/scenarios/delete', controller.deleteScenario);
router.get('/prompts', controller.prompts);
router.get('/prompt-library', controller.promptLibrary);
router.get('/model-configs', controller.modelConfigs);
router.post('/prompts', controller.savePrompt);
router.post('/prompts/library', controller.savePromptDefinition);
router.post('/prompts/library/delete', controller.deletePromptDefinition);
router.post('/model-configs', controller.saveModelConfig);
router.get('/conversations', controller.conversations);
router.get('/bookmarks', controller.bookmarks);

module.exports = router;
