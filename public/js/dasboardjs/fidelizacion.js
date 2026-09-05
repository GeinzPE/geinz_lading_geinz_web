/* ===================================================================
   FIREBASE — ya NO se inicializa acá. Se usa el db central de db.js
   y todas las rutas vienen de rutas.js (paths.js), igual que el resto
   del proyecto.
   AJUSTA estos dos imports según dónde viva este archivo respecto a
   src/db/db.js y src/firebase/paths.js.
   =================================================================== */
import { db } from "../db/db.js";
import {
  tiendaSubDoc,
  tiendaPathStr,
  tiendasDelDistritoCol,
  categoriasCol,
  productosDeCategoriaCol,
  tiendaDescuentosCol,
  tiendaDescuentoDoc,
  clientesCol,
  clienteDoc,
  clienteHistorialCol, // <-- NUEVO: agrégala en rutas.js (ver rutas-agregar.js)
  canjesCol,
  data_user_logeado,
} from "../rutas/rutas.js";
import {
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  onSnapshot,
  increment,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// db ya viene inicializado desde db.js, así que si existe, estamos listos.
const firebaseReady = !!db;
if (!firebaseReady) {
  console.warn(
    "No se pudo obtener 'db' desde db.js. Revisa la ruta del import.",
  );
}

/* ===================================================================
   ESTADO GENERAL
   distrito: por ahora fijo (igual que en rutas.js), tiendaId: se
   obtiene por parámetro de URL, ej: fidelizacion.html?tiendaId=fW7W8RsgkkQ3IYfxKHGR
   =================================================================== */

const _urlParams = new URLSearchParams(window.location.search);
let tiendaId = _urlParams.get("id") || sessionStorage.getItem("tiendaId");
let distrito =
  _urlParams.get("localidad") ||
  sessionStorage.getItem("localidad") ||
  "barranca";

let categoriaSeleccionada = "";
let productosCache = {}; // productoId -> data del producto en catálogo
let descuentosCache = []; // productos/recompensas a canjear de la tienda actual, para el modal de canje
let clientesRowsCache = []; // TODOS los clientes ya resueltos (nombre, puntos, invertido, última visita, etc.)
let clientesRowsFiltrados = []; // subconjunto actualmente visible (según búsqueda/filtro/orden) — se usa para exportar CSV/PDF
let historialDataCache = []; // filas del historial de canjes ya renderizadas, para exportar a CSV
let historialPorCliente = {}; // clienteId -> { pedidos: [...], totalInvertido, pedidosCount } — pedidos reales (compras)
let editandoDescuentoId = null; // si no es null, el próximo "agregar" hace update en vez de create

const CLIENTES_POR_PAGINA = 50;
let paginaClientesActual = 1;

function validarCamposBeneficio(tipo) {
  if (tipo === "monto") {
    const v = Number(document.getElementById("descuentoMontoCatalogo").value);
    if (!v || v <= 0) return "Ingresa el monto de descuento (S/)";
  } else if (tipo === "porcentaje") {
    const v = Number(
      document.getElementById("descuentoPorcentajeCatalogo").value,
    );
    if (!v || v <= 0 || v > 100) return "Ingresa un porcentaje válido (1–100)";
  } else if (tipo === "cantidad") {
    const compra = Number(
      document.getElementById("descuentoCantidadCompra").value,
    );
    const paga = Number(document.getElementById("descuentoCantidadPaga").value);
    if (!compra || !paga || paga >= compra)
      return "Ingresa unidades de compra y paga válidas (paga menor que compra)";
  }
  return null;
}

function currentConfigDoc() {
  // Tiendas/.../distrito/<distrito>/tiendas/<tiendaId>  -> el doc de la tienda misma,
  // guardamos activar/desactivar y vencimiento como un map "fidelizacion" dentro de ese doc
  return tiendaSubDoc(distrito, "tiendas", tiendaId);
}

/* ===================================================================
   NAVEGACIÓN
   =================================================================== */
const titles = {
  estado: [
    "Estado y vencimiento",
    "Activa la tarjeta de fidelidad y controla la caducidad de los puntos acumulados.",
  ],
  descuentos: [
    "Productos a canjear",
    "Crea y administra lo que tus clientes pueden canjear con puntos.",
  ],
  clientes: [
    "Clientes y puntos",
    "Consulta el saldo de puntos y sellos de cada cliente.",
  ],
  historial: ["Historial de canjes", "Revisa las recompensas ya canjeadas."],
};

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    document
      .querySelectorAll(".nav-item")
      .forEach((i) => i.classList.remove("active"));
    item.classList.add("active");
    const key = item.dataset.panel;
    document
      .querySelectorAll(".panel")
      .forEach((p) => p.classList.remove("active"));
    document.getElementById("panel-" + key).classList.add("active");
    document.getElementById("topbarTitle").textContent = titles[key][0];
    document.getElementById("topbarSub").textContent = titles[key][1];
    item.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  });
});

/* ===================================================================
   FEEDBACK DE CARGA (barra superior + spinner en botones)
   =================================================================== */
let loadingCount = 0;
function showLoading() {
  loadingCount++;
  document.getElementById("topProgressBar")?.classList.add("active");
}
function hideLoading() {
  loadingCount = Math.max(0, loadingCount - 1);
  if (loadingCount === 0)
    document.getElementById("topProgressBar")?.classList.remove("active");
}
function setBtnBusy(btn, busyText) {
  if (!btn) return () => {};
  const original = btn.innerHTML;
  const originalWidth = btn.getBoundingClientRect().width;
  btn.style.minWidth = originalWidth + "px";
  btn.disabled = true;
  btn.innerHTML = `<span class="btn-spinner"></span>${escapeHtml(busyText || "Guardando…")}`;
  return () => {
    btn.disabled = false;
    btn.innerHTML = original;
    btn.style.minWidth = "";
  };
}

/* ===================================================================
   TOAST
   =================================================================== */
