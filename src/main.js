import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// --- Global State ---
let scene, camera, renderer, controls;
let avatarModel = null;
let morphMeshes = [];
let morphTargetDict = {};
let currentBlendshapeValues = {};

// Bone References
let headBone = null;
let neckBone = null;
let spineBone = null;

let initialHeadRot = new THREE.Euler();
let initialNeckRot = new THREE.Euler();

// Motion Toggles & Tracking State
let mouseX = 0;
let mouseY = 0;
let targetHeadRotY = 0;
let targetHeadRotX = 0;

let enableMouseTracking = true;
let enableIdleMotion = true;
let enableGyroscope = true;

let lastMouseMoveTime = 0;
const MOUSE_IDLE_TIMEOUT = 2200;

// Mobile Gyroscope State
let gyroTargetX = 0;
let gyroTargetY = 0;
let isGyroActive = false;

// Audio & Lip-Sync State
let audioCtx = null;
let analyser = null;
let micStream = null;
let micSource = null;
let audioFileSource = null;
let audioElement = null;

let isMicActive = false;
let isSpeakingTTS = false;
let isPlayingAudioFile = false;

// Precise Lip-Sync Variables
let targetJawOpen = 0;
let currentJawOpen = 0;
let ttsWords = [];
let currentWordIndex = 0;
let ttsStartTime = 0;
let ttsEstimatedDurationMs = 0;

// Global Utterance reference to prevent mobile Garbage Collection
window.currentUtterance = null;

let autoBlinkEnabled = true;
let nextBlinkTime = 0;
let isBlinking = false;
let blinkProgress = 0;

// Lighting Objects
let ambientLight, mainLight, fillLight, rimLight;

// --- Initialize Three.js Scene ---
function initScene() {
  const container = document.getElementById('canvas-container');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0e15);

  camera = new THREE.PerspectiveCamera(
    35,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  
  const isMobile = window.innerWidth <= 768;
  const initialCamDist = isMobile ? 2.1 : 1.8;
  camera.position.set(0, 1.1, initialCamDist);

  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 1.1, 0);
  controls.maxDistance = 5;
  controls.minDistance = 0.5;
  controls.maxPolarAngle = Math.PI / 2 + 0.1;

  setupLights();

  window.addEventListener('resize', onWindowResize);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('touchmove', onTouchMove, { passive: true });

  initGyroscope();
}

function onMouseMove(event) {
  mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
  lastMouseMoveTime = performance.now();
}

function onTouchMove(event) {
  if (event.touches.length > 0) {
    const touch = event.touches[0];
    mouseX = (touch.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(touch.clientY / window.innerHeight) * 2 + 1;
    lastMouseMoveTime = performance.now();
  }
}

// --- Mobile Gyroscope Device Orientation ---
function initGyroscope() {
  if (window.DeviceOrientationEvent) {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const btnReq = document.getElementById('btn-request-gyro');
      if (btnReq) btnReq.style.display = 'block';
    } else {
      window.addEventListener('deviceorientation', handleDeviceOrientation, true);
    }
  }
}

function handleDeviceOrientation(event) {
  if (!enableGyroscope) return;

  const beta = event.beta;   // Pitch
  const gamma = event.gamma; // Roll

  if (beta === null || gamma === null) return;

  isGyroActive = true;

  const normBeta = Math.max(-1, Math.min(1, (beta - 45) / 35));
  const normGamma = Math.max(-1, Math.min(1, gamma / 35));

  gyroTargetX = normBeta * 0.35;
  gyroTargetY = -normGamma * 0.45;
  lastMouseMoveTime = performance.now();
}

