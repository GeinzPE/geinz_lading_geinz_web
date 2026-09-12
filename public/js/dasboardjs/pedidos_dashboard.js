import {
  getFirestore,
  doc,
  getDoc,
  collection,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
  where,
  limit,
  startAfter,
  Timestamp,
  writeBatch,
  setDoc,
  getDocs,
  addDoc,
  runTransaction,
  increment,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { db } from "../db/db.js";

import {
  tiendaDoc,
  tiendaSubDoc,
  tiendaSubCol,
  data_user_logeado,
  clienteDoc, // NUEVO
  clienteCuponDoc,
} from "../rutas/rutas.js";

let tiendaId = sessionStorage.getItem("tiendaId");
let localidad = sessionStorage.getItem("localidad");
const URL_NOTIFICAR_CLIENTE =
  " https://enviar-notificacion-con-solo-id-desde-la-web-oixttik5rq-uc.a.run.app";
if (!tiendaId || !localidad) {
  // fallback por si el postMessage llega después
  window.addEventListener("message", (e) => {
    if (e.data?.tipo !== "DATOS_TIENDA") return;
    tiendaId = e.data.tiendaId;
    localidad = e.data.localidad;
    // vuelve a ejecutar tu init aquí si hace falta
  });
}
const _params = new URLSearchParams(window.location.search);
const SND_STOCK_AGOTADO = "../../sounds/stok_bajo.mp3";
const SND_NUEVO_PEDIDO_DESCUENTO = "../../sounds/pedido_entrante_descuento.mp3";
const SND_NUEVO_PEDIDO_CUPON_DESCUENTO =
  "../../sounds/pedido_entrante_cupon_descuento.mp3";
const SND_CANJE_PUNTOS = "../../sounds/canje_de_puntos.mp3";
const ID_PRUEBA = tiendaId;
/* ══════════════ Colores fijos para grupos de mesas (ya no editable por el usuario) ══════════════ */
const GROUP_COLOR_OCUPADA = "#f59e0b"; // ámbar, igual que una mesa ocupada individual
const GROUP_COLOR_RESERVADA = "#7c5cff"; // violeta, igual que una mesa reservada individual
function colorParaEstadoGrupo(estado) {
  return estado === "reservada" ? GROUP_COLOR_RESERVADA : GROUP_COLOR_OCUPADA;
}
function playStockAgotadoAlarm() {
  playSoundOnce(SND_STOCK_AGOTADO);
}

function notificarStockAgotado(nombres) {
  if (!window.Notification || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    const n = new Notification("📦 Producto agotado", {
      body: `${nombres} se quedó sin stock`,
      icon: bizLogoUrl || undefined,
      badge: bizLogoUrl || undefined,
      tag: "geinz-stock-agotado-" + Date.now(),
      requireInteraction: false,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (e) {
    console.warn(e);
  }
}

/* ══════════════ Estilos de reserva/grupo de mesas (inyectados) ══════════════ */
const MESA_ADMIN_CSS = `
        .mesas-grupo-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 14px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);}
       .mesas-grupo-bar input[type="text"]{flex:1;min-width:140px;padding:8px 10px;border-radius:10px;border:1px solid var(--line);background:var(--surface);font-size:13px;color:#fff;}
.mesas-grupo-bar input[type="text"]::placeholder{color:rgba(255,255,255,.35);}
        .mg-btn{padding:8px 14px;border:none;border-radius:10px;font-weight:700;font-size:12.5px;cursor:pointer;color:#fff;}
        .mg-reservar{background:#7c5cff;}
        .mg-ocupar{background:var(--amber,#f59e0b);}
        .mg-liberar{background:var(--ink-dim,#666);}
        .mg-desagrupar{background:transparent;border:1px solid var(--line);color:var(--ink-dim);}
        .mesa-box{position:relative;}
        .mesa-box.reservada{border-color:#7c5cff !important;}
        .mesa-box.reservada .mb-status{color:#7c5cff;}
        .mesa-box.reservada .mb-status .dot{background:#7c5cff;}
        .mesa-box.grupo{box-shadow:0 0 0 2px var(--grupo-color,#7c5cff) inset;}
     .mesa-reservar-btn{margin-top:8px;width:100%;padding:6px 0;border-radius:8px;border:1px solid var(--line);background:transparent;color:inherit;font-size:11.5px;font-weight:700;cursor:pointer;}
        .mesa-reservar-btn:hover{background:var(--line);}
        .mesa-desagrupar-btn{margin-top:6px;width:100%;padding:6px 0;border-radius:8px;border:1px dashed var(--line);background:transparent;color:inherit;font-size:11.5px;font-weight:700;cursor:pointer;}
        .mesa-desagrupar-btn:hover{background:var(--line);}
     .mesa-reserva-timer{font-size:10.5px;font-weight:700;color:var(--ink-dim);margin-top:2px;}
.mesa-reserva-timer.urgent{color:#f87171;}
.mesa-reserva-hora{font-size:10.5px;font-weight:700;color:var(--ink-dim);margin-top:2px;}
.mesas-sel-total{font-size:12.5px;font-weight:800;color:var(--green,#22c55e);}
        .mesas-sel-label{flex:1;min-width:160px;font-size:12.5px;font-weight:700;color:var(--ink-dim);}
        .mg-cancelar{background:transparent;border:1px solid var(--line);color:var(--ink-dim);}
        .mesa-box.selectable{cursor:pointer;transition:transform .12s ease,outline .12s ease;}
        .mesa-box.selectable:active{transform:scale(.96);}
        .mesa-box.selected{outline:3px solid #7c5cff;outline-offset:-3px;background:var(--violet-soft,rgba(124,92,255,.12));}
        .mb-check{display:none;position:absolute;top:14px;left:14px;width:22px;height:22px;border-radius:50%;background:#7c5cff;color:#fff;align-items:center;justify-content:center;font-size:12px;font-weight:900;box-shadow:0 0 0 2px var(--bg,#08080c);}
        .mesa-box.selected .mb-check{display:flex;}
        .oc-btn.v-amber{background:var(--amber,#f59e0b);color:#1a1200;}
        
        `;
const styleTag = document.createElement("style");
styleTag.textContent = MESA_ADMIN_CSS;
document.head.appendChild(styleTag);

const PS_CSS = `
.pedido-search-wrap{
  position:relative;
  display:flex;align-items:center;gap:8px;
  margin:10px 14px 4px;
  padding:9px 14px;
  border-radius:14px;
  background:linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,0));
  border:1px solid var(--line);
  transition:border-color .2s ease, box-shadow .2s ease;
}
.pedido-search-wrap:focus-within{
  border-color:#7c5cff;
  box-shadow:0 0 0 3px rgba(124,92,255,.15);
}
.pedido-search-wrap .ps-ico{font-size:14px;opacity:.6;flex-shrink:0;}
.pedido-search-wrap input{
  flex:1;background:transparent;border:none;outline:none;
  color:#fff;font-size:13px;font-weight:600;letter-spacing:.02em;
}
.pedido-search-wrap input::placeholder{color:var(--ink-faint);font-weight:500;}
.ps-clear{
  background:var(--surface);border:1px solid var(--line);color:var(--ink-dim);
  width:22px;height:22px;border-radius:50%;font-size:11px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;flex-shrink:0;
}
.ps-clear:hover{background:var(--line);color:#fff;}
.ps-result{
  position:absolute;left:14px;top:calc(100% + 6px);
  font-size:11.5px;font-weight:700;padding:5px 10px;border-radius:8px;
  white-space:nowrap;z-index:5;
  animation:ps-pop-in .18s ease;
}
.ps-result.ok{background:rgba(124,92,255,.15);color:#a78bfa;border:1px solid rgba(124,92,255,.3);}
.ps-result.warn{background:rgba(248,113,113,.12);color:#f87171;border:1px solid rgba(248,113,113,.3);}
@keyframes ps-pop-in{from{opacity:0;transform:translateY(-4px);}to{opacity:1;transform:translateY(0);}}

/* Resalte del pedido encontrado — dorado, para que no se confunda con
   los estados violeta/verde/ámbar que ya usa el tablero */
.order-card.oc-search-match{
  outline:2px solid #f5c563;
  outline-offset:2px;
  box-shadow:0 0 0 5px rgba(245,197,99,.14), 0 6px 22px rgba(245,197,99,.18);
  animation:ps-glow 1.6s ease-in-out infinite;
}
@keyframes ps-glow{
  0%,100%{box-shadow:0 0 0 5px rgba(245,197,99,.14), 0 6px 22px rgba(245,197,99,.18);}
  50%{box-shadow:0 0 0 8px rgba(245,197,99,.22), 0 6px 26px rgba(245,197,99,.28);}
}
`;

const NP_CSS = `
.dm-cupon-card{border-radius:14px;padding:12px 14px;margin-bottom:14px;}
.dm-cupon-row{display:flex;justify-content:space-between;font-size:12.5px;color:var(--ink-dim);padding:3px 0;}
.dm-cupon-row .mono{font-family:monospace;letter-spacing:.05em;}
.oc-cupon-tag{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:800;padding:3px 8px;border-radius:999px}
.np-stock{font-size:10.5px;font-weight:700;color:var(--ink-dim);margin-top:-2px;}
.np-stock.agotado{color:#f87171;}
.np-card.sin-stock{opacity:.55;}
.np-opt-btn:disabled{opacity:.35;cursor:not-allowed;text-decoration:line-through;}
#npRefreshBtn.spinning{animation:np-spin .8s linear infinite;}
@keyframes np-spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
#npRefreshBtn:disabled{opacity:.6;cursor:not-allowed;}
.oc-puntos-aceptar{
  width:100%;
  font-size:11.5px;
  font-weight:700;
  color:#fbbf24;
  background:rgba(251,191,36,.1);
  border:1px solid rgba(251,191,36,.25);
  border-radius:10px;
  padding:8px 10px;
  margin-bottom:8px;
}
.oc-puntos-aceptar strong{
  color:#fcd34d;
}
        .np-pago-row{display:flex;gap:8px;margin-bottom:10px;}
.np-pago-btn{flex:1;padding:8px 0;border-radius:10px;border:1px solid var(--line);background:var(--bg,#0a0a0f);color:var(--ink-dim);font-weight:700;font-size:12.5px;cursor:pointer;}
.np-pago-btn.active{background:#7c5cff;border-color:#7c5cff;color:#fff;}
.nuevo-pedido-wrap{display:flex;gap:14px;padding:14px;flex-wrap:wrap;}
.np-panel{flex:2;min-width:280px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px;}
.np-search-wrap input{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg,#0a0a0f);color:#fff;font-size:13px;margin-bottom:10px;}
.np-filtros{display:flex;gap:6px;overflow-x:auto;margin-bottom:12px;}
.np-filtros .np-chip{padding:6px 12px;border-radius:999px;background:var(--surface);border:1px solid var(--line);font-size:12px;font-weight:700;white-space:nowrap;cursor:pointer;color:var(--ink-dim);}
.np-filtros .np-chip.active{background:#7c5cff;color:#fff;border-color:#7c5cff;}
.np-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;max-height:520px;overflow-y:auto;}
.np-card{background:var(--bg,#0a0a0f);border:1px solid var(--line);border-radius:12px;padding:8px;display:flex;flex-direction:column;gap:6px;}
.np-card img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;background:#1a1a20;}
.np-card .np-name{font-size:12px;font-weight:700;line-height:1.25;}
.np-card .np-price{font-size:12.5px;font-weight:800;color:#7c5cff;}
.np-qty-row{display:flex;align-items:center;justify-content:space-between;margin-top:2px;}
.np-qty-row button{width:26px;height:26px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:#fff;font-weight:900;cursor:pointer;}
.np-add-btn{width:100%;padding:7px 0;border-radius:8px;border:none;background:#7c5cff;color:#fff;font-weight:700;font-size:12px;cursor:pointer;}
.np-empty{padding:30px;text-align:center;color:var(--ink-faint);font-size:13px;}
.np-cart-panel{flex:1;min-width:240px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px;display:flex;flex-direction:column;max-height:600px;}
.np-cart-head{font-weight:800;font-size:14px;margin-bottom:10px;}
.np-cliente-input{width:100%;padding:8px 10px;border-radius:10px;border:1px solid var(--line);background:var(--bg,#0a0a0f);color:#fff;font-size:12.5px;margin-bottom:10px;}
.np-cart-items{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:10px;}
.np-cart-row{display:flex;align-items:center;gap:8px;font-size:12px;}
.np-cart-row .npc-name{flex:1;min-width:0;}
.np-cart-row .npc-name .n{font-weight:700;display:block;truncate;}
.np-cart-row .npc-name .p{color:var(--ink-dim);font-size:11px;}
.np-cart-total{display:flex;justify-content:space-between;font-weight:800;font-size:14px;padding-top:10px;border-top:1px solid var(--line);margin-bottom:10px;}
.np-confirmar-btn{width:100%;padding:12px 0;border-radius:12px;border:none;background:#22c55e;color:#04240f;font-weight:800;font-size:13px;cursor:pointer;}
.np-confirmar-btn:disabled{opacity:.4;cursor:not-allowed;}

.np-img-wrap{
  width:100%;
  aspect-ratio:1;
  border-radius:8px;
  overflow:hidden;
  background:#1a1a20;
  display:flex;
  align-items:center;
  justify-content:center;
}
.np-img-wrap img{width:100%;height:100%;object-fit:cover;}

.np-noimg,.np-img-ph{
  width:100%;
  height:100%;
  background:radial-gradient(circle at center, rgba(124,92,255,.18), rgba(124,92,255,.05));
  display:flex;
  align-items:center;
  justify-content:center;
}
.np-logo-circle{
  width:52%;
  aspect-ratio:1/1;
  border-radius:50%;
  overflow:hidden;
  background:#14101f;
  border:1px solid rgba(124,92,255,.35);
  box-shadow:0 4px 14px rgba(0,0,0,.4);
  display:flex;
  align-items:center;
  justify-content:center;
  flex-shrink:0;
}
.np-logo-circle img {
    object-fit: contain;
    display: block;
    border-radius: 50%;
}
.np-opt-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:60;align-items:center;justify-content:center;}
.np-opt-overlay.show{display:flex;}
.np-opt-modal{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:16px;width:340px;max-width:92vw;max-height:80vh;overflow-y:auto;}
.np-opt-head{display:flex;justify-content:space-between;font-weight:800;margin-bottom:12px;}
.np-opt-head button{background:none;border:none;color:#fff;font-size:16px;cursor:pointer;}
.np-opt-label{font-size:12px;font-weight:700;color:var(--ink-dim);margin-bottom:6px;}
.np-opt-row{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;}
.np-opt-btn{padding:6px 10px;border-radius:10px;border:1px solid var(--line);background:transparent;color:#fff;font-size:12px;cursor:pointer;}
.np-opt-btn.active{background:#7c5cff;border-color:#7c5cff;}

.np-card{transition:border-color .2s ease, box-shadow .2s ease;}
.np-card.in-cart{border-color:rgba(124,92,255,.5); box-shadow:0 0 0 1px rgba(124,92,255,.25) inset;}
@keyframes np-pop{0%{transform:scale(.7);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
.np-add-btn,.np-qty-row{animation:np-pop .25s cubic-bezier(.34,1.56,.64,1);}
@keyframes np-bump{0%{transform:scale(1)}40%{transform:scale(1.25)}100%{transform:scale(1)}}
.np-bump{animation:np-bump .25s cubic-bezier(.34,1.56,.64,1);}

.np-cart-row{align-items:flex-start;}
.npc-thumb{width:36px;height:36px;border-radius:15%;overflow:hidden;flex-shrink:0;background:#1a1a20;}
.npc-thumb img{width:100%;height:100%;object-fit:cover;}
.npc-thumb-ph{
  width:100%;height:100%;
  background:radial-gradient(circle at center, rgba(124,92,255,.18), rgba(124,92,255,.05)), #14101f;
  display:flex;align-items:center;justify-content:center;
}
.npc-cat{color:#7c5cff !important;text-transform:uppercase;font-size:10px !important;font-weight:700 !important;letter-spacing:.03em;}
.npc-subtotal{font-weight:800;flex-shrink:0;}

.np-cart-row{position:relative;align-items:flex-start;}
.npc-right{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;}
.npc-icons{display:flex;gap:4px;}
.npc-ico{
  width:22px;height:22px;border-radius:6px;border:1px solid var(--line);
  background:var(--bg,#0a0a0f);color:#fff;font-size:12px;line-height:1;
  display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;
}
.npc-ico:hover{background:var(--line);}
.npc-ico.danger{border-color:rgba(248,113,113,.35);color:#f87171;}
.npc-ico.danger:hover{background:rgba(248,113,113,.15);}
.npc-edit{
  border:none;background:none;color:#7c5cff;font-size:11px;font-weight:700;
  cursor:pointer;padding:0;
}
.npc-edit:hover{text-decoration:underline;}
`;

styleTag.textContent = MESA_ADMIN_CSS + NP_CSS + PS_CSS;
/* ══════════════ Identificación del negocio ══════════════ */

const ESTADOS = [
  "pendiente",
  "en_proceso",
  "en_pausa",
  "entregado",
  "rechazado",
];
const pedidosMap = new Map(); // id -> data
const mesasMap = new Map(); // docId -> data (numero_mesa, nombre_alias, ...)
const gruposMap = new Map();
const clientesSeguidoresCache = new Map(); // uid -> true/false (existe en /clientes)
const prevMoney = {
  pendiente: 0,
  en_proceso: 0,
  en_pausa: 0,
  entregado: 0,
  rechazado: 0,
};
let activeTab = "pendiente";
let activeModalId = null;
let isFirstSnapshot = true;
let bizLogoUrl = "";
let bizNombreGlobal = "Geinz";
let soundEnabled = localStorage.getItem("geinz_sound_enabled") !== "0";
let audioCtx = null;
let pedidoSearchActivoId = null;
const SND_NUEVO_PEDIDO = "../../sounds/nuevo_pedido_en_geinz.mp3";
const SND_PEDIDO_CANCELADO = "../../sounds/se_cancelo_un_pedido.mp3";
const SND_PEDIDO_CANCELADO_PAUSA = "../../sounds/cancelo_pedido_pausa.mp3";
const SND_CLIENTE_CANCELO_PEDIDO = "../../sounds/cliente_cancelo_pedido.mp3"; // cliente canceló estando en pausa
const SND_PEDIDO_CONTESTADO = "../../sounds/modifico_pedido_pausa.mp3"; // cliente respondió (reemplazo / continuar)
/* ══════════════ Cola global de alarmas de pedidos (evita que se crucen) ══════════════
   Solo suena UN audio de alarma a la vez. Cada pedido pendiente que necesita alarma
   se encola y espera su turno. Cuando le toca, se repite 4 VECES COMPLETAS (nunca
   se corta un audio a la mitad, porque se espera el evento "ended", no un timeout).
   Si el pedido cambia de estado (lo acepta el negocio, lo pausa, lo rechaza, o el
   cliente lo cancela desde su seguimiento) antes de terminar sus 4 repeticiones,
   se corta al toque y pasa al siguiente pedido en cola. */
const REPETICIONES_ALARMA = 4;
const colaAlarmas = []; // [{ pedidoId, url }]
let alarmaActual = null; // { pedidoId, audio, repeticionesRestantes }

function encolarAlarma(pedidoId, url) {
  if (!soundEnabled) return;
  if (alarmaActual?.pedidoId === pedidoId) return; // ya está sonando
  if (colaAlarmas.some((a) => a.pedidoId === pedidoId)) return; // ya está en cola
  colaAlarmas.push({ pedidoId, url });
  if (!alarmaActual) reproducirSiguienteAlarma();
}

function reproducirSiguienteAlarma() {
  if (!colaAlarmas.length) {
    alarmaActual = null;
    return;
  }
  const { pedidoId, url } = colaAlarmas.shift();

  // Si mientras esperaba en cola el pedido ya dejó de estar "pendiente", se salta
  const pedido = pedidosMap.get(pedidoId);
  const estado = pedido
    ? ESTADOS.includes(pedido.estado)
      ? pedido.estado
      : "pendiente"
    : null;
  if (!pedido || estado !== "pendiente") {
    reproducirSiguienteAlarma();
    return;
  }

  const audio = new Audio(url);
  alarmaActual = { pedidoId, audio, repeticionesRestantes: REPETICIONES_ALARMA };

  audio.addEventListener("ended", () => {
    if (!alarmaActual || alarmaActual.pedidoId !== pedidoId) return;
    alarmaActual.repeticionesRestantes -= 1;
    if (alarmaActual.repeticionesRestantes > 0) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } else {
      reproducirSiguienteAlarma();
    }
  });

  audio
    .play()
    .catch((err) => {
      console.warn("No se pudo reproducir el audio:", err);
      reproducirSiguienteAlarma();
    });
}

/* Corta la alarma de UN pedido específico: si está sonando ahora, la detiene
   y pasa a la siguiente en cola; si todavía esperaba su turno, se saca de la cola. */
function detenerSoundLoopParaPedido(pedidoId) {
  const idx = colaAlarmas.findIndex((a) => a.pedidoId === pedidoId);
  if (idx !== -1) colaAlarmas.splice(idx, 1);

  if (alarmaActual?.pedidoId === pedidoId) {
    alarmaActual.audio.pause();
    alarmaActual.audio.currentTime = 0;
    alarmaActual = null;
    reproducirSiguienteAlarma();
  }
}

function playSoundOnce(url) {
  if (!soundEnabled) return;
  try {
    new Audio(url)
      .play()
      .catch((err) => console.warn("No se pudo reproducir el audio:", err));
  } catch (e) {
    console.warn("Error reproduciendo sonido:", e);
  }
}
/* ══════════════ Origen del pedido: WhatsApp o Mesa ══════════════
           Cada pedido trae su propio campo "mesa" (map) cuando viene de una
           mesa física: { id: "mesa_2", nombre: "Mesa 2", numero: 2 }. Si ese
           campo no existe (o no tiene número), el pedido es de WhatsApp.
           Ya no dependemos del ID del documento para saber el origen. */
function getTipoCuponPedido(p) {
  const c = p?.cupon;
  if (!c) return null;
  const esFidelizacion = c.origen === "fidelizacion";
  const productos = Array.isArray(p.productos) ? p.productos : [];
  // Canje de puntos "puro": vino de fidelización, es un producto canjeado,
  // y no hay nada más en el carrito
  if (esFidelizacion && c.tipo === "producto" && productos.length === 1) {
    return "canje_puntos";
  }
  if (esFidelizacion) return "descuento_fidelizacion"; // % o monto pagado con puntos
  return "cupon_descuento"; // cupón normal del negocio, no fidelización
}
function getOrigen(p) {
  const mesa = p && p.mesa;
  if (mesa && mesa.numero != null) {
    return {
      tipo: "mesa",
      numero: Number(mesa.numero),
      nombre: mesa.nombre || null,
      mesaId: mesa.id || null,
    };
  }
  // Pedidos de mesa guardados en el histórico (formato plano: mesaId / mesaNumero)
  if (p && p.mesaId && p.mesaNumero != null) {
    return {
      tipo: "mesa",
      numero: Number(p.mesaNumero),
      nombre: p.mesaNombre || null,
      mesaId: p.mesaId,
    };
  }
  return { tipo: "whatsapp", numero: null, nombre: null, mesaId: null };
}
let originFilter = "whatsapp"; // "whatsapp" | "mesa"
let whatsappUnseen = 0;
let mesaFilter = null; // numero_mesa seleccionado, o null = todas las mesas
let mesaEstadoFilter = null;
let mesasSeleccionadas = new Set();
/* ══════════════ Auto-rechazo por tiempo (configurable) ══════════════ */
let autoRejectEnabled = localStorage.getItem("geinz_autorej_on") === "1";
let autoRejectMinutes = Number(localStorage.getItem("geinz_autorej_min")) || 5;
const autoRejectingIds = new Set(); // evita disparos duplicados mientras se actualiza Firestore

/* ══════════════ Auto-liberación de reservas por tiempo (configurable) ══════════════
           Si una mesa (o grupo de mesas) queda "reservada" más de X minutos sin pasar a
           "ocupada", se le quita la reserva automáticamente y suena una alarma. */
let autoResEnabled = localStorage.getItem("geinz_autores_on") === "1";
let autoResMinutes = Number(localStorage.getItem("geinz_autores_min")) || 20;
const autoResReleasingIds = new Set(); // evita disparos duplicados (mesaDocId o grupoId) mientras se actualiza Firestore

/* ══════════════ Filtro de fecha ══════════════
           El tablero SIEMPRE arranca mostrando solo los pedidos de HOY.
           El usuario puede cambiar a: ayer, esta semana, semana pasada o un rango personalizado.
           Esta preferencia NO se guarda entre sesiones a propósito: cada vez que se abre el
           panel, por defecto se ve "Hoy".

           IMPORTANTE (escalabilidad): este rango ya NO se usa solo para filtrar en el
           cliente — se usa para construir la query de Firestore (where timestamp >= / <=),
           así el listener en tiempo real solo trae los documentos del periodo visible,
           sin importar cuántos miles de pedidos históricos existan en la colección. */

function getDateFilterRange() {
  const ahoraUTC = new Date();
  const limaOffsetMs = -5 * 60 * 60 * 1000; // Lima es UTC-5 todo el año, sin horario de verano
  const limaAhora = new Date(ahoraUTC.getTime() + limaOffsetMs);
  const y = limaAhora.getUTCFullYear(),
    m = limaAhora.getUTCMonth(),
    d = limaAhora.getUTCDate();
  const from = new Date(Date.UTC(y, m, d, 0, 0, 0) - limaOffsetMs);
  const to = new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - limaOffsetMs);
  return [from, to];
}

/* Filtro combinado que SOLO queda por aplicar en el cliente: origen (whatsapp/mesa)
           y mesa específica seleccionada. La fecha ya viene acotada desde Firestore. */
function pedidoVisible(id, p) {
  const origen = getOrigen(p);
  if (originFilter === "whatsapp" && origen.tipo !== "whatsapp") return false;
  if (originFilter === "mesa") {
    if (origen.tipo !== "mesa") return false;
    if (mesaFilter !== null && origen.numero !== mesaFilter) return false;
  }
  return true;
}

/* ══════════════ Modal de pausa: elegir producto agotado + mensaje + tiempo ══════════════ */
function abrirModalPausa(id, p) {
  const productos = Array.isArray(p.productos) ? p.productos : [];
  const body = document.getElementById("pausaBody");
  if (!body) {
    console.warn(
      "[pedidos] Falta el elemento #pausaBody en el HTML, agrega el modal de pausa",
    );
    return;
  }
  body.innerHTML = `
    <div class="np-opt-label">¿Qué producto(s) se agotaron?</div>
    <div class="np-opt-row" id="pausaProdRow">
      ${productos.map((it, i) => `<button type="button" class="np-opt-btn" data-idx="${i}">${escapeHtml(it.nombre)}</button>`).join("")}
    </div>
    <div class="np-opt-label">Mensaje para el cliente (opcional)</div>
    <textarea id="pausaMotivo" rows="2" style="width:100%;border-radius:10px;border:1px solid var(--line);background:var(--bg,#0a0a0f);color:#fff;padding:8px;font-size:12.5px;" placeholder="Ej: Se nos terminó el pollo a la brasa entero"></textarea>
    <div class="np-opt-label" style="margin-top:12px;">Tiempo de espera estimado</div>
    <div style="display:flex;gap:8px;">
      <input type="number" id="pausaTiempoValor" min="1" value="15" style="width:80px;padding:8px;border-radius:10px;border:1px solid var(--line);background:var(--bg,#0a0a0f);color:#fff;">
      <select id="pausaTiempoUnidad" style="flex:1;padding:8px;border-radius:10px;border:1px solid var(--line);background:var(--bg,#0a0a0f);color:#fff;">
        <option value="minutos">Minutos</option><option value="horas">Horas</option><option value="dias">Días</option>
      </select>
    </div>
    <button id="pausaConfirmarBtn" class="np-confirmar-btn" style="margin-top:14px;">Pausar pedido</button>
  `;

  const seleccionados = new Set();
  body.querySelectorAll("#pausaProdRow .np-opt-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      const idx = Number(btn.dataset.idx);
      btn.classList.contains("active")
        ? seleccionados.add(idx)
        : seleccionados.delete(idx);
    });
  });

  document.getElementById("pausaConfirmarBtn").onclick = async () => {
    if (!seleccionados.size)
      return showToast("Selecciona al menos un producto agotado", true);
    const productosAfectados = [...seleccionados].map((i) => ({
      id: productos[i].id,
      nombre: productos[i].nombre,
    }));
    const valor = Math.max(
      1,
      Number(document.getElementById("pausaTiempoValor").value) || 15,
    );
    const unidad = document.getElementById("pausaTiempoUnidad").value;
    const motivo = document.getElementById("pausaMotivo").value.trim();

    detenerSoundLoopParaPedido(id); // corta la alarma de "nuevo pedido" si seguía sonando

    try {
      const ref = tiendaSubDoc(localidad, "tiendas", tiendaId, "pedidos", id);
      await updateDoc(ref, {
        estado: "en_pausa",
        pausa: {
          motivo,
          productos_afectados: productosAfectados,
          tiempo_espera: { valor, unidad },
          estado_anterior: p.estado,
          creado_en: serverTimestamp(),
          resuelto: false,
        },
        respuesta_cliente: null,
      });
      showToast("⏸️ Pedido puesto en pausa");
      document.getElementById("pausaOverlay")?.classList.remove("show");
    } catch (err) {
      console.error(err);
      showToast("❌ No se pudo pausar el pedido", true);
    }
  };
  document.getElementById("pausaOverlay")?.classList.add("show");
}
document
  .getElementById("pausaClose")
  ?.addEventListener("click", () =>
    document.getElementById("pausaOverlay")?.classList.remove("show"),
  );
