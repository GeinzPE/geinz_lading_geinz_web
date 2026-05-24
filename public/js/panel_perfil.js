// ═══════════════════════════════════════════════════════════
//  NAMESPACE: PanelPerfil
// ═══════════════════════════════════════════════════════════

window.PanelPerfil = {
  // ── Estado interno ──
  activeSection: "perfil",
  currentData: {},
  saveTimer: null,
  _saveTimeout: null,
  _firstLoad: true,
  selectedCat: "",
  selectedSubcat: "",
  publicidadLoaded: false,
  prodCount: 2,
  emojis: ["🍕", "🍔", "🥗", "🍰", "☕", "🍜", "🛍️", "💎", "✨", "🎁"],
  _avatarPendingDataURL: null,

  // ── IDs ──
  TIENDA_ID: "fW7W8RsgkkQ3IYfxKHGR",
  TIENDA_REF: null,
  db: null,
  doc: null,
  onSnapshot: null,
  updateDoc: null,

  // ── Valores originales para detectar cambios ──
  _originalValues: {},

  // ═══════════════════════════════════════════
  //  INICIALIZACIÓN
  // ═══════════════════════════════════════════
  init: function () {
    const self = this;

    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js")
      .then((m) =>
        import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js").then(
          (m2) => ({ appModule: m, firestore: m2 }),
        ),
      )
      .then(({ appModule, firestore }) => {
        const firebaseConfig = {
          apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
          authDomain: "geinzworkapp.firebaseapp.com",
          projectId: "geinzworkapp",
          storageBucket: "geinzworkapp.appspot.com",
          messagingSenderId: "921389328767",
          appId: "1:921389328767:web:dc6fffc43a51444f5b524a",
        };

        const firebaseApp =
          appModule.getApps().find((a) => a.name === "[DEFAULT]") ||
          appModule.initializeApp(firebaseConfig);

        self.db = firestore.getFirestore(firebaseApp);
        self.doc = firestore.doc;
        self.onSnapshot = firestore.onSnapshot;
        self.updateDoc = firestore.updateDoc;
        self._firebaseApp = firebaseApp;

        self.TIENDA_REF = self.doc(
          self.db,
          "Tiendas",
          "barranca",
          "barranca",
          self.TIENDA_ID,
        );

        self._initRealtime();
      })
      .catch((err) => {
        console.error("Error cargando Firebase:", err);
        self.showToast("Error al conectar con Firebase");
      });

    this._bindEvents();
    this._injectFieldSaveBtnStyles();
  },

  selectedSubcats: [],
  categoriasDB: {},
  map: null,
  mapMarker: null,
  _firebaseApp: null,
  _ignorarSnapshot: 0,

  // ═══════════════════════════════════════════
  //  ESTILOS PARA BOTONES DE CAMPO
  // ═══════════════════════════════════════════
  _injectFieldSaveBtnStyles: function () {
    if (document.getElementById("field-save-btn-styles")) return;
    const style = document.createElement("style");
    style.id = "field-save-btn-styles";
    style.textContent = `
      .field-save-btn {
        display: none;
        margin-top: 8px;
        padding: 8px 18px;
        border-radius: 10px;
        border: none;
        background: #7c4dff;
        color: #fff;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.2s, transform 0.15s;
        animation: fieldBtnIn 0.18s ease;
      }
      .field-save-btn.visible {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .field-save-btn:active {
        transform: scale(0.96);
        opacity: 0.85;
      }
      .field-save-btn.saving {
        opacity: 0.6;
        pointer-events: none;
      }
      @keyframes fieldBtnIn {
        from { opacity: 0; transform: translateY(-4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  },

  // ═══════════════════════════════════════════
  //  CREAR BOTÓN DE GUARDADO POR CAMPO
  // ═══════════════════════════════════════════
  _createFieldSaveBtn: function (label, onSave) {
    const btn = document.createElement("button");
    btn.className = "field-save-btn";
    btn.innerHTML = `✓ Guardar ${label}`;
    btn.onclick = async function () {
      btn.classList.add("saving");
      btn.innerHTML = "Guardando...";
      try {
        await onSave();
        btn.classList.remove("visible", "saving");
        btn.innerHTML = `✓ Guardar ${label}`;
      } catch (e) {
        btn.classList.remove("saving");
        btn.innerHTML = `✓ Guardar ${label}`;
      }
    };
    return btn;
  },

  // ═══════════════════════════════════════════
  //  MOSTRAR / OCULTAR BOTÓN DE CAMPO
  // ═══════════════════════════════════════════
  _showFieldBtn: function (btn) {
    btn.classList.add("visible");
  },
  _hideFieldBtn: function (btn) {
    btn.classList.remove("visible");
  },

  // ═══════════════════════════════════════════
  //  MODAL RENOVACIÓN
  // ═══════════════════════════════════════════
  abrirModalRenovacion: async function () {
    const self = this;
    const modal = document.getElementById("modal-renovacion");
    if (!modal) return;

    modal.classList.add("open");

    const selectorPlanes = document.getElementById("selector-planes");
    const resumenPago = document.getElementById("resumen-pago");
    const btnContinuar = document.getElementById("btn-continuar");

    if (selectorPlanes)
      selectorPlanes.innerHTML =
        '<p style="text-align:center;color:#888">Cargando planes...</p>';
    if (resumenPago) resumenPago.style.display = "none";
    if (btnContinuar) btnContinuar.disabled = true;

    self._planSeleccionado = null;

    try {
      const { initializeApp, getApps } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
      const { getFirestore, doc, getDoc } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

      const appPlanes =
        getApps().find((a) => a.name === "planes") ||
        initializeApp(
          {
            apiKey: "AIzaSyA47YFtXgzUQe8w_Wb6AlfDcQSjOB5rT_U",
            authDomain: "proyectolista-95172.firebaseapp.com",
            projectId: "proyectolista-95172",
            storageBucket: "proyectolista-95172.firebasestorage.app",
            messagingSenderId: "250365546182",
            appId: "1:250365546172:web:732f2342d416eb909111c7",
          },
          "planes",
        );

      const dbPlanes = getFirestore(appPlanes);
      const snap = await getDoc(doc(dbPlanes, "precio_apartado", "app"));

      if (!snap.exists()) throw new Error("Documento no encontrado");

      const planes = snap.data().planes_activacion || {};
      self._planesData = planes;
      self._renderPlanes(planes);
    } catch (e) {
      console.error(e);
      if (selectorPlanes)
        selectorPlanes.innerHTML =
          '<p style="color:red;text-align:center">❌ Error al cargar planes</p>';
    }
  },

  _planesData: {},
  _planSeleccionado: null,

  _NOMBRES_PLANES: {
    "20_dias": "20 días",
    "1_mes": "1 mes",
    "2_meses": "2 meses",
    "3_meses": "3 meses",
    "4_meses": "4 meses",
  },
  _ORDEN_PLANES: ["20_dias", "1_mes", "2_meses", "3_meses", "4_meses"],
  _DESCUENTOS: { "2_meses": 7, "3_meses": 10, "4_meses": 15 },

  _renderPlanes: function (planes) {
    const self = this;
    const container = document.getElementById("selector-planes");
    container.innerHTML = "";

    self._ORDEN_PLANES
      .filter((k) => planes[k] !== undefined)
      .forEach((key) => {
        const precio = planes[key];
        const desc = self._DESCUENTOS[key] || 0;

        const div = document.createElement("div");
        div.className = "plan-item";
        div.dataset.key = key;
        div.innerHTML = `
    <strong>${key.replace(/_/g, " ")}</strong>
    <span class="precio-container">
        ${precio}<img src="img/icon_monedas_3d.webp" class="coin-icon" alt="moneda">
    </span>
`;
        div.onclick = () => self._seleccionarPlan(key, precio);
        container.appendChild(div);
      });
  },

  _seleccionarPlan: function (key, precio) {
    const self = this;
    self._planSeleccionado = { key, precio };

    document
      .querySelectorAll("#selector-planes .plan-item")
      .forEach((el) => el.classList.toggle("selected", el.dataset.key === key));

    const saldo = self.currentData?.saldo || 0;
    const desc = self._DESCUENTOS[key] || 0;
    const precioFinal =
      desc > 0 ? Math.round(precio * (1 - desc / 100)) : precio;
    const restante = saldo - precioFinal;

    document.getElementById("saldo-actual").textContent =
      ` ${saldo.toLocaleString("es-PE")}`;
    document.getElementById("saldo-restante").textContent =
      ` ${restante.toLocaleString("es-PE")}`;
    document.getElementById("total-a-pagar").textContent =
      ` ${precioFinal.toLocaleString("es-PE")}`;

    const detalle = document.getElementById("detalle-descuento");
    detalle.innerHTML = desc
      ? `<p>
       Descuento aplicado: 
       <strong>${desc}% = - 
         <span style="display:inline-flex; align-items:center; gap:4px;">
           ${(precio - precioFinal).toLocaleString("es-PE")}
           <img src="img/icon_monedas_3d.webp" class="coin-icon" style="width:16px; height:16px; vertical-align:middle;">
         </span>
       </strong>
     </p>`
      : "";

    document.getElementById("resumen-pago").style.display = "block";
    document.getElementById("btn-continuar").disabled = false;
  },

  // ═══════════════════════════════════════════
  //  MAPBOX
  // ═══════════════════════════════════════════
  initMapbox: function () {
    mapboxgl.accessToken =
      "pk.eyJ1IjoiYmVuamFtaW5sb3BleiIsImEiOiJjbWZrajJ2NHIxOXBkMmtvZW1kMTA5NWNoIn0.7s_234BN9y0pkTIgtF6ikw";

    var self = this;
    var lat = self.currentData?.ubicacion?.latitud || -10.7594699;
    var lng = self.currentData?.ubicacion?.longitud || -77.7608478;

    self.map = new mapboxgl.Map({
      container: "mapBoxPerfil",
      style: "mapbox://styles/benjaminlopez/cmm9c0hlt003901s54utw9p30",
      center: [lng, lat],
      zoom: 18,
      pitch: 45,
      bearing: 0,
    });

    self.mapMarker = new mapboxgl.Marker({ color: "#7c4dff", draggable: true })
      .setLngLat([lng, lat])
      .addTo(self.map);

    self.mapMarker.on("dragend", function () {
      var pos = self.mapMarker.getLngLat();
      self._onMapPointChanged(pos.lat, pos.lng);
    });

    self.map.on("click", function (e) {
      self.mapMarker.setLngLat([e.lngLat.lng, e.lngLat.lat]);
      self._onMapPointChanged(e.lngLat.lat, e.lngLat.lng);
    });
  },

  // Llamado cuando el user mueve el pin o hace click en el mapa
  _onMapPointChanged: async function (lat, lng) {
    var self = this;

    // Actualizar campo dirección con geocoding
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxgl.accessToken}`,
      );
      const data = await res.json();
      const place = data.features?.[0];
      if (place) {
        document.getElementById("fieldDireccion").value = place.place_name;
        // Actualizar original y mostrar btn de dirección también
        self._checkFieldChanged("fieldDireccion");
      }
    } catch (e) {
      console.error(e);
    }

    // Guardar coordenadas pendientes
    self._pendingLat = lat;
    self._pendingLng = lng;

    // Mostrar botón de guardar coordenadas
    var btn = document.getElementById("fieldSaveBtn-coordenadas");
    if (btn) self._showFieldBtn(btn);
  },

  _pendingLat: null,
  _pendingLng: null,

  updateLocationInputs: async function (lat, lng) {
    // Mantener por compatibilidad — internamente usa _onMapPointChanged
    this._onMapPointChanged(lat, lng);
  },

  // ═══════════════════════════════════════════
  //  CATEGORÍAS
  // ═══════════════════════════════════════════
  loadCategorias: async function () {
    var self = this;

    try {
      const { getDocs, collection } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

      const colRef = collection(self.db, "Tiendas", "categorias", "categorias");
      const snap = await getDocs(colRef);

      if (snap.empty) {
        console.warn("No se encontraron categorías");
        return;
      }

      self.categoriasDB = {};

      snap.forEach(function (docSnap) {
        self.categoriasDB[docSnap.id] = docSnap.data();
      });

      console.log("✅ Categorías cargadas:", Object.keys(self.categoriasDB));

      self.renderCategorias();
      self.renderSubcategorias();
      self.updateCatDisplay();
    } catch (e) {
      console.error("Error loadCategorias:", e);
    }
  },

  toggleMobileMenu: function () {
    const menu = document.getElementById("mobileMenu");
    const overlay = document.getElementById("mobileMenuOverlay");
    menu.classList.toggle("open");
    overlay.classList.toggle("show");
  },

  askChangeCategoria: function (newCat) {
    var self = this;

    if (!confirm("Cambiar categoría reiniciará las subcategorías.\n\n¿Continuar?")) {
      return;
    }

    self.selectedCat = newCat;
    self.selectedSubcats = [];

    self.renderCategorias();
    self.renderSubcategorias();
    self.updateCatDisplay();

    self.showSaveFab();
    self.queueSave();
  },

  renderCategorias: function () {
    var self = this;
    var main = document.getElementById("catMain");
    if (!main) return;

    main.innerHTML = "";

    var div = document.createElement("div");
    div.className = "cat-chip cat-locked selected";
    div.textContent = self.selectedCat || "Sin categoría asignada";
    main.appendChild(div);
  },

  renderSubcategorias: function () {
    var self = this;
    var sub = document.getElementById("catSub");
    if (!sub) return;

    sub.innerHTML = "";

    if (!self.selectedCat) return;

    var lista = self.categoriasDB[self.selectedCat]?.subcategorias || [];

    lista.forEach(function (item) {
      var div = document.createElement("div");
      div.className = "cat-chip";
      div.textContent = item;

      if (self.selectedSubcats.includes(item.toLowerCase())) {
        div.classList.add("selected");
      }

      div.onclick = function () {
        self.toggleSubcat(item, div);
      };

      sub.appendChild(div);
    });
  },

  // ═══════════════════════════════════════════
  //  EVENTOS
  // ═══════════════════════════════════════════
  _bindEvents: function () {
    const self = this;

    // Campos individuales con su propio botón de guardado
    // Se inicializan en _setupFieldSaveBtns() luego de populateUI
    const profileSection = document.getElementById("sec-perfil");

    if (profileSection) {
      profileSection.addEventListener("input", function (e) {
        if (self.activeSection !== "perfil") return;
        if (e.target.closest("#sec-publicidad")) return;

        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
          self._checkFieldChanged(e.target.id);
        }
      });
    }

    document
      .querySelectorAll('.pay-methods-wrapper input[type="checkbox"]')
      .forEach((cb) => {
        cb.addEventListener("change", function () {
          if (self.activeSection !== "perfil") return;
          const method = this.dataset.method;
          if (method) self.togglePayMethod(method, this.checked);
        });
      });

    document
      .querySelectorAll('.contact-methods-wrapper input[type="checkbox"]')
      .forEach((cb) => {
        cb.addEventListener("change", function () {
          if (self.activeSection !== "perfil") return;
          const contact = this.dataset.contact;
          if (contact) self.toggleContactMethod(contact, this.checked);
        });
      });

    document.querySelectorAll("textarea.form-input").forEach(function (el) {
      self.autoResize(el);
    });
  },

  // Detecta si el valor de un campo cambió respecto al original
  _checkFieldChanged: function (fieldId) {
    var self = this;
    var el = document.getElementById(fieldId);
    if (!el) return;

    var btn = document.getElementById("fieldSaveBtn-" + fieldId);
    if (!btn) return;

    var currentVal = el.value || "";
    var originalVal = self._originalValues[fieldId] || "";

    if (currentVal !== originalVal) {
      self._showFieldBtn(btn);
    } else {
      self._hideFieldBtn(btn);
    }
  },

  // ═══════════════════════════════════════════
  //  SETUP BOTONES DE GUARDADO POR CAMPO
  // ═══════════════════════════════════════════
  _setupFieldSaveBtns: function () {
    var self = this;
    // ── Teléfono ──
    self._insertFieldSaveBtn("fieldTelefono", "teléfono", async function () {
      var val = document.getElementById("fieldTelefono")?.value || "";
      await self.updateDoc(self.TIENDA_REF, { "metodo_contacto.llamada.numero": val });
      self._originalValues["fieldTelefono"] = val;
      self.showToast("✓ Teléfono guardado");
    });

    // ── WhatsApp ──
    self._insertFieldSaveBtn("fieldWhatsapp", "WhatsApp", async function () {
      var val = document.getElementById("fieldWhatsapp")?.value || "";
      await self.updateDoc(self.TIENDA_REF, { "metodo_contacto.whatsapp.numero": val });
      self._originalValues["fieldWhatsapp"] = val;
      self.showToast("✓ WhatsApp guardado");
    });

    // ── Instagram ──
    self._insertFieldSaveBtn("fieldInstagram", "Instagram", async function () {
      var val = (document.getElementById("fieldInstagram")?.value || "").replace("@", "");
      await self.updateDoc(self.TIENDA_REF, { "metodo_contacto.instagram.nombre": val });
      self._originalValues["fieldInstagram"] = "@" + val;
      self.showToast("✓ Instagram guardado");
    });

    // ── Facebook ──
    self._insertFieldSaveBtn("fieldFacebook", "Facebook", async function () {
      var val = document.getElementById("fieldFacebook")?.value || "";
      await self.updateDoc(self.TIENDA_REF, { "metodo_contacto.facebook.url": val });
      self._originalValues["fieldFacebook"] = val;
      self.showToast("✓ Facebook guardado");
    });

    // ── TikTok ──
    self._insertFieldSaveBtn("fieldTiktok", "TikTok", async function () {
      var val = document.getElementById("fieldTiktok")?.value || "";
      await self.updateDoc(self.TIENDA_REF, { "metodo_contacto.tiktok.url": val });
      self._originalValues["fieldTiktok"] = val;
      self.showToast("✓ TikTok guardado");
    });

    // ── Sitio web ──
    self._insertFieldSaveBtn("fieldWeb", "sitio web", async function () {
      var val = document.getElementById("fieldWeb")?.value || "";
      await self.updateDoc(self.TIENDA_REF, { "metodo_contacto.sitio_web.url": val });
      self._originalValues["fieldWeb"] = val;
      self.showToast("✓ Sitio web guardado");
    });
    // ── Nombre ──
    self._insertFieldSaveBtn("businessName", "nombre", async function () {
      var val = document.getElementById("businessName")?.value?.trim();
      if (!val) return;
      await self.updateDoc(self.TIENDA_REF, {
        nombre_tienda: val,
        nombre_lower: val.toLowerCase(),
      });
      self._originalValues["businessName"] = val;
      self._updateNameSilent(val);
      self.showToast("✓ Nombre guardado");
    });

    // ── Descripción ──
    self._insertFieldSaveBtn("businessDesc", "descripción", async function () {
      var val = document.getElementById("businessDesc")?.value || "";
      await self.updateDoc(self.TIENDA_REF, { descripcion: val });
      self._originalValues["businessDesc"] = val;
      self._updateDescSilent(val);
      self.showToast("✓ Descripción guardada");
    });

    // ── Aforo ──
    self._insertFieldSaveBtn("fieldAforo", "aforo", async function () {
      var val = parseInt(document.getElementById("fieldAforo")?.value);
      if (isNaN(val)) return;
      await self.updateDoc(self.TIENDA_REF, { aforo_max: val });
      self._originalValues["fieldAforo"] = String(val);
      self.showToast("✓ Aforo guardado");
    });

    // ── Dirección ──
    self._insertFieldSaveBtn("fieldDireccion", "dirección", async function () {
      var val = document.getElementById("fieldDireccion")?.value || "";
      await self.updateDoc(self.TIENDA_REF, { "ubicacion.dirección": val });
      self._originalValues["fieldDireccion"] = val;
      self.showToast("✓ Dirección guardada");
    });

    // ── Referencia ──
    self._insertFieldSaveBtn("fieldReferencia", "referencia", async function () {
      var val = document.getElementById("fieldReferencia")?.value || "";
      await self.updateDoc(self.TIENDA_REF, { "ubicacion.referencia": val });
      self._originalValues["fieldReferencia"] = val;
      self.showToast("✓ Referencia guardada");
    });

    // ── Coordenadas (mapa) ──
    self._insertMapSaveBtn();

    // ── Subcategorías ──
    self._insertSubcatSaveBtn();
  },

  // Inserta el botón justo después del campo con id dado
  _insertFieldSaveBtn: function (fieldId, label, onSave) {
    var self = this;
    var el = document.getElementById(fieldId);
    if (!el) return;

    // Evitar duplicados
    if (document.getElementById("fieldSaveBtn-" + fieldId)) return;

    var btn = self._createFieldSaveBtn(label, onSave);
    btn.id = "fieldSaveBtn-" + fieldId;
    el.parentNode.insertBefore(btn, el.nextSibling);
  },

  // Botón de guardar coordenadas — se inserta debajo del mapa
  _insertMapSaveBtn: function () {
    var self = this;
    var mapWrapper = document.querySelector(".map-wrapper");
    if (!mapWrapper) return;
    if (document.getElementById("fieldSaveBtn-coordenadas")) return;

    var btn = document.createElement("button");
    btn.id = "fieldSaveBtn-coordenadas";
    btn.className = "field-save-btn";
    btn.innerHTML = "✓ Guardar nueva ubicación";
    btn.onclick = async function () {
      if (self._pendingLat === null || self._pendingLng === null) return;
      btn.classList.add("saving");
      btn.innerHTML = "Guardando...";
      try {
        var lat = self._pendingLat;
        var lng = self._pendingLng;

        // Guardar en tienda principal
        await self.updateDoc(self.TIENDA_REF, {
          "ubicacion.latitud": lat,
          "ubicacion.longitud": lng,
        });

        // Guardar en /lugares/
        const { updateDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        const lugarRef = doc(self.db, "lugares", self.TIENDA_REF.id);
        await updateDoc(lugarRef, {
          "ubicacion.latitud": lat,
          "ubicacion.longitud": lng,
        });

        // Actualizar currentData
        self.currentData.ubicacion = {
          ...self.currentData.ubicacion,
          latitud: lat,
          longitud: lng,
        };

        self._pendingLat = null;
        self._pendingLng = null;

        btn.classList.remove("visible", "saving");
        btn.innerHTML = "✓ Guardar nueva ubicación";
        self.showToast("✓ Ubicación guardada");
      } catch (e) {
        console.error(e);
        btn.classList.remove("saving");
        btn.innerHTML = "✓ Guardar nueva ubicación";
        self.showToast("❌ Error al guardar ubicación");
      }
    };

    mapWrapper.appendChild(btn);
  },

  // Botón de guardar subcategorías — se inserta al final del expand-body de categorías
  _insertSubcatSaveBtn: function () {
    var self = this;
    var expCategoria = document.getElementById("expCategoria");
    if (!expCategoria) return;

    var body = expCategoria.querySelector(".expand-body");
    if (!body) return;

    if (document.getElementById("fieldSaveBtn-subcats")) return;

    var btn = document.createElement("button");
    btn.id = "fieldSaveBtn-subcats";
    btn.className = "field-save-btn";
    btn.innerHTML = "✓ Guardar subcategorías";
    btn.style.marginTop = "12px";
    btn.onclick = async function () {
      btn.classList.add("saving");
      btn.innerHTML = "Guardando...";
      try {
        // Guardar en tienda principal
        await self.updateDoc(self.TIENDA_REF, {
          subcategoria: self.selectedSubcats,
        });

        // Guardar en /lugares/
        const { updateDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        const lugarRef = doc(self.db, "lugares", self.TIENDA_REF.id);
        await updateDoc(lugarRef, {
          tag: self.selectedSubcats,
        });

        self._originalSubcats = [...self.selectedSubcats];

        btn.classList.remove("visible", "saving");
        btn.innerHTML = "✓ Guardar subcategorías";
        self.showToast("✓ Subcategorías guardadas");
      } catch (e) {
        console.error(e);
        btn.classList.remove("saving");
        btn.innerHTML = "✓ Guardar subcategorías";
        self.showToast("❌ Error al guardar");
      }
    };

    body.appendChild(btn);
  },


  _originalSubcats: [],

  // Llamado cada vez que se toca una subcategoría
  _checkSubcatsChanged: function () {
    var self = this;
    var btn = document.getElementById("fieldSaveBtn-subcats");
    if (!btn) return;

    var orig = JSON.stringify([...self._originalSubcats].sort());
    var curr = JSON.stringify([...self.selectedSubcats].sort());

    if (orig !== curr) {
      self._showFieldBtn(btn);
    } else {
      self._hideFieldBtn(btn);
    }
  },

  // ═══════════════════════════════════════════
  //  FIRESTORE TIEMPO REAL
  // ═══════════════════════════════════════════
  _initRealtime: function () {
    const self = this;
    document.querySelector(".app")?.classList.add("loading-data");

    this.onSnapshot(
      this.TIENDA_REF,
      function (snap) {
        if (!snap.exists()) {
          self.showToast("⚠️ Documento no encontrado");
          return;
        }
        self.currentData = snap.data();
        console.log("🔔 SNAPSHOT recibido, _ignorarSnapshot =", self._ignorarSnapshot);

        if (self._ignorarSnapshot > 0) {
          console.log("⏭️ Ignorando snapshot, decrementando contador a", self._ignorarSnapshot - 1);
          self._ignorarSnapshot--;
        } else {
          console.log("✅ Ejecutando populateUI");
          self.populateUI(self.currentData);
        }

        if (self._firstLoad) {
          self._firstLoad = false;
          self.loadCategorias();
          document.querySelector(".app")?.classList.remove("loading-data");
          const sk = document.getElementById("skeletonOverlay");
          if (sk) {
            sk.classList.add("hidden");
            setTimeout(() => sk.remove(), 450);
          }
        }
        console.log("📦 Datos actualizados");
      },
      function (err) {
        console.error(err);
        self.showToast("Error al conectar con Firestore");
        document.querySelector(".app")?.classList.remove("loading-data");
      },
    );
  },

  // ═══════════════════════════════════════════
  //  POBLAR UI
  // ═══════════════════════════════════════════
  populateUI: function (data) {
    var self = this;

    self.setField("businessName", data.nombre_tienda || "");
    self._updateNameSilent(data.nombre_tienda || "");

    self.setField("businessDesc", data.descripcion || "");
    self._updateDescSilent(data.descripcion || "");

    self.loadAvatar(data.img_tienda?.logo_tienda || data.logo_tienda || "");

    if (data.categoria_tienda) {
      self.selectedCat = data.categoria_tienda;
    }

    if (Array.isArray(data.subcategoria) && data.subcategoria.length) {
      self.selectedSubcats = data.subcategoria.map(function (s) {
        return s.toLowerCase();
      });
    }

    self.updateCatDisplay();

    if (data.ubicacion) {
      self.setField("fieldDireccion", data.ubicacion["dirección"] || "");
      self.setField("fieldReferencia", data.ubicacion.referencia || "");
    }

    // ── CONTACTO ──
    if (data.metodo_contacto) {
      var mc = data.metodo_contacto;

      self.setField("fieldTelefono", mc.llamada?.numero || "");
      self.setField("fieldWhatsapp", mc.whatsapp?.numero || "");
      self.setField(
        "fieldInstagram",
        mc.instagram?.nombre
          ? mc.instagram.nombre.startsWith("@")
            ? mc.instagram.nombre
            : "@" + mc.instagram.nombre
          : "",
      );
      self.setField("fieldFacebook", mc.facebook?.url || "");
      self.setField("fieldTiktok", mc.tiktok?.url || "");
      self.setField("fieldWeb", mc.sitio_web?.url || "");
      self.setField("fieldEmail", mc.email || "");

      self._setContactSwitch("llamada", mc.llamada?.estado);
      self._setContactSwitch("whatsapp", mc.whatsapp?.estado);
      self._setContactSwitch("instagram", mc.instagram?.estado);
      self._setContactSwitch("facebook", mc.facebook?.estado);
      self._setContactSwitch("tiktok", mc.tiktok?.estado);
      self._setContactSwitch("sitio_web", mc.sitio_web?.estado);
    }

    // ── PAGOS ──
    if (data.metodos_pago) {
      var mp = data.metodos_pago;

      self._setSwitchAuto("yape", mp.yape?.enable);
      self._setSwitchAuto("plin", mp.plin?.enable);
      self._setSwitchAuto("agora", mp.agora?.enable);
      self._setSwitchAuto("efectivo", mp.efectivo?.enable);
      self._setSwitchAuto("visa_mastercard", mp.visa_mastercard?.enable);

      if (mp.yape) {
        self.setField("fieldYapeTitular", mp.yape.nombre || "");
        self.setField("fieldYapeAlias", mp.yape.numero || "");
      }

      if (mp.plin) {
        self.setField("fieldPlinTitular", mp.plin.nombre || "");
        self.setField("fieldPlinAlias", mp.plin.numero || "");
      }
    }

    var imgs = data.img_tienda?.lista_img;

    self.populatePhotoGrid("ambienteGrid", imgs?.ambientales || [], 6, "ambientales");
    self.populatePhotoGrid("productosGrid", imgs?.servicios_productos || [], 6, "servicios_productos");

    if (imgs?.promociones) {
      self.populatePromocionesGrid("promocionesGrid", imgs.promociones, 3);
    }

    if (data.aforo_max !== undefined) {
      self.setField("fieldAforo", data.aforo_max);
    }

    // ── Guardar valores originales para detectar cambios ──
    self._originalValues["businessName"] = data.nombre_tienda || "";
    self._originalValues["businessDesc"] = data.descripcion || "";
    self._originalValues["fieldAforo"] = data.aforo_max !== undefined ? String(data.aforo_max) : "";
    self._originalValues["fieldDireccion"] = data.ubicacion?.["dirección"] || "";
    self._originalValues["fieldReferencia"] = data.ubicacion?.referencia || "";
    self._originalSubcats = [...self.selectedSubcats];


    self._originalValues["fieldTelefono"] = data.metodo_contacto?.llamada?.numero || "";
    self._originalValues["fieldWhatsapp"] = data.metodo_contacto?.whatsapp?.numero || "";
    self._originalValues["fieldInstagram"] = data.metodo_contacto?.instagram?.nombre
      ? (data.metodo_contacto.instagram.nombre.startsWith("@")
        ? data.metodo_contacto.instagram.nombre
        : "@" + data.metodo_contacto.instagram.nombre)
      : "";
    self._originalValues["fieldFacebook"] = data.metodo_contacto?.facebook?.url || "";
    self._originalValues["fieldTiktok"] = data.metodo_contacto?.tiktok?.url || "";
    self._originalValues["fieldWeb"] = data.metodo_contacto?.sitio_web?.url || "";
    self._originalValues["fieldYapeTitular"] = data.metodos_pago?.yape?.nombre || "";
    self._originalValues["fieldYapeAlias"] = data.metodos_pago?.yape?.numero || "";
    self._originalValues["fieldPlinTitular"] = data.metodos_pago?.plin?.nombre || "";
    self._originalValues["fieldPlinAlias"] = data.metodos_pago?.plin?.numero || "";

    // ── Setup botones de campo (solo la primera vez) ──
    if (!self._fieldBtnsReady) {
      self._fieldBtnsReady = true;
      // Pequeño delay para que el DOM esté listo
      setTimeout(function () {
        self._setupFieldSaveBtns();
      }, 100);
    }

    if (!this.map) {
      setTimeout(() => {
        this.initMapbox();
      }, 400);
    }
  },

  _fieldBtnsReady: false,

  // ═══════════════════════════════════════════
  //  AVATAR
  // ═══════════════════════════════════════════
  loadAvatar: function (url) {
    var img = document.getElementById("avatarImg");
    var skeleton = document.getElementById("avatarSkeleton");
    var placeholder = document.getElementById("avatarPlaceholder");

    if (!img || !skeleton || !placeholder) return;

    skeleton.style.display = "block";
    placeholder.style.display = "none";
    img.classList.remove("loaded");

    if (!url) {
      skeleton.style.display = "none";
      placeholder.style.display = "flex";
      return;
    }

    img.src = "";
    img.src = url;

    img.onload = function () {
      skeleton.style.display = "none";
      placeholder.style.display = "none";
      img.classList.add("loaded");
    };

    img.onerror = function () {
      skeleton.style.display = "none";
      placeholder.style.display = "flex";
    };
  },

  // ═══════════════════════════════════════════
  //  PHOTO GRID
  // ═══════════════════════════════════════════
  populatePhotoGrid: function (gridId, urls, maxSlots, gridTipo) {
    var grid = document.getElementById(gridId);
    if (!grid) return;

    var self = this;
    grid.innerHTML = "";

    var urlArray = Array.isArray(urls) ? [...urls].slice(0, maxSlots) : [];

    while (urlArray.length < maxSlots) {
      urlArray.push(null);
    }

    for (let i = 0; i < maxSlots; i++) {
      let url = urlArray[i];

      if (url) {
        let wrap = document.createElement("div");
        wrap.className = "photo-item";
        wrap.style.position = "relative";

        let sk = document.createElement("div");
        sk.style.cssText =
          "position:absolute;inset:0;background:linear-gradient(90deg,#1a1030 0%,#2a1850 50%,#1a1030 100%);background-size:200% 100%;animation:skeleton-loading 1.2s infinite;z-index:1;border-radius:16px;";
        wrap.appendChild(sk);

        let img = document.createElement("img");
        img.style.cssText =
          "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .35s ease;z-index:2;border-radius:16px;";

        img.onload = function () {
          sk.style.display = "none";
          requestAnimationFrame(() => { img.style.opacity = "1"; });
        };

        img.onerror = function () {
          sk.style.display = "none";
          wrap.innerHTML = '<span style="font-size:20px;opacity:0.25;position:absolute;inset:0;display:flex;align-items:center;justify-content:center">🖼️</span>';
        };

        img.src = url;
        wrap.appendChild(img);

        if (gridTipo) {
          let btnDel = document.createElement("button");
          btnDel.innerHTML = "🗑️";
          btnDel.style.cssText =
            "position:absolute;top:6px;right:6px;z-index:10;background:rgba(0,0,0,0.6);border:none;border-radius:8px;padding:4px 8px;cursor:pointer;font-size:13px;";

          btnDel.onclick = function (e) {
            e.stopPropagation();
            self.deleteFotoGrid(gridTipo, i);
          };

          wrap.onclick = function () {
            self.openFotoGrid(gridTipo, i);
          };

          wrap.appendChild(btnDel);
        }

        grid.appendChild(wrap);
      } else {
        let div = document.createElement("div");
        div.className = "photo-item photo-item-add";
        div.innerHTML = "<span>📷</span><span>Agregar</span>";
        div.onclick = function () {
          self.openFotoGrid(gridTipo, i);
        };
        grid.appendChild(div);
      }
    }
  },

  // ═══════════════════════════════════════════
  //  SUBIR FOTO
  // ═══════════════════════════════════════════
  openFotoGrid: function (tipo, slotIndex) {
    const self = this;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";

    input.onchange = async function (e) {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async function (ev) {
        self.showToast("⏳ Subiendo...");
        try {
          const comprimida = await self._comprimirImagen(ev.target.result, 1024, 0.85);
          const blob = self._dataURLtoBlob(comprimida);

          const storageModule =
            await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js");
          const storage = storageModule.getStorage(self._firebaseApp);
          const path = `tiendas/${self.TIENDA_ID}/imagenes/${tipo}/slot_${slotIndex}.webp`;
          const storageRef = storageModule.ref(storage, path);
          await storageModule.uploadBytes(storageRef, blob, { contentType: "image/webp" });
          const finalURL = await storageModule.getDownloadURL(storageRef);

          const { getDoc } =
            await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
          const snap = await getDoc(self.TIENDA_REF);
          let rawLista = snap.data()?.img_tienda?.lista_img?.[tipo] || [];

          let lista = new Array(6).fill(null);
          rawLista.forEach((url) => {
            if (!url) return;
            let match = url.match(/slot_(\d+)\.webp/);
            if (!match) return;
            lista[parseInt(match[1])] = url;
          });

          lista[slotIndex] = finalURL;
          self._ignorarSnapshot++;
          await self.updateDoc(self.TIENDA_REF, {
            [`img_tienda.lista_img.${tipo}`]: lista,
          });

          const gridMap = { ambientales: "ambienteGrid", servicios_productos: "productosGrid" };
          const maxMap = { ambientales: 6, servicios_productos: 6 };
          self.populatePhotoGrid(gridMap[tipo], lista, maxMap[tipo], tipo);

          self.showToast("✓ Foto guardada");
        } catch (err) {
          console.error("Error subiendo foto:", err);
          self.showToast("❌ Error al subir foto");
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  },

  // ═══════════════════════════════════════════
  //  ELIMINAR FOTO
  // ═══════════════════════════════════════════
  deleteFotoGrid: async function (tipo, slotIndex) {
    const self = this;
    if (!confirm("¿Eliminar esta foto?")) return;

    self.showToast("⏳ Eliminando...");

    try {
      const storageModule =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js");
      const storage = storageModule.getStorage(self._firebaseApp);
      const path = `tiendas/${self.TIENDA_ID}/imagenes/${tipo}/slot_${slotIndex}.webp`;

      try {
        await storageModule.deleteObject(storageModule.ref(storage, path));
      } catch (e) {
        console.warn("Archivo no existía");
      }

      const { getDoc } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      const snap = await getDoc(self.TIENDA_REF);
      let rawLista = snap.data()?.img_tienda?.lista_img?.[tipo] || [];

      let lista = new Array(6).fill(null);
      rawLista.forEach((url) => {
        if (!url) return;
        let match = url.match(/slot_(\d+)\.webp/);
        if (!match) return;
        lista[parseInt(match[1])] = url;
      });

      lista[slotIndex] = null;
      self._ignorarSnapshot++;

      await self.updateDoc(self.TIENDA_REF, {
        [`img_tienda.lista_img.${tipo}`]: lista,
      });

      const gridMap = { ambientales: "ambienteGrid", servicios_productos: "productosGrid" };
      const maxMap = { ambientales: 6, servicios_productos: 6 };
      self.populatePhotoGrid(gridMap[tipo], lista, maxMap[tipo], tipo);

      self.showToast("✓ Foto eliminada");
    } catch (err) {
      console.error(err);
      self.showToast("❌ Error al eliminar");
    }
  },

  // ═══════════════════════════════════════════
  //  RENDER SLOT
  // ═══════════════════════════════════════════
  _renderSlotConFoto: function (slot, url, tipo, slotIndex) {
    var self = this;

    slot.className = "photo-item";
    slot.style.position = "relative";
    slot.innerHTML = "";

    var img = document.createElement("img");
    img.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:16px;z-index:2;";
    img.src = url;
    slot.appendChild(img);

    var btnDel = document.createElement("button");
    btnDel.innerHTML = "🗑️";
    btnDel.style.cssText =
      "position:absolute;top:6px;right:6px;z-index:10;background:rgba(0,0,0,0.6);border:none;border-radius:8px;padding:4px 8px;cursor:pointer;font-size:13px;";

    btnDel.onclick = function (e) {
      e.stopPropagation();
      self.deleteFotoGrid(tipo, slotIndex);
    };

    slot.appendChild(btnDel);

    slot.onclick = function () {
      self.openFotoGrid(tipo, slotIndex);
    };
  },

  // ═══════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════
  setField: function (id, val) {
    var el = document.getElementById(id);
    if (!el) return;

    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      el.value = val || "";
      if (el.tagName === "TEXTAREA") {
        el.style.height = "auto";
        el.style.height = el.scrollHeight + "px";
      }
    }
  },

  _updateNameSilent: function (val) {
    var h = document.getElementById("heroName");
    var s = document.getElementById("sidebarName");
    if (h) h.textContent = val || "Mi Negocio";
    if (s) s.textContent = val || "Mi Negocio";
  },

  _updateDescSilent: function (val) {
    var el = document.getElementById("heroDesc");
    if (el) {
      el.textContent = val || "Toca aquí para agregar una descripción atractiva de tu negocio...";
    }
  },

  _setSwitchAuto: function (switchId, isEnabled) {
    var el = document.querySelector('input[data-method="' + switchId + '"]');
    if (el) el.checked = isEnabled === true;
  },

  _setContactSwitch: function (contactId, isEnabled) {
    var el = document.querySelector('input[data-contact="' + contactId + '"]');
    if (el) el.checked = isEnabled === true;
  },

  // ═══════════════════════════════════════════
  //  AUTOGUARDADO (solo para campos que no tienen botón propio)
  // ═══════════════════════════════════════════
  queueSave: function () {
    // Ya no se usa para los campos con botón propio.
    // Se mantiene por si algún otro lugar lo llama.
  },

  collectAndSave: async function () {
    // Mantenido por compatibilidad pero ya no es el flujo principal.
  },

  // ═══════════════════════════════════════════
  //  SECCIONES
  // ═══════════════════════════════════════════
  showSection: function (name) {
    this.activeSection = name;

    var saveFab = document.getElementById("saveFab");
    var sidebarSave = document.getElementById("sidebarSaveBtn");

    if (saveFab) saveFab.classList.remove("visible");
    if (sidebarSave) sidebarSave.classList.remove("visible");

    document.querySelectorAll(".section").forEach(function (s) {
      s.classList.remove("active");
    });

    var sec = document.getElementById("sec-" + name);
    if (sec) sec.classList.add("active");

    document.querySelectorAll(".nav-tab").forEach(function (t) {
      t.classList.remove("active");
    });

    document.querySelectorAll(".bar-btn").forEach(function (b) {
      b.classList.remove("active");
    });

    var barBtn = document.getElementById("bb-" + name);
    if (barBtn) barBtn.classList.add("active");

    document.querySelectorAll(".sidebar-btn").forEach(function (b) {
      b.classList.remove("active");
    });

    var sideBtn = document.getElementById("sbb-" + name);
    if (sideBtn) sideBtn.classList.add("active");

    document.querySelectorAll(".mobile-menu-item").forEach(function (b) {
      b.classList.remove("active");
    });

    var mobileBtn = document.getElementById("mmb-" + name);
    if (mobileBtn) mobileBtn.classList.add("active");
  },

  // ═══════════════════════════════════════════
  //  CATEGORÍAS
  // ═══════════════════════════════════════════
  selectCat: function (cat) {
    this.selectedCat = cat;
    this.renderCategorias();
    this.renderSubcategorias();
    this.updateCatDisplay();
    this.showSaveFab();
    this.queueSave();
  },

  toggleSubcat: function (sub, el) {
    var value = sub.toLowerCase();
    var index = this.selectedSubcats.indexOf(value);

    if (index >= 0) {
      this.selectedSubcats.splice(index, 1);
      el.classList.remove("selected");
    } else {
      this.selectedSubcats.push(value);
      el.classList.add("selected");
    }

    this.updateCatDisplay();
    // Verificar si cambió respecto al original
    this._checkSubcatsChanged();
  },

  updateCatDisplay: function () {
    var text = this.selectedCat || "Sin seleccionar";
    if (this.selectedSubcats.length) {
      text += " • " + this.selectedSubcats.length + " subcategorías";
    }
    var d = document.getElementById("catDisplay");
    if (d) d.textContent = text;
  },

  // ═══════════════════════════════════════════
  //  SWITCHES
  // ═══════════════════════════════════════════
  togglePayMethod: async function (method, enabled) {
    var self = this;
    try {
      await self.updateDoc(self.TIENDA_REF, {
        ["metodos_pago." + method + ".enable"]: enabled,
      });
      self.showToast(method.toUpperCase() + " " + (enabled ? "activado" : "desactivado"));
      self.showSaveFab();
    } catch (e) {
      console.error("Error togglePayMethod:", e);
      self.showToast("Error al actualizar método de pago");
    }
  },

  toggleContactMethod: async function (method, enabled) {
    var self = this;
    try {
      await self.updateDoc(self.TIENDA_REF, {
        ["metodo_contacto." + method + ".estado"]: enabled,
      });
      self.showToast(self._getContactName(method) + " " + (enabled ? "activado" : "desactivado"));
      self.showSaveFab();
    } catch (e) {
      console.error("Error toggleContactMethod:", e);
      self.showToast("Error al actualizar");
    }
  },

  toggleLlamadaMethod: async function (enabled) {
    var self = this;
    try {
      await self.updateDoc(self.TIENDA_REF, {
        "metodo_contacto.llamada.estado": enabled,
      });
      self.showToast("Teléfono " + (enabled ? "activado" : "desactivado"));
      self.showSaveFab();
    } catch (e) {
      console.error("Error toggleLlamadaMethod:", e);
      self.showToast("Error al actualizar");
    }
  },

  _getContactName: function (method) {
    var names = {
      llamada: "Teléfono",
      whatsapp: "WhatsApp",
      instagram: "Instagram",
      facebook: "Facebook",
      tiktok: "TikTok",
      sitio_web: "Sitio web",
    };
    return names[method] || method;
  },

  // ═══════════════════════════════════════════
  //  TOAST / FAB
  // ═══════════════════════════════════════════
  showSaveFab: function () {
    // Mantenido por compatibilidad con switches de contacto/pago
    var saveFab = document.getElementById("saveFab");
    var sidebarSave = document.getElementById("sidebarSaveBtn");

    if (this.activeSection === "perfil") {
      if (saveFab) saveFab.classList.add("visible");
      if (sidebarSave) sidebarSave.classList.add("visible");
    }

    var self = this;
    clearTimeout(self.saveTimer);
    self.saveTimer = setTimeout(function () {
      if (saveFab) saveFab.classList.remove("visible");
      if (sidebarSave) sidebarSave.classList.remove("visible");
    }, 6000);
  },

  saveChanges: function () {
    // Mantenido por compatibilidad
  },

  showToast: function (msg) {
    var t = document.getElementById("toast");
    if (!t) return;

    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(this._toastTimer);

    var self = this;
    this._toastTimer = setTimeout(function () {
      t.classList.remove("show");
    }, 2500);
  },

  // ═══════════════════════════════════════════
  //  MODALS
  // ═══════════════════════════════════════════
  openModal: function (id) {
    var modal = document.getElementById(id);
    if (modal) {
      modal.classList.add("open");
      var sheet = modal.querySelector(".modal-sheet");
      if (sheet) sheet.classList.add("open");
    }
    if (id === "modalFotoPerfil") {
      this._prepareAvatarModal();
    }
  },

  closeModal: function (id) {
    var modal = document.getElementById(id);
    if (modal) {
      modal.classList.remove("open");
      var sheet = modal.querySelector(".modal-sheet");
      if (sheet) sheet.classList.remove("open");
    }
  },

  // ═══════════════════════════════════════════
  //  AVATAR MODAL
  // ═══════════════════════════════════════════
  _prepareAvatarModal: function () {
    var self = this;

    var preview = document.getElementById("avatarModalPreview");
    var placeholder = document.getElementById("avatarModalPlaceholder");
    var btnSave = document.getElementById("btnSaveAvatarImg");

    if (preview) { preview.src = ""; preview.style.display = "none"; }
    if (placeholder) placeholder.style.display = "flex";
    if (btnSave) {
      btnSave.style.display = "none";
      btnSave.disabled = false;
      btnSave.textContent = "✓ Guardar foto";
    }

    self._avatarPendingDataURL = null;

    var input = document.getElementById("avatarFileInputHtml");
    if (!input) return;

    input.onchange = null;
    input.value = "";

    input.onchange = function (e) {
      var file = e.target.files[0];
      if (!file) return;

      var reader = new FileReader();
      reader.onload = function (ev) {
        self._avatarPendingDataURL = ev.target.result;
        self._showAvatarPreview(ev.target.result);
      };
      reader.readAsDataURL(file);
      input.value = "";
    };

    var btnSaveRef = document.getElementById("btnSaveAvatarImg");
    if (btnSaveRef) {
      btnSaveRef.onclick = function () {
        self.applyProfileImg();
      };
    }
  },

  _showAvatarPreview: function (dataURL) {
    var preview = document.getElementById("avatarModalPreview");
    var placeholder = document.getElementById("avatarModalPlaceholder");

    if (preview) { preview.src = dataURL; preview.style.display = "block"; }
    if (placeholder) placeholder.style.display = "none";

    var btnSave = document.getElementById("btnSaveAvatarImg");
    if (btnSave) btnSave.style.display = "flex";
  },

  // ═══════════════════════════════════════════
  //  SUBIR LOGO
  // ═══════════════════════════════════════════
  applyProfileImg: async function () {
    var self = this;

    var dataURL = self._avatarPendingDataURL;
    if (!dataURL) {
      self.showToast("Selecciona una imagen primero");
      return;
    }

    var btnSave = document.getElementById("btnSaveAvatarImg");
    if (btnSave) { btnSave.disabled = true; btnSave.textContent = "Subiendo..."; }

    try {
      var comprimida = await self._comprimirImagen(dataURL, 512, 0.82);
      var blob = self._dataURLtoBlob(comprimida);

      var storageModule =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js");
      var storage = storageModule.getStorage(self._firebaseApp);
      var storageRef = storageModule.ref(
        storage,
        "tiendas/" + self.TIENDA_ID + "/logo/logo.webp",
      );

      await storageModule.uploadBytes(storageRef, blob, { contentType: "image/webp" });
      var finalURL = await storageModule.getDownloadURL(storageRef);

      console.log("✅ Logo subido:", finalURL);

      await self.updateDoc(self.TIENDA_REF, { "img_tienda.logo_tienda": finalURL });

      const lugarRef = self.doc(self.db, "lugares", self.TIENDA_ID);
      await self.updateDoc(lugarRef, { img: finalURL });

      self.loadAvatar(finalURL);
      self._avatarPendingDataURL = null;
      self.closeModal("modalFotoPerfil");
      self.showToast("✓ Logo actualizado");
    } catch (e) {
      console.error("Error subiendo logo:", e);
      self.showToast("❌ Error al subir imagen");
    } finally {
      if (btnSave) { btnSave.disabled = false; btnSave.textContent = "Guardar"; }
    }
  },

  // ═══════════════════════════════════════════
  //  HELPERS IMAGEN
  // ═══════════════════════════════════════════
  _comprimirImagen: function (dataURL, maxPx, calidad) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var w = img.width;
        var h = img.height;

        if (w > maxPx || h > maxPx) {
          if (w >= h) { h = Math.round((h * maxPx) / w); w = maxPx; }
          else { w = Math.round((w * maxPx) / h); h = maxPx; }
        }

        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/webp", calidad));
      };
      img.onerror = function () { reject(new Error("No se pudo leer imagen")); };
      img.src = dataURL;
    });
  },

  _dataURLtoBlob: function (dataURL) {
    var parts = dataURL.split(",");
    var mime = parts[0].match(/:(.*?);/)[1];
    var raw = atob(parts[1]);
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return new Blob([arr], { type: mime });
  },

  // ═══════════════════════════════════════════
  //  UTILIDADES
  // ═══════════════════════════════════════════
  toggleExpand: function (header) {
    var body = header.nextElementSibling;
    var open = header.classList.contains("open");
    header.classList.toggle("open", !open);
    if (body) body.classList.toggle("open", !open);
  },

  openExpandable: function (id) {
    var sec = document.getElementById(id);
    if (!sec) return;

    var h = sec.querySelector(".expand-header");
    var b = sec.querySelector(".expand-body");

    if (h && !h.classList.contains("open")) {
      h.classList.add("open");
      if (b) b.classList.add("open");
    }

    sec.scrollIntoView({ behavior: "smooth", block: "start" });
  },

  updateName: function (val) {
    this._updateNameSilent(val);
    this._checkFieldChanged("businessName");
  },

  updateDesc: function (val) {
    this._updateDescSilent(val);
    this._checkFieldChanged("businessDesc");
  },

  focusField: function (id) {
    document.getElementById(id)?.focus();
  },

  autoResize: function (el) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  },

  toggleSidebar: function () {
    var sb = document.querySelector(".sidebar");
    var btn = document.getElementById("sidebarToggle");
    if (sb) sb.classList.toggle("collapsed");
    if (btn) btn.textContent = sb?.classList.contains("collapsed") ? "▶" : "◀";
  },

  // ═══════════════════════════════════════════
  //  PUBLICIDAD
  // ═══════════════════════════════════════════
  loadPublicidad: async function () {
    var self = this;
    self.showSection("publicidad");

    var container = document.getElementById("publicidadContainer");
    if (!container) return;
    if (self.publicidadLoaded) return;

    self.publicidadLoaded = true;

    container.innerHTML =
      '<div style="padding:20px;display:flex;flex-direction:column;gap:16px;">' +
      '<div class="sk-block" style="height:70px;border-radius:18px"></div>' +
      '<div class="sk-block" style="height:200px;border-radius:18px"></div>' +
      '<div class="sk-block" style="height:200px;border-radius:18px"></div>' +
      "</div>";

    try {
      var response = await fetch("publicaicones.html");
      var html = await response.text();
      container.innerHTML = html;

      var scripts = container.querySelectorAll("script");
      scripts.forEach(function (oldScript) {
        var newScript = document.createElement("script");
        if (oldScript.src) {
          newScript.src = oldScript.src;
          newScript.type = oldScript.type || "text/javascript";
        } else {
          newScript.textContent = oldScript.textContent;
        }
        document.body.appendChild(newScript);
        oldScript.remove();
      });
    } catch (e) {
      console.error(e);
      container.innerHTML =
        '<div style="padding:40px;text-align:center;color:white;font-size:15px;">❌ Error cargando publicaciones.html</div>';
    }
  },

  // ═══════════════════════════════════════════
  //  PROMOCIONES - SUBIR
  // ═══════════════════════════════════════════
  openFotoPromocion: function (oldKey) {
    var self = this;
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";

    input.onchange = function (e) {
      var file = e.target.files[0];
      if (!file) return;

      var reader = new FileReader();
      reader.onload = async function (ev) {
        self.showToast("⏳ Subiendo...");
        try {
          var newKey = String(Math.floor(Math.random() * 9000000) + 1000000);
          var comprimida = await self._comprimirImagen(ev.target.result, 1024, 0.85);
          var blob = self._dataURLtoBlob(comprimida);

          var storageModule =
            await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js");
          var storage = storageModule.getStorage(self._firebaseApp);

          var path = "tiendas/" + self.TIENDA_ID + "/imagenes/promociones/" + newKey + ".webp";
          var storageRef = storageModule.ref(storage, path);
          await storageModule.uploadBytes(storageRef, blob, { contentType: "image/webp" });
          var finalURL = await storageModule.getDownloadURL(storageRef);

          if (oldKey) {
            try {
              var oldPath = "tiendas/" + self.TIENDA_ID + "/imagenes/promociones/" + oldKey + ".webp";
              await storageModule.deleteObject(storageModule.ref(storage, oldPath));
            } catch (e) {
              console.warn("No se pudo borrar el anterior:", e);
            }
          }

          var { getDoc, deleteField } =
            await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

          var updates = {};
          if (oldKey) updates["img_tienda.lista_img.promociones." + oldKey] = deleteField();
          updates["img_tienda.lista_img.promociones." + newKey] = finalURL;

          self._ignorarSnapshot++;
          await self.updateDoc(self.TIENDA_REF, updates);
          self.showToast("✓ Promoción actualizada");
        } catch (err) {
          console.error("Error subiendo promoción:", err);
          self.showToast("❌ Error al subir");
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  },

  // ═══════════════════════════════════════════
  //  PROMOCIONES - ELIMINAR
  // ═══════════════════════════════════════════
  deleteFotoPromocion: async function (key) {
    var self = this;
    if (!confirm("¿Eliminar esta promoción?")) return;
    self.showToast("⏳ Eliminando...");

    try {
      var storageModule =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js");
      var storage = storageModule.getStorage(self._firebaseApp);
      var path = `tiendas/${self.TIENDA_ID}/imagenes/promociones/${key}.webp`;

      try {
        await storageModule.deleteObject(storageModule.ref(storage, path));
      } catch (e) {
        console.warn("No existía en storage");
      }

      var { deleteField } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      self._ignorarSnapshot++;
      await self.updateDoc(self.TIENDA_REF, {
        [`img_tienda.lista_img.promociones.${key}`]: deleteField(),
      });
      self.showToast("✓ Promoción eliminada");
    } catch (err) {
      console.error("Error eliminando promoción:", err);
      self.showToast("❌ Error al eliminar");
    }
  },

  // ═══════════════════════════════════════════
  //  PHOTO GRID PROMOCIONES
  // ═══════════════════════════════════════════
  populatePromocionesGrid: function (gridId, promosMap, maxSlots) {
    var grid = document.getElementById(gridId);
    if (!grid) return;

    var self = this;
    grid.innerHTML = "";

    var entries = Object.entries(promosMap || {});

    entries.forEach(function ([key, url]) {
      var wrap = document.createElement("div");
      wrap.className = "photo-item";
      wrap.style.position = "relative";

      var sk = document.createElement("div");
      sk.style.cssText =
        "position:absolute;inset:0;background:linear-gradient(90deg,#1a1030 0%,#2a1850 50%,#1a1030 100%);background-size:200% 100%;animation:skeleton-loading 1.2s infinite;z-index:1;border-radius:16px;";
      wrap.appendChild(sk);

      var img = document.createElement("img");
      img.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .35s ease;z-index:2;border-radius:16px;";
      img.onload = function () {
        sk.style.display = "none";
        setTimeout(function () { img.style.opacity = "1"; }, 50);
      };
      img.onerror = function () {
        sk.style.display = "none";
        wrap.innerHTML = '<span style="font-size:20px;opacity:0.25;position:absolute;inset:0;display:flex;align-items:center;justify-content:center">🖼️</span>';
      };
      img.src = url;
      wrap.appendChild(img);

      var btnDel = document.createElement("button");
      btnDel.innerHTML = "🗑️";
      btnDel.style.cssText =
        "position:absolute;top:6px;right:6px;z-index:10;background:rgba(0,0,0,0.6);border:none;border-radius:8px;padding:4px 8px;cursor:pointer;font-size:13px;";

      (function (k) {
        btnDel.onclick = function (e) {
          e.stopPropagation();
          self.deleteFotoPromocion(k);
        };
        wrap.onclick = function () {
          self.openFotoPromocion(k);
        };
      })(key);

      wrap.appendChild(btnDel);
      grid.appendChild(wrap);
    });

    for (var i = entries.length; i < maxSlots; i++) {
      var div = document.createElement("div");
      div.className = "photo-item photo-item-add";
      div.innerHTML = "<span>📷</span><span>Agregar</span>";
      div.onclick = function () { self.openFotoPromocion(null); };
      grid.appendChild(div);
    }
  },
};

// ═══════════════════════════════════════════
//  INICIAR
// ═══════════════════════════════════════════
document.addEventListener("DOMContentLoaded", function () {
  PanelPerfil.init();
});

function cerrarModal() {
  document.getElementById("modal-renovacion")?.classList.remove("open");
}

function procesarPago() {
  const plan = PanelPerfil._planSeleccionado;
  if (!plan) return;
  console.log("Procesando plan:", plan.key, "S/", plan.precio);
}