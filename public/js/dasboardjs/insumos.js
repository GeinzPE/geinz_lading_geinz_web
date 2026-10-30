import {
  doc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  increment,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { tiendaSubCol, tiendaSubDoc } from "../rutas/rutas.js";

/* .../tiendas/<id>/insumos/<insumoId>   ← precios por mes + stock_base
   .../tiendas/<id>/gastos_insumos/<id>  ← historial de gastos
   .../tiendas/<id>/pedidos              ← solo lectura (caja) */
const INSUMOS_COL = "insumos";
const GASTOS_COL = "gastos_insumos";

/* ---------------- Unidades (b = unidad base: g, ml o unid) ---------------- */
const U = {
  unid: { t: "c", f: 1, b: "unid" },
  docena: { t: "c", f: 12, b: "unid" },
  g: { t: "m", f: 1, b: "g" },
  kg: { t: "m", f: 1000, b: "g" },
  ozp: { t: "m", f: 28.3495, b: "g" },
  lb: { t: "m", f: 453.592, b: "g" },
  ml: { t: "m", f: 1, b: "ml" },
  l: { t: "m", f: 1000, b: "ml" },
  oz: { t: "m", f: 29.5735, b: "ml" },
};
const UL = {
  unid: "unidad",
  docena: "docena",
  g: "g",
  kg: "kg",
  ozp: "oz (peso)",
  lb: "lb",
  ml: "ml",
  l: "litro",
  oz: "oz líquida",
};
const unidadesDeBase = (b) => Object.keys(U).filter((u) => U[u].b === b);
const baseDe = (u) => U[u]?.b || "unid";

/* ---------------- Utilidades ---------------- */
const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const money = (n) => "S/ " + (isFinite(n) ? n : 0).toFixed(2);
const num = (v) => Math.max(0, parseFloat(v) || 0);
const baseQty = (q, u) => num(q) * (U[u]?.f || 1);
const limaMes = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);
const mk = (ym) => "m_" + String(ym).replace("-", "_");
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const mkLabel = (k) => {
  const [, y, m] = k.split("_");
  return `${MESES[+m - 1]} ${y}`;
};
const fmtStock = (n, b) => {
  n = Number(n) || 0;
  if (b === "unid") return `${+n.toFixed(2)} unid`;
  if (Math.abs(n) >= 1000) return `${+(n / 1000).toFixed(2)} ${b === "g" ? "kg" : "l"}`;
  return `${+n.toFixed(1)} ${b}`;
};

let toastT;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), 2600);
}
const openMd = (id) => $(id).classList.add("show");
const closeMd = (id) => $(id).classList.remove("show");
document.querySelectorAll("[data-close]").forEach((b) =>
  b.addEventListener("click", () => closeMd(b.dataset.close)),
);
document.querySelectorAll(".overlay").forEach((o) =>
  o.addEventListener("click", (e) => {
    if (e.target === o) closeMd(o.id);
  }),
);

/* ---------------- Contexto de la tienda ---------------- */
let tiendaId = sessionStorage.getItem("tiendaId");
let localidad = sessionStorage.getItem("localidad");
let started = false;

window.addEventListener("message", (e) => {
  if (e.origin !== window.location.origin) return;
  const d = e.data;
  if (!d || (d.type !== "DATOS_TIENDA" && d.tipo !== "DATOS_TIENDA")) return;
  const id = d.id || d.tiendaId || d.payload?.id_tienda;
  const loc = d.localidad || d.payload?.localidad;
  if (id) {
    tiendaId = id;
    sessionStorage.setItem("tiendaId", id);
  }
  if (loc) {
    localidad = loc;
    sessionStorage.setItem("localidad", loc);
  }
  start();
});
window.parent?.postMessage({ type: "PEDIR_DATOS_TIENDA" }, window.location.origin);

const col = (n) => tiendaSubCol(localidad, "tiendas", tiendaId, n);
const docRef = (n, id) => tiendaSubDoc(localidad, "tiendas", tiendaId, n, id);

/* ---------------- Estado ---------------- */
const ingMap = new Map();
let gastosAll = [];
let ventasTotal = null;
let mesSel = limaMes();

