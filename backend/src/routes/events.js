import { Router } from 'express';
import { subscribe } from '../services/eventHub.js';

const router = Router();

/** Server-Sent Events stream. Authors receive only their own ticket events; admins receive all. */
router.get('/', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering (nginx/Render)
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');

  const unsubscribe = subscribe(req.user, res);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

export default router;
