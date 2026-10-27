import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { storage } from "../db/db.js";
import { tiendaSubDoc, formulariosCol, setUbicacion } from "../rutas/rutas.js";
import {
  comprimirAWebp,
  subirWebp,
} from "../compresor_imagen/compresor_imagen.js";

/* ===== Estilos de la configuración por pregunta (no hace falta tocar tu CSS) ===== */
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
</style>`,
);

/* Imagen OG ya optimizada (WebP) que se sube al guardar */
let ogBlob = null;

/* Marca real del negocio: nombre_tienda, img_tienda.logo_tienda y color_marca */
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
let TD = {}; // datos crudos de la tienda
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

/* ---------- Reglas de preguntas (las mismas que usa el formulario público) ---------- */
const OTR = "__otro__";
const isChoice = (q) => q.type === "single" || q.type === "multi";
/* texto libre: opcional por defecto · las demás: obligatorias por defecto */
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
/* deja la pregunta limpia antes de guardar (sin campos que no aplican) */
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
/* devuelve el texto del error o "" si todo está bien */
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
    if (!(f.discount.pct >= 1 && f.discount.pct <= 100))
      return "El descuento debe estar entre 1 y 100.";
    if (!String(f.discount.code).trim())
      return "Escribe el código del descuento.";
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
          limit(200),
        ),
      )
    ).docs.map((d) => {
      const x = d.data();
      return {
        ...x,
        a: x.a || {},
        who: x.who || "Anónimo",
        date: x.at?.toDate
          ? x.at.toDate().toLocaleString("es-PE", {
              dateStyle: "short",
              timeStyle: "short",
            })
          : "",
      };
    }),
  /* Guarda el formulario. Si hay imagen OG pendiente la sube a:
     tiendas/<TIENDA_ID>/formulario/<ID_FORMULARIO>/og.webp  y guarda la URL en og.image */
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
      data.og.image = ""; // nunca guardar un blob local
    }
    await setDoc(r, data, { merge: true });
    ogBlob = null; // solo se limpia cuando TODO salió bien
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
  ansO = {}, // texto de "Otro" en la vista previa
  focusOtr = false;
const root = document.documentElement.style;
const paint = () => {
  root.setProperty("--brand", brand.primary);
  root.setProperty("--brand2", brand.secondary);
};
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + "%" : "0%");

function list() {
  F = null;
  ogBlob = null; // evita subir una imagen pendiente a otro formulario
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
      onlyUsers: false,
      discount: { on: false, pct: 10, code: "" },
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
    R = F.id === "nuevo" ? [] : await DB.responses(F.id);
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
  <div class="two"><div class="card"><h2>Respuestas por día</h2><div class="cols">${s.byDay.map((d) => `<i style="height:${Math.max((d / mx) * 100, 3)}%" title="${d}"></i>`).join("")}</div></div>
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
  <div class="card"><h2>Resultados por pregunta</h2>${
    F.questions
      .map((q) => {
        if (q.type === "text")
          return `<p><b>${esc(q.text)}</b><br><span class="sub">Respuestas abiertas: ver en la pestaña Respuestas.</span></p>`;
        const L =
            q.type === "scale"
              ? ["1", "2", "3", "4", "5"]
              : [...(q.opts || []), ...(q.other ? ["Otro"] : [])],
          isO = (x) => String(x).startsWith("Otro:"),
          w = L.map(
            (l) =>
              R.filter((r) => {
                const v = r.a?.[q.id];
                if (v === undefined || v === null) return false;
                const m = (x) => (l === "Otro" ? isO(x) : String(x) === l);
                return Array.isArray(v) ? v.some(m) : m(v);
              }).length,
          ),
          t = w.reduce((a, b) => a + b, 0) || 1;
        /* lista de lo que escribieron en "Otro" */
        const otros = [];
        if (q.other)
          R.forEach((r) => {
            const v = r.a?.[q.id];
            (Array.isArray(v) ? v : [v]).forEach((x) => {
              if (x !== undefined && isO(x))
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
                )}${otros.length > 10 ? `<span class="sub">y ${otros.length - 10} más en la pestaña Respuestas</span>` : ""}</div>`
            : ""
        }<div style="height:14px"></div>`;
      })
      .join("") || '<p class="sub">Aún no hay preguntas.</p>'
  }</div>`;
}

