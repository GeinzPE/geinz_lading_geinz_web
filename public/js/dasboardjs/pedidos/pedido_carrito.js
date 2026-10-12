/* ═══════════════════════════════════════════════════════════════════
   pedidos_carrito.js
   - Firebase + estado global + utilidades compartidas (exportadas)
   - Tablero de pedidos de carrito (WhatsApp)
   - Delivery, cupones/puntos, auto-rechazo, tiempos, búsqueda
   ═══════════════════════════════════════════════════════════════════ */

import {
  getFirestore, doc, getDoc, collection, onSnapshot, updateDoc,
  serverTimestamp, query, orderBy, where, limit, startAfter,
  Timestamp, writeBatch, setDoc, getDocs, addDoc, runTransaction,
  increment, deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { db } from "../../db/db.js";
import {
  cachearConfigComprobante, prepararCfgComprobante,
  imprimirComprobante, registrarComprobante,
} from "../comprobantes.js";
import {
  tiendaDoc, tiendaSubDoc, tiendaSubCol, data_user_logeado,
  clienteDoc, clienteCuponDoc,
} from "../../rutas/rutas.js";

/* ═════════ ESTADO GLOBAL (exportado) ═════════ */
export let tiendaId = sessionStorage.getItem("tiendaId");
export let localidad = sessionStorage.getItem("localidad");
export const _params = new URLSearchParams(window.location.search);

export const PLAN_PED = {
  tiempos: true, estados: true, autoOff: true, autoReserva: true,
  deliveryCfg: true, repartidores: true, maxRepartidores: 5,
  carrito: true, mesa: true, nuevoPedido: true, mozos: true,
  configMesas: true, camara: true, celular: true,
};

export const URL_NOTIFICAR_CLIENTE =
  "https://enviar-notificacion-con-solo-id-desde-la-web-oixttik5rq-uc.a.run.app";

export const SND_STOCK_AGOTADO = "../../sounds/stok_bajo.mp3";
export const SND_NUEVO_PEDIDO = "../../sounds/nuevo_pedido_en_geinz.mp3";
export const SND_NUEVO_PEDIDO_DESCUENTO = "../../sounds/pedido_entrante_descuento.mp3";
export const SND_NUEVO_PEDIDO_CUPON_DESCUENTO = "../../sounds/pedido_entrante_cupon_descuento.mp3";
export const SND_CANJE_PUNTOS = "../../sounds/canje_de_puntos.mp3";
export const SND_CLIENTE_EN_LOCAL = "../../sounds/cliente_local.mp3";
export const SND_NUEVO_PEDIDO_DELIVERY = "../../sounds/nuevo_pedido_delivery.mp3";
export const SND_NUEVO_PEDIDO_RECOJO = "../../sounds/nuevo_pedido_presencial.mp3";
export const SND_PEDIDO_CANCELADO = "../../sounds/se_cancelo_un_pedido.mp3";
export const SND_PEDIDO_CANCELADO_PAUSA = "../../sounds/cancelo_pedido_pausa.mp3";
export const SND_CLIENTE_CANCELO_PEDIDO = "../../sounds/cliente_cancelo_pedido.mp3";
export const SND_PEDIDO_CONTESTADO = "../../sounds/modifico_pedido_pausa.mp3";
export const SND_PAGO_RECIBIDO = "../../sounds/comprovante_de_pago_recibido.mp3";

if (!tiendaId || !localidad) {
  window.addEventListener("message", (e) => {
    if (e.data?.tipo !== "DATOS_TIENDA") return;
    tiendaId = e.data.tiendaId;
    localidad = e.data.localidad;
  });
}

/* ═════════ DOMINIO / BIZ (exportado) ═════════ */
export let bizLogoUrl = "";
export let bizNombreGlobal = "Geinz";
export let bizLat = null, bizLng = null;
export let bizDataGlobal = null, bizAliasGlobal = null, bizDominioGlobal = null;

/* ═════════ SEGUIDORES (exportado) ═════════ */
export const clientesSeguidoresCache = new Map();

/* ═════════ AUDIO / SONIDO ═════════ */
export let soundEnabled = localStorage.getItem("geinz_sound_enabled") !== "0";
export let audioCtx = null;

export function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { return null; }
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
document.addEventListener("click", () => ensureAudio(), { once: true, capture: true });

export function playSoundOnce(url) {
  if (!soundEnabled) return;
  try { new Audio(url).play().catch(() => {}); } catch {}
}

/* Cola de alarmas (una a la vez, 4 repeticiones por pedido) */
const REPETICIONES_ALARMA = 4;
export const colaAlarmas = [];
export let alarmaActual = null;

export function encolarAlarma(pedidoId, url) {
  if (!soundEnabled) return;
  if (alarmaActual?.pedidoId === pedidoId) return;
  if (colaAlarmas.some((a) => a.pedidoId === pedidoId)) return;
  colaAlarmas.push({ pedidoId, url });
  if (!alarmaActual) reproducirSiguienteAlarma();
}
function reproducirSiguienteAlarma() {
  if (!colaAlarmas.length) { alarmaActual = null; return; }
  const { pedidoId, url } = colaAlarmas.shift();
  const pedido = pedidosMap.get(pedidoId);
  const estado = pedido ? (ESTADOS.includes(pedido.estado) ? pedido.estado : "pendiente") : null;
  if (!pedido || estado !== "pendiente") { reproducirSiguienteAlarma(); return; }
  const audio = new Audio(url);
  alarmaActual = { pedidoId, audio, repeticionesRestantes: REPETICIONES_ALARMA };
  audio.addEventListener("ended", () => {
    if (!alarmaActual || alarmaActual.pedidoId !== pedidoId) return;
    alarmaActual.repeticionesRestantes -= 1;
    if (alarmaActual.repeticionesRestantes > 0) { audio.currentTime = 0; audio.play().catch(() => {}); }
    else reproducirSiguienteAlarma();
  });
  audio.play().catch(() => reproducirSiguienteAlarma());
}
export function detenerSoundLoopParaPedido(pedidoId) {
  const idx = colaAlarmas.findIndex((a) => a.pedidoId === pedidoId);
  if (idx !== -1) colaAlarmas.splice(idx, 1);
  if (alarmaActual?.pedidoId === pedidoId) {
    alarmaActual.audio.pause(); alarmaActual.audio.currentTime = 0;
    alarmaActual = null; reproducirSiguienteAlarma();
  }
}

/* ═════════ ESTADOS / MAPS ═════════ */
export const ESTADOS = ["pendiente","pendiente_pago","en_proceso","listo","en_pausa","entregado","rechazado"];
export const pedidosMap = new Map();
export const prevMoney = { pendiente:0, pendiente_pago:0, en_proceso:0, listo:0, en_pausa:0, entregado:0, rechazado:0 };

export let activeTab = "pendiente";
export let activeModalId = null;
export let isFirstSnapshot = true;
export let pedidoSearchActivoId = null;
export let originFilter = "whatsapp"; // "whatsapp" | "mesa" | "directo"
export let whatsappUnseen = 0;
export let mesaFilter = null;

/* ═════════ UTILIDADES (exportadas) ═════════ */
export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
}
export function fmtMoney(n) { return "S/ " + Number(n || 0).toFixed(2); }
export function toDate(ts) { return ts && typeof ts.toDate === "function" ? ts.toDate() : null; }
export function timeAgo(date) {
  if (!date) return "—";
  const min = Math.floor((Date.now() - date.getTime()) / 60000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}
export function showToast(msg, danger) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle("danger", !!danger);
  el.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("show"), 2600);
}
export function sinUndef(v) {
  if (Array.isArray(v)) return v.map(sinUndef);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    const o = {};
    Object.keys(v).forEach((k) => { if (v[k] !== undefined) o[k] = sinUndef(v[k]); });
    return o;
  }
  return v;
}
export function labelEstado(e) {
  return ({
    pendiente:"Pendiente", en_proceso:"En proceso", en_pausa:"En pausa",
    entregado:"Entregado", rechazado:"Rechazado",
    pendiente_pago:"Pendiente de pago", listo:"Ningún pedido listo",
  })[e] || e;
}
export function animateMoney(el, end) {
  if (!el) return;
  const start = parseFloat((el.textContent || "").replace(/[^\d.]/g, "")) || 0;
  if (Math.abs(end - start) < 0.005) { el.textContent = fmtMoney(end); return; }
  const duration = 420, t0 = performance.now();
  function step(now) {
    const p = Math.min((now - t0) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmtMoney(start + (end - start) * eased);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ═════════ ORIGEN DEL PEDIDO ═════════ */
export function getOrigen(p) {
  const mesa = p && p.mesa;
  if (mesa && mesa.numero != null)
    return { tipo:"mesa", numero:Number(mesa.numero), nombre:mesa.nombre||null, mesaId:mesa.id||null };
  if (p && p.mesaId && p.mesaNumero != null)
    return { tipo:"mesa", numero:Number(p.mesaNumero), nombre:p.mesaNombre||null, mesaId:p.mesaId };
  if (Array.isArray(p?.mesas) && p.mesas.length)
    return { tipo:"mesa", numero:Number(p.mesas[0].numero),
      nombre:p.mesas.map((m)=>m.nombre).join(" + "), mesaId:p.mesas[0].id };
  return { tipo:"whatsapp", numero:null, nombre:null, mesaId:null };
}
export function getTipoCuponPedido(p) {
  const c = p?.cupon; if (!c) return null;
  const esFid = c.origen === "fidelizacion";
  const productos = Array.isArray(p.productos) ? p.productos : [];
  if (esFid && c.tipo === "producto" && productos.length === 1) return "canje_puntos";
  if (esFid) return "descuento_fidelizacion";
  return "cupon_descuento";
}

/* ═════════ OPCIONES DE PRODUCTO ═════════ */
export function entradasDeOpcion(v) {
  if (v && typeof v === "object" && !Array.isArray(v))
    return Object.entries(v).filter(([, c]) => (Number(c) || 0) > 0);
  if (Array.isArray(v)) return v.map((n) => [n, 1]);
  return v ? [[v, 1]] : [];
}
export function opcionesDetalleLineas(it) {
  if (!it.opciones || !Object.keys(it.opciones).length) return [];
  const lineas = [];
  Object.entries(it.opciones).forEach(([k, v]) => {
    entradasDeOpcion(v).forEach(([n, c]) => lineas.push(`${k}: ${n}${c > 1 ? ` x${c}` : ""}`));
  });
  return lineas;
}
export function opcionesDetalleHtmlLineas(it, color = "#a78bfa") {
  const tag = it.estadoItem ? "" : "";
  const lineas = opcionesDetalleLineas(it);
  if (!lineas.length) return tag;
  return tag + lineas.map((l) => `<div class="dm-prod-cat" style="color:${color};">• ${escapeHtml(l)}</div>`).join("");
}
export function seleccionATexto(sel) {
  return Object.entries(sel || {}).map(([k, v]) => {
    const e = entradasDeOpcion(v).map(([n, c]) => (c > 1 ? `${n} x${c}` : n));
    return e.length ? `${k}: ${e.join(", ")}` : null;
  }).filter(Boolean).join(" · ");
}

/* ═════════ DESCUENTOS ═════════ */
export function parseFechaISOaMsLima(fechaISO, horaStr) {
  if (!fechaISO) return null;
  const [y, m, d] = fechaISO.split("-").map(Number);
  if (!y || !m || !d) return null;
  const [hh, mm] = (horaStr || "23:59").split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh||0, mm||0, 0) + 5 * 3600 * 1000;
}
export function parseFechaHoraLimaOferta(fechaStr, horaStr) {
  const [d, m, y] = (fechaStr || "").split("/").map(Number);
  if (!d || !m || !y) return null;
  const [hh, mm] = (horaStr || "23:59").split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh||0, mm||0, 0) + 5 * 3600 * 1000;
}
export function obtenerDiaSemanaLima(fecha = new Date()) {
  const n = new Intl.DateTimeFormat("en-US", { timeZone:"America/Lima", weekday:"long" }).format(fecha).toLowerCase();
  return ({ sunday:"domingo",monday:"lunes",tuesday:"martes",wednesday:"miercoles",
    thursday:"jueves",friday:"viernes",saturday:"sabado" })[n] || null;
}
export function descuentoVigente(descuento, ahora = new Date()) {
  if (!descuento || !descuento.activo) return null;
  const porcentaje = Number(descuento.porcentaje) || 0;
  if (porcentaje <= 0) return null;
  if (descuento.modo === "dias_semana") {
    if (!(descuento.dias || []).includes(obtenerDiaSemanaLima(ahora))) return null;
    return { porcentaje, expiraEn: null };
  }
  if (descuento.modo === "duracion") {
    const exp = Number(descuento.expiraEn) || 0;
    if (!exp || ahora.getTime() >= exp) return null;
    return { porcentaje, expiraEn: exp };
  }
  if (descuento.modo === "fecha") {
    const fin = parseFechaISOaMsLima(descuento.fechaFin, descuento.horaFin || "23:59");
    if (!fin || ahora.getTime() >= fin) return null;
    if (descuento.fechaInicio) {
      const ini = parseFechaISOaMsLima(descuento.fechaInicio, "00:00");
      if (ini && ahora.getTime() < ini) return null;
    }
    return { porcentaje, expiraEn: fin };
  }
  return null;
}

/* ═════════ DISTANCIA / DELIVERY ═════════ */
export function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function horaAMin(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function hora12(s) {
  const n = horaAMin(s); if (n == null) return s || "";
  let h = Math.floor(n/60); const suf = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  return `${h}:${String(n%60).padStart(2,"0")} ${suf}`;
}
function minutosLimaAhora(f = new Date()) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone:"America/Lima", hour:"2-digit", minute:"2-digit", hourCycle:"h23" }).formatToParts(f);
  return Number(p.find(x=>x.type==="hour").value) * 60 + Number(p.find(x=>x.type==="minute").value);
}
function recargoEnHora(r, f = new Date()) {
  if (!r || !r.activo) return 0;
  const monto = Number(r.monto) || 0;
  const ini = horaAMin(r.desde), fin = horaAMin(r.hasta);
  if (monto <= 0 || ini == null || fin == null || ini === fin) return 0;
  const now = minutosLimaAhora(f);
  const dentro = ini < fin ? now >= ini && now < fin : now >= ini || now < fin;
  return dentro ? monto : 0;
}

/* Delivery config (cargada desde Firestore) */
let deliEnabled = localStorage.getItem("geinz_deli_on") === "1";
let deliBase = Number(localStorage.getItem("geinz_deli_base")) || 3;
let deliKmIncl = Number(localStorage.getItem("geinz_deli_km")) || 2;
let deliPorKm = Number(localStorage.getItem("geinz_deli_perkm")) || 1;
let deliHace = true, deliModo = "distancia", deliFija = 5, deliTexto = "";
let deliZonas = [];
let deliRecargo = { activo:false, desde:"20:00", hasta:"06:00", monto:2 };
export let _deliState = {}; // referencia viva
function _syncDeliState() {
  _deliState.enabled = deliEnabled; _deliState.base = deliBase;
  _deliState.kmIncl = deliKmIncl; _deliState.porKm = deliPorKm;
  _deliState.hace = deliHace; _deliState.modo = deliModo;
  _deliState.fija = deliFija; _deliState.texto = deliTexto;
  _deliState.zonas = deliZonas; _deliState.recargo = deliRecargo;
}
_syncDeliState();

export function calcularPrecioDelivery(distKm) {
  if (!PLAN_PED.deliveryCfg) return null;
  if (!deliEnabled || !deliHace) return null;
  const rec = recargoEnHora(deliRecargo);
  if (deliModo === "fija") return deliFija + rec;
  if (deliModo === "zonas") return null;
  const extra = Math.max(0, distKm - deliKmIncl);
  return Math.ceil((deliBase + extra * deliPorKm) * 2) / 2 + rec;
}