let toastTimer;
function showToast(msg, isError = false) {
  const t = document.getElementById("toast");
  document.getElementById("toastMsg").textContent = msg;
  t.classList.toggle("err", isError);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ===================================================================
   GUARDAR CONFIGURACIÓN (genérico por sección)
   =================================================================== */
async function saveField(payload, label) {
  if (!firebaseReady) {
    showToast("No se pudo conectar con la base de datos", true);
    return;
  }
  if (!tiendaId) {
    showToast("Falta el id de la tienda en la URL", true);
    return;
  }
  showLoading();
  try {
    // merge:true hace merge profundo del map "fidelizacion", así que guardar
    // solo activo/mensajeInactivo no borra vencimientoActivo/diasVencimiento (o viceversa)
    await setDoc(
      currentConfigDoc(),
      { fidelizacion: payload },
      { merge: true },
    );
    document.getElementById("resumenFecha").textContent =
      new Date().toLocaleString("es-PE");
    showToast(`${label} guardado`);
  } catch (err) {
    console.error(err);
    showToast("Error al guardar: " + err.message, true);
  } finally {
    hideLoading();
  }
}

/* ---- Activar / desactivar ---- */
document.getElementById("toggleActivo").addEventListener("change", (e) => {
  document.getElementById("estadoBadge").textContent = e.target.checked
    ? "Activa"
    : "Inactiva";
  document.getElementById("estadoBadge").className =
    "badge " + (e.target.checked ? "on" : "off");
});
document
  .querySelector('[data-save="estado"]')
  .addEventListener("click", async (e) => {
    const restore = setBtnBusy(e.currentTarget, "Guardando…");
    await saveField(
      {
        activo: document.getElementById("toggleActivo").checked,
        mensajeInactivo: document.getElementById("mensajeInactivo").value,
        vencimientoActivo: document.getElementById("toggleVencimiento").checked,
        diasVencimiento: Number(
          document.getElementById("diasVencimiento").value,
        ),
        diasAviso: Number(document.getElementById("diasAviso").value),
      },
      "Estado y vencimiento",
    );
    restore();
  });

/* ===================================================================
   PRODUCTOS A CANJEAR — selector de origen (catálogo vs texto libre)
   =================================================================== */
document.querySelectorAll(".mode-card").forEach((card) => {
  card.addEventListener("click", () => {
    document
      .querySelectorAll(".mode-card")
      .forEach((c) => c.classList.remove("selected"));
    card.classList.add("selected");
    const origen = card.dataset.origen;
    document.getElementById("modo-catalogo").style.display =
      origen === "catalogo" ? "block" : "none";
    document.getElementById("modo-manual").style.display =
      origen === "manual" ? "block" : "none";
  });
});

/* ---- Tipo de beneficio (gratis / monto / porcentaje / cantidad) ---- */
function actualizarCamposTipoBeneficio() {
  const tipo = document.getElementById("tipoBeneficioCatalogo").value;
  document.getElementById("camposDescuentoMontoCatalogo").style.display =
    tipo === "monto" ? "grid" : "none";
  document.getElementById("camposDescuentoPorcentajeCatalogo").style.display =
    tipo === "porcentaje" ? "grid" : "none";
  document.getElementById("camposDescuentoCantidadCatalogo").style.display =
    tipo === "cantidad" ? "grid" : "none";
  actualizarPreviewPrecioFinal();
}
document
  .getElementById("tipoBeneficioCatalogo")
  .addEventListener("change", actualizarCamposTipoBeneficio);
[
  "descuentoMontoCatalogo",
  "descuentoPorcentajeCatalogo",
  "descuentoCantidadCompra",
  "descuentoCantidadPaga",
].forEach((id) => {
  document
    .getElementById(id)
    .addEventListener("input", actualizarPreviewPrecioFinal);
});

function actualizarPreviewPrecioFinal() {
  const wrap = document.getElementById("previewPrecioFinalCatalogo");
  const texto = document.getElementById("previewPrecioFinalTexto");
  const prodSel = document.getElementById("prodDelCatalogo");
  const id = prodSel.value;
  const tipo = document.getElementById("tipoBeneficioCatalogo").value;
  if (!id || !productosCache[id] || productosCache[id].precio == null) {
    wrap.style.display = "none";
    return;
  }
  const precio = Number(productosCache[id].precio);
  if (tipo === "gratis") {
    texto.textContent = `Precio original S/ ${precio.toFixed(2)} · el cliente lo lleva gratis con sus puntos`;
    wrap.style.display = "flex";
  } else if (tipo === "monto") {
    const desc =
      Number(document.getElementById("descuentoMontoCatalogo").value) || 0;
    const final = Math.max(0, precio - desc);
    texto.textContent = `Precio original S/ ${precio.toFixed(2)} → paga S/ ${final.toFixed(2)} (descuento S/ ${desc.toFixed(2)})`;
    wrap.style.display = "flex";
  } else if (tipo === "porcentaje") {
    const pct =
      Number(document.getElementById("descuentoPorcentajeCatalogo").value) || 0;
    const final = Math.max(0, precio * (1 - pct / 100));
    texto.textContent = `Precio original S/ ${precio.toFixed(2)} → paga S/ ${final.toFixed(2)} (${pct}% de descuento)`;
    wrap.style.display = "flex";
  } else if (tipo === "cantidad") {
    const compra =
      Number(document.getElementById("descuentoCantidadCompra").value) || 0;
    const paga =
      Number(document.getElementById("descuentoCantidadPaga").value) || 0;
    if (compra > 0 && paga > 0) {
      texto.textContent = `Ej: ${compra}x${paga} · lleva ${compra} unidades y paga solo ${paga} (precio unitario S/ ${precio.toFixed(2)})`;
    } else {
      texto.textContent = `Precio unitario S/ ${precio.toFixed(2)} · define cuántas lleva y cuántas paga`;
    }
    wrap.style.display = "flex";
  }
}

/* ===================================================================
   CATÁLOGO DE PRODUCTOS (lectura desde Firestore, vía rutas.js)
   Tiendas/.../distrito/<distrito>/tiendas/<tiendaId>/productos/<categoria>/<categoria>
   =================================================================== */
function resetCategorias() {
  const catSel = document.getElementById("prodCategoria");
  catSel.innerHTML = tiendaId
    ? '<option value="">Cargando categorías…</option>'
    : '<option value="">Falta el id de la tienda</option>';
  resetProductos();
}
function resetProductos() {
  const prodSel = document.getElementById("prodDelCatalogo");
  prodSel.innerHTML = '<option value="">Elige una categoría primero</option>';
  prodSel.disabled = true;
  document.getElementById("prodPreview").style.display = "none";
  document.getElementById("previewPrecioFinalCatalogo").style.display = "none";
  productosCache = {};
}

async function loadCategorias() {
  const catSel = document.getElementById("prodCategoria");
  resetProductos();
  if (!tiendaId) {
    catSel.innerHTML = '<option value="">Falta el id de la tienda</option>';
    return;
  }
  catSel.innerHTML = '<option value="">Cargando categorías…</option>';
  if (!firebaseReady) return;
  const rutaCategorias = tiendaPathStr(
    distrito,
    "tiendas",
    tiendaId,
    "productos",
  );
  try {
    const snap = await getDocs(categoriasCol(distrito, tiendaId));
    if (snap.empty) {
      catSel.innerHTML =
        '<option value="">Sin categorías en esta tienda</option>';
      return;
    }
    catSel.innerHTML = '<option value="">Elige una categoría</option>';
    snap.forEach((d) => {
      const data = d.data();
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = data.nombre || d.id;
      catSel.appendChild(opt);
    });
  } catch (err) {
    console.error(err);
    catSel.innerHTML = '<option value="">Error al cargar categorías</option>';
  }
}
document.getElementById("prodCategoria").addEventListener("change", (e) => {
  categoriaSeleccionada = e.target.value;
  loadProductosDeCategoria();
});

async function loadProductosDeCategoria() {
  const prodSel = document.getElementById("prodDelCatalogo");
  document.getElementById("prodPreview").style.display = "none";
  document.getElementById("previewPrecioFinalCatalogo").style.display = "none";
  if (!categoriaSeleccionada || !tiendaId) {
    prodSel.innerHTML = '<option value="">Elige una categoría primero</option>';
    prodSel.disabled = true;
    productosCache = {};
    return;
  }
  prodSel.innerHTML = '<option value="">Cargando productos…</option>';
  prodSel.disabled = true;
  if (!firebaseReady) return;
  const rutaProductos = tiendaPathStr(
    distrito,
    "tiendas",
    tiendaId,
    "productos",
    categoriaSeleccionada,
    categoriaSeleccionada,
  );
  try {
    const snap = await getDocs(
      productosDeCategoriaCol(distrito, tiendaId, categoriaSeleccionada),
    );
    productosCache = {};
    if (snap.empty) {
      prodSel.innerHTML =
        '<option value="">Sin productos en esta categoría</option>';
      return;
    }
    prodSel.innerHTML = '<option value="">Elige un producto</option>';
    snap.forEach((d) => {
      const data = d.data();
      productosCache[d.id] = data;
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = data.nombre || "(sin nombre)";
      if (data.disponible === false) opt.textContent += " · no disponible";
      prodSel.appendChild(opt);
    });
    prodSel.disabled = false;
  } catch (err) {
    console.error(err);
    prodSel.innerHTML = '<option value="">Error al cargar productos</option>';
  }
}
document.getElementById("prodDelCatalogo").addEventListener("change", () => {
  mostrarPreviewProducto();
  actualizarPreviewPrecioFinal();
});

function mostrarPreviewProducto() {
  const prodSel = document.getElementById("prodDelCatalogo");
  const id = prodSel.value;
  const prev = document.getElementById("prodPreview");
  const imgEl = document.getElementById("prodPreviewImg");
  if (!id || !productosCache[id]) {
    prev.style.display = "none";
    return;
  }
  const p = productosCache[id];
  const imgUrl =
    Array.isArray(p.imagenes) && p.imagenes[0] && p.imagenes[0].url
      ? p.imagenes[0].url
      : "";
  if (imgUrl) {
    imgEl.src = imgUrl;
    imgEl.style.display = "block";
  } else {
    imgEl.removeAttribute("src");
    imgEl.style.display = "none";
  }
  document.getElementById("prodPreviewNombre").textContent =
    p.nombre || "(sin nombre)";
  let sub = p.precio != null ? `S/ ${p.precio}` : "Sin precio";
  if (p.disponible === false) sub += " · No disponible";
  document.getElementById("prodPreviewPrecio").textContent = sub;
  prev.style.display = "flex";
}

/* ===================================================================
   DESCUENTOS / PRODUCTOS A CANJEAR (guardado en Firestore, vía rutas.js)
   Tiendas/.../distrito/<distrito>/tiendas/<tiendaId>/descuentos/<id>
   =================================================================== */
document
  .getElementById("btnAgregarDescuento")
  .addEventListener("click", async (e) => {
    const nombre = document.getElementById("descNombre").value.trim();
    const valor = document.getElementById("descValor").value.trim();
    const costo = document.getElementById("descCosto").value;
    if (!nombre) {
      showToast("Escribe un nombre para el descuento", true);
      return;
    }
    if (!costo || Number(costo) <= 0) {
      showToast("Ingresa el costo en puntos", true);
      return;
    }
    if (!tiendaId) {
      showToast("Falta el id de la tienda en la URL", true);
      return;
    }
    if (!firebaseReady) {
      showToast("No se pudo conectar con la base de datos", true);
      return;
    }
    const restore = setBtnBusy(
      e.currentTarget,
      editandoDescuentoId ? "Guardando…" : "Agregando…",
    );
    showLoading();
    try {
      const payload = {
        origen: "manual",
        nombre,
        valor,
        costoPuntos: Number(costo) || 0,
      };
      if (editandoDescuentoId) {
        await updateDoc(
          tiendaDescuentoDoc(distrito, tiendaId, editandoDescuentoId),
          payload,
        );
        showToast("Descuento actualizado");
        editandoDescuentoId = null;
        document.getElementById("btnAgregarDescuento").textContent =
          "Agregar producto";
      } else {
        payload.creado = new Date().toISOString();
        await addDoc(tiendaDescuentosCol(distrito, tiendaId), payload);
        showToast("Descuento agregado");
      }
      document.getElementById("descNombre").value = "";
      document.getElementById("descValor").value = "";
      document.getElementById("descCosto").value = "";
      await loadDescuentos();
    } catch (err) {
      showToast("Error: " + err.message, true);
    } finally {
      hideLoading();
      restore();
    }
  });

document
  .getElementById("btnAgregarDesdeCatalogo")
  .addEventListener("click", async (e) => {
    const prodSel = document.getElementById("prodDelCatalogo");
    const id = prodSel.value;
    const costo = document.getElementById("descCostoCatalogo").value;
    const tipoBeneficio = document.getElementById(
      "tipoBeneficioCatalogo",
    ).value;
    if (!editandoDescuentoId && (!id || !productosCache[id])) {
      showToast("Elige un producto del catálogo", true);
      return;
    }
    if (!costo || Number(costo) <= 0) {
      showToast("Ingresa el costo en puntos", true);
      return;
    }
    const errorBeneficio = validarCamposBeneficio(tipoBeneficio);
    if (errorBeneficio) {
      showToast(errorBeneficio, true);
      return;
    }
    if (!tiendaId) {
      showToast("Falta el id de la tienda en la URL", true);
      return;
    }
    if (!firebaseReady) {
      showToast("No se pudo conectar con la base de datos", true);
      return;
    }
    const p = productosCache[id] || {};
    const imgUrl =
      Array.isArray(p.imagenes) && p.imagenes[0] && p.imagenes[0].url
        ? p.imagenes[0].url
        : "";
    const precioOriginal = p.precio != null ? Number(p.precio) : null;
    // Construye el bloque de descuento según el tipo elegido
    let descuento = { tipo: tipoBeneficio };
    let precioFinalEstimado = precioOriginal;
    if (tipoBeneficio === "monto") {
      const monto =
        Number(document.getElementById("descuentoMontoCatalogo").value) || 0;
      descuento.monto = monto;
      if (precioOriginal != null)
        precioFinalEstimado = Math.max(0, precioOriginal - monto);
    } else if (tipoBeneficio === "porcentaje") {
      const pct =
        Number(document.getElementById("descuentoPorcentajeCatalogo").value) ||
        0;
      descuento.porcentaje = pct;
      if (precioOriginal != null)
        precioFinalEstimado = Math.max(0, precioOriginal * (1 - pct / 100));
    } else if (tipoBeneficio === "cantidad") {
      const compra =
        Number(document.getElementById("descuentoCantidadCompra").value) || 0;
      const paga =
        Number(document.getElementById("descuentoCantidadPaga").value) || 0;
      descuento.compraUnidades = compra;
      descuento.pagaUnidades = paga;
    } else {
      precioFinalEstimado = 0; // gratis
    }

    const restore = setBtnBusy(
      e.currentTarget,
      editandoDescuentoId ? "Guardando…" : "Agregando…",
    );
    showLoading();
    try {
      const payload = {
        tipoBeneficio, // "gratis" | "monto" | "porcentaje" | "cantidad"
        descuento, // detalle según el tipo (monto, porcentaje, o compra/paga)
        precioFinalEstimado,
        costoPuntos: Number(costo) || 0,
      };
      if (editandoDescuentoId) {
        await updateDoc(
          tiendaDescuentoDoc(distrito, tiendaId, editandoDescuentoId),
          payload,
        );
        showToast("Producto actualizado");
        editandoDescuentoId = null;
        document.getElementById("btnAgregarDesdeCatalogo").textContent =
          "Agregar desde catálogo";
      } else {
        await addDoc(tiendaDescuentosCol(distrito, tiendaId), {
          origen: "catalogo",
          productoId: id,
          categoria: categoriaSeleccionada,
          nombre: p.nombre || "(sin nombre)",
          precioOriginal,
          imagenUrl: imgUrl,
          creado: new Date().toISOString(),
          ...payload,
        });
        showToast("Producto agregado desde catálogo");
      }
      document.getElementById("descCostoCatalogo").value = "";
      document.getElementById("descuentoMontoCatalogo").value = "";
      document.getElementById("descuentoPorcentajeCatalogo").value = "";
      document.getElementById("descuentoCantidadCompra").value = "";
      document.getElementById("descuentoCantidadPaga").value = "";
      await loadDescuentos();
    } catch (err) {
      showToast("Error: " + err.message, true);
    } finally {
      hideLoading();
      restore();
    }
  });

async function loadDescuentos() {
  const cont = document.getElementById("listaDescuentos");
  descuentosCache = [];
  if (!firebaseReady) return;
  if (!tiendaId) {
    cont.innerHTML =
      '<div class="empty-state">Falta el id de la tienda en la URL (?tiendaId=...).</div>';
    return;
  }
  try {
    const snap = await getDocs(tiendaDescuentosCol(distrito, tiendaId));
    if (snap.empty) {
      cont.innerHTML =
        '<div class="empty-state">Aún no hay productos. Crea el primero desde la izquierda.</div>';
      return;
    }
    cont.innerHTML = "";
    snap.forEach((d) => {
      const data = d.data();
      descuentosCache.push({ id: d.id, ...data });
      const esCatalogo = data.origen === "catalogo";
      const iconContent = data.imagenUrl
        ? `<img src="${data.imagenUrl}" alt="" style="width:100%;height:100%;object-fit:cover;">`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.6 12.6L12 21.2 2.8 12 2.8 2.8 12 2.8l8.6 9.8z"/></svg>`;
      const origenBadge = esCatalogo
        ? '<span class="badge neutral">Catálogo</span>'
        : '<span class="badge neutral">Texto libre</span>';

      // Texto de precio: si tiene precioOriginal + tipoBeneficio, muestra el detalle del descuento
      let precioTxt = "";
      if (esCatalogo && data.precioOriginal != null) {
        const orig = Number(data.precioOriginal);
        if (data.tipoBeneficio === "monto") {
          precioTxt = `S/ ${orig.toFixed(2)} → S/ ${Number(data.precioFinalEstimado ?? orig).toFixed(2)} (–S/ ${Number(data.descuento?.monto || 0).toFixed(2)})`;
        } else if (data.tipoBeneficio === "porcentaje") {
          precioTxt = `S/ ${orig.toFixed(2)} → S/ ${Number(data.precioFinalEstimado ?? orig).toFixed(2)} (–${data.descuento?.porcentaje || 0}%)`;
        } else if (data.tipoBeneficio === "cantidad") {
          precioTxt = `S/ ${orig.toFixed(2)} c/u · ${data.descuento?.compraUnidades || "?"}x${data.descuento?.pagaUnidades || "?"}`;
        } else {
          precioTxt = `S/ ${orig.toFixed(2)} · gratis con puntos`;
        }
      } else if (data.precio != null) {
        precioTxt = `S/ ${data.precio}`;
      } else if (data.valor) {
        precioTxt = data.valor;
      }

      cont.insertAdjacentHTML(
        "beforeend",
        `
        <div class="item-row" data-id="${d.id}" style="cursor:pointer;">
          <div class="item-icon">${iconContent}</div>
          <div class="item-main">
            <div class="item-title">${escapeHtml(data.nombre)} ${origenBadge}</div>
            <div class="item-sub">${data.costoPuntos || 0} puntos${precioTxt ? " · " + escapeHtml(String(precioTxt)) : ""}</div>
          </div>
          <div class="item-remove" data-id="${d.id}" data-col="descuentos"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M18 6L6 18M6 6l12 12"/></svg></div>
        </div>`,
      );
    });
    wireRemoveButtons();
    wireEditRows();
  } catch (err) {
    console.error(err);
  }
}

function wireRemoveButtons() {
  document.querySelectorAll(".item-remove").forEach((btn) => {
    btn.onclick = async (ev) => {
      ev.stopPropagation(); // no disparar la edición del item-row al eliminar
      btn.style.pointerEvents = "none";
      btn.style.opacity = "0.4";
      showLoading();
      try {
        await deleteDoc(tiendaDescuentoDoc(distrito, tiendaId, btn.dataset.id));
        showToast("Eliminado");
        await loadDescuentos();
      } catch (err) {
        showToast("Error: " + err.message, true);
      } finally {
        hideLoading();
      }
    };
  });
}

function wireEditRows() {
  document
    .querySelectorAll("#listaDescuentos .item-row[data-id]")
    .forEach((row) => {
      row.onclick = (ev) => {
        if (ev.target.closest(".item-remove")) return;
        const data = descuentosCache.find((d) => d.id === row.dataset.id);
        if (data) cargarDescuentoParaEditar(data);
      };
    });
}

function cargarDescuentoParaEditar(data) {
  editandoDescuentoId = data.id;
  const esCatalogo = data.origen === "catalogo";

  document
    .querySelectorAll(".mode-card")
    .forEach((c) => c.classList.remove("selected"));
  if (esCatalogo) {
    document.getElementById("origenCatalogo").classList.add("selected");
    document.getElementById("modo-catalogo").style.display = "block";
    document.getElementById("modo-manual").style.display = "none";

    document.getElementById("tipoBeneficioCatalogo").value =
      data.tipoBeneficio || "gratis";
    actualizarCamposTipoBeneficio();
    document.getElementById("descuentoMontoCatalogo").value =
      data.descuento?.monto ?? "";
    document.getElementById("descuentoPorcentajeCatalogo").value =
      data.descuento?.porcentaje ?? "";
    document.getElementById("descuentoCantidadCompra").value =
      data.descuento?.compraUnidades ?? "";
    document.getElementById("descuentoCantidadPaga").value =
      data.descuento?.pagaUnidades ?? "";
    document.getElementById("descCostoCatalogo").value = data.costoPuntos ?? "";
    document.getElementById("btnAgregarDesdeCatalogo").textContent =
      "Guardar cambios";
  } else {
    document.getElementById("origenManual").classList.add("selected");
    document.getElementById("modo-catalogo").style.display = "none";
    document.getElementById("modo-manual").style.display = "block";

    document.getElementById("descNombre").value = data.nombre || "";
    document.getElementById("descValor").value = data.valor || "";
    document.getElementById("descCosto").value = data.costoPuntos ?? "";
    document.getElementById("btnAgregarDescuento").textContent =
      "Guardar cambios";
  }

  document
    .getElementById("origenCatalogo")
    .scrollIntoView({ behavior: "smooth", block: "center" });
  showToast("Editando: " + (data.nombre || "producto"));
}

/* ===================================================================
   AGREGAR CLIENTE MANUALMENTE
   Tiendas/.../distrito/<distrito>/tiendas/<tiendaId>/clientes/<id>
   =================================================================== */
document
  .getElementById("btnAgregarCliente")
  .addEventListener("click", async () => {
    const nombre = document.getElementById("nuevoClienteNombre").value.trim();
    const telefono = document
      .getElementById("nuevoClienteTelefono")
      .value.trim();
    const puntosIniciales =
      Number(document.getElementById("nuevoClientePuntos").value) || 0;
    if (!nombre) {
      showToast("Escribe el nombre del cliente", true);
      return;
    }
    if (!tiendaId) {
      showToast("Falta el id de la tienda en la URL", true);
      return;
    }
    if (!firebaseReady) {
      showToast("No se pudo conectar con la base de datos", true);
      return;
    }
    try {
      await addDoc(clientesCol(distrito, tiendaId), {
        nombre,
        telefono,
        puntos: puntosIniciales,
        activo: true,
        origen: "manual",
        creado: new Date().toISOString(),
      });
      document.getElementById("nuevoClienteNombre").value = "";
      document.getElementById("nuevoClienteTelefono").value = "";
      document.getElementById("nuevoClientePuntos").value = "";
      showToast("Cliente agregado");
    } catch (err) {
      showToast("Error: " + err.message, true);
    }
  });

/* ===================================================================
   MODAL GENÉRICO (ajustar puntos / canjear recompensa / ver pedidos / escáner)
   =================================================================== */
function openModal(html) {
  document.getElementById("modalContent").innerHTML = html;
  document.getElementById("modalOverlay").classList.add("show");
  const cancelBtn = document.getElementById("btnCancelarModal");
  if (cancelBtn) cancelBtn.onclick = closeModal;
}
function closeModal() {
  detenerCamaraScanner(); // por si el modal abierto era el del escáner
  document.getElementById("modalOverlay").classList.remove("show");
  document.getElementById("modalContent").innerHTML = "";
}
document.getElementById("modalOverlay").addEventListener("click", (e) => {
  if (e.target.id === "modalOverlay") closeModal();
});

/* ---- Ajustar puntos a mano (error, devolución, regalo) ---- */
function openAjusteModal(clienteId, nombreCliente, puntosActuales) {
  openModal(`
    <h3>Ajustar puntos</h3>
    <p class="hint">${escapeHtml(nombreCliente)} tiene actualmente ${puntosActuales} puntos.</p>
    <div class="field">
      <label>Cantidad (usa negativo para restar)</label>
      <input type="number" id="ajustePuntosInput" placeholder="Ej: 20 ó -20">
      <div class="desc">Positivo suma puntos (ej: regalo), negativo resta (ej: corregir un error).</div>
    </div>
    <div class="field">
      <label>Motivo (opcional, queda en el historial)</label>
      <input type="text" id="ajusteMotivoInput" placeholder="Ej: Regalo de cumpleaños">
    </div>
    <div class="actions-row">
      <button class="btn btn-primary" id="btnConfirmarAjuste">Guardar ajuste</button>
      <button class="btn btn-ghost" id="btnCancelarModal">Cancelar</button>
    </div>
  `);
  document.getElementById("btnConfirmarAjuste").onclick = () =>
    confirmarAjuste(clienteId, nombreCliente);
}

async function confirmarAjuste(clienteId, nombreCliente) {
  const cantidad = Number(document.getElementById("ajustePuntosInput").value);
  if (!cantidad) {
    showToast("Ingresa una cantidad distinta de cero", true);
    return;
  }
  const motivo = document.getElementById("ajusteMotivoInput").value.trim();
  try {
    await updateDoc(clienteDoc(distrito, tiendaId, clienteId), {
      puntos: increment(cantidad),
    });
    await addDoc(canjesCol(distrito, tiendaId), {
      tipo: "ajuste",
      cliente: nombreCliente,
      clienteId,
      recompensa:
        motivo ||
        (cantidad > 0 ? "Ajuste manual (suma)" : "Ajuste manual (resta)"),
      puntos: cantidad,
      fecha: new Date().toISOString(),
      sucursal: distrito,
    });
    closeModal();
    showToast(
      cantidad > 0
        ? `Se sumaron ${cantidad} puntos`
        : `Se restaron ${Math.abs(cantidad)} puntos`,
    );
    loadHistorial();
  } catch (err) {
    showToast("Error: " + err.message, true);
  }
}

/* ---- Registrar un canje presencial ---- */
function openCanjeModal(clienteId, nombreCliente, puntosActuales) {
  if (!descuentosCache.length) {
    openModal(`
      <h3>Canjear recompensa</h3>
      <p class="hint">Esta tienda todavía no tiene productos a canjear configurados. Ve a la pestaña «Productos a canjear» para crear uno primero.</p>
      <div class="actions-row">
        <button class="btn btn-ghost" id="btnCancelarModal">Cerrar</button>
      </div>
    `);
    return;
  }
  const options = descuentosCache
    .map((d) => {
      const costo = Number(d.costoPuntos) || 0;
      const insuficiente = costo > puntosActuales;
      return `<option value="${d.id}" ${insuficiente ? "disabled" : ""}>${escapeHtml(d.nombre)} — ${costo} pts${insuficiente ? " (puntos insuficientes)" : ""}</option>`;
    })
    .join("");
  openModal(`
    <h3>Canjear recompensa</h3>
    <p class="hint">${escapeHtml(nombreCliente)} tiene ${puntosActuales} puntos disponibles.</p>
    <div class="field">
      <label>Recompensa</label>
      <select class="field-input" id="canjeSelect">${options}</select>
    </div>
    <div class="actions-row">
      <button class="btn btn-primary" id="btnConfirmarCanje">Confirmar canje</button>
      <button class="btn btn-ghost" id="btnCancelarModal">Cancelar</button>
    </div>
  `);
  document.getElementById("btnConfirmarCanje").onclick = () =>
    confirmarCanje(clienteId, nombreCliente, puntosActuales);
}

async function confirmarCanje(clienteId, nombreCliente, puntosActuales) {
  const sel = document.getElementById("canjeSelect");
  const desc = descuentosCache.find((d) => d.id === sel.value);
  if (!desc) {
    showToast("Elige una recompensa", true);
    return;
  }
  const costo = Number(desc.costoPuntos) || 0;
  if (puntosActuales < costo) {
    showToast("El cliente no tiene puntos suficientes", true);
    return;
  }
  try {
    await updateDoc(clienteDoc(distrito, tiendaId, clienteId), {
      puntos: increment(-costo),
    });
    await addDoc(canjesCol(distrito, tiendaId), {
      tipo: "canje",
      cliente: nombreCliente,
      clienteId,
      recompensa: desc.nombre,
      puntos: -costo,
      fecha: new Date().toISOString(),
      sucursal: distrito,
    });
    closeModal();
    showToast("Canje registrado");
    loadHistorial();
  } catch (err) {
    showToast("Error: " + err.message, true);
  }
}

/* ===================================================================
   ESCÁNER DE CLIENTE (QR / código de barras) — vía librería html5-qrcode
   Requiere: <script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>
   en el <head> del HTML.
   =================================================================== */
let html5QrScanner = null; // instancia activa de Html5Qrcode (cámara en vivo)

const FORMATOS_SOPORTADOS =
  typeof Html5QrcodeSupportedFormats !== "undefined"
    ? [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.ITF,
      ]
    : undefined;

document
  .getElementById("btnEscanearCliente")
  .addEventListener("click", abrirEscanerCliente);

async function abrirEscanerCliente() {
  openModal(`
    <h3>Escanear cliente</h3>
    <p class="hint">Apunta la cámara al código QR o de barras del cliente.</p>

    <div id="scannerContainer" style="border-radius:12px; overflow:hidden; background:#000; min-height:260px;"></div>
    <p class="hint" id="scannerEstado" style="margin-top:10px;">Iniciando cámara…</p>

    <div class="field" style="margin-top:12px;">
      <label>¿La cámara no lee bien? Sube o toma una foto del código</label>
      <input type="file" id="scannerArchivoInput" accept="image/*" capture="environment">
    </div>

    <div class="field" style="margin-top:8px;">
      <label>O escribe el código, ID o teléfono manualmente</label>
      <div style="display:flex; gap:8px;">
        <input type="text" id="scannerManualInput" placeholder="Código, ID o teléfono">
        <button class="btn btn-sm btn-primary" id="btnScannerManualBuscar">Buscar</button>
      </div>
    </div>

    <div class="actions-row">
      <button class="btn btn-ghost" id="btnCancelarModal">Cerrar</button>
    </div>
  `);

  document.getElementById("btnScannerManualBuscar").onclick = () => {
    const val = document.getElementById("scannerManualInput").value.trim();
    if (!val) {
      showToast("Escribe un código o teléfono", true);
      return;
    }
    detenerCamaraScanner();
    closeModal();
    buscarClientePorCodigo(val);
  };
  document
    .getElementById("scannerManualInput")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter")
        document.getElementById("btnScannerManualBuscar").click();
    });

  document
    .getElementById("scannerArchivoInput")
    .addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) escanearDesdeArchivo(file);
    });

  await iniciarCamaraScanner();
}

