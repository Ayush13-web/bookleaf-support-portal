import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import apiRoutes from './routes/index.js';
import { isAiConfigured } from './services/ai/llmClient.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.corsOrigin.split(',').map((s) => s.trim()) }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/v1/health', (_req, res) => res.json({ status: 'ok', ai: isAiConfigured() ? 'configured' : 'not_configured' }));
app.use('/api/v1/auth', authRoutes);                 // login is public; /me authenticates itself
app.use('/api/v1', authenticate, apiRoutes);         // everything else requires a valid token
app.use('/api', notFoundHandler);

// Single-service deploy: serve the built React app when present.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(errorHandler);
export default app;
