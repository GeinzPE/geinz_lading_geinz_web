/* =========================================================================
   import-productos.js
   Módulo de IMPORTACIÓN MASIVA de productos para el panel.
   Soporta 4 orígenes: Excel/CSV, Word (.docx), PDF y scraping de una URL.

   CÓMO CONECTARLO A TU index.html (solo 2 cambios, no se toca nada más):

   1) Junto a tus imports de Firebase, agrega:
        import { initImportador } from './import-productos.js';

   2) Al FINAL de tu <script type="module"> (después de que ya existan
      categoriasRef, productosRef, storage, storagePathProducto, toast,
      esRestaurante), agrega:

        initImportador({
          categoriasRef,
          productosRef,
          storage,
          storagePathProducto,
          toast,
          getEsRestaurante: () => esRestaurante,
        });

   El módulo se encarga de: inyectar el botón "Importar productos" en el
   header, crear su propio modal, cargar bajo demanda las librerías que
   necesita (SheetJS, Mammoth, PDF.js) y escribir en Firestore/Storage
   usando exactamente la misma estructura de datos que ya usa tu panel
   (categorias -> productos, con imagenes[] y condiciones[]).
   ========================================================================= */

import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

/* ---------------- Carga perezosa de librerías externas ---------------- */
const CDN = {
  xlsx: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  mammoth:
    "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js",
  pdf: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  pdfWorker:
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.dataset.src = src;
    s.onload = () => resolve();
    s.onerror = () =>
      reject(new Error("No se pudo cargar la librería: " + src));
    document.head.appendChild(s);
  });
}

/* ---------------- Utilidades de texto / parseo ---------------- */
function normKey(k) {
  return k
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
}

function toBool(v, def = true) {
  if (v === undefined || v === null || v === "") return def;
  return /^(si|sí|yes|true|1|x)$/i.test(v.toString().trim());
}

// "Fría:0:10;Al tiempo:0:10" -> [{nombre,activo,costoAdicional,stock}]
function parseOpcionesStr(str) {
  if (!str) return [];
  return str
    .toString()
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const [nombre, costo, stock] = part
        .split(":")
        .map((x) => (x ?? "").trim());
      return {
        nombre: nombre || "",
        activo: true,
        costoAdicional: parseFloat((costo || "0").replace(",", ".")) || 0,
        stock:
          stock === "" || stock === undefined
            ? null
            : Math.max(0, parseInt(stock, 10) || 0),
      };
    })
    .filter((o) => o.nombre);
}

// Convierte una fila "cruda" (headers variados) al formato interno de registro
function mapRowToRegistro(rawRow) {
  const row = {};
  Object.entries(rawRow).forEach(([k, v]) => {
    row[normKey(k)] = v;
  });

  const condiciones = [];
  for (let i = 1; i <= 3; i++) {
    const n = row[`variante${i}_nombre`];
    const o = row[`variante${i}_opciones`];
    if (n && n.toString().trim() && o) {
      condiciones.push({
        nombre: n.toString().trim(),
        opciones: parseOpcionesStr(o),
      });
    }
  }

  const imagenes = [1, 2, 3]
    .map((i) => row[`imagen${i}`])
    .filter((u) => u && u.toString().trim())
    .map((u) => u.toString().trim());

  return {
    _selected: true,
    categoria: (row.categoria || "").toString().trim(),
    nombre: (row.nombre || row.producto || "").toString().trim(),
    descripcion: (row.descripcion || "").toString().trim(),
    precio: (row.precio ?? "").toString().replace(",", "."),
    stock: (row.stock ?? "").toString().replace(/[^\d]/g, ""),
    disponible: toBool(row.disponible, true),
    imagenes,
    condiciones,
  };
}

