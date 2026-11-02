/* ══════════════════════════════════════════════════════════════
   juego_dialogo.js — Diálogo "Juega y gana" para el carrito
   Uso:  import { abrirJuegoDialogo } from "./juego_dialogo.js";
         abrirJuegoDialogo({ nombre, logo, tiendaId, localidad, uid, carrito, onAplicarCupon });
   - Toma el color solo de --dr / --dg / --db (los del carrito).
   - Un juego al día; el backend decide juego, resultado y premio.
   - Sin librerías, sin fuentes, sin grid: liviano para celulares básicos.
   ══════════════════════════════════════════════════════════════ */

/* ⚙️ Pon aquí la URL de tu Cloud Function. Vacío = simulación local (borrar en producción) */
const API_URL = "";

/* Segmentos de la ruleta (el backend indica cuál cae con "seg") */
const SEGMENTOS = [
  { t: "5% dscto.", i: "🏷️" },
  { t: "Envío gratis", i: "🚚" },
  { t: "Vuelve mañana", i: "🌙" },
  { t: "10% dscto.", i: "🔥" },
  { t: "Producto S/10", i: "🎁" },
  { t: "Vuelve mañana", i: "🌙" },
];
const SEG_PIERDE = [2, 5];
const ICONOS = ["🍒", "🚚", "💎", "🎁", "👑"];