async function iniciarCamaraScanner() {
  const estadoEl = document.getElementById("scannerEstado");
  if (typeof Html5Qrcode === "undefined") {
    if (estadoEl)
      estadoEl.textContent =
        "No se pudo cargar el lector de códigos. Usa la opción de subir foto o buscar manualmente.";
    showToast("No se pudo cargar la librería del escáner", true);
    return;
  }

  html5QrScanner = new Html5Qrcode("scannerContainer", {
    formatsToSupport: FORMATOS_SOPORTADOS,
    verbose: false,
  });

  const onExito = (decodedText) => {
    detenerCamaraScanner();
    closeModal();
    buscarClientePorCodigo(decodedText);
  };
  const onFallo = () => {
    /* se llama en cada frame sin detección, no hacer nada */
  };

  const config = {
    fps: 10,
    qrbox: (viewfinderW, viewfinderH) => {
      const tam = Math.floor(Math.min(viewfinderW, viewfinderH) * 0.7);
      return { width: tam, height: tam };
    },
    aspectRatio: 1.33,
  };

  try {
    // Intenta cámara trasera primero (celulares)
    await html5QrScanner.start(
      { facingMode: "environment" },
      config,
      onExito,
      onFallo,
    );
    if (estadoEl) estadoEl.textContent = "Cámara lista · apunta al código";
  } catch (errTrasera) {
    try {
      // Si falla (ej. laptop sin cámara trasera), usa la primera cámara disponible
      const camaras = await Html5Qrcode.getCameras();
      if (!camaras.length) throw new Error("Sin cámaras disponibles");
      await html5QrScanner.start(
        { deviceId: { exact: camaras[0].id } },
        config,
        onExito,
        onFallo,
      );
      if (estadoEl) estadoEl.textContent = "Cámara lista · apunta al código";
    } catch (errCualquiera) {
      console.error(errTrasera, errCualquiera);
      if (estadoEl)
        estadoEl.textContent =
          "No se pudo acceder a la cámara. Usa la opción de subir foto o buscar manualmente.";
      showToast("No se pudo acceder a la cámara", true);
    }
  }
}

