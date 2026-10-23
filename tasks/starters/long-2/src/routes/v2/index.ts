import { Router } from 'express';
import { admin } from './admin';
import { organizations } from './organizations';

export const v2 = Router();

v2.use('/organizations', organizations);
v2.use('/admin', admin);
