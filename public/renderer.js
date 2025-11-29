const workspaceChip = document.getElementById('workspace-chip');
const systemChip = document.getElementById('system-chip');
const clockChip = document.getElementById('clock-chip');
const quickActionsContainer = document.getElementById('quick-actions');
const featureCardsContainer = document.getElementById('feature-cards');
const sidePanel = document.getElementById('side-panel');
const sidePanelToggleButton = document.getElementById('side-panel-toggle');
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
let highestWindowZIndex = 0;
const windowLayer = (() => {
  const layer = document.createElement('div');
  layer.className = 'window-layer';
  document.body.append(layer);
  return layer;
})();

const getLayerRect = () => windowLayer.getBoundingClientRect();

const removeWindowById = (id) => {
  if (!id) return;
  const existing = windowLayer.querySelector(`[data-window-id="${id}"]`);
  if (existing) {
    existing.remove();
  }
};

const clampWindowPosition = (left, top, width, height, layerRect = getLayerRect()) => {
  const maxLeft = Math.max(0, layerRect.width - width);
  const maxTop = Math.max(0, layerRect.height - height);
  return {
    left: Math.min(Math.max(0, left), maxLeft),
    top: Math.min(Math.max(0, top), maxTop),
  };
};

const bringWindowToFront = (windowEl) => {
  highestWindowZIndex += 1;
  windowEl.style.zIndex = String(highestWindowZIndex);
};

const setWindowInitialPosition = (windowEl) => {
  const layerRect = getLayerRect();
  const rect = windowEl.getBoundingClientRect();
  const windowCount = windowLayer.querySelectorAll('.window').length;
  const offset = Math.max(0, (windowCount - 1) * 24);
  const { left, top } = clampWindowPosition(offset, offset, rect.width, rect.height, layerRect);
  windowEl.style.left = `${left}px`;
  windowEl.style.top = `${top}px`;
};

let activeWindowDrag = null;

const stopWindowDrag = () => {
  if (!activeWindowDrag) return;
  activeWindowDrag.windowEl.classList.remove('dragging');
  activeWindowDrag = null;
  document.removeEventListener('mousemove', handleWindowDrag);
  document.removeEventListener('mouseup', stopWindowDrag);
};

const handleWindowDrag = (event) => {
  if (!activeWindowDrag) return;
  const {
    startX,
    startY,
    startLeft,
    startTop,
    width,
    height,
    layerRect,
    windowEl,
  } = activeWindowDrag;
  const deltaX = event.clientX - startX;
  const deltaY = event.clientY - startY;
  const { left, top } = clampWindowPosition(startLeft + deltaX, startTop + deltaY, width, height, layerRect);
  windowEl.style.left = `${left}px`;
  windowEl.style.top = `${top}px`;
};

const startWindowDrag = (windowEl, event) => {
  if (event.button !== 0) return;
  if (activeWindowDrag) {
    stopWindowDrag();
  }
  const layerRect = getLayerRect();
  const rect = windowEl.getBoundingClientRect();
  activeWindowDrag = {
    windowEl,
    startX: event.clientX,
    startY: event.clientY,
    startLeft: rect.left - layerRect.left,
    startTop: rect.top - layerRect.top,
    width: rect.width,
    height: rect.height,
    layerRect,
  };
  bringWindowToFront(windowEl);
  windowEl.classList.add('dragging');
  document.addEventListener('mousemove', handleWindowDrag);
  document.addEventListener('mouseup', stopWindowDrag);
};

