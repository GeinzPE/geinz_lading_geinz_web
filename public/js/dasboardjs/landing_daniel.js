import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
  authDomain: "geinzworkapp.firebaseapp.com",
  projectId: "geinzworkapp",
  storageBucket: "geinzworkapp.appspot.com",
  messagingSenderId: "921389328767",
  appId: "1:921389328767:web:dc6fffc43a51444f5b524a",
};

// ==================== SEGUNDA APP FIREBASE (planes) ====================
const appPlanes = initializeApp(
  {
    apiKey: "AIzaSyA47YFtXgzUQe8w_Wb6AlfDcQSjOB5rT_U",
    authDomain: "proyectolista-95172.firebaseapp.com",
    projectId: "proyectolista-95172",
    storageBucket: "proyectolista-95172.firebasestorage.app",
    messagingSenderId: "250365546182",
    appId: "1:250365546182:web:732f2342d416eb909111c7",
  },
  "planes",
);
const dbPlanes = getFirestore(appPlanes);
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// ── Al inicio, SIN llamar cargarTienda() aún ──
const _urlParams = new URLSearchParams(window.location.search);
let id = _urlParams.get("id") || sessionStorage.getItem("tiendaId");
let localidad =
  _urlParams.get("localidad") || sessionStorage.getItem("localidad");

const waCardImage = document.getElementById("wa-card-image");
const waTextRenderer = document.getElementById("wa-text-renderer");

// Estado global
const state = {
  planActivo: false, // true = Pro activo en DB
  planSeleccionado: null, // 'free' | 'pro' — lo que el usuario tiene seleccionado en UI
};

const originalValues = { descripcion: "", whatsapp: "", msje_whatsapp: "" };