/* ═════════ FECHA ═════════ */
export function getDateFilterRange() {
  const ahoraUTC = new Date();
  const limaOffsetMs = -5 * 60 * 60 * 1000;
  const limaAhora = new Date(ahoraUTC.getTime() + limaOffsetMs);
  const y = limaAhora.getUTCFullYear(), m = limaAhora.getUTCMonth(), d = limaAhora.getUTCDate();
  const from = new Date(Date.UTC(y, m, d, 0, 0, 0) - limaOffsetMs);
  const to = new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - limaOffsetMs);
  return [from, to];
}
function pedidoVisible(id, p) {
  const origen = getOrigen(p);
  if (originFilter === "whatsapp" && origen.tipo !== "whatsapp") return false;
  if (originFilter === "mesa") {
    if (origen.tipo !== "mesa") return false;
    if (mesaFilter !== null && origen.numero !== mesaFilter) return false;
  }
  return true;
}

/* ═════════ PLAN / ESTADOS HABILITADOS ═════════ */
export function estadoHabilitado(e) {
  if (!PLAN_PED.estados && ["pendiente_pago","en_pausa"].includes(e)) return false;
  if (["pendiente","en_proceso","listo","entregado","rechazado"].includes(e)) return true;
  return bizDataGlobal?.pedidos_config?.estados?.[e] !== false;
}
export function requierePagoOnline(p) {
  const m = p?.pago?.metodo;
  return getOrigen(p).tipo === "whatsapp" && estadoHabilitado("pendiente_pago") && !!m && m !== "Efectivo";
}
function aplicarEstadosVisibles(grupos) {
  ESTADOS.forEach((e) => {
    const mostrar = estadoHabilitado(e) || (grupos?.[e]?.length > 0);
    document.querySelector(`.stab[data-s="${e}"]`)?.classList.toggle("vista-oculta", !mostrar);
    document.querySelector(`.board-col[data-status="${e}"]`)?.classList.toggle("vista-oculta", !mostrar);
  });
}

/* ═════════ NEGOCIO ═════════ */
export function limpiarDominio(d) {
  if (!d || typeof d !== "string") return null;
  const limpio = d.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return limpio || null;
}
async function resolverAliasNegocio(data) {
  const directo = data?.alias || data?.alias_tienda || data?.alias_url;
  if (directo) return String(directo);
  try {
    const snap = await getDocs(query(collection(db, "alias_tiendas"), where("id","==",tiendaId), limit(1)));
    if (!snap.empty) return snap.docs[0].id;
  } catch {}
  return null;
}
export async function cargarNegocio() {
  try {
    const ref = tiendaDoc(localidad, "tiendas", tiendaId);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : null;
    bizDataGlobal = data;
    if (tiendaId) cachearConfigComprobante(tiendaId, data?.config_comprobante);
    bizDominioGlobal = limpiarDominio(data?.dominio_propio || data?.dominio_personalizado || data?.dominio || data?.custom_domain || null);
    bizAliasGlobal = await resolverAliasNegocio(data);
    bizNombreGlobal = (data?.nombre_tienda || data?.nombre) || "Geinz";
    bizLogoUrl = data?.img_tienda?.logo_tienda || "";
    const ubic = data?.ubicacion;
    if (ubic && typeof ubic.latitud === "number" && typeof ubic.longitud === "number") {
      bizLat = ubic.latitud; bizLng = ubic.longitud;
    }
    document.title = `Pedidos en vivo · ${bizNombreGlobal}`;
    // Delivery config
    const d = data?.delivery;
    if (d) {
      deliHace = d.hace !== false;
      deliEnabled = d.tarifa_activa === true;
      deliModo = d.modo === "fija" ? "fija" : d.modo === "zonas" ? "zonas" : "distancia";
      deliZonas = Array.isArray(d.zonas) ? d.zonas.map(z => ({ nombre: z.nombre||"", precio: Number(z.precio)||0 })) : [];
      deliBase = Number(d.base) || 0;
      deliKmIncl = Number(d.km_incluidos) || 0;
      deliPorKm = Number(d.por_km) || 0;
      deliFija = Number(d.fija) || 0;
      deliTexto = d.texto || "";
      const r = d.recargo || {};
      deliRecargo = { activo: r.activo === true, desde: r.desde || "20:00", hasta: r.hasta || "06:00", monto: Number(r.monto) || 0 };
      _syncDeliState();
    }
  } catch {}
}

/* ═════════ SEGUIDORES ═════════ */
export async function verificarSeguidor(uid) {
  if (!uid) return false;
  if (clientesSeguidoresCache.has(uid)) return clientesSeguidoresCache.get(uid);
  try {
    const snap = await getDoc(data_user_logeado(uid));
    const existe = snap.exists();
    clientesSeguidoresCache.set(uid, existe);
    return existe;
  } catch { return false; }
}
export async function precargarSeguidores() {
  const pendientes = [];
  pedidosMap.forEach((p) => {
    const uid = p.cliente?.id_cliente;
    if (uid && !clientesSeguidoresCache.has(uid)) pendientes.push(uid);
  });
  const unicos = [...new Set(pendientes)];
  if (!unicos.length) return;
  await Promise.all(unicos.map(verificarSeguidor));
  renderBoard();
}

/* ═════════ PUNTOS ═════════ */
const productoPuntosCache = new Map();
const puntosPedidoCache = new Map();
const puntosPedidoCalculando = new Set();

async function obtenerPuntosProducto(categoria, id) {
  const key = `${categoria}::${id}`;
  if (productoPuntosCache.has(key)) return productoPuntosCache.get(key);
  try {
    const ref = tiendaSubDoc(localidad, "tiendas", tiendaId, "productos", categoria, categoria, id);
    const snap = await getDoc(ref);
    const puntos = snap.exists() ? snap.data().puntos || null : null;
    productoPuntosCache.set(key, puntos);
    return puntos;
  } catch { productoPuntosCache.set(key, null); return null; }
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
      if (conf?.activo && Number(conf.cantidad) > 0) total += Number(conf.cantidad) * (Number(it.cantidad) || 0);
    }
    puntosPedidoCache.set(pedidoId, total);
    if (total > 0) renderBoard();
  } finally { puntosPedidoCalculando.delete(pedidoId); }
}
export function getPuntosItemDesdeCache(it) {
  if (!it.id || !it.categoria) return 0;
  const conf = productoPuntosCache.get(`${it.categoria}::${it.id}`);
  if (conf?.activo && Number(conf.cantidad) > 0)
    return Number(conf.cantidad) * (Number(it.cantidad) || 0);
  return 0;
}
export function getPuntosPedido(pedidoId, p) {
  const guardados = Number(p.puntos_ganados) || 0;
  if (guardados > 0) return guardados;
  if (puntosPedidoCache.has(pedidoId)) return puntosPedidoCache.get(pedidoId);
  calcularPuntosPedidoAsync(pedidoId, p);
  return 0;
}

/* ═════════ STOCK ═════════ */
export function playStockAgotadoAlarm() { playSoundOnce(SND_STOCK_AGOTADO); }
export function notificarStockAgotado(nombres) {
  if (!window.Notification || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    new Notification("📦 Producto agotado", {
      body: `${nombres} se quedó sin stock`,
      icon: bizLogoUrl || undefined, badge: bizLogoUrl || undefined,
      tag: "geinz-stock-agotado-" + Date.now(),
    });
  } catch {}
}
export async function descontarStockPedido(pedido) {
  const productos = Array.isArray(pedido.productos) ? pedido.productos : [];
  const agotados = [];
  for (const it of productos) {
    if (!it.id || !it.categoria || it.esPromo) continue;
    const cantidad = Number(it.cantidad) || 0;
    if (cantidad <= 0) continue;
    const prodRef = tiendaSubDoc(localidad, "tiendas", tiendaId, "productos", it.categoria, it.categoria, it.id);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(prodRef);
        if (!snap.exists()) return;
        const data = snap.data();
        const updates = {};
        let agotadoDeEsteItem = null;
        const seleccion = it.opciones || null;
        if (seleccion && typeof seleccion === "object" && Array.isArray(data.condiciones) && data.condiciones.length) {
          updates.condiciones = data.condiciones.map((cond) => {
            const elegidas = entradasDeOpcion(seleccion[cond.nombre]);
            if (!elegidas.length) return cond;
            return { ...cond, opciones: (cond.opciones || []).map((op) => {
              const hit = elegidas.find(([n]) => n === op.nombre);
              if (!hit || typeof op.stock !== "number") return op;
              const nuevo = Math.max(0, op.stock - hit[1] * cantidad);
              if (nuevo <= 0 && op.stock > 0 && !agotadoDeEsteItem)
                agotadoDeEsteItem = { nombre: `${data.nombre || it.nombre} (${op.nombre})`, tipo: "variante" };
              return { ...op, stock: nuevo, activo: nuevo > 0 ? op.activo : false };
            })};
          });
        }
        if (typeof data.stock === "number") {
          const nuevo = Math.max(0, data.stock - cantidad);
          updates.stock = nuevo;
          if (data.autoDesactivar && nuevo <= 0) updates.disponible = false;
          if (nuevo <= 0 && data.stock > 0 && !agotadoDeEsteItem)
            agotadoDeEsteItem = { nombre: data.nombre || it.nombre, tipo: "producto" };
        }
        if (agotadoDeEsteItem) agotados.push(agotadoDeEsteItem);
        if (Object.keys(updates).length) tx.update(prodRef, updates);
      });
    } catch (err) { console.error(`No se pudo descontar stock de "${it.nombre}":`, err); }
  }
  return agotados;
}

/* ═════════ PUNTOS FIDELIZACIÓN ═════════ */
export async function acreditarPuntosCliente(uid, tId, puntosGanados, pedidoId, pedidoActual) {
  const clienteRef = tiendaSubDoc(localidad, "tiendas", tId, "clientes", uid);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(clienteRef);
      const updates = {
        id: uid, id_usuario: uid,
        puntos: increment(puntosGanados),
        ultimo_consumo: serverTimestamp(),
      };
      if (!snap.exists()) updates.fecha_inicio = serverTimestamp();
      tx.set(clienteRef, updates, { merge: true });
    });
    const historialRef = tiendaSubCol(localidad, "tiendas", tId, "clientes", uid, "historial");
    await addDoc(historialRef, {
      tipo: "ganado", pedidoId, fecha: serverTimestamp(),
      total: Number(pedidoActual.total) || 0,
      puntos_ganados: puntosGanados,
      tipo_entrega: pedidoActual.cliente?.tipo_entrega || null,
      productos: (pedidoActual.productos || []).map(it => ({
        id: it.id || null, nombre: it.nombre || "",
        categoria: it.categoria || null, cantidad: it.cantidad || 0,
        precio_unitario: Number(it.precio_unitario) || 0,
        subtotal: Number(it.subtotal) || 0,
      })),
    });
    return true;
  } catch (err) { console.error("No se pudieron acreditar los puntos:", err); return false; }
}
export async function devolverPuntosCuponSiAplica(pedidoId, pedido) {
  const cupon = pedido?.cupon;
  if (!cupon || cupon.origen !== "fidelizacion" || pedido.puntos_cupon_devueltos) return;
  const uid = pedido.cliente?.id_cliente;
  const puntos = Number(cupon.costoPuntos) || 0;
  if (!uid || puntos <= 0) return;
  try {
    await updateDoc(clienteDoc(localidad, tiendaId, uid), { puntos: increment(puntos) });
    if (cupon.codigo)
      await updateDoc(clienteCuponDoc(localidad, tiendaId, uid, cupon.codigo),
        { usado:false, estado:"activo", pedidoId:null }).catch(() => {});
    await addDoc(tiendaSubCol(localidad, "tiendas", tiendaId, "clientes", uid, "historial"), {
      tipo: "devolucion", fecha: serverTimestamp(), puntos,
      concepto: `Pedido rechazado #${pedidoId.slice(0,6).toUpperCase()} · puntos devueltos`,
      pedidoId, codigoCupon: cupon.codigo || null,
    });
    await updateDoc(tiendaSubDoc(localidad, "tiendas", tiendaId, "pedidos", pedidoId), { puntos_cupon_devueltos: true });
    showToast(`↩️ Se devolvieron ${puntos} puntos al cliente`);
  } catch (err) { console.error("No se pudieron devolver los puntos:", err); }
}

/* ═════════ COMPROBANTE ═════════ */
export async function imprimirComprobantePedido(pedido) {
  try {
    const id = pedido.id || pedido.pedidoDocId || null;
    const datos = { ...pedido, id, negocio: { id: tiendaId, nombre: bizNombreGlobal, localidad } };
    const cfg = await prepararCfgComprobante(tiendaId, localidad, datos, { tiendaData: bizDataGlobal, nombre: bizNombreGlobal });
    const numero = await registrarComprobante(tiendaId, localidad, datos, cfg);
    await imprimirComprobante(datos, cfg, { numero });
  } catch (e) { console.error(e); showToast("❌ No se pudo imprimir el comprobante", true); }
}
window.imprimirComprobantePedido = imprimirComprobantePedido;

/* ═════════ ALARMAS / NOTIFICACIONES ═════════ */
export const bellBtn = document.getElementById("bellBtn");
function paintBell() {
  if (!bellBtn) return;
  bellBtn.classList.toggle("on", soundEnabled);
  bellBtn.innerHTML = (soundEnabled ? "🔔" : "🔕") + `<span class="bell-dot" id="bellDot"></span>`;
}
paintBell();
bellBtn?.addEventListener("click", async () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem("geinz_sound_enabled", soundEnabled ? "1" : "0");
  paintBell();
  if (soundEnabled) {
    ensureAudio(); playSoundOnce(SND_NUEVO_PEDIDO);
    if (window.Notification && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch {}
    }
    showToast("🔔 Notificaciones de sonido activadas");
  } else {
    colaAlarmas.length = 0;
    if (alarmaActual) { alarmaActual.audio.pause(); alarmaActual.audio.currentTime = 0; alarmaActual = null; }
    showToast("🔕 Notificaciones de sonido desactivadas");
  }
});
export function bellRingFeedback() {
  if (!bellBtn) return;
  bellBtn.classList.remove("ring");
  void bellBtn.offsetWidth;
  bellBtn.classList.add("ring");
  const dot = document.getElementById("bellDot");
  if (dot) { dot.classList.add("show"); setTimeout(() => dot.classList.remove("show"), 2500); }
}

