export async function iniciarCamara(video, onCode) {
  let parar = false, stream = null, zx = null, ultimo = "", tUlt = 0;
  const emitir = (c) => {
    const n = Date.now();
    if (c === ultimo && n - tUlt < 2500) return; // evita lecturas repetidas
    ultimo = c; tUlt = n; onCode(c);
  };

  if ("BarcodeDetector" in window) {
    const quiero = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];
    const sop = await BarcodeDetector.getSupportedFormats();
    const det = new BarcodeDetector({ formats: quiero.filter((f) => sop.includes(f)) });
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
    video.srcObject = stream;
    await video.play();
    (async function loop() {
      while (!parar) {
        try { const r = await det.detect(video); if (r[0]) emitir(r[0].rawValue); } catch {}
        await new Promise((r) => setTimeout(r, 120));
      }
    })();
  } else {
    // Safari / Firefox: librería ZXing
    const { BrowserMultiFormatReader } = await import("https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm");
    zx = await new BrowserMultiFormatReader().decodeFromConstraints(
      { video: { facingMode: "environment" } }, video, (res) => { if (res) emitir(res.getText()); });
  }
  return () => { parar = true; zx?.stop(); stream?.getTracks().forEach((t) => t.stop()); video.srcObject = null; };
}