// ==================== TOAST ====================
function showToast(msg, isError = false) {
  const t = document.getElementById("global-toast");
  t.textContent = msg;
  t.className = "toast-confirm" + (isError ? " error" : "");
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

function showSnackbar(msg) {
  let sb = document.getElementById("snackbar-android");
  if (!sb) {
    sb = document.createElement("div");
    sb.id = "snackbar-android";
    sb.style.cssText = `
      position:fixed;bottom:32px;left:50%;transform:translateX(-50%) translateY(80px);
      background:#fff;color:#1a1a1a;padding:14px 22px;border-radius:8px;
      font-size:14px;font-weight:500;box-shadow:0 4px 20px rgba(0,0,0,0.18);
      z-index:9999;transition:transform .3s cubic-bezier(.4,0,.2,1),opacity .3s;
      opacity:0;max-width:320px;text-align:center;line-height:1.4;
    `;
    document.body.appendChild(sb);
  }
  sb.textContent = msg;
  sb.style.transform = "translateX(-50%) translateY(0)";
  sb.style.opacity = "1";
  clearTimeout(sb._timer);
  sb._timer = setTimeout(() => {
    sb.style.transform = "translateX(-50%) translateY(80px)";
    sb.style.opacity = "0";
  }, 3500);
}
// ==================== COUNTER ====================
function updateCounter(counterId, current, max) {
  const el = document.getElementById(counterId);
  if (!el) return;
  el.textContent = `${current} / ${max}`;
  el.className =
    current >= max
      ? "field-char-counter at-limit"
      : current >= max * 0.85
        ? "field-char-counter near-limit"
        : "field-char-counter";
}

// ==================== CHECK CHANGED ====================
function checkFieldChanged(campo, currentValue) {
  const btnId =
    campo === "msje_whatsapp"
      ? "btn-save-msje"
      : campo === "whatsapp"
        ? "btn-save-whatsapp"
        : "btn-save-descripcion";
  const dotId =
    campo === "msje_whatsapp"
      ? "dot-msje"
      : campo === "whatsapp"
        ? "dot-whatsapp"
        : "dot-descripcion";

  const btn = document.getElementById(btnId);
  const dot = document.getElementById(dotId);
  if (!btn) return;

  const changed = currentValue.trim() !== originalValues[campo].trim();
  if (changed) {
    btn.classList.add("visible");
    btn.classList.remove("saved");
    btn.textContent =
      campo === "descripcion"
        ? "💾 Guardar descripción"
        : campo === "whatsapp"
          ? "💾 Guardar número"
          : "💾 Guardar mensaje";
    if (dot) dot.classList.add("visible");
  } else {
    btn.classList.remove("visible");
    if (dot) dot.classList.remove("visible");
  }
}

// ==================== GUARDAR CAMPO ====================
window.guardarCampo = async function (campo) {
  const btn = document.getElementById(
    campo === "msje_whatsapp"
      ? "btn-save-msje"
      : campo === "whatsapp"
        ? "btn-save-whatsapp"
        : "btn-save-descripcion",
  );

  let value = "";
  if (campo === "descripcion")
    value = document.getElementById("seo-global-input").value.trim();
  else if (campo === "whatsapp")
    value = document.getElementById("input-whatsapp").value.trim();
  else if (campo === "msje_whatsapp")
    value = document.getElementById("input-msje").value.trim();

  if (!value) return showToast("⚠️ El campo no puede estar vacío", true);

  btn.classList.add("saving");
  btn.textContent = "Guardando...";

  try {
    const refLugar = doc(db, "lugares", id);
    let updateData = {};

    if (campo === "descripcion") {
      updateData = { descripcion: value };
    } else if (campo === "whatsapp") {
      const num = parseInt(value.replace(/\D/g, ""), 10);
      if (isNaN(num)) {
        showToast("⚠️ Ingresa un número válido", true);
        btn.classList.remove("saving");
        btn.textContent = "💾 Guardar número";
        return;
      }
      updateData = { whatsapp: num };
    } else if (campo === "msje_whatsapp") {
      updateData = { msje_whatsapp: value };
    }

    await updateDoc(refLugar, updateData);
    originalValues[campo] = value;

    btn.classList.remove("saving");
    btn.classList.add("saved");
    btn.textContent = "✅ Guardado";
    showToast(
      `✅ ${campo === "descripcion" ? "Descripción" : campo === "whatsapp" ? "Número" : "Mensaje"} guardado`,
    );

    const dotId =
      campo === "msje_whatsapp"
        ? "dot-msje"
        : campo === "whatsapp"
          ? "dot-whatsapp"
          : "dot-descripcion";
    const dot = document.getElementById(dotId);
    if (dot) dot.classList.remove("visible");

    setTimeout(() => btn.classList.remove("visible", "saved"), 2000);
    if (campo === "descripcion") actualizarPreview();
  } catch (err) {
    console.error(err);
    btn.classList.remove("saving");
    btn.textContent = "💾 Reintentar";
    showToast("❌ Error al guardar. Intenta de nuevo.", true);
  }
};

// ==================== PREVIEW ====================
// ==================== PREVIEW ====================
function actualizarPreview() {
  // ← Este era el bug: comparaba planSeleccionado OR planActivo
  // Si planActivo era true (pro en DB), isPro siempre era true
  const isPro = state.planSeleccionado === "pro"; // ← solo planSeleccionado

  const imgContainer = document.getElementById("wa-img-container");
  imgContainer.style.display = isPro ? "block" : "none";

  const proText = `Descripción optimizada por Daniel IA para potenciar la visibilidad y conversión de tu negocio. 
Basado en análisis SEO, comportamiento de clientes y millones de datos entrenados para generar 
mensajes más atractivos, estratégicos y orientados a maximizar el ROI y atraer más clientes para ti.`;

  const freeText = `Tu contacto personal no será mostrado públicamente. 
Los clientes podrán comunicarse contigo de forma segura desde Geinz. ✨`;

  waTextRenderer.innerHTML = isPro ? proText : freeText;
}
// ==================== SELECCIONAR PLAN (UI) ====================
window.seleccionarPlan = function (plan) {
  state.planSeleccionado = plan;

  document
    .getElementById("plan-free-card")
    .classList.toggle("selected", plan === "free");
  document
    .getElementById("plan-pro-card")
    .classList.toggle("selected", plan === "pro");
  document
    .getElementById("pro-form-fields")
    .classList.toggle("active-view", plan === "pro");

  actualizarBotonPlan();
  actualizarPreview(); // ← esta línea faltaba
};

function actualizarBotonPlan() {
  const btn = document.getElementById("btn-action-submit");
  const planActivoDB = state.planActivo ? "pro" : "free";
  const planUI = state.planSeleccionado;

  if (planUI === planActivoDB) {
    // misma que DB → botón deshabilitado
    btn.className = "btn-submit-main same-plan";
    btn.textContent =
      planUI === "pro" ? "✅ Plan Pro activo" : "✅ Plan Gratis activo";
  } else if (planUI === "pro") {
    // quiere activar Pro
    btn.className = "btn-submit-main activate-pro";
    btn.textContent = "🚀 Activar Plan Pro";
  } else {
    // quiere degradar a Gratis
    btn.className = "btn-submit-main activate-free";
    btn.textContent = "⬇️ Cambiar a Plan Gratis";
  }
}

// ==================== CAMBIAR PLAN EN DB ====================
window.cambiarPlan = async function () {
  const planActivoDB = state.planActivo ? "pro" : "free";
  if (state.planSeleccionado === planActivoDB) return;

  const activarPro = state.planSeleccionado === "pro";
  const btn = document.getElementById("btn-action-submit");
  btn.classList.add("loading");
  btn.textContent = "Guardando plan...";

  try {
    const refLugar = doc(db, "lugares", id);
    const refTienda = doc(db, "Tiendas", localidad, localidad, id);
    const refCreditos = doc(dbPlanes, "creditos_tienda", id);

    const updateData = {
      plantilla: activarPro,
      bot_plan_pro: activarPro,
    };

    if (activarPro) {
      // Leer puntos_tienda actuales desde /Tiendas/localidad/localidad/id
      const snapTienda = await getDoc(refTienda);
      const saldoActual = snapTienda.exists()
        ? (snapTienda.data().puntos_tienda ?? 0)
        : 0;

      if (saldoActual < 300) {
        showSnackbar(
          `Necesitas mínimo 300 créditos para activar el Plan Pro. Tienes ${saldoActual.toLocaleString("es-PE")}.`,
        );
        btn.classList.remove("loading"); // ← esto faltaba
        actualizarBotonPlan(); // ← esto faltaba
        return;
      }
      // Actualizar las 3 rutas en paralelo
      await Promise.all([
        updateDoc(refLugar, updateData),
        updateDoc(refTienda, updateData),
        // Equivalente al setOptions.merge() de Kotlin
        setDoc(
          refCreditos,
          {
            creditos: saldoActual,
            fecha_activacion_inicial: serverTimestamp(),
          },
          { merge: true },
        ),
      ]);
    } else {
      // Degradar a gratis — solo actualizar las 2 rutas principales
      await Promise.all([
        updateDoc(refLugar, updateData),
        updateDoc(refTienda, updateData),
      ]);
    }

    state.planActivo = activarPro;

    document.getElementById("status-badge").textContent = activarPro
      ? "Activo (Pro)"
      : "Activo (Gratis)";

    actualizarBotonPlan();
    actualizarPreview();

    showToast(
      activarPro
        ? "🚀 Plan Pro activado correctamente"
        : "✅ Cambiado a Plan Gratis",
    );
  } catch (err) {
    console.error("Error cambiando plan:", err);
    showToast("❌ Error al cambiar el plan", true);
    btn.classList.remove("loading");
    actualizarBotonPlan();
  }
};
// ==================== OPTIMIZAR IMAGEN (canvas) ====================
async function optimizarImagen(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Máx 900px — suficiente para WhatsApp, reduce peso dramáticamente
      const MAX = 900;
      let w = img.naturalWidth;
      let h = img.naturalHeight;

      if (w > MAX) {
        h = Math.round((h * MAX) / w);
        w = MAX;
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      const TARGET_KB = 100;
      const TARGET_BYTES = TARGET_KB * 1024;

      // Compresión iterativa: baja calidad hasta entrar en el target
      let quality = 0.75;
      const MIN_QUALITY = 0.3; // nunca bajar de aquí para no destruir la imagen
      const step = 0.05;

      function intentar() {
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("Error al convertir"));

            if (blob.size <= TARGET_BYTES || quality <= MIN_QUALITY) {
              // Llegamos al target o al límite mínimo
              console.log(
                `✅ Imagen final: ${(blob.size / 1024).toFixed(1)}KB — calidad: ${quality.toFixed(2)}`,
              );
              resolve(blob);
            } else {
              // Todavía pesa más de 100KB, bajar calidad y reintentar
              quality = Math.max(MIN_QUALITY, quality - step);
              intentar();
            }
          },
          "image/jpeg",
          quality,
        );
      }

      intentar();
    };

    img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    img.src = url;
  });
}
// ==================== SUBIR IMAGEN A STORAGE ====================
// ==================== SUBIR IMAGEN A STORAGE ====================
async function subirImagenStorage(blob) {
  const timestamp = Date.now();
  const storagePath = `tiendas/${id}/imagenes/para_whatsapp/bot_${timestamp}.jpg`;
  const storageRef = ref(storage, storagePath);

  const progressBar = document.getElementById("upload-progress-bar");
  const progressFill = document.getElementById("upload-progress-fill");
  progressBar.classList.add("active");
  progressFill.style.width = "0%";

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, blob, {
      contentType: "image/jpeg",
    });

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const pct = Math.round(
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
        );
        progressFill.style.width = pct + "%";
      },
      (error) => {
        progressBar.classList.remove("active");
        reject(error);
      },
      async () => {
        progressBar.classList.remove("active");
        progressFill.style.width = "0%";
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        resolve(url);
      },
    );
  });
}
// ==================== SELECCIONAR & PROCESAR IMAGEN ====================
window.seleccionarImagen = function () {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";

  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Preview local inmediato
    const localUrl = URL.createObjectURL(file);
    waCardImage.src = localUrl;

    showToast("⏳ Optimizando y subiendo imagen...");

    try {
      // 1. Optimizar
      const blob = await optimizarImagen(file);

      // 2. Subir a Storage
      const downloadUrl = await subirImagenStorage(blob);

      // 3. Guardar URL en Firestore (lugares)
      const refLugar = doc(db, "lugares", id);
      await updateDoc(refLugar, { imagen_bot: downloadUrl });

      // 4. Actualizar src real con URL de Storage
      waCardImage.src = downloadUrl;
      URL.revokeObjectURL(localUrl);

      showToast("✅ Imagen guardada correctamente");
    } catch (err) {
      console.error("Error subiendo imagen:", err);
      showToast("❌ Error al subir la imagen", true);
    }
  };

  input.click();
};

