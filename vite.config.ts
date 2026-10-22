// Relative asset paths, so the built site works from any folder on any static host.
// PayPal's popup needs to talk back to this page, so the opener policy allows popups.
const headers = { 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' };

export default {
  base: './',
  // `npm run server` answers /api; Vite only forwards to it while developing.
  server: { proxy: { '/api': 'http://localhost:8787', '/snapshots': 'http://localhost:8787' }, headers },
  preview: { proxy: { '/api': 'http://localhost:8787', '/snapshots': 'http://localhost:8787' }, headers },
  // Two pages: the designer and the florist's order board.
  build: { rolldownOptions: { input: { main: 'index.html', florist: 'florist.html' } } },
};
