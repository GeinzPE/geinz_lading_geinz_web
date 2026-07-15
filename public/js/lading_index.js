import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
  authDomain: "geinzworkapp.firebaseapp.com",
  projectId: "geinzworkapp",
  storageBucket: "geinzworkapp.appspot.com",
  messagingSenderId: "921389328767",
  appId: "1:921389328767:web:094e8a2a5fcd69395b524a",
};

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

const dbPlanes = getFirestore(appPlanes);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function habilitarPlanes() {
  const botones = document.querySelectorAll(".btn-plan");
  botones.forEach((boton) => {
    boton.disabled = false;
    // Opcional: Agregar una clase para efecto visual de que ya se puede clickear
    boton.style.cursor = "pointer";
    boton.style.opacity = "1";
  });
}

async function buscarUsuario() {
  console.log("Iniciando búsqueda...");

  const idInput = document.getElementById("userId").value.trim();

  const msg = document.getElementById("msgId");
  const btnSearch = document.getElementById("btnSearch");
  const btnText = document.getElementById("btnText");
  const progressContainer = document.getElementById("progressContainer");
  const progressBar = document.getElementById("progressBar");
  const resultadoDiv = document.getElementById("resultadoUsuario");

  if (idInput === "") {
    msg.textContent = "❌ Ingresa el ID de la tienda.";
    msg.style.color = "red";
    return;
  }
  window._userId = idInput;

  btnSearch.disabled = true;
  btnText.innerHTML = "<span>⏳</span> Buscando...";
  resultadoDiv.style.display = "none";
  progressContainer.style.display = "block";
  progressBar.style.width = "20%";
  msg.textContent = "Conectando con la base de datos...";

  try {
    const docRef = doc(db, "Tiendas", "barranca", "barranca", idInput);
    progressBar.style.width = "50%";
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const datos = docSnap.data();
      progressBar.style.width = "100%";

      setTimeout(() => {
        // CORRECCIÓN DE RUTA DE DATOS SEGÚN TU JSON
        document.getElementById("tiendaLogo").src =
          datos.img_tienda.logo_tienda || "";
        document.getElementById("tiendaNombre").textContent =
          datos.nombre_tienda || "Sin nombre";
        document.getElementById("tiendaCategoria").textContent =
          datos.categoria_tienda || "Sin categoría";

        const puntos = datos.puntos_tienda || 0;
        document.getElementById("tiendaSaldo").textContent =
          `${puntos.toLocaleString()}`;

        progressContainer.style.display = "none";
        resultadoDiv.style.display = "block";
        msg.textContent =
          "✅ ¡ID Verificado! Ahora puedes seleccionar un plan.";
        msg.style.color = "green";

        btnSearch.disabled = false;
        btnText.innerHTML = "<span>🔍</span> Buscar";

        window._logo_tienda = datos.img_tienda.logo_tienda || "";
        window._categoria_tienda = datos.categoria_tienda || "";
        window._nombre_tienda = datos.nombre_tienda || "";
        window._saldo_tienda = datos.puntos_tienda || 0;
        window._localidad_tienda = datos.localidad || "";
        window._pago_actual_id = datos.pago_actual_id || "";

        // ACTIVAR BOTONES DE PAGO
        habilitarPlanes();
      }, 600);
    } else {
      throw new Error("El ID '" + idInput + "' no existe .");
    }
  } catch (error) {
    console.error("Error:", error);
    msg.textContent = "❌ " + error.message;
    msg.style.color = "red";
    progressContainer.style.display = "none";
    btnSearch.disabled = false;
    btnText.innerHTML = "<span>🔍</span> Buscar";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const boton = document.getElementById("btnSearch");
  if (boton) {
    boton.addEventListener("click", buscarUsuario);
    cargarPlanesDinamico();
  }
});

let localidadSeleccionada = "";

window.seleccionarLocalidad = function (localidad) {
  if (localidad !== "barranca") {
    alert("📍 Esta localidad estará disponible muy pronto.");
    return;
  }

  // Guardamos el valor en la variable global
  localidadSeleccionada = localidad;
  console.log("Localidad guardada: " + localidadSeleccionada);

  // Activamos los botones visualmente
  const botones = document.querySelectorAll(".btn-global");
  botones.forEach((btn) => {
    btn.classList.remove("disabled");
    btn.style.opacity = "1";
    btn.style.pointerEvents = "auto";
  });

  const msg = document.getElementById("msgId");
  if (msg) {
    msg.textContent = `✅ Localidad ${localidad.toUpperCase()} activada.`;
    msg.style.color = "green";
  }
};

// Función para navegar usando tu estructura de URL de Firebase
window.abrirCategoria = function (tipo) {
  // Verificamos que la variable tenga datos
  if (!localidadSeleccionada) {
    mostrarAlerta("📍 Primero selecciona Barranca para continuar.");
    return;
  }

  let tParam = "";
  let idParam = "";

  // Mapeo según los tipos que me pasaste
  if (tipo === "turismo") {
    tParam = "scr";
    idParam = "lgtr"; // El ID de tu link
  } else if (tipo === "emergencia") {
    tParam = "scr"; // Ejemplo
    idParam = "nemg";
  } else {
    tParam = "scr"; // Ejemplo para promos
    idParam = "all";
  }

  // Construcción del link de Firebase Hosting
  const urlFinal = `https://geinztech.com/api/share?t=${tParam}&id=${idParam}&loc=${localidadSeleccionada}`;

  console.log("Navegando a: " + urlFinal);

  // Navegación inmediata
  window.location.href = urlFinal;
};