const createWindowShell = (id, titleText, onClose) => {
  removeWindowById(id);
  const handleClose = () => {
    removeWindowById(id);
    if (typeof onClose === 'function') {
      onClose();
    }
  };
  const windowEl = document.createElement('div');
  windowEl.className = 'window pop';
  windowEl.dataset.windowId = id;
  const header = document.createElement('div');
  header.className = 'window-header';
  const title = document.createElement('div');
  title.className = 'window-title';
  title.textContent = titleText;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'panel-close';
  closeBtn.setAttribute('aria-label', `${titleText}を閉じる`);
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', handleClose);
  header.append(title, closeBtn);
  header.addEventListener('mousedown', (event) => {
    if (event.target.closest('button')) {
      return;
    }
    startWindowDrag(windowEl, event);
    event.preventDefault();
  });
  const body = document.createElement('div');
  body.className = 'window-body';
  windowEl.append(header, body);
  windowLayer.append(windowEl);
  bringWindowToFront(windowEl);
  setWindowInitialPosition(windowEl);
  windowEl.addEventListener('mousedown', () => bringWindowToFront(windowEl));
  return { windowEl, body, close: handleClose };
};

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
const DEFAULT_AI_MAIL_PROMPT = [
  'あなたは日本語のメール文面を整形するアシスタントです。',
  '以下のJSON形式だけで出力してください:',
  '{"subject":"短く要点を示す件名","body":"本文（敬体・箇条書き主体）"}',
  '条件:',
  '- 件名は50文字以内で、要約キーワードを含める',
  '- 本文は敬体で、重要項目は箇条書きにまとめる',
  '- 元メールの署名や引用は必要な場合だけ簡潔に反映する',
  '- 出力は必ずUTF-8のJSON文字列のみ。余分なテキストやコードブロックは付けない',
].join('\n');
let aiMailDefaultPrompt = DEFAULT_AI_MAIL_PROMPT;
let isSyncingAiMailDefaultPrompt = false;
const normalizeAiMailTimeout = (value, provider = 'openrouter') => {
  const parsed = Number(value);
  const base = Number.isFinite(parsed) ? parsed : 60000;
  const min = provider === 'lmstudio' ? 60000 : 30000;
  const max = 180000;
  return Math.min(Math.max(base, min), max);
};
const buildDefaultAiFormatting = () => ({
  enabled: true,
  provider: 'openrouter',
  prompt: aiMailDefaultPrompt,
  openRouter: {
    apiKey: '',
    model: 'gpt-4o-mini',
  },
  lmStudio: {
    endpoint: 'http://localhost:1234/v1/chat/completions',
    model: 'gpt-4o-mini',
  },
  timeoutMs: 60000,
});
const aiMailStatus = {
  forwardTo: '',
  lastCheckedAt: null,
  lastForwardedAt: null,
  lastError: null,
  running: false,
  forwardedCount: 0,
  formatting: buildDefaultAiFormatting(),
};

let aiMailMonitorStartedOnce = false;
let aiMailForwardDraft = '';
let aiMailForwardDirty = false;
let isSavingAiMailForward = false;
let isFetchingAiMailOnce = false;
let aiMailFormattingDraft = null;
let aiMailFormattingDirty = false;
let isSavingAiMailFormatting = false;
const AI_MAIL_REFRESH_INTERVAL_MS = 30000;
let aiMailAutoRefreshTimerId = null;
let aiMailForwardWindow = null;
let aiMailFormattingWindow = null;
let resizeTimerId = null;
let quickActionsResizeObserver = null;

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

const getAiMailFormattingDraft = () => ({
  ...buildDefaultAiFormatting(),
  ...(aiMailStatus.formatting ?? {}),
  ...(aiMailFormattingDraft ?? {}),
});

const normalizeAiMailFormattingPayload = () => {
  const draft = getAiMailFormattingDraft();
  const provider = draft.provider === 'lmstudio' ? 'lmstudio' : 'openrouter';
  return {
    enabled: draft.enabled !== false,
    provider,
    prompt: draft.prompt?.trim() || aiMailDefaultPrompt,
    openRouter: {
      apiKey: draft.openRouter?.apiKey ?? '',
      model: draft.openRouter?.model || 'gpt-4o-mini',
    },
    lmStudio: {
      endpoint: draft.lmStudio?.endpoint || 'http://localhost:1234/v1/chat/completions',
      model: draft.lmStudio?.model || 'gpt-4o-mini',
    },
    timeoutMs: normalizeAiMailTimeout(draft.timeoutMs, provider),
  };
};

const hydrateAiMailDefaultPrompt = async () => {
  if (!window.desktopBridge?.getAiMailDefaultPrompt) return aiMailDefaultPrompt;
  try {
    const prompt = await window.desktopBridge.getAiMailDefaultPrompt();
    if (prompt && typeof prompt === 'string') {
      aiMailDefaultPrompt = prompt;
    }
  } catch (error) {
    console.error('Failed to hydrate default ai mail prompt', error);
  }
  return aiMailDefaultPrompt;
};

