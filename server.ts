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
import { getFirebase } from './firebaseAdmin.js';

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
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
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
    password TEXT NOT NULL,
    role TEXT CHECK(role IN ('STUDENT', 'RECRUITER', 'ADMIN')) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS student_profiles (
    user_id INTEGER PRIMARY KEY,
    name TEXT,
    education TEXT,
    bio TEXT,
    location TEXT,
    linkedin_url TEXT,
    github_url TEXT,
    portfolio_url TEXT,
    experience_years INTEGER,
    views INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS recruiter_profiles (
    user_id INTEGER PRIMARY KEY,
    company_name TEXT,
    company_bio TEXT,
    company_website TEXT,
    industry TEXT,
    company_size TEXT,
    location TEXT,
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

  CREATE TABLE IF NOT EXISTS user_skills (
    user_id INTEGER,
    skill TEXT,
    PRIMARY KEY(user_id, skill),
    FOREIGN KEY(user_id) REFERENCES users(id)
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
  addColumn('student_profiles', 'linkedin_url', 'TEXT');
  addColumn('student_profiles', 'github_url', 'TEXT');
  addColumn('student_profiles', 'portfolio_url', 'TEXT');
  addColumn('student_profiles', 'experience_years', 'INTEGER');
  addColumn('student_profiles', 'views', 'INTEGER DEFAULT 0');

  addColumn('recruiter_profiles', 'company_website', 'TEXT');
  addColumn('recruiter_profiles', 'industry', 'TEXT');
  addColumn('recruiter_profiles', 'company_size', 'TEXT');
  addColumn('recruiter_profiles', 'location', 'TEXT');
  addColumn('recruiter_profiles', 'views', 'INTEGER DEFAULT 0');
  addColumn('notifications', 'is_read', 'INTEGER DEFAULT 0');

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
    const { email, password, role, name, company_name } = req.body;
    const { db: firestore } = getFirebase();
    
    if (!firestore) {
      // Fallback to SQLite if Firebase is not configured
      try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)').run(email, hashedPassword, role);
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
      
      await createNotification(user.id, 'MESSAGE', 'Welcome back!', `You logged in successfully.`, '/dashboard');
      
      res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: THIRTY_DAYS });
      res.json({ user: { id: user.id, email: user.email, role: user.role } });
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
      
      await createNotification(userDoc.id, 'MESSAGE', 'Welcome back!', `You logged in successfully.`, '/dashboard');
      
      res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: THIRTY_DAYS });
      res.json({ user: { id: userDoc.id, email: userData.email, role: userData.role } });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
  });

  app.get('/api/auth/me', authenticate, async (req: any, res) => {
    const { db: firestore } = getFirebase();
    let name = req.user.email.split('@')[0];

    try {
      if (!firestore) {
        if (req.user.role === 'STUDENT') {
          const profile = db.prepare('SELECT name FROM student_profiles WHERE user_id = ?').get(req.user.id);
          if (profile) name = profile.name;
        } else if (req.user.role === 'RECRUITER') {
          const profile = db.prepare('SELECT company_name FROM recruiter_profiles WHERE user_id = ?').get(req.user.id);
          if (profile) name = profile.company_name;
        }
      } else {
        if (req.user.role === 'STUDENT') {
          const profileDoc = await firestore.collection('student_profiles').doc(req.user.id).get();
          if (profileDoc.exists) name = profileDoc.data()?.name;
        } else if (req.user.role === 'RECRUITER') {
          const profileDoc = await firestore.collection('recruiter_profiles').doc(req.user.id).get();
          if (profileDoc.exists) name = profileDoc.data()?.company_name;
        }
      }
    } catch (err) {
      console.error('Error fetching name for /me:', err);
    }

    res.json({ user: { ...req.user, name } });
  });

  // File Upload Endpoint
  app.post('/api/upload', authenticate, upload.single('file'), async (req: any, res) => {
    console.log('[Upload] Request received');
    if (!req.file) {
      console.error('[Upload] No file in request');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    console.log('[Upload] File saved:', req.file.filename, 'to', req.file.path);
    
    if (req.file.mimetype !== 'application/pdf') {
      console.error('[Upload] Invalid mimetype:', req.file.mimetype);
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Only PDF files are allowed' });
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
  app.get('/api/profile', authenticate, async (req: any, res) => {
    const { db: firestore } = getFirebase();
    if (!firestore) {
      let profile;
      if (req.user.role === 'STUDENT') {
        profile = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(req.user.id);
        if (profile) {
          const skills = db.prepare('SELECT skill FROM user_skills WHERE user_id = ?').all(req.user.id);
          profile.skills = skills.map((s: any) => s.skill);
        }
      } else if (req.user.role === 'RECRUITER') {
        profile = db.prepare('SELECT * FROM recruiter_profiles WHERE user_id = ?').get(req.user.id);
      }
      return res.json(profile);
    }

    try {
      let profile;
      if (req.user.role === 'STUDENT') {
        const doc = await firestore.collection('student_profiles').doc(req.user.id).get();
        profile = doc.exists ? doc.data() : null;
      } else if (req.user.role === 'RECRUITER') {
        const doc = await firestore.collection('recruiter_profiles').doc(req.user.id).get();
        profile = doc.exists ? doc.data() : null;
      }
      res.json(profile);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/profile', authenticate, async (req: any, res) => {
    const { 
      name, education, bio, location, linkedin_url, github_url, portfolio_url, experience_years,
      company_name, company_bio, company_website, industry, company_size, 
      skills 
    } = req.body;
    const { db: firestore } = getFirebase();

    try {
      if (!firestore) {
        if (req.user.role === 'STUDENT') {
          const result = db.prepare(`
            UPDATE student_profiles 
            SET name = ?, education = ?, bio = ?, location = ?, linkedin_url = ?, github_url = ?, portfolio_url = ?, experience_years = ? 
            WHERE user_id = ?
          `).run(
            name || null, 
            education || null, 
            bio || null, 
            location || null, 
            linkedin_url || null, 
            github_url || null, 
            portfolio_url || null, 
            experience_years !== undefined && !isNaN(Number(experience_years)) ? Number(experience_years) : null, 
            req.user.id
          );
          
          if (result.changes === 0) {
            // If update failed, maybe the profile doesn't exist? (shouldn't happen but let's be safe)
            db.prepare('INSERT OR IGNORE INTO student_profiles (user_id, name) VALUES (?, ?)').run(req.user.id, name || '');
            // Retry update
            db.prepare(`
              UPDATE student_profiles 
              SET name = ?, education = ?, bio = ?, location = ?, linkedin_url = ?, github_url = ?, portfolio_url = ?, experience_years = ? 
              WHERE user_id = ?
            `).run(
              name || null, 
              education || null, 
              bio || null, 
              location || null, 
              linkedin_url || null, 
              github_url || null, 
              portfolio_url || null, 
              experience_years !== undefined && !isNaN(Number(experience_years)) ? Number(experience_years) : null, 
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
            SET company_name = ?, company_bio = ?, company_website = ?, industry = ?, company_size = ?, location = ? 
            WHERE user_id = ?
          `).run(
            company_name || null, 
            company_bio || null, 
            company_website || null, 
            industry || null, 
            company_size || null, 
            location || null, 
            req.user.id
          );

          if (result.changes === 0) {
            db.prepare('INSERT OR IGNORE INTO recruiter_profiles (user_id, company_name) VALUES (?, ?)').run(req.user.id, company_name || '');
            db.prepare(`
              UPDATE recruiter_profiles 
              SET company_name = ?, company_bio = ?, company_website = ?, industry = ?, company_size = ?, location = ? 
              WHERE user_id = ?
            `).run(
              company_name || null, 
              company_bio || null, 
              company_website || null, 
              industry || null, 
              company_size || null, 
              location || null, 
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
          education: education || '',
          bio: bio || '',
          location: location || '',
          linkedin_url: linkedin_url || '',
          github_url: github_url || '',
          portfolio_url: portfolio_url || '',
          experience_years: experience_years !== undefined && !isNaN(Number(experience_years)) ? Number(experience_years) : 0,
          skills: Array.isArray(skills) ? skills : (typeof skills === 'string' ? skills.split(',').map(s => s.trim()) : [])
        }, { merge: true });
      } else if (req.user.role === 'RECRUITER') {
        await firestore.collection('recruiter_profiles').doc(req.user.id).set({
          user_id: req.user.id,
          company_name: company_name || '',
          company_bio: company_bio || '',
          company_website: company_website || '',
          industry: industry || '',
          company_size: company_size || '',
          location: location || ''
        }, { merge: true });
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error('Profile update error:', err);
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
          SELECT jobs.*, COALESCE(recruiter_profiles.company_name, 'Unknown Company') as company_name, recruiter_profiles.user_id as recruiter_user_id
          FROM jobs 
          LEFT JOIN recruiter_profiles ON jobs.recruiter_id = recruiter_profiles.user_id 
          WHERE jobs.status IN ('APPROVED', 'PENDING')
        `).all();
        
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
        
        jobs = jobs.map((job: any) => {
          const requirements = safeParse(job.requirements).map((r: string) => r.toLowerCase().trim());
          const matches = requirements.filter((req: string) => userSkills.includes(req));
          const matchPercentage = requirements.length > 0 ? Math.round((matches.length / requirements.length) * 100) : 0;
          return { ...job, matchPercentage };
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

  app.post('/api/notifications/test', authenticate, async (req: any, res) => {
    await createNotification(req.user.id, 'MESSAGE', 'Test Notification', 'This is a test notification to verify the system is working.', '/dashboard');
    res.json({ success: true });
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

startServer();
