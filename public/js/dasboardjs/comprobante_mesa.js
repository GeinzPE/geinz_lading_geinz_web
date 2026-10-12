/* ═══════════════════════════════════════════════════════════════════
   comprobante_mesa.js  — módulo compartido (carrito · mozo · dashboard)
   Colócalo en: js/dasboardjs/comprobante_mesa.js
   Sin dependencias de Firebase: solo UI + validación + texto SUNAT.
   ═══════════════════════════════════════════════════════════════════ */

export const TIPOS = {
  ticket: { label: "Ticket simple", icon: "🧾" },
  boleta: { label: "Boleta electrónica", icon: "📄" },
  factura: { label: "Factura electrónica", icon: "🏢" },
};

export const AVISOS = {
  ticket: "No necesita datos. Se entrega al momento de pagar.",
  boleta:
    "Pediremos tu nombre y documento (DNI/CE). Puede tardar unos minutos más que el ticket. Verás el estado aquí mismo.",
  factura:
    "Necesitamos RUC, razón social y dirección fiscal. Es el comprobante que MÁS demora porque se valida el RUC en SUNAT. Verás el estado aquí mismo.",
};

export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

/* ── Validación ── */
export function rucValido(ruc) {
  if (!/^\d{11}$/.test(ruc)) return false;
  if (!["10", "15", "17", "20"].includes(ruc.slice(0, 2))) return false;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const s = w.reduce((a, x, i) => a + x * Number(ruc[i]), 0);
  let r = 11 - (s % 11);
  if (r === 10) r = 0;
  else if (r === 11) r = 1;
  return r === Number(ruc[10]);
}

/** Devuelve texto de error o null si todo está bien. */
export function validarDatos(tipo, d, total = 0) {
  if (tipo === "ticket") return null;
  const num = String(d.doc_numero || "").trim();
  if (tipo === "factura") {
    if (!rucValido(num)) return "RUC inválido (11 dígitos, empieza con 10/15/17/20)";
    if (!String(d.razon_social || "").trim()) return "Falta la razón social";
    if (String(d.direccion || "").trim().length < 5)
      return "Falta la dirección fiscal";
    return null;
  }
  // boleta
  const dt = d.doc_tipo || "DNI";
  if (dt === "SIN_DOC") {
    if (Number(total) >= 700)
      return "Para compras desde S/ 700 SUNAT exige documento del cliente";
    return null;
  }
  if (dt === "DNI" && !/^\d{8}$/.test(num)) return "DNI inválido (8 dígitos)";
  if (dt === "CE" && !/^[A-Za-z0-9]{8,12}$/.test(num))
    return "Carné de extranjería inválido";
  if (dt === "PASAPORTE" && !/^[A-Za-z0-9]{6,12}$/.test(num))
    return "Pasaporte inválido";
  if (!String(d.nombre || "").trim()) return "Falta el nombre completo";
  return null;
}

/* ── Imagen → dataURL liviano (guardado directo en Firestore, <1 MiB) ── */
export function comprimirImagen(file, max = 900) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let out = c.toDataURL("image/webp", 0.72);
      if (!out.startsWith("data:image/webp")) out = c.toDataURL("image/jpeg", 0.72);
      if (out.length > 900000) return reject(new Error("Imagen muy pesada"));
      resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}

/** Abre el selector de archivos/cámara y devuelve el dataURL comprimido (o null). */
export function elegirFoto() {
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return resolve(null);
      try {
        resolve(await comprimirImagen(f));
      } catch (e) {
        alert(e.message || "No se pudo procesar la imagen");
        resolve(null);
      }
    };
    inp.click();
  });
}

/* ── Modal para elegir comprobante + datos ──
   opts: { total, previo, titulo, onSubmit: async ({tipo, datos}) => void }
   Devuelve una promesa que se resuelve al cerrar. */
