import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  onSnapshot,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
  authDomain: "geinzworkapp.firebaseapp.com",
  projectId: "geinzworkapp",
  storageBucket: "geinzworkapp.firebasestorage.app",
  messagingSenderId: "921389328767",
  appId: "1:921389328767:web:dc6fffc43a51444f5b524a",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const TIENDA_ID = "fW7W8RsgkkQ3IYfxKHGR";
const TIENDA_REF = doc(db, "Tiendas", "barranca", "barranca", TIENDA_ID);

let currentData = {};
let saveTimer, _saveTimeout;
let _firstLoad = true;
let selectedCat = "",
  selectedSubcat = "";

// ─────────────────────────────────────────────
//  FIRESTORE TIEMPO REAL
// ─────────────────────────────────────────────
function initRealtime() {
  document.querySelector(".app").classList.add("loading-data");

  onSnapshot(
    TIENDA_REF,
    (snap) => {
      if (!snap.exists()) {
        showToast("⚠️ Documento no encontrado");
        return;
      }
      currentData = snap.data();
      populateUI(currentData);
      if (_firstLoad) {
        _firstLoad = false;
        document.querySelector(".app").classList.remove("loading-data");
        const sk = document.getElementById("skeletonOverlay");
        if (sk) {
          sk.classList.add("hidden");
          setTimeout(() => sk.remove(), 450);
        }
      }
      console.log("📦 Todos los campos:", Object.keys(currentData));
      console.log("🖼️ logo_tienda:", currentData.logo_tienda);
      console.log("📍 Path:", TIENDA_REF.path);
    },
    (err) => {
      console.error(err);
      showToast("Error al conectar con Firestore");
      document.querySelector(".app").classList.remove("loading-data");
    },
  );
}

// ─────────────────────────────────────────────
//  FUNCIONES PARA SWITCHES (CORREGIDAS)
// ─────────────────────────────────────────────
function setSwitchAuto(switchId, isEnabled) {
  const switchElement = document.querySelector(
    `input[data-method="${switchId}"]`,
  );
  if (switchElement) {
    switchElement.checked = isEnabled === true;
  }
}

async function togglePayMethod(method, enabled) {
  try {
    await updateDoc(TIENDA_REF, {
      [`metodos_pago.${method}.enable`]: enabled,
    });
    showToast(
      `${method.toUpperCase()} ${enabled ? "activado" : "desactivado"}`,
    );
    showSaveFab();
  } catch (e) {
    console.error("Error togglePayMethod:", e);
    showToast("Error al actualizar método de pago");
  }
}

