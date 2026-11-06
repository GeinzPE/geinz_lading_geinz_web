/* crm_ui.js — se carga DESPUÉS de crm_pro.js */
(() => {
  "use strict";
  const $$ = (id) => document.getElementById(id);

  /* ── modo ligero para equipos básicos ── */
  const nav = navigator, cn = nav.connection || {};
  if ((nav.deviceMemory && nav.deviceMemory <= 2) ||
      (nav.hardwareConcurrency && nav.hardwareConcurrency <= 2) || cn.saveData)
    document.documentElement.classList.add("crm-lite");

  const css = document.createElement("style");
  css.textContent = `
@keyframes crmIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes crmFade{from{opacity:0}to{opacity:1}}
@keyframes crmSlide{from{transform:translateX(-100%)}to{transform:translateX(300%)}}

/* cambio de pestañas */
body.modo-chats #vistaChats,
body.modo-campanas #vistaCampanas,
body:not(.modo-chats):not(.modo-campanas) .grid{animation:crmIn .26s ease backwards}
.crm .chat-modal.show .ch-main{animation:crmFade .24s ease backwards}
.modes button{transition:background .2s,color .2s}
.chip,.pill,.btn-chat,.btn-bloq,.c-btn,.sd-btn,.send-tpl,.cp-go{transition:transform .15s,background .2s,border-color .2s,opacity .2s}
.chip:active,.pill:active,.c-btn:active,.sd-btn:active,.send-tpl:active,.cp-go:active{transform:scale(.97)}
.tpl-card,.cp-tpl,.cp-pr{transition:transform .18s,border-color .18s,background .18s,box-shadow .18s}
.tpl-card:hover,.cp-tpl:hover,.cp-pr:hover{transform:translateY(-2px)}
.cp-pr.on{box-shadow:0 0 0 2px rgba(37,211,102,.35)}
.tpl-prev.show{animation:crmIn .25s ease backwards}
.tpl-prev img{animation:crmFade .3s ease}

/* barras de carga */
.crm-bar{position:relative;height:3px;overflow:hidden;flex:none;opacity:0;transition:opacity .2s}
.crm-bar.show{opacity:1}
.crm-bar::after{content:"";position:absolute;top:0;left:0;height:100%;width:35%;background:linear-gradient(90deg,transparent,var(--wa),transparent)}
.crm-bar.show::after{animation:crmSlide 1.1s ease-in-out infinite}
.send-tpl:disabled{position:relative;overflow:hidden}
.send-tpl:disabled::after{content:"";position:absolute;left:0;bottom:0;height:3px;width:35%;background:#04170b;animation:crmSlide 1s linear infinite}

/* panel de plantillas / promos: tarjeta flotante bajo el nombre */
.ch-main{position:relative;min-height:0}
.ch-main>.ch-tpl{position:absolute;left:12px;right:12px;top:calc(var(--hh,72px) + 8px);
  max-height:calc(100% - var(--hh,72px) - 20px)!important;overflow-y:auto!important;
  background:var(--surface);border:1px solid rgba(37,211,102,.28)!important;border-radius:16px;
  box-shadow:0 18px 40px rgba(0,0,0,.55);z-index:8;
  opacity:0;visibility:hidden;transform:translateY(-10px);
  transition:opacity .22s ease,transform .22s ease,visibility 0s .22s}
.ch-main>.ch-tpl.open{opacity:1;visibility:visible;transform:none;transition:opacity .22s ease,transform .22s ease,visibility 0s}
.tplX{position:absolute;top:10px;right:10px;z-index:2}

/* ficha del cliente: abre y cierra deslizando */
@media(min-width:1280px){
  body .crm .chat-box .ch-side{display:block!important;position:static!important;flex:none;width:300px!important;
    overflow-x:hidden;overflow-y:auto;opacity:1;transition:width .26s ease,opacity .2s ease,border-color .26s}
  body:not(.side-open) .crm .chat-box .ch-side{width:0!important;opacity:0;border-left-color:transparent;overflow:hidden;pointer-events:none}
  .ch-side .sd{width:300px}
}
@media(max-width:1279px){
  body .crm .chat-box .ch-side{display:block!important;position:absolute!important;top:0;right:0;bottom:0;
    width:min(310px,88%)!important;z-index:7;transform:none;visibility:visible;transition:transform .26s ease}
  body:not(.side-open) .crm .chat-box .ch-side{transform:translateX(105%);visibility:hidden;transition:transform .26s ease,visibility 0s .26s}
}
.crm,.crm-right,.chat-box{max-width:100%}

/* aviso de éxito */
#toast.ok{border-color:rgba(37,211,102,.5);color:#d9ffe8}
#toast.ok::before{content:"✓ ";color:var(--wa);font-weight:800}

/* equipos básicos / movimiento reducido */
.crm-lite *,.crm-lite *::before,.crm-lite *::after{animation:none!important;transition:none!important}
.crm-lite .crm-bar.show::after,.crm-lite .send-tpl:disabled::after{animation:crmSlide 1.4s linear infinite!important}
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation:none!important;transition:none!important}
  .crm-bar.show::after,.send-tpl:disabled::after{animation:crmSlide 1.4s linear infinite!important}
}
`;
  document.head.appendChild(css);

  /* ── barra de carga de la lista de chats ── */
  const barL = document.createElement("div");
  barL.className = "crm-bar show";
  $$("chList").before(barL);
  const finLista = () => barL.classList.remove("show");
  setTimeout(finLista, 12000); // por si Firebase no responde

  const _rl = window.renderChatList;
  window.renderChatList = function () {
    _rl();
    if (!convPrimeraCarga) {
      const em = $$("vlEmpty");
      if (em) { em.style.display = "block"; em.textContent = "Cargando chats…"; }
    } else finLista();
  };

  /* ── barra de carga de cada conversación ── */
  const main = document.querySelector(".ch-main");
  const head = main.querySelector(".ch-head");
  const barC = document.createElement("div");
  barC.className = "crm-bar";
  head.after(barC);

  const updHH = () => main.style.setProperty("--hh", head.offsetHeight + "px");
  if (window.ResizeObserver) new ResizeObserver(updHH).observe(head);
  window.addEventListener("resize", updHH);

  const _pc = window.pintarCabecera;
  window.pintarCabecera = function () {
    _pc();
    barC.classList.toggle("show", !!chTr && !msgsListos);
    updHH();
  };

  /* ── botón ✕ dentro del panel de plantillas ── */
  chTpl.insertAdjacentHTML("afterbegin", '<button type="button" class="xbtn tplX" aria-label="Cerrar">✕</button>');
  chTpl.querySelector(".tplX").addEventListener("click", () => chTpl.classList.remove("open"));

  /* ── aviso verde con ✓ cuando algo se envía o guarda ── */
  const t = $$("toast");
  if (t) new MutationObserver(() => {
    t.classList.toggle("ok", /enviad|guardad|listo/i.test(t.textContent));
  }).observe(t, { childList: true, characterData: true, subtree: true });

  updHH();
})();