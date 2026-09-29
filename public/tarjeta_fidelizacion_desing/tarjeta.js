/* ==========================================================================
   Componente: Tarjeta de Fidelización
   Uso desde cualquier HTML:

     <div id="miTarjeta"></div>
     <script type="module">
       import { montarTarjetaFidelizacion } from "/js/fidelizacion/tarjeta-fidelizacion.js";
       montarTarjetaFidelizacion(document.getElementById("miTarjeta"));
     </script>

   Opciones (todas opcionales):
     negocioId / localidad  -> si no se pasan, se resuelven desde la URL
                               (window.__NEGOCIO_ID__, ?id=&localidad= o /perfil/{alias}/fidelizacion/{uid})
     fondo                  -> color de fondo de tu página (para los "huecos" del ticket). Default #050505
     favicon                -> true/false, cambia el favicon con el logo del negocio. Default true
     promo                  -> true = modo perfil: tarjeta que gira, datos del programa y QR de la ruta
     onVerTarjeta           -> función que se ejecuta al tocar "Ver mi tarjeta" (modo promo)
     urlTarjeta             -> string o función que devuelve la URL que se codifica en el QR (modo promo).
                               Si no se pasa, se arma sola con alias_key del negocio.

   Devuelve una función destroy() para desmontar el componente.
   ========================================================================== */

import { db, auth } from "/js/db/db.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { tiendaDoc, clienteDoc, data_user_logeado } from "/js/rutas/rutas.js";
import { setFaviconCircular } from "/js/favicon/favicon.js";

/* ══════════════ Config ══════════════ */
const LOCALIDAD_FIJA = "barranca";
const AUTH_ORIGIN = "https://geinztech.com";
const ES_DOMINIO_PROPIO = location.hostname !== "geinztech.com" && location.hostname !== "www.geinztech.com";
const LOGO_FALLBACK_URL = "https://firebasestorage.googleapis.com/v0/b/geinzworkapp.appspot.com/o/tiendas%2FfW7W8RsgkkQ3IYfxKHGR%2Flogo%2Flogo.webp?alt=media&token=bb6e8d14-131a-449b-92bf-e4675bdab41b";
const QR_LIB = "https://cdn.jsdelivr.net/npm/qr-code-styling@1.6.0-rc.1/lib/qr-code-styling.js";
const FONTS_HREF = "https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=Inter:wght@400;600&family=IBM+Plex+Mono:wght@500;700&display=swap";

const NIVELES = [
  { min: 0, label: "Nivel Bronce" },
  { min: 150, label: "Nivel Plata" },
  { min: 400, label: "Nivel Oro VIP" },
];

