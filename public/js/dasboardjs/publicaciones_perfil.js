import { tiendaSubDoc, tiendaDoc, tiendaSubCol } from "../rutas/rutas.js";
import { storage } from "../db/db.js";
import {
  updateDoc,
  getDoc,
  deleteField,
  collection,
  doc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ══════════════ DATOS DE LA TIENDA + HANDSHAKE ══════════════
let TIENDA_ID = null,
  LOCALIDAD = null,
  TIENDA_REF = null;
let datosRecibidos = false;

function iniciarConDatos({ id, localidad }) {
  if (!id || !localidad) return;
  TIENDA_ID = id;
  LOCALIDAD = localidad;
  TIENDA_REF = tiendaSubDoc(LOCALIDAD, "tiendas", TIENDA_ID);
  datosRecibidos = true;
  cargarBanner();
  cargarOfertas();
  cargarProductosGen();
}

window.addEventListener("message", (e) => {
  if (e.origin !== window.location.origin) return;
  if (e.data?.type === "DATOS_TIENDA") iniciarConDatos(e.data);
  if (e.data?.type === "PATCH_TIENDA" && TIENDA_REF) {
    const diff = e.data.payload || {};
    if ("banner.activo" in diff || "banner.imagen" in diff) cargarBanner();
    if (
      Object.keys(diff).some((k) =>
        k.startsWith("img_tienda.lista_img.promociones"),
      )
    )
      cargarOfertas();
  }
});

// El iframe PIDE los datos al padre y reintenta hasta recibirlos
function pedirDatos(intento = 0) {
  if (datosRecibidos || window.parent === window) return;
  window.parent.postMessage(
    { type: "PEDIR_DATOS_TIENDA" },
    window.location.origin,
  );
  if (intento < 12) setTimeout(() => pedirDatos(intento + 1), 500);
}
pedirDatos();

// ══════════════ UTILIDADES ══════════════
// Comprime y exporta a JPG (compatible con plantillas de WhatsApp).
// JPG no tiene transparencia: se rellena de blanco para evitar fondos negros.
function comprimirImagen(dataURL, maxPx, calidad) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxPx || h > maxPx) {
        if (w >= h) {
          h = Math.round((h * maxPx) / w);
          w = maxPx;
        } else {
          w = Math.round((w * maxPx) / h);
          h = maxPx;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", calidad));
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

// Evita que el navegador muestre la imagen vieja cuando se reemplaza en la misma ruta
function conVersion(url) {
  return url + (url.includes("?") ? "&" : "?") + "v=" + Date.now();
}

function abrirVisor(url) {
  if (!url) return;
  const ov = document.createElement("div");
  ov.className = "of-visor";
  ov.innerHTML = `<button type="button" class="of-visor-close">✕</button><img alt="">`;
  ov.querySelector("img").src = url;
  const onKey = (e) => {
    if (e.key === "Escape") cerrar();
  };
  const cerrar = () => {
    document.removeEventListener("keydown", onKey);
    ov.classList.add("out");
    setTimeout(() => ov.remove(), 200);
  };
  ov.addEventListener("click", cerrar);
  document.addEventListener("keydown", onKey);
  document.body.appendChild(ov);
}

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
const bSoloSeguidoresRow = document.getElementById("bannerSoloSeguidoresRow");

const BANNER_CLICK_SUB = {
  producto:
    "Si lo activas, al tocar el banner se abrirá el carrito con este producto. La descripción y el precio serán obligatorios.",
  descuento:
    "Si lo activas, al tocar el banner se abrirá el carrito con este descuento ya aplicado. La descripción y el valor del descuento serán obligatorios.",
  envio_gratis:
    "Si lo activas, al tocar el banner se abrirá el carrito con el envío gratis ya aplicado. La descripción será obligatoria.",
};

let bannerGuardado = {
  descripcion: "",
  precio: null,
  clickeable: false,
  tipo: "producto",
  descuentoTipo: "porcentaje",
  descuentoValor: null,
  soloSeguidores: false,
};
let bannerTipoActual = "producto";
let bannerDescuentoTipoActual = "porcentaje";

const bannerLeerPrecio = () => {
  const n = parseFloat(String(bPrecio?.value ?? "").replace(",", "."));
  return n > 0 ? n : null;
};

function bannerLeerDescuento() {
  const n = parseFloat(String(bDescuentoValor?.value || "").replace(",", "."));
  return n > 0 ? n : null;
}

const bannerSetMsg = (texto, tipo = "") => {
  if (!bMsg) return;
  bMsg.textContent = texto;
  bMsg.className = "of-msg" + (tipo ? " " + tipo : "");
};

const bannerHayCambios = () =>
  bDesc.value.trim() !== (bannerGuardado.descripcion || "").trim() ||
  (bannerLeerPrecio() || 0) !== (bannerGuardado.precio || 0) ||
  bClick.checked !== bannerGuardado.clickeable ||
  bannerTipoActual !== (bannerGuardado.tipo || "producto") ||
  bannerDescuentoTipoActual !==
    (bannerGuardado.descuentoTipo || "porcentaje") ||
  (bannerLeerDescuento() || 0) !== (bannerGuardado.descuentoValor || 0) ||
  !!bSoloSeguidores?.checked !== !!bannerGuardado.soloSeguidores;

// Si es clickeable → descripción y precio/valor obligatorios. Si no → opcionales.
function validarBanner() {
  if (!bClick || !bDesc) return;
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

  document
    .getElementById("bannerDescuentoBox")
    ?.classList.toggle("error", faltaDescuento);

  if (bSoloSeguidoresRow)
    bSoloSeguidoresRow.style.display = obligatorio ? "" : "none";

  bBtnGuardar.disabled = faltaDesc || faltaPrecio || faltaDescuento;

  if (faltaDesc || faltaPrecio || faltaDescuento) {
    const faltan = [
      faltaDesc && "descripción",
      faltaPrecio && "precio",
      faltaDescuento && "valor del descuento",
    ]
      .filter(Boolean)
      .join(" y ");
    bannerSetMsg(`Falta ${faltan} para que el banner sea clickeable`, "error");
  } else if (bMsg.classList.contains("error")) {
    bannerSetMsg("");
  }
}

function pintarTipoBanner() {
  bTipoRow?.querySelectorAll(".bn-tipo-chip").forEach((c) => {
    c.classList.toggle("active", c.dataset.tipo === bannerTipoActual);
  });
  if (bCampoPrecio)
    bCampoPrecio.style.display = bannerTipoActual === "producto" ? "" : "none";
  if (bCampoDescuento)
    bCampoDescuento.classList.toggle("show", bannerTipoActual === "descuento");
  if (bClickSub)
    bClickSub.textContent =
      BANNER_CLICK_SUB[bannerTipoActual] || BANNER_CLICK_SUB.producto;
  validarBanner();
}

bTipoRow?.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-tipo]");
  if (!chip) return;
  bannerTipoActual = chip.dataset.tipo;
  pintarTipoBanner();
});

