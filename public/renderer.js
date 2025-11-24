const systemChip = document.getElementById('system-chip');
const systemStateChip = document.getElementById('system-state-chip');
const memoryMeter = document.getElementById('memory-meter');
const cpuMeter = document.getElementById('cpu-meter');
const clockChip = document.getElementById('clock-chip');
const quickActionsContainer = document.getElementById('quick-actions');
const featureCardsContainer = document.getElementById('feature-cards');

const quickActions = [
  { id: 'record', label: 'クイック録音', detail: '30秒メモ', icon: '🎙️', active: false, position: { x: 0, y: 0 } },
  { id: 'focus', label: 'フォーカス 25:00', detail: '集中モード', icon: '⏱️', active: true, position: { x: 0, y: 50 } },
  { id: 'share', label: 'ステータス共有', detail: 'チームに公開', icon: '📡', active: false, position: { x: 0, y: 100 } },
];

// グローバル変数を関数外に移動
let currentDraggingElement = null;
let currentDraggingAction = null;
let startX, startY, initialX, initialY;
let recordingTimerId = null;
let recordingStartedAt = null;

const formatDuration = (ms) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const renderQuickActions = () => {
  quickActionsContainer.innerHTML = '';
  quickActions.forEach((action) => {
    const row = document.createElement('div');
    row.className = 'quick-action';
    row.dataset.action = action.id;
    row.style.left = `${action.position.x}px`;
    row.style.top = `${action.position.y}px`;
    
    const handleMouseDown = (e) => {
      if (e.button === 0 && !currentDraggingElement) { // 左クリックのみ、かつ他の要素がドラッグ中でない
        currentDraggingElement = row;
        currentDraggingAction = action;
        startX = e.clientX;
        startY = e.clientY;
        initialX = action.position.x;
        initialY = action.position.y;
        row.classList.add('dragging');
        e.preventDefault();
      }
    };
    
    // ダブルクリックでトグル
    const handleDoubleClick = () => {
      toggleAction(action.id);
    };
    
    row.addEventListener('mousedown', handleMouseDown);
    row.addEventListener('dblclick', handleDoubleClick);

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

const renderFeatureCards = () => {
  featureCardsContainer.innerHTML = '';
  const activeActions = quickActions.filter((action) => action.active);

  activeActions.forEach((action) => {
    if (action.id === 'record') {
      featureCardsContainer.appendChild(buildRecordingCard(action));
      return;
    }

    const card = document.createElement('div');
    card.className = 'feature-card';

    const header = document.createElement('div');
    header.className = 'feature-header';
    const title = document.createElement('div');
    title.className = 'feature-title';
    title.innerHTML = `<strong>${action.label}</strong><span class="feature-desc">${action.detail}</span>`;
    const chip = document.createElement('span');
    chip.className = 'chip tiny';
    chip.textContent = 'RUNNING';
    header.append(title, chip);

    const desc = document.createElement('div');
    desc.className = 'feature-desc';
    desc.textContent = action.id === 'focus'
      ? '集中タイマーが進行中です。通知は抑制されています。'
      : '共有ステータスを送信しています。';

    const actions = document.createElement('div');
    actions.className = 'feature-actions';
    const stopBtn = document.createElement('button');
    stopBtn.className = 'ghost';
    stopBtn.textContent = '停止';
    stopBtn.addEventListener('click', () => toggleAction(action.id));
    actions.append(stopBtn);

    card.append(header, desc, actions);
    featureCardsContainer.appendChild(card);
  });
};

const setActionActive = (id, active) => {
  const action = quickActions.find((item) => item.id === id);
  if (!action) return;
  action.active = active;
};

const buildRecordingCard = (action) => {
  const card = document.createElement('div');
  card.className = 'feature-card';

  const header = document.createElement('div');
  header.className = 'feature-header';
  const title = document.createElement('div');
  title.className = 'feature-title';
  title.innerHTML = `<strong>${action.label}</strong><span class="feature-desc">音声メモを収集中</span>`;
  const chip = document.createElement('span');
  chip.className = 'chip tiny';
  chip.textContent = 'REC';
  header.append(title, chip);

  const row = document.createElement('div');
  row.className = 'recording-row';
  const timer = document.createElement('div');
  timer.id = 'recording-timer';
  timer.className = 'recording-timer';
  timer.textContent = recordingStartedAt ? formatDuration(Date.now() - recordingStartedAt) : '00:00';
  const stop = document.createElement('button');
  stop.className = 'primary';
  stop.textContent = '停止';
  stop.addEventListener('click', stopRecording);
  row.append(timer, stop);

  const desc = document.createElement('div');
  desc.className = 'feature-desc';
  desc.textContent = '録音はカード内から停止できます。';

  card.append(header, row, desc);
  return card;
};

// グローバルイベントリスナーは一度だけ設定
const handleGlobalMouseMove = (e) => {
  if (!currentDraggingElement || !currentDraggingAction) return;
  
  const deltaX = e.clientX - startX;
  const deltaY = e.clientY - startY;
  
  const newX = initialX + deltaX;
  const newY = initialY + deltaY;
  
  const containerRect = quickActionsContainer.getBoundingClientRect();
  const rowRect = currentDraggingElement.getBoundingClientRect();
  const maxX = Math.max(0, containerRect.width - rowRect.width);
  const maxY = Math.max(0, containerRect.height - rowRect.height);
  const clampedX = Math.max(0, Math.min(newX, maxX));
  const clampedY = Math.max(0, Math.min(newY, maxY));

  currentDraggingAction.position.x = clampedX;
  currentDraggingAction.position.y = clampedY;
  currentDraggingElement.style.left = `${clampedX}px`;
  currentDraggingElement.style.top = `${clampedY}px`;
};

const handleGlobalMouseUp = () => {
  if (currentDraggingElement) {
    currentDraggingElement.classList.remove('dragging');
    savePositions();
    currentDraggingElement = null;
    currentDraggingAction = null;
  }
};

const updateRecordingTimer = () => {
  if (!recordingStartedAt) return;
  const timerEl = document.getElementById('recording-timer');
  if (!timerEl) return;
  timerEl.textContent = formatDuration(Date.now() - recordingStartedAt);
};

const startRecording = () => {
  recordingStartedAt = Date.now();
  setActionActive('record', true);
  renderQuickActions();
  renderFeatureCards();
  updateRecordingTimer();
  if (recordingTimerId) {
    clearInterval(recordingTimerId);
  }
  recordingTimerId = setInterval(updateRecordingTimer, 500);
};

const stopRecording = () => {
  if (recordingTimerId) {
    clearInterval(recordingTimerId);
    recordingTimerId = null;
  }
  recordingStartedAt = null;
  setActionActive('record', false);
  renderQuickActions();
  renderFeatureCards();
};

const toggleAction = (id) => {
  const action = quickActions.find((a) => a.id === id);
  if (!action) return;
  if (id === 'record') {
    if (action.active) {
      stopRecording();
    } else {
      startRecording();
    }
    return;
  }
  action.active = !action.active;
  renderQuickActions();
  renderFeatureCards();
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

const savePositions = () => {
  const positions = quickActions.reduce((acc, action) => {
    acc[action.id] = action.position;
    return acc;
  }, {});
  localStorage.setItem('quickActionsPositions', JSON.stringify(positions));
};

const loadPositions = () => {
  const saved = localStorage.getItem('quickActionsPositions');
  if (saved) {
    const positions = JSON.parse(saved);
    quickActions.forEach(action => {
      if (positions[action.id]) {
        action.position = positions[action.id];
      }
    });
  }
};

const boot = () => {
  loadPositions();
  renderQuickActions();
  renderFeatureCards();
  hydrateSystemInfo();
  updateClock();
  updateMeters();
  setInterval(updateClock, 30000);
  setInterval(updateMeters, 3500);
  
  // グローバルイベントリスナーは一度だけ登録
  document.addEventListener('mousemove', handleGlobalMouseMove);
  document.addEventListener('mouseup', handleGlobalMouseUp);
};

boot();
