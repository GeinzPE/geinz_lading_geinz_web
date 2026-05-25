window.PanelPerfil = {
  db: null,
  dbPlanes: null,
  TIENDA_ID: "fW7W8RsgkkQ3IYfxKHGR",

  // Solo inicializa la conexión, no ejecuta lógica de UI
  init: async function () {
    if (this.db) return; // Ya inicializado
    
    const { initializeApp, getApps } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const { getFirestore, doc, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

    // DB Geinzwork
    const app = !getApps().find(a => a.name === 'geinzApp') 
                ? initializeApp({
                    apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
                    authDomain: "geinzworkapp.firebaseapp.com",
                    projectId: "geinzworkapp",
                    storageBucket: "geinzworkapp.appspot.com",
                    messagingSenderId: "921389328767",
                    appId: "1:921389328767:web:dc6fffc43a51444f5b524a"
                  }, 'geinzApp') : getApps().find(a => a.name === 'geinzApp');
    
    this.db = getFirestore(app);
    this.doc = doc;
    this.onSnapshot = onSnapshot;
    this.TIENDA_REF = doc(this.db, "Tiendas", "barranca", "barranca", this.TIENDA_ID);

    // DB Planes
    const appPlanes = !getApps().find(a => a.name === 'planesApp') 
                      ? initializeApp({
                          apiKey: "AIzaSyA47YFtXgzUQe8w_Wb6AlfDcQSjOB5rT_U",
                          authDomain: "proyectolista-95172.firebaseapp.com",
                          projectId: "proyectolista-95172",
                          storageBucket: "proyectolista-95172.firebasestorage.app",
                          messagingSenderId: "250365546182",
                          appId: "1:250365546182:web:732f2342d416eb909111c7"
                        }, 'planesApp') : getApps().find(a => a.name === 'planesApp');
                      
    this.dbPlanes = getFirestore(appPlanes);
    console.log("✅ Inicialización lista. Esperando clicks.");
  },

  // ESTO SOLO SE EJECUTA AL DAR CLICK
  abrirModalRenovacion: async function () {
    // 1. Asegurar que esté inicializado
    await this.init(); 

    const modal = document.getElementById("modal-renovacion");
    const container = document.getElementById("selector-planes");
    modal.style.display = "flex";
    container.innerHTML = "Cargando...";

    // 2. Traer los datos
    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
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
  }
};