function setupLights() {
  ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  mainLight = new THREE.DirectionalLight(0xfff5ea, 1.2);
  mainLight.position.set(2, 3, 2);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.width = 2048;
  mainLight.shadow.mapSize.height = 2048;
  mainLight.shadow.bias = -0.0001;
  scene.add(mainLight);

  fillLight = new THREE.DirectionalLight(0x8cbbfd, 0.6);
  fillLight.position.set(-2, 1.5, 1.5);
  scene.add(fillLight);

  rimLight = new THREE.DirectionalLight(0x00f2fe, 1.0);
  rimLight.position.set(0, 2.5, -2);
  scene.add(rimLight);
}

function setLightingPreset(preset) {
  switch (preset) {
    case 'cyberpunk':
      ambientLight.color.setHex(0x1a0933);
      ambientLight.intensity = 0.5;
      mainLight.color.setHex(0xff0055);
      mainLight.intensity = 1.5;
      fillLight.color.setHex(0x00f2fe);
      fillLight.intensity = 1.2;
      rimLight.color.setHex(0x7f00ff);
      rimLight.intensity = 2.0;
      break;

    case 'warm':
      ambientLight.color.setHex(0x332211);
      ambientLight.intensity = 0.6;
      mainLight.color.setHex(0xffaa44);
      mainLight.intensity = 1.6;
      fillLight.color.setHex(0xff6622);
      fillLight.intensity = 0.8;
      rimLight.color.setHex(0xffeebba);
      rimLight.intensity = 1.2;
      break;

    case 'darktech':
      ambientLight.color.setHex(0x080c14);
      ambientLight.intensity = 0.3;
      mainLight.color.setHex(0x38bdf8);
      mainLight.intensity = 1.2;
      fillLight.color.setHex(0x818cf8);
      fillLight.intensity = 0.7;
      rimLight.color.setHex(0x34d399);
      rimLight.intensity = 1.5;
      break;

    case 'studio':
    default:
      ambientLight.color.setHex(0xffffff);
      ambientLight.intensity = 0.8;
      mainLight.color.setHex(0xfff5ea);
      mainLight.intensity = 1.2;
      fillLight.color.setHex(0x8cbbfd);
      fillLight.intensity = 0.6;
      rimLight.color.setHex(0x00f2fe);
      rimLight.intensity = 1.0;
      break;
  }
}

// --- Load GLB Model ---
function loadAvatar() {
  const loader = new GLTFLoader();
  const progressBar = document.getElementById('progress-bar');
  const loadingText = document.getElementById('loading-text');

  loader.load(
    './models/Rufino_digital.glb',
    (gltf) => {
      avatarModel = gltf.scene;

      morphMeshes = [];
      morphTargetDict = {};

      avatarModel.traverse((node) => {
        if (node.name === 'Hea' || node.name === 'Head') {
          headBone = node;
          initialHeadRot.copy(node.rotation);
        } else if (node.name === 'Neck') {
          neckBone = node;
          initialNeckRot.copy(node.rotation);
        } else if (node.name === 'Bone') {
          spineBone = node;
        }

        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;

          if (node.morphTargetDictionary && node.morphTargetInfluences) {
            morphMeshes.push(node);
            Object.assign(morphTargetDict, node.morphTargetDictionary);
          }
        }
      });

      const box = new THREE.Box3().setFromObject(avatarModel);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());

      avatarModel.position.sub(center);
      avatarModel.position.y += size.y / 2;

      scene.add(avatarModel);

      // Default Torso View
      const isMobile = window.innerWidth <= 768;
      const torsoY = avatarModel.position.y + size.y * 0.55;
      controls.target.set(0, torsoY, 0);
      const camDist = isMobile ? 2.1 : 1.8;
      camera.position.set(0, torsoY, camDist);
      controls.update();

      initBlendshapeSliders();

      document.getElementById('loading-overlay').classList.add('hidden');
    },
    (xhr) => {
      if (xhr.lengthComputable) {
        const percent = Math.round((xhr.loaded / xhr.total) * 100);
        progressBar.style.width = `${percent}%`;
        loadingText.textContent = `Cargando modelo GLB: ${percent}%`;
      }
    },
    (error) => {
      console.error('Error loading GLB:', error);
      loadingText.textContent = 'Error al cargar el modelo 3D.';
    }
  );
}

