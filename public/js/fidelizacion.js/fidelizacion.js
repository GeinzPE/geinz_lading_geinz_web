import { db, auth } from "../db/db.js";
import {
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { tiendaDoc, clienteDoc, tiendaDescuentosCol, data_user_logeado } from "../rutas/rutas.js";
import { setFaviconCircular } from "../favicon/favicon.js";

// ─── Localidad (mismo criterio que paths.js: hardcodeado por ahora) ───
const LOCALIDAD = "barranca";

// ─── Parámetros de la URL ───
const urlParams = new URLSearchParams(window.location.search);
const NEGOCIO_ID = urlParams.get("id");

const USUARIOS_ROOT = "Trabajadores_Usuarios_Drivers/users/users";
const LOGO_FALLBACK_URL = "https://firebasestorage.googleapis.com/v0/b/geinzworkapp.appspot.com/o/tiendas%2FfW7W8RsgkkQ3IYfxKHGR%2Flogo%2Flogo.webp?alt=media&token=bb6e8d14-131a-449b-92bf-e4675bdab41b";

const NIVELES = [
  { min: 0,   label: "Nivel Bronce" },
  { min: 150, label: "Nivel Plata"  },
  { min: 400, label: "Nivel Oro VIP" },
];

async function cargarProductos(negocioId){
  try{
    const col = tiendaDescuentosCol(LOCALIDAD, negocioId);
    const snap = await getDocs(col);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }catch(e){
    console.error(e);
    return [];
  }
}

async function cargarUsuario(idUsuario){
  if(!idUsuario) return {};
  const snap = await getDoc(data_user_logeado(idUsuario));
  return snap.exists() ? snap.data() : {};
}

function cargarLogoYColor(logoURL, nombreTienda){
  return new Promise((resolve) => {
    const img = document.getElementById("logoImg");
    if(!img || !logoURL){
      resolve(colorFromName(nombreTienda));
      return;
    }
    
    // Actualiza el favicon dinámicamente con el logo del negocio
    setFaviconCircular(logoURL);

    img.src = logoURL;
    img.onload = async () => {
      img.classList.remove("hidden");
      document.getElementById("logoSkeleton")?.remove();
      let color = await getDominantColor(img);
      resolve(color || colorFromName(nombreTienda));
    };
    img.onerror = () => {
      document.getElementById("logoSkeleton")?.remove();
      resolve(colorFromName(nombreTienda));
    };
  });
}

let brandDarkHex = "#2e1065";
const qrState = { code: null, colorReady: false, rendered: false };

function calcularNivel(puntos){
  let elegido = NIVELES[0];
  for(const n of NIVELES){ if(puntos >= n.min) elegido = n; }
  return elegido.label;
}

function capitalizar(texto){
  return String(texto || "")
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

function formatearFechaInicio(timestamp){
  try{
    const fecha = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return new Intl.DateTimeFormat("es-PE", { month: "short", year: "numeric" }).format(fecha);
  }catch{
    return null;
  }
}

function showError(msg){
  const box = document.getElementById("errorBox");
  if(!box) return;
  box.innerHTML = msg;
  box.classList.remove("hidden");
}

/* ── Gate: no logeado. Oculta la tarjeta (sin destruirla) y muestra
   el aviso dentro del contenedor de skeleton. ── */
function showLoginGate(){
  const skel = document.getElementById("fullSkeleton");
  if(skel){
    skel.innerHTML = `
      <div class="w-full max-w-sm mx-auto text-center px-4">
        <div class="rounded-[24px] border border-white/5 bg-[#0d0e12] px-6 py-10 flex flex-col items-center">
          <div class="logo-avatar mb-5"><div class="logo-avatar-inner">
            <div class="w-full h-full skeleton"></div>
          </div></div>
          <p class="font-display font-semibold text-white text-base mb-2">Inicia sesión para ver tu tarjeta</p>
          <p class="text-white/40 text-xs font-mono-card mb-6 leading-relaxed">Necesitas tu cuenta de Geinz para ver tus puntos y canjear recompensas.</p>
          <a href="../logindata/login.html?redirect=${encodeURIComponent(window.location.href)}"
             class="btn-redeem px-6 py-3 rounded-xl text-sm font-semibold inline-block">Iniciar sesión</a>
        </div>
      </div>`;
  }
}

/* ── Gate: logeado pero no sigue el negocio. Igual: oculta, no destruye. ── */
function showFollowGate(nombreTienda, logoURL, onFollow){
  const skel = document.getElementById("fullSkeleton");
  if(!skel) return;
  
  if(logoURL) {
    setFaviconCircular(logoURL);
  }

  skel.innerHTML = `
    <div class="w-full max-w-sm mx-auto text-center px-4">
      <div class="rounded-[24px] border border-white/5 bg-[#0d0e12] px-6 py-10 flex flex-col items-center">
        <div class="logo-avatar mb-5"><div class="logo-avatar-inner">
          ${logoURL ? `<img src="${logoURL}" alt="Logo" class="w-full h-full object-cover" crossorigin="anonymous">` : `<div class="w-full h-full skeleton"></div>`}
        </div></div>
        <p class="font-display font-semibold text-white text-base mb-2">Sigue a ${nombreTienda || "este negocio"}</p>
        <p class="text-white/40 text-xs font-mono-card mb-6 leading-relaxed">Para ver tu tarjeta y las recompensas que puedes canjear, primero debes seguir este negocio.</p>
        <button id="btnSeguirNegocio" class="btn-redeem px-6 py-3 rounded-xl text-sm font-semibold w-full max-w-[220px]">Seguir negocio</button>
        <p id="followError" class="hidden text-red-400/80 text-xs mt-3"></p>
      </div>
    </div>`;

  document.getElementById("btnSeguirNegocio").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Siguiendo...";
    try{
      await onFollow();
    }catch(err){
      console.error(err);
      btn.disabled = false;
      btn.textContent = "Seguir negocio";
      const errEl = document.getElementById("followError");
      if(errEl){
        errEl.textContent = "No se pudo completar, intenta de nuevo.";
        errEl.classList.remove("hidden");
      }
    }
  });
}

