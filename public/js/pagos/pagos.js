import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

// ─── Geinz ───
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

// ─── Planes ───
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

const dbGeinz = getFirestore(appGeinz);
const dbPlanes = getFirestore(appPlanes);
const functions = getFunctions(appGeinz, "us-central1");
const confirmarPagoFn = httpsCallable(functions, "confirmarPago");
const crearOrdenFn = httpsCallable(functions, "crearOrdenCulqi");

window.ruc_tienda = "";
window.direccion_fiscal = "";

// ─────────────────────────────────────────
// URL PARAMS
// ─────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const orderId = params.get("orderId");
const params_mostrado = params.get("ins");
console.log("ID recibido:", orderId, "Params mostrado:", params_mostrado);
window._userId = orderId;
let termsOn = false;
let compType = "boleta";
let CulqiInstance = null;
let backBtn = null;

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
function pad(n) {
  return String(n).padStart(2, "0");
}

// ─────────────────────────────────────────
// BACK BTN
// ─────────────────────────────────────────
function mostrarBackBtn() {
  if (!backBtn || params_mostrado === "i") return;
  backBtn.classList.remove("hide");
  backBtn.classList.add("show");
}

function ocultarBackBtn() {
  if (!backBtn) return;
  backBtn.classList.remove("show");
  backBtn.classList.add("hide");
}

// ─────────────────────────────────────────
// VOLVER INICIO
// ─────────────────────────────────────────
window.volverInicio = function () {
  if (params_mostrado === "i") {
    window.location.href = "../index.html";
  } else {
    window.top.postMessage({ tipo: "NAVEGAR", seccion: "recargas" }, "*");
  }
};

// ─────────────────────────────────────────
// LOADING / ERROR
// ─────────────────────────────────────────
function mostrarLoading(text = "Validando ID...") {
  const el = document.getElementById("loadingOverlay");
  const txt = document.getElementById("loadingText");
  if (el) el.classList.remove("hidden");
  if (txt) txt.textContent = text;
}

function ocultarLoading() {
  const el = document.getElementById("loadingOverlay");
  if (el) el.classList.add("hidden");
}

function mostrarError(msg) {
  ocultarLoading();
  const mc = document.getElementById("mainContent");
  const eo = document.getElementById("errorOverlay");
  const et = document.getElementById("errorText");
  if (mc) mc.style.display = "none";
  if (eo) eo.classList.remove("hidden");
  if (et) et.textContent = msg;
}

// ─────────────────────────────────────────
// OVERLAY PAGO
// ─────────────────────────────────────────
function mostrarPago() {
  document.getElementById("paymentOverlay").classList.remove("hidden");
  document.getElementById("paymentTitle").textContent =
    "Cargando pasarela de pago...";
  document.getElementById("paymentText").textContent = "Por favor espera";
}

function ocultarPago() {
  document.getElementById("paymentOverlay").classList.add("hidden");
}

