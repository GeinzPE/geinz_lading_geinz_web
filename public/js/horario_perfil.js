// ═══════════════════════════════════════════════════════════
//  horario_perfil.js - Horario + Tarjeta de cuenta (TIEMPO REAL)
//  Escucha cambios en ambos documentos de Firestore
// ═══════════════════════════════════════════════════════════

(function () {
  "use strict";

  console.log("🔥 [INICIO] horario_perfil.js cargado");

  // ============================================================
  //  1. DATOS DE CUENTA (conexión EN TIEMPO REAL a Firestore)
  // ============================================================
  let accountData = null;
  let unsubscribeOriginal = null;
  let unsubscribeServicios = null;

  async function initRealtimeAccount() {
    console.log("🔍 [1] Iniciando escucha en tiempo real...");
    try {
      const { getFirestore, doc, onSnapshot } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      const { initializeApp } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");

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
    if (servicios.notificaciones)
      combined.notificaciones = servicios.notificaciones;

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
  window.toggle = function (id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("open");
  };

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
        date = data.panel_admin.timestamp_fin.toDate(); // Firestore Timestamp
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

    // Saldo (puntos)
    const balance = data.puntos_tienda || 0;
    const balanceFormatted = balance.toLocaleString("es-PE");
    setText("ph-summary", `${planType} · Saldo ${balanceFormatted} pts`);
    setText("balance-full", balanceFormatted);

    // ID
    const userId = data.id_tienda || "fW7W8RsgkkQ3IYfxKHGR";
    setText("user-id", userId);

    // Fechas
    const startRaw = data.fechas?.fecha_ingreso || data.fecha_ingreso;
    setText("start-date", formatDate(startRaw));

    const endDateObj = getEndDateFromAccount(data);
    setText("end-date", formatDate(endDateObj));

    // Días restantes
    const renewalDays = getRenewalDaysFromAccount(data);
    setText("renewal-days", renewalDays);
    setText("renewal-text", `${renewalDays} días para la renovación`);

    // Colores
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
    if (el)
      el.textContent = value !== undefined && value !== null ? value : "—";
  }

  // ============================================================
  //  3. MÓDULO DE HORARIO (código completo - sin cambios)
  // ============================================================
  const DAYS_KEYS = [
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
    "domingo",
  ];
  const DAYS_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  function to12h(time24) {
    if (!time24 || !time24.match(/^\d{2}:\d{2}$/)) return null;
    const parts = time24.split(":");
    let h = parseInt(parts[0], 10);
    const m = parts[1];
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 || 12;
    return `${hour12}:${m} ${period}`;
  }

  function to12hDisplay(time24) {
    if (!time24) return "—";
    const result = to12h(time24);
    return result || "—";
  }

  function renderSchedule(horario) {
    const container = document.getElementById("scheduleBody");
    if (!container) {
      console.error("No se encontró el contenedor scheduleBody");
      return;
    }
    console.log("📅 Renderizando horario:", horario);
    let html = '<div class="schedule-grid">';
    DAYS_KEYS.forEach((key, i) => {
      const dayData = horario?.[key] || {};
      const bloques = dayData.bloques || [];
      const bloque1 = bloques[0] || {};
      const bloque2 = bloques[1] || {};
      const cerrado = bloque1.cerrado === true;
      const tieneDescanso = bloques.length > 1 && !cerrado;
      const apertura1 = bloque1.h_apertura || "09:00";
      const cierre1 = bloque1.h_cierre || "18:00";
      const apertura2 = bloque2.h_apertura || "13:00";
      const cierre2 = bloque2.h_cierre || "15:00";
      const apertura1_12 = to12hDisplay(apertura1);
      const cierre1_12 = to12hDisplay(cierre1);
      const apertura2_12 = to12hDisplay(apertura2);
      const cierre2_12 = to12hDisplay(cierre2);
      const modoCorridoChecked = !tieneDescanso ? "checked" : "";
      const modoDescansoChecked = tieneDescanso ? "checked" : "";
      html += `
        <div class="schedule-day" data-day="${i}">
          <label class="day-toggle-switch">
            <input type="checkbox" id="toggleDay_${i}" ${!cerrado ? "checked" : ""} onchange="HorarioModule.toggleDay(${i})">
            <span class="toggle-slider"></span>
          </label>
          <span class="day-name ${cerrado ? "closed" : ""}" id="dn_${i}">${DAYS_LABELS[i]}</span>
          <span class="day-status" id="status_${i}">${cerrado ? "Cerrado" : "Abierto"}</span>
          <button class="conv-12h-link" onclick="HorarioModule.toggleConvPanel(${i})">Mostrar conversión a 12 h</button>
          <div class="mode-row" id="modeRow_${i}" ${cerrado ? 'style="display:none"' : ""}>
            <label class="mode-opt ${!tieneDescanso ? "active-mode" : ""}">
              <input type="radio" name="modo_${i}" value="corrido" ${modoCorridoChecked} onchange="HorarioModule.setModoHorario(${i}, false)">
              <span>Trabajo de corrido</span>
            </label>
            <label class="mode-opt ${tieneDescanso ? "active-mode" : ""}">
              <input type="radio" name="modo_${i}" value="descanso" ${modoDescansoChecked} onchange="HorarioModule.setModoHorario(${i}, true)">
              <span>Trabajo con descanso</span>
            </label>
          </div>
          <div class="bloque" id="bloque1_${i}" ${cerrado ? 'style="display:none"' : ""}>
            <div class="bloque-label">Apertura 1</div>
            <div class="time-row">
              <div class="time-field">
                <input class="time-input-geinz" type="time" value="${apertura1}" data-day="${i}" data-bloque="1" data-tipo="apertura" onchange="HorarioModule.onTimeChange(${i}, 1)">
              </div>
              <div class="time-sep-geinz">a</div>
              <div class="time-field">
                <input class="time-input-geinz" type="time" value="${cierre1}" data-day="${i}" data-bloque="1" data-tipo="cierre" onchange="HorarioModule.onTimeChange(${i}, 1)">
              </div>
            </div>
          </div>
          <div class="bloque" id="bloque2_${i}" ${cerrado || !tieneDescanso ? 'style="display:none"' : ""}>
            <div class="bloque-label">Apertura 2</div>
            <div class="time-row">
              <div class="time-field">
                <input class="time-input-geinz" type="time" value="${apertura2}" data-day="${i}" data-bloque="2" data-tipo="apertura" onchange="HorarioModule.onTimeChange(${i}, 2)">
              </div>
              <div class="time-sep-geinz">a</div>
              <div class="time-field">
                <input class="time-input-geinz" type="time" value="${cierre2}" data-day="${i}" data-bloque="2" data-tipo="cierre" onchange="HorarioModule.onTimeChange(${i}, 2)">
              </div>
            </div>
          </div>
          <div class="conv-panel-geinz" id="convPanel_${i}" style="display:none;">
            <div class="conv-title">Conversión automática a 12 h</div>
            <p>Geinz convierte tu horario en tiempo real al formato de 12 horas para facilitar la lectura.</p>
            <div class="conv-rows">
              <div class="conv-row">
                <div class="conv-col">
                  <div class="conv-label-small">Apertura</div>
                  <div class="conv-box" id="convOpen1_${i}">${apertura1_12}</div>
                </div>
                <div class="time-sep-geinz">a</div>
                <div class="conv-col">
                  <div class="conv-label-small">Cierre</div>
                  <div class="conv-box" id="convClose1_${i}">${cierre1_12}</div>
                </div>
              </div>
              <div class="conv-row" id="convRow2_${i}" ${!tieneDescanso ? 'style="display:none"' : ""}>
                <div class="conv-col">
                  <div class="conv-label-small">Apertura</div>
                  <div class="conv-box" id="convOpen2_${i}">${apertura2_12}</div>
                </div>
                <div class="time-sep-geinz">a</div>
                <div class="conv-col">
                  <div class="conv-label-small">Cierre</div>
                  <div class="conv-box" id="convClose2_${i}">${cierre2_12}</div>
                </div>
              </div>
            </div>
          </div>
          <div class="save-row">
            <button class="btn-save" onclick="HorarioModule.saveDay(${i})">Guardar</button>
          </div>
        </div>
      `;
    });
    html += "</div>";
    container.innerHTML = html;
    console.log("✅ Horario renderizado correctamente");
  }

  function updateConversionPanel(dayIndex) {
    const open1 = document.querySelector(
      `#bloque1_${dayIndex} .time-input-geinz[data-tipo="apertura"]`,
    )?.value;
    const close1 = document.querySelector(
      `#bloque1_${dayIndex} .time-input-geinz[data-tipo="cierre"]`,
    )?.value;
    const convOpen1 = document.getElementById(`convOpen1_${dayIndex}`);
    const convClose1 = document.getElementById(`convClose1_${dayIndex}`);
    if (convOpen1) convOpen1.innerText = to12hDisplay(open1);
    if (convClose1) convClose1.innerText = to12hDisplay(close1);
    const open2 = document.querySelector(
      `#bloque2_${dayIndex} .time-input-geinz[data-tipo="apertura"]`,
    )?.value;
    const close2 = document.querySelector(
      `#bloque2_${dayIndex} .time-input-geinz[data-tipo="cierre"]`,
    )?.value;
    const convOpen2 = document.getElementById(`convOpen2_${dayIndex}`);
    const convClose2 = document.getElementById(`convClose2_${dayIndex}`);
    if (convOpen2) convOpen2.innerText = to12hDisplay(open2);
    if (convClose2) convClose2.innerText = to12hDisplay(close2);
  }

  function collectScheduleData() {
    const horarioActualizado = {};
    for (let i = 0; i < DAYS_KEYS.length; i++) {
      const toggle = document.getElementById(`toggleDay_${i}`);
      const isOpen = toggle ? toggle.checked : true;
      if (!isOpen) {
        horarioActualizado[DAYS_KEYS[i]] = {
          bloques: [{ cerrado: true, h_apertura: "09:00", h_cierre: "18:00" }],
        };
        continue;
      }
      const modoCorrido = document.querySelector(
        `input[name="modo_${i}"][value="corrido"]`,
      )?.checked;
      const tieneDescanso = modoCorrido === false;
      const apertura1 =
        document.querySelector(
          `#bloque1_${i} .time-input-geinz[data-tipo="apertura"]`,
        )?.value || "09:00";
      const cierre1 =
        document.querySelector(
          `#bloque1_${i} .time-input-geinz[data-tipo="cierre"]`,
        )?.value || "18:00";
      const bloques = [
        { cerrado: false, h_apertura: apertura1, h_cierre: cierre1 },
      ];
      if (tieneDescanso) {
        const apertura2 =
          document.querySelector(
            `#bloque2_${i} .time-input-geinz[data-tipo="apertura"]`,
          )?.value || "13:00";
        const cierre2 =
          document.querySelector(
            `#bloque2_${i} .time-input-geinz[data-tipo="cierre"]`,
          )?.value || "15:00";
        bloques.push({
          cerrado: false,
          h_apertura: apertura2,
          h_cierre: cierre2,
        });
      }
      horarioActualizado[DAYS_KEYS[i]] = { bloques };
    }
    return horarioActualizado;
  }

  window.HorarioModule = {
    render: renderSchedule,
    toggleDay: function (dayIndex) {
      const checkbox = document.getElementById(`toggleDay_${dayIndex}`);
      if (!checkbox) return;
      const isOpen = checkbox.checked;
      const dayName = document.getElementById(`dn_${dayIndex}`);
      const statusSpan = document.getElementById(`status_${dayIndex}`);
      const modeRow = document.getElementById(`modeRow_${dayIndex}`);
      const bloque1 = document.getElementById(`bloque1_${dayIndex}`);
      const bloque2 = document.getElementById(`bloque2_${dayIndex}`);
      const convRow2 = document.getElementById(`convRow2_${dayIndex}`);
      if (dayName) dayName.classList.toggle("closed", !isOpen);
      if (statusSpan) statusSpan.textContent = isOpen ? "Abierto" : "Cerrado";
      if (modeRow) modeRow.style.display = isOpen ? "flex" : "none";
      if (bloque1) bloque1.style.display = isOpen ? "block" : "none";
      if (!isOpen) {
        if (bloque2) bloque2.style.display = "none";
        if (convRow2) convRow2.style.display = "none";
      } else {
        const modoDescanso = document.querySelector(
          `input[name="modo_${dayIndex}"][value="descanso"]`,
        )?.checked;
        if (modoDescanso && bloque2) bloque2.style.display = "block";
        if (modoDescanso && convRow2) convRow2.style.display = "grid";
      }
      if (window.PanelPerfil) {
        window.PanelPerfil.showSaveFab();
        window.PanelPerfil.queueSave();
      }
    },
    setModoHorario: function (dayIndex, tieneDescanso) {
      const bloque2 = document.getElementById(`bloque2_${dayIndex}`);
      const convRow2 = document.getElementById(`convRow2_${dayIndex}`);
      if (bloque2) bloque2.style.display = tieneDescanso ? "block" : "none";
      if (convRow2) convRow2.style.display = tieneDescanso ? "grid" : "none";
      const convPanel = document.getElementById(`convPanel_${dayIndex}`);
      if (convPanel && convPanel.style.display !== "none")
        updateConversionPanel(dayIndex);
      if (window.PanelPerfil) {
        window.PanelPerfil.showSaveFab();
        window.PanelPerfil.queueSave();
      }
    },
    onTimeChange: function (dayIndex, bloqueNum) {
      const convPanel = document.getElementById(`convPanel_${dayIndex}`);
      if (convPanel && convPanel.style.display !== "none")
        updateConversionPanel(dayIndex);
      if (window.PanelPerfil) {
        window.PanelPerfil.showSaveFab();
        window.PanelPerfil.queueSave();
      }
    },
    toggleConvPanel: function (dayIndex) {
      const panel = document.getElementById(`convPanel_${dayIndex}`);
      const link = event?.target;
      if (!panel) return;
      if (panel.style.display === "none" || !panel.style.display) {
        updateConversionPanel(dayIndex);
        panel.style.display = "block";
        if (link) link.textContent = "Ocultar conversión a 12 h";
      } else {
        panel.style.display = "none";
        if (link) link.textContent = "Mostrar conversión a 12 h";
      }
    },
    saveDay: function (dayIndex) {
      const btn = event?.target;
      if (!btn) return;
      const originalText = btn.textContent;
      btn.textContent = "✓ Guardado";
      btn.style.background = "#00e5a0";
      btn.style.color = "#000";
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = "";
        btn.style.color = "";
      }, 1500);
      if (window.PanelPerfil) {
        window.PanelPerfil.showSaveFab();
        window.PanelPerfil.queueSave();
      }
    },
    getScheduleData: collectScheduleData,
    updateConversion: updateConversionPanel,
    saveToFirestore: async function () {
      if (!window.PanelPerfil || !window.PanelPerfil.TIENDA_REF) {
        console.error("PanelPerfil no disponible");
        return false;
      }
      const horarioData = collectScheduleData();
      try {
        await window.PanelPerfil.updateDoc(window.PanelPerfil.TIENDA_REF, {
          horario_atencion: horarioData,
        });
        console.log("✅ Horario guardado en Firestore");
        return true;
      } catch (error) {
        console.error("❌ Error guardando horario:", error);
        return false;
      }
    },
  };

  // ============================================================
  //  4. INTEGRACIÓN CON PANELPERFIL (para el horario)
  // ============================================================
  if (window.PanelPerfil) {
    const originalCollectAndSave = window.PanelPerfil.collectAndSave;
    window.PanelPerfil.collectAndSave = async function () {
      const horarioData = collectScheduleData();
      this.currentData.horario_atencion = horarioData;
      if (originalCollectAndSave) await originalCollectAndSave.call(this);
    };
    const originalPopulateUI = window.PanelPerfil.populateUI;
    window.PanelPerfil.populateUI = function (data) {
      if (originalPopulateUI) originalPopulateUI.call(this, data);
      if (data.horario_atencion) {
        console.log("🎯 Renderizando horario desde populateUI");
        HorarioModule.render(data.horario_atencion);
      }
    };
    if (
      window.PanelPerfil.currentData &&
      window.PanelPerfil.currentData.horario_atencion
    ) {
      console.log("🎯 Renderizando horario desde datos existentes");
      HorarioModule.render(window.PanelPerfil.currentData.horario_atencion);
    }
  }

  console.log("✅ Módulo Horario cargado correctamente");

  // ============================================================
  //  5. INICIAR LA ESCUCHA EN TIEMPO REAL
  // ============================================================
  initRealtimeAccount();
})(); // Fin del IIFE principal
