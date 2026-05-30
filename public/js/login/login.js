/* =========================================================
   CONSOLE WARNING
========================================================= */
console.log(`%cDETENTE`, `font-size:48px;font-weight:900;color:#ff2d55;`);
console.log(
  `%cLa consola es solo para desarrolladores.\nSi alguien te pidió pegar código aquí podría robar tu cuenta Geinz.`,
  `font-size:15px;color:white;`,
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
  collection,
  query,
  where,
  getDocs,
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
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

await setPersistence(auth, browserLocalPersistence);

/* =========================================================
   GLOBALS
========================================================= */
let GOOGLE_USER = null;
let splashShown = false;
let localidadSeleccionada = "barranca";

/* =========================================================
   PAÍSES
========================================================= */
const PAISES = [
  { cod: "ar", nombre: "Argentina", flag: "🇦🇷", tel: "+54" },
  { cod: "bo", nombre: "Bolivia", flag: "🇧🇴", tel: "+591" },
  { cod: "br", nombre: "Brasil", flag: "🇧🇷", tel: "+55" },
  { cod: "cl", nombre: "Chile", flag: "🇨🇱", tel: "+56" },
  { cod: "co", nombre: "Colombia", flag: "🇨🇴", tel: "+57" },
  { cod: "cr", nombre: "Costa Rica", flag: "🇨🇷", tel: "+506" },
  { cod: "cu", nombre: "Cuba", flag: "🇨🇺", tel: "+53" },
  { cod: "ec", nombre: "Ecuador", flag: "🇪🇨", tel: "+593" },
  { cod: "sv", nombre: "El Salvador", flag: "🇸🇻", tel: "+503" },
  { cod: "es", nombre: "España", flag: "🇪🇸", tel: "+34" },
  { cod: "us", nombre: "Estados Unidos", flag: "🇺🇸", tel: "+1" },
  { cod: "gt", nombre: "Guatemala", flag: "🇬🇹", tel: "+502" },
  { cod: "hn", nombre: "Honduras", flag: "🇭🇳", tel: "+504" },
  { cod: "mx", nombre: "México", flag: "🇲🇽", tel: "+52" },
  { cod: "ni", nombre: "Nicaragua", flag: "🇳🇮", tel: "+505" },
  { cod: "pa", nombre: "Panamá", flag: "🇵🇦", tel: "+507" },
  { cod: "py", nombre: "Paraguay", flag: "🇵🇾", tel: "+595" },
  { cod: "pe", nombre: "Perú", flag: "🇵🇪", tel: "+51" },
  { cod: "do", nombre: "Rep. Dominicana", flag: "🇩🇴", tel: "+1" },
  { cod: "uy", nombre: "Uruguay", flag: "🇺🇾", tel: "+598" },
  { cod: "ve", nombre: "Venezuela", flag: "🇻🇪", tel: "+58" },
];

function cargarPaises() {
  const select = document.getElementById("regNacionalidad");
  if (!select || select.options.length > 1) return; // ya cargado

  PAISES.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.cod;
    opt.textContent = `${p.flag}  ${p.nombre}`;
    opt.dataset.nombre = p.nombre;
    select.appendChild(opt);
  });

  select.value = "pe";
  document.getElementById("regCodPais").value = "pe";
  document.getElementById("regNombrePais").value = "Perú";
}

window.onNacionalidadChange = (sel) => {
  const opt = sel.options[sel.selectedIndex];
  document.getElementById("regCodPais").value = sel.value;
  document.getElementById("regNombrePais").value =
    opt.dataset.nombre || opt.textContent.replace(/^\S+\s+/, "").trim();
};

