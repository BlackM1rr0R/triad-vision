import { afterAll, beforeEach } from 'vitest';
import { prisma } from '../../src/db.js';
import { resetDb, settle } from './db';

// Every e2e test starts from an empty database, so tests are independent and order-free.
beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  // Let fire-and-forget mail writes finish before the connection pool closes.
  await settle();
  await prisma.$disconnect();
});
