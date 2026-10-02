/* ════════════════════════════════════════════════════════════════
   cupones.js  ·  Dashboard → pestaña "Cupones"
   Crea cupones de descuento en % (solo porcentaje).
   Guarda en: .../tiendas/{id}/cupones/{CODIGO}
   El carrito ya los lee con tiendaCuponDoc() y aplica el descuento
   al total, tanto en pedido normal como en mesa (ver parche).
   ════════════════════════════════════════════════════════════════ */
import {
  onSnapshot,
  query,
  where,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { tiendaCuponesCol, tiendaCuponDoc, tiendaDoc } from "../rutas/rutas.js";

const _qs = new URLSearchParams(window.location.search);
let tiendaId = _qs.get("id") || sessionStorage.getItem("tiendaId");
let localidad = (
  _qs.get("localidad") ||
  sessionStorage.getItem("localidad") ||
  ""
)
  .trim()
  .toLowerCase();

let cupones = [];
let alias = null;
let unsub = null;
let audiencia = "todos";

const AUD_TXT = {
  todos: "Cualquier cliente puede usarlo, tenga cuenta o no.",
  registrados:
    "Solo clientes con cuenta. Es una forma de que se registren en tu negocio.",
  seguidores: "Solo clientes que siguen tu negocio. Premia a tus seguidores.",
};
const AUD_LBL = {
  todos: "Para todos",
  registrados: "Solo registrados",
  seguidores: "Solo seguidores",
};
const root = () => document.getElementById("vista-cupones");
const $ = (id) => document.getElementById(id);
const val = (id) => ($(id)?.value ?? "").trim();
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) => "S/ " + (Number(n) || 0).toFixed(2);

