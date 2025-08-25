import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "…",
  authDomain: "…",
  projectId: "webar-b00f1",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
