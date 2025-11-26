const workspaceChip = document.getElementById('workspace-chip');
const workspaceChangeButton = document.getElementById('workspace-change');
const systemChip = document.getElementById('system-chip');
const clockChip = document.getElementById('clock-chip');
const quickActionsContainer = document.getElementById('quick-actions');
const featureCardsContainer = document.getElementById('feature-cards');

const quickActions = [
  { id: 'record', label: 'クイック録音', detail: '30秒メモ', icon: '🎙️', active: false, position: { x: 0, y: 0 } },
  { id: 'focus', label: 'フォーカス 25:00', detail: '集中モード', icon: '⏱️', active: false, position: { x: 150, y: 0 } },
  { id: 'share', label: 'ステータス共有', detail: 'チームに公開', icon: '📡', active: false, position: { x: 300, y: 0 } },
  { id: 'workspace-open', label: 'ディレクトリ', detail: '作業フォルダを開く', icon: '📁', active: false, position: { x: 450, y: 0 } },
  { id: 'ai-mail-monitor', label: 'AIメール監視', detail: '受信→転送', icon: 'AI', active: false, position: { x: 600, y: 0 } },
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
const aiMailStatus = {
  forwardTo: '',
  lastCheckedAt: null,
  lastForwardedAt: null,
  lastError: null,
  running: false,
  forwardedCount: 0,
};

let aiMailMonitorStartedOnce = false;
let aiMailForwardDraft = '';
let aiMailForwardDirty = false;
let isSavingAiMailForward = false;
let isFetchingAiMailOnce = false;

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

const formatDateTime = (value) => {
  if (!value) return '--';
  const date = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const isValidEmail = (value) => {
  const target = String(value ?? '').trim();
  if (!target) return false;
  return /.+@.+\..+/.test(target);
};

const renderQuickActions = () => {
  quickActionsContainer.innerHTML = '';
  quickActions.forEach((action) => {
    const isAiMailWarning = action.id === 'ai-mail-monitor'
      && action.active
      && aiMailMonitorStartedOnce
      && !aiMailStatus.running;

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
    if (action.id === 'ai-mail-monitor') {
      featureCardsContainer.appendChild(buildAiMailCard(action));
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

const updateAiMailStatus = (patch) => {
  Object.assign(aiMailStatus, patch);
};

const syncAiMailUiFromStatus = (status) => {
  if (!status) return;
  const aiMailAction = quickActions.find((action) => action.id === 'ai-mail-monitor');
  const shouldActivate = Boolean(status.running || aiMailAction?.active);
  if (status.running) {
    aiMailMonitorStartedOnce = true;
  }
  updateAiMailStatus(status);
  if (!aiMailForwardDirty || isSavingAiMailForward) {
    aiMailForwardDraft = status.forwardTo ?? '';
    aiMailForwardDirty = false;
  }
  setActionActive('ai-mail-monitor', shouldActivate);
  renderQuickActions();
  renderFeatureCards();
};

const submitAiMailForwardForm = async () => {
  const draft = aiMailForwardDraft ?? '';
  const trimmed = draft.trim();

  if (!window.desktopBridge?.updateAiMailForward) {
    updateAiMailStatus({ lastError: '転送先設定のブリッジが見つかりません' });
    renderFeatureCards();
    return;
  }

  if (!trimmed) {
    updateAiMailStatus({ lastError: '転送先メールアドレスを入力してください' });
    renderFeatureCards();
    return;
  }

  if (!isValidEmail(trimmed)) {
    updateAiMailStatus({ lastError: 'メールアドレスの形式が正しくありません' });
    renderFeatureCards();
    return;
  }

  if (isSavingAiMailForward) {
    return;
  }

  isSavingAiMailForward = true;
  renderFeatureCards();

  try {
    const status = await window.desktopBridge.updateAiMailForward(trimmed);
    if (status) {
      aiMailForwardDirty = false;
      syncAiMailUiFromStatus(status);
      return;
    }
    updateAiMailStatus({ forwardTo: trimmed, lastError: '転送先の更新が反映されませんでした' });
  } catch (error) {
    console.error('Failed to update ai mail forward address', error);
    updateAiMailStatus({ lastError: '転送先の更新に失敗しました' });
  } finally {
    isSavingAiMailForward = false;
    renderFeatureCards();
  }
};

const refreshAiMailStatus = async () => {
  try {
    const status = await window.desktopBridge?.refreshAiMailStatus?.();
    if (status) {
      syncAiMailUiFromStatus(status);
      return;
    }
    await hydrateAiMailStatus();
    return;
  } catch (error) {
    console.error('Failed to refresh ai mail status', error);
    updateAiMailStatus({ lastError: '状態更新に失敗しました' });
  }
  renderFeatureCards();
};

const fetchAiMailOnce = async () => {
  if (isFetchingAiMailOnce) {
    return;
  }
  isFetchingAiMailOnce = true;
  renderFeatureCards();
  try {
    const status = await window.desktopBridge?.fetchAiMailOnce?.();
    if (status) {
      syncAiMailUiFromStatus(status);
      return;
    }
    await hydrateAiMailStatus();
  } catch (error) {
    console.error('Failed to fetch ai mail once', error);
    updateAiMailStatus({ lastError: '手動取得に失敗しました' });
  } finally {
    isFetchingAiMailOnce = false;
    renderFeatureCards();
  }
};

const startAiMailMonitor = async () => {
  setActionActive('ai-mail-monitor', true);
  renderQuickActions();
  renderFeatureCards();
  try {
    const status = await window.desktopBridge?.startAiMailMonitor?.();
    if (status) {
      syncAiMailUiFromStatus(status);
      return;
    }
  } catch (error) {
    console.error('Failed to start ai mail monitor', error);
    updateAiMailStatus({ lastError: '監視開始に失敗しました' });
  }
  updateAiMailStatus({ lastError: '監視開始の応答がありません' });
  renderFeatureCards();
};

const stopAiMailMonitor = async () => {
  try {
    const status = await window.desktopBridge?.stopAiMailMonitor?.();
    if (status) {
      syncAiMailUiFromStatus(status);
      return;
    }
  } catch (error) {
    console.error('Failed to stop ai mail monitor', error);
    updateAiMailStatus({ lastError: '監視停止に失敗しました' });
  }
  syncAiMailUiFromStatus({ running: false });
};

const closeAiMailPanel = async () => {
  if (aiMailStatus.running) {
    await stopAiMailMonitor();
  }
  setActionActive('ai-mail-monitor', false);
  renderQuickActions();
  renderFeatureCards();
};

const buildAiMailCard = () => {
  const card = document.createElement('div');
  card.className = 'feature-card';

  const header = document.createElement('div');
  header.className = 'feature-header';
  const title = document.createElement('div');
  title.className = 'feature-title';
  title.innerHTML = '<strong>AIメール監視</strong><span class="feature-desc">POP3受信を監視し自動転送</span>';
  const chip = document.createElement('span');
  const isRunning = aiMailStatus.running;
  chip.className = 'chip tiny status-chip';
  chip.textContent = isRunning ? 'RUNNING' : 'STOPPED';
  chip.classList.toggle('muted', !isRunning);
  chip.classList.toggle('status-running', isRunning);
  const headerControls = document.createElement('div');
  headerControls.className = 'feature-header-controls';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'panel-close';
  closeBtn.setAttribute('aria-label', 'AIメール監視パネルを閉じる');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => { void closeAiMailPanel(); });
  headerControls.append(chip, closeBtn);
  header.append(title, headerControls);

  const statusGrid = document.createElement('div');
  statusGrid.className = 'status-grid';

  const makeRow = (label, value, type) => {
    const row = document.createElement('div');
    row.className = 'status-row';
    if (type) {
      row.dataset.type = type;
    }
    const name = document.createElement('span');
    name.className = 'status-label';
    name.textContent = label;
    const val = document.createElement('span');
    val.className = 'status-value';
    val.textContent = value;
    row.append(name, val);
    return row;
  };

  statusGrid.append(
    makeRow('転送先', aiMailStatus.forwardTo || '未設定'),
    makeRow('最終チェック', formatDateTime(aiMailStatus.lastCheckedAt)),
    makeRow('最終転送', formatDateTime(aiMailStatus.lastForwardedAt)),
    makeRow('累計転送', `${aiMailStatus.forwardedCount ?? 0}件`),
  );

  if (aiMailStatus.lastError) {
    statusGrid.append(makeRow('直近のエラー', aiMailStatus.lastError, 'error'));
  }

  const currentForwardDraft = aiMailForwardDraft ?? aiMailStatus.forwardTo ?? '';
  const trimmedDraft = currentForwardDraft.trim();
  const savedForward = (aiMailStatus.forwardTo ?? '').trim();
  const canSaveForward = Boolean(trimmedDraft && trimmedDraft !== savedForward);

  const forwardSection = document.createElement('div');
  forwardSection.className = 'forward-section';

  const forwardLabel = document.createElement('div');
  forwardLabel.className = 'forward-label';
  forwardLabel.textContent = '転送先メールアドレス';

  const forwardForm = document.createElement('form');
  forwardForm.className = 'forward-form';
  forwardForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitAiMailForwardForm();
  });

  const forwardRow = document.createElement('div');
  forwardRow.className = 'forward-input-row';

  const forwardInput = document.createElement('input');
  forwardInput.type = 'email';
  forwardInput.className = 'forward-input';
  forwardInput.placeholder = 'example@domain.com';
  forwardInput.value = currentForwardDraft;
  forwardInput.disabled = isSavingAiMailForward;
  forwardInput.addEventListener('input', (event) => {
    aiMailForwardDraft = event.target.value;
    aiMailForwardDirty = true;
  });

  const forwardSave = document.createElement('button');
  forwardSave.type = 'submit';
  forwardSave.className = 'primary forward-save';
  forwardSave.textContent = isSavingAiMailForward ? '保存中…' : '保存';
  forwardSave.disabled = isSavingAiMailForward || !canSaveForward;

  forwardRow.append(forwardInput, forwardSave);
  forwardForm.append(forwardRow);

  const forwardHint = document.createElement('div');
  forwardHint.className = 'forward-hint';
  forwardHint.textContent = '監視を開始するには転送先を設定してください。';

  forwardSection.append(forwardLabel, forwardForm, forwardHint);

  const actions = document.createElement('div');
  actions.className = 'feature-actions';
  const toggleBtn = document.createElement('button');
  toggleBtn.className = aiMailStatus.running ? 'ghost' : 'primary';
  toggleBtn.textContent = aiMailStatus.running ? '監視を停止' : '監視を開始';
  toggleBtn.addEventListener('click', () => {
    if (aiMailStatus.running) {
      stopAiMailMonitor();
    } else {
      void startAiMailMonitor();
    }
  });

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'ghost';
  refreshBtn.textContent = '状態更新';
  refreshBtn.addEventListener('click', refreshAiMailStatus);

  const fetchBtn = document.createElement('button');
  fetchBtn.className = 'ghost';
  fetchBtn.textContent = isFetchingAiMailOnce ? '手動取得中…' : '手動取得';
  fetchBtn.disabled = isFetchingAiMailOnce || !aiMailStatus.forwardTo;
  fetchBtn.addEventListener('click', () => { void fetchAiMailOnce(); });

  actions.append(toggleBtn, refreshBtn, fetchBtn);

  const desc = document.createElement('div');
  desc.className = 'feature-desc';
  desc.textContent = aiMailStatus.running
    ? 'wx105.wadax-sv.jp のPOP3(110/STARTTLS)を監視し、新着をSMTP(587/STARTTLS)で転送します。'
    : '監視を開始すると受信メールを検知し、指定先へ自動で転送します。';

  card.append(header, statusGrid, forwardSection, actions, desc);
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
  if (id === 'ai-mail-monitor') {
    if (aiMailStatus.running) {
      void stopAiMailMonitor();
    } else {
      void startAiMailMonitor();
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
  void hydrateAiMailStatus();
  hydrateSystemInfo();
  updateClock();
  setInterval(updateClock, 30000);
  workspaceChangeButton?.addEventListener('click', () => void handleWorkspaceChange());
  
  // グローバルイベントリスナーは一度だけ登録
  document.addEventListener('mousemove', handleGlobalMouseMove);
  document.addEventListener('mouseup', handleGlobalMouseUp);
};

boot();