// ─────────────────────────────────────────────
//  POBLAR UI
// ─────────────────────────────────────────────
function populateUI(data) {
  setField("businessName", data.nombre_tienda || "");
  updateNameSilent(data.nombre_tienda || "");

  setField("businessDesc", data.descripcion || "");
  updateDescSilent(data.descripcion || "");

  loadAvatar(data.img_tienda?.logo_tienda || "");
  console.log(data.logo_tienda);

  // Categoría
  if (data.categoria_tienda) {
    selectedCat = data.categoria_tienda;
    document
      .querySelectorAll("#catMain .cat-chip")
      .forEach((c) =>
        c.classList.toggle(
          "selected",
          c.textContent.toLowerCase().includes(selectedCat.toLowerCase()),
        ),
      );
  }
  if (Array.isArray(data.subcategoria) && data.subcategoria.length) {
    selectedSubcat = data.subcategoria[0];
    document
      .querySelectorAll("#catSub .cat-chip")
      .forEach((c) =>
        c.classList.toggle(
          "selected",
          c.textContent.toLowerCase().includes(selectedSubcat.toLowerCase()),
        ),
      );
  }
  updateCatDisplay();

  // Ubicación
  if (data.ubicacion) {
    setField("fieldDireccion", data.ubicacion["dirección"] || "");
    setField("fieldReferencia", data.ubicacion.referencia || "");
  }

  // Horario
  if (data.horario_atencion) populateSchedule(data.horario_atencion);

  // Contacto
  // Contacto - switches
  // Contacto - switches
  // Contacto - switches
  if (data.metodo_contacto) {
    const mc = data.metodo_contacto;
    setField("fieldTelefono", mc.llamada?.numero || "");
    setField("fieldWhatsapp", mc.whatsapp?.numero || "");
    setField(
      "fieldInstagram",
      mc.instagram?.nombre
        ? mc.instagram.nombre.startsWith("@")
          ? mc.instagram.nombre
          : "@" + mc.instagram.nombre
        : "",
    );
    setField("fieldFacebook", mc.facebook?.url || "");
    setField("fieldTiktok", mc.tiktok?.url || "");
    setField("fieldWeb", mc.sitio_web?.url || "");
    setField("fieldEmail", mc.email || "");

    // Setear los switches de contacto
    setContactSwitch("llamada", mc.llamada?.estado); // ← añade esta línea
    setContactSwitch("whatsapp", mc.whatsapp?.estado);
    setContactSwitch("instagram", mc.instagram?.estado);
    setContactSwitch("facebook", mc.facebook?.estado);
    setContactSwitch("tiktok", mc.tiktok?.estado);
    setContactSwitch("sitio_web", mc.sitio_web?.estado);
  }
  // Pagos - CORREGIDO
  if (data.metodos_pago) {
    const mp = data.metodos_pago;

    // Usar setSwitchAuto con los IDs correctos
    setSwitchAuto("yape", mp.yape?.enable);
    setSwitchAuto("plin", mp.plin?.enable);
    setSwitchAuto("agora", mp.agora?.enable);
    setSwitchAuto("efectivo", mp.efectivo?.enable);
    setSwitchAuto("visa_mastercard", mp.visa_mastercard?.enable);

    // Setear los campos de titular y número para Yape y Plin
    if (mp.yape) {
      setField("fieldYapeTitular", mp.yape.nombre || "");
      setField("fieldYapeAlias", mp.yape.numero || "");
    }
    if (mp.plin) {
      setField("fieldPlinTitular", mp.plin.nombre || "");
      setField("fieldPlinAlias", mp.plin.numero || "");
    }
  }

  // Fotos
  const imgs = data.img_tienda?.lista_img;
  if (imgs?.ambientales) populatePhotoGrid("ambienteGrid", imgs.ambientales, 6);
  if (imgs?.servicios_productos)
    populatePhotoGrid("productosGrid", imgs.servicios_productos, 6);
  if (imgs?.promociones)
    populatePhotoGrid("promocionesGrid", Object.values(imgs.promociones), 3);

  // Aforo
  if (data.aforo_max !== undefined) setField("fieldAforo", data.aforo_max);
}

// ─────────────────────────────────────────────
//  AVATAR (lógica completamente reescrita)
// ─────────────────────────────────────────────
function loadAvatar(url) {
  const img = document.getElementById("avatarImg");
  const skeleton = document.getElementById("avatarSkeleton");
  const placeholder = document.getElementById("avatarPlaceholder");

  if (!img || !skeleton || !placeholder) return;

  // Resetear estado
  skeleton.style.display = "block";
  placeholder.style.display = "none";
  img.classList.remove("loaded");

  if (!url) {
    skeleton.style.display = "none";
    placeholder.style.display = "flex";
    return;
  }

  img.src = ""; // fuerza reload
  img.src = url;

  img.onload = () => {
    skeleton.style.display = "none";
    placeholder.style.display = "none";
    img.classList.add("loaded"); // ← dispara opacity: 1
  };

  img.onerror = () => {
    skeleton.style.display = "none";
    placeholder.style.display = "flex";
  };
}