/* ───────────── Estilos ───────────── */
function inyectarEstilos() {
  if ($("cp-styles")) return;
  const st = document.createElement("style");
  st.id = "cp-styles";
  st.textContent = `
  #vista-cupones{font-family:'Plus Jakarta Sans',sans-serif;color:#f4f4f5}
  .cp-layout{display:grid;grid-template-columns:1.1fr .9fr;gap:26px;margin-top:18px}
  @media (max-width:820px){.cp-layout{grid-template-columns:1fr}}
  .cp-form{display:flex;flex-direction:column;gap:16px}
  .cp-lbl{display:block;font-size:12px;font-weight:700;color:#d4d4d8;margin-bottom:7px}
  .cp-lbl small{font-weight:600;color:#71717a;margin-left:4px}
  .cp-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
  .cp-chip{padding:8px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);
    color:#a1a1aa;font:700 12.5px 'Plus Jakarta Sans',sans-serif;cursor:pointer;transition:.15s}
  .cp-chip:hover{color:#fff;border-color:rgba(168,85,247,.5)}
  .cp-chip.active{background:#fff;color:#000;border-color:#fff}
  .cp-input{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);
    border-radius:12px;padding:0 12px;height:44px;transition:border-color .15s}
  .cp-input:focus-within{border-color:rgba(168,85,247,.7)}
  .cp-input span{font-size:13px;font-weight:700;color:#a1a1aa}
  .cp-input input{flex:1;min-width:0;background:transparent !important;border:none !important;outline:none;box-shadow:none !important;
    color:#fff;font:700 14px 'Plus Jakarta Sans',sans-serif;padding:0 !important;height:auto !important;width:auto !important}
  .cp-input input::placeholder{color:#52525b;font-weight:500}
  .cp-row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  @media (max-width:520px){.cp-row2{grid-template-columns:1fr}}
  .cp-gen{height:44px;padding:0 14px;border-radius:12px;border:1px solid rgba(168,85,247,.4);background:rgba(168,85,247,.12);
    color:#e9d5ff;font:700 12px 'Plus Jakarta Sans',sans-serif;cursor:pointer;white-space:nowrap;transition:.15s}
  .cp-gen:hover{background:#a855f7;color:#fff}
  .cp-code-row{display:flex;gap:8px}
  .cp-code-row .cp-input{flex:1}
  .cp-submit{height:48px;border:none;border-radius:14px;cursor:pointer;color:#fff;font:800 14px 'Plus Jakarta Sans',sans-serif;
    background:linear-gradient(135deg,#a855f7,#7c3aed);box-shadow:0 12px 28px -10px rgba(124,58,237,.8);transition:.18s}
  .cp-submit:hover{transform:translateY(-1px);filter:brightness(1.08)}
  .cp-submit:disabled{opacity:.5;cursor:not-allowed;transform:none}

  .cp-side{display:flex;flex-direction:column;gap:14px}
  .cp-side-title{font-size:12px;font-weight:700;color:#a1a1aa;margin:0}
  .cp-ticket{display:flex;border-radius:20px;overflow:hidden;background:linear-gradient(135deg,#1a1326,#0e0e14);
    border:1px solid rgba(168,85,247,.38);box-shadow:0 18px 40px -18px rgba(124,58,237,.55)}
  .cp-ticket-pct{padding:20px 18px;min-width:112px;display:flex;flex-direction:column;align-items:center;justify-content:center;
    background:linear-gradient(160deg,#a855f7,#6d28d9);color:#fff}
  .cp-ticket-pct b{font-size:36px;font-weight:800;line-height:1}
  .cp-ticket-pct span{font-size:11px;font-weight:700;letter-spacing:.08em;opacity:.9;margin-top:4px}
  .cp-ticket-body{flex:1;min-width:0;padding:16px 18px;border-left:2px dashed rgba(255,255,255,.2);display:flex;flex-direction:column;justify-content:center;gap:6px}
  .cp-ticket-code{font:800 20px 'JetBrains Mono',monospace;letter-spacing:.14em;color:#fff;overflow:hidden;text-overflow:ellipsis}
  .cp-ticket-cond{font-size:11.5px;line-height:1.45;color:#a1a1aa;margin:0}
  .cp-hint{font-size:12px;line-height:1.55;color:#8b8b95;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);
    border-radius:14px;padding:12px 14px;margin:0}
  .cp-hint b{color:#d4d4d8}

  .cp-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
  .cp-count{font-size:12px;font-weight:700;color:#a1a1aa}
  .cp-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:14px;margin-top:16px}
  .cp-item{display:flex;border-radius:18px;overflow:hidden;background:#0e0e14;border:1px solid rgba(255,255,255,.08);transition:border-color .2s}
  .cp-item:hover{border-color:rgba(168,85,247,.35)}
  .cp-item.off,.cp-item.exp,.cp-item.full{opacity:.6}
  .cp-item-pct{width:84px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
    background:linear-gradient(160deg,#a855f7,#6d28d9);color:#fff}
  .cp-item.off .cp-item-pct,.cp-item.exp .cp-item-pct,.cp-item.full .cp-item-pct{background:linear-gradient(160deg,#52525b,#3f3f46)}
  .cp-item-pct b{font-size:26px;font-weight:800;line-height:1}
  .cp-item-pct span{font-size:10px;font-weight:700;letter-spacing:.08em;opacity:.9;margin-top:3px}
  .cp-item-main{flex:1;min-width:0;padding:14px;display:flex;flex-direction:column;gap:6px;border-left:2px dashed rgba(255,255,255,.14)}
  .cp-item-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .cp-code{font:800 15px 'JetBrains Mono',monospace;letter-spacing:.1em;color:#fff;overflow:hidden;text-overflow:ellipsis}
  .cp-state{font-size:10px;font-weight:800;padding:3px 9px;border-radius:99px;flex-shrink:0}
  .cp-state.on{background:rgba(34,197,94,.15);color:#86efac}
  .cp-state.off{background:rgba(161,161,170,.15);color:#d4d4d8}
  .cp-state.exp{background:rgba(244,63,94,.15);color:#fda4af}
  .cp-state.full{background:rgba(251,191,36,.15);color:#fcd34d}
  .cp-meta{font-size:11.5px;color:#a1a1aa;margin:0;line-height:1.45}
  .cp-stats{font-size:11px;color:#71717a;margin:0}
  .cp-stats b{color:#d4d4d8}
  .cp-actions{display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap}
  .cp-mini{height:30px;padding:0 11px;border-radius:9px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);
    color:#d4d4d8;font:700 11px 'Plus Jakarta Sans',sans-serif;cursor:pointer;transition:.15s}
  .cp-mini:hover{background:rgba(255,255,255,.1);color:#fff}
  .cp-mini.danger:hover,.cp-mini.confirm{background:rgba(225,29,72,.85);border-color:transparent;color:#fff}
  .cp-actions .switch{margin-left:auto}
  .cp-empty{grid-column:1/-1;text-align:center;padding:38px 16px;border:2px dashed rgba(255,255,255,.12);border-radius:18px;color:#71717a;font-size:13px}
  .cp-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:10001;
    background:#fff;color:#111;font:600 13px 'Plus Jakarta Sans',sans-serif;padding:12px 18px;border-radius:14px;
    box-shadow:0 10px 30px rgba(0,0,0,.35);animation:cpIn .25s ease forwards}
  .cp-toast.error{background:#fee2e2;color:#991b1b}
  .cp-toast.out{animation:cpOut .25s ease forwards}
  @keyframes cpIn{from{opacity:0;transform:translate(-50%,14px)}to{opacity:1;transform:translate(-50%,0)}}
  @keyframes cpOut{from{opacity:1;transform:translate(-50%,0)}to{opacity:0;transform:translate(-50%,14px)}}
  `;
  document.head.appendChild(st);
}

