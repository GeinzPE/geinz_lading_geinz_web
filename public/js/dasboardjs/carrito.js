import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
  tiendaDoc,
  tiendaSubDoc,
  tiendaSubCol,
  data_user_logeado,
} from "../rutas/rutas.js";

import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* ══════════════ Config de enlaces ══════════════
       DASHBOARD_BASE_URL: a donde apunta el link que se manda por WhatsApp.
         Se arma como  {DASHBOARD_BASE_URL}/{idNegocio}/{idPedido}
       LANDING_BASE_URL: dominio de la landing normal del negocio (por alias).
         La ruta real es {LANDING_BASE_URL}/perfil/{alias_negocio}. */
const DASHBOARD_BASE_URL = "https://geinztech.com/pedidos";
const LANDING_BASE_URL = "https://geinztech.com";

const params = new URLSearchParams(window.location.search);
const localidad = (params.get("localidad") || "barranca").toLowerCase();
const tiendaId = params.get("id");
const mesaId = params.get("mesaId");
const mesaNombre = params.get("mesaNombre");
const mesaNumero = params.get("mesaNumero");
/* ══════════════ Estado (todo en memoria, sin re-fetch) ══════════════ */
let productosGlobal = []; // catálogo completo, se pide una sola vez
let productosPorId = new Map(); // acceso O(1) por id
let cardElements = new Map(); // productoId -> nodo <div> ya creado (se reutiliza siempre)
const carrito = new Map(); // productoId -> { ...producto, cantidad }
let filtroCategoria = "Todos";
let filtroTexto = "";
let searchDebounce;
let bizData = null;
let bizNombre = "Catálogo";
let _bizLogoUrl = null;
let pedidoActivoMesa = null;
let grupoActivo = null;
/* Estado del checkout */
let tipoEntrega = "Delivery";
let metodoPago = "Yape / Plin";

/* ══════════════ Usuario logeado ══════════════ */
/* ══════════════ Usuario logeado ══════════════ */
let usuarioLogeado = null;
let nombreUsuarioLogeado = "";

/* ══════════════ Ubicación GPS del cliente (opcional, para precisión del driver) ══════════════ */
let clienteLat = null;
let clienteLng = null;

import { setBusinessFaviconById } from "../favicon/favicon.js";

setBusinessFaviconById({ localidad: localidad, id: tiendaId });
/* ══════════════ Normalización de texto (búsqueda inteligente) ══════════════ */
function normalizeText(s) {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita tildes/diacríticos
    .toLowerCase()
    .trim();
}

/* ══════════════ Color dominante del logo ══════════════ */
function colorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash % 360);
  const s = 0.65,
    l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (hue < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (hue < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (hue < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (hue < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function relativeLuminance({ r, g, b }) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ensureLegible(color) {
  let { r, g, b } = color;
  const MIN_LUM = 0.26;
  let intentos = 0;
  while (relativeLuminance({ r, g, b }) < MIN_LUM && intentos < 10) {
    r = Math.min(255, r + 16);
    g = Math.min(255, g + 16);
    b = Math.min(255, b + 16);
    intentos++;
  }
  return { r, g, b };
}
function getDominantColor(imgEl) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const SIZE = 80;
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    const tryExtract = () => {
      try {
        ctx.drawImage(imgEl, 0, 0, SIZE, SIZE);
        const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
        const buckets = {};
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i],
            g = data[i + 1],
            b = data[i + 2],
            a = data[i + 3];
          if (a < 128) continue;
          const rn = r / 255,
            gn = g / 255,
            bn = b / 255;
          const max = Math.max(rn, gn, bn),
            min = Math.min(rn, gn, bn);
          const l = (max + min) / 2;
          const s =
            max === min
              ? 0
              : l > 0.5
                ? (max - min) / (2 - max - min)
                : (max - min) / (max + min);
          if (l > 0.72 || l < 0.1 || s < 0.28) continue;
          const key = `${r >> 4},${g >> 4},${b >> 4}`;
          if (!buckets[key]) buckets[key] = { count: 0, r: 0, g: 0, b: 0 };
          buckets[key].count++;
          buckets[key].r += r;
          buckets[key].g += g;
          buckets[key].b += b;
        }
        const sorted = Object.values(buckets).sort((a, b) => b.count - a.count);
        if (!sorted.length) return resolve(null);
        const top = sorted[0];
        resolve({
          r: Math.round(top.r / top.count),
          g: Math.round(top.g / top.count),
          b: Math.round(top.b / top.count),
        });
      } catch {
        resolve(null);
      }
    };
    if (imgEl.complete && imgEl.naturalWidth > 0) tryExtract();
    else {
      imgEl.onload = tryExtract;
      imgEl.onerror = () => resolve(null);
    }
  });
}

function applyColor({ r, g, b }) {
  const legible = ensureLegible({ r, g, b });
  document.documentElement.style.setProperty("--dr", legible.r);
  document.documentElement.style.setProperty("--dg", legible.g);
  document.documentElement.style.setProperty("--db", legible.b);
}

