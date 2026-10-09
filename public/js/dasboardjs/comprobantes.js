/* =====================================================================
   comprobantes.js  ·  Módulo de comprobante electrónico (ticket)
   Ubicación: js/dasboardjs/comprobantes.js

   Dónde se guarda:
   - Config  → doc de la tienda, campo "config_comprobante" (+ caché localStorage 12 h)
   - Boleta  → campo "comprobante" DENTRO del pedido (sin colecciones nuevas)
   ===================================================================== */
import {
  getDoc,
  getDocs,
  collection,
  query,
  where,
  limit,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "../db/db.js";
import { tiendaDoc, tiendaSubDoc } from "../rutas/rutas.js";

const LS_KEY = "apr_comprobante_cfg_v2_";
const CAMPO = "config_comprobante";
const TTL = 12 * 3600 * 1000; // 12 horas

/* ---------------------------- CONFIG ---------------------------- */
export const CONFIG_DEFAULT = {
  negocio: {
    nombre: "",
    lema: "",
    ruc: "",
    telefono: "",
    direccion: "",
    redes: "",
    logo: "",
  },
  documento: {
    tipo: "COMPROBANTE DE VENTA",
    serie: "B001",
    mostrarNumero: true,
    sinValorTributario: false,
  },
  igv: { activo: false, tasa: 18 },
  mostrar: {
    cliente: true,
    telefonoCliente: false,
    direccionCliente: true,
    metodoPago: true,
    nota: true,
    opcionesProductos: true,
    enLetras: true,
    qr: true,
  },
  qr: { plantilla: "", texto: "Escanea para ver tu comprobante" },
  pie: "¡GRACIAS POR SU PREFERENCIA!",
  papel: "80", // "80" | "58" | "a4"
  estilo: { fuente: "courier" },
};

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
function merge(a, b) {
  const r = Array.isArray(a) ? [...a] : { ...a };
  if (!isObj(b)) return r;
  for (const k in b)
    r[k] = isObj(a?.[k]) && isObj(b[k]) ? merge(a[k], b[k]) : b[k];
  return r;
}

function leerCache(id) {
  try {
    const c = JSON.parse(localStorage.getItem(LS_KEY + id) || "null");
    return c && Date.now() - c.t < TTL ? c : null;
  } catch {
    return null;
  }
}

/** Guarda en caché la config. Úsalo cuando YA tienes el doc de la tienda (0 lecturas). */
export function cachearConfigComprobante(id, raw) {
  if (!id) return;
  try {
    localStorage.setItem(
      LS_KEY + id,
      JSON.stringify({ t: Date.now(), cfg: raw || {} }),
    );
  } catch {}
}

/** Lee la config: caché primero; solo si no hay caché (o venció) hace 1 getDoc. */
export async function obtenerConfigComprobante(
  tiendaId,
  localidad,
  defaults = {},
) {
  let c = leerCache(tiendaId);
  if (!c) {
    let raw = null;
    try {
      const snap = await getDoc(tiendaDoc(localidad, "tiendas", tiendaId));
      raw = snap.exists() ? snap.data()[CAMPO] || null : null;
      cachearConfigComprobante(tiendaId, raw);
    } catch (e) {
      console.warn("No se pudo leer la config del comprobante:", e);
    }
    c = { cfg: raw || {} };
  }
  const cfg = merge(merge(CONFIG_DEFAULT, { negocio: defaults }), c.cfg);
  // si el config guardado tiene un campo vacío, usa el del perfil del negocio
  Object.keys(defaults || {}).forEach((k) => {
    if (!String(cfg.negocio[k] ?? "").trim() && defaults[k]) cfg.negocio[k] = defaults[k];
  });
  return cfg;
}

/** Guarda la config en el doc de la tienda y actualiza la caché al instante. */
export async function guardarConfigComprobante(tiendaId, localidad, cfg) {
  try {
    await updateDoc(tiendaDoc(localidad, "tiendas", tiendaId), {
      [CAMPO]: cfg,
    });
    cachearConfigComprobante(tiendaId, cfg);
    return true;
  } catch (e) {
    console.error("No se pudo guardar la config del comprobante:", e);
    return false;
  }
}

/** Guarda la boleta emitida DENTRO del pedido (1 escritura, solo la primera vez). Devuelve el número. */
export async function registrarComprobante(tiendaId, localidad, pedido, cfg) {
  const p = normalizar(pedido);
  const numero =
    p.comprobante?.numero ||
    [cfg.documento.serie, codigoDe(p)].filter(Boolean).join("-");
  if (p.comprobante?.numero || !p.id) return numero;
  try {
    await updateDoc(
      tiendaSubDoc(localidad, "tiendas", tiendaId, "pedidos", p.id),
      {
        comprobante: {
          numero,
          tipo: cfg.documento.tipo,
          serie: cfg.documento.serie,
          sinValorTributario: !!cfg.documento.sinValorTributario,
          total: Number(p.total) || 0,
          emitido: serverTimestamp(),
        },
      },
    );
  } catch (e) {
    console.warn("No se pudo registrar el comprobante:", e);
  }
  return numero;
}
/* ---------------------------- FUENTE ---------------------------- */
export const FUENTES = {
  arial: "Arial, Helvetica, sans-serif",
  dmsans: "'DM Sans', sans-serif",
  sora: "'Sora', sans-serif",
  courier: "'Courier Prime', 'Courier New', monospace",
  robotomono: "'Roboto Mono', monospace",
};
const GF_URL =
  "https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&family=DM+Sans:wght@400;700&family=Roboto+Mono:wght@400;700&family=Sora:wght@400;700&display=swap";

export function cssFuente(cfg) {
  const f = FUENTES[cfg?.estilo?.fuente];
  return f ? `.cpv,.cpv *{font-family:${f} !important}` : "";
}
function cargarFuentesGoogle() {
  if (document.getElementById("cpv-gf")) return;
  const l = document.createElement("link");
  l.id = "cpv-gf";
  l.rel = "stylesheet";
  l.href = GF_URL;
  document.head.appendChild(l);
}
async function esperarFuente(w, cfg) {
  const f = FUENTES[cfg?.estilo?.fuente];
  if (!f) return;
  const fam = f.split(",")[0].trim();
  try {
    await Promise.race([
      Promise.all([w.fonts.load(`400 12px ${fam}`), w.fonts.load(`700 12px ${fam}`)]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {}
}

/* ------------- PERFIL DEL NEGOCIO + LINK DE SEGUIMIENTO (QR) ------------- */
const LS_PERFIL = "apr_comprobante_perfil_v1_";
function leerLS(key) {
  try {
    const c = JSON.parse(localStorage.getItem(key) || "null");
    return c && Date.now() - c.t < TTL ? c : null;
  } catch {
    return null;
  }
}
const limpiarDominio = (d) =>
  typeof d === "string" ? d.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "") || null : null;

/** Datos de texto del negocio a partir del doc de la tienda. */
export function negocioDesdeTienda(t) {
  if (!t) return {};
  const mc = t.metodo_contacto || {};
  const ub = t.ubicacion || {};
  const tel =
    (mc.whatsapp?.estado && mc.whatsapp?.numero) ||
    (mc.llamada?.estado && mc.llamada?.numero) ||
    mc.whatsapp?.numero ||
    mc.llamada?.numero ||
    "";
  const ig = mc.instagram?.nombre || "";
  return {
    nombre: t.nombre_tienda || t.nombre || "",
    telefono: String(tel || ""),
    direccion: ub["dirección"] || ub.direccion || "",
    redes: ig ? (ig.startsWith("@") ? ig : "@" + ig) : "",
  };
}

async function resolverAlias(tiendaId, data) {
  const directo = data?.alias || data?.alias_tienda || data?.alias_url;
  if (directo) return String(directo);
  try {
    const snap = await getDocs(
      query(collection(db, "alias_tiendas"), where("id", "==", tiendaId), limit(1)),
    );
    if (!snap.empty) return snap.docs[0].id;
  } catch (e) {
    console.warn("No se pudo resolver el alias:", e);
  }
  return null;
}

/** Perfil (negocio + dominio + alias). Caché 12 h. Si pasas `data` (doc de la tienda) no lee nada extra. */
export async function obtenerPerfilTienda(tiendaId, localidad, data = null) {
  const c = leerLS(LS_PERFIL + tiendaId);
  if (!data && c) return c.perfil;
  if (!data) {
    try {
      const snap = await getDoc(tiendaDoc(localidad, "tiendas", tiendaId));
      data = snap.exists() ? snap.data() : null;
    } catch (e) {
      console.warn("No se pudo leer el perfil de la tienda:", e);
    }
  }
  if (!data) return c?.perfil || { negocio: {}, dominio: null, alias: null };
  const perfil = {
    negocio: negocioDesdeTienda(data),
    dominio: limpiarDominio(
      data.dominio_propio || data.dominio_personalizado || data.dominio || data.custom_domain,
    ),
    alias: c?.perfil?.alias || (await resolverAlias(tiendaId, data)),
  };
  try {
    localStorage.setItem(LS_PERFIL + tiendaId, JSON.stringify({ t: Date.now(), perfil }));
  } catch {}
  return perfil;
}

export function linkSeguimiento(perfil, tiendaId, id, p) {
  const base = perfil?.dominio
    ? `https://${perfil.dominio}/pedido/${id}`
    : perfil?.alias
      ? `https://geinztech.com/perfil/${encodeURIComponent(perfil.alias)}/${id}`
      : `https://geinztech.com/pedidos/${tiendaId}/${id}`;
  const token =
    !p.cliente?.id_cliente && p.token_seguimiento
      ? `?t=${encodeURIComponent(p.token_seguimiento)}`
      : "";
  return base + token;
}

/**
 * UNA sola llamada para Pedidos e Historial: devuelve la config lista para imprimir con
 * fuente, toggles, datos del negocio (perfil) y QR de seguimiento del pedido.
 */
export async function prepararCfgComprobante(
  tiendaId,
  localidad,
  pedido,
  { tiendaData = null, nombre = "" } = {},
) {
  let perfil = { negocio: {}, dominio: null, alias: null };
  try {
    perfil = await obtenerPerfilTienda(tiendaId, localidad, tiendaData);
  } catch (e) {
    console.warn(e);
  }
  const defaults = { ...perfil.negocio };
  if (!defaults.nombre && nombre) defaults.nombre = nombre;

  const cfg = await obtenerConfigComprobante(tiendaId, localidad, defaults);
  if (!cfg.mostrar?.qr) return cfg;

  const p = normalizar(pedido);
  const abrible = p.id && (p.cliente?.id_cliente || p.token_seguimiento);
  if (!abrible) return { ...cfg, mostrar: { ...cfg.mostrar, qr: false } };
  return { ...cfg, qr: { ...cfg.qr, plantilla: linkSeguimiento(perfil, tiendaId, p.id, p) } };
}
/* ---------------------------- LOGO ---------------------------- */
/** Recorta el logo en círculo; con bn=true lo pasa a blanco/negro con tramado (ideal térmica). Devuelve dataURL. */
export function procesarLogo(src, { bn = true, size = 200 } = {}) {
  return new Promise((ok, no) => {
    const go = (url) => {
      const img = new Image();
      img.onerror = () => no(new Error("No se pudo leer la imagen"));
      img.onload = () => {
        const S = size;
        const cv = document.createElement("canvas");
        cv.width = cv.height = S;
        const x = cv.getContext("2d");
        x.fillStyle = "#fff";
        x.fillRect(0, 0, S, S);
        x.save();
        x.beginPath();
        x.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
        x.clip();
        const k = Math.max(S / img.width, S / img.height);
        const w = img.width * k,
          h = img.height * k;
        x.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        x.restore();

        if (bn) {
          const id = x.getImageData(0, 0, S, S);
          const d = id.data;
          const g = new Float32Array(S * S);
          for (let i = 0; i < S * S; i++)
            g[i] =
              0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
          // Floyd–Steinberg
          for (let y = 0; y < S; y++) {
            for (let c = 0; c < S; c++) {
              const i = y * S + c;
              const viejo = g[i];
              const nuevo = viejo < 128 ? 0 : 255;
              const err = viejo - nuevo;
              g[i] = nuevo;
              if (c < S - 1) g[i + 1] += (err * 7) / 16;
              if (y < S - 1) {
                if (c > 0) g[i + S - 1] += (err * 3) / 16;
                g[i + S] += (err * 5) / 16;
                if (c < S - 1) g[i + S + 1] += err / 16;
              }
            }
          }
          for (let i = 0; i < S * S; i++) {
            d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = g[i];
            d[i * 4 + 3] = 255;
          }
          x.putImageData(id, 0, 0);
        }

        const out = document.createElement("canvas");
        out.width = out.height = S;
        const octx = out.getContext("2d");
        octx.fillStyle = "#fff";
        octx.fillRect(0, 0, S, S);
        octx.beginPath();
        octx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
        octx.clip();
        octx.drawImage(cv, 0, 0);
        ok(out.toDataURL("image/png"));
      };
      img.src = url;
    };
    if (typeof src === "string") return go(src);
    const r = new FileReader();
    r.onload = () => go(r.result);
    r.onerror = () => no(new Error("Lectura fallida"));
    r.readAsDataURL(src);
  });
}

/* ---------------------------- HELPERS ---------------------------- */
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) =>
  (Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100).toFixed(2);

const U = [
  "",
  "UNO",
  "DOS",
  "TRES",
  "CUATRO",
  "CINCO",
  "SEIS",
  "SIETE",
  "OCHO",
  "NUEVE",
  "DIEZ",
  "ONCE",
  "DOCE",
  "TRECE",
  "CATORCE",
  "QUINCE",
  "DIECISEIS",
  "DIECISIETE",
  "DIECIOCHO",
  "DIECINUEVE",
  "VEINTE",
  "VEINTIUNO",
  "VEINTIDOS",
  "VEINTITRES",
  "VEINTICUATRO",
  "VEINTICINCO",
  "VEINTISEIS",
  "VEINTISIETE",
  "VEINTIOCHO",
  "VEINTINUEVE",
];
const D = [
  "",
  "",
  "",
  "TREINTA",
  "CUARENTA",
  "CINCUENTA",
  "SESENTA",
  "SETENTA",
  "OCHENTA",
  "NOVENTA",
];
const C = [
  "",
  "CIENTO",
  "DOSCIENTOS",
  "TRESCIENTOS",
  "CUATROCIENTOS",
  "QUINIENTOS",
  "SEISCIENTOS",
  "SETECIENTOS",
  "OCHOCIENTOS",
  "NOVECIENTOS",
];
function words(n) {
  if (n === 0) return "CERO";
  if (n === 100) return "CIEN";
  if (n < 30) return U[n];
  if (n < 100) return D[Math.floor(n / 10)] + (n % 10 ? " Y " + U[n % 10] : "");
  if (n < 1000)
    return C[Math.floor(n / 100)] + (n % 100 ? " " + words(n % 100) : "");
  if (n < 1e6) {
    const m = Math.floor(n / 1000);
    return (
      (m === 1 ? "MIL" : words(m) + " MIL") +
      (n % 1000 ? " " + words(n % 1000) : "")
    );
  }
  return String(n);
}
export const montoEnLetras = (t) => {
  let e = Math.floor(t);
  let c = Math.round((t - e) * 100);
  if (c === 100) {
    e += 1;
    c = 0;
  }
  return `SON: ${words(e)} CON ${String(c).padStart(2, "0")}/100 SOLES`;
};

// Pedidos de mesa vienen como { pedido: {...} }; los deja con forma plana.
function normalizar(raw) {
  if (raw && raw.pedido)
    return {
      ...raw.pedido,
      id: raw.id || raw.pedido.id,
      comprobante: raw.comprobante,
    };
  return raw || {};
}
function codigoDe(p) {
  return (p.id || "").slice(0, 6).toUpperCase();
}

function fechaDe(p) {
  const t = p.timestamp || p.actualizado;
  let d = null;
  if (t)
    d =
      typeof t.toDate === "function"
        ? t.toDate()
        : t.seconds
          ? new Date(t.seconds * 1000)
          : new Date(t);
  if (d && !isNaN(d)) {
    const z = (n) => String(n).padStart(2, "0");
    return `${z(d.getDate())}/${z(d.getMonth() + 1)}/${d.getFullYear()}  ${z(d.getHours())}:${z(d.getMinutes())}`;
  }
  return [p.fecha, p.hora].filter(Boolean).join("  ") || "";
}

function entradasOpcion(v) {
  if (v && typeof v === "object" && !Array.isArray(v))
    return Object.entries(v).filter(([, c]) => (Number(c) || 0) > 0);
  if (Array.isArray(v)) return v.map((n) => [n, 1]);
  return v ? [[v, 1]] : [];
}
function opcionesLineas(pr) {
  const out = [];
  Object.entries(pr.opciones || {}).forEach(([cond, v]) =>
    entradasOpcion(v).forEach(([nom, c]) =>
      out.push(`${cond}: ${nom}${c > 1 ? " x" + c : ""}`),
    ),
  );
  if (pr.variaciones) out.push(pr.variaciones);
  if (pr.adicionales) out.push(pr.adicionales);
  if (pr.comentario) out.push(pr.comentario);
  return out;
}

/* ---------------------------- QR ---------------------------- */
let _qrP;
function cargarQR() {
  if (window.qrcode) return Promise.resolve();
  return (_qrP ||= new Promise((ok, no) => {
    const s = document.createElement("script");
    s.src =
      "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
    s.onload = ok;
    s.onerror = () => {
      _qrP = null;
      no(new Error("QR lib"));
    };
    document.head.appendChild(s);
  }));
}
async function qrDataURL(texto) {
  try {
    await cargarQR();
    const q = window.qrcode(0, "M");
    q.addData(texto);
    q.make();
    return q.createDataURL(5, 0);
  } catch {
    return "";
  }
}

/* ---------------------------- ESTILOS ---------------------------- */
export const CSS_COMPROBANTE = `
.cpv,.cpv *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cpv{width:72mm;background:#fff;color:#000;padding:5mm 4mm 6mm;font:12px/1.4 "Courier New",monospace}
.cpv.w58{width:48mm;font-size:10.5px;padding:4mm 2.5mm 5mm}
.cpv .c{text-align:center}.cpv .b{font-weight:700}.cpv .sm{font-size:.88em}.cpv .w{word-break:break-word}.cpv .r{text-align:right}
.cpv .logo{display:block;width:24mm;height:24mm;border-radius:50%;margin:0 auto 3mm;border:1.2px solid #000;padding:.6mm;object-fit:cover;background:#fff}
.cpv.w58 .logo{width:19mm;height:19mm}
.cpv .name{font-size:1.3em;font-weight:700;letter-spacing:.04em;text-transform:uppercase;text-align:center;word-break:break-word}
.cpv .lema{font-style:italic;text-align:center;font-size:.88em}
.cpv .badge{border:1.5px solid #000;padding:1.6mm 1mm;margin:2mm 0;text-align:center}
.cpv .badge .t{font-size:.92em;letter-spacing:.08em;font-weight:700}.cpv .badge .n{font-size:1.2em;font-weight:700;margin-top:.5mm}
.cpv .kv{display:flex;gap:6px;justify-content:space-between}.cpv .kv span:first-child{flex:none}.cpv .kv span:last-child{text-align:right;word-break:break-word}
.cpv .dash{border:0;border-top:1px dashed #000;margin:2.5mm 0}.cpv .dbl{border:0;border-top:3px double #000;margin:2.5mm 0}
.cpv table{width:100%;border-collapse:collapse}
.cpv th{font-size:.85em;letter-spacing:.06em;text-align:left;padding-bottom:1mm;border-bottom:1px solid #000}
.cpv td{padding:.4mm 0;vertical-align:top}.cpv tr.it td{padding-top:1.4mm}
.cpv .grand{border:1.5px solid #000;padding:1.6mm 2mm;margin-top:2mm;display:flex;justify-content:space-between;font-size:1.3em;font-weight:700}
.cpv .words{font-size:.88em;margin-top:2mm;font-style:italic}
.cpv .orn{text-align:center;letter-spacing:.5em;font-size:.8em;margin:2mm 0}
.cpv .qr{display:flex;justify-content:center;margin:3.5mm 0 1mm}
.cpv .qr img{width:30mm;height:30mm;padding:1.2mm;border:1px solid #000;image-rendering:pixelated}
.cpv .legal{border:1px dashed #000;text-align:center;font-size:.8em;padding:1mm;margin:2mm 0;letter-spacing:.03em}
`;

/* ---------------------------- RENDER ---------------------------- */
/**
 * Devuelve el HTML del ticket (string).
 * opciones: { numero, qr, atendidoPor }  → sobreescriben lo calculado.
 */
export async function comprobanteHTML(pedido, config, opciones = {}) {
  const cfg = merge(CONFIG_DEFAULT, config);
  const p = normalizar(pedido);
  const n = cfg.negocio,
    d = cfg.documento,
    m = cfg.mostrar,
    cli = p.cliente || {};
  const codigo = codigoDe(p);
  const numero =
    opciones.numero ||
    p.comprobante?.numero ||
    [d.serie, codigo].filter(Boolean).join("-");

  const prods = p.productos || [];
  const sumProd = prods.reduce(
    (s, x) =>
      s +
      (Number(
        x.subtotal ??
          (Number(x.cantidad) || 0) * (Number(x.precio_unitario) || 0),
      ) || 0),
    0,
  );
  const desc = Number(p.descuentoCupon) || 0;
  const deliv =
    p.delivery && !p.delivery.gratis ? Number(p.delivery.costo) || 0 : 0;
  const total =
    typeof p.total === "number" ? p.total : Math.max(0, sumProd - desc) + deliv;
  const base = cfg.igv.activo
    ? total / (1 + (Number(cfg.igv.tasa) || 18) / 100)
    : total;
  const igv = total - base;

  const filas = prods
    .map((x) => {
      const cant = Number(x.cantidad) || 0;
      const imp =
        Number(x.subtotal ?? cant * (Number(x.precio_unitario) || 0)) || 0;
      const pu = Number(x.precio_unitario ?? (cant ? imp / cant : 0)) || 0;
      const ops = m.opcionesProductos ? opcionesLineas(x) : [];
      return (
        `<tr class="it"><td colspan="2" class="w">${esc(x.nombre)}</td></tr>` +
        ops
          .map(
            (o) =>
              `<tr><td colspan="2" class="sm w">&nbsp;+ ${esc(o)}</td></tr>`,
          )
          .join("") +
        `<tr><td>${cant} x ${money(pu)}</td><td class="r">${x.esCanje ? "CANJE" : money(imp)}</td></tr>`
      );
    })
    .join("");

  const atendido = opciones.atendidoPor || p.atendidoPor;
  const entrega =
    cli.tipo_entrega ||
    (p.mesa && p.mesa.numero != null ? `Mesa ${p.mesa.numero}` : "");
  const kv = (a, b) =>
    b ? `<div class="kv"><span>${a}</span><span>${esc(b)}</span></div>` : "";
  const doc = cli.documento || cli.dni || cli.ruc;

  let qrHtml = "";
  if (m.qr) {
    const txt =
      opciones.qr ||
      String(cfg.qr.plantilla || "")
        .replace(/\{codigo\}/g, codigo)
        .replace(/\{id\}/g, p.id || "");
    const img = txt ? await qrDataURL(txt) : "";
    if (img)
      qrHtml = `<div class="qr"><img src="${img}" alt="QR"></div>${cfg.qr.texto ? `<div class="c sm w">${esc(cfg.qr.texto)}</div>` : ""}`;
  }

  return `<div class="cpv ${cfg.papel === "58" ? "w58" : ""}">
    ${n.logo ? `<img class="logo" src="${n.logo}" alt="">` : ""}
    <div class="name">${esc(n.nombre)}</div>
    ${n.lema ? `<div class="lema">${esc(n.lema)}</div>` : ""}
    ${n.ruc ? `<div class="c b">RUC ${esc(n.ruc)}</div>` : ""}
    ${n.direccion ? `<div class="c sm w">${esc(n.direccion)}</div>` : ""}
    ${n.telefono ? `<div class="c sm">WhatsApp/Tel: ${esc(n.telefono)}</div>` : ""}
    ${n.redes ? `<div class="c sm w">${esc(n.redes)}</div>` : ""}
    <div class="badge"><div class="t">${esc(d.tipo)}</div>${d.mostrarNumero && numero ? `<div class="n">${esc(numero)}</div>` : ""}</div>
    ${kv("Fecha:", fechaDe(p))}
    ${kv("Atendido por:", atendido)}
    ${m.cliente ? kv("Cliente:", cli.nombre || "CLIENTE VARIOS") + kv(cli.tipoDoc ? cli.tipoDoc + ":" : "Doc.:", doc) : ""}
    ${m.cliente && m.telefonoCliente ? kv("Tel.:", cli.telefono || cli.whatsapp || cli.celular) : ""}
    ${m.cliente && m.direccionCliente ? kv("Dir.:", cli.direccion) : ""}
    ${kv("Entrega:", entrega)}
    ${m.metodoPago ? kv("Pago:", p.pago && p.pago.metodo) : ""}
    <hr class="dbl">
    <table><tr><th>DESCRIPCIÓN</th><th class="r">IMPORTE</th></tr>${filas}</table>
    <hr class="dash">
    <table>
      ${desc > 0 || deliv > 0 || (p.delivery && p.delivery.gratis) ? `<tr><td>Subtotal</td><td class="r">S/ ${money(sumProd)}</td></tr>` : ""}
      ${desc > 0 ? `<tr><td>Descuento${p.cupon && p.cupon.codigo ? " (" + esc(p.cupon.codigo) + ")" : ""}</td><td class="r">- S/ ${money(desc)}</td></tr>` : ""}
      ${deliv > 0 ? `<tr><td>Delivery${p.delivery.zona ? " · " + esc(p.delivery.zona) : ""}</td><td class="r">S/ ${money(deliv)}</td></tr>` : ""}
      ${p.delivery && p.delivery.gratis ? `<tr><td>Delivery</td><td class="r">GRATIS</td></tr>` : ""}
      ${cfg.igv.activo ? `<tr><td>Op. gravada</td><td class="r">S/ ${money(base)}</td></tr><tr><td>IGV (${Number(cfg.igv.tasa) || 18}%)</td><td class="r">S/ ${money(igv)}</td></tr>` : ""}
    </table>
    <div class="grand"><span>TOTAL</span><span>S/ ${money(total)}</span></div>
    ${p.pago && Number(p.pago.vuelto) ? `<div class="kv" style="margin-top:1.5mm"><span>Vuelto:</span><span>S/ ${money(p.pago.vuelto)}</span></div>` : ""}
    ${m.enLetras ? `<div class="words w">${montoEnLetras(total)}</div>` : ""}
    ${m.nota && p.nota ? `<div class="sm w" style="margin-top:2mm">Nota: ${esc(p.nota)}</div>` : ""}
    <div class="orn">• • •</div>
    ${qrHtml}
    <hr class="dash">
    ${d.sinValorTributario ? `<div class="legal">DOCUMENTO SIN VALOR TRIBUTARIO</div>` : ""}
    <div class="c sm w" style="white-space:pre-line">${esc(cfg.pie)}</div>
  </div>`;
}

/** Dibuja el comprobante dentro de un elemento (vista previa). */
export async function renderComprobante(el, pedido, config, opciones) {
  if (!document.getElementById("cpv-style")) {
    const s = document.createElement("style");
    s.id = "cpv-style";
    s.textContent = CSS_COMPROBANTE;
    document.head.appendChild(s);
  }
  cargarFuentesGoogle();
  let sf = document.getElementById("cpv-font");
  if (!sf) {
    sf = document.createElement("style");
    sf.id = "cpv-font";
    document.head.appendChild(sf);
  }
  sf.textContent = cssFuente(merge(CONFIG_DEFAULT, config));
  el.innerHTML = await comprobanteHTML(pedido, config, opciones);
}
/** Imprime el comprobante (iframe oculto, sin abrir pestañas). */
export async function imprimirComprobante(pedido, config, opciones) {
  const cfg = merge(CONFIG_DEFAULT, config);
  const html = await comprobanteHTML(pedido, cfg, opciones);
  const a4 = String(cfg.papel).toLowerCase() === "a4";
  const conFuente = !!FUENTES[cfg.estilo?.fuente];
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(f);
  const w = f.contentDocument;
  w.open();
  w.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>Comprobante</title>${
      conFuente ? `<link rel="stylesheet" href="${GF_URL}">` : ""
    }<style>${CSS_COMPROBANTE}${cssFuente(cfg)}${
      a4
        ? "@page{size:A4;margin:10mm}.cpv{zoom:2.3}"
        : `@page{size:${cfg.papel}mm auto;margin:0}`
    }html,body{margin:0;padding:0;background:#fff}body{display:flex;justify-content:center}.cpv{margin:0 auto;box-shadow:none}</style></head><body>${html}</body></html>`,
  );
  w.close();

  // espera la hoja de fuentes y la fuente real antes de imprimir
  const link = w.querySelector('link[rel="stylesheet"]');
  if (link) await new Promise((r) => { link.onload = link.onerror = r; setTimeout(r, 2500); });
  await esperarFuente(w, cfg);

  await new Promise((r) => {
    let k = w.images.length;
    if (!k) return r();
    [...w.images].forEach((i) => (i.complete ? --k || r() : (i.onload = i.onerror = () => --k || r())));
    setTimeout(r, 1500);
  });
  f.contentWindow.focus();
  f.contentWindow.print();
  setTimeout(() => f.remove(), 2000);
}

/* ---------------------------- DEMO (solo vista previa) ---------------------------- */
export function pedidoDemo() {
  return {
    id: "DEMO8F3K2A",
    timestamp: new Date(),
    cliente: {
      nombre: "Juan Pérez",
      telefono: "999 888 777",
      direccion: "Jr. Los Pinos 456",
      tipo_entrega: "Delivery",
    },
    productos: [
      {
        nombre: "Pollo a la brasa 1/4",
        cantidad: 1,
        precio_unitario: 16,
        subtotal: 16,
        opciones: { Cremas: { Mayonesa: 1, Ají: 1 } },
      },
      {
        nombre: "Gaseosa 500ml",
        cantidad: 2,
        precio_unitario: 2.5,
        subtotal: 5,
      },
      {
        nombre: "Postre del día",
        cantidad: 1,
        precio_unitario: 0,
        subtotal: 0,
        esCanje: true,
      },
    ],
    descuentoCupon: 2,
    cupon: { codigo: "BIENVENIDO" },
    delivery: { costo: 3, zona: "Centro" },
    total: 22,
    pago: { metodo: "Yape" },
    nota: "Sin ají por favor",
  };
}