document.getElementById("pausaOverlay")?.addEventListener("click", (e) => {
  if (e.target.id === "pausaOverlay")
    document.getElementById("pausaOverlay").classList.remove("show");
});

function labelDateFilter() {
  switch (dateFilter.type) {
    case "hoy":
      return "Hoy";
    case "ayer":
      return "Ayer";
    case "semana":
      return "Esta semana";
    case "semana_pasada":
      return "Semana pasada";
    case "custom": {
      if (!dateFilter.from || !dateFilter.to) return "Rango";
      const f = (d) =>
        d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" });
      return `${f(dateFilter.from)}–${f(dateFilter.to)}`;
    }
    default:
      return "Hoy";
  }
}

/* ══════════════ Utilidades ══════════════ */
function escapeHtml(str) {
  return String(str ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}
function fmtMoney(n) {
  return "S/ " + Number(n || 0).toFixed(2);
}
function toDate(ts) {
  return ts && typeof ts.toDate === "function" ? ts.toDate() : null;
}

function timeAgo(date) {
  if (!date) return "—";
  const diffMs = Date.now() - date.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

function showToast(msg, danger) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.toggle("danger", !!danger);
  el.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("show"), 2600);
}

/* Anima un valor monetario en un elemento de texto, sin saltos bruscos */
function animateMoney(el, end) {
  if (!el) return;
  const start = parseFloat((el.textContent || "").replace(/[^\d.]/g, "")) || 0;
  if (Math.abs(end - start) < 0.005) {
    el.textContent = fmtMoney(end);
    return;
  }
  const duration = 420;
  const t0 = performance.now();
  function step(now) {
    const p = Math.min((now - t0) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmtMoney(start + (end - start) * eased);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ══════════════ Reloj en vivo ══════════════ */
function tickClock() {
  const now = new Date();
  document.getElementById("clockTime").textContent = now.toLocaleTimeString(
    "es-PE",
    { hour: "2-digit", minute: "2-digit" },
  );
  document.getElementById("clockDate").textContent = now.toLocaleDateString(
    "es-PE",
    { weekday: "long", day: "numeric", month: "long" },
  );
}
tickClock();
setInterval(tickClock, 15000);

function tickTimeAgo() {
  document.querySelectorAll("[data-ts]").forEach((el) => {
    const ts = Number(el.dataset.ts);
    if (!ts) return;
    const date = new Date(ts);
    const label = timeAgo(date);
    const target = el.querySelector(".ts-label") || el;
    target.textContent = label;
    const diffMin = Math.floor((Date.now() - ts) / 60000);
    el.classList.toggle("stale", diffMin >= 20);
  });
  if (originFilter === "mesa") pintarTimersReserva();
}
setInterval(tickTimeAgo, 20000);

/* ══════════════ Datos del negocio ══════════════ */
async function cargarNegocio() {
  try {
    const ref = tiendaDoc(localidad, "tiendas", tiendaId);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : null;
    const nombre = data ? data.nombre_tienda || data.nombre : null;
    bizNombreGlobal = nombre || "Geinz";
    bizLogoUrl = data?.img_tienda?.logo_tienda || "";
    document.title = `Pedidos en vivo · ${nombre || "Geinz"}`;
  } catch {}
}

/* ══════════════ Sonido de notificación (Web Audio, sin archivos externos) ══════════════ */
function ensureAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
// desbloquea el audio en la primera interacción real del operador con la página
document.addEventListener("click", () => ensureAudio(), {
  once: true,
  capture: true,
});

function playChime(pedidoId, data) {
  const tipo = getTipoCuponPedido(data);
  let url = SND_NUEVO_PEDIDO;
  if (tipo === "canje_puntos") url = SND_CANJE_PUNTOS;
  else if (tipo === "descuento_fidelizacion") url = SND_NUEVO_PEDIDO_DESCUENTO;
  else if (tipo === "cupon_descuento") url = SND_NUEVO_PEDIDO_CUPON_DESCUENTO;
  encolarAlarma(pedidoId, url);
}
/* Alarma distinta y más urgente para el auto-rechazo por tiempo agotado */
function playAutoRejectAlarm() {
  playSoundOnce(SND_PEDIDO_CANCELADO);
}

/* Alarma cuando el cliente responde un pedido en pausa (reemplazo o continuar) */
function playRespuestaClienteAlarm() {
  playSoundOnce(SND_PEDIDO_CONTESTADO);
}

/* Alarma cuando el cliente cancela su propio pedido estando en pausa */
function playCanceladoPorClienteAlarm() {
  playSoundOnce(SND_PEDIDO_CANCELADO_PAUSA);
}

/* Alarma cuando el cliente cancela su propio pedido ANTES de que estuviera en pausa (pendiente) */
function playClienteCanceloPedidoAlarm() {
  playSoundOnce(SND_CLIENTE_CANCELO_PEDIDO);
}

/* Alarma para reservas vencidas (auto-liberación) — dos tonos suaves alternando, distinta a las otras */
function playAutoResAlarm() {
  if (!soundEnabled) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const notas = [740, 622, 740, 622];
  notas.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const start = now + i * 0.22;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.18, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.22);
  });
}

/* ══════════════ Botón de campana: sonido + permiso de notificaciones ══════════════ */
const bellBtn = document.getElementById("bellBtn");

function paintBell() {
  bellBtn.classList.toggle("on", soundEnabled);
  bellBtn.innerHTML =
    (soundEnabled ? "🔔" : "🔕") +
    `<span class="bell-dot" id="bellDot"></span>`;
}
paintBell();

bellBtn.addEventListener("click", async () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem("geinz_sound_enabled", soundEnabled ? "1" : "0");
  paintBell();
  if (soundEnabled) {
    ensureAudio();
    playSoundOnce(SND_NUEVO_PEDIDO); // beep de confirmación, ya no pasa por la cola de pedidos
    if (window.Notification && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {}
    }
    showToast("🔔 Notificaciones de sonido activadas");
  } else {
    // Corta cualquier alarma sonando y vacía la cola de pedidos pendientes
    colaAlarmas.length = 0;
    if (alarmaActual) {
      alarmaActual.audio.pause();
      alarmaActual.audio.currentTime = 0;
      alarmaActual = null;
    }
    showToast("🔕 Notificaciones de sonido desactivadas");
  }
});
/* ══════════════ Control de auto-rechazo (popover) ══════════════ */
const autorejBtn = document.getElementById("autorejBtn");
const autorejPop = document.getElementById("autorejPop");
const autorejToggle = document.getElementById("autorejToggle");
const autorejMinutesInput = document.getElementById("autorejMinutes");
const autorejVal = document.getElementById("autorejVal");
const autorejSave = document.getElementById("autorejSave");

function paintAutorejBtn() {
  autorejBtn.classList.toggle("on", autoRejectEnabled);
  autorejVal.textContent = autoRejectEnabled ? `${autoRejectMinutes}m` : "Off";
}
autorejToggle.checked = autoRejectEnabled;
autorejMinutesInput.value = autoRejectMinutes;
paintAutorejBtn();

autorejBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  autorejPop.classList.toggle("show");
  autoresPop.classList.remove("show");
});
document.addEventListener("click", (e) => {
  if (!autorejPop.contains(e.target) && e.target !== autorejBtn)
    autorejPop.classList.remove("show");
  if (!autoresPop.contains(e.target) && e.target !== autoresBtn)
    autoresPop.classList.remove("show");
});
autorejPop.addEventListener("click", (e) => e.stopPropagation());

autorejSave.addEventListener("click", () => {
  const mins = Math.max(
    1,
    Math.min(120, Math.round(Number(autorejMinutesInput.value) || 5)),
  );
  autorejMinutesInput.value = mins;
  autoRejectMinutes = mins;
  autoRejectEnabled = autorejToggle.checked;
  localStorage.setItem("geinz_autorej_on", autoRejectEnabled ? "1" : "0");
  localStorage.setItem("geinz_autorej_min", String(mins));
  paintAutorejBtn();
  autorejPop.classList.remove("show");
  showToast(
    autoRejectEnabled
      ? `⏱️ Auto-rechazo activado: ${mins} min sin confirmar`
      : "⏱️ Auto-rechazo desactivado",
  );
});

/* ══════════════ Control de auto-liberación de reservas (popover) ══════════════ */
const autoresBtn = document.getElementById("autoresBtn");
const autoresPop = document.getElementById("autoresPop");
const autoresToggle = document.getElementById("autoresToggle");
const autoresMinutesInput = document.getElementById("autoresMinutes");
const autoresVal = document.getElementById("autoresVal");
const autoresSave = document.getElementById("autoresSave");

function paintAutoresBtn() {
  autoresBtn.classList.toggle("on", autoResEnabled);
  autoresVal.textContent = autoResEnabled ? `${autoResMinutes}m` : "Off";
}
autoresToggle.checked = autoResEnabled;
autoresMinutesInput.value = autoResMinutes;
paintAutoresBtn();

autoresBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  autoresPop.classList.toggle("show");
  autorejPop.classList.remove("show");
});
autoresPop.addEventListener("click", (e) => e.stopPropagation());

autoresSave.addEventListener("click", () => {
  const mins = Math.max(
    1,
    Math.min(240, Math.round(Number(autoresMinutesInput.value) || 20)),
  );
  autoresMinutesInput.value = mins;
  autoResMinutes = mins;
  autoResEnabled = autoresToggle.checked;
  localStorage.setItem("geinz_autores_on", autoResEnabled ? "1" : "0");
  localStorage.setItem("geinz_autores_min", String(mins));
  paintAutoresBtn();
  autoresPop.classList.remove("show");
  showToast(
    autoResEnabled
      ? `🔔 Auto-liberación de reservas activada: ${mins} min sin ocupar`
      : "🔔 Auto-liberación de reservas desactivada",
  );
});

/* ══════════════ Control de filtro de origen (Todos / WhatsApp / Mesas) ══════════════
           Esto SOLO filtra en el cliente sobre lo que ya trajo la query de fecha — no requiere
           una nueva suscripción a Firestore, porque el volumen ya está acotado por fecha. */
const originBar = document.getElementById("originBar");
const mesasStripWrap = document.getElementById("mesasStripWrap");

originBar.querySelectorAll(".origin-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    originFilter = chip.dataset.origin;
    originBar
      .querySelectorAll(".origin-chip")
      .forEach((c) => c.classList.toggle("active", c === chip));
    mesasStripWrap.style.display = originFilter === "mesa" ? "flex" : "none";
    document.getElementById("board").style.display =
      originFilter === "mesa" ? "none" : "flex";
    document.getElementById("statusTabs").style.display =
      originFilter === "mesa" ? "none" : "flex";

    // El auto-rechazo por tiempo es una funcionalidad exclusiva de WhatsApp
    const autorejWrapEl = document.querySelector(".autorej-wrap");
    if (autorejWrapEl)
      autorejWrapEl.style.display = originFilter === "mesa" ? "none" : "block";
    if (originFilter === "mesa") autorejPop.classList.remove("show");
    // El auto-liberación de reservas es exclusiva de Mesas
    if (autoresBtn)
      autoresBtn.style.display =
        originFilter === "mesa" ? "inline-flex" : "none";
    if (originFilter !== "mesa") autoresPop.classList.remove("show");

    if (originFilter === "whatsapp") {
      whatsappUnseen = 0;
      actualizarBadgeWhatsapp();
    }
    renderBoard();
  });
});

/* ══════════════ Franja de mesas (solo visible cuando el filtro de origen = "mesa") ══════════════
           Muestra TODAS las mesas registradas en /mesas, tengan o no pedidos ahora mismo.
           El punto verde indica que esa mesa tiene al menos un pedido pendiente o en proceso
           dentro del periodo de fecha actualmente cargado. */
function getPedidosDeMesa(numeroMesa) {
  const activos = [];
  mesasMap.forEach((m, mesaDocId) => {
    if (Number(m.numero_mesa) !== Number(numeroMesa)) return;

    // Mesa agrupada: el pedido real vive en grupos_mesas, no en la mesa
    if (m.grupoId) {
      const grupo = gruposMap.get(m.grupoId);
      if (!grupo || grupo.estado !== "activo" || !grupo.pedido) return;
      const pseudoPedido = {
        estado: "pendiente",
        timestamp: grupo.pedido.timestamp,
        fecha: grupo.pedido.fecha,
        hora: grupo.pedido.hora,
        cliente: grupo.pedido.cliente || {
          nombre: "",
          tipo_entrega: "En mesa",
        },
        mesa: {
          id: mesaDocId,
          nombre: m.mesaNombre || m.nombre_alias || null,
          numero: m.numero_mesa,
        },
        mesasGrupo: grupo.mesas || [],
        pago: grupo.pedido.pago || {},
        nota: grupo.pedido.nota || "",
        productos: grupo.pedido.productos || [],
        bloques: grupo.pedido.bloques || [],
        total_items: grupo.pedido.total_items || 0,
        total: grupo.pedido.total || 0,
        pedidoDocId: grupo.pedidoGrupoDocId || null,
        grupoId: m.grupoId,
      };
      activos.push([mesaDocId, pseudoPedido]);
      return;
    }

    if (m.estado !== "ocupado" || !m.pedido) return;
    const pseudoPedido = {
      estado: "pendiente",
      timestamp: m.pedido.timestamp,
      fecha: m.pedido.fecha,
      hora: m.pedido.hora,
      cliente: {
        nombre: m.pedido.cliente_nombre || "",
        tipo_entrega: "En mesa",
      },
      mesa: {
        id: mesaDocId,
        nombre: m.mesaNombre || m.nombre_alias || null,
        numero: m.numero_mesa,
      },
      pago: {},
      nota: m.pedido.nota || "",
      productos: m.pedido.productos || [],
      total_items: m.pedido.total_items || 0,
      total: m.pedido.total || 0,
      pedidoDocId: m.pedidoMesaDocId || null,
    };
    activos.push([mesaDocId, pseudoPedido]);
  });
  return activos;
}

function getMesaEstadoVisual(m, activos) {
  if (activos.length > 0 || m.estado === "ocupado") return "ocupada";
  if (m.estado === "reservada") return "reservada";
  return "libre";
}
function getColumnasActuales() {
  const grid = document.getElementById("mesaGrid");
  if (!grid) return 1;
  const styles = getComputedStyle(grid);
  const cols = styles.gridTemplateColumns.split(" ").filter(Boolean).length;
  return Math.max(cols, 1);
}

/* Actualiza en vivo (sin re-pintar todo el grid) los contadores de "tiempo restante"
           de las reservas, para que el reloj de cada mesa/grupo se vea fluido. */
function pintarTimersReserva() {
  if (!autoResEnabled) return;
  document.querySelectorAll("[data-reserva-ts]").forEach((el) => {
    const ts = Number(el.dataset.reservaTs);
    if (!ts) return;
    const limiteMs = autoResMinutes * 60000;
    const restanteMin = Math.max(
      0,
      Math.ceil((limiteMs - (Date.now() - ts)) / 60000),
    );
    el.textContent =
      restanteMin > 0 ? `⏳ vence en ${restanteMin} min` : "⏳ por vencer…";
    el.classList.toggle("urgent", restanteMin <= 3);
  });
}

