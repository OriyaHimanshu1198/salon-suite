import '../server/env.js';
import { seedIfEmpty, q1 } from '../server/db.js';

const created = seedIfEmpty();
if (created) {
  const n = q1('SELECT COUNT(*) AS n FROM appointments').n;
  console.log(`Seeded demo salon with ${n} appointments.`);
  console.log('Login: owner@lumiere.test / salon123');
} else {
  console.log('Database already has data — nothing to seed. Use npm run reset to start over.');
}
