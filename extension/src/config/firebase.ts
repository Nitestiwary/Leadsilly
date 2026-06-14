// Firebase Client SDK Configuration
// ─────────────────────────────────────────────────────────────────────────────
// Fill in your Firebase project config from:
// Firebase Console → Project Settings → Your Apps → Web App → Config
//
// Steps to get these values:
// 1. Go to https://console.firebase.google.com
// 2. Create a project (or use existing one)
// 3. Project Settings → General → Your apps → Add app (Web)
// 4. Copy the firebaseConfig values below
// 5. Firebase Console → Authentication → Sign-in method → Enable "Email/Password"
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
  updateProfile,
  reload,
  type User,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || 'YOUR_API_KEY',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || 'YOUR_PROJECT.firebaseapp.com',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || 'YOUR_PROJECT_ID',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || 'YOUR_PROJECT.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID|| 'YOUR_SENDER_ID',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || 'YOUR_APP_ID',
};

const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// ── Helper: Sign Up + Send Verification Email ─────────────────────────────────
export const firebaseSignUp = async (
  name: string,
  email: string,
  password: string
): Promise<User> => {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const user = credential.user;

  // Set display name
  await updateProfile(user, { displayName: name });

  // Send verification email immediately
  await sendEmailVerification(user, {
    url: 'https://leadsilly.com',   // redirect after clicking link
    handleCodeInApp: false,
  });

  return user;
};

// ── Helper: Sign In ───────────────────────────────────────────────────────────
export const firebaseSignIn = async (
  email: string,
  password: string
): Promise<User> => {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
};

// ── Helper: Reload + Check Verified ──────────────────────────────────────────
export const checkEmailVerified = async (user: User): Promise<boolean> => {
  await reload(user);   // force refresh from Firebase server
  return user.emailVerified;
};

// ── Helper: Resend Verification Email ─────────────────────────────────────────
export const resendVerificationEmail = async (user: User): Promise<void> => {
  await sendEmailVerification(user, {
    url: 'https://leadsilly.com',
    handleCodeInApp: false,
  });
};

// ── Helper: Sign Out ──────────────────────────────────────────────────────────
export const firebaseSignOut = async (): Promise<void> => {
  await signOut(auth);
};

export { onAuthStateChanged, type User };