// ─────────────────────────────────────────
// CULQI
// ─────────────────────────────────────────
function inicializarCulqi({ monto, culqi_order_id }) {
  const settings = {
    title: "Geinz",
    currency: "PEN",
    amount: Math.round(monto * 100),
    order: culqi_order_id,
    xculqirsaid: "b5d89da9-98c9-4f93-b593-86d71ba05720",
    rsapublickey:
      "-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCldcHT37kf7vUe5++264WeIQaw\nQQsagSztPOMtyFuofyN8IhTwxgQXXXVjv8zG5OsDj5FyXqBK/cg5kUDdp6ecQlhG\n93Mr4FCFwgyAAfxdspafrIPw0aOPv2h/oW7KavYWhv8r50aOuzIxGExtXly15Ib4\nKFwl+dzcVU5pFGEiVQIDAQAB\n-----END PUBLIC KEY-----",
  };

  const options = {
    lang: "es",
    installments: false,
    modal: true,
    paymentMethods: {
      tarjeta: true,
      yape: true,
      billetera: true,
      bancaMovil: false,
      agente: false,
      cuotealo: false,
    },
  };

  const client = { email: "cliente@geinz.com" };

  const appearance = {
    theme: "default",
    hiddenCulqiLogo: false,
    hiddenBanner: false,
    logo: "https://firebasestorage.googleapis.com/v0/b/geinzworkapp.appspot.com/o/logo_geinz_webp.webp?alt=media&token=aa1ef1df-1bcd-48f2-9cad-a85929c3a8d0",
    hiddenBannerContent: false,
    hiddenToolBarAmount: false,
    menuType: "sidebar",
    buttonCardPayText: "Pagar ahora",
    defaultStyle: {
      bannerColor: "#6D28D9",
      buttonBackground: "#7C3AED",
      menuColor: "#7C3AED",
      linksColor: "#8B5CF6",
      buttonTextColor: "#ffffff",
      priceColor: "#7C3AED",
    },
    rules: {
      ".Culqi-Menu .Culqi-Icon": { color: "#7C3AED" },
      ".Culqi-Menu-Item.active .Culqi-Icon": { color: "#7C3AED" },
      ".Culqi-Menu-Item.active .Culqi-Bar": { background: "#7C3AED" },
      ".Culqi-Toolbar-Price .Culqi-Icon": { color: "#7C3AED" },
      ".Culqi-Text-Link .Culqi-Icon": { color: "#8B5CF6" },
      ".Culqi-message .Culqi-Icon": { color: "#7C3AED" },
      ".Culqi-Input-Icon-Spinner": { color: "#7C3AED" },
      ".Culqi-Button": { background: "#7C3AED", color: "#ffffff" },
    },
  };

  if (CulqiInstance) {
    try {
      CulqiInstance.close();
    } catch (e) {}
    CulqiInstance = null;
  }

  CulqiInstance = new CulqiCheckout("pk_test_XlR4ytKuiYD8EgG1", {
    settings,
    options,
    client,
    appearance,
  });

  CulqiInstance.culqi = async function () {
    if (CulqiInstance.order) {
      document.getElementById("paymentOverlay").classList.remove("hidden");
      document.getElementById("spinner").style.display = "none";
      document.getElementById("paymentTitle").textContent =
        "¡Pago recibido! 📱✅";
      document.getElementById("paymentText").textContent =
        "Tu pago con billetera fue registrado. Tus monedas se acreditarán en breve.";
      return;
    }

    if (CulqiInstance.error) {
      const code = CulqiInstance.error?.code || "";
      if (code === "CNP0183") {
        mostrarBackBtn();
        ocultarPago();
        return;
      }
      mostrarBackBtn();
      mostrarEstado("rechazado");
      return;
    }

    if (!CulqiInstance.token) {
      mostrarBackBtn();
      ocultarPago();
      return;
    }

    const emailFinal = CulqiInstance.token.email || "cliente@geinz.com";
    CulqiInstance.close();

    document.getElementById("paymentOverlay").classList.remove("hidden");
    document.getElementById("spinner").style.display = "block";
    document.getElementById("paymentTitle").textContent = "Procesando pago...";
    document.getElementById("paymentText").textContent =
      "Por favor espera, no cierres esta página";

    const tipo_comprobante = compType === "boleta" ? 2 : 1;
    const rucFinal = document.getElementById("inputRuc")?.value.trim() || "0";
    const dirFinal = document.getElementById("inputDir")?.value.trim() || "";
    const razonFinal =
      document.getElementById("inputRazon")?.value.trim() || "";
    const nombre_final =
      tipo_comprobante === 2
        ? window._pago.nombre_tienda || "Consumidor Final"
        : razonFinal || "Empresa sin nombre";

    try {
      await confirmarPagoFn({
        tipo_comprobante,
        ruc: rucFinal,
        direccion_negocio: dirFinal,
        token: CulqiInstance.token.id,
        monto: window._pago.monto,
        email: emailFinal,
        userId: window._pago.user_id,
        monedas: window._pago.monedas,
        monedas_originales: window._pago.monedas_originales || 0,
        deuda_pendiente: window._pago.deuda_pendiente || 0,
        tiene_deuda: window._pago.tiene_deuda === true,
        nombre_tienda: nombre_final,
        localidad: window._pago.localidad_tienda || "Localidad desconocida",
        nombre_paquete: window._pago.nombre_paquete || "Paquete desconocido",
        monto_anterior: window._pago.saldo_tienda || 0,
        id_select_boleta_pago: orderId,
      });

      document.getElementById("mainContent").style.display = "none";
      document.getElementById("paymentOverlay").classList.add("hidden");
      await buscarUsuario(orderId);
    } catch (err) {
      console.error("Error pago:", err);
      mostrarEstado("rechazado");
      mostrarBackBtn();
      setTimeout(() => {
        document.getElementById("paymentOverlay").classList.add("hidden");
      }, 1200);
    }
  };
}

