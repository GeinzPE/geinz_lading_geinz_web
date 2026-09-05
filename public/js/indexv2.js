
import {
  doc,
  getDoc,
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── FIREBASE (Geinz centralizado desde db.js) ─────────────
import { app, db } from "../js/db/db.js";
import { tiendaSubDoc } from "../js/rutas/rutas.js";
import { watchUserSession } from "./session/session.js";

// ─── DETECCIÓN: ¿viene del login? ───────────────────────────
const vieneDeLogin = document.referrer.includes("/logindata/") ||
  document.referrer.includes("login.html");

if (vieneDeLogin) {
  document.documentElement.classList.add("skip-heavy-loader");
}

const appPlanes = initializeApp({
  apiKey: "AIzaSyA47YFtXgzUQe8w_Wb6AlfDcQSjOB5rT_U",
  authDomain: "proyectolista-95172.firebaseapp.com",
  projectId: "proyectolista-95172",
}, "planes");

// ─── SKELETON: espera carga de página + verificación de sesión ─────
let pageLoaded = false;
let authResolved = false;
let skeletonOcultado = false;

function intentarOcultarSkeleton() {
  if (skeletonOcultado) return;
  if (pageLoaded && authResolved) {
    skeletonOcultado = true;
    document.getElementById("page-skeleton")?.classList.add("hidden-sk");
  }
}

window.addEventListener("load", () => {
  pageLoaded = true;
  intentarOcultarSkeleton();
});

// Fallback de seguridad: si algo tarda demasiado (red lenta, Firebase caído, etc.)
// igual ocultamos el skeleton para no dejar al usuario atrapado.
setTimeout(() => {
  pageLoaded = true;
  authResolved = true;
  intentarOcultarSkeleton();
}, vieneDeLogin ? 1500 : 4000);

// Si viene del login, forzamos que se sienta más rápido de todos modos
// una vez que ambas condiciones reales se cumplan.
if (vieneDeLogin) {
  setTimeout(() => intentarOcultarSkeleton(), 400);
}

window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    window.location.reload();
  }
});

watchUserSession(
  (user) => {
        const wrap = document.getElementById("userAvatarWrap");
    const img = document.getElementById("userAvatarImg");
    const sk = document.getElementById("userAvatarSk");
    const nameEl = document.getElementById("userAvatarName");

    if (wrap && img) {
      const fotoUrl = user.foto || "img/icons/favicon-96x96.png";
      
      if (nameEl) {
        nameEl.textContent = user.nombre || user.nombre_user || "Mi cuenta";
      }

      const marcarCargada = () => {
        img.style.opacity = "1";
        sk?.classList.add("loaded");
      };

      img.addEventListener("load", marcarCargada, { once: true });
      img.addEventListener("error", marcarCargada, { once: true });
      img.src = fotoUrl;

      wrap.style.display = "flex";
      wrap.onclick = () => {
        window.location.href = "../logindata/login.html";
      };
    }
    document.querySelector('button[onclick="openBusinessPanel()"]')?.style.setProperty("display", "none");

    // 👇 la sesión ya resolvió (SÍ hay usuario) — recién ahora dejamos ocultar el skeleton
    authResolved = true;
    intentarOcultarSkeleton();
  },
  () => {
    document.getElementById("userAvatarWrap")?.style.setProperty("display", "none");

    // 👇 la sesión ya resolvió (NO hay usuario) — recién ahora dejamos ocultar el skeleton
    authResolved = true;
    intentarOcultarSkeleton();
  }
);

const dbPlanes = getFirestore(appPlanes);
const functions = getFunctions(app, "us-central1");

// ─── CLOUD FUNCTIONS ───────────────────────────────────────
const confirmarPagoFn = httpsCallable(functions, "confirmarPago");
const agregar_pago_usuario_tienda = httpsCallable(functions, "agregar_pago_para_el_usuario_tienda");

const ORDEN_PLANES = ["basico", "avanzado", "primium", "busness"];

// ─── AUTH GUARD ────────────────────────────────────────────
if (window.location.hostname.includes("web.app") || window.location.hostname.includes("firebaseapp.com")) {
  window.location.replace("https://geinztech.com" + window.location.pathname + window.location.search);
}

// ─── HABILITAR BOTONES DE PLAN ─────────────────────────────
window.habilitarPlanes = () => {
  document.querySelectorAll(".btn-plan").forEach(btn => {
    btn.disabled = false;
    btn.classList.add("btn-plan-active");
    btn.style.removeProperty("opacity");
  });
};