function getDominantColor(imgEl){
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const SIZE = 100;
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext("2d");

    try{
      ctx.drawImage(imgEl, 0, 0, SIZE, SIZE);
      const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
      const buckets = {};

      for(let i = 0; i < data.length; i += 4){
        const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
        if(a < 128) continue;

        const rn = r/255, gn = g/255, bn = b/255;
        const max = Math.max(rn,gn,bn), min = Math.min(rn,gn,bn);
        const l = (max+min)/2;
        const s = max===min ? 0 : (l>0.5 ? (max-min)/(2-max-min) : (max-min)/(max+min));

        if(l > 0.8 || l < 0.1 || s < 0.25) continue;

        const br = r >> 4, bg = g >> 4, bb = b >> 4;
        const key = `${br},${bg},${bb}`;
        if(!buckets[key]) buckets[key] = { count:0, r:0, g:0, b:0 };
        buckets[key].count++;
        buckets[key].r += r; buckets[key].g += g; buckets[key].b += b;
      }

      const sorted = Object.values(buckets).sort((a,b) => b.count - a.count);
      if(!sorted.length){ resolve(null); return; }

      const top = sorted[0];
      resolve({
        r: Math.round(top.r / top.count),
        g: Math.round(top.g / top.count),
        b: Math.round(top.b / top.count),
      });
    }catch(e){
      resolve(null);
    }
  });
}

function colorFromName(name){
  let hash = 0;
  const str = name || "Fidelidad";
  for(let i = 0; i < str.length; i++){
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash % 360);
  return hslToRgb(hue/360, 0.65, 0.5);
}

function rgbToHex(r,g,b){
  return "#" + [r,g,b].map(v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join("");
}

function rgbToHsl(r,g,b){
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h,s,l=(max+min)/2;
  if(max===min){ h=s=0; }
  else{
    const d = max-min;
    s = l>0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h=(g-b)/d + (g<b?6:0); break;
      case g: h=(b-r)/d + 2; break;
      case b: h=(r-g)/d + 4; break;
    }
    h/=6;
  }
  return {h,s,l};
}

