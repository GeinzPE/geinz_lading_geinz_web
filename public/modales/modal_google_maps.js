/* ═══════════════════════════════════════════════════════════════
   como_llegar.js — Diálogo "Cómo llegar" (mapa + ruta sin salir de la página)

   USO:
     import { abrirComoLlegar } from "./como_llegar.js";
     abrirComoLlegar({ lat, lng, nombre, direccion, referencia });

   - Si la ubicación está activa → ruta desde el usuario hasta el negocio.
   - Si no → muestra el destino + botón "Activar ubicación".
   - Abajo: dirección, referencia y botón "Abrir en Google Maps".
   - Usa las variables --dr/--dg/--db de tu perfil (color de marca).
   - Opcional: pon tu API key de Maps Embed para el modo oficial.
   ═══════════════════════════════════════════════════════════════ */

const MAPS_EMBED_KEY = ""; // opcional. Vacío = embed clásico sin clave.

const CSS = `
.cll-overlay{position:fixed;inset:0;z-index:10040;display:flex;align-items:center;justify-content:center;
  padding:clamp(0px,2vw,28px);background:rgba(3,3,3,.6);
  -webkit-backdrop-filter:blur(0px);backdrop-filter:blur(0px);opacity:0;visibility:hidden;
  transition:opacity .3s ease,visibility .3s ease,backdrop-filter .4s ease,-webkit-backdrop-filter .4s ease;}
.cll-overlay.open{opacity:1;visibility:visible;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);}
.cll-box{position:relative;display:flex;flex-direction:column;overflow:hidden;
  width:min(1180px,100%);height:min(94dvh,920px);background:#0b0b0d;color:#fff;
  border:1px solid rgba(var(--dr,139),var(--dg,92),var(--db,246),.35);border-radius:28px;
  transform:translateY(30px) scale(.96);opacity:0;
  transition:transform .45s cubic-bezier(.22,.85,.32,1),opacity .3s ease;
  box-shadow:0 40px 90px -20px rgba(0,0,0,.85),0 0 60px -16px rgba(var(--dr,139),var(--dg,92),var(--db,246),.4);}
.cll-overlay.open .cll-box{transform:none;opacity:1;}

.cll-head{display:flex;align-items:center;gap:12px;padding:14px 16px 12px 20px;flex-shrink:0;
  border-bottom:1px solid rgba(255,255,255,.07);}
.cll-head-ico{width:40px;height:40px;border-radius:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center;
  background:rgba(var(--dr,139),var(--dg,92),var(--db,246),.18);border:1px solid rgba(var(--dr,139),var(--dg,92),var(--db,246),.5);}
.cll-head-txt{min-width:0;flex:1;}
.cll-title{margin:0;font-size:17px;font-weight:800;letter-spacing:-.01em;}
.cll-sub{margin:2px 0 0;font-size:12px;color:#9c9ca3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cll-close{width:38px;height:38px;border:none;border-radius:50%;flex-shrink:0;cursor:pointer;color:#fff;
  background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;transition:background .2s,transform .2s;}
.cll-close:hover{background:rgba(255,255,255,.16);transform:rotate(90deg);}

.cll-map{position:relative;flex:1;min-height:0;background:#111;overflow:hidden;}
.cll-skel{position:absolute;inset:0;background:linear-gradient(135deg,rgba(var(--dr,139),var(--dg,92),var(--db,246),.16),#0d0d0f);}
.cll-skel::after{content:"";position:absolute;inset:0;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.07),transparent);background-size:200% 100%;
  animation:cllShim 1.5s infinite;}
@keyframes cllShim{0%{background-position:200% 0}100%{background-position:-200% 0}}
.cll-frame{position:absolute;inset:0;width:100%;height:100%;border:0;opacity:0;transition:opacity .4s ease;}
.cll-frame.show{opacity:1;}

.cll-modes{position:absolute;top:12px;right:12px;z-index:3;display:flex;gap:4px;padding:4px;border-radius:999px;
  background:rgba(11,11,13,.85);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);
  border:1px solid rgba(255,255,255,.12);box-shadow:0 8px 22px -8px rgba(0,0,0,.6);}
.cll-mode{border:none;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;color:#d4d4d8;
  padding:8px 13px;border-radius:999px;background:transparent;transition:background .2s,color .2s;}
.cll-mode.active{color:#fff;background:linear-gradient(135deg,rgb(var(--dr,139),var(--dg,92),var(--db,246)),rgba(var(--dr,139),var(--dg,92),var(--db,246),.7));}
.cll-modes.hide{display:none;}

.cll-loc{position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:3;width:min(440px,calc(100% - 24px));
  display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:18px;
  background:rgba(11,11,13,.92);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);
  border:1px solid rgba(var(--dr,139),var(--dg,92),var(--db,246),.5);box-shadow:0 16px 36px -10px rgba(0,0,0,.75);
  transition:opacity .3s,transform .3s;}
.cll-loc.hide{opacity:0;pointer-events:none;transform:translateX(-50%) translateY(-12px);}
.cll-loc-txt{flex:1;min-width:0;}
.cll-loc-txt b{display:block;font-size:13.5px;font-weight:800;}
.cll-loc-txt span{display:block;font-size:11.5px;line-height:1.4;color:#a1a1aa;margin-top:2px;}
.cll-loc-btn{flex-shrink:0;border:none;cursor:pointer;font-family:inherit;font-weight:800;font-size:12.5px;color:#fff;
  padding:11px 16px;border-radius:13px;display:flex;align-items:center;gap:7px;white-space:nowrap;
  background:linear-gradient(135deg,rgb(var(--dr,139),var(--dg,92),var(--db,246)),rgba(var(--dr,139),var(--dg,92),var(--db,246),.7));
  box-shadow:0 8px 20px -6px rgba(var(--dr,139),var(--dg,92),var(--db,246),.6);}
.cll-loc-btn:disabled{opacity:.6;cursor:default;}
.cll-spin{width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;animation:cllSpin .7s linear infinite;}
@keyframes cllSpin{to{transform:rotate(360deg)}}

.cll-foot{flex-shrink:0;padding:16px 20px calc(18px + env(safe-area-inset-bottom,0px));
  border-top:1px solid rgba(255,255,255,.07);background:#0b0b0d;
  display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center;}
.cll-info{display:grid;grid-template-columns:1fr 1fr;gap:16px;min-width:0;}
.cll-lbl{font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:rgb(var(--dr,139),var(--dg,92),var(--db,246));margin:0 0 4px;}
.cll-val{margin:0;font-size:13.5px;line-height:1.45;color:#e4e4e7;overflow-wrap:anywhere;}
.cll-actions{display:flex;flex-direction:column;gap:8px;min-width:230px;}
.cll-btn{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;padding:14px 18px;border:none;border-radius:15px;
  font-family:inherit;font-weight:800;font-size:13.5px;color:#fff;cursor:pointer;text-decoration:none;box-sizing:border-box;
  background:linear-gradient(135deg,rgb(var(--dr,139),var(--dg,92),var(--db,246)),rgba(var(--dr,139),var(--dg,92),var(--db,246),.7));
  box-shadow:0 10px 24px -8px rgba(var(--dr,139),var(--dg,92),var(--db,246),.6);transition:transform .18s,filter .18s;}
.cll-btn:hover{transform:translateY(-2px);filter:brightness(1.07);}
.cll-meta{text-align:center;font-size:11.5px;color:#9c9ca3;min-height:14px;}

@media (max-width:720px){
  .cll-overlay{padding:0;align-items:flex-end;}
  .cll-box{width:100%;height:96dvh;border-radius:26px 26px 0 0;border-bottom:none;transform:translateY(100%);}
  .cll-overlay.open .cll-box{transform:none;}
  .cll-foot{grid-template-columns:1fr;gap:12px;padding:14px 16px calc(16px + env(safe-area-inset-bottom,0px));}
  .cll-info{grid-template-columns:1fr;gap:10px;}
  .cll-actions{min-width:0;}
  .cll-modes{top:auto;bottom:12px;right:50%;transform:translateX(50%);}
  .cll-loc{flex-wrap:wrap;}
  .cll-loc-btn{width:100%;justify-content:center;}
}
@media (min-width:721px) and (max-width:1024px){
  .cll-box{height:min(92dvh,860px);}
}
`;

