// registro_bienvenida.js
import {
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const CSS = `
.rw-overlay{position:fixed;inset:0;z-index:10040;display:flex;align-items:flex-end;justify-content:center;
  background:rgba(0,0,0,.55);opacity:0;visibility:hidden;transition:opacity .25s ease,visibility .25s ease;}
.rw-overlay.open{opacity:1;visibility:visible;}
.rw-box{position:relative;width:100%;max-width:440px;max-height:92dvh;overflow-y:auto;overflow-x:hidden;
  background:#0d0d10;border:1px solid rgba(255,255,255,.08);border-bottom:none;border-radius:24px 24px 0 0;
  padding:10px 22px calc(20px + env(safe-area-inset-bottom,0px));
  transform:translateY(100%);transition:transform .4s cubic-bezier(.22,.85,.32,1);
  box-shadow:0 -20px 60px -20px rgba(0,0,0,.8);}
.rw-overlay.open .rw-box{transform:none;}
.rw-box::before{content:"";position:absolute;top:0;left:0;right:0;height:140px;pointer-events:none;
  background:radial-gradient(70% 100% at 50% 0%,rgba(var(--dr),var(--dg),var(--db),.22),transparent 75%);}
.rw-grab{position:relative;width:36px;height:4px;border-radius:99px;background:rgba(255,255,255,.18);margin:0 auto 14px;}
.rw-progress{position:relative;display:flex;gap:6px;margin:0 40px 18px 0;}
.rw-progress i{flex:1;height:3px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden;position:relative;}
.rw-progress i::after{content:"";position:absolute;inset:0;border-radius:inherit;transform:scaleX(0);transform-origin:left;
  background:rgb(var(--dr),var(--dg),var(--db));transition:transform .4s cubic-bezier(.22,.85,.32,1);}
.rw-progress i.on::after{transform:scaleX(1);}
.rw-close{position:absolute;top:14px;right:16px;z-index:3;width:30px;height:30px;border:none;border-radius:50%;
  background:rgba(255,255,255,.07);color:#cfcfd6;font-size:12px;cursor:pointer;}
.rw-step{position:relative;animation:rwIn .35s cubic-bezier(.22,.85,.32,1);}
.rw-step[hidden]{display:none;}
@keyframes rwIn{from{opacity:0;transform:translateX(14px);}to{opacity:1;transform:none;}}
.rw-head{display:flex;align-items:center;gap:12px;margin:0 0 6px;}
.rw-logo,.rw-letter{width:46px;height:46px;border-radius:14px;flex-shrink:0;border:1px solid rgba(255,255,255,.12);}
.rw-logo{object-fit:cover;background:#151518;}
.rw-letter{display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:800;color:#fff;background:rgba(var(--dr),var(--dg),var(--db),.25);}
.rw-title{margin:0;font-size:21px;font-weight:800;color:#fff;line-height:1.2;letter-spacing:-.02em;text-align:left;}
.rw-sub{margin:0 0 16px;font-size:14px;line-height:1.5;color:#9a9aa3;text-align:left;}
.rw-sub b{color:#e8e8ec;font-weight:600;}
.rw-today{display:inline-flex;align-items:center;gap:6px;margin:0 0 16px;padding:6px 12px;border-radius:99px;font-size:12px;font-weight:700;color:#fff;
  background:rgba(var(--dr),var(--dg),var(--db),.18);border:1px solid rgba(var(--dr),var(--dg),var(--db),.4);}
.rw-label{margin:0 0 9px;font-size:12px;font-weight:600;color:#8a8a93;text-align:left;}
.rw-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 18px;}
.rw-chip{display:inline-flex;align-items:center;gap:6px;padding:9px 13px;border-radius:99px;cursor:pointer;font-size:13px;font-weight:600;
  font-family:inherit;color:#c9c9d0;line-height:1;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);
  transition:background .15s,border-color .15s,color .15s,transform .12s;-webkit-tap-highlight-color:transparent;}
.rw-chip:active{transform:scale(.95);}
.rw-chip i{font-style:normal;font-size:15px;}
.rw-chip.on{color:#fff;background:rgba(var(--dr),var(--dg),var(--db),.2);border-color:rgba(var(--dr),var(--dg),var(--db),.75);}
.rw-chips.sm .rw-chip{padding:7px 11px;font-size:12.5px;}
.rw-btn{width:100%;padding:15px;border:none;border-radius:14px;cursor:pointer;font-size:15px;font-weight:700;font-family:inherit;color:#fff;
  background:var(--brand-grad,linear-gradient(135deg,rgb(var(--dr),var(--dg),var(--db)),rgba(var(--dr),var(--dg),var(--db),.75)));
  box-shadow:0 8px 22px -8px rgba(var(--dr),var(--dg),var(--db),.6);transition:transform .15s,filter .15s,opacity .15s;}
.rw-btn:hover{filter:brightness(1.07);}
.rw-btn:active{transform:scale(.985);}
.rw-btn:disabled{opacity:.6;cursor:default;}
.rw-btn2{width:100%;margin-top:8px;padding:13px;border-radius:14px;cursor:pointer;font-size:13.5px;font-weight:700;font-family:inherit;color:#d4d4da;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);}
.rw-btn2:disabled{opacity:.6;cursor:default;}
.rw-ghost{padding:12px 14px;margin-top:6px;border:none;border-radius:12px;cursor:pointer;background:transparent;font-size:13px;font-weight:600;font-family:inherit;color:#8a8a93;}
.rw-ghost:hover{color:#d4d4da;}
.rw-center{display:flex;justify-content:center;}
.rw-stars{display:flex;justify-content:center;gap:8px;margin:2px 0 14px;}
.rw-star{background:none;border:none;padding:0;font-size:42px;line-height:1;color:#2c2c33;cursor:pointer;transition:transform .15s,color .15s;}
.rw-star.on{color:#fbbf24;transform:scale(1.08);}
.rw-txt{width:100%;min-height:60px;padding:12px 14px;border-radius:12px;resize:none;border:1px solid rgba(255,255,255,.1);
  background:rgba(255,255,255,.04);color:#fff;font-size:14px;font-family:inherit;box-sizing:border-box;}
.rw-txt:focus{outline:none;border-color:rgba(var(--dr),var(--dg),var(--db),.6);}
.rw-foto{display:flex;align-items:center;gap:10px;margin-top:10px;}
.rw-foto-btn{padding:9px 14px;border-radius:12px;font-size:12.5px;font-weight:700;color:#d4d4da;cursor:pointer;font-family:inherit;
  background:rgba(255,255,255,.05);border:1px dashed rgba(255,255,255,.2);}
.rw-thumb{position:relative;width:46px;height:46px;border-radius:10px;overflow:hidden;}
.rw-thumb img{width:100%;height:100%;object-fit:cover;}
.rw-thumb button{position:absolute;top:1px;right:1px;width:18px;height:18px;border:none;border-radius:50%;background:rgba(0,0,0,.7);color:#fff;font-size:10px;cursor:pointer;}
.rw-phone2{display:flex;align-items:center;margin-top:10px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);}
.rw-phone2 span{padding:0 4px 0 12px;font-size:13px;font-weight:700;color:#8a8a93;}
.rw-phone2 input{flex:1;min-width:0;padding:11px 8px;border:none;background:transparent;color:#fff;font-size:14px;font-family:inherit;outline:none;}
.rw-bonus{margin-top:12px;padding:10px 14px;border-radius:12px;text-align:center;font-size:13px;font-weight:800;color:#4ade80;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);}
.rw-anon{margin:12px 0 10px;padding:14px;border-radius:16px;font-size:13px;line-height:1.4;color:#e4e4ea;
  background:linear-gradient(135deg,rgba(var(--dr),var(--dg),var(--db),.16),rgba(var(--dr),var(--dg),var(--db),.04));
  border:1px solid rgba(var(--dr),var(--dg),var(--db),.4);}
.rw-anon-top{display:flex;align-items:center;gap:10px;}
.rw-anon-top b{color:#fff;font-size:14px;}
.rw-anon-top small{color:#a1a1aa;font-size:12px;}
.rw-anon-ico{font-size:26px;animation:rwBob 2.4s ease-in-out infinite;}
@keyframes rwBob{0%,100%{transform:translateY(0) rotate(-6deg);}50%{transform:translateY(-3px) rotate(6deg);}}
.rw-won{display:inline-block;margin-top:6px;padding:10px 18px;border-radius:99px;font-size:15px;font-weight:800;color:#4ade80;
  background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.4);}
.rw-canje{display:none;gap:8px;margin-top:10px;overflow-x:auto;scrollbar-width:none;}
.rw-canje div{flex:0 0 92px;padding:6px;border-radius:12px;background:rgba(255,255,255,.05);text-align:center;}
.rw-canje img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;background:#111;}
.rw-canje b{display:block;font-size:11px;margin-top:4px;line-height:1.2;color:#fff;}
.rw-canje em{font-style:normal;font-size:10.5px;color:#4ade80;font-weight:800;}
.rw-error{display:none;margin:10px 0 0;font-size:12.5px;color:#ff7b7b;text-align:center;}
.rw-done{text-align:center;padding:26px 0 14px;}
.rw-done .big{font-size:52px;}
.rw-done h3{margin:10px 0 6px;font-size:20px;font-weight:900;color:#fff;}
.rw-done p{margin:0;font-size:13.5px;color:#a1a1aa;line-height:1.5;}
@media(min-width:600px){
  .rw-overlay{align-items:center;padding:24px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}
  .rw-box{border-radius:26px;border-bottom:1px solid rgba(255,255,255,.08);padding:26px 26px 22px;
    transform:translateY(16px) scale(.96);opacity:0;transition:transform .35s cubic-bezier(.22,.85,.32,1),opacity .25s;}
  .rw-overlay.open .rw-box{transform:none;opacity:1;}
  .rw-grab{display:none;}
}
@media(prefers-reduced-motion:reduce){.rw-box,.rw-step,.rw-chip{animation:none!important;transition:none!important;}}
`;

const GUSTOS = [
  { id: "dias_especiales", ico: "🎉", txt: "Días especiales" },
  { id: "combos_familiares", ico: "👨‍👩‍👧", txt: "Combos familiares" },
  { id: "menus_individuales", ico: "🙋", txt: "Para mí solo" },
  { id: "combos_pareja", ico: "💑", txt: "En pareja" },
  { id: "promos_ofertas", ico: "🔥", txt: "Promos y ofertas" },
  { id: "saludable", ico: "🥗", txt: "Saludable" },
];
const MOMENTOS = [
  { id: "desayuno", ico: "🌅", txt: "Desayuno" },
  { id: "almuerzo", ico: "🍽️", txt: "Almuerzo" },
  { id: "cena", ico: "🌙", txt: "Cena" },
  { id: "fin_de_semana", ico: "🛋️", txt: "Finde" },
];

const PEND_KEY = (id) => `geinz_registro_pend_${id}`;
const PEND_TTL = 7 * 24 * 3600e3;

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        m
      ],
  );