/* ══════════════ CSS (una sola vez, todo scopeado bajo .fid) ══════════════ */
const CSS = `
.fid{--brand-vivid:#6b7280;--brand-glow:#4b5563;--brand-dark:#101114;--fid-bg:#050505;
  width:100%;max-width:400px;margin:0 auto;color:#fff;font-family:'Inter',sans-serif;-webkit-text-size-adjust:100%}
.fid *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
.fid .fid-hidden{display:none!important}
.fid .font-display{font-family:'Sora',sans-serif}
.fid .font-mono{font-family:'IBM Plex Mono',monospace}

.fid .fid-content{opacity:0;transition:opacity .5s ease}
.fid .fid-content.is-ready{opacity:1}

.fid .scene{perspective:1200px}
.fid .tilt{transform-style:preserve-3d;transition:transform .15s cubic-bezier(.2,0,0,1);will-change:transform}
.fid .flipper{position:relative;display:grid;transform-style:preserve-3d;transition:transform .62s cubic-bezier(.34,1.56,.64,1);cursor:pointer;will-change:transform}
.fid .flipper.is-flipped{transform:rotateY(180deg)}
.fid .face{grid-area:1/1;width:100%;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.fid .face.back{transform:rotateY(180deg)}

.fid .card{position:relative;display:flex;flex-direction:column;padding:clamp(22px,6vw,30px) clamp(20px,5.5vw,26px);
  border-radius:clamp(20px,4.5vw,24px);
  background:radial-gradient(130% 90% at 50% 0%,color-mix(in srgb,var(--brand-vivid) 28%,transparent) 0%,transparent 65%),
    linear-gradient(170deg,#12141a 0%,#0a0b0e 60%,#060709 100%);
  box-shadow:0 0 0 1px color-mix(in srgb,var(--brand-vivid) 38%,rgba(255,255,255,.12)),
    0 20px 50px -15px color-mix(in srgb,var(--brand-vivid) 25%,transparent),
    0 30px 70px -20px rgba(0,0,0,.95);
  overflow:hidden}
.fid .card::before{content:"";position:absolute;inset:0;pointer-events:none;
  background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.02) 0 1px,transparent 1px 7px)}
.fid .card::after{content:"";position:absolute;inset:0;border-radius:clamp(20px,4.5vw,24px);padding:1.5px;pointer-events:none;
  background:linear-gradient(135deg,color-mix(in srgb,var(--brand-vivid) 80%,white 20%) 0%,rgba(255,255,255,.1) 40%,transparent 60%,color-mix(in srgb,var(--brand-vivid) 50%,transparent) 100%);
  -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.fid .sheen{position:absolute;inset:0;border-radius:clamp(20px,4.5vw,24px);pointer-events:none;opacity:0;transition:opacity .3s ease;
  background:radial-gradient(circle 280px at var(--mx,50%) var(--my,20%),rgba(255,255,255,.12),transparent 70%)}
.fid .scene:hover .sheen,.fid .scene.is-active .sheen{opacity:1}
@media (hover:none){.fid .sheen{opacity:.3}}

.fid .eyebrow{font-size:clamp(8.5px,2.2vw,9.5px);letter-spacing:.28em;text-transform:uppercase;color:rgba(255,255,255,.4)}
.fid .store{font-size:clamp(17px,4.5vw,20px);letter-spacing:.02em;line-height:1.2;text-transform:uppercase;font-weight:600;
  margin-top:14px;max-width:85%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fid .client-name{font-size:clamp(15px,4.2vw,18px);letter-spacing:.06em;font-weight:500;text-transform:uppercase;
  max-width:100%;padding:0 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fid .points{font-size:clamp(42px,12vw,58px);font-weight:700;line-height:1;letter-spacing:-.03em;color:transparent;
  background:linear-gradient(180deg,#fff 30%,color-mix(in srgb,var(--brand-vivid) 80%,white 20%) 100%);
  -webkit-background-clip:text;background-clip:text;
  filter:drop-shadow(0 4px 15px color-mix(in srgb,var(--brand-vivid) 35%,transparent))}
.fid .since{margin-top:6px;color:rgba(255,255,255,.3)}
.fid .code-text{font-size:clamp(10px,2.6vw,11px);color:rgba(255,255,255,.5);letter-spacing:.25em}

.fid .head,.fid .body{position:relative;z-index:10;display:flex;flex-direction:column;align-items:center;text-align:center}
.fid .head{padding-bottom:20px}
.fid .body{padding:24px 0 8px}
.fid .gap{margin-top:24px;margin-bottom:4px}

.fid .logo-avatar{width:clamp(66px,18vw,78px);height:clamp(66px,18vw,78px);border-radius:9999px;padding:2.5px;
  background:linear-gradient(135deg,color-mix(in srgb,var(--brand-vivid) 100%,white 20%),color-mix(in srgb,var(--brand-dark) 40%,transparent));
  box-shadow:0 0 20px color-mix(in srgb,var(--brand-vivid) 45%,transparent),0 10px 20px rgba(0,0,0,.8)}
.fid .logo-inner{width:100%;height:100%;border-radius:9999px;overflow:hidden;background:#08090b}
.fid .logo-inner img{width:100%;height:100%;object-fit:cover;display:block}

.fid .chip-tier{margin-top:12px;padding:4px 14px;border-radius:9999px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;
  background:color-mix(in srgb,var(--brand-vivid) 22%,rgba(10,10,12,.92));
  border:1px solid color-mix(in srgb,var(--brand-vivid) 50%,transparent);
  color:color-mix(in srgb,var(--brand-vivid) 90%,white 10%);
  box-shadow:0 0 12px color-mix(in srgb,var(--brand-vivid) 20%,transparent)}

.fid .perforation{position:relative;height:1px;
  background-image:repeating-linear-gradient(90deg,color-mix(in srgb,var(--brand-vivid) 30%,rgba(255,255,255,.15)) 0 6px,transparent 6px 14px)}
.fid .perforation::before,.fid .perforation::after{content:"";position:absolute;top:50%;transform:translateY(-50%);
  width:20px;height:20px;border-radius:9999px;background:var(--fid-bg);box-shadow:inset 0 0 5px rgba(0,0,0,.9)}
.fid .perforation::before{left:-11px}
.fid .perforation::after{right:-11px}

.fid .flip-icon{position:absolute;top:16px;right:16px;width:24px;height:24px;color:rgba(255,255,255,.45);z-index:5;
  animation:fidPulse 2.4s ease-in-out infinite;pointer-events:none}
.fid .flip-icon svg{width:100%;height:100%}
@keyframes fidPulse{0%,100%{opacity:.35;transform:scale(1)}50%{opacity:.85;transform:scale(1.1) rotate(20deg)}}

.fid .back{align-items:center;justify-content:center;text-align:center}
.fid .back>*{position:relative;z-index:10}
.fid .qr-frame{background:#fff;border-radius:18px;padding:clamp(12px,4%,20px);width:clamp(180px,58%,260px);aspect-ratio:1/1;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 0 0 1px color-mix(in srgb,var(--brand-vivid) 45%,transparent),0 20px 45px -15px color-mix(in srgb,var(--brand-vivid) 45%,transparent)}
.fid .qr-host{width:100%;height:100%}
.fid .qr-host canvas{display:block;width:100%;height:100%;border-radius:10px}

.fid .gate-card{width:100%;max-width:384px;margin:0 auto;padding:40px 24px;border-radius:24px;border:1px solid rgba(255,255,255,.05);
  background:#0d0e12;display:flex;flex-direction:column;align-items:center;text-align:center}
.fid .gate-card .logo-avatar{margin-bottom:20px}
.fid .gate-title{font-size:16px;font-weight:600;margin-bottom:8px}
.fid .gate-text{font-size:12px;color:rgba(255,255,255,.4);line-height:1.6;margin-bottom:24px}
.fid .gate-err{font-size:12px;color:rgba(248,113,113,.85);margin-top:12px}
.fid .btn{display:inline-block;border:0;cursor:pointer;text-decoration:none;padding:12px 24px;border-radius:12px;
  font-size:14px;font-weight:600;font-family:'Inter',sans-serif;color:#fff;
  background:linear-gradient(135deg,var(--brand-vivid) 0%,color-mix(in srgb,var(--brand-vivid) 80%,black 20%) 100%);
  box-shadow:0 4px 15px color-mix(in srgb,var(--brand-vivid) 35%,transparent);transition:filter .2s ease,transform .2s ease}
.fid .btn:hover{filter:brightness(1.15);transform:translateY(-1px)}
.fid .btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
.fid .error{margin-top:24px;font-size:12px;color:rgba(248,113,113,.85);background:rgba(239,68,68,.05);
  border:1px solid rgba(239,68,68,.2);border-radius:12px;padding:12px;text-align:center}

.fid .promo-title{font-size:clamp(15px,4vw,17px);font-weight:700;line-height:1.25;margin-top:2px}
.fid .promo-desc{font-size:12px;line-height:1.5;color:rgba(255,255,255,.55);margin-top:8px;max-width:92%}
.fid .promo-btn{margin-top:20px;width:100%;max-width:220px;font-size:13px;padding:11px 20px}
@media (prefers-reduced-motion:reduce){
  .fid .flip-icon,.fid .flipper,.fid .tilt,.fid .fid-content{animation:none!important;transition:none!important}
}

/* ── Modo promo: la tarjeta ocupa TODO el espacio de su columna ── */
.fid.fid--promo{max-width:none;margin:0;display:flex;flex-direction:column;height:100%}
.fid.fid--promo .fid-content{flex:1;display:flex;width:100%}
.fid.fid--promo .scene{flex:1;display:flex;width:100%}
.fid.fid--promo .tilt{flex:1;display:flex;width:100%}
.fid.fid--promo .flipper{flex:1;width:100%}
.fid.fid--promo .card{flex:1;width:100%;min-height:0;justify-content:space-between;
  padding:clamp(24px,2.4vw,36px) clamp(22px,2.4vw,34px)}
.fid.fid--promo .card.back{justify-content:center;align-items:center;text-align:center}
.fid.fid--promo .body{flex:1;justify-content:center;padding:28px 0 12px}
.fid.fid--promo .logo-avatar{width:clamp(84px,9vw,104px);height:clamp(84px,9vw,104px)}
.fid.fid--promo .store{max-width:100%;white-space:normal;text-align:center;font-size:clamp(20px,2.2vw,26px)}
.fid.fid--promo .eyebrow{font-size:clamp(9.5px,1vw,11px)}
.fid.fid--promo .promo-title{font-size:clamp(20px,2.2vw,26px)}
.fid.fid--promo .promo-desc{font-size:clamp(13px,1.3vw,15px);max-width:100%;margin-top:12px}
.fid.fid--promo .promo-btn{max-width:none;width:100%;font-size:15px;padding:14px 22px;margin-top:28px}

/* ── Modo promo: chips con datos del programa ── */
.fid .fx-chips{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:16px}
.fid .fx-chips:empty{display:none}
.fid .fx-chip{font-size:11px;font-weight:600;padding:5px 12px;border-radius:9999px;color:rgba(255,255,255,.85);
  background:color-mix(in srgb,var(--brand-vivid) 18%,rgba(10,10,12,.9));
  border:1px solid color-mix(in srgb,var(--brand-vivid) 45%,transparent)}
.fid .fx-chip.warn{color:#fde68a;border-color:rgba(253,230,138,.35);background:rgba(251,191,36,.08)}
.fid .fx-msg{font-size:12px;line-height:1.5;color:rgba(255,255,255,.6);margin-top:14px;max-width:92%}
`;