function mostrarAlerta(mensaje) {
  const alerta = document.createElement("div");
  alerta.textContent = mensaje;

  alerta.style.position = "fixed";
  alerta.style.bottom = "20px";
  alerta.style.left = "50%";
  alerta.style.transform = "translateX(-50%)";
  alerta.style.background = "#222";
  alerta.style.color = "#fff";
  alerta.style.padding = "12px 20px";
  alerta.style.borderRadius = "8px";
  alerta.style.boxShadow = "0 4px 10px rgba(0,0,0,0.3)";
  alerta.style.zIndex = "9999";

  document.body.appendChild(alerta);

  setTimeout(() => {
    alerta.remove();
  }, 3000);
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
    }
  });
});

document.querySelectorAll(".linea").forEach((el) => observer.observe(el));

const functions = getFunctions(app, "us-central1");
const confirmarPagoFn = httpsCallable(functions, "confirmarPago");
const agregar_pado_usaurio_tienda = httpsCallable(
  functions,
  "agregar_pago_para_el_usuario_tienda",
);

window.pagar = function (monto, monedas) {
  window._pago = { monto, monedas };

  mostrarPago();

  window.Culqi.publicKey = "pk_test_XlR4ytKuiYD8EgG1";

  Culqi.settings({
    title: "Geinz",
    currency: "PEN",
    amount: Math.round(monto * 100),
    description: "Compra de monedas Geinz",
  });

  window.Culqi.open();

  setTimeout(() => cambiarPaso(1), 800);
};

window.culqi = async function () {
  if (!Culqi.token) {
    ocultarPago();
    mostrarEstado("rechazado");
    return;
  }

  const emailFinal = Culqi.token.email || "test@geinz.com";
  console.log("TemailFinal:", emailFinal);
  try {
    await confirmarPagoFn({
      token: Culqi.token.id,
      monto: window._pago.monto,
      email: emailFinal,
      monedas: window._pago.monedas,
      userId: window._userId,
    });

    Culqi.close();
    mostrarEstado("exitoso");

    setTimeout(() => {
      ocultarPago();
    }, 1200);
  } catch (err) {
    Culqi.close();
    mostrarEstado("rechazado");

    setTimeout(() => {
      ocultarPago();
    }, 1200);
  }
};

window.agendar_pago = async function (plan) {
  const btn = document.querySelector(`.btn-plan[data-plan="${plan}"]`);

  if (btn && !btn.querySelector(".btn-progress")) {
    const txt = btn.textContent.trim();
    btn.innerHTML = `<span>${txt}</span><div class="btn-progress"></div>`;
  }

  const bar = btn?.querySelector(".btn-progress");
  btn?.classList.add("loading");

  let progress = 0;
  const interval = setInterval(() => {
    const step = progress < 50 ? 3 : progress < 75 ? 1.2 : 0.3;
    progress = Math.min(progress + step, 85);
    if (bar) bar.style.width = progress + "%";
  }, 80);

  try {
    const obj_plan = await obtener_datos_para_plan(plan);

    const res = await agregar_pado_usaurio_tienda({
      id_pago_actual: window._pago_actual_id,
      id_tienda: window._userId,
      nombre_user: window._nombre_tienda,
      plan_select: obj_plan.nombre_plan,
      localdiad: window._localidad_tienda,
      saldo_tienda: window._saldo_tienda,
      categoira_tienda: window._categoria_tienda,
      logo_tienda: window._logo_tienda,
      nombre_plan: obj_plan.nombre,
      monto_pagar_de_plan: obj_plan.precio_soles,
    });

    const idPago = res.data.id_pago;
    clearInterval(interval);

    if (bar) {
      bar.style.transition = "width 0.3s ease";
      bar.style.width = "100%";
    }

    await new Promise((r) => setTimeout(r, 350));

    document.body.style.transition = "opacity 0.4s ease";
    document.body.style.opacity = "0";

    await new Promise((r) => setTimeout(r, 400));

    if (idPago) {
      window.location.href = `../dasboard/?orderId=${idPago}`;
    }
  } catch (error) {
    clearInterval(interval);
    console.error("ERROR:", error);

    // Barra roja de error
    if (bar) {
      bar.style.background = "rgba(255, 80, 80, 0.8)";
      bar.style.transition = "width 0.3s ease";
      bar.style.width = "100%";
    }

    btn?.classList.remove("loading");

    setTimeout(() => {
      if (bar) bar.style.width = "0%";
    }, 1500);
  }
};

