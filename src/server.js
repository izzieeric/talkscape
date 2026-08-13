const config = require('./config');
const app = require('./app');
const db = require('./db');
const { logger } = require('./middleware/logger');

const PORT = config.server?.port || 3000;
const HOST = config.server?.host || '0.0.0.0';

async function startServer() {
  try {
    // 初始化数据库
    await db.init();

    app.listen(PORT, HOST, () => {
      logger.info('TalkScape Server started', {
        host: HOST,
        port: PORT,
        url: `http://${HOST}:${PORT}`
      });
    });
  } catch (error) {
    logger.error('Failed to start server', {
      message: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

startServer();