const updateAiMailForwardWindowState = () => {
  if (!aiMailForwardWindow) return;
  const draft = aiMailForwardDraft ?? '';
  const trimmedDraft = draft.trim();
  const savedForward = (aiMailStatus.forwardTo ?? '').trim();
  const { input, saveButton, hint, errorText } = aiMailForwardWindow;
  if (input) {
    input.value = draft;
    input.disabled = isSavingAiMailForward;
  }
  if (saveButton) {
    saveButton.disabled = isSavingAiMailForward || !trimmedDraft || trimmedDraft === savedForward;
    saveButton.textContent = isSavingAiMailForward ? '保存中…' : '保存';
  }
  if (hint) {
    hint.textContent = savedForward
      ? `現在の転送先: ${savedForward}`
      : '監視を開始するには転送先を設定してください。';
  }
  if (errorText) {
    errorText.textContent = aiMailStatus.lastError ?? '';
    errorText.hidden = !aiMailStatus.lastError;
  }
};

const updateAiMailFormattingWindowState = () => {
  if (!aiMailFormattingWindow) return;
  const draft = getAiMailFormattingDraft();
  const provider = draft.provider === 'lmstudio' ? 'lmstudio' : 'openrouter';
  const {
    enableInput,
    providerSelect,
    openRouterRow,
    openRouterKey,
    openRouterModel,
    lmStudioRow,
    lmStudioEndpoint,
    lmStudioModel,
    timeoutInput,
    promptInput,
    promptResetButton,
    promptRegisterButton,
    saveButton,
    statusChip,
    errorText,
  } = aiMailFormattingWindow;

  if (enableInput) {
    enableInput.checked = draft.enabled;
    enableInput.disabled = isSavingAiMailFormatting;
  }
  if (providerSelect) {
    providerSelect.value = provider;
    providerSelect.disabled = isSavingAiMailFormatting;
  }
  if (timeoutInput) {
    const normalizedTimeout = normalizeAiMailTimeout(draft.timeoutMs, provider);
    const minTimeout = provider === 'lmstudio' ? 60000 : 30000;
    timeoutInput.value = String(normalizedTimeout);
    timeoutInput.min = String(minTimeout);
    timeoutInput.disabled = isSavingAiMailFormatting;
  }
  if (openRouterRow) {
    openRouterRow.hidden = provider !== 'openrouter';
  }
  if (lmStudioRow) {
    lmStudioRow.hidden = provider !== 'lmstudio';
  }
  if (openRouterKey) {
    openRouterKey.value = draft.openRouter?.apiKey ?? '';
    openRouterKey.disabled = isSavingAiMailFormatting;
  }
  if (openRouterModel) {
    openRouterModel.value = draft.openRouter?.model || 'gpt-4o-mini';
    openRouterModel.disabled = isSavingAiMailFormatting;
  }
  if (lmStudioEndpoint) {
    lmStudioEndpoint.value = draft.lmStudio?.endpoint || 'http://localhost:1234/v1/chat/completions';
    lmStudioEndpoint.disabled = isSavingAiMailFormatting;
  }
  if (lmStudioModel) {
    lmStudioModel.value = draft.lmStudio?.model || 'gpt-4o-mini';
    lmStudioModel.disabled = isSavingAiMailFormatting;
  }
  if (promptInput) {
    promptInput.value = draft.prompt ?? '';
    promptInput.disabled = isSavingAiMailFormatting;
  }
  if (promptResetButton) {
    promptResetButton.disabled = isSavingAiMailFormatting || isSyncingAiMailDefaultPrompt;
    promptResetButton.textContent = isSyncingAiMailDefaultPrompt ? '読込中…' : 'デフォルトに戻す';
  }
  if (promptRegisterButton) {
    promptRegisterButton.disabled = isSavingAiMailFormatting || isSyncingAiMailDefaultPrompt;
    promptRegisterButton.textContent = isSyncingAiMailDefaultPrompt ? '保存中…' : 'デフォルト登録';
  }
  if (saveButton) {
    const allowSave = aiMailFormattingDirty && !isSavingAiMailFormatting && !isSyncingAiMailDefaultPrompt;
    saveButton.disabled = !allowSave;
    saveButton.textContent = isSavingAiMailFormatting ? '保存中…' : '保存';
  }
  if (statusChip) {
    const providerLabel = provider === 'lmstudio' ? 'LM Studio' : 'OpenRouter';
    statusChip.textContent = draft.enabled ? `${providerLabel} ON` : 'OFF';
    statusChip.classList.toggle('muted', !draft.enabled);
  }
  if (errorText) {
    errorText.textContent = aiMailStatus.lastError ?? '';
    errorText.hidden = !aiMailStatus.lastError;
  }
};

