import { LANG } from './translations.js';

// --- Language setup ---
let currentLang = localStorage.getItem('spoke_lang') || 'en';

// --- Dark mode ---
let darkMode = localStorage.getItem('darkMode') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.documentElement.setAttribute('data-theme', darkMode);

// --- Elements ---
const measureBtn = document.getElementById('measureBtn');
const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');
const savePresetBtn = document.getElementById('savePresetBtn');
const deletePresetBtn = document.getElementById('deletePresetBtn');
const langSelect = document.getElementById('langSelect');
const darkToggle = document.getElementById('darkModeToggle');
const statusEl = document.getElementById('status');
const presetSelect = document.getElementById('presetSelect');
const materialSelect = document.getElementById('material');

const tableBody = document.getElementById('tableBody');

// --- Materials density ---
const MATERIAL_DENSITY = {
  steel: 7858,
  titanium: 4500,
  aluminium: 2700
}

// --- Presets ---
const PRESETS_KEY = 'spoke_presets';
function loadPresets() {
  const stored = JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]');
  presetSelect.innerHTML = '';
  stored.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = p.name;
    presetSelect.appendChild(opt);
  });
  return stored;
}
let presets = loadPresets();

// History
const SPOKE_HISTORY_KEY = 'spoke_history';
let history = JSON.parse(localStorage.getItem(SPOKE_HISTORY_KEY) || '[]');
renderTable()

// --- Language & Materials ---
function loadMaterials(strings) {
  materialSelect.innerHTML = '';

  Object.entries(MATERIAL_DENSITY).forEach(([key, density]) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = `${strings[key]} (${density} kg/m³)`;
    materialSelect.appendChild(option);
  })
}

function setLanguage(lang) {
  const strings = LANG[lang];

  document.querySelectorAll("[data-string]").forEach(el => {
    const key = el.dataset.string;

    if (!key) {
      return;
    }

    if (!strings[key]) {
      console.warn(`Missing translation for key: "${key}"`);
      return;
    }

    el.innerHTML = strings[key];
  });

  document.title = strings.title;
  statusEl.textContent = `${strings.status}: ${strings.statusReady}`;
  loadMaterials(strings);
  renderTable();
  langSelect.value = lang;
}

// --- Event listeners ---
langSelect.addEventListener('change', e => {
  currentLang = e.target.value;
  localStorage.setItem('spoke_lang', currentLang);
  setLanguage(currentLang);
});

darkToggle.addEventListener('click', () => {
  darkMode = darkMode === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', darkMode);
  localStorage.setItem('darkMode', darkMode);
});

// --- Presets ---
savePresetBtn.addEventListener('click', () => {
  const name = prompt(LANG[currentLang].promptPresetName);
  if (!name) return;
  const preset = {
    name,
    length: document.getElementById('length').value,
    diameter: document.getElementById('diameter').value,
    material: materialSelect.value,
    duration: document.getElementById('duration').value,
    calibration: document.getElementById('calibration').value
  };
  presets.push(preset);
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  loadPresets();
  presetSelect.value = presets.length - 1; // auto-select new preset
});

deletePresetBtn.addEventListener('click', () => {
  const idx = presetSelect.value;
  if (idx === null || idx === undefined) return;
  presets.splice(idx, 1);
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  presets = loadPresets();
});

// --- Preset select change ---
presetSelect.addEventListener('change', e => {
  const preset = presets[e.target.value];
  if (!preset) return;
  document.getElementById('length').value = preset.length;
  document.getElementById('diameter').value = preset.diameter;
  document.getElementById('duration').value = preset.duration;
  document.getElementById('calibration').value = preset.calibration;
  materialSelect.value = preset.material;
});

// --- Audio measurement ---
let audioContext, mediaStream, analyser;
let samples = [];

async function initMic() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = audioContext.createMediaStreamSource(mediaStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
  }
}

function getFrequency() {
  const bufferLength = analyser.fftSize;
  const dataArray = new Float32Array(bufferLength);
  analyser.getFloatTimeDomainData(dataArray);
  let crossings = 0;
  for (let i = 1; i < bufferLength; i++) {
    if ((dataArray[i - 1] < 0 && dataArray[i] >= 0) || (dataArray[i - 1] > 0 && dataArray[i] <= 0)) crossings++;
  }
  return crossings * audioContext.sampleRate / (2 * bufferLength);
}

