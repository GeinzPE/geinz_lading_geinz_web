/* ════════════════════════════════════════════════════════════════
   puntos_por_producto.js · Fidelización → "Productos a canjear"
   Sección "Productos que regalan puntos".
   Lee el catálogo desde Firestore y guarda en cada producto el mismo
   campo `puntos` de siempre: { activo, cantidad, descripcion }.
   ════════════════════════════════════════════════════════════════ */
import {
  collection,
  doc,
  getDocs,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { tiendaDoc } from "../rutas/rutas.js";

const _qs = new URLSearchParams(window.location.search);
let tiendaId = _qs.get("id") || sessionStorage.getItem("tiendaId");
let localidad = (
  _qs.get("localidad") ||
  sessionStorage.getItem("localidad") ||
  ""
)
  .trim()
  .toLowerCase();

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

let catalogo = []; // [{ id, nombre, productos: [{ id, data }] }]
let cargado = false;
let cargando = false;

/* ---------- refs (misma estructura que productos.js) ---------- */
const categoriasRef = () =>
  collection(tiendaDoc(localidad, "tiendas", tiendaId), "productos");
const productosRef = (catId) => collection(doc(categoriasRef(), catId), catId);

/* ---------- toast (usa el #toast que ya existe en la página) ---------- */
function toast(msg, error = false) {
  const t = $("toast");
  const m = $("toastMsg");
  if (!t || !m) return;
  m.textContent = msg;
  t.classList.toggle("err", error);
  t.classList.add("show");
  clearTimeout(t._pp);
  t._pp = setTimeout(() => t.classList.remove("show"), 2600);
}

function setBtnCargando(btn, on, textoOriginal) {
  btn.disabled = on;
  btn.innerHTML = on ? '<span class="btn-spinner"></span>' : textoOriginal;
}

/* ---------- helpers de datos ---------- */
const puntosDe = (p) => Number(p.data.puntos?.cantidad) || 0;
const tienePuntos = (p) => puntosDe(p) > 0;

function buscarProducto(catId, prodId) {
  const cat = catalogo.find((c) => c.id === catId);
  const prod = cat?.productos.find((p) => p.id === prodId);
  return { cat, prod };
}

/* ---------- carga del catálogo ---------- */
async function cargarCatalogo() {
  if (!tiendaId || !localidad || cargando) return;
  cargando = true;
  $("ppCategoria").innerHTML = `<option value="">Cargando…</option>`;
  try {
    const catsSnap = await getDocs(categoriasRef());
    catalogo = await Promise.all(
      catsSnap.docs.map(async (c) => {
        const ps = await getDocs(productosRef(c.id));
        return {
          id: c.id,
          nombre: c.data().nombre || c.id,
          productos: ps.docs.map((d) => ({ id: d.id, data: d.data() })),
        };
      }),
    );
    catalogo.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    cargado = true;
    pintarCategorias();
    pintarProductos();
    pintarLista();
  } catch (err) {
    console.error(err);
    toast("No se pudo cargar tu catálogo.", true);
    $("ppCategoria").innerHTML = `<option value="">Error al cargar</option>`;
  } finally {
    cargando = false;
  }
}

/* ---------- selects ---------- */
function pintarCategorias() {
  const sel = $("ppCategoria");
  const actual = sel.value;
  if (!catalogo.length) {
    sel.innerHTML = `<option value="">No tienes categorías en tu catálogo</option>`;
    return;
  }
  sel.innerHTML =
    `<option value="">Selecciona una categoría…</option>` +
    catalogo
      .map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`)
      .join("");
  if (catalogo.some((c) => c.id === actual)) sel.value = actual;
}

function pintarProductos() {
  const catId = $("ppCategoria").value;
  const sel = $("ppProducto");
  const cat = catalogo.find((c) => c.id === catId);
  if (!cat) {
    sel.disabled = true;
    sel.innerHTML = `<option value="">Elige una categoría primero</option>`;
    return;
  }
  if (!cat.productos.length) {
    sel.disabled = true;
    sel.innerHTML = `<option value="">Esta categoría no tiene productos</option>`;
    return;
  }
  const actual = sel.value;
  sel.disabled = false;
  sel.innerHTML =
    `<option value="">Selecciona un producto…</option>` +
    cat.productos
      .map((p) => {
        const marca = tienePuntos(p) ? ` ⭐ +${puntosDe(p)} pts` : "";
        return `<option value="${esc(p.id)}">${esc(p.data.nombre)}${marca}</option>`;
      })
      .join("");
  if (cat.productos.some((p) => p.id === actual)) sel.value = actual;
}

/* ---------- vista previa + formulario ---------- */
function pintarFormulario() {
  const catId = $("ppCategoria").value;
  const prodId = $("ppProducto").value;
  const { prod } = buscarProducto(catId, prodId);
  const preview = $("ppPreview");
  const btn = $("ppGuardar");

  if (!prod) {
    preview.style.display = "none";
    btn.disabled = true;
    btn.textContent = "Guardar puntos";
    $("ppCantidad").value = "";
    $("ppDescripcion").value = "";
    return;
  }

  const d = prod.data;
  preview.style.display = "flex";
  $("ppPreviewImg").src = d.imagenes?.[0]?.url || "";
  $("ppPreviewImg").style.display = d.imagenes?.[0]?.url ? "block" : "none";
  $("ppPreviewNombre").textContent = d.nombre;
  const yaTiene = tienePuntos(prod);
  $("ppPreviewSub").textContent =
    `S/ ${Number(d.precio || 0).toFixed(2)}` +
    (yaTiene ? ` · Hoy regala ${puntosDe(prod)} pts` : " · Aún no regala puntos");

  $("ppCantidad").value = yaTiene ? puntosDe(prod) : "";
  $("ppDescripcion").value = d.puntos?.descripcion || "";
  btn.disabled = false;
  btn.textContent = yaTiene ? "Actualizar puntos" : "Guardar puntos";
}

/* ---------- guardar ---------- */
async function guardar() {
  const catId = $("ppCategoria").value;
  const prodId = $("ppProducto").value;
  const { prod } = buscarProducto(catId, prodId);
  if (!prod) return;

  const cantidad = Math.floor(Number($("ppCantidad").value));
  const descripcion = $("ppDescripcion").value.trim();
  if (!(cantidad >= 1 && cantidad <= 100000))
    return toast("Escribe cuántos puntos gana el cliente (mínimo 1).", true);

  const btn = $("ppGuardar");
  const original = btn.textContent;
  setBtnCargando(btn, true, original);
  try {
    const puntos = {
      activo: prod.data.puntos?.activo === false && tienePuntos(prod) ? false : true,
      cantidad,
      descripcion,
    };
    await updateDoc(doc(productosRef(catId), prodId), { puntos });
    prod.data.puntos = puntos;
    toast(`"${prod.data.nombre}" ahora regala ${cantidad} puntos.`);

    $("ppProducto").value = "";
    pintarProductos();
    pintarFormulario();
    pintarLista();
  } catch (err) {
    console.error(err);
    toast("No se pudo guardar. Intenta de nuevo.", true);
    setBtnCargando(btn, false, original);
  }
}

/* ---------- lista de productos que regalan puntos ---------- */
function pintarLista() {
  const lista = $("ppLista");
  const items = [];
  catalogo.forEach((c) =>
    c.productos.filter(tienePuntos).forEach((p) => items.push({ cat: c, p })),
  );

  if (!items.length) {
    lista.innerHTML = `<div class="empty-state">Aún no hay productos que regalen puntos. Crea el primero desde la izquierda.</div>`;
    return;
  }

  lista.innerHTML = items
    .map(({ cat, p }) => {
      const d = p.data;
      const activo = d.puntos?.activo !== false;
      const img = d.imagenes?.[0]?.url;
      return `
      <div class="item-row" data-cat="${esc(cat.id)}" data-prod="${esc(p.id)}">
        <div class="item-icon">${
          img
            ? `<img src="${esc(img)}" alt="" style="width:100%;height:100%;object-fit:cover;">`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z"/></svg>`
        }</div>
        <div class="item-main">
          <div class="item-title">${esc(d.nombre)}
            <span class="badge ${activo ? "on" : "off"}">⭐ +${puntosDe(p)} pts</span>
          </div>
          <div class="item-sub">${esc(cat.nombre)}${d.puntos?.descripcion ? " · " + esc(d.puntos.descripcion) : ""}</div>
        </div>
        <label class="switch" title="Activar / pausar">
          <input type="checkbox" data-pp="toggle" ${activo ? "checked" : ""}>
          <span class="slider"></span>
        </label>
        <button type="button" class="item-remove" data-pp="edit" title="Editar">✎</button>
        <button type="button" class="item-remove" data-pp="del" title="Quitar puntos">✕</button>
      </div>`;
    })
    .join("");
}

async function onListaChange(e) {
  const sw = e.target.closest('[data-pp="toggle"]');
  if (!sw) return;
  const row = sw.closest("[data-prod]");
  const { prod } = buscarProducto(row.dataset.cat, row.dataset.prod);
  if (!prod) return;
  const puntos = { ...prod.data.puntos, activo: sw.checked };
  try {
    await updateDoc(doc(productosRef(row.dataset.cat), row.dataset.prod), { puntos });
    prod.data.puntos = puntos;
    toast(sw.checked ? "Puntos activados." : "Puntos pausados.");
    pintarLista();
  } catch (err) {
    console.error(err);
    sw.checked = !sw.checked;
    toast("No se pudo actualizar.", true);
  }
}

async function onListaClick(e) {
  const btn = e.target.closest("[data-pp]");
  if (!btn || btn.dataset.pp === "toggle") return;
  const row = btn.closest("[data-prod]");
  if (!row) return;
  const catId = row.dataset.cat;
  const prodId = row.dataset.prod;
  const { prod } = buscarProducto(catId, prodId);
  if (!prod) return;

  if (btn.dataset.pp === "edit") {
    $("ppCategoria").value = catId;
    pintarProductos();
    $("ppProducto").value = prodId;
    pintarFormulario();
    $("ppCantidad").focus();
    $("ppCategoria").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (btn.dataset.pp === "del") {
    if (!confirm(`¿Dejar de regalar puntos con "${prod.data.nombre}"?`)) return;
    const puntos = { activo: false, cantidad: 0, descripcion: "" };
    try {
      await updateDoc(doc(productosRef(catId), prodId), { puntos });
      prod.data.puntos = puntos;
      toast("Producto quitado de la lista de puntos.");
      pintarProductos();
      pintarFormulario();
      pintarLista();
    } catch (err) {
      console.error(err);
      toast("No se pudo quitar.", true);
    }
  }
}

/* ---------- arranque ---------- */
function construirEventos() {
  if ($("ppSeccion")?.dataset.listo) return;
  const sec = $("ppSeccion");
  if (!sec) return;
  sec.dataset.listo = "1";

  $("ppCategoria").addEventListener("change", () => {
    $("ppProducto").value = "";
    pintarProductos();
    pintarFormulario();
  });
  $("ppProducto").addEventListener("change", pintarFormulario);
  $("ppGuardar").addEventListener("click", guardar);
  $("ppRecargar").addEventListener("click", () => {
    cargado = false;
    cargarCatalogo();
  });
  $("ppLista").addEventListener("click", onListaClick);
  $("ppLista").addEventListener("change", onListaChange);

  // Carga perezosa: solo cuando el admin abre la pestaña "Productos a canjear"
  document
    .querySelector('.nav-item[data-panel="descuentos"]')
    ?.addEventListener("click", () => {
      if (!cargado) cargarCatalogo();
    });
}

function iniciar() {
  construirEventos();
  cargado = false;
  catalogo = [];
  if ($("panel-descuentos")?.classList.contains("active")) cargarCatalogo();
}

// El dashboard padre manda los datos de la tienda por postMessage
window.addEventListener("message", (e) => {
  const d = e.data;
  if (!d) return;
  let id = null;
  let loc = null;
  if (d.tipo === "DATOS_TIENDA") {
    id = d.tiendaId;
    loc = d.localidad;
  } else if (d.type === "DATOS_TIENDA") {
    id = d.payload?.id_tienda;
    loc = d.payload?.localidad;
  }
  if (!id || !loc) return;
  loc = String(loc).trim().toLowerCase();
  if (id !== tiendaId || loc !== localidad) {
    tiendaId = id;
    localidad = loc;
    iniciar();
  }
});

if (tiendaId && localidad) iniciar();
else construirEventos();