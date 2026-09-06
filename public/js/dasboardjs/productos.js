import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { db, storage } from "../db/db.js";
import { tiendaDoc, tiendaSubDoc, tiendaSubCol } from "../rutas/rutas.js";
import { initImportador } from "../dasboardjs/import_producto.js";

/* ---------------- Adaptación de textos según categoría de negocio ---------------- */
// Esto NO cambia la estructura de datos ni los campos: solo adapta los textos de
// ejemplo/placeholder para que el panel se sienta natural en cualquier rubro
// (licorerías, supermercados, panaderías, pastelerías, cafeterías, moda, tecnología,
// jardinería, mascotas, hogar, ferretería, belleza, etc.), no solo restaurantes.
function normalizarCategoria(cat) {
  return (cat || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

let categoriaTienda = sessionStorage.getItem("categoriaTienda") || null;
let esRestaurante =
  normalizarCategoria(categoriaTienda) === "comida y restaurantes";

const TEXTOS_RESTAURANTE = {
  catEjemplo: "Ejemplo: Jaleas, Chaufas, Bebidas, Promociones.",
  catPlaceholder: "Ej. Platos Marinos",
  prodNombrePlaceholder: "Ej. Jalea Mixta",
  prodDescPlaceholder:
    "Ej. Acompañado de yuca frita, sarsa criolla y tártara casera.",
  condicionesLabel: "Condiciones",
  condNombrePlaceholder: "Ej. Partes",
  opcionPlaceholder: "Ej. Pecho",
};

// Textos genéricos: sirven para cualquier tipo de negocio (bodega, panadería,
// pastelería, cafetería, licorería, moda, tecnología, mascotas, hogar, belleza, etc.)
const TEXTOS_GENERAL = {
  catEjemplo: "Ejemplo: Ofertas, Nuevos, Más vendidos, Combos.",
  catPlaceholder: "Ej. Nombre de la categoría",
  prodNombrePlaceholder: "Ej. Nombre del producto",
  prodDescPlaceholder:
    "Ej. Marca, presentación o características del producto.",
  condicionesLabel: "Variantes",
  condNombrePlaceholder: "Ej. Talla, Color, Presentación",
  opcionPlaceholder: "Ej. M",
};

function textosActuales() {
  return esRestaurante ? TEXTOS_RESTAURANTE : TEXTOS_GENERAL;
}

function aplicarTextosPorCategoria() {
  const t = textosActuales();
  const catEjemploEl = document.getElementById("cat-ejemplo-text");
  if (catEjemploEl) catEjemploEl.textContent = t.catEjemplo;
  const catInput = document.getElementById("input-cat-nombre");
  if (catInput) catInput.placeholder = t.catPlaceholder;
  const prodNombreInput = document.getElementById("input-prod-nombre");
  if (prodNombreInput) prodNombreInput.placeholder = t.prodNombrePlaceholder;
  const prodDescInput = document.getElementById("input-prod-descripcion");
  if (prodDescInput) prodDescInput.placeholder = t.prodDescPlaceholder;
  const labelCondiciones = document.getElementById("label-condiciones");
  if (labelCondiciones)
    labelCondiciones.textContent = `${t.condicionesLabel} (máx. 5)`;
}
aplicarTextosPorCategoria();

let tiendaId = sessionStorage.getItem("tiendaId");
let localidad = sessionStorage.getItem("localidad");

window.addEventListener("message", (e) => {
  if (e.data?.tipo !== "DATOS_TIENDA") return;

  tiendaId = e.data.tiendaId;
  localidad = e.data.localidad;
  if (tiendaId) sessionStorage.setItem("tiendaId", tiendaId);
  if (localidad) sessionStorage.setItem("localidad", localidad);

  if (e.data.categoriaTienda) {
    categoriaTienda = e.data.categoriaTienda;
    sessionStorage.setItem("categoriaTienda", categoriaTienda);
    esRestaurante =
      normalizarCategoria(categoriaTienda) === "comida y restaurantes";
    aplicarTextosPorCategoria();
  }

  actualizarVisibilidadCarta();
});
const TIENDA_ID_STORAGE = tiendaId;
const tiendaDocRef = tiendaDoc(localidad, "tiendas", tiendaId);
const categoriasRef = collection(tiendaDocRef, "productos");

let fidelizacionActiva = false;

async function cargarFidelizacion() {
  try {
    const snap = await getDoc(tiendaDocRef);
    const data = snap.data() || {};
    fidelizacionActiva = !!data.fidelizacion?.activo;
    document
      .getElementById("puntos-section")
      ?.classList.toggle("hidden", !fidelizacionActiva);
  } catch (err) {
    console.error(err);
  }
}
cargarFidelizacion();
function productosRef(categoriaId) {
  return collection(doc(categoriasRef, categoriaId), categoriaId);
}
function storagePathProducto(productoId) {
  return `tiendas/${TIENDA_ID_STORAGE}/productos/${productoId}`;
}

/* ---------------- Notifications ---------------- */
const toastWrap = document.getElementById("toast-wrap");
function toast(msg, type = "") {
  const isError = type === "error";
  const el = document.createElement("div");
  el.className = `pointer-events-auto animate-toastIn w-full sm:w-auto sm:min-w-[220px] rounded-xl border px-4 py-3 text-xs font-medium shadow-2xl backdrop-blur-md transition-all
    ${
      isError
        ? "bg-rose-950/90 border-rose-500/40 text-rose-200"
        : "bg-[#0d0a17]/90 border-violet-500/40 text-purple-100"
    }`;
  el.textContent = msg;
  toastWrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    setTimeout(() => el.remove(), 200);
  }, 3000);
}

/* ---------------- Modal Controls ---------------- */
function openOverlay(id) {
  document.getElementById(id).classList.add("show");
}
function closeOverlay(id) {
  document.getElementById(id).classList.remove("show");
}
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => closeOverlay(btn.dataset.close));
});
document.querySelectorAll(".overlay").forEach((ov) => {
  ov.addEventListener("click", (e) => {
    if (e.target === ov) closeOverlay(ov.id);
  });
});

/* ---------------- Tabs del modal de producto (Básico / Avanzado) ---------------- */
function activarTabProducto(targetId) {
  document
    .querySelectorAll(".tab-btn-form")
    .forEach((b) =>
      b.classList.toggle("active-tab", b.dataset.tabTarget === targetId),
    );
  document
    .querySelectorAll(".tab-panel-form")
    .forEach((p) => p.classList.toggle("active-tab-panel", p.id === targetId));
}
document.querySelectorAll(".tab-btn-form").forEach((btn) => {
  btn.addEventListener("click", () =>
    activarTabProducto(btn.dataset.tabTarget),
  );
});
let confirmCallback = null;
function askConfirm(title, body, onConfirm) {
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-body").textContent = body;
  confirmCallback = onConfirm;
  openOverlay("overlay-confirm");
}

// FIX: el botón de confirmar ahora muestra spinner mientras elimina,
// y se re-habilita siempre (antes se quedaba "colgado" si el callback tardaba o el modal se cerraba a medias).
document
  .getElementById("btn-confirm-action")
  .addEventListener("click", async () => {
    const btn = document.getElementById("btn-confirm-action");
    const label = document.getElementById("btn-confirm-action-label");
    const originalText = label.textContent;
    btn.disabled = true;
    label.innerHTML = '<span class="spinner"></span>';
    try {
      if (confirmCallback) await confirmCallback();
      closeOverlay("overlay-confirm");
    } catch (err) {
      console.error(err);
      toast("Ocurrió un error al intentar eliminar.", "error");
    } finally {
      btn.disabled = false;
      label.textContent = originalText;
      confirmCallback = null;
    }
  });

/* ---------------- Splash Screen Control ---------------- */
const splashGallery = document.getElementById("splash-gallery");
const splashTotalImgs = document.getElementById("splash-total-imgs");
const splashTotalProds = document.getElementById("splash-total-prods");
const loadedImageUrls = new Set();
let splashDismissed = false;

function updateSplashAndCheckDismiss() {
  if (splashDismissed) return;

  if (loadedImageUrls.size > 0) {
    splashGallery.innerHTML = "";
    const sliceImgs = Array.from(loadedImageUrls).slice(-5);
    sliceImgs.forEach((url) => {
      const img = document.createElement("img");
      img.src = url;
      img.loading = "lazy";
      img.className =
        "w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-2xl border border-purple-800/40 shadow-xl transition-all duration-300 animate-fadeIn";
      splashGallery.appendChild(img);
    });
  }

  setTimeout(() => {
    const splash = document.getElementById("splash-screen");
    if (splash && !splashDismissed) {
      splashDismissed = true;
      splash.classList.add("hide");
    }
  }, 500);
}

/* ---------------- Estado de Filtros (Todos, Activos, Agotados, Stock bajo, Categorias) ---------------- */
let filtroEstadoActual = "todos"; // 'todos' | 'activos' | 'agotados' | 'stockbajo' | 'categorias'
const STOCK_BAJO_UMBRAL = 5; // productos con stock definido y menor a este número se consideran "stock bajo"

