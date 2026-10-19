(function () {
  'use strict';
  var WA = '51958120920';

  function abrirWA(texto) {
    var url = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(texto);
    var w = window.open(url, '_blank', 'noopener');
    if (!w) window.location.href = url; // si el navegador bloquea la ventana
  }

  // Año del footer
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // Temas: abren WhatsApp con el mensaje inicial
  document.querySelectorAll('.topic').forEach(function (b) {
    b.addEventListener('click', function () { abrirWA(b.dataset.msg); });
  });

  // Formulario -> WhatsApp
  var form = document.getElementById('supportForm');
  var err = document.getElementById('formError');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var nombre = document.getElementById('nombre').value.trim();
      var negocio = document.getElementById('negocio').value.trim();
      var msg = document.getElementById('mensaje').value.trim();

      if (!nombre) { err.textContent = 'Escribe tu nombre para poder atenderte.'; document.getElementById('nombre').focus(); return; }
      if (msg.length < 5) { err.textContent = 'Cuéntanos un poco más sobre lo que necesitas.'; document.getElementById('mensaje').focus(); return; }
      err.textContent = '';

      var texto = 'Hola GEINZ, soy ' + nombre + (negocio ? ' de ' + negocio : '') + '.\n\n' + msg;
      abrirWA(texto);
    });
  }

  // Brillo que sigue al cursor (suave, solo con mouse y sin reduced-motion)
  var glow = document.getElementById('glow');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fino = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  if (glow && !reduce && fino) {
    var tx = window.innerWidth / 2, ty = 200, x = tx, yy = ty;
    window.addEventListener('pointermove', function (e) { tx = e.clientX; ty = e.clientY; }, { passive: true });
    (function loop() {
      x += (tx - x) * 0.08; yy += (ty - yy) * 0.08;
      glow.style.transform = 'translate3d(' + x + 'px,' + yy + 'px,0)';
      requestAnimationFrame(loop);
    })();
  } else if (glow) {
    glow.style.display = 'none';
  }
})();