// --- Morph Target Setter ---
function setBlendShape(name, value) {
  value = Math.max(0, Math.min(1, value));
  currentBlendshapeValues[name] = value;

  morphMeshes.forEach((mesh) => {
    if (mesh.morphTargetDictionary && mesh.morphTargetDictionary[name] !== undefined) {
      const idx = mesh.morphTargetDictionary[name];
      mesh.morphTargetInfluences[idx] = value;
    }
  });

  const slider = document.getElementById(`slider-${name}`);
  const valSpan = document.getElementById(`val-${name}`);
  if (slider && valSpan) {
    slider.value = value;
    valSpan.textContent = value.toFixed(2);
  }
}

// --- Bone Animations ---
function updateBoneAnimations(time, delta) {
  if (!headBone && !neckBone) return;

  let idleHeadX = 0;
  let idleHeadY = 0;
  let idleHeadZ = 0;

  if (enableIdleMotion) {
    idleHeadX = Math.sin(time * 1.5) * 0.025;
    idleHeadY = Math.cos(time * 0.9) * 0.035;
    idleHeadZ = Math.sin(time * 1.1) * 0.015;
  }

  const isInputActive = (performance.now() - lastMouseMoveTime) < MOUSE_IDLE_TIMEOUT;

  if (enableGyroscope && isGyroActive) {
    targetHeadRotX = THREE.MathUtils.lerp(targetHeadRotX, gyroTargetX, delta * 3.5);
    targetHeadRotY = THREE.MathUtils.lerp(targetHeadRotY, gyroTargetY, delta * 3.5);
  } else if (enableMouseTracking && isInputActive) {
    targetHeadRotY = THREE.MathUtils.lerp(targetHeadRotY, mouseX * 0.35, delta * 3.5);
    targetHeadRotX = THREE.MathUtils.lerp(targetHeadRotX, -mouseY * 0.25, delta * 3.5);
  } else {
    targetHeadRotY = THREE.MathUtils.lerp(targetHeadRotY, 0, delta * 2.0);
    targetHeadRotX = THREE.MathUtils.lerp(targetHeadRotX, 0, delta * 2.0);
  }

  let speechNod = 0;
  if (currentJawOpen > 0.15) {
    speechNod = Math.sin(time * 10) * 0.03 * currentJawOpen;
  }

  if (headBone) {
    headBone.rotation.x = initialHeadRot.x + targetHeadRotX + idleHeadX + speechNod;
    headBone.rotation.y = initialHeadRot.y + targetHeadRotY + idleHeadY;
    headBone.rotation.z = initialHeadRot.z + idleHeadZ;
  }

  if (neckBone) {
    neckBone.rotation.x = initialNeckRot.x + targetHeadRotX * 0.4 + idleHeadX * 0.5;
    neckBone.rotation.y = initialNeckRot.y + targetHeadRotY * 0.4 + idleHeadY * 0.5;
  }
}

// --- Automatic Blink ---
function updateAutoBlink(delta) {
  if (!autoBlinkEnabled) return;

  const now = performance.now();
  if (now > nextBlinkTime && !isBlinking) {
    isBlinking = true;
    blinkProgress = 0;
  }

  if (isBlinking) {
    blinkProgress += delta * 14;
    let blinkValue = Math.sin(blinkProgress * Math.PI);

    if (blinkProgress >= 1) {
      isBlinking = false;
      blinkValue = 0;
      nextBlinkTime = now + 2500 + Math.random() * 3500;
    }

    setBlendShape('eyeBlinkLeft', blinkValue);
    setBlendShape('eyeBlinkRight', blinkValue);
  }
}

// --- Zero-Lag Audio Context Setup ---
function setupAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.05;
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}