function toast(msg, error = false) {
  const t = document.createElement("div");
  t.className = "cp-toast" + (error ? " error" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("out"), 2400);
  setTimeout(() => t.remove(), 2700);
}

/* ───────────── UI base (se construye una sola vez) ───────────── */
function construirUI() {
  const el = root();
  if (!el || el.dataset.listo) return;
  el.dataset.listo = "1";
  el.innerHTML = `
    <div class="card" style="margin-bottom:20px;">
      <h3 class="sec-title">Cupones de descuento</h3>
      <p class="sec-sub">Crea códigos de porcentaje. Tu cliente lo escribe en el carrito y el descuento se aplica al total, en pedidos normales y en mesa.</p>

      <div class="cp-layout">
        <div class="cp-form">
          <div>
            <label class="cp-lbl">Descuento</label>
            <div class="cp-chips" id="cpChips">
              ${[5, 10, 15, 20, 30, 50].map((n) => `<button type="button" class="cp-chip" data-pct="${n}">${n}%</button>`).join("")}
            </div>
            <div class="cp-input"><input id="cpPct" type="number" min="1" max="99" step="1" inputmode="numeric" placeholder="Otro porcentaje"><span>%</span></div>
          </div>

          <div>
            <label class="cp-lbl">Código del cupón</label>
            <div class="cp-code-row">
              <div class="cp-input"><input id="cpCodigo" type="text" maxlength="16" autocomplete="off" placeholder="Ej: VERANO15"></div>
              <button type="button" class="cp-gen" id="cpGen">Generar</button>
            </div>
          </div>

          <div class="cp-row2">
            <div>
              <label class="cp-lbl">Compra mínima <small>opcional</small></label>
              <div class="cp-input"><span>S/</span><input id="cpMin" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"></div>
            </div>
            <div>
              <label class="cp-lbl">Límite de usos <small>opcional</small></label>
              <div class="cp-input"><input id="cpMax" type="number" min="1" step="1" inputmode="numeric" placeholder="Sin límite"></div>
            </div>
          </div>

          <div class="cp-row2">
            <div>
              <label class="cp-lbl">Vence el <small>opcional</small></label>
              <div class="cp-input"><input id="cpVence" type="date"></div>
            </div>
            <div>
              <label class="cp-lbl">Nota interna <small>opcional</small></label>
              <div class="cp-input"><input id="cpNombre" type="text" maxlength="40" placeholder="Ej: Promo de verano"></div>
            </div>
          </div>
<div>
  <label class="cp-lbl">¿Quién puede usarlo?</label>
  <div class="cp-chips" id="cpAud">
    <button type="button" class="cp-chip active" data-aud="todos">🌎 Cualquiera</button>
    <button type="button" class="cp-chip" data-aud="registrados">👤 Solo registrados</button>
    <button type="button" class="cp-chip" data-aud="seguidores">⭐ Solo seguidores</button>
  </div>
  <p class="cp-hint" id="cpAudHint" style="margin-top:8px">${AUD_TXT.todos}</p>
</div>
          <button type="button" class="cp-submit" id="cpCrear">Crear cupón</button>
        </div>

        <div class="cp-side">
          <p class="cp-side-title">Así se verá tu cupón</p>
          <div class="cp-ticket">
            <div class="cp-ticket-pct"><b id="cpPrevPct">—</b><span>DESCUENTO</span></div>
            <div class="cp-ticket-body">
              <div class="cp-ticket-code" id="cpPrevCode">TUCODIGO</div>
              <p class="cp-ticket-cond" id="cpPrevCond">Sin condiciones. Válido para cualquier compra.</p>
            </div>
          </div>
          <p class="cp-hint"><b>El descuento se calcula sobre el total de productos</b> del pedido. El costo de delivery no se descuenta.</p>
        </div>
      </div>
    </div>
    <div class="card" id="cpStats" style="margin-bottom:20px;"></div>

    <div class="card">
      <div class="cp-head">
    
        <div>
          <h3 class="sec-title" style="margin:0">Tus cupones</h3>
          <p class="sec-sub" style="margin:4px 0 0">Actívalos, desactívalos o compártelos con un toque.</p>
        </div>
        <span class="cp-count" id="cpCount"></span>
      </div>
      <div class="cp-list" id="cpList"></div>
    </div>`;

  const fecha = $("cpVence");
  if (fecha)
    fecha.min = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Lima",
    });

  // Eventos del formulario
  $("cpChips").addEventListener("click", (e) => {
    const b = e.target.closest(".cp-chip");
    if (!b) return;
    $("cpPct").value = b.dataset.pct;


    pintarPreview();
  });
  $("cpAud").addEventListener("click", (e) => {
    const b = e.target.closest(".cp-chip");
    if (!b) return;
    audiencia = b.dataset.aud;
    document.querySelectorAll("#cpAud .cp-chip").forEach((x) => x.classList.toggle("active", x === b));
    $("cpAudHint").textContent = AUD_TXT[audiencia];
    pintarPreview();
  });
  ["cpPct", "cpCodigo", "cpMin", "cpMax", "cpVence"].forEach((id) =>
    $(id).addEventListener("input", pintarPreview),
  );
  $("cpCodigo").addEventListener("input", (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });
  $("cpGen").addEventListener("click", () => {
    $("cpCodigo").value = generarCodigo();
    pintarPreview();
  });
  $("cpCrear").addEventListener("click", crearCupon);

  // Eventos de la lista (delegación)
  $("cpList").addEventListener("click", onListClick);
  $("cpList").addEventListener("change", onListChange);
  construirStats();
  pintarPreview();
}

