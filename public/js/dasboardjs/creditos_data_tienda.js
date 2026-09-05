// ═══════════════════════════════════════════════════════════
//  cuenta_tarjeta.js - Tarjeta de cuenta (TIEMPO REAL)
// ═══════════════════════════════════════════════════════════
const params = new URLSearchParams(window.location.search);
const tiendaId = params.get("id") || sessionStorage.getItem("tiendaId");
const localidad =
  params.get("localidad") || sessionStorage.getItem("localidad");

if (!tiendaId || !localidad) {
  console.warn("⚠️ Parámetros inválidos, redirigiendo al login...");
  window.location.href = "../login/index";
}
(function () {
  "use strict";

  
  // ============================================================
  //  CACHE GLOBAL
  // ============================================================
  let _cache = {
    saldo: 0,
    planes_activacion: null,
    planes_bot_promo: null,
    publicidad: null,
  };

  function sendCacheToIframe(iframe) {
    try {
      if (window._datosParaIframe) {
        if (window._datosParaIframe.payload) {
          window._datosParaIframe.payload.saldo_tienda = _cache.saldo;
        }
        iframe.contentWindow.postMessage(window._datosParaIframe, "*");
      }
      if (_cache.saldo !== null)
        iframe.contentWindow.postMessage(
          { type: "SALDO_UPDATE", saldo: _cache.saldo },
          "*",
        );
      if (_cache.publicidad)
        iframe.contentWindow.postMessage(
          { type: "PUBLICIDAD_UPDATE", publicidad: _cache.publicidad },
          "*",
        );
      if (_cache.planes_activacion || _cache.planes_bot_promo)
        iframe.contentWindow.postMessage(
          {
            type: "PLANES_UPDATE",
            planes_activacion: _cache.planes_activacion,
            planes_bot_promo: _cache.planes_bot_promo,
            publicidad: _cache.publicidad,
          },
          "*",
        );
    } catch (e) {}
  }

  function broadcastSaldo(saldo) {
    _cache.saldo = saldo;
    window._saldoActual = saldo;
    if (window._datosParaIframe?.payload) {
      window._datosParaIframe.payload.saldo_tienda = saldo;
    }
        document.querySelectorAll("iframe").forEach((iframe) => {
      try {
        iframe.contentWindow.postMessage({ type: "SALDO_UPDATE", saldo }, "*");
      } catch (e) {}
    });
    // 👈 NUEVO: reenviar al padre para que llegue a los iframes hermanos (Publicidad, etc.)
    try {
      window.parent.postMessage({ type: "SALDO_UPDATE", saldo }, "*");
    } catch (e) {}
  }

  function broadcastPublicidad(publicidad) {
    _cache.publicidad = publicidad;
        document.querySelectorAll("iframe").forEach((iframe) => {
      try {
        iframe.contentWindow.postMessage(
          { type: "PUBLICIDAD_UPDATE", publicidad },
          "*",
        );
      } catch (e) {}
    });
    // 👈 NUEVO
    try {
      window.parent.postMessage({ type: "PUBLICIDAD_UPDATE", publicidad }, "*");
    } catch (e) {}
  }

  function broadcastPlanes(planesActivacion, planesBotPromo, publicidad) {
    _cache.planes_activacion = planesActivacion;
    _cache.planes_bot_promo = planesBotPromo;
    _cache.publicidad = publicidad;
        document.querySelectorAll("iframe").forEach((iframe) => {
      try {
        iframe.contentWindow.postMessage(
          {
            type: "PLANES_UPDATE",
            planes_activacion: planesActivacion,
            planes_bot_promo: planesBotPromo,
            publicidad: publicidad,
          },
          "*",
        );
      } catch (e) {}
    });
    // 👈 NUEVO
    try {
      window.parent.postMessage(
        {
          type: "PLANES_UPDATE",
          planes_activacion: planesActivacion,
          planes_bot_promo: planesBotPromo,
          publicidad: publicidad,
        },
        "*",
      );
    } catch (e) {}
  }

  document.querySelectorAll("iframe").forEach((iframe) => {
    iframe.addEventListener("load", () => {
      sendCacheToIframe(iframe);
          });
  });

  const _iframeObserver = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node.tagName === "IFRAME") {
          node.addEventListener("load", () => {
            sendCacheToIframe(node);
                      });
        }
      });
    });
  });
  _iframeObserver.observe(document.body, { childList: true, subtree: true });

  // ============================================================
  //  1. FIREBASE PLANES
  // ============================================================
  async function getFirebasePlanes() {
    const { initializeApp, getApps } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const { getFirestore } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const app =
      getApps().find((a) => a.name === "planes") ||
      initializeApp(
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
    return getFirestore(app);
  }

  // ============================================================
  //  2. PUBLICIDAD
  // ============================================================
  async function initPublicidad() {
        try {
      const { doc, getDoc } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      const db = await getFirebasePlanes();
      const snap = await getDoc(doc(db, "precio_apartado", "app"));
      if (!snap.exists()) {
        console.warn("⚠️ [publicidad] Documento no encontrado");
        return;
      }
      const publicidad = snap.data().publicidad || {};
      const data = snap.data();
      if (data.costo_por_moneda != null) {
        publicidad.costo_por_moneda = data.costo_por_moneda;
      }
            window._publicidad = publicidad;
      _renovacion._publicidadData = publicidad;
      broadcastPublicidad(publicidad);
    } catch (err) {
      console.error("❌ [publicidad] Error:", err);
    }
  }

  // ============================================================
  //  3. PLANES
  // ============================================================
  async function initPreciosApp() {
        try {
      const { doc, getDoc } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      const db = await getFirebasePlanes();
      const snap = await getDoc(doc(db, "precio_apartado", "app"));
      if (!snap.exists()) {
        console.warn("⚠️ [precios] Documento no encontrado");
        return;
      }
      const data = snap.data();
      const planesActivacion = data.planes_activacion || {};
      const rawBotPromo = data.planes_bot_promo || {};
      const planesBotPromo = {
        ficha40: rawBotPromo.ficha40,
        planes_bot_tiendas: rawBotPromo.planes_bot_tiendas || {},
      };
      const publicidad = data.publicidad || {};
      if (data.costo_por_moneda != null) {
        publicidad.costo_por_moneda = data.costo_por_moneda;
      }
                  window._planesActivacion = planesActivacion;
      window._planesBotPromo = planesBotPromo;
      window._publicidad = publicidad;
      _renovacion._planesData = planesActivacion;
      _renovacion._planesBotPromoData = planesBotPromo;
      _renovacion._publicidadData = publicidad;
      broadcastPlanes(planesActivacion, planesBotPromo, publicidad);
    } catch (err) {
      console.error("❌ [precios] Error:", err);
    }
  }

  // ============================================================
  //  4. CUENTA EN TIEMPO REAL
  // ============================================================
  let accountData = null;
  let unsubscribeOriginal = null;
  let unsubscribeServicios = null;

  async function initRealtimeAccount() {
        try {
      const { onSnapshot } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      const { db } = await import("../db/db.js");
      const { tiendaDoc } = await import("../rutas/rutas.js");

      const docRefOriginal = tiendaDoc(localidad, "tiendas", tiendaId);
      const docRefServicios = tiendaDoc(
        localidad,
        "tiendas_servicios_geinz_activos",
        tiendaId,
      );

      let originalData = {};
      let serviciosData = {};

      unsubscribeOriginal = onSnapshot(
        docRefOriginal,
        (snap) => {
          originalData = snap.exists() ? snap.data() : {};
          combineAndUpdate(originalData, serviciosData);
        },
        (err) => console.error("❌ Error en snapshot original:", err),
      );
      unsubscribeServicios = onSnapshot(
        docRefServicios,
        (snap) => {
          serviciosData = snap.exists() ? snap.data() : {};
          combineAndUpdate(originalData, serviciosData);
        },
        (err) => console.error("❌ Error en snapshot servicios:", err),
      );
    } catch (err) {
      console.error("❌ [ERROR] initRealtimeAccount:", err);
    }
  }

  function combineAndUpdate(original, servicios) {
    const combined = { ...original };
    if (servicios.panel_admin) combined.panel_admin = servicios.panel_admin;
    if (servicios.notificaciones)
      combined.notificaciones = servicios.notificaciones;
    accountData = combined;
        updateAccountCard();
  }

  // ============================================================
  //  5. TARJETA DE CUENTA
  // ============================================================
  document.addEventListener("click", function (e) {
    const header = e.target.closest(".exp-header");
    if (!header) return;
    const card = header.closest(".exp-card");
    if (!card) return;
    card.classList.toggle("open");
  });

  window.copyId = function (e) {
    e.stopPropagation();
    const idSpan = document.getElementById("user-id");
    if (!idSpan) return;
    navigator.clipboard
      .writeText(idSpan.textContent)
      .then(() => {
        const toast = document.getElementById("toast");
        if (toast) {
          toast.classList.add("show");
          setTimeout(() => toast.classList.remove("show"), 2000);
        }
      })
      .catch(() => alert("No se pudo copiar el ID"));
  };

  function formatDate(dateInput) {
    if (!dateInput) return "—";
    if (dateInput instanceof Date) {
      const d = dateInput.getDate().toString().padStart(2, "0");
      const m = (dateInput.getMonth() + 1).toString().padStart(2, "0");
      const y = dateInput.getFullYear();
      return `${d}/${m}/${y}`;
    }
    if (typeof dateInput === "string") {
      if (dateInput.match(/^\d{2}\/\d{2}\/\d{4}$/)) return dateInput;
      if (dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [y, m, d] = dateInput.split("-");
        return `${d}/${m}/${y}`;
      }
    }
    return dateInput;
  }

  function getEndDateFromAccount(data) {
    if (data.panel_admin && data.panel_admin.timestamp_fin) {
      let date;
      if (typeof data.panel_admin.timestamp_fin.toDate === "function") {
        date = data.panel_admin.timestamp_fin.toDate();
      } else {
        date = new Date(data.panel_admin.timestamp_fin);
      }
      if (!isNaN(date.getTime())) return date;
    }
    if (data.panel_admin && data.panel_admin.fecha_fin) {
      const parts = data.panel_admin.fecha_fin.split("/");
      if (parts.length === 3) {
        return new Date(
          parseInt(parts[2], 10),
          parseInt(parts[1], 10) - 1,
          parseInt(parts[0], 10),
        );
      }
    }
    return null;
  }

  function getRenewalDaysFromAccount(data) {
    const endDate = getEndDateFromAccount(data);
    if (!endDate) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }

  function updateAccountCard() {
    if (!accountData) return;
    const data = accountData;

    const planType = data.bot_plan_pro === true ? "Premium" : "Gratuito";
    setText("plan-type-full", planType);
    setText("badge-plan", planType);
    setText("estado-cuenta", "Activo");

    const balance = data.puntos_tienda || 0;
    const balanceFormatted = balance.toLocaleString("es-PE");
    setText("ph-summary", `${planType} · Saldo ${balanceFormatted} pts`);
    setText("balance-full", balanceFormatted);
    setText("saldo-actual-cuenta", balanceFormatted);

    window._saldoTienda = balance;
    broadcastSaldo(balance);

    setText("user-id", data.id_tienda || tiendaId);

    const startRaw = data.fechas?.fecha_ingreso || data.fecha_ingreso;
    setText("start-date", formatDate(startRaw));
    setText("end-date", formatDate(getEndDateFromAccount(data)));

    const renewalDays = getRenewalDaysFromAccount(data);
    setText("renewal-days", renewalDays);
    setText("renewal-text", `${renewalDays} días para la renovación`);

    const renewalDaysSpan = document.getElementById("renewal-days");
    const renewalTextSpan = document.getElementById("renewal-text");
    if (renewalDaysSpan) {
      renewalDaysSpan.classList.toggle("warning", renewalDays <= 10);
      renewalDaysSpan.classList.toggle("normal", renewalDays > 10);
    }
    if (renewalTextSpan) {
      renewalTextSpan.classList.toggle("warning", renewalDays <= 10);
      renewalTextSpan.classList.toggle("normal", renewalDays > 10);
    }

    const actionRenovar = document.getElementById("action-renovar");
    if (renewalDays === 0) {
      bloquearExpandibles();
      if (actionRenovar) actionRenovar.style.display = "block";
    } else {
      desbloquearExpandibles();
      if (actionRenovar) actionRenovar.style.display = "none";
    }

      }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el)
      el.textContent = value !== undefined && value !== null ? value : "—";
  }

  // ============================================================
  //  BLOQUEO DE EXPANDIBLES (plan vencido)
  // ============================================================
  function bloquearExpandibles() {
    const targets = [
      ...document.querySelectorAll(".expand-section"),
      document.querySelector(".profile-top-row"),
    ].filter(Boolean);

    targets.forEach((el) => {
      if (el.dataset.bloqueado === "1") return;
      el.dataset.bloqueado = "1";
      el.style.opacity = "0.45";
      el.style.userSelect = "none";
      const posActual = getComputedStyle(el).position;
      if (posActual === "static") el.style.position = "relative";

      if (el.querySelector(".bloqueo-section-overlay")) return;
      const ov = document.createElement("div");
      ov.className = "bloqueo-section-overlay";
      ov.style.cssText =
        "position:absolute;inset:0;z-index:10;cursor:not-allowed;border-radius:inherit;";
      ov.addEventListener("click", (e) => {
        e.stopPropagation();
        mostrarToastBloqueo();
      });
      el.appendChild(ov);
    });
  }

  function desbloquearExpandibles() {
    const targets = [
      ...document.querySelectorAll(".expand-section"),
      document.querySelector(".profile-top-row"),
    ].filter(Boolean);

    targets.forEach((el) => {
      el.style.opacity = "";
      el.style.pointerEvents = "";
      el.style.userSelect = "";
      el.style.position = "";
      delete el.dataset.bloqueado;
      el.querySelectorAll(".bloqueo-section-overlay").forEach((ov) =>
        ov.remove(),
      );
    });
  }

  function mostrarToastBloqueo() {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = "⚠️ Renueva tu plan para editar los campos";
    t.classList.add("show");
    clearTimeout(window._toastBloqueoTimer);
    window._toastBloqueoTimer = setTimeout(
      () => t.classList.remove("show"),
      3000,
    );
  }

  // ============================================================
  //  ARRANCAR
  // ============================================================
  initPublicidad();
  initPreciosApp();
  initRealtimeAccount();
})();