function hslToRgb(h,s,l){
  let r,g,b;
  if(s===0){ r=g=b=l; }
  else{
    const hue2rgb=(p,q,t)=>{
      if(t<0)t+=1; if(t>1)t-=1;
      if(t<1/6) return p+(q-p)*6*t;
      if(t<1/2) return q;
      if(t<2/3) return p+(q-p)*(2/3-t)*6;
      return p;
    };
    const q = l<0.5 ? l*(1+s) : l+s-l*s;
    const p = 2*l-q;
    r = hue2rgb(p,q,h+1/3); g = hue2rgb(p,q,h); b = hue2rgb(p,q,h-1/3);
  }
  return { r:r*255, g:g*255, b:b*255 };
}

function aplicarColorMarca({ r, g, b }){
  if(r == null) return;
  const { h, s } = rgbToHsl(r, g, b);

  const vivid = hslToRgb(h, Math.max(s, 0.6), 0.50);
  document.documentElement.style.setProperty("--brand-vivid", rgbToHex(vivid.r, vivid.g, vivid.b));

  const glow = hslToRgb(h, Math.max(s, 0.65), 0.35);
  document.documentElement.style.setProperty("--brand-glow", rgbToHex(glow.r, glow.g, glow.b));

  const dark = hslToRgb(h, Math.max(s, 0.5), 0.12);
  const darkHex = rgbToHex(dark.r, dark.g, dark.b);
  document.documentElement.style.setProperty("--brand-dark", darkHex);

  brandDarkHex = darkHex;
  qrState.colorReady = true;
  tryRenderQR();
}

