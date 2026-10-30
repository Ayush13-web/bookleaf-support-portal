import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { ROLES } from '../constants.js';
import bookRoutes from './books.js';
import ticketRoutes from './tickets.js';
import adminRoutes from './admin.js';
import eventRoutes from './events.js';

/** All routes here sit behind `authenticate` (see app.js). Role checks happen per router. */
const router = Router();
router.use('/books', bookRoutes);
router.use('/events', eventRoutes);
router.use('/tickets', requireRole(ROLES.AUTHOR), ticketRoutes);
router.use('/admin', requireRole(ROLES.ADMIN), adminRoutes);
export default router;