// Fallback para texto libre (Word / PDF sin tabla):
// bloques separados por líneas "Nombre: / Precio: / Stock: / Descripción: / Categoría:"
function parseTextoPorBloques(texto) {
  const lineas = texto
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const registros = [];
  let actual = null;
  const campoRegex =
    /^(nombre|producto|precio|descripcion|descripción|stock|categoria|categoría)\s*[:\-]\s*(.+)$/i;

  lineas.forEach((linea) => {
    const m = linea.match(campoRegex);
    if (!m) return;
    const campo = normKey(m[1]);
    const valor = m[2].trim();

    if (campo === "nombre" || campo === "producto") {
      if (actual && actual.nombre) registros.push(actual);
      actual = {
        _selected: true,
        categoria: "",
        nombre: valor,
        descripcion: "",
        precio: "",
        stock: "",
        disponible: true,
        imagenes: [],
        condiciones: [],
      };
    } else if (actual) {
      if (campo === "precio")
        actual.precio = valor.replace(/[^0-9.,]/g, "").replace(",", ".");
      else if (campo.startsWith("descripcion")) actual.descripcion = valor;
      else if (campo === "stock") actual.stock = valor.replace(/\D/g, "");
      else if (campo.startsWith("categoria")) actual.categoria = valor;
    }
  });
  if (actual && actual.nombre) registros.push(actual);
  return registros;
}

/* ---------------- Parsers por tipo de archivo ---------------- */
async function parseExcelOCSV(file) {
  await loadScript(CDN.xlsx);
  const esCSV = /\.csv$/i.test(file.name);
  const data = esCSV ? await file.text() : await file.arrayBuffer();
  const wb = window.XLSX.read(data, { type: esCSV ? "string" : "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return rows.map(mapRowToRegistro);
}

async function descargarPlantillaExcel() {
  await loadScript(CDN.xlsx);
  const ejemplo = [
    {
      categoria: "Bebidas",
      nombre: "Agua mineral",
      descripcion: "Botella 625ml",
      precio: 3.5,
      stock: 20,
      disponible: "Si",
      imagen1: "https://ejemplo.com/agua.jpg",
      imagen2: "",
      imagen3: "",
      variante1_nombre: "Temperatura",
      variante1_opciones: "Fría:0:10;Al tiempo:0:10",
      variante2_nombre: "",
      variante2_opciones: "",
      variante3_nombre: "",
      variante3_opciones: "",
    },
  ];
  const ws = window.XLSX.utils.json_to_sheet(ejemplo);
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, "Productos");
  window.XLSX.writeFile(wb, "plantilla_productos.xlsx");
}

async function parseWord(file) {
  await loadScript(CDN.mammoth);
  const buf = await file.arrayBuffer();
  const { value: html } = await window.mammoth.convertToHtml({
    arrayBuffer: buf,
  });
  const parsedDoc = new DOMParser().parseFromString(html, "text/html");

  const tabla = parsedDoc.querySelector("table");
  if (tabla) {
    const filas = Array.from(tabla.querySelectorAll("tr")).map((tr) =>
      Array.from(tr.querySelectorAll("td,th")).map((td) =>
        td.textContent.trim(),
      ),
    );
    if (filas.length > 1) {
      const headers = filas[0].map(normKey);
      return filas.slice(1).map((celdas) => {
        const raw = {};
        headers.forEach((h, i) => {
          raw[h] = celdas[i] || "";
        });
        return mapRowToRegistro(raw);
      });
    }
  }
  return parseTextoPorBloques(parsedDoc.body.textContent);
}

async function parsePDF(file) {
  await loadScript(CDN.pdf);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = CDN.pdfWorker;
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  let texto = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    texto += content.items.map((it) => it.str).join(" ") + "\n";
  }
  return parseTextoPorBloques(texto);
}

