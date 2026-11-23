import {
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { tiendaSubCol, tiendaSubDoc } from "../rutas/rutas.js";

/* .../tiendas/<id>/gastos_insumos/<id>  ← historial de gastos
   .../tiendas/<id>/pedidos              ← solo lectura (ventas)

   Tipos de registro (campo "tipo"):
   - compra_insumo / gasto_general → gastos reales
   - retiro        → el dueño saca plata de la caja (baja la caja, no es un gasto)
   - saldo_inicial → plata que ya había en caja (sube la caja)

   Los insumos y el stock quedan ocultos: sus datos no se tocan. */
const GASTOS_COL = "gastos_insumos";

/* ---------------- Utilidades ---------------- */
const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => "S/ " + (isFinite(n) ? n : 0).toFixed(2);
const num = (v) => Math.max(0, parseFloat(v) || 0);
const limaHoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const limaMes = () => limaHoy().slice(0, 7);
const ymDeMs = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const mesLabel = (ym) => {
  const [y, m] = ym.split("-");
  return `${MESES[+m - 1]} ${y}`;
};
const fmtDia = (ms) => {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, "0")} ${MESES[d.getMonth()]}`;
};
const fechaDefault = () => (mesSel === limaMes() ? limaHoy() : mesSel + "-01");
const fechaMsDe = (f) => new Date(f + "T12:00:00").getTime();
const esReal = (g) => g.tipo === "compra_insumo" || g.tipo === "gasto_general";

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
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => closeMd(b.dataset.close)));
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
let gastosAll = [];
let ventasTotal = null;
let ventasPorMes = {};
let mesSel = limaMes();
let fTipo = "todos";
let chartsOpen = false;
let editId = null;

/* ══════════ CAJA Y RESUMEN DEL MES ══════════ */
async function cargarVentas() {
  $("kMesVentas").textContent = "…";
  try {
    const snap = await getDocs(query(col("pedidos"), orderBy("timestamp", "desc"), limit(3000)));
    let t = 0;
    const porMes = {};
    snap.forEach((d) => {
      const raw = d.data();
      const p = raw.pedido ? raw.pedido : raw;
      if ((p.estado || "").toLowerCase() !== "entregado") return;
      const total = Number(p.total) || 0;
      t += total;
      const ts = p.timestamp ?? raw.timestamp ?? p.fecha;
      const ms = ts?.toMillis ? ts.toMillis() : typeof ts === "number" ? ts : Date.parse(ts);
      if (isFinite(ms)) {
        const ym = ymDeMs(ms);
        porMes[ym] = (porMes[ym] || 0) + total;
      }
    });
    ventasTotal = t;
    ventasPorMes = porMes;
  } catch (e) {
    console.error(e);
    ventasTotal = null;
    toast("No se pudieron leer las ventas.");
  }
  renderCaja();
  if (chartsOpen) renderCharts();
}
const suma = (arr) => arr.reduce((s, g) => s + num(g.monto), 0);
const gastoNegocioTodo = () => suma(gastosAll.filter((g) => esReal(g) && g.descuenta_caja));
const retirosTodo = () => suma(gastosAll.filter((g) => g.tipo === "retiro"));
const saldoInicial = () => suma(gastosAll.filter((g) => g.tipo === "saldo_inicial"));
const cajaDisponible = () => (ventasTotal ?? 0) + saldoInicial() - gastoNegocioTodo() - retirosTodo();

function renderCaja() {
  const caja = cajaDisponible();
  const c = $("chipCaja");
  c.textContent = ventasTotal === null ? "—" : money(caja);
  c.style.color = caja < 0 ? "var(--bad)" : "";

  const vMes = ventasTotal === null ? undefined : ventasPorMes[mesSel] ?? 0;
  const gMes = suma(gastosAll.filter((g) => g.mes === mesSel && esReal(g) && g.descuenta_caja));
  $("kMesVentas").textContent = vMes === undefined ? "—" : money(vMes);
  $("kMesGastos").textContent = money(gMes);
  const q = $("kMesQueda");
  q.textContent = vMes === undefined ? "—" : money(vMes - gMes);
  q.style.color = vMes !== undefined && vMes - gMes < 0 ? "var(--bad)" : "";
  $("subMes").textContent = `Mostrando ${mesLabel(mesSel)}`;
}

$("mesSel").value = mesSel;
$("mesSel").addEventListener("change", (e) => {
  if (!e.target.value) return;
  mesSel = e.target.value;
  renderCaja();
  renderGastos();
});
$("btnRefCaja").addEventListener("click", cargarVentas);

/* ══════════ HISTORIAL ══════════ */
const tipoLabel = (g) => {
  if (g.tipo === "retiro") return "Retiro del dueño";
  if (g.tipo === "saldo_inicial") return "Saldo inicial";
  return g.tipo === "compra_insumo" ? "Insumos" : g.categoria || "Gasto";
};
function gastosFiltrados() {
  const q = $("qGas").value.trim().toLowerCase();
  const or = $("fOrigen").value;
  return gastosAll
    .filter((g) => g.mes === mesSel)
    .filter((g) => {
      if (fTipo === "todos") return true;
      if (fTipo === "caja") return g.tipo === "retiro" || g.tipo === "saldo_inicial";
      return g.tipo === fTipo;
    })
    .filter((g) => or === "todos" || !esReal(g) || g.origen === or)
    .filter((g) => !q || (g.nombre || "").toLowerCase().includes(q) || tipoLabel(g).toLowerCase().includes(q))
    .sort((a, b) => (b.fechaMs || 0) - (a.fechaMs || 0));
}

function renderGastos() {
  const reales = gastosAll.filter((g) => g.mes === mesSel && esReal(g));
  const neg = suma(reales.filter((g) => g.descuenta_caja));
  const yo = suma(reales.filter((g) => g.es_inversion));
  const ins = suma(reales.filter((g) => g.tipo === "compra_insumo"));
  $("gastoTiles").innerHTML = `
    <div class="k big"><small>Total gastado este mes</small><b>${money(neg + yo)}</b></div>
    <div class="k"><small>Pagó el negocio</small><b>${money(neg)}</b></div>
    <div class="k"><small>Lo pagué yo</small><b>${money(yo)}</b></div>
    <div class="k"><small>En insumos de cocina</small><b>${money(ins)}</b></div>`;

  $("guide").hidden = gastosAll.length > 0;
  const lista = gastosFiltrados();
  $("gastoMesTitulo").textContent = mesLabel(mesSel);
  $("gastoCount").textContent = `(${lista.length})`;
  $("listGastos").innerHTML = lista.length
    ? lista
        .map((g) => {
          const det = g.cantidad ? `${g.cantidad} ${g.unidad === "unid" ? "unid" : g.unidad || ""}` : "";
          const badge =
            g.tipo === "retiro"
              ? `<span class="badge dueno">Sacó el dueño</span>`
              : g.tipo === "saldo_inicial"
                ? `<span class="badge neg">Entró a caja</span>`
                : `<span class="badge ${g.es_inversion ? "dueno" : "neg"}">${g.es_inversion ? "Lo pagué yo" : "Negocio"}</span>`;
          return `<tr data-gid="${g.id}">
        <td>${g.fechaMs ? fmtDia(g.fechaMs) : "—"}</td>
        <td><div class="nm">${esc(g.nombre)}<small>${det || esc(tipoLabel(g))}</small></div></td>
        <td class="hide-sm">${esc(tipoLabel(g))}</td>
        <td class="hide-sm">${badge}</td>
        <td class="r"><span class="money ${g.tipo === "saldo_inicial" ? "plus" : ""}">${g.tipo === "saldo_inicial" ? "+ " : ""}${money(g.monto)}</span></td>
        <td class="r"><button class="x" data-edit title="Editar">✎</button><button class="x" data-del title="Eliminar">✕</button></td>
      </tr>`;
        })
        .join("")
    : `<tr><td colspan="6"><div class="empty">No hay nada con estos filtros. Toca “+ Anotar gasto”.</div></td></tr>`;
  if (chartsOpen) renderCharts();
}

$("fTipo").addEventListener("click", (e) => {
  const b = e.target.closest("[data-f]");
  if (!b) return;
  fTipo = b.dataset.f;
  document.querySelectorAll("#fTipo button").forEach((x) => x.classList.toggle("on", x === b));
  renderGastos();
});
$("fOrigen").addEventListener("change", renderGastos);
$("qGas").addEventListener("input", renderGastos);

$("listGastos").addEventListener("click", async (e) => {
  const tr = e.target.closest("[data-gid]");
  if (!tr) return;
  const g = gastosAll.find((x) => x.id === tr.dataset.gid);
  if (!g) return;
  if (e.target.closest("[data-edit]")) return abrirGasto(g);
  if (e.target.closest("[data-del]")) {
    if (!confirm(`¿Eliminar “${g.nombre}” (${money(g.monto)})? La caja se recalcula.`)) return;
    try {
      await deleteDoc(docRef(GASTOS_COL, g.id));
      toast("Eliminado.");
    } catch (err) {
      console.error(err);
      toast("No se pudo eliminar.");
    }
  }
});

/* ══════════ GRÁFICOS (solo se dibujan al pulsar el botón) ══════════ */
function barsH(items, cls = "") {
  const max = Math.max(...items.map((i) => i.v), 1);
  return items
    .map(
      (i) => `<div class="hb"><span title="${esc(i.l)}">${esc(i.l)}</span>
      <div class="bar"><i class="${i.cls ?? cls}" style="width:${(Math.max(i.v, 0) / max) * 100}%"></i></div><b>${money(i.v)}</b></div>`,
    )
    .join("");
}
function renderCharts() {
  const box = $("chartsBox");
  const delMes = gastosAll.filter((g) => g.mes === mesSel && esReal(g));
  if (!delMes.length) {
    box.innerHTML = `<div class="chart"><h4>Sin datos</h4><div class="empty">Aún no hay gastos este mes para graficar.</div></div>`;
    return;
  }
  const porTipo = {};
  delMes.forEach((g) => (porTipo[tipoLabel(g)] = (porTipo[tipoLabel(g)] || 0) + num(g.monto)));
  const tipos = Object.entries(porTipo).sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ l, v }));

  const [y, m] = mesSel.split("-").map(Number);
  const dias = new Date(y, m, 0).getDate();
  const porDia = Array(dias).fill(0);
  delMes.forEach((g) => {
    if (g.fechaMs) porDia[new Date(g.fechaMs).getDate() - 1] += num(g.monto);
  });
  const maxD = Math.max(...porDia, 1);

  const vMes = ventasPorMes[mesSel];
  const negMes = suma(delMes.filter((g) => g.descuenta_caja));
  const cuadre =
    vMes === undefined
      ? ""
      : `<div class="chart"><h4>Ventas vs. gastos del negocio</h4>${barsH([
          { l: "Vendiste", v: vMes, cls: "alt" },
          { l: "Gastó el negocio", v: negMes },
          { l: vMes - negMes >= 0 ? "Te quedó" : "Te faltó", v: Math.abs(vMes - negMes), cls: vMes - negMes >= 0 ? "alt" : "bad" },
        ])}</div>`;
  const top = [...delMes].sort((a, b) => num(b.monto) - num(a.monto)).slice(0, 5).map((g) => ({ l: g.nombre, v: num(g.monto) }));

  box.innerHTML = `
    ${cuadre}
    <div class="chart"><h4>¿En qué se va la plata?</h4>${barsH(tipos)}</div>
    <div class="chart"><h4>Gasto por día</h4>
      <div class="vb">${porDia.map((v, i) => `<div title="Día ${i + 1}: ${money(v)}" style="height:${(v / maxD) * 100}%"></div>`).join("")}</div>
      <div class="vlabels"><span>1</span><span>${Math.ceil(dias / 2)}</span><span>${dias}</span></div></div>
    <div class="chart"><h4>Los 5 gastos más grandes</h4>${barsH(top)}</div>`;
}
$("btnCharts").addEventListener("click", () => {
  chartsOpen = !chartsOpen;
  $("chartsBox").hidden = !chartsOpen;
  $("btnCharts").textContent = chartsOpen ? "✕ Ocultar gráficos" : "📊 Ver gráficos";
  if (chartsOpen) renderCharts();
  else $("chartsBox").innerHTML = "";
});

/* ══════════ ANOTAR / EDITAR GASTO ══════════ */
const esEspecial = () => ["__retiro", "__saldo"].includes($("gCat").value);
const origenSel = () => document.querySelector('input[name="origenG"]:checked').value;

function actualizarFormGasto() {
  const esp = esEspecial();
  $("gOrigenBox").hidden = esp;
  const monto = num($("gMonto").value);
  const baja = $("gCat").value !== "__saldo" && (esp || origenSel() === "negocio");
  const previo = editId ? gastosAll.find((x) => x.id === editId) : null;
  const disponible = cajaDisponible() + (previo?.descuenta_caja ? num(previo.monto) : 0);
  const av = $("gAviso");
  if (baja && monto > disponible) {
    av.hidden = false;
    av.textContent = `La caja tiene ${money(disponible)} y esto es de ${money(monto)}. Si lo pagaste tú, elige “Lo pagué yo, con mi plata”.`;
  } else av.hidden = true;
}
$("gMonto").addEventListener("input", actualizarFormGasto);
$("gCat").addEventListener("change", actualizarFormGasto);
document.querySelectorAll('input[name="origenG"]').forEach((r) => r.addEventListener("change", actualizarFormGasto));

function abrirGasto(g = null) {
  editId = g?.id || null;
  $("gTitulo").textContent = g ? "Editar" : "Anotar gasto";
  $("gNombre").value = g?.nombre || "";
  $("gMonto").value = g ? g.monto : "";
  $("gFecha").value = g?.fechaMs ? new Date(g.fechaMs).toLocaleDateString("en-CA") : fechaDefault();
  let cat = "Insumos";
  if (g?.tipo === "retiro") cat = "__retiro";
  else if (g?.tipo === "saldo_inicial") cat = "__saldo";
  else if (g?.tipo === "gasto_general") cat = g.categoria || "Otro";
  const sel = $("gCat");
  if (![...sel.options].some((o) => o.value === cat)) sel.add(new Option(cat, cat));
  sel.value = cat;
  document.querySelector(`input[name="origenG"][value="${g?.es_inversion ? "bolsillo" : "negocio"}"]`).checked = true;
  actualizarFormGasto();
  openMd("mdGasto");
  setTimeout(() => $("gNombre").focus(), 200);
}
$("btnNuevoGasto").addEventListener("click", () => abrirGasto(null));

$("btnGuardarGasto").addEventListener("click", async () => {
  const nombre = $("gNombre").value.trim();
  const monto = num($("gMonto").value);
  const fecha = $("gFecha").value;
  const cat = $("gCat").value;
  if (!nombre) return toast("Escribe qué fue.");
  if (!monto) return toast("Escribe el monto.");
  if (!fecha) return toast("Elige la fecha.");

  let datos;
  if (cat === "__retiro")
    datos = { tipo: "retiro", categoria: "Retiro del dueño", origen: "negocio", descuenta_caja: true, es_inversion: false };
  else if (cat === "__saldo")
    datos = { tipo: "saldo_inicial", categoria: "Saldo inicial", origen: "negocio", descuenta_caja: false, es_inversion: false };
  else {
    const origen = origenSel();
    datos = {
      tipo: cat === "Insumos" ? "compra_insumo" : "gasto_general",
      categoria: cat,
      origen,
      descuenta_caja: origen === "negocio",
      es_inversion: origen === "bolsillo",
    };
  }
  const previo = editId ? gastosAll.find((x) => x.id === editId) : null;
  const disponible = cajaDisponible() + (previo?.descuenta_caja ? num(previo.monto) : 0);
  if (datos.descuenta_caja && monto > disponible)
    if (!confirm(`La caja solo tiene ${money(disponible)}.\n¿Anotarlo igual?`)) return;

  const btn = $("btnGuardarGasto");
  btn.disabled = true;
  try {
    const cuerpo = { ...datos, nombre, monto, mes: fecha.slice(0, 7), fechaMs: fechaMsDe(fecha) };
    if (editId) await updateDoc(docRef(GASTOS_COL, editId), cuerpo);
    else await addDoc(col(GASTOS_COL), { ...cuerpo, fecha: serverTimestamp() });
    closeMd("mdGasto");
    toast(editId ? "✓ Cambios guardados" : "✓ Anotado");
  } catch (e) {
    console.error(e);
    toast("❌ No se pudo guardar.");
  } finally {
    btn.disabled = false;
  }
});

/* ══════════ ARRANQUE ══════════ */
function start() {
  if (started || !tiendaId || !localidad) return;
  started = true;
  onSnapshot(
    col(GASTOS_COL),
    (snap) => {
      gastosAll = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderCaja();
      renderGastos();
    },
    (e) => {
      console.error(e);
      toast("Error leyendo los gastos.");
    },
  );
  cargarVentas();
}

renderGastos();
start();