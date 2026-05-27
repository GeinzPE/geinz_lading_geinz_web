// ─────────────────────────────────────────────
//  PARÁMETROS DE URL / SESSION
// ─────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const tiendaId = params.get("id") || sessionStorage.getItem("tiendaId");
const localidad =
  params.get("localidad") || sessionStorage.getItem("localidad");

if (!tiendaId || !localidad) {
  console.warn("⚠️ Parámetros inválidos, redirigiendo al login...");
  window.location.href = "../login/index.html";
}

// ─────────────────────────────────────────────
//  ESTADO GLOBAL
// ─────────────────────────────────────────────
window.APP_STATE = { tienda: null };

// ═════════════════════════════════════════════
//  PANEL PERFIL
// ═════════════════════════════════════════════
window.PanelPerfil = {
  // ── Estado interno ──────────────────────────
  activeSection: "perfil",
  currentData: {},
  _prevData: {},
  _firstLoad: true,
  _fieldBtnsReady: false,
  _avatarPendingDataURL: null,
  _originalValues: {},
  _originalSubcats: [],
  _pendingLat: null,
  _pendingLng: null,
  _ignorarSnapshot: 0,
  saveTimer: null,
  publicidadLoaded: false,
  selectedCat: "",
  selectedSubcats: [],
  categoriasDB: {},
  map: null,
  mapMarker: null,

  // ── IDs / refs Firebase ─────────────────────
  TIENDA_ID: tiendaId,
  LOCALIDAD_TIENDA: localidad,
  TIENDA_REF: null,
  _firebaseApp: null,

  // ── Módulos Firebase cacheados ──────────────
  // Firestore
  db: null,
  _doc: null,
  _onSnapshot: null,
  _updateDoc: null,
  _getDoc: null,
  _getDocs: null,
  _collection: null,
  _deleteField: null,
  // Storage
  _storage: null,
  _storageRef: null,
  _uploadBytes: null,
  _getDownloadURL: null,
  _deleteObject: null,

  // ═══════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════
  init() {
    this._bindEvents();
    this._injectFieldSaveBtnStyles();
    this._initDraggableBtn();
    this._initFirebase();
  },

  async _initFirebase() {
    try {
      const [appModule, fsModule, stModule] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"),
        import("https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js"),
      ]);

      const firebaseConfig = {
        apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
        authDomain: "geinzworkapp.firebaseapp.com",
        projectId: "geinzworkapp",
        storageBucket: "geinzworkapp.appspot.com",
        messagingSenderId: "921389328767",
        appId: "1:921389328767:web:dc6fffc43a51444f5b524a",
      };

      this._firebaseApp =
        appModule.getApps().find((a) => a.name === "[DEFAULT]") ||
        appModule.initializeApp(firebaseConfig);

      // ── Cachear Firestore ──
      this.db = fsModule.getFirestore(this._firebaseApp);
      this._doc = fsModule.doc;
      this._onSnapshot = fsModule.onSnapshot;
      this._updateDoc = fsModule.updateDoc;
      this._getDoc = fsModule.getDoc;
      this._getDocs = fsModule.getDocs;
      this._collection = fsModule.collection;
      this._deleteField = fsModule.deleteField;

      // ── Cachear Storage ──
      this._storage = stModule.getStorage(this._firebaseApp);
      this._storageRef = stModule.ref;
      this._uploadBytes = stModule.uploadBytes;
      this._getDownloadURL = stModule.getDownloadURL;
      this._deleteObject = stModule.deleteObject;

      this.TIENDA_REF = this._doc(
        this.db,
        "Tiendas",
        this.LOCALIDAD_TIENDA,
        this.LOCALIDAD_TIENDA,
        this.TIENDA_ID,
      );

      this._initRealtime();
    } catch (err) {
      console.error("Error cargando Firebase:", err);
      this.showToast("Error al conectar con Firebase");
    }
  },

  // ═══════════════════════════════════════════
  //  FIRESTORE — TIEMPO REAL
  // ═══════════════════════════════════════════
  _initRealtime() {
    document.querySelector(".app")?.classList.add("loading-data");

    this._onSnapshot(
      this.TIENDA_REF,
      (snap) => {
        if (!snap.exists()) {
          this.showToast("⚠️ Documento no encontrado");
          return;
        }

        const next = snap.data();

        // Detectar qué cambió (omitir en primera carga)
        if (!this._firstLoad) {
          const diff = this._diffData(this._prevData, next);
          if (Object.keys(diff).length === 0) return; // nada cambió
          this._prevData = { ...next };
          this.currentData = next;
          this._patchUI(diff);
          this._updateAPPState();
          enviarPatchAFrames(diff);
          return;
        }

        // Primera carga completa
        this._prevData = { ...next };
        this.currentData = next;
        this._firstLoad = false;
        this._updateAPPState();

        this.populateUI(next);
        this.loadCategorias();

        document.querySelector(".app")?.classList.remove("loading-data");
        const sk = document.getElementById("skeletonOverlay");
        if (sk) {
          sk.classList.add("hidden");
          setTimeout(() => sk.remove(), 450);
        }

        enviarDatosAFrames();
      },
      (err) => {
        console.error("❌ Error Firestore:", err);
        this.showToast("Error al conectar con Firestore");
        document.querySelector(".app")?.classList.remove("loading-data");
      },
    );
  },

  // ── Diff plano de dos objetos ────────────────
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

  // ── Patch UI ligero (solo campos que cambiaron) ──
  _patchUI(diff) {
    for (const key of Object.keys(diff)) {
      const val = diff[key];

      // Nombre
      if (key === "nombre_tienda") {
        this.setField("businessName", val || "");
        this._updateNameSilent(val || "");
        this._originalValues["businessName"] = val || "";
      }
      // Descripción
      else if (key === "descripcion") {
        this.setField("businessDesc", val || "");
        this._updateDescSilent(val || "");
        this._originalValues["businessDesc"] = val || "";
      }
      // Logo
      else if (key === "img_tienda.logo_tienda") {
        this.loadAvatar(val || "");
      }
      // Aforo
      else if (key === "aforo_max") {
        this.setField("fieldAforo", val);
        this._originalValues["fieldAforo"] = String(val ?? "");
      }
      // Dirección
      else if (key === "ubicacion.dirección") {
        this.setField("fieldDireccion", val || "");
        this._originalValues["fieldDireccion"] = val || "";
      }
      // Referencia
      else if (key === "ubicacion.referencia") {
        this.setField("fieldReferencia", val || "");
        this._originalValues["fieldReferencia"] = val || "";
      }
      // Teléfono
      else if (key === "metodo_contacto.llamada.numero") {
        this.setField("fieldTelefono", val || "");
        this._originalValues["fieldTelefono"] = val || "";
      }
      // WhatsApp
      else if (key === "metodo_contacto.whatsapp.numero") {
        this.setField("fieldWhatsapp", val || "");
        this._originalValues["fieldWhatsapp"] = val || "";
      }
      // Instagram
      else if (key === "metodo_contacto.instagram.nombre") {
        const formatted = val ? (val.startsWith("@") ? val : "@" + val) : "";
        this.setField("fieldInstagram", formatted);
        this._originalValues["fieldInstagram"] = formatted;
      }
      // Facebook
      else if (key === "metodo_contacto.facebook.url") {
        this.setField("fieldFacebook", val || "");
        this._originalValues["fieldFacebook"] = val || "";
      }
      // TikTok
      else if (key === "metodo_contacto.tiktok.url") {
        this.setField("fieldTiktok", val || "");
        this._originalValues["fieldTiktok"] = val || "";
      }
      // Sitio web
      else if (key === "metodo_contacto.sitio_web.url") {
        this.setField("fieldWeb", val || "");
        this._originalValues["fieldWeb"] = val || "";
      }
      // Subcategorías
      else if (key === "subcategoria") {
        this.selectedSubcats = Array.isArray(val)
          ? val.map((s) => s.toLowerCase())
          : [];
        this._originalSubcats = [...this.selectedSubcats];
        this.renderSubcategorias();
        this.updateCatDisplay();
      }
      // Imágenes — solo re-renderizar la grid afectada
      else if (key.startsWith("img_tienda.lista_img.")) {
        const tipo = key.split(".")[2];
        if (tipo === "ambientales" || tipo === "servicios_productos") {
          const gridMap = {
            ambientales: "ambienteGrid",
            servicios_productos: "productosGrid",
          };
          this.populatePhotoGrid(gridMap[tipo], val || [], 6, tipo);
        } else if (tipo === "promociones") {
          this.populatePromocionesGrid("promocionesGrid", val || {}, 3);
        }
      }
    }
  },

  // ─────────────────────────────────────────────
  //  APP STATE
  // ─────────────────────────────────────────────
  // En panel_perfil.js — _updateAPPState()
  _updateAPPState() {
    window.APP_STATE.tienda = {
      id_tienda: this.TIENDA_ID || "",
      nombre_tienda: this.currentData?.nombre_tienda || "",
      localidad: this.currentData?.localidad || this.LOCALIDAD_TIENDA || "",
      categoria_tienda: this.currentData?.categoria_tienda || "",
      logo_tienda: this.currentData?.img_tienda?.logo_tienda || "",
      saldo_tienda: Number(window._saldoActual || 0),
      // ── Agregar estos ──
      metodo_contacto: this.currentData?.metodo_contacto || {},
      metodos_pago: this.currentData?.metodos_pago || {},
      ubicacion: this.currentData?.ubicacion || {},
    };
  },
  // ═══════════════════════════════════════════
  //  UI — CARGA INICIAL COMPLETA
  // ═══════════════════════════════════════════
  populateUI(data) {
    this.setField("businessName", data.nombre_tienda || "");
    this._updateNameSilent(data.nombre_tienda || "");

    this.setField("businessDesc", data.descripcion || "");
    this._updateDescSilent(data.descripcion || "");

    this.loadAvatar(data.img_tienda?.logo_tienda || data.logo_tienda || "");

    if (data.categoria_tienda) this.selectedCat = data.categoria_tienda;

    if (Array.isArray(data.subcategoria) && data.subcategoria.length) {
      this.selectedSubcats = data.subcategoria.map((s) => s.toLowerCase());
    }

    this.updateCatDisplay();

    if (data.ubicacion) {
      this.setField("fieldDireccion", data.ubicacion["dirección"] || "");
      this.setField("fieldReferencia", data.ubicacion.referencia || "");
    }

    const mc = data.metodo_contacto || {};
    this.setField("fieldTelefono", mc.llamada?.numero || "");
    this.setField("fieldWhatsapp", mc.whatsapp?.numero || "");
    this.setField(
      "fieldInstagram",
      mc.instagram?.nombre
        ? mc.instagram.nombre.startsWith("@")
          ? mc.instagram.nombre
          : "@" + mc.instagram.nombre
        : "",
    );
    this.setField("fieldFacebook", mc.facebook?.url || "");
    this.setField("fieldTiktok", mc.tiktok?.url || "");
    this.setField("fieldWeb", mc.sitio_web?.url || "");
    this.setField("fieldEmail", mc.email || "");

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

    if (mp.yape) {
      this.setField("fieldYapeTitular", mp.yape.nombre || "");
      this.setField("fieldYapeAlias", mp.yape.numero || "");
    }
    if (mp.plin) {
      this.setField("fieldPlinTitular", mp.plin.nombre || "");
      this.setField("fieldPlinAlias", mp.plin.numero || "");
    }

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
    if (imgs?.promociones)
      this.populatePromocionesGrid("promocionesGrid", imgs.promociones, 3);

    if (data.aforo_max !== undefined)
      this.setField("fieldAforo", data.aforo_max);

    // Guardar originales
    this._originalValues = {
      businessName: data.nombre_tienda || "",
      businessDesc: data.descripcion || "",
      fieldAforo: data.aforo_max !== undefined ? String(data.aforo_max) : "",
      fieldDireccion: data.ubicacion?.["dirección"] || "",
      fieldReferencia: data.ubicacion?.referencia || "",
      fieldTelefono: mc.llamada?.numero || "",
      fieldWhatsapp: mc.whatsapp?.numero || "",
      fieldInstagram: mc.instagram?.nombre
        ? mc.instagram.nombre.startsWith("@")
          ? mc.instagram.nombre
          : "@" + mc.instagram.nombre
        : "",
      fieldFacebook: mc.facebook?.url || "",
      fieldTiktok: mc.tiktok?.url || "",
      fieldWeb: mc.sitio_web?.url || "",
      fieldYapeTitular: mp.yape?.nombre || "",
      fieldYapeAlias: mp.yape?.numero || "",
      fieldPlinTitular: mp.plin?.nombre || "",
      fieldPlinAlias: mp.plin?.numero || "",
    };
    this._originalSubcats = [...this.selectedSubcats];

    // Botones de campo (solo una vez)
    if (!this._fieldBtnsReady) {
      this._fieldBtnsReady = true;
      setTimeout(() => this._setupFieldSaveBtns(), 100);
    }

    // Mapa
    if (!this.map) setTimeout(() => this.initMapbox(), 400);
    setTimeout(() => this._checkVincularBtn(), 10);
  },

  // ═══════════════════════════════════════════
  //  CATEGORÍAS
  // ═══════════════════════════════════════════
  async loadCategorias() {
    try {
      const colRef = this._collection(
        this.db,
        "Tiendas",
        "categorias",
        "categorias",
      );
      const snap = await this._getDocs(colRef);
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

  askChangeCategoria(newCat) {
    if (
      !confirm("Cambiar categoría reiniciará las subcategorías.\n\n¿Continuar?")
    )
      return;
    this.selectedCat = newCat;
    this.selectedSubcats = [];
    this.renderCategorias();
    this.renderSubcategorias();
    this.updateCatDisplay();
    this.showSaveFab();
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
    const profileSection = document.getElementById("sec-perfil");
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

            const storageRef = this._storageRef(
              this._storage,
              `tiendas/${this.TIENDA_ID}/logo/logo.webp`,
            );
            await this._uploadBytes(storageRef, blob, {
              contentType: "image/webp",
            });
            const finalURL = await this._getDownloadURL(storageRef);

            await this._updateDoc(this.TIENDA_REF, {
              "img_tienda.logo_tienda": finalURL,
            });

            const lugarRef = this._doc(this.db, "lugares", this.TIENDA_ID);
            await this._updateDoc(lugarRef, { img: finalURL });

            this.loadAvatar(finalURL);
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

    if (profileSection) {
      profileSection.addEventListener("input", (e) => {
        if (this.activeSection !== "perfil") return;
        if (e.target.closest("#sec-publicidad")) return;
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
          this._checkFieldChanged(e.target.id);
        }
      });
    }

    document
      .querySelectorAll('.pay-methods-wrapper input[type="checkbox"]')
      .forEach((cb) => {
        cb.addEventListener("change", function () {
          if (window.PanelPerfil.activeSection !== "perfil") return;
          const method = this.dataset.method;
          if (method) window.PanelPerfil.togglePayMethod(method, this.checked);
        });
      });

    document
      .querySelectorAll('.contact-methods-wrapper input[type="checkbox"]')
      .forEach((cb) => {
        cb.addEventListener("change", function () {
          if (window.PanelPerfil.activeSection !== "perfil") return;
          const contact = this.dataset.contact;
          if (contact)
            window.PanelPerfil.toggleContactMethod(contact, this.checked);
        });
      });

    document
      .querySelectorAll("textarea.form-input")
      .forEach((el) => this.autoResize(el));
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
      @keyframes fieldBtnIn { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
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
        btn.classList.remove("visible", "saving");
        btn.innerHTML = `✓ Guardar ${label}`;
      } catch {
        btn.classList.remove("saving");
        btn.innerHTML = `✓ Guardar ${label}`;
      }
    };
    return btn;
  },

  _showFieldBtn(btn) {
    btn?.classList.add("visible");
  },
  _hideFieldBtn(btn) {
    btn?.classList.remove("visible");
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

    const fieldDefs = [
      {
        id: "fieldTelefono",
        label: "teléfono",
        save: async (val) => {
          await fs._updateDoc(fs.TIENDA_REF, {
            "metodo_contacto.llamada.numero": val,
          });
          fs._originalValues["fieldTelefono"] = val;
          fs.showToast("✓ Teléfono guardado");
        },
      },
      {
        id: "fieldWhatsapp",
        label: "WhatsApp",
        save: async (val) => {
          await fs._updateDoc(fs.TIENDA_REF, {
            "metodo_contacto.whatsapp.numero": val,
          });
          fs._originalValues["fieldWhatsapp"] = val;
          fs.showToast("✓ WhatsApp guardado");
        },
      },
      {
        id: "fieldInstagram",
        label: "Instagram",
        save: async (val) => {
          const clean = val.replace("@", "");
          await fs._updateDoc(fs.TIENDA_REF, {
            "metodo_contacto.instagram.nombre": clean,
          });
          fs._originalValues["fieldInstagram"] = "@" + clean;
          fs.showToast("✓ Instagram guardado");
        },
      },
      {
        id: "fieldFacebook",
        label: "Facebook",
        save: async (val) => {
          await fs._updateDoc(fs.TIENDA_REF, {
            "metodo_contacto.facebook.url": val,
          });
          fs._originalValues["fieldFacebook"] = val;
          fs.showToast("✓ Facebook guardado");
        },
      },
      {
        id: "fieldTiktok",
        label: "TikTok",
        save: async (val) => {
          await fs._updateDoc(fs.TIENDA_REF, {
            "metodo_contacto.tiktok.url": val,
          });
          fs._originalValues["fieldTiktok"] = val;
          fs.showToast("✓ TikTok guardado");
        },
      },
      {
        id: "fieldWeb",
        label: "sitio web",
        save: async (val) => {
          await fs._updateDoc(fs.TIENDA_REF, {
            "metodo_contacto.sitio_web.url": val,
          });
          fs._originalValues["fieldWeb"] = val;
          fs.showToast("✓ Sitio web guardado");
        },
      },
      {
        id: "businessName",
        label: "nombre",
        save: async (val) => {
          if (!val.trim()) return;
          await fs._updateDoc(fs.TIENDA_REF, {
            nombre_tienda: val,
            nombre_lower: val.toLowerCase(),
          });
          fs._originalValues["businessName"] = val;
          fs._updateNameSilent(val);
          fs.showToast("✓ Nombre guardado");
        },
      },
      {
        id: "businessDesc",
        label: "descripción",
        save: async (val) => {
          await fs._updateDoc(fs.TIENDA_REF, { descripcion: val });
          fs._originalValues["businessDesc"] = val;
          fs._updateDescSilent(val);
          fs.showToast("✓ Descripción guardada");
        },
      },
      {
        id: "fieldAforo",
        label: "aforo",
        save: async (val) => {
          const num = parseInt(val);
          if (isNaN(num)) return;
          await fs._updateDoc(fs.TIENDA_REF, { aforo_max: num });
          fs._originalValues["fieldAforo"] = String(num);
          fs.showToast("✓ Aforo guardado");
        },
      },
      {
        id: "fieldDireccion",
        label: "dirección",
        save: async (val) => {
          await fs._updateDoc(fs.TIENDA_REF, { "ubicacion.dirección": val });
          fs._originalValues["fieldDireccion"] = val;
          fs.showToast("✓ Dirección guardada");
        },
      },
      {
        id: "fieldReferencia",
        label: "referencia",
        save: async (val) => {
          await fs._updateDoc(fs.TIENDA_REF, { "ubicacion.referencia": val });
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
        const { lat, lng } = { lat: this._pendingLat, lng: this._pendingLng };

        await this._updateDoc(this.TIENDA_REF, {
          "ubicacion.latitud": lat,
          "ubicacion.longitud": lng,
        });

        const lugarRef = this._doc(this.db, "lugares", this.TIENDA_REF.id);
        await this._updateDoc(lugarRef, {
          "ubicacion.latitud": lat,
          "ubicacion.longitud": lng,
        });

        this.currentData.ubicacion = {
          ...this.currentData.ubicacion,
          latitud: lat,
          longitud: lng,
        };
        this._pendingLat = null;
        this._pendingLng = null;

        btn.classList.remove("visible", "saving");
        btn.innerHTML = "✓ Guardar nueva ubicación";
        this.showToast("✓ Ubicación guardada");
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
    const expCategoria = document.getElementById("expCategoria");
    const body = expCategoria?.querySelector(".expand-body");
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
        await this._updateDoc(this.TIENDA_REF, {
          subcategoria: this.selectedSubcats,
        });

        const lugarRef = this._doc(this.db, "lugares", this.TIENDA_REF.id);
        await this._updateDoc(lugarRef, { tag: this.selectedSubcats });

        this._originalSubcats = [...this.selectedSubcats];
        btn.classList.remove("visible", "saving");
        btn.innerHTML = "✓ Guardar subcategorías";
        this.showToast("✓ Subcategorías guardadas");
      } catch (e) {
        console.error(e);
        btn.classList.remove("saving");
        btn.innerHTML = "✓ Guardar subcategorías";
        this.showToast("❌ Error al guardar");
      }
    };

    body.appendChild(btn);
  },

  // ═══════════════════════════════════════════
  //  MAPBOX
  // ═══════════════════════════════════════════
  initMapbox() {
    mapboxgl.accessToken =
      "pk.eyJ1IjoiYmVuamFtaW5sb3BleiIsImEiOiJjbWZrajJ2NHIxOXBkMmtvZW1kMTA5NWNoIn0.7s_234BN9y0pkTIgtF6ikw";

    const lat = this.currentData?.ubicacion?.latitud || -10.7594699;
    const lng = this.currentData?.ubicacion?.longitud || -77.7608478;

    this.map = new mapboxgl.Map({
      container: "mapBoxPerfil",
      style: "mapbox://styles/benjaminlopez/cmm9c0hlt003901s54utw9p30",
      center: [lng, lat],
      zoom: 18,
      pitch: 45,
      bearing: 0,
    });

    this.mapMarker = new mapboxgl.Marker({ color: "#7c4dff", draggable: true })
      .setLngLat([lng, lat])
      .addTo(this.map);

    this.mapMarker.on("dragend", () => {
      const pos = this.mapMarker.getLngLat();
      this._onMapPointChanged(pos.lat, pos.lng);
    });

    this.map.on("click", (e) =>
      this._onMapPointChanged(e.lngLat.lat, e.lngLat.lng),
    );
  },

  async _onMapPointChanged(lat, lng) {
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

    this._pendingLat = lat;
    this._pendingLng = lng;
    const btn = document.getElementById("fieldSaveBtn-coordenadas");
    if (btn) this._showFieldBtn(btn);
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

  openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add("open");
    modal.querySelector(".modal-sheet")?.classList.add("open");
    if (id === "modalFotoPerfil") this._prepareAvatarModal();
  },

  closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove("open");
    modal.querySelector(".modal-sheet")?.classList.remove("open");
  },

  _prepareAvatarModal() {
    const preview = document.getElementById("avatarModalPreview");
    const placeholder = document.getElementById("avatarModalPlaceholder");
    const btnSave = document.getElementById("btnSaveAvatarImg");

    if (preview) {
      preview.src = "";
      preview.style.display = "none";
    }
    if (placeholder) placeholder.style.display = "flex";
    if (btnSave) {
      btnSave.style.display = "none";
      btnSave.disabled = false;
      btnSave.textContent = "✓ Guardar foto";
    }

    this._avatarPendingDataURL = null;

    const input = document.getElementById("avatarFileInputHtml");
    if (!input) return;
    input.onchange = null;
    input.value = "";

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        this._avatarPendingDataURL = ev.target.result;
        this._showAvatarPreview(ev.target.result);
      };
      reader.readAsDataURL(file);
      input.value = "";
    };

    document.getElementById("btnSaveAvatarImg").onclick = () =>
      this.applyProfileImg();
  },

  _showAvatarPreview(dataURL) {
    const preview = document.getElementById("avatarModalPreview");
    const placeholder = document.getElementById("avatarModalPlaceholder");
    const btnSave = document.getElementById("btnSaveAvatarImg");

    if (preview) {
      preview.src = dataURL;
      preview.style.display = "block";
    }
    if (placeholder) placeholder.style.display = "none";
    if (btnSave) btnSave.style.display = "flex";
  },

  async applyProfileImg() {
    if (!confirm("¿Guardar esta imagen como logo de tu negocio?")) return;

    const dataURL = this._avatarPendingDataURL;
    if (!dataURL) {
      this.showToast("Selecciona una imagen primero");
      return;
    }

    const btnSave = document.getElementById("btnSaveAvatarImg");
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.textContent = "Subiendo...";
    }

    try {
      const comprimida = await this._comprimirImagen(dataURL, 512, 0.82);
      const blob = this._dataURLtoBlob(comprimida);

      const storageRef = this._storageRef(
        this._storage,
        `tiendas/${this.TIENDA_ID}/logo/logo.webp`,
      );
      await this._uploadBytes(storageRef, blob, { contentType: "image/webp" });
      const finalURL = await this._getDownloadURL(storageRef);

      await this._updateDoc(this.TIENDA_REF, {
        "img_tienda.logo_tienda": finalURL,
      });

      const lugarRef = this._doc(this.db, "lugares", this.TIENDA_ID);
      await this._updateDoc(lugarRef, { img: finalURL });

      this.loadAvatar(finalURL);
      this._avatarPendingDataURL = null;
      this.closeModal("modalFotoPerfil");
      this.showToast("✓ Logo actualizado");
    } catch (e) {
      console.error("Error subiendo logo:", e);
      this.showToast("❌ Error al subir imagen");
    } finally {
      if (btnSave) {
        btnSave.disabled = false;
        btnSave.textContent = "Guardar";
      }
    }
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

  // ═══════════════════════════════════════════
  //  SUBIR FOTO GRID
  // ═══════════════════════════════════════════
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

          const storageRef = this._storageRef(this._storage, path);
          await this._uploadBytes(storageRef, blob, {
            contentType: "image/webp",
          });
          const finalURL = await this._getDownloadURL(storageRef);

          const snap = await this._getDoc(this.TIENDA_REF);
          const rawLista = snap.data()?.img_tienda?.lista_img?.[tipo] || [];
          const lista = this._buildSlotArray(rawLista, 6);
          lista[slotIndex] = finalURL;

          this._ignorarSnapshot++;
          await this._updateDoc(this.TIENDA_REF, {
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

  // ═══════════════════════════════════════════
  //  ELIMINAR FOTO GRID
  // ═══════════════════════════════════════════
  async deleteFotoGrid(tipo, slotIndex) {
    if (!confirm("¿Eliminar esta foto?")) return;
    this.showToast("⏳ Eliminando...");

    try {
      const path = `tiendas/${this.TIENDA_ID}/imagenes/${tipo}/slot_${slotIndex}.webp`;
      try {
        await this._deleteObject(this._storageRef(this._storage, path));
      } catch {
        /* no existía */
      }

      const snap = await this._getDoc(this.TIENDA_REF);
      const rawLista = snap.data()?.img_tienda?.lista_img?.[tipo] || [];
      const lista = this._buildSlotArray(rawLista, 6);
      lista[slotIndex] = null;

      this._ignorarSnapshot++;
      await this._updateDoc(this.TIENDA_REF, {
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
  //  PROMOCIONES
  // ═══════════════════════════════════════════
  openFotoPromocion(oldKey) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (
        !confirm(
          oldKey
            ? "¿Reemplazar esta promoción?"
            : "¿Subir esta imagen como nueva promoción?",
        )
      )
        return;

      const reader = new FileReader();
      reader.onload = async (ev) => {
        this._showUploadLoading(
          "Subiendo promoción...",
          "Comprimiendo y guardando",
        );
        try {
          const newKey = String(Math.floor(Math.random() * 9000000) + 1000000);
          const blob = this._dataURLtoBlob(
            await this._comprimirImagen(ev.target.result, 1024, 0.85),
          );
          const path = `tiendas/${this.TIENDA_ID}/imagenes/promociones/${newKey}.webp`;
          const storageRef = this._storageRef(this._storage, path);

          await this._uploadBytes(storageRef, blob, {
            contentType: "image/webp",
          });
          const finalURL = await this._getDownloadURL(storageRef);

          if (oldKey) {
            try {
              await this._deleteObject(
                this._storageRef(
                  this._storage,
                  `tiendas/${this.TIENDA_ID}/imagenes/promociones/${oldKey}.webp`,
                ),
              );
            } catch {
              /* no existía */
            }
          }

          const updates = {};
          if (oldKey)
            updates[`img_tienda.lista_img.promociones.${oldKey}`] =
              this._deleteField();
          updates[`img_tienda.lista_img.promociones.${newKey}`] = finalURL;

          this._ignorarSnapshot++;
          await this._updateDoc(this.TIENDA_REF, updates);

          const snapPromo = await this._getDoc(this.TIENDA_REF);
          this.populatePromocionesGrid(
            "promocionesGrid",
            snapPromo.data()?.img_tienda?.lista_img?.promociones || {},
            3,
          );

          this.showToast("✓ Promoción actualizada");
        } catch (err) {
          console.error("Error subiendo promoción:", err);
          this.showToast("❌ Error al subir");
        } finally {
          this._hideUploadLoading();
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  },

  async deleteFotoPromocion(key) {
    if (!confirm("¿Eliminar esta promoción?")) return;
    this.showToast("⏳ Eliminando...");

    try {
      const path = `tiendas/${this.TIENDA_ID}/imagenes/promociones/${key}.webp`;
      try {
        await this._deleteObject(this._storageRef(this._storage, path));
      } catch {
        /* no existía */
      }

      this._ignorarSnapshot++;
      await this._updateDoc(this.TIENDA_REF, {
        [`img_tienda.lista_img.promociones.${key}`]: this._deleteField(),
      });

      const snapDel = await this._getDoc(this.TIENDA_REF);
      this.populatePromocionesGrid(
        "promocionesGrid",
        snapDel.data()?.img_tienda?.lista_img?.promociones || {},
        3,
      );

      this.showToast("✓ Promoción eliminada");
    } catch (err) {
      console.error("Error eliminando promoción:", err);
      this.showToast("❌ Error al eliminar");
    }
  },

  populatePromocionesGrid(gridId, promosMap, maxSlots) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = "";

    const entries = Object.entries(promosMap || {});

    entries.forEach(([key, url]) => {
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
        setTimeout(() => {
          img.style.opacity = "1";
        }, 50);
      };
      img.onerror = () => {
        sk.style.display = "none";
        wrap.innerHTML =
          '<span style="font-size:20px;opacity:0.25;position:absolute;inset:0;display:flex;align-items:center;justify-content:center">🖼️</span>';
      };
      img.src = url;
      wrap.appendChild(img);

      const btnDel = document.createElement("button");
      btnDel.innerHTML = "🗑️";
      btnDel.style.cssText =
        "position:absolute;top:6px;right:6px;z-index:10;background:rgba(0,0,0,0.6);border:none;border-radius:8px;padding:4px 8px;cursor:pointer;font-size:13px;";
      btnDel.onclick = (e) => {
        e.stopPropagation();
        this.deleteFotoPromocion(key);
      };
      wrap.onclick = () => this.openFotoPromocion(key);
      wrap.appendChild(btnDel);
      grid.appendChild(wrap);
    });

    for (let i = entries.length; i < maxSlots; i++) {
      const div = document.createElement("div");
      div.className = "photo-item photo-item-add";
      div.innerHTML = "<span>📷</span><span>Agregar</span>";
      div.onclick = () => this.openFotoPromocion(null);
      grid.appendChild(div);
    }
  },
  // ═══════════════════════════════════════════
  //  VINCULAR CUENTA
  // ═══════════════════════════════════════════
  async _checkVincularBtn() {
    try {
      const { getAuth } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
      const { arrayUnion } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      this._arrayUnion = arrayUnion;

      const auth = getAuth(this._firebaseApp);
      const user = auth.currentUser;

      // Si no hay sesión activa, mostrar el botón igual
      if (!user) {
        this._mostrarBtnVincular(true);
        return;
      }

      const uid = user.uid;
      const propietarios = this.currentData?.propietario_id || [];
      const yaVinculado = propietarios.includes(uid);

      this._mostrarBtnVincular(!yaVinculado);
    } catch (e) {
      console.error("Error _checkVincularBtn:", e);
    }
  },

  _mostrarBtnVincular(mostrar) {
    const wrap = document.querySelector(".sidebar-vincular-wrap");
    if (wrap) wrap.style.display = mostrar ? "flex" : "none";
  },

  async vincularCuenta() {
    try {
      const { getAuth } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
      const { arrayUnion, doc, getDoc, updateDoc } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

      const auth = getAuth(this._firebaseApp);
      const user = auth.currentUser;

      if (!user) {
        this.showToast("⚠️ Debes iniciar sesión primero");
        return;
      }

      const uid = user.uid;

      // Verificar si ya está vinculado a ESTE negocio
      const propietarios = this.currentData?.propietario_id || [];
      if (propietarios.includes(uid)) {
        this.showToast("✅ Ya estás vinculado a este negocio");
        this._mostrarBtnVincular(false);
        return;
      }

      // Verificar si el usuario ya tiene otra tienda registrada
      const userRef = doc(
        this.db,
        "Trabajadores_Usuarios_Drivers",
        "users",
        "users",
        uid,
      );
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists() ? userSnap.data() : {};
      const tiendaAnterior = userData?.id_tienda_propietario || null;

      let mensajeConfirm =
        "¿Vincular tu cuenta actual a este negocio?\n\nPodrás acceder sin necesidad del enlace la próxima vez.";

      if (tiendaAnterior && tiendaAnterior !== this.TIENDA_ID) {
        mensajeConfirm =
          "⚠️ Ya tienes una tienda vinculada anteriormente.\n\n" +
          "Al continuar, tu cuenta se desvinculará de la tienda anterior " +
          "y quedará vinculada únicamente a este negocio.\n\n¿Deseas continuar?";
      }

      const confirmar = confirm(mensajeConfirm);
      if (!confirmar) return;

      // Si tenía tienda anterior, eliminar su UID de propietario_id de esa tienda
      if (tiendaAnterior && tiendaAnterior !== this.TIENDA_ID) {
        try {
          const { arrayRemove } =
            await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
          const tiendaAnteriorRef = doc(
            this.db,
            "Tiendas",
            this.LOCALIDAD_TIENDA,
            this.LOCALIDAD_TIENDA,
            tiendaAnterior,
          );
          await updateDoc(tiendaAnteriorRef, {
            propietario_id: arrayRemove(uid),
          });
        } catch (e) {
          console.warn("No se pudo limpiar tienda anterior:", e);
        }
      }

      // Vincular UID a este negocio
      await this._updateDoc(this.TIENDA_REF, {
        propietario_id: arrayUnion(uid),
      });

      // Guardar id_tienda_propietario en el documento del usuario
      await updateDoc(userRef, {
        id_tienda_propietario: this.TIENDA_ID,
      });

      // Actualizar estado local
      if (!this.currentData.propietario_id)
        this.currentData.propietario_id = [];
      this.currentData.propietario_id.push(uid);

      this._mostrarBtnVincular(false);
      this.showToast("🔗 Cuenta vinculada correctamente");
    } catch (e) {
      console.error("Error vincularCuenta:", e);
      this.showToast("❌ Error al vincular cuenta");
    }
  },

  // ═══════════════════════════════════════════
  //  SWITCHES
  // ═══════════════════════════════════════════
  async togglePayMethod(method, enabled) {
    try {
      await this._updateDoc(this.TIENDA_REF, {
        [`metodos_pago.${method}.enable`]: enabled,
      });
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
      await this._updateDoc(this.TIENDA_REF, {
        [`metodo_contacto.${method}.estado`]: enabled,
      });
      this.showToast(
        `${this._getContactName(method)} ${enabled ? "activado" : "desactivado"}`,
      );
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
  //  SECCIONES
  // ═══════════════════════════════════════════
  showSection(name) {
    this.activeSection = name;

    document.getElementById("saveFab")?.classList.remove("visible");
    document.getElementById("sidebarSaveBtn")?.classList.remove("visible");

    document
      .querySelectorAll(".section")
      .forEach((s) => s.classList.remove("active"));
    document.getElementById(`sec-${name}`)?.classList.add("active");

    document
      .querySelectorAll(".bar-btn, .sidebar-btn, .mobile-menu-item")
      .forEach((b) => b.classList.remove("active"));
    document.getElementById(`bb-${name}`)?.classList.add("active");
    document.getElementById(`sbb-${name}`)?.classList.add("active");
    document.getElementById(`mmb-${name}`)?.classList.add("active");
  },

  // ═══════════════════════════════════════════
  //  PUBLICIDAD
  // ═══════════════════════════════════════════
  async loadPublicidad() {
    this.showSection("publicidad");
    const container = document.getElementById("publicidadContainer");
    if (!container || this.publicidadLoaded) return;

    this.publicidadLoaded = true;
    container.innerHTML =
      '<div style="padding:20px;display:flex;flex-direction:column;gap:16px;">' +
      '<div class="sk-block" style="height:70px;border-radius:18px"></div>' +
      '<div class="sk-block" style="height:200px;border-radius:18px"></div>' +
      '<div class="sk-block" style="height:200px;border-radius:18px"></div></div>';

    try {
      const html = await fetch("publicaicones.html").then((r) => r.text());
      container.innerHTML = html;
      container.querySelectorAll("script").forEach((old) => {
        const s = document.createElement("script");
        if (old.src) {
          s.src = old.src;
          s.type = old.type || "text/javascript";
        } else s.textContent = old.textContent;
        document.body.appendChild(s);
        old.remove();
      });
    } catch (e) {
      console.error(e);
      container.innerHTML =
        '<div style="padding:40px;text-align:center;color:white;font-size:15px;">❌ Error cargando publicaciones.html</div>';
    }
  },

  // ═══════════════════════════════════════════
  //  HELPERS GENERALES
  // ═══════════════════════════════════════════
  setField(id, val) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = val ?? "";
    if (el.tagName === "TEXTAREA") {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  },

  _updateNameSilent(val) {
    const v = val || "Mi Negocio";
    document.getElementById("heroName")?.textContent !== undefined &&
      (document.getElementById("heroName").textContent = v);
    document.getElementById("sidebarName")?.textContent !== undefined &&
      (document.getElementById("sidebarName").textContent = v);
  },

  _updateDescSilent(val) {
    const el = document.getElementById("heroDesc");
    if (el)
      el.textContent =
        val ||
        "Toca aquí para agregar una descripción atractiva de tu negocio...";
  },

  _setSwitchAuto(switchId, isEnabled) {
    const el = document.querySelector(`input[data-method="${switchId}"]`);
    if (el) el.checked = isEnabled === true;
  },

  _setContactSwitch(contactId, isEnabled) {
    const el = document.querySelector(`input[data-contact="${contactId}"]`);
    if (el) el.checked = isEnabled === true;
  },

  // Reconstruye array de slots desde URLs con slot_N.webp
  _buildSlotArray(rawLista, size) {
    const lista = new Array(size).fill(null);
    rawLista.forEach((url) => {
      if (!url) return;
      const match = url.match(/slot_(\d+)\.webp/);
      if (match) lista[parseInt(match[1])] = url;
    });
    return lista;
  },

  // ── TOAST ──
  showToast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove("show"), 2500);
  },

  showSaveFab() {
    // Mantenido para compatibilidad con switches
    if (this.activeSection === "perfil") {
      document.getElementById("saveFab")?.classList.add("visible");
      document.getElementById("sidebarSaveBtn")?.classList.add("visible");
    }
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      document.getElementById("saveFab")?.classList.remove("visible");
      document.getElementById("sidebarSaveBtn")?.classList.remove("visible");
    }, 6000);
  },

  // ── UPLOAD OVERLAY ──
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

  // ── IMAGEN ──
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

  // ── UI VARIOS ──
  toggleExpand(header) {
    const open = header.classList.contains("open");
    header.classList.toggle("open", !open);
    header.nextElementSibling?.classList.toggle("open", !open);
  },

  openExpandable(id) {
    const sec = document.getElementById(id);
    if (!sec) return;
    const h = sec.querySelector(".expand-header");
    const b = sec.querySelector(".expand-body");
    if (h && !h.classList.contains("open")) {
      h.classList.add("open");
      b?.classList.add("open");
    }
    sec.scrollIntoView({ behavior: "smooth", block: "start" });
  },

  updateName(val) {
    this._updateNameSilent(val);
    this._checkFieldChanged("businessName");
  },
  updateDesc(val) {
    this._updateDescSilent(val);
    this._checkFieldChanged("businessDesc");
  },
  focusField(id) {
    document.getElementById(id)?.focus();
  },
  autoResize(el) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  },

  toggleSidebar() {
    const sb = document.querySelector(".sidebar");
    const btn = document.getElementById("sidebarToggle");
    sb?.classList.toggle("collapsed");
    if (btn) btn.textContent = sb?.classList.contains("collapsed") ? "▶" : "◀";
  },

  toggleMobileMenu() {
    document.getElementById("mobileMenu")?.classList.toggle("open");
    document.getElementById("mobileMenuOverlay")?.classList.toggle("show");
  },

  // ═══════════════════════════════════════════
  //  BOTÓN MÓVIL DRAGGABLE
  // ═══════════════════════════════════════════
  _initDraggableBtn() {
    const btn = document.getElementById("mobileMenuBtn");
    if (!btn) return;

    let isDragging = false,
      hasMoved = false;
    let startX, startY, startLeft, startTop;

    const clampToScreen = () => {
      const rect = btn.getBoundingClientRect();
      const currentLeft = parseFloat(btn.style.left);
      const currentTop = parseFloat(btn.style.top);
      if (isNaN(currentLeft) || isNaN(currentTop)) {
        btn.style.left = window.innerWidth - btn.offsetWidth - 16 + "px";
        btn.style.top = window.innerHeight - btn.offsetHeight - 24 + "px";
        return;
      }
      btn.style.left =
        Math.max(
          8,
          Math.min(window.innerWidth - btn.offsetWidth - 8, currentLeft),
        ) + "px";
      btn.style.top =
        Math.max(
          8,
          Math.min(window.innerHeight - btn.offsetHeight - 8, currentTop),
        ) + "px";
      btn.style.right = "auto";
      btn.style.bottom = "auto";
    };

    clampToScreen();
    window.addEventListener("resize", clampToScreen);

    const onStart = (clientX, clientY) => {
      isDragging = true;
      hasMoved = false;
      const rect = btn.getBoundingClientRect();
      startX = clientX;
      startY = clientY;
      startLeft = rect.left;
      startTop = rect.top;
      btn.style.left = startLeft + "px";
      btn.style.right = "auto";
      btn.style.top = startTop + "px";
      btn.style.bottom = "auto";
      btn.style.transition = "none";
    };

    const onMove = (clientX, clientY) => {
      if (!isDragging) return;
      const dx = clientX - startX,
        dy = clientY - startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasMoved = true;
      if (!hasMoved) return;
      btn.style.left =
        Math.max(
          8,
          Math.min(window.innerWidth - btn.offsetWidth - 8, startLeft + dx),
        ) + "px";
      btn.style.top =
        Math.max(
          8,
          Math.min(window.innerHeight - btn.offsetHeight - 8, startTop + dy),
        ) + "px";
    };

    const onEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      btn.style.transition = "left 0.2s ease";
      const rect = btn.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const snapLeft =
        centerX < window.innerWidth / 2
          ? 16
          : window.innerWidth - rect.width - 16;
      btn.style.left = snapLeft + "px";
      btn.style.right = "auto";
    };

    btn.addEventListener(
      "touchstart",
      (e) => {
        const t = e.touches[0];
        onStart(t.clientX, t.clientY);
      },
      { passive: true },
    );
    document.addEventListener(
      "touchmove",
      (e) => {
        const t = e.touches[0];
        onMove(t.clientX, t.clientY);
      },
      { passive: true },
    );
    document.addEventListener("touchend", () => onEnd());
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      onStart(e.clientX, e.clientY);
    });
    document.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
    document.addEventListener("mouseup", () => onEnd());

    btn.addEventListener("click", (e) => {
      if (!hasMoved) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleMobileMenu();
      }
    });
  },
};

