# DUB ARENA para Android (Capacitor)

Convierte la web en un APK real. Requiere Android Studio y JDK 17 (una sola vez).

## Requisitos en el Asus X515

```powershell
winget install EclipseAdoptium.Temurin.17.JDK
winget install Google.AndroidStudio
```

Abre Android Studio una vez, deja que descargue el SDK (unos 4 GB) y en
**SDK Manager** marca *Android SDK Platform 34* y *Android SDK Build-Tools*.

## Compilar

```powershell
# 1) La API debe ser accesible desde el movil: misma wifi y permitir Node.js
#    en el Firewall de Windows para redes privadas.

# 2) Instala el envoltorio
cd mobile
npm install

# 3) Compila la web apuntando al PC (tu IP local con: ipconfig)
cd ..
$env:VITE_API_URL="http://192.168.1.50:4000"
npm run build

# 4) Genera y sincroniza el proyecto Android
cd mobile
npm run add:android
npm run sync
npm run open
```

En Android Studio: **Run** con el movil conectado por USB y depuracion USB activada.
El APK de prueba queda en `mobile/android/app/build/outputs/apk/debug/`.

## Importante

- `VITE_API_URL` queda incrustada en el APK: si cambias de red o de IP, recompila.
- La primera vez que grabes, Android pedira permiso de microfono. Si el permiso no aparece,
  anade `RECORD_AUDIO` en `android/app/src/main/AndroidManifest.xml`.
- Sin cable puedes usar `adb reverse tcp:4000 tcp:4000` y compilar con
  `VITE_API_URL=http://localhost:4000`.
- Publicar en Google Play requiere cuenta de desarrollador (25 USD unico). No es necesario
  para uso propio ni para instalar el APK por USB.
