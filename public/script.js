const API_URL = '/api'; // Относительный путь (работает всегда на localhost)

let state = {
  memory: Array(16).fill(null).map(() => Array(8).fill(0)),
  pc: 0,
  registers: { R0: 0, R1: 0, R2: 0, R3: 0, Q: 0 },
  flags: { Z: 0, F3: 0, OVR: 0, C4: 0 },
  outputY: 0,
  mode: 'LOAD',
  stepMode: true
};

const demoActions = {
  0: "0 → R0 (Low A)", 1: "8 → R1 (High A)",
  2: "0 → R2 (Low B)", 3: "4 → R3 (High B)",
  4: "R0+R2 → R4 (Low)", 5: "R1+R3 → R5 (High)",
  6: "Чтение R4", 7: "Чтение R5, конец"
};

function getSwitchVal(bits) {
  let val = 0;
  bits.forEach((id, i) => {
    const el = document.getElementById(id);
    if (el && el.checked) val |= (1 << i);
  });
  return val;
}

function setLeds(prefix, value) {
  for (let i = 0; i < 4; i++) {
    const bit = (value >> i) & 1;
    const led = document.getElementById(`led-${prefix}-${i}`);
    if (led) led.classList.toggle('on', bit === 1);
  }
}

async function fetchState() {
  try {
    const res = await fetch(`${API_URL}/state`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    state = await res.json();
    updateUI();
  } catch (e) { 
    console.error('Ошибка загрузки состояния:', e); 
  }
}

async function apiCall(endpoint, method = 'POST', body = null) {
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : null
    });
    const data = await res.json();
    if (data.state) {
      state = data.state;
      updateUI();
    }
  } catch (e) { 
    console.error(`Ошибка при запросе к ${endpoint}:`, e); 
  }
}

function updateUI() {
  const tbody = document.getElementById('memory-body');
  if (!tbody) return;

  tbody.innerHTML = '';
  for (let addr = 0; addr < 16; addr++) {
    const tr = document.createElement('tr');
    if (addr === state.pc) tr.classList.add('active-row');
    
    let actionText = demoActions[addr] || "";
    let rowHtml = `<td>${addr.toString(2).padStart(4, '0')}</td>`;
    
    if (state.memory && state.memory[addr]) {
      for (let t = 0; t < 8; t++) {
        rowHtml += `<td>${state.memory[addr][t].toString(2).padStart(4, '0')}</td>`;
      }
    } else {
      for (let t = 0; t < 8; t++) rowHtml += `<td>0000</td>`;
    }
    rowHtml += `<td>${actionText}</td>`;
    tr.innerHTML = rowHtml;
    tbody.appendChild(tr);
  }

  const dataVal = getSwitchVal(['sa4', 'sa5', 'sa6', 'sa7']);
  setLeds('data', dataVal);

  const muxVal = getSwitchVal(['sa1', 'sa2', 'sa3']);
  const mcVal = (state.memory && state.memory[state.pc]) ? state.memory[state.pc][muxVal] : 0;
  setLeds('mc', mcVal);

  const addrVal = getSwitchVal(['sa8', 'sa9', 'sa10', 'sa11']);
  const memVal = (state.memory && state.memory[addrVal]) ? state.memory[addrVal][muxVal] : 0;
  setLeds('mem', memVal);

  document.getElementById('sa12-load')?.classList.toggle('active', state.mode === 'LOAD');
  document.getElementById('sa12-run')?.classList.toggle('active', state.mode === 'RUN');
}

document.addEventListener('DOMContentLoaded', () => {
  fetchState();

  ['sa1','sa2','sa3','sa4','sa5','sa6','sa7','sa8','sa9','sa10','sa11'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', updateUI);
  });

  document.getElementById('sa12-load')?.addEventListener('click', () => apiCall('/mode', 'POST', { mode: 'LOAD' }));
  document.getElementById('sa12-run')?.addEventListener('click', () => apiCall('/mode', 'POST', { mode: 'RUN' }));

  document.getElementById('sa13-step')?.addEventListener('click', (e) => {
    e.target.classList.add('active');
    document.getElementById('sa13-auto')?.classList.remove('active');
    apiCall('/stepmode', 'POST', { stepMode: true });
  });
  document.getElementById('sa13-auto')?.addEventListener('click', (e) => {
    e.target.classList.add('active');
    document.getElementById('sa13-step')?.classList.remove('active');
    apiCall('/stepmode', 'POST', { stepMode: false });
  });

  document.getElementById('sa14-int')?.addEventListener('click', (e) => {
    e.target.classList.add('active');
    document.getElementById('sa14-ext')?.classList.remove('active');
  });
  document.getElementById('sa14-ext')?.addEventListener('click', (e) => {
    e.target.classList.add('active');
    document.getElementById('sa14-int')?.classList.remove('active');
  });

  document.getElementById('btn-load')?.addEventListener('click', () => {
    if (state.mode !== 'LOAD') return alert('Переключите режим в ЗАГРУЗКА');
    const address = getSwitchVal(['sa8', 'sa9', 'sa10', 'sa11']);
    const tetrad = getSwitchVal(['sa1', 'sa2', 'sa3']);
    const value = getSwitchVal(['sa4', 'sa5', 'sa6', 'sa7']);
    apiCall('/load', 'POST', { address, tetrad, value });
  });

  document.getElementById('btn-start')?.addEventListener('click', () => {
    if (state.mode !== 'RUN') return alert('Переключите режим в РАБОТА');
    if (state.stepMode) {
      apiCall('/step');
    } else {
      apiCall('/run', 'POST', { steps: 10 });
    }
  });

  document.getElementById('btn-demo')?.addEventListener('click', () => apiCall('/load-demo'));
  document.getElementById('btn-reset')?.addEventListener('click', () => apiCall('/reset'));
});