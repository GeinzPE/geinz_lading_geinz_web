// ── Firebase (módulos ESM) ──────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const _urlParams = new URLSearchParams(window.location.search);
let tiendaId = _urlParams.get("id") || sessionStorage.getItem("tiendaId");
let localidad =
  _urlParams.get("localidad") || sessionStorage.getItem("localidad");

const app = initializeApp({
  apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
  authDomain: "geinzworkapp.firebaseapp.com",
  projectId: "geinzworkapp",
  storageBucket: "geinzworkapp.appspot.com",
  messagingSenderId: "921389328767",
  appId: "1:921389328767:web:094e8a2a5fcd69395b524a",
});

const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
let imgsCount = 0;
let imagesData = [null, null, null, null, null];
let selectedImageIndex = null;
let precioYaSeteado = false;
let terminosAceptados = false;

let tipoTextoIA = "venta";
let tipoImagenIA = "venta";

let _precios = {
  ia_imagen_texto: 0,
  mejora_texto_x3: 0,
  mensaje_w_c: 0,
  publicacion_24h: 100, // 100 créditos por día
  publicacion_x_hora: 10, // 10 créditos por hora
  costo_por_moneda: 0.012,
};

// ── Inyectar estilos del bottom sheet de términos ──────
(function inyectarEstilosTerminos() {
  const style = document.createElement("style");
  style.textContent = `
    /* ── TERMS BOTTOM SHEET ── */
    .terms-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(4px);
      z-index: 9000;
      display: flex; align-items: flex-end; justify-content: center;
      opacity: 0; pointer-events: none;
      transition: opacity .3s ease;
    }
    .terms-overlay.open {
      opacity: 1; pointer-events: auto;
    }
    .terms-sheet {
      width: 100%; max-width: 640px;
      background: #0f0f13;
      border-radius: 24px 24px 0 0;
      border-top: 1px solid rgba(255,255,255,0.08);
      max-height: 85vh;
      display: flex; flex-direction: column;
      transform: translateY(100%);
      transition: transform .35s cubic-bezier(0.34,1.2,0.64,1);
      overflow: hidden;
    }
    .terms-overlay.open .terms-sheet {
      transform: translateY(0);
    }
    .terms-sheet-handle {
      width: 40px; height: 4px;
      background: rgba(255,255,255,0.2);
      border-radius: 2px;
      margin: 14px auto 0;
      flex-shrink: 0;
    }
    .terms-sheet-header {
      padding: 20px 24px 16px;
      flex-shrink: 0;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .terms-sheet-title {
      font-size: 17px; font-weight: 700; color: #fff;
      margin: 0 0 6px;
    }
    .terms-sheet-intro {
      font-size: 13px; color: #9ca3af; margin: 0; line-height: 1.5;
    }
    .terms-sheet-body {
      overflow-y: auto; padding: 20px 24px 32px;
      flex: 1;
      -webkit-overflow-scrolling: touch;
    }
    .terms-card {
      background: #1a1a24;
      border-radius: 16px;
      padding: 20px;
      border: 1px solid rgba(255,255,255,0.06);
    }
    .terms-section { margin-bottom: 20px; }
    .terms-section:last-child { margin-bottom: 0; }
    .terms-section-title {
      font-size: 13px; font-weight: 700;
      letter-spacing: 0.04em;
      margin: 0 0 10px;
      display: flex; align-items: center; gap: 7px;
    }
    .terms-section-title.purple { color: #a78bfa; }
    .terms-section-title.orange { color: #fb923c; }
    .terms-section-title.gray   { color: #94a3b8; }
    .terms-list {
      list-style: none; padding: 0; margin: 0;
      display: flex; flex-direction: column; gap: 7px;
    }
    .terms-list li {
      display: flex; align-items: flex-start; gap: 8px;
      font-size: 13px; color: #d1d5db; line-height: 1.5;
    }
    .terms-list li::before {
      content: "•"; color: #6b7280;
      font-size: 16px; flex-shrink: 0; margin-top: -1px;
    }
    .terms-sheet-close {
      margin: 0 24px 24px;
      padding: 14px;
      background: #7c3aed;
      color: #fff; border: none; border-radius: 14px;
      font-size: 14px; font-weight: 600;
      cursor: pointer; flex-shrink: 0;
      transition: background .2s;
    }
    .terms-sheet-close:hover { background: #6d28d9; }

    /* ── FOOTER PUBLICAR ── */
    .footer-terms-row {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 0 4px;
    }
    .terms-checkbox {
      width: 18px; height: 18px;
      accent-color: #7c3aed;
      cursor: pointer; flex-shrink: 0;
    }
    .terms-label-text {
      font-size: 13px; color: #9ca3af; line-height: 1.4;
    }
    .terms-label-text .terms-link {
      color: #a78bfa;
      text-decoration: underline;
      cursor: pointer;
      background: none; border: none;
      font-size: 13px; padding: 0;
    }
    .btn-submit:disabled {
      opacity: 0.45; cursor: not-allowed;
      pointer-events: none;
    }

    /* ── FECHA INPUT LEGIBLE ── */
    input[type="date"] {
      color-scheme: dark;
      background: var(--bg-input, #1e1e2a);
      color: #f0f0f0;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      padding: 10px 12px;
      width: 100%;
      font-size: 14px;
    }
    input[type="date"]::-webkit-calendar-picker-indicator {
      filter: invert(1) opacity(0.6);
      cursor: pointer;
    }
    .saldo-insuficiente-warn {
      background: rgba(239,68,68,0.1);
      border: 1px solid rgba(239,68,68,0.3);
      border-radius: 10px;
      padding: 8px 12px;
      font-size: 12px;
      color: #f87171;
      margin-top: 8px;
      display: none;
    }
    .saldo-insuficiente-warn.visible { display: block; }
  `;
  document.head.appendChild(style);
})();

// ── Inyectar bottom sheet de términos en el DOM ─────────
(function inyectarTerminosSheet() {
  const sheet = document.createElement("div");
  sheet.className = "terms-overlay";
  sheet.id = "termsOverlay";
  sheet.innerHTML = `
    <div class="terms-sheet" id="termsSheet">
      <div class="terms-sheet-handle"></div>
      <div class="terms-sheet-header">
        <p class="terms-sheet-title">Políticas de publicaciones y promociones</p>
        <p class="terms-sheet-intro">Al crear y publicar contenido dentro de la plataforma, el usuario acepta cumplir las siguientes normas:</p>
      </div>
      <div class="terms-sheet-body">
        <div class="terms-card">
          <div class="terms-section">
            <p class="terms-section-title purple">✦ Responsabilidades del publicador</p>
            <ul class="terms-list">
              <li>Verificar que la información publicada sea clara, veraz y actualizada.</li>
              <li>Revisar cuidadosamente el contenido antes de publicarlo.</li>
              <li>Respetar los días, horarios y duración definidos para cada publicación.</li>
              <li>Cumplir con las condiciones ofrecidas en promociones y servicios.</li>
              <li>Mantener coherencia entre el contenido publicado y el servicio real brindado.</li>
            </ul>
          </div>
          <div class="terms-section">
            <p class="terms-section-title orange">⚠ Contenido no permitido</p>
            <ul class="terms-list">
              <li>Información falsa, engañosa o que induzca a error.</li>
              <li>Promociones que no puedan ser cumplidas.</li>
              <li>Contenido fraudulento, confuso o manipulado.</li>
              <li>Publicaciones repetitivas con fines de spam.</li>
              <li>Contenido que infrinja leyes, normas o derechos de terceros.</li>
            </ul>
          </div>
          <div class="terms-section">
            <p class="terms-section-title gray">⚙ Medidas y sanciones</p>
            <ul class="terms-list">
              <li>La plataforma puede revisar, modificar o retirar publicaciones.</li>
              <li>El incumplimiento puede derivar en suspensión temporal o permanente.</li>
              <li>Reincidencias pueden limitar el acceso a futuras publicaciones.</li>
            </ul>
          </div>
        </div>
      </div>
      <button class="terms-sheet-close" onclick="cerrarTerminos()">Entendido</button>
    </div>`;
  document.body.appendChild(sheet);

  // Cerrar al tocar el fondo
  sheet.addEventListener("click", (e) => {
    if (e.target === sheet) cerrarTerminos();
  });
})();

window.abrirTerminos = function () {
  document.getElementById("termsOverlay")?.classList.add("open");
};
window.cerrarTerminos = function () {
  document.getElementById("termsOverlay")?.classList.remove("open");
};

// ── Aplicar precios recibidos al DOM ────────────────────
function aplicarPreciosEnDOM() {
  const precioImgEl = document.getElementById("precioImagenIA");
  if (precioImgEl) precioImgEl.textContent = _precios.ia_imagen_texto;

  const btnDesc = document.getElementById("btnDescripcionIA");
  if (btnDesc) {
    let priceSpan = btnDesc.querySelector(".ia-zona-btn-price");
    if (!priceSpan) {
      priceSpan = document.createElement("span");
      priceSpan.className = "ia-zona-btn-price";
      btnDesc.appendChild(priceSpan);
    }
    priceSpan.textContent = _precios.mejora_texto_x3;
  }

  const precioWpEl = document.getElementById("precioMensajeWpIA");
  if (precioWpEl) precioWpEl.textContent = `${_precios.mensaje_w_c}`;

  const precioShareEl = document.getElementById("precioShareIA");
  if (precioShareEl) precioShareEl.textContent = `${_precios.mensaje_w_c}`;

  actualizarCostoPublicar();
  actualizarBotonesIA();
}

// ── Calcula costo total y actualiza botón ───────────────

// ==================== BANNER SALDO BAJO ====================
(function inyectarEstilosBanner() {
  const style = document.createElement("style");
  style.textContent = `
    .saldo-bajo-banner {
      display: none;
      margin: 0 0 18px;
      background: linear-gradient(135deg, rgba(234,88,12,0.12) 0%, rgba(239,68,68,0.08) 100%);
      border: 1px solid rgba(234,88,12,0.35);
      border-left: 4px solid #ea580c;
      border-radius: 14px;
      padding: 14px 16px 14px 14px;
      animation: bannerFadeIn .35s ease;
    }
    .saldo-bajo-banner.visible { display: flex; }
    @keyframes bannerFadeIn {
      from { opacity: 0; transform: translateY(-6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .banner-icon-wrap {
      flex-shrink: 0;
      width: 36px; height: 36px;
      background: rgba(234,88,12,0.15);
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      margin-right: 12px;
    }
    .banner-icon-wrap i { font-size: 18px; color: #fb923c; }
    .banner-body { flex: 1; }
    .banner-title {
      font-size: 13px; font-weight: 700; color: #fdba74;
      margin: 0 0 4px; display: flex; align-items: center; gap: 6px;
    }
    .banner-badge {
      font-size: 10px; font-weight: 700; letter-spacing: .05em;
      background: rgba(234,88,12,0.25); color: #fb923c;
      border: 1px solid rgba(234,88,12,0.4);
      padding: 1px 7px; border-radius: 999px;
      text-transform: uppercase;
    }
    .banner-text {
      font-size: 12px; color: #d1d5db; line-height: 1.55; margin: 0;
    }
    .banner-text strong { color: #fdba74; }
    .banner-close {
      flex-shrink: 0; align-self: flex-start;
      background: none; border: none; color: #6b7280;
      font-size: 16px; cursor: pointer; padding: 2px 4px;
      line-height: 1; transition: color .2s;
      margin-left: 8px;
    }
    .banner-close:hover { color: #d1d5db; }
  `;
  document.head.appendChild(style);
})();