/* ═════════ NOTIFICACIONES NAVEGADOR ═════════ */
export function notificarPedidoNuevo(p) {
  const cliente = p.cliente || {};
  const productos = Array.isArray(p.productos) ? p.productos : [];
  const totalItems = p.total_items ?? productos.reduce((s,i)=>s+(i.cantidad||0),0);
  const imagen = productos.find((it) => it.imagen)?.imagen || "";
  if (!window.Notification || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    const n = new Notification(`🛎️ Nuevo pedido · ${cliente.nombre||"Cliente"}`, {
      body: `${totalItems} item${totalItems===1?"":"s"} · ${fmtMoney(p.total)} · ${cliente.tipo_entrega||""}`,
      icon: bizLogoUrl || undefined, image: imagen || undefined,
      badge: bizLogoUrl || undefined, tag: "geinz-pedido-"+Date.now(),
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch {}
}
export function notificarRespuestaCliente(p) {
  if (!window.Notification || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    const c = p.cliente || {};
    new Notification(`💬 Respuesta de ${c.nombre||"Cliente"}`, {
      body: "Respondió el pedido en pausa, revisa y confirma.",
      icon: bizLogoUrl || undefined, tag: "geinz-respuesta-pausa-"+Date.now(),
    });
  } catch {}
}
export function notificarPedidoCanceladoPorCliente(p) {
  if (!window.Notification || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    const c = p.cliente || {};
    new Notification(`🚫 Pedido cancelado`, {
      body: `${c.nombre||"Cliente"} canceló su pedido desde el seguimiento.`,
      icon: bizLogoUrl || undefined, tag: "geinz-cancelado-cliente-"+Date.now(),
    });
  } catch {}
}

/* ═════════ TIPO DE CUPÓN: TAGS/TEXTO ═════════ */
export function cuponTagHtml(p) {
  const tipo = getTipoCuponPedido(p);
  if (!tipo) return "";
  const map = {
    canje_puntos: { ico:"🎁", label:"Canje de puntos", bg:"rgba(251,191,36,.15)", col:"#fbbf24" },
    descuento_fidelizacion: { ico:"⭐", label:"Descuento fidelización", bg:"rgba(124,92,255,.15)", col:"#a78bfa" },
    cupon_descuento: { ico:"🎟️", label:"Cupón de descuento", bg:"rgba(34,197,94,.15)", col:"#4ade80" },
  };
  const cfg = map[tipo];
  return `<span class="oc-cupon-tag" style="background:${cfg.bg};color:${cfg.col};">${cfg.ico} ${cfg.label}</span>`;
}
export function origenTagHtml(p) {
  const origen = getOrigen(p);
  if (origen.tipo === "mesa") {
    const alias = origen.nombre || `Mesa ${origen.numero}`;
    return `<span class="oc-origin-tag mesa">🍽️ ${escapeHtml(alias)}</span>`;
  }
  return `<span class="oc-origin-tag">💬 WhatsApp</span>`;
}

/* ═════════ MAPA DELIVERY ═════════ */
function deliPrecioHtmlPedido(p) {
  const d = p.delivery;
  if (!d || d.costo == null) return "";
  if (d.gratis) return `<div class="deli-precio gratis">🚚 Envío gratis (promo del negocio)</div>`;
  return `
    <div class="deli-precio">
      <span>Delivery${d.zona?` · ${escapeHtml(d.zona)}`:""}${d.aprox?" (aprox.)":""}${d.recargo>0?` · incl. recargo +${fmtMoney(d.recargo)}`:""}</span>
      <strong>${fmtMoney(d.costo)}</strong>
    </div>
    <div class="deli-precio total"><span>Total con delivery</span><strong>${fmtMoney(p.total)}</strong></div>`;
}
function deliveryBlockSinMapa(p) {
  if (p.cliente?.tipo_entrega !== "Delivery" || !p.delivery) return "";
  return `<div class="dm-meta-item full"><div class="dm-meta-label">🛵 Delivery</div>${deliPrecioHtmlPedido(p)}</div>`;
}
function mapaDeliveryHTML(p) {
  if (getOrigen(p).tipo === "mesa") return "";
  if (p.cliente?.tipo_entrega !== "Delivery") return "";
  const ubic = p.cliente?.ubicacion;
  if (!ubic || typeof ubic.lat !== "number" || typeof ubic.lng !== "number") return "";
  if (bizLat == null || bizLng == null) return "";
  const distKm = calcularDistanciaKm(bizLat, bizLng, ubic.lat, ubic.lng);
  const mapsUrl = `https://www.google.com/maps?saddr=${bizLat},${bizLng}&daddr=${ubic.lat},${ubic.lng}&output=embed`;
  const envioGratis = p.cupon?.envioGratis === true;
  const precioDeli = calcularPrecioDelivery(distKm);
  let precioHtml = "";
  if (envioGratis) precioHtml = `<div class="deli-precio gratis">🚚 Envío gratis (promo del negocio)</div>`;
  else if (precioDeli !== null) precioHtml = `
    <div class="deli-precio"><span>Costo de delivery</span><strong>${fmtMoney(precioDeli)}</strong></div>
    <div class="deli-precio total"><span>Total + delivery</span><strong>${fmtMoney((Number(p.total)||0)+precioDeli)}</strong></div>`;
  if (p.delivery?.costo != null) precioHtml = deliPrecioHtmlPedido(p);
  return `
    <div class="dm-meta-item full">
      <div class="dm-meta-label">🛵 Distancia al cliente</div>
      <div class="dm-meta-value">${distKm.toFixed(1)} km en línea recta desde el negocio</div>
      ${precioHtml}
      <div class="mapa-delivery-mini" data-maps-url="${escapeHtml(mapsUrl)}">
        <iframe src="${mapsUrl}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
        <div class="mapa-delivery-click-layer">🔍 Toca para ver la ruta completa</div>
      </div>
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
      iframe.onload = () => requestAnimationFrame(() => iframe.classList.add("loaded"));
      overlay.classList.add("show");
      setTimeout(() => { iframe.src = url; }, 120);
    });
  });
}
function cerrarMapaDeliveryFullscreen() {
  const overlay = document.getElementById("mapaDeliveryOverlay");
  const iframe = document.getElementById("mapaDeliveryIframe");
  overlay?.classList.remove("show");
  clearTimeout(cerrarMapaTimer);
  cerrarMapaTimer = setTimeout(() => {
    if (iframe) { iframe.onload = null; iframe.classList.remove("loaded"); iframe.src = "about:blank"; }
  }, 300);
}
document.getElementById("mapaDeliveryClose")?.addEventListener("click", cerrarMapaDeliveryFullscreen);
document.getElementById("mapaDeliveryOverlay")?.addEventListener("click", (e) => {
  if (e.target.id === "mapaDeliveryOverlay") cerrarMapaDeliveryFullscreen();
});

/* ═════════ AUTO-RECHAZO ═════════ */
export let autoRejectEnabled = localStorage.getItem("geinz_autorej_on") === "1";
export let autoRejectMinutes = Number(localStorage.getItem("geinz_autorej_min")) || 5;
const autoRejectingIds = new Set();

function chequearAutoRechazo() {
  if (!autoRejectEnabled || !PLAN_PED.autoOff) return;
  const limiteMs = autoRejectMinutes * 60000;
  const rechazadosAhora = [];
  pedidosMap.forEach((p, id) => {
    const estado = ESTADOS.includes(p.estado) ? p.estado : "pendiente";
    if (estado !== "pendiente") return;
    if (getOrigen(p).tipo !== "whatsapp") return;
    if (autoRejectingIds.has(id)) return;
    const fecha = toDate(p.timestamp);
    if (!fecha) return;
    if (Date.now() - fecha.getTime() >= limiteMs) { autoRejectingIds.add(id); rechazadosAhora.push([id, p]); }
  });
  if (!rechazadosAhora.length) return;
  rechazadosAhora.forEach(([id]) => cambiarEstado(id, "rechazado", null, { auto: true }));
  playSoundOnce(SND_PEDIDO_CANCELADO);
  bellRingFeedback();
  const nombres = rechazadosAhora.map(([, p]) => p.cliente?.nombre || "Cliente").join(", ");
  showToast(rechazadosAhora.length === 1
    ? `⏱️ Pedido de ${nombres} rechazado automáticamente (${autoRejectMinutes} min sin confirmar)`
    : `⏱️ ${rechazadosAhora.length} pedidos rechazados automáticamente por tiempo`, true);
}
setInterval(chequearAutoRechazo, 15000);

/* ═════════ PAUSA MODAL ═════════ */
const _prodDocCache = new Map();
async function obtenerDocProductoPausa(it) {
  if (!it.id || !it.categoria || it.esPromo) return null;
  const key = `${it.categoria}::${it.id}`;
  if (_prodDocCache.has(key)) return _prodDocCache.get(key);
  try {
    const snap = await getDoc(tiendaSubDoc(localidad, "tiendas", tiendaId, "productos", it.categoria, it.categoria, it.id));
    const d = snap.exists() ? snap.data() : null;
    _prodDocCache.set(key, d); return d;
  } catch { return null; }
}
function extrasOpciones(condiciones, seleccion) {
  let t = 0;
  (condiciones || []).forEach((c) => entradasDeOpcion(seleccion?.[c.nombre]).forEach(([n, q]) => {
    const op = (c.opciones || []).find((o) => o.nombre === n);
    if (op?.costoAdicional) t += Number(op.costoAdicional) * q;
  }));
  return t;
}
function textoRespuestaCliente(r) {
  if (r.accion === "reemplazo") return "cambiar por " + (r.producto_elegido?.nombre || "");
  if (r.accion === "cancelado") return "cancelar el pedido";
  if (r.accion === "ajuste")
    return (r.ajustes || []).map(a => `${a.nombre}: ${a.cantidad_pedida} → ${a.cantidad_final}`).join(" · ");
  return "continuar sin ese producto";
}
function abrirModalPausa(id, p) {
  _prodDocCache.clear();
  const productos = Array.isArray(p.productos) ? p.productos : [];
  const body = document.getElementById("pausaBody");
  if (!body) return;
  const inputCss = "width:90px;padding:8px;border-radius:10px;border:1px solid var(--line);background:var(--bg,#0a0a0f);color:#fff;";
  body.innerHTML = `
    <div class="np-opt-label">¿Qué producto(s) no alcanzan?</div>
    <div class="np-opt-row" id="pausaProdRow">
      ${productos.map((it, i) => `<button type="button" class="np-opt-btn" data-idx="${i}">${escapeHtml(it.nombre)} (x${it.cantidad})</button>`).join("")}
    </div>
    <div id="pausaDetalle"></div>
    <div class="np-opt-label">Mensaje para el cliente (opcional)</div>
    <textarea id="pausaMotivo" rows="2" style="width:100%;border-radius:10px;border:1px solid var(--line);background:var(--bg,#0a0a0f);color:#fff;padding:8px;font-size:12.5px;" placeholder="Ej: Solo nos queda 1 pollo entero"></textarea>
    <div class="np-opt-label" style="margin-top:12px;">Tiempo de espera estimado</div>
    <div style="display:flex;gap:8px;">
      <input type="number" id="pausaTiempoValor" min="1" value="15" style="${inputCss}">
      <select id="pausaTiempoUnidad" style="flex:1;padding:8px;border-radius:10px;border:1px solid var(--line);background:var(--bg,#0a0a0f);color:#fff;">
        <option value="minutos">Minutos</option><option value="horas">Horas</option><option value="dias">Días</option>
      </select>
    </div>
    <button id="pausaConfirmarBtn" class="np-confirmar-btn" style="margin-top:14px;">Pausar pedido</button>
  `;
  const seleccionados = new Set();
  const docs = new Map();
  const detalle = body.querySelector("#pausaDetalle");

  async function pintarTarjeta(i) {
    const it = productos[i];
    const d = await obtenerDocProductoPausa(it);
    docs.set(i, d);
    if (!seleccionados.has(i)) return;
    const stockDoc = typeof d?.stock === "number" ? d.stock : null;
    const valorInicial = stockDoc ?? Math.max(0, (Number(it.cantidad) || 1) - 1);
    const conds = d?.condiciones || [];
    const card = document.createElement("div");
    card.dataset.card = i;
    card.style.cssText = "border:1px solid var(--line);border-radius:14px;padding:12px;margin-bottom:12px;background:rgba(255,255,255,.03);";
    card.innerHTML = `
      <div style="font-weight:800;font-size:13px;">${escapeHtml(it.nombre)}</div>
      <div style="font-size:11.5px;color:var(--ink-dim);margin-bottom:8px;">El cliente pidió <b>${it.cantidad}</b></div>
      <div class="np-opt-label">¿Cuántas unidades te quedan?</div>
      <input type="number" data-stock min="0" value="${valorInicial}" style="${inputCss}">
      ${conds.length ? `<div class="np-opt-label" style="margin-top:10px;">Stock por variante</div>` +
        conds.map((c, ci) => `
          <div style="font-size:11.5px;font-weight:700;color:var(--ink-dim);margin:6px 0;">${escapeHtml(c.nombre)}</div>
          ${(c.opciones || []).map((o, oi) => `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;font-size:12.5px;">
              <span>${escapeHtml(o.nombre)}</span>
              <input type="number" min="0" data-c="${ci}" data-o="${oi}" value="${o.activo === false ? 0 : typeof o.stock === "number" ? o.stock : ""}" style="${inputCss}">
            </div>`).join("")}`).join("") : ""}`;
    detalle.appendChild(card);
  }

  body.querySelectorAll("#pausaProdRow .np-opt-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      const idx = Number(btn.dataset.idx);
      if (btn.classList.contains("active")) { seleccionados.add(idx); pintarTarjeta(idx); }
      else { seleccionados.delete(idx); detalle.querySelector(`[data-card="${idx}"]`)?.remove(); }
    });
  });

  document.getElementById("pausaConfirmarBtn").onclick = async () => {
    if (!seleccionados.size) return showToast("Selecciona al menos un producto", true);
    const productosAfectados = [];
    for (const i of seleccionados) {
      const it = productos[i];
      const card = detalle.querySelector(`[data-card="${i}"]`);
      if (!card) return showToast("Espera un segundo, cargando datos del producto…", true);
      const d = docs.get(i);
      const stockDisp = Math.max(0, Number(card.querySelector("[data-stock]").value) || 0);
      let condiciones = null;
      let precioBase = Number(it.precio_unitario) || 0;
      if (d?.condiciones?.length) {
        condiciones = d.condiciones.map((c, ci) => ({
          nombre: c.nombre,
          opciones: (c.opciones || []).map((o, oi) => {
            const v = card.querySelector(`[data-c="${ci}"][data-o="${oi}"]`)?.value;
            return { nombre:o.nombre, costoAdicional: Number(o.costoAdicional)||0,
              stock: v === "" || v == null ? null : Math.max(0, Number(v)||0) };
          }),
        }));
        precioBase = +(precioBase - extrasOpciones(d.condiciones, it.opciones)).toFixed(2);
      }
      productosAfectados.push({
        id: it.id, nombre: it.nombre,
        cantidad_pedida: Number(it.cantidad) || 0,
        stock_disponible: stockDisp, precio_base: precioBase, condiciones,
      });
    }
    const valor = Math.max(1, Number(document.getElementById("pausaTiempoValor").value) || 15);
    const unidad = document.getElementById("pausaTiempoUnidad").value;
    const motivo = document.getElementById("pausaMotivo").value.trim();
    detenerSoundLoopParaPedido(id);
    try {
      const ref = tiendaSubDoc(localidad, "tiendas", tiendaId, "pedidos", id);
      await updateDoc(ref, {
        estado: "en_pausa",
        pausa: { motivo, productos_afectados: productosAfectados,
          tiempo_espera: { valor, unidad },
          estado_anterior: p.estado, creado_en: serverTimestamp(), resuelto: false },
        respuesta_cliente: null,
      });
      showToast("⏸️ Pedido puesto en pausa");
      document.getElementById("pausaOverlay")?.classList.remove("show");
    } catch { showToast("❌ No se pudo pausar el pedido", true); }
  };
  document.getElementById("pausaOverlay")?.classList.add("show");
}
document.getElementById("pausaClose")?.addEventListener("click", () => document.getElementById("pausaOverlay")?.classList.remove("show"));
document.getElementById("pausaOverlay")?.addEventListener("click", (e) => {
  if (e.target.id === "pausaOverlay") document.getElementById("pausaOverlay").classList.remove("show");
});

/* ═════════ MODAL TIEMPO ═════════ */
function abrirModalTiempo(id, p, btnEl) {
  const overlay = document.getElementById("tiempoOverlay");
  const minutosInput = document.getElementById("tiempoMinutos");
  const omitirCheck = document.getElementById("tiempoOmitir");
  minutosInput.value = 20; omitirCheck.checked = false; minutosInput.disabled = false;
  omitirCheck.onchange = () => (minutosInput.disabled = omitirCheck.checked);
  document.getElementById("tiempoConfirmar").onclick = () => {
    const omitir = omitirCheck.checked;
    const minutos = omitir ? null : Math.max(1, Number(minutosInput.value) || 20);
    overlay.classList.remove("show");
    cambiarEstado(id, "en_proceso", btnEl, { tiempoEstimadoMin: minutos });
  };
  overlay.classList.add("show");
}
document.getElementById("tiempoClose")?.addEventListener("click", () => document.getElementById("tiempoOverlay")?.classList.remove("show"));
document.getElementById("tiempoOverlay")?.addEventListener("click", (e) => {
  if (e.target.id === "tiempoOverlay") e.target.classList.remove("show");
});

/* ═════════ NOTIFICAR CAMBIO AL CLIENTE ═════════ */
function labelEstadoParaCliente(estado) {
  return ({
    pendiente: "Tu pedido está pendiente de confirmación",
    en_proceso: "¡Tu pedido está en preparación!",
    en_pausa: "Tu pedido está en pausa, revisa los detalles",
    entregado: "¡Tu pedido fue entregado! Gracias por tu compra",
    rechazado: "Tu pedido fue rechazado",
    pendiente_pago: "¡Tu pedido fue aceptado! Sube tu comprobante de pago para que lo preparemos",
    listo: "¡Tu pedido está listo! Puedes recogerlo en el local",
  })[estado] || "El estado de tu pedido cambió";
}
async function notificarCambioEstadoAlCliente(pedido, nuevoEstado) {
  if (!URL_NOTIFICAR_CLIENTE) return;
  const idUser = pedido?.cliente?.id_cliente;
  if (!idUser) return;
  try {
    await fetch(URL_NOTIFICAR_CLIENTE, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_user: idUser, title: bizNombreGlobal || "Geinz",
        body: labelEstadoParaCliente(nuevoEstado),
        logo: bizLogoUrl || "", id_tienda: tiendaId || "",
        tipo_notificacion: "logo", prioridad: "high",
      }),
    });
  } catch {}
}

/* ═════════ CAMBIO DE ESTADO ═════════ */
export async function cambiarEstado(pedidoId, nuevoEstado, btnEl, opts = {}) {
  if (btnEl) btnEl.disabled = true;
  detenerSoundLoopParaPedido(pedidoId);
  try {
    const ref = tiendaSubDoc(localidad, "tiendas", tiendaId, "pedidos", pedidoId);
    const payload = { estado: nuevoEstado, actualizado: serverTimestamp() };
    if (nuevoEstado !== "rechazado") { payload.auto_rechazado = false; payload.cancelado_por_cliente = false; }
    if (opts.auto) payload.auto_rechazado = true;
    if (nuevoEstado === "en_proceso" && "tiempoEstimadoMin" in opts) {
      payload.tiempo_estimado_min = opts.tiempoEstimadoMin;
      payload.tiempo_estimado_desde = serverTimestamp();
    }
    if (nuevoEstado === "pendiente_pago") payload.pago_solicitado_en = serverTimestamp();
    if (opts.tiempo) {
      const esDel = pedidosMap.get(pedidoId)?.cliente?.tipo_entrega === "Delivery";
      payload.tiempo_estimado = { min: opts.tiempo.min, max: opts.tiempo.max, tipo: esDel ? "delivery" : "recojo" };
    }
    if (nuevoEstado === "en_proceso") payload.tiempo_estimado_desde = serverTimestamp();
    await updateDoc(ref, payload);
    if (!opts.auto) showToast(`Pedido movido a ${labelEstado(nuevoEstado)}`);
    const pedidoParaNotificar = pedidosMap.get(pedidoId);
    if (pedidoParaNotificar) notificarCambioEstadoAlCliente(pedidoParaNotificar, nuevoEstado);

    if (nuevoEstado === "en_proceso" || nuevoEstado === "entregado") {
      const pedidoActual = pedidosMap.get(pedidoId);
      if (pedidoActual && !pedidoActual.stock_descontado) {
        descontarStockPedido(pedidoActual).then((agotados) => {
          updateDoc(ref, { stock_descontado: true });
          if (agotados && agotados.length) {
            playStockAgotadoAlarm(); bellRingFeedback();
            const nombres = agotados.map((a) => a.nombre).join(", ");
            showToast(`📦 Sin stock: ${nombres}`, true);
            notificarStockAgotado(nombres);
          }
        }).catch((err) => console.error("Error descontando stock:", err));
      }
    }
    if (nuevoEstado === "entregado") {
      const pedidoActual = pedidosMap.get(pedidoId);
      if (pedidoActual && !pedidoActual.puntos_acreditados) {
        const uid = pedidoActual.cliente?.id_cliente;
        const puntosGanados = Number(pedidoActual.puntos_ganados) || puntosPedidoCache.get(pedidoId) || 0;
        if (uid && puntosGanados > 0) {
          (async () => {
            try {
              await updateDoc(data_user_logeado(uid), { [`puntos.${tiendaId}`]: increment(puntosGanados) });
              await acreditarPuntosCliente(uid, tiendaId, puntosGanados, pedidoId, pedidoActual);
              await updateDoc(ref, { puntos_acreditados: true });
            } catch (err) { console.error("No se pudieron acreditar los puntos:", err); }
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

/* ═════════ DETALLE / TARJETAS / TABLERO ═════════ */
const ICONOS_ENTREGA = { Delivery: "🛵", "Recojo en local": "🏬", "En mesa": "🍽️" };
const ICONOS_PAGO = { "Yape / Plin": "📱", Efectivo: "💵" };

function detalleCuponHtml(p) {
  const tipo = getTipoCuponPedido(p);
  if (!tipo) return "";
  const c = p.cupon || {};
  const productos = Array.isArray(p.productos) ? p.productos : [];
  const prodCanjeado = productos.find(it => it.esCanje) || (c.productoId ? productos.find(it => it.id === c.productoId) : null);
  const descuento = Number(p.descuentoCupon) || 0;
  const total = Number(p.total) || 0;
  const subtotal = Number(p.subtotal) || total + descuento;
  const pctEfectivo = subtotal > 0 ? (descuento / subtotal) * 100 : 0;
  const map = {
    canje_puntos: { titulo:"🎁 Canje de puntos", bg:"rgba(251,191,36,.08)", bd:"rgba(251,191,36,.3)", col:"#fbbf24" },
    descuento_fidelizacion: { titulo:"⭐ Descuento por fidelización", bg:"rgba(124,92,255,.08)", bd:"rgba(124,92,255,.3)", col:"#a78bfa" },
    cupon_descuento: { titulo:"🎟️ Cupón de descuento", bg:"rgba(34,197,94,.08)", bd:"rgba(34,197,94,.3)", col:"#4ade80" },
  };
  const cfg = map[tipo];
  const filas = [];
  if (c.codigo) filas.push(`<div class="dm-cupon-row"><span>Código</span><span class="mono">${escapeHtml(c.codigo)}</span></div>`);
  filas.push(`<div class="dm-cupon-row"><span>Origen</span><span>${c.origen==="fidelizacion"?"Fidelización":"Cupón del negocio"}</span></div>`);
  if (tipo === "canje_puntos" && prodCanjeado) {
    filas.push(`<div class="dm-cupon-row"><span>Producto canjeado</span><span>${escapeHtml(prodCanjeado.nombre)}</span></div>`);
    filas.push(`<div class="dm-cupon-row" style="border-top:1px dashed rgba(251,191,36,.25);padding-top:6px;"><span style="font-weight:800;">Puntos descontados</span><span style="color:#fbbf24;font-weight:800;">-${Number(c.costoPuntos)||0} pts</span></div>`);
  } else {
    filas.push(`<div class="dm-cupon-row"><span>Subtotal sin descuento</span><span>${fmtMoney(subtotal)}</span></div>`);
    filas.push(`<div class="dm-cupon-row" style="border-top:1px dashed rgba(74,222,128,.25);padding-top:6px;"><span style="font-weight:800;">Descuento</span><span style="color:#4ade80;font-weight:800;">-${fmtMoney(descuento)} (${pctEfectivo.toFixed(1)}%)</span></div>`);
    filas.push(`<div class="dm-cupon-row"><span style="font-weight:800;">Total</span><span style="font-weight:800;">${fmtMoney(total)}</span></div>`);
  }
  return `<div class="dm-cupon-card" style="background:${cfg.bg};border:1px solid ${cfg.bd};">
    <p style="color:${cfg.col};font-weight:800;font-size:12.5px;margin-bottom:8px;">${cfg.titulo}</p>
    ${filas.join("")}
    <p style="font-size:10.5px;color:var(--ink-faint);margin-top:8px;">⚠️ Verifica este descuento antes de aceptar.</p>
  </div>`;
}

function bloquesHtml(bloques) {
  return bloques.map((bloque, idx) => `
    <div style="margin-bottom:12px;">
      <div class="dm-prod-cat" style="margin-bottom:6px;">${idx===0?"Pedido inicial":"Agregado"} · ${escapeHtml(bloque.hora)}${bloque.mesaOrigenNombre?` · 🪑 ${escapeHtml(bloque.mesaOrigenNombre)}`:""}</div>
      <div class="dm-products">
        ${bloque.items.map((it) => {
          const pts = getPuntosItemDesdeCache(it);
          return `<div class="dm-prod-row">
            <div>
              <div class="dm-prod-name">${escapeHtml(it.nombre)}</div>
              ${opcionesDetalleHtmlLineas(it)}
              <div class="dm-prod-qty">${it.cantidad} × S/ ${Number(it.precio_unitario||0).toFixed(2)} c/u</div>
              ${pts>0?`<div style="font-size:10.5px;font-weight:700;color:#fbbf24;margin-top:2px;">🎁 +${pts} pts</div>`:""}
            </div>
            <div class="dm-prod-price">S/ ${Number(it.subtotal||0).toFixed(2)}</div>
          </div>`;
        }).join("")}
      </div>
    </div>`).join("");
}

export function buildCard(id, p) {
  const estado = ESTADOS.includes(p.estado) ? p.estado : "pendiente";
  const fecha = toDate(p.timestamp);
  const tsMs = fecha ? fecha.getTime() : null;
  const cliente = p.cliente || {};
  const productos = Array.isArray(p.productos) ? p.productos : [];
  const totalItems = p.total_items ?? productos.reduce((s,i)=>s+(i.cantidad||0),0);
  const entregaIco = ICONOS_ENTREGA[cliente.tipo_entrega] || "📦";
  const esUrgente = estado === "pendiente" && autoRejectEnabled && tsMs && (Date.now()-tsMs)/60000 >= autoRejectMinutes*0.7;
  const card = document.createElement("div");
  const voucherPendienteVer = !!p.pago?.voucher_url && !p.pago?.voucher_visto;
  const enLocalPend = !!p.cliente_en_local && !p.cliente_en_local_visto;
  card.className = "order-card" + (voucherPendienteVer?" oc-pago-recibido":"") + (enLocalPend?" oc-en-local":"");
  card.id = `order-${id}`;
  const hitArea = document.createElement("div");
  hitArea.className = "oc-hit";
  const esSeguidor = clientesSeguidoresCache.get(cliente.id_cliente) === true;
  hitArea.innerHTML = `
    <div class="oc-top">
      <span class="oc-id mono">#${id.slice(0,6).toUpperCase()}</span>
      <span class="oc-time${esUrgente?" urgent":""}" ${tsMs?`data-ts="${tsMs}"`:""}><span class="pulse"></span><span class="ts-label">${fecha?timeAgo(fecha):"—"}</span></span>
    </div>
    <div class="oc-name">${escapeHtml(cliente.nombre||"Cliente sin nombre")}${esSeguidor?` <span style="font-size:10px;font-weight:800;color:#7c5cff;background:rgba(124,92,255,.15);padding:2px 7px;border-radius:999px;">⭐ Seguidor</span>`:""}</div>
    <div class="oc-entrega-line">${entregaIco} ${escapeHtml(cliente.tipo_entrega||"Sin especificar")}</div>
    ${cliente.whatsapp?`<div style="font-size:11px;font-weight:700;color:#25d366;margin-top:2px;">📱 ${escapeHtml(cliente.whatsapp)}</div>`:""}
    ${p.cliente_en_local?`<div style="font-size:11px;font-weight:800;color:#ec4899;margin-top:2px;">📍 Cliente en el local</div>`:""}
    ${getPuntosPedido(id, p)>0?`<div style="font-size:11px;font-weight:700;color:#fbbf24;margin-top:2px;">🎁 +${getPuntosPedido(id, p)} pts al cliente</div>`:""}
    ${Number(p.descuentoCupon)>0?`<div style="font-size:11px;font-weight:700;color:#4ade80;margin-top:2px;">🏷️ Descuento aplicado: -${fmtMoney(p.descuentoCupon)}</div>`:""}
    ${p.tiempo_estimado?`<div style="font-size:11px;font-weight:700;color:#a78bfa;margin-top:2px;">⏱️ ${p.tiempo_estimado.min}–${p.tiempo_estimado.max} min</div>`:""}
    <div class="oc-summary">
      <span class="oc-summary-left">${origenTagHtml(p)}${cuponTagHtml(p)}</span>
      <div class="oc-summary-right">
        <span class="oc-summary-total">${fmtMoney(p.total)}</span>
        <span class="oc-chevron">›</span>
      </div>
    </div>`;
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
    const destino = requierePagoOnline(p) ? "pendiente_pago" : "en_proceso";
    const txt = requierePagoOnline(p) ? "Aceptar y pedir pago →" : "Aceptar →";
    const pts = getPuntosPedido(id, p);
    container.innerHTML = `
      ${pts>0?`<div class="oc-puntos-aceptar" style="width:100%;">🎁 Al aceptar, el cliente ganará <strong>+${pts} puntos</strong></div>`:""}
      <div class="oc-actions">
        <button class="oc-btn ghost danger" data-action="rechazado">✕ Rechazar</button>
        <button class="oc-btn ghost" data-action="_pausar">⏸️ Pausar</button>
        <button class="oc-btn primary v-violet" data-action="${destino}">${txt}</button>
      </div>`;
  } else if (estado === "pendiente_pago") {
    const tieneVoucher = !!p.pago?.voucher_url;
    container.innerHTML = `
      <div class="oc-final-tag" style="width:100%;background:rgba(251,191,36,.12);color:#fbbf24;">
        ${tieneVoucher?"💸 Comprobante recibido, revísalo":"⏳ Esperando comprobante del cliente"}
      </div>
      <div class="oc-actions" style="margin-top:8px;">
        <button class="oc-btn ghost danger" data-action="rechazado">✕ Rechazar</button>
        <button class="oc-btn ghost" data-action="_pausar">⏸️ Pausar</button>
        <button class="oc-btn primary v-green" data-action="en_proceso" ${tieneVoucher?"":"disabled"}>✅ Confirmar pago</button>
      </div>`;
  } else if (estado === "en_proceso") {
    container.innerHTML = `
      <div class="oc-actions">
        <button class="oc-btn ghost" data-action="${requierePagoOnline(p)?"pendiente_pago":"pendiente"}">← Atrás</button>
        <button class="oc-btn primary v-green" data-action="listo">Listo ✓</button>
      </div>`;
  } else if (estado === "listo") {
    container.innerHTML = `
      <div class="oc-final-tag" style="width:100%;background:rgba(45,212,191,.12);color:#2dd4bf;">🛎️ Listo${p.cliente_en_local?" · 📍 cliente en el local":""}</div>
      <div class="oc-actions" style="margin-top:8px;">
        <button class="oc-btn ghost" data-action="en_proceso">← Atrás</button>
        <button class="oc-btn primary v-green" data-action="entregado">Entregado ✓</button>
      </div>`;
  } else if (estado === "en_pausa") {
    const r = p.respuesta_cliente;
    container.innerHTML = `
      <div class="oc-final-tag" style="width:100%;background:rgba(56,189,248,.12);color:#38bdf8;">⏸️ Pedido en pausa</div>
      ${r ? `<div style="width:100%;font-size:12.5px;color:#38bdf8;padding:6px 2px;">Cliente eligió: <strong>${escapeHtml(textoRespuestaCliente(r))}</strong>`
         : `<div style="width:100%;font-size:12px;color:var(--ink-faint);padding:6px 2px;">Esperando respuesta del cliente…</div>`}
      <button class="oc-btn ghost danger" style="width:100%;margin:10px 0;" data-action="rechazado">✕ Cancelar pedido</button>
      <button class="oc-btn primary v-violet" style="width:100%;" data-action="en_proceso">▶️ Reanudar pedido</button>`;
  } else if (estado === "entregado") {
    container.innerHTML = `
      <div class="oc-final-row"><div class="oc-final-tag">✅ Entregado</div>
        <span class="oc-undo" data-action="en_proceso">↺ Reabrir</span></div>`;
  } else if (estado === "rechazado") {
    const auto = !!p.auto_rechazado;
    const canceladoCliente = !!p.cancelado_por_cliente;
    const tagTexto = canceladoCliente ? "🚫 Cancelado por el cliente" : auto ? "⏱️ Auto-rechazado" : "✕ Rechazado";
    container.innerHTML = `
      <div class="oc-final-row">
        <div class="oc-final-tag${auto?" auto":""}">${tagTexto}</div>
        <span class="oc-undo" data-action="pendiente">↺ Reactivar</span>
      </div>`;
  }
  container.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (btn.dataset.action === "_pausar") return abrirModalPausa(id, p);
      accionEstado(id, p, estado, btn.dataset.action, btn);
    });
  });
}

/* ═════════ DETALLE MODAL ═════════ */
const detailOverlay = document.getElementById("detailOverlay");
const detailModal = document.getElementById("detailModal");

export function openDetail(id) {
  activeModalId = id;
  renderDetail(id);
  detailOverlay.classList.add("show");
  requestAnimationFrame(() => detailModal.classList.add("show"));
  document.body.style.overflow = "hidden";
  const p = pedidosMap.get(id);
  if (p?.pago?.voucher_url && !p.pago?.voucher_visto)
    updateDoc(tiendaSubDoc(localidad, "tiendas", tiendaId, "pedidos", id), { "pago.voucher_visto": true }).catch(() => {});
  if (p?.cliente_en_local && !p.cliente_en_local_visto)
    updateDoc(tiendaSubDoc(localidad, "tiendas", tiendaId, "pedidos", id), { cliente_en_local_visto: true }).catch(() => {});
}
export function closeDetail() {
  detailModal.classList.remove("show");
  detailOverlay.classList.remove("show");
  document.body.style.overflow = "";
  activeModalId = null;
}
document.getElementById("dmClose").addEventListener("click", closeDetail);
detailOverlay.addEventListener("click", (e) => { if (e.target === detailOverlay) closeDetail(); });

function linkSeguimientoPedido(id, p) {
  let base;
  if (bizDominioGlobal) base = `https://${bizDominioGlobal}/pedido/${id}`;
  else if (bizAliasGlobal) base = `https://geinztech.com/perfil/${encodeURIComponent(bizAliasGlobal)}/${id}`;
  else base = `https://geinztech.com/pedidos/${tiendaId}/${id}`;
  const token = !p.cliente?.id_cliente && p.token_seguimiento ? `?t=${encodeURIComponent(p.token_seguimiento)}` : "";
  return base + token;
}
function codigoCortoPedido(id) { return id.slice(0, 6).toUpperCase(); }

export function renderDetail(id) {
  const p = pedidosMap.get(id);
  if (!p) return false;
  const estado = ESTADOS.includes(p.estado) ? p.estado : "pendiente";
  const fecha = toDate(p.timestamp);
  const tsMs = fecha ? fecha.getTime() : null;
  const cliente = p.cliente || {};
  const pago = p.pago || {};
  const productos = Array.isArray(p.productos) ? p.productos : [];
  const totalItems = p.total_items ?? productos.reduce((s,i)=>s+(i.cantidad||0),0);
  const entregaIco = ICONOS_ENTREGA[cliente.tipo_entrega] || "📦";
  const pagoIco = ICONOS_PAGO[pago.metodo] || "💳";
  const origen = getOrigen(p);
  const waLimpio = String(cliente.whatsapp || "").replace(/[^\d]/g, "");
  const linkPedido = linkSeguimientoPedido(id, p);
  const mensajeWa = `Hola ${cliente.nombre||""}, te escribimos de ${bizNombreGlobal} por tu pedido #${id.slice(0,6).toUpperCase()}. Puedes ver el estado aquí:\n${linkPedido}`;
  const whatsappBlock = waLimpio ? `<div class="dm-meta-item full">
    <div class="dm-meta-label">📱 WhatsApp del cliente</div>
    <div class="dm-meta-value">${escapeHtml(cliente.whatsapp)} · <a href="https://wa.me/${waLimpio}?text=${encodeURIComponent(mensajeWa)}" target="_blank" rel="noopener" style="color:#25d366;font-weight:800;">Escribir →</a></div>
  </div>` : "";
  detailModal.dataset.status = estado;
  document.getElementById("dmId").innerHTML = `#${id.slice(0,8).toUpperCase()} ${origenTagHtml(p)}${cuponTagHtml(p)}`;
  const esSeguidor = clientesSeguidoresCache.get(cliente.id_cliente) === true;
  document.getElementById("dmName").innerHTML = `${escapeHtml(cliente.nombre||"Cliente sin nombre")}${esSeguidor?` <span style="font-size:10px;font-weight:800;color:#7c5cff;background:rgba(124,92,255,.15);padding:2px 7px;border-radius:999px;">⭐ Seguidor</span>`:""}`;
  const dmTime = document.getElementById("dmTime");
  if (tsMs) { dmTime.dataset.ts = tsMs; dmTime.innerHTML = `<span class="pulse"></span><span class="ts-label">${timeAgo(fecha)}</span>`; }
  else { dmTime.removeAttribute("data-ts"); dmTime.innerHTML = `<span class="pulse"></span><span class="ts-label">—</span>`; }
  const fechaHora = [p.fecha, p.hora].filter(Boolean).join(" · ");
  const prodRows = productos.map((it) => {
    const pts = getPuntosItemDesdeCache(it);
    return `<div class="dm-prod-row">
      <div>
        <div class="dm-prod-name">${escapeHtml(it.nombre)}</div>
        ${it.categoria?`<div class="dm-prod-cat">${escapeHtml(it.categoria)}</div>`:""}
        ${opcionesDetalleHtmlLineas(it)}
        <div class="dm-prod-qty">${it.cantidad} × S/ ${Number(it.precio_unitario||0).toFixed(2)} c/u</div>
        ${pts>0?`<div style="font-size:10.5px;font-weight:700;color:#fbbf24;margin-top:2px;">🎁 +${pts} pts</div>`:""}
      </div>
      <div class="dm-prod-price">S/ ${Number(it.subtotal ?? it.precio_unitario*it.cantidad ?? 0).toFixed(2)}</div>
    </div>`;
  }).join("") || `<p style="font-size:12.5px;color:var(--ink-faint);padding:6px 2px;">Sin productos registrados</p>`;
  const autoNote = estado === "rechazado" && p.auto_rechazado
    ? `<div class="dm-meta-item full"><div class="dm-meta-label">⏱️ Motivo</div><div class="dm-meta-value">Rechazado automáticamente por superar ${autoRejectMinutes} min</div></div>` : "";
  const mesaInfoBlock = origen.tipo === "mesa" ? `<div class="dm-meta-item">
    <div class="dm-meta-label">🍽️ Mesa</div>
    <div class="dm-meta-value">${escapeHtml(origen.nombre || "Mesa " + origen.numero)}</div></div>` : "";
  const voucherBlock = p.pago?.voucher_url ? `<div class="dm-meta-item full">
    <div class="dm-meta-label">💸 Comprobante de pago</div>
    <a href="${escapeHtml(p.pago.voucher_url)}" target="_blank" rel="noopener">
      <img src="${escapeHtml(p.pago.voucher_url)}" style="width:100%;max-width:220px;border-radius:12px;margin-top:6px;border:1px solid var(--line);display:block;">
    </a></div>` : "";
  document.getElementById("dmBody").innerHTML = `
    ${detalleCuponHtml(p)}
    <div>
      <div class="dm-section-title">Datos del pedido</div>
      <div class="dm-meta-grid">
        <div class="dm-meta-item"><div class="dm-meta-label">🗓️ Fecha y hora</div>
          <div class="dm-meta-value">${escapeHtml(fechaHora || "Sin registrar")}</div></div>
        ${mesaInfoBlock}
        <div class="dm-meta-item"><div class="dm-meta-label">${entregaIco} Tipo de entrega</div>
          <div class="dm-meta-value">${escapeHtml(cliente.tipo_entrega || "Sin especificar")}</div></div>
        ${cliente.tipo_entrega === "Delivery" ? `<div class="dm-meta-item full">
          <div class="dm-meta-label">📍 Dirección de entrega</div>
          <div class="dm-meta-value ${cliente.direccion?"":"dim"}">${cliente.direccion?escapeHtml(cliente.direccion):"Sin dirección registrada"}</div></div>` : ""}
        ${whatsappBlock}
        <div class="dm-meta-item"><div class="dm-meta-label">${pagoIco} Método de pago</div>
          <div class="dm-meta-value">${escapeHtml(pago.metodo||"Sin especificar")}</div></div>
        <div class="dm-meta-item"><div class="dm-meta-label">💰 Vuelto</div>
          <div class="dm-meta-value ${pago.metodo==="Efectivo" && pago.vuelto?"":"dim"}">${pago.metodo==="Efectivo"&&pago.vuelto?"Paga con S/ "+escapeHtml(pago.vuelto):"No aplica"}</div></div>
        ${voucherBlock}
        ${mapaDeliveryHTML(p) || deliveryBlockSinMapa(p)}
        <div class="dm-meta-item full"><div class="dm-meta-label">📝 Nota del cliente</div>
          <div class="dm-meta-value ${p.nota?"":"dim"}">${p.nota?escapeHtml(p.nota):"Sin especificaciones adicionales"}</div></div>
        ${autoNote}
      </div>
    </div>
    <div>
      <div class="dm-section-title">Productos · ${totalItems} item${totalItems===1?"":"s"}</div>
      ${origen.tipo==="mesa" && Array.isArray(p.bloques) && p.bloques.length
        ? bloquesHtml(p.bloques)
        : `<div class="dm-products">${prodRows}</div>`}
    </div>
    <div class="dm-total-row">
      <span class="dm-total-lbl">Total del pedido</span>
      <span class="dm-total-val">${fmtMoney(p.total)}</span>
    </div>`;
  bindMapaDeliveryClicks();
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
    const pts = getPuntosPedido(id, p);
    const destino = requierePagoOnline(p) ? "pendiente_pago" : "en_proceso";
    const txt = requierePagoOnline(p) ? "Aceptar y pedir pago →" : "Aceptar pedido →";
    container.innerHTML = `
      ${pts>0?`<div class="oc-puntos-aceptar" style="width:100%;">🎁 Al aceptar, el cliente ganará <strong>+${pts} puntos</strong></div>`:""}
      <button class="oc-btn ghost danger" data-action="rechazado">✕ Rechazar pedido</button>
      <button class="oc-btn ghost" data-action="_pausar">⏸️ Pausar pedido</button>
      <button class="oc-btn primary v-violet" data-action="${destino}">${txt}</button>`;
  } else if (estado === "pendiente_pago") {
    const tv = !!p.pago?.voucher_url;
    container.innerHTML = `
      <div class="oc-final-tag" style="width:100%;background:rgba(251,191,36,.12);color:#fbbf24;">${tv?"💸 Comprobante recibido":"⏳ Esperando comprobante"}</div>
      <button class="oc-btn ghost danger" data-action="rechazado">✕ Rechazar pedido</button>
      <button class="oc-btn ghost" data-action="_pausar">⏸️ Pausar pedido</button>
      <button class="oc-btn primary v-green" data-action="en_proceso" ${tv?"":"disabled"}>✅ Confirmar pago</button>`;
  } else if (estado === "en_proceso") {
    container.innerHTML = `
      <button class="oc-btn ghost" data-action="pendiente">← Volver a pendiente</button>
      <button class="oc-btn ghost" data-action="_pausar">⏸️ Pausar pedido</button>
      <button class="oc-btn primary v-green" data-action="listo">Marcar listo ✓</button>`;
  } else if (estado === "listo") {
    container.innerHTML = `
      <div class="oc-final-tag" style="width:100%;background:rgba(45,212,191,.12);color:#2dd4bf;">🛎️ Pedido listo${p.cliente_en_local?" · 📍 cliente en el local":""}</div>
      <button class="oc-btn ghost" data-action="en_proceso">← Volver a en proceso</button>
      <button class="oc-btn primary v-green" data-action="entregado">Marcar entregado ✓</button>`;
  } else if (estado === "en_pausa") {
    const r = p.respuesta_cliente;
    container.innerHTML = `
      <div class="oc-final-tag" style="width:100%;background:rgba(56,189,248,.12);color:#38bdf8;">⏸️ Pedido en pausa</div>
      ${r ? `<div style="width:100%;font-size:12.5px;color:#38bdf8;padding:6px 2px;">Cliente eligió: <strong>${escapeHtml(textoRespuestaCliente(r))}</strong>`
         : `<div style="width:100%;font-size:12px;color:var(--ink-faint);padding:6px 2px;">Esperando respuesta del cliente…</div>`}
      <button class="oc-btn ghost danger" style="width:100%;" data-action="rechazado">✕ Cancelar pedido</button>
      <button class="oc-btn primary v-violet" style="width:100%;" data-action="en_proceso">▶️ Reanudar pedido</button>`;
  } else if (estado === "entregado") {
    container.innerHTML = `
      <div class="oc-final-tag" style="width:100%;">✅ Este pedido ya fue entregado</div>
      <button class="oc-btn ghost" style="width:100%;" data-action="_comprobante">🖨️ Imprimir comprobante</button>
      <div class="dm-undo-row" style="width:100%;"><span class="oc-undo" data-action="en_proceso">↺ Reabrir pedido</span></div>`;
  } else if (estado === "rechazado") {
    const auto = !!p.auto_rechazado;
    const cc = !!p.cancelado_por_cliente;
    const tagTexto = cc ? "🚫 Cancelado por el cliente" : auto ? "⏱️ Rechazado automáticamente" : "✕ Este pedido fue rechazado";
    container.innerHTML = `
      <div class="oc-final-tag${auto?" auto":""}" style="width:100%;">${tagTexto}</div>
      <div class="dm-undo-row" style="width:100%;"><span class="oc-undo" data-action="pendiente">↺ Reactivar pedido</span></div>`;
  }
  if (!estadoHabilitado("en_pausa")) container.querySelector('[data-action="_pausar"]')?.remove();
  container.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation?.();
      if (btn.dataset.action === "_pausar") return abrirModalPausa(id, p);
      if (btn.dataset.action === "_comprobante") return imprimirComprobantePedido({ id, ...p });
      if (btn.dataset.action === "_aceptar") return abrirModalTiempo(id, p, btn);
      accionEstado(id, p, estado, btn.dataset.action, btn);
    });
  });
}

