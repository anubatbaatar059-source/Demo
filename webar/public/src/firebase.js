import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "…",
  authDomain: "…",
  projectId: "webar-b00f1",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
