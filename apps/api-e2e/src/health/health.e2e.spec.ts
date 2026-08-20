import { INestApplication } from '@nestjs/common';

import request from 'supertest';

import { createTestApp, TestApp } from '../support/test-app.js';

/**
 * Confirms `GET /api/health` is reachable with no session cookie — proving `@Public()`
 * took effect, since every other route in this app 401s without one.
 */
describe('Health (e2e)', () => {
  let testApp: TestApp;
  let app: INestApplication;

  beforeAll(async () => {
    testApp = await createTestApp();
    app = testApp.app;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with connected DB status, with no cookie set', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'connected' });
  });
});
