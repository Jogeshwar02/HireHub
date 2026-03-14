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

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });
  }

  if (!firestore) firestore = admin.firestore();
  if (!auth) auth = admin.auth();

  return { db: firestore, auth };
}
