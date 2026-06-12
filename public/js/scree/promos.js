import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  limit,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
  authDomain: "geinzworkapp.firebaseapp.com",
  projectId: "geinzworkapp",
  storageBucket: "geinzworkapp.appspot.com",
  messagingSenderId: "921389328767",
  appId: "1:921389328767:web:094e8a2a5fcd69395b524a",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const promosContainer = document.getElementById("promos-container");
// Al inicio, después de las imports y config, agrega:
const urlParams = new URLSearchParams(window.location.search);
const localidadParam = (urlParams.get("loc") || "barranca")
  .toLowerCase()
  .trim();
async function init() {
  try {
    await fetchPromociones();
  } catch (error) {
    console.error("Error al extraer datos de Firestore: ", error);
    promosContainer.innerHTML = `<p style="text-align:center; color: #ff3b30; padding: 20px;">Error al conectar con la base de datos.</p>`;
  }
}

async function fetchPromociones() {
  const path = `Tiendas/${localidadParam}/promos_ofertas`;
  const q = query(collection(db, path), where("estado", "==", "activo"));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.empty) {
    promosContainer.innerHTML = `<p style="text-align:center; color: var(--text-secondary); padding: 40px;">No hay ofertas disponibles en <strong>${localidadParam}</strong> en este momento.</p>`;
    return;
  }

  const docs = [];
  querySnapshot.forEach((doc) => docs.push(doc));
  const docsAleatorios = docs.sort(() => Math.random() - 0.5);

  let htmlContent = "";
  let delayIndex = 0;

  docsAleatorios.forEach((doc) => {
    const data = doc.data();
    if (data.activo !== true && data.estado !== "activo") return;

    // ── Calcular fecha_fin UNA SOLA VEZ ─────────────────────────
    const dhf = data.datos_hora_fecha || {};
    const tipoHora = data.tipo_hora_dias || dhf.tipo_hora_dias || "dias";
    const horaFin = dhf.hora_fin || data.hora_fin || "23:59";

    let finDate = null;
    const tsFinSeconds =
      dhf.timestamp_fin?.seconds || data.timestamp_fin?.seconds;
    if (tsFinSeconds) {
      finDate = new Date(tsFinSeconds * 1000);
    } else {
      // 2️⃣ FALLBACK: fecha_fin como string
      const rawFecha = data.fecha_fin || dhf.fecha_fin || "";
      if (rawFecha) {
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawFecha)) {
          const [d, m, y] = rawFecha.split("/");
          finDate = new Date(`${y}-${m}-${d}T${horaFin}:00`);
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawFecha)) {
          finDate = new Date(`${rawFecha}T${horaFin}:00`);
        }
      }
    }

 

 
    if (dhf.activo === false) return;
    if (finDate && !isNaN(finDate.getTime()) && finDate.getTime() < Date.now())
      return;

    if (delayIndex >= 6) return;
    const info = data.informacion || {};
    const imgContainer = data.img_container || {};
    const listImg = imgContainer.lista_img || [];
    const logoImg = imgContainer.logo_img || "";

    // ── Construir badge de tiempo ──────────────────────────────
    let timeContainerHtml = "";

    if (finDate && !isNaN(finDate.getTime())) {
      const ahora = new Date();
      const diffMs = finDate - ahora;
      const opciones = { day: "numeric", month: "long" };
      const fechaFormateada = finDate.toLocaleDateString("es-ES", opciones);
      const horaFin = dhf.hora_fin || data.hora_fin || "23:59";

      if (tipoHora === "horas") {
        const diffHoras = Math.ceil(diffMs / (1000 * 60 * 60));
        if (diffHoras > 3) {
          timeContainerHtml = `
                        <div class="time-info-container">
                            <div class="badge-days" style="background:rgba(52,199,89,0.12); color:#30d158;">
                                <i class="fa-solid fa-clock"></i> ${diffHoras}h restantes
                            </div>
                            <span class="expiration-date">Vence hoy a las ${horaFin}</span>
                        </div>`;
        } else if (diffHoras > 0) {
          timeContainerHtml = `
                        <div class="time-info-container">
                            <div class="badge-days badge-urgent">
                                <i class="fa-solid fa-bolt"></i> ¡Solo ${diffHoras}h!
                            </div>
                            <span class="expiration-date">Vence a las ${horaFin}</span>
                        </div>`;
        } else {
          timeContainerHtml = `
                        <div class="time-info-container">
                            <div class="badge-days" style="background:#242426; color:var(--text-secondary);">
                                <i class="fa-solid fa-calendar-xmark"></i> Finalizado
                            </div>
                        </div>`;
        }
      } else {
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays > 3) {
          timeContainerHtml = `
                        <div class="time-info-container">
                            <div class="badge-days" style="background:rgba(52,199,89,0.12); color:#30d158;">
                                <i class="fa-solid fa-clock"></i> Quedan ${diffDays} días
                            </div>
                            <span class="expiration-date">Expira el ${fechaFormateada}</span>
                        </div>`;
        } else if (diffDays >= 2) {
          timeContainerHtml = `
                        <div class="time-info-container">
                            <div class="badge-days" style="background:rgba(255,159,10,0.12); color:#ff9f0a;">
                                <i class="fa-solid fa-triangle-exclamation"></i> Quedan ${diffDays} días
                            </div>
                            <span class="expiration-date">Expira el ${fechaFormateada}</span>
                        </div>`;
        } else if (diffDays === 1) {
          timeContainerHtml = `
                        <div class="time-info-container">
                            <div class="badge-days badge-urgent">
                                <i class="fa-solid fa-triangle-exclamation"></i> Último día
                            </div>
                            <span class="expiration-date">Vence mañana</span>
                        </div>`;
        } else if (diffDays === 0) {
          timeContainerHtml = `
                        <div class="time-info-container">
                            <div class="badge-days badge-urgent">
                                <i class="fa-solid fa-bolt"></i> Finaliza hoy
                            </div>
                            <span class="expiration-date">Vence hoy a las ${horaFin}</span>
                        </div>`;
        } else {
          timeContainerHtml = `
                        <div class="time-info-container">
                            <div class="badge-days" style="background:#242426; color:var(--text-secondary);">
                                <i class="fa-solid fa-calendar-xmark"></i> Finalizado
                            </div>
                        </div>`;
        }
      }
    } else {
      const comodidades = data.comodidades || [];
      const iconosComodidades = {
        wifi: "fa-wifi",
        estacionamiento: "fa-square-parking",
        delivery: "fa-motorcycle",
        reservas: "fa-calendar-check",
        "aire acondicionado": "fa-snowflake",
        terraza: "fa-umbrella-beach",
        "música en vivo": "fa-music",
        tv: "fa-tv",
      };
      if (comodidades.length > 0) {
        const iconosHtml = comodidades
          .slice(0, 4)
          .map((c) => {
            const icon =
              iconosComodidades[c.toLowerCase()] || "fa-circle-check";
            return `<span title="${c}" style="font-size:13px; color:#a29bfe;"><i class="fa-solid ${icon}"></i></span>`;
          })
          .join("");
        timeContainerHtml = `
                    <div class="time-info-container">
                        <div class="badge-days badge-normal" style="gap:8px;">
                            ${iconosHtml}
                            <span style="font-size:11px; color:var(--text-secondary);">${comodidades[0]}${comodidades.length > 1 ? ` +${comodidades.length - 1}` : ""}</span>
                        </div>
                    </div>`;
      } else {
        timeContainerHtml = `
                    <div class="badge-days badge-normal">
                        <i class="fa-solid fa-tag"></i> Oferta disponible
                    </div>`;
      }
    }

    const singleImgUrl =
      listImg.length > 0
        ? listImg[0]
        : logoImg || "https://via.placeholder.com/400x500?text=Geinz";

    const wsMessage =
      data.mensaje_predeterminado?.whatsapp?.msje_predermindo ||
      "Hola, quiero esta oferta que vi en Geinz";
    const shareMessage =
      data.mensaje_predeterminado?.compartir?.msje_predermindo ||
      "Mira esta promo en Geinz 🎁";
    const phoneNumber = info.numero || "";
    const localidad = data.ubicacion?.direccion
      ?.toLowerCase()
      .includes("barranca")
      ? "ba"
      : "ba";
    const promoId = info.id_promocion || "";
    const promoUrl = `https://geinzworkapp.web.app/api/share?t=prms&l=${localidad}&pi=${promoId}`;

    let buttonsHtml = "";
    if (info.compartir === true) {
      buttonsHtml += `<button class="action-btn share" onclick="sharePromo('${shareMessage}', '${promoUrl}')"><i class="fa-solid fa-paper-plane"></i></button>`;
    }
    if (info.contactar === true) {
      buttonsHtml += `<button class="action-btn whatsapp" onclick="contactWhatsApp('${phoneNumber}', '${wsMessage}', '${promoUrl}')"><i class="fa-brands fa-whatsapp"></i></button>`;
    }
    htmlContent += `
            <div class="promo-card" style="animation-delay: ${delayIndex * 0.1}s" onclick="abrirPromo('${promoUrl}')">
                <div class="image-container-single">
                    <img src="${singleImgUrl}" alt="Oferta" loading="lazy">
                </div>
                <div class="promo-footer">
                    <div class="store-header-row">
                        <div class="store-info">
                            <img class="store-logo" src="${logoImg}" alt="${info.nombre_tienda}">
                            <div class="store-text-details">
                                <span class="store-name">${info.nombre_tienda || "Negocio Local"}</span>
                                <span class="promo-title">${info.titulo || "Descuento"}</span>
                            </div>
                        </div>
                    </div>
                    <div class="store-actions-row">
                        ${timeContainerHtml}
                        <div class="action-buttons">
                            ${buttonsHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    delayIndex++;
  });

  htmlContent += `
        <div class="download-banner">
            <div class="download-banner-content">
                <h3>¿Listo para expandir tu flujo comercial?</h3>
                <p>Descarga la app nativa de Geinz y accede de manera centralizada a cientos de promociones de impacto, activaciones en tiempo real y el posicionamiento integral de las mejores marcas locales en Barranca.</p>
                <a href="https://play.google.com/store/apps/details?id=com.geinzz.geinzwork" target="_blank" class="download-btn">
                    Descargar Aplicación Nativa
                </a>
            </div>
            <i class="fa-brands fa-google-play download-banner-icon"></i>
        </div>
    `;
  promosContainer.innerHTML = htmlContent;
}

window.addEventListener("DOMContentLoaded", init);
