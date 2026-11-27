// ═══════════════════════════════════════════════════════════════════
//  panel_perfil.js  (UNIFICADO: perfil + cuenta/renovación + horario)
//  Arriba: lo que usa esta pantalla.
//  Abajo : lo que pasa datos a iframes / ventana padre.
// ═══════════════════════════════════════════════════════════════════
import { db, storage } from "../db/db.js";
import { tiendaDoc, tiendaSubDoc, tiendaServiciosDoc } from "../rutas/rutas.js";
import {
  initializeApp,
  getApps,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  doc,
  onSnapshot,
  updateDoc,
  getDoc,
  getDocs,
  collection,
  getFirestore,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ─────────────────────────────────────────────
//  PARÁMETROS DE URL / SESSION
// ─────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const tiendaId = params.get("id") || sessionStorage.getItem("tiendaId");
const localidad =
  params.get("localidad") || sessionStorage.getItem("localidad");
const departamentoTienda =
  params.get("departamento") || sessionStorage.getItem("departamento") || "";
const provinciaTienda =
  params.get("provincia") || sessionStorage.getItem("provincia") || "";

if (!tiendaId || !localidad) {
  console.warn("⚠️ Parámetros inválidos, redirigiendo al login...");
  window.location.href = "../login/index";
}

window.APP_STATE = { tienda: null };

// ─────────────────────────────────────────────
//  TOAST ÚNICO (usa #toast si existe, si no lo crea)
// ─────────────────────────────────────────────
let _toastTimer = null;
function mostrarToast(msg, ms = 2500) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t._dyn = true;
    t.style.cssText =
      "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1a2e;color:#fff;padding:12px 20px;border-radius:14px;font-size:14px;z-index:100000;opacity:0;transition:opacity .3s;pointer-events:none;";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  if (t._dyn) t.style.opacity = "1";
  else t.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    if (t._dyn) t.style.opacity = "0";
    else t.classList.remove("show");
  }, ms);
}

// ─────────────────────────────────────────────
//  GEOFENCING
// ─────────────────────────────────────────────
const GeofencingManager = {
  _zonaSur: [
    [-77.7586301, -10.7478916],
    [-77.764555, -10.7503904],
    [-77.7700057, -10.7526507],
    [-77.77688094997941, -10.74238012141042],
    [-77.7717891, -10.737864],
    [-77.7564977, -10.7367506],
    [-77.7542475, -10.7412584],
    [-77.7602514, -10.74427],
    [-77.7586301, -10.7478916],
  ],
  _sonaPlayera: [
    [-77.7679053252519, -10.757941967817928],
    [-77.7628337, -10.7559458],
    [-77.7613565, -10.7567195],
    [-77.75655838530102, -10.766302143389424],
    [-77.7620085, -10.7703684],
    [-77.7679053252519, -10.757941967817928],
  ],
  _sonaCentricaPanamericana: [
    [-77.76019035538333, -10.744316585480519],
    [-77.7532785, -10.7406811],
    [-77.7493425, -10.7537332],
    [-77.7558306, -10.7540662],
    [-77.76019035538333, -10.744316585480519],
  ],
  _panamericanaNorte: [
    [-77.7532395, -10.7407583],
    [-77.74811386801767, -10.738775530699925],
    [-77.7430896, -10.7504602],
    [-77.7463849, -10.7523272],
    [-77.7493232, -10.7537259],
    [-77.7532395, -10.7407583],
  ],
  _zonaCentro: [
    [-77.76538442901771, -10.750732084787856],
    [-77.7586254, -10.7478992],
    [-77.7558059, -10.7540882],
    [-77.7594191, -10.755945],
    [-77.761217, -10.7568464],
    [-77.76314511416147, -10.755942593844523],
    [-77.76538442901771, -10.750732084787856],
  ],
  _entrePlayaSurCentro: [
    [-77.76999855079166, -10.752634205967098],
    [-77.7653824, -10.7507547],
    [-77.7631347, -10.7559814],
    [-77.7650495, -10.756788],
    [-77.7680039, -10.7580106],
    [-77.76999855079166, -10.752634205967098],
  ],
  _zonaNorte: [
    [-77.7613271, -10.7568066],
    [-77.759436, -10.755962],
    [-77.7558203, -10.7541111],
    [-77.75085405255727, -10.753849853980455],
    [-77.74711030635795, -10.762560781158172],
    [-77.75658461692613, -10.76649065099977],
    [-77.7613271, -10.7568066],
  ],

  esPuntoEnPoligono(latitud, longitud, poligono) {
    let dentro = false;
    let j = poligono.length - 1;
    for (let i = 0; i < poligono.length; i++) {
      const xi = poligono[i][0];
      const yi = poligono[i][1];
      const xj = poligono[j][0];
      const yj = poligono[j][1];
      const intersecta =
        yi > latitud !== yj > latitud &&
        longitud < ((xj - xi) * (latitud - yi)) / (yj - yi) + xi;
      if (intersecta) dentro = !dentro;
      j = i;
    }
    return dentro;
  },

  obtenerNombreZona(latitud, longitud) {
    if (this.esPuntoEnPoligono(latitud, longitud, this._zonaSur))
      return "Barranca - Entrada y salida zona sur";
    if (this.esPuntoEnPoligono(latitud, longitud, this._sonaPlayera))
      return "Barranca - Zona playera";
    if (
      this.esPuntoEnPoligono(latitud, longitud, this._sonaCentricaPanamericana)
    )
      return "Barranca - Zona céntrica";
    if (this.esPuntoEnPoligono(latitud, longitud, this._panamericanaNorte))
      return "Barranca - Salida y entrada, Panamericana Norte";
    if (this.esPuntoEnPoligono(latitud, longitud, this._zonaCentro))
      return "Barranca - Zona céntrica";
    if (this.esPuntoEnPoligono(latitud, longitud, this._entrePlayaSurCentro))
      return "Barranca - Entre zona playera, salida sur y zona céntrica";
    if (this.esPuntoEnPoligono(latitud, longitud, this._zonaNorte))
      return "Barranca - Salida y entrada zona norte";
    return "";
  },
};