function inyectarRecursos() {
  if (!document.getElementById("fid-styles")) {
    const st = document.createElement("style");
    st.id = "fid-styles";
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  if (!document.getElementById("fid-fonts")) {
    const l = document.createElement("link");
    l.id = "fid-fonts";
    l.rel = "stylesheet";
    l.href = FONTS_HREF;
    document.head.appendChild(l);
  }
}

/* ══════════════ Helpers de color (puros) ══════════════ */
const rgbToHex = (r, g, b) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const f = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return { r: f(p, q, h + 1 / 3) * 255, g: f(p, q, h) * 255, b: f(p, q, h - 1 / 3) * 255 };
}

function colorFromName(name) {
  let hash = 0;
  const str = name || "Fidelidad";
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hslToRgb(Math.abs(hash % 360) / 360, 0.65, 0.5);
}

function getDominantColor(img) {
  try {
    const S = 64;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, S, S);
    const data = ctx.getImageData(0, 0, S, S).data;
    const buckets = {};
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (data[i + 3] < 128) continue;
      const { s, l } = rgbToHsl(r, g, b);
      if (l > 0.8 || l < 0.1 || s < 0.25) continue;
      const key = `${r >> 4},${g >> 4},${b >> 4}`;
      const k = buckets[key] || (buckets[key] = { n: 0, r: 0, g: 0, b: 0 });
      k.n++; k.r += r; k.g += g; k.b += b;
    }
    let top = null;
    for (const k of Object.values(buckets)) if (!top || k.n > top.n) top = k;
    return top ? { r: top.r / top.n, g: top.g / top.n, b: top.b / top.n } : null;
  } catch {
    return null;
  }
}