// ═══════════════════════════════════════════
//  ARRANQUE
// ═══════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => PanelPerfil.init());

// ═══════════════════════════════════════════
//  SYNC A IFRAMES
// ═══════════════════════════════════════════

/** Primera carga: envía el objeto completo */
function enviarDatosAFrames() {
  const payload = window.APP_STATE?.tienda;
  if (!payload) return;
  document.querySelectorAll("iframe").forEach((frame) => {
    frame.contentWindow?.postMessage(
      { type: "DATOS_TIENDA", payload },
      window.location.origin,
    );
  });
}

/** Actualizaciones posteriores: envía solo lo que cambió */
function enviarPatchAFrames(diff) {
  if (!diff || !Object.keys(diff).length) return;
  document.querySelectorAll("iframe").forEach((frame) => {
    frame.contentWindow?.postMessage(
      { type: "PATCH_TIENDA", payload: diff },
      window.location.origin,
    );
  });
}

// ═══════════════════════════════════════════
//  ESCUCHAR MENSAJES DESDE IFRAMES
// ═══════════════════════════════════════════
window.addEventListener("message", (e) => {
  if (e.origin !== window.location.origin) return;
  if (e.data?.type === "VOLVER_PANEL") {
    const iframe = document.getElementById("iframeRecargas");
    if (iframe) iframe.src = "recargas.html";
  }
});

// ═══════════════════════════════════════════
//  MODALES GLOBALES (compatibilidad)
// ═══════════════════════════════════════════
function cerrarModal() {
  document.getElementById("modal-renovacion")?.classList.remove("open");
}