const refreshAiMailWindows = () => {
  updateAiMailForwardWindowState();
  updateAiMailFormattingWindowState();
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
  if (status.formatting && (!aiMailFormattingDirty || isSavingAiMailFormatting)) {
    aiMailFormattingDraft = status.formatting;
    aiMailFormattingDirty = false;
  }
  setActionActive('ai-mail-monitor', shouldActivate);
  renderQuickActions();
  renderFeatureCards();
  ensureAiMailAutoRefresh();
  refreshAiMailWindows();
};

const submitAiMailForwardForm = async (options = {}) => {
  const { onSuccess, onFinally } = options;
  const draft = aiMailForwardDraft ?? '';
  const trimmed = draft.trim();

  if (!window.desktopBridge?.updateAiMailForward) {
    updateAiMailStatus({ lastError: '転送先設定のブリッジが見つかりません' });
    renderFeatureCards();
    refreshAiMailWindows();
    if (onFinally) {
      onFinally();
    }
    return;
  }

  if (!trimmed) {
    updateAiMailStatus({ lastError: '転送先メールアドレスを入力してください' });
    renderFeatureCards();
    refreshAiMailWindows();
    if (onFinally) {
      onFinally();
    }
    return;
  }

  if (!isValidEmail(trimmed)) {
    updateAiMailStatus({ lastError: 'メールアドレスの形式が正しくありません' });
    renderFeatureCards();
    refreshAiMailWindows();
    if (onFinally) {
      onFinally();
    }
    return;
  }

  if (isSavingAiMailForward) {
    return;
  }

  isSavingAiMailForward = true;
  renderFeatureCards();
  refreshAiMailWindows();

  try {
    const status = await window.desktopBridge.updateAiMailForward(trimmed);
    if (status) {
      aiMailForwardDirty = false;
      syncAiMailUiFromStatus(status);
      if (onSuccess) {
        onSuccess(status);
      }
      return;
    }
    updateAiMailStatus({ forwardTo: trimmed, lastError: '転送先の更新が反映されませんでした' });
  } catch (error) {
    console.error('Failed to update ai mail forward address', error);
    updateAiMailStatus({ lastError: '転送先の更新に失敗しました' });
  } finally {
    isSavingAiMailForward = false;
    renderFeatureCards();
    refreshAiMailWindows();
    if (onFinally) {
      onFinally();
    }
  }
};

const submitAiMailFormattingForm = async (options = {}) => {
  const { onSuccess, onFinally } = options;
  if (!window.desktopBridge?.updateAiMailFormatting) {
    updateAiMailStatus({ lastError: 'AI整形設定のブリッジが見つかりません' });
    renderFeatureCards();
    refreshAiMailWindows();
    if (onFinally) {
      onFinally();
    }
    return;
  }

  if (isSavingAiMailFormatting) {
    return;
  }

  isSavingAiMailFormatting = true;
  renderFeatureCards();
  refreshAiMailWindows();

  try {
    const payload = normalizeAiMailFormattingPayload();
    const status = await window.desktopBridge.updateAiMailFormatting(payload);
    if (status) {
      aiMailFormattingDirty = false;
      aiMailFormattingDraft = status.formatting ?? payload;
      syncAiMailUiFromStatus(status);
      if (onSuccess) {
        onSuccess(status);
      }
      return;
    }
    updateAiMailStatus({ lastError: 'AI整形設定の更新が反映されませんでした' });
  } catch (error) {
    console.error('Failed to update ai mail formatting', error);
    updateAiMailStatus({ lastError: 'AI整形設定の更新に失敗しました' });
  } finally {
    isSavingAiMailFormatting = false;
    renderFeatureCards();
    refreshAiMailWindows();
    if (onFinally) {
      onFinally();
    }
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
  refreshAiMailWindows();
};

const stopAiMailAutoRefresh = () => {
  if (!aiMailAutoRefreshTimerId) {
    return;
  }
  clearInterval(aiMailAutoRefreshTimerId);
  aiMailAutoRefreshTimerId = null;
};

const ensureAiMailAutoRefresh = () => {
  const aiMailAction = quickActions.find((action) => action.id === 'ai-mail-monitor');
  const shouldRefresh = Boolean(aiMailAction?.active);
  if (!shouldRefresh) {
    stopAiMailAutoRefresh();
    return;
  }
  if (aiMailAutoRefreshTimerId) {
    return;
  }
  aiMailAutoRefreshTimerId = setInterval(() => {
    void refreshAiMailStatus();
  }, AI_MAIL_REFRESH_INTERVAL_MS);
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
    refreshAiMailWindows();
  }
};

