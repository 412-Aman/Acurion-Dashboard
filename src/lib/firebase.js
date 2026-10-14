// Firebase Initialization
// -----------------------
// Single source of truth for all Firebase service instances.
// Import { auth, db, fs } from here - never call initializeApp more than once.

import { initializeApp } from 'firebase/app';
import { getAuth }        from 'firebase/auth';
import { getDatabase }    from 'firebase/database';
import { getFirestore }   from 'firebase/firestore';
import { authSettings,requiresEmailVerification } from './authPolicy.js';
export const firebaseConfig = {
  apiKey:            'AIzaSyAU9RV6Yc6BhOZ0-BInZcDX116p3zkL_jE',
  authDomain:        'acurion-2bd21.firebaseapp.com',
  databaseURL:       'https://acurion-2bd21-default-rtdb.firebaseio.com',
  projectId:         'acurion-2bd21',
  storageBucket:     'acurion-2bd21.firebasestorage.app',
  messagingSenderId: '898956623525',
  appId:             '1:898956623525:web:b3ce393aae9711c1c9574c',
  measurementId:     'G-S6CVPHKSCP',
};

// Firebase web configuration is public client identification, not an Admin credential.
const env = import.meta.env;
export const configurationIssues = env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_PROJECT_ID !== firebaseConfig.projectId
  ? ['VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_DATABASE_URL','VITE_FIREBASE_APP_ID'].filter(name => !env[name]) : [];
for (const [field, variable] of Object.entries({ apiKey:'VITE_FIREBASE_API_KEY', authDomain:'VITE_FIREBASE_AUTH_DOMAIN', databaseURL:'VITE_FIREBASE_DATABASE_URL', projectId:'VITE_FIREBASE_PROJECT_ID', storageBucket:'VITE_FIREBASE_STORAGE_BUCKET', messagingSenderId:'VITE_FIREBASE_MESSAGING_SENDER_ID', appId:'VITE_FIREBASE_APP_ID' })) {
  if (env[variable]) firebaseConfig[field] = env[variable];
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getDatabase(app);   // Realtime Database
export const fs   = getFirestore(app);  // Firestore

// Resolve restored authentication before protected database reads.
export async function requireSession() {
  if (configurationIssues.length) { const error=new Error('Complete the web configuration for the selected Firebase project.'); error.code='config/incomplete'; throw error; }
  await auth.authStateReady();
  if (!auth.currentUser) {
    const error = new Error('Sign in with a Firebase account before loading records.');
    error.code = 'auth/session-required';
    throw error;
  }
  if (authSettings(env).enabled && requiresEmailVerification(auth.currentUser)) { const error=new Error('Verify your email before accessing workspace data.');error.code='auth/email-unverified';throw error; }
  return auth.currentUser;
}