document
  .querySelectorAll("#bannerCampoDescuento [data-descuento-tipo]")
  .forEach((chip) => {
    chip.addEventListener("click", () => {
      bannerDescuentoTipoActual = chip.dataset.descuentoTipo;
      document
        .querySelectorAll("#bannerCampoDescuento [data-descuento-tipo]")
        .forEach((c) => c.classList.toggle("active", c === chip));
      if (bDescuentoUnidad)
        bDescuentoUnidad.textContent =
          bannerDescuentoTipoActual === "porcentaje" ? "%" : "S/";
      validarBanner();
    });
  });

bDesc?.addEventListener("input", validarBanner);
bPrecio?.addEventListener("input", validarBanner);
bClick?.addEventListener("change", validarBanner);
bDescuentoValor?.addEventListener("input", validarBanner);

async function cargarBanner(intento = 0) {
  if (!TIENDA_REF) return;

  let banner = {};
  try {
    const snap = await getDoc(TIENDA_REF);
    banner = snap.data()?.banner || {};
  } catch (err) {
    console.error("[banner] falló getDoc:", err.code, err.message);
    if (intento < 3)
      setTimeout(() => cargarBanner(intento + 1), 1000 * (intento + 1));
    return;
  }

  const img = document.getElementById("bannerImgPreview");
  const ph = document.getElementById("bannerPlaceholder");
  const sw = document.getElementById("bannerActivoSwitch");

  if (banner.imagen) {
    img.src = conVersion(banner.imagen);
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
    descuentoValor:
      Number(banner.descuentoValor) > 0 ? Number(banner.descuentoValor) : null,
    soloSeguidores: banner.soloSeguidores === true,
  };

  bDesc.value = bannerGuardado.descripcion;
  bPrecio.value = bannerGuardado.precio ?? "";
  bClick.checked = bannerGuardado.clickeable;
  bannerTipoActual = bannerGuardado.tipo;
  bannerDescuentoTipoActual = bannerGuardado.descuentoTipo;
  if (bDescuentoValor)
    bDescuentoValor.value = bannerGuardado.descuentoValor ?? "";
  if (bDescuentoUnidad)
    bDescuentoUnidad.textContent =
      bannerDescuentoTipoActual === "porcentaje" ? "%" : "S/";
  document
    .querySelectorAll("#bannerCampoDescuento [data-descuento-tipo]")
    .forEach((c) =>
      c.classList.toggle(
        "active",
        c.dataset.descuentoTipo === bannerDescuentoTipoActual,
      ),
    );
  if (bSoloSeguidores) bSoloSeguidores.checked = bannerGuardado.soloSeguidores;

  pintarTipoBanner();
}

bBtnGuardar?.addEventListener("click", async () => {
  if (!TIENDA_REF) {
    bannerSetMsg("Aún cargando datos de la tienda, espera un momento", "error");
    return;
  }

  const descripcion = bDesc.value.trim();
  const precio = bannerLeerPrecio();
  const descuentoValor = bannerLeerDescuento();
  const clickeable = bClick.checked;
  const tipo = bannerTipoActual;
  // Solo tiene sentido si el banner es clickeable
  const soloSeguidores = clickeable && !!bSoloSeguidores?.checked;

  if (clickeable) {
    if (!descripcion) {
      validarBanner();
      return;
    }
    if (tipo === "producto" && !precio) {
      validarBanner();
      return;
    }
    if (tipo === "descuento" && !descuentoValor) {
      validarBanner();
      return;
    }
  }

  if (!bannerHayCambios()) {
    bannerSetMsg("Sin cambios");
    setTimeout(() => {
      if (bMsg.textContent === "Sin cambios") bannerSetMsg("");
    }, 1500);
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
      "banner.descuentoTipo":
        tipo === "descuento" ? bannerDescuentoTipoActual : deleteField(),
      "banner.descuentoValor":
        tipo === "descuento" && descuentoValor ? descuentoValor : deleteField(),
      "banner.soloSeguidores": soloSeguidores ? true : deleteField(),
    });

    bannerGuardado = {
      descripcion,
      precio: tipo === "producto" ? precio : null,
      clickeable,
      tipo,
      descuentoTipo: bannerDescuentoTipoActual,
      descuentoValor: tipo === "descuento" ? descuentoValor : null,
      soloSeguidores,
    };
    bannerSetMsg("Cambios guardados", "ok");
    setTimeout(() => {
      if (bMsg.classList.contains("ok")) bannerSetMsg("");
    }, 1500);
    mostrarToast("Banner actualizado correctamente");
  } catch (err) {
    console.error(err);
    bannerSetMsg("Error al guardar, intenta otra vez", "error");
  } finally {
    bBtnGuardar.textContent = "Guardar detalles del banner";
    validarBanner();
  }
});