async function escanearDesdeArchivo(file) {
  const estadoEl = document.getElementById("scannerEstado");
  if (typeof Html5Qrcode === "undefined") {
    showToast("No se pudo cargar la librería del escáner", true);
    return;
  }
  // Usamos una instancia temporal para no chocar con la cámara en vivo si sigue activa
  const lectorArchivo = new Html5Qrcode("scannerContainer", {
    formatsToSupport: FORMATOS_SOPORTADOS,
    verbose: false,
  });
  try {
    const resultado = await lectorArchivo.scanFile(file, false);
    detenerCamaraScanner();
    closeModal();
    buscarClientePorCodigo(resultado);
  } catch (err) {
    console.error(err);
    if (estadoEl)
      estadoEl.textContent =
        "No se detectó ningún código en la imagen. Intenta con otra foto o escribe el código a mano.";
    showToast("No se pudo leer el código de la imagen", true);
  } finally {
    try {
      await lectorArchivo.clear();
    } catch {
      /* noop */
    }
  }
}

function detenerCamaraScanner() {
  if (!html5QrScanner) return;
  const instancia = html5QrScanner;
  html5QrScanner = null;
  instancia
    .stop()
    .then(() => instancia.clear())
    .catch(() => {
      try {
        instancia.clear();
      } catch {
        /* noop */
      }
    });
}

