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

/* ═══════════════════════════════════════
   VALIDACIÓN PARAMS
═══════════════════════════════════════ */

if (!idTienda || !tokenId) {
  renderError("Link inválido", "El enlace no contiene información válida.");

  throw new Error("Parámetros inválidos");
}

/* ═══════════════════════════════════════
   ELEMENTOS UI
═══════════════════════════════════════ */

const businessName = document.getElementById("businessName");
const bizInline = document.getElementById("bizInline");
const storeId = document.getElementById("storeId");
const businessLogo = document.getElementById("businessLogo");

const btn = document.getElementById("ctaBtn");
const fill = document.getElementById("fill");
const pct = document.getElementById("pct");

/* ═══════════════════════════════════════
   FLAGS
═══════════════════════════════════════ */

let waUrl = "";

let timerDone = false;
let descuentoDone = false;

/* ═══════════════════════════════════════
   REDIRECCIÓN
═══════════════════════════════════════ */

function intentarRedirigir() {
  if (timerDone && descuentoDone && waUrl) {
    console.log("✅ Timer + descuento listos");

     location.href = waUrl;
  }
}

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */

window.addEventListener("load", async () => {
  console.log("🚀 INIT");

  try {
    const tiendaRef = doc(db, "lugares", idTienda);

    const tokenRef = doc(
      dbPlanes,
      "creditos_tienda",
      idTienda,
      "interaccion_directa_bot",
      tokenId,
    );

    console.log("📄 tiendaRef →", tiendaRef.path);
    console.log("📄 tokenRef →", tokenRef.path);

    const [tiendaSnap, tokenSnap] = await Promise.all([
      getDoc(tiendaRef),
      getDoc(tokenRef),
    ]);

    /* ═══════════════════════════════════════
       VALIDACIONES
    ═══════════════════════════════════════ */

    if (!tiendaSnap.exists()) {
      renderError("Tienda no encontrada", "La tienda solicitada no existe.");
      return;
    }

    if (!tokenSnap.exists()) {
      renderError("Link no válido", "Este enlace no existe.");
      return;
    }

    const tiendaData = tiendaSnap.data() || {};
    const tokenData = tokenSnap.data() || {};

    console.log("📦 tiendaData →", tiendaData);
    console.log("📦 tokenData →", tokenData);

    /* ═══════════════════════════════════════
       VALIDAR EXPIRACIÓN
    ═══════════════════════════════════════ */

    const fin = tokenData?.fin;
    const ahora = Date.now();

    console.log(
      "⏰ fin →",
      fin ? new Date(fin.toMillis()).toLocaleString() : "sin fin",
    );

    console.log("⏰ ahora →", new Date(ahora).toLocaleString());

    if (fin && ahora > fin.toMillis()) {
      console.warn("⚠️ Link expirado");

      renderError(
        "Link expirado",
        "Este enlace ya expiro Recuerda que los enlaces de contacto duran 24h ",
        tiendaData,
      );

      return;
    }

    /* ═══════════════════════════════════════
       DATOS TIENDA
    ═══════════════════════════════════════ */

    const nombre = tiendaData?.nombre || "Mi Tienda";

    const localidad = tiendaData?.localidad || "barranca";

    const categoria = tiendaData?.categoria || "negocios";

    const logo = tiendaData?.img || "";

    const numero = tiendaData?.whatsapp || "";

    const mensaje = tiendaData?.msje_whatsapp || "Hola";

    console.log("🏪 nombre →", nombre);
    console.log("📞 numero →", numero);
    console.log("💬 mensaje →", mensaje);

    if (!numero) {
      renderError("Sin WhatsApp", "La tienda no tiene WhatsApp configurado.");

      return;
    }

    /* ═══════════════════════════════════════
       WHATSAPP URL
    ═══════════════════════════════════════ */

    waUrl = `https://wa.me/${numero}` + `?text=${encodeURIComponent(mensaje)}`;

    btn.href = waUrl;

    console.log("🔗 waUrl →", waUrl);

    /* ═══════════════════════════════════════
       UI
    ═══════════════════════════════════════ */

    businessName.textContent = nombre;
    bizInline.textContent = nombre;
    storeId.textContent = nombre;

    if (logo) {
      const img = new Image();

      img.onload = () => {
        businessLogo.src = logo;

        requestAnimationFrame(() => {
          businessLogo.classList.add("loaded");
        });

        console.log("🖼️ Logo cargado");
      };

      img.onerror = () => {
        console.warn("⚠️ Error logo");
      };

      img.src = logo;
    }

    /* ═══════════════════════════════════════
       ESTADÍSTICAS + DESCUENTO
    ═══════════════════════════════════════ */

    try {
      const fechaId = new Date().toISOString().split("T")[0];

      const estadisticaRef = doc(
        dbPlanes,
        "creditos_tienda",
        idTienda,
        "estadisticas",
        fechaId,
      );

      const creditosRef = doc(dbPlanes, "creditos_tienda", idTienda);

      /* ═══════════════════════════════════════
         LEER PRECIOS
      ═══════════════════════════════════════ */

      const preciosSnap = await getDoc(
        doc(dbPlanes, "precio_apartado", "bot_daniel"),
      );

      const preciosData = preciosSnap.exists() ? preciosSnap.data() : {};

      const monedas = Number(preciosData?.contacto_directo ?? 20);

      const deudaMaxima = Number(preciosData?.saldo_deuda_maxima ?? 300);

      console.log("💰 monedas →", monedas);
      console.log("🚨 deudaMaxima →", deudaMaxima);

      /* ═══════════════════════════════════════
         CRÉDITOS
      ═══════════════════════════════════════ */

      const creditosSnapAntes = await getDoc(creditosRef);

      const creditosAntes = Number(
        creditosSnapAntes.exists()
          ? (creditosSnapAntes.data()?.creditos ?? 0)
          : 0,
      );

      const deudaActual = Number(
        creditosSnapAntes.exists()
          ? (creditosSnapAntes.data()?.deuda_pendiente ?? 0)
          : 0,
      );

      const descontarDeCreditos = Math.min(monedas, Math.max(creditosAntes, 0));

      const irADeuda = monedas - descontarDeCreditos;

      console.log("💳 creditosAntes →", creditosAntes);
      console.log("📋 deudaActual →", deudaActual);

      /* ═══════════════════════════════════════
         WRITES PRINCIPALES
      ═══════════════════════════════════════ */

      await Promise.all([
        /* 1️⃣ Estadísticas */

        setDoc(
          estadisticaRef,
          {
            clicks: increment(1),
            monedasGastadas: increment(monedas),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ),

        /* 2️⃣ Descontar créditos */

        setDoc(
          creditosRef,
          {
            creditos: increment(-descontarDeCreditos),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ),

        /* 3️⃣ Historial + puntos */

        (async () => {
          const tiendaGeinzRef = doc(
            db,
            "Tiendas",
            localidad,
            localidad,
            idTienda,
          );

          const tiendaGeinzSnap = await getDoc(tiendaGeinzRef);

          if (!tiendaGeinzSnap.exists()) {
            console.warn("⚠️ Tienda no encontrada");
            return;
          }

          const datosGeinz = tiendaGeinzSnap.data() || {};

          const puntosActuales = Math.max(
            Number(datosGeinz.puntos_tienda || 0),
            0,
          );

          const descuentoReal = Math.min(monedas, puntosActuales);

          const monto_restante = Math.max(puntosActuales - descuentoReal, 0);

          const nombre_tienda = datosGeinz.nombre_tienda || "Sin nombre";

          /* ═══════════════════════════════════════
             FECHA
          ═══════════════════════════════════════ */

          const now = new Date();

          const zona = {
            timeZone: "America/Lima",
          };

          const fecha = now.toLocaleDateString("es-PE", {
            ...zona,
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          });

          const hora = now.toLocaleTimeString("es-PE", {
            ...zona,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });

          const precio_soles = (monedas * 0.01).toFixed(2);

          const id_transaccion = crypto.randomUUID();

          /* ═══════════════════════════════════════
             HISTORIAL
          ═══════════════════════════════════════ */

          const historialFinancieroRef = doc(
            db,
            "Tiendas",
            localidad,
            localidad,
            idTienda,
            "historial_financiero",
            id_transaccion,
          );

          const writes = [
            /* puntos_tienda */

            setDoc(
              tiendaGeinzRef,
              {
                puntos_tienda: monto_restante,
              },
              { merge: true },
            ),

            /* historial */

            setDoc(historialFinancieroRef, {
              datos_recarga: {
                estado: "Aceptado",
                monto_descontado: monedas,
                monto_restante: monto_restante,
                precio_soles: precio_soles,
                tipo_paquete: "Contacto directo (WhatsApp)",
              },

              datos_tienda: {
                id_tienda: idTienda,
                localidad_tienda: localidad,
                nombre_tienda: nombre_tienda,
              },

              hora_fecha: {
                fecha: fecha,
                hora: hora,
              },

              id_transaccion: id_transaccion,

              timestamp: serverTimestamp(),

              tipo_transacción: "descuento",
            }),
          ];

          /* ═══════════════════════════════════════
             DEUDA
          ═══════════════════════════════════════ */

          if (irADeuda > 0) {
            const nuevaDeuda = deudaActual + irADeuda;

            console.log("🔴 nuevaDeuda →", nuevaDeuda);

            /* ═══════════════════════════════════════
               TODAVÍA NO LLEGA AL LÍMITE
            ═══════════════════════════════════════ */

            if (nuevaDeuda <= deudaMaxima) {
              writes.push(
                setDoc(
                  creditosRef,
                  {
                    deuda_pendiente: increment(irADeuda),

                    updatedAt: serverTimestamp(),
                  },
                  { merge: true },
                ),
              );

              console.log("📝 deuda acumulada");

              /* NOTIFICAR */

              await fetch(
                "https://enviar-notificacion-deuda-acumulada-oixttik5rq-uc.a.run.app",
                {
                  method: "POST",

                  headers: {
                    "Content-Type": "application/json",
                  },

                  body: JSON.stringify({
                    id_tienda: idTienda,
                    localidad: localidad,
                    nombre_negocio: nombre_tienda,
                    deuda: nuevaDeuda,

                    // ✅ TÍTULO DINÁMICO
                    titulo:
                      nuevaDeuda >= deudaMaxima
                        ? "🚫 Tu plantilla premium fue desactivada"
                        : `⚠️ ${nombre_tienda}, tienes deuda acumulada`,

                    // ✅ MENSAJE DINÁMICO
                    mensaje:
                      nuevaDeuda >= deudaMaxima
                        ? `🚨 Tu negocio alcanzó ${nuevaDeuda} créditos de deuda acumulada.❌ Tu plantilla premium y contacto directo por WhatsApp fueron desactivados automáticamente.📲 Los enlaces activos fueron cancelados para evitar seguir acumulando deuda.💳 Recarga saldo para volver a activar todas las funciones premium de tu negocio 🚀`
                        : `🚨 Tu negocio tiene una deuda acumulada de ${nuevaDeuda} créditos 💳 📲 Tu WhatsApp sigue recibiendo clientes y clicks directos gracias a tu plantilla premium 🚀 🔥 Recarga tu saldo para evitar interrupciones y seguir recibiendo pedidos. ⚠️ Si superas los ${deudaMaxima} créditos de deuda, tu cuenta pasará automáticamente al plan gratis.`,
                    // ✅ LINK DINÁMICO
                    link: "https://geinzworkapp.web.app/share?t=scr&id=rec",
                  }),
                },
              );
            } else {
              /* ═══════════════════════════════════════
               DEUDA MÁXIMA
            ═══════════════════════════════════════ */
              console.warn("🚫 deuda máxima alcanzada");

              const tokenRef = doc(
                dbPlanes,
                "creditos_tienda",
                idTienda,
                "interaccion_directa_bot",
                tokenId,
              );

              const lugarRef = doc(db, "lugares", idTienda);

              const lugarSnap = await getDoc(lugarRef);

              const plantillaActual = lugarSnap.exists()
                ? lugarSnap.data()?.plantilla
                : false;

              console.log("🎨 plantilla →", plantillaActual);

              const tiendaGeinzRef_data = doc(
                db,
                "Tiendas",
                localidad,
                localidad,
                idTienda,
              );
              /* DESACTIVAR PLANTILLA */

              if (plantillaActual === true) {
                writes.push(
                  setDoc(
                    lugarRef,
                    {
                      plantilla: false,
                    },
                    { merge: true },
                  ),
                );

                console.log("❌ plantilla → false");
              }

              // ✅ SIEMPRE desactivar bot_plan_pro
              writes.push(
                setDoc(
                  tiendaGeinzRef_data,
                  {
                    bot_plan_pro: false,
                  },
                  { merge: true },
                ),
              );

              console.log("❌ bot_plan_pro → false");

              /* EXPIRAR LINK */

              writes.push(
                setDoc(
                  tokenRef,
                  {
                    fin: serverTimestamp(),

                    expired_by_debt: true,

                    updatedAt: serverTimestamp(),
                  },
                  { merge: true },
                ),
              );

              console.log("⛔ link expirado");
            }
          } else {
            console.log("✅ saldo suficiente");
          }

          await Promise.all(writes);

          console.log("✅ historial_financiero guardado");
        })(),
      ]);

      console.log("🎉 Click procesado");

      descuentoDone = true;

      intentarRedirigir();
    } catch (e) {
      console.warn("⚠️ Error estadísticas:", e.code, e.message);

      descuentoDone = true;

      intentarRedirigir();
    }
  } catch (e) {
    console.error("💥 Error general:", e.code, e.message, e);

    renderError(
      "Error inesperado",
      "Ocurrió un problema cargando la información.",
    );
  }
});

/* ═══════════════════════════════════════
   BARRA PROGRESO
═══════════════════════════════════════ */

const TOTAL = 2200;

const TICK = 30;

let elapsed = 0;

const timer = setInterval(() => {
  elapsed += TICK;

  const progress = Math.min(Math.round((elapsed / TOTAL) * 100), 100);

  fill.style.width = progress + "%";

  pct.textContent = progress + "%";

  if (elapsed >= TOTAL && !timerDone) {
    timerDone = true;

    clearInterval(timer);

    console.log("⏱️ Timer completado");

    intentarRedirigir();
  }
}, TICK);

/* ═══════════════════════════════════════
   ERROR UI + BANNER EXPIRADO
═══════════════════════════════════════ */

function renderError(titulo, descripcion, tiendaData = null) {
  console.error("🔴 renderError →", titulo, descripcion);

  let bannerHTML = "";

  // ✅ SOLO SI HAY DATOS DE TIENDA
  if (tiendaData) {
    const categoria = (tiendaData?.categoria || "negocios")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "+");

    const localidad = tiendaData?.localidad || "barranca";

    const perfilUrl =
      `https://geinzworkapp.web.app/share?t=ti` +
      `&id=${idTienda}` +
      `&l=${encodeURIComponent(localidad)}` +
      `&c=${categoria}`;

    bannerHTML = `

      <div class="geinz-banner">

   

        <div class="geinz-banner-right">

          <span class="geinz-mini-badge">
            Perfil disponible en Geinz
          </span>

          <h3 class="geinz-title">
            Puedes ver el perfil completo del negocio desde Geinz
          </h3>

          <p class="geinz-desc">
            Explora promociones, catálogo,
            reservas, ubicación y mucho más.
          </p>

          <a
            href="${perfilUrl}"
            class="geinz-btn"
            target="_blank"
            rel="noopener"
          >
            Ver perfil completo
          </a>

        </div>
             <div class="geinz-banner-left">

          <div class="geinz-logo-wrap">

            <img
              class="geinz-logo"
              src="${tiendaData?.img || "https://placehold.co/90x90"}"
              alt="Logo negocio"
            />

          </div>

        </div>

      </div>
    `;
  }

  document.body.innerHTML = `
    <div class="error404">

      <div class="error-glow"></div>

      <div class="error-card">

        <span class="error-code">
          404
        </span>

        <h1>
          ${titulo}
        </h1>

        <p>
          ${descripcion}
        </p>

        ${bannerHTML}

      </div>

    </div>
  `;
}