// ─────────────────────────────────────────
// PAGAR
// ─────────────────────────────────────────
window.pagar = async function (data) {
  const monto = Number(data.monto);
  if (!monto || isNaN(monto)) return;

  window._pago = data;
  mostrarPago();
  ocultarBackBtn();

  try {
    const result = await crearOrdenFn({
      monto,
      userId: data.user_id,
      nombre: data.nombre_tienda,
      email: "cliente@geinz.com",
      orderId,
    });

    const culqi_order_id = result.data.culqi_order_id;
    inicializarCulqi({ monto, culqi_order_id });
    CulqiInstance.open();
    ocultarPago();
    mostrarBackBtn();
  } catch (err) {
    console.error("Error creando orden:", err);
    ocultarPago();
    mostrarBackBtn();
    mostrarEstado("rechazado");
  }
};

// ─────────────────────────────────────────
// MOSTRAR ESTADO
// ─────────────────────────────────────────
window.mostrarEstado = function (estado) {
  document.getElementById("spinner").style.display = "none";

  if (estado === "exitoso") {
    document.getElementById("paymentTitle").textContent =
      "¡Pago exitoso! 🎉 Te enviamos el comprobante a tu WhatsApp";
    document.getElementById("paymentText").textContent =
      "Tus monedas fueron acreditadas.";
    buscarUsuario(orderId);
    document.getElementById("mainContent").style.display = "none";
    document.getElementById("contenido_cancelado").style.display = "block";
  } else if (estado === "billetera") {
    document.getElementById("paymentTitle").textContent = "Pago en proceso 📱";
    document.getElementById("paymentText").textContent =
      "Escanea el QR con tu billetera. Te notificaremos cuando se confirme.";
  } else {
    document.getElementById("paymentTitle").textContent =
      "Pago no procesado ❌";
    document.getElementById("paymentText").textContent =
      "⚠️ Verifica los datos de tu tarjeta e intenta nuevamente.";
  }
};

// ─────────────────────────────────────────
// BUSCAR USUARIO
// ─────────────────────────────────────────
async function buscarUsuario(orderId) {
  if (!orderId) {
    mostrarError("No hay ID");
    return;
  }

  try {
    const docRef = doc(
      dbGeinz,
      "Tiendas",
      "barranca",
      "pagos_tiendas",
      orderId,
    );
    const docSnap = await getDoc(docRef);

  
    if (!docSnap.exists()) {
      mostrarError("El ID no existe ❌");
      return;
    }

    const datos = docSnap.data();

    // ✅ PRIMERO: si ya está pagado, mostrar voucher y salir
    if (datos.estado === "pagado") {
      const fecha =
        (datos.actualizado_en || datos.fecha_pago)?.toDate?.() || new Date();
      const texto = fecha.toLocaleString("es-PE", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });

      document.getElementById("fecha_realizado").textContent = texto;
      document.getElementById("concepto_pago").textContent =
        datos.nombre_plan || "";
      document.getElementById("id_comprobante").textContent = datos.id_pago;
      document.getElementById("monto_cancelado").textContent =
        `S/ ${Number(datos.monto_pagar_de_plan).toFixed(2)}`;

      document.getElementById("mainContent").style.display = "none";
      document.getElementById("contenido_cancelado").style.display = "block";
      ocultarBackBtn();
      ocultarLoading();
      return;
    }

    // Solo si NO está pagado
    try {
      const deudaRef = doc(dbPlanes, "creditos_tienda", datos.id_tienda);
      const deudaSnap = await getDoc(deudaRef);
      window._deudaPendiente = deudaSnap.exists()
        ? Number(deudaSnap.data()?.deuda_pendiente || 0)
        : 0;
    } catch (e) {
      window._deudaPendiente = 0;
    }

    document.getElementById("tiendaNombre").textContent =
      datos.nombre_user || "Sin nombre";
    document.getElementById("tiendaCategoria").textContent =
      datos.categoira_tienda || "Sin categoría";
    document.getElementById("tiendaSaldo").textContent = (
      datos.saldo_tienda || 0
    ).toLocaleString();
    document.getElementById("tiendaLogo").src = datos.logo_tienda || "";

    await renderPlan(datos);

    document.getElementById("mainContent").style.display = "block";
    ocultarLoading();
    mostrarBackBtn();
  } catch (error) {
    console.error("Error:", error);
    mostrarError("Error al cargar datos");
  }
}

