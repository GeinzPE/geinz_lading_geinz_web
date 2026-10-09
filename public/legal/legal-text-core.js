import { getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { aliasTiendaDoc, tiendaDoc } from "../js/rutas/rutas.js"; // ruta real de tu módulo de rutas Firestore
import { setFaviconCircular } from "../js/favicon/favicon.js"; // ⚠️ ajusta esta ruta si tu favicon.js está en otro lugar
import {
  cargarColoresNegocio,
  aplicarColoresDesdeCache,
} from "../js/colores_dinamicos/dinamicos.js"
// ══════════════════════════════════════════
//  RESOLVER ALIAS → { id, localidad }
//  (mismo patrón que legal.js / seguimiento.js)
//
//  pathPrefix: string opcional, ej "/legal/politicas_privacidad/"
//  Si la URL empieza con ese prefijo, todo lo que sigue se toma
//  como alias. Si no, cae a ?alias=... y luego a ?id=&localidad=
//  como fallback viejo.
// ══════════════════════════════════════════
async function resolverNegocio(pathPrefix, seccion) {
  if (window.__NEGOCIO_ID__ && window.__NEGOCIO_LOCALIDAD__) {
    return {
      id: window.__NEGOCIO_ID__,
      localidad: window.__NEGOCIO_LOCALIDAD__.trim().toLowerCase(),
    };
  }
  const path = window.location.pathname;

  let alias = null;

  // Ruta nueva: /perfil/{alias}/{seccion}
  if (seccion) {
    const matchPerfil = path.match(
      new RegExp(`^/perfil/([^/]+)/${seccion}/?$`),
    );
    if (matchPerfil) alias = decodeURIComponent(matchPerfil[1]);
  }

  // Ruta vieja: /legal/{seccion}/{alias}
  const desdePath = !alias && pathPrefix && path.startsWith(pathPrefix);
  if (desdePath) {
    alias = decodeURIComponent(path.split(pathPrefix)[1] || "").trim();
    alias = alias.split(/[/?#]/)[0];
  }

  const params = new URLSearchParams(window.location.search);
  if (!alias) alias = params.get("alias"); // fallback a links viejos con ?alias=

  console.log(
    "🔍 DEBUG legal-text-core.js — URL completa:",
    window.location.href,
  );
  console.log("🔍 DEBUG alias recibido:", alias);

  if (!alias) {
    const id = params.get("id");
    const localidad = (params.get("localidad") || params.get("l") || "barranca")
      .trim()
      .toLowerCase();
    console.log("🔍 DEBUG fallback id:", id, "localidad:", localidad);
    if (!id) throw new Error("No se especificó el negocio.");
    return { id, localidad };
  }

  const aliasSnap = await getDoc(aliasTiendaDoc(alias));
  console.log("🔍 DEBUG alias existe en Firestore:", aliasSnap.exists());
  if (!aliasSnap.exists()) throw new Error("Perfil no encontrado.");

  const data = aliasSnap.data();
  console.log("🔍 DEBUG data del alias:", data);

  const { id, localidad } = data;
  if (!id || !localidad) throw new Error("Alias mal configurado.");

  return { id, localidad: localidad.trim().toLowerCase() };
}

function formatFecha(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
    if (!d) return "";
    return d.toLocaleDateString("es-PE", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

// ══════════════════════════════════════════
//  RENDER DE PÁRRAFOS
//  El panel admin guarda "parrafos" como ARRAY (uno por cada
//  bloque que se escribió en el editor). Pintamos cada elemento
//  tal cual está en la DB, en el mismo orden.
// ══════════════════════════════════════════
function renderTexto(container, parrafos) {
  container.innerHTML = "";
  (parrafos || []).forEach((p) => {
    const el = document.createElement("p");
    el.className = "legal-paragraph";
    el.textContent = p;
    container.appendChild(el);
  });
}

// ══════════════════════════════════════════
//  INIT GENÉRICO DE PÁGINA LEGAL DE TEXTO
// ══════════════════════════════════════════
export async function initLegalTextPage({
  getContenidoDoc, // (localidad, negocioId) => DocumentReference del texto legal
  footerFlag = null, // clave opcional dentro de biz.footer que debe ser true (ej: "politicas_privacidad")
  tituloFallback = "Documento legal",
  descripcionFallback = "",
  labelSuperior = "Documento legal",
  pathPrefix = null, // ej "/legal/politicas_privacidad/" — fallback para links viejos
  seccion = null, // ej "politicas_privacidad" — habilita /perfil/{alias}/{seccion}
}) {
  const loader = document.getElementById("loaderScreen");
  const mainWrap = document.getElementById("mainWrap");
  const notAvailable = document.getElementById("notAvailableScreen");

  function showNotAvailable(msg) {
    loader.style.display = "none";
    mainWrap.style.display = "none";
    notAvailable.style.display = "flex";
    if (msg) document.getElementById("notAvailableMsg").textContent = msg;
  }

  try {
    const { id, localidad } = await resolverNegocio(pathPrefix, seccion);
    // 1) Datos del negocio (para logo, nombre y color)
    aplicarColoresDesdeCache(id);
    const tiendaRef = tiendaDoc(localidad, "tiendas", id);
    const tiendaSnap = await getDoc(tiendaRef);
    if (!tiendaSnap.exists()) return showNotAvailable("Negocio no encontrado.");

    const biz = tiendaSnap.data();
    const footer = biz.footer || {};
    if (footerFlag && (footer.activo !== true || footer[footerFlag] !== true)) {
      return showNotAvailable(
        "Este negocio no tiene disponible este documento por el momento.",
      );
    }

    // 2) Contenido legal específico (políticas o términos)
    const contenidoRef = getContenidoDoc(localidad, id);
    const contenidoSnap = await getDoc(contenidoRef);
    if (!contenidoSnap.exists()) {
      return showNotAvailable("Este documento aún no fue configurado.");
    }
    const contenido = contenidoSnap.data();

    // 3) Cabecera del negocio + color dominante del logo
    const nombre = biz.nombre_tienda || biz.nombre || "Negocio";
    const logoUrl = biz.img_tienda?.logo_tienda || null;
    document.getElementById("bizNombre").textContent = nombre;

    const titulo = contenido.titulo || tituloFallback;

    const logoImg = document.getElementById("bizLogo");
    const logoLetter = document.getElementById("bizLogoLetter");

  // Colores dinámicos (color_marca → logo → nombre), usando el biz que ya leíste
const colorReady = cargarColoresNegocio({ id, localidad, biz }).catch((e) =>
  console.warn("colores:", e.message),
);

if (logoUrl) {
  logoImg.src = logoUrl;
  logoImg.style.display = "block";
  logoLetter.style.display = "none";
  setFaviconCircular(logoUrl);
} else {
  logoLetter.textContent = nombre.trim().charAt(0).toUpperCase();
}
    // 4) Pintar contenido legal
    document.getElementById("labelSuperior").textContent = labelSuperior;
    document.getElementById("legalTitulo").textContent = titulo;

    const descripcion = contenido.descripcion || descripcionFallback;
    const descEl = document.getElementById("legalDescripcion");
    if (descripcion) {
      descEl.textContent = descripcion;
      descEl.style.display = "block";
    } else {
      descEl.style.display = "none";
    }

    // ── FIX: leer el array "parrafos" (formato real que guarda el panel admin) ──
    // Si algún doc viejo quedó como string único en "texto"/"contenido"/"cuerpo",
    // lo partimos por doble salto de línea para no perder esa data.
    const parrafos =
      Array.isArray(contenido.parrafos) && contenido.parrafos.length
        ? contenido.parrafos.filter((p) => typeof p === "string" && p.trim())
        : String(
            contenido.texto || contenido.contenido || contenido.cuerpo || "",
          )
            .split(/\n{2,}/)
            .map((p) => p.trim())
            .filter(Boolean);

    renderTexto(document.getElementById("legalTexto"), parrafos);

    const fechaTxt = formatFecha(
      contenido.fecha_actualizacion || contenido.actualizado,
    );
    const fechaEl = document.getElementById("legalFecha");
    if (fechaTxt) {
      fechaEl.textContent = `Última actualización: ${fechaTxt}`;
      fechaEl.style.display = "block";
    } else {
      fechaEl.style.display = "none";
    }

    const razonSocial =
      contenido["razon social"] || contenido.razon_social || "";
    const badgesWrap = document.getElementById("legalBadges");
    if (badgesWrap) {
      const chips = [];
      if (razonSocial)
        chips.push(
          `<span class="legal-chip"><i class="fa-solid fa-signature"></i> ${razonSocial}</span>`,
        );
      if (contenido.ruc)
        chips.push(
          `<span class="legal-chip"><i class="fa-solid fa-building"></i> RUC ${contenido.ruc}</span>`,
        );
      badgesWrap.innerHTML = chips.join("");
      badgesWrap.style.display = chips.length ? "flex" : "none";
    }

    await colorReady;

    loader.style.display = "none";
    mainWrap.style.display = "block";
    requestAnimationFrame(() => mainWrap.classList.add("in"));
  } catch (err) {
    console.error(err);
    showNotAvailable(err.message || "Ocurrió un error al cargar el documento.");
  }
}
