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

let tipoTextoIA = "venta";
let tipoImagenIA = "venta";

// ══════════════════════════════════════════
//  PRECIOS — se llenan cuando llega PLANES_UPDATE desde el padre
//  Defaults en 0 para que se vea claramente si aún no llegaron
//  Los nombres de campo Firestore son fijos (ceo_descripcion50, etc.)
//  pero sus valores int64 varían — siempre usamos el valor, nunca el sufijo
// ══════════════════════════════════════════
let _precios = {
  ia_imagen_texto: 0, // ← publicidad.ia_imagen_texto100   (campo fijo, valor variable)
  mejora_texto_x3: 0, // ← publicidad.ceo_descripcion50    (campo fijo, valor variable)
  mensaje_w_c: 0, // ← publicidad.mensaje_w_c90        (campo fijo, valor variable)
  publicacion_24h: 0, // ← publicidad.publicacion_24h100   (campo fijo, valor variable)
  publicacion_x_hora: 0, // ← publicidad.publicacion_por_hora10 (campo fijo, valor variable)
};

// Aplica los precios recibidos a los botones del DOM
function aplicarPreciosEnDOM() {
  // ── Botón: Generar imagen + texto con IA ──
  const precioImgEl = document.getElementById("precioImagenIA");
  if (precioImgEl) precioImgEl.textContent = _precios.ia_imagen_texto;

  // ── Botón: Mejorar título y descripción ──
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

  // ── Botón: Mejorar WhatsApp ──
  const precioWpEl = document.getElementById("precioMensajeWpIA");
  if (precioWpEl) precioWpEl.textContent = `+${_precios.mensaje_w_c}`;

  // ── Botón: Mejorar Compartir ──
  const precioShareEl = document.getElementById("precioShareIA");
  if (precioShareEl) precioShareEl.textContent = `+${_precios.mensaje_w_c}`;

  // ── Recalcular costo total de publicación ──
  actualizarCostoPublicar();
}

// Calcula el costo total según plazo activo y actualiza el botón Publicar
function actualizarCostoPublicar() {
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
      const inicio = new Date(fi);
      const fin = new Date(ff);
      if (fin >= inicio) {
        const dias = Math.ceil(Math.abs(fin - inicio) / 86400000) + 1;
        total = dias * _precios.publicacion_24h;
      } else {
        total = _precios.publicacion_24h; // mínimo 1 día mientras elige
      }
    } else {
      total = _precios.publicacion_24h;
    }
  }

  const btn = document.querySelector(".btn-submit");
  if (btn && !btn.disabled) {
    btn.innerHTML = `<i class="ti ti-send" style="font-size:15px" aria-hidden="true"></i>
      Publicar &nbsp;·&nbsp;
      <span style="display:inline-flex;align-items:center;gap:4px;font-weight:700;">
        ${total.toLocaleString("es-PE")}
        <img src="../img/icon_monedas_3d.webp" style="width:16px;height:16px;vertical-align:middle;" alt="pts">
      </span>`;
  }
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

// ── Auth anónimo ───────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("Usuario listo:", user.uid);
  } else {
    console.log("No hay sesión activa");
  }
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

// ── Datos de tienda ────────────────────────────────────
let datosTienda = null;
const ID_TIENDA = "fW7W8RsgkkQ3IYfxKHGR";
const LOCALIDAD = "barranca";
/*
async function cargarDatosTienda() {
  try {
    const ref = doc(db, "Tiendas", LOCALIDAD, LOCALIDAD, ID_TIENDA);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      console.warn("Tienda no encontrada");
      return;
    }
    datosTienda = snap.data();
    console.log("✅ Tienda cargada:", datosTienda);

    const numeroWp = datosTienda?.metodo_contacto?.whatsapp?.numero || "";
    const wpInput = document.querySelector('#wp input[type="text"]');
    if (wpInput && numeroWp) wpInput.value = numeroWp;

    const direccion = datosTienda?.ubicacion?.dirección || "";
    const referencia = datosTienda?.ubicacion?.referencia || "";
    const geoInputs = document.querySelectorAll('#geo input[type="text"]');
    if (geoInputs[0]) geoInputs[0].value = direccion;
    if (geoInputs[1]) geoInputs[1].value = referencia;

    const mp = datosTienda?.metodos_pago || {};
    const pagosChecks = document.querySelectorAll(
      '#payments .pay-item input[type="checkbox"]',
    );
    if (pagosChecks[0]) pagosChecks[0].checked = mp?.yape?.enable ?? false;
    if (pagosChecks[1]) pagosChecks[1].checked = mp?.plin?.enable ?? false;
    if (pagosChecks[2]) pagosChecks[2].checked = mp?.agora?.enable ?? false;
    if (pagosChecks[3]) pagosChecks[3].checked = mp?.efectivo?.enable ?? false;
    if (pagosChecks[4])
      pagosChecks[4].checked = mp?.visa_mastercard?.enable ?? false;
    if (pagosChecks[5])
      pagosChecks[5].checked = mp?.visa_mastercard?.enable ?? false;
  } catch (e) {
    console.error("Error cargando tienda:", e);
  }
}
cargarDatosTienda();
 */