/* =========================================================
   SNACKBAR MODERNO — blanco, centrado, estilo Android
========================================================= */
function showSnackbar(msg, tipo = "default") {
  document.getElementById("geinzSnackbar")?.remove();

  const estilos = {
    success: { icon: "check_circle", iconColor: "#22c55e" },
    error: { icon: "error", iconColor: "#ef4444" },
    warning: { icon: "warning", iconColor: "#f59e0b" },
    default: { icon: "info", iconColor: "#6366f1" },
  };
  const e = estilos[tipo] || estilos.default;
  const sb = document.createElement("div");
  sb.id = "geinzSnackbar";

  sb.innerHTML = `
    <span class="material-symbols-outlined"
      style="color:${e.iconColor};font-size:20px;flex-shrink:0;"
      aria-hidden="true">${e.icon}</span>
   <span style="flex:1;line-height:1.4;" >${msg}</span>

    <button onclick="this.parentElement.remove()" aria-label="Cerrar"
      style="background:none;border:none;cursor:pointer;color:#9ca3af;
             display:flex;align-items:center;padding:0;flex-shrink:0;">
      <span class="material-symbols-outlined" style="font-size:18px;">close</span>
    </button>
  `;

  Object.assign(sb.style, {
    position: "fixed",
    bottom: "32px",
    left: "50%",
    transform: "translateX(-50%) translateY(28px)",
    background: "#ffffff",
    color: "#1a1a1a",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "14px 18px",
    borderRadius: "16px",
    fontSize: "14px",
    fontWeight: "500",
    fontFamily: "inherit",
    boxShadow: "0 8px 32px rgba(0,0,0,0.18),0 2px 8px rgba(0,0,0,0.10)",
    zIndex: "99999",
    opacity: "0",
    transition:
      "opacity .28s cubic-bezier(.4,0,.2,1),transform .28s cubic-bezier(.4,0,.2,1)",
    minWidth: "260px",
    maxWidth: "min(90vw,480px)",
    pointerEvents: "all",
    userSelect: "none",
  });

  document.body.appendChild(sb);

  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      sb.style.opacity = "1";
      sb.style.transform = "translateX(-50%) translateY(0)";
    }),
  );

  let autoClose = setTimeout(cerrar, 3500);
  sb.addEventListener("mouseenter", () => clearTimeout(autoClose));
  sb.addEventListener("mouseleave", () => {
    autoClose = setTimeout(cerrar, 1500);
  });

  function cerrar() {
    sb.style.opacity = "0";
    sb.style.transform = "translateX(-50%) translateY(28px)";
    setTimeout(() => sb.remove(), 320);
  }
}

/* =========================================================
   HELPERS
========================================================= */
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const markStep = (id) => document.getElementById(id)?.classList.add("done");

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
  // Inicializar al abrir
  cargarPaises();
  // Límite de fecha máxima = hoy
  const fechaInput = document.getElementById("regFechaNac");
  if (fechaInput) fechaInput.max = new Date().toISOString().split("T")[0];
};

window.openSocioModal = () => {
  document.body.classList.add("blur-active");
  document.getElementById("socioModal").classList.add("active");
};

window.closeModal = (id) => {
  document.getElementById(id)?.classList.remove("active");
  if (id === "loginModal") _resetLoginModal();
  if (!document.querySelector(".modal-overlay.active")) {
    document.body.classList.remove("blur-active");
  }
};

window.closeIfOutside = (event, id) => {
  if (event.target.id === id) closeModal(id);
};

/* =========================================================
   PASSWORD TOGGLE
========================================================= */
window.togglePassword = (id, btn) => {
  const input = document.getElementById(id);
  if (!input) return;
  const isPass = input.type === "password";
  input.type = isPass ? "text" : "password";
  const ico = btn.querySelector(".material-symbols-outlined");
  if (ico) ico.textContent = isPass ? "visibility_off" : "visibility";
};

/* =========================================================
   LOGIN GOOGLE
========================================================= */
window.loginGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    GOOGLE_USER = result.user;

    const userRef = doc(
      db,
      "Trabajadores_Usuarios_Drivers",
      "users",
      "users",
      result.user.uid,
    );
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      showSplash(result.user);
    } else {
      openRegisterModal();
    }
  } catch (err) {
    console.error(err);
    showSnackbar("❌ Error al iniciar sesión con Google", "error");
  }
};

