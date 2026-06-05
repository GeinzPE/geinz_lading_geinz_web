import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  increment,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ═══════════════════════════════════════
   FIREBASE APPS
═══════════════════════════════════════ */

const appGeinz = initializeApp(
  {
    apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
    authDomain: "geinzworkapp.firebaseapp.com",
    projectId: "geinzworkapp",
    storageBucket: "geinzworkapp.appspot.com",
    messagingSenderId: "921389328767",
    appId: "1:921389328767:web:094e8a2a5fcd69395b524a",
  },
  "geinz",
);

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

const db = getFirestore(appGeinz);
const dbPlanes = getFirestore(appPlanes);

/* ═══════════════════════════════════════
   PARAMS
═══════════════════════════════════════ */

const p = (k) => new URLSearchParams(location.search).get(k) || "";

const idTienda = p("id_tienda");
const tokenId = p("contacto");

console.log("🔍 PARAMS →", { idTienda, tokenId });

if (!idTienda || !tokenId) {
  renderError("Link inválido", "El enlace no contiene información válida.");
  throw new Error("Parámetros inválidos");
}

/* ═══════════════════════════════════════
   ELEMENTOS UI
═══════════════════════════════════════ */

const businessName = document.getElementById("businessName");
const bizInline    = document.getElementById("bizInline");
const storeId      = document.getElementById("storeId");
const businessLogo = document.getElementById("businessLogo");
const btn          = document.getElementById("ctaBtn");
const fill         = document.getElementById("fill");
const pct          = document.getElementById("pct");

/* ═══════════════════════════════════════
   FLAGS
═══════════════════════════════════════ */

let waUrl         = "";
let descuentoDone = false;

function intentarRedirigir() {
  console.log("🔁 intentarRedirigir →", { descuentoDone, waUrl });
  if (descuentoDone && waUrl) {
    console.log("✅ Redirigiendo a:", waUrl);
    location.href = waUrl;
  }
}

/* ═══════════════════════════════════════
   BARRA PROGRESO (solo UX)
═══════════════════════════════════════ */

const TOTAL = 2200;
const TICK  = 30;
let elapsed = 0;

const timer = setInterval(() => {
  elapsed += TICK;
  const progress = Math.min(Math.round((elapsed / TOTAL) * 100), 100);
  fill.style.width = progress + "%";
  pct.textContent  = progress + "%";
  if (elapsed >= TOTAL) {
    clearInterval(timer);
    console.log("⏱️ Timer completado (solo UX)");
  }
}, TICK);

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */

let costo_por_moneda = 0;

