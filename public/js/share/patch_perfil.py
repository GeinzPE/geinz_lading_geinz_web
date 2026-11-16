#!/usr/bin/env python3
"""
Uso:  python patch_cumple_whatsapp.py perfil_negocio_v2.js
Cuando el cumpleaños está bloqueado, muestra un botón de WhatsApp al negocio
con el ID del usuario y el pedido de cambio de fecha.
Hace backup en .bak2 y aborta sin tocar nada si falla un ancla.
"""
import sys, shutil

if len(sys.argv) < 2:
    sys.exit("Uso: python patch_cumple_whatsapp.py perfil_negocio_v2.js")

path = sys.argv[1]
raw = open(path, encoding="utf-8").read()
crlf = "\r\n" in raw
src = raw.replace("\r\n", "\n")


def fail(msg):
    sys.exit(f"\n❌ {msg}\n   No se modificó nada.")


# 1) bloque `pie` ---------------------------------------------------------
start = "    const pie = puedeCambiar\n"
end = "</b>.</p>`;\n"
if src.count(start) != 1:
    fail("No encontré el bloque 'const pie = puedeCambiar' (¿ya aplicaste este parche?)")
s = src.find(start)
e = src.find(end, s)
if e < 0:
    fail("No encontré el final del bloque 'pie'")
e += len(end)

nuevo_pie = r'''    const waUrl = puedeCambiar ? null : urlWhatsappCumple();
    const pie = puedeCambiar
      ? `<button type="button" class="bc-link" data-bc="editar">Cambiar fecha</button>`
      : waUrl
        ? `<p class="bc-note" style="margin:10px 0 8px;font-size:12px">🔒 Tu fecha ya está registrada y no se puede cambiar desde aquí.</p>
           <a class="bc-wa" href="${escapeHtml(waUrl)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Conversa con ${negocio} para cambiarla</a>`
        : `<p class="bc-note" style="margin:10px 0 0;font-size:12px">🔒 Para cambiar tu fecha de cumpleaños habla con <b>${negocio}</b>.</p>`;
'''
src = src[:s] + nuevo_pie + src[e:]

# 2) helper antes de renderBannerCumple -----------------------------------
anchor = "function renderBannerCumple(biz) {"
if src.count(anchor) != 1:
    fail("No encontré 'function renderBannerCumple(biz) {'")
helper = r'''// Abre WhatsApp del negocio pidiendo cambiar la fecha de cumpleaños (incluye el ID del usuario)
function urlWhatsappCumple() {
  let num = String(_waNumeroNegocio || "").replace(/\D/g, "");
  if (!num) return null;
  if (num.length === 9) num = "51" + num; // Perú
  const uid = auth.currentUser?.uid || "";
  const nombre =
    _reviewUserNameCache[uid] || auth.currentUser?.displayName || "";
  const msg =
    `Hola ${_bizNombre || ""}, soy ${nombre}.\n` +
    `Mi ID de usuario es: ${uid}\n` +
    `Quiero cambiar mi fecha de cumpleaños (actualmente ${_bcFmt(_cumple.fnac)}).\n` +
    `Motivo del cambio: `;
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}

'''
src = src.replace(anchor, helper + anchor, 1)

# 3) CSS del botón ---------------------------------------------------------
css_anchor = "  .bc-note{margin:0 0 12px;font-size:13px;line-height:1.5;color:#c4c4cc;}\n"
if src.count(css_anchor) != 1:
    fail("No encontré el CSS .bc-note")
css = css_anchor + (
    "  .bc-wa{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px 14px;"
    "border-radius:14px;font-weight:800;font-size:13px;color:#fff;text-decoration:none;box-sizing:border-box;"
    "background:#25D366;box-shadow:0 10px 24px -8px rgba(37,211,102,.55);transition:transform .18s ease,filter .18s ease;}\n"
    "  .bc-wa:hover{transform:translateY(-2px);filter:brightness(1.06);}\n"
    "  .bc-wa i{font-size:16px;}\n"
)
src = src.replace(css_anchor, css, 1)

shutil.copyfile(path, path + ".bak2")
open(path, "w", encoding="utf-8", newline="").write(
    src.replace("\n", "\r\n") if crlf else src
)
print("✅ Listo. Botón de WhatsApp para cambio de cumpleaños aplicado.")
print(f"Backup: {path}.bak2")