// ─────────────────────────────────────────────
//  PHOTO GRID CON SKELETON
// ─────────────────────────────────────────────
function populatePhotoGrid(gridId, urls, maxSlots) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = "";

  if (urls && urls.length > 0) {
    urls.forEach((url) => {
      const wrap = document.createElement("div");
      wrap.className = "photo-item";
      wrap.style.position = "relative";

      // skeleton interno
      const sk = document.createElement("div");
      sk.style.cssText =
        "position:absolute;inset:0;background:linear-gradient(90deg,#1a1030 0%,#2a1850 50%,#1a1030 100%);background-size:200% 100%;animation:skeleton-loading 1.2s infinite;z-index:1;border-radius:16px;";
      wrap.appendChild(sk);

      const img = document.createElement("img");
      img.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .35s ease;z-index:2;border-radius:16px;";

      img.onload = () => {
        sk.style.display = "none";
        setTimeout(() => {
          img.style.opacity = "1";
        }, 50);
      };
      img.onerror = () => {
        sk.style.display = "none";
        wrap.innerHTML = `<span style="font-size:20px;opacity:0.25;position:absolute;inset:0;display:flex;align-items:center;justify-content:center">🖼️</span>`;
      };
      img.src = url;
      wrap.appendChild(img);
      grid.appendChild(wrap);
    });
  }

  // Agregar slots vacíos
  const currentLength = urls ? urls.length : 0;
  for (let i = currentLength; i < maxSlots; i++) {
    const div = document.createElement("div");
    div.className = "photo-item photo-item-add";
    div.innerHTML = `<span>📷</span><span>Agregar</span>`;
    div.onclick = () => openModal("modalFotoAmbiente");
    grid.appendChild(div);
  }
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function setField(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
    el.value = val || "";
    if (el.tagName === "TEXTAREA") {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  }
}

function updateNameSilent(val) {
  const h = document.getElementById("heroName");
  const s = document.getElementById("sidebarName");
  if (h) h.textContent = val || "Mi Negocio";
  if (s) s.textContent = val || "Mi Negocio";
}

function updateDescSilent(val) {
  const el = document.getElementById("heroDesc");
  if (el)
    el.textContent =
      val ||
      "Toca aquí para agregar una descripción atractiva de tu negocio...";
}

// ─────────────────────────────────────────────
//  HORARIO
// ─────────────────────────────────────────────
function populateSchedule(horario) {
  const body = document.getElementById("scheduleBody");
  if (!body) return;
  const keys = [
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
    "domingo",
  ];
  const labels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  let html = '<div class="schedule-grid">';
  keys.forEach((key, i) => {
    const bloque = (horario[key]?.bloques || [])[0] || {};
    const cerrado = bloque.cerrado === true;
    const apertura = bloque.h_apertura || "08:00";
    const cierre = bloque.h_cierre || "18:00";

    html += `
        <div class="schedule-day">
          <label class="day-toggle">
            <input type="checkbox" ${!cerrado ? "checked" : ""} onchange="toggleDay(this,${i})">
            <span class="day-slider"></span>
          </label>
          <span class="day-name${cerrado ? " closed" : ""}" id="dn${i}">${labels[i]}</span>
          <div class="day-hours" id="dh${i}"${cerrado ? ' style="display:none"' : ""}>
            <input class="time-input" type="time" value="${apertura}" onchange="onScheduleChange()">
            <span class="time-sep">—</span>
            <input class="time-input" type="time" value="${cierre}" onchange="onScheduleChange()">
          </div>
          <span class="day-closed-text" id="dc${i}"${!cerrado ? ' style="display:none"' : ""}>Cerrado</span>
        </div>`;
  });
  html += "</div>";
  body.innerHTML = html;
}

function onScheduleChange() {
  showSaveFab();
  queueSave();
}

function toggleDay(checkbox, idx) {
  const open = checkbox.checked;
  const hoursDiv = document.getElementById("dh" + idx);
  const closedText = document.getElementById("dc" + idx);
  const dayName = document.getElementById("dn" + idx);

  if (hoursDiv) hoursDiv.style.display = open ? "flex" : "none";
  if (closedText) closedText.style.display = open ? "none" : "";
  if (dayName) dayName.classList.toggle("closed", !open);

  showSaveFab();
  queueSave();
}

// ─────────────────────────────────────────────
//  AUTO-SAVE
// ─────────────────────────────────────────────
function queueSave() {
  clearTimeout(_saveTimeout);
  _saveTimeout = setTimeout(collectAndSave, 2000);
}

