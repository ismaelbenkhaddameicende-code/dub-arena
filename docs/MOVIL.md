# DUB ARENA en el movil

Hay tres formas de usarla y no sirven para lo mismo. Elige segun lo que necesites hoy.

| Camino | Que obtienes | Tiempo | Necesitas |
|---|---|---|---|
| **PWA** (recomendado para empezar) | Icono en el movil, pantalla completa, interfaz tactil | 2 minutos | PC y movil en la misma wifi |
| **PWA publicada** | Acceso desde cualquier red, con HTTPS real | 15 minutos | cuenta gratuita en Vercel/Netlify |
| **APK con Capacitor** | App nativa Android instalable, sin navegador | 1-2 horas | Android Studio + JDK 17 (~5 GB) |

---

## Aviso imprescindible sobre el microfono

Los navegadores solo dan acceso al microfono en **contexto seguro**: `localhost` o `https://`.
Si abres `http://192.168.1.50:5173` en el movil, la grabacion **no funcionara**: es una regla
del navegador, no un fallo de DUB ARENA.

Por eso hay un servidor de desarrollo con certificado autofirmado:

```powershell
npm run dev:mobile
```

Muestra dos direcciones. En el movil abre la de **Network** (por ejemplo
`https://192.168.1.50:5174`), acepta el aviso de certificado no valido una vez y ya tendras
microfono, video sincronizado y grabacion.

---

## 1. Instalar como PWA

1. `npm run dev` (o `npm run dev:mobile` si quieres grabar desde el movil).
2. En el movil abre la web.
3. Android/Chrome: menu de tres puntos -> **Instalar aplicacion** (o el boton
   "Instalar" que aparece en el inicio de DUB ARENA).
4. iPhone/Safari: boton Compartir -> **Anadir a pantalla de inicio**.

La app queda con su icono, sin barra del navegador y con la interfaz en cache para arrancar
sin conexion. **Los videos y las grabaciones nunca se guardan en cache**: son grandes y privados.

## 2. Publicarla para que funcione en cualquier red

El plan gratuito de Vercel o Netlify sirve la carpeta `frontend/dist` con HTTPS, que es lo que
el microfono necesita. Para que la interfaz encuentre la API, compila con la URL publica:

```powershell
$env:VITE_API_URL="https://mi-api.midominio.com"
npm run build
```

El backend necesita disco persistente para guardar videos y grabaciones (Render o Railway,
desde unos 5 USD/mes; los planes gratuitos duermen y borran archivos). Para uso con amigos
en la misma casa no necesitas desplegar nada: con `npm run dev:mobile` sobra.

## 3. APK con Capacitor

Ver `mobile/README.md`. Resumen:

```powershell
winget install EclipseAdoptium.Temurin.17.JDK
winget install Google.AndroidStudio

cd mobile
npm install
cd ..
$env:VITE_API_URL="http://192.168.1.50:4000"
npm run build
cd mobile
npm run add:android
npx cap sync android
npm run open
```

Ventaja real del APK: el WebView carga desde `https://localhost`, que **ya es contexto seguro**,
asi que el microfono funciona sin certificados ni avisos.

---

## Que funciona en el movil y que no

| Funcion | Movil | Nota |
|---|---|---|
| Entrar, crear y unirse a salas | Si | |
| Ver el video sincronizado | Si | el video va por red local |
| Grabar tu personaje con efectos | Si, con HTTPS | en iOS necesitas Safari 14.3 o superior |
| Escuchar tomas y participantes | Si | |
| Analisis de escena | Si | el trabajo pesado lo hace el servidor |
| Editor multipista | Si, incomodo | mueve y recorta clips, pero con dedo pierdes precision |
| Exportar | Si | se procesa en el servidor, no en el telefono |

Limites conocidos:

- iOS no permite grabar en segundo plano al cambiar de app.
- En 8 GB, evita analizar mientras alguien graba.
- El editor esta pensado para PC: en el movil, gira el telefono a horizontal.
- La interfaz usa areas seguras (notch) y objetivos tactiles de 44 px.