function inyectarBannerSaldoBajo() {
  if (document.getElementById("bannerSaldoBajo")) return;
  const banner = document.createElement("div");
  banner.id = "bannerSaldoBajo";
  banner.className = "saldo-bajo-banner";
  banner.innerHTML = `
 
    <div class="banner-body">
      <p class="banner-title">
        Alerta de saldo bajo
        <span class="banner-badge">Geinz</span>
      </p>
      <p class="banner-text">
        Priorizamos tu estabilidad y detectamos que tienes
        <strong>saldo bajo para crear publicaciones</strong>.
        Puedes crearlas con normalidad, pero si harás
        <strong>generaciones con IA</strong> o publicar por
        <strong>periodos largos</strong>, no queremos que te lleves
        malos resultados por no tener saldo suficiente.
      </p>
    </div>
    <button class="banner-close" onclick="ocultarBannerSaldo()" aria-label="Cerrar">✕</button>
  `;
  // Insertar al inicio del .card, antes del .grid
  const grid = document.querySelector(".card .grid");
  if (grid) grid.parentElement.insertBefore(banner, grid);
  else document.querySelector(".card")?.prepend(banner);
}

window.ocultarBannerSaldo = function () {
  const b = document.getElementById("bannerSaldoBajo");
  if (b) {
    b.style.animation = "bannerFadeIn .25s ease reverse";
    setTimeout(() => b.classList.remove("visible"), 220);
  }
};

function actualizarBannerSaldo(saldo) {
  inyectarBannerSaldoBajo();
  const b = document.getElementById("bannerSaldoBajo");
  if (!b) return;
  if (saldo < 300) {
    b.classList.add("visible");
  } else {
    b.classList.remove("visible");
  }
}

function parseFechaLocal(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}
// ── FUNCIÓN CENTRALIZADA (reemplaza todos los cálculos dispersos) ──
function calcularDias() {
  const fi = document.getElementById("fechaInicio")?.value;
  const ff = document.getElementById("fechaFin")?.value;
  if (!fi || !ff) return 0;
  const inicio = parseFechaLocal(fi);
  const fin = parseFechaLocal(ff);
  if (fin < inicio) return 0;
  // Diferencia exacta en días, sin Math.ceil (la diferencia ya es entera)
  return Math.round((fin - inicio) / 86400000);
}
function calcularCostoTotal() {
  const tipo =
    document.querySelector('input[name="plazo"]:checked')?.value || "dias";
  let total = 0;

  if (tipo === "horas") {
    const h = parseInt(document.getElementById("inputHoras")?.value || "1");
    total =
      isNaN(h) || h < 1
        ? _precios.publicacion_x_hora
        : h * _precios.publicacion_x_hora;
  } else {
    const fi = document.getElementById("fechaInicio")?.value;
    const ff = document.getElementById("fechaFin")?.value;
    if (fi && ff) {
      const inicio = parseFechaLocal(fi);
      const fin = parseFechaLocal(ff);
      if (fin >= inicio) {
        const dias = calcularDias();
        total = dias * _precios.publicacion_24h;
      }
    }
  }
  return total;
}

function actualizarCostoPublicar() {
  const btn = document.querySelector(".btn-submit");
  if (!btn) return;

  // Solo mostrar costo si hay imágenes seleccionadas
  if (imgsCount === 0) {
    btn.innerHTML = `<i class="ti ti-send" style="font-size:15px" aria-hidden="true"></i> Publicar promoción`;
    return;
  }

  const total = calcularCostoTotal();
  if (total > 0) {
    btn.innerHTML = `<i class="ti ti-send" style="font-size:15px" aria-hidden="true"></i>
      Publicar &nbsp;·&nbsp;
      <span style="display:inline-flex;align-items:center;gap:4px;font-weight:700;">
        ${total.toLocaleString("es-PE")}
        <img src="../img/icon_monedas_3d.webp" style="width:16px;height:16px;vertical-align:middle;" alt="pts">
      </span>`;
  } else {
    btn.innerHTML = `<i class="ti ti-send" style="font-size:15px" aria-hidden="true"></i> Publicar promoción`;
  }
}

// ── Verificar si el saldo es suficiente ─────────────────
function verificarSaldo() {
  const saldo = datosTienda?.saldo_tienda ?? 0;
  const total = calcularCostoTotal();
  const warn = document.getElementById("saldoInsuficienteWarn");
  const suficiente = saldo >= total && total > 0;

  if (warn) {
    if (total > 0 && saldo < total) {
      warn.textContent = `⚠️ Saldo insuficiente. Necesitas ${total.toLocaleString("es-PE")} créditos y tienes ${Number(saldo).toLocaleString("es-PE")}.`;
      warn.classList.add("visible");
    } else {
      warn.classList.remove("visible");
    }
  }
  return suficiente || total === 0;
}

// ── Validar si el botón publicar debe estar activo ──────
function actualizarEstadoBotonPublicar() {
  const btn = document.querySelector(".btn-submit");
  if (!btn) return;

  const titulo = document.getElementById("tituloInput")?.value.trim() || "";
  const desc = document.getElementById("descripcionInput")?.value.trim() || "";
  const tieneImagen = imgsCount > 0;
  const tieneTitulo = titulo.length >= 4;
  const tieneDesc = desc.length >= 10;
  const saldoOk = verificarSaldo();
  const terminosOk = terminosAceptados;

  const habilitado =
    tieneImagen && tieneTitulo && tieneDesc && saldoOk && terminosOk;
  btn.disabled = !habilitado;
}

const BULLETS = {
  venta: [
    "Lenguaje persuasivo orientado a conversión",
    "Llamados a la acción claros",
    "Genera urgencia moderada",
    "Ideal para ventas rápidas",
  ],
  llamado: [
    "Ganchos creativos y llamativos",
    "Preguntas que despiertan curiosidad",
    "Mayor visibilidad en el feed",
    "Ideal para atraer nuevos clientes",
  ],
  informativo: [
    "Tono profesional y confiable",
    "Explica claramente el valor",
    "Evita exageraciones",
    "Ideal para rubros técnicos o formales",
  ],
};

function renderBullets(tipo) {
  const container = document.getElementById("iaBullets");
  if (!container) return;
  container.innerHTML = BULLETS[tipo]
    .map(
      (b) => `
      <div class="ia-bullet">
        <div class="ia-bullet-icon"><i class="ti ti-check" style="font-size:10px"></i></div>
        <span>${b}</span>
      </div>`,
    )
    .join("");
}

window.selectTipoTexto = function (el) {
  document
    .querySelectorAll("#iaZonaTexto .ia-tipo-chip")
    .forEach((c) => c.classList.remove("active"));
  el.classList.add("active");
  tipoTextoIA = el.dataset.tipo;
  renderBullets(tipoTextoIA);
};

window.selectTipoImagen = function (el) {
  document
    .querySelectorAll("#iaZonaImagen .ia-tipo-chip")
    .forEach((c) => c.classList.remove("active"));
  el.classList.add("active");
  tipoImagenIA = el.dataset.tipo;
};

// ── Auth ────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (user) console.log("Usuario listo:", user.uid);
  else console.log("No hay sesión activa");
});

async function getToken() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      if (user) resolve(await user.getIdToken());
      else resolve(null);
    });
  });
}

let datosTienda = null;
const ID_TIENDA = tiendaId;
const LOCALIDAD = localidad;