async function collectAndSave() {
  const g = (id) => document.getElementById(id)?.value;
  const updates = {};

  const nombre = g("businessName")?.trim();
  if (nombre) {
    updates["nombre_tienda"] = nombre;
    updates["nombre_lower"] = nombre.toLowerCase();
  }

  const desc = g("businessDesc");
  if (desc !== undefined) updates["descripcion"] = desc;
  if (selectedCat) updates["categoria_tienda"] = selectedCat;

  updates["ubicacion.dirección"] = g("fieldDireccion") || "";
  updates["ubicacion.referencia"] = g("fieldReferencia") || "";
  updates["metodo_contacto.llamada.numero"] = g("fieldTelefono") || "";
  updates["metodo_contacto.whatsapp.numero"] = g("fieldWhatsapp") || "";
  updates["metodo_contacto.instagram.nombre"] = (
    g("fieldInstagram") || ""
  ).replace("@", "");
  updates["metodo_contacto.facebook.url"] = g("fieldFacebook") || "";
  updates["metodo_contacto.tiktok.url"] = g("fieldTiktok") || "";
  updates["metodo_contacto.sitio_web.url"] = g("fieldWeb") || "";
  updates["metodo_contacto.email"] = g("fieldEmail") || "";

  // Actualizar datos de Yape y Plin
  const yapeTitular = g("fieldYapeTitular");
  const yapeNumero = g("fieldYapeAlias");
  if (yapeTitular) updates["metodos_pago.yape.nombre"] = yapeTitular;
  if (yapeNumero) updates["metodos_pago.yape.numero"] = yapeNumero;

  const plinTitular = g("fieldPlinTitular");
  const plinNumero = g("fieldPlinAlias");
  if (plinTitular) updates["metodos_pago.plin.nombre"] = plinTitular;
  if (plinNumero) updates["metodos_pago.plin.numero"] = plinNumero;

  const aforo = parseInt(g("fieldAforo"));
  if (!isNaN(aforo)) updates["aforo_max"] = aforo;

  try {
    await updateDoc(TIENDA_REF, updates);
    showToast("✓ Guardado");
    document.getElementById("saveFab")?.classList.remove("visible");
    document.getElementById("sidebarSaveBtn")?.classList.remove("visible");
  } catch (err) {
    console.error(err);
    showToast("❌ Error al guardar");
  }
}

// ─────────────────────────────────────────────
//  TABS
// ─────────────────────────────────────────────
function showSection(name, element, source) {
  document
    .querySelectorAll(".section")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById("sec-" + name)?.classList.add("active");

  const tabMap = { perfil: 0, fotos: 1, datos: 2, contacto: 3, pagos: 4 };
  document
    .querySelectorAll(".nav-tab")
    .forEach((t) => t.classList.remove("active"));
  const tabs = document.querySelectorAll(".nav-tab");
  if (tabs[tabMap[name]]) tabs[tabMap[name]].classList.add("active");

  document
    .querySelectorAll(".bar-btn")
    .forEach((b) => b.classList.remove("active"));
  const barBtn = document.getElementById("bb-" + name);
  if (barBtn) barBtn.classList.add("active");

  document
    .querySelectorAll(".sidebar-btn")
    .forEach((b) => b.classList.remove("active"));
  const sideBtn = document.getElementById("sbb-" + name);
  if (sideBtn) sideBtn.classList.add("active");
}

function toggleExpand(header) {
  const body = header.nextElementSibling;
  const open = header.classList.contains("open");
  header.classList.toggle("open", !open);
  if (body) body.classList.toggle("open", !open);
}

