import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { app, db } from "../db/db.js";

const auth = getAuth(app);

/**
 * Escucha la sesión del usuario (no negocio) en cualquier página.
 * onLogged: recibe {uid, nombre, username, foto, puntos}
 * onLoggedOut: se llama si no hay sesión de usuario
 */
export function watchUserSession(onLogged, onLoggedOut) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      onLoggedOut?.();
      return;
    }
    const snap = await getDoc(
      doc(db, "Trabajadores_Usuarios_Drivers", "users", "users", user.uid)
    );
    if (!snap.exists()) {
      // Es un auth de Firebase pero sin doc de usuario -> no lo tratamos como sesión válida
      onLoggedOut?.();
      return;
    }
    const data = snap.data();
    onLogged({
      uid: user.uid,
      nombre: data.nombre || "Usuario",
      username: data.nombre_user || "",
      foto: user.photoURL || null,
      puntos: data.puntos ?? 0,
    });
  });
}