const CSS = `
#jg-ov{--c:232,89,12;--b:rgb(var(--c));display:none;position:fixed;top:0;right:0;bottom:0;left:0;z-index:10090;padding:16px;
  background:rgba(4,4,6,.82);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
  overflow:auto;-webkit-overflow-scrolling:touch;font-family:system-ui,-apple-system,Arial,sans-serif}
#jg-ov.on{display:-webkit-box;display:-webkit-flex;display:flex;
  -webkit-animation:jgFade .25s ease both;animation:jgFade .25s ease both}
#jg-ov *{box-sizing:border-box}
@-webkit-keyframes jgIn{from{opacity:0;-webkit-transform:translateY(18px) scale(.96)}to{opacity:1;-webkit-transform:none}}
@keyframes jgIn{from{opacity:0;transform:translateY(18px) scale(.96)}to{opacity:1;transform:none}}
@-webkit-keyframes jgPop{0%{-webkit-transform:scale(.3);opacity:0}60%{-webkit-transform:scale(1.18)}100%{-webkit-transform:scale(1);opacity:1}}
@keyframes jgPop{0%{transform:scale(.3);opacity:0}60%{transform:scale(1.18)}100%{transform:scale(1);opacity:1}}
@-webkit-keyframes jgFade{from{opacity:0}to{opacity:1}}
@keyframes jgFade{from{opacity:0}to{opacity:1}}

#jg{position:relative;width:100%;max-width:350px;margin:auto;border-radius:28px;overflow:hidden;text-align:center;color:#fff;
  background:#0d0d11;background:linear-gradient(180deg,rgba(var(--c),.24) 0,#0d0d11 48%);
  border:1px solid rgba(var(--c),.45);
  box-shadow:0 30px 70px -14px rgba(0,0,0,.85),0 0 70px -10px rgba(var(--c),.6);
  -webkit-animation:jgIn .45s cubic-bezier(.2,1.1,.3,1) both;animation:jgIn .45s cubic-bezier(.2,1.1,.3,1) both}
.jg-h{padding:20px 16px 0;position:relative}
.jg-x{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.07);color:#e4e4e7;font-size:20px;line-height:30px;cursor:pointer;padding:0}
.jg-logo{display:inline-block;width:54px;height:54px;border-radius:50%;overflow:hidden;vertical-align:top;
  background:rgba(255,255,255,.06);border:2px solid rgba(var(--c),.7);box-shadow:0 0 18px -2px rgba(var(--c),.55)}
.jg-logo img{width:100%;height:100%;object-fit:cover;display:block}
.jg-name{display:block;margin-top:8px;font-size:14px;font-weight:700;color:#f4f4f5;letter-spacing:.01em;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 40px}
.jg-bd{padding:12px 20px 22px;-webkit-animation:jgFade .3s ease both;animation:jgFade .3s ease both}
.jg-eye{margin:4px 0 6px;font-size:10.5px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:rgb(var(--c))}
.jg-bd h2{margin:0 0 6px;font-size:22px;font-weight:800;letter-spacing:-.01em}
.jg-bd p{margin:0 0 16px;color:#9a9aa4;font-size:13.5px;line-height:1.5}
.jg-btn{display:block;width:100%;border:0;border-radius:16px;padding:14px;margin-top:14px;font-size:15px;font-weight:800;
  letter-spacing:.02em;color:var(--t,#fff);cursor:pointer;background:rgb(var(--c));
  background:linear-gradient(135deg,rgb(var(--c)),rgba(var(--c),.72));
  box-shadow:0 10px 22px -8px rgba(var(--c),.65);-webkit-transition:-webkit-transform .15s;transition:transform .15s}
.jg-btn:active{-webkit-transform:scale(.97);transform:scale(.97)}
.jg-btn:disabled{opacity:.55;box-shadow:none}
.jg-btn.o{background:rgba(255,255,255,.06);color:#e4e4e7;border:1px solid rgba(255,255,255,.1);box-shadow:none}
#jg-ov button:focus{outline:2px solid rgba(255,255,255,.7);outline-offset:2px}

/* Ruleta */
.w-box{position:relative;width:272px;height:272px;margin:10px auto 0;max-width:100%}
.w-box canvas{width:100%;height:100%;display:block;border-radius:50%;
  box-shadow:0 12px 34px -8px rgba(0,0,0,.7),0 0 40px -8px rgba(var(--c),.5);
  -webkit-transition:-webkit-transform 4.4s cubic-bezier(.16,.72,.12,1);transition:transform 4.4s cubic-bezier(.16,.72,.12,1)}
.w-pin{position:absolute;left:50%;top:-6px;margin-left:-12px;width:0;height:0;z-index:2;
  border-left:12px solid transparent;border-right:12px solid transparent;border-top:24px solid #fff;
  -webkit-filter:drop-shadow(0 3px 4px rgba(0,0,0,.55));filter:drop-shadow(0 3px 4px rgba(0,0,0,.55))}

/* Cajas y tragamonedas */
.row3{text-align:center;font-size:0;margin-top:6px}
.cell{display:inline-block;width:29%;margin:0 2%;height:92px;border-radius:20px;font-size:40px;line-height:88px;
  cursor:pointer;padding:0;color:#fff;border:1px solid rgba(var(--c),.4);
  background:rgba(255,255,255,.04);background:linear-gradient(160deg,rgba(var(--c),.16),rgba(255,255,255,.03));
  box-shadow:0 8px 18px -10px rgba(0,0,0,.8);-webkit-transition:-webkit-transform .15s,background .2s;transition:transform .15s,background .2s}
.cell:active{-webkit-transform:scale(.94);transform:scale(.94)}
.cell.on{background:rgb(var(--c));background:linear-gradient(160deg,rgb(var(--c)),rgba(var(--c),.7));
  -webkit-animation:jgPop .35s ease both;animation:jgPop .35s ease both}
.reel{cursor:default;height:104px;line-height:100px;font-size:44px}
.reel:active{-webkit-transform:none;transform:none}

/* Raspadita */
.sc{position:relative;width:260px;height:152px;margin:8px auto 0;max-width:100%;border-radius:20px;overflow:hidden;
  border:1px solid rgba(var(--c),.45);box-shadow:0 12px 28px -12px rgba(0,0,0,.8),0 0 30px -10px rgba(var(--c),.45)}
.sc div{position:absolute;top:0;right:0;bottom:0;left:0;background:#15151a;padding-top:34px;font-size:46px;line-height:1.1}
.sc div span{display:block;font-size:15px;font-weight:700;color:#d4d4d8;margin-top:6px}
.sc canvas{position:absolute;top:0;left:0;width:100%;height:100%;cursor:crosshair}

/* Resultado */
.big{font-size:60px;line-height:1.2;margin-bottom:4px;-webkit-animation:jgPop .5s ease both;animation:jgPop .5s ease both}
.jg-win{margin:0 0 6px;font-size:26px;font-weight:800;color:rgb(var(--c))}
.code{margin:8px auto 4px;padding:11px 14px;border:1.5px dashed rgba(var(--c),.7);border-radius:14px;font-weight:800;
  letter-spacing:.16em;font-size:17px;color:#fff;background:rgba(var(--c),.1)}
`;

let ov, bd, timers = [], opts = {}, cssOk = false;

const $ = (h) => { bd.innerHTML = h; };
const later = (f, ms) => { timers.push(setTimeout(f, ms)); };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const llave = () => "jg_" + (opts.tiendaId || "x");
const hoy = () => { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); };
const yaJugo = () => { try { return localStorage.getItem(llave()) === hoy(); } catch (e) { return false; } };
const marcar = () => { try { localStorage.setItem(llave(), hoy()); } catch (e) {} };

