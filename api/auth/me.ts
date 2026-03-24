import type { VercelRequest, VercelResponse } from '@vercel/node';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import { getFirebase } from '../../firebaseAdmin.js';

const JWT_SECRET = process.env.JWT_SECRET || 'hirehub-super-secret-key';
const IS_VERCEL = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_URL);

let sqliteDb: Database.Database | null = null;

function getSqliteDb() {
  if (sqliteDb) return sqliteDb;
  try {
    const dbPath = process.env.SQLITE_DB_PATH || '/tmp/hirehub.db';
    sqliteDb = new Database(dbPath);
    return sqliteDb;
  } catch (err) {
    console.error('SQLite initialization error:', err);
    return null;
  }
}

function getCookie(req: VercelRequest, name: string) {
  const header = req.headers.cookie;
  if (!header) return null;

  const cookies = header.split(';').map((part) => part.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith(`${name}=`)) {
      return decodeURIComponent(cookie.slice(name.length + 1));
    }
  }

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = getCookie(req, 'token');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let decoded: any;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  let name = decoded?.email?.split('@')?.[0] || 'User';
  let profile_picture_url: string | null = null;

  const { db: firestore } = getFirebase();

  try {
    if (firestore) {
      if (decoded.role === 'STUDENT') {
        const profileDoc = await firestore.collection('student_profiles').doc(String(decoded.id)).get();
        if (profileDoc.exists) {
          const data = profileDoc.data();
          if (data?.name) name = data.name;
          if (data?.profile_picture_url) profile_picture_url = data.profile_picture_url;
        }
      } else if (decoded.role === 'RECRUITER') {
        const profileDoc = await firestore.collection('recruiter_profiles').doc(String(decoded.id)).get();
        if (profileDoc.exists) {
          const data = profileDoc.data();
          if (data?.company_name) name = data.company_name;
          if (data?.profile_picture_url) profile_picture_url = data.profile_picture_url;
        }
      }
    } else if (!IS_VERCEL) {
      const db = getSqliteDb();
      if (db) {
        if (decoded.role === 'STUDENT') {
          const profile: any = db.prepare('SELECT name, profile_picture_url FROM student_profiles WHERE user_id = ?').get(decoded.id);
          if (profile?.name) name = profile.name;
          if (profile?.profile_picture_url) profile_picture_url = profile.profile_picture_url;
        } else if (decoded.role === 'RECRUITER') {
          const profile: any = db.prepare('SELECT company_name, profile_picture_url FROM recruiter_profiles WHERE user_id = ?').get(decoded.id);
          if (profile?.company_name) name = profile.company_name;
          if (profile?.profile_picture_url) profile_picture_url = profile.profile_picture_url;
        }
      }
    }
  } catch (err) {
    console.error('Error fetching profile for /api/auth/me:', err);
  }

  return res.status(200).json({
    user: {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      username: decoded.username,
      name,
      profile_picture_url,
    },
  });
}