/* ══════════════════════════════════════════
     STORAGE — SUBIR IMÁGENES (FRONT)
   ══════════════════════════════════════════ */
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
      console.log("✅ Bot URL:", botUrl);
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
      console.log(`✅ Imagen ${i + 1} subida:`, url);
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
  console.log("✅ img_container guardado en Firestore");
  return imgContainer;
}

/* ══════════════════════════════════════════
       COMPRIMIR IMAGEN
    ══════════════════════════════════════════ */
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

(function () {
  /* ══════════════════════════════════════════
       CLOUD FUNCTIONS
    ══════════════════════════════════════════ */
  const CLOUD_FN_URL =
    "https://us-central1-geinzworkapp.cloudfunctions.net/generar_titulo_descripcion_IA";
  const CLOUD_FN_TEXT_URL =
    "https://us-central1-geinzworkapp.cloudfunctions.net/generar_texto_ia";
  const CLOUD_FN_SHARE_URL =
    "https://us-central1-geinzworkapp.cloudfunctions.net/generar_texto_compartir_ia";
  const CLOUD_FN_WP_URL =
    "https://generar-whatsapp-contacto-ia-oixttik5rq-uc.a.run.app";
  const CLOUD_FN_CREAR_PROMO = "https://crearpromocion-oixttik5rq-uc.a.run.app";

  /* ══════════════════════════════════════════
       ELEMENTOS
    ══════════════════════════════════════════ */
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

  /* ══════════════════════════════════════════
       ESTADO
    ══════════════════════════════════════════ */
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

  /* ══════════════════════════════════════════
       HELPERS
    ══════════════════════════════════════════ */
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
    if (precioYaSeteado && precioInput.value === precio) return;
    if (precioInput.value !== precio) {
      precioInput.value = precio;
      flashFields(precioInput);
      mostrarToast(`💰 Precio detectado: S/ ${precio}`, "success");
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

  /* ══════════════════════════════════════════
       VALIDACIÓN
    ══════════════════════════════════════════ */
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
  }

  /* ══════════════════════════════════════════
       LOADING BTNS
    ══════════════════════════════════════════ */
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

  /* ══════════════════════════════════════════
       FIREBASE CALL
    ══════════════════════════════════════════ */
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
    console.log("Firebase Response:", data);
    if (!response.ok)
      throw new Error(data?.error?.message || `HTTP ${response.status}`);
    if (data?.error) throw new Error(data.error.message || "Error Firebase");
    return data?.result ?? data;
  }

  /* ══════════════════════════════════════════
       IA: MEJORAR TEXTO
    ══════════════════════════════════════════ */
  async function mejorarTextoIA() {
    precioYaSeteado = false;
    const titulo = tituloInput.value.trim();
    const descripcion = descripcionInput.value.trim();
    if (!titulo || !descripcion) {
      mostrarToast("Completa título y descripción", "error");
      return;
    }
    setBtnLoading(btnDescripcionIA, true);
    try {
      const result = await callFirebaseFunction(CLOUD_FN_TEXT_URL, {
        tipo: tipoTextoIA.toUpperCase(),
        tituloUsuario: titulo,
        descripcionUsuario: descripcion,
      });
      if (!result?.ok || !result?.respuesta)
        throw new Error("Sin respuesta IA");
      renderOpcionesIA(result.respuesta, titulo, descripcion);
      mostrarToast("Textos generados ✨");
    } catch (err) {
      mostrarToast(err.message || "Error generando textos", "error");
    } finally {
      setBtnLoading(btnDescripcionIA, false);
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
    const titulo = tituloInput.value.trim();
    if (!titulo) {
      mostrarToast("Agrega un título primero", "error");
      return;
    }
    setBtnLoading(btnMensajeWpIA, true);
    try {
      const result = await callFirebaseFunction(CLOUD_FN_WP_URL, {
        titulo,
        descripcion: descripcionInput.value.trim(),
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
    }
  }

  /* ── IA: Compartir ── */
  async function generarMensajeCompartirIA() {
    const titulo = tituloInput.value.trim();
    if (!titulo) {
      mostrarToast("Agrega un título primero", "error");
      return;
    }
    setBtnLoading(btnMensajeShareIA, true);
    try {
      const result = await callFirebaseFunction(CLOUD_FN_SHARE_URL, {
        tituloUsuario: titulo,
        descripcionUsuario: descripcionInput.value.trim(),
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
    }
  }

  /* ── IA: Imagen + Texto ── */
  async function generarImagenTextoIA() {
    precioYaSeteado = false;
    if (!imagesData[0]) {
      mostrarToast(
        "Selecciona al menos una imagen en el primer recuadro",
        "error",
      );
      return;
    }
    if (btnImagenIA.classList.contains("loading")) return;
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
    }
  }

  /* ══════════════════════════════════════════
       HANDLE FILES
    ══════════════════════════════════════════ */
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

  /* ══════════════════════════════════════════
       TOGGLE / PLAZO / FECHAS
    ══════════════════════════════════════════ */
  window.toggle = function (id, cb) {
    const panel = document.getElementById(id);
    if (panel) panel.classList.toggle("open", cb.checked);
  };

  function calcularDuracionDias() {
    const fi = document.getElementById("fechaInicio");
    const ff = document.getElementById("fechaFin");
    const dc = document.getElementById("duracionDiasContainer");
    if (!fi || !ff || !dc || !fi.value || !ff.value) return;
    const inicio = new Date(fi.value),
      fin = new Date(ff.value);
    if (fin >= inicio) {
      const dias = Math.ceil(Math.abs(fin - inicio) / 86400000) + 1;
      const monedas = dias * _precios.publicacion_24h;
      dc.innerHTML = `<div style="background:var(--bg-input);padding:12px 16px;border-radius:14px;margin-top:12px;border-left:3px solid var(--primary)"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><div><span style="font-size:13px;color:var(--text-light)">📅 Duración:</span><span style="font-weight:600;color:var(--primary);margin-left:6px">${dias} días</span></div><div><span style="font-size:13px;color:var(--text-light)">💰 Inversión:</span><span style="font-weight:700;color:var(--green);margin-left:6px">${monedas} monedas</span></div></div><div style="font-size:11px;color:var(--text-light);margin-top:6px">⚡ Costo por día: ${_precios.publicacion_24h} monedas</div></div>`;
    } else {
      dc.innerHTML = `<div style="background:rgba(239,68,68,.1);padding:10px 16px;border-radius:14px;margin-top:12px;border-left:3px solid #ef4444"><span style="font-size:13px;color:#ef4444">⚠️ La fecha final debe ser mayor o igual a la inicial</span></div>`;
    }
    actualizarCostoPublicar();
  }

  function calcularDuracionHoras() {
    const ih = document.getElementById("inputHoras");
    const dc = document.getElementById("duracionHorasContainer");
    if (!ih || !dc) return;
    let h = parseInt(ih.value);
    if (isNaN(h) || h < 1) h = 1;
    if (h > 20) h = 20;
    const monedas = h * _precios.publicacion_x_hora;
    dc.innerHTML = `<div style="background:var(--bg-input);padding:12px 16px;border-radius:14px;margin-top:12px;border-left:3px solid var(--primary)"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><div><span style="font-size:13px;color:var(--text-light)">⏱️ Duración:</span><span style="font-weight:600;color:var(--primary);margin-left:6px">${h} ${h === 1 ? "hora" : "horas"}</span></div><div><span style="font-size:13px;color:var(--text-light)">💰 Inversión:</span><span style="font-weight:700;color:var(--green);margin-left:6px">${monedas} monedas</span></div></div><div style="font-size:11px;color:var(--text-light);margin-top:6px">⚡ Costo por hora: ${_precios.publicacion_x_hora} monedas</div></div>`;
    actualizarCostoPublicar();
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
      if (dH) dH.style.display = "block";
      if (dD) dD.style.display = "none";
      calcularDuracionHoras();
    } else {
      if (bH) bH.style.display = "none";
      if (bF) bF.style.display = "block";
      if (dH) dH.style.display = "none";
      if (dD) dD.style.display = "block";
      calcularDuracionDias();
    }
  };

  (function initDates() {
    const hoy = new Date();
    const str = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    const fi = document.getElementById("fechaInicio");
    const ff = document.getElementById("fechaFin");
    if (fi) {
      fi.value = str;
      fi.setAttribute("min", str);
    }
    if (ff) {
      ff.setAttribute("min", str);
      ff.addEventListener("change", () => {
        if (ff.value && ff.value < fi.value) {
          mostrarToast("La fecha final no puede ser menor", "error");
          ff.value = fi.value;
        }
      });
    }
  })();

  /* ══════════════════════════════════════════
       PUBLICAR PROMOCIÓN — FLUJO COMPLETO
    ══════════════════════════════════════════ */
  async function publicarPromocion() {
    const btn = document.querySelector(".btn-submit");
    const titulo = tituloInput.value.trim();
    const descripcion = descripcionInput.value.trim();

    if (!titulo || !descripcion) {
      mostrarToast("Completa título y descripción", "error");
      return;
    }
    if (!datosTienda) {
      mostrarToast("Cargando datos de tienda...", "error");
      return;
    }
    if (!imagesData.some((img) => img !== null)) {
      mostrarToast("Selecciona al menos una imagen", "error");
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
    const horasInput = parseInt(
      document.getElementById("inputHoras")?.value || "1",
    );

    if (tipoPlazoVal === "dias") {
      if (!fechaInicio || !fechaFin) {
        mostrarToast("Selecciona fecha final", "error");
        return;
      }
      if (new Date(fechaFin) < new Date(fechaInicio)) {
        mostrarToast("La fecha final no puede ser menor a la inicial", "error");
        return;
      }
    } else if (tipoPlazoVal === "horas") {
      if (!horasInput || horasInput < 1 || horasInput > 20) {
        mostrarToast("Ingresa una cantidad de horas válida (1–20)", "error");
        return;
      }
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

    if (tipoPlazoVal === "dias" && fechaInicio && fechaFin) {
      tsInicio = {
        seconds: Math.floor(new Date(fechaInicio).getTime() / 1000),
        nanoseconds: 0,
      };
      tsFin = {
        seconds: Math.floor(new Date(fechaFin).getTime() / 1000),
        nanoseconds: 0,
      };
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
      skSetStep(1, "Analizando con IA...", "Generando términos clave", 30);
      let terminosClave = [];
      try {
        const resTerminos = await callFirebaseFunction(
          "https://extraerterminosclaveia-oixttik5rq-uc.a.run.app",
          { textoUsuario: `${titulo} ${descripcion}`, categoria },
        );
        if (resTerminos?.ok && Array.isArray(resTerminos.terminos))
          terminosClave = resTerminos.terminos;
      } catch (e) {
        console.warn("Términos clave fallaron, continuando...", e);
      }

      skSetStep(2, "Subiendo imágenes...", "Procesando tus fotos", 55);
      const { urls, botUrl } = await subirImagenesAStorage(
        id_tienda,
        id_promocion,
      );

      skSetStep(2, "Guardando imágenes...", "Registrando en base de datos", 70);
      const imgContainer = await guardarImagenesEnFirestore(
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
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
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
        terminos_clave_ia: terminosClave,
        urls_imagenes: urls,
        img_bot: botUrl || urls[0] || "",
        logo_url,
        direccion,
        lat,
        long: lng,
        referencia,
      };

      console.log("📤 PAYLOAD:", payload);
      const result = await callFirebaseFunction(CLOUD_FN_CREAR_PROMO, payload);
      console.log("✅ RESULTADO:", result);

      ocultarSkeleton();
      limpiarFormulario();
      mostrarModalExito(id_promocion, localidad);
    } catch (err) {
      console.error("❌ ERROR:", err);
      ocultarSkeleton();
      mostrarToast(err.message || "Error al publicar", "error");
    } finally {
      btn.disabled = false;
      // Restaurar botón con precio actualizado
      actualizarCostoPublicar();
    }
  }

  /* ══════════════════════════════════════════
       SKELETON
    ══════════════════════════════════════════ */
  function mostrarSkeletonPublicando() {
    const sk = document.createElement("div");
    sk.id = "skeletonPublicando";
    sk.className = "sk-overlay";
    sk.innerHTML = `
  <div class="sk-modal">
    <div class="sk-badge">GEINZ</div>
    <div class="sk-ring">
      <svg viewBox="0 0 56 56" width="56" height="56">
        <defs>
          <linearGradient id="skRingGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#6d28d9"/>
            <stop offset="100%" stop-color="#a855f7"/>
          </linearGradient>
        </defs>
        <circle class="sk-ring-bg" cx="28" cy="28" r="22"/>
        <circle class="sk-ring-fill" cx="28" cy="28" r="22"/>
      </svg>
    </div>
    <div class="sk-titles">
      <p class="sk-title" id="skTitle">Publicando tu promocion...</p>
      <p class="sk-subtitle" id="skSubtitle">Esto solo tarda unos segundos</p>
    </div>
    <div class="sk-bar-wrap"><div class="sk-bar" id="skBar" style="width:15%"></div></div>
    <div class="sk-steps" id="skSteps">
      <div class="sk-step done" id="sk-step1">
        <div class="sk-step-icon"><i class="ti ti-check"></i></div>
        <div class="sk-step-text"><div class="sk-step-label">Validando datos</div><div class="sk-step-status" id="sk-status1">Completado</div></div>
      </div>
      <div class="sk-step active" id="sk-step2">
        <div class="sk-step-icon"><i class="ti ti-cpu"></i></div>
        <div class="sk-step-text"><div class="sk-step-label">Analizando con IA</div><div class="sk-step-status" id="sk-status2">En progreso...</div></div>
      </div>
      <div class="sk-step pending" id="sk-step3">
        <div class="sk-step-icon"><i class="ti ti-photo"></i></div>
        <div class="sk-step-text"><div class="sk-step-label">Subiendo imagenes</div><div class="sk-step-status" id="sk-status3">Pendiente</div></div>
      </div>
      <div class="sk-step pending" id="sk-step4">
        <div class="sk-step-icon"><i class="ti ti-world"></i></div>
        <div class="sk-step-text"><div class="sk-step-label">Publicando en Geinz</div><div class="sk-step-status" id="sk-status4">Pendiente</div></div>
      </div>
    </div>
  </div>`;
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
    const url = `https://geinzworkapp.web.app/share?t=prms&l=${l}&pi=${id_promocion}`;
    const urlCorta = url.length > 52 ? url.slice(0, 52) + "..." : url;

    const modal = document.createElement("div");
    modal.id = "modalExitoPromo";
    modal.className = "sk-overlay";
    modal.innerHTML = `
  <div class="sk-modal sk-modal-success">
    <div class="sk-check-wrap"><i class="ti ti-check"></i></div>
    <div class="sk-titles">
      <p class="sk-title">Publicacion exitosa</p>
      <p class="sk-subtitle">Tu promocion ya esta visible en Geinz para todos los usuarios de ${localidad || "tu ciudad"}.</p>
    </div>
    <div class="sk-url-box">
      <i class="ti ti-link" style="font-size:14px;color:#52525b;flex-shrink:0"></i>
      <span class="sk-url-text" title="${url}">${urlCorta}</span>
      <button class="sk-copy-btn" id="btnCopyUrl"><i class="ti ti-copy" style="font-size:13px"></i> Copiar</button>
    </div>
    <div class="sk-share-row">
      <button class="sk-share-btn sk-share-wp" id="btnShareWp"><i class="ti ti-brand-whatsapp" style="font-size:15px"></i> WhatsApp</button>
      <button class="sk-share-btn" id="btnShareNative"><i class="ti ti-share" style="font-size:15px"></i> Compartir</button>
      <button class="sk-share-btn" id="btnVerPromo"><i class="ti ti-external-link" style="font-size:15px"></i> Ver</button>
    </div>
    <button class="sk-close-btn" id="btnCerrarExito">Listo</button>
  </div>`;
    document.body.appendChild(modal);

    document.getElementById("btnCopyUrl").addEventListener("click", () => {
      navigator.clipboard.writeText(url).then(() => {
        const b = document.getElementById("btnCopyUrl");
        if (b) {
          b.innerHTML =
            '<i class="ti ti-check" style="font-size:13px"></i> Copiado';
        }
        setTimeout(() => {
          const b2 = document.getElementById("btnCopyUrl");
          if (b2)
            b2.innerHTML =
              '<i class="ti ti-copy" style="font-size:13px"></i> Copiar';
        }, 2000);
      });
    });
    document.getElementById("btnShareWp").addEventListener("click", () => {
      window.open(
        `https://wa.me/?text=${encodeURIComponent("Mira esta promo en Geinz: " + url)}`,
        "_blank",
      );
    });
    document.getElementById("btnShareNative").addEventListener("click", () => {
      if (navigator.share) {
        navigator.share({ title: "Promo en Geinz", url });
      } else {
        navigator.clipboard.writeText(url);
        mostrarToast("Enlace copiado al portapapeles");
      }
    });
    document.getElementById("btnVerPromo").addEventListener("click", () => {
      window.open(url, "_blank");
    });
    document.getElementById("btnCerrarExito").addEventListener("click", () => {
      modal.remove();
    });
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
    const hoy = new Date();
    const str = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    document.getElementById("fechaInicio").value = str;
    document.getElementById("fechaFin").value = "";
    document.getElementById("duracionDiasContainer").innerHTML = "";
    document.querySelector('input[name="plazo"][value="dias"]').checked = true;
    tipoPlazo();
    precioYaSeteado = false;
    validate();
  }

  /* ══════════════════════════════════════════
       EVENTOS
    ══════════════════════════════════════════ */
  tituloInput?.addEventListener("input", validate);
  descripcionInput?.addEventListener("input", validate);
  mensajeWpInput?.addEventListener("input", validate);
  btnDescripcionIA?.addEventListener("click", mejorarTextoIA);
  btnMensajeWpIA?.addEventListener("click", generarMensajeWhatsappIA);
  btnMensajeShareIA?.addEventListener("click", generarMensajeCompartirIA);
  btnImagenIA?.addEventListener("click", generarImagenTextoIA);

  document.getElementById("inputHoras")?.addEventListener("input", function () {
    let v = parseInt(this.value);
    if (isNaN(v) || v < 1) this.value = 1;
    if (v > 20) this.value = 20;
    calcularDuracionHoras();
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

  // Aplicar precios iniciales con los valores por defecto
  aplicarPreciosEnDOM();
  validate();
  tipoPlazo();
})();

/* ══════════════════════════════════════════
     MENSAJES DESDE EL FRAME PADRE
   ══════════════════════════════════════════ */
window.addEventListener("message", (event) => {
  // ─────────────────────────────────────────
  // SALDO / CRÉDITOS
  // ─────────────────────────────────────────
  if (event.data?.type === "DATOS_TIENDA") {
    const d = event.data.payload;
    datosTienda = {
      id_tienda: d.id_tienda,
      localidad: d.localidad,
      nombre_tienda: d.nombre_tienda,
      categoria_tienda: d.categoria_tienda,
      img_tienda: { logo_tienda: d.logo_tienda },
      // El padre manda estos en el payload completo:
      metodo_contacto: d.metodo_contacto,
      metodos_pago: d.metodos_pago,
      ubicacion: d.ubicacion,
      saldo_tienda: d.saldo_tienda
    };
    _aplicarDatosTienda(datosTienda);
  }
  if (event.data?.type === "PATCH_TIENDA") {
    if (!datosTienda) return;

    // Merge profundo — maneja claves con puntos como "metodo_contacto.whatsapp.numero"
    const diff = event.data.payload;
    for (const key of Object.keys(diff)) {
      const parts = key.split(".");
      if (parts.length === 1) {
        datosTienda[key] = diff[key];
      } else {
        // Navegar y setear en el objeto anidado
        let obj = datosTienda;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!obj[parts[i]]) obj[parts[i]] = {};
          obj = obj[parts[i]];
        }
        obj[parts[parts.length - 1]] = diff[key];
      }
    }

    _aplicarDatosTienda(datosTienda);
  }


  // ─────────────────────────────────────────
  // PUBLICIDAD UPDATE
  // ─────────────────────────────────────────
  if (event.data?.type === "PUBLICIDAD_UPDATE") {
    const pub = event.data.publicidad || {};

    console.log("📩 [PUBLICIDAD_UPDATE]:", pub);

    if (typeof _aplicarPublicidad === "function") {
      _aplicarPublicidad(pub);
    }
  }

  // ─────────────────────────────────────────
  // PLANES UPDATE
  // ─────────────────────────────────────────
  if (event.data?.type === "PLANES_UPDATE") {
    const pub = event.data.publicidad || {};

    console.log("📩 [PLANES_UPDATE]:", pub);

    if (typeof _aplicarPublicidad === "function") {
      _aplicarPublicidad(pub);
    }
  }
});
function _aplicarDatosTienda(d) {
  if (!d) return;
  console.log("saldoteindasdasdasdas", d.saldo_tienda);
  // WhatsApp
  const numeroWp = d.metodo_contacto?.whatsapp?.numero || "";
  const wpInput = document.querySelector('#wp input[type="text"]');
  if (wpInput && numeroWp) wpInput.value = numeroWp;
  const saldo = d.saldo_tienda || 0;

  document.getElementById("creditos_value").textContent =
    `${Number(saldo).toLocaleString("en-US")} Creditos  `;
  // Dirección y referencia
  const geoInputs = document.querySelectorAll('#geo input[type="text"]');
  if (geoInputs[0]) geoInputs[0].value = d.ubicacion?.dirección || "";
  if (geoInputs[1]) geoInputs[1].value = d.ubicacion?.referencia || "";

  // Métodos de pago
  const mp = d.metodos_pago || {};
  const pagosChecks = document.querySelectorAll('#payments .pay-item input[type="checkbox"]');
  if (pagosChecks[0]) pagosChecks[0].checked = mp.yape?.enable ?? false;
  if (pagosChecks[1]) pagosChecks[1].checked = mp.plin?.enable ?? false;
  if (pagosChecks[2]) pagosChecks[2].checked = mp.agora?.enable ?? false;
  if (pagosChecks[3]) pagosChecks[3].checked = mp.efectivo?.enable ?? false;
  if (pagosChecks[4]) pagosChecks[4].checked = mp.visa_mastercard?.enable ?? false;
  if (pagosChecks[5]) pagosChecks[5].checked = mp.visa_mastercard?.enable ?? false;
}
// ── Función compartida: aplica publicidad al _precios y al DOM ──
function _aplicarPublicidad(pub) {
  // Claves EXACTAS como vienen de Firestore (sin sufijo numérico)
  if (pub.ia_imagen_texto != null)
    _precios.ia_imagen_texto = pub.ia_imagen_texto;
  if (pub.mejora_texto_x3 != null)
    _precios.mejora_texto_x3 = pub.mejora_texto_x3;
  if (pub.mensaje_w_c != null) _precios.mensaje_w_c = pub.mensaje_w_c;
  if (pub.publicacion_24h != null)
    _precios.publicacion_24h = pub.publicacion_24h;
  if (pub.publicacion_por_hora != null)
    _precios.publicacion_x_hora = pub.publicacion_por_hora;
  // ceo_descripcion también mapea a mejora_texto_x3 si existe
  if (pub.ceo_descripcion != null)
    _precios.mejora_texto_x3 = pub.ceo_descripcion;

  console.log("✅ _precios actualizados:", JSON.stringify(_precios));
  aplicarPreciosEnDOM();
}
