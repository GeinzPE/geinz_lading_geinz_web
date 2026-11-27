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
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { iniciarCamara } from "./scan_camara.js";
import {
  htmlRecuadroSunat,
  enlazarCopiar,
  elegirFoto,
  esc as escCm,
} from "./comprobante_mesa.js";
import { db } from "../db/db.js";
import {
  cachearConfigComprobante,
  prepararCfgComprobante,
  imprimirComprobante,
  registrarComprobante,
} from "./comprobantes.js";
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
const PLAN_PED = {
  tiempos: true,
  estados: true,
  autoOff: true,
  autoReserva: true,
  deliveryCfg: true,
  repartidores: true,
  maxRepartidores: 5,
  carrito: true,
  mesa: true,
  nuevoPedido: true,
  mozos: true,
  configMesas: true,
  camara: true,
  celular: true,
};
const URL_NOTIFICAR_CLIENTE =
  " https://enviar-notificacion-con-solo-id-desde-la-web-oixttik5rq-uc.a.run.app";
// Usuario logueado en inicio.js: se guarda en cada venta
function datosVendedor() {
  try {
    const raw =
      sessionStorage.getItem("rolActivo") ||
      localStorage.getItem("rolActivo_pwa");
    const r = raw ? JSON.parse(raw) : null;
    if (!r?.nombre) return {};
    return {
      vendedor: {
        id: r.roleId || null,
        nombre: r.nombre,
        usuario: r.usuario || "",
        esAdmin: !!r.esAdmin,
      },
    };
  } catch {
    return {};
  }
}
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
const SND_CLIENTE_EN_LOCAL = "../../sounds/cliente_local.mp3"; // ← pon aquí el nombre real de tu mp3
const SND_NUEVO_PEDIDO_DELIVERY = "../../sounds/nuevo_pedido_delivery.mp3";
const SND_NUEVO_PEDIDO_RECOJO = "../../sounds/nuevo_pedido_presencial.mp3";
const ID_PRUEBA = tiendaId;
const PREFIJO_PEDIDO_MESA_URL = "../../sounds/prefijos/mozo_prefijo.mp3"; // ← confírmame el nombre exacto

const RESERVA_PREFIJO_URL = "../../sounds/prefijos/reserva_prefijo.mp3";
const RESERVA_Y_URL = "../../sounds/y.mp3";
const SND_PAGO_RECIBIDO = "../../sounds/comprovante_de_pago_recibido.mp3";
const voucherNotificados = new Set();

const SND_PAGO_EXTRA = "../../sounds/nuevo_comprovante_de_pago_recivido.mp3";
const SND_DELIVERY_ACEPTADO = "../../sounds/cliente_acepto_precio_de_envio.mp3";
function playPagoExtraAlarm() {
  playSoundOnce(SND_PAGO_EXTRA);
}
function playDeliveryAceptadoAlarm() {
  playSoundOnce(SND_DELIVERY_ACEPTADO);
}
function playPagoRecibidoAlarm() {
  playSoundOnce(SND_PAGO_RECIBIDO);
}
function urlAudioMesa(numero) {
  return `../../sounds/mesas/mesa${numero}.mp3`;
}
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
.mesa-box.pedido_pendiente{
  border-color:#fbbf24 !important;
  background:rgba(251,191,36,.14);
  animation: mesa-pedido-pulse 1.1s ease-in-out infinite;
}
.mesa-box.pedido_pendiente .mb-status{color:#fbbf24;}
.mesa-box.pedido_pendiente .mb-status .dot{background:#fbbf24;}
@keyframes mesa-pedido-pulse{
  0%,100%{box-shadow:0 0 0 0 rgba(251,191,36,.45);}
  50%{box-shadow:0 0 0 10px rgba(251,191,36,0);}
}
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
        .mesa-box.al-cuenta{border-color:#f87171 !important;background:rgba(248,113,113,.16);--pc:248,113,113;animation:mesa-al 1s ease-in-out infinite;}
.mesa-box.al-ayuda{border-color:#fb923c !important;background:rgba(251,146,60,.16);--pc:251,146,60;animation:mesa-al 1s ease-in-out infinite;}
.mesa-box.al-mozo{border-color:#38bdf8 !important;background:rgba(56,189,248,.10);border-style:dashed;}
.mesa-box.al-listo{border-color:#a78bfa !important;background:rgba(167,139,250,.16);--pc:167,139,250;animation:mesa-al 1.6s ease-in-out infinite;}
@keyframes mesa-al{0%,100%{box-shadow:0 0 0 0 rgba(var(--pc),.5);}50%{box-shadow:0 0 0 10px rgba(var(--pc),0);}}
.mesa-alerta-badge{display:inline-block;margin-top:4px;font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.1);}
.mesa-alerta-badge.cuenta{color:#f87171;} .mesa-alerta-badge.ayuda{color:#fb923c;}
.mesa-alerta-badge.mozo{color:#38bdf8;} .mesa-alerta-badge.listo{color:#a78bfa;}
        `;
const NP_UI_CSS = `
.np-search-wrap{display:flex;gap:8px;align-items:center;margin-bottom:12px;}
.np-search-wrap .np-search-box{flex:1;display:flex;align-items:center;gap:8px;height:44px;padding:0 12px;border-radius:12px;background:var(--bg,#0a0a0f);border:1px solid var(--line);transition:border-color .2s,box-shadow .2s;}
.np-search-wrap .np-search-box:focus-within{border-color:#7c5cff;box-shadow:0 0 0 3px rgba(124,92,255,.18);}
.np-search-wrap .np-search-box input{flex:1;min-width:0;width:auto;margin:0;padding:0;border:none;outline:none;background:transparent;color:#fff;font-size:13.5px;}
.np-search-ico{opacity:.55;font-size:14px;}
.np-search-clear{width:22px;height:22px;border-radius:50%;border:none;background:var(--line);color:#fff;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.np-tool-btn{width:44px;height:44px;flex-shrink:0;border-radius:12px;border:1px solid var(--line);background:var(--bg,#0a0a0f);font-size:17px;cursor:pointer;color:#fff;transition:border-color .2s,background .2s;}
.np-tool-btn:hover{border-color:#7c5cff;background:rgba(124,92,255,.12);}
.np-tool-btn.on{border-color:#22c55e;background:rgba(34,197,94,.12);}

.np-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;max-height:calc(100vh - 250px);padding-right:4px;scrollbar-width:thin;}
.np-card{cursor:pointer;padding:0;gap:0;overflow:hidden;position:relative;transition:transform .15s ease,border-color .2s,box-shadow .2s;}
.np-card:hover{transform:translateY(-2px);border-color:rgba(124,92,255,.55);}
.np-card:active{transform:scale(.98);}
.np-card .np-img-wrap{border-radius:0;}
.np-card .np-name{margin-top:10px;padding:0 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.np-card .np-price{margin-top:2px;padding:0 10px 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.np-badge{position:absolute;top:8px;right:8px;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#7c5cff;color:#fff;font-size:11.5px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.4);}
.np-tag-agotado{position:absolute;left:8px;top:8px;padding:3px 8px;border-radius:999px;background:rgba(248,113,113,.9);color:#fff;font-size:10px;font-weight:800;}

.np-det-modal{width:400px;position:relative;padding:0;overflow:hidden;}
.np-det-x{position:absolute;top:10px;right:10px;z-index:2;width:32px;height:32px;border-radius:50%;border:none;background:rgba(0,0,0,.6);color:#fff;cursor:pointer;}
.np-det-img{width:100%;aspect-ratio:4/3;background:#1a1a20;display:flex;align-items:center;justify-content:center;overflow:hidden;}
.np-det-img>img{width:100%;height:100%;object-fit:cover;}
#npDetBody{padding:0;}
.np-det-info{padding:16px;}
.np-det-cat{font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#7c5cff;}
.np-det-name{font-size:17px;font-weight:800;margin:4px 0;line-height:1.25;}
.np-det-price{font-size:18px;font-weight:800;color:#a78bfa;margin-bottom:8px;}
.np-det-desc{font-size:12.5px;color:var(--ink-dim);line-height:1.5;margin-bottom:10px;}
.np-det-meta{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;}
.np-det-chip{font-size:11px;font-weight:700;padding:4px 9px;border-radius:999px;border:1px solid var(--line);color:var(--ink-dim);}
.np-det-chip.bad{color:#f87171;border-color:rgba(248,113,113,.4);}
.np-det-chip.ok{color:#4ade80;border-color:rgba(74,222,128,.4);}
.np-det-chip.mono{font-family:monospace;}
.np-det-actions{display:flex;gap:10px;align-items:center;}
.np-det-step{display:flex;align-items:center;gap:4px;border:1px solid var(--line);border-radius:12px;padding:3px;}
.np-det-step button{width:34px;height:34px;border-radius:9px;border:none;background:var(--surface);color:#fff;font-size:16px;font-weight:900;cursor:pointer;}
.np-det-step button:disabled{opacity:.35;cursor:not-allowed;}
.np-det-step span{min-width:26px;text-align:center;font-weight:800;}
.np-det-actions .np-confirmar-btn{flex:1;}

.np-cam-box{width:min(480px,94vw);}
.np-cam-wrap{position:relative;border-radius:14px;overflow:hidden;background:#000;aspect-ratio:4/3;}
.np-cam-wrap video{width:100%;height:100%;object-fit:cover;}
.np-cam-line{position:absolute;left:12%;right:12%;top:50%;height:2px;background:#f87171;box-shadow:0 0 12px #f87171;animation:np-scan 1.6s ease-in-out infinite;}
@keyframes np-scan{0%,100%{transform:translateY(-50px)}50%{transform:translateY(50px)}}
.np-cam-hint{font-size:12px;color:var(--ink-dim);text-align:center;margin-top:10px;}

.np-pair-box{width:min(380px,94vw);text-align:center;}
.np-pair-qr{width:220px;height:220px;border-radius:14px;background:#fff;padding:8px;margin:4px auto 10px;display:block;}
.np-pair-steps{font-size:12px;color:var(--ink-dim);line-height:1.5;margin-bottom:10px;text-align:left;}
.np-pair-pin-lbl{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-dim);}
.np-pair-pin{font-family:monospace;font-size:30px;font-weight:800;letter-spacing:.25em;color:#a78bfa;margin:2px 0 10px;}
.np-pair-estado{font-size:12.5px;font-weight:700;padding:8px;border-radius:10px;background:rgba(251,191,36,.1);color:#fbbf24;margin-bottom:10px;}
.np-pair-estado.ok{background:rgba(34,197,94,.12);color:#4ade80;}
/* ── Layout del panel: que la grilla tenga scroll propio ── */
.nuevo-pedido-wrap{
  display:flex;
  flex-wrap:nowrap !important;   /* ← LA CLAVE: sin wrap, el alto queda fijo al espacio disponible */
  gap:14px;
  padding:14px;
  flex:1 1 0;
  min-height:0;
  overflow:hidden;
  align-items:stretch;
}
.np-panel{ overflow:hidden; }
.np-cart-panel{ align-self:stretch; height:auto !important; }
.np-panel{
  flex:2;
  min-width:0;
  min-height:0;
  display:flex;
  flex-direction:column;       /* buscador + chips arriba, grilla abajo */
}
.np-search-wrap,
.np-filtros{ flex-shrink:0; }

.np-grid{
  flex:1;                       /* ocupa todo el espacio que sobra */
  min-height:0;                 /* clave para que el overflow funcione en flex */
  max-height:none;              /* quita el límite viejo */
  overflow-y:auto;              /* ← el scroll vertical */
  overflow-x:hidden;
  align-content:start;
  padding:2px 6px 16px 2px;
  scrollbar-width:thin;
  scrollbar-color:rgba(124,92,255,.5) transparent;
}
.np-grid::-webkit-scrollbar{ width:8px; }
.np-grid::-webkit-scrollbar-thumb{ background:rgba(124,92,255,.45); border-radius:8px; }
.np-grid::-webkit-scrollbar-track{ background:transparent; }

/* Carrito: también con alto propio y scroll interno en los items */
.np-cart-panel{
  max-height:none;
  min-height:0;
  height:100%;
}
.np-cart-items{ min-height:0; overflow-y:auto; }

/* Celular: apilado, scroll normal de la página */
@media (max-width:820px){
  .nuevo-pedido-wrap{ flex-direction:column; height:auto; flex:none; overflow:visible; }
  .np-panel{ flex:none; }
  .np-grid{ max-height:70vh; }
  .np-cart-panel{ height:auto; }
}
  /* Scroll invisible (se puede seguir deslizando con rueda, touch o trackpad) */
.np-grid,
.np-cart-items,
.np-filtros{
  scrollbar-width:none;
  -ms-overflow-style:none;
}
.np-grid::-webkit-scrollbar,
.np-cart-items::-webkit-scrollbar,
.np-filtros::-webkit-scrollbar{
  display:none;
  width:0;
  height:0;
}
  /* ── Barra de progreso ── */
.np-progress{
  flex-shrink:0;
  height:4px;
  border-radius:999px;
  background:rgba(255,255,255,.06);
  overflow:hidden;
  margin:-4px 0 10px;
  opacity:0;
  transition:opacity .25s ease;
}
.np-progress.show{opacity:1;}
.np-progress-bar{
  height:100%;
  width:0%;
  border-radius:999px;
  background:linear-gradient(90deg,#7c5cff,#a78bfa);
  box-shadow:0 0 10px rgba(124,92,255,.6);
  transition:width .35s ease;
}
.np-progress.indeterminate .np-progress-bar{
  width:35%;
  animation:np-indet 1.1s ease-in-out infinite;
}
@keyframes np-indet{
  0%{transform:translateX(-100%);}
  100%{transform:translateX(300%);}
}
.np-progress-txt{
  flex-shrink:0;
  font-size:11.5px;
  font-weight:700;
  color:var(--ink-dim);
  margin:-4px 0 8px;
  min-height:0;
}
.np-progress-txt:empty{display:none;}

/* ── Skeletons (tarjetas "fantasma" mientras carga) ── */
.np-skel{
  border-radius:12px;
  border:1px solid var(--line);
  overflow:hidden;
  background:var(--bg,#0a0a0f);
}
.np-skel .s-img{aspect-ratio:1;}
.np-skel .s-line{height:10px;border-radius:6px;margin:10px 10px 0;}
.np-skel .s-line.short{width:50%;margin-bottom:12px;}
.np-skel .s-img,.np-skel .s-line{
  background:linear-gradient(90deg,rgba(255,255,255,.04) 25%,rgba(255,255,255,.11) 50%,rgba(255,255,255,.04) 75%);
  background-size:200% 100%;
  animation:np-shimmer 1.2s linear infinite;
}
@keyframes np-shimmer{
  0%{background-position:200% 0;}
  100%{background-position:-200% 0;}
}
  /* Las tarjetas NO se encogen: la grilla hace scroll en vez de aplastarlas */
.np-grid{
  grid-auto-rows:max-content !important;
  align-content:start !important;
}
.np-card{
  flex-shrink:0;
  height:max-content;
  min-height:max-content;
}
.np-card .np-img-wrap{
  flex-shrink:0;
  aspect-ratio:1/1;
  height:auto;
}
.np-card .np-name,
.np-card .np-price{
  flex-shrink:0;
}
  .np-det-modal{width:min(480px,94vw);max-height:92vh;overflow-y:auto;scrollbar-width:none;}
.np-det-modal::-webkit-scrollbar{display:none;}
.np-det-img.compact{aspect-ratio:16/9;max-height:28vh;}

#npDetVars{margin:4px 0 14px;}
.np-var-group{margin-bottom:14px;}
.np-var-title{font-size:13px;font-weight:800;margin-bottom:8px;display:flex;align-items:baseline;gap:8px;}
.np-var-title small{font-size:10.5px;font-weight:700;color:var(--ink-dim);text-transform:uppercase;letter-spacing:.04em;}
.np-var-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;}

.np-var-btn{
  min-height:58px;padding:8px 12px;border-radius:14px;
  border:2px solid var(--line);background:var(--bg,#0a0a0f);color:#fff;
  font-size:15px;font-weight:800;cursor:pointer;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  transition:transform .1s ease,border-color .15s,background .15s;
  -webkit-tap-highlight-color:transparent;touch-action:manipulation;
}
.np-var-btn:active{transform:scale(.96);}
.np-var-btn em{font-style:normal;font-size:12px;color:#a78bfa;font-weight:700;}
.np-var-btn small{font-size:10.5px;color:var(--ink-dim);font-weight:600;}
.np-var-btn.active{background:#7c5cff;border-color:#a78bfa;box-shadow:0 0 0 3px rgba(124,92,255,.25);}
.np-var-btn.active em,.np-var-btn.active small{color:#fff;}

.np-var-qty{
  grid-column:1 / -1;display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:10px 12px;border-radius:14px;border:2px solid var(--line);background:var(--bg,#0a0a0f);
}
.np-var-qty.active{border-color:#7c5cff;background:rgba(124,92,255,.12);}
.np-var-qty-info b{display:block;font-size:14.5px;}
.np-var-qty-info small{font-size:11px;color:var(--ink-dim);}
.np-var-qty-ctrl{display:flex;align-items:center;gap:10px;}
.np-var-qty-ctrl span{min-width:26px;text-align:center;font-size:18px;font-weight:800;}
.np-var-qty-ctrl button{
  width:48px;height:48px;border-radius:12px;border:none;background:var(--surface);
  color:#fff;font-size:22px;font-weight:900;cursor:pointer;touch-action:manipulation;
}
.np-var-qty-ctrl button:active{transform:scale(.94);}
.np-var-qty-ctrl button:disabled{opacity:.3;}

.np-det-step.big{padding:4px;}
.np-det-step.big button{width:52px;height:52px;font-size:22px;border-radius:12px;touch-action:manipulation;}
.np-det-step.big span{min-width:34px;font-size:18px;}
.np-det-big{min-height:60px;font-size:15px;border-radius:14px;}
.np-det-actions{position:sticky;bottom:0;background:var(--surface);padding-top:10px;}
img[data-fade]{
  opacity:0;
  transition:opacity .45s ease;
}
img[data-fade].loaded{opacity:1;}
.np-img-wrap,.np-det-img{
  background:linear-gradient(90deg,rgba(255,255,255,.04) 25%,rgba(255,255,255,.09) 50%,rgba(255,255,255,.04) 75%);
  background-size:200% 100%;
  animation:np-shimmer 1.2s linear infinite;
}
.np-img-wrap:has(img.loaded),.np-det-img:has(img.loaded){
  animation:none;background:#1a1a20;
}
  .np-line{
  display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:10px 12px;margin-bottom:8px;border-radius:14px;
  border:2px solid var(--line);background:var(--bg,#0a0a0f);
}
.np-line.editing{border-color:#7c5cff;background:rgba(124,92,255,.12);}
.np-line-info{min-width:0;flex:1;}
.np-line-info b{display:block;font-size:13.5px;line-height:1.25;}
.np-line-info small{font-size:11.5px;color:var(--ink-dim);}
.np-line-ctrl{display:flex;align-items:center;gap:6px;flex-shrink:0;}
.np-line-ctrl span{min-width:28px;text-align:center;font-size:18px;font-weight:800;}
.np-line-ctrl button{
  width:46px;height:46px;border-radius:12px;border:none;
  background:var(--surface);color:#fff;font-size:22px;font-weight:900;
  cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;
}
.np-line-ctrl button:active{transform:scale(.93);}
.np-line-ctrl button.ed{font-size:18px;color:#a78bfa;}
.np-line-ctrl button.tr{font-size:18px;background:rgba(248,113,113,.12);color:#f87171;}

/* Botones del carrito del panel derecho, más grandes */
.npc-ico{width:34px !important;height:34px !important;font-size:17px !important;border-radius:9px !important;}
.npc-edit{font-size:12.5px !important;padding:4px 0 !important;}
.np-det-img.sin-foto{
  aspect-ratio:16/9;
  max-height:26vh;
  background:radial-gradient(circle at center, rgba(124,92,255,.18), rgba(124,92,255,.05)), #14101f;
  animation:none;
}
.np-det-img.sin-foto>img{
  width:auto;
  height:62%;
  aspect-ratio:1/1;
  object-fit:contain;
  border-radius:50%;
  background:#14101f;
  border:1px solid rgba(124,92,255,.35);
  box-shadow:0 4px 14px rgba(0,0,0,.4);
  opacity:1;
}
`;
const DELI_CSS = `
#deliModo, .deli-inp{
  background:var(--bg,#0a0a0f);color:#fff;border:1px solid var(--line);
  border-radius:10px;padding:9px 11px;font-size:13px;font-weight:600;outline:none;
  color-scheme:dark;transition:border-color .2s, box-shadow .2s;
}
#deliModo{width:100%;}
.deli-inp:focus,#deliModo:focus{border-color:#7c5cff;box-shadow:0 0 0 3px rgba(124,92,255,.15);}
.deli-inp::placeholder{color:var(--ink-faint);font-weight:500;}
.deli-zona-row{display:flex;align-items:center;gap:6px;margin-bottom:8px;}
.deli-zona-row .deli-inp[type=text]{flex:1;min-width:0;}
.deli-money{display:flex;align-items:center;gap:5px;color:var(--ink-dim);font-size:12px;font-weight:700;}
.deli-money .deli-inp{width:68px;text-align:center;font-weight:800;}
.deli-trash{width:34px;height:36px;border-radius:10px;border:1px solid rgba(248,113,113,.35);
  background:rgba(248,113,113,.08);color:#f87171;cursor:pointer;flex-shrink:0;}
.deli-trash:hover{background:rgba(248,113,113,.18);}
.deli-rec{margin-top:12px;padding:12px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.03);}
.deli-rec-head{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:800;}
.deli-rec-body{margin-top:10px;}
.deli-rec-body.off{display:none;}
.deli-rec-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;}
.deli-rec-grid label{display:flex;flex-direction:column;gap:4px;font-size:10.5px;font-weight:700;
  color:var(--ink-dim);text-transform:uppercase;letter-spacing:.04em;}
.deli-rec-grid .deli-inp{width:100%;padding:8px 6px;text-align:center;}
.deli-rec-hint{margin-top:9px;font-size:11.5px;line-height:1.4;color:#fbbf24;}
/* ── Popover más ancho y ordenado ── */
#deliPop{
  width:min(360px, calc(100vw - 24px));
  max-height:82vh;
  overflow-y:auto;
  padding:16px;
}
#deliPop *{box-sizing:border-box;}
#deliPop .autorej-toggle-row{padding:6px 0;}

/* Tipo de tarifa: etiqueta arriba, select ocupando todo el ancho */
#deliPop .autorej-input-row:has(#deliModo){
  flex-direction:column;
  align-items:stretch;
  gap:6px;
  margin:12px 0;
}
#deliPop .autorej-input-row:has(#deliModo) > span{
  font-size:11px;font-weight:700;letter-spacing:.05em;
  text-transform:uppercase;color:var(--ink-dim);
}
#deliModo{width:100%;height:42px;}

/* Zonas: nombre | precio | basurero, en columnas fijas */
.deli-zona-row{
  display:grid;
  grid-template-columns:minmax(0,1fr) 96px 40px;
  gap:8px;
  align-items:center;
  margin-bottom:8px;
}
.deli-zona-row .deli-inp[type=text]{width:100%;height:40px;}
.deli-money{gap:6px;}
.deli-money .deli-inp{width:100%;min-width:0;height:40px;}
.deli-trash{width:100%;height:40px;}

/* Recargo: Desde / Hasta en 2 columnas, el monto abajo a todo el ancho */
.deli-rec{margin-top:14px;padding:14px;}
.deli-rec-grid{grid-template-columns:1fr 1fr;gap:10px;}
.deli-rec-grid label:nth-child(3){grid-column:1 / -1;}
.deli-rec-grid .deli-inp{width:100%;height:40px;padding:8px 10px;text-align:left;}
.deli-rec-grid label:nth-child(3) .deli-inp{text-align:center;font-weight:800;}
.deli-rec-hint{margin-top:12px;padding:8px 10px;border-radius:10px;
  background:rgba(251,191,36,.08);}

#deliSave{margin-top:14px;width:100%;}

/* En celular el popover ocupa el ancho de la pantalla */
@media (max-width:820px){
  #deliPop{width:auto;max-height:calc(100vh - 90px);}
}
`;
const styleTag = document.createElement("style");
styleTag.textContent = MESA_ADMIN_CSS + DELI_CSS;
document.head.appendChild(styleTag);
const VOUCHER_CSS = `
.order-card.oc-pago-recibido{
  border-color:#fbbf24 !important;
  box-shadow:0 0 0 3px rgba(251,191,36,.18), 0 8px 26px rgba(251,191,36,.22);
  animation: oc-pago-glow 1.4s ease-in-out infinite;
}
@keyframes oc-pago-glow{
  0%,100%{box-shadow:0 0 0 3px rgba(251,191,36,.18), 0 8px 26px rgba(251,191,36,.22);}
  50%{box-shadow:0 0 0 6px rgba(251,191,36,.3), 0 10px 30px rgba(251,191,36,.32);}
}
`;
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
  /* Miniatura del carrito sin foto: círculo con el logo llenándolo */
.npc-thumb:has(.npc-thumb-ph){
  width:40px;
  height:40px;
  border-radius:50%;
  background:transparent;
  border:none;
}
.npc-thumb-ph{
  border-radius:50%;
  padding:0;
}
.npc-thumb .np-logo-circle{
  width:100%;
  border:none;
  box-shadow:none;
  background:transparent;
}
.npc-thumb-ph img,
.npc-thumb .np-logo-circle img{
  width:100%;
  height:100%;
  padding:0;
  object-fit:cover;
  border-radius:50%;
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
.nuevo-pedido-wrap{display:flex;gap:14px;padding:14px;flex-wrap:wrap;}
@media (min-width:980px){
  .app-shell{display:flex;flex-direction:column;height:100vh;height:100dvh;}
}
  
`;
const MAPA_CSS = `
.mapa-delivery-mini{
  position:relative;width:100%;height:240px;border-radius:14px;overflow:hidden;
  margin-top:8px;border:1px solid var(--line);cursor:pointer;background:#0a0a0f;
}
.deli-precio{
  display:flex;justify-content:space-between;align-items:center;gap:8px;
  margin-top:8px;padding:9px 12px;border-radius:10px;font-size:12.5px;
  color:#4ade80;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.28);
}
.deli-precio strong{font-weight:800;font-size:14px;}
.deli-precio.total{margin-top:4px;color:#fbbf24;background:rgba(251,191,36,.08);border-color:rgba(251,191,36,.28);}
.deli-precio.gratis{justify-content:center;font-weight:800;}
@media (max-width:640px){
  #deliPop{position:fixed;left:12px;right:12px;top:72px;width:auto;max-width:none;z-index:70;}
  .mapa-delivery-mini{height:220px;}
}
.mapa-delivery-mini iframe{width:100%;height:100%;border:0;pointer-events:none;}
.mapa-delivery-click-layer{
  position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;
  padding-bottom:10px;background:linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,.6) 100%);
  color:#fff;font-size:11.5px;font-weight:800;
}
#mapaDeliveryOverlay{
  display:flex;position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.85);
  align-items:center;justify-content:center;padding:16px;
  opacity:0;visibility:hidden;pointer-events:none;
  transition:opacity .28s ease, visibility 0s linear .28s;
  will-change:opacity;
}
#mapaDeliveryOverlay.show{
  opacity:1;visibility:visible;pointer-events:auto;
  transition:opacity .28s ease, visibility 0s;
}
.mapa-delivery-full{
  position:relative;width:100%;max-width:920px;height:80vh;border-radius:18px;
  overflow:hidden;border:1px solid var(--line);background:#0a0a0f;
  opacity:0;transform:scale(.96) translateY(8px);
  transition:transform .32s cubic-bezier(.22,1,.36,1), opacity .28s ease;
}
#mapaDeliveryOverlay.show .mapa-delivery-full{opacity:1;transform:none;}
.mapa-delivery-full iframe{width:100%;height:100%;border:0;opacity:0;transition:opacity .35s ease;}
.mapa-delivery-full iframe.loaded{opacity:1;}
.mapa-delivery-full-close{
  position:absolute;top:12px;right:12px;z-index:5;width:36px;height:36px;
  border-radius:50%;border:none;background:rgba(0,0,0,.6);color:#fff;
  font-size:16px;cursor:pointer;
}
@media (max-width:820px){
  .top-actions-scroll{
    display:flex !important;
    flex-wrap:nowrap !important;
    align-items:center;
    gap:8px;
    overflow-x:auto;
    overflow-y:hidden;
    -webkit-overflow-scrolling:touch;
    scroll-snap-type:x proximity;
    scrollbar-width:none;
    padding-bottom:4px;
  }
  .top-actions-scroll::-webkit-scrollbar{display:none;}
  .top-actions-scroll > *{flex:0 0 auto;scroll-snap-align:start;}
  .top-actions-scroll #clockTime,
  .top-actions-scroll #clockDate{white-space:nowrap;}

  /* Los popovers salen del contenedor con scroll; en fixed no se recortan */
  #autorejPop,#autoresPop,#deliPop{
    position:fixed;left:12px;right:12px;top:72px;
    width:auto;max-width:none;z-index:70;
  }
}
.vista-oculta{display:none !important;}

/* Para que Mesas y Nuevo pedido ocupen su espacio y scrolleen por dentro (PC) */
#mesasStripWrap{flex:1 1 0;min-height:0;overflow:hidden;}
#mesasStripWrap .mesas-panel{height:100%;display:flex;flex-direction:column;}
#mesasStripWrap .mesas-panel-body{flex:1;min-height:0;overflow-y:auto;}

/* Celular: Mesas toma su alto natural y la página hace scroll normal */
@media (max-width:820px){
  #mesasStripWrap{
    flex:none !important;
    height:auto !important;
    min-height:0;
    overflow:visible !important;
  }
  #mesasStripWrap .mesas-panel{
    height:auto !important;
  }
  #mesasStripWrap .mesas-panel-body{
    flex:none;
    overflow:visible;
  }
}
  #mesasStripWrap .mesas-panel-body{flex:1;min-height:0;overflow-y:auto;}
  #npPagoRow{flex-wrap:wrap;}
#npPagoRow .np-pago-btn{flex:1 1 calc(50% - 8px);}
.np-adic-title{font-size:11.5px;font-weight:800;color:var(--ink-dim);margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em;}
.np-adic-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;}
.np-adic-chip{padding:7px 11px;border-radius:999px;border:1px solid var(--line);background:var(--bg,#0a0a0f);color:#fff;font-size:12px;font-weight:700;cursor:pointer;touch-action:manipulation;}
.np-adic-chip:hover{border-color:#7c5cff;}
.np-adic-chip:active{transform:scale(.96);}
.order-card.oc-pago-extra{
  border-color:#22d3ee !important;
  box-shadow:0 0 0 3px rgba(34,211,238,.45), 0 8px 26px rgba(34,211,238,.3) !important;
}
`;

styleTag.textContent =
  MESA_ADMIN_CSS +
  NP_CSS +
  NP_UI_CSS +
  PS_CSS +
  VOUCHER_CSS +
  MAPA_CSS +
  DELI_CSS;
/* ══════════════ Identificación del negocio ══════════════ */

const ESTADOS = [
  "pendiente",
  "pendiente_pago",
  "en_proceso",
  "listo",
  "en_pausa",
  "entregado",
  "rechazado",
];
const prevMoney = {
  pendiente: 0,
  pendiente_pago: 0,
  en_proceso: 0,
  listo: 0,
  en_pausa: 0,
  entregado: 0,
  rechazado: 0,
};
const pedidosMap = new Map(); // id -> data
const mesasMap = new Map(); // docId -> data (numero_mesa, nombre_alias, ...)
const gruposMap = new Map();
const clientesSeguidoresCache = new Map(); // uid -> true/false (existe en /clientes)

let activeTab = "pendiente";
let activeModalId = null;
let isFirstSnapshot = true;
let bizLogoUrl = "";
let bizNombreGlobal = "Geinz";
let soundEnabled = localStorage.getItem("geinz_sound_enabled") !== "0";
let audioCtx = null;
let pedidoSearchActivoId = null;
let bizLat = null;
let bizLng = null;
let bizDataGlobal = null;
let bizAliasGlobal = null;
let bizDominioGlobal = null;
const SND_NUEVO_PEDIDO = "../../sounds/nuevo_pedido_en_geinz.mp3";
const NPAdicionales = {
  lista: [],
  unsub: null,
  iniciar() {
    if (this.unsub || !tiendaId || !localidad) return;
    this.unsub = onSnapshot(
      query(tiendaSubCol(localidad, "tiendas", tiendaId, "adicionales"), orderBy("createdAt", "asc")),
      (snap) => {
        this.lista = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((a) => a.activo !== false);
        this.pintar?.();
      },
      (e) => console.warn("adicionales:", e),
    );
  },
};
NPAdicionales.iniciar();
/* ══════════ Delivery por fijar (el negocio pone el precio) ══════════ */
const deliveryBrillo = new Set(); // pedidos cuyo cliente aceptó el delivery (brillan hasta abrirlos)
let dlvDraft = { id: null, v: "" };

function deliveryBloquea(p) {
  const d = p?.delivery_pendiente;
  return !!d && d.estado !== "aceptado";
}
function bloquearAceptarDelivery(container, estado, p) {
  if (estado !== "pendiente" || !deliveryBloquea(p)) return;
  const esperando = p.delivery_pendiente.estado === "propuesto";
  const b = container.querySelector(
    '[data-action="en_proceso"],[data-action="pendiente_pago"],[data-action="listo"]',
  );
  if (b) {
    b.disabled = true;
    b.textContent = esperando
      ? "⏳ Esperando al cliente"
      : "🛵 Fija el delivery primero";
  }
  container.insertAdjacentHTML(
    "afterbegin",
    `<div class="oc-puntos-aceptar" style="width:100%;">🛵 ${
      esperando
        ? `Delivery propuesto: <strong>${fmtMoney(p.delivery_pendiente.costo)}</strong>. Esperando que el cliente lo acepte.`
        : "Este pedido necesita que fijes el precio del delivery (ábrelo)."
    }</div>`,
  );
}
function deliveryFijarHTML(p) {
  const d = p.delivery_pendiente;
  if (!d) return "";
  const base = Number(p.total) || 0;
  if (d.estado === "aceptado")
    return `<div class="dm-meta-item full"><div class="deli-precio gratis">✅ El cliente aceptó el delivery · ${fmtMoney(d.costo)}</div></div>`;
  const esperando = d.estado === "propuesto";
  return `
    <div class="dm-meta-item full">
      <div class="dm-meta-label">🛵 Precio del delivery</div>
      ${esperando ? `<div class="deli-precio total"><span>⏳ Propuesto: esperando respuesta del cliente</span><strong>${fmtMoney(d.costo)}</strong></div>` : ""}
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px;">
        <span style="font-size:13px;font-weight:700;">S/</span>
        <input type="number" id="fdInput" class="deli-inp" min="0" step="0.5" inputmode="decimal"
          placeholder="${esperando ? "Nuevo precio" : "Ej: 5"}" style="flex:1;height:44px;">
        <button type="button" class="oc-btn primary v-green" id="fdEnviar" style="min-height:44px;">${esperando ? "Cambiar" : "Enviar al cliente"}</button>
      </div>
      <div class="deli-precio total" style="margin-top:8px;"><span>Productos ${fmtMoney(base)} + delivery = Nuevo total</span><strong id="fdTotal">—</strong></div>
    </div>`;
}
function enlazarDeliveryFijar(id, p) {
  const inp = document.getElementById("fdInput");
  if (!inp) return;
  const base = Number(p.total) || 0;
  if (dlvDraft.id === id && dlvDraft.v !== "") inp.value = dlvDraft.v;
  const act = () => {
    dlvDraft = { id, v: inp.value };
    const c = parseFloat(String(inp.value).replace(",", "."));
    const t = document.getElementById("fdTotal");
    if (t)
      t.textContent = Number.isFinite(c) && c >= 0 ? fmtMoney(base + c) : "—";
  };
  inp.addEventListener("input", act);
  act();
  document
    .getElementById("fdEnviar")
    ?.addEventListener("click", () => fijarDeliveryPedido(id, p));
}
async function fijarDeliveryPedido(id, p) {
  const c = parseFloat(
    String(document.getElementById("fdInput")?.value).replace(",", "."),
  );
  if (!Number.isFinite(c) || c < 0 || c > 500)
    return showToast("Precio de delivery inválido", true);
  const prev = p.delivery_pendiente;
  if (!prev || prev.estado === "aceptado") return;
  const costo = +c.toFixed(2);
  const totalProp = +((Number(p.total) || 0) + costo).toFixed(2);
  try {
    await updateDoc(
      tiendaSubDoc(localidad, "tiendas", tiendaId, "pedidos", id),
      {
        delivery_pendiente: {
          estado: "propuesto",
          costo,
          total_propuesto: totalProp,
          propuesto_en: serverTimestamp(),
        },
      },
    );
    dlvDraft = { id: null, v: "" };
    showToast(`🛵 Delivery ${fmtMoney(costo)} enviado al cliente`);
    notificarDeliveryAlCliente(p, costo, totalProp);
  } catch (e) {
    console.error(e);
    showToast("❌ No se pudo enviar el precio", true);
  }
}
async function notificarDeliveryAlCliente(p, costo, total) {
  const idUser = p?.cliente?.id_cliente;
  if (!URL_NOTIFICAR_CLIENTE || !idUser) return;
  try {
    await fetch(URL_NOTIFICAR_CLIENTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_user: idUser,
        title: bizNombreGlobal || "Geinz",
        body: `El delivery cuesta ${fmtMoney(costo)}. Nuevo total ${fmtMoney(total)}. Entra a tu pedido para aceptarlo.`,
        logo: bizLogoUrl || "",
        id_tienda: tiendaId || "",
        tipo_notificacion: "logo",
        prioridad: "high",
      }),
    });
  } catch (e) {
    console.warn("No se pudo notificar el delivery:", e);
  }
}
const dlvOkStyle = document.createElement("style");
dlvOkStyle.textContent = `
.order-card.oc-delivery-ok{border-color:#22c55e !important;box-shadow:0 0 0 3px rgba(34,197,94,.45), 0 8px 26px rgba(34,197,94,.3) !important;}
`;
document.head.appendChild(dlvOkStyle);
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
const colaAlarmasMesa = [];
let alarmaMesaActual = null;
const colaAlarmas = [];
let alarmaActual = null;
const reservaAlertadas = new Set();

const colaAlarmasReserva = [];
let alarmaReservaActual = null;

function buildSecuenciaAudiosReserva(numeros) {
  const secuencia = [];
  numeros.forEach((n, i) => {
    if (i > 0 && i === numeros.length - 1 && numeros.length > 1) {
      secuencia.push(RESERVA_Y_URL);
    }
    secuencia.push(urlAudioMesa(n));
  });
  return secuencia;
}
function encolarAlarmaReserva(numeros) {
  if (!soundEnabled || !numeros?.length) return;
  const key = numeros.join(",");
  if (alarmaReservaActual === key) return;
  if (colaAlarmasReserva.some((r) => r.key === key)) return;
  colaAlarmasReserva.push({ key, numeros });
  if (!alarmaReservaActual) reproducirSiguienteAlarmaReserva();
}

function reproducirSiguienteAlarmaReserva() {
  if (!colaAlarmasReserva.length) {
    alarmaReservaActual = null;
    return;
  }
  const item = colaAlarmasReserva.shift();
  alarmaReservaActual = item.key;
  const cola = [
    RESERVA_PREFIJO_URL,
    ...buildSecuenciaAudiosReserva(item.numeros),
  ];
  let idx = 0;
  function playNext() {
    if (idx >= cola.length) {
      reproducirSiguienteAlarmaReserva();
      return;
    }
    const audio = new Audio(cola[idx]);
    idx++;
    audio.addEventListener("ended", playNext);
    audio.play().catch(playNext);
  }
  playNext();
}

function detenerSoundLoopParaReserva(numeros) {
  if (!numeros?.length) return;
  const key = numeros.join(",");
  const idx = colaAlarmasReserva.findIndex((r) => r.key === key);
  if (idx !== -1) colaAlarmasReserva.splice(idx, 1);
  if (alarmaReservaActual === key) {
    alarmaReservaActual = null;
    reproducirSiguienteAlarmaReserva();
  }
}
function encolarAlarmaMesa(numero) {
  if (!soundEnabled || !numero) return;
  if (alarmaMesaActual === numero) return;
  if (colaAlarmasMesa.includes(numero)) return;
  colaAlarmasMesa.push(numero);
  if (!alarmaMesaActual) reproducirSiguienteAlarmaMesa();
}

function reproducirSiguienteAlarmaMesa() {
  if (!colaAlarmasMesa.length) {
    alarmaMesaActual = null;
    return;
  }
  const numero = colaAlarmasMesa.shift();

  const mesa = [...mesasMap.values()].find((m) => m.numero_mesa === numero);
  if (!mesa || mesa.estado !== "pedido_pendiente") {
    reproducirSiguienteAlarmaMesa();
    return;
  }

  alarmaMesaActual = numero;
  const prefijo = new Audio(PREFIJO_PEDIDO_MESA_URL);

  function reproducirNumeroMesa() {
    const url = urlAudioMesa(numero); // ← numero viene del closure, no de un argumento
    const numAudio = new Audio(url);
    numAudio.addEventListener("ended", reproducirSiguienteAlarmaMesa);
    numAudio.play().catch((err) => {
      console.warn(`⚠️ Falló mesa ${numero} (${url}):`, err);
      reproducirSiguienteAlarmaMesa();
    });
  }

  // OJO: se usa una arrow function () => reproducirNumeroMesa(),
  // NO reproducirNumeroMesa directo, para que no reciba el Event como argumento
  prefijo.addEventListener("ended", () => reproducirNumeroMesa());
  prefijo.play().catch((err) => {
    console.warn(
      `⚠️ No se pudo reproducir el prefijo para mesa ${numero}:`,
      err,
    );
    reproducirNumeroMesa();
  });
}

function detenerSoundLoopParaPedidoMesa(numero) {
  const idx = colaAlarmasMesa.indexOf(numero);
  if (idx !== -1) colaAlarmasMesa.splice(idx, 1);
  if (alarmaMesaActual === numero) {
    alarmaMesaActual = null;
    reproducirSiguienteAlarmaMesa();
  }
} // { pedidoId, audio, repeticionesRestantes }

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
  alarmaActual = {
    pedidoId,
    audio,
    repeticionesRestantes: REPETICIONES_ALARMA,
  };

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

  audio.play().catch((err) => {
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
const CANJE_DA_PUNTOS = false;

// Todos los cupones del pedido (el servidor manda p.cupones; antes solo p.cupon)
function cuponesDePedido(p) {
  const arr =
    Array.isArray(p?.cupones) && p.cupones.length
      ? p.cupones
      : p?.cupon
        ? [p.cupon]
        : [];
  return arr.filter(Boolean);
}
function lineasCanje(p) {
  return (Array.isArray(p?.productos) ? p.productos : []).filter(
    (it) => it.esCanje === true,
  );
}
// Un pedido puede tener varias cosas a la vez (canje + descuento + cupón)
function categoriasCupon(p) {
  const cups = cuponesDePedido(p);
  const out = [];
  if (
    cups.some((c) => c.origen === "fidelizacion" && c.tipo === "producto") ||
    (!cups.length && lineasCanje(p).length)
  )
    out.push("canje_puntos");
  if (cups.some((c) => c.origen === "fidelizacion" && c.tipo !== "producto"))
    out.push("descuento_fidelizacion");
  if (cups.some((c) => c.origen !== "fidelizacion"))
    out.push("cupon_descuento");
  return out;
}
function getTipoCuponPedido(p) {
  return categoriasCupon(p)[0] || null; // canje > descuento fidelización > cupón
}

function textoBeneficioCupon(c) {
  const d = c?.descuento || {};
  switch (c?.tipoBeneficio) {
    case "monto":
      return `Descuento de ${fmtMoney(d.monto)} en el producto`;
    case "porcentaje":
      return `${Number(d.porcentaje) || 0}% de descuento en el producto`;
    case "cantidad":
      return `Lleva ${d.compraUnidades ?? "?"} · paga ${d.pagaUnidades ?? "?"}`;
    default:
      return "Producto GRATIS con puntos";
  }
}

// Un bloque por producto canjeado, con todo lo que el negocio necesita saber
function detalleCanjesPedido(p) {
  const porCodigo = new Map(cuponesDePedido(p).map((c) => [c.codigo, c]));
  return lineasCanje(p).map((it) => {
    const codigos =
      Array.isArray(it.cuponCodigos) && it.cuponCodigos.length
        ? it.cuponCodigos
        : it.cuponCodigo
          ? [it.cuponCodigo]
          : [];
    const cs = codigos.map((c) => porCodigo.get(c)).filter(Boolean);
    const pagado = Number(it.subtotal) || 0;
    const normal =
      cs.length && cs.every((c) => c.precioOriginal != null)
        ? cs.reduce(
            (s, c) =>
              s +
              Number(c.precioOriginal) *
                (c.tipoBeneficio === "cantidad"
                  ? Number(c.descuento?.compraUnidades) || 1
                  : 1),
            0,
          )
        : null;
    return {
      it,
      codigos,
      unidades: Number(it.cantidad) || 0,
      pagado,
      normal,
      ahorro: normal != null ? Math.max(0, normal - pagado) : null,
      puntos: cs
        .filter((c) => c.origen === "fidelizacion")
        .reduce((s, c) => s + (Number(c.costoPuntos) || 0), 0),
      beneficio: cs[0] ? textoBeneficioCupon(cs[0]) : "Canje con cupón",
    };
  });
}
function puntosGastadosPedido(p) {
  return cuponesDePedido(p)
    .filter((c) => c.origen === "fidelizacion")
    .reduce((s, c) => s + (Number(c.costoPuntos) || 0), 0);
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
  if (Array.isArray(p?.mesas) && p.mesas.length) {
    return {
      tipo: "mesa",
      numero: Number(p.mesas[0].numero),
      nombre: p.mesas.map((m) => m.nombre).join(" + "),
      mesaId: p.mesas[0].id,
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

function pedidoVisible(id, p) {
  const origen = getOrigen(p);
  if (originFilter === "whatsapp") {
    return origen.tipo === "whatsapp" && pedidoCumpleTipo(p);
  }
  if (originFilter === "mesa") {
    if (origen.tipo !== "mesa") return false;
    if (mesaFilter !== null && origen.numero !== mesaFilter) return false;
  }
  return true;
}
/* ══════════════ Modal de pausa: elegir producto agotado + mensaje + tiempo ══════════════ */
const _prodDocCache = new Map();

async function obtenerDocProductoPausa(it) {
  if (!it.id || !it.categoria || it.esPromo) return null;
  const key = `${it.categoria}::${it.id}`;
  if (_prodDocCache.has(key)) return _prodDocCache.get(key);
  try {
    const snap = await getDoc(
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
    const d = snap.exists() ? snap.data() : null;
    _prodDocCache.set(key, d);
    return d;
  } catch {
    return null;
  }
}

function extrasOpciones(condiciones, seleccion) {
  let t = 0;
  (condiciones || []).forEach((c) =>
    entradasDeOpcion(seleccion?.[c.nombre]).forEach(([n, q]) => {
      const op = (c.opciones || []).find((o) => o.nombre === n);
      if (op?.costoAdicional) t += Number(op.costoAdicional) * q;
    }),
  );
  return t;
}

function textoRespuestaCliente(r) {
  if (r.accion === "reemplazo")
    return "cambiar por " + (r.producto_elegido?.nombre || "");
  if (r.accion === "cancelado") return "cancelar el pedido";
  if (r.accion === "ajuste")
    return (r.ajustes || [])
      .map((a) => `${a.nombre}: ${a.cantidad_pedida} → ${a.cantidad_final}`)
      .join(" · ");
  return "continuar sin ese producto";
}

let _catsPausaCache = null;
async function obtenerCategoriasPausa() {
  if (NuevoPedido?.categorias?.length) return NuevoPedido.categorias;
  if (_catsPausaCache) return _catsPausaCache;
  try {
    const snap = await getDocs(
      tiendaSubCol(localidad, "tiendas", tiendaId, "productos"),
    );
    _catsPausaCache = snap.docs
      .map((d) => d.id)
      .sort((a, b) => a.localeCompare(b, "es"));
  } catch {
    _catsPausaCache = [];
  }
  return _catsPausaCache;
}

function abrirModalPausa(id, p) {
  // Oculta el detalle del pedido para que solo se vea el diálogo de pausa
  if (activeModalId) closeDetail();

  _prodDocCache.clear();
  const productos = Array.isArray(p.productos) ? p.productos : [];
  const body = document.getElementById("pausaBody");
  if (!body) return;

  const inputCss =
    "width:90px;padding:8px;border-radius:10px;border:1px solid var(--line);background:var(--bg,#0a0a0f);color:#fff;color-scheme:dark;";

  body.innerHTML = `
    <div class="np-opt-label">¿Qué producto(s) se terminaron?</div>
    <div class="np-opt-row" id="pausaProdRow">
      ${productos.map((it, i) => `<button type="button" class="np-opt-btn" data-idx="${i}">${escapeHtml(it.nombre)} (x${it.cantidad})</button>`).join("")}
    </div>

 <div class="np-opt-label">Productos que el cliente puede elegir para reemplazar</div>
<div style="display:flex;gap:8px;margin-bottom:8px;">
  <input id="pausaBuscar" class="pausa-field" placeholder="Buscar producto…" style="flex:2;">
  <select id="pausaCatSel" class="pausa-field" style="flex:1;width:auto;"><option value="">Todas</option></select>
</div>
<div id="pausaProdList" style="max-height:220px;overflow-y:auto;scrollbar-width:none;"></div>
<div id="pausaElegidosTxt" class="dlv-cfg-sub" style="margin-top:6px;"></div>

    <div class="np-opt-label">Mensaje para el cliente (opcional)</div>
    <textarea id="pausaMotivo" rows="2" class="pausa-field" placeholder="Ej: Se nos terminó el pollo entero"></textarea>

    <div class="np-opt-label" style="margin-top:12px;">Tiempo de espera estimado</div>
    <div style="display:flex;gap:8px;">
      <input type="number" id="pausaTiempoValor" min="1" value="15" style="${inputCss}">
      <select id="pausaTiempoUnidad" class="pausa-field" style="flex:1;width:auto;">
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
      if (btn.classList.contains("active")) seleccionados.add(idx);
      else seleccionados.delete(idx);
      pintarCat();
    });
  });

  const prodsElegidos = new Map(); // "cat::id" -> {id, categoria}
  const listEl = body.querySelector("#pausaProdList");
  const buscarEl = body.querySelector("#pausaBuscar");
  const catSel = body.querySelector("#pausaCatSel");
  const resumen = body.querySelector("#pausaElegidosTxt");

  const catalogoPausa = () => {
    const afectadosIds = new Set(
      [...seleccionados].map((i) => productos[i].id),
    );
    return NuevoPedido.productos.filter(
      (p) => !p.esPromo && !p.agotado && !afectadosIds.has(p.id),
    );
  };
  const precioRef = () => {
    const arr = [...seleccionados].map(
      (i) => Number(productos[i].precio_unitario) || 0,
    );
    return arr.length ? Math.max(...arr) : 0;
  };
  const rangoPrecio = (p) => {
    const base = NuevoPedido.calcPrecioFinal(p, null);
    let min = base,
      max = base;
    (p.condiciones || []).forEach((c) => {
      const ex = (c.opciones || []).map((o) => Number(o.costoAdicional) || 0);
      if (!ex.length) return;
      if (c.multiple) {
        max += ex.reduce((s, x) => s + x, 0);
        if (c.obligatoria) min += Math.min(...ex);
      } else {
        max += Math.max(...ex);
        if (c.obligatoria) min += Math.min(...ex);
      }
    });
    return { min: +min.toFixed(2), max: +max.toFixed(2) };
  };
  const pintarCat = () => {
    const q = NuevoPedido.normalizeText(buscarEl.value);
    const cat = catSel.value;
    const lista = catalogoPausa()
      .filter(
        (p) =>
          (!cat || p.categoria === cat) && (!q || p.nombreNorm.includes(q)),
      )
      .slice(0, 80);
    const ref = precioRef();
    listEl.innerHTML =
      lista
        .map((p) => {
          const k = `${p.categoria}::${p.id}`;
          const on = prodsElegidos.has(k);
          const { min, max } = rangoPrecio(p);
          let tag = "",
            col = "transparent";
          if (ref > 0) {
            if (max < ref - 0.009) {
              tag = "↓ Más barato que lo agotado";
              col = "#f87171";
            } else if (min < ref - 0.009) {
              tag = "≈ Depende de la variante";
              col = "#fbbf24";
            } else {
              tag = "✓ Igual o más caro";
              col = "#4ade80";
            }
          }
          const precioTxt =
            max > min ? `${fmtMoney(min)} – ${fmtMoney(max)}` : fmtMoney(min);
          const vars = (p.condiciones || [])
            .map(
              (c) =>
                `${c.nombre}: ` +
                c.opciones
                  .map(
                    (o) =>
                      `${o.nombre}${o.costoAdicional ? ` +${fmtMoney(o.costoAdicional)}` : ""}`,
                  )
                  .join(" · "),
            )
            .join(" | ");
          return `<div class="dlv-item pick mt-row${on ? " mt-on" : ""}" data-k="${escapeHtml(k)}" style="border-left:4px solid ${col};">
        <div class="dlv-info"><b>${escapeHtml(p.nombre)}</b>
        <small>${escapeHtml(p.categoria)} · <b>${precioTxt}</b>${tag ? ` · <span style="color:${col};font-weight:800;">${tag}</span>` : ""}</small>
        ${vars ? `<small style="display:block;color:var(--ink-faint);">${escapeHtml(vars)}</small>` : ""}</div>
        <span class="mt-check">${on ? "●" : "○"}</span></div>`;
        })
        .join("") || `<div class="dlv-empty">Sin resultados</div>`;
    resumen.textContent =
      `${prodsElegidos.size} producto(s) elegido(s)` +
      (ref > 0 ? ` · Lo agotado cuesta ${fmtMoney(ref)} c/u` : "");
  };

  const pintarCats = () => {
    catSel.innerHTML =
      `<option value="">Todas</option>` +
      NuevoPedido.categorias
        .map(
          (c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`,
        )
        .join("");
  };

  listEl.addEventListener("click", (e) => {
    const row = e.target.closest("[data-k]");
    if (!row) return;
    const k = row.dataset.k;
    if (prodsElegidos.has(k)) prodsElegidos.delete(k);
    else {
      const [categoria, id] = k.split("::");
      prodsElegidos.set(k, { id, categoria });
    }
    pintarCat();
  });
  buscarEl.addEventListener("input", pintarCat);
  catSel.addEventListener("change", pintarCat);

  NuevoPedido.cargarCatalogo().finally(() => {
    pintarCats();
    pintarCat();
  });
  pintarCats();
  pintarCat();

  document.getElementById("pausaConfirmarBtn").onclick = async (ev) => {
    const btn = ev.currentTarget;
    if (!seleccionados.size)
      return showToast("Selecciona al menos un producto", true);

    btn.disabled = true;
    const productosAfectados = [];
    for (const i of seleccionados) {
      const it = productos[i];
      const d = await obtenerDocProductoPausa(it);
      let precioBase = Number(it.precio_unitario) || 0;
      if (d?.condiciones?.length)
        precioBase = +(
          precioBase - extrasOpciones(d.condiciones, it.opciones)
        ).toFixed(2);
      productosAfectados.push({
        id: it.id,
        nombre: it.nombre,
        categoria: it.categoria || null,
        cantidad_pedida: Number(it.cantidad) || 0,
        stock_disponible: 0, // producto terminado
        precio_base: precioBase,
        condiciones: null,
      });
    }

    const valor = Math.max(
      1,
      Number(document.getElementById("pausaTiempoValor").value) || 15,
    );
    const unidad = document.getElementById("pausaTiempoUnidad").value;
    const motivo = document.getElementById("pausaMotivo").value.trim();

    detenerSoundLoopParaPedido(id);
    try {
      await updateDoc(
        tiendaSubDoc(localidad, "tiendas", tiendaId, "pedidos", id),
        {
          estado: "en_pausa",
          pausa: {
            motivo,
            productos_afectados: productosAfectados,
            productos_reemplazo: [...prodsElegidos.values()], // ← NUEVO
            tiempo_espera: { valor, unidad },
            estado_anterior: p.estado,
            creado_en: serverTimestamp(),
            resuelto: false,
          },
          respuesta_cliente: null,
        },
      );
      showToast("⏸️ Pedido puesto en pausa");
      document.getElementById("pausaOverlay")?.classList.remove("show");
    } catch (err) {
      console.error(err);
      showToast("❌ No se pudo pausar el pedido", true);
      btn.disabled = false;
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

let dateFilter = { type: "hoy", day: null }; // hoy | ayer | anteayer | custom | ultimos | rango
let waPendienteId = null;

function getDateFilterRange() {
  const off = -5 * 60 * 60 * 1000; // Lima UTC-5
  const l = new Date(Date.now() + off);
  const y = l.getUTCFullYear(),
    m = l.getUTCMonth(),
    d = l.getUTCDate();
  const ini = (yy, mm, dd) => new Date(Date.UTC(yy, mm, dd, 0, 0, 0) - off);
  const fin = (yy, mm, dd) =>
    new Date(Date.UTC(yy, mm, dd, 23, 59, 59, 999) - off);
  const parse = (s) => s.split("-").map(Number); // "YYYY-MM-DD"

  if (dateFilter.type === "ayer") return [ini(y, m, d - 1), fin(y, m, d - 1)];
  if (dateFilter.type === "anteayer")
    return [ini(y, m, d - 2), fin(y, m, d - 2)];
  if (dateFilter.type === "ultimos") {
    const n = Math.max(1, dateFilter.dias || 1);
    return [ini(y, m, d - (n - 1)), fin(y, m, d)];
  }
  if (dateFilter.type === "rango" && dateFilter.desde && dateFilter.hasta) {
    const [y1, m1, d1] = parse(dateFilter.desde);
    const [y2, m2, d2] = parse(dateFilter.hasta);
    return [ini(y1, m1 - 1, d1), fin(y2, m2 - 1, d2)];
  }
  if (dateFilter.type === "custom" && dateFilter.day) {
    const [yy, mm, dd] = parse(dateFilter.day);
    return [ini(yy, mm - 1, dd), fin(yy, mm - 1, dd)];
  }
  return [ini(y, m, d), fin(y, m, d)];
}

function labelDateFilter() {
  const corto = (s) => {
    const [, mm, dd] = s.split("-");
    return `${dd}/${mm}`;
  };
  if (dateFilter.type === "ayer") return "Ayer";
  if (dateFilter.type === "anteayer") return "Anteayer";
  if (dateFilter.type === "ultimos") return `${dateFilter.dias} días`;
  if (dateFilter.type === "rango")
    return `${corto(dateFilter.desde)} – ${corto(dateFilter.hasta)}`;
  if (dateFilter.type === "custom" && dateFilter.day)
    return corto(dateFilter.day);
  return "Hoy";
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
function opcionesDetalleLineas(it) {
  if (!it.opciones || !Object.keys(it.opciones).length) return [];
  const lineas = [];
  Object.entries(it.opciones).forEach(([condNombre, v]) => {
    entradasDeOpcion(v).forEach(([nombreOp, cant]) => {
      const cantTxt = cant > 1 ? ` x${cant}` : "";
      lineas.push(`${condNombre}: ${nombreOp}${cantTxt}`);
    });
  });
  return lineas;
}

// Versión en HTML lista para insertar, con cada línea en su propio <div>
function opcionesDetalleHtmlLineas(it, color = "#a78bfa") {
  const tag = estadoItemTag(it);
  const lineas = opcionesDetalleLineas(it);
  if (!lineas.length) return tag;
  return (
    tag +
    lineas
      .map(
        (l) =>
          `<div class="dm-prod-cat" style="color:${color};">• ${escapeHtml(l)}</div>`,
      )
      .join("")
  );
}
/* ══════════════ Distancia y mini-mapa de delivery (Google Maps embed gratis) ══════════════ */
function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function estadoHabilitado(e) {
  if (!PLAN_PED.estados && ["pendiente_pago", "en_pausa"].includes(e))
    return false;

  if (
    ["pendiente", "en_proceso", "listo", "entregado", "rechazado"].includes(e)
  )
    return true;
  return bizDataGlobal?.pedidos_config?.estados?.[e] !== false;
}
const esPedidoCampana = (p) =>
  p?.cliente?.tipo_entrega === "Campaña física" || !!p?.campanaId;

function requierePagoOnline(p) {
  if (esPedidoCampana(p)) return false; // 👈 NUEVO: en campaña se paga en el punto
  const m = p?.pago?.metodo;
  return (
    getOrigen(p).tipo === "whatsapp" &&
    estadoHabilitado("pendiente_pago") &&
    !!m &&
    m !== "Efectivo"
  );
}
function aplicarEstadosVisibles(grupos) {
  ESTADOS.forEach((e) => {
    const mostrar = estadoHabilitado(e) || grupos?.[e]?.length > 0;
    document
      .querySelector(`.stab[data-s="${e}"]`)
      ?.classList.toggle("vista-oculta", !mostrar);
    document
      .querySelector(`.board-col[data-status="${e}"]`)
      ?.classList.toggle("vista-oculta", !mostrar);
  });
}
function quitarPausaSiOff(container) {
  if (!estadoHabilitado("en_pausa"))
    container.querySelector('[data-action="_pausar"]')?.remove();
}
function deliPrecioHtmlPedido(p) {
  const d = p.delivery;
  if (!d || d.costo == null || d.sinPrecio) return "";
  if (d.gratis)
    return `<div class="deli-precio gratis">🚚 Envío gratis (promo del negocio)</div>`;
  return `
    <div class="deli-precio">
      <span>Delivery${d.zona ? ` · ${escapeHtml(d.zona)}` : ""}${d.aprox ? " (aprox.)" : ""}${d.recargo > 0 ? ` · incl. recargo horario +${fmtMoney(d.recargo)}` : ""}</span>      <strong>${fmtMoney(d.costo)}</strong>
    </div>
    <div class="deli-precio total"><span>Total con delivery</span><strong>${fmtMoney(p.total)}</strong></div>`;
}
function deliveryBlockSinMapa(p) {
  if (
    p.cliente?.tipo_entrega !== "Delivery" ||
    !p.delivery ||
    p.delivery.sinPrecio
  )
    return "";
  return `<div class="dm-meta-item full"><div class="dm-meta-label">🛵 Delivery</div>${deliPrecioHtmlPedido(p)}</div>`;
}
/* Origen de la ruta: primero ubicacion_ruta (config del panel), si no, ubicacion del perfil */
function recalcularOrigenRuta() {
  const ur = bizDataGlobal?.ubicacion_ruta;
  const ub = bizDataGlobal?.ubicacion;
  let la = num(ur?.lat),
    lo = num(ur?.lng);
  if (la == null || lo == null) {
    la = num(ub?.latitud ?? ub?.lat);
    lo = num(ub?.longitud ?? ub?.lng);
  }
  const ok = la != null && lo != null;
  bizLat = ok ? la : null;
  bizLng = ok ? lo : null;
}
function num(v) {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function coordsCliente(p) {
  const u = p.cliente?.ubicacion || p.cliente?.coordenadas || p.ubicacion;
  if (!u) return null;
  const lat = num(u.lat ?? u.latitud ?? u.latitude);
  const lng = num(u.lng ?? u.lon ?? u.longitud ?? u.longitude);
  return lat != null && lng != null ? { lat, lng } : null;
}

function mapaDeliveryHTML(p) {
  if (getOrigen(p).tipo === "mesa") return "";
  if (p.cliente?.tipo_entrega !== "Delivery") return "";

  const c = coordsCliente(p);
  const direccion = (p.cliente?.direccion || "").trim();
  if (!c && !direccion) return "";

  const tieneNegocio = bizLat != null && bizLng != null;
  const destino = c ? `${c.lat},${c.lng}` : encodeURIComponent(direccion);

  let mapsUrl,
    linkUrl,
    distHtml = "",
    avisoHtml = "",
    etiqueta = "📍 Ubicación del cliente";

  if (tieneNegocio) {
    // RUTA real: negocio → cliente
    mapsUrl = `https://www.google.com/maps?saddr=${bizLat},${bizLng}&daddr=${destino}&dirflg=d&output=embed`;
    linkUrl = `https://www.google.com/maps/dir/?api=1&origin=${bizLat},${bizLng}&destination=${destino}&travelmode=driving`;
    etiqueta = "🛵 Ruta desde el negocio hasta el cliente";
    if (c) {
      const km = calcularDistanciaKm(bizLat, bizLng, c.lat, c.lng);
      distHtml = `<div class="dm-meta-value">${km.toFixed(1)} km en línea recta desde el negocio</div>`;
    }
  } else {
    mapsUrl = c
      ? `https://www.google.com/maps?q=${c.lat},${c.lng}&z=17&output=embed`
      : `https://www.google.com/maps?q=${destino}&z=17&output=embed`;
    linkUrl = `https://www.google.com/maps/search/?api=1&query=${destino}`;
    avisoHtml = `
      <div class="deli-rec-hint" style="margin:8px 0;">
        ⚠️ Para ver la ruta falta la dirección del negocio.
        <button type="button" class="oc-btn ghost" data-abrir-ruta-negocio style="width:100%;margin-top:6px;">🏠 Configurar dirección del negocio</button>
      </div>`;
    if (!c) etiqueta = "📍 Ubicación aproximada (por dirección)";
  }

  // Precio: se muestra TODO junto (gratis/costo) sin esconder la ruta
  let precioHtml = "";
  const distKm =
    c && tieneNegocio
      ? calcularDistanciaKm(bizLat, bizLng, c.lat, c.lng)
      : null;
  const precioDeli = distKm != null ? calcularPrecioDelivery(distKm) : null;
  if (p.cupon?.envioGratis === true) {
    precioHtml = `<div class="deli-precio gratis">🚚 Envío gratis (promo del negocio)</div>`;
  } else if (precioDeli !== null) {
    precioHtml = `
      <div class="deli-precio"><span>Costo de delivery</span><strong>${fmtMoney(precioDeli)}</strong></div>
      <div class="deli-precio total"><span>Total + delivery</span><strong>${fmtMoney((Number(p.total) || 0) + precioDeli)}</strong></div>`;
  }
  if (p.delivery_pendiente && p.delivery_pendiente.estado !== "aceptado")
    precioHtml = "";
  else if (p.delivery?.costo != null) precioHtml = deliPrecioHtmlPedido(p);

  return `
    <div class="dm-meta-item full">
      <div class="dm-meta-label">${etiqueta}</div>
      ${precioHtml}
      ${distHtml}
      ${avisoHtml}
      <div class="mapa-delivery-mini" data-maps-url="${escapeHtml(mapsUrl)}">
        <iframe src="${mapsUrl}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
        <div class="mapa-delivery-click-layer">🔍 Toca para ver el mapa completo</div>
      </div>
      <a href="${escapeHtml(linkUrl)}" target="_blank" rel="noopener"
         class="oc-btn ghost" style="display:block;text-align:center;margin-top:8px;text-decoration:none;">
        🧭 ${tieneNegocio ? "Abrir ruta en Google Maps" : "Abrir en Google Maps"}
      </a>
    </div>`;
}
let cerrarMapaTimer;

function bindMapaDeliveryClicks() {
  document.querySelectorAll(".mapa-delivery-mini").forEach((el) => {
    el.addEventListener("click", () => {
      const url = el.dataset.mapsUrl;
      const overlay = document.getElementById("mapaDeliveryOverlay");
      const iframe = document.getElementById("mapaDeliveryIframe");
      if (!overlay || !iframe || !url) return;

      clearTimeout(cerrarMapaTimer);
      iframe.classList.remove("loaded");
      iframe.onload = () =>
        requestAnimationFrame(() => iframe.classList.add("loaded"));

      overlay.classList.add("show");
      // Se carga el iframe después de que arranca el fade,
      // así la animación no se traba mientras Google Maps carga
      setTimeout(() => {
        iframe.src = url;
      }, 120);
    });
  });
}

function cerrarMapaDeliveryFullscreen() {
  const overlay = document.getElementById("mapaDeliveryOverlay");
  const iframe = document.getElementById("mapaDeliveryIframe");
  overlay?.classList.remove("show");
  clearTimeout(cerrarMapaTimer);
  // Espera a que termine el fade-out antes de vaciar el iframe
  cerrarMapaTimer = setTimeout(() => {
    if (iframe) {
      iframe.onload = null;
      iframe.classList.remove("loaded");
      iframe.src = "about:blank";
    }
  }, 300);
}

document
  .getElementById("mapaDeliveryClose")
  ?.addEventListener("click", cerrarMapaDeliveryFullscreen);
document
  .getElementById("mapaDeliveryOverlay")
  ?.addEventListener("click", (e) => {
    if (e.target.id === "mapaDeliveryOverlay") cerrarMapaDeliveryFullscreen();
  });

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

async function resolverAliasNegocio(data) {
  // Si el doc de la tienda ya guarda el alias, se usa directo
  const directo = data?.alias || data?.alias_tienda || data?.alias_url;
  if (directo) return String(directo);

  // Si no, se busca en alias_tiendas (donde id == tiendaId)
  try {
    const snap = await getDocs(
      query(
        collection(db, "alias_tiendas"),
        where("id", "==", tiendaId),
        limit(1),
      ),
    );
    if (!snap.empty) return snap.docs[0].id; // el id del doc ES el alias
  } catch (e) {
    console.warn("No se pudo resolver el alias del negocio:", e);
  }
  return null;
}
function limpiarDominio(d) {
  if (!d || typeof d !== "string") return null;
  const limpio = d
    .trim()
    .replace(/^https?:\/\//i, "") // quita http(s)://
    .replace(/\/.*$/, ""); // quita cualquier ruta
  return limpio || null;
}

async function imprimirComprobantePedido(pedido) {
  try {
    const id = pedido.id || pedido.pedidoDocId || null;
    const datos = {
      ...pedido,
      id,
      negocio: { id: tiendaId, nombre: bizNombreGlobal, localidad },
    };
    // hereda: fuente, toggles, datos del negocio, QR de seguimiento
    const cfg = await prepararCfgComprobante(tiendaId, localidad, datos, {
      tiendaData: bizDataGlobal,
      nombre: bizNombreGlobal,
    });
    const numero = await registrarComprobante(tiendaId, localidad, datos, cfg);
    await imprimirComprobante(datos, cfg, { numero });
  } catch (e) {
    console.error(e);
    showToast("❌ No se pudo imprimir el comprobante", true);
  }
}
window.imprimirComprobantePedido = imprimirComprobantePedido;
window.imprimirComprobantePedido = imprimirComprobantePedido;
window.imprimirComprobantePedido = imprimirComprobantePedido;
window.imprimirComprobantePedido = imprimirComprobantePedido;
/* ══════════════ Datos del negocio ══════════════ */
async function cargarNegocio() {
  try {
    const ref = tiendaDoc(localidad, "tiendas", tiendaId);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : null;
    bizDataGlobal = data;
    if (tiendaId) cachearConfigComprobante(tiendaId, data?.config_comprobante);
    aplicarDeliveryDesdeDB(data?.delivery);
    bizDominioGlobal = limpiarDominio(
      data?.dominio_propio ||
        data?.dominio_personalizado ||
        data?.dominio ||
        data?.custom_domain ||
        null,
    );
    bizAliasGlobal = await resolverAliasNegocio(data);
    const nombre = data ? data.nombre_tienda || data.nombre : null;
    bizNombreGlobal = nombre || "Geinz";
    bizLogoUrl = data?.img_tienda?.logo_tienda || "";
    recalcularOrigenRuta();
    document.title = `Pedidos en vivo · ${nombre || "Geinz"}`;
  } catch {}
}

/* ══════════════ Sonido de notificación (Web Audio, sin archivos externos) ══════════════ */
let audioDesbloqueado = false;

function ensureAudio() {
  if (!audioDesbloqueado) return null; // todavía no hubo toque del usuario
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

// Se desbloquea en la primera interacción real (clic, toque o tecla)
["click", "touchstart", "keydown"].forEach((ev) =>
  document.addEventListener(
    ev,
    () => {
      audioDesbloqueado = true;
      ensureAudio();
    },
    { once: true, capture: true },
  ),
);

function playChime(pedidoId, data) {
  const tipo = getTipoCuponPedido(data);
  let url = SND_NUEVO_PEDIDO;

  if (tipo === "canje_puntos") {
    url = SND_CANJE_PUNTOS;
  } else if (tipo === "descuento_fidelizacion") {
    url = SND_NUEVO_PEDIDO_DESCUENTO;
  } else if (tipo === "cupon_descuento") {
    url = SND_NUEVO_PEDIDO_CUPON_DESCUENTO;
  } else {
    // Sin cupón especial: el sonido depende del tipo de entrega
    const tipoEntrega = data?.cliente?.tipo_entrega;
    if (tipoEntrega === "Delivery") {
      url = SND_NUEVO_PEDIDO_DELIVERY;
    } else if (
      tipoEntrega === "Recojo en local" ||
      tipoEntrega === "Recojo en punto"
    ) {
      url = SND_NUEVO_PEDIDO_RECOJO;
    }
    // Si es otro valor o no viene, se queda con SND_NUEVO_PEDIDO (genérico)
  }

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

const topActionsEl = autorejBtn?.closest(".autorej-wrap")?.parentElement;
if (topActionsEl) topActionsEl.classList.add("top-actions-scroll");

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

/* ══════════════ Tarifa de delivery (base + km extra) ══════════════ */
function leerNum(key, def) {
  const v = localStorage.getItem(key);
  return v !== null && v !== "" && !isNaN(Number(v)) ? Number(v) : def;
}
let deliEnabled = localStorage.getItem("geinz_deli_on") === "1";
let deliBase = leerNum("geinz_deli_base", 3);
let deliKmIncl = leerNum("geinz_deli_km", 2);
let deliPorKm = leerNum("geinz_deli_perkm", 1);

const deliBtn = document.getElementById("deliBtn");
const deliPop = document.getElementById("deliPop");
const deliToggle = document.getElementById("deliToggle");
const deliBaseInput = document.getElementById("deliBase");
const deliKmInclInput = document.getElementById("deliKmIncl");
const deliPorKmInput = document.getElementById("deliPorKm");
const deliVal = document.getElementById("deliVal");
let deliHace = true,
  deliModo = "distancia",
  deliFija = 5,
  deliTexto = "";
const deliHaceEl = document.getElementById("deliHace");
const deliModoEl = document.getElementById("deliModo");
const deliFijaBox = document.getElementById("deliFijaBox");
const deliFijaEl = document.getElementById("deliFija");
const deliTextoEl = document.getElementById("deliTexto");
deliTextoEl.classList.add("deli-inp");
let deliZonas = [];
if (!deliModoEl.querySelector('option[value="zonas"]'))
  deliModoEl.add(new Option("Por zonas / lugares", "zonas"));

const deliZonasBox = document.createElement("div");
deliZonasBox.style.display = "none";
deliZonasBox.innerHTML = `
  <div id="deliZonasList"></div>
  <button type="button" id="deliZonaAdd" class="autorej-save"
    style="background:transparent;border:1px dashed var(--line);color:var(--ink-dim);margin-top:6px;">+ Agregar zona</button>`;
deliFijaBox.after(deliZonasBox);

let deliGratis = { activo: false, monto: 50 };

function subtotalProductos(p) {
  return (Array.isArray(p.productos) ? p.productos : []).reduce(
    (s, it) => s + Number(it.subtotal ?? it.precio_unitario * it.cantidad ?? 0),
    0,
  );
}
function envioGratisPorMonto(p) {
  return (
    PLAN_PED.deliveryCfg &&
    deliHace &&
    deliGratis.activo &&
    deliGratis.monto > 0 &&
    subtotalProductos(p) >= deliGratis.monto
  );
}
let deliRecargo = { activo: false, desde: "20:00", hasta: "06:00", monto: 2 };
const deliRecBox = document.createElement("div");
deliRecBox.className = "deli-rec";
deliRecBox.innerHTML = `
  <div class="deli-rec-head"><span>🌙 Recargo por horario</span>
    <label class="switch"><input type="checkbox" id="deliRecOn"><span class="switch-track"></span></label>
  </div>
  <div class="deli-rec-body" id="deliRecBody">
    <div class="deli-rec-grid">
      <label>Desde<input type="time" id="deliRecDesde" class="deli-inp"></label>
      <label>Hasta<input type="time" id="deliRecHasta" class="deli-inp"></label>
<label>Monto extra (S/)<input type="number" id="deliRecMonto" class="deli-inp" min="0" step="0.5"></label>
    </div>
    <p class="deli-rec-hint" id="deliRecHint"></p>
  </div>`;
deliZonasBox.after(deliRecBox);

function deliPintarRecargo() {
  document.getElementById("deliRecOn").checked = deliRecargo.activo;
  document.getElementById("deliRecDesde").value = deliRecargo.desde;
  document.getElementById("deliRecHasta").value = deliRecargo.hasta;
  document.getElementById("deliRecMonto").value = deliRecargo.monto;
  document
    .getElementById("deliRecBody")
    .classList.toggle("off", !deliRecargo.activo);
  document.getElementById("deliRecHint").textContent =
    `Desde las ${hora12(deliRecargo.desde)} hasta las ${hora12(deliRecargo.hasta)} el delivery cuesta S/ ${Number(deliRecargo.monto || 0).toFixed(2)} más.`;
}
deliRecBox.addEventListener("input", () => {
  deliRecargo = {
    activo: document.getElementById("deliRecOn").checked,
    desde: document.getElementById("deliRecDesde").value,
    hasta: document.getElementById("deliRecHasta").value,
    monto: Math.max(
      0,
      Number(document.getElementById("deliRecMonto").value) || 0,
    ),
  };
  deliPintarRecargo();
});
deliPintarRecargo();

function deliPintarZonas() {
  const l = document.getElementById("deliZonasList");
  l.innerHTML =
    deliZonas
      .map(
        (z, i) => `
      <div class="deli-zona-row">
        <input class="deli-inp" type="text" data-zn="${i}" value="${escapeHtml(z.nombre)}" placeholder="Ej: Barranca centro" maxlength="40">
        <div class="deli-money"><span>S/</span>
          <input class="deli-inp" type="number" data-zp="${i}" min="0" step="0.5" value="${z.precio}">
        </div>
        <button type="button" data-zd="${i}" class="deli-trash">🗑</button>
      </div>`,
      )
      .join("") ||
    `<div style="font-size:12px;color:var(--ink-faint);padding:6px 0;">Agrega los lugares donde haces delivery y su precio.</div>`;
}
document.getElementById("deliZonasList").addEventListener("input", (e) => {
  const zn = e.target.dataset.zn,
    zp = e.target.dataset.zp;
  if (zn !== undefined) deliZonas[zn].nombre = e.target.value;
  if (zp !== undefined) deliZonas[zp].precio = e.target.value;
});
document.getElementById("deliZonasList").addEventListener("click", (e) => {
  const d = e.target.closest("[data-zd]");
  if (!d) return;
  deliZonas.splice(Number(d.dataset.zd), 1);
  deliPintarZonas();
});
document.getElementById("deliZonaAdd").addEventListener("click", () => {
  if (deliZonas.length >= 15) return showToast("Máximo 15 zonas", true);
  deliZonas.push({ nombre: "", precio: 0 });
  deliPintarZonas();
});
deliPintarZonas();
deliToggle.checked = deliEnabled;
deliBaseInput.value = deliBase;
deliKmInclInput.value = deliKmIncl;
deliPorKmInput.value = deliPorKm;
const _deliLbl = deliBtn.querySelector(".lbl-text");
if (_deliLbl) _deliLbl.textContent = "Tarifa de delivery";
paintDeliBtn();
function actualizarVisibilidadDeli() {
  const wrap = deliBtn.closest(".autorej-wrap");
  if (wrap) wrap.style.display = originFilter === "whatsapp" ? "block" : "none";
  if (originFilter !== "whatsapp") deliPop.classList.remove("show");
}
actualizarVisibilidadDeli();
deliBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  deliPop.classList.toggle("show");
  autorejPop.classList.remove("show");
  autoresPop.classList.remove("show");
});
deliPop.addEventListener("click", (e) => e.stopPropagation());
// captura: cierra este popover aunque otro botón haga stopPropagation
document.addEventListener(
  "click",
  (e) => {
    if (!deliPop.contains(e.target) && !deliBtn.contains(e.target))
      deliPop.classList.remove("show");
  },
  true,
);

function pintarDeliModo() {
  const m = deliModoEl.value;
  deliFijaBox.style.display = m === "fija" ? "block" : "none";
  deliZonasBox.style.display = m === "zonas" ? "block" : "none";
  [deliBaseInput, deliKmInclInput, deliPorKmInput].forEach(
    (i) =>
      (i.closest(".autorej-input-row").style.display =
        m === "distancia" ? "flex" : "none"),
  );
}
deliModoEl.addEventListener("change", pintarDeliModo);

// Se llama desde cargarNegocio() con data.delivery
function aplicarDeliveryDesdeDB(d) {
  if (!d) return;
  deliHace = d.hace !== false;
  deliEnabled = d.tarifa_activa === true;
  deliModo =
    d.modo === "fija" ? "fija" : d.modo === "zonas" ? "zonas" : "distancia";
  deliZonas = Array.isArray(d.zonas)
    ? d.zonas.map((z) => ({
        nombre: z.nombre || "",
        precio: Number(z.precio) || 0,
      }))
    : [];
  deliPintarZonas();
  deliBase = Number(d.base) || 0;
  deliKmIncl = Number(d.km_incluidos) || 0;
  deliPorKm = Number(d.por_km) || 0;
  deliFija = Number(d.fija) || 0;
  deliTexto = d.texto || "";
  deliToggle.checked = deliEnabled;
  deliHaceEl.checked = deliHace;
  deliModoEl.value = deliModo;
  deliBaseInput.value = deliBase;
  deliKmInclInput.value = deliKmIncl;
  deliPorKmInput.value = deliPorKm;
  deliFijaEl.value = deliFija;
  deliTextoEl.value = deliTexto;
  const r = d.recargo || {};
  deliRecargo = {
    activo: r.activo === true,
    desde: r.desde || "20:00",
    hasta: r.hasta || "06:00",
    monto: Number(r.monto) || 0,
  };
  deliPintarRecargo();
  const g = d.gratis_desde || {};
  deliGratis = { activo: g.activo === true, monto: Number(g.monto) || 50 };
  peSyncGratis();
  pintarDeliModo();
  paintDeliBtn();
}

function paintDeliBtn() {
  deliBtn.classList.toggle("on", deliHace);
  deliVal.textContent = !deliHace
    ? "No"
    : deliModo === "zonas"
      ? `${deliZonas.length} zonas`
      : deliModo === "fija"
        ? `S/${deliFija}`
        : deliEnabled
          ? `S/${deliBase}+`
          : "Off";
}

deliSave.addEventListener("click", async () => {
  const num = (el) => Math.max(0, Number(el.value) || 0);
  deliBase = num(deliBaseInput);
  deliKmIncl = num(deliKmInclInput);
  deliPorKm = num(deliPorKmInput);
  deliFija = num(deliFijaEl);
  deliTexto = deliTextoEl.value.trim();
  deliModo = deliModoEl.value;
  deliHace = deliHaceEl.checked;
  deliEnabled = deliToggle.checked;
  deliZonas = deliZonas
    .map((z) => ({
      nombre: String(z.nombre || "").trim(),
      precio: Math.max(0, Number(z.precio) || 0),
    }))
    .filter((z) => z.nombre);
  if (deliModo === "zonas" && !deliZonas.length)
    return showToast("Agrega al menos una zona", true);
  deliPintarZonas();
  paintDeliBtn();
  try {
    await updateDoc(tiendaDoc(localidad, "tiendas", tiendaId), {
      delivery: {
        hace: deliHace,
        tarifa_activa: deliEnabled,
        modo: deliModo,
        base: deliBase,
        km_incluidos: deliKmIncl,
        por_km: deliPorKm,
        fija: deliFija,
        texto: deliTexto,
        zonas: deliZonas,
        recargo: deliRecargo,
        gratis_desde: deliGratis,
      },
    });
    deliPop.classList.remove("show");
    showToast(deliHace ? "🛵 Delivery guardado" : "🛵 Delivery desactivado");
    if (activeModalId && pedidosMap.has(activeModalId))
      renderDetail(activeModalId);
  } catch (e) {
    console.error(e);
    showToast("❌ No se pudo guardar el delivery", true);
  }
});
function horaAMin(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function hora12(s) {
  const n = horaAMin(s);
  if (n == null) return s || "";
  let h = Math.floor(n / 60);
  const suf = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(n % 60).padStart(2, "0")} ${suf}`;
}
function minutosLimaAhora(f = new Date()) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(f);
  return (
    Number(p.find((x) => x.type === "hour").value) * 60 +
    Number(p.find((x) => x.type === "minute").value)
  );
}
function recargoEnHora(r, f = new Date()) {
  if (!r || !r.activo) return 0;
  const monto = Number(r.monto) || 0;
  const ini = horaAMin(r.desde),
    fin = horaAMin(r.hasta);
  if (monto <= 0 || ini == null || fin == null || ini === fin) return 0;
  const now = minutosLimaAhora(f);
  const dentro = ini < fin ? now >= ini && now < fin : now >= ini || now < fin;
  return dentro ? monto : 0;
}
function calcularPrecioDelivery(distKm) {
  if (!PLAN_PED.deliveryCfg) return null;
  if (!deliEnabled || !deliHace) return null;
  const rec = recargoEnHora(deliRecargo);
  if (deliModo === "fija") return deliFija + rec;
  if (deliModo === "zonas") return null;
  const extra = Math.max(0, distKm - deliKmIncl);
  return Math.ceil((deliBase + extra * deliPorKm) * 2) / 2 + rec;
}

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
const VISTAS = {
  whatsapp: { board: true, tabs: true, mesas: false, directo: false },
  mesa: { board: false, tabs: false, mesas: true, directo: false },
  directo: { board: false, tabs: false, mesas: false, directo: true },
};

function aplicarVista(origen) {
  const v = VISTAS[origen] || VISTAS.whatsapp;
  const set = (id, show, displayMostrado = "") => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("vista-oculta", !show);
    el.style.display = show ? displayMostrado : ""; // quita el inline viejo
  };
  set("board", v.board);
  set("statusTabs", v.tabs);
  set("mesasStripWrap", v.mesas, "flex");
  set("nuevoPedidoWrap", v.directo, "flex");

  // En "Nuevo pedido" solo quedan las pestañas de origen
  document
    .querySelector(".head-top")
    ?.classList.toggle("vista-oculta", v.directo); // configuración y campanita
  document
    .getElementById("pedidoSearchWrap")
    ?.classList.toggle("vista-oculta", v.directo); // buscador por código
  if (v.directo) document.getElementById("cfgPanel")?.classList.remove("show");
  document.getElementById("mesaEmptyBanner")?.classList.add("vista-oculta");
  sincronizarBotonesWa();
}
aplicarVista("whatsapp");
const originBar = document.getElementById("originBar");
const mesasStripWrap = document.getElementById("mesasStripWrap");

originBar.querySelectorAll(".origin-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    originFilter = chip.dataset.origin;
    originBar
      .querySelectorAll(".origin-chip")
      .forEach((c) => c.classList.toggle("active", c === chip));
    actualizarVisibilidadDeli();
    aplicarVista(originFilter);
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
/* ── Mozo intermediario / alertas de mesa ── */
const llamadosMap = new Map();
let llamadosPrimero = true;
let llamadosIniciado = false;

function pedidoEsperaMozo(ped) {
  return (
    bizDataGlobal?.mesas_config?.mozoIntermediario === true &&
    ped?.estadoMozo !== "confirmado" &&
    !ped?.mozoConfirmo
  );
}
function mesaEsperaMozo(m) {
  const g = m.grupoId ? gruposMap.get(m.grupoId) : null;
  const ped = g ? g.pedido : m.pedido;
  return !!ped && pedidoEsperaMozo(ped);
}
// cuenta > ayuda > esperando mozo > listo
function alertaDeMesas(lista) {
  if (!lista.some((m) => ["ocupado", "pedido_pendiente"].includes(m.estado)))
    return "";
  const nums = new Set(lista.map((m) => Number(m.numero_mesa)));
  const ll = [...llamadosMap.values()].filter(
    (l) => l.estado === "pendiente" && nums.has(Number(l.mesaNumero)),
  );
  if (ll.some((l) => l.motivo === "cuenta")) return "cuenta";
  if (ll.some((l) => l.motivo === "ayuda")) return "ayuda";
  if (lista.some(mesaEsperaMozo)) return "mozo";
  if (
    lista.some(
      (m) =>
        (m.grupoId ? gruposMap.get(m.grupoId)?.pedido : m.pedido)?.estado ===
        "listo",
    )
  )
    return "listo";
  return "";
}
const AL_LABEL = {
  cuenta: "🧾 Pide la cuenta",
  ayuda: "🔔 Llama al mozo",
  mozo: "🧑‍🍳 Esperando al mozo",
  listo: "✅ Pedido listo",
};
function alertaBadgeHtml(al) {
  return al
    ? `<span class="mesa-alerta-badge ${al}">${AL_LABEL[al]}</span>`
    : "";
}
async function atenderLlamadosMesa(nums) {
  const ls = [...llamadosMap.values()].filter((l) =>
    nums.includes(Number(l.mesaNumero)),
  );
  await Promise.all(
    ls.map((l) =>
      updateDoc(
        tiendaSubDoc(localidad, "tiendas", tiendaId, "llamados_mesa", l.id),
        {
          estado: "atendido",
          atendidoPor: "Panel",
          atendidoEn: serverTimestamp(),
        },
      ),
    ),
  );
}
function iniciarListenerLlamados() {
  if (!tiendaId || llamadosIniciado) return;
  llamadosIniciado = true;
  onSnapshot(
    query(
      tiendaSubCol(localidad, "tiendas", tiendaId, "llamados_mesa"),
      where("estado", "==", "pendiente"),
    ),
    (snap) => {
      const nuevos = [];
      snap.docChanges().forEach((ch) => {
        if (ch.type === "removed") return llamadosMap.delete(ch.doc.id);
        const d = { id: ch.doc.id, ...ch.doc.data() };
        if (ch.type === "added" && !llamadosPrimero) nuevos.push(d);
        llamadosMap.set(ch.doc.id, d);
      });
      llamadosPrimero = false;
      if (originFilter === "mesa") renderMesaGrid();
      if (activeModalId && String(activeModalId).startsWith("mesa:"))
        renderMesaDetail(Number(String(activeModalId).split(":")[1]));
      if (nuevos.length) {
        playMesaChime();
        bellRingFeedback();
        showToast(
          nuevos
            .map(
              (l) =>
                `${l.motivo === "cuenta" ? "🧾" : "🔔"} ${l.mesaNombre || "Mesa " + l.mesaNumero}`,
            )
            .join(" · "),
        );
      }
    },
    (err) => console.warn("llamados_mesa:", err),
  );
}
function getPedidosDeMesa(numeroMesa) {
  const activos = [];
  mesasMap.forEach((m, mesaDocId) => {
    if (Number(m.numero_mesa) !== Number(numeroMesa)) return;

    // Mesa agrupada: el pedido real vive en grupos_mesas, no en la mesa
    if (m.grupoId) {
      const grupo = gruposMap.get(m.grupoId);
      if (!grupo || grupo.estado !== "activo" || !grupo.pedido) return;
      if (pedidoEsperaMozo(grupo.pedido)) return;
      const pseudoPedido = {
        estado: "pendiente",
        estadoMozo: grupo.pedido.estadoMozo || null,
        estadoMesa: grupo.pedido.estadoMesa || null,
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
        bloques: grupo.pedido.editadoPorMozo ? [] : grupo.pedido.bloques || [],
        total_items: grupo.pedido.total_items || 0,
        total: grupo.pedido.total || 0,
        pedidoDocId: grupo.pedidoGrupoDocId || null,
        grupoId: m.grupoId,
        comprobante: grupo.pedido.comprobante || null,
        pago_voucher: grupo.pedido.pago_voucher || null,
        pago_metodo: grupo.pedido.pago_metodo || null,
        comprobante_foto: grupo.pedido.comprobante_foto || null,
        descuentoCupon: grupo.pedido.descuentoCupon || 0,
      };
      activos.push([mesaDocId, pseudoPedido]);
      return;
    }

    // FIX: antes solo aceptaba "ocupado". Los pedidos nuevos de mesa llegan
    // con estado "pedido_pendiente" (esperando que el negocio los acepte),
    // así que hay que incluir ambos estados o getPedidosDeMesa() los descarta.
    if (
      (m.estado !== "ocupado" && m.estado !== "pedido_pendiente") ||
      !m.pedido
    )
      return;
    if (pedidoEsperaMozo(m.pedido)) return;
    const pseudoPedido = {
      estado: "pendiente",
      estadoMozo: m.pedido.estadoMozo || null,
      estadoMesa: m.pedido.estadoMesa || null,
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
      comprobante: m.pedido.comprobante || null,
      pago_voucher: m.pedido.pago_voucher || null,
      pago_metodo: m.pedido.pago_metodo || null,
      comprobante_foto: m.pedido.comprobante_foto || null,
      descuentoCupon: m.pedido.descuentoCupon || 0,
    };
    activos.push([mesaDocId, pseudoPedido]);
  });
  return activos;
}
function getMesaEstadoVisual(m, activos) {
  if (activos.length > 0 || m.estado === "ocupado" || mesaEsperaMozo(m)) {
    const sinConfirmar = activos.some(([, p]) => p.estadoMozo !== "confirmado");
    return sinConfirmar ? "pedido_pendiente" : "ocupada";
  }
  if (m.estado === "reserva_pendiente") return "reserva_pendiente";
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
function maxMesasPlan() {
  const n = Number(
    PLAN_SERV?.cliente_y_fidelizacion?.miqr?.mesas?.cantidad_max,
  );
  return Number.isFinite(n) ? n : null;
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

  const todas = [...mesasMap.values()]
    .sort((a, b) => (a.numero_mesa || 0) - (b.numero_mesa || 0))
    .slice(0, maxMesasPlan() ?? undefined);
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
        const alerta = estadoVisual === "libre" ? "" : alertaDeMesas([m]);
        const total = activos.reduce((s, [, p]) => s + Number(p.total || 0), 0);
        const label = {
          ocupada: "Ocupada",
          libre: "Libre",
          reservada: "Reservada",
          pedido_pendiente: "🔔 Nuevo pedido",
          reserva_pendiente: "🔔 Nueva reserva",
        }[estadoVisual];
        const puedeReservar =
          estadoVisual !== "ocupada" &&
          estadoVisual !== "pedido_pendiente" &&
          estadoVisual !== "reserva_pendiente";
        const esSeleccionable = puedeReservar;
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
    <div class="mesa-box ${estadoVisual}${estadoMesaVis(estadoVisual, activos).cls} al-${alerta}${esSeleccionable ? " selectable" : ""}${estaSeleccionada ? " selected" : ""}" data-mesa="${m.numero_mesa}" data-mesa-doc="${mesaDocId}" data-selectable="${esSeleccionable}">
        <span class="mb-check">✓</span>
        <span class="mb-status"><span class="dot"></span>${label}</span>
        ${estadoMesaVis(estadoVisual, activos).badge}
                ${alertaBadgeHtml(alerta)}
        <div class="mb-name">${escapeHtml(m.nombre_alias || "Mesa " + m.numero_mesa)}</div>
        <div class="mb-total">${estadoVisual === "ocupada" ? fmtMoney(total) : "—"}</div>
     ${estadoVisual === "ocupada" ? `<div class="mb-count">${activos.length ? `${activos.length} pedido${activos.length === 1 ? "" : "s"}` : "Sin pedido registrado"}</div>` : ""}
   ${horaReservaHtml}
        ${reservaTimerHtml}
        ${puedeReservar ? `<button class="mesa-reservar-btn" data-mesa-reservar="${m.numero_mesa}">${estadoVisual === "reservada" ? "Quitar reserva" : "Reservar"}</button>` : ""}
   ${
     estadoVisual === "reserva_pendiente"
       ? `
  <div class="mesa-reserva-solicitante">${escapeHtml(m.reserva?.nombre || "")}</div>
  <div class="mesa-reserva-hora" style="color:#fbbf24;font-weight:800;">🕐 ${escapeHtml(m.reserva?.hora || "—")}${m.reserva?.personas ? ` · ${escapeHtml(String(m.reserva.personas))} pers.` : ""}</div>
  <div style="display:flex;gap:6px;margin-top:6px;">
    <button class="mesa-reservar-btn" data-reserva-aceptar="${m.numero_mesa}" style="border-color:#22c55e;color:#22c55e;">✓ Aceptar</button>
    <button class="mesa-reservar-btn" data-reserva-rechazar="${m.numero_mesa}" style="border-color:#f87171;color:#f87171;">✕ Rechazar</button>
  </div>`
       : ""
   }
    </div>`;
      }

      // Tarjeta única para todo el grupo: un solo total, un solo estado, abarca varias columnas
      const integrantes = bloque.integrantes;
      const primero = integrantes[0];
      const alerta = alertaDeMesas(integrantes.map((x) => x.m));
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
        {
          reservada: "Reservada",
          ocupada: "Ocupada",
          libre: "Sin agrupar",
          reserva_pendiente: "🔔 Nueva reserva",
        }[primero.estadoVisual] || "Ocupada";
      const grupoDocId = integrantes.map(
        (x) => [...mesasMap.entries()].find(([, mm]) => mm === x.m)?.[0],
      );
      const grupoInfo = gruposMap.get(bloque.grupoId);
      const esSeleccionableGrupo =
        primero.estadoVisual !== "ocupada" &&
        primero.estadoVisual !== "reserva_pendiente";
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
   <div class="mesa-box grupo ${primero.estadoVisual}${estadoMesaVis(primero.estadoVisual, primero.activos).cls} al-${alerta}${esSeleccionableGrupo ? " selectable" : ""}${grupoSeleccionado ? " selected" : ""}" data-mesa="${primero.m.numero_mesa}" data-grupo-id="${bloque.grupoId}" data-selectable="${esSeleccionableGrupo}" style="--grupo-color:${color}; grid-column: span ${anchoSpan};">
        <span class="mb-check">✓</span>
           <span class="mb-status"><span class="dot"></span>${labelEstadoGrupo} · Grupo</span>
        ${estadoMesaVis(primero.estadoVisual, primero.activos).badge}
                ${alertaBadgeHtml(alerta)}
        <div class="mb-name">${escapeHtml(nombres)}</div>
        <div class="mb-total">${primero.estadoVisual === "ocupada" ? fmtMoney(totalGrupo) : "—"}</div>
        ${primero.estadoVisual === "ocupada" ? `<div class="mb-count">${totalPedidos} pedido${totalPedidos === 1 ? "" : "s"} · cuenta única</div>` : ""}
    ${horaReservaHtml}
        ${reservaTimerHtml}
             ${primero.estadoVisual === "reservada" ? `<button class="mesa-reservar-btn" data-grupo-reservar="${bloque.grupoId}">Quitar reserva</button>` : ""}
     ${
       primero.estadoVisual === "reserva_pendiente"
         ? `
  <div class="mesa-reserva-solicitante">${escapeHtml(grupoInfo?.reserva?.nombre || "")}</div>
  <div class="mesa-reserva-hora" style="color:#fbbf24;font-weight:800;">🕐 ${escapeHtml(grupoInfo?.reserva?.hora || "—")}${grupoInfo?.reserva?.personas ? ` · ${escapeHtml(String(grupoInfo.reserva.personas))} pers.` : ""}</div>
  <div style="display:flex;gap:6px;margin-top:6px;">
    <button class="mesa-reservar-btn" data-grupo-reserva-aceptar="${bloque.grupoId}" style="border-color:#22c55e;color:#22c55e;">✓ Aceptar</button>
    <button class="mesa-reservar-btn" data-grupo-reserva-rechazar="${bloque.grupoId}" style="border-color:#f87171;color:#f87171;">✕ Rechazar</button>
  </div>`
         : ""
     }
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

  grid.querySelectorAll("[data-reserva-aceptar]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      aceptarReservaMesa(Number(btn.dataset.reservaAceptar));
    });
  });
  grid.querySelectorAll("[data-reserva-rechazar]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      rechazarReservaMesa(Number(btn.dataset.reservaRechazar));
    });
  });
  grid.querySelectorAll("[data-grupo-reserva-aceptar]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      aceptarReservaGrupo(btn.dataset.grupoReservaAceptar);
    });
  });
  grid.querySelectorAll("[data-grupo-reserva-rechazar]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      rechazarReservaGrupo(btn.dataset.grupoReservaRechazar);
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
  "Recojo en punto": "📍",
  "En mesa": "🍽️",
  "Campaña física": "📣", // 👈 NUEVO
};
const ICONOS_PAGO = { "Yape / Plin": "📱", Efectivo: "💵" };

function detalleCuponHtml(p) {
  const tipo = getTipoCuponPedido(p);
  if (!tipo) return "";
  const cups = cuponesDePedido(p);
  const total = Number(p.total) || 0;
  const subtotal = Number(p.subtotal) || 0;
  const descuento = Number(p.descuentoCupon) || 0;
  const deliv = Number(p.delivery?.costo) || 0;
  const canjes = detalleCanjesPedido(p);
  const puntosGastados = puntosGastadosPedido(p);
  const manual = cups.find((c) => c.tipo !== "producto") || null;
  const pagadoCanjes = canjes.reduce((s, x) => s + x.pagado, 0);
  const otros = (Array.isArray(p.productos) ? p.productos : []).filter(
    (it) => !it.esCanje,
  );
  const ahorroTotal =
    canjes.length && canjes.every((x) => x.ahorro != null)
      ? canjes.reduce((s, x) => s + x.ahorro, 0)
      : null;

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
  const fila = (l, v, estilo = "") =>
    `<div class="dm-cupon-row"${estilo ? ` style="${estilo}"` : ""}><span>${l}</span><span>${v}</span></div>`;
  const SEP =
    "border-top:1px dashed rgba(255,255,255,.14);padding-top:6px;margin-top:4px;";

  /* ── Un recuadro por producto canjeado ── */
  const bloquesCanje = canjes
    .map((x) => {
      const ops = opcionesDetalleLineas(x.it);
      const gratis = x.pagado <= 0.004;
      return `
      <div style="border:1px solid rgba(251,191,36,.3);background:rgba(251,191,36,.06);border-radius:12px;padding:10px 12px;margin-bottom:10px;">
        <div style="font-weight:800;font-size:13px;color:#fde68a;margin-bottom:4px;">👉 ENTREGAR: ${x.unidades}× ${escapeHtml(x.it.nombre)}</div>
        ${ops.map((o) => `<div class="dm-prod-cat" style="color:#a78bfa;">• ${escapeHtml(o)}</div>`).join("")}
        <div style="margin-top:6px;">
          ${fila("Beneficio canjeado", escapeHtml(x.beneficio))}
          ${x.normal != null ? fila("Precio normal", `<span style="text-decoration:line-through;color:var(--ink-faint);">${fmtMoney(x.normal)}</span>`) : ""}
          ${fila("Paga por este producto", gratis ? `<b style="color:#4ade80;">GRATIS</b>` : `<b>${fmtMoney(x.pagado)}</b>`)}
          ${x.ahorro != null && x.ahorro > 0.004 ? fila("Ahorro del cliente", `<b style="color:#4ade80;">-${fmtMoney(x.ahorro)}</b>`) : ""}
          ${x.puntos > 0 ? fila("Puntos descontados", `<b style="color:#fbbf24;">-${x.puntos} pts</b>`) : ""}
          ${x.codigos.length ? fila(x.codigos.length > 1 ? "Cupones" : "Cupón", `<span class="mono">${x.codigos.map((c) => escapeHtml(c)).join(", ")}</span>`) : ""}
        </div>
      </div>`;
    })
    .join("");

  /* ── Descuento manual (% / monto / envío gratis), si lo hay ── */
  let bloqueManual = "";
  if (manual) {
    const tipoTxt = manual.envioGratis
      ? "Envío gratis"
      : manual.tipoDescuentoManual === "porcentaje"
        ? `${manual.porcentajeManual || 0}% sobre el subtotal`
        : manual.tipoDescuentoManual === "monto"
          ? `Monto fijo de ${fmtMoney(manual.montoManual || 0)}`
          : "Descuento";
    bloqueManual = `
      <div style="margin-bottom:6px;">
        <div class="dm-prod-cat" style="font-weight:800;margin-bottom:4px;">${manual.origen === "fidelizacion" ? "⭐ Descuento canjeado con puntos" : "🎟️ Cupón del negocio"}</div>
        ${manual.codigo ? fila("Código de cupón", `<span class="mono">${escapeHtml(manual.codigo)}</span>`) : ""}
        ${fila("Tipo de descuento", tipoTxt)}
        ${Number(manual.compraMinima) > 0 ? fila("Compra mínima", fmtMoney(manual.compraMinima)) : ""}
        ${descuento > 0 ? fila("Descuento aplicado", `<b style="color:#4ade80;">-${fmtMoney(descuento)}</b>`) : ""}
      </div>`;
  }

  /* ── Resumen de dinero ── */
  const resumen = [];
  if (canjes.length && otros.length)
    resumen.push(
      fila(
        `Resto del pedido (${otros.length} producto${otros.length === 1 ? "" : "s"}, se cobra normal)`,
        fmtMoney(Math.max(0, subtotal - pagadoCanjes)),
      ),
    );
  resumen.push(fila("Subtotal", fmtMoney(subtotal)));
  if (descuento > 0)
    resumen.push(
      fila(
        "Descuento por cupón",
        `<span style="color:#4ade80;">-${fmtMoney(descuento)}</span>`,
      ),
    );
  if (deliv > 0) resumen.push(fila("Delivery", fmtMoney(deliv)));
  resumen.push(
    fila(`<b>Total a cobrar al cliente</b>`, `<b>${fmtMoney(total)}</b>`, SEP),
  );
  if (puntosGastados > 0)
    resumen.push(
      fila(
        "Puntos usados por el cliente",
        `<b style="color:#fbbf24;">-${puntosGastados} pts</b>`,
      ),
    );
  if (ahorroTotal != null && ahorroTotal > 0.004)
    resumen.push(
      fila(
        "Ahorro total del cliente",
        `<b style="color:#4ade80;">${fmtMoney(ahorroTotal)}</b>`,
      ),
    );

  const mixto =
    canjes.length && otros.length
      ? `<span style="font-weight:600;font-size:11px;color:var(--ink-dim);"> · pedido mixto</span>`
      : "";
  const aviso = canjes.length
    ? "⚠️ El cliente ya pagó este canje con puntos: entrega el producto tal como se indica arriba. Si rechazas el pedido, los puntos se le devuelven."
    : "⚠️ Verifica este descuento antes de aceptar el pedido, ya se aplicó automáticamente en el total.";

  return `
    <div class="dm-cupon-card" style="background:${cfg.bg};border:1px solid ${cfg.bd};">
      <p style="color:${cfg.col};font-weight:800;font-size:12.5px;margin-bottom:8px;">${cfg.titulo}${mixto}</p>
      ${bloquesCanje}
      ${bloqueManual}
      ${resumen.join("")}
      <p style="font-size:10.5px;color:var(--ink-faint);margin-top:8px;">${aviso}</p>
    </div>`;
}
function canjeResumenCardHtml(p) {
  const canjes = detalleCanjesPedido(p);
  if (!canjes.length) return "";
  const pts = puntosGastadosPedido(p);
  const nombres = canjes.map((x) => `${x.unidades}× ${x.it.nombre}`).join(", ");
  return `<div class="oc-canje-line" style="font-size:11px;font-weight:700;color:#fbbf24;margin-top:2px;">🎁 Canje: ${escapeHtml(nombres)}${pts ? ` · −${pts} pts` : ""}</div>`;
}
// Precio de una línea en la lista de productos del detalle
function precioLineaHtml(it) {
  const sub =
    Number(
      it.subtotal ?? Number(it.precio_unitario || 0) * Number(it.cantidad || 0),
    ) || 0;
  if (it.esCanje && sub <= 0.004)
    return `<span style="color:#4ade80;">GRATIS</span>`;
  return `S/ ${sub.toFixed(2)}`;
}
// Etiqueta bajo el nombre del producto canjeado
function canjeLineaBadgeHtml(it) {
  if (!it.esCanje) return "";
  const codigos =
    Array.isArray(it.cuponCodigos) && it.cuponCodigos.length
      ? it.cuponCodigos
      : it.cuponCodigo
        ? [it.cuponCodigo]
        : [];
  return `<div style="font-size:10.5px;font-weight:800;color:#fbbf24;margin-top:2px;">🎁 Canjeado con puntos${codigos.length ? " · cupón " + codigos.map((c) => escapeHtml(c)).join(", ") : ""}</div>`;
}
function cuponTagHtml(p) {
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
  return categoriasCupon(p)
    .map((t) => {
      const c = map[t];
      return `<span class="oc-cupon-tag" style="background:${c.bg};color:${c.col};">${c.ico} ${c.label}</span>`;
    })
    .join("");
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
  if (esPedidoCampana(p)) {
    return `<span class="oc-origin-tag" style="background:rgba(236,72,153,.15);color:#ec4899;">📣 Campaña</span>`;
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
      if (it.esCanje && !CANJE_DA_PUNTOS) continue;
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
  if (it.esCanje && !CANJE_DA_PUNTOS) return 0;
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
function linkSeguimientoPedido(id, p) {
  let base;
  if (bizDominioGlobal) {
    // Dominio propio: mismo formato que usa pedidos.js -> /pedido/{pedidoId}
    base = `https://${bizDominioGlobal}/pedido/${id}`;
  } else if (bizAliasGlobal) {
    base = `https://geinztech.com/perfil/${encodeURIComponent(bizAliasGlobal)}/${id}`;
  } else {
    base = `https://geinztech.com/pedidos/${tiendaId}/${id}`; // fallback formato viejo
  }

  // Pedidos de invitado: la página exige ?t=token_seguimiento
  const token =
    !p.cliente?.id_cliente && p.token_seguimiento
      ? `?t=${encodeURIComponent(p.token_seguimiento)}`
      : "";

  return base + token;
}
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

let busquedaTexto = "";
let filtroTipoPedido = "todos";
let busquedaIds = [];
let busquedaIdx = 0;

const FILTROS_PEDIDO = [
  ["todos", "Todos"],
  ["Delivery", "🛵 Delivery"],
  ["Recojo en local", "🏬 Recojo en local"],
  ["Recojo en punto", "📍 Recojo en punto"],
  ["Campaña física", "📣 Campaña"],
  ["canje_puntos", "🎁 Canjeados"],
  ["descuento_fidelizacion", "⭐ Desc. fidelización"],
  ["cupon_descuento", "🎟️ Cupón"],
];
const ENTREGAS = [
  "Delivery",
  "Recojo en local",
  "Recojo en punto",
  "Campaña física",
];

const normBusq = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

function pedidoCumpleTipo(p) {
  if (filtroTipoPedido === "todos") return true;
  if (ENTREGAS.includes(filtroTipoPedido))
    return p.cliente?.tipo_entrega === filtroTipoPedido;
  return categoriasCupon(p).includes(filtroTipoPedido);
}

function pedidoCoincideTexto(id, p, q) {
  if (codigoCortoPedido(id).toLowerCase().startsWith(q)) return true;
  if (normBusq(p.cliente?.nombre).includes(q)) return true;
  const digitos = q.replace(/\D/g, "");
  if (digitos.length >= 3) {
    const tel = String(p.cliente?.whatsapp || "").replace(/\D/g, "");
    if (tel.includes(digitos)) return true;
  }
  return false;
}

function irAPedidoBusqueda(id) {
  const p = pedidosMap.get(id);
  const estado = ESTADOS.includes(p?.estado) ? p.estado : "pendiente";
  if (estado === "rechazado")
    document
      .querySelector('.board-col[data-status="rechazado"]')
      ?.classList.add("expanded");
  if (activeTab !== estado) {
    activeTab = estado;
    document
      .querySelectorAll(".stab")
      .forEach((t) => t.classList.toggle("active", t.dataset.s === estado));
    document
      .querySelectorAll(".board-col")
      .forEach((c) =>
        c.classList.toggle("col-active", c.dataset.status === estado),
      );
  }
  document
    .getElementById(`order-${id}`)
    ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
}

/* Ilumina todas las coincidencias (se vuelve a llamar después de cada renderBoard) */
function reaplicarBusqueda({ scroll = false } = {}) {
  const q = normBusq(busquedaTexto.replace(/^#/, ""));
  if (!q) {
    busquedaIds = [];
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
    } else {
      limpiarResaltadoBusqueda();
      mostrarResultadoBusqueda("", "");
    }
    return;
  }

  busquedaIds = [...pedidosMap.entries()]
    .filter(([id, p]) => pedidoVisible(id, p) && pedidoCoincideTexto(id, p, q))
    .sort(
      (a, b) =>
        (toDate(b[1].timestamp)?.getTime() || 0) -
        (toDate(a[1].timestamp)?.getTime() || 0),
    )
    .map(([id]) => id);

  limpiarResaltadoBusqueda();
  if (!busquedaIds.length) {
    mostrarResultadoBusqueda("Sin coincidencias en el periodo visible", "warn");
    return;
  }
  busquedaIdx = Math.min(busquedaIdx, busquedaIds.length - 1);
  busquedaIds.forEach((id) =>
    document.getElementById(`order-${id}`)?.classList.add("oc-search-match"),
  );
  if (scroll) irAPedidoBusqueda(busquedaIds[busquedaIdx]);

  const n = busquedaIds.length;
  mostrarResultadoBusqueda(
    n === 1
      ? "📍 1 pedido encontrado"
      : `📍 ${busquedaIdx + 1} de ${n} · Enter para el siguiente`,
    "ok",
  );
}

function ejecutarBusquedaPedido(valorCrudo) {
  busquedaTexto = valorCrudo;
  const clearBtn = document.getElementById("pedidoSearchClear");
  if (clearBtn) clearBtn.style.display = valorCrudo.trim() ? "flex" : "none";
  pedidoSearchActivoId = null;
  busquedaIdx = 0;
  reaplicarBusqueda({ scroll: true });
}

document
  .getElementById("pedidoSearchInput")
  ?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || busquedaIds.length < 2) return;
    e.preventDefault();
    busquedaIdx = (busquedaIdx + 1) % busquedaIds.length;
    reaplicarBusqueda({ scroll: true });
  });

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
/* ── Aviso "ya llegué" del cliente (puede avisar varias veces) ── */
function numAvisosLlegada(p) {
  return p?.cliente_en_local ? Math.max(1, Number(p.avisos_llegada) || 1) : 0;
}
function textoLlegada(p) {
  const n = numAvisosLlegada(p);
  if (!n) return "";
  const lugar =
    p.cliente?.tipo_entrega === "Recojo en punto"
      ? "en el punto de entrega"
      : "en el local";
  return `📍 Cliente ${lugar}${n > 1 ? ` · avisó ${n} veces` : ""}`;
}
// true si es el primer aviso o un aviso repetido
function esAvisoLlegadaNuevo(anterior, data) {
  if (!data.cliente_en_local) return false;
  if (!anterior?.cliente_en_local) return true;
  if (
    (Number(data.avisos_llegada) || 0) > (Number(anterior.avisos_llegada) || 0)
  )
    return true;
  const t1 = data.cliente_en_local_en?.toMillis?.() || 0;
  const t0 = anterior.cliente_en_local_en?.toMillis?.() || 0;
  return t0 > 0 && t1 > t0;
}
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
  const extraPend = !!p.pago_extra?.voucher_url && !p.pago_extra?.voucher_visto;
  const voucherPendienteVer =
    !extraPend && !!p.pago?.voucher_url && !p.pago?.voucher_visto;
  const enLocalPend = !!p.cliente_en_local && !p.cliente_en_local_visto;
  card.className =
    "order-card" +
    (voucherPendienteVer ? " oc-pago-recibido" : "") +
    (extraPend ? " oc-pago-extra" : "") +
    (enLocalPend ? " oc-en-local" : "") +
    (deliveryBrillo.has(id) ? " oc-delivery-ok" : "");
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
    ${cliente.whatsapp ? `<div style="font-size:11px;font-weight:700;color:#25d366;margin-top:2px;">📱 ${escapeHtml(cliente.whatsapp)}</div>` : ""}
    ${p.cliente_en_local ? `<div style="font-size:11px;font-weight:800;color:#ec4899;margin-top:2px;">${textoLlegada(p)}</div>` : ""}
           ${getPuntosPedido(id, p) > 0 ? `<div class="oc-puntos-line" style="font-size:11px;font-weight:700;color:#fbbf24;margin-top:2px;">🎁 +${getPuntosPedido(id, p)} pts al cliente</div>` : ""}
       ${Number(p.descuentoCupon) > 0 ? `<div class="oc-descuento-line" style="font-size:11px;font-weight:700;color:#4ade80;margin-top:2px;">🏷️ Descuento aplicado: -${fmtMoney(p.descuentoCupon)}</div>` : ""}
       ${canjeResumenCardHtml(p)}
      ${p.tiempo_estimado ? `<div style="font-size:11px;font-weight:700;color:#a78bfa;margin-top:2px;">⏱️ ${p.tiempo_estimado.min}–${p.tiempo_estimado.max} min</div>` : ""}
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
  bloquearAceptarDelivery(actionsWrap, estado, p);
  card.appendChild(actionsWrap);

  return card;
}

function aplicarPagoExtra(container, estado, p) {
  const x = p.pago_extra;
  if (estado !== "en_pausa" || !x || x.estado === "confirmado") return;
  if (x.tipo === "devolucion") {
    container.insertAdjacentHTML(
      "afterbegin",
      `<div class="oc-puntos-aceptar" style="width:100%;">↩️ El nuevo total es menor: devuelve <strong>${fmtMoney(x.monto)}</strong> al cliente (pagó ${fmtMoney(x.ya_pagado)}). Luego reanuda el pedido.</div>`,
    );
    return;
  }
  const b = container.querySelector(
    '[data-action="en_proceso"],[data-action="listo"]',
  );
  if (b && !x.voucher_url) {
    b.disabled = true;
    b.textContent = "⏳ Esperando pago de la diferencia";
  }
  container.insertAdjacentHTML(
    "afterbegin",
    `<div class="oc-puntos-aceptar" style="width:100%;">💳 Diferencia a cobrar: <strong>${fmtMoney(x.monto)}</strong> ${
      x.voucher_url
        ? `· <a href="${escapeHtml(x.voucher_url)}" target="_blank" rel="noopener" style="color:#fcd34d;text-decoration:underline;">Ver comprobante</a>. Revísalo y reanuda.`
        : "· el cliente aún no sube el comprobante."
    }</div>`,
  );
}
function renderCardActions(container, id, estado, p) {
  container.innerHTML = "";

  if (estado === "pendiente") {
    const camp = esPedidoCampana(p);
    const destino = camp
      ? "listo"
      : requierePagoOnline(p)
        ? "pendiente_pago"
        : "en_proceso";
    const txt = camp
      ? "Aceptar →"
      : requierePagoOnline(p)
        ? "Aceptar y pedir pago →"
        : "Aceptar →";
    const puntosCalc = getPuntosPedido(id, p);
    const puntosNota =
      puntosCalc > 0
        ? `<div class="oc-puntos-aceptar" style="width:100%;">🎁 Al aceptar, el cliente ganará <strong>+${puntosCalc} puntos</strong></div>`
        : "";
    container.innerHTML = `
    ${puntosNota}
    <div class="oc-actions">
      <button class="oc-btn ghost danger" data-action="rechazado">✕ Rechazar</button>
      <button class="oc-btn ghost" data-action="_pausar">⏸️ Pausar</button>
      <button class="oc-btn primary v-violet" data-action="${destino}">${txt}</button>
    </div>`;
  } else if (estado === "pendiente_pago") {
    const tieneVoucher = !!p.pago?.voucher_url;
    container.innerHTML = `
    <div class="oc-final-tag" style="width:100%;background:rgba(251,191,36,.12);color:#fbbf24;">
      ${tieneVoucher ? "💸 Comprobante recibido, revísalo" : "⏳ Esperando comprobante del cliente"}
    </div>
    <div class="oc-actions" style="margin-top:8px;">
      <button class="oc-btn ghost danger" data-action="rechazado">✕ Rechazar</button>
      <button class="oc-btn ghost" data-action="_pausar">⏸️ Pausar</button>
      <button class="oc-btn primary v-green" data-action="en_proceso" ${tieneVoucher ? "" : "disabled"}>✅ Confirmar pago</button>
    </div>`;
  } else if (estado === "en_proceso") {
    // ya NO hay botón de pausar
    container.innerHTML = `
    <div class="oc-actions">
      <button class="oc-btn ghost" data-action="${requierePagoOnline(p) ? "pendiente_pago" : "pendiente"}">← Atrás</button>
      <button class="oc-btn primary v-green" data-action="listo">Listo ✓</button>
    </div>`;
  } else if (estado === "listo") {
    container.innerHTML = `
    <div class="oc-final-tag" style="width:100%;background:rgba(45,212,191,.12);color:#2dd4bf;">🛎️ Listo${p.cliente_en_local ? " · " + textoLlegada(p) : ""}</div>
    <div class="oc-actions" style="margin-top:8px;">
      <button class="oc-btn ghost" data-action="${esPedidoCampana(p) ? "pendiente" : "en_proceso"}">← Atrás</button>
      <button class="oc-btn primary v-green" data-action="entregado">Entregado ✓</button>
    </div>`;
  } else if (estado === "en_pausa") {
    const r = p.respuesta_cliente;
    container.innerHTML = `
      <div class="oc-final-tag" style="width:100%;background:rgba(56,189,248,.12);color:#38bdf8;">⏸️ Pedido en pausa</div>
      ${
        r
          ? `<div style="width:100%;font-size:12.5px;color:#38bdf8;padding:6px 2px;">Cliente eligió: <strong>${escapeHtml(textoRespuestaCliente(r))}</strong>`
          : `<div style="width:100%;font-size:12px;color:var(--ink-faint);padding:6px 2px;">Esperando respuesta del cliente…</div>`
      }
      <button class="oc-btn ghost danger" style="width:100%; margin-bottom:10px; margin-top:10px;" data-action="rechazado">✕ Cancelar pedido</button>
      <button class="oc-btn primary v-violet" style="width:100%;" data-action="${esPedidoCampana(p) ? "listo" : "en_proceso"}">▶️ Reanudar pedido</button> `;
  } else if (estado === "entregado") {
    container.innerHTML = `
      <div class="oc-final-row">
        <div class="oc-final-tag">✅ Entregado</div>
        <span class="oc-undo" data-action="${esPedidoCampana(p) ? "listo" : "en_proceso"}">↺ Reabrir</span>
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
  aplicarPagoExtra(container, estado, p);
  container.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (btn.dataset.action === "_pausar") return abrirModalPausa(id, p);
      accionEstado(id, p, estado, btn.dataset.action, btn);
    });
  });
}

/* ══════════════ Modal de detalle completo ══════════════ */
const detailOverlay = document.getElementById("detailOverlay");
const detailModal = document.getElementById("detailModal");

function openDetail(id) {
  deliveryBrillo.delete(id);
  document.getElementById(`order-${id}`)?.classList.remove("oc-delivery-ok");
  activeModalId = id;
  renderDetail(id);
  detailOverlay.classList.add("show");
  requestAnimationFrame(() => detailModal.classList.add("show"));
  document.body.style.overflow = "hidden";

  const p = pedidosMap.get(id);
  if (p?.pago?.voucher_url && !p.pago?.voucher_visto) {
    const ref = tiendaSubDoc(localidad, "tiendas", tiendaId, "pedidos", id);
    updateDoc(ref, { "pago.voucher_visto": true }).catch(() => {});
  }
  if (p?.pago_extra?.voucher_url && !p.pago_extra?.voucher_visto) {
    updateDoc(tiendaSubDoc(localidad, "tiendas", tiendaId, "pedidos", id), {
      "pago_extra.voucher_visto": true,
    }).catch(() => {});
  }
  if (p?.cliente_en_local && !p.cliente_en_local_visto) {
    updateDoc(tiendaSubDoc(localidad, "tiendas", tiendaId, "pedidos", id), {
      cliente_en_local_visto: true,
    }).catch(() => {});
  }
}
function closeDetail() {
  detailModal.classList.remove("show");
  detailOverlay.classList.remove("show");
  document.body.style.overflow = "";
  activeModalId = null;
}

function openMesaDetail(numeroMesa) {
  activeModalId = `mesa:${numeroMesa}`;
  mxEstado = { pago: null, mas: null };
  renderMesaDetail(numeroMesa);
  detailOverlay.classList.add("show");
  requestAnimationFrame(() => detailModal.classList.add("show"));
  document.body.style.overflow = "hidden";
}

/* ══════════════ DETALLE DE MESA — versión fácil de entender ══════════════ */
let mxEstado = { pago: null, mas: null }; // recuerda si el usuario abrió/cerró las secciones

const mxStyle = document.createElement("style");
mxStyle.textContent = `
.mx-hint{display:flex;gap:12px;align-items:center;padding:14px;border-radius:16px;background:rgba(124,92,255,.1);border:1px solid rgba(124,92,255,.3);margin-bottom:12px;}
.mx-hint .ic{font-size:32px;line-height:1;flex-shrink:0;}
.mx-hint b{display:block;font-size:15px;margin-bottom:2px;}
.mx-hint span{font-size:13px;color:var(--ink-dim);line-height:1.4;}
.mx-call{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-radius:16px;background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.4);margin-bottom:12px;}
.mx-call b{display:block;font-size:14px;}
.mx-call span{font-size:12px;color:var(--ink-dim);}
.mx-call button{border:none;border-radius:12px;padding:12px 14px;background:#f87171;color:#2a0606;font-weight:800;font-size:13px;cursor:pointer;flex-shrink:0;}
.mx-steps{display:flex;gap:6px;margin-bottom:12px;}
.mx-step{flex:1;text-align:center;padding:10px 4px;border-radius:14px;border:1px solid var(--line);opacity:.45;font-size:12px;font-weight:700;}
.mx-step b{display:flex;margin:0 auto 5px;width:28px;height:28px;border-radius:50%;background:var(--line);align-items:center;justify-content:center;font-size:14px;}
.mx-step.done{opacity:1;color:#4ade80;}
.mx-step.done b{background:#22c55e;color:#04240f;}
.mx-step.now{opacity:1;border-color:#7c5cff;background:rgba(124,92,255,.16);color:#fff;}
.mx-step.now b{background:#7c5cff;color:#fff;}
.mx-total{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-radius:16px;background:var(--surface);border:1px solid var(--line);margin-bottom:14px;}
.mx-total span{font-size:13px;font-weight:700;color:var(--ink-dim);}
.mx-total b{font-size:26px;font-weight:800;}
.mx-nota{padding:10px 12px;border-radius:12px;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);color:#fbbf24;font-size:13px;font-weight:600;margin-bottom:14px;}
.mx-group{margin-bottom:14px;}
.mx-group h4{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:var(--c);margin:0 0 8px;}
.mx-group h4 span{background:var(--c);color:#0a0a0f;border-radius:999px;padding:1px 8px;font-size:11.5px;}
.mx-item{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:12px;border:1px solid var(--line);border-left:4px solid var(--c);background:var(--surface);margin-bottom:6px;}
.mx-qty{font-size:15px;font-weight:800;min-width:30px;color:var(--c);}
.mx-info{flex:1;min-width:0;}
.mx-info b{display:block;font-size:14px;line-height:1.25;}
.mx-info small{display:block;font-size:12px;color:#a78bfa;margin-top:2px;}
.mx-info small.org{color:var(--ink-dim);}
.mx-price{font-weight:800;font-size:13.5px;white-space:nowrap;}
.mx-more{border:1px solid var(--line);border-radius:14px;margin-bottom:12px;background:rgba(255,255,255,.02);}
.mx-more>summary{list-style:none;cursor:pointer;padding:14px;font-weight:800;font-size:14px;display:flex;justify-content:space-between;align-items:center;}
.mx-more>summary::-webkit-details-marker{display:none;}
.mx-more>summary::after{content:"▾";color:var(--ink-dim);transition:transform .2s;}
.mx-more[open]>summary::after{transform:rotate(180deg);}
.mx-more>summary em{font-style:normal;font-size:11px;color:#4ade80;margin-left:8px;}
.mx-more-body{padding:0 12px 12px;}
.mx-actions{display:flex;flex-direction:column;gap:8px;width:100%;}
.mx-actions .mx-more{margin:0;}
.mx-btn{width:100%;min-height:56px;border-radius:14px;border:none;font-size:16px;font-weight:800;cursor:pointer;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:8px 12px;touch-action:manipulation;}
.mx-btn small{font-size:11.5px;font-weight:600;opacity:.85;}
.mx-btn:active{transform:scale(.98);}
.mx-btn:disabled{opacity:.5;cursor:not-allowed;}
.mx-btn.green{background:#22c55e;color:#04240f;}
.mx-btn.blue{background:#0ea5e9;color:#04202e;}
.mx-btn.violet{background:#7c5cff;}
.mx-btn.amber{background:#f59e0b;color:#1a1200;}
.mx-btn.ghost-green{background:transparent;border:2px solid #22c55e;color:#4ade80;min-height:48px;font-size:14px;}
.mx-btn.ghost-red{background:transparent;border:1px solid rgba(248,113,113,.4);color:#f87171;min-height:44px;font-size:13.5px;}
.mx-opt{width:100%;text-align:left;display:flex;flex-direction:column;gap:2px;padding:12px 14px;margin-bottom:8px;border-radius:12px;border:1px solid var(--line);background:var(--bg,#0a0a0f);color:#fff;font-size:14px;font-weight:700;cursor:pointer;}
.mx-opt small{font-size:11.5px;font-weight:500;color:var(--ink-dim);}
.mx-opt.danger{border-color:rgba(248,113,113,.4);color:#f87171;}
.mx-pay{padding:12px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.03);margin-bottom:12px;}
.mx-pay-t{font-size:13px;font-weight:800;margin-bottom:8px;}
.mx-pay-t em{font-style:normal;font-size:11.5px;color:#4ade80;margin-left:6px;}
.mx-pay-t em.w{color:#fbbf24;}
.mx-pay-row{display:flex;flex-wrap:wrap;gap:8px;}
.mx-pay-btn{flex:1 1 calc(50% - 8px);min-height:48px;border-radius:12px;border:2px solid var(--line);background:var(--bg,#0a0a0f);color:#fff;font-weight:800;font-size:13.5px;cursor:pointer;touch-action:manipulation;}
.mx-pay-btn.on{border-color:#22c55e;background:rgba(34,197,94,.15);color:#4ade80;}
`;
document.head.appendChild(mxStyle);

function mxRecordar(det, key) {
  det?.addEventListener("toggle", () => {
    mxEstado[key] = det.open;
  });
}
function mxNombreOrigen(it) {
  const m = it.mesaOrigenId ? mesasMap.get(it.mesaOrigenId) : null;
  return m ? m.nombre_alias || "Mesa " + m.numero_mesa : "";
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
  const nombreMesa = mesaInfo?.nombre_alias || "Mesa " + numeroMesa;
  const esPendienteAceptar =
    activos.length > 0 &&
    activos.some(([, p]) => p.estadoMozo !== "confirmado");

  /* ── Cabecera ── */
  detailModal.dataset.status = ocupada ? "pendiente" : "entregado";
  document.getElementById("dmId").innerHTML =
    `🍽️ Mesa <span class="oc-origin-tag mesa">${ocupada ? "Ocupada" : "Libre"}</span>`;
  document.getElementById("dmName").textContent = nombreMesa;
  const mesasDelGrupo = activos[0]?.[1]?.mesasGrupo;
  const esGrupoMulti = mesasDelGrupo && mesasDelGrupo.length > 1;
  const grupoLabel = esGrupoMulti
    ? ` · Junta con ${mesasDelGrupo
        .filter((m) => m.numero !== numeroMesa)
        .map((m) => m.nombre || "Mesa " + m.numero)
        .join(", ")}`
    : "";
  const dmTime = document.getElementById("dmTime");
  dmTime.removeAttribute("data-ts");
  dmTime.innerHTML = `<span class="pulse"></span><span class="ts-label">${ocupada ? "Falta cobrar" : "Disponible"}${escapeHtml(grupoLabel)}</span>`;

  /* ── Platos agrupados por estado ── */
  const GRUPOS = [
    ["aceptado", "🆕 Por preparar", "#fbbf24"],
    ["en_preparacion", "🔥 Preparando", "#38bdf8"],
    ["entregado", "🍽️ Ya entregado", "#4ade80"],
  ];
  const porEstado = { aceptado: [], en_preparacion: [], entregado: [] };
  activos.forEach(([, p]) =>
    (p.productos || []).forEach((it) => {
      const e = estItem(it, p);
      (porEstado[e] || porEstado.aceptado).push(it);
    }),
  );
  const stage = porEstado.aceptado.length
    ? 1
    : porEstado.en_preparacion.length
      ? 2
      : 3;

  const gruposHtml =
    GRUPOS.filter(([k]) => porEstado[k].length)
      .map(
        ([k, titulo, color]) => `
    <section class="mx-group" style="--c:${color}">
      <h4>${titulo} <span>${porEstado[k].length}</span></h4>
      ${porEstado[k]
        .map((it) => {
          const ops = opcionesDetalleLineas(it);
          const org = esGrupoMulti ? mxNombreOrigen(it) : "";
          const sub =
            it.subtotal ??
            Number(it.precio_unitario || 0) * Number(it.cantidad || 0);
          return `
        <div class="mx-item">
          <div class="mx-qty">${it.cantidad}×</div>
          <div class="mx-info">
            <b>${escapeHtml(it.nombre)}</b>
            ${ops.map((o) => `<small>${escapeHtml(o)}</small>`).join("")}
            ${org ? `<small class="org">🪑 ${escapeHtml(org)}</small>` : ""}
          </div>
          <div class="mx-price">${fmtMoney(sub)}</div>
        </div>`;
        })
        .join("")}
    </section>`,
      )
      .join("") ||
    `<p style="font-size:13px;color:var(--ink-faint);padding:6px 2px;">Esta mesa no tiene pedidos todavía.</p>`;

  /* ── Cuadro "¿Qué hago ahora?" ── */
  let hint;
  if (esPendienteAceptar)
    hint = [
      "🔔",
      "Pedido nuevo",
      "Revísalo y toca el botón verde «Aceptar pedido».",
    ];
  else if (!ocupada) hint = ["✅", "Mesa libre", "No hay nada que hacer aquí."];
  else if (!activos.length)
    hint = [
      "🪑",
      "Mesa ocupada sin pedido",
      "Si el cliente ya se fue, toca «Liberar mesa».",
    ];
  else if (stage === 1)
    hint = [
      "🆕",
      "Hay platos nuevos",
      "Avisa a cocina. Cuando empiecen a prepararlos, toca el botón azul.",
    ];
  else if (stage === 2)
    hint = [
      "🔥",
      "Cocina está preparando",
      "Cuando lleves todo a la mesa, toca el botón de abajo.",
    ];
  else
    hint = [
      "🍽️",
      "Todo fue entregado",
      "Cuando el cliente pague, toca «Cobrar y liberar mesa».",
    ];
  const hintHtml = `<div class="mx-hint"><div class="ic">${hint[0]}</div><div><b>${hint[1]}</b><span>${hint[2]}</span></div></div>`;

  /* ── Barra de pasos ── */
  const stepsHtml =
    activos.length && !esPendienteAceptar
      ? `<div class="mx-steps">${["Recibido", "Preparando", "Entregado"]
          .map((t, i) => {
            const k = i + 1;
            const cls = k < stage ? "done" : k === stage ? "now" : "";
            return `<div class="mx-step ${cls}"><b>${k < stage ? "✓" : k}</b>${t}</div>`;
          })
          .join("")}</div>`
      : "";

  /* ── Llamados del cliente (cuenta / mozo) ── */
  const numsLlamado = esGrupoMulti
    ? mesasDelGrupo.map((m) => Number(m.numero))
    : [Number(numeroMesa)];
  const llamadosAct = [...llamadosMap.values()].filter((l) =>
    numsLlamado.includes(Number(l.mesaNumero)),
  );
  const llamadosHtml = llamadosAct.length
    ? `<div class="mx-call">
         <div><b>${llamadosAct.map((l) => (l.motivo === "cuenta" ? "🧾 Piden la cuenta" : "🔔 Llaman al mozo")).join(" · ")}</b><span>El cliente está esperando</span></div>
         <button type="button" id="dmAtenderLlamado">✓ Ya lo atendí</button>
       </div>`
    : "";

  /* ── Notas y puntos ── */
  const notas = activos.map(([, p]) => p.nota).filter(Boolean);
  const notaHtml = notas.length
    ? `<div class="mx-nota">📝 Nota del cliente: ${escapeHtml(notas.join(" · "))}</div>`
    : "";
  const totalPuntos = activos.reduce(
    (s, [, p]) => s + (Number(p.puntos_ganados) || 0),
    0,
  );
  const puntosHtml =
    totalPuntos > 0
      ? `<div class="mx-nota">🎁 El cliente ganará +${totalPuntos} puntos al pagar</div>`
      : "";

  /* ── Voucher y comprobante (plegable) ── */
  const hayPago = activos.some(
    ([, p]) => p.comprobante || p.pago_voucher || p.comprobante_foto,
  );
  const pagoAbierto = mxEstado.pago ?? hayPago;
  const pagoHtml = activos.length
    ? `<details class="mx-more" id="mxPago" ${pagoAbierto ? "open" : ""}>
         <summary><span>🧾 Voucher y comprobante${hayPago ? "<em>● hay datos</em>" : ""}</span></summary>
         <div class="mx-more-body">${htmlComprobanteMesa(activos, numeroMesa)}</div>
       </details>`
    : "";
  const metodosAct = metodosPagoActivos();
  const mpActual =
    activos.find(([, p]) => p.pago_metodo)?.[1].pago_metodo || null;
  const metodoHtml =
    activos.length && metodosAct.length
      ? `<div class="mx-pay">
         <div class="mx-pay-t">💳 ¿Cómo pagó el cliente? ${mpActual ? `<em>✔ ${escapeHtml(mpActual.label)} · ${escapeHtml(mpActual.por || "")}</em>` : "<em class='w'>sin elegir</em>"}</div>
         <div class="mx-pay-row">
           ${metodosAct.map((m) => `<button type="button" class="mx-pay-btn${mpActual?.clave === m.clave ? " on" : ""}" data-mp="${m.clave}">${m.ico} ${escapeHtml(m.label)}</button>`).join("")}
         </div>
       </div>`
      : "";
  document.getElementById("dmBody").innerHTML = `
    ${llamadosHtml}
    ${hintHtml}
    ${stepsHtml}
    ${activos.length ? `<div class="mx-total"><span>Total a cobrar</span><b>${fmtMoney(total)}</b></div>` : ""}
    ${metodoHtml}
    ${notaHtml}
    ${gruposHtml}
    ${puntosHtml}
    ${pagoHtml}
  `;
  document.querySelectorAll("#dmBody [data-mp]").forEach((b) =>
    b.addEventListener("click", async () => {
      const m = metodosAct.find((x) => x.clave === b.dataset.mp);
      if (!m) return;
      try {
        await escribirPedidoMesa(activos, {
          pago_metodo: {
            clave: m.clave,
            label: m.label,
            por: "Negocio",
            ts: Date.now(),
          },
        });
        showToast(`${m.ico} Pago con ${m.label}`);
      } catch (e) {
        console.error(e);
        showToast("❌ No se pudo guardar el método", true);
      }
    }),
  );
  document
    .getElementById("dmAtenderLlamado")
    ?.addEventListener("click", () => atenderLlamadosMesa(numsLlamado));
  mxRecordar(document.getElementById("mxPago"), "pago");
  if (activos.length) enlazarComprobanteMesa(activos, numeroMesa);

  /* ── Botones de abajo: UN botón principal + "Más opciones" ── */
  const dmActions = document.getElementById("dmActions");
  dmActions.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "mx-actions";

  const btn = (txt, cls, fn, sub) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mx-btn " + cls;
    b.innerHTML = sub ? `${txt}<small>${sub}</small>` : txt;
    b.onclick = () => fn(b);
    return b;
  };
  const cobrar = (b) => {
    const mp = activos.find(([, p]) => p.pago_metodo)?.[1].pago_metodo;
    if (metodosAct.length && activos.length && !mp)
      return showToast("Elige primero cómo pagó el cliente 💳", true);
    if (
      window.confirm(
        `¿El cliente ya pagó ${fmtMoney(total)}${mp ? ` con ${mp.label}` : ""}?\n\nSe marcará como pagado y la mesa quedará libre.`,
      )
    )
      liberarMesa(numeroMesa, b);
  };
  const cancelar = (b) => {
    if (
      window.confirm(
        "¿Seguro que quieres cancelar este pedido?\n\nNo se cobra nada y la mesa quedará libre.",
      )
    )
      rechazarPedidoMesa(numeroMesa, b);
  };

  if (esPendienteAceptar) {
    wrap.append(
      btn(
        "✅ Aceptar pedido",
        "green",
        (b) => aceptarPedidoMesa(numeroMesa, b),
        "Confirmas que lo vas a atender",
      ),
      btn("No aceptar este pedido", "ghost-red", cancelar),
    );
  } else if (activos.length) {
    if (stage === 1)
      wrap.append(
        btn(
          "🔥 Ya empezaron a prepararlo",
          "blue",
          () => setEstadoMesaAdmin(numeroMesa, "en_preparacion"),
          "Toca cuando cocina empiece",
        ),
        btn("💰 Cobrar y liberar mesa", "ghost-green", cobrar),
      );
    else if (stage === 2)
      wrap.append(
        btn(
          "🍽️ Ya lo llevé a la mesa",
          "violet",
          () => setEstadoMesaAdmin(numeroMesa, "entregado"),
          "Toca cuando el cliente ya tenga su pedido",
        ),
        btn("💰 Cobrar y liberar mesa", "ghost-green", cobrar),
      );
    else
      wrap.append(
        btn(
          "💰 Cobrar y liberar mesa",
          "green",
          cobrar,
          "Hazlo cuando el cliente ya pagó",
        ),
      );
  } else if (ocupada) {
    wrap.append(
      btn(
        "🔓 Liberar mesa",
        "amber",
        (b) => liberarMesa(numeroMesa, b),
        "Esta mesa no tiene pedido",
      ),
    );
  } else {
    wrap.innerHTML = `<div class="oc-final-tag" style="width:100%;background:var(--green-soft);color:var(--green);">✅ Mesa libre</div>`;
  }

  /* ── Más opciones (lo menos usado, escondido) ── */
  const mesaEntry = [...mesasMap.entries()].find(
    ([, m]) => m.numero_mesa === numeroMesa,
  );
  const opts = [];
  if (activos.length && !esPendienteAceptar && stage < 3)
    opts.push([
      "🍽️ Marcar todo como entregado",
      "Si ya llevaste todo a la mesa",
      () => setEstadoMesaAdmin(numeroMesa, "entregado"),
    ]);
  if (mesaEntry && (ocupada || mesaEntry[1].grupoId)) {
    const [mesaDocIdTools, mTools] = mesaEntry;
    opts.push([
      "🔀 Cambiar de mesa",
      "Mover este pedido a otra mesa libre",
      () => abrirTrasladoMesas("traspasar", mesaDocIdTools),
    ]);
    opts.push([
      "🔗 Juntar con otra mesa",
      "Una sola cuenta para varias mesas",
      () => abrirTrasladoMesas("unir", mesaDocIdTools),
    ]);
    if (mTools.grupoId)
      opts.push([
        "⇱ Separar mesas",
        "Cada mesa vuelve a tener su propia cuenta",
        async () => {
          await separarGrupoConPedidos(mTools.grupoId);
          closeDetail();
        },
      ]);
  }
  if (activos.length && !esPendienteAceptar)
    opts.push([
      "🗑️ Cancelar pedido",
      "No se cobra nada y la mesa queda libre",
      () => cancelar(null),
      true,
    ]);

  if (opts.length) {
    const det = document.createElement("details");
    det.className = "mx-more";
    if (mxEstado.mas) det.open = true;
    det.innerHTML = `<summary><span>⋯ Más opciones</span></summary><div class="mx-more-body"></div>`;
    const body = det.querySelector(".mx-more-body");
    opts.forEach(([t, sub, fn, danger]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mx-opt" + (danger ? " danger" : "");
      b.innerHTML = `${t}<small>${sub}</small>`;
      b.onclick = fn;
      body.appendChild(b);
    });
    mxRecordar(det, "mas");
    wrap.appendChild(det);
  }
  dmActions.appendChild(wrap);
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

async function rechazarReservaMesa(numeroMesa) {
  const entry = [...mesasMap.entries()].find(
    ([, m]) => m.numero_mesa === numeroMesa,
  );
  if (!entry) return;
  const [mesaDocId] = entry;
  detenerSoundLoopParaReserva([numeroMesa]);
  try {
    await updateDoc(
      tiendaSubDoc(localidad, "tiendas", tiendaId, "mesas", mesaDocId),
      { estado: "libre", reserva: null, reservado_en: null },
    );
    showToast("🚫 Reserva rechazada");
  } catch (err) {
    console.error("Error rechazando reserva:", err);
    showToast("❌ No se pudo rechazar la reserva", true);
  }
}
function parseHoraReservaAHoy(horaStr) {
  const match = (horaStr || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const fecha = new Date();
  fecha.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (fecha.getTime() < Date.now()) fecha.setDate(fecha.getDate() + 1);
  return Timestamp.fromDate(fecha);
}

async function aceptarReservaMesa(numeroMesa) {
  const entry = [...mesasMap.entries()].find(
    ([, m]) => m.numero_mesa === numeroMesa,
  );
  if (!entry) return;
  const [mesaDocId, m] = entry;
  detenerSoundLoopParaReserva([numeroMesa]);
  try {
    await updateDoc(
      tiendaSubDoc(localidad, "tiendas", tiendaId, "mesas", mesaDocId),
      {
        estado: "reservada",
        reservado_en: serverTimestamp(),
        hora_reservada: parseHoraReservaAHoy(m.reserva?.hora) || null,
      },
    );
    showToast("🔔 Reserva aceptada");
  } catch (err) {
    console.error("Error aceptando reserva:", err);
    showToast("❌ No se pudo aceptar la reserva", true);
  }
}

async function aceptarReservaGrupo(grupoId) {
  const grupo = gruposMap.get(grupoId);
  const miembros = grupo?.mesas || [];
  const horaTs = parseHoraReservaAHoy(grupo?.reserva?.hora) || null;
  detenerSoundLoopParaReserva(miembros.map((m) => m.numero));
  try {
    const batch = writeBatch(db);
    miembros.forEach((m) => {
      batch.set(
        tiendaSubDoc(localidad, "tiendas", tiendaId, "mesas", m.id),
        {
          estado: "reservada",
          reservado_en: serverTimestamp(),
          hora_reservada: horaTs,
        },
        { merge: true },
      );
    });
    batch.set(
      tiendaSubDoc(localidad, "tiendas", tiendaId, "grupos_mesas", grupoId),
      {
        estado: "reservado",
        reservado_en: serverTimestamp(),
        hora_reservada: horaTs,
      },
      { merge: true },
    );
    await batch.commit();
    showToast("🔔 Reserva de grupo aceptada");
  } catch (err) {
    console.error("Error aceptando reserva de grupo:", err);
    showToast("❌ No se pudo aceptar la reserva", true);
  }
}

async function rechazarReservaGrupo(grupoId) {
  const grupo = gruposMap.get(grupoId);
  const miembros = grupo?.mesas || [];
  detenerSoundLoopParaReserva(miembros.map((m) => m.numero));
  try {
    const batch = writeBatch(db);
    miembros.forEach((m) => {
      batch.set(
        tiendaSubDoc(localidad, "tiendas", tiendaId, "mesas", m.id),
        {
          estado: "libre",
          grupoId: null,
          grupo_color: null,
          reserva: null,
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
    showToast("🚫 Reserva de grupo rechazada");
  } catch (err) {
    console.error("Error rechazando reserva de grupo:", err);
    showToast("❌ No se pudo rechazar la reserva", true);
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
  if (grupo?.pedido) return separarGrupoConPedidos(grupoId);
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

/* ═══ Comprobante electrónico + voucher por mesa (dashboard manda) ═══ */
function _mesaNombreDe(activos, numeroMesa) {
  const p = activos[0]?.[1];
  return p?.mesa?.nombre || "Mesa " + numeroMesa;
}
// Escribe campos en los 3 sitios donde vive el pedido de la mesa
async function escribirPedidoMesa(activos, campos) {
  const tareas = [];
  const vistos = new Set();
  activos.forEach(([mesaDocId, pp]) => {
    const pref = {};
    Object.entries(campos).forEach(([k, v]) => (pref["pedido." + k] = v));
    if (pp.grupoId) {
      if (!vistos.has("g" + pp.grupoId)) {
        vistos.add("g" + pp.grupoId);
        tareas.push(
          updateDoc(
            tiendaSubDoc(
              localidad,
              "tiendas",
              tiendaId,
              "grupos_mesas",
              pp.grupoId,
            ),
            pref,
          ),
        );
      }
    } else {
      tareas.push(
        updateDoc(
          tiendaSubDoc(localidad, "tiendas", tiendaId, "mesas", mesaDocId),
          pref,
        ),
      );
    }
    if (pp.pedidoDocId && !vistos.has("p" + pp.pedidoDocId)) {
      vistos.add("p" + pp.pedidoDocId);
      tareas.push(
        updateDoc(
          tiendaSubDoc(
            localidad,
            "tiendas",
            tiendaId,
            "pedidos",
            pp.pedidoDocId,
          ),
          campos,
        ),
      );
    }
  });
  await Promise.all(tareas);
}
function htmlComprobanteMesa(activos, numeroMesa) {
  const conComp = activos.filter(([, p]) => p.comprobante);
  const nom = _mesaNombreDe(activos, numeroMesa);
  const tarjetas = conComp
    .map(([, p], i) =>
      htmlRecuadroSunat(p.comprobante, p, nom, { acciones: true }).replace(
        "<div data-cm-card",
        `<div data-cm-card data-i="${i}"`,
      ),
    )
    .join("");
  const voucher = activos.find(([, p]) => p.pago_voucher)?.[1]?.pago_voucher;
  const vHtml = `
    <div style="border:1px solid rgba(139,92,246,.3);background:rgba(139,92,246,.08);border-radius:14px;padding:12px 14px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <b style="font-size:13px;">💸 Voucher de pago ${voucher ? "(recibido)" : "(sin subir)"}</b>
        <button type="button" id="dmVoucherSubir" class="oc-btn ghost" style="min-height:34px;">${voucher ? "Cambiar" : "📤 Subir"}</button>
      </div>
      ${
        voucher
          ? `<img src="${escCm(voucher.url)}" alt="voucher" id="dmVoucherImg" style="margin-top:10px;max-width:100%;max-height:260px;border-radius:10px;cursor:zoom-in;display:block;">
      <div style="font-size:11px;color:#a89cc4;margin-top:6px;">Subido por ${escCm(voucher.por || "—")}. Revísalo y marca la mesa como pagada abajo.</div>`
          : ""
      }
    </div>`;
  const fotoSuelta = !conComp.length
    ? activos.find(([, p]) => p.comprobante_foto)?.[1]?.comprobante_foto
    : null;
  const fHtml = fotoSuelta
    ? `<div style="border:1px solid rgba(139,92,246,.3);background:rgba(139,92,246,.08);border-radius:14px;padding:12px 14px;margin-bottom:12px;"><b style="font-size:13px;">📎 Adjunto del comprobante (${escCm(fotoSuelta.por || "mozo")})</b><img src="${escCm(fotoSuelta.url)}" onclick="window.open(this.src,'_blank')" style="margin-top:8px;max-width:100%;max-height:240px;border-radius:10px;cursor:zoom-in;display:block;"></div>`
    : "";
  return tarjetas + fHtml + vHtml;
}
const _pedidoEmitido = (p, numero) => ({
  ...p.comprobante,
  estado: "emitido",
  numero,
  emitidoTs: Date.now(),
});
function enlazarComprobanteMesa(activos, numeroMesa) {
  const body = document.getElementById("dmBody");
  const nom = _mesaNombreDe(activos, numeroMesa);
  const conComp = activos.filter(([, p]) => p.comprobante);
  body.querySelectorAll("[data-cm-card]").forEach((card) => {
    const entry = conComp[Number(card.dataset.i)];
    if (!entry) return;
    const p = entry[1];
    enlazarCopiar(card, p.comprobante, p, nom, showToast);
    card
      .querySelector("[data-cm-emitido]")
      ?.addEventListener("click", async () => {
        const numero = (
          prompt("N° del comprobante emitido (ej. B001-123). Opcional:") ?? ""
        ).trim();
        try {
          await escribirPedidoMesa([entry], {
            comprobante: _pedidoEmitido(p, numero),
          });
          showToast("✅ Comprobante marcado como emitido");
        } catch (e) {
          console.error(e);
          showToast("❌ No se pudo actualizar", true);
        }
      });
  });
  document
    .getElementById("dmVoucherSubir")
    ?.addEventListener("click", async () => {
      const url = await elegirFoto();
      if (!url) return;
      try {
        await escribirPedidoMesa(activos, {
          pago_voucher: { url, por: "Negocio", ts: Date.now() },
        });
        showToast("💸 Voucher guardado");
      } catch (e) {
        console.error(e);
        showToast("❌ No se pudo subir el voucher", true);
      }
    });
  document
    .getElementById("dmVoucherImg")
    ?.addEventListener("click", (e) => window.open(e.target.src, "_blank"));
}
// Foto fija de lo cobrado (la mesa se libera y su pedido sale de la mesa)
function snapshotCobro(activos, numeroMesa) {
  return {
    numeroMesa,
    nombre: _mesaNombreDe(activos, numeroMesa),
    pedidos: activos.map(([, pp]) => {
      const real = pedidosMap.get(pp.pedidoDocId) || {};
      return {
        ...real,
        ...pp,
        id: pp.pedidoDocId,
        comprobante: pp.comprobante || real.comprobante || null,
      };
    }),
  };
}
// Recién aquí aparece "Imprimir comprobante" + datos para copiar y pegar
function mostrarPostCobro(snap) {
  activeModalId = `cobro:${snap.numeroMesa}`;
  detailModal.dataset.status = "entregado";
  document.getElementById("dmId").innerHTML =
    `🍽️ ${escapeHtml(snap.nombre)} <span class="oc-origin-tag mesa">Cobrada y libre</span>`;
  document.getElementById("dmName").textContent = "✅ Cobro registrado";
  document.getElementById("dmTime").innerHTML = "";
  const total = snap.pedidos.reduce((s, p) => s + Number(p.total || 0), 0);
  const cards = snap.pedidos
    .map((p, i) =>
      p.comprobante
        ? htmlRecuadroSunat(p.comprobante, p, snap.nombre, {
            acciones: true,
          }).replace("<div data-cm-card", `<div data-cm-card data-i="${i}"`)
        : "",
    )
    .join("");
  const body = document.getElementById("dmBody");
  body.innerHTML = `
    <div class="dm-total-row"><span class="dm-total-lbl">Total cobrado</span><span class="dm-total-val">${fmtMoney(total)}</span></div>
    ${cards || `<p style="font-size:12.5px;color:var(--ink-faint);">El cliente no pidió boleta/factura. Puedes imprimir el ticket.</p>`}`;
  body.querySelectorAll("[data-cm-card]").forEach((card) => {
    const p = snap.pedidos[Number(card.dataset.i)];
    enlazarCopiar(card, p.comprobante, p, snap.nombre, showToast);
    card
      .querySelector("[data-cm-emitido]")
      ?.addEventListener("click", async () => {
        const numero = (
          prompt("N° del comprobante emitido (ej. B001-123). Opcional:") ?? ""
        ).trim();
        try {
          if (p.id)
            await updateDoc(
              tiendaSubDoc(localidad, "tiendas", tiendaId, "pedidos", p.id),
              { comprobante: _pedidoEmitido(p, numero) },
            );
          p.comprobante = _pedidoEmitido(p, numero);
          mostrarPostCobro(snap);
          showToast("✅ Marcado como emitido");
        } catch (e) {
          console.error(e);
          showToast("❌ No se pudo actualizar", true);
        }
      });
  });
  const acts = document.getElementById("dmActions");
  acts.innerHTML = "";
  const imp = document.createElement("button");
  imp.className = "oc-btn primary v-violet";
  imp.style.cssText = "width:100%;";
  imp.textContent = "🖨️ Imprimir comprobante";
  imp.onclick = async () => {
    for (const p of snap.pedidos) await imprimirComprobantePedido(p);
  };
  const cer = document.createElement("button");
  cer.className = "oc-btn ghost";
  cer.style.cssText = "width:100%;margin-top:8px;";
  cer.textContent = "Cerrar";
  cer.onclick = closeDetail;
  acts.append(imp, cer);
  detailOverlay.classList.add("show");
  requestAnimationFrame(() => detailModal.classList.add("show"));
  document.body.style.overflow = "hidden";
}
async function liberarMesa(numeroMesa, btnEl) {
  const activos = getPedidosDeMesa(numeroMesa);
  const mesaEntry = [...mesasMap.entries()].find(
    ([, m]) => m.numero_mesa === numeroMesa,
  );
  if (!activos.length && mesaEntry?.[1]?.estado !== "ocupado") return;
  if (btnEl) btnEl.disabled = true;
  const snapCobro = activos.length ? snapshotCobro(activos, numeroMesa) : null;
  const cerrarODetalle = () =>
    snapCobro ? mostrarPostCobro(snapCobro) : closeDetail();
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
            ...datosVendedor(),
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
      cerrarODetalle();
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
              ...datosVendedor(),
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
    cerrarODetalle();
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
async function aceptarPedidoMesa(numeroMesa, btnEl) {
  const activos = getPedidosDeMesa(numeroMesa);
  if (!activos.length) return;
  if (btnEl) btnEl.disabled = true;

  try {
    const [, pseudoPedido] = activos[0];

    if (pseudoPedido.grupoId) {
      const grupo = gruposMap.get(pseudoPedido.grupoId);
      if (grupo?.pedido) {
        await updateDoc(
          tiendaSubDoc(
            localidad,
            "tiendas",
            tiendaId,
            "grupos_mesas",
            pseudoPedido.grupoId,
          ),
          { pedido: { ...grupo.pedido, estadoMozo: "confirmado" } },
        );
      }
      if (grupo?.pedidoGrupoDocId) {
        await updateDoc(
          tiendaSubDoc(
            localidad,
            "tiendas",
            tiendaId,
            "pedidos",
            grupo.pedidoGrupoDocId,
          ),
          { estadoMozo: "confirmado" },
        );
      }
    } else {
      const mesaEntry = [...mesasMap.entries()].find(
        ([, m]) => m.numero_mesa === numeroMesa,
      );
      if (!mesaEntry) return;
      const [mesaDocId, m] = mesaEntry;
      if (m.pedido) {
        await updateDoc(
          tiendaSubDoc(localidad, "tiendas", tiendaId, "mesas", mesaDocId),
          { pedido: { ...m.pedido, estadoMozo: "confirmado" } },
        );
      }
      if (pseudoPedido.pedidoDocId) {
        await updateDoc(
          tiendaSubDoc(
            localidad,
            "tiendas",
            tiendaId,
            "pedidos",
            pseudoPedido.pedidoDocId,
          ),
          { estadoMozo: "confirmado" },
        );
      }
    }

    detenerSoundLoopParaPedidoMesa(numeroMesa);
    showToast("🍽️ Pedido aceptado");
    closeDetail();
  } catch (err) {
    console.error("Error aceptando pedido de mesa:", err);
    showToast("❌ No se pudo aceptar el pedido", true);
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
              ${opcionesDetalleHtmlLineas(it)}
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
  if (!p) return false;

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

  // ── WhatsApp del cliente (ahora `cliente` ya está inicializado) ──
  const waLimpio = String(cliente.whatsapp || "").replace(/[^\d]/g, "");
  const linkPedido = linkSeguimientoPedido(id, p);
  const mensajeWa =
    `Hola ${cliente.nombre || ""}, te escribimos de ${bizNombreGlobal} por tu pedido ` +
    `#${id.slice(0, 6).toUpperCase()}. Puedes ver el estado en tiempo real aquí:\n${linkPedido}`;

  const confirmarEfectivo =
    pago.metodo === "Efectivo" &&
    estado === "pendiente" &&
    ["Delivery", "Recojo en local", "Recojo en punto"].includes(
      cliente.tipo_entrega,
    );
  const whatsappBlock = waLimpio
    ? `<div class="dm-meta-item full">
       <div class="dm-meta-label">📱 WhatsApp del cliente</div>
       <div class="dm-meta-value">${escapeHtml(cliente.whatsapp)}</div>
       ${
         confirmarEfectivo
           ? `<div class="oc-puntos-aceptar" style="margin-top:8px;">📞 <strong>Llama al cliente para confirmar</strong> el pedido: es en efectivo y se paga contra entrega. Así evitas pedidos falsos.</div>`
           : ""
       }
       <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
         <a class="oc-btn ghost" style="text-decoration:none;text-align:center;flex:1;min-width:90px;color:#25d366;" href="https://wa.me/${waLimpio}?text=${encodeURIComponent(mensajeWa)}" target="_blank" rel="noopener">💬 Escribir</a>
         <a class="oc-btn ghost" style="text-decoration:none;text-align:center;flex:1;min-width:90px;" href="tel:+${waLimpio}">📞 Llamar</a>
         <button type="button" class="oc-btn ghost" style="flex:1;min-width:90px;" data-copiar-num="${waLimpio}">📋 Copiar</button>
       </div>
     </div>`
    : "";

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
        return `
    <div class="dm-prod-row">
      <div>
        <div class="dm-prod-name">${escapeHtml(it.nombre)}</div>
        ${it.categoria ? `<div class="dm-prod-cat">${escapeHtml(it.categoria)}</div>` : ""}
        ${canjeLineaBadgeHtml(it)}
        ${opcionesDetalleHtmlLineas(it)}
        <div class="dm-prod-qty">${it.cantidad} × S/ ${Number(it.precio_unitario || 0).toFixed(2)} c/u</div>
        ${ptsItem > 0 ? `<div class="dm-prod-puntos" style="font-size:10.5px;font-weight:700;color:#fbbf24;margin-top:2px;">🎁 +${ptsItem} pts</div>` : ""}
      </div>
      <div class="dm-prod-price">${precioLineaHtml(it)}</div>
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

  const vImg = (url, titulo) =>
    `<div style="flex:1;min-width:140px;">
       <div class="dm-meta-label">${titulo}</div>
       <a href="${escapeHtml(url)}" target="_blank" rel="noopener">
         <img src="${escapeHtml(url)}" alt="${titulo}" style="width:100%;max-width:220px;border-radius:12px;margin-top:6px;border:1px solid var(--line);display:block;">
       </a>
     </div>`;
  const voucherBlock =
    p.pago?.voucher_url || p.pago_extra?.voucher_url
      ? `<div class="dm-meta-item full">
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            ${p.pago?.voucher_url ? vImg(p.pago.voucher_url, "💸 Comprobante de pago") : ""}
            ${p.pago_extra?.voucher_url ? vImg(p.pago_extra.voucher_url, `💸 Comprobante de la diferencia (${fmtMoney(p.pago_extra.monto)})`) : ""}
          </div>
        </div>`
      : "";
  const dlvBtnBlock =
    origen.tipo !== "mesa" && cliente.tipo_entrega === "Delivery"
      ? `<div class="dm-meta-item full">
           <button type="button" class="oc-btn primary v-green" data-dlv-enviar style="width:100%;">🏍️ Enviar a mi delivery</button>
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
        ${whatsappBlock}
        ${
          p.cliente_en_local
            ? `<div class="dm-meta-item full">
                <div class="dm-meta-label">📍 Aviso de llegada</div>
                <div class="dm-meta-value" style="color:#ec4899;font-weight:800;">${escapeHtml(textoLlegada(p))}${
                  toDate(p.cliente_en_local_en)
                    ? ` · último aviso ${escapeHtml(timeAgo(toDate(p.cliente_en_local_en)))}`
                    : ""
                }</div>
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
        ${voucherBlock}
               ${deliveryFijarHTML(p)}
               ${mapaDeliveryHTML(p) || deliveryBlockSinMapa(p)}
               ${puntoEntregaDetalleHTML(p)}
             ${dlvBtnBlock}
        <div class="dm-meta-item full">
          <div class="dm-meta-label">📝 Nota del cliente</div>
          <div class="dm-meta-value ${p.nota ? "" : "dim"}">${p.nota ? escapeHtml(p.nota) : "Sin especificaciones adicionales"}</div>
        </div>
        ${autoNote}
      </div>
    </div>

    <div>
      <div class="dm-section-title">Productos · ${totalItems} item${totalItems === 1 ? "" : "s"}</div>
      ${
        origen.tipo === "mesa" && Array.isArray(p.bloques) && p.bloques.length
          ? bloquesHtml(p.bloques)
          : `<div class="dm-products">${prodRows}</div>`
      }
    </div>

    <div class="dm-total-row">
      <span class="dm-total-lbl">Total del pedido</span>
      <span class="dm-total-val">${fmtMoney(p.total)}</span>
    </div>
  `;

  bindMapaDeliveryClicks();
  document
    .querySelector("[data-copiar-num]")
    ?.addEventListener("click", async (e) => {
      const n = "+" + e.currentTarget.dataset.copiarNum;
      try {
        await navigator.clipboard.writeText(n);
        showToast("📋 Número copiado: " + n);
      } catch {
        showToast("No se pudo copiar", true);
      }
    });
  enlazarDeliveryFijar(id, p);
  document
    .querySelector("[data-abrir-ruta-negocio]")
    ?.addEventListener("click", () => rnAbrir());
  document
    .querySelector("[data-dlv-enviar]")
    ?.addEventListener("click", () => dlvAbrirSelector(id, p));
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
    const camp = esPedidoCampana(p);
    const puntosCalc = getPuntosPedido(id, p);
    const puntosNota =
      puntosCalc > 0
        ? `<div class="oc-puntos-aceptar" style="width:100%;">🎁 Al aceptar, el cliente ganará <strong>+${puntosCalc} puntos</strong></div>`
        : "";
    const destino = camp
      ? "listo"
      : requierePagoOnline(p)
        ? "pendiente_pago"
        : "en_proceso";
    const txt = camp
      ? "Aceptar pedido →"
      : requierePagoOnline(p)
        ? "Aceptar y pedir pago →"
        : "Aceptar pedido →";
    container.innerHTML = `
    ${puntosNota} 
    <button class="oc-btn ghost danger" data-action="rechazado">✕ Rechazar pedido</button>
    <button class="oc-btn ghost" data-action="_pausar">⏸️ Pausar pedido</button>
    
    <button class="oc-btn primary v-violet" data-action="${destino}">${txt}</button>`;
  } else if (estado === "pendiente_pago") {
    const tieneVoucher = !!p.pago?.voucher_url;
    container.innerHTML = `
    <div class="oc-final-tag" style="width:100%;background:rgba(251,191,36,.12);color:#fbbf24;">
      ${tieneVoucher ? "💸 Comprobante recibido, revísalo" : "⏳ Esperando comprobante del cliente"}
    </div>
    <button class="oc-btn ghost danger" data-action="rechazado">✕ Rechazar pedido</button>
    <button class="oc-btn ghost" data-action="_pausar">⏸️ Pausar pedido</button>
    <button class="oc-btn primary v-green" data-action="en_proceso" ${tieneVoucher ? "" : "disabled"}>✅ Confirmar pago</button>`;
  } else if (estado === "en_proceso") {
    container.innerHTML = `
      <button class="oc-btn ghost" data-action="pendiente">← Volver a pendiente</button>
      <button class="oc-btn ghost" data-action="_pausar">⏸️ Pausar pedido</button>
      <button class="oc-btn primary v-green"data-action="listo">Marcar listo ✓</button>`;
  } else if (estado === "listo") {
    container.innerHTML = `
    <div class="oc-final-tag" style="width:100%;background:rgba(45,212,191,.12);color:#2dd4bf;">🛎️ Pedido listo${p.cliente_en_local ? " · " + textoLlegada(p) : ""}</div>
    <button class="oc-btn ghost" data-action="${esPedidoCampana(p) ? "pendiente" : "en_proceso"}">← Volver a ${esPedidoCampana(p) ? "pendiente" : "en proceso"}</button>
    <button class="oc-btn primary v-green" data-action="entregado">Marcar entregado ✓</button>`;
  } else if (estado === "en_pausa") {
    const r = p.respuesta_cliente;
    container.innerHTML = `
      <div class="oc-final-tag" style="width:100%;background:rgba(56,189,248,.12);color:#38bdf8;">⏸️ Pedido en pausa</div>
      ${
        r
          ? `<div style="width:100%;font-size:12.5px;color:#38bdf8;padding:6px 2px;">Cliente eligió: <strong>${escapeHtml(textoRespuestaCliente(r))}</strong>`
          : `<div style="width:100%;font-size:12px;color:var(--ink-faint);padding:6px 2px;">Esperando respuesta del cliente…</div>`
      }
      <button class="oc-btn ghost danger" style="width:100%;" data-action="rechazado">✕ Cancelar pedido</button>
      <button class="oc-btn primary v-violet" style="width:100%;" data-action="${esPedidoCampana(p) ? "listo" : "en_proceso"}">▶️ Reanudar pedido</button>`;
  } else if (estado === "entregado") {
    container.innerHTML = `
  <div class="oc-final-tag" style="width:100%;">✅ Este pedido ya fue entregado</div>
  <button class="oc-btn ghost" style="width:100%;" data-action="_comprobante">🖨️ Imprimir comprobante</button>
  <div class="dm-undo-row" style="width:100%;"><span class="oc-undo" data-action="${esPedidoCampana(p) ? "listo" : "en_proceso"}">↺ Reabrir pedido</span></div>`;
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
  quitarPausaSiOff(container);
  bloquearAceptarDelivery(container, estado, p);
  aplicarPagoExtra(container, estado, p);
  container.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation?.();
      if (btn.dataset.action === "_pausar") return abrirModalPausa(id, p);
      if (btn.dataset.action === "_comprobante")
        return imprimirComprobantePedido({ id, ...p });
      if (btn.dataset.action === "_aceptar")
        return abrirModalTiempo(id, p, btn);
      accionEstado(id, p, estado, btn.dataset.action, btn);
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
    if (it.esPromo) continue; // las promos no tienen doc de stock
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
        // 1) Variantes (soporta texto, varias opciones y opciones con cantidad)
        const seleccion = it.opciones || null;
        if (
          seleccion &&
          typeof seleccion === "object" &&
          Array.isArray(data.condiciones) &&
          data.condiciones.length
        ) {
          updates.condiciones = data.condiciones.map((cond) => {
            const elegidas = entradasDeOpcion(seleccion[cond.nombre]);
            if (!elegidas.length) return cond;
            return {
              ...cond,
              opciones: (cond.opciones || []).map((op) => {
                const hit = elegidas.find(([n]) => n === op.nombre);
                if (!hit || typeof op.stock !== "number") return op;
                const nuevoStockOp = Math.max(0, op.stock - hit[1] * cantidad);
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
  if (!pedido || pedido.puntos_cupon_devueltos) return;
  const uid = pedido.cliente?.id_cliente;
  const cups = cuponesDePedido(pedido).filter(
    (c) => c.origen === "fidelizacion" && c.codigo,
  );
  const puntos = cups.reduce((s, c) => s + (Number(c.costoPuntos) || 0), 0);
  if (!uid || puntos <= 0) return;

  try {
    const batch = writeBatch(db);
    batch.update(clienteDoc(localidad, tiendaId, uid), {
      puntos: increment(puntos),
    });
    cups.forEach((c) => {
      batch.set(
        clienteCuponDoc(localidad, tiendaId, uid, c.codigo),
        {
          estado: "cancelado",
          canceladoEn: serverTimestamp(),
          devueltoPorPedido: pedidoId,
        },
        { merge: true },
      );
    });
    const histRef = doc(
      tiendaSubCol(
        localidad,
        "tiendas",
        tiendaId,
        "clientes",
        uid,
        "historial",
      ),
    );
    batch.set(histRef, {
      tipo: "devolucion",
      fecha: serverTimestamp(),
      puntos,
      concepto: `Pedido rechazado #${pedidoId.slice(0, 6).toUpperCase()} · puntos devueltos`,
      pedidoId,
      codigosCupon: cups.map((c) => c.codigo),
    });
    batch.update(
      tiendaSubDoc(localidad, "tiendas", tiendaId, "pedidos", pedidoId),
      { puntos_cupon_devueltos: true },
    );
    await batch.commit();
    showToast(`↩️ Se devolvieron ${puntos} puntos al cliente`);
  } catch (err) {
    console.error("No se pudieron devolver los puntos del cupón:", err);
    showToast("⚠️ No se pudieron devolver los puntos, revisa el pedido", true);
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
      pendiente_pago:
        "¡Tu pedido fue aceptado! Sube tu comprobante de pago para que lo preparemos",
      listo: "¡Tu pedido está listo! Puedes recogerlo en el local",
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
    if (nuevoEstado === "entregado") Object.assign(payload, datosVendedor());
    if (nuevoEstado === "en_proceso" && "tiempoEstimadoMin" in opts) {
      payload.tiempo_estimado_min = opts.tiempoEstimadoMin;
      payload.tiempo_estimado_desde = serverTimestamp();
    }
    if (nuevoEstado === "pendiente_pago")
      payload.pago_solicitado_en = serverTimestamp();
    if (opts.tiempo) {
      const esDel =
        pedidosMap.get(pedidoId)?.cliente?.tipo_entrega === "Delivery";
      payload.tiempo_estimado = {
        min: opts.tiempo.min,
        max: opts.tiempo.max,
        tipo: esDel ? "delivery" : "recojo",
      };
    }
    if (nuevoEstado === "en_proceso")
      payload.tiempo_estimado_desde = serverTimestamp();
    const peExtra = pedidosMap.get(pedidoId);
    if (
      peExtra?.pago_extra &&
      (peExtra.pago_extra.voucher_url ||
        peExtra.pago_extra.tipo === "devolucion") &&
      peExtra.pago_extra.estado !== "confirmado" &&
      ["en_proceso", "listo"].includes(nuevoEstado)
    ) {
      payload["pago_extra.estado"] = "confirmado";
      payload["pago.monto_pagado"] = Number(peExtra.total) || 0;
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
      pendiente_pago: "Pendiente de pago",
      listo: "Listo",
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
  if (!autoRejectEnabled || !PLAN_PED.autoOff || dateFilter.type !== "hoy")
    return;
  const limiteMs = autoRejectMinutes * 60000;
  const rechazadosAhora = [];

  pedidosMap.forEach((p, id) => {
    const estado = ESTADOS.includes(p.estado) ? p.estado : "pendiente";
    if (estado !== "pendiente") return; // esto ya excluye en_pausa, en_proceso, etc.
    if (getOrigen(p).tipo !== "whatsapp") return; // el auto-rechazo solo aplica a WhatsApp
    if (autoRejectingIds.has(id)) return;
    if (p.delivery_pendiente?.estado === "propuesto") return; // esperando al cliente
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
  if (!autoResEnabled || !PLAN_PED.autoReserva) return;
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
    pendiente_pago: [],
    en_proceso: [],
    listo: [],
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
  aplicarEstadosVisibles(grupos);
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
        pendiente_pago: "💸",
        en_proceso: "🧊",
        listo: "🛎️",
        en_pausa: "⏸️",
        entregado: "📭",
        rechazado: "🚫",
      };
      const msgMap = {
        pendiente: "No hay pedidos pendientes",
        pendiente_pago: "Ningún pedido esperando pago",
        en_proceso: "Nada en preparación ahora mismo",
        listo: "Ningún pedido listo",
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
  reaplicarBusqueda();
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
  chico: { col: 170, h: 150 },
  mediano: { col: 210, h: 168 },
  grande: { col: 270, h: 208 },
};
let mesaSize = localStorage.getItem("geinz_mesa_size") || "mediano";

function aplicarMesaSize() {
  const cfg = MESA_SIZES[mesaSize] || MESA_SIZES.mediano;
  document.documentElement.dataset.mesaSize = mesaSize;
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
      const gConPedido = [...gruposAfectados].filter(
        (g) => gruposMap.get(g)?.pedido,
      );
      if (gConPedido.length) {
        for (const g of gConPedido) await separarGrupoConPedidos(g);
        limpiarSeleccionMesas();
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
/* ══════ Helpers copiados del carrito (descuentos / ofertas) ══════ */
function parseFechaISOaMsLima(fechaISO, horaStr) {
  if (!fechaISO) return null;
  const [y, m, d] = fechaISO.split("-").map(Number);
  if (!y || !m || !d) return null;
  const [hh, mm] = (horaStr || "23:59").split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0) + 5 * 3600 * 1000;
}
function parseFechaHoraLimaOferta(fechaStr, horaStr) {
  const [d, m, y] = (fechaStr || "").split("/").map(Number);
  if (!d || !m || !y) return null;
  const [hh, mm] = (horaStr || "23:59").split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0) + 5 * 3600 * 1000;
}
function obtenerDiaSemanaLima(fecha = new Date()) {
  const n = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    weekday: "long",
  })
    .format(fecha)
    .toLowerCase();
  return (
    {
      sunday: "domingo",
      monday: "lunes",
      tuesday: "martes",
      wednesday: "miercoles",
      thursday: "jueves",
      friday: "viernes",
      saturday: "sabado",
    }[n] || null
  );
}
function descuentoVigente(descuento, ahora = new Date()) {
  if (!descuento || !descuento.activo) return null;
  const porcentaje = Number(descuento.porcentaje) || 0;
  if (porcentaje <= 0) return null;
  if (descuento.modo === "dias_semana") {
    if (!(descuento.dias || []).includes(obtenerDiaSemanaLima(ahora)))
      return null;
    return { porcentaje, expiraEn: null };
  }
  if (descuento.modo === "duracion") {
    const exp = Number(descuento.expiraEn) || 0;
    if (!exp || ahora.getTime() >= exp) return null;
    return { porcentaje, expiraEn: exp };
  }
  if (descuento.modo === "fecha") {
    const fin = parseFechaISOaMsLima(
      descuento.fechaFin,
      descuento.horaFin || "23:59",
    );
    if (!fin || ahora.getTime() >= fin) return null;
    if (descuento.fechaInicio) {
      const ini = parseFechaISOaMsLima(descuento.fechaInicio, "00:00");
      if (ini && ahora.getTime() < ini) return null;
    }
    return { porcentaje, expiraEn: fin };
  }
  return null;
}
function seleccionATexto(sel) {
  return Object.entries(sel || {})
    .map(([k, v]) => {
      const e = entradasDeOpcion(v).map(([n, c]) => (c > 1 ? `${n} x${c}` : n));
      return e.length ? `${k}: ${e.join(", ")}` : null;
    })
    .filter(Boolean)
    .join(" · ");
}
function precioCardHtml(p) {
  const d = descuentoVigente(p.descuento);
  if (!d) return fmtMoney(p.precio);
  const nuevo = +(p.precio * (1 - d.porcentaje / 100)).toFixed(2);
  return `<span style="text-decoration:line-through;color:var(--ink-faint);font-size:11px;margin-right:6px;">${fmtMoney(p.precio)}</span><span style="color:#fb7185;">${fmtMoney(nuevo)}</span> <span style="font-size:10px;color:#fb7185;">-${d.porcentaje}%</span>`;
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
  catalogoCompleto: false,
  cargadoEn: 0,
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
  adicionales: [],

  async cargarAdicionales() {
    try {
      const snap = await getDocs(
        tiendaSubCol(localidad, "tiendas", tiendaId, "adicionales"),
      );
      this.adicionales = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((a) => a.activo !== false && a.nombre);
    } catch (e) {
      console.warn("No se pudieron cargar los adicionales:", e);
      this.adicionales = [];
    }
    this.renderAdicionales();
  },

  renderAdicionales() {
    let box = document.getElementById("npAdicionales");
    if (!box) {
      box = document.createElement("div");
      box.id = "npAdicionales";
      document.querySelector(".np-cart-total")?.before(box);
      box.addEventListener("click", (e) => {
        const b = e.target.closest("[data-adic]");
        if (b) this.addAdicional(b.dataset.adic);
      });
    }
    box.style.display = this.adicionales.length ? "block" : "none";
    box.innerHTML = `
      <div class="np-adic-title">➕ Adicionales</div>
      <div class="np-adic-row">
        ${this.adicionales
          .map(
            (a) =>
              `<button type="button" class="np-adic-chip" data-adic="${a.id}">${escapeHtml(a.nombre)} · ${fmtMoney(a.precio)}</button>`,
          )
          .join("")}
      </div>`;
  },

  addAdicional(id) {
    const a = this.adicionales.find((x) => x.id === id);
    if (!a) return;
    const key = `adic__${id}`;
    const ex = this.carrito.get(key);
    if (ex) ex.cantidad += 1;
    else
      this.carrito.set(key, {
        id: key,
        cartKey: key,
        esAdicional: true,
        nombre: a.nombre,
        categoria: "",
        precio: Number(a.precio) || 0,
        imagen: a.imagen?.url || "",
        condiciones: [],
        seleccion: null,
        cantidad: 1,
      });
    this.renderCarrito();
  },
  renderMetodosPago() {
    const row = document.getElementById("npPagoRow");
    if (!row) return;
    let m = metodosPagoActivos(); // lee bizDataGlobal.metodos_pago (enable === true)
    if (!m.length) m = [{ clave: "efectivo", ico: "💵", label: "Efectivo" }];
    row.innerHTML = m
      .map(
        (x, i) =>
          `<button type="button" class="np-pago-btn${i === 0 ? " active" : ""}" data-pago="${escapeHtml(x.label)}" data-clave="${x.clave}">${iconoPago(x.clave)}<span>${escapeHtml(x.label)}</span></button>`,
      )
      .join("");
    this.metodoPago = m[0].label;
  },
  async cargarPromos() {
    const out = [];
    const biz = bizDataGlobal;
    const now = Date.now();
    const mk = (o) => ({
      condiciones: [],
      stock: null,
      descuento: null,
      variantesObligatoria: true,
      variantesMultiples: false,
      variantesConCantidad: false,
      esPromo: true,
      ...o,
      nombreNorm: this.normalizeText(o.nombre),
    });

    // Banner clickeable con precio
    const b = biz?.banner;
    const bPrecio = Number(b?.precio) || 0;
    const bDesc = String(b?.descripcion || "").trim();
    if (
      b?.activo === true &&
      b?.clickeable === true &&
      b?.imagen &&
      bDesc &&
      bPrecio > 0
    ) {
      out.push(
        mk({
          id: "promo__banner",
          nombre: bDesc.slice(0, 80),
          categoria: "Promociones",
          precio: bPrecio,
          imagen: b.imagen,
        }),
      );
    }

    // Promociones normales (ofertas 🔥)
    const raw = biz?.img_tienda?.lista_img?.promociones;
    if (raw && typeof raw === "object") {
      Object.entries(raw).forEach(([pid, p]) => {
        if (!p || typeof p !== "object") return;
        const precio = Number(p.precio) || 0;
        if (precio <= 0) return;
        const desc = String(p.descripcion || "").trim();
        out.push(
          mk({
            id: `promo__${pid}`,
            nombre: (desc || "Promoción").slice(0, 80),
            categoria: "ofertas 🔥",
            precio,
            imagen: p.imagen || "",
          }),
        );
      });
    }

    // Ofertas del momento (con hora/fecha de vencimiento)
    try {
      const snap = await getDocs(
        tiendaSubCol(localidad, "tiendas", tiendaId, "promociones_geinz"),
      );
      snap.forEach((ds) => {
        const data = ds.data();
        const fh = data.datos_hora_fecha || {};
        const info = data.informacion || data;
        if (data.estado !== "activo" || fh.activo === false) return;
        const ini = fh.timestamp_inicio?.toMillis
          ? fh.timestamp_inicio.toMillis()
          : null;
        if (ini && ini > now) return;
        let fin = fh.timestamp_fin?.toMillis
          ? fh.timestamp_fin.toMillis()
          : null;
        if (fin === null && fh.fecha_fin)
          fin = parseFechaHoraLimaOferta(fh.fecha_fin, fh.hora_fin);
        if (fin === null || fin < now) return;
        const precio = Number(data.precio_publicacion) || 0;
        if (precio <= 0) return;
        const img =
          data.img_container?.lista_img?.[0] ||
          data.img_container?.logo_img ||
          "";
        const titulo =
          String(info.titulo || "").trim() ||
          String(info.descripcion || "").trim() ||
          "Oferta";
        out.push(
          mk({
            id: `promo__activa_${ds.id}`,
            nombre: titulo.slice(0, 80),
            categoria: "momentaneas⏰",
            precio,
            imagen: img,
            esOfertaTiempo: true,
            expiraEn: fin,
          }),
        );
      });
    } catch (e) {
      console.warn("No se pudieron cargar las ofertas activas:", e);
    }
    return out;
  },
  /* ── Progreso de carga ── */
  mostrarSkeletons() {
    const grid = document.getElementById("npGrid");
    const empty = document.getElementById("npEmpty");
    if (empty) empty.style.display = "none";
    this.cardEls.clear();
    grid.innerHTML = Array.from({ length: 12 })
      .map(
        () => `
      <div class="np-skel">
        <div class="s-img"></div>
        <div class="s-line"></div>
        <div class="s-line short"></div>
      </div>`,
      )
      .join("");
  },
  setProgreso(pct, texto = "") {
    const wrap = document.getElementById("npProgress");
    const bar = document.getElementById("npProgressBar");
    const txt = document.getElementById("npProgressTxt");
    if (!wrap || !bar) return;
    wrap.classList.add("show");
    if (pct === null) {
      wrap.classList.add("indeterminate");
    } else {
      wrap.classList.remove("indeterminate");
      bar.style.width = Math.min(100, Math.max(0, pct)) + "%";
    }
    if (txt) txt.textContent = texto;
  },
  ocultarProgreso() {
    const wrap = document.getElementById("npProgress");
    const bar = document.getElementById("npProgressBar");
    const txt = document.getElementById("npProgressTxt");
    if (bar) bar.style.width = "100%";
    setTimeout(() => {
      wrap?.classList.remove("show", "indeterminate");
      if (bar) bar.style.width = "0%";
      if (txt) txt.textContent = "";
    }, 450);
  },
  cartKeyFor(id, sel) {
    const claves = Object.keys(sel || {}).filter(
      (k) => entradasDeOpcion(sel[k]).length,
    );
    if (!claves.length) return id;
    return `${id}__${claves
      .sort()
      .map(
        (k) =>
          `${k}:${entradasDeOpcion(sel[k])
            .map(([n, c]) => `${n}*${c}`)
            .sort()
            .join("+")}`,
      )
      .join("|")}`;
  },
  calcPrecioFinal(p, sel) {
    const d = descuentoVigente(p.descuento);
    let precio = Number(p.precio) || 0;
    if (d) precio = +(precio * (1 - d.porcentaje / 100)).toFixed(2);
    if (!sel) return precio;
    (p.condiciones || []).forEach((cond) =>
      entradasDeOpcion(sel[cond.nombre]).forEach(([n, c]) => {
        const op = cond.opciones.find((o) => o.nombre === n);
        if (op?.costoAdicional) precio += op.costoAdicional * c;
      }),
    );
    return +precio.toFixed(2);
  },
  getStockDisponible(p, sel) {
    if (!sel || !p.condiciones?.length)
      return typeof p.stock === "number" ? p.stock : null;
    let min = null;
    p.condiciones.forEach((cond) =>
      entradasDeOpcion(sel[cond.nombre]).forEach(([n, c]) => {
        const op = cond.opciones.find((o) => o.nombre === n);
        if (op && typeof op.stock === "number") {
          const lineas = Math.floor(op.stock / (c || 1));
          min = min === null ? lineas : Math.min(min, lineas);
        }
      }),
    );
    return min;
  },
  mapearProducto(pDoc, categoria, d) {
    const grupos = (d.condiciones || []).map((c) => {
      const multiple = c.tipo
        ? c.tipo === "multiple"
        : d.variantesMultiples === true;
      return {
        nombre: c.nombre,
        multiple,
        obligatoria:
          c.obligatoria !== undefined
            ? c.obligatoria !== false
            : d.variantesObligatoria !== false,
        conCantidad:
          multiple &&
          (c.conCantidad !== undefined
            ? c.conCantidad === true
            : d.variantesConCantidad === true),
        max: Number(c.max) > 0 ? Math.floor(Number(c.max)) : null,
        opciones: (c.opciones || [])
          .filter(
            (o) => o.activo && (typeof o.stock !== "number" || o.stock > 0),
          )
          .map((o) => ({
            nombre: o.nombre,
            descripcion: String(o.descripcion || "").trim(),
            imagen: o.imagen?.url || "",
            costoAdicional: Number(o.costoAdicional) || 0,
            stock: typeof o.stock === "number" ? o.stock : null,
            exclusiva: o.exclusiva === true,
            todas: o.todas === true,
            agotado: o.agotado === true,
          })),
      };
    });
    const grupoAgotado = grupos.some(
      (g) =>
        g.nombre &&
        g.obligatoria &&
        (!g.opciones.length || g.opciones.every((o) => o.agotado)),
    );
    const condiciones = grupos.filter((g) => g.nombre && g.opciones.length > 0);
    return {
      id: pDoc.id,
      categoria,
      nombre: d.nombre || "Producto",
      nombreNorm: this.normalizeText(d.nombre || ""),
      precio: Number(d.precio) || 0,
      imagen: d.imagenes?.[0]?.url || "",
      stock: typeof d.stock === "number" ? d.stock : null,
      agotado: grupoAgotado,
      condiciones,
      descuento: d.descuento || null,
      codigoBarras: String(d.codigo_barras ?? d.codigoBarras ?? "").trim(),
      descripcion: String(d.descripcion || "").trim(),
    };
  },

  cerrarOpciones() {
    document.getElementById("npOptOverlay").classList.remove("show");
    this._prodOpc = null;
    this._editKey = null;
  },
  abrirOpciones(p, selEx = null, editKey = null) {
    const obligatoria = p.variantesObligatoria !== false;
    const multiple = p.variantesMultiples === true;
    const conCant = multiple && p.variantesConCantidad === true;
    this._prodOpc = p;
    this._editKey = editKey;
    this._seleccion = {};
    Object.entries(selEx || {}).forEach(([k, v]) => {
      if (conCant) {
        const o = {};
        entradasDeOpcion(v).forEach(([n, c]) => (o[n] = c));
        this._seleccion[k] = o;
      } else if (multiple) {
        this._seleccion[k] = entradasDeOpcion(v).map(([n]) => n);
      } else {
        this._seleccion[k] = Array.isArray(v)
          ? v[0]
          : v && typeof v === "object"
            ? Object.keys(v)[0]
            : v;
      }
    });

    document.getElementById("npOptProdNombre").textContent = p.nombre;
    const body = document.getElementById("npOptBody");
    body.innerHTML = "";

    const aviso = (html) => {
      const el = document.createElement("p");
      el.style.cssText =
        "font-size:12px;color:var(--ink-dim);background:rgba(124,92,255,.08);border:1px dashed rgba(124,92,255,.35);border-radius:12px;padding:8px 12px;margin-bottom:10px;line-height:1.4;";
      el.innerHTML = html;
      body.appendChild(el);
    };
    if (conCant)
      aviso("✨ Elige opciones y usa + / − para la cantidad de cada una.");
    else if (multiple) aviso("✨ Puedes elegir <b>varias opciones</b>.");
    else if (!obligatoria) aviso("✨ Estas opciones son opcionales.");

    p.condiciones.forEach((cond) => {
      const grupo = document.createElement("div");
      grupo.className = "np-opt-group";
      const label = document.createElement("div");
      label.className = "np-opt-label";
      label.textContent = multiple
        ? `${cond.nombre} (elige varias)`
        : cond.nombre;
      grupo.appendChild(label);

      if (conCant) {
        const sel = this._seleccion;
        if (
          !sel[cond.nombre] ||
          typeof sel[cond.nombre] !== "object" ||
          Array.isArray(sel[cond.nombre])
        )
          sel[cond.nombre] = {};
        cond.opciones.forEach((op) => {
          const row = document.createElement("div");
          row.style.cssText =
            "display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid var(--line);margin-bottom:6px;";
          const info = document.createElement("span");
          info.style.fontSize = "12.5px";
          info.textContent = op.costoAdicional
            ? `${op.nombre} (+S/ ${op.costoAdicional.toFixed(2)} c/u)`
            : op.nombre;
          const stepper = document.createElement("div");
          stepper.style.cssText = "display:flex;align-items:center;gap:8px;";
          const set = (n) => {
            if (typeof op.stock === "number" && n > op.stock)
              return showToast(
                `⚠️ Solo quedan ${op.stock} de "${op.nombre}"`,
                true,
              );
            if (n <= 0) delete sel[cond.nombre][op.nombre];
            else sel[cond.nombre][op.nombre] = n;
            paint();
            this._refrescarOpciones();
          };
          const paint = () => {
            const c = sel[cond.nombre][op.nombre] || 0;
            stepper.innerHTML = "";
            const mk = (t, fn) => {
              const b = document.createElement("button");
              b.type = "button";
              b.className = "npc-ico";
              b.textContent = t;
              b.onclick = fn;
              return b;
            };
            if (c === 0) {
              const a = document.createElement("button");
              a.type = "button";
              a.className = "np-add-btn";
              a.style.cssText = "width:auto;padding:5px 10px;";
              a.textContent = "Agregar";
              a.onclick = () => set(1);
              stepper.appendChild(a);
            } else {
              const n = document.createElement("span");
              n.style.cssText =
                "min-width:16px;text-align:center;font-weight:800;font-size:13px;";
              n.textContent = c;
              stepper.append(
                mk("−", () => set(c - 1)),
                n,
                mk("+", () => set(c + 1)),
              );
            }
          };
          paint();
          row.append(info, stepper);
          grupo.appendChild(row);
        });
      } else {
        const fila = document.createElement("div");
        fila.className = "np-opt-row";
        if (
          !multiple &&
          !this._seleccion[cond.nombre] &&
          (obligatoria || editKey) &&
          cond.opciones.length
        )
          this._seleccion[cond.nombre] = cond.opciones[0].nombre;

        cond.opciones.forEach((op) => {
          const btn = document.createElement("button");
          btn.type = "button";
          const activa = () =>
            multiple
              ? entradasDeOpcion(this._seleccion[cond.nombre]).some(
                  ([n]) => n === op.nombre,
                )
              : this._seleccion[cond.nombre] === op.nombre;
          btn.className = "np-opt-btn" + (activa() ? " active" : "");
          btn.textContent =
            (op.costoAdicional
              ? `${op.nombre} (+S/ ${op.costoAdicional.toFixed(2)})`
              : op.nombre) +
            (typeof op.stock === "number" ? ` · Quedan ${op.stock}` : "");
          btn.onclick = () => {
            if (multiple) {
              const arr = [
                ...entradasDeOpcion(this._seleccion[cond.nombre]).map(
                  ([n]) => n,
                ),
              ];
              const i = arr.indexOf(op.nombre);
              if (i >= 0) arr.splice(i, 1);
              else arr.push(op.nombre);
              if (arr.length) this._seleccion[cond.nombre] = arr;
              else delete this._seleccion[cond.nombre];
              btn.classList.toggle("active", i < 0);
            } else {
              const ya = this._seleccion[cond.nombre] === op.nombre;
              fila
                .querySelectorAll(".np-opt-btn")
                .forEach((b) => b.classList.remove("active"));
              if (!obligatoria && ya) delete this._seleccion[cond.nombre];
              else {
                this._seleccion[cond.nombre] = op.nombre;
                btn.classList.add("active");
              }
            }
            this._refrescarOpciones();
          };
          fila.appendChild(btn);
        });
        grupo.appendChild(fila);
      }
      body.appendChild(grupo);
    });

    if (multiple) {
      const res = document.createElement("div");
      res.id = "npOptResumen";
      res.style.cssText =
        "border-radius:14px;padding:12px 14px;background:rgba(255,255,255,.04);border:1px solid var(--line);font-size:12.5px;line-height:1.6;";
      body.appendChild(res);
    }
    this._refrescarOpciones();
    document.getElementById("npOptOverlay").classList.add("show");
  },

  _refrescarOpciones() {
    const p = this._prodOpc;
    if (!p) return;
    const btn = document.getElementById("npOptConfirm");
    btn.textContent = `${this._editKey ? "Guardar cambios" : "Agregar al pedido"} · ${fmtMoney(this.calcPrecioFinal(p, this._seleccion))}`;
    btn.disabled =
      p.variantesObligatoria !== false &&
      p.condiciones.some(
        (c) => !entradasDeOpcion(this._seleccion[c.nombre]).length,
      );

    const res = document.getElementById("npOptResumen");
    if (!res) return;
    const filas = [];
    p.condiciones.forEach((cond) =>
      entradasDeOpcion(this._seleccion[cond.nombre]).forEach(([n, c]) => {
        const op = cond.opciones.find((o) => o.nombre === n);
        const extra = op?.costoAdicional
          ? `+${fmtMoney(op.costoAdicional * c)}`
          : "Incluido";
        filas.push(
          `<div style="display:flex;justify-content:space-between;"><span>• ${escapeHtml(cond.nombre)}: ${escapeHtml(n)}${c > 1 ? " x" + c : ""}</span><span style="color:var(--ink-dim);">${extra}</span></div>`,
        );
      }),
    );
    res.innerHTML = `<div style="display:flex;justify-content:space-between;"><span>Precio base</span><span>${fmtMoney(p.precio)}</span></div>
      ${filas.join("") || `<div style="color:var(--ink-dim);">Aún no marcaste ninguna opción.</div>`}
      <div style="display:flex;justify-content:space-between;font-weight:800;margin-top:8px;padding-top:8px;border-top:1px solid var(--line);"><span>Precio final (c/u)</span><span>${fmtMoney(this.calcPrecioFinal(p, this._seleccion))}</span></div>`;
  },

  confirmarOpciones() {
    if (!this._prodOpc) return;
    const p = this._prodOpc;
    const seleccion = JSON.parse(JSON.stringify(this._seleccion));
    Object.keys(seleccion).forEach((k) => {
      if (!entradasDeOpcion(seleccion[k]).length) delete seleccion[k];
    });

    if (
      p.variantesObligatoria !== false &&
      p.condiciones.some((c) => !entradasDeOpcion(seleccion[c.nombre]).length)
    )
      return showToast("Elige una opción en cada campo", true);

    if (this._editKey) {
      const entry = this.carrito.get(this._editKey);
      const newKey = this.cartKeyFor(p.id, seleccion);
      const existente = this.carrito.get(newKey);
      const cantidadFinal =
        (existente && newKey !== this._editKey ? existente.cantidad : 0) +
        entry.cantidad;
      const disp = this.getStockDisponible(p, seleccion);
      if (typeof disp === "number" && cantidadFinal > disp)
        return showToast(
          `⚠️ No hay stock suficiente de esa variante (quedan ${disp})`,
          true,
        );

      this.carrito.delete(this._editKey);
      if (existente && newKey !== this._editKey)
        existente.cantidad += entry.cantidad;
      else {
        const d = descuentoVigente(p.descuento);
        this.carrito.set(newKey, {
          ...p,
          precio: this.calcPrecioFinal(p, seleccion),
          precioOriginal: d ? p.precio : null,
          descuentoPorcentaje: d ? d.porcentaje : null,
          cantidad: entry.cantidad,
          cartKey: newKey,
          seleccion,
        });
      }
    } else {
      this.add(p.id, seleccion);
    }
    this.cerrarOpciones();
    this.updateCardQty(p.id);
    this.renderCarrito();
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
      NPAdicionales.iniciar();
    if ((this.cargado && !forceReload) || this.cargando) return;
    this.cargando = true;
    this.catalogoCompleto = false;
    let huboError = false;
    if (forceReload) {
      this.productos = [];
      this.productosPorId = new Map();
    }
    this.mostrarSkeletons();
    this.setProgreso(null, "Buscando categorías…");
    try {
      const catRef = tiendaSubCol(localidad, "tiendas", tiendaId, "productos");
      const catSnap = await getDocs(catRef);
      this.categorias = catSnap.docs.map((d) => d.id);

      const totalCats = this.categorias.length || 1;
      let hechas = 0;
      this.setProgreso(5, `Cargando productos (0/${totalCats})…`);

      // Primera página de cada categoría, en paralelo
      const primeras = await Promise.all(
        this.categorias.map((categoria) =>
          this.cargarPaginaCategoria(categoria, null)
            .catch((err) => {
              console.warn(`No se pudo cargar "${categoria}":`, err);
              huboError = true;
              return { items: [], agotada: true, cursor: null };
            })
            .then((r) => {
              hechas++;
              this.setProgreso(
                5 + (hechas / totalCats) * 85,
                `Cargando productos (${hechas}/${totalCats})…`,
              );
              return r;
            }),
        ),
      );

      this.setProgreso(92, "Cargando promociones…");
      const promos = await this.cargarPromos();
      this.productos = [...promos, ...primeras.flatMap((r) => r.items)];
      this.productosPorId = new Map(this.productos.map((p) => [p.id, p]));
      this.cargado = true;
      this.renderFiltros();
      this.renderGrid();

      const pendientes = this.categorias.filter((_, i) => !primeras[i].agotada);
      if (pendientes.length) {
        this.setProgreso(null, "Cargando más productos…");
        Promise.all(
          this.categorias.map((categoria, i) =>
            !primeras[i].agotada
              ? this.seguirCargandoCategoria(categoria, primeras[i].cursor)
              : true,
          ),
        )
          .then((rs) => {
            if (!huboError && rs.every(Boolean)) {
              this.catalogoCompleto = true;
              this.cargadoEn = Date.now();
            }
          })
          .finally(() => this.ocultarProgreso());
      } else {
        if (!huboError) {
          this.catalogoCompleto = true;
          this.cargadoEn = Date.now();
        }
        this.ocultarProgreso();
      }
    } catch (err) {
      console.error("Error cargando catálogo:", err);
      this.ocultarProgreso();
      document.getElementById("npGrid").innerHTML = "";
      showToast("❌ No se pudo cargar el catálogo", true);
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
        return false;
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
    return true;
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
      res = res.filter(
        (p) =>
          this.filtroTexto
            .split(/\s+/)
            .every((w) => p.nombreNorm.includes(w)) ||
          (p.codigoBarras || "").includes(this.filtroTexto) ||
          (p.id || "").toLowerCase() === this.filtroTexto,
      );
    return res;
  },
  imgTag(p) {
    return p.imagen
      ? `<img data-fade src="${p.imagen}" alt="${escapeHtml(p.nombre)}" loading="lazy" onload="this.classList.add('loaded')" onerror="this.parentElement.classList.add('np-noimg');this.outerHTML='<div class=&quot;np-logo-circle&quot;><img src=&quot;../img/logo geinz.png&quot; alt=&quot;&quot;></div>';">`
      : `<div class="np-logo-circle"><img src="../img/logo geinz.png" alt=""></div>`;
  },
  cantEnCarrito(id) {
    return [...this.carrito.values()]
      .filter((i) => i.id === id)
      .reduce((s, i) => s + i.cantidad, 0);
  },

  updateCardQty(id) {
    const card = document.querySelector(
      `.np-card[data-id="${CSS.escape(id)}"]`,
    );
    if (!card) return;
    const n = this.cantEnCarrito(id);
    card.classList.toggle("in-cart", n > 0);
    let b = card.querySelector(".np-badge");
    if (n > 0) {
      if (!b) {
        b = document.createElement("span");
        b.className = "np-badge";
        card.querySelector(".np-img-wrap").appendChild(b);
      }
      b.textContent = n;
      b.classList.remove("np-bump");
      void b.offsetWidth;
      b.classList.add("np-bump");
    } else b?.remove();
  },

  cardEls: new Map(), // id -> <div> de la tarjeta (se crea UNA sola vez)

  crearCard(p) {
    const tieneVar = p.condiciones?.length > 0;
    const sinStock =
      p.agotado || (typeof p.stock === "number" && p.stock <= 0 && !tieneVar);
    const el = document.createElement("div");
    el.className = "np-card" + (sinStock ? " sin-stock" : "");
    el.dataset.id = p.id;
    el.title = p.nombre;
    el.innerHTML = `
      <div class="np-img-wrap${p.imagen ? "" : " np-noimg"}">${this.imgTag(p)}${sinStock ? `<span class="np-tag-agotado">Agotado</span>` : ""}</div>
      <div class="np-name">${escapeHtml(p.nombre)}</div>
      <div class="np-price">${precioCardHtml(p)}</div>`;
    el.querySelectorAll("img[data-fade]").forEach((i) => {
      if (i.complete && i.naturalWidth) i.classList.add("loaded");
    });
    return el;
  },

  // Solo actualiza el badge y el borde, sin tocar la imagen
  sincronizarCard(el, p) {
    const n = this.cantEnCarrito(p.id);
    el.classList.toggle("in-cart", n > 0);
    let b = el.querySelector(".np-badge");
    if (n > 0) {
      if (!b) {
        b = document.createElement("span");
        b.className = "np-badge";
        el.querySelector(".np-img-wrap").appendChild(b);
      }
      b.textContent = n;
    } else b?.remove();
  },

  renderGrid() {
    const grid = document.getElementById("npGrid");
    const empty = document.getElementById("npEmpty");
    grid.querySelectorAll(".np-skel").forEach((e) => e.remove());

    const visibles = new Set(this.getFiltrados().map((p) => p.id));

    this.productos.forEach((p) => {
      let el = this.cardEls.get(p.id);
      if (!el) {
        el = this.crearCard(p);
        this.cardEls.set(p.id, el);
      }
      if (el.parentElement !== grid) grid.appendChild(el); // solo se agrega si es nueva
      el.style.display = visibles.has(p.id) ? "" : "none"; // filtrar = mostrar/ocultar
      this.sincronizarCard(el, p);
    });

    empty.style.display = visibles.size ? "none" : "block";
  },
  abrirDetalle(id) {
    const p = this.productosPorId.get(id);
    if (!p) return;
    if (p.esOfertaTiempo && p.expiraEn && Date.now() >= p.expiraEn) {
      showToast("⏰ Esta oferta ya expiró", true);
      return;
    }
    const tieneVar = p.condiciones?.length > 0;
    this._det = { id, qty: 1, sel: {}, editKey: null };
    (p.condiciones || []).forEach((c) => {
      if (c.multiple || !c.obligatoria) return;
      const libres = c.opciones.filter((o) => !o.agotado);
      if (libres.length === 1) this._det.sel[c.nombre] = libres[0].nombre;
    });
    document.getElementById("npDetBody").innerHTML = `
    <div class="np-det-img${tieneVar ? " compact" : ""}">${this.imgTag(p)}</div>
    <div class="np-det-info">
      <div class="np-det-cat">${escapeHtml(p.categoria || "")}</div>
      <h3 class="np-det-name">${escapeHtml(p.nombre)}</h3>
      <div class="np-det-price">${precioCardHtml(p)}</div>
      ${p.descripcion ? `<p class="np-det-desc">${escapeHtml(p.descripcion)}</p>` : ""}
      <div class="np-det-meta">
        ${typeof p.stock === "number" && !tieneVar ? `<span id="npDetStockChip" class="np-det-chip"></span>` : ""}
        ${p.codigoBarras ? `<span class="np-det-chip mono">▌▌ ${escapeHtml(p.codigoBarras)}</span>` : ""}
      </div>
      <div id="npDetLineas"></div>
      <div id="npDetVars"></div>
      <div class="np-det-actions" id="npDetActions"></div>
    </div>`;
    document.querySelectorAll("#npDetBody img[data-fade]").forEach((i) => {
      if (i.complete && i.naturalWidth) i.classList.add("loaded");
    });
    this.refrescarDetalle();
    document.getElementById("npDetOverlay").classList.add("show");
  },
  /* Líneas del carrito de ESTE producto, con controles grandes */
  pintarLineasCarrito() {
    const d = this._det;
    const box = document.getElementById("npDetLineas");
    if (!box || !d) return;
    const lineas = [...this.carrito.values()].filter((i) => i.id === d.id);
    if (!lineas.length) {
      box.innerHTML = "";
      return;
    }
    const totalU = lineas.reduce((s, i) => s + i.cantidad, 0);
    box.innerHTML =
      `<div class="np-var-title">🛒 En el pedido <small>${totalU} unid.</small></div>` +
      lineas
        .map((it, i) => {
          const opc = seleccionATexto(it.seleccion);
          const editando = d.editKey === it.cartKey;
          return `
        <div class="np-line${editando ? " editing" : ""}">
          <div class="np-line-info">
            <b>${escapeHtml(opc || it.nombre)}</b>
            <small>${fmtMoney(it.precio)} c/u · ${fmtMoney(it.precio * it.cantidad)}</small>
          </div>
          <div class="np-line-ctrl">
            <button type="button" data-lm="${i}">−</button>
            <span>${it.cantidad}</span>
            <button type="button" data-lp="${i}">+</button>
            ${it.condiciones?.length ? `<button type="button" class="ed" data-le="${i}">✎</button>` : ""}
            <button type="button" class="tr" data-lt="${i}">🗑</button>
          </div>
        </div>`;
        })
        .join("");

    const key = (b, attr) => lineas[Number(b.dataset[attr])].cartKey;
    box.querySelectorAll("[data-lm]").forEach(
      (b) =>
        (b.onclick = () => {
          this.removeByKey(key(b, "lm"));
          this.refrescarDetalle();
        }),
    );
    box.querySelectorAll("[data-lp]").forEach(
      (b) =>
        (b.onclick = () => {
          this.addByKey(key(b, "lp"));
          this.refrescarDetalle();
        }),
    );
    box.querySelectorAll("[data-lt]").forEach(
      (b) =>
        (b.onclick = () => {
          this.eliminarByKey(key(b, "lt"));
          this.refrescarDetalle();
        }),
    );
    box.querySelectorAll("[data-le]").forEach(
      (b) =>
        (b.onclick = () => {
          const k = key(b, "le");
          if (d.editKey === k) {
            d.editKey = null;
            d.sel = {};
          } else {
            d.editKey = k;
            d.sel = JSON.parse(
              JSON.stringify(this.carrito.get(k).seleccion || {}),
            );
          }
          this.refrescarDetalle();
          document
            .getElementById("npDetVars")
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }),
    );
  },

  guardarEdicionDetalle(sel) {
    const d = this._det;
    const p = this.productosPorId.get(d.id);
    const entry = this.carrito.get(d.editKey);
    if (!entry) return;
    const newKey = this.cartKeyFor(p.id, sel);
    const existente = this.carrito.get(newKey);
    const fusion = existente && newKey !== d.editKey;
    const cantFinal = (fusion ? existente.cantidad : 0) + entry.cantidad;
    const disp = this.getStockDisponible(p, sel);
    if (typeof disp === "number" && cantFinal > disp)
      return showToast(`⚠️ No hay stock suficiente (quedan ${disp})`, true);

    this.carrito.delete(d.editKey);
    if (fusion) existente.cantidad += entry.cantidad;
    else {
      const dsc = descuentoVigente(p.descuento);
      this.carrito.set(newKey, {
        ...p,
        precio: this.calcPrecioFinal(p, sel),
        precioOriginal: dsc ? p.precio : null,
        descuentoPorcentaje: dsc ? dsc.porcentaje : null,
        cantidad: entry.cantidad,
        cartKey: newKey,
        seleccion: sel,
      });
    }
    d.editKey = null;
    d.sel = {};
    this.updateCardQty(p.id);
    this.renderCarrito();
    this.refrescarDetalle();
    showToast("✏️ Línea actualizada");
  },
  /* Variantes dentro del diálogo, con botones grandes */
  cantOpcionEnCarrito(p, condNombre, opNombre, excluirKey = null) {
    let t = 0;
    this.carrito.forEach((it) => {
      if (it.id !== p.id || !it.seleccion || it.cartKey === excluirKey) return;
      entradasDeOpcion(it.seleccion[condNombre]).forEach(([n, c]) => {
        if (n === opNombre) t += c * it.cantidad;
      });
    });
    return t;
  },
  pintarChipStock() {
    const d = this._det;
    const p = d && this.productosPorId.get(d.id);
    const chip = document.getElementById("npDetStockChip");
    if (!chip || !p || typeof p.stock !== "number" || p.condiciones?.length)
      return;
    const libre = Math.max(0, p.stock - this.cantEnCarrito(p.id));
    const quedaran = Math.max(0, libre - (d.qty || 0));
    chip.classList.toggle("bad", libre <= 0);
    chip.textContent =
      libre <= 0
        ? "📦 Sin stock"
        : `📦 Quedan ${libre} · quedarán ${quedaran} al agregar`;
  },

  refrescarDetalle() {
    const d = this._det;
    if (!d) return;
    // si la línea que se editaba ya no existe, salir del modo edición
    if (d.editKey && !this.carrito.has(d.editKey)) {
      d.editKey = null;
      d.sel = {};
    }
    this.pintarAccionesDetalle();
    this.pintarVariantesDetalle();
    this.pintarChipStock();
    this.pintarLineasCarrito();
  },
  pintarVariantesDetalle() {
    const d = this._det;
    const p = this.productosPorId.get(d.id);
    const box = document.getElementById("npDetVars");
    if (!box) return;
    if (!p.condiciones?.length) {
      box.innerHTML = "";
      return;
    }
    const sel = d.sel;
    const refrescar = () => this.refrescarDetalle();
    const mult = d.editKey
      ? this.carrito.get(d.editKey)?.cantidad || 1
      : d.qty || 1;
    box.innerHTML = "";

    p.condiciones.forEach((cond) => {
      const k = cond.nombre;
      const ent = entradasDeOpcion(sel[k]);
      const total = ent.reduce((s, [, c]) => s + c, 0);
      const tope = !!cond.max && total >= cond.max;
      const excl = cond.multiple
        ? cond.opciones.find(
            (o) => o.exclusiva && ent.some(([n]) => n === o.nombre),
          )
        : null;
      const reales = cond.opciones.filter(
        (o) => !o.todas && !o.exclusiva && !o.agotado,
      );
      const todasOn =
        reales.length > 0 &&
        reales.every((o) => ent.some(([n]) => n === o.nombre));
      const cant = (n) => ent.find(([x]) => x === n)?.[1] || 0;

      const setCant = (op, c) => {
        if (op.exclusiva && c > 0) {
          sel[k] = { [op.nombre]: 1 };
          return;
        }
        let obj = sel[k];
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) obj = {};
        if (c <= 0) delete obj[op.nombre];
        else obj[op.nombre] = c;
        if (Object.keys(obj).length) sel[k] = obj;
        else delete sel[k];
      };
      const alternar = (op) => {
        if (!cond.multiple) {
          if (sel[k] === op.nombre && !cond.obligatoria) delete sel[k];
          else sel[k] = op.nombre;
          return;
        }
        if (op.todas) {
          if (todasOn) {
            delete sel[k];
            return;
          }
          if (cond.max && reales.length > cond.max)
            return showToast(`Son más de ${cond.max}, elige a mano`, true);
          sel[k] = reales.map((o) => o.nombre);
          return;
        }
        if (op.exclusiva) {
          if (excl?.nombre === op.nombre) delete sel[k];
          else sel[k] = [op.nombre];
          return;
        }
        if (excl) return;
        const arr = ent.map(([n]) => n);
        const i = arr.indexOf(op.nombre);
        if (i >= 0) arr.splice(i, 1);
        else {
          if (cond.max && arr.length >= cond.max)
            return showToast(`Máximo ${cond.max} en "${cond.nombre}"`, true);
          arr.push(op.nombre);
        }
        if (arr.length) sel[k] = arr;
        else delete sel[k];
      };

      const sec = document.createElement("div");
      sec.className =
        "opt-grp" + (ent.length ? " ok" : cond.obligatoria ? " req" : "");
      sec.dataset.grp = k;
      const regla = !cond.multiple
        ? cond.obligatoria
          ? "Elige 1"
          : "Opcional · elige 1"
        : cond.obligatoria
          ? cond.max
            ? `Elige de 1 a ${cond.max}`
            : "Elige al menos 1"
          : cond.max
            ? `Opcional · hasta ${cond.max}`
            : "Opcional · las que quieras";
      sec.innerHTML = `<div class="opt-grp-head"><div><p class="opt-grp-title">${escapeHtml(k)}</p><p class="opt-grp-rule">${regla}</p></div>
        <span class="opt-badge">${ent.length ? (cond.multiple ? `✓ ${total} elegido${total === 1 ? "" : "s"}` : "✓ Listo") : cond.obligatoria ? "Obligatorio" : "Opcional"}</span></div>
        <div class="opt-list"></div>`;
      const list = sec.querySelector(".opt-list");

      cond.opciones.forEach((op) => {
        const c = op.todas ? (todasOn ? 1 : 0) : cant(op.nombre);
        const enCar = this.cantOpcionEnCarrito(p, k, op.nombre, d.editKey);
        const libre =
          typeof op.stock === "number"
            ? Math.max(0, op.stock - enCar)
            : Infinity;
        const maxC = libre === Infinity ? Infinity : Math.floor(libre / mult);
        const bloq = !!excl && !op.exclusiva && !op.todas;
        const row = document.createElement("div");
        row.className = "opt-row" + (c > 0 ? " sel" : "");
        if (bloq) row.classList.add("blk");

        if (op.imagen) {
          const im = document.createElement("img");
          im.className = "opt-thumb";
          im.src = op.imagen;
          im.alt = "";
          im.loading = "lazy";
          im.onerror = () => im.remove();
          row.appendChild(im);
        }
        const extra = op.costoAdicional
          ? `<span class="opt-price">+S/ ${op.costoAdicional.toFixed(2)}${cond.conCantidad ? " c/u" : ""}</span>`
          : "";
        const stk =
          libre !== Infinity ? `<p class="opt-stk">Quedan ${libre}</p>` : "";
        const info = `<div class="opt-info"><p class="opt-name">${escapeHtml(op.nombre)}</p>${op.descripcion ? `<p class="opt-desc">${escapeHtml(op.descripcion)}</p>` : ""}${stk}</div>`;
        const tag = op.agotado
          ? `<span class="opt-agotado">Agotado</span>`
          : extra;

        if (cond.conCantidad && !op.todas) {
          row.classList.add("qty");
          if (op.agotado) row.classList.add("off");
          row.insertAdjacentHTML("beforeend", info + tag);
          if (!op.agotado) {
            const step = document.createElement("div");
            step.className = "opt-step";
            const mk = (t, cls, dis, fn) => {
              const b = document.createElement("button");
              b.type = "button";
              b.textContent = t;
              if (cls) b.className = cls;
              b.disabled = dis;
              b.onclick = fn;
              return b;
            };
            if (c === 0)
              step.appendChild(
                mk("Agregar", "add", tope || maxC < 1 || bloq, () => {
                  setCant(op, 1);
                  refrescar();
                }),
              );
            else {
              const n = document.createElement("b");
              n.textContent = c;
              step.append(
                mk("−", "", false, () => {
                  setCant(op, c - 1);
                  refrescar();
                }),
                n,
                mk("+", "", tope || c >= maxC || bloq || op.exclusiva, () => {
                  setCant(op, c + 1);
                  refrescar();
                }),
              );
            }
            row.appendChild(step);
          }
        } else {
          const lleno =
            (cond.multiple && tope && c === 0 && !op.exclusiva && !op.todas) ||
            op.agotado ||
            (libre !== Infinity && maxC < 1 && c === 0);
          if (lleno) row.classList.add("off");
          const mark = document.createElement("span");
          mark.className = "opt-mark " + (cond.multiple ? "check" : "radio");
          mark.textContent = c > 0 ? "✓" : "";
          row.prepend(mark);
          row.insertAdjacentHTML("beforeend", info + tag);
          if (op.imagen)
            row.insertBefore(
              row.querySelector(".opt-thumb"),
              row.querySelector(".opt-info"),
            );
          row.onclick = () => {
            if (lleno || bloq) return;
            alternar(op);
            refrescar();
          };
        }
        list.appendChild(row);
      });
      box.appendChild(sec);
    });
  },

  pintarAccionesDetalle() {
    const d = this._det;
    const p = this.productosPorId.get(d.id);
    const box = document.getElementById("npDetActions");
    if (!box) return;
    const tieneVar = p.condiciones?.length > 0;

    const sel = {};
    Object.keys(d.sel || {}).forEach((k) => {
      if (entradasDeOpcion(d.sel[k]).length)
        sel[k] = JSON.parse(JSON.stringify(d.sel[k]));
    });
    const hayOps = Object.keys(sel).length > 0;
    const faltan =
      tieneVar &&
      p.condiciones.some(
        (c) => c.obligatoria && !entradasDeOpcion(sel[c.nombre]).length,
      );
    /* ── Modo edición de una línea del carrito ── */
    if (d.editKey) {
      const entry = this.carrito.get(d.editKey);
      const precio = this.calcPrecioFinal(p, hayOps ? sel : null);
      box.innerHTML = `
        <button class="np-confirmar-btn np-det-big" id="npDetGuardar" ${faltan ? "disabled" : ""}>
          ${faltan ? "Elige una opción" : `Guardar cambios · ${fmtMoney(precio * entry.cantidad)}`}
        </button>
        <button class="oc-btn ghost np-det-big" id="npDetCancelEdit" style="flex:0 0 auto;padding:0 16px;">Cancelar</button>`;
      box.querySelector("#npDetGuardar").onclick = () => {
        if (!faltan) this.guardarEdicionDetalle(sel);
      };
      box.querySelector("#npDetCancelEdit").onclick = () => {
        d.editKey = null;
        d.sel = {};
        this.refrescarDetalle();
      };
      return;
    }

    /* ── Modo agregar ── */
    let max;
    if (tieneVar) {
      const disp = this.getStockDisponible(p, hayOps ? sel : null);
      const enCarrito =
        this.carrito.get(this.cartKeyFor(p.id, sel))?.cantidad || 0;
      max = typeof disp === "number" ? Math.max(0, disp - enCarrito) : Infinity;
    } else {
      max =
        typeof p.stock === "number"
          ? Math.max(0, p.stock - this.cantEnCarrito(p.id))
          : Infinity;
    }
    if (d.qty > max) d.qty = max;
    if (d.qty < 1 && max > 0) d.qty = 1;
    const qty = d.qty;

    if (max === 0) {
      box.innerHTML = `<button class="np-confirmar-btn np-det-big" disabled>${tieneVar && faltan ? "Elige una opción" : "Sin más stock"}</button>`;
      return;
    }

    const precio = this.calcPrecioFinal(p, hayOps ? sel : null);
    box.innerHTML = `
    <div class="np-det-step big">
      <button id="npDetMenos" ${qty <= 1 ? "disabled" : ""}>−</button>
      <span>${qty}</span>
      <button id="npDetMas" ${qty >= max ? "disabled" : ""}>+</button>
    </div>
    <button class="np-confirmar-btn np-det-big" id="npDetAdd" ${faltan ? "disabled" : ""}>
      ${faltan ? "Elige una opción" : `Agregar · ${fmtMoney(precio * qty)}`}
    </button>`;

    box.querySelector("#npDetMenos").onclick = () => {
      d.qty--;
      this.refrescarDetalle();
    };
    box.querySelector("#npDetMas").onclick = () => {
      d.qty++;
      this.refrescarDetalle();
    };
    box.querySelector("#npDetAdd").onclick = () => {
      if (faltan) return;
      const seleccion = tieneVar ? JSON.parse(JSON.stringify(sel)) : null;
      for (let i = 0; i < qty; i++) this.add(d.id, seleccion);
      this.cerrarDetalle();
    };
  },
  cerrarDetalle() {
    document.getElementById("npDetOverlay").classList.remove("show");
  },

  /* Busca por código exacto: primero en memoria, luego en Firestore */
  /* Busca en Firestore: primero por código de barras (texto o número), luego por ID del documento */
  async buscarCodigoEnDB(code) {
    const registrar = (snap, cat) => {
      const d = snap.data();
      if (d.disponible === false) return null;
      const p = this.mapearProducto(snap, cat, d);
      if (!this.productosPorId.has(p.id)) {
        this.productos.push(p);
        this.productosPorId.set(p.id, p);
        this.renderGrid();
      }
      return this.productosPorId.get(p.id);
    };

    const variantes = [code];
    if (/^\d+$/.test(code)) variantes.push(Number(code));

    const buscarEnCategoria = async (cat) => {
      try {
        const colRef = tiendaSubCol(
          localidad,
          "tiendas",
          tiendaId,
          "productos",
          cat,
          cat,
        );
        const [porCodigo, byId] = await Promise.all([
          Promise.all(
            variantes.map((v) =>
              getDocs(query(colRef, where("codigo_barras", "==", v), limit(1))),
            ),
          ),
          code.includes("/")
            ? null
            : getDoc(
                tiendaSubDoc(
                  localidad,
                  "tiendas",
                  tiendaId,
                  "productos",
                  cat,
                  cat,
                  code,
                ),
              ),
        ]);
        for (const s of porCodigo)
          if (!s.empty) return registrar(s.docs[0], cat);
        if (byId?.exists()) return registrar(byId, cat);
      } catch (e) {
        console.warn("Búsqueda por código/ID:", e);
      }
      return null;
    };

    // Todas las categorías a la vez; responde apenas alguna lo encuentra
    return new Promise((resolve) => {
      let pendientes = this.categorias.length;
      if (!pendientes) return resolve(null);
      this.categorias.forEach((cat) =>
        buscarEnCategoria(cat).then((p) => {
          if (p) resolve(p);
          else if (--pendientes === 0) resolve(null);
        }),
      );
    });
  },
  async procesarCodigo(raw) {
    const code = String(raw || "").trim();
    if (code.length < 3) return false;

    // Mientras se elige la variante (o se procesa otro código), se ignoran más escaneos
    if (this._prodOpc || this._procesando) return false;
    this._procesando = true;

    try {
      if (!this.cargado) await this.cargarCatalogo();
      let p = this.productos.find(
        (x) => x.id === code || (x.codigoBarras && x.codigoBarras === code),
      );
      if (!p) {
        // Catálogo completo y reciente (menos de 10 min): si no está en memoria, no existe
        const fresco =
          this.catalogoCompleto && Date.now() - this.cargadoEn < 10 * 60 * 1000;
        if (!fresco) p = await this.buscarCodigoEnDB(code);
      }

      if (!p) {
        npBeep(false);
        showToast(`❌ "${code}" no coincide con ningún código ni ID`, true);
        return false;
      }

      npBeep(true);

      // Tiene variantes, pero ya no queda ninguna con stock
      if (p.tieneVariantes && !p.condiciones?.length) {
        showToast(`⚠️ "${p.nombre}" no tiene variantes disponibles`, true);
        return false;
      }

      // Tiene variantes: SIEMPRE se pregunta antes de agregar
      if (p.condiciones?.length) {
        this.abrirDetalle(p.id);
        return true;
      }
      const antes = this.cantEnCarrito(p.id);
      this.add(p.id);
      if (this.cantEnCarrito(p.id) > antes) showToast(`✅ ${p.nombre}`);
      return true;
    } finally {
      this._procesando = false;
    }
  },

  add(id, seleccion = null) {
    const p = this.productosPorId.get(id);
    if (!p) return;
    if (p.agotado) {
      showToast(`⚠️ "${p.nombre}" está agotado`, true);
      return;
    }
    if (p.esOfertaTiempo && p.expiraEn && Date.now() >= p.expiraEn) {
      showToast("⏰ Esta oferta ya expiró", true);
      return;
    }
    if (!seleccion && p.condiciones?.length) return this.abrirOpciones(p);

    const key = this.cartKeyFor(id, seleccion);
    const entry = this.carrito.get(key);
    const cantActual = entry?.cantidad || 0;
    const disponible = this.getStockDisponible(p, seleccion);
    if (typeof disponible === "number" && cantActual >= disponible) {
      showToast(
        `⚠️ No queda más stock${seleccion ? " de esta variante" : ""} de "${p.nombre}" (quedan ${disponible})`,
        true,
      );
      return;
    }
    if (entry) entry.cantidad += 1;
    else {
      const d = descuentoVigente(p.descuento);
      this.carrito.set(key, {
        ...p,
        precio: this.calcPrecioFinal(p, seleccion),
        precioOriginal: d ? p.precio : null,
        descuentoPorcentaje: d ? d.porcentaje : null,
        cantidad: 1,
        cartKey: key,
        seleccion: seleccion || null,
      });
    }
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
      const opcTxt = seleccionATexto(it.seleccion);
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
          ${it.condiciones?.length ? `<button type="button" class="npc-edit" data-cart-edit="${key}" data-cart-edit-id="${it.id}" title="Cambiar opciones">✎ Editar</button>` : ""}
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

  async verificarYDescontarStock(items, factor = 1) {
    const reales = items.filter((it) => !it.esPromo && !it.esAdicional);
    const agotados = [];
    if (!reales.length) return { ok: true, agotados };

    const refs = new Map();
    reales.forEach((it) => {
      if (!refs.has(it.id))
        refs.set(
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
    });

    try {
      await runTransaction(db, async (tx) => {
        agotados.length = 0; // por si la transacción se reintenta
        const snaps = new Map();
        for (const [id, ref] of refs) {
          const s = await tx.get(ref);
          if (s.exists()) snaps.set(id, s);
        }
        const act = new Map();

        for (const it of reales) {
          const snap = snaps.get(it.id);
          if (!snap) continue;
          const dn = act.get(it.id) || { ...snap.data() };

          // ── Variantes ──
          if (it.seleccion && Array.isArray(dn.condiciones)) {
            const conds = dn.condiciones.map((c) => ({
              ...c,
              opciones: (c.opciones || []).map((o) => ({ ...o })),
            }));
            for (const cond of conds) {
              for (const [nombreOp, cant] of entradasDeOpcion(
                it.seleccion[cond.nombre],
              )) {
                const op = cond.opciones.find((o) => o.nombre === nombreOp);
                if (!op || typeof op.stock !== "number") continue;
                const delta = cant * it.cantidad;
                if (factor === 1) {
                  if (op.stock < delta)
                    throw {
                      motivo: "sin_stock",
                      nombre: it.nombre,
                      disponible: op.stock,
                      detalle: nombreOp,
                    };
                  op.stock -= delta;
                  if (op.stock <= 0) {
                    op.activo = false;
                    agotados.push({
                      nombre: `${dn.nombre || it.nombre} (${op.nombre})`,
                    });
                  }
                } else {
                  if (op.stock <= 0) op.activo = true;
                  op.stock += delta;
                }
              }
            }
            dn.condiciones = conds;
          }

          // ── Stock general del producto ──
          if (typeof dn.stock === "number") {
            if (factor === 1) {
              if (dn.stock < it.cantidad)
                throw {
                  motivo: "sin_stock",
                  nombre: it.nombre,
                  disponible: dn.stock,
                };
              dn.stock -= it.cantidad;
              if (dn.stock <= 0) {
                if (dn.autoDesactivar) dn.disponible = false;
                agotados.push({ nombre: dn.nombre || it.nombre });
              }
            } else {
              if (dn.stock <= 0 && dn.autoDesactivar) dn.disponible = true;
              dn.stock += it.cantidad;
            }
          }
          act.set(it.id, dn);
        }
        for (const [id, dn] of act) tx.set(refs.get(id), dn, { merge: true });
      });
      return { ok: true, agotados };
    } catch (err) {
      if (err?.motivo === "sin_stock") return { ok: false, ...err };
      console.error("Error ajustando stock (Nuevo pedido):", err);
      return { ok: false, motivo: "error_generico" };
    }
  },

  /* Refleja el descuento en el catálogo local para que la pantalla no muestre stock viejo */
  sincronizarStockLocal(items) {
    items.forEach((it) => {
      if (it.esPromo) return;
      const p = this.productosPorId.get(it.id);
      if (!p) return;

      if (typeof p.stock === "number")
        p.stock = Math.max(0, p.stock - it.cantidad);

      if (it.seleccion && p.condiciones?.length) {
        p.condiciones = p.condiciones
          .map((cond) => ({
            ...cond,
            opciones: cond.opciones
              .map((op) => {
                const hit = entradasDeOpcion(it.seleccion[cond.nombre]).find(
                  ([n]) => n === op.nombre,
                );
                if (!hit || typeof op.stock !== "number") return op;
                return {
                  ...op,
                  stock: Math.max(0, op.stock - hit[1] * it.cantidad),
                };
              })
              .filter((op) => typeof op.stock !== "number" || op.stock > 0),
          }))
          .filter((c) => c.opciones.length);
        if (!p.condiciones.length) p.agotado = true; // se quedó sin ninguna variante
      }

      // Repinta solo la tarjeta de este producto (en su mismo lugar)
      const viejo = this.cardEls.get(p.id);
      if (viejo) {
        const nuevo = this.crearCard(p);
        viejo.replaceWith(nuevo);
        this.cardEls.set(p.id, nuevo);
      }
    });
    this.renderGrid();
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

    // Valida y descuenta stock ANTES de registrar el pedido
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
      const payload = {
        estado: "entregado",
        stock_descontado: true, // ya lo descontamos arriba, cambiarEstado no lo vuelve a tocar
        ...datosVendedor(),
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
          esPromo: it.esPromo || false,
          descuentoPorcentaje: it.descuentoPorcentaje || null,
        })),
        total_items: items.reduce((s, i) => s + i.cantidad, 0),
        total: +total.toFixed(2),
        negocio: { id: tiendaId, nombre: bizNombreGlobal, localidad },
      };
      const ref = await addDoc(pedidosRef, payload);

      // Comprobante automático (sin await: no bloquea el registro)
      imprimirComprobantePedido({
        ...payload,
        id: ref.id,
        timestamp: Timestamp.now(),
      });

      this.sincronizarStockLocal(items);
      if (stockCheck.agotados?.length) {
        playStockAgotadoAlarm();
        const nombres = stockCheck.agotados.map((a) => a.nombre).join(", ");
        showToast(`📦 Sin stock: ${nombres}`, true);
        notificarStockAgotado(nombres);
      } else {
        showToast("✅ Pedido registrado");
      }

      this.carrito.clear();
      document.getElementById("npClienteNombre").value = "";
      this.renderMetodosPago();
      this.renderGrid();
      this.renderCarrito();
      showToast("✅ Pedido registrado");
    } catch (err) {
      console.error("Error registrando pedido directo:", err);
      // El pedido no se guardó: devolvemos el stock que ya se había descontado
      await this.verificarYDescontarStock(items, -1);
      this.cargarCatalogo(true);
      showToast(
        "❌ No se pudo registrar el pedido, el stock se restauró",
        true,
      );
    } finally {
      btn.disabled = false;
      btn.textContent = "Registrar pedido";
    }
  },

  async init() {
    await this.cargarCatalogo();

    if (this.listenersListos) return; // evita re-registrar listeners
    this.listenersListos = true;
    this.cargarAdicionales();
    const inp = document.getElementById("npSearchInput");

    const clr = document.getElementById("npClearSearch");
    const limpiar = () => {
      if (inp) inp.value = "";
      this.filtroTexto = "";
      if (clr) clr.style.display = "none";
      this.renderGrid();
    };
    inp?.addEventListener("input", (e) => {
      this.filtroTexto = this.normalizeText(e.target.value);
      if (clr) clr.style.display = e.target.value ? "flex" : "none";
      this.renderGrid();
    });
    inp?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const v = inp.value.trim();
      const esCodigo = /^\d{6,}$/.test(v); // código de barras
      const esId = this.productosPorId.has(v) || /^[A-Za-z0-9_-]{15,}$/.test(v); // ID
      if (esCodigo || esId) {
        e.preventDefault();
        this.procesarCodigo(v).then((ok) => ok && limpiar());
      }
    });
    clr?.addEventListener("click", () => {
      limpiar();
      inp?.focus();
    });

    document
      .getElementById("npScanCamBtn")
      ?.addEventListener("click", abrirCamara);
    document
      .getElementById("npScanPhoneBtn")
      ?.addEventListener("click", abrirEmparejar);
    document
      .getElementById("npRefreshBtn")
      ?.addEventListener("click", () => this.refrescar());
    document
      .getElementById("npConfirmarBtn")
      ?.addEventListener("click", () => this.confirmar());

    document.getElementById("npGrid")?.addEventListener("click", (e) => {
      const c = e.target.closest(".np-card");
      if (c) this.abrirDetalle(c.dataset.id);
    });

    this.renderMetodosPago();
    document.getElementById("npPagoRow")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".np-pago-btn");
      if (!btn) return;
      this.metodoPago = btn.dataset.pago;
      document
        .querySelectorAll("#npPagoRow .np-pago-btn")
        .forEach((b) => b.classList.toggle("active", b === btn));
    });

    document.getElementById("npCartItems")?.addEventListener("click", (e) => {
      const plusBtn = e.target.closest("[data-cart-plus]");
      const minusBtn = e.target.closest("[data-cart-minus]");
      const trashBtn = e.target.closest("[data-cart-trash]");
      const editBtn = e.target.closest("[data-cart-edit]");
      if (plusBtn) this.addByKey(plusBtn.dataset.cartPlus);
      else if (minusBtn) this.removeByKey(minusBtn.dataset.cartMinus);
      else if (trashBtn) this.eliminarByKey(trashBtn.dataset.cartTrash);
      else if (editBtn) {
        const key = editBtn.dataset.cartEdit;
        const entry = this.carrito.get(key);
        const p = this.productosPorId.get(editBtn.dataset.cartEditId);
        if (entry && p) {
          this.abrirDetalle(p.id);
          this._det.editKey = key;
          this._det.sel = JSON.parse(JSON.stringify(entry.seleccion || {}));
          this.refrescarDetalle();
        }
      }
    });
  },
};
/* ══════ Cartel central: producto no encontrado ══════ */
const npNfStyle = document.createElement("style");
npNfStyle.textContent = `
#npNoEncontrado{
  position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;
  background:rgba(0,0,0,.45);opacity:0;visibility:hidden;pointer-events:none;
  transition:opacity .12s ease, visibility 0s linear .12s;
}
#npNoEncontrado.show{opacity:1;visibility:visible;pointer-events:auto;transition:opacity .12s ease, visibility 0s;}
.np-nf-box{
  background:var(--surface,#14141c);border:2px solid #f87171;border-radius:20px;
  padding:22px 28px;text-align:center;color:#fff;max-width:min(320px,88vw);
  box-shadow:0 12px 40px rgba(248,113,113,.28);
  animation:np-nf-pop .22s cubic-bezier(.34,1.56,.64,1);
}
.np-nf-ico{font-size:42px;line-height:1;margin-bottom:8px;}
.np-nf-title{font-size:17px;font-weight:800;color:#f87171;}
.np-nf-code{font-family:monospace;font-size:12.5px;color:var(--ink-dim);margin-top:6px;word-break:break-all;}
@keyframes np-nf-pop{0%{transform:scale(.8);opacity:0}100%{transform:scale(1);opacity:1}}
`;
document.head.appendChild(npNfStyle);

let _npNfTimer;
function npNoEncontrado(code) {
  let ov = document.getElementById("npNoEncontrado");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "npNoEncontrado";
    ov.innerHTML = `
      <div class="np-nf-box">
        <div class="np-nf-ico">🚫</div>
        <div class="np-nf-title">Ese producto no existe</div>
        <div class="np-nf-code"></div>
      </div>`;
    ov.addEventListener("click", () => {
      clearTimeout(_npNfTimer);
      ov.classList.remove("show");
    });
    document.body.appendChild(ov);
  }
  ov.querySelector(".np-nf-code").textContent = code || "";

  // reinicia la animación si se escanea otro código seguido
  const box = ov.querySelector(".np-nf-box");
  box.style.animation = "none";
  void box.offsetWidth;
  box.style.animation = "";

  ov.classList.add("show");
  clearTimeout(_npNfTimer);
  _npNfTimer = setTimeout(() => ov.classList.remove("show"), 1500);
}
/* ══════ Sonido de confirmación del escáner ══════ */
function npBeep(ok) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const o = ctx.createOscillator(),
    g = ctx.createGain();
  o.frequency.value = ok ? 1200 : 220;
  o.type = ok ? "sine" : "sawtooth";
  g.gain.setValueAtTime(0.12, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(
    0.001,
    ctx.currentTime + (ok ? 0.12 : 0.35),
  );
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + (ok ? 0.13 : 0.36));
}

/* ══════ Diálogos (se inyectan solos, no tocas el HTML) ══════ */
document.body.insertAdjacentHTML(
  "beforeend",
  `
<div id="npDetOverlay" class="np-opt-overlay"><div class="np-opt-modal np-det-modal"><button class="np-det-x" id="npDetX">✕</button><div id="npDetBody"></div></div></div>
<div id="npCamOverlay" class="np-opt-overlay"><div class="np-opt-modal np-cam-box">
  <div class="np-opt-head"><span>📷 Escanear código</span><button id="npCamX">✕</button></div>
  <div class="np-cam-wrap"><video id="npCamVideo" playsinline muted></video><div class="np-cam-line"></div></div>
  <p class="np-cam-hint">Apunta al código de barras. Puedes escanear varios seguidos.</p></div></div>
<div id="npPairOverlay" class="np-opt-overlay"><div class="np-opt-modal np-pair-box">
  <div class="np-opt-head"><span>📱 Celular como escáner</span><button id="npPairX">✕</button></div>
  <div id="npPairBody"></div></div></div>`,
);

document.getElementById("npDetX").onclick = () => NuevoPedido.cerrarDetalle();
document.getElementById("npDetOverlay").addEventListener("click", (e) => {
  if (e.target.id === "npDetOverlay") NuevoPedido.cerrarDetalle();
});
document.getElementById("npPairX").onclick = () =>
  document.getElementById("npPairOverlay").classList.remove("show");

/* ══════ Cámara de esta misma pantalla ══════ */
let pararCam = null;
async function abrirCamara() {
  document.getElementById("npCamOverlay").classList.add("show");
  try {
    pararCam = await iniciarCamara(document.getElementById("npCamVideo"), (c) =>
      NuevoPedido.procesarCodigo(c),
    );
  } catch (e) {
    console.warn(e);
    showToast("No se pudo abrir la cámara (permiso o falta HTTPS)", true);
    cerrarCamara();
  }
}
function cerrarCamara() {
  pararCam?.();
  pararCam = null;
  document.getElementById("npCamOverlay").classList.remove("show");
}
document.getElementById("npCamX").onclick = cerrarCamara;

/* ══════ Lector USB de minimarket (actúa como teclado: escribe rápido + Enter) ══════
   Funciona aunque no tengas el cursor en ningún campo. Si el cursor está en el
   buscador, lo maneja el listener del input (números + Enter). */
let _wBuf = "",
  _wLast = 0;
document.addEventListener(
  "keydown",
  (e) => {
    if (originFilter !== "directo") return;
    if (e.target.matches?.("input,textarea,select")) return;
    const ahora = Date.now();
    if (e.key === "Enter") {
      if (_wBuf.length >= 4) {
        e.preventDefault();
        const c = _wBuf;
        _wBuf = "";
        NuevoPedido.procesarCodigo(c);
      }
      _wBuf = "";
      return;
    }
    if (e.key.length !== 1) return;
    if (ahora - _wLast > 60) _wBuf = ""; // un humano escribe más lento que 60ms
    _wBuf += e.key;
    _wLast = ahora;
  },
  true,
);

/* ══════ Celular sin cable: QR + clave ══════ */
let scanSesion = null,
  scanClave = "",
  unsubCodigos = null;
const scanSesRef = (sid) =>
  tiendaSubDoc(localidad, "tiendas", tiendaId, "scan_sesiones", sid);
const scanColRef = (sid) =>
  tiendaSubCol(localidad, "tiendas", tiendaId, "scan_sesiones", sid, "codigos");
/* Borra una sesión completa: primero sus códigos, luego el documento */
async function borrarSesionScan(sid) {
  if (!sid) return;
  try {
    const snap = await getDocs(scanColRef(sid));
    if (!snap.empty) {
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (e) {
    console.warn("No se pudieron borrar los códigos de la sesión:", e);
  }
  try {
    await deleteDoc(scanSesRef(sid));
  } catch (e) {
    console.warn("No se pudo borrar la sesión:", e);
  }
}

/* Cierra la sesión actual y deja la base limpia */
async function cerrarSesionCelular() {
  const sid = scanSesion;
  unsubCodigos?.();
  unsubCodigos = null;
  scanSesion = null;
  scanClave = "";
  pintarEstadoCelular(false);
  await borrarSesionScan(sid);
}

/* Borra cualquier sesión vieja que haya quedado (pestaña cerrada de golpe, corte de internet, etc.) */
async function limpiarSesionesViejas() {
  try {
    const snap = await getDocs(
      tiendaSubCol(localidad, "tiendas", tiendaId, "scan_sesiones"),
    );
    await Promise.all(snap.docs.map((d) => borrarSesionScan(d.id)));
  } catch (e) {
    console.warn("No se pudieron limpiar sesiones viejas:", e);
  }
}

/* Al cerrar o recargar la página: borrado de último momento */
window.addEventListener("pagehide", () => {
  if (!scanSesion) return;
  const sid = scanSesion;
  unsubCodigos?.();
  deleteDoc(scanSesRef(sid)).catch(() => {});
});
function pintarEstadoCelular(conectado) {
  const el = document.getElementById("npPairEstado");
  if (el) {
    el.textContent = conectado
      ? "✅ Celular conectado, ya puedes escanear"
      : "⏳ Esperando al celular…";
    el.classList.toggle("ok", conectado);
  }
  document.getElementById("npScanPhoneBtn")?.classList.toggle("on", conectado);
}

async function abrirEmparejar() {
  const ov = document.getElementById("npPairOverlay");
  const body = document.getElementById("npPairBody");
  ov.classList.add("show");

  if (!scanSesion) {
    body.innerHTML = `<p class="np-pair-steps">Generando código…</p>`;
    try {
      await limpiarSesionesViejas();
      scanClave = String(Math.floor(100000 + Math.random() * 900000));
      const ref = doc(
        tiendaSubCol(localidad, "tiendas", tiendaId, "scan_sesiones"),
      );
      await setDoc(ref, {
        clave: scanClave,
        creado: serverTimestamp(),
        expira: Date.now() + 4 * 3600 * 1000,
      });
      scanSesion = ref.id;

      unsubCodigos = onSnapshot(scanColRef(scanSesion), (snap) => {
        snap.docChanges().forEach((ch) => {
          if (ch.type !== "added") return;
          const d = ch.doc.data();
          deleteDoc(ch.doc.ref).catch(() => {});
          if (d.tipo === "hola") {
            pintarEstadoCelular(true);
            return;
          }
          if (d.codigo) {
            pintarEstadoCelular(true);
            NuevoPedido.procesarCodigo(d.codigo);
          }
        });
      });
    } catch (e) {
      console.error(e);
      body.innerHTML = `<p class="np-pair-steps">No se pudo crear la sesión. Revisa las reglas de Firestore.</p>`;
      return;
    }
  }

  // import.meta.url = ruta real de pedidos_dashboard.js, que está en la MISMA carpeta
  // que scanner_movil.html (js/dasboardjs/), así que siempre apunta bien
  const urlScanner = new URL("./scanner_movil.html", import.meta.url);
  urlScanner.search = new URLSearchParams({
    l: localidad,
    t: tiendaId,
    s: scanSesion,
  }).toString();
  const url = urlScanner.href;
  const QR = (await import("https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm"))
    .default;
  const img = await QR.toDataURL(url, { width: 240, margin: 1 });

  body.innerHTML = `
    <img class="np-pair-qr" src="${img}" alt="QR">
    <div class="np-pair-steps">1. Escanea este QR con la cámara de tu celular.<br>2. Escribe la clave que ves abajo.<br>3. Escanea productos: aparecen aquí solos.</div>
    <div class="np-pair-pin-lbl">Clave</div>
    <div class="np-pair-pin">${scanClave}</div>
    <div id="npPairEstado" class="np-pair-estado">⏳ Esperando al celular…</div>
    <button class="oc-btn ghost danger" style="width:100%;" id="npPairFin">Terminar sesión</button>`;
  document.getElementById("npPairFin").onclick = async () => {
    unsubCodigos?.();
    unsubCodigos = null;
    try {
      await deleteDoc(scanSesRef(scanSesion));
    } catch {}
    scanSesion = null;
    pintarEstadoCelular(false);
    ov.classList.remove("show");
    showToast("📱 Sesión del celular terminada");
  };
}
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
  return `${pedido?.total_items || 0}|${pedido?.total || 0}|${pedido?.estadoMozo || ""}`;
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
      const reservasNuevasKeys = new Set();
      const reservasNuevasParaAlertar = [];

      snap.forEach((d) => {
        const estadoAnterior = mesasMap.get(d.id)?.estado;
        const data = d.data();
        mesasMap.set(d.id, data);

        if (
          data.estado === "reserva_pendiente" &&
          estadoAnterior !== "reserva_pendiente" &&
          !mesasFirstSnapshot
        ) {
          const key = data.grupoId || d.id;
          if (!reservasNuevasKeys.has(key)) {
            reservasNuevasKeys.add(key);
            reservasNuevasParaAlertar.push({ mesaId: d.id, data, key });
          }
        }
        if (
          estadoAnterior === "reserva_pendiente" &&
          data.estado !== "reserva_pendiente"
        ) {
          const numerosParar = data.grupoId
            ? (gruposMap.get(data.grupoId)?.mesas || []).map((m) => m.numero)
            : [data.numero_mesa];
          detenerSoundLoopParaReserva(numerosParar.filter(Boolean));
        }

        if (
          (data.estado === "ocupado" || data.estado === "pedido_pendiente") &&
          data.pedido
        ) {
          const firma = firmaPedidoMesa(data.pedido);
          const firmaAnterior = mesaPedidoSignatures.get(d.id);
          if (
            !mesasFirstSnapshot &&
            firma !== firmaAnterior &&
            !pedidoEsperaMozo(data.pedido)
          ) {
            nuevosPedidosMesa.push({ mesaId: d.id, data });
          }
          mesaPedidoSignatures.set(d.id, firma);
        } else if (!data.pedido) {
          mesaPedidoSignatures.delete(d.id);
        }
      });

      mesasFirstSnapshot = false;

      if (originFilter === "mesa") renderMesaGrid();
      if (activeModalId && String(activeModalId).startsWith("mesa:")) {
        renderMesaDetail(Number(String(activeModalId).split(":")[1]));
      }

      if (nuevosPedidosMesa.length) {
        bellRingFeedback();
        nuevosPedidosMesa.forEach(({ data }) => {
          const numero = data.mesaNumero ?? data.pedido?.mesa?.numero ?? null;
          playMesaChime();
          const nombreMesa = data.mesaNombre || `Mesa ${numero ?? ""}`;
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

      if (reservasNuevasParaAlertar.length) {
        bellRingFeedback();
        reservasNuevasParaAlertar.forEach(({ data }) => {
          const numeros = data.grupoId
            ? (gruposMap.get(data.grupoId)?.mesas || [])
                .map((m) => m.numero)
                .filter(Boolean)
            : [data.numero_mesa];
          encolarAlarmaReserva(numeros.length ? numeros : [data.numero_mesa]);
        });
        const nombresRes = reservasNuevasParaAlertar
          .map(({ data }) => data.reserva?.nombre || "Cliente")
          .join(", ");
        showToast(
          reservasNuevasParaAlertar.length === 1
            ? `🔔 Nueva solicitud de reserva de ${nombresRes}`
            : `🔔 Nuevas solicitudes de reserva: ${nombresRes}`,
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
        if (waPendienteId) {
          const pid = waPendienteId;
          waPendienteId = null;
          if (pedidosMap.has(pid)) waMostrar(pid);
        }
        hideLoader();
        chequearAutoRechazo();
        precargarSeguidores();
        return;
      }
      const nuevosPendientes = [];
      const respuestasClienteNuevas = []; // cliente respondió y sigue en pausa
      const canceladosPorClienteEnPausa = []; // canceló estando en pausa
      const canceladosPorClientePendiente = []; // canceló estando pendiente (sin pasar por pausa)
      const pagosRecibidosNuevos = [];
      const pagosExtraNuevos = [];
      const enLocalNuevos = [];
      const deliveryAceptados = [];
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
          const voucherAnterior = anterior?.pago?.voucher_url;
          const voucherNuevo = data.pago?.voucher_url;
          if (voucherNuevo && !voucherAnterior && !voucherNotificados.has(id)) {
            voucherNotificados.add(id);
            pagosRecibidosNuevos.push({ id, data });
          }
          if (
            data.pago_extra?.voucher_url &&
            !anterior?.pago_extra?.voucher_url &&
            !voucherNotificados.has(id + "_x")
          ) {
            voucherNotificados.add(id + "_x");
            pagosExtraNuevos.push({ id, data });
          }
          if (esAvisoLlegadaNuevo(anterior, data))
            enLocalNuevos.push({ id, data });
          if (
            anterior?.delivery_pendiente?.estado === "propuesto" &&
            data.delivery_pendiente?.estado === "aceptado"
          ) {
            deliveryBrillo.add(id);
            deliveryAceptados.push({ id, data });
          }
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
      if (pagosRecibidosNuevos.length) {
        playDeliveryAceptadoAlarm();
        bellRingFeedback();
        const nombres = pagosRecibidosNuevos
          .map(({ data }) => data.cliente?.nombre || "Cliente")
          .join(", ");
        showToast(
          pagosRecibidosNuevos.length === 1
            ? `💸 ${nombres} envió su comprobante de pago`
            : `💸 ${pagosRecibidosNuevos.length} clientes enviaron su comprobante de pago`,
        );
      }
      if (pagosExtraNuevos.length) {
        playPagoExtraAlarm();
        bellRingFeedback();
        showToast(
          pagosExtraNuevos
            .map(
              ({ data }) =>
                `💸 ${data.cliente?.nombre || "Cliente"} envió el comprobante de la diferencia (${fmtMoney(data.pago_extra?.monto)})`,
            )
            .join(" · "),
        );
      }
      if (deliveryAceptados.length) {
        playDeliveryAceptadoAlarm();
        bellRingFeedback();
        showToast(
          deliveryAceptados
            .map(
              ({ data }) =>
                `✅ ${data.cliente?.nombre || "Cliente"} aceptó el delivery (${fmtMoney(data.delivery_pendiente?.costo)})`,
            )
            .join(" · "),
        );
      }
      if (enLocalNuevos.length) {
        playSoundOnce(SND_CLIENTE_EN_LOCAL); // suena en cada aviso, también en los repetidos
        bellRingFeedback();
        showToast(
          enLocalNuevos
            .map(({ data }) => {
              const n = numAvisosLlegada(data);
              return `📍 ${data.cliente?.nombre || "Cliente"} ya llegó${n > 1 ? ` (aviso #${n})` : ""}`;
            })
            .join(" · "),
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
let primerGruposDash = true;
const grupoFirmaDash = new Map();
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
      const nuevos = [];
      gruposMap.clear();
      snap.forEach((d) => {
        const g = { id: d.id, ...d.data() };
        gruposMap.set(d.id, g);
        const p = g.pedido;
        if (p && ["activo", "pedido_pendiente"].includes(g.estado)) {
          const f = `${p.total_items || 0}|${p.total || 0}|${p.estadoMozo || ""}`;
          if (
            !primerGruposDash &&
            grupoFirmaDash.get(d.id) !== f &&
            !pedidoEsperaMozo(p)
          )
            nuevos.push(g);
          grupoFirmaDash.set(d.id, f);
        }
      });
      primerGruposDash = false;
      if (originFilter === "mesa") renderMesaGrid();
      if (activeModalId && String(activeModalId).startsWith("mesa:")) {
        renderMesaDetail(Number(String(activeModalId).split(":")[1]));
      }
      if (nuevos.length) {
        playMesaChime();
        bellRingFeedback();
        showToast(
          "🍽️ Pedido nuevo en " +
            nuevos
              .map((g) => (g.mesas || []).map((m) => m.nombre).join(" + "))
              .join(", "),
        );
      }
    },
    (err) => console.warn("No se pudieron cargar los grupos de mesas:", err),
  );
}

function aplicarVisibilidadMesas() {
  const esFisica =
    String(PLAN_SERV?.panel_admin?.tipo_tienda ?? PLAN_SERV?.tipo_tienda ?? "")
      .toLowerCase()
      .trim() === "fisica";
  const debeMostrarMesas = ES_RESTAURANTE && esFisica && PLAN_PED.mesa;

  document
    .querySelector('.origin-chip[data-origin="mesa"]')
    ?.classList.toggle("plan-oculto", !debeMostrarMesas);

  if (autoresBtn)
    autoresBtn.style.display =
      debeMostrarMesas && originFilter === "mesa" ? "inline-flex" : "none";

  // Si estaba viendo Mesas y ya no corresponde, vuelve a WhatsApp
  if (!debeMostrarMesas && originFilter === "mesa") {
    document.querySelector('.origin-chip[data-origin="whatsapp"]')?.click();
  }
}

async function aplicarVisibilidadPorCategoriaPedidos() {
  let categoria = sessionStorage.getItem("categoriaTienda") || null;

  if (!categoria) {
    try {
      const snap = await getDoc(tiendaDoc(localidad, "tiendas", tiendaId));
      if (snap.exists()) {
        categoria = snap.data().categoria_tienda || null;
        sessionStorage.setItem("categoriaTienda", categoria || "");
      }
    } catch (err) {
      console.error("No se pudo obtener la categoría de la tienda.", err);
    }
  }

  ES_RESTAURANTE =
    (categoria || "")
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase() === "comida y restaurantes";

  // El chip "Nuevo pedido" aparece siempre
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
    actualizarVisibilidadDeli();
    aplicarVista("directo");
    await NuevoPedido.init();
  });

  ["whatsapp", "mesa"].forEach((origen) => {
    document
      .querySelector(`.origin-chip[data-origin="${origen}"]`)
      ?.addEventListener("click", () => {
        document.getElementById("nuevoPedidoWrap").style.display = "none";
        cerrarSesionCelular();
      });
  });

  aplicarPlanPedidos();
  aplicarVisibilidadMesas();
}
function iniciarListener() {
  if (!tiendaId) return;
  iniciarListenerMesas();
  iniciarListenerGrupos();
  iniciarListenerLlamados();
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
/* ══════════════ MIS DELIVERYS (contactos locales, máx. 5) ══════════════ */
let DLV_MAX = 5;
const dlvKey = () => `geinz_deliverys_${tiendaId}`;

function dlvLeer() {
  try {
    return JSON.parse(localStorage.getItem(dlvKey()) || "[]");
  } catch {
    return [];
  }
}
function dlvGuardar(lista) {
  try {
    localStorage.setItem(dlvKey(), JSON.stringify(lista));
    return true;
  } catch {
    showToast("⚠️ No hay espacio para guardar", true);
    return false;
  }
}
function dlvNumero(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 9) d = "51" + d;
  return d.length >= 11 && d.length <= 15 ? d : null;
}
function dlvAvatar(c) {
  return c.foto
    ? `<img src="${c.foto}" alt="">`
    : `<span>${escapeHtml((c.nombre || "?").trim().charAt(0).toUpperCase())}</span>`;
}
// Recorte cuadrado + WebP liviano
function dlvComprimirFoto(file, size = 128) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const c = document.createElement("canvas");
      c.width = c.height = size;
      c.getContext("2d").drawImage(
        img,
        (img.width - s) / 2,
        (img.height - s) / 2,
        s,
        s,
        0,
        0,
        size,
        size,
      );
      URL.revokeObjectURL(url);
      let out = c.toDataURL("image/webp", 0.72);
      if (!out.startsWith("data:image/webp"))
        out = c.toDataURL("image/jpeg", 0.72);
      resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject();
    };
    img.src = url;
  });
}

/* ── Estilos ── */
const DLV_CSS = `
.dlv-ov{
  display:flex;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:95;
  align-items:center;justify-content:center;padding:12px;
  opacity:0;visibility:hidden;pointer-events:none;
  transition:opacity .28s ease, visibility 0s linear .28s;
}
.dlv-ov.show{opacity:1;visibility:visible;pointer-events:auto;transition:opacity .28s ease, visibility 0s;}
.dlv-box{
  background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:16px;
  width:min(420px,100%);max-height:88vh;overflow-y:auto;color:#fff;
  opacity:0;transform:translateY(28px) scale(.96);
  transition:transform .38s cubic-bezier(.22,1,.36,1), opacity .28s ease;
}
.dlv-ov.show .dlv-box{opacity:1;transform:none;}
.dlv-head{display:flex;justify-content:space-between;align-items:center;font-weight:800;margin-bottom:12px;}
.dlv-head button{background:none;border:none;color:#fff;font-size:16px;cursor:pointer;}
@keyframes dlv-in{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}
.dlv-ov.show .dlv-item{animation:dlv-in .35s cubic-bezier(.22,1,.36,1) both;}
.dlv-ov.show .dlv-item:nth-child(2){animation-delay:.05s;}
.dlv-ov.show .dlv-item:nth-child(3){animation-delay:.1s;}
.dlv-ov.show .dlv-item:nth-child(4){animation-delay:.15s;}
.dlv-ov.show .dlv-item:nth-child(5){animation-delay:.2s;}
.dlv-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:12px;margin-bottom:8px;background:rgba(255,255,255,.03);}
.dlv-item.pick{cursor:pointer;transition:transform .15s ease, border-color .15s ease;}
.dlv-item.pick:hover{border-color:#25d366;}
.dlv-item.pick:active{transform:scale(.98);}
.dlv-av{width:42px;height:42px;border-radius:50%;overflow:hidden;flex-shrink:0;background:rgba(124,92,255,.2);display:flex;align-items:center;justify-content:center;font-weight:800;color:#a78bfa;}
.dlv-av img{width:100%;height:100%;object-fit:cover;}
.dlv-info{flex:1;min-width:0;}
.dlv-info b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dlv-info small{font-size:11.5px;color:var(--ink-dim);}
.dlv-mini{border:1px solid var(--line);background:var(--bg,#0a0a0f);color:#fff;border-radius:8px;width:30px;height:30px;cursor:pointer;flex-shrink:0;}
.dlv-mini.danger{color:#f87171;border-color:rgba(248,113,113,.35);}
.dlv-form{border-top:1px solid var(--line);margin-top:12px;padding-top:12px;display:flex;flex-direction:column;gap:8px;}
.dlv-form input[type=text],.dlv-form input[type=tel]{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg,#0a0a0f);color:#fff;font-size:16px;}
.dlv-foto-row{display:flex;align-items:center;gap:10px;}
.dlv-foto-row label{font-size:12px;font-weight:700;color:#a78bfa;cursor:pointer;}
.dlv-empty{font-size:12.5px;color:var(--ink-faint);text-align:center;padding:14px 0;}

/* Tabs */
.dlv-tabs{display:flex;gap:6px;margin-bottom:14px;padding:4px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid var(--line);}
.dlv-tab{flex:1;padding:8px 0;border:none;border-radius:9px;background:transparent;color:var(--ink-dim);font-weight:700;font-size:12.5px;cursor:pointer;transition:background .2s ease,color .2s ease;}
.dlv-tab.active{background:#7c5cff;color:#fff;}

/* Config del mensaje */
.dlv-cfg-sub{font-size:12px;color:var(--ink-dim);line-height:1.4;margin-bottom:10px;}
.dlv-cfg-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;border:1px solid var(--line);border-radius:12px;margin-bottom:6px;background:rgba(255,255,255,.03);font-size:12.5px;font-weight:600;}
.dlv-cfg-row span.l{display:flex;align-items:center;gap:8px;min-width:0;}
.dlv-cfg-intro{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg,#0a0a0f);color:#fff;font-size:16px;margin:4px 0 12px;}
.dlv-prev-title{font-size:11.5px;font-weight:800;color:#a78bfa;margin:12px 0 6px;letter-spacing:.04em;text-transform:uppercase;}
.dlv-prev{white-space:pre-wrap;word-break:break-word;font-size:12.5px;line-height:1.5;padding:12px 14px;border-radius:14px;border-top-left-radius:4px;background:#0f3d2e;border:1px solid rgba(37,211,102,.3);color:#e8fff3;max-height:220px;overflow-y:auto;}

@media (max-width:560px){
  .dlv-ov{align-items:flex-end;padding:0;}
  .dlv-box{width:100%;border-radius:18px 18px 0 0;max-height:92vh;opacity:1;transform:translateY(100%);}
  .dlv-ov.show .dlv-box{transform:none;}
}`;
const dlvStyle = document.createElement("style");
dlvStyle.textContent = DLV_CSS;
document.head.appendChild(dlvStyle);

/* ── Diálogos (se inyectan una sola vez) ── */
const dlvManage = document.createElement("div");
dlvManage.className = "dlv-ov";
dlvManage.innerHTML = `
  <div class="dlv-box">
    <div class="dlv-head"><span>🏍️ Mis deliverys</span><button type="button" data-x>✕</button></div>

    <div class="dlv-tabs">
      <button type="button" class="dlv-tab active" data-tab="contactos">👥 Contactos</button>
      <button type="button" class="dlv-tab" data-tab="mensaje">💬 Mensaje</button>
    </div>

    <div id="dlvTabContactos">
      <div id="dlvList"></div>
      <div class="dlv-form" id="dlvForm">
        <input type="text" id="dlvNombre" placeholder="Nombre" maxlength="40" autocomplete="off">
        <input type="tel" id="dlvNumero" placeholder="WhatsApp (ej: 987654321)" inputmode="numeric" autocomplete="off">
        <div class="dlv-foto-row">
          <div class="dlv-av" id="dlvFotoPrev"><span>📷</span></div>
          <label for="dlvFoto">Foto (opcional)</label>
          <input type="file" id="dlvFoto" accept="image/*" style="display:none">
        </div>
        <button type="button" class="np-confirmar-btn" id="dlvGuardarBtn">Agregar delivery</button>
        <button type="button" class="oc-btn ghost" id="dlvCancelarEdit" style="display:none;width:100%;">Cancelar edición</button>
      </div>
    </div>

    <div id="dlvTabMensaje" style="display:none;">
      <div class="dlv-cfg-sub">Elige qué datos se envían al delivery por WhatsApp. El mensaje se arma solo según lo que actives.</div>
      <input type="text" id="dlvCfgIntro" class="dlv-cfg-intro" maxlength="80" placeholder="Saludo inicial (opcional). Ej: Hola, nuevo pedido:">
      <div id="dlvCfgList"></div>
      <div class="dlv-prev-title">Vista previa</div>
      <div class="dlv-prev" id="dlvPrev"></div>
    </div>
  </div>`;
document.body.appendChild(dlvManage);

const dlvPick = document.createElement("div");
dlvPick.className = "dlv-ov";
dlvPick.innerHTML = `
  <div class="dlv-box">
    <div class="dlv-head"><span>🏍️ Enviar a…</span><button type="button" data-x>✕</button></div>
    <div id="dlvPickList"></div>
  </div>`;
document.body.appendChild(dlvPick);

[dlvManage, dlvPick].forEach((ov) => {
  ov.addEventListener("click", (e) => {
    if (e.target === ov || e.target.hasAttribute("data-x"))
      ov.classList.remove("show");
  });
});

/* ── Gestión ── */
let dlvEditId = null;
let dlvFotoTmp = null;

function dlvPintarContador() {
  const el = document.getElementById("deliverysVal");
  if (el) el.textContent = `${dlvLeer().length}/${DLV_MAX}`;
}
function dlvResetForm() {
  dlvEditId = null;
  dlvFotoTmp = null;
  document.getElementById("dlvNombre").value = "";
  document.getElementById("dlvNumero").value = "";
  document.getElementById("dlvFoto").value = "";
  document.getElementById("dlvFotoPrev").innerHTML = "<span>📷</span>";
  document.getElementById("dlvGuardarBtn").textContent = "Agregar delivery";
  document.getElementById("dlvCancelarEdit").style.display = "none";
}
function dlvPintarLista() {
  const lista = dlvLeer();
  const cont = document.getElementById("dlvList");
  cont.innerHTML = lista.length
    ? lista
        .map(
          (c) => `
      <div class="dlv-item">
        <div class="dlv-av">${dlvAvatar(c)}</div>
        <div class="dlv-info"><b>${escapeHtml(c.nombre)}</b><small>+${escapeHtml(c.numero)}</small></div>
        <button type="button" class="dlv-mini" data-edit="${c.id}" title="Editar">✎</button>
        <button type="button" class="dlv-mini danger" data-del="${c.id}" title="Eliminar">🗑</button>
      </div>`,
        )
        .join("")
    : `<div class="dlv-empty">Aún no agregaste deliverys.</div>`;
  const lleno = lista.length >= DLV_MAX && !dlvEditId;
  document.getElementById("dlvForm").style.display = lleno ? "none" : "flex";
  dlvPintarContador();
}
function dlvAbrirGestion() {
  dlvTab("contactos");
  dlvResetForm();
  dlvPintarLista();
  if (originFilter === "mesa") renderMesaGrid();
  dlvManage.classList.add("show");
}

document
  .getElementById("deliverysBtn")
  ?.addEventListener("click", dlvAbrirGestion);

document.getElementById("dlvList").addEventListener("click", (e) => {
  const lista = dlvLeer();
  const del = e.target.closest("[data-del]");
  const edit = e.target.closest("[data-edit]");
  if (del) {
    dlvGuardar(lista.filter((c) => c.id !== del.dataset.del));
    if (dlvEditId === del.dataset.del) dlvResetForm();
    dlvPintarLista();
  } else if (edit) {
    const c = lista.find((x) => x.id === edit.dataset.edit);
    if (!c) return;
    dlvEditId = c.id;
    dlvFotoTmp = null;
    document.getElementById("dlvNombre").value = c.nombre;
    document.getElementById("dlvNumero").value = c.numero;
    document.getElementById("dlvFotoPrev").innerHTML = dlvAvatar(c);
    document.getElementById("dlvGuardarBtn").textContent = "Guardar cambios";
    document.getElementById("dlvCancelarEdit").style.display = "block";
    document.getElementById("dlvForm").style.display = "flex";
  }
});

document.getElementById("dlvFoto").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    dlvFotoTmp = await dlvComprimirFoto(file);
    document.getElementById("dlvFotoPrev").innerHTML =
      `<img src="${dlvFotoTmp}" alt="">`;
  } catch {
    showToast("⚠️ No se pudo leer la imagen", true);
  }
});

document.getElementById("dlvCancelarEdit").addEventListener("click", () => {
  dlvResetForm();
  dlvPintarLista();
});

document.getElementById("dlvGuardarBtn").addEventListener("click", () => {
  const nombre = document.getElementById("dlvNombre").value.trim();
  const numero = dlvNumero(document.getElementById("dlvNumero").value);
  if (!nombre) return showToast("Falta el nombre", true);
  if (!numero) return showToast("WhatsApp no válido", true);

  const lista = dlvLeer();
  if (dlvEditId) {
    const c = lista.find((x) => x.id === dlvEditId);
    if (!c) return;
    c.nombre = nombre;
    c.numero = numero;
    if (dlvFotoTmp) c.foto = dlvFotoTmp;
  } else {
    if (lista.length >= DLV_MAX)
      return showToast(`Máximo ${DLV_MAX} deliverys`, true);
    lista.push({
      id: "d" + Date.now().toString(36),
      nombre,
      numero,
      foto: dlvFotoTmp || null,
    });
  }
  if (!dlvGuardar(lista)) return;
  showToast("✅ Delivery guardado");
  dlvResetForm();
  dlvPintarLista();
});
dlvPintarContador();
/* ── Configuración del mensaje para el delivery ── */
const DLV_CAMPOS = [
  { k: "codigo", ico: "🧾", label: "Código del pedido", def: true },
  { k: "cliente", ico: "👤", label: "Nombre del cliente", def: true },
  { k: "celular", ico: "📱", label: "Celular del cliente", def: true },
  { k: "direccion", ico: "📍", label: "Dirección / referencia", def: true },
  {
    k: "pin",
    ico: "📌",
    label: "Ubicación del cliente (pin en Maps)",
    def: false,
  },
  { k: "ruta", ico: "🗺️", label: "Link de ruta en Google Maps", def: true },
  { k: "productos", ico: "🛍️", label: "Lista de productos", def: false },
  { k: "total", ico: "💰", label: "Total del pedido", def: false },
  { k: "costoDelivery", ico: "🛵", label: "Costo de delivery", def: false },
  { k: "pago", ico: "💳", label: "Método de pago / vuelto", def: false },
  { k: "nota", ico: "📝", label: "Nota del cliente", def: false },
];
const dlvCfgKey = () => `geinz_dlv_cfg_${tiendaId}`;

function dlvCfgLeer() {
  let guardado = {};
  try {
    guardado = JSON.parse(localStorage.getItem(dlvCfgKey()) || "{}");
  } catch {}
  const cfg = { intro: guardado.intro || "" };
  DLV_CAMPOS.forEach((c) => {
    cfg[c.k] = typeof guardado[c.k] === "boolean" ? guardado[c.k] : c.def;
  });
  return cfg;
}
function dlvCfgGuardar(cfg) {
  try {
    localStorage.setItem(dlvCfgKey(), JSON.stringify(cfg));
  } catch {}
}

const DLV_EJEMPLO = {
  cliente: {
    nombre: "María Pérez",
    whatsapp: "987654321",
    direccion: "Av. Grau 123, frente al parque",
    tipo_entrega: "Delivery",
    ubicacion: { lat: -11.1067, lng: -77.6053 },
  },
  productos: [
    {
      nombre: "Pollo a la brasa",
      cantidad: 1,
      subtotal: 45,
      opciones: { Presa: "Pecho" },
    },
    { nombre: "Chicha morada", cantidad: 2, subtotal: 12 },
  ],
  total: 57,
  pago: { metodo: "Efectivo", vuelto: "100" },
  nota: "Sin ají por favor",
};

function dlvPintarPreview() {
  const el = document.getElementById("dlvPrev");
  if (!el) return;
  el.textContent =
    dlvMensaje("ABC123XYZ", DLV_EJEMPLO, dlvCfgLeer(), true) ||
    "Activa al menos un dato para armar el mensaje.";
}

function dlvPintarConfig() {
  const cfg = dlvCfgLeer();
  document.getElementById("dlvCfgIntro").value = cfg.intro;
  document.getElementById("dlvCfgList").innerHTML = DLV_CAMPOS.map(
    (c) => `
    <div class="dlv-cfg-row">
      <span class="l"><span>${c.ico}</span>${c.label}</span>
      <label class="switch">
        <input type="checkbox" data-cfg="${c.k}" ${cfg[c.k] ? "checked" : ""}>
        <span class="switch-track"></span>
      </label>
    </div>`,
  ).join("");
  dlvPintarPreview();
}

document.getElementById("dlvCfgList").addEventListener("change", (e) => {
  const k = e.target.dataset.cfg;
  if (!k) return;
  const cfg = dlvCfgLeer();
  cfg[k] = e.target.checked;
  dlvCfgGuardar(cfg);
  dlvPintarPreview();
});
document.getElementById("dlvCfgIntro").addEventListener("input", (e) => {
  const cfg = dlvCfgLeer();
  cfg.intro = e.target.value.trim();
  dlvCfgGuardar(cfg);
  dlvPintarPreview();
});

/* ── Tabs del diálogo ── */
function dlvTab(t) {
  dlvManage
    .querySelectorAll("[data-tab]")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
  document.getElementById("dlvTabContactos").style.display =
    t === "contactos" ? "block" : "none";
  document.getElementById("dlvTabMensaje").style.display =
    t === "mensaje" ? "block" : "none";
  if (t === "mensaje") dlvPintarConfig();
}
dlvManage
  .querySelectorAll("[data-tab]")
  .forEach((b) => b.addEventListener("click", () => dlvTab(b.dataset.tab)));
/* ── Mensaje de WhatsApp para el delivery ── */
function dlvCostoDeliveryTexto(p, ejemplo) {
  if (ejemplo) return "S/ 5.00";
  if (p.delivery?.costo != null)
    return p.delivery.gratis
      ? "Gratis (promo)"
      : fmtMoney(p.delivery.costo) +
          (p.delivery.zona ? ` (${p.delivery.zona})` : "");
  if (p.cupon?.envioGratis === true) return "Gratis (promo)";
  const ub = p.cliente?.ubicacion;
  if (!ub || typeof ub.lat !== "number" || bizLat == null || bizLng == null)
    return null;
  const precio = calcularPrecioDelivery(
    calcularDistanciaKm(bizLat, bizLng, ub.lat, ub.lng),
  );
  return precio === null ? null : fmtMoney(precio);
}

function dlvMensaje(id, p, cfg = dlvCfgLeer(), ejemplo = false) {
  const c = p.cliente || {};
  const ub = c.ubicacion;
  const tieneUb =
    ub && typeof ub.lat === "number" && typeof ub.lng === "number";
  const L = [];

  if (cfg.intro) L.push(cfg.intro, "");

  if (cfg.codigo) L.push(`🛵 *Pedido #${codigoCortoPedido(id)}*`);
  if (cfg.cliente) L.push(`👤 Cliente: ${c.nombre || "—"}`);

  if (cfg.celular) {
    const tel = String(c.whatsapp || "").replace(/\D/g, "");
    if (tel) L.push(`📱 Cel: +${tel}`);
  }
  if (cfg.direccion && c.direccion)
    L.push(`📍 Dirección / Ref: ${c.direccion}`);

  if (cfg.pin && tieneUb)
    L.push(`📌 Ubicación: https://www.google.com/maps?q=${ub.lat},${ub.lng}`);

  if (cfg.ruta && tieneUb) {
    const origin =
      bizLat != null && bizLng != null ? `&origin=${bizLat},${bizLng}` : "";
    L.push(
      `🗺️ Ruta: https://www.google.com/maps/dir/?api=1${origin}&destination=${ub.lat},${ub.lng}&travelmode=driving`,
    );
  }

  if (cfg.productos) {
    const prods = Array.isArray(p.productos) ? p.productos : [];
    if (prods.length) {
      L.push("", "🛍️ *Productos:*");
      prods.forEach((it) => {
        const ops = opcionesDetalleLineas(it).join(" · ");
        L.push(`• ${it.cantidad}x ${it.nombre}${ops ? ` (${ops})` : ""}`);
      });
    }
  }

  if (cfg.total) L.push(`💰 Total del pedido: ${fmtMoney(p.total)}`);

  if (cfg.costoDelivery) {
    const costo = dlvCostoDeliveryTexto(p, ejemplo);
    if (costo) L.push(`🛵 Costo de delivery: ${costo}`);
  }

  if (cfg.pago) {
    const pago = p.pago || {};
    if (pago.metodo) {
      let t = `💳 Pago: ${pago.metodo}`;
      if (pago.metodo === "Efectivo" && pago.vuelto)
        t += ` (paga con S/ ${pago.vuelto})`;
      L.push(t);
    }
  }

  if (cfg.nota && p.nota) L.push(`📝 Nota: ${p.nota}`);

  return L.join("\n").trim();
}

/* ── Selector dentro del pedido ── */
function dlvAbrirSelector(id, p) {
  const lista = dlvLeer();
  const cont = document.getElementById("dlvPickList");
  if (!lista.length) {
    cont.innerHTML = `<div class="dlv-empty">Aún no tienes deliverys.</div>
      <button type="button" class="np-confirmar-btn" id="dlvIrGestion">Agregar mi primer delivery</button>`;
    cont.querySelector("#dlvIrGestion").onclick = () => {
      dlvPick.classList.remove("show");
      dlvAbrirGestion();
    };
  } else {
    cont.innerHTML = lista
      .map(
        (c) => `
      <div class="dlv-item pick" data-pick="${c.id}">
        <div class="dlv-av">${dlvAvatar(c)}</div>
        <div class="dlv-info"><b>${escapeHtml(c.nombre)}</b><small>+${escapeHtml(c.numero)}</small></div>
        <span style="color:#25d366;font-weight:800;">Enviar →</span>
      </div>`,
      )
      .join("");
    cont.querySelectorAll("[data-pick]").forEach((row) => {
      row.onclick = () => {
        const c = lista.find((x) => x.id === row.dataset.pick);
        if (!c) return;
        window.open(
          `https://wa.me/${c.numero}?text=${encodeURIComponent(dlvMensaje(id, p))}`,
          "_blank",
          "noopener",
        );
        dlvPick.classList.remove("show");
      };
    });
  }
  dlvPick.classList.add("show");
}

/* ══════════════ TIEMPOS ESTIMADOS ══════════════ */
function getTiemposCfg() {
  const t = bizDataGlobal?.tiempos_estimados || {};

  const rango = (r, dMin, dMax) => ({
    min: Number(r?.min) || dMin,
    max: Number(r?.max) || dMax,
  });
  return {
    activo: PLAN_PED.tiempos && t.activo !== false,
    delivery: rango(t.delivery, 20, 30),
    recojo: rango(t.recojo, 10, 15),
  };
}

/* ── Modal de ajustes ── */
const tmpOv = document.createElement("div");
tmpOv.className = "dlv-ov";
tmpOv.innerHTML = `
  <div class="dlv-box">
    <div class="dlv-head"><span>⏱️ Tiempos estimados</span><button type="button" data-x>✕</button></div>
    <p class="dlv-cfg-sub">Este rango se le muestra al cliente al confirmar su pedido. Podrás cambiarlo en cada pedido cuando lo aceptes.</p>

    <div class="dlv-cfg-row">
      <span class="l">Mostrar tiempo al cliente</span>
      <label class="switch"><input type="checkbox" id="tmpActivo"><span class="switch-track"></span></label>
    </div>
    <div class="dlv-prev-title">🛵 Delivery (minutos)</div>
    <div style="display:flex;gap:8px;align-items:center;">
      <input type="number" id="tmpDelMin" class="deli-inp" min="1" style="flex:1"> <span>a</span>
      <input type="number" id="tmpDelMax" class="deli-inp" min="1" style="flex:1">
    </div>
    <div class="dlv-prev-title">🏬 Recojo en local (minutos)</div>
    <div style="display:flex;gap:8px;align-items:center;">
      <input type="number" id="tmpRecMin" class="deli-inp" min="1" style="flex:1"> <span>a</span>
      <input type="number" id="tmpRecMax" class="deli-inp" min="1" style="flex:1">
    </div>
    <button type="button" class="np-confirmar-btn" id="tmpGuardar" style="margin-top:16px;">Guardar</button>
  </div>`;
document.body.appendChild(tmpOv);
tmpOv.addEventListener("click", (e) => {
  if (e.target === tmpOv || e.target.hasAttribute("data-x"))
    tmpOv.classList.remove("show");
});

function abrirAjusteTiempos() {
  const c = getTiemposCfg();
  document.getElementById("tmpActivo").checked = c.activo;
  document.getElementById("tmpDelMin").value = c.delivery.min;
  document.getElementById("tmpDelMax").value = c.delivery.max;
  document.getElementById("tmpRecMin").value = c.recojo.min;
  document.getElementById("tmpRecMax").value = c.recojo.max;
  tmpOv.classList.add("show");
}

document.getElementById("tmpGuardar").addEventListener("click", async () => {
  const n = (id) =>
    Math.max(1, Math.round(Number(document.getElementById(id).value) || 1));
  const delivery = { min: n("tmpDelMin"), max: n("tmpDelMax") };
  const recojo = { min: n("tmpRecMin"), max: n("tmpRecMax") };
  if (delivery.max < delivery.min || recojo.max < recojo.min)
    return showToast("El máximo no puede ser menor que el mínimo", true);
  const cfg = {
    activo: document.getElementById("tmpActivo").checked,
    delivery,
    recojo,
  };
  try {
    await updateDoc(tiendaDoc(localidad, "tiendas", tiendaId), {
      tiempos_estimados: cfg,
    });
    bizDataGlobal = { ...(bizDataGlobal || {}), tiempos_estimados: cfg };
    tmpOv.classList.remove("show");
    showToast("⏱️ Tiempos guardados");
  } catch (e) {
    console.error(e);
    showToast("❌ No se pudo guardar", true);
  }
});

// Botón en la barra superior (muévelo a tu HTML si prefieres)
const tmpBtn = document.createElement("button");
tmpBtn.type = "button";
tmpBtn.className = "oc-btn ghost";
tmpBtn.textContent = "⏱️ Tiempos";
tmpBtn.addEventListener("click", abrirAjusteTiempos);
(topActionsEl || document.body).appendChild(tmpBtn);

/* ── Modal al aceptar un pedido: pide/ajusta el tiempo ── */
function pedirTiempo(p) {
  return new Promise((resolve) => {
    const cfg = getTiemposCfg();
    const esDelivery = p.cliente?.tipo_entrega === "Delivery";
    const base = p.tiempo_estimado || (esDelivery ? cfg.delivery : cfg.recojo);

    const ov = document.createElement("div");
    ov.className = "dlv-ov";
    ov.innerHTML = `
      <div class="dlv-box">
        <div class="dlv-head"><span>⏱️ ¿Cuánto se demorará?</span><button type="button" data-x>✕</button></div>
        <p class="dlv-cfg-sub">${esDelivery ? "🛵 Delivery" : "🏬 Recojo"} · Se lo mostramos al cliente en su seguimiento.</p>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="number" id="ptMin" class="deli-inp" min="1" value="${base.min}" style="flex:1"> <span>a</span>
          <input type="number" id="ptMax" class="deli-inp" min="1" value="${base.max}" style="flex:1"> <span>min</span>
        </div>
        <button type="button" class="np-confirmar-btn" id="ptOk" style="margin-top:16px;">Confirmar y aceptar</button>
        <button type="button" class="oc-btn ghost" id="ptKeep" style="width:100%;margin-top:8px;">Mantener el tiempo actual</button>
      </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add("show"));

    const cerrar = (val) => {
      ov.classList.remove("show");
      setTimeout(() => ov.remove(), 300);
      resolve(val);
    };
    ov.addEventListener("click", (e) => {
      if (e.target === ov || e.target.hasAttribute("data-x")) cerrar(null);
    });
    ov.querySelector("#ptKeep").onclick = () => cerrar({});
    ov.querySelector("#ptOk").onclick = () => {
      const min = Math.max(
        1,
        Math.round(Number(ov.querySelector("#ptMin").value) || 1),
      );
      const max = Math.max(
        1,
        Math.round(Number(ov.querySelector("#ptMax").value) || 1),
      );
      if (max < min)
        return showToast("El máximo no puede ser menor que el mínimo", true);
      cerrar({ min, max });
    };
  });
}

async function accionEstado(id, p, estado, accion, btn) {
  if (
    estado === "pendiente" &&
    deliveryBloquea(p) &&
    ["en_proceso", "pendiente_pago", "listo"].includes(accion)
  )
    return showToast(
      "Primero fija el delivery y espera que el cliente lo acepte",
      true,
    );
  const pide =
    PLAN_PED.tiempos &&
    accion === "en_proceso" &&
    (estado === "pendiente" || estado === "pendiente_pago") &&
    getOrigen(p).tipo === "whatsapp";
  if (!pide) return cambiarEstado(id, accion, btn);
  const r = await pedirTiempo(p);
  if (r === null) return; // canceló
  cambiarEstado(id, accion, btn, { tiempo: r.min ? r : null });
}
/* ══════════════ MOZOS (solo en la vista Mesas) ══════════════ */
const mozosCol = () => tiendaSubCol(localidad, "tiendas", tiendaId, "mozos");

async function mzHash(pin, usuario) {
  const b = new TextEncoder().encode(`${tiendaId}:${usuario}:${pin}`);
  const h = await crypto.subtle.digest("SHA-256", b);
  return [...new Uint8Array(h)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

let mzLista = []; // mozos (/mozos)
let mzTrab = []; // trabajadores (/trabajadores)
let mzSel = null; // trabajador al que se le está creando el acceso

const mzOv = document.createElement("div");
mzOv.className = "dlv-ov";
mzOv.innerHTML = `
  <div class="dlv-box">
    <div class="dlv-head"><span>🧑‍🍳 Mozos</span><button type="button" data-x>✕</button></div>
  <p class="dlv-cfg-sub">Elige cuáles de tus trabajadores son mozos. Comparte este enlace: cada mozo entra con su usuario y PIN.</p>
<div class="dlv-item" style="gap:8px;">
  <input type="text" id="mzLinkInput" readonly class="deli-inp" style="flex:1;min-width:0;font-size:12px;">
  <button type="button" class="oc-btn ghost" id="mzCopiar">📋 Copiar</button>
</div>
<button type="button" class="oc-btn ghost" id="mzWsp" style="width:100%;margin-bottom:10px;">💬 Enviar por WhatsApp</button>
    <div id="mzList"></div>
    <div class="dlv-form" id="mzForm" style="display:none;">
      <div class="dlv-prev-title" id="mzFormTitulo"></div>
      <input type="text" id="mzUsuario" placeholder="Usuario (sin espacios)" maxlength="20" autocomplete="off">
      <input type="tel" id="mzPin" placeholder="PIN (4 a 8 números)" inputmode="numeric" maxlength="8" autocomplete="off">
      <button type="button" class="np-confirmar-btn" id="mzGuardar">Guardar mozo</button>
      <button type="button" class="oc-btn ghost" id="mzCancelar" style="width:100%;">Cancelar</button>
    </div>
    <div id="mzSueltos"></div>
  </div>`;
document.body.appendChild(mzOv);
mzOv.addEventListener("click", (e) => {
  if (e.target === mzOv || e.target.hasAttribute("data-x"))
    mzOv.classList.remove("show");
});
document.getElementById("mzCopiar").addEventListener("click", async () => {
  const link = mzLinkMozo();
  try {
    await navigator.clipboard.writeText(link);
  } catch {
    // respaldo si el navegador no deja usar el portapapeles
    const inp = document.getElementById("mzLinkInput");
    inp.select();
    document.execCommand("copy");
  }
  showToast("📋 Enlace copiado");
});

document.getElementById("mzWsp").addEventListener("click", () => {
  const msg = `Hola, entra a este enlace para atender mesas en ${bizNombreGlobal}. Usa tu usuario y PIN:\n${mzLinkMozo()}`;
  window.open(
    `https://wa.me/?text=${encodeURIComponent(msg)}`,
    "_blank",
    "noopener",
  );
});
function mzPintar() {
  const porTrab = new Map(
    mzLista.filter((m) => m.trabajadorId).map((m) => [m.trabajadorId, m]),
  );
  const libres = mzTrab.filter((t) => !porTrab.has(t.id));
  const sueltos = mzLista.filter(
    (m) => !m.trabajadorId || !mzTrab.some((t) => t.id === m.trabajadorId),
  );

  const list = document.getElementById("mzList");
  list.innerHTML = mzTrab.length
    ? mzTrab
        .map((t) => {
          const m = porTrab.get(t.id);
          const av = `<div class="dlv-av"><span>${escapeHtml((t.nombre || "?")[0].toUpperCase())}</span></div>`;
          if (!m)
            return `<div class="dlv-item">${av}
              <div class="dlv-info"><b>${escapeHtml(t.nombre)}</b><small>${escapeHtml(t.cargo || "Trabajador")}</small></div>
              <button type="button" class="oc-btn ghost" data-mz-nuevo="${t.id}">Hacer mozo</button></div>`;
          return `<div class="dlv-item">${av}
            <div class="dlv-info"><b>${escapeHtml(t.nombre)} <span style="font-size:10px;color:#a78bfa;">🧑‍🍳 Mozo</span></b>
              <small>@${escapeHtml(m.usuario || "")}${m.activo === false ? " · inactivo" : ""}</small></div>
            <button class="dlv-mini" data-mz-pin="${m.id}" title="Cambiar PIN">🔑</button>
            <button class="dlv-mini" data-mz-tog="${m.id}" title="Activar/desactivar">${m.activo === false ? "▶" : "⏸"}</button>
            <button class="dlv-mini danger" data-mz-del="${m.id}" title="Quitar como mozo">🗑</button></div>`;
        })
        .join("")
    : `<div class="dlv-empty">Aún no tienes trabajadores. Regístralos primero en <b>Trabajadores y planilla</b>.</div>`;

  // Mozos viejos que no están vinculados a ningún trabajador
  document.getElementById("mzSueltos").innerHTML = sueltos.length
    ? `<div class="dlv-prev-title">Mozos sin vincular</div>` +
      sueltos
        .map(
          (m) => `<div class="dlv-item">
            <div class="dlv-av"><span>${escapeHtml((m.nombre || "?")[0].toUpperCase())}</span></div>
            <div class="dlv-info"><b>${escapeHtml(m.nombre)}</b><small>@${escapeHtml(m.usuario || "")}</small></div>
            ${
              libres.length
                ? `<select class="deli-inp" data-mz-link="${m.id}" style="max-width:130px;">
                     <option value="">Vincular a…</option>
                     ${libres.map((t) => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join("")}
                   </select>`
                : ""
            }
            <button class="dlv-mini danger" data-mz-del="${m.id}" title="Eliminar">🗑</button></div>`,
        )
        .join("")
    : "";
}

async function mzCargar() {
  const [mSnap, tSnap] = await Promise.all([
    getDocs(mozosCol()),
    getDocs(tiendaSubCol(localidad, "tiendas", tiendaId, "trabajadores")).catch(
      () => ({ docs: [] }),
    ),
  ]);
  mzLista = mSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  mzTrab = tSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));

  // Si cambió el nombre del trabajador, se actualiza el del mozo
  mzLista.forEach((m) => {
    const t = mzTrab.find((x) => x.id === m.trabajadorId);
    if (t && t.nombre !== m.nombre) {
      m.nombre = t.nombre;
      updateDoc(tiendaSubDoc(localidad, "tiendas", tiendaId, "mozos", m.id), {
        nombre: t.nombre,
      }).catch(() => {});
    }
  });
  mzPintar();
}

function mzCerrarForm() {
  mzSel = null;
  document.getElementById("mzForm").style.display = "none";
  document.getElementById("mzUsuario").value = "";
  document.getElementById("mzPin").value = "";
}

function mzLinkMozo() {
  return `https://geinztech.com/mozo/mozo?id=${encodeURIComponent(tiendaId)}&localidad=${encodeURIComponent(localidad)}`;
}

async function mzAbrir() {
  document.getElementById("mzLinkInput").value = mzLinkMozo();
  mzCerrarForm();
  await mzCargar();
  mzOv.classList.add("show");
}

function mzNuevo(trabId) {
  const t = mzTrab.find((x) => x.id === trabId);
  if (!t) return;
  mzSel = trabId;
  document.getElementById("mzFormTitulo").textContent =
    `Acceso para ${t.nombre}`;
  document.getElementById("mzUsuario").value = (t.nombre || "")
    .split(" ")[0]
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  document.getElementById("mzPin").value = "";
  const f = document.getElementById("mzForm");
  f.style.display = "flex";
  f.scrollIntoView({ behavior: "smooth", block: "nearest" });
  document.getElementById("mzPin").focus();
}

mzOv.addEventListener("click", async (e) => {
  const nuevo = e.target.closest("[data-mz-nuevo]");
  const pin = e.target.closest("[data-mz-pin]");
  const tog = e.target.closest("[data-mz-tog]");
  const del = e.target.closest("[data-mz-del]");
  if (e.target.id === "mzCancelar") return mzCerrarForm();
  if (nuevo) return mzNuevo(nuevo.dataset.mzNuevo);

  const btn = pin || tog || del;
  if (!btn) return;
  const id = btn.dataset.mzPin || btn.dataset.mzTog || btn.dataset.mzDel;
  const m = mzLista.find((x) => x.id === id);
  if (!m) return;
  const ref = tiendaSubDoc(localidad, "tiendas", tiendaId, "mozos", id);
  try {
    if (pin) {
      const nuevoPin = window.prompt(
        `Nuevo PIN para ${m.nombre} (4 a 8 números):`,
        "",
      );
      if (nuevoPin === null) return;
      if (!/^\d{4,8}$/.test(nuevoPin))
        return showToast("El PIN debe tener 4 a 8 números", true);
      await updateDoc(ref, { pinHash: await mzHash(nuevoPin, m.usuario) });
      showToast("🔑 PIN actualizado");
    } else if (tog) {
      await updateDoc(ref, { activo: m.activo === false });
    } else if (
      del &&
      window.confirm(
        m.trabajadorId
          ? `¿Quitar a ${m.nombre} como mozo? Seguirá en tu planilla.`
          : `¿Eliminar a ${m.nombre}?`,
      )
    ) {
      await deleteDoc(ref);
    }
    mzCargar();
  } catch (err) {
    console.error(err);
    showToast("❌ No se pudo actualizar", true);
  }
});

// Vincular un mozo viejo a un trabajador
mzOv.addEventListener("change", async (e) => {
  const sel = e.target.closest("[data-mz-link]");
  if (!sel || !sel.value) return;
  const t = mzTrab.find((x) => x.id === sel.value);
  if (!t) return;
  try {
    await updateDoc(
      tiendaSubDoc(localidad, "tiendas", tiendaId, "mozos", sel.dataset.mzLink),
      { trabajadorId: t.id, nombre: t.nombre },
    );
    showToast(`🔗 Vinculado a ${t.nombre}`);
    mzCargar();
  } catch (err) {
    console.error(err);
    showToast("❌ No se pudo vincular", true);
  }
});

document.getElementById("mzGuardar").addEventListener("click", async () => {
  const t = mzTrab.find((x) => x.id === mzSel);
  if (!t) return showToast("Elige un trabajador", true);
  const usuario = document
    .getElementById("mzUsuario")
    .value.trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  const pin = document.getElementById("mzPin").value.trim();
  if (!usuario) return showToast("Falta el usuario", true);
  if (!/^\d{4,8}$/.test(pin))
    return showToast("El PIN debe tener 4 a 8 números", true);
  if (mzLista.some((m) => m.usuario === usuario))
    return showToast("Ese usuario ya existe", true);
  try {
    await setDoc(doc(mozosCol()), {
      nombre: t.nombre,
      usuario,
      pinHash: await mzHash(pin, usuario),
      activo: true,
      trabajadorId: t.id,
      creadoEn: serverTimestamp(),
    });
    mzCerrarForm();
    showToast(`✅ ${t.nombre} ahora es mozo`);
    mzCargar();
  } catch (err) {
    console.error(err);
    showToast("❌ No se pudo guardar", true);
  }
});

// Botón dentro de la vista Mesas
const mzBtn = document.createElement("button");
mzBtn.type = "button";
mzBtn.className = "mg-btn mg-reservar";
mzBtn.textContent = "🧑‍🍳 Mozos";
mzBtn.addEventListener("click", mzAbrir);
document.querySelector(".mesas-panel-head")?.appendChild(mzBtn);
/* ══════════════ ESTADO DE MESA + CONFIG DE MESAS ══════════════ */
function setEstadoMesaAdmin(numero, nuevo) {
  const act = getPedidosDeMesa(numero)[0];
  if (!act) return;
  const [mesaDocId, pp] = act;
  const esGrupo = !!pp.grupoId;
  const dueno = esGrupo ? gruposMap.get(pp.grupoId) : mesasMap.get(mesaDocId);
  if (!dueno?.pedido) return;

  // 1) Cambio LOCAL inmediato: la tarjeta y el modal cambian al toque
  // 1) Cambio LOCAL inmediato: la tarjeta y el modal cambian al toque
  const base = dueno.pedido;
  const productos = (base.productos || []).map((it) => {
    const cur = estItem(it, base);
    return cur === "entregado" || cur === nuevo
      ? { ...it, estadoItem: cur }
      : { ...it, estadoItem: nuevo };
  });
  const despues = {
    ...base,
    productos,
    estadoMesa: derivarEstadoMesa(productos, nuevo),
  };
  dueno.pedido = despues;
  renderMesaGrid();
  if (activeModalId === `mesa:${numero}`) renderMesaDetail(numero);
  showToast(
    nuevo === "entregado" ? "🍽️ Marcado como entregado" : "🔥 En preparación",
  );

  // 2) Base de datos en segundo plano (sin await)
  const b = writeBatch(db);
  if (esGrupo)
    b.set(
      tiendaSubDoc(localidad, "tiendas", tiendaId, "grupos_mesas", pp.grupoId),
      { pedido: sinUndef(despues) },
      { merge: true },
    );
  else
    b.set(
      tiendaSubDoc(localidad, "tiendas", tiendaId, "mesas", mesaDocId),
      { pedido: sinUndef(despues) },
      { merge: true },
    );
  if (pp.pedidoDocId)
    b.set(
      tiendaSubDoc(localidad, "tiendas", tiendaId, "pedidos", pp.pedidoDocId),
      { estadoMesa: despues.estadoMesa, productos: sinUndef(productos) },
      { merge: true },
    );
  b.commit().catch((e) => {
    console.error(e);
    showToast("❌ No se pudo guardar, se revirtió el estado", true);
  });
}
const mcOv = document.createElement("div");
mcOv.className = "dlv-ov";
mcOv.innerHTML = `
  <div class="dlv-box">
    <div class="dlv-head"><span>⚙️ Configurar mesas</span><button type="button" data-x>✕</button></div>
    <div class="dlv-cfg-row"><span class="l">El mozo confirma los pedidos primero</span>
      <label class="switch"><input type="checkbox" id="mcInter"><span class="switch-track"></span></label></div>
    <p class="dlv-cfg-sub">Activado: el pedido del cliente pasa por el mozo antes de llegar al panel. Desactivado: llega directo.</p>
        <div class="dlv-cfg-row"><span class="l">Los mozos pueden liberar, cancelar y cambiar estados</span>
      <label class="switch"><input type="checkbox" id="mcPerm"><span class="switch-track"></span></label></div>
    <div class="dlv-cfg-row"><span class="l">🧾 Cliente puede pedir boleta/factura al pedir la cuenta</span>
      <label class="switch"><input type="checkbox" id="mcCompCli"><span class="switch-track"></span></label></div>
    <div class="dlv-cfg-row"><span class="l">🧾 Mozo puede pedir boleta/factura y subir voucher de pago</span>
      <label class="switch"><input type="checkbox" id="mcCompMozo"><span class="switch-track"></span></label></div>
    <div class="dlv-prev-title">Sillas por mesa (máx. dispositivos con el QR)</div>
    <div id="mcList"></div>
    <button type="button" class="np-confirmar-btn" id="mcGuardar" style="margin-top:14px;">Guardar</button>
  </div>`;
document.body.appendChild(mcOv);
mcOv.addEventListener("click", (e) => {
  if (e.target === mcOv || e.target.hasAttribute("data-x"))
    mcOv.classList.remove("show");
});
function aplicarVisibilidadPorTipoTienda() {
  const esFisica =
    String(PLAN_SERV?.panel_admin?.tipo_tienda ?? PLAN_SERV?.tipo_tienda ?? "")
      .toLowerCase()
      .trim() === "fisica";
  ["peToggle", "rnEdit"].forEach((id) =>
    document
      .getElementById(id)
      ?.closest(".autorej-wrap")
      ?.classList.toggle("plan-oculto", esFisica),
  );
}
function mcAbrir() {
  document.getElementById("mcInter").checked =
    bizDataGlobal?.mesas_config?.mozoIntermediario === true;
  document.getElementById("mcPerm").checked =
    bizDataGlobal?.mesas_config?.mozoPermisos === true;
  document.getElementById("mcCompCli").checked =
    bizDataGlobal?.mesas_config?.compCliente !== false;
  document.getElementById("mcCompMozo").checked =
    bizDataGlobal?.mesas_config?.compMozo !== false;

  document.getElementById("mcList").innerHTML =
    [...mesasMap.entries()]
      .sort((a, b) => (a[1].numero_mesa || 0) - (b[1].numero_mesa || 0))
      .slice(0, maxMesasPlan() ?? undefined)
      .map(
        ([id, m]) => `
      <div class="dlv-item">
        <div class="dlv-info"><b>${escapeHtml(m.nombre_alias || "Mesa " + m.numero_mesa)}</b></div>
        <span style="font-size:12px;">🪑</span>
        <input type="number" min="1" max="30" value="${Number(m.sillas) || 4}" data-sillas="${id}" class="deli-inp" style="width:64px;">
      </div>`,
      )
      .join("") || `<div class="dlv-empty">No hay mesas.</div>`;
  mcOv.classList.add("show");
}
document.getElementById("mcGuardar").addEventListener("click", async () => {
  try {
    const inter = document.getElementById("mcInter").checked;
    const perm = document.getElementById("mcPerm").checked;
    const compCli = document.getElementById("mcCompCli").checked;
    const compMozo = document.getElementById("mcCompMozo").checked;
    await updateDoc(tiendaDoc(localidad, "tiendas", tiendaId), {
      "mesas_config.mozoIntermediario": inter,
      "mesas_config.mozoPermisos": perm,
      "mesas_config.compCliente": compCli,
      "mesas_config.compMozo": compMozo,
    });
    bizDataGlobal = {
      ...(bizDataGlobal || {}),
      mesas_config: {
        ...(bizDataGlobal?.mesas_config || {}),
        mozoIntermediario: inter,
        mozoPermisos: perm,
        compCliente: compCli,
        compMozo: compMozo,
      },
    };
    const b = writeBatch(db);
    document.querySelectorAll("[data-sillas]").forEach((i) => {
      b.set(
        tiendaSubDoc(localidad, "tiendas", tiendaId, "mesas", i.dataset.sillas),
        { sillas: Math.max(1, Math.min(30, Math.round(Number(i.value) || 4))) },
        { merge: true },
      );
    });
    await b.commit();
    mcOv.classList.remove("show");
    showToast("⚙️ Configuración guardada");
  } catch (e) {
    console.error(e);
    showToast("❌ No se pudo guardar", true);
  }
});
const mcBtn = document.createElement("button");
mcBtn.type = "button";
mcBtn.className = "mg-btn mg-reservar";
mcBtn.textContent = "⚙️ Config. mesas";
mcBtn.addEventListener("click", mcAbrir);
document.querySelector(".mesas-panel-head")?.appendChild(mcBtn);

const extraStyle = document.createElement("style");
extraStyle.textContent = `
.order-card.oc-en-local{border-color:#ec4899 !important;box-shadow:0 0 0 3px rgba(236,72,153,.2),0 8px 26px rgba(236,72,153,.28);animation:oc-local-glow 1.3s ease-in-out infinite;}
@keyframes oc-local-glow{0%,100%{box-shadow:0 0 0 3px rgba(236,72,153,.2),0 8px 26px rgba(236,72,153,.28);}50%{box-shadow:0 0 0 7px rgba(236,72,153,.32),0 10px 32px rgba(236,72,153,.4);}}
.stab[data-s="listo"] .dot{background:#2dd4bf;}
.est-legend{display:flex;flex-wrap:wrap;gap:8px 14px;padding:8px 16px;font-size:11.5px;font-weight:700;color:var(--ink-dim);}
.est-legend span{display:inline-flex;align-items:center;gap:6px;}
.est-legend i{width:10px;height:10px;border-radius:50%;display:inline-block;}
#statusTabs.vista-oculta + .est-legend{display:none;}
/* Menú de configuración */
#cfgPanel{position:fixed;right:12px;left:auto;top:70px;margin:0;width:min(440px,calc(100vw - 24px));z-index:60;display:none;grid-template-columns:1fr 1fr;gap:10px;padding:14px;overflow-y:auto;background:var(--surface);border:1px solid var(--line);border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.6);}#cfgPanel.show{display:grid;}#cfgPanel .autorej-wrap{display:block;position:static;min-width:0;}
#cfgPanel .autorej-wrap:has(#autoresBtn[style*="none"]){display:none;}
#cfgPanel .autorej-btn,#cfgPanel .oc-btn{width:100%;min-height:44px;justify-content:flex-start;white-space:nowrap;}
@media (max-width:480px){#cfgPanel{grid-template-columns:1fr;top:64px;}}
`;
document.head.appendChild(extraStyle);
/* ══════════ Menú de configuración ordenado + leyenda + estados ══════════ */
(function () {
  const headRight = document.querySelector(".head-right");
  if (!headRight) return;

  const box = document.createElement("div");
  box.style.position = "relative";
  box.innerHTML = `<button type="button" class="autorej-btn" id="cfgBtn"><span class="ico">⚙️</span><span class="lbl-text">Configuración</span></button><div id="cfgPanel"></div>`;
  headRight.insertBefore(box, document.getElementById("bellBtn"));
  const panel = box.querySelector("#cfgPanel");

  headRight
    .querySelectorAll(".autorej-wrap")
    .forEach((w) => panel.appendChild(w));

  /* Modal: estados del pedido */
  const estOv = document.createElement("div");
  estOv.className = "dlv-ov";
  const filas = [
    ["pendiente", "Pendiente", true],
    ["pendiente_pago", "Pendiente de pago", false],
    ["en_proceso", "En proceso", true],
    ["listo", "Listo", true],
    ["en_pausa", "En pausa", false],
    ["entregado", "Entregado", true],
  ];
  estOv.innerHTML = `
    <div class="dlv-box">
      <div class="dlv-head"><span>📋 Estados del pedido</span><button type="button" data-x>✕</button></div>
      <p class="dlv-cfg-sub">Activa o desactiva los estados opcionales. Los obligatorios no se pueden apagar.</p>
      ${filas
        .map(
          ([k, l, fijo]) => `
        <div class="dlv-cfg-row"><span class="l">${l}${fijo ? " (obligatorio)" : ""}</span>
          <label class="switch"><input type="checkbox" data-est="${k}" ${fijo ? "checked disabled" : ""}><span class="switch-track"></span></label>
        </div>`,
        )
        .join("")}
      <button type="button" class="np-confirmar-btn" id="estGuardar" style="margin-top:14px;">Guardar</button>
    </div>`;
  document.body.appendChild(estOv);
  estOv.addEventListener("click", (e) => {
    if (e.target === estOv || e.target.hasAttribute("data-x"))
      estOv.classList.remove("show");
  });

  const estBtn = document.createElement("button");
  estBtn.type = "button";
  estBtn.className = "oc-btn ghost";
  estBtn.textContent = "📋 Estados del pedido";
  estBtn.id = "estBtn";
  estBtn.addEventListener("click", () => {
    estOv.querySelectorAll("[data-est]").forEach((i) => {
      if (!i.disabled) i.checked = estadoHabilitado(i.dataset.est);
    });
    estOv.classList.add("show");
  });
  panel.appendChild(estBtn);

  document.getElementById("estGuardar").addEventListener("click", () => {
    const estados = {};
    estOv
      .querySelectorAll("[data-est]:not([disabled])")
      .forEach((i) => (estados[i.dataset.est] = i.checked));
    bizDataGlobal = { ...(bizDataGlobal || {}), pedidos_config: { estados } };
    estOv.classList.remove("show");
    renderBoard();
    showToast("📋 Estados guardados");
    updateDoc(tiendaDoc(localidad, "tiendas", tiendaId), {
      "pedidos_config.estados": estados,
    }).catch((e) => {
      console.error(e);
      showToast("❌ No se pudo guardar, revisa tu conexión", true);
    });
  });

  /* Mover "Tiempos" al panel y cerrar el panel al abrir modales */
  if (typeof tmpBtn !== "undefined") panel.appendChild(tmpBtn);
  [tmpBtn, estBtn, document.getElementById("deliverysBtn")].forEach((b) =>
    b?.addEventListener("click", () => panel.classList.remove("show")),
  );

  const cfgBtnEl = box.querySelector("#cfgBtn");

  function posCfgPanel() {
    const r = cfgBtnEl.getBoundingClientRect();
    const w = Math.min(440, window.innerWidth - 24);
    const top = r.bottom + 8;
    panel.style.top = top + "px";
    panel.style.right = "auto";
    panel.style.left =
      Math.max(12, Math.min(r.left, window.innerWidth - w - 12)) + "px";
    panel.style.maxHeight = Math.max(200, window.innerHeight - top - 12) + "px";
  }

  cfgBtnEl.addEventListener("click", (e) => {
    e.stopPropagation();
    posCfgPanel();
    panel.classList.toggle("show");
  });
  window.addEventListener("resize", posCfgPanel);
  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target)) panel.classList.remove("show");
  });

  /* Leyenda de colores bajo las pestañas de estado */
  const tabs = document.getElementById("statusTabs");
  if (tabs) {
    const lg = document.createElement("div");
    lg.className = "est-legend";
    lg.innerHTML = [
      ["#ec4899", "Cliente en local"],
      ["#fbbf24", "Pago enviado"],
      ["#2dd4bf", "Listo"],
      ["#38bdf8", "En pausa"],
    ]
      .map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`)
      .join("");
    tabs.after(lg);
  }
})();

/* Sacar cuadros y panel al body, fijos y visibles en PC y móvil */
["autorejPop", "autoresPop", "deliPop"].forEach((id) => {
  const pop = document.getElementById(id);
  if (pop) document.body.appendChild(pop);
});
const cfgPanelEl = document.getElementById("cfgPanel");
if (cfgPanelEl) document.body.appendChild(cfgPanelEl);

["autorejBtn", "autoresBtn", "deliBtn"].forEach((id) => {
  document.getElementById(id)?.addEventListener("click", () => {
    document.getElementById("cfgPanel")?.classList.remove("show");
  });
});

const fixStyle = document.createElement("style");
fixStyle.textContent = `
#cfgPanel{position:fixed !important;margin:0 !important;transform:none !important;z-index:200 !important;}
#mesaGrid{
  align-content:start !important;
  align-items:start !important;
  grid-auto-rows:var(--mesa-h,168px) !important;
}
#mesaGrid .mesa-box{
  height:var(--mesa-h,168px) !important;
  min-height:0 !important;
}
#popBackdrop{
  position:fixed;inset:0;z-index:250;
  background:rgba(4,4,8,.72);
  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  opacity:0;visibility:hidden;
  transition:opacity .28s ease, visibility 0s linear .28s;
}
#popBackdrop.show{opacity:1;visibility:visible;transition:opacity .28s ease, visibility 0s;}

#autorejPop,#autoresPop,#deliPop{
  position:fixed !important;left:50% !important;top:50% !important;right:auto !important;bottom:auto !important;
  margin:0 !important;width:min(400px,92vw) !important;max-height:86vh;overflow-y:auto;
  z-index:300 !important;padding:20px !important;border-radius:20px !important;
  background:var(--surface,#14141c) !important;border:1px solid var(--line) !important;
  box-shadow:0 30px 90px rgba(0,0,0,.65) !important;
  display:block !important;
  opacity:0;visibility:hidden;pointer-events:none;
  transform:translate(-50%,-46%) scale(.94) !important;
  transition:opacity .25s ease, transform .32s cubic-bezier(.22,1,.36,1), visibility 0s linear .32s;
}
#autorejPop.show,#autoresPop.show,#deliPop.show{
  opacity:1 !important;visibility:visible !important;pointer-events:auto !important;
  transform:translate(-50%,-50%) scale(1) !important;
  transition:opacity .25s ease, transform .32s cubic-bezier(.22,1,.36,1), visibility 0s;
}
  html[data-mesa-size="chico"] #mesaGrid .mesa-box{
  display:flex !important;
  flex-direction:column !important;
  align-items:center !important;
  justify-content:center !important;
  gap:3px !important;
  padding:10px 8px !important;
  text-align:center !important;
}
html[data-mesa-size="chico"] #mesaGrid .mb-status{
  position:static !important;
  margin:0 !important;
  font-size:9px !important;
  order:-1;
}
html[data-mesa-size="chico"] #mesaGrid .mb-name{
  font-size:13px !important;
  line-height:1.15 !important;
  margin:0 !important;
}
html[data-mesa-size="chico"] #mesaGrid .mb-total{
  font-size:11px !important;
  margin:0 !important;
}
html[data-mesa-size="chico"] #mesaGrid .mb-count,
html[data-mesa-size="chico"] #mesaGrid .mesa-reserva-hora,
html[data-mesa-size="chico"] #mesaGrid .mesa-reserva-timer,
html[data-mesa-size="chico"] #mesaGrid .mesa-alerta-badge{
  font-size:9.5px !important;
  margin:0 !important;
}
html[data-mesa-size="chico"] #mesaGrid .mesa-reservar-btn,
html[data-mesa-size="chico"] #mesaGrid .mesa-desagrupar-btn{
  margin-top:4px !important;
  padding:4px 0 !important;
  font-size:10px !important;
}
html[data-mesa-size="chico"] #mesaGrid .mb-check{
  top:6px !important;
  left:6px !important;
  width:18px !important;
  height:18px !important;
  font-size:10px !important;
}
`;
document.head.appendChild(fixStyle);

/* Fondo oscuro que aparece cuando se abre cualquiera de los 3 cuadros */
const popBackdrop = document.createElement("div");
popBackdrop.id = "popBackdrop";
document.body.appendChild(popBackdrop);

const popsEls = ["autorejPop", "autoresPop", "deliPop"]
  .map((id) => document.getElementById(id))
  .filter(Boolean);
const syncBackdrop = () =>
  popBackdrop.classList.toggle(
    "show",
    popsEls.some((p) => p.classList.contains("show")),
  );
popsEls.forEach((p) =>
  new MutationObserver(syncBackdrop).observe(p, {
    attributes: true,
    attributeFilter: ["class"],
  }),
);
popBackdrop.addEventListener("click", () =>
  popsEls.forEach((p) => p.classList.remove("show")),
);

const _on = (v) => {
  if (typeof v === "boolean") return v;
  if (v && typeof v === "object" && typeof v.toDate !== "function")
    return Object.values(v).some(_on);
  return false;
};
const _nodo = (o, k) => {
  if (!o || typeof o !== "object") return undefined;
  if (k in o) return o[k];
  for (const v of Object.values(o)) {
    const r = _nodo(v, k);
    if (r !== undefined) return r;
  }
  return undefined;
};
const _flag = (n, k) => (typeof n?.[k] === "boolean" ? n[k] : _on(n?.[k]));

let PLAN_SERV = null;
let ES_RESTAURANTE = false;
function aplicarPlanPedidos(servicios) {
  if (servicios) PLAN_SERV = servicios;
  aplicarVisibilidadPorTipoTienda();
  const pv = PLAN_SERV?.operacion_ventas?.pedidos_vivos;
  if (!pv) return;

  const carrito = _nodo(pv, "carrito") || {};
  const mesa = _nodo(pv, "mesa") || {};
  const nuevo = _nodo(pv, "nuevo_pedido") || {};
  const mis = carrito.mis_delivery || {};

  const car = _flag(carrito, "activo");
  const mes = _flag(mesa, "activo");
  const nue = _flag(nuevo, "activo");
  Object.assign(PLAN_PED, {
    carrito: car,
    mesa: mes,
    nuevoPedido: nue,
    tiempos: car && _flag(carrito, "tiempos"),
    estados: car && _flag(carrito, "estado_pedidos"),
    autoOff: car && _flag(carrito, "auto_off"),
    autoReserva: mes && _flag(carrito, "auto_reserva"),
    deliveryCfg: car && _flag(carrito, "delivery_config"),
    repartidores: car && _flag(mis, "activo"),
    maxRepartidores: Number(mis.maximo_delivery) || 0,
    mozos: mes && _flag(mesa, "mozos"),
    configMesas: mes && _flag(mesa, "config_mesas"),
    camara: nue && _flag(nuevo, "uso_camara_scaner"),
    celular: nue && _flag(nuevo, "uso_celular_scaner"),
  });

  const ocultar = (el, v) => el?.classList.toggle("plan-oculto", !v);
  const wrap = (id) => document.getElementById(id)?.closest(".autorej-wrap");

  ocultar(wrap("autorejBtn"), PLAN_PED.autoOff);
  ocultar(wrap("autoresBtn"), PLAN_PED.autoReserva);
  ocultar(wrap("deliBtn"), PLAN_PED.deliveryCfg);
  ocultar(wrap("deliverysBtn"), PLAN_PED.repartidores);
  ocultar(tmpBtn, PLAN_PED.tiempos);
  ocultar(document.getElementById("estBtn"), PLAN_PED.estados);
  ocultar(mzBtn, PLAN_PED.mozos);
  ocultar(mcBtn, PLAN_PED.configMesas);
  ocultar(document.getElementById("npScanCamBtn"), PLAN_PED.camara);
  ocultar(document.getElementById("npScanPhoneBtn"), PLAN_PED.celular);
  ocultar(
    document.querySelector('.origin-chip[data-origin="whatsapp"]'),
    PLAN_PED.carrito,
  );
  aplicarVisibilidadMesas();
  ocultar(
    document.querySelector('.origin-chip[data-origin="directo"]'),
    PLAN_PED.nuevoPedido,
  );

  DLV_MAX = PLAN_PED.maxRepartidores;
  dlvPintarContador();
  dlvPintarLista();

  const activo = document.querySelector(".origin-chip.active");
  if (activo?.classList.contains("plan-oculto")) {
    document.querySelector(".origin-chip:not(.plan-oculto)")?.click();
  }
}

const planStyle = document.createElement("style");
planStyle.textContent = `.plan-oculto{display:none !important;}`;
document.head.appendChild(planStyle);

window.addEventListener("message", (e) => {
  if (e.origin !== window.location.origin) return;
  if (e.data?.type === "SERVICIOS_UPDATE") aplicarPlanPedidos(e.data.servicios);
});
try {
  window.parent.postMessage(
    { type: "PEDIR_DATOS_TIENDA" },
    window.location.origin,
  );
} catch {}

/* ══════════════ Estado visual de mesa (preparación / entregado) ══════════════ */
function estItem(it, ped) {
  return (
    it.estadoItem ||
    (["en_preparacion", "entregado"].includes(ped?.estadoMesa)
      ? ped.estadoMesa
      : "aceptado")
  );
}
function derivarEstadoMesa(productos, fb) {
  const e = (productos || []).map((i) => i.estadoItem).filter(Boolean);
  if (!e.length) return fb || null;
  if (e.includes("aceptado")) return "aceptado";
  if (e.includes("en_preparacion")) return "en_preparacion";
  return "entregado";
}

// Revisa que estos nombres sean iguales a los de tu carpeta public/img
function archivoPago(clave) {
  return {
    efectivo: "efectivo_logo.webp",
    yape: "yape_logo.webp", // revisa este nombre
    plin: "logo_plin.webp",
    agora: "logo_agora.webp",
    visa_mastercard: "visa_logo.webp",
  }[clave];
}
// Precarga: los logos quedan listos antes de mostrar los botones
["efectivo", "yape", "plin", "agora", "visa_mastercard"].forEach((c) => {
  new Image().src = `../img/${archivoPago(c)}`;
});
function iconoPago(clave) {
  const archivo = archivoPago(clave);
  if (!archivo) return "";
  // El círculo ya tiene su tamaño: la imagen aparece dentro, suavemente
  return `<span class="np-pago-ico"><img src="../img/${archivo}" alt="" width="34" height="34" onload="this.classList.add('listo')" onerror="this.remove()"></span>`;
}
const METODOS_LABEL = {
  efectivo: ["💵", "Efectivo"],
  yape: ["📱", "Yape"],
  plin: ["📱", "Plin"],
  visa_mastercard: ["💳", "Visa / Mastercard"],
  agora: ["🏦", "Agora"],
};
function metodosPagoActivos() {
  const cfg = bizDataGlobal?.metodos_pago || {};
  return Object.entries(cfg)
    .filter(([, v]) => v?.enable === true)
    .map(([clave]) => {
      const [ico, label] = METODOS_LABEL[clave] || ["💳", clave];
      return { clave, ico, label };
    });
}
function estadoItemTag(it) {
  const m = {
    aceptado: ["🆕 Por preparar", "#fbbf24"],
    en_preparacion: ["🔥 En preparación", "#38bdf8"],
    entregado: ["🍽️ Entregado", "#4ade80"],
  }[it?.estadoItem];
  return m
    ? `<div class="dm-prod-cat" style="color:${m[1]};font-weight:800;">${m[0]}</div>`
    : "";
}
function estadoMesaVis(estadoVisual, activos) {
  if (estadoVisual !== "ocupada") return { cls: "", badge: "" };
  const ped = activos?.[0]?.[1];
  const est = (ped?.productos || []).map((it) => estItem(it, ped));
  if (est.includes("aceptado") && est.some((e) => e !== "aceptado"))
    return {
      cls: " em-nuevo",
      badge: `<span class="mesa-alerta-badge em-b-nuevo">🆕 Ronda nueva por atender</span>`,
    };
  const e = ped?.estadoMesa;
  if (e === "en_preparacion")
    return {
      cls: " em-prep",
      badge: `<span class="mesa-alerta-badge em-b-prep">🔥 En preparación</span>`,
    };
  if (e === "entregado")
    return {
      cls: " em-entregado",
      badge: `<span class="mesa-alerta-badge em-b-ent">🍽️ Entregado</span>`,
    };
  return { cls: "", badge: "" };
}

const mtStyle = document.createElement("style");
mtStyle.textContent = `
.mesa-box.em-prep:not(.al-cuenta):not(.al-ayuda):not(.al-listo){border-color:#38bdf8 !important;background:rgba(56,189,248,.14) !important;}
.mesa-box.em-entregado:not(.al-cuenta):not(.al-ayuda):not(.al-listo){border-color:#22c55e !important;background:rgba(34,197,94,.14) !important;}
.mesa-alerta-badge.em-b-prep{color:#38bdf8;}
.mesa-alerta-badge.em-b-ent{color:#4ade80;}
.mt-row{cursor:pointer;}
.mt-row.mt-on{border-color:#7c5cff;background:rgba(124,92,255,.16);}
.mt-check{font-weight:800;color:#a78bfa;font-size:16px;}
.mesa-box.em-nuevo:not(.al-cuenta):not(.al-ayuda):not(.al-listo){border-color:#f59e0b !important;background:rgba(245,158,11,.18) !important;}
.mesa-alerta-badge.em-b-nuevo{color:#fbbf24;}
`;
document.head.appendChild(mtStyle);

/* ══════════════ Utilidades ══════════════ */
// Firestore no acepta undefined; esto los quita sin dañar Timestamps/FieldValues
function sinUndef(v) {
  if (Array.isArray(v)) return v.map(sinUndef);
  if (
    v &&
    typeof v === "object" &&
    Object.getPrototypeOf(v) === Object.prototype
  ) {
    const o = {};
    Object.keys(v).forEach((k) => {
      if (v[k] !== undefined) o[k] = sinUndef(v[k]);
    });
    return o;
  }
  return v;
}
const _mRef = (id) => tiendaSubDoc(localidad, "tiendas", tiendaId, "mesas", id);
const _pRef = (id) =>
  tiendaSubDoc(localidad, "tiendas", tiendaId, "pedidos", id);
const _gRef = (id) =>
  tiendaSubDoc(localidad, "tiendas", tiendaId, "grupos_mesas", id);
const _pedidoRaw = (m) =>
  ["ocupado", "pedido_pendiente"].includes(m?.estado) && m.pedido
    ? m.pedido
    : null;
const _sumaSub = (items) =>
  +(items || []).reduce((s, i) => s + Number(i.subtotal || 0), 0).toFixed(2);
const _sumaCant = (items) =>
  (items || []).reduce((s, i) => s + Number(i.cantidad || 0), 0);

/* ══════════════ TRASPASO: mover una mesa (con su pedido) a otra libre ══════════════ */
async function traspasarMesa(origenId, destinoId) {
  const o = mesasMap.get(origenId);
  const d = mesasMap.get(destinoId);
  if (!o || !d) return false;
  if (d.grupoId || !["libre", "reservada"].includes(d.estado)) {
    showToast("La mesa destino ya no está libre", true);
    return false;
  }
  const nomO = o.nombre_alias || `Mesa ${o.numero_mesa}`;
  const nomD = d.nombre_alias || `Mesa ${d.numero_mesa}`;
  const batch = writeBatch(db);
  const vaciar = {
    estado: "libre",
    pago: "pendiente",
    pedido: null,
    pedidoMesaDocId: null,
    mozoAsignado: null,
    personas: null,
    grupoId: null,
    grupo_color: null,
    reservado_en: null,
    hora_reservada: null,
  };

  if (o.grupoId) {
    // La mesa es parte de un grupo: se cambia por la nueva dentro del grupo
    const g = gruposMap.get(o.grupoId);
    if (!g) return false;
    const mesas = (g.mesas || []).map((m) =>
      m.id === origenId
        ? { id: destinoId, nombre: nomD, numero: d.numero_mesa }
        : m,
    );
    const retag = (arr) =>
      (arr || []).map((it) =>
        it.mesaOrigenId === origenId ? { ...it, mesaOrigenId: destinoId } : it,
      );
    const retagB = (arr) =>
      (arr || []).map((b) => ({
        ...b,
        items: retag(b.items),
        ...(b.mesaOrigenId === origenId
          ? { mesaOrigenId: destinoId, mesaOrigenNombre: nomD }
          : {}),
      }));
    const patch = {
      mesas,
      origenes: (g.origenes || []).map((x) =>
        x.mesaId === origenId
          ? {
              ...x,
              mesaId: destinoId,
              numero: d.numero_mesa,
              nombre: nomD,
              pedido: x.pedido
                ? {
                    ...x.pedido,
                    mesa: {
                      id: destinoId,
                      nombre: d.nombre_alias || null,
                      numero: d.numero_mesa,
                    },
                  }
                : x.pedido,
            }
          : x,
      ),
    };
    if (g.pedido) {
      patch.pedido = {
        ...g.pedido,
        mesas,
        productos: retag(g.pedido.productos),
        ...(g.pedido.bloques ? { bloques: retagB(g.pedido.bloques) } : {}),
      };
    }
    batch.set(_gRef(o.grupoId), sinUndef(patch), { merge: true });
    batch.set(_mRef(origenId), vaciar, { merge: true });
    batch.set(
      _mRef(destinoId),
      sinUndef({
        estado: "ocupado",
        grupoId: o.grupoId,
        grupo_color: o.grupo_color || colorParaEstadoGrupo("ocupado"),
        pedidoMesaDocId: g.pedidoGrupoDocId || o.pedidoMesaDocId || null,
        pago: "pendiente",
        pedido: null,
        mozoAsignado: o.mozoAsignado || null,
        personas: o.personas ?? null,
        reservado_en: null,
        hora_reservada: null,
      }),
      { merge: true },
    );
    if (g.pedidoGrupoDocId && patch.pedido) {
      batch.set(
        _pRef(g.pedidoGrupoDocId),
        sinUndef({
          mesas,
          productos: patch.pedido.productos,
          ...(patch.pedido.bloques ? { bloques: patch.pedido.bloques } : {}),
        }),
        { merge: true },
      );
    }
  } else {
    // Mesa individual: el pedido completo se muda a la mesa destino
    const mesaRef = {
      id: destinoId,
      nombre: d.nombre_alias || null,
      numero: d.numero_mesa,
    };
    const ped = o.pedido ? { ...o.pedido, mesa: mesaRef } : null;
    batch.set(_mRef(origenId), vaciar, { merge: true });
    batch.set(
      _mRef(destinoId),
      sinUndef({
        estado: o.estado === "libre" ? "ocupado" : o.estado,
        pago: "pendiente",
        pedido: ped,
        pedidoMesaDocId: o.pedidoMesaDocId || null,
        mozoAsignado: o.mozoAsignado || null,
        personas: o.personas ?? null,
        reservado_en: null,
        hora_reservada: null,
        grupoId: null,
        grupo_color: null,
      }),
      { merge: true },
    );
    if (o.pedidoMesaDocId)
      batch.set(
        _pRef(o.pedidoMesaDocId),
        { mesa: mesaRef, mesaId: destinoId },
        { merge: true },
      );
  }
  await batch.commit();
  showToast(`🔀 ${nomO} → ${nomD}`);
  return true;
}

/* ══════════════ UNIR mesas (con o sin pedidos) ══════════════ */
async function unirMesasConPedidos(ids) {
  const entradas = [...new Set(ids)]
    .map((id) => [id, mesasMap.get(id)])
    .filter(([, m]) => m);
  if (entradas.length < 2) {
    showToast("Selecciona al menos 2 mesas", true);
    return false;
  }
  if (entradas.some(([, m]) => m.estado === "reserva_pendiente")) {
    showToast("Hay una solicitud de reserva pendiente en la selección", true);
    return false;
  }
  const gids = [...new Set(entradas.map(([, m]) => m.grupoId).filter(Boolean))];
  if (gids.length > 1) {
    showToast("Hay más de un grupo: sepáralos primero", true);
    return false;
  }
  const base = gids[0] ? gruposMap.get(gids[0]) : null;
  const gruposRef = tiendaSubCol(
    localidad,
    "tiendas",
    tiendaId,
    "grupos_mesas",
  );
  const grupoId = gids[0] || doc(gruposRef).id;

  const lista = base ? [...(base.mesas || [])] : [];
  entradas.forEach(([id, m]) => {
    if (!lista.some((x) => x.id === id))
      lista.push({
        id,
        nombre: m.nombre_alias || `Mesa ${m.numero_mesa}`,
        numero: m.numero_mesa,
      });
  });
  const nombreDe = (id) => lista.find((x) => x.id === id)?.nombre || "";
  const tag = (arr, id) =>
    (arr || []).map((it) =>
      it.mesaOrigenId ? it : { ...it, mesaOrigenId: id },
    );
  const tagBloques = (arr, idDef) =>
    (arr || []).map((b) => {
      const bid =
        b.mesaOrigenId ||
        lista.find((x) => x.nombre === b.mesaOrigenNombre)?.id ||
        idDef;
      return {
        ...b,
        mesaOrigenId: bid,
        mesaOrigenNombre: b.mesaOrigenNombre || nombreDe(bid),
        items: tag(b.items, bid),
      };
    });

  // Pedidos que se van a juntar
  let origenes = base?.origenes ? [...base.origenes] : [];
  const partes = []; // { id, pedido }
  if (base?.pedido) {
    const idBase = origenes[0]?.mesaId || lista[0].id;
    if (!origenes.length)
      origenes.push({
        mesaId: idBase,
        numero: lista.find((x) => x.id === idBase)?.numero ?? null,
        nombre: nombreDe(idBase),
        pedidoDocId: base.pedidoGrupoDocId || null,
        estado: "ocupado",
        pedido: base.pedido,
      });
    partes.push({ id: idBase, pedido: base.pedido });
  }
  entradas.forEach(([id, m]) => {
    if (m.grupoId) return; // ya está dentro del grupo base
    const ped = _pedidoRaw(m);
    if (!ped) return;
    origenes.push({
      mesaId: id,
      numero: m.numero_mesa,
      nombre: nombreDe(id),
      pedidoDocId: m.pedidoMesaDocId || null,
      estado: m.estado,
      pedido: ped,
    });
    partes.push({ id, pedido: ped });
  });

  let pedido = null;
  let pedidoGrupoDocId = base?.pedidoGrupoDocId || null;
  if (partes.length) {
    pedidoGrupoDocId = pedidoGrupoDocId || origenes[0]?.pedidoDocId || null;
    const productos = partes.flatMap((p) =>
      tag(p.pedido.productos, p.id).map((it) => ({
        ...it,
        estadoItem: estItem(it, p.pedido),
      })),
    );
    const bloques = partes.flatMap((p) =>
      p.pedido.bloques?.length && !p.pedido.editadoPorMozo
        ? tagBloques(p.pedido.bloques, p.id)
        : [
            {
              hora: p.pedido.hora || "—",
              mesaOrigenId: p.id,
              mesaOrigenNombre: nombreDe(p.id),
              items: tag(p.pedido.productos, p.id),
            },
          ],
    );
    const estMesas = [
      ...new Set(partes.map((p) => p.pedido.estadoMesa || null)),
    ];
    const { mesa: _quitar, ...resto } = partes[0].pedido;
    pedido = sinUndef({
      ...resto,
      mesas: lista,
      grupoId,
      productos,
      bloques,
      editadoPorMozo: false,
      pendienteMozo: partes.flatMap((p) => p.pedido.pendienteMozo || []),
      total: _sumaSub(productos),
      total_items: _sumaCant(productos),
      estadoMozo: partes.every((p) => p.pedido.estadoMozo === "confirmado")
        ? "confirmado"
        : "pendiente_revision",
      estadoMesa: derivarEstadoMesa(productos, "aceptado"),
    });
  }

  const batch = writeBatch(db);
  const g = { estado: "activo", mesas: lista };
  if (!base) g.creado_en = serverTimestamp();
  if (pedido) {
    g.pedido = pedido;
    g.pedidoGrupoDocId = pedidoGrupoDocId;
    g.origenes = sinUndef(origenes);
  } else if (!base) {
    g.pedido = null;
    g.pedidoGrupoDocId = null;
  }
  batch.set(_gRef(grupoId), g, { merge: true });

  lista.forEach((m) => {
    const patch = {
      estado: "ocupado",
      grupoId,
      grupo_color: colorParaEstadoGrupo("ocupado"),
      reservado_en: null,
      hora_reservada: null,
    };
    if (pedido) {
      patch.pedido = null;
      patch.pedidoMesaDocId = pedidoGrupoDocId;
      patch.pago = "pendiente";
    }
    batch.set(_mRef(m.id), patch, { merge: true });
  });

  if (pedido) {
    // Los pedidos secundarios quedan "fusionados" (no se cobran dos veces)
    origenes.forEach((o) => {
      if (o.pedidoDocId && o.pedidoDocId !== pedidoGrupoDocId)
        batch.set(
          _pRef(o.pedidoDocId),
          {
            estado: "rechazado",
            fusionado_en: pedidoGrupoDocId,
            actualizado: serverTimestamp(),
          },
          { merge: true },
        );
    });
    if (pedidoGrupoDocId)
      batch.set(
        _pRef(pedidoGrupoDocId),
        sinUndef({ ...pedido, mesa: null, mesaId: null }),
        { merge: true },
      );
  }
  await batch.commit();
  showToast(pedido ? "🔗 Mesas y pedidos unidos" : "🔗 Mesas unidas");
  return true;
}

/* ══════════════ SEPARAR: cada mesa recupera su pedido ══════════════ */
async function separarGrupoConPedidos(grupoId) {
  const g = gruposMap.get(grupoId);
  if (!g) return;
  if (!g.pedido) return desagruparGrupo(grupoId);
  if (
    !window.confirm(
      "¿Separar las mesas? Cada mesa recuperará su propio pedido.",
    )
  )
    return;

  const lista = g.mesas || [];
  if (!lista.length) return;
  let origenes = (g.origenes || []).filter((o) =>
    lista.some((m) => m.id === o.mesaId),
  );
  if (!origenes.length)
    origenes = [
      {
        mesaId: lista[0].id,
        numero: lista[0].numero,
        nombre: lista[0].nombre,
        pedidoDocId: g.pedidoGrupoDocId || null,
        estado: "ocupado",
        pedido: g.pedido,
      },
    ];
  const primero = origenes[0].mesaId;
  const p = g.pedido;
  const esOrigen = (id) => origenes.some((o) => o.mesaId === id);
  const duenoDe = (id) => (esOrigen(id) ? id : primero);

  const vaciar = {
    estado: "libre",
    grupoId: null,
    grupo_color: null,
    pedido: null,
    pedidoMesaDocId: null,
    pago: "pendiente",
  };
  const batch = writeBatch(db);
  const pendientes = new Set(lista.map((m) => m.id));

  origenes.forEach((o) => {
    pendientes.delete(o.mesaId);
    const prods = (p.productos || [])
      .filter((it) => duenoDe(it.mesaOrigenId) === o.mesaId)
      .map(({ mesaOrigenId, ...r }) => r);
    const blq = (p.bloques || [])
      .filter((b) => duenoDe(b.mesaOrigenId) === o.mesaId)
      .map(({ mesaOrigenId, mesaOrigenNombre, ...r }) => ({
        ...r,
        items: (r.items || []).map(({ mesaOrigenId: _t, ...i }) => i),
      }));

    if (!prods.length) {
      // Esa mesa se quedó sin productos: queda libre
      batch.set(_mRef(o.mesaId), vaciar, { merge: true });
      if (o.pedidoDocId)
        batch.set(
          _pRef(o.pedidoDocId),
          { estado: "rechazado", fusionado_en: null },
          { merge: true },
        );
      return;
    }
    const info = lista.find((m) => m.id === o.mesaId);
    const { mesas: _a, grupoId: _b, ...baseP } = o.pedido || p;
    const ped = sinUndef({
      ...baseP,
      productos: prods,
      bloques: blq,
      total: _sumaSub(prods),
      total_items: _sumaCant(prods),
      estadoMesa: derivarEstadoMesa(prods, p.estadoMesa || null),
      estadoMozo: p.estadoMozo || baseP.estadoMozo || null,
      pendienteMozo: o.mesaId === primero ? p.pendienteMozo || [] : [],
      editadoPorMozo: !!p.editadoPorMozo,
      mesa: {
        id: o.mesaId,
        nombre: info?.nombre || null,
        numero: info?.numero ?? o.numero ?? null,
      },
    });
    batch.set(
      _mRef(o.mesaId),
      {
        estado: "ocupado",
        grupoId: null,
        grupo_color: null,
        pedido: ped,
        pedidoMesaDocId: o.pedidoDocId || null,
        pago: "pendiente",
      },
      { merge: true },
    );
    if (o.pedidoDocId)
      batch.set(
        _pRef(o.pedidoDocId),
        sinUndef({
          ...ped,
          estado: "pendiente",
          mesaId: o.mesaId,
          mesas: null,
          grupoId: null,
          fusionado_en: null,
        }),
        { merge: true },
      );
  });

  // Mesas que se habían unido sin pedido propio: quedan libres
  pendientes.forEach((id) => batch.set(_mRef(id), vaciar, { merge: true }));

  batch.set(
    _gRef(grupoId),
    { estado: "cerrado", pedido: null, origenes: null, pedidoGrupoDocId: null },
    { merge: true },
  );
  await batch.commit();
  showToast("⇱ Mesas separadas, cada una recuperó su pedido");
}

/* ══════════════ Selector de mesas (trasladar / unir) ══════════════ */
const mtOv = document.createElement("div");
mtOv.className = "dlv-ov";
mtOv.innerHTML = `
  <div class="dlv-box">
    <div class="dlv-head"><span id="mtTitulo"></span><button type="button" data-x>✕</button></div>
    <p class="dlv-cfg-sub" id="mtSub"></p>
    <div id="mtList"></div>
    <button type="button" class="np-confirmar-btn" id="mtOk" style="margin-top:14px;" disabled></button>
  </div>`;
document.body.appendChild(mtOv);
mtOv.addEventListener("click", (e) => {
  if (e.target === mtOv || e.target.hasAttribute("data-x"))
    mtOv.classList.remove("show");
});

let mtModo = null;
let mtOrigen = null;
const mtSel = new Set();

function mtPintarSel() {
  mtOv.querySelectorAll(".mt-row").forEach((r) => {
    const on = mtSel.has(r.dataset.mt);
    r.classList.toggle("mt-on", on);
    r.querySelector(".mt-check").textContent = on ? "●" : "○";
  });
  const ok = document.getElementById("mtOk");
  ok.disabled = !mtSel.size;
  ok.textContent =
    mtModo === "traspasar"
      ? "Trasladar aquí"
      : `Unir ${mtSel.size ? mtSel.size + 1 : ""} mesas`.replace("  ", " ");
}

function abrirTrasladoMesas(modo, origenId) {
  const o = mesasMap.get(origenId);
  if (!o) return;
  mtModo = modo;
  mtOrigen = origenId;
  mtSel.clear();
  document.getElementById("mtTitulo").textContent =
    modo === "traspasar"
      ? "🔀 Trasladar a otra mesa"
      : "🔗 Unir con otras mesas";
  document.getElementById("mtSub").textContent =
    modo === "traspasar"
      ? "Elige una mesa libre. El pedido se mueve completo a esa mesa."
      : "Elige las mesas a juntar. Los pedidos se unen en una sola cuenta y al separar vuelven a su mesa.";

  const permitidos =
    modo === "traspasar"
      ? ["libre", "reservada"]
      : ["libre", "reservada", "ocupado", "pedido_pendiente"];
  const cand = [...mesasMap.entries()]
    .sort((a, b) => (a[1].numero_mesa || 0) - (b[1].numero_mesa || 0))
    .slice(0, maxMesasPlan() ?? undefined)
    .filter(
      ([id, m]) =>
        id !== origenId &&
        !m.grupoId &&
        permitidos.includes(m.estado) &&
        !(modo === "traspasar" && m.pedido),
    );

  document.getElementById("mtList").innerHTML =
    cand
      .map(([id, m]) => {
        const ped = _pedidoRaw(m);
        const txt = ped
          ? `Ocupada · ${fmtMoney(ped.total)}`
          : m.estado === "reservada"
            ? "Reservada"
            : m.estado === "ocupado"
              ? "Ocupada (sin pedido)"
              : "Libre";
        return `<div class="dlv-item pick mt-row" data-mt="${id}">
          <div class="dlv-info"><b>${escapeHtml(m.nombre_alias || "Mesa " + m.numero_mesa)}</b><small>${txt}</small></div>
          <span class="mt-check">○</span></div>`;
      })
      .join("") ||
    `<div class="dlv-empty">No hay mesas disponibles para esta acción.</div>`;

  mtPintarSel();
  mtOv.classList.add("show");
}

document.getElementById("mtList").addEventListener("click", (e) => {
  const row = e.target.closest("[data-mt]");
  if (!row) return;
  const id = row.dataset.mt;
  if (mtModo === "traspasar") {
    mtSel.clear();
    mtSel.add(id);
  } else if (mtSel.has(id)) mtSel.delete(id);
  else mtSel.add(id);
  mtPintarSel();
});

document.getElementById("mtOk").addEventListener("click", async () => {
  if (!mtSel.size) return;
  const btn = document.getElementById("mtOk");
  btn.disabled = true;
  try {
    const ok =
      mtModo === "traspasar"
        ? await traspasarMesa(mtOrigen, [...mtSel][0])
        : await unirMesasConPedidos([mtOrigen, ...mtSel]);
    if (ok) {
      mtOv.classList.remove("show");
      closeDetail();
    }
  } catch (err) {
    console.error(err);
    showToast("❌ No se pudo completar la acción", true);
  } finally {
    btn.disabled = !mtSel.size;
  }
});

/* ══════════════ PUNTO DE ENTREGA ══════════════ */
function puntoEntregaDetalleHTML(p) {
  const pe = p.punto_entrega;
  if (p.cliente?.tipo_entrega !== "Recojo en punto" || !pe) return "";
  const url = `https://www.google.com/maps?q=${pe.lat},${pe.lng}&z=17&output=embed`;
  return `
    <div class="dm-meta-item full">
      <div class="dm-meta-label">📍 Recojo en punto destinado</div>
      <div class="dm-meta-value">${escapeHtml(pe.nombre || "")}${pe.referencia ? " · " + escapeHtml(pe.referencia) : ""}</div>
      <div class="mapa-delivery-mini" data-maps-url="${escapeHtml(url)}">
        <iframe src="${url}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
        <div class="mapa-delivery-click-layer">🔍 Toca para ver el mapa completo</div>
      </div>
    </div>`;
}

const peStyle = document.createElement("style");
peStyle.textContent = `
#peMap{height:280px;border-radius:14px;margin:10px 0;border:1px solid var(--line);isolation:isolate;}
.pe-search{display:flex;gap:8px;}
.pe-search input,.pe-field{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg,#0a0a0f);color:#fff;font-size:16px;}
.pe-coords{font-size:11.5px;color:var(--ink-dim);margin-bottom:10px;}
`;
document.head.appendChild(peStyle);

function peCargarLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((res, rej) => {
    if (!document.getElementById("peLeafletCss")) {
      const l = document.createElement("link");
      l.id = "peLeafletCss";
      l.rel = "stylesheet";
      l.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(l);
    }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = () => res(window.L);
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

const peOv = document.createElement("div");
peOv.className = "dlv-ov";
peOv.innerHTML = `
  <div class="dlv-box">
    <div class="dlv-head"><span>📍 Dirección de entrega</span><button type="button" data-x>✕</button></div>
    <p class="dlv-cfg-sub">Marca en el mapa el lugar donde entregas los pedidos (recojo en punto destinado).</p>
    <input type="text" id="peNombre" class="pe-field" maxlength="60" placeholder="Nombre (ej: Plaza de Armas)" style="margin-bottom:8px;">
    <input type="text" id="peReferencia" class="pe-field" maxlength="100" placeholder="Referencia (opcional)" style="margin-bottom:10px;">
    <div class="pe-search">
      <input type="text" id="peBuscar" placeholder="Buscar dirección o lugar…">
      <button type="button" class="oc-btn ghost" id="peBuscarBtn">🔍</button>
      <button type="button" class="oc-btn ghost" id="peGpsBtn" title="Mi ubicación">🎯</button>
    </div>
    <div id="peMap"></div>
    <div class="pe-coords" id="peCoords">Toca el mapa o arrastra el pin para marcar el punto.</div>
    <button type="button" class="np-confirmar-btn" id="peGuardar">Guardar punto de entrega</button>
  </div>`;
document.body.appendChild(peOv);
peOv.addEventListener("click", (e) => {
  if (e.target === peOv || e.target.hasAttribute("data-x"))
    peOv.classList.remove("show");
});

let peMap = null,
  peMarker = null,
  pePos = null;

function pePintarCoords() {
  document.getElementById("peCoords").textContent = pePos
    ? `📍 ${pePos.lat.toFixed(5)}, ${pePos.lng.toFixed(5)}`
    : "Toca el mapa o arrastra el pin para marcar el punto.";
}
function peColocarPin(lat, lng, centrar = true) {
  pePos = { lat, lng };
  if (!peMarker) {
    peMarker = L.marker([lat, lng], { draggable: true }).addTo(peMap);
    peMarker.on("dragend", () => {
      const p = peMarker.getLatLng();
      pePos = { lat: p.lat, lng: p.lng };
      pePintarCoords();
    });
  } else peMarker.setLatLng([lat, lng]);
  if (centrar) peMap.setView([lat, lng], Math.max(peMap.getZoom(), 17));
  pePintarCoords();
}

async function peAbrir() {
  const saved = bizDataGlobal?.punto_entrega || {};
  document.getElementById("peNombre").value = saved.nombre || "";
  document.getElementById("peReferencia").value = saved.referencia || "";
  document.getElementById("peBuscar").value = "";
  pePos = null;
  document.getElementById("cfgPanel")?.classList.remove("show");
  peOv.classList.add("show");
  try {
    await peCargarLeaflet();
  } catch {
    return showToast("❌ No se pudo cargar el mapa", true);
  }
  const tieneSaved =
    saved.lat != null &&
    saved.lng != null &&
    Number.isFinite(Number(saved.lat));
  const centro = tieneSaved
    ? [Number(saved.lat), Number(saved.lng)]
    : bizLat != null
      ? [bizLat, bizLng]
      : [-12.0464, -77.0428];
  if (!peMap) {
    peMap = L.map("peMap").setView(centro, 16);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(peMap);
    peMap.on("click", (e) => peColocarPin(e.latlng.lat, e.latlng.lng, false));
  } else peMap.setView(centro, 16);
  if (peMarker) {
    peMarker.remove();
    peMarker = null;
  }
  if (tieneSaved) peColocarPin(centro[0], centro[1]);
  else pePintarCoords();
  setTimeout(() => peMap.invalidateSize(), 250);
}

document.getElementById("peBuscarBtn").addEventListener("click", async () => {
  const q = document.getElementById("peBuscar").value.trim();
  if (!q || !peMap) return;
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pe&q=${encodeURIComponent(q)}`,
    );
    const j = await r.json();
    if (!j.length) return showToast("No se encontró ese lugar", true);
    peColocarPin(Number(j[0].lat), Number(j[0].lon));
  } catch {
    showToast("❌ No se pudo buscar", true);
  }
});
document.getElementById("peBuscar").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("peBuscarBtn").click();
});
document.getElementById("peGpsBtn").addEventListener("click", () => {
  if (!navigator.geolocation || !peMap)
    return showToast("Sin geolocalización", true);
  navigator.geolocation.getCurrentPosition(
    (pos) => peColocarPin(pos.coords.latitude, pos.coords.longitude),
    () => showToast("No se pudo obtener tu ubicación", true),
    { enableHighAccuracy: true, timeout: 10000 },
  );
});

document.getElementById("peGuardar").addEventListener("click", async () => {
  const nombre = document.getElementById("peNombre").value.trim();
  const referencia = document.getElementById("peReferencia").value.trim();
  if (!nombre) return showToast("Falta el nombre del punto", true);
  if (!pePos) return showToast("Marca el pin en el mapa", true);
  const data = {
    activo: true,
    nombre,
    referencia,
    lat: pePos.lat,
    lng: pePos.lng,
  };
  try {
    await updateDoc(tiendaDoc(localidad, "tiendas", tiendaId), {
      punto_entrega: data,
    });
    bizDataGlobal = { ...(bizDataGlobal || {}), punto_entrega: data };
    peOv.classList.remove("show");
    peSync();
    showToast("📍 Punto de entrega guardado");
  } catch (e) {
    console.error(e);
    showToast("❌ No se pudo guardar", true);
  }
});

function peSync() {
  const pe = bizDataGlobal?.punto_entrega;
  const t = document.getElementById("peToggle");
  if (t) t.checked = pe?.activo === true;
  const ed = document.getElementById("peEdit");
  if (ed) ed.style.display = pe && pe.lat != null ? "block" : "none";
}

(function () {
  const panel = document.getElementById("cfgPanel");
  if (!panel) return;
  const row = document.createElement("div");
  row.className = "autorej-wrap";
  row.style.gridColumn = "1 / -1";
  row.innerHTML = `
    <div class="dlv-cfg-row">
      <span class="l">📍 Dirección de entrega (recojo en punto)</span>
      <label class="switch"><input type="checkbox" id="peToggle"><span class="switch-track"></span></label>
    </div>
    <button type="button" class="oc-btn ghost" id="peEdit" style="margin-top:6px;display:none;">✎ Editar punto en el mapa</button>`;
  panel.appendChild(row);

  document.getElementById("peEdit").addEventListener("click", peAbrir);
  document.getElementById("peToggle").addEventListener("change", async (e) => {
    const on = e.target.checked;
    const pe = bizDataGlobal?.punto_entrega;
    const tieneCoords = pe && pe.lat != null && Number.isFinite(Number(pe.lat));
    if (on && !tieneCoords) {
      e.target.checked = false;
      return peAbrir();
    }
    try {
      await updateDoc(tiendaDoc(localidad, "tiendas", tiendaId), {
        "punto_entrega.activo": on,
      });
      bizDataGlobal = {
        ...(bizDataGlobal || {}),
        punto_entrega: { ...(pe || {}), activo: on },
      };
      showToast(
        on ? "📍 Punto de entrega activado" : "📍 Punto de entrega desactivado",
      );
    } catch (err) {
      console.error(err);
      e.target.checked = !on;
      showToast("❌ No se pudo guardar", true);
    }
    peSync();
  });
  document.getElementById("cfgBtn")?.addEventListener("click", peSync);
})();

/* ══════════════ DELIVERY GRATIS POR MONTO ══════════════ */
function peSyncGratis() {
  const t = document.getElementById("dgToggle");
  const m = document.getElementById("dgMonto");
  const box = document.getElementById("dgBox");
  if (!t) return;
  t.checked = deliGratis.activo;
  if (m && document.activeElement !== m) m.value = deliGratis.monto;
  if (box) box.style.display = deliGratis.activo ? "flex" : "none";
}

(function () {
  const panel = document.getElementById("cfgPanel");
  if (!panel) return;
  const row = document.createElement("div");
  row.className = "autorej-wrap";
  row.style.gridColumn = "1 / -1";
  row.innerHTML = `
    <div class="dlv-cfg-row">
      <span class="l">🚚 Delivery gratis por compra mínima</span>
      <label class="switch"><input type="checkbox" id="dgToggle"><span class="switch-track"></span></label>
    </div>
    <div id="dgBox" style="display:none;gap:8px;align-items:center;margin-top:6px;">
      <span style="font-size:12.5px;color:var(--ink-dim);white-space:nowrap;">Gratis desde S/</span>
      <input type="number" id="dgMonto" class="deli-inp" min="1" step="1" style="flex:1;min-width:0;">
      <button type="button" class="oc-btn ghost" id="dgGuardar">Guardar</button>
    </div>`;
  const peRow = document.getElementById("peToggle")?.closest(".autorej-wrap");
  peRow ? peRow.before(row) : panel.appendChild(row);

  async function guardar(nuevo) {
    try {
      await updateDoc(tiendaDoc(localidad, "tiendas", tiendaId), {
        "delivery.gratis_desde": nuevo,
      });
      deliGratis = nuevo;
      bizDataGlobal = {
        ...(bizDataGlobal || {}),
        delivery: { ...(bizDataGlobal?.delivery || {}), gratis_desde: nuevo },
      };
      return true;
    } catch (e) {
      console.error(e);
      showToast("❌ No se pudo guardar", true);
      return false;
    }
  }

  document.getElementById("dgToggle").addEventListener("change", async (e) => {
    const on = e.target.checked;
    const ok = await guardar({ ...deliGratis, activo: on });
    if (!ok) e.target.checked = !on;
    else
      showToast(
        on
          ? `🚚 Delivery gratis desde ${fmtMoney(deliGratis.monto)}`
          : "🚚 Delivery gratis desactivado",
      );
    peSyncGratis();
  });

  document.getElementById("dgGuardar").addEventListener("click", async () => {
    const monto = Math.max(
      1,
      Number(document.getElementById("dgMonto").value) || 0,
    );
    if (await guardar({ ...deliGratis, monto })) {
      showToast(`🚚 Gratis desde ${fmtMoney(monto)}`);
      peSyncGratis();
    }
  });
  peSyncGratis();
})();
/* ══════════════ DIRECCIÓN DEL NEGOCIO (solo para la ruta del delivery) ══════════════
   Se guarda en tienda.ubicacion_ruta, NO toca tienda.ubicacion */
const rnStyle = document.createElement("style");
rnStyle.textContent = `#rnMap{height:280px;border-radius:14px;margin:10px 0;border:1px solid var(--line);isolation:isolate;}`;
document.head.appendChild(rnStyle);

const rnOv = document.createElement("div");
rnOv.className = "dlv-ov";
rnOv.innerHTML = `
  <div class="dlv-box">
    <div class="dlv-head"><span>🏠 Dirección del negocio</span><button type="button" data-x>✕</button></div>
    <p class="dlv-cfg-sub">Es el punto de partida de la ruta hacia el cliente en los pedidos delivery. Si estás en el negocio, toca 🎯. Desde PC el GPS puede fallar por metros: ajusta el pin arrastrándolo.</p>
    <div class="pe-search">
      <input type="text" id="rnBuscar" placeholder="Buscar dirección o lugar…">
      <button type="button" class="oc-btn ghost" id="rnBuscarBtn">🔍</button>
      <button type="button" class="oc-btn ghost" id="rnGpsBtn" title="Usar mi ubicación actual">🎯</button>
    </div>
    <div id="rnMap"></div>
    <div class="pe-coords" id="rnCoords">Toca el mapa o arrastra el pin.</div>
    <button type="button" class="np-confirmar-btn" id="rnGuardar">Guardar dirección del negocio</button>
    <button type="button" class="oc-btn ghost danger" id="rnQuitar" style="width:100%;margin-top:8px;display:none;">Quitar ubicación guardada</button>
  </div>`;
document.body.appendChild(rnOv);
rnOv.addEventListener("click", (e) => {
  if (e.target === rnOv || e.target.hasAttribute("data-x"))
    rnOv.classList.remove("show");
});

let rnMap = null,
  rnMarker = null,
  rnPos = null;

function rnPintarCoords() {
  document.getElementById("rnCoords").textContent = rnPos
    ? `📍 ${rnPos.lat.toFixed(6)}, ${rnPos.lng.toFixed(6)}`
    : "Toca el mapa o arrastra el pin.";
}
function rnColocarPin(lat, lng, centrar = true) {
  rnPos = { lat, lng };
  if (!rnMarker) {
    rnMarker = L.marker([lat, lng], { draggable: true }).addTo(rnMap);
    rnMarker.on("dragend", () => {
      const p = rnMarker.getLatLng();
      rnPos = { lat: p.lat, lng: p.lng };
      rnPintarCoords();
    });
  } else rnMarker.setLatLng([lat, lng]);
  if (centrar) rnMap.setView([lat, lng], Math.max(rnMap.getZoom(), 17));
  rnPintarCoords();
}

async function rnAbrir() {
  const saved = bizDataGlobal?.ubicacion_ruta;
  const tieneSaved =
    saved &&
    Number.isFinite(Number(saved.lat)) &&
    Number.isFinite(Number(saved.lng));
  rnPos = null;
  document.getElementById("rnBuscar").value = "";
  document.getElementById("rnQuitar").style.display = tieneSaved
    ? "block"
    : "none";
  document.getElementById("cfgPanel")?.classList.remove("show");
  rnOv.classList.add("show");
  try {
    await peCargarLeaflet();
  } catch {
    return showToast("❌ No se pudo cargar el mapa", true);
  }
  const centro = tieneSaved
    ? [Number(saved.lat), Number(saved.lng)]
    : bizLat != null
      ? [bizLat, bizLng]
      : [-12.0464, -77.0428];
  if (!rnMap) {
    rnMap = L.map("rnMap").setView(centro, 16);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(rnMap);
    rnMap.on("click", (e) => rnColocarPin(e.latlng.lat, e.latlng.lng, false));
  } else rnMap.setView(centro, 16);
  if (rnMarker) {
    rnMarker.remove();
    rnMarker = null;
  }
  if (tieneSaved) rnColocarPin(centro[0], centro[1]);
  else rnPintarCoords();
  setTimeout(() => rnMap.invalidateSize(), 250);
}

document.getElementById("rnBuscarBtn").addEventListener("click", async () => {
  const q = document.getElementById("rnBuscar").value.trim();
  if (!q || !rnMap) return;
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pe&q=${encodeURIComponent(q)}`,
    );
    const j = await r.json();
    if (!j.length) return showToast("No se encontró ese lugar", true);
    rnColocarPin(Number(j[0].lat), Number(j[0].lon));
  } catch {
    showToast("❌ No se pudo buscar", true);
  }
});
document.getElementById("rnBuscar").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("rnBuscarBtn").click();
});
document.getElementById("rnGpsBtn").addEventListener("click", () => {
  if (!navigator.geolocation || !rnMap)
    return showToast("Sin geolocalización", true);
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      rnColocarPin(pos.coords.latitude, pos.coords.longitude);
      showToast(
        `🎯 Ubicación obtenida (±${Math.round(pos.coords.accuracy)} m)`,
      );
    },
    () =>
      showToast("No se pudo obtener tu ubicación (revisa el permiso)", true),
    { enableHighAccuracy: true, timeout: 12000 },
  );
});

async function rnGuardarEnDB(valor) {
  await updateDoc(tiendaDoc(localidad, "tiendas", tiendaId), {
    ubicacion_ruta: valor,
  });
  bizDataGlobal = { ...(bizDataGlobal || {}), ubicacion_ruta: valor };
  recalcularOrigenRuta();
  rnSync();
  // si hay un pedido abierto, la ruta aparece al instante
  if (activeModalId && pedidosMap.has(activeModalId))
    renderDetail(activeModalId);
}

document.getElementById("rnGuardar").addEventListener("click", async () => {
  if (!rnPos) return showToast("Marca el pin en el mapa o usa 🎯", true);
  try {
    await rnGuardarEnDB({
      lat: rnPos.lat,
      lng: rnPos.lng,
      actualizado: Date.now(),
    });
    rnOv.classList.remove("show");
    showToast("🏠 Dirección del negocio guardada");
  } catch (e) {
    console.error(e);
    showToast("❌ No se pudo guardar", true);
  }
});
document.getElementById("rnQuitar").addEventListener("click", async () => {
  try {
    await rnGuardarEnDB(null);
    rnOv.classList.remove("show");
    showToast("Ubicación para ruta eliminada");
  } catch (e) {
    console.error(e);
    showToast("❌ No se pudo quitar", true);
  }
});

function rnSync() {
  const el = document.getElementById("rnEstado");
  if (!el) return;
  const ur = bizDataGlobal?.ubicacion_ruta;
  if (ur && Number.isFinite(Number(ur.lat))) {
    el.textContent = `✅ Guardada: ${Number(ur.lat).toFixed(5)}, ${Number(ur.lng).toFixed(5)}`;
    el.style.color = "#4ade80";
  } else if (bizLat != null) {
    el.textContent = "Usando la ubicación del perfil del negocio";
    el.style.color = "";
  } else {
    el.textContent = "⚠️ Sin ubicación: no se puede trazar la ruta";
    el.style.color = "#fbbf24";
  }
}

(function () {
  const panel = document.getElementById("cfgPanel");
  if (!panel) return;
  const row = document.createElement("div");
  row.className = "autorej-wrap";
  row.style.gridColumn = "1 / -1";
  row.innerHTML = `
    <div class="dlv-cfg-row"><span class="l">🏠 Dirección del negocio (origen de la ruta)</span></div>
    <div id="rnEstado" class="dlv-cfg-sub" style="margin:6px 0;"></div>
    <button type="button" class="oc-btn ghost" id="rnEdit" style="width:100%;">📍 Configurar ubicación</button>`;
  panel.appendChild(row);
  document.getElementById("rnEdit").addEventListener("click", rnAbrir);
  document.getElementById("cfgBtn")?.addEventListener("click", rnSync);
  rnSync();
})();

/* ══════ Escanear pedido + filtro de fecha (WhatsApp / carrito) ══════ */
const wa2Style = document.createElement("style");
wa2Style.textContent = `
#clockTime,#clockDate{display:none !important;}
.est-legend{display:none !important;}
.stab[data-s="pendiente_pago"] .dot{background:#fbbf24 !important;}
.stab[data-s="en_pausa"] .dot{background:#38bdf8 !important;}
.board-col[data-status="pendiente_pago"]{border-top:3px solid #fbbf24;}
.board-col[data-status="en_pausa"]{border-top:3px solid #38bdf8;}
#waFechaBtn.on{border-color:#7c5cff;background:rgba(124,92,255,.18);}
#waTopBtns .autorej-btn{white-space:nowrap;}
`;
document.head.appendChild(wa2Style);

// si el reloj queda solo en su contenedor, lo ocultamos también
(function () {
  const p = document.getElementById("clockTime")?.parentElement;
  if (
    p &&
    [...p.children].every((c) => c.id === "clockTime" || c.id === "clockDate")
  )
    p.style.display = "none";
})();

const waBtns = document.createElement("div");
waBtns.id = "waTopBtns";
waBtns.style.cssText = "display:flex;gap:8px;align-items:center;flex:0 0 auto;";
waBtns.innerHTML = `
  <button type="button" class="autorej-btn" id="waScanBtn"><span class="ico">📷</span><span class="lbl-text">Escanear</span></button>
  <button type="button" class="autorej-btn" id="waFechaBtn"><span class="ico">📅</span><span class="lbl-text" id="waFechaLbl">Hoy</span></button>`;
document
  .querySelector(".head-right")
  ?.insertBefore(waBtns, document.getElementById("bellBtn"));

function sincronizarBotonesWa() {
  const on = originFilter === "whatsapp";
  const w = document.getElementById("waTopBtns");
  if (w) w.style.display = on ? "flex" : "none";
  const t = document.getElementById("tabsToggleBtn");
  if (t) t.style.display = on ? "flex" : "none";
}
sincronizarBotonesWa();

/* ── Filtro de fecha ── */
const diaLima = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(d);

function waPintarFecha() {
  const tipo = FILTROS_PEDIDO.find(([k]) => k === filtroTipoPedido);
  const extra =
    filtroTipoPedido !== "todos" ? ` · ${tipo[1].replace(/^\S+\s/, "")}` : "";
  document.getElementById("waFechaLbl").textContent = labelDateFilter() + extra;
  document
    .getElementById("waFechaBtn")
    .classList.toggle(
      "on",
      dateFilter.type !== "hoy" || filtroTipoPedido !== "todos",
    );
}
function waFiltro(f, pendId = null) {
  dateFilter = f;
  waPendienteId = pendId;
  pedidoSearchActivoId = null;
  limpiarResaltadoBusqueda();
  pedidosMap.clear();
  isFirstSnapshot = true;
  waPintarFecha();
  renderBoard();
  suscribirPedidos();
}

const waFechaOv = document.createElement("div");
waFechaOv.className = "dlv-ov";
waFechaOv.innerHTML = `
  <div class="dlv-box">
    <div class="dlv-head"><span>📅 Ver pedidos de…</span><button type="button" data-x>✕</button></div>

    <div class="wf-grid">
      <button type="button" class="oc-btn ghost" data-f="hoy">Hoy</button>
      <button type="button" class="oc-btn ghost" data-f="ayer">Ayer</button>
      <button type="button" class="oc-btn ghost" data-f="anteayer">Anteayer</button>
      <button type="button" class="oc-btn ghost" data-ult="3">Últimos 3 días</button>
      <button type="button" class="oc-btn ghost" data-ult="5">Últimos 5 días</button>
      <button type="button" class="oc-btn ghost" data-ult="7">Últimos 7 días</button>
      <button type="button" class="oc-btn ghost" data-ult="15">Últimos 15 días</button>
      <button type="button" class="oc-btn ghost" data-ult="30">Últimos 30 días</button>
    </div>

    <div class="dlv-prev-title">Un día en específico</div>
    <input type="date" id="waFechaInput" class="deli-inp" style="width:100%;height:46px;margin-bottom:8px;">
    <button type="button" class="oc-btn ghost" id="waFechaVer" style="width:100%;min-height:46px;">Ver ese día</button>

    <div class="dlv-prev-title">Rango de fechas (máx. 31 días)</div>
    <div style="display:flex;gap:8px;margin-bottom:8px;">
      <label style="flex:1;font-size:11px;color:var(--ink-dim);">Desde
        <input type="date" id="waDesde" class="deli-inp" style="width:100%;height:46px;margin-top:4px;"></label>
      <label style="flex:1;font-size:11px;color:var(--ink-dim);">Hasta
        <input type="date" id="waHasta" class="deli-inp" style="width:100%;height:46px;margin-top:4px;"></label>
    </div>
    <button type="button" class="np-confirmar-btn" id="waRangoVer">Ver rango</button>
  </div>`;
document.body.appendChild(waFechaOv);

const wfStyle = document.createElement("style");
wfStyle.textContent = `.wf-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px;}
.wf-grid .oc-btn{min-height:48px;width:100%;}`;
document.head.appendChild(wfStyle);

waFechaOv.addEventListener("click", (e) => {
  if (e.target === waFechaOv || e.target.hasAttribute("data-x"))
    return waFechaOv.classList.remove("show");
  const f = e.target.closest("[data-f]")?.dataset.f;
  const u = e.target.closest("[data-ult]")?.dataset.ult;
  if (f) {
    waFiltro({ type: f, day: null });
    waFechaOv.classList.remove("show");
  } else if (u) {
    waFiltro({ type: "ultimos", dias: Number(u) });
    waFechaOv.classList.remove("show");
  }
});

document.getElementById("waFechaVer").addEventListener("click", () => {
  const v = document.getElementById("waFechaInput").value;
  if (!v) return showToast("Elige una fecha", true);
  waFiltro({ type: "custom", day: v });
  waFechaOv.classList.remove("show");
});

document.getElementById("waRangoVer").addEventListener("click", () => {
  const desde = document.getElementById("waDesde").value;
  const hasta = document.getElementById("waHasta").value;
  if (!desde || !hasta) return showToast("Elige desde y hasta", true);
  if (desde > hasta)
    return showToast("'Desde' no puede ser después de 'Hasta'", true);
  const dias = (new Date(hasta) - new Date(desde)) / 86400000 + 1;
  if (dias > 31) return showToast("Máximo 31 días por consulta", true);
  waFiltro({ type: "rango", desde, hasta });
  waFechaOv.classList.remove("show");
});

document.getElementById("waFechaBtn").addEventListener("click", () => {
  const hoy = diaLima(new Date());
  ["waFechaInput", "waDesde", "waHasta"].forEach(
    (id) => (document.getElementById(id).max = hoy),
  );
  waFechaOv.classList.add("show");
});

/* ── Escáner de pedidos ── */
const waScanOv = document.createElement("div");
waScanOv.className = "np-opt-overlay";
waScanOv.innerHTML = `
  <div class="np-opt-modal np-cam-box">
    <div class="np-opt-head"><span>🔎 Buscar pedido</span><button id="waScanX">✕</button></div>
    <div class="np-cam-wrap"><video id="waScanVideo" playsinline muted></video><div class="np-cam-line"></div></div>
    <p class="np-cam-hint">Apunta al QR del pedido o escribe el código.</p>
    <div class="pe-search" style="margin-top:8px;">
      <input type="text" id="waScanCode" placeholder="Código (ej: A1B2C3)" autocomplete="off">
      <button type="button" class="oc-btn ghost" id="waScanGo">Buscar</button>
    </div>
  </div>`;
document.body.appendChild(waScanOv);

let waPararCam = null,
  waBuscando = false,
  waClearT;

function waCerrarScan() {
  waPararCam?.();
  waPararCam = null;
  waScanOv.classList.remove("show");
}
function waCodigos(raw) {
  return String(raw || "")
    .split(/[^A-Za-z0-9]+/)
    .filter((t) => t.length >= 4)
    .reverse();
}
function waBuscarLocal(raw) {
  for (const t of waCodigos(raw)) {
    const T = t.toUpperCase();
    for (const [id] of pedidosMap) {
      const I = id.toUpperCase();
      if (I === T || (T.length >= 6 && I.startsWith(T))) return id;
    }
  }
  return null;
}
function waMostrar(id) {
  pedidoSearchActivoId = id;
  if (!resaltarPedidoEncontrado(id)) {
    pedidoSearchActivoId = null;
    showToast("Ese pedido no es de WhatsApp / carrito", true);
    return false;
  }
  showToast(`🔎 Pedido #${codigoCortoPedido(id)}`);
  clearTimeout(waClearT);
  waClearT = setTimeout(() => {
    if (pedidoSearchActivoId === id) {
      pedidoSearchActivoId = null;
      limpiarResaltadoBusqueda();
      mostrarResultadoBusqueda("", "");
    }
  }, 20000);
  return true;
}
async function waProcesar(raw) {
  if (waBuscando) return false;
  waBuscando = true;
  try {
    const id = waBuscarLocal(raw);
    if (id) {
      npBeep(true);
      waCerrarScan();
      return waMostrar(id);
    }
    // no está en el día visible: se busca por ID completo y se salta a su fecha
    for (const t of waCodigos(raw)) {
      if (t.length < 15) continue;
      const s = await getDoc(
        tiendaSubDoc(localidad, "tiendas", tiendaId, "pedidos", t),
      ).catch(() => null);
      const f = s?.exists() ? toDate(s.data().timestamp) : null;
      if (f) {
        npBeep(true);
        waCerrarScan();
        waFiltro({ type: "custom", day: diaLima(f) }, s.id);
        return true;
      }
    }
    npBeep(false);
    showToast(
      "❌ No encontré ese pedido en esta fecha. Cambia el día 📅",
      true,
    );
    return false;
  } finally {
    setTimeout(() => (waBuscando = false), 800);
  }
}

document.getElementById("waScanBtn").addEventListener("click", async () => {
  waScanOv.classList.add("show");
  document.getElementById("waScanCode").value = "";
  try {
    waPararCam = await iniciarCamara(
      document.getElementById("waScanVideo"),
      (c) => waProcesar(c),
    );
  } catch (e) {
    console.warn(e);
    showToast("No se pudo abrir la cámara, escribe el código", true);
  }
});
document.getElementById("waScanX").onclick = waCerrarScan;
waScanOv.addEventListener("click", (e) => {
  if (e.target === waScanOv) waCerrarScan();
});
document.getElementById("waScanGo").addEventListener("click", () => {
  const v = document.getElementById("waScanCode").value.trim();
  if (v) waProcesar(v);
});
document.getElementById("waScanCode").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("waScanGo").click();
});

const mobStyle = document.createElement("style");
mobStyle.textContent = `
@media (max-width:820px){
  /* Menos aire en los bordes: todo pegado a los lados */
  header{padding:10px 8px 8px !important;}
  .head-top{margin-bottom:8px !important;}

  /* Fila de botones de arriba (config, escanear, fecha, campana) */
  .head-right{
    display:flex !important;flex-wrap:nowrap !important;align-items:center;
    gap:8px;padding:0 !important;width:100%;
  }
  .head-right .autorej-btn,#waTopBtns .autorej-btn,#bellBtn{
    min-width:44px;height:44px;padding:0 12px;justify-content:center;border-radius:13px;
  }
  #waTopBtns{gap:8px;}
  #waFechaBtn .lbl-text{display:inline !important;font-size:12px;}

  /* WhatsApp / Nuevo pedido: reparten el ancho y se ven completos */
  #originBar{
    display:flex !important;flex-wrap:nowrap !important;gap:8px;
    padding:0 !important;margin:0 0 8px;overflow:visible;
  }
  .origin-chip{
    flex:1 1 0;min-width:0;justify-content:center;text-align:center;
    min-height:44px;padding:8px 6px;font-size:11.5px;white-space:normal;line-height:1.15;
  }

  /* Pestañas de estado: más compactas, con scroll horizontal */
  #statusTabs{
    display:flex;overflow-x:auto;gap:6px;padding:0 !important;margin:0 0 8px;
    scroll-snap-type:x proximity;scrollbar-width:none;
  }
  #statusTabs::-webkit-scrollbar{display:none;}
  .stab{flex:0 0 auto;scroll-snap-align:start;min-height:42px;padding:7px 10px 7px 9px;gap:6px;}
  .stab .money{display:none;} /* el monto ya sale en la cabecera de la columna */

  /* Buscador a todo el ancho */
  .pedido-search-wrap{margin:0 0 8px !important;padding:9px 12px;width:100%;}
  .ps-result{position:static !important;display:inline-block;margin:0 0 8px;}

  /* Tablero y tarjetas pegados a los bordes */
  .board{padding:8px 8px 90px !important;}
  .col-head{padding:10px 6px !important;}
  .col-body{padding:8px 0 !important;}
  .order-card{margin:0 !important;padding:14px 12px !important;}
  .oc-btn{min-height:48px;font-size:14px;}
  .oc-actions{gap:8px;}
}
`;
document.head.appendChild(mobStyle);

/* ══════ Estados plegables: botón junto al buscador ══════ */
const tgStyle = document.createElement("style");
tgStyle.textContent = `
#statusTabs.tabs-plegadas{display:none !important;}
#tabsToggleBtn{
  flex-shrink:0;display:flex;align-items:center;gap:6px;height:34px;padding:0 11px;
  border-radius:10px;border:1px solid var(--line);background:var(--surface);
  color:var(--ink-dim);font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;
  touch-action:manipulation;
}
#tabsToggleBtn.on{background:var(--violet-soft);border-color:rgba(124,92,255,.35);color:var(--violet);}
#tabsToggleBtn:active{transform:scale(.96);}
@media (max-width:520px){#tabsToggleBtn .tg-txt{display:none;}#tabsToggleBtn{padding:0 10px;}}
`;
document.head.appendChild(tgStyle);

(function () {
  const tabs = document.getElementById("statusTabs");
  const wrap = document.querySelector(".pedido-search-wrap");
  if (!tabs || !wrap) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "tabsToggleBtn";
  btn.innerHTML = `<span>📋</span><span class="tg-txt">Estados</span>`;
  wrap.appendChild(btn);

  const abierto = localStorage.getItem("geinz_tabs_open") === "1"; // por defecto oculto
  tabs.classList.toggle("tabs-plegadas", !abierto);
  btn.classList.toggle("on", abierto);

  btn.addEventListener("click", () => {
    const ocultar = !tabs.classList.contains("tabs-plegadas");
    tabs.classList.toggle("tabs-plegadas", ocultar);
    btn.classList.toggle("on", !ocultar);
    localStorage.setItem("geinz_tabs_open", ocultar ? "0" : "1");
  });
})();

const boardFix = document.createElement("style");
boardFix.textContent = `
@media (min-width:821px){
  .board{
    min-height:calc(100dvh - 300px) !important;
    align-items:stretch !important;
  }
  .board-col{min-height:100% !important;}
  .board-col .col-body{min-height:200px;}
}
`;
document.head.appendChild(boardFix);

const animStyle = document.createElement("style");
animStyle.textContent = `
/* ── Aparición suave de botones y estados (solo opacity + transform) ── */
@keyframes fx-in{
  from{opacity:0;transform:translate3d(0,6px,0);}
  to{opacity:1;transform:translate3d(0,0,0);}
}

/* Fila de estados al desplegar */
#statusTabs:not(.tabs-plegadas){animation:fx-in .18s ease-out both;}
#statusTabs:not(.tabs-plegadas) .stab{animation:fx-in .2s ease-out both;}
#statusTabs:not(.tabs-plegadas) .stab:nth-child(2){animation-delay:.03s;}
#statusTabs:not(.tabs-plegadas) .stab:nth-child(3){animation-delay:.06s;}
#statusTabs:not(.tabs-plegadas) .stab:nth-child(4){animation-delay:.09s;}

/* Botones de arriba y cambio de vista */
#waTopBtns,#originBar .origin-chip{animation:fx-in .2s ease-out both;}

/* Cambio de columna en móvil */
.board-col.col-active{animation:fx-in .18s ease-out both;}

/* Toque en botones: respuesta instantánea, sin rebote pesado */
.oc-btn,.origin-chip,.stab,#tabsToggleBtn,.autorej-btn{
  transition:transform .12s ease,opacity .12s ease,background-color .12s ease !important;
}

/* Avisa al navegador qué se va a mover (solo en lo que sí se anima) */
.order-card,.board-col.col-active{will-change:transform,opacity;}

/* ── Quita lo pesado: animaciones infinitas con sombras ── */
.order-card.oc-pago-recibido,
.order-card.oc-en-local,
.order-card.oc-search-match{
  animation:none !important;
}
.order-card.oc-pago-recibido{box-shadow:0 0 0 2px rgba(251,191,36,.45) !important;}
.order-card.oc-en-local{box-shadow:0 0 0 2px rgba(236,72,153,.5) !important;}
.order-card.oc-search-match{box-shadow:0 0 0 2px rgba(245,197,99,.6) !important;}
.live-dot::after,.mesa-box.ocupada .mb-status .dot{animation:none !important;}

/* Celulares básicos: sin delays, todo más corto */
@media (max-width:820px){
  .order-card{animation-duration:.16s !important;}
  #statusTabs:not(.tabs-plegadas) .stab{animation-delay:0s !important;}
}

/* Si el sistema pide menos movimiento, se apaga todo */
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation:none !important;transition:none !important;}
}
`;
document.head.appendChild(animStyle);

(function () {
  const box = waFechaOv.querySelector(".dlv-box");
  const sec = document.createElement("div");
  sec.innerHTML = `
    <div class="dlv-prev-title">Tipo de pedido</div>
    <div class="wf-grid" id="wfTipos">
      ${FILTROS_PEDIDO.map(
        ([k, l]) =>
          `<button type="button" class="oc-btn ghost wf-tipo${k === "todos" ? " active" : ""}" data-tipo="${k}">${l}</button>`,
      ).join("")}
    </div>`;
  box.appendChild(sec);

  const st = document.createElement("style");
  st.textContent = `.wf-tipo.active{background:var(--violet-soft);border-color:rgba(124,92,255,.4);color:var(--violet);}`;
  document.head.appendChild(st);

  sec.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tipo]");
    if (!b) return;
    filtroTipoPedido = b.dataset.tipo;
    sec
      .querySelectorAll(".wf-tipo")
      .forEach((c) => c.classList.toggle("active", c === b));
    waPintarFecha();
    renderBoard();
  });
})();

aplicarVisibilidadPorTipoTienda();
const wfMobFix = document.createElement("style");
wfMobFix.textContent = `
#cfgPanel{overscroll-behavior:contain;}
.dlv-box{overscroll-behavior:contain;-webkit-overflow-scrolling:touch;}
.dlv-box input[type="date"]{
  width:100%;min-width:0;max-width:100%;box-sizing:border-box;
  font-size:16px;-webkit-appearance:none;appearance:none;
}
.dlv-box label{min-width:0;}
.dlv-box .wf-grid .oc-btn{white-space:normal;line-height:1.2;padding:6px 8px;}
@media (max-width:560px){
  .dlv-box{max-height:88dvh;padding-bottom:calc(16px + env(safe-area-inset-bottom));}
  .dlv-box > div[style*="display:flex"]{flex-direction:column;}
}`;
document.head.appendChild(wfMobFix);
const skelFix = document.createElement("style");
skelFix.textContent = `
.np-img-wrap,.np-det-img{animation:none !important;background:#1a1a20 !important;}
.np-img-wrap:has(img[data-fade]:not(.loaded)),
.np-det-img:has(img[data-fade]:not(.loaded)){
  animation:np-shimmer 1.2s linear infinite !important;
  background:linear-gradient(90deg,rgba(255,255,255,.04) 25%,rgba(255,255,255,.09) 50%,rgba(255,255,255,.04) 75%) !important;
  background-size:200% 100% !important;
}`;
document.head.appendChild(skelFix);
const npOptCss = document.createElement("style");
npOptCss.textContent = `
.opt-grp{margin-bottom:18px;}
.opt-grp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px;}
.opt-grp-title{margin:0;font-size:15px;font-weight:800;color:#fff;text-transform:capitalize;}
.opt-grp-rule{margin:2px 0 0;font-size:11.5px;color:#9c9ca3;}
.opt-badge{font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:4px 10px;border-radius:999px;white-space:nowrap;background:rgba(255,255,255,.08);color:#c9c9d1;}
.opt-grp.req .opt-badge{background:rgba(251,191,36,.14);color:#fcd34d;}
.opt-grp.ok .opt-badge{background:rgba(124,92,255,.22);color:#a78bfa;}
.opt-list{display:flex;flex-direction:column;gap:8px;}
.opt-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;cursor:pointer;background:rgba(255,255,255,.03);border:1.5px solid rgba(255,255,255,.08);}
.opt-row.sel{border-color:#7c5cff;background:rgba(124,92,255,.12);}
.opt-row.off,.opt-row.blk{opacity:.4;cursor:not-allowed;}
.opt-row.qty{cursor:default;}
.opt-row.off .opt-name{text-decoration:line-through;}
.opt-mark{width:22px;height:22px;flex-shrink:0;border:2px solid rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#fff;}
.opt-mark.radio{border-radius:50%;}
.opt-mark.check{border-radius:6px;}
.opt-row.sel .opt-mark{background:#7c5cff;border-color:#7c5cff;}
.opt-info{flex:1;min-width:0;}
.opt-name{margin:0;font-size:14px;font-weight:700;color:#fff;}
.opt-desc{margin:3px 0 0;font-size:12px;color:#9c9ca3;}
.opt-stk{margin:2px 0 0;font-size:11px;color:#9c9ca3;}
.opt-price{font-size:12.5px;font-weight:800;color:#d4d4d8;white-space:nowrap;}
.opt-agotado{font-size:10px;font-weight:800;text-transform:uppercase;padding:4px 9px;border-radius:999px;background:rgba(248,113,113,.14);color:#fca5a5;}
.opt-thumb{width:52px;height:52px;flex-shrink:0;border-radius:12px;object-fit:cover;background:#1a1a20;}
.opt-step{display:flex;align-items:center;gap:8px;flex-shrink:0;}
.opt-step button{width:40px;height:40px;border-radius:10px;border:none;cursor:pointer;font-weight:900;font-size:17px;color:#fff;background:rgba(255,255,255,.1);touch-action:manipulation;}
.opt-step button.add{width:auto;padding:0 14px;font-size:12.5px;background:#7c5cff;}
.opt-step button:disabled{opacity:.35;cursor:not-allowed;}
.opt-step b{min-width:20px;text-align:center;font-size:15px;color:#fff;}
.opt-grp.shake{animation:optShake .45s;}
@keyframes optShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-7px)}40%{transform:translateX(7px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}
`;
document.head.appendChild(npOptCss);

const dlgFix = document.createElement("style");
dlgFix.textContent = `
/* Delivery: input "Ej: Solo Barranca" que salía blanco y desbordado */
#deliTexto{
  display:block;width:100% !important;box-sizing:border-box;margin-top:8px;
  background:var(--bg,#0a0a0f) !important;color:#fff !important;
  border:1px solid var(--line) !important;border-radius:10px;
  padding:10px 12px;font-size:13px;font-weight:600;outline:none;color-scheme:dark;
}
#deliTexto::placeholder{color:var(--ink-faint);font-weight:500;}
#deliTexto:focus{border-color:#7c5cff;box-shadow:0 0 0 3px rgba(124,92,255,.15);}
#deliFijaBox{min-width:0;}
#deliFijaBox input{min-width:0;}

/* Menú configuración: "Delivery gratis por compra mínima" */
#dgBox{
  box-sizing:border-box;width:100%;flex-wrap:wrap;
  padding:10px 12px;border:1px solid var(--line);border-radius:12px;
  background:rgba(255,255,255,.03);
}
#dgBox span{white-space:nowrap;}
#dgBox #dgMonto{flex:1 1 80px;min-width:0;}
#dgBox #dgGuardar{flex:0 0 auto;width:auto;min-height:40px;padding:0 14px;}
#cfgPanel .autorej-wrap{min-width:0;overflow:hidden;}

/* Diálogo de pausa */
#pausaOverlay{z-index:400;}
.pausa-field{
  width:100%;box-sizing:border-box;border-radius:10px;border:1px solid var(--line);
  background:var(--bg,#0a0a0f);color:#fff;color-scheme:dark;padding:10px 12px;
  font-size:13px;outline:none;resize:vertical;
}
.pausa-field::placeholder{color:var(--ink-faint);}
.pausa-field:focus{border-color:#7c5cff;box-shadow:0 0 0 3px rgba(124,92,255,.15);}
#pausaBody .np-opt-row{max-height:160px;overflow-y:auto;scrollbar-width:none;}
#pausaBody .np-opt-row::-webkit-scrollbar{display:none;}
#pausaBody .np-opt-btn{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
`;
document.head.appendChild(dlgFix);

/* ══════ Nuevo pedido en celular: cuadrícula compacta + barra para cobrar ══════ */
(function () {
  const wrap = document.getElementById("nuevoPedidoWrap");
  const cart = wrap?.querySelector(".np-cart-panel");
  if (!wrap || !cart) return;

  const css = document.createElement("style");
  css.textContent = `
#npBarraMovil,#npCartFondo,#npCartCerrar{display:none;}
@media (max-width:820px){
  /* Catálogo: 3 columnas y un solo scroll */
  #nuevoPedidoWrap{padding:8px 8px 76px !important;gap:0 !important;}
  #nuevoPedidoWrap .np-panel{padding:10px !important;min-width:0 !important;}
  #nuevoPedidoWrap .np-search-wrap{margin-bottom:8px;}
  #nuevoPedidoWrap .np-filtros{margin-bottom:8px;}
  #nuevoPedidoWrap .np-search-wrap{gap:6px;}
  #nuevoPedidoWrap .np-search-box{min-width:0;}
  #nuevoPedidoWrap .np-tool-btn{width:40px;}
  #nuevoPedidoWrap .np-grid{
    grid-template-columns:repeat(3,minmax(0,1fr)) !important;
    gap:7px !important;padding:0 0 8px !important;
    max-height:calc(100dvh - 270px) !important;
  }
  #nuevoPedidoWrap .np-card .np-name{
    font-size:10.5px;margin-top:5px;padding:0 6px;white-space:normal;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
    line-height:1.2;min-height:2.4em;
  }
  #nuevoPedidoWrap .np-card .np-price{font-size:11.5px;padding:0 6px 6px;}

  /* Barra fija inferior */
  #npBarraMovil{
    display:flex;align-items:center;justify-content:space-between;gap:8px;
    position:fixed;left:8px;right:84px;bottom:10px;height:56px;z-index:50;
    padding:0 16px;border:none;border-radius:16px;
    background:#22c55e;color:#04240f;font-size:14px;font-weight:800;
    box-shadow:0 10px 28px rgba(0,0,0,.55);cursor:pointer;
  }
  #npBarraMovil:disabled{background:#1b1b28;color:#93939f;}

  /* El pedido actual se abre como panel desde abajo */
  #npCartFondo{position:fixed;inset:0;z-index:54;background:rgba(0,0,0,.65);}
  #nuevoPedidoWrap.carrito-abierto #npCartFondo{display:block;}
  #nuevoPedidoWrap .np-cart-panel{
    position:fixed;left:0;right:0;bottom:0;z-index:55;
    width:100%;min-width:0;height:auto !important;max-height:88dvh !important;
    overflow-y:auto;border-radius:20px 20px 0 0;padding:14px 14px 16px;
    transform:translateY(105%);visibility:hidden;
    transition:transform .25s ease,visibility 0s linear .25s;
  }
  #nuevoPedidoWrap.carrito-abierto .np-cart-panel{
    transform:none;visibility:visible;transition:transform .25s ease;
  }
  #nuevoPedidoWrap .np-cart-panel > *{flex-shrink:0;}
  #nuevoPedidoWrap .np-cart-items{flex:0 0 auto;max-height:32dvh;overflow-y:auto;}
  #nuevoPedidoWrap .npc-ico{width:34px;height:34px;font-size:15px;}
  #npCartCerrar{
    display:block;position:absolute;top:8px;right:10px;width:34px;height:34px;
    border:none;border-radius:50%;background:rgba(255,255,255,.08);color:#fff;cursor:pointer;
  }
  /* Deja libre la esquina del botón flotante del menú */
  #nuevoPedidoWrap #npConfirmarBtn{width:calc(100% - 76px);min-height:54px;font-size:15px;}
}
`;
  document.head.appendChild(css);

  const barra = document.createElement("button");
  barra.type = "button";
  barra.id = "npBarraMovil";
  const fondo = document.createElement("div");
  fondo.id = "npCartFondo";
  wrap.append(barra, fondo);

  const cerrar = document.createElement("button");
  cerrar.type = "button";
  cerrar.id = "npCartCerrar";
  cerrar.textContent = "✕";
  cart.appendChild(cerrar);

  const abrir = (v) => wrap.classList.toggle("carrito-abierto", v);
  barra.addEventListener("click", () => abrir(true));
  fondo.addEventListener("click", () => abrir(false));
  cerrar.addEventListener("click", () => abrir(false));

  function pintarBarra() {
    const n = [...NuevoPedido.carrito.values()].reduce(
      (s, i) => s + i.cantidad,
      0,
    );
    const total = document.getElementById("npCartTotal").textContent;
    barra.disabled = !n;
    barra.innerHTML = n
      ? `<span>🧾 Cobrar (${n})</span><span>${total} ›</span>`
      : `<span>Toca un producto para empezar</span>`;
    if (!n) abrir(false); // venta registrada o carrito vacío
  }
  const obs = new MutationObserver(pintarBarra);
  ["npCartItems", "npCartTotal"].forEach((id) =>
    obs.observe(document.getElementById(id), {
      childList: true,
      subtree: true,
      characterData: true,
    }),
  );
  pintarBarra();
})();

/* ══════ Nuevo pedido en celular: animaciones suaves y acabado elegante ══════ */
(function () {
  const wrap = document.getElementById("nuevoPedidoWrap");
  const cart = wrap?.querySelector(".np-cart-panel");
  const barra = document.getElementById("npBarraMovil");
  if (!wrap || !cart || !barra) return;

  const css = document.createElement("style");
  css.textContent = `
@media (max-width:820px){
  /* Fondo: se oscurece y desenfoca poco a poco */
  #nuevoPedidoWrap #npCartFondo{
    display:block;opacity:0;visibility:hidden;
    background:rgba(4,4,10,.62);
    backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
    transition:opacity .35s ease,visibility 0s linear .35s;
  }
  #nuevoPedidoWrap.carrito-abierto #npCartFondo{
    opacity:1;visibility:visible;transition:opacity .35s ease;
  }

  /* Panel: sube deslizándose */
  #nuevoPedidoWrap .np-cart-panel{
    padding-top:28px;border-radius:28px 28px 0 0;
    background:linear-gradient(180deg,#181824,#0f0f16 55%);
    border:1px solid rgba(255,255,255,.09);border-bottom:none;
    box-shadow:0 -18px 50px rgba(0,0,0,.55);
    overscroll-behavior:contain;will-change:transform;
    transition:transform .34s cubic-bezier(.4,0,.2,1),visibility 0s linear .34s;
  }
  #nuevoPedidoWrap.carrito-abierto .np-cart-panel{
    transition:transform .5s cubic-bezier(.22,1,.36,1);
  }
  #nuevoPedidoWrap .np-cart-panel::before{
    content:"";position:absolute;top:10px;left:50%;margin-left:-22px;
    width:44px;height:5px;border-radius:99px;background:rgba(255,255,255,.2);
  }
  #nuevoPedidoWrap.carrito-abierto .np-cart-panel > :not(#npCartCerrar){
    animation:npSube .42s cubic-bezier(.22,1,.36,1) both;
  }
  #nuevoPedidoWrap.carrito-abierto .np-cart-panel > :nth-child(2){animation-delay:.04s;}
  #nuevoPedidoWrap.carrito-abierto .np-cart-panel > :nth-child(3){animation-delay:.08s;}
  #nuevoPedidoWrap.carrito-abierto .np-cart-panel > :nth-child(n+4){animation-delay:.12s;}

  /* Campos y botones */
  #nuevoPedidoWrap .np-cliente-input{height:46px;border-radius:14px;font-size:16px;}
  #nuevoPedidoWrap .np-pago-btn{min-height:46px;border-radius:14px;transition:all .22s ease;}
  #nuevoPedidoWrap .np-cart-row{
    padding:10px;border-radius:16px;
    background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.06);
    animation:npSube .3s ease both;
  }
  #nuevoPedidoWrap .npc-ico{border-radius:11px;transition:transform .15s ease;}
  #nuevoPedidoWrap #npConfirmarBtn{
    border-radius:18px;background:linear-gradient(135deg,#2ee06f,#16a34a);
    box-shadow:0 10px 24px rgba(34,197,94,.25);transition:transform .15s ease,opacity .2s;
  }

  /* Barra de cobro */
  #npBarraMovil{
    border-radius:20px;background:linear-gradient(135deg,#2ee06f,#16a34a);
    box-shadow:0 12px 30px rgba(34,197,94,.28),0 6px 16px rgba(0,0,0,.5);
    transition:transform .18s ease,opacity .35s ease;
    animation:npSube .45s cubic-bezier(.22,1,.36,1) both;
  }
  #npBarraMovil:disabled{
    background:rgba(27,27,40,.9);box-shadow:0 6px 18px rgba(0,0,0,.45);
    border:1px solid rgba(255,255,255,.08);font-size:12.5px;
  }
  #nuevoPedidoWrap.carrito-abierto #npBarraMovil{opacity:0;transform:translateY(14px);}

  /* Respuesta al tocar */
  #nuevoPedidoWrap .np-card{border-radius:16px;transition:transform .18s ease,border-color .25s,box-shadow .25s;}
  #nuevoPedidoWrap .np-card:active{transform:scale(.94);}
  #npBarraMovil:active:not(:disabled),
  #nuevoPedidoWrap #npConfirmarBtn:active:not(:disabled),
  #nuevoPedidoWrap .np-pago-btn:active,
  #nuevoPedidoWrap .npc-ico:active{transform:scale(.95);}
}
@keyframes npSube{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:none;}}
@media (prefers-reduced-motion:reduce){
  #nuevoPedidoWrap *{animation:none !important;transition:none !important;}
}
`;
  document.head.appendChild(css);

  /* Pequeño "latido" en la barra cada vez que cambia el pedido */
  new MutationObserver(() => {
    if (
      barra.disabled ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    barra.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(1.04)" },
        { transform: "scale(1)" },
      ],
      { duration: 320, easing: "ease-out" },
    );
  }).observe(barra, { childList: true });

  /* Cerrar deslizando hacia abajo */
  let inicio = null,
    dy = 0;
  cart.addEventListener(
    "touchstart",
    (e) => {
      const desdeArriba =
        e.touches[0].clientY - cart.getBoundingClientRect().top < 70;
      inicio =
        desdeArriba &&
        cart.scrollTop <= 0 &&
        matchMedia("(max-width:820px)").matches
          ? e.touches[0].clientY
          : null;
      dy = 0;
    },
    { passive: true },
  );
  cart.addEventListener(
    "touchmove",
    (e) => {
      if (inicio === null) return;
      dy = Math.max(0, e.touches[0].clientY - inicio);
      if (dy > 0) e.preventDefault();
      cart.style.transition = "none";
      cart.style.transform = `translateY(${dy}px)`;
    },
    { passive: false },
  );
  const soltar = () => {
    if (inicio === null) return;
    inicio = null;
    cart.style.transition = "";
    cart.style.transform = "";
    if (dy > 90) wrap.classList.remove("carrito-abierto");
  };
  cart.addEventListener("touchend", soltar);
  cart.addEventListener("touchcancel", soltar);
})();
/* ══════ Nuevo pedido: panel completo, detalle suave, ícono y más espacio ══════ */
(function () {
  const css = document.createElement("style");
  css.textContent = `
/* ── Productos más separados ── */
#nuevoPedidoWrap .np-grid{gap:16px;}

/* ── Líneas del pedido: separadas y fáciles de leer ── */
#nuevoPedidoWrap .np-cart-items{gap:12px;}
#nuevoPedidoWrap .np-cart-row{
  flex-shrink:0;gap:10px;padding:12px;border-radius:16px;
  background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08);
}
#nuevoPedidoWrap .npc-name .n{font-size:13px;line-height:1.3;}
#nuevoPedidoWrap .npc-name .p{display:block;margin-top:3px;line-height:1.35;}
#nuevoPedidoWrap .npc-name .npc-opciones:not([style*="none"]){
  display:block;width:fit-content;margin-top:6px;padding:5px 9px;border-radius:9px;
  background:rgba(124,92,255,.14);border:1px solid rgba(124,92,255,.3);
  color:#d6ccff;font-weight:600;
}
#nuevoPedidoWrap .npc-right{gap:8px;}
#nuevoPedidoWrap .npc-icons{gap:6px;}

/* ── Botón actualizar ── */
#npRefreshBtn{display:flex;align-items:center;justify-content:center;color:#a78bfa;}
#npRefreshBtn svg{width:20px;height:20px;}
#npRefreshBtn.spinning{animation:none;}
#npRefreshBtn.spinning svg{animation:np-spin .8s linear infinite;}

/* ── Detalle del producto y opciones: apertura suave ── */
#npDetOverlay,#npOptOverlay{
  display:flex;opacity:0;visibility:hidden;
  backdrop-filter:blur(0);-webkit-backdrop-filter:blur(0);
  transition:opacity .3s ease,backdrop-filter .3s ease,visibility 0s linear .3s;
}
#npDetOverlay.show,#npOptOverlay.show{
  opacity:1;visibility:visible;
  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  transition:opacity .3s ease,backdrop-filter .3s ease;
}
#npDetOverlay .np-opt-modal,#npOptOverlay .np-opt-modal{
  border-radius:24px;box-shadow:0 30px 80px rgba(0,0,0,.6);
  transform:translateY(36px) scale(.94);
  transition:transform .3s cubic-bezier(.4,0,.2,1);
}
#npDetOverlay.show .np-opt-modal,#npOptOverlay.show .np-opt-modal{
  transform:none;transition:transform .5s cubic-bezier(.22,1,.36,1);
}

/* ── Celular: el pedido ocupa toda la pantalla ── */
@media (max-width:820px){
  #nuevoPedidoWrap .np-grid{gap:11px !important;}
  #nuevoPedidoWrap .np-cart-panel{
    top:0;height:100dvh !important;max-height:100dvh !important;
    display:flex;flex-direction:column;
    border-radius:0;border:none;overflow-y:auto;
  }
  #nuevoPedidoWrap .np-cart-items{
    flex:1 1 0;min-height:200px;max-height:none;
    overflow-y:auto;overscroll-behavior:contain;padding:2px 0 8px;
  }
  #nuevoPedidoWrap #npAdicionales{max-height:20dvh;overflow-y:auto;}
  #nuevoPedidoWrap .np-cart-head{font-size:17px;margin-bottom:14px;}
  #npCartCerrar{top:14px;right:14px;}
}
@media (prefers-reduced-motion:reduce){
  #npDetOverlay,#npOptOverlay,#npDetOverlay *,#npOptOverlay *{transition:none !important;}
}
`;
  document.head.appendChild(css);

  const refrescar = document.getElementById("npRefreshBtn");
  if (refrescar) {
    refrescar.setAttribute("aria-label", "Actualizar productos");
    refrescar.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/><path d="M3 12A9 9 0 0 1 18.5 5.8L21 8"/><path d="M21 3v5h-5"/></svg>`;
  }
})();

/* ══════ Buscador de productos: resalta las coincidencias (como Ctrl+F) ══════ */
(function () {
  const input = document.getElementById("npSearchInput");
  const grid = document.getElementById("npGrid");
  if (!input || !grid || !window.Highlight || !CSS.highlights) return;

  const css = document.createElement("style");
  css.textContent = `::highlight(np-busqueda){background-color:#fde047;color:#111;}`;
  document.head.appendChild(css);

  const limpio = (s) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  function resaltar() {
    const palabras = limpio(input.value).split(/\s+/).filter(Boolean);
    const marcas = new Highlight();
    if (palabras.length) {
      grid.querySelectorAll(".np-name").forEach((el) => {
        const nodos = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let nodo;
        while ((nodo = nodos.nextNode())) {
          // texto sin tildes + posición de cada letra en el texto original
          let texto = "";
          const pos = [];
          for (let i = 0; i < nodo.data.length; i++)
            for (const c of limpio(nodo.data[i])) {
              texto += c;
              pos.push(i);
            }
          palabras.forEach((w) => {
            for (
              let i = texto.indexOf(w);
              i >= 0;
              i = texto.indexOf(w, i + w.length)
            ) {
              const r = new Range();
              r.setStart(nodo, pos[i]);
              r.setEnd(nodo, pos[i + w.length - 1] + 1);
              marcas.add(r);
            }
          });
        }
      });
    }
    CSS.highlights.set("np-busqueda", marcas);
  }

  const programar = () => requestAnimationFrame(resaltar);
  input.addEventListener("input", programar);
  // también cuando la cuadrícula se repinta, se filtra o se limpia la búsqueda
  new MutationObserver(programar).observe(grid, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style"],
  });
})();


/* ══════ Celular: Nuevo pedido entra completo en la pantalla ══════ */
(function () {
  const abierto = ":has(#nuevoPedidoWrap:not(.vista-oculta))";
  const css = document.createElement("style");
  css.textContent = `
@media (max-width:820px){
  html${abierto},html${abierto} body{height:100%;overflow:hidden;}
  body .app-shell${abierto}{height:100vh;height:100dvh;overflow:hidden;}
  .app-shell${abierto} > header{flex:0 0 auto;}
  #nuevoPedidoWrap{flex:1 1 0 !important;min-height:0 !important;height:auto !important;overflow:hidden !important;}
  #nuevoPedidoWrap .np-panel{flex:1 1 0 !important;min-height:0 !important;overflow:hidden;}
  #nuevoPedidoWrap .np-grid{flex:1 1 0;min-height:0;max-height:none !important;overscroll-behavior:contain;}
}
`;
  document.head.appendChild(css);

  /* El marco que contiene esta página no debe ser más alto que lo visible */
  const marco = window.frameElement;
  if (!marco) return;
  const padre = window.parent;
  function ajustar() {
    if (padre.innerWidth > 820) return marco.style.removeProperty("height");
    const vista = padre.visualViewport;
    const visible = vista ? vista.height * vista.scale : padre.innerHeight;
    const arriba = Math.max(0, marco.getBoundingClientRect().top + padre.scrollY);
    const alto = Math.floor(visible - arriba);
    if (alto > 300) marco.style.setProperty("height", `${alto}px`, "important");
  }
  const eventos = [padre, padre.visualViewport].filter(Boolean);
  eventos.forEach((o) => o.addEventListener("resize", ajustar));
  window.addEventListener("pagehide", () => {
    eventos.forEach((o) => o.removeEventListener("resize", ajustar));
    marco.style.removeProperty("height");
  });
  ajustar();
  setTimeout(ajustar, 600);
})();