function renderMesaGrid() {
  const grid = document.getElementById("mesaGrid");
  if (!grid) return;

  // Limpia selección de mesas que dejaron de estar disponibles (ocupadas por otro flujo, borradas, etc.)
  [...mesasSeleccionadas].forEach((mesaDocId) => {
    const m = mesasMap.get(mesaDocId);
    if (!m || m.estado === "ocupado") mesasSeleccionadas.delete(mesaDocId);
  });
  pintarBarraSeleccion();

  const todas = [...mesasMap.values()].sort(
    (a, b) => (a.numero_mesa || 0) - (b.numero_mesa || 0),
  );

  const conEstado = todas.map((m) => {
    const activos = getPedidosDeMesa(m.numero_mesa);
    const estadoVisual = getMesaEstadoVisual(m, activos);
    return { m, activos, estadoVisual };
  });

  const totalOcupadas = conEstado.filter(
    (x) => x.estadoVisual === "ocupada",
  ).length;
  const totalReservadas = conEstado.filter(
    (x) => x.estadoVisual === "reservada",
  ).length;
  const totalLibres = conEstado.length - totalOcupadas - totalReservadas;
  pintarResumenMesas(totalOcupadas, totalLibres, totalReservadas);

  const visibles = conEstado.filter((x) => {
    if (mesaEstadoFilter) return x.estadoVisual === mesaEstadoFilter;
    return true;
  });

  if (!visibles.length) {
    const nombresFiltro = {
      ocupada: "ocupadas",
      libre: "libres",
      reservada: "reservadas",
    };
    const msg = mesaEstadoFilter
      ? `No hay mesas ${nombresFiltro[mesaEstadoFilter]} en este momento.`
      : "Todavía no hay mesas registradas para este local.";
    grid.innerHTML = `<div style="font-size:12px;color:var(--ink-faint);font-weight:600;padding:8px 2px;">${msg}</div>`;
    return;
  }

  // ── Une en un solo bloque visual las mesas que comparten el mismo grupoId (pedido único
  //    o reserva conjunta). Esto aplica sin importar el estado visual (ocupada, reservada
  //    o incluso libre si por algún motivo quedó un grupo "huérfano" sin desagrupar). ──
  const yaRenderizadas = new Set();
  const bloques = [];

  visibles.forEach(({ m, activos, estadoVisual }) => {
    if (yaRenderizadas.has(m.numero_mesa)) return;

    if (m.grupoId) {
      const delMismoGrupo = visibles.filter((x) => x.m.grupoId === m.grupoId);
      delMismoGrupo.forEach((x) => yaRenderizadas.add(x.m.numero_mesa));
      bloques.push({
        tipo: "grupo",
        integrantes: delMismoGrupo,
        grupoId: m.grupoId,
      });
    } else {
      yaRenderizadas.add(m.numero_mesa);
      const mesaDocId = [...mesasMap.entries()].find(([, mm]) => mm === m)?.[0];
      bloques.push({ tipo: "single", m, mesaDocId, activos, estadoVisual });
    }
  });

  grid.innerHTML = bloques
    .map((bloque) => {
      if (bloque.tipo === "single") {
        const { m, mesaDocId, activos, estadoVisual } = bloque;
        const total = activos.reduce((s, [, p]) => s + Number(p.total || 0), 0);
        const label = {
          ocupada: "Ocupada",
          libre: "Libre",
          reservada: "Reservada",
        }[estadoVisual];
        const puedeReservar = estadoVisual !== "ocupada";
        const esSeleccionable = estadoVisual !== "ocupada";
        const estaSeleccionada = mesasSeleccionadas.has(mesaDocId);
        const horaReservaHtml =
          estadoVisual === "reservada" && m.hora_reservada
            ? `<div class="mesa-reserva-hora">🕐 Llega ${toDate(m.hora_reservada)?.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) || "—"}</div>`
            : "";
        const reservaTimerHtml =
          estadoVisual === "reservada" && autoResEnabled && m.reservado_en
            ? `<div class="mesa-reserva-timer" data-reserva-ts="${toDate(m.reservado_en)?.getTime() || ""}">⏳ calculando…</div>`
            : "";
        return `
    <div class="mesa-box ${estadoVisual}${esSeleccionable ? " selectable" : ""}${estaSeleccionada ? " selected" : ""}" data-mesa="${m.numero_mesa}" data-mesa-doc="${mesaDocId}" data-selectable="${esSeleccionable}">
        <span class="mb-check">✓</span>
        <span class="mb-status"><span class="dot"></span>${label}</span>
        <div class="mb-name">${escapeHtml(m.nombre_alias || "Mesa " + m.numero_mesa)}</div>
        <div class="mb-total">${estadoVisual === "ocupada" ? fmtMoney(total) : "—"}</div>
     ${estadoVisual === "ocupada" ? `<div class="mb-count">${activos.length ? `${activos.length} pedido${activos.length === 1 ? "" : "s"}` : "Sin pedido registrado"}</div>` : ""}
   ${horaReservaHtml}
        ${reservaTimerHtml}
        ${puedeReservar ? `<button class="mesa-reservar-btn" data-mesa-reservar="${m.numero_mesa}">${estadoVisual === "reservada" ? "Quitar reserva" : "Reservar"}</button>` : ""}
    </div>`;
      }

      // Tarjeta única para todo el grupo: un solo total, un solo estado, abarca varias columnas
      const integrantes = bloque.integrantes;
      const primero = integrantes[0];
      const color = colorParaEstadoGrupo(primero.estadoVisual);
      const nombres = integrantes
        .map((x) => x.m.nombre_alias || `Mesa ${x.m.numero_mesa}`)
        .join(" + ");
      const totalGrupo = primero.activos.reduce(
        (s, [, p]) => s + Number(p.total || 0),
        0,
      );
      const totalPedidos = primero.activos.length;
      const anchoSpan = Math.min(integrantes.length, getColumnasActuales());
      const labelEstadoGrupo =
        { reservada: "Reservada", ocupada: "Ocupada", libre: "Sin agrupar" }[
          primero.estadoVisual
        ] || "Ocupada";
      const grupoDocId = integrantes.map(
        (x) => [...mesasMap.entries()].find(([, mm]) => mm === x.m)?.[0],
      );
      const grupoInfo = gruposMap.get(bloque.grupoId);
      const esSeleccionableGrupo = primero.estadoVisual !== "ocupada";
      const grupoSeleccionado =
        grupoDocId.length &&
        grupoDocId.every((id) => id && mesasSeleccionadas.has(id));
      const horaReservaHtml =
        primero.estadoVisual === "reservada" && grupoInfo?.hora_reservada
          ? `<div class="mesa-reserva-hora">🕐 Llega ${toDate(grupoInfo.hora_reservada)?.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) || "—"}</div>`
          : "";
      const reservaTimerHtml =
        primero.estadoVisual === "reservada" &&
        autoResEnabled &&
        grupoInfo?.reservado_en
          ? `<div class="mesa-reserva-timer" data-reserva-ts="${toDate(grupoInfo.reservado_en)?.getTime() || ""}">⏳ calculando…</div>`
          : "";

      return `
    <div class="mesa-box grupo ${primero.estadoVisual}${esSeleccionableGrupo ? " selectable" : ""}${grupoSeleccionado ? " selected" : ""}" data-mesa="${primero.m.numero_mesa}" data-grupo-id="${bloque.grupoId}" data-selectable="${esSeleccionableGrupo}" style="--grupo-color:${color}; grid-column: span ${anchoSpan};">
        <span class="mb-check">✓</span>
        <span class="mb-status"><span class="dot"></span>${labelEstadoGrupo} · Grupo</span>
        <div class="mb-name">${escapeHtml(nombres)}</div>
        <div class="mb-total">${primero.estadoVisual === "ocupada" ? fmtMoney(totalGrupo) : "—"}</div>
        ${primero.estadoVisual === "ocupada" ? `<div class="mb-count">${totalPedidos} pedido${totalPedidos === 1 ? "" : "s"} · cuenta única</div>` : ""}
    ${horaReservaHtml}
        ${reservaTimerHtml}
        ${primero.estadoVisual === "reservada" ? `<button class="mesa-reservar-btn" data-grupo-reservar="${bloque.grupoId}">Quitar reserva</button>` : ""}
        <button class="mesa-desagrupar-btn" data-grupo-desagrupar="${bloque.grupoId}">⇱ Desagrupar</button>
    </div>`;
    })
    .join("");

  grid.querySelectorAll(".mesa-box").forEach((box) => {
    box.addEventListener("click", (e) => {
      if (
        e.target.closest(
          "[data-mesa-reservar],[data-grupo-reservar],[data-grupo-desagrupar]",
        )
      )
        return; // los botones internos manejan su propio click
      const esSeleccionable = box.dataset.selectable === "true";
      const mesaDocId = box.dataset.mesaDoc;
      const grupoId = box.dataset.grupoId;
      if (grupoId) {
        if (esSeleccionable) {
          toggleSeleccionGrupo(grupoId);
        } else {
          openMesaDetail(Number(box.dataset.mesa));
        }
        return;
      }
      if (esSeleccionable && mesaDocId) {
        toggleSeleccionMesa(mesaDocId);
      } else {
        openMesaDetail(Number(box.dataset.mesa));
      }
    });
  });
  grid.querySelectorAll("[data-mesa-reservar]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleReservaMesa(Number(btn.dataset.mesaReservar));
    });
  });
  grid.querySelectorAll("[data-grupo-reservar]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      quitarReservaGrupo(btn.dataset.grupoReservar);
    });
  });
  grid.querySelectorAll("[data-grupo-desagrupar]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      desagruparGrupo(btn.dataset.grupoDesagrupar);
    });
  });

  pintarTimersReserva();
}
function pintarResumenMesas(ocupadas, libres, reservadas) {
  const ctrl = document.getElementById("mesaEstadoCtrl");
  if (!ctrl) return;
  const total = ocupadas + libres + reservadas;
  ctrl.innerHTML = `
    <div class="mesa-chip ${mesaEstadoFilter === null ? "active" : ""}" data-estado="todas">
        <span class="mc-dot" style="background:var(--ink-dim);"></span>
        <span class="mc-lbl">Todas</span><span class="mc-count">${total}</span>
    </div>
    <div class="mesa-chip ${mesaEstadoFilter === "ocupada" ? "active" : ""}" data-estado="ocupada">
        <span class="mc-dot" style="background:var(--amber);"></span>
        <span class="mc-lbl">Ocupadas</span><span class="mc-count">${ocupadas}</span>
    </div>
    <div class="mesa-chip ${mesaEstadoFilter === "reservada" ? "active" : ""}" data-estado="reservada">
        <span class="mc-dot" style="background:#7c5cff;"></span>
        <span class="mc-lbl">Reservadas</span><span class="mc-count">${reservadas}</span>
    </div>
    <div class="mesa-chip ${mesaEstadoFilter === "libre" ? "active" : ""}" data-estado="libre">
        <span class="mc-dot" style="background:var(--green);"></span>
        <span class="mc-lbl">Libres</span><span class="mc-count">${libres}</span>
    </div>`;
  ctrl.querySelectorAll(".mesa-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const val = chip.dataset.estado;
      mesaEstadoFilter = val === "todas" ? null : val;
      renderMesaGrid();
    });
  });
}

/* ══════════════ Notificación del navegador (con imagen del producto) ══════════════ */
function notificarPedidoNuevo(p) {
  const cliente = p.cliente || {};
  const productos = Array.isArray(p.productos) ? p.productos : [];
  const totalItems =
    p.total_items ?? productos.reduce((s, i) => s + (i.cantidad || 0), 0);
  const imagenProducto = productos.find((it) => it.imagen)?.imagen || "";

  if (!window.Notification || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return; // ya lo están viendo en pantalla, no saturamos

  try {
    const n = new Notification(
      `🛎️ Nuevo pedido · ${cliente.nombre || "Cliente"}`,
      {
        body: `${totalItems} item${totalItems === 1 ? "" : "s"} · ${fmtMoney(p.total)} · ${cliente.tipo_entrega || ""}`,
        icon: bizLogoUrl || undefined,
        image: imagenProducto || undefined,
        badge: bizLogoUrl || undefined,
        tag: "geinz-pedido-" + Date.now(),
        requireInteraction: false,
      },
    );
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (e) {
    console.warn("No se pudo mostrar la notificación:", e);
  }
}

/* Sonido distintivo para pedidos que llegan desde una MESA (distinto al de WhatsApp) */
function playMesaChime() {
  if (!soundEnabled) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const notas = [660, 880]; // dos notas tipo "campanita de mesa"
  notas.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    const start = now + i * 0.16;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.16, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.52);
  });
}

