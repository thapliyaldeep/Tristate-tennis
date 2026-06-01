import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, OAuthProvider } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyATHcwA_JvkBRfVJBiR2dJhw8t8VqN8aSY",
  authDomain: "tristate-tennis.firebaseapp.com",
  databaseURL: "https://tristate-tennis-default-rtdb.firebaseio.com",
  projectId: "tristate-tennis",
  storageBucket: "tristate-tennis.firebasestorage.app",
  messagingSenderId: "258792717205",
  appId: "1:258792717205:web:964eec51d082cf287f949c",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();
export const facebookProvider = new FacebookAuthProvider();
export const appleProvider = new OAuthProvider("apple.com");

export const ADMIN_EMAIL = "deepcolour@gmail.com";
