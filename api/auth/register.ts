import type { VercelRequest, VercelResponse } from '@vercel/node';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getFirebase } from '../../firebaseAdmin.js';

const JWT_SECRET = process.env.JWT_SECRET || 'hirehub-super-secret-key';
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
let sqliteDb: Database.Database | null = null;

function getSqliteDb() {
  if (sqliteDb) return sqliteDb;

  try {
    const dbPath = process.env.SQLITE_DB_PATH || '/tmp/hirehub.db';
    sqliteDb = new Database(dbPath);

    sqliteDb.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT CHECK(role IN ('STUDENT', 'RECRUITER', 'ADMIN')) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

    sqliteDb.exec(`
CREATE TABLE IF NOT EXISTS student_profiles (
  user_id INTEGER PRIMARY KEY,
  name TEXT,
  views INTEGER DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

    sqliteDb.exec(`
CREATE TABLE IF NOT EXISTS recruiter_profiles (
  user_id INTEGER PRIMARY KEY,
  company_name TEXT,
  is_verified INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

    sqliteDb.exec(`
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  type TEXT,
  title TEXT,
  content TEXT,
  link TEXT,
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

    return sqliteDb;
  } catch (err) {
    console.error('SQLite initialization error:', err);
    return null;
  }
}

async function createNotification(userId: number | string, type: string, title: string, content: string, link?: string) {
  const { db: firestore } = getFirebase();
  if (firestore) {
    try {
      await firestore.collection('notifications').add({
        user_id: userId.toString(),
        type,
        title,
        content,
        link: link || null,
        is_read: 0,
        created_at: new Date().toISOString()
      });
      return;
    } catch (err) {
      console.error('Firestore notification error:', err);
    }
  }

  try {
    const db = getSqliteDb();
    if (!db) return;
    db.prepare(
      'INSERT INTO notifications (user_id, type, title, content, link) VALUES (?, ?, ?, ?, ?)'
    ).run(Number(userId), type, title, content, link || null);
  } catch (err) {
    console.error('SQLite notification error:', err);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password, role, name, company_name, username } = req.body || {};

  if (!email || !password || !role) {
    return res.status(400).json({ error: 'email, password, and role are required' });
  }
  if (role !== 'STUDENT' && role !== 'RECRUITER') {
    return res.status(400).json({ error: 'Invalid role' });
  }
  if (role === 'STUDENT' && !name) {
    return res.status(400).json({ error: 'Student name is required' });
  }
  if (role === 'RECRUITER' && !company_name) {
    return res.status(400).json({ error: 'Recruiter company_name is required' });
  }

  const finalUsername = (username && username.trim()) || `${email.split('@')[0]}${Math.floor(Math.random() * 1000)}`;

  const { db: firestore } = getFirebase();
  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    if (firestore) {
      const existing = await firestore.collection('users').where('email', '==', email).get();
      if (!existing.empty) {
        return res.status(400).json({ error: 'User already exists' });
      }
      const userRef = await firestore.collection('users').add({
        email,
        username: finalUsername,
        password: hashedPassword,
        role,
        created_at: new Date().toISOString()
      });

      if (role === 'STUDENT') {
        await firestore.collection('student_profiles').doc(userRef.id).set({ user_id: userRef.id, name, views: 0 });
      } else {
        await firestore.collection('recruiter_profiles').doc(userRef.id).set({ user_id: userRef.id, company_name, is_verified: 0, views: 0 });
      }

      const token = jwt.sign({ id: userRef.id, email, role }, JWT_SECRET, { expiresIn: '30d' });
      await createNotification(userRef.id, 'MESSAGE', 'Welcome to HireHub!', 'Thank you for joining our platform.', '/dashboard');

      res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=${THIRTY_DAYS / 1000}; Secure; SameSite=None`);
      return res.status(200).json({ user: { id: userRef.id, email, role, username: finalUsername } });
    }

    // fallback sqlite
    const db = getSqliteDb();
    if (!db) {
      return res.status(500).json({ error: 'Database unavailable and Firebase is not configured' });
    }

    const exists = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (exists) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const result = db.prepare(
      'INSERT INTO users (email, username, password, role) VALUES (?, ?, ?, ?)'
    ).run(email, finalUsername, hashedPassword, role);

    const userId = result.lastInsertRowid;
    if (role === 'STUDENT') {
      db.prepare('INSERT OR IGNORE INTO student_profiles (user_id, name) VALUES (?, ?)').run(userId, name);
    } else {
      db.prepare('INSERT OR IGNORE INTO recruiter_profiles (user_id, company_name) VALUES (?, ?)').run(userId, company_name);
    }

    const token = jwt.sign({ id: userId, email, role }, JWT_SECRET, { expiresIn: '30d' });
    await createNotification(userId, 'MESSAGE', 'Welcome to HireHub!', 'Thank you for joining our platform.', '/dashboard');

    res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=${THIRTY_DAYS / 1000}; Secure; SameSite=None`);
    return res.status(200).json({ user: { id: userId, email, role, username: finalUsername } });

  } catch (err: any) {
    console.error('Register error:', err);
    return res.status(500).json({ error: err.message || 'Registration failed' });
  }
}