/* ── STORAGE ── */
function dataURLtoBlob(dataURL) {
  const [header, base64] = dataURL.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(base64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function subirImagenesAStorage(id_tienda, id_promocion) {
  const urls = [];
  let botUrl = null;
  const primeraImg = imagesData.find((img) => img !== null);
  if (primeraImg) {
    try {
      const botDataURL = await comprimirImagen(primeraImg.data, 512, 0.7);
      const botBlob = dataURLtoBlob(botDataURL);
      const nombreBot = `bot_${Date.now()}.jpg`;
      const ref = storageRef(
        storage,
        `tiendas/${id_tienda}/imagenes/promociones_geinz/${id_promocion}/${nombreBot}`,
      );
      await uploadBytes(ref, botBlob, { contentType: "image/jpeg" });
      botUrl = await getDownloadURL(ref);
    } catch (e) {
      console.warn("⚠️ Error subiendo bot img:", e);
    }
  }
  for (let i = 0; i < imagesData.length; i++) {
    const img = imagesData[i];
    if (!img) continue;
    try {
      const comprimida = await comprimirImagen(img.data, 1024, 0.82);
      const blob = dataURLtoBlob(comprimida);
      const nombreImg = `img${i + 1}.webp`;
      const ref = storageRef(
        storage,
        `tiendas/${id_tienda}/imagenes/promociones_geinz/${id_promocion}/${nombreImg}`,
      );
      await uploadBytes(ref, blob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(ref);
      urls.push(url);
    } catch (e) {
      console.error(`❌ Error subiendo imagen ${i + 1}:`, e);
      throw new Error(`No se pudo subir la imagen ${i + 1}`);
    }
  }
  return { urls, botUrl };
}

async function guardarImagenesEnFirestore(
  id_tienda,
  logo_url,
  localidad,
  id_promocion,
  urls,
) {
  const imgContainer = { lista_img: urls, logo_img: logo_url };
  const data = { img_container: imgContainer };
  const ref1 = doc(db, "Tiendas", localidad, "promos_ofertas", id_promocion);
  const ref2 = doc(
    db,
    "Tiendas",
    localidad,
    localidad,
    id_tienda,
    "promociones_geinz",
    id_promocion,
  );
  await Promise.all([
    setDoc(ref1, data, { merge: true }),
    setDoc(ref2, data, { merge: true }),
  ]);
  return imgContainer;
}

function comprimirImagen(dataURL, maxPx = 1024, calidad = 0.82) {
  return new Promise((resolve, reject) => {
    const imgEl = new Image();
    imgEl.onload = () => {
      let { width, height } = imgEl;
      if (width > maxPx || height > maxPx) {
        if (width >= height) {
          height = Math.round((height * maxPx) / width);
          width = maxPx;
        } else {
          width = Math.round((width * maxPx) / height);
          height = maxPx;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(imgEl, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", calidad));
    };
    imgEl.onerror = () => reject(new Error("No se pudo leer imagen"));
    imgEl.src = dataURL;
  });
}
let _iaGenerando = false;
let _iaActivo = null;
function setGenerandoIA(activo, btnId = null) {
  _iaActivo = activo ? btnId : null;
  actualizarBotonesIA();
}
function formatFechaSlash(str) {
  if (!str) return "";
  const [y, m, d] = str.split("-");
  return `${d}/${m}/${y}`;
}

(function () {
  const CLOUD_FN_URL =
    "https://us-central1-geinzworkapp.cloudfunctions.net/generar_titulo_descripcion_IA";
  const CLOUD_FN_TEXT_URL =
    "https://us-central1-geinzworkapp.cloudfunctions.net/generar_texto_ia";
  const CLOUD_FN_SHARE_URL =
    "https://us-central1-geinzworkapp.cloudfunctions.net/generar_texto_compartir_ia";
  const CLOUD_FN_WP_URL =
    "https://generar-whatsapp-contacto-ia-oixttik5rq-uc.a.run.app";
  const CLOUD_FN_CREAR_PROMO = "https://crearpromocion-oixttik5rq-uc.a.run.app";

  const tituloInput = document.getElementById("tituloInput");
  const descripcionInput = document.getElementById("descripcionInput");
  const mensajeWpInput = document.getElementById("mensajeWpInput");
  const mensajeShareInput = document.getElementById("mensajeShareInput");
  const btnDescripcionIA = document.getElementById("btnDescripcionIA");
  const btnImagenIA = document.getElementById("btnImagenIA");
  const btnMensajeWpIA = document.getElementById("btnMensajeWpIA");
  const btnMensajeShareIA = document.getElementById("btnMensajeShareIA");
  const btnImagenIALabel = document.getElementById("btnImagenIALabel");
  const loadingImagenIA = document.getElementById("loadingImagenIA");
  const precioImagenIA = document.getElementById("precioImagenIA");
  const resultadoIAContainer = document.getElementById("resultadoIAContainer");
  const precioInput = document.getElementById("precioInput");

  precioInput.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "");
  });

  // ── Inyectar fila de términos y advertencia de saldo en el footer ──
  (function inyectarFooterExtra() {
    const footer = document.querySelector(".footer");
    if (!footer) return;

    // Advertencia de saldo insuficiente
    const warnDiv = document.createElement("div");
    warnDiv.className = "saldo-insuficiente-warn";
    warnDiv.id = "saldoInsuficienteWarn";
    footer.insertBefore(warnDiv, footer.firstChild);

    // Fila de términos
    const termsRow = document.createElement("div");
    termsRow.className = "footer-terms-row";
    termsRow.innerHTML = `
      <input type="checkbox" class="terms-checkbox" id="terminosCheck">
      <label for="terminosCheck" class="terms-label-text">
        Acepto los
        <button class="terms-link" onclick="abrirTerminos()">términos de la publicación</button>
        antes de publicar
      </label>`;
    // Solo esto — sin tocar los botones existentes
    footer.insertBefore(termsRow, footer.querySelector(".btn-submit"));
    document.getElementById("terminosCheck").addEventListener("change", (e) => {
      terminosAceptados = e.target.checked;
      actualizarEstadoBotonPublicar();
    });

    // Deshabilitar botón publicar al inicio
    const btnSubmit = document.querySelector(".btn-submit");
    if (btnSubmit) btnSubmit.disabled = true;
  })();

  /* ── IMAGEN ── */
  window.selectImage = function (index) {
    if (imagesData[index]) return;
    selectedImageIndex = index;
    document.getElementById("imageInput").click();
  };

  window.removeImage = function (index) {
    if (!imagesData[index]) return;
    imagesData[index] = null;
    const slot = document.querySelector(`.image-slot[data-index="${index}"]`);
    if (slot) {
      slot.classList.remove("filled");
      const preview = slot.querySelector(".image-slot-preview");
      preview.style.display = "none";
      preview.src = "";
      slot.querySelector(".image-slot-content").style.display = "flex";
    }
    imgsCount = imagesData.filter((i) => i !== null).length;
    updateFirstImageBorder();
    validate();
  };

  function updateFirstImageBorder() {
    document.querySelectorAll(".image-slot").forEach((slot, idx) => {
      const preview = slot.querySelector(".image-slot-preview");
      if (preview)
        preview.style.border =
          idx === 0 && imagesData[0] ? "2px solid var(--primary)" : "none";
    });
  }

  /* ── HELPERS ── */
  function detectarPrecioTexto(texto) {
    if (!texto?.trim()) return null;
    const clean = texto.toLowerCase();
    const palabrasPrecio = ["sol", "soles", "s/", "pen", "precio", "costo"];
    const numeros = [];
    const regexNumero = /(\d+(?:[.,]\d{1,2})?)/g;
    let m;
    while ((m = regexNumero.exec(clean)) !== null)
      numeros.push({
        valor: parseFloat(m[1].replace(",", ".")),
        index: m.index,
      });
    if (!numeros.length) return null;
    let mejorNumero = null,
      distanciaMinima = Infinity;
    for (const num of numeros) {
      let dist = Infinity;
      for (const p of palabrasPrecio) {
        let idx = clean.indexOf(p);
        while (idx !== -1) {
          dist = Math.min(dist, Math.abs(num.index - idx));
          idx = clean.indexOf(p, idx + 1);
        }
      }
      if (dist < distanciaMinima && dist < 30) {
        distanciaMinima = dist;
        mejorNumero = num;
      }
    }
    return mejorNumero ? String(mejorNumero.valor) : null;
  }

  function aplicarPrecioDetectado(precio) {
    if (!precioInput) return;

    if (!precio) {
      precioInput.value = "";
      precioYaSeteado = false;
      return;
    }

    const precioEntero = Math.round(Number(precio));

    if (precioYaSeteado && Number(precioInput.value) === precioEntero) return;

    if (Number(precioInput.value) !== precioEntero) {
      precioInput.value = precioEntero;
      flashFields(precioInput);
      mostrarToast(`💰 Precio detectado: S/ ${precioEntero}`, "success");
      precioYaSeteado = true;
    }
  }
  function showBtn(btn, visible) {
    if (!btn) return;
    btn.classList.toggle("show", visible);
    const container = btn.closest(".ai-zone") || btn.closest(".img-ai-zone");
    if (container) container.classList.toggle("show", visible);
  }

  function mostrarToast(mensaje, tipo = "success") {
    const t = document.createElement("div");
    t.className = `toast ${tipo}`;
    t.textContent = mensaje;
    document.body.appendChild(t);
    setTimeout(() => {
      t.style.animation = "slideIn .3s ease reverse";
      setTimeout(() => t.remove(), 300);
    }, 3200);
  }

  function flashFields(...els) {
    els.forEach((el) => {
      if (!el) return;
      el.style.transition = "border-color .3s";
      el.style.borderColor = "#22c55e";
      setTimeout(() => (el.style.borderColor = ""), 2200);
    });
  }

  /* ── VALIDACIÓN GENERAL ── */
  function validate() {
    const titulo = tituloInput.value.trim();
    const desc = descripcionInput.value.trim();
    aplicarPrecioDetectado(detectarPrecioTexto(`${titulo} ${desc}`));

    const zonaImg = document.getElementById("iaZonaImagen");
    if (zonaImg) zonaImg.style.display = imgsCount > 0 ? "flex" : "none";

    const zonaTxt = document.getElementById("iaZonaTexto");
    if (zonaTxt) {
      const mostrar = desc.length >= 10;
      zonaTxt.style.display = mostrar ? "flex" : "none";
      if (mostrar) renderBullets(tipoTextoIA);
    }

    const tieneContenido = titulo.length >= 4 && desc.length >= 15;
    showBtn(btnMensajeWpIA, tieneContenido);
    showBtn(btnMensajeShareIA, tieneContenido);

    actualizarCostoPublicar();
    actualizarEstadoBotonPublicar();
  }

  /* ── LOADING BTNS ── */
  function setBtnLoading(btn, loading = true) {
    if (!btn) return;
    if (loading) {
      btn.disabled = true;
      btn.dataset.original = btn.innerHTML;
      btn.innerHTML = `<span class="loading-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span><span style="margin-left:10px">Generando...</span>`;
    } else {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.original || "Generar";
    }
  }

  function setLoadingImagen(on) {
    if (!btnImagenIA) return;
    btnImagenIA.disabled = on;
    btnImagenIA.classList.toggle("loading", on);
    loadingImagenIA.style.display = on ? "inline-flex" : "none";
    btnImagenIALabel.textContent = on
      ? "Generando…"
      : "Generar imagen + texto con IA";
    if (precioImagenIA) precioImagenIA.style.display = on ? "none" : "inline";
  }

  /* ── FIREBASE CALL ── */
  async function callFirebaseFunction(url, payload = {}) {
    const token = await getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ data: payload }),
    });
    let data = {};
    try {
      data = await response.json();
    } catch {
      throw new Error("Respuesta inválida del servidor");
    }
    if (!response.ok)
      throw new Error(data?.error?.message || `HTTP ${response.status}`);
    if (data?.error) throw new Error(data.error.message || "Error Firebase");
    return data?.result ?? data;
  }

  /* ── IA: MEJORAR TEXTO ── */
  async function mejorarTextoIA() {
    if (!datosTienda) {
      mostrarToast("Cargando datos de tienda...", "error");
      return;
    }
    precioYaSeteado = false;
    const titulo = tituloInput.value.trim();
    const descripcion = descripcionInput.value.trim();
    if (!titulo || !descripcion) {
      mostrarToast("Completa título y descripción", "error");
      return;
    }
    setGenerandoIA(true, "btnDescripcionIA");
    setBtnLoading(btnDescripcionIA, true);
    try {
      const result = await callFirebaseFunction(CLOUD_FN_TEXT_URL, {
        tipo: tipoTextoIA.toUpperCase(),
        tituloUsuario: titulo,
        descripcionUsuario: descripcion,
        saldo_actual: datosTienda.saldo_tienda,
        saldo_descuento: _precios.mejora_texto_x3,
        id_tienda: datosTienda.id_tienda,
        precio_por_moneda: _precios.costo_por_moneda,
        localidad: datosTienda.localidad,
        nombre_tienda: datosTienda.nombre_tienda,
        tipo_paquete: "Gen IA (Promociones X3)",
      });
      if (!result?.ok || !result?.respuesta)
        throw new Error("Sin respuesta IA");
      renderOpcionesIA(result.respuesta, titulo, descripcion);
      mostrarToast("Textos generados ✨");
    } catch (err) {
      mostrarToast(err.message || "Error generando textos", "error");
    } finally {
      setBtnLoading(btnDescripcionIA, false);
      setGenerandoIA(false);
    }
  }

  function extraerOpciones(texto) {
    const regex =
      /Opcion\s\d+:\s*T:\s*([\s\S]*?)\s*D:\s*([\s\S]*?)(?=Opcion\s\d+:|$)/gi;
    const res = [];
    let m;
    while ((m = regex.exec(texto)) !== null)
      res.push({ titulo: m[1].trim(), descripcion: m[2].trim() });
    return res;
  }

  function renderOpcionesIA(textoIA, tituloOriginal, descOriginal) {
    resultadoIAContainer.innerHTML = "";
    const lista = [
      { titulo: tituloOriginal, descripcion: descOriginal, original: true },
      ...extraerOpciones(textoIA),
    ];
    lista.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = "ia-card" + (item.original ? " active" : "");
      card.innerHTML = `<div class="ia-card-label">${item.original ? "ORIGINAL" : "IA OPCIÓN " + index}</div><div class="ia-card-title">${item.titulo}</div><div class="ia-card-desc">${item.descripcion}</div>`;
      card.addEventListener("click", () => {
        tituloInput.value = item.titulo;
        descripcionInput.value = item.descripcion;
        document
          .querySelectorAll(".ia-card")
          .forEach((c) => c.classList.remove("active"));
        card.classList.add("active");
        flashFields(tituloInput, descripcionInput);
        validate();
        mostrarToast("Texto aplicado ✨");
      });
      resultadoIAContainer.appendChild(card);
    });
  }

  /* ── IA: WhatsApp ── */
  async function generarMensajeWhatsappIA() {
    if (!datosTienda) {
      mostrarToast("Cargando datos de tienda...", "error");
      return;
    }
    const titulo = tituloInput.value.trim();
    if (!titulo) {
      mostrarToast("Agrega un título primero", "error");
      return;
    }
    setGenerandoIA(true, "btnMensajeWpIA");

    setBtnLoading(btnMensajeWpIA, true);
    try {
      const result = await callFirebaseFunction(CLOUD_FN_WP_URL, {
        titulo,
        descripcion: descripcionInput.value.trim(),
        saldo_actual: datosTienda.saldo_tienda,
        saldo_descuento: _precios.mensaje_w_c,
        id_tienda: datosTienda.id_tienda,
        precio_por_moneda: _precios.costo_por_moneda,
        localidad: datosTienda.localidad,
        nombre_tienda: datosTienda.nombre_tienda,
        tipo_paquete: "Gen IA (Mensaje WhatsApp personalizado)",
      });
      const mensaje = result?.mensaje?.trim();
      if (!mensaje) throw new Error("Gemini devolvió vacío");
      mensajeWpInput.value = mensaje;
      flashFields(mensajeWpInput);
      mostrarToast("Mensaje WhatsApp generado ✨");
    } catch (err) {
      mostrarToast(err.message || "Error generando mensaje", "error");
    } finally {
      setBtnLoading(btnMensajeWpIA, false);
      setGenerandoIA(false);
    }
  }

  /* ── IA: Compartir ── */
  async function generarMensajeCompartirIA() {
    if (!datosTienda) {
      mostrarToast("Cargando datos de tienda...", "error");
      return;
    }
    const titulo = tituloInput.value.trim();
    if (!titulo) {
      mostrarToast("Agrega un título primero", "error");
      return;
    }
    setGenerandoIA(true, "btnMensajeShareIA");

    setBtnLoading(btnMensajeShareIA, true);
    try {
      const result = await callFirebaseFunction(CLOUD_FN_SHARE_URL, {
        tituloUsuario: titulo,
        descripcionUsuario: descripcionInput.value.trim(),
        saldo_actual: datosTienda.saldo_tienda,
        saldo_descuento: _precios.mensaje_w_c,
        id_tienda: datosTienda.id_tienda,
        precio_por_moneda: _precios.costo_por_moneda,
        localidad: datosTienda.localidad,
        nombre_tienda: datosTienda.nombre_tienda,
        tipo_paquete: "Gen IA (Mensaje para compartir)",
      });
      const mensaje = result?.mensaje?.trim();
      if (!mensaje) throw new Error("Gemini devolvió vacío");
      mensajeShareInput.value = mensaje;
      flashFields(mensajeShareInput);
      mostrarToast("Mensaje para compartir generado 🚀");
    } catch (err) {
      mostrarToast(err.message || "Error generando mensaje", "error");
    } finally {
      setBtnLoading(btnMensajeShareIA, false);
      setGenerandoIA(false);
    }
  }

  /* ── IA: Imagen + Texto ── */
  async function generarImagenTextoIA() {
    if (!datosTienda) {
      mostrarToast("Cargando datos de tienda...", "error");
      return;
    }
    precioYaSeteado = false;
    if (!imagesData[0]) {
      mostrarToast(
        "Selecciona al menos una imagen en el primer recuadro",
        "error",
      );
      return;
    }
    if (btnImagenIA.classList.contains("loading")) return;
    setGenerandoIA(true, "btnImagenIA");
    setLoadingImagen(true);
    try {
      let dataURL;
      try {
        dataURL = await comprimirImagen(imagesData[0].data);
      } catch {
        dataURL = imagesData[0].data;
      }
      const result = await callFirebaseFunction(CLOUD_FN_URL, {
        imageBase64: dataURL.split(",")[1],
        mimeType: "image/jpeg",
        tipo: tipoImagenIA,
        saldo_actual: datosTienda.saldo_tienda,
        saldo_descuento: _precios.ia_imagen_texto,
        precio_por_moneda: _precios.costo_por_moneda,
        id_tienda: datosTienda.id_tienda,
        localidad: datosTienda.localidad,
        nombre_tienda: datosTienda.nombre_tienda,
        tipo_paquete: "Gen IA titulo y descripcion de Imagen ",
      });
      if (!result?.ok) throw new Error("IA inválida");
      if (result.titulo) tituloInput.value = result.titulo;
      if (result.descripcion) descripcionInput.value = result.descripcion;
      precioYaSeteado = false;
      aplicarPrecioDetectado(
        detectarPrecioTexto(
          `${result.titulo || ""} ${result.descripcion || ""}`,
        ),
      );
      flashFields(tituloInput, descripcionInput);
      validate();
      mostrarToast("Título y descripción generados ✨");
    } catch (err) {
      mostrarToast(err.message || "Error generando IA", "error");
    } finally {
      setLoadingImagen(false);
      setGenerandoIA(false);
    }
  }

  /* ── HANDLE FILES ── */
  window.handleFiles = function (input) {
    const file = input.files[0];
    if (!file || selectedImageIndex === null) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      imagesData[selectedImageIndex] = {
        name: file.name,
        data: e.target.result,
        type: file.type || "image/jpeg",
        size: file.size,
      };
      const slot = document.querySelector(
        `.image-slot[data-index="${selectedImageIndex}"]`,
      );
      if (slot) {
        slot.classList.add("filled");
        const preview = slot.querySelector(".image-slot-preview");
        preview.src = e.target.result;
        preview.style.display = "block";
        slot.querySelector(".image-slot-content").style.display = "none";
      }
      imgsCount = imagesData.filter((i) => i !== null).length;
      updateFirstImageBorder();
      selectedImageIndex = null;
      input.value = "";
      validate();
    };
    reader.readAsDataURL(file);
  };

  /* ── TOGGLE / PLAZO / FECHAS ── */
  window.toggle = function (id, cb) {
    const panel = document.getElementById(id);
    if (panel) panel.classList.toggle("open", cb.checked);
  };

  function calcularDuracionDias() {
    const fi = document.getElementById("fechaInicio");
    const ff = document.getElementById("fechaFin");
    const dc = document.getElementById("duracionDiasContainer");
    if (!fi || !ff || !dc || !fi.value || !ff.value) return;
    const inicio = parseFechaLocal(fi.value),
      fin = parseFechaLocal(ff.value);
    if (fin >= inicio) {
      const dias = calcularDias();
      const monedas = dias * _precios.publicacion_24h;
      dc.innerHTML = `<div style="background:var(--bg-input);padding:12px 16px;border-radius:14px;margin-top:12px;border-left:3px solid var(--primary)"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><div><span style="font-size:13px;color:var(--text-light)">📅 Duración:</span><span style="font-weight:600;color:var(--primary);margin-left:6px">${dias} día${dias > 1 ? "s" : ""}</span></div><div><span style="font-size:13px;color:var(--text-light)">💰 Inversión:</span><span style="font-weight:700;color:var(--green);margin-left:6px">${monedas.toLocaleString("es-PE")} créditos</span></div></div><div style="font-size:11px;color:var(--text-light);margin-top:6px">⚡ ${_precios.publicacion_24h} créditos por día · Inicio: ${fi.value.split("-").reverse().join("/")} · Fin: ${ff.value.split("-").reverse().join("/")}</div></div>`;
      dc.style.display = "block";
    } else {
      dc.innerHTML = `<div style="background:rgba(239,68,68,.1);padding:10px 16px;border-radius:14px;margin-top:12px;border-left:3px solid #ef4444"><span style="font-size:13px;color:#ef4444">⚠️ La fecha final debe ser mayor o igual a la inicial</span></div>`;
      dc.style.display = "block";
    }
    actualizarCostoPublicar();
    actualizarEstadoBotonPublicar();
  }
  function calcularDuracionHoras() {
    const ih = document.getElementById("inputHoras");
    const dc = document.getElementById("duracionHorasContainer");
    if (!ih || !dc) return;
    let h = parseInt(ih.value);
    if (isNaN(h) || h < 1) h = 1;
    if (h > 20) h = 20;
    const monedas = h * _precios.publicacion_x_hora;
    const hoy = new Date();
    const fechaStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    const finMs = hoy.getTime() + h * 3600000;
    const finDate = new Date(finMs);
    const finStr = `${finDate.getHours().toString().padStart(2, "0")}:${finDate.getMinutes().toString().padStart(2, "0")}`;
    dc.innerHTML = `<div style="background:var(--bg-input);padding:12px 16px;border-radius:14px;margin-top:12px;border-left:3px solid var(--primary)"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><div><span style="font-size:13px;color:var(--text-light)">⏱️ Duración:</span><span style="font-weight:600;color:var(--primary);margin-left:6px">${h} ${h === 1 ? "hora" : "horas"}</span></div><div><span style="font-size:13px;color:var(--text-light)">💰 Inversión:</span><span style="font-weight:700;color:var(--green);margin-left:6px">${monedas.toLocaleString("es-PE")} créditos</span></div></div><div style="font-size:11px;color:var(--text-light);margin-top:6px">⚡ ${_precios.publicacion_x_hora} créditos/hora · Fecha: ${fechaStr} · Termina ~${finStr}</div></div>`;
    dc.style.display = "block";
    actualizarCostoPublicar();
    actualizarEstadoBotonPublicar();
  }

  window.tipoPlazo = function () {
    const v = document.querySelector('input[name="plazo"]:checked')?.value;
    const bH = document.getElementById("boxHoras");
    const bF = document.getElementById("boxFechas");
    const dH = document.getElementById("duracionHorasContainer");
    const dD = document.getElementById("duracionDiasContainer");
    if (v === "horas") {
      if (bH) bH.style.display = "block";
      if (bF) bF.style.display = "none";
      if (dH) {
        dH.style.display = "block";
        calcularDuracionHoras();
      }
      if (dD) dD.style.display = "none";
    } else {
      if (bH) bH.style.display = "none";
      if (bF) bF.style.display = "block";
      if (dH) dH.style.display = "none";
      if (dD) {
        dD.style.display = "block";
        calcularDuracionDias();
      }
    }
    actualizarCostoPublicar();
    actualizarEstadoBotonPublicar();
  };
  (function initDates() {
    const hoy = new Date();
    const strHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;

    const manana = new Date(hoy);
    manana.setDate(hoy.getDate() + 1);
    const strManana = `${manana.getFullYear()}-${String(manana.getMonth() + 1).padStart(2, "0")}-${String(manana.getDate()).padStart(2, "0")}`;

    const fi = document.getElementById("fechaInicio");
    const ff = document.getElementById("fechaFin");

    if (fi) {
      fi.value = strHoy; // ← default = hoy
      fi.setAttribute("min", strHoy); // ← puede empezar hoy
    }
    if (ff) {
      ff.setAttribute("min", strManana); // ← fin mínimo = mañana
      ff.addEventListener("change", () => {
        if (ff.value && ff.value < fi.value) {
          mostrarToast("La fecha final no puede ser menor", "error");
          ff.value = fi.value;
        }
        calcularDuracionDias();
      });
    }
  })();
  /* ── PUBLICAR PROMOCIÓN ── */
  async function publicarPromocion() {
    const btn = document.querySelector(".btn-submit");
    const titulo = tituloInput.value.trim();
    const descripcion = descripcionInput.value.trim();

    // Validaciones obligatorias
    if (!imagesData.some((img) => img !== null)) {
      mostrarToast("Selecciona al menos una imagen", "error");
      return;
    }
    if (!titulo || !descripcion) {
      mostrarToast("Completa título y descripción", "error");
      return;
    }
    if (!datosTienda) {
      mostrarToast("Cargando datos de tienda...", "error");
      return;
    }
    if (!terminosAceptados) {
      mostrarToast("Acepta los términos de la publicación", "error");
      return;
    }

    const switches = document.querySelectorAll(
      '.param-box > .param-row > label.switch input[type="checkbox"]',
    );
    const sw_whatsapp = switches[0]?.checked ?? false;
    const sw_compartir = switches[1]?.checked ?? false;
    const sw_precio = switches[3]?.checked ?? false;
    const sw_horario = switches[4]?.checked ?? false;
    const sw_pagos = switches[5]?.checked ?? false;

    // WhatsApp
    if (sw_whatsapp) {
      const numeroVal = document
        .querySelector('#wp input[type="text"]')
        ?.value?.trim();
      const mensajeWpVal = document
        .getElementById("mensajeWpInput")
        ?.value?.trim();
      if (!numeroVal) {
        mostrarToast("WhatsApp activo: ingresa tu número de contacto", "error");
        return;
      }
      if (!mensajeWpVal) {
        mostrarToast(
          "WhatsApp activo: ingresa un mensaje predeterminado",
          "error",
        );
        return;
      }
    }
    // Compartir
    if (sw_compartir) {
      const mensajeShareVal = document
        .getElementById("mensajeShareInput")
        ?.value?.trim();
      if (!mensajeShareVal) {
        mostrarToast(
          "Compartir activo: ingresa un mensaje predeterminado",
          "error",
        );
        return;
      }
    }
    // Cercanía
    const geoInputs = document.querySelectorAll('#geo input[type="text"]');
    const swGeo = switches[2]?.checked ?? false;
    if (swGeo && !geoInputs[0]?.value?.trim()) {
      mostrarToast(
        "Cercanía activa: la dirección no puede estar vacía",
        "error",
      );
      return;
    }
    // Precio
    if (sw_precio) {
      const precioVal = document.getElementById("precioInput")?.value?.trim();
      if (!precioVal) {
        mostrarToast(
          "Precio activo: ingresa el precio de tu publicación",
          "error",
        );
        return;
      }
    }
    // Horario — si está activo debe tener una opción seleccionada (siempre lo tiene por el select, pero validamos)
    // Pagos
    if (sw_pagos) {
      const hayPagoActivo = Array.from(
        document.querySelectorAll('#payments .pay-item input[type="checkbox"]'),
      ).some((cb) => cb.checked);
      if (!hayPagoActivo) {
        mostrarToast("Métodos de pago: selecciona al menos uno", "error");
        return;
      }
    }

    const tipoPlazoVal =
      document.querySelector('input[name="plazo"]:checked')?.value || "dias";
    const fechaInicio = document.getElementById("fechaInicio")?.value || "";
    const fechaFin = document.getElementById("fechaFin")?.value || "";
const horasInputRaw = document.getElementById("inputHoras")?.value || "";
const horasInput = parseInt(horasInputRaw);

    if (tipoPlazoVal === "dias") {
      if (!fechaInicio || !fechaFin) {
        mostrarToast("Selecciona fecha final", "error");
        return;
      }
      if (parseFechaLocal(fechaFin) < parseFechaLocal(fechaInicio)) {
        mostrarToast("La fecha final no puede ser menor a la inicial", "error");
        return;
      }
  } else if (tipoPlazoVal === "horas") {
  if (
    horasInputRaw.trim() === "" ||
    isNaN(horasInput) ||
    horasInput < 1 ||
    horasInput > 20
  ) {
    mostrarToast("Ingresa una cantidad de horas válida (1–20)", "error");
    document.getElementById("inputHoras")?.focus();
    return;
  }
}

    // Verificar saldo
    const total = calcularCostoTotal();
    const saldo = datosTienda?.saldo_tienda ?? 0;
    if (saldo < total) {
      mostrarToast(
        `Saldo insuficiente. Necesitas ${total.toLocaleString("es-PE")} créditos`,
        "error",
      );
      return;
    }

    const ahora = new Date();
    const horaActual = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
    let tsInicio = {
      seconds: Math.floor(ahora.getTime() / 1000),
      nanoseconds: 0,
    };
    let tsFin = { seconds: Math.floor(ahora.getTime() / 1000), nanoseconds: 0 };
    let hora_inicio = horaActual,
      hora_fin = horaActual;

    // ANTES:
    // DESPUÉS:
    if (tipoPlazoVal === "dias" && fechaInicio && fechaFin) {
      // Inicio = fecha seleccionada pero con la hora actual exacta
      const inicioBase = parseFechaLocal(fechaInicio);
      inicioBase.setHours(
        ahora.getHours(),
        ahora.getMinutes(),
        ahora.getSeconds(),
        0,
      );

      // Fin = fecha final + misma hora actual (exactamente N días después)
      const finBase = parseFechaLocal(fechaFin);
      finBase.setHours(
        ahora.getHours(),
        ahora.getMinutes(),
        ahora.getSeconds(),
        0,
      );

      tsInicio = {
        seconds: Math.floor(inicioBase.getTime() / 1000),
        nanoseconds: 0,
      };
      tsFin = {
        seconds: Math.floor(finBase.getTime() / 1000),
        nanoseconds: 0,
      };

      // También actualizar hora_inicio y hora_fin con la hora real
      hora_inicio = horaActual;
      hora_fin = horaActual;
    } else if (tipoPlazoVal === "horas") {
      const finMs = ahora.getTime() + horasInput * 3600000;
      tsFin = { seconds: Math.floor(finMs / 1000), nanoseconds: 0 };
      const finDate = new Date(finMs);
      hora_fin = `${String(finDate.getHours()).padStart(2, "0")}:${String(finDate.getMinutes()).padStart(2, "0")}`;
    }

    const pagosChecks = document.querySelectorAll(
      '#payments .pay-item input[type="checkbox"]',
    );
    const nombresP = [
      "yape",
      "plin",
      "agora",
      "efectivo",
      "visa",
      "mastercard",
    ];
    const pagos = {};
    pagosChecks.forEach((cb, i) => {
      pagos[nombresP[i]] = cb.checked;
    });

    const horarioMap = {
      "Todo el día": "todo_dia",
      Mañana: "manana",
      Tarde: "tarde",
      Noche: "noche",
    };
    const horario = sw_horario
      ? horarioMap[document.querySelector("#hours select")?.value] || "todo_dia"
      : "todo_dia";

    const id_tienda = datosTienda.id_tienda || ID_TIENDA;
    const localidad = datosTienda.localidad || LOCALIDAD;
    const id_promocion = doc(collection(db, "Promociones")).id;
    const nombre_tienda = datosTienda.nombre_tienda || "";
    const categoria = datosTienda.categoria_tienda || "general";
    const direccion = datosTienda.ubicacion?.dirección || "";
    const referencia = datosTienda.ubicacion?.referencia || "";
    const lat = datosTienda.ubicacion?.latitud || 0.0;
    const lng = datosTienda.ubicacion?.longitud || 0.0;
    const logo_url = datosTienda.img_tienda?.logo_tienda || "";
    const numero = datosTienda.metodo_contacto?.whatsapp?.numero || "";

    mostrarSkeletonPublicando();
    btn.disabled = true;
    btn.innerHTML = `<span class="loading-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span> Publicando...`;

    try {
      skSetStep(2, "Subiendo imágenes...", "Procesando tus fotos", 55);
      const { urls, botUrl } = await subirImagenesAStorage(
        id_tienda,
        id_promocion,
      );

      skSetStep(2, "Guardando imágenes...", "Registrando en base de datos", 70);
      await guardarImagenesEnFirestore(
        id_tienda,
        logo_url,
        localidad,
        id_promocion,
        urls,
      );

      skSetStep(3, "Publicando en Geinz...", "Ya casi está listo", 88);

      const payload = {
        id_tienda,
        id_promocion,
        localidad,
        titulo,
        descripcion,
        categoria,
        nombre_tienda,
        estado: "activo",
        exclusivo: false,
        formato_fecha_hora: tipoPlazoVal,
        fecha_inicio: formatFechaSlash(fechaInicio),
        fecha_fin: formatFechaSlash(fechaFin),
        hora_inicio,
        hora_fin,
        timestamp_inicio: tsInicio,
        timestamp_fin: tsFin,
        precio: sw_precio
          ? document.getElementById("precioInput")?.value || "0"
          : "0",
        horario_seleccion: horario,
        contactar: sw_whatsapp,
        compartir: sw_compartir,
        ...(sw_pagos
          ? pagos
          : {
              yape: false,
              plin: false,
              agora: false,
              efectivo: false,
              visa: false,
              mastercard: false,
            }),
        numero,
        mensaje_whatsapp: mensajeWpInput.value || "",
        mensaje_compartir: mensajeShareInput.value || "",
        activo_mensaje_whatsapp: sw_whatsapp,
        activo_mensaje_compartir: sw_compartir,
        servicios_comodidades: {},
        terminos_clave_ia: [],
        urls_imagenes: urls,
        img_bot: botUrl || urls[0] || "",
        logo_url,
        direccion,
        lat,
        long: lng,
        referencia,

        // ── Financiero ──────────────────────────────────────
        saldo_actual: datosTienda.saldo_tienda, // ej: 5490
        saldo_descuento: total, // ej: 700 (calculado arriba)
        precio_por_moneda: _precios.costo_por_moneda, // ej: 0.012
        tipo_paquete:
          tipoPlazoVal === "horas"
            ? `Publicidad por ${horasInput} hora${horasInput > 1 ? "s" : ""}`
            : `Publicidad por ${calcularDias()} día${calcularDias() > 1 ? "s" : ""}`,
      };

      const result = await callFirebaseFunction(CLOUD_FN_CREAR_PROMO, payload);
      ocultarSkeleton();
      limpiarFormulario();
      mostrarModalExito(id_promocion, localidad);
    } catch (err) {
      console.error("❌ ERROR:", err);
      ocultarSkeleton();
      mostrarToast(err.message || "Error al publicar", "error");
    } finally {
      btn.disabled = false;
      actualizarCostoPublicar();
      actualizarEstadoBotonPublicar();
    }
  }

  /* ── SKELETON ── */
  function mostrarSkeletonPublicando() {
    const sk = document.createElement("div");
    sk.id = "skeletonPublicando";

    sk.innerHTML = `
    <style>
      #skeletonPublicando {
        position:fixed;inset:0;z-index:9998;
        background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);
        display:flex;align-items:center;justify-content:center;
        animation:skFadeIn .25s ease;
      }
      @keyframes skFadeIn { from{opacity:0} to{opacity:1} }
      @keyframes skSpin    { to{stroke-dashoffset:-138} }
      @keyframes skPulse   { 0%,100%{opacity:1} 50%{opacity:.35} }
      @keyframes skFillBar { from{width:15%} to{width:82%} }
 
      #skeletonPublicando .sk-card {
        width:calc(100% - 32px);max-width:360px;
        background:#0f0f14;
        border-radius:20px;
        border:0.5px solid rgba(255,255,255,.08);
        padding:28px 24px 32px;
      }
 
      #skeletonPublicando .sk-head {
        display:flex;align-items:center;
        justify-content:space-between;margin-bottom:24px;
      }
      #skeletonPublicando .sk-badge {
        font-size:10px;font-weight:700;letter-spacing:.12em;
        color:#7c3aed;
        background:rgba(124,58,237,.12);
        border:0.5px solid rgba(124,58,237,.25);
        padding:4px 10px;border-radius:6px;
      }
      #skeletonPublicando .sk-ring svg { display:block; }
      #skeletonPublicando .sk-ring-bg  {
        fill:none;stroke:rgba(255,255,255,.07);stroke-width:3.5;
      }
      #skeletonPublicando .sk-ring-fill {
        fill:none;stroke:url(#skGrad);stroke-width:3.5;
        stroke-dasharray:138;stroke-dashoffset:0;stroke-linecap:round;
        animation:skSpin 1.4s linear infinite;
        transform-origin:28px 28px;transform:rotate(-90deg);
      }
 
      #skeletonPublicando .sk-title {
        font-size:17px;font-weight:600;color:#fff;margin:0 0 4px;
      }
      #skeletonPublicando .sk-subtitle {
        font-size:12px;color:#6b7280;margin:0 0 20px;
      }
 
      #skeletonPublicando .sk-bar-wrap {
        background:#1a1a24;border-radius:8px;
        height:6px;overflow:hidden;margin-bottom:24px;
      }
      #skeletonPublicando .sk-bar {
        height:100%;border-radius:8px;
        background:linear-gradient(90deg,#7c3aed,#a855f7);
        animation:skFillBar 3s ease-out forwards;
      }
 
      #skeletonPublicando .sk-steps {
        display:flex;flex-direction:column;gap:10px;
      }
      #skeletonPublicando .sk-step {
        display:flex;align-items:center;gap:12px;
        padding:10px 12px;border-radius:12px;
      }
      #skeletonPublicando .sk-step-icon {
        width:32px;height:32px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;flex-shrink:0;
      }
      #skeletonPublicando .sk-step-icon i { font-size:16px; }
      #skeletonPublicando .sk-step-label  { font-size:12px;font-weight:600; }
      #skeletonPublicando .sk-step-status { font-size:10px;margin-top:1px; }
      #skeletonPublicando .sk-step-right  { margin-left:auto; }
      #skeletonPublicando .sk-step-right i { font-size:16px; }
 
      /* done */
      #skeletonPublicando .sk-step.done {
        background:rgba(34,197,94,.06);
        border:0.5px solid rgba(34,197,94,.15);
      }
      #skeletonPublicando .sk-step.done .sk-step-icon {
        background:rgba(34,197,94,.15);border:0.5px solid rgba(34,197,94,.3);
      }
      #skeletonPublicando .sk-step.done .sk-step-icon i { color:#22c55e; }
      #skeletonPublicando .sk-step.done .sk-step-label  { color:#e5e7eb; }
      #skeletonPublicando .sk-step.done .sk-step-status { color:#22c55e; }
      #skeletonPublicando .sk-step.done .sk-step-right i { color:#22c55e; }
 
      /* active */
      #skeletonPublicando .sk-step.active {
        background:rgba(124,58,237,.08);
        border:0.5px solid rgba(124,58,237,.25);
      }
      #skeletonPublicando .sk-step.active .sk-step-icon {
        background:rgba(124,58,237,.15);border:0.5px solid rgba(124,58,237,.3);
      }
      #skeletonPublicando .sk-step.active .sk-step-icon i {
        color:#a855f7;animation:skPulse 1.4s ease-in-out infinite;
      }
      #skeletonPublicando .sk-step.active .sk-step-label  { color:#e5e7eb; }
      #skeletonPublicando .sk-step.active .sk-step-status { color:#a855f7; }
      #skeletonPublicando .sk-step.active .sk-step-right i {
        color:#a855f7;animation:skSpin 1s linear infinite;
        transform-origin:center;
      }
 
      /* pending */
      #skeletonPublicando .sk-step.pending {
        background:rgba(255,255,255,.02);
        border:0.5px solid rgba(255,255,255,.06);
      }
      #skeletonPublicando .sk-step.pending .sk-step-icon {
        background:rgba(255,255,255,.04);border:0.5px solid rgba(255,255,255,.08);
      }
      #skeletonPublicando .sk-step.pending .sk-step-icon i { color:#52525b; }
      #skeletonPublicando .sk-step.pending .sk-step-label  { color:#6b7280; }
      #skeletonPublicando .sk-step.pending .sk-step-status { color:#3f3f46; }
      #skeletonPublicando .sk-step.pending .sk-step-right i { color:#3f3f46; }
    </style>
 
    <div class="sk-card">
      <div class="sk-head">
        <span class="sk-badge">GEINZ</span>
        <div class="sk-ring">
          <svg viewBox="0 0 56 56" width="44" height="44">
            <defs>
              <linearGradient id="skGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#7c3aed"/>
                <stop offset="100%" stop-color="#a855f7"/>
              </linearGradient>
            </defs>
            <circle class="sk-ring-bg"   cx="28" cy="28" r="22"/>
            <circle class="sk-ring-fill" cx="28" cy="28" r="22"/>
          </svg>
        </div>
      </div>
 
      <p class="sk-title"    id="skTitle">Publicando tu promoción...</p>
      <p class="sk-subtitle" id="skSubtitle">Esto solo tarda unos segundos</p>
 
      <div class="sk-bar-wrap">
        <div class="sk-bar" id="skBar" style="width:15%"></div>
      </div>
 
      <div class="sk-steps" id="skSteps">
 
        <div class="sk-step done" id="sk-step1">
          <div class="sk-step-icon"><i class="ti ti-shield-check"></i></div>
          <div>
            <div class="sk-step-label">Validando datos</div>
            <div class="sk-step-status" id="sk-status1">Completado</div>
          </div>
          <div class="sk-step-right"><i class="ti ti-circle-check"></i></div>
        </div>
 
        <div class="sk-step active" id="sk-step2">
          <div class="sk-step-icon"><i class="ti ti-brain"></i></div>
          <div>
            <div class="sk-step-label">Analizando con IA</div>
            <div class="sk-step-status" id="sk-status2">En progreso...</div>
          </div>
          <div class="sk-step-right"><i class="ti ti-loader-2"></i></div>
        </div>
 
        <div class="sk-step pending" id="sk-step3">
          <div class="sk-step-icon"><i class="ti ti-photo-up"></i></div>
          <div>
            <div class="sk-step-label">Subiendo imágenes</div>
            <div class="sk-step-status" id="sk-status3">Pendiente</div>
          </div>
          <div class="sk-step-right"><i class="ti ti-clock"></i></div>
        </div>
 
        <div class="sk-step pending" id="sk-step4">
          <div class="sk-step-icon"><i class="ti ti-world-upload"></i></div>
          <div>
            <div class="sk-step-label">Publicando en Geinz</div>
            <div class="sk-step-status" id="sk-status4">Pendiente</div>
          </div>
          <div class="sk-step-right"><i class="ti ti-clock"></i></div>
        </div>
 
      </div>
    </div>
  `;

    document.body.appendChild(sk);
  }

  function skSetStep(stepNum, titleText, subtitleText, barPct) {
    const icons = ["ti-check", "ti-cpu", "ti-photo", "ti-world"];
    ["sk-step1", "sk-step2", "sk-step3", "sk-step4"].forEach((id, idx) => {
      const el = document.getElementById(id);
      const st = document.getElementById(`sk-status${idx + 1}`);
      if (!el) return;
      if (idx < stepNum) {
        el.className = "sk-step done";
        el.querySelector(".sk-step-icon").innerHTML =
          '<i class="ti ti-check"></i>';
        if (st) st.textContent = "Completado";
      } else if (idx === stepNum) {
        el.className = "sk-step active";
        el.querySelector(".sk-step-icon").innerHTML =
          `<i class="ti ${icons[idx]}"></i>`;
        if (st) st.textContent = "En progreso...";
      } else {
        el.className = "sk-step pending";
        el.querySelector(".sk-step-icon").innerHTML =
          `<i class="ti ${icons[idx]}"></i>`;
        if (st) st.textContent = "Pendiente";
      }
    });
    const t = document.getElementById("skTitle");
    const s = document.getElementById("skSubtitle");
    const b = document.getElementById("skBar");
    if (t) t.textContent = titleText;
    if (s) s.textContent = subtitleText;
    if (b) b.style.width = barPct + "%";
  }

  function ocultarSkeleton() {
    const sk = document.getElementById("skeletonPublicando");
    if (!sk) return;
    const t = document.getElementById("skTitle");
    const s = document.getElementById("skSubtitle");
    const b = document.getElementById("skBar");
    if (t) t.textContent = "¡Publicado con éxito! 🎉";
    if (s) s.textContent = "Tu promoción ya está visible en Geinz";
    if (b) {
      b.style.width = "100%";
      b.style.background = "#16a34a";
    }
    ["sk-step1", "sk-step2", "sk-step3", "sk-step4"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.className = "sk-step done";
        el.querySelector(".sk-step-icon").innerHTML =
          '<i class="ti ti-check"></i>';
      }
    });
    setTimeout(() => sk.remove(), 1800);
  }

  function mostrarModalExito(id_promocion, localidad) {
    const localidadMap = { barranca: "ba", lima: "li", callao: "ca" };
    const l =
      localidadMap[localidad?.toLowerCase()] || localidad?.slice(0, 2) || "ba";
    const url = `https://geinzworkapp.web.app/api/share?t=prms&l=${l}&pi=${id_promocion}`;

    document.getElementById("modalExitoPromo")?.remove();

    const modal = document.createElement("div");
    modal.id = "modalExitoPromo";
    modal.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);
    display:flex;align-items:flex-end;justify-content:center;
    animation:fadeInOverlay .25s ease;
  `;

    modal.innerHTML = `
    <style>
      @keyframes fadeInOverlay { from{opacity:0} to{opacity:1} }
      @keyframes slideUpSheet  { from{transform:translateY(100%)} to{transform:translateY(0)} }
 
      #modalExitoPromo .sheet {
        width:100%;max-width:520px;
        background:#0f0f14;
        border-radius:28px 28px 0 0;
        border-top:0.5px solid rgba(255,255,255,.09);
        padding:0 0 env(safe-area-inset-bottom,0);
        animation:slideUpSheet .4s cubic-bezier(.34,1.1,.64,1);
        overflow:hidden;
      }
      #modalExitoPromo .handle {
        width:36px;height:4px;
        background:rgba(255,255,255,.13);border-radius:2px;
        margin:14px auto 0;
      }
      #modalExitoPromo .sheet-inner { padding:20px 20px 28px; }
 
      #modalExitoPromo .hero-img {
        display:block;width:80px;height:80px;
        object-fit:contain;margin:0 auto 4px;
      }
      #modalExitoPromo .hero-fallback {
        display:none;width:72px;height:72px;border-radius:50%;
        background:rgba(109,40,217,.15);
        border:0.5px solid rgba(109,40,217,.3);
        align-items:center;justify-content:center;
        margin:0 auto 4px;
      }
      #modalExitoPromo .hero-fallback i { font-size:30px;color:#a855f7; }
 
      #modalExitoPromo h2 {
        font-size:20px;font-weight:600;color:#fff;
        text-align:center;margin:0 0 5px;
      }
      #modalExitoPromo .subtitle {
        font-size:12px;color:#6b7280;text-align:center;
        line-height:1.5;margin:0 0 18px;
      }
 
      #modalExitoPromo .url-box {
        display:flex;align-items:center;gap:8px;
        background:#1a1a24;
        border:0.5px solid rgba(255,255,255,.07);
        border-radius:12px;padding:10px 12px;
        margin-bottom:14px;
      }
      #modalExitoPromo .url-box > i { font-size:15px;color:#52525b;flex-shrink:0; }
      #modalExitoPromo .url-text {
        flex:1;font-size:11px;color:#9ca3af;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        font-family:monospace;
      }
      #modalExitoPromo .btn-copy {
        flex-shrink:0;height:28px;padding:0 10px;
        border:0.5px solid rgba(255,255,255,.1);
        background:rgba(255,255,255,.05);
        color:#d1d5db;border-radius:8px;
        font-size:11px;font-weight:600;cursor:pointer;
        display:flex;align-items:center;gap:4px;
        transition:background .2s;white-space:nowrap;
      }
      #modalExitoPromo .btn-copy:hover { background:rgba(255,255,255,.1); }
      #modalExitoPromo .btn-copy.copied { color:#22c55e;border-color:rgba(34,197,94,.3); }
 
      #modalExitoPromo .divider {
        height:0.5px;background:rgba(255,255,255,.06);margin:0 0 14px;
      }
 
      #modalExitoPromo .share-grid {
        display:grid;grid-template-columns:1fr 1fr;gap:8px;
        margin-bottom:14px;
      }
      #modalExitoPromo .share-btn {
        display:flex;align-items:center;gap:10px;
        padding:12px 14px;border-radius:14px;cursor:pointer;
        border:0.5px solid rgba(255,255,255,.07);
        background:rgba(255,255,255,.03);
        transition:background .2s,transform .15s;
      }
      #modalExitoPromo .share-btn:hover { background:rgba(255,255,255,.07);transform:translateY(-1px); }
      #modalExitoPromo .share-btn .sb-icon {
        width:32px;height:32px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;flex-shrink:0;
      }
      #modalExitoPromo .share-btn .sb-label { font-size:12px;font-weight:600;color:#e5e7eb; }
      #modalExitoPromo .share-btn .sb-sub   { font-size:10px;color:#6b7280; }
 
      #modalExitoPromo .share-btn.wp   { border-color:rgba(34,197,94,.2);background:rgba(34,197,94,.06); }
      #modalExitoPromo .share-btn.share { border-color:rgba(99,102,241,.2);background:rgba(99,102,241,.06); }
      #modalExitoPromo .share-btn.view  {
        grid-column:1/-1;
        border-color:rgba(245,158,11,.2);background:rgba(245,158,11,.06);
      }
      #modalExitoPromo .share-btn.wp   .sb-icon { background:rgba(34,197,94,.15); }
      #modalExitoPromo .share-btn.share .sb-icon { background:rgba(99,102,241,.15); }
      #modalExitoPromo .share-btn.view  .sb-icon { background:rgba(245,158,11,.15); }
      #modalExitoPromo .share-btn.wp   .sb-icon i { font-size:18px;color:#22c55e; }
      #modalExitoPromo .share-btn.share .sb-icon i { font-size:18px;color:#818cf8; }
      #modalExitoPromo .share-btn.view  .sb-icon i { font-size:18px;color:#f59e0b; }
 
      #modalExitoPromo .btn-done {
        width:100%;height:48px;border-radius:14px;border:none;
        background:linear-gradient(135deg,#7c3aed,#6d28d9);
        color:#fff;font-size:14px;font-weight:600;
        cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;
        transition:opacity .2s,transform .15s;
      }
      #modalExitoPromo .btn-done:hover { opacity:.9;transform:translateY(-1px); }
    </style>
 
    <div class="sheet">
      <div class="handle"></div>
      <div class="sheet-inner">
 
        <div style="text-align:center;margin-bottom:18px;">
          <img
            class="hero-img"
            src="../img/taza.png"
            alt="Monedas Geinz"
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
          />
          <div class="hero-fallback">
            <i class="ti ti-trophy"></i>
          </div>
        </div>
 
        <h2>¡Promoción publicada!</h2>
        <p class="subtitle">
          Tu promo ya está visible para todos los usuarios<br>
          de <strong style="color:#fff">${localidad || "tu ciudad"}</strong> en Geinz.
        </p>
 
        <div class="url-box">
          <i class="ti ti-link"></i>
          <span class="url-text" title="${url}">${url}</span>
          <button class="btn-copy" id="btnCopyUrl">
            <i class="ti ti-copy" style="font-size:12px"></i> Copiar
          </button>
        </div>
 
        <div class="divider"></div>
 
     <div class="share-grid">
  <button class="share-btn wp" id="btnShareWp">
    <div class="sb-icon">
      <img src="../img/whatsapp_icon.png" alt="WhatsApp"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
      <i class="ti ti-brand-whatsapp" style="display:none"></i>
    </div>
    <div>
      <div class="sb-label">WhatsApp</div>
      <div class="sb-sub">Compartir promo</div>
    </div>
  </button>

  <button class="share-btn share" id="btnShareNative">
    <div class="sb-icon">
      <img src="../img/compartir_icon_rojo.webp" alt="Compartir"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
      <i class="ti ti-share" style="display:none"></i>
    </div>
    <div>
      <div class="sb-label">Compartir</div>
      <div class="sb-sub">Más opciones</div>
    </div>
  </button>

  <button class="share-btn view" id="btnVerPromo">
    <div class="sb-icon">
      <img src="../img/logo_geinz.webp" alt="Ver promo"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
      <i class="ti ti-external-link" style="display:none"></i>
    </div>
    <div>
      <div class="sb-label">Ver mi promo en Geinz</div>
      <div class="sb-sub">Previsualizar como la ven los usuarios</div>
    </div>
  </button>