/* Notificación del navegador para pedidos de mesa (distinta a la de WhatsApp) */
function notificarPedidoMesa(nombreMesa, pedido) {
  if (!window.Notification || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    const totalItems = pedido?.total_items ?? 0;
    const n = new Notification(`🍽️ Pedido en ${nombreMesa}`, {
      body: `${totalItems} item${totalItems === 1 ? "" : "s"} · ${fmtMoney(pedido?.total)}`,
      icon: bizLogoUrl || undefined,
      badge: bizLogoUrl || undefined,
      tag: "geinz-mesa-" + Date.now(),
      requireInteraction: false,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (e) {
    console.warn("No se pudo mostrar la notificación de mesa:", e);
  }
}

function notificarRespuestaCliente(p) {
  if (!window.Notification || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    const cliente = p.cliente || {};
    const n = new Notification(
      `💬 Respuesta de ${cliente.nombre || "Cliente"}`,
      {
        body: "Respondió el pedido en pausa, revisa y confirma.",
        icon: bizLogoUrl || undefined,
        badge: bizLogoUrl || undefined,
        tag: "geinz-respuesta-pausa-" + Date.now(),
        requireInteraction: false,
      },
    );
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (e) {
    console.warn("No se pudo mostrar la notificación:", e);
  }
}

function notificarPedidoCanceladoPorCliente(p) {
  if (!window.Notification || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    const cliente = p.cliente || {};
    const n = new Notification(`🚫 Pedido cancelado`, {
      body: `${cliente.nombre || "Cliente"} canceló su pedido desde el seguimiento.`,
      icon: bizLogoUrl || undefined,
      badge: bizLogoUrl || undefined,
      tag: "geinz-cancelado-cliente-" + Date.now(),
      requireInteraction: false,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (e) {
    console.warn("No se pudo mostrar la notificación:", e);
  }
}

function notificarAutoRechazo(p) {
  if (!window.Notification || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    const cliente = p.cliente || {};
    const n = new Notification(`⏱️ Pedido rechazado automáticamente`, {
      body: `${cliente.nombre || "Cliente"} · superó ${autoRejectMinutes} min sin confirmarse`,
      icon: bizLogoUrl || undefined,
      badge: bizLogoUrl || undefined,
      tag: "geinz-autorechazo-" + Date.now(),
      requireInteraction: false,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (e) {
    console.warn("No se pudo mostrar la notificación:", e);
  }
}

function notificarAutoLiberacionReserva(nombres) {
  if (!window.Notification || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    const n = new Notification(`🔔 Reserva vencida`, {
      body: `${nombres} · superó ${autoResMinutes} min sin ocuparse, la reserva se quitó`,
      icon: bizLogoUrl || undefined,
      badge: bizLogoUrl || undefined,
      tag: "geinz-autores-" + Date.now(),
      requireInteraction: false,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (e) {
    console.warn("No se pudo mostrar la notificación:", e);
  }
}

function actualizarBadgeWhatsapp() {
  const badge = document.getElementById("waBadge");
  if (!badge) return;
  badge.textContent = whatsappUnseen > 9 ? "9+" : String(whatsappUnseen);
  badge.classList.toggle("show", whatsappUnseen > 0);
}
function bellRingFeedback() {
  bellBtn.classList.remove("ring");
  void bellBtn.offsetWidth;
  bellBtn.classList.add("ring");
  const dot = document.getElementById("bellDot");
  if (dot) {
    dot.classList.add("show");
    setTimeout(() => dot.classList.remove("show"), 2500);
  }
}

/* ══════════════ Tarjeta colapsada (vista de columna) ══════════════ */
const ICONOS_ENTREGA = {
  Delivery: "🛵",
  "Recojo en local": "🏬",
  "En mesa": "🍽️",
};
const ICONOS_PAGO = { "Yape / Plin": "📱", Efectivo: "💵" };

function detalleCuponHtml(p) {
  const tipo = getTipoCuponPedido(p);
  if (!tipo) return "";
  const c = p.cupon || {};
  const productos = Array.isArray(p.productos) ? p.productos : [];
const prodCanjeado =
  productos.find((it) => it.esCanje) ||
  (c.productoId ? productos.find((it) => it.id === c.productoId) : null);  const descuento = Number(p.descuentoCupon) || 0;
  const total = Number(p.total) || 0;
  const subtotal = Number(p.subtotal) || total + descuento;
  const porcentajeEfectivo = subtotal > 0 ? (descuento / subtotal) * 100 : 0;

  const map = {
    canje_puntos: {
      titulo: "🎁 Canje de puntos",
      bg: "rgba(251,191,36,.08)",
      bd: "rgba(251,191,36,.3)",
      col: "#fbbf24",
    },
    descuento_fidelizacion: {
      titulo: "⭐ Descuento por fidelización",
      bg: "rgba(124,92,255,.08)",
      bd: "rgba(124,92,255,.3)",
      col: "#a78bfa",
    },
    cupon_descuento: {
      titulo: "🎟️ Cupón de descuento",
      bg: "rgba(34,197,94,.08)",
      bd: "rgba(34,197,94,.3)",
      col: "#4ade80",
    },
  };
  const cfg = map[tipo];

  const filas = [];

  if (c.codigo) {
    filas.push(`
      <div class="dm-cupon-row">
        <span>Código de cupón</span>
        <span class="mono" style="letter-spacing:.05em;">${escapeHtml(c.codigo)}</span>
      </div>`);
  }

  filas.push(`
    <div class="dm-cupon-row">
      <span>Origen</span>
      <span>${c.origen === "fidelizacion" ? "Programa de fidelización" : "Cupón del negocio"}</span>
    </div>`);

if (tipo === "canje_puntos" && prodCanjeado) {
  const varianteTxt = prodCanjeado.opciones
    ? Object.entries(prodCanjeado.opciones).map(([k, v]) => `${k}: ${v}`).join(" · ")
    : "";

  filas.push(`
    <div class="dm-cupon-row">
      <span>Producto canjeado</span>
      <span>${escapeHtml(prodCanjeado.nombre)}</span>
    </div>`);

  if (varianteTxt) {
    filas.push(`
      <div class="dm-cupon-row">
        <span>Variante entregada</span>
        <span style="font-weight:700;">${escapeHtml(varianteTxt)}</span>
      </div>`);
  }

  if (c.tipoBeneficio === "cantidad" && c.descuento) {
    const compra = c.descuento.compraUnidades || "?";
    const paga = c.descuento.pagaUnidades || "?";
    const precioUnit = Number(c.precioOriginal) || 0;
    filas.push(`
      <div class="dm-cupon-row">
        <span>Promoción canjeada</span>
        <span style="font-weight:800;color:#fbbf24;">Lleva ${compra} · paga ${paga}</span>
      </div>`);
    filas.push(`
      <div class="dm-cupon-row">
        <span>Precio normal (${compra} unidades)</span>
        <span style="text-decoration:line-through;color:var(--ink-faint);">${fmtMoney(precioUnit * compra)}</span>
      </div>`);
    filas.push(`
      <div class="dm-cupon-row" style="border-top:1px dashed rgba(74,222,128,.25);padding-top:6px;margin-top:2px;">
        <span style="font-weight:800;">Total que paga el cliente</span>
        <span style="font-weight:800;">${fmtMoney(precioUnit * paga)}</span>
      </div>`);
  } else {
    filas.push(`
      <div class="dm-cupon-row">
        <span>Precio normal del producto</span>
        <span style="text-decoration:line-through;color:var(--ink-faint);">${fmtMoney(prodCanjeado.precio_unitario || prodCanjeado.precio || 0)}</span>
      </div>`);
  }

  filas.push(`
    <div class="dm-cupon-row" style="border-top:1px dashed rgba(251,191,36,.25);padding-top:6px;margin-top:2px;">
      <span style="font-weight:800;">Puntos que se descuentan al cliente</span>
      <span style="color:#fbbf24;font-weight:800;">-${Number(c.costoPuntos) || 0} pts</span>
    </div>`);
}else {
    // ── Descuento % o monto fijo sobre el subtotal ──
    if (c.tipo === "producto" && c.productoId) {
      filas.push(`
        <div class="dm-cupon-row">
          <span>Tipo de descuento</span>
          <span>Producto de regalo</span>
        </div>`);
    } else if (c.tipoDescuentoManual) {
      filas.push(`
        <div class="dm-cupon-row">
          <span>Tipo de descuento</span>
          <span>${c.tipoDescuentoManual === "porcentaje" ? `${c.porcentajeManual || 0}% sobre el subtotal` : `Monto fijo de ${fmtMoney(c.montoManual || 0)}`}</span>
        </div>`);
    }

    filas.push(`
      <div class="dm-cupon-row">
        <span>Subtotal sin descuento</span>
        <span>${fmtMoney(subtotal)}</span>
      </div>`);
    filas.push(`
      <div class="dm-cupon-row" style="border-top:1px dashed rgba(74,222,128,.25);padding-top:6px;margin-top:2px;">
        <span style="font-weight:800;">Descuento aplicado</span>
        <span style="color:#4ade80;font-weight:800;">-${fmtMoney(descuento)} (${porcentajeEfectivo.toFixed(1)}%)</span>
      </div>`);
    filas.push(`
      <div class="dm-cupon-row">
        <span style="font-weight:800;">Total a cobrar al cliente</span>
        <span style="font-weight:800;">${fmtMoney(total)}</span>
      </div>`);

    if (tipo === "descuento_fidelizacion" && c.costoPuntos) {
      filas.push(`
        <div class="dm-cupon-row" style="border-top:1px dashed rgba(167,139,250,.25);padding-top:6px;margin-top:2px;">
          <span>Puntos usados por el cliente</span>
          <span style="color:#fbbf24;font-weight:800;">-${c.costoPuntos} pts</span>
        </div>`);
    }
  }

  return `
    <div class="dm-cupon-card" style="background:${cfg.bg};border:1px solid ${cfg.bd};">
      <p style="color:${cfg.col};font-weight:800;font-size:12.5px;margin-bottom:8px;">${cfg.titulo}</p>
      ${filas.join("")}
      <p style="font-size:10.5px;color:var(--ink-faint);margin-top:8px;">
        ⚠️ Verifica este descuento antes de aceptar el pedido, ya se aplicó automáticamente en el total.
      </p>
    </div>`;
}
function cuponTagHtml(p) {
  const tipo = getTipoCuponPedido(p);
  if (!tipo) return "";
  const map = {
    canje_puntos: {
      ico: "🎁",
      label: "Canje de puntos",
      bg: "rgba(251,191,36,.15)",
      col: "#fbbf24",
    },
    descuento_fidelizacion: {
      ico: "⭐",
      label: "Descuento fidelización",
      bg: "rgba(124,92,255,.15)",
      col: "#a78bfa",
    },
    cupon_descuento: {
      ico: "🎟️",
      label: "Cupón de descuento",
      bg: "rgba(34,197,94,.15)",
      col: "#4ade80",
    },
  };
  const cfg = map[tipo];
  return `<span class="oc-cupon-tag" style="background:${cfg.bg};color:${cfg.col};">${cfg.ico} ${cfg.label}</span>`;
}
function origenTagHtml(p) {
  const origen = getOrigen(p);
  if (origen.tipo === "mesa") {
    const alias =
      origen.nombre ||
      mesasMap.get(origen.mesaId)?.nombre_alias ||
      `Mesa ${origen.numero}`;
    return `<span class="oc-origin-tag mesa">🍽️ ${escapeHtml(alias)}</span>`;
  }
  return `<span class="oc-origin-tag">💬 WhatsApp</span>`;
}

/* ══════════════ Cálculo de puntos por pedido (respaldo) ══════════════
   Si el pedido no trae "puntos_ganados" guardado (ej. el bot de WhatsApp no lo
   calculó), se calcula aquí revisando la config real de cada producto en el
   catálogo (producto.puntos.activo / puntos.cantidad). Se cachea para no
   volver a consultar Firestore innecesariamente. */
const productoPuntosCache = new Map(); // "categoria::id" -> {activo, cantidad} | null
const puntosPedidoCache = new Map(); // pedidoId -> number ya calculado
const puntosPedidoCalculando = new Set(); // evita fetches duplicados

async function obtenerPuntosProducto(categoria, id) {
  const key = `${categoria}::${id}`;
  if (productoPuntosCache.has(key)) return productoPuntosCache.get(key);
  try {
    const ref = tiendaSubDoc(
      localidad,
      "tiendas",
      tiendaId,
      "productos",
      categoria,
      categoria,
      id,
    );
    const snap = await getDoc(ref);
    const puntos = snap.exists() ? snap.data().puntos || null : null;
    productoPuntosCache.set(key, puntos);
    return puntos;
  } catch {
    productoPuntosCache.set(key, null);
    return null;
  }
}

async function calcularPuntosPedidoAsync(pedidoId, p) {
  if (puntosPedidoCalculando.has(pedidoId)) return;
  puntosPedidoCalculando.add(pedidoId);
  try {
    const productos = Array.isArray(p.productos) ? p.productos : [];
    let total = 0;
    for (const it of productos) {
      if (!it.id || !it.categoria) continue;
      const conf = await obtenerPuntosProducto(it.categoria, it.id);
      if (conf?.activo && Number(conf.cantidad) > 0) {
        total += Number(conf.cantidad) * (Number(it.cantidad) || 0);
      }
    }
    puntosPedidoCache.set(pedidoId, total);
    if (total > 0) renderBoard(); // repinta ya con los puntos listos
  } finally {
    puntosPedidoCalculando.delete(pedidoId);
  }
}

/* Puntos que da UN ítem específico del carrito, leyendo la caché ya poblada
   por calcularPuntosPedidoAsync(). Si el producto aún no se consultó,
   devuelve 0 (se repintará solo cuando la caché tenga el dato real). */
function getPuntosItemDesdeCache(it) {
  if (!it.id || !it.categoria) return 0;
  const conf = productoPuntosCache.get(`${it.categoria}::${it.id}`);
  if (conf?.activo && Number(conf.cantidad) > 0) {
    return Number(conf.cantidad) * (Number(it.cantidad) || 0);
  }
  return 0;
}
/* Devuelve los puntos a mostrar: usa el valor guardado en el pedido si existe;
   si no, dispara el cálculo (una sola vez) y mientras tanto devuelve lo que
   ya esté en caché (0 la primera vez, luego el valor real). */
function getPuntosPedido(pedidoId, p) {
  const guardados = Number(p.puntos_ganados) || 0;
  if (guardados > 0) return guardados;
  if (puntosPedidoCache.has(pedidoId)) return puntosPedidoCache.get(pedidoId);
  calcularPuntosPedidoAsync(pedidoId, p);
  return 0;
}
/* ══════════════ Buscador local de pedidos por código ══════════════
   100% cliente: busca solo dentro de pedidosMap (lo que ya está cargado
   por el rango de fecha activo), resalta la tarjeta ya existente en el DOM
   y hace scroll hacia ella. NUNCA llama a renderBoard() ni toca Firestore,
   así que no "recompone" nada — es puramente visual. */

function codigoCortoPedido(id) {
  return id.slice(0, 6).toUpperCase();
}

function limpiarResaltadoBusqueda() {
  document
    .querySelectorAll(".order-card.oc-search-match")
    .forEach((el) => el.classList.remove("oc-search-match"));
}

function mostrarResultadoBusqueda(msg, tipo) {
  const el = document.getElementById("pedidoSearchResult");
  if (!el) return;
  el.textContent = msg;
  el.className = `ps-result ${tipo}`;
  el.style.display = msg ? "block" : "none";
}

// Resalta (y opcionalmente hace scroll hacia) el pedido encontrado.
function resaltarPedidoEncontrado(id, { scroll = true } = {}) {
  limpiarResaltadoBusqueda();
  const card = document.getElementById(`order-${id}`);
  if (!card) return false;

  card.classList.add("oc-search-match");

  const p = pedidosMap.get(id);
  const estado = ESTADOS.includes(p?.estado) ? p.estado : "pendiente";

  // En vista mobile (una sola columna visible a la vez), cambia a la
  // pestaña del estado donde está el pedido para que quede visible.
  const tab = document.querySelector(`.stab[data-s="${estado}"]`);
  if (tab && activeTab !== estado) {
    activeTab = estado;
    document
      .querySelectorAll(".stab")
      .forEach((t) => t.classList.toggle("active", t === tab));
    document
      .querySelectorAll(".board-col")
      .forEach((c) =>
        c.classList.toggle("col-active", c.dataset.status === activeTab),
      );
  }

  if (scroll) card.scrollIntoView({ behavior: "smooth", block: "center" });

  mostrarResultadoBusqueda(`📍 Encontrado en “${labelEstado(estado)}”`, "ok");
  return true;
}

function ejecutarBusquedaPedido(valorCrudo) {
  const valor = valorCrudo.trim().replace(/^#/, "").toUpperCase();
  const clearBtn = document.getElementById("pedidoSearchClear");
  if (clearBtn) clearBtn.style.display = valor ? "flex" : "none";

  if (!valor) {
    pedidoSearchActivoId = null;
    limpiarResaltadoBusqueda();
    mostrarResultadoBusqueda("", "");
    return;
  }

  // Coincidencia por prefijo del código corto (#XXXXXX)
  let encontrado = null;
  for (const [id] of pedidosMap) {
    if (codigoCortoPedido(id).startsWith(valor)) {
      encontrado = id;
      break;
    }
  }

  if (!encontrado) {
    pedidoSearchActivoId = null;
    limpiarResaltadoBusqueda();
    mostrarResultadoBusqueda("Sin coincidencias en el periodo visible", "warn");
    return;
  }

  pedidoSearchActivoId = encontrado;
  resaltarPedidoEncontrado(encontrado);
}

let pedidoSearchDebounce;
document.getElementById("pedidoSearchInput")?.addEventListener("input", (e) => {
  clearTimeout(pedidoSearchDebounce);
  const valor = e.target.value;
  pedidoSearchDebounce = setTimeout(() => ejecutarBusquedaPedido(valor), 180);
});
document.getElementById("pedidoSearchClear")?.addEventListener("click", () => {
  const input = document.getElementById("pedidoSearchInput");
  if (input) input.value = "";
  ejecutarBusquedaPedido("");
  input?.focus();
});
function buildCard(id, p) {
  const estado = ESTADOS.includes(p.estado) ? p.estado : "pendiente";
  const fecha = toDate(p.timestamp);
  const tsMs = fecha ? fecha.getTime() : null;
  const cliente = p.cliente || {};
  const productos = Array.isArray(p.productos) ? p.productos : [];
  const totalItems =
    p.total_items ?? productos.reduce((s, i) => s + (i.cantidad || 0), 0);
  const entregaIco = ICONOS_ENTREGA[cliente.tipo_entrega] || "📦";
  const esUrgente =
    estado === "pendiente" &&
    autoRejectEnabled &&
    tsMs &&
    (Date.now() - tsMs) / 60000 >= autoRejectMinutes * 0.7;

  const card = document.createElement("div");
  card.className = "order-card";
  card.id = `order-${id}`;

  const hitArea = document.createElement("div");
  hitArea.className = "oc-hit";
  const esSeguidor = clientesSeguidoresCache.get(cliente.id_cliente) === true;
  hitArea.innerHTML = `
    <div class="oc-top">
      <span class="oc-id mono">#${id.slice(0, 6).toUpperCase()}</span>
      <span class="oc-time${esUrgente ? " urgent" : ""}" ${tsMs ? `data-ts="${tsMs}"` : ""}><span class="pulse"></span><span class="ts-label">${fecha ? timeAgo(fecha) : "—"}</span></span>
    </div>
    <div class="oc-name">${escapeHtml(cliente.nombre || "Cliente sin nombre")}${esSeguidor ? ` <span style="font-size:10px;font-weight:800;color:#7c5cff;background:rgba(124,92,255,.15);padding:2px 7px;border-radius:999px;">⭐ Seguidor</span>` : ""}</div>
    <div class="oc-entrega-line">${entregaIco} ${escapeHtml(cliente.tipo_entrega || "Sin especificar")}</div>
       ${getPuntosPedido(id, p) > 0 ? `<div class="oc-puntos-line" style="font-size:11px;font-weight:700;color:#fbbf24;margin-top:2px;">🎁 +${getPuntosPedido(id, p)} pts al cliente</div>` : ""}
       ${Number(p.descuentoCupon) > 0 ? `<div class="oc-descuento-line" style="font-size:11px;font-weight:700;color:#4ade80;margin-top:2px;">🏷️ Descuento aplicado: -${fmtMoney(p.descuentoCupon)}</div>` : ""}
    <div class="oc-summary">
   <span class="oc-summary-left">${origenTagHtml(p)}${cuponTagHtml(p)}</span>
      <div class="oc-summary-right">
        <span class="oc-summary-total">${fmtMoney(p.total)}</span>
        <span class="oc-chevron">›</span>
      </div>
    </div>
  `;
  hitArea.addEventListener("click", () => openDetail(id));
  card.appendChild(hitArea);

  const actionsWrap = document.createElement("div");
  renderCardActions(actionsWrap, id, estado, p);
  card.appendChild(actionsWrap);

  return card;
}

function renderCardActions(container, id, estado, p) {
  container.innerHTML = "";

  if (estado === "pendiente") {
    const puntosCalc = getPuntosPedido(id, p);
    const puntosNota =
      puntosCalc > 0
        ? `<div class="oc-puntos-aceptar">🎁 Al aceptar, el cliente ganará <strong>+${puntosCalc} puntos</strong></div>`
        : "";
    container.innerHTML = `
      ${puntosNota}
      <div class="oc-actions">
        <button class="oc-btn ghost danger" data-action="rechazado">✕ Rechazar</button>
        <button class="oc-btn ghost" data-action="_pausar">⏸️ Pausar</button>
        <button class="oc-btn primary v-violet" data-action="en_proceso">Aceptar →</button>
      </div>`;
  } else if (estado === "en_proceso") {
    container.innerHTML = `
      <div class="oc-actions">
        <button class="oc-btn ghost" data-action="pendiente">← Pendiente</button>
        <button class="oc-btn ghost" data-action="_pausar">⏸️ Pausar</button>
        <button class="oc-btn primary v-green" data-action="entregado">Entregado ✓</button>
      </div>`;
  } else if (estado === "en_pausa") {
    const r = p.respuesta_cliente;
    container.innerHTML = `
      <div class="oc-final-tag" style="width:100%;background:rgba(56,189,248,.12);color:#38bdf8;">⏸️ Pedido en pausa</div>
      ${
        r
          ? `<div style="width:100%;font-size:12.5px;color:#38bdf8;padding:6px 2px;">Cliente eligió: <strong>${escapeHtml(
              r.accion === "reemplazo"
                ? "cambiar por " + (r.producto_elegido?.nombre || "")
                : r.accion === "cancelado"
                  ? "cancelar el pedido"
                  : "continuar sin ese producto",
            )}</strong></div>`
          : `<div style="width:100%;font-size:12px;color:var(--ink-faint);padding:6px 2px;">Esperando respuesta del cliente…</div>`
      }
      <button class="oc-btn ghost danger" style="width:100%; margin-bottom:10px;" data-action="rechazado">✕ Cancelar pedido</button>
      <button class="oc-btn primary v-violet" style="width:100%;" data-action="en_proceso">▶️ Reanudar pedido</button> `;
  } else if (estado === "entregado") {
    container.innerHTML = `
      <div class="oc-final-row">
        <div class="oc-final-tag">✅ Entregado</div>
        <span class="oc-undo" data-action="en_proceso">↺ Reabrir</span>
      </div>`;
  } else if (estado === "rechazado") {
    const auto = !!p.auto_rechazado;
    const canceladoCliente = !!p.cancelado_por_cliente;
    const tagTexto = canceladoCliente
      ? "🚫 Cancelado por el cliente"
      : auto
        ? "⏱️ Auto-rechazado"
        : "✕ Rechazado";
    container.innerHTML = `
      <div class="oc-final-row">
        <div class="oc-final-tag${auto ? " auto" : ""}">${tagTexto}</div>
        <span class="oc-undo" data-action="pendiente">↺ Reactivar</span>
      </div>`;
  }

  container.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (btn.dataset.action === "_pausar") return abrirModalPausa(id, p);
      cambiarEstado(id, btn.dataset.action, btn);
    });
  });
}

/* ══════════════ Modal de detalle completo ══════════════ */
const detailOverlay = document.getElementById("detailOverlay");
const detailModal = document.getElementById("detailModal");

function openDetail(id) {
  activeModalId = id;
  renderDetail(id);
  detailOverlay.classList.add("show");
  requestAnimationFrame(() => detailModal.classList.add("show"));
  document.body.style.overflow = "hidden";
}
function closeDetail() {
  detailModal.classList.remove("show");
  detailOverlay.classList.remove("show");
  document.body.style.overflow = "";
  activeModalId = null;
}

function openMesaDetail(numeroMesa) {
  activeModalId = `mesa:${numeroMesa}`;
  renderMesaDetail(numeroMesa);
  detailOverlay.classList.add("show");
  requestAnimationFrame(() => detailModal.classList.add("show"));
  document.body.style.overflow = "hidden";
}

function renderMesaDetail(numeroMesa) {
  const mesaInfo = [...mesasMap.values()].find(
    (m) => m.numero_mesa === numeroMesa,
  );
  const activos = getPedidosDeMesa(numeroMesa).sort(
    (a, b) =>
      (toDate(a[1].timestamp)?.getTime() || 0) -
      (toDate(b[1].timestamp)?.getTime() || 0),
  );
  const total = activos.reduce((s, [, p]) => s + Number(p.total || 0), 0);
  const ocupada = activos.length > 0 || mesaInfo?.estado === "ocupado";

  detailModal.dataset.status = ocupada ? "pendiente" : "entregado";
  document.getElementById("dmId").innerHTML =
    `🍽️ Mesa <span class="oc-origin-tag mesa">${ocupada ? "Ocupada" : "Libre"}</span>`;
  document.getElementById("dmName").textContent =
    mesaInfo?.nombre_alias || "Mesa " + numeroMesa;
  const mesasDelGrupo = activos[0]?.[1]?.mesasGrupo;
  const grupoLabel =
    mesasDelGrupo && mesasDelGrupo.length > 1
      ? ` · Unida con ${mesasDelGrupo
          .filter((m) => m.numero !== numeroMesa)
          .map((m) => m.nombre || "Mesa " + m.numero)
          .join(", ")}`
      : "";
  document.getElementById("dmTime").innerHTML =
    `<span class="pulse"></span><span class="ts-label">${activos.length} pedido${activos.length === 1 ? "" : "s"} sin pagar${grupoLabel}</span>`;
  // Todo el detalle directo: cada pedido de la mesa, con sus bloques por hora,
  // sin necesitar un clic adicional para verlo.
  const bloquesDePedidos =
    activos
      .map(([id, p]) => {
        const cliente = p.cliente || {};
        const fecha = toDate(p.timestamp);
        const productos = Array.isArray(p.productos) ? p.productos : [];
        const totalItems =
          p.total_items ?? productos.reduce((s, i) => s + (i.cantidad || 0), 0);

        const contenido =
          Array.isArray(p.bloques) && p.bloques.length
            ? bloquesHtml(p.bloques)
            : `<div class="dm-products">${productos
                .map((it) => {
                  const ptsItem = getPuntosItemDesdeCache(it);
                  return `
          <div class="dm-prod-row">
            <div>
              <div class="dm-prod-name">${escapeHtml(it.nombre)}</div>
              <div class="dm-prod-qty">${it.cantidad} × S/ ${Number(it.precio_unitario || 0).toFixed(2)} c/u</div>
              ${ptsItem > 0 ? `<div class="dm-prod-puntos" style="font-size:10.5px;font-weight:700;color:#fbbf24;margin-top:2px;">🎁 +${ptsItem} pts</div>` : ""}
            </div>
            <div class="dm-prod-price">S/ ${Number(it.subtotal || 0).toFixed(2)}</div>
          </div>`;
                })
                .join("")}</div>`;

        return `
      <div style="border:1px solid var(--line); border-radius:16px; padding:14px; margin-bottom:12px; background:var(--surface);">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px;">
          <div>
            <div class="dm-prod-name">#${id.slice(0, 6).toUpperCase()} · ${escapeHtml(cliente.nombre || "Cliente")}</div>
            <div class="dm-prod-qty">${fecha ? timeAgo(fecha) : "—"} · ${labelEstado(ESTADOS.includes(p.estado) ? p.estado : "pendiente")} · ${totalItems} item${totalItems === 1 ? "" : "s"}</div>
          </div>
          <div class="dm-prod-price">${fmtMoney(p.total)}</div>
        </div>
        ${detalleCuponHtml(p)}
        ${contenido}
      </div>`;
      })
      .join("") ||
    `<p style="font-size:12.5px;color:var(--ink-faint);padding:6px 2px;">Esta mesa no tiene pedidos pendientes de pago.</p>`;

  // Suma los puntos de TODOS los pedidos activos de la mesa (no solo uno)
  const totalPuntosGanados = activos.reduce(
    (s, [, pOrder]) => s + (Number(pOrder.puntos_ganados) || 0),
    0,
  );

  document.getElementById("dmBody").innerHTML = `
        <div>
            <div class="dm-section-title">Detalle completo de la mesa</div>
            ${bloquesDePedidos}
        </div>
        ${
          totalPuntosGanados > 0
            ? `
    <div class="dm-meta-item full" style="background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.25);border-radius:12px;padding:10px 12px;">
      <div class="dm-meta-label">🎁 Puntos a otorgar</div>
      <div class="dm-meta-value" style="color:#fbbf24;font-weight:800;">+${totalPuntosGanados} puntos en total</div>
    </div>`
            : ""
        }

        
    <div class="dm-total-row">
      <span class="dm-total-lbl">Total del pedido</span>
      <span class="dm-total-val">${fmtMoney(total)}</span>
    </div>
  `;

  const dmActions = document.getElementById("dmActions");
  dmActions.innerHTML = "";
  if (activos.length > 0) {
    // Ocupada CON pedido: hay que cobrar antes de liberar
    const btn = document.createElement("button");
    btn.className = "oc-btn primary v-green";
    btn.style.width = "100%";
    btn.textContent = "💰 Marcar como pagado y liberar mesa";
    btn.addEventListener("click", () => liberarMesa(numeroMesa, btn));
    dmActions.appendChild(btn);

    const btnRechazar = document.createElement("button");
    btnRechazar.className = "oc-btn ghost danger";
    btnRechazar.style.width = "100%";
    btnRechazar.style.marginTop = "8px";
    btnRechazar.textContent = "✕ Rechazar pedido (sin cobrar)";
    btnRechazar.addEventListener("click", () =>
      rechazarPedidoMesa(numeroMesa, btnRechazar),
    );
    dmActions.appendChild(btnRechazar);
  } else if (ocupada) {
    // Ocupada SIN pedido registrado: no hay nada que cobrar, solo liberar
    const btn = document.createElement("button");
    btn.className = "oc-btn primary v-amber";
    btn.style.width = "100%";
    btn.textContent = "🔓 Liberar mesa (sin pedido)";
    btn.addEventListener("click", () => liberarMesa(numeroMesa, btn));
    dmActions.appendChild(btn);
  } else {
    dmActions.innerHTML = `<div class="oc-final-tag" style="width:100%;background:var(--green-soft);color:var(--green);">✅ Mesa libre</div>`;
  }
}
async function toggleReservaMesa(numeroMesa) {
  const mesaEntry = [...mesasMap.entries()].find(
    ([, m]) => m.numero_mesa === numeroMesa,
  );
  if (!mesaEntry) return;
  const [mesaDocId, m] = mesaEntry;
  const activos = getPedidosDeMesa(numeroMesa);
  if (activos.length > 0) {
    showToast("Esta mesa tiene pedidos activos, no se puede reservar", true);
    return;
  }
  const nuevaReserva = m.estado !== "reservada";
  let horaReservadaTs = null;

  if (nuevaReserva) {
    const horaTexto = window.prompt(
      "¿A qué hora llega el cliente? (formato 24h, ej: 14:20)",
      "",
    );
    if (horaTexto === null) return; // canceló
    const match = horaTexto.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
      showToast("Hora inválida, usa el formato HH:MM", true);
      return;
    }
    const [, hh, mm] = match;
    const fecha = new Date();
    fecha.setHours(Number(hh), Number(mm), 0, 0);
    if (fecha.getTime() < Date.now()) fecha.setDate(fecha.getDate() + 1); // si ya pasó, se asume mañana
    horaReservadaTs = Timestamp.fromDate(fecha);
  }

  try {
    const mesaRef = tiendaSubDoc(
      localidad,
      "tiendas",
      tiendaId,
      "mesas",
      mesaDocId,
    );
    await updateDoc(mesaRef, {
      estado: nuevaReserva ? "reservada" : "libre",
      hora_reservada: nuevaReserva ? horaReservadaTs : null,
      reservado_en: nuevaReserva ? serverTimestamp() : null,
    });
    showToast(
      nuevaReserva
        ? `🔒 Mesa ${numeroMesa} reservada`
        : `🔓 Reserva de mesa ${numeroMesa} quitada`,
    );
  } catch (err) {
    console.error("Error al reservar mesa:", err);
    showToast("❌ No se pudo actualizar la reserva", true);
  }
}

/* Quita la reserva de un GRUPO de mesas reservadas juntas: libera cada mesa y cierra el grupo */
async function quitarReservaGrupo(grupoId) {
  const grupo = gruposMap.get(grupoId);
  const miembros =
    grupo?.mesas ||
    [...mesasMap.entries()]
      .filter(([, m]) => m.grupoId === grupoId)
      .map(([id, m]) => ({ id }));
  if (!miembros.length) return;
  try {
    const batch = writeBatch(db);
    miembros.forEach((m) => {
      const mesaRef = tiendaSubDoc(
        localidad,
        "tiendas",
        tiendaId,
        "mesas",
        m.id,
      );
      batch.set(
        mesaRef,
        {
          estado: "libre",
          grupoId: null,
          grupo_color: null,
          reservado_en: null,
        },
        { merge: true },
      );
    });
    batch.set(
      tiendaSubDoc(localidad, "tiendas", tiendaId, "grupos_mesas", grupoId),
      { estado: "cerrado" },
      { merge: true },
    );
    await batch.commit();
    showToast("🔓 Reserva del grupo quitada, mesas liberadas");
  } catch (err) {
    console.error("Error al quitar la reserva del grupo:", err);
    showToast("❌ No se pudo quitar la reserva del grupo", true);
  }
}

/* Desagrupa un grupo de mesas y las devuelve al grid como celdas individuales.
           - Si el grupo NO tiene pedidos activos (reservado o quedó "huérfano"), simplemente
             se separan y quedan libres.
           - Si el grupo SÍ tiene un pedido activo (ocupado), se pide confirmación porque el
             pedido compartido seguirá existiendo en la base de datos, pero dejará de estar
             vinculado visualmente a estas mesas. */
async function desagruparGrupo(grupoId) {
  const grupo = gruposMap.get(grupoId);
  const miembrosMap = [...mesasMap.entries()].filter(
    ([, m]) => m.grupoId === grupoId,
  );
  if (!miembrosMap.length) return;

  const activos = miembrosMap.reduce(
    (acc, [, m]) => acc + getPedidosDeMesa(m.numero_mesa).length,
    0,
  );

  if (activos > 0) {
    const ok = window.confirm(
      "Este grupo tiene un pedido activo compartido. Al desagrupar, las mesas se separarán " +
        "pero el pedido NO se marcará como pagado (seguirá existiendo en el sistema). ¿Deseas continuar?",
    );
    if (!ok) return;
  }

  try {
    const batch = writeBatch(db);
    miembrosMap.forEach(([mesaDocId]) => {
      const mesaRef = tiendaSubDoc(
        localidad,
        "tiendas",
        tiendaId,
        "mesas",
        mesaDocId,
      );
      batch.set(
        mesaRef,
        {
          estado: "libre",
          grupoId: null,
          grupo_color: null,
          reservado_en: null,
        },
        { merge: true },
      );
    });
    batch.set(
      tiendaSubDoc(localidad, "tiendas", tiendaId, "grupos_mesas", grupoId),
      { estado: "cerrado" },
      { merge: true },
    );
    await batch.commit();
    showToast("⇱ Mesas desagrupadas");
  } catch (err) {
    console.error("Error al desagrupar mesas:", err);
    showToast("❌ No se pudo desagrupar el grupo", true);
  }
}

async function liberarMesa(numeroMesa, btnEl) {
  const activos = getPedidosDeMesa(numeroMesa);
  const mesaEntry = [...mesasMap.entries()].find(
    ([, m]) => m.numero_mesa === numeroMesa,
  );
  if (!activos.length && mesaEntry?.[1]?.estado !== "ocupado") return;
  if (btnEl) btnEl.disabled = true;
  try {
    const grupoId = activos[0]?.[1]?.grupoId || mesaEntry?.[1]?.grupoId || null;

    if (grupoId) {
      // Mesa agrupada: liberamos TODAS las mesas del grupo de una sola vez
      const grupo = gruposMap.get(grupoId);
      const batch = writeBatch(db);
      (grupo?.mesas || []).forEach((m) => {
        const mesaRef = tiendaSubDoc(
          localidad,
          "tiendas",
          tiendaId,
          "mesas",
          m.id,
        );
        batch.set(
          mesaRef,
          {
            estado: "libre",
            pago: "pagado",
            grupoId: null,
            grupo_color: null,
            reservado_en: null,
            hora_reservada: null,
          },
          { merge: true },
        );
      });
      batch.set(
        tiendaSubDoc(localidad, "tiendas", tiendaId, "grupos_mesas", grupoId),
        { estado: "cerrado" },
        { merge: true },
      );
      if (grupo?.pedidoGrupoDocId) {
        batch.set(
          tiendaSubDoc(
            localidad,
            "tiendas",
            tiendaId,
            "pedidos",
            grupo.pedidoGrupoDocId,
          ),
          {
            estado: "entregado",
            actualizado: serverTimestamp(),
          },
          { merge: true },
        );
      }
      let agotadosGrupo = [];
      if (grupo?.pedido)
        agotadosGrupo = await descontarStockPedido(grupo.pedido);
      await batch.commit();
      showToast("🍽️ Mesas agrupadas liberadas y pedido marcado como pagado");
      if (agotadosGrupo.length) {
        playStockAgotadoAlarm();
        bellRingFeedback();
        const nombres = agotadosGrupo.map((a) => a.nombre).join(", ");
        showToast(`📦 Sin stock: ${nombres}`, true);
        notificarStockAgotado(nombres);
      }
      closeDetail();
      return;
    }

    if (!activos.length) {
      // Mesa ocupada manualmente (sin pedido registrado todavía): solo se libera
      if (mesaEntry) {
        await updateDoc(
          tiendaSubDoc(localidad, "tiendas", tiendaId, "mesas", mesaEntry[0]),
          {
            estado: "libre",
            pago: "pagado",
            pedido: null,
            reservado_en: null,
            hora_reservada: null,
          },
        );
      }
      showToast("🍽️ Mesa liberada");
      closeDetail();
      return;
    }

    const resultados = await Promise.all(
      activos.map(async ([mesaDocId, pseudoPedido]) => {
        const mesaRef = tiendaSubDoc(
          localidad,
          "tiendas",
          tiendaId,
          "mesas",
          mesaDocId,
        );
        const tareas = [
          updateDoc(mesaRef, {
            estado: "libre",
            pago: "pagado",
            pedido: null,
            reservado_en: null,
            hora_reservada: null,
          }),
        ];

        const agotadosMesa = await descontarStockPedido(pseudoPedido);

        if (pseudoPedido.pedidoDocId) {
          const pedidoRef = tiendaSubDoc(
            localidad,
            "tiendas",
            tiendaId,
            "pedidos",
            pseudoPedido.pedidoDocId,
          );
          tareas.push(
            updateDoc(pedidoRef, {
              estado: "entregado",
              actualizado: serverTimestamp(),
              stock_descontado: true,
            }),
          );
        }
        await Promise.all(tareas);
        return agotadosMesa;
      }),
    );

    const agotadosTotal = resultados.flat();
    showToast("🍽️ Mesa liberada y pedido marcado como pagado");
    if (agotadosTotal.length) {
      playStockAgotadoAlarm();
      bellRingFeedback();
      const nombres = agotadosTotal.map((a) => a.nombre).join(", ");
      showToast(`📦 Sin stock: ${nombres}`, true);
      notificarStockAgotado(nombres);
    }
    closeDetail();
  } catch (err) {
    console.error("Error liberando mesa:", err);
    showToast("❌ No se pudo liberar la mesa", true);
    if (btnEl) btnEl.disabled = false;
  }
}
async function rechazarPedidoMesa(numeroMesa, btnEl) {
  const activos = getPedidosDeMesa(numeroMesa);
  if (!activos.length) return;
  if (btnEl) btnEl.disabled = true;
  try {
    const grupoId = activos[0]?.[1]?.grupoId || null;

    if (grupoId) {
      const grupo = gruposMap.get(grupoId);
      const batch = writeBatch(db);
      (grupo?.mesas || []).forEach((m) => {
        const mesaRef = tiendaSubDoc(
          localidad,
          "tiendas",
          tiendaId,
          "mesas",
          m.id,
        );
        batch.set(
          mesaRef,
          {
            estado: "libre",
            pago: "pendiente",
            grupoId: null,
            grupo_color: null,
            reservado_en: null,
            hora_reservada: null,
          },
          { merge: true },
        );
      });
      batch.set(
        tiendaSubDoc(localidad, "tiendas", tiendaId, "grupos_mesas", grupoId),
        { estado: "cerrado" },
        { merge: true },
      );
      let pedidoRechazadoData = null;
      if (grupo?.pedidoGrupoDocId) {
        batch.set(
          tiendaSubDoc(
            localidad,
            "tiendas",
            tiendaId,
            "pedidos",
            grupo.pedidoGrupoDocId,
          ),
          { estado: "rechazado", actualizado: serverTimestamp() },
          { merge: true },
        );
        pedidoRechazadoData = {
          id: grupo.pedidoGrupoDocId,
          data: grupo.pedido,
        };
      }
      await batch.commit();
      showToast("🍽️ Pedido de mesas agrupadas rechazado");
      if (pedidoRechazadoData?.data) {
        await devolverPuntosCuponSiAplica(
          pedidoRechazadoData.id,
          pedidoRechazadoData.data,
        );
      }
      closeDetail();
      return;
    }

    await Promise.all(
      activos.map(async ([mesaDocId, pseudoPedido]) => {
        const mesaRef = tiendaSubDoc(
          localidad,
          "tiendas",
          tiendaId,
          "mesas",
          mesaDocId,
        );
        const tareas = [
          updateDoc(mesaRef, {
            estado: "libre",
            pago: "pendiente",
            pedido: null,
            reservado_en: null,
            hora_reservada: null,
          }),
        ];
        if (pseudoPedido.pedidoDocId) {
          tareas.push(
            updateDoc(
              tiendaSubDoc(
                localidad,
                "tiendas",
                tiendaId,
                "pedidos",
                pseudoPedido.pedidoDocId,
              ),
              { estado: "rechazado", actualizado: serverTimestamp() },
            ),
          );
        }
        await Promise.all(tareas);
        if (pseudoPedido.pedidoDocId) {
          await devolverPuntosCuponSiAplica(
            pseudoPedido.pedidoDocId,
            pseudoPedido,
          );
        }
      }),
    );

    showToast("🍽️ Pedido de mesa rechazado, mesa liberada");
    closeDetail();
  } catch (err) {
    console.error("Error rechazando pedido de mesa:", err);
    showToast("❌ No se pudo rechazar el pedido", true);
    if (btnEl) btnEl.disabled = false;
  }
}

document.getElementById("dmClose").addEventListener("click", closeDetail);
detailOverlay.addEventListener("click", (e) => {
  if (e.target === detailOverlay) closeDetail();
});

function bloquesHtml(bloques) {
  return bloques
    .map(
      (bloque, idx) => `
    <div style="margin-bottom:12px;">
      <div class="dm-prod-cat" style="margin-bottom:6px;">${idx === 0 ? "Pedido inicial" : "Agregado"} · ${escapeHtml(bloque.hora)}${bloque.mesaOrigenNombre ? ` · 🪑 ${escapeHtml(bloque.mesaOrigenNombre)}` : ""}</div>
      <div class="dm-products">
        ${bloque.items
          .map((it) => {
            const ptsItem = getPuntosItemDesdeCache(it);
            return `
          <div class="dm-prod-row">
            <div>
              <div class="dm-prod-name">${escapeHtml(it.nombre)}</div>
              <div class="dm-prod-qty">${it.cantidad} × S/ ${Number(it.precio_unitario || 0).toFixed(2)} c/u</div>
              ${ptsItem > 0 ? `<div class="dm-prod-puntos" style="font-size:10.5px;font-weight:700;color:#fbbf24;margin-top:2px;">🎁 +${ptsItem} pts</div>` : ""}
            </div>
            <div class="dm-prod-price">S/ ${Number(it.subtotal || 0).toFixed(2)}</div>
          </div>`;
          })
          .join("")}
      </div>
    </div>`,
    )
    .join("");
}
function renderDetail(id) {
  const p = pedidosMap.get(id);
  if (!p) {
    closeDetail();
    return;
  }

  const estado = ESTADOS.includes(p.estado) ? p.estado : "pendiente";
  const fecha = toDate(p.timestamp);
  const tsMs = fecha ? fecha.getTime() : null;
  const cliente = p.cliente || {};
  const pago = p.pago || {};
  const productos = Array.isArray(p.productos) ? p.productos : [];
  const totalItems =
    p.total_items ?? productos.reduce((s, i) => s + (i.cantidad || 0), 0);
  const entregaIco = ICONOS_ENTREGA[cliente.tipo_entrega] || "📦";
  const pagoIco = ICONOS_PAGO[pago.metodo] || "💳";
  const origen = getOrigen(p);

  detailModal.dataset.status = estado;
  document.getElementById("dmId").innerHTML =
    `#${id.slice(0, 8).toUpperCase()} ${origenTagHtml(p)}${cuponTagHtml(p)}`;
  const esSeguidorDetalle =
    clientesSeguidoresCache.get(cliente.id_cliente) === true;
  document.getElementById("dmName").innerHTML =
    `${escapeHtml(cliente.nombre || "Cliente sin nombre")}${esSeguidorDetalle ? ` <span style="font-size:10px;font-weight:800;color:#7c5cff;background:rgba(124,92,255,.15);padding:2px 7px;border-radius:999px;">⭐ Seguidor</span>` : ""}`;
  const dmTime = document.getElementById("dmTime");
  if (tsMs) {
    dmTime.dataset.ts = tsMs;
    dmTime.innerHTML = `<span class="pulse"></span><span class="ts-label">${timeAgo(fecha)}</span>`;
  } else {
    dmTime.removeAttribute("data-ts");
    dmTime.innerHTML = `<span class="pulse"></span><span class="ts-label">—</span>`;
  }

  const fechaHora = [p.fecha, p.hora].filter(Boolean).join(" · ");

 const prodRows =
  productos
    .map((it) => {
      const ptsItem = getPuntosItemDesdeCache(it);
      const opcTxt = it.opciones
        ? Object.entries(it.opciones).map(([k, v]) => `${k}: ${v}`).join(" · ")
        : "";
      return `
    <div class="dm-prod-row">
      <div>
        <div class="dm-prod-name">${escapeHtml(it.nombre)}</div>
        ${it.categoria ? `<div class="dm-prod-cat">${escapeHtml(it.categoria)}</div>` : ""}
        ${opcTxt ? `<div class="dm-prod-cat" style="color:#a78bfa;">${escapeHtml(opcTxt)}</div>` : ""}
        <div class="dm-prod-qty">${it.cantidad} × S/ ${Number(it.precio_unitario || 0).toFixed(2)} c/u</div>
        ${ptsItem > 0 ? `<div class="dm-prod-puntos" style="font-size:10.5px;font-weight:700;color:#fbbf24;margin-top:2px;">🎁 +${ptsItem} pts</div>` : ""}
      </div>
      <div class="dm-prod-price">S/ ${Number(it.subtotal ?? it.precio_unitario * it.cantidad ?? 0).toFixed(2)}</div>
    </div>
  `;
    })
    .join("") ||
  `<p style="font-size:12.5px;color:var(--ink-faint);padding:6px 2px;">Sin productos registrados</p>`;
  const autoNote =
    estado === "rechazado" && p.auto_rechazado
      ? `<div class="dm-meta-item full"><div class="dm-meta-label">⏱️ Motivo</div><div class="dm-meta-value">Rechazado automáticamente por superar ${autoRejectMinutes} min sin pasar a "En proceso"</div></div>`
      : "";

  const mesaInfoBlock =
    origen.tipo === "mesa"
      ? `
        <div class="dm-meta-item">
          <div class="dm-meta-label">🍽️ Mesa</div>
          <div class="dm-meta-value">${escapeHtml(origen.nombre || mesasMap.get(origen.mesaId)?.nombre_alias || "Mesa " + origen.numero)}</div>
        </div>`
      : "";

  document.getElementById("dmBody").innerHTML = `
      ${detalleCuponHtml(p)}
    <div>
      <div class="dm-section-title">Datos del pedido</div>
      <div class="dm-meta-grid">
        <div class="dm-meta-item">
          <div class="dm-meta-label">🗓️ Fecha y hora</div>
          <div class="dm-meta-value">${escapeHtml(fechaHora || "Sin registrar")}</div>
        </div>
        ${mesaInfoBlock}
        <div class="dm-meta-item">
          <div class="dm-meta-label">${entregaIco} Tipo de entrega</div>
          <div class="dm-meta-value">${escapeHtml(cliente.tipo_entrega || (origen.tipo === "mesa" ? "Consumo en mesa" : "Sin especificar"))}</div>
        </div>
        ${
          cliente.tipo_entrega === "Delivery"
            ? `
        <div class="dm-meta-item full">
          <div class="dm-meta-label">📍 Dirección de entrega</div>
          <div class="dm-meta-value ${cliente.direccion ? "" : "dim"}">${cliente.direccion ? escapeHtml(cliente.direccion) : "Sin dirección registrada"}</div>
        </div>`
            : ""
        }
        <div class="dm-meta-item">
          <div class="dm-meta-label">${pagoIco} Método de pago</div>
          <div class="dm-meta-value">${escapeHtml(pago.metodo || "Sin especificar")}</div>
        </div>
        <div class="dm-meta-item">
          <div class="dm-meta-label">💰 Vuelto</div>
          <div class="dm-meta-value ${pago.metodo === "Efectivo" && pago.vuelto ? "" : "dim"}">${pago.metodo === "Efectivo" && pago.vuelto ? "Paga con S/ " + escapeHtml(pago.vuelto) : "No aplica"}</div>
        </div>
        <div class="dm-meta-item full">
          <div class="dm-meta-label">📝 Nota del cliente</div>
          <div class="dm-meta-value ${p.nota ? "" : "dim"}">${p.nota ? escapeHtml(p.nota) : "Sin especificaciones adicionales"}</div>
        </div>
        ${autoNote}
      </div>
    </div>

     <div>
      <div class="dm-section-title">Productos · ${totalItems} item${totalItems === 1 ? "" : "s"}</div>
      ${origen.tipo === "mesa" && Array.isArray(p.bloques) && p.bloques.length ? bloquesHtml(p.bloques) : `<div class="dm-products">${prodRows}</div>`}
    </div>

    <div class="dm-total-row">
      <span class="dm-total-lbl">Total del pedido</span>
      <span class="dm-total-val">${fmtMoney(p.total)}</span>
    </div>
  `;

  const actionsWrap = document.createElement("div");
  actionsWrap.className = "oc-actions";
  renderModalActions(actionsWrap, id, estado, p);
  const dmActions = document.getElementById("dmActions");
  dmActions.innerHTML = "";
  dmActions.appendChild(actionsWrap);
}

function renderModalActions(container, id, estado, p) {
  container.innerHTML = "";

  if (estado === "pendiente") {
    const puntosCalc = getPuntosPedido(id, p);
    const puntosNota =
      puntosCalc > 0
        ? `<div class="oc-puntos-aceptar" style="width:100%;">🎁 Al aceptar, el cliente ganará <strong>+${puntosCalc} puntos</strong></div>`
        : "";
    container.innerHTML = `
      ${puntosNota}
      <button class="oc-btn ghost danger" data-action="rechazado">✕ Rechazar pedido</button>
      <button class="oc-btn ghost" data-action="_pausar">⏸️ Pausar pedido</button>
      <button class="oc-btn primary v-violet" data-action="en_proceso">Aceptar pedido →</button>`;
  } else if (estado === "en_proceso") {
    container.innerHTML = `
      <button class="oc-btn ghost" data-action="pendiente">← Volver a pendiente</button>
      <button class="oc-btn ghost" data-action="_pausar">⏸️ Pausar pedido</button>
      <button class="oc-btn primary v-green" data-action="entregado">Marcar entregado ✓</button>`;
  } else if (estado === "en_pausa") {
    const r = p.respuesta_cliente;
    container.innerHTML = `
      <div class="oc-final-tag" style="width:100%;background:rgba(56,189,248,.12);color:#38bdf8;">⏸️ Pedido en pausa</div>
      ${
        r
          ? `<div style="width:100%;font-size:12.5px;color:#38bdf8;padding:6px 2px;">Cliente eligió: <strong>${escapeHtml(
              r.accion === "reemplazo"
                ? "cambiar por " + (r.producto_elegido?.nombre || "")
                : r.accion === "cancelado"
                  ? "cancelar el pedido"
                  : "continuar sin ese producto",
            )}</strong></div>`
          : `<div style="width:100%;font-size:12px;color:var(--ink-faint);padding:6px 2px;">Esperando respuesta del cliente…</div>`
      }
      <button class="oc-btn ghost danger" style="width:100%;" data-action="rechazado">✕ Cancelar pedido</button>
      <button class="oc-btn primary v-violet" style="width:100%;" data-action="en_proceso">▶️ Reanudar pedido</button>`;
  } else if (estado === "entregado") {
    container.innerHTML = `
      <div class="oc-final-tag" style="width:100%;">✅ Este pedido ya fue entregado</div>
      <div class="dm-undo-row" style="width:100%;"><span class="oc-undo" data-action="en_proceso">↺ Reabrir pedido</span></div>`;
  } else if (estado === "rechazado") {
    const auto = !!p.auto_rechazado;
    const canceladoCliente = !!p.cancelado_por_cliente;
    const tagTexto = canceladoCliente
      ? "🚫 Este pedido fue cancelado por el cliente"
      : auto
        ? "⏱️ Rechazado automáticamente por tiempo"
        : "✕ Este pedido fue rechazado";
    container.innerHTML = `
      <div class="oc-final-tag${auto ? " auto" : ""}" style="width:100%;">${tagTexto}</div>
      <div class="dm-undo-row" style="width:100%;"><span class="oc-undo" data-action="pendiente">↺ Reactivar pedido</span></div>`;
  }
  container.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation?.();
      if (btn.dataset.action === "_pausar") return abrirModalPausa(id, p);
      if (btn.dataset.action === "_aceptar")
        return abrirModalTiempo(id, p, btn);
      cambiarEstado(id, btn.dataset.action, btn);
    });
  });
}

/* ══════════════ Descuento de stock al entregar un pedido ══════════════
   Se descuenta SOLO la primera vez que el pedido llega a "entregado".
   - Si el producto tiene stock = null (sin control de stock), no se toca.
   - Si el pedido se rechaza, se reabre o se reactiva, NO se restaura el stock:
     el descuento es definitivo.
   - Usa runTransaction para que sea seguro aunque lleguen varios pedidos a la vez. */
async function descontarStockPedido(pedido) {
  const productos = Array.isArray(pedido.productos) ? pedido.productos : [];
  const agotados = [];

  for (const it of productos) {
    if (!it.id || !it.categoria) continue;
    const cantidad = Number(it.cantidad) || 0;
    if (cantidad <= 0) continue;
    const prodRef = tiendaSubDoc(
      localidad,
      "tiendas",
      tiendaId,
      "productos",
      it.categoria,
      it.categoria,
      it.id,
    );

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(prodRef);
        if (!snap.exists()) return;
        const data = snap.data();
        const updates = {};
        let agotadoDeEsteItem = null; // ← solo UNA notificación por línea de pedido

        // 1) Variante específica (si el pedido trae opciones elegidas)
        const seleccion = it.opciones || null;
        if (
          seleccion &&
          typeof seleccion === "object" &&
          Array.isArray(data.condiciones) &&
          data.condiciones.length
        ) {
          updates.condiciones = data.condiciones.map((cond) => {
            const opcionElegida = seleccion[cond.nombre];
            if (!opcionElegida) return cond;
            return {
              ...cond,
              opciones: (cond.opciones || []).map((op) => {
                if (op.nombre !== opcionElegida || typeof op.stock !== "number")
                  return op;
                const nuevoStockOp = Math.max(0, op.stock - cantidad);
                if (nuevoStockOp <= 0 && op.stock > 0 && !agotadoDeEsteItem) {
                  agotadoDeEsteItem = {
                    nombre: `${data.nombre || it.nombre} (${op.nombre})`,
                    tipo: "variante",
                  };
                }
                return {
                  ...op,
                  stock: nuevoStockOp,
                  activo: nuevoStockOp > 0 ? op.activo : false,
                };
              }),
            };
          });
        }

        // 2) Stock general del producto (solo notifica si la variante no lo hizo ya)
        if (typeof data.stock === "number") {
          const nuevoStock = Math.max(0, data.stock - cantidad);
          updates.stock = nuevoStock;
          if (data.autoDesactivar && nuevoStock <= 0)
            updates.disponible = false;
          if (nuevoStock <= 0 && data.stock > 0 && !agotadoDeEsteItem) {
            agotadoDeEsteItem = {
              nombre: data.nombre || it.nombre,
              tipo: "producto",
            };
          }
        }

        if (agotadoDeEsteItem) agotados.push(agotadoDeEsteItem);
        if (Object.keys(updates).length) tx.update(prodRef, updates);
      });
    } catch (err) {
      console.error(
        `No se pudo descontar stock de "${it.nombre || it.id}":`,
        err,
      );
    }
  }
  return agotados;
}

/* ══════════════ Acreditar puntos al cliente en el doc de la TIENDA ══════════════
   Ruta: Tiendas/.../tiendas/{tiendaId}/clientes/{uid}
   - Si el doc no existe, crea fecha_inicio (primera vez que compra en esta tienda).
   - "puntos" se acumula con increment (atómico, no se pisa entre pedidos simultáneos).
   - "ultimo_consumo" se actualiza siempre.
   - Guarda además un historial de compras en clientes/{uid}/historial para que la
     tienda vea qué compró cada cliente y quién invierte más. */
async function devolverPuntosCuponSiAplica(pedidoId, pedido) {
  const cupon = pedido?.cupon;
  if (!cupon || cupon.origen !== "fidelizacion") return;
  if (pedido.puntos_cupon_devueltos) return;
  const uid = pedido.cliente?.id_cliente;
  const puntos = Number(cupon.costoPuntos) || 0;
  if (!uid || puntos <= 0) return;

  try {
    await updateDoc(clienteDoc(localidad, tiendaId, uid), {
      puntos: increment(puntos),
    });
    if (cupon.codigo) {
      await updateDoc(clienteCuponDoc(localidad, tiendaId, uid, cupon.codigo), {
        usado: false,
        estado: "activo",
        pedidoId: null,
      }).catch(() => {});
    }
    // NUEVO: registro en el historial de puntos del cliente
    await addDoc(
      tiendaSubCol(
        localidad,
        "tiendas",
        tiendaId,
        "clientes",
        uid,
        "historial",
      ),
      {
        tipo: "devolucion",
        fecha: serverTimestamp(),
        puntos: puntos, // positivo
        concepto: `Pedido rechazado #${pedidoId.slice(0, 6).toUpperCase()} · puntos devueltos`,
        pedidoId,
        codigoCupon: cupon.codigo || null,
      },
    );
    await updateDoc(
      tiendaSubDoc(localidad, "tiendas", tiendaId, "pedidos", pedidoId),
      { puntos_cupon_devueltos: true },
    );
    showToast(`↩️ Se devolvieron ${puntos} puntos al cliente`);
  } catch (err) {
    console.error("No se pudieron devolver los puntos del cupón:", err);
  }
}
async function acreditarPuntosCliente(
  uid,
  tiendaId,
  puntosGanados,
  pedidoId,
  pedidoActual,
) {
  const clienteRef = tiendaSubDoc(
    localidad,
    "tiendas",
    tiendaId,
    "clientes",
    uid,
  );

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(clienteRef);
      const updates = {
        id: uid,
        id_usuario: uid,
        puntos: increment(puntosGanados),
        ultimo_consumo: serverTimestamp(),
      };
      if (!snap.exists()) updates.fecha_inicio = serverTimestamp();
      tx.set(clienteRef, updates, { merge: true });
    });

    const historialRef = tiendaSubCol(
      localidad,
      "tiendas",
      tiendaId,
      "clientes",
      uid,
      "historial",
    );
    await addDoc(historialRef, {
      tipo: "ganado",
      pedidoId,
      fecha: serverTimestamp(),
      total: Number(pedidoActual.total) || 0,
      puntos_ganados: puntosGanados,
      tipo_entrega: pedidoActual.cliente?.tipo_entrega || null,
      productos: (pedidoActual.productos || []).map((it) => ({
        id: it.id || null,
        nombre: it.nombre || "",
        categoria: it.categoria || null,
        cantidad: it.cantidad || 0,
        precio_unitario: Number(it.precio_unitario) || 0,
        subtotal: Number(it.subtotal) || 0,
      })),
    });

    return true;
  } catch (err) {
    console.error(
      "No se pudieron acreditar los puntos al cliente (doc tienda):",
      err,
    );
    return false;
  }
}
function abrirModalTiempo(id, p, btnEl) {
  const overlay = document.getElementById("tiempoOverlay");
  const minutosInput = document.getElementById("tiempoMinutos");
  const omitirCheck = document.getElementById("tiempoOmitir");
  minutosInput.value = 20;
  omitirCheck.checked = false;
  minutosInput.disabled = false;

  omitirCheck.onchange = () => (minutosInput.disabled = omitirCheck.checked);

  document.getElementById("tiempoConfirmar").onclick = () => {
    const omitir = omitirCheck.checked;
    const minutos = omitir
      ? null
      : Math.max(1, Number(minutosInput.value) || 20);
    overlay.classList.remove("show");
    cambiarEstado(id, "en_proceso", btnEl, { tiempoEstimadoMin: minutos });
  };

  overlay.classList.add("show");
}
document
  .getElementById("tiempoClose")
  ?.addEventListener("click", () =>
    document.getElementById("tiempoOverlay")?.classList.remove("show"),
  );
