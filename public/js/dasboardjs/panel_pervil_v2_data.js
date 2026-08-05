// ============================================================
// panel_scripts.js
// Todo el JS del panel_perfil.html unificado en un solo archivo
// IMPORTANTE: debe cargarse con <script type="module"> porque
// usa imports de Firebase.
// ============================================================

import {
  getAuth,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  updateDoc,
  arrayRemove,
  deleteField,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db, storage, app } from "../db/db.js";
import { tiendaDoc, tiendaSubDoc } from "../rutas/rutas.js";

const auth = getAuth(app);

onAuthStateChanged(auth, (user) => {
  if (!user) {
    StorageCleaner.limpiarTodo();
    window.location.replace("../index");
    return;
  }
  console.log("Usuario logeado OK:", user.uid);
});

window.cerrarSesionPanel = async () => {
  const uid = auth.currentUser?.uid;
  const propietarios = window.PanelPerfil?.currentData?.propietario_id || [];
  const estaVinculado = uid && propietarios.includes(uid);

  const mensaje = estaVinculado
    ? "⚠️ ¿Cerrar sesión?\n\nTu cuenta será desvinculada de este negocio.\nLa próxima vez tendrás que ingresar el ID del negocio manualmente."
    : "⚠️ ¿Cerrar sesión?\n\nLa próxima vez tendrás que ingresar el ID del negocio manualmente para acceder.";

  const confirmar = confirm(mensaje);
  if (!confirmar) return;

  if (estaVinculado && uid) {
    try {
      const tiendaRef = tiendaDoc(
        window.PanelPerfil.LOCALIDAD_TIENDA,
        "tiendas",
        window.PanelPerfil.TIENDA_ID,
      );
      await updateDoc(tiendaRef, {
        propietario_id: arrayRemove(uid),
      });

      const userRef = doc(
        db,
        "Trabajadores_Usuarios_Drivers",
        "users",
        "users",
        uid,
      );

      await updateDoc(userRef, {
        id_tienda_propietario: deleteField(),
      });
    } catch (e) {
      console.error("Error desvinculando:", e);
    }
  }

  try {
    await signOut(auth);
  } catch (e) {}

  // 🔥 Limpieza total: TODO localStorage y TODO sessionStorage
  localStorage.clear();
  sessionStorage.clear();
  StorageCleaner.limpiarTodo();
  window.location.replace("../index");
};

// ===== IFRAME RECARGAS: volver / reenviar datos =====
window._datosParaIframe = null;

function volverDesdeIframe() {
  const iframe = document.querySelector("#sec-recargas iframe");
  if (!iframe) return;

  document.getElementById("iframeBackBtn").classList.remove("visible");

  iframe.src = "recargas";

  iframe.addEventListener(
    "load",
    function reenviar() {
      iframe.removeEventListener("load", reenviar);
      reenviarDatosAlIframe(iframe);
    },
    { once: true },
  );
}
window.volverDesdeIframe = volverDesdeIframe;

function reenviarDatosAlIframe(iframe) {
  if (!window._datosParaIframe) return;

  setTimeout(() => {
    try {
      iframe.contentWindow.postMessage(window._datosParaIframe, "*");
      console.log("📤 Datos reenviados al iframe:", window._datosParaIframe);
    } catch (e) {
      console.warn("No se pudo reenviar datos:", e);
    }
  }, 300);
}

(function () {
  const sec = document.getElementById("sec-recargas");
  const btn = document.getElementById("iframeBackBtn");
  if (!sec || !btn) return;

  const iframe = sec.querySelector("iframe");
  if (!iframe) return;

  iframe.addEventListener("load", function () {
    try {
      const iframeHref = iframe.contentWindow.location.href;
      const esRecargas =
        iframeHref.includes("recargas") || iframeHref === "about:blank";
      if (!esRecargas) {
        btn.classList.add("visible");
      } else {
        btn.classList.remove("visible");
      }
    } catch (e) {
      btn.classList.add("visible");
    }
  });
})();

// ===== NAVEGACIÓN ENTRE IFRAMES (postMessage) =====
window.addEventListener("message", function (e) {
  const { tipo, seccion } = e.data || {};
  if (tipo !== "NAVEGAR") return;

  if (window.PanelPerfil && typeof PanelPerfil.showSection === "function") {
    PanelPerfil.showSection(seccion || "perfil");
  }

  // Solo tocar el iframe de Recargas si realmente vamos ahí
  if (seccion === "recargas") {
    const iframe = document.querySelector("#sec-recargas iframe");
    if (iframe) {
      iframe.src = "about:blank";
      setTimeout(() => {
        iframe.src = "recargas";
        iframe.addEventListener(
          "load",
          function () {
            setTimeout(() => {
              if (window._datosParaIframe) {
                iframe.contentWindow.postMessage(window._datosParaIframe, "*");
              }
            }, 300);
          },
          { once: true },
        );
      }, 50);
    }
  }
});

// ===== PERMISOS POR ROL (botones sidebar / menú móvil) =====
(function () {
  // Mapeo: id de sección del sidebar/menú móvil → permiso requerido
  // (debe coincidir con las keys de PERMISOS_DISPONIBLES en inicio.html)
  const PERMISOS_BOTON = {
    perfil: "perfil",
    publicidad: "publicidad",
    qr: "qr",
    productos: "productos",
    historial: "historial", // no tiene permiso propio, se agrupa con "pedidos"
    pedidos: "pedidos",
    recargas: "recargas",
  };

  function getRolActivo() {
    try {
      return JSON.parse(sessionStorage.getItem("rolActivo") || "null");
    } catch (e) {
      return null;
    }
  }

  function aplicarPermisosRol(sesion) {
    // null → sin restricciones (admin) | [] → sin sesión, todo bloqueado
    const permisos = sesion
      ? sesion.esAdmin
        ? null
        : sesion.permisos || []
      : [];

    Object.keys(PERMISOS_BOTON).forEach((seccion) => {
      const permisoNecesario = PERMISOS_BOTON[seccion];
      const permitido =
        permisos === null || permisos.includes(permisoNecesario);

      [`sbb-${seccion}`, `mmb-${seccion}`].forEach((id) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.disabled = !permitido;
        btn.classList.toggle("sidebar-btn-disabled", !permitido);
        btn.title = permitido ? "" : "No tienes permiso para esta sección";
      });
    });
  }

  // 1) Al cargar la página: aplica el rol ya guardado (si recargaron)
  document.addEventListener("DOMContentLoaded", () => {
    aplicarPermisosRol(getRolActivo());
  });

  // 2) En vivo: cuando inicio.html hace login/logout, nos avisa por postMessage
  window.addEventListener("message", (e) => {
    if (e.origin !== window.location.origin) return;
    if (e.data?.type === "ROL_ACTIVO_UPDATE") {
      aplicarPermisosRol(e.data.rol);
    }
  });
})();

// ===== SINCRONIZAR SALDO / PUBLICIDAD / PLANES ENTRE IFRAMES =====
window.addEventListener("message", function (e) {
  const tipo = e.data?.type;
  if (!["SALDO_UPDATE", "PUBLICIDAD_UPDATE", "PLANES_UPDATE"].includes(tipo))
    return;

  // Actualizamos el saldo global del documento padre también
  if (tipo === "SALDO_UPDATE") {
    window._saldoActual = e.data.saldo;
  }

  // Reenviar el mismo mensaje a TODOS los iframes hermanos (incluida Publicidad)
  document.querySelectorAll("iframe").forEach((iframe) => {
    try {
      iframe.contentWindow.postMessage(e.data, "*");
    } catch (err) {}
  });
});