function buscarClientePorCodigo(codigo) {
  const cod = String(codigo || "").trim();
  if (!cod) return;
  const soloDigitos = cod.replace(/\D/g, "");
  const exacto = clientesRowsCache.find(
    (c) =>
      c.id === cod ||
      (soloDigitos && String(c.telefono).replace(/\D/g, "") === soloDigitos),
  );
  document.getElementById("buscarCliente").value = exacto ? exacto.nombre : cod;
  paginaClientesActual = 1;
  aplicarFiltrosClientes();
  if (exacto)
    showToast(`Cliente encontrado: ${exacto.nombre} · ${exacto.puntos} puntos`);
  else showToast("Código leído, mostrando resultados de búsqueda", true);
}

/* ---- NUEVO: ver los pedidos reales (compras) de un cliente, solo texto ---- */
function openHistorialModal(clienteId, nombreCliente) {
  const info = historialPorCliente[clienteId];
  if (!info || !info.pedidos.length) {
    openModal(`
      <h3>Pedidos de ${escapeHtml(nombreCliente)}</h3>
      <p class="hint">Este cliente todavía no tiene pedidos registrados en su historial.</p>
      <div class="actions-row">
        <button class="btn btn-ghost" id="btnCancelarModal">Cerrar</button>
      </div>
    `);
    return;
  }

  const filas = info.pedidos
    .map((p) => {
      const productosTxt = p.productos.length
        ? p.productos
            .map((prod) => {
              const sub =
                prod.subtotal != null
                  ? Number(prod.subtotal)
                  : Number(prod.precio_unitario || 0) *
                    Number(prod.cantidad || 1);
              return `${Number(prod.cantidad) || 1}x ${escapeHtml(prod.nombre || "(sin nombre)")} — S/ ${sub.toFixed(2)}`;
            })
            .join("<br>")
        : "(sin detalle de productos)";
      return `
      <div class="item-row" style="align-items:flex-start;">
        <div class="item-main">
          <div class="item-title">${p.fechaTxt} · S/ ${p.total.toFixed(2)} ${p.tipo_entrega ? "· " + escapeHtml(p.tipo_entrega) : ""}</div>
          <div class="item-sub" style="margin-top:5px; line-height:1.6;">${productosTxt}</div>
          <div class="item-sub" style="margin-top:6px; color:var(--success); font-weight:600;">+${p.puntos_ganados || 0} puntos ganados</div>
        </div>
      </div>`;
    })
    .join("");

  openModal(`
    <h3>Pedidos de ${escapeHtml(nombreCliente)}</h3>
    <p class="hint">${info.pedidos.length} pedido(s) registrado(s) · Total invertido: S/ ${info.totalInvertido.toFixed(2)}</p>
    <div class="item-list" style="max-height:380px; overflow-y:auto; padding-right:4px;">${filas}</div>
    <div class="actions-row">
      <button class="btn btn-ghost" id="btnCancelarModal">Cerrar</button>
    </div>
  `);
}