export function abrirModalComprobante(opts = {}) {
  return new Promise((resolve) => {
    const total = Number(opts.total || 0);
    const prev = opts.previo || {};
    let tipo = prev.tipo || "ticket";
    const ov = document.createElement("div");
    ov.style.cssText =
      "position:fixed;inset:0;z-index:10080;background:rgba(3,2,8,.85);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:14px;";
    const inp =
      "width:100%;padding:11px 12px;border-radius:12px;border:1px solid rgba(139,92,246,.25);background:#151027;color:#f4f2fb;font-size:14px;outline:none;margin-top:6px;";
    const lbl =
      "font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#a89cc4;margin-top:12px;display:block;";
    ov.innerHTML = `
      <div style="width:100%;max-width:420px;max-height:92vh;overflow-y:auto;background:#0d0a17;border:1px solid rgba(139,92,246,.3);border-radius:22px;padding:20px;color:#f4f2fb;font-family:Inter,system-ui,sans-serif;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <b style="font-size:16px;">${esc(opts.titulo || "¿Qué comprobante deseas?")}</b>
          <button data-x style="background:none;border:none;color:#fff;font-size:16px;cursor:pointer;">✕</button>
        </div>
        <div data-tabs style="display:flex;gap:6px;margin:14px 0 8px;"></div>
        <div data-aviso style="font-size:12px;line-height:1.45;padding:9px 12px;border-radius:12px;background:rgba(251,191,36,.08);border:1px dashed rgba(251,191,36,.35);color:#fcd34d;"></div>
        <div data-form></div>
        <p data-err style="display:none;color:#fca5a5;font-size:12px;margin:10px 0 0;"></p>
        <button data-ok style="width:100%;margin-top:16px;padding:13px;border:none;border-radius:14px;background:#7c5cff;color:#fff;font-weight:800;font-size:14px;cursor:pointer;">Solicitar</button>
      </div>`;
    document.body.appendChild(ov);
    const $ = (s) => ov.querySelector(s);
    const cerrar = () => {
      ov.remove();
      resolve();
    };
    $("[data-x]").onclick = cerrar;
    ov.addEventListener("click", (e) => e.target === ov && cerrar());

    const val = (id) => ($(`#cm_${id}`)?.value || "").trim();

    function pintar() {
      $("[data-tabs]").innerHTML = Object.entries(TIPOS)
        .map(
          ([k, t]) =>
            `<button data-t="${k}" style="flex:1;padding:9px 4px;border-radius:12px;font-size:11.5px;font-weight:800;cursor:pointer;border:1px solid ${k === tipo ? "#7c5cff" : "rgba(139,92,246,.25)"};background:${k === tipo ? "#7c5cff" : "#151027"};color:${k === tipo ? "#fff" : "#a89cc4"};">${t.icon}<br>${t.label}</button>`,
        )
        .join("");
      $("[data-aviso]").textContent = AVISOS[tipo];
      const d = prev.datos || {};
      let f = "";
      if (tipo === "boleta") {
        f = `
          <label style="${lbl}">Tipo de documento</label>
          <select id="cm_doc_tipo" style="${inp}">
            ${["DNI", "CE", "PASAPORTE", "SIN_DOC"].map((o) => `<option value="${o}" ${(d.doc_tipo || "DNI") === o ? "selected" : ""}>${o === "SIN_DOC" ? "Sin documento (solo < S/ 700)" : o}</option>`).join("")}
          </select>
          <label style="${lbl}">N° de documento</label>
          <input id="cm_doc_numero" inputmode="numeric" style="${inp}" value="${esc(d.doc_numero || "")}" maxlength="12">
          <label style="${lbl}">Nombre completo</label>
          <input id="cm_nombre" style="${inp}" value="${esc(d.nombre || "")}" maxlength="80">
          <label style="${lbl}">Correo (opcional)</label>
          <input id="cm_email" type="email" style="${inp}" value="${esc(d.email || "")}" maxlength="80">`;
      } else if (tipo === "factura") {
        f = `
          <label style="${lbl}">RUC</label>
          <input id="cm_doc_numero" inputmode="numeric" style="${inp}" value="${esc(d.doc_numero || "")}" maxlength="11">
          <label style="${lbl}">Razón social</label>
          <input id="cm_razon_social" style="${inp}" value="${esc(d.razon_social || "")}" maxlength="120">
          <label style="${lbl}">Dirección fiscal</label>
          <input id="cm_direccion" style="${inp}" value="${esc(d.direccion || "")}" maxlength="140">
          <label style="${lbl}">Correo para enviarla</label>
          <input id="cm_email" type="email" style="${inp}" value="${esc(d.email || "")}" maxlength="80">`;
      }
      $("[data-form]").innerHTML = f;
      $("[data-ok]").textContent =
        tipo === "ticket" ? "Pedir ticket" : `Solicitar ${TIPOS[tipo].label.toLowerCase()}`;
      ov.querySelectorAll("[data-t]").forEach(
        (b) =>
          (b.onclick = () => {
            tipo = b.dataset.t;
            $("[data-err]").style.display = "none";
            pintar();
          }),
      );
    }
    pintar();

    $("[data-ok]").onclick = async () => {
      const datos =
        tipo === "boleta"
          ? {
              doc_tipo: val("doc_tipo") || "DNI",
              doc_numero: val("doc_numero"),
              nombre: val("nombre"),
              email: val("email"),
            }
          : tipo === "factura"
            ? {
                doc_tipo: "RUC",
                doc_numero: val("doc_numero"),
                razon_social: val("razon_social"),
                direccion: val("direccion"),
                email: val("email"),
              }
            : {};
      const err = validarDatos(tipo, datos, total);
      const eEl = $("[data-err]");
      if (err) {
        eEl.textContent = err;
        eEl.style.display = "block";
        return;
      }
      const btn = $("[data-ok]");
      btn.disabled = true;
      btn.textContent = "Enviando…";
      try {
        await opts.onSubmit({ tipo, datos });
        cerrar();
      } catch (e) {
        console.error(e);
        eEl.textContent = "No se pudo enviar, intenta de nuevo";
        eEl.style.display = "block";
        btn.disabled = false;
        btn.textContent = "Reintentar";
      }
    };
  });
}