// ==================== GENERAR DESCRIPCIÓN CON IA ====================
window.generarDescripcionIA = async function () {
  const btn = document.getElementById("btn-ia-generar");
  btn.classList.add("loading");
  btn.textContent = "Generando";

  try {
    // Leer datos frescos de la tienda
    const refTienda = doc(db, "Tiendas", localidad, localidad, id);
    const snap = await getDoc(refTienda);

    if (!snap.exists()) {
      showToast("⚠️ No se encontraron datos del negocio", true);
      return;
    }

    const data = snap.data();

    // ── Subcategorías ──
    const subcats = Array.isArray(data.subcategoria)
      ? data.subcategoria.filter(Boolean).join(", ")
      : "";

    // ── Métodos de pago habilitados ──
    const metodos = data.metodos_pago || {};
    const pagosActivos = Object.entries(metodos)
      .filter(([key, val]) => val?.enable === true && key !== "stability")
      .map(([key]) => {
        const nombres = {
          efectivo: "Efectivo",
          yape: "Yape",
          plin: "Plin",
          agora: "Agora",
          visa_mastercard: "Visa/Mastercard",
        };
        return nombres[key] || key;
      })
      .join(", ");

    // ── Construir texto para la IA ──
    const partes = [];
    if (subcats) partes.push(`Especialidades: ${subcats}`);
    if (pagosActivos) partes.push(`Métodos de pago: ${pagosActivos}`);

    if (partes.length === 0) {
      showToast(
        "⚠️ No hay subcategorías ni métodos de pago configurados",
        true,
      );
      return;
    }

    const texto = partes.join(". ");

    // ── Llamar a la Cloud Function ──
    const { getFunctions, httpsCallable } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js");
    const functions = getFunctions(app, "us-central1");
    const generarFn = httpsCallable(
      functions,
      "generar_descripcion_whatsapp_ia",
    );

    const result = await generarFn({
      texto,
      saldo_actual: data.puntos_tienda ?? 0,
      saldo_descuento: window._precioDescripcionIA ?? 0,
      id_tienda: id,
      precio_por_moneda: 0.012,
      localidad: localidad,
      nombre_tienda: data.nombre_tienda ?? "",
      tipo_paquete: "Gen Descripción WP IA",
    });
    if (result.data?.ok && result.data?.descripcion) {
      const desc = result.data.descripcion.trim();

      // Setear en el textarea
      const textarea = document.getElementById("seo-global-input");
      textarea.value = desc;

      // Disparar detección de cambios y preview
      updateCounter("counter-descripcion", desc.length, 200);
      checkFieldChanged("descripcion", desc);
      actualizarPreview();

      showToast("✨ Descripción generada — revísala y guárdala");
    } else {
      showToast("⚠️ La IA no devolvió resultado", true);
    }
  } catch (err) {
    console.error("Error generando descripción:", err);
    showToast("❌ Error al generar descripción", true);
  } finally {
    btn.classList.remove("loading");
    btn.textContent = "Generar descripción con IA ✨";
  }
};

