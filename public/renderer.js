const systemChip = document.getElementById('system-chip');
const systemStateChip = document.getElementById('system-state-chip');
const memoryMeter = document.getElementById('memory-meter');
const cpuMeter = document.getElementById('cpu-meter');
const clockChip = document.getElementById('clock-chip');
const quickActionsContainer = document.getElementById('quick-actions');

const quickActions = [
  { id: 'record', label: 'クイック録音', detail: '30秒メモ', icon: '🎙️', active: false },
  { id: 'focus', label: 'フォーカス 25:00', detail: '集中モード', icon: '⏱️', active: true },
  { id: 'share', label: 'ステータス共有', detail: 'チームに公開', icon: '📡', active: false },
];

const renderQuickActions = () => {
  quickActionsContainer.innerHTML = '';
  quickActions.forEach((action) => {
    const row = document.createElement('div');
    row.className = 'quick-action';
    row.dataset.action = action.id;
    row.addEventListener('click', () => toggleAction(action.id));

    const label = document.createElement('div');
    label.className = 'quick-label';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = action.active ? '#34d399' : '#a78bfa';
    const text = document.createElement('div');
    text.innerHTML = `<strong>${action.icon} ${action.label}</strong><div class="mono">${action.detail}</div>`;
    label.append(dot, text);

    const status = document.createElement('span');
    status.className = 'chip tiny';
    status.textContent = action.active ? 'ON' : 'OFF';

    row.append(label, status);
    quickActionsContainer.appendChild(row);
  });
};

const toggleAction = (id) => {
  const action = quickActions.find((a) => a.id === id);
  if (!action) return;
  action.active = !action.active;
  renderQuickActions();
};

const updateClock = () => {
  const nowIso = window.desktopBridge?.getNowIso() ?? new Date().toISOString();
  const now = new Date(nowIso);
  const formatted = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  clockChip.textContent = formatted;
};

const hydrateSystemInfo = () => {
  const info = window.desktopBridge?.getSystemInfo?.();
  if (!info) {
    systemChip.textContent = 'mock system';
    return;
  }
  systemChip.textContent = `${info.user} · ${info.platform} ${info.release}`;
};

const updateMeters = () => {
  const mem = 35 + Math.random() * 35;
  const cpu = 18 + Math.random() * 40;
  memoryMeter.style.width = `${mem.toFixed(0)}%`;
  cpuMeter.style.width = `${cpu.toFixed(0)}%`;
  systemStateChip.textContent = mem > 60 || cpu > 50 ? '調整中' : '安定';
};

const boot = () => {
  renderQuickActions();
  hydrateSystemInfo();
  updateClock();
  updateMeters();
  setInterval(updateClock, 30000);
  setInterval(updateMeters, 3500);
};

boot();
