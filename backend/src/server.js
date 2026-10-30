import app from './app.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { logger } from './utils/logger.js';

const server = app.listen(env.port, () => logger.info(`API listening on :${env.port}`));

const shutdown = () => {
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
