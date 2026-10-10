// src/js/dasboardjs/servicios_dashboard.js
// SOLO LECTURA. Lo usa el dashboard del usuario final.
// ⚠ No importes aquí updateDoc/setDoc ni "servicios_geinz.js" (ese es el editor tuyo).

// Apartados del doc que se muestran en detalle en Ajustes
export const GRUPOS_DETALLE = [
  "cliente_y_fidelizacion",
  "mi_negocio",
  "operacion_ventas",
  "panel_admin",
];

export const ETIQUETA_GRUPO = {
  cliente_y_fidelizacion: "Clientes y fidelización",
  mi_negocio: "Mi negocio",
  operacion_ventas: "Operación y ventas",
  panel_admin: "Panel y límites",
};

// Estos ya se muestran en la tarjeta "Plan", no se repiten como chips
const NO_MOSTRAR = new Set([
  "panel_admin.plan",
  "panel_admin.fecha_fin",
  "panel_admin.timestamp_fin",
  "panel_admin.creditos_ia500",
  "panel_admin.roles_max",
]);

// "a.b.c" → obj.a.b.c (o undefined)
export function leer(obj, ruta) {
  return ruta.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// ══════════════════════════════════════════════════════════════
//  QUÉ SECCIÓN DEL DASHBOARD SE ACTIVA CON QUÉ CAMPO DEL DOC
//  nuevo: rutas dentro de los 4 mapas (basta 1 en true)
//  viejo: campos de apartados_dasboard (se usan SOLO si el doc aún
//         no tiene ninguna de las rutas "nuevo")
//  viejo: null → siempre disponible (no depende del plan)
//  ⚠ = ruta nueva sin confirmar: completa "nuevo" cuando la tengas
// ══════════════════════════════════════════════════════════════
// Cada sección del sidebar → ruta(s) del JSON que la activan.
// Si la ruta es un mapa, basta con que haya un true adentro.
export const RUTAS_SECCION = {
  // Mi negocio
  perfil:       { nuevo: ["mi_negocio.perfil"], viejo: null },
  comprobantes: { nuevo: ["mi_negocio.comprobantes"], viejo: [] },
  trabajadores: { nuevo: ["mi_negocio.mis_trabajadores"], viejo: [] },
  legal: {
    nuevo: ["mi_negocio.legal"],
    viejo: ["libro_reclamaciones", "politicas_privacidad", "terminos_condiciones"],
  },
  // Operación y ventas
  pedidos:   { nuevo: ["operacion_ventas.pedidos_vivos"], viejo: ["pedidios_vivos", "pedidos_mesas", "pedidos_presencial"] },
  productos: { nuevo: ["operacion_ventas.produtos"], viejo: ["productos"] },
  historial: { nuevo: ["operacion_ventas.historial_ventas"], viejo: ["historial_ventas"] },
  // Clientes y fidelización
  usuarios:         { nuevo: ["cliente_y_fidelizacion.mis_usuarios"], viejo: [] },
  fidelizacion:     { nuevo: ["cliente_y_fidelizacion.cupones_puntos"], viejo: ["fidelizacion"] },
  publicidad:       { nuevo: ["cliente_y_fidelizacion.publicidad_ofertas"], viejo: ["publicidad_perfil", "publicidad_dias", "publicidad_estatica"] },
  mispublicaciones: { nuevo: ["cliente_y_fidelizacion.miqr.review", "cliente_y_fidelizacion.publicidad_ofertas.publicidad.review"], viejo: ["review"] },
  qr:               { nuevo: ["cliente_y_fidelizacion.miqr"], viejo: ["qr_general"] },
  // Sin dependencia del plan
  historialgasto: { nuevo: [], viejo: null },
  recargas:       { nuevo: [], viejo: null },
};

// true si es true, o si es un mapa con algún true adentro
function hayTrue(v) {
  if (typeof v === "boolean") return v;
  if (v && typeof v === "object" && typeof v.toDate !== "function")
    return Object.values(v).some(hayTrue);
  return false;
}

export function seccionDelPlan(servicios, key) {
  const r = RUTAS_SECCION[key];
  if (!r) return false;

  // Manda la estructura nueva si el doc la trae
  const valores = (r.nuevo || []).map((p) => leer(servicios, p)).filter((v) => v !== undefined);
  if (valores.length) return valores.some(hayTrue);

  // Sin dato en el doc: siempre disponible
  if (r.viejo === null || (r.viejo || []).length === 0) return true;

  // Doc sin migrar: cae a apartados_dasboard
  const ap = servicios?.apartados_dasboard;
  return !!ap && r.viejo.some((c) => ap[c] === true);
}

// Datos de la tarjeta "Plan" (la estructura nueva manda, con respaldo al doc viejo)
export function resumenPlan(s) {
  const pa = s?.panel_admin || {};
  const ad = s?.apartados_dasboard || {};
  const fechaFin =
    pa.fecha_fin ??
    (pa.timestamp_fin?.toDate ? pa.timestamp_fin.toDate().toLocaleDateString("es-PE") : null);
  return {
    plan: pa.plan ?? s?.plan ?? null,
    fechaFin,
    rolesMax: Number(pa.roles_max ?? ad.roles_maximos) || 5,
    creditos: pa.creditos_ia500 ?? ad.creditos_AI500 ?? 0,
    categoria: s?.categoria ?? null,
    dominio: s?.dominio || null,
    dominioPersonalizado: s?.dominio_perzonalizado === true,
  };
}

// Convierte los 4 mapas en una lista plana: [{grupo, ruta, etiqueta, valor}]
export function aplanarApartados(s) {
  const out = [];
  const rec = (obj, ruta) => {
    for (const [k, v] of Object.entries(obj || {})) {
      const r = [...ruta, k];
      const esMapa = v && typeof v === "object" && !Array.isArray(v) && typeof v.toDate !== "function";
      if (esMapa) rec(v, r);
      else if (!NO_MOSTRAR.has(r.join("."))) {
        out.push({ grupo: r[0], ruta: r.join("."), etiqueta: r.slice(1).join(" › "), valor: v });
      }
    }
  };
  GRUPOS_DETALLE.forEach((g) => rec(s?.[g], [g]));
  return out;
}

const e = (t) =>
  String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Chip de un apartado (usa tus clases .admin-tag y .perm-tag)
export function htmlApartado(a) {
  const nombre = e((a.etiqueta || a.ruta).replace(/_/g, " "));
  if (typeof a.valor === "boolean") {
    return a.valor
      ? `<span class="admin-tag">${nombre}</span>`
      : `<span class="perm-tag" style="opacity:.4;text-decoration:line-through;">${nombre}</span>`;
  }
  const v = a.valor?.toDate ? a.valor.toDate().toLocaleDateString("es-PE") : a.valor;
  return `<span class="perm-tag">${nombre}: <b>${e(v)}</b></span>`;
}
// ══════════════════════════════════════════════════════════════
//  DETALLE DEL PLAN: datos de la DB con nombres que entiende el dueño
// ══════════════════════════════════════════════════════════════
const esMapaDB = (v) =>
  v && typeof v === "object" && !Array.isArray(v) && typeof v.toDate !== "function";

// Campos técnicos que no aportan al dueño (timestamp_fin ya se ve en "Vence")
const OCULTAR = new Set(["timestamp_fin", "modulos"]);

const ICONO_GRUPO = {
  panel_admin: "💎",
  cliente_y_fidelizacion: "🎁",
  mi_negocio: "🏪",
  operacion_ventas: "🧾",
};

// nombre en la DB → nombre para el usuario
const ETQ = {
  // panel_admin
  plan: "Tu plan",
  fecha_fin: "Vence el",
  creditos_ia500: "Créditos de IA",
  roles_max: "Trabajadores / roles permitidos",
  // fidelización
  cupones_puntos: "Cupones y puntos",
  cupones_metricas: "Estadísticas de cupones",
  miqr: "Mi QR",
  carta: "Carta digital",
  libro_reclamaciones: "Libro de reclamaciones",
  mesas: "Mesas",
  cantidad_max: "Máximo de mesas",
  mis_productos: "Mis productos",
  perfil: "Perfil del negocio",
  review: "Reseñas",
  mis_usuarios: "Mis usuarios",
  publicidad_ofertas: "Publicidad y ofertas",
  mis_publicaciones: "Mis publicaciones",
  ofertas: "Ofertas",
  baner: "Banner",
  cantidad_ofertas: "Máximo de ofertas",
  publicidad: "Publicidad",
  fanpage: "Fan page",
  // mi negocio
  comprobantes: "Comprobantes",
  legal: "Legal",
  politicas: "Políticas de privacidad",
  terminos: "Términos y condiciones",
  mis_trabajadores: "Mis trabajadores",
  // operación y ventas
  historial_ventas: "Historial de ventas",
  pedidos_vivos: "Pedidos en vivo",
  activo: "Activado",
  auto_off: "Apagado automático",
  auto_reserva: "Reserva automática",
  delivery_config: "Configuración de delivery",
  estado_pedidos: "Estados de pedidos",
  mis_delivery: "Mis repartidores",
  maximo_delivery: "Máximo de repartidores",
  tiempos: "Tiempos de entrega",
  mesa: "Pedidos por mesa",
  config_mesas: "Configurar mesas",
  mozos: "Mozos",
  nuevo_pedido: "Nuevo pedido",
  uso_camara_scaner: "Escanear con la cámara",
  uso_celular_scaner: "Escanear con el celular",
  produtos: "Productos",
  cantidad_imagenes_colecciones: "Imágenes por colección",
  colecciones: "Colecciones",
  config_avanzado: "Configuración avanzada",
  variantes_maximas: "Variantes máximas por producto",
  max_colecciones: "Máximo de colecciones",
  max_productos_por_colecciones: "Máximo de productos por colección",
  modo_avanzado: "Modo avanzado",
  modo_basico: "Modo básico",
  carrito: "Carrito de compras",
};

const nombreBonito = (k) => {
  if (ETQ[k]) return ETQ[k];
  const t = String(k).replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

// "07/11/2026" → "7 de noviembre de 2026 (faltan 28 días)"
function fmtFechaFin(txt) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(txt));
  if (!m) return String(txt);
  const f = new Date(+m[3], +m[2] - 1, +m[1], 23, 59, 59);
  const larga = f.toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });
  const dias = Math.ceil((f - new Date()) / 86400000);
  const resto = dias > 1 ? ` · faltan ${dias} días` : dias === 1 ? " · vence mañana" : dias === 0 ? " · vence hoy" : " · vencido";
  return `${larga}<span class="pl-resto${dias <= 7 ? " pl-urgente" : ""}">${resto}</span>`;
}

