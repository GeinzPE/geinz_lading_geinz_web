// ═══════════════════════════════════════════════════════════
//  cuenta_tarjeta.js - Tarjeta de cuenta (TIEMPO REAL)
// ═══════════════════════════════════════════════════════════

(function () {
  "use strict";

  console.log("🔥 [INICIO] cuenta_tarjeta.js cargado");

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
      // ✅ reenviar DATOS_TIENDA con saldo incluido
      if (window._datosParaIframe) {
        if (window._datosParaIframe.payload) {
          window._datosParaIframe.payload.saldo_tienda = _cache.saldo;
        }
        iframe.contentWindow.postMessage(window._datosParaIframe, "*");
      }

      // saldo por separado también (por si acaso)
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
    window._saldoActual = saldo; // ✅ guardar para enviarDatosTiendaFrames

    // ✅ actualizar _datosParaIframe si ya existe
    if (window._datosParaIframe?.payload) {
      window._datosParaIframe.payload.saldo_tienda = saldo;
    }

    console.log("📤 [broadcast] SALDO_UPDATE →", saldo);
    document.querySelectorAll("iframe").forEach((iframe) => {
      try {
        iframe.contentWindow.postMessage({ type: "SALDO_UPDATE", saldo }, "*");
      } catch (e) {}
    });
  }

  function broadcastPublicidad(publicidad) {
    _cache.publicidad = publicidad;
    console.log("📤 [broadcast] PUBLICIDAD_UPDATE →", publicidad);
    document.querySelectorAll("iframe").forEach((iframe) => {
      try {
        iframe.contentWindow.postMessage(
          { type: "PUBLICIDAD_UPDATE", publicidad },
          "*",
        );
      } catch (e) {}
    });
  }

  function broadcastPlanes(planesActivacion, planesBotPromo, publicidad) {
    _cache.planes_activacion = planesActivacion;
    _cache.planes_bot_promo = planesBotPromo;
    _cache.publicidad = publicidad;
    console.log("📤 [broadcast] PLANES_UPDATE →", {
      planesActivacion,
      planesBotPromo,
      publicidad,
    });
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
  }

  document.querySelectorAll("iframe").forEach((iframe) => {
    iframe.addEventListener("load", () => {
      sendCacheToIframe(iframe);
      console.log("📤 [load] Cache re-enviado a iframe tardío");
    });
  });

  const _iframeObserver = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node.tagName === "IFRAME") {
          node.addEventListener("load", () => {
            sendCacheToIframe(node);
            console.log("📤 [dynamic iframe] Cache enviado a nuevo iframe");
          });
        }
      });
    });
  });
  _iframeObserver.observe(document.body, { childList: true, subtree: true });

  // ============================================================
  //  1. FIREBASE PLANES — una sola instancia compartida
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
  //  2. PUBLICIDAD — carga inmediata al entrar (antes que planes)
  // ============================================================
  async function initPublicidad() {
    console.log("🚀 [publicidad] Cargando inmediatamente...");
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
      console.log("✅ [publicidad] Cargada:", publicidad);

      window._publicidad = publicidad;
      _renovacion._publicidadData = publicidad;
      broadcastPublicidad(publicidad); // ← llega inmediato a los iframes
    } catch (err) {
      console.error("❌ [publicidad] Error:", err);
    }
  }

  // ============================================================
  //  3. PLANES — carga separada después de publicidad
  // ============================================================
  async function initPreciosApp() {
    console.log("💰 [precios] Cargando planes...");
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

      console.log("✅ [precios] planes_activacion:", planesActivacion);
      console.log("✅ [precios] planes_bot_promo:", planesBotPromo);

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
    console.log("🔍 [cuenta] Iniciando escucha en tiempo real...");
    try {
      const { getFirestore, doc, onSnapshot } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      const { initializeApp, getApps, getApp } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");

      const app = getApps().length
        ? getApp()
        : initializeApp({
            apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
            authDomain: "geinzworkapp.firebaseapp.com",
            projectId: "geinzworkapp",
            storageBucket: "geinzworkapp.appspot.com",
            messagingSenderId: "921389328767",
            appId: "1:921389328767:web:dc6fffc43a51444f5b524a",
          });
      const db = getFirestore(app);

      const docRefOriginal = doc(
        db,
        "Tiendas",
        "barranca",
        "barranca",
        "fW7W8RsgkkQ3IYfxKHGR",
      );
      const docRefServicios = doc(
        db,
        "Tiendas",
        "barranca",
        "tiendas_servicios_geinz_activos",
        "fW7W8RsgkkQ3IYfxKHGR",
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
    console.log("✅ Datos combinados:", accountData);
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

    setText("user-id", data.id_tienda || "fW7W8RsgkkQ3IYfxKHGR");

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

    console.log("✅ Tarjeta de cuenta actualizada");
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el)
      el.textContent = value !== undefined && value !== null ? value : "—";
  }

  // ============================================================
  //  ARRANCAR — publicidad primero, luego planes y cuenta
  // ============================================================
  initPublicidad(); // ← inmediato, no espera planes
  initPreciosApp(); // ← planes completos
  initRealtimeAccount(); // ← saldo en tiempo real
})();

// ============================================================
//  MODAL RENOVACIÓN
// ============================================================
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
  _DESCUENTOS: { "2_meses": 7, "3_meses": 10, "4_meses": 15 },

  abrirModal: function () {
    const self = this;
    const modal = document.getElementById("modal-renovacion");
    if (!modal) return;
    modal.classList.add("open");

    const resumenPago = document.getElementById("resumen-pago");
    const btnContinuar = document.getElementById("btn-continuar");
    if (resumenPago) resumenPago.style.display = "none";
    if (btnContinuar) btnContinuar.disabled = true;
    self._planSeleccionado = null;

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

    document.getElementById("saldo-actual").textContent =
      ` ${saldo.toLocaleString("es-PE")}`;
    document.getElementById("saldo-restante").textContent =
      ` ${restante.toLocaleString("es-PE")}`;
    document.getElementById("total-a-pagar").textContent =
      ` ${precioFinal.toLocaleString("es-PE")}`;

    const detalle = document.getElementById("detalle-descuento");
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

    document.getElementById("resumen-pago").style.display = "block";
    document.getElementById("btn-continuar").disabled = false;
  },
};

window.abrirModalRenovacion = () => _renovacion.abrirModal();
window.cerrarModal = () =>
  document.getElementById("modal-renovacion")?.classList.remove("open");
window.procesarPago = () => {
  const plan = _renovacion._planSeleccionado;
  if (!plan) return;
  console.log("Procesando plan:", plan.key, "precio:", plan.precio);
};