/* ═════════ TIEMPOS ESTIMADOS ═════════ */
function getTiemposCfg() {
  const t = bizDataGlobal?.tiempos_estimados || {};
  const rango = (r, dMin, dMax) => ({ min: Number(r?.min)||dMin, max: Number(r?.max)||dMax });
  return {
    activo: PLAN_PED.tiempos && t.activo !== false,
    delivery: rango(t.delivery, 20, 30),
    recojo: rango(t.recojo, 10, 15),
  };
}
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
        <p class="dlv-cfg-sub">${esDelivery?"🛵 Delivery":"🏬 Recojo"} · Se lo mostramos al cliente.</p>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="number" id="ptMin" class="deli-inp" min="1" value="${base.min}" style="flex:1"><span>a</span>
          <input type="number" id="ptMax" class="deli-inp" min="1" value="${base.max}" style="flex:1"><span>min</span>
        </div>
        <button type="button" class="np-confirmar-btn" id="ptOk" style="margin-top:16px;">Confirmar y aceptar</button>
        <button type="button" class="oc-btn ghost" id="ptKeep" style="width:100%;margin-top:8px;">Mantener el tiempo actual</button>
      </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add("show"));
    const cerrar = (val) => { ov.classList.remove("show"); setTimeout(() => ov.remove(), 300); resolve(val); };
    ov.addEventListener("click", (e) => { if (e.target === ov || e.target.hasAttribute("data-x")) cerrar(null); });
    ov.querySelector("#ptKeep").onclick = () => cerrar({});
    ov.querySelector("#ptOk").onclick = () => {
      const min = Math.max(1, Math.round(Number(ov.querySelector("#ptMin").value) || 1));
      const max = Math.max(1, Math.round(Number(ov.querySelector("#ptMax").value) || 1));
      if (max < min) return showToast("El máximo no puede ser menor que el mínimo", true);
      cerrar({ min, max });
    };
  });
}
async function accionEstado(id, p, estado, accion, btn) {
  const pide = PLAN_PED.tiempos && accion === "en_proceso" &&
    (estado === "pendiente" || estado === "pendiente_pago") &&
    getOrigen(p).tipo === "whatsapp";
  if (!pide) return cambiarEstado(id, accion, btn);
  const r = await pedirTiempo(p);
  if (r === null) return;
  cambiarEstado(id, accion, btn, { tiempo: r.min ? r : null });
}