/* ══════════ PRECIO DE UN INSUMO SEGÚN EL MES ══════════ */
const keysDe = (i) => Object.keys(i.precios || {}).sort();
function entradaMes(i, ym = mesSel) {
  const keys = keysDe(i);
  if (!keys.length) return null;
  const objetivo = mk(ym);
  let pick = null;
  for (const k of keys) if (k <= objetivo) pick = k;
  if (!pick) pick = keys[0];
  return { key: pick, ...i.precios[pick] };
}
function entradaPrevia(i, key) {
  const keys = keysDe(i);
  const idx = keys.indexOf(key);
  return idx > 0 ? { key: keys[idx - 1], ...i.precios[keys[idx - 1]] } : null;
}
const baseIns = (i) => i.base || baseDe(entradaMes(i)?.unidad);

/* ══════════ CAJA ══════════ */
async function cargarVentas() {
  $("chipVentas").textContent = "…";
  try {
    const snap = await getDocs(
      query(col("pedidos"), orderBy("timestamp", "desc"), limit(3000)),
    );
    let t = 0;
    snap.forEach((d) => {
      const raw = d.data();
      const p = raw.pedido ? raw.pedido : raw;
      if ((p.estado || "").toLowerCase() === "entregado") t += Number(p.total) || 0;
    });
    ventasTotal = t;
  } catch (e) {
    console.error(e);
    ventasTotal = null;
    toast("No se pudieron leer las ventas.");
  }
  renderCaja();
}
const gastoNegocio = () =>
  gastosAll.filter((g) => g.descuenta_caja).reduce((s, g) => s + num(g.monto), 0);
const inversionDueno = () =>
  gastosAll.filter((g) => g.es_inversion).reduce((s, g) => s + num(g.monto), 0);
const cajaDisponible = () => (ventasTotal ?? 0) - gastoNegocio();

function renderCaja() {
  $("chipVentas").textContent = ventasTotal === null ? "—" : money(ventasTotal);
  $("chipGastos").textContent = money(gastoNegocio());
  const caja = cajaDisponible();
  const c = $("chipCaja");
  c.textContent = money(caja);
  c.style.color = caja < 0 ? "var(--bad)" : "";
  $("chipInv").textContent = money(inversionDueno());
}

/* ══════════ PESTAÑAS / MES ══════════ */
function goTab(t) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
  document.querySelectorAll(".pane").forEach((p) => (p.hidden = p.id !== "pane-" + t));
  if (t === "gas") renderGastos();
}
document.querySelectorAll(".tab").forEach((b) =>
  b.addEventListener("click", () => goTab(b.dataset.tab)),
);
$("mesSel").value = mesSel;
$("mesSel").addEventListener("change", (e) => {
  if (!e.target.value) return;
  mesSel = e.target.value;
  renderAll();
});
$("btnRefCaja").addEventListener("click", cargarVentas);

/* ══════════ LISTA DE INSUMOS ══════════ */
let catSel = "todas";
const catDe = (i) => (i?.categoria || "").trim();
const categoriasIns = () =>
  [...new Set([...ingMap.values()].map(catDe).filter(Boolean))].sort((a, b) => a.localeCompare(b));

function cardIns(i) {
  const e = entradaMes(i);
  if (!e) return "";
  const prev = entradaPrevia(i, e.key);
  let varHtml = "";
  if (prev && prev.costo_base > 0) {
    const pct = ((e.costo_base - prev.costo_base) / prev.costo_base) * 100;
    if (Math.abs(pct) >= 0.1)
      varHtml = `<span class="var ${pct > 0 ? "up" : "down"}">${pct > 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}%</span>`;
  }
  const porUnidad = e.costo_base * (U[e.unidad]?.f || 1);
  const etiqueta = e.unidad === "unid" ? "c/u" : `por ${UL[e.unidad]}`;
  const st = Number(i.stock_base) || 0;
  const b = baseIns(i);
  return `
  <div class="card" data-id="${i.id}">
    <div class="card-top">
      <div>
        <div class="card-name">${esc(i.nombre)}</div>
        <div class="card-sub">Pagaste ${money(e.precio)} por ${e.cantidad} ${UL[e.unidad]} · ${mkLabel(e.key)}
          <span class="badge ${e.origen === "bolsillo" ? "dueno" : "neg"}">${e.origen === "bolsillo" ? "Mi bolsillo" : "Negocio"}</span></div>
        <div class="card-sub">Stock: <b class="${st > 0 ? "pos" : "neg"}">${fmtStock(st, b)}</b></div>
      </div>
      <div class="card-price"><b>${money(porUnidad)}${varHtml}</b><small>${etiqueta}</small></div>
    </div>
    <div class="card-actions">
      <button class="btn sm go" data-a="comprar">+ Nueva compra / precio</button>
      <button class="btn sm" data-a="stock">Stock</button>
      <button class="btn sm" data-a="rename">✎ Nombre</button>
      <button class="btn sm" data-a="cat">Categoría</button>
      <button class="btn sm" data-a="hist">Historial</button>
      <button class="btn sm del" data-a="del">Eliminar</button>
    </div>
  </div>`;
}

