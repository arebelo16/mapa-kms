/* Mapa de Kms — geração do mapa mensal com total fixo ajustado */

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const DEFAULTS = {
  nome: 'Andre Filipe Lamas Rebelo',
  categoria: 'Consultor',
  departamento: '',
  matricula: '74-SG-71',
  partida: 'Azeitão',
  destino: 'Lisboa',
  horaIda: '08:00',
  horaVolta: '19:00',
  descricao: 'Deslocação ao cliente ',
  valorAlvo: 600,
  taxa: 0.4
};

const STORAGE_KEY = 'kmsAppSettings';
const FIXED_FIELDS = ['nome', 'categoria', 'departamento', 'matricula', 'partida', 'destino', 'horaIda', 'horaVolta', 'descricao', 'valorAlvo', 'taxa'];

let state = {
  rows: [] // { date: Date, included: bool, kmUnits: int (milikm) }
};

// ---------- Feriados nacionais (Portugal) ----------

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function portugalHolidays(year) {
  const easter = easterSunday(year);
  const fixed = [
    [0, 1, "Ano Novo"],
    [3, 25, "Dia da Liberdade"],
    [4, 1, "Dia do Trabalhador"],
    [5, 10, "Dia de Portugal"],
    [7, 15, "Assunção de Nossa Senhora"],
    [9, 5, "Implantação da República"],
    [10, 1, "Todos os Santos"],
    [11, 1, "Restauração da Independência"],
    [11, 8, "Imaculada Conceição"],
    [11, 25, "Natal"]
  ];
  const map = new Map();
  fixed.forEach(([m, d, name]) => {
    map.set(dateKey(new Date(year, m, d)), name);
  });
  map.set(dateKey(addDays(easter, -2)), 'Sexta-Feira Santa');
  map.set(dateKey(easter), 'Páscoa');
  map.set(dateKey(addDays(easter, 60)), 'Corpo de Deus');
  return map;
}

function businessDaysInMonth(year, monthIndex0) {
  const holidays = portugalHolidays(year);
  const days = [];
  const excludedHolidays = [];
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, monthIndex0, d);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;
    const key = dateKey(date);
    if (holidays.has(key)) {
      excludedHolidays.push({ date, name: holidays.get(key) });
      continue;
    }
    days.push(date);
  }
  return { days, excludedHolidays };
}

// ---------- Distribuição exata dos kms ----------

function distributeKmUnits(n, totalKm, decimals = 3) {
  if (n <= 0) return [];
  const factor = 10 ** decimals;
  const totalUnits = Math.round(totalKm * factor);
  const base = Math.floor(totalUnits / n);
  const remainder = totalUnits - base * n;
  const units = new Array(n).fill(base);
  for (let i = 0; i < remainder; i++) {
    units[n - 1 - i] += 1;
  }
  return units;
}

function recomputeDistribution() {
  const totalKm = parseFloat(document.getElementById('valorAlvo').value) / parseFloat(document.getElementById('taxa').value);
  const includedIdx = state.rows.map((r, i) => i).filter(i => state.rows[i].included);
  const units = distributeKmUnits(includedIdx.length, totalKm);
  state.rows.forEach(r => { r.kmUnits = 0; });
  includedIdx.forEach((rowIdx, k) => {
    state.rows[rowIdx].kmUnits = units[k];
  });
}

// ---------- Persistência ----------

function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (e) { saved = {}; }
  const merged = { ...DEFAULTS, ...saved };
  document.getElementById('nome').value = merged.nome;
  document.getElementById('categoria').value = merged.categoria;
  document.getElementById('departamento').value = merged.departamento;
  document.getElementById('matricula').value = merged.matricula;
  document.getElementById('partida').value = merged.partida;
  document.getElementById('destino').value = merged.destino;
  document.getElementById('horaIda').value = merged.horaIda;
  document.getElementById('horaVolta').value = merged.horaVolta;
  document.getElementById('descricao').value = merged.descricao;
  document.getElementById('valorAlvo').value = merged.valorAlvo;
  document.getElementById('taxa').value = merged.taxa;
}

function saveSettings() {
  const data = {};
  FIXED_FIELDS.forEach(f => { data[f] = document.getElementById(f).value; });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ---------- UI ----------

function populateMonthSelect() {
  const sel = document.getElementById('mes');
  MESES.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = m;
    sel.appendChild(opt);
  });
  const now = new Date();
  sel.value = now.getMonth();
  document.getElementById('ano').value = now.getFullYear();
}