document.getElementById("tiempoOverlay")?.addEventListener("click", (e) => {
  if (e.target.id === "tiempoOverlay") e.target.classList.remove("show");
});
/* ══════════════ Notifica al cliente que su pedido cambió de estado ══════════════
           Llama a la cloud function que ya tienes, mandando el id del cliente,
           un mensaje según el nuevo estado, y el logo del negocio como imagen. */
function labelEstadoParaCliente(estado) {
  return (
    {
      pendiente: "Tu pedido está pendiente de confirmación",
      en_proceso: "¡Tu pedido está en preparación!",
      en_pausa: "Tu pedido está en pausa, revisa los detalles",
      entregado: "¡Tu pedido fue entregado! Gracias por tu compra",
      rechazado: "Tu pedido fue rechazado",
    }[estado] || "El estado de tu pedido cambió"
  );
}

async function notificarCambioEstadoAlCliente(pedido, nuevoEstado) {
  if (!URL_NOTIFICAR_CLIENTE) return; // aún no configurada la URL
  const idUser = pedido?.cliente?.id_cliente;
  if (!idUser) return; // pedido sin cliente registrado (ej. venta directa), no se notifica

  try {
    await fetch(URL_NOTIFICAR_CLIENTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_user: idUser,
        title: bizNombreGlobal || "Geinz",
        body: labelEstadoParaCliente(nuevoEstado),
        logo: bizLogoUrl || "",
        id_tienda: tiendaId || "",
        tipo_notificacion: "logo",
        prioridad: "high",
      }),
    });
  } catch (err) {
    console.warn("No se pudo notificar el cambio de estado al cliente:", err);
  }
}
/* ══════════════ Cambiar estado en Firestore ══════════════ */
async function cambiarEstado(pedidoId, nuevoEstado, btnEl, opts = {}) {
  if (btnEl) btnEl.disabled = true;
  detenerSoundLoopParaPedido(pedidoId);
  try {
    const ref = tiendaSubDoc(
      localidad,
      "tiendas",
      tiendaId,
      "pedidos",
      pedidoId,
    );

    const payload = { estado: nuevoEstado, actualizado: serverTimestamp() };
    if (nuevoEstado !== "rechazado") payload.auto_rechazado = false;
    if (nuevoEstado !== "rechazado") payload.cancelado_por_cliente = false;
    if (opts.auto) payload.auto_rechazado = true;
    if (nuevoEstado === "en_proceso" && "tiempoEstimadoMin" in opts) {
      payload.tiempo_estimado_min = opts.tiempoEstimadoMin;
      payload.tiempo_estimado_desde = serverTimestamp();
    }

    // ═══ 1) Actualiza el estado YA MISMO, sin esperar nada más ═══
    await updateDoc(ref, payload);
    if (!opts.auto) showToast(`Pedido movido a ${labelEstado(nuevoEstado)}`);

    const pedidoParaNotificar = pedidosMap.get(pedidoId);
    if (pedidoParaNotificar) {
      notificarCambioEstadoAlCliente(pedidoParaNotificar, nuevoEstado);
    }

    // ═══ 2) Descuento de stock y puntos: EN SEGUNDO PLANO, ya no bloquean la UI ═══
    // ═══ 2) Descuento de stock: se dispara la PRIMERA vez que el pedido
    //        pasa a "en_proceso" (aceptado) o a "entregado" — lo que ocurra
    //        primero. El flag stock_descontado evita que se descuente 2 veces. ═══
    if (nuevoEstado === "en_proceso" || nuevoEstado === "entregado") {
      const pedidoActual = pedidosMap.get(pedidoId);
      if (pedidoActual && !pedidoActual.stock_descontado) {
        descontarStockPedido(pedidoActual)
          .then((agotados) => {
            updateDoc(ref, { stock_descontado: true });
            if (agotados && agotados.length) {
              playStockAgotadoAlarm();
              bellRingFeedback();
              const nombres = agotados.map((a) => a.nombre).join(", ");
              showToast(`📦 Sin stock: ${nombres}`, true);
              notificarStockAgotado(nombres);
            }
          })
          .catch((err) => console.error("Error descontando stock:", err));
      }
    }

    // ═══ 3) Puntos de fidelización: solo cuando el pedido realmente se
    //        entrega, no solo al aceptarlo. ═══
    if (nuevoEstado === "entregado") {
      const pedidoActual = pedidosMap.get(pedidoId);
      if (pedidoActual && !pedidoActual.puntos_acreditados) {
        const uid = pedidoActual.cliente?.id_cliente;
        const puntosGanados =
          Number(pedidoActual.puntos_ganados) ||
          puntosPedidoCache.get(pedidoId) ||
          0;
        if (uid && puntosGanados > 0) {
          (async () => {
            try {
              await updateDoc(data_user_logeado(uid), {
                [`puntos.${tiendaId}`]: increment(puntosGanados),
              });
              await acreditarPuntosCliente(
                uid,
                tiendaId,
                puntosGanados,
                pedidoId,
                pedidoActual,
              );
              await updateDoc(ref, { puntos_acreditados: true });
            } catch (err) {
              console.error("No se pudieron acreditar los puntos:", err);
            }
          })();
        }
      }
    }
    if (nuevoEstado === "rechazado") {
      const pedidoActual = pedidosMap.get(pedidoId);
      if (pedidoActual) devolverPuntosCuponSiAplica(pedidoId, pedidoActual);
    }
  } catch (err) {
    console.error("Error actualizando pedido:", err);
    showToast("❌ No se pudo actualizar el pedido", true);
    if (btnEl) btnEl.disabled = false;
    if (opts.auto) autoRejectingIds.delete(pedidoId);
  }
}
async function verificarSeguidor(uid) {
  if (!uid) return false;
  if (clientesSeguidoresCache.has(uid)) return clientesSeguidoresCache.get(uid);
  try {
    const snap = await getDoc(data_user_logeado(uid));
    const existe = snap.exists();
    clientesSeguidoresCache.set(uid, existe);
    return existe;
  } catch (err) {
    console.error("Error verificando seguidor:", err);
    return false;
  }
}