// Microphone Toggle
async function toggleMicrophone(active) {
  setupAudioContext();
  isMicActive = active;

  if (active) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micSource = audioCtx.createMediaStreamSource(micStream);
      micSource.connect(analyser);
    } catch (err) {
      console.error('Mic access error:', err);
      alert('No se pudo acceder al micrófono.');
      document.getElementById('mic-toggle').checked = false;
      isMicActive = false;
    }
  } else {
    if (micStream) {
      micStream.getTracks().forEach((track) => track.stop());
      micStream = null;
    }
    if (micSource) {
      micSource.disconnect();
      micSource = null;
    }
    targetJawOpen = 0;
    currentJawOpen = 0;
    setBlendShape('jawOpen', 0);
  }
}

// Audio File Player
function handleAudioFileUpload(file) {
  setupAudioContext();

  if (audioElement) {
    audioElement.pause();
  }

  const url = URL.createObjectURL(file);
  audioElement = new Audio(url);
  audioElement.crossOrigin = 'anonymous';

  if (!audioFileSource) {
    audioFileSource = audioCtx.createMediaElementSource(audioElement);
    audioFileSource.connect(analyser);
    analyser.connect(audioCtx.destination);
  }

  audioElement.onplay = () => {
    isPlayingAudioFile = true;
  };

  audioElement.onended = () => {
    isPlayingAudioFile = false;
    targetJawOpen = 0;
    currentJawOpen = 0;
    setBlendShape('jawOpen', 0);
  };

  audioElement.play();
}

// Vowel Weight
function getVowelWeight(char) {
  const c = char.toLowerCase();
  if (['a', 'o', 'á', 'ó'].includes(c)) return 0.85;
  if (['e', 'é'].includes(c)) return 0.65;
  if (['i', 'u', 'í', 'ú'].includes(c)) return 0.45;
  return 0.15;
}

// Update Lip Sync
function updateAudioLipSync(time, delta) {
  const canvas = document.getElementById('spectrum-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (analyser && (isMicActive || isPlayingAudioFile)) {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    let count = 0;
    for (let i = 3; i < Math.min(45, bufferLength); i++) {
      sum += dataArray[i];
      count++;
    }
    const avgVoice = sum / count;

    targetJawOpen = Math.min(1, Math.max(0, (avgVoice - 14) / 70));

    const barWidth = (canvas.width / bufferLength) * 2;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * canvas.height;
      const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
      gradient.addColorStop(0, '#4facfe');
      gradient.addColorStop(1, '#00f2fe');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
      x += barWidth;
    }
  } else if (isSpeakingTTS) {
    const elapsed = performance.now() - ttsStartTime;

    if (window.speechSynthesis && window.speechSynthesis.speaking && elapsed < ttsEstimatedDurationMs) {
      const elapsedSec = elapsed / 1000;
      const syllablePulse = Math.sin(elapsedSec * 26);
      const wordEnvelope = Math.abs(Math.sin(elapsedSec * 12));
      const noise = (Math.random() - 0.5) * 0.15;

      let rawJaw = (syllablePulse * 0.35 + wordEnvelope * 0.45 + 0.2) + noise;

      if (ttsWords.length > 0 && currentWordIndex < ttsWords.length) {
        const word = ttsWords[currentWordIndex];
        let maxVowel = 0.5;
        for (let char of word) {
          maxVowel = Math.max(maxVowel, getVowelWeight(char));
        }
        rawJaw *= maxVowel;
      }

      targetJawOpen = Math.max(0, Math.min(0.85, rawJaw));

      ctx.fillStyle = '#00f2fe';
      const numBars = 16;
      const barW = canvas.width / numBars;
      for (let i = 0; i < numBars; i++) {
        const h = Math.abs(Math.sin(time * 12 + i)) * canvas.height * targetJawOpen;
        ctx.fillRect(i * barW, canvas.height - h, barW - 2, h);
      }
    } else {
      isSpeakingTTS = false;
      targetJawOpen = 0;
    }
  } else {
    targetJawOpen = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
  }

  if (targetJawOpen === 0) {
    currentJawOpen = THREE.MathUtils.lerp(currentJawOpen, 0, delta * 45);
    if (currentJawOpen < 0.02) currentJawOpen = 0;
  } else {
    const lerpSpeed = targetJawOpen > currentJawOpen ? 30 : 25;
    currentJawOpen = THREE.MathUtils.lerp(currentJawOpen, targetJawOpen, delta * lerpSpeed);
  }

  setBlendShape('jawOpen', currentJawOpen);

  if (currentJawOpen > 0.4) {
    setBlendShape('browDownLeft', (currentJawOpen - 0.4) * 0.3);
    setBlendShape('browDownRight', (currentJawOpen - 0.4) * 0.3);
    setBlendShape('eyeWideLeft', (currentJawOpen - 0.4) * 0.25);
    setBlendShape('eyeWideRight', (currentJawOpen - 0.4) * 0.25);
  } else if (!isSpeakingTTS && !isMicActive && !isPlayingAudioFile) {
    setBlendShape('browDownLeft', 0);
    setBlendShape('browDownRight', 0);
    setBlendShape('eyeWideLeft', 0);
    setBlendShape('eyeWideRight', 0);
  }
}

