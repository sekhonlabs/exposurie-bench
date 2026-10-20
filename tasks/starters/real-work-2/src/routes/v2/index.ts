import { Router } from 'express';
import { organizations } from './organizations';

export const v2 = Router();

v2.use('/organizations', organizations);