const btnTodos = document.getElementById("btn-filter-todos");
const btnActivos = document.getElementById("btn-filter-activos");
const btnAgotados = document.getElementById("btn-filter-agotados");
const btnStockBajo = document.getElementById("btn-filter-stockbajo");
const btnAgotadoHoy = document.getElementById("btn-filter-agotadohoy");
const btnCategorias = document.getElementById("btn-filter-categorias");

function setFiltroEstado(nuevoEstado) {
  filtroEstadoActual = nuevoEstado;
  [
    btnTodos,
    btnActivos,
    btnAgotados,
    btnStockBajo,
    btnAgotadoHoy,
    btnCategorias,
  ].forEach((b) =>
    b.classList.remove(
      "active-filter",
      "ring-2",
      "ring-violet-500",
      "ring-emerald-500",
      "ring-rose-500",
      "ring-amber-500",
      "ring-orange-500",
      "ring-purple-500",
    ),
  );

  if (nuevoEstado === "todos")
    btnTodos.classList.add("active-filter", "ring-2", "ring-violet-500");
  if (nuevoEstado === "activos")
    btnActivos.classList.add("active-filter", "ring-2", "ring-emerald-500");
  if (nuevoEstado === "agotados")
    btnAgotados.classList.add("active-filter", "ring-2", "ring-rose-500");
  if (nuevoEstado === "stockbajo")
    btnStockBajo.classList.add("active-filter", "ring-2", "ring-amber-500");
  if (nuevoEstado === "agotadohoy")
    btnAgotadoHoy.classList.add("active-filter", "ring-2", "ring-orange-500");
  if (nuevoEstado === "categorias")
    btnCategorias.classList.add("active-filter", "ring-2", "ring-purple-500");

  aplicarFiltroYMetricas();
}

btnTodos.addEventListener("click", () => setFiltroEstado("todos"));
btnActivos.addEventListener("click", () => setFiltroEstado("activos"));
btnAgotados.addEventListener("click", () => setFiltroEstado("agotados"));
btnStockBajo.addEventListener("click", () => setFiltroEstado("stockbajo"));
btnAgotadoHoy.addEventListener("click", () => setFiltroEstado("agotadohoy"));
btnCategorias.addEventListener("click", () => setFiltroEstado("categorias"));

/* ---------------- Categorías ---------------- */
/* ---------------- Menú desplegable "Agregar" ---------------- */
const toggleAccionesBtn = document.getElementById("btn-acciones-toggle");
const menuAcciones = document.getElementById("panel-actions-menu");

function cerrarMenuAcciones() {
  menuAcciones.classList.add("hidden");
  toggleAccionesBtn.classList.remove("open");
}
function toggleMenuAcciones() {
  const abrir = menuAcciones.classList.contains("hidden");
  menuAcciones.classList.toggle("hidden", !abrir);
  toggleAccionesBtn.classList.toggle("open", abrir);
}
toggleAccionesBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleMenuAcciones();
});
document.addEventListener("click", (e) => {
  if (!menuAcciones.contains(e.target) && e.target !== toggleAccionesBtn) {
    cerrarMenuAcciones();
  }
});
menuAcciones.addEventListener("click", (e) => {
  if (e.target.closest(".panel-actions-item")) cerrarMenuAcciones();
});

/* ---------------- Categorías ---------------- */
document
  .getElementById("btn-nueva-categoria")
  .addEventListener("click", () => openOverlay("overlay-categoria"));
document
  .getElementById("btn-nueva-categoria-empty")
  ?.addEventListener("click", () => openOverlay("overlay-categoria"));

// FIX PRINCIPAL #1: antes se usaba addDoc(), que SIEMPRE genera un ID aleatorio (ej. "sLQckf102FhuO4MUIXP5").
// Ahora usamos setDoc(doc(categoriasRef, nombre), ...) para que el ID del documento sea
// exactamente el nombre que escribes (igual que tus categorías "Entradas" o "Postres" creadas a mano).
// También se valida que no exista ya una categoría con ese nombre, y se muestra spinner mientras guarda.
document
  .getElementById("form-categoria")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("input-cat-nombre");
    const nombre = input.value.trim();
    if (!nombre) return;

    const btn = document.getElementById("btn-guardar-categoria");
    const label = document.getElementById("btn-guardar-categoria-label");
    const originalText = label.textContent;
    btn.disabled = true;
    label.innerHTML = '<span class="spinner"></span>';

    try {
      const catDocRef = doc(categoriasRef, nombre);
      const existente = await getDoc(catDocRef);
      if (existente.exists()) {
        toast(`Ya existe una categoría llamada "${nombre}".`, "error");
        return;
      }

      await setDoc(catDocRef, { nombre, createdAt: serverTimestamp() });
      input.value = "";
      closeOverlay("overlay-categoria");
      toast(`Categoría "${nombre}" añadida.`);
    } catch (err) {
      console.error(err);
      toast("No se pudo guardar la categoría.", "error");
    } finally {
      btn.disabled = false;
      label.textContent = originalText;
    }
  });

async function eliminarCategoria(categoriaId, nombre) {
  const prodSnap = await getDocs(productosRef(categoriaId));

  for (const prodDoc of prodSnap.docs) {
    const data = prodDoc.data();
    const imagenes = data.imagenes || [];
    await Promise.all(
      imagenes.map((img) =>
        deleteObject(storageRef(storage, img.path)).catch(() => {}),
      ),
    );
  }

  const batch = writeBatch(db);
  prodSnap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();

  await deleteDoc(doc(categoriasRef, categoriaId));
  toast(`Categoría "${nombre}" eliminada.`);
}

/* ---------------- Productos ---------------- */
let categoriaActivaParaProducto = null;
let imagenesSeleccionadas = [null, null, null];
let condicionesSeleccionadas = [];
let productoEditandoId = null;
let productoEditandoCategoriaId = null;
let imagenesEnEdicionOriginal = [];

function renderImgDropSlots() {
  const row = document.getElementById("imgdrop-row");
  row.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const slot = document.createElement("div");
    slot.className =
      "relative aspect-square rounded-xl border border-dashed border-purple-900/40 hover:border-violet-600 bg-[#05040a] flex items-center justify-center cursor-pointer overflow-hidden transition-all";
    if (imagenesSeleccionadas[i]) {
      const item = imagenesSeleccionadas[i];
      const img = document.createElement("img");
      img.src = item instanceof File ? URL.createObjectURL(item) : item.url;
      img.className = "absolute inset-0 w-full h-full object-cover";
      const x = document.createElement("div");
      x.className =
        "absolute top-1 right-1 z-10 w-5 h-5 rounded-full bg-black/80 hover:bg-rose-600 text-white text-[10px] flex items-center justify-center transition-colors";
      x.textContent = "✕";
      x.addEventListener("click", (ev) => {
        ev.stopPropagation();
        imagenesSeleccionadas[i] = null;
        renderImgDropSlots();
      });
      slot.appendChild(img);
      slot.appendChild(x);
    } else {
      slot.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
      slot.addEventListener("click", () => {
        document.getElementById("input-prod-imgs").dataset.targetSlot = i;
        document.getElementById("input-prod-imgs").click();
      });
    }
    row.appendChild(slot);
  }
}