// ─────────────────────────────────────────
// RENDER PLAN
// ─────────────────────────────────────────
async function renderPlan(datos) {
  if (!datos.plan_select) {
    mostrarError("No se recibió el plan");
    return;
  }
console.error("🔍 datos completos:", JSON.stringify(datos));
  try {
    const docRef = doc(dbPlanes, "precios_planes_geinz", datos.plan_select);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      mostrarError("Plan no encontrado");
      return;
    }

    const plan = docSnap.data();
    const deudaPendiente = Number(window._deudaPendiente || 0);
    const monedasPlan =
      Number(plan.monedas_inicial || 0) + Number(plan.monedas_agregadas || 0);
    const monedasFinales = Math.max(monedasPlan - deudaPendiente, 0);
    const totalMonedas = monedasPlan;

    document.getElementById("planName").textContent = plan.nombre;
    document.getElementById("planCoins").textContent = plan.monedas_inicial;
    document.querySelector(".p-amount").textContent =
      `S/ ${Number(plan.precio_soles).toFixed(2)}`;

    // Banner deuda
    document.getElementById("bannerDeudaPendiente")?.remove();
    if (deudaPendiente > 0) {
      const banner = document.createElement("div");
      banner.id = "bannerDeudaPendiente";
      banner.innerHTML = `
        <div style="margin:18px 0;padding:16px;border-radius:18px;
          background:linear-gradient(135deg,rgba(124,58,237,.18),rgba(139,92,246,.08));
          border:1px solid rgba(139,92,246,.25);color:white;backdrop-filter:blur(10px);">
          <div style="font-size:15px;font-weight:700;margin-bottom:8px;">⚠️ Tienes una deuda pendiente</div>
          <div style="font-size:14px;line-height:1.55;opacity:.92;">
            Deuda acumulada: <b>${deudaPendiente} créditos</b> 💳<br><br>
            Al recargar, se descontará automáticamente.<br><br>
            🪙 Plan: <b>${monedasPlan}</b><br>
            💸 Débito: <b>-${deudaPendiente}</b><br>
            ✅ Recibirás: <b>${monedasFinales}</b>
          </div>
        </div>`;
      document
        .getElementById("pb")
        ?.parentNode.insertBefore(banner, document.getElementById("pb"));
    }

    // Bonus
    const bonus = document.getElementById("bonusPill");
    if (plan.monedas_agregadas > 0) {
      bonus.style.display = "block";
      bonus.textContent = `🎁 +${plan.monedas_agregadas} monedas de regalo`;
    } else {
      bonus.style.display = "none";
    }

    // Features
    document.getElementById("featGrid").innerHTML = (plan.accesos || [])
      .map((f) => `<div class="feat"><div class="feat-check">✔</div>${f}</div>`)
      .join("");

    // Botón pagar
    document.getElementById("pb").onclick = () => {
      window.pagar({
        monto: plan.precio_soles,
        monedas: monedasFinales,
        monedas_originales: totalMonedas,
        deuda_pendiente: deudaPendiente,
        tiene_deuda: deudaPendiente > 0,
        user_id: datos.id_tienda,
        nombre_tienda: datos.nombre_user,
        localidad_tienda: datos.localdiad,
        nombre_paquete: plan.nombre,
        saldo_tienda: datos.saldo_tienda || 0,
      });
    };
  } catch (err) {
    console.error("Error cargando plan:", err);
    mostrarError("Error al cargar el plan");
  }
}

// ─────────────────────────────────────────
// VALIDACIÓN
// ─────────────────────────────────────────
function validarFormulario() {
  if (!termsOn) {
    setBoton(false);
    return;
  }
  if (compType === "boleta") {
    setBoton(true);
    return;
  }

  const ruc = document.getElementById("inputRuc").value.trim();
  const razon = document.getElementById("inputRazon").value.trim();
  const dept = document.getElementById("inputDept").value.trim();
  const dist = document.getElementById("inputDist").value.trim();
  const dir = document.getElementById("inputDir").value.trim();
  const email = document.getElementById("inputEmail").value.trim();

  window.ruc_tienda = ruc;
  window.direccion_fiscal = dir;

  const rucValido = /^\d{11}$/.test(ruc);
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const todosLlenos = razon && dept && dist && dir;

  setBoton(rucValido && emailValido && todosLlenos);
}

