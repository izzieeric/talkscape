const Koa = require('koa');
const Router = require('@koa/router');
const cors = require('@koa/cors');
const bodyParser = require('koa-bodyparser');
const serve = require('koa-static');
const mount = require('koa-mount');
const views = require('koa-views');
const path = require('path');
const logger = require('./middleware/logger');
const errorHandler = require('./middleware/error-handler');
const { attachUser } = require('./middleware/auth');
const { globalUserRateLimit } = require('./middleware/rate-limit');
const { getStaticDataDir } = require('./utils/voice-storage');
const { TSADMIN_ASSETS_PATH, withHttpBasePath } = require('./config/http-paths');

// 路由
const authRoutes = require('./routes/auth.routes');
const profileRoutes = require('./routes/profile.routes');
const scenarioRoutes = require('./routes/scenario.routes');
const conversationRoutes = require('./routes/conversation.routes');
const wordRoutes = require('./routes/word.routes');
const bookmarkRoutes = require('./routes/bookmark.routes');
const settingsRoutes = require('./routes/settings.routes');
const voiceRoutes = require('./routes/voice.routes');
const tsadminRoutes = require('./admin/routes/tsadmin.routes');

const app = new Koa();
const systemRouter = new Router({ prefix: withHttpBasePath('') });

app.use(errorHandler);
app.use(cors());
app.use(bodyParser({
  enableTypes: ['json', 'form', 'text'],
  jsonLimit: '10mb',
  formLimit: '10mb'
}));
app.use(attachUser);
app.use(logger);
app.use(globalUserRateLimit);
app.use(views(path.join(__dirname, 'admin/views'), { extension: 'ejs' }));

// 静态文件
app.use(mount(withHttpBasePath('/data'), serve(getStaticDataDir())));
app.use(mount(TSADMIN_ASSETS_PATH, serve(path.join(__dirname, 'admin/public'))));

// 健康检查
systemRouter.get('/health', (ctx) => {
  ctx.body = { status: 'ok', timestamp: new Date().toISOString() };
});

app.use(systemRouter.routes());
app.use(systemRouter.allowedMethods());
app.use(tsadminRoutes.routes());
app.use(tsadminRoutes.allowedMethods());
app.use(authRoutes.routes());
app.use(authRoutes.allowedMethods());
app.use(scenarioRoutes.routes());
app.use(scenarioRoutes.allowedMethods());
app.use(profileRoutes.routes());
app.use(profileRoutes.allowedMethods());
app.use(conversationRoutes.routes());
app.use(conversationRoutes.allowedMethods());
app.use(wordRoutes.routes());
app.use(wordRoutes.allowedMethods());
app.use(bookmarkRoutes.routes());
app.use(bookmarkRoutes.allowedMethods());
app.use(settingsRoutes.routes());
app.use(settingsRoutes.allowedMethods());
app.use(voiceRoutes.routes());
app.use(voiceRoutes.allowedMethods());

const handler = app.callback();
handler.listen = (...args) => app.listen(...args);
handler.callback = () => handler;
handler.koaApp = app;

module.exports = handler;
