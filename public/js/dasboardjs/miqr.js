import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  getDownloadURL,
  getMetadata,
  uploadBytes,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

import { db, storage } from "../db/db.js";
import {
  tiendaDoc,
  tiendaSubDoc,
  tiendaSubCol,
  tiendaServiciosDoc,
} from "../rutas/rutas.js";

// ------------------------------------------------------------
// Cola global para llamadas a la Cloud Function de QR.
// La función solo soporta 1 Chrome (Puppeteer) a la vez por
// instancia; si el usuario clickea varios tiles/mesas seguidos,
// esto evita mandar fetches en paralelo y que el server truene
// con "Failed to launch the browser process".
// ------------------------------------------------------------
let _colaApiQr = Promise.resolve();

function encolarLlamadaApiQr(payload) {
  const tarea = _colaApiQr.then(() => _llamarApiQrInterno(payload));
  // pase lo que pase (éxito o error), la cola sigue andando
  _colaApiQr = tarea.then(
    () => {},
    () => {},
  );
  return tarea;
}

async function _llamarApiQrInterno(payload) {
  const res = await fetch(QR_API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      const j = await res.json();
      if (j.error) msg = j.error;
    } catch (_) {}
    throw new Error(msg);
  }

  return await res.blob();
}

const params = new URLSearchParams(window.location.search);

let tiendaId = sessionStorage.getItem("tiendaId");
let localidad = sessionStorage.getItem("localidad");

if (!tiendaId || !localidad) {
  window.addEventListener("message", (e) => {
    if (e.data?.tipo !== "DATOS_TIENDA") return;
    tiendaId = e.data.tiendaId;
    localidad = e.data.localidad;
  });
}
const DEFAULT_LOCALIDAD = localidad;
const DEFAULT_STORE_ID = tiendaId;

const QR_API_ENDPOINT = "https://qrapi-oixttik5rq-uc.a.run.app";
const COLOR_DEFAULT = ["#7c4dff", "#5a2fe0", "#1a1040"];

// Tamaño que le pedimos a la API generadora
const QR_REQUEST_SIZE = 1000; // px

// Tamaño final del PNG que se descarga, pensado para impresión
const QR_PRINT_SIZE = 3000; // px
const QR_PRINT_MARGIN = 0.06; // 6% de margen blanco (quiet zone extra)

