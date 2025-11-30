import { createWindowShell } from './renderer/window-layer.js';
import { createWorkspaceVisualizer } from './renderer/workspace-visualizer.js';
import { formatDuration } from './renderer/utils/time.js';
import { createAiMailFeature } from './renderer/ai-mail.js';

const workspaceChip = document.getElementById('workspace-chip');
const systemChip = document.getElementById('system-chip');
const clockChip = document.getElementById('clock-chip');
const quickActionsContainer = document.getElementById('quick-actions');
const featureCardsContainer = document.getElementById('feature-cards');
const sidePanel = document.getElementById('side-panel');
const sidePanelToggleButton = document.getElementById('side-panel-toggle');
const brandButton = document.getElementById('brand-button');
const workspaceVisualizer = document.getElementById('workspace-visualizer');
const QUICK_ACTION_PADDING = 12;
const QUICK_ACTION_GAP = 12;
const SIDE_PANEL_STATE_KEY = 'sidePanelOpen';

const quickActions = [
  { id: 'record', label: 'クイック録音', detail: '音声メモ', icon: '🎙️', active: false, position: { x: 0, y: 0 } },
  { id: 'focus', label: 'フォーカス 25:00', detail: '集中モード', icon: '⏱️', active: false, position: { x: 150, y: 0 } },
  { id: 'share', label: 'ステータス共有', detail: 'チームに公開', icon: '📡', active: false, position: { x: 300, y: 0 } },
  { id: 'workspace-open', label: 'ディレクトリ', detail: '作業フォルダを開く', icon: '📁', active: false, position: { x: 450, y: 0 } },
  { id: 'ai-mail-monitor', label: 'AIメール監視', detail: '受信→転送', icon: 'AI', active: false, position: { x: 600, y: 0 } },
];

quickActions.forEach((action, index) => {
  action.zIndex = index + 1;
});

let highestZIndex = quickActions.length;
let isSidePanelOpen = true;

// グローバル変数を関数外に移動
let currentDraggingElement = null;
let currentDraggingAction = null;
let startX, startY, initialX, initialY;
let recordingTimerId = null;
let recordingStartedAt = null;
let workspacePath = null;
let mediaRecorder = null;
let mediaStream = null;
let recordedChunks = [];
let isSavingRecording = false;
let resizeTimerId = null;
let quickActionsResizeObserver = null;
let aiMailFeature = null;

const buildWorkspaceChipTitle = (dir) => {
  if (dir) {
    return `${dir}（クリックで変更）`;
  }
  return '作業ディレクトリをクリックして選択';
};

const updateWorkspaceChip = (dir) => {
  if (!workspaceChip) return;
  workspaceChip.textContent = dir ? `workspace: ${dir}` : 'workspace: --';
  const title = buildWorkspaceChipTitle(dir);
  workspaceChip.title = title;
  workspaceChip.setAttribute('aria-label', title);
};

const workspaceVisualizerController = createWorkspaceVisualizer(workspaceVisualizer);
const startWorkspaceVisualizer = () => workspaceVisualizerController.start();
const stopWorkspaceVisualizer = () => workspaceVisualizerController.stop();
const toggleWorkspaceVisualizer = () => workspaceVisualizerController.toggle();
const resizeWorkspaceScene = () => workspaceVisualizerController.resize();
const resetWorkspaceGraphCache = () => workspaceVisualizerController.resetGraphCache();

