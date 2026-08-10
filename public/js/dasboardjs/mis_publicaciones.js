    import { onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
    import { tiendaSubCol } from "../rutas/rutas.js";

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

    function promosRef() {
      return tiendaSubCol(localidad, "tiendas", tiendaId, "promociones_geinz");
    }

    let promos = [];
    let filtroEstado = "todos";
    let filtroCategoria = null;
    let unsub = null;
    let intervaloTimers = null;

    const el = (id) => document.getElementById(id);

    /* ---------------- Reloj Perú en vivo ---------------- */
    function actualizarRelojPeru() {
      const ahora = new Date();
      const relojEl = el("reloj-peru");
      if (relojEl) {
        relojEl.textContent = ahora.toLocaleTimeString("es-PE", {
          timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", second: "2-digit",
        });
      }
    }
    setInterval(actualizarRelojPeru, 1000);
    actualizarRelojPeru();

    /* ---------------- Suscripción Firestore ---------------- */
    function iniciarSuscripcion() {
      if (unsub) unsub();
      const q = query(promosRef(), orderBy("informacion.id_promocion", "asc"));
      unsub = onSnapshot(
        q,
        (snap) => {
          promos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          renderFiltrosCategoria();
          render();
        },
        (err) => console.error("Error cargando promociones:", err),
      );
    }

    /* ---------------- Helpers ---------------- */
    function esExpirado(promo) {
      const fin = promo.datos_hora_fecha?.timestamp_fin?.toDate?.();
      if (!fin) return promo.estado !== "activo";
      return fin.getTime() <= Date.now();
    }

    function tiempoRestante(promo) {
      const fin = promo.datos_hora_fecha?.timestamp_fin?.toDate?.();
      if (!fin) return null;
      const diff = fin.getTime() - Date.now();
      if (diff <= 0) return null;
      const dias = Math.floor(diff / 86400000);
      const horas = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const segs = Math.floor((diff % 60000) / 1000);
      if (dias > 0) return `${dias}d ${horas}h`;
      if (horas > 0) return `${horas}h ${mins}m`;
      if (mins > 0) return `${mins}m ${segs}s`;
      return `${segs}s`;
    }

    /* ---------------- Filtros ---------------- */
    document.querySelectorAll("[data-estado]").forEach((btn) => {
      btn.addEventListener("click", () => {
        filtroEstado = btn.dataset.estado;
        document.querySelectorAll("[data-estado]").forEach((b) => (b.dataset.active = "false"));
        btn.dataset.active = "true";
        render();
      });
    });

    function renderFiltrosCategoria() {
      const cont = el("cat-filters");
      const categorias = [...new Set(promos.map((p) => p.informacion?.categoria).filter(Boolean))];
      cont.innerHTML = "";
      if (!categorias.length) return;

      const btnTodas = document.createElement("button");
      btnTodas.className = "filter-pill rounded-lg px-3 py-1 text-[11px]";
      btnTodas.dataset.active = filtroCategoria === null ? "true" : "false";
      btnTodas.textContent = "Todas las categorías";
      btnTodas.onclick = () => { filtroCategoria = null; renderFiltrosCategoria(); render(); };
      cont.appendChild(btnTodas);

      categorias.forEach((cat) => {
        const btn = document.createElement("button");
        btn.className = "filter-pill rounded-lg px-3 py-1 text-[11px] capitalize";
        btn.dataset.active = filtroCategoria === cat ? "true" : "false";
        btn.textContent = cat;
        btn.onclick = () => { filtroCategoria = cat; renderFiltrosCategoria(); render(); };
        cont.appendChild(btn);
      });
    }

    /* ---------------- Render Principal ---------------- */
    function render() {
      const filtradas = promos.filter((p) => {
        const expirado = esExpirado(p);
        if (filtroEstado === "activo" && expirado) return false;
        if (filtroEstado === "expirado" && !expirado) return false;
        if (filtroEstado === "exclusivo" && !p.exclusivo) return false;
        if (filtroCategoria && p.informacion?.categoria !== filtroCategoria) return false;
        return true;
      });

      renderStats();
      renderGrid(filtradas);
    }

    function renderStats() {
      el("stat-activas").textContent = promos.filter((p) => !esExpirado(p)).length;
      el("stat-expiradas").textContent = promos.filter((p) => esExpirado(p)).length;
      el("stat-exclusivas").textContent = promos.filter((p) => p.exclusivo).length;
      el("stat-total").textContent = promos.length;
    }

    function renderGrid(items) {
      const grid = el("promos-grid");
      const empty = el("empty-state");
      grid.innerHTML = "";

      if (intervaloTimers) clearInterval(intervaloTimers);

      if (!items.length) {
        empty.classList.remove("hidden");
        return;
      }
      empty.classList.add("hidden");

      items.forEach((promo) => grid.appendChild(renderCard(promo)));

      intervaloTimers = setInterval(() => {
        document.querySelectorAll("[data-timer-id]").forEach((elTimer) => {
          const promo = promos.find((p) => p.id === elTimer.dataset.timerId);
          if (!promo) return;
          const restante = tiempoRestante(promo);
          if (restante) {
            elTimer.textContent = `⏳ ${restante}`;
            elTimer.classList.remove("expired");
          } else {
            elTimer.textContent = "🔴 Expirado";
            elTimer.classList.add("expired");
          }
        });
      }, 1000);
    }

    function renderCard(promo) {
      const info = promo.informacion || {};
      const img = promo.img_container?.lista_img?.[0] || promo.img_container?.logo_img || "";
      const expirado = esExpirado(promo);
      const restanteInicial = tiempoRestante(promo);

      const card = document.createElement("div");
      card.className = "promo-card glass-card rounded-2xl overflow-hidden cursor-pointer";
      card.addEventListener("click", () => abrirDetalle(promo));

      card.innerHTML = `
        <div class="promo-img-wrap">
          ${img ? `<img src="${img}" loading="lazy" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center text-3xl opacity-20">🖼️</div>`}
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20"></div>
          ${promo.exclusivo ? `<span class="absolute top-2.5 left-2.5 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-400 text-black shadow-md">👑 Exclusiva</span>` : ""}
          <span data-timer-id="${promo.id}" class="timer-chip ${expirado ? "expired" : ""} absolute bottom-2.5 right-2.5 text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg text-white">
            ${restanteInicial ? `⏳ ${restanteInicial}` : "🔴 Expirado"}
          </span>
        </div>
        <div class="p-3.5">
          <p class="text-xs font-bold text-white truncate">${info.nombre_tienda || "Sin nombre"}</p>
          <p class="text-[11px] text-zinc-400 mt-1 line-clamp-2 leading-relaxed font-normal">${info.titulo || ""}</p>
        </div>
      `;
      return card;
    }

    /* ---------------- Modal de Detalle ---------------- */
    function abrirDetalle(promo) {
      const info = promo.informacion || {};
      const dhf = promo.datos_hora_fecha || {};
      const ubic = promo.ubicacion || {};
      const imgs = promo.img_container?.lista_img || [];
      const expirado = esExpirado(promo);

      const galeria = imgs.length
        ? `<div class="flex gap-2 overflow-x-auto p-4 border-b border-zinc-800/80 bg-zinc-950/40">
            ${imgs.map((u) => `<img src="${u}" class="w-20 h-20 rounded-xl object-cover shrink-0 border border-zinc-700/60">`).join("")}
          </div>`
        : "";

      const pagos = (promo.pagos || []).map((p) => `<span class="tag-chip capitalize">${p}</span>`).join(" ");
      const terminos = (promo.terminos_clave || []).map((t) => `<span class="tag-chip">#${t}</span>`).join(" ");
      const comodidades = (promo.comodidades || []).map((c) => `<span class="tag-chip">${c}</span>`).join(" ");

      el("modal-content").innerHTML = `
        <div class="relative animate-modal-in">
          <div class="relative h-56 w-full bg-zinc-950">
            ${promo.img_container?.lista_img?.[0]
              ? `<img src="${promo.img_container.lista_img[0]}" class="w-full h-full object-cover">`
              : `<div class="w-full h-full flex items-center justify-center text-4xl opacity-20">🖼️</div>`}
            <div class="absolute inset-0 bg-gradient-to-t from-[#0b0b10] via-transparent to-black/40"></div>
            <button id="btn-cerrar-modal" class="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 backdrop-blur text-zinc-300 hover:text-white border border-white/10 flex items-center justify-center transition-colors">✕</button>
            <span class="absolute bottom-3 right-3 timer-chip ${expirado ? "expired" : ""} text-[11px] font-mono font-bold px-3 py-1 rounded-lg text-white">
              ${tiempoRestante(promo) ? `⏳ ${tiempoRestante(promo)}` : "🔴 Expirado"}
            </span>
          </div>

          ${galeria}

          <div class="p-6 space-y-4">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <h2 class="text-lg font-bold text-white">${info.nombre_tienda || "Sin Nombre"}</h2>
                ${promo.exclusivo ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-400 text-black">👑 VIP</span>` : ""}
              </div>
              <p class="text-sm font-semibold text-purple-300 mb-1">${info.titulo || ""}</p>
              <p class="text-xs text-zinc-400 leading-relaxed">${info.descripcion || "Sin descripción proporcionada."}</p>
            </div>

            <div class="space-y-3 pt-2 border-t border-zinc-800/80">
              <div class="flex items-start gap-3">
                <span class="text-base">🏷️</span>
                <div>
                  <p class="text-[10px] font-bold text-zinc-500 uppercase">Categoría</p>
                  <p class="text-xs font-medium text-zinc-200 capitalize">${info.categoria || "—"}</p>
                </div>
              </div>

              <div class="flex items-start gap-3">
                <span class="text-base">📅</span>
                <div>
                  <p class="text-[10px] font-bold text-zinc-500 uppercase">Vigencia</p>
                  <p class="text-xs font-mono text-zinc-200">${dhf.fecha_inicio || "?"} → ${dhf.fecha_fin || "?"} · ${dhf.hora_inicio || ""}–${dhf.hora_fin || ""}</p>
                </div>
              </div>

              <div class="flex items-start gap-3">
                <span class="text-base">📍</span>
                <div>
                  <p class="text-[10px] font-bold text-zinc-500 uppercase">Ubicación</p>
                  <p class="text-xs font-medium text-zinc-200">${ubic.direccion || "—"}</p>
                  ${ubic.referencia ? `<p class="text-[11px] text-zinc-500 mt-0.5">${ubic.referencia}</p>` : ""}
                </div>
              </div>

              <div class="flex items-start gap-3">
                <span class="text-base">📞</span>
                <div>
                  <p class="text-[10px] font-bold text-zinc-500 uppercase">Contacto</p>
                  <p class="text-xs font-mono text-zinc-200">${info.numero || "—"}</p>
                </div>
              </div>

              ${pagos ? `
              <div class="flex items-start gap-3">
                <span class="text-base">💳</span>
                <div>
                  <p class="text-[10px] font-bold text-zinc-500 uppercase mb-1">Métodos de Pago</p>
                  <div class="flex flex-wrap gap-1.5">${pagos}</div>
                </div>
              </div>` : ""}

              ${comodidades ? `
              <div class="flex items-start gap-3">
                <span class="text-base">✨</span>
                <div>
                  <p class="text-[10px] font-bold text-zinc-500 uppercase mb-1">Comodidades</p>
                  <div class="flex flex-wrap gap-1.5">${comodidades}</div>
                </div>
              </div>` : ""}

              ${terminos ? `
              <div class="flex items-start gap-3">
                <span class="text-base">🔎</span>
                <div>
                  <p class="text-[10px] font-bold text-zinc-500 uppercase mb-1">Etiquetas</p>
                  <div class="flex flex-wrap gap-1.5">${terminos}</div>
                </div>
              </div>` : ""}

              <div class="flex items-start gap-3 pt-2">
                <span class="text-base">💰</span>
                <div>
                  <p class="text-[10px] font-bold text-zinc-500 uppercase">Costo de publicación</p>
                  <p class="text-xs font-bold font-mono text-emerald-400">S/ ${info.precio_publicacion || promo.precio_publicacion || "0.00"}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      el("overlay-detalle").classList.add("show");
      el("btn-cerrar-modal").addEventListener("click", cerrarDetalle);
    }

    function cerrarDetalle() {
      el("overlay-detalle").classList.remove("show");
    }

    el("overlay-detalle").addEventListener("click", (e) => {
      if (e.target.id === "overlay-detalle") cerrarDetalle();
    });

    if (tiendaId && localidad) iniciarSuscripcion();
