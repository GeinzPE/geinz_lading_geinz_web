// ═══════════════════════════════════════════════════════════════════
// horario_unificado.js
// Integra:
//   - Cálculo y visualización de estado actual (abierto/cerrado)
//   - Editor de horario híbrido (horizontal en PC, colapsable en móvil)
// ═══════════════════════════════════════════════════════════════════
// DESPUÉS
import {
  onSnapshot,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { db } from "../db/db.js";
import { tiendaDoc } from "../rutas/rutas.js";

const params = new URLSearchParams(window.location.search); 
const tiendaId = params.get("id") || sessionStorage.getItem("tiendaId");
const localidad = params.get("localidad") || sessionStorage.getItem("localidad");

const docRef = tiendaDoc(localidad, "tiendas", tiendaId);
// ─────────────────────────────────────────────────────────────
// ── 1. MÓDULO DE ESTADO (horario.js original)
// ─────────────────────────────────────────────────────────────

function toMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function formatDuration(mins) {
  if (mins <= 0) return "0 min";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const DIAS_ES = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

function calcularEstado(horarioAtencion) {
  const ahora = new Date();
  const diaActual = ahora.getDay(); // 0 = domingo … 6 = sábado
  const minActual = ahora.getHours() * 60 + ahora.getMinutes();
  const diaKey = DIAS_ES[diaActual];
  const diaKeyMañana = DIAS_ES[(diaActual + 1) % 7];

  function diaCerrado(dayKey) {
    return horarioAtencion?.[dayKey]?.cerrado === true;
  }

  function motivoDia(dayKey) {
    return horarioAtencion?.[dayKey]?.motivo || null;
  }

  function primerBloqueValido(dayKey) {
    if (diaCerrado(dayKey)) return null;
    const bloques = horarioAtencion?.[dayKey]?.bloques ?? [];
    for (const b of bloques) {
      if (b.h_apertura && b.h_cierre) return b;
    }
    return null;
  }

  if (diaCerrado(diaKey)) {
    const motivo = motivoDia(diaKey);
    for (let i = 1; i <= 7; i++) {
      const keyProx = DIAS_ES[(diaActual + i) % 7];
      const bloque = primerBloqueValido(keyProx);
      if (bloque) {
        const label = i === 1 ? "mañana" : `el ${keyProx}`;
        return {
          abierto: false,
          etiqueta: "Cerrado hoy",
          detalle: `Abre ${label} a las ${bloque.h_apertura}`,
          motivo,
          color: "gray",
        };
      }
    }
    return {
      abierto: false,
      etiqueta: "Cerrado hoy",
      detalle: "Sin próxima apertura programada",
      motivo,
      color: "gray",
    };
  }

  const bloquesHoy = horarioAtencion?.[diaKey]?.bloques ?? [];
  for (const bloque of bloquesHoy) {
    const apertura = toMinutes(bloque.h_apertura);
    const cierre = toMinutes(bloque.h_cierre);
    if (apertura === null || cierre === null) continue;

    if (minActual >= apertura && minActual < cierre) {
      const restante = cierre - minActual;
      if (restante <= 30) {
        return {
          abierto: true,
          etiqueta: "Abierto",
          detalle: `Cierra pronto · ${bloque.h_cierre}`,
          motivo: null,
          color: "orange",
        };
      }
      return {
        abierto: true,
        etiqueta: "Abierto",
        detalle: `Cierra en ${formatDuration(restante)} · ${bloque.h_cierre}`,
        motivo: null,
        color: "green",
      };
    }
  }

  for (const bloque of bloquesHoy) {
    const apertura = toMinutes(bloque.h_apertura);
    if (apertura === null) continue;
    if (apertura > minActual) {
      const restante = apertura - minActual;
      return {
        abierto: false,
        etiqueta: "Cerrado",
        detalle: `Abre hoy en ${formatDuration(restante)} · ${bloque.h_apertura}`,
        motivo: null,
        color: restante <= 60 ? "orange" : "red",
      };
    }
  }

  const bloqueManana = primerBloqueValido(diaKeyMañana);
  if (bloqueManana) {
    return {
      abierto: false,
      etiqueta: "Cerrado",
      detalle: `Abre mañana a las ${bloqueManana.h_apertura}`,
      motivo: null,
      color: "red",
    };
  }

  for (let i = 2; i <= 7; i++) {
    const keyProx = DIAS_ES[(diaActual + i) % 7];
    const bloque = primerBloqueValido(keyProx);
    if (bloque) {
      return {
        abierto: false,
        etiqueta: "Cerrado",
        detalle: `Abre el ${keyProx} a las ${bloque.h_apertura}`,
        motivo: null,
        color: "red",
      };
    }
  }

  return {
    abierto: false,
    etiqueta: "Cerrado",
    detalle: "Sin próxima apertura programada",
    motivo: null,
    color: "gray",
  };
}

function renderEstado(estado, contenedor) {
  if (!contenedor) return;
  const colorMap = {
    green: { text: "#16a34a", dot: "#22c55e" },
    orange: { text: "#ea580c", dot: "#f97316" },
    red: { text: "#dc2626", dot: "#ef4444" },
    gray: { text: "#6b7280", dot: "#9ca3af" },
  };
  const c = colorMap[estado.color] ?? colorMap.gray;

  if (!document.getElementById("horario-style")) {
    const style = document.createElement("style");
    style.id = "horario-style";
    style.textContent = `
      @keyframes horario-pulse {
        0%, 100% { opacity: 1;  transform: scale(1);    }
        50%       { opacity: .4; transform: scale(1.45); }
      }
    `;
    document.head.appendChild(style);
  }

  const pulseStyle = estado.abierto
    ? "animation: horario-pulse 1.6s ease-in-out infinite;"
    : "";
  const detalleTexto =
    estado.detalle + (estado.motivo ? ` · ${estado.motivo}` : "");

  contenedor.innerHTML = `
    <span style="
      margin-left: 5px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: inherit;
      font-size: inherit;
      line-height: 1.3;
    ">
      <span style="
        display: inline-block;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: ${c.dot};
        flex-shrink: 0;
        ${pulseStyle}
      "></span>
      <span style="color: ${c.text}; font-weight: 600;">${estado.etiqueta}</span>
      <span style="color: ${c.text}; font-weight: 400; opacity: .85;">${detalleTexto}</span>
    </span>
  `;
}

export function initHorario(selector = "#horario-estado") {
  const contenedor = document.querySelector(selector);
  if (!contenedor) {
    console.warn(`[horario.js] No se encontró el elemento "${selector}"`);
    return () => {};
  }
  contenedor.innerHTML = `<span style="color:#9ca3af;font-size:.8rem;">Cargando horario…</span>`;

  const unsubscribe = onSnapshot(
    docRef,
    (snap) => {
      if (!snap.exists()) {
        contenedor.innerHTML = `<span style="color:#9ca3af;font-size:.8rem;">Sin datos de horario</span>`;
        return;
      }
      const data = snap.data();
      const horario = data?.horario_atencion;
      if (!horario) {
        contenedor.innerHTML = `<span style="color:#9ca3af;font-size:.8rem;">Horario no configurado</span>`;
        return;
      }
      contenedor._horarioData = horario;
      renderEstado(calcularEstado(horario), contenedor);
    },
    (error) => {
      console.error("[horario.js] Error Firestore:", error);
      contenedor.innerHTML = `<span style="color:#ef4444;font-size:.8rem;">Error al cargar horario</span>`;
    }
  );

  const interval = setInterval(() => {
    if (contenedor._horarioData) {
      renderEstado(calcularEstado(contenedor._horarioData), contenedor);
    }
  }, 60_000);

  return () => {
    unsubscribe();
    clearInterval(interval);
  };
}

// ─────────────────────────────────────────────────────────────
// ── 2. MÓDULO EDITOR DE HORARIO (horario_editor.js original)
// ─────────────────────────────────────────────────────────────

const DIAS = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
];

const LABEL = {
  lunes: "Lunes",
  martes: "Martes",
  miércoles: "Miércoles",
  jueves: "Jueves",
  viernes: "Viernes",
  sábado: "Sábado",
  domingo: "Domingo",
};

const MOTIVOS_CIERRE = [
  "Mantenimiento",
  "Renovación",
  "Inventario",
  "Cierre",
  "Emergencia",
  "Limpieza",
  "Clausura",
  "No disponible",
  "Descanso",
];

let estado = {};
let estadoGuardado = {};
let unsub = null;
let diasAbiertosUI = {};
let _container = null;
let _ignorarSnapshot = 0;

function hayCambios(dia) {
  const actual = estado[dia];
  const guardado = estadoGuardado[dia];
  if (!guardado) return true;

  if (actual.activo !== guardado.activo) return true;
  if (actual.descanso !== guardado.descanso) return true;
  if (!actual.activo && actual.motivo !== guardado.motivo) return true;

  const bActual = actual.descanso
    ? actual.bloques.slice(0, 2)
    : [actual.bloques[0]];
  const bGuardado = guardado.descanso
    ? guardado.bloques.slice(0, 2)
    : [guardado.bloques[0]];

  for (let i = 0; i < bActual.length; i++) {
    if (!bGuardado[i]) return true;
    if (bActual[i].h_apertura !== bGuardado[i].h_apertura) return true;
    if (bActual[i].h_cierre !== bGuardado[i].h_cierre) return true;
  }
  return false;
}

function bloqueDefault() {
  return { h_apertura: "19:00", h_cierre: "22:30" };
}

function convertir12h(hora24) {
  if (!hora24) return "--:-- --";
  let [h, m] = hora24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

function cargarHorario(data) {
  const out = {};
  DIAS.forEach((dia) => {
    const bloques = data?.[dia]?.bloques || [];
    const estaCerrado = data?.[dia]?.cerrado === true;
    const motivoGuardado = data?.[dia]?.motivo || "";

    out[dia] = {
      activo: !estaCerrado,
      descanso: bloques.length > 1,
      mostrar12h: estado[dia]?.mostrar12h || false,
      motivo: motivoGuardado || MOTIVOS_CIERRE[0],
      bloques: bloques.length
        ? bloques.map((b) => ({
            h_apertura: b.h_apertura,
            h_cierre: b.h_cierre,
          }))
        : [bloqueDefault()],
    };

    if (out[dia].descanso && out[dia].bloques.length < 2) {
      out[dia].bloques.push(bloqueDefault());
    }
  });
  estadoGuardado = JSON.parse(JSON.stringify(out));
  return out;
}

function serializarDia(dia) {
  const d = estado[dia];
  if (!d) return {};

  const listaBloques = d.descanso ? d.bloques.slice(0, 2) : [d.bloques[0]];

  return {
    [`horario_atencion.${dia}.cerrado`]: !d.activo,
    [`horario_atencion.${dia}.motivo`]: !d.activo ? d.motivo : "",
    [`horario_atencion.${dia}.bloques`]: listaBloques.map((b) => ({
      h_apertura: b.h_apertura || "19:00",
      h_cierre: b.h_cierre || "22:30",
      stability: 0,
    })),
  };
}

function insertarCSS() {
  if (document.getElementById("he-style")) return;
  const style = document.createElement("style");
  style.id = "he-style";
  style.textContent = `
    .he-container { 
      display: flex;
      flex-direction: column;
      gap: 16px; 
      color: #ffffff; 
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      background: #000000; 
      padding: 12px; 
      width: 100%;
      box-sizing: border-box; 
    }
    .he-card { background: #161616; border-radius: 18px; overflow: hidden; border: 1px solid #262626; transition: border-color 0.3s ease; width: 100%; box-sizing: border-box; }
    .he-card.is-expanded { border-color: #3a3a3a; }
    .he-head { display: flex; justify-content: space-between; align-items: center; padding: 18px 22px; cursor: pointer; user-select: none; }
    .he-head:hover { background: #1c1c1c; }
    .he-left { font-size: 17px; font-weight: 600; display: flex; align-items: center; gap: 10px; }
    .he-arrow { font-size: 12px; color: #666; transition: transform 0.3s ease; }
    .he-card.is-expanded .he-arrow { transform: rotate(180deg); color: #a000ff; }
    .he-right { display: flex; align-items: center; gap: 14px; font-size: 14px; color: #aaa; font-weight: 500; }
    .he-switch { width: 52px; height: 30px; background: #a000ff; border-radius: 999px; position: relative; cursor: pointer; }
    .he-switch::after { content: ""; position: absolute; width: 24px; height: 24px; border-radius: 50%; background: #ffffff; top: 3px; right: 3px; transition: all 0.25s ease; }
    .he-switch.off { background: #333333; }
    .he-switch.off::after { right: auto; left: 3px; background: #999999; }
    .he-body { padding: 0 22px 22px; background: #161616; border-top: 1px solid #222222; display: none; }
    .he-card.is-expanded .he-body { display: block; }
    .he-link { color: #bb33ff; font-size: 13.5px; text-decoration: none; font-weight: 600; margin: 16px 0; display: inline-block; cursor: pointer; }
    .he-options { display: flex; gap: 20px; margin-bottom: 20px; border-bottom: 1px solid #222; padding-bottom: 14px; }
    .he-check { display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; color: #e0e0e0; }
    .he-check input { width: 18px; height: 18px; accent-color: #a000ff; cursor: pointer; }
    .he-row-group { display: flex; flex-direction: column; gap: 16px; }
    .he-row { display: flex; gap: 12px; align-items: center; width: 100%; }
    .he-field { display: flex; flex-direction: column; gap: 6px; flex: 1; }
    .he-field label { font-size: 11px; color: #888; font-weight: 600; text-transform: uppercase; }
    .he-input { width: 100%; height: 46px; border-radius: 12px; border: 1px solid #2a2a2a; background: #1f1f1f; color: #ffffff; padding: 0 12px; font-size: 15px; box-sizing: border-box; }
    .he-input:focus { border-color: #a000ff; outline: none; }
    .he-a { font-size: 14px; color: #666; font-weight: bold; margin-top: 20px; }
    .he-conv-box { background: #1c1c1e; padding: 14px; border-radius: 14px; margin: 16px 0 8px 0; border: 1px dashed #3a3a3c; }
    .he-conv-title { font-size: 13px; color: #bb33ff; font-weight: 700; margin-bottom: 6px; }
    .he-conv-text { font-size: 11.5px; color: #929296; margin-bottom: 10px; line-height: 1.4; }
    .he-conv-grid { display: flex; justify-content: space-between; background: #2c2c2e; padding: 10px 14px; border-radius: 10px; font-size: 13.5px; }
    .he-motivos-container { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: 16px 0; }
    .he-motivo-label { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #d1d1d6; background: #1f1f1f; padding: 10px 12px; border-radius: 12px; cursor: pointer; border: 1px solid #2a2a2a; }
    .he-motivo-label input { accent-color: #a000ff; }
    .he-btn { width: 100%; margin-top: 14px; border: none; background: #a000ff; color: #ffffff; padding: 14px; border-radius: 25px; cursor: pointer; font-size: 15px; font-weight: 600; }
    .he-btn:disabled { background: #3a3a3c; color: #8e8e93; cursor: not-allowed; }

    @media (min-width: 900px) {
      .he-container {
        flex-direction: row;
        overflow-x: auto;
        white-space: nowrap;
        padding: 20px 10px;
        scroll-behavior: smooth;
      }
      .he-container::-webkit-scrollbar { height: 8px; }
      .he-container::-webkit-scrollbar-track { background: #000; }
      .he-container::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
      .he-container::-webkit-scrollbar-thumb:hover { background: #444; }
      .he-card { flex: 0 0 360px; display: inline-block; vertical-align: top; }
      .he-body { display: block !important; }
      .he-arrow { display: none !important; }
      .he-head { cursor: default; }
      .he-head:hover { background: initial; }
    }
  `;
  document.head.appendChild(style);
}

async function guardarDia(dia, btn) {
  try {
    btn.disabled = true;
    const textoOriginal = btn.innerText;
    btn.innerText = "Guardando...";

    const data = serializarDia(dia);
    _ignorarSnapshot++;
    await updateDoc(docRef, data);
    estadoGuardado[dia] = JSON.parse(JSON.stringify(estado[dia]));

    btn.style.background = "#34c759";
    btn.innerText = "✓ Guardado";

    setTimeout(() => {
      const card = _container?.querySelector(`.he-card[data-dia="${dia}"]`);
      const body = card?.querySelector(".he-body");
      if (body) checkBtn(dia, body);
    }, 2000);
  } catch (e) {
    console.error("Error:", e);
    btn.innerText = "Error";
    btn.disabled = false;
    if (_ignorarSnapshot > 0) _ignorarSnapshot--;
  }
}

function buildBody(dia, body) {
  const d = estado[dia];

  if (d.activo) {
    body.innerHTML = `
      <div class="he-link-toggle he-link">${d.mostrar12h ? "Ocultar conversión a 12 h" : "Mostrar conversión a 12 h"}</div>
      <div class="he-options">
        <label class="he-check"><input type="radio" name="tipo_trabajo_${dia}" class="rad-corrido" ${!d.descanso ? "checked" : ""}> Trabajo de corrido</label>
        <label class="he-check"><input type="radio" name="tipo_trabajo_${dia}" class="rad-descanso" ${d.descanso ? "checked" : ""}> Trabajo con descanso</label>
      </div>
      <div class="he-row-group">
        <div class="he-row">
          <div class="he-field"><label>Apertura 1</label><input class="he-input open1" type="time" value="${d.bloques[0]?.h_apertura || "19:00"}"></div>
          <div class="he-a">a</div>
          <div class="he-field"><label>Cierre 1</label><input class="he-input close1" type="time" value="${d.bloques[0]?.h_cierre || "22:30"}"></div>
        </div>
        ${
          d.descanso
            ? `
        <div class="he-row">
          <div class="he-field"><label>Apertura 2</label><input class="he-input open2" type="time" value="${d.bloques[1]?.h_apertura || "19:00"}"></div>
          <div class="he-a">a</div>
          <div class="he-field"><label>Cierre 2</label><input class="he-input close2" type="time" value="${d.bloques[1]?.h_cierre || "22:30"}"></div>
        </div>`
            : ""
        }
      </div>
      ${
        d.mostrar12h
          ? `
      <div class="he-conv-box">
        <div class="he-conv-title">Conversión automática a 12 h</div>
        <div class="he-conv-grid">
          <div><strong>Apertura:</strong> ${convertir12h(d.bloques[0]?.h_apertura)}</div>
          <div><strong>Cierre:</strong> ${convertir12h(d.bloques[0]?.h_cierre)}</div>
        </div>
        ${
          d.descanso && d.bloques[1]
            ? `
        <div class="he-conv-grid" style="margin-top: 8px;">
          <div><strong>Apertura 2:</strong> ${convertir12h(d.bloques[1]?.h_apertura)}</div>
          <div><strong>Cierre 2:</strong> ${convertir12h(d.bloques[1]?.h_cierre)}</div>
        </div>`
            : ""
        }
      </div>`
          : ""
      }
    `;

    body.querySelector(".open1").oninput = (e) => {
      d.bloques[0].h_apertura = e.target.value;
      if (d.mostrar12h) buildBody(dia, body);
      checkBtn(dia, body);
    };
    body.querySelector(".close1").oninput = (e) => {
      d.bloques[0].h_cierre = e.target.value;
      if (d.mostrar12h) buildBody(dia, body);
      checkBtn(dia, body);
    };

    if (d.descanso) {
      body.querySelector(".open2").oninput = (e) => {
        if (!d.bloques[1]) d.bloques[1] = bloqueDefault();
        d.bloques[1].h_apertura = e.target.value;
        if (d.mostrar12h) buildBody(dia, body);
        checkBtn(dia, body);
      };
      body.querySelector(".close2").oninput = (e) => {
        if (!d.bloques[1]) d.bloques[1] = bloqueDefault();
        d.bloques[1].h_cierre = e.target.value;
        if (d.mostrar12h) buildBody(dia, body);
        checkBtn(dia, body);
      };
    }

    body.querySelector(".rad-corrido").onchange = () => {
      d.descanso = false;
      if (window.innerWidth >= 900) {
        buildBody(dia, body);
        checkBtn(dia, body);
      } else {
        render(_container);
      }
    };
    body.querySelector(".rad-descanso").onchange = () => {
      d.descanso = true;
      if (d.bloques.length < 2) d.bloques.push(bloqueDefault());
      if (window.innerWidth >= 900) {
        buildBody(dia, body);
        checkBtn(dia, body);
      } else {
        render(_container);
      }
    };
    body.querySelector(".he-link-toggle").onclick = () => {
      d.mostrar12h = !d.mostrar12h;
      buildBody(dia, body);
      checkBtn(dia, body);
    };
  } else {
    body.innerHTML = `
      <div style="font-size: 13px; margin-top:12px; color:#888; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; white-space: normal;">Selecciona tu motivo de cierre</div>
      <div class="he-motivos-container">
        ${MOTIVOS_CIERRE.map((m) => `<label class="he-motivo-label"><input type="radio" name="motivo_cierre_${dia}" value="${m}" ${d.motivo === m ? "checked" : ""}> ${m}</label>`).join("")}
      </div>
    `;
    body.querySelectorAll(`input[name="motivo_cierre_${dia}"]`).forEach((r) => {
      r.onchange = (e) => {
        d.motivo = e.target.value;
        checkBtn(dia, body);
      };
    });
  }
}

function rebindBtn(dia, body) {
  const existente = body.querySelector(".he-btn");
  if (existente) return;
  const btn = document.createElement("button");
  btn.className = "he-btn";
  btn.innerText = "Guardar";
  btn.onclick = () => guardarDia(dia, btn);
  body.appendChild(btn);
}

function checkBtn(dia, body) {
  let btn = body.querySelector(".he-btn");
  if (hayCambios(dia)) {
    if (!btn) {
      btn = document.createElement("button");
      btn.className = "he-btn";
      btn.innerText = "Guardar";
      btn.onclick = () => guardarDia(dia, btn);
      body.appendChild(btn);
    }
  } else {
    if (btn) btn.remove();
  }
}

function updateCardBody(dia, card) {
  const d = estado[dia];
  const switchEl = card.querySelector(".he-switch");
  const statusEl = card.querySelector(".he-right span");
  if (switchEl) switchEl.className = `he-switch${d.activo ? "" : " off"}`;
  if (statusEl) statusEl.textContent = d.activo ? "Abierto" : "Cerrado";

  const body = card.querySelector(".he-body");
  if (!body) return;
  buildBody(dia, body);
  checkBtn(dia, body);
}

function render(container) {
  const scrollLeftPos = container.scrollLeft;
  const scrollTopPos = container.scrollTop;

  container.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "he-container";

  DIAS.forEach((dia) => {
    const d = estado[dia];
    const card = document.createElement("div");
    const estaExpandidoUI = diasAbiertosUI[dia] === true;
    card.className = `he-card ${estaExpandidoUI ? "is-expanded" : ""}`;
    card.dataset.dia = dia;

    const head = document.createElement("div");
    head.className = "he-head";
    head.innerHTML = `
      <div class="he-left">
        <span class="he-arrow">▼</span>
        ${LABEL[dia]}
      </div>
      <div class="he-right">
        <span>${d.activo ? "Abierto" : "Cerrado"}</span>
        <div class="he-switch ${d.activo ? "" : "off"}"></div>
      </div>
    `;

    head.onclick = () => {
      if (window.innerWidth < 900) {
        diasAbiertosUI[dia] = !diasAbiertosUI[dia];
        render(container);
      }
    };

    head.querySelector(".he-switch").onclick = (e) => {
      e.stopPropagation();
      d.activo = !d.activo;
      if (window.innerWidth >= 900) {
        updateCardBody(dia, card);
      } else {
        diasAbiertosUI[dia] = true;
        render(container);
      }
    };

    const body = document.createElement("div");
    body.className = "he-body";
    buildBody(dia, body);
    checkBtn(dia, body);
    card.appendChild(head);
    card.appendChild(body);
    wrap.appendChild(card);
  });

  container.appendChild(wrap);

  requestAnimationFrame(() => {
    container.scrollLeft = scrollLeftPos;
    container.scrollTop = scrollTopPos;
  });
}

export function initHorarioEditor(selector = "#scheduleBody") {
  insertarCSS();
  const container = document.querySelector(selector);
  if (!container) return;
  _container = container;
  container.innerHTML =
    "<div style='color:#888; text-align:center; padding:30px; font-size:15px; font-weight:500;'>Cargando panel de control de GEINZ...</div>";
  if (unsub) unsub();

  unsub = onSnapshot(
    docRef,
    (snap) => {
      if (!snap.exists()) return;
      if (_ignorarSnapshot > 0) {
        _ignorarSnapshot--;
        return;
      }
      const fullData = snap.data();
      const data = fullData?.horario_atencion || {};
      estado = cargarHorario(data);
      render(container);
    },
    (error) => {
      console.error("Error Snapshot:", error);
    }
  );
}

// ─────────────────────────────────────────────────────────────
// Auto-inicializaciones (mantienen el comportamiento original)
// ─────────────────────────────────────────────────────────────
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    const estadoEl = document.getElementById("horario-estado");
    if (estadoEl) initHorario("#horario-estado");

    const editorEl = document.getElementById("scheduleBody");
    if (editorEl) initHorarioEditor("#scheduleBody");
  });
}