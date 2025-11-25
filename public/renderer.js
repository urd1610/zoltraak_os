const workspaceChip = document.getElementById('workspace-chip');
const workspaceChangeButton = document.getElementById('workspace-change');
const systemChip = document.getElementById('system-chip');
const clockChip = document.getElementById('clock-chip');
const quickActionsContainer = document.getElementById('quick-actions');
const featureCardsContainer = document.getElementById('feature-cards');

const quickActions = [
  { id: 'record', label: 'クイック録音', detail: '', icon: '🎙️', active: false, position: { x: 0, y: 0 } },
  { id: 'focus', label: 'フォーカス 25:00', detail: '', icon: '⏱️', active: false, position: { x: 150, y: 0 } },
  { id: 'share', label: 'ステータス共有', detail: '', icon: '📡', active: false, position: { x: 300, y: 0 } },
  { id: 'workspace-open', label: 'ディレクトリ', detail: '', icon: '📁', active: false, position: { x: 450, y: 0 } },
];

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

const updateWorkspaceChip = (dir) => {
  if (!workspaceChip) return;
  workspaceChip.textContent = dir ? `workspace: ${dir}` : 'workspace: --';
  workspaceChip.title = dir ?? '';
};

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
    row.classList.toggle('active', action.active);
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

const handleWorkspaceChange = async () => {
  if (!workspaceChangeButton || !window.desktopBridge?.changeWorkspaceDirectory) return;
  workspaceChangeButton.disabled = true;
  try {
    const dir = await window.desktopBridge.changeWorkspaceDirectory();
    workspacePath = dir || workspacePath;
    updateWorkspaceChip(workspacePath);
  } catch (error) {
    console.error('Failed to change workspace directory', error);
    workspaceChip.textContent = 'workspace: error';
    workspaceChip.title = '';
  } finally {
    workspaceChangeButton.disabled = false;
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
  void hydrateWorkspaceChip();
  hydrateSystemInfo();
  updateClock();
  setInterval(updateClock, 30000);
  workspaceChangeButton?.addEventListener('click', () => void handleWorkspaceChange());
  
  // グローバルイベントリスナーは一度だけ登録
  document.addEventListener('mousemove', handleGlobalMouseMove);
  document.addEventListener('mouseup', handleGlobalMouseUp);
};

boot();