/* ═════════ BÚSQUEDA ═════════ */
function limpiarResaltadoBusqueda() {
  document.querySelectorAll(".order-card.oc-search-match").forEach(el => el.classList.remove("oc-search-match"));
}
function mostrarResultadoBusqueda(msg, tipo) {
  const el = document.getElementById("pedidoSearchResult");
  if (!el) return;
  el.textContent = msg; el.className = `ps-result ${tipo}`;
  el.style.display = msg ? "block" : "none";
}
function resaltarPedidoEncontrado(id, { scroll = true } = {}) {
  limpiarResaltadoBusqueda();
  const card = document.getElementById(`order-${id}`);
  if (!card) return false;
  card.classList.add("oc-search-match");
  const p = pedidosMap.get(id);
  const estado = ESTADOS.includes(p?.estado) ? p.estado : "pendiente";
  const tab = document.querySelector(`.stab[data-s="${estado}"]`);
  if (tab && activeTab !== estado) {
    activeTab = estado;
    document.querySelectorAll(".stab").forEach(t => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".board-col").forEach(c => c.classList.toggle("col-active", c.dataset.status === activeTab));
  }
  if (scroll) card.scrollIntoView({ behavior: "smooth", block: "center" });
  mostrarResultadoBusqueda(`📍 Encontrado en "${labelEstado(estado)}"`, "ok");
  return true;
}
function ejecutarBusquedaPedido(valorCrudo) {
  const valor = valorCrudo.trim().replace(/^#/, "").toUpperCase();
  const clearBtn = document.getElementById("pedidoSearchClear");
  if (clearBtn) clearBtn.style.display = valor ? "flex" : "none";
  if (!valor) { pedidoSearchActivoId = null; limpiarResaltadoBusqueda(); mostrarResultadoBusqueda("", ""); return; }
  let encontrado = null;
  for (const [id] of pedidosMap) if (codigoCortoPedido(id).startsWith(valor)) { encontrado = id; break; }
  if (!encontrado) { pedidoSearchActivoId = null; limpiarResaltadoBusqueda(); mostrarResultadoBusqueda("Sin coincidencias en el periodo visible", "warn"); return; }
  pedidoSearchActivoId = encontrado;
  resaltarPedidoEncontrado(encontrado);
}
let _psDeb;
document.getElementById("pedidoSearchInput")?.addEventListener("input", (e) => {
  clearTimeout(_psDeb);
  const v = e.target.value;
  _psDeb = setTimeout(() => ejecutarBusquedaPedido(v), 180);
});
document.getElementById("pedidoSearchClear")?.addEventListener("click", () => {
  const input = document.getElementById("pedidoSearchInput");
  if (input) input.value = "";
  ejecutarBusquedaPedido("");
  input?.focus();
});

/* ═════════ REGISTRO DE CALLBACKS (mesa / directo) ═════════ */
let _renderMesaGridFn = () => {};
let _renderMesaDetailFn = () => {};
let _initDirectoFn = () => {};
let _cerrarSesionCelularFn = () => {};

export function registrarVistaMesa({ renderGrid, renderDetail }) {
  if (renderGrid) _renderMesaGridFn = renderGrid;
  if (renderDetail) _renderMesaDetailFn = renderDetail;
}
export function registrarVistaDirecto({ init, cerrarSesionCelular }) {
  if (init) _initDirectoFn = init;
  if (cerrarSesionCelular) _cerrarSesionCelularFn = cerrarSesionCelular;
}

/* ═════════ RENDER DEL TABLERO ═════════ */
export function renderBoard() {
  const grupos = { pendiente:[], pendiente_pago:[], en_proceso:[], listo:[], en_pausa:[], entregado:[], rechazado:[] };
  if (originFilter === "mesa") {
    _renderMesaGridFn();
    const banner = document.getElementById("mesaEmptyBanner");
    if (banner) banner.style.display = "none";
    if (activeModalId && String(activeModalId).startsWith("mesa:"))
      _renderMesaDetailFn(Number(String(activeModalId).split(":")[1]));
    else if (activeModalId) {
      if (pedidosMap.has(activeModalId)) renderDetail(activeModalId);
      else closeDetail();
    }
    return;
  }
  [...pedidosMap.entries()]
    .filter(([id, p]) => pedidoVisible(id, p))
    .sort((a, b) => (toDate(b[1].timestamp)?.getTime() || 0) - (toDate(a[1].timestamp)?.getTime() || 0))
    .forEach(([id, p]) => {
      const estado = ESTADOS.includes(p.estado) ? p.estado : "pendiente";
      grupos[estado].push([id, p]);
      if (estado !== "pendiente") autoRejectingIds.delete(id);
    });
  const totalVisible = ESTADOS.reduce((s, e) => s + grupos[e].length, 0);
  aplicarEstadosVisibles(grupos);
  ESTADOS.forEach((estado) => {
    const body = document.getElementById(`col-${estado}`);
    if (!body) return;
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
      const icoMap = { pendiente:"🌙", pendiente_pago:"💸", en_proceso:"🧊", listo:"🛎️", en_pausa:"⏸️", entregado:"📭", rechazado:"🚫" };
      const msgMap = { pendiente:"No hay pedidos pendientes", pendiente_pago:"Ningún pedido esperando pago",
        en_proceso:"Nada en preparación ahora mismo", listo:"Ningún pedido listo", en_pausa:"Ningún pedido en pausa",
        entregado:"Aún no hay entregas registradas", rechazado:"Sin pedidos rechazados" };
      body.innerHTML = `<div class="col-empty"><div class="ce-ico">${icoMap[estado]}</div><p>${msgMap[estado]} en este periodo</p></div>`;
      return;
    }
    const frag = document.createDocumentFragment();
    items.forEach(([id, p]) => frag.appendChild(buildCard(id, p)));
    body.appendChild(frag);
  });
  if (activeModalId) {
    if (pedidosMap.has(activeModalId)) renderDetail(activeModalId);
    else closeDetail();
  }
  if (pedidoSearchActivoId) {
    if (pedidosMap.has(pedidoSearchActivoId)) resaltarPedidoEncontrado(pedidoSearchActivoId, { scroll: false });
    else { pedidoSearchActivoId = null; limpiarResaltadoBusqueda(); mostrarResultadoBusqueda("El pedido resaltado ya no está en este periodo", "warn"); }
  }
}