document
  .getElementById("bannerActivoSwitch")
  ?.addEventListener("change", async (e) => {
    const sw = e.target;
    if (!TIENDA_REF) {
      sw.checked = !sw.checked;
      return;
    }
    const nuevo = sw.checked;
    try {
      await updateDoc(TIENDA_REF, { "banner.activo": nuevo });
    } catch (err) {
      console.error(err);
      sw.checked = !nuevo; // revierte si falló
      alert("No se pudo cambiar el estado del banner");
    }
  });

document.getElementById("btnCambiarBanner")?.addEventListener("click", () => {
  document.getElementById("bannerFileInput").click();
});

document.getElementById("bannerPreviewWrap")?.addEventListener("click", () => {
  const img = document.getElementById("bannerImgPreview");
  if (img && img.style.display !== "none" && img.src) abrirVisor(img.src);
});

document.getElementById("bannerFileInput")?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = "";
  if (!TIENDA_REF) {
    alert("Aún cargando datos de la tienda, intenta en un momento");
    return;
  }
  if (!confirm("¿Actualizar el banner?")) return;

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
      const ref = storageRef(storage, `tiendas/${TIENDA_ID}/banner/banner.jpg`);
      await uploadBytes(ref, blob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(ref);
      await updateDoc(TIENDA_REF, {
        "banner.imagen": url,
        "banner.activo": true,
      });
      // Si había un banner viejo en WebP, se limpia (no importa si no existe)
      try {
        await deleteObject(
          storageRef(storage, `tiendas/${TIENDA_ID}/banner/banner.webp`),
        );
      } catch {}
      mostrarToast("La imagen se subió correctamente");
      await cargarBanner();
    } catch (err) {
      console.error(err);
      alert("Error al subir el banner");
    } finally {
      ov.remove();
    }
  };
  reader.onerror = () => {
    ov.remove();
    alert("No se pudo leer la imagen");
  };
  reader.readAsDataURL(file);
});

// ══════════════ OFERTAS ══════════════
let ofertasCache = {};
const maxOfertas = () => window.GEINZ_PLAN?.maxOfertas ?? 50;
let subiendoOferta = false;