/* Color de la tienda leído de las variables del carrito */
function rgbTienda() {
  const cs = getComputedStyle(document.documentElement);
  const n = (k, d) => { const v = parseInt(cs.getPropertyValue(k), 10); return isNaN(v) ? d : v; };
  return [n("--dr", 232), n("--dg", 89), n("--db", 12)];
}
const rgba = (a) => "rgba(" + rgbTienda().join(",") + "," + a + ")";
const colorTienda = () => "rgb(" + rgbTienda().join(",") + ")";
function textoSobre() {
  const c = rgbTienda();
  return (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000 > 170 ? "#111" : "#fff";
}

function montar() {
  if (ov) return;
  if (!cssOk) {
    const st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);
    cssOk = true;
  }
  ov = document.createElement("div");
  ov.id = "jg-ov";
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");
  ov.innerHTML = '<div id="jg"><div class="jg-h"><button class="jg-x" aria-label="Cerrar">×</button><span class="jg-logo" id="jg-logo"></span><b class="jg-name" id="jg-name"></b></div><div class="jg-bd" id="jg-bd"></div></div>';
  document.body.appendChild(ov);
  bd = ov.querySelector("#jg-bd");
  ov.querySelector(".jg-x").onclick = cerrar;
  ov.onclick = (e) => { if (e.target === ov) cerrar(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && ov.className === "on") cerrar(); });
}

export function cerrarJuegoDialogo() { cerrar(); }
function cerrar() {
  timers.forEach(clearTimeout);
  timers = [];
  if (ov) ov.className = "";
  document.body.style.overflow = "";
}

/* ══════════ BACKEND ══════════
   Envía:   POST { tiendaId, localidad, uid, carrito:{ items, total } }
   Responde:{ game:"wheel|boxes|slots|scratch", win:true|false, seg:0-5 (ruleta),
              prize:{ title, text, code } | null, already:true (si hoy ya jugó) } */
function pedirJuego() {
  const cart = opts.carrito || null;
  if (API_URL) {
    return fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tiendaId: opts.tiendaId, localidad: opts.localidad, uid: opts.uid || null, carrito: cart }),
    }).then((r) => r.json());
  }
  const juegos = ["wheel", "boxes", "slots", "scratch"], win = Math.random() < 0.6, g = [0, 1, 3, 4];
  return Promise.resolve({
    game: juegos[Math.floor(Math.random() * 4)], win: win,
    seg: win ? g[Math.floor(Math.random() * 4)] : SEG_PIERDE[Math.floor(Math.random() * 2)],
    prize: win ? { title: "5% de descuento", text: "Úsalo en tu pedido.", code: "GIRA5" } : null,
  });
}

/* ══════════ RESULTADO ══════════ */
function resultado(r, icono) {
  marcar();
  if (r.win && r.prize) {
    const cod = r.prize.code;
    $('<div class="big">' + (icono || "🎉") + '</div><div class="jg-eye">¡Felicidades!</div><h2 class="jg-win" id="jg-t">' + esc(r.prize.title) + "</h2><p>" + esc(r.prize.text || "") + "</p>" +
      (cod ? '<div class="code">' + esc(cod) + "</div>" : "") +
      (cod && opts.onAplicarCupon ? '<button class="jg-btn" id="jg-ap">Usar en mi pedido</button>' : "") +
      '<button class="jg-btn o" id="jg-ok">Seguir comprando</button>');
    const ap = document.getElementById("jg-ap");
    if (ap) { ap.focus(); ap.onclick = () => { cerrar(); opts.onAplicarCupon(cod); }; }
  } else {
    $('<div class="big">🌙</div><h2 id="jg-t">Hoy no fue</h2><p>Mañana tienes otra partida.<br>¡Te esperamos!</p><button class="jg-btn" id="jg-ok">Seguir comprando</button>');
  }
  document.getElementById("jg-ok").onclick = cerrar;
  window.dispatchEvent(new CustomEvent("premio", { detail: { juego: r.game, gano: !!r.win, premio: r.prize || null } }));
}

const cab = (t, p) => '<div class="jg-eye">Juega y gana</div><h2 id="jg-t">' + t + "</h2><p>" + p + "</p>";

