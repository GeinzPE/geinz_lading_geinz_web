
  // structure_min.js NO se modifica: solo se usan sus dos funciones.
  import { obtenerServiciosGeinz, guardarServiciosGeinz } from "../js/structure/structure_min.js";
  import { Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

  // ¿el nombre (clave o etiqueta bonita) coincide con la búsqueda?
  function nombreCoincide(clave) {
    const b = q();
    if (!b) return true;
    return norm(clave).includes(b) || norm(etiquetaDe(clave) || "").includes(b);
  }

  // ¿se muestra este nodo? (recursivo). forzar = un ancestro coincidió, se muestra todo lo de adentro.
  function visible(clave, valor, forzar) {
    const t = tipoDe(valor);
    const coincide = !q() || forzar || nombreCoincide(clave);
    if (t === "map" || t === "array") {
      const ent = t === "map" ? Object.entries(valor) : valor.map((x, i) => [i, x]);
      if (!ent.length) return filtroEstado === "todos" && coincide;
      return ent.some(([k, x]) => visible(k, x, coincide && (!!q() ? (forzar || nombreCoincide(clave)) : false)));
    }
    // hoja
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
      const guardar = raiz
        ? `<button class="mini verde" data-act="save" data-path="${p}">Guardar</button><span class="dirty">${dirty.has(clave) ? "● sin guardar" : ""}</span>`
        : "";
      return `<details ${abierto ? "open" : ""} data-pk="${esc(pk)}" ${raiz ? `data-root="${esc(clave)}"` : ""}>
        <summary>${nombreHtml(clave, enArray)}<span class="tipo">${t} · ${entradas.length}</span>
          <span class="acc"><button class="mini" data-act="add" data-path="${p}">+ campo</button> ${guardar} ${del}</span>
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
      // si hay filtro Activados/Desactivados, refrescar para que el campo cambie de lista
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
    if (q() || filtroEstado !== "todos") return; // durante la búsqueda no se recuerda el estado
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
      const r = await obtenerServiciosGeinz(p);
      if (!r.existe) {
        $estado.className = "error";
        $estado.textContent = `No existe el documento: ${r.ruta}`;
        datos = null;
        return;
      }
      datos = r.datos; params = p; rutaDoc = r.ruta;
      dirty.clear(); cerrados.clear();
      consulta = ""; $buscar.value = "";
      $estado.innerHTML = `✔ ${esc(r.ruta)}<br>Traídos: ${Object.keys(r.datos).join(", ") || "(ninguno)"}` +
        (r.faltantes?.length ? `<br>No existen en el doc: ${r.faltantes.join(", ")}` : "") +
        `<br>Ignorados (a mano): ${r.ignorados.join(", ") || "(ninguno)"}`;
      $barra.style.display = "flex";
      render();
    } catch (e) {
      console.error(e);
      $estado.className = "error";
      $estado.textContent = "Error: " + e.message;
    }
  }

  async function guardar(raices) {
    if (!params || !datos) return;
    if (!raices.length) { alert("No hay cambios sin guardar"); return; }
    if (!confirm(`Se reemplazarán en Firestore:\n• ${raices.join("\n• ")}\n\n${rutaDoc}`)) return;
    try {
      const cambios = {};
      raices.forEach((k) => (cambios[k] = datos[k]));
      const r = await guardarServiciosGeinz({ ...params, cambios });
      raices.forEach((k) => dirty.delete(k));
      render();
      $estado.className = "ok";
      $estado.textContent = `✔ Guardado: ${r.guardados.join(", ")} (${r.ruta})`;
    } catch (e) {
      console.error(e);
      $estado.className = "error";
      $estado.textContent = "Error al guardar: " + e.message;
    }
  }

  document.getElementById("guardarTodo").onclick = () => guardar([...dirty]);
  $f.addEventListener("submit", (e) => { e.preventDefault(); cargar(); });
  window.addEventListener("beforeunload", (e) => { if (dirty.size) { e.preventDefault(); e.returnValue = ""; } });
  if (url.get("negocioId")) cargar();
