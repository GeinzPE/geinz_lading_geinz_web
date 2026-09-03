import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { app, db } from "./js/db/db.js";

const messaging = getMessaging(app);
const VAPID_KEY = "BHZ1cDOCNN3vIm8tUtSrvCgn-e4jIgR8wl8XloY-pLClHf3JrJpm2J29MPAQscFIM4SHzQtg_lkfo_P1ALeEuWQ";// Firebase Console > Project Settings > Cloud Messaging > Web Push certificates

function idDispositivoWeb() {
  // clave estable por navegador, sin depender de Android
  let id = localStorage.getItem("geinz_device_id");
  if (!id) {
    id = "Web-" + crypto.randomUUID().slice(0, 8);
    localStorage.setItem("geinz_device_id", id);
  }
  return id;
}

export async function registrarTokenWeb(uid) {
  if (!("Notification" in window)) return null;

  let permiso = Notification.permission;
  if (permiso === "default") {
    permiso = await Notification.requestPermission();
  }
  if (permiso !== "granted") return null;

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration
  });

  if (!token) return null;

  const nombreDispositivo = idDispositivoWeb();

  const docRef = doc(db, "Trabajadores_Usuarios_Drivers", "users", "tokens", uid);
  await setDoc(docRef, {
    tokens: { [nombreDispositivo]: token }
  }, { merge: true });

  return token;
}

// notificaciones con la pestaña abierta (foreground)
onMessage(messaging, (payload) => {
  console.log("🔔 Notificación en primer plano:", payload);
});