/* ═════════ ORIGIN BAR / VISTAS ═════════ */
const VISTAS = {
  whatsapp: { board:true, tabs:true, mesas:false, directo:false },
  mesa: { board:false, tabs:false, mesas:true, directo:false },
  directo: { board:false, tabs:false, mesas:false, directo:true },
};
function aplicarVista(origen) {
  const v = VISTAS[origen] || VISTAS.whatsapp;
  const set = (id, show, displayMostrado = "") => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("vista-oculta", !show);
    el.style.display = show ? displayMostrado : "";
  };
  set("board", v.board);
  set("statusTabs", v.tabs);
  set("mesasStripWrap", v.mesas, "flex");
  set("nuevoPedidoWrap", v.directo, "flex");
  document.getElementById("mesaEmptyBanner")?.classList.add("vista-oculta");
}
aplicarVista("whatsapp");

export function setOriginFilter(nuevo) {
  originFilter = nuevo;
  document.querySelectorAll(".origin-chip").forEach(c => c.classList.toggle("active", c.dataset.origin === nuevo));
  aplicarVista(originFilter);
  if (originFilter === "whatsapp") { whatsappUnseen = 0; actualizarBadgeWhatsapp(); }
  renderBoard();
  if (originFilter === "directo") _initDirectoFn();
  if (originFilter !== "directo") _cerrarSesionCelularFn();
}

const originBar = document.getElementById("originBar");
originBar.querySelectorAll(".origin-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    setOriginFilter(chip.dataset.origin);
    const autorejWrapEl = document.querySelector(".autorej-wrap");
    if (autorejWrapEl) autorejWrapEl.style.display = originFilter === "mesa" ? "none" : "block";
    if (originFilter === "mesa") document.getElementById("autorejPop")?.classList.remove("show");
    const autoresBtn = document.getElementById("autoresBtn");
    if (autoresBtn) autoresBtn.style.display = originFilter === "mesa" ? "inline-flex" : "none";
    if (originFilter !== "mesa") document.getElementById("autoresPop")?.classList.remove("show");
  });
});
function actualizarBadgeWhatsapp() {
  const badge = document.getElementById("waBadge");
  if (!badge) return;
  badge.textContent = whatsappUnseen > 9 ? "9+" : String(whatsappUnseen);
  badge.classList.toggle("show", whatsappUnseen > 0);
}

/* ═════════ ESTILOS ═════════ */
const styleTag = document.createElement("style");
styleTag.textContent = `
.dm-cupon-card{border-radius:14px;padding:12px 14px;margin-bottom:14px;}
.dm-cupon-row{display:flex;justify-content:space-between;font-size:12.5px;color:var(--ink-dim);padding:3px 0;}
.dm-cupon-row .mono{font-family:monospace;letter-spacing:.05em;}
.oc-cupon-tag{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:800;padding:3px 8px;border-radius:999px}
.oc-puntos-aceptar{width:100%;font-size:11.5px;font-weight:700;color:#fbbf24;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.25);border-radius:10px;padding:8px 10px;margin-bottom:8px;}
.oc-puntos-aceptar strong{color:#fcd34d;}
.order-card.oc-pago-recibido{border-color:#fbbf24 !important;box-shadow:0 0 0 3px rgba(251,191,36,.18),0 8px 26px rgba(251,191,36,.22);animation:oc-pago-glow 1.4s ease-in-out infinite;}
@keyframes oc-pago-glow{0%,100%{box-shadow:0 0 0 3px rgba(251,191,36,.18),0 8px 26px rgba(251,191,36,.22);}50%{box-shadow:0 0 0 6px rgba(251,191,36,.3),0 10px 30px rgba(251,191,36,.32);}}
.order-card.oc-en-local{border-color:#ec4899 !important;box-shadow:0 0 0 3px rgba(236,72,153,.2),0 8px 26px rgba(236,72,153,.28);animation:oc-local-glow 1.3s ease-in-out infinite;}
@keyframes oc-local-glow{0%,100%{box-shadow:0 0 0 3px rgba(236,72,153,.2),0 8px 26px rgba(236,72,153,.28);}50%{box-shadow:0 0 0 7px rgba(236,72,153,.32),0 10px 32px rgba(236,72,153,.4);}}
.pedido-search-wrap{position:relative;display:flex;align-items:center;gap:8px;margin:10px 14px 4px;padding:9px 14px;border-radius:14px;background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,0));border:1px solid var(--line);transition:border-color .2s ease,box-shadow .2s ease;}
.pedido-search-wrap:focus-within{border-color:#7c5cff;box-shadow:0 0 0 3px rgba(124,92,255,.15);}
.pedido-search-wrap .ps-ico{font-size:14px;opacity:.6;flex-shrink:0;}
.pedido-search-wrap input{flex:1;background:transparent;border:none;outline:none;color:#fff;font-size:13px;font-weight:600;letter-spacing:.02em;}
.pedido-search-wrap input::placeholder{color:var(--ink-faint);font-weight:500;}
.ps-clear{background:var(--surface);border:1px solid var(--line);color:var(--ink-dim);width:22px;height:22px;border-radius:50%;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.ps-result{position:absolute;left:14px;top:calc(100% + 6px);font-size:11.5px;font-weight:700;padding:5px 10px;border-radius:8px;white-space:nowrap;z-index:5;}
.ps-result.ok{background:rgba(124,92,255,.15);color:#a78bfa;border:1px solid rgba(124,92,255,.3);}
.ps-result.warn{background:rgba(248,113,113,.12);color:#f87171;border:1px solid rgba(248,113,113,.3);}
.order-card.oc-search-match{outline:2px solid #f5c563;outline-offset:2px;animation:ps-glow 1.6s ease-in-out infinite;}
@keyframes ps-glow{0%,100%{box-shadow:0 0 0 5px rgba(245,197,99,.14),0 6px 22px rgba(245,197,99,.18);}50%{box-shadow:0 0 0 8px rgba(245,197,99,.22),0 6px 26px rgba(245,197,99,.28);}}
.mapa-delivery-mini{position:relative;width:100%;height:240px;border-radius:14px;overflow:hidden;margin-top:8px;border:1px solid var(--line);cursor:pointer;background:#0a0a0f;}
.deli-precio{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;padding:9px 12px;border-radius:10px;font-size:12.5px;color:#4ade80;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.28);}
.deli-precio.total{margin-top:4px;color:#fbbf24;background:rgba(251,191,36,.08);border-color:rgba(251,191,36,.28);}
.deli-precio.gratis{justify-content:center;font-weight:800;}
.mapa-delivery-mini iframe{width:100%;height:100%;border:0;pointer-events:none;}
.mapa-delivery-click-layer{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:10px;background:linear-gradient(180deg,rgba(0,0,0,0) 55%,rgba(0,0,0,.6) 100%);color:#fff;font-size:11.5px;font-weight:800;}
#mapaDeliveryOverlay{display:flex;position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.85);align-items:center;justify-content:center;padding:16px;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .28s ease, visibility 0s linear .28s;}
#mapaDeliveryOverlay.show{opacity:1;visibility:visible;pointer-events:auto;transition:opacity .28s ease, visibility 0s;}
.mapa-delivery-full{position:relative;width:100%;max-width:920px;height:80vh;border-radius:18px;overflow:hidden;border:1px solid var(--line);background:#0a0a0f;opacity:0;transform:scale(.96) translateY(8px);transition:transform .32s cubic-bezier(.22,1,.36,1),opacity .28s ease;}
#mapaDeliveryOverlay.show .mapa-delivery-full{opacity:1;transform:none;}
.mapa-delivery-full iframe{width:100%;height:100%;border:0;opacity:0;transition:opacity .35s ease;}
.mapa-delivery-full iframe.loaded{opacity:1;}
.mapa-delivery-full-close{position:absolute;top:12px;right:12px;z-index:5;width:36px;height:36px;border-radius:50%;border:none;background:rgba(0,0,0,.6);color:#fff;font-size:16px;cursor:pointer;}
.vista-oculta{display:none !important;}
.plan-oculto{display:none !important;}
#popBackdrop{position:fixed;inset:0;z-index:250;background:rgba(4,4,8,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);opacity:0;visibility:hidden;transition:opacity .28s ease, visibility 0s linear .28s;}
#popBackdrop.show{opacity:1;visibility:visible;transition:opacity .28s ease, visibility 0s;}
.stab[data-s="listo"] .dot{background:#2dd4bf;}
.est-legend{display:flex;flex-wrap:wrap;gap:8px 14px;padding:8px 16px;font-size:11.5px;font-weight:700;color:var(--ink-dim);}
.est-legend span{display:inline-flex;align-items:center;gap:6px;}
.est-legend i{width:10px;height:10px;border-radius:50%;display:inline-block;}
#cfgPanel{position:fixed;right:12px;left:auto;top:70px;margin:0;width:min(440px,calc(100vw - 24px));z-index:60;display:none;grid-template-columns:1fr 1fr;gap:10px;padding:14px;max-height:calc(100vh - 100px);overflow-y:auto;background:var(--surface);border:1px solid var(--line);border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.6);}
#cfgPanel.show{display:grid;}
#cfgPanel .autorej-wrap{display:block;position:static;min-width:0;}
#cfgPanel .autorej-wrap:has(#autoresBtn[style*="none"]){display:none;}
#cfgPanel .autorej-btn,#cfgPanel .oc-btn{width:100%;min-height:44px;justify-content:flex-start;white-space:nowrap;}
@media (max-width:480px){#cfgPanel{grid-template-columns:1fr;top:64px;}}
#autorejPop,#autoresPop,#deliPop{position:fixed !important;left:50% !important;top:50% !important;right:auto !important;bottom:auto !important;margin:0 !important;width:min(400px,92vw) !important;max-height:86vh;overflow-y:auto;z-index:300 !important;padding:20px !important;border-radius:20px !important;background:var(--surface,#14141c) !important;border:1px solid var(--line) !important;box-shadow:0 30px 90px rgba(0,0,0,.65) !important;display:block !important;opacity:0;visibility:hidden;pointer-events:none;transform:translate(-50%,-46%) scale(.94) !important;transition:opacity .25s ease,transform .32s cubic-bezier(.22,1,.36,1),visibility 0s linear .32s;}
#autorejPop.show,#autoresPop.show,#deliPop.show{opacity:1 !important;visibility:visible !important;pointer-events:auto !important;transform:translate(-50%,-50%) scale(1) !important;transition:opacity .25s ease,transform .32s cubic-bezier(.22,1,.36,1),visibility 0s;}
#deliModo,.deli-inp{background:var(--bg,#0a0a0f);color:#fff;border:1px solid var(--line);border-radius:10px;padding:9px 11px;font-size:13px;font-weight:600;outline:none;color-scheme:dark;transition:border-color .2s, box-shadow .2s;}
.dlv-ov{display:flex;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:95;align-items:center;justify-content:center;padding:12px;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .28s ease, visibility 0s linear .28s;}
.dlv-ov.show{opacity:1;visibility:visible;pointer-events:auto;transition:opacity .28s ease, visibility 0s;}
.dlv-box{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:16px;width:min(420px,100%);max-height:88vh;overflow-y:auto;color:#fff;opacity:0;transform:translateY(28px) scale(.96);transition:transform .38s cubic-bezier(.22,1,.36,1),opacity .28s ease;}
.dlv-ov.show .dlv-box{opacity:1;transform:none;}
.dlv-head{display:flex;justify-content:space-between;align-items:center;font-weight:800;margin-bottom:12px;}
.dlv-head button{background:none;border:none;color:#fff;font-size:16px;cursor:pointer;}
.dlv-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:12px;margin-bottom:8px;background:rgba(255,255,255,.03);}
.dlv-item.pick{cursor:pointer;}
.dlv-av{width:42px;height:42px;border-radius:50%;overflow:hidden;flex-shrink:0;background:rgba(124,92,255,.2);display:flex;align-items:center;justify-content:center;font-weight:800;color:#a78bfa;}
.dlv-av img{width:100%;height:100%;object-fit:cover;}
.dlv-info{flex:1;min-width:0;}
.dlv-info b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dlv-info small{font-size:11.5px;color:var(--ink-dim);}
.dlv-mini{border:1px solid var(--line);background:var(--bg,#0a0a0f);color:#fff;border-radius:8px;width:30px;height:30px;cursor:pointer;flex-shrink:0;}
.dlv-mini.danger{color:#f87171;border-color:rgba(248,113,113,.35);}
.dlv-empty{font-size:12.5px;color:var(--ink-faint);text-align:center;padding:14px 0;}
.dlv-cfg-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;border:1px solid var(--line);border-radius:12px;margin-bottom:6px;background:rgba(255,255,255,.03);font-size:12.5px;font-weight:600;}
.dlv-cfg-sub{font-size:12px;color:var(--ink-dim);line-height:1.4;margin-bottom:10px;}
.dlv-prev-title{font-size:11.5px;font-weight:800;color:#a78bfa;margin:12px 0 6px;letter-spacing:.04em;text-transform:uppercase;}
@media (max-width:560px){.dlv-ov{align-items:flex-end;padding:0;}.dlv-box{width:100%;border-radius:18px 18px 0 0;max-height:92vh;}}
`;
document.head.appendChild(styleTag);