function renderIns() {
  const q = $("qIns").value.trim().toLowerCase();
  const todos = [...ingMap.values()];
  const cats = categoriasIns();
  if (catSel !== "todas" && catSel !== "__sin" && !cats.includes(catSel)) catSel = "todas";

  const nSin = todos.filter((i) => !catDe(i)).length;
  const chip = (v, l, n) =>
    `<button class="btn sm ${catSel === v ? "go" : ""}" data-cat="${esc(v)}">${esc(l)} (${n})</button>`;
  $("catChips").innerHTML =
    chip("todas", "Todas", todos.length) +
    cats.map((c) => chip(c, c, todos.filter((i) => catDe(i) === c).length)).join("") +
    (nSin ? chip("__sin", "Sin categoría", nSin) : "") +
    (catSel !== "todas" && catSel !== "__sin" ? `<button class="btn sm" data-catren>✎ Renombrar</button>` : "");

  $("dlIns").innerHTML = todos.map((i) => `<option value="${esc(i.nombre)}"></option>`).join("");

  const arr = todos
    .filter((i) => !q || (i.nombre || "").toLowerCase().includes(q))
    .filter((i) => catSel === "todas" || (catSel === "__sin" ? !catDe(i) : catDe(i) === catSel))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));

  if (!arr.length) {
    $("listIns").innerHTML = `<div class="empty">${
      ingMap.size ? "No hay coincidencias." : "Aún no tienes insumos. Toca “Nueva compra”."
    }</div>`;
    return;
  }

  if (catSel !== "todas") {
    $("listIns").innerHTML = arr.map(cardIns).join("");
    return;
  }
  const grupos = {};
  arr.forEach((i) => (grupos[catDe(i) || ""] ||= []).push(i));
  const orden = Object.keys(grupos).sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  $("listIns").innerHTML = orden
    .map(
      (c) =>
        `<h2>${esc(c || "Sin categoría")} <span class="mut">(${grupos[c].length})</span></h2>` +
        grupos[c].map(cardIns).join(""),
    )
    .join("");
}

$("catChips").addEventListener("click", async (e) => {
  const c = e.target.closest("[data-cat]");
  if (c) {
    catSel = c.dataset.cat;
    return renderIns();
  }
  if (e.target.closest("[data-catren]")) {
    const nuevo = (prompt("Nuevo nombre de la categoría:", catSel) || "").trim();
    if (!nuevo || nuevo === catSel) return;
    try {
      await Promise.all(
        [...ingMap.values()]
          .filter((i) => catDe(i) === catSel)
          .map((i) => updateDoc(docRef(INSUMOS_COL, i.id), { categoria: nuevo })),
      );
      catSel = nuevo;
      toast("✓ Categoría renombrada");
    } catch (err) {
      console.error(err);
      toast("❌ No se pudo renombrar.");
    }
  }
});

