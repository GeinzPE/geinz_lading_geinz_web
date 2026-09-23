import { tiendaSubDoc } from "../rutas/rutas.js";
import {
  getFirestore, updateDoc, getDoc, deleteField,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

const firebaseConfig = {
  apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
  authDomain: "geinzworkapp.firebaseapp.com",
  projectId: "geinzworkapp",
  storageBucket: "geinzworkapp.appspot.com",
  messagingSenderId: "921389328767",
  appId: "1:921389328767:web:dc6fffc43a51444f5b524a",
};

const app = getApps().find(a => a.name === "[DEFAULT]") || initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

let TIENDA_ID = null, LOCALIDAD = null, TIENDA_REF = null;

// ── Recibe datos del panel padre ──
window.addEventListener("message", (e) => {
  if (e.origin !== window.location.origin) return;
  if (e.data?.type === "DATOS_TIENDA") {
    TIENDA_ID = e.data.id;
    LOCALIDAD = e.data.localidad;
    TIENDA_REF = tiendaSubDoc(LOCALIDAD, "tiendas", TIENDA_ID);
    cargarBanner();
    cargarOfertas();
  }
  if (e.data?.type === "PATCH_TIENDA") {
    const diff = e.data.payload;
    if ("banner.activo" in diff || "banner.imagen" in diff) cargarBanner();
    Object.keys(diff).some(k => k.startsWith("img_tienda.lista_img.promociones")) && cargarOfertas();
  }
});

function comprimirImagen(dataURL, maxPx, calidad) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxPx || h > maxPx) {
        if (w >= h) { h = Math.round((h * maxPx) / w); w = maxPx; }
        else { w = Math.round((w * maxPx) / h); h = maxPx; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/webp", calidad));
    };
    img.onerror = () => reject(new Error("No se pudo leer imagen"));
    img.src = dataURL;
  });
}

function dataURLtoBlob(dataURL) {
  const [header, data] = dataURL.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const raw = atob(data);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ══════════════ BANNER ══════════════
const bDesc = document.getElementById("bannerDescripcion");
const bPrecio = document.getElementById("bannerPrecio");
const bPriceBox = document.getElementById("bannerPriceBox");
const bClick = document.getElementById("bannerClickeableSwitch");
const bTagDesc = document.getElementById("bannerTagDesc");
const bTagPrecio = document.getElementById("bannerTagPrecio");
const bMsg = document.getElementById("bannerMsg");
const bBtnGuardar = document.getElementById("btnGuardarBanner");
const bTipoRow = document.getElementById("bannerTipoRow");
const bCampoPrecio = document.getElementById("bannerCampoPrecio");
const bCampoDescuento = document.getElementById("bannerCampoDescuento");
const bDescuentoValor = document.getElementById("bannerDescuentoValor");
const bDescuentoUnidad = document.getElementById("bannerDescuentoUnidad");
const bClickSub = document.getElementById("bannerClickSub");
const bSoloSeguidores = document.getElementById("bannerSoloSeguidoresSwitch");
const bUnaVez = document.getElementById("bannerUnaVezSwitch");
const bSoloSeguidoresRow = document.getElementById("bannerSoloSeguidoresRow");
const bUnaVezRow = document.getElementById("bannerUnaVezRow");

const BANNER_CLICK_SUB = {
  producto: "Si lo activas, al tocar el banner se abrirá el carrito con este producto. La descripción y el precio serán obligatorios.",
  descuento: "Si lo activas, al tocar el banner se abrirá el carrito con este descuento ya aplicado. La descripción y el valor del descuento serán obligatorios.",
  envio_gratis: "Si lo activas, al tocar el banner se abrirá el carrito con el envío gratis ya aplicado. La descripción será obligatoria.",
};

function pintarTipoBanner() {
  bTipoRow?.querySelectorAll(".bn-tipo-chip").forEach((c) => {
    c.classList.toggle("active", c.dataset.tipo === bannerTipoActual);
  });
  if (bCampoPrecio) bCampoPrecio.style.display = bannerTipoActual === "producto" ? "" : "none";
  if (bCampoDescuento) bCampoDescuento.classList.toggle("show", bannerTipoActual === "descuento");
  if (bClickSub) bClickSub.textContent = BANNER_CLICK_SUB[bannerTipoActual] || BANNER_CLICK_SUB.producto;
  validarBanner();
}

bTipoRow?.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-tipo]");
  if (!chip) return;
  bannerTipoActual = chip.dataset.tipo;
  pintarTipoBanner();
});