function openExpandable(id) {
  const sec = document.getElementById(id);
  if (!sec) return;
  const h = sec.querySelector(".expand-header");
  const b = sec.querySelector(".expand-body");
  if (h && !h.classList.contains("open")) {
    h.classList.add("open");
    if (b) b.classList.add("open");
  }
  sec.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateName(val) {
  updateNameSilent(val);
  showSaveFab();
  queueSave();
}

function updateDesc(val) {
  updateDescSilent(val);
  showSaveFab();
  queueSave();
}

function focusField(id) {
  document.getElementById(id)?.focus();
}

function selectCat(el, val) {
  document
    .querySelectorAll("#catMain .cat-chip")
    .forEach((c) => c.classList.remove("selected"));
  el.classList.add("selected");
  selectedCat = val;
  updateCatDisplay();
  showSaveFab();
  queueSave();
}

function selectSubcat(el, val) {
  document
    .querySelectorAll("#catSub .cat-chip")
    .forEach((c) => c.classList.remove("selected"));
  el.classList.add("selected");
  selectedSubcat = val;
  updateCatDisplay();
  showSaveFab();
  queueSave();
}

function updateCatDisplay() {
  const text =
    [selectedCat, selectedSubcat].filter(Boolean).join(" › ") ||
    "Sin seleccionar";
  const d = document.getElementById("catDisplay");
  if (d) d.textContent = text;
  const h = document.getElementById("heroCat");
  if (h)
    h.textContent = selectedCat ? "📂 " + text + " ›" : "📂 Sin categoría ›";
}

// ─────────────────────────────────────────────
//  MODALS
// ─────────────────────────────────────────────
function openModal(id) {
  const modal = document.getElementById(id);
  const sheet = document.getElementById("sheet" + id.replace("modal", ""));
  if (modal) modal.classList.add("open");
  if (sheet) sheet.classList.add("open");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  const sheet = document.getElementById("sheet" + id.replace("modal", ""));
  if (modal) modal.classList.remove("open");
  if (sheet) sheet.classList.remove("open");
}

async function applyProfileImg() {
  const url = document.getElementById("profileImgUrl").value.trim();
  if (!url) {
    showToast("Ingresa una URL válida");
    return;
  }
  try {
    await updateDoc(TIENDA_REF, { logo_tienda: url });
    loadAvatar(url);
    closeModal("modalFotoPerfil");
    showToast("Logo actualizado ✓");
    showSaveFab();
    queueSave();
  } catch (e) {
    console.error(e);
    showToast("Error al actualizar");
  }
}

function applyAmbienteImg() {
  const url = document.getElementById("ambImgUrl").value.trim();
  if (!url) {
    showToast("Ingresa una URL válida");
    return;
  }
  showToast("Foto agregada ✓");
  showSaveFab();
  queueSave();
  closeModal("modalFotoAmbiente");
  document.getElementById("ambImgUrl").value = "";
}

const emojis = ["🍕", "🍔", "🥗", "🍰", "☕", "🍜", "🛍️", "💎", "✨", "🎁"];
let prodCount = 2;

function addProduct() {
  const name = document.getElementById("prodName").value.trim();
  if (!name) {
    showToast("Ingresa un nombre");
    return;
  }
  const desc = document.getElementById("prodDesc").value.trim();
  const price = document.getElementById("prodPrice").value;
  const list = document.getElementById("productosList");
  if (list) {
    const card = document.createElement("div");
    card.className = "promo-card";
    card.innerHTML = `<div class="promo-img">${emojis[prodCount % emojis.length]}</div>
          <div class="promo-info"><div class="promo-name">${name}</div><div class="promo-desc">${desc || "Sin descripción"}</div>
          <div class="promo-badges"><span class="badge badge-blue">Disponible</span></div></div>
          <div><div class="promo-price">${price ? "S/ " + parseFloat(price).toFixed(2) : ""}</div></div>`;
    list.appendChild(card);
    prodCount++;
  }
  ["prodName", "prodDesc", "prodPrice"].forEach(
    (id) => (document.getElementById(id).value = ""),
  );
  closeModal("modalProducto");
  showToast("Producto agregado ✓");
  showSaveFab();
  queueSave();
}

function addPromo() {
  const title = document.getElementById("promoTitle").value.trim();
  if (!title) {
    showToast("Ingresa un título");
    return;
  }
  const desc = document.getElementById("promoDesc").value.trim();
  const discount = document.getElementById("promoDiscount").value.trim();
  const list = document.getElementById("promosList");
  if (list) {
    const card = document.createElement("div");
    card.className = "promo-card";
    card.innerHTML = `<div class="promo-img" style="background:linear-gradient(135deg,#1E1040,#2A1050)">🎉</div>
          <div class="promo-info"><div class="promo-name">${title}</div><div class="promo-desc">${desc}</div>
          <div class="promo-badges"><span class="badge badge-red">Hoy</span></div></div>
          <div><div class="promo-price">${discount}</div></div>`;
    list.appendChild(card);
  }
  ["promoTitle", "promoDesc", "promoDiscount"].forEach(
    (id) => (document.getElementById(id).value = ""),
  );
  closeModal("modalPromo");
  showToast("Promo agregada ✓");
  showSaveFab();
  queueSave();
}

// ─────────────────────────────────────────────
//  SAVE FAB / TOAST / SIDEBAR
// ─────────────────────────────────────────────
function showSaveFab() {
  const saveFab = document.getElementById("saveFab");
  const sidebarSave = document.getElementById("sidebarSaveBtn");
  if (saveFab) saveFab.classList.add("visible");
  if (sidebarSave) sidebarSave.classList.add("visible");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (saveFab) saveFab.classList.remove("visible");
    if (sidebarSave) sidebarSave.classList.remove("visible");
  }, 6000);
}

