import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getAuth, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
  getFirestore, collection, getDocs, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc,
  query, where // <--- Ye naya add hua hai order filter karne ke liye
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBmUwmZ8M-0GrmExe5YIPXRq_0bRtUaVRg",
  authDomain: "grocery-hut-e9c39.firebaseapp.com",
  projectId: "grocery-hut-e9c39",
  storageBucket: "grocery-hut-e9c39.firebasestorage.app",
  messagingSenderId: "900393800888",
  appId: "1:900393800888:web:14160465865091d866904d",
  measurementId: "G-YLEY5ZX5B5"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut,
  collection, getDocs, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc,
  query, where // <--- Naya export
};