async function moverCategoria(id) {
  const ing = ingMap.get(id);
  if (!ing) return;
  const ex = categoriasIns();
  const r = prompt(
    `Categoría de "${ing.nombre}"\nEscribe una existente o una nueva (vacío = sin categoría).\n\nExistentes: ${ex.join(", ") || "ninguna"}`,
    catDe(ing),
  );
  if (r === null) return;
  try {
    await updateDoc(docRef(INSUMOS_COL, id), { categoria: r.trim(), actualizado: serverTimestamp() });
    toast("✓ Categoría guardada");
  } catch (e) {
    console.error(e);
    toast("❌ No se pudo guardar.");
  }
}
$("qIns").addEventListener("input", renderIns);
$("listIns").addEventListener("click", (e) => {
  const b = e.target.closest("[data-a]");
  if (!b) return;
  const id = b.closest("[data-id]").dataset.id;
  if (b.dataset.a === "comprar") openCompra(id);
  if (b.dataset.a === "stock") openStock(id);
  if (b.dataset.a === "rename") renombrarInsumo(id);
  if (b.dataset.a === "cat") moverCategoria(id);
  if (b.dataset.a === "hist") openHist(id);
  if (b.dataset.a === "del") borrarInsumo(id);
});

async function renombrarInsumo(id) {
  const ing = ingMap.get(id);
  if (!ing) return;
  const nuevo = (prompt("Nuevo nombre del insumo:", ing.nombre || "") || "").trim();
  if (!nuevo || nuevo === ing.nombre) return;
  const dup = [...ingMap.values()].some(
    (i) => i.id !== id && (i.nombre || "").toLowerCase() === nuevo.toLowerCase(),
  );
  if (dup) return toast("Ya existe un insumo con ese nombre.");
  try {
    await updateDoc(docRef(INSUMOS_COL, id), {
      nombre: nuevo,
      nombre_lower: nuevo.toLowerCase(),
      actualizado: serverTimestamp(),
    });
    await Promise.all(
      gastosAll
        .filter((g) => g.insumoId === id)
        .map((g) => updateDoc(docRef(GASTOS_COL, g.id), { nombre: nuevo })),
    );
    toast("✓ Nombre actualizado");
  } catch (e) {
    console.error(e);
    toast("❌ No se pudo renombrar.");
  }
}

/* ══════════ ELIMINAR INSUMO ══════════ */
async function borrarInsumo(id) {
  const ing = ingMap.get(id);
  if (!ing) return;

  const nGastos = gastosAll.filter((g) => g.insumoId === id).length;
  const msg =
    `¿Eliminar "${ing.nombre}"?\n\n` +
    `Se borrarán sus precios y su stock.` +
    (nGastos
      ? `\nSus ${nGastos} gasto(s) registrados se mantienen en el historial de gastos (y en la caja).`
      : "");
  if (!confirm(msg)) return;

  try {
    await deleteDoc(docRef(INSUMOS_COL, id));
    toast("Insumo eliminado.");
  } catch (e) {
    console.error(e);
    toast("❌ No se pudo eliminar.");
  }
}

/* ══════════ MODAL COMPRA ══════════ */
let compraId = null;

function llenarUnidades(base, sel) {
  const lista = base ? unidadesDeBase(base) : Object.keys(U);
  $("cUnidad").innerHTML = lista
    .map((u) => `<option value="${u}" ${u === sel ? "selected" : ""}>${UL[u]}</option>`)
    .join("");
}

function llenarCats(sel = "") {
  const cats = categoriasIns();
  if (sel && !cats.includes(sel)) cats.push(sel);
  $("cCat").innerHTML =
    `<option value="">— Sin categoría —</option>` +
    cats.map((c) => `<option value="${esc(c)}" ${c === sel ? "selected" : ""}>${esc(c)}</option>`).join("") +
    `<option value="__nueva">＋ Nueva categoría…</option>`;
}
$("cCat").addEventListener("change", () => {
  if ($("cCat").value !== "__nueva") return;
  const n = (prompt("Nombre de la nueva categoría:") || "").trim();
  llenarCats(n);
});
function openCompra(id = null) {
  compraId = id;
  const ing = id ? ingMap.get(id) : null;
  const e = ing ? entradaMes(ing, limaMes()) : null;
  $("cTitulo").textContent = ing ? `Nueva compra · ${ing.nombre}` : "Nueva compra";
  $("cNombre").value = ing?.nombre || "";
  $("cNombre").disabled = !!ing;
  $("cCant").value = e?.cantidad ?? "";
  $("cPrecio").value = "";
  $("cMes").value = mesSel;
  $("cGasto").checked = true;
  document.querySelector('input[name="origen"][value="negocio"]').checked = true;
  llenarUnidades(ing ? baseIns(ing) : null, e?.unidad || "unid");
  llenarCats(ing ? catDe(ing) : catSel !== "todas" && catSel !== "__sin" ? catSel : "");
  $("cHint").textContent = ing ? "Escribe el nuevo precio para registrar el cambio." : "";
  $("cAviso").hidden = true;
  actualizarPreviewCompra();
  openMd("mdCompra");
  setTimeout(() => (ing ? $("cPrecio") : $("cNombre")).focus(), 200);
}
$("btnNuevoIns").addEventListener("click", () => openCompra(null));