const startAiMailMonitor = async () => {
  setActionActive('ai-mail-monitor', true);
  renderQuickActions();
  renderFeatureCards();
  ensureAiMailAutoRefresh();
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
  refreshAiMailWindows();
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
  stopAiMailAutoRefresh();
};

const openAiMailForwardWindow = () => {
  aiMailForwardDraft = aiMailStatus.forwardTo ?? '';
  aiMailForwardDirty = false;
  const { body, close } = createWindowShell('ai-mail-forward', '転送先メールアドレス', () => {
    aiMailForwardWindow = null;
  });
  const closeWindow = () => {
    aiMailForwardWindow = null;
    close();
  };

  const description = document.createElement('p');
  description.textContent = 'POP3監視で使用する転送先メールアドレスを設定します。';
  body.append(description);

  const forwardSection = document.createElement('div');
  forwardSection.className = 'forward-section';

  const forwardLabel = document.createElement('div');
  forwardLabel.className = 'forward-label';
  forwardLabel.textContent = '転送先メールアドレス';

  const forwardForm = document.createElement('form');
  forwardForm.className = 'forward-form';
  forwardForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitAiMailForwardForm({
      onSuccess: closeWindow,
      onFinally: updateAiMailForwardWindowState,
    });
  });

  const forwardRow = document.createElement('div');
  forwardRow.className = 'forward-input-row';

  const forwardInput = document.createElement('input');
  forwardInput.type = 'email';
  forwardInput.className = 'forward-input';
  forwardInput.placeholder = 'example@domain.com';
  forwardInput.value = aiMailForwardDraft ?? '';
  forwardInput.addEventListener('input', (event) => {
    aiMailForwardDraft = event.target.value;
    aiMailForwardDirty = true;
    updateAiMailForwardWindowState();
  });

  const forwardSave = document.createElement('button');
  forwardSave.type = 'submit';
  forwardSave.className = 'primary forward-save';
  forwardSave.textContent = '保存';

  forwardRow.append(forwardInput, forwardSave);
  forwardForm.append(forwardRow);

  const forwardHint = document.createElement('div');
  forwardHint.className = 'forward-hint';
  forwardHint.textContent = '監視を開始するには転送先を設定してください。';

  const forwardError = document.createElement('div');
  forwardError.className = 'form-error';
  forwardError.hidden = true;

  forwardSection.append(forwardLabel, forwardForm, forwardHint, forwardError);
  body.append(forwardSection);

  aiMailForwardWindow = {
    input: forwardInput,
    saveButton: forwardSave,
    hint: forwardHint,
    errorText: forwardError,
    close: closeWindow,
  };
  updateAiMailForwardWindowState();
  forwardInput.focus();
};