/* ===================================================================
   EXPORTAR A CSV
   =================================================================== */
function downloadCSV(filename, headers, rows) {
  const escapeCSV = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lineas = [headers.map(escapeCSV).join(",")];
  rows.forEach((r) => lineas.push(r.map(escapeCSV).join(",")));
  const csv = "\uFEFF" + lineas.join("\r\n"); // BOM para que Excel lea bien los acentos
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById("btnExportarClientes").addEventListener("click", () => {
  if (!clientesRowsFiltrados.length) {
    showToast("No hay clientes para exportar (revisa el filtro)", true);
    return;
  }
  const headers = [
    "Nombre",
    "Teléfono",
    "Puntos",
    "Pedidos",
    "Invertido (S/)",
    "Última visita",
    "Estado",
  ];
  const rows = clientesRowsFiltrados.map((c) => [
    c.nombre,
    c.telefono,
    c.puntos,
    c.pedidosCount,
    c.totalInvertido.toFixed(2),
    c.ultimaVisitaTxt,
    c.estadoTexto,
  ]);
  downloadCSV(
    `clientes_${distrito}_${tiendaId || "sin-tienda"}.csv`,
    headers,
    rows,
  );
});

/* ---- Exportar clientes a PDF (usa el diálogo de impresión del navegador,
   así no dependemos de ninguna librería externa: el cliente elige "Guardar
   como PDF" como destino). Exporta lo que está filtrado/ordenado en pantalla. ---- */
document
  .getElementById("btnExportarClientesPDF")
  .addEventListener("click", () => {
    if (!clientesRowsFiltrados.length) {
      showToast("No hay clientes para exportar (revisa el filtro)", true);
      return;
    }
    const filas = clientesRowsFiltrados
      .map(
        (c) => `
    <tr>
      <td>${escapeHtml(c.nombre)}</td>
      <td>${escapeHtml(String(c.telefono))}</td>
      <td>${c.puntos}</td>
      <td>${c.pedidosCount}</td>
      <td>S/ ${c.totalInvertido.toFixed(2)}</td>
      <td>${c.ultimaVisitaTxt}</td>
      <td>${c.estadoTexto}</td>
    </tr>`,
      )
      .join("");
    const ventana = window.open("", "_blank");
    if (!ventana) {
      showToast(
        "El navegador bloqueó la ventana. Habilita pop-ups para exportar en PDF.",
        true,
      );
      return;
    }
    ventana.document.write(`
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Clientes ${escapeHtml(distrito)}</title>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; padding: 28px; color: #111; }
          h1 { font-size: 18px; margin: 0 0 2px; }
          p.sub { color: #555; font-size: 12px; margin: 0 0 18px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #ccc; padding: 6px 9px; text-align: left; }
          th { background: #f2f2f2; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>Clientes — ${escapeHtml(distrito)}</h1>
        <p class="sub">Generado el ${new Date().toLocaleString("es-PE")} · ${clientesRowsFiltrados.length} cliente(s)</p>
        <table>
          <thead>
            <tr><th>Cliente</th><th>Teléfono</th><th>Puntos</th><th>Pedidos</th><th>Invertido</th><th>Última visita</th><th>Estado</th></tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </body>
    </html>
  `);
    ventana.document.close();
    ventana.focus();
    setTimeout(() => ventana.print(), 300);
  });

document
  .getElementById("btnExportarHistorial")
  .addEventListener("click", () => {
    if (!historialDataCache.length) {
      showToast("No hay historial cargado para exportar", true);
      return;
    }
    const headers = [
      "Fecha",
      "Cliente",
      "Recompensa",
      "Puntos",
      "Sucursal",
      "Tipo",
    ];
    const rows = historialDataCache.map((c) => [
      c.fecha,
      c.cliente,
      c.recompensa,
      c.puntos,
      c.sucursal,
      c.tipo,
    ]);
    downloadCSV(
      `historial_${distrito}_${tiendaId || "sin-tienda"}.csv`,
      headers,
      rows,
    );
  });

/* ===================================================================
   AYUDAS PARA NOMBRE / FECHA DE USUARIO
   =================================================================== */
function capitalizar(texto) {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}
function formatearFecha(timestamp) {
  try {
    const fecha = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(fecha.getTime())) return "—";
    return fecha.toLocaleDateString("es-PE");
  } catch {
    return "—";
  }
}

/* ===================================================================
   CLIENTES
   Tiendas/.../distrito/<distrito>/tiendas/<tiendaId>/clientes
   El nombre y teléfono reales viven en el usuario vinculado por "id_usuario"
   (Trabajadores_Usuarios_Drivers/users/users/<id_usuario>, vía data_user_logeado).

   NUEVO: por cada cliente también leemos su subcolección "historial"
   (sus pedidos reales, con productos y total) para:
   - mostrar cuántos pedidos hizo y cuánto ha invertido en total (solo texto)
   - detectar al cliente más fiel (el que más ha invertido) para el stat
   =================================================================== */
let unsubscribeClientes = null;
let clientesListoInicial = false;

function watchClientesRealtime() {
  if (unsubscribeClientes) {
    unsubscribeClientes();
    unsubscribeClientes = null;
  }
  clientesListoInicial = false;

  const tbody = document.getElementById("tablaClientes");
  if (!firebaseReady) return;
  if (!tiendaId) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align:center; color:var(--text-faint);">Falta el id de la tienda en la URL.</td></tr>';
    updateStats("—", "—", "—", "—", "—");
    return;
  }

  tbody.innerHTML =
    '<tr><td colspan="7" style="text-align:center; color:var(--text-faint);">Cargando…</td></tr>';
  const rutaClientes = tiendaPathStr(distrito, "tiendas", tiendaId, "clientes");

  unsubscribeClientes = onSnapshot(
    clientesCol(distrito, tiendaId),
    async (snap) => {
      const huboNuevo =
        clientesListoInicial &&
        snap.docChanges().some((ch) => ch.type === "added");

      await pintarTablaClientes(snap);

      if (!clientesListoInicial) {
        clientesListoInicial = true;
        return;
      }

      if (huboNuevo) {
        try {
          window.parent.postMessage(
            { type: "NUEVO_CLIENTE_FIDELIZACION", tiendaId, distrito },
            window.location.origin,
          );
        } catch (e) {
          console.warn("No se pudo notificar al panel:", e);
        }
      }
    },
    (err) => {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--danger);">Error: ${escapeHtml(err.message)}</td></tr>`;
    },
  );
}

function toDateSafe(value) {
  try {
    const fecha = value?.toDate ? value.toDate() : new Date(value);
    return isNaN(fecha.getTime()) ? null : fecha;
  } catch {
    return null;
  }
}

/* ---- WhatsApp: normaliza el teléfono a formato E.164 sin "+" (lo que pide wa.me) ----
   Casos que maneja:
   - "+ 937659216"      -> 9 dígitos, sin código de país -> le antepone 51
   - "+51 937659216"     -> ya viene con 51 -> se deja igual
   - "937659216"         -> igual que el primer caso
   - cualquier otro largo -> se deja tal cual (puede ser de otro país) */
function normalizarTelefonoWhatsapp(telefonoRaw) {
  if (!telefonoRaw) return null;
  const digits = String(telefonoRaw).replace(/\D/g, ""); // deja solo números
  if (!digits) return null;
  if (digits.startsWith("51") && digits.length >= 11) return digits; // ya tiene código de Perú
  if (digits.length === 9) return "51" + digits; // celular peruano sin código de país
  return digits; // fallback: lo mandamos tal cual
}

function whatsappLink(telefonoRaw, mensaje) {
  const numero = normalizarTelefonoWhatsapp(telefonoRaw);
  if (!numero) return null;
  const texto = mensaje ? `?text=${encodeURIComponent(mensaje)}` : "";
  return `https://wa.me/${numero}${texto}`;
}