document.querySelectorAll('#bannerCampoDescuento [data-descuento-tipo]').forEach((chip) => {
  chip.addEventListener("click", () => {
    bannerDescuentoTipoActual = chip.dataset.descuentoTipo;
    document.querySelectorAll('#bannerCampoDescuento [data-descuento-tipo]').forEach((c) =>
      c.classList.toggle("active", c === chip),
    );
    if (bDescuentoUnidad) bDescuentoUnidad.textContent = bannerDescuentoTipoActual === "porcentaje" ? "%" : "S/";
    validarBanner();
  });
});

function bannerLeerDescuento() {
  const n = parseFloat(String(bDescuentoValor?.value || "").replace(",", "."));
  return n > 0 ? n : null;
}
let bannerGuardado = {
  descripcion: "", precio: null, clickeable: false,
  tipo: "producto", descuentoTipo: "porcentaje", descuentoValor: null,
  soloSeguidores: false, unaVezPorCliente: false,
};
let bannerTipoActual = "producto";
let bannerDescuentoTipoActual = "porcentaje";
const bannerLeerPrecio = () => {
  const n = parseFloat(String(bPrecio.value).replace(",", "."));
  return n > 0 ? n : null;
};

const bannerSetMsg = (texto, tipo = "") => {
  bMsg.textContent = texto;
  bMsg.className = "of-msg" + (tipo ? " " + tipo : "");
};

const bannerHayCambios = () =>
  bDesc.value.trim() !== (bannerGuardado.descripcion || "").trim() ||
  (bannerLeerPrecio() || 0) !== (bannerGuardado.precio || 0) ||
  bClick.checked !== bannerGuardado.clickeable ||
  bannerTipoActual !== (bannerGuardado.tipo || "producto") ||
  bannerDescuentoTipoActual !== (bannerGuardado.descuentoTipo || "porcentaje") ||
  (bannerLeerDescuento() || 0) !== (bannerGuardado.descuentoValor || 0) ||
  !!bSoloSeguidores?.checked !== !!bannerGuardado.soloSeguidores ||
  !!bUnaVez?.checked !== !!bannerGuardado.unaVezPorCliente;
// Si es clickeable → descripción y precio obligatorios. Si no → opcionales.
function validarBanner() {
  const obligatorio = bClick.checked;
  const esProducto = bannerTipoActual === "producto";
  const esDescuento = bannerTipoActual === "descuento";

  const faltaDesc = obligatorio && !bDesc.value.trim();
  const faltaPrecio = obligatorio && esProducto && !bannerLeerPrecio();
  const faltaDescuento = obligatorio && esDescuento && !bannerLeerDescuento();

  bTagDesc.textContent = obligatorio ? "obligatoria" : "opcional";
  bTagDesc.classList.toggle("req", obligatorio);
  bDesc.classList.toggle("error", faltaDesc);

  if (esProducto) {
    bTagPrecio.textContent = obligatorio ? "obligatorio" : "opcional";
    bTagPrecio.classList.toggle("req", obligatorio);
    bPriceBox.classList.toggle("error", faltaPrecio);
  } else {
    bPriceBox.classList.remove("error");
  }

  document.getElementById("bannerDescuentoBox")?.classList.toggle("error", faltaDescuento);

  if (bSoloSeguidoresRow) bSoloSeguidoresRow.style.display = obligatorio ? "" : "none";
  if (bUnaVezRow) bUnaVezRow.style.display = obligatorio ? "" : "none";

  bBtnGuardar.disabled = faltaDesc || faltaPrecio || faltaDescuento;

  if (faltaDesc || faltaPrecio || faltaDescuento) {
    const faltan = [
      faltaDesc && "descripción",
      faltaPrecio && "precio",
      faltaDescuento && "valor del descuento",
    ].filter(Boolean).join(" y ");
    bannerSetMsg(`Falta ${faltan} para que el banner sea clickeable`, "error");
  } else if (bMsg.classList.contains("error")) {
    bannerSetMsg("");
  }
}

