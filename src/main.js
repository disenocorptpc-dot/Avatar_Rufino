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

// Motion Toggles & Mouse Tracking State
let mouseX = 0;
let mouseY = 0;
let targetHeadRotY = 0;
let targetHeadRotX = 0;
let enableMouseTracking = true;
let enableIdleMotion = true;
let lastMouseMoveTime = 0;
const MOUSE_IDLE_TIMEOUT = 2200; // Return to center after 2.2 seconds of mouse inactivity

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

// Precise Lip-Sync State Variables
let targetJawOpen = 0;
let currentJawOpen = 0;
let ttsWords = [];
let currentWordIndex = 0;
let ttsStartTime = 0;
let ttsEstimatedDurationMs = 0;

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
  // Default camera starting position (Torso View)
  camera.position.set(0, 1.1, 1.8);

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
}

function onMouseMove(event) {
  mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
  lastMouseMoveTime = performance.now(); // Record active mouse movement timestamp
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

      // Default Camera View on Startup: TORSO (Upper Body View)
      const torsoY = avatarModel.position.y + size.y * 0.55;
      controls.target.set(0, torsoY, 0);
      camera.position.set(0, torsoY, 1.8);
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

// --- Bone Animations (Head Sway, Mouse Tracking, Smooth Idle Return) ---
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

  // Smart Mouse Tracking: Smoothly return to center when mouse stays still for > 2.2s
  const isMouseActive = (performance.now() - lastMouseMoveTime) < MOUSE_IDLE_TIMEOUT;

  if (enableMouseTracking && isMouseActive) {
    targetHeadRotY = THREE.MathUtils.lerp(targetHeadRotY, mouseX * 0.35, delta * 3.5);
    targetHeadRotX = THREE.MathUtils.lerp(targetHeadRotX, -mouseY * 0.25, delta * 3.5);
  } else {
    // Return smoothly to natural front-facing orientation when mouse is stationary
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

// --- Audio Context Setup ---
function setupAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.05;
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
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

// Calculate Vowel Weight
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

    if (speechSynthesis.speaking && elapsed < ttsEstimatedDurationMs) {
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

// --- Text-To-Speech (TTS) ---
let synth = window.speechSynthesis;
let voices = [];

function populateVoiceList() {
  if (!synth) return;
  voices = synth.getVoices();
  const select = document.getElementById('voice-select');
  select.innerHTML = '';

  const esVoices = voices.filter((v) => v.lang.startsWith('es'));
  const listToUse = esVoices.length > 0 ? esVoices : voices;

  listToUse.forEach((voice) => {
    const option = document.createElement('option');
    option.textContent = `${voice.name} (${voice.lang})`;
    option.value = voices.indexOf(voice);
    if (voice.lang.startsWith('es')) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

if (synth) {
  populateVoiceList();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoiceList;
  }
}

function speakText() {
  const textInput = document.getElementById('tts-text').value.trim();
  if (!textInput || !synth) return;

  synth.cancel();

  ttsWords = textInput.split(/\s+/);
  currentWordIndex = 0;

  const utterance = new SpeechSynthesisUtterance(textInput);
  const voiceIdx = document.getElementById('voice-select').value;
  if (voices[voiceIdx]) {
    utterance.voice = voices[voiceIdx];
  }

  const rate = parseFloat(document.getElementById('speech-rate').value);
  utterance.rate = rate;

  ttsEstimatedDurationMs = (textInput.length * 65) / rate + 150;

  utterance.onstart = () => {
    isSpeakingTTS = true;
    ttsStartTime = performance.now();
    console.log('Speech started, duration limit:', ttsEstimatedDurationMs, 'ms');
  };

  utterance.onboundary = (event) => {
    if (event.name === 'word') {
      currentWordIndex++;
    }
  };

  utterance.onend = () => {
    stopSpeech();
  };

  utterance.onpause = () => {
    stopSpeech();
  };

  utterance.onerror = (e) => {
    console.error('Speech error:', e);
    stopSpeech();
  };

  synth.speak(utterance);
}

function stopSpeech() {
  if (synth) {
    synth.cancel();
  }
  if (audioElement) {
    audioElement.pause();
  }
  isSpeakingTTS = false;
  isPlayingAudioFile = false;
  targetJawOpen = 0;
  currentJawOpen = 0;
  setBlendShape('jawOpen', 0);
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
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });

  document.getElementById('btn-speak').addEventListener('click', speakText);
  document.getElementById('btn-stop-speak').addEventListener('click', stopSpeech);

  document.getElementById('speech-rate').addEventListener('input', (e) => {
    document.getElementById('rate-val').textContent = e.target.value;
  });

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
    camera.position.set(0, torsoY, 1.8);
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
