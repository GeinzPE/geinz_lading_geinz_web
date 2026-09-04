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
  canjesCol,
  data_user_logeado,
} from "../rutas/rutas.js";
import {
  getDoc, getDocs, setDoc, updateDoc,
  addDoc, deleteDoc, onSnapshot, increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// db ya viene inicializado desde db.js, así que si existe, estamos listos.
const firebaseReady = !!db;
if (!firebaseReady) {
  console.warn("No se pudo obtener 'db' desde db.js. Revisa la ruta del import.");
}

/* ===================================================================
   ESTADO GENERAL
   distrito: por ahora fijo (igual que en rutas.js), tiendaId: se
   obtiene por parámetro de URL, ej: fidelizacion.html?tiendaId=fW7W8RsgkkQ3IYfxKHGR
   =================================================================== */

const _urlParams = new URLSearchParams(window.location.search);
let tiendaId = _urlParams.get("id") || sessionStorage.getItem("tiendaId");
let distrito = _urlParams.get("localidad") || sessionStorage.getItem("localidad") || "barranca";

let categoriaSeleccionada = "";
let productosCache = {}; // productoId -> data del producto en catálogo
let descuentosCache = []; // productos/recompensas a canjear de la tienda actual, para el modal de canje
let clientesDataCache = []; // clientes ya resueltos (con nombre/teléfono), para exportar a CSV
let historialDataCache = []; // filas del historial ya renderizadas, para exportar a CSV
let editandoDescuentoId = null; // si no es null, el próximo "agregar" hace update en vez de create

function validarCamposBeneficio(tipo) {
  if (tipo === "monto") {
    const v = Number(document.getElementById("descuentoMontoCatalogo").value);
    if (!v || v <= 0) return "Ingresa el monto de descuento (S/)";
  } else if (tipo === "porcentaje") {
    const v = Number(document.getElementById("descuentoPorcentajeCatalogo").value);
    if (!v || v <= 0 || v > 100) return "Ingresa un porcentaje válido (1–100)";
  } else if (tipo === "cantidad") {
    const compra = Number(document.getElementById("descuentoCantidadCompra").value);
    const paga = Number(document.getElementById("descuentoCantidadPaga").value);
    if (!compra || !paga || paga >= compra) return "Ingresa unidades de compra y paga válidas (paga menor que compra)";
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
  estado: ["Estado y vencimiento", "Activa la tarjeta de fidelidad y controla la caducidad de los puntos acumulados."],
  descuentos: ["Productos a canjear", "Crea y administra lo que tus clientes pueden canjear con puntos."],
  clientes: ["Clientes y puntos", "Consulta el saldo de puntos y sellos de cada cliente."],
  historial: ["Historial de canjes", "Revisa las recompensas ya canjeadas."],
};

document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
    item.classList.add("active");
    const key = item.dataset.panel;
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    document.getElementById("panel-" + key).classList.add("active");
    document.getElementById("topbarTitle").textContent = titles[key][0];
    document.getElementById("topbarSub").textContent = titles[key][1];
    item.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
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
  if (loadingCount === 0) document.getElementById("topProgressBar")?.classList.remove("active");
}
function setBtnBusy(btn, busyText) {
  if (!btn) return () => { };
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
  if (!firebaseReady) { showToast("No se pudo conectar con la base de datos", true); return; }
  if (!tiendaId) { showToast("Falta el id de la tienda en la URL", true); return; }
  showLoading();
  try {
    // merge:true hace merge profundo del map "fidelizacion", así que guardar
    // solo activo/mensajeInactivo no borra vencimientoActivo/diasVencimiento (o viceversa)
    await setDoc(currentConfigDoc(), { fidelizacion: payload }, { merge: true });
    document.getElementById("resumenFecha").textContent = new Date().toLocaleString("es-PE");
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
  document.getElementById("estadoBadge").textContent = e.target.checked ? "Activa" : "Inactiva";
  document.getElementById("estadoBadge").className = "badge " + (e.target.checked ? "on" : "off");
});
document.querySelector('[data-save="estado"]').addEventListener("click", async (e) => {
  const restore = setBtnBusy(e.currentTarget, "Guardando…");
  await saveField({
    activo: document.getElementById("toggleActivo").checked,
    mensajeInactivo: document.getElementById("mensajeInactivo").value,
    vencimientoActivo: document.getElementById("toggleVencimiento").checked,
    diasVencimiento: Number(document.getElementById("diasVencimiento").value),
    diasAviso: Number(document.getElementById("diasAviso").value),
  }, "Estado y vencimiento");
  restore();
});

/* ===================================================================
   PRODUCTOS A CANJEAR — selector de origen (catálogo vs texto libre)
   =================================================================== */
document.querySelectorAll(".mode-card").forEach(card => {
  card.addEventListener("click", () => {
    document.querySelectorAll(".mode-card").forEach(c => c.classList.remove("selected"));
    card.classList.add("selected");
    const origen = card.dataset.origen;
    document.getElementById("modo-catalogo").style.display = origen === "catalogo" ? "block" : "none";
    document.getElementById("modo-manual").style.display = origen === "manual" ? "block" : "none";
  });
});

/* ---- Tipo de beneficio (gratis / monto / porcentaje / cantidad) ---- */
function actualizarCamposTipoBeneficio() {
  const tipo = document.getElementById("tipoBeneficioCatalogo").value;
  document.getElementById("camposDescuentoMontoCatalogo").style.display = tipo === "monto" ? "grid" : "none";
  document.getElementById("camposDescuentoPorcentajeCatalogo").style.display = tipo === "porcentaje" ? "grid" : "none";
  document.getElementById("camposDescuentoCantidadCatalogo").style.display = tipo === "cantidad" ? "grid" : "none";
  actualizarPreviewPrecioFinal();
}
document.getElementById("tipoBeneficioCatalogo").addEventListener("change", actualizarCamposTipoBeneficio);
["descuentoMontoCatalogo", "descuentoPorcentajeCatalogo", "descuentoCantidadCompra", "descuentoCantidadPaga"].forEach(id => {
  document.getElementById(id).addEventListener("input", actualizarPreviewPrecioFinal);
});

function actualizarPreviewPrecioFinal() {
  const wrap = document.getElementById("previewPrecioFinalCatalogo");
  const texto = document.getElementById("previewPrecioFinalTexto");
  const prodSel = document.getElementById("prodDelCatalogo");
  const id = prodSel.value;
  const tipo = document.getElementById("tipoBeneficioCatalogo").value;
  if (!id || !productosCache[id] || productosCache[id].precio == null) { wrap.style.display = "none"; return; }
  const precio = Number(productosCache[id].precio);
  if (tipo === "gratis") {
    texto.textContent = `Precio original S/ ${precio.toFixed(2)} · el cliente lo lleva gratis con sus puntos`;
    wrap.style.display = "flex";
  } else if (tipo === "monto") {
    const desc = Number(document.getElementById("descuentoMontoCatalogo").value) || 0;
    const final = Math.max(0, precio - desc);
    texto.textContent = `Precio original S/ ${precio.toFixed(2)} → paga S/ ${final.toFixed(2)} (descuento S/ ${desc.toFixed(2)})`;
    wrap.style.display = "flex";
  } else if (tipo === "porcentaje") {
    const pct = Number(document.getElementById("descuentoPorcentajeCatalogo").value) || 0;
    const final = Math.max(0, precio * (1 - pct / 100));
    texto.textContent = `Precio original S/ ${precio.toFixed(2)} → paga S/ ${final.toFixed(2)} (${pct}% de descuento)`;
    wrap.style.display = "flex";
  } else if (tipo === "cantidad") {
    const compra = Number(document.getElementById("descuentoCantidadCompra").value) || 0;
    const paga = Number(document.getElementById("descuentoCantidadPaga").value) || 0;
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
  if (!tiendaId) { catSel.innerHTML = '<option value="">Falta el id de la tienda</option>'; return; }
  catSel.innerHTML = '<option value="">Cargando categorías…</option>';
  if (!firebaseReady) return;
  const rutaCategorias = tiendaPathStr(distrito, "tiendas", tiendaId, "productos");
  console.log("[fidelizacion] Consultando categorías en:", rutaCategorias);
  try {
    const snap = await getDocs(categoriasCol(distrito, tiendaId));
    console.log(`[fidelizacion] Categorías encontradas (${snap.size}):`, snap.docs.map(d => ({ id: d.id, ...d.data() })));
    if (snap.empty) {
      catSel.innerHTML = '<option value="">Sin categorías en esta tienda</option>';
      return;
    }
    catSel.innerHTML = '<option value="">Elige una categoría</option>';
    snap.forEach(d => {
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
  console.log("[fidelizacion] Categoría seleccionada:", categoriaSeleccionada);
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
  const rutaProductos = tiendaPathStr(distrito, "tiendas", tiendaId, "productos", categoriaSeleccionada, categoriaSeleccionada);
  console.log("[fidelizacion] Consultando productos en:", rutaProductos);
  try {
    const snap = await getDocs(productosDeCategoriaCol(distrito, tiendaId, categoriaSeleccionada));
    console.log(`[fidelizacion] Productos encontrados (${snap.size}):`, snap.docs.map(d => ({ id: d.id, ...d.data() })));
    productosCache = {};
    if (snap.empty) {
      prodSel.innerHTML = '<option value="">Sin productos en esta categoría</option>';
      return;
    }
    prodSel.innerHTML = '<option value="">Elige un producto</option>';
    snap.forEach(d => {
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
  const imgUrl = (Array.isArray(p.imagenes) && p.imagenes[0] && p.imagenes[0].url) ? p.imagenes[0].url : "";
  if (imgUrl) {
    imgEl.src = imgUrl;
    imgEl.style.display = "block";
  } else {
    imgEl.removeAttribute("src");
    imgEl.style.display = "none";
  }
  document.getElementById("prodPreviewNombre").textContent = p.nombre || "(sin nombre)";
  let sub = p.precio != null ? `S/ ${p.precio}` : "Sin precio";
  if (p.disponible === false) sub += " · No disponible";
  document.getElementById("prodPreviewPrecio").textContent = sub;
  prev.style.display = "flex";
}

/* ===================================================================
   DESCUENTOS / PRODUCTOS A CANJEAR (guardado en Firestore, vía rutas.js)
   Tiendas/.../distrito/<distrito>/tiendas/<tiendaId>/descuentos/<id>
   =================================================================== */
document.getElementById("btnAgregarDescuento").addEventListener("click", async (e) => {
  const nombre = document.getElementById("descNombre").value.trim();
  const valor = document.getElementById("descValor").value.trim();
  const costo = document.getElementById("descCosto").value;
  if (!nombre) { showToast("Escribe un nombre para el descuento", true); return; }
  if (!costo || Number(costo) <= 0) { showToast("Ingresa el costo en puntos", true); return; }
  if (!tiendaId) { showToast("Falta el id de la tienda en la URL", true); return; }
  if (!firebaseReady) { showToast("No se pudo conectar con la base de datos", true); return; }
  const restore = setBtnBusy(e.currentTarget, editandoDescuentoId ? "Guardando…" : "Agregando…");
  showLoading();
  try {
    const payload = { origen: "manual", nombre, valor, costoPuntos: Number(costo) || 0 };
    if (editandoDescuentoId) {
      await updateDoc(tiendaDescuentoDoc(distrito, tiendaId, editandoDescuentoId), payload);
      showToast("Descuento actualizado");
      editandoDescuentoId = null;
      document.getElementById("btnAgregarDescuento").textContent = "Agregar producto";
    } else {
      payload.creado = new Date().toISOString();
      await addDoc(tiendaDescuentosCol(distrito, tiendaId), payload);
      showToast("Descuento agregado");
    }
    document.getElementById("descNombre").value = "";
    document.getElementById("descValor").value = "";
    document.getElementById("descCosto").value = "";
    await loadDescuentos();
  } catch (err) { showToast("Error: " + err.message, true); }
  finally { hideLoading(); restore(); }
});

document.getElementById("btnAgregarDesdeCatalogo").addEventListener("click", async (e) => {
  const prodSel = document.getElementById("prodDelCatalogo");
  const id = prodSel.value;
  const costo = document.getElementById("descCostoCatalogo").value;
  const tipoBeneficio = document.getElementById("tipoBeneficioCatalogo").value;
  if (!editandoDescuentoId && (!id || !productosCache[id])) { showToast("Elige un producto del catálogo", true); return; }
  if (!costo || Number(costo) <= 0) { showToast("Ingresa el costo en puntos", true); return; }
  const errorBeneficio = validarCamposBeneficio(tipoBeneficio);
  if (errorBeneficio) { showToast(errorBeneficio, true); return; }
  if (!tiendaId) { showToast("Falta el id de la tienda en la URL", true); return; }
  if (!firebaseReady) { showToast("No se pudo conectar con la base de datos", true); return; }
  const p = productosCache[id] || {};
  const imgUrl = (Array.isArray(p.imagenes) && p.imagenes[0] && p.imagenes[0].url) ? p.imagenes[0].url : "";
  const precioOriginal = p.precio != null ? Number(p.precio) : null;
  // Construye el bloque de descuento según el tipo elegido
  let descuento = { tipo: tipoBeneficio };
  let precioFinalEstimado = precioOriginal;
  if (tipoBeneficio === "monto") {
    const monto = Number(document.getElementById("descuentoMontoCatalogo").value) || 0;
    descuento.monto = monto;
    if (precioOriginal != null) precioFinalEstimado = Math.max(0, precioOriginal - monto);
  } else if (tipoBeneficio === "porcentaje") {
    const pct = Number(document.getElementById("descuentoPorcentajeCatalogo").value) || 0;
    descuento.porcentaje = pct;
    if (precioOriginal != null) precioFinalEstimado = Math.max(0, precioOriginal * (1 - pct / 100));
  } else if (tipoBeneficio === "cantidad") {
    const compra = Number(document.getElementById("descuentoCantidadCompra").value) || 0;
    const paga = Number(document.getElementById("descuentoCantidadPaga").value) || 0;
    descuento.compraUnidades = compra;
    descuento.pagaUnidades = paga;
  } else {
    precioFinalEstimado = 0; // gratis
  }

  const restore = setBtnBusy(e.currentTarget, editandoDescuentoId ? "Guardando…" : "Agregando…");
  showLoading();
  try {
    const payload = {
      tipoBeneficio,       // "gratis" | "monto" | "porcentaje" | "cantidad"
      descuento,           // detalle según el tipo (monto, porcentaje, o compra/paga)
      precioFinalEstimado,
      costoPuntos: Number(costo) || 0
    };
    if (editandoDescuentoId) {
      await updateDoc(tiendaDescuentoDoc(distrito, tiendaId, editandoDescuentoId), payload);
      showToast("Producto actualizado");
      editandoDescuentoId = null;
      document.getElementById("btnAgregarDesdeCatalogo").textContent = "Agregar desde catálogo";
    } else {
      await addDoc(tiendaDescuentosCol(distrito, tiendaId), {
        origen: "catalogo",
        productoId: id,
        categoria: categoriaSeleccionada,
        nombre: p.nombre || "(sin nombre)",
        precioOriginal,
        imagenUrl: imgUrl,
        creado: new Date().toISOString(),
        ...payload
      });
      showToast("Producto agregado desde catálogo");
    }
    document.getElementById("descCostoCatalogo").value = "";
    document.getElementById("descuentoMontoCatalogo").value = "";
    document.getElementById("descuentoPorcentajeCatalogo").value = "";
    document.getElementById("descuentoCantidadCompra").value = "";
    document.getElementById("descuentoCantidadPaga").value = "";
    await loadDescuentos();
  } catch (err) { showToast("Error: " + err.message, true); }
  finally { hideLoading(); restore(); }
});

async function loadDescuentos() {
  const cont = document.getElementById("listaDescuentos");
  descuentosCache = [];
  if (!firebaseReady) return;
  if (!tiendaId) {
    cont.innerHTML = '<div class="empty-state">Falta el id de la tienda en la URL (?tiendaId=...).</div>';
    return;
  }
  try {
    const snap = await getDocs(tiendaDescuentosCol(distrito, tiendaId));
    if (snap.empty) {
      cont.innerHTML = '<div class="empty-state">Aún no hay productos. Crea el primero desde la izquierda.</div>';
      return;
    }
    cont.innerHTML = "";
    snap.forEach(d => {
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

      cont.insertAdjacentHTML("beforeend", `
        <div class="item-row" data-id="${d.id}" style="cursor:pointer;">
          <div class="item-icon">${iconContent}</div>
          <div class="item-main">
            <div class="item-title">${escapeHtml(data.nombre)} ${origenBadge}</div>
            <div class="item-sub">${data.costoPuntos || 0} puntos${precioTxt ? " · " + escapeHtml(String(precioTxt)) : ""}</div>
          </div>
          <div class="item-remove" data-id="${d.id}" data-col="descuentos"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M18 6L6 18M6 6l12 12"/></svg></div>
        </div>`);
    });
    wireRemoveButtons();
    wireEditRows();
  } catch (err) { console.error(err); }
}

function wireRemoveButtons() {
  document.querySelectorAll(".item-remove").forEach(btn => {
    btn.onclick = async (ev) => {
      ev.stopPropagation(); // no disparar la edición del item-row al eliminar
      btn.style.pointerEvents = "none";
      btn.style.opacity = "0.4";
      showLoading();
      try {
        await deleteDoc(tiendaDescuentoDoc(distrito, tiendaId, btn.dataset.id));
        showToast("Eliminado");
        await loadDescuentos();
      } catch (err) { showToast("Error: " + err.message, true); }
      finally { hideLoading(); }
    };
  });
}

function wireEditRows() {
  document.querySelectorAll("#listaDescuentos .item-row[data-id]").forEach(row => {
    row.onclick = (ev) => {
      if (ev.target.closest(".item-remove")) return;
      const data = descuentosCache.find(d => d.id === row.dataset.id);
      if (data) cargarDescuentoParaEditar(data);
    };
  });
}

function cargarDescuentoParaEditar(data) {
  editandoDescuentoId = data.id;
  const esCatalogo = data.origen === "catalogo";

  document.querySelectorAll(".mode-card").forEach(c => c.classList.remove("selected"));
  if (esCatalogo) {
    document.getElementById("origenCatalogo").classList.add("selected");
    document.getElementById("modo-catalogo").style.display = "block";
    document.getElementById("modo-manual").style.display = "none";

    document.getElementById("tipoBeneficioCatalogo").value = data.tipoBeneficio || "gratis";
    actualizarCamposTipoBeneficio();
    document.getElementById("descuentoMontoCatalogo").value = data.descuento?.monto ?? "";
    document.getElementById("descuentoPorcentajeCatalogo").value = data.descuento?.porcentaje ?? "";
    document.getElementById("descuentoCantidadCompra").value = data.descuento?.compraUnidades ?? "";
    document.getElementById("descuentoCantidadPaga").value = data.descuento?.pagaUnidades ?? "";
    document.getElementById("descCostoCatalogo").value = data.costoPuntos ?? "";
    document.getElementById("btnAgregarDesdeCatalogo").textContent = "Guardar cambios";
  } else {
    document.getElementById("origenManual").classList.add("selected");
    document.getElementById("modo-catalogo").style.display = "none";
    document.getElementById("modo-manual").style.display = "block";

    document.getElementById("descNombre").value = data.nombre || "";
    document.getElementById("descValor").value = data.valor || "";
    document.getElementById("descCosto").value = data.costoPuntos ?? "";
    document.getElementById("btnAgregarDescuento").textContent = "Guardar cambios";
  }

  document.getElementById("origenCatalogo").scrollIntoView({ behavior: "smooth", block: "center" });
  showToast("Editando: " + (data.nombre || "producto"));
}

/* ===================================================================
   AGREGAR CLIENTE MANUALMENTE
   Tiendas/.../distrito/<distrito>/tiendas/<tiendaId>/clientes/<id>
   =================================================================== */
document.getElementById("btnAgregarCliente").addEventListener("click", async () => {
  const nombre = document.getElementById("nuevoClienteNombre").value.trim();
  const telefono = document.getElementById("nuevoClienteTelefono").value.trim();
  const puntosIniciales = Number(document.getElementById("nuevoClientePuntos").value) || 0;
  if (!nombre) { showToast("Escribe el nombre del cliente", true); return; }
  if (!tiendaId) { showToast("Falta el id de la tienda en la URL", true); return; }
  if (!firebaseReady) { showToast("No se pudo conectar con la base de datos", true); return; }
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
  } catch (err) { showToast("Error: " + err.message, true); }
});

/* ===================================================================
   MODAL GENÉRICO (ajustar puntos / canjear recompensa)
   =================================================================== */
function openModal(html) {
  document.getElementById("modalContent").innerHTML = html;
  document.getElementById("modalOverlay").classList.add("show");
  const cancelBtn = document.getElementById("btnCancelarModal");
  if (cancelBtn) cancelBtn.onclick = closeModal;
}
function closeModal() {
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
  document.getElementById("btnConfirmarAjuste").onclick = () => confirmarAjuste(clienteId, nombreCliente);
}

async function confirmarAjuste(clienteId, nombreCliente) {
  const cantidad = Number(document.getElementById("ajustePuntosInput").value);
  if (!cantidad) { showToast("Ingresa una cantidad distinta de cero", true); return; }
  const motivo = document.getElementById("ajusteMotivoInput").value.trim();
  try {
    await updateDoc(clienteDoc(distrito, tiendaId, clienteId), { puntos: increment(cantidad) });
    await addDoc(canjesCol(distrito, tiendaId), {
      tipo: "ajuste",
      cliente: nombreCliente,
      clienteId,
      recompensa: motivo || (cantidad > 0 ? "Ajuste manual (suma)" : "Ajuste manual (resta)"),
      puntos: cantidad,
      fecha: new Date().toISOString(),
      sucursal: distrito,
    });
    closeModal();
    showToast(cantidad > 0 ? `Se sumaron ${cantidad} puntos` : `Se restaron ${Math.abs(cantidad)} puntos`);
    loadHistorial();
  } catch (err) { showToast("Error: " + err.message, true); }
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
  const options = descuentosCache.map(d => {
    const costo = Number(d.costoPuntos) || 0;
    const insuficiente = costo > puntosActuales;
    return `<option value="${d.id}" ${insuficiente ? "disabled" : ""}>${escapeHtml(d.nombre)} — ${costo} pts${insuficiente ? " (puntos insuficientes)" : ""}</option>`;
  }).join("");
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
  document.getElementById("btnConfirmarCanje").onclick = () => confirmarCanje(clienteId, nombreCliente, puntosActuales);
}

async function confirmarCanje(clienteId, nombreCliente, puntosActuales) {
  const sel = document.getElementById("canjeSelect");
  const desc = descuentosCache.find(d => d.id === sel.value);
  if (!desc) { showToast("Elige una recompensa", true); return; }
  const costo = Number(desc.costoPuntos) || 0;
  if (puntosActuales < costo) { showToast("El cliente no tiene puntos suficientes", true); return; }
  try {
    await updateDoc(clienteDoc(distrito, tiendaId, clienteId), { puntos: increment(-costo) });
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
  } catch (err) { showToast("Error: " + err.message, true); }
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
  rows.forEach(r => lineas.push(r.map(escapeCSV).join(",")));
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
  if (!clientesDataCache.length) { showToast("No hay clientes cargados para exportar", true); return; }
  const headers = ["Nombre", "Teléfono", "Puntos", "Última visita", "Estado"];
  const rows = clientesDataCache.map(c => [c.nombre, c.telefono, c.puntos, c.ultimaVisita, c.estado]);
  downloadCSV(`clientes_${distrito}_${tiendaId || "sin-tienda"}.csv`, headers, rows);
});

document.getElementById("btnExportarHistorial").addEventListener("click", () => {
  if (!historialDataCache.length) { showToast("No hay historial cargado para exportar", true); return; }
  const headers = ["Fecha", "Cliente", "Recompensa", "Puntos", "Sucursal", "Tipo"];
  const rows = historialDataCache.map(c => [c.fecha, c.cliente, c.recompensa, c.puntos, c.sucursal, c.tipo]);
  downloadCSV(`historial_${distrito}_${tiendaId || "sin-tienda"}.csv`, headers, rows);
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
   =================================================================== */
let unsubscribeClientes = null;
let clientesListoInicial = false;

function watchClientesRealtime() {
  if (unsubscribeClientes) { unsubscribeClientes(); unsubscribeClientes = null; }
  clientesListoInicial = false;

  const tbody = document.getElementById("tablaClientes");
  if (!firebaseReady) return;
  if (!tiendaId) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-faint);">Falta el id de la tienda en la URL.</td></tr>';
    updateStats("—", "—", "—", "—");
    return;
  }

  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-faint);">Cargando…</td></tr>';
  const rutaClientes = tiendaPathStr(distrito, "tiendas", tiendaId, "clientes");
  console.log("[fidelizacion] Escuchando clientes en:", rutaClientes);

  unsubscribeClientes = onSnapshot(clientesCol(distrito, tiendaId), async (snap) => {
    const huboNuevo = clientesListoInicial &&
      snap.docChanges().some(ch => ch.type === "added");

    await pintarTablaClientes(snap);

    if (!clientesListoInicial) {
      clientesListoInicial = true;
      return;
    }

    if (huboNuevo) {
      try {
        window.parent.postMessage(
          { type: "NUEVO_CLIENTE_FIDELIZACION", tiendaId, distrito },
          window.location.origin
        );
      } catch (e) { console.warn("No se pudo notificar al panel:", e); }
    }
  }, (err) => {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--danger);">Error: ${escapeHtml(err.message)}</td></tr>`;
  });
}

async function pintarTablaClientes(snap) {
  const tbody = document.getElementById("tablaClientes");
  clientesDataCache = [];

  if (snap.empty) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-faint);">No hay clientes registrados en esta tienda.</td></tr>';
    updateStats(0, 0, 0, 0);
    return;
  }

  const clientesData = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const usuarios = await Promise.all(clientesData.map(async (c) => {
    if (!c.id_usuario) return null;
    try {
      const uSnap = await getDoc(data_user_logeado(c.id_usuario));
      return uSnap.exists() ? uSnap.data() : null;
    } catch (e) {
      console.warn("[fidelizacion] No se pudo leer usuario", c.id_usuario, e);
      return null;
    }
  }));

  let rows = "", totalPuntos = 0, cerca = 0;
  clientesData.forEach((c, i) => {
    const usuario = usuarios[i] || {};
    const nombre = [capitalizar(usuario.nombre), capitalizar(usuario.apellido)].filter(Boolean).join(" ")
      || usuario.nombre_user || c.nombre || "Sin nombre";
    const contacto = usuario.contacto || {};
    const codPais = contacto.cod_telefonico ? `+${contacto.cod_telefonico.replace(/\D/g, "")} ` : "";
    const telefono = contacto.numero_user ? `${codPais}${contacto.numero_user}` : (usuario.telefono || usuario.celular || c.telefono || "—");
    const puntos = Number(c.puntos ?? c.sellos ?? 0);
    totalPuntos += puntos || 0;
    if (puntos >= (c.metaCantidad || 80)) cerca++;
    const iniciales = (nombre.split(" ").map(s => s[0]).filter(Boolean).slice(0, 2).join("") || "?").toUpperCase();
    const ultimaVisita = c.ultimaVisita ? formatearFecha(c.ultimaVisita) : (c.fecha_inicio ? formatearFecha(c.fecha_inicio) : "—");
    const estadoTexto = c.activo === false ? "Inactivo" : "Activo";
    const nombreAttr = escapeHtml(nombre).replace(/"/g, "&quot;");
    rows += `<tr>
        <td class="cell-name"><span class="avatar">${iniciales}</span>${escapeHtml(nombre)}</td>
        <td>${escapeHtml(String(telefono))}</td>
        <td>${puntos}</td>
        <td>${ultimaVisita}</td>
        <td><span class="badge ${c.activo === false ? "off" : "on"}">${estadoTexto}</span></td>
        <td style="white-space:nowrap;">
          <button class="btn btn-sm btn-ghost" data-action="ajustar" data-id="${c.id}" data-nombre="${nombreAttr}" data-puntos="${puntos}">Ajustar</button>
          <button class="btn btn-sm btn-primary" data-action="canjear" data-id="${c.id}" data-nombre="${nombreAttr}" data-puntos="${puntos}">Canjear</button>
        </td>
      </tr>`;
    clientesDataCache.push({ nombre, telefono, puntos, ultimaVisita, estado: estadoTexto });
  });
  tbody.innerHTML = rows;
  updateStats(clientesData.length, totalPuntos, "—", cerca);
  wireClienteActions();
}

function wireClienteActions() {
  document.querySelectorAll('[data-action="ajustar"]').forEach(btn => {
    btn.onclick = () => openAjusteModal(btn.dataset.id, btn.dataset.nombre, Number(btn.dataset.puntos));
  });
  document.querySelectorAll('[data-action="canjear"]').forEach(btn => {
    btn.onclick = () => openCanjeModal(btn.dataset.id, btn.dataset.nombre, Number(btn.dataset.puntos));
  });
}
function updateStats(clientes, puntos, canjes, cerca) {
  document.getElementById("statClientes").textContent = clientes;
  document.getElementById("statPuntos").textContent = puntos;
  document.getElementById("statCanjes").textContent = canjes;
  document.getElementById("statCerca").textContent = cerca;
}
document.getElementById("btnRecargarClientes").addEventListener("click", watchClientesRealtime);
document.getElementById("buscarCliente").addEventListener("input", (e) => {
  const term = e.target.value.toLowerCase();
  document.querySelectorAll("#tablaClientes tr").forEach(tr => {
    tr.style.display = tr.textContent.toLowerCase().includes(term) ? "" : "none";
  });
});

/* ===================================================================
   HISTORIAL DE CANJES
   Tiendas/.../distrito/<distrito>/tiendas/<tiendaId>/canjes
   =================================================================== */
async function loadHistorial() {
  const tbody = document.getElementById("tablaHistorial");
  if (!firebaseReady) return;
  historialDataCache = [];
  if (!tiendaId) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-faint);">Falta el id de la tienda en la URL.</td></tr>';
    return;
  }
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-faint);">Cargando…</td></tr>';
  const rutaCanjes = tiendaPathStr(distrito, "tiendas", tiendaId, "canjes");
  console.log("[fidelizacion] Consultando canjes en:", rutaCanjes);
  try {
    const snap = await getDocs(canjesCol(distrito, tiendaId));
    console.log(`[fidelizacion] Canjes encontrados (${snap.size}):`, snap.docs.map(d => ({ id: d.id, ...d.data() })));
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-faint);">Sin canjes registrados en esta tienda.</td></tr>';
      return;
    }
    let rows = "";
    // Más recientes primero
    const docsData = snap.docs.map(d => d.data()).sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
    docsData.forEach(c => {
      const fechaTxt = c.fecha ? formatearFecha(c.fecha) : "—";
      // Compatibilidad con registros antiguos que usaban "puntosUsados" (siempre positivo, gastado)
      const puntos = c.puntos != null ? Number(c.puntos) : (c.puntosUsados != null ? -Number(c.puntosUsados) : 0);
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
      historialDataCache.push({ fecha: fechaTxt, cliente: c.cliente || "—", recompensa: c.recompensa || "—", puntos: puntosTxt, sucursal: c.sucursal || distrito, tipo: tipoLabel });
    });
    tbody.innerHTML = rows;
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--danger);">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}
document.getElementById("btnRecargarHistorial").addEventListener("click", loadHistorial);
document.getElementById("buscarCanje").addEventListener("input", (e) => {
  const term = e.target.value.toLowerCase();
  document.querySelectorAll("#tablaHistorial tr").forEach(tr => {
    tr.style.display = tr.textContent.toLowerCase().includes(term) ? "" : "none";
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
      document.getElementById("estadoBadge").textContent = d.activo ? "Activa" : "Inactiva";
      document.getElementById("estadoBadge").className = "badge " + (d.activo ? "on" : "off");
    }
    if (d.mensajeInactivo) document.getElementById("mensajeInactivo").value = d.mensajeInactivo;
    if (typeof d.vencimientoActivo === "boolean") document.getElementById("toggleVencimiento").checked = d.vencimientoActivo;
    if (d.diasVencimiento != null) document.getElementById("diasVencimiento").value = d.diasVencimiento;
    if (d.diasAviso != null) document.getElementById("diasAviso").value = d.diasAviso;
  } catch (err) { console.error("No se pudo cargar la configuración:", err); }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
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