async function pintarTablaClientes(snap) {
  const tbody = document.getElementById("tablaClientes");
  historialPorCliente = {};
  clientesRowsCache = [];

  if (snap.empty) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align:center; color:var(--text-faint);">No hay clientes registrados en esta tienda.</td></tr>';
    updateStats(0, 0, 0, 0, "—");
    return;
  }

  const clientesData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Cargamos en paralelo: datos del usuario vinculado + historial de pedidos de cada cliente
  const [usuarios, historiales] = await Promise.all([
    Promise.all(
      clientesData.map(async (c) => {
        if (!c.id_usuario) return null;
        try {
          const uSnap = await getDoc(data_user_logeado(c.id_usuario));
          return uSnap.exists() ? uSnap.data() : null;
        } catch (e) {
          console.warn(
            "[fidelizacion] No se pudo leer usuario",
            c.id_usuario,
            e,
          );
          return null;
        }
      }),
    ),
    Promise.all(
      clientesData.map(async (c) => {
        try {
          const hSnap = await getDocs(
            clienteHistorialCol(distrito, tiendaId, c.id),
          );
          return hSnap.docs.map((d) => d.data());
        } catch (e) {
          console.warn("[fidelizacion] No se pudo leer historial de", c.id, e);
          return [];
        }
      }),
    ),
  ]);

  let totalPuntos = 0,
    cerca = 0;
  let topCliente = null; // { nombre, totalInvertido } — el que más ha invertido

  clientesData.forEach((c, i) => {
    const usuario = usuarios[i] || {};
    const nombre =
      [capitalizar(usuario.nombre), capitalizar(usuario.apellido)]
        .filter(Boolean)
        .join(" ") ||
      usuario.nombre_user ||
      c.nombre ||
      "Sin nombre";
    const contacto = usuario.contacto || {};
    const codPais = contacto.cod_telefonico
      ? `+${contacto.cod_telefonico.replace(/\D/g, "")} `
      : "";
    const telefono = contacto.numero_user
      ? `${codPais}${contacto.numero_user}`
      : usuario.telefono || usuario.celular || c.telefono || "—";
    const puntos = Number(c.puntos ?? c.sellos ?? 0);
    totalPuntos += puntos || 0;
    if (puntos >= (c.metaCantidad || 80)) cerca++;
    const iniciales = (
      nombre
        .split(" ")
        .map((s) => s[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("") || "?"
    ).toUpperCase();
    const estadoTexto = c.activo === false ? "Inactivo" : "Activo";

    // --- Pedidos reales de este cliente (subcolección "historial") ---
    const pedidosRaw = historiales[i] || [];
    const pedidos = pedidosRaw
      .map((p) => ({
        fechaTxt: p.fecha ? formatearFecha(p.fecha) : "—",
        fechaOrden: p.fecha?.toDate ? p.fecha.toDate() : new Date(p.fecha || 0),
        productos: Array.isArray(p.productos) ? p.productos : [],
        total: Number(p.total) || 0,
        tipo_entrega: p.tipo_entrega || "",
        puntos_ganados: Number(p.puntos_ganados) || 0,
      }))
      .sort((a, b) => b.fechaOrden - a.fechaOrden); // más reciente primero
    const totalInvertido = pedidos.reduce((acc, p) => acc + p.total, 0);
    historialPorCliente[c.id] = {
      pedidos,
      totalInvertido,
      pedidosCount: pedidos.length,
    };

    if (
      pedidos.length &&
      (!topCliente || totalInvertido > topCliente.totalInvertido)
    ) {
      topCliente = { nombre, totalInvertido, telefono };
    }

    // "Última visita": usa el campo guardado si existe; si no, cae al pedido más reciente
    // del historial real — así el filtro de hoy/semana/mes refleja compras de verdad.
    let ultimaVisitaDate = c.ultimaVisita
      ? toDateSafe(c.ultimaVisita)
      : c.fecha_inicio
        ? toDateSafe(c.fecha_inicio)
        : null;
    if (!ultimaVisitaDate && pedidos.length)
      ultimaVisitaDate = pedidos[0].fechaOrden;
    const ultimaVisitaTxt = ultimaVisitaDate
      ? ultimaVisitaDate.toLocaleDateString("es-PE")
      : "—";

    clientesRowsCache.push({
      id: c.id,
      nombre,
      telefono,
      iniciales,
      puntos,
      pedidosCount: pedidos.length,
      totalInvertido,
      ultimaVisitaDate,
      ultimaVisitaTxt,
      estadoTexto,
      activo: c.activo,
    });
  });

  updateStats(
    clientesData.length,
    totalPuntos,
    "—",
    cerca,
    topCliente
      ? {
          texto: `${topCliente.nombre} · S/ ${topCliente.totalInvertido.toFixed(2)}`,
          nombre: topCliente.nombre,
          telefono: topCliente.telefono,
        }
      : { texto: "Sin pedidos aún", telefono: null },
  );

  aplicarFiltrosClientes();
}

/* ---- Buscar por nombre/teléfono/ID + filtrar por última visita + ordenar ---- */
function aplicarFiltrosClientes() {
  const term = (document.getElementById("buscarCliente")?.value || "")
    .trim()
    .toLowerCase();
  const filtroFecha =
    document.getElementById("filtroUltimaVisita")?.value || "todos";
  const orden = document.getElementById("ordenClientes")?.value || "nombre";

  const ahora = new Date();
  const inicioHoy = new Date(
    ahora.getFullYear(),
    ahora.getMonth(),
    ahora.getDate(),
  );
  const inicioSemana = new Date(inicioHoy);
  inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay()); // domingo de esta semana
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

  let filtrados = clientesRowsCache.filter((c) => {
    const matchTexto =
      !term ||
      c.nombre.toLowerCase().includes(term) ||
      String(c.telefono).toLowerCase().includes(term) ||
      String(c.id).toLowerCase().includes(term); // también busca por ID de Firestore
    if (!matchTexto) return false;

    if (filtroFecha === "todos") return true;
    if (!c.ultimaVisitaDate) return false; // sin fecha conocida no entra en filtros de fecha
    if (filtroFecha === "hoy") return c.ultimaVisitaDate >= inicioHoy;
    if (filtroFecha === "semana") return c.ultimaVisitaDate >= inicioSemana;
    if (filtroFecha === "mes") return c.ultimaVisitaDate >= inicioMes;
    return true;
  });

  filtrados = filtrados.sort((a, b) => {
    switch (orden) {
      case "puntos_desc":
        return b.puntos - a.puntos;
      case "invertido_desc":
        return b.totalInvertido - a.totalInvertido;
      case "pedidos_desc":
        return b.pedidosCount - a.pedidosCount;
      case "visita_reciente":
        return (
          (b.ultimaVisitaDate?.getTime() || 0) -
          (a.ultimaVisitaDate?.getTime() || 0)
        );
      case "nombre":
      default:
        return a.nombre.localeCompare(b.nombre, "es");
    }
  });

  clientesRowsFiltrados = filtrados;
  paginaClientesActual = 1; // cada vez que cambia el filtro/orden, volvemos a la página 1
  renderTablaClientes(filtrados);
}

function renderTablaClientes(rows) {
  const tbody = document.getElementById("tablaClientes");
  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align:center; color:var(--text-faint);">Ningún cliente coincide con la búsqueda o el filtro.</td></tr>';
    renderPaginacionClientes(0);
    return;
  }

  const totalPaginas = Math.max(
    1,
    Math.ceil(rows.length / CLIENTES_POR_PAGINA),
  );
  if (paginaClientesActual > totalPaginas) paginaClientesActual = totalPaginas;
  const inicio = (paginaClientesActual - 1) * CLIENTES_POR_PAGINA;
  const pagina = rows.slice(inicio, inicio + CLIENTES_POR_PAGINA);

  tbody.innerHTML = pagina
    .map((c) => {
      const nombreAttr = escapeHtml(c.nombre).replace(/"/g, "&quot;");
      return `<tr>
    <td class="cell-name" data-label="Cliente"><span class="avatar">${c.iniciales}</span>${escapeHtml(c.nombre)}</td>
    <td data-label="Teléfono">${escapeHtml(String(c.telefono))}</td>
    <td data-label="Puntos">${c.puntos}</td>
    <td data-label="Pedidos">${c.pedidosCount} · S/ ${c.totalInvertido.toFixed(2)}</td>
    <td data-label="Última visita">${c.ultimaVisitaTxt}</td>
    <td data-label="Estado"><span class="badge ${c.activo === false ? "off" : "on"}">${c.estadoTexto}</span></td>
    <td data-label="Acciones" style="white-space:nowrap;">
      ...
    </td>
  </tr>`;
    })
    .join("");

  wireClienteActions();
  renderPaginacionClientes(rows.length);
}

