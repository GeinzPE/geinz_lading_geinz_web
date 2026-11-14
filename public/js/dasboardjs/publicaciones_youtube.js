import { setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { tiendaSubDoc } from "../rutas/rutas.js";

const YT_CLIENT_ID = 
  "921389328767-gt62dnnieaan28buhfknvl27fn303oes.apps.googleusercontent.com.apps.googleusercontent.com";
const YT_SCOPES =
  "https://www.googleapis.com/auth/youtube.upload openid email profile";
const YT_SCOPE_UPLOAD = "https://www.googleapis.com/auth/youtube.upload";
const YT_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const YT_TITLE_MAX = 100;
const YT_DESC_MAX = 5000;
const YT_CATEGORY_ID = "22";

const st = {
  activo: false,
  file: null,
  objectUrl: null,
  duracion: 0,
  token: null,
  tokenExp: 0,
  cuenta: null,
  subiendo: false,
  xhr: null,
};

let _gisPromise = null;

const $ = (id) => document.getElementById(id);

const SM_MS = 320;
const SM_TR =
  "max-height .32s ease, opacity .25s ease, margin .32s ease, padding .32s ease, border-width .32s ease";
const SM_PROPS = [
  "maxHeight",
  "opacity",
  "marginTop",
  "marginBottom",
  "paddingTop",
  "paddingBottom",
  "borderTopWidth",
  "borderBottomWidth",
];
const sinAnim = () =>
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function _smLimpiar(el) {
  SM_PROPS.forEach((p) => (el.style[p] = ""));
  el.style.overflow = el.dataset.smOv || "";
  el.style.boxSizing = "";
  el.style.transition = "";
}
function _smGap(el) {
  const g = parseFloat(
    getComputedStyle(el.parentElement || document.body).rowGap,
  );
  return isNaN(g) ? 0 : g;
}
function _smColapsado(el) {
  el.style.maxHeight = "0px";
  el.style.opacity = "0";
  el.style.marginTop = -_smGap(el) + "px"; // neutraliza el "gap" del contenedor
  el.style.marginBottom = "0px";
  el.style.paddingTop = "0px";
  el.style.paddingBottom = "0px";
  el.style.borderTopWidth = "0px";
  el.style.borderBottomWidth = "0px";
}

function suaveOcultar(el) {
  if (!el) return;
  if (el.dataset.smOv === undefined) el.dataset.smOv = el.style.overflow || "";
  if (el.dataset.sm === "oculto" && el.style.display === "none") return;
  clearTimeout(el._smT);
  if (getComputedStyle(el).display === "none" || sinAnim()) {
    _smLimpiar(el);
    el.style.display = "none";
    el.dataset.sm = "oculto";
    return;
  }
  if (el.dataset.sm === "oculto") return; // ya se está cerrando
  el.dataset.sm = "oculto";
  el.style.boxSizing = "border-box";
  el.style.overflow = "hidden";
  el.style.transition = "none";
  el.style.maxHeight = el.offsetHeight + "px";
  void el.offsetHeight; // fija el punto de partida
  el.style.transition = SM_TR;
  _smColapsado(el);
  el._smT = setTimeout(() => {
    el.style.display = "none";
  }, SM_MS + 40);
}

function suaveMostrar(el, disp = "") {
  if (!el) return;
  if (el.dataset.smOv === undefined) el.dataset.smOv = el.style.overflow || "";
  const oculto =
    getComputedStyle(el).display === "none" || el.dataset.sm === "oculto";
  if (!oculto) return;
  clearTimeout(el._smT);
  el.dataset.sm = "visible";
  if (sinAnim()) {
    _smLimpiar(el);
    el.style.display = disp;
    return;
  }
  el.style.transition = "none";
  _smLimpiar(el);
  el.style.display = disp;
  const alto = el.offsetHeight; // altura natural
  el.style.boxSizing = "border-box";
  el.style.overflow = "hidden";
  _smColapsado(el);
  void el.offsetHeight;
  el.style.transition = SM_TR;
  el.style.maxHeight = alto + "px";
  [
    "opacity",
    "marginTop",
    "marginBottom",
    "paddingTop",
    "paddingBottom",
    "borderTopWidth",
    "borderBottomWidth",
  ].forEach((p) => (el.style[p] = ""));
  el._smT = setTimeout(() => _smLimpiar(el), SM_MS + 40);
}

function suaveAlternar(el, visible, disp = "") {
  visible ? suaveMostrar(el, disp) : suaveOcultar(el);
}
window.suaveAlternar = suaveAlternar;

// Cambia un texto con un fundido corto
function cambiarTexto(el, txt) {
  if (!el || el.textContent === txt) return;
  if (sinAnim()) {
    el.textContent = txt;
    return;
  }
  el.style.transition = "opacity .15s ease";
  el.style.opacity = "0";
  setTimeout(() => {
    el.textContent = txt;
    el.style.opacity = "";
  }, 160);
}

const toast = (m, t = "success") => window.mostrarToast?.(m, t);

// ══════════════════════════════════════════════════════════════════════
//  ESTILOS
// ══════════════════════════════════════════════════════════════════════
(function estilos() {
  const s = document.createElement("style");
  s.textContent = `
    .yt-oculto { display: none !important; }

    /* Zona de selección de video */
    .yt-drop {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 6px; text-align: center; min-height: 170px; padding: 20px 16px;
      border: 2px dashed rgba(255,255,255,.18); border-radius: 18px;
      background: rgba(255,255,255,.03); color: #a1a1aa; cursor: pointer;
      transition: border-color .2s, background .2s;
    }
    .yt-drop:hover, .yt-drop.over { border-color: #ef4444; background: rgba(239,68,68,.07); }
    .yt-drop i { font-size: 34px; color: #ef4444; }
    .yt-drop b { color: #fff; font-size: 14px; }
    .yt-drop small { font-size: 11.5px; line-height: 1.4; }

    /* Vista previa */
    .yt-preview { display: flex; flex-direction: column; gap: 10px; }
    .yt-preview[hidden], .yt-drop[hidden] { display: none; }
    .yt-preview video {
      width: 100%; max-height: 360px; background: #000;
      border-radius: 16px; display: block; object-fit: contain;
    }
    .yt-file-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .yt-file-info { min-width: 0; display: flex; flex-direction: column; }
    .yt-file-info b {
      color: #fff; font-size: 13px; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }
    .yt-file-info small { color: #8b869b; font-size: 11.5px; }
    .yt-x {
      flex-shrink: 0; border: 1px solid rgba(255,255,255,.12);
      background: rgba(255,255,255,.05); color: #fca5a5;
      border-radius: 10px; padding: 7px 12px; font-size: 12px;
      font-weight: 600; cursor: pointer;
    }
    .yt-x:hover { background: rgba(225,29,72,.8); color: #fff; }
    .yt-count { font-size: 11px; color: #71717a; margin: 8px 2px 0; }
    .yt-count.err { color: #f87171; }

    /* Configuración (columna derecha) */
    .yt-config { display: flex; flex-direction: column; gap: 12px; margin-bottom: 18px; }
    .yt-box {
      background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.08);
      border-radius: 16px; padding: 14px 16px;
    }
    .yt-box h4 { margin: 0 0 4px; font-size: 13.5px; font-weight: 700; color: #fff;
      display: flex; align-items: center; gap: 8px; }
    .yt-box h4 i { color: #ef4444; font-size: 18px; }
    .yt-box p { margin: 0 0 10px; font-size: 12px; color: #8b869b; line-height: 1.5; }
    .yt-acc-row { display: flex; align-items: center; justify-content: space-between;
      gap: 10px; flex-wrap: wrap; }
    .yt-acc-name { min-width: 0; font-size: 12.5px; color: #d4d4d8; word-break: break-all; }
    .yt-acc-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .yt-mini {
      border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.05);
      color: #e4e4e7; border-radius: 10px; padding: 7px 12px;
      font-size: 12px; font-weight: 600; cursor: pointer;
    }
    .yt-mini:hover { background: rgba(255,255,255,.1); }
    .yt-mini:disabled { opacity: .5; cursor: wait; }
    .yt-box select {
      width: 100%; background: var(--bg-input, #1e1e2a); color: #f0f0f0;
      border: 1px solid rgba(255,255,255,.12); border-radius: 10px;
      padding: 10px 12px; font-size: 14px;
    }
    .yt-radios { display: flex; flex-direction: column; gap: 8px; }
    .yt-radio {
      display: flex; align-items: flex-start; gap: 10px; cursor: pointer;
      font-size: 12.5px; color: #d1d5db; line-height: 1.4;
    }
    .yt-radio input { accent-color: #ef4444; margin-top: 2px; flex-shrink: 0; }
    .yt-legal { font-size: 11px; color: #71717a; line-height: 1.5; margin: 0; }
    .yt-legal a { color: #a78bfa; text-decoration: underline; }

    /* Overlay de progreso / resultado */
    .yt-ov {
      position: fixed; inset: 0; z-index: 9998; padding: 20px;
      background: rgba(7,6,10,.92);
      display: flex; align-items: center; justify-content: center;
      animation: ytFade .25s ease;
    }
    .yt-card {
      width: 100%; max-width: 400px; background: #101017;
      border: 1px solid rgba(255,255,255,.07); border-radius: 24px;
      padding: 26px 22px 22px; color: #fff;
      box-shadow: 0 30px 70px -20px rgba(0,0,0,.65);
      max-height: 92vh; overflow-y: auto;
      animation: ytPop .3s ease;
    }
    .yt-card h2 { margin: 0 0 4px; font-size: 18px; font-weight: 700; }
    .yt-card .yt-sub { margin: 0 0 18px; font-size: 12.5px; color: #8b869b; line-height: 1.5; }
    .yt-bar { height: 6px; border-radius: 99px; background: rgba(255,255,255,.06);
      overflow: hidden; margin-bottom: 10px; }
    .yt-bar > div { height: 100%; width: 0; border-radius: 99px;
      background: linear-gradient(90deg, #ef4444, #f97316); transition: width .25s ease; }
    .yt-bar.ok > div { background: linear-gradient(90deg, #22c55e, #4ade80); }
    .yt-stats { display: flex; justify-content: space-between; font-size: 12px;
      color: #a1a1aa; margin-bottom: 18px; }
    .yt-btn {
      width: 100%; height: 48px; border: none; border-radius: 14px;
      font-size: 14px; font-weight: 650; cursor: pointer; margin-top: 8px;
      background: linear-gradient(135deg, #8b5cf6, #6d28d9); color: #fff;
    }
    .yt-btn.sec { background: rgba(255,255,255,.07); color: #e4e4e7; }
    .yt-btn.red { background: rgba(239,68,68,.15); color: #fca5a5; }
    .yt-url {
      display: flex; align-items: center; gap: 8px; background: #17151f;
      border: 1px solid rgba(255,255,255,.06); border-radius: 12px;
      padding: 10px 12px; margin-bottom: 8px;
    }
    .yt-url span { flex: 1; min-width: 0; font-size: 11.5px; color: #a29cb5;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    @media (max-width: 480px) {
      .yt-drop { min-height: 150px; }
      .yt-card { padding: 22px 16px 18px; border-radius: 20px; }
    }

    /* Animaciones baratas: solo opacity/transform (funcionan en celulares viejos) */
    @keyframes ytFade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes ytPop  { from { opacity: 0; transform: translateY(10px) scale(.97); }
                        to   { opacity: 1; transform: none; } }
    .yt-mini, #ytConectar, #ytOvAcciones > * { animation: ytFade .3s ease; }
    .yt-radio, .yt-drop, .yt-x { transition: background .2s, border-color .2s, opacity .2s; }
    @media (prefers-reduced-motion: reduce) {
      .yt-ov, .yt-card, .yt-mini, #ytConectar, #ytOvAcciones > * { animation: none !important; }
      .yt-bar > div { transition: none; }
    }
  `;
  document.head.appendChild(s);
})();

// ══════════════════════════════════════════════════════════════════════
//  UI (se inyecta una sola vez; queda oculta hasta elegir "YouTube")
// ══════════════════════════════════════════════════════════════════════
(function inyectarUI() {
  // ── Columna izquierda: selector de video ──
  const bloqueImgs = $("imageGridSelector")?.closest(".ig");
  const bloqueVideo = document.createElement("div");
  bloqueVideo.className = "ig";
  bloqueVideo.style.display = "none";
  bloqueVideo.id = "ytVideoBlock";
  bloqueVideo.innerHTML = `
    <label class="lbl">Video para YouTube</label>
    <label class="yt-drop" id="ytDrop" for="ytFileInput">
      <i class="ti ti-video-plus" aria-hidden="true"></i>
      <b>Toca para elegir un video</b>
      <small>o arrástralo aquí · MP4, MOV, WebM · máx. 2 GB</small>
    </label>
    <input type="file" id="ytFileInput" accept="video/*" hidden>
    <div class="yt-preview" id="ytPreview" style="display:none">
      <video id="ytVideoEl" controls playsinline preload="metadata"></video>
      <div class="yt-file-row">
        <div class="yt-file-info">
          <b id="ytFileName"></b>
          <small id="ytFileMeta"></small>
        </div>
        <button type="button" class="yt-x" id="ytQuitar">Quitar</button>
      </div>
    </div>
    <p class="yt-count" id="ytCount"></p>`;
  if (bloqueImgs)
    bloqueImgs.parentElement.insertBefore(bloqueVideo, bloqueImgs);

  // ── Columna derecha: cuenta + opciones ──
  const config = document.createElement("div");
  config.className = "yt-config";
  config.style.display = "none";
  config.id = "ytConfigBlock";
  config.innerHTML = `
    <div class="yt-box">
      <h4><i class="ti ti-brand-youtube" aria-hidden="true"></i> Canal de YouTube</h4>
      <p id="ytAccText">Conecta tu cuenta de Google para subir videos a tu canal.</p>
      <div class="yt-acc-row">
        <span class="yt-acc-name" id="ytAccName"></span>
        <div class="yt-acc-actions">
          <button type="button" class="btn" id="ytConectar" style="padding:8px 16px;font-size:13px">Conectar</button>
          <button type="button" class="yt-mini yt-oculto" id="ytCambiar">Cambiar cuenta</button>
          <button type="button" class="yt-mini yt-oculto" id="ytDesconectar">Desconectar</button>
        </div>
      </div>
    </div>

    <div class="yt-box">
      <h4>Visibilidad</h4>
      <select id="ytPrivacidad">
        <option value="public">Público</option>
        <option value="unlisted">No listado (solo con el link)</option>
        <option value="private">Privado</option>
      </select>
    </div>

    <div class="yt-box">
      <h4>Público infantil</h4>
      <p>YouTube exige que indiques si el video está hecho para niños.</p>
      <div class="yt-radios">
        <label class="yt-radio"><input type="radio" name="ytKids" value="si"> Sí, está hecho para niños</label>
        <label class="yt-radio"><input type="radio" name="ytKids" value="no"> No, no está hecho para niños</label>
      </div>
    </div>

    <p class="yt-legal">
      Al subir tu video aceptas las
      <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener">Condiciones del servicio de YouTube</a>
      y la
      <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Política de privacidad de Google</a>.
      Geinz solo usa el permiso para subir los videos que tú elijas y no accede a tus demás datos de YouTube.
      Puedes revocar el acceso en
      <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">tu cuenta de Google</a>.
    </p>`;
  const selector = $("tipoPubSelector");
  if (selector) selector.insertAdjacentElement("afterend", config);

  // ── Eventos ──
  const input = $("ytFileInput");
  input.addEventListener("change", () => {
    if (input.files[0]) elegirVideo(input.files[0]);
    input.value = "";
  });
  const drop = $("ytDrop");
  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add("over");
    }),
  );
  ["dragleave", "drop"].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.remove("over");
    }),
  );
  drop.addEventListener("drop", (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (f) elegirVideo(f);
  });
  $("ytQuitar").addEventListener("click", quitarVideo);
  $("ytConectar").addEventListener("click", () => conectar(""));
  $("ytCambiar").addEventListener("click", () => conectar("select_account"));
  $("ytDesconectar").addEventListener("click", desconectar);
  document
    .querySelectorAll('input[name="ytKids"]')
    .forEach((r) => r.addEventListener("change", notificarCambio));
  ["tituloInput", "descripcionInput"].forEach((id) =>
    $(id)?.addEventListener("input", () => st.activo && actualizarContadores()),
  );

  // Precarga el SDK de Google para que el popup de login no se bloquee
  cargarGIS().catch(() => {});
})();