async function respuestas() {
  $("#body").innerHTML = '<p class="sub">Cargando…</p>';
  let R = [];
  try {
    R = F.id === "nuevo" ? [] : await DB.responses(F.id);
  } catch (e) {
    console.error(e);
    $("#body").innerHTML =
      '<p class="sub">No se pudieron cargar las respuestas.</p>';
    return;
  }
  $("#body").innerHTML =
    R.map(
      (
        r,
      ) => `<details class="r"><summary><span><b>${esc(r.who)}</b> <span class="sub">${esc(r.mail || "Sin registro")}</span></span>
  <span><span class="chip ${r.user ? "ok" : "off"}">${r.user ? "Usuario registrado" : "Anónimo"}</span> <span class="chip">${esc(r.coupon || "Sin descuento")}</span> <span class="sub">${esc(r.date)}</span></span></summary>
  <div class="rb">${F.questions
    .map((q) => {
      const v = r.a?.[q.id],
        t = Array.isArray(v) ? v.join(", ") : (v ?? "");
      return `<p><small>${esc(q.text)}</small>${t === "" ? "Sin respuesta" : esc(t)}</p>`;
    })
    .join("")}</div></details>`,
    ).join("") || '<p class="sub">Todavía no hay respuestas.</p>';
}

function editar() {
  step = 0;
  ans = {};
  ansO = {};
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
  <div class="sw"><div>Dar un descuento<small>Se muestra al enviar</small></div><button class="tg" id="tDis" aria-label="Dar descuento"></button></div>
  <div class="row" id="disBox" style="margin-top:10px"><div><label class="f">Descuento (%)</label><input class="in" id="dPct" type="number" min="1" max="100"></div><div><label class="f">Código</label><input class="in" id="dCode" maxlength="30"></div></div>
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
      F.og.image = r.url; // vista previa local
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
  $("#dCode").oninput = (e) => {
    F.discount.code = e.target.value;
    pub();
  };
  $("#tReg").onclick = () => {
    F.register = !F.register;
    sync();
    pub();
  };
  $("#tDis").onclick = () => {
    F.discount.on = !F.discount.on;
    sync();
    pub();
  };
  $("#tUsr").onclick = () => {
    F.onlyUsers = !F.onlyUsers;
    sync();
    pub();
  };
  $("#addQ").onclick = () => {
    F.questions.push({
      id: Date.now(), // único: no choca con preguntas guardadas antes
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
      F.questions = F.questions.map(normQ);
      F.discount.code = String(F.discount.code).trim();
      const s = await DB.save(F, (p) => {
        fill.style.width = p + "%";
        b.textContent = p < 100 ? `Subiendo imagen… ${p}%` : "Guardando…";
      });
      F.id = s.id;
      F.og = s.og;
      const i = forms.findIndex((x) => x.id === s.id);
      i < 0 ? forms.push(F) : (forms[i] = F);
      qs();
      og(); // ahora la vista previa usa la URL real de Storage
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

  /* ---- listeners de las preguntas ---- */
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
      q.required = q.type !== "text"; // texto libre: opcional por defecto
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
function sync() {
  $("#tReg").classList.toggle("on", F.register);
  $("#tDis").classList.toggle("on", F.discount.on);
  $("#tUsr").classList.toggle("on", F.onlyUsers);
  $("#disBox").style.display = F.discount.on ? "flex" : "none";
  $("#dPct").value = F.discount.pct;
  $("#dCode").value = F.discount.code;
  $("#fTitle").value = F.title;
  $("#fSub").value = F.sub;
  $("#fKind").value = F.kind;
  $("#fSt").value = F.status;
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

/* vista previa: misma UX y mismas validaciones que form-publico.html */
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
    el.innerHTML = `${h}<h3>Último paso</h3><p>Déjanos tus datos${F.discount.on ? " para enviarte tu descuento" : ""}.</p><div class="grow"><input placeholder="Nombre" aria-label="Nombre"><input type="email" placeholder="Correo" aria-label="Correo"><input type="tel" placeholder="Teléfono (opcional)" aria-label="Teléfono"></div>`;
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
    [brand, forms] = await Promise.all([DB.brand(), DB.forms()]);
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