const QrNegocio = {
  _tiendaInfoCache: null, // { id, alias, localidad }
  _logoCache: null, // base64 (o null si no hay logo)
  _estado: {}, // tipo -> { tipo, blobOriginal, info, origen, url } — usado por PreviewQr
  _modo: null, // { activo, dominio }
  _regenerando: false,

  // ------------------------------------------------------------
  // DOMINIO PERSONALIZADO
  // Lee el doc de servicios (el mismo que usa inicio) y decide si
  // los QR deben apuntar al dominio propio o al link de Geinz.
  // ------------------------------------------------------------
  async _cargarModoDominio() {
    if (this._modo) return this._modo;
    let modo = { activo: false, dominio: "" };
    try {
      const snap = await getDoc(tiendaServiciosDoc(localidad, tiendaId));
      const d = snap.exists() ? snap.data() : {};
      const ap = d.apartados_dasboard || {};
      const flag =
        d.dominio_personalizado ??
        d.dominio_perzonalizado ??
        ap.dominio_personalizado ??
        ap.dominio_perzonalizado;
      const dominio = String(d.dominio || "")
        .trim()
        .replace(/^https?:\/\//i, "")
        .replace(/\/+$/, "");
      modo = { activo: flag === true && !!dominio, dominio };
    } catch (err) {
      console.warn("QrNegocio: no se pudo leer el dominio personalizado.", err);
    }
    this._modo = modo;
    return modo;
  },

  _origenActual() {
    return this._modo?.activo ? "dominio" : "geinz";
  },

  // QR (negocio o mesa) cuyo origen no coincide con el modo actual.
  // Solo cuenta los que el usuario realmente ve (tiles/sección visibles).
  _desfasados() {
    const objetivo = this._origenActual();

    const tiles = Object.values(this._estado).filter((e) => {
      const tile = document.getElementById(`qrTile${this._cap(e.tipo)}`);
      const visible = !tile || tile.style.display !== "none";
      return visible && (e.origen || "geinz") !== objetivo;
    });

    const mesasSection = document.getElementById("mesasSection");
    const mesasVisibles = !mesasSection || mesasSection.style.display !== "none";
    const mesas = mesasVisibles
      ? MesasNegocio._mesas.filter((m) => (m.qr_origen || "geinz") !== objetivo)
      : [];

    return { objetivo, tiles, mesas };
  },

  actualizarAviso() {
    const box = document.getElementById("qrDominioAviso");
    if (!box || !this._modo || this._regenerando) return;

    const { objetivo, tiles, mesas } = this._desfasados();
    if (!tiles.length && !mesas.length) {
      box.classList.add("hidden");
      box.classList.remove("flex");
      return;
    }

    const texto = document.getElementById("qrDominioAvisoTexto");
    const btn = document.getElementById("btnRegenerarPorDominio");

    if (objetivo === "dominio") {
      texto.textContent = `Estos QR están con el link de Geinz y no apuntan a tu dominio personalizado (${this._modo.dominio}). Regénéralos para que apunten a tu dominio.`;
      btn.textContent = "Regenerar con mi dominio";
    } else {
      texto.textContent =
        "Estos QR usan tu dominio personalizado, que ya no está activo. Sin renovación dejará de funcionar: debes regenerarlos con Geinz.";
      btn.textContent = "Regenerar con Geinz";
    }
    box.classList.remove("hidden");
    box.classList.add("flex");
  },

  async regenerarPorCambioDeDominio() {
    const btn = document.getElementById("btnRegenerarPorDominio");
    const { tiles, mesas } = this._desfasados();
    const total = tiles.length + mesas.length;
    if (!total) return;

    this._regenerando = true;
    btn.disabled = true;
    const original = btn.textContent;
    let hechos = 0;
    const progreso = () =>
      (btn.textContent = `Regenerando ${hechos} / ${total}…`);
    progreso();

    try {
      for (const t of tiles) {
        await this.generar(t.tipo);
        hechos++;
        progreso();
      }
      for (const m of mesas) {
        await MesasNegocio.actualizarOrigenMesa(m.id);
        hechos++;
        progreso();
      }
      UI.toast("QR regenerados correctamente.");
    } catch (err) {
      console.error(err);
      UI.toast(err.message || "No se pudieron regenerar todos los QR.", true);
    } finally {
      this._regenerando = false;
      btn.disabled = false;
      btn.textContent = original;
      this.actualizarAviso();
    }
  },

  /**
   * Lee /Tiendas/{localidad}/{localidad}/{tiendaId} y saca
   * alias_key (o alias) + localidad real.
   */
  async _obtenerInfoTienda() {
    if (this._tiendaInfoCache) return this._tiendaInfoCache;

    const ref_ = tiendaDoc(localidad, "tiendas", tiendaId);
    const snap = await getDoc(ref_);

    if (!snap.exists()) {
      throw new Error(
        `No se encontró la tienda ${tiendaId} en /Tiendas/${localidad}/${localidad}.`,
      );
    }

    const data = snap.data() || {};
    const info = {
      id: tiendaId,
      alias: data.alias_key || data.alias || tiendaId,
      localidad: data.localidad || localidad,
      logoUrl: data.img_tienda?.logo_tienda || null,
      libroReclamaciones: data.footer?.libro_reclamaciones === true,
    };

    this._tiendaInfoCache = info;
    return info;
  },

  /**
   * Descarga el logo de la tienda (img_tienda.logo_tienda) y lo pasa
   * a base64. Si no existe, devuelve null.
   */
  async _logoBase64() {
    if (this._logoCache !== null) return this._logoCache;

    try {
      const info = await this._obtenerInfoTienda();
      const logoUrl = info.logoUrl;

      if (!logoUrl) {
        throw new Error(
          "La tienda no tiene img_tienda.logo_tienda configurado.",
        );
      }

      const res = await fetch(logoUrl);
      if (!res.ok)
        throw new Error(
          "No se pudo descargar el logo desde la URL guardada en Firestore.",
        );

      const blob = await res.blob();
      const base64 = await this._blobToBase64(blob);

      this._logoCache = base64;
      return base64;
    } catch (err) {
      console.warn(
        "QrNegocio: sin logo (img_tienda.logo_tienda), se usará el color de marca.",
        err,
      );
      this._logoCache = false;
      return null;
    }
  },
  _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },

  _armarUrl(tipo, info, origen = this._origenActual()) {
    if (origen === "dominio" && this._modo?.dominio) {
      const base = `https://${this._modo.dominio}`;
      switch (tipo) {
        case "perfil":
          return `${base}/`;
        case "carta":
          return `${base}/-carta`;
        case "carrito":
          return `${base}/carrito`;
        case "reclamaciones":
          return `${base}/libro_reclamaciones`;
        default:
          throw new Error("Tipo de QR desconocido: " + tipo);
      }
    }

    switch (tipo) {
      case "perfil":
        return `https://geinztech.com/perfil/${info.alias}`;
      case "carta":
        return `https://geinztech.com/perfil/${info.alias}-carta`;
      case "carrito":
        return `https://geinztech.com/perfil/${info.alias}/carrito`;
      case "reclamaciones":
        return `https://geinztech.com/perfil/${info.alias}/libro_reclamaciones`;
      default:
        throw new Error("Tipo de QR desconocido: " + tipo);
    }
  },

  /**
   * Ruta donde vive el QR ya generado de cada tipo:
   * tiendas/{tiendaId}/qr/{tipo}.png
   */
  _qrStoragePath(tipo) {
    return `tiendas/${tiendaId}/qr/${tipo}.png`;
  },

  /**
   * Lee un QR ya generado desde Storage.
   * Devuelve { blob, origen, url } o null si todavía no existe.
   * Los QR viejos (sin metadata) se consideran origen "geinz".
   */
  async _cargarQrGuardado(tipo) {
    try {
      const qrRef = ref(storage, this._qrStoragePath(tipo));
      const [url, meta] = await Promise.all([
        getDownloadURL(qrRef),
        getMetadata(qrRef),
      ]);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("No se pudo leer el QR guardado.");
      return {
        blob: await res.blob(),
        origen: meta.customMetadata?.origen || "geinz",
        url: meta.customMetadata?.url || null,
      };
    } catch (err) {
      return null;
    }
  },

  /**
   * Sube el PNG del QR a Storage guardando con qué link se generó
   * (origen + url) en customMetadata.
   */
  async _guardarQrEnStorage(tipo, blob, origen, url) {
    try {
      const qrRef = ref(storage, this._qrStoragePath(tipo));
      await uploadBytes(qrRef, blob, {
        contentType: "image/png",
        customMetadata: { origen, url },
      });
    } catch (err) {
      console.warn(
        `QrNegocio: no se pudo guardar el QR "${tipo}" en Storage (revisa las Storage Rules).`,
        err,
      );
    }
  },

  /** Markup del estado vacío ("Toca para crear"), reutilizable. */
  _emptyStateHtml() {
    return `
                    <div class="flex h-full w-full flex-col items-center justify-center gap-2.5">
                        <span class="pointer-events-none absolute h-[46%] w-[46%] animate-spin rounded-full border border-dashed border-[#7c4dff]/35 [animation-duration:9s]"></span>
                        <span class="relative flex h-[36px] w-[36px] animate-pulse items-center justify-center rounded-full border border-[#7c4dff]/40 text-[20px] font-light text-[#7c4dff]">+</span>
                        <span class="relative text-[11px] font-semibold tracking-wide text-neutral-500">Toca para crear</span>
                    </div>`;
  },

  /**
   * Pinta un QR (recién generado o cargado desde Storage) dentro
   * de su tile y lo cachea en _estado para que PreviewQr lo use.
   */
  async _mostrarQrEnTile(
    tipo,
    blobOriginal,
    info,
    meta = { origen: "geinz", url: null },
  ) {
    const tile = document.querySelector(`.qr-tile[data-tipo="${tipo}"]`);
    const preview = document.getElementById(`qrPreview${this._cap(tipo)}`);
    const actions = document.getElementById(`qrActions${this._cap(tipo)}`);
    const descarga = document.getElementById(`qrDescarga${this._cap(tipo)}`);
    const objUrlPreview = URL.createObjectURL(blobOriginal);
    preview.innerHTML = `<img src="${objUrlPreview}" alt="QR ${tipo}">`;
    tile.classList.add("has-qr");

    descarga.href = "#";
    descarga.download = `qr-${tipo}-${info.alias}.png`;
    actions.classList.remove("hidden");
    actions.classList.add("flex");

    if (!preview.querySelector(".qr-hd-badge")) {
      preview.insertAdjacentHTML(
        "beforeend",
        `
                        <span class="qr-hd-badge pointer-events-none absolute right-2 top-2 rounded-full border border-[#7c4dff]/40 bg-black/70 px-2 py-[3px] text-[9px] font-bold tracking-wide text-[#c9bcff] backdrop-blur-sm">HD · print</span>
                    `,
      );
    }

    // Cache para la vista previa de descarga (PreviewQr.openNegocio)
    this._estado[tipo] = {
      tipo,
      blobOriginal,
      info,
      origen: meta.origen,
      url: meta.url || this._armarUrl(tipo, info, meta.origen),
    };
  },

  /**
   * Convierte el PNG que devuelve la API en un archivo listo
   * para imprimir (fondo blanco + margen, escalado a QR_PRINT_SIZE).
   */
  async _prepararParaImpresion(blobOriginal) {
    const bitmap = await createImageBitmap(blobOriginal);

    const canvas = document.createElement("canvas");
    canvas.width = QR_PRINT_SIZE;
    canvas.height = QR_PRINT_SIZE;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const inner = Math.round(QR_PRINT_SIZE * (1 - QR_PRINT_MARGIN * 2));
    const offset = Math.round((QR_PRINT_SIZE - inner) / 2);
    ctx.drawImage(bitmap, offset, offset, inner, inner);

    return await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png", 1);
    });
  },

  onTileClick(evt, tipo) {
    const tile = evt.currentTarget;
    if (tile.classList.contains("has-qr")) {
      PreviewQr.openNegocio(tipo);
      return;
    }
    this.generar(tipo);
  },

  async generar(tipo) {
    const tile = document.querySelector(`.qr-tile[data-tipo="${tipo}"]`);
    const preview = document.getElementById(`qrPreview${this._cap(tipo)}`);
    const actions = document.getElementById(`qrActions${this._cap(tipo)}`);

    tile.style.pointerEvents = "none";
    preview.innerHTML = `
    <div class="flex h-full w-full items-center justify-center gap-1.5">
      <div class="qr-loading-dot"></div>
      <div class="qr-loading-dot"></div>
      <div class="qr-loading-dot"></div>
    </div>`;
    actions.classList.add("hidden");
    actions.classList.remove("flex");

    try {
      const info = await this._obtenerInfoTienda();
      const logo = await this._logoBase64();
      await this._cargarModoDominio();

      const origen = this._origenActual();
      const url = this._armarUrl(tipo, info, origen);

      if (!logo) {
        throw new Error(
          `Tu tienda no tiene un logo configurado (img_tienda.logo_tienda). Sube el logo de tu perfil para poder generar el QR.`,
        );
      }

      const payload = {
        url,
        dotShape: "dots",
        onlyQr: true,
        autoColor: true,
        width: QR_REQUEST_SIZE,
        height: QR_REQUEST_SIZE,
        logo,
      };

      const blobOriginal = await encolarLlamadaApiQr(payload);

      await this._mostrarQrEnTile(tipo, blobOriginal, info, { origen, url });
      this._updateStoreChip(info);
      await this._guardarQrEnStorage(tipo, blobOriginal, origen, url);
      this.actualizarAviso();
    } catch (err) {
      preview.innerHTML = `<div class="flex h-full w-full flex-col items-center justify-center gap-1 px-2.5 text-center text-[10.5px] text-red-300">⚠️ ${err.message}</div>`;
      tile.classList.remove("has-qr");
    } finally {
      tile.style.pointerEvents = "auto";
    }
  },

  _updateStoreChip(info) {
    const label = document.getElementById("qrStoreChipLabel");
    if (label) label.textContent = `Negocio: ${info.alias} (${info.localidad})`;
  },

  _cap(tipo) {
    return tipo.charAt(0).toUpperCase() + tipo.slice(1);
  },

  async init() {
    const label = document.getElementById("qrStoreChipLabel");
    let info;

    try {
      info = await this._obtenerInfoTienda();
      if (label)
        label.textContent = `Negocio: ${info.alias} (${info.localidad})`;
    } catch (err) {
      if (label) label.textContent = `Negocio: ${tiendaId}`;
      console.warn("QrNegocio: no se pudo precargar info de tienda.", err);
      return;
    }

    await this._cargarModoDominio();

    const tipos = ["perfil", "carta", "carrito", "reclamaciones"];

    await Promise.all(
      tipos.map(async (tipo) => {
        const preview = document.getElementById(`qrPreview${this._cap(tipo)}`);
        if (preview) {
          preview.innerHTML = `
          <div class="flex h-full w-full items-center justify-center gap-1.5">
            <div class="qr-loading-dot"></div>
            <div class="qr-loading-dot"></div>
            <div class="qr-loading-dot"></div>
          </div>`;
        }

        const guardado = await this._cargarQrGuardado(tipo);

        if (guardado) {
          try {
            await this._mostrarQrEnTile(tipo, guardado.blob, info, {
              origen: guardado.origen,
              url: guardado.url,
            });
            return;
          } catch (err) {
            console.warn(
              `QrNegocio: no se pudo mostrar el QR guardado de "${tipo}".`,
              err,
            );
          }
        }

        if (preview) preview.innerHTML = this._emptyStateHtml();
      }),
    );

    this.actualizarAviso();
  },
};

