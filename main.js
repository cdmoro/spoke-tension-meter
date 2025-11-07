import { LANG } from './translations.js';

// --- Language setup ---
let currentLang = localStorage.getItem('spoke_lang') || 'en';

// --- Dark mode ---
let darkMode = localStorage.getItem('darkMode') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.documentElement.setAttribute('data-theme', darkMode);

// --- Elements ---
const measureBtn = document.getElementById('measureBtn');
const saveBtn = document.getElementById('saveBtn');
const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');
const savePresetBtn = document.getElementById('savePresetBtn');
const deletePresetBtn = document.getElementById('deletePresetBtn');
const langSelect = document.getElementById('langSelect');
const darkToggle = document.getElementById('darkModeToggle');
const statusEl = document.getElementById('status');
const presetSelect = document.getElementById('presetSelect');
const materialSelect = document.getElementById('material');

const freqLabel = document.getElementById('freqLabel');
const tensionLabel = document.getElementById('tensionLabel');
const samplesLabel = document.getElementById('samplesLabel');
const deviationLabel = document.getElementById('deviationLabel');
const presetsLabel = document.getElementById('presetsLabel');

const tableBody = document.getElementById('tableBody');

// --- Materials per language ---
const materials = {
  en: [
    { name: "Steel", density: 7850 },
    { name: "Titanium", density: 4500 },
    { name: "Aluminum", density: 2700 }
  ],
  es: [
    { name: "Acero", density: 7850 },
    { name: "Titanio", density: 4500 },
    { name: "Aluminio", density: 2700 }
  ]
};

// --- Presets ---
const PRESETS_KEY = 'spoke_presets';
function loadPresets(){
  const stored = JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]');
  presetSelect.innerHTML = '';
  stored.forEach((p, i)=>{
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = p.name;
    presetSelect.appendChild(opt);
  });
  return stored;
}
let presets = loadPresets();

// --- Language & Materials ---
function loadMaterials(lang){
  materialSelect.innerHTML = '';
  materials[lang].forEach(m => {
    const option = document.createElement('option');
    option.value = m.density;
    option.textContent = `${m.name} (${m.density} kg/m³)`;
    materialSelect.appendChild(option);
  });
}

function setLanguage(lang){
  measureBtn.textContent = LANG[lang].measure;
  saveBtn.textContent = LANG[lang].save;
  exportBtn.textContent = LANG[lang].export;
  clearBtn.textContent = LANG[lang].clearTable;
  savePresetBtn.textContent = LANG[lang].savePreset;
  deletePresetBtn.textContent = LANG[lang].deletePreset;
  freqLabel.textContent = LANG[lang].freq;
  tensionLabel.textContent = LANG[lang].tension;
  samplesLabel.textContent = LANG[lang].samples;
  deviationLabel.textContent = LANG[lang].deviation;
  presetsLabel.textContent = LANG[lang].presets;
  document.querySelector('label[for="material"]').textContent = LANG[lang].material;

  // Update table headers
  const ths = document.querySelectorAll('#tableHead th');
  if(ths.length >= 8){
    ths[0].textContent = LANG[lang].colIndex;
    ths[1].textContent = LANG[lang].colFreq;
    ths[2].textContent = LANG[lang].colTension;
    ths[3].textContent = LANG[lang].colMaterial;
    ths[4].textContent = LANG[lang].colLength;
    ths[5].textContent = LANG[lang].colDiameter;
    ths[6].textContent = LANG[lang].colTimestamp;
    ths[7].textContent = LANG[lang].colActions;
  }

  statusEl.textContent = `Status: ${LANG[lang].statusReady}`;
  loadMaterials(lang);
  langSelect.value = lang;
}

// --- Event listeners ---
langSelect.addEventListener('change', e=>{
  currentLang = e.target.value;
  localStorage.setItem('spoke_lang', currentLang);
  setLanguage(currentLang);
});

darkToggle.addEventListener('click', ()=>{
  darkMode = darkMode==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme', darkMode);
  localStorage.setItem('darkMode', darkMode);
});

