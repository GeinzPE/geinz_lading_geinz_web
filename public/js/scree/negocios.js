import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = initializeApp({
  apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
  authDomain: "geinzworkapp.firebaseapp.com",
  projectId: "geinzworkapp",
  storageBucket: "geinzworkapp.appspot.com",
  messagingSenderId: "921389328767",
  appId: "1:921389328767:web:094e8a2a5fcd69395b524a",
});
const db = getFirestore(app);

const params = new URLSearchParams(location.search);
const localidad = (params.get("localidad") || "").toLowerCase().trim();
const categoriaParam = (params.get("categoria") || "")
  .replace(/\+/g, " ")
  .toLowerCase()
  .trim();

const listEl = document.getElementById("listContainer");
const chipsEl = document.getElementById("chipsContainer");
const searchEl = document.getElementById("searchInput");
const metaCatEl = document.getElementById("metaCat");
const metaCountEl = document.getElementById("metaCount");
const heroDescEl = document.getElementById("heroDesc");

if (categoriaParam) {
  const cat = categoriaParam.charAt(0).toUpperCase() + categoriaParam.slice(1);
  metaCatEl.innerHTML = `<span>${cat}</span> en ${localidad ? localidad.charAt(0).toUpperCase() + localidad.slice(1) : "tu zona"}`;
  heroDescEl.textContent = `Explora los mejores negocios de ${cat.toLowerCase()} cerca de ti. Ordenados por disponibilidad.`;
}

let allTiendas = [];
let subcats = [];
let activeSubcat = "todos";
let searchTerm = "";

function norm(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getDiaActual() {
  const dias = [
    "domingo",
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
  ];
  return dias[new Date().getDay()];
}
const backBtn = document.getElementById("backBtn");
if (backBtn) {
  backBtn.addEventListener("click", () => {
    window.location.href = "https://geinztech.com/";
  });
}

function getEstado(horario) {
  if (!horario) return { estado: "cerrado", texto: "Cerrado", clase: "closed" };
  const dia = getDiaActual();
  const diaData = horario[dia];
  if (!diaData) return { estado: "cerrado", texto: "Cerrado", clase: "closed" };

  const cerradoDia = diaData.cerrado;
  const bloques = diaData.bloques || [];

  if (cerradoDia === true && bloques.length === 0) {
    return { estado: "cerrado", texto: "Cerrado hoy", clase: "closed" };
  }

  if (bloques.length > 0) {
    const bloque = bloques[0];
    if (bloque.cerrado === true)
      return { estado: "cerrado", texto: "Cerrado", clase: "closed" };

    const now = new Date();
    const [hA, mA] = (bloque.h_apertura || "00:00").split(":").map(Number);
    const [hC, mC] = (bloque.h_cierre || "23:59").split(":").map(Number);
    const apert = new Date(now);
    apert.setHours(hA, mA, 0);
    const cierr = new Date(now);
    cierr.setHours(hC, mC, 0);

    if (now >= apert && now < cierr) {
      const diffMs = cierr - now;
      const diffH = Math.floor(diffMs / 3600000);
      const diffM = Math.floor((diffMs % 3600000) / 60000);
      return {
        estado: "abierto",
        texto:
          diffH > 0 ? `Cierra en ${diffH}h ${diffM}m` : `Cierra en ${diffM}m`,
        clase: diffMs < 3600000 ? "warn" : "open",
      };
    } else if (now < apert) {
      return {
        estado: "pronto",
        texto: `Abre hoy a las ${bloque.h_apertura}`,
        clase: "warn",
      };
    } else {
      return { estado: "cerrado", texto: "Cerrado por hoy", clase: "closed" };
    }
  }
  return { estado: "cerrado", texto: "Cerrado", clase: "closed" };
}

function renderChips() {
  chipsEl.innerHTML = "";
  const all = document.createElement("button");
  all.className = "chip" + (activeSubcat === "todos" ? " active" : "");
  all.textContent = "Todos";
  all.onclick = () => {
    changeCategory("todos");
  };
  chipsEl.appendChild(all);

  subcats.forEach((s) => {
    const btn = document.createElement("button");
    btn.className = "chip" + (activeSubcat === s ? " active" : "");
    btn.textContent = s.charAt(0).toUpperCase() + s.slice(1);
    btn.onclick = () => {
      changeCategory(s);
    };
    chipsEl.appendChild(btn);
  });
}

function changeCategory(cat) {
  activeSubcat = cat;
  renderChips();
  renderList();
}

function renderList() {
  let lista = [...allTiendas];
  if (searchTerm) {
    const t = norm(searchTerm);
    lista = lista.filter(
      (ti) =>
        norm(ti.nombre_tienda).includes(t) ||
        norm(ti.nombre_lower).includes(t) ||
        (ti.nombre_keywords || []).some((k) => norm(k).includes(t)) ||
        (ti.subcategoria || []).some((s) => norm(s).includes(t)),
    );
  }

  if (activeSubcat !== "todos") {
    lista = lista.filter((ti) =>
      (ti.subcategoria || []).some((s) => norm(s) === norm(activeSubcat)),
    );
  }

  lista.sort((a, b) => {
    const ord = { abierto: 0, pronto: 1, cerrado: 2 };
    const oa = ord[a._estado?.estado || "cerrado"];
    const ob = ord[b._estado?.estado || "cerrado"];
    if (oa !== ob) return oa - ob;
    return (b.puntos_tienda || 0) - (a.puntos_tienda || 0);
  });

  const total = lista.length;
  lista = lista.slice(0, 6);
  metaCountEl.textContent =
    total > 6
      ? `Mostrando 6 de ${total}`
      : `${total} resultado${total !== 1 ? "s" : ""}`;

  if (lista.length === 0) {
    listEl.innerHTML = `
                    <div class="empty">
                        <div class="empty-icon">🔍</div>
                        <h3>Sin resultados coincidentes</h3>
                        <p>Intenta cambiar de término o de subcategoría.</p>
                    </div>`;
    return;
  }

  listEl.innerHTML = "";
  lista.forEach((ti) => {
    const estado = ti._estado || {
      estado: "cerrado",
      texto: "Cerrado",
      clase: "closed",
    };
    const card = document.createElement("div");
    card.className = "card";

    const logoEl = ti.logo
      ? `<img class="card-logo" src="${ti.logo}" alt="${ti.nombre_tienda}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : "";
    const iniciales = (ti.nombre_tienda || "?")
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
    const placeholderDisplay = ti.logo ? "none" : "flex";
    const subcatsHtml = (ti.subcategoria || [])
      .slice(0, 3)
      .map(
        (s) =>
          `<span class="subcat-tag">${s.charAt(0).toUpperCase() + s.slice(1)}</span>`,
      )
      .join("");

    card.innerHTML = `
                    <div class="card-top">
                        ${logoEl}
                        <div class="card-logo-placeholder" style="display:${placeholderDisplay}">${iniciales}</div>
                        <div class="card-info">
                            <div class="card-name">${ti.nombre_tienda || "Sin nombre"}</div>
                            <div class="card-dir">
                                <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>
                                <span>${ti.direccion || "Dirección no disponible"}</span>
                            </div>
                            ${
                              ti.referencia
                                ? `
                            <div class="card-ref">
                                <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                                <span>${ti.referencia}</span>
                            </div>`
                                : ""
                            }
                        </div>
                    </div>
                    <div class="card-bottom">
                        <div class="card-subcats">${subcatsHtml}</div>
                        <div class="card-status">
                            <span class="status-dot ${estado.clase}"></span>
                            <span class="status-text ${estado.clase}">${estado.texto}</span>
                        </div>
                    </div>
                `;

    card.addEventListener("click", () => {
      const alias = ti.alias_key || ti.id;
      window.location.href = `https://geinztech.com/perfil/${alias}`;
    });

    listEl.appendChild(card);
  });
}

