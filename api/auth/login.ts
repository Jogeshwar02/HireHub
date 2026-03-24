import type { VercelRequest, VercelResponse } from '@vercel/node';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getFirebase } from '../../firebaseAdmin.js';

const JWT_SECRET = process.env.JWT_SECRET || 'hirehub-super-secret-key';
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const IS_VERCEL = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_URL);

const envPresence = () => ({
  FIREBASE_PROJECT_ID: Boolean(process.env.FIREBASE_PROJECT_ID),
  FIREBASE_CLIENT_EMAIL: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
  FIREBASE_PRIVATE_KEY: Boolean(process.env.FIREBASE_PRIVATE_KEY),
});
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

    return sqliteDb;
  } catch (err) {
    console.error('SQLite initialization error:', err);
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const { db: firestore } = getFirebase();
  try {
    if (firestore) {
      const userSnap = await firestore.collection('users').where('email', '==', email).get();
      if (userSnap.empty) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const doc = userSnap.docs[0];
      const data = doc.data();
      const valid = await bcrypt.compare(password, data.password);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const token = jwt.sign({ id: doc.id, email, role: data.role }, JWT_SECRET, { expiresIn: '30d' });
      res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=${THIRTY_DAYS / 1000}; Secure; SameSite=None`);
      return res.status(200).json({ user: { id: doc.id, email: data.email, role: data.role, username: data.username } });
    }

    if (IS_VERCEL) {
      return res.status(500).json({
        error: 'Firebase is not configured on this deployment',
        envPresence: envPresence(),
      });
    }

    const db = getSqliteDb();
    if (!db) {
      return res.status(500).json({ error: 'Database unavailable and Firebase is not configured' });
    }

    const user: any = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=${THIRTY_DAYS / 1000}; Secure; SameSite=None`);
    return res.status(200).json({ user: { id: user.id, email: user.email, role: user.role, username: user.username } });

  } catch (err: any) {
    console.error('Login error:', err);
    return res.status(500).json({ error: err.message || 'Login failed' });
  }
}
