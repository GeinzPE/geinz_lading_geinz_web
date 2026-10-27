// js/compresor_imagen/compresor_imagen.js
// Comprime una imagen a WebP y la sube a Storage con progreso.
// Para el Meta OG se usa vertical 1080x1350 con modo "contain" (sin recortar).
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

/**
 * Convierte cualquier imagen a WebP.
 * modo "cover"   → llena el lienzo recortando lo que sobre (comportamiento anterior).
 * modo "contain" → la imagen entera dentro del lienzo, SIN recortar; el fondo se rellena
 *                  con la misma imagen ampliada y difuminada.
 * Baja la calidad hasta que pese <= maxBytes.
 * @returns {Promise<{blob:Blob, url:string, w:number, h:number}>} url = objectURL para vista previa
 */
export async function comprimirAWebp(
  file,
  {
    w = 1200,
    h = 630,
    quality = 0.85,
    minQuality = 0.5,
    maxBytes = 300 * 1024,
    modo = "cover",
  } = {},
) {
  if (!file || !file.type.startsWith("image/"))
    throw new Error("El archivo no es una imagen.");

  const bmp = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";

  if (modo === "contain") {
    // Fondo difuminado (funciona en todos los navegadores, incluido Safari):
    // se dibuja la imagen en pequeño y se estira al tamaño del lienzo.
    const sc = Math.max(w / bmp.width, h / bmp.height);
    const tiny = document.createElement("canvas");
    tiny.width = Math.max(8, Math.round(w / 24));
    tiny.height = Math.max(8, Math.round(h / 24));
    const tctx = tiny.getContext("2d");
    tctx.imageSmoothingQuality = "high";
    const tw = bmp.width * sc * (tiny.width / w),
      th = bmp.height * sc * (tiny.height / h);
    tctx.drawImage(bmp, (tiny.width - tw) / 2, (tiny.height - th) / 2, tw, th);
    ctx.drawImage(tiny, 0, 0, w, h);
    // oscurece un poco el fondo para que la imagen resalte
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(0, 0, w, h);

    // Frente: la imagen completa, centrada, sin recorte
    const s = Math.min(w / bmp.width, h / bmp.height);
    const dw = bmp.width * s,
      dh = bmp.height * s;
    ctx.drawImage(bmp, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    const s = Math.max(w / bmp.width, h / bmp.height);
    const dw = bmp.width * s,
      dh = bmp.height * s;
    ctx.drawImage(bmp, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  bmp.close?.();

  const toBlob = (q) =>
    new Promise((res, rej) =>
      canvas.toBlob(
        (b) => (b ? res(b) : rej(new Error("Tu navegador no soporta WebP."))),
        "image/webp",
        q,
      ),
    );

  let q = quality,
    blob = await toBlob(q);
  while (blob.size > maxBytes && q > minQuality) {
    q = Math.max(minQuality, q - 0.07);
    blob = await toBlob(q);
  }
  if (blob.type !== "image/webp")
    throw new Error("Tu navegador no soporta WebP.");
  return { blob, url: URL.createObjectURL(blob), w, h };
}

/**
 * Sube un Blob a Storage con progreso y devuelve la URL pública.
 * @param {FirebaseStorage} storage
 * @param {string} path  ej: tiendas/<tiendaId>/formulario/<formId>/og.webp
 * @param {Blob} blob
 * @param {(pct:number)=>void} onProgress  0..100
 */
export function subirWebp(storage, path, blob, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, path), blob, {
      contentType: "image/webp",
      cacheControl: "public,max-age=3600",
    });
    task.on(
      "state_changed",
      (s) => onProgress(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
      reject,
      async () => resolve(await getDownloadURL(task.snapshot.ref)),
    );
  });
}