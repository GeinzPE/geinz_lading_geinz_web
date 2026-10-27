import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { storage } from "../db/db.js";
import {
  tiendaSubDoc,
  formulariosCol,
  setUbicacion,
  tiendaCuponesCol,
  tiendaCuponDoc,
} from "../rutas/rutas.js";
import {
  comprimirAWebp,
  subirWebp,
} from "../compresor_imagen/compresor_imagen.js";

/* ===== Estilos extra (no hace falta tocar tu CSS) ===== */
document.head.insertAdjacentHTML(
  "beforeend",
  `<style>
.qcfg{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin-top:10px;font-size:13px;color:var(--muted)}
.qcfg label{display:flex;align-items:center;gap:6px;cursor:pointer}
.qcfg .in.sm{width:74px;padding:6px 8px}
.svmsg{margin:10px 0 0;font-size:13px;color:#e5484d;min-height:18px}
.oth{margin:4px 0 14px;padding-left:12px;border-left:2px solid var(--line,#ddd);font-size:13px}
.oth span{display:block;margin:2px 0}
.upbar{height:6px;background:var(--panel2,#13101c);border-radius:99px;overflow:hidden;margin:10px 0 0;display:none}
.upbar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--p,#8b5cf6),var(--p2,#a78bfa));transition:width .15s}
.zch{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}
.zch span{display:inline-flex;align-items:center;gap:6px;padding:4px 6px 4px 10px;border-radius:99px;background:var(--pdim,rgba(139,92,246,.14));color:var(--p2,#a78bfa);font-size:12.5px}
.zch button{background:none;border:0;color:inherit;cursor:pointer;font-size:14px;line-height:1;padding:2px 4px}
.zrow{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.zrow .in{margin-bottom:8px}
@media(max-width:600px){.zrow{grid-template-columns:1fr}}
/* filtros y rankings */
.flt{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.flt .in{margin:0}
.flt .full{grid-column:1/-1}
.fbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.fbar .btn{padding:7px 12px;font-size:13px}
.rkgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.rkgrid .card{margin:0}
.rk{cursor:pointer;border-radius:8px;padding:2px 4px;margin:0 -4px 6px}
.rk:hover{background:var(--pdim,rgba(139,92,246,.14))}
.rk .bar{margin:0}
.rk .bar span{width:42%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
.rk .bar span small{color:var(--muted)}
.rk .bar u{width:46px}
.rkn{color:var(--muted);font-size:12.5px;margin:8px 0 0}
.hrs{height:70px}
.cnt{color:var(--muted);font-size:13px;margin:0 0 12px}
.more{width:100%;margin:6px 0 16px}
details.r summary>span{min-width:0}
details.r summary .sub{overflow-wrap:anywhere}
.loc{margin:0;padding:10px 0;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
details.fold{margin-top:14px}
details.fold>summary{cursor:pointer;color:var(--p2);padding:6px 0}
</style>`,
);

/* Imagen OG ya optimizada (WebP) que se sube al guardar */
let ogBlob = null;

/* Marca real del negocio */
const lighten = (h, p = 0.3) => {
  const n = parseInt(h.slice(1), 16),
    f = (c) =>
      Math.round(c + (255 - c) * p)
        .toString(16)
        .padStart(2, "0");
  return "#" + f((n >> 16) & 255) + f((n >> 8) & 255) + f(n & 255);
};
const HEX = /^#[0-9a-f]{6}$/i;
const brandFrom = (d) => {
  const c = d.color_marca || {},
    p = HEX.test(c.hex || "") ? c.hex : "#8b5cf6";
  return {
    name: d.nombre_tienda || "Mi negocio",
    logo: d.img_tienda?.logo_tienda || "",
    primary: p,
    secondary:
      c.degradado?.activo && HEX.test(c.degradado.hex || "")
        ? c.degradado.hex
        : lighten(p),
  };
};

/* ======================================================================================= */
const P = () => parent.PanelPerfil || {};
const ymd = (d) =>
  d.getFullYear() +
  String(d.getMonth() + 1).padStart(2, "0") +
  String(d.getDate()).padStart(2, "0");
const last7 = (m) =>
  [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    return (m || {})["d" + ymd(d)] || 0;
  });
let T = null;
let TD = {};
async function tienda() {
  T = {
    loc: P().LOCALIDAD_TIENDA,
    id: P().TIENDA_ID,
    dep: P().DEPARTAMENTO_TIENDA,
    prov: P().PROVINCIA_TIENDA,
  };
  if (!T.loc || !T.id)
    throw new Error(
      "El panel aún no tiene la tienda lista. Abre Formularios desde el botón del panel.",
    );
  setUbicacion({ departamento: T.dep, provincia: T.prov });
  return tiendaSubDoc(T.loc, "tiendas", T.id);
}
const fcol = async () => {
  await tienda();
  return formulariosCol(T.loc, T.id);
};

/* ---------- Reglas de preguntas ---------- */
const OTR = "__otro__";
let CUPS = [];
async function cargarCupones() {
  await tienda();
  const s = await getDocs(
    query(tiendaCuponesCol(T.loc, T.id), where("origen", "==", "negocio")),
  );
  CUPS = s.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(
      (c) => c.activo !== false && (!c.expiraEn || c.expiraEn > Date.now()),
    );
}
const cupOpts = () =>
  '<option value="">Elige un cupón…</option>' +
  CUPS.map(
    (c) =>
      `<option value="${esc(c.codigo)}">${esc(c.codigo)} · ${c.porcentajeManual}%</option>`,
  ).join("");

/* ---------- Campos que se piden al registrar ---------- */
const REG_DEF = {
  nombres: true,
  correo: true,
  telefono: true,
  genero: false,
  ubicacion: false,
  fecha_nac: false,
  nacionalidad: false,
  cuenta: false,
};
const REG_LBL = {
  nombres: "Nombre y apellido",
  correo: "Correo",
  telefono: "WhatsApp",
  genero: "Género",
  ubicacion: "Ubicación (depto, provincia, distrito)",
  fecha_nac: "Fecha de nacimiento",
  nacionalidad: "Nacionalidad",
  cuenta: "Crear cuenta (correo + contraseña)",
};
const zonaActiva = () => !!(F?.discount?.on && (F.discount.zonas || []).length);
const regC = () => {
  const c = { ...REG_DEF, ...(F.regCampos || {}) };
  if (c.cuenta) c.correo = true;
  if (zonaActiva()) {
    c.ubicacion = true;
    c.telefono = true;
  }
  if (F?.discount?.on) {
    c.cuenta = c.correo = c.nombres = c.telefono = true;
  }
  return c;
};
const isChoice = (q) => q.type === "single" || q.type === "multi";
const req = (q) =>
  q.type === "text" ? q.required === true : q.required !== false;