</div>
 
        <button class="btn-done" id="btnCerrarExito">
          <i class="ti ti-check" style="font-size:18px"></i>
          Listo
        </button>
 
      </div>
    </div>
  `;

    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) cerrarModalExito();
    });

    document.getElementById("btnCopyUrl").addEventListener("click", () => {
      navigator.clipboard.writeText(url).then(() => {
        const b = document.getElementById("btnCopyUrl");
        if (b) {
          b.classList.add("copied");
          b.innerHTML =
            '<i class="ti ti-check" style="font-size:12px"></i> Copiado';
          setTimeout(() => {
            b.classList.remove("copied");
            b.innerHTML =
              '<i class="ti ti-copy" style="font-size:12px"></i> Copiar';
          }, 2200);
        }
      });
    });

    document.getElementById("btnShareWp").addEventListener("click", () => {
      window.open(
        `https://wa.me/?text=${encodeURIComponent("Mira esta promo en Geinz: " + url)}`,
        "_blank",
      );
    });

    document.getElementById("btnShareNative").addEventListener("click", () => {
      if (navigator.share) navigator.share({ title: "Promo en Geinz", url });
      else {
        navigator.clipboard.writeText(url);
        mostrarToast("Enlace copiado al portapapeles");
      }
    });

    document.getElementById("btnVerPromo").addEventListener("click", () => {
      window.open(url, "_blank");
    });

    document
      .getElementById("btnCerrarExito")
      .addEventListener("click", cerrarModalExito);

    function cerrarModalExito() {
      modal.style.animation = "fadeInOverlay .2s ease reverse";
      setTimeout(() => modal.remove(), 200);
    }
  }

  function limpiarFormulario() {
    imagesData = [null, null, null, null, null];
    imgsCount = 0;
    document.querySelectorAll(".image-slot").forEach((slot) => {
      slot.classList.remove("filled");
      slot.querySelector(".image-slot-preview").style.display = "none";
      slot.querySelector(".image-slot-preview").src = "";
      slot.querySelector(".image-slot-content").style.display = "flex";
    });
    tituloInput.value = "";
    descripcionInput.value = "";
    precioInput.value = "";
    mensajeWpInput.value = "Hola, quiero esta oferta que vi en Geinz";
    mensajeShareInput.value = "Mira esta promo en Geinz 🎁";
    resultadoIAContainer.innerHTML = "";
    // Resetear términos
    terminosAceptados = false;
    const tc = document.getElementById("terminosCheck");
    if (tc) tc.checked = false;
    document
      .querySelectorAll(
        '.param-box > .param-row > label.switch input[type="checkbox"]',
      )
      .forEach((cb) => {
        cb.checked = false;
        const panel = cb
          .closest(".param-row")
          ?.parentElement?.querySelector(".sub-panel");
        if (panel) panel.classList.remove("open");
      });
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    const str = `${manana.getFullYear()}-${String(manana.getMonth() + 1).padStart(2, "0")}-${String(manana.getDate()).padStart(2, "0")}`;
    document.getElementById("fechaInicio").value = str;
    document.getElementById("fechaFin").value = "";
    document.getElementById("duracionDiasContainer").innerHTML = "";
    document.querySelector('input[name="plazo"][value="dias"]').checked = true;
    tipoPlazo();
    precioYaSeteado = false;
    validate();
  }

  /* ── EVENTOS ── */
  tituloInput?.addEventListener("input", validate);
  descripcionInput?.addEventListener("input", validate);
  mensajeWpInput?.addEventListener("input", validate);
  btnDescripcionIA?.addEventListener("click", mejorarTextoIA);
  btnMensajeWpIA?.addEventListener("click", generarMensajeWhatsappIA);
  btnMensajeShareIA?.addEventListener("click", generarMensajeCompartirIA);
  btnImagenIA?.addEventListener("click", generarImagenTextoIA);

  document.getElementById("inputHoras")?.addEventListener("input", function () {
    // Permitir borrar el campo para redigitar
    if (this.value === "" || this.value === "0") {
      this.value = "";
      return;
    }
    let v = parseInt(this.value);
    if (isNaN(v)) {
      this.value = "";
      return;
    }
    if (v > 20) {
      v = 20;
      this.value = v;
    }
    calcularDuracionHoras();
  });

  document.getElementById("inputHoras")?.addEventListener("blur", function () {
    let v = parseInt(this.value);
    if (isNaN(v) || v < 1) {
      this.value = 1;
      calcularDuracionHoras();
    }
  });

  document.getElementById("fechaFin")?.addEventListener("change", function () {
    const fi = document.getElementById("fechaInicio");
    if (this.value && fi.value && this.value < fi.value) {
      mostrarToast("La fecha final no puede ser menor a la inicial", "error");
      this.value = fi.value;
    }
    calcularDuracionDias();
  });

  document
    .querySelector(".btn-submit")
    ?.addEventListener("click", publicarPromocion);

  aplicarPreciosEnDOM();
  validate();
  tipoPlazo();
})();

