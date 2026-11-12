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
    if (Object.keys(diff).some((k) => k.startsWith("banner"))) cargarBanner();
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

// ══════════════ BANNERS (rotativos por día · cada uno con su configuración) ══════════════
// Estructura en Firestore (doc de la tienda):
//   banner.activo            → switch general (true/false)
//   banner.items.{id}        → { imagen, descripcion, precio, clickeable, tipo,
//                                 descuentoTipo, descuentoValor, soloSeguidores,
//                                 dias[], condiciones[], sugerencias[], caso }
// Si todavía existe el banner viejo (banner.imagen sin items) se muestra como
// "principal" y se migra solo cuando lo tocas.
const MAX_BANNERS = 7;
let bannerMap = {}; // id -> item
let bannerActivo = false;
let subiendoBanner = false;

const BANNER_CLICK_SUB = {
  producto:
    "Al tocar el banner se abrirá el carrito con este producto. Descripción y precio obligatorios.",
  descuento:
    "Al tocar el banner se abrirá el carrito con el descuento aplicado. Descripción y valor obligatorios.",
  envio_gratis:
    "Al tocar el banner se abrirá el carrito con el envío gratis aplicado. Descripción obligatoria.",
};
const BANNER_CAMPOS_LEGACY = [
  "descripcion",
  "precio",
  "clickeable",
  "tipo",
  "descuentoTipo",
  "descuentoValor",
  "soloSeguidores",
  "condiciones",
  "sugerencias",
  "caso",
];

const textoAdv = (id) => {
  const n = (bannerMap[id]?.condiciones || []).length;
  return `⚙️ Modo avanzado${n ? ` · ${n} grupo(s)` : ""}`;
};
function bannerRepintarAdv(id) {
  const b = document.querySelector(
    `.of-card[data-bid="${id}"] [data-role="adv"]`,
  );
  if (b) b.textContent = textoAdv(id);
}

// Pasa el banner viejo (campos sueltos) a banner.items.principal antes de escribir
async function asegurarMigrado(id) {
  const it = bannerMap[id];
  if (!it || !it._legacy) return;
  const { _legacy, ...limpio } = it;
  await updateDoc(TIENDA_REF, { [`banner.items.${id}`]: limpio });
  delete it._legacy;
}

async function cargarBanner(intento = 0) {
  if (!TIENDA_REF) return;
  let b = {};
  try {
    const snap = await getDoc(TIENDA_REF);
    b = snap.data()?.banner || {};
  } catch (err) {
    console.error("[banner] falló getDoc:", err.code, err.message);
    if (intento < 3)
      setTimeout(() => cargarBanner(intento + 1), 1000 * (intento + 1));
    return;
  }

  bannerActivo = b.activo === true;
  bannerMap = {};
  const items = b.items && typeof b.items === "object" ? b.items : {};
  Object.entries(items).forEach(([id, it]) => (bannerMap[id] = { ...it }));

  // Banner viejo sin migrar
  if (!Object.keys(bannerMap).length && b.imagen) {
    const leg = { imagen: b.imagen, _legacy: true };
    BANNER_CAMPOS_LEGACY.forEach((k) => {
      if (b[k] !== undefined && b[k] !== null) leg[k] = b[k];
    });
    bannerMap.principal = leg;
  }
  renderBanners();
}

function renderBanners() {
  const grid = document.getElementById("bannersGrid");
  if (!grid) return;
  grid.style.cssText =
    "display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:18px;margin-top:14px";
  grid.innerHTML = "";

  const ids = Object.keys(bannerMap);
  ids.forEach((id) => grid.appendChild(crearCardBanner(id)));

  const sw = document.getElementById("bannerActivoSwitch");
  if (sw) sw.checked = bannerActivo;
  const cont = document.getElementById("bannersContador");
  if (cont)
    cont.textContent = ids.length
      ? `${ids.length} de ${MAX_BANNERS} banners`
      : "Aún no tienes banners";

  if (ids.length < MAX_BANNERS) {
    const add = document.createElement("div");
    add.className = "of-add";
    add.id = "bannerAddCard";
    add.style.position = "relative";
    add.innerHTML = `📷<span>Agregar banner</span><small style="opacity:.6">${ids.length + 1} de ${MAX_BANNERS}</small>`;
    add.onclick = () => subirImagenBanner(null);
    grid.appendChild(add);
  }
}

