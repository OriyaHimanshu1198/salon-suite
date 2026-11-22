import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const db = path.join(root, 'data', 'salon.db');
const backupDir = path.join(root, 'backups');

if (!fs.existsSync(db)) {
  console.error('No database yet — start the app once first.');
  process.exit(1);
}

fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const target = path.join(backupDir, `salon-${stamp}.db`);
fs.copyFileSync(db, target);

const keep = 30;
const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.db')).sort();
for (const old of files.slice(0, Math.max(0, files.length - keep))) {
  fs.rmSync(path.join(backupDir, old));
}

console.log(`Backup written: ${target}`);
