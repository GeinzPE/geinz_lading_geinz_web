import {
  doc,
  getDoc,
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
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { tiendaSubCol, tiendaSubDoc } from "../rutas/rutas.js";

/* ══════════════════════════════════════════════════════
   RUTAS EN FIRESTORE  (todas dentro de la tienda)
   .../tiendas/<id>/insumos/<insumoId>      ← precios por mes
   .../tiendas/<id>/recetas/<recetaId>      ← productos armados con insumos
   .../tiendas/<id>/gastos_insumos/<id>     ← cada compra (negocio / bolsillo)
   .../tiendas/<id>/pedidos                 ← solo se LEE para calcular la caja
   Si quieres que las compras caigan en otra colección de gastos,
   cambia solo GASTOS_COL.
   ══════════════════════════════════════════════════════ */
const INSUMOS_COL = "insumos";
const RECETAS_COL = "recetas";
const GASTOS_COL = "gastos_insumos";

/* ---------------- Unidades ---------------- */
const U = {
  unid: { t: "c", f: 1 },
  docena: { t: "c", f: 12 },
  g: { t: "m", f: 1 },
  kg: { t: "m", f: 1000 },
  ml: { t: "m", f: 1 },
  l: { t: "m", f: 1000 },
  oz: { t: "m", f: 29.5735 },
};
const UL = {
  unid: "unidad",
  docena: "docena",
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "litro",
  oz: "oz líquida",
};
const unidadesDeTipo = (t) => Object.keys(U).filter((u) => U[u].t === t);

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
const mk = (ym) => "m_" + String(ym).replace("-", "_"); // "2026-10" → "m_2026_10"
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const mkLabel = (k) => {
  const [, y, m] = k.split("_");
  return `${MESES[+m - 1]} ${y}`;
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
const ingMap = new Map(); // id -> {id, nombre, tipo, precios:{m_YYYY_MM:{...}}}
const recMap = new Map(); // id -> receta
let gastosAll = []; // todas las compras registradas
let ventasTotal = null;
let mesSel = limaMes();
const linkCache = new Map(); // "cat/prod" -> precio actual del catálogo
let catalogo = []; // [{categoriaId, productoId, nombre, precio}]

/* ══════════════════════════════════════════════════════
   PRECIO DE UN INSUMO SEGÚN EL MES
   ══════════════════════════════════════════════════════ */
const keysDe = (i) => Object.keys(i.precios || {}).sort();

// Entrada vigente para el mes: la del mes, o la última anterior, o la primera que exista.
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
const costoBase = (i) => entradaMes(i)?.costo_base || 0;

/* ══════════════════════════════════════════════════════
   COSTOS DE PRODUCTOS (recetas)
   ══════════════════════════════════════════════════════ */
function itemCost(it, d) {
  if (it.tipo === "i") {
    const ing = ingMap.get(it.id);
    return ing ? costoBase(ing) * baseQty(it.qty, it.unit) : 0;
  }
  const r = recMap.get(it.id);
  return r ? num(it.qty) * recCost(r, d + 1) : 0;
}
function recCost(r, d = 0) {
  if (d > 10) return 0;
  const total = (r.items || []).reduce((s, it) => s + itemCost(it, d), 0);
  return total / Math.max(0.0001, num(r.rinde) || 1);
}
function dependeDe(r, id, d = 0) {
  if (d > 10) return true;
  return (r.items || []).some((it) => {
    if (it.tipo !== "p") return false;
    if (it.id === id) return true;
    const sub = recMap.get(it.id);
    return sub ? dependeDe(sub, id, d + 1) : false;
  });
}
function calcR(r) {
  const cost = recCost(r);
  const m = num(r.margen) / 100;
  let price = r.modo === "margin" ? (m < 1 ? cost / (1 - m) : 0) : cost * (1 + m);
  if (r.redondear) price = Math.ceil(price * 10 - 1e-9) / 10;
  const u = num(r.unidades);
  return {
    cost,
    price,
    profit: price - cost,
    u,
    inv: cost * u,
    sales: price * u,
    gain: (price - cost) * u,
    marginInvalid: r.modo === "margin" && m >= 1,
  };
}
function addNeed(r, mult, need, d = 0) {
  if (d > 10) return;
  const m = mult / Math.max(0.0001, num(r.rinde) || 1);
  (r.items || []).forEach((it) => {
    if (it.tipo === "i") {
      if (ingMap.has(it.id)) need[it.id] = (need[it.id] || 0) + baseQty(it.qty, it.unit) * m;
    } else {
      const sub = recMap.get(it.id);
      if (sub) addNeed(sub, m * num(it.qty), need, d + 1);
    }
  });
}

/* ══════════════════════════════════════════════════════
   CAJA: ventas entregadas − gastos pagados por el negocio
   ══════════════════════════════════════════════════════ */
async function cargarVentas() {
  $("chipVentas").textContent = "…";
  try {
    const snap = await getDocs(
      query(col("pedidos"), orderBy("timestamp", "desc"), limit(3000)),
    );
    let t = 0;
    snap.forEach((d) => {
      const raw = d.data();
      const p = raw.pedido ? raw.pedido : raw; // pedidos de mesa vienen anidados
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

/* ══════════════════════════════════════════════════════
   PESTAÑAS / MES
   ══════════════════════════════════════════════════════ */
function goTab(t) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
  document.querySelectorAll(".pane").forEach((p) => (p.hidden = p.id !== "pane-" + t));
  if (t === "sum") renderResumen();
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

/* ══════════════════════════════════════════════════════
   LISTA DE INSUMOS
   ══════════════════════════════════════════════════════ */
function renderIns() {
  const q = $("qIns").value.trim().toLowerCase();
  const arr = [...ingMap.values()]
    .filter((i) => !q || (i.nombre || "").toLowerCase().includes(q))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));

  $("dlIns").innerHTML = [...ingMap.values()]
    .map((i) => `<option value="${esc(i.nombre)}"></option>`)
    .join("");

  if (!arr.length) {
    $("listIns").innerHTML = `<div class="empty">${
      ingMap.size ? "No hay coincidencias." : "Aún no tienes insumos. Toca “Nueva compra”."
    }</div>`;
    return;
  }

  $("listIns").innerHTML = arr
    .map((i) => {
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
      const etiqueta = U[e.unidad]?.t === "c" && e.unidad === "unid" ? "c/u" : `por ${UL[e.unidad]}`;
      return `
      <div class="card" data-id="${i.id}">
        <div class="card-top">
          <div>
            <div class="card-name">${esc(i.nombre)}</div>
            <div class="card-sub">Pagaste ${money(e.precio)} por ${e.cantidad} ${UL[e.unidad]} · ${mkLabel(e.key)}
              <span class="badge ${e.origen === "bolsillo" ? "dueno" : "neg"}">${e.origen === "bolsillo" ? "Mi bolsillo" : "Negocio"}</span></div>
          </div>
          <div class="card-price"><b>${money(porUnidad)}${varHtml}</b><small>${etiqueta}</small></div>
        </div>
        <div class="card-actions">
          <button class="btn sm go" data-a="comprar">+ Nueva compra / precio</button>
          <button class="btn sm" data-a="hist">Historial</button>
          <button class="btn sm del" data-a="del">Eliminar</button>
        </div>
      </div>`;
    })
    .join("");
}
$("qIns").addEventListener("input", renderIns);
$("listIns").addEventListener("click", (e) => {
  const b = e.target.closest("[data-a]");
  if (!b) return;
  const id = b.closest("[data-id]").dataset.id;
  if (b.dataset.a === "comprar") openCompra(id);
  if (b.dataset.a === "hist") openHist(id);
  if (b.dataset.a === "del") borrarInsumo(id);
});

async function borrarInsumo(id) {
  const ing = ingMap.get(id);
  const usado = [...recMap.values()].filter((r) =>
    (r.items || []).some((it) => it.tipo === "i" && it.id === id),
  );
  if (usado.length) {
    toast(`No se puede: lo usan ${usado.map((r) => r.nombre).join(", ")}.`);
    return;
  }
  if (!confirm(`¿Eliminar "${ing?.nombre}" y todo su historial de precios?\n(Las compras registradas como gasto se conservan.)`))
    return;
  try {
    await deleteDoc(docRef(INSUMOS_COL, id));
    toast("Insumo eliminado.");
  } catch (e) {
    console.error(e);
    toast("No se pudo eliminar.");
  }
}

/* ══════════════════════════════════════════════════════
   MODAL COMPRA
   ══════════════════════════════════════════════════════ */
let compraId = null; // id del insumo existente (o null si es nuevo)

function llenarUnidades(tipo, sel) {
  const lista = tipo ? unidadesDeTipo(tipo) : Object.keys(U);
  $("cUnidad").innerHTML = lista
    .map((u) => `<option value="${u}" ${u === sel ? "selected" : ""}>${UL[u]}</option>`)
    .join("");
}

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
  llenarUnidades(ing?.tipo || null, e?.unidad || "unid");
  $("cHint").textContent = ing ? "Escribe el nuevo precio para registrar el cambio." : "";
  $("cAviso").hidden = true;
  actualizarPreviewCompra();
  openMd("mdCompra");
  setTimeout(() => (ing ? $("cPrecio") : $("cNombre")).focus(), 200);
}
$("btnNuevoIns").addEventListener("click", () => openCompra(null));

// Si escribe un nombre que ya existe, lo trata como el mismo insumo
$("cNombre").addEventListener("input", () => {
  if (compraId) return;
  const n = $("cNombre").value.trim().toLowerCase();
  const ex = [...ingMap.values()].find((i) => (i.nombre || "").toLowerCase() === n);
  if (ex) {
    const e = entradaMes(ex, limaMes());
    llenarUnidades(ex.tipo, e?.unidad);
    $("cHint").textContent = "Ese insumo ya existe: se agregará un nuevo precio a su historial.";
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
  const f = U[u].f;
  p.textContent =
    u === "unid"
      ? `Cada unidad te cuesta ${money(cb)}`
      : U[u].t === "c"
        ? `Cada ${UL[u]} te cuesta ${money(precio / cant)} · cada unidad ${money(cb)}`
        : `Cada ${UL[u]} te cuesta ${money(cb * f)}` +
          (f === 1 ? "" : ` · cada ${U[u].t === "m" && /g|kg|oz/.test(u) ? "g" : "ml"} ${money(cb)}`);

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

  if (!nombre) return toast("Escribe el nombre del insumo.");
  if (!cantidad) return toast("Escribe la cantidad que compraste.");
  if (!precio) return toast("Escribe cuánto pagaste.");
  if (!mes) return toast("Elige el mes.");

  const existente = insumoDeModal();
  const tipo = U[unidad].t;
  if (existente && existente.tipo !== tipo)
    return toast(`"${existente.nombre}" se mide en ${existente.tipo === "c" ? "unidades" : "peso/volumen"}; usa una unidad del mismo tipo.`);

  if (registrar && origen === "negocio" && precio > cajaDisponible())
    if (!confirm(`La caja solo tiene ${money(cajaDisponible())}.\n¿Registrar igual como gasto del negocio?`)) return;

  const btn = $("btnGuardarCompra");
  btn.disabled = true;
  btn.textContent = "Guardando…";
  try {
    const entrada = {
      precio,
      cantidad,
      unidad,
      costo_base: precio / baseQty(cantidad, unidad),
      origen,
      fecha: Date.now(),
    };
    const key = mk(mes);
    let insumoId;
    if (existente) {
      insumoId = existente.id;
      await updateDoc(docRef(INSUMOS_COL, insumoId), {
        [`precios.${key}`]: entrada,
        actualizado: serverTimestamp(),
      });
    } else {
      const ref = doc(col(INSUMOS_COL));
      insumoId = ref.id;
      await setDoc(ref, {
        nombre,
        nombre_lower: nombre.toLowerCase(),
        tipo,
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
        mes,
        origen, // "negocio" | "bolsillo"
        descuenta_caja: origen === "negocio",
        es_inversion: origen === "bolsillo", // inversión puesta por el dueño
        fecha: serverTimestamp(),
        fechaMs: Date.now(),
      });
    }
    closeMd("mdCompra");
    toast(
      registrar
        ? origen === "bolsillo"
          ? "✓ Guardado como inversión del dueño"
          : "✓ Guardado y descontado de la caja"
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

/* ══════════════════════════════════════════════════════
   HISTORIAL DE PRECIOS
   ══════════════════════════════════════════════════════ */
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
    <p class="help" style="margin-top:10px">Quitar un precio del historial no borra el gasto ya registrado; eso se borra en Resumen → Compras del mes.</p>`;
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

/* ══════════════════════════════════════════════════════
   LISTA DE PRODUCTOS (recetas)
   ══════════════════════════════════════════════════════ */
function renderRec() {
  const arr = [...recMap.values()].sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
  if (!arr.length) {
    $("listRec").innerHTML = `<div class="empty">Aún no tienes productos. ${
      ingMap.size ? "Toca “Nuevo producto”." : "Primero agrega tus insumos."
    }</div>`;
    return;
  }
  $("listRec").innerHTML = arr
    .map((r) => {
      const c = calcR(r);
      let real = "";
      if (r.link) {
        const pa = linkCache.get(`${r.link.categoriaId}/${r.link.productoId}`);
        if (typeof pa === "number") {
          const g = pa - c.cost;
          const pct = pa ? (g / pa) * 100 : 0;
          real = `<div class="card-sub">En tu carta: <b>${money(pa)}</b> → ganas <b class="${g >= 0 ? "pos" : "neg"}">${money(g)}</b> (${pct.toFixed(0)}%)</div>`;
        }
      }
      return `
      <div class="card" data-id="${r.id}">
        <div class="card-top">
          <div>
            <div class="card-name">${esc(r.nombre)}</div>
            <div class="card-sub">Costo ${money(c.cost)} · ganas ${money(c.profit)} c/u · ${c.u} unid.</div>
            ${real}
          </div>
          <div class="card-price"><b>${c.marginInvalid ? "—" : money(c.price)}</b><small>vender a</small></div>
        </div>
        <div class="card-actions">
          <button class="btn sm go" data-a="edit">Abrir</button>
          <button class="btn sm del" data-a="del">Eliminar</button>
        </div>
      </div>`;
    })
    .join("");
}
$("listRec").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-a]");
  if (!b) return;
  const id = b.closest("[data-id]").dataset.id;
  if (b.dataset.a === "edit") return openReceta(id);
  if (b.dataset.a === "del") {
    const r = recMap.get(id);
    const padres = [...recMap.values()].filter((x) => x.id !== id && (x.items || []).some((it) => it.tipo === "p" && it.id === id));
    if (padres.length) return toast(`No se puede: lo usan ${padres.map((x) => x.nombre).join(", ")}.`);
    if (!confirm(`¿Eliminar "${r?.nombre}"?`)) return;
    try {
      await deleteDoc(docRef(RECETAS_COL, id));
      toast("Producto eliminado.");
    } catch (err) {
      console.error(err);
      toast("No se pudo eliminar.");
    }
  }
});
$("btnNuevaRec").addEventListener("click", () => {
  if (!ingMap.size) return toast("Primero agrega al menos un insumo.");
  openReceta(null);
});

/* ══════════════════════════════════════════════════════
   EDITOR DE PRODUCTO
   ══════════════════════════════════════════════════════ */
let ed = null;

function nuevoItem() {
  const ing = [...ingMap.values()].sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""))[0];
  if (!ing) return null;
  return { tipo: "i", id: ing.id, qty: 1, unit: entradaMes(ing)?.unidad || "unid" };
}

function openReceta(id) {
  const r = id ? recMap.get(id) : null;
  ed = {
    id,
    nombre: r?.nombre || "",
    margen: r?.margen ?? 50,
    modo: r?.modo || "markup",
    redondear: r ? r.redondear !== false : true,
    unidades: r?.unidades ?? 10,
    rinde: r?.rinde ?? 1,
    items: (r?.items || []).map((i) => ({ ...i })),
    link: r?.link || null,
  };
  if (!ed.items.length) {
    const it = nuevoItem();
    if (it) ed.items.push(it);
  }
  $("rTitulo").textContent = id ? "Editar producto" : "Nuevo producto";
  $("rNombre").value = ed.nombre;
  $("rMargen").value = ed.margen;
  $("rUnidades").value = ed.unidades;
  $("rRinde").value = ed.rinde;
  $("rModo").value = ed.modo;
  $("rRedondear").checked = ed.redondear;
  fillLinkSelect();
  renderItems();
  calcEd();
  openMd("mdRec");
}

function refOptions(sel) {
  const ins = [...ingMap.values()]
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""))
    .map((i) => {
      const v = "i:" + i.id;
      return `<option value="${v}" ${v === sel ? "selected" : ""}>${esc(i.nombre)}</option>`;
    })
    .join("");
  const prods = [...recMap.values()]
    .filter((q) => q.id !== ed.id && !(ed.id && dependeDe(q, ed.id)))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""))
    .map((q) => {
      const v = "p:" + q.id;
      return `<option value="${v}" ${v === sel ? "selected" : ""}>${esc(q.nombre)}</option>`;
    })
    .join("");
  return `<optgroup label="Insumos">${ins}</optgroup>` + (prods ? `<optgroup label="Productos / preparaciones">${prods}</optgroup>` : "");
}

function normalizarItem(it) {
  if (it.tipo === "p") {
    it.unit = "unid";
    return;
  }
  const ing = ingMap.get(it.id);
  if (!ing) return;
  if (!U[it.unit] || U[it.unit].t !== ing.tipo) it.unit = unidadesDeTipo(ing.tipo)[0];
}

function renderItems() {
  ed.items.forEach(normalizarItem);
  $("rItems").innerHTML = ed.items
    .map((it, idx) => {
      const sel = it.tipo + ":" + it.id;
      let unitHtml;
      if (it.tipo === "p") unitHtml = `<option value="unid">porción</option>`;
      else {
        const ing = ingMap.get(it.id);
        unitHtml = unidadesDeTipo(ing?.tipo || "c")
          .map((u) => `<option value="${u}" ${u === it.unit ? "selected" : ""}>${UL[u]}</option>`)
          .join("");
      }
      return `<div class="item-row" data-idx="${idx}">
        <select class="full" data-k="ref">${refOptions(sel)}</select>
        <div class="item-line">
          <span class="mut">Uso</span>
          <input type="number" min="0" step="any" inputmode="decimal" data-k="qty" value="${it.qty}">
          <select data-k="unit">${unitHtml}</select>
          <b class="item-cost" data-cost>${money(itemCost(it, 0) / Math.max(0.0001, num(ed.rinde) || 1))}</b>
          <button class="x" data-k="del" title="Quitar">✕</button>
        </div>
      </div>`;
    })
    .join("");
}

$("btnAddItem").addEventListener("click", () => {
  const it = nuevoItem();
  if (!it) return;
  ed.items.push(it);
  renderItems();
  calcEd();
});

$("rItems").addEventListener("input", (e) => {
  const row = e.target.closest("[data-idx]");
  if (!row) return;
  const it = ed.items[+row.dataset.idx];
  const k = e.target.dataset.k;
  if (k === "qty") it.qty = e.target.value;
  if (k === "unit") it.unit = e.target.value;
  if (k === "ref") {
    const [tipo, id] = e.target.value.split(":");
    it.tipo = tipo;
    it.id = id;
    normalizarItem(it);
    renderItems();
  }
  calcEd();
});
$("rItems").addEventListener("click", (e) => {
  const b = e.target.closest('[data-k="del"]');
  if (!b) return;
  ed.items.splice(+b.closest("[data-idx]").dataset.idx, 1);
  renderItems();
  calcEd();
});

function leerEd() {
  ed.nombre = $("rNombre").value;
  ed.margen = $("rMargen").value;
  ed.unidades = $("rUnidades").value;
  ed.rinde = $("rRinde").value;
  ed.modo = $("rModo").value;
  ed.redondear = $("rRedondear").checked;
}
["rNombre", "rMargen", "rUnidades", "rRinde", "rModo", "rRedondear"].forEach((id) =>
  $(id).addEventListener("input", () => {
    calcEd();
    if (id === "rRinde") {
      leerEd();
      document.querySelectorAll("#rItems [data-idx]").forEach((row) => {
        row.querySelector("[data-cost]").textContent = money(
          itemCost(ed.items[+row.dataset.idx], 0) / Math.max(0.0001, num(ed.rinde) || 1),
        );
      });
    }
  }),
);

function calcEd() {
  leerEd();
  const c = calcR(ed);
  document.querySelectorAll("#rItems [data-idx]").forEach((row) => {
    row.querySelector("[data-cost]").textContent = money(
      itemCost(ed.items[+row.dataset.idx], 0) / Math.max(0.0001, num(ed.rinde) || 1),
    );
  });
  $("rTiles").innerHTML = `
    <div class="k"><small>Costo c/u</small><b>${money(c.cost)}</b></div>
    <div class="k big"><small>Vender a</small><b>${c.marginInvalid ? "Margen &lt; 100%" : money(c.price)}</b></div>
    <div class="k"><small>Ganas c/u</small><b class="pos">${money(c.profit)}</b></div>
    <div class="k"><small>Invierto (${c.u} unid.)</small><b>${money(c.inv)}</b></div>
    <div class="k"><small>Vendo</small><b>${money(c.sales)}</b></div>
    <div class="k"><small>Gano</small><b class="pos">${money(c.gain)}</b></div>`;
  actualizarLinkInfo(c);
}

/* ---- Vincular con producto del catálogo (solo para comparar) ---- */
function fillLinkSelect() {
  const sel = $("rLink");
  const actual = ed.link ? `${ed.link.categoriaId}/${ed.link.productoId}` : "";
  let opts = `<option value="">— Sin vincular —</option>`;
  const lista = [...catalogo];
  if (ed.link && !lista.some((p) => `${p.categoriaId}/${p.productoId}` === actual))
    lista.unshift({ ...ed.link, precio: linkCache.get(actual) });
  opts += lista
    .map((p) => {
      const v = `${p.categoriaId}/${p.productoId}`;
      return `<option value="${esc(v)}" ${v === actual ? "selected" : ""}>${esc(p.nombre)} (${esc(p.categoriaId)})</option>`;
    })
    .join("");
  sel.innerHTML = opts;
}
function actualizarLinkInfo(c = calcR(ed)) {
  const el = $("rLinkInfo");
  if (!ed.link) return (el.textContent = "");
  const pa = linkCache.get(`${ed.link.categoriaId}/${ed.link.productoId}`);
  if (typeof pa !== "number") return (el.textContent = "Cargando precio de tu carta…");
  const g = pa - c.cost;
  el.innerHTML = `En tu carta cuesta <b>${money(pa)}</b> · hoy ganas <b class="${g >= 0 ? "pos" : "neg"}">${money(g)}</b> por unidad. Precio sugerido: <b>${money(c.price)}</b>.`;
}
$("btnCargarCatalogo").addEventListener("click", async () => {
  const b = $("btnCargarCatalogo");
  b.disabled = true;
  b.textContent = "Cargando…";
  try {
    const cats = await getDocs(col("productos"));
    const out = [];
    await Promise.all(
      cats.docs.map(async (c) => {
        const ps = await getDocs(tiendaSubCol(localidad, "tiendas", tiendaId, "productos", c.id, c.id));
        ps.forEach((p) => {
          const d = p.data();
          out.push({ categoriaId: c.id, productoId: p.id, nombre: d.nombre || p.id, precio: Number(d.precio) || 0 });
          linkCache.set(`${c.id}/${p.id}`, Number(d.precio) || 0);
        });
      }),
    );
    catalogo = out.sort((a, b) => a.nombre.localeCompare(b.nombre));
    fillLinkSelect();
    toast(`${catalogo.length} productos cargados.`);
  } catch (e) {
    console.error(e);
    toast("No se pudo leer tu catálogo.");
  } finally {
    b.disabled = false;
    b.textContent = "Cargar mis productos";
  }
});
$("rLink").addEventListener("change", (e) => {
  if (!e.target.value) ed.link = null;
  else {
    const [categoriaId, productoId] = e.target.value.split("/");
    const p = catalogo.find((x) => x.categoriaId === categoriaId && x.productoId === productoId);
    ed.link = { categoriaId, productoId, nombre: p?.nombre || productoId };
    if (p) linkCache.set(e.target.value, p.precio);
    if (!$("rNombre").value.trim() && p) {
      $("rNombre").value = p.nombre;
    }
  }
  calcEd();
});

$("btnGuardarRec").addEventListener("click", async () => {
  leerEd();
  const nombre = ed.nombre.trim();
  if (!nombre) return toast("Ponle un nombre al producto.");
  const items = ed.items
    .filter((it) => (it.tipo === "i" ? ingMap.has(it.id) : recMap.has(it.id)) && num(it.qty) > 0)
    .map((it) => ({ tipo: it.tipo, id: it.id, qty: num(it.qty), unit: it.unit }));
  if (!items.length) return toast("Agrega al menos un insumo con cantidad.");

  const data = {
    nombre,
    nombre_lower: nombre.toLowerCase(),
    margen: num(ed.margen),
    modo: ed.modo,
    redondear: !!ed.redondear,
    unidades: Math.round(num(ed.unidades)),
    rinde: Math.max(0.0001, num(ed.rinde) || 1),
    items,
    link: ed.link || null,
    actualizado: serverTimestamp(),
  };
  const btn = $("btnGuardarRec");
  btn.disabled = true;
  btn.textContent = "Guardando…";
  try {
    if (ed.id) await updateDoc(docRef(RECETAS_COL, ed.id), data);
    else await addDoc(col(RECETAS_COL), { ...data, createdAt: serverTimestamp() });
    closeMd("mdRec");
    toast("✓ Producto guardado");
  } catch (e) {
    console.error(e);
    toast("❌ No se pudo guardar.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar producto";
  }
});

/* ══════════════════════════════════════════════════════
   RESUMEN
   ══════════════════════════════════════════════════════ */
function fmtNeed(n, t) {
  return t === "c" ? Math.ceil(n - 1e-9) + " unid" : n >= 1000 ? (n / 1000).toFixed(2) + " kg/l" : Math.round(n) + " g/ml";
}
function renderResumen() {
  const T = { inv: 0, sales: 0, gain: 0 };
  const need = {};
  let rows = "";
  [...recMap.values()]
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""))
    .forEach((r) => {
      const c = calcR(r);
      addNeed(r, c.u, need);
      T.inv += c.inv;
      T.sales += c.sales;
      T.gain += c.gain;
      if (c.u > 0)
        rows += `<tr><td>${esc(r.nombre)}</td><td>${c.u}</td><td>${money(c.cost)}</td><td>${money(c.price)}</td><td>${money(c.inv)}</td><td class="pos">${money(c.gain)}</td></tr>`;
    });

  const caja = cajaDisponible();
  $("tot").innerHTML = `
    <div class="k"><small>Inversión total</small><b>${money(T.inv)}</b></div>
    <div class="k"><small>Ventas esperadas</small><b>${money(T.sales)}</b></div>
    <div class="k big"><small>Ganancia esperada</small><b>${money(T.gain)}</b></div>
    <div class="k"><small>Caja disponible</small><b class="${caja < T.inv ? "neg" : "pos"}">${money(caja)}</b></div>
    <div class="k" style="grid-column:span 2"><small>${caja >= T.inv ? "Alcanza para esta inversión ✓" : "Te faltan para cubrir la inversión"}</small><b>${caja >= T.inv ? money(caja - T.inv) + " sobran" : money(T.inv - caja)}</b></div>`;
  $("ptab").innerHTML = rows || `<tr><td colspan="6">Pon unidades a vender en tus productos.</td></tr>`;

  let bt = 0;
  const br = [...ingMap.values()]
    .filter((i) => need[i.id] > 0)
    .map((i) => {
      const e = entradaMes(i);
      const pack = baseQty(e.cantidad, e.unidad);
      const n = pack > 0 ? Math.ceil(need[i.id] / pack - 1e-9) : 0;
      const c = n * e.precio;
      bt += c;
      return `<tr><td>${esc(i.nombre)}</td><td>${fmtNeed(need[i.id], i.tipo)}</td><td>${n} × (${e.cantidad} ${UL[e.unidad]})</td><td>${money(c)}</td></tr>`;
    })
    .join("");
  $("buy").innerHTML = br
    ? br + `<tr><td><b>Total a comprar</b></td><td></td><td></td><td><b>${money(bt)}</b></td></tr>`
    : `<tr><td colspan="4">Aún no hay nada que comprar.</td></tr>`;

  renderGastos();
}

function renderGastos() {
  $("gastoMesTitulo").textContent = `· ${mkLabel(mk(mesSel))}`;
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
            <div class="card-sub">${g.cantidad} ${UL[g.unidad] || ""}
              <span class="badge ${g.es_inversion ? "dueno" : "neg"}">${g.es_inversion ? "Inversión del dueño" : "Del negocio"}</span></div>
          </div>
          <div class="card-price"><b>${money(g.monto)}</b><button class="x" data-del-gasto title="Eliminar gasto">✕</button></div>
        </div>
      </div>`,
        )
        .join("")
    : `<div class="empty">No hay compras registradas este mes.</div>`;
}
$("listGastos").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-del-gasto]");
  if (!b) return;
  const id = b.closest("[data-gid]").dataset.gid;
  if (!confirm("¿Eliminar este gasto? La caja se recalcula (el precio del insumo no cambia).")) return;
  try {
    await deleteDoc(docRef(GASTOS_COL, id));
    toast("Gasto eliminado.");
  } catch (err) {
    console.error(err);
    toast("No se pudo eliminar.");
  }
});

/* ══════════════════════════════════════════════════════
   ARRANQUE
   ══════════════════════════════════════════════════════ */
function renderAll() {
  renderIns();
  renderRec();
  renderCaja();
  if (!$("pane-sum").hidden) renderResumen();
}

async function refrescarLinks() {
  const pend = [...recMap.values()].filter(
    (r) => r.link && !linkCache.has(`${r.link.categoriaId}/${r.link.productoId}`),
  );
  await Promise.all(
    pend.map(async (r) => {
      try {
        const s = await getDoc(
          tiendaSubDoc(localidad, "tiendas", tiendaId, "productos", r.link.categoriaId, r.link.categoriaId, r.link.productoId),
        );
        linkCache.set(`${r.link.categoriaId}/${r.link.productoId}`, s.exists() ? Number(s.data().precio) || 0 : 0);
      } catch {}
    }),
  );
  if (pend.length) renderRec();
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
    col(RECETAS_COL),
    (snap) => {
      recMap.clear();
      snap.forEach((d) => recMap.set(d.id, { id: d.id, ...d.data() }));
      renderAll();
      refrescarLinks();
    },
    (e) => {
      console.error(e);
      toast("Error leyendo productos.");
    },
  );

  onSnapshot(
    col(GASTOS_COL),
    (snap) => {
      gastosAll = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderCaja();
      if (!$("pane-sum").hidden) renderResumen();
    },
    (e) => console.error(e),
  );

  cargarVentas();
}

start();