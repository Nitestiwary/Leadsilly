// Firebase Admin SDK — Server-side token verification
// ─────────────────────────────────────────────────────────────────────────────
// Required env vars (add to .env):
//   FIREBASE_PROJECT_ID   — from Firebase Console → Project Settings
//   FIREBASE_CLIENT_EMAIL — from Service Account JSON
//   FIREBASE_PRIVATE_KEY  — from Service Account JSON (keep newlines)
//
// To get the Service Account key:
//   Firebase Console → Project Settings → Service Accounts → Generate new private key
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';

let initialized = false;

export const initFirebaseAdmin = () => {
  if (initialized) return;

  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey  = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.warn(
      '[Firebase Admin] Missing env vars — FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY. ' +
      'Firebase token verification will be disabled.'
    );
    return;
  }

  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });

  initialized = true;
  console.log('[Firebase Admin] Initialized for project:', projectId);
};

// Verify a Firebase ID token and return the decoded token (contains uid, email, name)
export const verifyFirebaseToken = async (idToken: string): Promise<DecodedIdToken> => {
  if (!initialized) throw new Error('Firebase Admin not initialized');
  return getAuth().verifyIdToken(idToken);
};