const renderQuickActions = () => {
  quickActionsContainer.innerHTML = '';
  quickActions.forEach((action) => {
    const isAiMailWarning = action.id === 'ai-mail-monitor'
      && aiMailFeature?.isWarning(action.active);

    const row = document.createElement('div');
    row.className = 'quick-action';
    row.classList.toggle('active', action.active);
    row.classList.toggle('warning', isAiMailWarning);
    row.dataset.action = action.id;
    row.style.left = `${action.position.x}px`;
    row.style.top = `${action.position.y}px`;
    row.style.zIndex = String(action.zIndex ?? 1);
    
    const handleMouseDown = (e) => {
      if (e.button === 0 && !currentDraggingElement) { // 左クリックのみ、かつ他の要素がドラッグ中でない
        action.zIndex = ++highestZIndex;
        currentDraggingElement = row;
        currentDraggingAction = action;
        row.style.zIndex = String(action.zIndex);
        startX = e.clientX;
        startY = e.clientY;
        initialX = action.position.x;
        initialY = action.position.y;
        row.classList.add('dragging');
        e.preventDefault();
      }
    };
    
    // ダブルクリックで動作を実行
    const handleDoubleClick = () => {
      handleActionDoubleClick(action);
    };
    
    row.addEventListener('mousedown', handleMouseDown);
    row.addEventListener('dblclick', handleDoubleClick);

    const label = document.createElement('div');
    label.className = 'quick-label';

    const icon = document.createElement('div');
    icon.className = 'quick-icon';
    icon.textContent = action.icon;

    const name = document.createElement('div');
    name.className = 'quick-name';
    name.textContent = action.label;

    const detail = document.createElement('div');
    detail.className = 'quick-detail';
    detail.textContent = action.detail ?? '';

    label.append(icon, name, detail);

    row.append(label);
    quickActionsContainer.appendChild(row);
  });

  requestAnimationFrame(() => ensureQuickActionsVisible());
};

const getQuickActionNodes = () => {
  if (!quickActionsContainer) return [];
  return Array.from(quickActionsContainer.querySelectorAll('.quick-action'))
    .map((row) => {
      const id = row.dataset.action;
      const action = quickActions.find((item) => item.id === id);
      if (!action) return null;
      return { action, row };
    })
    .filter(Boolean);
};

const ensureQuickActionsVisible = () => {
  if (!quickActionsContainer) return;
  const items = getQuickActionNodes();
  if (!items.length) return;
  const containerRect = quickActionsContainer.getBoundingClientRect();
  let touched = false;

  items.forEach(({ action, row }) => {
    const currentX = typeof action.position?.x === 'number' ? action.position.x : QUICK_ACTION_PADDING;
    const currentY = typeof action.position?.y === 'number' ? action.position.y : QUICK_ACTION_PADDING;
    const rect = row.getBoundingClientRect();
    const maxX = Math.max(QUICK_ACTION_PADDING, containerRect.width - rect.width - QUICK_ACTION_PADDING);
    const maxY = Math.max(QUICK_ACTION_PADDING, containerRect.height - rect.height - QUICK_ACTION_PADDING);
    const clampedX = Math.min(Math.max(currentX, QUICK_ACTION_PADDING), maxX);
    const clampedY = Math.min(Math.max(currentY, QUICK_ACTION_PADDING), maxY);
    if (clampedX !== action.position?.x || clampedY !== action.position?.y) {
      action.position = { x: clampedX, y: clampedY };
      row.style.left = `${clampedX}px`;
      row.style.top = `${clampedY}px`;
      touched = true;
    }
  });

  if (touched) {
    savePositions();
  }
};

const setupQuickActionsResizeObserver = () => {
  if (!quickActionsContainer || typeof ResizeObserver === 'undefined') return;
  if (quickActionsResizeObserver) return;
  quickActionsResizeObserver = new ResizeObserver(() => ensureQuickActionsVisible());
  quickActionsResizeObserver.observe(quickActionsContainer);
};