window.openForgotPassword = async () => {
  const correo = document
    .getElementById("loginEmail")
    .value.trim()
    .toLowerCase();

  if (!correo) {
    document.getElementById("loginEmailError").textContent =
      "Ingresa tu correo para recuperar la contraseña.";
    // Volver al paso 1 si estaba en paso 2
    document.getElementById("loginStepPassword").style.display = "none";
    document.getElementById("loginStepEmail").style.display = "block";
    return;
  }

  if (!/^[^\s@]+@gmail\.com$/.test(correo)) {
    document.getElementById("loginEmailError").textContent =
      "Ingresa un correo @gmail.com válido.";
    return;
  }

  // Confirmar antes de enviar
  const confirmar = confirm(`¿Enviar correo de recuperación a:\n${correo}?`);
  if (!confirmar) return;

  try {
    const { sendPasswordResetEmail } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");

    await sendPasswordResetEmail(auth, correo);

    showSnackbar(
      `📩 Correo enviado a ${correo}. Revisa tu bandeja y también la carpeta de <strong>spam</strong>.`,
      "success",
    );
  } catch (err) {
    console.error("Error recuperando contraseña:", err);
    const code = err?.code || "";

    if (code === "auth/user-not-found") {
      showSnackbar("❌ No existe una cuenta con ese correo.", "error");
    } else if (code === "auth/too-many-requests") {
      showSnackbar("⚠️ Demasiados intentos. Espera unos minutos.", "warning");
    } else if (code === "auth/invalid-email") {
      showSnackbar("❌ Correo inválido.", "error");
    } else {
      showSnackbar("❌ Error al enviar. Intenta de nuevo.", "error");
    }
  }
};
/* =========================================================
   REGISTER — validación completa
========================================================= */
window.submitRegister = async (event) => {
  event.preventDefault();

  const modal = document.getElementById("registerModal");

  // ── Leer campos ──────────────────────────────────────────
  const nombre = document.getElementById("regNombre").value.trim();
  const apellido = document.getElementById("regApellido").value.trim();
  const username = document
    .getElementById("regUsername")
    .value.trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  const telefono = document
    .getElementById("regTelefono")
    .value.trim()
    .replace(/\D/g, "");
  const genero = document.getElementById("regGenero").value;
  const localidad = document.getElementById("regLocalidad").value;
  const fechaNac = document.getElementById("regFechaNac").value;
  const codPais = document.getElementById("regCodPais").value;
  const nombrePais = document.getElementById("regNombrePais").value;
  const correo = document
    .getElementById("regCorreo")
    .value.trim()
    .toLowerCase();
  const pass1 = document.getElementById("registerPass1").value;
  const pass2 = document.getElementById("registerPass2").value;
  const terminos = document.getElementById("termsCheck").checked;

  // ── Helper de error ──────────────────────────────────────
  const setError = (id, msg) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? "block" : "none";
  };

  [
    "errNombre",
    "errApellido",
    "errUsername",
    "errTelefono",
    "errGenero",
    "errLocalidad",
    "errFecha",
    "errPais",
    "errCorreo",
    "errPass",
    "errTerminos",
  ].forEach((id) => setError(id, ""));

  // ── Validaciones ─────────────────────────────────────────
  let ok = true;

  if (!nombre || nombre.length < 2) {
    setError("errNombre", "Ingresa un nombre válido (mín. 2 caracteres).");
    ok = false;
  }
  if (!apellido || apellido.length < 2) {
    setError("errApellido", "Ingresa un apellido válido (mín. 2 caracteres).");
    ok = false;
  }
  if (!username || username.length < 3) {
    setError("errUsername", "El usuario debe tener al menos 3 caracteres.");
    ok = false;
  } else if (!/^[a-z0-9_.]+$/.test(username)) {
    setError(
      "errUsername",
      "Solo letras minúsculas, números, puntos y guiones bajos.",
    );
    ok = false;
  }
  if (!telefono || !/^\d{7,15}$/.test(telefono)) {
    setError("errTelefono", "Número inválido (7–15 dígitos).");
    ok = false;
  }
  if (!genero) {
    setError("errGenero", "Selecciona tu género.");
    ok = false;
  }
  if (!localidad) {
    setError("errLocalidad", "Selecciona tu localidad.");
    ok = false;
  }
  if (!fechaNac) {
    setError("errFecha", "Selecciona tu fecha de nacimiento.");
    ok = false;
  } else {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const nacido = new Date(fechaNac + "T00:00:00");
    if (isNaN(nacido.getTime()) || nacido >= hoy) {
      setError("errFecha", "Fecha inválida.");
      ok = false;
    } else {
      const edad =
        hoy.getFullYear() -
        nacido.getFullYear() -
        (hoy < new Date(hoy.getFullYear(), nacido.getMonth(), nacido.getDate())
          ? 1
          : 0);
      if (edad < 13) {
        setError("errFecha", "Debes tener al menos 13 años.");
        ok = false;
      }
      if (edad > 110) {
        setError("errFecha", "Fecha de nacimiento inválida.");
        ok = false;
      }
    }
  }
  if (!codPais || !nombrePais) {
    setError("errPais", "Selecciona tu nacionalidad.");
    ok = false;
  }
  if (!correo) {
    setError("errCorreo", "Ingresa tu correo electrónico.");
    ok = false;
  } else if (!/^[^\s@]+@gmail\.com$/.test(correo)) {
    setError("errCorreo", "Solo se permiten correos @gmail.com.");
    ok = false;
  }
  if (!pass1 || pass1.length < 8) {
    setError("errPass", "La contraseña debe tener al menos 8 caracteres.");
    ok = false;
  } else if (!/(?=.*[A-Z])/.test(pass1) && !/(?=.*[0-9])/.test(pass1)) {
    setError("errPass", "Incluye al menos una mayúscula o un número.");
    ok = false;
  } else if (pass1 !== pass2) {
    setError("errPass", "Las contraseñas no coinciden.");
    ok = false;
  }
  if (!terminos) {
    setError("errTerminos", "Debes aceptar los términos para continuar.");
    ok = false;
  }

  if (!ok) return;

  // ── Botón cargando ───────────────────────────────────────
  const btn = document.querySelector(".btn-register-submit");
  const btnOrig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">hourglass_top</span> Creando cuenta...`;

  try {
    // ── Verificar username único ──────────────────────────
    const usernameRef = doc(
      db,
      "Trabajadores_Usuarios_Drivers",
      "users",
      "nombres_user",
      username,
    );
    const usernameSnap = await getDoc(usernameRef);
    if (usernameSnap.exists()) {
      setError("errUsername", "Este nombre de usuario ya está en uso.");
      return;
    }

    // ── Verificar correo único en Firestore ───────────────
    const correosRef = collection(
      db,
      "Trabajadores_Usuarios_Drivers",
      "users",
      "correos",
    );
    const correoSnap = await getDocs(
      query(correosRef, where("correo", "==", correo)),
    );
    if (!correoSnap.empty) {
      setError("errCorreo", "Este correo ya tiene una cuenta. Inicia sesión.");
      return;
    }

    // ── Crear usuario en Firebase Auth ────────────────────
    const { createUserWithEmailAndPassword } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");

    let newUser;
    try {
      const result = await createUserWithEmailAndPassword(auth, correo, pass1);
      newUser = result.user;
    } catch (authErr) {
      if (authErr.code === "auth/email-already-in-use") {
        setError("errCorreo", "Este correo ya está registrado. Inicia sesión.");
      } else if (authErr.code === "auth/invalid-email") {
        setError("errCorreo", "Correo inválido.");
      } else if (authErr.code === "auth/weak-password") {
        setError("errPass", "Contraseña muy débil. Usa al menos 8 caracteres.");
      } else {
        showSnackbar("❌ Error al crear cuenta. Intenta de nuevo.", "error");
      }
      return;
    }

    const uid = newUser.uid;
    const usernameFinal = "@" + username.replace(/^@/, "");
    const fechaRegistro = new Date().toLocaleDateString("es-PE");

    // ── Guardar correo ────────────────────────────────────
    await setDoc(
      doc(db, "Trabajadores_Usuarios_Drivers", "users", "correos", uid),
      { correo, tipo: "email" },
    );

    // ── Guardar username ──────────────────────────────────
    await setDoc(
      doc(
        db,
        "Trabajadores_Usuarios_Drivers",
        "users",
        "nombres_user",
        username,
      ),
      { id_registrado: uid, nombres_user: usernameFinal },
    );

    // ── Guardar perfil completo ───────────────────────────
    await setDoc(
      doc(db, "Trabajadores_Usuarios_Drivers", "users", "users", uid),
      {
        nombre,
        apellido,
        correo,
        nombre_user: usernameFinal,
        id_user: uid,
        genero,
        localidad,
        fecha_nac: fechaNac,
        fecha_registrada: fechaRegistro,
        puntos: 500,
        cod_pais: codPais,
        nacionalidad_nacimiento: nombrePais,
        tipo_login: "email",
        contacto: {
          cod_telefonico: codPais,
          nombre_pais_numero: nombrePais,
          numero_user: Number(telefono),
        },
        creado_server: serverTimestamp(),
      },
    );

    // ── Actualizar GOOGLE_USER para el splash ─────────────
    GOOGLE_USER = newUser;

    closeModal("registerModal");
    showSnackbar("🎉 ¡Cuenta creada! Bienvenido a Geinz", "success");
    await delay(900);
    showSplash(newUser);
  } catch (err) {
    console.error("Error al registrar:", err);
    showSnackbar("❌ Error al crear la cuenta. Intenta de nuevo.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = btnOrig;
  }
};