// Avisa a publicaciones.js para que reevalúe el botón "Publicar"
// (validate() corre con cualquier evento "input" del título)
function notificarCambio() {
  $("tituloInput")?.dispatchEvent(new Event("input", { bubbles: true }));
}

// ══════════════════════════════════════════════════════════════════════
//  ACTIVAR / DESACTIVAR EL MODO (lo llama aplicarTipoPublicacionUI)
// ══════════════════════════════════════════════════════════════════════
window.ytAplicarModo = function (activo) {
  const cambio = st.activo !== !!activo;
  st.activo = !!activo;

  // Las zonas de IA las maneja validate() de publicaciones.js
  suaveAlternar($("imageGridSelector")?.closest(".ig"), !st.activo);
  suaveAlternar(document.querySelector(".param-list"), !st.activo);
  suaveAlternar($("ytVideoBlock"), st.activo);
  suaveAlternar($("ytConfigBlock"), st.activo);

  // Encabezados de la columna derecha (con fundido)
  const col2 = document.querySelector(".grid > .col:nth-child(2)");
  const h3 = col2?.querySelector(".sec-title");
  const sub = col2?.querySelector(".sec-sub");
  if (h3 && !h3.dataset.orig) h3.dataset.orig = h3.textContent;
  if (sub && !sub.dataset.orig) sub.dataset.orig = sub.textContent;
  cambiarTexto(h3, st.activo ? "Publicación en YouTube" : h3?.dataset.orig);
  cambiarTexto(
    sub,
    st.activo
      ? "Tu video se sube directo a tu canal. No se publica en tu perfil de Geinz."
      : sub?.dataset.orig,
  );

  // Encabezado principal
  const hp = document.querySelector(".hdr-left p");
  if (hp && !hp.dataset.orig) hp.dataset.orig = hp.textContent;
  cambiarTexto(
    hp,
    st.activo
      ? "Sube un video con título y descripción a tu canal de YouTube"
      : hp?.dataset.orig,
  );

  // Título y descripción
  const t = $("tituloInput");
  const d = $("descripcionInput");
  if (t && d) {
    if (!t.dataset.ph) {
      t.dataset.ph = t.placeholder;
      d.dataset.ph = d.placeholder;
    }
    if (st.activo) {
      t.placeholder = "Título del video";
      d.placeholder = "Descripción del video";
      t.maxLength = YT_TITLE_MAX;
      d.maxLength = YT_DESC_MAX;
    } else {
      t.placeholder = t.dataset.ph;
      d.placeholder = d.dataset.ph;
      t.removeAttribute("maxlength");
      d.removeAttribute("maxlength");
    }
  }
  actualizarContadores();
  if (cambio) notificarCambio(); // validate() muestra/oculta las zonas de IA
};