// ─── BUSCAR USUARIO ────────────────────────────────────────
window.buscarUsuario = async () => {
  const id = document.getElementById("userId").value.trim();
  const msg = document.getElementById("msgId");
  const progress = document.getElementById("progressContainer");
  const bar = document.getElementById("progressBar");
  const resDiv = document.getElementById("resultadoUsuario");

  if (!id) { msg.innerText = "❌ Digite un UID corporativo válido"; return; }

  document.getElementById("btnSearch").disabled = true;
  progress.style.display = "block";
  bar.style.width = "25%";
  msg.innerText = "Sincronizando con nodo Barranca...";

  try {
    const snap = await getDoc(
      tiendaSubDoc("barranca", "tiendas", id));
    bar.style.width = "65%";

    if (!snap.exists()) throw new Error("El identificador ingresado no coincide con ningún registro activo");

    const d = snap.data();
    bar.style.width = "100%";

    setTimeout(() => {
      document.getElementById("tiendaLogo").src = d.img_tienda?.logo_tienda || "";
      document.getElementById("tiendaNombre").innerText = d.nombre_tienda || "Establecimiento sin nombre";
      document.getElementById("tiendaCategoria").innerText = d.categoria_tienda || "Módulo General";
      document.getElementById("tiendaSaldo").innerText = (d.puntos_tienda || 0).toLocaleString();

      progress.style.display = "none";
      resDiv.style.display = "block";
      msg.innerHTML = "✅ Comercio autenticado. Pasarela de pagos liberada.";

      window._userId = id;
      window._nombre_tienda = d.nombre_tienda || "";
      window._categoria_tienda = d.categoria_tienda || "";
      window._saldo_tienda = d.puntos_tienda || 0;
      window._logo_tienda = d.img_tienda?.logo_tienda || "";
      window._localidad_tienda = d.localidad || "barranca";
      window._pago_actual_id = d.pago_actual_id || "";

      habilitarPlanes();
    }, 200);

  } catch (e) {
    msg.innerHTML = "❌ " + e.message;
    progress.style.display = "none";
  }

  document.getElementById("btnSearch").disabled = false;
};