// Global Mobile Unlock Handler
function unlockMobileAudio() {
  if (window.speechSynthesis) {
    window.speechSynthesis.resume();
  }
}
window.addEventListener('touchstart', unlockMobileAudio, { passive: true });
window.addEventListener('click', unlockMobileAudio, { passive: true });

// --- Synchronous Bulletproof Web Speech Engine ---
let voices = [];

const MALE_KEYWORDS = [
  'jorge', 'juan', 'pablo', 'diego', 'carlos', 'miguel', 'mateo', 'pedro', 'raul', 'rodrigo',
  'male', 'hombre', 'masculin', 'eee', 'sfg', 'efg', 'en-us-x-sfg', 'es-es-x-eee'
];

const FEMALE_KEYWORDS = [
  'monica', 'paulina', 'marisol', 'soledad', 'francisca', 'helena', 'laura', 'sabina', 'victoria',
  'marta', 'conchita', 'lucia', 'female', 'mujer', 'x-ana'
];

function isMaleVoice(voice) {
  if (!voice || !voice.name) return false;
  const nameLower = voice.name.toLowerCase();
  const langLower = voice.lang ? voice.lang.toLowerCase() : '';
  
  for (let kw of FEMALE_KEYWORDS) {
    if (nameLower.includes(kw)) return false;
  }
  for (let kw of MALE_KEYWORDS) {
    if (nameLower.includes(kw) || langLower.includes(kw)) return true;
  }
  return false;
}

function populateVoiceList() {
  if (!window.speechSynthesis) return;
  voices = window.speechSynthesis.getVoices();
  const select = document.getElementById('voice-select');
  const infoSpan = document.getElementById('voice-info');
  if (!select) return;

  select.innerHTML = '';

  if (voices.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = '🔊 Voz Masculina Rufino (Pitch Grave 0.65)';
    opt.value = 'default_male';
    select.appendChild(opt);
    if (infoSpan) infoSpan.textContent = 'Voz Masculina Grave Activada ♂️';
    return;
  }

  const esVoices = voices.filter((v) => v.lang.startsWith('es'));
  const listToUse = esVoices.length > 0 ? esVoices : voices;

  let defaultMaleIndex = -1;

  listToUse.forEach((voice) => {
    const isMale = isMaleVoice(voice);
    const globalIdx = voices.indexOf(voice);

    const option = document.createElement('option');
    const genderTag = isMale ? ' ♂️ (Masculina)' : '';
    option.textContent = `${voice.name} (${voice.lang})${genderTag}`;
    option.value = globalIdx;

    if (isMale && defaultMaleIndex === -1) {
      defaultMaleIndex = globalIdx;
    }

    select.appendChild(option);
  });

  if (defaultMaleIndex !== -1) {
    select.value = defaultMaleIndex;
    if (infoSpan) infoSpan.textContent = `Voz activa: ${voices[defaultMaleIndex].name} ♂️`;
  } else if (select.options.length > 0) {
    select.selectedIndex = 0;
    if (infoSpan) infoSpan.textContent = `Voz activa: ${voices[select.value].name} (Tono grave 0.65 aplicado)`;
  }
}