async function scrapearURL(url, usarProxy) {
  const target = usarProxy
    ? `https://corsproxy.io/?${encodeURIComponent(url)}`
    : url;
  const resp = await fetch(target);
  if (!resp.ok)
    throw new Error(
      "No se pudo acceder a la URL (código " + resp.status + ").",
    );
  const html = await resp.text();
  const parsedDoc = new DOMParser().parseFromString(html, "text/html");
  const registros = [];

  // 1) JSON-LD (schema.org Product) — la fuente más confiable si existe
  parsedDoc
    .querySelectorAll('script[type="application/ld+json"]')
    .forEach((tag) => {
      try {
        const data = JSON.parse(tag.textContent);
        const items = Array.isArray(data) ? data : data["@graph"] || [data];
        items.forEach((item) => {
          if (item && /product/i.test(item["@type"] || "")) {
            const oferta = Array.isArray(item.offers)
              ? item.offers[0]
              : item.offers;
            const precio = (oferta && oferta.price) || "";
            const imagenRaw = Array.isArray(item.image)
              ? item.image[0]
              : item.image;
            registros.push({
              _selected: true,
              categoria: "",
              nombre: item.name || "",
              descripcion: (item.description || "").toString().slice(0, 300),
              precio: precio.toString(),
              stock: "",
              disponible: true,
              imagenes: imagenRaw ? [imagenRaw] : [],
              condiciones: [],
            });
          }
        });
      } catch (e) {
        /* JSON-LD inválido, se ignora ese bloque */
      }
    });

  // 2) Fallback heurístico: tarjetas con clases típicas de tienda online
  if (!registros.length) {
    const candidatos = parsedDoc.querySelectorAll(
      '[class*="product" i], [class*="item" i]',
    );
    candidatos.forEach((el) => {
      if (registros.length >= 100) return; // límite de seguridad
      const nombreEl = el.querySelector(
        'h1,h2,h3,[class*="title" i],[class*="name" i]',
      );
      const precioEl = el.querySelector('[class*="price" i]');
      const imgEl = el.querySelector("img");
      if (nombreEl && precioEl && nombreEl.textContent.trim()) {
        let imagenUrl = "";
        if (imgEl) {
          const src =
            imgEl.getAttribute("src") || imgEl.getAttribute("data-src") || "";
          try {
            imagenUrl = new URL(src, url).href;
          } catch (e) {
            imagenUrl = "";
          }
        }
        registros.push({
          _selected: true,
          categoria: "",
          nombre: nombreEl.textContent.trim(),
          descripcion: "",
          precio: precioEl.textContent
            .replace(/[^\d.,]/g, "")
            .replace(",", "."),
          stock: "",
          disponible: true,
          imagenes: imagenUrl ? [imagenUrl] : [],
          condiciones: [],
        });
      }
    });
  }
  return registros;
}

/* ---------------- Import a Firestore / Storage ---------------- */
async function subirImagenDesdeURL(
  url,
  productoId,
  storage,
  storagePathProducto,
) {
  try {
    const resp = await fetch(url, { mode: "cors" });
    if (!resp.ok) throw new Error("status " + resp.status);
    const blob = await resp.blob();
    const filename =
      (url.split("/").pop() || "img").split("?")[0] || "imagen.jpg";
    const path = `${storagePathProducto(productoId)}/${Date.now()}_${filename}`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, blob);
    const finalUrl = await getDownloadURL(ref);
    return { url: finalUrl, path };
  } catch (err) {
    // No se pudo copiar la imagen a tu Storage (típicamente por CORS del sitio de origen).
    // Se guarda como referencia externa: seguirá mostrándose, pero no vive en tu bucket.
    return { url, path: null };
  }
}