async function obtener_datos_para_plan(plan) {
  try {
    const docRef = doc(dbPlanes, "precios_planes_geinz", plan);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const datos = docSnap.data();
      console.log("Datos del plan:", datos);
      return datos;
    } else {
      console.warn("No existe el plan:", plan);
      return null;
    }
  } catch (error) {
    console.error("Error obteniendo plan:", error);
    return null;
  }
}
window.mostrarEstado = function (estado) {
  const title = document.getElementById("paymentTitle");
  const text = document.getElementById("paymentText");
  const spinner = document.getElementById("spinner");

  spinner.style.display = "none";

  if (estado === "exitoso") {
    title.textContent = "Pago exitoso 🎉";
    text.textContent = "Tus monedas fueron acreditadas.";
  }

  if (estado === "rechazado") {
    title.textContent = "Pago rechazado ❌";
    text.textContent = "No se pudo completar el pago.";
  }
};
function mostrarPago() {
  document.getElementById("paymentOverlay").classList.remove("hidden");
}

function ocultarPago() {
  document.getElementById("paymentOverlay").classList.add("hidden");
}
function cambiarPaso(step) {
  const steps = document.querySelectorAll(".step");
  steps.forEach((s) => s.classList.remove("active"));
  if (steps[step]) steps[step].classList.add("active");
}

// Orden fijo de los planes
const ORDEN_PLANES = ["basico", "avanzado", "primium", "busness"];

async function cargarPlanesDinamico() {
  console.log("🔄 Iniciando carga de planes...");

  const wrapper = document.querySelector(".pricing-wrapper");

  // Mostrar 4 skeletons mientras carga
  wrapper.innerHTML = Array(4)
    .fill(
      `
    <div class="skeleton-card">
      <div class="sk-line" style="height:18px; width:60%; margin-bottom:16px;"></div>
      <div class="sk-line" style="height:36px; width:45%; margin-bottom:12px;"></div>
      <div class="sk-line" style="height:12px; width:80%; margin-bottom:8px;"></div>
      <div class="sk-line" style="height:12px; width:70%; margin-bottom:8px;"></div>
      <div class="sk-line" style="height:12px; width:75%; margin-bottom:20px;"></div>
      <div class="sk-line" style="height:40px; width:100%; border-radius:10px;"></div>
    </div>
  `,
    )
    .join("");

  try {
    const ref = collection(dbPlanes, "precios_planes_geinz");
    const snap = await getDocs(ref);

    console.log("✅ Total planes encontrados:", snap.size);

    const planesMap = {};
    snap.forEach((doc) => {
      const d = doc.data();
      console.log("📦 Plan cargado:", d.nombre_plan, d);
      planesMap[d.nombre_plan] = d;
    });

    console.log("🗺️ Mapa de planes:", planesMap);

    wrapper.innerHTML = "";

    ORDEN_PLANES.forEach((key) => {
      const plan = planesMap[key];
      if (!plan) {
        console.warn("⚠️ Plan no encontrado en Firebase:", key);
        return;
      }

      console.log("🃏 Renderizando card:", key);

      const tieneBono = plan.monedas_agregadas > 0;
      const esFeatured = plan.descripcion === "Más usado";

      const card = document.createElement("div");
      card.className = "plan-card" + (esFeatured ? " featured-plan" : "");

      card.innerHTML = `
        <h3>${plan.nombre}</h3>
        <div class="plan-coins">
          ${plan.monedas_inicial.toLocaleString()}
          <img src="../public/img/icon_monedas_3d.webp" class="coin-icon">
        </div>
        ${
          tieneBono
            ? `
        <div class="bonus-tag">
          🎁 +${plan.monedas_agregadas.toLocaleString()}
          <img src="../public/img/icon_monedas_3d.webp" class="coin-icon">
          regalo
        </div>`
            : ""
        }
        <ul class="plan-features">
          ${plan.accesos.map((a) => `<li>✅ ${a}</li>`).join("")}
        </ul>
        <button 
          class="btn-plan" 
          disabled 
          data-plan="${plan.nombre_plan}"
          onclick="agendar_pago('${plan.nombre_plan}', '${plan.nombre}', ${plan.precio_soles})">
          S/ ${plan.precio_soles}.00
        </button>
      `;

      wrapper.appendChild(card);
    });

    console.log("🎉 Planes renderizados correctamente");
  } catch (error) {
    console.error("❌ Error cargando planes:", error);
    wrapper.innerHTML = `<p style="color:rgba(255,255,255,0.4); text-align:center;">Error al cargar los planes. Intenta de nuevo.</p>`;
  }
}

// ── CITY CARDS SMOOTH LOAD ──
document.querySelectorAll(".city-card").forEach((card) => {
  const image = card.querySelector(".city-image");
  if (!image) return;

  const bgUrl = getComputedStyle(image)
    .backgroundImage.replace(/^url\(["']?/, "")
    .replace(/["']?\)$/, "");

  if (!bgUrl || bgUrl === "none") {
    card.classList.add("img-loaded");
    return;
  }

  const img = new Image();
  img.onload = () => {
    // Pequeño delay para que se note la transición
    setTimeout(() => {
      card.classList.add("img-loaded");
    }, 100);
  };
  img.onerror = () => card.classList.add("img-loaded");
  img.src = bgUrl;
});
