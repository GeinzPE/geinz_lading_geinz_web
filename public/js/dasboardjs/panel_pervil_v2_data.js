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

const PWA_KEYS = ["pwa_tiendaId", "pwa_localidad", "rolActivo_pwa"];
function limpiarSinPWA() {
  const guardado = PWA_KEYS.map((k) => [k, localStorage.getItem(k)]);
  StorageCleaner.limpiarTodo();
  guardado.forEach(([k, v]) => v !== null && localStorage.setItem(k, v));
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    limpiarSinPWA();
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
      const esRecargas =
        iframeHref.includes("recargas") || iframeHref === "about:blank";
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
  const SECCIONES = [
    "perfil",
    "comprobantes",
    "trabajadores",
    "legal",
    "pedidos",
    "productos",
    "historial",
    "historialgasto_tienda",
    "avisoinsumo",
    "usuarios",
    "fidelizacion",
    "publicidad",
    "mispublicaciones",
    "qr",
    "formularios",
    "recargas",
  ];
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
    if (!SECCIONES.includes(key)) return true; // "inicio" u otras sin control
    const okPlan = _servicios?.secciones?.[key] === true;
    const okRol =
      !!_sesion &&
      (!!_sesion.esAdmin || (_sesion.permisos || []).includes(key));
    return okPlan && okRol;
  }
  const ID_BOTON = { comprobantes: "comprobante" };
  function aplicar() {
    SECCIONES.forEach((key) => {
      const ver = puedeVer(key);
      const sufijo = ID_BOTON[key] || key;
      [`sbb-${sufijo}`, `mmb-${sufijo}`].forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) btn.style.display = ver ? "" : "none";
      });
    });

    // Ocultar grupos que quedaron sin botones visibles (ignora los "Pronto")
    document
      .querySelectorAll(".sidebar-group, .mobile-menu-group")
      .forEach((g) => {
        const hijos = [
          ...g.querySelectorAll(
            ".sidebar-btn, .mobile-menu-item:not(.mobile-menu-item-disabled)",
          ),
        ];
        g.style.display = hijos.some((b) => b.style.display !== "none")
          ? ""
          : "none";
      });

    // Si la sección abierta ya no está permitida, volver a Inicio
    if (_servicios !== null && window.PanelPerfil?.showSection) {
      const activa = document.querySelector(".section.active");
      let key = activa?.id?.replace(/^sec-/, "");
      if (key === "comprobante") key = "comprobantes";
      if (key && SECCIONES.includes(key) && !puedeVer(key)) {
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
      window.setServiciosParaPublicidad?.(
        e.data.servicios_completo || e.data.servicios,
      );
      aplicar();
    }
  });
})();

const LOADERS = {
  publicidad: "loadPublicidad",
  fidelizacion: "loadFidelizacion",
  mispublicaciones: "loadMisPublicaciones",
  qr: "loadQr",
  historialgasto: "loadHistorial_gastos",
  productos: "loadProductos",
  historial: "loadHistorial",
  pedidos: "load_pedidos_vivos",
  legal: "loadLegal",
  formularios: "loadFormularios",
};

window.addEventListener("message", function (e) {
  if (e.origin !== window.location.origin) return;
  const { tipo, seccion } = e.data || {};
  if (tipo !== "NAVEGAR") return;

  const destino = seccion || "perfil";
  let destinoKey = destino === "comprobante" ? "comprobantes" : destino;
  if (destinoKey === "historialgasto") destinoKey = "historialgasto_tienda";

  // Bloqueo final: si plan o rol no lo permiten, no se abre
  if (window.PanelVisibilidad && !window.PanelVisibilidad.puedeVer(destinoKey))
    return;

  const P = window.PanelPerfil;
  if (P) {
    const fn = LOADERS[destino];
    if (fn && typeof P[fn] === "function") P[fn]();
    else if (typeof P.showSection === "function") P.showSection(destino);
  }

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
  if (!["SALDO_UPDATE", "PUBLICIDAD_UPDATE", "PLANES_UPDATE"].includes(tipo))
    return;

  if (tipo === "SALDO_UPDATE") {
    window._saldoActual = e.data.saldo;
  }

  document.querySelectorAll("iframe").forEach((iframe) => {
    try {
      iframe.contentWindow.postMessage(e.data, "*");
    } catch (err) {}
  });
});

