import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

/**
 * Servidor de desarrollo accesible desde el movil por la red local.
 * El microfono solo funciona en contextos seguros (HTTPS o localhost), de ahi
 * el certificado autofirmado: el navegador mostrara un aviso, se acepta una vez.
 *
 *   npm run dev:https
 *   En el movil: https://<IP-DEL-PC>:5174
 */
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true, secure: false },
      '/socket.io': { target: 'http://localhost:4000', ws: true, changeOrigin: true },
    },
  },
});
