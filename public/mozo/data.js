import { Timestamp, getDoc, setDoc, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

  // structure_min.js NO se modifica. Las funciones se buscan y validan antes de usarlas.
  // Si guardarServiciosGeinz vive en otro archivo, agrega su ruta aquí.
  const CANDIDATOS = [
    "./servicio_geinz_admin.js",
  ];
  let api = null;
  async function cargarApi() {
    if (api) return api;
    const encontrado = { obtener: null, guardar: null, detalle: [] };
    for (const ruta of CANDIDATOS) {
      try {
        const m = await import(ruta);
        const exp = Object.keys(m);
        encontrado.detalle.push(`${ruta} → exports: ${exp.join(", ") || "(ninguno)"}`);
        if (!encontrado.obtener && typeof m.obtenerServiciosGeinz === "function") encontrado.obtener = m.obtenerServiciosGeinz;
        if (!encontrado.guardar && typeof m.guardarServiciosGeinz === "function") encontrado.guardar = m.guardarServiciosGeinz;
      } catch (e) {
        encontrado.detalle.push(`${ruta} → no se pudo cargar (${e.message})`);
      }
    }
    if (!encontrado.obtener) {
      throw new Error("No existe obtenerServiciosGeinz en ningún archivo.\n" + encontrado.detalle.join("\n"));
    }
    api = encontrado;
    return api;
  }

  const $f = document.getElementById("f");
  const $estado = document.getElementById("estado");
  const $res = document.getElementById("resultado");
  const $crudo = document.getElementById("crudo");
  const $barra = document.getElementById("barra");
  const $buscar = document.getElementById("buscar");
  const $cuenta = document.getElementById("cuenta");
  const $dlg = document.getElementById("dlg");
  const $df = document.getElementById("df");

  let datos = null;
  let params = null;
  let rutaDoc = "";
  let ignorados = [];          // apartados que structure_min no deja guardar (se guardan directo)
  const DIRECTOS = new Set(["plan", "fecha_fin", "creditos_ia500", "roles_max"]);
  let consulta = "";           // texto del buscador
  let filtroEstado = "todos";  // todos | true | false
  const dirty = new Set();
  const cerrados = new Set();
  let forzarAbrir = null;      // true = todo abierto, false = todo cerrado (una sola vez)

  const url = new URLSearchParams(location.search);
  for (const [k, v] of url) if ($f.elements[k]) $f.elements[k].value = v;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  const attr = (path) => esc(JSON.stringify(path));
  const norm = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const TIPOS = ["string", "number", "boolean", "null", "timestamp"];

  // Nombres entendibles (solo para mostrar; el campo real sigue siendo la clave de Firestore)
  const ETQ = {
    plan:"Tu plan", fecha_fin:"Vence el", creditos_ia500:"Créditos de IA", roles_max:"Trabajadores / roles permitidos",
    cliente_y_fidelizacion:"Clientes y fidelización", mi_negocio:"Mi negocio", operacion_ventas:"Operación y ventas", panel_admin:"Panel y límites",
    cupones_puntos:"Cupones y puntos", cupones_metricas:"Estadísticas de cupones", miqr:"Mi QR", carta:"Carta digital",
    libro_reclamaciones:"Libro de reclamaciones", mesas:"Mesas", cantidad_max:"Máximo de mesas", mis_productos:"Mis productos",
    perfil:"Perfil del negocio", review:"Reseñas", mis_usuarios:"Mis usuarios", publicidad_ofertas:"Publicidad y ofertas",
    mis_publicaciones:"Mis publicaciones", ofertas:"Ofertas", baner:"Banner", cantidad_ofertas:"Máximo de ofertas",
    publicidad:"Publicidad", fanpage:"Fan page", comprobantes:"Comprobantes", legal:"Legal", politicas:"Políticas de privacidad",
    terminos:"Términos y condiciones", mis_trabajadores:"Mis trabajadores", historial_ventas:"Historial de ventas",
    pedidos_vivos:"Pedidos en vivo", activo:"Activado", auto_off:"Apagado automático", auto_reserva:"Reserva automática",
    delivery_config:"Configuración de delivery", estado_pedidos:"Estados de pedidos", mis_delivery:"Mis repartidores",
    maximo_delivery:"Máximo de repartidores", tiempos:"Tiempos de entrega", mesa:"Pedidos por mesa", config_mesas:"Configurar mesas",
    mozos:"Mozos", nuevo_pedido:"Nuevo pedido", uso_camara_scaner:"Escanear con la cámara", uso_celular_scaner:"Escanear con el celular",
    produtos:"Productos", cantidad_imagenes_colecciones:"Imágenes por colección", colecciones:"Colecciones",
    config_avanzado:"Configuración avanzada", variantes_maximas:"Variantes máximas por producto", max_colecciones:"Máximo de colecciones",
    max_productos_por_colecciones:"Máximo de productos por colección", modo_avanzado:"Modo avanzado", modo_basico:"Modo básico",
    carrito:"Carrito de compras",
  };
  const etiquetaDe = (k) => (typeof k === "string" && ETQ[k]) || null;

  function tipoDe(v) {
    if (v === null || v === undefined) return "null";
    if (Array.isArray(v)) return "array";
    if (v instanceof Timestamp) return "timestamp";
    if (typeof v === "object") return "map";
    return typeof v;
  }

  const getAt = (path) => path.reduce((o, k) => o[k], datos);
  const parentOf = (path) => path.slice(0, -1).reduce((o, k) => o[k], datos);

  function aLocalInput(d) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // ───────── Búsqueda / filtro ─────────
  const q = () => norm(consulta.trim());

  function textoValor(v) {
    const t = tipoDe(v);
    if (t === "timestamp") return v.toDate().toISOString();
    if (t === "null") return "null";
    return String(v);
  }

  function nombreCoincide(clave) {
    const b = q();
    if (!b) return true;
    return norm(clave).includes(b) || norm(etiquetaDe(clave) || "").includes(b);
  }

  function visible(clave, valor, forzar) {
    const t = tipoDe(valor);
    const coincide = !q() || forzar || nombreCoincide(clave);
    if (t === "map" || t === "array") {
      const ent = t === "map" ? Object.entries(valor) : valor.map((x, i) => [i, x]);
      if (!ent.length) return filtroEstado === "todos" && coincide;
      return ent.some(([k, x]) => visible(k, x, coincide && (!!q() ? (forzar || nombreCoincide(clave)) : false)));
    }
    if (filtroEstado === "true" && valor !== true) return false;
    if (filtroEstado === "false" && valor !== false) return false;
    if (!q()) return true;
    return forzar || nombreCoincide(clave) || norm(textoValor(valor)).includes(q());
  }

  function resaltar(texto) {
    const b = consulta.trim();
    const s = esc(texto);
    if (!b) return s;
    const re = new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[<>&"']/g, ""), "gi");
    try { return s.replace(re, (m) => `<mark>${m}</mark>`); } catch { return s; }
  }

  // ───────── Render ─────────
  let visibles = 0;

  function control(t, v, p) {
    if (t === "boolean") return `<label class="sw"><input type="checkbox" data-act="val" data-path="${p}" ${v ? "checked" : ""}><span></span></label><span class="sino">${v ? "Sí" : "No"}</span>`;
    if (t === "number")  return `<input type="number" step="any" value="${v}" data-act="val" data-path="${p}">`;
    if (t === "string")  return `<input type="text" value="${esc(v)}" data-act="val" data-path="${p}">`;
    if (t === "timestamp") return `<input type="datetime-local" value="${aLocalInput(v.toDate())}" data-act="val" data-path="${p}">`;
    return `<span class="v-null">null</span>`;
  }

  function nombreHtml(clave, esItemArray) {
    if (esItemArray) return `[${esc(clave)}]`;
    const bonito = etiquetaDe(clave);
    return bonito
      ? `${resaltar(bonito)}<small>${resaltar(clave)}</small>`
      : resaltar(clave);
  }

  function renderNodo(clave, valor, path, forzar) {
    if (!visible(clave, valor, forzar)) return "";
    const t = tipoDe(valor);
    const p = attr(path);
    const raiz = path.length === 1;
    const enArray = Array.isArray(parentOf(path)) && !raiz;
    const del = raiz ? "" : `<button class="mini rojo" data-act="del" data-path="${p}" title="Eliminar">🗑</button>`;
    const coincide = !!q() && (forzar || nombreCoincide(clave));

    if (t === "map" || t === "array") {
      const entradas = t === "map" ? Object.entries(valor) : valor.map((x, i) => [i, x]);
      const hijos = entradas.map(([k, x]) => renderNodo(k, x, [...path, k], coincide)).join("");
      const pk = JSON.stringify(path);
      let abierto = !cerrados.has(pk);
      if (forzarAbrir !== null) abierto = forzarAbrir;
      if (q() || filtroEstado !== "todos") abierto = true;
      const guardarBtn = raiz
        ? `<button class="mini verde" data-act="save" data-path="${p}">Guardar</button><span class="dirty">${dirty.has(clave) ? "● sin guardar" : ""}</span>`
        : "";
      return `<details ${abierto ? "open" : ""} data-pk="${esc(pk)}" ${raiz ? `data-root="${esc(clave)}"` : ""}>
        <summary>${nombreHtml(clave, enArray)}<span class="tipo">${t} · ${entradas.length}</span>
          <span class="acc"><button class="mini" data-act="add" data-path="${p}">+ campo</button> ${guardarBtn} ${del}</span>
        </summary>${hijos || '<div class="fila"><span class="v-null">(vacío)</span></div>'}</details>`;
    }

    visibles++;
    const opciones = TIPOS.map((x) => `<option value="${x}" ${x === t ? "selected" : ""}>${x}</option>`).join("");
    return `<div class="fila"><span class="k">${nombreHtml(clave, enArray)}</span>${control(t, valor, p)}
      <select data-act="tipo" data-path="${p}" title="Cambiar tipo">${opciones}</select>${del}</div>`;
  }

  function render() {
    visibles = 0;
    const html = Object.keys(datos).map((k) => renderNodo(k, datos[k], [k], false)).join("");
    forzarAbrir = null;
    $res.innerHTML = html || '<p class="v-null">Nada coincide con la búsqueda o el filtro.</p>';
    $cuenta.textContent = (q() || filtroEstado !== "todos") ? `${visibles} campo(s)` : "";
    refrescarCrudo();
  }

  function refrescarCrudo() {
    $crudo.textContent = JSON.stringify(datos, function (k, v) {
      const raw = this[k];
      return raw instanceof Timestamp ? raw.toDate().toISOString() : v;
    }, 2);
  }

  function marcarSucio(raiz) {
    dirty.add(raiz);
    const el = $res.querySelector(`details[data-root="${CSS.escape(raiz)}"] > summary .dirty`);
    if (el) el.textContent = "● sin guardar";
    refrescarCrudo();
  }

  function convertir(v, a) {
    switch (a) {
      case "string": return v === null ? "" : v instanceof Timestamp ? v.toDate().toISOString() : String(v);
      case "number": { const n = v instanceof Timestamp ? v.toMillis() : Number(v); return Number.isFinite(n) ? n : 0; }
      case "boolean": return v === "false" ? false : Boolean(v);
      case "timestamp": { const d = typeof v === "string" ? new Date(v) : new Date(); return Timestamp.fromDate(isNaN(d) ? new Date() : d); }
      default: return null;
    }
  }

  // ───────── Buscador y filtros ─────────
  let temporizador;
  $buscar.addEventListener("input", () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { consulta = $buscar.value; if (datos) render(); }, 150);
  });

  document.getElementById("chips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    filtroEstado = c.dataset.f;
    document.querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === c));
    if (datos) render();
  });

  document.getElementById("expandir").onclick = () => { cerrados.clear(); forzarAbrir = true; if (datos) render(); };
  document.getElementById("contraer").onclick = () => {
    if (!datos) return;
    const marcar = (v, path) => {
      const t = tipoDe(v);
      if (t !== "map" && t !== "array") return;
      cerrados.add(JSON.stringify(path));
      (t === "map" ? Object.entries(v) : v.map((x, i) => [i, x])).forEach(([k, x]) => marcar(x, [...path, k]));
    };
    Object.keys(datos).forEach((k) => marcar(datos[k], [k]));
    forzarAbrir = false;
    render();
  };

  // ───────── Eventos del árbol ─────────
  $res.addEventListener("change", (e) => {
    const el = e.target;
    const act = el.dataset.act;
    if (!act) return;
    const path = JSON.parse(el.dataset.path);

    if (act === "val") {
      let nuevo;
      if (el.type === "checkbox") {
        nuevo = el.checked;
        const sino = el.closest(".fila")?.querySelector(".sino");
        if (sino) sino.textContent = nuevo ? "Sí" : "No";
      } else if (el.type === "number") {
        nuevo = parseFloat(el.value);
        if (Number.isNaN(nuevo)) { alert("Número inválido"); el.value = getAt(path); return; }
      } else if (el.type === "datetime-local") {
        const d = new Date(el.value);
        if (isNaN(d)) { alert("Fecha inválida"); return; }
        nuevo = Timestamp.fromDate(d);
      } else nuevo = el.value;
      parentOf(path)[path.at(-1)] = nuevo;
      marcarSucio(path[0]);
      if (filtroEstado !== "todos" && el.type === "checkbox") render();
    }

    if (act === "tipo") {
      const padre = parentOf(path);
      padre[path.at(-1)] = convertir(padre[path.at(-1)], el.value);
      marcarSucio(path[0]);
      render();
    }
  });

  $res.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const path = JSON.parse(b.dataset.path);

    if (b.dataset.act === "add") abrirDialogo(path);

    if (b.dataset.act === "del") {
      if (!confirm(`¿Eliminar "${path.join(" › ")}"?`)) return;
      const padre = parentOf(path);
      if (Array.isArray(padre)) padre.splice(path.at(-1), 1);
      else delete padre[path.at(-1)];
      marcarSucio(path[0]);
      render();
    }

    if (b.dataset.act === "save") guardar([path[0]]);
  });

  $res.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d.tagName !== "DETAILS" || !d.dataset.pk) return;
    if (q() || filtroEstado !== "todos") return;
    d.open ? cerrados.delete(d.dataset.pk) : cerrados.add(d.dataset.pk);
  }, true);

  // ───────── Diálogo agregar ─────────
  let destinoPath = null;
  const $dtipo = document.getElementById("dtipo");
  const $dvalorWrap = document.getElementById("dvalorWrap");
  const $nombreWrap = document.getElementById("nombreWrap");
  const $dnombre = document.getElementById("dnombre");

  function pintarValor() {
    const t = $dtipo.value;
    const h = {
      string: `<label>Valor <input id="dvalor" type="text"></label>`,
      number: `<label>Valor <input id="dvalor" type="number" step="any" value="0"></label>`,
      boolean: `<label>Valor <select id="dvalor"><option value="true">true</option><option value="false">false</option></select></label>`,
      json: `<label>JSON <textarea id="dvalor" rows="6" placeholder='{"activo": true, "max": 10}'></textarea></label>`,
      timestamp: `<label>Fecha y hora <input id="dvalor" type="datetime-local" value="${aLocalInput(new Date())}"></label>`,
    };
    $dvalorWrap.innerHTML = h[t] || `<small style="color:var(--mut)">Se creará ${t === "null" ? "null" : "vacío"}.</small>`;
  }
  $dtipo.addEventListener("change", pintarValor);

  function abrirDialogo(path) {
    destinoPath = path;
    const destino = getAt(path);
    document.getElementById("dlgTitulo").textContent = "Agregar a: " + path.join(" › ");
    $nombreWrap.style.display = Array.isArray(destino) ? "none" : "";
    $dnombre.value = "";
    $dtipo.value = "string";
    pintarValor();
    $dlg.showModal();
  }
  document.getElementById("dcancel").onclick = () => $dlg.close();

  $df.addEventListener("submit", (e) => {
    e.preventDefault();
    const destino = getAt(destinoPath);
    const esArray = Array.isArray(destino);
    const t = $dtipo.value;
    const raw = document.getElementById("dvalor")?.value;
    let valor;

    try {
      if (t === "string") valor = raw ?? "";
      else if (t === "number") { valor = parseFloat(raw); if (Number.isNaN(valor)) throw new Error("Número inválido"); }
      else if (t === "boolean") valor = raw === "true";
      else if (t === "map") valor = {};
      else if (t === "array") valor = [];
      else if (t === "null") valor = null;
      else if (t === "json") valor = JSON.parse(raw);
      else if (t === "timestamp") { const d = new Date(raw); if (isNaN(d)) throw new Error("Fecha inválida"); valor = Timestamp.fromDate(d); }
    } catch (err) { alert(err.message); return; }

    if (esArray) destino.push(valor);
    else {
      const nombre = $dnombre.value.trim();
      if (!nombre) { alert("Escribe el nombre del campo"); return; }
      if (nombre in destino) { alert(`Ya existe "${nombre}" aquí`); return; }
      destino[nombre] = valor;
    }
    marcarSucio(destinoPath[0]);
    $dlg.close();
    render();
  });

  // ───────── Cargar / Guardar ─────────
  async function cargar() {
    if (dirty.size && !confirm("Hay cambios sin guardar. ¿Recargar y perderlos?")) return;
    const p = Object.fromEntries(new FormData($f));
    $estado.className = "";
    $estado.textContent = "Consultando…";
    $res.innerHTML = "";
    $barra.style.display = "none";
    try {
      const A = await cargarApi();
      const r = await A.obtener(p);
      if (!r.existe) {
        $estado.className = "error";
        $estado.textContent = `No existe el documento: ${r.ruta}`;
        datos = null;
        pintarPlanes();
        return;
      }
      datos = r.datos; params = p; rutaDoc = r.ruta; ignorados = r.ignorados || [];
      dirty.clear(); cerrados.clear();
      consulta = ""; $buscar.value = "";
      $estado.innerHTML = `✔ ${esc(r.ruta)}<br>Traídos: ${Object.keys(r.datos).join(", ") || "(ninguno)"}` +
        (r.faltantes?.length ? `<br>No existen en el doc: ${r.faltantes.join(", ")}` : "") +
        `<br>Ignorados (a mano): ${r.ignorados.join(", ") || "(ninguno)"}`;
      $barra.style.display = "flex";
      render();
      pintarPlanes();
      if (!planesCargado) cargarPlanes();
    } catch (e) {
      console.error(e);
      $estado.className = "error";
      $estado.textContent = "Error: " + e.message;
    }
  }

  // Referencia al MISMO documento que lee structure_min (rutas.js, sin cambiar nombres)
  async function refServicios() {
    const m = _paths || await import(RUTAS_PATHS[0]);
    if (typeof m.setUbicacion === "function") m.setUbicacion({ pais: params.pais, departamento: params.departamento, provincia: params.provincia });
    const ref = m.tiendaServiciosDoc(params.localidad, params.negocioId);
    const n = (x) => String(x).replace(/^\/+/, "");
    if (!rutaDoc || n(ref.path) === n(rutaDoc)) return ref;
    const { db } = await import("../js/db/db.js");
    return doc(db, ...n(rutaDoc).split("/"));
  }

  async function guardar(raices) {
    if (!params || !datos) return;
    if (!raices.length) { alert("No hay cambios sin guardar"); return; }
    try {
      // plan, fecha_fin, creditos_ia500, roles_max (y los "ignorados") structure_min no los deja: se escriben directo, con sus nombres reales
      const directos = raices.filter((k) => DIRECTOS.has(k) || ignorados.includes(k));
      const normales = raices.filter((k) => !directos.includes(k));
      if (!confirm(`Se reemplazarán en Firestore:\n• ${raices.join("\n• ")}\n\n${rutaDoc}`)) return;
      const guardados = [];

      if (normales.length) {
        const A = await cargarApi();
        if (!A.guardar) {
          $estado.className = "error";
          $estado.innerHTML = "No existe <b>guardarServiciosGeinz</b> en ningún archivo, no se guardó nada.<br>" +
            A.detalle.map(esc).join("<br>") +
            "<br>Agrega la ruta del archivo que sí la exporta en CANDIDATOS.";
          return;
        }
        const cambios = {};
        normales.forEach((k) => (cambios[k] = datos[k]));
        const r = await A.guardar({ ...params, cambios });
        guardados.push(...(r.guardados || normales));
      }

      if (directos.length) {
        const cambios = {};
        directos.forEach((k) => (cambios[k] = datos[k]));
        await updateDoc(await refServicios(), cambios);
        guardados.push(...directos);
      }

      raices.forEach((k) => dirty.delete(k));
      render();
      $estado.className = "ok";
      $estado.textContent = `✔ Guardado: ${guardados.join(", ")} (${rutaDoc})`;
    } catch (e) {
      console.error(e);
      $estado.className = "error";
      $estado.textContent = "Error al guardar: " + e.message;
    }
  }

  document.getElementById("guardarTodo").onclick = () => guardar([...dirty]);
  $f.addEventListener("submit", (e) => { e.preventDefault(); cargar(); });
  window.addEventListener("beforeunload", (e) => { if (dirty.size) { e.preventDefault(); e.returnValue = ""; } });

  // ═════════════════════════════════════════════════════════════
  //  PLANES GEINZ  →  /costos_geinz_saas/config_planes
  // ═════════════════════════════════════════════════════════════

  // Ajusta/añade rutas hasta donde viva tu paths.js (relativas a ESTE html)
  const RUTAS_PATHS = ["../js/rutas/rutas.js"];
  let _paths = null;
  async function planesDoc() {
    if (!_paths) {
      const fallos = [];
      for (const r of RUTAS_PATHS) {
        try {
          const m = await import(r);
          if (typeof m.planesConfigDoc === "function") { _paths = m; break; }
          fallos.push(r + " (sin planesConfigDoc)");
        } catch (e) { fallos.push(r + " → " + e.message); }
      }
      if (!_paths) throw new Error("No encontré rutas.js con planesConfigDoc.\n" + fallos.join("\n"));
    }
    return _paths.planesConfigDoc();
  }

  const r2 = (n) => Math.round(n * 100) / 100;
  const U = "ilimitado";
  const MODS_STD = { perfil_negocio:true, comprobantes:true, mis_trabajadores:true, legal:true, pedidos_en_vivo:true, carrito_compras:true, historial_ventas:true, clientes:true, cupones_puntos:true, publicidad_ofertas:true, "reseñas":true, qr_tech:true, modo_avanzado_productos:true };
  const LIM_KEYS = ["colecciones","productos_por_coleccion","trabajadores","mesas","repartidores","cupones","creditos_ia"];

  const mkPlan = (nombre, descripcion, m, a, badge, pop, lim, mods = MODS_STD, extra = {}) => ({
    nombre, descripcion, precio_mensual: m, precio_anterior: a, mostrar_precio_anterior: a > 0,
    etiqueta_badge: badge, mostrar_badge: true, es_mas_popular: pop, ...extra,
    moneda: "PEN", prueba_dias: 7, dominio_personalizado_permitido: true,
    limites: Object.fromEntries(LIM_KEYS.map((k, i) => [k, lim[i]])),
    modulos: { ...mods },
  });

  const PLANES_INICIALES = {
    basico: mkPlan("Plan Básico", "Todo el poder de GEINZ activado desde el primer día para emprendedores que arrancan con fuerza.", 49.90, 79.90, "Emprendedor", false, [15,20,2,5,10,5,100]),
    pro: mkPlan("Plan Pro", "Para negocios activos con mayor rotación de stock, mesas y equipo de trabajo en expansión.", 89.90, 129.90, "Más Popular 🔥", true, [35,40,8,20,30,20,350]),
    avanzado: mkPlan("Plan Avanzado", "Sin frenos. Capacidad masiva, control total de planilla y alta potencia de IA para marketing.", 149.90, 199.90, "Escala Total", false, [U,U,24,U,U,U,1000]),
    enterprise: mkPlan("Plan Enterprise", "Infraestructura corporativa a medida, multi-sucursales, WhatsApp API oficial y marca blanca.", 0, 0, "Corporativo", false, [U,U,U,U,U,U,U],
      { multi_sucursal:true, whatsapp_cloud_api:true, facturacion_sunat:true, white_label:true, soporte_prioritario_24_7:true }, { es_cotizacion: true }),
  };

  // [límite del plan, padre (null = cualquier lugar), clave real en Firestore]
  const LIM_MAP = [
    ["mesas", "mesas", "cantidad_max"],
    ["repartidores", "mis_delivery", "maximo_delivery"],
    ["cupones", "ofertas", "cantidad_ofertas"],
    ["colecciones", "config_avanzado", "max_colecciones"],
    ["productos_por_coleccion", "config_avanzado", "max_productos_por_colecciones"],
  ];
  const MOD_MAP = {
    perfil_negocio:"perfil", comprobantes:"comprobantes", mis_trabajadores:"mis_trabajadores", legal:"legal",
    pedidos_en_vivo:"pedidos_vivos", carrito_compras:"carrito", historial_ventas:"historial_ventas",
    clientes:"cliente_y_fidelizacion", cupones_puntos:"cupones_puntos", publicidad_ofertas:"publicidad_ofertas",
    "reseñas":"review", qr_tech:"miqr", modo_avanzado_productos:"modo_avanzado",
  };
  const VALOR_ILIMITADO = 999999;

  let planes = null, planesDirty = false, planesCargado = false, planesMsg = "Sin cargar.";

  // recAnt: recalcula "antes" mensual con margen · fijarAnual: respeta precio_anual y deriva el % · recAntAn: recalcula "antes" anual con margen anual
  function recalcular(p, recAnt = true, fijarAnual = false, recAntAn = true) {
    if (p.es_cotizacion) return;
    const m = Number(p.precio_mensual) || 0;
    if (recAnt) p.precio_anterior = m > 0 ? r2(Math.round(m * (1 + (p.markup_pct ?? 40) / 100)) - 0.10) : 0;
    p.mostrar_precio_anterior = p.precio_anterior > m;
    if (fijarAnual && p.precio_anual != null) p.descuento_anual_pct = m > 0 ? Math.round((1 - p.precio_anual / (m * 12)) * 1000) / 10 : 0;
    else p.precio_anual = r2(m * 12 * (1 - (p.descuento_anual_pct ?? 20) / 100));
    if (recAntAn || p.precio_anterior_anual == null)
      p.precio_anterior_anual = p.precio_anual > 0 ? r2(Math.round(p.precio_anual * (1 + (p.markup_anual_pct ?? 40) / 100)) - 0.10) : 0;
    p.mostrar_precio_anterior_anual = p.precio_anterior_anual > p.precio_anual;
  }

  // ── Panel (se inyecta debajo del formulario) ──
  const $p = document.createElement("details");
  $p.style.cssText = "margin:14px 0;padding:10px 14px;border:1px solid var(--bd);border-left:1px solid var(--bd);border-radius:10px;background:var(--card)";
  $p.innerHTML = `<summary style="cursor:pointer;font-weight:700;color:var(--ac)">💳 Planes GEINZ <small style="color:var(--mut)">(costos_geinz_saas/config_planes)</small></summary>
    <div style="margin:10px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button type="button" class="mini verde" id="plFile">📂 Subir archivo .json</button>
      <input type="file" id="plFileIn" accept=".json,application/json" hidden>
      <button type="button" class="mini" id="plPegarBtn">📋 Pegar JSON</button>
    </div>
    <div id="plPegar" style="display:none;margin-bottom:10px">
      <textarea id="plTxt" rows="10" style="width:100%;font-family:monospace;font-size:12px" placeholder='Pega aquí tu JSON: { "planes": { "basico": { ... } } }'></textarea>
      <button type="button" class="mini verde" id="plUsar" style="margin-top:6px">Usar este JSON</button>
    </div>
    <div id="planesBody"></div>`;
  $f.insertAdjacentElement("afterend", $p);
  const $pb = $p.querySelector("#planesBody");
  $p.addEventListener("toggle", () => { if ($p.open && !planesCargado) cargarPlanes(); });

  const LB = `style="display:inline-flex;flex-direction:row;align-items:center;gap:4px;margin:2px 10px 2px 0;font-size:12px"`;

  function _pintarPlanes() {
    if (!planes) {
      $pb.innerHTML = `<p style="margin:8px 0;white-space:pre-line;color:var(--mut)">${esc(planesMsg)}</p>
        <button type="button" class="mini" data-pl="cargar">Cargar planes</button>
        <button type="button" class="mini verde" data-pl="subir">⬆ Subir JSON inicial a Firestore</button>`;
      return;
    }
    const tarjetas = Object.entries(planes).map(([id, p]) => {
      const I = esc(id);
      const lims = Object.entries(p.limites || {}).map(([k, v]) =>
        `<label ${LB}>${esc(k)} <input data-pl="lim" data-id="${I}" data-k="${esc(k)}" value="${esc(v)}" style="width:84px"></label>`).join("");
      const dctoVis = p.precio_anterior > p.precio_mensual ? Math.round((1 - p.precio_mensual / p.precio_anterior) * 100) : 0;
      const dctoVisAn = p.precio_anterior_anual > p.precio_anual ? Math.round((1 - p.precio_anual / p.precio_anterior_anual) * 100) : 0;
      const precios = p.es_cotizacion ? `<em style="color:var(--mut)">Cotización personalizada (sin precio fijo)</em>` : `
        <label ${LB}>Mensual S/ <input type="number" step="0.1" data-pl="m" data-id="${I}" value="${p.precio_mensual}" style="width:80px"></label>
        <label ${LB}>Margen "antes" % <input type="number" data-pl="mk" data-id="${I}" value="${p.markup_pct ?? 40}" style="width:60px"></label>
        <label ${LB}>Antes S/ <input type="number" step="0.1" data-pl="ant" data-id="${I}" value="${p.precio_anterior}" style="width:80px"></label>
        <label ${LB}>Margen anual "antes" % <input type="number" data-pl="mka" data-id="${I}" value="${p.markup_anual_pct ?? 40}" style="width:60px"></label>
        <label ${LB}>Desc. anual % <input type="number" step="0.1" data-pl="da" data-id="${I}" value="${p.descuento_anual_pct ?? 20}" style="width:60px"></label>
        <div style="margin-top:4px">
          <label ${LB}>Anual S/ <input type="number" step="0.1" data-pl="an" data-id="${I}" value="${p.precio_anual ?? r2(p.precio_mensual * 12)}" style="width:90px"></label>
          <label ${LB}>Anual antes S/ <input type="number" step="0.1" data-pl="antan" data-id="${I}" value="${p.precio_anterior_anual ?? 0}" style="width:90px"></label>
        </div>
        <div style="font-size:12px;margin-top:4px;color:var(--mut)">
          Dcto. visible mensual: <b style="color:var(--ok)">${dctoVis}%</b> · anual: <b style="color:var(--ok)">${dctoVisAn}%</b> ·
          El anual equivale a <b style="color:var(--tx)">S/ ${r2((p.precio_anual ?? p.precio_mensual * 12) / 12)}/mes</b>
        </div>`;
      return `<div style="border:1px solid var(--bd);border-radius:8px;padding:8px 10px;margin:8px 0;background:var(--bg)">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <b>${esc(p.nombre)}</b> <small style="color:var(--mut)">(${I})</small>
          <span style="flex:1"></span>
          <button type="button" class="mini verde" data-pl="aplicar" data-id="${I}" ${datos ? "" : "disabled"} title="${datos ? "" : "Primero carga un negocio"}">Asignar a negocio cargado</button>
          <button type="button" class="mini" data-pl="capturar" data-id="${I}" ${datos ? "" : "disabled"} title="Copia los booleanos y números del negocio cargado como plantilla de este plan">📸 Plantilla desde negocio cargado</button>
          ${p.plantilla ? `<button type="button" class="mini" data-pl="quitarpl" data-id="${I}">Quitar plantilla</button>` : ""}
          <button type="button" class="mini rojo" data-pl="del" data-id="${I}">🗑</button>
        </div>
        <div style="margin:6px 0">${precios}</div>
        <div>${lims}</div>
        <small style="color:var(--mut)">Módulos: ${Object.keys(p.modulos || {}).length} · Plantilla: ${p.plantilla ? contar(p.plantilla) + " campos" : "sin plantilla"}</small>
      </div>`;
    }).join("");
    $pb.innerHTML = `<div style="margin:8px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button type="button" class="mini verde" data-pl="guardar">💾 Guardar planes</button>
        <button type="button" class="mini" data-pl="cargar">↻ Recargar</button>
        <button type="button" class="mini" data-pl="nuevo">+ Nuevo plan</button>
        <span class="dirty">${planesDirty ? "● sin guardar" : ""}</span><small style="color:var(--mut)">${esc(planesMsg)}</small></div>${tarjetas}`;
  }

  function pintarPlanes() { _pintarPlanes(); pintarAsignar(); }

  async function cargarPlanes() {
    if (planesDirty && !confirm("Hay cambios de planes sin guardar. ¿Recargar y perderlos?")) return;
    planesMsg = "Consultando…"; pintarPlanes();
    try {
      const s = await getDoc(await planesDoc());
      planesCargado = true; planesDirty = false;
      if (!s.exists()) { planes = null; planesMsg = "No existe costos_geinz_saas/config_planes. Sube el JSON inicial."; }
      else { planes = s.data().planes || {}; planesMsg = "✔ Planes cargados."; }
    } catch (e) { console.error(e); planes = null; planesMsg = "Error: " + e.message; }
    pintarPlanes();
  }

  async function guardarPlanes() {
    if (!planes) return;
    if (!confirm("Se reemplazarán los planes en costos_geinz_saas/config_planes")) return;
    try {
      Object.values(planes).forEach((p) => recalcular(p, false, true, false));
      await setDoc(await planesDoc(), { planes, actualizado: Timestamp.now() });
      planesDirty = false; planesMsg = "✔ Planes guardados.";
    } catch (e) { console.error(e); planesMsg = "Error al guardar: " + e.message; }
    pintarPlanes();
  }

  async function subirIniciales() {
    try {
      const ref = await planesDoc();
      const s = await getDoc(ref);
      if (s.exists() && !confirm("Ya existe config_planes. ¿Sobrescribir con el JSON inicial?")) return;
      const ini = structuredClone(PLANES_INICIALES);
      Object.values(ini).forEach((p) => { if (!p.es_cotizacion) { p.markup_pct = 40; recalcular(p, false); } });
      await setDoc(ref, { planes: ini, actualizado: Timestamp.now() });
      planes = ini; planesDirty = false; planesCargado = true; planesMsg = "✔ JSON inicial subido.";
    } catch (e) { console.error(e); planesMsg = "Error: " + e.message; }
    pintarPlanes();
  }

  // ── Aplicar plan al negocio cargado ──
  function recorrer(cb) {
    const rec = (cont, padre, raiz) => {
      for (const k of Object.keys(cont)) {
        const r = raiz ?? k;
        cb(cont, k, padre, r);
        const v = cont[k];
        if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Timestamp)) rec(v, k, r);
      }
    };
    rec(datos, null, null);
  }

  // ── Fechas (Timestamp): meses de calendario, se suman sobre el vencimiento vigente ──
  function addMeses(d, n) {
    const r = new Date(d), dia = r.getDate();
    r.setDate(1); r.setMonth(r.getMonth() + n);
    r.setDate(Math.min(dia, new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
    return r;
  }
  const planActual = () => datos?.panel_admin?.plan;
  const pad2 = (n) => String(n).padStart(2, "0");
  const fmtDMY = (d) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  function calcFin(o) {
    const ts = datos.panel_admin?.timestamp_fin;
    const act = ts instanceof Timestamp ? ts.toDate() : null;
    const base = o.sumar && act && act.getTime() > Date.now() ? act : new Date();
    const fin = addMeses(base, (o.periodo === "anual" ? 12 : 1) * Math.max(1, o.cant));
    fin.setHours(23, 59, 59, 0);
    return fin;
  }
  const fmtFecha = (v) => (v instanceof Timestamp ? v.toDate().toLocaleString("es-PE") : "—");

  // ── Plantilla: booleanos y números del negocio, con la misma estructura ──
  function extraer(o) {
    const r = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "boolean" || typeof v === "number") r[k] = v;
      else if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Timestamp)) { const x = extraer(v); if (Object.keys(x).length) r[k] = x; }
    }
    return r;
  }
  const contar = (o) => Object.values(o).reduce((n, v) => n + (v && typeof v === "object" ? contar(v) : 1), 0);
  function volcar(dest, tpl, raiz, log, raices) {
    for (const [k, v] of Object.entries(tpl)) {
      const r = raiz ?? k;
      if (v && typeof v === "object") {
        if (!dest[k] || typeof dest[k] !== "object" || Array.isArray(dest[k]) || dest[k] instanceof Timestamp) dest[k] = {};
        volcar(dest[k], v, r, log, raices);
      } else if (dest[k] !== v) { dest[k] = v; raices.add(r); log.push(`${k} = ${v}`); }
    }
  }

  // ── Barra "Asignar plan" (visible al cargar un negocio) ──
  const $a = document.createElement("div");
  $a.style.cssText = "display:none;margin:12px 0;padding:12px 14px;border:1px solid var(--bd);border-radius:10px;background:var(--card)";
  $estado.insertAdjacentElement("afterend", $a);
  const asg = { plan: "", periodo: "mensual", cant: 1, sumar: true, creditos: "reset" };
  const rango = (id) => { const p = planes?.[id]; return !p ? 0 : p.es_cotizacion ? Infinity : Number(p.precio_mensual) || 0; };
  const tipoCambio = (nuevo) => {
    const act = planActual();
    if (!act || !planes?.[act]) return "plan actual no reconocido";
    return act === nuevo ? "mismo plan (renovación)" : rango(nuevo) > rango(act) ? "⬆ subida de plan" : "⬇ bajada de plan";
  };

  function pintarAsignar() {
    if (!datos) { $a.style.display = "none"; return; }
    $a.style.display = "";
    if (!planes) { $a.innerHTML = `<b style="color:var(--ac)">🏷 Asignar plan</b> <small style="color:var(--mut)">${esc(planesMsg)}</small>`; return; }
    if (!planes[asg.plan]) { asg.plan = planes[planActual()] ? planActual() : Object.keys(planes)[0]; asg.sumar = asg.plan === planActual(); }
    const pl = planes[asg.plan];
    const ilim = pl.limites?.creditos_ia === U;
    const credAct = typeof datos.panel_admin?.creditos_ia === "number" ? datos.panel_admin.creditos_ia : 0;
    const credPlan = ilim ? VALOR_ILIMITADO : Number(pl.limites?.creditos_ia) || 0;
    const credNuevo = ilim ? VALOR_ILIMITADO : (asg.creditos === "arrastrar" && credAct < VALOR_ILIMITADO ? credAct + credPlan : credPlan);
    const precio = pl.es_cotizacion ? "a cotizar" : "S/ " + r2(asg.periodo === "anual" ? (pl.precio_anual ?? pl.precio_mensual * 12) * asg.cant : pl.precio_mensual * asg.cant);
    const opts = Object.entries(planes).map(([id, p]) => `<option value="${esc(id)}" ${id === asg.plan ? "selected" : ""}>${esc(p.nombre)}${p.es_cotizacion ? " (cotización)" : " · S/ " + p.precio_mensual}</option>`).join("");
    $a.innerHTML = `<div style="font-weight:700;color:var(--ac);margin-bottom:6px">🏷 Asignar plan a este negocio</div>
      <div style="font-size:12px;color:var(--mut);margin-bottom:8px">Ahora: <b style="color:var(--tx)">${esc(planActual() ?? "—")}</b> · vence ${esc(fmtFecha(datos.panel_admin?.timestamp_fin))} · créditos <b style="color:var(--tx)">${credAct}</b></div>
      <div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:6px 14px">
        <label>Plan <select data-as="plan">${opts}</select></label>
        <label>Periodo <select data-as="periodo"><option value="mensual" ${asg.periodo === "mensual" ? "selected" : ""}>Mensual</option><option value="anual" ${asg.periodo === "anual" ? "selected" : ""}>Anual</option></select></label>
        <label>Cantidad <input type="number" min="1" data-as="cant" value="${asg.cant}" style="width:64px"></label>
        <label>Créditos <select data-as="creditos">
          <option value="reset" ${asg.creditos === "reset" ? "selected" : ""}>Restablecer mes completo</option>
          <option value="arrastrar" ${asg.creditos === "arrastrar" ? "selected" : ""}>Arrastrar créditos (saldo + plan)</option></select></label>
        <label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" data-as="sumar" ${asg.sumar ? "checked" : ""}> Sumar al vencimiento vigente</label>
      </div>
      <div style="font-size:12px;margin:8px 0;color:var(--mut)">${esc(tipoCambio(asg.plan))} · nuevo vencimiento <b style="color:var(--tx)">${esc(fmtFecha(Timestamp.fromDate(calcFin(asg))))}</b> · créditos quedan en <b style="color:var(--tx)">${credNuevo}</b> · cobro <b style="color:var(--tx)">${esc(precio)}</b>${pl.plantilla ? "" : ' · <span style="color:var(--warn)">este plan no tiene plantilla: solo se ajustan límites y módulos</span>'}</div>
      <button type="button" class="btn" data-as="aplicar">Aplicar plan al negocio</button>`;
  }

  $a.addEventListener("change", (e) => {
    const el = e.target, k = el.dataset.as;
    if (!k) return;
    if (k === "plan") { asg.plan = el.value; asg.sumar = el.value === planActual(); }
    if (k === "periodo") asg.periodo = el.value;
    if (k === "cant") asg.cant = Math.max(1, parseInt(el.value) || 1);
    if (k === "sumar") asg.sumar = el.checked;
    if (k === "creditos") asg.creditos = el.value;
    pintarAsignar();
  });
  $a.addEventListener("click", (e) => { if (e.target.closest('[data-as="aplicar"]')) aplicarPlan(asg.plan, asg); });

  // ── Aplicar plan: plantilla exacta + límites + módulos + créditos + fecha_fin ──
  function aplicarPlan(id, o) {
    const plan = planes?.[id];
    if (!plan || !datos) return alert("Carga un negocio y los planes primero");
    const cambio = tipoCambio(id), log = [], raices = new Set(["panel_admin"]);
    const marcar = (r, t) => { raices.add(r); log.push(t); };
    if (!datos.panel_admin || typeof datos.panel_admin !== "object" || Array.isArray(datos.panel_admin)) datos.panel_admin = {};
    const P = datos.panel_admin;
    const credPrev = typeof P.creditos_ia === "number" && P.creditos_ia < VALOR_ILIMITADO ? P.creditos_ia : 0;

    if (plan.plantilla) volcar(datos, plan.plantilla, null, log, raices);

    // panel_admin: plan, vencimiento (timestamp_fin + fecha_fin texto dd/mm/aaaa), trabajadores y créditos
    const fin = calcFin(o);
    P.plan = id;
    P.timestamp_fin = Timestamp.fromDate(fin);
    P.fecha_fin = fmtDMY(fin);
    log.push(`panel_admin.plan = ${id}`, `panel_admin.timestamp_fin = ${fin.toISOString()}`, `panel_admin.fecha_fin = ${P.fecha_fin}`);
    const lt = plan.limites?.trabajadores;
    if (lt !== undefined) { P.roles_max = lt === U ? VALOR_ILIMITADO : Number(lt); log.push(`panel_admin.roles_max = ${P.roles_max}`); }
    const lc = plan.limites?.creditos_ia;
    if (lc !== undefined) {
      let nv = lc === U ? VALOR_ILIMITADO : Number(lc);
      if (o.creditos === "arrastrar" && nv !== VALOR_ILIMITADO) nv += credPrev;
      P.creditos_ia = nv; log.push(`panel_admin.creditos_ia = ${nv}`);
    }

    // resto de límites y módulos (donde existan en el negocio)
    recorrer((c, k, padre, raiz) => {
      for (const [lim, par, clave] of LIM_MAP) {
        if (k !== clave || (par && padre !== par) || !(lim in (plan.limites || {})) || typeof c[k] === "object") continue;
        const v = plan.limites[lim];
        c[k] = v === U ? VALOR_ILIMITADO : Number(v);
        marcar(raiz, `${clave} = ${c[k]}`);
      }
    });

    recorrer((c, k, padre, raiz) => {
      for (const [mod, clave] of Object.entries(MOD_MAP)) {
        if (k !== clave || !(mod in (plan.modulos || {}))) continue;
        const on = !!plan.modulos[mod];
        if (typeof c[k] === "boolean") { c[k] = on; marcar(raiz, `${clave} = ${on}`); }
        else if (c[k] && typeof c[k] === "object" && typeof c[k].activo === "boolean") { c[k].activo = on; marcar(raiz, `${clave}.activo = ${on}`); }
      }
    });

    raices.forEach((r) => dirty.add(r));
    render();
    pintarAsignar();
    console.log("Plan aplicado:", log);
    $estado.className = "ok";
    $estado.textContent = `Plan "${plan.nombre}" aplicado en pantalla (${cambio}, ${log.length} campos). Revisa y guarda.`;
    if (confirm(`Plan "${plan.nombre}" aplicado (${cambio}).\nVence: ${P.fecha_fin}\nCréditos: ${P.creditos_ia}\n\n¿Guardar en Firestore ahora?`)) guardar([...dirty]);
  }

  // ── Eventos del panel ──
  $pb.addEventListener("change", (e) => {
    const el = e.target, a = el.dataset.pl, p = planes?.[el.dataset.id];
    if (!a || !p) return;
    const n = parseFloat(el.value);
    if (a === "m")   { p.precio_mensual = n || 0; recalcular(p); }
    if (a === "mk")  { p.markup_pct = n || 0; recalcular(p); }
    if (a === "ant") { p.precio_anterior = n || 0; recalcular(p, false); }
    if (a === "da")  { p.descuento_anual_pct = n || 0; recalcular(p, false); }
    if (a === "mka") { p.markup_anual_pct = n || 0; recalcular(p, false); }
    if (a === "an")  { p.precio_anual = n || 0; recalcular(p, false, true); }
    if (a === "antan") { p.precio_anterior_anual = n || 0; recalcular(p, false, true, false); }
    if (a === "lim") { p.limites[el.dataset.k] = el.value.trim().toLowerCase() === U ? U : (Number.isNaN(n) ? el.value : n); }
    planesDirty = true; pintarPlanes();
  });

  $pb.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-pl]");
    if (!b) return;
    const a = b.dataset.pl, id = b.dataset.id;
    if (a === "cargar") cargarPlanes();
    if (a === "subir") subirIniciales();
    if (a === "guardar") guardarPlanes();
    if (a === "aplicar") { if (!datos) return; asg.plan = id; asg.sumar = id === planActual(); pintarAsignar(); $a.scrollIntoView({ behavior: "smooth", block: "center" }); }
    if (a === "capturar") {
      if (!datos) return alert("Carga primero el negocio modelo");
      const base = extraer(datos);
      ["plan", "fecha_fin", "creditos_ia500", "roles_max"].forEach((x) => delete base[x]);
      if (base.panel_admin) ["creditos_ia", "roles_max"].forEach((x) => delete base.panel_admin[x]);
      if (!confirm(`Guardar ${contar(base)} campos (booleanos y números) del negocio cargado como plantilla de "${planes[id].nombre}"?\nReemplaza la plantilla anterior.`)) return;
      planes[id].plantilla = base; planesDirty = true; pintarPlanes();
    }
    if (a === "quitarpl") { delete planes[id].plantilla; planesDirty = true; pintarPlanes(); }
    if (a === "del" && confirm(`¿Eliminar el plan "${id}"?`)) { delete planes[id]; planesDirty = true; pintarPlanes(); }
    if (a === "nuevo") {
      const nid = (prompt("ID del nuevo plan (ej: starter)") || "").trim().toLowerCase().replace(/\s+/g, "_");
      if (!nid || planes[nid]) return alert("ID vacío o ya existe");
      planes[nid] = structuredClone(planes.pro || Object.values(planes)[0]);
      planes[nid].nombre = "Plan " + nid; planes[nid].es_mas_popular = false;
      planesDirty = true; pintarPlanes();
    }
  });

  // ── Importar tu propio JSON (archivo o pegado) ──
  function importarJson(txt) {
    let obj;
    try { obj = JSON.parse(txt); } catch (e) { return alert("JSON inválido: " + e.message); }
    const nuevos = obj && obj.planes && typeof obj.planes === "object" && !Array.isArray(obj.planes) ? obj.planes : obj;
    if (!nuevos || typeof nuevos !== "object" || Array.isArray(nuevos) || !Object.keys(nuevos).length)
      return alert('Formato no válido. Usa { "planes": { "id_plan": {...} } }');

    const ids = Object.keys(nuevos), errores = [];
    for (const id of ids) {
      const p = nuevos[id];
      if (!p || typeof p !== "object") { errores.push(`${id}: no es un objeto`); continue; }
      if (!p.nombre) errores.push(`${id}: falta "nombre"`);
      if (!p.limites || typeof p.limites !== "object") errores.push(`${id}: falta "limites"`);
      if (!p.modulos || typeof p.modulos !== "object") errores.push(`${id}: falta "modulos"`);
    }
    if (errores.length) return alert("Corrige el JSON:\n• " + errores.join("\n• "));

    ids.forEach((id) => {
      const p = nuevos[id];
      if (p.es_cotizacion) return;
      const m = Number(p.precio_mensual) || 0, a = Number(p.precio_anterior) || 0;
      if (p.markup_pct == null) p.markup_pct = m > 0 && a > m ? Math.round((a / m - 1) * 100) : 40;
      recalcular(p, false, p.precio_anual != null, p.precio_anterior_anual == null);
    });

    let reemplazar = true;
    if (planes && Object.keys(planes).length)
      reemplazar = confirm(`Se leyeron ${ids.length} plan(es): ${ids.join(", ")}\n\nAceptar = REEMPLAZAR todos los planes actuales\nCancelar = COMBINAR (agrega o actualiza solo esos)`);
    planes = reemplazar ? nuevos : { ...planes, ...nuevos };
    planesDirty = true; planesCargado = true;
    planesMsg = `✔ ${ids.length} plan(es) leídos del JSON. Falta guardar.`;
    pintarPlanes();
    guardarPlanes();
  }

  document.getElementById("plFile").onclick = () => document.getElementById("plFileIn").click();
  document.getElementById("plFileIn").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (f) importarJson(await f.text());
  });
  document.getElementById("plPegarBtn").onclick = () => {
    const w = document.getElementById("plPegar");
    w.style.display = w.style.display === "none" ? "" : "none";
  };
  document.getElementById("plUsar").onclick = () => importarJson(document.getElementById("plTxt").value);

  pintarPlanes();

  // Arranque automático si la URL trae negocioId (debe ir al final)
  if (url.get("negocioId")) cargar();