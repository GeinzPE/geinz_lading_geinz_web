import {
  doc,
  getDoc,
  getDocFromServer,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithCustomToken,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import { db } from "/js/db/db.js";
import { tiendaDoc, tiendaSubDoc } from "/js/rutas/rutas.js";
import { setFaviconCircular } from "/js/favicon/favicon.js"; // ajusta la ruta a donde tengas el archivo
import {
  configurarColoresNegocio,
  aplicarColoresDesdeCache,
  cargarColoresNegocio,
  leerColorActual,
} from "../colores_dinamicos/dinamicos.js"; // ajusta la ruta real

// Fondo oscuro → colores aclarados para que el texto sea legible
configurarColoresNegocio({ legible: true });

const auth = getAuth();
const TOKEN_URL = new URLSearchParams(location.search).get("t") || null; // ?t= del invitado
const AUTH_ORIGIN = "https://geinztech.com";
// ⚠️ Pon aquí EXACTAMENTE el mismo destino que usa loginPromptLoginBtn en el HTML del carrito
const LOGIN_URL = "/login.html";
let bizNombreActual = "";
let bizLogoActual = "";
let textoBtnLlegada = "📍 Ya estoy en el local";
let qrListo = false;

// ---- Cloud Functions (todas las escrituras del cliente pasan por aquí) ----
const FUNCTIONS_REGION = "us-central1"; // debe ser IGUAL a REGION en pedidos_functions.js
const functions = getFunctions(db.app, FUNCTIONS_REGION);
let tiendaPathActual = null;

async function llamar(nombre, extra = {}) {
  if (!tiendaPathActual || !pedidoIdActual) {
    return {
      ok: false,
      motivo: "sin_contexto",
      mensaje: "Aún se está cargando el pedido. Intenta de nuevo",
    };
  }
  try {
    const r = await httpsCallable(
      functions,
      nombre,
    )({
      tiendaPath: tiendaPathActual,
      pedidoId: pedidoIdActual,
      token: TOKEN_URL,
      ...extra,
    });
    return (
      r.data || {
        ok: false,
        motivo: "vacio",
        mensaje: "Respuesta vacía del servidor",
      }
    );
  } catch (e) {
    console.error(`[pedidos] ${nombre}:`, e);
    const code = String(e?.code || "");
    if (code.includes("permission-denied")) {
      return {
        ok: false,
        motivo: "permiso",
        mensaje: "Este pedido no es tuyo. Inicia sesión con la cuenta correcta",
      };
    }
    return {
      ok: false,
      motivo: "red",
      mensaje: "No se pudo conectar. Intenta de nuevo",
    };
  }
}

// ---- Config: fallback de localidad para links viejos (/pedidos/{negocioId}/{pedidoId}) ----
const LOCALIDAD_FIJA = "barranca";
let aliasNegocioActual = null;
const HOST = window.location.hostname.replace(/^www\./, "");
const ES_DOMINIO_PROPIO =
  !!window.__NEGOCIO_HOSTNAME__ || HOST !== "geinztech.com";

// ---- Estados del pedido ----
const ESTADOS_LABEL = {
  pendiente: "Pendiente",
  pendiente_pago: "Pendiente de pago",
  en_proceso: "En proceso",
  en_pausa: "En pausa",
  entregado: "Entregado",
  rechazado: "Rechazado",
  listo: "Listo",
};

let pagoOnlineHabilitado = true;
function requierePagoOnline(data) {
  if (esPedidoCampana(data)) return false; // en campaña se paga en el punto
  const m = data?.pago?.metodo;
  const activo =
    pagoOnlineHabilitado || normalizarEstado(data?.estado) === "pendiente_pago";
  return activo && !!m && m !== "Efectivo" && !data.mesa;
}
function normalizarEstado(estado) {
  const e = (estado || "").toLowerCase().trim();
  if (e === "listo" || e.includes("listo")) return "listo";
  if (e === "pendiente_pago" || e.includes("pago")) return "pendiente_pago";
  if (e === "rechazado" || e.includes("rechaz")) return "rechazado";
  if (e === "entregado" || e.includes("entreg")) return "entregado";
  if (e === "en_pausa" || e.includes("pausa")) return "en_pausa";
  if (e === "en_proceso" || e.includes("proceso")) return "en_proceso";
  return "pendiente";
}
function toDateFS(ts) {
  return ts && typeof ts.toDate === "function" ? ts.toDate() : null;
}
function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

/* ══════════════ Resolución de ruta ══════════════
   Formato nuevo y seguro:  /perfil/{alias}/{pedidoId}
     -> se resuelve el negocio real (id + localidad) consultando alias_tiendas,
        igual que hace carrito.js. La URL nunca expone el id ni la localidad reales.
   Formato viejo (compatibilidad con links ya enviados por WhatsApp):
     /pedidos/{negocioId}/{pedidoId}  o  ?negocioId=&pedidoId=
     -> usa el id tal cual viene y LOCALIDAD_FIJA como localidad. */
async function resolverNegocioDesdeDominio(host) {
  try {
    const snap = await getDoc(doc(db, "dominio_web_tiendas", host));
    if (snap.exists()) {
      const d = snap.data();
      if (d.id && d.localidad) {
        return {
          id: d.id,
          localidad: d.localidad.trim().toLowerCase(),
          alias: d.alias || null,
        };
      }
    }
  } catch (e) {
    console.error("[pedidos] No se pudo resolver el dominio:", e);
  }
  return null;
}
async function resolverNegocioDesdeAlias(alias) {
  try {
    const aliasSnap = await getDoc(doc(db, "alias_tiendas", alias));
    if (aliasSnap.exists()) {
      const data = aliasSnap.data();
      if (data.id && data.localidad) {
        return { id: data.id, localidad: data.localidad.trim().toLowerCase() };
      }
    }
  } catch (e) {
    console.error("[pedidos] No se pudo resolver el alias del negocio:", e);
  }
  return null;
}

function parseRutaCruda() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("negocioId") && params.get("pedidoId")) {
    return {
      tipo: "id",
      negocioId: params.get("negocioId"),
      pedidoId: params.get("pedidoId"),
    };
  }

  const partes = window.location.pathname.split("/").filter(Boolean);

  // Formato nuevo: /perfil/{alias}/{pedidoId}
  const idxPerfil = partes.indexOf("perfil");
  if (idxPerfil !== -1 && partes.length >= idxPerfil + 3) {
    return {
      tipo: "alias",
      alias: decodeURIComponent(partes[idxPerfil + 1]),
      pedidoId: partes[idxPerfil + 2],
    };
  }

  // Dominio propio: /pedido/{pedidoId}
  const idxPedido = partes.indexOf("pedido");
  if (idxPedido !== -1 && partes[idxPedido + 1]) {
    return { tipo: "dominio", pedidoId: partes[idxPedido + 1] };
  }

  // Formato viejo: /pedidos/{negocioId}/{pedidoId}  (o /dashboard/...)
  const idxPedidos = partes.findIndex(
    (p) => p === "pedidos" || p === "dashboard",
  );
  if (idxPedidos !== -1 && partes.length >= idxPedidos + 3) {
    return {
      tipo: "id",
      negocioId: partes[idxPedidos + 1],
      pedidoId: partes[idxPedidos + 2],
    };
  }

  console.warn("[pedidos] No se pudo extraer la ruta del pedido");
  return null;
}
async function resolverRuta() {
  // Dominio propio inyectado por pedidoSSR: /pedido/{pedidoId}
  if (window.__NEGOCIO_ID__ && window.__NEGOCIO_LOCALIDAD__) {
    const partes = window.location.pathname.split("/").filter(Boolean);
    const idx = partes.indexOf("pedido");
    const pedidoId = idx !== -1 ? partes[idx + 1] : partes[partes.length - 1];
    if (!pedidoId) return null;
    aliasNegocioActual = window.__NEGOCIO_ALIAS__ || null;
    return {
      negocioId: window.__NEGOCIO_ID__,
      pedidoId,
      localidad: window.__NEGOCIO_LOCALIDAD__.trim().toLowerCase(),
    };
  }

  const cruda = parseRutaCruda();
  if (!cruda) return null;

  // Dominio propio sin inyección: se resuelve por dominio_web_tiendas
  if (cruda.tipo === "dominio") {
    const r = await resolverNegocioDesdeDominio(HOST);
    if (!r) return null;
    aliasNegocioActual = r.alias;
    return {
      negocioId: r.id,
      pedidoId: cruda.pedidoId,
      localidad: r.localidad,
    };
  }

  if (cruda.tipo === "id") {
    return {
      negocioId: cruda.negocioId,
      pedidoId: cruda.pedidoId,
      localidad: LOCALIDAD_FIJA,
    };
  }

  aliasNegocioActual = cruda.alias;

  const resuelto = await resolverNegocioDesdeAlias(cruda.alias);
  if (!resuelto) return null;
  return {
    negocioId: resuelto.id,
    pedidoId: cruda.pedidoId,
    localidad: resuelto.localidad,
  };
}
let ids = null;
const el = (id) => document.getElementById(id);
const showSkeleton = () => {
  el("skeleton").classList.remove("hidden");
  el("empty-state").classList.add("hidden");
  el("content").classList.add("hidden");
};
const showEmpty = () => {
  el("skeleton").classList.add("hidden");
  el("empty-state").classList.remove("hidden");
  el("content").classList.add("hidden");
};
const showContent = () => {
  el("skeleton").classList.add("hidden");
  el("empty-state").classList.add("hidden");
  el("content").classList.remove("hidden");
};

// Muestra el aviso de "inicia sesión / regístrate" cuando no hay usuario
// autenticado o cuando el pedido no pertenece al usuario autenticado.
function mostrarModalRegistro() {
  showEmpty(); // oculta skeleton/contenido de fondo
  const modal = el("auth-modal");
  if (modal) modal.classList.remove("hidden");
}

let unsubNegocio = null;
let unsubPedido = null;
let colorListo = null;
let primeraVezMostrado = false;
let estadoAnterior = null; // para detectar el cambio de estado
let primerRenderPedido = true; // evita notificar en la carga inicial
let pedidoRefGlobal = null; // referencia del doc del pedido (solo lectura / guardia de UI)
let pedidoIdActual = null; // para armar el mensaje de WhatsApp con el código del pedido
let waHabilitado = false; // true solo si el negocio tiene WhatsApp configurado y con número válido
let cuponCanjeActual = null; // cupón de fidelización usado en este pedido (si lo hay)
let negocioMetodosPagoActual = null;
let pedidoActualParaPago = null;
let puntoNegocioActual = null;
let deliveryEstadoPrev = null;
const esPedidoCampana = (d) =>
  d?.cliente?.tipo_entrega === "Campaña física" || !!d?.campanaId;

