/* ════════════════════════════════════════════════════════════════
   mozo_camara.js — foto con cámara para comprobante / voucher
   - "Tomar foto" abre la cámara trasera directo (capture="environment")
   - "Galería" por si la foto ya está en el teléfono
   - Reduce la foto a 1280 px / JPEG 72 % antes de subir (rápido en
     celulares básicos y con poco internet)
   - Se inyecta solo: no hay que tocar el HTML

   Uso:  const url = await elegirFotoMozo(subirImagen);
         subirImagen(blob) -> Promise<string url>   (tu subida actual)
   ════════════════════════════════════════════════════════════════ */

let ov = null;

function montar() {
  if (ov) return;
  ov = document.createElement("div");
  ov.className = "overlay";
  ov.id = "overlay-foto";
  ov.style.zIndex = "130";
  ov.innerHTML = `
    <div class="mz-sheet">
      <div class="mz-sheet-head">
        <div class="mz-head-row">
          <div class="mz-grow">
            <h2 id="ft-titulo" style="font-size:20px;">Foto del comprobante</h2>
            <p id="ft-sub">Toma la foto o elígela de la galería</p>
          </div>
          <button type="button" id="ft-x" class="mz-x">✕</button>
        </div>
      </div>
      <div class="mz-body">
        <div id="ft-paso1" class="ft-opts">
          <button type="button" id="ft-btn-cam" class="ft-opt main"><span class="ico">📷</span>Tomar foto</button>
          <button type="button" id="ft-btn-gal" class="ft-opt"><span class="ico">🖼️</span>Galería</button>
        </div>
        <div id="ft-paso2" class="hidden" style="display:flex;flex-direction:column;gap:10px;">
          <img id="ft-prev" class="ft-prev" alt="vista previa">
          <p class="ft-hint">¿Se lee bien? Si no, vuelve a tomarla.</p>
        </div>
        <input id="ft-in-cam" type="file" accept="image/*" capture="environment" hidden>
        <input id="ft-in-gal" type="file" accept="image/*" hidden>
      </div>
      <div id="ft-foot" class="mz-foot hidden">
        <button type="button" id="ft-usar" class="mz-btn mz-btn-ok mz-btn-xl"><span id="ft-usar-lbl">Enviar foto</span></button>
        <button type="button" id="ft-repetir" class="mz-btn mz-btn-soft">📷 Tomar otra</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
}

function comprimir(file, max = 1280, q = 0.72) {
  return new Promise((ok, ko) => {
    const u = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height));
      const c = document.createElement("canvas");
      c.width = Math.round(im.width * k);
      c.height = Math.round(im.height * k);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      c.toBlob(
        (b) => (b ? ok(b) : ko(new Error("No se pudo procesar la foto"))),
        "image/jpeg",
        q,
      );
    };
    im.onerror = () => {
      URL.revokeObjectURL(u);
      ko(new Error("Imagen no válida"));
    };
    im.src = u;
  });
}

export function elegirFotoMozo(subir, titulo = "Foto del comprobante") {
  montar();
  const $ = (s) => ov.querySelector(s);
  return new Promise((resolve) => {
    let blob = null;
    let previewUrl = null;
    let ocupado = false;

    const paso = (n) => {
      $("#ft-paso1").classList.toggle("hidden", n !== 1);
      $("#ft-paso2").classList.toggle("hidden", n !== 2);
      $("#ft-foot").classList.toggle("hidden", n !== 2);
    };
    const cerrar = (res) => {
      if (ocupado) return;
      ov.classList.remove("show");
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      $("#ft-in-cam").value = "";
      $("#ft-in-gal").value = "";
      resolve(res);
    };

    $("#ft-titulo").textContent = titulo;
    paso(1);
    $("#ft-usar").disabled = false;
    $("#ft-usar-lbl").textContent = "Enviar foto";

    $("#ft-btn-cam").onclick = () => $("#ft-in-cam").click();
    $("#ft-btn-gal").onclick = () => $("#ft-in-gal").click();
    $("#ft-repetir").onclick = () => {
      if (ocupado) return;
      $("#ft-in-cam").value = "";
      $("#ft-in-cam").click();
    };
    $("#ft-x").onclick = () => cerrar(null);
    ov.onclick = (e) => e.target === ov && cerrar(null);

    const alElegir = async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        blob = await comprimir(f);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(blob);
        $("#ft-prev").src = previewUrl;
        paso(2);
      } catch (err) {
        console.error(err);
        alert("No se pudo leer la foto, intenta otra vez.");
      }
    };
    $("#ft-in-cam").onchange = alElegir;
    $("#ft-in-gal").onchange = alElegir;

    $("#ft-usar").onclick = async () => {
      if (!blob || ocupado) return;
      ocupado = true;
      $("#ft-usar").disabled = true;
      $("#ft-usar-lbl").innerHTML = '<span class="spinner"></span>';
      try {
        const url = await subir(blob);
        ocupado = false;
        cerrar(url || null);
      } catch (err) {
        console.error(err);
        ocupado = false;
        $("#ft-usar").disabled = false;
        $("#ft-usar-lbl").textContent = "Reintentar envío";
      }
    };

    // un frame después, para que la hoja entre con transición
    requestAnimationFrame(() => ov.classList.add("show"));
  });
}