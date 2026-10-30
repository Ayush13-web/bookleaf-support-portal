import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { loginBody } from '../validators/schemas.js';
import * as authService from '../services/authService.js';

const router = Router();

// Brute-force protection on the only unauthenticated write endpoint.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again in a few minutes.' } },
});

router.post('/login', loginLimiter, validate({ body: loginBody }), asyncHandler(async (req, res) => {
  res.json({ data: await authService.login(req.body.email, req.body.password) });
}));

router.get('/me', authenticate, asyncHandler(async (req, res) => {
  res.json({ data: await authService.getProfile(req.user.id) });
}));

export default router;
