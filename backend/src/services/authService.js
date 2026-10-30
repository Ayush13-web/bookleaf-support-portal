import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import { AppError } from '../utils/AppError.js';

// Compared against when the email is unknown so response time doesn't leak which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export async function login(email, password) {
  const { rows } = await query(
    `SELECT u.id, u.email, u.name, u.role, u.password_hash, a.author_id
       FROM users u LEFT JOIN authors a ON a.user_id = u.id
      WHERE u.email = $1`,
    [email],
  );
  const user = rows[0];
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
  return { token: signToken(user), user: publicUser(user) };
}

export async function getProfile(userId) {
  const { rows } = await query(
    `SELECT u.id, u.email, u.name, u.role, a.author_id
       FROM users u LEFT JOIN authors a ON a.user_id = u.id WHERE u.id = $1`,
    [userId],
  );
  if (!rows[0]) throw AppError.unauthorized('Account no longer exists');
  return publicUser(rows[0]);
}

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, authorId: u.author_id || null });