/* =========================================================
   LOGIN EMAIL — paso 1: verificar correo
========================================================= */
window.checkEmailExists = async () => {
  const emailInput = document.getElementById("loginEmail");
  const errorEl = document.getElementById("loginEmailError");
  const correo = emailInput?.value.trim().toLowerCase();
  const btn = document.querySelector("#loginStepEmail .btn-primary");

  errorEl.textContent = "";

  if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    errorEl.textContent = "Ingresa un correo válido.";
    return;
  }

  const btnOrig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">hourglass_top</span> Verificando...`;

  try {
    const correosRef = collection(
      db,
      "Trabajadores_Usuarios_Drivers",
      "users",
      "correos",
    );
    const snap = await getDocs(
      query(correosRef, where("correo", "==", correo)),
    );

    if (snap.empty) {
      errorEl.innerHTML = `
        ❌ Este correo no está registrado.
        <button class="link-btn-inline"
          onclick="closeModal('loginModal');openRegisterModal()">
          Crear cuenta gratis
        </button>`;
      return;
    }
    const tipoLogin = snap.docs[0].data().tipo;
    if (tipoLogin === "google") {
      errorEl.innerHTML = `
      <span>🔒 Esta cuenta fue creada con Google.</span><br>
      <button class="link-btn-inline" onclick="loginGoogle()">
        Continuar con Google
      </button>`;
      return;
    }

    // ✅ Existe → mostrar paso contraseña
    document.getElementById("loginStepEmail").style.display = "none";
    document.getElementById("loginStepPassword").style.display = "block";
    document.getElementById("loginEmailChipText").textContent = correo;
    document.getElementById("loginPassword").focus();
  } catch (err) {
    console.error("Error verificando correo:", err);
    errorEl.textContent = "Error al verificar. Intenta de nuevo.";
  } finally {
    btn.disabled = false;
    btn.innerHTML = btnOrig;
  }
};