const ICON_PIN = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>`;
const ICON_X = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
const ICON_LOC = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7.5"/></svg>`;
const ICON_GM = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>`;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);

const MODES = [
  { k: "driving", label: "Auto", flag: "d", gm: "driving" },
  { k: "walking", label: "A pie", flag: "w", gm: "walking" },
  { k: "transit", label: "Transporte", flag: "r", gm: "transit" },
];

let _els = null;
let _st = null; // estado de la sesión actual

function ensureDom() {
  if (_els) return _els;
  if (!document.getElementById("cllStyle")) {
    const s = document.createElement("style");
    s.id = "cllStyle";
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  const ov = document.createElement("div");
  ov.className = "cll-overlay";
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");
  ov.innerHTML = `
    <div class="cll-box">
      <div class="cll-head">
        <div class="cll-head-ico">${ICON_PIN}</div>
        <div class="cll-head-txt"><h3 class="cll-title">Cómo llegar</h3><p class="cll-sub" data-r="sub"></p></div>
        <button type="button" class="cll-close" data-r="close" aria-label="Cerrar">${ICON_X}</button>
      </div>
      <div class="cll-map">
        <div class="cll-skel"></div>
        <iframe class="cll-frame" data-r="frame" title="Mapa" loading="eager" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>
        <div class="cll-modes hide" data-r="modes">
          ${MODES.map((m) => `<button type="button" class="cll-mode" data-mode="${m.k}">${m.label}</button>`).join("")}
        </div>
        <div class="cll-loc" data-r="loc">
          <div class="cll-loc-txt"><b data-r="locTitle">Activa tu ubicación</b><span data-r="locMsg">Para trazar la ruta desde donde estás hasta el negocio.</span></div>
          <button type="button" class="cll-loc-btn" data-r="locBtn">${ICON_LOC}<span>Activar ubicación</span></button>
        </div>
      </div>
      <div class="cll-foot">
        <div class="cll-info">
          <div><p class="cll-lbl">Dirección</p><p class="cll-val" data-r="addr"></p></div>
          <div><p class="cll-lbl">Referencia</p><p class="cll-val" data-r="ref"></p></div>
        </div>
        <div class="cll-actions">
          <a class="cll-btn" data-r="gm" target="_blank" rel="noopener">${ICON_GM}<span>Abrir en Google Maps</span></a>
          <div class="cll-meta" data-r="meta"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(ov);

  const q = (r) => ov.querySelector(`[data-r="${r}"]`);
  _els = {
    ov, sub: q("sub"), close: q("close"), frame: q("frame"), modes: q("modes"), loc: q("loc"),
    locTitle: q("locTitle"), locMsg: q("locMsg"), locBtn: q("locBtn"),
    addr: q("addr"), ref: q("ref"), gm: q("gm"), meta: q("meta"), skel: ov.querySelector(".cll-skel"),
  };

  ov.addEventListener("click", (e) => { if (e.target === ov) cerrar(); });
  _els.close.addEventListener("click", cerrar);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && ov.classList.contains("open")) cerrar(); });
  _els.locBtn.addEventListener("click", pedirUbicacion);
  _els.modes.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]");
    if (!b || !_st) return;
    _st.mode = b.dataset.mode;
    pintar();
  });
  _els.frame.addEventListener("load", () => {
    _els.frame.classList.add("show");
    _els.skel.style.display = "none";
  });
  return _els;
}