/* ══════════════ Pedido activo de mesa (presencial) ══════════════ */
async function loadPedidoMesa() {
  if (!mesaId) return null;
  try {
    grupoActivo = await resolveGrupoActivo();
    if (grupoActivo) {
      return grupoActivo.pedido
        ? { ...grupoActivo.pedido, estado: "ocupado" }
        : null;
    }

    const ref = tiendaSubDoc(localidad, "tiendas", tiendaId, "mesas", mesaId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data();
    if (data?.estado === "ocupado" && data?.pedido) {
      return { ...data.pedido, estado: data.estado };
    }
    return null;
  } catch (err) {
    console.error("Error cargando pedido de mesa:", err);
    return null;
  }
}

async function resolveGrupoActivo() {
  if (!mesaId) return null;
  try {
    const mesaRef = tiendaSubDoc(
      localidad,
      "tiendas",
      tiendaId,
      "mesas",
      mesaId,
    );
    const mesaSnap = await getDoc(mesaRef);
    if (!mesaSnap.exists()) return null;
    const grupoId = mesaSnap.data()?.grupoId;
    if (!grupoId) return null;

    const grupoRef = tiendaSubDoc(
      localidad,
      "tiendas",
      tiendaId,
      "grupos_mesas",
      grupoId,
    );
    const grupoSnap = await getDoc(grupoRef);
    if (!grupoSnap.exists() || grupoSnap.data()?.estado !== "activo")
      return null;

    return { id: grupoSnap.id, ref: grupoRef, ...grupoSnap.data() };
  } catch (err) {
    console.error("Error resolviendo grupo de mesas:", err);
    return null;
  }
}

async function llamarMozo({ nombre, nota, items, total }) {
  if (!grupoActivo) grupoActivo = await resolveGrupoActivo();
  const now = new Date();
  const horaActual = now.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Combina productos previos (del grupo o de la mesa sola) con los nuevos
  const productosPrevios = pedidoActivoMesa?.productos || [];
  const mapaProductos = new Map();
  productosPrevios.forEach((it) =>
    mapaProductos.set(it.cartKey || it.id, { ...it }),
  );
  items.forEach((it) => {
    const key = it.cartKey || it.id;
    const existente = mapaProductos.get(key);
    if (existente) {
      existente.cantidad += it.cantidad;
      existente.subtotal = +(
        existente.cantidad * existente.precio_unitario
      ).toFixed(2);
    } else {
      mapaProductos.set(key, {
        id: it.id,
        cartKey: key,
        nombre: it.nombre,
        categoria: it.categoria,
        precio_unitario: it.precio,
        cantidad: it.cantidad,
        subtotal: +(it.precio * it.cantidad).toFixed(2),
        imagen: it.imagen || "",
        opciones: it.seleccion || null,
      });
    }
  });
  const productosFinal = [...mapaProductos.values()];
  const totalFinal = productosFinal.reduce((s, i) => s + i.subtotal, 0);
  const notaFinal = [pedidoActivoMesa?.nota, nota].filter(Boolean).join(" · ");
  const nombreFinal = pedidoActivoMesa?.cliente?.nombre || nombre || "";

  const bloquesPrevios = pedidoActivoMesa?.bloques || [];
  const nuevoBloque = {
    hora: horaActual,
    nota: nota || "",
    mesaOrigenId: mesaId,
    mesaOrigenNombre: mesaNombre || `Mesa ${mesaNumero}`,
    items: items.map((it) => ({
      id: it.id,
      cartKey: it.cartKey || it.id,
      nombre: it.nombre,
      categoria: it.categoria,
      precio_unitario: it.precio,
      cantidad: it.cantidad,
      subtotal: +(it.precio * it.cantidad).toFixed(2),
      imagen: it.imagen || "",
      opciones: it.seleccion || null,
    })),
    total_bloque: +items
      .reduce((s, i) => s + i.cantidad * i.precio, 0)
      .toFixed(2),
  };
  const bloquesFinal = [...bloquesPrevios, nuevoBloque];

  const pedidosColRef = tiendaSubCol(localidad, "tiendas", tiendaId, "pedidos");

  /* ═══ CASO 1: mesa dentro de un grupo activo ═══ */
  if (grupoActivo) {
    const pedido = {
      cliente: {
        id_cliente: usuarioLogeado?.id || null,
        nombre: nombreFinal,
        tipo_entrega: "Mesa",
        direccion: "",
      },
      estado: "pendiente",
      pago: { metodo: "En mesa", vuelto: "" },
      mesas: grupoActivo.mesas || [],
      negocio: { id: tiendaId, nombre: bizNombre, localidad },
      nota: notaFinal,
      productos: productosFinal,
      bloques: bloquesFinal,
      total_items: productosFinal.reduce((s, i) => s + i.cantidad, 0),
      total: +totalFinal.toFixed(2),
      fecha: pedidoActivoMesa?.fecha || now.toLocaleDateString("es-PE"),
      hora: horaActual,
      timestamp: serverTimestamp(),
    };

    const pedidoDocId = grupoActivo.pedidoGrupoDocId || doc(pedidosColRef).id;
    const batch = writeBatch(db);

    batch.set(
      grupoActivo.ref,
      { estado: "activo", pedido, pedidoGrupoDocId: pedidoDocId },
      { merge: true },
    );
    batch.set(
      doc(pedidosColRef, pedidoDocId),
      { ...pedido, grupoId: grupoActivo.id },
      { merge: true },
    );

    (grupoActivo.mesas || []).forEach((m) => {
      const mRef = tiendaSubDoc(localidad, "tiendas", tiendaId, "mesas", m.id);
      batch.set(
        mRef,
        { estado: "ocupado", pago: "pendiente", pedidoMesaDocId: pedidoDocId },
        { merge: true },
      );
    });

    await batch.commit();
    grupoActivo.pedidoGrupoDocId = pedidoDocId;
    return pedido;
  }

  /* ═══ CASO 2: mesa individual (comportamiento original) ═══ */
  const ref = tiendaSubDoc(localidad, "tiendas", tiendaId, "mesas", mesaId);
  const mesaSnapActual = await getDoc(ref);
  const mesaDataActual = mesaSnapActual.exists() ? mesaSnapActual.data() : {};

  const pedido = {
    cliente: {
      id_cliente: usuarioLogeado?.id || null,
      nombre: nombreFinal,
      tipo_entrega: "Mesa",
      direccion: "",
    },
    estado: "pendiente",
    pago: { metodo: "En mesa", vuelto: "" },
    mesa: {
      id: mesaId,
      nombre: mesaNombre || null,
      numero: mesaNumero ? Number(mesaNumero) : null,
    },
    negocio: { id: tiendaId, nombre: bizNombre, localidad },
    nota: notaFinal,
    productos: productosFinal,
    bloques: bloquesFinal,
    total_items: productosFinal.reduce((s, i) => s + i.cantidad, 0),
    total: +totalFinal.toFixed(2),
    fecha: pedidoActivoMesa?.fecha || now.toLocaleDateString("es-PE"),
    hora: horaActual,
    timestamp: serverTimestamp(),
  };

  const yaHabiaSesionActiva =
    mesaDataActual?.estado === "ocupado" && !!mesaDataActual?.pedidoMesaDocId;
  const pedidoDocId = yaHabiaSesionActiva
    ? mesaDataActual.pedidoMesaDocId
    : doc(pedidosColRef).id;

  const dataToSave = {
    ...mesaDataActual,
    estado: "ocupado",
    pago: "pendiente",
    mesaNombre: mesaNombre || mesaDataActual.mesaNombre || null,
    mesaNumero: mesaNumero
      ? Number(mesaNumero)
      : mesaDataActual.mesaNumero || null,
    pedido,
    pedidoMesaDocId: pedidoDocId,
  };

  await setDoc(ref, dataToSave, { merge: true });
  await setDoc(
    doc(pedidosColRef, pedidoDocId),
    { ...pedido, mesaId },
    { merge: true },
  );

  return pedido;
}

async function cancelarPedidoMesa() {
  if (!grupoActivo) grupoActivo = await resolveGrupoActivo();

  if (grupoActivo) {
    const batch = writeBatch(db);
    batch.set(grupoActivo.ref, { estado: "cerrado" }, { merge: true });
    (grupoActivo.mesas || []).forEach((m) => {
      const mRef = tiendaSubDoc(localidad, "tiendas", tiendaId, "mesas", m.id);
      batch.set(
        mRef,
        { estado: "cancelado", pago: "pendiente", grupoId: null },
        { merge: true },
      );
    });
    if (grupoActivo.pedidoGrupoDocId) {
      batch.set(
        tiendaSubDoc(
          localidad,
          "tiendas",
          tiendaId,
          "pedidos",
          grupoActivo.pedidoGrupoDocId,
        ),
        {
          estado: "cancelado",
          pago: "pendiente",
        },
        { merge: true },
      );
    }
    await batch.commit();
    grupoActivo = null;
    return;
  }

  const ref = tiendaSubDoc(localidad, "tiendas", tiendaId, "mesas", mesaId);
  await updateDoc(ref, {
    estado: "cancelado",
    pago: "pendiente",
    pedido: null,
  });

  const pedidoMesaRef = tiendaSubDoc(
    localidad,
    "tiendas",
    tiendaId,
    "pedidos",
    `${mesaId}-mesa`,
  );
  await updateDoc(pedidoMesaRef, {
    estado: "cancelado",
    pago: "pendiente",
  }).catch(() => {});
}

function renderPedidoActivoMesa(pedido) {
  const main = document.querySelector("main .min-w-0");
  if (!main) return;

  // Si ya existe un banner de pedido activo, lo quitamos antes de crear el nuevo
  const anterior = document.getElementById("pedidoActivoWrap");
  if (anterior) anterior.remove();

  const wrap = document.createElement("div");
  wrap.id = "pedidoActivoWrap";
  wrap.className = "glass rounded-[26px] p-5 flex flex-col gap-4 mb-6";
  wrap.innerHTML = `
    <div class="flex items-center justify-between">
      <h2 class="display font-extrabold text-lg">🍽️ Pedido en curso</h2>
      <span class="text-[11px] font-bold px-2.5 py-1 rounded-full" style="background: rgba(var(--dr),var(--dg),var(--db),.15); color: rgb(var(--dr),var(--dg),var(--db));">
        ${pedido.estado === "ocupado" ? "Ocupado" : pedido.estado}
      </span>
    </div>
  <p class="text-[12px] text-gray-500 -mt-2">Pedido a las ${pedido.hora} · Pago: ${pedido.pago.metodo}</p>
    <div id="pedidoActivoItems" class="flex flex-col gap-2"></div>
    <div class="flex items-center justify-between pt-3 border-t border-white/[.07]">
      <span class="text-gray-400 font-semibold text-sm">Total</span>
      <span class="display font-extrabold text-xl">S/ ${pedido.total.toFixed(2)}</span>
    </div>
    <p class="text-[12px] text-gray-500 text-center">Si necesitas cambiar algo, avísale directamente al mozo.</p>
  `;

  const itemsWrap = wrap.querySelector("#pedidoActivoItems");
  const bloques =
    pedido.bloques && pedido.bloques.length ? pedido.bloques : null;

  if (bloques) {
    bloques.forEach((bloque, idx) => {
      const bloqueWrap = document.createElement("div");
      bloqueWrap.className = "flex flex-col gap-1.5";
      bloqueWrap.innerHTML = `<p class="text-[11px] font-bold text-gray-500 uppercase tracking-wide mt-1">
            ${idx === 0 ? "Pedido inicial" : "Agregado"} · ${bloque.hora}
          </p>`;
      bloque.items.forEach((it) => {
        const row = document.createElement("div");
        row.className =
          "item-row flex items-center gap-3 glass rounded-2xl p-3";
        row.innerHTML = `
          ${imgOrLogoHTML(it.imagen, it.nombre, "w-14 h-14 rounded-xl bg-white/5 flex-shrink-0")}
          <div class="flex-1 min-w-0">
            <p class="font-bold text-[14px] truncate">${it.nombre}</p>
            <p class="text-[12.5px] text-gray-500">${it.cantidad} × S/ ${it.precio_unitario.toFixed(2)}</p>
          </div>
          <span class="font-bold text-[14px]">S/ ${it.subtotal.toFixed(2)}</span>
        `;
        bloqueWrap.appendChild(row);
      });
      itemsWrap.appendChild(bloqueWrap);
    });
  } else {
    // Compatibilidad con pedidos viejos sin "bloques" (creados antes de este cambio)
    pedido.productos.forEach((it) => {
      const row = document.createElement("div");
      row.className = "item-row flex items-center gap-3 glass rounded-2xl p-3";
      row.innerHTML = `
      ${imgOrLogoHTML(it.imagen, it.nombre, "w-14 h-14 rounded-xl bg-white/5 flex-shrink-0")}
      <div class="flex-1 min-w-0">
        <p class="font-bold text-[14px] truncate">${it.nombre}</p>
        <p class="text-[12.5px] text-gray-500">${it.cantidad} × S/ ${it.precio_unitario.toFixed(2)}</p>
      </div>
      <span class="font-bold text-[14px]">S/ ${it.subtotal.toFixed(2)}</span>
    `;
      itemsWrap.appendChild(row);
    });
  }

  main.prepend(wrap);
}

async function confirmarPedidoMesaDirecto() {
  if (!carrito.size) return;

  const items = [...carrito.values()];
  const total = items.reduce((s, i) => s + i.cantidad * i.precio, 0);

  const btnMobile = document.getElementById("checkoutBtnMobile");
  const btnDesktop = document.getElementById("checkoutBtnDesktop");
  [btnMobile, btnDesktop].forEach((b) => {
    if (b) {
      b.disabled = true;
      b.dataset.original = b.innerHTML;
      b.innerHTML = "Enviando…";
    }
  });

  try {
    const pedido = await llamarMozo({
      nombre: nombreUsuarioLogeado || "",
      nota: "",
      items,
      total,
    });
    pedidoActivoMesa = pedido;
    carrito.clear();
    updateCartUI();
    closeDrawer();
    renderPedidoActivoMesa(pedido);
    showToast("Pedido enviado al mozo 🔔");
  } catch (err) {
    console.error("Error llamando al mozo:", err);
    showToast("⚠️ No se pudo enviar el pedido, intenta de nuevo");
  } finally {
    [btnMobile, btnDesktop].forEach((b) => {
      if (b) {
        b.disabled = false;
        b.innerHTML = b.dataset.original || "Llamar al mozo";
      }
    });
  }
}

function ajustarTextosMesa() {
  if (!mesaId) return;
  const iconoCampana = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2m6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2Z"/></svg>`;

  ["checkoutBtnMobile", "checkoutBtnDesktop", "sendWhatsappBtn"].forEach(
    (id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.innerHTML = `${iconoCampana} Llamar al mozo`;
    },
  );
}

function cargarUsuarioLogeado() {
  return new Promise((resolve) => {
    const auth = getAuth();
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        usuarioLogeado = null;
        nombreUsuarioLogeado = "";
        resolve(null);
        return;
      }
      try {
        const ref = data_user_logeado(user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const d = snap.data();
          usuarioLogeado = { id: user.uid, ...d };
          const nombre = (d.nombre || "").trim();
          const apellido = (d.apellido || "").trim();
          nombreUsuarioLogeado = `${nombre} ${apellido}`.trim();
        }
      } catch (err) {
        console.error("Error cargando usuario logeado:", err);
      }
      resolve(usuarioLogeado);
    });
  });
}
/* ══════════════ Datos (una sola carga) ══════════════ */
async function loadTienda() {
  try {
    const ref = tiendaDoc(localidad, "tiendas", tiendaId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch {
    return null;
  }
}

async function loadProductosCatalogo() {
  const catRef = tiendaSubCol(localidad, "tiendas", tiendaId, "productos");
  const catSnap = await getDocs(catRef);

  // Trae todas las categorías en paralelo (mucho más rápido con catálogos grandes)
  const porCategoria = await Promise.all(
    catSnap.docs.map(async (catDoc) => {
      const categoria = catDoc.id;
      const subRef = tiendaSubCol(
        localidad,
        "tiendas",
        tiendaId,
        "productos",
        categoria,
        categoria,
      );
      const subSnap = await getDocs(subRef);
      const arr = [];
      subSnap.forEach((pDoc) => {
        const d = pDoc.data();
        if (d.disponible === false) return;
        const nombre = d.nombre || "Producto";

        // Solo se traen las condiciones/opciones marcadas como activas (true)
        const condiciones = (d.condiciones || [])
          .map((c) => ({
            nombre: c.nombre,
            opciones: (c.opciones || [])
              .filter(
                (o) => o.activo && (typeof o.stock !== "number" || o.stock > 0),
              )
              .map((o) => ({
                nombre: o.nombre,
                costoAdicional: Number(o.costoAdicional) || 0,
              })),
          }))
          .filter((c) => c.nombre && c.opciones.length > 0);

        arr.push({
          id: pDoc.id,
          categoria,
          categoriaNorm: normalizeText(categoria),
          nombre,
          nombreNorm: normalizeText(nombre),
          precio: Number(d.precio) || 0,
          imagenes: (d.imagenes || []).map((im) => im?.url).filter(Boolean),
          imagen: d.imagenes?.[0]?.url || "",
          condiciones,
        });
      });
      return arr;
    }),
  );

  return porCategoria.flat();
}

/* ══════════════ Render tienda (logo + color) ══════════════ */

function pintarMesaBadge() {
  if (!mesaId) return;
  const badge = document.getElementById("mesaBadge");
  const text = document.getElementById("mesaBadgeText");
  if (!badge || !text) return;
  text.textContent =
    mesaNombre || (mesaNumero ? `Mesa ${mesaNumero}` : "Mesa asignada");
  badge.classList.remove("hidden");
  badge.classList.add("flex");
}

function aplicarModeloNegocio(biz) {
  console.log(
    "[DEBUG modelo_negocio] valor:",
    biz?.modelo_negocio,
    "| mesaId:",
    mesaId,
  );

  // En modo mesa (QR / dine-in) no aplica: ahí no se usa dirección ni este toggle.
  if (mesaId) return;

  const esSoloDelivery = biz?.modelo_negocio === false;
  const pickupBtn = document.querySelector(
    '#entregaToggle .toggle-opt[data-val="Recojo en local"]',
  );
  const bannerEl = document.getElementById("soloDeliveryBanner");
  const direccionEl = document.getElementById("direccionCollapse");

  console.log(
    "[DEBUG modelo_negocio] esSoloDelivery:",
    esSoloDelivery,
    "| direccionEl:",
    direccionEl,
  );

  if (esSoloDelivery) {
    if (pickupBtn) pickupBtn.classList.add("hidden");
    tipoEntrega = "Delivery";
    document.querySelectorAll("#entregaToggle .toggle-opt").forEach((o) => {
      const active = o.dataset.val === "Delivery";
      o.classList.toggle("active", active);
      o.style.background = active ? "rgb(var(--dr),var(--dg),var(--db))" : "";
    });
     if (direccionEl) {
      // Se saca del sistema "collapse" por completo, así no depende de
      // ninguna clase/transición CSS que pueda estar fallando.
      direccionEl.classList.remove("hidden", "collapse", "open");
      direccionEl.style.setProperty("display", "block", "important");
      direccionEl.style.setProperty("max-height", "none", "important");
      direccionEl.style.setProperty("opacity", "1", "important");
      direccionEl.style.setProperty("overflow", "visible", "important");
      direccionEl.style.setProperty("margin-top", "4px", "important");

      const inner = direccionEl.querySelector(".collapse-inner");
      if (inner) {
        inner.style.setProperty("display", "block", "important");
        inner.style.setProperty("overflow", "visible", "important");
      }
    }
    if (bannerEl) bannerEl.classList.remove("hidden");
  } else {
    if (pickupBtn) pickupBtn.classList.remove("hidden");
    if (bannerEl) bannerEl.classList.add("hidden");
  }
}
async function renderTienda(biz) {
  bizData = biz;
  bizNombre = biz?.nombre_tienda || biz?.nombre || "Catálogo";
  document.getElementById("tiendaNombre").textContent = bizNombre;
  document.title = `Carrito · ${bizNombre}`;

  const logoUrl = biz?.img_tienda?.logo_tienda || null;
  _bizLogoUrl = logoUrl; // se usa la URL directa; el navegador ya la cachea, no hace falta canvas
  const logoImg = document.getElementById("bizLogo");
  const logoPh = document.getElementById("bizLogoPh");

  if (logoUrl) {
    logoImg.src = logoUrl;
    logoImg.style.display = "block";
    logoPh.classList.add("hidden");

    await new Promise((resolve) => {
      let resuelto = false;
      const finalizar = () => {
        if (!resuelto) {
          resuelto = true;
          resolve();
        }
      };

      const temp = new Image();
      temp.crossOrigin = "anonymous";
      temp.onload = async () => {
        const color = await getDominantColor(temp);
        applyColor(color || colorFromName(bizNombre));
        finalizar();
      };
      temp.onerror = () => {
        applyColor(colorFromName(bizNombre));
        finalizar();
      };
      temp.src =
        logoUrl + (logoUrl.includes("?") ? "&" : "?") + "cb=" + Date.now();

      setTimeout(() => {
        if (!resuelto) applyColor(colorFromName(bizNombre));
        finalizar();
      }, 4000);
    });
  } else {
    _bizLogoUrl = null;
    logoPh.classList.remove("hidden");
    logoPh.classList.add("flex");
    applyColor(colorFromName(bizNombre));
  }
}
/* Cuando el carrito viene de una mesa (QR), el botón "atrás" ya no debe
       hacer history.back() (puede llevar a un sitio raro o no ir a ningún lado
       si la mesa fue la primera pantalla abierta). En su lugar, manda a la
       landing normal del negocio usando su alias. Ajusta el patrón de la URL
       o el nombre del campo si en tu Firestore el alias se llama distinto. */
function aplicarComportamientoBotonAtras() {
  const backBtn = document.getElementById("backBtn");
  if (!backBtn || !mesaId) return; // fuera de mesa, se queda con history.back()
  const alias = bizData?.alias_negocio || tiendaId;
  backBtn.href = `${LANDING_BASE_URL}/perfil/${alias}`;
  backBtn.removeAttribute("target");
}

/* Busca el número de WhatsApp del negocio probando los campos más comunes */
function getBizWhatsapp() {
  if (!bizData) return null;
  const candidatos = [
    bizData.whatsapp,
    bizData.whatsApp,
    bizData.numero_whatsapp,
    bizData.telefono,
    bizData.celular,
    bizData.numero,
    bizData.phone,
    bizData.contacto?.whatsapp,
    bizData.contacto?.telefono,
    bizData.contacto?.numero,
  ];
  const raw = candidatos.find((v) => v && String(v).trim().length > 0);
  if (!raw) return null;
  let digits = String(raw).replace(/[^\d]/g, "");
  if (digits.length === 9) digits = "51" + digits; // celular peruano sin código de país
  return digits;
}

/* ══════════════ Filtros (categoría) ══════════════ */
function renderFiltros(productos) {
  const categorias = [...new Set(productos.map((p) => p.categoria))];
  const wrap = document.getElementById("filtros");
  wrap.innerHTML = "";

  const makeChip = (label) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.className = "chip";
    b.dataset.cat = label;
    b.onclick = () => setActiveCategoria(label);
    wrap.appendChild(b);
    return b;
  };

  makeChip("Todos");
  categorias.forEach((c) => makeChip(c));
  paintActiveChip();
}

function paintActiveChip() {
  document.querySelectorAll("#filtros .chip").forEach((b) => {
    const isActive = b.dataset.cat === filtroCategoria;
    b.classList.toggle("active", isActive);
    b.style.background = isActive ? "rgb(var(--dr),var(--dg),var(--db))" : "";
  });
}

function setActiveCategoria(cat) {
  filtroCategoria = cat;
  paintActiveChip();
  applyFilters();
}

/* ══════════════ Búsqueda inteligente (debounced, sin tildes, por palabras) ══════════════ */
const searchInput = document.getElementById("searchInput");
const searchClear = document.getElementById("searchClear");

searchInput.addEventListener("input", () => {
  searchClear.classList.toggle("show", searchInput.value.length > 0);
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    filtroTexto = normalizeText(searchInput.value);
    applyFilters();
  }, 120);
});
searchClear.addEventListener("click", () => {
  searchInput.value = "";
  searchClear.classList.remove("show");
  filtroTexto = "";
  applyFilters();
  searchInput.focus();
});