// ══════════════════════════════════════════════════════════════════════
//  VIDEO: selección, vista previa y validación
// ══════════════════════════════════════════════════════════════════════
function fmtBytes(b) {
  if (b >= 1024 ** 3) return (b / 1024 ** 3).toFixed(2) + " GB";
  return (b / 1024 ** 2).toFixed(1) + " MB";
}
function fmtDur(s) {
  if (!isFinite(s) || s <= 0) return "";
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, "0")} min`;
}

function elegirVideo(file) {
  if (!file.type.startsWith("video/")) {
    toast("El archivo debe ser un video", "error");
    return;
  }
  if (file.size > YT_MAX_BYTES) {
    toast(`El video pesa ${fmtBytes(file.size)}. Máximo 2 GB.`, "error");
    return;
  }
  quitarVideo(false);
  st.file = file;
  st.objectUrl = URL.createObjectURL(file);
  const v = $("ytVideoEl");
  v.src = st.objectUrl;
  v.onloadedmetadata = () => {
    st.duracion = v.duration || 0;
    $("ytFileMeta").textContent =
      `${fmtBytes(file.size)}${st.duracion ? " · " + fmtDur(st.duracion) : ""}`;
  };
  $("ytFileName").textContent = file.name;
  $("ytFileMeta").textContent = fmtBytes(file.size);
  suaveAlternar($("ytDrop"), false);
  suaveAlternar($("ytPreview"), true);
  notificarCambio();
}

function quitarVideo(notificar = true) {
  if (st.subiendo) return;
  const habia = !!st.file;
  if (st.objectUrl) URL.revokeObjectURL(st.objectUrl);
  st.file = null;
  st.objectUrl = null;
  st.duracion = 0;
  const v = $("ytVideoEl");
  if (v) {
    v.pause?.();
    v.removeAttribute("src");
    v.load?.();
  }
  if (habia) {
    suaveAlternar($("ytPreview"), false);
    suaveAlternar($("ytDrop"), true);
  }
  if (notificar === true) notificarCambio();
}

function actualizarContadores() {
  const el = $("ytCount");
  if (!el) return;
  if (!st.activo) {
    el.textContent = "";
    return;
  }
  const t = $("tituloInput")?.value.length || 0;
  const d = $("descripcionInput")?.value.length || 0;
  el.textContent = `Título ${t}/${YT_TITLE_MAX} · Descripción ${d}/${YT_DESC_MAX}`;
}

// ══════════════════════════════════════════════════════════════════════
//  GOOGLE OAUTH (Google Identity Services)
// ══════════════════════════════════════════════════════════════════════
function cargarGIS() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (_gisPromise) return _gisPromise;
  _gisPromise = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => res();
    s.onerror = () => {
      _gisPromise = null;
      rej(new Error("No se pudo cargar Google. Revisa tu conexión."));
    };
    document.head.appendChild(s);
  });
  return _gisPromise;
}

function tokenVigente() {
  return !!st.token && Date.now() < st.tokenExp;
}

function pedirToken(prompt = "") {
  return new Promise(async (resolve, reject) => {
    try {
      await cargarGIS();
    } catch (e) {
      return reject(e);
    }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: YT_CLIENT_ID,
      scope: YT_SCOPES,
      prompt,
      callback: (r) => {
        if (r.error)
          return reject(
            new Error(r.error_description || "No se pudo autorizar"),
          );
        // Consentimiento granular: el usuario puede desmarcar permisos
        if (!google.accounts.oauth2.hasGrantedAllScopes(r, YT_SCOPE_UPLOAD))
          return reject(
            new Error("Debes permitir subir videos a YouTube para continuar"),
          );
        st.token = r.access_token;
        st.tokenExp = Date.now() + (Number(r.expires_in) - 60) * 1000;
        resolve(r.access_token);
      },
      error_callback: (e) =>
        reject(
          new Error(
            e?.type === "popup_closed"
              ? "Cerraste la ventana de Google"
              : e?.type === "popup_failed_to_open"
                ? "El navegador bloqueó la ventana de Google"
                : "No se pudo autorizar con Google",
          ),
        ),
    });
    client.requestAccessToken();
  });
}

async function cargarCuenta() {
  try {
    const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${st.token}` },
    });
    const j = await r.json();
    st.cuenta = { name: j.name || "", email: j.email || "" };
  } catch {
    st.cuenta = { name: "Cuenta de Google", email: "" };
  }
}

