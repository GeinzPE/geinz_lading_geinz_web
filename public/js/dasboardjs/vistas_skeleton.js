// vistas_skeleton.js
// Skeleton independiente para: Mis publicaciones, Banners, Ofertas y Generador.
// No toca ningún otro JS: observa el DOM y se retira solo cuando llegan los datos.

const q = (s) => document.querySelector(s);
const rep = (n, s) => Array(n).fill(s).join("");
const b = (h, w = "100%", r = "") =>
  `<i class="pu-sk" style="height:${h}px;width:${w}${r ? ";border-radius:" + r : ""}"></i>`;

const tarjeta = `<div class="pu-c">${b(170, "100%", "14px")}${b(12, "70%")}${b(12, "45%")}${b(34, "100%", "12px")}</div>`;
const tile = `<div class="pu-c" style="gap:8px">${b(10, "60%")}${b(26, "40%")}${b(9, "75%")}</div>`;

const PLANTILLAS = {
  mis: `<div class="pu-g4">${rep(4, tile)}</div>
        <div class="pu-g4">${rep(4, tile)}</div>
        <div class="pu-row">${rep(5, b(36, "92px", "12px"))}</div>
        <div class="pu-gc">${rep(8, tarjeta)}</div>`,
  banners: `<div class="pu-gc" style="margin-top:14px">${rep(2, tarjeta)}</div>`,
  ofertas: `<div class="pu-gc" style="margin-top:14px">${rep(3, tarjeta)}</div>`,
  gen: `<div class="pu-g4" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));margin-top:14px">
          <div class="pu-c">${b(38, "100%", "12px")}${rep(4, b(44, "100%", "14px"))}</div>
          <div class="pu-c">${rep(2, `<div style="display:flex;gap:8px">${b(60, "50%", "14px")}${b(60, "50%", "14px")}</div>`)}${b(40, "100%", "12px")}${b(46, "100%", "12px")}</div>
        </div>`,
};

function cubrir({ ocultar, html, listo, observar }) {
  const els = ocultar().filter(Boolean);
  const vigilar = observar().filter(Boolean);
  if (!els.length) return;

  const sk = document.createElement("div");
  sk.className = "pu-skel";
  sk.setAttribute("aria-busy", "true");
  sk.innerHTML = html;
  els[0].before(sk);
  els.forEach((e) => e.classList.add("pu-oculto"));

  let fin = false;
  let mo = null;
  const cerrar = () => {
    if (fin) return;
    fin = true;
    mo?.disconnect();
    sk.classList.add("out");
    els.forEach((e) => {
      e.classList.remove("pu-oculto");
      e.classList.add("pu-entra");
      setTimeout(() => e.classList.remove("pu-entra"), 600);
    });
    setTimeout(() => sk.remove(), 320);
  };

  if ("MutationObserver" in window) {
    mo = new MutationObserver(() => listo() && cerrar());
    vigilar.forEach((v) =>
      mo.observe(v, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] }),
    );
  }
  setTimeout(cerrar, 10000); // respaldo: nunca queda pegado
  if (listo()) cerrar();
}

// Mis publicaciones (todo el contenido de la vista)
cubrir({
  html: PLANTILLAS.mis,
  ocultar: () => [...(q("#vista-mis")?.children || [])],
  observar: () => [q("#promos-grid"), q("#empty-state")],
  listo: () =>
    q("#promos-grid")?.children.length > 0 || !q("#empty-state")?.classList.contains("hidden"),
});

// Banners
cubrir({
  html: PLANTILLAS.banners,
  ocultar: () => [q("#bannersGrid")],
  observar: () => [q("#bannersGrid")],
  listo: () => q("#bannersGrid")?.children.length > 0,
});

// Ofertas
cubrir({
  html: PLANTILLAS.ofertas,
  ocultar: () => [q("#ofertasGrid")],
  observar: () => [q("#ofertasGrid")],
  listo: () => q("#ofertasGrid")?.children.length > 0,
});

// Generador de promociones
cubrir({
  html: PLANTILLAS.gen,
  ocultar: () => [q("#cardGenerador .gen-grid")],
  observar: () => [q("#genLista")],
  listo: () => {
    const t = (q("#genLista")?.textContent || "").trim();
    return t.length > 0 && !/cargando/i.test(t);
  },
});