// ==================== ACORDEÓN MÓVIL ====================
window.toggleSeoAccordion = function () {
  document
    .getElementById("seo-collapsible-container")
    .classList.toggle("expanded");
  document.getElementById("seo-arrow-indicator").classList.toggle("rotated");
};

// ==================== BOTÓN IA: VALIDAR SALDO ====================
function actualizarBotonIA() {
  const btn = document.getElementById("btn-ia-generar");
  if (!btn) return;

  const costo = window._precioDescripcionIA ?? 0;
  const saldo = window._saldoActual ?? 0;

  btn.querySelector(".btn-no-saldo-badge")?.remove();

  if (costo === 0 || saldo >= costo) {
    btn.disabled = false;
    btn.style.opacity = "";
    btn.style.cursor = "";
    btn.innerHTML = `Generar descripción con IA ✨ <span style="opacity:0.7;font-size:11px">${costo} Creditos</span>`;
  } else {
    btn.disabled = true;
    btn.style.opacity = "0.5";
    btn.style.cursor = "not-allowed";
    btn.innerHTML = `Generar descripción con IA ✨
      <span class="btn-no-saldo-badge" style="
        display:inline-flex;align-items:center;gap:3px;
        background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);
        color:#f87171;font-size:10px;font-weight:700;
        padding:2px 7px;border-radius:999px;margin-left:8px;
        vertical-align:middle;pointer-events:none;">
        Saldo insuficiente
      </span>`;
  }
}
// ==================== CARGAR DATOS ====================
async function cargarTienda() {
  if (!id || !localidad) {
    console.error("❌ Faltan parámetros: id =", id, "| localidad =", localidad);
    showToast("⚠️ Faltan parámetros de tienda en la URL", true);
    document.getElementById("skeleton-loader").style.display = "none";
    return;
  }
  try {
    const refTienda = doc(db, "Tiendas", localidad, localidad, id);
    const refLugar = doc(db, "lugares", id);

    const [snapTienda, snapLugar] = await Promise.all([
      getDoc(refTienda),
      getDoc(refLugar),
    ]);

    if (snapTienda.exists()) {
      const tData = snapTienda.data();
      if (tData?.img_tienda?.lista_img?.ambientales?.[0]) {
        waCardImage.src = tData.img_tienda.lista_img.ambientales[0];
      }
    }

    if (snapLugar.exists()) {
      const lugar = snapLugar.data();

      // Determinar plan activo desde DB
      const esPro = lugar.plantilla === true;
      state.planActivo = esPro;
      state.planSeleccionado = esPro ? "pro" : "free";

      // Imagen bot
      if (lugar.imagen_bot) waCardImage.src = lugar.imagen_bot;

      // Campos
      const desc = lugar.descripcion || "";
      const wa = lugar.whatsapp !== undefined ? String(lugar.whatsapp) : "";
      const msje = lugar.msje_whatsapp || "";

      originalValues.descripcion = desc;
      originalValues.whatsapp = wa;
      originalValues.msje_whatsapp = msje;

      document.getElementById("seo-global-input").value = desc;
      document.getElementById("input-whatsapp").value = wa;
      document.getElementById("input-msje").value = msje;

      updateCounter("counter-descripcion", desc.length, 200);
      updateCounter("counter-msje", msje.length, 200);

      // Dataset para preview
      waTextRenderer.dataset.nombre = lugar.nombre || "Negocio";
      waTextRenderer.dataset.categoria = lugar.categoria || "";

      // Badge de estado
      const badge = document.getElementById("status-badge");
      badge.textContent = esPro ? "Activo (Pro)" : "Activo (Gratis)";

      // Marcar plan en UI
      document
        .getElementById("plan-free-card")
        .classList.toggle("selected", !esPro);
      document
        .getElementById("plan-pro-card")
        .classList.toggle("selected", esPro);
      document
        .getElementById("pro-form-fields")
        .classList.toggle("active-view", esPro);

      actualizarBotonPlan();
      actualizarPreview();
    }

    const refPrecio = doc(dbPlanes, "precio_apartado", "app");
    const refPrecioBot = doc(dbPlanes, "precio_apartado", "bot_daniel");

    console.log("📄 Ref App:", refPrecio.path);
    console.log("📄 Ref Bot:", refPrecioBot.path);

    const snapPrecio = await getDoc(refPrecio);
    const snapPrecioBot = await getDoc(refPrecioBot);

    console.log("📥 snapPrecio.exists():", snapPrecio.exists());
    console.log("📥 snapPrecioBot.exists():", snapPrecioBot.exists());

    if (snapPrecio.exists()) {
      const precioData = snapPrecio.data();
      const precioBotData = snapPrecioBot.exists() ? snapPrecioBot.data() : {};

      console.log("📊 Datos App:", precioData);
      console.log("📊 Datos Bot:", precioBotData);

      window._precioDescripcionIA = precioData?.descripcionSEO ?? 0;
      window._precioPorClick = precioBotData?.plantillas ?? 10;
      window._precioPorContacto = precioBotData?.contacto_directo ?? 20;

      console.log("💰 descripcionSEO:", window._precioDescripcionIA);
      console.log("💰 precio_por_click:", window._precioPorClick);
      console.log("💰 precio_por_contacto:", window._precioPorContacto);

      document.getElementById("precio-plantilla").textContent =
        window._precioPorClick;

      document.getElementById("precio-contacto").textContent =
        window._precioPorContacto;

      console.log(
        "🖥️ precio-plantilla:",
        document.getElementById("precio-plantilla").textContent,
      );
      console.log(
        "🖥️ precio-contacto:",
        document.getElementById("precio-contacto").textContent,
      );

      actualizarBotonIA();

      console.log("✅ actualizarBotonIA ejecutado");
    } else {
      console.error("❌ No existe el documento precio_apartado/app");
    }
  } catch (err) {
    console.error("Error cargando datos:", err);
  } finally {
    document.getElementById("skeleton-loader").style.display = "none";
  }
}