window.addEventListener("load", async () => {
  console.log("🚀 INIT");

  try {
    /* costo_por_moneda */
    try {
      console.log("📡 Fetching precio_apartado/app...");
      const precioSnap = await getDoc(doc(dbPlanes, "precio_apartado", "app"));
      costo_por_moneda = Number(precioSnap.data()?.costo_por_moneda || 0);
      console.log("✅ costo_por_moneda →", costo_por_moneda);
    } catch (e) {
      console.warn("⚠️ No se pudo leer costo_por_moneda:", e.message);
    }

    const tiendaRef = doc(db, "lugares", idTienda);
    const tokenRef  = doc(dbPlanes, "creditos_tienda", idTienda, "interaccion_directa_bot", tokenId);

    console.log("📡 Fetching tienda y token...");
    const [tiendaSnap, tokenSnap] = await Promise.all([
      getDoc(tiendaRef),
      getDoc(tokenRef),
    ]);
    console.log("✅ tienda y token ok");

    if (!tiendaSnap.exists()) {
      renderError("Tienda no encontrada", "La tienda solicitada no existe.");
      return;
    }
    if (!tokenSnap.exists()) {
      renderError("Link no válido", "Este enlace no existe.");
      return;
    }

    const tiendaData = tiendaSnap.data() || {};
    const tokenData  = tokenSnap.data() || {};

    console.log("📦 tiendaData →", tiendaData);
    console.log("📦 tokenData →", tokenData);

    /* EXPIRACIÓN */
    const fin   = tokenData?.fin;
    const ahora = Date.now();

    if (fin && ahora > fin.toMillis()) {
      console.warn("⚠️ Link expirado");
      renderError("Link expirado", "Este enlace ya expiró. Recuerda que los enlaces de contacto duran 24h.", tiendaData);
      return;
    }

    /* DATOS TIENDA */
    const nombre    = tiendaData?.nombre || "Mi Tienda";
    const localidad = tiendaData?.localidad || "barranca";
    const logo      = tiendaData?.img || "";
    const numero    = tiendaData?.whatsapp || "";
    const mensaje   = tiendaData?.msje_whatsapp || "Hola";

    console.log("🏪 nombre →", nombre, "| 📞 numero →", numero);

    if (!numero) {
      renderError("Sin WhatsApp", "La tienda no tiene WhatsApp configurado.");
      return;
    }

    /* WHATSAPP URL */
    waUrl     = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
    btn.href  = waUrl;
    console.log("🔗 waUrl →", waUrl);

    /* UI */
    businessName.textContent = nombre;
    bizInline.textContent    = nombre;
    storeId.textContent      = nombre;

    if (logo) {
      const img  = new Image();
      img.onload = () => {
        businessLogo.src = logo;
        requestAnimationFrame(() => businessLogo.classList.add("loaded"));
        console.log("🖼️ Logo cargado");
      };
      img.onerror = () => console.warn("⚠️ Error logo");
      img.src = logo;
    }

    /* ═══════════════════════════════════════
       ESTADÍSTICAS + DESCUENTO
    ═══════════════════════════════════════ */

    try {
      const fechaId        = new Date().toISOString().split("T")[0];
      const estadisticaRef = doc(dbPlanes, "creditos_tienda", idTienda, "estadisticas", fechaId);
      const creditosRef    = doc(dbPlanes, "creditos_tienda", idTienda);

      /* PRECIOS */
      console.log("📡 Fetching precios bot_daniel...");
      const preciosSnap = await getDoc(doc(dbPlanes, "precio_apartado", "bot_daniel"));
      console.log("✅ precios ok");

      const preciosData = preciosSnap.exists() ? preciosSnap.data() : {};
      const monedas     = Number(preciosData?.contacto_directo ?? 20);
      const deudaMaxima = Number(preciosData?.saldo_deuda_maxima ?? 300);

      console.log("💰 monedas →", monedas, "| deudaMaxima →", deudaMaxima);

      /* ════════════════════════════════════════
         MAESTRA: leer puntos_tienda de Geinz
         Todos los cálculos parten de aquí.
      ════════════════════════════════════════ */
      console.log("📡 Fetching tiendaGeinz (MAESTRA)...");
      const tiendaGeinzRef  = doc(db, "Tiendas", localidad, localidad, idTienda);
      const tiendaGeinzSnap = await getDoc(tiendaGeinzRef);
      console.log("✅ tiendaGeinz ok, exists:", tiendaGeinzSnap.exists());

      if (!tiendaGeinzSnap.exists()) {
        console.warn("⚠️ Tienda Geinz no encontrada");
        renderError("Tienda no encontrada", "No se encontró la información del negocio.");
        return;
      }

      const datosGeinz    = tiendaGeinzSnap.data() || {};
      const nombre_tienda = datosGeinz.nombre_tienda || "Sin nombre";

      // ✅ Saldo real viene de la MAESTRA
      const saldoActual         = Math.max(Number(datosGeinz.puntos_tienda || 0), 0);
      const descontarDeSaldo    = Math.min(monedas, saldoActual);
      const saldo_restante      = Math.max(saldoActual - descontarDeSaldo, 0);
      const irADeuda            = monedas - descontarDeSaldo;

      console.log("💎 saldoActual (maestra) →", saldoActual);
      console.log("💎 saldo_restante →", saldo_restante);
      console.log("🔴 irADeuda →", irADeuda);

      /* deuda actual de dbPlanes (solo para acumular, no para calcular saldo) */
      console.log("📡 Fetching deuda actual dbPlanes...");
      const creditosSnapAntes = await getDoc(creditosRef);
      const deudaActual       = Number(creditosSnapAntes.exists() ? (creditosSnapAntes.data()?.deuda_pendiente ?? 0) : 0);
      console.log("📋 deudaActual →", deudaActual);

      /* FECHA */
      const now   = new Date();
      const zona  = { timeZone: "America/Lima" };
      const fecha = now.toLocaleDateString("es-PE", { ...zona, day: "2-digit", month: "2-digit", year: "numeric" });
      const hora  = now.toLocaleTimeString("es-PE", { ...zona, hour: "2-digit", minute: "2-digit", hour12: false });

      const precio_soles   = (monedas * costo_por_moneda).toFixed(2);
      const id_transaccion = crypto.randomUUID();

      const historialFinancieroRef = doc(
        db, "Tiendas", localidad, localidad, idTienda,
        "historial_financiero", id_transaccion,
      );

      /* ════════════════════════════════════════
         WRITES — saldo_restante va igual en ambas DBs
      ════════════════════════════════════════ */

      const writes = [

        /* 1️⃣ Estadísticas dbPlanes */
        setDoc(estadisticaRef, {
          clicks: increment(1),
          monedasGastadas: increment(monedas),
          updatedAt: serverTimestamp(),
        }, { merge: true }),

        /* 2️⃣ COPIA → dbPlanes creditos = saldo_restante (copia de la maestra) */
        setDoc(creditosRef, {
          creditos: saldo_restante,
          updatedAt: serverTimestamp(),
        }, { merge: true }).then(() => console.log("✅ creditos dbPlanes →", saldo_restante)),

        /* 3️⃣ MAESTRA → Geinz puntos_tienda = saldo_restante */
        setDoc(tiendaGeinzRef, {
          puntos_tienda: saldo_restante,
        }, { merge: true }).then(() => console.log("✅ puntos_tienda Geinz →", saldo_restante)),

        /* 4️⃣ Historial */
        setDoc(historialFinancieroRef, {
          datos_recarga: {
            estado: "Aceptado",
            monto_descontado: monedas,
            monto_restante: saldo_restante,
            precio_soles,
            tipo_paquete: "Contacto directo (WhatsApp)",
          },
          datos_tienda: {
            id_tienda: idTienda,
            localidad_tienda: localidad,
            nombre_tienda,
          },
          hora_fecha: { fecha, hora },
          id_transaccion,
          timestamp: serverTimestamp(),
          tipo_transacción: "descuento",
        }),
      ];

      /* DEUDA */
      if (irADeuda > 0) {
        const nuevaDeuda = deudaActual + irADeuda;
        console.log("🔴 nuevaDeuda →", nuevaDeuda);

        if (nuevaDeuda <= deudaMaxima) {
          writes.push(
            setDoc(creditosRef, {
              deuda_pendiente: increment(irADeuda),
              updatedAt: serverTimestamp(),
            }, { merge: true }),
          );
          console.log("📝 deuda acumulada");

          await fetch("https://enviar-notificacion-deuda-acumulada-oixttik5rq-uc.a.run.app", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id_tienda: idTienda,
              localidad,
              nombre_negocio: nombre_tienda,
              deuda: nuevaDeuda,
              titulo: nuevaDeuda >= deudaMaxima
                ? "🚫 Tu plantilla premium fue desactivada"
                : `⚠️ ${nombre_tienda}, tienes deuda acumulada`,
              mensaje: nuevaDeuda >= deudaMaxima
                ? `🚨 Tu negocio alcanzó ${nuevaDeuda} créditos de deuda acumulada.❌ Tu plantilla premium y contacto directo por WhatsApp fueron desactivados automáticamente.📲 Los enlaces activos fueron cancelados para evitar seguir acumulando deuda.💳 Recarga saldo para volver a activar todas las funciones premium de tu negocio 🚀`
                : `🚨 Tu negocio tiene una deuda acumulada de ${nuevaDeuda} créditos 💳 📲 Tu WhatsApp sigue recibiendo clientes y clicks directos gracias a tu plantilla premium 🚀 🔥 Recarga tu saldo para evitar interrupciones y seguir recibiendo pedidos. ⚠️ Si superas los ${deudaMaxima} créditos de deuda, tu cuenta pasará automáticamente al plan gratis.`,
              link: "https://geinzworkapp.web.app/api/share?t=scr&id=rec",
            }),
          });

        } else {
          console.warn("🚫 deuda máxima alcanzada");

          const tokenRefDeuda   = doc(dbPlanes, "creditos_tienda", idTienda, "interaccion_directa_bot", tokenId);
          const lugarRef        = doc(db, "lugares", idTienda);

          console.log("📡 Fetching lugarRef...");
          const lugarSnap       = await getDoc(lugarRef);
          const plantillaActual = lugarSnap.exists() ? lugarSnap.data()?.plantilla : false;
          console.log("🎨 plantilla →", plantillaActual);

          if (plantillaActual === true) {
            writes.push(setDoc(lugarRef, { plantilla: false }, { merge: true }));
            console.log("❌ plantilla → false");
          }

          writes.push(setDoc(tiendaGeinzRef, { bot_plan_pro: false }, { merge: true }));
          console.log("❌ bot_plan_pro → false");

          writes.push(setDoc(tokenRefDeuda, {
            fin: serverTimestamp(),
            expired_by_debt: true,
            updatedAt: serverTimestamp(),
          }, { merge: true }));
          console.log("⛔ link expirado por deuda");
        }
      } else {
        console.log("✅ saldo suficiente, sin deuda");
      }

      console.log("📡 Ejecutando todos los writes...");
      await Promise.all(writes);
      console.log("🎉 Click procesado — saldo_restante:", saldo_restante);

      descuentoDone = true;
      intentarRedirigir();

    } catch (e) {
      console.warn("⚠️ Error estadísticas:", e.code, e.message, e);
      descuentoDone = true;
      intentarRedirigir();
    }

  } catch (e) {
    console.error("💥 Error general:", e.code, e.message, e);
    renderError("Error inesperado", "Ocurrió un problema cargando la información.");
  }
});

