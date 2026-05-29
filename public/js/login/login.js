/* =========================================================
           CONSOLE WARNING
        ========================================================= */
console.log(
  `%cDETENTE`,
  `
font-size:48px;
font-weight:900;
color:#ff2d55;
`,
);

console.log(
  `%cLa consola es solo para desarrolladores.
Si alguien te pidió pegar código aquí podría robar tu cuenta Geinz.`,
  `
font-size:15px;
color:white;
`,
);

/* =========================================================
           FIREBASE IMPORTS
        ========================================================= */
import {
  initializeApp,
  getApps,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  browserLocalPersistence,
  setPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =========================================================
           FIREBASE CONFIG
        ========================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
  authDomain: "geinzworkapp.firebaseapp.com",
  projectId: "geinzworkapp",
  storageBucket: "geinzworkapp.firebasestorage.app",
  messagingSenderId: "921389328767",
  appId: "1:921389328767:web:dc6fffc43a51444f5b524a",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

const auth = getAuth(app);

await setPersistence(auth, browserLocalPersistence);

const db = getFirestore(app);

const provider = new GoogleAuthProvider();

/* =========================================================
           GLOBALS
        ========================================================= */
let GOOGLE_USER = null;
let splashShown = false;

let localidadSeleccionada = "barranca";
let modoCorreo = false;

/* =========================================================
           HELPERS
        ========================================================= */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function markStep(id) {
  document.getElementById(id)?.classList.add("done");
}

function showAlert(msg) {
  alert(msg);
}

/* =========================================================
           MODALS
        ========================================================= */
window.openLoginModal = () => {
  document.body.classList.add("blur-active");

  document.getElementById("loginModal").classList.add("active");
};

window.openRegisterModal = () => {
  document.body.classList.add("blur-active");

  document.getElementById("registerModal").classList.add("active");
};

window.openSocioModal = () => {
  document.body.classList.add("blur-active");

  document.getElementById("socioModal").classList.add("active");
};

window.closeModal = (id) => {
  document.getElementById(id)?.classList.remove("active");

  const hasActive = document.querySelector(".modal-overlay.active");

  if (!hasActive) {
    document.body.classList.remove("blur-active");
  }
};

window.closeIfOutside = (event, id) => {
  if (event.target.id === id) {
    closeModal(id);
  }
};

/* =========================================================
           PASSWORD TOGGLE
        ========================================================= */
window.togglePassword = (id, icon) => {
  const input = document.getElementById(id);

  if (!input) return;

  if (input.type === "password") {
    input.type = "text";
    icon.textContent = "visibility_off";
  } else {
    input.type = "password";
    icon.textContent = "visibility";
  }
};

/* =========================================================
           LOGIN GOOGLE
        ========================================================= */
window.loginGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, provider);

    const user = result.user;

    GOOGLE_USER = user;

    const userRef = doc(
      db,
      "Trabajadores_Usuarios_Drivers",
      "users",
      "users",
      user.uid,
    );

    const snap = await getDoc(userRef);

    if (snap.exists()) {
      showSplash(user);
    } else {
      openRegisterModal();

      const emailInput = document.querySelector(
        '#registerModal input[type="email"]',
      );

      if (emailInput) {
        emailInput.value = user.email;
        emailInput.disabled = true;
      }
    }
  } catch (error) {
    console.error(error);

    showAlert("Error al iniciar sesión con Google");
  }
};

/* =========================================================
           REGISTER
        ========================================================= */
window.submitRegister = async (event) => {
  event.preventDefault();

  try {
    if (!GOOGLE_USER) {
      showAlert("Primero inicia sesión con Google");

      return;
    }

    const uid = GOOGLE_USER.uid;

    const registerModalEl = document.getElementById("registerModal");

    const inputs = registerModalEl.querySelectorAll("input");

    const selects = registerModalEl.querySelectorAll("select");

    const nombre = inputs[0].value.trim();

    const apellido = inputs[1].value.trim();

    const username = inputs[2].value.trim();

    const telefono = inputs[3].value.trim();

    const fechaNacimiento = inputs[4].value.trim();

    const genero = selects[0].value;

    const localidad = selects[1].value;

    if (!nombre || !apellido || !username || !telefono) {
      showAlert("Completa todos los campos");
      return;
    }

    const usernameFinal = "@" + username.replace("@", "");

    const fechaRegistro = new Date().toLocaleDateString("es-PE");

    /* =========================
                   CORREO
                ========================= */
    await setDoc(
      doc(db, "Trabajadores_Usuarios_Drivers", "users", "correos", uid),

      {
        correo: GOOGLE_USER.email,
        tipo: "google",
      },
    );

    /* =========================
                   USERNAME
                ========================= */
    await setDoc(
      doc(
        db,
        "Trabajadores_Usuarios_Drivers",
        "users",
        "nombres_user",
        username.toLowerCase(),
      ),

      {
        id_registrado: uid,
        nombres_user: usernameFinal,
      },
    );

    /* =========================
                   USER DATA
                ========================= */
    await setDoc(
      doc(db, "Trabajadores_Usuarios_Drivers", "users", "users", uid),

      {
        nombre,
        apellido,

        correo: GOOGLE_USER.email,

        nombre_user: usernameFinal,

        id_user: uid,

        genero,

        localida: localidad,

        fecha_nac: fechaNacimiento,

        fecha_registrada: fechaRegistro,

        puntos: 500,

        cod_pais: "pe",

        nacionalidad_nacimiento: "Peru",

        tipo_login: "google",

        contacto: {
          cod_telefonico: "pe",
          nombre_pais_numero: "Peru",
          numero_user: Number(telefono),
        },

        creado_server: serverTimestamp(),
      },
    );

    closeModal("registerModal");

    showSplash(GOOGLE_USER);
  } catch (error) {
    console.error(error);

    showAlert("Error al registrar usuario");
  }
};