bDesc?.addEventListener("input", validarBanner);
bPrecio?.addEventListener("input", validarBanner);
bClick?.addEventListener("change", validarBanner);
bDescuentoValor?.addEventListener("input", validarBanner);
async function cargarBanner() {
  const snap = await getDoc(TIENDA_REF);
  const banner = snap.data()?.banner || {};
  const img = document.getElementById("bannerImgPreview");
  const ph = document.getElementById("bannerPlaceholder");
  const sw = document.getElementById("bannerActivoSwitch");

  if (banner.imagen) {
    img.src = banner.imagen;
    img.style.display = "block";
    ph.style.display = "none";
  } else {
    img.style.display = "none";
    ph.style.display = "flex";
  }
  sw.checked = banner.activo === true;

  bannerGuardado = {
    descripcion: banner.descripcion || "",
    precio: Number(banner.precio) > 0 ? Number(banner.precio) : null,
    clickeable: banner.clickeable === true,
    tipo: banner.tipo || "producto",
    descuentoTipo: banner.descuentoTipo || "porcentaje",
    descuentoValor: Number(banner.descuentoValor) > 0 ? Number(banner.descuentoValor) : null,
    soloSeguidores: banner.soloSeguidores === true,
    unaVezPorCliente: banner.unaVezPorCliente === true,
  };
  bDesc.value = bannerGuardado.descripcion;
  bPrecio.value = bannerGuardado.precio ?? "";
  bClick.checked = bannerGuardado.clickeable;
  bannerTipoActual = bannerGuardado.tipo;
  bannerDescuentoTipoActual = bannerGuardado.descuentoTipo;
  if (bDescuentoValor) bDescuentoValor.value = bannerGuardado.descuentoValor ?? "";
  if (bDescuentoUnidad) bDescuentoUnidad.textContent = bannerDescuentoTipoActual === "porcentaje" ? "%" : "S/";
  document.querySelectorAll('#bannerCampoDescuento [data-descuento-tipo]').forEach((c) =>
    c.classList.toggle("active", c.dataset.descuentoTipo === bannerDescuentoTipoActual),
  );
  if (bSoloSeguidores) bSoloSeguidores.checked = bannerGuardado.soloSeguidores;
  if (bUnaVez) bUnaVez.checked = bannerGuardado.unaVezPorCliente;
  pintarTipoBanner();
}

bBtnGuardar?.addEventListener("click", async () => {
  const descripcion = bDesc.value.trim();
  const precio = bannerLeerPrecio();
  const descuentoValor = bannerLeerDescuento();
  const clickeable = bClick.checked;
  const tipo = bannerTipoActual;
  const soloSeguidores = !!bSoloSeguidores?.checked;
  const unaVezPorCliente = !!bUnaVez?.checked;

  if (clickeable) {
    if (!descripcion) { validarBanner(); return; }
    if (tipo === "producto" && !precio) { validarBanner(); return; }
    if (tipo === "descuento" && !descuentoValor) { validarBanner(); return; }
  }

  if (!bannerHayCambios()) {
    bannerSetMsg("Sin cambios");
    setTimeout(() => { if (bMsg.textContent === "Sin cambios") bannerSetMsg(""); }, 1500);
    return;
  }

  bBtnGuardar.disabled = true;
  bBtnGuardar.textContent = "Guardando...";
  try {
    await updateDoc(TIENDA_REF, {
      "banner.descripcion": descripcion || deleteField(),
      "banner.precio": tipo === "producto" && precio ? precio : deleteField(),
      "banner.clickeable": clickeable,
      "banner.tipo": tipo,
      "banner.descuentoTipo": tipo === "descuento" ? bannerDescuentoTipoActual : deleteField(),
      "banner.descuentoValor": tipo === "descuento" && descuentoValor ? descuentoValor : deleteField(),
      "banner.soloSeguidores": soloSeguidores,
      "banner.unaVezPorCliente": unaVezPorCliente,
    });
    bannerGuardado = {
      descripcion, precio: tipo === "producto" ? precio : null, clickeable,
      tipo, descuentoTipo: bannerDescuentoTipoActual,
      descuentoValor: tipo === "descuento" ? descuentoValor : null,
      soloSeguidores, unaVezPorCliente,
    };
    bannerSetMsg("Cambios guardados", "ok");
    setTimeout(() => { if (bMsg.classList.contains("ok")) bannerSetMsg(""); }, 1500);
    mostrarToast("Banner actualizado correctamente");
  } catch (err) {
    console.error(err);
    bannerSetMsg("Error al guardar, intenta otra vez", "error");
  } finally {
    bBtnGuardar.textContent = "Guardar detalles del banner";
    validarBanner();
  }
});

