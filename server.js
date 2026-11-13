const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Изначальное состояние
let state = {
  memory: Array(16).fill(null).map(() => Array(8).fill(0)),
  mode: 'LOAD',
  stepMode: true,
  pc: 0,
  registers: { R0: 0, R1: 0, R2: 0, R3: 0, Q: 0 },
  flags: { Z: 0, F3: 0, OVR: 0, C4: 0 },
  outputY: 0
};

// --- Логика эмуляции ---
function decodeMicrocode(tetrads) {
  const D = tetrads[0], B = tetrads[1], A = tetrads[2];
  const C0_I5_I3 = tetrads[3], S0_I2_I0 = tetrads[4], S1_I8_I6 = tetrads[5];
  const P = tetrads[6], R = tetrads[7];
  const C0 = (C0_I5_I3 >> 3) & 1;
  const aluOp = ((C0_I5_I3 >> 2) & 1) << 2 | ((C0_I5_I3 >> 1) & 1) << 1 | (C0_I5_I3 & 1);
  const srcCode = ((S0_I2_I0 >> 2) & 1) << 2 | ((S0_I2_I0 >> 1) & 1) << 1 | (S0_I2_I0 & 1);
  const dstCode = ((S1_I8_I6 >> 2) & 1) << 2 | ((S1_I8_I6 >> 1) & 1) << 1 | (S1_I8_I6 & 1);
  return { D, B, A, C0, aluOp, srcCode, dstCode, P, R };
}

function selectOperands(srcCode, D, A, B, Q) {
  const getReg = (addr) => [state.registers.R0, state.registers.R1, state.registers.R2, state.registers.R3][addr] || 0;
  let R, S;
  switch (srcCode) {
    case 0: R = getReg(A); S = Q; break;
    case 1: R = getReg(A); S = getReg(B); break;
    case 2: R = 0; S = Q; break;
    case 3: R = 0; S = getReg(B); break;
    case 4: R = 0; S = getReg(A); break;
    case 5: R = D; S = getReg(A); break;
    case 6: R = D; S = Q; break;
    case 7: R = D; S = 0; break;
    default: R = 0; S = 0;
  }
  return { R, S };
}

function aluOperation(op, R, S, C0) {
  let F = 0, C4 = 0, OVR = 0;
  switch (op) {
    case 0: F = (R + S + C0) & 0xF; C4 = (R + S + C0) > 15 ? 1 : 0; break;
    case 1: F = (S - R - 1 + C0) & 0xF; C4 = (S - R - 1 + C0) < 0 ? 1 : 0; break;
    case 2: F = (R - S - 1 + C0) & 0xF; C4 = (R - S - 1 + C0) < 0 ? 1 : 0; break;
    case 3: F = R | S; break;
    case 4: F = R & S; break;
    case 5: F = (~R & S) & 0xF; break;
    case 6: F = R ^ S; break;
    case 7: F = (~(R ^ S)) & 0xF; break;
  }
  const Z = F === 0 ? 1 : 0;
  const F3 = (F >> 3) & 1;
  if (op === 0) OVR = (((R >> 3) & 1) === ((S >> 3) & 1) && ((R >> 3) & 1) !== F3) ? 1 : 0;
  return { F, C4, OVR, Z, F3 };
}

function executeStep() {
  const tetrads = state.memory[state.pc];
  if (!tetrads || tetrads.every(v => v === 0)) {
    state.pc = (state.pc + 1) % 16;
    return;
  }
  const mc = decodeMicrocode(tetrads);
  const { R, S } = selectOperands(mc.srcCode, mc.D, mc.A, mc.B, state.registers.Q);
  const { F, C4, OVR, Z, F3 } = aluOperation(mc.aluOp, R, S, mc.C0);
  state.flags = { Z, F3, OVR, C4 };
  const regMap = ['R0', 'R1', 'R2', 'R3'];
  if (mc.dstCode === 0 || mc.dstCode === 2) state.registers.Q = F;
  if (mc.dstCode === 1 || mc.dstCode === 3) if (mc.B < 4) state.registers[regMap[mc.B]] = F;
  if (mc.dstCode === 4 || mc.dstCode === 5) {
    if (mc.B < 4) state.registers[regMap[mc.B]] = F >> 1;
    state.registers.Q = state.registers.Q >> 1;
  }
  if (mc.dstCode === 6 || mc.dstCode === 7) {
    if (mc.B < 4) state.registers[regMap[mc.B]] = (F << 1) & 0xF;
    state.registers.Q = (state.registers.Q << 1) & 0xF;
  }
  state.outputY = F;
  let nextPc = state.pc + 1;
  const P = mc.P;
  if (P === 0x0 && Z === 0) nextPc = mc.R;
  else if (P === 0x1) nextPc = mc.R;
  else if (P === 0xC && Z === 1) nextPc = mc.R;
  state.pc = nextPc % 16;
}

// --- API Маршруты ---
app.get('/api/state', (req, res) => res.json(state));

app.post('/api/load', (req, res) => {
  const { address, tetrad, value } = req.body;
  if (address >= 0 && address < 16 && tetrad >= 0 && tetrad < 8) {
    state.memory[address][tetrad] = value;
  }
  res.json({ success: true, state });
});

app.post('/api/mode', (req, res) => {
  state.mode = req.body.mode;
  res.json({ success: true, state });
});

app.post('/api/stepmode', (req, res) => {
  state.stepMode = req.body.stepMode;
  res.json({ success: true, state });
});

app.post('/api/step', (req, res) => {
  executeStep();
  res.json({ state });
});

app.post('/api/run', (req, res) => {
  const steps = req.body.steps || 10;
  for (let i = 0; i < steps; i++) executeStep();
  res.json({ state });
});

app.post('/api/reset', (req, res) => {
  state.memory = Array(16).fill(null).map(() => Array(8).fill(0));
  state.mode = 'LOAD'; // Сбрасываем режим
  state.stepMode = true;
  state.registers = { R0: 0, R1: 0, R2: 0, R3: 0, Q: 0 };
  state.flags = { Z: 0, F3: 0, OVR: 0, C4: 0 };
  state.pc = 0;
  state.outputY = 0;
  res.json({ success: true, state });
});

app.post('/api/load-demo', (req, res) => {
  const demo = [
    [0x0, 0x0, 0x0, 0x3, 0x7, 0x3, 0x2, 0x0], 
    [0x8, 0x1, 0x0, 0x3, 0x7, 0x3, 0x2, 0x0], 
    [0x0, 0x2, 0x0, 0x3, 0x7, 0x3, 0x2, 0x0], 
    [0x4, 0x3, 0x0, 0x3, 0x7, 0x3, 0x2, 0x0], 
    [0x0, 0x4, 0x2, 0x0, 0x1, 0x3, 0x2, 0x0], 
    [0x0, 0x5, 0x3, 0x0, 0x1, 0x3, 0x2, 0x0], 
    [0x0, 0x0, 0x4, 0x3, 0x3, 0x1, 0x2, 0x0],
    [0x0, 0x0, 0x5, 0x3, 0x3, 0x1, 0x0, 0x0]
  ];
  for (let i = 0; i < 16; i++) state.memory[i] = i < demo.length ? demo[i] : Array(8).fill(0);
  state.pc = 0;
  state.registers = { R0: 0, R1: 0, R2: 0, R3: 0, Q: 0 };
  state.flags = { Z: 0, F3: 0, OVR: 0, C4: 0 };
  state.outputY = 0;
  res.json({ success: true, state });
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});