function problem(q, a, other) {
  if (q.type === "text") {
    const t = String(a || "").trim();
    if (!t) return req(q) ? "Esta pregunta es obligatoria." : "";
    if (q.minLen && t.length < q.minLen)
      return `Escribe al menos ${q.minLen} caracteres.`;
    if (q.maxLen && t.length > q.maxLen)
      return `Máximo ${q.maxLen} caracteres.`;
    return "";
  }
  const arr = Array.isArray(a) ? a : a === undefined || a === "" ? [] : [a];
  if (!arr.length)
    return req(q)
      ? q.type === "scale"
        ? "Elige una calificación."
        : "Elige una opción para continuar."
      : "";
  if (arr.includes(OTR) && !String(other || "").trim())
    return "Escribe tu respuesta en “Otro”.";
  if (q.maxSel && arr.length > q.maxSel)
    return `Elige máximo ${q.maxSel} opciones.`;
  return "";
}
const normQ = (q) => {
  const o = {
    id: q.id,
    type: q.type,
    text: String(q.text || "").trim(),
    required: req(q),
  };
  if (isChoice(q)) {
    o.opts = (q.opts || []).map((x) => String(x).trim());
    o.other = !!q.other;
  }
  if (q.type === "multi" && q.maxSel) o.maxSel = q.maxSel;
  if (q.type === "text") {
    if (q.minLen) o.minLen = q.minLen;
    if (q.maxLen) o.maxLen = q.maxLen;
  }
  return o;
};
function check(f) {
  if (!f.title.trim()) return "Escribe un título para el formulario.";
  if (!f.questions.length) return "Agrega al menos una pregunta.";
  for (const [i, q] of f.questions.entries()) {
    const n = i + 1;
    if (!String(q.text).trim()) return `La pregunta ${n} no tiene texto.`;
    if (isChoice(q)) {
      const o = q.opts.map((x) => String(x).trim());
      if (o.some((x) => !x)) return `La pregunta ${n} tiene una opción vacía.`;
      if (o.length + (q.other ? 1 : 0) < 2)
        return `La pregunta ${n} necesita al menos 2 opciones.`;
      if (new Set(o.map((x) => x.toLowerCase())).size < o.length)
        return `La pregunta ${n} tiene opciones repetidas.`;
      if (
        q.type === "multi" &&
        q.maxSel &&
        q.maxSel > o.length + (q.other ? 1 : 0)
      )
        return `La pregunta ${n}: el máximo de opciones es mayor que las opciones disponibles.`;
    }
    if (q.type === "text" && q.maxLen && q.minLen > q.maxLen)
      return `La pregunta ${n}: el mínimo de caracteres no puede superar al máximo.`;
  }
  if (f.discount.on) {
    if (!CUPS.some((c) => c.codigo === f.discount.code))
      return "Elige un cupón de tu lista (créalo primero en Cupones).";
  }
  return "";
}

const DB = {
  brand: async () => {
    const s = await getDoc(await tienda());
    TD = s.data() || {};
    return brandFrom(TD);
  },
  forms: async () =>
    (await getDocs(await fcol())).docs.map((d) => {
      const f = { id: d.id, ...d.data() },
        s = f.stats || {};
      f.stats = {
        visits: s.visits || 0,
        done: s.done || 0,
        coupons: s.coupons || 0,
        byDay: last7(s.dias),
        pasos: s.pasos || {},
      };
      return f;
    }),
  responses: async (id) =>
    (
      await getDocs(
        query(
          collection(doc(await fcol(), id), "respuestas"),
          orderBy("at", "desc"),
          limit(1000),
        ),
      )
    ).docs.map((d) => {
      const x = d.data(),
        z = x.zona || {};
      return {
        ...x,
        a: x.a || {},
        who: x.who || "Anónimo",
        ms: x.at?.toMillis ? x.at.toMillis() : 0,
        z: { dep: z.dep || "", prov: z.prov || "", dist: z.dist || "" },
        date: x.at?.toDate
          ? x.at.toDate().toLocaleString("es-PE", {
              dateStyle: "short",
              timeStyle: "short",
            })
          : "",
      };
    }),
  save: async (f, onProgress) => {
    const c = await fcol(),
      data = structuredClone(f);
    delete data.stats;
    delete data.id;
    data.og = data.og || { title: "", desc: "", image: "" };
    const r = f.id === "nuevo" ? doc(c) : doc(c, f.id);
    if (ogBlob) {
      const url = await subirWebp(
        storage,
        `tiendas/${T.id}/formulario/${r.id}/og.webp`,
        ogBlob,
        onProgress,
      );
      data.og.image = url + (url.includes("?") ? "&" : "?") + "v=" + Date.now();
    } else if (String(data.og.image || "").startsWith("blob:")) {
      data.og.image = "";
    }
    let cupRef = null;
    if (data.discount?.on) {
      cupRef = tiendaCuponDoc(T.loc, T.id, data.discount.code);
      if (!(await getDoc(cupRef)).exists())
        throw new Error("El cupón ya no existe");
    }
    await setDoc(r, data, { merge: true });
    if (cupRef)
      await updateDoc(cupRef, { soloFormulario: true, formularioId: r.id });
    ogBlob = null;
    return { id: r.id, og: data.og };
  },
  link: (f) => {
    const d = TD.dominio || TD.dominio_web,
      a = TD.alias || TD.alias_tienda;
    if (d) return `https://${d}/form/${f.id}`;
    if (a) return `https://geinztech.com/perfil/${a}/form/${f.id}`;
    return `https://geinztech.com/form/${f.id}?id=${T.id}&localidad=${T.loc}`;
  },
};
const TYPES = {
  single: "Opción única",
  multi: "Opción múltiple",
  scale: "Escala del 1 al 5",
  text: "Texto libre",
};
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    );
let brand = { name: "", primary: "#8b5cf6", secondary: "#22d3ee" },
  forms = [],
  F = null,
  tab = "resumen",
  step = 0,
  ans = {},
  ansO = {},
  focusOtr = false;
const root = document.documentElement.style;
const paint = () => {
  root.setProperty("--brand", brand.primary);
  root.setProperty("--brand2", brand.secondary);
};
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + "%" : "0%");

/* ---------- Utilidades de análisis ---------- */
const tc = (s) =>
  String(s || "")
    .split("-")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
const nrm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const uniq = (a) => [...new Set(a)];

/* Respuestas en caché (se cargan una vez por formulario) */
let RC = { id: null, rows: [] };
async function getR(force) {
  if (F.id === "nuevo") return [];
  if (!force && RC.id === F.id) return RC.rows;
  const rows = await DB.responses(F.id);
  RC = { id: F.id, rows };
  return rows;
}

/* Filtros de la pestaña Respuestas */
const FL0 = {
  q: "",
  from: "",
  to: "",
  user: "",
  zona: "",
  cupon: "",
  dep: "",
  prov: "",
  dist: "",
  qid: "",
  qopt: "",
  sort: "new",
};
let FL = { ...FL0 };
let SHOWN = 50;

const matchAns = (v, opt) => {
  if (v === undefined || v === null) return false;
  const m = (x) =>
    opt === "Otro" ? String(x).startsWith("Otro:") : String(x) === opt;
  return Array.isArray(v) ? v.some(m) : m(v);
};
function applyF(R) {
  const f = FL,
    q = nrm(f.q);
  const from = f.from ? new Date(f.from + "T00:00:00").getTime() : 0;
  const to = f.to ? new Date(f.to + "T23:59:59.999").getTime() : Infinity;
  const out = R.filter((r) => {
    if (q && !nrm([r.who, r.mail, r.tel, r.coupon].join(" ")).includes(q))
      return false;
    if (from && r.ms < from) return false;
    if (r.ms > to) return false;
    if (f.user === "reg" && !r.user) return false;
    if (f.user === "anon" && r.user) return false;
    if (f.zona === "fuera" && r.zona_ok !== false) return false;
    if (f.zona === "dentro" && r.zona_ok === false) return false;
    if (f.cupon === "con" && !r.coupon) return false;
    if (f.cupon === "sin" && r.coupon) return false;
    if (f.dep && r.z.dep !== f.dep) return false;
    if (f.prov && r.z.prov !== f.prov) return false;
    if (f.dist && r.z.dist !== f.dist) return false;
    if (f.qid && f.qopt && !matchAns(r.a?.[f.qid], f.qopt)) return false;
    return true;
  });
  if (f.sort === "old") out.sort((a, b) => a.ms - b.ms);
  else if (f.sort === "name")
    out.sort((a, b) => nrm(a.who).localeCompare(nrm(b.who)));
  else out.sort((a, b) => b.ms - a.ms);
  return out;
}