// Muestra una advertencia si el stock general no coincide con la suma de
// los stocks de las variantes — el error más común al llenar el formulario.
function validarConsistenciaStock() {
  const avisoAnterior = document.getElementById("aviso-stock-inconsistente");
  if (avisoAnterior) avisoAnterior.remove();

  const stockGeneralRaw = document.getElementById("input-prod-stock").value;
  if (stockGeneralRaw === "") return; // sin control de stock general, no hay nada que comparar

  const stockGeneral = Math.max(0, parseInt(stockGeneralRaw, 10) || 0);

  // Suma el stock de todas las opciones que sí tengan un número puesto
  let sumaVariantes = 0;
  let hayVariantesConStock = false;
  condicionesSeleccionadas.forEach((cond) => {
    cond.opciones.forEach((op) => {
      if (typeof op.stock === "number") {
        hayVariantesConStock = true;
        sumaVariantes += op.stock;
      }
    });
  });

  if (!hayVariantesConStock || sumaVariantes === stockGeneral) return;

  const aviso = document.createElement("p");
  aviso.id = "aviso-stock-inconsistente";
  aviso.className =
    "text-[11px] text-amber-300 bg-amber-950/30 border border-amber-500/20 rounded-lg px-3 py-2 mt-2 leading-relaxed";
  aviso.textContent = `⚠️ El stock general (${stockGeneral}) no coincide con la suma del stock de las variantes (${sumaVariantes}). Revisa los números antes de guardar.`;
  document.getElementById("condiciones-container").after(aviso);
}
function renderCondiciones() {
  const cont = document.getElementById("condiciones-container");
  const btnAdd = document.getElementById("btn-add-condicion");
  cont.innerHTML = "";
  btnAdd.style.display = condicionesSeleccionadas.length >= 5 ? "none" : "";
  condicionesSeleccionadas.forEach((cond, ci) => {
    const box = document.createElement("div");
    box.className = "rounded-xl bg-[#05040a] border border-purple-900/30 p-3";

    const head = document.createElement("div");
    head.className = "flex items-center gap-2 mb-2";

    const nombreInput = document.createElement("input");
    nombreInput.type = "text";
    nombreInput.placeholder = textosActuales().condNombrePlaceholder;
    nombreInput.maxLength = 30;
    nombreInput.value = cond.nombre;
    nombreInput.className =
      "flex-1 rounded-lg bg-[#0d0a17] border border-purple-900/30 px-2.5 py-1.5 text-xs text-purple-100 placeholder-purple-400/30 outline-none focus:border-violet-600";
    nombreInput.addEventListener("input", () => {
      cond.nombre = nombreInput.value;
    });

    const delCondBtn = document.createElement("button");
    delCondBtn.type = "button";
    delCondBtn.className =
      "w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-purple-400/50 hover:text-rose-400 hover:bg-rose-950/30 transition-colors";
    delCondBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>`;
    delCondBtn.addEventListener("click", () => {
      condicionesSeleccionadas.splice(ci, 1);
      renderCondiciones();
    });

    head.appendChild(nombreInput);
    head.appendChild(delCondBtn);
    box.appendChild(head);

    // Encabezados de columna: sin esto, los campos de costo y stock son
    // dos inputs numéricos idénticos y es fácil confundir uno con el otro.
    const colHeaders = document.createElement("div");
    colHeaders.className = "flex items-center gap-2 mb-1 px-0.5";
    colHeaders.innerHTML = `
  <span class="flex-1 text-[9px] font-mono uppercase tracking-wider text-purple-400/40">Opción</span>
  <span class="w-16 text-[9px] font-mono uppercase tracking-wider text-purple-400/40 text-center">Costo extra</span>
  <span class="w-14 text-[9px] font-mono uppercase tracking-wider text-purple-400/40 text-center">Stock</span>
  <span class="w-9 text-[9px] font-mono uppercase tracking-wider text-purple-400/40 text-center">Activo</span>
  <span class="w-6"></span>
`;
    box.appendChild(colHeaders);

    const opcionesWrap = document.createElement("div");
    opcionesWrap.className = "flex flex-col gap-1.5";

    cond.opciones.forEach((op, oi) => {
      const row = document.createElement("div");
      row.className = "flex items-center gap-2";
      const opInput = document.createElement("input");
      opInput.type = "text";
      opInput.placeholder = textosActuales().opcionPlaceholder;
      opInput.maxLength = 30;
      opInput.value = op.nombre;
      opInput.className =
        "flex-1 rounded-lg bg-[#0d0a17] border border-purple-900/20 px-2.5 py-1.5 text-xs text-purple-100 placeholder-purple-400/30 outline-none focus:border-violet-600";
      opInput.addEventListener("input", () => {
        op.nombre = opInput.value;
      });

      const costInput = document.createElement("input");
      costInput.type = "number";
      costInput.step = "0.10";
      costInput.min = "0";
      costInput.placeholder = "+S/ 0";
      costInput.title =
        "Costo adicional que se suma al precio base si el cliente elige esta opción";
      costInput.value = op.costoAdicional ? op.costoAdicional : "";
      costInput.className =
        "w-16 rounded-lg bg-[#0d0a17] border border-purple-900/20 px-2 py-1.5 text-xs text-purple-100 placeholder-purple-400/30 outline-none focus:border-violet-600 font-mono";
      costInput.addEventListener("input", () => {
        op.costoAdicional = parseFloat(costInput.value) || 0;
      });

      const stockOpInput = document.createElement("input");
      stockOpInput.type = "number";
      stockOpInput.step = "1";
      stockOpInput.min = "0";
      stockOpInput.placeholder = "Stock";
      stockOpInput.title = "Stock de esta opción (vacío = sin control)";
      stockOpInput.value = typeof op.stock === "number" ? op.stock : "";
      stockOpInput.className =
        "w-14 rounded-lg bg-[#0d0a17] border border-purple-900/20 px-2 py-1.5 text-xs text-purple-100 placeholder-purple-400/30 outline-none focus:border-violet-600 font-mono";
      stockOpInput.addEventListener("input", () => {
        op.stock =
          stockOpInput.value === ""
            ? null
            : Math.max(0, parseInt(stockOpInput.value, 10) || 0);
        validarConsistenciaStock(); // ← esto faltaba
      });

      const toggleLabel = document.createElement("label");
      toggleLabel.className = "relative inline-block w-9 h-5 shrink-0";
      toggleLabel.innerHTML = `
            <input type="checkbox" ${op.activo ? "checked" : ""} class="peer opacity-0 w-0 h-0">
            <span class="absolute inset-0 rounded-full bg-purple-950/60 border border-purple-800/40 peer-checked:bg-emerald-600 peer-checked:border-emerald-500 cursor-pointer transition-colors duration-200
              before:content-[''] before:absolute before:w-3.5 before:h-3.5 before:left-0.5 before:top-0.5 before:bg-white before:rounded-full before:transition-transform before:duration-200 peer-checked:before:translate-x-4"></span>`;
      toggleLabel.querySelector("input").addEventListener("change", (ev) => {
        op.activo = ev.target.checked;
      });

      const delOpBtn = document.createElement("button");
      delOpBtn.type = "button";
      delOpBtn.className =
        "w-6 h-6 shrink-0 flex items-center justify-center rounded-lg text-purple-400/40 hover:text-rose-400 transition-colors text-xs";
      delOpBtn.textContent = "✕";
      delOpBtn.addEventListener("click", () => {
        cond.opciones.splice(oi, 1);
        renderCondiciones();
      });
      row.appendChild(opInput);
      row.appendChild(costInput);
      row.appendChild(stockOpInput);
      row.appendChild(toggleLabel);
      row.appendChild(delOpBtn);
      opcionesWrap.appendChild(row);
    });

    box.appendChild(opcionesWrap);

    const addOpBtn = document.createElement("button");
    addOpBtn.type = "button";
    addOpBtn.className =
      "mt-2 text-[10px] font-medium text-violet-300 hover:text-violet-200";
    addOpBtn.textContent = "+ Agregar opción";
    addOpBtn.addEventListener("click", () => {
      cond.opciones.push({
        nombre: "",
        activo: true,
        costoAdicional: 0,
        stock: null,
      });
      renderCondiciones();
    });
    box.appendChild(addOpBtn);

    cont.appendChild(box);
  });

  validarConsistenciaStock(); // ← esto faltaba, al final de la función
}

document.getElementById("btn-add-condicion").addEventListener("click", () => {
  if (condicionesSeleccionadas.length >= 5) return;
  condicionesSeleccionadas.push({
    nombre: "",
    opciones: [{ nombre: "", activo: true, costoAdicional: 0, stock: null }],
  });
  renderCondiciones();
});
document
  .getElementById("input-prod-stock")
  .addEventListener("input", validarConsistenciaStock);
document
  .getElementById("input-prod-puntos-activo")
  ?.addEventListener("change", (e) => {
    document
      .getElementById("puntos-detalle")
      .classList.toggle("hidden", !e.target.checked);
  });
document.getElementById("input-prod-imgs").addEventListener("change", (e) => {
  const file = e.target.files[0];
  const slot = parseInt(e.target.dataset.targetSlot || "0", 10);
  if (file) {
    imagenesSeleccionadas[slot] = file;
    renderImgDropSlots();
  }
  e.target.value = "";
});

function abrirModalNuevoProducto(categoriaId, categoriaNombre) {
  categoriaActivaParaProducto = categoriaId;
  productoEditandoId = null;
  productoEditandoCategoriaId = null;
  imagenesSeleccionadas = [null, null, null];
  imagenesEnEdicionOriginal = [];
  condicionesSeleccionadas = [];
  document.getElementById("form-producto").reset();
  document.getElementById("input-prod-disponible").checked = true;
  document.getElementById("input-prod-stock").value = "";
  document.getElementById("input-prod-auto-desactivar").checked = false;
  document.getElementById("input-prod-agotado-hoy").checked = false;
  document.getElementById("input-prod-puntos-activo").checked = false;
  document.getElementById("puntos-detalle").classList.add("hidden");
  document.getElementById("input-prod-puntos-cantidad").value = "";
  document.getElementById("input-prod-puntos-descripcion").value = "";
  document.getElementById("input-prod-unidad").value = "";
  document.getElementById("input-prod-horario-desde").value = "";
  document.getElementById("input-prod-horario-hasta").value = "";
  document.getElementById("producto-cat-hint").textContent =
    `Se incluirá en "${categoriaNombre}".`;
  document.getElementById("btn-guardar-producto-label").textContent =
    "Guardar cambios";
  aplicarTextosPorCategoria();
  renderImgDropSlots();
  renderCondiciones();
  activarTabProducto("tab-basico"); // ← faltaba esto
  openOverlay("overlay-producto");
}

