import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pdfParse: any;
try {
  const mod = require('pdf-parse');
  if (typeof mod === 'function') {
    pdfParse = mod;
  } else if (mod && typeof mod.default === 'function') {
    pdfParse = mod.default;
  } else if (mod && typeof mod.pdf === 'function') {
    pdfParse = mod.pdf;
  } else {
    pdfParse = mod;
  }
} catch (e) {
  console.error('Failed to load pdf-parse:', e);
}
import { GoogleGenAI } from '@google/genai';
import { getFirebase } from './firebaseAdmin.js';

// Robust GoogleGenAI initialization
let GoogleGenAIClass: any = GoogleGenAI;
if (!GoogleGenAIClass || (typeof GoogleGenAIClass !== 'function' && (GoogleGenAIClass as any).GoogleGenAI)) {
  GoogleGenAIClass = (GoogleGenAIClass as any).GoogleGenAI;
}

console.log('[Init] pdfParse function resolved. Type:', typeof pdfParse);
console.log('[Init] GoogleGenAI resolved. Type:', typeof GoogleGenAIClass);

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
console.log('[Init] Upload directory path:', uploadDir);
if (!fs.existsSync(uploadDir)) {
  console.log('[Init] Creating uploads directory');
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    const name = path.basename(file.originalname, ext)
      .replace(/[^a-z0-9]/gi, '_')
      .substring(0, 100);
    cb(null, uniqueSuffix + '-' + name + ext);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and image files are allowed'));
    }
  }
});

