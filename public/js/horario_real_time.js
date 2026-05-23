import {
  initializeApp,
  getApps,
  getApp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  doc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ── Inicialización Firebase ───────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
  authDomain: "geinzworkapp.firebaseapp.com",
  projectId: "geinzworkapp",
  storageBucket: "geinzworkapp.appspot.com",
  messagingSenderId: "921389328767",
  appId: "1:921389328767:web:094e8a2a5fcd69395b524a",
};

const TIENDA_PATH = "Tiendas/barranca/barranca/fW7W8RsgkkQ3IYfxKHGR";

let _app;
try {
  _app = getApp();
} catch {
  _app = initializeApp(FIREBASE_CONFIG);
}
const db = getFirestore(_app);

// ── Utilidades de tiempo ──────────────────────────────────────

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

// ── Lógica principal ──────────────────────────────────────────

function calcularEstado(horarioAtencion) {
  const ahora = new Date();
  const diaActual = ahora.getDay(); // 0 = domingo … 6 = sábado
  const minActual = ahora.getHours() * 60 + ahora.getMinutes();
  const diaKey = DIAS_ES[diaActual];
  const diaKeyMañana = DIAS_ES[(diaActual + 1) % 7];

  // ── Helpers ────────────────────────────────────────────────

  /** ¿Está el día marcado como cerrado? Lee el campo al nivel del día. */
  function diaCerrado(dayKey) {
    return horarioAtencion?.[dayKey]?.cerrado === true;
  }

  /** Motivo de cierre del día (nivel del día). */
  function motivoDia(dayKey) {
    return horarioAtencion?.[dayKey]?.motivo || null;
  }

  /**
   * Primer bloque con horas válidas de un día abierto.
   * Solo se usa para encontrar la próxima apertura.
   */
  function primerBloqueValido(dayKey) {
    if (diaCerrado(dayKey)) return null;
    const bloques = horarioAtencion?.[dayKey]?.bloques ?? [];
    for (const b of bloques) {
      if (b.h_apertura && b.h_cierre) return b;
    }
    return null;
  }

  // ── ¿El día de hoy está cerrado explícitamente? ────────────
  if (diaCerrado(diaKey)) {
    const motivo = motivoDia(diaKey);

    // Buscar próximo día abierto
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

  // ── Día abierto: revisar bloques de hoy ───────────────────
  const bloquesHoy = horarioAtencion?.[diaKey]?.bloques ?? [];

  // ¿Hay un bloque activo ahora mismo?
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

  // ¿Hay un bloque hoy que aún no empezó?
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

  // Ya pasaron todos los bloques de hoy → buscar próximo día
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

// ── Renderizado en DOM ────────────────────────────────────────

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

// ── Inicialización pública ────────────────────────────────────

export function initHorario(selector = "#horario-estado") {
  const contenedor = document.querySelector(selector);

  if (!contenedor) {
    console.warn(`[horario.js] No se encontró el elemento "${selector}"`);
    return () => {};
  }

  contenedor.innerHTML = `<span style="color:#9ca3af;font-size:.8rem;">Cargando horario…</span>`;

  const ref = doc(db, TIENDA_PATH);

  const unsubscribe = onSnapshot(
    ref,
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
    },
  );

  // Refresca cada minuto sin nueva lectura a Firestore
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

// ── Auto-init ─────────────────────────────────────────────────
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("horario-estado")) {
      initHorario("#horario-estado");
    }
  });
}