function initTilt(){
  const scene = document.querySelector(".card-scene");
  if(!scene) return;
  const card  = document.getElementById("cardTilt");
  const max = 6;

  function updateTilt(clientX, clientY){
    const rect = scene.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const py = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    const rotY = (px - 0.5) * max * 2;
    const rotX = (0.5 - py) * max * 2;
    card.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.015)`;
    card.style.setProperty("--mx", `${px*100}%`);
    card.style.setProperty("--my", `${py*100}%`);
  }
  function resetTilt(){
    card.style.transform = "rotateX(0deg) rotateY(0deg) scale(1)";
  }

  scene.addEventListener("mousemove", (e) => updateTilt(e.clientX, e.clientY));
  scene.addEventListener("mouseleave", resetTilt);

  scene.addEventListener("touchstart", (e) => {
    scene.classList.add("is-active");
    updateTilt(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  scene.addEventListener("touchmove", (e) => {
    updateTilt(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  scene.addEventListener("touchend", () => {
    scene.classList.remove("is-active");
    resetTilt();
  });
}

function initFlip(){
  const flipper = document.getElementById("cardFlipper");
  if(!flipper) return;
  const toggle = () => flipper.classList.toggle("is-flipped");

  flipper.addEventListener("click", toggle);
  flipper.addEventListener("keydown", (e) => {
    if(e.key === "Enter" || e.key === " "){
      e.preventDefault();
      toggle();
    }
  });
}

function renderBarcode(seedStr){
  const svg = document.getElementById("barcodeSvg");
  if(!svg) return;
  const width = 220, height = 28;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = "";

  let seed = 0;
  for(let i=0; i<seedStr.length; i++) seed += seedStr.charCodeAt(i) * (i + 7);
  if(seed === 0) seed = 42;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

  let x = 0;
  while(x < width){
    const w = 1 + Math.floor(rand() * 2.5);
    if(rand() > 0.2){
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", x); rect.setAttribute("y", 0);
      rect.setAttribute("width", w); rect.setAttribute("height", height);
      rect.setAttribute("fill", "currentColor");
      rect.setAttribute("opacity", (0.45 + rand() * 0.55).toFixed(2));
      svg.appendChild(rect);
    }
    x += w + 1 + Math.floor(rand() * 2);
  }

  document.getElementById("barcodeSkeleton")?.classList.add("hidden");
  svg.classList.remove("hidden");
}

function crearQREstilizado(codigoStr, colorHex){
  return new window.QRCodeStyling({
    width: 300,
    height: 300,
    type: "canvas",
    data: codigoStr,
    margin: 10,
    qrOptions: { errorCorrectionLevel: "H" },
    dotsOptions: { type: "dots", color: colorHex },
    cornersSquareOptions: { type: "extra-rounded", color: colorHex },
    cornersDotOptions: { type: "dot", color: colorHex },
    backgroundOptions: { color: "#fdfdfd" }
  });
}

function pintarQR(codigoStr, colorHex){
  const canvasHost = document.getElementById("qrCanvas");
  if(!canvasHost) return;

  if(typeof window.QRCodeStyling === "function"){
    canvasHost.innerHTML = "";
    const qr = crearQREstilizado(codigoStr, colorHex);
    qr.append(canvasHost);
    document.getElementById("qrSkeleton")?.remove();
    canvasHost.classList.remove("hidden");
  }

  const qrText = document.getElementById("qrCodeText");
  if(qrText) qrText.textContent = "ID: " + codigoStr;
}

function tryRenderQR(){
  if(qrState.rendered || !qrState.code) return;
  pintarQR(qrState.code, brandDarkHex);
  qrState.rendered = true;
}

function textoBeneficio(p){
  if(p.origen !== "catalogo" || p.precioOriginal == null) return null;
  const orig = Number(p.precioOriginal);
  const d = p.descuento || {};
  switch(p.tipoBeneficio){
    case "monto": {
      const monto = Number(d.monto || 0);
      const final = p.precioFinalEstimado != null ? Number(p.precioFinalEstimado) : Math.max(0, orig - monto);
      return `S/ ${orig.toFixed(2)} → <b>S/ ${final.toFixed(2)}</b> (–S/ ${monto.toFixed(2)})`;
    }
    case "porcentaje": {
      const pct = Number(d.porcentaje || 0);
      const final = p.precioFinalEstimado != null ? Number(p.precioFinalEstimado) : Math.max(0, orig * (1 - pct / 100));
      return `S/ ${orig.toFixed(2)} → <b>S/ ${final.toFixed(2)}</b> (–${pct}%)`;
    }
    case "cantidad": {
      const compra = d.compraUnidades ?? "?";
      const paga = d.pagaUnidades ?? "?";
      return `S/ ${orig.toFixed(2)} c/u · <b>${compra}x${paga}</b>`;
    }
    case "gratis":
    default:
      return `S/ ${orig.toFixed(2)} · <b>gratis con puntos</b>`;
  }
}

function renderRecompensas(productos, puntosCliente){
  const grid = document.getElementById("rewardsGrid");
  if(!grid) return;
  grid.innerHTML = "";

  if(!productos.length){
    grid.innerHTML = `<p class="col-span-2 text-center text-white/30 text-xs font-mono-card py-6">Aún no hay recompensas disponibles.</p>`;
    return;
  }

  productos.forEach(p => {
    const costo = Number(p.costoPuntos ?? 0);
    const alcanza = puntosCliente >= costo;
    const beneficioTxt = textoBeneficio(p);
    const el = document.createElement("div");
    el.className = "reward-card rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between";
    el.innerHTML = `
      <div class="min-w-0">
        <div class="reward-icon overflow-hidden mb-2.5">
          ${p.imagenUrl
            ? `<img src="${p.imagenUrl}" alt="${p.nombre || ''}" class="w-full h-full object-cover rounded-xl" loading="lazy">`
            : `<span class="text-base sm:text-lg">🎁</span>`}
        </div>
        <p class="font-display text-[12.5px] sm:text-xs font-semibold leading-tight text-white break-words">${p.nombre || "Producto"}</p>
        ${beneficioTxt ? `<p class="font-mono-card text-[10px] sm:text-[10.5px] text-white/45 mt-1 leading-snug">${beneficioTxt}</p>` : ""}
        <p class="font-mono-card text-[10.5px] sm:text-xs text-white/40 mt-1">${costo} pts</p>
      </div>
      <button class="btn-redeem mt-3 sm:mt-4 text-[11px] font-mono-card font-semibold rounded-lg py-2 w-full active:scale-[0.97]" ${alcanza ? "" : "disabled"}>
        ${alcanza ? "CANJEAR" : "BLOQUEADO"}
      </button>
    `;
    grid.appendChild(el);
  });
}

function revealCard(){
  const skel = document.getElementById("fullSkeleton");
  const content = document.getElementById("appContent");
  if(!content) return;
  content.style.opacity = "1";
  content.style.pointerEvents = "auto";
  if(skel){
    skel.style.transition = "opacity .4s ease";
    skel.style.opacity = "0";
    setTimeout(() => skel.remove(), 420);
  }
}

async function seguirNegocio(uid){
  const ref = clienteDoc(LOCALIDAD, NEGOCIO_ID, uid);
  await setDoc(ref, {
    id: uid,
    id_usuario: uid,
    puntos: 0,
    fecha_inicio: serverTimestamp(),
    ultimo_consumo: serverTimestamp(),
  });
}

async function cargarDatos(uid){
  try{
    if(!NEGOCIO_ID || !uid) throw new Error("Faltan parámetros.");

    const tiendaRef  = tiendaDoc(LOCALIDAD, "tiendas", NEGOCIO_ID);
    const clienteRef = clienteDoc(LOCALIDAD, NEGOCIO_ID, uid);

    const [tiendaSnap, clienteSnap] = await Promise.all([
      getDoc(tiendaRef),
      getDoc(clienteRef),
    ]);

    const tienda = tiendaSnap.exists() ? tiendaSnap.data() : {};
    const nombreTienda = tienda.nombre_tienda || "Mi Negocio";
    const logoURL = tienda.logoURL || tienda.logo || tienda.urlLogo || LOGO_FALLBACK_URL;

    if(!clienteSnap.exists()){
      showFollowGate(nombreTienda, logoURL, async () => {
        await seguirNegocio(uid);
        await cargarDatos(uid);
      });
      return;
    }

    const cliente = clienteSnap.data();

    const storeNameEl = document.getElementById("storeName");
    if(storeNameEl) storeNameEl.textContent = nombreTienda;

    const [colorLogo, usuario, productos] = await Promise.all([
      cargarLogoYColor(logoURL, nombreTienda),
      cargarUsuario(cliente.id_usuario),
      cargarProductos(NEGOCIO_ID),
    ]);

    aplicarColorMarca(colorLogo);

    const nombreCliente = [capitalizar(usuario.nombre), capitalizar(usuario.apellido)]
      .filter(Boolean).join(" ") || usuario.nombre_user || "Cliente Frecuente";

    const puntos = Number(cliente.puntos ?? 0);
    const nivel = calcularNivel(puntos);
    const codigo = cliente.id || clienteSnap.id;
    const clienteDesde = formatearFechaInicio(cliente.fecha_inicio);

    document.getElementById("clientName") && (document.getElementById("clientName").textContent = nombreCliente);
    document.getElementById("clientPoints") && (document.getElementById("clientPoints").textContent = puntos.toLocaleString("es-PE"));
    document.getElementById("clientCode") && (document.getElementById("clientCode").textContent = "ID: " + codigo);
    document.getElementById("tierBadge") && (document.getElementById("tierBadge").textContent = nivel);
    document.getElementById("pointsHint") && (document.getElementById("pointsHint").textContent = `${puntos.toLocaleString("es-PE")} pts`);
    renderBarcode(String(codigo));

    qrState.code = String(codigo);
    tryRenderQR();

    if(clienteDesde){
      const pointsEl = document.getElementById("clientPoints");
      if(pointsEl){
        const p = document.createElement("p");
        p.className = "fluid-eyebrow text-white/30 mt-1.5 font-mono-card uppercase";
        p.textContent = `Cliente desde ${clienteDesde}`;
        pointsEl.insertAdjacentElement("afterend", p);
      }
    }

    renderRecompensas(productos, puntos);
    initTilt();
    initFlip();
    revealCard();

  }catch(err){
    console.error(err);
    showError("No se pudieron cargar los datos.");
    document.getElementById("logoSkeleton")?.remove();
    revealCard();
  }
}

/* ══════════════════════════════════════════
   INIT
   ══════════════════════════════════════════ */
if (!NEGOCIO_ID) {
  showError("Enlace inválido: falta el negocio.");
} else {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      showLoginGate();
      return;
    }
    cargarDatos(user.uid);
  });
}