function crearCardBanner(id) {
  const base = bannerMap[id];
  // Borrador editable (lo guardado vive en bannerMap[id])
  const st = {
    descripcion: base.descripcion || "",
    precio: Number(base.precio) > 0 ? Number(base.precio) : null,
    clickeable: base.clickeable === true,
    tipo: base.tipo || "producto",
    descuentoTipo: base.descuentoTipo || "porcentaje",
    descuentoValor:
      Number(base.descuentoValor) > 0 ? Number(base.descuentoValor) : null,
    soloSeguidores: base.soloSeguidores === true,
  };

  const card = document.createElement("div");
  card.className = "of-card";
  card.dataset.bid = id;
  const chip = (attr, val, label) =>
    `<div class="bn-tipo-chip" ${attr}="${val}" style="padding:6px 10px;font-size:11.5px">${label}</div>`;

  card.innerHTML = `
    <div class="of-img" data-role="img-wrap">
      <img alt="">
      <button type="button" class="of-edit" data-role="edit">📷 Cambiar</button>
      <button type="button" class="of-del" data-role="del" title="Eliminar banner">✕</button>
      <span class="of-price-tag" data-role="tag">Sin precio</span>
      <span class="of-price-tag" data-role="hoy" style="left:auto;right:10px;display:none">👁 Hoy</span>
    </div>
    <div class="of-body">
      <div class="of-dias" data-role="dias"></div>
      <div class="bn-tipo-row" data-role="tipo">
        ${chip("data-tipo", "producto", "🛍️ Producto")}${chip("data-tipo", "descuento", "🏷️ Descuento")}${chip("data-tipo", "envio_gratis", "🚚 Envío gratis")}
      </div>
      <textarea class="of-desc" data-role="desc" rows="2" maxlength="80" placeholder="Descripción (ej: Promo del día)"></textarea>
      <div class="of-price" data-role="box-precio">
        <span>S/</span>
        <input data-role="precio" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Precio">
      </div>
      <div data-role="box-desc" style="display:none;flex-direction:column;gap:8px">
        <div class="bn-mini-toggle" data-role="dt">
          ${chip("data-dt", "porcentaje", "% Porcentaje")}${chip("data-dt", "monto", "S/ Monto fijo")}
        </div>
        <div class="of-price" data-role="box-vdesc">
          <span data-role="unidad">%</span>
          <input data-role="vdesc" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Ej: 10">
        </div>
      </div>
      <div class="bn-click-row">
        <div>
          <p class="bn-click-title" style="font-size:12px">Banner clickeable</p>
          <p class="bn-click-sub" data-role="click-sub"></p>
        </div>
        <label class="switch"><input type="checkbox" data-role="click"><span class="slider"></span></label>
      </div>
      <div class="bn-click-row" data-role="seg-row" style="display:none">
        <div>
          <p class="bn-click-title" style="font-size:12px">Solo para seguidores</p>
          <p class="bn-click-sub">Solo quienes siguen tu negocio podrán usarlo.</p>
        </div>
        <label class="switch"><input type="checkbox" data-role="seg"><span class="slider"></span></label>
      </div>
      <button type="button" class="of-save" data-role="adv" style="display:none;background:rgba(255,255,255,.08);box-shadow:none"></button>
      <p class="of-msg" data-role="msg"></p>
      <button type="button" class="of-save" data-role="save" disabled>Guardar</button>
    </div>`;

  const $ = (r) => card.querySelector(`[data-role="${r}"]`);
  const imgEl = card.querySelector("img");
  const desc = $("desc"),
    precio = $("precio"),
    vdesc = $("vdesc"),
    msg = $("msg"),
    btn = $("save"),
    tag = $("tag");

  if (base.imagen) imgEl.src = conVersion(base.imagen);
  desc.value = st.descripcion;
  precio.value = st.precio ?? "";
  vdesc.value = st.descuentoValor ?? "";
  $("click").checked = st.clickeable;
  $("seg").checked = st.soloSeguidores;

  const num = (inp) => {
    const n = parseFloat(String(inp.value).replace(",", "."));
    return n > 0 ? n : null;
  };
  const setMsg = (t, tipo = "") => {
    msg.textContent = t;
    msg.className = "of-msg" + (tipo ? " " + tipo : "");
  };

  // Item que se guardaría con el borrador actual (conserva imagen, días y avanzado)
  const construir = () => {
    const g = bannerMap[id] || {};
    const item = {
      imagen: g.imagen,
      clickeable: st.clickeable,
      tipo: st.tipo,
    };
    const d = st.descripcion.trim();
    if (d) item.descripcion = d;
    if (st.tipo === "producto") {
      if (st.precio) item.precio = st.precio;
      if (g.condiciones?.length) item.condiciones = g.condiciones;
      if (g.sugerencias?.length) item.sugerencias = g.sugerencias;
      if (g.caso) item.caso = g.caso;
    }
    if (st.tipo === "descuento") {
      item.descuentoTipo = st.descuentoTipo;
      if (st.descuentoValor) item.descuentoValor = st.descuentoValor;
    }
    if (st.clickeable && st.soloSeguidores) item.soloSeguidores = true;
    if (g.dias?.length) item.dias = g.dias;
    return item;
  };
  const canon = (it) => {
    const t = it.tipo || "producto";
    return JSON.stringify([
      (it.descripcion || "").trim(),
      t === "producto" ? Number(it.precio) || 0 : 0,
      it.clickeable === true,
      t,
      t === "descuento" ? it.descuentoTipo || "porcentaje" : "",
      t === "descuento" ? Number(it.descuentoValor) || 0 : 0,
      it.clickeable === true && it.soloSeguidores === true,
    ]);
  };
  const hayCambios = () => canon(construir()) !== canon(bannerMap[id] || {});

  const pintarDias = () => {
    const it = bannerMap[id] || {};
    const sel = it.dias || [];
    $("dias").innerHTML =
      `<span class="of-dias-lbl">${sel.length ? "Se muestra estos días:" : "Se muestra todos los días"}</span>` +
      GEN_DIAS.map(
        ([d, l]) =>
          `<span class="of-dia ${sel.includes(d) ? "on" : ""}" data-dia="${d}">${l}</span>`,
      ).join("");
    $("hoy").style.display = ofertaCoincide(it, "hoy") ? "" : "none";
  };

  const pintar = () => {
    card
      .querySelectorAll("[data-tipo]")
      .forEach((c) => c.classList.toggle("active", c.dataset.tipo === st.tipo));
    card
      .querySelectorAll("[data-dt]")
      .forEach((c) =>
        c.classList.toggle("active", c.dataset.dt === st.descuentoTipo),
      );
    const esProd = st.tipo === "producto";
    const esDesc = st.tipo === "descuento";
    $("box-precio").style.display = esProd ? "" : "none";
    $("box-desc").style.display = esDesc ? "flex" : "none";
    $("unidad").textContent = st.descuentoTipo === "porcentaje" ? "%" : "S/";
    $("click-sub").textContent =
      BANNER_CLICK_SUB[st.tipo] || BANNER_CLICK_SUB.producto;
    $("seg-row").style.display = st.clickeable ? "" : "none";
    const adv = $("adv");
    adv.style.display = st.clickeable && esProd ? "" : "none";
    adv.textContent = textoAdv(id);

    const ob = st.clickeable;
    const faltan = [];
    if (ob && !st.descripcion.trim()) faltan.push("descripción");
    if (ob && esProd && !st.precio) faltan.push("precio");
    if (ob && esDesc && !st.descuentoValor) faltan.push("valor del descuento");
    desc.classList.toggle("error", faltan.includes("descripción"));
    $("box-precio").classList.toggle("error", faltan.includes("precio"));
    $("box-vdesc").classList.toggle(
      "error",
      faltan.includes("valor del descuento"),
    );
    btn.disabled = faltan.length > 0;
    card.classList.toggle("falta-precio", faltan.length > 0);
    card.classList.toggle("dirty", !faltan.length && hayCambios());
    if (faltan.length)
      setMsg(`Falta ${faltan.join(" y ")} para que sea clickeable`, "error");
    else if (msg.classList.contains("error")) setMsg("");

    // etiqueta sobre la imagen
    if (esProd) {
      tag.textContent = st.precio ? "S/ " + st.precio.toFixed(2) : "Sin precio";
      tag.classList.toggle("vacio", !st.precio && ob);
    } else if (esDesc) {
      tag.textContent = st.descuentoValor
        ? st.descuentoTipo === "porcentaje"
          ? `-${st.descuentoValor}%`
          : `-S/ ${st.descuentoValor.toFixed(2)}`
        : "Sin valor";
      tag.classList.toggle("vacio", !st.descuentoValor && ob);
    } else {
      tag.textContent = "🚚 Envío gratis";
      tag.classList.remove("vacio");
    }
  };

  pintarDias();
  pintar();

  // ── Eventos ──
  $("tipo").addEventListener("click", (e) => {
    const c = e.target.closest("[data-tipo]");
    if (!c) return;
    st.tipo = c.dataset.tipo;
    pintar();
  });
  $("dt").addEventListener("click", (e) => {
    const c = e.target.closest("[data-dt]");
    if (!c) return;
    st.descuentoTipo = c.dataset.dt;
    pintar();
  });
  desc.addEventListener("input", () => {
    st.descripcion = desc.value;
    pintar();
  });
  precio.addEventListener("input", () => {
    st.precio = num(precio);
    pintar();
  });
  vdesc.addEventListener("input", () => {
    st.descuentoValor = num(vdesc);
    pintar();
  });
  $("click").addEventListener("change", (e) => {
    st.clickeable = e.target.checked;
    pintar();
  });
  $("seg").addEventListener("change", (e) => {
    st.soloSeguidores = e.target.checked;
    pintar();
  });
  $("adv").addEventListener("click", () =>
    abrirEditorAvanzadoOferta("__banner__:" + id),
  );

  // Días: se guardan al tocar (igual que en ofertas)
  $("dias").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-dia]");
    if (!b) return;
    const set = new Set(bannerMap[id]?.dias || []);
    set.has(b.dataset.dia) ? set.delete(b.dataset.dia) : set.add(b.dataset.dia);
    const arr = GEN_DIAS.map((x) => x[0]).filter((x) => set.has(x));
    try {
      await asegurarMigrado(id);
      await updateDoc(TIENDA_REF, {
        [`banner.items.${id}.dias`]: arr.length ? arr : deleteField(),
      });
      if (arr.length) bannerMap[id].dias = arr;
      else delete bannerMap[id].dias;
      pintarDias();
    } catch (err) {
      console.error(err);
      mostrarToast("No se pudo cambiar los días");
    }
  });

  btn.addEventListener("click", async () => {
    if (!TIENDA_REF) {
      setMsg("Aún cargando datos de la tienda, espera un momento", "error");
      return;
    }
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
      await asegurarMigrado(id);
      const item = construir();
      await updateDoc(TIENDA_REF, { [`banner.items.${id}`]: item });
      bannerMap[id] = item;
      setMsg("Cambios guardados", "ok");
      setTimeout(() => {
        if (msg.classList.contains("ok")) setMsg("");
      }, 1500);
      mostrarToast("Banner actualizado correctamente");
    } catch (err) {
      console.error(err);
      setMsg("Error al guardar, intenta otra vez", "error");
    } finally {
      btn.textContent = "Guardar";
      pintar();
    }
  });

  $("img-wrap").addEventListener("click", (e) => {
    if (e.target.closest('[data-role="del"]') || e.target.closest('[data-role="edit"]'))
      return;
    abrirVisor(imgEl.src);
  });
  $("edit").addEventListener("click", (e) => {
    e.stopPropagation();
    subirImagenBanner(id);
  });
  $("del").addEventListener("click", (e) => {
    e.stopPropagation();
    eliminarBanner(id);
  });

  return card;
}