/* ══════════ JUEGOS (solo animan lo que el backend ya decidió) ══════════ */
function ruleta(r) {
  const N = SEGMENTOS.length, SEG = 360 / N, S = 520, C = S / 2, R = 232;
  $(cab("Ruleta", "Toca girar y mira dónde cae.") + '<div class="w-box"><div class="w-pin"></div><canvas id="wc" width="' + S + '" height="' + S + '"></canvas></div><button class="jg-btn" id="go">GIRAR</button>');
  const cv = document.getElementById("wc"), c = cv.getContext("2d"), tx = textoSobre(), rad = Math.PI / 180;

  c.translate(C, C);

  /* aro exterior oscuro con puntitos */
  c.beginPath(); c.arc(0, 0, R + 14, 0, 6.2832); c.fillStyle = "#17171d"; c.fill();
  c.beginPath(); c.arc(0, 0, R + 14, 0, 6.2832); c.lineWidth = 3; c.strokeStyle = rgba(0.8); c.stroke();
  for (let d = 0; d < 24; d++) {
    const a = d * 15 * rad;
    c.beginPath(); c.arc(Math.cos(a) * (R + 7), Math.sin(a) * (R + 7), 3, 0, 6.2832);
    c.fillStyle = d % 2 ? "rgba(255,255,255,.85)" : rgba(0.95); c.fill();
  }

  /* segmentos */
  for (let i = 0; i < N; i++) {
    const a = (i * SEG - 90) * rad, par = i % 2 === 0;
    const g = c.createRadialGradient(0, 0, 20, 0, 0, R);
    if (par) { g.addColorStop(0, rgba(0.75)); g.addColorStop(1, rgba(1)); }
    else { g.addColorStop(0, "#1b1b22"); g.addColorStop(1, "#26262f"); }
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, a, a + SEG * rad); c.closePath();
    c.fillStyle = g; c.fill();
    c.lineWidth = 2; c.strokeStyle = "rgba(255,255,255,.14)"; c.stroke();

    c.save();
    c.rotate(a + SEG * rad / 2);
    c.textBaseline = "middle";
    c.textAlign = "center";
    c.font = "30px Arial";
    c.fillText(SEGMENTOS[i].i, 74, 0);
    c.textAlign = "right";
    c.fillStyle = par ? tx : "#f4f4f5";
    c.font = "bold 23px Arial";
    c.fillText(SEGMENTOS[i].t, R - 16, 1, 128);
    c.restore();
  }

  /* centro */
  c.beginPath(); c.arc(0, 0, 34, 0, 6.2832); c.fillStyle = "#0d0d11"; c.fill();
  c.lineWidth = 5; c.strokeStyle = rgba(1); c.stroke();
  c.beginPath(); c.arc(0, 0, 10, 0, 6.2832); c.fillStyle = "#fff"; c.fill();

  const go = document.getElementById("go");
  let giro = false;
  go.focus();
  go.onclick = () => {
    if (giro) return; giro = true; go.disabled = true;
    const seg = typeof r.seg === "number" ? r.seg : (r.win ? 0 : SEG_PIERDE[0]);
    const jitter = (Math.random() - 0.5) * SEG * 0.5;
    const deg = 360 * 6 + (360 - (seg + 0.5) * SEG) + jitter;
    cv.style.webkitTransform = cv.style.transform = "rotate(" + deg + "deg)";
    later(() => resultado(r, "🎡"), 4700);
  };
}

function cajas(r) {
  $(cab("Cajas sorpresa", "Elige una caja y descubre qué hay dentro.") + '<div class="row3" id="bx"></div>');
  const box = document.getElementById("bx");
  let hecho = false;
  for (let k = 0; k < 3; k++) {
    const b = document.createElement("button");
    b.className = "cell"; b.textContent = "🎁"; b.setAttribute("aria-label", "Caja");
    b.onclick = () => {
      if (hecho) return; hecho = true;
      b.className = "cell on"; b.textContent = r.win ? "🎉" : "🌙";
      later(() => resultado(r, "🎁"), 900);
    };
    box.appendChild(b);
  }
  box.firstChild.focus();
}

function tragamonedas(r) {
  $(cab("Tragamonedas", "Tres iguales y ganas.") + '<div class="row3" id="rl"><div class="cell reel"></div><div class="cell reel"></div><div class="cell reel"></div></div><button class="jg-btn" id="go">JUGAR</button>');
  const rl = document.getElementById("rl").children, go = document.getElementById("go");
  let giro = false;
  for (let k = 0; k < 3; k++) rl[k].textContent = ICONOS[k];
  go.focus();
  go.onclick = () => {
    if (giro) return; giro = true; go.disabled = true;
    const w = ICONOS[Math.floor(Math.random() * 5)], fin = r.win ? [w, w, w] : [ICONOS[0], ICONOS[2], ICONOS[4]], listo = [0, 0, 0];
    const id = setInterval(() => { for (let j = 0; j < 3; j++) if (!listo[j]) rl[j].textContent = ICONOS[Math.floor(Math.random() * 5)]; }, 110);
    timers.push(id);
    for (let j = 0; j < 3; j++) later(() => {
      listo[j] = 1; rl[j].textContent = fin[j];
      if (j === 2) { clearInterval(id); later(() => resultado(r, "🎰"), 700); }
    }, 900 + j * 600);
  };
}

