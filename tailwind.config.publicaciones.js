const theme = require('./tailwind.theme.js');

module.exports = {
  darkMode: 'class',
  corePlugins: { preflight: false },
  content: [
    './**/*.html',
    './**/*.js',
    '!./node_modules/**',
  ],
  theme,
  safelist: [],
  plugins: [],
};