async function aplicarVisibilidadPorCategoria() {
  let categoria = sessionStorage.getItem("categoriaTienda") || null;
  let modeloNegocio = sessionStorage.getItem("modeloNegocio");

  // Si por algún motivo no llegó desde el panel, la buscamos directo
  if (!categoria || modeloNegocio === null) {
    try {
      const negocioSnap = await getDoc(
        tiendaDoc(localidad, "tiendas", tiendaId),
      );
      if (negocioSnap.exists()) {
        const data = negocioSnap.data();
        categoria = categoria || data.categoria_tienda || null;
        modeloNegocio = data.modelo_negocio === true;
        sessionStorage.setItem("categoriaTienda", categoria || "");
        sessionStorage.setItem("modeloNegocio", String(!!modeloNegocio));
      }
    } catch (err) {
      console.error(
        "❌ No se pudo obtener la categoría/modelo de la tienda.",
        err,
      );
    }
  } else {
    modeloNegocio = modeloNegocio === "true"; // sessionStorage guarda strings
  }

  const esRestaurante =
    (categoria || "")
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase() === "comida y restaurantes";
  if (!esRestaurante) {
    const tileCarta = document.getElementById("qrTileCarta");
    if (tileCarta) tileCarta.style.display = "none";
  }

  // mesasSection depende de categoría Y de modelo_negocio (local físico)
  const mesasSection = document.getElementById("mesasSection");
  if (mesasSection) {
    const debeMostrarMesas = esRestaurante && modeloNegocio === true;
    mesasSection.style.display = debeMostrarMesas ? "" : "none";
  }

  // Libro de reclamaciones: el tile solo aparece si está activo
  // en /footer.libro_reclamaciones de la tienda
  try {
    const info = await QrNegocio._obtenerInfoTienda();
    const tileReclamaciones = document.getElementById("qrTileReclamaciones");
    if (tileReclamaciones) {
      tileReclamaciones.style.display = info.libroReclamaciones ? "" : "none";
    }
  } catch (err) {
    console.warn("No se pudo verificar libro_reclamaciones.", err);
  }

  // Ya se sabe qué tiles/secciones están visibles: recalcula el aviso
  QrNegocio.actualizarAviso();
}
window.QrNegocio = QrNegocio;
QrNegocio.init();
aplicarVisibilidadPorCategoria();