const calcularNivel = (pts) => NIVELES.reduce((acc, n) => (pts >= n.min ? n : acc), NIVELES[0]).label;
const capitalizar = (t) => String(t || "").trim().toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const logoDeTienda = (t) =>
  t?.img_tienda?.logo_tienda || t?.logoURL || t?.logo || t?.urlLogo || LOGO_FALLBACK_URL;

function formatearFechaInicio(ts) {
  try {
    const f = ts?.toDate ? ts.toDate() : new Date(ts);
    return new Intl.DateTimeFormat("es-PE", { month: "short", year: "numeric" }).format(f);
  } catch {
    return null;
  }
}

/* ══════════════ Ruta ══════════════ */
async function resolverRuta() {
  if (window.__NEGOCIO_ID__ && window.__NEGOCIO_LOCALIDAD__) {
    return { negocioId: window.__NEGOCIO_ID__, localidad: window.__NEGOCIO_LOCALIDAD__.trim().toLowerCase() };
  }
  const params = new URLSearchParams(location.search);
  if (params.get("id")) {
    return { negocioId: params.get("id"), localidad: params.get("localidad") || LOCALIDAD_FIJA };
  }
  const partes = location.pathname.split("/").filter(Boolean);
  const iP = partes.indexOf("perfil");
  const iF = partes.indexOf("fidelizacion");
  if (iP !== -1 && iF === iP + 2) {
    try {
      const snap = await getDoc(doc(db, "alias_tiendas", decodeURIComponent(partes[iP + 1])));
      if (snap.exists()) {
        const d = snap.data();
        if (d.id && d.localidad) return { negocioId: d.id, localidad: d.localidad.trim().toLowerCase() };
      }
    } catch (e) {
      console.error("[fidelizacion] alias:", e);
    }
  }
  return null;
}

/* ══════════════ QR (carga diferida, una vez) ══════════════ */
let qrLibPromise = null;
function cargarLibQR() {
  if (window.QRCodeStyling) return Promise.resolve();
  if (qrLibPromise) return qrLibPromise;
  qrLibPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = QR_LIB;
    s.onload = resolve;
    s.onerror = () => {
      qrLibPromise = null;
      reject(new Error("No se pudo cargar la librería QR"));
    };
    document.head.appendChild(s);
  });
  return qrLibPromise;
}

/* ══════════════════════════════════════════════════════════════════════════
   COMPONENTE
   ══════════════════════════════════════════════════════════════════════════ */
