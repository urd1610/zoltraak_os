import { createWindowShell } from './renderer/window-layer.js';
import { createWorkspaceVisualizer } from './renderer/workspace-visualizer.js';
import { formatDuration } from './renderer/utils/time.js';
import { createAiMailFeature } from './renderer/ai-mail.js';
import { createAiModelSettings } from './renderer/ai-model-settings.js';
import { createSwMenuFeature } from './renderer/sw-menu.js';

const workspaceChip = document.getElementById('workspace-chip');
const systemChip = document.getElementById('system-chip');
const clockChip = document.getElementById('clock-chip');
const quickActionsContainer = document.getElementById('quick-actions');
const quickActionsToggle = document.getElementById('quick-actions-toggle');
const aiSettingsButton = document.getElementById('ai-settings-button');
const brandButton = document.getElementById('brand-button');
const workspaceVisualizer = document.getElementById('workspace-visualizer');
const swMenuSurface = document.getElementById('sw-menu-surface');
const dock = document.getElementById('dock');
const dockActions = document.getElementById('dock-actions');
const dockQuickToggle = document.getElementById('dock-quick-toggle');
const QUICK_ACTION_PADDING = 0;
const QUICK_ACTION_GAP = 12;
const QUICK_ACTION_DRAG_GUTTER = 0;
const QUICK_ACTION_VISIBILITY_KEY = 'quickActionsVisibility';
const DOCK_REVEAL_ZONE_PX = 82;
const DOCK_HIDE_DELAY_MS = 1400;

const quickActions = [
  { id: 'record', label: 'クイック録音', detail: '音声メモ', icon: '🎙️', active: false, position: { x: 0, y: 0 } },
  { id: 'ai-mail-monitor', label: 'AIメール監視', detail: '受信→転送', icon: '✉', active: false, position: { x: 150, y: 0 } },
  { id: 'sw-menu', label: 'SWメニュー', detail: '構成・流動管理', icon: '🧭', active: false, position: { x: 300, y: 0 } },
];

quickActions.forEach((action, index) => {
  action.zIndex = index + 1;
});

let highestZIndex = quickActions.length;

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
let aiModelSettingsFeature = null;
let swMenuFeature = null;
let swMenuSurfaceActive = false;
let wasWorkspaceVisualizerActiveForSwMenu = false;
const featureWindows = new Map();
let quickActionsVisible = true;
let dockVisible = false;
let dockHovering = false;
let dockHideTimerId = null;

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
const resizeWorkspaceScene = () => workspaceVisualizerController.resize();
const resetWorkspaceGraphCache = () => workspaceVisualizerController.resetGraphCache();
const isWorkspaceVisualizerActive = () => workspaceVisualizerController.isActive();

const loadQuickActionsVisibility = () => {
  const saved = localStorage.getItem(QUICK_ACTION_VISIBILITY_KEY);
  if (!saved) {
    return true;
  }
  return saved !== 'hidden';
};

const saveQuickActionsVisibility = () => {
  localStorage.setItem(QUICK_ACTION_VISIBILITY_KEY, quickActionsVisible ? 'visible' : 'hidden');
};

const updateDockQuickToggleUi = () => {
  if (!dockQuickToggle) return;
  const title = quickActionsVisible ? 'クイックアクションを隠す' : 'クイックアクションを表示する';
  dockQuickToggle.textContent = quickActionsVisible ? 'クイック表示中' : 'クイック表示';
  dockQuickToggle.title = title;
  dockQuickToggle.setAttribute('aria-pressed', quickActionsVisible ? 'true' : 'false');
  dockQuickToggle.classList.toggle('is-muted', !quickActionsVisible);
};

const updateQuickActionsToggleUi = () => {
  updateDockQuickToggleUi();
  if (!quickActionsToggle) return;
  const label = quickActionsVisible ? 'クイック: 表示' : 'クイック: 非表示';
  const title = quickActionsVisible
    ? 'クイックアクションを非表示にする'
    : 'クイックアクションを表示する';
  quickActionsToggle.textContent = label;
  quickActionsToggle.title = title;
  quickActionsToggle.setAttribute('aria-pressed', quickActionsVisible ? 'true' : 'false');
  quickActionsToggle.setAttribute('aria-label', title);
  quickActionsToggle.classList.toggle('muted', !quickActionsVisible);
};