/* Ranking por departamento / provincia / distrito */
function rank(R, lvl) {
  const m = new Map();
  let sin = 0;
  R.forEach((r) => {
    const z = r.z;
    if (!z[lvl]) return void sin++;
    const key = z.dep + "|" + (lvl !== "dep" ? z.prov : "") + "|" + (lvl === "dist" ? z.dist : "");
    const e = m.get(key) || {
      n: 0,
      label: tc(z[lvl]),
      sub: lvl === "prov" ? tc(z.dep) : lvl === "dist" ? tc(z.prov) : "",
      f: {
        dep: z.dep,
        prov: lvl !== "dep" ? z.prov : "",
        dist: lvl === "dist" ? z.dist : "",
      },
    };
    e.n++;
    m.set(key, e);
  });
  return { list: [...m.values()].sort((a, b) => b.n - a.n), sin };
}
function rkCard(title, lvl, R, clickable) {
  const { list, sin } = rank(R, lvl),
    top = list.slice(0, 8),
    mx = top[0]?.n || 1;
  return `<div class="card"><h2>${title}</h2>${
    top.length
      ? top
          .map(
            (e) =>
              `<div class="rk"${clickable ? ` data-geo='${esc(JSON.stringify(e.f))}'` : ""}><div class="bar"><span title="${esc(e.label)}">${esc(e.label)}${e.sub ? ` <small>· ${esc(e.sub)}</small>` : ""}</span><div><i style="width:${Math.max((e.n / mx) * 100, 3)}%"></i></div><u>${e.n}</u></div></div>`,
          )
          .join("")
      : '<p class="sub">Sin datos de ubicación.</p>'
  }${sin ? `<p class="rkn">${sin} sin ubicación</p>` : ""}${list.length > 8 ? `<p class="rkn">y ${list.length - 8} más</p>` : ""}</div>`;
}
const geoCards = (R, c) =>
  `<div class="rkgrid" style="margin-bottom:16px">${rkCard("Departamentos con más respuestas", "dep", R, c)}${rkCard("Provincias con más respuestas", "prov", R, c)}${rkCard("Distritos con más respuestas", "dist", R, c)}</div>`;

function dayHours(R) {
  const days = [...Array(14)].map((_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 13 + i);
    return d.getTime();
  });
  const dn = days.map((t) => R.filter((r) => r.ms >= t && r.ms < t + 864e5).length);
  const hn = [...Array(24)].map(
    (_, h) => R.filter((r) => r.ms && new Date(r.ms).getHours() === h).length,
  );
  const md = Math.max(...dn, 1),
    mh = Math.max(...hn, 1),
    best = hn.indexOf(Math.max(...hn));
  return `<div class="two" style="margin-bottom:16px"><div class="card" style="margin:0"><h2>Últimos 14 días</h2><div class="cols">${dn.map((n, i) => `<i style="height:${Math.max((n / md) * 100, 3)}%" title="${new Date(days[i]).toLocaleDateString("es-PE")}: ${n}"></i>`).join("")}</div></div>
  <div class="card" style="margin:0"><h2>Por hora del día${R.length ? ` <span class="sub" style="font-size:12.5px">· pico ${best}:00</span>` : ""}</h2><div class="cols hrs">${hn.map((n, h) => `<i style="height:${Math.max((n / mh) * 100, 3)}%" title="${h}:00 → ${n}"></i>`).join("")}</div></div></div>`;
}

/* Resultados por pregunta (sobre las respuestas que le pases) */
function qBlock(R) {
  return (
    F.questions
      .map((q) => {
        if (q.type === "text")
          return `<p><b>${esc(q.text)}</b><br><span class="sub">Respuestas abiertas: ver en la pestaña Respuestas.</span></p>`;
        const L =
            q.type === "scale"
              ? ["1", "2", "3", "4", "5"]
              : [...(q.opts || []), ...(q.other ? ["Otro"] : [])],
          w = L.map((l) => R.filter((r) => matchAns(r.a?.[q.id], l)).length),
          t = w.reduce((a, b) => a + b, 0) || 1;
        const otros = [];
        if (q.other)
          R.forEach((r) => {
            const v = r.a?.[q.id];
            (Array.isArray(v) ? v : [v]).forEach((x) => {
              if (x !== undefined && String(x).startsWith("Otro:"))
                otros.push(String(x).slice(5).trim());
            });
          });
        return `<p style="margin:0 0 10px"><b>${esc(q.text)}</b></p>${L.map(
          (l, i) => {
            const p = Math.round((w[i] / t) * 100);
            return `<div class="bar"><span>${esc(l)}</span><div><i style="width:${p}%"></i></div><u>${p}%</u></div>`;
          },
        ).join("")}${
          otros.length
            ? `<div class="oth"><span class="sub">Lo que escribieron en “Otro”:</span>${otros
                .slice(0, 10)
                .map((x) => `<span>• ${esc(x)}</span>`)
                .join(
                  "",
                )}${otros.length > 10 ? `<span class="sub">y ${otros.length - 10} más</span>` : ""}</div>`
            : ""
        }<div style="height:14px"></div>`;
      })
      .join("") || '<p class="sub">Aún no hay preguntas.</p>'
  );
}

/* ---------- Zonas donde vale el descuento ---------- */
const UBI = "https://cdn.jsdelivr.net/gh/joseluisq/ubigeos-peru/json";
let ubiD = null;
const lookupUbi = (data) => {
  if (data && !Array.isArray(data) && typeof data === "object") {
    const vals = Object.values(data);
    if (vals.length && Array.isArray(vals[0]))
      return (p) => data[p] || data[String(p)] || [];
    return (p) => vals.filter((i) => String(i.id_padre_ubigeo) === String(p));
  }
  if (Array.isArray(data))
    return (p) => data.filter((i) => String(i.id_padre_ubigeo) === String(p));
  return () => [];
};
const ordUbi = (a) =>
  a.slice().sort((x, y) => x.nombre_ubigeo.localeCompare(y.nombre_ubigeo));