function generarCodigo() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => abc[b % abc.length]).join("");
}

function pintarPreview() {
  const pct = Math.round(Number(val("cpPct")));
  const code = val("cpCodigo") || "TUCODIGO";
  const min = Number(val("cpMin")) || 0;
  const max = Math.floor(Number(val("cpMax"))) || 0;
  const vence = val("cpVence");

  $("cpPrevPct").textContent = pct >= 1 && pct <= 99 ? pct + "%" : "—";
  $("cpPrevCode").textContent = code;

  const cond = [];
  if (min > 0) cond.push(`Compra mínima ${money(min)}`);
  if (max > 0) cond.push(`Primeros ${max} usos`);
  if (vence) cond.push(`Vence el ${vence.split("-").reverse().join("/")}`);

  if (audiencia !== "todos") cond.push(AUD_LBL[audiencia]);
  $("cpPrevCond").textContent = cond.length
    ? cond.join(" · ")
    : "Sin condiciones. Válido para cualquier compra.";

  document
    .querySelectorAll("#cpChips .cp-chip")
    .forEach((b) =>
      b.classList.toggle("active", Number(b.dataset.pct) === pct),
    );
}

/* ───────────── Crear ───────────── */
async function crearCupon() {
  if (!tiendaId || !localidad)
    return toast("Aún estamos cargando los datos de tu tienda…", true);

  const pct = Math.round(Number(val("cpPct")));
  const codigo = val("cpCodigo").toUpperCase().replace(/\s+/g, "");
  const minimo = Math.max(0, Number(val("cpMin")) || 0);
  const maxUsos = Math.floor(Number(val("cpMax"))) || null;
  const fecha = val("cpVence");
  const nombre = val("cpNombre");

  if (!(pct >= 1 && pct <= 99))
    return toast("El descuento debe estar entre 1% y 99%", true);
  if (!/^[A-Z0-9]{3,16}$/.test(codigo))
    return toast(
      "El código debe tener de 3 a 16 letras o números, sin espacios",
      true,
    );

  let expiraEn = null;
  if (fecha) {
    const [y, m, d] = fecha.split("-").map(Number);
    // Fin del día en hora de Perú (UTC-5)
    expiraEn = Date.UTC(y, m - 1, d, 23, 59, 59) + 5 * 3600 * 1000;
    if (expiraEn <= Date.now())
      return toast("La fecha de vencimiento ya pasó", true);
  }

  const btn = $("cpCrear");
  btn.disabled = true;
  btn.textContent = "Creando…";
  try {
    const ref = tiendaCuponDoc(localidad, tiendaId, codigo);
    if ((await getDoc(ref)).exists()) {
      toast("Ya existe un cupón con ese código. Prueba con otro.", true);
      return;
    }
    await setDoc(ref, {
      codigo,
      nombre: nombre || `${pct}% de descuento`,
      tipo: "manual",
      origen: "negocio",
      tipoDescuentoManual: "porcentaje",
      porcentajeManual: pct,
      montoManual: null,
      compraMinima: minimo,
      activo: true,
      estado: "activo",
      usado: false,
      multiuso: true,
      usosMaximos: maxUsos,
      usos: 0,
      descuento_total: 0,
      ventas_total: 0,
      expiraEn,
      fechaVence: fecha || null,
      negocioId: tiendaId,
      localidad,
      creadoEn: serverTimestamp(),
      audiencia,
    });
    toast(`Cupón ${codigo} creado`);
    ["cpPct", "cpCodigo", "cpMin", "cpMax", "cpVence", "cpNombre"].forEach(
      (id) => ($(id).value = ""),
    );
    pintarPreview();
  } catch (err) {
    console.error("Error creando cupón:", err);
    toast("No se pudo crear el cupón. Intenta de nuevo.", true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Crear cupón";
  }
}

/* ───────────── Lista ───────────── */
function estadoDe(c) {
  if (c.activo === false) return { k: "off", t: "Desactivado" };
  if (c.expiraEn && Date.now() >= c.expiraEn) return { k: "exp", t: "Vencido" };
  if (c.usosMaximos && (c.usos || 0) >= c.usosMaximos)
    return { k: "full", t: "Agotado" };
  return { k: "on", t: "Activo" };
}

function renderLista() {
      pintarStats();
  const list = $("cpList");
  if (!list) return;
  $("cpCount").textContent = cupones.length
    ? `${cupones.length} cupón${cupones.length === 1 ? "" : "es"}`
    : "";

  if (!cupones.length) {
    list.innerHTML = `<div class="cp-empty">Aún no tienes cupones. Crea el primero arriba y compártelo con tus clientes.</div>`;
    return;
  }

  list.innerHTML = cupones
    .map((c) => {
      const est = estadoDe(c);
      const meta = [];
      if (Number(c.compraMinima) > 0)
        meta.push(`Mín. ${money(c.compraMinima)}`);
      meta.push(
        c.fechaVence
          ? `Vence ${c.fechaVence.split("-").reverse().join("/")}`
          : "Sin vencimiento",
      );
      if (c.audiencia && c.audiencia !== "todos")
        meta.push(AUD_LBL[c.audiencia]);
      const usos = c.usosMaximos
        ? `${c.usos || 0}/${c.usosMaximos} usos`
        : `${c.usos || 0} usos`;
      return `
      <div class="cp-item ${est.k}" data-code="${esc(c.codigo)}">
        <div class="cp-item-pct"><b>${esc(c.porcentajeManual)}%</b><span>OFF</span></div>
        <div class="cp-item-main">
          <div class="cp-item-top">
            <span class="cp-code">${esc(c.codigo)}</span>
            <span class="cp-state ${est.k}">${est.t}</span>
          </div>
          <p class="cp-meta">${esc(meta.join(" · "))}</p>
          <p class="cp-stats"><b>${usos}</b> · Descontado ${money(c.descuento_total)} · Ventas ${money(c.ventas_total)}</p>
          <div class="cp-actions">
            <button type="button" class="cp-mini" data-act="copy">Copiar código</button>
            ${alias ? `<button type="button" class="cp-mini" data-act="link">Copiar link</button>` : ""}
            <button type="button" class="cp-mini danger" data-act="del">Eliminar</button>
            <label class="switch" title="Activar / desactivar">
              <input type="checkbox" data-act="toggle" ${c.activo !== false ? "checked" : ""}>
              <span class="slider"></span>
            </label>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

async function copiar(texto, ok) {
  try {
    await navigator.clipboard.writeText(texto);
    toast(ok);
  } catch {
    toast("No se pudo copiar. Cópialo manualmente.", true);
  }
}

function onListClick(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn || btn.dataset.act === "toggle") return;
  const code = btn.closest(".cp-item")?.dataset.code;
  if (!code) return;

  if (btn.dataset.act === "copy") return copiar(code, "Código copiado");
  if (btn.dataset.act === "link") {
    const url = `https://geinztech.com/perfil/${encodeURIComponent(alias)}/carrito?cupon=${encodeURIComponent(code)}`;
    return copiar(url, "Link copiado. Al abrirlo, el cupón se aplica solo");
  }
  if (btn.dataset.act === "del") {
    if (!btn.classList.contains("confirm")) {
      btn.classList.add("confirm");
      btn.textContent = "¿Seguro?";
      setTimeout(() => {
        btn.classList.remove("confirm");
        btn.textContent = "Eliminar";
      }, 3000);
      return;
    }
    deleteDoc(tiendaCuponDoc(localidad, tiendaId, code))
      .then(() => toast("Cupón eliminado"))
      .catch((err) => {
        console.error(err);
        toast("No se pudo eliminar", true);
      });
  }
}

function onListChange(e) {
  const sw = e.target.closest('[data-act="toggle"]');
  if (!sw) return;
  const code = sw.closest(".cp-item")?.dataset.code;
  if (!code) return;
  updateDoc(tiendaCuponDoc(localidad, tiendaId, code), {
    activo: sw.checked,
    estado: sw.checked ? "activo" : "desactivado",
  })
    .then(() => toast(sw.checked ? "Cupón activado" : "Cupón desactivado"))
    .catch((err) => {
      console.error(err);
      sw.checked = !sw.checked;
      toast("No se pudo actualizar", true);
    });
}

/* ───────────── Estadísticas + gráficos + PDF ───────────── */
let charts = {};
let agg = null;

function inyectarEstilosStats() {
  if ($("cp-styles-stats")) return;
  const st = document.createElement("style");
  st.id = "cp-styles-stats";
  st.textContent = `
  .cs-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .cs-pdf{height:38px;padding:0 16px;border:none;border-radius:12px;cursor:pointer;background:#fff;color:#000;font:800 12px 'Plus Jakarta Sans',sans-serif}
  .cs-pdf:disabled{opacity:.5}
  .cs-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}
  .cs-kpi{background:#0e0e14;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:14px}
  .cs-kpi small{display:block;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#71717a}
  .cs-kpi b{display:block;margin-top:4px;font:800 22px 'JetBrains Mono',monospace;color:#fff}
  .cs-grid{display:grid;grid-template-columns:2fr 1fr;gap:14px}
  .cs-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
  @media (max-width:820px){.cs-grid,.cs-grid2{grid-template-columns:1fr}}
  .cs-box{background:#0e0e14;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:14px}
  .cs-box h4{margin:0 0 10px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#a1a1aa}
  .cs-cv{position:relative;height:210px}
  .cs-cli{display:flex;flex-direction:column;gap:8px;max-height:230px;overflow-y:auto}
  .cs-row{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px;color:#e4e4e7}
  .cs-tag{font-size:10px;font-weight:800;padding:2px 8px;border-radius:99px;margin-left:6px}
  .cs-tag.si{background:rgba(34,197,94,.15);color:#86efac}
  .cs-tag.no{background:rgba(161,161,170,.15);color:#d4d4d8}
  .cs-empty{font-size:12px;color:#71717a}`;
  document.head.appendChild(st);
}

function construirStats() {
  inyectarEstilosStats();
  const el = $("cpStats");
  if (!el) return;
  el.innerHTML = `
    <div class="cs-head">
      <div>
        <h3 class="sec-title" style="margin:0">Estadísticas de cupones</h3>
        <p class="sec-sub" style="margin:4px 0 0">Últimos 14 días. Se calcula con los datos que ya cargaste, sin consultas extra.</p>
      </div>
      <button type="button" class="cs-pdf" id="csPdf">Exportar PDF</button>
    </div>
    <div class="cs-kpis" id="csKpis"></div>
    <div class="cs-grid">
      <div class="cs-box"><h4>Actividad por día</h4><div class="cs-cv"><canvas id="csDia"></canvas></div></div>
      <div class="cs-box"><h4>Seguidores vs otros</h4><div class="cs-cv"><canvas id="csSeg"></canvas></div></div>
    </div>
    <div class="cs-grid2">
      <div class="cs-box"><h4>Cupones más usados</h4><div class="cs-cv"><canvas id="csTop"></canvas></div></div>
      <div class="cs-box"><h4>Clientes que lo usaron</h4><div class="cs-cli" id="csClientes"></div></div>
    </div>`;
  $("csPdf").addEventListener("click", exportarPDF);
}

function diasLima(n = 14) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" });
  return Array.from({ length: n }, (_, i) =>
    f.format(new Date(Date.now() - (n - 1 - i) * 864e5)),
  );
}

function calcularAgg() {
  const dias = diasLima();
  const porDia = Object.fromEntries(
    dias.map((d) => [d, { usos: 0, ventas: 0, descuento: 0 }]),
  );
  const clientes = new Map();
  let usos = 0,
    descuento = 0,
    ventas = 0,
    invitados = 0;
  cupones.forEach((c) => {
    usos += c.usos || 0;
    descuento += c.descuento_total || 0;
    ventas += c.ventas_total || 0;
    invitados += c.usos_invitado || 0;
    Object.entries(c.por_dia || {}).forEach(([d, v]) => {
      if (!porDia[d]) return;
      porDia[d].usos += v.usos || 0;
      porDia[d].ventas += v.ventas || 0;
      porDia[d].descuento += v.descuento || 0;
    });
    Object.entries(c.usuarios || {}).forEach(([uid, u]) => {
      const x = clientes.get(uid) || {
        nombre: u.nombre || "Cliente",
        seguidor: false,
        usos: 0,
        ultimo: 0,
      };
      x.usos += u.usos || 0;
      x.seguidor = x.seguidor || !!u.seguidor;
      x.ultimo = Math.max(x.ultimo, u.ultimo || 0);
      clientes.set(uid, x);
    });
  });
  const lista = [...clientes.values()].sort((a, b) => b.usos - a.usos);
  const seguidores = lista.filter((c) => c.seguidor).length;
  const top = [...cupones]
    .sort((a, b) => (b.usos || 0) - (a.usos || 0))
    .slice(0, 6);
  return {
    dias,
    porDia,
    usos,
    descuento,
    ventas,
    invitados,
    lista,
    seguidores,
    noSeguidores: lista.length - seguidores,
    ticket: usos ? ventas / usos : 0,
    top,
  };
}

function dibujar(id, config) {
  const cv = $(id);
  if (!cv || !window.Chart) return;
  charts[id]?.destroy();
  charts[id] = new window.Chart(cv, config);
}

function pintarStats() {
  if (!$("cpStats")) return;
  agg = calcularAgg();
  const a = agg;
  $("csKpis").innerHTML = [
    ["Usos", a.usos],
    ["Descontado", money(a.descuento)],
    ["Ventas con cupón", money(a.ventas)],
    ["Ticket promedio", money(a.ticket)],
    ["Clientes", a.lista.length + (a.invitados ? ` +${a.invitados} inv.` : "")],
  ]
    .map(([t, v]) => `<div class="cs-kpi"><small>${t}</small><b>${v}</b></div>`)
    .join("");

  $("csClientes").innerHTML = a.lista.length
    ? a.lista
        .slice(0, 30)
        .map(
          (c) => `
        <div class="cs-row">
          <span>${esc(c.nombre)}<span class="cs-tag ${c.seguidor ? "si" : "no"}">${c.seguidor ? "Seguidor" : "No sigue"}</span></span>
          <b>${c.usos} uso${c.usos === 1 ? "" : "s"}</b>
        </div>`,
        )
        .join("")
    : `<p class="cs-empty">Aún no hay clientes registrados con cupón.</p>`;

  if (!window.Chart) return;
  const grid = { color: "rgba(255,255,255,.06)" };
  const tick = { color: "#a1a1aa", font: { size: 10 } };
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: {
        labels: { color: "#d4d4d8", boxWidth: 10, font: { size: 11 } },
      },
    },
  };

  dibujar("csDia", {
    type: "line",
    data: {
      labels: a.dias.map((d) => d.slice(5).split("-").reverse().join("/")),
      datasets: [
        {
          label: "Usos",
          data: a.dias.map((d) => a.porDia[d].usos),
          borderColor: "#a855f7",
          backgroundColor: "rgba(168,85,247,.2)",
          fill: true,
          tension: 0.35,
          yAxisID: "y",
        },
        {
          label: "Ventas S/",
          data: a.dias.map((d) => +a.porDia[d].ventas.toFixed(2)),
          borderColor: "#22c55e",
          tension: 0.35,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      ...base,
      scales: {
        x: { grid, ticks: tick },
        y: { grid, ticks: { ...tick, precision: 0 }, beginAtZero: true },
        y1: {
          position: "right",
          grid: { display: false },
          ticks: tick,
          beginAtZero: true,
        },
      },
    },
  });

  dibujar("csSeg", {
    type: "doughnut",
    data: {
      labels: ["Seguidores", "No siguen", "Invitados"],
      datasets: [
        {
          data: [a.seguidores, a.noSeguidores, a.invitados],
          backgroundColor: ["#22c55e", "#71717a", "#f59e0b"],
          borderWidth: 0,
        },
      ],
    },
    options: base,
  });

  dibujar("csTop", {
    type: "bar",
    data: {
      labels: a.top.map((c) => c.codigo),
      datasets: [
        {
          label: "Usos",
          data: a.top.map((c) => c.usos || 0),
          backgroundColor: "#7c3aed",
          borderRadius: 6,
        },
      ],
    },
    options: {
      ...base,
      indexAxis: "y",
      scales: {
        x: { grid, ticks: { ...tick, precision: 0 }, beginAtZero: true },
        y: { grid: { display: false }, ticks: tick },
      },
    },
  });
}

async function cargarJsPDF() {
  if (window.jspdf) return window.jspdf.jsPDF;
  await new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src =
      "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = ok;
    s.onerror = ko;
    document.head.appendChild(s);
  });
  return window.jspdf.jsPDF;
}

