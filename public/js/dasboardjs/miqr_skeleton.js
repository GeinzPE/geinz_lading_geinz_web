// miqr_skeleton.js
// Skeleton + carga progresiva (blur → nítido) para las imágenes de miqr.html.
// Es autónomo: no toca miqr.js. Observa el DOM y actúa cuando aparece/cambia un <img>.

const css = `
@keyframes pqSh { to { transform: translateX(100%); } }
@keyframes pqIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

/* Skeleton superpuesto (dentro del recuadro del QR) */
.pq-sk {
  position: absolute; inset: 0; z-index: 2; border-radius: inherit;
  background: #101014; overflow: hidden; transition: opacity .3s ease; pointer-events: none;
}
.pq-sk.out { opacity: 0; }
.qrcard-qrbox .pq-sk { background: #eceaf2; }

/* Skeleton en bloque (tarjetas de mesas) */
.pq-bl { display: block; position: relative; overflow: hidden; border-radius: 12px; background: #141417; border: 1px solid rgba(255,255,255,.05); }
.pq-sk::after, .pq-bl::after {
  content: ""; position: absolute; inset: 0; transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(124,77,255,.22), transparent);
  animation: pqSh 1.4s infinite;
}
.qrcard-qrbox .pq-sk::after { background: linear-gradient(90deg, transparent, rgba(124,77,255,.18), transparent); }
.pq-mc { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: 18px; background: rgba(255,255,255,.025); border: 1px solid rgba(255,255,255,.07); }
.pq-oculto { display: none !important; }
.pq-entra { animation: pqIn .45s cubic-bezier(.16,1,.3,1) both; }

/* Carga progresiva: entra desenfocada y se aclara */
img.pq-img {
  opacity: 0; filter: blur(12px); transform: scale(1.04);
  transition: opacity .45s ease, filter .6s ease, transform .6s ease;
  animation: none !important;
}
img.pq-img.pq-ok { opacity: 1; filter: blur(0); transform: none; }
/* En la vista previa no se oculta nunca la imagen (para que la descarga HD no salga en blanco) */
img.pq-img.pq-modal { opacity: 1 !important; filter: none !important; transform: none !important; transition: none; }

.pq-fail::after {
  content: "No se pudo cargar"; position: absolute; inset: 0; z-index: 3;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; color: #a1a1aa; background: #101014; border-radius: inherit;
}
@media (prefers-reduced-motion: reduce) {
  .pq-sk::after, .pq-bl::after, .pq-entra { animation: none !important; }
  img.pq-img { transition: none; filter: none; transform: none; }
}
`;
const st = document.createElement("style");
st.textContent = css;
document.head.appendChild(st);

const SEL = ".qr-preview, .mesa-preview, .qrcard-qrbox, #qrColoresPrueba > div";
const IMG_SEL = SEL.split(",").map((s) => s.trim() + " img").join(", ");
const ign = (el) => el.setAttribute("data-html2canvas-ignore", "true");

// ── Una imagen: skeleton hasta que cargue ──
function seguir(img) {
  const box = img.closest(SEL);
  if (!box) return;
  if (getComputedStyle(box).position === "static") box.style.position = "relative";

  const modal = box.classList.contains("qrcard-qrbox");
  img.classList.add("pq-img");
  if (modal) img.classList.add("pq-modal");
  img.decoding = "async";
  if (box.classList.contains("mesa-preview")) img.loading = "lazy";

  box.classList.remove("pq-fail");
  box.querySelectorAll(".pq-sk, .qr-skeleton").forEach((n) => n.remove());

  if (!img.getAttribute("src")) return; // sin src todavía
  if (img.complete && img.naturalWidth > 0) {
    img.classList.add("pq-ok", "loaded");
    return;
  }

  img.classList.remove("pq-ok");
  const sk = document.createElement("div");
  sk.className = "pq-sk";
  ign(sk);
  box.appendChild(sk);

  const fin = (ok) => {
    sk.classList.add("out");
    setTimeout(() => sk.remove(), 300);
    if (ok) img.classList.add("pq-ok", "loaded");
    else box.classList.add("pq-fail");
  };
  img.addEventListener("load", () => fin(true), { once: true });
  img.addEventListener("error", () => fin(false), { once: true });
}

const mo = new MutationObserver((muts) => {
  for (const m of muts) {
    if (m.type === "attributes") {
      if (m.target.tagName === "IMG") seguir(m.target);
      continue;
    }
    m.addedNodes.forEach((n) => {
      if (n.nodeType !== 1) return;
      if (n.tagName === "IMG") seguir(n);
      else n.querySelectorAll?.("img").forEach(seguir);
    });
  }
});
mo.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["src"],
});
document.querySelectorAll(IMG_SEL).forEach(seguir);

// ── Tarjetas de QR del negocio: skeleton mientras carga la tienda ──
(function tilesIniciales() {
  const chip = document.getElementById("qrStoreChipLabel");
  const tiles = [...document.querySelectorAll(".qr-preview")];
  if (!chip || !tiles.length) return;
  const cargando = () => /cargando/i.test(chip.textContent || "");
  if (!cargando()) return;

  const caps = tiles.map((t) => {
    const d = document.createElement("div");
    d.className = "pq-sk";
    ign(d);
    t.appendChild(d);
    return d;
  });
  let fin = false;
  const cerrar = () => {
    if (fin) return;
    fin = true;
    obs.disconnect();
    caps.forEach((d) => {
      d.classList.add("out");
      setTimeout(() => d.remove(), 300);
    });
  };
  const obs = new MutationObserver(() => !cargando() && cerrar());
  obs.observe(chip, { childList: true, characterData: true, subtree: true });
  setTimeout(cerrar, 8000); // respaldo
})();

// ── Mesas por local: skeleton hasta que llegue la lista (o el estado vacío) ──
(function mesasIniciales() {
  const grid = document.getElementById("mesasGrid");
  const vacio = document.getElementById("mesasEmptyState");
  if (!grid) return;
  const listo = () =>
    grid.children.length > 0 || (vacio && !vacio.classList.contains("hidden"));
  if (listo()) return;

  const sk = document.createElement("div");
  sk.className = grid.className;
  sk.setAttribute("aria-busy", "true");
  sk.innerHTML = Array(10)
    .fill(
      `<div class="pq-mc"><i class="pq-bl" style="aspect-ratio:1"></i><i class="pq-bl" style="height:12px;width:60%;border-radius:6px"></i></div>`,
    )
    .join("");
  grid.before(sk);
  grid.classList.add("pq-oculto");

  let fin = false;
  const cerrar = () => {
    if (fin) return;
    fin = true;
    obs.disconnect();
    sk.remove();
    grid.classList.remove("pq-oculto");
    grid.classList.add("pq-entra");
    setTimeout(() => grid.classList.remove("pq-entra"), 600);
  };
  const obs = new MutationObserver(() => listo() && cerrar());
  obs.observe(grid, { childList: true });
  if (vacio) obs.observe(vacio, { attributes: true, attributeFilter: ["class"] });
  setTimeout(cerrar, 8000); // respaldo
})();