// ============================================================
//  MODAL RENOVACIÓN
// ============================================================
const _DIAS_POR_PLAN = {
  "20_dias": 20,
  "1_mes": 30,
  "2_meses": 60,
  "3_meses": 90,
  "4_meses": 120,
};

const _renovacion = {
  _planesData: {},
  _planesBotPromoData: {},
  _publicidadData: {},
  _planSeleccionado: null,

  _NOMBRES_PLANES: {
    "20_dias": "20 días",
    "1_mes": "1 mes",
    "2_meses": "2 meses",
    "3_meses": "3 meses",
    "4_meses": "4 meses",
  },
  _ORDEN_PLANES: ["20_dias", "1_mes", "2_meses", "3_meses", "4_meses"],
  _DESCUENTOS: { "1_mes": 5, "2_meses": 10, "3_meses": 20, "4_meses": 30 },

  abrirModal: function () {
    const self = this;
    const modal = document.getElementById("modal-renovacion");
    if (!modal) return;
    modal.classList.add("open");

    self._planSeleccionado = null;
    const resumenPago = document.getElementById("resumen-pago");
    const btnContinuar = document.getElementById("btn-continuar");
    if (resumenPago) resumenPago.style.display = "none";
    if (btnContinuar) btnContinuar.disabled = true;

    const planes = window._planesActivacion || self._planesData;
    if (!planes || Object.keys(planes).length === 0) {
      const selectorPlanes = document.getElementById("selector-planes");
      if (selectorPlanes)
        selectorPlanes.innerHTML =
          '<p style="text-align:center;color:#888">Cargando planes...</p>';
      setTimeout(() => self.abrirModal(), 800);
      return;
    }
    self._renderPlanes(planes);
  },

  _renderPlanes: function (planes) {
    const self = this;
    const container = document.getElementById("selector-planes");
    if (!container) return;
    container.innerHTML = "";

    self._ORDEN_PLANES
      .filter((k) => planes[k] !== undefined)
      .forEach((key) => {
        const precio = planes[key];
        const desc = self._DESCUENTOS[key] || 0;
        const div = document.createElement("div");
        div.className = "plan-item";
        div.dataset.key = key;
        div.innerHTML = `
          <strong>${self._NOMBRES_PLANES[key] || key.replace(/_/g, " ")}</strong>
          <span class="precio-container">
            ${precio}
            <img src="../img/icon_monedas_3d.webp" class="coin-icon" alt="moneda">
          </span>
          ${desc ? `<span class="desc-badge">-${desc}%</span>` : ""}
        `;
        div.onclick = () => self._seleccionarPlan(key, precio);
        container.appendChild(div);
      });
  },

  _seleccionarPlan: function (key, precio) {
    const self = this;
    self._planSeleccionado = { key, precio };

    document
      .querySelectorAll("#selector-planes .plan-item")
      .forEach((el) => el.classList.toggle("selected", el.dataset.key === key));

    const saldo = window._saldoTienda || 0;
    const desc = self._DESCUENTOS[key] || 0;
    const precioFinal =
      desc > 0 ? Math.round(precio * (1 - desc / 100)) : precio;
    const restante = saldo - precioFinal;
    const falta = precioFinal - saldo;
    const sinSaldo = saldo < precioFinal;

    const elSaldoActual = document.getElementById("saldo-actual");
    const elSaldoRestante = document.getElementById("saldo-restante");
    const elTotal = document.getElementById("total-a-pagar");
    const elResumen = document.getElementById("resumen-pago");
    const elBtnContinuar = document.getElementById("btn-continuar");
    const detalle = document.getElementById("detalle-descuento");
    const avisoSaldo = document.getElementById("aviso-saldo-insuficiente");

    if (elSaldoActual)
      elSaldoActual.textContent = ` ${saldo.toLocaleString("es-PE")}`;
    if (elSaldoRestante)
      elSaldoRestante.textContent = sinSaldo
        ? " —"
        : ` ${restante.toLocaleString("es-PE")}`;
    if (elTotal)
      elTotal.textContent = ` ${precioFinal.toLocaleString("es-PE")}`;

    if (detalle) {
      detalle.innerHTML = desc
        ? `<p>Descuento aplicado:
            <strong>${desc}% = -
              <span style="display:inline-flex;align-items:center;gap:4px;">
                ${(precio - precioFinal).toLocaleString("es-PE")}
                <img src="../img/icon_monedas_3d.webp" class="coin-icon" style="width:16px;height:16px;vertical-align:middle;">
              </span>
            </strong>
           </p>`
        : "";
    }

    if (avisoSaldo) {
      if (sinSaldo) {
        avisoSaldo.innerHTML = `
          <span style="color:#e05c00;font-weight:600;display:flex;align-items:center;gap:6px;font-size:13px;">
            ❌ Te faltan
            <span style="display:inline-flex;align-items:center;gap:4px;background:#fff3e0;padding:2px 8px;border-radius:8px;color:#e05c00;font-weight:700;">
              ${falta.toLocaleString("es-PE")}
              <img src="../img/icon_monedas_3d.webp" style="width:16px;height:16px;vertical-align:middle;">
            </span>
            para este plan
          </span>`;
        avisoSaldo.style.display = "block";
      } else {
        avisoSaldo.style.display = "none";
        avisoSaldo.innerHTML = "";
      }
    }

    if (elResumen) elResumen.style.display = "block";
    if (elBtnContinuar) elBtnContinuar.disabled = sinSaldo;
  },
};