function setBoton(activo) {
  const btn = document.getElementById("pb");
  if (!btn) return;
  btn.disabled = !activo;
  btn.className = "pay-btn" + (activo ? " on" : "");
}

// ─────────────────────────────────────────
// TÉRMINOS
// ─────────────────────────────────────────
function toggleTerms() {
  termsOn = !termsOn;
  document.getElementById("cb").className = "chkbox" + (termsOn ? " on" : "");
  document.getElementById("tw").className =
    "terms-wrap" + (termsOn ? " on" : "");
  validarFormulario();
}

// ─────────────────────────────────────────
// BOLETA / FACTURA
// ─────────────────────────────────────────
function selComp(t) {
  compType = t;
  document.getElementById("optBoleta").className =
    "comp-opt" + (t === "boleta" ? " active" : "");
  document.getElementById("optFactura").className =
    "comp-opt" + (t === "factura" ? " active" : "");
  document.getElementById("radioBoleta").className =
    "comp-radio" + (t === "boleta" ? " on" : "");
  document.getElementById("radioFactura").className =
    "comp-radio" + (t === "factura" ? " on" : "");
  const ff = document.getElementById("facturaForm");
  t === "factura" ? ff.classList.add("open") : ff.classList.remove("open");
  validarFormulario();
}

// ─────────────────────────────────────────
// RUC
// ─────────────────────────────────────────
function onRucInput(el) {
  el.value = el.value.replace(/\D/g, "");
  const hint = document.getElementById("rucHint");
  const len = el.value.length;
  if (len === 0) {
    hint.textContent = "Ingresa los 11 dígitos del RUC";
    hint.style.color = "rgba(139,92,246,0.5)";
  } else if (len < 11) {
    hint.textContent = `Faltan ${11 - len} dígito${11 - len > 1 ? "s" : ""}`;
    hint.style.color = "rgba(234,179,8,0.65)";
  } else {
    hint.textContent = "RUC válido ✓";
    hint.style.color = "rgba(52,211,153,0.75)";
  }
  validarFormulario();
}

// ─────────────────────────────────────────
// WHATSAPP
// ─────────────────────────────────────────
function irWhatsApp() {
  const id = document.getElementById("id_comprobante").textContent;
  const url = `https://wa.me/51958120920?text=${encodeURIComponent(`Hola, tengo un problema con mi pago.\nID: ${id}`)}`;
  window.open(url, "_blank");
}

// ─────────────────────────────────────────
// COPIAR ID
// ─────────────────────────────────────────
function copiarId(btn) {
  const id = document.getElementById("id_comprobante").textContent;
  if (!id) return;
  navigator.clipboard.writeText(id);
  btn.textContent = "✓ Listo";
  setTimeout(() => {
    btn.textContent = "Copiar";
  }, 1500);
}

// ─────────────────────────────────────────
// INTERSECTION OBSERVER
// ─────────────────────────────────────────
const scrollObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add("visible");
  });
});
document.querySelectorAll(".linea").forEach((el) => scrollObserver.observe(el));

// ─────────────────────────────────────────
// EXPONER AL HTML
// ─────────────────────────────────────────
window.selComp = selComp;
window.copiarId = copiarId;
window.toggleTerms = toggleTerms;
window.onRucInput = onRucInput;
window.irWhatsApp = irWhatsApp;

// ─────────────────────────────────────────
// ✅ INIT — al final, cuando el DOM ya existe
// ─────────────────────────────────────────
backBtn = document.querySelector(".back-btn");

const now = new Date();
const meses = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];
const fvEl = document.getElementById("fv");
const hvEl = document.getElementById("hv");
if (fvEl)
  fvEl.textContent =
    pad(now.getDate()) + " " + meses[now.getMonth()] + " " + now.getFullYear();
if (hvEl)
  hvEl.textContent =
    pad(now.getHours()) +
    ":" +
    pad(now.getMinutes()) +
    ":" +
    pad(now.getSeconds());

if (params_mostrado === "i") {
  backBtn?.classList.add("hide");
  backBtn?.classList.remove("show");
}

mostrarLoading("Validando ID...");

if (!orderId) {
  mostrarError("No se recibió el ID");
} else {
  buscarUsuario(orderId);

  const ids = [
    "inputRuc",
    "inputRazon",
    "inputDept",
    "inputDist",
    "inputDir",
    "inputEmail",
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", validarFormulario);
  });
  validarFormulario();
}