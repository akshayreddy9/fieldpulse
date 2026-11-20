// Make a consistent copy of the database: node server/backup.js [folder]
// On AWS, run nightly and copy the file to an S3 bucket in ap-south-2 (see docs/DEPLOY-AWS.md).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const src = process.env.DB_FILE || path.join('data', 'msr-pulse.db');
const dir = process.argv[2] || path.join('data', 'backups');
fs.mkdirSync(dir, { recursive: true });
const out = path.join(dir, `msr-pulse-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
const db = new DatabaseSync(src, { readOnly: true });
db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
db.close();
console.log(`Backup written: ${out}`);