/** Objeto listo para guardar en pedido.comprobante */
export function armarSolicitud({ tipo, datos }, origen, quien) {
  return {
    tipo,
    estado: "pendiente", // pendiente → emitido
    origen, // "cliente" | "mozo"
    enviadoPor: quien || null,
    datos: datos || {},
    ts: Date.now(),
  };
}

/* ── Texto para el portal SUNAT (SOL → Facturación electrónica) ── */
export function textoSunat(comp, pedido = {}, mesaNombre = "") {
  if (!comp) return "";
  const d = comp.datos || {};
  const total = Number(pedido.total || 0);
  const base = +(total / 1.18).toFixed(2);
  const igv = +(total - base).toFixed(2);
  const L = [];
  L.push(`COMPROBANTE: ${comp.tipo === "factura" ? "FACTURA ELECTRÓNICA" : comp.tipo === "boleta" ? "BOLETA DE VENTA ELECTRÓNICA" : "TICKET (sin datos)"}`);
  if (mesaNombre) L.push(`MESA: ${mesaNombre}`);
  L.push("");
  if (comp.tipo === "factura") {
    L.push(`RUC: ${d.doc_numero || ""}`);
    L.push(`RAZÓN SOCIAL: ${d.razon_social || ""}`);
    L.push(`DIRECCIÓN: ${d.direccion || ""}`);
  } else if (comp.tipo === "boleta") {
    const dt = d.doc_tipo === "SIN_DOC" ? "SIN DOCUMENTO (0)" : `${d.doc_tipo}: ${d.doc_numero || ""}`;
    L.push(`DOCUMENTO: ${dt}`);
    L.push(`CLIENTE: ${d.nombre || "CLIENTES VARIOS"}`);
  }
  if (d.email) L.push(`CORREO: ${d.email}`);
  L.push("");
  L.push("ÍTEMS (Unidad NIU · precio incluye IGV):");
  (pedido.productos || []).forEach((it, i) => {
    const ops = Object.entries(it.opciones || {})
      .map(([k, v]) => {
        const val =
          v && typeof v === "object" && !Array.isArray(v)
            ? Object.entries(v).map(([n, c]) => (c > 1 ? `${n} x${c}` : n)).join(", ")
            : Array.isArray(v)
              ? v.join(", ")
              : v;
        return val ? `${k}: ${val}` : null;
      })
      .filter(Boolean)
      .join(" / ");
    L.push(
      `${i + 1}. ${it.cantidad} × ${it.nombre}${ops ? ` (${ops})` : ""} — P.Unit S/ ${Number(it.precio_unitario || 0).toFixed(2)} — Total S/ ${Number(it.subtotal || 0).toFixed(2)}`,
    );
  });
  if (Number(pedido.descuentoCupon) > 0)
    L.push(`DESCUENTO: -S/ ${Number(pedido.descuentoCupon).toFixed(2)}`);
  L.push("");
  L.push(`OP. GRAVADA: S/ ${base.toFixed(2)}`);
  L.push(`IGV (18%): S/ ${igv.toFixed(2)}`);
  L.push(`IMPORTE TOTAL: S/ ${total.toFixed(2)}`);
  if (comp.estado === "emitido" && comp.numero) L.push(`\nEMITIDO: ${comp.numero}`);
  return L.join("\n");
}