/* ══════════════ Aplicar filtros combinados (categoría + texto) ══════════════ */
function applyFilters() {
  let resultado = productosGlobal;

  if (filtroCategoria !== "Todos") {
    resultado = resultado.filter((p) => p.categoria === filtroCategoria);
  }
  if (filtroTexto) {
    const palabras = filtroTexto.split(/\s+/).filter(Boolean);
    resultado = resultado.filter((p) =>
      palabras.every(
        (w) => p.nombreNorm.includes(w) || p.categoriaNorm.includes(w),
      ),
    );
  }

  const resultCountEl = document.getElementById("resultCount");
  if (filtroTexto || filtroCategoria !== "Todos") {
    resultCountEl.textContent = `${resultado.length} resultado(s)`;
    resultCountEl.classList.remove("hidden");
  } else {
    resultCountEl.classList.add("hidden");
  }

  renderLista(resultado);
}

/* ══════════════ Construcción de tarjetas (UNA sola vez, se reutilizan siempre) ══════════════ */
function buildAllCards(productos) {
  const lista = document.getElementById("lista");
  lista.innerHTML = "";
  cardElements.clear();
  const frag = document.createDocumentFragment();
  productos.forEach((p, i) => {
    const card = productoCard(p, i);
    cardElements.set(p.id, card);
    frag.appendChild(card);
  });
  lista.appendChild(frag);
}