/* ═════════ LISTENER PRINCIPAL DE PEDIDOS ═════════ */
let unsubscribePedidos = null;
const voucherNotificados = new Set();

export function suscribirPedidos() {
  if (!tiendaId) return;
  if (typeof unsubscribePedidos === "function") { unsubscribePedidos(); unsubscribePedidos = null; }
  const [from, to] = getDateFilterRange();
  const pedidosRef = tiendaSubCol(localidad, "tiendas", tiendaId, "pedidos");
  const q = query(pedidosRef,
    where("timestamp", ">=", Timestamp.fromDate(from)),
    where("timestamp", "<=", Timestamp.fromDate(to)),
    orderBy("timestamp", "desc"));

  unsubscribePedidos = onSnapshot(q, (snap) => {
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
    const respuestasClienteNuevas = [];
    const canceladosPorClienteEnPausa = [];
    const canceladosPorClientePendiente = [];
    const pagosRecibidosNuevos = [];
    const enLocalNuevos = [];

    snap.docChanges().forEach((change) => {
      const id = change.doc.id;
      const data = change.doc.data();
      const estadoNuevo = ESTADOS.includes(data.estado) ? data.estado : "pendiente";
      if (change.type === "added") {
        if (estadoNuevo === "pendiente" && getOrigen(data).tipo === "whatsapp")
          nuevosPendientes.push({ id, data });
      } else if (change.type === "modified") {
        const anterior = pedidosMap.get(id);
        const estadoAnterior = anterior ? (ESTADOS.includes(anterior.estado) ? anterior.estado : "pendiente") : null;
        if (estadoAnterior === "pendiente" && estadoNuevo !== "pendiente") detenerSoundLoopParaPedido(id);
        const respAnterior = anterior?.respuesta_cliente;
        const respNueva = data.respuesta_cliente;
        if (estadoNuevo === "en_pausa" && respNueva && !respAnterior && respNueva.accion !== "cancelado")
          respuestasClienteNuevas.push({ id, data });
        if (estadoNuevo === "rechazado" && data.cancelado_por_cliente === true && estadoAnterior !== "rechazado") {
          if (estadoAnterior === "en_pausa") canceladosPorClienteEnPausa.push({ id, data });
          else canceladosPorClientePendiente.push({ id, data });
        }
        if (estadoNuevo === "pendiente" && estadoAnterior !== "pendiente" && getOrigen(data).tipo === "whatsapp")
          nuevosPendientes.push({ id, data });
        const vA = anterior?.pago?.voucher_url;
        const vN = data.pago?.voucher_url;
        if (vN && !vA && !voucherNotificados.has(id)) { voucherNotificados.add(id); pagosRecibidosNuevos.push({ id, data }); }
        if (data.cliente_en_local && !anterior?.cliente_en_local) enLocalNuevos.push({ id, data });
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
      const nombres = nuevosPendientes.map(({ data }) => data.cliente?.nombre || "Cliente").join(", ");
      showToast(nuevosPendientes.length === 1 ? `🛎️ Nuevo pedido de ${nombres}` : `🛎️ ${nuevosPendientes.length} pedidos nuevos`);
      if (originFilter === "mesa") { whatsappUnseen += nuevosPendientes.length; actualizarBadgeWhatsapp(); }
      try { window.parent.postMessage({ type: "NUEVO_PEDIDO_VIVO" }, window.location.origin); } catch {}
    }
    if (respuestasClienteNuevas.length) {
      playSoundOnce(SND_PEDIDO_CONTESTADO);
      bellRingFeedback();
      respuestasClienteNuevas.forEach(({ data }) => notificarRespuestaCliente(data));
    }
    if (pagosRecibidosNuevos.length) {
      playSoundOnce(SND_PAGO_RECIBIDO);
      bellRingFeedback();
      const nombres = pagosRecibidosNuevos.map(({ data }) => data.cliente?.nombre || "Cliente").join(", ");
      showToast(pagosRecibidosNuevos.length === 1 ? `💸 ${nombres} envió su comprobante` : `💸 ${pagosRecibidosNuevos.length} comprobantes recibidos`);
    }
    if (enLocalNuevos.length) {
      playSoundOnce(SND_CLIENTE_EN_LOCAL);
      bellRingFeedback();
      showToast(`📍 ${enLocalNuevos.map(({ data }) => data.cliente?.nombre || "Cliente").join(", ")} ya está en el local`);
    }
    if (canceladosPorClienteEnPausa.length) {
      playSoundOnce(SND_PEDIDO_CANCELADO_PAUSA);
      bellRingFeedback();
      canceladosPorClienteEnPausa.forEach(({ data }) => notificarPedidoCanceladoPorCliente(data));
      showToast(`🚫 ${canceladosPorClienteEnPausa.length === 1 ? "Un cliente canceló su pedido" : canceladosPorClienteEnPausa.length + " clientes cancelaron su pedido"}`, true);
    }
    if (canceladosPorClientePendiente.length) {
      playSoundOnce(SND_CLIENTE_CANCELO_PEDIDO);
      bellRingFeedback();
      canceladosPorClientePendiente.forEach(({ data }) => notificarPedidoCanceladoPorCliente(data));
      showToast(`🚫 ${canceladosPorClientePendiente.length === 1 ? "Un cliente canceló su pedido" : canceladosPorClientePendiente.length + " clientes cancelaron su pedido"}`, true);
    }
    hideLoader();
  }, (err) => {
    console.error("Error escuchando pedidos:", err);
    showToast("⚠️ Conexión interrumpida, reintentando…", true);
    hideLoader();
  });
}

function playChime(pedidoId, data) {
  const tipo = getTipoCuponPedido(data);
  let url = SND_NUEVO_PEDIDO;
  if (tipo === "canje_puntos") url = SND_CANJE_PUNTOS;
  else if (tipo === "descuento_fidelizacion") url = SND_NUEVO_PEDIDO_DESCUENTO;
  else if (tipo === "cupon_descuento") url = SND_NUEVO_PEDIDO_CUPON_DESCUENTO;
  else {
    const t = data?.cliente?.tipo_entrega;
    if (t === "Delivery") url = SND_NUEVO_PEDIDO_DELIVERY;
    else if (t === "Recojo en local") url = SND_NUEVO_PEDIDO_RECOJO;
  }
  encolarAlarma(pedidoId, url);
}

/* ═════════ TABS ═════════ */
document.getElementById("statusTabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".stab");
  if (!tab) return;
  activeTab = tab.dataset.s;
  document.querySelectorAll(".stab").forEach((t) => t.classList.toggle("active", t === tab));
  document.querySelectorAll(".board-col").forEach((c) => c.classList.toggle("col-active", c.dataset.status === activeTab));
  if (tab.dataset.s === "rechazado") {
    document.querySelector('.board-col[data-status="rechazado"]')?.classList.toggle("expanded");
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
});

/* ═════════ RELOJ / TIMERS ═════════ */
function tickClock() {
  const now = new Date();
  const t = document.getElementById("clockTime");
  const d = document.getElementById("clockDate");
  if (t) t.textContent = now.toLocaleTimeString("es-PE", { hour:"2-digit", minute:"2-digit" });
  if (d) d.textContent = now.toLocaleDateString("es-PE", { weekday:"long", day:"numeric", month:"long" });
}
tickClock();
setInterval(tickClock, 15000);

function tickTimeAgo() {
  document.querySelectorAll("[data-ts]").forEach((el) => {
    const ts = Number(el.dataset.ts);
    if (!ts) return;
    const label = timeAgo(new Date(ts));
    const target = el.querySelector(".ts-label") || el;
    target.textContent = label;
    const diffMin = Math.floor((Date.now() - ts) / 60000);
    el.classList.toggle("stale", diffMin >= 20);
  });
}
setInterval(tickTimeAgo, 20000);

/* ═════════ LOADER ═════════ */
export function hideLoader() {
  const loader = document.getElementById("pageLoader");
  if (!loader) return;
  loader.classList.add("leaving");
  setTimeout(() => loader.remove(), 450);
}

/* ═════════ CONTROL AUTO-RECHAZO ═════════ */
const autorejBtn = document.getElementById("autorejBtn");
const autorejPop = document.getElementById("autorejPop");
const autorejToggle = document.getElementById("autorejToggle");
const autorejMinutesInput = document.getElementById("autorejMinutes");
const autorejVal = document.getElementById("autorejVal");
const autorejSave = document.getElementById("autorejSave");
const topActionsEl = autorejBtn?.closest(".autorej-wrap")?.parentElement;
if (topActionsEl) topActionsEl.classList.add("top-actions-scroll");

function paintAutorejBtn() {
  if (!autorejBtn) return;
  autorejBtn.classList.toggle("on", autoRejectEnabled);
  autorejVal.textContent = autoRejectEnabled ? `${autoRejectMinutes}m` : "Off";
}
if (autorejToggle) autorejToggle.checked = autoRejectEnabled;
if (autorejMinutesInput) autorejMinutesInput.value = autoRejectMinutes;
paintAutorejBtn();
autorejBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  autorejPop.classList.toggle("show");
  document.getElementById("autoresPop")?.classList.remove("show");
});
document.addEventListener("click", (e) => {
  if (autorejPop && !autorejPop.contains(e.target) && e.target !== autorejBtn)
    autorejPop.classList.remove("show");
  const ap = document.getElementById("autoresPop");
  if (ap && !ap.contains(e.target) && e.target !== document.getElementById("autoresBtn"))
    ap.classList.remove("show");
});
autorejPop?.addEventListener("click", (e) => e.stopPropagation());
autorejSave?.addEventListener("click", () => {
  const mins = Math.max(1, Math.min(120, Math.round(Number(autorejMinutesInput.value) || 5)));
  autorejMinutesInput.value = mins;
  autoRejectMinutes = mins;
  autoRejectEnabled = autorejToggle.checked;
  localStorage.setItem("geinz_autorej_on", autoRejectEnabled ? "1" : "0");
  localStorage.setItem("geinz_autorej_min", String(mins));
  paintAutorejBtn();
  autorejPop.classList.remove("show");
  showToast(autoRejectEnabled ? `⏱️ Auto-rechazo activado: ${mins} min sin confirmar` : "⏱️ Auto-rechazo desactivado");
});

/* ═════════ DELIVERY CONFIG UI ═════════ */
const deliBtn = document.getElementById("deliBtn");
const deliPop = document.getElementById("deliPop");
const deliToggle = document.getElementById("deliToggle");
const deliBaseInput = document.getElementById("deliBase");
const deliKmInclInput = document.getElementById("deliKmIncl");
const deliPorKmInput = document.getElementById("deliPorKm");
const deliVal = document.getElementById("deliVal");
const deliHaceEl = document.getElementById("deliHace");
const deliModoEl = document.getElementById("deliModo");
const deliFijaBox = document.getElementById("deliFijaBox");
const deliFijaEl = document.getElementById("deliFija");
const deliTextoEl = document.getElementById("deliTexto");

if (deliModoEl && !deliModoEl.querySelector('option[value="zonas"]'))
  deliModoEl.add(new Option("Por zonas / lugares", "zonas"));

const deliZonasBox = document.createElement("div");
deliZonasBox.style.display = "none";
deliZonasBox.innerHTML = `<div id="deliZonasList"></div>
  <button type="button" id="deliZonaAdd" class="autorej-save"
    style="background:transparent;border:1px dashed var(--line);color:var(--ink-dim);margin-top:6px;">+ Agregar zona</button>`;
deliFijaBox?.after(deliZonasBox);