/* ── MENSAJES DESDE EL FRAME PADRE ── */
window.addEventListener("message", (event) => {
  if (event.data?.type === "DATOS_TIENDA") {
    const d = event.data.payload;
    datosTienda = {
      id_tienda: d.id_tienda,
      localidad: d.localidad,
      nombre_tienda: d.nombre_tienda,
      categoria_tienda: d.categoria_tienda,
      img_tienda: { logo_tienda: d.logo_tienda },
      metodo_contacto: d.metodo_contacto,
      metodos_pago: d.metodos_pago,
      ubicacion: d.ubicacion,
      saldo_tienda: d.saldo_tienda,
    };
    _aplicarDatosTienda(datosTienda);
    actualizarEstadoBotonPublicar();
  }
  if (event.data?.type === "PATCH_TIENDA") {
    if (!datosTienda) return;
    const diff = event.data.payload;
    for (const key of Object.keys(diff)) {
      const parts = key.split(".");
      if (parts.length === 1) {
        datosTienda[key] = diff[key];
      } else {
        let obj = datosTienda;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!obj[parts[i]]) obj[parts[i]] = {};
          obj = obj[parts[i]];
        }
        obj[parts[parts.length - 1]] = diff[key];
      }
    }
    _aplicarDatosTienda(datosTienda);
    actualizarEstadoBotonPublicar();
  }
  if (
    event.data?.type === "PUBLICIDAD_UPDATE" ||
    event.data?.type === "PLANES_UPDATE"
  ) {
    const pub = event.data.publicidad || {};
    if (typeof _aplicarPublicidad === "function") _aplicarPublicidad(pub);
  }

  if (event.data?.type === "SALDO_UPDATE") {
    const nuevoSaldo = event.data?.saldo ?? 0;

    // 1. Actualizar state local
    if (datosTienda) {
      datosTienda.saldo_tienda = nuevoSaldo;
    } else {
      // Si aún no llegó DATOS_TIENDA, guardar para cuando llegue
      window._saldoPendiente = nuevoSaldo;
    }

    // 2. Actualizar badge de créditos en la UI
    const el = document.getElementById("creditos_value");
    if (el)
      el.textContent = `${Number(nuevoSaldo).toLocaleString("en-US")} Creditos  `;

    // 3. Re-validar botones IA y botón publicar
    actualizarBotonesIA();
    actualizarCostoPublicar();
    actualizarEstadoBotonPublicar();
    verificarSaldo();

    console.log("💰 [SALDO_UPDATE] Saldo actualizado en iframe:", nuevoSaldo);
  }
});