// ================================================================
// MESAS POR LOCAL — módulo aparte, no toca QrNegocio ni su
// carpeta de Storage. Reutiliza QrNegocio._obtenerInfoTienda()
// y QrNegocio._logoBase64() para que los QR de mesa salgan con el
// mismo logo/colores; solo cambia la URL que se codifica.
// ================================================================
const MesasNegocio = {
  _mesas: [], // cache local del último snapshot, ordenado por numero_mesa

  _mesasCollection() {
    return tiendaSubCol(localidad, "tiendas", tiendaId, "mesas");
  },

  _mesaDocRef(docId) {
    return tiendaSubDoc(localidad, "tiendas", tiendaId, "mesas", docId);
  },
  _mesaDocId(numeroMesa) {
    return `mesa_${numeroMesa}`;
  },

  _mesaStoragePath(numeroMesa) {
    return `tiendas/${tiendaId}/mesas/mesa_${numeroMesa}.png`;
  },

  _generarToken(length = 16) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, length);
  },

  _armarUrlMesa(alias, token, origen = QrNegocio._origenActual()) {
    const dominio = QrNegocio._modo?.dominio;
    if (origen === "dominio" && dominio) {
      return `https://${dominio}/-mesa-${token}`;
    }
    return `https://geinztech.com/perfil/${alias}-mesa-${token}`;
  },

  _siguienteNumeroMesa() {
    if (!this._mesas.length) return 1;
    const max = this._mesas.reduce(
      (m, mesa) => Math.max(m, mesa.numero_mesa || 0),
      0,
    );
    return max + 1;
  },

  async _generarImagenQr(url, logo) {
    if (!logo) {
      throw new Error(
        `No se encontró el logo de tu tienda. Sube el logo de tu tienda para poder generar los QR de mesa.`,
      );
    }

    const payload = {
      url,
      dotShape: "dots",
      onlyQr: true,
      autoColor: true,
      width: QR_REQUEST_SIZE,
      height: QR_REQUEST_SIZE,
      logo,
    };

    return await encolarLlamadaApiQr(payload);
  },

  async descargarHoja() {
    if (!this._mesas.length) return;
    const btn = document.getElementById("btnDescargarHoja");
    const original = btn.innerHTML;
    btn.disabled = true;
    const setBtnProgress = (texto) => {
      btn.innerHTML = `
        <span class="flex items-center gap-1.5">
            <span class="qr-loading-dot"></span>
            <span class="qr-loading-dot"></span>
            <span class="qr-loading-dot"></span>
        </span>
        <span class="font-display">${texto}</span>`;
    };
    setBtnProgress("Preparando…");
    try {
      const font = document.getElementById("previewFontSelect").value;
      const size = document.getElementById("previewSizeSelect").value;
      const palette = await PreviewQr._obtenerPaletteDeLogo();
      const info = await QrNegocio._obtenerInfoTienda();

      const stage = document.createElement("div");
      stage.style.position = "fixed";
      stage.style.left = "-9999px";
      stage.style.top = "0";
      document.body.appendChild(stage);

      const DPI = 300;
      const PAGE_W = Math.round(8.5 * DPI);
      const PAGE_H = Math.round(11 * DPI);
      const MARGIN = Math.round(0.25 * DPI);
      const GAP = Math.round(0.15 * DPI);
      const CARD_SCALE = 3;

      const cardCanvases = [];
      let procesadas = 0;
      for (const mesa of this._mesas) {
        setBtnProgress(`Generando ${procesadas + 1} / ${this._mesas.length}…`);
        const card = document.createElement("div");
        card.className = "qrcard";
        card.style.setProperty("--qc-g1", palette.g1);
        card.style.setProperty("--qc-g2", palette.g2);
        card.style.setProperty("--qc-g3", palette.g3);
        card.style.setProperty("--qc-g4", palette.g4);
        card.style.setProperty("--qc-text", palette.text);
        card.style.setProperty("--qc-shadow", palette.shadow);
        card.style.setProperty("--qc-glow1", palette.glow1);
        card.style.setProperty("--qc-glow2", palette.glow2);
        card.style.setProperty("--qc-font", font);
        card.style.setProperty("--qc-size", size);
        card.innerHTML = `
                <div class="qrcard-brand">${(mesa.nombre_alias || `Mesa ${mesa.numero_mesa}`).toUpperCase()}</div>
                <div class="qrcard-frame">
                    <span class="corner tl"></span><span class="corner tr"></span>
                    <span class="corner bl"></span><span class="corner br"></span>
                    <div class="qrcard-qrbox"><img src="${mesa.qr_url}" crossorigin="anonymous"></div>
                </div>
                <div class="qrcard-caption">${info.alias}</div>
                <div class="qrcard-subcaption">Escanea para ver nuestros productos</div>
                <div class="qrcard-watermark">Powered by Geinz</div>`;
        stage.appendChild(card);

        await new Promise((res) => {
          const img = card.querySelector("img");
          img.onload = res;
          img.onerror = res;
        });

        const canvas = await html2canvas(card, {
          scale: CARD_SCALE,
          backgroundColor: "#141317",
          useCORS: true,
        });
        cardCanvases.push(canvas);
        stage.removeChild(card);

        procesadas++;
      }
      document.body.removeChild(stage);
      setBtnProgress("Armando hojas…");
      const cardW = cardCanvases[0].width;
      const cardH = cardCanvases[0].height;
      const cols = Math.max(
        1,
        Math.floor((PAGE_W - MARGIN * 2 + GAP) / (cardW + GAP)),
      );
      const rows = Math.max(
        1,
        Math.floor((PAGE_H - MARGIN * 2 + GAP) / (cardH + GAP)),
      );
      const perPage = cols * rows;
      const totalPages = Math.ceil(cardCanvases.length / perPage);

      const zip = new JSZip();

      for (let p = 0; p < totalPages; p++) {
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = PAGE_W;
        pageCanvas.height = PAGE_H;
        const ctx = pageCanvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, PAGE_W, PAGE_H);

        cardCanvases
          .slice(p * perPage, (p + 1) * perPage)
          .forEach((canvas, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = MARGIN + col * (cardW + GAP);
            const y = MARGIN + row * (cardH + GAP);
            ctx.drawImage(canvas, x, y, cardW, cardH);
            ctx.strokeStyle = "#cccccc";
            ctx.setLineDash([6, 6]);
            ctx.strokeRect(x, y, cardW, cardH);
          });

        const blob = await new Promise((resolve) =>
          pageCanvas.toBlob(resolve, "image/png", 1),
        );
        zip.file(`hoja-qrs-mesas-${p + 1}.png`, blob);
      }

      setBtnProgress("Comprimiendo…");
      const contenidoZip = await zip.generateAsync({ type: "blob" });
      const objUrlZip = URL.createObjectURL(contenidoZip);
      const aZip = document.createElement("a");
      aZip.href = objUrlZip;
      aZip.download = "hojas-qrs-mesas.zip";
      document.body.appendChild(aZip);
      aZip.click();
      aZip.remove();
      URL.revokeObjectURL(objUrlZip);
    } catch (err) {
      console.error(err);
      UI.toast("No se pudo generar la hoja para imprimir.", true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  },

  // Crea UNA mesa: token, url, QR (con el mismo logo que QrNegocio),
  // sube a Storage y escribe el documento en Firestore.
  async _crearMesa({ numeroMesa, alias, info, logo }) {
    const nombreAlias =
      alias && alias.trim() ? alias.trim() : `Mesa ${numeroMesa}`;
    const token = this._generarToken();

    await QrNegocio._cargarModoDominio();
    const origen = QrNegocio._origenActual();
    const url = this._armarUrlMesa(info.alias, token, origen);

    const blob = await this._generarImagenQr(url, logo);

    const storageRef = ref(storage, this._mesaStoragePath(numeroMesa));
    await uploadBytes(storageRef, blob, { contentType: "image/png" });
    const qrUrl = await getDownloadURL(storageRef);

    const docId = this._mesaDocId(numeroMesa);
    await setDoc(this._mesaDocRef(docId), {
      numero_mesa: numeroMesa,
      nombre_alias: nombreAlias,
      token_seguridad: token,
      qr_url: qrUrl,
      qr_origen: origen,
      creado_en: serverTimestamp(),
    });

    return docId;
  },

  async generarMultiples(cantidad) {
    cantidad = Math.max(1, Math.min(200, parseInt(cantidad, 10) || 0));
    const info = await QrNegocio._obtenerInfoTienda();
    const logo = await QrNegocio._logoBase64();

    if (!logo) {
      UI.toast(
        "No se encontró el logo de tu tienda. Súbelo antes de generar los QR de mesa.",
        true,
      );
      return;
    }

    const inicio = this._siguienteNumeroMesa();

    const progressWrap = document.getElementById("progressMultiples");
    const progressBar = document.getElementById("progressBarMultiples");
    const progressLabel = document.getElementById("progressLabelMultiples");
    const btnConfirmar = document.getElementById("btnConfirmarMultiples");

    progressWrap.classList.remove("hidden");
    btnConfirmar.disabled = true;
    btnConfirmar.classList.add("opacity-50", "cursor-not-allowed");

    let creadas = 0;
    for (let i = 0; i < cantidad; i++) {
      const numeroMesa = inicio + i;
      try {
        await this._crearMesa({ numeroMesa, alias: null, info, logo });
      } catch (err) {
        console.warn(
          `MesasNegocio: no se pudo crear la mesa ${numeroMesa}.`,
          err,
        );
      }
      creadas++;
      const pct = Math.round((creadas / cantidad) * 100);
      progressBar.style.width = `${pct}%`;
      progressLabel.textContent = `Generando ${creadas} / ${cantidad}…`;
    }

    progressWrap.classList.add("hidden");
    btnConfirmar.disabled = false;
    btnConfirmar.classList.remove("opacity-50", "cursor-not-allowed");

    UI.closeModal("modalMultiples");
    UI.toast(
      `${creadas} mesa${creadas === 1 ? "" : "s"} generada${creadas === 1 ? "" : "s"} correctamente.`,
    );
  },

  async agregarMesa(alias) {
    const info = await QrNegocio._obtenerInfoTienda();
    const logo = await QrNegocio._logoBase64();

    if (!logo) {
      UI.toast(
        "No se encontró el logo de tu tienda. Súbelo antes de generar los QR de mesa.",
        true,
      );
      return;
    }

    const numeroMesa = this._siguienteNumeroMesa();
    await this._crearMesa({ numeroMesa, alias, info, logo });
    UI.closeModal("modalAgregar");
    UI.toast(`Mesa ${numeroMesa} creada correctamente.`);
  },

  async renombrarMesa(docId, nuevoAlias) {
    const alias = (nuevoAlias || "").trim();
    if (!alias) return;
    await updateDoc(this._mesaDocRef(docId), { nombre_alias: alias });
    UI.toast("Alias actualizado.");
  },

  // Cambia el token de seguridad: invalida el QR anterior y
  // regenera la imagen, sobreescribiendo el mismo archivo.
  async regenerarMesa(docId) {
    const mesa = this._mesas.find((m) => m.id === docId);
    if (!mesa) return;

    const info = await QrNegocio._obtenerInfoTienda();
    const logo = await QrNegocio._logoBase64();
    await QrNegocio._cargarModoDominio();
    const origen = QrNegocio._origenActual();

    const nuevoToken = this._generarToken();
    const url = this._armarUrlMesa(info.alias, nuevoToken, origen);
    const blob = await this._generarImagenQr(url, logo);

    const storageRef = ref(storage, this._mesaStoragePath(mesa.numero_mesa));
    await uploadBytes(storageRef, blob, { contentType: "image/png" });
    const base = await getDownloadURL(storageRef);
    // "&v=" evita que el navegador muestre el QR viejo en caché
    const qrUrl = `${base}${base.includes("?") ? "&" : "?"}v=${Date.now()}`;

    await updateDoc(this._mesaDocRef(docId), {
      token_seguridad: nuevoToken,
      qr_url: qrUrl,
      qr_origen: origen,
    });

    UI.toast(
      `QR de "${mesa.nombre_alias}" regenerado. El enlace anterior ya no funciona.`,
    );
  },

  // Mantiene el MISMO token y solo cambia el link base
  // (Geinz <-> dominio propio). Lo usa el botón del aviso.
  async actualizarOrigenMesa(docId) {
    const mesa = this._mesas.find((m) => m.id === docId);
    if (!mesa) return;

    const info = await QrNegocio._obtenerInfoTienda();
    const logo = await QrNegocio._logoBase64();
    await QrNegocio._cargarModoDominio();
    const origen = QrNegocio._origenActual();

    const url = this._armarUrlMesa(info.alias, mesa.token_seguridad, origen);
    const blob = await this._generarImagenQr(url, logo);

    const storageRef = ref(storage, this._mesaStoragePath(mesa.numero_mesa));
    await uploadBytes(storageRef, blob, { contentType: "image/png" });
    const base = await getDownloadURL(storageRef);
    const qrUrl = `${base}${base.includes("?") ? "&" : "?"}v=${Date.now()}`;

    await updateDoc(this._mesaDocRef(docId), {
      qr_url: qrUrl,
      qr_origen: origen,
    });
  },

  async eliminarMesa(docId) {
    const mesa = this._mesas.find((m) => m.id === docId);
    if (!mesa) return;
    try {
      await deleteObject(ref(storage, this._mesaStoragePath(mesa.numero_mesa)));
    } catch (err) {
      console.warn(
        "MesasNegocio: no se pudo borrar la imagen del QR en Storage.",
        err,
      );
    }
    await deleteDoc(this._mesaDocRef(docId));
    UI.toast(`Mesa "${mesa.nombre_alias}" eliminada.`);
  },

  async descargarTodas() {
    if (!this._mesas.length) return;
    const btn = document.getElementById("btnDescargarTodo");
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="font-display">Preparando ZIP…</span>`;

    try {
      const zip = new JSZip();
      await Promise.all(
        this._mesas.map(async (mesa) => {
          try {
            const res = await fetch(mesa.qr_url);
            const blobOriginal = await res.blob();
            const blobHD = await QrNegocio._prepararParaImpresion(blobOriginal);
            const nombreArchivo = `qr-${mesa.numero_mesa}-${this._slug(mesa.nombre_alias)}.png`;
            zip.file(nombreArchivo, blobHD);
          } catch (err) {
            console.warn(
              `MesasNegocio: no se pudo incluir la mesa ${mesa.numero_mesa} en el ZIP.`,
              err,
            );
          }
        }),
      );
      const contenido = await zip.generateAsync({ type: "blob" });
      const objUrl = URL.createObjectURL(contenido);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = "qrs-mesas.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      UI.toast("No se pudo generar el ZIP.", true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  },

  _slug(text) {
    return (text || "mesa")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  },

  async init() {
    const q = query(this._mesasCollection(), orderBy("numero_mesa"));
    onSnapshot(
      q,
      (snap) => {
        this._mesas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        UI.renderMesas(this._mesas);
      },
      (err) => {
        console.error("MesasNegocio: error al escuchar mesas.", err);
        UI.toast("No se pudieron cargar las mesas.", true);
      },
    );
  },
};

const UI = {
  renderMesas(mesas) {
    const grid = document.getElementById("mesasGrid");
    const empty = document.getElementById("mesasEmptyState");
    const countLabel = document.getElementById("mesasCountLabel");
    const btnDescargarHoja = document.getElementById("btnDescargarHoja");
    countLabel.textContent = `${mesas.length} mesa${mesas.length === 1 ? "" : "s"}`;
    btnDescargarHoja.disabled = mesas.length === 0;

    // las mesas cambiaron: recalcula el aviso de dominio
    QrNegocio.actualizarAviso();

    if (!mesas.length) {
      grid.innerHTML = "";
      empty.classList.remove("hidden");
      empty.classList.add("flex");
      return;
    }
    empty.classList.add("hidden");
    empty.classList.remove("flex");

    grid.innerHTML = mesas.map((mesa) => this._cardHtml(mesa)).join("");
    this._bindCardEvents();
  },

  _cardHtml(mesa) {
    return `
    <div class="mesa-card group relative flex flex-col gap-2.5 overflow-hidden rounded-[18px] border border-white/[0.07] bg-white/[0.025] p-3 transition-colors hover:border-[#7c4dff]/35 hover:bg-white/[0.045]" data-doc-id="${mesa.id}">
        <div class="mesa-preview relative aspect-square overflow-hidden rounded-[12px] border border-white/10 bg-white cursor-pointer" data-action="ver">
            <div class="qr-skeleton"></div>
            <img src="${mesa.qr_url}" alt="QR ${mesa.nombre_alias}" loading="lazy"
     onload="this.classList.add('loaded'); if(this.previousElementSibling) this.previousElementSibling.remove();"
     onerror="if(this.previousElementSibling) this.previousElementSibling.remove(); this.replaceWith(Object.assign(document.createElement('div'), {className:'flex h-full w-full items-center justify-center text-[10px] text-red-400', textContent:'⚠️ Error al cargar'}));">
        </div>
                    <div class="flex items-center justify-between gap-1">
                        <input type="text" value="${this._escapeAttr(mesa.nombre_alias)}"
                            class="mesa-alias-input w-full min-w-0 truncate rounded-[8px] border border-transparent bg-transparent px-1.5 py-1 text-[12.5px] font-semibold text-white outline-none transition-colors hover:border-white/10 focus:border-[#7c4dff]/50 focus:bg-white/[0.05]"
                            data-action="renombrar" />
                    </div>
                    <div class="text-[10.5px] text-neutral-500">Mesa #${mesa.numero_mesa}</div>

                    <div class="flex items-center gap-1.5">
                        <button class="flex h-8 flex-1 items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.04] text-[10.5px] font-semibold text-neutral-300 hover:bg-white/[0.09]" data-action="copiar" title="Copiar link">🔗</button>
                        <button class="flex h-8 flex-1 items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.04] text-[10.5px] font-semibold text-neutral-300 hover:bg-white/[0.09]" data-action="regenerar" title="Regenerar QR">↻</button>
                        <button class="flex h-8 flex-1 items-center justify-center rounded-[8px] border border-red-500/20 bg-red-500/[0.06] text-[10.5px] font-semibold text-red-300 hover:bg-red-500/[0.12]" data-action="eliminar" title="Eliminar mesa">🗑</button>
                    </div>
                </div>`;
  },

  _escapeAttr(str) {
    return String(str || "").replace(/"/g, "&quot;");
  },

  _bindCardEvents() {
    document.querySelectorAll("#mesasGrid .mesa-card").forEach((card) => {
      const docId = card.dataset.docId;
      const mesa = MesasNegocio._mesas.find((m) => m.id === docId);
      if (!mesa) return;

      card
        .querySelector('[data-action="ver"]')
        .addEventListener("click", () => PreviewQr.openMesa(mesa));

      card
        .querySelector('[data-action="copiar"]')
        .addEventListener("click", (e) => {
          e.stopPropagation();
          this.copiarLinkMesa(mesa);
        });

      card
        .querySelector('[data-action="regenerar"]')
        .addEventListener("click", async (e) => {
          e.stopPropagation();
          if (
            !confirm(
              `¿Regenerar el QR de "${mesa.nombre_alias}"? El enlace/QR anterior dejará de funcionar.`,
            )
          )
            return;
          await this._conEstadoCarga(card, () =>
            MesasNegocio.regenerarMesa(docId),
          );
        });

      card
        .querySelector('[data-action="eliminar"]')
        .addEventListener("click", async (e) => {
          e.stopPropagation();
          if (
            !confirm(
              `¿Eliminar la mesa "${mesa.nombre_alias}"? Esta acción no se puede deshacer.`,
            )
          )
            return;
          await MesasNegocio.eliminarMesa(docId);
        });

      const aliasInput = card.querySelector('[data-action="renombrar"]');
      aliasInput.addEventListener("click", (e) => e.stopPropagation());
      aliasInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") e.target.blur();
      });
      aliasInput.addEventListener("blur", async (e) => {
        const nuevo = e.target.value.trim();
        if (nuevo && nuevo !== mesa.nombre_alias) {
          await MesasNegocio.renombrarMesa(docId, nuevo);
        } else {
          e.target.value = mesa.nombre_alias;
        }
      });
    });
  },

  async _conEstadoCarga(card, fn) {
    const preview = card.querySelector(".mesa-preview");
    const original = preview.innerHTML;
    preview.innerHTML = `
                    <div class="flex h-full w-full items-center justify-center gap-1.5 bg-[#050506]">
                        <div class="qr-loading-dot"></div><div class="qr-loading-dot"></div><div class="qr-loading-dot"></div>
                    </div>`;
    try {
      await fn();
    } catch (err) {
      console.error(err);
      this.toast("Ocurrió un error. Intenta de nuevo.", true);
      preview.innerHTML = original;
    }
  },

  async copiarLinkMesa(mesa) {
    try {
      const info = await QrNegocio._obtenerInfoTienda();
      await QrNegocio._cargarModoDominio();
      const url = MesasNegocio._armarUrlMesa(
        info.alias,
        mesa.token_seguridad,
        mesa.qr_origen || "geinz",
      );
      await navigator.clipboard.writeText(url);
      this.toast("Enlace copiado.");
    } catch (err) {
      this.toast("No se pudo copiar el enlace.", true);
    }
  },

  openModal(id) {
    const modal = document.getElementById(id);
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    // fuerza reflow para que la transición se vea (Safari/iOS)
    void modal.offsetWidth;
    requestAnimationFrame(() => {
      modal.classList.add("modal-open");
    });
  },
  closeModal(id) {
    const modal = document.getElementById(id);
    modal.classList.remove("modal-open");

    const finalizar = () => {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    };

    let yaFinalizo = false;
    const onEnd = (e) => {
      if (e.target !== modal || yaFinalizo) return;
      yaFinalizo = true;
      modal.removeEventListener("transitionend", onEnd);
      finalizar();
    };
    modal.addEventListener("transitionend", onEnd);

    // fallback si transitionend no dispara
    setTimeout(() => {
      if (!yaFinalizo) {
        yaFinalizo = true;
        finalizar();
      }
    }, 320);
  },

  toast(msg, isError = false) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.style.borderColor = isError
      ? "rgba(248,113,113,.35)"
      : "rgba(255,255,255,.1)";
    el.classList.remove("opacity-0", "translate-y-4");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.classList.add("opacity-0", "translate-y-4");
    }, 2600);
  },
};

// ================================================================
// PREVIEW QR — modal compartido de "vista previa + descarga",
// usado tanto por los QR de negocio como por los QR de mesa.
// ================================================================
const PreviewQr = {
  _state: null,
  _paletteCache: null,

  _fixedLabels: {
    perfil: { brand: "Perfil", sub: "Escanea para ver nuestro perfil" },
    carta: { brand: "CARTA DIGITAL", sub: "Escanea para ver nuestro menú" },
    carrito: { brand: "PRODUCTOS", sub: "Escanea para pedir directo" },
    reclamaciones: {
      brand: "LIBRO DE RECLAMACIONES",
      sub: "Escanea para presentar tu reclamo",
    },
  },

  async openNegocio(tipo) {
    const estado = QrNegocio._estado[tipo];
    if (!estado) return;

    const info = estado.info;
    const fixed = this._fixedLabels[tipo] || { brand: "SCAN ME", sub: "" };

    this._state = {
      mode: "negocio",
      tipo,
      editable: true,
      brand: fixed.brand,
      caption: info.alias,
      sub: fixed.sub,
      urlLink: estado.url, // el link con el que realmente se generó ese QR
      qrObjectUrl: URL.createObjectURL(estado.blobOriginal),
      filenameBase: `qr-${tipo}-${info.alias}`,
    };

    await this._render();

    document.getElementById("previewInputBrand").value = this._state.brand;
    document.getElementById("previewInputCaption").value = this._state.caption;
    document.getElementById("previewInputSub").value = this._state.sub;

    const fields = document.getElementById("previewFields");
    fields.classList.remove("hidden");
    fields.classList.add("flex");

    UI.openModal("modalPreviewQr");
  },

  async openMesa(mesa) {
    const info = await QrNegocio._obtenerInfoTienda();
    await QrNegocio._cargarModoDominio();
    const url = MesasNegocio._armarUrlMesa(
      info.alias,
      mesa.token_seguridad,
      mesa.qr_origen || "geinz",
    );

    let qrObjectUrl = mesa.qr_url;
    try {
      const res = await fetch(mesa.qr_url);
      const blob = await res.blob();
      qrObjectUrl = URL.createObjectURL(blob);
    } catch (err) {
      console.warn(
        "PreviewQr: no se pudo pre-cargar el QR de la mesa como blob.",
        err,
      );
    }

    this._state = {
      mode: "mesa",
      mesaDocId: mesa.id,
      editable: true,
      brand: (mesa.nombre_alias || `Mesa ${mesa.numero_mesa}`).toUpperCase(),
      caption: info.alias,
      sub: "Escanea para ver nuestros productos",
      urlLink: url,
      qrObjectUrl,
      filenameBase: `qr-mesa-${mesa.numero_mesa}-${MesasNegocio._slug(mesa.nombre_alias)}`,
    };

    await this._render();

    document.getElementById("previewInputBrand").value = this._state.brand;
    document.getElementById("previewInputCaption").value = this._state.caption;
    document.getElementById("previewInputSub").value = this._state.sub;

    const fields = document.getElementById("previewFields");
    fields.classList.remove("hidden");
    fields.classList.add("flex");

    UI.openModal("modalPreviewQr");
  },

  async _render() {
    const s = this._state;
    if (!s) return;

    const card = document.getElementById("previewCard");
    const palette = await this._obtenerPaletteDeLogo();
    card.style.setProperty("--qc-g1", palette.g1);
    card.style.setProperty("--qc-g2", palette.g2);
    card.style.setProperty("--qc-g3", palette.g3);
    card.style.setProperty("--qc-g4", palette.g4);
    card.style.setProperty("--qc-text", palette.text);
    card.style.setProperty("--qc-shadow", palette.shadow);
    card.style.setProperty("--qc-glow1", palette.glow1);
    card.style.setProperty("--qc-glow2", palette.glow2);
    card.style.setProperty(
      "--qc-font",
      document.getElementById("previewFontSelect").value,
    );
    card.style.setProperty(
      "--qc-size",
      document.getElementById("previewSizeSelect").value,
    );

    document.getElementById("previewBrand").textContent = s.brand || "SCAN ME";
    document.getElementById("previewCaption").textContent = s.caption || "";
    document.getElementById("previewSub").textContent = s.sub || "";
    document.getElementById("previewQrImg").src = s.qrObjectUrl;
    document.getElementById("previewLink").textContent = s.urlLink;
  },

  // Toma el color predominante real del logo y arma con él 4 tonos +
  // texto + sombras. Se cachea: solo se calcula una vez por visita.
  async _obtenerPaletteDeLogo() {
    if (this._paletteCache) return this._paletteCache;

    const fallback = {
      g1: "#7c4dff",
      g2: "#a855f7",
      g3: "#ff4d8d",
      g4: "#ff9f4d",
      text: "#d9cfff",
      shadow: "rgba(255,77,141,.4)",
      glow1: "rgba(255,77,141,.22)",
      glow2: "rgba(124,77,255,.22)",
    };

    const logoDataUrl = await QrNegocio._logoBase64();
    if (!logoDataUrl) {
      this._paletteCache = fallback;
      return fallback;
    }

    const base = await this._colorDominanteDeImagen(logoDataUrl);
    if (!base) {
      this._paletteCache = fallback;
      return fallback;
    }

    const dark = this._shade(base, -0.35);
    const light = this._shade(base, 0.4);

    this._paletteCache = {
      g1: dark,
      g2: base,
      g3: this._lerp(base, light, 0.5),
      g4: light,
      text: this._shade(base, 0.55),
      shadow: this._toRgba(base, 0.45),
      glow1: this._toRgba(base, 0.25),
      glow2: this._toRgba(dark, 0.25),
    };
    return this._paletteCache;
  },

  _colorDominanteDeImagen(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const w = (canvas.width = Math.min(
            img.naturalWidth || img.width,
            120,
          ));
          const h = (canvas.height = Math.min(
            img.naturalHeight || img.height,
            120,
          ));
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          const { data } = ctx.getImageData(0, 0, w, h);
          const counts = {};
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i],
              g = data[i + 1],
              b = data[i + 2],
              a = data[i + 3];
            if (a < 128) continue;
            const brightness = (r + g + b) / 3;
            if (brightness > 246 || brightness < 12) continue;
            const key = [
              Math.round(r / 16) * 16,
              Math.round(g / 16) * 16,
              Math.round(b / 16) * 16,
            ].join(",");
            counts[key] = (counts[key] || 0) + 1;
          }
          const best = Object.keys(counts).sort(
            (a, b) => counts[b] - counts[a],
          )[0];
          if (!best) return resolve(null);
          resolve(
            "#" +
              best
                .split(",")
                .map((v) => Number(v).toString(16).padStart(2, "0"))
                .join(""),
          );
        } catch (err) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  },

  _shade(hex, percent) {
    const f = hex.replace("#", "");
    const R = parseInt(f.substring(0, 2), 16),
      G = parseInt(f.substring(2, 4), 16),
      B = parseInt(f.substring(4, 6), 16);
    const t = percent < 0 ? 0 : 255;
    const p = Math.min(1, Math.abs(percent));
    const nr = Math.round((t - R) * p) + R,
      ng = Math.round((t - G) * p) + G,
      nb = Math.round((t - B) * p) + B;
    return (
      "#" + [nr, ng, nb].map((v) => v.toString(16).padStart(2, "0")).join("")
    );
  },

  _lerp(hexA, hexB, t) {
    const a = hexA.replace("#", ""),
      b = hexB.replace("#", "");
    const ar = parseInt(a.substring(0, 2), 16),
      ag = parseInt(a.substring(2, 4), 16),
      ab = parseInt(a.substring(4, 6), 16);
    const br = parseInt(b.substring(0, 2), 16),
      bg = parseInt(b.substring(2, 4), 16),
      bb = parseInt(b.substring(4, 6), 16);
    return (
      "#" +
      [
        Math.round(ar + (br - ar) * t),
        Math.round(ag + (bg - ag) * t),
        Math.round(ab + (bb - ab) * t),
      ]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("")
    );
  },

  _toRgba(hex, a) {
    const c = hex.replace("#", "");
    const r = parseInt(c.substring(0, 2), 16),
      g = parseInt(c.substring(2, 4), 16),
      b = parseInt(c.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  },

  onStyleChange() {
    if (!this._state) return;
    this._render();
  },

  onInputChange() {
    if (!this._state || !this._state.editable) return;
    this._state.brand =
      document.getElementById("previewInputBrand").value.trim() || "SCAN ME";
    this._state.caption = document
      .getElementById("previewInputCaption")
      .value.trim();
    this._state.sub = document.getElementById("previewInputSub").value.trim();
    this._render();
  },

  async copiarLink() {
    if (!this._state) return;
    try {
      await navigator.clipboard.writeText(this._state.urlLink);
      UI.toast("Enlace copiado.");
    } catch (err) {
      UI.toast("No se pudo copiar el enlace.", true);
    }
  },

  async descargar() {
    if (!this._state) return;
    const btn = document.getElementById("btnDescargarPreview");
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="font-display">Generando…</span>`;

    try {
      const node = document.getElementById("previewCard");
      const canvas = await html2canvas(node, {
        scale: 4,
        backgroundColor: null,
        useCORS: true,
      });
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png", 1),
      );
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `${this._state.filenameBase}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      console.error(err);
      UI.toast("No se pudo generar la imagen para descargar.", true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  },

  async regenerar() {
    if (!this._state) return;

    if (this._state.mode === "negocio") {
      UI.closeModal("modalPreviewQr");
      await QrNegocio.generar(this._state.tipo);
      await this.openNegocio(this._state.tipo);
      return;
    }

    if (!confirm("¿Regenerar este QR? El enlace anterior dejará de funcionar."))
      return;
    try {
      await MesasNegocio.regenerarMesa(this._state.mesaDocId);
      const mesa = MesasNegocio._mesas.find(
        (m) => m.id === this._state.mesaDocId,
      );
      if (mesa) await this.openMesa(mesa);
    } catch (err) {
      UI.toast(err.message || "No se pudo regenerar el QR.", true);
    }
  },
};

window.MesasNegocio = MesasNegocio;
window.UI = UI;
window.PreviewQr = PreviewQr;
MesasNegocio.init();

document
  .getElementById("btnGenerarMultiples")
  .addEventListener("click", () => UI.openModal("modalMultiples"));
document
  .getElementById("btnAgregarMesa")
  .addEventListener("click", () => UI.openModal("modalAgregar"));
document
  .getElementById("btnDescargarHoja")
  .addEventListener("click", () => MesasNegocio.descargarHoja());
document.querySelectorAll("[data-close-modal]").forEach((btn) => {
  btn.addEventListener("click", () => UI.closeModal(btn.dataset.closeModal));
});
document
  .querySelectorAll("#modalMultiples, #modalAgregar, #modalPreviewQr")
  .forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) UI.closeModal(modal.id);
    });
  });

document
  .getElementById("btnConfirmarMultiples")
  .addEventListener("click", () => {
    const cantidad = document.getElementById("inputCantidadMesas").value;
    MesasNegocio.generarMultiples(cantidad);
  });

document
  .getElementById("btnConfirmarAgregar")
  .addEventListener("click", async () => {
    const alias = document.getElementById("inputAliasMesa").value;
    const btn = document.getElementById("btnConfirmarAgregar");
    const label = document.getElementById("btnConfirmarAgregarLabel");

    btn.disabled = true;
    label.innerHTML = `
        <span class="flex items-center gap-1.5">
            <span class="qr-loading-dot" style="background:#d4caff"></span>
            <span class="qr-loading-dot" style="background:#d4caff"></span>
            <span class="qr-loading-dot" style="background:#d4caff"></span>
        </span>`;

    try {
      await MesasNegocio.agregarMesa(alias);
      document.getElementById("inputAliasMesa").value = "";
    } catch (err) {
      UI.toast(err.message || "No se pudo crear la mesa.", true);
    } finally {
      btn.disabled = false;
      label.textContent = "Agregar";
    }
  });

document
  .getElementById("previewInputBrand")
  .addEventListener("input", () => PreviewQr.onInputChange());
document
  .getElementById("previewInputCaption")
  .addEventListener("input", () => PreviewQr.onInputChange());
document
  .getElementById("previewInputSub")
  .addEventListener("input", () => PreviewQr.onInputChange());
document
  .getElementById("previewFontSelect")
  .addEventListener("change", () => PreviewQr.onStyleChange());
document
  .getElementById("previewSizeSelect")
  .addEventListener("change", () => PreviewQr.onStyleChange());
document
  .getElementById("btnCopiarPreviewLink")
  .addEventListener("click", () => PreviewQr.copiarLink());
document
  .getElementById("btnDescargarPreview")
  .addEventListener("click", () => PreviewQr.descargar());
document
  .getElementById("btnRegenerarPreview")
  .addEventListener("click", () => PreviewQr.regenerar());

// Botón del aviso de dominio (Regenerar con mi dominio / con Geinz)
document
  .getElementById("btnRegenerarPorDominio")
  ?.addEventListener("click", () => QrNegocio.regenerarPorCambioDeDominio());