// ===== SERVICIOS → todos los iframes =====
window._serviciosCompleto = window._serviciosCompleto || null;

function enviarServicios(iframe) {
  if (!iframe || !window._serviciosCompleto) return;
  try {
    iframe.contentWindow.postMessage(
      { type: "SERVICIOS_UPDATE", servicios: window._serviciosCompleto },
      window.location.origin,
    );
  } catch (e) {}
}

// Cada iframe que termine de cargar recibe el último plan guardado
document.querySelectorAll("iframe").forEach((f) =>
  f.addEventListener("load", () => enviarServicios(f)),
);

window.addEventListener("message", (e) => {
  if (e.origin !== window.location.origin) return;

  if (e.data?.type === "SERVICIOS_UPDATE") {
    window._serviciosCompleto =
      e.data.servicios_completo || e.data.servicios || null;
    document.querySelectorAll("iframe").forEach(enviarServicios);
  }
  if (e.data?.type === "PEDIR_DATOS_TIENDA") {
    const origen = [...document.querySelectorAll("iframe")].find(
      (f) => f.contentWindow === e.source,
    );
    enviarServicios(origen);
  }
});

// ===== PERMISOS → iframe fidelización =====
function enviarPermisosFidelizacion() {
  const f = document.getElementById("iffidelizacion");
  const cp =
    window._serviciosCompleto?.cliente_y_fidelizacion?.cupones_puntos || {};
  const max = Number(cp.maximo_cupones);
  try {
    f?.contentWindow?.postMessage(
      {
        type: "permisos_fidelizacion",
        programa: cp.activo === true,
        cupones: cp.creacion_cupones === true,
        maximo: Number.isFinite(max) ? max : null,
      },
      window.location.origin,
    );
  } catch (e) {}
}

document
  .getElementById("iffidelizacion")
  ?.addEventListener("load", enviarPermisosFidelizacion);

window.addEventListener("message", (e) => {
  if (e.origin !== window.location.origin) return;
  if (
    e.data?.type === "SERVICIOS_UPDATE" ||
    e.data?.type === "PEDIR_PERMISOS_FIDELIZACION"
  ) {
    enviarPermisosFidelizacion();
  }
});

(function () {
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
let promptInstalar = window.__pwaPrompt || null;

 const estado = () => ({
  tipo: "PWA_ESTADO",
  instalable: !!promptInstalar,
  ios: esIOS && !standalone && !promptInstalar,
  instalada: standalone,
});
  const avisar = () => {
    try {
      document.getElementById("iframeInicio")?.contentWindow
        ?.postMessage(estado(), window.location.origin);
    } catch (e) {}
  };

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    promptInstalar = e;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    promptInstalar = null;
    avisar();
  });
  document.getElementById("iframeInicio")?.addEventListener("load", avisar);

  function configurarPWA() {
    const t = sessionStorage.getItem("tiendaId");
    const l = sessionStorage.getItem("localidad");
    if (!t || !l) return;
    const qs = `id=${encodeURIComponent(t)}&l=${encodeURIComponent(l)}&panel=1&s=${encodeURIComponent(location.pathname)}`;
    document.getElementById("pwaManifest").href = `/api/manifest?${qs}`;
    document.getElementById("pwaApple").href =
      `/api/icon?id=${encodeURIComponent(t)}&l=${encodeURIComponent(l)}&p=1&s=180&v=3`;
  }
  configurarPWA();

  window.addEventListener("message", async (e) => {
    if (e.origin !== window.location.origin) return;
    const d = e.data || {};
    if (d.tipo === "DATOS_PWA") configurarPWA();
    if (d.tipo === "PEDIR_PWA_ESTADO") avisar();
    if (d.tipo === "INSTALAR_APP" && promptInstalar) {
      promptInstalar.prompt();
      await promptInstalar.userChoice;
      promptInstalar = null;
      avisar();
    }
  });
})();