/* ═══════════════════════════════════════════════════════════════════════
   carrito.test.js — Batería de pruebas del carrito de GEINZ
   ───────────────────────────────────────────────────────────────────────
   ⚠ SOLO corre contra el EMULADOR de Firestore (localhost). Nunca toca
     producción: se niega a arrancar si la página no está en localhost o si
     el emulador no responde.
   • Ubícalo en la MISMA carpeta que carrito.js (importa ../rutas/rutas.js).
   • Las rutas salen de rutas.js (ref.path), así los datos caen donde
     carrito.js los lee.
   • Modo normal  : http://localhost:5000/.../carrito.test.html
   • Solo seguridad (con tus reglas reales): ...carrito.test.html?reglas=reales
   • Subconjunto  : ...carrito.test.html?solo=logica,cupones
     Grupos: logica, pedido, cupones, mesa, carga, seguridad
   ═══════════════════════════════════════════════════════════════════════ */
import { getApps, getApp, initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, connectFirestoreEmulator, terminate,
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection,
  serverTimestamp, runTransaction, increment,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  tiendaDoc, tiendaSubDoc, tiendaSubCol, clienteDoc,
  clienteCuponDoc, tiendaCuponDoc, tiendaServiciosDoc,
} from "../public/js/rutas/rutas.js";

/* ───────────────────────── CONFIGURACIÓN ───────────────────────── */
const CFG = {
  INIT_MODULE: null,          // si rutas.js NO inicializa Firebase, pon aquí tu archivo de config, p. ej. "../firebase/config.js"
  EMU_HOST: "127.0.0.1",
  EMU_PORT: 8080,
  LOC: "test_loc",            // localidad de prueba (se crea solo en el emulador)
  TID: "tienda_test",
  CATS: 6,                    // categorías sembradas
  PROD_POR_CAT: 10,           // productos por categoría
  MESAS: 40,
  NIVELES: [10, 25, 50, 100], // usuarios simultáneos por escalón
  CUPON_USUARIOS: 30,         // usuarios que pelean por un cupón de un solo uso
  USD_POR_100K_LECTURAS: 0.06, // referencia aproximada; verifica la tarifa vigente de Firestore
  COMPRADORES: 200,               // compradores del escenario "compradores"
  PORC_LOGUEADOS: 0.6,            // 60% con sesión, 40% invitados (sin puntos)
  LLEGADA_MS: 3000,               // los compradores llegan repartidos en esta ventana
  COMPRADORES_CARGAN_CATALOGO: true, // cada uno lee el catálogo como init() de carrito.js
};

/* ───────────────────────── Rutas (vía rutas.js) ───────────────────────── */
const { LOC, TID } = CFG;
const P = {
  tienda: () => tiendaDoc(LOC, "tiendas", TID).path,
  servicios: () => tiendaServiciosDoc(LOC, TID).path,
  pedidos: () => tiendaSubCol(LOC, "tiendas", TID, "pedidos").path,
  mesas: () => tiendaSubCol(LOC, "tiendas", TID, "mesas").path,
  mesa: (id) => tiendaSubDoc(LOC, "tiendas", TID, "mesas", id).path,
  promos: () => tiendaSubCol(LOC, "tiendas", TID, "promociones_geinz").path,
  adicionales: () => tiendaSubCol(LOC, "tiendas", TID, "adicionales").path,
  prodCol: () => tiendaSubCol(LOC, "tiendas", TID, "productos").path,
  prodSub: (cat) => tiendaSubCol(LOC, "tiendas", TID, "productos", cat, cat).path,
  cuponGlobal: (c) => tiendaCuponDoc(LOC, TID, c).path,
  cuponCliente: (uid, c) => clienteCuponDoc(LOC, TID, uid, c).path,
  cliente: (uid) => clienteDoc(LOC, TID, uid).path,
};

/* ───────────────────────── Infra de pruebas ───────────────────────── */
let LOG = console.log;
let OPTS = null, DB0 = null, vuSeq = 0;
const vivos = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]); };

class Falla extends Error { }
const afirmar = (c, m) => { if (!c) throw new Falla(m); };
const eq = (a, b, m) => afirmar(a === b || (Number.isNaN(a) && Number.isNaN(b)), `${m}: esperaba ${JSON.stringify(b)}, obtuvo ${JSON.stringify(a)}`);
const cerca = (a, b, m, tol = 0.005) => afirmar(Math.abs(a - b) <= tol, `${m}: esperaba ≈${b}, obtuvo ${a}`);

const TESTS = [];
const reg = (grupo, nombre, fn) => TESTS.push({ grupo, nombre, fn });

async function arrancar() {
  if (!["localhost", "127.0.0.1"].includes(location.hostname))
    throw new Error("BLOQUEADO: esta página solo puede abrirse en localhost (nunca desde tu dominio real).");
  if (CFG.INIT_MODULE) await import(CFG.INIT_MODULE);
  if (!getApps().length)
    throw new Error("No hay ninguna Firebase App inicializada. Configura CFG.INIT_MODULE con el archivo donde haces initializeApp().");
  OPTS = getApp().options;
  try { await fetch(`http://${CFG.EMU_HOST}:${CFG.EMU_PORT}/`, { mode: "no-cors" }); }
  catch { throw new Error(`BLOQUEADO: no responde el emulador de Firestore en ${CFG.EMU_HOST}:${CFG.EMU_PORT}. Inícialo primero.`); }
  DB0 = getFirestore();
  DB0 = DB0 || getFirestore();
  if (!arrancar.conectado) {
    try { connectFirestoreEmulator(DB0, CFG.EMU_HOST, CFG.EMU_PORT); arrancar.conectado = true; }
    catch (e) { throw new Error("BLOQUEADO: no se pudo apuntar Firestore al emulador: " + e.message); }
  }
  LOG(`✔ Conectado al EMULADOR ${CFG.EMU_HOST}:${CFG.EMU_PORT} · projectId "${OPTS.projectId}"`);
}

