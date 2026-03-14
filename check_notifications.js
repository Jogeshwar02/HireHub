import Database from 'better-sqlite3';
const db = new Database('hirehub.db');
const notifications = db.prepare('SELECT * FROM notifications').all();
console.log('Notifications:', JSON.stringify(notifications, null, 2));