function abrirModalEditarProducto(categoriaId, productoId, data) {
  categoriaActivaParaProducto = categoriaId;
  productoEditandoId = productoId;
  productoEditandoCategoriaId = categoriaId;
  imagenesSeleccionadas = [null, null, null];
  const imgsExistentes = data.imagenes || [];
  imagenesEnEdicionOriginal = imgsExistentes;
  imgsExistentes.slice(0, 3).forEach((img, i) => {
    imagenesSeleccionadas[i] = img;
  });
  condicionesSeleccionadas = (data.condiciones || []).map((c) => ({
    nombre: c.nombre,
    opciones: (c.opciones || []).map((o) => ({
      nombre: o.nombre,
      activo: !!o.activo,
      costoAdicional: Number(o.costoAdicional) || 0,
      stock: typeof o.stock === "number" ? o.stock : null,
    })),
  }));
  document.getElementById("form-producto").reset();
  document.getElementById("input-prod-nombre").value = data.nombre || "";
  document.getElementById("input-prod-descripcion").value =
    data.descripcion || "";
  document.getElementById("input-prod-precio").value = data.precio ?? "";
  document.getElementById("input-prod-disponible").checked = !!data.disponible;
  // Si el producto no tiene stock definido (productos viejos), el campo queda vacío = "sin control de stock"
  document.getElementById("input-prod-stock").value =
    typeof data.stock === "number" ? data.stock : "";
  document.getElementById("input-prod-auto-desactivar").checked =
    !!data.autoDesactivar;
  document.getElementById("input-prod-agotado-hoy").checked = !!data.agotadoHoy;
  const puntos = data.puntos || {};
  document.getElementById("input-prod-puntos-activo").checked = !!puntos.activo;
  document
    .getElementById("puntos-detalle")
    .classList.toggle("hidden", !puntos.activo);
  document.getElementById("input-prod-puntos-cantidad").value =
    puntos.cantidad ?? "";
  document.getElementById("input-prod-puntos-descripcion").value =
    puntos.descripcion || "";
  document.getElementById("input-prod-unidad").value = data.unidadMedida || "";
  document.getElementById("input-prod-horario-desde").value =
    data.disponibleDesde || "";
  document.getElementById("input-prod-horario-hasta").value =
    data.disponibleHasta || "";
  document.getElementById("producto-cat-hint").textContent =
    `Editando producto.`;
  document.getElementById("btn-guardar-producto-label").textContent =
    "Guardar cambios";
  aplicarTextosPorCategoria();
  renderImgDropSlots();
  renderCondiciones();
  openOverlay("overlay-producto");
}
document
  .getElementById("form-producto")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = document.getElementById("input-prod-nombre").value.trim();
    const descripcion = document
      .getElementById("input-prod-descripcion")
      .value.trim();
    const precio = parseFloat(
      document.getElementById("input-prod-precio").value,
    );
    let disponible = document.getElementById("input-prod-disponible").checked;

    const stockRaw = document.getElementById("input-prod-stock").value;
    // Si el campo está vacío, el producto queda "sin control de stock" (stock = null)
    const stock =
      stockRaw === "" ? null : Math.max(0, parseInt(stockRaw, 10) || 0);
    const autoDesactivar = document.getElementById(
      "input-prod-auto-desactivar",
    ).checked;
    const agotadoHoy = document.getElementById(
      "input-prod-agotado-hoy",
    ).checked;
    const unidadMedida =
      document.getElementById("input-prod-unidad").value || null;
    const puntosActivo = document.getElementById(
      "input-prod-puntos-activo",
    ).checked;
    const puntosCantidad = puntosActivo
      ? Math.max(
          0,
          parseInt(
            document.getElementById("input-prod-puntos-cantidad").value,
            10,
          ) || 0,
        )
      : 0;
    const puntosDescripcion = puntosActivo
      ? document.getElementById("input-prod-puntos-descripcion").value.trim()
      : "";
    const puntos = {
      activo: puntosActivo && puntosCantidad > 0,
      cantidad: puntosCantidad,
      descripcion: puntosDescripcion,
    };
    const disponibleDesde =
      document.getElementById("input-prod-horario-desde").value || null;
    const disponibleHasta =
      document.getElementById("input-prod-horario-hasta").value || null;

    // Si el usuario activó "desactivar automáticamente al llegar a 0" y el stock es 0,
    // se fuerza el producto a Agotado sin importar el switch manual de "Disponible".
    if (autoDesactivar && stock === 0) disponible = false;

    if (!nombre || isNaN(precio)) return;

    const condiciones = condicionesSeleccionadas
      .filter((c) => c.nombre.trim())
      .slice(0, 5)
      .map((c) => ({
        nombre: c.nombre.trim(),
        opciones: c.opciones
          .filter((o) => o.nombre.trim())
          .map((o) => ({
            nombre: o.nombre.trim(),
            activo: !!o.activo,
            costoAdicional: +(parseFloat(o.costoAdicional) || 0).toFixed(2),
            stock: typeof o.stock === "number" ? o.stock : null,
          })),
      }));

    const btn = document.getElementById("btn-guardar-producto");
    const label = document.getElementById("btn-guardar-producto-label");
    const originalText = label.textContent;
    btn.disabled = true;
    label.innerHTML = '<span class="spinner"></span>';

    try {
      if (productoEditandoId) {
        const docRef = doc(
          productosRef(productoEditandoCategoriaId),
          productoEditandoId,
        );

        const conservadas = imagenesSeleccionadas.filter(
          (item) => item && !(item instanceof File),
        );
        const nuevas = imagenesSeleccionadas.filter(
          (item) => item instanceof File,
        );
        const eliminadas = (imagenesEnEdicionOriginal || []).filter(
          (orig) => !conservadas.some((c) => c.path === orig.path),
        );
        await Promise.all(
          eliminadas.map((img) =>
            deleteObject(storageRef(storage, img.path)).catch(() => {}),
          ),
        );

        const subidas = [];
        for (const file of nuevas) {
          const path = `${storagePathProducto(productoEditandoId)}/${Date.now()}_${file.name}`;
          const ref = storageRef(storage, path);
          await uploadBytes(ref, file);
          const url = await getDownloadURL(ref);
          subidas.push({ url, path });
        }

        await updateDoc(docRef, {
          nombre,
          descripcion,
          precio,
          disponible,
          condiciones,
          stock,
          autoDesactivar,
          agotadoHoy,
          puntos,
          unidadMedida,
          disponibleDesde,
          disponibleHasta,
          imagenes: [...conservadas, ...subidas],
        });
        toast(`"${nombre}" actualizado.`);
      } else {
        const nuevoDocRef = doc(productosRef(categoriaActivaParaProducto));
        await setDoc(nuevoDocRef, {
          nombre,
          descripcion,
          precio,
          disponible,
          condiciones,
          stock,
          autoDesactivar,
          agotadoHoy,
          puntos,
          unidadMedida,
          disponibleDesde,
          disponibleHasta,
          imagenes: [],
          createdAt: serverTimestamp(),
        });
        const archivos = imagenesSeleccionadas.filter(Boolean);
        const imagenes = [];
        for (const file of archivos) {
          const path = `${storagePathProducto(nuevoDocRef.id)}/${Date.now()}_${file.name}`;
          const ref = storageRef(storage, path);
          await uploadBytes(ref, file);
          const url = await getDownloadURL(ref);
          imagenes.push({ url, path });
        }

        if (imagenes.length) {
          await updateDoc(nuevoDocRef, { imagenes });
        }

        toast(`"${nombre}" guardado.`);
      }

      closeOverlay("overlay-producto");
    } catch (err) {
      console.error(err);
      toast("No se pudo guardar el producto.", "error");
    } finally {
      btn.disabled = false;
      label.textContent = productoEditandoId ? "Guardar cambios" : originalText;
    }
  });

async function eliminarProducto(categoriaId, productoId, nombre, imagenes) {
  await Promise.all(
    (imagenes || []).map((img) =>
      deleteObject(storageRef(storage, img.path)).catch(() => {}),
    ),
  );
  await deleteDoc(doc(productosRef(categoriaId), productoId));
  toast(`"${nombre}" eliminado.`);
}