async function precargarSeguidores() {
  const pendientes = [];
  pedidosMap.forEach((p) => {
    const uid = p.cliente?.id_cliente;
    if (uid && !clientesSeguidoresCache.has(uid)) pendientes.push(uid);
  });
  const unicos = [...new Set(pendientes)];
  if (!unicos.length) return;
  await Promise.all(unicos.map((uid) => verificarSeguidor(uid)));
  renderBoard(); // repinta ya con el badge de seguidor listo
}

function labelEstado(e) {
  return (
    {
      pendiente: "Pendiente",
      en_proceso: "En proceso",
      en_pausa: "En pausa",
      entregado: "Entregado",
      rechazado: "Rechazado",
    }[e] || e
  );
}

/* ══════════════ Chequeo periódico de auto-rechazo ══════════════
           El auto-rechazo por tiempo solo puede revisar pedidos "pendiente" que ya estén
           cargados en pedidosMap — es decir, dentro del rango de fecha actualmente
           suscrito. En la práctica esto siempre incluye "Hoy" cuando el operador tiene la
           pantalla abierta con el filtro por defecto, que es el caso que importa: un pedido
           recién llegado que nadie atiende. Si el operador navega a "semana pasada", el
           auto-rechazo simplemente no aplica sobre pedidos antiguos (ya no tiene sentido
           rechazar automáticamente algo de hace días).

           IMPORTANTE: pedidos "en_pausa" nunca se auto-rechazan (el filtro estado !== "pendiente"
           ya los excluye, ya que ESTADOS.includes(p.estado) los distingue de "pendiente"). */
function chequearAutoRechazo() {
  if (!autoRejectEnabled) return;
  const limiteMs = autoRejectMinutes * 60000;
  const rechazadosAhora = [];

  pedidosMap.forEach((p, id) => {
    const estado = ESTADOS.includes(p.estado) ? p.estado : "pendiente";
    if (estado !== "pendiente") return; // esto ya excluye en_pausa, en_proceso, etc.
    if (getOrigen(p).tipo !== "whatsapp") return; // el auto-rechazo solo aplica a WhatsApp
    if (autoRejectingIds.has(id)) return;
    const fecha = toDate(p.timestamp);
    if (!fecha) return;
    if (Date.now() - fecha.getTime() >= limiteMs) {
      autoRejectingIds.add(id);
      rechazadosAhora.push([id, p]);
    }
  });

  if (!rechazadosAhora.length) return;

  rechazadosAhora.forEach(([id, p]) => {
    cambiarEstado(id, "rechazado", null, { auto: true });
  });

  playAutoRejectAlarm();
  bellRingFeedback();
  rechazadosAhora.forEach(([, p]) => notificarAutoRechazo(p));
  const nombres = rechazadosAhora
    .map(([, p]) => p.cliente?.nombre || "Cliente")
    .join(", ");
  showToast(
    rechazadosAhora.length === 1
      ? `⏱️ Pedido de ${nombres} rechazado automáticamente (${autoRejectMinutes} min sin confirmar)`
      : `⏱️ ${rechazadosAhora.length} pedidos rechazados automáticamente por tiempo`,
    true,
  );
}
setInterval(chequearAutoRechazo, 15000);

/* ══════════════ Chequeo periódico de auto-liberación de reservas ══════════════
           Revisa tanto mesas individuales reservadas como grupos reservados. Si el tiempo
           reservado_en supera autoResMinutes sin que la mesa/grupo pase a "ocupada", se
           libera automáticamente en Firestore, suena una alarma y se avisa por toast. */
async function chequearReservasVencidas() {
  if (!autoResEnabled) return;
  const limiteMs = autoResMinutes * 60000;
  const gruposVencidos = new Set();
  const mesasSueltasVencidas = [];
  const nombresVencidos = [];

  mesasMap.forEach((m, mesaDocId) => {
    if (m.estado !== "reservada") return;
    if (getPedidosDeMesa(m.numero_mesa).length > 0) return; // ya se ocupó, el snapshot lo resolverá

    if (m.grupoId) {
      if (gruposVencidos.has(m.grupoId) || autoResReleasingIds.has(m.grupoId))
        return;
      const grupo = gruposMap.get(m.grupoId);
      const fecha =
        toDate(grupo?.hora_reservada) ||
        toDate(grupo?.reservado_en) ||
        toDate(m.hora_reservada) ||
        toDate(m.reservado_en);
      if (!fecha) return;
      if (Date.now() - fecha.getTime() >= limiteMs) {
        gruposVencidos.add(m.grupoId);
        autoResReleasingIds.add(m.grupoId);
        nombresVencidos.push(m.nombre_alias || `Mesa ${m.numero_mesa}`);
      }
      return;
    }

    if (autoResReleasingIds.has(mesaDocId)) return;
    const fecha = toDate(m.reservado_en);
    if (!fecha) return;
    if (Date.now() - fecha.getTime() >= limiteMs) {
      autoResReleasingIds.add(mesaDocId);
      mesasSueltasVencidas.push([mesaDocId, m]);
      nombresVencidos.push(m.nombre_alias || `Mesa ${m.numero_mesa}`);
    }
  });

  if (!gruposVencidos.size && !mesasSueltasVencidas.length) return;

  try {
    const batch = writeBatch(db);
    mesasSueltasVencidas.forEach(([mesaDocId]) => {
      const mesaRef = tiendaSubDoc(
        localidad,
        "tiendas",
        tiendaId,
        "mesas",
        mesaDocId,
      );

      batch.set(
        mesaRef,
        { estado: "libre", reservado_en: null },
        { merge: true },
      );
    });
    gruposVencidos.forEach((grupoId) => {
      const grupo = gruposMap.get(grupoId);
      (
        grupo?.mesas ||
        [...mesasMap.entries()]
          .filter(([, m]) => m.grupoId === grupoId)
          .map(([id]) => ({ id }))
      ).forEach((m) => {
        const mesaRef = tiendaSubDoc(
          localidad,
          "tiendas",
          tiendaId,
          "mesas",
          m.id,
        );
        batch.set(
          mesaRef,
          {
            estado: "libre",
            grupoId: null,
            grupo_color: null,
            reservado_en: null,
          },
          { merge: true },
        );
      });
      batch.set(
        tiendaSubDoc(localidad, "tiendas", tiendaId, "grupos_mesas", grupoId),
        { estado: "cerrado" },
        { merge: true },
      );
    });
    await batch.commit();
  } catch (err) {
    console.error("Error liberando reservas vencidas:", err);
    mesasSueltasVencidas.forEach(([mesaDocId]) =>
      autoResReleasingIds.delete(mesaDocId),
    );
    gruposVencidos.forEach((grupoId) => autoResReleasingIds.delete(grupoId));
    return;
  }

  playAutoResAlarm();
  bellRingFeedback();
  const nombres = nombresVencidos.join(", ");
  notificarAutoLiberacionReserva(nombres);
  showToast(`🔔 Reserva vencida y quitada automáticamente: ${nombres}`, true);
}
setInterval(chequearReservasVencidas, 15000);