const db = new Database('hirehub.db');
const JWT_SECRET = process.env.JWT_SECRET || 'hirehub-super-secret-key';
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    password TEXT NOT NULL,
    role TEXT CHECK(role IN ('STUDENT', 'RECRUITER', 'ADMIN')) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS friend_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    status TEXT CHECK(status IN ('PENDING', 'ACCEPTED', 'REJECTED')) DEFAULT 'PENDING',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(sender_id, receiver_id),
    FOREIGN KEY(sender_id) REFERENCES users(id),
    FOREIGN KEY(receiver_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id1 INTEGER NOT NULL,
    user_id2 INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id1, user_id2),
    FOREIGN KEY(user_id1) REFERENCES users(id),
    FOREIGN KEY(user_id2) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS student_profiles (
    user_id INTEGER PRIMARY KEY,
    name TEXT,
    headline TEXT,
    education TEXT,
    college_name TEXT,
    degree TEXT,
    branch TEXT,
    graduation_year TEXT,
    cgpa TEXT,
    bio TEXT,
    location TEXT,
    linkedin_url TEXT,
    github_url TEXT,
    portfolio_url TEXT,
    experience_years INTEGER,
    phone TEXT,
    profile_picture_url TEXT,
    views INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS recruiter_profiles (
    user_id INTEGER PRIMARY KEY,
    company_name TEXT,
    headline TEXT,
    company_bio TEXT,
    company_website TEXT,
    industry TEXT,
    company_size TEXT,
    location TEXT,
    profile_picture_url TEXT,
    is_verified INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recruiter_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    requirements TEXT, -- JSON array of skills
    status TEXT CHECK(status IN ('PENDING', 'APPROVED', 'FLAGGED', 'CLOSED')) DEFAULT 'PENDING',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(recruiter_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER,
    student_id INTEGER,
    resume_url TEXT,
    answers TEXT, -- JSON
    status TEXT CHECK(status IN ('PENDING', 'SHORTLISTED', 'REJECTED')) DEFAULT 'PENDING',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_id, student_id),
    FOREIGN KEY(job_id) REFERENCES jobs(id),
    FOREIGN KEY(student_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS resume_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    resume_name TEXT,
    score INTEGER,
    analysis_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS user_skills (
    user_id INTEGER,
    skill TEXT,
    PRIMARY KEY(user_id, skill),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS direct_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sender_id) REFERENCES users(id),
    FOREIGN KEY(receiver_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER,
    sender_id INTEGER,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(application_id) REFERENCES applications(id),
    FOREIGN KEY(sender_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS interviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER,
    recruiter_id INTEGER,
    student_id INTEGER,
    scheduled_at DATETIME NOT NULL,
    meeting_link TEXT,
    notes TEXT,
    status TEXT CHECK(status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')) DEFAULT 'SCHEDULED',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(application_id) REFERENCES applications(id),
    FOREIGN KEY(recruiter_id) REFERENCES users(id),
    FOREIGN KEY(student_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    filename TEXT,
    mimetype TEXT,
    data BLOB,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS saved_jobs (
    user_id TEXT,
    job_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id, job_id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    link TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
`);

const safeParse = (data: any, fallback: any = []) => {
  if (!data) return fallback;
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data);
  } catch (e) {
    if (typeof data === 'string' && data.includes(',')) {
      return data.split(',').map(s => s.trim()).filter(Boolean);
    }
    return fallback;
  }
};

async function startServer() {
  // Seed Admin if not exists
  const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('ADMIN');
  if (!adminExists) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)').run('admin@hirehub.com', hashedPassword, 'ADMIN');
  }

  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Explicit route for serving uploads to ensure correct headers
  app.get('/uploads/:filename', async (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(uploadDir, filename);
    
    console.log(`[Serve] Request for: ${filename}`);
    
    // 1. Try serving from local disk
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
      return res.sendFile(filePath, (err) => {
        if (err) {
          console.error(`[Serve] Error sending ${filePath}:`, err);
          if (!res.headersSent) {
            res.status(500).send('Error serving file');
          }
        }
      });
    } 
    
    // 2. Try serving from SQLite Database (Persistent Backup)
    try {
      const file = db.prepare('SELECT * FROM files WHERE id = ?').get(filename);
      if (file) {
        console.log(`[Serve] Serving ${filename} from SQLite database`);
        res.setHeader('Content-Type', file.mimetype || 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');
        return res.send(file.data);
      }
    } catch (dbErr) {
      console.error(`[Serve] SQLite error for ${filename}:`, dbErr);
    }

    // 3. Try serving from Firestore (Cloud Run Persistent Backup)
    try {
      const { db: firestore } = getFirebase();
      if (firestore) {
        const doc = await firestore.collection('files').doc(filename).get();
        if (doc.exists) {
          const data = doc.data();
          console.log(`[Serve] Serving ${filename} from Firestore`);
          res.setHeader('Content-Type', data?.mimetype || 'application/pdf');
          res.setHeader('Content-Disposition', 'inline');
          return res.send(Buffer.from(data?.data, 'base64'));
        }
      }
    } catch (fsErr) {
      console.error(`[Serve] Firestore error for ${filename}:`, fsErr);
    }

    // 4. Check fallback path
    const fallbackPath = path.join(process.cwd(), 'uploads', filename);
    if (fs.existsSync(fallbackPath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
      return res.sendFile(fallbackPath);
    }

    console.error(`[Serve] File NOT FOUND: ${filename}`);
    res.status(404).send('File not found');
  });

  // Helper to create notifications
async function createNotification(userId: string | number, type: string, title: string, content: string, link?: string) {
  if (!userId) {
    console.error('[Notification] Cannot create notification: userId is missing');
    return;
  }
  console.log(`[Notification] Creating for user ${userId} (Type: ${typeof userId}): ${title}`);
  const { db: firestore } = getFirebase();
  if (!firestore) {
    try {
      db.prepare(`
        INSERT INTO notifications (user_id, type, title, content, link)
        VALUES (?, ?, ?, ?, ?)
      `).run(Number(userId), type, title, content, link || null);
      console.log(`[Notification] SQLite: Created for user ${userId}`);
    } catch (err) {
      console.error('[Notification] SQLite error:', err);
    }
    return;
  }

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
    console.log(`[Notification] Firestore: Created for user ${userId}`);
  } catch (err) {
    console.error('Error creating notification:', err);
  }
}

// Auth Middleware
  // Ensure new columns exist for existing databases
  const addColumn = (table: string, column: string, type: string) => {
    try {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
    } catch (e) {}
  };

  addColumn('jobs', 'location', 'TEXT');
  addColumn('jobs', 'work_type', 'TEXT DEFAULT "ON_SITE"'); // ON_SITE, REMOTE, HYBRID
  addColumn('student_profiles', 'location', 'TEXT');
  addColumn('student_profiles', 'headline', 'TEXT');
  addColumn('student_profiles', 'college_name', 'TEXT');
  addColumn('student_profiles', 'degree', 'TEXT');
  addColumn('student_profiles', 'branch', 'TEXT');
  addColumn('student_profiles', 'graduation_year', 'TEXT');
  addColumn('student_profiles', 'cgpa', 'TEXT');
  addColumn('student_profiles', 'linkedin_url', 'TEXT');
  addColumn('student_profiles', 'github_url', 'TEXT');
  addColumn('student_profiles', 'portfolio_url', 'TEXT');
  addColumn('student_profiles', 'experience_years', 'INTEGER');
  addColumn('student_profiles', 'phone', 'TEXT');
  addColumn('recruiter_profiles', 'headline', 'TEXT');
  addColumn('recruiter_profiles', 'phone', 'TEXT');
  addColumn('student_profiles', 'profile_picture_url', 'TEXT');
  addColumn('student_profiles', 'views', 'INTEGER DEFAULT 0');

  addColumn('recruiter_profiles', 'company_website', 'TEXT');
  addColumn('recruiter_profiles', 'industry', 'TEXT');
  addColumn('recruiter_profiles', 'company_size', 'TEXT');
  addColumn('recruiter_profiles', 'location', 'TEXT');
  addColumn('recruiter_profiles', 'phone', 'TEXT');
  addColumn('recruiter_profiles', 'profile_picture_url', 'TEXT');
  addColumn('recruiter_profiles', 'views', 'INTEGER DEFAULT 0');
  addColumn('notifications', 'is_read', 'INTEGER DEFAULT 0');
  
  // Migrate saved_jobs job_id to TEXT if needed
  try {
    const tableInfo = db.prepare("PRAGMA table_info(saved_jobs)").all();
    const jobIdCol = tableInfo.find((c: any) => c.name === 'job_id');
    if (jobIdCol && jobIdCol.type === 'INTEGER') {
      console.log('[Migration] Converting saved_jobs.job_id to TEXT');
      db.exec(`
        CREATE TABLE saved_jobs_new (
          user_id TEXT,
          job_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY(user_id, job_id)
        );
        INSERT INTO saved_jobs_new SELECT user_id, CAST(job_id AS TEXT), created_at FROM saved_jobs;
        DROP TABLE saved_jobs;
        ALTER TABLE saved_jobs_new RENAME TO saved_jobs;
      `);
    }
  } catch (e) {
    console.error('[Migration] Failed to migrate saved_jobs:', e);
  }

  const authenticate = (req: any, res: any, next: any) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  const authorize = (roles: string[]) => (req: any, res: any, next: any) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };

  // Auth Endpoints
  app.post('/api/auth/register', async (req, res) => {
    const { email, password, role, name, company_name, username } = req.body;
    const { db: firestore } = getFirebase();
    
    const finalUsername = username || email.split('@')[0] + Math.floor(Math.random() * 1000);

    if (!firestore) {
      // Fallback to SQLite if Firebase is not configured
      try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = db.prepare('INSERT INTO users (email, username, password, role) VALUES (?, ?, ?, ?)').run(email, finalUsername, hashedPassword, role);
        const userId = result.lastInsertRowid;

        if (role === 'STUDENT') {
          db.prepare('INSERT INTO student_profiles (user_id, name) VALUES (?, ?)').run(userId, name);
        } else if (role === 'RECRUITER') {
          db.prepare('INSERT INTO recruiter_profiles (user_id, company_name) VALUES (?, ?)').run(userId, company_name);
        }

        const token = jwt.sign({ id: userId, email, role }, JWT_SECRET, { expiresIn: '30d' });
        
        await createNotification(userId, 'MESSAGE', 'Welcome to HireHub!', 'Thank you for joining our platform. Start exploring jobs or post your first job opening.', '/dashboard');
        
        res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: THIRTY_DAYS });
        res.json({ user: { id: userId, email, role } });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
      return;
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Check if user exists
      const userSnap = await firestore.collection('users').where('email', '==', email).get();
      if (!userSnap.empty) {
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
        await firestore.collection('student_profiles').doc(userRef.id).set({
          user_id: userRef.id,
          name,
          views: 0
        });
      } else if (role === 'RECRUITER') {
        await firestore.collection('recruiter_profiles').doc(userRef.id).set({
          user_id: userRef.id,
          company_name,
          is_verified: 0,
          views: 0
        });
      }

      const token = jwt.sign({ id: userRef.id, email, role }, JWT_SECRET, { expiresIn: '30d' });
      
      await createNotification(userRef.id, 'MESSAGE', 'Welcome to HireHub!', 'Thank you for joining our platform. Start exploring jobs or post your first job opening.', '/dashboard');
      
      res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: THIRTY_DAYS });
      res.json({ user: { id: userRef.id, email, role } });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const { db: firestore } = getFirebase();

    if (!firestore) {
      // Fallback to SQLite
      const user: any = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
      
      res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: THIRTY_DAYS });
      res.json({ user: { id: user.id, email: user.email, role: user.role, username: user.username } });
      return;
    }

    try {
      const userSnap = await firestore.collection('users').where('email', '==', email).get();
      if (userSnap.empty) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const userDoc = userSnap.docs[0];
      const userData = userDoc.data();

      if (!(await bcrypt.compare(password, userData.password))) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign({ id: userDoc.id, email: userData.email, role: userData.role }, JWT_SECRET, { expiresIn: '30d' });
      
      res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: THIRTY_DAYS });
      res.json({ user: { id: userDoc.id, email: userData.email, role: userData.role, username: userData.username } });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Social Endpoints
  app.get('/api/social/users/search', authenticate, async (req: any, res) => {
    const { q } = req.query;
    if (!q) return res.json([]);
    const currentUserId = req.user.id;

    const { db: firestore } = getFirebase();
    if (!firestore) {
      const users = db.prepare(`
        SELECT u.id, u.email, u.username, u.role,
               COALESCE(sp.name, rp.company_name) as name,
               COALESCE(sp.profile_picture_url, rp.profile_picture_url) as profile_picture_url,
               EXISTS(SELECT 1 FROM friends WHERE (user_id1 = ? AND user_id2 = u.id) OR (user_id1 = u.id AND user_id2 = ?)) as is_friend,
               EXISTS(SELECT 1 FROM friend_requests WHERE sender_id = ? AND receiver_id = u.id AND status = 'PENDING') as has_sent_request
        FROM users u
        LEFT JOIN student_profiles sp ON u.id = sp.user_id
        LEFT JOIN recruiter_profiles rp ON u.id = rp.user_id
        WHERE (u.username LIKE ? OR u.email LIKE ? OR sp.name LIKE ? OR rp.company_name LIKE ?)
        AND u.id != ?
        LIMIT 20
      `).all(currentUserId, currentUserId, currentUserId, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, currentUserId);
      return res.json(users);
    }

    try {
      // Firestore search is limited, we'll do a simple prefix search or fetch all and filter
      // For a real app, use Algolia or similar. Here we'll just fetch some and filter.
      const usersSnap = await firestore.collection('users').limit(100).get();
      const users = await Promise.all(usersSnap.docs.map(async doc => {
        const data = doc.data();
        let name = '';
        let profile_picture_url = '';
        
        if (data.role === 'STUDENT') {
          const p = await firestore.collection('student_profiles').doc(doc.id).get();
          name = p.data()?.name || '';
          profile_picture_url = p.data()?.profile_picture_url || '';
        } else {
          const p = await firestore.collection('recruiter_profiles').doc(doc.id).get();
          name = p.data()?.company_name || '';
          profile_picture_url = p.data()?.profile_picture_url || '';
        }

        const isFriend1 = await firestore.collection('friends')
          .where('user_id1', '==', currentUserId.toString())
          .where('user_id2', '==', doc.id)
          .get();
        const isFriend2 = await firestore.collection('friends')
          .where('user_id1', '==', doc.id)
          .where('user_id2', '==', currentUserId.toString())
          .get();
        
        const hasSentRequest = await firestore.collection('friend_requests')
          .where('sender_id', '==', currentUserId.toString())
          .where('receiver_id', '==', doc.id)
          .where('status', '==', 'PENDING')
          .get();

        return {
          id: doc.id,
          email: data.email,
          username: data.username,
          role: data.role,
          name,
          profile_picture_url,
          is_friend: !isFriend1.empty || !isFriend2.empty,
          has_sent_request: !hasSentRequest.empty
        };
      }));

      const filtered = users.filter(u => 
        u.username?.toLowerCase().includes(q.toString().toLowerCase()) ||
        u.email?.toLowerCase().includes(q.toString().toLowerCase()) ||
        u.name?.toLowerCase().includes(q.toString().toLowerCase())
      );

      res.json(filtered);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/social/users/:id', authenticate, async (req: any, res) => {
    const { id } = req.params;
    const currentUserId = req.user.id;
    const { db: firestore } = getFirebase();

    if (!firestore) {
      const user: any = db.prepare('SELECT id, email, username, role FROM users WHERE id = ?').get(id);
      if (!user) return res.status(404).json({ error: 'User not found' });

      let profile: any;
      if (user.role === 'STUDENT') {
        profile = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(id);
      } else {
        profile = db.prepare('SELECT * FROM recruiter_profiles WHERE user_id = ?').get(id);
      }

      const isFriend = db.prepare(`
        SELECT 1 FROM friends 
        WHERE (user_id1 = ? AND user_id2 = ?) 
           OR (user_id1 = ? AND user_id2 = ?)
      `).get(currentUserId, id, id, currentUserId);

      const hasSentRequest = db.prepare(`
        SELECT 1 FROM friend_requests 
        WHERE sender_id = ? AND receiver_id = ? AND status = 'PENDING'
      `).get(currentUserId, id);

      return res.json({ 
        ...user, 
        profile, 
        is_friend: !!isFriend, 
        has_sent_request: !!hasSentRequest 
      });
    }

    try {
      const userDoc = await firestore.collection('users').doc(id).get();
      if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });

      const userData = userDoc.data();
      let profile: any;
      if (userData?.role === 'STUDENT') {
        const p = await firestore.collection('student_profiles').doc(id).get();
        profile = p.data();
      } else {
        const p = await firestore.collection('recruiter_profiles').doc(id).get();
        profile = p.data();
      }

      const isFriend1 = await firestore.collection('friends')
        .where('user_id1', '==', currentUserId.toString())
        .where('user_id2', '==', id)
        .get();
      const isFriend2 = await firestore.collection('friends')
        .where('user_id1', '==', id)
        .where('user_id2', '==', currentUserId.toString())
        .get();
      
      const hasSentRequest = await firestore.collection('friend_requests')
        .where('sender_id', '==', currentUserId.toString())
        .where('receiver_id', '==', id)
        .where('status', '==', 'PENDING')
        .get();

      res.json({ 
        id, 
        ...userData, 
        profile, 
        is_friend: !isFriend1.empty || !isFriend2.empty,
        has_sent_request: !hasSentRequest.empty
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/social/friend-request', authenticate, async (req: any, res) => {
    const { receiverId } = req.body;
    const senderId = req.user.id;

    if (!receiverId) {
      return res.status(400).json({ error: 'Receiver ID is required' });
    }

    if (senderId.toString() === receiverId.toString()) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }

    const { db: firestore } = getFirebase();
    if (!firestore) {
      try {
        // Check if request already exists
        const existing = db.prepare('SELECT * FROM friend_requests WHERE sender_id = ? AND receiver_id = ?').get(senderId, receiverId);
        if (existing) {
          return res.status(400).json({ error: 'Friend request already sent' });
        }

        db.prepare('INSERT INTO friend_requests (sender_id, receiver_id) VALUES (?, ?)').run(senderId, receiverId);
        
        const sender: any = db.prepare('SELECT username FROM users WHERE id = ?').get(senderId);
        await createNotification(receiverId, 'MESSAGE', 'New Friend Request', `${sender.username} sent you a friend request.`, '/network');
        
        res.json({ success: true });
      } catch (err: any) {
        console.error('Friend request error:', err);
        res.status(400).json({ error: 'Failed to send friend request' });
      }
      return;
    }

    try {
      const requestId = `${senderId}_${receiverId}`;
      await firestore.collection('friend_requests').doc(requestId).set({
        sender_id: senderId.toString(),
        receiver_id: receiverId.toString(),
        status: 'PENDING',
        created_at: new Date().toISOString()
      });

      const senderDoc = await firestore.collection('users').doc(senderId.toString()).get();
      const senderData = senderDoc.data();
      await createNotification(receiverId.toString(), 'MESSAGE', 'New Friend Request', `${senderData?.username} sent you a friend request.`, '/network');

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/social/friend-request/:id/respond', authenticate, async (req: any, res) => {
    const { id } = req.params;
    const { action } = req.body; // 'ACCEPT' or 'REJECT'
    const userId = req.user.id;

    const { db: firestore } = getFirebase();
    if (!firestore) {
      const request: any = db.prepare('SELECT * FROM friend_requests WHERE id = ? AND receiver_id = ?').get(id, userId);
      if (!request) return res.status(404).json({ error: 'Request not found' });

      if (action === 'ACCEPT') {
        db.prepare('UPDATE friend_requests SET status = ? WHERE id = ?').run('ACCEPTED', id);
        db.prepare('INSERT INTO friends (user_id1, user_id2) VALUES (?, ?)').run(
          Math.min(request.sender_id, request.receiver_id),
          Math.max(request.sender_id, request.receiver_id)
        );
        
        const receiver: any = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
        await createNotification(request.sender_id, 'MESSAGE', 'Friend Request Accepted', `${receiver.username} accepted your friend request.`, '/network');
      } else {
        db.prepare('UPDATE friend_requests SET status = ? WHERE id = ?').run('REJECTED', id);
      }
      return res.json({ success: true });
    }

    try {
      const requestDoc = await firestore.collection('friend_requests').doc(id).get();
      if (!requestDoc.exists) return res.status(404).json({ error: 'Request not found' });

      const requestData = requestDoc.data();
      if (requestData?.receiver_id !== userId.toString()) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      if (action === 'ACCEPT') {
        await firestore.collection('friend_requests').doc(id).update({ status: 'ACCEPTED' });
        const friendshipId = [requestData.sender_id, requestData.receiver_id].sort().join('_');
        await firestore.collection('friends').doc(friendshipId).set({
          user_id1: requestData.sender_id,
          user_id2: requestData.receiver_id,
          created_at: new Date().toISOString()
        });

        const receiverDoc = await firestore.collection('users').doc(userId.toString()).get();
        const receiverData = receiverDoc.data();
        await createNotification(requestData.sender_id, 'MESSAGE', 'Friend Request Accepted', `${receiverData?.username} accepted your friend request.`, '/network');
      } else {
        await firestore.collection('friend_requests').doc(id).update({ status: 'REJECTED' });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/social/friends', authenticate, async (req: any, res) => {
    const userId = req.user.id;
    const { db: firestore } = getFirebase();

    if (!firestore) {
      const friends = db.prepare(`
        SELECT f.*, u.id as friend_id, u.username as friend_username, u.role as friend_role,
               COALESCE(sp.name, rp.company_name) as friend_name,
               COALESCE(sp.profile_picture_url, rp.profile_picture_url) as friend_avatar
        FROM friends f
        JOIN users u ON (f.user_id1 = u.id OR f.user_id2 = u.id) AND u.id != ?
        LEFT JOIN student_profiles sp ON u.id = sp.user_id
        LEFT JOIN recruiter_profiles rp ON u.id = rp.user_id
        WHERE f.user_id1 = ? OR f.user_id2 = ?
      `).all(userId, userId, userId);
      return res.json(friends);
    }

    try {
      const friendsSnap1 = await firestore.collection('friends').where('user_id1', '==', userId.toString()).get();
      const friendsSnap2 = await firestore.collection('friends').where('user_id2', '==', userId.toString()).get();
      
      const friendDocs = [...friendsSnap1.docs, ...friendsSnap2.docs];
      const friends = await Promise.all(friendDocs.map(async doc => {
        const data = doc.data();
        const friendId = data.user_id1 === userId.toString() ? data.user_id2 : data.user_id1;
        
        const u = await firestore.collection('users').doc(friendId).get();
        const uData = u.data();
        
        let name = '';
        let avatar = '';
        if (uData?.role === 'STUDENT') {
          const p = await firestore.collection('student_profiles').doc(friendId).get();
          name = p.data()?.name || '';
          avatar = p.data()?.profile_picture_url || '';
        } else {
          const p = await firestore.collection('recruiter_profiles').doc(friendId).get();
          name = p.data()?.company_name || '';
          avatar = p.data()?.profile_picture_url || '';
        }

        return {
          id: doc.id,
          friend_id: friendId,
          friend_username: uData?.username,
          friend_role: uData?.role,
          friend_name: name,
          friend_avatar: avatar,
          created_at: data.created_at
        };
      }));

      res.json(friends);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/social/friend-requests', authenticate, async (req: any, res) => {
    const userId = req.user.id;
    const { db: firestore } = getFirebase();

    if (!firestore) {
      const requests = db.prepare(`
        SELECT fr.*, u.username as sender_username,
               COALESCE(sp.name, rp.company_name) as sender_name,
               COALESCE(sp.profile_picture_url, rp.profile_picture_url) as sender_avatar
        FROM friend_requests fr
        JOIN users u ON fr.sender_id = u.id
        LEFT JOIN student_profiles sp ON u.id = sp.user_id
        LEFT JOIN recruiter_profiles rp ON u.id = rp.user_id
        WHERE fr.receiver_id = ? AND fr.status = 'PENDING'
      `).all(userId);
      return res.json(requests);
    }

    try {
      const requestsSnap = await firestore.collection('friend_requests')
        .where('receiver_id', '==', userId.toString())
        .where('status', '==', 'PENDING')
        .get();
      
      const requests = await Promise.all(requestsSnap.docs.map(async doc => {
        const data = doc.data();
        const u = await firestore.collection('users').doc(data.sender_id).get();
        const uData = u.data();
        
        let name = '';
        let avatar = '';
        if (uData?.role === 'STUDENT') {
          const p = await firestore.collection('student_profiles').doc(data.sender_id).get();
          name = p.data()?.name || '';
          avatar = p.data()?.profile_picture_url || '';
        } else {
          const p = await firestore.collection('recruiter_profiles').doc(data.sender_id).get();
          name = p.data()?.company_name || '';
          avatar = p.data()?.profile_picture_url || '';
        }

        return {
          id: doc.id,
          ...data,
          sender_username: uData?.username,
          sender_name: name,
          sender_avatar: avatar
        };
      }));

      res.json(requests);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Chat Endpoints
  app.get('/api/chat/messages/:friendId', authenticate, async (req: any, res) => {
    const userId = req.user.id;
    const friendId = req.params.friendId;

    const { db: firestore } = getFirebase();
    if (!firestore) {
      const messages = db.prepare(`
        SELECT * FROM direct_messages 
        WHERE (sender_id = ? AND receiver_id = ?) 
           OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at ASC
      `).all(userId, parseInt(friendId), parseInt(friendId), userId);
      return res.json(messages);
    }

    try {
      const messages1 = await firestore.collection('direct_messages')
        .where('sender_id', '==', userId.toString())
        .where('receiver_id', '==', friendId.toString())
        .get();
      const messages2 = await firestore.collection('direct_messages')
        .where('sender_id', '==', friendId.toString())
        .where('receiver_id', '==', userId.toString())
        .get();
      
      const allMessages = [...messages1.docs, ...messages2.docs]
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      
      res.json(allMessages);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/chat/messages', authenticate, async (req: any, res) => {
    const senderId = req.user.id;
    const { receiverId, content } = req.body;

    if (!content) return res.status(400).json({ error: 'Content is required' });

    const { db: firestore } = getFirebase();
    if (!firestore) {
      const rId = parseInt(receiverId);
      // Check if they are friends
      const isFriend = db.prepare(`
        SELECT 1 FROM friends 
        WHERE (user_id1 = ? AND user_id2 = ?) 
           OR (user_id1 = ? AND user_id2 = ?)
      `).get(senderId, rId, rId, senderId);

      if (!isFriend) {
        return res.status(403).json({ error: 'You can only message friends' });
      }

      const result = db.prepare('INSERT INTO direct_messages (sender_id, receiver_id, content) VALUES (?, ?, ?)').run(senderId, rId, content);
      const newMessage = db.prepare('SELECT * FROM direct_messages WHERE id = ?').get(result.lastInsertRowid);
      
      await createNotification(rId, 'MESSAGE', 'New Message', `You have a new message from ${req.user.username}`, '/network');
      
      return res.json(newMessage);
    }

    try {
      // Check if they are friends in Firestore
      const isFriend1 = await firestore.collection('friends')
        .where('user_id1', '==', senderId.toString())
        .where('user_id2', '==', receiverId.toString())
        .get();
      const isFriend2 = await firestore.collection('friends')
        .where('user_id1', '==', receiverId.toString())
        .where('user_id2', '==', senderId.toString())
        .get();

      if (isFriend1.empty && isFriend2.empty) {
        return res.status(403).json({ error: 'You can only message friends' });
      }

      const messageData = {
        sender_id: senderId.toString(),
        receiver_id: receiverId.toString(),
        content,
        is_read: 0,
        created_at: new Date().toISOString()
      };

      const docRef = await firestore.collection('direct_messages').add(messageData);
      await createNotification(receiverId, 'MESSAGE', 'New Message', `You have a new message from ${req.user.username}`, '/network');
      
      res.json({ id: docRef.id, ...messageData });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
  });

  app.get('/api/auth/me', authenticate, async (req: any, res) => {
    const { db: firestore } = getFirebase();
    let name = req.user.email.split('@')[0];
    let profile_picture_url = null;

    try {
      if (!firestore) {
        if (req.user.role === 'STUDENT') {
          const profile = db.prepare('SELECT name, profile_picture_url FROM student_profiles WHERE user_id = ?').get(req.user.id);
          if (profile) {
            name = profile.name;
            profile_picture_url = profile.profile_picture_url;
          }
        } else if (req.user.role === 'RECRUITER') {
          const profile = db.prepare('SELECT company_name, profile_picture_url FROM recruiter_profiles WHERE user_id = ?').get(req.user.id);
          if (profile) {
            name = profile.company_name;
            profile_picture_url = profile.profile_picture_url;
          }
        }
      } else {
        if (req.user.role === 'STUDENT') {
          const profileDoc = await firestore.collection('student_profiles').doc(req.user.id).get();
          if (profileDoc.exists) {
            const data = profileDoc.data();
            name = data?.name;
            profile_picture_url = data?.profile_picture_url;
          }
        } else if (req.user.role === 'RECRUITER') {
          const profileDoc = await firestore.collection('recruiter_profiles').doc(req.user.id).get();
          if (profileDoc.exists) {
            const data = profileDoc.data();
            name = data?.company_name;
            profile_picture_url = data?.profile_picture_url;
          }
        }
      }
    } catch (err) {
      console.error('Error fetching name for /me:', err);
    }

    res.json({ user: { ...req.user, name, profile_picture_url } });
  });

  // File Upload Endpoint
  app.post('/api/upload', authenticate, upload.single('file'), async (req: any, res) => {
    console.log('[Upload] Request received');
    if (!req.file) {
      console.error('[Upload] No file in request');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    console.log('[Upload] File saved:', req.file.filename, 'to', req.file.path);
    
    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      console.error('[Upload] Invalid mimetype:', req.file.mimetype);
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Only PDF and image files are allowed' });
    }

    if (!fs.existsSync(req.file.path)) {
      console.error('[Upload] CRITICAL: File does not exist on disk after upload!');
      return res.status(500).json({ error: 'File failed to save on server' });
    }

    // Save to Database for persistence
    try {
      const fileData = fs.readFileSync(req.file.path);
      
      // 1. Save to SQLite
      db.prepare('INSERT OR REPLACE INTO files (id, filename, mimetype, data) VALUES (?, ?, ?, ?)').run(
        req.file.filename,
        req.file.originalname,
        req.file.mimetype,
        fileData
      );
      console.log('[Upload] File saved to SQLite database:', req.file.filename);

      // 2. Save to Firestore if available (for Cloud Run persistence)
      const { db: firestore } = getFirebase();
      if (firestore) {
        if (fileData.length < 1000000) { // Firestore limit is 1MB
          await firestore.collection('files').doc(req.file.filename).set({
            filename: req.file.originalname,
            mimetype: req.file.mimetype,
            data: fileData.toString('base64'),
            created_at: new Date().toISOString()
          });
          console.log('[Upload] File saved to Firestore:', req.file.filename);
        } else {
          console.warn('[Upload] File too large for Firestore (> 1MB):', req.file.filename);
        }
      }
    } catch (dbErr) {
      console.error('[Upload] Error saving to database:', dbErr);
      // We continue because the file is on disk, but this is a warning
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
  });

  // Profile Endpoints
  app.get('/api/students/:id', authenticate, async (req: any, res) => {
    if (req.user.role !== 'RECRUITER' && req.user.role !== 'ADMIN' && req.user.id !== req.params.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { db: firestore } = getFirebase();
    if (!firestore) {
      const profile = db.prepare(`
        SELECT sp.*, u.email 
        FROM student_profiles sp 
        JOIN users u ON sp.user_id = u.id 
        WHERE sp.user_id = ?
      `).get(req.params.id);
      if (profile) {
        const skills = db.prepare('SELECT skill FROM user_skills WHERE user_id = ?').all(req.params.id);
        profile.skills = skills.map((s: any) => s.skill);
        
        // Increment views
        db.prepare('UPDATE student_profiles SET views = views + 1 WHERE user_id = ?').run(req.params.id);
      }
      return res.json(profile);
    }

    try {
      const doc = await firestore.collection('student_profiles').doc(req.params.id).get();
      if (doc.exists) {
        const userDoc = await firestore.collection('users').doc(req.params.id).get();
        const profileData = { ...doc.data(), email: userDoc.data()?.email };
        
        // Increment views in firestore
        await firestore.collection('student_profiles').doc(req.params.id).update({
          views: (doc.data()?.views || 0) + 1
        });
        return res.json(profileData);
      }
      res.status(404).json({ error: 'Profile not found' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/profile', authenticate, async (req: any, res) => {
    const { db: firestore } = getFirebase();
    if (!firestore) {
      let profile;
      if (req.user.role === 'STUDENT') {
        profile = db.prepare(`
          SELECT sp.*, u.email 
          FROM student_profiles sp 
          JOIN users u ON sp.user_id = u.id 
          WHERE sp.user_id = ?
        `).get(req.user.id);
        if (profile) {
          const skills = db.prepare('SELECT skill FROM user_skills WHERE user_id = ?').all(req.user.id);
          profile.skills = skills.map((s: any) => s.skill);
        }
      } else if (req.user.role === 'RECRUITER') {
        profile = db.prepare(`
          SELECT rp.*, u.email 
          FROM recruiter_profiles rp 
          JOIN users u ON rp.user_id = u.id 
          WHERE rp.user_id = ?
        `).get(req.user.id);
      }
      return res.json(profile);
    }

    try {
      let profile;
      if (req.user.role === 'STUDENT') {
        const doc = await firestore.collection('student_profiles').doc(req.user.id).get();
        const userDoc = await firestore.collection('users').doc(req.user.id).get();
        profile = doc.exists ? { ...doc.data(), email: userDoc.data()?.email } : null;
      } else if (req.user.role === 'RECRUITER') {
        const doc = await firestore.collection('recruiter_profiles').doc(req.user.id).get();
        const userDoc = await firestore.collection('users').doc(req.user.id).get();
        profile = doc.exists ? { ...doc.data(), email: userDoc.data()?.email } : null;
      }
      res.json(profile);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/profile', authenticate, async (req: any, res) => {
    const { 
      name, headline, education, college_name, degree, branch, graduation_year, cgpa, bio, location, linkedin_url, github_url, portfolio_url, experience_years, phone, profile_picture_url,
      company_name, company_bio, company_website, industry, company_size, 
      skills 
    } = req.body;
    const { db: firestore } = getFirebase();

    try {
      if (!firestore) {
        if (req.user.role === 'STUDENT') {
          const result = db.prepare(`
            UPDATE student_profiles 
            SET name = ?, headline = ?, education = ?, college_name = ?, degree = ?, branch = ?, graduation_year = ?, cgpa = ?, bio = ?, location = ?, linkedin_url = ?, github_url = ?, portfolio_url = ?, experience_years = ?, phone = ?, profile_picture_url = ? 
            WHERE user_id = ?
          `).run(
            name || null, 
            headline || null,
            education || null, 
            college_name || null,
            degree || null,
            branch || null,
            graduation_year || null,
            cgpa || null,
            bio || null, 
            location || null, 
            linkedin_url || null, 
            github_url || null, 
            portfolio_url || null, 
            experience_years !== undefined && !isNaN(Number(experience_years)) ? Number(experience_years) : null, 
            phone || null,
            profile_picture_url || null,
            req.user.id
          );
          
          if (result.changes === 0) {
            // If update failed, maybe the profile doesn't exist? (shouldn't happen but let's be safe)
            db.prepare('INSERT OR IGNORE INTO student_profiles (user_id, name) VALUES (?, ?)').run(req.user.id, name || '');
            // Retry update
            db.prepare(`
              UPDATE student_profiles 
              SET name = ?, headline = ?, education = ?, college_name = ?, degree = ?, branch = ?, graduation_year = ?, cgpa = ?, bio = ?, location = ?, linkedin_url = ?, github_url = ?, portfolio_url = ?, experience_years = ?, phone = ?, profile_picture_url = ? 
              WHERE user_id = ?
            `).run(
              name || null, 
              headline || null,
              education || null, 
              college_name || null,
              degree || null,
              branch || null,
              graduation_year || null,
              cgpa || null,
              bio || null, 
              location || null, 
              linkedin_url || null, 
              github_url || null, 
              portfolio_url || null, 
              experience_years !== undefined && !isNaN(Number(experience_years)) ? Number(experience_years) : null, 
              phone || null,
              profile_picture_url || null,
              req.user.id
            );
          }
          
          if (skills) {
            db.prepare('DELETE FROM user_skills WHERE user_id = ?').run(req.user.id);
            const insertSkill = db.prepare('INSERT INTO user_skills (user_id, skill) VALUES (?, ?)');
            const skillList = Array.isArray(skills) ? skills : (typeof skills === 'string' ? skills.split(',') : []);
            skillList.forEach((skill: string) => {
              const trimmed = skill.trim();
              if (trimmed) insertSkill.run(req.user.id, trimmed);
            });
          }
        } else if (req.user.role === 'RECRUITER') {
          const result = db.prepare(`
            UPDATE recruiter_profiles 
            SET company_name = ?, headline = ?, company_bio = ?, company_website = ?, industry = ?, company_size = ?, location = ?, phone = ?, profile_picture_url = ? 
            WHERE user_id = ?
          `).run(
            company_name || null, 
            headline || null,
            company_bio || null, 
            company_website || null, 
            industry || null, 
            company_size || null, 
            location || null, 
            phone || null,
            profile_picture_url || null,
            req.user.id
          );

          if (result.changes === 0) {
            db.prepare('INSERT OR IGNORE INTO recruiter_profiles (user_id, company_name) VALUES (?, ?)').run(req.user.id, company_name || '');
            db.prepare(`
              UPDATE recruiter_profiles 
              SET company_name = ?, headline = ?, company_bio = ?, company_website = ?, industry = ?, company_size = ?, location = ?, phone = ?, profile_picture_url = ? 
              WHERE user_id = ?
            `).run(
              company_name || null, 
              headline || null,
              company_bio || null, 
              company_website || null, 
              industry || null, 
              company_size || null, 
              location || null, 
              phone || null,
              profile_picture_url || null,
              req.user.id
            );
          }
        }
        return res.json({ success: true });
      }

      if (req.user.role === 'STUDENT') {
        await firestore.collection('student_profiles').doc(req.user.id).set({
          user_id: req.user.id,
          name: name || '',
          headline: headline || '',
          education: education || '',
          college_name: college_name || '',
          degree: degree || '',
          branch: branch || '',
          graduation_year: graduation_year || '',
          cgpa: cgpa || '',
          bio: bio || '',
          location: location || '',
          linkedin_url: linkedin_url || '',
          github_url: github_url || '',
          portfolio_url: portfolio_url || '',
          phone: phone || '',
          profile_picture_url: profile_picture_url || '',
          experience_years: experience_years !== undefined && !isNaN(Number(experience_years)) ? Number(experience_years) : 0,
          skills: Array.isArray(skills) ? skills : (typeof skills === 'string' ? skills.split(',').map(s => s.trim()) : [])
        }, { merge: true });
      } else if (req.user.role === 'RECRUITER') {
        await firestore.collection('recruiter_profiles').doc(req.user.id).set({
          user_id: req.user.id,
          company_name: company_name || '',
          headline: headline || '',
          company_bio: company_bio || '',
          company_website: company_website || '',
          industry: industry || '',
          company_size: company_size || '',
          location: location || '',
          phone: phone || '',
          profile_picture_url: profile_picture_url || ''
        }, { merge: true });
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error('Profile update error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/extract-text', authenticate, upload.single('file'), async (req: any, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;

    try {
      const dataBuffer = fs.readFileSync(filePath);
      
      // Robust pdf-parse usage
      let resolvedPdfParse = pdfParse;
      if (typeof resolvedPdfParse !== 'function' && resolvedPdfParse) {
        if (typeof (resolvedPdfParse as any).default === 'function') {
          resolvedPdfParse = (resolvedPdfParse as any).default;
        } else if (typeof (resolvedPdfParse as any).pdf === 'function') {
          resolvedPdfParse = (resolvedPdfParse as any).pdf;
        }
      }

      if (typeof resolvedPdfParse !== 'function') {
        console.error('[Error] pdfParse is not a function at runtime. Type:', typeof resolvedPdfParse, 'Value:', resolvedPdfParse);
        throw new Error(`pdfParse is not a function (type: ${typeof resolvedPdfParse}). This usually means the module was not loaded correctly.`);
      }
      
      let data;
      try {
        // Try as a function first
        data = await resolvedPdfParse(dataBuffer);
      } catch (err: any) {
        // If it's a class constructor error, try with 'new'
        if (err instanceof TypeError && err.message.includes("without 'new'")) {
          console.log('[Runtime] pdfParse seems to be a class, retrying with new...');
          try {
            // Some newer versions might be a class
            const pdfParser = new resolvedPdfParse();
            data = await pdfParser.parse(dataBuffer);
          } catch (newErr: any) {
            // If that also fails, try just new pdfParse(buffer)
            try {
              data = await new resolvedPdfParse(dataBuffer);
            } catch (finalErr: any) {
              throw err; // Throw original error if both new attempts fail
            }
          }
        } else {
          throw err;
        }
      }
      
      if (!data || !data.text || data.text.trim().length === 0) {
        throw new Error('No text could be extracted from this PDF. Please ensure it is not a scanned image.');
      }
      
      // Clean up the file after extraction
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      res.json({ text: data.text });
    } catch (err: any) {
      console.error('Error extracting text:', err);
      
      // Ensure cleanup on error
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (unlinkErr) {
          console.error('Failed to delete file after error:', unlinkErr);
        }
      }
      
      res.status(500).json({ error: err.message || 'Failed to extract text from PDF' });
    }
  });

  app.post('/api/analyze-resume', authenticate, async (req: any, res) => {
    const { text } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Gemini API Key is missing on server.' });
    }

    try {
      // Use the class with 'new'
      const ai = new GoogleGenAIClass({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze the following resume text and provide a professional evaluation. 
        Return the result in JSON format with the following structure:
        {
          "score": number (0-100),
          "summary": "brief professional summary",
          "strengths": ["list", "of", "strengths"],
          "weaknesses": ["list", "of", "weaknesses"],
          "missing_skills": ["skills", "that", "could", "be", "added"],
          "formatting_tips": ["tips", "to", "improve", "layout"],
          "keywords_to_add": ["important", "keywords", "for", "ATS"],
          "overall_verdict": "final recommendation"
        }
        
        Resume Text:
        ${text}`,
        config: {
          responseMimeType: "application/json",
        }
      });

      const result = JSON.parse(response.text);
      res.json(result);
    } catch (err: any) {
      console.error('Gemini analysis error:', err);
      res.status(500).json({ error: err.message || 'Failed to analyze resume' });
    }
  });

  app.post('/api/resume-analysis', authenticate, async (req: any, res) => {
    const { resume_name, score, analysis_json } = req.body;
    try {
      db.prepare(`
        INSERT INTO resume_analyses (user_id, resume_name, score, analysis_json)
        VALUES (?, ?, ?, ?)
      `).run(req.user.id, resume_name, score, JSON.stringify(analysis_json));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/resume-analyses', authenticate, async (req: any, res) => {
    try {
      const analyses = db.prepare(`
        SELECT * FROM resume_analyses WHERE user_id = ? ORDER BY created_at DESC
      `).all(req.user.id);
      res.json(analyses.map((a: any) => ({
        ...a,
        analysis_json: JSON.parse(a.analysis_json)
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Job Endpoints
  app.get('/api/jobs', authenticate, async (req: any, res) => {
    const { db: firestore } = getFirebase();
    if (!firestore) {
      let jobs;
      if (req.user.role === 'RECRUITER') {
        jobs = db.prepare('SELECT * FROM jobs WHERE recruiter_id = ?').all(req.user.id);
      } else if (req.user.role === 'ADMIN') {
        jobs = db.prepare('SELECT jobs.*, recruiter_profiles.company_name FROM jobs JOIN recruiter_profiles ON jobs.recruiter_id = recruiter_profiles.user_id').all();
      } else {
        // Students see approved and pending jobs for now to ensure connectivity
        jobs = db.prepare(`
          SELECT jobs.*, 
                 COALESCE(recruiter_profiles.company_name, 'Unknown Company') as company_name, 
                 recruiter_profiles.user_id as recruiter_user_id,
                 (SELECT 1 FROM applications WHERE job_id = jobs.id AND student_id = ?) as is_applied
          FROM jobs 
          LEFT JOIN recruiter_profiles ON jobs.recruiter_id = recruiter_profiles.user_id 
          WHERE jobs.status IN ('APPROVED', 'PENDING')
        `).all(req.user.id);
        
        // Increment recruiter profile views when student views jobs
        const recruiterIds = [...new Set(jobs.map((j: any) => j.recruiter_user_id).filter(Boolean))];
        if (recruiterIds.length > 0) {
          const updateViews = db.prepare('UPDATE recruiter_profiles SET views = views + 1 WHERE user_id = ?');
          recruiterIds.forEach(id => updateViews.run(id));
        }

        // Calculate Skill Match for Student (Case-Insensitive)
        const userSkills = db.prepare('SELECT skill FROM user_skills WHERE user_id = ?').all(req.user.id).map((s: any) => s.skill.toLowerCase().trim());
        jobs = jobs.map((job: any) => {
          const requirements = safeParse(job.requirements).map((r: string) => r.toLowerCase().trim());
          const matches = requirements.filter((req: string) => userSkills.includes(req));
          const matchPercentage = requirements.length > 0 ? Math.round((matches.length / requirements.length) * 100) : 0;
          return { ...job, matchPercentage };
        });
      }
      return res.json(jobs);
    }

    try {
      let jobsSnap;
      if (req.user.role === 'RECRUITER') {
        jobsSnap = await firestore.collection('jobs').where('recruiter_id', '==', req.user.id).get();
      } else {
        jobsSnap = await firestore.collection('jobs').get();
      }

      let jobs = await Promise.all(jobsSnap.docs.map(async doc => {
        const data = doc.data();
        const recruiterSnap = await firestore.collection('recruiter_profiles').doc(data.recruiter_id).get();
        return {
          id: doc.id,
          ...data,
          company_name: recruiterSnap.exists ? recruiterSnap.data()?.company_name : 'Unknown Company'
        };
      }));

      if (req.user.role === 'STUDENT') {
        const studentDoc = await firestore.collection('student_profiles').doc(req.user.id).get();
        const userSkills = (studentDoc.data()?.skills || []).map((s: string) => s.toLowerCase().trim());
        
        // Fetch student's applications to mark applied jobs
        const applicationsSnap = await firestore.collection('applications')
          .where('student_id', '==', req.user.id)
          .get();
        const appliedJobIds = new Set(applicationsSnap.docs.map(doc => doc.data().job_id));

        jobs = jobs.map((job: any) => {
          const requirements = safeParse(job.requirements).map((r: string) => r.toLowerCase().trim());
          const matches = requirements.filter((req: string) => userSkills.includes(req));
          const matchPercentage = requirements.length > 0 ? Math.round((matches.length / requirements.length) * 100) : 0;
          return { 
            ...job, 
            matchPercentage,
            is_applied: appliedJobIds.has(job.id)
          };
        });
      }
      res.json(jobs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/jobs', authenticate, authorize(['RECRUITER']), async (req: any, res) => {
    const { title, description, requirements, location, work_type } = req.body;
    const { db: firestore } = getFirebase();

    if (!firestore) {
      const profile = db.prepare('SELECT is_verified FROM recruiter_profiles WHERE user_id = ?').get(req.user.id);
      const isVerified = profile ? profile.is_verified : 0;
      const status = isVerified ? 'APPROVED' : 'PENDING';
      
      db.prepare('INSERT INTO jobs (recruiter_id, title, description, requirements, status, location, work_type) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(req.user.id, title, description, JSON.stringify(requirements), status, location || null, work_type || 'ON_SITE');

      if (status === 'APPROVED') {
        const students = db.prepare("SELECT id FROM users WHERE role = 'STUDENT'").all();
        for (const s of students) {
          await createNotification(s.id, 'JOB_POSTED', 'New Job Opportunity', `A new job "${title}" has been posted.`, '/jobs');
        }
      }
      return res.json({ success: true });
    }

    try {
      const profileDoc = await firestore.collection('recruiter_profiles').doc(req.user.id).get();
      const isVerified = profileDoc.data()?.is_verified || 0;
      const status = isVerified ? 'APPROVED' : 'PENDING';

      const jobRef = await firestore.collection('jobs').add({
        recruiter_id: req.user.id,
        title,
        description,
        requirements,
        status,
        location: location || null,
        work_type: work_type || 'ON_SITE',
        created_at: new Date().toISOString()
      });

      if (status === 'APPROVED') {
        const studentsSnap = await firestore.collection('users').where('role', '==', 'STUDENT').get();
        for (const doc of studentsSnap.docs) {
          await createNotification(doc.id, 'JOB_POSTED', 'New Job Opportunity', `A new job "${title}" has been posted.`, '/jobs');
        }
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/jobs/:id/status', authenticate, authorize(['ADMIN']), async (req: any, res) => {
    const { status } = req.body;
    const { db: firestore } = getFirebase();
    if (!firestore) {
      db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(status, req.params.id);
      
      const job = db.prepare('SELECT recruiter_id, title FROM jobs WHERE id = ?').get(req.params.id);
      if (job) {
        if (status === 'APPROVED') {
          await createNotification(job.recruiter_id, 'APP_STATUS', 'Job Approved', `Your job "${job.title}" has been approved and is now live.`, '/dashboard');
          
          // Notify students
          const students = db.prepare("SELECT id FROM users WHERE role = 'STUDENT'").all();
          for (const s of students) {
            await createNotification(s.id, 'JOB_POSTED', 'New Job Opportunity', `A new job "${job.title}" has been posted.`, '/jobs');
          }
        } else if (status === 'FLAGGED') {
          await createNotification(job.recruiter_id, 'APP_STATUS', 'Job Flagged', `Your job "${job.title}" has been flagged by admin. Please review the requirements.`, '/dashboard');
        }
      }
      
      return res.json({ success: true });
    }

    try {
      await firestore.collection('jobs').doc(req.params.id).update({ status });
      
      const jobDoc = await firestore.collection('jobs').doc(req.params.id).get();
      const jobData = jobDoc.data();
      if (jobData) {
        if (status === 'APPROVED') {
          await createNotification(jobData.recruiter_id, 'APP_STATUS', 'Job Approved', `Your job "${jobData.title}" has been approved and is now live.`, '/dashboard');
          
          // Notify students
          const studentsSnap = await firestore.collection('users').where('role', '==', 'STUDENT').get();
          for (const doc of studentsSnap.docs) {
            await createNotification(doc.id, 'JOB_POSTED', 'New Job Opportunity', `A new job "${jobData.title}" has been posted.`, '/jobs');
          }
        } else if (status === 'FLAGGED') {
          await createNotification(jobData.recruiter_id, 'APP_STATUS', 'Job Flagged', `Your job "${jobData.title}" has been flagged by admin. Please review the requirements.`, '/dashboard');
        }
      }
      
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/recruiter/jobs/:id/status', authenticate, authorize(['RECRUITER']), async (req: any, res) => {
    const { status } = req.body;
    const { db: firestore } = getFirebase();
    
    if (status !== 'CLOSED') return res.status(400).json({ error: 'Recruiters can only close jobs.' });

    if (!firestore) {
      const jobId = Number(req.params.id);
      const recruiterId = Number(req.user.id);
      
      try {
        // Check if job exists and belongs to recruiter
        const job = db.prepare('SELECT id FROM jobs WHERE id = ? AND recruiter_id = ?').get(jobId, recruiterId);
        if (!job) {
          // Try without Number cast just in case
          const jobAlt = db.prepare('SELECT id FROM jobs WHERE id = ? AND recruiter_id = ?').get(req.params.id, req.user.id);
          if (!jobAlt) return res.status(404).json({ error: 'Job not found or not authorized.' });
        }

        // Notify applicants before deletion
        const applicants = db.prepare('SELECT student_id, jobs.title FROM applications JOIN jobs ON applications.job_id = jobs.id WHERE job_id = ?').all(jobId);
        for (const app of applicants) {
          await createNotification(app.student_id, 'APP_STATUS', 'Job Closed', `The job "${app.title}" has been closed by the recruiter.`, '/dashboard');
        }

        // Delete interviews related to applications of this job
        db.prepare(`
          DELETE FROM interviews 
          WHERE application_id IN (SELECT id FROM applications WHERE job_id = ?)
        `).run(jobId);
        
        // Delete applications
        db.prepare('DELETE FROM applications WHERE job_id = ?').run(jobId);
        
        // Delete job
        const result = db.prepare('DELETE FROM jobs WHERE id = ? AND recruiter_id = ?').run(jobId, recruiterId);
        
        if (result.changes === 0) return res.status(404).json({ error: 'Failed to delete job.' });
        return res.json({ success: true, message: 'Job deleted successfully' });
      } catch (err: any) {
        console.error('[JobDelete] Error:', err);
        return res.status(500).json({ error: err.message });
      }
    }

    try {
      const jobRef = firestore.collection('jobs').doc(req.params.id);
      const jobDoc = await jobRef.get();
      if (!jobDoc.exists || jobDoc.data()?.recruiter_id !== req.user.id) {
        return res.status(404).json({ error: 'Job not found or not authorized.' });
      }

      const batch = firestore.batch();
      
      // Find applications to delete
      const appsSnap = await firestore.collection('applications').where('job_id', '==', req.params.id).get();
      for (const appDoc of appsSnap.docs) {
        const appData = appDoc.data();
        await createNotification(appData.student_id, 'APP_STATUS', 'Job Closed', `A job you applied for has been closed by the recruiter.`, '/dashboard');

        // Find interviews for this application
        const interviewsSnap = await firestore.collection('interviews').where('application_id', '==', appDoc.id).get();
        interviewsSnap.docs.forEach(iDoc => batch.delete(iDoc.ref));
        batch.delete(appDoc.ref);
      }
      
      batch.delete(jobRef);
      await batch.commit();
      
      res.json({ success: true, message: 'Job deleted successfully' });
    } catch (err: any) {
      console.error('[JobDelete] Firestore Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Application Endpoints
  app.post('/api/applications', authenticate, authorize(['STUDENT']), async (req: any, res) => {
    const { job_id, resume_url, answers } = req.body;
    const { db: firestore } = getFirebase();

    if (!firestore) {
      try {
        const job = db.prepare('SELECT status, recruiter_id, title FROM jobs WHERE id = ?').get(job_id);
        if (!job) return res.status(404).json({ error: 'Job not found.' });
        if (job.status === 'CLOSED') return res.status(400).json({ error: 'This job is closed.' });

        const result = db.prepare('INSERT INTO applications (job_id, student_id, resume_url, answers) VALUES (?, ?, ?, ?)')
          .run(job_id, req.user.id, resume_url, JSON.stringify(answers));
        const appId = result.lastInsertRowid;
      
      if (job) {
        await createNotification(job.recruiter_id, 'APP_STATUS', 'New Application', `You have a new application for "${job.title}"`, `/applications?id=${appId}`);
      }
      
      res.json({ success: true });
      } catch (err: any) {
        if (err.message.includes('UNIQUE constraint failed')) return res.status(400).json({ error: 'Already applied.' });
        res.status(500).json({ error: err.message });
      }
      return;
    }

    try {
      const jobDoc = await firestore.collection('jobs').doc(job_id).get();
      if (!jobDoc.exists) return res.status(404).json({ error: 'Job not found.' });
      if (jobDoc.data()?.status === 'CLOSED') return res.status(400).json({ error: 'Job is closed.' });

      // Check duplicate
      const dupSnap = await firestore.collection('applications')
        .where('job_id', '==', job_id)
        .where('student_id', '==', req.user.id)
        .get();
      if (!dupSnap.empty) return res.status(400).json({ error: 'Already applied.' });

      const appRef = await firestore.collection('applications').add({
        job_id,
        student_id: req.user.id,
        resume_url,
        answers,
        status: 'PENDING',
        created_at: new Date().toISOString()
      });

      const jobData = jobDoc.data();
      await createNotification(jobData?.recruiter_id, 'APP_STATUS', 'New Application', `You have a new application for "${jobData?.title}"`, `/applications?id=${appRef.id}`);

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/applications', authenticate, async (req: any, res) => {
    const { db: firestore } = getFirebase();
    if (!firestore) {
      let apps;
      if (req.user.role === 'STUDENT') {
        apps = db.prepare(`
          SELECT applications.*, jobs.title, jobs.status as job_status, recruiter_profiles.company_name 
          FROM applications 
          JOIN jobs ON applications.job_id = jobs.id 
          JOIN recruiter_profiles ON jobs.recruiter_id = recruiter_profiles.user_id 
          WHERE applications.student_id = ?
        `).all(req.user.id);
      } else if (req.user.role === 'RECRUITER') {
        apps = db.prepare(`
          SELECT applications.*, jobs.title, jobs.status as job_status, student_profiles.name as student_name 
          FROM applications 
          JOIN jobs ON applications.job_id = jobs.id 
          JOIN student_profiles ON applications.student_id = student_profiles.user_id 
          WHERE jobs.recruiter_id = ?
        `).all(req.user.id);
      }
      return res.json(apps);
    }

    try {
      let appsSnap;
      if (req.user.role === 'STUDENT') {
        appsSnap = await firestore.collection('applications').where('student_id', '==', req.user.id).get();
      } else if (req.user.role === 'RECRUITER') {
        // This is more complex in Firestore, we might need to get recruiter's jobs first
        const jobsSnap = await firestore.collection('jobs').where('recruiter_id', '==', req.user.id).get();
        const jobIds = jobsSnap.docs.map(d => d.id);
        if (jobIds.length === 0) return res.json([]);
        appsSnap = await firestore.collection('applications').where('job_id', 'in', jobIds).get();
      } else {
        return res.json([]);
      }

      const apps = await Promise.all(appsSnap.docs.map(async doc => {
        const data = doc.data();
        const jobDoc = await firestore.collection('jobs').doc(data.job_id).get();
        const jobData = jobDoc.data();
        
        let extra = {};
        if (req.user.role === 'STUDENT') {
          const recruiterDoc = await firestore.collection('recruiter_profiles').doc(jobData?.recruiter_id).get();
          extra = { company_name: recruiterDoc.data()?.company_name };
        } else {
          const studentDoc = await firestore.collection('student_profiles').doc(data.student_id).get();
          extra = { student_name: studentDoc.data()?.name };
        }

        return {
          id: doc.id,
          ...data,
          title: jobData?.title,
          job_status: jobData?.status,
          ...extra
        };
      }));
      res.json(apps);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/applications/:id/status', authenticate, authorize(['RECRUITER']), async (req: any, res) => {
    const { status } = req.body;
    const { db: firestore } = getFirebase();
    if (!firestore) {
      db.prepare('UPDATE applications SET status = ? WHERE id = ?').run(status, req.params.id);
      const app = db.prepare('SELECT student_id, jobs.title FROM applications JOIN jobs ON applications.job_id = jobs.id WHERE applications.id = ?').get(req.params.id);
      if (app) {
        await createNotification(app.student_id, 'APP_STATUS', 'Application Update', `Your application for "${app.title}" is now ${status}.`, '/applications');
      }
      return res.json({ success: true });
    }

    try {
      await firestore.collection('applications').doc(req.params.id).update({ status });
      const appDoc = await firestore.collection('applications').doc(req.params.id).get();
      const appData = appDoc.data();
      if (appData) {
        const jobDoc = await firestore.collection('jobs').doc(appData.job_id).get();
        await createNotification(appData.student_id, 'APP_STATUS', 'Application Update', `Your application for "${jobDoc.data()?.title}" is now ${status}.`, '/applications');
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin Endpoints
  app.get('/api/admin/recruiters', authenticate, authorize(['ADMIN']), async (req, res) => {
    const { db: firestore } = getFirebase();
    if (!firestore) {
      const recruiters = db.prepare(`
        SELECT recruiter_profiles.*, users.email 
        FROM recruiter_profiles 
        JOIN users ON recruiter_profiles.user_id = users.id
      `).all();
      return res.json(recruiters);
    }

    try {
      const recruitersSnap = await firestore.collection('recruiter_profiles').get();
      const recruiters = await Promise.all(recruitersSnap.docs.map(async doc => {
        const data = doc.data();
        const userDoc = await firestore.collection('users').doc(data.user_id).get();
        return {
          ...data,
          email: userDoc.data()?.email
        };
      }));
      res.json(recruiters);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/admin/recruiters/:id/verify', authenticate, authorize(['ADMIN']), async (req, res) => {
    const { is_verified } = req.body;
    const { db: firestore } = getFirebase();
    if (!firestore) {
      db.prepare('UPDATE recruiter_profiles SET is_verified = ? WHERE user_id = ?').run(is_verified ? 1 : 0, req.params.id);
      // Also auto-approve their pending jobs if verified
      if (is_verified) {
        await createNotification(req.params.id, 'APP_STATUS', 'Profile Verified', 'Your recruiter profile has been verified by the admin.', '/profile');
        
        const pendingJobs = db.prepare("SELECT id, title FROM jobs WHERE recruiter_id = ? AND status = 'PENDING'").all(req.params.id);
        db.prepare("UPDATE jobs SET status = 'APPROVED' WHERE recruiter_id = ? AND status = 'PENDING'").run(req.params.id);
        
        if (pendingJobs.length > 0) {
          const students = db.prepare("SELECT id FROM users WHERE role = 'STUDENT'").all();
          for (const job of pendingJobs) {
            for (const s of students) {
              await createNotification(s.id, 'JOB_POSTED', 'New Job Opportunity', `A new job "${job.title}" has been posted.`, '/jobs');
            }
          }
        }
      }
      return res.json({ success: true });
    }

    try {
      await firestore.collection('recruiter_profiles').doc(req.params.id).update({ is_verified: is_verified ? 1 : 0 });
      
      const statusText = is_verified ? 'verified' : 'unverified';
      await createNotification(req.params.id, 'APP_STATUS', `Profile ${is_verified ? 'Verified' : 'Unverified'}`, `Your recruiter profile has been ${statusText} by the admin.`, '/profile');

      if (is_verified) {
        const jobsSnap = await firestore.collection('jobs')
          .where('recruiter_id', '==', req.params.id)
          .where('status', '==', 'PENDING')
          .get();
        
        const batch = firestore.batch();
        jobsSnap.docs.forEach(doc => batch.update(doc.ref, { status: 'APPROVED' }));
        await batch.commit();

        if (!jobsSnap.empty) {
          const studentsSnap = await firestore.collection('users').where('role', '==', 'STUDENT').get();
          for (const jobDoc of jobsSnap.docs) {
            const jobData = jobDoc.data();
            for (const studentDoc of studentsSnap.docs) {
              await createNotification(studentDoc.id, 'JOB_POSTED', 'New Job Opportunity', `A new job "${jobData.title}" has been posted.`, '/jobs');
            }
          }
        }
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/stats', authenticate, authorize(['ADMIN']), (req, res) => {
    const totalJobs = db.prepare('SELECT COUNT(*) as count FROM jobs').get().count;
    const totalApps = db.prepare('SELECT COUNT(*) as count FROM applications').get().count;
    const totalShortlisted = db.prepare("SELECT COUNT(*) as count FROM applications WHERE status = 'SHORTLISTED'").get().count;
    const ratio = totalApps > 0 ? (totalShortlisted / totalApps).toFixed(2) : 0;
    res.json({ totalJobs, totalApps, totalShortlisted, ratio });
  });

  app.get('/api/dashboard/stats', authenticate, async (req: any, res) => {
    const { db: firestore } = getFirebase();
    if (!firestore) {
      if (req.user.role === 'STUDENT') {
        const profile = db.prepare('SELECT views FROM student_profiles WHERE user_id = ?').get(req.user.id);
        const applied = db.prepare('SELECT COUNT(*) as count FROM applications WHERE student_id = ?').get(req.user.id).count;
        const shortlisted = db.prepare("SELECT COUNT(*) as count FROM applications WHERE student_id = ? AND status = 'SHORTLISTED'").get(req.user.id).count;
        
        // Calculate average match score for top 5 jobs
        const userSkills = db.prepare('SELECT skill FROM user_skills WHERE user_id = ?').all(req.user.id).map((s: any) => s.skill.toLowerCase().trim());
        const jobs = db.prepare("SELECT requirements FROM jobs WHERE status = 'APPROVED'").all();
        let matchScores = jobs.map((job: any) => {
          const requirements = safeParse(job.requirements).map((r: string) => r.toLowerCase().trim());
          const matches = requirements.filter((req: string) => userSkills.includes(req));
          return requirements.length > 0 ? (matches.length / requirements.length) * 100 : 0;
        }).sort((a, b) => b - a).slice(0, 5);
        
        const avgMatch = matchScores.length > 0 ? Math.round(matchScores.reduce((a, b) => a + b, 0) / matchScores.length) : 0;
        
        res.json({ applied, shortlisted, views: profile?.views || 0, matchScore: `${avgMatch}%` });
      } else if (req.user.role === 'RECRUITER') {
        const profile = db.prepare('SELECT views FROM recruiter_profiles WHERE user_id = ?').get(req.user.id);
        const activeJobs = db.prepare("SELECT COUNT(*) as count FROM jobs WHERE recruiter_id = ? AND status = 'APPROVED'").get(req.user.id).count;
        const totalApplicants = db.prepare(`
          SELECT COUNT(*) as count FROM applications 
          JOIN jobs ON applications.job_id = jobs.id 
          WHERE jobs.recruiter_id = ?
        `).get(req.user.id).count;
        const pendingReviews = db.prepare(`
          SELECT COUNT(*) as count FROM applications 
          JOIN jobs ON applications.job_id = jobs.id 
          WHERE jobs.recruiter_id = ? AND applications.status = 'PENDING'
        `).get(req.user.id).count;
        
        const profileForVerify = db.prepare('SELECT is_verified FROM recruiter_profiles WHERE user_id = ?').get(req.user.id);
        const isVerified = profileForVerify ? profileForVerify.is_verified : 0;

        res.json({ activeJobs, totalApplicants, pendingReviews, isVerified: isVerified ? 'Verified' : 'Pending', views: profile?.views || 0 });
      } else {
        res.status(400).json({ error: 'Not applicable for admin' });
      }
      return;
    }

    try {
      if (req.user.role === 'STUDENT') {
        const profileDoc = await firestore.collection('student_profiles').doc(req.user.id).get();
        const appsSnap = await firestore.collection('applications').where('student_id', '==', req.user.id).get();
        const shortlistedSnap = await firestore.collection('applications')
          .where('student_id', '==', req.user.id)
          .where('status', '==', 'SHORTLISTED')
          .get();
        
        res.json({ 
          views: profileDoc.data()?.views || 0, 
          applied: appsSnap.size, 
          shortlisted: shortlistedSnap.size,
          matchScore: '0%' // Simplified
        });
      } else if (req.user.role === 'RECRUITER') {
        const profileDoc = await firestore.collection('recruiter_profiles').doc(req.user.id).get();
        const jobsSnap = await firestore.collection('jobs')
          .where('recruiter_id', '==', req.user.id)
          .where('status', '==', 'APPROVED')
          .get();
        
        const allJobsSnap = await firestore.collection('jobs').where('recruiter_id', '==', req.user.id).get();
        const jobIds = allJobsSnap.docs.map(d => d.id);
        
        let totalApplicants = 0;
        let pendingReviews = 0;
        if (jobIds.length > 0) {
          const appsSnap = await firestore.collection('applications').where('job_id', 'in', jobIds).get();
          totalApplicants = appsSnap.size;
          pendingReviews = appsSnap.docs.filter(d => d.data().status === 'PENDING').length;
        }

        const isVerified = profileDoc.data()?.is_verified || 0;
        res.json({ 
          activeJobs: jobsSnap.size, 
          totalApplicants, 
          pendingReviews, 
          isVerified: isVerified ? 'Verified' : 'Pending', 
          views: profileDoc.data()?.views || 0 
        });
      } else {
        res.status(400).json({ error: 'Not applicable for admin' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Chat Endpoints
  app.get('/api/messages/:applicationId', authenticate, async (req: any, res) => {
    const { applicationId } = req.params;
    const { db: firestore } = getFirebase();

    // Verify user is part of the application
    if (!firestore) {
      const app = db.prepare(`
        SELECT applications.*, jobs.recruiter_id 
        FROM applications 
        JOIN jobs ON applications.job_id = jobs.id 
        WHERE applications.id = ?
      `).get(Number(applicationId));

      if (!app || (String(app.student_id) !== String(req.user.id) && String(app.recruiter_id) !== String(req.user.id))) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const messages = db.prepare('SELECT * FROM messages WHERE application_id = ? ORDER BY created_at ASC').all(Number(applicationId));
      return res.json(messages);
    }

    try {
      const appDoc = await firestore.collection('applications').doc(applicationId).get();
      if (!appDoc.exists) return res.status(404).json({ error: 'Application not found' });
      
      const appData = appDoc.data();
      const jobDoc = await firestore.collection('jobs').doc(appData.job_id).get();
      const jobData = jobDoc.data();

      if (String(appData.student_id) !== String(req.user.id) && String(jobData.recruiter_id) !== String(req.user.id)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const messagesSnap = await firestore.collection('messages')
        .where('application_id', '==', applicationId)
        .get();
      
      const messages = messagesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort manually to avoid index requirement
      messages.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      res.json(messages);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/messages', authenticate, async (req: any, res) => {
    const { application_id, content } = req.body;
    const applicationId = application_id; // Support both naming conventions
    const { db: firestore } = getFirebase();

    if (!firestore) {
      if (!applicationId) return res.status(400).json({ error: 'application_id is required' });
      
      const app = db.prepare(`
        SELECT applications.*, jobs.recruiter_id, jobs.title 
        FROM applications 
        JOIN jobs ON applications.job_id = jobs.id 
        WHERE applications.id = ?
      `).get(Number(applicationId));

      if (!app || (String(app.student_id) !== String(req.user.id) && String(app.recruiter_id) !== String(req.user.id))) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      if (app.status !== 'SHORTLISTED' && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Chat is only enabled for shortlisted candidates.' });
      }

      db.prepare('INSERT INTO messages (application_id, sender_id, content) VALUES (?, ?, ?)')
        .run(Number(applicationId), req.user.id, content);
      
      const recipientId = String(app.student_id) === String(req.user.id) ? app.recruiter_id : app.student_id;
      await createNotification(recipientId, 'MESSAGE', 'New Message', `You have a new message regarding "${app.title}"`, `/applications?id=${applicationId}`);
      
      return res.json({ success: true });
    }

    try {
      const appDoc = await firestore.collection('applications').doc(applicationId).get();
      if (!appDoc.exists) return res.status(404).json({ error: 'Application not found' });
      
      const appData = appDoc.data();
      const jobDoc = await firestore.collection('jobs').doc(appData?.job_id).get();
      const jobData = jobDoc.data();

      if (String(appData?.student_id) !== String(req.user.id) && String(jobData?.recruiter_id) !== String(req.user.id)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      if (appData?.status !== 'SHORTLISTED' && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Chat is only enabled for shortlisted candidates.' });
      }

      await firestore.collection('messages').add({
        application_id: applicationId,
        sender_id: req.user.id,
        content,
        created_at: new Date().toISOString()
      });

      const recipientId = String(appData?.student_id) === String(req.user.id) ? jobData?.recruiter_id : appData?.student_id;
      await createNotification(recipientId, 'MESSAGE', 'New Message', `You have a new message regarding "${jobData?.title}"`, `/applications?id=${applicationId}`);

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Interview Endpoints
  app.get('/api/interviews', authenticate, async (req: any, res) => {
    const { db: firestore } = getFirebase();
    if (!firestore) {
      let interviews;
      if (req.user.role === 'RECRUITER') {
        interviews = db.prepare(`
          SELECT interviews.*, jobs.title as job_title, student_profiles.name as student_name
          FROM interviews
          JOIN applications ON interviews.application_id = applications.id
          JOIN jobs ON applications.job_id = jobs.id
          JOIN student_profiles ON interviews.student_id = student_profiles.user_id
          WHERE interviews.recruiter_id = ?
          ORDER BY scheduled_at ASC
        `).all(req.user.id);
      } else if (req.user.role === 'STUDENT') {
        interviews = db.prepare(`
          SELECT interviews.*, jobs.title as job_title, recruiter_profiles.company_name
          FROM interviews
          JOIN applications ON interviews.application_id = applications.id
          JOIN jobs ON applications.job_id = jobs.id
          JOIN recruiter_profiles ON interviews.recruiter_id = recruiter_profiles.user_id
          WHERE interviews.student_id = ?
          ORDER BY scheduled_at ASC
        `).all(req.user.id);
      } else {
        interviews = db.prepare('SELECT * FROM interviews').all();
      }
      return res.json(interviews);
    }

    try {
      let interviewsSnap;
      if (req.user.role === 'RECRUITER') {
        interviewsSnap = await firestore.collection('interviews').where('recruiter_id', '==', req.user.id).get();
      } else if (req.user.role === 'STUDENT') {
        interviewsSnap = await firestore.collection('interviews').where('student_id', '==', req.user.id).get();
      } else {
        interviewsSnap = await firestore.collection('interviews').get();
      }

      const interviews = await Promise.all(interviewsSnap.docs.map(async doc => {
        const data = doc.data();
        const appDoc = await firestore.collection('applications').doc(data.application_id).get();
        const appData = appDoc.data();
        const jobDoc = await firestore.collection('jobs').doc(appData?.job_id).get();
        const jobData = jobDoc.data();
        
        let extraInfo = {};
        if (req.user.role === 'RECRUITER') {
          const studentDoc = await firestore.collection('student_profiles').doc(data.student_id).get();
          extraInfo = { student_name: studentDoc.data()?.name };
        } else {
          const recruiterDoc = await firestore.collection('recruiter_profiles').doc(data.recruiter_id).get();
          extraInfo = { company_name: recruiterDoc.data()?.company_name };
        }

        return {
          id: doc.id,
          ...data,
          job_title: jobData?.title,
          ...extraInfo
        };
      }));

      res.json(interviews);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/interviews', authenticate, authorize(['RECRUITER']), async (req: any, res) => {
    const { application_id, student_id, scheduled_at, meeting_link, notes } = req.body;
    const { db: firestore } = getFirebase();

    if (!firestore) {
      db.prepare(`
        INSERT INTO interviews (application_id, recruiter_id, student_id, scheduled_at, meeting_link, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(application_id, req.user.id, student_id, scheduled_at, meeting_link, notes);
      
      const app = db.prepare('SELECT jobs.title FROM applications JOIN jobs ON applications.job_id = jobs.id WHERE applications.id = ?').get(application_id);
      await createNotification(student_id, 'INTERVIEW', 'Interview Invitation', `You have been invited for an interview for "${app?.title || 'a job'}"`, '/interviews');
      
      return res.json({ success: true });
    }

    try {
      await firestore.collection('interviews').add({
        application_id,
        recruiter_id: req.user.id,
        student_id,
        scheduled_at,
        meeting_link,
        notes,
        status: 'SCHEDULED',
        created_at: new Date().toISOString()
      });

      const appDoc = await firestore.collection('applications').doc(application_id).get();
      const jobDoc = await firestore.collection('jobs').doc(appDoc.data()?.job_id).get();
      await createNotification(student_id, 'INTERVIEW', 'Interview Invitation', `You have been invited for an interview for "${jobDoc.data()?.title || 'a job'}"`, '/interviews');

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/interviews/:id/status', authenticate, async (req: any, res) => {
    const { status } = req.body;
    const { db: firestore } = getFirebase();

    if (!firestore) {
      const interviewId = isNaN(Number(req.params.id)) ? req.params.id : Number(req.params.id);
      db.prepare('UPDATE interviews SET status = ? WHERE id = ?').run(status, interviewId);
      
      const interview = db.prepare('SELECT recruiter_id, student_id, jobs.title FROM interviews JOIN applications ON interviews.application_id = applications.id JOIN jobs ON applications.job_id = jobs.id WHERE interviews.id = ?').get(interviewId);
      if (interview) {
        const recipientId = req.user.id === interview.recruiter_id ? interview.student_id : interview.recruiter_id;
        await createNotification(recipientId, 'INTERVIEW', 'Interview Update', `The interview for "${interview.title}" has been marked as ${status}.`, '/interviews');
      }
      
      return res.json({ success: true });
    }

    try {
      await firestore.collection('interviews').doc(req.params.id).update({ status });
      
      const interviewDoc = await firestore.collection('interviews').doc(req.params.id).get();
      const interviewData = interviewDoc.data();
      if (interviewData) {
        const appDoc = await firestore.collection('applications').doc(interviewData.application_id).get();
        const jobDoc = await firestore.collection('jobs').doc(appDoc.data()?.job_id).get();
        
        const recipientId = req.user.id === interviewData.recruiter_id ? interviewData.student_id : interviewData.recruiter_id;
        await createNotification(recipientId, 'INTERVIEW', 'Interview Update', `The interview for "${jobDoc.data()?.title}" has been marked as ${status}.`, '/interviews');
      }
      
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Notification Endpoints
  app.get('/api/notifications', authenticate, async (req: any, res) => {
    const { db: firestore } = getFirebase();
    if (!firestore) {
      const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(Number(req.user.id));
      console.log(`[Backend] Fetched ${notifications.length} notifications for user ${req.user.id}`);
      return res.json(notifications);
    }

    try {
      const snap = await firestore.collection('notifications')
        .where('user_id', '==', req.user.id.toString())
        .get();
      const notifications = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort manually and limit to 50
      notifications.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const limited = notifications.slice(0, 50);
      console.log(`[Backend] Firestore: Fetched ${limited.length} notifications for user ${req.user.id}`);
      res.json(limited);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/notifications/:id/read', authenticate, async (req: any, res) => {
    const { db: firestore } = getFirebase();
    if (!firestore) {
      const notificationId = isNaN(Number(req.params.id)) ? req.params.id : Number(req.params.id);
      db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(notificationId, Number(req.user.id));
      return res.json({ success: true });
    }

    try {
      await firestore.collection('notifications').doc(req.params.id).update({ is_read: 1 });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/notifications/read-all', authenticate, async (req: any, res) => {
    const { db: firestore } = getFirebase();
    if (!firestore) {
      db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(Number(req.user.id));
      return res.json({ success: true });
    }

    try {
      const snap = await firestore.collection('notifications')
        .where('user_id', '==', req.user.id.toString())
        .where('is_read', '==', 0)
        .get();
      const batch = firestore.batch();
      snap.docs.forEach(doc => batch.update(doc.ref, { is_read: 1 }));
      await batch.commit();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Saved Jobs Endpoints
  app.post('/api/jobs/:id/save', authenticate, async (req: any, res) => {
    if (req.user.role !== 'STUDENT') return res.status(403).json({ error: 'Only students can save jobs' });
    const jobId = req.params.id;
    const userId = String(req.user.id);
    const { db: firestore } = getFirebase();

    if (!firestore) {
      try {
        const existing = db.prepare('SELECT * FROM saved_jobs WHERE user_id = ? AND job_id = ?').get(userId, jobId);
        if (existing) {
          db.prepare('DELETE FROM saved_jobs WHERE user_id = ? AND job_id = ?').run(userId, jobId);
          res.json({ saved: false });
        } else {
          db.prepare('INSERT INTO saved_jobs (user_id, job_id) VALUES (?, ?)').run(userId, jobId);
          res.json({ saved: true });
        }
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
      return;
    }

    try {
      const savedRef = firestore.collection('saved_jobs').doc(`${userId}_${jobId}`);
      const doc = await savedRef.get();
      if (doc.exists) {
        await savedRef.delete();
        res.json({ saved: false });
      } else {
        await savedRef.set({
          user_id: userId,
          job_id: jobId,
          created_at: new Date().toISOString()
        });
        res.json({ saved: true });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/jobs/saved', authenticate, async (req: any, res) => {
    if (req.user.role !== 'STUDENT') return res.status(403).json({ error: 'Only students can view saved jobs' });
    const userId = String(req.user.id);
    const { db: firestore } = getFirebase();

    if (!firestore) {
      try {
        const savedJobs = db.prepare(`
          SELECT j.*, rp.company_name, rp.profile_picture_url as company_logo
          FROM saved_jobs sj
          JOIN jobs j ON sj.job_id = j.id
          LEFT JOIN recruiter_profiles rp ON j.recruiter_id = rp.user_id
          WHERE sj.user_id = ?
          ORDER BY sj.created_at DESC
        `).all(userId);
        res.json(savedJobs);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
      return;
    }

    try {
      const savedSnap = await firestore.collection('saved_jobs')
        .where('user_id', '==', userId)
        .get();
      
      const savedDocs = savedSnap.docs.sort((a, b) => {
        const dateA = new Date(a.data().created_at || 0).getTime();
        const dateB = new Date(b.data().created_at || 0).getTime();
        return dateB - dateA;
      });

      const jobs = await Promise.all(savedDocs.map(async savedDoc => {
        const jobId = savedDoc.data().job_id;
        const jobDoc = await firestore.collection('jobs').doc(jobId).get();
        if (!jobDoc.exists) return null;
        
        const jobData = jobDoc.data();
        const recruiterSnap = await firestore.collection('recruiter_profiles').doc(jobData?.recruiter_id).get();
        
        return {
          id: jobDoc.id,
          ...jobData,
          company_name: recruiterSnap.exists ? recruiterSnap.data()?.company_name : 'Unknown Company',
          company_logo: recruiterSnap.exists ? recruiterSnap.data()?.profile_picture_url : null
        };
      }));

      res.json(jobs.filter(j => j !== null));
    } catch (err: any) {
      console.error('Error fetching saved jobs:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
