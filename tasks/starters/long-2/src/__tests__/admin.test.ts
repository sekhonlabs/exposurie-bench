import express from 'express';
import request from 'supertest';
import { requireAdmin } from '../middleware/admin';

jest.mock('../config', () => ({
  config: {
    adminTokenHashes: [require('node:crypto').createHash('sha256').update('staff-token').digest('hex')],
  },
}));

function app() {
  const a = express();
  a.get('/x', requireAdmin, (_req, res) => {
    res.json({ ok: true });
  });
  return a;
}

it('answers 404 without a staff token', async () => {
  expect((await request(app()).get('/x')).status).toBe(404);
});

it('answers 404 for a token that is not a staff token', async () => {
  expect((await request(app()).get('/x').set('X-Admin-Token', 'not-staff')).status).toBe(404);
});

it('lets a staff token through', async () => {
  expect((await request(app()).get('/x').set('X-Admin-Token', 'staff-token')).status).toBe(200);
});