function renderLista(productosFiltrados) {
  const lista = document.getElementById("lista");
  const noResults = document.getElementById("noResultsMsg");
  const matchedIds = new Set(productosFiltrados.map((p) => p.id));

  cardElements.forEach((card, id) => {
    card.style.display = matchedIds.has(id) ? "" : "none";
  });

  const sinResultados =
    !productosFiltrados.length && productosGlobal.length > 0;
  noResults.classList.toggle("hidden", !sinResultados);
  noResults.classList.toggle("flex", sinResultados);
  lista.classList.toggle("hidden", sinResultados);
}

/* ══════════════ Placeholder de logo (sin foto / foto rota) ══════════════ */
/* ══════════════ Placeholder de logo (sin foto / foto rota) ══════════════ */
function letraNegocio() {
  return (bizNombre || "?").trim().charAt(0).toUpperCase();
}

function createLogoPlaceholderEl() {
  const div = document.createElement("div");
  div.className = "logo-ph-wrap";
  const badge = document.createElement("div");
  badge.className = "logo-ph-badge";

  if (_bizLogoUrl) {
    const img = document.createElement("img");
    img.src = _bizLogoUrl;
    img.alt = bizNombre;
    img.loading = "lazy";
    img.onerror = () => {
      badge.innerHTML = `<span class="ph-letter">${letraNegocio()}</span>`;
    };
    badge.appendChild(img);
  } else {
    badge.innerHTML = `<span class="ph-letter">${letraNegocio()}</span>`;
  }
  div.appendChild(badge);
  return div;
}

// Versión en string (para templates de innerHTML del carrito / pedido activo)
function logoPlaceholderHTML(imgClass) {
  const badgeInner = _bizLogoUrl
    ? `<img src="${_bizLogoUrl}" alt="${(bizNombre || "").replace(/"/g, "&quot;")}" loading="lazy" onerror="this.outerHTML='<span class=&quot;ph-letter&quot;>${letraNegocio()}</span>'">`
    : `<span class="ph-letter">${letraNegocio()}</span>`;
  return `<div class="${imgClass} logo-ph-wrap"><div class="logo-ph-badge">${badgeInner}</div></div>`;
}