const renderFeatureCards = () => {
  featureCardsContainer.innerHTML = '';
  const activeActions = quickActions.filter((action) => action.active);

  activeActions.forEach((action) => {
    if (action.id === 'record') {
      featureCardsContainer.appendChild(buildRecordingCard(action));
      return;
    }
    if (action.id === 'ai-mail-monitor' && aiMailFeature) {
      const card = aiMailFeature.buildCard();
      if (card) {
        featureCardsContainer.appendChild(card);
      }
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

const isActionActive = (id) => quickActions.some((action) => action.id === id && action.active);

const renderUi = () => {
  renderQuickActions();
  renderFeatureCards();
};

const initializeAiMailFeature = () => {
  aiMailFeature = createAiMailFeature({
    createWindowShell,
    setActionActive,
    isActionActive,
    renderUi,
  });
  void aiMailFeature.hydrate();
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
  chip.textContent = isSavingRecording ? 'SAVING' : 'REC';
  header.append(title, chip);

  const row = document.createElement('div');
  row.className = 'recording-row';
  const timer = document.createElement('div');
  timer.id = 'recording-timer';
  timer.className = 'recording-timer';
  timer.textContent = isSavingRecording
    ? '保存中...'
    : recordingStartedAt
      ? formatDuration(Date.now() - recordingStartedAt)
      : '00:00';
  const stop = document.createElement('button');
  stop.className = 'primary';
  stop.textContent = isSavingRecording ? '保存待ち' : '停止';
  stop.disabled = isSavingRecording;
  stop.addEventListener('click', stopRecording);
  row.append(timer, stop);

  const desc = document.createElement('div');
  desc.className = 'feature-desc';
  desc.textContent = isSavingRecording
    ? '録音ファイルを保存しています。完了までお待ちください。'
    : '録音はカード内から停止できます。';

  card.append(header, row, desc);
  return card;
};

// グローバルイベントリスナーは一度だけ設定
const handleGlobalMouseMove = (e) => {
  if (!quickActionsContainer) return;
  if (!currentDraggingElement || !currentDraggingAction) return;
  
  const deltaX = e.clientX - startX;
  const deltaY = e.clientY - startY;
  
  const newX = initialX + deltaX;
  const newY = initialY + deltaY;
  
  const containerRect = quickActionsContainer.getBoundingClientRect();
  const rowRect = currentDraggingElement.getBoundingClientRect();
  const minX = QUICK_ACTION_PADDING;
  const minY = QUICK_ACTION_PADDING;
  const maxX = Math.max(minX, containerRect.width - rowRect.width - QUICK_ACTION_PADDING);
  const maxY = Math.max(minY, containerRect.height - rowRect.height - QUICK_ACTION_PADDING);
  const clampedX = Math.max(minX, Math.min(newX, maxX));
  const clampedY = Math.max(minY, Math.min(newY, maxY));

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

const handleViewportResize = () => {
  if (resizeTimerId) {
    clearTimeout(resizeTimerId);
  }
  resizeTimerId = setTimeout(() => {
    ensureQuickActionsVisible();
    resizeWorkspaceScene();
    resizeTimerId = null;
  }, 120);
};

const updateRecordingTimer = () => {
  if (!recordingStartedAt) return;
  const timerEl = document.getElementById('recording-timer');
  if (!timerEl) return;
  timerEl.textContent = formatDuration(Date.now() - recordingStartedAt);
};

const cleanupRecordingTimer = () => {
  if (recordingTimerId) {
    clearInterval(recordingTimerId);
    recordingTimerId = null;
  }
};

const cleanupMediaStream = () => {
  if (!mediaStream) return;
  mediaStream.getTracks()?.forEach((track) => track.stop());
  mediaStream = null;
};

const finalizeRecordingStop = () => {
  cleanupRecordingTimer();
  recordingStartedAt = null;
  setActionActive('record', false);
  renderQuickActions();
  renderFeatureCards();
};

const saveRecordingBlob = async (blob) => {
  if (!blob || blob.size === 0) return;
  if (!window.desktopBridge?.saveRecording) {
    throw new Error('録音保存のブリッジが無効です');
  }
  const arrayBuffer = await blob.arrayBuffer();
  return window.desktopBridge.saveRecording(arrayBuffer, blob.type);
};

const handleRecorderStop = async () => {
  cleanupMediaStream();
  const blob = new Blob(recordedChunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
  recordedChunks = [];
  mediaRecorder = null;
  isSavingRecording = true;
  renderFeatureCards();

  try {
    await saveRecordingBlob(blob);
  } catch (error) {
    console.error('Failed to save recording', error);
    alert('録音の保存に失敗しました。');
  } finally {
    isSavingRecording = false;
    finalizeRecordingStop();
  }
};

const startRecording = async () => {
  if (mediaRecorder || isSavingRecording) {
    return;
  }

  try {
    if (!workspacePath) {
      workspacePath = await window.desktopBridge?.getWorkspaceDirectory?.();
      updateWorkspaceChip(workspacePath);
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStream = stream;
    recordedChunks = [];
    const recorder = new MediaRecorder(stream);
    mediaRecorder = recorder;

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    });
    recorder.addEventListener('stop', () => { void handleRecorderStop(); });

    recordingStartedAt = Date.now();
    setActionActive('record', true);
    renderQuickActions();
    renderFeatureCards();
    updateRecordingTimer();
    cleanupRecordingTimer();
    recordingTimerId = setInterval(updateRecordingTimer, 500);
    recorder.start();
  } catch (error) {
    console.error('Failed to start recording', error);
    alert('録音を開始できませんでした。マイク設定と作業ディレクトリを確認してください。');
    cleanupMediaStream();
    mediaRecorder = null;
    recordedChunks = [];
    finalizeRecordingStop();
  }
};

const stopRecording = () => {
  cleanupRecordingTimer();
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    return;
  }
  finalizeRecordingStop();
};

const openWorkspaceDirectoryFromIcon = async () => {
  if (!window.desktopBridge?.openWorkspaceDirectory) {
    alert('作業ディレクトリを開けませんでした。設定を確認してください。');
    return;
  }
  try {
    const opened = await window.desktopBridge.openWorkspaceDirectory();
    if (opened) {
      workspacePath = opened;
      updateWorkspaceChip(opened);
    }
  } catch (error) {
    console.error('Failed to open workspace directory', error);
    alert('作業ディレクトリを開けませんでした。設定を確認してください。');
  }
};

const toggleAction = (id) => {
  const action = quickActions.find((a) => a.id === id);
  if (!action) return;
  if (id === 'ai-mail-monitor') {
    if (!aiMailFeature) return;
    if (aiMailFeature.isRunning()) {
      void aiMailFeature.stopMonitor();
    } else {
      void aiMailFeature.startMonitor();
    }
    return;
  }
  if (id === 'record') {
    if (isSavingRecording) {
      return;
    }
    if (action.active || mediaRecorder) {
      stopRecording();
    } else {
      void startRecording();
    }
    return;
  }
  action.active = !action.active;
  renderQuickActions();
  renderFeatureCards();
};

const handleActionDoubleClick = (action) => {
  if (!action) return;
  if (action.id === 'workspace-open') {
    void openWorkspaceDirectoryFromIcon();
    return;
  }
  toggleAction(action.id);
};

const updateClock = () => {
  const nowIso = window.desktopBridge?.getNowIso() ?? new Date().toISOString();
  const now = new Date(nowIso);
  const formatted = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  clockChip.textContent = formatted;
};

const hydrateWorkspaceChip = async () => {
  if (!workspaceChip) return;
  try {
    workspacePath = await window.desktopBridge?.getWorkspaceDirectory?.();
    updateWorkspaceChip(workspacePath);
  } catch (error) {
    console.error('Failed to load workspace directory', error);
    workspaceChip.textContent = 'workspace: error';
    workspaceChip.title = '';
  }
};

const hydrateAiMailStatus = async () => {
  if (!window.desktopBridge?.getAiMailStatus) return;
  try {
    const status = await window.desktopBridge.getAiMailStatus();
    if (status) {
      syncAiMailUiFromStatus(status);
    }
  } catch (error) {
    console.error('Failed to hydrate ai mail status', error);
    updateAiMailStatus({ lastError: 'AIメール監視の状態取得に失敗しました' });
    renderFeatureCards();
  }
};

const handleWorkspaceChange = async () => {
  if (!workspaceChip || !window.desktopBridge?.changeWorkspaceDirectory) return;
  workspaceChip.disabled = true;
  try {
    const dir = await window.desktopBridge.changeWorkspaceDirectory();
    workspacePath = dir || workspacePath;
    updateWorkspaceChip(workspacePath);
    resetWorkspaceGraphCache();
    if (workspaceVisualizerController.isActive()) {
      stopWorkspaceVisualizer();
    }
  } catch (error) {
    console.error('Failed to change workspace directory', error);
    workspaceChip.textContent = 'workspace: error';
    workspaceChip.title = '';
  } finally {
    workspaceChip.disabled = false;
  }
};

const hydrateSystemInfo = () => {
  const info = window.desktopBridge?.getSystemInfo?.();
  if (!info) {
    systemChip.textContent = 'mock system';
    return;
  }
  systemChip.textContent = `${info.user} · ${info.platform} ${info.release}`;
};

const getSidePanelToggleLabel = (open) => (open ? 'サイドパネルを閉じる' : 'サイドパネルを開く');

const applySidePanelToggleMetadata = () => {
  if (!sidePanelToggleButton) return;
  const label = getSidePanelToggleLabel(isSidePanelOpen);
  sidePanelToggleButton.setAttribute('aria-expanded', isSidePanelOpen ? 'true' : 'false');
  sidePanelToggleButton.setAttribute('aria-label', label);
  sidePanelToggleButton.title = label;
  sidePanelToggleButton.dataset.state = isSidePanelOpen ? 'open' : 'closed';
};

const applySidePanelState = () => {
  document.body.classList.toggle('panel-collapsed', !isSidePanelOpen);
  if (sidePanel) {
    sidePanel.setAttribute('aria-hidden', String(!isSidePanelOpen));
  }
  applySidePanelToggleMetadata();
  requestAnimationFrame(() => ensureQuickActionsVisible());
  if (!quickActionsResizeObserver) {
    setTimeout(() => ensureQuickActionsVisible(), 220);
  }
};

const persistSidePanelState = () => {
  try {
    localStorage.setItem(SIDE_PANEL_STATE_KEY, isSidePanelOpen ? 'open' : 'closed');
  } catch (error) {
    console.warn('サイドパネル状態の保存に失敗しました', error);
  }
};

const setSidePanelOpen = (open) => {
  const next = Boolean(open);
  const prev = isSidePanelOpen;
  isSidePanelOpen = next;
  applySidePanelState();
  if (prev !== next) {
    persistSidePanelState();
  }
};

const toggleSidePanel = () => {
  setSidePanelOpen(!isSidePanelOpen);
};

const hydrateSidePanelState = () => {
  let savedState = isSidePanelOpen;
  try {
    const stored = localStorage.getItem(SIDE_PANEL_STATE_KEY);
    if (stored === 'open') {
      savedState = true;
    } else if (stored === 'closed') {
      savedState = false;
    }
  } catch (error) {
    console.warn('サイドパネル状態の読み込みに失敗しました', error);
  }
  setSidePanelOpen(savedState);
};

const savePositions = () => {
  const positions = quickActions.reduce((acc, action) => {
    acc[action.id] = {
      position: action.position,
      zIndex: action.zIndex,
    };
    return acc;
  }, {});
  localStorage.setItem('quickActionsPositions', JSON.stringify(positions));
};

const loadPositions = () => {
  const saved = localStorage.getItem('quickActionsPositions');
  if (!saved) {
    return;
  }

  let positions;

  try {
    positions = JSON.parse(saved);
  } catch (error) {
    console.error('Failed to parse quick action positions', error);
    return;
  }

  let maxZ = highestZIndex;

  quickActions.forEach((action, index) => {
    const state = positions[action.id];
    if (state) {
      if (state.position) {
        action.position = state.position;
      } else if (typeof state.x === 'number' && typeof state.y === 'number') {
        action.position = { x: state.x, y: state.y };
      }
      if (typeof state.zIndex === 'number') {
        action.zIndex = state.zIndex;
      }
    }
    if (typeof action.zIndex !== 'number') {
      action.zIndex = index + 1;
    }
    maxZ = Math.max(maxZ, action.zIndex);
  });

  highestZIndex = Math.max(highestZIndex, maxZ);
};

const boot = () => {
  hydrateSidePanelState();
  loadPositions();
  initializeAiMailFeature();
  renderQuickActions();
  renderFeatureCards();
  setupQuickActionsResizeObserver();
  workspaceVisualizerController.setActiveState(false);
  void hydrateWorkspaceChip();
  hydrateSystemInfo();
  updateClock();
  setInterval(updateClock, 30000);
  workspaceChip?.addEventListener('click', () => void handleWorkspaceChange());
  sidePanelToggleButton?.addEventListener('click', toggleSidePanel);
  brandButton?.addEventListener('dblclick', () => toggleWorkspaceVisualizer());
  
  // グローバルイベントリスナーは一度だけ登録
  document.addEventListener('mousemove', handleGlobalMouseMove);
  document.addEventListener('mouseup', handleGlobalMouseUp);
  window.addEventListener('resize', handleViewportResize);
};

boot();