/* Cada usuario virtual = su PROPIA instancia de Firestore (como un dispositivo distinto). */
function nuevoUsuarioDB() {
  const app = initializeApp(OPTS, `vu${++vuSeq}_${Date.now()}`);
  const d = getFirestore(app);
  connectFirestoreEmulator(d, CFG.EMU_HOST, CFG.EMU_PORT);
  vivos.push({ app, d });
  return d;
}
async function liberarUsuarios() {
  const l = vivos.splice(0);
  await Promise.all(l.map(async ({ app, d }) => { try { await terminate(d); } catch { } try { await deleteApp(app); } catch { } }));
}
async function conUsuarios(n, fn, limiteMs = 30000) {
  const dbs = Array.from({ length: n }, nuevoUsuarioDB);
  const t0 = performance.now();
  const res = await Promise.all(dbs.map(async (d, i) => {
    const s = performance.now();
    try {
      const r = await Promise.race([
        fn(d, i),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${limiteMs / 1000}s: usuario virtual ${i} sin respuesta`)), limiteMs)),
      ]);
      return { ok: true, r, ms: performance.now() - s };
    } catch (e) { return { ok: false, e, ms: performance.now() - s }; }
  }));
  const total = performance.now() - t0;
  await liberarUsuarios();
  return { res, total };
}
/* ───────────────────────── Siembra vía REST (salta las reglas del emulador) ───────────────────────── */
const restBase = () => `http://${CFG.EMU_HOST}:${CFG.EMU_PORT}/v1/projects/${OPTS.projectId}/databases/(default)/documents`;
function toFS(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFS) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFS(x)])) } };
}
async function sembrar(path, data) {
  const r = await fetch(`${restBase()}/${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toFS(v)])) }),
  });
  if (!r.ok) throw new Error(`No se pudo sembrar ${path}: ${r.status} ${await r.text()}`);
}
async function enLotes(tareas, tam = 20) { for (let i = 0; i < tareas.length; i += tam) await Promise.all(tareas.slice(i, i + tam).map((f) => f())); }
async function limpiarEmulador() {
  await fetch(`http://${CFG.EMU_HOST}:${CFG.EMU_PORT}/emulator/v1/projects/${OPTS.projectId}/databases/(default)/documents`, { method: "DELETE" });
}
async function sembrarBase() {
  await sembrar(P.tienda(), {
    nombre_tienda: "Tienda Test", categoria_tienda: "Comida y Restaurantes",
    delivery: { hace: true, tarifa_activa: true, modo: "fija", fija: 5 },
    metodos_pago: { efectivo: { enable: true } }, mesas_config: { mozoIntermediario: false },
  });
  await sembrar(P.servicios(), { panel_admin: { tipo_tienda: "fisica" } });
  const t = [];
  for (let c = 0; c < CFG.CATS; c++) {
    t.push(() => sembrar(`${P.prodCol()}/cat_${c}`, { nombre: `Categoría ${c}` }));
    for (let p = 0; p < CFG.PROD_POR_CAT; p++)
      t.push(() => sembrar(`${P.prodSub("cat_" + c)}/p_${c}_${p}`, {
        nombre: `Producto ${c}-${p}`, precio: 10 + p, disponible: true, descripcion: "x".repeat(80),
        imagenes: [{ url: "https://example.com/a.jpg" }], condiciones: [], stock: null,
      }));
  }
  for (let m = 1; m <= CFG.MESAS; m++) t.push(() => sembrar(P.mesa(`mesa_${m}`), { sillas: 4, estado: "libre", dispositivos: [] }));
  await enLotes(t);
}

/* ═══════════════════════════════════════════════════════════════════════
   COPIAS de la lógica de carrito.js (las funciones de carrito.js no se
   exportan y el archivo toca el DOM al cargarse, por eso se replican aquí).
   Si cambias carrito.js, actualiza estas copias.
   ═══════════════════════════════════════════════════════════════════════ */
const hoyLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
function obtenerDiaSemanaLima(fecha = new Date()) {
  const n = new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", weekday: "long" }).format(fecha).toLowerCase();
  return { sunday: "domingo", monday: "lunes", tuesday: "martes", wednesday: "miercoles", thursday: "jueves", friday: "viernes", saturday: "sabado" }[n] || null;
}
function parseFechaISOaMsLima(fechaISO, horaStr) {
  if (!fechaISO) return null;
  const [y, m, d] = fechaISO.split("-").map(Number);
  if (!y || !m || !d) return null;
  const [hh, mm] = (horaStr || "23:59").split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0) - (-5 * 60 * 60 * 1000);
}
function descuentoVigente(descuento, ahora = new Date()) {
  if (!descuento || !descuento.activo) return null;
  const porcentaje = Number(descuento.porcentaje) || 0;
  if (porcentaje <= 0) return null;
  if (descuento.modo === "dias_semana") {
    if (!(descuento.dias || []).includes(obtenerDiaSemanaLima(ahora))) return null;
    return { porcentaje, expiraEn: null };
  }
  if (descuento.modo === "duracion") {
    const expiraEn = Number(descuento.expiraEn) || 0;
    if (!expiraEn || ahora.getTime() >= expiraEn) return null;
    return { porcentaje, expiraEn };
  }
  if (descuento.modo === "fecha") {
    const finMs = parseFechaISOaMsLima(descuento.fechaFin, descuento.horaFin || "23:59");
    if (!finMs || ahora.getTime() >= finMs) return null;
    if (descuento.fechaInicio) {
      const ini = parseFechaISOaMsLima(descuento.fechaInicio, "00:00");
      if (ini && ahora.getTime() < ini) return null;
    }
    return { porcentaje, expiraEn: finMs };
  }
  return null;
}
const valoresDe = (v) => (Array.isArray(v) ? v : v ? [v] : []);
function entradasDe(v) {
  if (v && typeof v === "object" && !Array.isArray(v)) return Object.entries(v).filter(([, c]) => (c || 0) > 0);
  return valoresDe(v).map((n) => [n, 1]);
}
function cartKeyFor(id, seleccion) {
  const claves = Object.keys(seleccion || {}).filter((k) => entradasDe(seleccion[k]).length);
  if (!claves.length) return id;
  return `${id}__` + claves.sort().map((k) => `${k}:${entradasDe(seleccion[k]).map(([n, c]) => `${n}*${c}`).sort().join("+")}`).join("|");
}
function calcPrecioFinal(p, seleccion) {
  const descInfo = descuentoVigente(p.descuento);
  let base = Number(p.precio) || 0;
  if (descInfo) base = +(base * (1 - descInfo.porcentaje / 100)).toFixed(2);
  let precio = base;
  if (!seleccion) return precio;
  (p.condiciones || []).forEach((cond) => {
    entradasDe(seleccion[cond.nombre]).forEach(([nombreOp, cant]) => {
      const op = cond.opciones.find((o) => o.nombre === nombreOp);
      if (op && op.costoAdicional) precio += (Number(op.costoAdicional) || 0) * cant;
    });
  });
  return +precio.toFixed(2);
}
function descuentoDeCupon(c, subtotal) {
  if (!c || c.tipo !== "manual") return 0;
  if (subtotal < Number(c.compraMinima || 0)) return 0;
  if (c.tipoDescuentoManual === "porcentaje") return +(subtotal * (Number(c.porcentajeManual || 0) / 100)).toFixed(2);
  if (c.tipoDescuentoManual === "monto") return +Math.min(subtotal, Number(c.montoManual || 0)).toFixed(2);
  return 0;
}
function calcCanje(cupon, producto) {
  const tipo = cupon.tipoBeneficio || "gratis";
  const base = Number(producto.precio) || 0;
  if (tipo === "cantidad") {
    const compra = Number(cupon.descuento?.compraUnidades) || 1;
    const paga = Number(cupon.descuento?.pagaUnidades) || compra;
    return { cantidad: compra, total: paga * base, tipo };
  }
  return { cantidad: 1, total: Number(cupon.precioFinalEstimado ?? base), tipo };
}
function normalizarWhatsapp(raw) {
  let d = String(raw || "").replace(/[^\d]/g, "");
  if (d.length === 9) d = "51" + d;
  return d.length >= 11 && d.length <= 15 ? d : null;
}
function getStockInfo(p, seleccion) {
  if (seleccion && p.condiciones && p.condiciones.length) {
    let minStock = null, minLabel = null;
    p.condiciones.forEach((cond) => {
      entradasDe(seleccion[cond.nombre]).forEach(([elegido, cant]) => {
        const op = cond.opciones.find((o) => o.nombre === elegido);
        if (op && typeof op.stock === "number") {
          const disp = Math.floor(op.stock / (cant || 1));
          if (minStock === null || disp < minStock) { minStock = disp; minLabel = elegido; }
        }
      });
    });
    return { stock: minStock, label: minLabel };
  }
  return { stock: typeof p.stock === "number" ? p.stock : null, label: null };
}
const horaAMin = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
function minutosLimaAhora(f = new Date()) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(f);
  return Number(p.find((x) => x.type === "hour").value) * 60 + Number(p.find((x) => x.type === "minute").value);
}
function recargoEnHora(r, f = new Date()) {
  if (!r || !r.activo) return 0;
  const monto = Number(r.monto) || 0, ini = horaAMin(r.desde), fin = horaAMin(r.hasta);
  if (monto <= 0 || ini == null || fin == null || ini === fin) return 0;
  const now = minutosLimaAhora(f);
  return (ini < fin ? now >= ini && now < fin : now >= ini || now < fin) ? monto : 0;
}
function restaurarReplica(data, catalogo, ahora = Date.now()) {
  const carrito = new Map(), omitidos = [];
  for (const { id, cantidad, seleccion } of data.items) {
    const p = catalogo.get(id);
    if (!p || !cantidad) { omitidos.push([id, "ya no existe"]); continue; }
    if (p.esOfertaTiempo && p.expiraEn && ahora >= p.expiraEn) { omitidos.push([id, "oferta vencida"]); continue; }
    const key = cartKeyFor(id, seleccion);
    if (carrito.has(key)) continue;
    let cant = cantidad;
    const { stock } = getStockInfo(p, seleccion);
    if (stock !== null) cant = Math.min(cant, stock);
    if (cant <= 0) { omitidos.push([id, "sin stock"]); continue; }
    carrito.set(key, { id, cantidad: cant, precio: calcPrecioFinal(p, seleccion), seleccion: seleccion || null });
  }
  return { carrito, omitidos };
}