/* =========================================================
           LOGIN EMAIL (TEMP)
        ========================================================= */
window.submitLogin = async (event) => {
  event.preventDefault();

  const user = auth.currentUser;

  if (!user) {
    showAlert("Debes iniciar sesión con Google");

    return;
  }

  closeModal("loginModal");

  showSplash(user);
};

/* =========================================================
           SPLASH SCREEN
        ========================================================= */
/* =========================================================
   SNACKBAR
   ========================================================= */
function showSnackbar(msg) {
  let sb = document.getElementById("geinzSnackbar");
  if (!sb) {
    sb = document.createElement("div");
    sb.id = "geinzSnackbar";
    sb.style.cssText = `
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: #323232;
      color: #fff;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
      box-shadow: 0 4px 20px rgba(0,0,0,0.35);
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.25s ease, transform 0.25s ease;
      white-space: nowrap;
      pointer-events: none;
    `;
    document.body.appendChild(sb);
  }
  sb.textContent = msg;
  requestAnimationFrame(() => {
    sb.style.opacity = "1";
    sb.style.transform = "translateX(-50%) translateY(0)";
  });
  clearTimeout(sb._timer);
  sb._timer = setTimeout(() => {
    sb.style.opacity = "0";
    sb.style.transform = "translateX(-50%) translateY(20px)";
  }, 3200);
}

/* =========================================================
   SPLASH SCREEN — con validación automática de tienda
   ========================================================= */
async function showSplash(user) {
  if (splashShown) return;
  splashShown = true;

  document.getElementById("mainUI").style.display = "none";
  const splash = document.getElementById("splashScreen");
  splash.classList.add("visible");

  await delay(600);
  markStep("step1");
  await delay(700);
  markStep("step2");

  const userRef = doc(
    db,
    "Trabajadores_Usuarios_Drivers",
    "users",
    "users",
    user.uid,
  );
  const snap = await getDoc(userRef);

  await delay(600);
  markStep("step3");
  await delay(700);

  const data = snap.exists() ? snap.data() : {};
  const nombre = data.nombre || user.displayName || "Usuario";
  const username = data.nombre_user
    ? data.nombre_user
    : "@" + user.email.split("@")[0];

  document.getElementById("wName").textContent = nombre;
  document.getElementById("wUser").textContent = username;
  document.getElementById("wPoints").textContent = data.puntos || 500;
  document.getElementById("sValidating").classList.add("fade-out");

  await delay(450);
  document.getElementById("sWelcome").classList.add("visible");

  // ── Determinar a dónde va el botón "Entrar" ──────────────
  const idTienda = data.id_tienda_propietario?.trim();

  document.getElementById("btnEnter").onclick = async () => {
    if (!idTienda) {
      // No tiene campo → snackbar + pantalla selector
      showSnackbar("⚠️ No tienes un ID de tienda vinculado");
      setTimeout(() => abrirPantallaSocio(user), 1200);
      return;
    }

    // Valida que la tienda exista en /lugares/{idTienda}
    try {
      const lugarRef = doc(db, "lugares", idTienda);
      const lugarSnap = await getDoc(lugarRef);

      if (!lugarSnap.exists()) {
        showSnackbar("❌ Tu ID de tienda no existe o fue eliminado");
        setTimeout(() => abrirPantallaSocio(user), 1400);
        return;
      }

      // ✅ Tienda válida → redirige directo al panel
      const lugarData = lugarSnap.data();
      const localidad = lugarData.localidad || "barranca";

      sessionStorage.setItem("tiendaId", idTienda);
      sessionStorage.setItem("localidad", localidad);

            window.location.href = `./../../dasboard/panel_perfil.html?id=${encodeURIComponent(idTienda)}&localidad=${encodeURIComponent(localidad)}`;


    } catch (err) {
      console.error("Error validando tienda:", err);
      showSnackbar("Error al validar tu tienda");
      setTimeout(() => abrirPantallaSocio(user), 1400);
    }
  };
}

/* =========================================================
           PANTALLA INTERMEDIA
        ========================================================= */
