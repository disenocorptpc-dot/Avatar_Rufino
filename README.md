# 🎭 Rufino Digital — Avatar 3D, Blendshapes & Lip-Sync Web App

Aplicación web 3D interactiva con un avatar digital (`Rufino_digital.glb`), animación de rostros con Morph Targets (Blendshapes), sincronización labial (Lip-Sync) precisa en tiempo real mediante Text-to-Speech (TTS), micrófono y carga de archivos de audio, además de seguimiento de cabeza con ratón (Bone Tracking) e iluminación de estudio.

![Vite](https://img.shields.io/badge/Vite-5.0-646CFF?style=flat&logo=vite)
![Three.js](https://img.shields.io/badge/Three.js-r160-000000?style=flat&logo=three.js)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=flat&logo=javascript)
![Cloudflare Pages](https://img.shields.io/badge/Deploy-Cloudflare_Pages-F38020?style=flat&logo=cloudflare)

---

## ✨ Características Principales

- **🎭 Renderizado 3D de Alta Calidad**: Carga de `Rufino_digital.glb` en Three.js con iluminación PBR de estudio, sombras suaves (`PCFSoftShadowMap`) y tono fílmico ACES.
- **👄 Sincronización Labial Precisa (Zero-Lag Lip-Sync)**:
  - **Text-to-Speech (TTS)**: Síntesis de voz en español/inglés con reconocimiento de vocales y corte inmediato de apertura al finalizar cada frase.
  - **🎙️ Micrófono en Vivo**: Análisis de frecuencias de voz por Web Audio API con respuesta inmediata de la mandíbula.
  - **🎵 Archivos de Audio**: Carga tus propios archivos `.mp3` o `.wav` para sincronización automática.
- **👁️ Pestañeo & Expresiones**: Pestañeo aleatorio natural y 6 presets rápidos de expresión (Normal, Hablar, Sorprendido, Serio, Guiño, Ojos Cerrados).
- **🦴 Animación de Huesos (Bone Tracking)**:
  - Seguimiento suave del cursor del ratón con la cabeza y el cuello.
  - Micro-movimientos de respiración e inclinación corporal (Idle Motion).
- **🎛️ Inspector de Morph Targets (7 Blendshapes)**: Sliders manuales interactivos para `jawOpen`, `eyeBlinkLeft`, `eyeBlinkRight`, `eyeWideLeft`, `eyeWideRight`, `browDownLeft`, `browDownRight`.
- **📸 Estudio Interactivo**: Presets de cámara (Rostro, Torso, Órbita), 4 esquemas de luces (Estudio, Cyberpunk Neon, Atardecer, Dark Tech) y botón de captura de pantalla PNG.

---

## 🚀 Instalación y Uso Local

1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/disenocorptpc-dot/Avatar_Rufino.git
   cd Avatar_Rufino
   ```

2. **Instalar dependencias**:
   ```bash
   npm install
   ```

3. **Iniciar el servidor de desarrollo**:
   ```bash
   npm run dev
   ```

4. Abre [http://localhost:5173/](http://localhost:5173/) en tu navegador.

---

## ⚡ Despliegue en Cloudflare Pages

Recomendado **Cloudflare Pages** por ser una aplicación SPA (Single Page Application) estática construida con Vite:

1. Ve a tu panel de **Cloudflare Dashboard** ➔ **Workers & Pages** ➔ **Create Application** ➔ **Pages**.
2. Conecta tu cuenta de GitHub y selecciona el repositorio `disenocorptpc-dot/Avatar_Rufino`.
3. Configura los parámetros de build:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Haz clic en **Save and Deploy**. ¡Cloudflare desplegará tu app automáticamente con CDN global y SSL gratuito!