/* ═══════════════════════════════════════
   ERROR UI
═══════════════════════════════════════ */

function renderError(titulo, descripcion, tiendaData = null) {
  console.error("🔴 renderError →", titulo, descripcion);

  let bannerHTML = "";

  if (tiendaData) {
    const categoria = (tiendaData?.categoria || "negocios").toLowerCase().trim().replace(/\s+/g, "+");
    const localidad = tiendaData?.localidad || "barranca";
    const perfilUrl =
      `https://geinzworkapp.web.app/api/share?t=ti` +
      `&id=${idTienda}` +
      `&l=${encodeURIComponent(localidad)}` +
      `&c=${categoria}`;

    bannerHTML = `
      <div class="geinz-banner">
        <div class="geinz-banner-right">
          <span class="geinz-mini-badge">Perfil disponible en Geinz</span>
          <h3 class="geinz-title">Puedes ver el perfil completo del negocio desde Geinz</h3>
          <p class="geinz-desc">Explora promociones, catálogo, reservas, ubicación y mucho más.</p>
          <a href="${perfilUrl}" class="geinz-btn" target="_blank" rel="noopener">Ver perfil completo</a>
        </div>
        <div class="geinz-banner-left">
          <div class="geinz-logo-wrap">
            <img class="geinz-logo" src="${tiendaData?.img || "https://placehold.co/90x90"}" alt="Logo negocio"/>
          </div>
        </div>
      </div>`;
  }

  document.body.innerHTML = `
    <div class="error404">
      <div class="error-glow"></div>
      <div class="error-card">
        <span class="error-code">404</span>
        <h1>${titulo}</h1>
        <p>${descripcion}</p>
        ${bannerHTML}
      </div>
    </div>`;
}