// --- Presets ---
savePresetBtn.addEventListener('click', ()=>{
  const name = prompt(LANG[currentLang].promptPresetName);
  if(!name) return;
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

deletePresetBtn.addEventListener('click', ()=>{
  const idx = presetSelect.value;
  if(idx === null || idx === undefined) return;
  presets.splice(idx,1);
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  presets = loadPresets();
});

// --- Preset select change ---
presetSelect.addEventListener('change', e=>{
  const preset = presets[e.target.value];
  if(!preset) return;
  document.getElementById('length').value = preset.length;
  document.getElementById('diameter').value = preset.diameter;
  document.getElementById('duration').value = preset.duration;
  document.getElementById('calibration').value = preset.calibration;
  materialSelect.value = preset.material;
});

// --- Audio measurement ---
let audioContext, mediaStream, analyser;
let samples = [];

async function initMic(){
  if(!audioContext){
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    mediaStream = await navigator.mediaDevices.getUserMedia({audio:true});
    const source = audioContext.createMediaStreamSource(mediaStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
  }
}

function getFrequency(){
  const bufferLength = analyser.fftSize;
  const dataArray = new Float32Array(bufferLength);
  analyser.getFloatTimeDomainData(dataArray);
  let crossings = 0;
  for(let i=1;i<bufferLength;i++){
    if((dataArray[i-1]<0 && dataArray[i]>=0)||(dataArray[i-1]>0 && dataArray[i]<=0)) crossings++;
  }
  return crossings * audioContext.sampleRate / (2*bufferLength);
}

measureBtn.addEventListener('click', async ()=>{
  statusEl.textContent = `Status: ${LANG[currentLang].statusRecording}`;
  await initMic();
  samples = [];

  const duration = parseFloat(document.getElementById('duration').value) || 3;
  const calibration = parseFloat(document.getElementById('calibration').value) || 1.0;
  const materialDensity = parseFloat(materialSelect.value) || 7850;
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
    statusEl.textContent = `Status: ${LANG[currentLang].statusReady}`;
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

  document.getElementById('freq').textContent = freq.toFixed(1) + ' Hz';
  document.getElementById('tension').textContent = tensionKgf.toFixed(1) + ' kgf';
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

  saveBtn.disabled = false;
  statusEl.textContent = `Status: ${LANG[currentLang].statusReady}`;
});

// --- Table & Save ---
let tableData = [];

function renderTable(){
  tableBody.innerHTML='';
  tableData.forEach((row,i)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="${LANG[currentLang].colIndex}">${i+1}</td>
      <td data-label="${LANG[currentLang].colFreq}">${row.freq}</td>
      <td data-label="${LANG[currentLang].colTension}">${row.tension}</td>
      <td data-label="${LANG[currentLang].colMaterial}">${row.material}</td>
      <td data-label="${LANG[currentLang].colLength}">${row.length}</td>
      <td data-label="${LANG[currentLang].colDiameter}">${row.diameter}</td>
      <td data-label="${LANG[currentLang].colTimestamp}">${row.timestamp}</td>
      <td data-label="${LANG[currentLang].colActions}">
        <button class="deleteRowBtn">${LANG[currentLang].delete}</button>
      </td>
    `;
    tableBody.appendChild(tr);

    tr.querySelector('.deleteRowBtn').addEventListener('click', ()=>{
      tableData.splice(i,1);
      renderTable();
    });
  });
}

saveBtn.addEventListener('click', ()=>{
  tableData.push({
    freq: document.getElementById('freq').textContent,
    tension: document.getElementById('tension').textContent,
    material: materialSelect.options[materialSelect.selectedIndex].text,
    length: document.getElementById('length').value,
    diameter: document.getElementById('diameter').value,
    timestamp: new Date().toLocaleString()
  });
  renderTable();

  // Clear measurement results
  document.getElementById('freq').textContent = '';
  document.getElementById('tension').textContent = '';
  document.getElementById('samples').textContent = '';
  document.getElementById('stdev').textContent = '';
  saveBtn.disabled = true;
});

exportBtn.addEventListener('click', ()=>{
  if(!tableData.length) return;
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
    ...tableData.map((r,i)=>[i+1,r.freq,r.tension,r.material,r.length,r.diameter,r.timestamp])
  ].map(r=>r.join(',')).join('\n');

  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url;
  a.download='spoke_measurements.csv';
  a.click();
  URL.revokeObjectURL(url);
});

clearBtn.addEventListener('click', ()=>{
  tableData=[];
  renderTable();
});

// --- Inicial setup ---
langSelect.value = currentLang;
setLanguage(currentLang);
