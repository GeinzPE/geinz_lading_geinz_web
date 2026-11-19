/* ══════════════════════════════════════════════════════════════
   calles_cercanas.js
   Lógica para detectar la calle del cliente a partir de su lat/lng.
   No toca el DOM de carrito.js ni Firestore: solo decide.
   ══════════════════════════════════════════════════════════════ */

export const CALLE_AUTO_M = 120; // dentro de esto se elige sola
export const CALLE_SUGERIR_M = 400; // dentro de esto se sugieren candidatas
export const CALLE_AMBIGUA_M = 40; // si la 2da está a menos de esto de la 1ra, hay duda
export const GPS_TOLERANCIA_MAX_M = 250; // tope de tolerancia por mala precisión del GPS

export function distanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000,
    rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad,
    dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const coordValida = (c) =>
  Number.isFinite(c?.lat) &&
  Number.isFinite(c?.lng) &&
  c.lat !== 0 &&
  c.lng !== 0;

/* Convierte un doc de Firestore en una calle. Sin lat/lng → NaN (no 0) */
export function normalizarCalle(id, data, normalizeText) {
  const x = data || {};
  const nombre = String(x.nombre || "").trim();
  return {
    id,
    nombre,
    lat: x.lat == null || x.lat === "" ? NaN : Number(x.lat),
    lng: x.lng == null || x.lng === "" ? NaN : Number(x.lng),
    radio: Number(x.radio) > 0 ? Number(x.radio) : null, // opcional: metros, para avenidas largas
    norm: normalizeText ? normalizeText(nombre) : nombre.toLowerCase(),
  };
}

/* Ordena las calles por distancia al cliente (solo las que tienen coordenadas reales) */
export function rankingCalles(calles, lat, lng) {
  return calles
    .filter(coordValida)
    .map((c) => ({ ...c, m: distanciaMetros(lat, lng, c.lat, c.lng) }))
    .sort((a, b) => a.m - b.m);
}

/* Decide qué hacer. Devuelve:
   { tipo: "auto",     calle, ranking }       → elegirla sola
   { tipo: "sugerir",  candidatas, ranking }  → que el cliente confirme
   { tipo: "lejos",    ranking }              → no inventar, que la busque
   { tipo: "sin_datos" }                      → ninguna calle tiene coordenadas */
export function decidirCalle(calles, lat, lng, accuracy = 0) {
  const ranking = rankingCalles(calles, lat, lng);
  if (!ranking.length) return { tipo: "sin_datos", ranking };

  const [mejor, segunda] = ranking;
  const tolerancia = Math.max(
    CALLE_AUTO_M,
    Math.min(accuracy || 0, GPS_TOLERANCIA_MAX_M),
  );
  const limite = mejor.radio ? Math.max(mejor.radio, tolerancia) : tolerancia;
  const ambigua = !!segunda && segunda.m - mejor.m < CALLE_AMBIGUA_M;

  if (mejor.m <= limite && !ambigua) return { tipo: "auto", calle: mejor, ranking };

  const candidatas = ranking
    .filter((c) => c.m <= Math.max(CALLE_SUGERIR_M, c.radio || 0))
    .slice(0, 3);
  if (candidatas.length) return { tipo: "sugerir", candidatas, ranking };

  return { tipo: "lejos", ranking };
}

/* ── Chips de "¿Cuál es tu calle?" ── */
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m],
  );

export function quitarCandidatas() {
  document.getElementById("calleCandidatas")?.remove();
}

/* anchorEl: elemento después del cual se insertan (ej. .calle-wrap)
   onElegir(calle): se llama al tocar un chip */
export function pintarCandidatas(anchorEl, lista, onElegir) {
  if (!anchorEl) return;
  quitarCandidatas();
  const wrap = document.createElement("div");
  wrap.id = "calleCandidatas";
  wrap.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;";
  wrap.innerHTML =
    `<span style="width:100%;font-size:11.5px;color:#8b8b95;">¿Cuál es tu calle?</span>` +
    lista
      .map(
        (c) =>
          `<button type="button" class="chip" data-id="${esc(c.id)}" style="font-size:12px;">${esc(c.nombre)} · ${Math.round(c.m)} m</button>`,
      )
      .join("");
  wrap.onclick = (e) => {
    const b = e.target.closest("[data-id]");
    if (!b) return;
    const c = lista.find((x) => x.id === b.dataset.id);
    if (c) {
      quitarCandidatas();
      onElegir(c);
    }
  };
  anchorEl.after(wrap);
}