function skeletonCardHTML() {
  return `
    <div class="skeleton-card">
      <div class="skeleton-img"></div>
      <div class="skeleton-line" style="width:70%"></div>
      <div class="skeleton-line" style="width:40%"></div>
      <div class="skeleton-line" style="width:55%;margin-top:16px;"></div>
    </div>`;
}
function renderSkeletons(grid, count = 8) {
  grid.innerHTML = Array.from({ length: count }, skeletonCardHTML).join("");
}
/* ---------------- Render Tarjeta Producto ---------------- */
function renderProductoCard(categoriaId, productoId, data) {
  const card = document.createElement("div");
  card.className =
    "producto-card animate-fadeIn group relative flex flex-col rounded-2xl bg-[#0d0a17] border border-purple-900/20 overflow-hidden hover:border-purple-800/40 transition-all duration-200 hover:scale-[1.01] cursor-pointer";
  card.dataset.nombre = (
    data.nombre +
    " " +
    (data.descripcion || "")
  ).toLowerCase();
  card.dataset.disponible = data.disponible ? "true" : "false";
  card.dataset.agotadoHoy = data.agotadoHoy ? "true" : "false";
  // 'stock' queda vacío en el dataset si el producto no tiene control de stock (data.stock === null/undefined)
  card.dataset.stock = typeof data.stock === "number" ? String(data.stock) : "";
  // FIX PRINCIPAL #2: ahora la tarjeta completa abre el modal de edición al hacer clic
  // (antes solo funcionaba el ícono del lápiz). Se ignoran los clics hechos sobre botones
  // internos (disponible / editar / eliminar) para no interferir con esas acciones.
  card.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    abrirModalEditarProducto(categoriaId, productoId, data);
  });

  const imagenes = data.imagenes || [];
  imagenes.forEach((img) => {
    if (img.url) loadedImageUrls.add(img.url);
  });

  const imgWrap = document.createElement("div");
  imgWrap.className =
    "relative w-full aspect-square bg-[#05040a] overflow-hidden border-b border-purple-900/20";

  if (imagenes.length === 0) {
    imgWrap.innerHTML = `
      <div class="img-placeholder-fallback">
        <img src="../img/logo geinz.png" alt="">
      </div>`;
  } else {
    imgWrap.innerHTML = `
      <div class="img-placeholder-fallback">
        <img src="../img/logo geinz.png" alt="">
      </div>`;
    const imgEl = document.createElement("img");
    imgEl.src = imagenes[0].url;
    imgEl.loading = "lazy";
    imgEl.className =
      "img-real-foto w-full h-full object-cover block group-hover:scale-105 transition-transform duration-300";
    imgEl.onerror = () => {
      imgEl.classList.add("is-broken");
    };
    imgWrap.appendChild(imgEl);
  }

  const body = document.createElement("div");
  body.className = "flex flex-col p-4 flex-1 justify-between gap-3";

  const infoSection = document.createElement("div");

  const nombreEl = document.createElement("h3");
  nombreEl.className =
    "font-bold text-[15px] text-white leading-snug line-clamp-1";
  nombreEl.textContent = data.nombre;

  const descEl = document.createElement("p");
  descEl.className =
    "text-xs text-purple-300/60 mt-1 line-clamp-2 leading-relaxed";
  descEl.textContent = data.descripcion || "Sin descripción adicional.";

  infoSection.appendChild(nombreEl);
  infoSection.appendChild(descEl);

  const condiciones = data.condiciones || [];
  if (condiciones.length) {
    const condWrap = document.createElement("div");
    condWrap.className = "flex flex-col gap-1 mt-2";
    condiciones.forEach((cond) => {
      const activas = (cond.opciones || []).filter((o) => o.activo);
      if (!activas.length) return;
      const row = document.createElement("div");
      row.className = "flex flex-wrap items-center gap-1";
      const tag = document.createElement("span");
      tag.className = "text-[10px] font-mono text-purple-400/60";
      tag.textContent = `${cond.nombre}:`;
      row.appendChild(tag);
      activas.forEach((op) => {
        const chip = document.createElement("span");
        const stockBajo =
          typeof op.stock === "number" && op.stock < STOCK_BAJO_UMBRAL;
        const sinStock = typeof op.stock === "number" && op.stock <= 0;
        chip.className = `text-[10px] px-1.5 py-0.5 rounded-md border ${
          sinStock
            ? "bg-rose-950/40 border-rose-500/20 text-rose-300"
            : stockBajo
              ? "bg-amber-950/40 border-amber-500/20 text-amber-300"
              : "bg-purple-950/40 border-purple-800/30 text-purple-300"
        }`;
        let txt = op.costoAdicional
          ? `${op.nombre} (+S/ ${Number(op.costoAdicional).toFixed(2)})`
          : op.nombre;
        if (typeof op.stock === "number") txt += ` · Stock: ${op.stock}`;
        chip.textContent = txt;
        row.appendChild(chip);
      });
      condWrap.appendChild(row);
    });
    infoSection.appendChild(condWrap);
  }
  const bottomSection = document.createElement("div");
  bottomSection.className =
    "pt-2 border-t border-purple-900/20 flex flex-col gap-2.5";

  const priceRow = document.createElement("div");
  priceRow.className = "flex items-center justify-between";

  const precioEl = document.createElement("span");
  precioEl.className = "font-mono text-base font-bold text-violet-300";
  precioEl.textContent = `S/ ${Number(data.precio).toFixed(2)}`;

  const codeEl = document.createElement("span");
  codeEl.className =
    "font-mono text-[10px] text-purple-400/40 bg-purple-950/40 px-2 py-0.5 rounded-md border border-purple-900/30";
  codeEl.textContent = `#${productoId.slice(0, 5)}`;

  priceRow.appendChild(precioEl);

  if (typeof data.stock === "number") {
    const stockEl = document.createElement("span");
    const stockColor =
      data.stock <= 0
        ? "bg-rose-950/40 text-rose-400 border-rose-500/20"
        : data.stock < STOCK_BAJO_UMBRAL
          ? "bg-amber-950/40 text-amber-400 border-amber-500/20"
          : "bg-emerald-950/40 text-emerald-400 border-emerald-500/20";
    stockEl.className = `font-mono text-[10px] px-2 py-0.5 rounded-md border ${stockColor}`;
    stockEl.textContent = `Stock: ${data.stock}`;
    priceRow.appendChild(stockEl);
  }

  priceRow.appendChild(codeEl);

  const actionRow = document.createElement("div");
  actionRow.className = "flex items-center justify-between gap-2";

  const estadoBtn = document.createElement("button");
  estadoBtn.type = "button";
  estadoBtn.className = `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold uppercase tracking-wider border transition-all ${
    data.disponible
      ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/20 hover:bg-emerald-900/40"
      : "bg-rose-950/40 text-rose-400 border-rose-500/20 hover:bg-rose-900/40"
  }`;
  estadoBtn.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${data.disponible ? "bg-emerald-400" : "bg-rose-400"}"></span><span>${data.disponible ? "Disponible" : "Agotado"}</span>`;
  estadoBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    estadoBtn.disabled = true;
    try {
      await updateDoc(doc(productosRef(categoriaId), productoId), {
        disponible: !data.disponible,
      });
    } catch (err) {
      console.error(err);
      toast("Error al cambiar disponibilidad.", "error");
    } finally {
      estadoBtn.disabled = false;
    }
  });

  // Botón rápido "Agotado hoy": un clic, no abre el modal, no toca el stock.
  const agotadoHoyBtn = document.createElement("button");
  agotadoHoyBtn.type = "button";
  agotadoHoyBtn.title =
    "Marcar/quitar 'Agotado hoy' (se acabó por hoy, mañana vuelve solo)";
  agotadoHoyBtn.className = `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold uppercase tracking-wider border transition-all ${
    data.agotadoHoy
      ? "bg-orange-950/40 text-orange-400 border-orange-500/20 hover:bg-orange-900/40"
      : "bg-purple-950/30 text-purple-400/50 border-purple-800/20 hover:bg-purple-900/30"
  }`;
  agotadoHoyBtn.textContent = data.agotadoHoy
    ? "Agotado hoy ✓"
    : "Marcar agotado hoy";
  agotadoHoyBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    agotadoHoyBtn.disabled = true;
    try {
      await updateDoc(doc(productosRef(categoriaId), productoId), {
        agotadoHoy: !data.agotadoHoy,
      });
    } catch (err) {
      console.error(err);
      toast("Error al actualizar 'Agotado hoy'.", "error");
    } finally {
      agotadoHoyBtn.disabled = false;
    }
  });

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className =
    "w-7 h-7 flex items-center justify-center rounded-lg text-purple-400/40 hover:text-rose-400 hover:bg-rose-950/30 transition-colors";
  delBtn.title = "Eliminar producto";
  delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>`;
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    askConfirm(
      "¿Eliminar producto?",
      `"${data.nombre}" será removido permanentemente.`,
      () => {
        return eliminarProducto(categoriaId, productoId, data.nombre, imagenes);
      },
    );
  });

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className =
    "w-7 h-7 flex items-center justify-center rounded-lg text-purple-400/40 hover:text-violet-300 hover:bg-violet-950/30 transition-colors";
  editBtn.title = "Editar producto";
  editBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    abrirModalEditarProducto(categoriaId, productoId, data);
  });

  actionRow.appendChild(estadoBtn);
  actionRow.appendChild(agotadoHoyBtn);
  actionRow.appendChild(editBtn);
  actionRow.appendChild(delBtn);

  bottomSection.appendChild(priceRow);
  bottomSection.appendChild(actionRow);

  body.appendChild(infoSection);
  body.appendChild(bottomSection);

  card.appendChild(imgWrap);
  card.appendChild(body);
  return card;
}

/* ---------------- Render Categoria Shell ---------------- */
const categoriasContainer = document.getElementById("categorias-container");
const emptyGlobal = document.getElementById("empty-global");
const emptySearch = document.getElementById("empty-search");
const categoriaListeners = {};

// FIX #4 (escalabilidad): en vez de traer TODOS los productos de una categoría de golpe
// (lo cual se vuelve lento con miles de productos), se pide un límite inicial y se agrega
// un botón "Cargar más" que amplía el límite bajo demanda.
const PRODUCTOS_POR_PAGINA = 60;
const categoriaLimite = {}; // categoriaId -> límite actual de productos cargados

const categoriaCardsMap = {}; // categoriaId -> Map(productoId -> elemento tarjeta)

function suscribirProductos(categoriaId, grid, seccion) {
  if (categoriaListeners[categoriaId]) categoriaListeners[categoriaId]();

  if (!seccion.dataset.cargado) {
    renderSkeletons(grid, 8);
  }

  if (!categoriaCardsMap[categoriaId])
    categoriaCardsMap[categoriaId] = new Map();
  const cardsMap = categoriaCardsMap[categoriaId];

  const lim = categoriaLimite[categoriaId] || PRODUCTOS_POR_PAGINA;
  const q = query(
    productosRef(categoriaId),
    orderBy("createdAt", "desc"),
    limit(lim),
  );

  categoriaListeners[categoriaId] = onSnapshot(
    q,
    (snap) => {
      const primeraCarga = !seccion.dataset.cargado;
      seccion.dataset.cargado = "1";

      if (primeraCarga) {
        grid.innerHTML = "";
        cardsMap.clear();

        const addCard = document.createElement("div");
        addCard.className =
          "btn-card-add group flex flex-col items-center justify-center gap-2 min-h-[260px] rounded-2xl border border-dashed border-purple-900/30 hover:border-violet-600 hover:bg-violet-950/10 cursor-pointer transition-all text-purple-400/50 hover:text-purple-200";
        addCard.innerHTML = `
          <div class="w-10 h-10 rounded-full bg-violet-950/50 group-hover:bg-violet-900/50 flex items-center justify-center transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
          </div>
          <span class="text-xs font-medium">Nuevo Producto</span>`;
        addCard.addEventListener("click", () =>
          abrirModalNuevoProducto(categoriaId, seccion.dataset.catNombre),
        );
        grid.appendChild(addCard);

        snap.forEach((prodDoc) => {
          const card = renderProductoCard(
            categoriaId,
            prodDoc.id,
            prodDoc.data(),
          );
          cardsMap.set(prodDoc.id, card);
          grid.appendChild(card);
        });
      } else {
        // Solo tocamos lo que realmente cambió: nada de parpadeo ni recarga de imágenes
        snap.docChanges().forEach((change) => {
          const id = change.doc.id;
          if (change.type === "removed") {
            cardsMap.get(id)?.remove();
            cardsMap.delete(id);
            return;
          }
          const nuevaCard = renderProductoCard(
            categoriaId,
            id,
            change.doc.data(),
          );
          const anterior = cardsMap.get(id);
          if (anterior) {
            anterior.replaceWith(nuevaCard);
          } else {
            grid.appendChild(nuevaCard);
          }
          cardsMap.set(id, nuevaCard);
        });
      }

      grid.querySelector(".btn-cargar-mas")?.remove();
      if (snap.size >= lim) {
        const masBtn = document.createElement("button");
        masBtn.type = "button";
        masBtn.className =
          "btn-cargar-mas col-span-full mt-2 mx-auto rounded-xl px-4 py-2 text-xs font-medium text-violet-300 bg-violet-950/30 hover:bg-violet-900/40 border border-violet-800/30 transition-all";
        masBtn.textContent = "Cargar más productos";
        masBtn.addEventListener("click", () => {
          categoriaLimite[categoriaId] = lim + PRODUCTOS_POR_PAGINA;
          suscribirProductos(categoriaId, grid, seccion);
        });
        grid.appendChild(masBtn);
      }

      seccion.querySelector(".categoria-count").textContent =
        `${snap.size}${snap.size >= lim ? "+" : ""} ${snap.size === 1 ? "producto" : "productos"}`;
      aplicarFiltroYMetricas();
      updateSplashAndCheckDismiss();
    },
    (err) => {
      console.error(err);
      toast("Error al cargar productos.", "error");
    },
  );
  initImportador({
    categoriasRef,
    productosRef,
    storage,
    storagePathProducto,
    toast,
    getEsRestaurante: () => esRestaurante,
  });
}

function renderCategoriaShell(categoriaId, data) {
  let seccion = document.getElementById(`cat-${categoriaId}`);
  if (!seccion) {
    seccion = document.createElement("section");
    seccion.className =
      "categoria animate-fadeIn rounded-2xl bg-[#0d0a17] border border-purple-900/20 p-5 sm:p-6 shadow-xl transition-all duration-300";
    seccion.id = `cat-${categoriaId}`;
    seccion.dataset.catNombre = (data.nombre || "").toLowerCase();
    seccion.innerHTML = `
      <div class="categoria-head flex flex-wrap items-center justify-between gap-3 mb-5 border-b border-purple-900/20 pb-4">
        <div class="flex items-center gap-3 min-w-0">
          <h2 class="categoria-titulo text-lg sm:text-xl font-bold text-white tracking-tight truncate"></h2>
          <span class="categoria-count font-mono text-xs px-2.5 py-0.5 rounded-full bg-purple-950/50 text-purple-300 border border-purple-800/30 shrink-0"></span>
        </div>
        <div class="categoria-actions flex items-center gap-2 shrink-0">
          <button class="btn-add-producto inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-purple-200 bg-violet-950/40 hover:bg-violet-900/50 border border-violet-800/30 transition-all active:scale-95">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Agregar producto
          </button>
          <button class="btn-del-categoria inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-rose-300 bg-rose-950/30 hover:bg-rose-900/40 border border-rose-900/30 transition-all active:scale-95">
            Eliminar
          </button>
        </div>
      </div>
      <div class="productos-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"></div>
    `;
    categoriasContainer.appendChild(seccion);

    seccion.querySelector(".btn-add-producto").addEventListener("click", () => {
      abrirModalNuevoProducto(categoriaId, data.nombre);
    });
    seccion
      .querySelector(".btn-del-categoria")
      .addEventListener("click", () => {
        askConfirm(
          "¿Eliminar categoría?",
          `Se eliminara la categoría "${data.nombre}" y todos sus productos contenidos.`,
          () => eliminarCategoria(categoriaId, data.nombre),
        );
      });

    const grid = seccion.querySelector(".productos-grid");
    suscribirProductos(categoriaId, grid, seccion);
  }

  seccion.dataset.catNombre = (data.nombre || "").toLowerCase();
  seccion.querySelector(".categoria-titulo").textContent = data.nombre;
}

/* ---------------- Filtro Combinado Avanzado ---------------- */
const inputBusqueda = document.getElementById("input-busqueda");
let debounceTimer = null;
inputBusqueda.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(aplicarFiltroYMetricas, 180); // debounce para no recalcular en cada tecla con catálogos grandes
});
function mostrarCard(card) {
  if (card.style.display === "none") card.style.display = "";
  requestAnimationFrame(() => card.classList.remove("filtro-oculto"));
}
function ocultarCard(card) {
  card.classList.add("filtro-oculto");
  setTimeout(() => {
    if (card.classList.contains("filtro-oculto")) card.style.display = "none";
  }, 220);
}
function animarContador(el, nuevoValor) {
  if (!el) return;
  const actual = parseInt(el.textContent, 10) || 0;
  if (actual === nuevoValor) return;
  const duracion = 260;
  const inicio = performance.now();
  el.classList.add("stat-bump");
  function paso(t) {
    const p = Math.min((t - inicio) / duracion, 1);
    const val = Math.round(actual + (nuevoValor - actual) * p);
    el.textContent = val;
    if (p < 1) {
      requestAnimationFrame(paso);
    } else {
      el.textContent = nuevoValor;
      setTimeout(() => el.classList.remove("stat-bump"), 200);
    }
  }
  requestAnimationFrame(paso);
}

function mostrarCategoria(cat) {
  if (cat.style.display === "none") cat.style.display = "";
  requestAnimationFrame(() => cat.classList.remove("categoria-oculta"));
}
function ocultarCategoria(cat) {
  cat.classList.add("categoria-oculta");
  setTimeout(() => {
    if (cat.classList.contains("categoria-oculta")) cat.style.display = "none";
  }, 220);
}
function aplicarFiltroYMetricas() {
  const queryText = inputBusqueda.value.trim().toLowerCase();
  const categorias = document.querySelectorAll(".categoria");

  let totalActivos = 0;
  let totalAgotados = 0;
  let totalStockBajo = 0;
  let totalAgotadoHoy = 0;
  let totalCategoriasVisibles = 0;
  let algunElementoVisibleTotal = false;
  let totalProductosProcesados = 0;

  categorias.forEach((cat) => {
    const nombreCategoria = cat.dataset.catNombre || "";
    const coincideCategoriaTexto =
      queryText.length > 0 && nombreCategoria.includes(queryText);

    const cards = cat.querySelectorAll(".producto-card");
    const addCardBtn = cat.querySelector(".btn-card-add");
    let productosVisiblesEnCat = 0;

    cards.forEach((card) => {
      totalProductosProcesados++;
      const nombreProducto = card.dataset.nombre || "";
      const disponible = card.dataset.disponible === "true";
      const stockValor = card.dataset.stock;
      const tieneStockBajo =
        stockValor !== "" && Number(stockValor) < STOCK_BAJO_UMBRAL;

      const esAgotadoHoy = card.dataset.agotadoHoy === "true";

      if (disponible) totalActivos++;
      else totalAgotados++;
      if (tieneStockBajo) totalStockBajo++;
      if (esAgotadoHoy) totalAgotadoHoy++;

      // Evaluar estado (Activo/Agotado/Stock bajo/Agotado hoy/Todos)
      let cumpleEstado = true;
      if (filtroEstadoActual === "activos") cumpleEstado = disponible;
      if (filtroEstadoActual === "agotados") cumpleEstado = !disponible;
      if (filtroEstadoActual === "stockbajo") cumpleEstado = tieneStockBajo;
      if (filtroEstadoActual === "agotadohoy") cumpleEstado = esAgotadoHoy;
      // Evaluar Búsqueda de texto
      let cumpleTexto =
        queryText === "" ||
        coincideCategoriaTexto ||
        nombreProducto.includes(queryText);

      if (cumpleEstado && cumpleTexto && filtroEstadoActual !== "categorias") {
        mostrarCard(card);
        productosVisiblesEnCat++;
      } else {
        ocultarCard(card);
      }
    });

    // Filtro rápido de 'Categorías': Muestra sólo las cabeceras de categorías sin productos estorbando
    if (filtroEstadoActual === "categorias") {
      if (addCardBtn) addCardBtn.style.display = "none";
      const coincideCat =
        queryText === "" || nombreCategoria.includes(queryText);
      if (coincideCat) {
        mostrarCategoria(cat);
        algunElementoVisibleTotal = true;
        totalCategoriasVisibles++;
      } else {
        ocultarCategoria(cat);
      }
      return;
    }

    // Reglas normales de visualización para categorías
    if (queryText.length > 0 || filtroEstadoActual !== "todos") {
      if (addCardBtn) addCardBtn.style.display = "none";
      if (
        productosVisiblesEnCat > 0 ||
        (coincideCategoriaTexto && filtroEstadoActual === "todos")
      ) {
        mostrarCategoria(cat);
        algunElementoVisibleTotal = true;
        totalCategoriasVisibles++;
      } else {
        ocultarCategoria(cat);
      }
    } else {
      if (addCardBtn) addCardBtn.style.display = "";
      mostrarCategoria(cat);
      algunElementoVisibleTotal = true;
      totalCategoriasVisibles++;
    }
  });

  // Métricas
  splashTotalProds.textContent = totalProductosProcesados;
  splashTotalImgs.textContent = loadedImageUrls.size;

  animarContador(document.getElementById("stat-activos"), totalActivos);
  animarContador(document.getElementById("stat-agotados"), totalAgotados);
  animarContador(document.getElementById("stat-stockbajo"), totalStockBajo);
  animarContador(document.getElementById("stat-agotadohoy"), totalAgotadoHoy);
  animarContador(
    document.getElementById("stat-categorias"),
    totalCategoriasVisibles,
  );

  const hayCategorias = categorias.length > 0;
  if (hayCategorias && !algunElementoVisibleTotal) {
    emptySearch.style.display = "block";
  } else {
    emptySearch.style.display = "none";
  }
}

/* ---------------- Suscripción General ---------------- */
const qCategorias = query(categoriasRef, orderBy("createdAt", "asc"));
onSnapshot(
  qCategorias,
  (snap) => {
    emptyGlobal.style.display = snap.empty ? "block" : "none";

    if (snap.empty) {
      updateSplashAndCheckDismiss();
    }

    const idsActuales = new Set();
    snap.forEach((catDoc) => {
      idsActuales.add(catDoc.id);
      renderCategoriaShell(catDoc.id, catDoc.data());
    });

    document.querySelectorAll(".categoria").forEach((el) => {
      const id = el.id.replace("cat-", "");
      if (!idsActuales.has(id)) {
        if (categoriaListeners[id]) categoriaListeners[id]();
        delete categoriaListeners[id];
        delete categoriaLimite[id];
        el.remove();
      }
    });

    aplicarFiltroYMetricas();
  },
  (err) => {
    console.error(err);
    toast("No se pudo establecer conexión.", "error");
    updateSplashAndCheckDismiss();
  },
);
/* ---------------- Carta digital (solo Comida y Restaurantes) — versión liviana ---------------- */
const CARTA_MAX_COLECCIONES = 5;
const CARTA_MAX_FOTOS = 5;
let cartaColecciones = {};
let cartaLoaded = false;

function cartaRef() {
  return tiendaSubCol(localidad, "tiendas", tiendaId, "carta");
}
function cartaDocRef(id) {
  return tiendaSubDoc(localidad, "tiendas", tiendaId, "carta", id);
}

function actualizarVisibilidadCarta() {
  const section = document.getElementById("carta-digital-section");
  if (!section) return;
  if (esRestaurante) {
    section.classList.remove("hidden");
    if (!cartaLoaded) {
      cartaLoaded = true;
      cargarCartaColecciones();
    }
  } else {
    section.classList.add("hidden");
  }
}

async function cargarCartaColecciones() {
  try {
    const snap = await getDocs(cartaRef());
    cartaColecciones = {};
    snap.forEach((d) => {
      const data = d.data() || {};
      cartaColecciones[d.id] = {
        nombre: data.nombre || d.id,
        imagenes: Array.isArray(data.imagenes) ? data.imagenes : [],
        texto: data.texto || "",
      };
    });
    renderCartaColecciones();
  } catch (err) {
    console.error(err);
    toast("No se pudo cargar la carta digital.", "error");
  }
}

// Construye todo el HTML de una vez como string (mucho más rápido que crear
// nodos uno por uno con createElement, sobre todo con varias colecciones/fotos)
function htmlColeccion(id, coleccion) {
  const totalFotos = coleccion.imagenes.filter(Boolean).length;
  const tieneTexto = !!(coleccion.texto && coleccion.texto.trim());
  return `
    <div class="carta-coleccion-card" data-carta-id="${id}">
      <div class="carta-coleccion-head" data-carta-toggle>
        <div style="min-width:0;flex:1;">
          <p class="carta-coleccion-name">${coleccion.nombre}</p>
          <p class="carta-coleccion-preview ${tieneTexto ? "" : "empty"}">${tieneTexto ? coleccion.texto : "Sin descripción"}</p>
        </div>
        <span class="carta-coleccion-count">${totalFotos}/${CARTA_MAX_FOTOS}</span>
        <button type="button" class="carta-del-btn" data-carta-del title="Eliminar colección">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>
        </button>
        <svg class="carta-arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
      </div>
      <div class="carta-coleccion-body">
        <div class="carta-body-inner">
          <textarea class="carta-textarea" rows="2" data-carta-textarea placeholder="Descripción (opcional)...">${coleccion.texto || ""}</textarea>
          <button type="button" class="carta-save-text-btn" data-carta-save-texto>Guardar descripción</button>
          <div class="carta-photo-grid" data-carta-grid></div>
        </div>
      </div>
    </div>`;
}

function htmlFotoSlot(collId, i, url) {
  if (url) {
    return `
      <div class="carta-photo-item" data-carta-slot="${i}" data-carta-coll="${collId}">
        <img src="${url}" loading="lazy" decoding="async">
        <button type="button" class="carta-photo-del" data-carta-foto-del title="Eliminar foto">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>`;
  }
  return `
    <div class="carta-photo-item carta-photo-add" data-carta-slot="${i}" data-carta-coll="${collId}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      <span>Agregar</span>
    </div>`;
}

function renderCartaGridHTML(collId) {
  const coleccion = cartaColecciones[collId];
  const urls = [...(coleccion.imagenes || [])].slice(0, CARTA_MAX_FOTOS);
  while (urls.length < CARTA_MAX_FOTOS) urls.push(null);
  return urls.map((url, i) => htmlFotoSlot(collId, i, url)).join("");
}

function renderCartaColecciones() {
  const list = document.getElementById("carta-colecciones-list");
  const sub = document.getElementById("carta-sub");
  if (!list) return;

  const ids = Object.keys(cartaColecciones);
  if (sub)
    sub.textContent = `${ids.length} de ${CARTA_MAX_COLECCIONES} colecciones`;

  if (!ids.length) {
    list.innerHTML = `<p class="text-purple-300/40 text-xs italic py-2">Aún no tienes colecciones. Crea la primera con el botón de abajo.</p>`;
    return;
  }

  // Una sola escritura al DOM (un solo reflow) en vez de ir agregando nodo por nodo
  list.innerHTML = ids
    .map((id) => htmlColeccion(id, cartaColecciones[id]))
    .join("");
  ids.forEach((id) => {
    const grid = list.querySelector(
      `[data-carta-id="${id}"] [data-carta-grid]`,
    );
    if (grid) grid.innerHTML = renderCartaGridHTML(id);
  });
}

function actualizarContadorColeccion(collId) {
  const coleccion = cartaColecciones[collId];
  const card = document.querySelector(
    `[data-carta-id="${collId}"] .carta-coleccion-count`,
  );
  if (coleccion && card) {
    card.textContent = `${coleccion.imagenes.filter(Boolean).length}/${CARTA_MAX_FOTOS}`;
  }
}

async function guardarTextoColeccion(collId, valor, btn) {
  const coleccion = cartaColecciones[collId];
  if (!coleccion) return;
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Guardando…";
  try {
    await updateDoc(cartaDocRef(collId), { texto: valor });
    coleccion.texto = valor;
    const preview = document.querySelector(
      `[data-carta-id="${collId}"] .carta-coleccion-preview`,
    );
    if (preview) {
      const tiene = !!valor.trim();
      preview.textContent = tiene ? valor : "Sin descripción";
      preview.classList.toggle("empty", !tiene);
    }
    btn.classList.remove("visible");
    toast("Descripción guardada.");
  } catch (err) {
    console.error(err);
    toast("No se pudo guardar.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function comprimirImagenCarta(dataURL, maxPx, calidad) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxPx || h > maxPx) {
        if (w >= h) {
          h = Math.round((h * maxPx) / w);
          w = maxPx;
        } else {
          w = Math.round((w * maxPx) / h);
          h = maxPx;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/webp", calidad));
      canvas.width = 0;
      canvas.height = 0; // libera memoria del canvas
    };
    img.onerror = () => reject(new Error("No se pudo leer la imagen"));
    img.src = dataURL;
  });
}
function dataURLtoBlobCarta(dataURL) {
  const [header, data] = dataURL.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const raw = atob(data);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function subirFotoCarta(collId, slotIndex, file) {
  const coleccion = cartaColecciones[collId];
  if (!coleccion) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      toast("Subiendo foto…");
      // maxPx bajado de 1024 a 800 y calidad a 0.75: menos datos que subir/bajar,
      // clave si la conexión o el equipo del usuario son limitados
      const comprimida = await comprimirImagenCarta(
        ev.target.result,
        800,
        0.75,
      );
      const blob = dataURLtoBlobCarta(comprimida);
      const path = `tiendas/${tiendaId}/carta/${collId}/slot_${slotIndex}.webp`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, blob, { contentType: "image/webp" });
      const finalURL = await getDownloadURL(ref);

      const nuevasImagenes = [...coleccion.imagenes];
      while (nuevasImagenes.length <= slotIndex) nuevasImagenes.push(null);
      nuevasImagenes[slotIndex] = finalURL;

      await updateDoc(cartaDocRef(collId), { imagenes: nuevasImagenes });
      coleccion.imagenes = nuevasImagenes;

      const grid = document.querySelector(
        `[data-carta-id="${collId}"] [data-carta-grid]`,
      );
      if (grid) grid.innerHTML = renderCartaGridHTML(collId);
      actualizarContadorColeccion(collId);
      toast("Foto guardada.");
    } catch (err) {
      console.error(err);
      toast("No se pudo subir la foto.", "error");
    }
  };
  reader.readAsDataURL(file);
}

async function eliminarFotoCarta(collId, slotIndex) {
  const coleccion = cartaColecciones[collId];
  if (!coleccion) return;
  try {
    const path = `tiendas/${tiendaId}/carta/${collId}/slot_${slotIndex}.webp`;
    await deleteObject(storageRef(storage, path)).catch(() => {});
    const nuevasImagenes = [...coleccion.imagenes];
    nuevasImagenes[slotIndex] = null;
    await updateDoc(cartaDocRef(collId), { imagenes: nuevasImagenes });
    coleccion.imagenes = nuevasImagenes;
    const grid = document.querySelector(
      `[data-carta-id="${collId}"] [data-carta-grid]`,
    );
    if (grid) grid.innerHTML = renderCartaGridHTML(collId);
    actualizarContadorColeccion(collId);
    toast("Foto eliminada.");
  } catch (err) {
    console.error(err);
    toast("No se pudo eliminar.", "error");
  }
}

async function eliminarColeccionCarta(collId) {
  const coleccion = cartaColecciones[collId];
  if (!coleccion) return;
  try {
    await Promise.all(
      (coleccion.imagenes || []).map((url, i) => {
        if (!url) return Promise.resolve();
        const path = `tiendas/${tiendaId}/carta/${collId}/slot_${i}.webp`;
        return deleteObject(storageRef(storage, path)).catch(() => {});
      }),
    );
    await deleteDoc(cartaDocRef(collId));
    delete cartaColecciones[collId];
    renderCartaColecciones();
    toast("Colección eliminada.");
  } catch (err) {
    console.error(err);
    toast("No se pudo eliminar la colección.", "error");
  }
}

/* ---- Toggle del acordeón principal ---- */
document.getElementById("carta-toggle")?.addEventListener("click", () => {
  document.getElementById("carta-body").classList.toggle("open");
  document.getElementById("carta-chevron").classList.toggle("open");
});

/* ---- Nueva colección ---- */
document
  .getElementById("btn-nueva-coleccion")
  ?.addEventListener("click", () => {
    if (Object.keys(cartaColecciones).length >= CARTA_MAX_COLECCIONES) {
      toast(`Máximo ${CARTA_MAX_COLECCIONES} colecciones.`, "error");
      return;
    }
    openOverlay("overlay-carta");
  });

document.getElementById("form-carta")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("input-carta-nombre");
  const nombre = input.value.trim();
  if (!nombre) return;
  if (Object.keys(cartaColecciones).length >= CARTA_MAX_COLECCIONES) {
    toast(`Máximo ${CARTA_MAX_COLECCIONES} colecciones.`, "error");
    return;
  }
  const slug =
    nombre
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || `coleccion_${Date.now()}`;
  if (cartaColecciones[slug]) {
    toast("Ya existe una colección con ese nombre.", "error");
    return;
  }
  const btn = document.getElementById("btn-guardar-carta");
  const label = document.getElementById("btn-guardar-carta-label");
  const originalText = label.textContent;
  btn.disabled = true;
  label.innerHTML = '<span class="spinner"></span>';
  try {
    await setDoc(cartaDocRef(slug), { nombre, imagenes: [], texto: "" });
    cartaColecciones[slug] = { nombre, imagenes: [], texto: "" };
    renderCartaColecciones();
    input.value = "";
    closeOverlay("overlay-carta");
    toast(`Colección "${nombre}" creada.`);
  } catch (err) {
    console.error(err);
    toast("No se pudo crear.", "error");
  } finally {
    btn.disabled = false;
    label.textContent = originalText;
  }
});

/* ---- UN SOLO listener delegado para TODA la lista (abrir/cerrar, eliminar,
   guardar texto, seleccionar foto, eliminar foto). Esto es lo que más ahorra
   memoria: en vez de cientos de listeners sueltos, hay solo 2 fijos. ---- */
const cartaListaEl = document.getElementById("carta-colecciones-list");

cartaListaEl?.addEventListener("click", (e) => {
  const card = e.target.closest("[data-carta-id]");
  if (!card) return;
  const collId = card.dataset.cartaId;

  if (e.target.closest("[data-carta-del]")) {
    const coleccion = cartaColecciones[collId];
    askConfirm(
      "¿Eliminar colección?",
      `"${coleccion?.nombre}" y todas sus fotos se eliminarán permanentemente.`,
      () => eliminarColeccionCarta(collId),
    );
    return;
  }

  if (e.target.closest("[data-carta-save-texto]")) {
    const textarea = card.querySelector("[data-carta-textarea]");
    guardarTextoColeccion(
      collId,
      textarea.value,
      e.target.closest("[data-carta-save-texto]"),
    );
    return;
  }

  const fotoDel = e.target.closest("[data-carta-foto-del]");
  if (fotoDel) {
    const slot = fotoDel.closest("[data-carta-slot]");
    askConfirm("¿Eliminar foto?", "Esta foto se quitará de la colección.", () =>
      eliminarFotoCarta(collId, parseInt(slot.dataset.cartaSlot, 10)),
    );
    return;
  }

  const slotEl = e.target.closest("[data-carta-slot]");
  if (slotEl) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.onchange = (ev) => {
      const file = ev.target.files[0];
      if (file)
        subirFotoCarta(collId, parseInt(slotEl.dataset.cartaSlot, 10), file);
    };
    input.click();
    return;
  }

  if (e.target.closest("[data-carta-toggle]")) {
    const head = card.querySelector("[data-carta-toggle]");
    const body = card.querySelector(".carta-coleccion-body");
    body.classList.toggle("open");
    head.classList.toggle("open");
  }
});

cartaListaEl?.addEventListener("input", (e) => {
  if (!e.target.matches("[data-carta-textarea]")) return;
  const card = e.target.closest("[data-carta-id]");
  const collId = card.dataset.cartaId;
  const coleccion = cartaColecciones[collId];
  const btn = card.querySelector("[data-carta-save-texto]");
  btn.classList.toggle("visible", e.target.value !== (coleccion?.texto || ""));
});

actualizarVisibilidadCarta();
