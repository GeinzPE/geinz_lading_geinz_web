// ══════════════════════════════════════════
//  FAVICON CIRCULAR — módulo reutilizable
// ══════════════════════════════════════════
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
  authDomain: "geinzworkapp.firebaseapp.com",
  databaseURL: "https://geinzworkapp-default-rtdb.firebaseio.com",
  projectId: "geinzworkapp",
  storageBucket: "geinzworkapp.firebasestorage.app",
  messagingSenderId: "921389328767",
  appId: "1:921389328767:web:dc6fffc43a51444f5b524a",
  measurementId: "G-38J7RJP8HK",
};

// Reutiliza la app de Firebase si ya fue inicializada en otro archivo,
// así evitamos el error "Firebase App named '[DEFAULT]' already exists".
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * Recorta una imagen en círculo y la aplica como favicon.
 * Úsala cuando YA tienes la URL del logo en memoria (evita otra lectura a Firestore).
 * @param {string} url - URL de la imagen del logo
 */
export function setFaviconCircular(url) {
  const img = new Image();
  img.crossOrigin = "anonymous";

  img.onload = () => {
    const size = 64; // resolución del favicon
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    // Recorte circular
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    // Dibuja la imagen cubriendo todo el círculo (cover)
    const ratio = Math.max(size / img.width, size / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);

    const dataUrl = canvas.toDataURL("image/png");
    applyFaviconLink(dataUrl);
  };

  img.onerror = () => {
    // si falla (ej. CORS), usar la imagen original sin recorte
    applyFaviconLink(url);
  };

  img.src = url;
}

function applyFaviconLink(href) {
  document.querySelectorAll("link[rel~='icon']").forEach((el) => el.remove());
  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/png";
  link.href = href;
  document.head.appendChild(link);
}

/**
 * Versión "todo en uno": recibe el ID del negocio (y su localidad),
 * busca el logo en Firestore y aplica el favicon circular.
 * Úsala en archivos donde NO tienes el logo cargado todavía.
 * @param {{ localidad: string, id: string }} params
 */
export async function setBusinessFaviconById({ localidad, id }) {
  try {
    const ref = doc(db, "Tiendas", localidad, localidad, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const logoUrl = snap.data()?.img_tienda?.logo_tienda;
    if (logoUrl) setFaviconCircular(logoUrl);
  } catch (e) {
    console.warn("No se pudo aplicar el favicon del negocio:", e.message);
  }
}