const _qrCache = {};
async function qrDataUrl(texto) {
  if (_qrCache[texto]) return _qrCache[texto];
  const m = await import("https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm");
  const QRCode = m.default || m;
  return (_qrCache[texto] = await QRCode.toDataURL(texto, {
    width: 320,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  }));
}
function nombreOfuscado(nombreCompleto) {
  const partes = (nombreCompleto || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "";
  const [primero, ...resto] = partes;
  const tapar = (w) => (w.length <= 3 ? w.slice(0, 1) : w.slice(0, 3)) + "**";
  return [primero, ...resto.map(tapar)].join(" ");
}
const LABELS_METODO_PAGO_DATOS = {
  yape: "Yape",
  plin: "Plin",
  visa_mastercard: "Visa / Mastercard",
  agora: "Agora",
};

const LABEL_CAMPO_NUMERO = {
  yape: "Número",
  plin: "Número",
  visa_mastercard: "Número de cuenta",
  agora: "Número de cuenta",
};

function detectarMetodoPagoConDatos(metodoTexto) {
  const t = (metodoTexto || "").toLowerCase();
  if (t.includes("yape")) return "yape";
  if (t.includes("plin")) return "plin";
  if (t.includes("visa") || t.includes("mastercard") || t.includes("tarjeta"))
    return "visa_mastercard";
  if (t.includes("agora")) return "agora";
  if (t.includes("qr")) return "yape"; // genérico, prioriza yape
  return null;
}

function actualizarBloquePagoQR() {
  const card = el("pago-qr-card");
  if (!card) return;
  const p = pedidoActualParaPago;
  const mp = negocioMetodosPagoActual;
  if (!p || !mp) {
    card.classList.add("hidden");
    return;
  }
  if (esPedidoCampana(p)) {
    card.classList.add("hidden");
    return;
  }
  if (p.pago?.voucher_url) {
    card.classList.add("hidden");
    return;
  }

  const metodoKey = detectarMetodoPagoConDatos(p.pago?.metodo);
  const esMesa = !!p.mesa || p.cliente?.tipo_entrega === "Mesa";
  const estado = normalizarEstado(p.estado);
  if (!metodoKey || esMesa || estado !== "pendiente_pago") {
    card.classList.add("hidden");
    return;
  }
  const info = mp[metodoKey];
  if (!info || !info.enable) {
    card.classList.add("hidden");
    return;
  }

  card.classList.remove("hidden");
  el("pago-qr-metodo-label").textContent =
    LABELS_METODO_PAGO_DATOS[metodoKey] || metodoKey;

  const qrImg = el("pago-qr-img");
  const qrBtn = el("pago-qr-zoom");
  if (info.qr) {
    if (qrImg.src !== info.qr) qrImg.src = info.qr;
    qrBtn.classList.remove("hidden");
  } else {
    qrBtn.classList.add("hidden");
  }

  el("pago-qr-numero-label").textContent =
    LABEL_CAMPO_NUMERO[metodoKey] || "Número";
  el("pago-qr-nombre").textContent = nombreOfuscado(info.nombre) || "—";
  el("pago-qr-numero").textContent = info.numero || "—";

  const nombreNegocio = el("negocio-nombre")?.textContent || "el negocio";
  const total = Number(p.total || 0).toFixed(2);
  el("pago-qr-mensaje").textContent =
    `Envía tu comprobante de pago por S/ ${total} para que ${nombreNegocio} pueda actualizar el estado de tu pedido.`;

  const yaEnviado = !!p.pago?.voucher_url;
  el("pago-voucher-pendiente").classList.toggle("hidden", yaEnviado);
  el("pago-voucher-enviado").classList.toggle("hidden", !yaEnviado);
}
function actualizarComprobante() {
  const card = el("comprobante-card");
  if (!card) return;
  const p = pedidoActualParaPago;
  const url = p?.pago?.voucher_url;
  const estado = normalizarEstado(p?.estado);
  if (!url || estado === "rechazado") {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");

  const img = el("comprobante-img");
  if (img.getAttribute("src") !== url) img.src = url;

  const confirmado = ["en_proceso", "listo", "entregado"].includes(estado);
  const chip = el("comprobante-chip");
  chip.textContent = confirmado ? "✓ Pago confirmado" : "⏳ En revisión";
  chip.classList.toggle("ok", confirmado);
  el("comprobante-msg").textContent = confirmado
    ? "El negocio confirmó tu pago. ¡Gracias!"
    : "El negocio está revisando tu comprobante. Te avisaremos apenas lo confirme.";

  el("comprobante-monto").textContent = `S/ ${Number(p.total || 0).toFixed(2)}`;
  const f = toDateFS(p.pago?.voucher_subido_en);
  el("comprobante-fecha").textContent = f
    ? f.toLocaleString("es-PE", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Hace un momento";
}

function mostrarErrorVoucher(msg) {
  const e = el("pago-voucher-error");
  if (!e) return alert(msg);
  e.textContent = msg;
  e.classList.remove("hidden");
}

// Cuando el pedido pasa a "pendiente de pago", baja solo hasta el QR para que el cliente
// vea de inmediato dónde pagar y subir el comprobante. Solo una vez por cada vez que entra a ese estado.
let scrollPagoHecho = false;
function irAlPagoSiCorresponde(estadoActual) {
  if (estadoActual !== "pendiente_pago") {
    scrollPagoHecho = false; // se rearma por si vuelve a ese estado
    return;
  }
  const card = el("pago-qr-card");
  if (scrollPagoHecho || !card || card.classList.contains("hidden")) return;
  scrollPagoHecho = true;
  const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  card.style.scrollMarginTop = "1rem";

  // 1) baja hasta el pago
  setTimeout(
    () =>
      card.scrollIntoView({
        behavior: reducir ? "auto" : "smooth",
        block: "start",
      }),
    350,
  );

  // 2) cuando ya llegó, destella dorado 2 veces
  setTimeout(() => {
    card.classList.remove("brillo-pago");
    void card.offsetWidth; // reinicia la animación si ya estaba puesta
    card.classList.add("brillo-pago");
    card.addEventListener(
      "animationend",
      () => card.classList.remove("brillo-pago"),
      { once: true },
    );
  }, 900);
}

function comprimirImagenGenerica(dataURL, maxPx, calidad) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxPx || h > maxPx) {
        if (w >= h) {
          h = Math.round((h * maxPx) / w);
          w = maxPx;
        } else {
          w = Math.round((w * maxPx) / h);
          h = maxPx;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/webp", calidad));
    };
    img.onerror = () => reject(new Error("No se pudo leer imagen"));
    img.src = dataURL;
  });
}

el("btn-subir-voucher")?.addEventListener("click", () =>
  el("pago-voucher-input")?.click(),
);

// El comprobante se manda a la Cloud Function, que valida la imagen, la sube a
// Storage y actualiza el pedido. El navegador ya no escribe en Storage.
el("pago-voucher-input")?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || !ids) return;
  const btn = el("btn-subir-voucher");
  el("pago-voucher-error")?.classList.add("hidden");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Subiendo…";
  }
  try {
    const dataURL = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const comprimida = await comprimirImagenGenerica(dataURL, 900, 0.85);
    const r = await llamar("subirComprobante", { imagen: comprimida });
    if (!r.ok) {
      mostrarErrorVoucher(r.mensaje || "No se pudo enviar el comprobante");
      return;
    }
    // Actualización inmediata, sin esperar al snapshot
    const p = pedidoActualParaPago || {};
    pedidoActualParaPago = {
      ...p,
      pago: { ...(p.pago || {}), voucher_url: r.url || comprimida },
    };
    renderPedido(pedidoActualParaPago);
    actualizarBloquePagoQR();
    actualizarComprobante();
    setTimeout(
      () =>
        el("comprobante-card")?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        }),
      250,
    );
  } catch (err) {
    console.error("[pedidos] Error subiendo comprobante:", err);
    mostrarErrorVoucher("No se pudo leer la imagen. Intenta con otra");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "📎 Enviar comprobante de pago";
    }
    e.target.value = "";
  }
});
// Todos los cupones del pedido (el servidor manda cupones[]; antes solo cupon)
function cuponesDe(data) {
  const arr =
    Array.isArray(data?.cupones) && data.cupones.length
      ? data.cupones
      : data?.cupon
        ? [data.cupon]
        : [];
  return arr.filter(Boolean);
}

function calcularAhorroCupon(data) {
  const cups = cuponesDe(data);
  if (!cups.length) return 0;

  let total = 0;

  // Cupones de producto (canje): el descuento va dentro del precio de la línea
  cups
    .filter((c) => c.tipo === "producto")
    .forEach((c) => {
      const orig = Number(c.precioOriginal);
      if (!Number.isFinite(orig)) return;
      if (c.tipoBeneficio === "cantidad") {
        const compra = Number(c.descuento?.compraUnidades) || 1;
        const paga = Number(c.descuento?.pagaUnidades) || compra;
        total += Math.max(0, (compra - paga) * orig);
      } else {
        const final =
          c.precioFinalEstimado != null ? Number(c.precioFinalEstimado) : orig;
        total += Math.max(0, orig - final);
      }
    });

  // Cupón manual (% o monto): el carrito ya guardó el descuento, se suma una sola vez
  if (
    cups.some((c) => c.tipo !== "producto") &&
    Number(data.descuentoCupon) > 0
  )
    total += Number(data.descuentoCupon);

  return +total.toFixed(2);
}

function renderResumenCupon(data) {
  const wrap = el("cupon-resumen");
  if (!wrap) return;

  const total = Number(data.total || 0);
  const ahorro = calcularAhorroCupon(data);
  const sumaLineas = (data.productos || []).reduce(
    (s, p) => s + Number(p.subtotal || 0),
    0,
  );
  const descManual =
    Number(data.descuentoCupon) > 0 ? Number(data.descuentoCupon) : 0;

  const dp = data.delivery_pendiente;
  const deliveryPendiente =
    !!data.delivery_pendiente && data.delivery_pendiente.estado !== "aceptado";

  const delivery =
    sumaLineas > 0
      ? Math.max(0, +(total - sumaLineas + descManual).toFixed(2))
      : 0;
  const esDelivery = /delivery|domicilio|env[ií]o/i.test(
    data.cliente?.tipo_entrega || "",
  );
  const verDelivery = delivery > 0 || esDelivery || deliveryPendiente;

  if (!verDelivery && ahorro <= 0) {
    wrap.classList.add("hidden");
    return;
  }

  el("resumen-subtotal").textContent =
    `S/ ${(total - delivery + ahorro).toFixed(2)}`;

  el("resumen-delivery-row").classList.toggle("hidden", !verDelivery);
  el("resumen-delivery").textContent = deliveryPendiente
    ? data.delivery_pendiente.estado === "propuesto"
      ? `S/ ${Number(data.delivery_pendiente.costo || 0).toFixed(2)} (por aceptar)`
      : "⏳ Esperando confirmación del negocio"
    : delivery > 0
      ? `+ S/ ${delivery.toFixed(2)}`
      : "Gratis";

  el("resumen-cupon-row").classList.toggle("hidden", ahorro <= 0);
  if (ahorro > 0) {
    const cups = cuponesDe(data);
    el("resumen-cupon-label").textContent =
      cups.length > 1
        ? `🎟️ Cupones (${cups.length})`
        : `🎟️ Cupón ${cups[0]?.codigo || ""}`.trim();
    el("resumen-descuento").textContent = `− S/ ${ahorro.toFixed(2)}`;
  }

  wrap.classList.remove("hidden");
}
function codigoPedidoCorto(id) {
  return (id || "").slice(0, 6).toUpperCase();
}

function abrirLoginPopup() {
  const c = leerColorActual() || { r: 194, g: 112, b: 61 };
  const u = new URL(`${AUTH_ORIGIN}/auth-popup.html`);
  u.searchParams.set("o", window.location.origin);
  u.searchParams.set("r", window.location.href.split("#")[0]);
  u.searchParams.set("n", bizNombreActual || "");
  if (bizLogoActual) u.searchParams.set("l", bizLogoActual);
  u.searchParams.set("c", `${c.r},${c.g},${c.b}`);
  window.location.href = u.toString();
}

// En dominio propio → auth-popup. En geinztech.com → link normal a login.
el("auth-cta")?.addEventListener("click", (e) => {
  if (!ES_DOMINIO_PROPIO) return;
  e.preventDefault();
  abrirLoginPopup();
});
if (!ES_DOMINIO_PROPIO) {
  const cta = el("auth-cta");
  if (cta) cta.href = LOGIN_URL;
}

// Al volver del login en dominio propio la URL trae #wl_token=...
const loginPorTokenPromise = (async () => {
  const p = new URLSearchParams(window.location.hash.slice(1));
  const t = p.get("wl_token");
  if (!t) return;
  history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search,
  );
  try {
    await signInWithCustomToken(auth, t);
  } catch (err) {
    console.error("[pedidos] signInWithCustomToken:", err);
  }
})();
(async () => {
  ids = await resolverRuta();
  if (!ids) {
    showEmpty();
    return;
  }
  await loginPorTokenPromise;
  let iniciado = false;
  onAuthStateChanged(auth, (user) => {
    if (iniciado) return;
    iniciado = true;
    // Con o sin sesión se intenta cargar; el permiso se decide al leer el pedido
    init(ids.negocioId, ids.pedidoId, user?.uid || null, ids.localidad);
  });
})();

/* ══════════════ Copiar código del pedido ══════════════ */
el("btn-copiar-codigo")?.addEventListener("click", async () => {
  const btn = el("btn-copiar-codigo");
  const txt = btn?.querySelector(".copy-text");
  if (!btn || !txt || !pedidoIdActual) return;

  // usuario registrado: solo el id. Invitado: id.token
  const codigo = TOKEN_URL ? `${pedidoIdActual}.${TOKEN_URL}` : pedidoIdActual;

  try {
    await navigator.clipboard.writeText(codigo);
    txt.textContent = "¡Copiado!";
    btn.classList.add("copied");
    clearTimeout(btn._t);
    btn._t = setTimeout(() => {
      txt.textContent = "Copiar código";
      btn.classList.remove("copied");
    }, 1800);
  } catch (e) {
    console.warn("[pedidos] No se pudo copiar el código:", e);
  }
});

/* ══════════════ Código visible + QR del pedido (recojo) ══════════════
   El QR lleva SOLO el id del pedido (nunca el token). */