if (window.speechSynthesis) {
  populateVoiceList();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoiceList;
  }
}

function speakText() {
  const textInput = document.getElementById('tts-text').value.trim();
  if (!textInput || !window.speechSynthesis) return;

  // Unmute & Resume Speech Engine
  window.speechSynthesis.cancel();
  window.speechSynthesis.resume();

  // Create Utterance SYNCHRONOUSLY inside touch/click event tick
  const utterance = new SpeechSynthesisUtterance(textInput);
  window.currentUtterance = utterance; // Prevent Mobile Garbage Collection!

  // Re-populate voices synchronously if array is empty
  let currentVoices = window.speechSynthesis.getVoices();
  if (!currentVoices || currentVoices.length === 0) {
    currentVoices = voices;
  }

  const select = document.getElementById('voice-select');
  const selectedIdx = select ? select.value : '';

  let selectedVoice = null;
  let isSelectedVoiceMale = false;

  if (currentVoices && currentVoices[selectedIdx]) {
    selectedVoice = currentVoices[selectedIdx];
    isSelectedVoiceMale = isMaleVoice(selectedVoice);
  } else if (currentVoices && currentVoices.length > 0) {
    // Auto-search for first male voice in list
    for (let v of currentVoices) {
      if (isMaleVoice(v)) {
        selectedVoice = v;
        isSelectedVoiceMale = true;
        break;
      }
    }
  }

  if (selectedVoice) {
    try {
      utterance.voice = selectedVoice;
    } catch (e) {}
  }

  const rateInput = document.getElementById('speech-rate');
  const pitchInput = document.getElementById('speech-pitch');
  
  const rate = rateInput ? parseFloat(rateInput.value) : 1.0;
  // If selected voice is male, pitch is 0.95; if non-male fallback, pitch shift to deep baritone (0.65)
  const userPitch = pitchInput ? parseFloat(pitchInput.value) : 0.65;
  const pitch = isSelectedVoiceMale ? Math.min(userPitch, 0.95) : 0.65;

  utterance.rate = rate;
  utterance.pitch = pitch;

  ttsWords = textInput.split(/\s+/);
  currentWordIndex = 0;
  ttsEstimatedDurationMs = (textInput.length * 65) / rate + 200;

  utterance.onstart = () => {
    isSpeakingTTS = true;
    ttsStartTime = performance.now();

    if (window.innerWidth <= 768) {
      const panel = document.getElementById('control-panel');
      if (panel) panel.classList.add('collapsed');
    }
  };

  utterance.onboundary = (event) => {
    if (event.name === 'word') {
      currentWordIndex++;
    }
  };

  utterance.onend = () => {
    stopSpeech();
  };

  utterance.onerror = (e) => {
    console.error('Speech synthesis error:', e);
    stopSpeech();
  };

  // Synchronous speak call inside direct user gesture tick
  window.speechSynthesis.speak(utterance);
}

function stopSpeech() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (audioElement) {
    audioElement.pause();
  }
  isSpeakingTTS = false;
  isPlayingAudioFile = false;
  targetJawOpen = 0;
  currentJawOpen = 0;
  setBlendShape('jawOpen', 0);
  window.currentUtterance = null;
}