$("cNombre").addEventListener("input", () => {
  if (compraId) return;
  const n = $("cNombre").value.trim().toLowerCase();
  const ex = [...ingMap.values()].find((i) => (i.nombre || "").toLowerCase() === n);
  if (ex) {
    const e = entradaMes(ex, limaMes());
    llenarUnidades(baseIns(ex), e?.unidad);
    llenarCats(catDe(ex));
    $("cHint").textContent = "Ese insumo ya existe: se agregará un nuevo precio y se sumará a su stock.";
  } else {
    if ($("cUnidad").options.length < Object.keys(U).length) llenarUnidades(null, "unid");
    $("cHint").textContent = "";
  }
});

function insumoDeModal() {
  if (compraId) return ingMap.get(compraId);
  const n = $("cNombre").value.trim().toLowerCase();
  return [...ingMap.values()].find((i) => (i.nombre || "").toLowerCase() === n) || null;
}

function actualizarPreviewCompra() {
  const cant = num($("cCant").value);
  const precio = num($("cPrecio").value);
  const u = $("cUnidad").value;
  const base = baseQty(cant, u);
  const p = $("cPreview");
  if (!cant || !precio || !base) {
    p.textContent = "";
    $("cAviso").hidden = true;
    return;
  }
  const cb = precio / base;
  const b = U[u].b;
  p.textContent =
    u === b
      ? `Cada ${UL[u]} te cuesta ${money(cb)}`
      : `Cada ${UL[u]} te cuesta ${money(precio / cant)} · cada ${UL[b] || b} ${money(cb)}`;

  const origen = document.querySelector('input[name="origen"]:checked').value;
  const av = $("cAviso");
  if (origen === "negocio" && $("cGasto").checked && precio > cajaDisponible()) {
    av.hidden = false;
    av.textContent = `⚠️ La caja tiene ${money(cajaDisponible())} y esta compra es de ${money(precio)}. Si lo pagaste de tu bolsillo, elige “De mi bolsillo”.`;
  } else av.hidden = true;
}
["cCant", "cPrecio", "cUnidad", "cGasto"].forEach((id) =>
  $(id).addEventListener("input", actualizarPreviewCompra),
);
document
  .querySelectorAll('input[name="origen"]')
  .forEach((r) => r.addEventListener("change", actualizarPreviewCompra));