function pintarCuenta() {
  const ok = !!st.cuenta;
  $("ytConectar")?.classList.toggle("yt-oculto", ok);
  $("ytCambiar")?.classList.toggle("yt-oculto", !ok);
  $("ytDesconectar")?.classList.toggle("yt-oculto", !ok);
  const n = $("ytAccName");
  if (n)
    n.textContent = ok
      ? `Conectado: ${st.cuenta.name}${st.cuenta.email ? " (" + st.cuenta.email + ")" : ""}`
      : "";
  const t = $("ytAccText");
  if (t)
    t.textContent = ok
      ? "El video se subirá al canal de esta cuenta de Google."
      : "Conecta tu cuenta de Google para subir videos a tu canal.";
  notificarCambio();
}

async function conectar(prompt) {
  const botones = ["ytConectar", "ytCambiar"].map($);
  botones.forEach((b) => b && (b.disabled = true));
  const c = $("ytConectar");
  const orig = c?.innerHTML;
  if (c) c.innerHTML = "Conectando...";
  try {
    await pedirToken(prompt);
    await cargarCuenta();
    pintarCuenta();
    toast("✅ Cuenta de YouTube conectada");
  } catch (e) {
    toast(e.message || "No se pudo conectar", "error");
  } finally {
    botones.forEach((b) => b && (b.disabled = false));
    if (c && orig) c.innerHTML = orig;
  }
}