// --- Expression Presets ---
function applyExpressionPreset(exp) {
  Object.keys(morphTargetDict).forEach((key) => setBlendShape(key, 0));

  switch (exp) {
    case 'talk':
      setBlendShape('jawOpen', 0.6);
      setBlendShape('browDownLeft', 0.2);
      setBlendShape('browDownRight', 0.2);
      break;

    case 'surprise':
      setBlendShape('jawOpen', 0.7);
      setBlendShape('eyeWideLeft', 0.9);
      setBlendShape('eyeWideRight', 0.9);
      break;

    case 'serious':
      setBlendShape('browDownLeft', 0.8);
      setBlendShape('browDownRight', 0.8);
      break;

    case 'wink':
      setBlendShape('eyeBlinkLeft', 1.0);
      setBlendShape('eyeWideRight', 0.4);
      break;

    case 'blink':
      setBlendShape('eyeBlinkLeft', 1.0);
      setBlendShape('eyeBlinkRight', 1.0);
      break;

    case 'reset':
    default:
      break;
  }
}

// --- Generate UI Sliders ---
function initBlendshapeSliders() {
  const container = document.getElementById('blendshape-sliders');
  container.innerHTML = '';

  const availableTargets = Object.keys(morphTargetDict);

  if (availableTargets.length === 0) {
    container.innerHTML = '<p class="sublabel">No se encontraron Morph Targets.</p>';
    return;
  }

  availableTargets.forEach((targetName) => {
    const row = document.createElement('div');
    row.className = 'slider-row';

    row.innerHTML = `
      <div class="slider-row-header">
        <span class="slider-name">${targetName}</span>
        <span class="slider-val" id="val-${targetName}">0.00</span>
      </div>
      <input type="range" id="slider-${targetName}" min="0" max="1" step="0.01" value="0">
    `;

    container.appendChild(row);

    const sliderInput = row.querySelector('input');
    sliderInput.addEventListener('input', (e) => {
      setBlendShape(targetName, parseFloat(e.target.value));
    });
  });
}