async function ejecutarImportacion(
  deps,
  registros,
  categoriaDefault,
  onProgress,
) {
  const { categoriasRef, productosRef, storage, storagePathProducto, toast } =
    deps;
  const categoriasCreadas = new Set();
  const seleccionados = registros.filter(
    (r) => r._selected && r.nombre && r.nombre.trim(),
  );
  let ok = 0,
    fail = 0,
    i = 0;

  for (const reg of seleccionados) {
    i++;
    onProgress?.(i, seleccionados.length);
    try {
      const nombreCategoria =
        (reg.categoria && reg.categoria.trim()) || categoriaDefault;
      if (!nombreCategoria) throw new Error("Sin categoría de destino");

      if (!categoriasCreadas.has(nombreCategoria)) {
        const catRef = doc(categoriasRef, nombreCategoria);
        const snap = await getDoc(catRef);
        if (!snap.exists()) {
          await setDoc(catRef, {
            nombre: nombreCategoria,
            createdAt: serverTimestamp(),
          });
        }
        categoriasCreadas.add(nombreCategoria);
      }

      const nuevoRef = doc(productosRef(nombreCategoria));
      const precio =
        parseFloat((reg.precio || "0").toString().replace(",", ".")) || 0;
      const stock =
        reg.stock === "" || reg.stock === undefined || reg.stock === null
          ? null
          : Math.max(0, parseInt(reg.stock, 10) || 0);

      await setDoc(nuevoRef, {
        nombre: reg.nombre.trim(),
        descripcion: (reg.descripcion || "").trim(),
        precio,
        stock,
        disponible: reg.disponible === undefined ? true : !!reg.disponible,
        autoDesactivar: false,
        condiciones: reg.condiciones || [],
        imagenes: [],
        createdAt: serverTimestamp(),
      });

      const imgs = (reg.imagenes || []).filter(Boolean).slice(0, 3);
      if (imgs.length) {
        const subidas = [];
        for (const url of imgs) {
          subidas.push(
            await subirImagenDesdeURL(
              url,
              nuevoRef.id,
              storage,
              storagePathProducto,
            ),
          );
        }
        await updateDoc(nuevoRef, { imagenes: subidas });
      }
      ok++;
    } catch (err) {
      console.error(err);
      fail++;
    }
  }
  toast(
    `Importación terminada: ${ok} producto(s) creado(s)${fail ? `, ${fail} con errores` : ""}.`,
  );
}

