const systemChip = document.getElementById('system-chip');
const systemStateChip = document.getElementById('system-state-chip');
const memoryMeter = document.getElementById('memory-meter');
const cpuMeter = document.getElementById('cpu-meter');
const clockChip = document.getElementById('clock-chip');
const quickActionsContainer = document.getElementById('quick-actions');

const quickActions = [
  { id: 'record', label: 'クイック録音', detail: '30秒メモ', icon: '🎙️', active: false, position: { x: 0, y: 0 } },
  { id: 'focus', label: 'フォーカス 25:00', detail: '集中モード', icon: '⏱️', active: true, position: { x: 0, y: 50 } },
  { id: 'share', label: 'ステータス共有', detail: 'チームに公開', icon: '📡', active: false, position: { x: 0, y: 100 } },
];

const QUICK_ACTION_CANVAS_MIN_HEIGHT = 220;
const QUICK_ACTION_CANVAS_PADDING = 20;

const getQuickActionsCanvasHeight = () => {
  const inlineHeight = parseFloat(quickActionsContainer.style.height || '');
  if (!Number.isNaN(inlineHeight)) {
    return inlineHeight;
  }
  return quickActionsContainer.getBoundingClientRect().height || QUICK_ACTION_CANVAS_MIN_HEIGHT;
};

const ensureCanvasHeightForBottom = (bottom) => {
  const targetHeight = Math.max(QUICK_ACTION_CANVAS_MIN_HEIGHT, bottom + QUICK_ACTION_CANVAS_PADDING);
  if (targetHeight > getQuickActionsCanvasHeight()) {
    quickActionsContainer.style.height = `${targetHeight}px`;
  }
};

const syncQuickActionsCanvasSize = () => {
  const rows = quickActionsContainer.querySelectorAll('.quick-action');
  let maxBottom = 0;
  rows.forEach((row) => {
    const top = parseFloat(row.style.top) || 0;
    maxBottom = Math.max(maxBottom, top + row.offsetHeight);
  });
  const targetHeight = Math.max(QUICK_ACTION_CANVAS_MIN_HEIGHT, maxBottom + QUICK_ACTION_CANVAS_PADDING);
  quickActionsContainer.style.height = `${targetHeight}px`;
};

// グローバル変数を関数外に移動
let currentDraggingElement = null;
let currentDraggingAction = null;
let startX, startY, initialX, initialY;

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
  syncQuickActionsCanvasSize();
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
  const clampedX = Math.max(0, Math.min(newX, maxX));
  const clampedY = Math.max(0, newY);

  currentDraggingAction.position.x = clampedX;
  currentDraggingAction.position.y = clampedY;
  currentDraggingElement.style.left = `${clampedX}px`;
  currentDraggingElement.style.top = `${clampedY}px`;
  ensureCanvasHeightForBottom(clampedY + rowRect.height);
};

const handleGlobalMouseUp = () => {
  if (currentDraggingElement) {
    currentDraggingElement.classList.remove('dragging');
    savePositions();
    syncQuickActionsCanvasSize();
    currentDraggingElement = null;
    currentDraggingAction = null;
  }
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