function subirImagenBanner(oldId) {
  if (subiendoBanner) return;
  if (!oldId && Object.keys(bannerMap).length >= MAX_BANNERS) {
    alert(`Puedes tener hasta ${MAX_BANNERS} banners`);
    return;
  }
  if (!TIENDA_REF) {
    alert("Aún cargando datos de la tienda, intenta en un momento");
    return;
  }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (
      !confirm(
        oldId ? "¿Reemplazar la imagen de este banner?" : "¿Agregar este banner?",
      )
    )
      return;

    subiendoBanner = true;
    const host = oldId
      ? document.querySelector(`.of-card[data-bid="${oldId}"] .of-img`)
      : document.getElementById("bannerAddCard");
    const ov = document.createElement("div");
    ov.className = "of-img-loading";
    ov.innerHTML = `<div class="of-spinner"></div><span>Subiendo imagen...</span>`;
    host?.appendChild(ov);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const id =
          oldId || String(Math.floor(Math.random() * 9000000) + 1000000);
        // Si todavía existe el banner viejo, se migra antes de crear otro
        await asegurarMigrado(oldId || "principal");
        const comprimida = await comprimirImagen(ev.target.result, 1280, 0.85);
        const blob = dataURLtoBlob(comprimida);
        const nombre = id === "principal" ? "banner" : id;
        const ref = storageRef(
          storage,
          `tiendas/${TIENDA_ID}/banner/${nombre}.jpg`,
        );
        await uploadBytes(ref, blob, { contentType: "image/jpeg" });
        const url = await getDownloadURL(ref);
        if (oldId) {
          await updateDoc(TIENDA_REF, {
            [`banner.items.${id}.imagen`]: url,
          });
        } else {
          await updateDoc(TIENDA_REF, {
            [`banner.items.${id}`]: {
              imagen: url,
              clickeable: false,
              tipo: "producto",
            },
            "banner.activo": true,
          });
        }
        mostrarToast("La imagen se subió correctamente");
        await cargarBanner();
      } catch (err) {
        console.error(err);
        alert("Error al subir el banner");
      } finally {
        subiendoBanner = false;
        ov.remove();
      }
    };
    reader.onerror = () => {
      subiendoBanner = false;
      ov.remove();
      alert("No se pudo leer la imagen");
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

async function eliminarBanner(id) {
  if (!TIENDA_REF) return;
  if (!confirm("¿Eliminar este banner por completo?")) return;
  try {
    const nombre = id === "principal" ? "banner" : id;
    for (const ext of ["jpg", "webp"]) {
      try {
        await deleteObject(
          storageRef(storage, `tiendas/${TIENDA_ID}/banner/${nombre}.${ext}`),
        );
      } catch {}
    }
    const cambios = { [`banner.items.${id}`]: deleteField() };
    // Si era el último, se limpia también el banner viejo para que no reaparezca
    if (Object.keys(bannerMap).length <= 1) {
      ["imagen", ...BANNER_CAMPOS_LEGACY].forEach(
        (k) => (cambios[`banner.${k}`] = deleteField()),
      );
    }
    await updateDoc(TIENDA_REF, cambios);
    delete bannerMap[id];
    renderBanners();
    mostrarToast("Banner eliminado");
  } catch (err) {
    console.error(err);
    alert("Error al eliminar el banner");
  }
}

// Switch general: mostrar / ocultar todos los banners
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
      bannerActivo = nuevo;
    } catch (err) {
      console.error(err);
      sw.checked = !nuevo;
      alert("No se pudo cambiar el estado de los banners");
    }
  });