// <img> normal con fallback automático al logo si falla la carga
function imgOrLogoHTML(src, alt, imgClass) {
  const altSafe = (alt || "").replace(/"/g, "&quot;");
  if (src) {
    return `<img src="${src}" alt="${altSafe}" class="${imgClass}" loading="lazy" decoding="async" onerror="window.__geinzImgFallback(this)">`;
  }
  return logoPlaceholderHTML(imgClass);
}

window.__geinzImgFallback = function (imgEl) {
  const cls = imgEl.className;
  const wrap = document.createElement("div");
  wrap.className = cls + " logo-ph-wrap";
  wrap.innerHTML = `<div class="logo-ph-badge">${
    _bizLogoUrl
      ? `<img src="${_bizLogoUrl}" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;ph-letter&quot;>${letraNegocio()}</span>'">`
      : `<span class="ph-letter">${letraNegocio()}</span>`
  }</div>`;
  imgEl.replaceWith(wrap);
};

/* ══════════════ Lightbox de imágenes del producto ══════════════ */
let _lightboxImages = [];
let _lightboxIdx = 0;

function openProductLightbox(images, idx = 0) {
  _lightboxImages = images;
  _lightboxIdx = idx;
  let modal = document.getElementById("prodLightboxModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "prodLightboxModal";
    modal.className = "prod-lightbox";
    modal.innerHTML = `
      <button class="prod-lightbox-close" id="prodLightboxClose">✕</button>
      <button class="prod-lightbox-nav prod-lightbox-prev" id="prodLightboxPrev">‹</button>
      <img id="prodLightboxImg" alt="">
      <button class="prod-lightbox-nav prod-lightbox-next" id="prodLightboxNext">›</button>
      <span class="prod-lightbox-counter" id="prodLightboxCounter"></span>
    `;
    document.body.appendChild(modal);
    document.getElementById("prodLightboxClose").onclick = closeProductLightbox;
    document.getElementById("prodLightboxPrev").onclick = () =>
      moveLightbox(-1);
    document.getElementById("prodLightboxNext").onclick = () => moveLightbox(1);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeProductLightbox();
    });
  }
  paintLightbox();
  modal.classList.add("show");
  document.body.style.overflow = "hidden";
}

function moveLightbox(dir) {
  _lightboxIdx =
    (_lightboxIdx + dir + _lightboxImages.length) % _lightboxImages.length;
  paintLightbox();
}

function paintLightbox() {
  document.getElementById("prodLightboxImg").src =
    _lightboxImages[_lightboxIdx];
  document.getElementById("prodLightboxCounter").textContent =
    `${_lightboxIdx + 1} / ${_lightboxImages.length}`;
  document.querySelectorAll(".prod-lightbox-nav").forEach((b) => {
    b.style.display = _lightboxImages.length > 1 ? "flex" : "none";
  });
}

function closeProductLightbox() {
  document.getElementById("prodLightboxModal")?.classList.remove("show");
  document.body.style.overflow = "";
}
function productoCard(p, index = 0) {
  const card = document.createElement("div");
  card.id = `card-${p.id}`;
  card.className =
    "prod-card glass rise accent-border-hover" +
    (productoEnCarrito(p.id) ? " in-cart" : "");
  card.style.animationDelay = `${Math.min(index, 12) * 30}ms`;

  const imgWrap = document.createElement("div");
  imgWrap.className = "prod-img-wrap";
  if (p.imagen) {
    const img = document.createElement("img");
    img.alt = p.nombre;
    img.loading = "lazy";
    img.decoding = "async";
    img.onload = () => img.classList.add("loaded");
    img.onerror = () => {
      imgWrap.innerHTML = "";
      imgWrap.classList.add("no-img");
      imgWrap.appendChild(createLogoPlaceholderEl());
    };
    img.src = p.imagen;
    imgWrap.appendChild(img);
  } else {
    imgWrap.classList.add("no-img");
    imgWrap.appendChild(createLogoPlaceholderEl());
  }
  const galeria =
    p.imagenes && p.imagenes.length ? p.imagenes : p.imagen ? [p.imagen] : [];
  if (galeria.length) {
    imgWrap.style.cursor = "zoom-in";
    imgWrap.addEventListener("click", () => openProductLightbox(galeria, 0));
    if (galeria.length > 1) {
      const badge = document.createElement("span");
      badge.className = "prod-img-count";
      badge.textContent = `📷 ${galeria.length}`;
      imgWrap.appendChild(badge);
    }
  }

  const info = document.createElement("div");
  info.className = "flex-1 min-w-0 prod-info";
  const condLine = (p.condiciones || [])
    .map((c) => `${c.nombre}: ${c.opciones.map((o) => o.nombre).join(", ")}`)
    .join(" · ");

  info.innerHTML = `
    <p class="font-bold text-[13px] sm:text-[15px] leading-snug line-clamp-2">${p.nombre}</p>
    <p class="text-[10.5px] sm:text-[11.5px] text-gray-500 mb-1 sm:mb-1.5 uppercase tracking-wide font-semibold truncate">${p.categoria}</p>
    <p class="display font-extrabold text-[14px] sm:text-[15px] accent">S/ ${p.precio.toFixed(2)}</p>
    ${condLine ? `<p class="text-[10px] text-gray-500 mt-1 line-clamp-1">${condLine}</p>` : ""}
  `;

  const qtyWrap = document.createElement("div");
  qtyWrap.className = "flex-shrink-0 prod-qty-row";
  qtyWrap.id = `qty-${p.id}`;

  card.append(imgWrap, info, qtyWrap);
  renderQtyControls(qtyWrap, p);
  return card;
}

function renderQtyControls(container, p, cartKey = null) {
  container.innerHTML = "";

  // Caso 1: es una línea específica del carrito (puede tener una variante ya elegida)
  if (cartKey) {
    const cantidad = carrito.get(cartKey)?.cantidad || 0;
    const stepper = document.createElement("div");
    stepper.className = "qty-stepper pop";

    const minus = document.createElement("button");
    minus.className = "qty-btn";
    minus.textContent = "−";
    minus.onclick = () => removeFromCart(cartKey, p.id);

    const count = document.createElement("span");
    count.className = "w-6 text-center font-black text-[15px] bump";
    count.textContent = cantidad;

    const plus = document.createElement("button");
    plus.className = "qty-btn";
    plus.textContent = "+";
    plus.onclick = () => addToCart(p, carrito.get(cartKey)?.seleccion || null);

    stepper.append(minus, count, plus);
    container.appendChild(stepper);
    return;
  }

  // Caso 2: tarjeta principal de un producto CON condiciones -> siempre abre el popup
  // Caso 2: tarjeta principal de un producto CON condiciones
  if (p.condiciones && p.condiciones.length) {
    const variantes = [...carrito.values()].filter((it) => it.id === p.id);
    const totalCantidad = variantes.reduce((s, it) => s + it.cantidad, 0);

    if (variantes.length === 0) {
      // Nada en el carrito todavía -> abre el popup a elegir
      const btn = document.createElement("button");
      btn.className = "btn-add accent-grad pop";
      btn.textContent = "Agregar";
      btn.onclick = () => addToCart(p);
      container.appendChild(btn);
    } else {
      // Más de una variante (ej. "Pecho" y "Pierna" del mismo producto) -> se manejan desde el carrito
      const btn = document.createElement("button");
      btn.className = "btn-add accent-grad pop";
      btn.textContent = `${totalCantidad} en carrito · Agregar otra`;
      btn.onclick = () => addToCart(p);
      container.appendChild(btn);
    }
    return;
  }
  // Caso 3: tarjeta principal de un producto SIN condiciones (comportamiento original)
  const cantidad = carrito.get(p.id)?.cantidad || 0;
  if (cantidad === 0) {
    const btn = document.createElement("button");
    btn.className = "btn-add accent-grad pop";
    btn.textContent = "Agregar";
    btn.onclick = () => addToCart(p);
    container.appendChild(btn);
  } else {
    const stepper = document.createElement("div");
    stepper.className = "qty-stepper pop";

    const minus = document.createElement("button");
    minus.className = "qty-btn";
    minus.textContent = "−";
    minus.onclick = () => removeFromCart(p.id, p.id);

    const count = document.createElement("span");
    count.className = "w-6 text-center font-black text-[15px] bump";
    count.textContent = cantidad;

    const plus = document.createElement("button");
    plus.className = "qty-btn";
    plus.textContent = "+";
    plus.onclick = () => addToCart(p);

    stepper.append(minus, count, plus);
    container.appendChild(stepper);
  }
}

/* ══════════════ Lógica del carrito (Map = O(1)) ══════════════ */
/* ══════════════ Lógica del carrito (Map = O(1)) ══════════════ */
function cartKeyFor(id, seleccion) {
  if (!seleccion || !Object.keys(seleccion).length) return id;
  const orden = Object.keys(seleccion)
    .sort()
    .map((k) => `${k}:${seleccion[k]}`)
    .join("|");
  return `${id}__${orden}`;
}

function productoEnCarrito(id) {
  for (const it of carrito.values()) if (it.id === id) return true;
  return false;
}

// Precio base + suma de costos adicionales de las opciones elegidas
function calcPrecioFinal(p, seleccion) {
  let precio = Number(p.precio) || 0;
  if (!seleccion) return precio;
  (p.condiciones || []).forEach((cond) => {
    const elegido = seleccion[cond.nombre];
    if (!elegido) return;
    const op = cond.opciones.find((o) => o.nombre === elegido);
    if (op && op.costoAdicional) precio += Number(op.costoAdicional) || 0;
  });
  return +precio.toFixed(2);
}

function addToCart(p, seleccion = null) {
  // Si el producto tiene condiciones y todavía no eligió nada, abrir el popup primero
  if (!seleccion && p.condiciones && p.condiciones.length) {
    abrirOptionsModal(p);
    return;
  }
  const key = cartKeyFor(p.id, seleccion);
  const existente = carrito.get(key);
  if (existente) {
    existente.cantidad += 1;
  } else {
    const precioFinal = calcPrecioFinal(p, seleccion);
    carrito.set(key, {
      ...p,
      precio: precioFinal,
      cantidad: 1,
      cartKey: key,
      seleccion: seleccion || null,
    });
  }
  syncCartChange(p.id);
  pulseCard(p.id);
  showToast(`${p.nombre} agregado`);
}

// Cambia la selección (ej. "helada" -> "sin helar") de una línea que ya está en el carrito
function editCartSelection(oldKey, p, nuevaSeleccion) {
  const entry = carrito.get(oldKey);
  if (!entry) return;
  const newKey = cartKeyFor(p.id, nuevaSeleccion);

  if (newKey === oldKey) {
    syncCartChange(p.id);
    return;
  } // no cambió nada

  const precioFinal = calcPrecioFinal(p, nuevaSeleccion);
  carrito.delete(oldKey);
  const existenteEnNuevo = carrito.get(newKey);
  if (existenteEnNuevo) {
    existenteEnNuevo.cantidad += entry.cantidad;
  } else {
    carrito.set(newKey, {
      ...p,
      precio: precioFinal,
      cantidad: entry.cantidad,
      cartKey: newKey,
      seleccion: nuevaSeleccion,
    });
  }
  syncCartChange(p.id);
  showToast("Opciones actualizadas");
}
function removeFromCart(key, productId) {
  const existente = carrito.get(key);
  if (!existente) return;
  existente.cantidad -= 1;
  if (existente.cantidad <= 0) carrito.delete(key);
  syncCartChange(productId || key);
}

/* ══════════════ Popup de opciones (condiciones del producto) ══════════════ */
/* ══════════════ Popup de opciones (condiciones del producto) ══════════════ */
let productoParaOpciones = null;
let seleccionOpciones = {};
let cartKeyEnEdicion = null; // si no es null, el popup está EDITANDO esa línea del carrito

function abrirOptionsModal(p, seleccionExistente = null, editKey = null) {
  productoParaOpciones = p;
  cartKeyEnEdicion = editKey;
  seleccionOpciones = seleccionExistente ? { ...seleccionExistente } : {};
  document.getElementById("optionsProdNombre").textContent = p.nombre;
  const body = document.getElementById("optionsBody");
  body.innerHTML = "";

  (p.condiciones || []).forEach((cond) => {
    const wrap = document.createElement("div");
    const label = document.createElement("p");
    label.className = "field-label";
    label.textContent = cond.nombre;
    wrap.appendChild(label);

    const optsWrap = document.createElement("div");
    optsWrap.className = "toggle-row flex-wrap";

    cond.opciones.forEach((op, oi) => {
      const valorPrevio = seleccionOpciones[cond.nombre];
      const esActiva = valorPrevio ? valorPrevio === op.nombre : oi === 0;
      const optBtn = document.createElement("div");
      optBtn.className = "toggle-opt" + (esActiva ? " active" : "");
      optBtn.textContent = op.costoAdicional
        ? `${op.nombre} (+S/ ${Number(op.costoAdicional).toFixed(2)})`
        : op.nombre;
      if (esActiva)
        optBtn.style.background = "rgb(var(--dr),var(--dg),var(--db))";
      optBtn.onclick = () => {
        optsWrap.querySelectorAll(".toggle-opt").forEach((o) => {
          o.classList.remove("active");
          o.style.background = "";
        });
        optBtn.classList.add("active");
        optBtn.style.background = "rgb(var(--dr),var(--dg),var(--db))";
        seleccionOpciones[cond.nombre] = op.nombre;
      };
      optsWrap.appendChild(optBtn);
    });

    wrap.appendChild(optsWrap);
    body.appendChild(wrap);
    if (cond.opciones.length && !seleccionOpciones[cond.nombre]) {
      seleccionOpciones[cond.nombre] = cond.opciones[0].nombre;
    }
  });

  document.getElementById("confirmOptionsBtn").textContent = editKey
    ? "Guardar cambios"
    : "Agregar al carrito";
  document.getElementById("optionsOverlay").classList.add("show");
  document.body.style.overflow = "hidden";
}

function cerrarOptionsModal() {
  document.getElementById("optionsOverlay").classList.remove("show");
  if (
    !document.getElementById("checkoutOverlay").classList.contains("show") &&
    !document.getElementById("drawer").classList.contains("show")
  ) {
    document.body.style.overflow = "";
  }
  productoParaOpciones = null;
  cartKeyEnEdicion = null;
}

document.getElementById("closeOptionsBtn").onclick = cerrarOptionsModal;
document.getElementById("optionsOverlay").addEventListener("click", (e) => {
  if (e.target.id === "optionsOverlay") cerrarOptionsModal();
});
document.getElementById("confirmOptionsBtn").onclick = () => {
  if (!productoParaOpciones) return;
  if (cartKeyEnEdicion) {
    editCartSelection(cartKeyEnEdicion, productoParaOpciones, {
      ...seleccionOpciones,
    });
  } else {
    addToCart(productoParaOpciones, { ...seleccionOpciones });
  }
  cerrarOptionsModal();
};

function syncCartChange(id) {
  updateCartUI();
  syncMainListCard(id);
}

function syncMainListCard(id) {
  const p = productosPorId.get(id);
  if (!p) return;
  const cardEl = document.getElementById(`card-${id}`);
  const qtyWrap = document.getElementById(`qty-${id}`);
  if (qtyWrap) renderQtyControls(qtyWrap, p);
  if (cardEl) cardEl.classList.toggle("in-cart", productoEnCarrito(id));
}

function pulseCard(id) {
  const cardEl = document.getElementById(`card-${id}`);
  if (!cardEl) return;
  cardEl.classList.remove("just-added");
  void cardEl.offsetWidth;
  cardEl.classList.add("just-added");
  setTimeout(() => cardEl.classList.remove("just-added"), 700);
}

function animateTotal(el, end) {
  if (!el) return;
  const start = parseFloat(el.textContent) || 0;
  if (Math.abs(end - start) < 0.005) {
    el.textContent = end.toFixed(2);
    return;
  }
  const duration = 380;
  const t0 = performance.now();
  function step(now) {
    const p = Math.min((now - t0) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = (start + (end - start) * eased).toFixed(2);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

let prevCartCount = 0;

function updateCartUI() {
  const items = [...carrito.values()];
  const count = items.reduce((s, i) => s + i.cantidad, 0);
  const total = items.reduce((s, i) => s + i.cantidad * (i.precio || 0), 0);

  // Primero se intenta dibujar la lista de productos. Si algo falla aquí,
  // NO se deja que el contador/total queden desincronizados con la lista.
  try {
    renderCartList(document.getElementById("drawerItems"), items);
    renderCartList(document.getElementById("sidebarItems"), items);
  } catch (err) {
    console.error("Error renderizando el carrito:", err);
    showToast("⚠️ Hubo un problema mostrando el carrito, intenta de nuevo");
  }

  const cartCountEl = document.getElementById("cartCount");
  cartCountEl.textContent = count;
  if (count !== prevCartCount) {
    cartCountEl.classList.remove("bump");
    void cartCountEl.offsetWidth;
    cartCountEl.classList.add("bump");
    prevCartCount = count;
  }

  animateTotal(document.getElementById("cartTotal"), total);
  animateTotal(document.getElementById("drawerTotal"), total);
  animateTotal(document.getElementById("sidebarTotal"), total);
  document.getElementById("sidebarCount").textContent =
    `${count} item${count === 1 ? "" : "s"}`;

  document.getElementById("cartBar").classList.toggle("show", count > 0);
  document.getElementById("checkoutBtnMobile").disabled = count === 0;
  document.getElementById("checkoutBtnDesktop").disabled = count === 0;

  if (count === 0) {
    closeDrawer();
    closeCheckout();
  }
}

const cartRowElements = new Map(); // wrap -> Map(key -> rowEl)

function renderCartList(wrap, items) {
  if (!cartRowElements.has(wrap)) cartRowElements.set(wrap, new Map());
  const rowsMap = cartRowElements.get(wrap);

  if (!items.length) {
    rowsMap.clear();
    wrap.innerHTML = `<p class="text-center text-gray-500 py-10 text-sm">Tu carrito está vacío</p>`;
    return;
  }

  if (!rowsMap.size && wrap.querySelector("p")) wrap.innerHTML = "";

  const keysActuales = new Set(items.map((it) => it.cartKey || it.id));
  rowsMap.forEach((rowEl, key) => {
    if (!keysActuales.has(key)) {
      rowEl.remove();
      rowsMap.delete(key);
    }
  });

  items.forEach((it, idx) => {
    const key = it.cartKey || it.id;
    const precioNum = Number(it.precio) || 0;
    const opcionesTxt = it.seleccion
      ? Object.entries(it.seleccion)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" · ")
      : "";

    let row = rowsMap.get(key);

    if (!row) {
      // Fila nueva: se crea UNA sola vez (con su <img>). De aquí en adelante solo se actualiza texto.
      row = document.createElement("div");
      row.className = "item-row flex items-center gap-3 glass rounded-2xl p-3";
      row.innerHTML = `
        ${imgOrLogoHTML(it.imagen, it.nombre, "w-14 h-14 rounded-xl bg-white/5 flex-shrink-0")}
        <div class="flex-1 min-w-0">
          <p class="font-bold text-[14px] truncate cart-row-nombre">${it.nombre || "Producto"}</p>
          <p class="text-[11px] text-gray-500 truncate cart-row-opciones"${opcionesTxt ? "" : ' style="display:none"'}>${opcionesTxt}</p>
          <p class="text-[12.5px] text-gray-500 mb-2 cart-row-precio">S/ ${precioNum.toFixed(2)} c/u = <span class="font-bold text-gray-300">S/ ${(it.cantidad * precioNum).toFixed(2)}</span></p>
          <div class="flex items-center gap-1.5" data-qty-key="${key}"></div>
        </div>
        <div class="flex flex-col items-center gap-1.5 flex-shrink-0 self-start">
          ${
            it.seleccion
              ? `<button type="button" class="cart-edit-btn w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-gray-300" title="Cambiar opciones" data-key="${key}" data-id="${it.id}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>`
              : ""
          }
          <button type="button" class="cart-remove-btn w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400" title="Quitar del carrito" data-key="${key}" data-id="${it.id}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>
          </button>
        </div>
      `;
      wrap.appendChild(row);
      rowsMap.set(key, row);
    } else {
      // Fila ya existía: solo se actualiza texto/precio, el <img> NUNCA se toca
      row.querySelector(".cart-row-nombre").textContent =
        it.nombre || "Producto";
      const opcionesEl = row.querySelector(".cart-row-opciones");
      opcionesEl.textContent = opcionesTxt;
      opcionesEl.style.display = opcionesTxt ? "" : "none";
      row.querySelector(".cart-row-precio").innerHTML =
        `S/ ${precioNum.toFixed(2)} c/u = <span class="font-bold text-gray-300">S/ ${(it.cantidad * precioNum).toFixed(2)}</span>`;
    }

    if (wrap.children[idx] !== row)
      wrap.insertBefore(row, wrap.children[idx] || null);

    const qtyHolder = row.querySelector(`[data-qty-key="${CSS.escape(key)}"]`);
    if (qtyHolder) renderQtyControls(qtyHolder, it, key);
  });
}
/* ══════════════ Drawer (mobile) ══════════════ */
function openDrawer() {
  document.getElementById("drawerOverlay").classList.add("show");
  document.getElementById("drawer").classList.add("show");
  document.body.style.overflow = "hidden";
}
function closeDrawer() {
  document.getElementById("drawerOverlay").classList.remove("show");
  document.getElementById("drawer").classList.remove("show");
  if (!document.getElementById("checkoutOverlay").classList.contains("show")) {
    document.body.style.overflow = "";
  }
}
document.getElementById("cartBarBtn").onclick = openDrawer;
document.getElementById("closeDrawerBtn").onclick = closeDrawer;
document.getElementById("drawerOverlay").onclick = closeDrawer;

/* ══════════════ Vaciar carrito (con confirmación, mobile + desktop) ══════════════ */
function bindClearButton(btn) {
  let localConfirm = false;
  const originalText = btn.textContent;
  btn.addEventListener("click", () => {
    if (!localConfirm) {
      localConfirm = true;
      btn.textContent = "¿Seguro? Toca de nuevo";
      btn.classList.add("border-red-500/40", "text-red-400");
      setTimeout(() => {
        localConfirm = false;
        btn.textContent = originalText;
        btn.classList.remove("border-red-500/40", "text-red-400");
      }, 3000);
      return;
    }
    const idsAfectados = [...new Set([...carrito.values()].map((it) => it.id))];
    carrito.clear();
    localConfirm = false;
    btn.textContent = originalText;
    btn.classList.remove("border-red-500/40", "text-red-400");
    updateCartUI();
    idsAfectados.forEach((id) => syncMainListCard(id));
    showToast("Carrito vaciado");
  });
}
bindClearButton(document.getElementById("clearCartBtn"));
bindClearButton(document.getElementById("clearCartBtnDesktop"));

/* ══════════════ Modal de checkout (datos del cliente) ══════════════ */
const checkoutOverlay = document.getElementById("checkoutOverlay");
const checkoutModal = document.getElementById("checkoutModal");
const direccionCollapse = document.getElementById("direccionCollapse");
const efectivoCollapse = document.getElementById("efectivoCollapse");
function setCollapseOpen(el, open) {
  if (!el) return;
  el.classList.toggle("open", open);
}
function obtenerUbicacionCliente() {
  const btn = document.getElementById("obtenerUbicacionBtn");
  const btnTexto = document.getElementById("ubicacionBtnTexto");
  const statusEl = document.getElementById("ubicacionStatus");

  if (!navigator.geolocation) {
    statusEl.textContent = "Tu navegador no soporta geolocalización.";
    statusEl.classList.remove("hidden");
    return;
  }

  btn.disabled = true;
  btnTexto.textContent = "Obteniendo ubicación…";
  statusEl.classList.add("hidden");

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      clienteLat = pos.coords.latitude;
      clienteLng = pos.coords.longitude;
      btn.disabled = false;
      btnTexto.textContent = "Ubicación obtenida ✓";
      btn.classList.add("border-green-500/40", "text-green-400");
      statusEl.textContent = `📍 Lat: ${clienteLat.toFixed(5)}, Lng: ${clienteLng.toFixed(5)}`;
      statusEl.classList.remove("hidden");
      showToast("Ubicación agregada al pedido 📍");
    },
    (err) => {
      clienteLat = null;
      clienteLng = null;
      btn.disabled = false;
      btnTexto.textContent = "Usar mi ubicación (más precisión)";
      statusEl.textContent =
        err.code === err.PERMISSION_DENIED
          ? "Permiso de ubicación denegado. Puedes activarlo en los ajustes del navegador."
          : "No se pudo obtener tu ubicación, intenta de nuevo.";
      statusEl.classList.remove("hidden");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
  );
}

document
  .getElementById("obtenerUbicacionBtn")
  .addEventListener("click", obtenerUbicacionCliente);
function openCheckout() {
  if (!carrito.size) return;
  renderCheckoutSummary();
  const nombreInput = document.getElementById("clienteNombre");
  if (nombreUsuarioLogeado && nombreInput && !nombreInput.value.trim()) {
    nombreInput.value = nombreUsuarioLogeado;
  }
  checkoutOverlay.classList.add("show");
  requestAnimationFrame(() => checkoutModal.classList.add("show"));
  document.body.style.overflow = "hidden";
}
function closeCheckout() {
  checkoutModal.classList.remove("show");
  checkoutOverlay.classList.remove("show");
  if (!document.getElementById("drawer").classList.contains("show")) {
    document.body.style.overflow = "";
  }
}
document.getElementById("checkoutBtnMobile").onclick = () => {
  closeDrawer();
  openCheckout();
};
document.getElementById("checkoutBtnDesktop").onclick = openCheckout;
document.getElementById("closeCheckoutBtn").onclick = closeCheckout;
checkoutOverlay.addEventListener("click", (e) => {
  if (e.target === checkoutOverlay) closeCheckout();
});

function renderCheckoutSummary() {
  const items = [...carrito.values()];
  const total = items.reduce((s, i) => s + i.cantidad * i.precio, 0);
  const wrap = document.getElementById("checkoutSummary");
  wrap.innerHTML = items
    .map((it) => {
      const opcionesTxt = it.seleccion
        ? Object.entries(it.seleccion)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ")
        : "";
      return `
    <div class="step-summary-row">
      <span>${it.cantidad}× ${it.nombre}${opcionesTxt ? ` <span class="text-gray-500 text-[11px]">(${opcionesTxt})</span>` : ""}</span>
      <span>S/ ${(it.cantidad * it.precio).toFixed(2)}</span>
    </div>
  `;
    })
    .join("");
  document.getElementById("checkoutTotal").textContent = total.toFixed(2);
}
/* ══════════════ Guardar pedido en Firestore ══════════════ */
async function guardarPedidoEnDB({
  nombre,
  tipoEntrega,
  direccion,
  metodoPago,
  vuelto,
  nota,
  items,
  total,
}) {
  // DESPUÉS
  const pedidosRef = tiendaSubCol(localidad, "tiendas", tiendaId, "pedidos");
  const now = new Date();

  const pedido = {
    estado: "pendiente",
    fecha: now.toLocaleDateString("es-PE"),
    hora: now.toLocaleTimeString("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    timestamp: serverTimestamp(),
    cliente: {
      id_cliente: usuarioLogeado?.id || null,
      nombre,
      tipo_entrega: tipoEntrega,
      direccion: tipoEntrega === "Delivery" ? direccion : "",
      ubicacion:
        tipoEntrega === "Delivery" && clienteLat != null && clienteLng != null
          ? { lat: clienteLat, lng: clienteLng }
          : null,
    },
    mesa: mesaId
      ? {
          id: mesaId,
          nombre: mesaNombre || null,
          numero: mesaNumero ? Number(mesaNumero) : null,
        }
      : null,

    pago: {
      metodo: metodoPago,
      vuelto: metodoPago === "Efectivo" ? vuelto || "" : "",
    },
    nota: nota || "",
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
    negocio: { id: tiendaId, nombre: bizNombre, localidad },
  };

  const docRef = await addDoc(pedidosRef, pedido);
  return docRef.id;
}
/* Toggle: tipo de entrega */
document.getElementById("entregaToggle").addEventListener("click", (e) => {
  const opt = e.target.closest(".toggle-opt");
  if (!opt) return;
  tipoEntrega = opt.dataset.val;
  document.querySelectorAll("#entregaToggle .toggle-opt").forEach((o) => {
    const active = o === opt;
    o.classList.toggle("active", active);
    o.style.background = active ? "rgb(var(--dr),var(--dg),var(--db))" : "";
  });
  setCollapseOpen(direccionCollapse, tipoEntrega === "Delivery");
});

/* Toggle: método de pago */
document.getElementById("pagoToggle").addEventListener("click", (e) => {
  const opt = e.target.closest(".toggle-opt");
  if (!opt) return;
  metodoPago = opt.dataset.val;
  document.querySelectorAll("#pagoToggle .toggle-opt").forEach((o) => {
    const active = o === opt;
    o.classList.toggle("active", active);
    o.style.background = active ? "rgb(var(--dr),var(--dg),var(--db))" : "";
  });
  setCollapseOpen(efectivoCollapse, metodoPago === "Efectivo");
});

/* Inicializar colores activos de los toggles al cargar */
function paintToggleDefaults() {
  document.querySelector("#entregaToggle .toggle-opt.active").style.background =
    "rgb(var(--dr),var(--dg),var(--db))";
  document.querySelector("#pagoToggle .toggle-opt.active").style.background =
    "rgb(var(--dr),var(--dg),var(--db))";
  setCollapseOpen(direccionCollapse, tipoEntrega === "Delivery");
  setCollapseOpen(efectivoCollapse, metodoPago === "Efectivo");
}
/* Envío final por WhatsApp */
document
  .getElementById("sendWhatsappBtn")
  .addEventListener("click", async () => {
    const nombreInput = document.getElementById("clienteNombre");
    const direccionInput = document.getElementById("clienteDireccion");
    const nombre = nombreInput.value.trim();
    const direccion = direccionInput.value.trim();

    nombreInput.classList.remove("field-error");
    direccionInput.classList.remove("field-error");

    if (!nombre) {
      nombreInput.classList.add("field-error");
      nombreInput.focus();
      showToast("Falta tu nombre");
      return;
    }
    if (tipoEntrega === "Delivery" && !direccion) {
      direccionInput.classList.add("field-error");
      direccionInput.focus();
      showToast("Falta la dirección de entrega");
      return;
    }

    const vuelto = document.getElementById("clienteVuelto").value.trim();
    const nota = document.getElementById("clienteNota").value.trim();
    const items = [...carrito.values()];
    const total = items.reduce((s, i) => s + i.cantidad * i.precio, 0);

    const btn = document.getElementById("sendWhatsappBtn");
    btn.disabled = true;
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = "Guardando pedido…";

    let pedidoId;
    try {
      pedidoId = await guardarPedidoEnDB({
        nombre,
        tipoEntrega,
        direccion,
        metodoPago,
        vuelto,
        nota,
        items,
        total,
      });
    } catch (err) {
      console.error("Error guardando pedido:", err);
      btn.disabled = false;
      btn.innerHTML = textoOriginal;
      showToast("⚠️ No se pudo guardar tu pedido, intenta de nuevo");
      return;
    }

    const linkPedido = `${DASHBOARD_BASE_URL}/${tiendaId}/${pedidoId}`;
    const msg = `¡Hola *${bizNombre}*! 👋 Aquí está mi pedido:\n${linkPedido}`;

    btn.disabled = false;
    btn.innerHTML = textoOriginal;

    const numero = getBizWhatsapp();
    const url = numero
      ? `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;

    window.open(url, "_blank");
    closeCheckout();
    showToast("Abriendo WhatsApp…");

    // Reset para el próximo pedido
    clienteLat = null;
    clienteLng = null;
    const btnUbic = document.getElementById("obtenerUbicacionBtn");
    const btnUbicTexto = document.getElementById("ubicacionBtnTexto");
    const statusUbic = document.getElementById("ubicacionStatus");
    if (btnUbic) btnUbic.classList.remove("border-green-500/40", "text-green-400");
    if (btnUbicTexto) btnUbicTexto.textContent = "Usar mi ubicación (más precisión)";
    if (statusUbic) statusUbic.classList.add("hidden");
  });