function deliPintarZonas() {
  const l = document.getElementById("deliZonasList");
  if (!l) return;
  l.innerHTML = deliZonas.map((z, i) => `
    <div class="deli-zona-row">
      <input class="deli-inp" type="text" data-zn="${i}" value="${escapeHtml(z.nombre)}" placeholder="Ej: Barranca centro" maxlength="40">
      <div class="deli-money"><span>S/</span><input class="deli-inp" type="number" data-zp="${i}" min="0" step="0.5" value="${z.precio}"></div>
      <button type="button" data-zd="${i}" class="deli-trash">🗑</button>
    </div>`).join("") ||
    `<div style="font-size:12px;color:var(--ink-faint);padding:6px 0;">Agrega los lugares donde haces delivery y su precio.</div>`;
}
document.getElementById("deliZonasList")?.addEventListener("input", (e) => {
  const zn = e.target.dataset.zn, zp = e.target.dataset.zp;
  if (zn !== undefined) deliZonas[zn].nombre = e.target.value;
  if (zp !== undefined) deliZonas[zp].precio = e.target.value;
});
document.getElementById("deliZonasList")?.addEventListener("click", (e) => {
  const d = e.target.closest("[data-zd]");
  if (!d) return;
  deliZonas.splice(Number(d.dataset.zd), 1);
  deliPintarZonas();
});
document.getElementById("deliZonaAdd")?.addEventListener("click", () => {
  if (deliZonas.length >= 15) return showToast("Máximo 15 zonas", true);
  deliZonas.push({ nombre:"", precio:0 });
  deliPintarZonas();
});

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
  const on = document.getElementById("deliRecOn"); if (!on) return;
  on.checked = deliRecargo.activo;
  document.getElementById("deliRecDesde").value = deliRecargo.desde;
  document.getElementById("deliRecHasta").value = deliRecargo.hasta;
  document.getElementById("deliRecMonto").value = deliRecargo.monto;
  document.getElementById("deliRecBody").classList.toggle("off", !deliRecargo.activo);
  document.getElementById("deliRecHint").textContent = `Desde las ${hora12(deliRecargo.desde)} hasta las ${hora12(deliRecargo.hasta)} el delivery cuesta S/ ${Number(deliRecargo.monto||0).toFixed(2)} más.`;
}
deliRecBox.addEventListener("input", () => {
  deliRecargo = {
    activo: document.getElementById("deliRecOn").checked,
    desde: document.getElementById("deliRecDesde").value,
    hasta: document.getElementById("deliRecHasta").value,
    monto: Math.max(0, Number(document.getElementById("deliRecMonto").value) || 0),
  };
  deliPintarRecargo();
});

function paintDeliBtn() {
  if (!deliBtn) return;
  deliBtn.classList.toggle("on", deliHace);
  deliVal.textContent = !deliHace ? "No" :
    deliModo === "zonas" ? `${deliZonas.length} zonas` :
    deliModo === "fija" ? `S/${deliFija}` :
    deliEnabled ? `S/${deliBase}+` : "Off";
}
function pintarDeliModo() {
  const m = deliModoEl.value;
  if (deliFijaBox) deliFijaBox.style.display = m === "fija" ? "block" : "none";
  deliZonasBox.style.display = m === "zonas" ? "block" : "none";
  [deliBaseInput, deliKmInclInput, deliPorKmInput].forEach(i => {
    const row = i?.closest(".autorej-input-row");
    if (row) row.style.display = m === "distancia" ? "flex" : "none";
  });
}
deliModoEl?.addEventListener("change", pintarDeliModo);
deliToggle && (deliToggle.checked = deliEnabled);
deliBaseInput && (deliBaseInput.value = deliBase);
deliKmInclInput && (deliKmInclInput.value = deliKmIncl);
deliPorKmInput && (deliPorKmInput.value = deliPorKm);
deliHaceEl && (deliHaceEl.checked = deliHace);
deliModoEl && (deliModoEl.value = deliModo);
deliFijaEl && (deliFijaEl.value = deliFija);
deliTextoEl && (deliTextoEl.value = deliTexto);
deliPintarZonas();
deliPintarRecargo();
pintarDeliModo();
paintDeliBtn();

function actualizarVisibilidadDeli() {
  const wrap = deliBtn?.closest(".autorej-wrap");
  if (wrap) wrap.style.display = originFilter === "whatsapp" ? "block" : "none";
  if (originFilter !== "whatsapp") deliPop?.classList.remove("show");
}
actualizarVisibilidadDeli();

deliBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  deliPop.classList.toggle("show");
  autorejPop?.classList.remove("show");
  document.getElementById("autoresPop")?.classList.remove("show");
});
deliPop?.addEventListener("click", (e) => e.stopPropagation());
document.addEventListener("click", (e) => {
  if (deliPop && !deliPop.contains(e.target) && !deliBtn?.contains(e.target))
    deliPop.classList.remove("show");
}, true);

document.getElementById("deliSave")?.addEventListener("click", async () => {
  const num = (el) => Math.max(0, Number(el.value) || 0);
  deliBase = num(deliBaseInput);
  deliKmIncl = num(deliKmInclInput);
  deliPorKm = num(deliPorKmInput);
  deliFija = num(deliFijaEl);
  deliTexto = deliTextoEl.value.trim();
  deliModo = deliModoEl.value;
  deliHace = deliHaceEl.checked;
  deliEnabled = deliToggle.checked;
  deliZonas = deliZonas.map(z => ({ nombre: String(z.nombre||"").trim(), precio: Math.max(0, Number(z.precio)||0) })).filter(z => z.nombre);
  if (deliModo === "zonas" && !deliZonas.length) return showToast("Agrega al menos una zona", true);
  deliPintarZonas(); paintDeliBtn(); _syncDeliState();
  try {
    await updateDoc(tiendaDoc(localidad, "tiendas", tiendaId), {
      delivery: { hace: deliHace, tarifa_activa: deliEnabled, modo: deliModo,
        base: deliBase, km_incluidos: deliKmIncl, por_km: deliPorKm,
        fija: deliFija, texto: deliTexto, zonas: deliZonas, recargo: deliRecargo },
    });
    deliPop.classList.remove("show");
    showToast(deliHace ? "🛵 Delivery guardado" : "🛵 Delivery desactivado");
    if (activeModalId && pedidosMap.has(activeModalId)) renderDetail(activeModalId);
  } catch { showToast("❌ No se pudo guardar el delivery", true); }
});

/* Modal tiempos estimados */
const tmpOv = document.createElement("div");
tmpOv.className = "dlv-ov";
tmpOv.innerHTML = `<div class="dlv-box">
  <div class="dlv-head"><span>⏱️ Tiempos estimados</span><button type="button" data-x>✕</button></div>
  <p class="dlv-cfg-sub">Este rango se le muestra al cliente al confirmar su pedido.</p>
  <div class="dlv-cfg-row"><span class="l">Mostrar tiempo al cliente</span>
    <label class="switch"><input type="checkbox" id="tmpActivo"><span class="switch-track"></span></label></div>
  <div class="dlv-prev-title">🛵 Delivery (minutos)</div>
  <div style="display:flex;gap:8px;align-items:center;">
    <input type="number" id="tmpDelMin" class="deli-inp" min="1" style="flex:1"><span>a</span>
    <input type="number" id="tmpDelMax" class="deli-inp" min="1" style="flex:1">
  </div>
  <div class="dlv-prev-title">🏬 Recojo en local (minutos)</div>
  <div style="display:flex;gap:8px;align-items:center;">
    <input type="number" id="tmpRecMin" class="deli-inp" min="1" style="flex:1"><span>a</span>
    <input type="number" id="tmpRecMax" class="deli-inp" min="1" style="flex:1">
  </div>
  <button type="button" class="np-confirmar-btn" id="tmpGuardar" style="margin-top:16px;">Guardar</button>
</div>`;
document.body.appendChild(tmpOv);
tmpOv.addEventListener("click", (e) => { if (e.target === tmpOv || e.target.hasAttribute("data-x")) tmpOv.classList.remove("show"); });

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
  const n = (id) => Math.max(1, Math.round(Number(document.getElementById(id).value) || 1));
  const delivery = { min: n("tmpDelMin"), max: n("tmpDelMax") };
  const recojo = { min: n("tmpRecMin"), max: n("tmpRecMax") };
  if (delivery.max < delivery.min || recojo.max < recojo.min)
    return showToast("El máximo no puede ser menor que el mínimo", true);
  const cfg = { activo: document.getElementById("tmpActivo").checked, delivery, recojo };
  try {
    await updateDoc(tiendaDoc(localidad, "tiendas", tiendaId), { tiempos_estimados: cfg });
    bizDataGlobal = { ...(bizDataGlobal || {}), tiempos_estimados: cfg };
    tmpOv.classList.remove("show");
    showToast("⏱️ Tiempos guardados");
  } catch { showToast("❌ No se pudo guardar", true); }
});
export const tmpBtn = document.createElement("button");
tmpBtn.type = "button"; tmpBtn.className = "oc-btn ghost";
tmpBtn.textContent = "⏱️ Tiempos";
tmpBtn.addEventListener("click", abrirAjusteTiempos);
(topActionsEl || document.body).appendChild(tmpBtn);

/* ═════════ MENÚ CONFIGURACIÓN + LEYENDA ═════════ */
(function () {
  const headRight = document.querySelector(".head-right");
  if (!headRight) return;
  const box = document.createElement("div");
  box.style.position = "relative";
  box.innerHTML = `<button type="button" class="autorej-btn" id="cfgBtn"><span class="ico">⚙️</span><span class="lbl-text">Configuración</span></button><div id="cfgPanel"></div>`;
  headRight.insertBefore(box, document.getElementById("bellBtn"));
  const panel = box.querySelector("#cfgPanel");
  headRight.querySelectorAll(".autorej-wrap").forEach(w => panel.appendChild(w));

  const estOv = document.createElement("div");
  estOv.className = "dlv-ov";
  const filas = [
    ["pendiente","Pendiente",true], ["pendiente_pago","Pendiente de pago",false],
    ["en_proceso","En proceso",true], ["listo","Listo",true],
    ["en_pausa","En pausa",false], ["entregado","Entregado",true],
  ];
  estOv.innerHTML = `<div class="dlv-box">
    <div class="dlv-head"><span>📋 Estados del pedido</span><button type="button" data-x>✕</button></div>
    <p class="dlv-cfg-sub">Activa o desactiva los estados opcionales.</p>
    ${filas.map(([k,l,f]) => `<div class="dlv-cfg-row"><span class="l">${l}${f?" (obligatorio)":""}</span>
      <label class="switch"><input type="checkbox" data-est="${k}" ${f?"checked disabled":""}><span class="switch-track"></span></label></div>`).join("")}
    <button type="button" class="np-confirmar-btn" id="estGuardar" style="margin-top:14px;">Guardar</button>
  </div>`;
  document.body.appendChild(estOv);
  estOv.addEventListener("click", (e) => { if (e.target === estOv || e.target.hasAttribute("data-x")) estOv.classList.remove("show"); });

  const estBtn = document.createElement("button");
  estBtn.type = "button"; estBtn.className = "oc-btn ghost";
  estBtn.textContent = "📋 Estados del pedido"; estBtn.id = "estBtn";
  estBtn.addEventListener("click", () => {
    estOv.querySelectorAll("[data-est]").forEach((i) => { if (!i.disabled) i.checked = estadoHabilitado(i.dataset.est); });
    estOv.classList.add("show");
  });
  panel.appendChild(estBtn);
  document.getElementById("estGuardar").addEventListener("click", async () => {
    const estados = {};
    estOv.querySelectorAll("[data-est]:not([disabled])").forEach((i) => (estados[i.dataset.est] = i.checked));
    try {
      await updateDoc(tiendaDoc(localidad, "tiendas", tiendaId), { "pedidos_config.estados": estados });
      bizDataGlobal = { ...(bizDataGlobal || {}), pedidos_config: { estados } };
      estOv.classList.remove("show");
      renderBoard();
      showToast("📋 Estados guardados");
    } catch { showToast("❌ No se pudo guardar", true); }
  });

  if (typeof tmpBtn !== "undefined") panel.appendChild(tmpBtn);
  document.getElementById("deliverysBtn")?.addEventListener("click", () => panel.classList.remove("show"));
  box.querySelector("#cfgBtn").addEventListener("click", (e) => { e.stopPropagation(); panel.classList.toggle("show"); });
  document.addEventListener("click", (e) => { if (!panel.contains(e.target)) panel.classList.remove("show"); });

  const tabs = document.getElementById("statusTabs");
  if (tabs) {
    const lg = document.createElement("div");
    lg.className = "est-legend";
    lg.innerHTML = [["#ec4899","Cliente en local"],["#fbbf24","Pago enviado"],["#2dd4bf","Listo"],["#38bdf8","En pausa"]]
      .map(([c,t]) => `<span><i style="background:${c}"></i>${t}</span>`).join("");
    tabs.after(lg);
  }
})();

/* ═════════ AUTO-LIBERACIÓN DE RESERVAS (config UI aquí, ejecución en mesa.js) ═════════ */
export let autoResEnabled = localStorage.getItem("geinz_autores_on") === "1";
export let autoResMinutes = Number(localStorage.getItem("geinz_autores_min")) || 20;

const autoresBtn = document.getElementById("autoresBtn");
const autoresPop = document.getElementById("autoresPop");
const autoresToggle = document.getElementById("autoresToggle");
const autoresMinutesInput = document.getElementById("autoresMinutes");
const autoresVal = document.getElementById("autoresVal");
const autoresSave = document.getElementById("autoresSave");

function paintAutoresBtn() {
  if (!autoresBtn) return;
  autoresBtn.classList.toggle("on", autoResEnabled);
  autoresVal.textContent = autoResEnabled ? `${autoResMinutes}m` : "Off";
}
if (autoresToggle) autoresToggle.checked = autoResEnabled;
if (autoresMinutesInput) autoresMinutesInput.value = autoResMinutes;
paintAutoresBtn();
autoresBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  autoresPop.classList.toggle("show");
  autorejPop?.classList.remove("show");
});
autoresPop?.addEventListener("click", (e) => e.stopPropagation());
autoresSave?.addEventListener("click", () => {
  const mins = Math.max(1, Math.min(240, Math.round(Number(autoresMinutesInput.value) || 20)));
  autoresMinutesInput.value = mins;
  autoResMinutes = mins;
  autoResEnabled = autoresToggle.checked;
  localStorage.setItem("geinz_autores_on", autoResEnabled ? "1" : "0");
  localStorage.setItem("geinz_autores_min", String(mins));
  paintAutoresBtn();
  autoresPop.classList.remove("show");
  showToast(autoResEnabled ? `🔔 Auto-liberación de reservas activada: ${mins} min sin ocupar` : "🔔 Auto-liberación desactivada");
});

/* ═════════ PLAN / SERVICIOS ═════════ */
let PLAN_SERV = null;
const _on = (v) => {
  if (typeof v === "boolean") return v;
  if (v && typeof v === "object" && typeof v.toDate !== "function") return Object.values(v).some(_on);
  return false;
};
const _nodo = (o, k) => {
  if (!o || typeof o !== "object") return undefined;
  if (k in o) return o[k];
  for (const v of Object.values(o)) { const r = _nodo(v, k); if (r !== undefined) return r; }
  return undefined;
};
const _flag = (n, k) => (typeof n?.[k] === "boolean" ? n[k] : _on(n?.[k]));

export function aplicarPlanPedidos(servicios) {
  if (servicios) PLAN_SERV = servicios;
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
    carrito: car, mesa: mes, nuevoPedido: nue,
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
  ocultar(document.getElementById("estBtn"), PLAN_PED.estados);
  ocultar(document.querySelector('.origin-chip[data-origin="whatsapp"]'), PLAN_PED.carrito);
  ocultar(document.querySelector('.origin-chip[data-origin="mesa"]'), PLAN_PED.mesa);
  ocultar(document.querySelector('.origin-chip[data-origin="directo"]'), PLAN_PED.nuevoPedido);
}
window.addEventListener("message", (e) => {
  if (e.origin !== window.location.origin) return;
  if (e.data?.type === "SERVICIOS_UPDATE") aplicarPlanPedidos(e.data.servicios);
});
try { window.parent.postMessage({ type: "PEDIR_DATOS_TIENDA" }, window.location.origin); } catch {}

/* ═════════ BOOT ═════════ */
async function boot() {
  await cargarNegocio();
  // El chip "Nuevo pedido" lo agrega pedidos_directo.js
  const chipDirecto = document.createElement("div");
  chipDirecto.className = "origin-chip";
  chipDirecto.dataset.origin = "directo";
  chipDirecto.textContent = "🧾 Nuevo pedido";
  originBar.appendChild(chipDirecto);
  chipDirecto.addEventListener("click", () => setOriginFilter("directo"));

  aplicarPlanPedidos();
  if (!tiendaId) {
    let resuelto = false;
    window.addEventListener("message", (e) => {
      const d = e.data;
      if (d && d.type === "DATOS_TIENDA" && d.id && !resuelto) {
        resuelto = true;
        tiendaId = d.id;
        localidad = (d.localidad || localidad).toLowerCase();
        cargarNegocio();
      }
    });
  }
  suscribirPedidos();
}
boot();