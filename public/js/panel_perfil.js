// ═══════════════════════════════════════════════════════════
//  NAMESPACE: PanelPerfil
//  Aisla el panel de perfil para evitar conflictos
//  cuando se carga publicaciones.html dinámicamente
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

  // ── IDs ──
  TIENDA_ID: "fW7W8RsgkkQ3IYfxKHGR",
  TIENDA_REF: null,
  db: null,
  doc: null,
  onSnapshot: null,
  updateDoc: null,

  // ═══════════════════════════════════════════
  //  INICIALIZACIÓN
  // ═══════════════════════════════════════════
  init: function () {
    const self = this;

    // Cargar Firebase dinámicamente
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js")
      .then((m) =>
        import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js").then(
          (m2) => ({ app: m.initializeApp, firestore: m2 }),
        ),
      )
      .then(({ app: initializeApp, firestore }) => {
        const firebaseConfig = {
          apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
          authDomain: "geinzworkapp.firebaseapp.com",
          projectId: "geinzworkapp",
          storageBucket: "geinzworkapp.firebasestorage.app",
          messagingSenderId: "921389328767",
          appId: "1:921389328767:web:dc6fffc43a51444f5b524a",
        };

        const app = initializeApp(firebaseConfig);
        self.db = firestore.getFirestore(app);
        self.doc = firestore.doc;
        self.onSnapshot = firestore.onSnapshot;
        self.updateDoc = firestore.updateDoc;

        self.TIENDA_REF = self.doc(
          self.db,
          "Tiendas",
          "barranca",
          "barranca",
          self.TIENDA_ID,
        );

        // Iniciar Firestore en tiempo real
        self._initRealtime();
      })
      .catch((err) => {
        console.error("Error cargando Firebase:", err);
        self.showToast("Error al conectar con Firebase");
      });

    // Bindear eventos
    this._bindEvents();
  },

  selectedSubcats: [],
  categoriasDB: {},
  map: null,
  mapMarker: null,

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

      zoom: 15,
    });

    self.map.addControl(new mapboxgl.NavigationControl());

    self.mapMarker = new mapboxgl.Marker({
      color: "#7c4dff",
      draggable: true,
    })
      .setLngLat([lng, lat])
      .addTo(self.map);

    /* mover marker */
    self.mapMarker.on("dragend", function () {
      var pos = self.mapMarker.getLngLat();

      self.updateLocationInputs(pos.lat, pos.lng);
    });

    /* click mapa */
    self.map.on("click", function (e) {
      var lat = e.lngLat.lat;
      var lng = e.lngLat.lng;

      self.mapMarker.setLngLat([lng, lat]);

      self.updateLocationInputs(lat, lng);
    });
  },
  updateLocationInputs: async function (lat, lng) {
    var self = this;

    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxgl.accessToken}`,
      );

      const data = await res.json();

      const place = data.features?.[0];

      if (place) {
        document.getElementById("fieldDireccion").value = place.place_name;
      }

      self.currentData.ubicacion = {
        ...self.currentData.ubicacion,

        latitud: lat,
        longitud: lng,
      };

      self.showSaveFab();

      self.queueSave();
    } catch (e) {
      console.error(e);
    }
  },
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
  toggleMobileMenu() {
    const menu = document.getElementById("mobileMenu");
    const overlay = document.getElementById("mobileMenuOverlay");

    menu.classList.toggle("open");
    overlay.classList.toggle("show");
  },
  askChangeCategoria: function (newCat) {
    var self = this;

    var ok = confirm(
      "Cambiar categoría reiniciará las subcategorías.\n\n¿Continuar?",
    );

    if (!ok) return;

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

    if (!self.selectedCat) {
      var empty = document.createElement("div");
      empty.className = "cat-chip cat-locked selected";
      empty.textContent = "Sin categoría asignada";
      main.appendChild(empty);
      return;
    }

    // Solo mostrar la categoría del negocio, sin más opciones
    var div = document.createElement("div");
    div.className = "cat-chip cat-locked selected";
    div.textContent = self.selectedCat;
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
  //  BINDEAR EVENTOS (SOLO PERFIL)
  // ═══════════════════════════════════════════
  _bindEvents: function () {
    const self = this;

    // Inputs dentro de la sección perfil
    const profileSection = document.getElementById("sec-perfil");
    if (profileSection) {
      profileSection.addEventListener("input", function (e) {
        if (self.activeSection !== "perfil") return;
        if (e.target.closest("#sec-publicidad")) return;

        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
          self.showSaveFab();
          self.queueSave();
        }
      });
    }

    // Switches de métodos de pago
    document
      .querySelectorAll('.pay-methods-wrapper input[type="checkbox"]')
      .forEach((cb) => {
        cb.addEventListener("change", function () {
          if (self.activeSection !== "perfil") return;
          const method = this.dataset.method;
          if (method) self.togglePayMethod(method, this.checked);
        });
      });

    // Switches de contacto
    document
      .querySelectorAll('.contact-methods-wrapper input[type="checkbox"]')
      .forEach((cb) => {
        cb.addEventListener("change", function () {
          if (self.activeSection !== "perfil") return;
          const contact = this.dataset.contact;
          if (contact) self.toggleContactMethod(contact, this.checked);
        });
      });

    // Auto-resize para textareas
    document.querySelectorAll("textarea.form-input").forEach(function (el) {
      self.autoResize(el);
    });
  },

  // ═══════════════════════════════════════════
  //  FIRESTORE TIEMPO REAL
  // ═══════════════════════════════════════════
  _initRealtime: function () {
    const self = this;
    document.querySelector(".app").classList.add("loading-data");

    this.onSnapshot(
      this.TIENDA_REF,
      function (snap) {
        if (!snap.exists()) {
          self.showToast("⚠️ Documento no encontrado");
          return;
        }
        self.currentData = snap.data();
        self.populateUI(self.currentData);

        if (self._firstLoad) {
          self._firstLoad = false;
          self.loadCategorias(); // ← AGREGADO
          document.querySelector(".app").classList.remove("loading-data");
          var sk = document.getElementById("skeletonOverlay");
          if (sk) {
            sk.classList.add("hidden");
            setTimeout(function () {
              sk.remove();
            }, 450);
          }
        }
        console.log("📦 Todos los campos:", Object.keys(self.currentData));
        console.log("🖼️ logo_tienda:", self.currentData.logo_tienda);
        console.log("📍 Path:", self.TIENDA_REF.path);
      },
      function (err) {
        console.error(err);
        self.showToast("Error al conectar con Firestore");
        document.querySelector(".app").classList.remove("loading-data");
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
    console.log(data.logo_tienda);

    // Categoría
    if (data.categoria_tienda) {
      self.selectedCat = data.categoria_tienda;
    }
    if (Array.isArray(data.subcategoria) && data.subcategoria.length) {
      self.selectedSubcats = data.subcategoria.map(function (s) {
        return s.toLowerCase();
      });
    }
    self.updateCatDisplay();

    // Ubicación
    if (data.ubicacion) {
      self.setField("fieldDireccion", data.ubicacion["dirección"] || "");
      self.setField("fieldReferencia", data.ubicacion.referencia || "");
    }

    // Contacto
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

    // Métodos de pago
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

    // Fotos
    var imgs = data.img_tienda?.lista_img;
    if (imgs?.ambientales)
      self.populatePhotoGrid("ambienteGrid", imgs.ambientales, 6);
    if (imgs?.servicios_productos)
      self.populatePhotoGrid("productosGrid", imgs.servicios_productos, 6);
    if (imgs?.promociones)
      self.populatePhotoGrid(
        "promocionesGrid",
        Object.values(imgs.promociones),
        3,
      );

    // Aforo
    if (data.aforo_max !== undefined)
      self.setField("fieldAforo", data.aforo_max);
    if (!this.map) {
      setTimeout(() => {
        this.initMapbox();
      }, 400);
    }
  },

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
  populatePhotoGrid: function (gridId, urls, maxSlots) {
    var grid = document.getElementById(gridId);
    if (!grid) return;
    var self = this;
    grid.innerHTML = "";

    if (urls && urls.length > 0) {
      urls.forEach(function (url) {
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
          setTimeout(function () {
            img.style.opacity = "1";
          }, 50);
        };
        img.onerror = function () {
          sk.style.display = "none";
          wrap.innerHTML =
            '<span style="font-size:20px;opacity:0.25;position:absolute;inset:0;display:flex;align-items:center;justify-content:center">🖼️</span>';
        };
        img.src = url;
        wrap.appendChild(img);
        grid.appendChild(wrap);
      });
    }

    var currentLength = urls ? urls.length : 0;
    for (var i = currentLength; i < maxSlots; i++) {
      var div = document.createElement("div");
      div.className = "photo-item photo-item-add";
      div.innerHTML = "<span>📷</span><span>Agregar</span>";
      div.onclick = function () {
        self.openModal("modalFotoAmbiente");
      };
      grid.appendChild(div);
    }
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
    if (el)
      el.textContent =
        val ||
        "Toca aquí para agregar una descripción atractiva de tu negocio...";
  },

  _setSwitchAuto: function (switchId, isEnabled) {
    var switchElement = document.querySelector(
      'input[data-method="' + switchId + '"]',
    );
    if (switchElement) switchElement.checked = isEnabled === true;
  },

  _setContactSwitch: function (contactId, isEnabled) {
    var switchElement = document.querySelector(
      'input[data-contact="' + contactId + '"]',
    );
    if (switchElement) switchElement.checked = isEnabled === true;
  },

  // ═══════════════════════════════════════════
  //  AUTO-SAVE
  // ═══════════════════════════════════════════
  queueSave: function () {
    var self = this;
    clearTimeout(self._saveTimeout);
    self._saveTimeout = setTimeout(function () {
      self.collectAndSave();
    }, 2000);
  },

  collectAndSave: async function () {
    var self = this;
    var g = function (id) {
      return document.getElementById(id)?.value;
    };
    var updates = {};

    var nombre = g("businessName")?.trim();
    if (nombre) {
      updates["nombre_tienda"] = nombre;
      updates["nombre_lower"] = nombre.toLowerCase();
    }

    var desc = g("businessDesc");
    if (desc !== undefined) updates["descripcion"] = desc;
    if (self.selectedCat) updates["categoria_tienda"] = self.selectedCat;

    updates["ubicacion.dirección"] = g("fieldDireccion") || "";
    updates["ubicacion.referencia"] = g("fieldReferencia") || "";
    updates["metodo_contacto.llamada.numero"] = g("fieldTelefono") || "";
    updates["metodo_contacto.whatsapp.numero"] = g("fieldWhatsapp") || "";
    updates["metodo_contacto.instagram.nombre"] = (
      g("fieldInstagram") || ""
    ).replace("@", "");
    updates["metodo_contacto.facebook.url"] = g("fieldFacebook") || "";
    updates["metodo_contacto.tiktok.url"] = g("fieldTiktok") || "";
    updates["metodo_contacto.sitio_web.url"] = g("fieldWeb") || "";
    updates["metodo_contacto.email"] = g("fieldEmail") || "";

    var yapeTitular = g("fieldYapeTitular");
    var yapeNumero = g("fieldYapeAlias");
    if (yapeTitular) updates["metodos_pago.yape.nombre"] = yapeTitular;
    if (yapeNumero) updates["metodos_pago.yape.numero"] = yapeNumero;

    var plinTitular = g("fieldPlinTitular");
    var plinNumero = g("fieldPlinAlias");
    if (plinTitular) updates["metodos_pago.plin.nombre"] = plinTitular;
    if (plinNumero) updates["metodos_pago.plin.numero"] = plinNumero;

    var aforo = parseInt(g("fieldAforo"));
    if (!isNaN(aforo)) updates["aforo_max"] = aforo;
    if (self.selectedSubcats.length) {
      updates["subcategoria"] = self.selectedSubcats;
    }
    try {
      await self.updateDoc(self.TIENDA_REF, updates);
      self.showToast("✓ Guardado");
      document.getElementById("saveFab")?.classList.remove("visible");
      document.getElementById("sidebarSaveBtn")?.classList.remove("visible");
    } catch (err) {
      console.error(err);
      self.showToast("❌ Error al guardar");
    }
  },

  // ═══════════════════════════════════════════
  //  SECCIONES
  // ═══════════════════════════════════════════
  showSection: function (name) {
    this.activeSection = name;

    var saveFab = document.getElementById("saveFab");
    var sidebarSave = document.getElementById("sidebarSaveBtn");

    if (name !== "perfil") {
      if (saveFab) saveFab.classList.remove("visible");
      if (sidebarSave) sidebarSave.classList.remove("visible");
    }

    document.querySelectorAll(".section").forEach(function (s) {
      s.classList.remove("active");
    });
    var sec = document.getElementById("sec-" + name);
    if (sec) sec.classList.add("active");

    var tabMap = { perfil: 0, fotos: 1, datos: 2, contacto: 3, pagos: 4 };
    document.querySelectorAll(".nav-tab").forEach(function (t) {
      t.classList.remove("active");
    });
    var tabs = document.querySelectorAll(".nav-tab");
    if (tabs[tabMap[name]]) tabs[tabMap[name]].classList.add("active");

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

    this.showSaveFab();

    this.queueSave();
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
  //  SWITCHES ACCIONES
  // ═══════════════════════════════════════════
  togglePayMethod: async function (method, enabled) {
    var self = this;
    try {
      await self.updateDoc(self.TIENDA_REF, {
        ["metodos_pago." + method + ".enable"]: enabled,
      });
      self.showToast(
        method.toUpperCase() + " " + (enabled ? "activado" : "desactivado"),
      );
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
      self.showToast(
        self._getContactName(method) +
          " " +
          (enabled ? "activado" : "desactivado"),
      );
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
  //  TOAST & SAVE FAB
  // ═══════════════════════════════════════════
  showSaveFab: function () {
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
    clearTimeout(this._saveTimeout);
    this.collectAndSave();
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
    var sheet = document.getElementById("sheet" + id.replace("modal", ""));
    if (modal) modal.classList.add("open");
    if (sheet) sheet.classList.add("open");
  },

  closeModal: function (id) {
    var modal = document.getElementById(id);
    var sheet = document.getElementById("sheet" + id.replace("modal", ""));
    if (modal) modal.classList.remove("open");
    if (sheet) sheet.classList.remove("open");
  },

  applyProfileImg: async function () {
    var self = this;
    var url = document.getElementById("profileImgUrl").value.trim();
    if (!url) {
      self.showToast("Ingresa una URL válida");
      return;
    }
    try {
      await self.updateDoc(self.TIENDA_REF, { logo_tienda: url });
      self.loadAvatar(url);
      self.closeModal("modalFotoPerfil");
      self.showToast("Logo actualizado ✓");
      self.showSaveFab();
      self.queueSave();
    } catch (e) {
      console.error(e);
      self.showToast("Error al actualizar");
    }
  },

  applyAmbienteImg: function () {
    var self = this;
    var url = document.getElementById("ambImgUrl").value.trim();
    if (!url) {
      self.showToast("Ingresa una URL válida");
      return;
    }
    self.showToast("Foto agregada ✓");
    self.showSaveFab();
    self.queueSave();
    self.closeModal("modalFotoAmbiente");
    document.getElementById("ambImgUrl").value = "";
  },

  // ═══════════════════════════════════════════
  //  PRODUCTOS Y PROMOS
  // ═══════════════════════════════════════════
  addProduct: function () {
    var self = this;
    var name = document.getElementById("prodName").value.trim();
    if (!name) {
      self.showToast("Ingresa un nombre");
      return;
    }
    var desc = document.getElementById("prodDesc").value.trim();
    var price = document.getElementById("prodPrice").value;
    var list = document.getElementById("productosList");
    if (list) {
      var card = document.createElement("div");
      card.className = "promo-card";
      card.innerHTML =
        '<div class="promo-img">' +
        self.emojis[self.prodCount % self.emojis.length] +
        "</div>" +
        '<div class="promo-info"><div class="promo-name">' +
        name +
        '</div><div class="promo-desc">' +
        (desc || "Sin descripción") +
        "</div>" +
        '<div class="promo-badges"><span class="badge badge-blue">Disponible</span></div></div>' +
        '<div><div class="promo-price">' +
        (price ? "S/ " + parseFloat(price).toFixed(2) : "") +
        "</div></div>";
      list.appendChild(card);
      self.prodCount++;
    }
    ["prodName", "prodDesc", "prodPrice"].forEach(function (id) {
      document.getElementById(id).value = "";
    });
    self.closeModal("modalProducto");
    self.showToast("Producto agregado ✓");
    self.showSaveFab();
    self.queueSave();
  },

  addPromo: function () {
    var self = this;
    var title = document.getElementById("promoTitle").value.trim();
    if (!title) {
      self.showToast("Ingresa un título");
      return;
    }
    var desc = document.getElementById("promoDesc").value.trim();
    var discount = document.getElementById("promoDiscount").value.trim();
    var list = document.getElementById("promosList");
    if (list) {
      var card = document.createElement("div");
      card.className = "promo-card";
      card.innerHTML =
        '<div class="promo-img" style="background:linear-gradient(135deg,#1E1040,#2A1050)">🎉</div>' +
        '<div class="promo-info"><div class="promo-name">' +
        title +
        '</div><div class="promo-desc">' +
        desc +
        "</div>" +
        '<div class="promo-badges"><span class="badge badge-red">Hoy</span></div></div>' +
        '<div><div class="promo-price">' +
        discount +
        "</div></div>";
      list.appendChild(card);
    }
    ["promoTitle", "promoDesc", "promoDiscount"].forEach(function (id) {
      document.getElementById(id).value = "";
    });
    self.closeModal("modalPromo");
    self.showToast("Promo agregada ✓");
    self.showSaveFab();
    self.queueSave();
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
    this.showSaveFab();
    this.queueSave();
  },

  updateDesc: function (val) {
    this._updateDescSilent(val);
    this.showSaveFab();
    this.queueSave();
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
        '<div style="padding:40px;text-align:center;color:white;font-size:15px;">' +
        "❌ Error cargando publicaciones.html" +
        "</div>";
    }
  },
};

// ═══════════════════════════════════════════
//  INICIAR AL CARGAR EL DOM
// ═══════════════════════════════════════════
document.addEventListener("DOMContentLoaded", function () {
  PanelPerfil.init();
});