function _aplicarDatosTienda(d) {
  if (!d) return;
  if (window._saldoPendiente !== undefined) {
    d.saldo_tienda = window._saldoPendiente;
    delete window._saldoPendiente;
  }
  const numeroWp = d.metodo_contacto?.whatsapp?.numero || "";
  const wpInput = document.querySelector('#wp input[type="text"]');
  if (wpInput && numeroWp) wpInput.value = numeroWp;
  const saldo = d.saldo_tienda || 0;
  const el = document.getElementById("creditos_value");
  if (el)
    el.textContent = `${Number(saldo).toLocaleString("en-US")} Creditos  `;
  const geoInputs = document.querySelectorAll('#geo input[type="text"]');
  if (geoInputs[0]) geoInputs[0].value = d.ubicacion?.dirección || "";
  if (geoInputs[1]) geoInputs[1].value = d.ubicacion?.referencia || "";
  const mp = d.metodos_pago || {};
  const pagosChecks = document.querySelectorAll(
    '#payments .pay-item input[type="checkbox"]',
  );
  if (pagosChecks[0]) pagosChecks[0].checked = mp.yape?.enable ?? false;
  if (pagosChecks[1]) pagosChecks[1].checked = mp.plin?.enable ?? false;
  if (pagosChecks[2]) pagosChecks[2].checked = mp.agora?.enable ?? false;
  if (pagosChecks[3]) pagosChecks[3].checked = mp.efectivo?.enable ?? false;
  if (pagosChecks[4])
    pagosChecks[4].checked = mp.visa_mastercard?.enable ?? false;
  if (pagosChecks[5])
    pagosChecks[5].checked = mp.visa_mastercard?.enable ?? false;
  actualizarBotonesIA();
}