$("btnGuardarCompra").addEventListener("click", async () => {
  const nombre = $("cNombre").value.trim();
  const cantidad = num($("cCant").value);
  const precio = num($("cPrecio").value);
  const unidad = $("cUnidad").value;
  const mes = $("cMes").value;
  const origen = document.querySelector('input[name="origen"]:checked').value;
  const registrar = $("cGasto").checked;
  const categoria = $("cCat").value === "__nueva" ? "" : $("cCat").value;
  if (!nombre) return toast("Escribe el nombre del insumo.");
  if (!cantidad) return toast("Escribe la cantidad que compraste.");
  if (!precio) return toast("Escribe cuánto pagaste.");
  if (!mes) return toast("Elige el mes.");

  const existente = insumoDeModal();
  const base = baseDe(unidad);
  if (existente && baseIns(existente) !== base)
    return toast(`"${existente.nombre}" se mide en ${baseIns(existente)}; usa una unidad del mismo tipo.`);

  if (registrar && origen === "negocio" && precio > cajaDisponible())
    if (!confirm(`La caja solo tiene ${money(cajaDisponible())}.\n¿Registrar igual como gasto del negocio?`)) return;

  const btn = $("btnGuardarCompra");
  btn.disabled = true;
  btn.textContent = "Guardando…";
  try {
    const cantBase = baseQty(cantidad, unidad);
    const entrada = {
      precio,
      cantidad,
      unidad,
      costo_base: precio / cantBase,
      origen,
      fecha: Date.now(),
    };
    const key = mk(mes);
    let insumoId;
    if (existente) {
      insumoId = existente.id;
      const upd = { [`precios.${key}`]: entrada, categoria, actualizado: serverTimestamp() };
      if (registrar) upd.stock_base = increment(cantBase);
      if (!existente.base) upd.base = base;
      await updateDoc(docRef(INSUMOS_COL, insumoId), upd);
    } else {
      const ref = doc(col(INSUMOS_COL));
      insumoId = ref.id;
      await setDoc(ref, {
        nombre,
        nombre_lower: nombre.toLowerCase(),
        categoria,
        tipo: U[unidad].t,
        base,
        stock_base: registrar ? cantBase : 0,
        precios: { [key]: entrada },
        createdAt: serverTimestamp(),
        actualizado: serverTimestamp(),
      });
    }

    if (registrar) {
      await addDoc(col(GASTOS_COL), {
        tipo: "compra_insumo",
        insumoId,
        nombre: existente?.nombre || nombre,
        monto: precio,
        cantidad,
        unidad,
        cantidad_base: cantBase,
        mes,
        origen,
        descuenta_caja: origen === "negocio",
        es_inversion: origen === "bolsillo",
        fecha: serverTimestamp(),
        fechaMs: Date.now(),
      });
    }
    closeMd("mdCompra");
    toast(
      registrar
        ? origen === "bolsillo"
          ? "✓ Guardado como inversión del dueño + stock"
          : "✓ Guardado, descontado de la caja + stock"
        : "✓ Precio actualizado",
    );
  } catch (e) {
    console.error(e);
    toast("❌ No se pudo guardar.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar";
  }
});

/* ══════════ AJUSTE DE STOCK ══════════ */
let stockId = null;
function openStock(id) {
  const ing = ingMap.get(id);
  if (!ing) return;
  stockId = id;
  const b = baseIns(ing);
  $("sTitulo").textContent = `Stock · ${ing.nombre}`;
  $("sActual").textContent = `Ahora tienes: ${fmtStock(Number(ing.stock_base) || 0, b)}`;
  $("sCant").value = "";
  $("sModo").value = "restar";
  $("sUnidad").innerHTML = unidadesDeBase(b)
    .map((u) => `<option value="${u}" ${u === b ? "selected" : ""}>${UL[u]}</option>`)
    .join("");
  openMd("mdStock");
  setTimeout(() => $("sCant").focus(), 200);
}
$("btnGuardarStock").addEventListener("click", async () => {
  const ing = ingMap.get(stockId);
  if (!ing) return;
  const modo = $("sModo").value;
  if ($("sCant").value === "") return toast("Escribe la cantidad.");
  const cant = baseQty($("sCant").value, $("sUnidad").value);
  if (modo !== "fijar" && !cant) return toast("La cantidad debe ser mayor a 0.");
  const btn = $("btnGuardarStock");
  btn.disabled = true;
  try {
    const upd = { actualizado: serverTimestamp() };
    upd.stock_base = modo === "fijar" ? cant : increment(modo === "sumar" ? cant : -cant);
    if (!ing.base) upd.base = baseIns(ing);
    await updateDoc(docRef(INSUMOS_COL, stockId), upd);
    closeMd("mdStock");
    toast("✓ Stock actualizado");
  } catch (e) {
    console.error(e);
    toast("❌ No se pudo actualizar.");
  } finally {
    btn.disabled = false;
  }
});

/* ══════════ HISTORIAL DE PRECIOS ══════════ */
function openHist(id) {
  const ing = ingMap.get(id);
  if (!ing) return;
  $("hTitulo").textContent = `Historial · ${ing.nombre}`;
  const keys = keysDe(ing).reverse();
  $("hBody").innerHTML = `<div class="wrap"><table>
    <thead><tr><th>Mes</th><th>Pagaste</th><th>Cantidad</th><th>Costo c/u</th><th>Cambio</th><th>Origen</th><th></th></tr></thead>
    <tbody>${keys
      .map((k) => {
        const e = { key: k, ...ing.precios[k] };
        const prev = entradaPrevia(ing, k);
        let cambio = "—";
        if (prev && prev.costo_base > 0) {
          const pct = ((e.costo_base - prev.costo_base) / prev.costo_base) * 100;
          cambio = `<span class="var ${pct > 0 ? "up" : "down"}">${pct > 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}%</span>`;
        }
        return `<tr>
          <td>${mkLabel(k)}</td><td>${money(e.precio)}</td>
          <td>${e.cantidad} ${UL[e.unidad]}</td>
          <td>${money(e.costo_base * (U[e.unidad]?.f || 1))}/${UL[e.unidad]}</td>
          <td>${cambio}</td>
          <td><span class="badge ${e.origen === "bolsillo" ? "dueno" : "neg"}">${e.origen === "bolsillo" ? "Bolsillo" : "Negocio"}</span></td>
          <td><button class="x" data-del-key="${k}" data-ing="${id}" title="Quitar este precio">✕</button></td>
        </tr>`;
      })
      .join("")}</tbody></table></div>
    <p class="help" style="margin-top:10px">Quitar un precio no borra el gasto ni cambia el stock; eso se maneja en Historial de gastos.</p>`;
  openMd("mdHist");
}
$("hBody").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-del-key]");
  if (!b) return;
  const ing = ingMap.get(b.dataset.ing);
  if (!ing) return;
  if (keysDe(ing).length <= 1) return toast("Debe quedar al menos un precio. Elimina el insumo si ya no lo usas.");
  if (!confirm(`¿Quitar el precio de ${mkLabel(b.dataset.delKey)}?`)) return;
  try {
    await updateDoc(docRef(INSUMOS_COL, ing.id), { [`precios.${b.dataset.delKey}`]: deleteField() });
    toast("Precio quitado.");
    setTimeout(() => ingMap.has(ing.id) && openHist(ing.id), 400);
  } catch (err) {
    console.error(err);
    toast("No se pudo quitar.");
  }
});