// --- Event Listeners Setup ---
function setupEventListeners() {
  const panel = document.getElementById('control-panel');
  const panelHandle = document.getElementById('panel-handle');
  const btnTogglePanel = document.getElementById('btn-toggle-panel');

  if (window.innerWidth <= 768 && panel) {
    panel.classList.add('collapsed');
  }

  const togglePanel = () => {
    panel.classList.toggle('collapsed');
  };

  if (panelHandle) panelHandle.addEventListener('click', togglePanel);
  if (btnTogglePanel) btnTogglePanel.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePanel();
  });

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });

  const btnSpeak = document.getElementById('btn-speak');
  if (btnSpeak) {
    btnSpeak.addEventListener('click', () => {
      speakText();
    });
  }

  const btnStop = document.getElementById('btn-stop-speak');
  if (btnStop) {
    btnStop.addEventListener('click', stopSpeech);
  }

  document.getElementById('speech-rate').addEventListener('input', (e) => {
    document.getElementById('rate-val').textContent = e.target.value;
  });

  const speechPitch = document.getElementById('speech-pitch');
  if (speechPitch) {
    speechPitch.addEventListener('input', (e) => {
      const pVal = parseFloat(e.target.value);
      document.getElementById('pitch-val').textContent = pVal.toFixed(2);
    });
  }

  const voiceSelect = document.getElementById('voice-select');
  if (voiceSelect) {
    voiceSelect.addEventListener('focus', populateVoiceList);
  }

  const audioInput = document.getElementById('audio-file-input');
  if (audioInput) {
    audioInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleAudioFileUpload(file);
      }
    });
  }

  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.getElementById('tts-text').value = chip.getAttribute('data-phrase');
      speakText();
    });
  });

  document.getElementById('mic-toggle').addEventListener('change', (e) => {
    toggleMicrophone(e.target.checked);
  });

  const gyroToggle = document.getElementById('gyro-toggle');
  if (gyroToggle) {
    gyroToggle.addEventListener('change', (e) => {
      enableGyroscope = e.target.checked;
    });
  }

  const btnReqGyro = document.getElementById('btn-request-gyro');
  if (btnReqGyro) {
    btnReqGyro.addEventListener('click', async () => {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const state = await DeviceOrientationEvent.requestPermission();
          if (state === 'granted') {
            window.addEventListener('deviceorientation', handleDeviceOrientation, true);
            btnReqGyro.style.display = 'none';
            alert('¡Giroscopio activado!');
          }
        } catch (err) {
          console.error(err);
        }
      }
    });
  }

  const mouseTrackToggle = document.getElementById('mouse-track-toggle');
  if (mouseTrackToggle) {
    mouseTrackToggle.addEventListener('change', (e) => {
      enableMouseTracking = e.target.checked;
    });
  }

  const idleMotionToggle = document.getElementById('idle-motion-toggle');
  if (idleMotionToggle) {
    idleMotionToggle.addEventListener('change', (e) => {
      enableIdleMotion = e.target.checked;
    });
  }

  document.getElementById('auto-blink-toggle').addEventListener('change', (e) => {
    autoBlinkEnabled = e.target.checked;
  });

  document.querySelectorAll('.btn-exp').forEach((btn) => {
    btn.addEventListener('click', () => {
      const exp = btn.getAttribute('data-exp');
      applyExpressionPreset(exp);
    });
  });

  document.getElementById('btn-reset-sliders').addEventListener('click', () => {
    applyExpressionPreset('reset');
  });

  document.querySelectorAll('.btn-studio').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-studio').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setLightingPreset(btn.getAttribute('data-light'));
    });
  });

  document.getElementById('light-intensity').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('light-val').textContent = val.toFixed(1);
    mainLight.intensity = val;
  });

  document.querySelectorAll('.btn-bg').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-bg').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const bg = btn.getAttribute('data-bg');
      if (bg === 'studio') scene.background = new THREE.Color(0x222636);
      else if (bg === 'black') scene.background = new THREE.Color(0x000000);
      else scene.background = new THREE.Color(0x0c0e15);
    });
  });

  document.getElementById('btn-camera-face').addEventListener('click', () => {
    if (!avatarModel) return;
    const box = new THREE.Box3().setFromObject(avatarModel);
    const size = box.getSize(new THREE.Vector3());
    const headY = avatarModel.position.y + size.y * 0.78;
    controls.target.set(0, headY, 0);
    camera.position.set(0, headY + 0.02, 0.7);
    controls.update();
  });

  document.getElementById('btn-camera-torso').addEventListener('click', () => {
    if (!avatarModel) return;
    const box = new THREE.Box3().setFromObject(avatarModel);
    const size = box.getSize(new THREE.Vector3());
    const torsoY = avatarModel.position.y + size.y * 0.55;
    controls.target.set(0, torsoY, 0);
    const isMobile = window.innerWidth <= 768;
    const camDist = isMobile ? 2.1 : 1.8;
    camera.position.set(0, torsoY, camDist);
    controls.update();
  });

  document.getElementById('btn-screenshot').addEventListener('click', () => {
    renderer.render(scene, camera);
    const dataURL = renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `rufino_avatar_${Date.now()}.png`;
    link.href = dataURL;
    link.click();
  });

  document.getElementById('auto-rotate-toggle').addEventListener('change', (e) => {
    controls.autoRotate = e.target.checked;
    controls.autoRotateSpeed = 1.5;
  });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Main Render Loop ---
let clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const elapsedTime = clock.getElapsedTime();

  controls.update();

  updateBoneAnimations(elapsedTime, delta);
  updateAutoBlink(delta);
  updateAudioLipSync(elapsedTime, delta);

  renderer.render(scene, camera);
}

window.addEventListener('DOMContentLoaded', () => {
  initScene();
  setupEventListeners();
  loadAvatar();
  animate();
});