async function cargarOfertas(intento = 0) {
  const grid = document.getElementById("ofertasGrid");
  if (!grid) {
    console.warn("[ofertas] no existe #ofertasGrid en el HTML");
    return;
  }
  if (!TIENDA_REF) return;
  try {
    const snap = await getDoc(TIENDA_REF);
    const map = snap.data()?.img_tienda?.lista_img?.promociones || {};
    renderOfertas(map);
  } catch (err) {
    console.error("[ofertas] falló getDoc:", err.code, err.message);
    if (intento < 3) {
      setTimeout(() => cargarOfertas(intento + 1), 1000 * (intento + 1));
      return;
    }
    grid.innerHTML = `<p class="of-msg error">No se pudieron cargar las ofertas. <button type="button" id="ofReintentar">Reintentar</button></p>`;
    document.getElementById("ofReintentar").onclick = () => cargarOfertas();
  }
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

  // Oferta nueva: tarjeta esqueleto
  const adds = [...grid.querySelectorAll(".of-add")];
  adds.forEach((a) => (a.style.display = "none"));
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
    adds.forEach((a) => (a.style.display = ""));
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
  const nuevo = {
    ...actual,
    descripcion: actual.descripcion || "",
    ...cambios,
  };

  if (!String(nuevo.descripcion || "").trim())
    throw new Error("DESCRIPCION_REQUERIDA");
  if (!(Number(nuevo.precio) > 0)) throw new Error("PRECIO_REQUERIDO");
  if (nuevo.combo?.total && Number(nuevo.precio) >= Number(nuevo.combo.total))
    throw new Error("PRECIO_COMBO_INVALIDO");

  await updateDoc(TIENDA_REF, {
    [`img_tienda.lista_img.promociones.${key}`]: nuevo,
  });
  ofertasCache[key] = nuevo; // solo se actualiza el caché si Firestore guardó bien
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
        <img alt="">
        <button type="button" class="of-edit" data-role="edit">📷 Cambiar</button>
        <button type="button" class="of-del" data-role="del" title="Eliminar oferta">✕</button>
        <span class="of-price-tag vacio" data-role="tag">Sin precio</span>
      </div>
      <div class="of-body">
        <textarea class="of-desc" data-role="desc" rows="3" maxlength="500" placeholder="Descripción (obligatoria)"></textarea>
                <div class="of-dias" data-role="dias"></div>
        <div class="of-price" data-role="price-box">
          <span>S/</span>
          <input data-role="precio" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Precio (obligatorio)">
        </div>
        <p class="of-msg" data-role="msg"></p>
        <button type="button" class="of-save" data-role="save" disabled>Guardar</button>
      </div>
    `;

    const imgEl = card.querySelector("img");
    if (item.imagen) imgEl.src = conVersion(item.imagen);

    const desc = card.querySelector('[data-role="desc"]');
    const precio = card.querySelector('[data-role="precio"]');
    const priceBox = card.querySelector('[data-role="price-box"]');
    const msg = card.querySelector('[data-role="msg"]');
    const btn = card.querySelector('[data-role="save"]');
    const tag = card.querySelector('[data-role="tag"]');
    const diasBox = card.querySelector('[data-role="dias"]');
    const pintarDias = () => {
      const sel = normalizarOferta(ofertasCache[key]).dias || [];
      diasBox.innerHTML =
        `<span class="of-dias-lbl">${sel.length ? "Se muestra estos días:" : "Se muestra todos los días"}</span>` +
        GEN_DIAS.map(
          ([d, l]) =>
            `<span class="of-dia ${sel.includes(d) ? "on" : ""}" data-dia="${d}">${l}</span>`,
        ).join("");
    };
    pintarDias();
    diasBox.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-dia]");
      if (!b) return;
      const actual = normalizarOferta(ofertasCache[key]);
      const set = new Set(actual.dias || []);
      set.has(b.dataset.dia)
        ? set.delete(b.dataset.dia)
        : set.add(b.dataset.dia);
      const arr = GEN_DIAS.map((x) => x[0]).filter((x) => set.has(x));
      try {
        await updateDoc(TIENDA_REF, {
          [`img_tienda.lista_img.promociones.${key}.dias`]: arr.length
            ? arr
            : deleteField(),
        });
        const nuevo = { ...actual };
        if (arr.length) nuevo.dias = arr;
        else delete nuevo.dias;
        ofertasCache[key] = nuevo;
        pintarDias();
      } catch (err) {
        console.error(err);
        mostrarToast("No se pudo cambiar los días");
      }
    });
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
      const cambioDesc =
        desc.value.trim() !== (guardado.descripcion || "").trim();
      const cambioPrecio =
        (leerPrecio() || 0) !== (Number(guardado.precio) || 0);
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

      const p = leerPrecio();
      tag.textContent = p ? "S/ " + p.toFixed(2) : "Sin precio";
      tag.classList.toggle("vacio", !p);
      card.classList.toggle("dirty", faltan.length === 0 && hayCambios());

      if (faltan.length) setMsg("Falta " + faltan.join(" y "), "error");
      else if (msg.classList.contains("error")) setMsg("");
    };

    pintarEstado();
    desc.addEventListener("input", pintarEstado);
    precio.addEventListener("input", pintarEstado);

    btn.addEventListener("click", async () => {
      if (!hayCambios()) {
        setMsg("Sin cambios");
        setTimeout(() => {
          if (msg.textContent === "Sin cambios") setMsg("");
        }, 1500);
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
        if (
          err.message === "DESCRIPCION_REQUERIDA" ||
          err.message === "PRECIO_REQUERIDO"
        ) {
          pintarEstado();
        } else if (err.message === "PRECIO_COMBO_INVALIDO") {
          setMsg(
            "El combo no puede costar igual o más que por separado",
            "error",
          );
        } else {
          setMsg("Error al guardar, intenta otra vez", "error");
        }
        btn.textContent = "Guardar";
      } finally {
        btn.disabled = !desc.value.trim() || !leerPrecio();
      }
    });

    card
      .querySelector('[data-role="img-wrap"]')
      .addEventListener("click", (e) => {
        if (
          e.target.closest('[data-role="del"]') ||
          e.target.closest('[data-role="edit"]')
        )
          return;
        abrirVisor(imgEl.src || normalizarOferta(ofertasCache[key]).imagen);
      });
    card.querySelector('[data-role="edit"]').addEventListener("click", (e) => {
      e.stopPropagation();
      cambiarImagenOferta(key);
    });
    card.querySelector('[data-role="del"]').addEventListener("click", (e) => {
      e.stopPropagation();
      eliminarOferta(key);
    });

    grid.appendChild(card);
  });

  const max = maxOfertas();

  const sub = document.querySelector("#cardOfertas .sec-sub");
  if (sub)
    sub.textContent = `${entries.length} de ${max} ofertas · imagen, descripción y precio obligatorios.`;

  // Una sola tarjeta "Agregar oferta" (no una por cada espacio libre)
  if (entries.length < max) {
    const addCard = document.createElement("div");
    addCard.className = "of-add";
    addCard.innerHTML = `📷<span>Agregar oferta</span><small style="opacity:.6">${entries.length + 1} de ${max}</small>`;
    addCard.onclick = () => cambiarImagenOferta(null);
    grid.appendChild(addCard);
  }
}

function cambiarImagenOferta(oldKey) {
  if (subiendoOferta) return;
  if (!oldKey && Object.keys(ofertasCache).length >= maxOfertas()) {
    alert(`Tu plan permite hasta ${maxOfertas()} ofertas`);
    return;
  }
  if (!TIENDA_REF) {
    alert("Aún cargando datos de la tienda, intenta en un momento");
    return;
  }

  const actual = oldKey
    ? normalizarOferta(ofertasCache[oldKey])
    : { imagen: "", descripcion: "" };
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm(oldKey ? "¿Reemplazar esta oferta?" : "¿Agregar esta oferta?"))
      return;

    subiendoOferta = true;
    const quitarSkeleton = mostrarSkeletonOferta(oldKey);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const newKey =
          oldKey || String(Math.floor(Math.random() * 9000000) + 1000000);
        const comprimida = await comprimirImagen(ev.target.result, 1024, 0.85);
        const blob = dataURLtoBlob(comprimida);
        const path = `tiendas/${TIENDA_ID}/imagenes/promociones/${newKey}.jpg`;
        const ref = storageRef(storage, path);
        await uploadBytes(ref, blob, { contentType: "image/jpeg" });
        const url = await getDownloadURL(ref);

        const nuevo = {
          ...actual,
          imagen: url,
          descripcion: actual.descripcion || "",
        };

        await updateDoc(TIENDA_REF, {
          [`img_tienda.lista_img.promociones.${newKey}`]: nuevo,
        });

        // Si se reemplazó una oferta vieja en WebP, se borra el archivo huérfano
        if (oldKey) {
          try {
            await deleteObject(
              storageRef(
                storage,
                `tiendas/${TIENDA_ID}/imagenes/promociones/${oldKey}.webp`,
              ),
            );
          } catch {}
        }

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

async function eliminarOferta(key) {
  if (!TIENDA_REF) return;
  if (!confirm("¿Eliminar esta oferta por completo?")) return;
  try {
    // Borra ambas extensiones: las ofertas antiguas siguen en .webp
    for (const ext of ["jpg", "webp"]) {
      try {
        await deleteObject(
          storageRef(
            storage,
            `tiendas/${TIENDA_ID}/imagenes/promociones/${key}.${ext}`,
          ),
        );
      } catch {}
    }
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
window.addEventListener("geinz:plan", () => renderOfertas(ofertasCache));

// ══════════════ GENERADOR DE PROMOCIONES / COMBOS ══════════════
const GEN_DIAS = [
  ["lunes", "Lun"],
  ["martes", "Mar"],
  ["miercoles", "Mié"],
  ["jueves", "Jue"],
  ["viernes", "Vie"],
  ["sabado", "Sáb"],
  ["domingo", "Dom"],
];
const $g = (id) => document.getElementById(id);
const gFmt = (n) => "S/ " + Number(n || 0).toFixed(2);
const gEsc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const gR2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const gCeil2 = (n) => Math.ceil((Number(n) || 0) * 100 - 1e-9) / 100;

// ── Reglas de pricing ──
const GEN_MARKUP_MIN = 1.5; // Precio_Combo >= Costo * 1.50  (margen neto mínimo ≈ 33 %)
// Descuento por volumen sugerido: más unidades → más ahorro (tope 15 %)
const GEN_TIERS = [
  [2, 8],
  [3, 10],
  [4, 12],
  [5, 15],
]; // [unidades mínimas, % descuento]
const descuentoPorVolumen = (unidades) =>
  GEN_TIERS.reduce((pct, [u, p]) => (unidades >= u ? p : pct), 0);

// ── Costos de insumos (misma lógica que producto.js) ──
const U_REC = {
  unid: { f: 1 },
  docena: { f: 12 },
  g: { f: 1 },
  kg: { f: 1000 },
  ozp: { f: 28.3495 },
  lb: { f: 453.592 },
  ml: { f: 1 },
  l: { f: 1000 },
  oz: { f: 29.5735 },
};
let genInsumos = new Map();

function entradaVigenteInsumo(i) {
  const keys = Object.keys(i.precios || {}).sort();
  if (!keys.length) return null;
  const hoy = new Date()
    .toLocaleDateString("en-CA", { timeZone: "America/Lima" })
    .slice(0, 7);
  const obj = "m_" + hoy.replace("-", "_");
  let pick = null;
  for (const k of keys) if (k <= obj) pick = k;
  if (!pick) pick = keys[0];
  return i.precios[pick];
}
// Suma el costo de una lista de insumos. ok=false si algún insumo ya no existe / no tiene precio.
function costoItems(items) {
  let c = 0,
    ok = true;
  (items || []).forEach((it) => {
    const ing = genInsumos.get(it.id);
    const e = ing && entradaVigenteInsumo(ing);
    if (!e) {
      ok = false;
      return;
    }
    c += (e.costo_base || 0) * (Number(it.qty) || 0) * (U_REC[it.unit]?.f || 1);
  });
  return { c, ok };
}
function costoRecetaBase(r) {
  if (!r?.items?.length) return { c: 0, ok: true };
  const { c, ok } = costoItems(r.items);
  return { c: c / Math.max(0.0001, Number(r.rinde) || 1), ok };
}

// ── Variantes (helada / sin helar, tamaños, etc.) ──
const opsActivas = (c) =>
  (c.opciones || []).filter(
    (o) => o.activo !== false && (o.nombre || "").trim(),
  );
// Solo grupos de "elegir 1": definen QUÉ producto es. Los extras (grupos múltiples) no entran al combo.
const gruposUnicos = (p) =>
  (p.condiciones || []).filter(
    (c) =>
      (c.nombre || "").trim() &&
      opsActivas(c).length &&
      !(c.tipo ? c.tipo === "multiple" : p.variantesMultiples === true),
  );
const selPorDefecto = (p) => {
  const sel = {};
  gruposUnicos(p).forEach((c) => (sel[c.nombre] = opsActivas(c)[0].nombre));
  return sel;
};
const firmaSel = (sel) =>
  Object.keys(sel)
    .sort()
    .map((k) => k + "=" + sel[k])
    .join("|");

// Precio y costo unitario de UNA línea (producto + variante elegida)
function genLinea(l) {
  const p = l.p;
  const base = costoRecetaBase(p.receta);
  let unit = Number(p.precio) || 0;
  let costo = p.receta?.items?.length ? base.c : Number(p.costo_unitario) || 0;
  let conocido =
    (p.receta?.items?.length ? base.ok : false) ||
    (!p.receta?.items?.length && costo > 0);
  const etiquetas = [];
  gruposUnicos(p).forEach((c) => {
    const ops = opsActivas(c);
    const op = ops.find((o) => o.nombre === l.sel[c.nombre]) || ops[0];
    unit += Number(op.costoAdicional) || 0;
    const items = op.receta?.items || [];
    if (items.length) {
      const r = costoItems(items);
      costo += r.c;
      if (r.ok) conocido = true;
    }
    etiquetas.push(op.nombre);
  });
  return { unit: gR2(unit), costo, conocido, etiqueta: etiquetas.join(" · ") };
}

// ── Estado ──
let genProductos = [];
let genSel = new Map(); // uid -> { p, qty, sel }
let genUid = 0;
let genDias = new Set();
let genModo = "porcentaje";
let genFile = null;
let genDescEditada = false;
let genCreando = false;

async function cargarProductosGen() {
  if (!TIENDA_REF) return;
  const lista = $g("genLista");
  try {
    const [insSnap] = await Promise.all([
      getDocs(tiendaSubCol(LOCALIDAD, "tiendas", TIENDA_ID, "insumos")).catch(
        () => null,
      ),
    ]);
    genInsumos = new Map();
    insSnap?.forEach((d) => genInsumos.set(d.id, { id: d.id, ...d.data() }));

    const catsRef = collection(
      tiendaDoc(LOCALIDAD, "tiendas", TIENDA_ID),
      "productos",
    );
    const cats = await getDocs(catsRef);
    const lotes = await Promise.all(
      cats.docs.map(async (c) => {
        const s = await getDocs(collection(doc(catsRef, c.id), c.id));
        return s.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            catId: c.id,
            cat: c.data().nombre || c.id,
            nombre: x.nombre || "Sin nombre",
            precio: Number(x.precio) || 0,
            disponible: x.disponible !== false,
            condiciones: x.condiciones || [],
            variantesMultiples: x.variantesMultiples === true,
            receta: x.receta || null,
            costo_unitario: Number(x.costo_unitario) || 0,
          };
        });
      }),
    );
    genProductos = lotes
      .flat()
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    genRenderLista();
  } catch (err) {
    console.error("[generador] productos:", err);
    if (lista)
      lista.innerHTML = `<p class="of-msg error">No se pudieron cargar tus productos.</p>`;
  }
}

function genRenderLista() {
  const lista = $g("genLista");
  if (!lista) return;
  const q = ($g("genBuscar").value || "").trim().toLowerCase();
  const items = genProductos
    .filter((p) => !q || (p.nombre + " " + p.cat).toLowerCase().includes(q))
    .slice(0, 80);
  if (!items.length) {
    lista.innerHTML = `<p class="of-msg">Sin productos.</p>`;
    return;
  }
  lista.innerHTML = items
    .map((p) => {
      const nGrupos = gruposUnicos(p).length;
      return `
    <div class="gen-row" style="${p.disponible ? "" : "opacity:.5"}">
      <div class="gen-n"><b>${gEsc(p.nombre)}</b><small>${gEsc(p.cat)}${nGrupos ? " · con variantes" : ""}${p.disponible ? "" : " · agotado"}</small></div>
      <span class="gen-p">${gFmt(p.precio)}</span>
      <button type="button" class="gen-btn" data-add="${gEsc(p.catId)}|${gEsc(p.id)}">+</button>
    </div>`;
    })
    .join("");
}

// ══ CÁLCULO CENTRAL ══
//  Precio_Separado = Σ precio_unit × qty
//  Piso            = Costo × 1.5            (margen mínimo)
//  Precio_Combo    = Separado × (1 − desc)  → se SUBE al piso si queda por debajo
//  Siempre debe cumplirse: Piso ≤ Precio_Combo < Precio_Separado
function genTotales() {
  let total = 0,
    costo = 0,
    unidades = 0;
  const sinCosto = [];
  genSel.forEach((l) => {
    const x = genLinea(l);
    total += x.unit * l.qty;
    costo += x.costo * l.qty;
    unidades += l.qty;
    if (!x.conocido) sinCosto.push(l.p.nombre);
  });
  total = gR2(total);
  costo = gR2(costo);

  const piso = costo > 0 ? gCeil2(costo * GEN_MARKUP_MIN) : 0;
  const sinMargen = piso > 0 && piso >= total; // ni con 0 % de descuento hay margen
  const maxPct =
    total > 0 && piso > 0
      ? Math.max(0, (1 - piso / total) * 100)
      : GEN_TIERS[GEN_TIERS.length - 1][1];

  const v = parseFloat(String($g("genValor")?.value).replace(",", ".")) || 0;
  let promo = total,
    ajustado = false,
    motivo = "";

  if (v > 0 && total > 0) {
    promo = genModo === "porcentaje" ? total * (1 - Math.min(v, 99) / 100) : v;
    promo = gCeil2(promo);
    if (piso > 0 && promo < piso && !sinMargen) {
      promo = piso;
      ajustado = true;
    }
  }

  const pct = total > 0 ? Math.max(0, (1 - promo / total) * 100) : 0;
  const ganancia = promo - costo;
  const margen = promo > 0 && costo > 0 ? (ganancia / promo) * 100 : 0;

  if (!genSel.size) motivo = "Agrega al menos un producto";
  else if (!(v > 0)) motivo = "Pon el descuento o el precio final";
  else if (sinMargen)
    motivo =
      "Con estos costos no queda margen para descontar. Sube precios o revisa costos.";
  else if (promo >= total)
    motivo = "El combo no puede costar igual o más que comprarlo por separado";
  else if (!(promo > 0)) motivo = "El precio del combo no es válido";

  // Sugerencia: descuento por volumen, acotado por lo que el margen permite
  const sugPct =
    Math.floor(Math.min(descuentoPorVolumen(unidades), maxPct) * 10) / 10;
  const sugPrecio = gCeil2(total * (1 - sugPct / 100));

  return {
    total,
    costo,
    piso,
    maxPct,
    unidades,
    sinCosto,
    sinMargen,
    ajustado,
    promo: gR2(promo),
    pct,
    ahorro: Math.max(0, gR2(total - promo)),
    ganancia: gR2(ganancia),
    margen,
    valor: v,
    sugPct,
    sugPrecio,
    motivo,
    valido: motivo === "",
  };
}

function genAutoDescripcion() {
  if (genDescEditada) return;
  const txt = [...genSel.values()]
    .map((l) => {
      const e = genLinea(l).etiqueta;
      return (l.qty > 1 ? l.qty + "x " : "") + l.p.nombre + (e ? " " + e : "");
    })
    .join(" + ");
  $g("genDesc").value = txt.slice(0, 500);
}

// Panel de análisis (se inyecta solo, no hace falta tocar el HTML)
function genPanel() {
  let el = $g("genAnalisis");
  if (!el) {
    el = document.createElement("div");
    el.id = "genAnalisis";
    el.style.cssText =
      "margin:10px 0;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(139,92,246,.25);font-size:12px;line-height:1.6;";
    $g("genSel").insertAdjacentElement("afterend", el);
  }
  return el;
}
function genPintarAnalisis(t) {
  const el = genPanel();
  if (!genSel.size) {
    el.style.display = "none";
    return;
  }
  el.style.display = "";
  const fila = (a, b, c = "") =>
    `<div style="display:flex;justify-content:space-between;gap:8px;"><span style="opacity:.65">${a}</span><b${c ? ` style="color:${c}"` : ""}>${b}</b></div>`;
  const verde = "#34d399",
    rojo = "#fb7185",
    ambar = "#fbbf24";
  const hayCosto = t.costo > 0;
  let h = "";
  h += fila("Precio por separado", gFmt(t.total));
  h += fila(
    "Costo de producción",
    hayCosto ? gFmt(t.costo) : "sin costo registrado",
    hayCosto ? "" : ambar,
  );
  if (hayCosto) {
    h += fila("Precio mínimo permitido (costo × 1.5)", gFmt(t.piso));
    h += fila(
      "Descuento máximo permitido",
      t.sinMargen ? "0%" : t.maxPct.toFixed(1) + "%",
    );
  }
  if (t.valor > 0 && t.total > 0) {
    h += `<hr style="border:0;border-top:1px solid rgba(255,255,255,.08);margin:6px 0">`;
    h += fila(
      "Cliente ahorra",
      `${gFmt(t.ahorro)} (${t.pct.toFixed(t.pct % 1 ? 1 : 0)}%)`,
      verde,
    );
    if (hayCosto) {
      h += fila(
        "Ganancia neta",
        gFmt(t.ganancia),
        t.ganancia >= 0 ? verde : rojo,
      );
      h += fila(
        "Margen",
        t.margen.toFixed(1) + "%",
        t.margen >= 33 ? verde : rojo,
      );
    }
  }
  if (t.ajustado)
    h += `<div style="margin-top:6px;color:${ambar}">⚠️ Ajusté el precio a ${gFmt(t.promo)} para proteger tu margen (el descuento pedido lo dejaba por debajo de costo × 1.5).</div>`;
  if (t.sinCosto.length)
    h += `<div style="margin-top:6px;color:${ambar}">⚠️ Sin costo registrado: ${gEsc(t.sinCosto.join(", "))}. No puedo proteger tu margen en esos productos; agrégales receta en Productos → Súper avanzado.</div>`;
  if (t.sugPct > 0 && t.valor <= 0 && !t.sinMargen)
    h += `<button type="button" id="genUsarSugerido" class="gen-btn" style="margin-top:8px;width:100%;padding:6px 10px">Aplicar descuento sugerido: ${t.sugPct}% → ${gFmt(t.sugPrecio)}</button>`;
  el.innerHTML = h;
}

function genRefrescar() {
  const box = $g("genSel");
  if (!genSel.size)
    box.innerHTML = `<p class="of-msg">Agrega productos con el botón +</p>`;
  else
    box.innerHTML = [...genSel.entries()]
      .map(([k, l]) => {
        const x = genLinea(l);
        const selects = gruposUnicos(l.p)
          .map((c) => {
            const ops = opsActivas(c);
            return (
              `<select class="gen-var" data-g="${gEsc(c.nombre)}" style="margin-top:4px;margin-right:4px;max-width:100%;border-radius:8px;padding:3px 6px;font-size:11px;background:#05040a;color:inherit;border:1px solid rgba(139,92,246,.3)">` +
              ops
                .map(
                  (o) =>
                    `<option value="${gEsc(o.nombre)}" ${o.nombre === l.sel[c.nombre] ? "selected" : ""}>${gEsc(c.nombre)}: ${gEsc(o.nombre)}${Number(o.costoAdicional) ? " (+" + gFmt(o.costoAdicional) + ")" : ""}</option>`,
                )
                .join("") +
              `</select>`
            );
          })
          .join("");
        return `
    <div class="gen-row" data-k="${gEsc(k)}">
      <div class="gen-n"><b>${gEsc(l.p.nombre)}</b><small>${gFmt(x.unit)} c/u</small>${selects ? `<div>${selects}</div>` : ""}</div>
      <div class="gen-qty">
        <button type="button" class="gen-btn" data-q="-1">−</button><span>${l.qty}</span><button type="button" class="gen-btn" data-q="1">+</button>
      </div>
      <span class="gen-p">${gFmt(x.unit * l.qty)}</span>
      <button type="button" class="gen-btn" data-q="x" style="background:rgba(225,29,72,.4)">✕</button>
    </div>`;
      })
      .join("");

  const t = genTotales();
  $g("genTotal").textContent = gFmt(t.total);
  $g("genPromo").textContent = gFmt(t.promo);
  $g("genAhorro").textContent = gFmt(t.ahorro);
  $g("genPct").textContent = t.pct.toFixed(t.pct % 1 ? 1 : 0) + "%";
  genPintarAnalisis(t);
  genAutoDescripcion();
}

function genMsg(txt, tipo = "") {
  const m = $g("genMsg");
  m.textContent = txt;
  m.className = "of-msg" + (tipo ? " " + tipo : "");
}

function genLimpiar() {
  genSel.clear();
  genDias.clear();
  genFile = null;
  genDescEditada = false;
  $g("genValor").value = "";
  $g("genDesc").value = "";
  const prev = $g("genImgPrev");
  prev.style.backgroundImage = "";
  prev.textContent = "📷 Tu imagen";
  genPintarDias();
  genRefrescar();
  genMsg("");
}

function genPintarDias() {
  $g("genDias").innerHTML = GEN_DIAS.map(
    ([d, l]) =>
      `<div class="bn-tipo-chip ${genDias.has(d) ? "active" : ""}" data-d="${d}">${l}</div>`,
  ).join("");
}

function genLeerArchivo(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = (e) => res(e.target.result);
    r.onerror = () => rej(new Error("No se pudo leer la imagen"));
    r.readAsDataURL(file);
  });
}

// ── Eventos ──
$g("genBuscar")?.addEventListener("input", genRenderLista);

$g("genLista")?.addEventListener("click", (e) => {
  const b = e.target.closest("[data-add]");
  if (!b) return;
  const [catId, id] = b.dataset.add.split("|");
  const p = genProductos.find((x) => x.catId === catId && x.id === id);
  if (!p) return;
  const sel = selPorDefecto(p);
  const firma = firmaSel(sel);
  // Mismo producto + misma variante → sube la cantidad; otra variante → línea nueva
  const existente = [...genSel.values()].find(
    (l) => l.p === p && firmaSel(l.sel) === firma,
  );
  if (existente) existente.qty++;
  else genSel.set("l" + ++genUid, { p, qty: 1, sel });
  genRefrescar();
});

$g("genSel")?.addEventListener("click", (e) => {
  const b = e.target.closest("[data-q]");
  const row = e.target.closest("[data-k]");
  if (!b || !row) return;
  const k = row.dataset.k;
  const cur = genSel.get(k);
  if (!cur) return;
  if (b.dataset.q === "x") genSel.delete(k);
  else {
    cur.qty += Number(b.dataset.q);
    if (cur.qty <= 0) genSel.delete(k);
  }
  genRefrescar();
});

// Cambiar variante (ej. helada ↔ sin helar) recalcula precio y costo de esa línea
$g("genSel")?.addEventListener("change", (e) => {
  const s = e.target.closest(".gen-var");
  const row = e.target.closest("[data-k]");
  if (!s || !row) return;
  const l = genSel.get(row.dataset.k);
  if (!l) return;
  l.sel[s.dataset.g] = s.value;
  genRefrescar();
});

// Botón "Aplicar descuento sugerido" (se crea dentro del panel de análisis)
document.addEventListener("click", (e) => {
  if (!e.target.closest("#genUsarSugerido")) return;
  const t = genTotales();
  $g("genModoRow")?.querySelector('[data-modo="porcentaje"]')?.click();
  $g("genValor").value = t.sugPct;
  genRefrescar();
});

$g("genModoRow")?.addEventListener("click", (e) => {
  const c = e.target.closest("[data-modo]");
  if (!c) return;
  genModo = c.dataset.modo;
  $g("genModoRow")
    .querySelectorAll("[data-modo]")
    .forEach((x) => x.classList.toggle("active", x === c));
  $g("genUnidad").textContent = genModo === "porcentaje" ? "%" : "S/";
  $g("genValor").placeholder =
    genModo === "porcentaje" ? "Ej: 10" : "Ej: 25.00";
  $g("genRapidos").style.display = genModo === "porcentaje" ? "" : "none";
  genRefrescar();
});

$g("genRapidos")?.addEventListener("click", (e) => {
  const c = e.target.closest("[data-r]");
  if (!c) return;
  $g("genValor").value = c.dataset.r;
  genRefrescar();
});

$g("genValor")?.addEventListener("input", genRefrescar);
$g("genDesc")?.addEventListener("input", () => {
  genDescEditada = $g("genDesc").value.trim() !== "";
});

$g("genDias")?.addEventListener("click", (e) => {
  const c = e.target.closest("[data-d]");
  if (!c) return;
  genDias.has(c.dataset.d)
    ? genDias.delete(c.dataset.d)
    : genDias.add(c.dataset.d);
  genPintarDias();
});

$g("genImgBtn")?.addEventListener("click", () => $g("genImgInput").click());
$g("genImgPrev")?.addEventListener("click", () => $g("genImgInput").click());
$g("genImgInput")?.addEventListener("change", (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  genFile = f;
  const prev = $g("genImgPrev");
  prev.textContent = "";
  prev.style.backgroundImage = `url(${URL.createObjectURL(f)})`;
});

$g("genLimpiar")?.addEventListener("click", genLimpiar);

$g("genCrear")?.addEventListener("click", async () => {
  if (genCreando) return;
  if (!TIENDA_REF) return genMsg("Aún cargando datos de la tienda", "error");

  const t = genTotales();
  const desc = $g("genDesc").value.trim();

  // Validaciones duras: el combo nunca puede salir peor que comprar suelto
  if (!t.valido) return genMsg(t.motivo, "error");
  if (t.piso > 0 && t.promo < t.piso)
    return genMsg("El precio queda por debajo de costo × 1.5", "error");
  if (!desc) return genMsg("Falta la descripción", "error");
  if (!genFile) return genMsg("Falta la imagen de la oferta", "error");
  if (Object.keys(ofertasCache).length >= maxOfertas())
    return genMsg(
      `Tu plan permite hasta ${maxOfertas()} ofertas. Elimina una para crear otra.`,
      "error",
    );
  if (
    t.sinCosto.length &&
    !confirm(
      `No hay costo registrado para: ${t.sinCosto.join(", ")}.\nNo puedo garantizar tu margen mínimo. ¿Crear igual?`,
    )
  )
    return;

  genCreando = true;
  const btn = $g("genCrear");
  btn.disabled = true;
  btn.textContent = "Creando...";
  genMsg("Subiendo imagen...");
  try {
    const key = String(Math.floor(Math.random() * 9000000) + 1000000);
    const comprimida = await comprimirImagen(
      await genLeerArchivo(genFile),
      1024,
      0.85,
    );
    const ref = storageRef(
      storage,
      `tiendas/${TIENDA_ID}/imagenes/promociones/${key}.jpg`,
    );
    await uploadBytes(ref, dataURLtoBlob(comprimida), {
      contentType: "image/jpeg",
    });
    const url = await getDownloadURL(ref);

    // OJO: aquí NO se guarda costo, ganancia ni margen. Este documento lo lee la
    // tienda pública y el cliente vería cuánto ganas. Solo se guarda lo que el cliente puede ver.
    const oferta = {
      imagen: url,
      descripcion: desc,
      precio: t.promo,
      combo: {
        items: [...genSel.values()].map((l) => {
          const x = genLinea(l);
          return {
            id: l.p.id,
            catId: l.p.catId,
            nombre: l.p.nombre,
            variante: x.etiqueta || null,
            seleccion: l.sel,
            precio: x.unit,
            qty: l.qty,
          };
        }),
        total: t.total, // precio por separado
        ahorro: t.ahorro, // lo que se ahorra el cliente
        descuento: Math.round(t.pct * 10) / 10,
      },
    };
    const dias = GEN_DIAS.map((x) => x[0]).filter((d) => genDias.has(d));
    if (dias.length) oferta.dias = dias;

    await updateDoc(TIENDA_REF, {
      [`img_tienda.lista_img.promociones.${key}`]: oferta,
    });
    mostrarToast("Oferta creada correctamente");
    genLimpiar();
    await cargarOfertas();
  } catch (err) {
    console.error(err);
    genMsg("Error al crear la oferta, intenta otra vez", "error");
  } finally {
    genCreando = false;
    btn.disabled = false;
    btn.textContent = "Crear oferta";
  }
});

genPintarDias();
genRefrescar();
