/* ===================================================================
   fidelizacion_ui_front.js
   Premios con selección múltiple + carrito + panel lateral
   (Historial de puntos / Cupones activos).

   Novedades:
   - Premios con `unico: true` (descuentos) solo se pueden agregar 1 vez.
   - Animación "vuela al carrito" al agregar un premio.

   USO:
     const ui = initFidelizacionUI({
       grid:    document.getElementById("rewardsGrid"),
       filtros: document.getElementById("rewardsFiltros"),
       header:  document.getElementById("pointsHint").parentElement,
       onCanjear: async (items) => { ... },
       fetchHistorial: async ({ cursor }) => ({ rows, cursor, hayMas }),
       onCancelarCupon: async (cupon) => { ... },
     });
     ui.setPuntos(120);
     ui.setPremios([{ id, nombre, costoPuntos, imagenUrl, detalle, categoria, unico }]);
     ui.setCupones([{ id, nombre, codigo, costoPuntos }]);
   =================================================================== */

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const fmt = (n) => Number(n || 0).toLocaleString("es-PE");
const mk = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const IC = {
  hist: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/><path d="M12 8v4l3 2"/></svg>`,
  cart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6"/></svg>`,
  gift: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>`,
};
const TIPO = {
  ganado: { ico: "🎉", sign: "+" },
  canje: { ico: "🎁", sign: "−" },
  devolucion: { ico: "↩️", sign: "+" },
  ajuste: { ico: "✏️", sign: "" },
};

export function initFidelizacionUI(opts) {
  const { grid, filtros, header, onCanjear, fetchHistorial, onCancelarCupon } = opts;

  const S = {
    puntos: 0,
    premios: [],
    byId: new Map(),
    cart: new Map(), // id -> cantidad
    cat: "Todos",
    cupones: [],
    hist: { rows: [], cursor: null, hayMas: true, loading: false, filtro: "todos", cargado: false },
  };

  /* ---------- cálculos ---------- */
  const totalCarrito = () => { let t = 0; S.cart.forEach((q, id) => (t += q * (S.byId.get(id)?.costoPuntos || 0))); return t; };
  const disponible = () => S.puntos - totalCarrito();
  const unidades = () => { let n = 0; S.cart.forEach((q) => (n += q)); return n; };

  /* ---------- botones del encabezado ---------- */
  const actions = mk(`<div class="fx-head-actions">
    <button type="button" class="fx-pill-btn" data-a="hist">${IC.hist}<span>Ver historial</span></button>
    <button type="button" class="fx-pill-btn" data-a="cart" aria-label="Carrito de canje">${IC.cart}<span class="fx-badge">0</span></button>
  </div>`);
  header.appendChild(actions);
  const badge = actions.querySelector(".fx-badge");
  const cartBtn = actions.querySelector('[data-a="cart"]');
  actions.addEventListener("click", (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "hist") openDrawer();
    if (a === "cart") openCart();
  });

  function pintarBadge() {
    const n = unidades();
    badge.textContent = n;
    badge.classList.toggle("on", n > 0);
    badge.classList.remove("pop"); void badge.offsetWidth; if (n) badge.classList.add("pop");
  }

  /* ---------- animación: el premio "vuela" al carrito ---------- */
  function rebotarCarrito() {
    cartBtn.classList.remove("fx-bump"); void cartBtn.offsetWidth;
    cartBtn.classList.add("fx-bump");
    cartBtn.addEventListener("animationend", () => cartBtn.classList.remove("fx-bump"), { once: true });
  }

  function volar(card) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return rebotarCarrito();
    const src = card.querySelector(".fx-thumb") || card;
    const a = src.getBoundingClientRect();
    const b = cartBtn.getBoundingClientRect();
    const size = 46;

    const sx = a.left + a.width / 2 - size / 2;
    const sy = a.top + a.height / 2 - size / 2;
    // Si el carrito quedó fuera de pantalla (scroll), vuela hacia el borde superior
    const ex = Math.min(innerWidth - size, Math.max(0, b.left + b.width / 2 - size / 2));
    const ey = Math.max(4, b.top + b.height / 2 - size / 2);
    const dx = ex - sx, dy = ey - sy;

    const img = src.querySelector("img");
    const fly = mk(`<div class="fx-fly">${img ? `<img src="${esc(img.currentSrc || img.src)}" alt="">` : IC.gift}</div>`);
    fly.style.cssText = `width:${size}px;height:${size}px;left:${sx}px;top:${sy}px;`;
    document.body.appendChild(fly);

    // Trayectoria en arco: sube un poco y cae hacia el carrito
    const arco = Math.min(110, 50 + Math.abs(dy) * 0.25);
    const anim = fly.animate(
      [
        { transform: "translate(0,0) scale(.85) rotate(0deg)", opacity: 0.9, offset: 0 },
        { transform: `translate(${dx * 0.3}px, ${dy * 0.3 - arco}px) scale(1.2) rotate(-14deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${dx * 0.75}px, ${dy * 0.75 - arco * 0.35}px) scale(.8) rotate(8deg)`, opacity: 1, offset: 0.75 },
        { transform: `translate(${dx}px, ${dy}px) scale(.25) rotate(18deg)`, opacity: 0.2, offset: 1 },
      ],
      { duration: 700, easing: "cubic-bezier(.4,.1,.6,.9)" },
    );
    anim.onfinish = () => { fly.remove(); rebotarCarrito(); };
    anim.oncancel = () => fly.remove();
  }

  /* ---------- filtros de categoría ---------- */
  function renderFiltros() {
    if (!filtros) return;
    const cats = [...new Set(S.premios.map((p) => p.categoria).filter(Boolean))];
    filtros.innerHTML = cats.length ? ["Todos", ...cats].map((c) => `<button type="button" class="hp-chip${c === S.cat ? " active" : ""}" data-c="${esc(c)}">${esc(c)}</button>`).join("") : "";
  }
  filtros?.addEventListener("click", (e) => {
    const c = e.target.closest("[data-c]")?.dataset.c;
    if (!c) return;
    S.cat = c; renderFiltros(); renderGrid();
  });

  /* ---------- grilla de premios ---------- */
  function actHTML(p) {
    const q = S.cart.get(p.id) || 0;
    if (q > 0 && p.unico) return `<button class="fx-added" data-m="-" aria-label="Quitar">✓ Agregado · Quitar</button>`;
    if (q > 0) return `<div class="fx-step"><button data-m="-" aria-label="Quitar uno">−</button><b>${q}</b><button data-m="+" aria-label="Agregar uno" ${p.costoPuntos > disponible() ? "disabled" : ""}>+</button></div>`;
    if (p.costoPuntos <= disponible()) return `<button class="fx-add" data-m="+">Agregar</button>`;
    const falta = p.costoPuntos - Math.max(0, disponible());
    const pct = Math.min(1, Math.max(0, disponible()) / p.costoPuntos);
    return `<div class="fx-lock"><div class="fx-meter"><i style="transform:scaleX(${pct})"></i></div><span>Te faltan ${fmt(falta)} pts</span></div>`;
  }
  function cardHTML(p) {
    const thumb = p.imagenUrl ? `<img src="${esc(p.imagenUrl)}" alt="" width="42" height="42" loading="lazy" decoding="async">` : IC.gift;
    return `<article class="fx-card${S.cart.get(p.id) ? " in-cart" : ""}" data-id="${esc(p.id)}">
      <div class="fx-thumb">${thumb}</div>
      <h3 class="fx-name">${esc(p.nombre)}</h3>
      ${p.detalle ? `<p class="fx-sub">${esc(p.detalle)}</p>` : ""}
      <p class="fx-cost">${fmt(p.costoPuntos)} pts</p>
      ${p.unico ? `<p class="fx-once">Máx. 1 por canje</p>` : ""}
      <div class="fx-act">${actHTML(p)}</div>
    </article>`;
  }
  function renderGrid() {
    const lista = S.cat === "Todos" ? S.premios : S.premios.filter((p) => p.categoria === S.cat);
    grid.innerHTML = lista.map(cardHTML).join("") || `<div class="fx-empty" style="grid-column:1/-1">Aún no hay premios para canjear.</div>`;
  }
  // Al cambiar el carrito solo se repintan los botones (rápido, sin recrear imágenes)
  function refrescarAcciones() {
    grid.querySelectorAll(".fx-card").forEach((card) => {
      const p = S.byId.get(card.dataset.id);
      if (!p) return;
      card.querySelector(".fx-act").innerHTML = actHTML(p);
      card.classList.toggle("in-cart", !!S.cart.get(p.id));
    });
    pintarBadge();
    if (cartOv?.classList.contains("open")) pintarCart();
  }
  // Devuelve true si el carrito realmente cambió
  function cambiar(id, delta) {
    const p = S.byId.get(id); if (!p) return false;
    const q = S.cart.get(id) || 0;
    if (delta > 0) {
      if (p.unico && q >= 1) { toast("Los descuentos se canjean de a uno"); return false; }
      if (p.costoPuntos > disponible()) { toast("No te alcanzan los puntos"); return false; }
    }
    const n = q + delta;
    n <= 0 ? S.cart.delete(id) : S.cart.set(id, n);
    refrescarAcciones();
    return true;
  }
  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-m]");
    if (!btn) return;
    const card = btn.closest(".fx-card");
    if (!card) return;
    const delta = btn.dataset.m === "+" ? 1 : -1;
    if (cambiar(card.dataset.id, delta) && delta > 0) volar(card);
  });

  /* ---------- overlay genérico ---------- */
  function overlay(id, inner) {
    const ov = mk(`<div class="fx-overlay" id="${id}" role="dialog" aria-modal="true">${inner}</div>`);
    document.body.appendChild(ov);
    ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-close]")) cerrar(ov); });
    return ov;
  }
  function abrir(ov) {
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.add("open")));
  }
  function cerrar(ov) {
    ov.classList.remove("open");
    if (!document.querySelector(".fx-overlay.open:not(#" + ov.id + ")")) document.body.style.overflow = "";
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const abierto = [...document.querySelectorAll(".fx-overlay.open")].pop();
    if (abierto) cerrar(abierto);
  });

  /* ---------- panel lateral: historial + cupones ---------- */
  let drawerOv = null;
  function openDrawer() {
    if (!drawerOv) {
      drawerOv = overlay("fxDrawer", `
        <aside class="fx-drawer">
          <div class="fx-dhead"><h3 class="fx-dtitle">Mi actividad</h3><button class="fx-x" data-close aria-label="Cerrar">✕</button></div>
          <div class="fx-tabs" data-t="0">
            <button class="fx-tab active" data-tab="0">Historial</button>
            <button class="fx-tab" data-tab="1">Cupones <span id="fxCupN"></span></button>
          </div>
          <div class="fx-chips" id="fxChips">
            <button class="fx-chip active" data-f="todos">Todos</button>
            <button class="fx-chip" data-f="ganado">🎉 Ganados</button>
            <button class="fx-chip" data-f="canje">🎁 Canjes</button>
            <button class="fx-chip" data-f="devolucion">↩️ Devueltos</button>
          </div>
          <div class="fx-body">
            <div class="fx-pane show" id="fxPaneHist"></div>
            <div class="fx-pane" id="fxPaneCup"></div>
          </div>
        </aside>`);
      drawerOv.addEventListener("click", onDrawerClick);
      pintarCupones();
    }
    abrir(drawerOv);
    if (!S.hist.cargado) cargarHistorial(true); // se pide solo la primera vez que se abre
  }

  function onDrawerClick(e) {
    const tab = e.target.closest("[data-tab]");
    if (tab) {
      const i = Number(tab.dataset.tab);
      drawerOv.querySelector(".fx-tabs").dataset.t = i;
      drawerOv.querySelectorAll(".fx-tab").forEach((t, k) => t.classList.toggle("active", k === i));
      drawerOv.querySelector("#fxPaneHist").classList.toggle("show", i === 0);
      drawerOv.querySelector("#fxPaneCup").classList.toggle("show", i === 1);
      drawerOv.querySelector("#fxChips").style.display = i === 0 ? "" : "none";
      return;
    }
    const chip = e.target.closest("[data-f]");
    if (chip) {
      drawerOv.querySelectorAll(".fx-chip").forEach((c) => c.classList.toggle("active", c === chip));
      S.hist.filtro = chip.dataset.f;
      pintarHistorial();
      return;
    }
    if (e.target.closest("[data-more]")) return cargarHistorial(false);
    const cb = e.target.closest("[data-cancel]");
    if (cb) cancelarCupon(cb);
  }

  async function cargarHistorial(reset) {
    const h = S.hist;
    if (h.loading) return;
    h.loading = true;
    if (reset) { h.rows = []; h.cursor = null; h.hayMas = true; }
    pintarHistorial();
    try {
      const r = await fetchHistorial({ cursor: h.cursor });
      h.rows = h.rows.concat(r.rows || []);
      h.cursor = r.cursor ?? null;
      h.hayMas = !!r.hayMas;
      h.cargado = true;
    } catch (err) {
      console.warn("historial:", err); toast("No se pudo cargar el historial");
    } finally { h.loading = false; pintarHistorial(); }
  }

  function pintarHistorial() {
    const pane = drawerOv?.querySelector("#fxPaneHist"); if (!pane) return;
    const h = S.hist;
    const rows = h.filtro === "todos" ? h.rows : h.rows.filter((r) => r.tipo === h.filtro);
    let html = rows.map((r, i) => {
      const t = TIPO[r.tipo] || TIPO.ajuste;
      const sign = r.tipo === "ajuste" ? (r.puntos >= 0 ? "+" : "−") : t.sign;
      const f = r.fecha instanceof Date && !isNaN(r.fecha) ? r.fecha.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "—";
      return `<div class="fx-row ${esc(r.tipo)}" style="animation-delay:${Math.min(i, 8) * 25}ms">
        <div class="fx-ico">${t.ico}</div>
        <div class="fx-rmain"><div class="fx-rtitle">${esc(r.concepto)}</div><div class="fx-rdate">${f}</div></div>
        <div class="fx-pts">${sign}${fmt(Math.abs(r.puntos))}</div></div>`;
    }).join("");
    if (h.loading) html += `<div class="fx-skel"></div><div class="fx-skel"></div><div class="fx-skel"></div>`;
    else if (!rows.length) html = `<div class="fx-empty">${h.hayMas && h.rows.length ? "Nada en este filtro aún. Carga más abajo." : "Todavía no hay movimientos."}</div>`;
    if (!h.loading && h.hayMas && h.cargado) html += `<button class="fx-more" data-more>Ver más</button>`;
    pane.innerHTML = html;
  }

  function pintarCupones() {
    const pane = drawerOv?.querySelector("#fxPaneCup"); if (!pane) return;
    const n = drawerOv.querySelector("#fxCupN"); if (n) n.textContent = S.cupones.length ? `(${S.cupones.length})` : "";
    pane.innerHTML = S.cupones.length
      ? S.cupones.map((c) => `<div class="fx-cupon"><div class="fx-rmain"><div class="fx-rtitle">${esc(c.nombre)}</div><div class="fx-rdate" style="color:var(--fx-ok)">${esc(c.codigo || "")}</div></div>
          ${onCancelarCupon ? `<button class="fx-cupon-btn" data-cancel="${esc(c.id)}">Cancelar · +${fmt(c.costoPuntos)} pts</button>` : ""}</div>`).join("")
      : `<div class="fx-empty">No tienes cupones activos.</div>`;
  }
  async function cancelarCupon(btn) {
    const c = S.cupones.find((x) => x.id === btn.dataset.cancel); if (!c) return;
    btn.disabled = true; btn.textContent = "Cancelando…";
    try { await onCancelarCupon(c); toast("Cupón cancelado, puntos devueltos"); S.hist.cargado = false; }
    catch (err) { console.warn(err); toast("No se pudo cancelar"); btn.disabled = false; }
  }

  /* ---------- diálogo del carrito ---------- */
  let cartOv = null;
  function openCart() {
    if (!cartOv) {
      cartOv = overlay("fxCart", `
        <div class="fx-modal">
          <div class="fx-dhead"><h3 class="fx-dtitle">Tu selección</h3><button class="fx-x" data-close aria-label="Cerrar">✕</button></div>
          <div class="fx-body" id="fxCartBody" style="padding-top:0"></div>
          <div class="fx-sum">
            <div class="fx-sum-row"><span>Total a canjear</span><b id="fxTot">0 pts</b></div>
            <div class="fx-sum-row"><span>Te quedarán</span><b id="fxRest">0 pts</b></div>
            <p class="fx-err" id="fxErr"></p>
            <button class="fx-confirm" id="fxConfirm">Confirmar canje</button>
          </div>
        </div>`);
      cartOv.addEventListener("click", (e) => {
        const m = e.target.closest("[data-cm]");
        if (m) cambiar(m.dataset.id, m.dataset.cm === "+" ? 1 : -1);
        if (e.target.id === "fxConfirm") confirmar(e.target);
      });
    }
    pintarCart();
    abrir(cartOv);
  }
  function pintarCart() {
    const body = cartOv.querySelector("#fxCartBody");
    if (!S.cart.size) {
      body.innerHTML = `<div class="fx-empty">Aún no elegiste nada.<br>Agrega premios desde la lista.</div>`;
    } else {
      body.innerHTML = [...S.cart].map(([id, q]) => {
        const p = S.byId.get(id); if (!p) return "";
        const th = p.imagenUrl ? `<img src="${esc(p.imagenUrl)}" alt="" width="42" height="42">` : `<div class="fx-thumb">${IC.gift}</div>`;
        const noMas = p.unico || p.costoPuntos > disponible();
        return `<div class="fx-line">${th}<div class="fx-rmain"><div class="fx-rtitle">${esc(p.nombre)}</div><div class="fx-rdate">${fmt(p.costoPuntos * q)} pts${p.unico ? " · máx. 1" : ""}</div></div>
          <div class="fx-step"><button data-cm="-" data-id="${esc(id)}">−</button><b>${q}</b><button data-cm="+" data-id="${esc(id)}" ${noMas ? "disabled" : ""}>+</button></div></div>`;
      }).join("");
    }
    cartOv.querySelector("#fxTot").textContent = `${fmt(totalCarrito())} pts`;
    cartOv.querySelector("#fxRest").textContent = `${fmt(disponible())} pts`;
    cartOv.querySelector("#fxConfirm").disabled = !S.cart.size;
    cartOv.querySelector("#fxErr").classList.remove("show");
  }
  async function confirmar(btn) {
    const err = cartOv.querySelector("#fxErr");
    if (disponible() < 0) { err.textContent = "No te alcanzan los puntos"; err.classList.add("show"); return; }
    const items = [...S.cart].map(([id, cantidad]) => {
      const premio = S.byId.get(id);
      return { premio, cantidad: premio?.unico ? 1 : cantidad };
    });
    const txt = btn.textContent;
    btn.disabled = true; btn.textContent = "Canjeando…"; err.classList.remove("show");
    try {
      await onCanjear(items);
      S.puntos -= totalCarrito();
      S.cart.clear();
      renderGrid(); pintarBadge(); cerrar(cartOv);
      S.hist.cargado = false; // la próxima vez que abra el panel se recarga
      toast("¡Canje listo! Revisa tus cupones 🎁");
    } catch (e) {
      console.warn(e); err.textContent = e?.message || "No se pudo canjear, intenta de nuevo"; err.classList.add("show");
    } finally { btn.textContent = txt; btn.disabled = !S.cart.size; }
  }

  /* ---------- toast ---------- */
  let toastEl, toastT;
  function toast(msg) {
    if (!toastEl) { toastEl = mk(`<div class="fx-toast"></div>`); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  /* ---------- API pública ---------- */
  return {
    setPuntos(n) { S.puntos = Number(n) || 0; refrescarAcciones(); },
    setPremios(arr) {
      S.premios = (arr || []).map((p) => ({ ...p, costoPuntos: Number(p.costoPuntos) || 0 })).sort((a, b) => a.costoPuntos - b.costoPuntos);
      S.byId = new Map(S.premios.map((p) => [p.id, p]));
      for (const id of [...S.cart.keys()]) if (!S.byId.has(id)) S.cart.delete(id);
      renderFiltros(); renderGrid(); pintarBadge();
    },
    setCupones(arr) { S.cupones = arr || []; pintarCupones(); },
    abrirHistorial: openDrawer,
    abrirCarrito: openCart,
  };
}