window.abrirModalRenovacion = () => _renovacion.abrirModal();
window.cerrarModal = () => {
  document.getElementById("modal-renovacion")?.classList.remove("open");
  _renovacion._planSeleccionado = null;
  const resumenPago = document.getElementById("resumen-pago");
  const btnContinuar = document.getElementById("btn-continuar");
  const avisoSaldo = document.getElementById("aviso-saldo-insuficiente");
  if (resumenPago) resumenPago.style.display = "none";
  if (btnContinuar) btnContinuar.disabled = true;
  if (avisoSaldo) {
    avisoSaldo.style.display = "none";
    avisoSaldo.innerHTML = "";
  }
  document
    .querySelectorAll("#selector-planes .plan-item")
    .forEach((el) => el.classList.remove("selected"));
};

// ============================================================
//  PROCESAR PAGO — llama a la Cloud Function
// ============================================================
window.procesarPago = async () => {
  const plan = _renovacion._planSeleccionado;
  if (!plan) return;

  const saldo = window._saldoTienda || 0;
  const desc = _renovacion._DESCUENTOS[plan.key] || 0;
  const precioFinal =
    desc > 0 ? Math.round(plan.precio * (1 - desc / 100)) : plan.precio;

  if (saldo < precioFinal) {
    alert("❌ Saldo insuficiente para renovar este plan.");
    return;
  }

  // 🔥 Usar variables globales del top del archivo
  const id_tienda = tiendaId;
  const localidad_pago = localidad;

  if (!id_tienda || !localidad_pago) {
    alert("❌ No se pudo identificar la tienda. Recarga la página.");
    return;
  }

  const dias_extra = _DIAS_POR_PLAN[plan.key];
  if (!dias_extra) {
    alert("❌ Plan no reconocido.");
    return;
  }

  const btnContinuar = document.getElementById("btn-continuar");
  if (btnContinuar) {
    btnContinuar.disabled = true;
    btnContinuar.textContent = "Procesando...";
  }

  
  try {
    const response = await fetch(
      "https://us-central1-geinzworkapp.cloudfunctions.net/pagar_plan__usuario",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            pais:"",
            provincia:"",
            precio_por_moneda: window._publicidad?.costo_por_moneda,
            id_tienda,
            localidad: localidad_pago, // 🔥 fix: ya no pisa la variable global
            dias_extra,
            monedas_costo: precioFinal,
          },
        }),
      },
    );

    const result = await response.json();

    if (!response.ok || result?.error) {
      throw new Error(result?.error?.message || `Error ${response.status}`);
    }

    
    document.getElementById("modal-renovacion")?.classList.remove("open");
    mostrarSnackbar("Plan renovado correctamente 🎉", "success");

    const toast = document.getElementById("toast");
    if (toast) {
      toast.textContent = "✅ Plan renovado correctamente";
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 3000);
    }
  } catch (err) {
    console.error("❌ Error procesarPago:", err);
    alert(
      "❌ Error al procesar el pago: " + (err.message || "intenta de nuevo"),
    );
  } finally {
    if (btnContinuar) {
      btnContinuar.disabled = false;
      btnContinuar.textContent = "Continuar";
    }
  }
};

function mostrarSnackbar(msg, tipo = "success") {
  const toast = document.getElementById("toast-renovacion");
  const icon = document.getElementById("toast-renovacion-icon");
  const text = document.getElementById("toast-renovacion-msg");
  if (!toast) return;

  icon.textContent =
    tipo === "success" ? "✅" : tipo === "warning" ? "⚠️" : "❌";
  text.textContent = msg;
  toast.style.background =
    tipo === "success" ? "#0f9b6e" : tipo === "warning" ? "#e07b00" : "#d63031";

  toast.classList.add("show");
  clearTimeout(window._snackTimer);
  window._snackTimer = setTimeout(() => toast.classList.remove("show"), 3500);
}
