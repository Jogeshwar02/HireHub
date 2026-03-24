import admin from 'firebase-admin';

let firestore: admin.firestore.Firestore | null = null;
let auth: admin.auth.Auth | null = null;

export function getFirebase() {
  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      console.warn('Firebase environment variables are missing. Firebase features will not work.');
      return { db: null, auth: null };
    }

    const normalizedPrivateKey = privateKey
      .trim()
      .replace(/^"([\s\S]*)"$/, '$1')
      .replace(/\\n/g, '\n')
      .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
      .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----')
      .replace(/\n{2,}/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: normalizedPrivateKey,
      }),
    });
  }

  if (!firestore) firestore = admin.firestore();
  if (!auth) auth = admin.auth();

  return { db: firestore, auth };
}
