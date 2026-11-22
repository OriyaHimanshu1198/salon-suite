import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../server/env.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '..', 'data');

for (const file of ['salon.db', 'salon.db-wal', 'salon.db-shm']) {
  const full = path.join(dataDir, file);
  if (fs.existsSync(full)) {
    fs.rmSync(full);
    console.log(`removed ${file}`);
  }
}

const { seedIfEmpty } = await import('../server/db.js');
seedIfEmpty();
console.log('Database reset and reseeded.');
console.log('Login: owner@lumiere.test / salon123');
