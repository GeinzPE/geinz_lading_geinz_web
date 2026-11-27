// Uso:  node aplicar_cambios.mjs ruta/a/carrito.js
// Crea carrito.backup.js y deja carrito.js corregido (carga progresiva + "Todos" literal).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const file = process.argv[2];
if (!file) { console.error("Falta la ruta: node aplicar_cambios.mjs carrito.js"); process.exit(1); }
let src = fs.readFileSync(file, "utf8");
fs.writeFileSync(path.join(path.dirname(file), "carrito.backup.js"), src); // backup original
const CRLF = src.includes("\r\n");
src = src.replace(/\r\n/g, "\n"); // normaliza saltos de línea para que las anclas coincidan

const once = (s, m) => {
  const n = s.split(m).length - 1;
  if (n !== 1) throw new Error(`Ancla encontrada ${n} veces (debe ser 1):\n${m.slice(0, 90)}`);
};
// reemplaza desde `ini` (incluido) hasta `fin` (excluido)
function between(ini, fin, nuevo) {
  once(src, ini); once(src, fin);
  const a = src.indexOf(ini), b = src.indexOf(fin);
  if (b < a) throw new Error("Orden de anclas inválido: " + ini.slice(0, 60));
  src = src.slice(0, a) + nuevo + src.slice(b);
}
function swap(viejo, nuevo) { once(src, viejo); src = src.replace(viejo, () => nuevo); }

/* 1) imports */
swap("getCountFromServer,", "getCountFromServer,\n  query,\n  limit,\n  startAfter,");

/* 2) carga por páginas (reemplaza leerCategoria + asegurarCategoria) */
between("async function leerCategoria(id) {", "function registrarProductos(arr) {", String.raw`const PRIMERA_PAGINA = 24;
const _catsCompletas = new Set();
let bizListaP = Promise.resolve(); // mapearProducto necesita bizData (puntos)

// Devuelve { primera, completa }: primera = 24 productos (pinta ya), completa = el resto
function asegurarCategoria(id) {
  if (!_catsMeta.has(id))
    return { primera: Promise.resolve(), completa: Promise.resolve() };
  if (_cargaCat.has(id)) return _cargaCat.get(id);

  const colRef = tiendaSubCol(localidad, "tiendas", tiendaId, "productos", id, id);
  const horarioCat = _catsMeta.get(id)?.horarioCat || null;
  const mapear = (snap) => {
    const arr = [];
    snap.forEach((d) => {
      const p = mapearProducto(d, id, horarioCat, bizData);
      if (p) arr.push(p);
    });
    return arr;
  };

  const primera = getDocs(query(colRef, limit(PRIMERA_PAGINA))).then(async (snap) => {
    await bizListaP;
    const arr = mapear(snap);
    _catsListas.add(id);
    if (!arr.length && snap.size < PRIMERA_PAGINA) _catsVacias.add(id);
    registrarProductos(arr);
    return snap;
  });

  const completa = primera.then(async (snap) => {
    if (snap.size >= PRIMERA_PAGINA) {
      const resto = await getDocs(
        query(colRef, startAfter(snap.docs[snap.docs.length - 1])),
      );
      registrarProductos(mapear(resto));
    }
    _catsCompletas.add(id);
    if (!productosGlobal.some((p) => p.categoria === id)) {
      _catsVacias.add(id);
      if (catalogoPintado) renderFiltros();
    }
  });

  const fallo = (e) => {
    console.warn("Categoría falló:", id, e.message);
    _cargaCat.delete(id); // permite reintentar
  };
  const entrada = { primera: primera.catch(fallo), completa: completa.catch(fallo) };
  _cargaCat.set(id, entrada);
  return entrada;
}

`);

/* 3) cargarResto */
between("// Carga lo que falta en segundo plano", "/* ══════════════ Render tienda (logo + color) ══════════════ */", String.raw`// Carga lo que falta en segundo plano, 3 categorías a la vez
function cargarResto(ids) {
  const pend = ids.filter((id) => !_cargaCat.has(id));
  const worker = async () => {
    while (pend.length) await asegurarCategoria(pend.shift()).completa;
  };
  return Promise.all([worker(), worker(), worker()]);
}

`);

/* 4) setActiveCategoria espera solo la primera página */
swap("await asegurarCategoria(cat);", "await asegurarCategoria(cat).primera;");

/* 5) búsqueda: re-filtra cuando terminan de llegar las categorías */
swap(
  "    filtroTexto = normalizeText(searchInput.value);\n    applyFilters();\n  }, 120);",
  "    filtroTexto = normalizeText(searchInput.value);\n    applyFilters();\n    todoCargadoP.then(() => {\n      if (filtroTexto) applyFilters();\n    });\n  }, 120);",
);

/* 6) alias en caché local (ahorra un viaje a Firestore) */
between("      const alias = decodeURIComponent(match[1]);", "  // Fallback: URL vieja con ?localidad=&id=", String.raw`      const alias = decodeURIComponent(match[1]);
      const k = "geinz_alias_" + alias;
      try {
        const c = JSON.parse(localStorage.getItem(k) || "null");
        if (c && c.id && c.localidad) {
          aliasNegocio = alias;
          tiendaId = c.id;
          localidad = c.localidad;
        }
      } catch {}
      if (!tiendaId) {
        try {
          const aliasSnap = await getDoc(doc(db, "alias_tiendas", alias));
          if (aliasSnap.exists()) {
            const data = aliasSnap.data();
            if (data.id && data.localidad) {
              aliasNegocio = alias;
              tiendaId = data.id;
              localidad = data.localidad.trim().toLowerCase();
              try {
                localStorage.setItem(k, JSON.stringify({ id: tiendaId, localidad }));
              } catch {}
            }
          }
        } catch (e) {
          console.error("No se pudo resolver el alias del negocio:", e);
        }
      }
    }
  }
`);