function limpiarTel(v) {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("51")) d = d.slice(2);
  return d;
}
const telValido = (d) => /^9\d{8}$/.test(d);
const fmtTel = (d) =>
  d.replace(/(\d{3})(\d{0,3})(\d{0,3})/, (_, a, b, c) =>
    [a, b, c].filter(Boolean).join(" "),
  );

const RE_CAMPO_TEL = /tel|cel|phone|whats|m[oó]vil|movil|n[uú]mero|numero/i;
function buscarTel(obj, nivel = 0) {
  if (!obj || typeof obj !== "object" || nivel > 2) return "";
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v) && !v.toDate) {
      const r = buscarTel(v, nivel + 1);
      if (r) return r;
      continue;
    }
    if (RE_CAMPO_TEL.test(k)) {
      const d = limpiarTel(v);
      if (telValido(d)) return d;
    }
  }
  return "";
}
function telDeCuenta(user, data) {
  if (!user) return "";
  const c = data?.contacto;
  if (c?.numero_user && String(c.cod_telefonico || "+51") === "+51") {
    const d = limpiarTel(c.numero_user);
    if (telValido(d)) return d;
  }
  const dAuth = limpiarTel(user.phoneNumber || "");
  if (telValido(dAuth)) return dAuth;
  return buscarTel(data);
}
const capitalizar = (t) => {
  const s = String(t || "")
    .trim()
    .toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
function fechaLima() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}
function injectStyles() {
  if (document.getElementById("rwStyle")) return;
  const st = document.createElement("style");
  st.id = "rwStyle";
  st.textContent = CSS;
  document.head.appendChild(st);
}
const chipsHTML = (lista, activos) =>
  lista
    .map(
      (g) =>
        `<button type="button" class="rw-chip${activos.has(g.id) ? " on" : ""}" data-id="${g.id}" aria-pressed="${activos.has(g.id)}"><i>${g.ico}</i>${esc(g.txt)}</button>`,
    )
    .join("");