// ═════════════════════════════════════════════
//  PANEL PERFIL
// ═════════════════════════════════════════════
window.PanelPerfil = {
  // ── Estado ──────────────────────────────────
  currentData: {},
  _prevData: {},
  _firstLoad: true,
  _originalValues: {},
  _originalSubcats: [],
  _pendingLat: null,
  _pendingLng: null,
  _pendingZona: null,
  selectedCat: "",
  selectedSubcats: [],
  categoriasDB: {},
  map: null,
  mapMarker: null,
  mapMarkerActual: null,
  _PAGO_CONFIG: {
    yape: { digits: 9 },
    plin: { digits: 9 },
    agora: { digits: 9 },
    visa_mastercard: { digits: 20 },
  },
  _pagoQrPending: {},

  TIENDA_ID: tiendaId,
  LOCALIDAD_TIENDA: localidad,
  DEPARTAMENTO_TIENDA: departamentoTienda,
  PROVINCIA_TIENDA: provinciaTienda,
  TIENDA_REF: null,

  // ═══════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════
  init() {
    if (!tiendaId || !localidad) return;
    setTimeout(() => this._quitarSkeleton({}), 10000); // nunca se queda pegado
    this.TIENDA_REF = tiendaSubDoc(localidad, "tiendas", tiendaId);
    this._bindEvents();
    this._injectFieldSaveBtnStyles();
    this._bindBuscadorDireccion();
    this._initRealtime();
  },

  showToast(msg) {
    mostrarToast(msg);
  },

  // Copia datos al doc de "lugares" (buscador). Si falla no rompe el guardado principal.
  async _syncLugar(data) {
    try {
      await updateDoc(doc(db, "lugares", this.TIENDA_ID), data);
      return true;
    } catch (e) {
      console.warn("No se pudo sincronizar 'lugares':", e.code || e.message);
      return false;
    }
  },

  // ═══════════════════════════════════════════
  //  COLORES DE LA MARCA
  // ═══════════════════════════════════════════
  _rgbToHex({ r, g, b }) {
    return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  },
  _hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  },

  // Extrae hasta 8 colores distintos del logo
  _extraerPaleta(src, max = 8) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const S = 100;
          const c = document.createElement("canvas");
          c.width = c.height = S;
          const ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0, S, S);
          const d = ctx.getImageData(0, 0, S, S).data;

          const build = (estricto) => {
            const bk = {};
            for (let i = 0; i < d.length; i += 4) {
              const r = d[i],
                g = d[i + 1],
                b = d[i + 2],
                a = d[i + 3];
              if (a < 128) continue;
              const mx = Math.max(r, g, b),
                mn = Math.min(r, g, b);
              const l = (mx + mn) / 510;
              if (l < 0.06 || l > 0.95) continue;
              const s =
                mx === mn ? 0 : (mx - mn) / (255 - Math.abs(mx + mn - 255));
              if (estricto && s < 0.25) continue;
              const k = `${r >> 4},${g >> 4},${b >> 4}`;
              const o = bk[k] || (bk[k] = { n: 0, r: 0, g: 0, b: 0 });
              o.n++;
              o.r += r;
              o.g += g;
              o.b += b;
            }
            return Object.values(bk)
              .sort((x, y) => y.n - x.n)
              .map((o) => ({
                r: Math.round(o.r / o.n),
                g: Math.round(o.g / o.n),
                b: Math.round(o.b / o.n),
              }));
          };

          let lista = build(true);
          if (lista.length < 3) lista = lista.concat(build(false));
          const out = [];
          for (const col of lista) {
            if (
              out.every(
                (o) => Math.hypot(o.r - col.r, o.g - col.g, o.b - col.b) > 50,
              )
            )
              out.push(col);
            if (out.length >= max) break;
          }
          resolve(out);
        } catch (e) {
          console.warn("No se pudo leer el logo (CORS):", e.message);
          resolve([]);
        }
      };
      img.onerror = () => resolve([]);
      img.src = src;
    });
  },

  _colorSel: null,
  _color2: null,
  _degActivo: false,
  _angulo: 135,
  _colorGuardadoSig: "",
  _colorPaleta: [],

  _colorSig() {
    const h1 = this._colorSel ? this._rgbToHex(this._colorSel) : "";
    const h2 =
      this._degActivo && this._color2 ? this._rgbToHex(this._color2) : "";
    return `${h1}|${h2}|${h2 ? this._angulo : ""}`;
  },

  async _initColorPanel(data) {
    const cm = data.color_marca || {};
    const deg = cm.degradado || {};
    const sw = document.getElementById("colorDinamicoSwitch");
    if (sw) sw.checked = cm.activo === true;

    this._colorPaleta = Array.isArray(cm.paleta) ? cm.paleta : [];
    this._colorSel = cm.r != null ? { r: cm.r, g: cm.g, b: cm.b } : null;
    this._color2 = deg.r != null ? { r: deg.r, g: deg.g, b: deg.b } : null;
    this._degActivo = deg.activo === true && !!this._color2;
    this._angulo = Number(deg.angulo) || 135;

    this._colorGuardadoSig = this._colorSig();

    if (!this._colorSel && this._colorPaleta.length) {
      this._colorSel = { ...this._colorPaleta[0] };
    }

    const dsw = document.getElementById("degradadoSwitch");
    if (dsw) dsw.checked = this._degActivo;
    const ang = document.getElementById("degradadoAngulo");
    if (ang) ang.value = String(this._angulo);

    this._renderColorPanel();

    const logo = data.img_tienda?.logo_tienda;
    if (!this._colorPaleta.length && logo) {
      this._colorPaleta = await this._extraerPaleta(logo);
      if (!this._colorSel && this._colorPaleta.length) {
        this._colorSel = { ...this._colorPaleta[0] };
      }
      this._renderColorPanel();
    }
  },

  _pintarPaleta(wrapId, selHex, onPick) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    wrap.innerHTML = "";
    if (!this._colorPaleta.length) {
      wrap.innerHTML =
        '<span style="font-size:12.5px;color:#888">No se pudieron leer colores del logo. Elige uno manualmente.</span>';
      return;
    }
    this._colorPaleta.forEach((c) => {
      const hex = this._rgbToHex(c);
      const b = document.createElement("button");
      b.type = "button";
      b.title = hex;
      b.style.cssText = `width:44px;height:44px;border-radius:50%;cursor:pointer;background:${hex};
        border:3px solid ${hex === selHex ? "#fff" : "rgba(255,255,255,.15)"};
        box-shadow:${hex === selHex ? "0 0 0 2px #7c4dff" : "none"};`;
      b.onclick = () => onPick(c);
      wrap.appendChild(b);
    });
  },

  _renderColorPanel() {
    const prev = document.getElementById("colorPreview");
    const man = document.getElementById("colorManual");
    const man2 = document.getElementById("colorManual2");
    const disp = document.getElementById("colorDisplay");
    const box = document.getElementById("degradadoBox");
    const degPrev = document.getElementById("degradadoPreview");

    const h1 = this._colorSel ? this._rgbToHex(this._colorSel) : "";
    const h2 = this._color2 ? this._rgbToHex(this._color2) : "";

    this._pintarPaleta("colorPaleta", h1, (c) => this._seleccionarColor(c));
    this._pintarPaleta("colorPaleta2", h2, (c) => this._seleccionarColor2(c));

    if (prev) {
      prev.style.background = h1 || "transparent";
      prev.textContent = h1 ? h1.toUpperCase() : "Sin color elegido";
    }
    if (man && h1) man.value = h1;
    if (man2 && h2) man2.value = h2;
    if (box) box.style.display = this._degActivo ? "" : "none";
    if (degPrev) {
      degPrev.style.background =
        h1 && h2
          ? `linear-gradient(${this._angulo}deg, ${h1}, ${h2})`
          : "transparent";
    }
    if (disp) {
      disp.textContent = h1
        ? this._degActivo && h2
          ? `Degradado: ${h1.toUpperCase()} → ${h2.toUpperCase()}`
          : `Color: ${h1.toUpperCase()}`
        : "Color de tu perfil público";
    }

    const btn = document.getElementById("fieldSaveBtn-color");
    if (btn && !btn.classList.contains("saving")) {
      const cambio =
        !!h1 &&
        (this._colorSig() !== this._colorGuardadoSig ||
          !this._colorGuardadoSig.startsWith("#"));
      btn.style.display = "flex";
      btn.disabled = !cambio;
      btn.style.opacity = cambio ? "1" : ".55";
      btn.innerHTML = !h1
        ? "Elige un color"
        : cambio
          ? "✓ Guardar y aplicar en mi perfil"
          : "✓ Color aplicado en tu perfil";
    }
  },

  _seleccionarColor(c) {
    this._colorSel = { r: c.r, g: c.g, b: c.b };
    this._renderColorPanel();
  },
  _seleccionarColor2(c) {
    this._color2 = { r: c.r, g: c.g, b: c.b };
    this._renderColorPanel();
  },
  elegirColorManual(hex) {
    const c = this._hexToRgb(hex);
    if (c) this._seleccionarColor(c);
  },
  elegirColor2Manual(hex) {
    const c = this._hexToRgb(hex);
    if (c) this._seleccionarColor2(c);
  },
  toggleDegradado(on) {
    this._degActivo = on;
    if (on && !this._color2) {
      const base = this._colorSel;
      const otro = this._colorPaleta.find(
        (c) =>
          !base || Math.hypot(c.r - base.r, c.g - base.g, c.b - base.b) > 60,
      ) || { r: 124, g: 77, b: 255 };
      this._color2 = { r: otro.r, g: otro.g, b: otro.b };
    }
    this._renderColorPanel();
  },
  setAnguloDegradado(v) {
    this._angulo = Number(v) || 135;
    this._renderColorPanel();
  },

  async toggleColorMarca(enabled) {
    try {
      await updateDoc(this.TIENDA_REF, { "color_marca.activo": enabled });
      this.showToast(
        enabled
          ? "Colores personalizados activados"
          : "Color automático activado",
      );
      if (enabled && !this._colorGuardadoSig) {
        this.showToast("Elige un color y pulsa Guardar");
      }
    } catch (e) {
      console.error(e);
      this.showToast("Error al actualizar");
    }
  },

  async saveColorMarca() {
    if (!this._colorSel) return;
    const btn = document.getElementById("fieldSaveBtn-color");
    if (btn) {
      btn.classList.add("saving");
      btn.innerHTML = "Guardando...";
    }
    try {
      const sw = document.getElementById("colorDinamicoSwitch");
      if (sw) sw.checked = true;
      const hex = this._rgbToHex(this._colorSel);
      const conDeg = this._degActivo && !!this._color2;
      const degradado = conDeg
        ? {
            activo: true,
            r: this._color2.r,
            g: this._color2.g,
            b: this._color2.b,
            hex: this._rgbToHex(this._color2),
            angulo: this._angulo,
          }
        : { activo: false };

      await updateDoc(this.TIENDA_REF, {
        color_marca: {
          activo: true,
          r: this._colorSel.r,
          g: this._colorSel.g,
          b: this._colorSel.b,
          hex,
          paleta: this._colorPaleta,
          degradado,
        },
      });
      this._colorGuardadoSig = this._colorSig();
      if (btn) btn.classList.remove("saving");
      this._renderColorPanel();
      this.showToast("✓ Color guardado y activado");
    } catch (e) {
      console.error(e);
      if (btn) btn.classList.remove("saving");
      this._renderColorPanel();
      this.showToast("❌ Error al guardar color");
    }
  },

  // ═══════════════════════════════════════════
  //  DÍAS ESPECIALES
  // ═══════════════════════════════════════════
  _DE_DIAS: [
    { k: "lunes", l: "Lunes" },
    { k: "martes", l: "Martes" },
    { k: "miercoles", l: "Miércoles" },
    { k: "jueves", l: "Jueves" },
    { k: "viernes", l: "Viernes" },
    { k: "sabado", l: "Sábado" },
    { k: "domingo", l: "Domingo" },
  ],
  _deDias: {},
  _deSaved: {},

  _deEsc(s) {
    return String(s ?? "").replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[m],
    );
  },
  _deSig(d) {
    return JSON.stringify([d.titulo, d.texto, d.colores, d.angulo]);
  },

  _initDiasEspeciales(data) {
    const cfg = data.dias_especiales || {};
    const sw = document.getElementById("diasEspecialesSwitch");
    if (sw) sw.checked = cfg.activo === true;
    const list = document.getElementById("diasEspecialesList");
    if (list) list.style.display = cfg.activo === true ? "" : "none";

    this._deDias = {};
    this._deSaved = {};
    this._DE_DIAS.forEach(({ k }) => {
      const d = cfg.dias?.[k] || {};
      const imgs = Array.isArray(d.imagenes) ? d.imagenes.slice(0, 3) : [];
      while (imgs.length < 3) imgs.push(null);
      this._deDias[k] = {
        activo: d.activo === true,
        titulo: d.titulo || "",
        texto: d.texto || "",
        colores:
          Array.isArray(d.colores) && d.colores.length >= 2
            ? d.colores.slice(0, 5)
            : [d.color1 || "#f97316", d.color2 || "#e11d48"],
        angulo: Number(d.angulo) || 135,
        imagenes: imgs,
      };
      this._deSaved[k] = this._deSig(this._deDias[k]);
    });
    this._renderDiasEspeciales();
  },

  _renderDiasEspeciales() {
    const wrap = document.getElementById("diasEspecialesList");
    if (!wrap) return;
    wrap.innerHTML = "";
    const e = (s) => this._deEsc(s);
    this._DE_DIAS.forEach(({ k, l }) => {
      const d = this._deDias[k];
      const card = document.createElement("div");
      card.className = "de-card";
      card.innerHTML = `
        <div class="contact-item">
          <div class="contact-text">
            <div class="contact-name">${l}</div>
            <div id="deSub-${k}" style="font-size:12px;color:#888;margin-top:2px">${d.activo && d.titulo ? e(d.titulo) : "Sin día especial"}</div>
          </div>
          <label class="switch">
            <input type="checkbox" ${d.activo ? "checked" : ""} onchange="PanelPerfil.deToggleDia('${k}', this.checked)">
            <span class="slider"></span>
          </label>
        </div>
        <div class="de-body" id="deBody-${k}" style="display:${d.activo ? "block" : "none"}">
          <div class="form-field">
            <label class="form-label">Nombre del día especial</label>
            <input class="form-input" id="deTitulo-${k}" type="text" maxlength="40"
              placeholder="Ej: Sábado de comida mexicana" value="${e(d.titulo)}"
              oninput="PanelPerfil.deInput('${k}','titulo',this.value)">
          </div>
          <div class="form-field">
            <label class="form-label">Descripción corta (opcional)</label>
            <textarea class="form-input" id="deTexto-${k}" rows="2" maxlength="120"
              placeholder="Ej: Tacos al pastor 2x1 todo el día"
              oninput="PanelPerfil.deInput('${k}','texto',this.value)">${e(d.texto)}</textarea>
          </div>
          <div class="form-label" style="margin:0 0 6px">Colores del degradado (de 2 a 5)</div>
          <div class="de-colors" id="deColors-${k}"></div>
          <div class="de-row">
            <select class="form-input" style="max-width:190px" onchange="PanelPerfil.deInput('${k}','angulo',this.value)">
              <option value="135" ${d.angulo === 135 ? "selected" : ""}>Diagonal ↘</option>
              <option value="45" ${d.angulo === 45 ? "selected" : ""}>Diagonal ↗</option>
              <option value="90" ${d.angulo === 90 ? "selected" : ""}>Horizontal →</option>
              <option value="180" ${d.angulo === 180 ? "selected" : ""}>Vertical ↓</option>
            </select>
          </div>
          <div class="de-prev" id="dePrev-${k}"></div>
          <p class="de-hint">Hasta 3 imágenes o íconos flotantes (mejor PNG/WebP sin fondo). Se guardan al subirlas.</p>
          <div class="de-slots" id="deSlots-${k}"></div>
          <button id="deSave-${k}" class="field-save-btn" style="width:100%;justify-content:center;padding:12px"
            onclick="PanelPerfil.deGuardar('${k}')">✓ Guardar ${l}</button>
        </div>`;
      wrap.appendChild(card);
      this._dePrev(k);
      this._deRenderColors(k);
      this._deRenderSlots(k);
    });
  },

  _dePrev(k) {
    const d = this._deDias[k];
    const el = document.getElementById(`dePrev-${k}`);
    if (!el) return;
    el.style.background = `linear-gradient(${d.angulo}deg, ${d.colores.join(",")})`;
    el.textContent = d.titulo || "Así se verá tu banner";
  },

  _deRenderColors(k) {
    const box = document.getElementById(`deColors-${k}`);
    if (!box) return;
    const cols = this._deDias[k].colores;
    box.innerHTML = "";
    cols.forEach((c, i) => {
      const chip = document.createElement("div");
      chip.className = "de-color";
      const inp = document.createElement("input");
      inp.type = "color";
      inp.value = c;
      inp.oninput = () => this.deColorChange(k, i, inp.value);
      chip.appendChild(inp);
      if (cols.length > 2) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = "✕";
        b.onclick = () => this.deRemoveColor(k, i);
        chip.appendChild(b);
      }
      box.appendChild(chip);
    });
    if (cols.length < 5) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "de-add";
      add.textContent = "+";
      add.onclick = () => this.deAddColor(k);
      box.appendChild(add);
    }
  },

  deColorChange(k, i, val) {
    this._deDias[k].colores[i] = val;
    this._dePrev(k);
    this._deCheck(k);
  },

  deAddColor(k) {
    const cols = this._deDias[k].colores;
    if (cols.length >= 5) return;
    cols.push(cols[cols.length - 1]);
    this._deRenderColors(k);
    this._dePrev(k);
    this._deCheck(k);
  },

  deRemoveColor(k, i) {
    const cols = this._deDias[k].colores;
    if (cols.length <= 2) return;
    cols.splice(i, 1);
    this._deRenderColors(k);
    this._dePrev(k);
    this._deCheck(k);
  },

  _deRenderSlots(k) {
    const grid = document.getElementById(`deSlots-${k}`);
    if (!grid) return;
    grid.innerHTML = "";
    this._deDias[k].imagenes.forEach((url, i) => {
      const div = document.createElement("div");
      if (url) {
        div.className = "photo-item";
        div.style.cssText = "position:relative;background:#111;";
        div.innerHTML = `<img src="${url}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;border-radius:16px;">
          <button style="position:absolute;top:6px;right:6px;z-index:5;background:rgba(0,0,0,.6);border:none;border-radius:8px;padding:4px 8px;cursor:pointer;font-size:13px;">🗑️</button>`;
        div.querySelector("button").onclick = (ev) => {
          ev.stopPropagation();
          this.deBorrarImg(k, i);
        };
        div.onclick = () => this.deSubirImg(k, i);
      } else {
        div.className = "photo-item photo-item-add";
        div.innerHTML = "<span>📷</span><span>Agregar</span>";
        div.onclick = () => this.deSubirImg(k, i);
      }
      grid.appendChild(div);
    });
  },

  _deCheck(k) {
    const btn = document.getElementById(`deSave-${k}`);
    if (!btn) return;
    const cambio = this._deSig(this._deDias[k]) !== this._deSaved[k];
    cambio ? this._showFieldBtn(btn) : this._hideFieldBtn(btn);
  },

  deInput(k, campo, val) {
    this._deDias[k][campo] = campo === "angulo" ? Number(val) || 135 : val;
    this._dePrev(k);
    this._deCheck(k);
  },

  async toggleDiasEspeciales(on) {
    try {
      await updateDoc(this.TIENDA_REF, { "dias_especiales.activo": on });
      const list = document.getElementById("diasEspecialesList");
      if (list) list.style.display = on ? "" : "none";
      this.showToast(
        on ? "Días especiales activados" : "Días especiales desactivados",
      );
    } catch (e) {
      console.error(e);
      this.showToast("Error al actualizar");
    }
  },

  async deToggleDia(k, on) {
    try {
      await updateDoc(this.TIENDA_REF, {
        [`dias_especiales.dias.${k}.activo`]: on,
      });
      this._deDias[k].activo = on;
      const body = document.getElementById(`deBody-${k}`);
      if (body) body.style.display = on ? "block" : "none";
      const sub = document.getElementById(`deSub-${k}`);
      if (sub)
        sub.textContent =
          on && this._deDias[k].titulo
            ? this._deDias[k].titulo
            : "Sin día especial";
      if (on && !this._deDias[k].titulo.trim())
        this.showToast("Escribe el nombre y pulsa Guardar");
    } catch (e) {
      console.error(e);
      this.showToast("Error al actualizar");
    }
  },

  async deGuardar(k) {
    const d = this._deDias[k];
    if (!d.titulo.trim()) {
      this.showToast("Escribe el nombre del día especial");
      return;
    }
    const btn = document.getElementById(`deSave-${k}`);
    const orig = btn ? btn.innerHTML : "";
    if (btn) {
      btn.classList.add("saving");
      btn.innerHTML = "Guardando...";
    }
    try {
      const p = `dias_especiales.dias.${k}`;
      await updateDoc(this.TIENDA_REF, {
        [`${p}.titulo`]: d.titulo.trim(),
        [`${p}.texto`]: d.texto.trim(),
        [`${p}.colores`]: d.colores,
        [`${p}.color1`]: d.colores[0],
        [`${p}.color2`]: d.colores[d.colores.length - 1],
        [`${p}.angulo`]: d.angulo,
      });
      this._deSaved[k] = this._deSig(d);
      const sub = document.getElementById(`deSub-${k}`);
      if (sub) sub.textContent = d.titulo.trim();
      if (btn) {
        this._hideFieldBtn(btn);
        btn.innerHTML = orig;
      }
      this.showToast("✓ Día especial guardado");
    } catch (e) {
      console.error(e);
      if (btn) {
        btn.classList.remove("saving");
        btn.innerHTML = orig;
      }
      this.showToast("❌ Error al guardar");
    }
  },

  deSubirImg(k, slot) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        this._showUploadLoading(
          "Subiendo imagen...",
          "Comprimiendo y guardando",
        );
        try {
          const blob = this._dataURLtoBlob(
            await this._comprimirImagen(ev.target.result, 600, 0.9),
          );
          const r = storageRef(
            storage,
            `tiendas/${this.TIENDA_ID}/dias_especiales/${k}/slot_${slot}.webp`,
          );
          await uploadBytes(r, blob, { contentType: "image/webp" });
          const url = await getDownloadURL(r);
          this._deDias[k].imagenes[slot] = url;
          await updateDoc(this.TIENDA_REF, {
            [`dias_especiales.dias.${k}.imagenes`]: this._deDias[k].imagenes,
          });
          this._deRenderSlots(k);
          this.showToast("✓ Imagen guardada");
        } catch (err) {
          console.error(err);
          this.showToast("❌ Error al subir imagen");
        } finally {
          this._hideUploadLoading();
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  },

  async deBorrarImg(k, slot) {
    if (!confirm("¿Eliminar esta imagen?")) return;
    try {
      try {
        await deleteObject(
          storageRef(
            storage,
            `tiendas/${this.TIENDA_ID}/dias_especiales/${k}/slot_${slot}.webp`,
          ),
        );
      } catch {}
      this._deDias[k].imagenes[slot] = null;
      await updateDoc(this.TIENDA_REF, {
        [`dias_especiales.dias.${k}.imagenes`]: this._deDias[k].imagenes,
      });
      this._deRenderSlots(k);
      this.showToast("✓ Imagen eliminada");
    } catch (e) {
      console.error(e);
      this.showToast("❌ Error al eliminar");
    }
  },

  // ═══════════════════════════════════════════
  //  BUSCADOR DE DIRECCIÓN
  // ═══════════════════════════════════════════
  _bindBuscadorDireccion() {
    const input = document.getElementById("fieldBuscarDireccion");
    const box = document.getElementById("sugerenciasDireccion");
    if (!input || !box) return;
    let timer,
      token = 0;

    input.addEventListener("input", () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 3) {
        box.style.display = "none";
        box.innerHTML = "";
        return;
      }

      timer = setTimeout(async () => {
        if (typeof mapboxgl === "undefined" || !mapboxgl.accessToken) return;
        const my = ++token;
        const lat = this.currentData?.ubicacion?.latitud ?? -10.7594699;
        const lng = this.currentData?.ubicacion?.longitud ?? -77.7608478;
        try {
          const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
              `?access_token=${mapboxgl.accessToken}&autocomplete=true&country=pe&language=es&limit=5&proximity=${lng},${lat}`,
          );
          const data = await res.json();
          if (my !== token) return;
          box.innerHTML = "";
          (data.features || []).forEach((f) => {
            const item = document.createElement("div");
            item.className = "addr-suggest-item";
            item.textContent = f.place_name;
            item.onclick = () => {
              const [flng, flat] = f.center;
              input.value = f.place_name;
              box.style.display = "none";
              this._onMapPointChanged(flat, flng, false, f.place_name);
            };
            box.appendChild(item);
          });
          box.style.display = box.children.length ? "block" : "none";
        } catch (e) {
          console.error(e);
        }
      }, 350);
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest("#fieldBuscarDireccion, #sugerenciasDireccion"))
        box.style.display = "none";
    });
  },

  aplicarVisibilidadUbicacion(esFisica) {
    const seccion = document.getElementById("expUbicacionSection");
    if (seccion) seccion.style.display = esFisica === true ? "" : "none";
  },

  _geohashFromLatLng(lat, lng) {
    const PRECISION = 12;
    const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
    let bits = 0,
      ch = 0,
      geohash = "",
      even = true;
    let latMin = -90.0,
      latMax = 90.0,
      lngMin = -180.0,
      lngMax = 180.0;

    while (geohash.length < PRECISION) {
      if (even) {
        const mid = (lngMin + lngMax) / 2;
        if (lng >= mid) {
          ch = (ch << 1) | 1;
          lngMin = mid;
        } else {
          ch = (ch << 1) | 0;
          lngMax = mid;
        }
      } else {
        const mid = (latMin + latMax) / 2;
        if (lat >= mid) {
          ch = (ch << 1) | 1;
          latMin = mid;
        } else {
          ch = (ch << 1) | 0;
          latMax = mid;
        }
      }
      bits++;
      even = !even;
      if (bits === 5) {
        geohash += BASE32.charAt(ch);
        bits = 0;
        ch = 0;
      }
    }
    return geohash;
  },

  // ═══════════════════════════════════════════
  //  TIEMPO REAL
  // ═══════════════════════════════════════════
  _initRealtime() {
    onSnapshot(
      tiendaServiciosDoc(this.LOCALIDAD_TIENDA, this.TIENDA_ID),
      (snap) => {
        const d = snap.exists() ? snap.data() : {};
        const esFisica =
          String(d.panel_admin?.tipo_tienda ?? d.tipo_tienda ?? "")
            .toLowerCase()
            .trim() === "fisica";
        this.aplicarVisibilidadUbicacion(esFisica);
      },
    );

    document.querySelector(".app")?.classList.add("loading-data");

    onSnapshot(
      this.TIENDA_REF,
      (snap) => {
        if (!snap.exists()) {
          this.showToast("⚠️ Documento no encontrado");
          this._quitarSkeleton({});
          return;
        }

        const next = snap.data();

        if (!this._firstLoad) {
          const diff = this._diffData(this._prevData, next);
          if (Object.keys(diff).length === 0) return;
          this._prevData = { ...next };
          this.currentData = next;
          this._patchUI(diff);
          actualizarAppState();
          enviarPatchAFrames(diff);
          return;
        }

        this._prevData = { ...next };
        this.currentData = next;
        this._firstLoad = false;
        actualizarAppState();

        this.populateUI(next);
        this.loadCategorias();

        document.querySelector(".app")?.classList.remove("loading-data");
        this._quitarSkeleton(next);

        enviarDatosAFrames();
      },
      (err) => {
        console.error("❌ Error Firestore:", err);
        this.showToast("Error al conectar con Firestore");
        document.querySelector(".app")?.classList.remove("loading-data");
        this._quitarSkeleton({});
      },
    );
  },

  // Quita el skeleton cuando YA llegaron los datos y el logo (o falló / no hay logo)
  _quitarSkeleton(data) {
    const sk = document.getElementById("skeletonOverlay");
    if (!sk || sk._quitando) return;
    sk._quitando = true;

    let hecho = false;
    const salir = () => {
      if (hecho) return;
      hecho = true;
      // 2 frames para que el contenido real ya esté pintado debajo
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          sk.classList.add("hidden"); // fade suave (ya definido en tu CSS)
          setTimeout(() => sk.remove(), 500);
        }),
      );
    };

    const url = data?.img_tienda?.logo_tienda || data?.logo_tienda || "";
    const img = document.getElementById("avatarImg");
    if (!url || !img) return salir();
    if (img.complete && img.naturalWidth > 0) return salir();

    img.addEventListener("load", salir, { once: true });
    img.addEventListener("error", salir, { once: true });
    setTimeout(salir, 3000); // si el logo tarda más de 3 s, no esperamos más
  },
  _diffData(prev, next, prefix = "") {
    const changed = {};
    const allKeys = new Set([
      ...Object.keys(prev || {}),
      ...Object.keys(next || {}),
    ]);

    for (const k of allKeys) {
      const key = prefix ? `${prefix}.${k}` : k;
      const pVal = prev?.[k];
      const nVal = next?.[k];

      if (
        pVal !== null &&
        nVal !== null &&
        typeof pVal === "object" &&
        typeof nVal === "object" &&
        !Array.isArray(pVal) &&
        !Array.isArray(nVal)
      ) {
        Object.assign(changed, this._diffData(pVal, nVal, key));
      } else if (JSON.stringify(pVal) !== JSON.stringify(nVal)) {
        changed[key] = nVal;
      }
    }
    return changed;
  },

  _patchUI(diff) {
    for (const key of Object.keys(diff)) {
      const val = diff[key];

      if (key === "nombre_tienda") {
        this.setField("businessName", val || "");
        this._originalValues["businessName"] = val || "";
      } else if (key === "descripcion") {
        this.setField("businessDesc", val || "");
        this._originalValues["businessDesc"] = val || "";
      } else if (key === "img_tienda.logo_tienda") {
        this.loadAvatar(val || "");
      } else if (key === "aforo_max") {
        this.setField("fieldAforo", val);
        this._originalValues["fieldAforo"] = String(val ?? "");
      } else if (key === "ubicacion.dirección") {
        this.setField("fieldDireccion", val || "");
        this._originalValues["fieldDireccion"] = val || "";
      } else if (key === "ubicacion.referencia") {
        this.setField("fieldReferencia", val || "");
        this._originalValues["fieldReferencia"] = val || "";
      } else if (key === "metodo_contacto.llamada.numero") {
        this.setField("fieldTelefono", val || "");
        this._originalValues["fieldTelefono"] = val || "";
      } else if (key === "metodo_contacto.whatsapp.numero") {
        this.setField("fieldWhatsapp", val || "");
        this._originalValues["fieldWhatsapp"] = val || "";
      } else if (key === "metodo_contacto.instagram.nombre") {
        const formatted = val ? (val.startsWith("@") ? val : "@" + val) : "";
        this.setField("fieldInstagram", formatted);
        this._originalValues["fieldInstagram"] = formatted;
      } else if (key === "metodo_contacto.facebook.url") {
        this.setField("fieldFacebook", val || "");
        this._originalValues["fieldFacebook"] = val || "";
      } else if (key === "metodo_contacto.tiktok.url") {
        this.setField("fieldTiktok", val || "");
        this._originalValues["fieldTiktok"] = val || "";
      } else if (key === "metodo_contacto.sitio_web.url") {
        this.setField("fieldWeb", val || "");
        this._originalValues["fieldWeb"] = val || "";
      } else if (key === "categoria_tienda") {
        this.selectedCat = val || "";
        this.renderCategorias();
        this.renderSubcategorias();
        this.updateCatDisplay();
      } else if (key === "subcategoria") {
        this.selectedSubcats = Array.isArray(val)
          ? val.map((s) => s.toLowerCase())
          : [];
        this._originalSubcats = [...this.selectedSubcats];
        this.renderSubcategorias();
        this.updateCatDisplay();
      } else if (key.startsWith("img_tienda.lista_img.")) {
        const tipo = key.split(".")[2];
        if (tipo === "ambientales" || tipo === "servicios_productos") {
          const gridMap = {
            ambientales: "ambienteGrid",
            servicios_productos: "productosGrid",
          };
          this.populatePhotoGrid(gridMap[tipo], val || [], 6, tipo);
        }
      } else if (key === "modelo_negocio") {
        this.aplicarVisibilidadUbicacion(val === true);
      }
    }
  },

  // ═══════════════════════════════════════════
  //  UI — CARGA INICIAL COMPLETA
  // ═══════════════════════════════════════════
  populateUI(data) {
    this.setField("businessName", data.nombre_tienda || "");
    this.setField("businessDesc", data.descripcion || "");

    this.loadAvatar(data.img_tienda?.logo_tienda || data.logo_tienda || "");
    this.aplicarVisibilidadUbicacion(data.modelo_negocio === true);
    if (data.categoria_tienda) this.selectedCat = data.categoria_tienda;

    if (Array.isArray(data.subcategoria) && data.subcategoria.length) {
      this.selectedSubcats = data.subcategoria.map((s) => s.toLowerCase());
    }

    this.updateCatDisplay();
    this._initColorPanel(data);
    this._initDiasEspeciales(data);
    if (data.ubicacion) {
      this.setField("fieldDireccion", data.ubicacion["dirección"] || "");
      this.setField("fieldReferencia", data.ubicacion.referencia || "");
    }

    const mc = data.metodo_contacto || {};
    const insta = mc.instagram?.nombre
      ? mc.instagram.nombre.startsWith("@")
        ? mc.instagram.nombre
        : "@" + mc.instagram.nombre
      : "";
    this.setField("fieldTelefono", mc.llamada?.numero || "");
    this.setField("fieldWhatsapp", mc.whatsapp?.numero || "");
    this.setField("fieldInstagram", insta);
    this.setField("fieldFacebook", mc.facebook?.url || "");
    this.setField("fieldTiktok", mc.tiktok?.url || "");
    this.setField("fieldWeb", mc.sitio_web?.url || "");

    this._setContactSwitch("llamada", mc.llamada?.estado);
    this._setContactSwitch("whatsapp", mc.whatsapp?.estado);
    this._setContactSwitch("instagram", mc.instagram?.estado);
    this._setContactSwitch("facebook", mc.facebook?.estado);
    this._setContactSwitch("tiktok", mc.tiktok?.estado);
    this._setContactSwitch("sitio_web", mc.sitio_web?.estado);

    const mp = data.metodos_pago || {};
    this._setSwitchAuto("yape", mp.yape?.enable);
    this._setSwitchAuto("plin", mp.plin?.enable);
    this._setSwitchAuto("agora", mp.agora?.enable);
    this._setSwitchAuto("efectivo", mp.efectivo?.enable);
    this._setSwitchAuto("visa_mastercard", mp.visa_mastercard?.enable);

    ["yape", "plin", "agora", "visa_mastercard"].forEach((m) => {
      const info = mp[m] || {};
      this.setField(`pagoNombre-${m}`, info.nombre || "");
      this.setField(`pagoNumero-${m}`, info.numero || "");
      this._originalValues[`pagoNombre-${m}`] = info.nombre || "";
      this._originalValues[`pagoNumero-${m}`] = info.numero || "";
      this._loadQrPreview(m, info.qr || "");
      this._togglePagoDetails(m, info.enable === true);
    });

    const imgs = data.img_tienda?.lista_img;
    this.populatePhotoGrid(
      "ambienteGrid",
      imgs?.ambientales || [],
      6,
      "ambientales",
    );
    this.populatePhotoGrid(
      "productosGrid",
      imgs?.servicios_productos || [],
      6,
      "servicios_productos",
    );
    if (data.aforo_max !== undefined)
      this.setField("fieldAforo", data.aforo_max);

    this._originalValues = {
      ...this._originalValues,
      businessName: data.nombre_tienda || "",
      businessDesc: data.descripcion || "",
      fieldAforo: data.aforo_max !== undefined ? String(data.aforo_max) : "",
      fieldDireccion: data.ubicacion?.["dirección"] || "",
      fieldReferencia: data.ubicacion?.referencia || "",
      fieldTelefono: mc.llamada?.numero || "",
      fieldWhatsapp: mc.whatsapp?.numero || "",
      fieldInstagram: insta,
      fieldFacebook: mc.facebook?.url || "",
      fieldTiktok: mc.tiktok?.url || "",
      fieldWeb: mc.sitio_web?.url || "",
    };
    this._originalSubcats = [...this.selectedSubcats];

    if (!this._fieldBtnsReady) {
      this._fieldBtnsReady = true;
      setTimeout(() => this._setupFieldSaveBtns(), 100);
    }

    if (!this.map) setTimeout(() => this.initMapbox(), 2000);
  },

  // ═══════════════════════════════════════════
  //  CATEGORÍAS
  // ═══════════════════════════════════════════
  async loadCategorias() {
    try {
      const colRef = collection(db, "Tiendas", "categorias", "categorias");
      const snap = await getDocs(colRef);
      if (snap.empty) {
        console.warn("No se encontraron categorías");
        return;
      }

      this.categoriasDB = {};
      snap.forEach((d) => {
        this.categoriasDB[d.id] = d.data();
      });

      this.renderCategorias();
      this.renderSubcategorias();
      this.updateCatDisplay();
    } catch (e) {
      console.error("Error loadCategorias:", e);
    }
  },

  renderCategorias() {
    const main = document.getElementById("catMain");
    if (!main) return;
    main.innerHTML = "";
    const div = document.createElement("div");
    div.className = "cat-chip cat-locked selected";
    div.textContent = this.selectedCat || "Sin categoría asignada";
    main.appendChild(div);
  },

  renderSubcategorias() {
    const sub = document.getElementById("catSub");
    if (!sub) return;
    sub.innerHTML = "";
    if (!this.selectedCat) return;

    const lista = this.categoriasDB[this.selectedCat]?.subcategorias || [];
    lista.forEach((item) => {
      const div = document.createElement("div");
      div.className = "cat-chip";
      div.textContent = item;
      if (this.selectedSubcats.includes(item.toLowerCase()))
        div.classList.add("selected");
      div.onclick = () => this.toggleSubcat(item, div);
      sub.appendChild(div);
    });
  },

  toggleSubcat(sub, el) {
    const value = sub.toLowerCase();
    const index = this.selectedSubcats.indexOf(value);
    if (index >= 0) {
      this.selectedSubcats.splice(index, 1);
      el.classList.remove("selected");
    } else {
      this.selectedSubcats.push(value);
      el.classList.add("selected");
    }
    this.updateCatDisplay();
    this._checkSubcatsChanged();
  },

  updateCatDisplay() {
    let text = this.selectedCat || "Sin seleccionar";
    if (this.selectedSubcats.length)
      text += ` • ${this.selectedSubcats.length} subcategorías`;
    const d = document.getElementById("catDisplay");
    if (d) d.textContent = text;
  },

  // ═══════════════════════════════════════════
  //  EVENTOS
  // ═══════════════════════════════════════════
  _bindEvents() {
    const avatarInput = document.getElementById("avatarFileInputHtml");
    if (avatarInput) {
      avatarInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        avatarInput.value = "";

        const reader = new FileReader();
        reader.onload = async (ev) => {
          if (!confirm("¿Guardar esta imagen como logo de tu negocio?")) return;

          this._showUploadLoading(
            "Subiendo imagen...",
            "Comprimiendo y guardando",
          );
          try {
            const comprimida = await this._comprimirImagen(
              ev.target.result,
              512,
              0.82,
            );
            const blob = this._dataURLtoBlob(comprimida);

            const r = storageRef(
              storage,
              `tiendas/${this.TIENDA_ID}/logo/logo.webp`,
            );
            await uploadBytes(r, blob, { contentType: "image/webp" });
            const finalURL = await getDownloadURL(r);

            await updateDoc(this.TIENDA_REF, {
              "img_tienda.logo_tienda": finalURL,
            });
            await this._syncLugar({ img: finalURL });

            this.loadAvatar(finalURL);
            this._extraerPaleta(comprimida).then((p) => {
              this._colorPaleta = p;
              this._renderColorPanel();
            });
            this.showToast("✓ Logo actualizado");
          } catch (err) {
            console.error("Error subiendo logo:", err);
            this.showToast("❌ Error al subir imagen");
          } finally {
            this._hideUploadLoading();
          }
        };
        reader.readAsDataURL(file);
      });
    }

    document.addEventListener("input", (e) => {
      const id = e.target?.id;
      if (!id) return;
      if (id.startsWith("pagoNombre-") || id.startsWith("pagoNumero-")) return;
      this._checkFieldChanged(id);
    });

    document.querySelectorAll("textarea.form-input").forEach((el) => {
      this.autoResize(el);
      el.addEventListener("input", () => this.autoResize(el));
      el.addEventListener("focus", () => this.autoResize(el));
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        document
          .querySelectorAll("textarea.form-input")
          .forEach((el) => this.autoResize(el));
      });
    }
  },

  // ═══════════════════════════════════════════
  //  BOTONES DE GUARDADO POR CAMPO
  // ═══════════════════════════════════════════
  _injectFieldSaveBtnStyles() {
    if (document.getElementById("field-save-btn-styles")) return;
    const style = document.createElement("style");
    style.id = "field-save-btn-styles";
    style.textContent = `
      .field-save-btn { display:none; margin-top:8px; padding:8px 18px; border-radius:10px;
        border:none; background:#7c4dff; color:#fff; font-size:13px; font-weight:600;
        cursor:pointer; transition:opacity .2s, transform .15s; animation:fieldBtnIn .18s ease; }
      .field-save-btn.visible { display:inline-flex; align-items:center; gap:6px; }
      .field-save-btn:active { transform:scale(0.96); opacity:.85; }
      .field-save-btn.saving { opacity:.6; pointer-events:none; }
      .field-save-btn.leaving { animation:fieldBtnOut .18s ease forwards; pointer-events:none; }
      @keyframes fieldBtnIn { from{opacity:0;transform:translateY(-6px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
      @keyframes fieldBtnOut { from{opacity:1;transform:translateY(0) scale(1)} to{opacity:0;transform:translateY(-6px) scale(.97)} }
    `;
    document.head.appendChild(style);
  },

  _createFieldSaveBtn(label, onSave) {
    const btn = document.createElement("button");
    btn.className = "field-save-btn";
    btn.innerHTML = `✓ Guardar ${label}`;
    btn.onclick = async () => {
      btn.classList.add("saving");
      btn.innerHTML = "Guardando...";
      try {
        await onSave();
        btn.innerHTML = `✓ Guardar ${label}`;
        this._hideFieldBtn(btn);
      } catch (e) {
        console.error(e);
        btn.classList.remove("saving");
        btn.innerHTML = `✓ Guardar ${label}`;
        this.showToast("❌ No se pudo guardar");
      }
    };
    return btn;
  },

  _showFieldBtn(btn) {
    if (!btn) return;
    clearTimeout(btn._hideT);
    btn.classList.remove("leaving");
    btn.classList.add("visible");
    btn.style.display = "inline-flex";
  },
  _hideFieldBtn(btn) {
    if (!btn || !btn.classList.contains("visible")) return;
    if (btn.classList.contains("leaving")) return;
    btn.classList.add("leaving");
    btn._hideT = setTimeout(() => {
      btn.classList.remove("visible", "saving", "leaving");
      btn.style.display = "none";
    }, 180);
  },

  _sanitizeNumero(method) {
    const el = document.getElementById(`pagoNumero-${method}`);
    if (!el) return;
    let v = el.value.replace(/\D/g, "");
    if (method !== "visa_mastercard" && v.startsWith("51") && v.length > 9)
      v = v.slice(2);
    const max = this._PAGO_CONFIG[method]?.digits;
    if (max) v = v.slice(0, max);
    el.value = v;
    this._checkPagoChanged(method);
  },

  _checkPagoChanged(method) {
    const btn = document.getElementById(`fieldSaveBtn-pago-${method}`);
    if (!btn) return;
    const nombre = document.getElementById(`pagoNombre-${method}`)?.value || "";
    const numero = document.getElementById(`pagoNumero-${method}`)?.value || "";
    const changed =
      nombre !== (this._originalValues[`pagoNombre-${method}`] || "") ||
      numero !== (this._originalValues[`pagoNumero-${method}`] || "") ||
      !!this._pagoQrPending[method];
    changed ? this._showFieldBtn(btn) : this._hideFieldBtn(btn);
  },

  _togglePagoDetails(method, show) {
    document
      .getElementById(`payDetails-${method}`)
      ?.classList.toggle("open", !!show);
  },

  _loadQrPreview(method, url) {
    const img = document.getElementById(`qrImg-${method}`);
    const ph = document.getElementById(`qrPlaceholder-${method}`);
    if (!img || !ph) return;
    img.classList.remove("loaded");
    if (url) {
      img.onload = () => img.classList.add("loaded");
      img.src = url;
      ph.style.display = "none";
    } else {
      img.removeAttribute("src");
      ph.style.display = "flex";
    }
  },

  openPagoQR(method) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        this._pagoQrPending[method] = ev.target.result;
        const img = document.getElementById(`qrImg-${method}`);
        const ph = document.getElementById(`qrPlaceholder-${method}`);
        if (img) {
          img.classList.remove("loaded");
          img.onload = () => img.classList.add("loaded");
          img.src = ev.target.result;
        }
        if (ph) ph.style.display = "none";
        this._checkPagoChanged(method);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  },

  async savePagoMethodInfo(method) {
    const btn = document.getElementById(`fieldSaveBtn-pago-${method}`);
    const labelOrig = btn ? btn.innerHTML : "";
    if (btn) {
      btn.classList.add("saving");
      btn.innerHTML = "Guardando...";
    }
    const restaurar = () => {
      if (!btn) return;
      btn.classList.remove("saving");
      btn.innerHTML = labelOrig;
    };
    try {
      const nombre =
        document.getElementById(`pagoNombre-${method}`)?.value.trim() || "";
      const numero =
        document.getElementById(`pagoNumero-${method}`)?.value.trim() || "";

      if (method !== "visa_mastercard" && numero && numero.length !== 9) {
        this.showToast("❌ El número debe tener 9 dígitos");
        restaurar();
        return;
      }

      const updateData = {
        [`metodos_pago.${method}.nombre`]: nombre,
        [`metodos_pago.${method}.numero`]: numero,
      };

      const pendingQr = this._pagoQrPending[method];
      if (pendingQr) {
        const comprimida = await this._comprimirImagen(pendingQr, 600, 0.85);
        const blob = this._dataURLtoBlob(comprimida);
        const r = storageRef(
          storage,
          `tiendas/${this.TIENDA_ID}/qr_pagos/${method}.webp`,
        );
        await uploadBytes(r, blob, { contentType: "image/webp" });
        updateData[`metodos_pago.${method}.qr`] = await getDownloadURL(r);
      }

      await updateDoc(this.TIENDA_REF, updateData);

      delete this._pagoQrPending[method];
      this._originalValues[`pagoNombre-${method}`] = nombre;
      this._originalValues[`pagoNumero-${method}`] = numero;

      if (btn) {
        this._hideFieldBtn(btn);
        btn.innerHTML = labelOrig;
      }
      this.showToast("✓ Datos de pago guardados");
    } catch (e) {
      console.error("Error guardando método de pago:", e);
      restaurar();
      this.showToast("❌ Error al guardar");
    }
  },

  _checkFieldChanged(fieldId) {
    const el = document.getElementById(fieldId);
    const btn = document.getElementById("fieldSaveBtn-" + fieldId);
    if (!el || !btn) return;
    const current = el.value || "";
    const original = this._originalValues[fieldId] || "";
    current !== original ? this._showFieldBtn(btn) : this._hideFieldBtn(btn);
  },

  _checkSubcatsChanged() {
    const btn = document.getElementById("fieldSaveBtn-subcats");
    if (!btn) return;
    const orig = JSON.stringify([...this._originalSubcats].sort());
    const curr = JSON.stringify([...this.selectedSubcats].sort());
    orig !== curr ? this._showFieldBtn(btn) : this._hideFieldBtn(btn);
  },

  _insertFieldSaveBtn(fieldId, label, onSave) {
    const el = document.getElementById(fieldId);
    if (!el || document.getElementById("fieldSaveBtn-" + fieldId)) return;
    const btn = this._createFieldSaveBtn(label, onSave);
    btn.id = "fieldSaveBtn-" + fieldId;
    el.parentNode.insertBefore(btn, el.nextSibling);
  },

  _setupFieldSaveBtns() {
    const fs = this;
    const ref = () => fs.TIENDA_REF;

    const fieldDefs = [
      {
        id: "fieldTelefono",
        label: "teléfono",
        save: async (val) => {
          await updateDoc(ref(), { "metodo_contacto.llamada.numero": val });
          fs._originalValues["fieldTelefono"] = val;
          fs.showToast("✓ Teléfono guardado");
        },
      },
      {
        id: "fieldWhatsapp",
        label: "WhatsApp",
        save: async (val) => {
          await updateDoc(ref(), { "metodo_contacto.whatsapp.numero": val });
          fs._originalValues["fieldWhatsapp"] = val;
          fs.showToast("✓ WhatsApp guardado");
        },
      },
      {
        id: "fieldInstagram",
        label: "Instagram",
        save: async (val) => {
          const clean = val
            .trim()
            .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
            .replace(/^@/, "")
            .replace(/\/$/, "");
          await updateDoc(ref(), {
            "metodo_contacto.instagram.nombre": clean,
            "metodo_contacto.instagram.url": clean
              ? `https://instagram.com/${clean}`
              : "",
          });
          fs._originalValues["fieldInstagram"] = clean ? "@" + clean : "";
          fs.setField("fieldInstagram", clean ? "@" + clean : "");
          fs.showToast("✓ Instagram guardado");
        },
      },
      {
        id: "fieldFacebook",
        label: "Facebook",
        save: async (val) => {
          let url = val.trim();
          if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
          await updateDoc(ref(), { "metodo_contacto.facebook.url": url });
          fs._originalValues["fieldFacebook"] = url;
          fs.setField("fieldFacebook", url);
          fs.showToast("✓ Facebook guardado");
        },
      },
      {
        id: "fieldTiktok",
        label: "TikTok",
        save: async (val) => {
          let url = val.trim();
          if (url && !/^https?:\/\//i.test(url)) {
            const user = url
              .replace(/^(www\.)?tiktok\.com\/@?/i, "")
              .replace(/^@/, "")
              .replace(/\/$/, "");
            url = `https://www.tiktok.com/@${user}`;
          }
          await updateDoc(ref(), { "metodo_contacto.tiktok.url": url });
          fs._originalValues["fieldTiktok"] = url;
          fs.setField("fieldTiktok", url);
          fs.showToast("✓ TikTok guardado");
        },
      },
      {
        id: "fieldWeb",
        label: "sitio web",
        save: async (val) => {
          let url = val.trim();
          if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
          await updateDoc(ref(), { "metodo_contacto.sitio_web.url": url });
          fs._originalValues["fieldWeb"] = url;
          fs.setField("fieldWeb", url);
          fs.showToast("✓ Sitio web guardado");
        },
      },
      {
        id: "businessName",
        label: "nombre",
        save: async (val) => {
          if (!val.trim()) throw new Error("nombre vacío");
          await updateDoc(ref(), {
            nombre_tienda: val,
            nombre_lower: val.toLowerCase(),
          });
          fs._originalValues["businessName"] = val;
          fs.showToast("✓ Nombre guardado");
        },
      },
      {
        id: "businessDesc",
        label: "descripción",
        save: async (val) => {
          await updateDoc(ref(), { descripcion: val });
          fs._originalValues["businessDesc"] = val;
          fs.showToast("✓ Descripción guardada");
        },
      },
      {
        id: "fieldAforo",
        label: "aforo",
        save: async (val) => {
          const num = parseInt(val);
          if (isNaN(num)) throw new Error("aforo inválido");
          await updateDoc(ref(), { aforo_max: num });
          fs._originalValues["fieldAforo"] = String(num);
          fs.showToast("✓ Aforo guardado");
        },
      },
      {
        id: "fieldDireccion",
        label: "dirección",
        save: async (val) => {
          await updateDoc(ref(), { "ubicacion.dirección": val });
          fs._originalValues["fieldDireccion"] = val;
          fs.showToast("✓ Dirección guardada");
        },
      },
      {
        id: "fieldReferencia",
        label: "referencia",
        save: async (val) => {
          await updateDoc(ref(), { "ubicacion.referencia": val });
          fs._originalValues["fieldReferencia"] = val;
          fs.showToast("✓ Referencia guardada");
        },
      },
    ];

    fieldDefs.forEach(({ id, label, save }) => {
      this._insertFieldSaveBtn(id, label, () => {
        const el = document.getElementById(id);
        return save(el?.value || "");
      });
    });

    this._insertMapSaveBtn();
    this._insertSubcatSaveBtn();
  },

  // ═══════════════════════════════════════════
  //  MAPBOX — dos pins (actual + pendiente)
  // ═══════════════════════════════════════════
  initMapbox() {
    const container = document.getElementById("mapBoxPerfil");
    if (!container) return;

    // Mapbox se descarga solo cuando hace falta (no frena la carga inicial)
    if (typeof mapboxgl === "undefined") {
      if (this._mapboxCargando) return;
      this._mapboxCargando = true;
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css";
      document.head.appendChild(css);
      const s = document.createElement("script");
      s.src = "https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js";
      s.onload = () => {
        this._mapboxCargando = false;
        this.initMapbox();
      };
      s.onerror = () => {
        this._mapboxCargando = false;
        console.warn("No se pudo cargar Mapbox");
      };
      document.head.appendChild(s);
      return;
    }

    mapboxgl.accessToken =
      "pk.eyJ1IjoiYmVuamFtaW5sb3BleiIsImEiOiJjbWZrajJ2NHIxOXBkMmtvZW1kMTA5NWNoIn0.7s_234BN9y0pkTIgtF6ikw";

    const lat = this.currentData?.ubicacion?.latitud || -10.7594699;
    const lng = this.currentData?.ubicacion?.longitud || -77.7608478;

    this.map = new mapboxgl.Map({
      container,
      style: "mapbox://styles/benjaminlopez/cmm9c0hlt003901s54utw9p30",
      center: [lng, lat],
      zoom: 18,
      pitch: 45,
      bearing: 0,
    });

    // El mapa se crea con la sección cerrada (tamaño 0): se reajusta solo al abrirla
    new ResizeObserver(() => this.map && this.map.resize()).observe(container);

    // Pin actual (DB) — morado
    const elActual = document.createElement("div");
    elActual.id = "markerActualEl";
    elActual.style.cssText =
      "display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;";
    elActual.innerHTML = `
      <div style="background:#7c4dff;color:#fff;font-size:11px;font-weight:600;
        padding:3px 8px;border-radius:20px;white-space:nowrap;
        box-shadow:0 2px 8px rgba(124,77,255,0.4);">Lugar actual</div>
      <div style="width:14px;height:14px;background:#7c4dff;border:2.5px solid #fff;
        border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>`;

    this.mapMarkerActual = new mapboxgl.Marker({
      element: elActual,
      anchor: "bottom",
    })
      .setLngLat([lng, lat])
      .addTo(this.map);

    // Pin pendiente (naranja) — draggable, oculto al inicio
    const elPendiente = document.createElement("div");
    elPendiente.id = "markerPendienteEl";
    elPendiente.style.cssText =
      "display:none;flex-direction:column;align-items:center;gap:4px;";
    elPendiente.innerHTML = `
      <div style="background:#ff6d00;color:#fff;font-size:11px;font-weight:600;
        padding:3px 8px;border-radius:20px;white-space:nowrap;
        box-shadow:0 2px 8px rgba(255,109,0,0.4);">Nueva ubicación</div>
      <div style="width:14px;height:14px;background:#ff6d00;border:2.5px solid #fff;
        border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.35);cursor:grab;"></div>`;

    this.mapMarker = new mapboxgl.Marker({
      element: elPendiente,
      anchor: "bottom",
      draggable: true,
    })
      .setLngLat([lng, lat])
      .addTo(this.map);

    this.mapMarker.on("dragend", () => {
      const pos = this.mapMarker.getLngLat();
      this._onMapPointChanged(pos.lat, pos.lng, true);
    });

    this.map.on("click", (e) => {
      this._onMapPointChanged(e.lngLat.lat, e.lngLat.lng, false);
    });
  },

  async _onMapPointChanged(
    lat,
    lng,
    fromDrag = false,
    direccionConocida = null,
  ) {
    const elPendiente = document.getElementById("markerPendienteEl");
    if (elPendiente) elPendiente.style.display = "flex";

    if (!fromDrag) this.mapMarker.setLngLat([lng, lat]);
    this.map.flyTo({ center: [lng, lat], zoom: 18 });

    if (direccionConocida) {
      document.getElementById("fieldDireccion").value = direccionConocida;
      this._checkFieldChanged("fieldDireccion");
    } else {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxgl.accessToken}`,
        );
        const data = await res.json();
        const place = data.features?.[0];
        if (place) {
          document.getElementById("fieldDireccion").value = place.place_name;
          this._checkFieldChanged("fieldDireccion");
        }
      } catch (e) {
        console.error(e);
      }
    }

    this._pendingLat = lat;
    this._pendingLng = lng;
    this._pendingZona = GeofencingManager.obtenerNombreZona(lat, lng);
    this._showFieldBtn(document.getElementById("fieldSaveBtn-coordenadas"));
  },

  obtenerUbicacionActual() {
    if (!navigator.geolocation) {
      this.showToast("❌ Tu navegador no soporta geolocalización");
      return;
    }
    if (!this.map || !this.mapMarker) {
      this.showToast("⏳ Espera a que cargue el mapa...");
      return;
    }

    const btn = document.getElementById("btnUbicacionActual");
    const btnOrig = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "⏳ Obteniendo ubicación...";
    }
    const restaurar = () => {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = btnOrig;
      }
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        this._onMapPointChanged(latitude, longitude, false);
        this.showToast("✓ Ubicación detectada, revisa el mapa y guarda");
        restaurar();
      },
      (err) => {
        console.error("Error obteniendo ubicación:", err);
        let msg = "❌ No se pudo obtener tu ubicación";
        if (err.code === 1) msg = "❌ Permiso de ubicación denegado";
        else if (err.code === 2) msg = "❌ Ubicación no disponible";
        else if (err.code === 3) msg = "❌ Tiempo de espera agotado";
        this.showToast(msg);
        restaurar();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  },

  _insertMapSaveBtn() {
    const mapWrapper = document.querySelector(".map-wrapper");
    if (!mapWrapper || document.getElementById("fieldSaveBtn-coordenadas"))
      return;

    const btn = document.createElement("button");
    btn.id = "fieldSaveBtn-coordenadas";
    btn.className = "field-save-btn";
    btn.innerHTML = "✓ Guardar nueva ubicación";

    btn.onclick = async () => {
      if (this._pendingLat === null || this._pendingLng === null) return;
      btn.classList.add("saving");
      btn.innerHTML = "Guardando...";
      try {
        const lat = this._pendingLat;
        const lng = this._pendingLng;
        const geohash = this._geohashFromLatLng(lat, lng);
        const zona =
          this._pendingZona ?? GeofencingManager.obtenerNombreZona(lat, lng);

        const dir = document.getElementById("fieldDireccion")?.value.trim();
        const upd = {
          "ubicacion.latitud": lat,
          "ubicacion.longitud": lng,
          "ubicacion.zona": zona,
          geohash,
        };
        if (dir) upd["ubicacion.dirección"] = dir;
        await updateDoc(this.TIENDA_REF, upd);
        await this._syncLugar({
          "ubicacion.latitud": lat,
          "ubicacion.longitud": lng,
          zona: zona,
          geohash,
        });

        this.currentData.ubicacion = {
          ...this.currentData.ubicacion,
          latitud: lat,
          longitud: lng,
          zona,
        };

        this.mapMarkerActual.setLngLat([lng, lat]);
        const elPendiente = document.getElementById("markerPendienteEl");
        if (elPendiente) elPendiente.style.display = "none";

        this._pendingLat = null;
        this._pendingLng = null;
        this._pendingZona = null;

        if (dir) {
          this._originalValues["fieldDireccion"] = dir;
          this._hideFieldBtn(
            document.getElementById("fieldSaveBtn-fieldDireccion"),
          );
        }
        const buscador = document.getElementById("fieldBuscarDireccion");
        if (buscador) buscador.value = "";

        this._hideFieldBtn(btn);
        btn.innerHTML = "✓ Guardar nueva ubicación";
        this.showToast(
          zona ? `✓ Ubicación guardada · ${zona}` : "✓ Ubicación guardada",
        );
      } catch (e) {
        console.error(e);
        btn.classList.remove("saving");
        btn.innerHTML = "✓ Guardar nueva ubicación";
        this.showToast("❌ Error al guardar ubicación");
      }
    };

    mapWrapper.appendChild(btn);
  },

  _insertSubcatSaveBtn() {
    const body = document
      .getElementById("expCategoria")
      ?.querySelector(".expand-body");
    if (!body || document.getElementById("fieldSaveBtn-subcats")) return;

    const btn = document.createElement("button");
    btn.id = "fieldSaveBtn-subcats";
    btn.className = "field-save-btn";
    btn.style.marginTop = "12px";
    btn.innerHTML = "✓ Guardar subcategorías";

    btn.onclick = async () => {
      btn.classList.add("saving");
      btn.innerHTML = "Guardando...";
      try {
        const lista = [...this.selectedSubcats];
        await updateDoc(this.TIENDA_REF, { subcategoria: lista });
        const okLugar = await this._syncLugar({ tag: lista });
        this._originalSubcats = [...lista];
        this._hideFieldBtn(btn);
        btn.innerHTML = "✓ Guardar subcategorías";
        this.showToast(
          okLugar
            ? "✓ Subcategorías guardadas"
            : "✓ Guardadas (el buscador no se pudo actualizar)",
        );
      } catch (e) {
        console.error("Error guardando subcategorías:", e);
        btn.classList.remove("saving");
        btn.innerHTML = "✓ Guardar subcategorías";
        this.showToast("❌ Error al guardar: " + (e.code || e.message));
      }
    };

    body.appendChild(btn);
  },

  // ═══════════════════════════════════════════
  //  AVATAR
  // ═══════════════════════════════════════════
  loadAvatar(url) {
    const img = document.getElementById("avatarImg");
    const skeleton = document.getElementById("avatarSkeleton");
    const placeholder = document.getElementById("avatarPlaceholder");
    if (!img || !skeleton || !placeholder) return;

    skeleton.style.display = "block";
    placeholder.style.display = "none";
    img.classList.remove("loaded");

    if (!url) {
      skeleton.style.display = "none";
      placeholder.style.display = "flex";
      return;
    }

    img.src = url;
    img.onload = () => {
      skeleton.style.display = "none";
      placeholder.style.display = "none";
      img.classList.add("loaded");
    };
    img.onerror = () => {
      skeleton.style.display = "none";
      placeholder.style.display = "flex";
    };
  },

  closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove("open");
    modal.querySelector(".modal-sheet")?.classList.remove("open");
  },

  // ═══════════════════════════════════════════
  //  PHOTO GRID
  // ═══════════════════════════════════════════
  populatePhotoGrid(gridId, urls, maxSlots, gridTipo) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    grid.innerHTML = "";
    const urlArray = [...(Array.isArray(urls) ? urls : [])].slice(0, maxSlots);
    while (urlArray.length < maxSlots) urlArray.push(null);

    for (let i = 0; i < maxSlots; i++) {
      const url = urlArray[i];
      if (url) {
        const wrap = document.createElement("div");
        wrap.className = "photo-item";
        wrap.style.position = "relative";

        const sk = document.createElement("div");
        sk.style.cssText =
          "position:absolute;inset:0;background:linear-gradient(90deg,#1a1030 0%,#2a1850 50%,#1a1030 100%);background-size:200% 100%;animation:skeleton-loading 1.2s infinite;z-index:1;border-radius:16px;";
        wrap.appendChild(sk);

        const img = document.createElement("img");
        img.style.cssText =
          "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .35s ease;z-index:2;border-radius:16px;";
        img.onload = () => {
          sk.style.display = "none";
          requestAnimationFrame(() => {
            img.style.opacity = "1";
          });
        };
        img.onerror = () => {
          sk.style.display = "none";
          wrap.innerHTML =
            '<span style="font-size:20px;opacity:0.25;position:absolute;inset:0;display:flex;align-items:center;justify-content:center">🖼️</span>';
        };
        img.src = url;
        wrap.appendChild(img);

        if (gridTipo) {
          const btnDel = document.createElement("button");
          btnDel.innerHTML = "🗑️";
          btnDel.style.cssText =
            "position:absolute;top:6px;right:6px;z-index:10;background:rgba(0,0,0,0.6);border:none;border-radius:8px;padding:4px 8px;cursor:pointer;font-size:13px;";
          btnDel.onclick = (e) => {
            e.stopPropagation();
            this.deleteFotoGrid(gridTipo, i);
          };
          wrap.onclick = () => this.openFotoGrid(gridTipo, i);
          wrap.appendChild(btnDel);
        }

        grid.appendChild(wrap);
      } else {
        const div = document.createElement("div");
        div.className = "photo-item photo-item-add";
        div.innerHTML = "<span>📷</span><span>Agregar</span>";
        div.onclick = () => this.openFotoGrid(gridTipo, i);
        grid.appendChild(div);
      }
    }
  },

  openFotoGrid(tipo, slotIndex) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const currentGrid = document.getElementById(
        tipo === "ambientales" ? "ambienteGrid" : "productosGrid",
      );
      const slots = currentGrid
        ? currentGrid.querySelectorAll(".photo-item")
        : [];
      const tieneImagen =
        slots[slotIndex] &&
        !slots[slotIndex].classList.contains("photo-item-add");
      const msg = tieneImagen
        ? "¿Reemplazar esta foto?"
        : "¿Subir esta imagen al panel?";
      if (!confirm(msg)) return;

      const reader = new FileReader();
      reader.onload = async (ev) => {
        this._showUploadLoading("Subiendo foto...", "Comprimiendo y guardando");
        try {
          const blob = this._dataURLtoBlob(
            await this._comprimirImagen(ev.target.result, 1024, 0.85),
          );
          const path = `tiendas/${this.TIENDA_ID}/imagenes/${tipo}/slot_${slotIndex}.webp`;

          const r = storageRef(storage, path);
          await uploadBytes(r, blob, { contentType: "image/webp" });
          const finalURL = await getDownloadURL(r);

          const snap = await getDoc(this.TIENDA_REF);
          const rawLista = snap.data()?.img_tienda?.lista_img?.[tipo] || [];
          const lista = this._buildSlotArray(rawLista, 6);
          lista[slotIndex] = finalURL;

          await updateDoc(this.TIENDA_REF, {
            [`img_tienda.lista_img.${tipo}`]: lista,
          });

          const gridMap = {
            ambientales: "ambienteGrid",
            servicios_productos: "productosGrid",
          };
          this.populatePhotoGrid(gridMap[tipo], lista, 6, tipo);
          this.showToast("✓ Foto guardada");
        } catch (err) {
          console.error("Error subiendo foto:", err);
          this.showToast("❌ Error al subir foto");
        } finally {
          this._hideUploadLoading();
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  },

  async deleteFotoGrid(tipo, slotIndex) {
    if (!confirm("¿Eliminar esta foto?")) return;
    this.showToast("⏳ Eliminando...");

    try {
      const path = `tiendas/${this.TIENDA_ID}/imagenes/${tipo}/slot_${slotIndex}.webp`;
      try {
        await deleteObject(storageRef(storage, path));
      } catch {
        /* no existía */
      }

      const snap = await getDoc(this.TIENDA_REF);
      const rawLista = snap.data()?.img_tienda?.lista_img?.[tipo] || [];
      const lista = this._buildSlotArray(rawLista, 6);
      lista[slotIndex] = null;

      await updateDoc(this.TIENDA_REF, {
        [`img_tienda.lista_img.${tipo}`]: lista,
      });

      const gridMap = {
        ambientales: "ambienteGrid",
        servicios_productos: "productosGrid",
      };
      this.populatePhotoGrid(gridMap[tipo], lista, 6, tipo);
      this.showToast("✓ Foto eliminada");
    } catch (err) {
      console.error(err);
      this.showToast("❌ Error al eliminar");
    }
  },

  // ═══════════════════════════════════════════
  //  SWITCHES
  // ═══════════════════════════════════════════
  async togglePayMethod(method, enabled) {
    try {
      await updateDoc(this.TIENDA_REF, {
        [`metodos_pago.${method}.enable`]: enabled,
      });
      this._togglePagoDetails(method, enabled);
      if (enabled) this._checkPagoChanged(method);
      this.showToast(
        `${method.toUpperCase()} ${enabled ? "activado" : "desactivado"}`,
      );
    } catch (e) {
      console.error("Error togglePayMethod:", e);
      this.showToast("Error al actualizar método de pago");
    }
  },

  async toggleContactMethod(method, enabled) {
    try {
      await updateDoc(this.TIENDA_REF, {
        [`metodo_contacto.${method}.estado`]: enabled,
      });
      this.showToast(
        `${this._getContactName(method)} ${enabled ? "activado" : "desactivado"}`,
      );
      const fieldId = {
        llamada: "fieldTelefono",
        whatsapp: "fieldWhatsapp",
        instagram: "fieldInstagram",
        facebook: "fieldFacebook",
        tiktok: "fieldTiktok",
        sitio_web: "fieldWeb",
      }[method];
      const el = document.getElementById(fieldId);
      if (enabled && el && !el.value.trim()) {
        this.showToast("Escribe el dato y pulsa Guardar");
        el.focus();
      }
    } catch (e) {
      console.error("Error toggleContactMethod:", e);
      this.showToast("Error al actualizar");
    }
  },

  _getContactName(method) {
    return (
      {
        llamada: "Teléfono",
        whatsapp: "WhatsApp",
        instagram: "Instagram",
        facebook: "Facebook",
        tiktok: "TikTok",
        sitio_web: "Sitio web",
      }[method] || method
    );
  },

  // ═══════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════
  setField(id, val) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = val ?? "";
    if (el.tagName === "TEXTAREA") {
      this.autoResize(el);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => this.autoResize(el));
      });
    }
  },

  autoResize(el) {
    if (el.offsetParent === null) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  },

  // Los textarea de nombre/descripción en el HTML llaman a estas dos
  updateName(val) {
    this._checkFieldChanged("businessName");
  },
  updateDesc(val) {
    this._checkFieldChanged("businessDesc");
  },

  _setSwitchAuto(switchId, isEnabled) {
    const el = document.querySelector(`input[data-method="${switchId}"]`);
    if (el) el.checked = isEnabled === true;
  },

  _setContactSwitch(contactId, isEnabled) {
    const el = document.querySelector(`input[data-contact="${contactId}"]`);
    if (el) el.checked = isEnabled === true;
  },

  _buildSlotArray(rawLista, size) {
    const lista = new Array(size).fill(null);
    rawLista.forEach((url) => {
      if (!url) return;
      const match = url.match(/slot_(\d+)\.webp/);
      if (match) lista[parseInt(match[1])] = url;
    });
    return lista;
  },

  _showUploadLoading(msg, subMsg) {
    const el = document.getElementById("uploadLoadingOverlay");
    if (!el) return;
    el.style.display = "flex";
    document.getElementById("uploadLoadingMsg").textContent =
      msg || "Subiendo imagen...";
    document.getElementById("uploadLoadingSubMsg").textContent =
      subMsg || "Por favor espera";
  },

  _hideUploadLoading() {
    const el = document.getElementById("uploadLoadingOverlay");
    if (el) el.style.display = "none";
  },

  _comprimirImagen(dataURL, maxPx, calidad) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > maxPx || h > maxPx) {
          if (w >= h) {
            h = Math.round((h * maxPx) / w);
            w = maxPx;
          } else {
            w = Math.round((w * maxPx) / h);
            h = maxPx;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/webp", calidad));
      };
      img.onerror = () => reject(new Error("No se pudo leer imagen"));
      img.src = dataURL;
    });
  },

  _dataURLtoBlob(dataURL) {
    const [header, data] = dataURL.split(",");
    const mime = header.match(/:(.*?);/)[1];
    const raw = atob(data);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return new Blob([arr], { type: mime });
  },

  toggleExpand(header) {
    const open = header.classList.contains("open");
    header.classList.toggle("open", !open);
    header.nextElementSibling?.classList.toggle("open", !open);
  },
};

// ═══════════════════════════════════════════════════════════════════
//  CUENTA EN TIEMPO REAL + RENOVACIÓN
//  Créditos IA ← /Tiendas/.../tiendas_servicios_geinz_activos/{tiendaId}
// ═══════════════════════════════════════════════════════════════════
let accountData = null;

// ── Planes y publicidad (otro proyecto Firebase) ──
function getFirebasePlanes() {
  const app =
    getApps().find((a) => a.name === "planes") ||
    initializeApp(
      {
        apiKey: "AIzaSyA47YFtXgzUQe8w_Wb6AlfDcQSjOB5rT_U",
        authDomain: "proyectolista-95172.firebaseapp.com",
        projectId: "proyectolista-95172",
        storageBucket: "proyectolista-95172.firebasestorage.app",
        messagingSenderId: "250365546182",
        appId: "1:250365546182:web:732f2342d416eb909111c7",
      },
      "planes",
    );
  return getFirestore(app);
}

// Una sola lectura del doc de precios para planes + publicidad
async function initPreciosApp() {
  try {
    const snap = await getDoc(
      doc(getFirebasePlanes(), "precio_apartado", "app"),
    );
    if (!snap.exists()) {
      console.warn("⚠️ [precios] Documento no encontrado");
      return;
    }
    const data = snap.data();
    const planesActivacion = data.planes_activacion || {};
    const rawBotPromo = data.planes_bot_promo || {};
    const planesBotPromo = {
      ficha40: rawBotPromo.ficha40,
      planes_bot_tiendas: rawBotPromo.planes_bot_tiendas || {},
    };
    const publicidad = data.publicidad || {};
    if (data.costo_por_moneda != null) {
      publicidad.costo_por_moneda = data.costo_por_moneda;
    }
    window._planesActivacion = planesActivacion;
    window._planesBotPromo = planesBotPromo;
    window._publicidad = publicidad;
    _renovacion._planesData = planesActivacion;
    _renovacion._planesBotPromoData = planesBotPromo;
    _renovacion._publicidadData = publicidad;
    broadcastPublicidad(publicidad);
    broadcastPlanes(planesActivacion, planesBotPromo, publicidad);
  } catch (err) {
    console.error("❌ [precios] Error:", err);
  }
}

// Créditos IA: panel_admin.creditos_ia  →  creditos_ia (raíz)
function getCreditosIA(servicios) {
  const v = servicios?.panel_admin?.creditos_ia ?? servicios?.creditos_ia;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function initRealtimeAccount() {
  const docRefOriginal = tiendaDoc(localidad, "tiendas", tiendaId);
  const docRefServicios = tiendaDoc(
    localidad,
    "tiendas_servicios_geinz_activos",
    tiendaId,
  );

  let originalData = {};
  let serviciosData = {};
  let originalListo = false;
  let serviciosListo = false;

  const emitir = () => {
    if (originalListo && serviciosListo)
      combineAndUpdate(originalData, serviciosData);
  };

  onSnapshot(
    docRefOriginal,
    (snap) => {
      originalData = snap.exists() ? snap.data() : {};
      originalListo = true;
      emitir();
    },
    (err) => {
      console.error("❌ Error en snapshot original:", err);
      originalListo = true;
      emitir();
    },
  );
  onSnapshot(
    docRefServicios,
    (snap) => {
      serviciosData = snap.exists() ? snap.data() : {};
      serviciosListo = true;
      window.setServiciosParaPublicidad(serviciosData);
      emitir();
    },
    (err) => {
      console.error("❌ Error en snapshot servicios:", err);
      serviciosListo = true;
      emitir();
    },
  );
}

function combineAndUpdate(original, servicios) {
  const combined = { ...original };
  if (servicios.panel_admin) combined.panel_admin = servicios.panel_admin;
  if (servicios.notificaciones)
    combined.notificaciones = servicios.notificaciones;
  combined.creditos_ia = getCreditosIA(servicios);
  accountData = combined;
  updateAccountCard();
}

// ── Tarjeta de cuenta ──
document.addEventListener("click", function (e) {
  const header = e.target.closest(".exp-header");
  if (!header) return;
  const card = header.closest(".exp-card");
  if (card) card.classList.toggle("open");
});

window.copyId = function (e) {
  e.stopPropagation();
  const idSpan = document.getElementById("user-id");
  if (!idSpan) return;
  navigator.clipboard
    .writeText(idSpan.textContent)
    .then(() => mostrarToast("ID copiado", 2000))
    .catch(() => alert("No se pudo copiar el ID"));
};

function formatDate(dateInput) {
  if (!dateInput) return "—";
  if (dateInput instanceof Date) {
    const d = dateInput.getDate().toString().padStart(2, "0");
    const m = (dateInput.getMonth() + 1).toString().padStart(2, "0");
    return `${d}/${m}/${dateInput.getFullYear()}`;
  }
  if (typeof dateInput === "string") {
    if (dateInput.match(/^\d{2}\/\d{2}\/\d{4}$/)) return dateInput;
    if (dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [y, m, d] = dateInput.split("-");
      return `${d}/${m}/${y}`;
    }
  }
  return dateInput;
}

function getEndDateFromAccount(data) {
  if (data.panel_admin && data.panel_admin.timestamp_fin) {
    const ts = data.panel_admin.timestamp_fin;
    const date = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
    if (!isNaN(date.getTime())) return date;
  }
  if (data.panel_admin && data.panel_admin.fecha_fin) {
    const parts = data.panel_admin.fecha_fin.split("/");
    if (parts.length === 3) {
      return new Date(
        parseInt(parts[2], 10),
        parseInt(parts[1], 10) - 1,
        parseInt(parts[0], 10),
      );
    }
  }
  return null;
}

function getRenewalDaysFromAccount(data) {
  const endDate = getEndDateFromAccount(data);
  if (!endDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value !== undefined && value !== null ? value : "—";
}

function updateAccountCard() {
  if (!accountData) return;
  const data = accountData;

  const planType = data.bot_plan_pro === true ? "Premium" : "Gratuito";
  setText("plan-type-full", planType);
  setText("badge-plan", planType);
  setText("estado-cuenta", "Activo");

  const balance = Number(data.creditos_ia) || 0;
  const balanceFormatted = balance.toLocaleString("es-PE");
  setText("ph-summary", `${planType} · Créditos IA ${balanceFormatted}`);
  setText("balance-full", balanceFormatted);
  setText("saldo-actual-cuenta", balanceFormatted);

  window._saldoTienda = balance;
  window._creditosIA = balance;
  broadcastSaldo(balance);

  setText("user-id", data.id_tienda || tiendaId);

  const startRaw = data.fechas?.fecha_ingreso || data.fecha_ingreso;
  setText("start-date", formatDate(startRaw));
  setText("end-date", formatDate(getEndDateFromAccount(data)));

  const renewalDays = getRenewalDaysFromAccount(data);
  setText("renewal-days", renewalDays);
  setText("renewal-text", `${renewalDays} días para la renovación`);

  ["renewal-days", "renewal-text"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("warning", renewalDays <= 10);
    el.classList.toggle("normal", renewalDays > 10);
  });

  const actionRenovar = document.getElementById("action-renovar");
  if (renewalDays === 0) {
    bloquearExpandibles();
    if (actionRenovar) actionRenovar.style.display = "block";
  } else {
    desbloquearExpandibles();
    if (actionRenovar) actionRenovar.style.display = "none";
  }
}

// ── Bloqueo cuando el plan vence ──
function _targetsBloqueo() {
  return [
    ...document.querySelectorAll(".expand-section"),
    document.querySelector(".profile-top-row"),
  ].filter(Boolean);
}

function bloquearExpandibles() {
  _targetsBloqueo().forEach((el) => {
    if (el.dataset.bloqueado === "1") return;
    el.dataset.bloqueado = "1";
    el.style.opacity = "0.45";
    el.style.userSelect = "none";
    if (getComputedStyle(el).position === "static")
      el.style.position = "relative";

    if (el.querySelector(".bloqueo-section-overlay")) return;
    const ov = document.createElement("div");
    ov.className = "bloqueo-section-overlay";
    ov.style.cssText =
      "position:absolute;inset:0;z-index:10;cursor:not-allowed;border-radius:inherit;";
    ov.addEventListener("click", (e) => {
      e.stopPropagation();
      mostrarToast("⚠️ Renueva tu plan para editar los campos", 3000);
    });
    el.appendChild(ov);
  });
}

function desbloquearExpandibles() {
  _targetsBloqueo().forEach((el) => {
    el.style.opacity = "";
    el.style.pointerEvents = "";
    el.style.userSelect = "";
    el.style.position = "";
    delete el.dataset.bloqueado;
    el.querySelectorAll(".bloqueo-section-overlay").forEach((ov) =>
      ov.remove(),
    );
  });
}

// ── Modal de renovación ──
const _DIAS_POR_PLAN = {
  "20_dias": 20,
  "1_mes": 30,
  "2_meses": 60,
  "3_meses": 90,
  "4_meses": 120,
};

const _renovacion = {
  _planesData: {},
  _planesBotPromoData: {},
  _publicidadData: {},
  _planSeleccionado: null,

  _NOMBRES_PLANES: {
    "20_dias": "20 días",
    "1_mes": "1 mes",
    "2_meses": "2 meses",
    "3_meses": "3 meses",
    "4_meses": "4 meses",
  },
  _ORDEN_PLANES: ["20_dias", "1_mes", "2_meses", "3_meses", "4_meses"],
  _DESCUENTOS: { "1_mes": 5, "2_meses": 10, "3_meses": 20, "4_meses": 30 },

  abrirModal() {
    const modal = document.getElementById("modal-renovacion");
    if (!modal) return;
    modal.classList.add("open");
    ModalBack.abrir("renovacion", () => window.cerrarModal());
    this._planSeleccionado = null;
    const resumenPago = document.getElementById("resumen-pago");
    const btnContinuar = document.getElementById("btn-continuar");
    if (resumenPago) resumenPago.style.display = "none";
    if (btnContinuar) btnContinuar.disabled = true;

    const planes = window._planesActivacion || this._planesData;
    if (!planes || Object.keys(planes).length === 0) {
      const sel = document.getElementById("selector-planes");
      if (sel)
        sel.innerHTML =
          '<p style="text-align:center;color:#888">Cargando planes...</p>';
      setTimeout(() => this.abrirModal(), 800);
      return;
    }
    this._renderPlanes(planes);
  },

  _renderPlanes(planes) {
    const container = document.getElementById("selector-planes");
    if (!container) return;
    container.innerHTML = "";

    this._ORDEN_PLANES
      .filter((k) => planes[k] !== undefined)
      .forEach((key) => {
        const precio = planes[key];
        const desc = this._DESCUENTOS[key] || 0;
        const div = document.createElement("div");
        div.className = "plan-item";
        div.dataset.key = key;
        div.innerHTML = `
          <strong>${this._NOMBRES_PLANES[key] || key.replace(/_/g, " ")}</strong>
          <span class="precio-container">
            ${precio}
            <img src="../img/icon_monedas_3d.webp" class="coin-icon" alt="moneda">
          </span>
          ${desc ? `<span class="desc-badge">-${desc}%</span>` : ""}
        `;
        div.onclick = () => this._seleccionarPlan(key, precio);
        container.appendChild(div);
      });
  },

  _seleccionarPlan(key, precio) {
    this._planSeleccionado = { key, precio };

    document
      .querySelectorAll("#selector-planes .plan-item")
      .forEach((el) => el.classList.toggle("selected", el.dataset.key === key));

    const saldo = window._saldoTienda || 0;
    const desc = this._DESCUENTOS[key] || 0;
    const precioFinal =
      desc > 0 ? Math.round(precio * (1 - desc / 100)) : precio;
    const restante = saldo - precioFinal;
    const falta = precioFinal - saldo;
    const sinSaldo = saldo < precioFinal;

    const elSaldoActual = document.getElementById("saldo-actual");
    const elSaldoRestante = document.getElementById("saldo-restante");
    const elTotal = document.getElementById("total-a-pagar");
    const elResumen = document.getElementById("resumen-pago");
    const elBtnContinuar = document.getElementById("btn-continuar");
    const detalle = document.getElementById("detalle-descuento");
    const avisoSaldo = document.getElementById("aviso-saldo-insuficiente");

    if (elSaldoActual)
      elSaldoActual.textContent = ` ${saldo.toLocaleString("es-PE")}`;
    if (elSaldoRestante)
      elSaldoRestante.textContent = sinSaldo
        ? " —"
        : ` ${restante.toLocaleString("es-PE")}`;
    if (elTotal)
      elTotal.textContent = ` ${precioFinal.toLocaleString("es-PE")}`;

    if (detalle) {
      detalle.innerHTML = desc
        ? `<p>Descuento aplicado:
            <strong>${desc}% = -
              <span style="display:inline-flex;align-items:center;gap:4px;">
                ${(precio - precioFinal).toLocaleString("es-PE")}
                <img src="../img/icon_monedas_3d.webp" class="coin-icon" style="width:16px;height:16px;vertical-align:middle;">
              </span>
            </strong>
           </p>`
        : "";
    }

    if (avisoSaldo) {
      if (sinSaldo) {
        avisoSaldo.innerHTML = `
          <span style="color:#e05c00;font-weight:600;display:flex;align-items:center;gap:6px;font-size:13px;">
            ❌ Te faltan
            <span style="display:inline-flex;align-items:center;gap:4px;background:#fff3e0;padding:2px 8px;border-radius:8px;color:#e05c00;font-weight:700;">
              ${falta.toLocaleString("es-PE")}
              <img src="../img/icon_monedas_3d.webp" style="width:16px;height:16px;vertical-align:middle;">
            </span>
            para este plan
          </span>`;
        avisoSaldo.style.display = "block";
      } else {
        avisoSaldo.style.display = "none";
        avisoSaldo.innerHTML = "";
      }
    }

    if (elResumen) elResumen.style.display = "block";
    if (elBtnContinuar) elBtnContinuar.disabled = sinSaldo;
  },
};

window.abrirModalRenovacion = () => _renovacion.abrirModal();

window.cerrarModal = () => {
  ModalBack.cerrado("renovacion");

  _renovacion._planSeleccionado = null;
  const resumenPago = document.getElementById("resumen-pago");
  const btnContinuar = document.getElementById("btn-continuar");
  const avisoSaldo = document.getElementById("aviso-saldo-insuficiente");
  if (resumenPago) resumenPago.style.display = "none";
  if (btnContinuar) btnContinuar.disabled = true;
  if (avisoSaldo) {
    avisoSaldo.style.display = "none";
    avisoSaldo.innerHTML = "";
  }
  document
    .querySelectorAll("#selector-planes .plan-item")
    .forEach((el) => el.classList.remove("selected"));
};

// Procesar pago — Cloud Function
window.procesarPago = async () => {
  const plan = _renovacion._planSeleccionado;
  if (!plan) return;

  const saldo = window._saldoTienda || 0;
  const desc = _renovacion._DESCUENTOS[plan.key] || 0;
  const precioFinal =
    desc > 0 ? Math.round(plan.precio * (1 - desc / 100)) : plan.precio;

  if (saldo < precioFinal) {
    alert("❌ Saldo insuficiente para renovar este plan.");
    return;
  }
  if (!tiendaId || !localidad) {
    alert("❌ No se pudo identificar la tienda. Recarga la página.");
    return;
  }
  const dias_extra = _DIAS_POR_PLAN[plan.key];
  if (!dias_extra) {
    alert("❌ Plan no reconocido.");
    return;
  }

  const btnContinuar = document.getElementById("btn-continuar");
  if (btnContinuar) {
    btnContinuar.disabled = true;
    btnContinuar.textContent = "Procesando...";
  }

  try {
    const response = await fetch(
      "https://us-central1-geinzworkapp.cloudfunctions.net/pagar_plan__usuario",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            pais: "",
            provincia: "",
            precio_por_moneda: window._publicidad?.costo_por_moneda,
            id_tienda: tiendaId,
            localidad,
            dias_extra,
            monedas_costo: precioFinal,
          },
        }),
      },
    );

    const result = await response.json();
    if (!response.ok || result?.error) {
      throw new Error(result?.error?.message || `Error ${response.status}`);
    }

    document.getElementById("modal-renovacion")?.classList.remove("open");
    mostrarSnackbar("Plan renovado correctamente 🎉", "success");
  } catch (err) {
    console.error("❌ Error procesarPago:", err);
    alert(
      "❌ Error al procesar el pago: " + (err.message || "intenta de nuevo"),
    );
  } finally {
    if (btnContinuar) {
      btnContinuar.disabled = false;
      btnContinuar.textContent = "Continuar";
    }
  }
};

function mostrarSnackbar(msg, tipo = "success") {
  const toast = document.getElementById("toast-renovacion");
  const icon = document.getElementById("toast-renovacion-icon");
  const text = document.getElementById("toast-renovacion-msg");
  if (!toast) return;

  icon.textContent =
    tipo === "success" ? "✅" : tipo === "warning" ? "⚠️" : "❌";
  text.textContent = msg;
  toast.style.background =
    tipo === "success" ? "#0f9b6e" : tipo === "warning" ? "#e07b00" : "#d63031";

  toast.classList.add("show");
  clearTimeout(window._snackTimer);
  window._snackTimer = setTimeout(() => toast.classList.remove("show"), 3500);
}

// ═══════════════════════════════════════════════════════════════════
//  HORARIO — ESTADO (abierto / cerrado)
// ═══════════════════════════════════════════════════════════════════
const horarioDocRef =
  tiendaId && localidad ? tiendaDoc(localidad, "tiendas", tiendaId) : null;

function toMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function formatDuration(mins) {
  if (mins <= 0) return "0 min";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const DIAS_ES = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

function calcularEstado(horarioAtencion) {
  const ahora = new Date();
  const diaActual = ahora.getDay();
  const minActual = ahora.getHours() * 60 + ahora.getMinutes();
  const diaKey = DIAS_ES[diaActual];
  const diaKeyMañana = DIAS_ES[(diaActual + 1) % 7];

  const diaCerrado = (k) => horarioAtencion?.[k]?.cerrado === true;
  const motivoDia = (k) => horarioAtencion?.[k]?.motivo || null;

  function primerBloqueValido(k) {
    if (diaCerrado(k)) return null;
    const bloques = horarioAtencion?.[k]?.bloques ?? [];
    for (const b of bloques) {
      if (b.h_apertura && b.h_cierre) return b;
    }
    return null;
  }

  if (diaCerrado(diaKey)) {
    const motivo = motivoDia(diaKey);
    for (let i = 1; i <= 7; i++) {
      const keyProx = DIAS_ES[(diaActual + i) % 7];
      const bloque = primerBloqueValido(keyProx);
      if (bloque) {
        const label = i === 1 ? "mañana" : `el ${keyProx}`;
        return {
          abierto: false,
          etiqueta: "Cerrado hoy",
          detalle: `Abre ${label} a las ${bloque.h_apertura}`,
          motivo,
          color: "gray",
        };
      }
    }
    return {
      abierto: false,
      etiqueta: "Cerrado hoy",
      detalle: "Sin próxima apertura programada",
      motivo,
      color: "gray",
    };
  }

  const bloquesHoy = horarioAtencion?.[diaKey]?.bloques ?? [];
  for (const bloque of bloquesHoy) {
    const apertura = toMinutes(bloque.h_apertura);
    const cierre = toMinutes(bloque.h_cierre);
    if (apertura === null || cierre === null) continue;

    if (minActual >= apertura && minActual < cierre) {
      const restante = cierre - minActual;
      if (restante <= 30) {
        return {
          abierto: true,
          etiqueta: "Abierto",
          detalle: `Cierra pronto · ${bloque.h_cierre}`,
          motivo: null,
          color: "orange",
        };
      }
      return {
        abierto: true,
        etiqueta: "Abierto",
        detalle: `Cierra en ${formatDuration(restante)} · ${bloque.h_cierre}`,
        motivo: null,
        color: "green",
      };
    }
  }

  for (const bloque of bloquesHoy) {
    const apertura = toMinutes(bloque.h_apertura);
    if (apertura === null) continue;
    if (apertura > minActual) {
      const restante = apertura - minActual;
      return {
        abierto: false,
        etiqueta: "Cerrado",
        detalle: `Abre hoy en ${formatDuration(restante)} · ${bloque.h_apertura}`,
        motivo: null,
        color: restante <= 60 ? "orange" : "red",
      };
    }
  }

  const bloqueManana = primerBloqueValido(diaKeyMañana);
  if (bloqueManana) {
    return {
      abierto: false,
      etiqueta: "Cerrado",
      detalle: `Abre mañana a las ${bloqueManana.h_apertura}`,
      motivo: null,
      color: "red",
    };
  }

  for (let i = 2; i <= 7; i++) {
    const keyProx = DIAS_ES[(diaActual + i) % 7];
    const bloque = primerBloqueValido(keyProx);
    if (bloque) {
      return {
        abierto: false,
        etiqueta: "Cerrado",
        detalle: `Abre el ${keyProx} a las ${bloque.h_apertura}`,
        motivo: null,
        color: "red",
      };
    }
  }

  return {
    abierto: false,
    etiqueta: "Cerrado",
    detalle: "Sin próxima apertura programada",
    motivo: null,
    color: "gray",
  };
}

function renderEstado(est, contenedor) {
  if (!contenedor) return;
  const colorMap = {
    green: { text: "#16a34a", dot: "#22c55e" },
    orange: { text: "#ea580c", dot: "#f97316" },
    red: { text: "#dc2626", dot: "#ef4444" },
    gray: { text: "#6b7280", dot: "#9ca3af" },
  };
  const c = colorMap[est.color] ?? colorMap.gray;

  if (!document.getElementById("horario-style")) {
    const style = document.createElement("style");
    style.id = "horario-style";
    style.textContent = `
      @keyframes horario-pulse {
        0%, 100% { opacity: 1;  transform: scale(1);    }
        50%       { opacity: .4; transform: scale(1.45); }
      }
    `;
    document.head.appendChild(style);
  }

  const pulseStyle = est.abierto
    ? "animation: horario-pulse 1.6s ease-in-out infinite;"
    : "";
  const detalleTexto = est.detalle + (est.motivo ? ` · ${est.motivo}` : "");

  contenedor.innerHTML = `
    <span style="margin-left:5px;display:inline-flex;align-items:center;gap:6px;font-family:inherit;font-size:inherit;line-height:1.3;">
      <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c.dot};flex-shrink:0;${pulseStyle}"></span>
      <span style="color:${c.text};font-weight:600;">${est.etiqueta}</span>
      <span style="color:${c.text};font-weight:400;opacity:.85;">${detalleTexto}</span>
    </span>
  `;
}

function initHorario(selector = "#horario-estado") {
  const contenedor = document.querySelector(selector);
  if (!contenedor || !horarioDocRef) return;
  contenedor.innerHTML = `<span style="color:#9ca3af;font-size:.8rem;">Cargando horario…</span>`;

  onSnapshot(
    horarioDocRef,
    (snap) => {
      if (!snap.exists()) {
        contenedor.innerHTML = `<span style="color:#9ca3af;font-size:.8rem;">Sin datos de horario</span>`;
        return;
      }
      const horario = snap.data()?.horario_atencion;
      if (!horario) {
        contenedor.innerHTML = `<span style="color:#9ca3af;font-size:.8rem;">Horario no configurado</span>`;
        return;
      }
      contenedor._horarioData = horario;
      renderEstado(calcularEstado(horario), contenedor);
    },
    (error) => {
      console.error("[horario] Error Firestore:", error);
      contenedor.innerHTML = `<span style="color:#ef4444;font-size:.8rem;">Error al cargar horario</span>`;
    },
  );

  setInterval(() => {
    if (contenedor._horarioData) {
      renderEstado(calcularEstado(contenedor._horarioData), contenedor);
    }
  }, 60_000);
}

// ═══════════════════════════════════════════════════════════════════
//  HORARIO — EDITOR
// ═══════════════════════════════════════════════════════════════════
const DIAS = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
];

const LABEL = {
  lunes: "Lunes",
  martes: "Martes",
  miércoles: "Miércoles",
  jueves: "Jueves",
  viernes: "Viernes",
  sábado: "Sábado",
  domingo: "Domingo",
};

const MOTIVOS_CIERRE = [
  "Mantenimiento",
  "Renovación",
  "Inventario",
  "Cierre",
  "Emergencia",
  "Limpieza",
  "Clausura",
  "No disponible",
  "Descanso",
];

let estado = {};
let estadoGuardado = {};
let diasAbiertosUI = {};
let _container = null;
let _ignorarSnapshotHorario = 0;

function hayCambios(dia) {
  const actual = estado[dia];
  const guardado = estadoGuardado[dia];
  if (!guardado) return true;

  if (actual.activo !== guardado.activo) return true;
  if (actual.descanso !== guardado.descanso) return true;
  if (!actual.activo && actual.motivo !== guardado.motivo) return true;

  const bActual = actual.descanso
    ? actual.bloques.slice(0, 2)
    : [actual.bloques[0]];
  const bGuardado = guardado.descanso
    ? guardado.bloques.slice(0, 2)
    : [guardado.bloques[0]];

  for (let i = 0; i < bActual.length; i++) {
    if (!bGuardado[i]) return true;
    if (bActual[i].h_apertura !== bGuardado[i].h_apertura) return true;
    if (bActual[i].h_cierre !== bGuardado[i].h_cierre) return true;
  }
  return false;
}

function bloqueDefault() {
  return { h_apertura: "19:00", h_cierre: "22:30" };
}

function convertir12h(hora24) {
  if (!hora24) return "--:-- --";
  let [h, m] = hora24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

function cargarHorario(data) {
  const out = {};
  DIAS.forEach((dia) => {
    const bloques = data?.[dia]?.bloques || [];
    const estaCerrado = data?.[dia]?.cerrado === true;
    const motivoGuardado = data?.[dia]?.motivo || "";

    out[dia] = {
      activo: !estaCerrado,
      descanso: bloques.length > 1,
      mostrar12h: estado[dia]?.mostrar12h || false,
      motivo: motivoGuardado || MOTIVOS_CIERRE[0],
      bloques: bloques.length
        ? bloques.map((b) => ({
            h_apertura: b.h_apertura,
            h_cierre: b.h_cierre,
          }))
        : [bloqueDefault()],
    };

    if (out[dia].descanso && out[dia].bloques.length < 2) {
      out[dia].bloques.push(bloqueDefault());
    }
  });
  estadoGuardado = JSON.parse(JSON.stringify(out));
  return out;
}

function serializarDia(dia) {
  const d = estado[dia];
  if (!d) return {};
  const listaBloques = d.descanso ? d.bloques.slice(0, 2) : [d.bloques[0]];
  return {
    [`horario_atencion.${dia}.cerrado`]: !d.activo,
    [`horario_atencion.${dia}.motivo`]: !d.activo ? d.motivo : "",
    [`horario_atencion.${dia}.bloques`]: listaBloques.map((b) => ({
      h_apertura: b.h_apertura || "19:00",
      h_cierre: b.h_cierre || "22:30",
      stability: 0,
    })),
  };
}

function insertarCSS() {
  if (document.getElementById("he-style")) return;
  const style = document.createElement("style");
  style.id = "he-style";
  style.textContent = `
    .he-container { display:flex; flex-direction:column; gap:16px; color:#fff; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#000; padding:12px; width:100%; box-sizing:border-box; }
    .he-card { background:#161616; border-radius:18px; overflow:hidden; border:1px solid #262626; transition:border-color .3s ease; width:100%; box-sizing:border-box; }
    .he-card.is-expanded { border-color:#3a3a3a; }
    .he-head { display:flex; justify-content:space-between; align-items:center; padding:18px 22px; cursor:pointer; user-select:none; }
    .he-head:hover { background:#1c1c1c; }
    .he-left { font-size:17px; font-weight:600; display:flex; align-items:center; gap:10px; }
    .he-arrow { font-size:12px; color:#666; transition:transform .3s ease; }
    .he-card.is-expanded .he-arrow { transform:rotate(180deg); color:#a000ff; }
    .he-right { display:flex; align-items:center; gap:14px; font-size:14px; color:#aaa; font-weight:500; }
    .he-switch { width:52px; height:30px; background:#a000ff; border-radius:999px; position:relative; cursor:pointer; }
    .he-switch::after { content:""; position:absolute; width:24px; height:24px; border-radius:50%; background:#fff; top:3px; right:3px; transition:all .25s ease; }
    .he-switch.off { background:#333; }
    .he-switch.off::after { right:auto; left:3px; background:#999; }
    .he-body { padding:0 22px 22px; background:#161616; border-top:1px solid #222; display:none; }
    .he-card.is-expanded .he-body { display:block; }
    .he-link { color:#bb33ff; font-size:13.5px; text-decoration:none; font-weight:600; margin:16px 0; display:inline-block; cursor:pointer; }
    .he-options { display:flex; gap:20px; margin-bottom:20px; border-bottom:1px solid #222; padding-bottom:14px; }
    .he-check { display:flex; align-items:center; gap:8px; font-size:14px; cursor:pointer; color:#e0e0e0; }
    .he-check input { width:18px; height:18px; accent-color:#a000ff; cursor:pointer; }
    .he-row-group { display:flex; flex-direction:column; gap:16px; }
    .he-row { display:flex; gap:12px; align-items:center; width:100%; }
    .he-field { display:flex; flex-direction:column; gap:6px; flex:1; }
    .he-field label { font-size:11px; color:#888; font-weight:600; text-transform:uppercase; }
    .he-input { width:100%; height:46px; border-radius:12px; border:1px solid #2a2a2a; background:#1f1f1f; color:#fff; padding:0 12px; font-size:15px; box-sizing:border-box; }
    .he-input:focus { border-color:#a000ff; outline:none; }
    .he-a { font-size:14px; color:#666; font-weight:bold; margin-top:20px; }
    .he-conv-box { background:#1c1c1e; padding:14px; border-radius:14px; margin:16px 0 8px 0; border:1px dashed #3a3a3c; }
    .he-conv-title { font-size:13px; color:#bb33ff; font-weight:700; margin-bottom:6px; }
    .he-conv-grid { display:flex; justify-content:space-between; background:#2c2c2e; padding:10px 14px; border-radius:10px; font-size:13.5px; }
    .he-motivos-container { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; margin:16px 0; }
    .he-motivo-label { display:flex; align-items:center; gap:10px; font-size:13px; color:#d1d1d6; background:#1f1f1f; padding:10px 12px; border-radius:12px; cursor:pointer; border:1px solid #2a2a2a; }
    .he-motivo-label input { accent-color:#a000ff; }
    .he-btn { width:100%; margin-top:14px; border:none; background:#a000ff; color:#fff; padding:14px; border-radius:25px; cursor:pointer; font-size:15px; font-weight:600; transition:background .25s ease, transform .15s ease; animation:heBtnIn .22s ease; }
    .he-btn:active { transform:scale(.97); }
    .he-btn.leaving { animation:heBtnOut .18s ease forwards; pointer-events:none; }
    @keyframes heBtnIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
    @keyframes heBtnOut { from{opacity:1;transform:translateY(0)} to{opacity:0;transform:translateY(-6px)} }
    .he-btn:disabled { background:#3a3a3c; color:#8e8e93; cursor:not-allowed; }

    @media (min-width: 900px) {
      .he-container { flex-direction:row; overflow-x:auto; white-space:nowrap; padding:20px 10px; scroll-behavior:smooth; }
      .he-container::-webkit-scrollbar { height:8px; }
      .he-container::-webkit-scrollbar-track { background:#000; }
      .he-container::-webkit-scrollbar-thumb { background:#333; border-radius:10px; }
      .he-container::-webkit-scrollbar-thumb:hover { background:#444; }
      .he-card { flex:0 0 360px; display:inline-block; vertical-align:top; }
      .he-body { display:block !important; }
      .he-arrow { display:none !important; }
      .he-head { cursor:default; }
      .he-head:hover { background:initial; }
    }
  `;
  document.head.appendChild(style);
}

async function guardarDia(dia, btn) {
  try {
    btn.disabled = true;
    btn.innerText = "Guardando...";

    _ignorarSnapshotHorario++;
    await updateDoc(horarioDocRef, serializarDia(dia));
    estadoGuardado[dia] = JSON.parse(JSON.stringify(estado[dia]));

    btn.dataset.done = "1";
    btn.style.background = "#34c759";
    btn.innerText = "✓ Guardado";

    setTimeout(() => {
      const card = _container?.querySelector(`.he-card[data-dia="${dia}"]`);
      const body = card?.querySelector(".he-body");
      if (body) checkBtn(dia, body);
    }, 2000);
  } catch (e) {
    console.error("Error:", e);
    btn.dataset.done = "1";
    btn.innerText = "Error";
    btn.disabled = false;
    if (_ignorarSnapshotHorario > 0) _ignorarSnapshotHorario--;
  }
}

function buildBody(dia, body) {
  const d = estado[dia];

  if (d.activo) {
    body.innerHTML = `
      <div class="he-link-toggle he-link">${d.mostrar12h ? "Ocultar conversión a 12 h" : "Mostrar conversión a 12 h"}</div>
      <div class="he-options">
        <label class="he-check"><input type="radio" name="tipo_trabajo_${dia}" class="rad-corrido" ${!d.descanso ? "checked" : ""}> Trabajo de corrido</label>
        <label class="he-check"><input type="radio" name="tipo_trabajo_${dia}" class="rad-descanso" ${d.descanso ? "checked" : ""}> Trabajo con descanso</label>
      </div>
      <div class="he-row-group">
        <div class="he-row">
          <div class="he-field"><label>Apertura 1</label><input class="he-input open1" type="time" value="${d.bloques[0]?.h_apertura || "19:00"}"></div>
          <div class="he-a">a</div>
          <div class="he-field"><label>Cierre 1</label><input class="he-input close1" type="time" value="${d.bloques[0]?.h_cierre || "22:30"}"></div>
        </div>
        ${
          d.descanso
            ? `
        <div class="he-row">
          <div class="he-field"><label>Apertura 2</label><input class="he-input open2" type="time" value="${d.bloques[1]?.h_apertura || "19:00"}"></div>
          <div class="he-a">a</div>
          <div class="he-field"><label>Cierre 2</label><input class="he-input close2" type="time" value="${d.bloques[1]?.h_cierre || "22:30"}"></div>
        </div>`
            : ""
        }
      </div>
      ${
        d.mostrar12h
          ? `
      <div class="he-conv-box">
        <div class="he-conv-title">Conversión automática a 12 h</div>
        <div class="he-conv-grid">
          <div><strong>Apertura:</strong> ${convertir12h(d.bloques[0]?.h_apertura)}</div>
          <div><strong>Cierre:</strong> ${convertir12h(d.bloques[0]?.h_cierre)}</div>
        </div>
        ${
          d.descanso && d.bloques[1]
            ? `
        <div class="he-conv-grid" style="margin-top: 8px;">
          <div><strong>Apertura 2:</strong> ${convertir12h(d.bloques[1]?.h_apertura)}</div>
          <div><strong>Cierre 2:</strong> ${convertir12h(d.bloques[1]?.h_cierre)}</div>
        </div>`
            : ""
        }
      </div>`
          : ""
      }
    `;

    body.querySelector(".open1").oninput = (e) => {
      d.bloques[0].h_apertura = e.target.value;
      if (d.mostrar12h) buildBody(dia, body);
      checkBtn(dia, body);
    };
    body.querySelector(".close1").oninput = (e) => {
      d.bloques[0].h_cierre = e.target.value;
      if (d.mostrar12h) buildBody(dia, body);
      checkBtn(dia, body);
    };

    if (d.descanso) {
      body.querySelector(".open2").oninput = (e) => {
        if (!d.bloques[1]) d.bloques[1] = bloqueDefault();
        d.bloques[1].h_apertura = e.target.value;
        if (d.mostrar12h) buildBody(dia, body);
        checkBtn(dia, body);
      };
      body.querySelector(".close2").oninput = (e) => {
        if (!d.bloques[1]) d.bloques[1] = bloqueDefault();
        d.bloques[1].h_cierre = e.target.value;
        if (d.mostrar12h) buildBody(dia, body);
        checkBtn(dia, body);
      };
    }

    body.querySelector(".rad-corrido").onchange = () => {
      d.descanso = false;
      if (window.innerWidth >= 900) {
        buildBody(dia, body);
        checkBtn(dia, body);
      } else {
        renderHorario(_container);
      }
    };
    body.querySelector(".rad-descanso").onchange = () => {
      d.descanso = true;
      if (d.bloques.length < 2) d.bloques.push(bloqueDefault());
      if (window.innerWidth >= 900) {
        buildBody(dia, body);
        checkBtn(dia, body);
      } else {
        renderHorario(_container);
      }
    };
    body.querySelector(".he-link-toggle").onclick = () => {
      d.mostrar12h = !d.mostrar12h;
      buildBody(dia, body);
      checkBtn(dia, body);
    };
  } else {
    body.innerHTML = `
      <div style="font-size:13px;margin-top:12px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.3px;white-space:normal;">Selecciona tu motivo de cierre</div>
      <div class="he-motivos-container">
        ${MOTIVOS_CIERRE.map((m) => `<label class="he-motivo-label"><input type="radio" name="motivo_cierre_${dia}" value="${m}" ${d.motivo === m ? "checked" : ""}> ${m}</label>`).join("")}
      </div>
    `;
    body.querySelectorAll(`input[name="motivo_cierre_${dia}"]`).forEach((r) => {
      r.onchange = (e) => {
        d.motivo = e.target.value;
        checkBtn(dia, body);
      };
    });
  }
}

function checkBtn(dia, body) {
  let btn = body.querySelector(".he-btn");
  if (hayCambios(dia)) {
    if (!btn) {
      btn = document.createElement("button");
      btn.className = "he-btn";
      btn.innerText = "Guardar";
      btn.onclick = () => guardarDia(dia, btn);
      body.appendChild(btn);
    } else {
      clearTimeout(btn._rmT);
      btn.classList.remove("leaving");
      // si venía de "✓ Guardado" o "Error" y el usuario vuelve a editar, se reactiva
      if (btn.dataset.done === "1") {
        delete btn.dataset.done;
        btn.disabled = false;
        btn.style.background = "";
        btn.innerText = "Guardar";
      }
    }
  } else if (btn && !btn.classList.contains("leaving")) {
    btn.classList.add("leaving");
    btn._rmT = setTimeout(() => btn.remove(), 180);
  }
}

function updateCardBody(dia, card) {
  const d = estado[dia];
  const switchEl = card.querySelector(".he-switch");
  const statusEl = card.querySelector(".he-right span");
  if (switchEl) switchEl.className = `he-switch${d.activo ? "" : " off"}`;
  if (statusEl) statusEl.textContent = d.activo ? "Abierto" : "Cerrado";

  const body = card.querySelector(".he-body");
  if (!body) return;
  buildBody(dia, body);
  checkBtn(dia, body);
}

function renderHorario(container) {
  const scrollLeftPos = container.scrollLeft;
  const scrollTopPos = container.scrollTop;

  container.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "he-container";

  DIAS.forEach((dia) => {
    const d = estado[dia];
    const card = document.createElement("div");
    card.className = `he-card ${diasAbiertosUI[dia] === true ? "is-expanded" : ""}`;
    card.dataset.dia = dia;

    const head = document.createElement("div");
    head.className = "he-head";
    head.innerHTML = `
      <div class="he-left">
        <span class="he-arrow">▼</span>
        ${LABEL[dia]}
      </div>
      <div class="he-right">
        <span>${d.activo ? "Abierto" : "Cerrado"}</span>
        <div class="he-switch ${d.activo ? "" : "off"}"></div>
      </div>
    `;

    head.onclick = () => {
      if (window.innerWidth < 900) {
        diasAbiertosUI[dia] = !diasAbiertosUI[dia];
        renderHorario(container);
      }
    };

    head.querySelector(".he-switch").onclick = (e) => {
      e.stopPropagation();
      d.activo = !d.activo;
      if (window.innerWidth >= 900) {
        updateCardBody(dia, card);
      } else {
        diasAbiertosUI[dia] = true;
        renderHorario(container);
      }
    };

    const body = document.createElement("div");
    body.className = "he-body";
    buildBody(dia, body);
    checkBtn(dia, body);
    card.appendChild(head);
    card.appendChild(body);
    wrap.appendChild(card);
  });

  container.appendChild(wrap);

  requestAnimationFrame(() => {
    container.scrollLeft = scrollLeftPos;
    container.scrollTop = scrollTopPos;
  });
}

function initHorarioEditor(selector = "#scheduleBody") {
  insertarCSS();
  const container = document.querySelector(selector);
  if (!container || !horarioDocRef) return;
  _container = container;
  container.innerHTML =
    "<div style='color:#888; text-align:center; padding:30px; font-size:15px; font-weight:500;'>Cargando horario...</div>";

  onSnapshot(
    horarioDocRef,
    (snap) => {
      if (!snap.exists()) return;
      if (_ignorarSnapshotHorario > 0) {
        _ignorarSnapshotHorario--;
        return;
      }
      estado = cargarHorario(snap.data()?.horario_atencion || {});
      renderHorario(container);
    },
    (error) => console.error("Error Snapshot horario:", error),
  );
}

// ═══════════════════════════════════════════════════════════════════
//  ARRANQUE
// ═══════════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  window.PanelPerfil.init();
  initHorario("#horario-estado");
  initHorarioEditor("#scheduleBody");
  if (tiendaId && localidad) {
    initPreciosApp();
    initRealtimeAccount();
  }
});

// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
//  ▼▼▼  LO QUE PASA DATOS A OTRO LADO (iframes / ventana padre)  ▼▼▼
// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════

// ── Estado global que se manda a los iframes ──
function actualizarAppState() {
  const pp = window.PanelPerfil;
  window.APP_STATE.tienda = {
    id_tienda: pp.TIENDA_ID || "",
    nombre_tienda: pp.currentData?.nombre_tienda || "",
    localidad: pp.currentData?.localidad || pp.LOCALIDAD_TIENDA || "",
    categoria_tienda: pp.currentData?.categoria_tienda || "",
    logo_tienda: pp.currentData?.img_tienda?.logo_tienda || "",
    saldo_tienda: Number(window._saldoActual || 0),
    metodo_contacto: pp.currentData?.metodo_contacto || {},
    metodos_pago: pp.currentData?.metodos_pago || {},
    ubicacion: pp.currentData?.ubicacion || {},
    modelo_negocio: pp.currentData?.modelo_negocio,
  };
}

// ── Datos de la tienda → todos los iframes ──
function enviarDatosAFrames() {
  const payload = window.APP_STATE?.tienda;
  if (!payload) return;

  const message = {
    type: "DATOS_TIENDA",
    tipo: "DATOS_TIENDA",
    tiendaId,
    localidad,
    categoriaTienda: payload.categoria_tienda,
    payload,
    id: tiendaId,
  };
  window._datosParaIframe = message;

  document.querySelectorAll("iframe").forEach((frame) => {
    frame.contentWindow?.postMessage(message, window.location.origin);
  });
}

// ── Solo lo que cambió → todos los iframes ──
function enviarPatchAFrames(diff) {
  if (!diff || !Object.keys(diff).length) return;
  document.querySelectorAll("iframe").forEach((frame) => {
    frame.contentWindow?.postMessage(
      { type: "PATCH_TIENDA", payload: diff },
      window.location.origin,
    );
  });
}

// ── Doc de servicios → iframes de publicidad / pedidos / legal ──
let serviciosActuales = null;
const IFRAMES_SERVICIOS = ["iframePublicidad", "iframePedidos", "iframeLegal"];

function enviarServiciosAPublicidad() {
  if (!serviciosActuales) return;
  document.querySelectorAll("iframe").forEach((frame) => {
    frame.contentWindow?.postMessage(
      { type: "SERVICIOS_UPDATE", servicios: serviciosActuales },
      window.location.origin,
    );
  });
}

window.setServiciosParaPublicidad = (servicios) => {
  if (!servicios) return;
  serviciosActuales = servicios;
  enviarServiciosAPublicidad();
};

// ── Cache de saldo / publicidad / planes (para iframes que cargan tarde) ──
const _cache = {
  saldo: 0,
  planes_activacion: null,
  planes_bot_promo: null,
  publicidad: null,
};

function sendCacheToIframe(iframe) {
  try {
    if (window._datosParaIframe) {
      if (window._datosParaIframe.payload) {
        window._datosParaIframe.payload.saldo_tienda = _cache.saldo;
      }
      iframe.contentWindow.postMessage(window._datosParaIframe, "*");
    }
    if (_cache.saldo !== null)
      iframe.contentWindow.postMessage(
        { type: "SALDO_UPDATE", saldo: _cache.saldo },
        "*",
      );
    if (_cache.publicidad)
      iframe.contentWindow.postMessage(
        { type: "PUBLICIDAD_UPDATE", publicidad: _cache.publicidad },
        "*",
      );
    if (_cache.planes_activacion || _cache.planes_bot_promo)
      iframe.contentWindow.postMessage(
        {
          type: "PLANES_UPDATE",
          planes_activacion: _cache.planes_activacion,
          planes_bot_promo: _cache.planes_bot_promo,
          publicidad: _cache.publicidad,
        },
        "*",
      );
  } catch (e) {}
}

function _broadcast(msg) {
  document.querySelectorAll("iframe").forEach((iframe) => {
    try {
      iframe.contentWindow.postMessage(msg, "*");
    } catch (e) {}
  });
  try {
    window.parent.postMessage(msg, "*");
  } catch (e) {}
}

function broadcastSaldo(saldo) {
  _cache.saldo = saldo;
  window._saldoActual = saldo;
  if (window._datosParaIframe?.payload) {
    window._datosParaIframe.payload.saldo_tienda = saldo;
  }
  _broadcast({ type: "SALDO_UPDATE", saldo });
}

function broadcastPublicidad(publicidad) {
  _cache.publicidad = publicidad;
  _broadcast({ type: "PUBLICIDAD_UPDATE", publicidad });
}

function broadcastPlanes(planesActivacion, planesBotPromo, publicidad) {
  _cache.planes_activacion = planesActivacion;
  _cache.planes_bot_promo = planesBotPromo;
  _cache.publicidad = publicidad;
  _broadcast({
    type: "PLANES_UPDATE",
    planes_activacion: planesActivacion,
    planes_bot_promo: planesBotPromo,
    publicidad,
  });
}

// ── Cuando un iframe termina de cargar, se le manda todo lo cacheado ──
function _hookIframe(iframe) {
  iframe.addEventListener("load", () => {
    sendCacheToIframe(iframe);
    enviarServiciosAPublicidad();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("iframe").forEach(_hookIframe);

  new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node.tagName === "IFRAME") _hookIframe(node);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
});

// ── Un iframe pide los datos → se los mandamos ──
window.addEventListener("message", (e) => {
  if (e.origin !== window.location.origin) return;

  if (e.data?.type === "PEDIR_DATOS_TIENDA") {
    if (window._datosParaIframe) {
      e.source?.postMessage(window._datosParaIframe, window.location.origin);
    }
    enviarServiciosAPublicidad();
  }
});