function renderPaginacionClientes(totalItems) {
  const cont = document.getElementById("paginacionClientes");
  if (!cont) return;
  if (!totalItems) {
    cont.innerHTML = "";
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(totalItems / CLIENTES_POR_PAGINA));
  const inicio = (paginaClientesActual - 1) * CLIENTES_POR_PAGINA + 1;
  const fin = Math.min(totalItems, paginaClientesActual * CLIENTES_POR_PAGINA);

  cont.innerHTML = `
    <span style="font-size:12px; color:var(--text-faint);">Mostrando ${inicio}–${fin} de ${totalItems} clientes</span>
    <div style="display:flex; gap:6px; align-items:center;">
      <button class="btn btn-sm" id="btnPagAnterior" ${paginaClientesActual <= 1 ? "disabled" : ""}>← Anterior</button>
      <span style="font-size:12px; color:var(--text-dim);">Página ${paginaClientesActual} de ${totalPaginas}</span>
      <button class="btn btn-sm" id="btnPagSiguiente" ${paginaClientesActual >= totalPaginas ? "disabled" : ""}>Siguiente →</button>
    </div>
  `;

  document.getElementById("btnPagAnterior").onclick = () => {
    if (paginaClientesActual > 1) {
      paginaClientesActual--;
      renderTablaClientes(clientesRowsFiltrados);
    }
  };
  document.getElementById("btnPagSiguiente").onclick = () => {
    if (paginaClientesActual < totalPaginas) {
      paginaClientesActual++;
      renderTablaClientes(clientesRowsFiltrados);
    }
  };
}

function wireClienteActions() {
  document.querySelectorAll('[data-action="ajustar"]').forEach((btn) => {
    btn.onclick = () =>
      openAjusteModal(
        btn.dataset.id,
        btn.dataset.nombre,
        Number(btn.dataset.puntos),
      );
  });
  document.querySelectorAll('[data-action="canjear"]').forEach((btn) => {
    btn.onclick = () =>
      openCanjeModal(
        btn.dataset.id,
        btn.dataset.nombre,
        Number(btn.dataset.puntos),
      );
  });
  document.querySelectorAll('[data-action="pedidos"]').forEach((btn) => {
    btn.onclick = () => openHistorialModal(btn.dataset.id, btn.dataset.nombre);
  });
}
function updateStats(clientes, puntos, canjes, cerca, clienteFiel) {
  document.getElementById("statClientes").textContent = clientes;
  document.getElementById("statPuntos").textContent = puntos;
  document.getElementById("statCanjes").textContent = canjes;
  document.getElementById("statCerca").textContent = cerca;

  const elFiel = document.getElementById("statClienteFiel");
  const btnWa = document.getElementById("btnWhatsappClienteFiel");
  // Acepta tanto un string simple (ej: "—") como { texto, nombre, telefono }
  const info =
    typeof clienteFiel === "string"
      ? { texto: clienteFiel, telefono: null }
      : clienteFiel || { texto: "—", telefono: null };

  if (elFiel) elFiel.textContent = info.texto ?? "—";

  if (btnWa) {
    const mensaje =
      `Hola ${info.nombre || ""}, gracias por ser uno de nuestros clientes más fieles 🎉 Tenemos una promoción especial para ti.`
        .replace(/\s+/g, " ")
        .trim();
    const link = info.telefono ? whatsappLink(info.telefono, mensaje) : null;
    if (link) {
      btnWa.href = link;
      btnWa.style.display = "inline-flex";
    } else {
      btnWa.removeAttribute("href");
      btnWa.style.display = "none";
    }
  }
}
document
  .getElementById("btnRecargarClientes")
  .addEventListener("click", watchClientesRealtime);
document
  .getElementById("buscarCliente")
  .addEventListener("input", aplicarFiltrosClientes);
document
  .getElementById("filtroUltimaVisita")
  ?.addEventListener("change", aplicarFiltrosClientes);
document
  .getElementById("ordenClientes")
  ?.addEventListener("change", aplicarFiltrosClientes);

/* ===================================================================
   HISTORIAL DE CANJES
   Tiendas/.../distrito/<distrito>/tiendas/<tiendaId>/canjes
   =================================================================== */
async function loadHistorial() {
  const tbody = document.getElementById("tablaHistorial");
  if (!firebaseReady) return;
  historialDataCache = [];
  if (!tiendaId) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center; color:var(--text-faint);">Falta el id de la tienda en la URL.</td></tr>';
    return;
  }
  tbody.innerHTML =
    '<tr><td colspan="6" style="text-align:center; color:var(--text-faint);">Cargando…</td></tr>';
  const rutaCanjes = tiendaPathStr(distrito, "tiendas", tiendaId, "canjes");
  try {
    const snap = await getDocs(canjesCol(distrito, tiendaId));
    if (snap.empty) {
      tbody.innerHTML =
        '<tr><td colspan="6" style="text-align:center; color:var(--text-faint);">Sin canjes registrados en esta tienda.</td></tr>';
      return;
    }
    let rows = "";
    // Más recientes primero
    const docsData = snap.docs
      .map((d) => d.data())
      .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
    docsData.forEach((c) => {
      const fechaTxt = c.fecha ? formatearFecha(c.fecha) : "—";
      // Compatibilidad con registros antiguos que usaban "puntosUsados" (siempre positivo, gastado)
      const puntos =
        c.puntos != null
          ? Number(c.puntos)
          : c.puntosUsados != null
            ? -Number(c.puntosUsados)
            : 0;
      const tipo = c.tipo || "canje";
      const tipoLabel = tipo === "ajuste" ? "Ajuste" : "Canje";
      const puntosTxt = (puntos > 0 ? "+" : "") + puntos;
      rows += `<tr>
        <td>${fechaTxt}</td>
        <td class="cell-name">${escapeHtml(c.cliente || "—")}</td>
        <td>${escapeHtml(c.recompensa || "—")}</td>
        <td>${puntosTxt}</td>
        <td>${escapeHtml(c.sucursal || distrito)}</td>
        <td><span class="badge ${tipo === "ajuste" ? "badge-tipo-ajuste" : "badge-tipo-canje"}">${tipoLabel}</span></td>
      </tr>`;
      historialDataCache.push({
        fecha: fechaTxt,
        cliente: c.cliente || "—",
        recompensa: c.recompensa || "—",
        puntos: puntosTxt,
        sucursal: c.sucursal || distrito,
        tipo: tipoLabel,
      });
    });
    tbody.innerHTML = rows;
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--danger);">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}
document
  .getElementById("btnRecargarHistorial")
  .addEventListener("click", loadHistorial);
document.getElementById("buscarCanje").addEventListener("input", (e) => {
  const term = e.target.value.toLowerCase();
  document.querySelectorAll("#tablaHistorial tr").forEach((tr) => {
    tr.style.display = tr.textContent.toLowerCase().includes(term)
      ? ""
      : "none";
  });
});

/* ===================================================================
   CARGAR CONFIGURACIÓN EXISTENTE AL INICIAR
   =================================================================== */
async function loadConfig() {
  if (!firebaseReady) return;
  if (!tiendaId) return;
  try {
    const snap = await getDoc(currentConfigDoc());
    if (!snap.exists()) return;
    const d = snap.data().fidelizacion || {};
    if (typeof d.activo === "boolean") {
      document.getElementById("toggleActivo").checked = d.activo;
      document.getElementById("estadoBadge").textContent = d.activo
        ? "Activa"
        : "Inactiva";
      document.getElementById("estadoBadge").className =
        "badge " + (d.activo ? "on" : "off");
    }
    if (d.mensajeInactivo)
      document.getElementById("mensajeInactivo").value = d.mensajeInactivo;
    if (typeof d.vencimientoActivo === "boolean")
      document.getElementById("toggleVencimiento").checked =
        d.vencimientoActivo;
    if (d.diasVencimiento != null)
      document.getElementById("diasVencimiento").value = d.diasVencimiento;
    if (d.diasAviso != null)
      document.getElementById("diasAviso").value = d.diasAviso;
  } catch (err) {
    console.error("No se pudo cargar la configuración:", err);
  }
}

function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        m
      ],
  );
}

/* ===================================================================
   INIT
   Ya no hay selector de tienda: tiendaId viene por parámetro de URL
   (ej: fidelizacion.html?tiendaId=fW7W8RsgkkQ3IYfxKHGR).
   =================================================================== */
function initApp() {
  document.getElementById("resumenDistrito").textContent = distrito;

  if (!tiendaId) {
    showToast("Falta el id de la tienda en la URL (?tiendaId=...)", true);
    resetCategorias();
    loadDescuentos();
    watchClientesRealtime();
    loadHistorial();
    return;
  }
  loadCategorias();
  loadDescuentos();
  loadConfig();
  watchClientesRealtime();
  loadHistorial();
}
initApp();