// ══════════════ OFERTAS ══════════════
let ofertasCache = {};
const maxOfertas = () => window.GEINZ_PLAN?.maxOfertas ?? 50;
let subiendoOferta = false;
let ofFiltro = "todas"; // "todas" | "hoy" | "lunes" ... "domingo"

function diaHoyLima() {
  const en = new Date()
    .toLocaleDateString("en-US", { timeZone: "America/Lima", weekday: "long" })
    .toLowerCase();
  return {
    monday: "lunes",
    tuesday: "martes",
    wednesday: "miercoles",
    thursday: "jueves",
    friday: "viernes",
    saturday: "sabado",
    sunday: "domingo",
  }[en];
}

// Sin días marcados = se muestra todos los días, así que entra en cualquier filtro
function ofertaCoincide(item, filtro) {
  if (filtro === "todas") return true;
  const dias = item.dias || [];
  const d = filtro === "hoy" ? diaHoyLima() : filtro;
  return !dias.length || dias.includes(d);
}

function pintarFiltrosOfertas() {
  const box = document.getElementById("ofFiltros");
  if (!box) return;
  box.innerHTML = [["todas", "Todas"], ["hoy", "Activas hoy"], ...GEN_DIAS]
    .map(
      ([v, l]) =>
        `<div class="bn-tipo-chip ${ofFiltro === v ? "active" : ""}" data-f="${v}">${l}</div>`,
    )
    .join("");
}

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

  const visibles = entries.filter(([, v]) =>
    ofertaCoincide(normalizarOferta(v), ofFiltro),
  );

  visibles.forEach(([key, val]) => {
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
                     
              <div class="of-dias" data-role="esp"></div>
        <button type="button" class="of-save" data-role="adv" style="margin:6px 0;background:rgba(255,255,255,.08);box-shadow:none;">⚙️ Modo avanzado${(item.condiciones || []).length ? ` · ${item.condiciones.length} grupo(s)` : ""}</button>
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
    // ── Destacar en día especial + Delivery gratis ──
    const espBox = card.querySelector('[data-role="esp"]');
    const pintarEsp = () => {
      const o = normalizarOferta(ofertasCache[key]);
      espBox.innerHTML =
        `<span class="of-dia ${o.destacarEspecial === true ? "on" : ""}" data-esp="1" style="padding:5px 10px">⭐ Destacar en día especial</span>` +
        `<span class="of-dia ${o.deliveryGratis === true ? "on" : ""}" data-del="1" style="padding:5px 10px">🚚 Delivery gratis</span>`;
    };
    pintarEsp();
    espBox.addEventListener("click", async (e) => {
      const chip = e.target.closest("[data-esp],[data-del]");
      if (!chip) return;
      const campo = chip.dataset.del ? "deliveryGratis" : "destacarEspecial";
      const actual = normalizarOferta(ofertasCache[key]);
      const nuevoValor = !(actual[campo] === true);
      try {
        await updateDoc(TIENDA_REF, {
          [`img_tienda.lista_img.promociones.${key}.${campo}`]: nuevoValor
            ? true
            : deleteField(),
        });
        const nuevo = { ...actual };
        if (nuevoValor) nuevo[campo] = true;
        else delete nuevo[campo];
        ofertasCache[key] = nuevo;
        pintarEsp();
        mostrarToast(
          campo === "deliveryGratis"
            ? nuevoValor
              ? "Delivery gratis activado"
              : "Delivery gratis desactivado"
            : nuevoValor
              ? "Se destacará en tu día especial"
              : "Ya no se destacará",
        );
      } catch (err) {
        console.error(err);
        mostrarToast("No se pudo cambiar");
      }
    });
    card
      .querySelector('[data-role="adv"]')
      .addEventListener("click", () => abrirEditorAvanzadoOferta(key));
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

  const cont = document.getElementById("ofContador");
  if (cont)
    cont.textContent = !entries.length
      ? ""
      : visibles.length
        ? `Mostrando ${visibles.length} de ${entries.length}`
        : "No hay ofertas para este filtro";

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
let genDelivery = false;
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
  genDelivery = false;
  genFile = null;
  genDescEditada = false;
  $g("genValor").value = "";
  $g("genDesc").value = "";
  const prev = $g("genImgPrev");
  prev.style.backgroundImage = "";
  prev.textContent = "📷 Tu imagen";
  genPintarDias();
  genPintarDelivery();
  genRefrescar();
  genMsg("");
}

function genPintarDelivery() {
  let box = $g("genDeliveryRow");
  if (!box) {
    box = document.createElement("div");
    box.id = "genDeliveryRow";
    box.className = "gen-chips";
    box.style.marginTop = "8px";
    $g("genDias").insertAdjacentElement("afterend", box);
    box.addEventListener("click", () => {
      genDelivery = !genDelivery;
      genPintarDelivery();
    });
  }
  box.innerHTML = `<div class="bn-tipo-chip ${genDelivery ? "active" : ""}">🚚 Delivery gratis con este combo</div>`;
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
    if (genDelivery) oferta.deliveryGratis = true;

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
genPintarDelivery();
genRefrescar();

pintarFiltrosOfertas();
document.getElementById("ofFiltros")?.addEventListener("click", (e) => {
  const c = e.target.closest("[data-f]");
  if (!c) return;
  ofFiltro = c.dataset.f;
  pintarFiltrosOfertas();
  renderOfertas(ofertasCache);
});

// ══════════════ MODO AVANZADO DE OFERTA / BANNER (variantes tipo producto) ══════════════
const VA_CSS = `
.va-ov{position:fixed;inset:0;z-index:10000;background:rgba(3,3,6,.8);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:14px;}
.va-box{width:100%;max-width:560px;max-height:92vh;display:flex;flex-direction:column;background:#0d0a17;border:1px solid rgba(139,92,246,.35);border-radius:22px;color:#e9e5ff;overflow:hidden;}
.va-head{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid rgba(139,92,246,.2);font-size:15px;}
.va-head button{background:none;border:none;color:#a78bfa;font-size:16px;cursor:pointer;}
.va-body{padding:16px 18px;overflow-y:auto;flex:1;}
.va-foot{padding:12px 18px;border-top:1px solid rgba(139,92,246,.2);display:flex;align-items:center;gap:10px;}
.va-msg{flex:1;margin:0;font-size:12px;color:#fb7185;}
.va-save{padding:10px 22px;border:none;border-radius:12px;background:#7c3aed;color:#fff;font-weight:700;cursor:pointer;}
.va-save:disabled{opacity:.5;}
.va-lbl{display:block;margin:10px 0 4px;font-size:11px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:.05em;}
.va-sec{margin:18px 0 8px;font-size:13px;font-weight:800;color:#fff;}
.va-in{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:10px;background:#05040a;border:1px solid rgba(139,92,246,.3);color:#fff;font-size:13px;outline:none;}
.va-in:focus{border-color:#8b5cf6;}
.va-xs{width:74px;flex:0 0 74px;}
.va-sm{width:auto;flex:0 0 auto;}
.va-grp{padding:12px;margin-bottom:12px;border-radius:16px;background:#05040a;border:1px solid rgba(139,92,246,.25);}
.va-op{margin-top:8px;padding-top:8px;border-top:1px dashed rgba(139,92,246,.18);}
.va-row{display:flex;align-items:center;gap:6px;margin-bottom:6px;}
.va-wrap{flex-wrap:wrap;}
.va-desc{margin-top:2px;font-size:11.5px;}
.va-chk{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:#cfc8ff;cursor:pointer;}
.va-x{flex:0 0 auto;width:30px;height:30px;border:none;border-radius:8px;background:rgba(225,29,72,.2);color:#fb7185;cursor:pointer;}
.va-add{margin-top:8px;padding:8px 12px;border:1px dashed rgba(139,92,246,.5);border-radius:10px;background:none;color:#c4b5fd;font-size:12px;font-weight:700;cursor:pointer;}
.va-body[data-caso="mayus"] input.va-in{text-transform:uppercase;}
.va-body[data-caso="minus"] input.va-in{text-transform:lowercase;}
.va-body input.va-in::placeholder{text-transform:none;}
.va-mv{flex:0 0 auto;width:30px;height:30px;border:none;border-radius:8px;background:rgba(139,92,246,.2);color:#c4b5fd;cursor:pointer;}
.va-mv:disabled{opacity:.25;cursor:default;}
`;

// key: id de la oferta, o "__banner__:{idBanner}" para un banner
function abrirEditorAvanzadoOferta(key) {
  if (!document.getElementById("vaStyle")) {
    const s = document.createElement("style");
    s.id = "vaStyle";
    s.textContent = VA_CSS;
    document.head.appendChild(s);
  }
  const esBanner = String(key).startsWith("__banner__:");
  const bannerId = esBanner ? String(key).split(":")[1] : null;
  const actual = esBanner
    ? { ...(bannerMap[bannerId] || {}) }
    : normalizarOferta(ofertasCache[key]);
  const st = {
    nombre: actual.nombre || "",
    caso: actual.caso || "tal_cual",
    stock: typeof actual.stock === "number" ? actual.stock : "",
    condiciones: JSON.parse(JSON.stringify(actual.condiciones || [])),
    sugerencias: [...(actual.sugerencias || [])],
  };
  const ov = document.createElement("div");
  ov.className = "va-ov";
  ov.innerHTML = `
    <div class="va-box">
      <div class="va-head"><b>⚙️ Modo avanzado ${esBanner ? "del banner" : "de la oferta"}</b><button type="button" data-a="close">✕</button></div>
      <div class="va-body"></div>
      <div class="va-foot"><p class="va-msg"></p><button type="button" class="va-save" data-a="save">Guardar</button></div>
    </div>`;
  const body = ov.querySelector(".va-body");
  const msg = ov.querySelector(".va-msg");

  const nuevaOpcion = () => ({
    nombre: "",
    descripcion: "",
    activo: true,
    exclusiva: false,
    costoAdicional: 0,
    stock: null,
  });
  const nuevoGrupo = () => ({
    nombre: "",
    tipo: "unica",
    obligatoria: true,
    conCantidad: false,
    max: null,
    opciones: [nuevaOpcion()],
  });

  const pintar = () => {
    const cats = new Map();
    genProductos.forEach((p) => cats.set(p.catId, p.cat));
    const sugHtml = `
      <div class="va-grp" style="margin-top:14px">
        <p class="va-sec" style="margin-top:0">También puedes agregar</p>
        <p style="font-size:11.5px;color:#a78bfa;margin:0 0 8px">Al agregar ${esBanner ? "este banner" : "esta oferta"}, el cliente verá productos de estas secciones.</p>
        <div class="va-row va-wrap">
          ${
            cats.size
              ? [...cats.entries()]
                  .map(
                    ([id, nombre]) =>
                      `<label class="va-chk"><input type="checkbox" data-f="sug" data-cat="${gEsc(id)}" ${st.sugerencias.includes(id) ? "checked" : ""}> ${gEsc(nombre)}</label>`,
                  )
                  .join("")
              : `<span style="font-size:11.5px;color:#a78bfa">Aún no se cargaron tus secciones.</span>`
          }
        </div>
      </div>`;
    body.dataset.caso = st.caso;
    body.innerHTML = `
      ${
        esBanner
          ? ""
          : `
      <label class="va-lbl">Nombre del combo</label>
      <input class="va-in" data-f="nombre" maxlength="80" value="${gEsc(st.nombre)}" placeholder="Ej. Combo Urbano Taquero">
      <label class="va-lbl">Stock (vacío = sin control)</label>
      <input class="va-in" data-f="stock" type="number" min="0" step="1" value="${gEsc(st.stock)}" placeholder="Sin control">`
      }
      <p class="va-sec">Opciones que elige el cliente (gaseosa, sabor, extras…)</p>
      <label class="va-lbl">Formato del texto</label>
<div class="va-row va-wrap">
  <label class="va-chk"><input type="radio" name="va-caso" data-f="caso" value="tal_cual" ${st.caso === "tal_cual" ? "checked" : ""}> Tal como lo escribo</label>
  <label class="va-chk"><input type="radio" name="va-caso" data-f="caso" value="mayus" ${st.caso === "mayus" ? "checked" : ""}> MAYÚSCULAS</label>
  <label class="va-chk"><input type="radio" name="va-caso" data-f="caso" value="minus" ${st.caso === "minus" ? "checked" : ""}> minúsculas</label>
</div>
      ${st.condiciones
        .map((c, ci) => {
          const multi = c.tipo === "multiple";
          return `
        <div class="va-grp" data-ci="${ci}">
                   <div class="va-row">
            <input class="va-in" data-f="cnombre" maxlength="30" placeholder="Ej. Gaseosa" value="${gEsc(c.nombre)}">
            <button type="button" class="va-mv" data-a="upgrp" title="Subir" ${ci === 0 ? "disabled" : ""}>▲</button>
            <button type="button" class="va-mv" data-a="downgrp" title="Bajar" ${ci === st.condiciones.length - 1 ? "disabled" : ""}>▼</button>
            <button type="button" class="va-x" data-a="delgrp" title="Eliminar grupo">🗑</button>
          </div>
          <div class="va-row va-wrap">
            <select class="va-in va-sm" data-f="ctipo">
              <option value="unica" ${!multi ? "selected" : ""}>Elegir 1 sola</option>
              <option value="multiple" ${multi ? "selected" : ""}>Elegir varias</option>
            </select>
            <label class="va-chk"><input type="checkbox" data-f="cobl" ${c.obligatoria !== false ? "checked" : ""}> Obligatorio</label>
            ${
              multi
                ? `<label class="va-chk"><input type="checkbox" data-f="ccant" ${c.conCantidad ? "checked" : ""}> Con cantidad (+/−)</label>
            <input class="va-in va-xs" type="number" min="1" step="1" data-f="cmax" placeholder="Máx." value="${c.max || ""}">`
                : ""
            }
          </div>
          ${c.opciones
            .map(
              (o, oi) => `
            <div class="va-op" data-oi="${oi}">
              <div class="va-row">
                <input class="va-in" data-f="onombre" maxlength="30" placeholder="Ej. Inca Kola" value="${gEsc(o.nombre)}">
                <input class="va-in va-xs" type="number" step="0.10" min="0" data-f="ocosto" placeholder="+S/" title="Costo extra" value="${o.costoAdicional || ""}">
                <input class="va-in va-xs" type="number" step="1" min="0" data-f="ostock" placeholder="Stock" value="${typeof o.stock === "number" ? o.stock : ""}">
                <input type="checkbox" data-f="oact" title="Disponible" ${o.activo !== false ? "checked" : ""}>
                <button type="button" class="va-x" data-a="delop">✕</button>
              </div>
              <input class="va-in va-desc" data-f="odesc" maxlength="120" placeholder="Qué incluye (opcional)" value="${gEsc(o.descripcion || "")}">
              ${multi ? `<label class="va-chk" style="margin-top:4px"><input type="checkbox" data-f="oexc" ${o.exclusiva ? "checked" : ""}> Excluyente (desactiva las demás)</label>` : ""}
            </div>`,
            )
            .join("")}
          <button type="button" class="va-add" data-a="addop">+ Agregar opción</button>
        </div>`;
        })
        .join("")}
           <button type="button" class="va-add" data-a="addgrp">+ Agregar grupo de opciones</button>
      ${sugHtml}`;
  };
  pintar();

  const onEdit = (e) => {
    const t = e.target;
    const f = t.dataset.f;
    if (!f) return;
    const g = st.condiciones[+t.closest("[data-ci]")?.dataset.ci];
    const o = g?.opciones[+t.closest("[data-oi]")?.dataset.oi];
    if (f === "sug") {
      const id = t.dataset.cat;
      st.sugerencias = t.checked
        ? [...new Set([...st.sugerencias, id])]
        : st.sugerencias.filter((x) => x !== id);
      return;
    }
    if (f === "caso") {
      st.caso = t.value;
      body.dataset.caso = st.caso;
      return;
    }
    if (f === "nombre") st.nombre = t.value;
    else if (f === "stock") st.stock = t.value;
    else if (f === "cnombre") g.nombre = t.value;
    else if (f === "ctipo") {
      if (e.type !== "change") return;
      g.tipo = t.value;
      if (g.tipo !== "multiple") {
        g.conCantidad = false;
        g.max = null;
        g.opciones.forEach((x) => (x.exclusiva = false));
      }
      pintar();
    } else if (f === "cobl") g.obligatoria = t.checked;
    else if (f === "ccant") g.conCantidad = t.checked;
    else if (f === "cmax")
      g.max = parseInt(t.value, 10) > 0 ? parseInt(t.value, 10) : null;
    else if (f === "onombre") o.nombre = t.value;
    else if (f === "ocosto") o.costoAdicional = parseFloat(t.value) || 0;
    else if (f === "ostock")
      o.stock = t.value === "" ? null : Math.max(0, parseInt(t.value, 10) || 0);
    else if (f === "oact") o.activo = t.checked;
    else if (f === "odesc") o.descripcion = t.value;
    else if (f === "oexc") o.exclusiva = t.checked;
  };
  body.addEventListener("input", onEdit);
  body.addEventListener("change", onEdit);

  ov.addEventListener("click", async (e) => {
    if (e.target === ov) return ov.remove();
    const b = e.target.closest("[data-a]");
    if (!b) return;
    const a = b.dataset.a;
    const ci = +b.closest("[data-ci]")?.dataset.ci;
    const oi = +b.closest("[data-oi]")?.dataset.oi;
    if (a === "close") return ov.remove();
    if (a === "addgrp") {
      st.condiciones.push(nuevoGrupo());
      return pintar();
    }
    if (a === "delgrp") {
      st.condiciones.splice(ci, 1);
      return pintar();
    }
    if (a === "upgrp" && ci > 0) {
      [st.condiciones[ci - 1], st.condiciones[ci]] = [
        st.condiciones[ci],
        st.condiciones[ci - 1],
      ];
      const sc = body.scrollTop;
      pintar();
      body.scrollTop = sc;
      return;
    }
    if (a === "downgrp" && ci < st.condiciones.length - 1) {
      [st.condiciones[ci + 1], st.condiciones[ci]] = [
        st.condiciones[ci],
        st.condiciones[ci + 1],
      ];
      const sc = body.scrollTop;
      pintar();
      body.scrollTop = sc;
      return;
    }
    if (a === "addop") {
      st.condiciones[ci].opciones.push(nuevaOpcion());
      return pintar();
    }
    if (a === "delop") {
      st.condiciones[ci].opciones.splice(oi, 1);
      return pintar();
    }

    if (a === "save") {
      const aplicarCaso = (s) =>
        st.caso === "mayus"
          ? String(s).toLocaleUpperCase("es")
          : st.caso === "minus"
            ? String(s).toLocaleLowerCase("es")
            : String(s);
      const conds = st.condiciones
        .filter((c) => c.nombre.trim())
        .map((c) => {
          const multi = c.tipo === "multiple";
          return {
            nombre: aplicarCaso(c.nombre.trim()),
            tipo: multi ? "multiple" : "unica",
            obligatoria: c.obligatoria !== false,
            conCantidad: multi && c.conCantidad === true,
            max: multi && Number(c.max) > 0 ? Math.floor(Number(c.max)) : null,
            opciones: c.opciones
              .filter((o) => o.nombre.trim())
              .map((o) => ({
                nombre: aplicarCaso(o.nombre.trim()),
                descripcion: aplicarCaso(
                  String(o.descripcion || "").trim(),
                ).slice(0, 120),
                activo: o.activo !== false,
                exclusiva: multi && o.exclusiva === true,
                costoAdicional: +(parseFloat(o.costoAdicional) || 0).toFixed(2),
                stock: typeof o.stock === "number" ? o.stock : null,
              })),
          };
        })
        .filter((c) => c.opciones.length);

      const sinOpciones = st.condiciones.find(
        (c) => c.nombre.trim() && !c.opciones.some((o) => o.nombre.trim()),
      );
      if (sinOpciones) {
        msg.textContent = `"${sinOpciones.nombre}" necesita al menos una opción`;
        return;
      }

      const nuevo = { ...actual };
      if (esBanner) {
        b.disabled = true;
        b.textContent = "Guardando...";
        try {
          await asegurarMigrado(bannerId);
          const P = `banner.items.${bannerId}`;
          await updateDoc(TIENDA_REF, {
            [`${P}.condiciones`]: conds.length ? conds : deleteField(),
            [`${P}.sugerencias`]: st.sugerencias.length
              ? st.sugerencias
              : deleteField(),
            [`${P}.caso`]: st.caso !== "tal_cual" ? st.caso : deleteField(),
          });
          const it = bannerMap[bannerId] || {};
          if (conds.length) it.condiciones = conds;
          else delete it.condiciones;
          if (st.sugerencias.length) it.sugerencias = st.sugerencias;
          else delete it.sugerencias;
          if (st.caso !== "tal_cual") it.caso = st.caso;
          else delete it.caso;
          bannerMap[bannerId] = it;
          bannerRepintarAdv(bannerId);
          mostrarToast("Opciones del banner guardadas");
          ov.remove();
        } catch (err) {
          console.error(err);
          msg.textContent = "Error al guardar, intenta otra vez";
          b.disabled = false;
          b.textContent = "Guardar";
        }
        return;
      }
      const nombre = aplicarCaso(st.nombre.trim());
      if (nombre) nuevo.nombre = nombre;
      else delete nuevo.nombre;
      if (st.caso !== "tal_cual") nuevo.caso = st.caso;
      else delete nuevo.caso;
      if (st.stock !== "" && st.stock !== null)
        nuevo.stock = Math.max(0, parseInt(st.stock, 10) || 0);
      else delete nuevo.stock;
      if (conds.length) nuevo.condiciones = conds;
      else delete nuevo.condiciones;
      if (st.sugerencias.length) nuevo.sugerencias = st.sugerencias;
      else delete nuevo.sugerencias;

      b.disabled = true;
      b.textContent = "Guardando...";
      try {
        await updateDoc(TIENDA_REF, {
          [`img_tienda.lista_img.promociones.${key}`]: nuevo,
        });
        ofertasCache[key] = nuevo;
        const btnAdv = document.querySelector(
          `.of-card[data-key="${key}"] [data-role="adv"]`,
        );
        if (btnAdv)
          btnAdv.textContent = `⚙️ Modo avanzado${conds.length ? ` · ${conds.length} grupo(s)` : ""}`;
        mostrarToast("Opciones de la oferta guardadas");
        ov.remove();
      } catch (err) {
        console.error(err);
        msg.textContent = "Error al guardar, intenta otra vez";
        b.disabled = false;
        b.textContent = "Guardar";
      }
    }
  });
  document.body.appendChild(ov);
}