async function cargar() {
  try {
    if (!localidad) {
      document.body.classList.remove("loading");
      listEl.innerHTML = `<div class="empty"><div class="empty-icon">📍</div><h3>Ubicación requerida</h3><p>Por favor, especifica una localidad en los parámetros de navegación.</p></div>`;
      return;
    }

    const locRef = collection(db, "Tiendas", localidad, localidad);
    const snap = await getDocs(locRef);
    const tempArr = [];

    snap.forEach((docSnap) => {
      const d = docSnap.data();
      if (localidad && norm(d.localidad) !== norm(localidad)) return;
      if (categoriaParam && norm(d.categoria_tienda) !== norm(categoriaParam))
        return;

      tempArr.push({
        id: docSnap.id,
        alias_key: d.alias_key || "", // 👈 agregar esto
        nombre_tienda: d.nombre_tienda || docSnap.id,
        nombre_lower: d.nombre_lower || "",
        nombre_keywords: d.nombre_keywords || [],
        direccion: d.ubicacion?.dirección || "",
        referencia: d.ubicacion?.referencia || "",
        subcategoria: d.subcategoria || [],
        logo: d.img_tienda?.logo_tienda || "",
        puntos_tienda: d.puntos_tienda || 0,
        horario_atencion: d.horario_atencion || null,
        _estado: getEstado(d.horario_atencion),
      });
    });

    allTiendas = tempArr;

    const subcatSet = new Set();
    allTiendas.forEach((ti) =>
      (ti.subcategoria || []).forEach((s) => subcatSet.add(s.toLowerCase())),
    );
    subcats = [...subcatSet].sort();

    document.body.classList.remove("loading");
    renderChips();
    renderList();
  } catch (err) {
    console.error(err);
    document.body.classList.remove("loading");
    listEl.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div><h3>Error de conexión</h3><p>Hubo un fallo al intentar leer los datos de Firebase.</p></div>`;
  }
}

let debounce;
searchEl.addEventListener("input", (e) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    searchTerm = e.target.value;
    renderList();
  }, 200);
});

cargar();
