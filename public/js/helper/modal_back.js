// modal_back.js
const pila = [];
let ignorar = 0;
let cfg = null;

function irInicio() {
  // Si el panel vive dentro de un iframe, que lo resuelva la ventana padre
  if (window.parent !== window) {
    window.parent.postMessage({ type: "IR_INICIO" }, window.location.origin);
    return;
  }
  window.location.replace(cfg.url);
}

window.addEventListener("popstate", () => {
  if (ignorar > 0) { ignorar--; return; }

  const m = pila.pop();
  if (m) { m.cerrar(); return; }          // 1) hay diálogo: solo se cierra

  if (cfg && cfg.movil.matches) irInicio(); // 2) sin diálogos: a inicio
});

window.ModalBack = {
  abrir(id, cerrar) {
    if (pila.some((m) => m.id === id)) return;
    pila.push({ id, cerrar });
    history.pushState({ modal: id }, "");
  },
  cerrado(id) {
    const i = pila.findIndex((m) => m.id === id);
    if (i === -1) return;
    pila.splice(i, 1);
    ignorar++;
    history.back();
  },

  // Llamar UNA vez en las pantallas que NO son inicio
  irInicioAlRetroceder(url) {
    if (cfg) return;
    cfg = { url, movil: window.matchMedia("(max-width:1023px)") };
    history.pushState({ guard: true }, ""); // entrada "guard"
  },
};