/* ── Campos sueltos, uno por uno, cada uno con su botón copiar ── */
export function camposSunat(comp, pedido = {}, mesaNombre = "") {
  const d = comp.datos || {};
  const total = Number(pedido.total || 0);
  const base = +(total / 1.18).toFixed(2);
  const igv = +(total - base).toFixed(2);
  const G = []; // grupos: [titulo, [[label, valor], ...]]
  if (comp.tipo === "factura") {
    G.push(["Cliente", [
      ["RUC", d.doc_numero],
      ["Razón social", d.razon_social],
      ["Dirección fiscal", d.direccion],
      ["Correo", d.email],
    ]]);
  } else if (comp.tipo === "boleta") {
    const sin = d.doc_tipo === "SIN_DOC";
    G.push(["Cliente", [
      ["Tipo de documento", sin ? "SIN DOCUMENTO" : d.doc_tipo],
      ["N° de documento", sin ? "" : d.doc_numero],
      ["Nombre", d.nombre || (sin ? "CLIENTES VARIOS" : "")],
      ["Correo", d.email],
    ]]);
  }
  const items = (pedido.productos || []).map((it) => {
    const ops = Object.entries(it.opciones || {})
      .map(([k, v]) => {
        const val =
          v && typeof v === "object" && !Array.isArray(v)
            ? Object.entries(v).map(([n, c]) => (c > 1 ? `${n} x${c}` : n)).join(", ")
            : Array.isArray(v) ? v.join(", ") : v;
        return val ? `${k}: ${val}` : null;
      })
      .filter(Boolean).join(" / ");
    return [
      `${it.nombre}${ops ? ` (${ops})` : ""}`,
      String(it.cantidad ?? ""),
      Number(it.precio_unitario || 0).toFixed(2),
      Number(it.subtotal || 0).toFixed(2),
    ];
  });
  const tot = [
    ["Op. gravada", base.toFixed(2)],
    ["IGV 18%", igv.toFixed(2)],
    ["Importe total", total.toFixed(2)],
  ];
  if (Number(pedido.descuentoCupon) > 0)
    tot.unshift(["Descuento", Number(pedido.descuentoCupon).toFixed(2)]);
  return { grupos: G, items, tot, mesa: mesaNombre };
}

const _chip = (v, lbl) =>
  `<button type="button" data-cm-c="${esc(v)}" title="Copiar ${esc(lbl)}" style="border:1px solid rgba(139,92,246,.35);background:#151027;color:#f4f2fb;border-radius:8px;padding:5px 9px;font-size:12px;font-family:ui-monospace,Menlo,monospace;cursor:pointer;text-align:left;max-width:100%;word-break:break-word;">${esc(v) || "—"} <span style="opacity:.6">📋</span></button>`;
const _fila = (lbl, v) =>
  v === undefined || v === null || v === ""
    ? ""
    : `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0;border-bottom:1px dashed rgba(255,255,255,.08);"><span style="font-size:10.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#a89cc4;flex-shrink:0;">${esc(lbl)}</span>${_chip(String(v), lbl)}</div>`;

