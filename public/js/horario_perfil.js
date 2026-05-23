// ═══════════════════════════════════════════════════════════
//  cuenta_tarjeta.js - Tarjeta de cuenta (TIEMPO REAL)
//  Escucha cambios en Firestore y muestra datos de la tienda
// ═══════════════════════════════════════════════════════════

(function () {
  "use strict";

  console.log("🔥 [INICIO] cuenta_tarjeta.js cargado");

  // ============================================================
  //  1. DATOS DE CUENTA (conexión EN TIEMPO REAL a Firestore)
  // ============================================================
  let accountData = null;
  let unsubscribeOriginal = null;
  let unsubscribeServicios = null;

  async function initRealtimeAccount() {
    console.log("🔍 [1] Iniciando escucha en tiempo real...");
    try {
      const { getFirestore, doc, onSnapshot } = await import(
        "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
      );
      const { initializeApp } = await import(
        "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"
      );

      const firebaseConfig = {
        apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
        authDomain: "geinzworkapp.firebaseapp.com",
        projectId: "geinzworkapp",
        storageBucket: "geinzworkapp.appspot.com",
        messagingSenderId: "921389328767",
        appId: "1:921389328767:web:dc6fffc43a51444f5b524a",
      };

      const app = initializeApp(firebaseConfig);
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

      // Escuchar cambios en el documento original
      unsubscribeOriginal = onSnapshot(
        docRefOriginal,
        (snap) => {
          if (snap.exists()) {
            originalData = snap.data();
            console.log("🔄 Documento original actualizado");
          } else {
            console.warn("⚠️ Documento original no existe");
            originalData = {};
          }
          combineAndUpdate(originalData, serviciosData);
        },
        (err) => console.error("❌ Error en snapshot original:", err),
      );

      // Escuchar cambios en el documento de servicios
      unsubscribeServicios = onSnapshot(
        docRefServicios,
        (snap) => {
          if (snap.exists()) {
            serviciosData = snap.data();
            console.log("🔄 Documento servicios actualizado");
          } else {
            console.warn("⚠️ Documento servicios no existe");
            serviciosData = {};
          }
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
    // Solo agregar panel_admin y notificaciones desde servicios
    if (servicios.panel_admin) combined.panel_admin = servicios.panel_admin;
    if (servicios.notificaciones) combined.notificaciones = servicios.notificaciones;

    accountData = combined;
    console.log("✅ Datos combinados en tiempo real:", accountData);
    if (accountData.panel_admin) {
      console.log("🎉 panel_admin encontrado:", accountData.panel_admin);
      console.log("📅 fecha_fin:", accountData.panel_admin.fecha_fin);
    }
    updateAccountCard(); // actualiza la UI
  }

  // ============================================================
  //  2. FUNCIONES DE TARJETA DE CUENTA
  // ============================================================

  // Toggle para expandir/contraer la tarjeta (si se usa .exp-card)
  document.addEventListener("click", function (e) {
    const header = e.target.closest(".exp-header");
    if (!header) return;
    const card = header.closest(".exp-card");
    if (!card) return;
    card.classList.toggle("open");
  });

  // Copiar ID al portapapeles
  window.copyId = function (e) {
    e.stopPropagation();
    const idSpan = document.getElementById("user-id");
    if (!idSpan) return;
    const id = idSpan.textContent;
    navigator.clipboard
      .writeText(id)
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
    // PRIORIDAD: usar timestamp_fin (es más preciso)
    if (data.panel_admin && data.panel_admin.timestamp_fin) {
      let date;
      if (typeof data.panel_admin.timestamp_fin.toDate === "function") {
        date = data.panel_admin.timestamp_fin.toDate();
      } else {
        date = new Date(data.panel_admin.timestamp_fin);
      }
      if (!isNaN(date.getTime())) {
        console.log(`📆 [timestamp] Fecha final calculada: ${date}`);
        return date;
      }
    }
    // FALLBACK: usar fecha_fin string
    if (data.panel_admin && data.panel_admin.fecha_fin) {
      const parts = data.panel_admin.fecha_fin.split("/");
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        const date = new Date(year, month, day);
        console.log(`📆 [string] Fecha final calculada: ${date}`);
        return date;
      }
    }
    console.warn("⚠️ No se pudo obtener fecha de fin");
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
    if (!accountData) {
      console.warn("⏳ No hay datos de cuenta aún");
      return;
    }
    const data = accountData;

    // Plan
    const planType = data.bot_plan_pro === true ? "Premium" : "Gratuito";
    setText("plan-type-full", planType);
    setText("badge-plan", planType);

    // Estado (siempre Activo, pero podría derivarse de fecha_fin)
    setText("estado-cuenta", "Activo"); // Ajusta según necesidad

    // Saldo (puntos)
    const balance = data.puntos_tienda || 0;
    const balanceFormatted = balance.toLocaleString("es-PE");
    setText("ph-summary", `${planType} · Saldo ${balanceFormatted} pts`);
    setText("balance-full", balanceFormatted);
    setText("saldo-restante", balanceFormatted); // Puedes duplicar si hay dos campos

    // ID
    const userId = data.id_tienda || "fW7W8RsgkkQ3IYfxKHGR";
    setText("user-id", userId);

    // Fechas
    const startRaw = data.fechas?.fecha_ingreso || data.fecha_ingreso;
    setText("start-date", formatDate(startRaw));
    const endDateObj = getEndDateFromAccount(data);
    setText("end-date", formatDate(endDateObj));

    // Días restantes (renovación)
    const renewalDays = getRenewalDaysFromAccount(data);
    setText("renewal-days", renewalDays);
    setText("renewal-text", `${renewalDays} días para la renovación`);

    // Colores de advertencia si quedan ≤10 días
    const renewalDaysSpan = document.getElementById("renewal-days");
    const renewalTextSpan = document.getElementById("renewal-text");
    if (renewalDaysSpan) {
      if (renewalDays <= 10) {
        renewalDaysSpan.classList.add("warning");
        renewalDaysSpan.classList.remove("normal");
      } else {
        renewalDaysSpan.classList.add("normal");
        renewalDaysSpan.classList.remove("warning");
      }
    }
    if (renewalTextSpan) {
      if (renewalDays <= 10) {
        renewalTextSpan.classList.add("warning");
        renewalTextSpan.classList.remove("normal");
      } else {
        renewalTextSpan.classList.add("normal");
        renewalTextSpan.classList.remove("warning");
      }
    }
    console.log("✅ Tarjeta de cuenta actualizada en tiempo real");
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value !== undefined && value !== null ? value : "—";
  }

  // ============================================================
  //  3. INICIAR LA ESCUCHA EN TIEMPO REAL
  // ============================================================
  initRealtimeAccount();
})();