async function ubiLoad() {
  if (ubiD) return ubiD;
  const [d, p, t] = await Promise.all(
    ["departamentos", "provincias", "distritos"].map((n) =>
      fetch(`${UBI}/${n}.json`).then((r) => r.json()),
    ),
  );
  ubiD = {
    dep: ordUbi(Array.isArray(d) ? d : Object.values(d)),
    prov: lookupUbi(p),
    dist: lookupUbi(t),
  };
  return ubiD;
}
const slug = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function zChips() {
  const box = $("#zChips");
  if (!box) return;
  const z = F.discount.zonas || [];
  box.innerHTML = z.length
    ? z
        .map(
          (x, i) =>
            `<span>${esc(x.label)}<button type="button" data-zi="${i}" title="Quitar" aria-label="Quitar ${esc(x.label)}">✕</button></span>`,
        )
        .join("")
    : '<span style="background:none;color:var(--muted);padding-left:0">Todas las zonas (sin restricción)</span>';
}
async function initZonas() {
  const sd = $("#zDep"),
    sp = $("#zProv"),
    st = $("#zDist");
  if (!sd) return;
  const ph = (t) => `<option value="">${t}</option>`;
  const fill = (s, arr, t) => {
    s.innerHTML =
      ph(t) +
      arr
        .map(
          (x) =>
            `<option value="${x.id_ubigeo}">${esc(x.nombre_ubigeo)}</option>`,
        )
        .join("");
    s.disabled = false;
  };
  const reset = (s, t) => {
    s.innerHTML = ph(t);
    s.disabled = true;
  };
  sd.innerHTML = ph("Cargando…");
  reset(sp, "Todas las provincias");
  reset(st, "Todos los distritos");
  try {
    const U = await ubiLoad();
    fill(sd, U.dep, "Departamento");
    sd.onchange = () => {
      reset(st, "Todos los distritos");
      if (sd.value) fill(sp, ordUbi(U.prov(sd.value)), "Todas las provincias");
      else reset(sp, "Todas las provincias");
    };
    sp.onchange = () => {
      if (sp.value) fill(st, ordUbi(U.dist(sp.value)), "Todos los distritos");
      else reset(st, "Todos los distritos");
    };
  } catch (e) {
    console.error(e);
    sd.innerHTML = ph("Error al cargar");
  }
  $("#zAdd").onclick = () => {
    const m = $("#zMsg");
    m.textContent = "";
    if (!sd.value) {
      m.textContent = "Elige al menos un departamento.";
      return;
    }
    const depN = sd.selectedOptions[0].textContent,
      provN = sp.value ? sp.selectedOptions[0].textContent : "",
      distN = st.value ? st.selectedOptions[0].textContent : "";
    const z = {
      dep: slug(depN),
      prov: provN ? slug(provN) : "",
      dist: distN ? slug(distN) : "",
      label: [distN, provN, depN].filter(Boolean).join(", "),
    };
    F.discount.zonas = F.discount.zonas || [];
    if (
      F.discount.zonas.some(
        (x) => x.dep === z.dep && x.prov === z.prov && x.dist === z.dist,
      )
    ) {
      m.textContent = "Esa zona ya está en la lista.";
      return;
    }
    F.discount.zonas.push(z);
    sd.value = "";
    reset(sp, "Todas las provincias");
    reset(st, "Todos los distritos");
    zChips();
    regBox();
    pub();
  };
  $("#zChips").onclick = (e) => {
    const b = e.target.closest("[data-zi]");
    if (!b) return;
    F.discount.zonas.splice(+b.dataset.zi, 1);
    zChips();
    regBox();
    pub();
  };
}

function list() {
  F = null;
  ogBlob = null;
  RC = { id: null, rows: [] };
  $("#app").innerHTML =
    `<div class="top"><div><h1>Formularios y encuestas</h1><p class="sub">Entra a uno para ver todo lo que ha pasado.</p></div><button class="btn pri" id="nw">Nuevo formulario</button></div>
  ${forms.length ? "" : '<div class="card"><h2>Aún no tienes formularios</h2><p class="sub" style="margin:0">Crea el primero con “Nuevo formulario” y aparecerá aquí.</p></div>'}<div class="grid">${forms
    .map(
      (
        f,
      ) => `<button class="fc" data-id="${f.id}"><span class="chip ${f.status === "activo" ? "ok" : "off"}">${f.status === "activo" ? "Activo" : "Borrador"}</span> <span class="chip">${esc(f.kind)}</span>
  <h3>${esc(f.title)}</h3><dl><div><dt>Respuestas</dt><dd>${f.stats.done}</dd></div><div><dt>Finalización</dt><dd>${pct(f.stats.done, f.stats.visits)}</dd></div></dl></button>`,
    )
    .join("")}</div>`;
  $(".grid").onclick = (e) => {
    const b = e.target.closest(".fc");
    if (b) {
      F = structuredClone(forms.find((x) => x.id === b.dataset.id));
      tab = "resumen";
      FL = { ...FL0 };
      detail();
    }
  };
  $("#nw").onclick = () => {
    F = {
      id: "nuevo",
      status: "borrador",
      kind: "Encuesta",
      title: "Nuevo formulario",
      sub: "",
      register: false,
      regCampos: { ...REG_DEF },
      onlyUsers: false,
      discount: { on: false, pct: 10, code: "", zonas: [] },
      stats: { visits: 0, done: 0, coupons: 0, byDay: [0, 0, 0, 0, 0, 0, 0] },
      questions: [],
    };
    tab = "editar";
    detail();
  };
}
function detail() {
  $("#app").innerHTML =
    `<button class="link" id="bk">← Todos los formularios</button>
  <div class="top"><div><h1>${esc(F.title)}</h1><p class="sub">${esc(F.kind)} · ${F.status === "activo" ? "Activo" : "Borrador"}</p></div>
  <div style="display:flex;gap:8px"><button class="btn" id="vf"${F.id === "nuevo" ? " disabled" : ""}>Ver formulario</button></div></div>
  <div class="tabs" id="tb">${[
    ["resumen", "Resumen"],
    ["respuestas", "Respuestas"],
    ["editar", "Editar"],
  ]
    .map(
      ([k, v]) =>
        `<button data-t="${k}" class="${k === tab ? "on" : ""}">${v}</button>`,
    )
    .join("")}</div><div id="body"></div>`;
  $("#bk").onclick = list;
  $("#vf").onclick = () => window.open(DB.link(F), "_blank");
  $("#tb").onclick = (e) => {
    const b = e.target.closest("button");
    if (b) {
      tab = b.dataset.t;
      detail();
    }
  };
  ({ resumen, respuestas, editar })[tab]();
}

async function resumen() {
  $("#body").innerHTML = '<p class="sub">Cargando…</p>';
  let R = [];
  try {
    R = await getR();
  } catch (e) {
    console.error(e);
    $("#body").innerHTML =
      '<p class="sub">No se pudieron cargar las respuestas.</p>';
    return;
  }
  const s = F.stats,
    mx = Math.max(...s.byDay, 1);
  $("#body").innerHTML =
    `<div class="kpis"><div class="kpi"><span>Visitas</span><b>${s.visits}</b></div><div class="kpi"><span>Respuestas completas</span><b>${s.done}</b></div><div class="kpi"><span>Tasa de finalización</span><b>${pct(s.done, s.visits)}</b></div><div class="kpi"><span>Descuentos entregados</span><b>${s.coupons}</b></div></div>
  ${geoCards(R, false)}
  ${dayHours(R)}
  <div class="two"><div class="card"><h2>Respuestas por día (7 días)</h2><div class="cols">${s.byDay.map((d) => `<i style="height:${Math.max((d / mx) * 100, 3)}%" title="${d}"></i>`).join("")}</div></div>
  <div class="card"><h2>Dónde abandonan</h2>${[
    "Inicio",
    ...F.questions.map((q) => q.text),
  ]
    .map((t, i) => {
      const p = s.visits
        ? Math.min(
            100,
            Math.round(
              ((i === 0 ? s.visits : (s.pasos || {})["p" + i] || 0) /
                s.visits) *
                100,
            ),
          )
        : 0;
      return `<div class="bar"><span>${esc(String(t).slice(0, 26))}</span><div><i style="width:${p}%"></i></div><u>${p}%</u></div>`;
    })
    .join("")}</div></div>
  <div class="card"><h2>Resultados por pregunta</h2>${qBlock(R)}</div>
  ${R.length >= 1000 ? '<p class="sub">Se analizan las últimas 1000 respuestas.</p>' : ""}`;
}

