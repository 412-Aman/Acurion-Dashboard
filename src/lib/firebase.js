// Firebase Initialization
// -----------------------
// Single source of truth for all Firebase service instances.
// Import { auth, db, fs } from here - never call initializeApp more than once.

import { initializeApp } from 'firebase/app';
import { getAuth }        from 'firebase/auth';
import { getDatabase }    from 'firebase/database';
import { getFirestore }   from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey:            'AIzaSyAU9RV6Yc6BhOZ0-BInZcDX116p3zkL_jE',
  authDomain:        'acurion-2bd21.firebaseapp.com',
  databaseURL:       'https://acurion-2bd21-default-rtdb.firebaseio.com',
  projectId:         'acurion-2bd21',
  storageBucket:     'acurion-2bd21.firebasestorage.app',
  messagingSenderId: '898956623525',
  appId:             '1:898956623525:web:b3ce393aae9711c1c9574c',
  measurementId:     'G-S6CVPHKSCP',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getDatabase(app);   // Realtime Database
export const fs   = getFirestore(app);  // Firestore

// Analytics - only initialise in browser environments that support it
isSupported().then((ok) => { if (ok) getAnalytics(app); });