function fmtDatePT(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function renderPreview() {
  const tbody = document.getElementById('preview-body');
  tbody.innerHTML = '';
  const horaIda = document.getElementById('horaIda').value;
  const horaVolta = document.getElementById('horaVolta').value;
  const partida = document.getElementById('partida').value.trim();
  const destino = document.getElementById('destino').value.trim();
  const trajeto = `${partida}-${destino}-${partida}`;

  state.rows.forEach((row, idx) => {
    const tr = document.createElement('tr');
    if (!row.included) tr.classList.add('excluded');
    const kmStr = row.included ? (row.kmUnits / 1000).toFixed(3) : '—';
    tr.innerHTML = `
      <td><input type="checkbox" data-idx="${idx}" ${row.included ? 'checked' : ''}></td>
      <td>${DIAS_SEMANA[row.date.getDay()]}</td>
      <td>${fmtDatePT(row.date)}</td>
      <td>${horaIda}</td>
      <td>${fmtDatePT(row.date)}</td>
      <td>${horaVolta}</td>
      <td class="km-cell">${kmStr}</td>
      <td>${trajeto}</td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      state.rows[idx].included = e.target.checked;
      recomputeDistribution();
      renderPreview();
    });
  });

  updateTotals();
}

function updateTotals() {
  const taxa = parseFloat(document.getElementById('taxa').value) || 0;
  const totalUnits = state.rows.filter(r => r.included).reduce((s, r) => s + r.kmUnits, 0);
  const totalKm = totalUnits / 1000;
  const totalValor = totalKm * taxa;
  document.getElementById('total-kms').textContent = totalKm.toLocaleString('pt-PT', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  document.getElementById('total-valor').textContent = totalValor.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
}

function gerarPreview() {
  saveSettings();
  const year = parseInt(document.getElementById('ano').value, 10);
  const month = parseInt(document.getElementById('mes').value, 10);
  const { days, excludedHolidays } = businessDaysInMonth(year, month);

  state.rows = days.map(d => ({ date: d, included: true, kmUnits: 0 }));
  recomputeDistribution();

  const noteEl = document.getElementById('holiday-note');
  if (excludedHolidays.length) {
    noteEl.textContent = 'Feriados excluídos automaticamente: ' +
      excludedHolidays.map(h => `${fmtDatePT(h.date)} (${h.name})`).join(', ');
  } else {
    noteEl.textContent = 'Sem feriados neste mês.';
  }

  document.getElementById('preview-card').hidden = false;
  document.getElementById('export-status').textContent = '';
  renderPreview();
  document.getElementById('preview-card').scrollIntoView({ behavior: 'smooth' });
}

// ---------- Export para Excel (a partir do template) ----------

// Excel/ExcelJS serializes dates using UTC components. Building these with
// local-time Date constructors is unsafe: for historical dates (e.g. the
// 1899-12-30 time anchor) some timezones (incl. Europe/Lisbon pre-1912) use
// non-whole-hour LMT offsets, which silently shifts the date and time by a
// few minutes/hours. Always construct with Date.UTC to sidestep this.
function timeToDate(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return new Date(Date.UTC(1899, 11, 30, h, m, 0));
}

function dateOnlyUTC(year, month, day) {
  return new Date(Date.UTC(year, month, day));
}

async function exportarExcel() {
  const statusEl = document.getElementById('export-status');
  statusEl.textContent = 'A gerar ficheiro...';
  try {
    const resp = await fetch('assets/template.xlsx');
    const buffer = await resp.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const ws = workbook.getWorksheet('Mapa de KMS');

    const nome = document.getElementById('nome').value;
    const categoria = document.getElementById('categoria').value;
    const departamento = document.getElementById('departamento').value;
    const matricula = document.getElementById('matricula').value;
    const descricao = document.getElementById('descricao').value;
    const partida = document.getElementById('partida').value.trim();
    const destino = document.getElementById('destino').value.trim();
    const trajeto = `${partida}-${destino}-${partida}`;
    const horaIda = document.getElementById('horaIda').value;
    const horaVolta = document.getElementById('horaVolta').value;
    const taxa = parseFloat(document.getElementById('taxa').value);
    const year = parseInt(document.getElementById('ano').value, 10);
    const month = parseInt(document.getElementById('mes').value, 10);
    const mesNome = MESES[month];

    ws.getCell('B2').value = nome;
    ws.getCell('E2').value = categoria;
    ws.getCell('B3').value = departamento;
    ws.getCell('E3').value = matricula;
    ws.getCell('I2').value = `Mês: ${mesNome}`;
    ws.getCell('D49').value = taxa;
    const today = new Date();
    ws.getCell('G50').value = dateOnlyUTC(today.getFullYear(), today.getMonth(), today.getDate());
    ws.getCell('G50').numFmt = 'dd/mm/yyyy';

    const includedRows = state.rows.filter(r => r.included);
    const FIRST_ROW = 8;
    const LAST_ROW = 35;
    const maxDays = LAST_ROW - FIRST_ROW + 1;
    if (includedRows.length > maxDays) {
      throw new Error(`Demasiados dias selecionados (${includedRows.length}). Máximo suportado: ${maxDays}.`);
    }

    includedRows.forEach((row, i) => {
      const r = FIRST_ROW + i;
      const dateOnly = dateOnlyUTC(row.date.getFullYear(), row.date.getMonth(), row.date.getDate());
      ws.getCell(`B${r}`).value = descricao;
      ws.getCell(`C${r}`).value = dateOnly;
      ws.getCell(`C${r}`).numFmt = 'dd/mm/yyyy';
      ws.getCell(`D${r}`).value = timeToDate(horaIda);
      ws.getCell(`D${r}`).numFmt = 'hh:mm';
      ws.getCell(`E${r}`).value = dateOnly;
      ws.getCell(`E${r}`).numFmt = 'dd/mm/yyyy';
      ws.getCell(`F${r}`).value = timeToDate(horaVolta);
      ws.getCell(`F${r}`).numFmt = 'hh:mm';
      ws.getCell(`H${r}`).value = row.kmUnits / 1000;
      ws.getCell(`I${r}`).value = trajeto;
    });

    const outBuffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HN -Mapa de Kms ${year} ${mesNome}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    statusEl.textContent = `Exportado: HN -Mapa de Kms ${year} ${mesNome}.xlsx`;
  } catch (err) {
    console.error(err);
    statusEl.style.color = '#c62828';
    statusEl.textContent = 'Erro ao exportar: ' + err.message;
  }
}

// ---------- Init ----------

window.addEventListener('DOMContentLoaded', () => {
  populateMonthSelect();
  loadSettings();
  document.getElementById('btn-preview').addEventListener('click', gerarPreview);
  document.getElementById('btn-export').addEventListener('click', exportarExcel);
  FIXED_FIELDS.forEach(f => {
    document.getElementById(f).addEventListener('change', saveSettings);
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
});