/* ══════════════ Render del tablero completo ══════════════ */
function renderBoard() {
  const grupos = {
    pendiente: [],
    en_proceso: [],
    en_pausa: [],
    entregado: [],
    rechazado: [],
  };

  if (originFilter === "mesa") {
    renderMesaGrid();
    document.getElementById("mesaEmptyBanner").style.display = "none";
    if (activeModalId && String(activeModalId).startsWith("mesa:")) {
      renderMesaDetail(Number(String(activeModalId).split(":")[1]));
    } else if (activeModalId) {
      if (pedidosMap.has(activeModalId)) renderDetail(activeModalId);
      else closeDetail();
    }
    // Si había un pedido resaltado por la búsqueda, lo volvemos a marcar en las
    // tarjetas recién creadas — SIN volver a hacer scroll, para no pelearle
    // el scroll al usuario en cada snapshot de Firestore.

    return;
  }

  [...pedidosMap.entries()]
    .filter(([id, p]) => pedidoVisible(id, p)) // ← aplica solo origen + mesa (la fecha ya viene filtrada de Firestore)
    .sort(
      (a, b) =>
        (toDate(b[1].timestamp)?.getTime() || 0) -
        (toDate(a[1].timestamp)?.getTime() || 0),
    )
    .forEach(([id, p]) => {
      const estado = ESTADOS.includes(p.estado) ? p.estado : "pendiente";
      grupos[estado].push([id, p]);
      // Si un pedido ya no está pendiente (o ya no existe como tal), liberamos su marca de "procesando auto-rechazo"
      if (estado !== "pendiente") autoRejectingIds.delete(id);
    });

  const totalVisible = ESTADOS.reduce((s, e) => s + grupos[e].length, 0);

  ESTADOS.forEach((estado) => {
    const body = document.getElementById(`col-${estado}`);
    if (!body) return; // por si el HTML todavía no tiene la columna de en_pausa
    const items = grupos[estado];
    const count = items.length;
    const suma = items.reduce((s, [, p]) => s + Number(p.total || 0), 0);

    const cntEl = document.getElementById(`cnt-${estado}`);
    const headCntEl = document.getElementById(`head-cnt-${estado}`);
    const moneyEl = document.getElementById(`money-${estado}`);
    const headMoneyEl = document.getElementById(`head-money-${estado}`);
    if (cntEl) cntEl.textContent = count;
    if (headCntEl) headCntEl.textContent = count;
    if (moneyEl) moneyEl.textContent = fmtMoney(suma);
    if (headMoneyEl) animateMoney(headMoneyEl, suma);
    prevMoney[estado] = suma;

    body.innerHTML = "";
    if (!count) {
      const icoMap = {
        pendiente: "🌙",
        en_proceso: "🧊",
        en_pausa: "⏸️",
        entregado: "📭",
        rechazado: "🚫",
      };
      const msgMap = {
        pendiente: "No hay pedidos pendientes",
        en_proceso: "Nada en preparación ahora mismo",
        en_pausa: "Ningún pedido en pausa",
        entregado: "Aún no hay entregas registradas",
        rechazado: "Sin pedidos rechazados",
      };
      body.innerHTML = `<div class="col-empty"><div class="ce-ico">${icoMap[estado]}</div><p>${msgMap[estado]} en este periodo</p></div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    items.forEach(([id, p]) => frag.appendChild(buildCard(id, p)));
    body.appendChild(frag);
  });

  // Banner explícito para la vista de mesas: si la mesa seleccionada (o todas, en el filtro
  // "Mesas") no tiene ningún pedido en el periodo mostrado, se avisa claramente en vez de
  // dejar las columnas vacías sin contexto.
  const banner = document.getElementById("mesaEmptyBanner");
  if (originFilter === "mesa" && totalVisible === 0) {
    const mesa =
      mesaFilter !== null
        ? [...mesasMap.values()].find((m) => m.numero_mesa === mesaFilter)
        : null;
    const nombreMesa =
      mesa?.nombre_alias || (mesaFilter !== null ? `Mesa ${mesaFilter}` : null);
    banner.textContent = nombreMesa
      ? `🪑 No hay pedidos registrados en "${nombreMesa}" durante ${labelDateFilter().toLowerCase()}.`
      : `🪑 No hay pedidos de ninguna mesa registrados durante ${labelDateFilter().toLowerCase()}.`;
    banner.style.display = "flex";
  } else {
    banner.style.display = "none";
  }

  // Si el modal de detalle está abierto y ese pedido sigue existiendo, refrescamos su contenido en vivo
  if (activeModalId) {
    if (pedidosMap.has(activeModalId)) renderDetail(activeModalId);
    else closeDetail();
  }
  if (pedidoSearchActivoId) {
    if (pedidosMap.has(pedidoSearchActivoId)) {
      resaltarPedidoEncontrado(pedidoSearchActivoId, { scroll: false });
    } else {
      pedidoSearchActivoId = null;
      limpiarResaltadoBusqueda();
      mostrarResultadoBusqueda(
        "El pedido resaltado ya no está en este periodo",
        "warn",
      );
    }
  }
}

/* ══════════════ Tabs (mobile) ══════════════ */
document.getElementById("statusTabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".stab");
  if (!tab) return;
  activeTab = tab.dataset.s;
  document
    .querySelectorAll(".stab")
    .forEach((t) => t.classList.toggle("active", t === tab));
  document
    .querySelectorAll(".board-col")
    .forEach((c) =>
      c.classList.toggle("col-active", c.dataset.status === activeTab),
    );

  // La columna "Rechazado" solo se muestra cuando se hace clic en su chip,
  // y se puede volver a ocultar haciendo clic de nuevo.
  if (tab.dataset.s === "rechazado") {
    const colRechazado = document.querySelector(
      '.board-col[data-status="rechazado"]',
    );
    colRechazado?.classList.toggle("expanded");
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
});
/* ══════════════ Tamaño de los recuadros de mesa (ajustable, se recuerda) ══════════════ */
const MESA_SIZES = {
  chico: { col: 160, h: 130 },
  mediano: { col: 210, h: 168 },
  grande: { col: 270, h: 208 },
};
let mesaSize = localStorage.getItem("geinz_mesa_size") || "mediano";

function aplicarMesaSize() {
  const cfg = MESA_SIZES[mesaSize] || MESA_SIZES.mediano;
  document.documentElement.style.setProperty("--mesa-size", cfg.col + "px");
  document.documentElement.style.setProperty("--mesa-h", cfg.h + "px");
  document.querySelectorAll("#mesaSizeCtrl .ms-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.size === mesaSize);
  });
}
aplicarMesaSize();
let resizeDebounce;
window.addEventListener("resize", () => {
  clearTimeout(resizeDebounce);
  resizeDebounce = setTimeout(() => {
    if (originFilter === "mesa") renderMesaGrid();
  }, 150);
});
document.getElementById("mesaSizeCtrl").addEventListener("click", (e) => {
  const btn = e.target.closest(".ms-btn");
  if (!btn) return;
  mesaSize = btn.dataset.size;
  localStorage.setItem("geinz_mesa_size", mesaSize);
  aplicarMesaSize();
});

/* ══════════════ Reserva/ocupación grupal de mesas ══════════════ */
function parseMesasInput() {
  if (!mesasSeleccionadas.size) return null;
  const numeros = [...mesasSeleccionadas]
    .map((mesaDocId) => mesasMap.get(mesaDocId)?.numero_mesa)
    .filter((n) => n !== undefined && n !== null);
  return numeros.length ? numeros : null;
}

function toggleSeleccionMesa(mesaDocId) {
  if (mesasSeleccionadas.has(mesaDocId)) mesasSeleccionadas.delete(mesaDocId);
  else mesasSeleccionadas.add(mesaDocId);
  renderMesaGrid();
}

/* Seleccionar/deseleccionar un grupo entero (todas sus mesas a la vez), igual que
           se seleccionan mesas individuales — así se puede agrupar, liberar o desagrupar
           varios grupos/mesas sueltas juntos desde la barra de selección. */
function toggleSeleccionGrupo(grupoId) {
  const miembros = [...mesasMap.entries()]
    .filter(([, m]) => m.grupoId === grupoId)
    .map(([id]) => id);
  if (!miembros.length) return;
  const todasSeleccionadas = miembros.every((id) => mesasSeleccionadas.has(id));
  miembros.forEach((id) => {
    if (todasSeleccionadas) mesasSeleccionadas.delete(id);
    else mesasSeleccionadas.add(id);
  });
  renderMesaGrid();
}

function limpiarSeleccionMesas() {
  mesasSeleccionadas.clear();
  renderMesaGrid();
}

function pintarBarraSeleccion() {
  const label = document.getElementById("mesasSelLabel");
  const totalEl = document.getElementById("mesasSelTotal");
  const cancelBtn = document.getElementById("mesasGrupoCancelarBtn");
  const reservarBtn = document.getElementById("mesasGrupoReservarBtn");
  const ocuparBtn = document.getElementById("mesasGrupoOcuparBtn");
  const liberarBtn = document.getElementById("mesasGrupoLiberarBtn");
  const desagruparBtn = document.getElementById("mesasGrupoDesagruparBtn");
  if (!label || !cancelBtn) return;

  const n = mesasSeleccionadas.size;
  label.textContent = n
    ? `${n} mesa${n === 1 ? "" : "s"} seleccionada${n === 1 ? "" : "s"}`
    : "Toca las mesas para seleccionarlas";
  cancelBtn.style.display = n ? "inline-flex" : "none";

  if (!n) {
    if (reservarBtn) reservarBtn.style.display = "none";
    if (ocuparBtn) ocuparBtn.style.display = "none";
    if (liberarBtn) liberarBtn.style.display = "none";
    if (desagruparBtn) desagruparBtn.style.display = "none";
    if (totalEl) totalEl.style.display = "none";
    return;
  }

  const seleccionadas = [...mesasSeleccionadas]
    .map((id) => mesasMap.get(id))
    .filter(Boolean);
  const hayReservada = seleccionadas.some((m) => m.estado === "reservada");
  const hayAgrupada = seleccionadas.some((m) => !!m.grupoId);

  if (reservarBtn) reservarBtn.style.display = "inline-flex";
  if (ocuparBtn) ocuparBtn.style.display = "inline-flex";
  if (liberarBtn)
    liberarBtn.style.display = hayReservada ? "inline-flex" : "none";
  if (desagruparBtn)
    desagruparBtn.style.display = hayAgrupada ? "inline-flex" : "none";

  let suma = 0;
  [...mesasSeleccionadas].forEach((mesaDocId) => {
    const m = mesasMap.get(mesaDocId);
    if (!m) return;
    suma += getPedidosDeMesa(m.numero_mesa).reduce(
      (s, [, p]) => s + Number(p.total || 0),
      0,
    );
  });
  if (totalEl) {
    totalEl.style.display = suma > 0 ? "inline-flex" : "none";
    totalEl.textContent = suma > 0 ? `Total: ${fmtMoney(suma)}` : "";
  }
}
async function aplicarEstadoGrupal(estadoDestino) {
  const numeros = parseMesasInput();
  if (!numeros) {
    showToast("Toca las mesas que quieres seleccionar primero", true);
    return;
  }

  const mesasEncontradas = [];
  const noEncontradas = [];
  const conPedidoActivo = [];
  if (estadoDestino === "ocupado") {
    const yaOcupadas = numeros.filter(
      (num) =>
        getPedidosDeMesa(num).length > 0 ||
        [...mesasMap.values()].find((m) => m.numero_mesa === num)?.estado ===
          "ocupado",
    );
    const nuevas = numeros.filter((num) => !yaOcupadas.includes(num));
    if (yaOcupadas.length === 1 && nuevas.length > 0) {
      await agregarMesasAGrupoExistente(yaOcupadas[0], nuevas);
      limpiarSeleccionMesas();
      return;
    }
    if (yaOcupadas.length > 1) {
      showToast(
        "Selecciona como máximo una mesa ya ocupada para agregarla a un grupo",
        true,
      );
      return;
    }
  }

  numeros.forEach((num) => {
    const entry = [...mesasMap.entries()].find(
      ([, m]) => m.numero_mesa === num,
    );
    if (!entry) {
      noEncontradas.push(num);
      return;
    }
    if (
      estadoDestino !== "libre" &&
      estadoDestino !== "desagrupar" &&
      getPedidosDeMesa(num).length > 0
    ) {
      conPedidoActivo.push(num);
      return;
    }
    mesasEncontradas.push(entry);
  });

  if (noEncontradas.length) {
    showToast(`Mesa(s) inexistente(s): ${noEncontradas.join(", ")}`, true);
    return;
  }
  if (conPedidoActivo.length) {
    showToast(
      `Mesa(s) con pedidos activos, no se pueden marcar: ${conPedidoActivo.join(", ")}`,
      true,
    );
    return;
  }

  const esGrupoReal = numeros.length > 1;

  try {
    /* ═══ LIBERAR: si alguna mesa seleccionada pertenece a un grupo activo, cerramos el grupo entero ═══ */
    if (estadoDestino === "libre") {
      const gruposAfectados = new Set();
      mesasEncontradas.forEach(([, m]) => {
        if (m.grupoId) gruposAfectados.add(m.grupoId);
      });

      const batch = writeBatch(db);
      mesasEncontradas.forEach(([mesaDocId]) => {
        const mesaRef = tiendaSubDoc(
          localidad,
          "tiendas",
          tiendaId,
          "mesas",
          mesaDocId,
        );
        batch.set(
          mesaRef,
          {
            estado: "libre",
            grupo_color: null,
            grupoId: null,
            reservado_en: null,
          },
          { merge: true },
        );
      });
      gruposAfectados.forEach((grupoId) => {
        const grupoRef = tiendaSubDoc(
          localidad,
          "tiendas",
          tiendaId,
          "grupos_mesas",
          grupoId,
        );
        batch.set(grupoRef, { estado: "cerrado" }, { merge: true });
      });
      await batch.commit();

      limpiarSeleccionMesas();
      showToast(`🔓 Mesas ${numeros.join(", ")} liberadas`);
      return;
    }

    /* ═══ DESAGRUPAR: quita el grupoId de las mesas seleccionadas y cierra sus grupos,
                       sin tocar el estado (libre/reservada) que ya tenían ═══ */
    if (estadoDestino === "desagrupar") {
      const gruposAfectados = new Set();
      mesasEncontradas.forEach(([, m]) => {
        if (m.grupoId) gruposAfectados.add(m.grupoId);
      });

      if (!gruposAfectados.size) {
        showToast("Ninguna de las mesas seleccionadas está agrupada", true);
        return;
      }

      const batch = writeBatch(db);
      mesasEncontradas.forEach(([mesaDocId, m]) => {
        if (!m.grupoId) return;
        const mesaRef = tiendaSubDoc(
          localidad,
          "tiendas",
          tiendaId,
          "mesas",
          mesaDocId,
        );
        batch.set(
          mesaRef,
          { grupoId: null, grupo_color: null },
          { merge: true },
        );
      });
      gruposAfectados.forEach((grupoId) => {
        const grupoRef = tiendaSubDoc(
          localidad,
          "tiendas",
          tiendaId,
          "grupos_mesas",
          grupoId,
        );
        batch.set(grupoRef, { estado: "cerrado" }, { merge: true });
      });
      await batch.commit();

      limpiarSeleccionMesas();
      showToast(`⇱ Mesas desagrupadas`);
      return;
    }

    let horaReservadaTs = null;
    if (estadoDestino === "reservada") {
      const horaTexto = window.prompt(
        "¿A qué hora llega el cliente? (formato 24h, ej: 14:20)",
        "",
      );
      if (horaTexto === null) return;
      const match = horaTexto.trim().match(/^(\d{1,2}):(\d{2})$/);
      if (!match) {
        showToast("Hora inválida, usa el formato HH:MM", true);
        return;
      }
      const fecha = new Date();
      fecha.setHours(Number(match[1]), Number(match[2]), 0, 0);
      if (fecha.getTime() < Date.now()) fecha.setDate(fecha.getDate() + 1);
      horaReservadaTs = Timestamp.fromDate(fecha);
    }

    /* ═══ OCUPAR o RESERVAR con 2+ mesas: crea/actualiza el grupo real que las mantiene unidas ═══ */
    if (
      (estadoDestino === "ocupado" || estadoDestino === "reservada") &&
      esGrupoReal
    ) {
      const color = colorParaEstadoGrupo(estadoDestino);
      const gruposRef = tiendaSubCol(
        localidad,
        "tiendas",
        tiendaId,
        "grupos_mesas",
      );
      const grupoId = doc(gruposRef).id;
      const mesasInfo = mesasEncontradas.map(([mesaDocId, m]) => ({
        id: mesaDocId,
        nombre: m.nombre_alias || m.mesaNombre || `Mesa ${m.numero_mesa}`,
        numero: m.numero_mesa,
      }));

      const batch = writeBatch(db);
      batch.set(doc(gruposRef, grupoId), {
        estado: estadoDestino === "ocupado" ? "activo" : "reservado",
        mesas: mesasInfo,
        pedido: null,
        pedidoGrupoDocId: null,
        reservado_en: estadoDestino === "reservada" ? serverTimestamp() : null,
        hora_reservada: estadoDestino === "reservada" ? horaReservadaTs : null,
        creado_en: serverTimestamp(),
      });
      mesasEncontradas.forEach(([mesaDocId]) => {
        const mesaRef = tiendaSubDoc(
          localidad,
          "tiendas",
          tiendaId,
          "mesas",
          mesaDocId,
        );
        batch.set(
          mesaRef,
          {
            estado: estadoDestino,
            grupo_color: color,
            grupoId,
            reservado_en:
              estadoDestino === "reservada" ? serverTimestamp() : null,
            hora_reservada:
              estadoDestino === "reservada" ? horaReservadaTs : null,
          },
          { merge: true },
        );
      });
      mesasEncontradas.forEach(([mesaDocId]) => {
        const mesaRef = tiendaSubDoc(
          localidad,
          "tiendas",
          tiendaId,
          "mesas",
          mesaDocId,
        );
        batch.set(
          mesaRef,
          {
            estado: estadoDestino,
            grupo_color: color,
            grupoId,
            reservado_en:
              estadoDestino === "reservada" ? serverTimestamp() : null,
          },
          { merge: true },
        );
      });
      await batch.commit();

      limpiarSeleccionMesas();
      showToast(
        estadoDestino === "ocupado"
          ? `🔗 Mesas ${numeros.join(", ")} unidas en un solo pedido`
          : `🔒 Mesas ${numeros.join(", ")} reservadas juntas`,
      );
      return;
    }

    /* ═══ Caso simple: reservar u ocupar UNA sola mesa (sin grupo) ═══ */
    await Promise.all(
      mesasEncontradas.map(([mesaDocId]) => {
        const mesaRef = tiendaSubDoc(
          localidad,
          "tiendas",
          tiendaId,
          "mesas",
          mesaDocId,
        );
        return updateDoc(mesaRef, {
          estado: estadoDestino,
          grupo_color: null,
          grupoId: null,
          reservado_en:
            estadoDestino === "reservada" ? serverTimestamp() : null,
          hora_reservada:
            estadoDestino === "reservada" ? horaReservadaTs : null,
        });
      }),
    );
    limpiarSeleccionMesas();
    showToast(
      `Mesas ${numeros.join(", ")} marcadas como ${estadoDestino === "ocupado" ? "ocupadas" : "reservadas"}`,
    );
  } catch (err) {
    console.error("Error aplicando estado grupal:", err);
    showToast("❌ No se pudo actualizar el grupo de mesas", true);
  }
}

async function agregarMesasAGrupoExistente(numeroMesaOcupada, numerosNuevos) {
  const entryOcupada = [...mesasMap.entries()].find(
    ([, m]) => m.numero_mesa === numeroMesaOcupada,
  );
  if (!entryOcupada) return;
  const [mesaDocOcupada, mOcupada] = entryOcupada;

  if (!mOcupada.grupoId && mOcupada.pedido) {
    showToast(
      "Esta mesa ya tiene un pedido propio; libérala o pide el pedido antes de unir mesas",
      true,
    );
    return;
  }

  const entriesNuevas = numerosNuevos
    .map((num) =>
      [...mesasMap.entries()].find(([, m]) => m.numero_mesa === num),
    )
    .filter(Boolean);
  const conPedido = entriesNuevas.filter(
    ([, m]) => getPedidosDeMesa(m.numero_mesa).length > 0,
  );
  if (conPedido.length) {
    showToast(
      "No puedes agregar una mesa que ya tiene su propio pedido activo",
      true,
    );
    return;
  }

  try {
    const batch = writeBatch(db);
    let grupoId = mOcupada.grupoId;

    if (!grupoId) {
      const gruposRef = tiendaSubCol(
        localidad,
        "tiendas",
        tiendaId,
        "grupos_mesas",
      );
      grupoId = doc(gruposRef).id;
      batch.set(doc(gruposRef, grupoId), {
        estado: "activo",
        mesas: [
          {
            id: mesaDocOcupada,
            nombre: mOcupada.nombre_alias || `Mesa ${numeroMesaOcupada}`,
            numero: numeroMesaOcupada,
          },
        ],
        pedido: null,
        pedidoGrupoDocId: null,
        creado_en: serverTimestamp(),
      });
      batch.set(
        tiendaSubDoc(localidad, "tiendas", tiendaId, "mesas", mesaDocOcupada),
        {
          grupoId,
          grupo_color: colorParaEstadoGrupo("ocupado"),
        },
        { merge: true },
      );
    }

    const mesasActuales = gruposMap.get(grupoId)?.mesas || [];
    const mesasNuevasInfo = entriesNuevas.map(([mesaDocId, m]) => ({
      id: mesaDocId,
      nombre: m.nombre_alias || `Mesa ${m.numero_mesa}`,
      numero: m.numero_mesa,
    }));
    batch.set(
      tiendaSubDoc(localidad, "tiendas", tiendaId, "grupos_mesas", grupoId),
      {
        mesas: [...mesasActuales, ...mesasNuevasInfo],
      },
      { merge: true },
    );

    entriesNuevas.forEach(([mesaDocId]) => {
      batch.set(
        tiendaSubDoc(localidad, "tiendas", tiendaId, "mesas", mesaDocId),
        {
          estado: "ocupado",
          grupoId,
          grupo_color: colorParaEstadoGrupo("ocupado"),
          reservado_en: null,
          hora_reservada: null,
        },
        { merge: true },
      );
    });

    await batch.commit();
    showToast(`🔗 Mesa(s) agregada(s) a la mesa ${numeroMesaOcupada}`);
  } catch (err) {
    console.error("Error agregando mesas al grupo:", err);
    showToast("❌ No se pudo agregar la mesa al grupo", true);
  }
}

/* ══════════════ NUEVO PEDIDO (POS directo, para negocios NO restaurante) ══════════════ */
const NuevoPedido = {
  productos: [],
  productosPorId: new Map(),
  carrito: new Map(),
  cartRowElements: new Map(),
  filtroCat: "Todos",
  filtroTexto: "",
  metodoPago: "Efectivo",
  cargado: false,
  listenersListos: false,
  cargando: false,
  PAGINA_TAM: 40,
  categorias: [],
  normalizeText(s) {
    return (s || "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  },

  cartKeyFor(id, seleccion) {
    if (!seleccion || !Object.keys(seleccion).length) return id;
    return `${id}__${Object.keys(seleccion)
      .sort()
      .map((k) => `${k}:${seleccion[k]}`)
      .join("|")}`;
  },
  calcPrecioFinal(p, seleccion) {
    let precio = Number(p.precio) || 0;
    if (!seleccion) return precio;
    (p.condiciones || []).forEach((cond) => {
      const op = cond.opciones.find((o) => o.nombre === seleccion[cond.nombre]);
      if (op?.costoAdicional) precio += op.costoAdicional;
    });
    return +precio.toFixed(2);
  },
  getStockDisponible(p, seleccion) {
    if (!seleccion || !p.condiciones?.length) {
      return typeof p.stock === "number" ? p.stock : null;
    }
    let minStock = null;
    p.condiciones.forEach((cond) => {
      const elegido = seleccion[cond.nombre];
      if (!elegido) return;
      const op = cond.opciones.find((o) => o.nombre === elegido);
      if (op && typeof op.stock === "number") {
        minStock = minStock === null ? op.stock : Math.min(minStock, op.stock);
      }
    });
    return minStock;
  },
  abrirOpciones(p, seleccionExistente = null, editKey = null) {
    this._prodOpc = p;
    this._editKey = editKey;
    this._seleccion = seleccionExistente ? { ...seleccionExistente } : {};
    p.condiciones.forEach((c) => {
      if (!this._seleccion[c.nombre])
        this._seleccion[c.nombre] = c.opciones[0].nombre;
    });
    document.getElementById("npOptProdNombre").textContent = p.nombre;
    const body = document.getElementById("npOptBody");
    body.innerHTML = p.condiciones
      .map(
        (c) => `
                    <div class="np-opt-group">
                        <div class="np-opt-label">${escapeHtml(c.nombre)}</div>
                        <div class="np-opt-row">
                            ${c.opciones
                              .map((o) => {
                                const sinStock =
                                  typeof o.stock === "number" && o.stock <= 0;
                                return `
                                <button type="button" class="np-opt-btn${this._seleccion[c.nombre] === o.nombre ? " active" : ""}"
                                    data-cond="${escapeHtml(c.nombre)}" data-op="${escapeHtml(o.nombre)}" ${sinStock ? "disabled" : ""}>
                                    ${escapeHtml(o.nombre)}${o.costoAdicional ? ` (+S/ ${o.costoAdicional.toFixed(2)})` : ""}${typeof o.stock === "number" ? ` · ${sinStock ? "Sin stock" : "Quedan " + o.stock}` : ""}
                                </button>`;
                              })
                              .join("")}
                        </div>
                    </div>`,
      )
      .join("");
    body.querySelectorAll(".np-opt-btn:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._seleccion[btn.dataset.cond] = btn.dataset.op;
        body
          .querySelectorAll(`[data-cond="${btn.dataset.cond}"]`)
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });
    document.getElementById("npOptOverlay").classList.add("show");
  },
  cerrarOpciones() {
    document.getElementById("npOptOverlay").classList.remove("show");
    this._prodOpc = null;
    this._editKey = null;
  },
  confirmarOpciones() {
    if (!this._prodOpc) return;
    const p = this._prodOpc,
      seleccion = { ...this._seleccion };
    if (this._editKey) {
      const entry = this.carrito.get(this._editKey);
      const newKey = this.cartKeyFor(p.id, seleccion);
      const existente = this.carrito.get(newKey);
      const cantidadFinal =
        (existente && newKey !== this._editKey ? existente.cantidad : 0) +
        entry.cantidad;

      const disponible = this.getStockDisponible(p, seleccion);
      if (typeof disponible === "number" && cantidadFinal > disponible) {
        showToast(
          `⚠️ No hay stock suficiente de esa variante (quedan ${disponible})`,
          true,
        );
        return;
      }

      this.carrito.delete(this._editKey);
      if (existente && newKey !== this._editKey)
        existente.cantidad += entry.cantidad;
      else
        this.carrito.set(newKey, {
          ...p,
          precio: this.calcPrecioFinal(p, seleccion),
          cantidad: entry.cantidad,
          cartKey: newKey,
          seleccion,
        });
    } else {
      this.add(p.id, seleccion);
    }
    this.cerrarOpciones();
    this.updateCardQty(p.id);
    this.renderCarrito();
  },
  mapearProducto(pDoc, categoria, d) {
    const condiciones = (d.condiciones || [])
      .map((c) => ({
        nombre: c.nombre,
        opciones: (c.opciones || [])
          .filter((o) => o.activo)
          .map((o) => ({
            nombre: o.nombre,
            costoAdicional: Number(o.costoAdicional) || 0,
            stock: typeof o.stock === "number" ? o.stock : null,
          })),
      }))
      .filter((c) => c.nombre && c.opciones.length > 0);
    return {
      id: pDoc.id,
      categoria,
      nombre: d.nombre || "Producto",
      nombreNorm: this.normalizeText(d.nombre || ""),
      precio: Number(d.precio) || 0,
      imagen: d.imagenes?.[0]?.url || "",
      stock: typeof d.stock === "number" ? d.stock : null,
      condiciones,
    };
  },

  async cargarPaginaCategoria(categoria, cursor) {
    const subRef = tiendaSubCol(
      localidad,
      "tiendas",
      tiendaId,
      "productos",
      categoria,
      categoria,
    );
    const base = cursor
      ? query(
          subRef,
          orderBy("nombre"),
          startAfter(cursor),
          limit(this.PAGINA_TAM),
        )
      : query(subRef, orderBy("nombre"), limit(this.PAGINA_TAM));
    const snap = await getDocs(base);
    const items = [];
    snap.forEach((pDoc) => {
      const d = pDoc.data();
      if (d.disponible === false) return;
      items.push(this.mapearProducto(pDoc, categoria, d));
    });
    return {
      items,
      agotada: snap.size < this.PAGINA_TAM,
      cursor: snap.docs[snap.docs.length - 1] || null,
    };
  },

  async cargarCatalogo(forceReload = false) {
    if ((this.cargado && !forceReload) || this.cargando) return;
    this.cargando = true;
    if (forceReload) {
      this.productos = [];
      this.productosPorId = new Map();
    }
    try {
      const catRef = tiendaSubCol(localidad, "tiendas", tiendaId, "productos");
      const catSnap = await getDocs(catRef);
      this.categorias = catSnap.docs.map((d) => d.id);

      // Primera página de cada categoría, en paralelo → carga rápida inicial
      const primeras = await Promise.all(
        this.categorias.map((categoria) =>
          this.cargarPaginaCategoria(categoria, null).catch((err) => {
            console.warn(`No se pudo cargar "${categoria}":`, err);
            return { items: [], agotada: true, cursor: null };
          }),
        ),
      );

      this.productos = primeras.flatMap((r) => r.items);
      this.productosPorId = new Map(this.productos.map((p) => [p.id, p]));
      this.cargado = true;
      this.renderFiltros();
      this.renderGrid();

      // El resto se sigue trayendo de fondo, sin bloquear la pantalla
      this.categorias.forEach((categoria, i) => {
        if (!primeras[i].agotada) {
          this.seguirCargandoCategoria(categoria, primeras[i].cursor);
        }
      });
    } finally {
      this.cargando = false;
    }
  },

  async seguirCargandoCategoria(categoria, cursor) {
    let agotada = false;
    while (!agotada && cursor) {
      let res;
      try {
        res = await this.cargarPaginaCategoria(categoria, cursor);
      } catch (err) {
        console.warn(`Error paginando "${categoria}":`, err);
        break;
      }
      res.items.forEach((p) => {
        if (!this.productosPorId.has(p.id)) {
          this.productos.push(p);
          this.productosPorId.set(p.id, p);
        }
      });
      if (res.items.length) this.renderGrid();
      agotada = res.agotada;
      cursor = res.cursor;
    }
  },

  async refrescar() {
    if (this.cargando) return;
    const btn = document.getElementById("npRefreshBtn");
    btn?.classList.add("spinning");
    if (btn) btn.disabled = true;
    try {
      await this.cargarCatalogo(true);
      showToast("🔄 Productos actualizados");
    } catch (err) {
      console.error("Error refrescando catálogo:", err);
      showToast("❌ No se pudo actualizar el catálogo", true);
    } finally {
      btn?.classList.remove("spinning");
      if (btn) btn.disabled = false;
    }
  },

  renderFiltros() {
    const wrap = document.getElementById("npFiltros");
    const cats = ["Todos", ...new Set(this.productos.map((p) => p.categoria))];
    wrap.innerHTML = cats
      .map(
        (c) =>
          `<div class="np-chip${c === this.filtroCat ? " active" : ""}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</div>`,
      )
      .join("");
    wrap.querySelectorAll(".np-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        this.filtroCat = chip.dataset.cat;
        this.renderFiltros();
        this.renderGrid();
      });
    });
  },

  getFiltrados() {
    let res = this.productos;
    if (this.filtroCat !== "Todos")
      res = res.filter((p) => p.categoria === this.filtroCat);
    if (this.filtroTexto)
      res = res.filter((p) => p.nombreNorm.includes(this.filtroTexto));
    return res;
  },
  updateCardQty(productId) {
    const card = document.querySelector(`.np-card[data-id="${productId}"]`);
    const holder = card?.querySelector(".np-qty-holder");
    const p = this.productosPorId.get(productId);
    if (!p || !holder) return;

    const tieneVariantes = p.condiciones?.length > 0;
    let accion, enCarrito;

    if (tieneVariantes) {
      const variantes = [...this.carrito.values()].filter(
        (it) => it.id === p.id,
      );
      const totalCant = variantes.reduce((s, v) => s + v.cantidad, 0);
      enCarrito = totalCant > 0;
      accion =
        totalCant === 0
          ? `<button class="np-add-btn" data-open-opt="${p.id}">Agregar</button>`
          : `<button class="np-add-btn" data-open-opt="${p.id}">${totalCant} en carrito · Agregar otra</button>`;
    } else {
      const cant = this.carrito.get(p.id)?.cantidad || 0;
      enCarrito = cant > 0;
      const llegoAlTope = typeof p.stock === "number" && cant >= p.stock;
      accion =
        cant === 0
          ? `<button class="np-add-btn" data-add="${p.id}">Agregar</button>`
          : `<div class="np-qty-row"><button data-minus="${p.id}">−</button><span class="np-qty-num">${cant}</span><button data-plus="${p.id}" ${llegoAlTope ? 'disabled style="opacity:.35;cursor:not-allowed;"' : ""}>+</button></div>`;
    }

    holder.innerHTML = accion;
    card.classList.toggle("in-cart", enCarrito);
    const numEl = holder.querySelector(".np-qty-num");
    if (numEl) numEl.classList.add("np-bump");
  },

  renderGrid() {
    const grid = document.getElementById("npGrid");
    const empty = document.getElementById("npEmpty");
    const filtrados = this.getFiltrados();

    if (!filtrados.length) {
      grid.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";

    grid.innerHTML = filtrados
      .map((p) => {
        const variantes = [...this.carrito.values()].filter(
          (it) => it.id === p.id,
        );
        const totalCant = variantes.reduce((s, v) => s + v.cantidad, 0);
        const tieneVariantes = p.condiciones?.length > 0;
        const imgHtml = p.imagen
          ? `<img src="${p.imagen}" alt="${escapeHtml(p.nombre)}" loading="lazy" onerror="this.parentElement.classList.add('np-noimg');this.outerHTML='<div class=&quot;np-logo-circle&quot;><img src=&quot;../img/logo geinz.png&quot; alt=&quot;&quot;></div>';">`
          : `<div class="np-logo-circle"><img src="../img/logo geinz.png" alt=""></div>`;

        // 👇 NUEVO: texto de stock disponible (solo si el producto controla stock)
        const sinStockTotal =
          typeof p.stock === "number" && p.stock <= 0 && !tieneVariantes;
        const stockHtml =
          typeof p.stock === "number" && !tieneVariantes
            ? `<div class="np-stock ${p.stock <= 0 ? "agotado" : ""}">${p.stock <= 0 ? "Sin stock" : `Quedan ${p.stock}`}</div>`
            : "";

        let accion;
        if (sinStockTotal) {
          accion = `<button class="np-add-btn" disabled style="opacity:.4;cursor:not-allowed;">Sin stock</button>`;
        } else if (tieneVariantes) {
          accion =
            totalCant === 0
              ? `<button class="np-add-btn" data-open-opt="${p.id}">Agregar</button>`
              : `<button class="np-add-btn" data-open-opt="${p.id}">${totalCant} en carrito · Agregar otra</button>`;
        } else {
          const cant = this.carrito.get(p.id)?.cantidad || 0;
          const llegoAlTope = typeof p.stock === "number" && cant >= p.stock;
          accion =
            cant === 0
              ? `<button class="np-add-btn" data-add="${p.id}">Agregar</button>`
              : `<div class="np-qty-row"><button data-minus="${p.id}">−</button><span>${cant}</span><button data-plus="${p.id}" ${llegoAlTope ? 'disabled style="opacity:.35;cursor:not-allowed;"' : ""}>+</button></div>`;
        }
        return `
<div class="np-card${sinStockTotal ? " sin-stock" : ""}" data-id="${p.id}">
    <div class="np-img-wrap${p.imagen ? "" : " np-noimg"}">${imgHtml}</div>
    <div class="np-name">${escapeHtml(p.nombre)}</div>
    <div class="np-price">${fmtMoney(p.precio)}</div>
    ${stockHtml}
    <div class="np-qty-holder">${accion}</div>
</div>`;
      })
      .join("");
  },

  add(id, seleccion = null) {
    const p = this.productosPorId.get(id);
    if (!p) return;
    if (!seleccion && p.condiciones?.length) {
      this.abrirOpciones(p);
      return;
    }
    const key = this.cartKeyFor(id, seleccion);
    const entry = this.carrito.get(key);
    const cantActual = entry?.cantidad || 0;

    // 👇 Respeta el stock de la variante elegida (o el total si no hay variante)
    const disponible = this.getStockDisponible(p, seleccion);
    if (typeof disponible === "number" && cantActual >= disponible) {
      showToast(
        `⚠️ No queda más stock${seleccion ? " de esta variante" : ""} de "${p.nombre}" (quedan ${disponible})`,
        true,
      );
      return;
    }

    if (entry) entry.cantidad += 1;
    else
      this.carrito.set(key, {
        ...p,
        precio: this.calcPrecioFinal(p, seleccion),
        cantidad: 1,
        cartKey: key,
        seleccion,
      });
    this.updateCardQty(id);
    this.renderCarrito();
  },

  remove(key) {
    const entry = this.carrito.get(key);
    if (!entry) return;
    entry.cantidad -= 1;
    const id = entry.id;
    if (entry.cantidad <= 0) this.carrito.delete(key);
    this.updateCardQty(id);
    this.renderCarrito();
  },
  addByKey(key) {
    const entry = this.carrito.get(key);
    if (!entry) return;
    const p = this.productosPorId.get(entry.id);
    const disponible = p ? this.getStockDisponible(p, entry.seleccion) : null;
    if (typeof disponible === "number" && entry.cantidad >= disponible) {
      showToast(
        `⚠️ No queda más stock${entry.seleccion ? " de esta variante" : ""} de "${entry.nombre}" (quedan ${disponible})`,
        true,
      );
      return;
    }
    entry.cantidad += 1;
    this.updateCardQty(entry.id);
    this.renderCarrito();
  },
  removeByKey(key) {
    const entry = this.carrito.get(key);
    if (!entry) return;
    entry.cantidad -= 1;
    const id = entry.id;
    if (entry.cantidad <= 0) this.carrito.delete(key);
    this.updateCardQty(id);
    this.renderCarrito();
  },

  eliminarByKey(key) {
    const entry = this.carrito.get(key);
    if (!entry) return;
    const id = entry.id;
    this.carrito.delete(key);
    this.updateCardQty(id);
    this.renderCarrito();
  },

  renderCarrito() {
    const wrap = document.getElementById("npCartItems");
    const items = [...this.carrito.values()];
    const total = items.reduce((s, i) => s + i.cantidad * i.precio, 0);

    if (!items.length) {
      this.cartRowElements.clear();
      wrap.innerHTML = `<p style="font-size:12px;color:var(--ink-faint);text-align:center;padding:20px 0;">Toca productos para agregarlos</p>`;
      document.getElementById("npCartTotal").textContent = fmtMoney(0);
      document.getElementById("npConfirmarBtn").disabled = true;
      return;
    }

    // Si el panel estaba mostrando el mensaje "vacío", lo limpiamos antes de meter filas reales
    if (!this.cartRowElements.size && wrap.querySelector("p"))
      wrap.innerHTML = "";

    // Elimina filas de líneas que ya no existen en el carrito (se quitaron por trash o llegaron a 0)
    const keysActuales = new Set(items.map((it) => it.cartKey));
    this.cartRowElements.forEach((rowEl, key) => {
      if (!keysActuales.has(key)) {
        rowEl.remove();
        this.cartRowElements.delete(key);
      }
    });

    items.forEach((it, idx) => {
      const key = it.cartKey;
      const opcTxt = it.seleccion
        ? Object.entries(it.seleccion)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ")
        : "";
      const thumb = it.imagen
        ? `<img src="${it.imagen}" alt="" onerror="this.onerror=null;this.src='../img/logo geinz.png';">`
        : `<div class="npc-thumb-ph"><img src="../img/logo geinz.png" alt="" style="width:60%;height:60%;object-fit:contain;"></div>`;

      let row = this.cartRowElements.get(key);

      if (!row) {
        // Fila nueva: se crea UNA sola vez (con su <img>). Después solo se actualiza texto/cantidad.
        row = document.createElement("div");
        row.className = "np-cart-row";
        row.innerHTML = `
        <div class="npc-thumb">${thumb}</div>
        <div class="npc-name">
            <span class="n npc-nombre">${escapeHtml(it.nombre)}</span>
            ${it.categoria ? `<span class="p npc-cat">${escapeHtml(it.categoria)}</span>` : ""}
            <span class="p npc-opciones"${opcTxt ? "" : ' style="display:none"'}>${escapeHtml(opcTxt)}</span>
            <span class="p npc-linea">${it.cantidad} × ${fmtMoney(it.precio)}</span>
        </div>
        <div class="npc-right">
            <div class="npc-icons">
                <button type="button" class="npc-ico" data-cart-plus="${key}" title="Sumar 1">+</button>
                <button type="button" class="npc-ico" data-cart-minus="${key}" title="Restar 1">−</button>
                <button type="button" class="npc-ico danger" data-cart-trash="${key}" title="Quitar del carrito">🗑</button>
            </div>
            <span class="npc-subtotal">${fmtMoney(it.cantidad * it.precio)}</span>
            ${it.seleccion ? `<button type="button" class="npc-edit" data-cart-edit="${key}" data-cart-edit-id="${it.id}" title="Cambiar opciones">✎ Editar</button>` : ""}
        </div>
      `;
        wrap.appendChild(row);
        this.cartRowElements.set(key, row);
      } else {
        // Fila ya existía: solo se actualiza texto/cantidad/subtotal, el <img> NUNCA se toca (evita el parpadeo)
        row.querySelector(".npc-linea").textContent =
          `${it.cantidad} × ${fmtMoney(it.precio)}`;
        row.querySelector(".npc-subtotal").textContent = fmtMoney(
          it.cantidad * it.precio,
        );
      }

      // Mantiene el orden del carrito igual al orden de inserción/actualización
      if (wrap.children[idx] !== row)
        wrap.insertBefore(row, wrap.children[idx] || null);
    });

    document.getElementById("npCartTotal").textContent = fmtMoney(total);
    document.getElementById("npConfirmarBtn").disabled = items.length === 0;
  },

  async verificarYDescontarStock(items) {
    const refsUnicas = new Map();
    items.forEach((it) => {
      if (!refsUnicas.has(it.id)) {
        refsUnicas.set(
          it.id,
          tiendaSubDoc(
            localidad,
            "tiendas",
            tiendaId,
            "productos",
            it.categoria,
            it.categoria,
            it.id,
          ),
        );
      }
    });

    try {
      await runTransaction(db, async (tx) => {
        const snaps = new Map();
        for (const [id, ref] of refsUnicas) {
          const snap = await tx.get(ref);
          if (snap.exists()) snaps.set(id, snap);
        }

        const actualizaciones = new Map();
        for (const it of items) {
          const snap = snaps.get(it.id);
          if (!snap) continue; // sin doc de control de stock, se deja pasar
          const d = snap.data();
          let dataNueva = actualizaciones.get(it.id) || { ...d };

          if (it.seleccion && dataNueva.condiciones) {
            const condiciones = dataNueva.condiciones.map((c) => ({
              ...c,
              opciones: c.opciones.map((o) => ({ ...o })),
            }));
            for (const cond of condiciones) {
              const elegido = it.seleccion[cond.nombre];
              if (!elegido) continue;
              const op = cond.opciones.find((o) => o.nombre === elegido);
              if (op && typeof op.stock === "number") {
                if (op.stock < it.cantidad) {
                  throw {
                    motivo: "sin_stock",
                    nombre: it.nombre,
                    disponible: op.stock,
                    detalle: elegido,
                  };
                }
                op.stock -= it.cantidad;
              }
            }
            dataNueva.condiciones = condiciones;
          }
          if (typeof dataNueva.stock === "number") {
            if (dataNueva.stock < it.cantidad) {
              throw {
                motivo: "sin_stock",
                nombre: it.nombre,
                disponible: dataNueva.stock,
              };
            }
            dataNueva.stock -= it.cantidad;
          }
          actualizaciones.set(it.id, dataNueva);
        }

        for (const [id, dataNueva] of actualizaciones) {
          tx.set(refsUnicas.get(id), dataNueva, { merge: true });
        }
      });
      return { ok: true };
    } catch (err) {
      if (err?.motivo === "sin_stock") return { ok: false, ...err };
      console.error("Error verificando stock (Nuevo pedido):", err);
      return { ok: false, motivo: "error_generico" };
    }
  },
  async confirmar() {
    const items = [...this.carrito.values()];
    if (!items.length) return;
    const nombre =
      document.getElementById("npClienteNombre").value.trim() ||
      "Cliente en mostrador";
    const total = items.reduce((s, i) => s + i.cantidad * i.precio, 0);
    const now = new Date();
    const btn = document.getElementById("npConfirmarBtn");
    btn.disabled = true;
    btn.textContent = "Verificando stock…";

    // 👉 NUEVO: valida y descuenta stock ANTES de registrar el pedido
    const stockCheck = await this.verificarYDescontarStock(items);
    if (!stockCheck.ok) {
      btn.disabled = false;
      btn.textContent = "Registrar pedido";
      showToast(
        stockCheck.motivo === "sin_stock"
          ? `⚠️ "${stockCheck.nombre}" no tiene stock suficiente (quedan ${stockCheck.disponible}${stockCheck.detalle ? " de " + stockCheck.detalle : ""})`
          : "⚠️ No se pudo verificar el stock",
        true,
      );
      return;
    }

    btn.textContent = "Registrando…";

    try {
      const pedidosRef = tiendaSubCol(
        localidad,
        "tiendas",
        tiendaId,
        "pedidos",
      );
      await addDoc(pedidosRef, {
        estado: "entregado",
        stock_descontado: true, // 👈 ya lo descontamos arriba, cambiarEstado no lo vuelve a tocar
        fecha: now.toLocaleDateString("es-PE"),
        hora: now.toLocaleTimeString("es-PE", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        timestamp: serverTimestamp(),
        cliente: { nombre, tipo_entrega: "Venta directa", direccion: "" },
        pago: { metodo: this.metodoPago, vuelto: "" },
        nota: "",
        productos: items.map((it) => ({
          id: it.id,
          nombre: it.nombre,
          categoria: it.categoria,
          precio_unitario: it.precio,
          cantidad: it.cantidad,
          subtotal: +(it.precio * it.cantidad).toFixed(2),
          imagen: it.imagen || "",
          opciones: it.seleccion || null,
        })),
        total_items: items.reduce((s, i) => s + i.cantidad, 0),
        total: +total.toFixed(2),
        negocio: { id: tiendaId, nombre: bizNombreGlobal, localidad },
      });

      this.carrito.clear();
      document.getElementById("npClienteNombre").value = "";
      this.metodoPago = "Efectivo";
      document
        .querySelectorAll("#npPagoRow .np-pago-btn")
        .forEach((b) =>
          b.classList.toggle("active", b.dataset.pago === "Efectivo"),
        );
      this.renderGrid();
      this.renderCarrito();
      showToast("✅ Pedido registrado");
    } catch (err) {
      console.error("Error registrando pedido directo:", err);
      showToast("❌ No se pudo registrar el pedido", true);
    } finally {
      btn.disabled = false;
      btn.textContent = "Registrar pedido";
    }
  },

  async init() {
    await this.cargarCatalogo();

    if (this.listenersListos) return; // evita re-registrar listeners
    this.listenersListos = true;

    document.getElementById("npSearchInput").addEventListener("input", (e) => {
      this.filtroTexto = this.normalizeText(e.target.value);
      this.renderGrid();
    });
    document
      .getElementById("npRefreshBtn")
      ?.addEventListener("click", () => this.refrescar());
    document
      .getElementById("npConfirmarBtn")
      .addEventListener("click", () => this.confirmar());
    document.querySelectorAll("#npPagoRow .np-pago-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.metodoPago = btn.dataset.pago;
        document
          .querySelectorAll("#npPagoRow .np-pago-btn")
          .forEach((b) => b.classList.toggle("active", b === btn));
      });
    });
    document.getElementById("npGrid").addEventListener("click", (e) => {
      const addBtn = e.target.closest("[data-add]");
      const plusBtn = e.target.closest("[data-plus]");
      const minusBtn = e.target.closest("[data-minus]");
      const optBtn = e.target.closest("[data-open-opt]");
      if (addBtn) this.add(addBtn.dataset.add);
      else if (plusBtn) this.add(plusBtn.dataset.plus);
      else if (minusBtn) this.remove(minusBtn.dataset.minus);
      else if (optBtn)
        this.abrirOpciones(this.productosPorId.get(optBtn.dataset.openOpt));
    });
    document.getElementById("npCartItems").addEventListener("click", (e) => {
      const plusBtn = e.target.closest("[data-cart-plus]");
      const minusBtn = e.target.closest("[data-cart-minus]");
      const trashBtn = e.target.closest("[data-cart-trash]");
      const editBtn = e.target.closest("[data-cart-edit]");
      if (plusBtn) this.addByKey(plusBtn.dataset.cartPlus);
      else if (minusBtn) this.removeByKey(minusBtn.dataset.cartMinus);
      else if (trashBtn) this.eliminarByKey(trashBtn.dataset.cartTrash);
      else if (editBtn) {
        const key = editBtn.dataset.cartEdit;
        const id = editBtn.dataset.cartEditId;
        const entry = this.carrito.get(key);
        const p = this.productosPorId.get(id);
        if (entry && p) this.abrirOpciones(p, entry.seleccion, key);
      }
    });
  },
};

