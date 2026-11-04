/* ════════════════════════════════════════════════════════════════
   crm_whatsapp.js  — se carga DESPUÉS del <script> inline de usuarios.html
   <script src="../js/dasboardjs/crm_whatsapp.js"></script>   (clásico, sin type="module")

   Requiere que usuarios.js (módulo) deje listo:
     window.UsuariosUI.negocio = { localidad, id, alias, nombre, carrito:true }
     window.UsuariosUI.rutas   = { tiendaDoc, tiendaSubCol }   // de ../rutas/rutas.js
   ════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  /* ───────── Plantillas permitidas ───────── */
  const PERMITIDAS = {
    aviso_importante: "📣 Aviso / Promoción",
    estado_pedidos_geinz_food: "📦 Estado del pedido",
  };
  const BASE_BTN = "https://geinztech.com/";

  /* ───────── CSS ───────── */
  const css = document.createElement("style");
  css.textContent = `
/* --- tabs / vistas --- */
#vistaCampanas{display:none}
body.modo-campanas #vistaCampanas{display:block}
body.modo-campanas .grid,body.modo-campanas #datosToggle{display:none}
body.sin-chat #vistaCampanas{display:none!important}
.modes button[data-m=campanas].on{background:rgba(251,191,36,.14);color:var(--warn)}

/* --- CRM: bandeja + chat + ficha --- */
#vistaChats{padding:0}
.crm{display:block}
.crm-left{display:flex;flex-direction:column;min-width:0}
.crm-right{position:relative}
.crm-empty{display:none}
.ch-side{display:none}
.ch-main{flex:1;min-width:0;display:flex;flex-direction:column;height:100%}
.chat-box{flex-direction:row}
.cl-item.active{background:rgba(37,211,102,.08);box-shadow:inset 3px 0 0 var(--wa)}
@media(min-width:901px){
  .crm{display:grid;grid-template-columns:minmax(300px,360px) minmax(0,1fr);height:calc(100vh - 210px);min-height:600px}
  .crm-left{border-right:1px solid var(--line);overflow:hidden}
  .crm-left #chList{flex:1;overflow-y:auto}
  .crm .chat-modal{position:static;display:flex;padding:0;background:none;height:100%;z-index:auto}
  .crm .chat-modal:not(.show) .chat-box{display:none}
  .crm .chat-box{max-width:none;width:100%;height:100%;border:0;border-radius:0;box-shadow:none;background:var(--bg)}
  .crm .chat-modal.show + .crm-empty{display:none}
  .crm-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:var(--muted);text-align:center;padding:30px}
  .crm-empty div{font-size:46px}.crm-empty b{color:var(--text);font-size:16px;font-family:'Sora',sans-serif}
}
@media(min-width:1280px){
  .crm{grid-template-columns:minmax(300px,340px) minmax(0,1fr)}
  .crm .ch-side{display:block;width:290px;flex:none;border-left:1px solid var(--line);overflow-y:auto;background:var(--surface)}
}
.sd{padding:22px 18px}
.sd-av{width:64px;height:64px;margin:0 auto 10px;border-radius:50%;display:grid;place-items:center;font-family:'Sora',sans-serif;font-weight:700;font-size:20px;background:rgba(37,211,102,.14);color:var(--wa);border:1px solid rgba(37,211,102,.35)}
.sd h4{margin:0;text-align:center;font-family:'Sora',sans-serif;font-size:15px}
.sd-sub{text-align:center;color:var(--muted);font-size:12px;margin:3px 0 12px}
.sd-badges{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-bottom:16px}
.sd-t{font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:18px 0 6px}
.sd-r{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);font-size:12.5px}
.sd-r span{color:var(--muted);flex:none}.sd-r b{font-weight:600;text-align:right;word-break:break-all}
.sd-btn{width:100%;margin-top:14px;padding:11px;border-radius:12px;border:1px solid rgba(37,211,102,.4);background:rgba(37,211,102,.08);color:var(--wa);font-weight:700;font-size:13px;cursor:pointer}
.sd-btn:hover{background:rgba(37,211,102,.16)}
.ch-head{background:var(--surface2)}
.ch-comp{background:var(--surface2)}
.c-row textarea{border-radius:22px}
.bub{border-radius:12px}
.b-row.in .bub{border-radius:2px 14px 14px 14px}.b-row.out .bub{border-radius:14px 2px 14px 14px}

/* --- campañas --- */
.cp-grid{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:22px;padding:20px}
@media(max-width:1100px){.cp-grid{grid-template-columns:1fr}}
.cp-step{border:1px solid var(--line);border-radius:18px;background:var(--surface2);margin-bottom:16px;overflow:hidden}
.cp-step>h3{margin:0;padding:14px 18px;font-family:'Sora',sans-serif;font-size:14px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--line)}
.cp-n{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:12px;background:var(--accent-soft);color:var(--accent2)}
.cp-body{padding:16px 18px}
.cp-tpls{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:620px){.cp-tpls{grid-template-columns:1fr}}
.cp-tpl{text-align:left;padding:14px;border-radius:14px;border:1.5px solid var(--line);background:var(--surface);color:var(--text);cursor:pointer}
.cp-tpl.on{border-color:var(--wa);background:rgba(37,211,102,.06)}
.cp-tpl b{display:block;font-size:13.5px;margin-bottom:4px}.cp-tpl span{font-size:12px;color:var(--muted);line-height:1.4;display:block}
.cp-promos{display:flex;gap:10px;overflow-x:auto;padding-bottom:8px;margin-bottom:12px}
.cp-pr{flex:0 0 150px;border-radius:14px;overflow:hidden;border:1.5px solid var(--line);background:var(--surface);cursor:pointer;text-align:left;color:var(--text);padding:0}
.cp-pr.on{border-color:var(--wa)}
.cp-pr img{width:100%;height:96px;object-fit:cover;display:block;background:#111}
.cp-pr div{padding:8px 10px}.cp-pr b{display:block;font-size:12px;line-height:1.3;max-height:32px;overflow:hidden}
.cp-pr small{font-size:10.5px;color:var(--warn);font-weight:700}
.cp-f{display:block;margin-bottom:12px}
.cp-f>span{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:5px}
.cp-f input,.cp-f textarea{width:100%;padding:11px 13px;border-radius:11px;border:1px solid var(--line);background:var(--surface);color:var(--text);font-family:inherit;font-size:13px;outline:0}
.cp-f input:focus,.cp-f textarea:focus{border-color:var(--accent)}
.cp-f textarea{resize:vertical;min-height:60px}
.cp-hint{font-size:11.5px;color:var(--muted);margin-top:4px;line-height:1.4}
.cp-warn{font-size:12px;color:var(--warn);background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.3);padding:8px 10px;border-radius:10px;margin-bottom:12px}
.cp-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.cp-bar .field{flex:1;min-width:180px;height:38px}
.cp-list{max-height:280px;overflow-y:auto;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
.cp-d{display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--line);font-size:13px;cursor:pointer}
.cp-d:last-child{border-bottom:0}.cp-d:hover{background:rgba(255,255,255,.03)}
.cp-d input{accent-color:var(--wa);width:16px;height:16px}
.cp-d small{color:var(--muted);margin-left:auto}
.cp-side{position:sticky;top:20px;align-self:start}
.wa-phone{background:#0b141a;border:1px solid var(--line);border-radius:22px;padding:16px;margin-bottom:14px}
.wa-phone>small{display:block;text-align:center;color:var(--muted);font-size:11px;margin-bottom:10px}
.wa-b{background:#005c4b;border-radius:2px 14px 14px 14px;overflow:hidden;color:#e9edef;max-width:100%;font-size:13.5px;line-height:1.45}
.wa-b img{width:100%;max-height:190px;object-fit:cover;display:block;background:#111}
.wa-b .in{padding:9px 11px 8px;white-space:pre-wrap;word-wrap:break-word}
.wa-h{font-weight:700;margin-bottom:4px}
.wa-ft{font-size:11.5px;color:rgba(233,237,239,.6);margin-top:6px}
.wa-btn{background:#005c4b;border-top:1px solid rgba(255,255,255,.12);text-align:center;color:#53bdeb;font-weight:600;padding:9px;font-size:13px}
.cp-sum{padding:14px 16px;border-radius:14px;background:var(--surface2);border:1px solid var(--line);font-size:13px;margin-bottom:12px;line-height:1.6}
.cp-go{width:100%;height:48px;border:0;border-radius:14px;background:var(--wa);color:#04170b;font-weight:800;font-size:14px;cursor:pointer}
.cp-go:disabled{opacity:.45;cursor:not-allowed}
.cp-prog{display:none;margin-top:14px}.cp-prog.show{display:block}
.cp-track{height:8px;border-radius:99px;background:var(--surface2);overflow:hidden}
.cp-fill{height:100%;width:0;background:var(--wa);transition:width .25s}
.cp-prog p{font-size:12.5px;color:var(--muted);margin:8px 0 0}
.cp-fails{margin-top:10px;max-height:150px;overflow-y:auto;font-size:12px;color:var(--bad)}
`;
  document.head.appendChild(css);

  /* ───────── Helpers ───────── */
  const $$ = (id) => document.getElementById(id);
  const NEG = () => (window.UsuariosUI && window.UsuariosUI.negocio) || null;
  const RUT = () => (window.UsuariosUI && window.UsuariosUI.rutas) || null;
  const limpio = (s) =>
    String(s || "")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/ {2,}/g, " ")
      .trim()
      .slice(0, 120);
  const primer = (n) => {
    const p = (n || "").trim().split(/\s+/)[0] || "cliente";
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fechaLima = (f, h) => {
    const [d, m, y] = (f || "").split("/").map(Number);
    if (!d || !m || !y) return null;
    const [hh, mm] = (h || "23:59").split(":").map(Number);
    return Date.UTC(y, m - 1, d, hh || 0, mm || 0) + 5 * 3600e3;
  };

  /* Estado de la pestaña Campañas */
  const C = {
    montado: false,
    tpl: null,
    promos: [],
    promo: null,
    sel: new Set(),
    lista: [],
    sending: false,
    q: "",
    extras: [],
    fallidos: [],
    errPromos: "",
  };

  /* ════════════ 1) Solo 2 plantillas ════════════ */
  const _rp = window.renderPlantillas;
  window.renderPlantillas = function () {
    PLANTILLAS = PLANTILLAS.filter((p) => PERMITIDAS[p.name]);
    PLANTILLAS.forEach((p) => {
      p.title = PERMITIDAS[p.name];
    });
    _rp();
    if (C.montado) pintarTpls();
  };

  /* ════════════ 2) CRM: bandeja + chat + ficha ════════════ */
  (function montarCRM() {
    const vc = $$("vistaChats");
    if (!vc || vc.querySelector(".crm")) return;
    const crm = document.createElement("div");
    crm.className = "crm";
    const left = document.createElement("div");
    left.className = "crm-left";
    while (vc.firstChild) left.appendChild(vc.firstChild);
    const right = document.createElement("div");
    right.className = "crm-right";
    right.appendChild($$("chatModal"));
    right.insertAdjacentHTML(
      "beforeend",
      '<div class="crm-empty"><div>💬</div><b>Selecciona un chat</b><span>Aquí verás la conversación y la ficha del cliente.</span></div>',
    );
    crm.append(left, right);
    vc.appendChild(crm);

    const box = document.querySelector(".chat-box");
    const main = document.createElement("div");
    main.className = "ch-main";
    while (box.firstChild) main.appendChild(box.firstChild);
    const side = document.createElement("aside");
    side.className = "ch-side";
    side.id = "chSide";
    box.append(main, side);
  })();

  function pintarLateral() {
    const el = $$("chSide");
    if (!el) return;
    if (!chTr) {
      el.innerHTML = "";
      return;
    }
    const tr = [...tbody.children].find(
      (r) => esFila(r) && telLimpio(r.dataset.telefono) === chTr.d,
    );
    const c = convMap.get(chTr.d) || {};
    const row = (l, v) =>
      v ? `<div class="sd-r"><span>${l}</span><b>${esc(v)}</b></div>` : "";
    const espera = c.ultimo_mensaje && c.ultimo_mensaje.remitente === "usuario";
    const ult = tsDate(c.ultima_actividad);
    let h = `<div class="sd"><div class="sd-av">${esc(iniciales(chTr.nombre))}</div><h4>${esc(chTr.nombre)}</h4>
    <div class="sd-sub">+${esc(chTr.id || waId(chTr.d))}</div><div class="sd-badges">`;
    if (tr)
      h += `<span class="badge ${esBloqueado(tr) ? "bad" : "ok"}">${esBloqueado(tr) ? "Bloqueado" : "Activo"}</span>`;
    else h += `<span class="mini hu">No es usuario registrado</span>`;
    h += `<span class="mini ${c.ia_activada ? "ia" : "hu"}">${c.ia_activada ? "IA activa" : "Atiende humano"}</span></div>`;
    if (tr) {
      h +=
        `<div class="sd-t">Datos del cliente</div>` +
        row("Correo", tr.cells[1] && tr.cells[1].textContent) +
        row("Registro", tr.cells[2] && tr.cells[2].textContent) +
        row(
          "Edad",
          tr.querySelector(".c-edad") &&
            tr.querySelector(".c-edad").textContent.replace("—", ""),
        ) +
        row(
          "Género",
          tr.querySelector(".c-gen") &&
            tr.querySelector(".c-gen").textContent.replace("—", ""),
        ) +
        row("Nacionalidad", tr.dataset.nacionalidad);
    }
    h +=
      `<div class="sd-t">Conversación</div>` +
      row("Estado", espera ? "En espera de respuesta" : "Atendido") +
      row(
        "Última actividad",
        ult
          ? ult.toLocaleString("es-PE", {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : "",
      ) +
      row(
        "Ventana 24h",
        dentroVentana() ? "Abierta (texto libre)" : "Cerrada (solo plantillas)",
      ) +
      `<button class="sd-btn" id="sdTpl" type="button">📋 Enviar plantilla</button></div>`;
    el.innerHTML = h;
    $$("sdTpl").onclick = () => $$("chTplBtn").click();
  }
  const _pc = window.pintarCabecera;
  window.pintarCabecera = function () {
    _pc();
    pintarLateral();
  };

  const _ac = window.abrirChatCtx;
  window.abrirChatCtx = function (ctx) {
    if (!document.body.classList.contains("modo-chats"))
      window.setModo("chats");
    _ac(ctx);
    marcarActivo(ctx.d);
  };
  const _rc = window.renderChatList;
  window.renderChatList = function () {
    _rc();
    marcarActivo(chTr && chTr.d);
  };
  function marcarActivo(k) {
    document
      .querySelectorAll("#chList .cl-item")
      .forEach((i) => i.classList.toggle("active", !!k && i.dataset.k === k));
  }

  /* ════════════ 3) Campañas ════════════ */

  /* pestaña + vista */
  (function montarTab() {
    const nav = document.querySelector(".modes");
    if (!nav) return;
    nav.insertAdjacentHTML(
      "beforeend",
      '<button type="button" data-m="campanas">📣 Campañas</button>',
    );
    const sec = document.createElement("section");
    sec.className = "panel";
    sec.id = "vistaCampanas";
    document.querySelector(".wrap").appendChild(sec);
  })();

  const _sm = window.setModo;
  window.setModo = function (m) {
    document.body.classList.remove("modo-campanas");
    if (m !== "campanas") {
      _sm(m);
      return;
    }
    if (document.body.classList.contains("sin-chat")) {
      _sm("registro");
      return;
    }
    _sm("registro");
    document.body.classList.add("modo-campanas");
    document
      .querySelectorAll(".modes button")
      .forEach((b) => b.classList.toggle("on", b.dataset.m === "campanas"));
    abrirCampanas();
  };

  function abrirCampanas() {
    if (!C.montado) montar();
    refrescarDest();
    if (!PLANTILLAS.length && typeof cargarPlantillas === "function")
      cargarPlantillas();
    else pintarTpls();
    if (!C.promos.length) cargarPromos();
  }

  function montar() {
    C.montado = true;
    $$("vistaCampanas").innerHTML = `
  <div class="panel-head"><h2>Campañas de WhatsApp</h2><small>Plantillas aprobadas por Meta · se envían una por una a cada cliente</small></div>
  <div class="cp-grid"><div>
    <div class="cp-step"><h3><span class="cp-n">1</span>Plantilla</h3><div class="cp-body"><div class="cp-tpls" id="cpTpls">Cargando…</div></div></div>
    <div class="cp-step"><h3><span class="cp-n">2</span>Contenido</h3><div class="cp-body" id="cpCont"><div class="cp-hint">Elige una plantilla primero.</div></div></div>
    <div class="cp-step"><h3><span class="cp-n">3</span>Destinatarios <small id="cpCnt" style="margin-left:auto;color:var(--muted);font-weight:500"></small></h3><div class="cp-body">
      <div class="cp-bar">
        <label class="field"><input id="cpQ" type="search" placeholder="Buscar nombre o número" autocomplete="off"></label>
        <button class="chip" id="cpTodos" type="button">Todos los válidos</button>
        <button class="chip" id="cpFiltrados" type="button" title="Los que dejaste visibles con los filtros de la tabla">Los filtrados de la tabla</button>
        <button class="chip" id="cpNinguno" type="button">Ninguno</button>
      </div>
      <div class="cp-f" style="margin-bottom:10px"><span>Agregar números extra</span>
        <input id="cpExtraNom" placeholder="Nombre para estos números (opcional, ej. Juan)" autocomplete="off" style="margin-bottom:8px">
        <textarea id="cpExtra" placeholder="987654321&#10;912345678 Juan&#10;+51 999 888 777, María&#10;911111111, 922222222, 933333333"></textarea>
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap">
          <button class="chip" id="cpAddExtra" type="button">+ Agregar números</button>
          <span class="cp-hint" id="cpExtraMsg" style="margin:0"></span>
        </div>
      </div>
      <div class="cp-list" id="cpDest"></div>
      <div class="cp-hint">Aparecen los usuarios activos con WhatsApp válido y no repetido (los bloqueados quedan fuera) y los números extra que agregues.</div>
    </div></div>
  </div>
  <aside class="cp-side">
    <div class="wa-phone"><small>Vista previa (con el primer destinatario)</small><div id="cpPrev"></div></div>
    <div class="cp-sum" id="cpSum"></div>
    <button class="cp-go" id="cpGo" type="button">Enviar campaña</button>
    <div class="cp-prog" id="cpProg"><div class="cp-track"><div class="cp-fill" id="cpFill"></div></div><p id="cpPTxt"></p><div class="cp-fails" id="cpFails"></div>
      <button class="chip" id="cpRetry" type="button" style="display:none;margin-top:8px">Reintentar fallidos</button></div>
  </aside></div>`;

    const v = $$("vistaCampanas");
    v.addEventListener("click", (e) => {
      const t = e.target.closest(".cp-tpl");
      if (t) {
        C.tpl = PLANTILLAS.find((p) => p.name === t.dataset.n);
        pintarTpls();
        pintarContenido();
        return;
      }
      const p = e.target.closest(".cp-pr");
      if (p) {
        C.promo = C.promos.find((x) => x.key === p.dataset.k);
        pintarPromos();
        aplicarPromo();
        return;
      }
    });
    v.addEventListener("input", (e) => {
      if (e.target.closest("#cpCont")) pintarPrev();
    });
    $$("cpQ").addEventListener("input", (e) => {
      C.q = norm(e.target.value);
      pintarDest();
    });
    $$("cpTodos").onclick = () => {
      C.lista.forEach((x) => C.sel.add(x.d));
      pintarDest();
    };
    $$("cpNinguno").onclick = () => {
      C.sel.clear();
      pintarDest();
    };
    $$("cpFiltrados").onclick = () => {
      C.sel.clear();
      C.lista.forEach((x) => {
        if (x.tr.style.display !== "none") C.sel.add(x.d);
      });
      pintarDest();
    };
    $$("cpAddExtra").onclick = agregarExtras;
    $$("cpDest").addEventListener("click", (e) => {
      const rm = e.target.closest("[data-rm]");
      if (!rm) return;
      e.preventDefault();
      C.extras = C.extras.filter((x) => x.d !== rm.dataset.rm);
      C.sel.delete(rm.dataset.rm);
      refrescarDest();
    });
    $$("cpDest").addEventListener("input", (e) => {
      const n = e.target.closest("input[data-nm]");
      if (!n) return;
      const ex = C.extras.find((x) => x.d === n.dataset.nm);
      if (ex) ex.nombre = n.value.trim() || "Cliente";
      const li = C.lista.find((x) => x.d === n.dataset.nm);
      if (li) li.nombre = ex ? ex.nombre : li.nombre;
      pintarPrev();
    });
    $$("cpDest").addEventListener("change", (e) => {
      const i = e.target.closest("input[data-d]");
      if (!i) return;
      i.checked ? C.sel.add(i.dataset.d) : C.sel.delete(i.dataset.d);
      resumen();
      pintarPrev();
    });
    $$("cpGo").onclick = () => enviar([...C.sel]);
    $$("cpRetry").onclick = () => enviar(C.fallidos.map((f) => f.d));
  }

  /* plantillas */
  function pintarTpls() {
    const el = $$("cpTpls");
    if (!el) return;
    if (!PLANTILLAS.length) {
      el.innerHTML =
        '<div class="cp-hint">Cargando plantillas desde Meta… (si no aparecen, revisa que estén aprobadas)</div>';
      return;
    }
    if (C.tpl) C.tpl = PLANTILLAS.find((p) => p.name === C.tpl.name) || null;
    el.innerHTML = PLANTILLAS.map(
      (p) =>
        `<button type="button" class="cp-tpl${C.tpl && C.tpl.name === p.name ? " on" : ""}" data-n="${esc(p.name)}"><b>${esc(p.title)}</b><span>${esc(p.body)}</span></button>`,
    ).join("");
    if (!C.tpl) {
      const a =
        PLANTILLAS.find((p) => p.name === "aviso_importante") || PLANTILLAS[0];
      if (a) {
        C.tpl = a;
        pintarTpls();
        pintarContenido();
      }
    }
  }

  /* promos del perfil */
  async function cargarPromos() {
    for (let i = 0; i < 40 && !(NEG() && NEG().id && RUT()); i++)
      await sleep(250);
    const n = NEG(),
      R = RUT();
    if (!n || !R || !n.id) {
      C.errPromos =
        "Falta conectar el negocio en usuarios.js (UsuariosUI.negocio y UsuariosUI.rutas).";
      pintarContenido();
      return;
    }
    try {
      const { getDocs, getDoc } = await import(FB + "firebase-firestore.js");
      const [bizS, pgS] = await Promise.all([
        getDoc(R.tiendaDoc(n.localidad, "tiendas", n.id)),
        getDocs(
          R.tiendaSubCol(n.localidad, "tiendas", n.id, "promociones_geinz"),
        ),
      ]);
      const out = [],
        now = Date.now();
      pgS.forEach((d) => {
        // ofertas del momento (misma lógica que perfil.js)
        const x = d.data(),
          fh = x.datos_hora_fecha || {};
        if (
          x.desactivada === true ||
          x.estado !== "activo" ||
          fh.activo === false
        )
          return;
        const ini =
          fh.timestamp_inicio && fh.timestamp_inicio.toMillis
            ? fh.timestamp_inicio.toMillis()
            : null;
        if (ini && ini > now) return;
        let fin =
          fh.timestamp_fin && fh.timestamp_fin.toMillis
            ? fh.timestamp_fin.toMillis()
            : null;
        if (fin === null && fh.fecha_fin)
          fin = fechaLima(fh.fecha_fin, fh.hora_fin);
        if (fin === null || fin < now) return;
        const info = x.informacion || x,
          precio = Number(x.precio_publicacion) || 0;
        out.push({
          key: "a_" + d.id,
          tipo: "Oferta del momento",
          oid: "activa_" + d.id,
          fin,
          titulo: info.titulo || "Oferta",
          img:
            (x.img_container &&
              ((x.img_container.lista_img && x.img_container.lista_img[0]) ||
                x.img_container.logo_img)) ||
            "",
          texto:
            (info.titulo || "Oferta") +
            (precio > 0 ? " a S/ " + precio.toFixed(2) : ""),
        });
      });
      out.sort((a, b) => a.fin - b.fin);
      const biz = bizS.exists() ? bizS.data() : {};
      const fijas =
        (biz.img_tienda &&
          biz.img_tienda.lista_img &&
          biz.img_tienda.lista_img.promociones) ||
        {};
      let i = 0;
      Object.entries(fijas).forEach(([id, val]) => {
        // promos fijas
        const o = typeof val === "string" ? { imagen: val } : val || {};
        i++;
        if (!o.imagen) return;
        const precio = Number(o.precio) || 0,
          desc = String(o.descripcion || "").trim();
        out.push({
          key: "f_" + id,
          tipo: "Promo fija",
          oid: id,
          titulo: desc || "Promoción " + i,
          img: o.imagen,
          texto:
            (desc || "Promoción " + i) +
            (precio > 0 ? " a S/ " + precio.toFixed(2) : ""),
        });
      });
      C.promos = out;
      C.errPromos = "";
      pintarContenido();
    } catch (e) {
      console.error(e);
      C.errPromos = "No se pudieron leer las promos: " + e.message;
      pintarContenido();
    }
  }
  const sufijoLink = (oid) => {
    const n = NEG() || {};
    if (!n.alias) return "";
    const base = "perfil/" + encodeURIComponent(n.alias);
    return n.carrito === false || !oid
      ? base
      : base + "/carrito?oferta=" + encodeURIComponent(oid) + "&v=1";
  };
  function pintarPromos() {
    const el = $$("cpPromos");
    if (!el) return;
    el.innerHTML = C.promos.length
      ? C.promos
          .map(
            (p) =>
              `<button type="button" class="cp-pr${C.promo && C.promo.key === p.key ? " on" : ""}" data-k="${esc(p.key)}"><img src="${esc(p.img)}" alt="" loading="lazy" onerror="this.style.opacity=.2"><div><small>${esc(p.tipo)}</small><b>${esc(p.titulo)}</b></div></button>`,
          )
          .join("")
      : '<div class="cp-hint">No hay promos activas. Puedes llenar los campos a mano.</div>';
  }
  function aplicarPromo() {
    const p = C.promo;
    if (!p) return;
    $$("cpImg").value = p.img;
    $$("cpTxt").value = limpio(p.texto);
    $$("cpLink").value = sufijoLink(p.oid);
    pintarPrev();
  }

  /* formulario según plantilla */
  function pintarContenido() {
    const t = C.tpl,
      el = $$("cpCont");
    if (!t || !el) return;
    const keep = ["cpImg", "cpTxt", "cpLink", "cpH1", "cpB2", "cpB3"].reduce(
      (o, k) => ((o[k] = $$(k) ? $$(k).value : ""), o),
      {},
    );
    const link = (
      hint,
    ) => `<label class="cp-f"><span>Enlace del botón «${esc((t.buttons && t.buttons[0] && t.buttons[0].text) || "VER")}»</span>
    <input id="cpLink" placeholder="perfil/mi-negocio/carrito?oferta=…"><div class="cp-hint">${hint} Se envía después de <b>${BASE_BTN}</b></div></label>`;
    if (t.name === "aviso_importante") {
      el.innerHTML =
        (C.errPromos ? `<div class="cp-warn">${esc(C.errPromos)}</div>` : "") +
        `<div class="cp-f"><span>Promo del perfil (opcional)</span><div class="cp-promos" id="cpPromos"></div></div>
      <label class="cp-f"><span>Imagen del encabezado (URL pública https: solo JPG o PNG, no WEBP)</span><input id="cpImg" placeholder="https://…"><div class="cp-hint" id="cpImgW"></div></label>
      <label class="cp-f"><span>Mensaje en negrita ({{2}}) — el saludo con el nombre es automático</span><textarea id="cpTxt" maxlength="120" placeholder="Pizza familiar a S/ 29.90 solo hoy"></textarea></label>` +
        link("Por defecto lleva al carrito con la oferta.");
      pintarPromos();
    } else {
      el.innerHTML =
        `<div class="cp-hint" style="margin-bottom:10px">Esta plantilla normalmente se envía sola cuando cambia el estado de un pedido. Úsala aquí solo para avisos manuales.</div>
      <label class="cp-f"><span>Encabezado {{1}} (ej. emoji o número de pedido)</span><input id="cpH1" placeholder="📦"></label>
      <label class="cp-f"><span>Estado anterior {{2}}</span><input id="cpB2" placeholder="pendiente"></label>
      <label class="cp-f"><span>Estado nuevo {{3}}</span><input id="cpB3" placeholder="en proceso"></label>` +
        link("Ej: la ruta de seguimiento de pedido.");
    }
    Object.entries(keep).forEach(([k, v]) => {
      if ($$(k) && v) $$(k).value = v;
    });
    if (t.name === "aviso_importante" && !$$("cpLink").value)
      $$("cpLink").value = sufijoLink("");
    pintarPrev();
  }

  /* destinatarios (tabla + números extra) */
  function refrescarDest() {
    const tabla = [...tbody.children]
      .filter(esFila)
      .map((tr) => ({
        tr,
        d: telLimpio(tr.dataset.telefono),
        nombre: nombreDe(tr),
        ok: tr.dataset.telok === "1" && !esBloqueado(tr),
      }))
      .filter((x) => x.ok);
    const ya = new Set(tabla.map((x) => x.d));
    const extras = C.extras
      .filter((x) => !ya.has(x.d))
      .map((x) => ({
        d: x.d,
        nombre: x.nombre,
        tr: { style: { display: "" } },
        extra: true,
        ok: true,
      }));
    C.lista = [...extras, ...tabla];
    const val = new Set(C.lista.map((x) => x.d));
    C.sel.forEach((d) => {
      if (!val.has(d)) C.sel.delete(d);
    });
    pintarDest();
  }

  function pintarDest() {
    const el = $$("cpDest");
    if (!el) return;
    const arr = C.lista.filter(
      (x) =>
        !C.q ||
        norm(x.nombre).includes(C.q) ||
        x.d.includes(digits(C.q) || "§"),
    );
    el.innerHTML = arr.length
      ? arr
          .map(
            (x) =>
              `<label class="cp-d"><input type="checkbox" data-d="${x.d}" ${C.sel.has(x.d) ? "checked" : ""}>${x.extra ? `<input type="text" data-nm="${x.d}" value="${esc(x.nombre)}" maxlength="40" title="Nombre que recibirá en la plantilla" style="flex:1;min-width:90px;max-width:180px;padding:4px 8px;border-radius:8px;border:1px solid var(--line);background:var(--surface2);color:var(--text);font-size:13px"> <span class="mini hu">Extra</span>` : esc(x.nombre)}<small>+51 ${x.d}</small>${x.extra ? `<button type="button" class="chip" data-rm="${x.d}" style="padding:2px 9px" title="Quitar">✕</button>` : ""}</label>`,
          )
          .join("")
      : '<div class="cp-hint" style="padding:16px">Sin destinatarios válidos.</div>';
    resumen();
    pintarPrev();
  }

  function agregarExtras() {
    const tabla = new Set(
      [...tbody.children]
        .filter(esFila)
        .map((tr) => telLimpio(tr.dataset.telefono)),
    );
    const re = /(?:\+?51[\s-]*)?(9(?:[\s-]*\d){8})/g;
    let nuevos = 0,
      malos = 0,
      repes = 0;
    const nomDefecto = (($$("cpExtraNom") && $$("cpExtraNom").value) || "")
      .trim()
      .slice(0, 40);
    $$("cpExtra")
      .value.split(/\n|;/)
      .forEach((l) => {
        l = l.trim();
        if (!l) return;
        const conLetras = /[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(l);
        const hallados = [...l.matchAll(re)];
        if (!hallados.length) {
          malos++;
          return;
        }
        const lista = conLetras ? [hallados[0]] : hallados;
        const nombre = conLetras
          ? l
              .replace(hallados[0][0], "")
              .replace(/^[\s,;:\-–]+|[\s,;:\-–]+$/g, "")
          : "";
        lista.forEach((h) => {
          const d = digits(h[1]);
          if (!telValido(d)) {
            malos++;
            return;
          }
          if (tabla.has(d) || C.extras.some((x) => x.d === d)) {
            repes++;
            return;
          }
          C.extras.push({ d, nombre: nombre || nomDefecto || "Cliente" });
          C.sel.add(d);
          nuevos++;
        });
      });
    if (nuevos) $$("cpExtra").value = "";
    $$("cpExtraMsg").textContent =
      `${nuevos} agregado${nuevos === 1 ? "" : "s"}` +
      (repes ? ` · ${repes} repetido${repes === 1 ? "" : "s"}` : "") +
      (malos ? ` · ${malos} no válido${malos === 1 ? "" : "s"}` : "");
    refrescarDest();
  }

  function resumen() {
    $$("cpCnt").textContent =
      `${C.sel.size} de ${C.lista.length} seleccionados`;
    $$("cpSum").innerHTML =
      `<b>${C.sel.size}</b> mensaje${C.sel.size === 1 ? "" : "s"} · plantilla <b>${esc(C.tpl ? C.tpl.title : "—")}</b><br><span style="color:var(--muted);font-size:12px">Meta cobra por conversación iniciada con plantilla y limita los envíos según tu nivel de cuenta.</span>`;
    $$("cpGo").disabled = C.sending || !C.sel.size || !C.tpl;
  }

  /* payload / validación / preview */
  function payload(nombre) {
    const t = C.tpl,
      g = (id) => ($$(id) ? $$(id).value : "").trim(),
      nom = primer(nombre);
    const suf = g("cpLink")
      .replace(/^https?:\/\/(www\.)?geinztech\.com\//i, "")
      .replace(/^\//, "");
    const u = t.urlVars && t.urlVars[0],
      urlVars = u ? [{ index: u.index, valor: suf }] : [];
    if (t.name === "aviso_importante")
      return {
        variables: [nom, limpio(g("cpTxt"))],
        headerVars: [],
        mediaUrl: g("cpImg"),
        urlVars,
      };
    return {
      variables: [nom, limpio(g("cpB2")), limpio(g("cpB3"))],
      headerVars: [g("cpH1")],
      mediaUrl: "",
      urlVars,
    };
  }

  function validar() {
    const t = C.tpl;
    if (!t) return "Elige una plantilla";
    const p = payload("x");
    if (t.name === "aviso_importante") {
      if (!/^https:\/\//i.test(p.mediaUrl))
        return "La imagen debe ser una URL https pública";
      if (/\.webp(\?|$)/i.test(p.mediaUrl))
        return "WhatsApp no acepta WEBP en el encabezado: usa una imagen JPG o PNG";
    }
    if (p.variables.some((v) => !v) || p.headerVars.some((v) => !v))
      return "Completa todos los campos de la plantilla";
    if (p.urlVars.some((u) => !u.valor))
      return "Falta el enlace del botón (¿configuraste el alias en UsuariosUI.negocio?)";
    return "";
  }

  function pintarPrev() {
    const el = $$("cpPrev");
    if (!el) return;
    const t = C.tpl;
    if (!t) {
      el.innerHTML = "";
      return;
    }
    const w = $$("cpImgW");
    if (w) {
      const u = ($$("cpImg") && $$("cpImg").value) || "";
      w.textContent = /\.webp(\?|$)/i.test(u)
        ? "⚠️ WEBP no funciona en WhatsApp. Usa JPG o PNG."
        : "";
      w.style.color = "var(--warn)";
    }
    const first = C.lista.find((x) => C.sel.has(x.d)) || C.lista[0],
      p = payload(first ? first.nombre : "Cliente");
    let body = esc(
      textoPlantilla(
        t,
        p.variables.map((v) => v || "…"),
      ),
    ).replace(/\*([^*]+)\*/g, "<b>$1</b>");
    let head = "";
    if (t.header && t.header.format === "IMAGE")
      head = p.mediaUrl
        ? `<img src="${esc(p.mediaUrl)}" alt="" onerror="this.style.display='none'">`
        : '<div style="height:90px;background:#0f2d27;display:grid;place-items:center;font-size:12px;color:#8aa">Sin imagen</div>';
    else if (t.header && t.header.format === "TEXT")
      head = `<div class="in" style="padding-bottom:0"><div class="wa-h">${esc((t.header.text || "").replace(/\{\{(\d+)\}\}/g, (_, k) => p.headerVars[k - 1] || "…"))}</div></div>`;
    const btn = (t.buttons || [])
      .map((b) => `<div class="wa-btn">🔗 ${esc(b.text)}</div>`)
      .join("");
    el.innerHTML = `<div class="wa-b">${head}<div class="in">${body}${t.footer ? `<div class="wa-ft">${esc(t.footer)}</div>` : ""}</div>${btn}</div>`;
  }

  /* envío */
  async function enviar(ids) {
    if (C.sending || !ids.length) return;
    const err = validar();
    if (err) {
      toast(err);
      return;
    }
    if (!fbListo || !enviarPlantillaWA) {
      toast("Firebase aún no está listo");
      return;
    }
    const t = C.tpl,
      mapa = new Map(C.lista.map((x) => [x.d, x]));
    if (
      !confirm(
        `¿Enviar "${t.title}" a ${ids.length} cliente${ids.length === 1 ? "" : "s"}?\n\nEsta acción no se puede deshacer.`,
      )
    )
      return;
    C.sending = true;
    C.fallidos = [];
    resumen();
    const prog = $$("cpProg");
    prog.classList.add("show");
    $$("cpFails").innerHTML = "";
    $$("cpRetry").style.display = "none";
    let ok = 0,
      i = 0,
      hechos = 0;
    const total = ids.length,
      upd = () => {
        $$("cpFill").style.width = (hechos / total) * 100 + "%";
        $$("cpPTxt").textContent =
          `Enviando… ${hechos}/${total} · ${ok} correctos · ${C.fallidos.length} con error`;
      };
    upd();
    async function worker() {
      while (i < ids.length) {
        const d = ids[i++],
          x = mapa.get(d),
          nombre = x ? x.nombre : "Cliente",
          p = payload(nombre);
        try {
          await enviarPlantillaWA({
            conversacionId: waId(d),
            telefono: waId(d),
            nombre,
            plantilla: t.name,
            idioma: t.lang,
            variables: p.variables,
            headerVars: p.headerVars,
            mediaUrl: p.mediaUrl || null,
            mediaTipo: p.mediaUrl ? "image" : null,
            urlVars: p.urlVars,
            textoVista: textoPlantilla(t, p.variables),
          });
          ok++;
        } catch (e) {
          C.fallidos.push({ d, nombre, msg: (e && e.message) || "error" });
        }
        hechos++;
        upd();
        await sleep(250);
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    C.sending = false;
    resumen();
    $$("cpPTxt").textContent =
      `Listo: ${ok} enviados, ${C.fallidos.length} con error.`;
    $$("cpFails").innerHTML = C.fallidos
      .map(
        (f) => `• ${esc(f.nombre)} (+51 ${f.d}): ${esc(f.msg.slice(0, 160))}`,
      )
      .join("<br>");
    $$("cpRetry").style.display = C.fallidos.length ? "inline-block" : "none";
    toast(
      ok
        ? `Campaña enviada a ${ok} cliente${ok === 1 ? "" : "s"}`
        : "No se pudo enviar",
    );
  }

  /* si cambian filas de la tabla mientras estás en campañas */
  new MutationObserver(() => {
    if (
      C.montado &&
      document.body.classList.contains("modo-campanas") &&
      !C.sending
    )
      refrescarDest();
  }).observe(tbody, { childList: true });
})();