async function respuestas() {
  $("#body").innerHTML = '<p class="sub">Cargando…</p>';
  let all = [];
  try {
    all = await getR();
  } catch (e) {
    console.error(e);
    $("#body").innerHTML =
      '<p class="sub">No se pudieron cargar las respuestas.</p>';
    return;
  }
  const qsel = F.questions.filter((q) => q.type !== "text");
  $("#body").innerHTML = `<div class="card"><h2>Filtros</h2>
  <div class="flt" id="flt">
    <input class="in full" data-f="q" type="search" placeholder="Buscar por nombre, correo, WhatsApp o cupón…" value="${esc(FL.q)}">
    <div><label class="f">Desde</label><input class="in" data-f="from" type="date" value="${esc(FL.from)}"></div>
    <div><label class="f">Hasta</label><input class="in" data-f="to" type="date" value="${esc(FL.to)}"></div>
    <div><label class="f">Tipo</label><select class="in" data-f="user"><option value="">Todos</option><option value="reg">Registrados</option><option value="anon">Anónimos</option></select></div>
    <div><label class="f">Zona del descuento</label><select class="in" data-f="zona"><option value="">Todas</option><option value="dentro">Dentro de zona</option><option value="fuera">Fuera de zona</option></select></div>
    <div><label class="f">Cupón</label><select class="in" data-f="cupon"><option value="">Todos</option><option value="con">Con cupón</option><option value="sin">Sin cupón</option></select></div>
    <div><label class="f">Departamento</label><select class="in" data-f="dep"></select></div>
    <div><label class="f">Provincia</label><select class="in" data-f="prov"></select></div>
    <div><label class="f">Distrito</label><select class="in" data-f="dist"></select></div>
    <div><label class="f">Pregunta</label><select class="in" data-f="qid"><option value="">— Ninguna —</option>${qsel.map((q) => `<option value="${q.id}">${esc(String(q.text).slice(0, 60))}</option>`).join("")}</select></div>
    <div><label class="f">Respuesta elegida</label><select class="in" data-f="qopt"></select></div>
    <div><label class="f">Ordenar</label><select class="in" data-f="sort"><option value="new">Más recientes</option><option value="old">Más antiguas</option><option value="name">Nombre A-Z</option></select></div>
  </div>
  <div class="fbar" style="margin-top:12px">
    <button class="btn" data-q="0">Hoy</button><button class="btn" data-q="7">7 días</button><button class="btn" data-q="30">30 días</button>
    <button class="btn" id="fReset">Limpiar filtros</button>
    <button class="btn" id="fReload">Actualizar</button>
    <button class="btn pri" id="fCsv">Descargar CSV</button>
  </div></div>
  <p class="cnt" id="rcount"></p>
  <div id="rsum"></div>
  <div id="rlist"></div>`;

  const fl = $("#flt");
  ["user", "zona", "cupon", "sort", "qid"].forEach((k) => {
    fl.querySelector(`[data-f="${k}"]`).value = FL[k];
  });

  const opt = (arr, cur, all) =>
    `<option value="">${all}</option>` +
    arr
      .map(
        ([v, n]) =>
          `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(tc(v))} (${n})</option>`,
      )
      .join("");
  const cnt = (rows, k) => {
    const m = new Map();
    rows.forEach((r) => r.z[k] && m.set(r.z[k], (m.get(r.z[k]) || 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  function fillGeo() {
    const d = all,
      p = FL.dep ? d.filter((r) => r.z.dep === FL.dep) : d,
      t = FL.prov ? p.filter((r) => r.z.prov === FL.prov) : p;
    fl.querySelector('[data-f="dep"]').innerHTML = opt(cnt(d, "dep"), FL.dep, "Todos");
    fl.querySelector('[data-f="prov"]').innerHTML = opt(cnt(p, "prov"), FL.prov, "Todas");
    fl.querySelector('[data-f="dist"]').innerHTML = opt(cnt(t, "dist"), FL.dist, "Todos");
  }
  function fillQopt() {
    const sel = fl.querySelector('[data-f="qopt"]'),
      q = F.questions.find((x) => String(x.id) === String(FL.qid));
    if (!q) {
      sel.innerHTML = '<option value="">—</option>';
      sel.disabled = true;
      return;
    }
    const L =
      q.type === "scale"
        ? ["1", "2", "3", "4", "5"]
        : [...(q.opts || []), ...(q.other ? ["Otro"] : [])];
    sel.disabled = false;
    sel.innerHTML =
      '<option value="">Cualquiera</option>' +
      L.map(
        (l) =>
          `<option value="${esc(l)}"${l === FL.qopt ? " selected" : ""}>${esc(l)} (${all.filter((r) => matchAns(r.a?.[q.id], l)).length})</option>`,
      ).join("");
  }

  function paintR() {
    const rows = applyF(all);
    $("#rcount").textContent =
      `${rows.length} de ${all.length} respuestas` +
      (all.length >= 1000 ? " (últimas 1000)" : "");
    const n = rows.length,
      reg = rows.filter((r) => r.user).length,
      fuera = rows.filter((r) => r.zona_ok === false).length,
      con = rows.filter((r) => r.coupon).length,
      sinU = rows.filter((r) => !r.z.dep).length;
    $("#rsum").innerHTML = `<div class="kpis"><div class="kpi"><span>Respuestas</span><b>${n}</b></div><div class="kpi"><span>Registrados</span><b>${reg}</b></div><div class="kpi"><span>Anónimos</span><b>${n - reg}</b></div><div class="kpi"><span>Con cupón</span><b>${con}</b></div><div class="kpi"><span>Fuera de zona</span><b>${fuera}</b></div><div class="kpi"><span>Sin ubicación</span><b>${sinU}</b></div></div>
    ${geoCards(rows, true)}
    ${dayHours(rows)}
    <details class="fold card"><summary>Resultados por pregunta (solo con estos filtros)</summary><div style="margin-top:12px">${qBlock(rows)}</div></details>`;
    const shown = rows.slice(0, SHOWN);
    $("#rlist").innerHTML =
      shown
        .map((r) => {
          const ub = [r.z.dist, r.z.prov, r.z.dep].filter(Boolean).map(tc).join(", ");
          return `<details class="r"><summary><span><b>${esc(r.who)}</b> <span class="sub">${esc(r.mail || "Sin registro")}${r.tel ? " · " + esc(r.tel) : ""}</span></span>
  <span><span class="chip ${r.user ? "ok" : "off"}">${r.user ? "Registrado" : "Anónimo"}</span> ${ub ? `<span class="chip">${esc(ub)}</span> ` : ""}${r.zona_ok === false ? '<span class="chip off" title="Enviarle el cupón por WhatsApp">Fuera de zona</span> ' : ""}<span class="chip">${esc(r.coupon || "Sin descuento")}</span> <span class="sub">${esc(r.date)}</span></span></summary>
  <div class="rb">${ub ? `<p class="loc">📍 ${esc(ub)}</p>` : ""}${F.questions
    .map((q) => {
      const v = r.a?.[q.id],
        t = Array.isArray(v) ? v.join(", ") : (v ?? "");
      return `<p><small>${esc(q.text)}</small>${t === "" ? "Sin respuesta" : esc(t)}</p>`;
    })
    .join("")}</div></details>`;
        })
        .join("") ||
      '<p class="sub">No hay respuestas con esos filtros.</p>';
    if (rows.length > SHOWN)
      $("#rlist").insertAdjacentHTML(
        "beforeend",
        `<button class="btn more" id="fMore">Ver más (${rows.length - SHOWN} restantes)</button>`,
      );
    paintR.rows = rows;
  }

  fl.addEventListener("input", (e) => {
    if (e.target.dataset.f === "q") {
      FL.q = e.target.value;
      SHOWN = 50;
      paintR();
    }
  });
  fl.addEventListener("change", (e) => {
    const k = e.target.dataset.f;
    if (!k || k === "q") return;
    FL[k] = e.target.value;
    if (k === "dep") FL.prov = FL.dist = "";
    if (k === "prov") FL.dist = "";
    if (k === "qid") FL.qopt = "";
    SHOWN = 50;
    fillGeo();
    fillQopt();
    paintR();
  });
  $("#body").addEventListener("click", async (e) => {
    const g = e.target.closest("[data-geo]");
    if (g) {
      const z = JSON.parse(g.dataset.geo);
      FL.dep = z.dep;
      FL.prov = z.prov;
      FL.dist = z.dist;
      SHOWN = 50;
      fillGeo();
      paintR();
      $("#flt").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const qb = e.target.closest("[data-q]");
    if (qb) {
      const d = new Date(),
        f = new Date();
      f.setDate(d.getDate() - +qb.dataset.q);
      const iso = (x) =>
        x.getFullYear() +
        "-" +
        String(x.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(x.getDate()).padStart(2, "0");
      FL.from = iso(f);
      FL.to = iso(d);
      fl.querySelector('[data-f="from"]').value = FL.from;
      fl.querySelector('[data-f="to"]').value = FL.to;
      SHOWN = 50;
      paintR();
      return;
    }
    if (e.target.id === "fMore") {
      SHOWN += 50;
      paintR();
    }
    if (e.target.id === "fReset") {
      FL = { ...FL0 };
      SHOWN = 50;
      respuestas();
    }
    if (e.target.id === "fReload") {
      await getR(true);
      respuestas();
    }
    if (e.target.id === "fCsv") descargarCsv(paintR.rows || []);
  });

  fillGeo();
  fillQopt();
  paintR();
}

function descargarCsv(rows) {
  const c = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const head = [
    "Fecha",
    "Nombre",
    "Correo",
    "WhatsApp",
    "Tipo",
    "Departamento",
    "Provincia",
    "Distrito",
    "Fuera de zona",
    "Cupón",
    ...F.questions.map((q) => q.text),
  ];
  const lines = rows.map((r) =>
    [
      r.date,
      r.who,
      r.mail,
      r.tel,
      r.user ? "Registrado" : "Anónimo",
      tc(r.z.dep),
      tc(r.z.prov),
      tc(r.z.dist),
      r.zona_ok === false ? "Sí" : "No",
      r.coupon,
      ...F.questions.map((q) => {
        const v = r.a?.[q.id];
        return Array.isArray(v) ? v.join(" | ") : (v ?? "");
      }),
    ]
      .map(c)
      .join(","),
  );
  const blob = new Blob(["\ufeff" + [head.map(c).join(","), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `respuestas-${slug(F.title) || "formulario"}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function editar() {
  step = 0;
  ans = {};
  ansO = {};
  F.discount.zonas = F.discount.zonas || [];
  $("#body").innerHTML = `<div class="split"><div>
  <div class="card"><h2>Cabecera</h2><div class="row"><div><label class="f">Tipo</label><select class="in" id="fKind">${["Encuesta", "Formulario", "Feedback", "Sorteo"].map((k) => `<option>${k}</option>`).join("")}</select></div><div><label class="f">Estado</label><select class="in" id="fSt"><option value="activo">Activo</option><option value="borrador">Borrador</option></select></div></div>
  <label class="f">Título</label><input class="in" id="fTitle" maxlength="120"><label class="f">Texto de bienvenida</label><textarea class="in" id="fSub" rows="2" maxlength="400"></textarea>
  <p class="sub" style="margin:0;font-size:12.5px">Logo y colores vienen del negocio en la base de datos.</p></div>
  <div class="card"><h2>Al compartir el enlace</h2><div class="og" id="ogPrev"></div>
 <label class="f">Imagen vertical (se optimiza sola a WebP 1080 × 1350, sin recortar)</label>
  <div style="display:flex;gap:8px;margin-bottom:12px"><label class="btn" style="cursor:pointer">Subir imagen<input type="file" id="ogFile" accept="image/*" hidden></label><button class="btn" id="ogDel">Quitar</button></div>
  <p class="sub" id="ogMsg" style="margin:-4px 0 10px;font-size:12.5px"></p>
  <label class="f">Título al compartir</label><input class="in" id="ogT" placeholder="Si lo dejas vacío, usa el título del formulario">
  <label class="f">Descripción</label><textarea class="in" id="ogD" rows="2" placeholder="Si lo dejas vacío, usa el texto de bienvenida"></textarea></div>
  <div class="card"><h2>Preguntas</h2><div id="qs"></div><button class="add" id="addQ">Agregar pregunta</button></div>
  <div class="card"><h2>Al finalizar</h2>
  <div class="sw"><div>Pedir registro<small>Nombre, correo y teléfono</small></div><button class="tg" id="tReg" aria-label="Pedir registro"></button></div>
  <div id="regBox" class="qcfg" style="padding:10px 0;border-top:1px solid var(--line)"></div>
  <div class="sw"><div>Dar un descuento<small>Se muestra al enviar</small></div><button class="tg" id="tDis" aria-label="Dar descuento"></button></div>
  <div class="row" id="disBox" style="margin-top:10px"><div><label class="f">Descuento (%)</label><input class="in" id="dPct" type="number" disabled></div><div><label class="f">Cupón (de tu lista)</label><select class="in" id="dCode">${cupOpts()}</select></div></div>
  <div id="zonaBox" style="margin-top:6px">
    <label class="f">¿Dónde está disponible el descuento?</label>
    <div class="zch" id="zChips"></div>
    <div class="zrow"><select class="in" id="zDep"></select><select class="in" id="zProv" disabled></select><select class="in" id="zDist" disabled></select></div>
    <button class="add" id="zAdd" type="button">Agregar zona</button>
    <p class="sub" id="zMsg" style="margin:8px 0 0;font-size:12.5px;color:#e5484d"></p>
    <p class="sub" style="margin:8px 0 0;font-size:12.5px">Si lo dejas vacío vale en todas partes. Si agregas zonas, quien se registre desde otra zona verá “oferta no disponible en tu zona” y su cupón se le envía por WhatsApp. En ese caso el formulario pide ubicación y WhatsApp automáticamente.</p>
  </div>
  <div class="sw"><div>Solo usuarios registrados<small>Cuentas ya existentes en tu SaaS</small></div><button class="tg" id="tUsr" aria-label="Solo usuarios registrados"></button></div></div>
  <button class="btn pri" id="sv">Guardar cambios</button>
  <div class="upbar" id="upBar"><i id="upFill"></i></div>
  <p class="svmsg" id="svMsg" role="alert"></p></div>
  <div><div class="dev"><div class="pub" id="pub"></div></div><p class="hint">Vista previa interactiva</p></div></div>`;
  F.og = F.og || { title: "", desc: "", image: "" };
  sync();
  qs();
  pub();
  og();
  initZonas();
  $("#ogT").value = F.og.title || "";
  $("#ogD").value = F.og.desc || "";
  $("#ogT").oninput = (e) => {
    F.og.title = e.target.value;
    og();
  };
  $("#ogD").oninput = (e) => {
    F.og.desc = e.target.value;
    og();
  };
  $("#ogDel").onclick = () => {
    ogBlob = null;
    F.og.image = "";
    $("#ogMsg").textContent = "";
    og();
  };
  $("#ogFile").onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 10e6) {
      $("#ogMsg").textContent = "La imagen es demasiado pesada (máx. 10 MB).";
      return;
    }
    $("#ogMsg").textContent = "Optimizando imagen…";
    try {
      const r = await comprimirAWebp(f, {
        w: 1080,
        h: 1350,
        modo: "contain",
        maxBytes: 400 * 1024,
      });
      ogBlob = r.blob;
      F.og.image = r.url;
      $("#ogMsg").textContent =
        `Lista en WebP (${Math.round(r.blob.size / 1024)} KB). Se subirá al guardar.`;
      og();
    } catch (err) {
      console.error(err);
      $("#ogMsg").textContent = err.message || "No se pudo procesar la imagen.";
    }
  };
  [
    ["fTitle", "title"],
    ["fSub", "sub"],
    ["fKind", "kind"],
    ["fSt", "status"],
  ].forEach(
    ([i, k]) =>
      ($("#" + i).oninput = (e) => {
        F[k] = e.target.value;
        pub();
      }),
  );
  $("#dPct").oninput = (e) => {
    F.discount.pct = +e.target.value;
    pub();
  };
  $("#dCode").onchange = (e) => {
    const c = CUPS.find((x) => x.codigo === e.target.value);
    F.discount.code = c ? c.codigo : "";
    F.discount.pct = c ? c.porcentajeManual : 0;
    sync();
    pub();
  };
  $("#tReg").onclick = () => {
    F.register = F.discount.on ? true : !F.register;
    sync();
    pub();
  };
  $("#tDis").onclick = () => {
    F.discount.on = !F.discount.on;
    if (F.discount.on) F.register = true;
    sync();
    pub();
  };
  $("#tUsr").onclick = () => {
    F.onlyUsers = !F.onlyUsers;
    sync();
    pub();
  };
  $("#regBox").onchange = (e) => {
    const k = e.target.dataset.r;
    if (!k) return;
    F.regCampos = { ...regC(), [k]: e.target.checked };
    regBox();
    pub();
  };
  $("#addQ").onclick = () => {
    F.questions.push({
      id: Date.now(),
      type: "single",
      text: "Nueva pregunta",
      opts: ["Opción 1", "Opción 2"],
      required: true,
      other: false,
    });
    qs();
    pub();
  };
  $("#sv").onclick = async () => {
    const b = $("#sv"),
      m = $("#svMsg"),
      bar = $("#upBar"),
      fill = $("#upFill"),
      subiendo = !!ogBlob;
    m.textContent = "";
    const err = check(F);
    if (err) {
      m.textContent = err;
      return;
    }
    b.disabled = true;
    b.textContent = subiendo ? "Subiendo imagen… 0%" : "Guardando…";
    if (subiendo) {
      fill.style.width = "0%";
      bar.style.display = "block";
    }
    try {
      F.title = F.title.trim();
      F.regCampos = regC();
      F.questions = F.questions.map(normQ);
      F.discount.code = String(F.discount.code).trim();
      F.discount.zonas = F.discount.zonas || [];
      const s = await DB.save(F, (p) => {
        fill.style.width = p + "%";
        b.textContent = p < 100 ? `Subiendo imagen… ${p}%` : "Guardando…";
      });
      F.id = s.id;
      F.og = s.og;
      const i = forms.findIndex((x) => x.id === s.id);
      i < 0 ? forms.push(F) : (forms[i] = F);
      qs();
      og();
      $("#ogMsg").textContent = "";
      const vf = $("#vf");
      if (vf) vf.disabled = false;
      b.textContent = "Guardado";
    } catch (e) {
      console.error(e);
      m.textContent = subiendo
        ? "No se pudo subir la imagen o guardar. Revisa tu conexión e inténtalo de nuevo."
        : "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.";
      b.textContent = "Guardar cambios";
    }
    bar.style.display = "none";
    b.disabled = false;
    setTimeout(
      () => $("#sv") && ($("#sv").textContent = "Guardar cambios"),
      2500,
    );
  };

  $("#qs").addEventListener("input", (e) => {
    const card = e.target.closest(".q");
    if (!card) return;
    const q = F.questions[+card.dataset.i],
      k = e.target.dataset.k;
    if (k === "text") q.text = e.target.value;
    if (e.target.dataset.o) q.opts[+e.target.dataset.o - 1] = e.target.value;
    if (["minLen", "maxLen", "maxSel"].includes(k))
      q[k] = Math.max(0, Math.floor(+e.target.value || 0));
    pub();
  });
  $("#qs").addEventListener("change", (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    const q = F.questions[+e.target.closest(".q").dataset.i];
    if (k === "type") {
      q.type = e.target.value;
      q.opts = q.opts || [];
      if (isChoice(q) && q.opts.length < 2) q.opts = ["Opción 1", "Opción 2"];
      q.required = q.type !== "text";
      if (!isChoice(q)) q.other = false;
      if (q.type !== "multi") q.maxSel = 0;
      qs();
      pub();
    } else if (k === "required" || k === "other") {
      q[k] = e.target.checked;
      pub();
    }
  });
  $("#qs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-a]");
    if (!b) return;
    const i = +b.closest(".q").dataset.i,
      Q = F.questions,
      a = b.dataset.a;
    if (a === "del") Q.splice(i, 1);
    if (a === "up" && i > 0) [Q[i - 1], Q[i]] = [Q[i], Q[i - 1]];
    if (a === "down" && i < Q.length - 1) [Q[i + 1], Q[i]] = [Q[i], Q[i + 1]];
    if (a === "addo") Q[i].opts.push("Nueva opción");
    if (a === "delo") Q[i].opts.splice(+b.dataset.j, 1);
    qs();
    pub();
  });
}
function og() {
  const o = F.og;
  $("#ogPrev").innerHTML =
    `<div class="ogi">${o.image ? "" : "Sin imagen"}</div><div class="ogt"><small>${esc(location.hostname || "tuapp.com")}</small><b>${esc(o.title || F.title)}</b><span>${esc(o.desc || F.sub)}</span></div>`;
  $(".ogi").style.backgroundImage = o.image ? `url("${o.image}")` : "";
}
function regBox() {
  const c = regC(),
    box = $("#regBox");
  if (!box) return;
  box.style.display = F.register ? "flex" : "none";
  box.innerHTML = Object.keys(REG_DEF)
    .map((k) => {
      const dis =
        (k === "correo" && c.cuenta) ||
        (zonaActiva() && (k === "ubicacion" || k === "telefono")) ||
        (F.discount.on &&
          ["cuenta", "correo", "nombres", "telefono"].includes(k));
      return `<label><input type="checkbox" data-r="${k}"${c[k] ? " checked" : ""}${dis ? " disabled" : ""}> ${REG_LBL[k]}</label>`;
    })
    .join("");
}
function sync() {
  $("#tReg").classList.toggle("on", F.register);
  $("#tDis").classList.toggle("on", F.discount.on);
  $("#tUsr").classList.toggle("on", F.onlyUsers);
  $("#disBox").style.display = F.discount.on ? "flex" : "none";
  $("#zonaBox").style.display = F.discount.on ? "block" : "none";
  $("#dPct").value = F.discount.pct;
  $("#dCode").value = F.discount.code;
  $("#fTitle").value = F.title;
  $("#fSub").value = F.sub;
  $("#fKind").value = F.kind;
  $("#fSt").value = F.status;
  zChips();
  regBox();
}
function qs() {
  $("#qs").innerHTML =
    F.questions
      .map((q, i) => {
        const isT = q.type === "text",
          isM = q.type === "multi",
          isC = isChoice(q);
        return `<div class="q" data-i="${i}"><div class="qh"><input class="in" data-k="text" value="${esc(q.text)}" aria-label="Pregunta ${i + 1}">
      <select class="in" data-k="type" style="width:150px" aria-label="Tipo">${Object.entries(
        TYPES,
      )
        .map(
          ([k, v]) =>
            `<option value="${k}"${k === q.type ? " selected" : ""}>${v}</option>`,
        )
        .join("")}</select>
      <button class="ic" data-a="up" title="Subir">↑</button><button class="ic" data-a="down" title="Bajar">↓</button><button class="ic" data-a="del" title="Eliminar">✕</button></div>
      ${isC ? (q.opts || []).map((o, j) => `<div class="opt"><input class="in" data-o="${j + 1}" value="${esc(o)}" aria-label="Opción ${j + 1}"><button class="ic" data-a="delo" data-j="${j}" title="Quitar">✕</button></div>`).join("") + '<button class="add" data-a="addo">Agregar opción</button>' : ""}
      <div class="qcfg">
        <label><input type="checkbox" data-k="required"${req(q) ? " checked" : ""}> Obligatoria</label>
        ${isC ? `<label><input type="checkbox" data-k="other"${q.other ? " checked" : ""}> Incluir “Otro” (texto libre)</label>` : ""}
        ${isM ? `<label>Máx. opciones <input class="in sm" type="number" min="0" data-k="maxSel" value="${q.maxSel || 0}" title="0 = sin límite"></label>` : ""}
        ${isT ? `<label>Mín. caracteres <input class="in sm" type="number" min="0" data-k="minLen" value="${q.minLen || 0}"></label><label>Máx. <input class="in sm" type="number" min="0" data-k="maxLen" value="${q.maxLen || 0}" title="0 = sin límite"></label>` : ""}
      </div></div>`;
      })
      .join("") || '<p class="sub">Agrega la primera pregunta.</p>';
}

/* vista previa */
function pub() {
  const n = F.questions.length,
    el = $("#pub"),
    h = `<div class="bl"><i></i><b>${esc(brand.name)}</b></div>`;
  step = Math.min(step, n + (F.register ? 2 : 1));
  const go = (t, fn, back) => {
    el.insertAdjacentHTML(
      "beforeend",
      `<button class="go" id="nx">${t}</button>${back ? '<button class="back" id="bkp">Volver</button>' : ""}`,
    );
    $("#nx").onclick = fn;
    if (back)
      $("#bkp").onclick = () => {
        step--;
        pub();
      };
  };
  if (step === 0) {
    el.innerHTML = `${h}<div class="grow"><h3>${esc(F.title)}</h3><p>${esc(F.sub)}</p><span class="chip">${n} ${n === 1 ? "pregunta" : "preguntas"}</span>${F.discount.on ? `<p style="margin-top:12px">Al terminar recibes un <b style="color:var(--text)">${esc(F.discount.pct)}% de descuento</b>.</p>` : ""}</div>`;
    go("Comenzar", () => {
      if (n) {
        step = 1;
        pub();
      }
    });
    return;
  }
  if (step <= n) {
    const q = F.questions[step - 1],
      a = ans[q.id],
      on = (v) => (Array.isArray(a) ? a.includes(v) : a === v);
    let b = "";
    if (isChoice(q)) {
      b = (q.opts || [])
        .map(
          (o) =>
            `<button class="ch${on(o) ? " sel" : ""}" data-v="${esc(o)}">${esc(o)}</button>`,
        )
        .join("");
      if (q.other) {
        b += `<button class="ch${on(OTR) ? " sel" : ""}" data-v="${OTR}">Otro</button>`;
        if (on(OTR))
          b += `<input id="otr" maxlength="120" placeholder="Escribe tu respuesta…" value="${esc(ansO[q.id] || "")}">`;
      }
      if (q.type === "multi" && q.maxSel)
        b += `<p class="sub">Elige hasta ${q.maxSel}.</p>`;
    }
    if (q.type === "scale")
      b = `<div class="sc">${[1, 2, 3, 4, 5].map((v) => `<button class="${a === v ? "sel" : ""}" data-v="${v}">${v}</button>`).join("")}</div>`;
    if (q.type === "text")
      b = `<textarea placeholder="Escribe aquí" maxlength="${q.maxLen || 2000}">${esc(a || "")}</textarea>`;
    el.innerHTML = `${h}<div class="prog"><i style="width:${(step / n) * 100}%"></i></div><h3 style="margin-top:6px">${esc(q.text)}${req(q) ? " *" : ""}</h3><div class="grow">${b}<p class="sub" id="verr" style="color:#e5484d;display:none"></p></div>`;
    el.querySelectorAll("[data-v]").forEach(
      (x) =>
        (x.onclick = () => {
          const v = q.type === "scale" ? +x.dataset.v : x.dataset.v;
          if (q.type === "multi") {
            const s = new Set(ans[q.id] || []);
            if (s.has(v)) s.delete(v);
            else {
              if (q.maxSel && s.size >= q.maxSel) {
                const e = $("#verr");
                e.textContent = `Elige máximo ${q.maxSel} opciones.`;
                e.style.display = "block";
                return;
              }
              s.add(v);
            }
            ans[q.id] = [...s];
          } else ans[q.id] = v;
          focusOtr = v === OTR;
          pub();
        }),
    );
    const ta = el.querySelector("textarea");
    if (ta) ta.oninput = () => (ans[q.id] = ta.value);
    const oi = $("#otr");
    if (oi) {
      oi.oninput = () => (ansO[q.id] = oi.value);
      if (focusOtr) oi.focus();
    }
    focusOtr = false;
    go(
      step === n ? (F.register ? "Continuar" : "Enviar") : "Siguiente",
      () => {
        const m = problem(q, ans[q.id], ansO[q.id]);
        if (m) {
          const e = $("#verr");
          e.textContent = m;
          e.style.display = "block";
          return;
        }
        step++;
        pub();
      },
      true,
    );
    return;
  }
  if (step === n + 1 && F.register) {
    const c = regC(),
      f = [];
    if (c.nombres)
      f.push(
        '<input placeholder="Nombre" aria-label="Nombre"><input placeholder="Apellido" aria-label="Apellido">',
      );
    if (c.correo)
      f.push('<input type="email" placeholder="Correo" aria-label="Correo">');
    if (c.cuenta)
      f.push(
        '<input type="password" placeholder="Contraseña" aria-label="Contraseña">',
      );
    if (c.telefono)
      f.push('<input type="tel" placeholder="WhatsApp" aria-label="WhatsApp">');
    if (c.genero) f.push('<input placeholder="Género" aria-label="Género">');
    if (c.ubicacion)
      f.push(
        '<input placeholder="Departamento" aria-label="Departamento"><input placeholder="Provincia" aria-label="Provincia"><input placeholder="Distrito" aria-label="Distrito">',
      );
    if (zonaActiva())
      f.push(
        `<p class="sub" style="font-size:12.5px">Descuento disponible en: ${esc((F.discount.zonas || []).map((z) => z.label).join(" · "))}</p>`,
      );
    if (c.fecha_nac)
      f.push('<input type="date" aria-label="Fecha de nacimiento">');
    if (c.nacionalidad)
      f.push('<input placeholder="Nacionalidad" aria-label="Nacionalidad">');
    el.innerHTML = `${h}<h3>Último paso</h3><p>Déjanos tus datos${F.discount.on ? " para enviarte tu descuento" : ""}.</p><div class="grow">${f.join("")}</div>`;
    go(
      "Enviar",
      () => {
        step++;
        pub();
      },
      true,
    );
    return;
  }
  el.innerHTML = `${h}<div class="grow"><h3>¡Gracias por responder!</h3>${F.discount.on ? `<div class="coupon"><b>${esc(F.discount.pct)}% de descuento</b><span class="sub">Válido por 30 días</span><br><code>${esc(F.discount.code || "CÓDIGO")}</code></div>` : "<p>Tu opinión nos ayuda a mejorar.</p>"}</div>`;
  go("Probar de nuevo", () => {
    step = 0;
    ans = {};
    ansO = {};
    pub();
  });
}

$("#app").innerHTML = '<p class="sub">Cargando…</p>';
(async () => {
  try {
    [brand, forms] = await Promise.all([
      DB.brand(),
      DB.forms(),
      cargarCupones(),
    ]);
    paint();
    list();
  } catch (e) {
    console.error(e);
    $("#app").innerHTML =
      '<p class="sub">No se pudieron cargar los formularios.</p><p class="sub">' +
      esc((e.code || "") + " " + (e.message || "")) +
      "</p>";
  }
})();