// ==================== EVENTOS ====================
document.getElementById("seo-global-input").addEventListener("input", (e) => {
  updateCounter("counter-descripcion", e.target.value.length, 200);
  checkFieldChanged("descripcion", e.target.value);
  actualizarPreview();
});

document.getElementById("input-whatsapp").addEventListener("input", (e) => {
  checkFieldChanged("whatsapp", e.target.value);
});

document.getElementById("input-msje").addEventListener("input", (e) => {
  updateCounter("counter-msje", e.target.value.length, 200);
  checkFieldChanged("msje_whatsapp", e.target.value);
});

// Iniciar
cargarTienda();

window.addEventListener("message", (event) => {
  // ── 1. DATOS_TIENDA: recibir id y localidad del padre ──
  if (event.data?.type === "DATOS_TIENDA") {
    if (!id && event.data.id) {
      id = event.data.id;
      window.TIENDA_ID = event.data.id;
    }
    if (!localidad && event.data.localidad) {
      localidad = event.data.localidad;
      window.TIENDA_LOCALIDAD = event.data.localidad;
    }
    cargarTienda(); // ← recién aquí
    return;
  }

  // ── 2. SALDO_UPDATE: actualizar créditos en UI ──
  if (event.data?.type === "SALDO_UPDATE") {
    const saldo = event.data.saldo;
    window._saldoActual = saldo;
    actualizarBotonIA();

    const el = document.getElementById("saldo_tienda");
    if (!el) return;
    el.innerHTML = `
    <div style="
      width: 100%;
      background: linear-gradient(135deg, #0d0d0f 0%, #13101f 100%);
      border: 1px solid rgba(168,85,247,0.2);
      border-radius: 20px;
      padding: 18px 22px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-sizing: border-box;
      gap: 12px;
    ">
      <!-- Izquierda: ícono + texto -->
      <div style="display:flex;align-items:center;gap:14px;">

        <div style="
          width: 44px;
          height: 44px;
          border-radius: 14px;
       
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        ">
          <img src="../img/icon_monedas_3d.webp" 
               style="width:60px;height:60px;object-fit:contain;" 
               alt="monedas">
        </div>

        <div>
          <div style="
            font-size: 11px;
            color: rgba(255,255,255,0.4);
            font-weight: 500;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            margin-bottom: 3px;
          ">Créditos disponibles
</div>
          <div style="
            font-size: 22px;
            font-weight: 700;
            color: #fff;
            line-height: 1;
            display: flex;
            align-items: baseline;
            gap: 5px;
          ">
            ${saldo.toLocaleString("es-PE")}
            <span style="font-size:13px;color:rgba(168,85,247,0.8);font-weight:500;">Creditos</span>
          </div>
        </div>

      </div>

 

    </div>

    <style>
      @keyframes saldoPulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%       { opacity: 0.4; transform: scale(0.85); }
      }
    </style>
  `;

    return;
  }
});