export function montarTarjetaFidelizacion(container, opts = {}) {
  if (!container) throw new Error("montarTarjetaFidelizacion: falta el contenedor.");
  inyectarRecursos();

  const root = document.createElement("div");
  root.className = "fid";
  if (opts.promo) root.classList.add("fid--promo");
  if (opts.fondo) root.style.setProperty("--fid-bg", opts.fondo);
  container.appendChild(root);

  let LOCALIDAD = opts.localidad || LOCALIDAD_FIJA;
  let NEGOCIO_ID = opts.negocioId || null;
  let esperandoToken = new URLSearchParams(location.hash.slice(1)).has("wl_token");
  let destruido = false;
  let unsubAuth = null;
  let brandDarkHex = "#2e1065";
  let colorReady = false;
  const qr = { code: null, rendered: false };
  const q = (sel) => root.querySelector(sel);

  /* ── Color de marca (scopeado al componente) ── */
  function aplicarColorMarca({ r, g, b }) {
    const { h, s } = rgbToHsl(r, g, b);
    const vivid = hslToRgb(h, Math.max(s, 0.6), 0.5);
    const glow = hslToRgb(h, Math.max(s, 0.65), 0.35);
    const dark = hslToRgb(h, Math.max(s, 0.5), 0.12);
    root.style.setProperty("--brand-vivid", rgbToHex(vivid.r, vivid.g, vivid.b));
    root.style.setProperty("--brand-glow", rgbToHex(glow.r, glow.g, glow.b));
    brandDarkHex = rgbToHex(dark.r, dark.g, dark.b);
    root.style.setProperty("--brand-dark", brandDarkHex);
    colorReady = true;
  }

  function cargarLogoYColor(logoURL, nombre) {
    return new Promise((resolve) => {
      const img = q("[data-ref=logo]");
      if (!img || !logoURL) return resolve(colorFromName(nombre));
      if (opts.favicon !== false) setFaviconCircular(logoURL);
      img.onload = () => resolve(getDominantColor(img) || colorFromName(nombre));
      img.onerror = () => resolve(colorFromName(nombre));
      img.src = logoURL;
    });
  }

  function showError(msg) {
    let box = q("[data-ref=error]");
    if (!box) {
      box = document.createElement("p");
      box.className = "error";
      box.dataset.ref = "error";
      root.appendChild(box);
    }
    box.textContent = msg;
  }

  /* ── QR ── */
  async function renderQR() {
    if (qr.rendered || !qr.code || !colorReady) return;
    try {
      await cargarLibQR();
    } catch {
      return;
    }
    if (qr.rendered || destruido) return;
    const host = q("[data-ref=qr]");
    if (!host) return;
    qr.rendered = true;
    host.innerHTML = "";
    new window.QRCodeStyling({
      width: 300,
      height: 300,
      type: "canvas",
      data: qr.code,
      margin: 10,
      qrOptions: { errorCorrectionLevel: "H" },
      dotsOptions: { type: "dots", color: brandDarkHex },
      cornersSquareOptions: { type: "extra-rounded", color: brandDarkHex },
      cornersDotOptions: { type: "dot", color: brandDarkHex },
      backgroundOptions: { color: "#fdfdfd" },
    }).append(host);
  }

  /* ── Interacción ── */
  function initTilt() {
    const scene = q(".scene");
    const card = q(".tilt");
    if (!scene || !card || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const MAX = 6;
    let raf = 0;
    const update = (x, y) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = scene.getBoundingClientRect();
        const px = Math.min(1, Math.max(0, (x - r.left) / r.width));
        const py = Math.min(1, Math.max(0, (y - r.top) / r.height));
        card.style.transform = `rotateX(${(0.5 - py) * MAX * 2}deg) rotateY(${(px - 0.5) * MAX * 2}deg) scale(1.015)`;
        card.style.setProperty("--mx", `${px * 100}%`);
        card.style.setProperty("--my", `${py * 100}%`);
      });
    };
    const reset = () => {
      cancelAnimationFrame(raf);
      card.style.transform = "rotateX(0deg) rotateY(0deg) scale(1)";
    };
    scene.addEventListener("mousemove", (e) => update(e.clientX, e.clientY));
    scene.addEventListener("mouseleave", reset);
    scene.addEventListener("touchstart", (e) => {
      scene.classList.add("is-active");
      update(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    scene.addEventListener("touchmove", (e) => update(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    scene.addEventListener("touchend", () => {
      scene.classList.remove("is-active");
      reset();
    });
  }

  function initFlip() {
    const flipper = q(".flipper");
    if (!flipper) return;
    const toggle = () => {
      flipper.classList.toggle("is-flipped");
      renderQR();
    };
    flipper.addEventListener("click", toggle);
    flipper.addEventListener("keydown", (e) => {
      // Si el foco está en un botón interno (ej. "Ver mi tarjeta"), no girar
      if (e.target !== flipper) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
  }

  /* ── Plantillas ── */
  function pintarEsqueleto() {
    root.innerHTML = `
      <div class="fid-content" data-ref="content">
        <div class="scene">
          <div class="tilt">
            <div class="flipper" role="button" aria-label="Tocar para ver código QR" tabindex="0">

              <div class="card face">
                <div class="sheen"></div>
                <div class="flip-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>
                  </svg>
                </div>
                <div class="head">
                  <div class="logo-avatar"><div class="logo-inner"><img data-ref="logo" alt="Logo" crossorigin="anonymous"></div></div>
                  <p class="font-display store" data-ref="store"></p>
                  <p class="eyebrow font-mono" style="margin-top:4px">Tarjeta de Fidelización</p>
                  <span class="chip-tier eyebrow font-mono" data-ref="tier"></span>
                </div>
                <div class="perforation"></div>
                <div class="body">
                  <p class="eyebrow font-mono">Cliente Frecuente</p>
                  <p class="font-mono client-name" data-ref="name" style="margin-top:4px"></p>
                  <p class="eyebrow font-mono gap">Puntos Acumulados</p>
                  <p class="points font-mono" data-ref="points"></p>
                  <p class="eyebrow font-mono since fid-hidden" data-ref="since"></p>
                </div>
                <div class="perforation" style="margin-top:16px"></div>
              </div>

              <div class="card face back">
                <div class="sheen"></div>
                <p class="eyebrow font-mono" style="margin-bottom:20px">Tu código QR</p>
                <div class="qr-frame"><div class="qr-host" data-ref="qr"></div></div>
                <p class="font-mono code-text" data-ref="qrtext" style="margin-top:20px"></p>
                <p class="eyebrow" style="margin-top:24px;color:rgba(255,255,255,.25)">Toca para volver</p>
              </div>

            </div>
          </div>
        </div>
      </div>`;
  }

  const avatarHTML = (logo) =>
    `<div class="logo-avatar"><div class="logo-inner">${logo ? `<img src="${logo}" alt="Logo" crossorigin="anonymous">` : ""}</div></div>`;

  function abrirLoginPopup(nombre, logoUrl, rgb) {
    const u = new URL(`${AUTH_ORIGIN}/auth-popup.html`);
    u.searchParams.set("o", location.origin);
    u.searchParams.set("r", location.href.split("#")[0]);
    u.searchParams.set("n", nombre || "");
    if (logoUrl) u.searchParams.set("l", logoUrl);
    u.searchParams.set("c", rgb);
    location.href = u.toString();
  }

  async function showLoginGate() {
    let nombre = "", logo = "";
    if (ES_DOMINIO_PROPIO && NEGOCIO_ID) {
      try {
        const snap = await getDoc(tiendaDoc(LOCALIDAD, "tiendas", NEGOCIO_ID));
        const t = snap.exists() ? snap.data() : {};
        nombre = t.nombre_tienda || t.nombre || "";
        logo = t.img_tienda?.logo_tienda || t.logoURL || t.logo || t.urlLogo || "";
      } catch (e) {
        console.warn("No se pudo cargar el negocio para el login:", e.message);
      }
    }
    if (destruido) return;

    const c = colorFromName(nombre || "Fidelidad");
    const rgb = `${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)}`;
    root.style.setProperty("--brand-vivid", rgbToHex(c.r, c.g, c.b));

    const accion = ES_DOMINIO_PROPIO
      ? `<button data-ref="login" type="button" class="btn">Iniciar sesión</button>`
      : `<a href="../logindata/login.html?redirect=${encodeURIComponent(location.href)}" class="btn">Iniciar sesión</a>`;

    root.innerHTML = `
      <div class="gate-card">
        ${avatarHTML(logo)}
        <p class="font-display gate-title">Inicia sesión para ver tu tarjeta</p>
        <p class="font-mono gate-text">Necesitas tu cuenta de Geinz para ver tus puntos.</p>
        ${accion}
      </div>`;

    if (ES_DOMINIO_PROPIO) {
      q("[data-ref=login]").addEventListener("click", () => abrirLoginPopup(nombre, logo, rgb));
    }
  }

  function showFollowGate(nombre, logo, onFollow) {
    if (logo && opts.favicon !== false) setFaviconCircular(logo);
    root.innerHTML = `
      <div class="gate-card">
        ${avatarHTML(logo)}
        <p class="font-display gate-title">Sigue a ${nombre || "este negocio"}</p>
        <p class="font-mono gate-text">Para ver tu tarjeta, primero debes seguir este negocio.</p>
        <button data-ref="follow" class="btn" style="width:100%;max-width:220px">Seguir negocio</button>
        <p data-ref="followerr" class="gate-err fid-hidden"></p>
      </div>`;

    q("[data-ref=follow]").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "Siguiendo...";
      try {
        await onFollow();
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        btn.textContent = "Seguir negocio";
        const el = q("[data-ref=followerr]");
        el.textContent = "No se pudo completar, intenta de nuevo.";
        el.classList.remove("fid-hidden");
      }
    });
  }

  /* ══════════════ Modo promo (perfil) ══════════════
     Frente: logo, nombre, texto, datos del programa (chips) y botón "Ver mi tarjeta".
     Reverso: QR con la ruta a la que lleva "Ver mi tarjeta".
     Tocar la tarjeta la gira; el botón es el que navega. */
  function pintarPromo() {
    root.innerHTML = `
      <div class="fid-content" data-ref="content">
        <div class="scene">
          <div class="tilt">
            <div class="flipper" role="button" aria-label="Tocar para ver código QR" tabindex="0">

              <div class="card face">
                <div class="sheen"></div>
                <div class="flip-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>
                  </svg>
                </div>
                <div class="head">
                  <div class="logo-avatar"><div class="logo-inner"><img data-ref="logo" alt="Logo" crossorigin="anonymous"></div></div>
                  <p class="font-display store" data-ref="store"></p>
                  <p class="eyebrow font-mono" style="margin-top:4px">Tarjeta de Fidelización</p>
                </div>
                <div class="perforation"></div>
                <div class="body">
                  <p class="font-display promo-title">Obtén tu tarjeta de fidelización</p>
                  <p class="promo-desc">Consigue recompensas y descuentos exclusivos </p>
                  <div class="fx-chips" data-ref="chips"></div>
                  <p class="fx-msg fid-hidden" data-ref="msg"></p>
                  <button type="button" class="btn promo-btn" data-ref="verbtn">Ver mi tarjeta →</button>
                </div>
                <div class="perforation" style="margin-top:16px"></div>
              </div>

              <div class="card face back">
                <div class="sheen"></div>
                <p class="eyebrow font-mono" style="margin-bottom:20px">Escanea para ver tu tarjeta</p>
                <div class="qr-frame"><div class="qr-host" data-ref="qr"></div></div>
                <p class="eyebrow" style="margin-top:24px;color:rgba(255,255,255,.25)">Toca para volver</p>
              </div>

            </div>
          </div>
        </div>
      </div>`;
  }

  /* URL que lleva el QR = la misma ruta a la que va "Ver mi tarjeta" (sin uid) */
  function urlTarjeta(t) {
    if (typeof opts.urlTarjeta === "function") return opts.urlTarjeta();
    if (typeof opts.urlTarjeta === "string") return opts.urlTarjeta;
    if (ES_DOMINIO_PROPIO) return `${location.origin}/fidelizacion`;
    if (t?.alias_key) return `${AUTH_ORIGIN}/perfil/${encodeURIComponent(t.alias_key)}/fidelizacion`;
    return `${AUTH_ORIGIN}/fidelizacion/fidelizacion_client.html?localidad=${encodeURIComponent(LOCALIDAD)}&id=${encodeURIComponent(NEGOCIO_ID)}`;
  }

  /* Datos del programa: vencimiento de puntos o mensaje de inactivo */
  function pintarDatosFidelizacion(f) {
    const chips = q("[data-ref=chips]");
    const msg = q("[data-ref=msg]");
    if (!chips || !msg) return;
    chips.innerHTML = "";
    msg.classList.add("fid-hidden");

    const chip = (txt, cls = "") => {
      const s = document.createElement("span");
      s.className = "fx-chip " + cls;
      s.textContent = txt;
      chips.appendChild(s);
    };

    if (!f || f.activo !== true) {
      if (f?.mensajeInactivo) {
        msg.textContent = f.mensajeInactivo;
        msg.classList.remove("fid-hidden");
      }
      return;
    }
    if (f.vencimientoActivo === true) {
      chip(`⏳ Puntos válidos por ${f.diasVencimiento ?? 100} días`);
      chip(`🔔 Aviso ${f.diasAviso ?? 4} días antes de vencer`, "warn");
    } else {
      chip("♾️ Tus puntos no vencen");
    }
  }

  async function iniciarPromo() {
    try {
      const snap = await getDoc(tiendaDoc(LOCALIDAD, "tiendas", NEGOCIO_ID));
      if (destruido) return;
      const t = snap.exists() ? snap.data() : {};
      const nombre = t.nombre_tienda || t.nombre || "Mi Negocio";
      const logo = logoDeTienda(t);

      pintarPromo();
      q("[data-ref=store]").textContent = nombre;
      pintarDatosFidelizacion(t.fidelizacion);

      const color = await cargarLogoYColor(logo, nombre);
      if (destruido) return;
      aplicarColorMarca(color);

      // QR = ruta a la que lleva "Ver mi tarjeta"
      qr.code = urlTarjeta(t);
      qr.rendered = false;

      // El botón navega; el resto de la tarjeta gira
      q("[data-ref=verbtn]").addEventListener("click", (e) => {
        e.stopPropagation();
        opts.onVerTarjeta?.();
      });

      initTilt();
      initFlip();
      requestAnimationFrame(() => q("[data-ref=content]")?.classList.add("is-ready"));
      (window.requestIdleCallback || ((f) => setTimeout(f, 800)))(renderQR);
    } catch (err) {
      console.error(err);
      showError("No se pudo cargar la tarjeta.");
    }
  }

  /* ── Datos ── */
  async function seguirNegocio(uid) {
    await setDoc(clienteDoc(LOCALIDAD, NEGOCIO_ID, uid), {
      id: uid,
      id_usuario: uid,
      puntos: 0,
      fecha_inicio: serverTimestamp(),
      ultimo_consumo: serverTimestamp(),
    });
  }

  async function cargarUsuario(id) {
    if (!id) return {};
    const snap = await getDoc(data_user_logeado(id));
    return snap.exists() ? snap.data() : {};
  }

  async function cargarDatos(uid) {
    try {
      if (!NEGOCIO_ID || !uid) throw new Error("Faltan parámetros.");

      const [tiendaSnap, clienteSnap] = await Promise.all([
        getDoc(tiendaDoc(LOCALIDAD, "tiendas", NEGOCIO_ID)),
        getDoc(clienteDoc(LOCALIDAD, NEGOCIO_ID, uid)),
      ]);
      if (destruido) return;

      const tienda = tiendaSnap.exists() ? tiendaSnap.data() : {};
      const nombreTienda = tienda.nombre_tienda || tienda.nombre || "Mi Negocio";
      const logoURL = logoDeTienda(tienda);

      if (!clienteSnap.exists()) {
        showFollowGate(nombreTienda, logoURL, async () => {
          await seguirNegocio(uid);
          await cargarDatos(uid);
        });
        return;
      }

      const cliente = clienteSnap.data();
      pintarEsqueleto();
      q("[data-ref=store]").textContent = nombreTienda;

      const [colorLogo, usuario] = await Promise.all([
        cargarLogoYColor(logoURL, nombreTienda),
        cargarUsuario(cliente.id_usuario),
      ]);
      if (destruido) return;
      aplicarColorMarca(colorLogo);

      const nombreCliente =
        [capitalizar(usuario.nombre), capitalizar(usuario.apellido)].filter(Boolean).join(" ") ||
        usuario.nombre_user ||
        "Cliente Frecuente";
      const puntos = Number(cliente.puntos ?? 0);
      const codigo = String(cliente.id || clienteSnap.id);
      const desde = formatearFechaInicio(cliente.fecha_inicio);

      q("[data-ref=name]").textContent = nombreCliente;
      q("[data-ref=points]").textContent = puntos.toLocaleString("es-PE");
      q("[data-ref=tier]").textContent = calcularNivel(puntos);
      q("[data-ref=qrtext]").textContent = "ID: " + codigo;
      if (desde) {
        const el = q("[data-ref=since]");
        el.textContent = `Cliente desde ${desde}`;
        el.classList.remove("fid-hidden");
      }

      qr.code = codigo;
      qr.rendered = false;
      initTilt();
      initFlip();
      requestAnimationFrame(() => q("[data-ref=content]")?.classList.add("is-ready"));
      (window.requestIdleCallback || ((f) => setTimeout(f, 800)))(renderQR);
    } catch (err) {
      console.error(err);
      showError("No se pudieron cargar los datos.");
    }
  }

  /* ── Login por token (dominio propio) ── */
  (async () => {
    if (opts.promo) return;
    const t = new URLSearchParams(location.hash.slice(1)).get("wl_token");
    if (!t) return;
    history.replaceState(null, "", location.pathname + location.search);
    try {
      await signInWithCustomToken(auth, t);
    } catch (err) {
      console.error("signInWithCustomToken:", err);
      esperandoToken = false;
      if (NEGOCIO_ID && !destruido) showLoginGate();
    }
  })();

  /* ── INIT ── */
  (async () => {
    if (opts.promo && NEGOCIO_ID) {
      iniciarPromo();
      return;
    }
    if (!NEGOCIO_ID) {
      const ruta = await resolverRuta();
      if (!ruta) {
        showError("Enlace inválido: falta el negocio.");
        return;
      }
      NEGOCIO_ID = ruta.negocioId;
      LOCALIDAD = ruta.localidad;
    }
    if (destruido) return;

    unsubAuth = onAuthStateChanged(auth, (user) => {
      if (destruido) return;
      if (!user) {
        if (esperandoToken) return;
        showLoginGate();
        return;
      }
      esperandoToken = false;
      cargarDatos(user.uid);
    });
  })();

  /* ── Desmontar ── */
  return function destroy() {
    destruido = true;
    if (unsubAuth) unsubAuth();
    root.remove();
  };
}

export default montarTarjetaFidelizacion;