
  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-analytics.js";
  import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-database.js";

  // Your web app's Firebase configuration
  const firebaseConfig = {
    apiKey: "AIzaSyAzHXz0jlGO5_QrMS6pwUv-rSVS81w0hps",
    authDomain: "kgn-pharma.firebaseapp.com",
    projectId: "kgn-pharma",
    storageBucket: "kgn-pharma.firebasestorage.app",
    messagingSenderId: "66015599179",
    appId: "1:66015599179:web:1a13042be883ed4cd30bce",
    measurementId: "G-S7BTZZ6VRG",
    databaseURL: "https://kgn-pharma-default-rtdb.asia-southeast1.firebasedatabase.app"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);

  const db = getDatabase(app);
  window.db = db;

  
  window.addEventListener("DOMContentLoaded", () => {
    console.log("🟢 Page loaded... checking Firebase connection...");

    if (window.db) {
      console.log("✅ Firebase DB connected successfully!");
    } else {
      console.error("❌ Firebase DB not connected");
    }
  });