/* ══════════ GASTO GENERAL (papel, servilletas, agua…) ══════════ */
$("btnNuevoGasto").addEventListener("click", () => {
  $("gNombre").value = "";
  $("gMonto").value = "";
  $("gMes").value = mesSel;
  $("gCat").selectedIndex = 0;
  document.querySelector('input[name="origenG"][value="negocio"]').checked = true;
  openMd("mdGasto");
  setTimeout(() => $("gNombre").focus(), 200);
});
$("btnGuardarGasto").addEventListener("click", async () => {
  const nombre = $("gNombre").value.trim();
  const monto = num($("gMonto").value);
  const mes = $("gMes").value;
  const categoria = $("gCat").value;
  const origen = document.querySelector('input[name="origenG"]:checked').value;
  if (!nombre) return toast("Escribe qué compraste.");
  if (!monto) return toast("Escribe el monto.");
  if (!mes) return toast("Elige el mes.");
  if (origen === "negocio" && monto > cajaDisponible())
    if (!confirm(`La caja solo tiene ${money(cajaDisponible())}.\n¿Registrar igual como gasto del negocio?`)) return;
  const btn = $("btnGuardarGasto");
  btn.disabled = true;
  try {
    await addDoc(col(GASTOS_COL), {
      tipo: "gasto_general",
      nombre,
      categoria,
      monto,
      mes,
      origen,
      descuenta_caja: origen === "negocio",
      es_inversion: origen === "bolsillo",
      fecha: serverTimestamp(),
      fechaMs: Date.now(),
    });
    closeMd("mdGasto");
    toast("✓ Gasto guardado");
  } catch (e) {
    console.error(e);
    toast("❌ No se pudo guardar.");
  } finally {
    btn.disabled = false;
  }
});