function _aplicarPublicidad(pub) {
  if (pub.ia_imagen_texto != null)
    _precios.ia_imagen_texto = pub.ia_imagen_texto;
  if (pub.mejora_texto_x3 != null)
    _precios.mejora_texto_x3 = pub.mejora_texto_x3;
  if (pub.mensaje_w_c != null) _precios.mensaje_w_c = pub.mensaje_w_c;
  if (pub.publicacion_24h != null)
    _precios.publicacion_24h = pub.publicacion_24h;
  if (pub.publicacion_por_hora != null)
    _precios.publicacion_x_hora = pub.publicacion_por_hora;
  if (pub.ceo_descripcion != null)
    _precios.mejora_texto_x3 = pub.ceo_descripcion;
  if (pub.costo_por_moneda != null)
    _precios.costo_por_moneda = pub.costo_por_moneda; // 👈
  aplicarPreciosEnDOM();
  actualizarEstadoBotonPublicar();
  actualizarBotonesIA();
}

// ── Validar saldo para botones IA ──────────────────────
function actualizarBotonesIA() {
  if (!datosTienda) return;
  const saldo = datosTienda?.saldo_tienda ?? 0;
  actualizarBannerSaldo(saldo);

  const botones = [
    { id: "btnImagenIA", costo: _precios.ia_imagen_texto },
    { id: "btnDescripcionIA", costo: _precios.mejora_texto_x3 },
    { id: "btnMensajeWpIA", costo: _precios.mensaje_w_c },
    { id: "btnMensajeShareIA", costo: _precios.mensaje_w_c },
  ];

  botones.forEach(({ id, costo }) => {
    const btn = document.getElementById(id);
    if (!btn) return;

    btn.querySelector(".btn-no-saldo-badge")?.remove();
    btn.querySelector(".btn-bloqueado-badge")?.remove();
    btn.style.filter = "";

    const esteActivo = _iaActivo === id;
    const hayOtroActivo = _iaActivo !== null && !esteActivo;

    // Otro botón está generando → bloquear este
    if (hayOtroActivo) {
      btn.disabled = true;
      btn.style.opacity = "0.35";
      btn.style.cursor = "not-allowed";
      const badge = document.createElement("span");
      badge.className = "btn-bloqueado-badge";
      badge.style.cssText = `
        display:inline-flex;align-items:center;gap:3px;
        background:rgba(107,114,128,0.18);border:1px solid rgba(107,114,128,0.32);
        color:#9ca3af;font-size:10px;font-weight:700;
        padding:2px 7px;border-radius:999px;margin-left:8px;
        vertical-align:middle;pointer-events:none;`;
      badge.innerHTML = `<i class="ti ti-lock" style="font-size:11px"></i> Ocupado`;
      btn.appendChild(badge);
      return;
    }

    // Este es el que está generando → se gestiona solo con setBtnLoading
    if (esteActivo) return;

    // Estado normal → evaluar saldo
    btn.style.opacity = "";
    btn.style.cursor = "";
    const saldoOk = costo === 0 || saldo >= costo;

    if (saldoOk) {
      btn.disabled = false;
      btn.title = "";
    } else {
      btn.disabled = true;
      btn.title = `Necesitas ${costo.toLocaleString("es-PE")} créditos`;
      btn.style.opacity = "0.45";
      btn.style.cursor = "not-allowed";
      const badge = document.createElement("span");
      badge.className = "btn-no-saldo-badge";
      badge.style.cssText = `
        display:inline-flex;align-items:center;gap:3px;
        background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);
        color:#f87171;font-size:10px;font-weight:700;
        padding:2px 7px;border-radius:999px;margin-left:8px;
        vertical-align:middle;pointer-events:none;`;
      badge.innerHTML = `<i class="ti ti-coins" style="font-size:11px"></i> Necesitas ${costo.toLocaleString("es-PE")} créditos`;
      btn.appendChild(badge);
    }
  });
}