/* =========================================================
   LOGIN EMAIL — paso 2: autenticar
========================================================= */
window.doEmailLogin = async () => {
  const correo = document
    .getElementById("loginEmail")
    .value.trim()
    .toLowerCase();
  const pass = document.getElementById("loginPassword").value;
  const errorEl = document.getElementById("loginPassError");
  const btn = document.getElementById("btnDoLogin");

  errorEl.textContent = "";

  if (!pass) {
    errorEl.textContent = "Ingresa tu contraseña.";
    return;
  }

  const btnOrig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">hourglass_top</span> Ingresando...`;

  try {
    const { signInWithEmailAndPassword } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");

    const result = await signInWithEmailAndPassword(auth, correo, pass);
    GOOGLE_USER = result.user;

    closeModal("loginModal");
    showSplash(result.user);
  } catch (err) {
    console.error("Error login email:", err);
    const code = err?.code || "";
    if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
      errorEl.textContent = "❌ Contraseña incorrecta. Inténtalo de nuevo.";
    } else if (code === "auth/too-many-requests") {
      errorEl.textContent = "⚠️ Demasiados intentos. Espera unos minutos.";
    } else if (code === "auth/user-disabled") {
      errorEl.textContent = "🚫 Esta cuenta fue suspendida.";
    } else {
      errorEl.textContent = "Error inesperado. Intenta de nuevo.";
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = btnOrig;
  }
};