/* ══════════ HISTORIAL DE GASTOS ══════════ */
function renderGastos() {
  $("gastoMesTitulo").textContent = mkLabel(mk(mesSel));
  const lista = gastosAll
    .filter((g) => g.mes === mesSel)
    .sort((a, b) => (b.fechaMs || 0) - (a.fechaMs || 0));
  const neg = lista.filter((g) => g.descuenta_caja).reduce((s, g) => s + num(g.monto), 0);
  const inv = lista.filter((g) => g.es_inversion).reduce((s, g) => s + num(g.monto), 0);
  $("gastoTiles").innerHTML = `
    <div class="k"><small>Pagado por el negocio</small><b>${money(neg)}</b></div>
    <div class="k"><small>Inversión del dueño</small><b>${money(inv)}</b></div>
    <div class="k big"><small>Total del mes</small><b>${money(neg + inv)}</b></div>`;
  $("listGastos").innerHTML = lista.length
    ? lista
        .map(
          (g) => `
      <div class="card" data-gid="${g.id}">
        <div class="card-top">
          <div>
            <div class="card-name">${esc(g.nombre)}</div>
            <div class="card-sub">${g.cantidad ? `${g.cantidad} ${UL[g.unidad] || ""}` : esc(g.categoria || "Gasto")}
              <span class="badge ${g.es_inversion ? "dueno" : "neg"}">${g.es_inversion ? "Inversión del dueño" : "Del negocio"}</span></div>
          </div>
          <div class="card-price"><b>${money(g.monto)}</b><span><button class="x" data-edit-gasto title="Editar nombre">✎</button><button class="x" data-del-gasto title="Eliminar gasto">✕</button></span></div>
        </div>
      </div>`,
        )
        .join("")
    : `<div class="empty">No hay gastos registrados este mes.</div>`;
}
$("listGastos").addEventListener("click", async (e) => {
  const ed = e.target.closest("[data-edit-gasto]");
  if (ed) {
    const gid = ed.closest("[data-gid]").dataset.gid;
    const g0 = gastosAll.find((x) => x.id === gid);
    if (!g0) return;
    if (g0.tipo === "compra_insumo" && g0.insumoId && ingMap.has(g0.insumoId))
      return renombrarInsumo(g0.insumoId);
    const nuevo = (prompt("Nuevo nombre del gasto:", g0.nombre || "") || "").trim();
    if (!nuevo || nuevo === g0.nombre) return;
    try {
      await updateDoc(docRef(GASTOS_COL, gid), { nombre: nuevo });
      toast("✓ Nombre actualizado");
    } catch (err) {
      console.error(err);
      toast("❌ No se pudo editar.");
    }
    return;
  }
  const b = e.target.closest("[data-del-gasto]");
  if (!b) return;
  const id = b.closest("[data-gid]").dataset.gid;
  const g = gastosAll.find((x) => x.id === id);
  const revierte = g?.tipo === "compra_insumo" && g.insumoId && ingMap.has(g.insumoId);
  if (!confirm(`¿Eliminar este gasto? La caja se recalcula${revierte ? " y se descuenta del stock lo que sumó esta compra" : ""}.`)) return;
  try {
    if (revierte) {
      const q = g.cantidad_base ?? baseQty(g.cantidad, g.unidad);
      await updateDoc(docRef(INSUMOS_COL, g.insumoId), { stock_base: increment(-q) });
    }
    await deleteDoc(docRef(GASTOS_COL, id));
    toast("Gasto eliminado.");
  } catch (err) {
    console.error(err);
    toast("No se pudo eliminar.");
  }
});

/* ══════════ ARRANQUE ══════════ */
function renderAll() {
  renderIns();
  renderCaja();
  if (!$("pane-gas").hidden) renderGastos();
}

function start() {
  if (started || !tiendaId || !localidad) return;
  started = true;

  onSnapshot(
    col(INSUMOS_COL),
    (snap) => {
      ingMap.clear();
      snap.forEach((d) => ingMap.set(d.id, { id: d.id, ...d.data() }));
      renderAll();
    },
    (e) => {
      console.error(e);
      toast("Error leyendo insumos.");
    },
  );

  onSnapshot(
    col(GASTOS_COL),
    (snap) => {
      gastosAll = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderCaja();
      if (!$("pane-gas").hidden) renderGastos();
    },
    (e) => console.error(e),
  );

  cargarVentas();
}

start();