measureBtn.addEventListener('click', async () => {
  measureBtn.disabled = true;

  statusEl.textContent = `${LANG[currentLang].status}: ${LANG[currentLang].statusRecording}`;
  
  document.getElementById('tension').textContent = '-- kgf';
  document.getElementById('freq').textContent = '-- Hz';
  document.getElementById('samples').textContent = '0';
  document.getElementById('stdev').textContent = '--';

  await initMic();
  samples = [];

  const durationInput = document.getElementById('duration');
  const calibrationInput = document.getElementById('calibration');

  const duration =  Math.min(Math.max(parseFloat(durationInput.value) || 3, 0.5), 10);
  durationInput.value = duration;
  const calibration =   Math.min(Math.max(parseFloat(calibrationInput.value) || 1.0, 0.5), 2.0);
  calibrationInput.value = calibration;
  const materialDensity = parseFloat(MATERIAL_DENSITY[materialSelect.value]) || 7850;
  const length = parseFloat(document.getElementById('length').value) / 1000;
  const diameter = parseFloat(document.getElementById('diameter').value) / 1000;
  const area = Math.PI * (diameter / 2) ** 2;

  const interval = 100;
  const iterations = Math.floor((duration * 1000) / interval);

  for (let i = 0; i < iterations; i++) {
    const f = getFrequency();
    if (f && isFinite(f) && f > 20 && f < 10000) samples.push(f);
    await new Promise(r => setTimeout(r, interval));
  }

  // --- Filter noisy samples ---
  const good = samples.filter(f => f && isFinite(f) && f > 20 && f < 10000);
  if (good.length < 3) {
    alert(LANG[currentLang].noSignal || 'No clear signal detected. Try again closer to the spoke.');
    if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
    if (audioContext) audioContext.close();
    audioContext = null;
    mediaStream = null;
    analyser = null;
    statusEl.textContent = `${LANG[currentLang].status}: ${LANG[currentLang].statusReady}`;
    measureBtn.disabled = false;
    return;
  }

  good.sort((a, b) => a - b);
  const trim = Math.floor(good.length * 0.15);
  const trimmed = good.slice(trim, good.length - trim || undefined);
  const freq = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  const variance = trimmed.reduce((a, x) => a + (x - freq) ** 2, 0) / trimmed.length;
  const stdev = Math.sqrt(variance);

  // --- Physical calculation ---
  const tensionN = materialDensity * area * Math.pow(2 * length * freq, 2) * calibration; // Newtons
  const tensionKgf = tensionN / 9.80665; // Convert to kgf

  document.getElementById('tension').textContent = tensionKgf.toFixed(1) + ' kgf';
  document.getElementById('freq').textContent = freq.toFixed(1) + ' Hz';
  document.getElementById('samples').textContent = good.length;
  document.getElementById('stdev').textContent = stdev.toFixed(1);

  // --- Close mic cleanly ---
  if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  mediaStream = null;
  analyser = null;

  // saveBtn.disabled = false;
  statusEl.textContent = `${LANG[currentLang].status}: ${LANG[currentLang].statusReady}`;

  history.unshift({
    freq: document.getElementById('freq').textContent,
    tension: document.getElementById('tension').textContent,
    material: materialSelect.options[materialSelect.selectedIndex].value,
    length: document.getElementById('length').value,
    diameter: document.getElementById('diameter').value,
    timestamp: new Date().toLocaleString()
  });

  if (history.length > 10) {
    history.pop();
  }

  localStorage.setItem(SPOKE_HISTORY_KEY, JSON.stringify(history));

  measureBtn.disabled = false;

  renderTable();
});

function renderTable() {
  tableBody.innerHTML = '';
  history.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="${LANG[currentLang].colFreq}">${row.freq}</td>
      <td data-label="${LANG[currentLang].colTension}">${row.tension}</td>
      <td data-label="${LANG[currentLang].colMaterial}">${LANG[currentLang][row.material]}</td>
      <td data-label="${LANG[currentLang].colLength}">${row.length}</td>
      <td data-label="${LANG[currentLang].colDiameter}">${row.diameter}</td>
      <td data-label="${LANG[currentLang].colTimestamp}">${row.timestamp}</td>
      <td data-label="${LANG[currentLang].colActions}">
        <button class="deleteRowBtn danger">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 11V17" stroke="currentColor" stroke-width="2" stroke-linecurrentcap="round" stroke-linejoin="round"></path>
            <path d="M14 11V17" stroke="currentColor" stroke-width="2" stroke-linecurrentcap="round" stroke-linejoin="round"></path>
            <path d="M4 7H20" stroke="currentColor" stroke-width="2" stroke-linecurrentcap="round" stroke-linejoin="round"></path>
            <path d="M6 7H12H18V18C18 19.6569 16.6569 21 15 21H9C7.34315 21 6 19.6569 6 18V7Z" stroke="currentColor" stroke-width="2" stroke-linecurrentcap="round" stroke-linejoin="round"></path>
            <path d="M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5V7H9V5Z" stroke="currentColor" stroke-width="2" stroke-linecurrentcap="round" stroke-linejoin="round"></path>
          </svg>
        </button>
      </td>
    `;
    tableBody.appendChild(tr);

    tr.querySelector('.deleteRowBtn').addEventListener('click', () => {
      history.splice(i, 1);
      localStorage.setItem(SPOKE_HISTORY_KEY, JSON.stringify(history));
      renderTable();
    });
  });
}

exportBtn.addEventListener('click', () => {
  if (!history.length) return;
  const csv = [
    [
      LANG[currentLang].colIndex,
      LANG[currentLang].colFreq,
      LANG[currentLang].colTension,
      LANG[currentLang].colMaterial,
      LANG[currentLang].colLength,
      LANG[currentLang].colDiameter,
      LANG[currentLang].colTimestamp
    ],
    ...history.map((r, i) => [i + 1, r.freq, r.tension, r.material, r.length, r.diameter, r.timestamp])
  ].map(r => r.join(',')).join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'spoke_measurements.csv';
  a.click();
  URL.revokeObjectURL(url);
});

clearBtn.addEventListener('click', () => {
  history = [];
  localStorage.setItem(SPOKE_HISTORY_KEY, JSON.stringify(history));
  renderTable();
});

// --- Inicial setup ---
langSelect.value = currentLang;
setLanguage(currentLang);