window.backToEmail = () => {
  document.getElementById("loginStepPassword").style.display = "none";
  document.getElementById("loginStepEmail").style.display = "block";
  document.getElementById("loginPassword").value = "";
  document.getElementById("loginPassError").textContent = "";
};

function _resetLoginModal() {
  document.getElementById("loginStepEmail").style.display = "block";
  document.getElementById("loginStepPassword").style.display = "none";
  document.getElementById("loginEmail").value = "";
  document.getElementById("loginPassword").value = "";
  document.getElementById("loginEmailError").textContent = "";
  document.getElementById("loginPassError").textContent = "";
}

/* =========================================================
   SPLASH SCREEN
========================================================= */
async function showSplash(user) {
  if (splashShown) return;
  splashShown = true;

  document.getElementById("mainUI").style.display = "none";
  document.getElementById("splashScreen").classList.add("visible");

  await delay(600);
  markStep("step1");
  await delay(700);
  markStep("step2");

  const snap = await getDoc(
    doc(db, "Trabajadores_Usuarios_Drivers", "users", "users", user.uid),
  );

  await delay(600);
  markStep("step3");
  await delay(700);

  const data = snap.exists() ? snap.data() : {};
  const nombre = data.nombre || user.displayName || "Usuario";
  const username = data.nombre_user || "@" + user.email.split("@")[0];

  document.getElementById("wName").textContent = nombre;
  document.getElementById("wUser").textContent = username;
  document.getElementById("wPoints").textContent = data.puntos ?? 500;

  document.getElementById("sValidating").classList.add("fade-out");
  await delay(450);
  // ✅ OCULTAR COMPLETAMENTE EL VALIDADOR (display: none)
  document.getElementById("sValidating").style.display = "none";
  document.getElementById("sWelcome").classList.add("visible");

  const idTienda = data.id_tienda_propietario?.trim();

  document.getElementById("btnEnter").onclick = async () => {
    if (!idTienda) {
      showSnackbar("⚠️ No tienes un ID de tienda vinculado", "warning");
      setTimeout(() => abrirPantallaSocio(user), 1200);
      return;
    }
    try {
      const lugarSnap = await getDoc(doc(db, "lugares", idTienda));
      if (!lugarSnap.exists()) {
        showSnackbar("❌ Tu ID de tienda no existe o fue eliminado", "error");
        setTimeout(() => abrirPantallaSocio(user), 1400);
        return;
      }
      const localidad = lugarSnap.data().localidad || "barranca";
      sessionStorage.setItem("tiendaId", idTienda);
      sessionStorage.setItem("localidad", localidad);
      window.location.href = `./../../dasboard/panel_perfil.html?id=${encodeURIComponent(idTienda)}&localidad=${encodeURIComponent(localidad)}`;
    } catch (err) {
      console.error(err);
      showSnackbar("Error al validar tu tienda", "error");
      setTimeout(() => abrirPantallaSocio(user), 1400);
    }
  };
}

/* =========================================================
   PANTALLA SELECTOR DE TIENDA
========================================================= */
function abrirPantallaSocio() {
  document.getElementById("splashScreen").style.display = "none";
  document.getElementById("selectorSocioScreen").classList.add("active");

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.onclick = () => {
      document
        .querySelectorAll(".chip")
        .forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      localidadSeleccionada = chip.dataset.local;
    };
  });
}