function embedUrl() {
  const { dest, user, mode } = _st;
  const d = `${dest.lat},${dest.lng}`;
  const m = MODES.find((x) => x.k === mode) || MODES[0];
  if (MAPS_EMBED_KEY) {
    const base = "https://www.google.com/maps/embed/v1/";
    return user
      ? `${base}directions?key=${MAPS_EMBED_KEY}&origin=${user.lat},${user.lng}&destination=${d}&mode=${m.k}`
      : `${base}place?key=${MAPS_EMBED_KEY}&q=${d}&zoom=16`;
  }
  return user
    ? `https://maps.google.com/maps?saddr=${user.lat},${user.lng}&daddr=${d}&dirflg=${m.flag}&hl=es&output=embed`
    : `https://maps.google.com/maps?q=${d}&z=16&hl=es&output=embed`;
}

function gmapsUrl() {
  const { dest, user, mode } = _st;
  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  u.searchParams.set("destination", `${dest.lat},${dest.lng}`);
  if (user) u.searchParams.set("origin", `${user.lat},${user.lng}`);
  u.searchParams.set("travelmode", (MODES.find((x) => x.k === mode) || MODES[0]).gm);
  return u.toString();
}

function pintar() {
  const e = _els;
  const url = embedUrl();
  if (e.frame.dataset.src !== url) {
    e.frame.dataset.src = url;
    e.frame.classList.remove("show");
    e.skel.style.display = "";
    e.frame.src = url;
  }
  e.gm.href = gmapsUrl();
  e.modes.classList.toggle("hide", !_st.user);
  e.modes.querySelectorAll(".cll-mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === _st.mode));
  e.loc.classList.toggle("hide", !!_st.user);
  e.meta.textContent = _st.user ? "Ruta desde tu ubicación actual" : "Mostrando solo el destino";
}

function setLocUI({ title, msg, btnText, loading = false, disabled = false }) {
  const e = _els;
  e.locTitle.textContent = title;
  e.locMsg.textContent = msg;
  e.locBtn.disabled = disabled || loading;
  e.locBtn.innerHTML = loading ? `<span class="cll-spin"></span><span>${btnText}</span>` : `${ICON_LOC}<span>${btnText}</span>`;
}

function pedirUbicacion() {
  if (!_st) return;
  if (!("geolocation" in navigator)) {
    setLocUI({ title: "Ubicación no disponible", msg: "Tu navegador no permite obtener la ubicación. Usa el botón de Google Maps.", btnText: "No disponible", disabled: true });
    return;
  }
  setLocUI({ title: "Obteniendo tu ubicación…", msg: "Acepta el permiso si el navegador te lo pide.", btnText: "Buscando", loading: true });
  const token = _st.token;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (!_st || _st.token !== token) return;
      _st.user = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      pintar();
    },
    (err) => {
      if (!_st || _st.token !== token) return;
      if (err.code === 1) {
        setLocUI({
          title: "Ubicación bloqueada",
          msg: "Permítela desde el candado junto a la dirección del navegador y vuelve a intentar.",
          btnText: "Reintentar",
        });
      } else {
        setLocUI({ title: "No pudimos ubicarte", msg: "Revisa que el GPS esté activo e inténtalo de nuevo.", btnText: "Reintentar" });
      }
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
  );
}