function desconectar() {
  if (st.subiendo) return;
  try {
    if (st.token) google.accounts.oauth2.revoke(st.token, () => {});
  } catch {}
  st.token = null;
  st.tokenExp = 0;
  st.cuenta = null;
  pintarCuenta();
  toast("Cuenta desconectada");
}

// ══════════════════════════════════════════════════════════════════════
//  ¿ESTÁ TODO LISTO PARA PUBLICAR? (lo usa actualizarEstadoBotonPublicar)
// ══════════════════════════════════════════════════════════════════════
window.ytListoParaPublicar = function (titulo, terminosOk) {
  const desc = $("descripcionInput")?.value.trim() || "";
  const kids = document.querySelector('input[name="ytKids"]:checked');
  return (
    !!st.file &&
    !!st.cuenta &&
    (titulo || "").length >= 4 &&
    desc.length >= 10 &&
    !!kids &&
    !!terminosOk &&
    !st.subiendo
  );
};

// ══════════════════════════════════════════════════════════════════════
//  SUBIDA RESUMABLE A YOUTUBE
// ══════════════════════════════════════════════════════════════════════
function errorYouTube(xhr) {
  let reason = "";
  let msg = "";
  try {
    const j = JSON.parse(xhr.responseText);
    reason = j?.error?.errors?.[0]?.reason || "";
    msg = j?.error?.message || "";
  } catch {}
  const mapa = {
    quotaExceeded:
      "Se agotó la cuota diaria de la API de YouTube. Intenta mañana.",
    uploadLimitExceeded:
      "Esta cuenta alcanzó su límite de subidas de YouTube por hoy.",
    youtubeSignupRequired:
      "Esta cuenta de Google no tiene un canal de YouTube. Crea uno e intenta de nuevo.",
    forbidden: "YouTube no permitió esta subida con la cuenta conectada.",
    insufficientPermissions:
      "Falta el permiso para subir videos. Reconecta tu cuenta.",
    authError: "La sesión de Google expiró. Reconecta tu cuenta.",
    invalidTitle: "YouTube rechazó el título del video.",
    invalidDescription: "YouTube rechazó la descripción del video.",
    videoTooLong: "El video excede la duración permitida para tu canal.",
  };
  if (xhr.status === 401) return new Error(mapa.authError);
  return new Error(
    mapa[reason] || msg || `Error de YouTube (HTTP ${xhr.status})`,
  );
}