document.getElementById("bannerActivoSwitch")?.addEventListener("change", async (e) => {
  await updateDoc(TIENDA_REF, { "banner.activo": e.target.checked });
});

document.getElementById("btnCambiarBanner")?.addEventListener("click", () => {
  document.getElementById("bannerFileInput").click();
});

document.getElementById("bannerFileInput")?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = "";
  if (!confirm("¿Actualizar el banner?")) return;

  // Overlay de carga sobre el banner
  const wrap = document.getElementById("bannerPreviewWrap");
  const ov = document.createElement("div");
  ov.className = "of-img-loading";
  ov.innerHTML = `<div class="of-spinner"></div><span>Subiendo imagen...</span>`;
  wrap.appendChild(ov);

  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const comprimida = await comprimirImagen(ev.target.result, 1280, 0.85);
      const blob = dataURLtoBlob(comprimida);
      const ref = storageRef(storage, `tiendas/${TIENDA_ID}/banner/banner.webp`);
      await uploadBytes(ref, blob, { contentType: "image/webp" });
      const url = await getDownloadURL(ref);
      await updateDoc(TIENDA_REF, { "banner.imagen": url, "banner.activo": true });
      mostrarToast("La imagen se subió correctamente");
      await cargarBanner();
    } catch (err) {
      console.error(err);
      alert("Error al subir el banner");
    } finally {
      ov.remove();
    }
  };
  reader.onerror = () => { ov.remove(); alert("No se pudo leer la imagen"); };
  reader.readAsDataURL(file);
});
// ══════════════ OFERTAS (antes "promociones") ══════════════
async function cargarOfertas() {
  const grid = document.getElementById("ofertasGrid");
  if (!grid) { console.warn("[ofertas] no existe #ofertasGrid en el HTML"); return; }
  console.log("[ofertas] leyendo…", TIENDA_REF?.path);
  try {
    const snap = await getDoc(TIENDA_REF);
    const map = snap.data()?.img_tienda?.lista_img?.promociones || {};
    console.log("[ofertas] encontradas:", Object.keys(map).length);
    renderOfertas(map);
  } catch (err) {
    console.error("[ofertas] falló getDoc:", err.code, err.message);
    grid.innerHTML = `<p class="of-msg error">No se pudieron cargar las ofertas. <button type="button" id="ofReintentar">Reintentar</button></p>`;
    document.getElementById("ofReintentar").onclick = cargarOfertas;
  }
}
let ofertasCache = {};
const MAX_OFERTAS = 5;
let subiendoOferta = false;

function mostrarToast(texto) {
  let wrap = document.getElementById("ofToastWrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "ofToastWrap";
    wrap.className = "of-toast-wrap";
    document.body.appendChild(wrap);
  }
  const t = document.createElement("div");
  t.className = "of-toast";
  t.innerHTML = `<span class="of-toast-ico">✓</span><span></span>`;
  t.lastElementChild.textContent = texto;
  wrap.appendChild(t);
  setTimeout(() => {
    t.classList.add("out");
    setTimeout(() => t.remove(), 260);
  }, 2600);
}

// Muestra el esqueleto mientras sube la imagen. Devuelve una función para quitarlo.
function mostrarSkeletonOferta(oldKey) {
  const grid = document.getElementById("ofertasGrid");
  if (!grid) return () => {};

  // Reemplazo de imagen: overlay sobre la tarjeta existente
  if (oldKey) {
    const wrap = grid.querySelector(`.of-card[data-key="${oldKey}"] .of-img`);
    if (!wrap) return () => {};
    const ov = document.createElement("div");
    ov.className = "of-img-loading";
    ov.innerHTML = `<div class="of-spinner"></div><span>Subiendo imagen...</span>`;
    wrap.appendChild(ov);
    return () => ov.remove();
  }

  // Oferta nueva: tarjeta esqueleto (oculta el botón "Agregar" mientras tanto)
  const add = grid.querySelector(".of-add");
  if (add) add.style.display = "none";

  const skel = document.createElement("div");
  skel.className = "of-card";
  skel.innerHTML = `
    <div class="of-img of-skel-shine" style="cursor:default;">
      <div class="of-img-loading" style="background:rgba(5,5,8,.45);backdrop-filter:none;">
        <div class="of-spinner"></div><span>Subiendo imagen...</span>
      </div>
    </div>
    <div class="of-body">
      <div class="of-skel-line"></div>
      <div class="of-skel-line short"></div>
      <div class="of-skel-line short"></div>
    </div>
  `;
  grid.appendChild(skel);

  return () => {
    skel.remove();
    if (add) add.style.display = "";
  };
}
function normalizarOferta(val) {
  if (typeof val === "string") return { imagen: val, descripcion: "" }; // formato viejo
  if (val && typeof val === "object") return val;
  return { imagen: "", descripcion: "" };
}