(function animateGzPercent() {
  const pctEl = document.getElementById("gzProgressPct");
  if (!pctEl) return;
  let start = null;
  const duration = 2400, delay = 1100, target = 92;
  function step(ts) {
    if (!start) start = ts;
    const elapsed = ts - start - delay;
    if (elapsed < 0) { requestAnimationFrame(step); return; }
    const t = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    pctEl.textContent = Math.round(eased * target) + "%";
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
})();

// ─── AGENDAR PAGO ──────────────────────────────────────────
async function agendar_pago(obj_plan, btn) {
  if (!btn || window._procesandoPago) return;
  if (!window._userId) {
    alert("Sincronice su UID de establecimiento primero");
    return;
  }

  window._procesandoPago = true;
  const textoOriginal = btn.textContent.trim();

  document.querySelectorAll(".btn-plan").forEach(b => {
    b.disabled = true;
    b.classList.remove("btn-plan-active");
    b.style.opacity = "0.35";
  });

  btn.style.position = "relative";
  btn.style.overflow = "hidden";
  btn.style.opacity = "1";
  btn.innerHTML = `
          <span style="position:relative;z-index:2;">${textoOriginal}</span>
          <div id="_btnBar" style="
              position: absolute;
              bottom: 0; left: 0;
              height: 3px;
              width: 0%;
              background: linear-gradient(90deg, #7c3aed, #a855f7);
              border-radius: 0 0 12px 12px;
              transition: width .07s linear;
              z-index: 3;
          "></div>
      `;

  const barEl = btn.querySelector("#_btnBar");
  let prog = 0;

  const interval = setInterval(() => {
    const step = prog < 35 ? 5 : prog < 65 ? 2 : 0.5;
    prog = Math.min(prog + step, 92);
    if (barEl) barEl.style.width = prog + "%";
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

    
    const res = await agregar_pago_usuario_tienda(payload);
    
    const idPago = res?.data?.id_pago;
    if (!idPago) throw new Error("No se generó ID de pago");

    clearInterval(interval);
    if (barEl) {
      barEl.style.transition = "width .3s ease";
      barEl.style.width = "100%";
    }

    await new Promise(r => setTimeout(r, 400));
    window.location.href = `dasboard/pagos?orderId=${idPago}&ins=i`;
  } catch (error) {
    clearInterval(interval);
    console.error("❌ Error CF:", error);

    if (barEl) {
      barEl.style.transition = "width .3s ease";
      barEl.style.background = "linear-gradient(90deg,#ef4444,#f87171)";
      barEl.style.width = "100%";
    }

    setTimeout(() => {
      document.querySelectorAll(".btn-plan").forEach(b => {
        b.disabled = false;
        b.classList.add("btn-plan-active");
        b.style.opacity = "1";
      });
      btn.innerHTML = textoOriginal;
      btn.style.position = "";
      btn.style.overflow = "";
      window._procesandoPago = false;
    }, 1200);

    alert(error?.message || "Error al procesar pago");
  }
}

// ─── CARGAR PLANES ─────────────────────────────────────────
async function cargarPlanes() {
  const wrapper = document.getElementById("pricingWrapper");
  if (!wrapper) return;
  wrapper.innerHTML = Array(4).fill(0).map(() =>
    `<div class="plan-card skeleton h-96"></div>`
  ).join("");

  try {
    const snap = await getDocs(collection(dbPlanes, "precios_planes_geinz"));
    const planesMap = {};
    snap.forEach(d => { planesMap[d.data().nombre_plan] = d.data(); });
    wrapper.innerHTML = "";

    ORDEN_PLANES.forEach(key => {
      const p = planesMap[key];
      if (!p) return;

      const totalMonedas = p.monedas_inicial + (p.monedas_agregadas || 0);

      const card = document.createElement("div");
      card.className = `plan-card ${p.descripcion === "Más usado" ? "featured-plan" : ""}`;

      card.innerHTML = `
                  <div>
                      <h4 class="text-gray-400 text-xs font-bold uppercase tracking-wider">${p.nombre}</h4>
                      <div class="text-3xl font-extrabold text-white mt-4 tracking-tight leading-none">
                          ${totalMonedas.toLocaleString()}
                          <img src="./img/icon_monedas_3d.webp" class="coin-img-small" alt="coin">
                      </div>
                      ${p.monedas_agregadas
          ? `<div class="inline-flex items-center gap-1 mt-3 px-2 py-0.5 rounded
                              bg-emerald-400/10 border border-emerald-500/15
                              text-[9px] text-emerald-400 font-bold tracking-wide uppercase">
                              🎁 Bonus +${p.monedas_agregadas.toLocaleString()}
                             </div>`
          : `<div class="h-6"></div>`
        }
                      <ul class="mt-6 space-y-3 text-xs text-gray-400 border-t border-white/[0.04] pt-6 leading-relaxed">
                          ${p.accesos.map(a => `
                              <li class="flex items-start gap-2">
                                  <span class="text-purple-400 font-semibold">✓</span>
                                  <span class="flex-1">${a}</span>
                              </li>
                          `).join("")}
                      </ul>
                  </div>
                  <button
                      class="btn-plan"
                      disabled
                      data-key="${key}"
                      data-nombre="${p.nombre}"
                      data-precio="${p.precio_soles}"
                      data-monedas="${totalMonedas}">
                      S/ ${p.precio_soles}.00
                  </button>
              `;

      const btn = card.querySelector(".btn-plan");
      btn.addEventListener("click", () => {
        if (btn.disabled || window._procesandoPago) return;
        agendar_pago({
          nombre_plan: btn.dataset.key,
          nombre: btn.dataset.nombre,
          precio_soles: parseFloat(btn.dataset.precio),
        }, btn);
      });

      wrapper.appendChild(card);
    });

  } catch (e) {
    console.error(e);
    wrapper.innerHTML = `
              <p class="text-red-400 col-span-full text-center text-xs font-light">
                  Fallo crítico de sincronización en el tarifario.
              </p>`;
  }
}

// ─── CULQI (flujo antiguo, mantenido por compatibilidad) ───
window.pagar = (monto, monedas) => {
  if (!window._userId) { alert("Sincronice su UID primero"); return; }
  window._pago = { monto, monedas };
  document.getElementById("paymentOverlay").classList.remove("hidden");
  Culqi.publicKey = "pk_test_XlR4ytKuiYD8EgG1";
  Culqi.settings({
    title: "Geinz Premium",
    currency: "PEN",
    amount: Math.round(monto * 100),
    description: `Compra Pack de ${monedas} Créditos`
  });
  Culqi.open();
};

window.culqi = async () => {
  if (!Culqi.token) {
    document.getElementById("paymentOverlay").classList.add("hidden");
    alert("La transacción ha sido cancelada.");
    return;
  }
  try {
    await confirmarPagoFn({
      token: Culqi.token.id,
      monto: window._pago.monto,
      email: Culqi.token.email,
      monedas: window._pago.monedas,
      userId: window._userId
    });
    Culqi.close();
    document.getElementById("paymentTitle").innerText = "¡Validado con éxito! 🎉";
    setTimeout(() => location.reload(), 1800);
  } catch (e) {
    Culqi.close();
    alert("Fallo estructural en el procesamiento del token");
    document.getElementById("paymentOverlay").classList.add("hidden");
  }
};

// ─── LOCALIDADES ─────────────────────────────────────────────
let localidadSeleccionada = "barranca";

window.seleccionarLocalidad = (loc) => {
  localidadSeleccionada = loc;
  document.querySelectorAll("button[id^='btn-']").forEach(btn => {
    btn.disabled = false;
    btn.classList.remove("opacity-20");
  });
  const nombres = { barranca: "Barranca", lima: "Lima", arequipa: "Arequipa" };
  document.getElementById("msgId") && (document.getElementById("msgId").innerHTML =
    `✅ Canal establecido en ${nombres[loc] || loc}. Módulos de categoría desbloqueados de forma exitosa.`);
};

window.abrirCategoria = (tipo) => {
  if (tipo === "promociones") {
    window.location.href = `/scree/promos?loc=${localidadSeleccionada}`;
  } else if (tipo === "comercios") {
    window.location.href = `/scree/categorias?loc=${localidadSeleccionada}`;
  }
};
window.openBusinessPanel = () => {
  window.location.href = "./logindata/login";
};
window.openAboutUs = () => {
  window.location.href = "./scree/nostros";
};

// ─── GALERÍA BENTO carga robusta ────────────────────────────
function revelarImagen(img) {
  const skId = img.dataset.sk;
  if (skId) {
    const sk = document.getElementById(skId);
    if (sk) sk.classList.add("loaded");
  }
}

function initGalleryImages() {
  document.querySelectorAll(".gallery-img").forEach(img => {
    if (img.complete && img.naturalWidth > 0) {
      revelarImagen(img);
      return;
    }
    img.addEventListener("load", () => revelarImagen(img));
    img.addEventListener("error", () => revelarImagen(img));
  });
}

// ─── SKELETON CITY CARDS ─────────────────────────────────────
const cityBgs = [
  { skId: "citySk1", url: "https://firebasestorage.googleapis.com/v0/b/geinzworkapp.appspot.com/o/geinz_work_turismo%2Fbarranca%2Fbarranca%2FDJI_0159.00_00_00_00.Imagen%20fija002.webp?alt=media&token=d6b10663-457f-44ff-96a8-4a1f9134f4b6" },
  { skId: "citySk2", url: "https://firebasestorage.googleapis.com/v0/b/geinzworkapp.appspot.com/o/geinz_work_turismo%2Fbarranca%2Fparamonga%2FFORTALEZA%20PGA.webp?alt=media&token=8a910e66-60f1-45ff-9dda-f042e1a0898e" },
  { skId: "citySk3", url: "https://firebasestorage.googleapis.com/v0/b/geinzworkapp.appspot.com/o/geinz_work_turismo%2Fbarranca%2Fpativilca%2FPATIVILCA%20MUSEO%20(1).webp?alt=media&token=de7d4cc9-0dcd-4945-a238-49c8df616193" },
  { skId: "citySk4", url: "https://firebasestorage.googleapis.com/v0/b/geinzworkapp.appspot.com/o/geinz_work_turismo%2Fbarranca%2Fsupe%2FCARAL%20(1).webp?alt=media&token=abbe7657-bc93-421f-b9dd-8c00c65c5e47" },
];

function initCitySkeletons() {
  cityBgs.forEach(({ skId, url }) => {
    const probe = new Image();
    const done = () => {
      const sk = document.getElementById(skId);
      if (sk) sk.classList.add("loaded");
    };
    probe.onload = done;
    probe.onerror = done;
    probe.src = url;
  });
}

// ─── HERO IMG skeleton ───────────────────────────────────────
function initHeroSkeleton() {
  const heroImg = document.getElementById("heroImg");
  const heroSk = document.getElementById("heroImgSk");
  if (!heroImg || !heroSk) return;

  const done = () => {
    heroImg.style.opacity = "1";
    heroSk.classList.add("loaded");
  };

  if (heroImg.complete && heroImg.naturalWidth > 0) {
    done();
  } else {
    heroImg.addEventListener("load", done);
    heroImg.addEventListener("error", done);
  }
}



// ─── INIT ────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("button[id^='btn-']").forEach(btn => {
    btn.disabled = false;
    btn.classList.remove("opacity-20");
  });

  initGalleryImages();
  initCitySkeletons();
  initHeroSkeleton();

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("active"); });
  }, { threshold: 0.02, rootMargin: "0px 0px -10px 0px" });

  document.querySelectorAll(".reveal").forEach(el => observer.observe(el));
});

if (document.readyState !== "loading") {
  initGalleryImages();
  initCitySkeletons();
  initHeroSkeleton();
}

document.getElementById("btnSearch")?.addEventListener("click", window.buscarUsuario);
cargarPlanes();