function abrirSesion(token, file, meta) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open(
      "POST",
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    );
    x.setRequestHeader("Authorization", `Bearer ${token}`);
    x.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
    x.setRequestHeader("X-Upload-Content-Length", String(file.size));
    x.setRequestHeader("X-Upload-Content-Type", file.type || "video/*");
    x.onload = () => {
      if (x.status === 200) {
        const loc = x.getResponseHeader("Location");
        loc
          ? resolve(loc)
          : reject(new Error("YouTube no devolvió la URL de subida"));
      } else reject(errorYouTube(x));
    };
    x.onerror = () => reject(new Error("Sin conexión con YouTube"));
    x.send(JSON.stringify(meta));
  });
}

function subirArchivo(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    st.xhr = x;
    x.open("PUT", url);
    x.setRequestHeader("Content-Type", file.type || "video/*");
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    x.onload = () => {
      st.xhr = null;
      if (x.status === 200 || x.status === 201) {
        try {
          resolve(JSON.parse(x.responseText));
        } catch {
          reject(new Error("Respuesta inválida de YouTube"));
        }
      } else reject(errorYouTube(x));
    };
    x.onerror = () => {
      st.xhr = null;
      reject(new Error("Se perdió la conexión durante la subida"));
    };
    x.onabort = () => {
      st.xhr = null;
      reject(new Error("__cancelado__"));
    };
    x.send(file);
  });
}