export async function abrirComoLlegar({ lat, lng, nombre = "", direccion = "", referencia = "" } = {}) {
  lat = Number(lat); lng = Number(lng);
  if (!lat || !lng) return false;
  const e = ensureDom();

  _st = { dest: { lat, lng }, user: null, mode: "driving", token: Date.now() };
  e.sub.textContent = nombre || "Ruta hasta el negocio";
  e.addr.textContent = direccion && direccion !== "—" ? direccion : "No disponible";
  e.ref.textContent = referencia && referencia !== "—" ? referencia : "Sin referencia";
  setLocUI({ title: "Activa tu ubicación", msg: "Para trazar la ruta desde donde estás hasta el negocio.", btnText: "Activar ubicación" });
  e.frame.dataset.src = "";
  pintar();

  e.ov.classList.remove("open");
  void e.ov.offsetHeight;
  requestAnimationFrame(() => requestAnimationFrame(() => e.ov.classList.add("open")));
  document.body.style.overflow = "hidden";

  // Si el permiso ya fue concedido antes, traza la ruta sin pedir nada
  try {
    const p = await navigator.permissions?.query({ name: "geolocation" });
    if (p?.state === "granted") pedirUbicacion();
    else if (p?.state === "denied")
      setLocUI({ title: "Ubicación bloqueada", msg: "Permítela desde el candado junto a la dirección del navegador y vuelve a intentar.", btnText: "Reintentar" });
  } catch { /* Safari antiguo: el usuario pulsa el botón */ }
  return true;
}

export function cerrar() {
  if (!_els) return;
  _els.ov.classList.remove("open");
  document.body.style.overflow = "";
  _st = null;
  setTimeout(() => { if (_els && !_els.ov.classList.contains("open")) _els.frame.src = "about:blank"; }, 350);
}

window.abrirComoLlegar = abrirComoLlegar;