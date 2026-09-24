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
  doc,
  updateDoc,
  arrayRemove,
  deleteField,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db, app } from "../db/db.js";
import { tiendaDoc } from "../rutas/rutas.js";

const auth = getAuth(app);

onAuthStateChanged(auth, (user) => {
  if (!user) {
    StorageCleaner.limpiarTodo();
    window.location.replace("../index");
    return;
  }
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

      const userRef = doc(db, "Trabajadores_Usuarios_Drivers", "users", "users", uid);
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

  // Limpieza total
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

  document.getElementById("iframeBackBtn")?.classList.remove("visible");

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
      const esRecargas = iframeHref.includes("recargas") || iframeHref === "about:blank";
      if (!esRecargas) btn.classList.add("visible");
      else btn.classList.remove("visible");
    } catch (e) {
      btn.classList.add("visible");
    }
  });
})();

// ============================================================
//  VISIBILIDAD DEL SIDEBAR / MENÚ MÓVIL  (plan + rol)
//
//  Regla:
//   - Plan (DB): solo existe lo que está en true en apartados_dasboard
//   - Admin: ve todo lo que el plan tiene activo
//   - Rol no admin: ve solo lo del plan que el admin le marcó
//   - Sin sesión: solo se ve "Inicio"
//
//  Las claves son las mismas de los ids: sbb-<clave> / mmb-<clave>
// ============================================================
(function () {
  const SECCIONES = {
    perfil: null,
    publicidad: ["publicidad_perfil", "publicidad_dias", "publicidad_estatica"],
    fidelizacion: ["fidelizacion"],
    mispublicaciones: ["review"],
    qr: ["qr_general"],
    historialgasto: null,
    productos: ["productos"],
    historial: ["historial_ventas"],
    pedidos: ["pedidios_vivos", "pedidos_mesas", "pedidos_presencial"],
    legal: ["libro_reclamaciones", "politicas_privacidad", "terminos_condiciones"],
    recargas: null,
  };

  function leer(k) {
    try {
      return JSON.parse(sessionStorage.getItem(k) || "null");
    } catch (e) {
      return null;
    }
  }

  // Estado inicial desde sessionStorage (mismo origen que el iframe de inicio)
  let _sesion = leer("rolActivo");
  let _servicios = leer("serviciosActivos");

  function puedeVer(key) {
    if (!(key in SECCIONES)) return true; // "inicio" u otras sin control
    const campos = SECCIONES[key];
    const ap = _servicios?.apartados_dasboard || {};
    const okPlan = campos === null || campos.some((c) => ap[c] === true);
    const okRol = !!_sesion && (!!_sesion.esAdmin || (_sesion.permisos || []).includes(key));
    return okPlan && okRol;
  }

  function aplicar() {
    Object.keys(SECCIONES).forEach((key) => {
      const ver = puedeVer(key);
      [`sbb-${key}`, `mmb-${key}`].forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) btn.style.display = ver ? "" : "none";
      });
    });

    // Ocultar grupos que quedaron sin botones visibles (ignora los "Pronto")
    document.querySelectorAll(".sidebar-group, .mobile-menu-group").forEach((g) => {
      const hijos = [
        ...g.querySelectorAll(".sidebar-btn, .mobile-menu-item:not(.mobile-menu-item-disabled)"),
      ];
      g.style.display = hijos.some((b) => b.style.display !== "none") ? "" : "none";
    });

    // Si la sección abierta ya no está permitida, volver a Inicio
    if (_servicios !== null && window.PanelPerfil?.showSection) {
      const activa = document.querySelector(".section.active");
      const key = activa?.id?.replace(/^sec-/, "");
      if (key && key in SECCIONES && !puedeVer(key)) {
        window.PanelPerfil.showSection("inicio");
      }
    }
  }

  window.PanelVisibilidad = { aplicar, puedeVer };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", aplicar);
  } else {
    aplicar();
  }

  window.addEventListener("message", (e) => {
    if (e.origin !== window.location.origin) return;
    if (e.data?.type === "ROL_ACTIVO_UPDATE") {
      _sesion = e.data.rol;
      aplicar();
    }
    if (e.data?.type === "SERVICIOS_UPDATE") {
      _servicios = e.data.servicios;
      aplicar();
    }
  });
})();

// ===== NAVEGACIÓN ENTRE IFRAMES (postMessage) =====
// Usa las mismas funciones que los botones del sidebar
const LOADERS = {
  publicidad: "loadPublicidad",
  fidelizacion: "loadFidelizacion",
  mispublicaciones: "loadMisPublicaciones",
  qr: "loadQr",
  historialgasto: "loadHistorialGasto",
  productos: "loadProductos",
  historial: "loadHistorial",
  pedidos: "load_pedidos_vivos",
  legal: "loadLegal",
};

window.addEventListener("message", function (e) {
  const { tipo, seccion } = e.data || {};
  if (tipo !== "NAVEGAR") return;

  const destino = seccion || "perfil";

  // Bloqueo final: si plan o rol no lo permiten, no se abre
  if (window.PanelVisibilidad && !window.PanelVisibilidad.puedeVer(destino)) return;

  const P = window.PanelPerfil;
  if (P) {
    const fn = LOADERS[destino];
    if (fn && typeof P[fn] === "function") P[fn]();
    else if (typeof P.showSection === "function") P.showSection(destino);
  }

  // Solo tocar el iframe de Recargas si realmente vamos ahí
  if (destino === "recargas") {
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

// ===== SINCRONIZAR SALDO / PUBLICIDAD / PLANES ENTRE IFRAMES =====
window.addEventListener("message", function (e) {
  const tipo = e.data?.type;
  if (!["SALDO_UPDATE", "PUBLICIDAD_UPDATE", "PLANES_UPDATE"].includes(tipo)) return;

  if (tipo === "SALDO_UPDATE") {
    window._saldoActual = e.data.saldo;
  }

  document.querySelectorAll("iframe").forEach((iframe) => {
    try {
      iframe.contentWindow.postMessage(e.data, "*");
    } catch (err) {}
  });
});