/**
 * ctx = {
 *   auth, registradoDoc(localidad, negocioId, id), getUserData(uid), showToast,
 *   onEnviarReview({calificacion, descripcion, foto, anonimo}),   // debe lanzar error si falla
 *   getCanje(): Promise<[{nombre, imagen, puntos}]>,
 *   onNecesitaLogin(),
 *   puntos?: 10,
 *   negocio: { id, localidad, nombre, logoSrc, alias?, diaEspecial? }
 * }
 */
export function mostrarBienvenidaRegistro(ctx) {
  if (document.getElementById("regWelcome")) return;
  injectStyles();

  const {
    auth,
    registradoDoc,
    getUserData,
    showToast,
    onEnviarReview,
    getCanje,
    onNecesitaLogin,
    negocio,
  } = ctx;
  const PUNTOS = ctx.puntos ?? 10;
  const LISTA_G = Array.isArray(ctx.opciones?.gustos) ? ctx.opciones.gustos : GUSTOS;
const LISTA_M = Array.isArray(ctx.opciones?.momentos) ? ctx.opciones.momentos : MOMENTOS;
  let user = auth.currentUser;
  let data = {};
  let previo = null;
  let telCuenta = "";

  // Borrador guardado antes de ir al login (se lee en el momento, sin esperar nada)
  let pend = null;
  try {
    const p = JSON.parse(localStorage.getItem(PEND_KEY(negocio.id)) || "null");
    if (p && Date.now() - (p.ts || 0) <= PEND_TTL) pend = p;
  } catch {}

  const gustosSel = new Set(pend?.gustos || []);
  const momentosSel = new Set(pend?.momentos || []);
  let stars = pend?.stars || 0;
  let texto = pend?.texto || "";
  let foto = null;
  let canje = [];
  let enviando = false;
  let paso = user && pend?.paso === 2 ? 2 : 1;

  const bizNombre = negocio.nombre || "este negocio";
  const logoHTML = negocio.logoSrc
    ? `<img class="rw-logo" src="${esc(negocio.logoSrc)}" alt="">`
    : `<div class="rw-letter">${esc(bizNombre.trim().charAt(0).toUpperCase())}</div>`;
  const hoyHTML = negocio.diaEspecial?.titulo
    ? `<div class="rw-today">🎉 ${esc(negocio.diaEspecial.etiqueta || "Hoy")} · ${esc(negocio.diaEspecial.titulo)}</div>`
    : "";
  const nombreInicial = capitalizar(
    String(user?.displayName || "").split(" ")[0],
  );

  const ov = document.createElement("div");
  ov.id = "regWelcome";
  ov.className = "rw-overlay";
  ov.innerHTML = `
    <div class="rw-box" role="dialog" aria-modal="true" aria-label="Bienvenida">
      <div class="rw-grab"></div>
      <button class="rw-close" type="button" aria-label="Cerrar">✕</button>
      <div class="rw-progress"><i class="on" data-p="1"></i><i data-p="2"></i></div>

      <section class="rw-step" data-step="1">
        <div class="rw-head">${logoHTML}
          <h3 class="rw-title" id="rwHola">${nombreInicial ? `Hola, ${esc(nombreInicial)} 👋` : "¡Hola! 👋"}<br>Bienvenido a ${esc(bizNombre)}</h3>
        </div>
        <p class="rw-sub" style="margin-top:12px">Cuéntanos qué se te antoja y <b>te avisamos primero</b>.</p>
        ${hoyHTML}
        ${LISTA_G.length ? `<div class="rw-label">Me interesa</div>` : ""}
        <div class="rw-chips" id="rwGustos">${chipsHTML(LISTA_G, gustosSel)}</div>
        ${LISTA_M.length ? `<div class="rw-label">Suelo pedir en</div>` : ""}
        <div class="rw-chips sm" id="rwMomentos">${chipsHTML(LISTA_M, momentosSel)}</div>
        <button class="rw-btn" id="rwNext" type="button">Continuar</button>
        <div class="rw-center"><button class="rw-ghost" id="rwSkip" type="button">Ahora no</button></div>
      </section>

      <section class="rw-step" data-step="2" hidden>
        <h3 class="rw-title" style="margin-bottom:4px">¿Qué tal tu experiencia?</h3>
        <p class="rw-sub" style="margin-bottom:10px">Una reseña rápida, toma 5 segundos.</p>
        <div class="rw-stars" id="rwStars">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="rw-star${n <= stars ? " on" : ""}" data-n="${n}" aria-label="${n} estrellas">★</button>`).join("")}</div>
        <textarea class="rw-txt" id="rwTxt" maxlength="300" placeholder="Cuéntanos en una frase (opcional)">${esc(texto)}</textarea>
        <div class="rw-foto">
          <button type="button" class="rw-foto-btn" id="rwFotoBtn">📷 Agregar foto (opcional)</button>
          <div class="rw-thumb" id="rwThumb" hidden><img alt=""><button type="button" id="rwFotoX">✕</button></div>
        </div>
        <input type="file" id="rwFile" accept="image/*" hidden>
        <div id="rwTelWrap"></div>
        <div id="rwModo"></div>
        <p class="rw-error" id="rwError"></p>
        <div class="rw-center"><button class="rw-ghost" id="rwBack" type="button">‹ Atrás</button></div>
      </section>

      <section class="rw-step" data-step="3" hidden>
        <div class="rw-done" id="rwDone"></div>
      </section>
    </div>`;
  document.body.appendChild(ov);

  const $ = (id) => ov.querySelector("#" + id);
  const vibrar = () => navigator.vibrate?.(8);
  const setErr = (m) => {
    const e = $("rwError");
    e.textContent = m;
    e.style.display = m ? "block" : "none";
  };

  // ── Zona que cambia según haya sesión o no ──
  function pintarModo() {
    const box = $("rwModo");
    const tel = $("rwTelWrap");
    const telPrev = $("rwPhone")?.value ?? null;
    const nomPrev = $("rwNombre")?.value ?? null;

    const t = user ? telCuenta || limpiarTel(previo?.telefono || "") : "";
    const nombreCuenta = user
      ? String(
          data.nombre_completo ||
            data.nombre ||
            data.nombre_user ||
            user.displayName ||
            "",
        ).trim()
      : "";

    tel.innerHTML =
      (user
        ? `<input class="rw-txt" id="rwNombre" style="min-height:0;margin-top:10px;opacity:.85" maxlength="40" readonly value="${esc(nombreCuenta)}" placeholder="Tu nombre">`
        : `<input class="rw-txt" id="rwNombre" style="min-height:0;margin-top:10px" maxlength="40" placeholder="Tu nombre (si lo dejas vacío: Anónimo)" value="${esc(nomPrev || "")}">`) +
      `<div class="rw-phone2"><span>+51</span><input id="rwPhone" type="tel" inputmode="numeric" maxlength="13" placeholder="Tu celular (obligatorio)" value="${esc(telPrev !== null && telPrev !== "" ? telPrev : fmtTel(t))}"></div>`;

    $("rwPhone").addEventListener("input", (e) => {
      let d = e.target.value.replace(/\D/g, "");
      if (d.length > 9 && d.startsWith("51")) d = d.slice(2);
      e.target.value = fmtTel(d.slice(0, 9));
      setErr("");
    });

       if (user) {
      box.innerHTML = `<div class="rw-bonus">⭐ Ganas +${PUNTOS} puntos por tu reseña</div>
      <button class="rw-btn" id="rwSend" type="button" style="margin-top:12px">Enviar reseña</button>`;
    } else {
      box.innerHTML = `<div class="rw-anon">
        <div class="rw-anon-top"><span class="rw-anon-ico">🎁</span>
          <div><b>Gana +${PUNTOS} puntos</b> con tu reseña<br>
          <small>y canjéalos por premios como estos:</small></div>
        </div>
        <div class="rw-canje" id="rwCanje"></div>
      </div>
      <button class="rw-btn" id="rwLogin" type="button">Iniciar sesión y ganar ${PUNTOS} puntos</button>
      <button class="rw-btn2" id="rwSend" type="button">Enviar sin cuenta</button>`;
      pintarCanje();
    }
    $("rwSend").addEventListener("click", enviar);
    $("rwLogin")?.addEventListener("click", irLogin);
  }
  function pintarCanje() {
    const el = $("rwCanje");
    if (!el) return;
    el.innerHTML = canje
      .map(
        (p) =>
          `<div>${p.imagen ? `<img src="${esc(p.imagen)}" alt="" onerror="this.remove()">` : ""}<b>${esc(p.nombre)}</b>${p.puntos ? `<em>${p.puntos} pts</em>` : ""}</div>`,
      )
      .join("");
    el.style.display = canje.length ? "flex" : "none";
  }

  const irPaso = (n) => {
    paso = n;
    ov.querySelectorAll(".rw-step").forEach(
      (s) => (s.hidden = s.dataset.step !== String(n)),
    );
    ov.querySelector('[data-p="2"]').classList.toggle("on", n >= 2);
    ov.querySelector(".rw-box").scrollTop = 0;
    if (n === 2) pintarModo();
  };

  const cerrar = () => {
    offAuth?.();
    ov.classList.remove("open");
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKey);
    setTimeout(() => ov.remove(), 420);
  };
  const onKey = (e) => {
    if (e.key === "Escape") cerrar();
  };
  document.addEventListener("keydown", onKey);

  const guardarBorrador = () => {
    try {
      localStorage.setItem(
        PEND_KEY(negocio.id),
        JSON.stringify({
          paso: 2,
      gustos: [...gustosSel].filter((id) => LISTA_G.some((o) => o.id === id)),
      momentos: [...momentosSel].filter((id) => LISTA_M.some((o) => o.id === id)),
          stars,
          texto,
          ts: Date.now(),
        }),
      );
    } catch {}
  };
  function irLogin() {
    guardarBorrador();
    showToast("Inicia sesión para ganar tus puntos");
    cerrar();
    if (typeof onNecesitaLogin === "function") setTimeout(onNecesitaLogin, 350);
  }

  // ── Chips ──
  const bindChips = (contId, setSel) => {
    $(contId).addEventListener("click", (e) => {
      const b = e.target.closest(".rw-chip");
      if (!b) return;
      const id = b.dataset.id;
      setSel.has(id) ? setSel.delete(id) : setSel.add(id);
      b.classList.toggle("on", setSel.has(id));
      b.setAttribute("aria-pressed", setSel.has(id));
      vibrar();
    });
  };
  bindChips("rwGustos", gustosSel);
  bindChips("rwMomentos", momentosSel);

  // ── Estrellas / texto / foto ──
  $("rwStars").addEventListener("click", (e) => {
    const b = e.target.closest(".rw-star");
    if (!b) return;
    stars = Number(b.dataset.n);
    setErr("");
    ov.querySelectorAll(".rw-star").forEach((s) =>
      s.classList.toggle("on", Number(s.dataset.n) <= stars),
    );
    vibrar();
  });
  $("rwTxt").addEventListener("input", (e) => (texto = e.target.value));
  $("rwFotoBtn").addEventListener("click", () => $("rwFile").click());
  $("rwFile").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      foto = r.result;
      $("rwThumb").hidden = false;
      $("rwThumb").querySelector("img").src = foto;
      $("rwFotoBtn").textContent = "📷 Cambiar foto";
    };
    r.readAsDataURL(f);
    e.target.value = "";
  });
  $("rwFotoX").addEventListener("click", () => {
    foto = null;
    $("rwThumb").hidden = true;
    $("rwFotoBtn").textContent = "📷 Agregar foto (opcional)";
  });

  // ── Paso 1 → 2 (guarda preferencias en segundo plano si hay sesión) ──
  $("rwNext").addEventListener("click", () => {
    if (user)
      guardarRegistro().catch((e) => console.warn("registro:", e.message));
    irPaso(2);
  });
  $("rwSkip").addEventListener("click", () => {
    try {
      localStorage.removeItem(PEND_KEY(negocio.id));
    } catch {}
    cerrar();
  });
  $("rwBack").addEventListener("click", () => irPaso(1));
  ov.querySelector(".rw-close").addEventListener("click", cerrar);
  ov.addEventListener("click", (e) => {
    if (e.target === ov) cerrar();
  });

  async function guardarRegistro(tel = "") {
    if (!user) return;
    const payload = {
      id_usuario: user.uid,
      id_registro: user.uid,
      tiene_cuenta: true,
      correo: user.email || null,
      nombre:
        capitalizar(
          String(
            data.nombre ||
              data.nombre_user ||
              data.nombre_completo ||
              user.displayName ||
              "",
          ).split(" ")[0],
        ) || null,
      nombre_completo: data.nombre_completo || null,
      gustos: [...gustosSel],
      momentos: [...momentosSel],
      acepta_promos: true,
      id_negocio: negocio.id,
      localidad: negocio.localidad,
      negocio_nombre: negocio.nombre || null,
      negocio_alias: negocio.alias || null,
      dia_especial_visto: negocio.diaEspecial?.titulo || null,
      origen: "enlace_registro",
      dispositivo: /Mobi|Android|iPhone/i.test(navigator.userAgent)
        ? "movil"
        : "pc",
      fecha_texto: fechaLima(),
      actualizado_en: serverTimestamp(),
    };
    if (telValido(tel)) {
      payload.telefono = tel;
      payload.telefono_origen = tel === telCuenta ? "cuenta" : "editado";
      payload.telefono_cuenta = telCuenta || null;
    }
    if (!previo) payload.registrado_en = serverTimestamp();
    await setDoc(
      registradoDoc(negocio.localidad, negocio.id, user.uid),
      payload,
      { merge: true },
    );
    previo = previo || { guardado: true };
  }

  // ── Enviar reseña ──
async function enviar() {
  if (enviando) return;
  if (!stars) return setErr("Toca las estrellas para calificar");
  if (texto.trim().length < 5) {
    $("rwTxt").focus();
    return setErr("Cuéntanos en una frase qué tal estuvo");
  }
  const tel = limpiarTel($("rwPhone")?.value || "");
  if (!telValido(tel))
    return setErr("Escribe un celular válido de 9 dígitos que empiece con 9");
  const nombre = user ? "" : $("rwNombre")?.value.trim() || "Anónimo"; // nombre opcional
  enviando = true;
  setErr("");
  const btn = $("rwSend");
  btn.disabled = true;
  btn.textContent = "Enviando…";
  try {
    const res = await onEnviarReview({
      calificacion: stars,
      descripcion: texto.trim(),
      foto,
      anonimo: !user,
      nombre,
      telefono: tel,
    });
    if (user)
      guardarRegistro(tel).catch((e) => console.warn("registro:", e.message));
    try { localStorage.removeItem(PEND_KEY(negocio.id)); } catch {}

    $("rwDone").innerHTML = user
      ? res?.bonus
        ? `<div class="big">🎉</div><h3>¡Gracias por tu reseña!</h3>
           <div class="rw-won">+${PUNTOS} puntos sumados a tu tarjeta</div>`
        : `<div class="big">🙌</div><h3>¡Gracias por tu reseña!</h3>
           <p>Ya quedó publicada.</p>`
      : `<div class="big">🙌</div><h3>¡Gracias por tu reseña!</h3>
         <p>La revisaremos y se publicará pronto.</p>`;
    irPaso(3);
    ov.querySelector('[data-p="2"]').classList.add("on");
    setTimeout(cerrar, 2600);
  } catch (e) {
    console.error("Reseña rápida:", e);
    enviando = false;
    btn.disabled = false;
    btn.textContent = user ? "Enviar reseña" : "Enviar sin cuenta";
    setErr("No se pudo enviar, intenta de nuevo");
  }
}

  // ── ABRE YA (nada de esperar a Firebase) ──
  void ov.offsetHeight;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => ov.classList.add("open")),
  );
  document.body.style.overflow = "hidden";
  if (paso === 2) irPaso(2);

  // ── Después de abierto: completa datos en segundo plano ──
  Promise.resolve(getCanje?.())
    .then((l) => {
      canje = l || [];
      pintarCanje();
    })
    .catch(() => {});
  async function cargarDatosCuenta() {
    const u = user;
    if (!u) return;
    try {
      data = (await getUserData(u.uid)) || {};
    } catch {}
    if (user?.uid !== u.uid) return;
    telCuenta = telDeCuenta(u, data);
    const nom = capitalizar(
      String(
        data.nombre ||
          data.nombre_user ||
          data.nombre_completo ||
          u.displayName ||
          "",
      ).split(" ")[0],
    );
    if (nom && ov.isConnected)
      $("rwHola").innerHTML =
        `Hola, ${esc(nom)} 👋<br>Bienvenido a ${esc(bizNombre)}`;
    try {
      const s = await getDoc(
        registradoDoc(negocio.localidad, negocio.id, u.uid),
      );
      if (s.exists()) {
        previo = s.data();
        if (!pend) {
          (previo.gustos || []).forEach((g) => gustosSel.add(g));
          (previo.momentos || []).forEach((m) => momentosSel.add(m));
          if (ov.isConnected) {
             $("rwGustos").innerHTML = chipsHTML(LISTA_G, gustosSel);
            $("rwMomentos").innerHTML = chipsHTML(LISTA_M, momentosSel);
          }
        }
      }
    } catch {}
    if (ov.isConnected && paso === 2) pintarModo();
  }

  if (user) cargarDatosCuenta();

  // Si la sesión se restaura DESPUÉS de abrir el diálogo, se actualiza sola
  const offAuth = auth.onAuthStateChanged?.((u) => {
    if ((u?.uid || null) === (user?.uid || null)) return;
    user = u;
    if (!u) {
      data = {};
      telCuenta = "";
      previo = null;
    }
    if (ov.isConnected && paso === 2) pintarModo();
    if (u) cargarDatosCuenta();
  });
}