function htmlValor(k, v) {
  if (typeof v === "boolean")
    return v ? `<span class="pl-si">✓ Incluido</span>` : `<span class="pl-no">No incluido</span>`;
  if (k === "fecha_fin") return fmtFechaFin(v);
  if (k === "plan") return `<span class="pl-plan">${e(String(v).toUpperCase())}</span>`;
  if (typeof v === "number") return `<b>${e(v)}</b>`;
  if (v && typeof v.toDate === "function") return e(v.toDate().toLocaleDateString("es-PE"));
  return e(v ?? "—");
}

function htmlNodo(obj) {
  const entradas = Object.entries(obj || {}).filter(([k]) => !OCULTAR.has(k));
  const filas = entradas.filter(([, v]) => !esMapaDB(v));
  const mapas = entradas.filter(([, v]) => esMapaDB(v) && Object.keys(v).some((k) => !OCULTAR.has(k)));

  const htmlFilas = filas
    .map(([k, v]) => `<div class="pl-row"><span class="pl-k">${e(nombreBonito(k))}</span><span class="pl-v">${htmlValor(k, v)}</span></div>`)
    .join("");

  const htmlMapas = mapas
    .map(([k, v]) => `<div class="pl-sub"><p class="pl-sub-t">${e(nombreBonito(k))}</p>${htmlNodo(v)}</div>`)
    .join("");

  return htmlFilas + htmlMapas;
}

export function htmlDetallePlan(s) {
  return GRUPOS_DETALLE.filter((g) => esMapaDB(s?.[g]))
    .map(
      (g) => `
      <div class="pl-grupo">
        <p class="pl-grupo-t"><span>${ICONO_GRUPO[g] || "•"}</span> ${e(ETIQUETA_GRUPO[g] || g)}</p>
        ${htmlNodo(s[g])}
      </div>`,
    )
    .join("");
}