function abrirPantallaSocio(user) {
  document.getElementById("splashScreen").style.display = "none";

  const screen = document.getElementById("selectorSocioScreen");

  screen.classList.add("active");

  const input = document.getElementById("selectorInput");

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.onclick = () => {
      document
        .querySelectorAll(".chip")
        .forEach((c) => c.classList.remove("active"));

      chip.classList.add("active");

      localidadSeleccionada = chip.dataset.local;
    };
  });

  document.getElementById("modoCorreo").onclick = () => {
    modoCorreo = !modoCorreo;

    if (modoCorreo) {
      input.placeholder = "Ingresa tu correo electrónico";
    } else {
      input.placeholder = "Pega tu ID";
    }
  };
}

/* =========================================================
           CONTINUAR PANEL
        ========================================================= */
/* =========================================================
           CONTINUAR PANEL
        ========================================================= */
window.continuarPanel = async () => {
  const valor = document.getElementById("selectorInput").value.trim();

  if (!valor) {
    showAlert("Completa el campo");
    return;
  }

  // ── Validación de longitud mínima ──────────────────────
  if (valor.length < 4) {
    showAlert("ID inválido");
    return;
  }

  const btn = document.querySelector("#selectorSocioScreen .btn-purple");
  const oldText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = "Validando...";

  try {
    // ── Validar en Firestore antes de redirigir ────────────
    const tiendaRef = doc(
      db,
      "Tiendas",
      localidadSeleccionada,
      localidadSeleccionada,
      valor,
    );

    console.log(
      "🔍 Buscando:",
      `Tiendas/${localidadSeleccionada}/${localidadSeleccionada}/${valor}`,
    );

    const snap = await getDoc(tiendaRef);

    if (!snap.exists()) {
      showAlert("❌ Ese ID no existe. Verifica e intenta de nuevo.");
      return; // ← NO redirige
    }

    console.log("✅ Tienda encontrada:", snap.data());

    sessionStorage.setItem("localidad", localidadSeleccionada);
    sessionStorage.setItem("tiendaId", valor);

    window.location.href = `./../../dasboard/panel_perfil?id=${encodeURIComponent(valor)}&localidad=${encodeURIComponent(localidadSeleccionada)}`;
  } catch (error) {
    console.error("🔥 Error:", error);
    showAlert("Error al validar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldText;
  }
};

/* =========================================================
           SOCIO LOGIN
        ========================================================= */
window.accederSocio = async () => {
  const idTienda = document.getElementById("socioId").value.trim();
  const localidad = document
    .getElementById("socioLocalidad")
    .value.toLowerCase();

  if (!idTienda || !localidad) {
    alert("Completa todos los campos");
    return;
  }

  if (idTienda.length < 4) {
    alert("ID inválido");
    return;
  }

  const btn = document.getElementById("btnAccederSocio");
  const oldText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = "Validando...";

  try {
    const tiendaRef = doc(db, "Tiendas", localidad, localidad, idTienda);

    console.log(
      "🔍 Buscando:",
      `Tiendas/${localidad}/${localidad}/${idTienda}`,
    );

    const snap = await getDoc(tiendaRef);

    if (!snap.exists()) {
      alert("❌ Ese ID no existe. Verifica e intenta de nuevo.");
      return; // ← se queda aquí, NO redirige
    }

    console.log("✅ Tienda encontrada:", snap.data());

    sessionStorage.setItem("tiendaId", idTienda);
    sessionStorage.setItem("localidad", localidad);

    window.location.href = `./../../dasboard/panel_perfil?id=${encodeURIComponent(idTienda)}&localidad=${encodeURIComponent(localidad)}`;
  } catch (error) {
    console.error("🔥 Error:", error);
    alert("Error al validar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldText;
  }
};
/* =========================================================
           USER LOGIN FROM SOCIO
        ========================================================= */
window.switchToUserLogin = () => {
  closeModal("socioModal");

  openLoginModal();
};

/* =========================================================
           AUTH STATE
        ========================================================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  GOOGLE_USER = user;

  showSplash(user);
});

/* =========================================================
           BACKGROUND SLIDER
        ========================================================= */
const slides = document.querySelectorAll(".slide");

const titles = [
  "Encuentra tu próximo destino favorito",

  "Tu aventura con Geinz comienza hoy",

  "Bienvenido a Geinz, tu espacio ideal",
];

const titleElement = document.getElementById("dynamicTitle");

let currentSlide = 0;

setInterval(() => {
  slides[currentSlide].classList.remove("active");

  currentSlide = (currentSlide + 1) % slides.length;

  slides[currentSlide].classList.add("active");

  titleElement.textContent = titles[currentSlide];
}, 5000);

/* =========================================================
           ESC CLOSE
        ========================================================= */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;

  closeModal("loginModal");
  closeModal("registerModal");
  closeModal("socioModal");
});

// Al final del archivo, después de todos los window.xxx
document
  .getElementById("btnAccederSocio")
  .addEventListener("click", accederSocio);
