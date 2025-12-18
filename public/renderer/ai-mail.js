import { formatDateTime } from './utils/time.js';

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

export const createAiMailFeature = ({ createWindowShell, setActionActive, isActionActive, renderUi }) => {
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
    lastResolvedForwardTo: null,
    lastResolvedForwardSource: null,
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

  const isValidEmail = (value) => {
    const target = String(value ?? '').trim();
    if (!target) return false;
    return /.+@.+\..+/.test(target);
  };

  const formatForwardSourceLabel = (source) => {
    if (!source) return '';
    if (source === 'ai-decode:text') return '本文(AI解読用)';
    if (source === 'ai-decode:html') return 'HTML(AI解読用)';
    if (source === 'fallback') return '予備転送先';
    return String(source);
  };

  const render = () => {
    if (typeof renderUi === 'function') {
      renderUi();
    }
  };

  const renderWithWindows = () => {
    render();
    refreshAiMailWindows();
  };

  const isAiMailActionActive = () => {
    if (typeof isActionActive !== 'function') return false;
    return Boolean(isActionActive('ai-mail-monitor'));
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
      saveButton.disabled = isSavingAiMailForward || trimmedDraft === savedForward;
      saveButton.textContent = isSavingAiMailForward ? '保存中…' : '保存';
    }
    if (hint) {
      hint.textContent = savedForward
        ? `現在の予備転送先: ${savedForward}（空欄で解除）`
        : '予備転送先は未設定です（本文の「AI解読用」返信先を優先して転送します）。';
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
    const shouldActivate = Boolean(status.running || isAiMailActionActive());
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
    setActionActive?.('ai-mail-monitor', shouldActivate);
    render();
    ensureAiMailAutoRefresh();
    refreshAiMailWindows();
  };

  const submitAiMailForwardForm = async (options = {}) => {
    const { onSuccess, onFinally } = options;
    const draft = aiMailForwardDraft ?? '';
    const trimmed = draft.trim();

    if (!window.desktopBridge?.updateAiMailForward) {
      updateAiMailStatus({ lastError: '予備転送先設定のブリッジが見つかりません' });
      renderWithWindows();
      if (onFinally) {
        onFinally();
      }
      return;
    }

    if (trimmed && !isValidEmail(trimmed)) {
      updateAiMailStatus({ lastError: 'メールアドレスの形式が正しくありません' });
      renderWithWindows();
      if (onFinally) {
        onFinally();
      }
      return;
    }

    if (isSavingAiMailForward) {
      return;
    }

    isSavingAiMailForward = true;
    renderWithWindows();

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
      updateAiMailStatus({ forwardTo: trimmed, lastError: '予備転送先の更新が反映されませんでした' });
    } catch (error) {
      console.error('Failed to update ai mail forward address', error);
      updateAiMailStatus({ lastError: '予備転送先の更新に失敗しました' });
    } finally {
      isSavingAiMailForward = false;
      renderWithWindows();
      if (onFinally) {
        onFinally();
      }
    }
  };

  const submitAiMailFormattingForm = async (options = {}) => {
    const { onSuccess, onFinally } = options;
    if (!window.desktopBridge?.updateAiMailFormatting) {
      updateAiMailStatus({ lastError: 'AI整形設定のブリッジが見つかりません' });
      renderWithWindows();
      if (onFinally) {
        onFinally();
      }
      return;
    }

    if (isSavingAiMailFormatting) {
      return;
    }

    isSavingAiMailFormatting = true;
    renderWithWindows();

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
      renderWithWindows();
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
    renderWithWindows();
  };

  const stopAiMailAutoRefresh = () => {
    if (!aiMailAutoRefreshTimerId) {
      return;
    }
    clearInterval(aiMailAutoRefreshTimerId);
    aiMailAutoRefreshTimerId = null;
  };

  const ensureAiMailAutoRefresh = () => {
    const shouldRefresh = isAiMailActionActive();
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
    render();
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
      renderWithWindows();
    }
  };

  const startAiMailMonitor = async () => {
    setActionActive?.('ai-mail-monitor', true);
    render();
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
    renderWithWindows();
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
    setActionActive?.('ai-mail-monitor', false);
    render();
    stopAiMailAutoRefresh();
  };

  const openAiMailPanel = async () => {
    setActionActive?.('ai-mail-monitor', true);
    render();
    ensureAiMailAutoRefresh();
    await hydrateAiMailStatus();
  };

  const openAiMailForwardWindow = () => {
    aiMailForwardDraft = aiMailStatus.forwardTo ?? '';
    aiMailForwardDirty = false;
    const { body, close } = createWindowShell('ai-mail-forward', '予備転送先メールアドレス', () => {
      aiMailForwardWindow = null;
    });
    const closeWindow = () => {
      aiMailForwardWindow = null;
      close();
    };

    const description = document.createElement('p');
    description.textContent = '本文の「AI解読用」に記載された返信先メールアドレスを優先して転送します。ここでは返信先が取得できない場合の予備転送先を設定できます（空欄で解除）。';
    body.append(description);

    const forwardSection = document.createElement('div');
    forwardSection.className = 'forward-section';

    const forwardLabel = document.createElement('div');
    forwardLabel.className = 'forward-label';
    forwardLabel.textContent = '予備転送先メールアドレス';

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
    forwardHint.textContent = '予備転送先は未設定です（空欄で解除）。';

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
      const shouldReset = window.confirm('整形プロンプトをデフォルトに戻します。よろしいですか？');
      if (!shouldReset) {
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
        render();
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
        renderWithWindows();
        return;
      }
      const shouldRegister = window.confirm('現在の整形プロンプトをデフォルトとして保存します。上書きしてよろしいですか？');
      if (!shouldRegister) {
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
        render();
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
      makeRow(
        '自動転送先',
        aiMailStatus.lastResolvedForwardTo
          ? `${aiMailStatus.lastResolvedForwardTo}${aiMailStatus.lastResolvedForwardSource ? ` (${formatForwardSourceLabel(aiMailStatus.lastResolvedForwardSource)})` : ''}`
          : '未判定',
      ),
      makeRow('予備転送先', aiMailStatus.forwardTo || '未設定'),
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
    forwardButton.textContent = '予備転送先を設定';
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
        void stopAiMailMonitor();
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
    fetchBtn.disabled = isFetchingAiMailOnce;
    fetchBtn.addEventListener('click', () => { void fetchAiMailOnce(); });

    actions.append(toggleBtn, refreshBtn, fetchBtn);

    const desc = document.createElement('div');
    desc.className = 'feature-desc';
    desc.textContent = aiMailStatus.running
      ? 'wx105.wadax-sv.jp のPOP3(995/TLS)を監視し、新着をSMTP(587/STARTTLS)で転送します。'
      : '監視を開始すると受信メールを検知し、本文の「AI解読用」返信先へ自動転送します（取得できない場合は予備転送先）。';

    card.append(header, statusGrid, configActions, actions, desc);
    return card;
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
      render();
    }
  };

  const hydrate = async () => {
    await hydrateAiMailDefaultPrompt();
    await hydrateAiMailStatus();
  };

  const isWarning = (actionActive) => actionActive && !aiMailStatus.running;
  const isRunning = () => aiMailStatus.running;

  return {
    buildCard: buildAiMailCard,
    startMonitor: startAiMailMonitor,
    stopMonitor: stopAiMailMonitor,
    openPanel: openAiMailPanel,
    closePanel: closeAiMailPanel,
    hydrate,
    isWarning,
    isRunning,
  };
};