const setQuickActionsVisibility = (visible, { skipSave } = {}) => {
  quickActionsVisible = Boolean(visible);
  if (!skipSave) {
    saveQuickActionsVisibility();
  }
  renderQuickActions();
};

const toggleQuickActionsVisibility = () => {
  setQuickActionsVisibility(!quickActionsVisible);
};

const isActionWarning = (action) => {
  if (!action) return false;
  if (action.id === 'ai-mail-monitor' && typeof aiMailFeature?.isWarning === 'function') {
    return aiMailFeature.isWarning(action.active);
  }
  if (action.id === 'sw-menu' && typeof swMenuFeature?.isWarning === 'function') {
    return swMenuFeature.isWarning(action.active);
  }
  return false;
};

const renderQuickActions = () => {
  if (!quickActionsContainer) return;
  quickActionsContainer.classList.toggle('is-hidden', !quickActionsVisible);
  quickActionsContainer.setAttribute('aria-hidden', quickActionsVisible ? 'false' : 'true');
  updateQuickActionsToggleUi();

  quickActionsContainer.innerHTML = '';
  renderDockActions();
  if (!quickActionsVisible) {
    return;
  }
  quickActions.forEach((action) => {
    const actionWarning = isActionWarning(action);

    const row = document.createElement('div');
    row.className = 'quick-action';
    row.classList.toggle('active', action.active);
    row.classList.toggle('warning', actionWarning);
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

const renderDockActions = () => {
  if (!dockActions) return;
  dockActions.innerHTML = '';
  quickActions.forEach((action) => {
    const actionWarning = isActionWarning(action);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dock-action';
    btn.classList.toggle('is-active', Boolean(action.active));
    btn.classList.toggle('is-warning', actionWarning);
    btn.title = action.label;
    const ariaLabel = action.detail ? `${action.label}: ${action.detail}` : action.label;
    btn.setAttribute('aria-label', ariaLabel);
    btn.setAttribute('aria-pressed', action.active ? 'true' : 'false');
    btn.setAttribute('role', 'listitem');
    btn.textContent = action.icon;
    btn.addEventListener('click', () => toggleAction(action.id));
    dockActions.append(btn);
  });
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
  if (!quickActionsContainer || !quickActionsVisible) return;
  const items = getQuickActionNodes();
  if (!items.length) return;
  const containerRect = quickActionsContainer.getBoundingClientRect();
  let touched = false;

  items.forEach(({ action, row }) => {
    const currentX = typeof action.position?.x === 'number' ? action.position.x : QUICK_ACTION_PADDING;
    const currentY = typeof action.position?.y === 'number' ? action.position.y : QUICK_ACTION_PADDING;
    const rect = row.getBoundingClientRect();
    const maxX = Math.max(
      QUICK_ACTION_PADDING,
      containerRect.width - rect.width - QUICK_ACTION_PADDING - QUICK_ACTION_DRAG_GUTTER,
    );
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

const buildGenericFeatureCard = (action) => {
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
  desc.textContent = action.detail ?? 'この機能が実行中です。';

  const actions = document.createElement('div');
  actions.className = 'feature-actions';
  const stopBtn = document.createElement('button');
  stopBtn.className = 'ghost';
  stopBtn.textContent = '停止';
  stopBtn.addEventListener('click', () => toggleAction(action.id));
  actions.append(stopBtn);

  card.append(header, desc, actions);
  return card;
};

const closeFeatureWindow = (id) => {
  const entry = featureWindows.get(id);
  if (!entry) return;
  featureWindows.delete(id);
  entry.close();
};

const handleFeatureWindowClose = (action) => {
  if (!action) return;
  if (action.id === 'ai-mail-monitor' && aiMailFeature?.closePanel) {
    void aiMailFeature.closePanel();
    return;
  }
  if (action.id === 'sw-menu' && swMenuFeature?.closePanel) {
    swMenuFeature.closePanel();
    return;
  }
  if (action.id === 'record') {
    stopRecording();
    return;
  }
  if (action.active) {
    toggleAction(action.id);
  } else {
    closeFeatureWindow(action.id);
  }
};

const renderFeatureWindows = () => {
  closeFeatureWindow('sw-menu');
  const activeActions = quickActions.filter((action) => action.active && action.id !== 'sw-menu');
  const activeIds = new Set(activeActions.map((action) => action.id));

  Array.from(featureWindows.keys()).forEach((id) => {
    if (!activeIds.has(id)) {
      closeFeatureWindow(id);
    }
  });

  activeActions.forEach((action) => {
    const card = (() => {
      if (action.id === 'record') {
        return buildRecordingCard(action);
      }
      if (action.id === 'ai-mail-monitor' && aiMailFeature) {
        return aiMailFeature.buildCard();
      }
      if (action.id === 'sw-menu' && swMenuFeature) {
        return swMenuFeature.buildCard();
      }
      return buildGenericFeatureCard(action);
    })();

    if (!card) {
      closeFeatureWindow(action.id);
      return;
    }

    let shell = featureWindows.get(action.id);
    if (!shell) {
      shell = createWindowShell(`feature-${action.id}`, action.label, () => {
        if (!featureWindows.has(action.id)) {
          return;
        }
        featureWindows.delete(action.id);
        handleFeatureWindowClose(action);
      });
      featureWindows.set(action.id, shell);
    }

    shell.body.innerHTML = '';
    shell.body.append(card);
  });
};

const setActionActive = (id, active) => {
  const action = quickActions.find((item) => item.id === id);
  if (!action) return;
  action.active = active;
};

const isActionActive = (id) => quickActions.some((action) => action.id === id && action.active);

const teardownSwMenuSurface = () => {
  if (!swMenuSurface) return;
  swMenuSurface.innerHTML = '';
  swMenuSurface.classList.remove('is-active');
  swMenuSurface.setAttribute('aria-hidden', 'true');
};

const setSwMenuSurfaceActiveState = (active) => {
  const next = Boolean(active);
  if (next === swMenuSurfaceActive) {
    return;
  }
  swMenuSurfaceActive = next;
  if (next) {
    wasWorkspaceVisualizerActiveForSwMenu = isWorkspaceVisualizerActive();
    stopWorkspaceVisualizer();
  } else if (wasWorkspaceVisualizerActiveForSwMenu) {
    wasWorkspaceVisualizerActiveForSwMenu = false;
    void startWorkspaceVisualizer();
  }
};

const renderSwMenuSurface = () => {
  if (!swMenuSurface) return;
  const active = isActionActive('sw-menu');
  setSwMenuSurfaceActiveState(active);
  if (!active || !swMenuFeature?.buildSurface) {
    teardownSwMenuSurface();
    return;
  }
  const surface = swMenuFeature.buildSurface();
  if (!surface) {
    teardownSwMenuSurface();
    return;
  }
  swMenuSurface.innerHTML = '';
  swMenuSurface.append(surface);
  swMenuSurface.classList.add('is-active');
  swMenuSurface.setAttribute('aria-hidden', 'false');
};

const renderUi = () => {
  renderQuickActions();
  renderFeatureWindows();
  renderSwMenuSurface();
};

const initializeAiModelSettings = () => {
  aiModelSettingsFeature = createAiModelSettings({
    createWindowShell,
    onSettingsSaved: () => {
      void aiMailFeature?.hydrate?.();
    },
  });
};

const initializeAiMailFeature = () => {
  aiMailFeature = createAiMailFeature({
    createWindowShell,
    setActionActive,
    isActionActive,
    renderUi,
    openAiSettings: () => {
      aiModelSettingsFeature?.openPanel?.();
    },
  });
  void aiMailFeature.hydrate();
};

const initializeSwMenuFeature = () => {
  swMenuFeature = createSwMenuFeature({
    createWindowShell,
    setActionActive,
    isActionActive,
    renderUi,
  });
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

const clearDockHideTimer = () => {
  if (!dockHideTimerId) return;
  clearTimeout(dockHideTimerId);
  dockHideTimerId = null;
};

const showDock = () => {
  if (!dock || dockVisible) return;
  dockVisible = true;
  dock.classList.add('is-visible');
  dock.setAttribute('aria-hidden', 'false');
};

const hideDock = () => {
  if (!dock || !dockVisible) return;
  dockVisible = false;
  dock.classList.remove('is-visible');
  dock.setAttribute('aria-hidden', 'true');
};

const scheduleDockHide = () => {
  if (!dock || dockHovering) return;
  clearDockHideTimer();
  dockHideTimerId = setTimeout(() => {
    dockHideTimerId = null;
    if (dockHovering) return;
    hideDock();
  }, DOCK_HIDE_DELAY_MS);
};

const handleDockProximity = (clientY) => {
  if (!dock || typeof clientY !== 'number') return;
  const distanceFromBottom = window.innerHeight - clientY;
  if (distanceFromBottom <= DOCK_REVEAL_ZONE_PX) {
    showDock();
    clearDockHideTimer();
    return;
  }
  scheduleDockHide();
};

const handleDockMouseEnter = () => {
  dockHovering = true;
  showDock();
  clearDockHideTimer();
};

const handleDockMouseLeave = () => {
  dockHovering = false;
  scheduleDockHide();
};

// グローバルイベントリスナーは一度だけ設定
const handleGlobalMouseMove = (e) => {
  handleDockProximity(e?.clientY);
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
  const maxX = Math.max(
    minX,
    containerRect.width - rowRect.width - QUICK_ACTION_PADDING - QUICK_ACTION_DRAG_GUTTER,
  );
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
  renderFeatureWindows();
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
  renderFeatureWindows();

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
    renderFeatureWindows();
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

const toggleAction = (id) => {
  const action = quickActions.find((a) => a.id === id);
  if (!action) return;
  if (id === 'ai-mail-monitor') {
    if (!aiMailFeature) return;
    if (action.active) {
      void aiMailFeature.closePanel();
    } else {
      void aiMailFeature.openPanel();
    }
    return;
  }
  if (id === 'sw-menu') {
    const nextActive = !action.active;
    setActionActive(id, nextActive);
    renderUi();
    if (nextActive) {
      void swMenuFeature?.hydrate?.().then(() => renderUi());
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
  renderFeatureWindows();
};

const handleActionDoubleClick = (action) => {
  if (!action) return;
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
    renderFeatureWindows();
  }
};

const handleWorkspaceChange = async () => {
  if (!workspaceChip || !window.desktopBridge?.changeWorkspaceDirectory) return;
  workspaceChip.disabled = true;
  const shouldRestoreVisualizer = isWorkspaceVisualizerActive();
  try {
    const dir = await window.desktopBridge.changeWorkspaceDirectory();
    workspacePath = dir || workspacePath;
    updateWorkspaceChip(workspacePath);
    resetWorkspaceGraphCache();
    if (shouldRestoreVisualizer) {
      stopWorkspaceVisualizer();
      void startWorkspaceVisualizer();
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
  loadPositions();
  initializeAiModelSettings();
  initializeAiMailFeature();
  initializeSwMenuFeature();
  setQuickActionsVisibility(loadQuickActionsVisibility(), { skipSave: true });
  renderFeatureWindows();
  setupQuickActionsResizeObserver();
  void startWorkspaceVisualizer();
  void hydrateWorkspaceChip();
  hydrateSystemInfo();
  updateClock();
  setInterval(updateClock, 30000);
  workspaceChip?.addEventListener('click', () => void handleWorkspaceChange());
  quickActionsToggle?.addEventListener('click', toggleQuickActionsVisibility);
  aiSettingsButton?.addEventListener('click', () => {
    aiModelSettingsFeature?.openPanel?.();
  });
  dockQuickToggle?.addEventListener('click', toggleQuickActionsVisibility);
  brandButton?.addEventListener('dblclick', () => {
    if (isActionActive('sw-menu')) {
      return;
    }
    if (isWorkspaceVisualizerActive()) {
      stopWorkspaceVisualizer();
      return;
    }
    startWorkspaceVisualizer();
  });
  dock?.addEventListener('mouseenter', handleDockMouseEnter);
  dock?.addEventListener('mouseleave', handleDockMouseLeave);
  
  // グローバルイベントリスナーは一度だけ登録
  document.addEventListener('mousemove', handleGlobalMouseMove);
  document.addEventListener('mouseup', handleGlobalMouseUp);
  window.addEventListener('resize', handleViewportResize);
};

boot();
