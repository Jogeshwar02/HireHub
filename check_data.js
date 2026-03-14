import Database from 'better-sqlite3';
const db = new Database('hirehub.db');
const jobs = db.prepare('SELECT * FROM jobs').all();
console.log('Jobs:', JSON.stringify(jobs, null, 2));
const users = db.prepare('SELECT id, email, role FROM users').all();
console.log('Users:', JSON.stringify(users, null, 2));
