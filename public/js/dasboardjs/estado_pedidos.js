import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  enableIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "/js/db/db.js";
import { tiendaDoc, tiendaSubDoc } from "/js/rutas/rutas.js";
import { setFaviconCircular } from "/js/favicon/favicon.js"; // ajusta la ruta a donde tengas el archivo

// Cache local: si el pedido se vuelve a abrir (o hay un corte de red breve),
// se sirve desde disco al instante en vez de esperar a la red.
try {
  enableIndexedDbPersistence(db).catch((err) => {
    console.warn("[pedidos] Persistencia local no disponible:", err.code);
  });
} catch (e) {
  console.warn("[pedidos] No se pudo activar la persistencia local:", e);
}

// ---- Config: ajustar si la localidad varía por negocio ----
const LOCALIDAD_FIJA = "barranca";

// ---- Estados del pedido (única fuente de verdad, sin duplicados) ----
const ESTADOS = ["pendiente", "en_proceso", "entregado"];
const ESTADOS_LABEL = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  en_pausa: "En pausa",
  entregado: "Entregado",
  rechazado: "Rechazado",
};

function normalizarEstado(estado) {
  const e = (estado || "").toLowerCase().trim();
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

// ---- Parseo de ruta: /pedidos/{negocioId}/{pedidoId} (o /dashboard/... como alias) ----
function parseRuta() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("negocioId") && params.get("pedidoId")) {
    return {
      negocioId: params.get("negocioId"),
      pedidoId: params.get("pedidoId"),
    };
  }
  const partes = window.location.pathname.split("/").filter(Boolean);
  const idx = partes.findIndex((p) => p === "pedidos" || p === "dashboard");
  if (idx === -1 || partes.length < idx + 3) {
    console.warn("[pedidos] No se pudo extraer negocioId/pedidoId de la ruta");
    return null;
  }
  return { negocioId: partes[idx + 1], pedidoId: partes[idx + 2] };
}

const ids = parseRuta();

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

// Ejecuta una función en un momento ocioso del navegador (o con un pequeño retraso
// como respaldo). Evita que trabajo no crítico -como leer los píxeles del logo-
// bloquee el primer pintado en equipos de gama baja.
const enIdle = (fn) => {
  if ("requestIdleCallback" in window)
    window.requestIdleCallback(fn, { timeout: 1500 });
  else setTimeout(fn, 200);
};

let unsubNegocio = null;
let unsubPedido = null;
let colorListo = null;
let primeraVezMostrado = false;
let estadoAnterior = null; // para detectar el cambio de estado
let primerRenderPedido = true; // evita notificar en la carga inicial
let pedidoRefGlobal = null; // referencia del doc del pedido, usada por el banner de pausa

if (!ids) {
  showEmpty();
} else {
  init(ids.negocioId, ids.pedidoId);
}

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

// Limpia los listeners activos de Firestore si la pestaña se cierra o el
// usuario navega fuera. Evita fugas de memoria/lecturas fantasma a escala.
window.addEventListener("beforeunload", () => {
  if (unsubNegocio) unsubNegocio();
  if (unsubPedido) unsubPedido();
});