// ── Overlay de progreso ──
function abrirOverlayProgreso() {
  $("ytOverlay")?.remove();
  const ov = document.createElement("div");
  ov.className = "yt-ov";
  ov.id = "ytOverlay";
  ov.innerHTML = `
    <div class="yt-card">
      <h2 id="ytOvTitulo">Subiendo a YouTube</h2>
      <p class="yt-sub" id="ytOvSub">No cierres esta pestaña hasta que termine.</p>
      <div class="yt-bar" id="ytBar"><div id="ytBarFill"></div></div>
      <div class="yt-stats"><span id="ytOvPct">0%</span><span id="ytOvMb"></span></div>
      <div id="ytOvAcciones">
        <button type="button" class="yt-btn red" id="ytCancelar">Cancelar subida</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  $("ytCancelar").addEventListener("click", () => st.xhr?.abort());
}

function progreso(loaded, total) {
  const p = Math.min(100, Math.round((loaded / total) * 100));
  $("ytBarFill").style.width = p + "%";
  $("ytOvPct").textContent = p + "%";
  $("ytOvMb").textContent = `${fmtBytes(loaded)} / ${fmtBytes(total)}`;
}

function mostrarResultado(videoId, privacidadReal, privacidadPedida) {
  const url = `https://youtu.be/${videoId}`;
  $("ytBar").classList.add("ok");
  $("ytBarFill").style.width = "100%";
  $("ytOvTitulo").textContent = "¡Video subido!";
  const forzado = privacidadReal && privacidadReal !== privacidadPedida;
  $("ytOvSub").textContent = forzado
    ? "YouTube lo dejó como privado mientras revisa o procesa el video. Puedes cambiar su visibilidad en YouTube Studio."
    : "Ya está en tu canal. YouTube puede tardar unos minutos en terminar de procesarlo.";
  $("ytOvPct").textContent = "100%";
  $("ytOvAcciones").innerHTML = `
    <div class="yt-url"><span>${url}</span>
      <button type="button" class="yt-mini" id="ytCopiar">Copiar</button></div>
    <button type="button" class="yt-btn" id="ytVer">Ver en YouTube</button>
    <button type="button" class="yt-btn sec" id="ytCerrar">Listo</button>`;
  $("ytCopiar").addEventListener("click", () => {
    navigator.clipboard?.writeText(url);
    $("ytCopiar").textContent = "Copiado";
  });
  $("ytVer").addEventListener("click", () =>
    window.open(url, "_blank", "noopener"),
  );
  $("ytCerrar").addEventListener("click", () => $("ytOverlay")?.remove());
}

