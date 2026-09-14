import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ═══════════════════════════════════════════════════════
// FIREBASE
// ═══════════════════════════════════════════════════════

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

// Geinz (centralizado desde db.js)
import { app } from "../db/db.js";

const dbPlanes = getFirestore(appPlanes);

const functions = getFunctions(app, "us-central1");

const agregar_pado_usaurio_tienda = httpsCallable(
  functions,
  "agregar_pago_para_el_usuario_tienda",
);
// ═══════════════════════════════════════════════════════
// VARIABLES
// ═══════════════════════════════════════════════════════

const wrapper = document.getElementById("planes-wrapper");

const ordenPlanes = ["basico", "avanzado", "primium", "busness"];

window._procesandoPago = false;

// ═══════════════════════════════════════════════════════
// RECIBIR DATOS DEL PANEL PADRE
// ═══════════════════════════════════════════════════════

window.addEventListener("message", (event) => {
  // SALDO
  if (event.data?.type === "SALDO_UPDATE") {
    const saldo = Number(event.data.saldo || 0);

    
    window._saldo_tienda = saldo;

    return;
  }

  // DATOS TIENDA
  if (event.data?.type === "DATOS_TIENDA") {
    const tienda = event.data.payload || {};

    
    window._userId = tienda.id_tienda || "";

    window._nombre_tienda = tienda.nombre_tienda || "";

    window._localidad_tienda = tienda.localidad || "";

    window._categoria_tienda = tienda.categoria_tienda || "";

    window._logo_tienda = tienda.logo_tienda || "";

    window._saldo_tienda = Number(tienda.saldo_tienda || 0);

      }
});

// ═══════════════════════════════════════════════════════
// RESTAURAR BOTONES AL VOLVER
// ═══════════════════════════════════════════════════════

window.addEventListener("pageshow", () => {
  if (document.referrer.includes("pagos")) {
    
    restaurarBotones();
  }
});

// ═══════════════════════════════════════════════════════
// RESTAURAR BOTONES
// ═══════════════════════════════════════════════════════

function restaurarBotones() {
  window._procesandoPago = false;

  document.querySelectorAll(".btn-plan").forEach((b) => {
    b.disabled = false;

    b.classList.remove("disabled-all", "loading");

    const progress = b.querySelector(".btn-progress");

    if (progress) {
      progress.remove();
    }

    const texto = b.querySelector(".btn-text");

    if (texto) {
      b.innerHTML = texto.textContent;
    }
  });
}

// ═══════════════════════════════════════════════════════
// CARGAR PLANES
// ═══════════════════════════════════════════════════════

async function cargarPlanes() {
  try {
    const querySnapshot = await getDocs(
      collection(dbPlanes, "precios_planes_geinz"),
    );

    const planesData = {};

    querySnapshot.forEach((doc) => {
      planesData[doc.id] = doc.data();
    });

    wrapper.innerHTML = "";

    ordenPlanes.forEach((idPlan) => {
      const plan = planesData[idPlan];

      if (!plan) return;

      const precioFormateado = new Intl.NumberFormat("es-PE", {
        style: "currency",
        currency: "PEN",
      }).format(plan.precio_soles);

      const monedasFormateadas = new Intl.NumberFormat("es-PE").format(
        plan.monedas_inicial || plan.monedas || 0,
      );

      let bonoHTML = "";

      let claseExtraPadding = "no-gift-padding";

      if (plan.monedas_agregadas && plan.monedas_agregadas > 0) {
        bonoHTML = `
                    <div class="gift-badge">
                        🎁 +${plan.monedas_agregadas} de regalo
                    </div>
                `;

        claseExtraPadding = "";
      }

      let accesosHTML = "";

      if (Array.isArray(plan.accesos)) {
        plan.accesos.forEach((acceso) => {
          accesosHTML += `
                        <li>${acceso}</li>
                    `;
        });
      }

      const esAvanzado = idPlan === "avanzado" ? "avanzado-destacado" : "";

      const card = document.createElement("div");

      card.className = `plan-card ${esAvanzado}`;

      card.innerHTML = `
                <div class="plan-name">
                    ${plan.nombre || plan.nombre_plan}
                </div>

                <div class="plan-coins-wrapper">
                    <span class="plan-coins">
                        ${monedasFormateadas}
                    </span>

                    <img
                        class="coin-icon"
                        src="../img/icon_monedas_3d.webp"
                        alt="coin"
                    />
                </div>

                ${bonoHTML}

                <ul class="benefits-list ${claseExtraPadding}">
                    ${accesosHTML}
                </ul>

                <button
                    class="btn-price btn-plan"
                    data-plan="${plan.idplan}"
                >
                    Adquirir por ${precioFormateado}
                </button>
            `;

      const btn = card.querySelector(".btn-plan");

      btn.addEventListener("click", () => {
        agendar_pago(plan, btn);
      });

      wrapper.appendChild(card);
    });
  } catch (error) {
    console.error("❌ Error sincronizando planes:", error);

    wrapper.innerHTML = `
            <p style="
                color:#ff4a4a;
                text-align:center;
                width:100%;
            ">
                Error al sincronizar tarifas actuales.
            </p>
        `;
  }
}