function init(negocioId, pedidoId) {
  showSkeleton();

  // --- Datos del negocio (logo, nombre) ---
  try {
    const negocioRef = tiendaDoc(LOCALIDAD_FIJA, "tiendas", negocioId);
    unsubNegocio = onSnapshot(
      negocioRef,
      (snap) => {
        if (!snap.exists()) {
          console.warn("[pedidos] El documento del NEGOCIO no existe");
          return;
        }
        const data = snap.data();
        const nombre = data.nombre_tienda || data.nombre || "Negocio";
        const logoUrl = data.img_tienda?.logo_tienda || "";
        el("negocio-nombre").textContent = nombre;
        el("negocio-localidad").textContent = LOCALIDAD_FIJA;
        el("negocio-nombre").closest("header") &&
          (document.title = `Pedido · ${nombre}`);
        if (logoUrl) {
          el("logo-img").alt = nombre;
          el("logo-img").src = logoUrl;
          setFaviconCircular(logoUrl); // favicon del negocio, se actualiza en tiempo real si el logo cambia

          colorListo = new Promise((resolve) => {
            enIdle(() => extraerColorDominante(logoUrl).then(resolve));
            setTimeout(resolve, 2500);
          });
        }
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

  // --- Pedido en tiempo real ---
  const pedidoRef = tiendaSubDoc(
    LOCALIDAD_FIJA,
    "tiendas",
    negocioId,
    "pedidos",
    pedidoId,
  );
  pedidoRefGlobal = pedidoRef; // guardamos la referencia para el banner de pausa

  unsubPedido = onSnapshot(
    pedidoRef,
    { includeMetadataChanges: true },
    async (snap) => {
      if (!snap.exists()) {
        console.warn("[pedidos] El documento del PEDIDO no existe");
        showEmpty();
        return;
      }

      const data = snap.data();
      const nuevoEstado = normalizarEstado(data.estado);

      renderPedido(data);

      // Si el estado cambió respecto al anterior (y no es la primera carga),
      // dispara la notificación push del navegador.
      if (
        !primerRenderPedido &&
        estadoAnterior !== null &&
        nuevoEstado !== estadoAnterior
      ) {
        notificarCambioEstado(nuevoEstado, data);
      }
      estadoAnterior = nuevoEstado;
      primerRenderPedido = false;

      if (!primeraVezMostrado) {
        primeraVezMostrado = true;
        if (colorListo) await colorListo;
      }

      showContent();
      mostrarBannerConexion(snap.metadata.fromCache);
    },
    (error) => {
      console.error(
        "[pedidos] Error de Firestore leyendo PEDIDO:",
        error.code,
        error.message,
      );
      showEmpty();
    },
  );
}

function mostrarBannerConexion(sinConexion) {
  el("conn-banner").classList.toggle("hidden", !sinConexion);
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
    rechazado: "Tu pedido fue rechazado.",
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

/* ══════════════ Banner de pedido en pausa ══════════════
   Se muestra arriba de la tarjeta de estado. Si el negocio ya recibió la
   respuesta del cliente, solo se confirma lo elegido. Si no, se muestran
   botones para elegir un reemplazo (de los otros productos del mismo
   pedido) o continuar sin el producto agotado. */
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
  const otros = (data.productos || []).filter(
    (p) => !afectados.some((a) => a.id === p.id),
  );

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
      <p style="margin:0.6rem 0 0;font-size:0.9rem;">Ya enviaste tu respuesta: <strong>${
        respuesta.accion === "reemplazo"
          ? "Cambiar por " + esc(respuesta.producto_elegido?.nombre || "")
          : "Continuar sin ese producto"
      }</strong>. El negocio confirmará en breve.</p>`;
    return;
  }

  wrap.innerHTML = `
    <span class="eyebrow" style="color:#38bdf8;">⏸️ Pedido en pausa</span>
    <p style="margin:0.6rem 0 0;font-size:0.9rem;">${
      esc(pausa.motivo) || "Uno de los productos de tu pedido no está disponible."
    }</p>
    ${restanteTexto ? `<p style="margin:0.3rem 0 0;font-size:0.78rem;color:var(--text-muted);">${restanteTexto}</p>` : ""}
    <div id="pausa-opciones" style="margin-top:1rem;display:flex;flex-direction:column;gap:0.5rem;"></div>
    <button id="pausa-confirmar" style="margin-top:1rem;width:100%;padding:0.8rem;border-radius:0.8rem;border:none;background:#38bdf8;color:#04222f;font-weight:700;cursor:pointer;" disabled>Continuar con mi pedido</button>
  `;

  let seleccion = null;
  const opcionesWrap = wrap.querySelector("#pausa-opciones");
  const confirmarBtn = wrap.querySelector("#pausa-confirmar");
  const marcarActivo = (btn) => {
    opcionesWrap
      .querySelectorAll("button")
      .forEach((b) => (b.style.borderColor = "var(--card-border)"));
    btn.style.borderColor = "#38bdf8";
    confirmarBtn.disabled = false;
  };

  otros.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.style.cssText =
      "text-align:left;padding:0.7rem;border-radius:0.7rem;border:1px solid var(--card-border);background:var(--card);color:var(--text-primary);cursor:pointer;font-size:0.85rem;";
    b.textContent = `Cambiar por: ${p.nombre}`;
    b.onclick = () => {
      seleccion = {
        accion: "reemplazo",
        producto_elegido: { id: p.id, nombre: p.nombre },
      };
      marcarActivo(b);
    };
    opcionesWrap.appendChild(b);
  });

  const sinProductoBtn = document.createElement("button");
  sinProductoBtn.type = "button";
  sinProductoBtn.style.cssText =
    "text-align:left;padding:0.7rem;border-radius:0.7rem;border:1px solid var(--card-border);background:var(--card);color:var(--text-secondary);cursor:pointer;font-size:0.85rem;";
  sinProductoBtn.textContent = "Continuar sin este producto";
  sinProductoBtn.onclick = () => {
    seleccion = { accion: "sin_producto", producto_elegido: null };
    marcarActivo(sinProductoBtn);
  };
  opcionesWrap.appendChild(sinProductoBtn);

  confirmarBtn.onclick = async () => {
    if (!seleccion || !pedidoRef) return;
    confirmarBtn.disabled = true;
    confirmarBtn.textContent = "Enviando…";
    try {
      await updateDoc(pedidoRef, {
        respuesta_cliente: { ...seleccion, respondido_en: serverTimestamp() },
      });
    } catch (err) {
      console.error("[pedidos] No se pudo enviar la respuesta:", err);
      confirmarBtn.disabled = false;
      confirmarBtn.textContent = "Continuar con mi pedido";
    }
  };
}

function quitarPausaBanner() {
  el("pausa-wrap")?.remove();
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
  renderTimeline(estadoParaTimeline, esRechazado);

  if (enPausa) renderPausaBanner(data, pedidoRefGlobal);
  else quitarPausaBanner();

  el("status-label").textContent =
    ESTADOS_LABEL[estadoActual] || data.estado || "—";
  el("pedido-fecha-hora").textContent = [data.fecha, data.hora]
    .filter(Boolean)
    .join(" · ");

  const dot = el("status-dot");
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

  el("cliente-direccion-wrap").classList.toggle("hidden", !cliente.direccion);
  if (cliente.direccion)
    el("cliente-direccion").textContent = cliente.direccion;

  el("nota-wrap").classList.toggle("hidden", !data.nota);
  if (data.nota) el("nota-texto").textContent = data.nota;

  // Pago
  el("pago-metodo").textContent = data.pago?.metodo || "—";
  el("pedido-total").textContent = Number(data.total || 0).toFixed(2);

  // Puntos de fidelización
  renderPuntos(data, estadoActual, esRechazado);

  // Productos (se reconstruye con nodos DOM en vez de innerHTML con datos
  // dinámicos: evita problemas de escape/XSS si un nombre trae caracteres especiales)
  const cont = el("productos-list");
  cont.innerHTML = "";
  const frag = document.createDocumentFragment();
  (data.productos || []).forEach((p) => {
    const row = document.createElement("div");
    row.className = "producto";

    const img = document.createElement("img");
    img.src = p.imagen || "";
    img.alt = "";
    img.loading = "lazy";
    img.width = 48;
    img.height = 48;
    img.onerror = () => {
      img.style.visibility = "hidden";
    };

    const info = document.createElement("div");
    info.className = "info";
    const nombre = document.createElement("p");
    nombre.className = "nombre truncate";
    nombre.textContent = p.nombre || "";
    const detalle = document.createElement("p");
    detalle.className = "detalle";
    detalle.textContent = `${p.cantidad || 1} × S/ ${Number(p.precio_unitario || 0).toFixed(2)}`;
    info.append(nombre, detalle);

    // Muestra las opciones elegidas (ej. "Temperatura: Helado" · "Tamaño: Grande")
    if (p.opciones && Object.keys(p.opciones).length) {
      const opcionesTxt = Object.entries(p.opciones)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ");
      const opcionesEl = document.createElement("p");
      opcionesEl.className = "detalle";
      opcionesEl.style.color = "var(--accent)";
      opcionesEl.style.fontStyle = "italic";
      opcionesEl.textContent = opcionesTxt;
      info.append(opcionesEl);
    }

    const subtotal = document.createElement("span");
    subtotal.className = "subtotal font-mono";
    subtotal.textContent = `S/ ${Number(p.subtotal || 0).toFixed(2)}`;

    row.append(img, info, subtotal);
    frag.appendChild(row);
  });
  cont.appendChild(frag);
}

function renderTimeline(estadoActual, esRechazado) {
  const cont = el("timeline");
  cont.innerHTML = "";

  if (esRechazado) {
    const div = document.createElement("div");
    div.style.color = "#e5484d";
    div.style.fontWeight = "600";
    div.style.fontSize = "0.9rem";
    div.textContent = "Este pedido fue rechazado.";
    cont.appendChild(div);
    return;
  }

  const idxActual = ESTADOS.indexOf(estadoActual);
  const frag = document.createDocumentFragment();

  ESTADOS.forEach((estado, i) => {
    const activo = i <= idxActual;
    const isLast = i === ESTADOS.length - 1;

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
    text.textContent = ESTADOS_LABEL[estado];

    item.append(marker, text);
    frag.appendChild(item);
  });
  cont.appendChild(frag);
}

// ---- Color dominante del logo → variables CSS de acento ----
function extraerColorDominante(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 32;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        const buckets = {};
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha < 100) continue;
          const r = data[i],
            g = data[i + 1],
            b = data[i + 2];

          const max = Math.max(r, g, b),
            min = Math.min(r, g, b);
          const lightness = (max + min) / 2;
          const sat =
            max === min
              ? 0
              : (max - min) / (255 - Math.abs(2 * lightness - 255));

          if (lightness > 235 || lightness < 18 || sat < 0.15) continue;

          const key = `${Math.round(r / 24)}-${Math.round(g / 24)}-${Math.round(b / 24)}`;
          if (!buckets[key])
            buckets[key] = { r: 0, g: 0, b: 0, count: 0, sat: 0 };
          buckets[key].r += r;
          buckets[key].g += g;
          buckets[key].b += b;
          buckets[key].count += 1;
          buckets[key].sat += sat;
        }

        const bucketList = Object.values(buckets);
        let chosen = null;
        if (bucketList.length > 0) {
          chosen = bucketList
            .map((bk) => ({ ...bk, score: bk.count * (bk.sat / bk.count) }))
            .sort((a, b) => b.score - a.score)[0];
        }

        let r, g, b;
        if (chosen) {
          r = Math.round(chosen.r / chosen.count);
          g = Math.round(chosen.g / chosen.count);
          b = Math.round(chosen.b / chosen.count);
        } else {
          r = 194;
          g = 112;
          b = 61; // naranja tostado por defecto
        }

        // Piso de brillo: este mismo color se usa como TEXTO sobre fondo oscuro
        // (--bg / --card) en varios lugares (precios, subtotales, opciones, etc.),
        // así que si sale muy oscuro (logo negro/gris oscuro) hay que aclararlo
        // o el texto se vuelve invisible.
        const brightness = (r + g + b) / 3;
        const MIN_BRIGHTNESS = 110;
        if (brightness < MIN_BRIGHTNESS) {
          const boost = MIN_BRIGHTNESS / Math.max(brightness, 1);
          r = Math.min(255, Math.round(r * boost));
          g = Math.min(255, Math.round(g * boost));
          b = Math.min(255, Math.round(b * boost));
        }

        const toHex = (n) =>
          Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
        const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        const dark = `#${toHex(Math.round(r * 0.65))}${toHex(Math.round(g * 0.65))}${toHex(Math.round(b * 0.65))}`;
        const soft = `#${toHex(Math.round(r * 0.18))}${toHex(Math.round(g * 0.18))}${toHex(Math.round(b * 0.18))}`;

        document.documentElement.style.setProperty("--accent", hex);
        document.documentElement.style.setProperty("--accent-dark", dark);
        document.documentElement.style.setProperty("--accent-soft", soft);
      } catch (e) {
        console.warn(
          "[pedidos] No se pudo extraer color del logo (posible CORS):",
          e,
        );
      }
      resolve();
    };
    img.onerror = () => {
      console.warn("[pedidos] No se pudo cargar el logo para extraer color");
      resolve();
    };
    img.src = url;
  });
}