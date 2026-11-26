const theme = require('./tailwind.theme.js');

module.exports = {
  darkMode: 'class',
  content: [
    './public/**/productos.html',               // tu panel (ajusta si está en otra carpeta)
    './public/js/dasboardjs/productos.js',
    './public/js/dasboardjs/import_producto.js',
  ],
  theme,
  safelist: [],
  plugins: [],
};