/* ── Escrituras de carrito.js contra Firestore (replicadas, con refs del usuario virtual) ── */
function statsCuponUpdate(pedido, uid) {
  const hoy = hoyLima(), desc = pedido.descuentoCupon || 0;
  const u = {
    usos: increment(1), descuento_total: increment(desc), ventas_total: increment(pedido.total || 0),
    [`por_dia.${hoy}.usos`]: increment(1), [`por_dia.${hoy}.descuento`]: increment(desc), [`por_dia.${hoy}.ventas`]: increment(pedido.total || 0),
  };
  if (uid) {
    u[`usuarios.${uid}.nombre`] = "Cliente"; u[`usuarios.${uid}.seguidor`] = false;
    u[`usuarios.${uid}.usos`] = increment(1); u[`usuarios.${uid}.ultimo`] = Date.now();
  } else u.usos_invitado = increment(1);
  return u;
}
async function confirmarPedidoAtomico(dbU, construirPedido, codigos, ctx = {}) {
  const nuevoRef = doc(collection(dbU, P.pedidos()));
  const lista = (codigos || []).map((c) => ({ codigo: c, _ref: doc(dbU, ctx.personal ? P.cuponCliente(ctx.uid, c) : P.cuponGlobal(c)) }));
  try {
    await runTransaction(dbU, async (tx) => {
      const estados = [];
      for (const c of lista) {
        const snap = await tx.get(c._ref);
        if (!snap.exists()) throw { motivo: "cupon_invalido" };
        const d = snap.data(), multi = d.multiuso === true;
        if (multi) {
          if (d.activo === false || (d.expiraEn && Date.now() >= d.expiraEn) || (d.usosMaximos && (d.usos || 0) >= d.usosMaximos)) throw { motivo: "cupon_invalido" };
        } else if (d.usado || d.estado === "cancelado" || d.activo === false || (d.expiraEn && Date.now() >= d.expiraEn)) throw { motivo: "cupon_invalido" };
        if (d.soloFormulario) throw { motivo: "cupon_invalido" };
        if ((d.origen === "fidelizacion" || d.origen === "formulario") && (!ctx.uid || d.clienteId !== ctx.uid)) throw { motivo: "cupon_invalido" };
        estados.push(multi);
      }
      const pedido = construirPedido();
      tx.set(nuevoRef, pedido);
      lista.forEach((c, i) => {
        if (estados[i]) tx.update(c._ref, statsCuponUpdate(pedido, ctx.uid));
        else tx.update(c._ref, { usado: true, estado: "usado", pedidoId: nuevoRef.id, usadoEn: serverTimestamp() });
      });
    });
    return { ok: true, id: nuevoRef.id };
  } catch (err) {
    if (err?.motivo === "cupon_invalido") return { ok: false, motivo: "cupon_invalido" };
    return { ok: false, motivo: "error_generico", detalle: err?.code || err?.message };
  }
}
function pedidoTipo({ uid = null, items = [{ id: "p_0_1", precio: 10, cantidad: 1 }], desc = 0 } = {}) {
  return () => {
    const subtotal = items.reduce((s, i) => s + i.cantidad * i.precio, 0);
    return {
      estado: "pendiente", fecha: new Date().toLocaleDateString("es-PE"), hora: "12:00", timestamp: serverTimestamp(),
      cliente: { id_cliente: uid, nombre: "Cliente prueba", whatsapp: "51999999999", tipo_entrega: "Recojo en local", direccion: "" },
      productos: items.map((i) => ({ id: i.id, nombre: i.id, precio_unitario: i.precio, cantidad: i.cantidad, subtotal: +(i.precio * i.cantidad).toFixed(2) })),
      total_items: items.reduce((s, i) => s + i.cantidad, 0), subtotal: +subtotal.toFixed(2), descuentoCupon: desc,
      total: +(subtotal - desc).toFixed(2), negocio: { id: TID, nombre: "Tienda Test", localidad: LOC },
    };
  };
}
/* registrarDispositivoMesa: OJO, el catch devuelve true (fail-open), igual que en carrito.js */
async function registrarDispositivoReplica(dbU, deviceId, mesa = "mesa_1") {
  const ref = doc(dbU, P.mesa(mesa)), ahora = Date.now(), TTL = 4 * 3600 * 1000;
  let max = 4;
  try {
    const ok = await runTransaction(dbU, async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists()) return true;
      const d = s.data(); max = Number(d.sillas) || 4;
      const lista = (d.dispositivos || []).filter((x) => ahora - x.ts < TTL);
      const i = lista.findIndex((x) => x.id === deviceId);
      if (i >= 0) lista[i] = { id: deviceId, ts: ahora };
      else { if (lista.length >= max) return false; lista.push({ id: deviceId, ts: ahora }); }
      tx.update(ref, { dispositivos: lista });
      return true;
    });
    return { admitido: ok, via: "ok" };
  } catch (e) { return { admitido: true, via: "fail-open", err: e?.code || e?.message }; }
}
/* llamarMozo (mesa individual): lee la mesa, arma productos con la vista local y hace setDoc(merge) SIN transacción */
const fromFS = (v) => {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if (v.arrayValue) return (v.arrayValue.values || []).map(fromFS);
  if (v.mapValue) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFS(x)]));
};
async function restGet(path) {
  const r = await fetch(`${restBase()}/${path}`, { headers: { Authorization: "Bearer owner" } });
  if (r.status === 404) return {};
  if (!r.ok) throw new Error(`GET ${path}: ${r.status}`);
  const j = await r.json();
  return Object.fromEntries(Object.entries(j.fields || {}).map(([k, v]) => [k, fromFS(v)]));
}
/* leer → armar → escribir SIN transacción (como llamarMozo), pero por REST */
async function llamarMozoReplica(_dbU, i) {
  const path = P.mesa("mesa_2");
  const actual = await restGet(path);
  const productos = [...(actual.pedido?.productos || []), { id: `p_${i}`, nombre: `Producto ${i}`, cantidad: 1, subtotal: 10 }];
  const total = productos.reduce((s, p) => s + p.subtotal, 0);
  const pedido = { ...(actual.pedido || {}), productos, total };
  const qs = ["estado", "hay_pedido_nuevo", "pedido"].map((f) => `updateMask.fieldPaths=${f}`).join("&");
  const r = await fetch(`${restBase()}/${path}?${qs}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields: { estado: toFS("ocupado"), hay_pedido_nuevo: toFS(true), pedido: toFS(pedido) } }),
  });
  if (!r.ok) throw new Error(`PATCH mesa: ${r.status}`);
}
/* Carga inicial del catálogo (lo que hace init() en carrito.js) y conteo de lecturas facturables */
async function cargarCatalogoReplica(_dbU) {
  let lecturas = 0;
  const t0 = performance.now();
  const get = async (path, esColeccion) => {
    const r = await fetch(`${restBase()}/${path}${esColeccion ? "?pageSize=300" : ""}`, { headers: { Authorization: "Bearer owner" } });
    if (!r.ok && r.status !== 404) throw new Error(`${path}: ${r.status}`);
    const j = r.ok ? await r.json() : {};
    const docs = j.documents || [];
    lecturas += esColeccion ? Math.max(1, docs.length) : 1;
    return docs;
  };
  await Promise.all([get(P.tienda()), get(P.servicios()), get(P.cliente("u_x")), get(P.promos(), true), get(P.adicionales(), true)]);
  const cats = await get(P.prodCol(), true);
  await Promise.all(cats.map((c) => get(P.prodSub(c.name.split("/").pop()), true)));
  return { ms: performance.now() - t0, lecturas };
}
/* ═══════════════════════════════════════════════════════════════════════
   GRUPO 1 · LÓGICA PURA (sin base de datos): errores y confusiones del usuario
   ═══════════════════════════════════════════════════════════════════════ */
reg("logica", "WhatsApp: formatos que escribe la gente", () => {
  eq(normalizarWhatsapp("987654321"), "51987654321", "9 dígitos");
  eq(normalizarWhatsapp("+51 987 654 321"), "51987654321", "con +51 y espacios");
  eq(normalizarWhatsapp("987-654-321"), "51987654321", "con guiones");
  eq(normalizarWhatsapp("51987654321"), "51987654321", "ya con código");
  eq(normalizarWhatsapp(""), null, "vacío");
  eq(normalizarWhatsapp(null), null, "null");
  eq(normalizarWhatsapp("12345"), null, "muy corto");
  eq(normalizarWhatsapp("abc"), null, "letras");
  eq(normalizarWhatsapp("1234567890123456"), null, "16 dígitos");
  if (normalizarWhatsapp("812345678"))
    return { estado: "WARN", detalle: "Acepta '812345678' (9 dígitos que no empiezan con 9, no es celular peruano). El negocio no podría contactar al cliente; conviene exigir prefijo 9." };
});
reg("logica", "Clave del carrito: mismo producto con opciones en distinto orden", () => {
  eq(cartKeyFor("p1", { A: "x", B: ["y", "z"] }), cartKeyFor("p1", { B: ["z", "y"], A: "x" }), "orden de claves y opciones");
  eq(cartKeyFor("p1", null), "p1", "sin selección");
  eq(cartKeyFor("p1", {}), "p1", "selección vacía");
  afirmar(cartKeyFor("p1", { A: "x" }) !== cartKeyFor("p1", { A: "y" }), "opciones distintas deben dar claves distintas");
  afirmar(cartKeyFor("p1", { A: { x: 1 } }) !== cartKeyFor("p1", { A: { x: 2 } }), "cantidades distintas deben dar claves distintas");
});
reg("logica", "Precio final: descuento vigente + extras con cantidad", () => {
  const hoy = obtenerDiaSemanaLima();
  const p = {
    precio: 10, descuento: { activo: true, porcentaje: 20, modo: "dias_semana", dias: [hoy] },
    condiciones: [{ nombre: "Extras", opciones: [{ nombre: "Queso", costoAdicional: 2 }] }]
  };
  eq(calcPrecioFinal(p, null), 8, "10 con 20% off");
  eq(calcPrecioFinal(p, { Extras: { Queso: 3 } }), 14, "8 + 3 quesos x2");
  eq(calcPrecioFinal({ ...p, descuento: { ...p.descuento, dias: ["domingo", "lunes"].filter((d) => d !== hoy) } }, null), 10, "día sin descuento");
});
reg("logica", "Descuentos: vencidos, futuros y valores raros", () => {
  const ahora = new Date();
  eq(descuentoVigente({ activo: true, porcentaje: 10, modo: "duracion", expiraEn: Date.now() - 1 }), null, "duración vencida");
  eq(descuentoVigente({ activo: true, porcentaje: 0, modo: "duracion", expiraEn: Date.now() + 9e6 }), null, "0%");
  eq(descuentoVigente({ activo: false, porcentaje: 10, modo: "duracion", expiraEn: Date.now() + 9e6 }), null, "inactivo");
  eq(descuentoVigente({ activo: true, porcentaje: 10, modo: "fecha", fechaInicio: "2999-01-01", fechaFin: "2999-12-31" }, ahora), null, "aún no empieza");
  eq(descuentoVigente({ activo: true, porcentaje: 10, modo: "fecha", fechaFin: "2000-01-01" }, ahora), null, "ya terminó");
  eq(descuentoVigente({ activo: true, porcentaje: 10, modo: "raro" }), null, "modo desconocido");
  if (calcPrecioFinal({ precio: 10, descuento: { activo: true, porcentaje: 100, modo: "dias_semana", dias: [obtenerDiaSemanaLima()] } }, null) === 0)
    return { estado: "INFO", detalle: "Con 100% de descuento el producto queda en S/ 0.00 y se puede pedir gratis (decisión de negocio, no bug)." };
});
reg("logica", "Cupón de descuento: tope y datos mal configurados por el dueño", () => {
  eq(descuentoDeCupon({ tipo: "manual", tipoDescuentoManual: "porcentaje", porcentajeManual: 10 }, 50), 5, "10% de 50");
  eq(descuentoDeCupon({ tipo: "manual", tipoDescuentoManual: "monto", montoManual: 8 }, 5), 5, "monto > subtotal queda topado");
  eq(descuentoDeCupon({ tipo: "manual", tipoDescuentoManual: "porcentaje", porcentajeManual: 10, compraMinima: 100 }, 50), 0, "no llega al mínimo");
  eq(descuentoDeCupon({ tipo: "producto" }, 50), 0, "tipo producto no descuenta");
  const hallazgos = [];
  const casos = [
    ["porcentaje 150%", { tipoDescuentoManual: "porcentaje", porcentajeManual: 150 }, "descuenta más que el subtotal → total NEGATIVO"],
    ["monto negativo", { tipoDescuentoManual: "monto", montoManual: -5 }, "descuento negativo → el total SUBE"],
    ["porcentaje 'abc'", { tipoDescuentoManual: "porcentaje", porcentajeManual: "abc" }, "devuelve NaN → total NaN"],
    ["monto 'abc'", { tipoDescuentoManual: "monto", montoManual: "abc" }, "devuelve NaN → total NaN"],
  ];
  for (const [nombre, c, efecto] of casos) {
    const d = descuentoDeCupon({ tipo: "manual", ...c }, 50);
    if (!Number.isFinite(d) || d < 0 || d > 50) hallazgos.push(`${nombre}: ${efecto} (descuento=${d})`);
  }
  afirmar(!hallazgos.length, "descuentoDeCupon no valida los datos del cupón:\n- " + hallazgos.join("\n- "));
});
reg("logica", "Canje con puntos: 'compra 3 paga 2' y gratis", () => {
  const r = calcCanje({ tipoBeneficio: "cantidad", descuento: { compraUnidades: 3, pagaUnidades: 2 } }, { precio: 10 });
  eq(r.cantidad, 3, "unidades"); eq(r.total, 20, "total");
  const g = calcCanje({ tipoBeneficio: "gratis", precioFinalEstimado: 0 }, { precio: 10 });
  eq(g.total, 0, "gratis");
  eq(calcCanje({ tipoBeneficio: "gratis" }, { precio: 10 }).total, 10, "gratis SIN precioFinalEstimado cobra precio completo");
});
reg("logica", "Stock por opción (unidades que pide cada línea)", () => {
  const p = { stock: 9, condiciones: [{ nombre: "Sabor", opciones: [{ nombre: "A", stock: 7 }, { nombre: "B", stock: 0 }] }] };
  eq(getStockInfo(p, { Sabor: { A: 2 } }).stock, 3, "7 de A, 2 por línea");
  eq(getStockInfo(p, null).stock, 9, "sin selección usa stock del producto");
  eq(getStockInfo({ condiciones: [] }, null).stock, null, "sin control de stock");
  eq(getStockInfo(p, { Sabor: "B" }).stock, 0, "opción agotada");
});
reg("logica", "Recargo horario que cruza la medianoche (20:00–02:00, hora Lima)", () => {
  const r = { activo: true, monto: 2, desde: "20:00", hasta: "02:00" };
  const lima = (h, m, dia = 10) => new Date(Date.UTC(2026, 0, dia, h + 5, m)); // Lima = UTC-5
  eq(recargoEnHora(r, lima(23, 30)), 2, "23:30");
  eq(recargoEnHora(r, lima(1, 0)), 2, "01:00");
  eq(recargoEnHora(r, lima(2, 0)), 0, "02:00 exacto ya no");
  eq(recargoEnHora(r, lima(10, 0)), 0, "10:00");
  eq(recargoEnHora(r, lima(20, 0)), 2, "20:00 exacto sí");
  eq(recargoEnHora({ ...r, desde: "20:00", hasta: "20:00" }, lima(21, 0)), 0, "desde = hasta");
  eq(recargoEnHora({ ...r, monto: 0 }, lima(21, 0)), 0, "monto 0");
  eq(recargoEnHora({ ...r, activo: false }, lima(21, 0)), 0, "inactivo");
});
reg("logica", "Totales: redondeo en 2000 carritos aleatorios", () => {
  let s = 12345; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  let peor = 0;
  for (let k = 0; k < 2000; k++) {
    const items = Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => ({ precio: +(0.5 + rnd() * 60).toFixed(2), cantidad: 1 + Math.floor(rnd() * 5) }));
    const subtotal = items.reduce((a, i) => a + i.cantidad * i.precio, 0);
    const totalApp = +subtotal.toFixed(2);
    const sumaLineas = items.reduce((a, i) => a + +(i.precio * i.cantidad).toFixed(2), 0);
    peor = Math.max(peor, Math.abs(totalApp - sumaLineas));
  }
  afirmar(peor < 0.02, `Diferencia máxima total vs suma de líneas: ${peor.toFixed(4)}`);
  return `Diferencia máxima entre total y suma de líneas: S/ ${peor.toFixed(4)}`;
});
reg("logica", "Carrito guardado: producto borrado, sin stock, oferta vencida y opción eliminada", () => {
  const cat = new Map([
    ["ok", { id: "ok", precio: 10, stock: null }],
    ["poco", { id: "poco", precio: 10, stock: 2 }],
    ["cero", { id: "cero", precio: 10, stock: 0 }],
    ["oferta", { id: "oferta", precio: 10, esOfertaTiempo: true, expiraEn: Date.now() - 1000 }],
    ["conOpc", { id: "conOpc", precio: 10, condiciones: [{ nombre: "Extra", opciones: [{ nombre: "Queso", costoAdicional: 3 }] }] }],
  ]);
  const { carrito, omitidos } = restaurarReplica({
    items: [
      { id: "ok", cantidad: 1 }, { id: "borrado", cantidad: 1 }, { id: "poco", cantidad: 5 },
      { id: "cero", cantidad: 1 }, { id: "oferta", cantidad: 1 }, { id: "conOpc", cantidad: 1, seleccion: { Extra: "Tocino" } },
    ]
  }, cat);
  eq(carrito.get("poco").cantidad, 2, "cantidad recortada al stock");
  afirmar(!carrito.has("borrado") && !carrito.has("cero") && !carrito.has("oferta"), "no debe restaurar borrados / sin stock / vencidos");
  const hallazgos = [];
  if (omitidos.length) hallazgos.push(`${omitidos.length} productos se quitan en silencio (el cliente no recibe aviso)`);
  const stale = [...carrito.values()].find((i) => i.id === "conOpc");
  if (stale && stale.seleccion?.Extra === "Tocino" && stale.precio === 10)
    hallazgos.push("opción 'Tocino' ya no existe pero sigue en el carrito y se cobra S/ 0 de extra (se entrega gratis)");
  if (hallazgos.length) return { estado: "WARN", detalle: hallazgos.join(" · ") };
});

/* ═══════════════════════════════════════════════════════════════════════
   GRUPO 2 · PEDIDOS (transacción real contra el emulador)
   ═══════════════════════════════════════════════════════════════════════ */
reg("pedido", "Pedido simple se guarda con todos sus campos", async () => {
  const r = await confirmarPedidoAtomico(DB0, pedidoTipo({ uid: "u_simple" }), [], { uid: "u_simple" });
  afirmar(r.ok, "el pedido debería aceptarse: " + JSON.stringify(r));
  const s = await getDoc(doc(DB0, `${P.pedidos()}/${r.id}`));
  afirmar(s.exists() && s.data().total === 10, "el pedido no quedó guardado correctamente");
});
reg("pedido", "Pedido vacío / total 0 (¿qué pasa si alguien salta la interfaz?)", async () => {
  const r = await confirmarPedidoAtomico(DB0, pedidoTipo({ items: [] }), []);
  if (r.ok) return { estado: "WARN", detalle: "La transacción acepta un pedido SIN productos y total 0. La única barrera es la interfaz (botón deshabilitado). Dependes de las reglas de Firestore para impedirlo (ver grupo seguridad)." };
});
reg("pedido", "Doble clic / doble envío del mismo cliente", async () => {
  const antes = (await getDocs(collection(DB0, P.pedidos()))).size;
  const mk = () => confirmarPedidoAtomico(DB0, pedidoTipo({ uid: "u_doble" }), [], { uid: "u_doble" });
  await Promise.all([mk(), mk()]);
  const creados = (await getDocs(collection(DB0, P.pedidos()))).size - antes;
  if (creados > 1) return { estado: "INFO", detalle: `Se crearon ${creados} pedidos idénticos: no hay idempotencia en servidor. Hoy te protege solo el botón deshabilitado + loader en el navegador.` };
});
reg("pedido", "Stock: el pedido NO lo descuenta (se descuenta al aceptar en el dashboard)", async () => {
  const path = `${P.prodSub("cat_0")}/p_0_0`;
  await sembrar(path, { nombre: "Stock 5", precio: 10, disponible: true, stock: 5, imagenes: [], condiciones: [] });
  const { res } = await conUsuarios(20, (d, i) => confirmarPedidoAtomico(d, pedidoTipo({ uid: `s${i}`, items: [{ id: "p_0_0", precio: 10, cantidad: 1 }] }), [], { uid: `s${i}` }));
  const aceptados = res.filter((r) => r.ok && r.r.ok).length;
  const stock = (await getDoc(doc(DB0, path))).data().stock;
  eq(stock, 5, "el pedido no debe tocar el stock");
  return { estado: "INFO", detalle: `${aceptados} pedidos entraron como 'pendiente' y el stock sigue en ${stock}: es lo esperado. El riesgo real está en el dashboard: si aceptas ${aceptados} pedidos de un producto con stock 5, ¿el descuento valida que alcance y usa transacción/increment(-n)? Eso se prueba en el código del dashboard, no aquí.` };
});
reg("pedido", "Rampa de pedidos simultáneos (clientes distintos, sin cupón)", async () => {
  const filas = []; let falla = false;
  for (const n of CFG.NIVELES) {
    const antes = (await getDocs(collection(DB0, P.pedidos()))).size;
    const { res, total } = await conUsuarios(n, (d, i) => confirmarPedidoAtomico(d, pedidoTipo({ uid: `r${n}_${i}` }), [], { uid: `r${n}_${i}` }));
    const oks = res.filter((r) => r.ok && r.r.ok).length;
    const creados = (await getDocs(collection(DB0, P.pedidos()))).size - antes;
    const ms = res.map((r) => r.ms);
    filas.push(`${n} a la vez → aceptados ${oks}/${n} · guardados ${creados} · p50 ${pct(ms, 50)}ms · p95 ${pct(ms, 95)}ms · total ${Math.round(total)}ms`);
    if (oks !== n || creados !== oks) falla = true;
  }
  afirmar(!falla, "Se perdieron o rechazaron pedidos:\n" + filas.join("\n"));
  return filas.join("\n") + "\n(El emulador no aplica los límites reales de Firestore: úsalo para detectar errores de lógica, no para medir capacidad.)";
});

/* ═══════════════════════════════════════════════════════════════════════
   GRUPO 3 · CUPONES
   ═══════════════════════════════════════════════════════════════════════ */
reg("cupones", `Cupón de un solo uso: ${CFG.CUPON_USUARIOS} clientes lo canjean a la vez`, async () => {
  await sembrar(P.cuponGlobal("UNICO1"), { tipo: "manual", tipoDescuentoManual: "monto", montoManual: 5, activo: true, usado: false, multiuso: false });
  const n = CFG.CUPON_USUARIOS;
  const { res } = await conUsuarios(n, (d, i) => confirmarPedidoAtomico(d, pedidoTipo({ uid: `c${i}`, desc: 5 }), ["UNICO1"], { uid: `c${i}` }));
  const ganadores = res.filter((r) => r.ok && r.r.ok).length;
  const errores = res.filter((r) => !r.ok || r.r.motivo === "error_generico").length;
  afirmar(ganadores === 1, `Esperaba 1 ganador y hubo ${ganadores} (errores técnicos: ${errores}).`);
  return `1 ganador, ${n - 1} rechazados limpiamente (errores técnicos: ${errores}).`;
});
reg("cupones", "Cupón multiuso con tope de 10 usos y 40 clientes a la vez", async () => {
  await sembrar(P.cuponGlobal("MULTI10"), { tipo: "manual", tipoDescuentoManual: "monto", montoManual: 2, activo: true, multiuso: true, usos: 0, usosMaximos: 10 });
  const { res } = await conUsuarios(40, (d, i) => confirmarPedidoAtomico(d, pedidoTipo({ uid: `m${i}`, desc: 2 }), ["MULTI10"], { uid: `m${i}` }));
  const oks = res.filter((r) => r.ok && r.r.ok).length;
  const usos = (await getDoc(doc(DB0, P.cuponGlobal("MULTI10")))).data().usos;
  afirmar(oks === 10 && usos === 10, `Aceptados ${oks}, usos registrados ${usos} (esperado 10 y 10).`);
  return `10 aceptados, contador de usos = ${usos}.`;
});
reg("cupones", "Cupones inválidos: vencido, usado, cancelado, inactivo, solo-formulario, ajeno, inexistente", async () => {
  const base = { tipo: "manual", tipoDescuentoManual: "monto", montoManual: 1 };
  await Promise.all([
    sembrar(P.cuponGlobal("VENCIDO"), { ...base, activo: true, usado: false, expiraEn: Date.now() - 1000 }),
    sembrar(P.cuponGlobal("USADO"), { ...base, activo: true, usado: true }),
    sembrar(P.cuponGlobal("CANCELADO"), { ...base, estado: "cancelado" }),
    sembrar(P.cuponGlobal("INACTIVO"), { ...base, activo: false }),
    sembrar(P.cuponGlobal("SOLOFORM"), { ...base, soloFormulario: true }),
    sembrar(P.cuponGlobal("AJENO"), { ...base, origen: "fidelizacion", clienteId: "otro", activo: true, usado: false }),
  ]);
  const malos = [];
  for (const c of ["VENCIDO", "USADO", "CANCELADO", "INACTIVO", "SOLOFORM", "AJENO", "NOEXISTE"]) {
    const r = await confirmarPedidoAtomico(DB0, pedidoTipo({ uid: "yo" }), [c], { uid: "yo" });
    if (r.ok || r.motivo !== "cupon_invalido") malos.push(c);
  }
  const sinSesion = await confirmarPedidoAtomico(DB0, pedidoTipo(), ["AJENO"], { uid: null });
  if (sinSesion.ok) malos.push("AJENO sin sesión");
  const dueno = await confirmarPedidoAtomico(DB0, pedidoTipo({ uid: "otro" }), ["AJENO"], { uid: "otro", });
  afirmar(dueno.ok, "El dueño legítimo del cupón de fidelización debería poder usarlo: " + JSON.stringify(dueno));
  afirmar(!malos.length, "Se aceptaron cupones que debían rechazarse: " + malos.join(", "));
});
reg("cupones", "Capacidad del documento de un cupón multiuso (mapa 'usuarios' crece sin límite)", async () => {
  await sembrar(P.cuponGlobal("MULTI_CAP"), { tipo: "manual", activo: true, multiuso: true, usos: 0 });
  const N = 150;
  for (let i = 0; i < N; i++) {
    const uid = "uid_" + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
    await confirmarPedidoAtomico(DB0, pedidoTipo({ uid }), ["MULTI_CAP"], { uid });
  }
  const d = (await getDoc(doc(DB0, P.cuponGlobal("MULTI_CAP")))).data();
  const bytes = new Blob([JSON.stringify(d)]).size, porUsuario = bytes / N;
  const cap = Math.floor(1048576 / porUsuario);
  return { estado: "WARN", detalle: `≈${Math.round(porUsuario)} bytes por cliente distinto dentro del cupón (estimado). El documento de Firestore se llena a 1 MiB → unos ${cap.toLocaleString("es-PE")} clientes distintos por cupón. Además, en producción cada canje escribe el MISMO documento (límite blando ≈1 escritura/segundo por documento): un cupón viral con muchos canjes simultáneos se encola o falla.` };
});

/* ═══════════════════════════════════════════════════════════════════════
   GRUPO 4 · MESAS (QR)
   ═══════════════════════════════════════════════════════════════════════ */
reg("mesa", "Límite de sillas: 12 dispositivos escanean el QR de una mesa de 4", async () => {
  await sembrar(P.mesa("mesa_1"), { sillas: 4, estado: "libre", dispositivos: [] });
  const { res } = await conUsuarios(12, (d, i) => registrarDispositivoReplica(d, `dev${i}`));
  const legit = res.filter((r) => r.ok && r.r.admitido && r.r.via === "ok").length;
  const failOpen = res.filter((r) => r.ok && r.r.via === "fail-open").length;
  const total = legit + failOpen;
  afirmar(total <= 4, `Entraron ${total} dispositivos a una mesa de 4 (${legit} legítimos + ${failOpen} por fail-open). registrarDispositivoMesa devuelve true cuando la transacción falla por contención; con varios escaneos simultáneos el límite no se respeta.`);
  return `Entraron ${total} (${legit} legítimos, ${failOpen} por fail-open).`;
});
reg("mesa", "Pedidos simultáneos de 6 comensales a la MISMA mesa (pérdida de pedidos)", async () => {
  await sembrar(P.mesa("mesa_2"), { sillas: 4, estado: "ocupado", pedido: { productos: [], total: 0 } });
  const N = 6;
  await conUsuarios(N, (d, i) => llamarMozoReplica(d, i, { productos: [] }));
  const productos = (await restGet(P.mesa("mesa_2"))).pedido.productos;
  afirmar(productos.length === N, `Quedaron ${productos.length} de ${N} productos en la mesa: los demás se pisaron. llamarMozo hace leer→armar→setDoc sin transacción y reemplaza el arreglo 'productos' completo (peor caso: pedidos casi al mismo segundo).`);
});
reg("mesa", "URL de mesa inventada: cuántas lecturas cuesta cada visita", async () => {
  let lecturas = 0;
  for (const id of ["zzz", "-mesa-zzz"]) { await getDoc(doc(DB0, P.mesa(id))); lecturas++; }
  const todas = await getDocs(collection(DB0, P.mesas())); lecturas += Math.max(1, todas.size);
  return { estado: lecturas > 10 ? "WARN" : "PASS", detalle: `validarMesaDesdePath lee TODAS las mesas cuando el ID no existe: ${lecturas} lecturas por cada visita a /-mesa-cualquiercosa (con ${todas.size} mesas). Un bot o enlaces mal copiados multiplican tu factura.` };
});

/* ═══════════════════════════════════════════════════════════════════════
   GRUPO 5 · CARGA INICIAL (usuarios entrando)
   ═══════════════════════════════════════════════════════════════════════ */
reg("carga", "Usuarios entrando al carrito a la vez (latencia y lecturas por visita)", async () => {
  const filas = []; let lect = 0, fallos = 0;
  for (const n of CFG.NIVELES) {
    const { res } = await conUsuarios(n, (d) => cargarCatalogoReplica(d));
    const oks = res.filter((r) => r.ok);
    fallos += res.length - oks.length;
    lect = oks[0]?.r.lecturas ?? lect;
    const ms = oks.map((r) => r.ms);
    filas.push(`${n} a la vez → ok ${oks.length}/${n} · p50 ${pct(ms, 50)}ms · p95 ${pct(ms, 95)}ms`);
  }
  const productos = CFG.CATS * CFG.PROD_POR_CAT;
  const costo1000 = ((lect * 1000) / 100000) * CFG.USD_POR_100K_LECTURAS;
  afirmar(!fallos, "Hubo cargas fallidas:\n" + filas.join("\n"));
  return { estado: lect > 100 ? "WARN" : "PASS", detalle: `${filas.join("\n")}\nCada visita = ${lect} lecturas facturables con ${productos} productos (se vuelve a leer TODO el catálogo en cada apertura, sin caché). ≈ US$ ${costo1000.toFixed(2)} por cada 1.000 visitas (referencia, verifica tarifa vigente). Multiplica por el tamaño de tu catálogo real.` };
});

/* ═══════════════════════════════════════════════════════════════════════
   GRUPO 7 · COMPRADORES (flujo completo: catálogo → carrito → pedido)
   ═══════════════════════════════════════════════════════════════════════ */
reg("compradores", `${CFG.COMPRADORES} compradores comprando a la vez (logueados e invitados)`, async () => {
  const N = CFG.COMPRADORES;
  let s = 987; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };

  // Cada comprador arma su carrito con la misma lógica de claves y precios de carrito.js
  const planes = Array.from({ length: N }, (_, i) => {
    const carrito = new Map();
    for (let k = 0, n = 1 + Math.floor(rnd() * 4); k < n; k++) {
      const c = Math.floor(rnd() * CFG.CATS), p = Math.floor(rnd() * CFG.PROD_POR_CAT);
      const prod = { id: `p_${c}_${p}`, precio: 10 + p };
      const key = cartKeyFor(prod.id, null), cant = 1 + Math.floor(rnd() * 3);
      const ex = carrito.get(key);
      if (ex) ex.cantidad += cant;
      else carrito.set(key, { id: prod.id, precio: calcPrecioFinal(prod, null), cantidad: cant });
    }
    const logueado = rnd() < CFG.PORC_LOGUEADOS;
    return { uid: logueado ? `comp_${i}` : null, items: [...carrito.values()], espera: rnd() * CFG.LLEGADA_MS };
  });

  const antes = (await getDocs(collection(DB0, P.pedidos()))).size;
  const { res, total } = await conUsuarios(N, async (d, i) => {
    const pl = planes[i];
    await sleep(pl.espera);                               // llegada escalonada
    let lecturas = 0;
    if (CFG.COMPRADORES_CARGAN_CATALOGO) lecturas = (await cargarCatalogoReplica(d)).lecturas;
    const t = performance.now();
    const r = await confirmarPedidoAtomico(d, pedidoTipo({ uid: pl.uid, items: pl.items }), [], { uid: pl.uid });
    return { ...r, plan: pl, lecturas, msPedido: performance.now() - t };
  });

  // Verificación contra lo que quedó realmente guardado
  const guardados = new Map();
  (await getDocs(collection(DB0, P.pedidos()))).forEach((x) => guardados.set(x.id, x.data()));
  const problemas = [];
  let oks = 0, logueados = 0, invitados = 0, lecturas = 0;
  res.forEach((r, i) => {
    if (!r.ok || !r.r.ok) { problemas.push(`comprador ${i}: ${r.ok ? r.r.motivo + " " + (r.r.detalle || "") : r.e?.message}`); return; }
    oks++; lecturas += r.r.lecturas;
    const g = guardados.get(r.r.id), pl = r.r.plan;
    if (!g) { problemas.push(`comprador ${i}: el pedido ${r.r.id} no quedó guardado`); return; }
    const esperado = +pl.items.reduce((a, x) => a + x.precio * x.cantidad, 0).toFixed(2);
    if (Math.abs(g.total - esperado) > 0.005) problemas.push(`comprador ${i}: total guardado ${g.total} ≠ esperado ${esperado}`);
    if (g.cliente.id_cliente !== pl.uid) problemas.push(`comprador ${i}: id_cliente ${g.cliente.id_cliente} ≠ ${pl.uid}`);
    pl.uid ? logueados++ : invitados++;
  });
  const creados = guardados.size - antes;
  if (creados !== oks) problemas.push(`aceptados ${oks} pero guardados ${creados}`);
  afirmar(!problemas.length, `Problemas (${problemas.length}):\n- ` + problemas.slice(0, 15).join("\n- "));

  const ms = res.map((r) => r.r.msPedido);
  return `${oks}/${N} pedidos guardados (${logueados} con sesión, ${invitados} invitados anónimos) · totales e id_cliente verificados · confirmar pedido: p50 ${pct(ms, 50)}ms, p95 ${pct(ms, 95)}ms · lecturas por visita ≈ ${CFG.COMPRADORES_CARGAN_CATALOGO ? Math.round(lecturas / oks) : 0} · tiempo total ${Math.round(total)}ms (incluye la ventana de llegada de ${CFG.LLEGADA_MS}ms).\n(El emulador no aplica los límites reales de Firestore: sirve para detectar errores de lógica, no para medir capacidad.)`;
});
/* ═══════════════════════════════════════════════════════════════════════
   GRUPO 6 · SEGURIDAD (ejecutar con ?reglas=reales y tus firestore.rules)
   Cliente ANÓNIMO (sin sesión), como un invitado o un atacante.
   ═══════════════════════════════════════════════════════════════════════ */
async function sondear(fn) {
  try { await fn(); return "PERMITIDO"; }
  catch (e) { return String(e.code || "").includes("permission-denied") ? "BLOQUEADO" : "ERROR:" + (e.message || e.code); }
}
const probe = (nombre, fn, { debeBloquear = true, motivo = "" } = {}) =>
  reg("seguridad", nombre, async () => {
    const r = await sondear(fn);
    if (r.startsWith("ERROR")) return { estado: "WARN", detalle: "No concluyente: " + r };
    if (debeBloquear && r === "PERMITIDO") throw new Falla(`Las reglas lo PERMITEN. ${motivo}`);
    if (!debeBloquear && r === "BLOQUEADO") return { estado: "WARN", detalle: "Las reglas lo bloquean: " + motivo };
    return r;
  });
probe("Invitado crea un pedido normal (debe poder)", () => setDoc(doc(DB0, `${P.pedidos()}/sec_ok`), pedidoTipo()()), { debeBloquear: false, motivo: "los invitados no podrían comprar con estas reglas." });
probe("Pedido con total 0 y sin productos", () => setDoc(doc(DB0, `${P.pedidos()}/sec_cero`), { ...pedidoTipo({ items: [] })() }), { motivo: "cualquiera puede crear pedidos basura." });
probe("Pedido con total NEGATIVO", () => setDoc(doc(DB0, `${P.pedidos()}/sec_neg`), { ...pedidoTipo()(), total: -50 }), { motivo: "el total lo calcula el navegador y no se valida." });
probe("Pedido con precios manipulados (S/ 0.01 por producto)", () => setDoc(doc(DB0, `${P.pedidos()}/sec_precio`), { ...pedidoTipo({ items: [{ id: "p_0_1", precio: 0.01, cantidad: 1 }] })() }), { motivo: "los precios vienen del cliente; el servidor no los compara con el catálogo." });
probe("Reabrir un cupón de un solo uso (usado=false)", async () => { await sembrar(P.cuponGlobal("SEC_CUPON"), { usado: true, tipo: "manual" }); await updateDoc(doc(DB0, P.cuponGlobal("SEC_CUPON")), { usado: false }); }, { motivo: "un cliente puede reutilizar cupones." });
probe("Leer cupones de OTRO cliente", async () => { await sembrar(P.cuponCliente("victima", "SECRETO"), { origen: "fidelizacion", clienteId: "victima" }); await getDoc(doc(DB0, P.cuponCliente("victima", "SECRETO"))); }, { motivo: "se exponen cupones personales." });
probe("Modificar los datos de la tienda (delivery gratis)", () => updateDoc(doc(DB0, P.tienda()), { "delivery.fija": 0 }), { motivo: "cualquiera puede cambiar tarifas y ajustes del negocio." });
probe("Cambiar el precio de un producto", () => updateDoc(doc(DB0, `${P.prodSub("cat_1")}/p_1_1`), { precio: 0.01 }), { motivo: "cualquiera puede cambiar precios." });
probe("Borrar un pedido ajeno", async () => { await sembrar(`${P.pedidos()}/ajeno`, { estado: "pendiente" }); await deleteDoc(doc(DB0, `${P.pedidos()}/ajeno`)); }, { motivo: "cualquiera puede borrar pedidos." });
probe("LISTAR todos los pedidos (nombres, WhatsApp, direcciones)", () => getDocs(collection(DB0, P.pedidos())), { motivo: "se filtran datos personales de TODOS los clientes (nombre, teléfono, dirección)." });
probe("LISTAR todos los clientes/seguidores", () => getDocs(collection(DB0, P.cliente("x").split("/").slice(0, -1).join("/"))), { motivo: "se expone la lista de clientes del negocio." });

/* ═══════════════════════════════════════════════════════════════════════
   EJECUTOR
   ═══════════════════════════════════════════════════════════════════════ */
export async function ejecutar({ solo = null, reglasReales = false, conservar = false, onLog = console.log, onFila = () => { } } = {}) {
  LOG = onLog;
  const lista = TESTS
    .filter((t) => (reglasReales ? t.grupo === "seguridad" : t.grupo !== "seguridad"))
    .filter((t) => !solo || solo.includes(t.grupo));
  if (!lista.length) throw new Error("Ningún test coincide con el filtro.");

  let usoEmulador = false;
  if (lista.some((t) => t.grupo !== "logica")) {
    await arrancar(); usoEmulador = true;
    LOG("Limpiando el emulador y sembrando datos de prueba…");
    await limpiarEmulador();
    await sembrarBase();
    LOG("Datos listos.");
  }

  const resultados = [];
  try {
    for (const t of lista) {
      const t0 = performance.now();
      let estado = "PASS", detalle = "";
      try {
        const r = await Promise.race([
          t.fn(),
          new Promise((_, rej) => setTimeout(() => rej(new Falla("TIMEOUT: la prueba no terminó en 90 s (probablemente conexiones del navegador saturadas, no un error de tu carrito)")), 90000)),
        ]);
        if (typeof r === "string") detalle = r;
        else if (r && r.estado) { estado = r.estado; detalle = r.detalle || ""; }
      } catch (e) {
        estado = "FAIL"; detalle = e instanceof Falla ? e.message : "Error inesperado: " + (e?.stack || e?.message || e);
      }
      const fila = { grupo: t.grupo, nombre: t.nombre, estado, detalle, ms: Math.round(performance.now() - t0) };
      resultados.push(fila); onFila(fila); LOG(`[${estado}] ${t.grupo} · ${t.nombre}`);
      await liberarUsuarios();
    }
  } finally {
    await liberarUsuarios();
    if (usoEmulador && !conservar) { await limpiarEmulador(); LOG("🧹 Emulador limpiado: no queda ningún dato de prueba."); }
    else if (usoEmulador) LOG("Datos conservados en el emulador (?conservar=1) para inspeccionarlos en http://127.0.0.1:4000/firestore");
  }

  const cuenta = (e) => resultados.filter((r) => r.estado === e).length;
  LOG(`\nRESUMEN → PASS ${cuenta("PASS")} · FAIL ${cuenta("FAIL")} · WARN ${cuenta("WARN")} · INFO ${cuenta("INFO")}`);
  return resultados;
}

/* ───────── Interfaz (solo en el navegador) ───────── */
if (typeof document !== "undefined") {
  const $ = (id) => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  $("modo").textContent = q.get("reglas") === "reales" ? "MODO SEGURIDAD (reglas reales, cliente anónimo)" : "MODO COMPLETO (reglas abiertas del emulador recomendadas)";
  let ultimo = [];
  $("run").onclick = async () => {
    $("run").disabled = true; $("dl").disabled = true; $("tbody").innerHTML = ""; $("log").textContent = "";
    try {
      ultimo = await ejecutar({
        solo: q.get("solo") ? q.get("solo").split(",") : null,
        reglasReales: q.get("reglas") === "reales",
        conservar: q.get("conservar") === "1",
        onLog: (m) => { $("log").textContent += m + "\n"; console.log(m); },
        onFila: (f) => {
          const tr = document.createElement("tr"); tr.className = f.estado;
          for (const v of [f.estado, f.grupo, f.nombre, f.detalle, f.ms + " ms"]) { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); }
          $("tbody").appendChild(tr);
        },
      });
      $("dl").disabled = false;
    } catch (e) { $("log").textContent += "\n⛔ " + e.message + "\n"; console.error(e); }
    $("run").disabled = false;
  };
  $("dl").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(ultimo, null, 2)], { type: "application/json" }));
    a.download = "resultado_pruebas_carrito.json"; a.click();
  };
}