function renderCodigoPedido(data, estadoActual) {
  const wrap = el("codigo-wrap");
  if (!wrap) return;
  const esMesa = !!data.mesa || data.cliente?.tipo_entrega === "Mesa";
  const visible =
    !esMesa &&
    !esPedidoCampana(data) && // en campaña el código y el QR van en su propia tarjeta
    !["rechazado", "entregado"].includes(estadoActual) &&
    !!pedidoIdActual;
  wrap.classList.toggle("hidden", !visible);
  if (!visible) return;
  el("codigo-grande").textContent = "#" + codigoPedidoCorto(pedidoIdActual);
  el("codigo-completo").textContent = pedidoIdActual;
}
function renderCampanaInfo(data, estadoActual) {
  let box = el("campana-info");
  const visible =
    esPedidoCampana(data) &&
    !["rechazado", "entregado"].includes(estadoActual) &&
    !!pedidoIdActual;
  if (!visible) {
    box?.classList.add("hidden");
    return;
  }

  if (!box) {
    box = document.createElement("div");
    box.id = "campana-info";
    box.style.cssText =
      "margin:1rem 0 0;padding:1rem;border-radius:1rem;text-align:center;" +
      "border:1px solid var(--card-border);background:var(--card);";
    (el("tiempo-estimado") || el("timeline")).insertAdjacentElement(
      "afterend",
      box,
    );
  }
  box.classList.remove("hidden");

  const pt = data.punto_entrega?.nombre
    ? data.punto_entrega
    : puntoNegocioActual;
  const metodo = data.pago?.metodo || "";
  const pagoTxt = /efectivo/i.test(metodo)
    ? "Pagas en efectivo en el punto"
    : `Pagas con ${metodo || "tu método elegido"} en el punto`;
  const key = [
    pt?.nombre,
    pt?.referencia,
    pt?.lat,
    pt?.lng,
    metodo,
    pedidoIdActual,
  ].join("|");
  if (box.dataset.key === key) return; // no repinta si no cambió nada
  box.dataset.key = key;

  const ruta =
    pt && Number.isFinite(Number(pt.lat)) && Number.isFinite(Number(pt.lng))
      ? `https://www.google.com/maps/dir/?api=1&destination=${pt.lat},${pt.lng}&travelmode=driving`
      : null;

  box.innerHTML = `
    <p style="margin:0;font-size:.95rem;font-weight:700;">
      📍 Acércate a ${esc(pt?.nombre || "el punto de entrega")}
    </p>
    ${pt?.referencia ? `<p class="text-muted" style="margin:.2rem 0 0;font-size:.8rem;">${esc(pt.referencia)}</p>` : ""}
    ${ruta ? `<a href="${ruta}" target="_blank" rel="noopener" style="display:inline-block;margin-top:.3rem;font-size:.8rem;text-decoration:underline;">Cómo llegar →</a>` : ""}
    <p style="margin:.8rem 0 0;font-size:.85rem;">💳 ${esc(pagoTxt)}</p>
    <p class="text-secondary" style="margin:.8rem 0 .4rem;font-size:.8rem;">Muestra este QR para que te atiendan</p>
    <img id="campana-qr" alt="QR del pedido" width="200" height="200"
         style="background:#fff;border-radius:.8rem;padding:6px;margin:0 auto;display:block;">
    <p class="font-mono" style="margin:.6rem 0 0;font-size:1.3rem;font-weight:800;letter-spacing:.08em;">
      #${esc(codigoPedidoCorto(pedidoIdActual))}
    </p>`;
  qrDataUrl(pedidoIdActual)
    .then((src) => {
      const i = el("campana-qr");
      if (i) i.src = src;
    })
    .catch((e) => console.warn("[pedidos] QR campaña:", e));
}
el("btn-toggle-qr")?.addEventListener("click", async () => {
  const box = el("qr-wrap");
  const txt = el("btn-toggle-qr")?.querySelector(".copy-text");
  if (!box || !txt || !pedidoIdActual) return;
  const abrir = box.classList.contains("hidden");
  if (abrir && !qrListo) {
    try {
      const m = await import("https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm");
      const QRCode = m.default || m;
      // fondo blanco y puntos negros: sobre tema oscuro algunos lectores no leen QR invertido
      el("qr-img").src = await QRCode.toDataURL(pedidoIdActual, {
        width: 320,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      });
      qrListo = true;
    } catch (e) {
      console.warn("[pedidos] No se pudo generar el QR:", e);
      return;
    }
  }
  box.classList.toggle("hidden", !abrir);
  txt.textContent = abrir ? "Ocultar QR" : "Mostrar QR";
});