// ═══════════════════════════════════════════════════════
// AGENDAR PAGO
// ═══════════════════════════════════════════════════════

async function agendar_pago(obj_plan, btn) {
  if (!btn) return;

  // EVITAR MULTICLICK
  if (window._procesandoPago) return;

  window._procesandoPago = true;

  // BLOQUEAR BOTONES
  document.querySelectorAll(".btn-plan").forEach((b) => {
    b.classList.add("disabled-all");

    b.disabled = true;
  });

  btn.classList.remove("disabled-all");

  // CREAR BARRA
  if (!btn.querySelector(".btn-progress")) {
    const textoOriginal = btn.textContent.trim();

    btn.innerHTML = `
            <span class="btn-text">
                ${textoOriginal}
            </span>

            <div class="btn-progress"></div>
        `;
  }

  const bar = btn.querySelector(".btn-progress");

  btn.classList.add("loading");

  let progress = 0;

  // ANIMACIÓN
  const interval = setInterval(() => {
    const step = progress < 35 ? 5 : progress < 65 ? 2 : 0.5;

    progress = Math.min(progress + step, 92);

    if (bar) {
      bar.style.width = progress + "%";
    }
  }, 70);

  try {
    const payload = {
      id_pago_actual: window._pago_actual_id || "",

      id_tienda: window._userId || "",

      nombre_user: window._nombre_tienda || "",

      plan_select: obj_plan.nombre_plan || "",

      localdiad: window._localidad_tienda || "",

      saldo_tienda: Number(window._saldo_tienda || 0),

      categoira_tienda: window._categoria_tienda || "",

      logo_tienda: window._logo_tienda || "",

      nombre_plan: obj_plan.nombre || obj_plan.nombre_plan || "PLAN GEINZ",

      monto_pagar_de_plan: Number(obj_plan.precio_soles || 0),
    };

    
    // CLOUD FUNCTION
    const res = await agregar_pado_usaurio_tienda(payload);

    
    const idPago = res?.data?.id_pago;

    if (!idPago) {
      throw new Error("No se generó ID de pago");
    }

    clearInterval(interval);

    if (bar) {
      bar.style.transition = "width .35s ease";

      bar.style.width = "100%";
    }

    await new Promise((resolve) => setTimeout(resolve, 450));

    const urlPago = `pagos?orderId=${idPago}&ins=r`;

    
    window.location.href = urlPago;
  } catch (error) {
    clearInterval(interval);

    console.error("❌ ERROR AL CREAR PAGO:", error);

    if (bar) {
      bar.style.background = "linear-gradient(90deg,#ff3b3b,#ff6b6b)";

      bar.style.width = "100%";
    }

    restaurarBotones();

    setTimeout(() => {
      if (bar) {
        bar.style.transition = "width .4s ease";

        bar.style.width = "0%";
      }
    }, 1200);

    alert(error?.message || "Error al procesar pago");
  }
}

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════

cargarPlanes();