/* 7) init(): todo en paralelo, "Todos" literal, pinta con la primera página */
between("  capturarCampana();\n", "/* ══════════ Campañas físicas (el servidor cuenta todo) ══════════ */", String.raw`  capturarCampana();

  // ══ WAVE 1: todo sale a la vez ══
  const bizP = loadTienda();
  bizListaP = bizP.then((b) => { bizData = b; });
  const catsP = listarCategorias();
  const usuarioP = cargarUsuarioLogeado(); // NO bloquea el pintado
  const tipoP = loadTipoTienda();          // NO bloquea
  loadPedidoMesa();                        // solo hace algo en mesa; NO bloquea

  const [biz, catIds] = await Promise.all([bizP, catsP]);

  // ══ WAVE 2: ofertas + primera página de las 3 primeras categorías, a la vez ══
  modoSinTodos = false; // "Todos" siempre visible
  const primerasIds = catIds.slice(0, 3);
  const primerasP = primerasIds.map((id) => asegurarCategoria(id).primera);
  const ofertasActivas = await loadOfertasActivas(); // ya ve bizData

  promosGlobal = [...normalizarPromociones(biz), ...ofertasActivas];
  promosGlobal.sort((a, b) => (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0));
  promosGlobal.forEach((p) => productosPorId.set(p.id, p));

  // Solo la PRIMERA PÁGINA de esas categorías bloquea el pintado
  await Promise.all(primerasP);

  if (esCampana()) {
    await usuarioP;
    if (!(await iniciarCampana())) return;
  }

  actualizarCatalogoGlobal();
  document.getElementById("totalCount").textContent = catalogoGlobal.length;
  bindCuponInputs();
  await renderTienda(biz);
  aplicarComportamientoBotonAtras();
  renderMetodosPago(biz);
  montarChipsVuelto();
  aplicarModoCampana();
  horarioEstado = evaluarHorarioNegocio(bizData, new Date());
  pintarBannerHorario(horarioEstado);
  if (mesaId) iniciarSeguimientoMesa();

  if (!catIds.length && !promosGlobal.length) {
    document.getElementById("lista").innerHTML = "";
    document.getElementById("emptyMsg").classList.remove("hidden");
    document.getElementById("emptyMsg").classList.add("flex");
    hidePageLoader();
    return;
  }

  // ══ PINTADO ══
  renderFiltros();
  buildAllCards();
  catalogoPintado = true;
  applyFilters();
  updateCartUI();
  hidePageLoader();
  if (biz?.img_tienda?.logo_tienda) setFaviconCircular(biz.img_tienda.logo_tienda);

  // ══ Todo lo demás, ya con la pantalla visible ══
  todoCargadoP = Promise.all([
    ...primerasIds.map((id) => asegurarCategoria(id).completa),
    cargarResto(catIds),
  ]);

  tipoP.then((t) => {
    tipoTiendaFisica = t;
    aplicarModeloNegocio(biz);
    aplicarDisponibilidadDelivery();
    aplicarPuntoEntrega();
    actualizarDireccionPorEntrega();
  });
  usuarioP.then(() => updateCartUI());
  loadAdicionales().then((a) => {
    adicionalesGlobal = a;
    a.forEach((x) => productosPorId.set(x.id, x));
    updateCartUI();
  });

  iniciarValidacionHorarioEnVivo();
  iniciarValidacionOfertasEnVivo();
  iniciarValidacionDescuentosEnVivo();
  refrescarDisponibilidadCategorias();
  setInterval(refrescarDisponibilidadCategorias, 30000);

  // ── Lo que sí necesita usuario / catálogo completo ──
  await usuarioP;
  if (urlTieneBannerCupon()) await aplicarCuponBanner();
  await todoCargadoP;
  if (!productosGlobal.length && !promosGlobal.length) {
    document.getElementById("lista").innerHTML = "";
    document.getElementById("emptyMsg").classList.remove("hidden");
    document.getElementById("emptyMsg").classList.add("flex");
  }
  if (cuponParam) {
    await buscarYAplicarCupon(cuponParam, { desdeLink: true });
    const u = new URL(location.href);
    u.searchParams.delete("cupon");
    history.replaceState(null, "", u.pathname + u.search + u.hash);
  }
  const carritoRestaurado = await restaurarCarritoTrasLogin();
  if (!carritoRestaurado) await restaurarCarritoPersistido();
  updateCartUI();
  productosGlobal.forEach((p) => syncMainListCard(p.id));

  const carritoDesdePerfil = await aplicarCarritoDesdePerfil();
  if (carritoDesdePerfil) {
    showToast("Tu selección se agregó al carrito 🛒");
  } else if (promoParam) {
    aplicarPromoDesdeLink(promoParam);
  }
  if (filtroInicialParam === "ofertas") aplicarFiltroInicial();
  if (carritoRestaurado && usuarioLogeado) {
    showToast("Sesión iniciada, continúa con tu pedido 🛒");
    if (!mesaId) openCheckout();
  }
  if (ofertaParam) aplicarOfertaDesdeLink(ofertaParam);
}
`);

if (CRLF) src = src.replace(/\n/g, "\r\n"); // restaura el formato original
fs.writeFileSync(file, src);

// verificación de sintaxis
const tmp = path.join(path.dirname(file), ".check_carrito.mjs");
fs.writeFileSync(tmp, src);
try {
  execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
} catch (e) {
  console.error("⚠️ Error de sintaxis:\n" + e.stderr?.toString());
  process.exitCode = 1;
} finally {
  fs.unlinkSync(tmp);
}