/* ============================== UI ============================== */
export function initImportador(deps) {
  // Evita duplicados si initImportador() se llama más de una vez
  if (document.getElementById("btn-importar-productos")) return;

  const { categoriasRef, toast, getEsRestaurante } = deps;
  let registrosActuales = [];
  let categoriasExistentes = [];

  /* ---- Botón en el header ---- */
/* ---- Botón "Importar productos" dentro del menú "Agregar" ---- */
  const btnImportar = document.createElement("button");
  btnImportar.id = "btn-importar-productos";
  btnImportar.type = "button";
  btnImportar.className = "panel-actions-item";
  btnImportar.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>
    </svg>
    <span>Importar productos</span>`;
  const menuAcciones = document.getElementById("panel-actions-menu");
  const btnNuevaCat = document.getElementById("btn-nueva-categoria");
  if (menuAcciones) {
    menuAcciones.appendChild(btnImportar);
  } else if (btnNuevaCat && btnNuevaCat.parentNode) {
    btnNuevaCat.parentNode.insertBefore(btnImportar, btnNuevaCat);
  }

  /* ---- Overlay / Modal ---- */
  const overlay = document.createElement("div");
  overlay.id = "overlay-importar";
  overlay.style.display = "none";
  overlay.className =
    "fixed inset-0 z-[150] items-center justify-center p-4 bg-black/80 backdrop-blur-sm";
  overlay.innerHTML = `
    <div class="w-full max-w-3xl rounded-2xl bg-[#0d0a17] border border-purple-900/30 shadow-2xl p-6 max-h-[90vh] overflow-y-auto thin-scroll">
      <div class="flex items-center justify-between mb-1">
        <h3 class="text-lg font-bold text-white">Importar productos</h3>
        <button type="button" id="btn-cerrar-importar" class="text-purple-400/60 hover:text-white text-xl leading-none px-2">✕</button>
      </div>
      <p class="text-purple-300/60 text-xs mb-5">Trae tus productos desde Excel/CSV, Word, PDF o una URL. Siempre podrás revisar y editar antes de guardar.</p>

<div class="grid grid-cols-3 sm:flex sm:flex-wrap gap-2 mb-5" id="importar-tabs">
       <button type="button" data-tab="excel" class="import-tab-btn active-import-tab rounded-xl px-3 py-1.5 text-xs font-medium bg-violet-950/50 border border-violet-500/40 text-violet-200 transition-colors duration-200 justify-center">Excel / CSV</button>
<button type="button" data-tab="word" class="import-tab-btn rounded-xl px-3 py-1.5 text-xs font-medium bg-white/5 border border-purple-900/30 text-purple-300 transition-colors duration-200 justify-center">Word (.docx)</button>
<button type="button" data-tab="pdf" class="import-tab-btn rounded-xl px-3 py-1.5 text-xs font-medium bg-white/5 border border-purple-900/30 text-purple-300 transition-colors duration-200 justify-center">PDF</button>
      </div>

<!-- Panel Excel -->
<div class="import-panel" data-panel="excel">
  <div class="import-file-row">
    <input type="file" id="input-import-excel" accept=".xlsx,.xls,.csv" class="import-file-hidden">
    <label for="input-import-excel" class="import-file-btn">Seleccionar archivo</label>
    <span class="import-file-name" id="filename-excel">Ningún archivo seleccionado</span>
    <div class="import-file-actions">
      <button type="button" id="btn-analizar-excel" class="rounded-xl px-3 py-2 text-xs font-medium text-white bg-violet-800 hover:bg-violet-700 shrink-0">Analizar archivo</button>
      <button type="button" id="btn-descargar-plantilla" class="rounded-xl px-3 py-2 text-xs font-medium text-violet-300 hover:text-violet-200 bg-white/5 border border-purple-900/30 shrink-0">⬇ Plantilla</button>
    </div>
  </div>
  <p class="text-[11px] text-purple-300/50 leading-relaxed">Columnas esperadas: <code>categoria, nombre, descripcion, precio, stock, disponible, imagen1, imagen2, imagen3, variante1_nombre, variante1_opciones</code> (hasta variante3). Formato de opciones: <code>Opción:costoExtra:stock;Opción2:costoExtra2:stock2</code>.</p>
</div>

      <!-- Panel Word -->
<div class="import-panel hidden" data-panel="word">
  <div class="import-file-row">
    <input type="file" id="input-import-word" accept=".docx" class="import-file-hidden">
    <label for="input-import-word" class="import-file-btn">Seleccionar archivo</label>
    <span class="import-file-name" id="filename-word">Ningún archivo seleccionado</span>
    <div class="import-file-actions">
      <button type="button" id="btn-analizar-word" class="rounded-xl px-3 py-2 text-xs font-medium text-white bg-violet-800 hover:bg-violet-700 shrink-0">Analizar archivo</button>
    </div>
  </div>
  <p class="text-[11px] text-purple-300/50 leading-relaxed">Funciona mejor si tu Word tiene una <strong>tabla</strong> con esas mismas columnas. Si no hay tabla, intento leer bloques tipo "Nombre: / Precio: / Stock: / Descripción:". El resultado es aproximado — revísalo antes de importar.</p>
</div>
 <!-- Panel PDF -->
<div class="import-panel hidden" data-panel="pdf">
  <div class="import-file-row">
    <input type="file" id="input-import-pdf" accept=".pdf" class="import-file-hidden">
    <label for="input-import-pdf" class="import-file-btn">Seleccionar archivo</label>
    <span class="import-file-name" id="filename-pdf">Ningún archivo seleccionado</span>
    <div class="import-file-actions">
      <button type="button" id="btn-analizar-pdf" class="rounded-xl px-3 py-2 text-xs font-medium text-white bg-violet-800 hover:bg-violet-700 shrink-0">Analizar archivo</button>
    </div>
  </div>
  <p class="text-[11px] text-purple-300/50 leading-relaxed">Igual que Word: mejor resultado si el PDF trae bloques "Nombre: / Precio: / Stock:". Es una extracción aproximada, siempre revisa antes de importar.</p>
</div>

  
      <div id="importar-estado" class="text-xs text-violet-300 mt-3 hidden"></div>

      <!-- Configuración de destino + vista previa -->
      <div id="importar-config" class="hidden mt-5 pt-5 border-t border-purple-900/20">
        <div class="mb-4">
          <label class="block text-[11px] font-semibold uppercase tracking-wider text-purple-300/70 mb-1.5 font-mono">Categoría por defecto (para filas sin categoría)</label>
          <select id="select-categoria-default" class="w-full rounded-xl bg-[#05040a] border border-purple-900/30 px-3.5 py-2.5 text-sm text-purple-100 outline-none focus:border-violet-600"></select>
        </div>
        <div class="overflow-x-auto rounded-xl border border-purple-900/20">
          <table class="w-full text-xs">
            <thead class="bg-[#05040a] text-purple-300/60 font-mono uppercase text-[10px]">
              <tr>
                <th class="p-2 text-left"><input type="checkbox" id="chk-todos" checked></th>
                <th class="p-2 text-left">Categoría</th>
                <th class="p-2 text-left">Nombre</th>
                <th class="p-2 text-left">Precio</th>
                <th class="p-2 text-left">Stock</th>
                <th class="p-2 text-left">Descripción</th>
                <th class="p-2 text-left">Imágenes</th>
                <th class="p-2 text-left">Variantes</th>
              </tr>
            </thead>
            <tbody id="tbody-preview"></tbody>
          </table>
        </div>
        <p class="text-[11px] text-purple-300/50 mt-2" id="resumen-preview"></p>
      </div>

      <div class="flex justify-end gap-2.5 mt-6">
        <button type="button" id="btn-cancelar-importar" class="rounded-xl px-4 py-2 text-sm font-medium text-purple-200 bg-white/5 hover:bg-white/10 transition-all">Cancelar</button>
        <button type="button" id="btn-confirmar-importar" disabled class="rounded-xl px-4 py-2 text-sm font-medium text-white bg-violet-800 hover:bg-violet-700 transition-all min-w-[160px] flex items-center justify-center disabled:opacity-40">
          <span id="btn-confirmar-importar-label">Importar seleccionados</span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Muestra el nombre real del archivo elegido en vez del texto truncado del navegador
  [
    ["input-import-excel", "filename-excel"],
    ["input-import-word", "filename-word"],
    ["input-import-pdf", "filename-pdf"],
  ].forEach(([inputId, labelId]) => {
    const input = overlay.querySelector(`#${inputId}`);
    const label = overlay.querySelector(`#${labelId}`);
    input.addEventListener("change", () => {
      if (input.files[0]) {
        label.textContent = input.files[0].name;
        label.classList.add("has-file");
        label.title = input.files[0].name;
      } else {
        label.textContent = "Ningún archivo seleccionado";
        label.classList.remove("has-file");
        label.title = "";
      }
    });
  });
  function abrir() {
    overlay.style.display = "flex";
  }
  function cerrar() {
    overlay.style.display = "none";
    registrosActuales = [];
    document.getElementById("importar-config").classList.add("hidden");
    document.getElementById("importar-estado").classList.add("hidden");
    document.getElementById("btn-confirmar-importar").disabled = true;
  }

  btnImportar.addEventListener("click", async () => {
    abrir();
    try {
      const snap = await getDocs(categoriasRef);
      categoriasExistentes = snap.docs.map((d) => d.id);
    } catch (e) {
      categoriasExistentes = [];
    }
  });
  overlay
    .querySelector("#btn-cerrar-importar")
    .addEventListener("click", cerrar);
  overlay
    .querySelector("#btn-cancelar-importar")
    .addEventListener("click", cerrar);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cerrar();
  });

  /* ---- Tabs ---- */
  /* ---- Tabs (con transición animada) ---- */
  function cambiarPanel(tabId) {
    const actual = overlay.querySelector(".import-panel:not(.hidden)");
    const siguiente = overlay.querySelector(
      `.import-panel[data-panel="${tabId}"]`,
    );
    if (!siguiente || actual === siguiente) return;

    if (actual) {
      actual.classList.add("import-fade-out");
      const onEnd = () => {
        actual.classList.add("hidden");
        actual.classList.remove("import-fade-out");
        actual.removeEventListener("transitionend", onEnd);
      };
      actual.addEventListener("transitionend", onEnd);
    }

    siguiente.classList.remove("hidden");
    siguiente.classList.add("import-fade-out");
    // doble rAF para que el navegador registre el estado inicial antes de animar
    requestAnimationFrame(() => {
      requestAnimationFrame(() =>
        siguiente.classList.remove("import-fade-out"),
      );
    });
  }

  overlay.querySelectorAll(".import-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      overlay.querySelectorAll(".import-tab-btn").forEach((b) => {
        const activo = b === btn;
        b.classList.toggle("active-import-tab", activo);
        b.classList.toggle("bg-violet-950/50", activo);
        b.classList.toggle("border-violet-500/40", activo);
        b.classList.toggle("text-violet-200", activo);
        b.classList.toggle("bg-white/5", !activo);
        b.classList.toggle("border-purple-900/30", !activo);
        b.classList.toggle("text-purple-300", !activo);
      });
      cambiarPanel(btn.dataset.tab);
    });
  });

  function setEstado(msg, esError = false) {
    const el = overlay.querySelector("#importar-estado");
    el.classList.remove("hidden");
    el.className = `text-xs mt-3 ${esError ? "text-rose-300" : "text-violet-300"}`;
    el.textContent = msg;
  }

  /* ---- Vista previa ---- */
  function mostrarPreview(registros) {
    registrosActuales = registros;
    const config = overlay.querySelector("#importar-config");
    const tbody = overlay.querySelector("#tbody-preview");
    const selectDefault = overlay.querySelector("#select-categoria-default");
    const resumen = overlay.querySelector("#resumen-preview");
    const btnConfirmar = overlay.querySelector("#btn-confirmar-importar");

    if (!registros.length) {
      setEstado(
        "No se detectó ningún producto. Revisa el archivo/URL o prueba con Excel.",
        true,
      );
      config.classList.add("hidden");
      btnConfirmar.disabled = true;
      return;
    }

    setEstado(
      `Se detectaron ${registros.length} producto(s). Revisa y ajusta antes de importar.`,
    );

    // Categorías: existentes + las nuevas que trae el propio archivo
    const nuevasDelArchivo = [
      ...new Set(registros.map((r) => r.categoria).filter(Boolean)),
    ];
    const todasCategorias = [
      ...new Set([...categoriasExistentes, ...nuevasDelArchivo]),
    ];
    selectDefault.innerHTML =
      todasCategorias
        .map((c) => `<option value="${c}">${c}</option>`)
        .join("") ||
      '<option value="">(no hay categorías, escribe una en cada fila)</option>';

    tbody.innerHTML = "";
    registros.forEach((reg, idx) => {
      const tr = document.createElement("tr");
      tr.className = "border-t border-purple-900/10";
      tr.innerHTML = `
        <td class="p-2"><input type="checkbox" data-idx="${idx}" class="chk-fila" ${reg._selected ? "checked" : ""}></td>
        <td class="p-2"><input type="text" data-idx="${idx}" data-campo="categoria" value="${reg.categoria || ""}" placeholder="(por defecto)" class="w-24 rounded-lg bg-[#05040a] border border-purple-900/20 px-2 py-1 text-purple-100"></td>
        <td class="p-2"><input type="text" data-idx="${idx}" data-campo="nombre" value="${(reg.nombre || "").replace(/"/g, "&quot;")}" class="w-32 rounded-lg bg-[#05040a] border border-purple-900/20 px-2 py-1 text-purple-100"></td>
        <td class="p-2"><input type="number" step="0.10" data-idx="${idx}" data-campo="precio" value="${reg.precio || ""}" class="w-16 rounded-lg bg-[#05040a] border border-purple-900/20 px-2 py-1 text-purple-100 font-mono"></td>
        <td class="p-2"><input type="number" step="1" data-idx="${idx}" data-campo="stock" value="${reg.stock || ""}" class="w-14 rounded-lg bg-[#05040a] border border-purple-900/20 px-2 py-1 text-purple-100 font-mono"></td>
        <td class="p-2"><input type="text" data-idx="${idx}" data-campo="descripcion" value="${(reg.descripcion || "").replace(/"/g, "&quot;")}" class="w-40 rounded-lg bg-[#05040a] border border-purple-900/20 px-2 py-1 text-purple-100"></td>
        <td class="p-2 text-purple-400/60">${(reg.imagenes || []).length}</td>
        <td class="p-2 text-purple-400/60">${(reg.condiciones || []).map((c) => c.nombre).join(", ") || "—"}</td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".chk-fila").forEach((chk) => {
      chk.addEventListener("change", () => {
        registrosActuales[chk.dataset.idx]._selected = chk.checked;
        actualizarResumen();
      });
    });
    tbody.querySelectorAll("input[data-campo]").forEach((inp) => {
      inp.addEventListener("input", () => {
        registrosActuales[inp.dataset.idx][inp.dataset.campo] = inp.value;
      });
    });

    function actualizarResumen() {
      const n = registrosActuales.filter((r) => r._selected).length;
      resumen.textContent = `${n} de ${registrosActuales.length} seleccionados para importar.`;
      btnConfirmar.disabled = n === 0;
    }
    actualizarResumen();

    config.classList.remove("hidden");
  }

  overlay.querySelector("#chk-todos").addEventListener("change", (e) => {
    overlay.querySelectorAll(".chk-fila").forEach((chk) => {
      chk.checked = e.target.checked;
      registrosActuales[chk.dataset.idx]._selected = e.target.checked;
    });
    overlay.querySelector("#tbody-preview").dispatchEvent(new Event("change"));
    const resumen = overlay.querySelector("#resumen-preview");
    const n = registrosActuales.filter((r) => r._selected).length;
    resumen.textContent = `${n} de ${registrosActuales.length} seleccionados para importar.`;
    overlay.querySelector("#btn-confirmar-importar").disabled = n === 0;
  });

  /* ---- Acciones por pestaña ---- */
  async function conBotonCargando(btn, fn) {
    const original = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      await fn();
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  overlay
    .querySelector("#btn-descargar-plantilla")
    .addEventListener("click", (e) => {
      conBotonCargando(e.currentTarget, descargarPlantillaExcel);
    });

  overlay
    .querySelector("#btn-analizar-excel")
    .addEventListener("click", (e) => {
      const file = overlay.querySelector("#input-import-excel").files[0];
      if (!file) {
        setEstado("Selecciona un archivo primero.", true);
        return;
      }
      conBotonCargando(e.currentTarget, async () => {
        try {
          setEstado("Leyendo archivo...");
          const registros = await parseExcelOCSV(file);
          mostrarPreview(registros);
        } catch (err) {
          console.error(err);
          setEstado("No se pudo leer el archivo: " + err.message, true);
        }
      });
    });

  overlay.querySelector("#btn-analizar-word").addEventListener("click", (e) => {
    const file = overlay.querySelector("#input-import-word").files[0];
    if (!file) {
      setEstado("Selecciona un archivo .docx primero.", true);
      return;
    }
    conBotonCargando(e.currentTarget, async () => {
      try {
        setEstado("Leyendo documento...");
        const registros = await parseWord(file);
        mostrarPreview(registros);
      } catch (err) {
        console.error(err);
        setEstado("No se pudo leer el documento: " + err.message, true);
      }
    });
  });

  overlay.querySelector("#btn-analizar-pdf").addEventListener("click", (e) => {
    const file = overlay.querySelector("#input-import-pdf").files[0];
    if (!file) {
      setEstado("Selecciona un archivo PDF primero.", true);
      return;
    }
    conBotonCargando(e.currentTarget, async () => {
      try {
        setEstado("Leyendo PDF...");
        const registros = await parsePDF(file);
        mostrarPreview(registros);
      } catch (err) {
        console.error(err);
        setEstado("No se pudo leer el PDF: " + err.message, true);
      }
    });
  });

  /* ---- Confirmar importación ---- */
  overlay
    .querySelector("#btn-confirmar-importar")
    .addEventListener("click", async () => {
      const btn = overlay.querySelector("#btn-confirmar-importar");
      const label = overlay.querySelector("#btn-confirmar-importar-label");
      const categoriaDefault = overlay.querySelector(
        "#select-categoria-default",
      ).value;
      const original = label.textContent;
      btn.disabled = true;
      try {
        await ejecutarImportacion(
          deps,
          registrosActuales,
          categoriaDefault,
          (i, total) => {
            label.textContent = `Importando ${i}/${total}...`;
          },
        );
        cerrar();
      } catch (err) {
        console.error(err);
        toast("Ocurrió un error durante la importación.", "error");
      } finally {
        btn.disabled = false;
        label.textContent = original;
      }
    });
}
