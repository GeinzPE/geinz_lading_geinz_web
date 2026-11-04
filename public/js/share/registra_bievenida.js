// registro_bienvenida.js
import {
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const CSS = `
.rw-overlay{position:fixed;inset:0;z-index:10040;display:flex;align-items:flex-end;justify-content:center;
  background:rgba(0,0,0,.55);opacity:0;visibility:hidden;
  transition:opacity .25s ease,visibility .25s ease;}
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
.rw-progress{position:relative;display:flex;gap:6px;margin:0 0 18px;}
.rw-progress i{flex:1;height:3px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden;position:relative;}
.rw-progress i::after{content:"";position:absolute;inset:0;border-radius:inherit;transform:scaleX(0);transform-origin:left;
  background:rgb(var(--dr),var(--dg),var(--db));transition:transform .4s cubic-bezier(.22,.85,.32,1);}
.rw-progress i.on::after{transform:scaleX(1);}
.rw-close{position:absolute;top:14px;right:16px;z-index:3;width:30px;height:30px;border:none;border-radius:50%;
  background:rgba(255,255,255,.07);color:#cfcfd6;font-size:12px;cursor:pointer;transition:background .2s;}
.rw-close:hover{background:rgba(255,255,255,.14);}
.rw-step{position:relative;animation:rwIn .35s cubic-bezier(.22,.85,.32,1);}
.rw-step[hidden]{display:none;}
@keyframes rwIn{from{opacity:0;transform:translateX(14px);}to{opacity:1;transform:none;}}
.rw-head{display:flex;align-items:center;gap:12px;margin:0 0 6px;}
.rw-logo,.rw-letter{width:46px;height:46px;border-radius:14px;flex-shrink:0;
  border:1px solid rgba(255,255,255,.12);}
.rw-logo{object-fit:cover;background:#151518;}
.rw-letter{display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:800;color:#fff;
  background:rgba(var(--dr),var(--dg),var(--db),.25);}
.rw-title{margin:0;font-size:21px;font-weight:800;color:#fff;line-height:1.2;letter-spacing:-.02em;text-align:left;}
.rw-sub{margin:0 0 16px;font-size:14px;line-height:1.5;color:#9a9aa3;text-align:left;}
.rw-sub b{color:#e8e8ec;font-weight:600;}
.rw-today{display:inline-flex;align-items:center;gap:6px;margin:0 0 16px;padding:6px 12px;border-radius:99px;
  font-size:12px;font-weight:700;color:#fff;background:rgba(var(--dr),var(--dg),var(--db),.18);
  border:1px solid rgba(var(--dr),var(--dg),var(--db),.4);}
.rw-label{margin:0 0 9px;font-size:12px;font-weight:600;color:#8a8a93;text-align:left;}
.rw-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 18px;}
.rw-chip{display:inline-flex;align-items:center;gap:6px;padding:9px 13px;border-radius:99px;cursor:pointer;
  font-size:13px;font-weight:600;font-family:inherit;color:#c9c9d0;line-height:1;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);
  transition:background .15s,border-color .15s,color .15s,transform .12s;-webkit-tap-highlight-color:transparent;}
.rw-chip:active{transform:scale(.95);}
.rw-chip i{font-style:normal;font-size:15px;}
.rw-chip.on{color:#fff;background:rgba(var(--dr),var(--dg),var(--db),.2);border-color:rgba(var(--dr),var(--dg),var(--db),.75);}
.rw-chips.sm .rw-chip{padding:7px 11px;font-size:12.5px;}
.rw-field{display:block;margin:0 0 14px;text-align:left;}
.rw-field>span{display:block;font-size:12px;font-weight:600;color:#8a8a93;margin-bottom:8px;}
.rw-phone{display:flex;align-items:center;border-radius:14px;background:rgba(255,255,255,.05);
  border:1.5px solid rgba(255,255,255,.1);transition:border-color .15s,box-shadow .15s;}
.rw-phone:focus-within{border-color:rgba(var(--dr),var(--dg),var(--db),.8);box-shadow:0 0 0 4px rgba(var(--dr),var(--dg),var(--db),.15);}
.rw-phone.bad{border-color:#ff6b6b;animation:rwShake .35s;}
@keyframes rwShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
.rw-prefix{padding:0 4px 0 14px;font-size:15px;font-weight:700;color:#8a8a93;}
.rw-input{flex:1;min-width:0;padding:15px 8px;border:none;background:transparent;color:#fff;
  font-size:17px;font-weight:600;letter-spacing:.03em;font-family:inherit;outline:none;color-scheme:dark;}
.rw-input::placeholder{color:#55555d;font-weight:500;}
.rw-tick{width:22px;height:22px;margin-right:12px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-size:12px;font-weight:900;color:#06220f;background:#4ade80;transform:scale(0);opacity:0;
  transition:transform .25s cubic-bezier(.34,1.5,.5,1),opacity .2s;}
.rw-phone.ok .rw-tick{transform:scale(1);opacity:1;}
.rw-hint{display:block;margin-top:7px;font-size:12px;color:#7b7b84;}
.rw-error{display:none;margin:7px 0 0;font-size:12.5px;color:#ff7b7b;}
.rw-switch{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;margin:0 0 16px;border-radius:14px;
  cursor:pointer;text-align:left;font-family:inherit;color:#d4d4da;font-size:13px;line-height:1.35;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);}
.rw-switch b{color:#fff;font-weight:600;}
.rw-knob{position:relative;flex-shrink:0;width:42px;height:25px;border-radius:99px;background:rgba(255,255,255,.14);transition:background .2s;}
.rw-knob::after{content:"";position:absolute;top:3px;left:3px;width:19px;height:19px;border-radius:50%;background:#fff;
  transition:transform .25s cubic-bezier(.34,1.4,.5,1);box-shadow:0 2px 6px rgba(0,0,0,.4);}
.rw-switch[aria-checked="true"] .rw-knob{background:rgb(var(--dr),var(--dg),var(--db));}
.rw-switch[aria-checked="true"] .rw-knob::after{transform:translateX(17px);}
.rw-btn{width:100%;padding:15px;border:none;border-radius:14px;cursor:pointer;font-size:15px;font-weight:700;
  font-family:inherit;color:#fff;letter-spacing:-.005em;
  background:var(--brand-grad,linear-gradient(135deg,rgb(var(--dr),var(--dg),var(--db)),rgba(var(--dr),var(--dg),var(--db),.75)));
  box-shadow:0 8px 22px -8px rgba(var(--dr),var(--dg),var(--db),.6);transition:transform .15s,filter .15s,opacity .15s;}
.rw-btn:hover{filter:brightness(1.07);}
.rw-btn:active{transform:scale(.985);}
.rw-btn:disabled{opacity:.6;cursor:default;}
.rw-row{display:flex;gap:8px;margin-top:6px;}
.rw-ghost{flex:0 0 auto;padding:12px 14px;margin-top:6px;border:none;border-radius:12px;cursor:pointer;background:transparent;
  font-size:13px;font-weight:600;font-family:inherit;color:#8a8a93;}
.rw-ghost:hover{color:#d4d4da;}
.rw-center{display:flex;justify-content:center;}
.rw-fine{margin:10px 0 0;text-align:center;font-size:11.5px;color:#66666e;}
@media(min-width:600px){
  .rw-overlay{align-items:center;padding:24px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}
  .rw-box{border-radius:26px;border-bottom:1px solid rgba(255,255,255,.08);padding:26px 26px 22px;
    transform:translateY(16px) scale(.96);opacity:0;transition:transform .35s cubic-bezier(.22,.85,.32,1),opacity .25s;}
  .rw-overlay.open .rw-box{transform:none;opacity:1;}
  .rw-grab{display:none;}
}
@media(prefers-reduced-motion:reduce){.rw-box,.rw-step,.rw-phone.bad,.rw-chip,.rw-knob::after{animation:none!important;transition:none!important;}}
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

const PEND_KEY = (negocioId) => `geinz_registro_pend_${negocioId}`;
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

// Celular de la cuenta: contacto.numero_user (+51) → Auth → búsqueda general
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
 * Compatibilidad: registros viejos que quedaron pendientes CON teléfono.
 * El pendiente nuevo (paso 1, sin teléfono) lo maneja el diálogo, no esta función.
 */
export async function completarRegistroPendiente(ctx) {
  const { auth, registradoDoc, getUserData, negocio } = ctx;
  const user = auth.currentUser;
  if (!user) return false;

  let p = null;
  try {
    p = JSON.parse(localStorage.getItem(PEND_KEY(negocio.id)) || "null");
  } catch {}
  if (!p) return false;
  if (!p.tel) return false; // pendiente del paso 1: lo retoma el diálogo
  if (Date.now() - (p.ts || 0) > PEND_TTL) {
    try {
      localStorage.removeItem(PEND_KEY(negocio.id));
    } catch {}
    return false;
  }

  let data = {};
  try {
    data = (await getUserData(user.uid)) || {};
  } catch (e) {
    console.warn("registro pendiente: no se pudo leer el usuario:", e.message);
  }
  const telCuenta = telDeCuenta(user, data);
  const primerNombre = capitalizar(
    String(
      data.nombre ||
        data.nombre_user ||
        data.nombre_completo ||
        user.displayName ||
        "",
    ).split(" ")[0],
  );

  try {
    const ref = registradoDoc(negocio.localidad, negocio.id, user.uid);
    let existe = false;
    try {
      existe = (await getDoc(ref)).exists();
    } catch {}

    const payload = {
      id_usuario: user.uid,
      id_registro: user.uid,
      tiene_cuenta: true,
      correo: user.email || null,
      nombre: primerNombre || null,
      nombre_completo: data.nombre_completo || null,
      telefono: p.tel,
      telefono_origen: p.tel === telCuenta ? "cuenta" : "editado",
      telefono_cuenta: telCuenta || null,
      gustos: p.gustos || [],
      momentos: p.momentos || [],
      acepta_promos: p.acepta_promos !== false,
      id_negocio: negocio.id,
      localidad: negocio.localidad,
      negocio_nombre: negocio.nombre || null,
      negocio_alias: negocio.alias || null,
      dia_especial_visto: p.dia_especial_visto || null,
      origen: "enlace_registro",
      id_registro_previo: p.lead_id || null,
      dispositivo: /Mobi|Android|iPhone/i.test(navigator.userAgent)
        ? "movil"
        : "pc",
      fecha_texto: fechaLima(),
      actualizado_en: serverTimestamp(),
    };
    if (!existe) payload.registrado_en = serverTimestamp();

    await setDoc(ref, payload, { merge: true });
    localStorage.removeItem(PEND_KEY(negocio.id));
    return true;
  } catch (e) {
    console.warn("registro pendiente: no se pudo guardar:", e.message);
    return false;
  }
}

/**
 * ctx = {
 *   auth, registradoDoc(localidad, negocioId, id), getUserData(uid), showToast,
 *   onDejarResena(),            // con sesión
 *   onNecesitaLogin(),          // sin sesión: abre el login con "volver"
 *   negocio: { id, localidad, nombre, logoSrc, alias?, diaEspecial?: { etiqueta, titulo } }
 * }
 */
export async function mostrarBienvenidaRegistro(ctx) {
  if (document.getElementById("regWelcome")) return;
  injectStyles();

  const {
    auth,
    registradoDoc,
    getUserData,
    showToast,
    onDejarResena,
    onNecesitaLogin,
    negocio,
  } = ctx;
  const user = auth.currentUser;

  let data = {};
  if (user) {
    try {
      data = (await getUserData(user.uid)) || {};
    } catch (e) {
      console.warn("registro: no se pudo leer el usuario:", e.message);
    }
  }
  const primerNombre = capitalizar(
    String(
      data.nombre ||
        data.nombre_user ||
        data.nombre_completo ||
        user?.displayName ||
        "",
    ).split(" ")[0],
  );

  const telCuenta = telDeCuenta(user, data);

  let previo = null;
  if (user) {
    try {
      const s = await getDoc(
        registradoDoc(negocio.localidad, negocio.id, user.uid),
      );
      if (s.exists()) previo = s.data();
    } catch (e) {
      console.warn("registro: no se pudo leer el registro previo:", e.message);
    }
  }

  // ── Pendiente del paso 1 (guardado antes de ir al login) ──
  let pend = null;
  if (user) {
    try {
      const p = JSON.parse(
        localStorage.getItem(PEND_KEY(negocio.id)) || "null",
      );
      if (p && p.paso === 2 && Date.now() - (p.ts || 0) <= PEND_TTL) pend = p;
    } catch {}
  }

  const telPrevio = limpiarTel(previo?.telefono || "");
  const telInicial = telValido(telPrevio) ? telPrevio : telCuenta;
  const gustosSel = new Set(
    pend?.gustos ?? (Array.isArray(previo?.gustos) ? previo.gustos : []),
  );
  const momentosSel = new Set(
    pend?.momentos ?? (Array.isArray(previo?.momentos) ? previo.momentos : []),
  );
  let promosOn = pend
    ? pend.acepta_promos !== false
    : previo
      ? previo.acepta_promos !== false
      : true;

  const bizNombre = negocio.nombre || "este negocio";
  const logoHTML = negocio.logoSrc
    ? `<img class="rw-logo" src="${esc(negocio.logoSrc)}" alt="">`
    : `<div class="rw-letter">${esc(bizNombre.trim().charAt(0).toUpperCase())}</div>`;
  const hoyHTML = negocio.diaEspecial?.titulo
    ? `<div class="rw-today">🎉 ${esc(negocio.diaEspecial.etiqueta || "Hoy")} · ${esc(negocio.diaEspecial.titulo)}</div>`
    : "";
  const hintTel = telInicial
    ? telInicial === telCuenta
      ? "De tu cuenta · puedes cambiarlo"
      : "Tu número guardado · puedes cambiarlo"
    : "Solo para avisarte de lo que te gusta";

  const ov = document.createElement("div");
  ov.id = "regWelcome";
  ov.className = "rw-overlay";
  ov.innerHTML = `
    <div class="rw-box" role="dialog" aria-modal="true" aria-label="Bienvenida">
      <div class="rw-grab"></div>
      <button class="rw-close" type="button" aria-label="Cerrar">✕</button>
      <div class="rw-progress"><i class="on" data-p="1"></i><i data-p="2"></i></div>

      <section class="rw-step" data-step="1">
        <div class="rw-head">
          ${logoHTML}
          <h3 class="rw-title">${primerNombre ? `Hola, ${esc(primerNombre)} 👋` : "¡Hola! 👋"}<br>Bienvenido a ${esc(bizNombre)}</h3>
        </div>
        <p class="rw-sub" style="margin-top:12px">Cuéntanos qué se te antoja y <b>te avisamos primero</b>.</p>
        ${hoyHTML}
        <div class="rw-label">Me interesa</div>
        <div class="rw-chips" id="rwGustos">${chipsHTML(GUSTOS, gustosSel)}</div>
        <div class="rw-label">Suelo pedir en</div>
        <div class="rw-chips sm" id="rwMomentos">${chipsHTML(MOMENTOS, momentosSel)}</div>
        <button class="rw-btn" id="rwNext" type="button">Continuar</button>
        <div class="rw-center"><button class="rw-ghost" id="rwSkip" type="button">Ahora no</button></div>
      </section>

      <section class="rw-step" data-step="2" hidden>
        <h3 class="rw-title" style="margin-bottom:6px">Último paso 🎯</h3>
        <p class="rw-sub">Deja tu celular para recibir lo que elegiste.</p>
        <label class="rw-field">
          <span>Tu celular</span>
          <div class="rw-phone" id="rwPhoneBox">
            <span class="rw-prefix">+51</span>
            <input class="rw-input" id="rwPhone" type="tel" inputmode="numeric" autocomplete="tel-national"
              maxlength="13" placeholder="987 654 321" value="${esc(fmtTel(telInicial))}">
            <span class="rw-tick">✓</span>
          </div>
          <small class="rw-hint">${hintTel}</small>
          <p class="rw-error" id="rwError"></p>
        </label>
        <button class="rw-switch" id="rwPromos" type="button" role="switch" aria-checked="${promosOn}">
          <span class="rw-knob"></span>
          <span>Avísame de <b>días especiales, combos y promos</b></span>
        </button>
        <button class="rw-btn" id="rwGo" type="button">Listo, dejar mi reseña ⭐</button>
        <div class="rw-row"><button class="rw-ghost" id="rwBack" type="button">‹ Atrás</button></div>
        <p class="rw-fine">Sin spam. Puedes cambiarlo cuando quieras.</p>
      </section>
    </div>`;
  document.body.appendChild(ov);

  const $ = (id) => ov.querySelector("#" + id);
  const vibrar = () => navigator.vibrate?.(8);

  const irPaso = (n) => {
    ov.querySelectorAll(".rw-step").forEach(
      (s) => (s.hidden = s.dataset.step !== String(n)),
    );
    ov.querySelector('[data-p="2"]').classList.toggle("on", n === 2);
    ov.querySelector(".rw-box").scrollTop = 0;
    if (n === 2)
      setTimeout(() => phoneInput.focus({ preventScroll: true }), 120);
  };

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

  const phoneInput = $("rwPhone");
  const phoneBox = $("rwPhoneBox");
  const errEl = $("rwError");
  const setErr = (m) => {
    errEl.textContent = m;
    errEl.style.display = m ? "block" : "none";
    phoneBox.classList.toggle("bad", !!m);
  };
  const syncPhone = () => {
    let d = phoneInput.value.replace(/\D/g, "");
    if (d.length > 9 && d.startsWith("51")) d = d.slice(2);
    d = d.slice(0, 9);
    phoneInput.value = fmtTel(d);
    phoneBox.classList.toggle("ok", telValido(d));
    return d;
  };
  phoneInput.addEventListener("input", () => {
    syncPhone();
    setErr("");
  });
  syncPhone();

  const sw = $("rwPromos");
  sw.addEventListener("click", () => {
    promosOn = !promosOn;
    sw.setAttribute("aria-checked", promosOn);
    vibrar();
  });

  const onKey = (e) => {
    if (e.key === "Escape") cerrar();
    if (e.key === "Enter" && !e.shiftKey && e.target.tagName !== "BUTTON") {
      e.preventDefault();
      ov.querySelector(".rw-step:not([hidden]) .rw-btn")?.click();
    }
  };
  const cerrar = () => {
    ov.classList.remove("open");
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKey);
    setTimeout(() => ov.remove(), 420);
  };
  document.addEventListener("keydown", onKey);
  ov.addEventListener("click", (e) => {
    if (e.target === ov) cerrar();
  });
  ov.querySelector(".rw-close").addEventListener("click", cerrar);
  $("rwSkip").addEventListener("click", cerrar);
  $("rwBack").addEventListener("click", () => irPaso(1));

  // ── CONTINUAR (paso 1): sin sesión NO pasa al paso 2, guarda y manda al login ──
  $("rwNext").addEventListener("click", () => {
    if (user) return irPaso(2);

    try {
      localStorage.setItem(
        PEND_KEY(negocio.id),
        JSON.stringify({
          paso: 2,
          gustos: [...gustosSel],
          momentos: [...momentosSel],
          acepta_promos: promosOn,
          dia_especial_visto: negocio.diaEspecial?.titulo || null,
          ts: Date.now(),
        }),
      );
    } catch {}
    showToast("Inicia sesión o regístrate para continuar");
    cerrar();
    if (typeof onNecesitaLogin === "function") setTimeout(onNecesitaLogin, 350);
  });

  // Cierre inmediato (sin animación) para pasar directo a la reseña
  const cerrarYa = () => {
    document.removeEventListener("keydown", onKey);
    ov.remove();
    document.body.style.overflow = "";
  };

  // ── GUARDAR (paso 2): aquí siempre hay sesión ──
  const goBtn = $("rwGo");
  let guardando = false;
  goBtn.addEventListener("click", async () => {
    if (guardando) return; // evita doble clic
    if (!user) {
      cerrar();
      if (typeof onNecesitaLogin === "function")
        setTimeout(onNecesitaLogin, 350);
      return;
    }

    const tel = limpiarTel(phoneInput.value);
    if (!telValido(tel)) {
      setErr("Escribe un celular válido de 9 dígitos que empiece con 9");
      phoneInput.focus();
      return;
    }
    setErr("");
    guardando = true;
    goBtn.disabled = true;
    goBtn.textContent = "Guardando…";

    try {
      const payload = {
        id_usuario: user.uid,
        id_registro: user.uid,
        tiene_cuenta: true,
        correo: user.email || null,
        nombre: primerNombre || null,
        nombre_completo: data.nombre_completo || null,
        telefono: tel,
        telefono_origen: tel === telCuenta ? "cuenta" : "editado",
        telefono_cuenta: telCuenta || null,
        gustos: [...gustosSel],
        momentos: [...momentosSel],
        acepta_promos: promosOn,
        id_negocio: negocio.id,
        localidad: negocio.localidad,
        negocio_nombre: negocio.nombre || null,
        negocio_alias: negocio.alias || null,
        dia_especial_visto:
          negocio.diaEspecial?.titulo || pend?.dia_especial_visto || null,
        origen: "enlace_registro",
        dispositivo: /Mobi|Android|iPhone/i.test(navigator.userAgent)
          ? "movil"
          : "pc",
        fecha_texto: fechaLima(),
        actualizado_en: serverTimestamp(),
      };
      if (!previo) payload.registrado_en = serverTimestamp();

      await setDoc(
        registradoDoc(negocio.localidad, negocio.id, user.uid),
        payload,
        { merge: true },
      );
      try {
        localStorage.removeItem(PEND_KEY(negocio.id));
      } catch {}

      showToast(
        promosOn
          ? "¡Listo! Te avisaremos de lo mejor 🔔"
          : "¡Gracias por registrarte! ✅",
      );
    } catch (e) {
      console.warn("registro: no se pudo guardar:", e.message);
    }

    // Cierra YA y abre la reseña en el mismo instante
    cerrarYa();
    setTimeout(onDejarResena, 0);
  });
  void ov.offsetHeight;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => ov.classList.add("open")),
  );
  document.body.style.overflow = "hidden";

  // Volvió del login con el paso 1 ya hecho → abre directo en "Último paso"
  if (pend) irPaso(2);
}
