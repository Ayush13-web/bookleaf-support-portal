import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

/** Verifies the Bearer JWT and attaches `req.user = { id, role, authorId, name }`. */
export function authenticate(req, _res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) throw AppError.unauthorized();
  try {
    const p = jwt.verify(token, env.jwtSecret);
    req.user = { id: Number(p.sub), role: p.role, authorId: p.authorId || null, name: p.name };
    next();
  } catch {
    throw AppError.unauthorized('Invalid or expired token');
  }
}

/** Role-based access control. Usage: router.use(requireRole('admin')) */
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) throw AppError.forbidden();
  next();
};

export function signToken(user) {
  return jwt.sign(
    { role: user.role, authorId: user.author_id || null, name: user.name },
    env.jwtSecret,
    { subject: String(user.id), expiresIn: env.jwtExpiresIn },
  );
}