// ══════════════════════════════════════════════════════════════════════
//  PUBLICAR (la llama publicarPromocion cuando el modo es YouTube)
// ══════════════════════════════════════════════════════════════════════
window.publicarEnYoutube = async function (datosTienda) {
  if (st.subiendo) return;

  const titulo = $("tituloInput")?.value.trim() || "";
  const descripcion = $("descripcionInput")?.value.trim() || "";
  const privacidad = $("ytPrivacidad")?.value || "public";
  const kids = document.querySelector('input[name="ytKids"]:checked')?.value;

  // ── Validaciones ──
  if (!st.file) return toast("Selecciona un video", "error");
  if (titulo.length < 4) return toast("El título es muy corto", "error");
  if (titulo.length > YT_TITLE_MAX)
    return toast(
      `El título no puede pasar de ${YT_TITLE_MAX} caracteres`,
      "error",
    );
  if (descripcion.length < 10)
    return toast("Escribe una descripción de al menos 10 caracteres", "error");
  if (descripcion.length > YT_DESC_MAX)
    return toast(
      `La descripción no puede pasar de ${YT_DESC_MAX} caracteres`,
      "error",
    );
  if (/[<>]/.test(titulo) || /[<>]/.test(descripcion))
    return toast("YouTube no permite los símbolos < y > en el texto", "error");
  if (!kids) return toast("Indica si el video es para niños", "error");

  st.subiendo = true;
  const btn = document.querySelector(".btn-submit");
  if (btn) btn.disabled = true;
  const bloquear = (e) => {
    e.preventDefault();
    e.returnValue = "";
  };
  window.addEventListener("beforeunload", bloquear);

  try {
    // El token se pide primero (aún dentro del gesto del usuario)
    if (!tokenVigente()) await pedirToken("");
    abrirOverlayProgreso();

    const meta = {
      snippet: {
        title: titulo,
        description: descripcion,
        categoryId: YT_CATEGORY_ID,
      },
      status: {
        privacyStatus: privacidad,
        selfDeclaredMadeForKids: kids === "si",
        embeddable: true,
      },
    };

    const urlSesion = await abrirSesion(st.token, st.file, meta);
    const video = await subirArchivo(urlSesion, st.file, progreso);

    const videoId = video?.id;
    if (!videoId) throw new Error("YouTube no devolvió el ID del video");

    // Registro en Firestore (no crítico: si falla, el video igual quedó subido)
    try {
      const id_tienda = datosTienda?.id_tienda;
      const localidad = datosTienda?.localidad;
      if (id_tienda && localidad) {
        await setDoc(
          tiendaSubDoc(
            localidad,
            "tiendas",
            id_tienda,
            "youtube_videos",
            videoId,
          ),
          {
            video_id: videoId,
            url: `https://youtu.be/${videoId}`,
            titulo,
            descripcion,
            privacidad_pedida: privacidad,
            privacidad_real: video?.status?.privacyStatus || privacidad,
            para_ninos: kids === "si",
            cuenta: st.cuenta?.email || "",
            creado: new Date(),
          },
        );
      }
    } catch (e) {
      console.warn("⚠️ No se pudo registrar el video en Firestore:", e);
    }

    mostrarResultado(videoId, video?.status?.privacyStatus, privacidad);
    limpiarTrasSubir();
  } catch (err) {
    $("ytOverlay")?.remove();
    if (err.message === "__cancelado__") toast("Subida cancelada", "error");
    else {
      console.error("❌ YouTube:", err);
      toast(err.message || "No se pudo subir el video", "error");
      // Token vencido o revocado: obliga a reconectar
      if (/expir|Reconecta/i.test(err.message || "")) {
        st.token = null;
        st.tokenExp = 0;
      }
    }
  } finally {
    st.subiendo = false;
    window.removeEventListener("beforeunload", bloquear);
    notificarCambio();
  }
};

function limpiarTrasSubir() {
  quitarVideo(false);
  $("tituloInput").value = "";
  $("descripcionInput").value = "";
  document
    .querySelectorAll('input[name="ytKids"]')
    .forEach((r) => (r.checked = false));
  const tc = $("terminosCheck");
  if (tc) {
    tc.checked = false;
    tc.dispatchEvent(new Event("change")); // actualiza terminosAceptados
  }
  actualizarContadores();
}
