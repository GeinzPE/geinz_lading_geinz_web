/* crm_pro.js — se carga DESPUÉS de crm_whatsap.js */
(() => {
  "use strict";
  const $$ = (id) => document.getElementById(id);
  const ROW = 72,
    LIM_CHATS = 60,
    PASO_CHATS = 60,
    LIM_MSGS = 80,
    PASO_MSGS = 80;
  const P = () => window.CRMPromos;

  /* ───────── CSS ───────── */
  const css = document.createElement("style");
  css.textContent = `
/* pantalla completa en modo chats */
body.modo-chats{padding:12px 12px 0;height:100vh;height:100dvh;overflow:hidden}
body.modo-chats .wrap{max-width:none;height:100%;display:flex;flex-direction:column}
body.modo-chats .page-head{margin-bottom:10px}
body.modo-chats .page-head p.sub{display:none}
body.modo-chats .page-head h1{font-size:22px;margin:0}
body.modo-chats .modes{margin-bottom:10px;align-self:flex-start}
body.modo-chats #vistaChats{flex:1;min-height:0;display:flex;flex-direction:column;border-bottom-left-radius:0;border-bottom-right-radius:0}
body.modo-chats .crm{flex:1;min-height:0;height:auto;min-height:0}
body.modo-chats .crm-left{height:100%;overflow:hidden}
.crm-left #chList{flex:1;min-height:0;overflow-y:auto}
.crm-right{min-height:0;min-width:0}
.chat-box{position:relative}
.ch-main{min-height:0;height:100%}
.ch-msgs{min-height:0}
.ch-tpl.open{max-height:min(46vh,380px)}
@media(max-width:900px){.chat-modal{padding:0}.chat-box{height:100vh;height:100dvh;max-width:none;border-radius:0}}

/* lista virtual */
.cl-item{height:72px;padding-top:0;padding-bottom:0;box-sizing:border-box}
.cl-name{flex-wrap:nowrap;min-width:0}
.cl-name .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.cl-num,.cl-name .mini{flex:none}
#vlFoot{padding:12px;text-align:center}

/* ficha expandible */
body:not(.side-open) .crm .ch-side{display:none!important}
body.side-open .crm .ch-side{display:block;position:absolute;top:0;right:0;bottom:0;width:min(310px,88%);z-index:6;background:var(--surface);border-left:1px solid var(--line);overflow-y:auto;box-shadow:-18px 0 40px rgba(0,0,0,.5)}
@media(min-width:1280px){body.side-open .crm .ch-side{position:static;width:300px;flex:none;box-shadow:none}}
#chSideBtn.on{color:var(--accent2);border-color:rgba(139,92,246,.5);background:var(--accent-soft)}
.sd-d{border-top:1px solid var(--line);margin-top:10px}
.sd-d summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:12px 0 6px}
.sd-d summary::-webkit-details-marker{display:none}
.sd-d summary::after{content:"▾";transition:transform .2s}
.sd-d:not([open]) summary::after{transform:rotate(-90deg)}

/* promos dentro del chat */
.tp-promos{margin-bottom:10px}
.tp-promos .cp-promos{margin-bottom:0}
.cl-name .nm{flex:0 1 auto;min-width:45%;order:0}
.cl-name .mini{order:1}
.cl-name .cl-num{order:2;flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;
  document.head.appendChild(css);

  /* ───────── Nombres de usuarios (mapa, no búsqueda lineal) ───────── */
  let nmCache = null;
  new MutationObserver(() => {
    nmCache = null;
  }).observe(tbody, { childList: true });
  function mapaNombres() {
    if (nmCache) return nmCache;
    nmCache = new Map();
    [...tbody.children].forEach((tr) => {
      if (!esFila(tr)) return;
      const d = telLimpio(tr.dataset.telefono);
      if (d && !nmCache.has(d)) nmCache.set(d, nombreDe(tr));
    });
    return nmCache;
  }
  window.nombreConv = (c, k) =>
    mapaNombres().get(k) ||
    c.nombre_usuario ||
    "+" + (c.numero_usuario || c.id);

  /* ───────── Lista de chats virtualizada ───────── */
  let VL = [],
    vlRaf = 0,
    hayMas = false,
    cargandoMas = false,
    limChats = LIM_CHATS,
    unsubChats = null;
  const extraConv = new Map();

  const fila = ({ k, c, n, nombre }) => {
    const last = c.ultimo_mensaje || {},
      mio = last.remitente === "bot",
      act = chTr && chTr.d === k;
    return `<div class="cl-item${n > 0 ? " unread" : ""}${act ? " active" : ""}" data-k="${k}">
      <div class="cl-av">${esc(iniciales(nombre))}</div>
      <div class="cl-main"><div class="cl-name"><span class="nm">${esc(nombre)}</span><span class="cl-num">+${esc(c.numero_usuario || c.id)}</span><span class="mini ${c.ia_activada ? "ia" : "hu"}">${c.ia_activada ? "IA" : "Humano"}</span></div>
      <div class="cl-prev">${mio ? "Tú: " : ""}${esc(last.contenido || "Sin mensajes")}</div></div>
      <div class="cl-side"><span class="cl-time">${relTs(c.ultima_actividad)}</span>${n > 0 ? `<span class="nbub">${n > 99 ? "99+" : n}</span>` : ""}</div></div>`;
  };

  function calcular() {
    const q = norm(chBuscar),
      qd = digits(chBuscar),
      nm = mapaNombres(),
      arr = [];
    const add = (c, k) => {
      const n = sinLeer(k),
        nombre =
          nm.get(k) || c.nombre_usuario || "+" + (c.numero_usuario || c.id);
      if (q && !(norm(nombre).includes(q) || (qd && k.includes(qd)))) return;
      if (chFiltro === "unread" && !n) return;
      if (chFiltro === "ia" && !c.ia_activada) return;
      if (chFiltro === "human" && c.ia_activada) return;
      arr.push({ k, c, n, nombre });
    };
    convMap.forEach(add);
    extraConv.forEach((c, k) => {
      if (!convMap.has(k)) add(c, k);
    });
    arr.sort(
      (a, b) =>
        (b.n > 0) - (a.n > 0) ||
        (b.c.ultima_actividad?.seconds || 0) -
          (a.c.ultima_actividad?.seconds || 0),
    );
    VL = arr;
  }

  function pintarVL() {
    const el = $$("chList"),
      win = $$("vlWin");
    if (!el || !win) return;
    const top = el.scrollTop,
      h = el.clientHeight || 600;
    const i0 = Math.max(0, Math.floor(top / ROW) - 6),
      i1 = Math.min(VL.length, Math.ceil((top + h) / ROW) + 6);
    win.style.top = i0 * ROW + "px";
    win.innerHTML = VL.slice(i0, i1).map(fila).join("");
  }

  function estructura() {
    const el = $$("chList");
    if ($$("vlSp")) return;
    el.innerHTML =
      '<div id="vlSp" style="position:relative"><div id="vlWin" style="position:absolute;left:0;right:0;top:0"></div></div><div id="vlEmpty" class="empty" style="display:none"></div><div id="vlFoot"></div>';
    el.addEventListener(
      "scroll",
      () => {
        if (vlRaf) return;
        vlRaf = requestAnimationFrame(() => {
          vlRaf = 0;
          pintarVL();
          if (
            hayMas &&
            el.scrollTop + el.clientHeight > el.scrollHeight - ROW * 4
          )
            cargarMas();
        });
      },
      { passive: true },
    );
    el.addEventListener("click", (e) => {
      if (e.target.closest("#vlMas")) {
        cargarMas();
        return;
      }
      const it = e.target.closest(".cl-item");
      if (!it) return;
      const k = it.dataset.k;
      if (!convMap.has(k) && extraConv.has(k)) {
        const c = extraConv.get(k);
        window.abrirChatCtx({
          nombre: window.nombreConv(c, k),
          d: k,
          id: c.id,
        });
      }
    });
    if (window.ResizeObserver) new ResizeObserver(() => pintarVL()).observe(el);
  }

  window.renderChatList = function () {
    const el = $$("chList");
    if (!el) return;
    estructura();
    calcular();
    $$("vlSp").style.height = VL.length * ROW + "px";
    const em = $$("vlEmpty");
    em.style.display = VL.length ? "none" : "block";
    em.textContent =
      convMap.size || extraConv.size
        ? "Sin chats con ese filtro."
        : "Todavía no hay conversaciones de WhatsApp.";
    $$("chCuenta").textContent = convMap.size
      ? `${VL.length} de ${convMap.size}${hayMas ? "+" : ""} chats`
      : "";
    $$("vlFoot").innerHTML = hayMas
      ? `<button type="button" class="pill" id="vlMas">${cargandoMas ? "Cargando…" : "Cargar más chats"}</button>`
      : "";
    pintarVL();
  };

  /* búsqueda por número aunque no esté cargado */
  let remT = 0;
  $$("chBuscar").addEventListener("input", (e) => {
    $$("chList").scrollTop = 0;
    clearTimeout(remT);
    const qd = digits(e.target.value);
    if (qd.length >= 9) remT = setTimeout(() => buscarRemoto(qd), 450);
  });
  async function buscarRemoto(qd) {
    const k = qd.slice(-9);
    if (!fbListo || convMap.has(k) || extraConv.has(k)) return;
    try {
      const { getDoc } = await import(FB + "firebase-firestore.js");
      const s = await getDoc(doc(db, COL, qd.length === 9 ? "51" + qd : qd));
      if (s.exists()) {
        extraConv.set(k, { id: s.id, ...s.data() });
        window.renderChatList();
      }
    } catch (e) {
      console.warn(e);
    }
  }

  /* ───────── Escucha de chats paginada ───────── */
  async function escucharChats() {
    const { limit } = await import(FB + "firebase-firestore.js");
    if (unsubChats) unsubChats();
    unsubChats = onSnapshot(
      query(
        collection(db, COL),
        orderBy("ultima_actividad", "desc"),
        limit(limChats),
      ),
      (snap) => {
        convMap.clear();
        const ahora = Math.floor(Date.now() / 1000);
        snap.docs.forEach((d) => {
          const data = { id: d.id, ...d.data() },
            k = last9(data.numero_usuario || d.id);
          convMap.set(k, data);
          const last = data.ultimo_mensaje || {},
            lastTs = data.ultima_actividad?.seconds || 0,
            sig = `${last.remitente || ""}|${last.contenido || ""}|${lastTs}`;
          const nuevo =
            convPrimeraCarga &&
            sigs[d.id] !== undefined &&
            sigs[d.id] !== sig &&
            last.remitente === "usuario";
          sigs[d.id] = sig;
          const abierto =
            !!chId && last9(chId) === k && chatModal.classList.contains("show");
          if (typeof data.no_leidos === "number") unread[k] = data.no_leidos;
          else if (last.remitente !== "usuario") unread[k] = 0;
          else if (abierto) {
            unread[k] = 0;
            leido[k] = ahora;
          } else if (nuevo) unread[k] = (unread[k] || 0) + 1;
          else if (
            !convPrimeraCarga &&
            !unread[k] &&
            lastTs > Math.max(leido[k] || 0, initTs)
          )
            unread[k] = 1;
          if (nuevo && !chatOculto()) {
            sonar(data.sonido_notificacion || "default");
            toast(
              "💬 " +
                (data.nombre_usuario || data.numero_usuario || d.id) +
                ": " +
                (last.contenido || "").slice(0, 50),
            );
          }
        });
        hayMas = snap.size >= limChats;
        cargandoMas = false;
        guardarUnread();
        convPrimeraCarga = true;
        pintarChatBtns();
        aplicarPausado();
        window.renderChatList();
        contarChats();
        if (chTr) pintarCabecera();
      },
      (err) => console.error("Firestore WhatsApp:", err),
    );
  }
  function cargarMas() {
    if (cargandoMas || !hayMas) return;
    cargandoMas = true;
    limChats += PASO_CHATS;
    const f = $$("vlFoot");
    if (f)
      f.innerHTML =
        '<button type="button" class="pill" id="vlMas">Cargando…</button>';
    escucharChats();
  }
  window.iniciarEscucha = () => {
    escucharChats();
  };

  /* ───────── Mensajes del chat (últimos N + "ver anteriores") ───────── */
  let limMsgs = LIM_MSGS,
    preservar = false;
  chMsgs.insertAdjacentHTML(
    "beforebegin",
    '<button type="button" class="pill" id="chMore" style="display:none;margin:8px auto 0;align-self:center;flex:none">↑ Ver mensajes anteriores</button>',
  );
  $$("chMore").addEventListener("click", () => {
    limMsgs += PASO_MSGS;
    preservar = true;
    suscribirMsgs();
  });

  async function suscribirMsgs() {
    const id = chId,
      { limit } = await import(FB + "firebase-firestore.js");
    if (id !== chId || !chId) return;
    if (chUnsub) chUnsub();
    chUnsub = onSnapshot(
      query(
        collection(db, COL, id, "mensajes"),
        orderBy("timestamp", "desc"),
        limit(limMsgs),
      ),
      (snap) => {
        if (id !== chId) return;
        const msgs = snap.docs.map((x) => x.data()).reverse();
        const sh = chMsgs.scrollHeight,
          st = chMsgs.scrollTop;
        pintarMensajes(msgs);
        if (preservar) {
          chMsgs.scrollTop = st + (chMsgs.scrollHeight - sh);
          preservar = false;
        }
        $$("chMore").style.display =
          snap.size >= limMsgs ? "inline-flex" : "none";
        const fu = msgs
          .filter((m) => m.remitente === "usuario")
          .map((m) => tsDate(m.timestamp))
          .filter(Boolean);
        lastUserMsg = fu.length
          ? new Date(Math.max(...fu.map((x) => x.getTime())))
          : null;
        msgsListos = true;
        pintarCabecera();
      },
      (err) => {
        chMsgs.innerHTML = `<div class="dsep">ERROR: ${esc(err.message)}</div>`;
      },
    );
  }

  window.abrirChatCtx = function (ctx) {
    if (!document.body.classList.contains("modo-chats"))
      window.setModo("chats");
    if (!fbListo) {
      toast("El chat aún está conectando con Firebase…");
      return;
    }
    chTr = ctx;
    const d = ctx.d;
    chId = ctx.id || waId(d);
    marcarLeido(d);
    lastUserMsg = null;
    msgsListos = false;
    tplSel = null;
    chInput.value = "";
    limMsgs = LIM_MSGS;
    preservar = false;
    $$("tplPrev").classList.remove("show");
    chTpl.classList.remove("open");
    document
      .querySelectorAll(".tpl-card")
      .forEach((x) => x.classList.remove("sel"));
    chMsgs.innerHTML = '<div class="dsep">CARGANDO…</div>';
    delete chMsgs.dataset.listo;
    $$("chMore").style.display = "none";
    chatModal.classList.add("show");
    if (innerWidth < 1280) setSide(false);
    pintarCabecera();
    if (chUnsub) {
      chUnsub();
      chUnsub = null;
    }
    suscribirMsgs();
  };

  /* ───────── Ficha del cliente: panel y secciones expandibles ───────── */
  function setSide(v) {
    document.body.classList.toggle("side-open", v);
    const b = $$("chSideBtn");
    if (b) b.classList.toggle("on", v);
    if (innerWidth >= 1280)
      try {
        localStorage.setItem("crm_side", v ? "1" : "0");
      } catch (e) {}
  }
  $$("chCerrar").insertAdjacentHTML(
    "beforebegin",
    '<button class="pill" id="chSideBtn" type="button" title="Mostrar u ocultar los datos del cliente">ℹ️ Datos</button>',
  );
  $$("chSideBtn").addEventListener("click", () =>
    setSide(!document.body.classList.contains("side-open")),
  );
  let st0 = null;
  try {
    st0 = localStorage.getItem("crm_side");
  } catch (e) {}
  setSide(innerWidth >= 1280 ? st0 !== "0" : false);

  let cerradas = new Set();
  try {
    cerradas = new Set(
      JSON.parse(localStorage.getItem("crm_sd_closed") || "[]"),
    );
  } catch (e) {}

  function envolverFicha() {
    const sd = document.querySelector("#chSide .sd");
    if (!sd || sd.dataset.w) return;
    sd.dataset.w = "1";
    [...sd.querySelectorAll(".sd-t")].forEach((t) => {
      const name = t.textContent,
        d = document.createElement("details"),
        s = document.createElement("summary");
      d.className = "sd-d";
      d.open = !cerradas.has(name);
      s.textContent = name;
      d.appendChild(s);
      let n = t.nextElementSibling;
      while (
        n &&
        !n.classList.contains("sd-t") &&
        !n.classList.contains("sd-btn")
      ) {
        const nx = n.nextElementSibling;
        d.appendChild(n);
        n = nx;
      }
      t.replaceWith(d);
      d.addEventListener("toggle", () => {
        d.open ? cerradas.delete(name) : cerradas.add(name);
        try {
          localStorage.setItem("crm_sd_closed", JSON.stringify([...cerradas]));
        } catch (e) {}
      });
    });
    const b = sd.querySelector(".sd-btn");
    if (b) {
      b.insertAdjacentHTML(
        "afterend",
        '<button class="sd-btn" id="sdPromo" type="button" style="margin-top:8px">📣 Enviar promoción</button>',
      );
      $$("sdPromo").onclick = abrirPromoEnChat;
    }
  }
  const _pc = window.pintarCabecera;
  window.pintarCabecera = function () {
    const s = $$("chSide"),
      top = s ? s.scrollTop : 0;
    _pc();
    envolverFicha();
    if (s) s.scrollTop = top;
  };

  /* ───────── Promociones dentro del chat ───────── */
  function abrirPromoEnChat() {
    chTpl.classList.add("open");
    Promise.resolve(cargarPlantillas()).then(() => {
      const i = PLANTILLAS.findIndex((p) => p.name === "aviso_importante");
      const card = document.querySelector('.tpl-card[data-i="' + i + '"]');
      if (card) card.click();
    });
  }

  let promosIntentadas = false;
  function pintarPromosPanel() {
    const box = $$("tplPromos");
    if (!box) return;
    const C = P() && P().C;
    box.innerHTML =
      '<div class="cp-hint" style="margin-bottom:6px">Promo del perfil (rellena imagen, texto y link):</div><div class="cp-promos">' +
      (C && C.promos.length
        ? C.promos
            .map(
              (p) =>
                `<button type="button" class="cp-pr" data-k="${esc(p.key)}"><img src="${esc(p.img)}" alt="" loading="lazy" onerror="this.style.opacity=.2"><div><small>${esc(p.tipo)}</small><b>${esc(p.titulo)}</b></div></button>`,
            )
            .join("")
        : `<div class="cp-hint">${esc((C && C.errPromos) || "No hay promos activas. Llena los campos a mano.")}</div>`) +
      "</div>";
  }
  function promosEnPanel() {
    const prev = $$("tplPrev");
    let box = $$("tplPromos");
    if (!box) {
      box = document.createElement("div");
      box.id = "tplPromos";
      box.className = "tp-promos";
      prev.insertBefore(box, $$("tplBody"));
      box.addEventListener("click", (e) => {
        const b = e.target.closest(".cp-pr");
        if (!b) return;
        const p = P().C.promos.find((x) => x.key === b.dataset.k);
        if (!p) return;
        const set = (sel, v) => {
          const i = $$("tplVars").querySelector(sel);
          if (i) i.value = v;
        };
        set('input[data-g="m"]', p.img);
        set('input[data-g="b"][data-k="2"]', P().limpio(p.texto));
        set('input[data-g="u"]', P().sufijoLink(p.oid));
        box
          .querySelectorAll(".cp-pr")
          .forEach((x) => x.classList.toggle("on", x === b));
        const im = $$("tplImg");
        im.src = p.img;
        im.style.display = "block";
        $$("tplBody").textContent = textoPlantilla(
          tplSel,
          leerCampos().variables,
        );
      });
    }
    const es = !!tplSel && tplSel.name === "aviso_importante";
    box.style.display = es ? "block" : "none";
    if (!es || !P()) return;
    if (!P().C.promos.length && !promosIntentadas) {
      promosIntentadas = true;
      box.innerHTML = '<div class="cp-hint">Cargando promos…</div>';
      P().cargarPromos().then(pintarPromosPanel);
    } else pintarPromosPanel();
  }
  const _pp = window.pintarPlantilla;
  window.pintarPlantilla = function () {
    _pp();
    promosEnPanel();
  };

  window.addEventListener("resize", pintarVL);
  window.renderChatList();
})();