const openAiMailFormattingWindow = () => {
  aiMailFormattingDraft = getAiMailFormattingDraft();
  aiMailFormattingDirty = false;
  const { body, close } = createWindowShell('ai-mail-formatting', 'AI整形設定', () => {
    aiMailFormattingWindow = null;
  });
  const closeWindow = () => {
    aiMailFormattingWindow = null;
    close();
  };

  const description = document.createElement('p');
  description.textContent = '転送前にAIで件名・本文を整形する設定を編集します。';
  body.append(description);

  const formattingSection = document.createElement('div');
  formattingSection.className = 'formatting-section';

  const formattingHeader = document.createElement('div');
  formattingHeader.className = 'formatting-header';
  const formattingLabel = document.createElement('div');
  formattingLabel.className = 'forward-label';
  formattingLabel.textContent = 'AI整形設定';
  const formattingChip = document.createElement('span');
  formattingChip.className = 'chip tiny';
  formattingHeader.append(formattingLabel, formattingChip);
  formattingSection.append(formattingHeader);

  const formattingForm = document.createElement('form');
  formattingForm.className = 'formatting-form';
  formattingForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitAiMailFormattingForm({
      onSuccess: closeWindow,
      onFinally: updateAiMailFormattingWindowState,
    });
  });

  const setFormattingDraft = (patch) => {
    aiMailFormattingDraft = { ...getAiMailFormattingDraft(), ...(patch ?? {}) };
    aiMailFormattingDirty = true;
    updateAiMailFormattingWindowState();
  };

  const formattingDraft = getAiMailFormattingDraft();

  const enableRow = document.createElement('label');
  enableRow.className = 'formatting-toggle';
  const enableInput = document.createElement('input');
  enableInput.type = 'checkbox';
  enableInput.checked = formattingDraft.enabled;
  enableInput.addEventListener('change', (event) => {
    setFormattingDraft({ enabled: event.target.checked });
  });
  const enableText = document.createElement('span');
  enableText.textContent = 'AIで件名・本文を整形して転送';
  enableRow.append(enableInput, enableText);
  formattingForm.append(enableRow);

  const providerRow = document.createElement('div');
  providerRow.className = 'formatting-row';
  const providerLabel = document.createElement('div');
  providerLabel.className = 'formatting-label';
  providerLabel.textContent = 'プロバイダ';
  const providerSelect = document.createElement('select');
  providerSelect.className = 'formatting-select';
  providerSelect.value = formattingDraft.provider === 'lmstudio' ? 'lmstudio' : 'openrouter';
  [
    { value: 'openrouter', label: 'OpenRouter' },
    { value: 'lmstudio', label: 'LM Studio' },
  ].forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    providerSelect.append(opt);
  });
  providerSelect.addEventListener('change', (event) => {
    setFormattingDraft({ provider: event.target.value });
  });
  providerRow.append(providerLabel, providerSelect);
  formattingForm.append(providerRow);

  const timeoutRow = document.createElement('div');
  timeoutRow.className = 'formatting-row';
  const timeoutLabel = document.createElement('div');
  timeoutLabel.className = 'formatting-label';
  timeoutLabel.textContent = 'タイムアウト(ms)';
  const timeoutFields = document.createElement('div');
  timeoutFields.className = 'formatting-fields';
  const timeoutInput = document.createElement('input');
  timeoutInput.type = 'number';
  timeoutInput.className = 'formatting-input';
  timeoutInput.inputMode = 'numeric';
  timeoutInput.min = '30000';
  timeoutInput.max = '180000';
  timeoutInput.step = '1000';
  timeoutInput.value = String(formattingDraft.timeoutMs ?? 60000);
  timeoutInput.addEventListener('input', (event) => {
    setFormattingDraft({ timeoutMs: Number(event.target.value) });
  });
  timeoutFields.append(timeoutInput);
  timeoutRow.append(timeoutLabel, timeoutFields);
  formattingForm.append(timeoutRow);

  const timeoutHint = document.createElement('div');
  timeoutHint.className = 'forward-hint';
  timeoutHint.textContent = 'LM Studio利用時はモデル読み込みに時間がかかるため60,000ms以上を推奨します。';
  formattingForm.append(timeoutHint);

  const openRouterRow = document.createElement('div');
  openRouterRow.className = 'formatting-row provider-row';
  const openRouterLabel = document.createElement('div');
  openRouterLabel.className = 'formatting-label';
  openRouterLabel.textContent = 'OpenRouter';
  const openRouterFields = document.createElement('div');
  openRouterFields.className = 'formatting-fields';
  const openRouterKey = document.createElement('input');
  openRouterKey.type = 'password';
  openRouterKey.className = 'formatting-input';
  openRouterKey.placeholder = 'sk-...';
  openRouterKey.value = formattingDraft.openRouter?.apiKey ?? '';
  openRouterKey.addEventListener('input', (event) => {
    const base = getAiMailFormattingDraft().openRouter ?? {};
    setFormattingDraft({ openRouter: { ...base, apiKey: event.target.value } });
  });
  const openRouterModel = document.createElement('input');
  openRouterModel.type = 'text';
  openRouterModel.className = 'formatting-input';
  openRouterModel.placeholder = 'gpt-4o-mini';
  openRouterModel.value = formattingDraft.openRouter?.model || 'gpt-4o-mini';
  openRouterModel.addEventListener('input', (event) => {
    const base = getAiMailFormattingDraft().openRouter ?? {};
    setFormattingDraft({ openRouter: { ...base, model: event.target.value } });
  });
  openRouterFields.append(openRouterKey, openRouterModel);
  openRouterRow.append(openRouterLabel, openRouterFields);
  formattingForm.append(openRouterRow);

  const lmStudioRow = document.createElement('div');
  lmStudioRow.className = 'formatting-row provider-row';
  const lmStudioLabel = document.createElement('div');
  lmStudioLabel.className = 'formatting-label';
  lmStudioLabel.textContent = 'LM Studio';
  const lmStudioFields = document.createElement('div');
  lmStudioFields.className = 'formatting-fields';
  const lmStudioEndpoint = document.createElement('input');
  lmStudioEndpoint.type = 'text';
  lmStudioEndpoint.className = 'formatting-input';
  lmStudioEndpoint.placeholder = 'http://localhost:1234/v1/chat/completions';
  lmStudioEndpoint.value = formattingDraft.lmStudio?.endpoint || 'http://localhost:1234/v1/chat/completions';
  lmStudioEndpoint.addEventListener('input', (event) => {
    const base = getAiMailFormattingDraft().lmStudio ?? {};
    setFormattingDraft({ lmStudio: { ...base, endpoint: event.target.value } });
  });
  const lmStudioModel = document.createElement('input');
  lmStudioModel.type = 'text';
  lmStudioModel.className = 'formatting-input';
  lmStudioModel.placeholder = 'モデル名';
  lmStudioModel.value = formattingDraft.lmStudio?.model || 'gpt-4o-mini';
  lmStudioModel.addEventListener('input', (event) => {
    const base = getAiMailFormattingDraft().lmStudio ?? {};
    setFormattingDraft({ lmStudio: { ...base, model: event.target.value } });
  });
  lmStudioFields.append(lmStudioEndpoint, lmStudioModel);
  lmStudioRow.append(lmStudioLabel, lmStudioFields);
  formattingForm.append(lmStudioRow);

  const promptLabel = document.createElement('div');
  promptLabel.className = 'forward-label';
  promptLabel.textContent = '整形プロンプト';
  const promptInput = document.createElement('textarea');
  promptInput.className = 'formatting-textarea';
  promptInput.value = formattingDraft.prompt ?? '';
  promptInput.rows = 6;
  promptInput.addEventListener('input', (event) => {
    setFormattingDraft({ prompt: event.target.value });
  });
  const promptHint = document.createElement('div');
  promptHint.className = 'forward-hint';
  promptHint.textContent = '件名と本文を含むJSON形式で返すよう指示してください。空欄の場合は作業ディレクトリ/Mail/Prompt/default.txtの既定プロンプトを使用します。';
  const promptActions = document.createElement('div');
  promptActions.className = 'formatting-actions';
  const promptResetButton = document.createElement('button');
  promptResetButton.type = 'button';
  promptResetButton.className = 'ghost';
  promptResetButton.textContent = 'デフォルトに戻す';
  promptResetButton.addEventListener('click', async () => {
    if (isSyncingAiMailDefaultPrompt) {
      return;
    }
    isSyncingAiMailDefaultPrompt = true;
    refreshAiMailWindows();
    try {
      const prompt = await hydrateAiMailDefaultPrompt();
      setFormattingDraft({ prompt });
    } catch (error) {
      console.error('Failed to load default ai mail prompt', error);
      updateAiMailStatus({ lastError: 'デフォルトプロンプトの読込に失敗しました' });
      renderFeatureCards();
    } finally {
      isSyncingAiMailDefaultPrompt = false;
      refreshAiMailWindows();
    }
  });
  const promptRegisterButton = document.createElement('button');
  promptRegisterButton.type = 'button';
  promptRegisterButton.className = 'ghost';
  promptRegisterButton.textContent = 'デフォルト登録';
  promptRegisterButton.addEventListener('click', async () => {
    if (isSyncingAiMailDefaultPrompt) {
      return;
    }
    if (!window.desktopBridge?.saveAiMailDefaultPrompt) {
      updateAiMailStatus({ lastError: 'デフォルトプロンプト保存のブリッジが見つかりません' });
      renderFeatureCards();
      refreshAiMailWindows();
      return;
    }
    isSyncingAiMailDefaultPrompt = true;
    refreshAiMailWindows();
    try {
      const draftPrompt = (getAiMailFormattingDraft().prompt ?? '').trim() || aiMailDefaultPrompt;
      const saved = await window.desktopBridge.saveAiMailDefaultPrompt(draftPrompt);
      if (saved && typeof saved === 'string') {
        aiMailDefaultPrompt = saved;
      }
    } catch (error) {
      console.error('Failed to save default ai mail prompt', error);
      updateAiMailStatus({ lastError: 'デフォルトプロンプトの保存に失敗しました' });
      renderFeatureCards();
    } finally {
      isSyncingAiMailDefaultPrompt = false;
      refreshAiMailWindows();
    }
  });
  promptActions.append(promptResetButton, promptRegisterButton);

  formattingForm.append(promptLabel, promptInput, promptHint, promptActions);

  const formattingActions = document.createElement('div');
  formattingActions.className = 'formatting-actions';
  const formattingSave = document.createElement('button');
  formattingSave.type = 'submit';
  formattingSave.className = 'primary forward-save';
  formattingActions.append(formattingSave);
  formattingForm.append(formattingActions);

  formattingSection.append(formattingForm);

  const formattingError = document.createElement('div');
  formattingError.className = 'form-error';
  formattingError.hidden = true;
  formattingSection.append(formattingError);
  body.append(formattingSection);

  aiMailFormattingWindow = {
    enableInput,
    providerSelect,
    openRouterRow,
    openRouterKey,
    openRouterModel,
    lmStudioRow,
    lmStudioEndpoint,
    lmStudioModel,
    timeoutInput,
    promptInput,
    promptResetButton,
    promptRegisterButton,
    saveButton: formattingSave,
    statusChip: formattingChip,
    errorText: formattingError,
    close: closeWindow,
  };
  updateAiMailFormattingWindowState();
  enableInput.focus();
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

  const configActions = document.createElement('div');
  configActions.className = 'feature-actions';
  const forwardButton = document.createElement('button');
  forwardButton.className = 'ghost';
  forwardButton.textContent = '転送先を設定';
  forwardButton.addEventListener('click', openAiMailForwardWindow);
  const formattingButton = document.createElement('button');
  formattingButton.className = 'ghost';
  formattingButton.textContent = 'AI整形設定';
  formattingButton.addEventListener('click', openAiMailFormattingWindow);

  const formattingState = aiMailStatus.formatting ?? buildDefaultAiFormatting();
  const providerLabel = formattingState.provider === 'lmstudio' ? 'LM Studio' : 'OpenRouter';
  const formattingStatusChip = document.createElement('span');
  formattingStatusChip.className = 'chip tiny';
  formattingStatusChip.textContent = formattingState.enabled ? `${providerLabel} ON` : 'AI整形OFF';
  formattingStatusChip.classList.toggle('muted', !formattingState.enabled);

  configActions.append(forwardButton, formattingButton, formattingStatusChip);

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

  card.append(header, statusGrid, configActions, actions, desc);
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
  if (!workspaceChip || !window.desktopBridge?.changeWorkspaceDirectory) return;
  workspaceChip.disabled = true;
  try {
    const dir = await window.desktopBridge.changeWorkspaceDirectory();
    workspacePath = dir || workspacePath;
    updateWorkspaceChip(workspacePath);
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
  renderQuickActions();
  renderFeatureCards();
  setupQuickActionsResizeObserver();
  void hydrateWorkspaceChip();
  void hydrateAiMailDefaultPrompt().finally(() => { void hydrateAiMailStatus(); });
  hydrateSystemInfo();
  updateClock();
  setInterval(updateClock, 30000);
  workspaceChip?.addEventListener('click', () => void handleWorkspaceChange());
  sidePanelToggleButton?.addEventListener('click', toggleSidePanel);
  
  // グローバルイベントリスナーは一度だけ登録
  document.addEventListener('mousemove', handleGlobalMouseMove);
  document.addEventListener('mouseup', handleGlobalMouseUp);
  window.addEventListener('resize', handleViewportResize);
};

boot();
