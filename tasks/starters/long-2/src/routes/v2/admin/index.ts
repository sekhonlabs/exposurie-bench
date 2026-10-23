import { Router } from 'express';
import { requireAdmin } from '../../../middleware/admin';
import { adminOrganizations } from './organizations';

/** Tidewell's own staff, through the support console. Never a customer's API key. */
export const admin = Router();

admin.use(requireAdmin);
admin.use('/organizations', adminOrganizations);
