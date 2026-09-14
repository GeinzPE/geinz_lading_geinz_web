    import {
      onSnapshot,
      query,
      orderBy,
      limit,
    } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
    import { tiendaSubCol } from "../rutas/rutas.js";

    /* ---------------- Conversión de créditos a soles ---------------- */
    const VALOR_CREDITO_SOLES = 0.012;

    /* ---------------- Parámetros de tienda ---------------- */
    let tiendaId = sessionStorage.getItem("tiendaId");
    let localidad = sessionStorage.getItem("localidad");

    if (!tiendaId || !localidad) {
      window.addEventListener("message", (e) => {
        if (e.data?.tipo !== "DATOS_TIENDA") return;
        tiendaId = e.data.tiendaId;
        localidad = e.data.localidad;
        iniciarSuscripcion();
      });
    }

    function historialRef() {
      return tiendaSubCol(localidad, "tiendas", tiendaId, "historial_financiero");
    }

    /* ---------------- Estado ---------------- */
    let filtroTipo = "todos";
    let filtroRango = "todo";
    let LIMITE = 40;
    let docsCargados = [];
    let unsub = null;

    const el = (id) => document.getElementById(id);

    /* ---------------- Filtros UI ---------------- */
    function activarPill(grupoSelector, btnActivo) {
      document.querySelectorAll(grupoSelector).forEach((b) => b.dataset.active = "false");
      btnActivo.dataset.active = "true";
    }

    document.querySelectorAll("[data-tipo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        filtroTipo = btn.dataset.tipo;
        activarPill("[data-tipo]", btn);
        render();
      });
    });

    document.querySelectorAll("[data-rango]").forEach((btn) => {
      btn.addEventListener("click", () => {
        filtroRango = btn.dataset.rango;
        activarPill("[data-rango]", btn);
        render();
      });
    });

    el("btn-cargar-mas").addEventListener("click", () => {
      LIMITE += 40;
      const btn = el("btn-cargar-mas");
      const label = el("btn-cargar-mas-label");
      btn.disabled = true;
      label.innerHTML = '<span class="spinner"></span>';
      iniciarSuscripcion();
    });

    /* ---------------- Suscripción ---------------- */
    function iniciarSuscripcion() {
      if (unsub) unsub();
      const q = query(historialRef(), orderBy("timestamp", "desc"), limit(LIMITE));
      unsub = onSnapshot(
        q,
        (snap) => {
          docsCargados = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          const btn = el("btn-cargar-mas");
          const label = el("btn-cargar-mas-label");
          btn.disabled = false;
          label.textContent = "Cargar más";
          btn.classList.toggle("hidden", snap.size < LIMITE);
          render();
        },
        (err) => {
          console.error("Error cargando historial financiero:", err);
        },
      );
    }

    /* ---------------- Helpers de fecha ---------------- */
    function fechaDoc(item) {
      if (item.timestamp?.toDate) return item.timestamp.toDate();
      return new Date();
    }
    function claveDia(date) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }
    function labelDia(date) {
      const hoy = new Date();
      const ayer = new Date();
      ayer.setDate(hoy.getDate() - 1);
      if (claveDia(date) === claveDia(hoy)) return "Hoy";
      if (claveDia(date) === claveDia(ayer)) return "Ayer";
      return date.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
    }
    function horaCorta(date) {
      return date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
    }
    function dentroDeRango(date) {
      if (filtroRango === "todo") return true;
      const hoy = new Date();
      const dias = filtroRango === "hoy" ? 0 : parseInt(filtroRango, 10);
      const limiteFecha = new Date();
      limiteFecha.setDate(hoy.getDate() - dias);
      limiteFecha.setHours(0, 0, 0, 0);
      return date >= limiteFecha;
    }

    /* ---------------- Render Principal ---------------- */
    function render() {
      const filtrados = docsCargados.filter((item) => {
        const tipo = item.tipo_transacción || "";
        if (filtroTipo !== "todos" && tipo !== filtroTipo) return false;
        return dentroDeRango(fechaDoc(item));
      });

      renderStats(filtrados);
      renderPieChart(filtrados);
      renderLista(filtrados);
    }

    /* ---------------- Render Stats ---------------- */
    function renderStats(items) {
      let gastadoSoles = 0;
      let recargadoSoles = 0;
      let ultimoDoc = null;
      let ultimaFecha = null;

      items.forEach((item) => {
        const fecha = fechaDoc(item);
        const dr = item.datos_recarga || {};
        if (item.tipo_transacción === "descuento") {
          const creditos = Number(dr.monto_descontado) || 0;
          gastadoSoles += creditos * VALOR_CREDITO_SOLES;
        } else if (item.tipo_transacción === "recarga") {
          recargadoSoles += parseFloat(dr.precio_soles) || 0;
        }
        if (!ultimaFecha || fecha > ultimaFecha) {
          ultimaFecha = fecha;
          ultimoDoc = item;
        }
      });

      el("stat-gastado").textContent = `S/ ${gastadoSoles.toFixed(2)}`;
      el("stat-recargado").textContent = `S/ ${recargadoSoles.toFixed(2)}`;
      el("stat-total").textContent = items.length;

      if (ultimoDoc) {
        const dr = ultimoDoc.datos_recarga || {};
        let saldo = 0;
        if (ultimoDoc.tipo_transacción === "descuento") {
          saldo = Number(dr.monto_restante) || 0;
        } else {
          saldo = (Number(dr.monto_anterior) || 0) + (Number(dr.monto_aumentado) || 0);
        }
        el("stat-saldo").textContent = saldo.toLocaleString("es-PE");
      } else {
        el("stat-saldo").textContent = "0";
      }
    }

    /* ---------------- Render Gráfico de Pastel (SVG Donut) ---------------- */
    function renderPieChart(items) {
      let gastadoSoles = 0;
      let recargadoSoles = 0;

      items.forEach((item) => {
        const dr = item.datos_recarga || {};
        if (item.tipo_transacción === "descuento") {
          gastadoSoles += (Number(dr.monto_descontado) || 0) * VALOR_CREDITO_SOLES;
        } else if (item.tipo_transacción === "recarga") {
          recargadoSoles += parseFloat(dr.precio_soles) || 0;
        }
      });

      const total = gastadoSoles + recargadoSoles;

      const pctGasto = total > 0 ? (gastadoSoles / total) * 100 : 0;
      const pctRecarga = total > 0 ? (recargadoSoles / total) * 100 : 0;

      el("pie-gasto-val").textContent = `S/ ${gastadoSoles.toFixed(2)}`;
      el("pie-gasto-pct").textContent = `(${pctGasto.toFixed(1)}%)`;

      el("pie-recarga-val").textContent = `S/ ${recargadoSoles.toFixed(2)}`;
      el("pie-recarga-pct").textContent = `(${pctRecarga.toFixed(1)}%)`;

      el("pie-center-monto").textContent = `S/ ${(recargadoSoles - gastadoSoles).toFixed(2)}`;

      // Dibujar trazos en SVG
      const segRecarga = el("pie-seg-recarga");
      const segGasto = el("pie-seg-gasto");

      if (total === 0) {
        segRecarga.setAttribute("stroke-dasharray", `0 100`);
        segGasto.setAttribute("stroke-dasharray", `0 100`);
        return;
      }

      // Recarga primero
      segRecarga.setAttribute("stroke-dasharray", `${pctRecarga} 100`);
      segRecarga.setAttribute("stroke-dashoffset", `0`);

      // Gasto continuo al segmento de recarga
      segGasto.setAttribute("stroke-dasharray", `${pctGasto} 100`);
      segGasto.setAttribute("stroke-dashoffset", `-${pctRecarga}`);
    }

    /* ---------------- Lista Agrupada por Día ---------------- */
    function renderLista(items) {
      const cont = el("lista-container");
      const emptyState = el("empty-state");
      cont.innerHTML = "";

      if (!items.length) {
        emptyState.classList.remove("hidden");
        return;
      }
      emptyState.classList.add("hidden");

      const grupos = {};
      items.forEach((item) => {
        const fecha = fechaDoc(item);
        const key = claveDia(fecha);
        if (!grupos[key]) grupos[key] = { fecha, items: [] };
        grupos[key].items.push(item);
      });

      Object.values(grupos)
        .sort((a, b) => b.fecha - a.fecha)
        .forEach((grupo) => {
          const seccion = document.createElement("section");
          seccion.className = "animate-fade-in";

          const totalDiaSoles = grupo.items.reduce((acc, item) => {
            const dr = item.datos_recarga || {};
            if (item.tipo_transacción === "descuento") {
              return acc - (Number(dr.monto_descontado) || 0) * VALOR_CREDITO_SOLES;
            }
            return acc + (parseFloat(dr.precio_soles) || 0);
          }, 0);

          seccion.innerHTML = `
            <div class="flex items-center justify-between mb-3 px-1">
              <div class="flex items-center gap-2.5">
                <h3 class="text-xs font-bold uppercase tracking-wider text-zinc-300">${labelDia(grupo.fecha)}</h3>
                <span class="text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">${grupo.items.length} mov.</span>
              </div>
              <span class="text-xs font-mono font-bold ${totalDiaSoles >= 0 ? "text-emerald-400" : "text-rose-400"}">
                ${totalDiaSoles >= 0 ? "+" : ""}S/ ${totalDiaSoles.toFixed(2)}
              </span>
            </div>
            <div class="dark-card rounded-2xl divide-y divide-zinc-800/60 overflow-hidden shadow-2xl" data-day-list></div>
          `;

          const listEl = seccion.querySelector("[data-day-list]");
          grupo.items
            .sort((a, b) => fechaDoc(b) - fechaDoc(a))
            .forEach((item) => listEl.appendChild(renderCard(item)));

          cont.appendChild(seccion);
        });
    }

    /* ---------------- Render Tarjeta ---------------- */
    function renderCard(item) {
      const dr = item.datos_recarga || {};
      const esRecarga = item.tipo_transacción === "recarga";
      const fecha = fechaDoc(item);

      const row = document.createElement("div");
      row.className = "flex items-center justify-between p-4 sm:px-5 hover:bg-zinc-800/40 transition-colors group";

      const badgeBg = esRecarga 
        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
        : "bg-rose-500/10 text-rose-400 border-rose-500/20";
      const colorMonto = esRecarga ? "text-emerald-400" : "text-rose-400";

      let montoTexto = "";
      let detalleExtra = "";

      if (esRecarga) {
        montoTexto = `+${(Number(dr.monto_aumentado) || 0).toLocaleString("es-PE")} cr.`;
        detalleExtra = `S/ ${parseFloat(dr.precio_soles || 0).toFixed(2)} pagados`;
      } else {
        const creditos = Number(dr.monto_descontado) || 0;
        montoTexto = `-${creditos.toLocaleString("es-PE")} cr.`;
        detalleExtra = `S/ ${(creditos * VALOR_CREDITO_SOLES).toFixed(2)} · Restan ${(Number(dr.monto_restante) || 0).toLocaleString("es-PE")}`;
      }

      const metodoPago = item.metodo_pago
        ? Object.entries(item.metodo_pago)
            .filter(([, activo]) => activo)
            .map(([nombre]) => nombre.charAt(0).toUpperCase() + nombre.slice(1))
            .join(" · ")
        : "";

      const estadoBadge = dr.estado
        ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            dr.estado === "Aceptado"
              ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
              : "bg-amber-950/60 text-amber-400 border-amber-500/30"
          }">${dr.estado}</span>`
        : "";

      row.innerHTML = `
        <div class="flex items-center gap-3.5 min-w-0">
          <div class="w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${badgeBg}">
            ${esRecarga 
              ? `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11l5-5m0 0l5 5m-5-5v12"/></svg>`
              : `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 13l-5 5m0 0l-5-5m5 5V6"/></svg>`
            }
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="text-xs sm:text-sm font-bold text-white truncate">
                ${dr.tipo_paquete || (esRecarga ? "Recarga de Créditos" : "Consumo de Servicio")}
              </p>
              ${estadoBadge}
            </div>
            <p class="text-[11px] text-zinc-500 mt-0.5 font-medium flex items-center gap-1.5">
              <span>${horaCorta(fecha)}</span>
              ${metodoPago ? `<span>•</span> <span class="text-zinc-400">${metodoPago}</span>` : ""}
            </p>
          </div>
        </div>
        
        <div class="text-right shrink-0 ml-4">
          <p class="text-xs sm:text-sm font-extrabold font-mono ${colorMonto}">${montoTexto}</p>
          <p class="text-[10px] text-zinc-500 font-mono mt-0.5">${detalleExtra}</p>
        </div>
      `;

      return row;
    }

    /* ---------------- Arranque ---------------- */
    if (tiendaId && localidad) {
      iniciarSuscripcion();
    }