/* ══════════════ Toast ══════════════ */
let toastTimer;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

/* ══════════════ Loader de pantalla completa ══════════════ */
function hidePageLoader() {
  const loader = document.getElementById("pageLoader");
  if (!loader) return;
  loader.classList.add("leaving");
  setTimeout(() => loader.remove(), 480);
}

function bindCartEditDelegation(wrap) {
  if (!wrap) return;
  wrap.addEventListener("click", (e) => {
    const editBtn = e.target.closest(".cart-edit-btn");
    if (editBtn) {
      const key = editBtn.dataset.key;
      const id = editBtn.dataset.id;
      const entry = carrito.get(key);
      const p = productosPorId.get(id);
      if (entry && p) abrirOptionsModal(p, entry.seleccion, key);
      return;
    }
    const removeBtn = e.target.closest(".cart-remove-btn");
    if (removeBtn) {
      const key = removeBtn.dataset.key;
      const id = removeBtn.dataset.id;
      carrito.delete(key);
      syncCartChange(id);
      showToast("Producto quitado del carrito");
    }
  });
}
/* ══════════════ Init ══════════════ */

/* ══════════════ Init ══════════════ */
async function init() {
  paintToggleDefaults();
  bindCartEditDelegation(document.getElementById("drawerItems"));
  bindCartEditDelegation(document.getElementById("sidebarItems"));
  pintarMesaBadge();
  if (mesaId) {
    tipoEntrega = "En mesa";
    document.getElementById("entregaField")?.classList.add("hidden");
    document.getElementById("direccionCollapse")?.classList.remove("open");
    document.getElementById("direccionCollapse")?.classList.add("hidden");
    document
      .getElementById("pagoToggle")
      ?.closest("div")
      ?.classList.add("hidden");
    document.getElementById("efectivoCollapse")?.classList.add("hidden");
    ajustarTextosMesa();

    // Nuevo: en modo mesa, el botón de checkout NO abre el modal,
    // manda el pedido directo a la DB.
    const btnMobile = document.getElementById("checkoutBtnMobile");
    const btnDesktop = document.getElementById("checkoutBtnDesktop");
    if (btnMobile) btnMobile.onclick = () => confirmarPedidoMesaDirecto();
    if (btnDesktop) btnDesktop.onclick = () => confirmarPedidoMesaDirecto();
  }

  if (!tiendaId) {
    document.getElementById("lista").innerHTML = "";
    document
      .getElementById("emptyMsg")
      .querySelector("p.font-bold").textContent = "Falta información";
    document.getElementById("emptyMsg").querySelector("p.text-sm").textContent =
      "No se indicó el negocio (falta ?id= en la URL).";
    document.getElementById("emptyMsg").classList.remove("hidden");
    document.getElementById("emptyMsg").classList.add("flex");
    hidePageLoader();
    return;
  }

  const [biz, productos, pedidoMesa] = await Promise.all([
    loadTienda(),
    loadProductosCatalogo(),
    loadPedidoMesa(),
    cargarUsuarioLogeado(),
  ]);
  await renderTienda(biz);
  aplicarComportamientoBotonAtras();
  aplicarModeloNegocio(biz);
  productosGlobal = productos;
  productosPorId = new Map(productos.map((p) => [p.id, p]));
  document.getElementById("totalCount").textContent = productos.length;

  if (pedidoMesa) {
    pedidoActivoMesa = pedidoMesa;
    renderPedidoActivoMesa(pedidoMesa);
  }

  if (!productos.length) {
    document.getElementById("lista").innerHTML = "";
    document.getElementById("emptyMsg").classList.remove("hidden");
    document.getElementById("emptyMsg").classList.add("flex");
    hidePageLoader();
    return;
  }

  renderFiltros(productos);
  buildAllCards(productos);
  renderLista(productos);
  updateCartUI();
  hidePageLoader();
}
init();