// Pide permiso de notificaciones en la primera interacción del cliente
// (los navegadores bloquean el prompt automático si no hay gesto del usuario)
document.addEventListener(
  "click",
  () => {
    if (window.Notification && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  },
  { once: true },
);

// Refleja el estado de conexión del navegador al instante, sin depender
// de que llegue un nuevo snapshot de Firestore para actualizarlo.
window.addEventListener("online", () => mostrarBannerConexion(false));
window.addEventListener("offline", () => mostrarBannerConexion(true));

// Limpia los listeners activos de Firestore si la pestaña se cierra o el
// usuario navega fuera. Evita fugas de memoria/lecturas fantasma a escala.
window.addEventListener("beforeunload", () => {
  if (unsubNegocio) unsubNegocio();
  if (unsubPedido) unsubPedido();
});

el("btn-cancelar-pedido")?.addEventListener("click", () => {
  if (pedidoRefGlobal) abrirModalCancelar(pedidoRefGlobal);
});

/* ══════════════ Confirmación antes de retroceder ══════════════
   Al confirmar el pedido, el carrito redirige aquí con
   window.location.href (navegación real, no SPA), así que un "atrás" del
   navegador saca al cliente de este seguimiento en tiempo real sin avisar.
   Se agrega un estado extra al historial: la primera vez que el cliente
   intenta retroceder, no lo dejamos salir de una — se le explica qué va a
   pasar y se le da la opción de copiar el link para retomarlo después.
   Solo si confirma, se deja avanzar el "atrás" real. */
let salidaConfirmada = false;
let redirigirTrasBack = null; // URL a la que se navega una vez consumida la entrada de guardia
history.pushState(null, document.title, location.href);

window.addEventListener("popstate", () => {
  if (salidaConfirmada) {
    // Ya confirmó: acabamos de consumir la entrada de guardia con history.back().
    if (redirigirTrasBack) {
      location.replace(redirigirTrasBack);
    }
    return;
  }
  history.pushState(null, document.title, location.href);
  abrirModalSalir();
});
function abrirModalSalir() {
  const overlay = el("leave-confirm-modal");
  if (!overlay) return;
  overlay.classList.remove("hidden");
  requestAnimationFrame(() => overlay.classList.add("show"));
}
function cerrarModalSalir() {
  const overlay = el("leave-confirm-modal");
  if (!overlay) return;
  overlay.classList.remove("show");
  setTimeout(() => overlay.classList.add("hidden"), 350);
}

el("leave-confirm-no")?.addEventListener("click", cerrarModalSalir);

el("leave-confirm-yes")?.addEventListener("click", () => {
  salidaConfirmada = true;
  cerrarModalSalir();
  if (ES_DOMINIO_PROPIO) {
    window.location.href = "/";
  } else if (aliasNegocioActual) {
    window.location.href = `/perfil/${aliasNegocioActual}`;
  } else {
    history.back();
  }
});

el("leave-copy-link")?.addEventListener("click", async () => {
  const btn = el("leave-copy-link");
  try {
    await navigator.clipboard.writeText(location.href);
    const original = btn.textContent;
    btn.textContent = "¡Copiado! ✓";
    setTimeout(() => (btn.textContent = original), 1800);
  } catch (e) {
    console.warn("[pedidos] No se pudo copiar el link:", e);
  }
});

el("leave-confirm-modal")?.addEventListener("click", (e) => {
  if (e.target.id === "leave-confirm-modal") cerrarModalSalir();
});

function init(negocioId, pedidoId, uidActual, localidad = LOCALIDAD_FIJA) {
  pedidoIdActual = pedidoId;
  showSkeleton();
  aplicarColoresDesdeCache(negocioId);

  // Ruta del negocio: se usa también para las Cloud Functions
  const negocioRef = tiendaDoc(localidad, "tiendas", negocioId);
  tiendaPathActual = negocioRef.path;

  // --- Datos del negocio (logo, nombre, contacto) ---
  const aplicarNegocio = (data) => {
    const nombre = data.nombre_tienda || data.nombre || "Negocio";
    const logoUrl = data.img_tienda?.logo_tienda || "";
    bizNombreActual = nombre;
    bizLogoActual = logoUrl;
    el("negocio-nombre").textContent = nombre;
    el("negocio-localidad").textContent = localidad;
    document.title = `Pedido · ${nombre}`;

    const btnVolver = el("btn-volver-negocio");
    const btnCarito = el("btn-ir-carrito");
    negocioMetodosPagoActual = data.metodos_pago || null;
    puntoNegocioActual = data.punto_entrega || null;
    pagoOnlineHabilitado =
      data.pedidos_config?.estados?.pendiente_pago !== false;
    if (pedidoActualParaPago) renderPedido(pedidoActualParaPago);
    actualizarBloquePagoQR();

    if (btnVolver) {
      if (ES_DOMINIO_PROPIO || aliasNegocioActual) {
        btnVolver.href = ES_DOMINIO_PROPIO
          ? "/"
          : `https://geinztech.com/perfil/${aliasNegocioActual}`;
        el("btn-volver-negocio-texto").textContent = `Volver a ${nombre}`;
        btnVolver.classList.remove("hidden");
      } else {
        btnVolver.classList.add("hidden");
      }
    }
    if (btnCarito) {
      if (ES_DOMINIO_PROPIO || aliasNegocioActual) {
        btnCarito.href = ES_DOMINIO_PROPIO
          ? "/carrito"
          : `https://geinztech.com/perfil/${aliasNegocioActual}/carrito`;
        el("btn-carrito-texto").textContent = `Ir a carrito de ${nombre}`;
        btnCarito.classList.remove("hidden");
      } else {
        btnCarito.classList.add("hidden");
      }
    }

    const wa = data.metodo_contacto?.whatsapp;
    if (wa?.estado && wa?.numero) renderBotonWhatsapp(wa.numero, nombre);

    if (logoUrl) {
      el("logo-img").alt = nombre;
      el("logo-img").src = logoUrl;
      setFaviconCircular(logoUrl);
    }

    // Colores dinámicos del negocio (color_marca → logo → nombre)
    if (!colorListo) {
      colorListo = Promise.race([
        cargarColoresNegocio({ id: negocioId, localidad, biz: data }).catch(
          () => {},
        ),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
    }
  };

  try {

    // Lectura directa al servidor (diagnóstico + respaldo)
    getDocFromServer(negocioRef)
      .then((s) => {
        if (s.exists()) aplicarNegocio(s.data());
      })
      .catch((e) =>
        console.error("[pedidos] negocio servidor error:", e.code, e.message),
      );

    unsubNegocio = onSnapshot(
      negocioRef,
      (snap) => {
        if (!snap.exists()) {
          if (snap.metadata.fromCache) return; // el getDocFromServer de arriba cubre este caso
          console.warn(
            "[pedidos] El documento del NEGOCIO no existe (servidor)",
          );
          el("negocio-nombre").textContent = "Negocio";
          return;
        }
        aplicarNegocio(snap.data());
      },
      (error) => {
        console.error(
          "[pedidos] Error de Firestore leyendo NEGOCIO:",
          error.code,
          error.message,
        );
        mostrarBannerConexion(true);
      },
    );
  } catch (e) {
    console.error("[pedidos] Error cargando negocio:", e);
  }

  // --- Pedido en tiempo real (solo lectura) ---
  const pedidoRef = tiendaSubDoc(
    localidad,
    "tiendas",
    negocioId,
    "pedidos",
    pedidoId,
  );
  pedidoRefGlobal = pedidoRef;

  let ultimoDataJSON = null; // evita re-render si el snapshot no trae cambios reales

  unsubPedido = onSnapshot(
    pedidoRef,
    async (snap) => {
      if (!snap.exists()) {
        console.warn("[pedidos] El documento del PEDIDO no existe");
        showEmpty();
        return;
      }

      const data = snap.data();

      // Si el contenido es idéntico al último renderizado, no se vuelve a pintar el DOM.
      const dataJSON = JSON.stringify(data);
      if (dataJSON === ultimoDataJSON) return;
      ultimoDataJSON = dataJSON;

      // Seguridad (solo visual; la protección real está en reglas + Cloud Functions):
      //  - pedido de usuario registrado → solo ese usuario
      //  - pedido de invitado → solo quien tenga el ?t= correcto
      //  - pedidos viejos sin ninguna de las dos marcas → se muestran como antes
      const duenoId = data.cliente?.id_cliente || null;
      const tokenPedido = data.token_seguimiento || null;
      let autorizado = true;
      if (duenoId) autorizado = duenoId === uidActual;
      else if (tokenPedido) autorizado = TOKEN_URL === tokenPedido;

      if (!autorizado) {
        if (unsubPedido) unsubPedido();
        mostrarModalRegistro();
        return;
      }
      const nuevoEstado = normalizarEstado(data.estado);
      renderPedido(data);
      pedidoActualParaPago = data;
      actualizarBloquePagoQR();
      actualizarComprobante();
      // Si el estado cambió respecto al anterior (y no es la primera carga),
      // dispara la notificación push del navegador.
      if (
        !primerRenderPedido &&
        estadoAnterior !== null &&
        nuevoEstado !== estadoAnterior
      ) {
        notificarCambioEstado(nuevoEstado, data);
      }
      const dpEst = data.delivery_pendiente?.estado || null;
      if (
        !primerRenderPedido &&
        dpEst === "propuesto" &&
        deliveryEstadoPrev !== "propuesto"
      ) {
        notificarDelivery(data);
      }
      deliveryEstadoPrev = dpEst;
      estadoAnterior = nuevoEstado;
      primerRenderPedido = false;
      if (!primeraVezMostrado) {
        primeraVezMostrado = true;
        if (colorListo) await colorListo;
      }

      showContent();
      irAlPagoSiCorresponde(nuevoEstado);
      mostrarBannerConexion(!navigator.onLine);
    },
    (error) => {
      console.error(
        "[pedidos] Error de Firestore leyendo PEDIDO:",
        error.code,
        error.message,
      );
      if (error.code === "permission-denied" && !uidActual)
        mostrarModalRegistro();
      else showEmpty();
    },
  );
}

function mostrarBannerConexion(sinConexion) {
  el("conn-banner").classList.toggle("hidden", !sinConexion);
}

// Arma el enlace de WhatsApp hacia el negocio con un mensaje predefinido
function renderBotonWhatsapp(numero, nombreNegocio) {
  const btn = el("btn-whatsapp");
  if (!btn) return;
  const numeroLimpio = String(numero).replace(/\D/g, "");
  if (!numeroLimpio) return;
  const codigo = codigoPedidoCorto(pedidoIdActual);
  const mensaje = encodeURIComponent(
    `Hola, tengo una consulta sobre mi pedido #${codigo}`,
  );
  btn.href = `https://wa.me/51${numeroLimpio}?text=${mensaje}`;
  waHabilitado = true;
  // No se quita el "hidden" acá directamente: renderPedido() decide la
  // visibilidad final (se oculta si el cliente canceló el pedido).
}
function notificarCambioEstado(nuevoEstado, data) {
  if (!window.Notification || Notification.permission !== "granted") return;

  const puntosGanados = Number(data.puntos_ganados) || 0;

  const MENSAJES = {
    pendiente: "Tu pedido está pendiente de confirmación.",
    en_proceso: "¡Tu pedido está en preparación!",
    en_pausa: "Tu pedido está en pausa, necesitamos que elijas una opción.",
    entregado:
      puntosGanados > 0
        ? `Tu pedido fue entregado. ¡Ganaste +${puntosGanados} puntos! 🎁`
        : "Tu pedido fue entregado. ¡Gracias por tu compra!",
    rechazado: data.cancelado_por_cliente
      ? "Cancelaste tu pedido correctamente."
      : "Tu pedido fue rechazado.",
    pendiente_pago:
      "¡Tu pedido fue aceptado! Sube tu comprobante de pago para continuar.",
    listo: "¡Tu pedido está listo! 🎉",
  };

  const nombreNegocio = el("negocio-nombre")?.textContent || "Geinz";
  const logoUrl = el("logo-img")?.src || undefined;

  try {
    const n = new Notification(
      `${nombreNegocio} · ${ESTADOS_LABEL[nuevoEstado] || nuevoEstado}`,
      {
        body: MENSAJES[nuevoEstado] || "El estado de tu pedido cambió.",
        icon: logoUrl,
        badge: logoUrl,
        tag: "geinz-seguimiento-" + Date.now(),
        requireInteraction: false,
      },
    );
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (e) {
    console.warn("[pedidos] No se pudo mostrar la notificación:", e);
  }
}

function renderPuntos(data, estadoActual, esRechazado) {
  const wrap = el("puntos-wrap");
  const texto = el("puntos-texto");
  if (!wrap || !texto) return;

  const puntosGanados = Number(data.puntos_ganados) || 0;

  if (esRechazado || puntosGanados <= 0) {
    wrap.classList.add("hidden");
    return;
  }

  wrap.classList.remove("hidden");

  if (estadoActual === "entregado") {
    if (data.puntos_acreditados) {
      texto.textContent = `+${puntosGanados} puntos acreditados a tu cuenta`;
    } else {
      texto.textContent = `Acreditando +${puntosGanados} puntos…`;
    }
  } else {
    texto.textContent = `Ganarás +${puntosGanados} puntos al completar tu pedido`;
  }
}

/* ══════════════ Cancelar pedido (vía Cloud Function) ══════════════ */
function abrirModalCancelar() {
  const overlay = el("cancel-confirm-modal");
  if (!overlay) return;
  const btnSi = el("cancel-confirm-yes");
  const btnNo = el("cancel-confirm-no");
  const warn = el("cancel-cupon-warning");
  if (warn) {
    if (cuponCanjeActual) {
      const pts = Number(cuponCanjeActual.costoPuntos || 0);
      el("cancel-cupon-warning-text").innerHTML =
        `Tu cupón <b>${esc(cuponCanjeActual.codigo || "")}</b>${pts > 0 ? ` (${pts} pts)` : ""} ya fue canjeado y se usó en este pedido. ` +
        `Si cancelas, <b>no habrá forma de devolver los puntos</b>.`;
      warn.classList.remove("hidden");
    } else {
      warn.classList.add("hidden");
    }
  }
  overlay.classList.remove("hidden");
  requestAnimationFrame(() => overlay.classList.add("show"));

  const cerrar = () => {
    overlay.classList.remove("show");
    setTimeout(() => overlay.classList.add("hidden"), 350);
    btnSi.removeEventListener("click", onSi);
    btnNo.removeEventListener("click", onNo);
    overlay.removeEventListener("click", onOverlayClick);
  };

  const onNo = () => cerrar();

  const onOverlayClick = (e) => {
    if (e.target === overlay) cerrar();
  };

  const onSi = async () => {
    btnSi.disabled = true;
    btnSi.textContent = "Cancelando…";
    const r = await llamar("cancelarPedido");
    btnSi.disabled = false;
    btnSi.textContent = "Sí, cancelar";
    if (r.ok) return cerrar();
    alert(r.mensaje || "No se pudo cancelar");
  };

  btnSi.addEventListener("click", onSi);
  btnNo.addEventListener("click", onNo);
  overlay.addEventListener("click", onOverlayClick);
}

function extrasDe(condiciones, sel) {
  let t = 0;
  (condiciones || []).forEach((c) =>
    entradasDeOpcion(sel?.[c.nombre]).forEach(([n, q]) => {
      const op = (c.opciones || []).find((o) => o.nombre === n);
      if (op?.costoAdicional) t += Number(op.costoAdicional) * q;
    }),
  );
  return t;
}
const opDisponible = (op) => typeof op.stock !== "number" || op.stock > 0;

function textoRespuesta(r) {
  if (r.accion === "reemplazo")
    return "Cambiar por " + (r.producto_elegido?.nombre || "");
  if (r.accion === "ajuste") return "Ajustar cantidades";
  return "Continuar sin ese producto";
}

/* ══════════════ Banner de pedido en pausa ══════════════
   Se muestra arriba de la tarjeta de estado. Si el cliente ya respondió,
   solo se confirma lo elegido. Si no, puede ajustar cantidades/variantes
   (solo hacia abajo) o cambiar lo que falta por otro producto del pedido.
   El servidor recalcula precios y totales: lo que se vea aquí es solo vista previa. */
   const _reemplazoCache = new Map();

function mapearProductoCliente(id, categoria, d) {
  const condiciones = (d.condiciones || []).map((c) => {
    const multiple = c.tipo ? c.tipo === "multiple" : d.variantesMultiples === true;
    return {
      nombre: c.nombre,
      multiple,
      obligatoria: c.obligatoria !== undefined ? c.obligatoria !== false : d.variantesObligatoria !== false,
      conCantidad: multiple && (c.conCantidad !== undefined ? c.conCantidad === true : d.variantesConCantidad === true),
      max: Number(c.max) > 0 ? Math.floor(Number(c.max)) : null,
      opciones: (c.opciones || [])
        .filter((o) => o.activo && opDisponible(o) && o.agotado !== true)
        .map((o) => ({
          nombre: o.nombre,
          costoAdicional: Number(o.costoAdicional) || 0,
          stock: typeof o.stock === "number" ? o.stock : null,
        })),
    };
  }).filter((c) => c.nombre && c.opciones.length);
  return {
    id, categoria,
    nombre: d.nombre || "Producto",
    precio: Number(d.precio) || 0,
    imagen: d.imagenes?.[0]?.url || "",
    stock: typeof d.stock === "number" ? d.stock : null,
    condiciones,
  };
}

async function cargarProductoReemplazo({ id, categoria }) {
  const key = `${categoria}::${id}`;
  if (_reemplazoCache.has(key)) return _reemplazoCache.get(key);
  let r = null;
  try {
    const s = await getDoc(
      tiendaSubDoc(ids.localidad, "tiendas", ids.negocioId, "productos", categoria, categoria, id),
    );
    if (s.exists() && s.data().disponible !== false)
      r = mapearProductoCliente(id, categoria, s.data());
  } catch (e) {
    console.warn("[pedidos] producto de reemplazo:", e);
  }
  _reemplazoCache.set(key, r);
  return r;
}

const limpiarSel = (sel) => {
  const o = {};
  Object.keys(sel).forEach((k) => { if (entradasDeOpcion(sel[k]).length) o[k] = sel[k]; });
  return o;
};

function seleccionATexto(sel) {
  return Object.entries(sel || {})
    .map(([cond, v]) =>
      entradasDeOpcion(v)
        .map(([n, q]) => (q > 1 ? `${n} x${q}` : n))
        .join(", "),
    )
    .filter(Boolean)
    .join(" · ");
}
// Selector tipo "Nuevo pedido": variantes (única / varias / con cantidad) + cantidad
function abrirSelectorReemplazo(prod, maxQty, onAdd) {
  const sel = {};
  let qty = 1;
  const ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.7);display:flex;align-items:flex-end;justify-content:center;";
  const box = document.createElement("div");
  box.style.cssText = "background:var(--card,#16161c);border:1px solid var(--card-border);border-radius:1.2rem 1.2rem 0 0;width:min(480px,100%);max-height:90vh;overflow-y:auto;padding:1rem;";
  ov.appendChild(box);
  document.body.appendChild(ov);
  const cerrar = () => ov.remove();
  ov.addEventListener("click", (e) => { if (e.target === ov) cerrar(); });

  const faltan = () => prod.condiciones.some((c) => c.obligatoria && !entradasDeOpcion(sel[c.nombre]).length);
  const btn = (act, txt, extra = "", dis = false) =>
    `<button type="button" data-act="${act}" ${extra} ${dis ? "disabled" : ""} style="min-width:2.4rem;height:2.4rem;border-radius:.6rem;border:1px solid var(--card-border);background:var(--card);color:var(--text-primary);font-weight:700;cursor:pointer;${dis ? "opacity:.35;" : ""}">${txt}</button>`;

  const pintar = () => {
    const unit = +(prod.precio + extrasDe(prod.condiciones, sel)).toFixed(2);
    box.innerHTML = `
      <div style="display:flex;gap:.8rem;align-items:center;margin-bottom:1rem;">
        <div id="rs-th"></div>
        <div style="flex:1;min-width:0;"><b>${esc(prod.nombre)}</b>
          <div class="font-mono" style="font-size:.85rem;">S/ ${unit.toFixed(2)} c/u</div></div>
        ${btn("x", "✕")}
      </div>
      ${prod.condiciones.map((c, ci) => {
        const ent = entradasDeOpcion(sel[c.nombre]);
        const total = ent.reduce((s, [, q]) => s + q, 0);
        return `<p style="margin:0 0 .4rem;font-weight:700;font-size:.85rem;">${esc(c.nombre)}
          <small style="color:var(--text-muted);font-weight:500;">${c.obligatoria ? "Obligatorio" : "Opcional"}${c.multiple ? " · varias" : ""}${c.max ? " · máx " + c.max : ""}</small></p>
          <div style="display:flex;flex-direction:column;gap:.4rem;margin-bottom:1rem;">
          ${c.opciones.map((o, oi) => {
            const cur = ent.find(([n]) => n === o.nombre)?.[1] || 0;
            const precio = o.costoAdicional ? ` (+S/ ${o.costoAdicional.toFixed(2)})` : "";
            const idx = `data-ci="${ci}" data-oi="${oi}"`;
            const fila = (inner, on) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:.6rem;padding:.6rem .8rem;border-radius:.8rem;border:1px solid ${on ? "#38bdf8" : "var(--card-border)"};background:${on ? "color-mix(in srgb,#38bdf8 14%,transparent)" : "transparent"};">${inner}</div>`;
            if (c.conCantidad)
              return fila(`<span style="font-size:.85rem;">${esc(o.nombre)}${precio}</span>
                <span style="display:flex;align-items:center;gap:.5rem;">
                ${cur ? btn("menos", "−", idx) + `<b>${cur}</b>` : ""}
                ${btn("mas", cur ? "+" : "Agregar", idx, !!c.max && total >= c.max)}</span>`, cur > 0);
            return fila(`<button type="button" data-act="tog" ${idx} style="all:unset;cursor:pointer;flex:1;font-size:.85rem;">${cur ? "✓ " : ""}${esc(o.nombre)}${precio}${o.stock != null ? ` · quedan ${o.stock}` : ""}</button>`, cur > 0);
          }).join("")}</div>`;
      }).join("")}
      <div style="display:flex;align-items:center;gap:.6rem;margin-top:.5rem;">
        ${btn("qm", "−", "", qty <= 1)}<b style="min-width:1.5rem;text-align:center;">${qty}</b>${btn("qp", "+", "", qty >= maxQty)}
        <button type="button" data-act="add" ${faltan() ? "disabled" : ""} style="flex:1;padding:.8rem;border-radius:.8rem;border:none;background:#38bdf8;color:#04222f;font-weight:700;cursor:pointer;${faltan() ? "opacity:.5;" : ""}">
          ${faltan() ? "Elige una opción" : `Agregar · S/ ${(unit * qty).toFixed(2)}`}</button>
      </div>`;
    box.querySelector("#rs-th")?.appendChild(crearMiniaturaProducto(prod));
  };

  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === "x") return cerrar();
    if (act === "qm") { qty = Math.max(1, qty - 1); return pintar(); }
    if (act === "qp") { qty = Math.min(maxQty, qty + 1); return pintar(); }
    if (act === "add") {
      if (faltan()) return;
      onAdd({ prod, cantidad: qty, seleccion: limpiarSel(sel) });
      return cerrar();
    }
    const c = prod.condiciones[+b.dataset.ci];
    const o = c.opciones[+b.dataset.oi];
    const ent = entradasDeOpcion(sel[c.nombre]);
    const cur = ent.find(([n]) => n === o.nombre)?.[1] || 0;
    const total = ent.reduce((s, [, q]) => s + q, 0);

    if (!c.multiple) {
      if (cur && !c.obligatoria) delete sel[c.nombre];
      else sel[c.nombre] = o.nombre;
    } else if (c.conCantidad) {
      const nuevo = act === "mas" ? cur + 1 : cur - 1;
      if (act === "mas" && c.max && total >= c.max) return;
      if (o.stock != null && nuevo * qty > o.stock) return;
      const obj = Object.fromEntries(ent);
      if (nuevo <= 0) delete obj[o.nombre]; else obj[o.nombre] = nuevo;
      if (Object.keys(obj).length) sel[c.nombre] = obj; else delete sel[c.nombre];
    } else {
      const arr = ent.map(([n]) => n);
      const i = arr.indexOf(o.nombre);
      if (i >= 0) arr.splice(i, 1);
      else { if (c.max && arr.length >= c.max) return; arr.push(o.nombre); }
      if (arr.length) sel[c.nombre] = arr; else delete sel[c.nombre];
    }
    pintar();
  });
  pintar();
}
function renderPausaBanner(data, pedidoRef) {
  let wrap = el("pausa-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "pausa-wrap";
    wrap.className = "card fade-in";
    wrap.style.borderColor = "#38bdf8";
    const primeraCard = el("content").querySelector("section.card");
    el("content").insertBefore(wrap, primeraCard);
  }

  const pausa = data.pausa || {};
  const respuesta = data.respuesta_cliente;
  const afectados = pausa.productos_afectados || [];
  const productosActuales = Array.isArray(data.productos) ? data.productos : [];
  const idsRepl = pausa.productos_reemplazo || [];
  const reemplazos = []; // { prod, cantidad, seleccion }

  let restanteTexto = "";
  const creado = toDateFS(pausa.creado_en);
  if (creado) {
    const msPorUnidad =
      { minutos: 60000, horas: 3600000, dias: 86400000 }[
        pausa.tiempo_espera?.unidad
      ] || 60000;
    const limite = (pausa.tiempo_espera?.valor || 15) * msPorUnidad;
    const restanteMs = limite - (Date.now() - creado.getTime());
    restanteTexto =
      restanteMs > 0
        ? `⏳ ~${Math.ceil(restanteMs / 60000)} min restantes`
        : "⏳ El tiempo estimado ya pasó, seguimos coordinando";
  }

  if (respuesta) {
    wrap.innerHTML = `
      <span class="eyebrow" style="color:#38bdf8;">⏸️ Pedido en pausa</span>
      <p style="margin:0.6rem 0 0;font-size:0.9rem;">Ya enviaste tu respuesta: <strong>${esc(textoRespuesta(respuesta))}</strong>. El negocio confirmará en breve.</p>
      <button id="pausa-cancelar" style="margin-top:1rem;width:100%;padding:0.75rem;border-radius:0.8rem;border:1px solid #e5484d;background:transparent;color:#e5484d;font-weight:600;cursor:pointer;">Cancelar pedido</button>`;
    wrap.querySelector("#pausa-cancelar").onclick = () =>
      abrirModalCancelar(pedidoRef);
    return;
  }

  /* ── Estado editable por producto afectado ── */
  const estado = new Map(); // id -> { linea, cantidad, seleccion }
  afectados.forEach((a) => {
    const linea = productosActuales.find((p) => p.id === a.id);
    if (!linea) return;
    const seleccion = JSON.parse(JSON.stringify(linea.opciones || {}));

    (a.condiciones || []).forEach((c) => {
      const disponibles = (c.opciones || [])
        .filter(opDisponible)
        .map((o) => o.nombre);
      const v = seleccion[c.nombre];
      if (v == null) return;
      if (Array.isArray(v))
        seleccion[c.nombre] = v.filter((n) => disponibles.includes(n));
      else if (typeof v === "object") {
        Object.keys(v).forEach((n) => {
          if (!disponibles.includes(n)) delete v[n];
        });
      } else if (!disponibles.includes(v)) {
        if (disponibles.length) seleccion[c.nombre] = disponibles[0];
        else delete seleccion[c.nombre];
      }
    });

    estado.set(a.id, {
      linea,
      cantidad: Number(linea.cantidad) || 0,
      seleccion,
    });
  });

  const maxCant = (a, st) => {
    const pedida = Number(st.linea.cantidad) || 0;
    let max =
      typeof a.stock_disponible === "number"
        ? Math.min(a.stock_disponible, pedida)
        : pedida;
    (a.condiciones || []).forEach((c) =>
      entradasDeOpcion(st.seleccion[c.nombre]).forEach(([n, q]) => {
        const op = (c.opciones || []).find((o) => o.nombre === n);
        if (op && typeof op.stock === "number")
          max = Math.min(max, Math.floor(op.stock / (q || 1)));
      }),
    );
    return Math.max(0, max);
  };

  afectados.forEach((a) => {
    const st = estado.get(a.id);
    if (st) st.cantidad = Math.min(st.cantidad, maxCant(a, st));
  });

  const precioUnit = (a, st) =>
    typeof a.precio_base === "number"
      ? +(a.precio_base + extrasDe(a.condiciones, st.seleccion)).toFixed(2)
      : Number(st.linea.precio_unitario) || 0;

  const construir = () => {
    let faltante = 0;
    const lista = [];
    productosActuales.forEach((it) => {
      const st = estado.get(it.id);
      if (!st || st.linea !== it) {
        lista.push(it);
        return;
      }
      faltante += Math.max(0, (Number(it.cantidad) || 0) - st.cantidad);
      if (st.cantidad <= 0) return;
      const a = afectados.find((x) => x.id === it.id);
      const unit = precioUnit(a, st);
      lista.push({
        ...it,
        cantidad: st.cantidad,
        opciones: Object.keys(st.seleccion).length ? st.seleccion : null,
        precio_unitario: unit,
        subtotal: +(unit * st.cantidad).toFixed(2),
      });
    });

    reemplazos.forEach((r) => {
      const unit = +(
        r.prod.precio + extrasDe(r.prod.condiciones, r.seleccion)
      ).toFixed(2);
      lista.push({
        id: r.prod.id,
        nombre: r.prod.nombre,
        categoria: r.prod.categoria,
        imagen: r.prod.imagen,
        cantidad: r.cantidad,
        opciones: Object.keys(r.seleccion).length ? r.seleccion : null,
        precio_unitario: unit,
        subtotal: +(unit * r.cantidad).toFixed(2),
      });
    });

    const total = +lista
      .reduce((s, it) => s + Number(it.subtotal || 0), 0)
      .toFixed(2);
    const items = lista.reduce((s, it) => s + (Number(it.cantidad) || 0), 0);
    return { lista, total, items, faltante };
  };

  const motivoTxt = pausa.motivo || "Elige con qué reemplazar lo que falta";

  wrap.innerHTML = `
    <span class="eyebrow" style="color:#38bdf8;">⏸️ Pedido en pausa</span>
    <p style="margin:0.6rem 0 0;font-size:0.9rem;">${esc(motivoTxt)}</p>
    ${restanteTexto ? `<p style="margin:0.3rem 0 0;font-size:0.78rem;color:var(--text-muted);">${restanteTexto}</p>` : ""}
    <div id="pausa-ajustes" style="margin-top:1rem;display:flex;flex-direction:column;gap:0.8rem;"></div>
    ${
      idsRepl.length
        ? `<p style="margin:1rem 0 .4rem;font-size:.85rem;font-weight:700;">Elige con qué reemplazar lo que falta</p>
      <div id="pausa-repl" style="display:flex;flex-direction:column;gap:.5rem;"></div>
      <div id="pausa-repl-sel" style="margin-top:.6rem;display:flex;flex-direction:column;gap:.4rem;"></div>`
        : ""
    }
    <p id="pausa-hint" style="margin:0.8rem 0 0;font-size:0.78rem;color:#e5484d;display:none;"></p>
    <button id="pausa-confirmar" style="margin-top:1rem;width:100%;padding:0.8rem;border-radius:0.8rem;border:none;background:#38bdf8;color:#04222f;font-weight:700;cursor:pointer;">Continuar con mi pedido</button>
    <button id="pausa-cancelar" style="margin-top:0.6rem;width:100%;padding:0.75rem;border-radius:0.8rem;border:1px solid #e5484d;background:transparent;color:#e5484d;font-weight:600;cursor:pointer;">Cancelar pedido</button>
  `;

  const ajustesWrap = wrap.querySelector("#pausa-ajustes");
  const confirmarBtn = wrap.querySelector("#pausa-confirmar");
  const hint = wrap.querySelector("#pausa-hint");

  const chipCss = (on) =>
    `padding:0.4rem 0.7rem;border-radius:0.6rem;font-size:0.78rem;cursor:pointer;color:var(--text-primary);background:${on ? "color-mix(in srgb, #38bdf8 20%, transparent)" : "var(--card)"};border:1px solid ${on ? "#38bdf8" : "var(--card-border)"};`;

  let refrescarRepl = () => {}; // lo asigna pintarReemplazos()

  // Si el cliente sube cantidades de los afectados, el faltante baja:
  // se quitan reemplazos del final hasta que no sobren unidades.
  const sumaRepl = () => reemplazos.reduce((s, r) => s + r.cantidad, 0);
  const recortarReemplazos = () => {
    const { faltante } = construir();
    while (reemplazos.length && sumaRepl() > faltante) reemplazos.pop();
  };

  function pintarTodo() {
    ajustesWrap.innerHTML = "";
    afectados.forEach((a) => {
      const st = estado.get(a.id);
      if (!st) return;
      const max = maxCant(a, st);
      if (st.cantidad > max) st.cantidad = max;
      const unit = precioUnit(a, st);

      const card = document.createElement("div");
      card.style.cssText =
        "border:1px solid var(--card-border);border-radius:0.9rem;padding:0.85rem;";
      const stockTxt =
        typeof a.stock_disponible === "number"
          ? a.stock_disponible <= 0
            ? "agotado"
            : `solo quedan ${a.stock_disponible}`
          : "";
      card.innerHTML = `
        <p style="margin:0;font-weight:700;font-size:0.9rem;">${esc(a.nombre)}</p>
        <p style="margin:0.15rem 0 0.6rem;font-size:0.78rem;color:var(--text-muted);">Pediste ${esc(st.linea.cantidad)}${stockTxt ? " · " + esc(stockTxt) : ""}</p>
        <div class="stepper" style="display:flex;align-items:center;gap:0.8rem;">
          <button type="button" data-minus style="width:2rem;height:2rem;border-radius:0.6rem;border:1px solid var(--card-border);background:var(--card);color:var(--text-primary);font-weight:700;cursor:pointer;">−</button>
          <span style="min-width:1.5rem;text-align:center;font-weight:700;">${st.cantidad}</span>
          <button type="button" data-plus ${st.cantidad >= max ? "disabled" : ""} style="width:2rem;height:2rem;border-radius:0.6rem;border:1px solid var(--card-border);background:var(--card);color:var(--text-primary);font-weight:700;cursor:pointer;${st.cantidad >= max ? "opacity:.35;" : ""}">+</button>
          <span style="margin-left:auto;font-size:0.85rem;" class="font-mono">S/ ${unit.toFixed(2)} c/u · <b>S/ ${(unit * st.cantidad).toFixed(2)}</b></span>
        </div>
        <div data-vars></div>`;

      card.querySelector("[data-minus]").onclick = () => {
        st.cantidad = Math.max(0, st.cantidad - 1);
        pintarTodo();
      };
      card.querySelector("[data-plus]").onclick = () => {
        if (st.cantidad < max) st.cantidad += 1;
        pintarTodo();
      };

      // Variantes: solo las que tienen stock
      const varsWrap = card.querySelector("[data-vars]");
      (a.condiciones || []).forEach((c) => {
        const disp = (c.opciones || []).filter(opDisponible);
        if (!disp.length) return;
        const cur = st.seleccion[c.nombre];
        const multi = Array.isArray(cur) || (cur && typeof cur === "object");
        const activos = entradasDeOpcion(cur).map(([n]) => n);

        const bloque = document.createElement("div");
        bloque.style.marginTop = "0.7rem";
        bloque.innerHTML = `<p style="margin:0 0 0.3rem;font-size:0.72rem;color:var(--text-muted);">${esc(c.nombre)}</p><div style="display:flex;flex-wrap:wrap;gap:0.4rem;"></div>`;
        const fila = bloque.querySelector("div");
        disp.forEach((op) => {
          const b = document.createElement("button");
          b.type = "button";
          const on = activos.includes(op.nombre);
          b.style.cssText = chipCss(on);
          b.textContent = `${op.nombre}${op.costoAdicional ? ` (+S/ ${Number(op.costoAdicional).toFixed(2)})` : ""}${typeof op.stock === "number" ? ` · quedan ${op.stock}` : ""}`;
          b.onclick = () => {
            if (Array.isArray(cur)) {
              const arr = [...cur];
              const i = arr.indexOf(op.nombre);
              if (i >= 0) arr.splice(i, 1);
              else arr.push(op.nombre);
              if (arr.length) st.seleccion[c.nombre] = arr;
              else delete st.seleccion[c.nombre];
            } else if (multi) {
              const o = { ...cur };
              if (o[op.nombre]) delete o[op.nombre];
              else o[op.nombre] = 1;
              if (Object.keys(o).length) st.seleccion[c.nombre] = o;
              else delete st.seleccion[c.nombre];
            } else {
              st.seleccion[c.nombre] = op.nombre;
            }
            pintarTodo();
          };
          fila.appendChild(b);
        });
        varsWrap.appendChild(bloque);
      });

      ajustesWrap.appendChild(card);
    });

    recortarReemplazos();

    const { total, items, faltante, lista } = construir();
    if (!lista.length) {
      hint.style.display = "block";
      hint.textContent =
        "No queda ningún producto. Elige al menos uno o cancela el pedido.";
      confirmarBtn.disabled = true;
      confirmarBtn.style.opacity = ".5";
    } else {
      hint.style.display = "none";
      confirmarBtn.disabled = false;
      confirmarBtn.style.opacity = "1";
    }
    const pagadoPrev =
      data.pago?.voucher_url && data.pago?.metodo && data.pago.metodo !== "Efectivo"
        ? Number(data.pago.monto_pagado ?? data.total) || 0
        : null;
    const dif = pagadoPrev != null ? +(total - pagadoPrev).toFixed(2) : 0;
    confirmarBtn.textContent =
      `Continuar · ${items} item${items === 1 ? "" : "s"} · S/ ${total.toFixed(2)}` +
      (dif > 0.009
        ? ` · pagas S/ ${dif.toFixed(2)} más`
        : dif < -0.009
          ? ` · te devolvemos S/ ${(-dif).toFixed(2)}`
          : "");
    wrap.dataset.faltante = faltante;
    refrescarRepl();
  }

  /* ── Productos de reemplazo (el negocio manda solo los IDs) ── */
  async function pintarReemplazos() {
    const cont = wrap.querySelector("#pausa-repl");
    const selBox = wrap.querySelector("#pausa-repl-sel");
    if (!cont || !selBox) return;
    cont.innerHTML = `<p style="font-size:.8rem;color:var(--text-muted);">Cargando opciones…</p>`;
    const prods = (
      await Promise.all(idsRepl.map(cargarProductoReemplazo))
    ).filter(Boolean);
    if (!wrap.isConnected) return; // el banner se repintó mientras cargaba

    const libres = () => construir().faltante - sumaRepl();

    const pintarSel = () => {
      selBox.innerHTML = reemplazos
        .map(
          (r, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;padding:.6rem .8rem;border:1px solid #38bdf8;border-radius:.8rem;font-size:.85rem;">
          <span><b>${r.cantidad}× ${esc(r.prod.nombre)}</b>${seleccionATexto(r.seleccion) ? `<br><small style="color:var(--text-muted);">${esc(seleccionATexto(r.seleccion))}</small>` : ""}</span>
          <button type="button" data-q="${i}" style="border:none;background:none;color:#e5484d;cursor:pointer;">Quitar</button>
        </div>`,
        )
        .join("");
      selBox.querySelectorAll("[data-q]").forEach((b) => {
        b.onclick = () => {
          reemplazos.splice(+b.dataset.q, 1);
          pintarTodo();
        };
      });
    };

    const pintarCards = () => {
      const libre = libres();
      cont.innerHTML = "";
      if (!prods.length) {
        cont.innerHTML = `<p style="font-size:.8rem;color:var(--text-muted);">Los productos de reemplazo ya no están disponibles.</p>`;
        return;
      }
      prods.forEach((p) => {
        const b = document.createElement("button");
        b.type = "button";
        b.disabled = libre <= 0;
        b.style.cssText = `display:flex;gap:.7rem;align-items:center;text-align:left;padding:.6rem;border-radius:.8rem;border:1px solid var(--card-border);background:var(--card);color:var(--text-primary);cursor:pointer;${libre <= 0 ? "opacity:.4;" : ""}`;
        b.append(crearMiniaturaProducto(p));
        const t = document.createElement("div");
        t.innerHTML = `<b style="font-size:.88rem;">${esc(p.nombre)}</b><div class="font-mono" style="font-size:.8rem;">S/ ${p.precio.toFixed(2)}${p.condiciones.length ? " · con opciones" : ""}</div>`;
        b.append(t);
        b.onclick = () =>
          abrirSelectorReemplazo(p, libre, (r) => {
            reemplazos.push(r);
            pintarTodo();
          });
        cont.appendChild(b);
      });
    };

    refrescarRepl = () => {
      pintarSel();
      pintarCards();
    };
    refrescarRepl();
  }

  // El cliente solo manda ids, cantidades y opciones. El servidor recalcula precios y total.
  confirmarBtn.onclick = async () => {
    const { lista } = construir();
    if (!lista.length) return;

    const ajustes = afectados
      .filter((a) => estado.has(a.id))
      .map((a) => {
        const st = estado.get(a.id);
        return {
          id: a.id,
          cantidad: st.cantidad,
          opciones: Object.keys(st.seleccion).length ? st.seleccion : null,
        };
      });

    confirmarBtn.disabled = true;
    confirmarBtn.textContent = "Enviando…";
    const r = await llamar("responderPausa", {
      ajustes,
      reemplazos: reemplazos.map((x) => ({
        id: x.prod.id,
        categoria: x.prod.categoria,
        cantidad: x.cantidad,
        opciones: Object.keys(x.seleccion).length ? x.seleccion : null,
      })),
    });
    if (!r.ok) {
      confirmarBtn.disabled = false;
      pintarTodo();
      // pintarTodo() oculta el hint si la lista es válida: se vuelve a mostrar el error
      hint.style.display = "block";
      hint.textContent = r.mensaje || "No se pudo enviar tu respuesta";
    }
  };

  wrap.querySelector("#pausa-cancelar").onclick = () =>
    abrirModalCancelar(pedidoRef);
  pintarTodo();
  pintarReemplazos();
}

function quitarPausaBanner() {
  el("pausa-wrap")?.remove();
}

/* ══════════ Delivery por confirmar (el negocio pone el precio) ══════════ */
function renderDeliveryPropuesta(data, estadoActual) {
  const d = data.delivery_pendiente;
  const activo = d && d.estado !== "aceptado" && estadoActual === "pendiente";
  let wrap = el("delivery-wrap");
  if (!activo) {
    wrap?.remove();
    return;
  }
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "delivery-wrap";
    wrap.className = "card fade-in";
    wrap.style.borderColor = "#fbbf24";
    el("content").insertBefore(
      wrap,
      el("content").querySelector("section.card"),
    );
  }
  const key = `${d.estado}|${d.costo}|${d.total_propuesto}`;
  if (wrap.dataset.key === key) return;
  wrap.dataset.key = key;

  if (d.estado === "por_fijar") {
    wrap.innerHTML = `
      <span class="eyebrow" style="color:#fbbf24;">🛵 Delivery por confirmar</span>
      <p style="margin:.6rem 0 0;font-size:.9rem;">El negocio está evaluando tu ruta para ponerle precio al delivery. Te avisaremos apenas lo tenga.</p>`;
    return;
  }

  const costo = Number(d.costo || 0).toFixed(2);
  const nuevo = Number(d.total_propuesto || 0).toFixed(2);
  wrap.innerHTML = `
    <span class="eyebrow" style="color:#fbbf24;">🛵 El negocio puso el precio del delivery</span>
    <div style="margin-top:.8rem;display:flex;flex-direction:column;gap:.4rem;font-size:.9rem;">
      <div style="display:flex;justify-content:space-between;"><span>Delivery</span><b class="font-mono">S/ ${costo}</b></div>
      <div style="display:flex;justify-content:space-between;"><span>Nuevo total</span><b class="font-mono">S/ ${nuevo}</b></div>
    </div>
    <p id="delivery-err" style="display:none;margin:.6rem 0 0;font-size:.78rem;color:#e5484d;"></p>
    <button id="delivery-aceptar" style="margin-top:1rem;width:100%;padding:.8rem;border-radius:.8rem;border:none;background:#fbbf24;color:#2a1d00;font-weight:700;cursor:pointer;">Aceptar delivery · S/ ${costo}</button>
    <button id="delivery-rechazar" style="margin-top:.6rem;width:100%;padding:.75rem;border-radius:.8rem;border:1px solid #e5484d;background:transparent;color:#e5484d;font-weight:600;cursor:pointer;">No acepto, cancelar pedido</button>`;

  wrap.querySelector("#delivery-aceptar").onclick = async (ev) => {
    const b = ev.currentTarget;
    b.disabled = true;
    b.textContent = "Enviando…";
    const r = await llamar("aceptarDelivery", { costoVisto: d.costo });
    if (!r.ok) {
      b.disabled = false;
      b.textContent = `Aceptar delivery · S/ ${costo}`;
      const e = wrap.querySelector("#delivery-err");
      e.textContent = r.mensaje || "No se pudo aceptar";
      e.style.display = "block";
    }
  };
  wrap.querySelector("#delivery-rechazar").onclick = () =>
    abrirModalCancelar(pedidoRefGlobal);
}

function notificarDelivery(data) {
  if (!window.Notification || Notification.permission !== "granted") return;
  const d = data.delivery_pendiente || {};
  try {
    new Notification(
      `${el("negocio-nombre")?.textContent || "Geinz"} · Delivery`,
      {
        body: `El delivery cuesta S/ ${Number(d.costo || 0).toFixed(2)}. Nuevo total S/ ${Number(d.total_propuesto || 0).toFixed(2)}. Entra para aceptarlo.`,
        icon: el("logo-img")?.src || undefined,
        tag: "geinz-delivery-" + Date.now(),
      },
    );
  } catch (e) {}
}
/* ══════════ Pago de la diferencia (tras responder la pausa) ══════════ */
function renderPagoExtra(data, estadoActual) {
  const x = data.pago_extra;
  const activo =
    x && x.estado !== "confirmado" && !["rechazado", "entregado"].includes(estadoActual);
  let wrap = el("pago-extra-wrap");
  if (!activo) {
    wrap?.remove();
    return;
  }
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "pago-extra-wrap";
    wrap.className = "card fade-in";
    wrap.style.borderColor = "#fbbf24";
    el("content").insertBefore(wrap, el("content").querySelector("section.card"));
  }
  const key = `${x.tipo || ""}|${x.estado}|${x.monto}|${x.voucher_url || ""}|${negocioMetodosPagoActual ? 1 : 0}`;
  if (wrap.dataset.key === key) return;
  wrap.dataset.key = key;

  if (x.tipo === "devolucion") {
    wrap.innerHTML = `
      <span class="eyebrow" style="color:#4ade80;">↩️ Te devolveremos una diferencia</span>
      <p style="margin:.6rem 0 0;font-size:.9rem;">Tu nuevo pedido cuesta menos de lo que pagaste (S/ ${Number(x.ya_pagado || 0).toFixed(2)}). El negocio te devolverá:</p>
      <p class="font-mono" style="margin:.4rem 0 0;font-size:1.6rem;font-weight:800;text-align:center;">S/ ${Number(x.monto || 0).toFixed(2)}</p>`;
    return;
  }

  const monto = Number(x.monto || 0).toFixed(2);

  if (x.voucher_url) {
    wrap.innerHTML = `
      <span class="eyebrow" style="color:#fbbf24;">⏳ Pago adicional en revisión</span>
      <p style="margin:.6rem 0 0;font-size:.9rem;">El negocio está revisando tu comprobante de <b>S/ ${monto}</b>. Te avisaremos apenas lo confirme.</p>
      <img src="${esc(x.voucher_url)}" alt="Comprobante adicional" style="margin-top:.8rem;width:100%;max-width:220px;border-radius:.8rem;display:block;">`;
    return;
  }

  const mk = detectarMetodoPagoConDatos(data.pago?.metodo);
  const info = mk ? negocioMetodosPagoActual?.[mk] : null;
  const datosPago =
    info && info.enable
      ? `
    ${info.qr ? `<img src="${esc(info.qr)}" alt="QR de pago" style="margin:.8rem auto 0;width:180px;max-width:100%;background:#fff;border-radius:.8rem;padding:6px;display:block;">` : ""}
    <p style="margin:.6rem 0 0;font-size:.85rem;text-align:center;">
      ${esc(LABELS_METODO_PAGO_DATOS[mk] || mk)} · ${esc(nombreOfuscado(info.nombre) || "")}<br>
      <b class="font-mono">${esc(info.numero || "")}</b>
    </p>`
      : "";

  wrap.innerHTML = `
    <span class="eyebrow" style="color:#fbbf24;">💳 Falta pagar una diferencia</span>
    <p style="margin:.6rem 0 0;font-size:.9rem;">Cambiaste tu pedido y el nuevo total es mayor. Ya pagaste <b>S/ ${Number(x.ya_pagado || 0).toFixed(2)}</b>; falta:</p>
    <p class="font-mono" style="margin:.4rem 0 0;font-size:1.6rem;font-weight:800;text-align:center;">S/ ${monto}</p>
    ${datosPago}
    <p id="px-err" style="display:none;margin:.6rem 0 0;font-size:.78rem;color:#e5484d;"></p>
    <input type="file" id="px-input" accept="image/*" style="display:none">
    <button id="px-btn" style="margin-top:1rem;width:100%;padding:.8rem;border-radius:.8rem;border:none;background:#fbbf24;color:#2a1d00;font-weight:700;cursor:pointer;">📎 Subir comprobante de S/ ${monto}</button>`;

  const btn = wrap.querySelector("#px-btn");
  const inp = wrap.querySelector("#px-input");
  const err = wrap.querySelector("#px-err");
  btn.onclick = () => inp.click();
  inp.onchange = async () => {
    const file = inp.files[0];
    if (!file) return;
    err.style.display = "none";
    btn.disabled = true;
    btn.textContent = "Subiendo…";
    try {
      const dataURL = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const comprimida = await comprimirImagenGenerica(dataURL, 900, 0.85);
      const r = await llamar("subirComprobanteExtra", { imagen: comprimida });
      if (!r.ok) {
        err.textContent = r.mensaje || "No se pudo enviar el comprobante";
        err.style.display = "block";
        btn.disabled = false;
        btn.textContent = `📎 Subir comprobante de S/ ${monto}`;
      }
    } catch (e) {
      console.error(e);
      err.textContent = "No se pudo leer la imagen. Intenta con otra";
      err.style.display = "block";
      btn.disabled = false;
      btn.textContent = `📎 Subir comprobante de S/ ${monto}`;
    }
    inp.value = "";
  };
}

function labelEstadoMostrado(estadoActual, data) {
  if (estadoActual === "rechazado" && data.cancelado_por_cliente) {
    return "Pedido cancelado";
  }
  if (esPedidoCampana(data)) {
    if (["en_proceso", "listo"].includes(estadoActual)) return "Aceptado";
    if (estadoActual === "pendiente_pago") return "Pendiente";
  }
  return ESTADOS_LABEL[estadoActual] || estadoActual;
}
// Convierte el valor de una opción del pedido guardado en pares [nombreOpcion, cantidad].
// Soporta los 3 formatos que puede traer un pedido según cuándo se hizo:
//   - string viejo: "Helada"
//   - array (multi-select sin cantidad): ["Papas extras", "Doble carne"]
//   - objeto con cantidad: { "Papas extras": 2, "Doble carne": 1 }
function entradasDeOpcion(v) {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return Object.entries(v).filter(([, c]) => (Number(c) || 0) > 0);
  }
  if (Array.isArray(v)) return v.map((n) => [n, 1]);
  return v ? [[v, 1]] : [];
}

// Arma las líneas de detalle (una por opción marcada) para un producto del pedido
function opcionesDetalleLineas(p) {
  if (!p.opciones || !Object.keys(p.opciones).length) return [];
  const lineas = [];
  Object.entries(p.opciones).forEach(([condNombre, v]) => {
    entradasDeOpcion(v).forEach(([nombreOp, cant]) => {
      const cantTxt = cant > 1 ? ` x${cant}` : "";
      lineas.push(`${condNombre}: ${nombreOp}${cantTxt}`);
    });
  });
  return lineas;
}

function renderTiempoEstimado(data, estadoActual) {
  let box = el("tiempo-estimado");
  if (!box) {
    box = document.createElement("p");
    box.id = "tiempo-estimado";
    box.className = "hidden text-secondary";
    box.style.cssText = "margin:1rem 0 0;font-size:0.9rem;line-height:1.5;";
    el("timeline").insertAdjacentElement("afterend", box);
  }
  const t = data.tiempo_estimado;
  if (!t || estadoActual === "rechazado" || estadoActual === "entregado") {
    box.classList.add("hidden");
    return;
  }
  let txt = `⏱️ Tiempo estimado: <strong>${esc(t.min)}–${esc(t.max)} min</strong>`;
  const desde = toDateFS(data.tiempo_estimado_desde);
  if (estadoActual === "en_proceso" && desde) {
    const f = (min) =>
      new Date(desde.getTime() + min * 60000).toLocaleTimeString("es-PE", {
        hour: "2-digit",
        minute: "2-digit",
      });
    txt += `<br><span class="text-muted" style="font-size:0.8rem;">Listo aprox. entre ${f(t.min)} y ${f(t.max)}</span>`;
  }
  box.innerHTML = txt;
  box.classList.remove("hidden");
}

/* ══════════════ "Ya llegué": aviso descriptivo + cuenta regresiva entre avisos ══════════════
   1.er aviso: botón activo, sin temporizador.
   Después de cada aviso: se bloquea 2 min con cuenta regresiva y luego se puede volver a avisar.
   La hora del último aviso la guarda el servidor (cliente_en_local_en). */
const ESPERA_LLEGADA_MS = 2 * 60 * 1000;
let timerLlegada = null;
let avisandoLlegada = false;

function configurarCuentaLlegada(activo, data, esPunto) {
  clearInterval(timerLlegada);
  timerLlegada = null;

  const btn = el("btn-en-local");
  if (!btn) return;

  let aviso = el("en-local-aviso");
  if (!aviso) {
    aviso = document.createElement("p");
    aviso.id = "en-local-aviso";
    aviso.className = "text-secondary hidden";
    aviso.style.cssText =
      "margin:0 0 0.7rem;font-size:0.85rem;line-height:1.5;";
    btn.insertAdjacentElement("beforebegin", aviso);
  }

  if (!activo) {
    aviso.classList.add("hidden");
    return;
  }

  const lugar = esPunto ? "al punto de entrega" : "al local";
  const yaAviso = !!data.cliente_en_local;

  aviso.innerHTML = yaAviso
    ? `Si todavía no te atienden, puedes volver a avisar cuando termine la cuenta regresiva.`
    : `📍 <strong>Tu pedido ya está listo.</strong> Cuando llegues ${lugar}, toca el botón de abajo para avisarle al negocio que ya estás ahí. <span class="text-muted">Presiónalo solo cuando ya hayas llegado.</span>`;
  aviso.classList.remove("hidden");

  // Momento del último aviso (lo guarda el servidor)
  const ultimo = yaAviso
    ? (toDateFS(data.cliente_en_local_en)?.getTime() ?? Date.now())
    : 0;
  const fin = ultimo + ESPERA_LLEGADA_MS;

  const tick = () => {
    if (avisandoLlegada) return;
    const resta = yaAviso ? Math.ceil((fin - Date.now()) / 1000) : 0;
    if (resta > 0) {
      const mm = String(Math.floor(resta / 60)).padStart(2, "0");
      const ss = String(resta % 60).padStart(2, "0");
      btn.disabled = true;
      btn.style.opacity = ".6";
      btn.textContent = `🔔 Volver a avisar · disponible en ${mm}:${ss}`;
    } else {
      btn.disabled = false;
      btn.style.opacity = "";
      btn.textContent = yaAviso
        ? "🔔 Volver a avisar que estoy aquí"
        : textoBtnLlegada;
      clearInterval(timerLlegada);
      timerLlegada = null;
    }
  };

  tick();
  if (yaAviso && fin > Date.now()) timerLlegada = setInterval(tick, 1000);
}
/* ══════════════ Miniatura de producto: foto o logo del negocio ══════════════ */
function inyectarEstilosMiniatura() {
  if (document.getElementById("prodThumbStyle")) return;
  const st = document.createElement("style");
  st.id = "prodThumbStyle";
  st.textContent = `
    .prod-thumb{width:48px;height:48px;border-radius:12px;overflow:hidden;flex-shrink:0;background:#111;}
    .prod-thumb > img{width:100%;height:100%;object-fit:cover;display:block;}
    .logo-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;
      background:radial-gradient(circle,
        color-mix(in srgb,var(--accent,#888) 22%,transparent),
        color-mix(in srgb,var(--accent,#888) 6%,transparent));}
    .logo-ph img{width:34px;height:34px;object-fit:cover;border-radius:50%;background:#111;
      box-shadow:0 2px 8px rgba(0,0,0,.4),0 0 0 1px rgba(255,255,255,.06);}
    .logo-ph .ph-letter{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;
      justify-content:center;font-size:.95rem;font-weight:800;color:var(--accent,#fff);
      background:color-mix(in srgb,var(--accent,#888) 14%,transparent);
      border:1px solid color-mix(in srgb,var(--accent,#888) 35%,transparent);}
  `;
  document.head.appendChild(st);
}

function crearLogoPlaceholder() {
  const ph = document.createElement("div");
  ph.className = "logo-ph";
  if (bizLogoActual) {
    const im = document.createElement("img");
    im.alt = bizNombreActual || "Logo";
    im.decoding = "async";
    im.onerror = () => {
      im.remove();
      const l = document.createElement("span");
      l.className = "ph-letter";
      l.textContent = (bizNombreActual || "?").trim().charAt(0).toUpperCase();
      ph.appendChild(l);
    };
    im.src = bizLogoActual;
    ph.appendChild(im);
  } else {
    const l = document.createElement("span");
    l.className = "ph-letter";
    l.textContent = (bizNombreActual || "?").trim().charAt(0).toUpperCase();
    ph.appendChild(l);
  }
  return ph;
}

function crearMiniaturaProducto(p) {
  inyectarEstilosMiniatura();
  const wrap = document.createElement("div");
  wrap.className = "prod-thumb";
  const mostrarLogo = () => {
    wrap.innerHTML = "";
    wrap.appendChild(crearLogoPlaceholder());
  };
  if (p.imagen) {
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.onerror = mostrarLogo; // si la foto falla, también logo
    img.src = p.imagen;
    wrap.appendChild(img);
  } else {
    mostrarLogo();
  }
  return wrap;
}
function renderPedido(data) {
  const estadoActual = normalizarEstado(data.estado);
  const esRechazado = estadoActual === "rechazado";
  const enPausa = estadoActual === "en_pausa";

  // La línea de tiempo, mientras está en pausa, sigue mostrando el progreso
  // que tenía antes (pendiente/en_proceso), para no "perder" el avance visual.
  const estadoParaTimeline = enPausa
    ? data.pausa?.estado_anterior || "pendiente"
    : estadoActual;
  const camp = esPedidoCampana(data);
  const estadoTL = camp
    ? { pendiente_pago: "pendiente", listo: "en_proceso" }[
        estadoParaTimeline
      ] || estadoParaTimeline
    : estadoParaTimeline;

  renderTiempoEstimado(data, estadoActual);
  renderTimeline(
    estadoTL,
    esRechazado,
    !!data.cancelado_por_cliente,
    requierePagoOnline(data),
    camp,
  );
  renderCampanaInfo(data, estadoActual);

  if (enPausa) renderPausaBanner(data, pedidoRefGlobal);
  else quitarPausaBanner();
  renderDeliveryPropuesta(data, estadoActual);
  renderPagoExtra(data, estadoActual);
  el("status-label").textContent = labelEstadoMostrado(estadoActual, data);

  // El negocio ya no puede ser contactado sobre un pedido que el propio
  // cliente canceló — se oculta el botón de WhatsApp en ese caso.
  const btnWa = el("btn-whatsapp");
  if (btnWa) {
    btnWa.classList.toggle(
      "hidden",
      !waHabilitado || !!data.cancelado_por_cliente,
    );
  }

  // El cliente solo puede cancelar mientras el pedido sigue "Pendiente"
  // (o pendiente de pago sin comprobante). En pausa tiene su propio botón.
  const btnCancelar = el("btn-cancelar-pedido");
  const puedeCancelar =
    estadoActual === "pendiente" ||
    (estadoActual === "pendiente_pago" && !data.pago?.voucher_url);
  btnCancelar?.classList.toggle("hidden", !puedeCancelar);

  el("aviso-pago-futuro")?.classList.toggle(
    "hidden",
    !(estadoActual === "pendiente" && requierePagoOnline(data)),
  );
  el("pedido-fecha-hora").textContent = [data.fecha, data.hora]
    .filter(Boolean)
    .join(" · ");

  /* ── Botón "ya llegué": solo cuando el pedido está LISTO ── */
  const tipoEntrega = data.cliente?.tipo_entrega || "";
  const esRecojoPunto = tipoEntrega === "Recojo en punto";
  const esRecojoLocal = tipoEntrega === "Recojo en local";
  const puedeAvisar =
    (esRecojoPunto || esRecojoLocal) && estadoActual === "listo";
  const puntoNombre = data.punto_entrega?.nombre || "";

  textoBtnLlegada = esRecojoPunto
    ? "📍 Ya llegué al punto de entrega"
    : "📍 Ya estoy en el local";
  const textoOkLlegada = esRecojoPunto
    ? `✅ Avisamos al negocio que ya estás en ${puntoNombre || "el punto acordado"}`
    : "✅ Ya avisamos al negocio que llegaste";

  el("en-local-wrap")?.classList.toggle("hidden", !puedeAvisar);
  configurarCuentaLlegada(puedeAvisar, data, esRecojoPunto);
  const okLlegada = el("en-local-ok");
  if (okLlegada) {
    okLlegada.textContent = textoOkLlegada;
    okLlegada.classList.toggle("hidden", !data.cliente_en_local);
  }

  // Código del pedido + QR (recojo)
  renderCodigoPedido(data, estadoActual);

  const dot = el("status-dot");
  dot.dataset.status = estadoActual;
  dot.classList.remove("pulse");
  dot.style.backgroundColor = "";
  if (esRechazado) {
    dot.style.backgroundColor = "#e5484d";
  } else if (enPausa) {
    dot.style.backgroundColor = "#38bdf8";
    dot.classList.add("pulse");
  } else if (estadoActual !== "entregado") {
    dot.classList.add("pulse");
  }

  // Cliente
  const cliente = data.cliente || {};
  el("cliente-nombre").textContent = cliente.nombre || "—";
  el("cliente-entrega").textContent = cliente.tipo_entrega || "—";

  el("cliente-mesa-wrap").classList.toggle("hidden", !cliente.mesa);
  if (cliente.mesa) el("cliente-mesa").textContent = cliente.mesa;

  // Dirección / punto de entrega
  const dirLabel = el("cliente-direccion-label");
  if (esRecojoPunto && data.punto_entrega) {
    const ref = data.punto_entrega.referencia;
    if (dirLabel) dirLabel.textContent = "Punto de entrega";
    el("cliente-direccion").textContent = ref
      ? `${puntoNombre} · ${ref}`
      : puntoNombre;
    el("cliente-direccion-wrap").classList.remove("hidden");
  } else {
    if (dirLabel) dirLabel.textContent = "Dirección";
    el("cliente-direccion-wrap").classList.toggle("hidden", !cliente.direccion);
    if (cliente.direccion)
      el("cliente-direccion").textContent = cliente.direccion;
  }

  el("nota-wrap").classList.toggle("hidden", !data.nota);
  if (data.nota) el("nota-texto").textContent = data.nota;

  // Pago
  el("pago-metodo").textContent = data.pago?.metodo || "—";
  el("pedido-total").textContent = Number(data.total || 0).toFixed(2);
  const fid = cuponesDe(data).filter((c) => c.origen === "fidelizacion");
  cuponCanjeActual = fid.length
    ? {
        codigo: fid.map((c) => c.codigo).join(", "),
        costoPuntos: fid.reduce((s, c) => s + (Number(c.costoPuntos) || 0), 0),
      }
    : null;
  renderResumenCupon(data);
  // Puntos de fidelización
  renderPuntos(data, estadoActual, esRechazado);

  // Productos (nodos DOM en vez de innerHTML con datos dinámicos: evita XSS)
  const cont = el("productos-list");
  cont.innerHTML = "";
  const frag = document.createDocumentFragment();
  (data.productos || []).forEach((p) => {
    const row = document.createElement("div");
    row.className = "producto";

    const thumb = crearMiniaturaProducto(p);
    const info = document.createElement("div");
    info.className = "info";
    const nombre = document.createElement("p");
    nombre.className = "nombre truncate";
    nombre.textContent = p.nombre || "";
    const detalle = document.createElement("p");
    detalle.className = "detalle";
    const gratis = p.esCanje && Number(p.subtotal || 0) <= 0.004;
    detalle.textContent = gratis
      ? `${p.cantidad || 1} × Gratis`
      : `${p.cantidad || 1} × S/ ${Number(p.precio_unitario || 0).toFixed(2)}`;
    info.append(nombre, detalle);

    // Opciones elegidas, una línea por opción marcada
    // (ej. "Extras: Papas extras x2", "Extras: Doble carne")
    opcionesDetalleLineas(p).forEach((linea) => {
      const opcionEl = document.createElement("p");
      opcionEl.className = "detalle";
      opcionEl.style.color = "var(--accent)";
      opcionEl.style.fontStyle = "italic";
      opcionEl.style.margin = "0.1rem 0 0";
      opcionEl.textContent = `• ${linea}`;
      info.append(opcionEl);
    });
    if (p.esCanje) {
      const canjeEl = document.createElement("p");
      canjeEl.className = "detalle";
      canjeEl.style.color = "var(--accent)";
      canjeEl.textContent = "🎁 Canjeado con puntos";
      info.append(canjeEl);
    }
    const subtotal = document.createElement("span");
    subtotal.className = "subtotal font-mono";
    subtotal.textContent = gratis
      ? "GRATIS"
      : `S/ ${Number(p.subtotal || 0).toFixed(2)}`;

    row.append(thumb, info, subtotal);
    frag.appendChild(row);
  });
  cont.appendChild(frag);
}

function renderTimeline(
  estadoActual,
  esRechazado,
  canceladoPorCliente = false,
  conPago = false,
  campana = false,
) {
  const cont = el("timeline");
  cont.innerHTML = "";

  if (esRechazado) {
    const div = document.createElement("div");
    div.style.color = "#e5484d";
    div.style.fontWeight = "600";
    div.style.fontSize = "0.9rem";
    div.textContent = canceladoPorCliente
      ? "Cancelaste este pedido."
      : "Este pedido fue rechazado.";
    cont.appendChild(div);
    return;
  }

  const FLUJO = campana
    ? ["pendiente", "en_proceso", "entregado"]
    : conPago
      ? ["pendiente", "pendiente_pago", "en_proceso", "listo", "entregado"]
      : ["pendiente", "en_proceso", "listo", "entregado"];
  const idxActual = FLUJO.indexOf(estadoActual);
  const frag = document.createDocumentFragment();

  FLUJO.forEach((estado, i) => {
    const activo = i <= idxActual;
    const isLast = i === FLUJO.length - 1;

    const item = document.createElement("div");
    item.className = "tl-item";

    const marker = document.createElement("div");
    marker.className = "tl-marker";
    const tlDot = document.createElement("div");
    tlDot.className = "tl-dot" + (activo ? " active" : "");
    marker.appendChild(tlDot);
    if (!isLast) {
      const line = document.createElement("div");
      line.className = "tl-line" + (activo && i < idxActual ? " active" : "");
      marker.appendChild(line);
    }

    const text = document.createElement("div");
    text.className = "tl-text" + (activo ? " active" : "");
    text.textContent =
      campana && estado === "en_proceso" ? "Aceptado" : ESTADOS_LABEL[estado];

    item.append(marker, text);
    frag.appendChild(item);
  });
  cont.appendChild(frag);
}
/* ══════════════ "Ya llegué" (vía Cloud Function) ══════════════ */
el("btn-en-local")?.addEventListener("click", async () => {
  const b = el("btn-en-local");
  if (!b || b.disabled) return;
  avisandoLlegada = true;
  b.disabled = true;
  b.textContent = "Avisando…";
  const r = await llamar("avisarLlegada");
  avisandoLlegada = false;
  if (!r.ok) {
    alert(r.mensaje || "No se pudo avisar");
    renderPedido(pedidoActualParaPago); // restaura botón / cuenta regresiva
  }
});

/* ══════════════ Zoom del QR de pago (PhotoSwipe 5, carga bajo demanda) ══════════════ */
const PSWP_VER = "5.4.4";
let pswpModulo = null;
function cargarPhotoSwipe() {
  if (!pswpModulo) {
    if (!document.getElementById("pswp-css")) {
      const l = document.createElement("link");
      l.id = "pswp-css";
      l.rel = "stylesheet";
      l.href = `https://cdn.jsdelivr.net/npm/photoswipe@${PSWP_VER}/dist/photoswipe.css`;
      document.head.appendChild(l);
    }
    pswpModulo = import(
      `https://cdn.jsdelivr.net/npm/photoswipe@${PSWP_VER}/dist/photoswipe.esm.min.js`
    );
  }
  return pswpModulo;
}

async function abrirVisorImagen(imgEl, alt) {
  if (!imgEl?.src) return;
  try {
    const { default: PhotoSwipe } = await cargarPhotoSwipe();
    const nw = imgEl.naturalWidth || 1;
    const nh = imgEl.naturalHeight || 1;
    const W = 1400;
    const H = Math.round((W * nh) / nw);
    const pswp = new PhotoSwipe({
      dataSource: [{ src: imgEl.src, width: W, height: H, alt }],
      bgOpacity: 0.96,
      maxZoomLevel: 3,
      wheelToZoom: true,
      showHideAnimationType: "fade",
      padding: { top: 20, bottom: 20, left: 12, right: 12 },
      closeTitle: "Cerrar",
      zoomTitle: "Zoom",
    });
    pswp.init();
  } catch (e) {
    console.warn("[pedidos] No se pudo abrir el visor:", e);
    window.open(imgEl.src, "_blank", "noopener");
  }
}

el("pago-qr-zoom")?.addEventListener("click", () =>
  abrirVisorImagen(el("pago-qr-img"), "QR de pago"),
);
el("comprobante-zoom")?.addEventListener("click", () =>
  abrirVisorImagen(el("comprobante-img"), "Comprobante de pago"),
);