function raspadita(r) {
  $(cab("Raspadita", "Raspa con el dedo o el mouse.") + '<div class="sc"><div>' + (r.win ? "🎉" : "🌙") + "<span>" + (r.win && r.prize ? esc(r.prize.title) : "Sigue intentando") + '</span></div><canvas id="sc" width="256" height="146"></canvas></div>');
  const cv = document.getElementById("sc"), c = cv.getContext("2d");
  let abajo = false, hecho = false;
  /* base 100% opaca: tapa por completo el premio de abajo */
  c.fillStyle = "#15151a"; c.fillRect(0, 0, 256, 146);
  c.fillStyle = colorTienda(); c.fillRect(0, 0, 256, 146);
  const g = c.createLinearGradient(0, 0, 256, 146);
  g.addColorStop(0, "rgba(255,255,255,.18)"); g.addColorStop(1, "rgba(0,0,0,.28)");
  c.fillStyle = g; c.fillRect(0, 0, 256, 146);
  c.fillStyle = "rgba(255,255,255,.12)";
  for (let k = 0; k < 8; k++) c.fillRect(k * 40 - 10, 0, 14, 146);
  c.fillStyle = textoSobre(); c.font = "bold 20px Arial"; c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText("✨ Raspa aquí ✨", 128, 73);
  c.globalCompositeOperation = "destination-out";
  const pos = (e) => {
    const b = cv.getBoundingClientRect(), p = e.touches ? e.touches[0] : e;
    return [(p.clientX - b.left) * 256 / b.width, (p.clientY - b.top) * 146 / b.height];
  };
  const mover = (e) => {
    if (!abajo || hecho) return; e.preventDefault();
    const p = pos(e); c.beginPath(); c.arc(p[0], p[1], 20, 0, 6.3); c.fill();
  };
  const revisar = () => {
    if (hecho) return;
    const d = c.getImageData(0, 0, 256, 146).data; let n = 0, t = 0;
    for (let i = 3; i < d.length; i += 80) { t++; if (d[i] < 128) n++; }
    if (n / t > 0.45) { hecho = true; c.clearRect(0, 0, 256, 146); later(() => resultado(r, "🎟️"), 700); }
  };
  const soltar = () => { abajo = false; revisar(); };
  cv.onmousedown = (e) => { abajo = true; mover(e); };
  cv.onmousemove = mover; cv.onmouseup = soltar; cv.onmouseleave = soltar;
  cv.ontouchstart = (e) => { abajo = true; mover(e); };
  cv.ontouchmove = mover; cv.ontouchend = soltar;
}

const JUEGOS = { wheel: ruleta, boxes: cajas, slots: tragamonedas, scratch: raspadita };

/* ══════════ ABRIR ══════════ */
export function abrirJuegoDialogo(o) {
  opts = o || {};
  montar();
  timers.forEach(clearTimeout); timers = [];

  /* color de la tienda + color de texto encima */
  ov.style.setProperty("--c", rgbTienda().join(","));
  ov.style.setProperty("--t", textoSobre());
  ov.querySelector("#jg-name").textContent = opts.nombre || "";
  const lg = ov.querySelector("#jg-logo");
  lg.innerHTML = "";
  if (opts.logo) {
    const im = document.createElement("img");
    im.src = opts.logo; im.alt = "";
    im.onerror = () => { lg.style.display = "none"; };
    lg.style.display = "inline-block";
    lg.appendChild(im);
  } else {
    lg.style.display = "none";
  }
  ov.className = "on";
  document.body.style.overflow = "hidden";

  const fin = (t, m) => {
    $('<div class="big">' + (t === "x" ? "⚠️" : "⏳") + '</div><h2 id="jg-t">' + (t === "x" ? "No pudimos cargar" : "Ya jugaste hoy") + "</h2><p>" + m + '</p><button class="jg-btn" id="jg-ok">Cerrar</button>');
    document.getElementById("jg-ok").onclick = cerrar;
  };

  if (yaJugo()) return fin("h", "Vuelve mañana para otra partida.");
  $("<p>Cargando tu juego…</p>");
  pedirJuego().then((r) => {
    if (ov.className !== "on") return;
    if (r.already) { marcar(); return fin("h", "Vuelve mañana para otra partida."); }
    (JUEGOS[r.game] || ruleta)(r);
  }).catch(() => fin("x", "Revisa tu conexión e inténtalo otra vez."));
}