// Guarda el objeto completo de la oferta (también convierte el formato viejo)
async function guardarOferta(key, cambios) {
  const actual = normalizarOferta(ofertasCache[key]);
  const nuevo = { imagen: actual.imagen, descripcion: actual.descripcion || "", ...cambios };
  if (actual.precio && !("precio" in cambios)) nuevo.precio = actual.precio;

  if (!String(nuevo.descripcion || "").trim()) throw new Error("DESCRIPCION_REQUERIDA");
  if (!(Number(nuevo.precio) > 0)) throw new Error("PRECIO_REQUERIDO");

  ofertasCache[key] = nuevo;
  await updateDoc(TIENDA_REF, {
    [`img_tienda.lista_img.promociones.${key}`]: nuevo,
  });
}
function renderOfertas(map) {
  const grid = document.getElementById("ofertasGrid");
  if (!grid) return;
  grid.innerHTML = "";
  ofertasCache = map;

  const entries = Object.entries(map);

  entries.forEach(([key, val]) => {
    const item = normalizarOferta(val);

    const card = document.createElement("div");
    card.className = "of-card";
    card.dataset.key = key;
    card.innerHTML = `
      <div class="of-img" data-role="img-wrap">
        <img src="${item.imagen}" alt="">
        <button type="button" class="of-del" data-role="del" title="Eliminar oferta">✕</button>
        <div class="of-img-hint">Cambiar imagen</div>
      </div>
      <div class="of-body">
        <textarea class="of-desc" data-role="desc" rows="2" maxlength="80" placeholder="Descripción corta (obligatoria)"></textarea>
        <div class="of-price" data-role="price-box">
          <span>S/</span>
          <input data-role="precio" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Precio (obligatorio)">
        </div>
        <p class="of-msg" data-role="msg"></p>
        <button type="button" class="of-save" data-role="save" disabled>Guardar</button>
      </div>
    `;

    const desc = card.querySelector('[data-role="desc"]');
    const precio = card.querySelector('[data-role="precio"]');
    const priceBox = card.querySelector('[data-role="price-box"]');
    const msg = card.querySelector('[data-role="msg"]');
    const btn = card.querySelector('[data-role="save"]');

    desc.value = item.descripcion || "";
    precio.value = Number(item.precio) > 0 ? item.precio : "";

    const leerPrecio = () => {
      const n = parseFloat(String(precio.value).replace(",", "."));
      return n > 0 ? n : null;
    };

    const setMsg = (texto, tipo = "") => {
      msg.textContent = texto;
      msg.className = "of-msg" + (tipo ? " " + tipo : "");
    };

    const hayCambios = () => {
      const guardado = normalizarOferta(ofertasCache[key]);
      const cambioDesc = desc.value.trim() !== (guardado.descripcion || "").trim();
      const cambioPrecio = (leerPrecio() || 0) !== (Number(guardado.precio) || 0);
      return cambioDesc || cambioPrecio;
    };

    // Bloquea el botón si falta descripción o precio
    const pintarEstado = () => {
      const faltan = [];
      if (!desc.value.trim()) faltan.push("descripción");
      if (!leerPrecio()) faltan.push("precio");

      desc.classList.toggle("error", faltan.includes("descripción"));
      priceBox.classList.toggle("error", faltan.includes("precio"));
      card.classList.toggle("falta-precio", faltan.length > 0);
      btn.disabled = faltan.length > 0;
      card.classList.toggle("dirty", faltan.length === 0 && hayCambios());

      if (faltan.length) setMsg("Falta " + faltan.join(" y "), "error");
      else if (msg.classList.contains("error")) setMsg("");
    };

    pintarEstado();
    desc.addEventListener("input", pintarEstado);
    precio.addEventListener("input", pintarEstado);

    btn.addEventListener("click", async () => {
      // Si no cambió nada, no se guarda
      if (!hayCambios()) {
        setMsg("Sin cambios");
        setTimeout(() => { if (msg.textContent === "Sin cambios") setMsg(""); }, 1500);
        return;
      }

      btn.disabled = true;
      btn.textContent = "Guardando...";
      try {
        await guardarOferta(key, {
          descripcion: desc.value.trim(),
          precio: leerPrecio(),
        });
        card.classList.remove("dirty");
        btn.classList.add("ok");
        btn.textContent = "Guardado ✓";
        setMsg("Cambios guardados", "ok");
        setTimeout(() => {
          btn.classList.remove("ok");
          btn.textContent = "Guardar";
          if (msg.classList.contains("ok")) setMsg("");
        }, 1500);
      } catch (err) {
        console.error(err);
        if (err.message === "DESCRIPCION_REQUERIDA" || err.message === "PRECIO_REQUERIDO") {
          pintarEstado();
        } else {
          setMsg("Error al guardar, intenta otra vez", "error");
        }
        btn.textContent = "Guardar";
      } finally {
        // vuelve a bloquear si quedó incompleto
        btn.disabled = !desc.value.trim() || !leerPrecio();
      }
    });

    card.querySelector('[data-role="img-wrap"]').addEventListener("click", (e) => {
      if (e.target.closest('[data-role="del"]')) return;
      cambiarImagenOferta(key);
    });
    card.querySelector('[data-role="del"]').addEventListener("click", (e) => {
      e.stopPropagation();
      eliminarOferta(key);
    });

    grid.appendChild(card);
  });

  if (entries.length < MAX_OFERTAS) {
    const addCard = document.createElement("div");
    addCard.className = "of-add";
    addCard.innerHTML = "📷<span>Agregar oferta</span>";
    addCard.onclick = () => cambiarImagenOferta(null);
    grid.appendChild(addCard);
  }
}
function cambiarImagenOferta(oldKey) {
  if (subiendoOferta) return;

  const actual = oldKey ? normalizarOferta(ofertasCache[oldKey]) : { imagen: "", descripcion: "" };
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm(oldKey ? "¿Reemplazar esta oferta?" : "¿Agregar esta oferta?")) return;

    subiendoOferta = true;
    const quitarSkeleton = mostrarSkeletonOferta(oldKey);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const newKey = oldKey || String(Math.floor(Math.random() * 9000000) + 1000000);
        const comprimida = await comprimirImagen(ev.target.result, 1024, 0.85);
        const blob = dataURLtoBlob(comprimida);
        const path = `tiendas/${TIENDA_ID}/imagenes/promociones/${newKey}.webp`;
        const ref = storageRef(storage, path);
        await uploadBytes(ref, blob, { contentType: "image/webp" });
        const url = await getDownloadURL(ref);

        const nuevo = { imagen: url, descripcion: actual.descripcion || "" };
        if (Number(actual.precio) > 0) nuevo.precio = Number(actual.precio);

        await updateDoc(TIENDA_REF, {
          [`img_tienda.lista_img.promociones.${newKey}`]: nuevo,
        });

        mostrarToast("La imagen se subió correctamente");
        await cargarOfertas();
      } catch (err) {
        console.error(err);
        alert("Error al subir la oferta");
      } finally {
        subiendoOferta = false;
        quitarSkeleton();
      }
    };
    reader.onerror = () => {
      subiendoOferta = false;
      quitarSkeleton();
      alert("No se pudo leer la imagen");
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

async function guardarDescripcionOferta(key, imagenUrl, descripcion) {
  await updateDoc(TIENDA_REF, {
    [`img_tienda.lista_img.promociones.${key}`]: { imagen: imagenUrl, descripcion },
  });
}

async function eliminarOferta(key) {
  if (!confirm("¿Eliminar esta oferta por completo?")) return;
  try {
    const path = `tiendas/${TIENDA_ID}/imagenes/promociones/${key}.webp`;
    try { await deleteObject(storageRef(storage, path)); } catch {}
    await updateDoc(TIENDA_REF, {
      [`img_tienda.lista_img.promociones.${key}`]: deleteField(),
    });
    delete ofertasCache[key];
    renderOfertas(ofertasCache);
  } catch (err) {
    console.error(err);
    alert("Error al eliminar");
  }
}