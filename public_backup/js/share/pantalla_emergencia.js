import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Importamos app y db ya inicializados desde db.js
import { app, db } from "../db/db.js";
import { tiendaSubCol } from "../rutas/rutas.js";

const grid = document.getElementById("containerGrid");

let listadoEmergencias = [];

/* controls effect */
const params = new URLSearchParams(window.location.search);
const localidad = params.get("loc") || "barranca";

const controls = document.getElementById("controls");

window.addEventListener("scroll", () => {
  if (window.scrollY > 80) {
    controls.classList.add("scrolled");
  } else {
    controls.classList.remove("scrolled");
  }
});

const backBtn = document.getElementById("backBtn");
if (backBtn) {
  backBtn.addEventListener("click", () => {
    window.location.href = "https://geinztech.com/";
  });
}
/* fetch */

async function fetchDatabase() {
  try {
    const colRef = 
    tiendaSubCol(localidad,"salud_seguridad");
  
    const snapshot = await getDocs(colRef);

    listadoEmergencias = snapshot.docs.map((doc) => {
      const d = doc.data();

      return {
        nombre: d.nombre || "Entidad",
        categoria: d.categoria || "seguridad",
        img: d.img || "",
        direccion: d.ubicacion?.direccion || "Sin dirección",
        referencia: d.ubicacion?.referencia || "Sin referencia",
        lat: d.ubicacion?.latitud ?? null,   // ✅ null si no existe
        lng: d.ubicacion?.longitud ?? null,  // ✅ null si no existe
        llamada: d.numeros_contactos?.llamada?.[0] || "",
        whatsapp: d.numeros_contactos?.whatsapp?.[0] || "",
        tags: d.tag_eventos_emerge || [],
      };
    });

    renderCards(listadoEmergencias);
  } catch (error) {
    console.error(error);

    grid.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-triangle-exclamation"></i>
        <p>Error cargando información.</p>
      </div>
    `;
  }

  /* hide skeleton */
  setTimeout(() => {
    document.getElementById("pageSkeleton").classList.add("hide");
    document.body.classList.remove("loading-page");
    document.querySelector(".container").classList.add("loaded");
  }, 700);
}

/* normaliza números al formato 51XXXXXXXXX para WhatsApp */
function formatWhatsappNumber(number) {
  let clean = number.replace(/[^0-9]/g, ""); // deja solo dígitos

  // quita ceros a la izquierda por si acaso (ej: "0987654321")
  clean = clean.replace(/^0+/, "");

  // si no empieza con 51, se lo agregamos
  if (!clean.startsWith("51")) {
    clean = "51" + clean;
  }

  return clean;
}
function renderCards(data) {
  if (!data.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-search"></i>
        <p>No se encontraron resultados.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = data
    .map((item) => {
      const hasCall = item.llamada !== "";
      const hasWhatsapp = item.whatsapp !== "";
      const hasMap = item.lat !== null && item.lng !== null; // ✅ solo si tiene coords reales

      const mapUrl = hasMap
        ? `https://www.google.com/maps?q=${item.lat},${item.lng}`
        : "";

      const img =
        item.img ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(item.nombre.charAt(0))}&background=8800F2&color=fff`;

      return `
        <div class="card reveal-card">

          <div class="card-header">
            <img
              class="card-logo"
              src="${img}"
              alt="${item.nombre}"
              loading="lazy"
            />
            <div>
              <span class="tag-category">
                <i class="fas ${item.categoria === "salud" ? "fa-heartbeat" : "fa-shield-alt"}"></i>
                ${item.categoria === "salud" ? "SALUD" : "SEGURIDAD"}
              </span>
              <h3>${item.nombre}</h3>
            </div>
          </div>

          <div class="card-info">
            <div>
              <i class="fas fa-location-dot"></i>
              <span>${item.direccion}</span>
            </div>
            <div>
              <i class="fas fa-circle-info"></i>
              <span>${item.referencia}</span>
            </div>
          </div>

          <div class="card-actions">

            ${hasCall
              ? `<a href="tel:${item.llamada}" class="btn btn-call">
                   <i class="fas fa-phone"></i> Llamar
                 </a>`
              : `<button class="btn btn-call btn-disabled" disabled>
                   <i class="fas fa-ban"></i> No disponible
                 </button>`
            }

          ${hasWhatsapp
  ? `<a href="https://wa.me/${formatWhatsappNumber(item.whatsapp)}" target="_blank" class="btn btn-wssp">
                   <i class="fab fa-whatsapp"></i> WhatsApp
                 </a>`
              : `<button class="btn btn-wssp btn-disabled" disabled>
                   <i class="fas fa-ban"></i> No disponible
                 </button>`
            }

            ${hasMap
              ? `<a href="${mapUrl}" target="_blank" class="btn btn-map">
                   <i class="fas fa-location-arrow"></i>
                 </a>`
              : ""
            }

          </div>

        </div>
      `;
    })
    .join("");

  revealCards();
}

/* reveal animation */

function revealCards() {
  const cards = document.querySelectorAll(".reveal-card");

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
        }
      });
    },
    { threshold: 0.12 }
  );

  cards.forEach((card) => observer.observe(card));
}

/* filters */

function filterData() {
  const term = document.getElementById("searchInput").value.toLowerCase().trim();
  const active = document.querySelector(".filter-btn.active").dataset.filter;

  const filtered = listadoEmergencias.filter((item) => {
    const matchSearch =
      term === "" ||
      item.nombre.toLowerCase().includes(term) ||
      item.tags.some((tag) => tag.toLowerCase().includes(term));

    const matchCategory = active === "todos" || item.categoria === active;

    return matchSearch && matchCategory;
  });

  renderCards(filtered);
}

/* search */

let debounce;

document.getElementById("searchInput").addEventListener("input", () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    filterData();
  }, 220);
});

/* filter buttons */

document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    filterData();
  });
});

fetchDatabase();