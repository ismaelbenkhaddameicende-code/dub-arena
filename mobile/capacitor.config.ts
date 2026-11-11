import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Envoltorio nativo de DUB ARENA.
 *
 * El APK carga la web ya compilada (frontend/dist) desde https://localhost,
 * que es contexto seguro: el microfono funciona sin certificados externos.
 * La API se sirve desde el PC de la red local, por eso allowMixedContent.
 */
const config: CapacitorConfig = {
  appId: 'com.dubarena.app',
  appName: 'DUB ARENA',
  webDir: '../frontend/dist',
  android: {
    allowMixedContent: true,
    backgroundColor: '#08080c',
  },
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
};

export default config;