/* ── Tarjeta HTML (dashboard / mozo): campo por campo, clic = copia ── */
export function htmlRecuadroSunat(comp, pedido, mesaNombre, { acciones = false } = {}) {
  if (!comp) return "";
  const t = TIPOS[comp.tipo] || TIPOS.ticket;
  const emitido = comp.estado === "emitido";
  const color = emitido ? "#4ade80" : "#fbbf24";
  const quien = comp.origen === "mozo" ? `mozo ${esc(comp.enviadoPor || "")}` : "cliente";
  let cuerpo = "";
  if (comp.tipo === "ticket") {
    cuerpo = `<div style="font-size:12px;color:#a89cc4;">Sin datos: solo imprimir ticket.</div>`;
  } else {
    const c = camposSunat(comp, pedido, mesaNombre);
    cuerpo =
      c.grupos.map(([, f]) => f.map(([l, v]) => _fila(l, v)).join("")).join("") +
      `<div style="font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#a89cc4;margin:12px 0 4px;">Ítems (toca para copiar)</div>` +
      c.items
        .map(
          ([n, q, pu, tt]) =>
            `<div style="padding:6px 0;border-bottom:1px dashed rgba(255,255,255,.08);"><div style="margin-bottom:5px;">${_chip(n, "descripción")}</div><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;"><span style="font-size:10px;color:#a89cc4;">CANT</span>${_chip(q, "cantidad")}<span style="font-size:10px;color:#a89cc4;">P.UNIT</span>${_chip(pu, "precio unitario")}<span style="font-size:10px;color:#a89cc4;">TOTAL</span>${_chip(tt, "total")}</div></div>`,
        )
        .join("") +
      `<div style="margin-top:8px;">${c.tot.map(([l, v]) => _fila(l, v)).join("")}</div>`;
  }
  const foto = pedido?.comprobante_foto?.url
    ? `<div style="margin-top:10px;"><div style="font-size:10.5px;font-weight:800;text-transform:uppercase;color:#a89cc4;margin-bottom:4px;">📎 Adjunto de ${esc(pedido.comprobante_foto.por || "")}</div><img src="${esc(pedido.comprobante_foto.url)}" data-cm-img style="max-width:100%;max-height:240px;border-radius:10px;cursor:zoom-in;display:block;"></div>`
    : "";
  return `
  <div data-cm-card style="border:1px solid ${color}55;background:${color}14;border-radius:14px;padding:12px 14px;margin-bottom:12px;">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
      <b style="font-size:13px;color:${color};">${t.icon} ${t.label} · ${emitido ? "EMITIDO ✓" : "PENDIENTE DE EMITIR"}</b>
      <span style="font-size:10.5px;color:#a89cc4;">pedido por ${quien}</span>
    </div>
    ${cuerpo}${foto}
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
      ${comp.tipo !== "ticket" ? `<button type="button" data-cm-copy style="flex:1;padding:9px;border-radius:10px;border:1px solid rgba(139,92,246,.4);background:transparent;color:#c4b5fd;font-weight:800;font-size:12px;cursor:pointer;">📋 Copiar todo (texto)</button>` : ""}
      ${acciones && !emitido ? `<button type="button" data-cm-emitido style="flex:1;padding:9px;border-radius:10px;border:1px solid #22c55e;background:transparent;color:#4ade80;font-weight:800;font-size:12px;cursor:pointer;">✓ Marcar emitido</button>` : ""}
    </div>
  </div>`;
}

async function _copiar(txt) {
  try {
    await navigator.clipboard.writeText(txt);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = txt;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

/** Conecta copiar por campo (y "copiar todo") de una tarjeta ya insertada. */
export function enlazarCopiar(root, comp, pedido, mesaNombre, toast = () => {}) {
  root.querySelectorAll("[data-cm-c]").forEach((b) =>
    b.addEventListener("click", async () => {
      await _copiar(b.getAttribute("data-cm-c"));
      const old = b.style.borderColor;
      b.style.borderColor = "#4ade80";
      setTimeout(() => (b.style.borderColor = old), 700);
      toast("📋 Copiado: " + b.getAttribute("data-cm-c").slice(0, 40));
    }),
  );
  root.querySelector("[data-cm-copy]")?.addEventListener("click", async () => {
    await _copiar(textoSunat(comp, pedido, mesaNombre));
    toast("📋 Copiado todo");
  });
  root.querySelector("[data-cm-img]")?.addEventListener("click", (e) =>
    window.open(e.target.src, "_blank"),
  );
}

/** Chip de estado para el cliente (carrito) */
export function htmlEstadoCliente(comp) {
  if (!comp) return "";
  const t = TIPOS[comp.tipo] || TIPOS.ticket;
  const emitido = comp.estado === "emitido";
  return `<div style="font-size:12.5px;font-weight:700;padding:9px 12px;border-radius:12px;background:${emitido ? "rgba(34,197,94,.12)" : "rgba(251,191,36,.12)"};color:${emitido ? "#4ade80" : "#fbbf24"};">${t.icon} ${t.label}: ${emitido ? `emitido${comp.numero ? " · " + esc(comp.numero) : ""} ✓` : "en proceso, puede tardar unos minutos…"}</div>`;
}