document
  .getElementById("npOptClose")
  ?.addEventListener("click", () => NuevoPedido.cerrarOpciones());
document.getElementById("npOptOverlay")?.addEventListener("click", (e) => {
  if (e.target.id === "npOptOverlay") NuevoPedido.cerrarOpciones();
});
document
  .getElementById("npOptConfirm")
  ?.addEventListener("click", () => NuevoPedido.confirmarOpciones());

document
  .getElementById("mesasGrupoReservarBtn")
  ?.addEventListener("click", () => aplicarEstadoGrupal("reservada"));
document
  .getElementById("mesasGrupoOcuparBtn")
  ?.addEventListener("click", () => aplicarEstadoGrupal("ocupado"));
document
  .getElementById("mesasGrupoLiberarBtn")
  ?.addEventListener("click", () => aplicarEstadoGrupal("libre"));
document
  .getElementById("mesasGrupoDesagruparBtn")
  ?.addEventListener("click", () => aplicarEstadoGrupal("desagrupar"));
document
  .getElementById("mesasGrupoCancelarBtn")
  ?.addEventListener("click", limpiarSeleccionMesas);
/* ══════════════ Loader ══════════════ */
function hideLoader() {
  const loader = document.getElementById("pageLoader");
  if (!loader) return;
  loader.classList.add("leaving");
  setTimeout(() => loader.remove(), 450);
}

/* ══════════════ Listener de mesas (independiente del de pedidos) ══════════════
           /Tiendas/{localidad}/{localidad}/{tiendaId}/mesas/{mesa_N}
           Este listener alimenta la franja de mesas y el badge de cada tarjeta/detalle;
           no toca ni depende del listener de "pedidos". Se suscribe una sola vez. */
let mesasListenerIniciado = false;
let mesasFirstSnapshot = true;
const mesaPedidoSignatures = new Map(); // mesaDocId -> firma del último pedido ya notificado

function firmaPedidoMesa(pedido) {
  return `${pedido?.hora || ""}|${pedido?.total_items || 0}|${pedido?.total || 0}`;
}

function iniciarListenerMesas() {
  if (!tiendaId || mesasListenerIniciado) return;
  mesasListenerIniciado = true;
  const mesasRef = tiendaSubCol(localidad, "tiendas", tiendaId, "mesas");
  const q = query(mesasRef, orderBy("numero_mesa"));
  onSnapshot(
    q,
    (snap) => {
      const nuevosPedidosMesa = [];

      snap.forEach((d) => {
        const data = d.data();
        mesasMap.set(d.id, data);

        if (data.estado === "ocupado" && data.pedido) {
          const firma = firmaPedidoMesa(data.pedido);
          const firmaAnterior = mesaPedidoSignatures.get(d.id);
          if (!mesasFirstSnapshot && firma !== firmaAnterior) {
            nuevosPedidosMesa.push({ mesaId: d.id, data });
          }
          mesaPedidoSignatures.set(d.id, firma);
        } else {
          mesaPedidoSignatures.delete(d.id);
        }
      });

      mesasFirstSnapshot = false;

      if (originFilter === "mesa") renderMesaGrid();
      if (activeModalId && String(activeModalId).startsWith("mesa:")) {
        renderMesaDetail(Number(String(activeModalId).split(":")[1]));
      }

      if (nuevosPedidosMesa.length) {
        playMesaChime();
        bellRingFeedback();
        nuevosPedidosMesa.forEach(({ data }) => {
          const nombreMesa = data.mesaNombre || `Mesa ${data.mesaNumero ?? ""}`;
          notificarPedidoMesa(nombreMesa, data.pedido);
        });
        const nombres = nuevosPedidosMesa
          .map(({ data }) => data.mesaNombre || `Mesa ${data.mesaNumero ?? ""}`)
          .join(", ");
        showToast(
          nuevosPedidosMesa.length === 1
            ? `🍽️ Pedido nuevo en ${nombres}`
            : `🍽️ Pedidos nuevos en ${nombres}`,
        );
        window.parent.postMessage(
          { type: "NUEVO_PEDIDO_VIVO" },
          window.location.origin,
        );
      }
    },
    (err) => console.warn("No se pudieron cargar las mesas:", err),
  );
}
/* ══════════════ Listener en vivo de pedidos (acotado por fecha en el servidor) ══════════════
           CLAVE PARA ESCALABILIDAD: la query incluye where("timestamp", ">=", from) y
           where("timestamp", "<=", to) según el filtro de fecha activo. Así, sin importar
           si la colección "pedidos" acumula 500 o 50,000 documentos históricos, Firestore
           solo transmite (y cobra) los que caen dentro del periodo visible en pantalla.
           Cada vez que el usuario cambia el filtro de fecha, cerramos la suscripción
           anterior (unsubscribe) y abrimos una nueva con el rango correspondiente. */
let unsubscribePedidos = null;

function suscribirPedidos() {
  if (!tiendaId) return;

  if (typeof unsubscribePedidos === "function") {
    unsubscribePedidos();
    unsubscribePedidos = null;
  }

  const [from, to] = getDateFilterRange();
  const pedidosRef = tiendaSubCol(localidad, "tiendas", tiendaId, "pedidos");
  const q = query(
    pedidosRef,
    where("timestamp", ">=", Timestamp.fromDate(from)),
    where("timestamp", "<=", Timestamp.fromDate(to)),
    orderBy("timestamp", "desc"),
  );

  unsubscribePedidos = onSnapshot(
    q,
    (snap) => {
      // Primera carga de este rango: solo llenamos el mapa, sin disparar
      // notificaciones de pedidos "nuevos" (evita spam de sonido al cambiar de fecha).
      if (isFirstSnapshot) {
        pedidosMap.clear();
        snap.forEach((d) => pedidosMap.set(d.id, d.data()));
        isFirstSnapshot = false;
        renderBoard();
        hideLoader();
        chequearAutoRechazo();
        precargarSeguidores();
        return;
      }
      const nuevosPendientes = [];
      const respuestasClienteNuevas = []; // cliente respondió y sigue en pausa
      const canceladosPorClienteEnPausa = []; // canceló estando en pausa
      const canceladosPorClientePendiente = []; // canceló estando pendiente (sin pasar por pausa)

      snap.docChanges().forEach((change) => {
        const id = change.doc.id;
        const data = change.doc.data();
        const estadoNuevo = ESTADOS.includes(data.estado)
          ? data.estado
          : "pendiente";

        if (change.type === "added") {
          if (
            estadoNuevo === "pendiente" &&
            getOrigen(data).tipo === "whatsapp"
          )
            nuevosPendientes.push({ id, data });
              } else if (change.type === "modified") {
       const anterior = pedidosMap.get(id);
          const estadoAnterior = anterior
            ? ESTADOS.includes(anterior.estado)
              ? anterior.estado
              : "pendiente"
            : null;

          // El pedido dejó de estar "pendiente" (lo aceptó/pausó/rechazó el negocio,
          // o lo canceló el cliente desde su seguimiento) → se corta su alarma ya mismo
          if (estadoAnterior === "pendiente" && estadoNuevo !== "pendiente") {
            detenerSoundLoopParaPedido(id);
          }

          // El cliente respondió (reemplazo / sin producto) mientras el pedido sigue en pausa
          // El cliente respondió (reemplazo / sin producto) mientras el pedido sigue en pausa
          const respAnterior = anterior?.respuesta_cliente;
          const respNueva = data.respuesta_cliente;
          if (
            estadoNuevo === "en_pausa" &&
            respNueva &&
            !respAnterior &&
            respNueva.accion !== "cancelado"
          ) {
            respuestasClienteNuevas.push({ id, data });
          }

          // El cliente canceló su propio pedido desde el seguimiento
                  // El cliente canceló su propio pedido desde el seguimiento.
          // Si venía de "en_pausa" suena una alarma; si canceló estando
          // pendiente (sin llegar a pausa), suena una alarma distinta.
          if (
            estadoNuevo === "rechazado" &&
            data.cancelado_por_cliente === true &&
            estadoAnterior !== "rechazado"
          ) {
            if (estadoAnterior === "en_pausa") {
              canceladosPorClienteEnPausa.push({ id, data });
            } else {
              canceladosPorClientePendiente.push({ id, data });
            }
          }
          if (
            estadoNuevo === "pendiente" &&
            estadoAnterior !== "pendiente" &&
            getOrigen(data).tipo === "whatsapp"
          )
            nuevosPendientes.push({ id, data });
        }

         if (change.type === "removed") {
          pedidosMap.delete(id);
          autoRejectingIds.delete(id);
          detenerSoundLoopParaPedido(id);
        } else pedidosMap.set(id, data);
      });

      precargarSeguidores();
      renderBoard();
      if (nuevosPendientes.length) {
        nuevosPendientes.forEach(({ id, data }) => playChime(id, data));
        bellRingFeedback();
        nuevosPendientes.forEach(({ data }) => notificarPedidoNuevo(data));
        const nombres = nuevosPendientes
          .map(({ data }) => data.cliente?.nombre || "Cliente")
          .join(", ");
        showToast(
          nuevosPendientes.length === 1
            ? `🛎️ Nuevo pedido de ${nombres}`
            : `🛎️ ${nuevosPendientes.length} pedidos nuevos`,
        );

        if (nuevosPendientes.length && originFilter === "mesa") {
          whatsappUnseen += nuevosPendientes.length;
          actualizarBadgeWhatsapp();
        }
        // 👇 nuevo: avisa al panel padre para el punto rojo del sidebar
        window.parent.postMessage(
          { type: "NUEVO_PEDIDO_VIVO" },
          window.location.origin,
        );
      }
      if (respuestasClienteNuevas.length) {
        playRespuestaClienteAlarm();
        bellRingFeedback();
        respuestasClienteNuevas.forEach(({ data }) =>
          notificarRespuestaCliente(data),
        );
        const nombresResp = respuestasClienteNuevas
          .map(({ data }) => data.cliente?.nombre || "Cliente")
          .join(", ");
        showToast(
          respuestasClienteNuevas.length === 1
            ? `💬 ${nombresResp} respondió su pedido en pausa`
            : `💬 ${respuestasClienteNuevas.length} clientes respondieron sus pedidos en pausa`,
        );
      }

        if (canceladosPorClienteEnPausa.length) {
        playCanceladoPorClienteAlarm();
        bellRingFeedback();
        canceladosPorClienteEnPausa.forEach(({ data }) =>
          notificarPedidoCanceladoPorCliente(data),
        );
        const nombresCancel = canceladosPorClienteEnPausa
          .map(({ data }) => data.cliente?.nombre || "Cliente")
          .join(", ");
        showToast(
          canceladosPorClienteEnPausa.length === 1
            ? `🚫 ${nombresCancel} canceló su pedido`
            : `🚫 ${canceladosPorClienteEnPausa.length} clientes cancelaron su pedido`,
          true,
        );
      }

      if (canceladosPorClientePendiente.length) {
        playClienteCanceloPedidoAlarm();
        bellRingFeedback();
        canceladosPorClientePendiente.forEach(({ data }) =>
          notificarPedidoCanceladoPorCliente(data),
        );
        const nombresCancelPend = canceladosPorClientePendiente
          .map(({ data }) => data.cliente?.nombre || "Cliente")
          .join(", ");
        showToast(
          canceladosPorClientePendiente.length === 1
            ? `🚫 ${nombresCancelPend} canceló su pedido`
            : `🚫 ${canceladosPorClientePendiente.length} clientes cancelaron su pedido`,
          true,
        );
      }
      hideLoader();
    },
    (err) => {
      console.error("Error escuchando pedidos:", err);
      showToast("⚠️ Conexión interrumpida, reintentando…", true);
      hideLoader();
    },
  );
}

let gruposListenerIniciado = false;
function iniciarListenerGrupos() {
  if (!tiendaId || gruposListenerIniciado) return;
  gruposListenerIniciado = true;
  const gruposRef = tiendaSubCol(
    localidad,
    "tiendas",
    tiendaId,
    "grupos_mesas",
  );
  onSnapshot(
    gruposRef,
    (snap) => {
      gruposMap.clear();
      snap.forEach((d) => gruposMap.set(d.id, { id: d.id, ...d.data() }));
      if (originFilter === "mesa") renderMesaGrid();
      if (activeModalId && String(activeModalId).startsWith("mesa:")) {
        renderMesaDetail(Number(String(activeModalId).split(":")[1]));
      }
    },
    (err) => console.warn("No se pudieron cargar los grupos de mesas:", err),
  );
}

async function aplicarVisibilidadPorCategoriaPedidos() {
  let categoria = sessionStorage.getItem("categoriaTienda") || null;
  let modeloNegocio = sessionStorage.getItem("modeloNegocio");

  if (!categoria || modeloNegocio === null) {
    try {
      const snap = await getDoc(tiendaDoc(localidad, "tiendas", tiendaId));
      if (snap.exists()) {
        const data = snap.data();
        categoria = categoria || data.categoria_tienda || null;
        modeloNegocio = data.modelo_negocio;
        sessionStorage.setItem("categoriaTienda", categoria || "");
        sessionStorage.setItem("modeloNegocio", String(!!modeloNegocio));
      }
    } catch (err) {
      console.error("No se pudo obtener la categoría de la tienda.", err);
    }
  } else {
    modeloNegocio = modeloNegocio === "true"; // sessionStorage guarda strings
  }

  const esRestaurante =
    (categoria || "")
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase() === "comida y restaurantes";

  // Mesas solo se muestran si es restaurante Y tiene local físico
  const debeMostrarMesas = esRestaurante && modeloNegocio === true;

  if (debeMostrarMesas) return;

  // Oculta chip "Mesas" y reemplaza por "Nuevo pedido"
  const chipMesas = document.querySelector('.origin-chip[data-origin="mesa"]');
  if (chipMesas) chipMesas.remove();
  if (autoresBtn) autoresBtn.style.display = "none";

  const chipDirecto = document.createElement("div");
  chipDirecto.className = "origin-chip";
  chipDirecto.dataset.origin = "directo";
  chipDirecto.textContent = "🧾 Nuevo pedido";
  originBar.appendChild(chipDirecto);

  chipDirecto.addEventListener("click", async () => {
    originFilter = "directo";
    originBar
      .querySelectorAll(".origin-chip")
      .forEach((c) => c.classList.toggle("active", c === chipDirecto));
    document.getElementById("board").style.display = "none";
    document.getElementById("statusTabs").style.display = "none";
    mesasStripWrap.style.display = "none";
    document.getElementById("nuevoPedidoWrap").style.display = "flex";
    await NuevoPedido.init();
  });

  document
    .querySelector('.origin-chip[data-origin="whatsapp"]')
    ?.addEventListener("click", () => {
      document.getElementById("nuevoPedidoWrap").style.display = "none";
      document.getElementById("board").style.display = "flex";
      document.getElementById("statusTabs").style.display = "flex";
    });
}

function iniciarListener() {
  if (!tiendaId) return;
  iniciarListenerMesas();
  iniciarListenerGrupos();
  suscribirPedidos();
}

/* ══════════════ Refresco periódico del filtro "Hoy" ══════════════
           Si el filtro activo es "Hoy" o "Esta semana" y el reloj cruza la medianoche
           mientras la pantalla sigue abierta, este intervalo vuelve a evaluar el rango
           y re-suscribe la query SOLO cuando el día realmente cambió — nunca en cada
           tick — para no vaciar y reconstruir el tablero completo cada minuto. */
let ultimoDiaControlado = new Date().toDateString();
setInterval(() => {
  const diaActual = new Date().toDateString();
  if (diaActual === ultimoDiaControlado) return; // sigue siendo el mismo día: no hacer nada
  ultimoDiaControlado = diaActual;
  // NOTA: si en tu proyecto tienes un selector real de "dateFilter" (Hoy / Ayer / etc),
  // reemplaza esta condición por la variable real que uses para ese filtro.
  pedidosMap.clear();
  isFirstSnapshot = true;
  suscribirPedidos();
}, 60000);

/* ══════════════ Arranque: URL → mensaje del panel → ID de prueba ══════════════ */
if (tiendaId) {
  cargarNegocio()
    .then(() => aplicarVisibilidadPorCategoriaPedidos())
    .finally(() => iniciarListener());
} else {
  let resuelto = false;
  window.addEventListener("message", (e) => {
    const d = e.data;
    if (d && d.type === "DATOS_TIENDA" && d.id && !resuelto) {
      resuelto = true;
      tiendaId = d.id;
      localidad = (d.localidad || localidad).toLowerCase();
      cargarNegocio()
        .then(() => aplicarVisibilidadPorCategoriaPedidos())
        .finally(() => iniciarListener());
    }
  });
  setTimeout(() => {
    if (!resuelto) {
      resuelto = true;
      tiendaId = ID_PRUEBA;
      cargarNegocio()
        .then(() => aplicarVisibilidadPorCategoriaPedidos())
        .finally(() => iniciarListener());
    }
  }, 900);
}