/* =========================================================
   CONTINUAR PANEL
========================================================= */
window.continuarPanel = async () => {
  const valor = document.getElementById("selectorInput").value.trim();

  if (!valor || valor.length < 4) {
    showSnackbar("⚠️ Ingresa un ID válido", "warning");
    return;
  }

  const btn = document.getElementById("btnContinuar");
  const btnOrig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">hourglass_top</span> Validando...`;

  try {
    const tiendaRef = doc(
      db,
      "Tiendas",
      localidadSeleccionada,
      localidadSeleccionada,
      valor,
    );
    const snap = await getDoc(tiendaRef);

    if (!snap.exists()) {
      showSnackbar(
        "❌ Ese ID no existe. Verifica e intenta de nuevo.",
        "error",
      );
      return;
    }

    sessionStorage.setItem("localidad", localidadSeleccionada);
    sessionStorage.setItem("tiendaId", valor);
    window.location.href = `./../../dasboard/panel_perfil?id=${encodeURIComponent(valor)}&localidad=${encodeURIComponent(localidadSeleccionada)}`;
  } catch (err) {
    console.error(err);
    showSnackbar("Error al validar. Intenta de nuevo.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = btnOrig;
  }
};

/* =========================================================
   ACCEDER SOCIO (modal)
========================================================= */
window.accederSocio = async () => {
  const idTienda = document.getElementById("socioId").value.trim();
  const localidad = document
    .getElementById("socioLocalidad")
    .value.toLowerCase();

  if (!idTienda || !localidad) {
    showSnackbar("⚠️ Completa todos los campos", "warning");
    return;
  }
  if (idTienda.length < 4) {
    showSnackbar("⚠️ ID inválido", "warning");
    return;
  }

  const btn = document.getElementById("btnAccederSocio");
  const btnOrig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">hourglass_top</span> Validando...`;

  try {
    const snap = await getDoc(
      doc(db, "Tiendas", localidad, localidad, idTienda),
    );

    if (!snap.exists()) {
      showSnackbar(
        "❌ Ese ID no existe. Verifica e intenta de nuevo.",
        "error",
      );
      return;
    }

    sessionStorage.setItem("tiendaId", idTienda);
    sessionStorage.setItem("localidad", localidad);
    window.location.href = `./../../dasboard/panel_perfil?id=${encodeURIComponent(idTienda)}&localidad=${encodeURIComponent(localidad)}`;
  } catch (err) {
    console.error(err);
    showSnackbar("Error al validar. Intenta de nuevo.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = btnOrig;
  }
};

window.switchToUserLogin = () => {
  closeModal("socioModal");
  openLoginModal();
};

window.validarCorreoGmail = (input) => {
  const val = input.value.trim().toLowerCase();
  const errorEl = document.getElementById("errCorreo");
  const hintEl = document.getElementById("hintCorreo");

  errorEl.textContent = "";
  errorEl.style.display = "none";
  hintEl.style.display = "none";

  if (!val) return;

  // Solo Gmail
  if (val.includes("@") && !val.endsWith("@gmail.com")) {
    errorEl.textContent = "Solo se permiten correos @gmail.com.";
    errorEl.style.display = "block";
    return;
  }

  // Si parece válido, mostrar aviso informativo
  if (/^[^\s@]+@gmail\.com$/.test(val)) {
    hintEl.style.display = "flex";
  }
};

/* =========================================================
   AUTH STATE — auto-login si ya hay sesión
========================================================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  GOOGLE_USER = user;
  showSplash(user);
});

/* =========================================================
   BACKGROUND SLIDER + DYNAMIC TITLE
========================================================= */
const slides = document.querySelectorAll(".slide");
const titleElement = document.getElementById("dynamicTitle");
const titles = [
  "Encuentra tu próximo destino favorito",
  "Tu aventura con Geinz comienza hoy",
  "Bienvenido a Geinz, tu espacio ideal",
  "Descubre los mejores negocios locales",
  "Todo lo que necesitas, cerca de ti",
  "Explora, conecta y disfruta tu ciudad",
  "Geinz, tu guía de negocios locales",
];

let currentSlide = 0;
if (titleElement) titleElement.textContent = titles[0];

setInterval(() => {
  slides[currentSlide]?.classList.remove("active");
  currentSlide = (currentSlide + 1) % slides.length;
  slides[currentSlide]?.classList.add("active");
  if (titleElement)
    titleElement.textContent = titles[currentSlide % titles.length];
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

/* =========================================================
   BOTÓN ACCEDER SOCIO
========================================================= */
document
  .getElementById("btnAccederSocio")
  ?.addEventListener("click", accederSocio);