function saveChanges() {
  clearTimeout(_saveTimeout);
  collectAndSave();
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2500);
}

function toggleSidebar() {
  const sb = document.querySelector(".sidebar");
  const btn = document.getElementById("sidebarToggle");
  if (sb) sb.classList.toggle("collapsed");
  if (btn) btn.textContent = sb?.classList.contains("collapsed") ? "▶" : "◀";
}

// Event Listeners
document.addEventListener("input", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
    showSaveFab();
    queueSave();
  }
});

document.addEventListener("DOMContentLoaded", initRealtime);

function setContactSwitch(contactId, isEnabled) {
  const switchElement = document.querySelector(
    `input[data-contact="${contactId}"]`,
  );
  if (switchElement) {
    switchElement.checked = isEnabled === true;
  }
}

async function toggleContactMethod(method, enabled) {
  try {
    await updateDoc(TIENDA_REF, {
      [`metodo_contacto.${method}.estado`]: enabled,
    });
    showToast(
      `${getContactName(method)} ${enabled ? "activado" : "desactivado"}`,
    );
    showSaveFab();
  } catch (e) {
    console.error("Error toggleContactMethod:", e);
    showToast("Error al actualizar");
  }
}

function getContactName(method) {
  const names = {
    llamada: "Teléfono",
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    facebook: "Facebook",
    tiktok: "TikTok",
    sitio_web: "Sitio web",
  };
  return names[method] || method;
}
// Función específica para teléfono/llamada
async function toggleLlamadaMethod(enabled) {
  try {
    await updateDoc(TIENDA_REF, {
      [`metodo_contacto.llamada.estado`]: enabled,
    });
    showToast(`Teléfono ${enabled ? "activado" : "desactivado"}`);
    showSaveFab();
  } catch (e) {
    console.error("Error toggleLlamadaMethod:", e);
    showToast("Error al actualizar");
  }
}
function autoResize(el) {
  el.style.height = "auto"; // resetea primero
  el.style.height = el.scrollHeight + "px"; // luego expande
}
document.querySelectorAll("textarea.form-input").forEach(autoResize);

// Globals para onclick en HTML
Object.assign(window, {
  showSection,
  toggleExpand,
  openExpandable,
  toggleDay,
  updateName,
  updateDesc,
  focusField,
  selectCat,
  selectSubcat,
  openModal,
  closeModal,
  applyProfileImg,
  applyAmbienteImg,
  addProduct,
  addPromo,
  saveChanges,
  showToast,
  toggleSidebar,
  onScheduleChange,
  togglePayMethod,
  toggleContactMethod,
  toggleLlamadaMethod, // ← añade toggleLlamadaMethod
});
