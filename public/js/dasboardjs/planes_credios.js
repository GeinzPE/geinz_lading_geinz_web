import { db } from "../db/db.js";
import { tiendaDoc } from "../rutas/rutas.js";

const _urlParams = new URLSearchParams(window.location.search);
let tiendaId = _urlParams.get("id") || sessionStorage.getItem("tiendaId");
let localidad =
  _urlParams.get("localidad") || sessionStorage.getItem("localidad");

// ⚠️ NO sobreescribir window.PanelPerfil: panel_perfil.js ya lo definió
// con todos sus métodos (populateUI, showSection, etc). Aquí solo
// agregamos/fusionamos las propiedades nuevas de este módulo.
window.PanelPerfil = window.PanelPerfil || {};

Object.assign(window.PanelPerfil, {
  dbPlanes: null,
  TIENDA_ID: window.PanelPerfil.TIENDA_ID || tiendaId,

  // Solo inicializa la conexión a "Planes" (proyectolista), no ejecuta lógica de UI.
  // La conexión a Geinzwork (this.db / this.TIENDA_REF) ya viene lista desde
  // panel_perfil.js -> db.js, así que aquí no se vuelve a inicializar.
  initPlanes: async function () {
    if (this.dbPlanes) return; // Ya inicializado

    // Aseguramos que exista la referencia a la tienda (por si este módulo
    // se usa en una página donde panel_perfil.js no corrió antes)
    if (!this.TIENDA_REF) {
      this.TIENDA_REF = tiendaDoc(localidad, "tiendas", this.TIENDA_ID);
    }
    if (!this.db) {
      this.db = db;
    }

    // ── DB Planes (proyectolista) — proyecto de Firebase aparte, NO TOCAR ──
    const { initializeApp, getApps } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const { getFirestore } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

    const appPlanes = !getApps().find((a) => a.name === "planesApp")
      ? initializeApp(
          {
            apiKey: "AIzaSyA47YFtXgzUQe8w_Wb6AlfDcQSjOB5rT_U",
            authDomain: "proyectolista-95172.firebaseapp.com",
            projectId: "proyectolista-95172",
            storageBucket: "proyectolista-95172.firebasestorage.app",
            messagingSenderId: "250365546182",
            appId: "1:250365546182:web:732f2342d416eb909111c7",
          },
          "planesApp",
        )
      : getApps().find((a) => a.name === "planesApp");

    this.dbPlanes = getFirestore(appPlanes);
    console.log("✅ Inicialización de Planes lista. Esperando clicks.");
  },

  // ESTO SOLO SE EJECUTA AL DAR CLICK
  abrirModalRenovacion: async function () {
    // 1. Asegurar que la conexión a Planes esté lista
    await this.initPlanes();

    const modal = document.getElementById("modal-renovacion");
    const container = document.getElementById("selector-planes");
    modal.style.display = "flex";
    container.innerHTML = "Cargando...";

    // 2. Traer los datos
    const { doc, getDoc } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const snap = await getDoc(doc(this.dbPlanes, "precio_apartado", "app"));

    if (snap.exists()) {
      const planes = snap.data().planes_activacion;
      container.innerHTML = "";
      Object.keys(planes).forEach((key) => {
        const btn = document.createElement("button");
        btn.className = "plan-opcion";
        btn.innerHTML = `<span>${key.replace(/_/g, " ")}</span><span>${planes[key]} 🪙</span>`;
        btn.onclick = () => console.log("Comprando:", key);
        container.appendChild(btn);
      });
    }
  },
});
