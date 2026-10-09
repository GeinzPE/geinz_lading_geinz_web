const theme = require('./tailwind.theme.js');

module.exports = {
  darkMode: 'class',
content: [
  './public/perfil.html',
  './public/js/share/perfil_negocio_v2.js',
  './public/perfil/**/*.html',            // ajusta a donde esté el HTML de fidelización
  './public/js/fidelizacion.js/**/*.js',  // la carpeta del JS que genera las tarjetas
],
  theme,
  safelist: [],
  plugins: [],
};