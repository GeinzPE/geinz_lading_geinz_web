
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
    authDomain: "geinzworkapp.firebaseapp.com",
    projectId: "geinzworkapp",
    storageBucket: "geinzworkapp.appspot.com",
    messagingSenderId: "921389328767",
    appId: "1:921389328767:web:094e8a2a5fcd69395b524a",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ── helpers UI ── */
const $ = id => document.getElementById(id);
const show = el => el.style.display = "block";
const hide = el => el.style.display = "none";

/* ── parsear ID: formato "05-2026-XXXX" ── */
function parsearIdComprobante(idRaw) {
    const partes = idRaw.split("-");
    if (partes.length >= 3) {
        const mes = partes[0];
        const anio = partes[1];
        const idDoc = partes.slice(2).join("-");
        const meses = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun",
            "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        const mesNombre = meses[parseInt(mes, 10)] || mes;
        return { periodo: `${mesNombre} ${anio}`, idDoc, anio };
    }
    return { periodo: "—", idDoc: idRaw, anio: new Date().getFullYear() };
}

/* ── obtener id de la URL ── */
const params = new URLSearchParams(window.location.search);
const idTransaccion = params.get("id");

$("footerAnio").textContent = new Date().getFullYear();

let pdfUrl = null;
let visorAbierto = false;

async function cargar() {
    if (!idTransaccion) { mostrarError(); return; }

    try {
        const ref = doc(db, "Tiendas", "barranca", "pagos_tiendas", idTransaccion);
        const snap = await getDoc(ref);

        if (!snap.exists() || !snap.data().url_comprobante) {
            mostrarError(); return;
        }

        const data = snap.data();
        pdfUrl = data.url_comprobante;

        const { periodo, idDoc, anio } = parsearIdComprobante(idTransaccion);

        /* poblar meta */
        $("metaPeriodo").textContent = periodo;
        $("metaEstado").textContent = data.estado === "pagado" ? "Pagado ✓" : data.estado || "—";
        $("metaNegocio").textContent = data.nombre_user || "—";
        $("metaMonto").textContent = data.monto_pagar_de_plan
            ? `S/ ${parseFloat(data.monto_pagar_de_plan).toFixed(2)}`
            : "—";
        $("metaId").textContent = idTransaccion;
        $("badgeTipo").textContent = data.plan_select ? "Recarga" : "Comprobante";
        $("footerAnio").textContent = anio;

        /* botón descargar */
        $("btnDescargar").href = pdfUrl;

        /* mostrar */
        hide($("stateLoading"));
        show($("stateReady"));

    } catch (e) {
        console.error(e);
        mostrarError();
    }
}

function mostrarError() {
    hide($("stateLoading"));
    show($("stateError"));
    $("badgeTipo").textContent = "Error";
}

/* ── toggle visor PDF ── */
$("btnVer").addEventListener("click", () => {
    const viewer = $("pdfViewer");
    const frame = $("pdfFrame");
    const btn = $("btnVer");

    if (!visorAbierto) {
        frame.src = pdfUrl;
        viewer.classList.add("open");
        btn.textContent = "✕ Cerrar visor";
        btn.style.background = "var(--panel)";
        btn.style.color = "var(--muted2)";
        btn.style.border = "0.5px solid var(--border)";
        visorAbierto = true;
    } else {
        viewer.classList.remove("open");
        setTimeout(() => { frame.src = ""; viewer.style.display = "none"; }, 260);
        btn.textContent = "👁 Ver comprobante";
        btn.style.background = "";
        btn.style.color = "";
        btn.style.border = "";
        visorAbierto = false;
    }
});

cargar();