function canvasConFondo(cv) {
  const o = document.createElement("canvas");
  o.width = cv.width;
  o.height = cv.height;
  const x = o.getContext("2d");
  x.fillStyle = "#0e0e14";
  x.fillRect(0, 0, o.width, o.height);
  x.drawImage(cv, 0, 0);
  return o;
}

async function exportarPDF() {
  const btn = $("csPdf");
  if (!agg) pintarStats();
  btn.disabled = true;
  btn.textContent = "Generando…";
  try {
    const JsPDF = await cargarJsPDF();
    const doc = new JsPDF({ unit: "mm", format: "a4" });
    const W = 210,
      M = 14;
    let y = 18;
    const salto = (h) => {
      if (y + h > 282) {
        doc.addPage();
        y = 16;
      }
    };

    doc.setFontSize(18);
    doc.text("Reporte de cupones", M, y);
    y += 7;
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(
      new Date().toLocaleString("es-PE", { timeZone: "America/Lima" }) +
        "  |  Ultimos 14 dias",
      M,
      y,
    );
    y += 9;
    doc.setTextColor(0);

    doc.setFontSize(11);
    [
      `Usos: ${agg.usos}`,
      `Total descontado: ${money(agg.descuento)}`,
      `Ventas con cupon: ${money(agg.ventas)}`,
      `Ticket promedio: ${money(agg.ticket)}`,
      `Clientes: ${agg.lista.length} (${agg.seguidores} seguidores) + ${agg.invitados} usos de invitados`,
    ].forEach((t) => {
      doc.text(t, M, y);
      y += 6;
    });
    y += 3;

    for (const id of ["csDia", "csSeg", "csTop"]) {
      const cv = $(id);
      if (!cv) continue;
      const w = id === "csSeg" ? 90 : W - 2 * M;
      const h = (w * cv.height) / cv.width;
      salto(h + 4);
      doc.addImage(
        canvasConFondo(cv).toDataURL("image/png"),
        "PNG",
        M,
        y,
        w,
        h,
      );
      y += h + 6;
    }

    salto(14);
    doc.setFontSize(13);
    doc.text("Clientes que usaron cupones", M, y);
    y += 7;
    doc.setFontSize(10);
    if (!agg.lista.length) doc.text("Sin datos todavia.", M, y);
    agg.lista.slice(0, 60).forEach((c) => {
      salto(6);
      doc.text(
        `${c.nombre}  -  ${c.seguidor ? "Seguidor" : "No sigue"}  -  ${c.usos} uso(s)`,
        M,
        y,
      );
      y += 5.5;
    });

    doc.save("reporte-cupones.pdf");
  } catch (e) {
    console.error(e);
    toast("No se pudo generar el PDF", true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Exportar PDF";
  }
}
/* ───────────── Datos en vivo ───────────── */
async function cargarAlias() {
  try {
    const snap = await getDoc(tiendaDoc(localidad, "tiendas", tiendaId));
    const d = snap.exists() ? snap.data() : {};
    alias = d.alias_key || d.alias_negocio || null;
  } catch {
    alias = null;
  }
}

async function iniciar() {
  if (!tiendaId || !localidad || !root()) return;
  inyectarEstilos();
  construirUI();
  if (unsub) unsub();
  await cargarAlias();
  const q = query(
    tiendaCuponesCol(localidad, tiendaId),
    where("origen", "==", "negocio"),
  );
  unsub = onSnapshot(
    q,
    (snap) => {
      cupones = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort(
          (a, b) =>
            (b.creadoEn?.toMillis?.() || 0) - (a.creadoEn?.toMillis?.() || 0),
        );
      renderLista();
    },
    (err) => console.error("Error cargando cupones:", err),
  );
}

// El dashboard padre manda los datos de la tienda por postMessage (mismos formatos que usan los otros módulos)
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
else if (root()) {
  inyectarEstilos();
  construirUI();
}
