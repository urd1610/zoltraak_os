const DEFAULT_LM_STUDIO_ENDPOINT = 'http://localhost:1234/v1/chat/completions';
const DEFAULT_MODEL_BY_PROVIDER = {
  openrouter: 'gpt-4o-mini',
  lmstudio: 'gpt-4o-mini',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-1.5-flash',
};

const PROVIDER_LABELS = {
  lmstudio: 'LM Studio',
  openrouter: 'OpenRouter',
  openai: 'ChatGPT (OpenAI)',
  gemini: 'Gemini',
};

const PROVIDER_OPTIONS = [
  { value: 'lmstudio', label: 'LM Studio (ローカル)' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'openai', label: 'ChatGPT (OpenAI)' },
  { value: 'gemini', label: 'Gemini' },
];

const AI_FEATURES = [
  {
    id: 'ai-mail-monitor',
    label: 'AIメール監視',
    description: 'メール整形と自動転送に使うモデルを選択します。',
    providers: new Set(['lmstudio', 'openrouter']),
  },
  {
    id: 'chat',
    label: 'チャット',
    description: 'チャット機能のモデルを予約設定します。',
    badge: '準備中',
    providers: new Set(['openrouter', 'lmstudio', 'openai', 'gemini']),
  },
];

const buildFallbackSettings = () => ({
  profiles: [
    {
      id: 'local-lm',
      label: 'ローカルLLM (LM Studio)',
      provider: 'lmstudio',
      model: DEFAULT_MODEL_BY_PROVIDER.lmstudio,
      endpoint: DEFAULT_LM_STUDIO_ENDPOINT,
      apiKey: '',
    },
    {
      id: 'openrouter-default',
      label: 'OpenRouter',
      provider: 'openrouter',
      model: DEFAULT_MODEL_BY_PROVIDER.openrouter,
      apiKey: '',
    },
  ],
  featureMap: {
    'ai-mail-monitor': 'local-lm',
    chat: 'openrouter-default',
  },
});

const cloneSettings = (settings) => ({
  profiles: Array.isArray(settings?.profiles) ? settings.profiles.map((profile) => ({ ...profile })) : [],
  featureMap: { ...(settings?.featureMap ?? {}) },
});

const normalizeProvider = (provider) => {
  const raw = String(provider ?? '').toLowerCase();
  if (PROVIDER_LABELS[raw]) {
    return raw;
  }
  return 'openrouter';
};

const getProviderLabel = (provider) => PROVIDER_LABELS[provider] ?? 'OpenRouter';

const generateProfileId = () => `model-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeProfile = (profile = {}) => {
  const provider = normalizeProvider(profile.provider);
  const modelFallback = DEFAULT_MODEL_BY_PROVIDER[provider] ?? DEFAULT_MODEL_BY_PROVIDER.openrouter;
  return {
    id: profile.id || generateProfileId(),
    label: profile.label?.trim() || getProviderLabel(provider),
    provider,
    model: profile.model?.trim() || modelFallback,
    endpoint: profile.endpoint?.trim() || DEFAULT_LM_STUDIO_ENDPOINT,
    apiKey: profile.apiKey ?? '',
  };
};

const getAllowedProfiles = (featureId, profiles) => {
  const feature = AI_FEATURES.find((item) => item.id === featureId);
  if (!feature?.providers) {
    return profiles;
  }
  return profiles.filter((profile) => feature.providers.has(profile.provider));
};

const normalizeFeatureSelections = (draft) => {
  const next = { ...draft, featureMap: { ...(draft.featureMap ?? {}) } };
  AI_FEATURES.forEach((feature) => {
    const allowed = getAllowedProfiles(feature.id, next.profiles);
    const currentId = next.featureMap[feature.id];
    const hasValid = allowed.some((profile) => profile.id === currentId);
    next.featureMap[feature.id] = hasValid ? currentId : (allowed[0]?.id ?? '');
  });
  return next;
};

const normalizeDraft = (draft) => {
  const profiles = Array.isArray(draft?.profiles) && draft.profiles.length > 0
    ? draft.profiles.map(normalizeProfile)
    : [normalizeProfile({})];
  return normalizeFeatureSelections({
    profiles,
    featureMap: { ...(draft?.featureMap ?? {}) },
  });
};

const buildProfileOptionLabel = (profile) => {
  const provider = getProviderLabel(profile.provider);
  const model = profile.model ? ` / ${profile.model}` : '';
  return `${profile.label} (${provider}${model})`;
};

const buildUsageLabel = (profileId, featureMap) => {
  const usedBy = AI_FEATURES
    .filter((feature) => featureMap?.[feature.id] === profileId)
    .map((feature) => feature.label);
  if (usedBy.length === 0) {
    return '未使用';
  }
  return `利用中: ${usedBy.join(' / ')}`;
};

export const createAiModelSettings = ({ createWindowShell, onSettingsSaved }) => {
  let aiModelSettings = null;
  let aiModelDraft = null;
  let aiModelDirty = false;
  let isSaving = false;
  let aiSettingsWindow = null;

  const hydrateSettings = async () => {
    if (!window.desktopBridge?.getAiModelSettings) {
      aiModelSettings = buildFallbackSettings();
      return aiModelSettings;
    }
    try {
      const loaded = await window.desktopBridge.getAiModelSettings();
      aiModelSettings = loaded ?? buildFallbackSettings();
    } catch (error) {
      console.error('Failed to hydrate ai model settings', error);
      aiModelSettings = buildFallbackSettings();
    }
    return aiModelSettings;
  };

  const updateDraft = (nextDraft, options = {}) => {
    aiModelDraft = normalizeDraft(nextDraft);
    aiModelDirty = true;
    if (options.refreshFeatures) {
      renderFeatureList();
    }
    if (options.refreshProfiles) {
      renderProfileList();
    }
    updateAiSettingsWindowState();
  };

  const renderFeatureList = () => {
    if (!aiSettingsWindow?.featureList) return;
    const { featureList } = aiSettingsWindow;
    featureList.innerHTML = '';
    const rows = [];

    AI_FEATURES.forEach((feature) => {
      const row = document.createElement('div');
      row.className = 'ai-feature-row';

      const info = document.createElement('div');
      info.className = 'ai-feature-info';
      const title = document.createElement('div');
      title.className = 'ai-feature-title';
      title.textContent = feature.label;
      if (feature.badge) {
        const badge = document.createElement('span');
        badge.className = 'chip tiny muted';
        badge.textContent = feature.badge;
        title.append(badge);
      }
      const desc = document.createElement('div');
      desc.className = 'ai-feature-desc';
      desc.textContent = feature.description;
      info.append(title, desc);

      const select = document.createElement('select');
      select.className = 'formatting-select';
      const allowedProfiles = getAllowedProfiles(feature.id, aiModelDraft?.profiles ?? []);
      if (allowedProfiles.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '対応モデルがありません';
        select.append(option);
        select.disabled = true;
        select.dataset.locked = 'true';
      } else {
        allowedProfiles.forEach((profile) => {
          const option = document.createElement('option');
          option.value = profile.id;
          option.textContent = buildProfileOptionLabel(profile);
          select.append(option);
        });
        select.value = aiModelDraft?.featureMap?.[feature.id] ?? allowedProfiles[0]?.id ?? '';
        select.dataset.locked = 'false';
      }
      select.addEventListener('change', (event) => {
        updateDraft({
          ...aiModelDraft,
          featureMap: {
            ...(aiModelDraft?.featureMap ?? {}),
            [feature.id]: event.target.value,
          },
        });
      });

      row.append(info, select);
      featureList.append(row);
      rows.push({ select });
    });

    aiSettingsWindow.featureRows = rows;
  };

  const renderProfileList = () => {
    if (!aiSettingsWindow?.profileList) return;
    const { profileList } = aiSettingsWindow;
    profileList.innerHTML = '';
    const rows = [];

    (aiModelDraft?.profiles ?? []).forEach((profile) => {
      const card = document.createElement('div');
      card.className = 'ai-model-card';

      const cardHeader = document.createElement('div');
      cardHeader.className = 'ai-model-card-header';
      const cardTitle = document.createElement('div');
      cardTitle.className = 'ai-model-card-title';
      cardTitle.textContent = profile.label || getProviderLabel(profile.provider);
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'ghost ai-model-remove';
      removeButton.textContent = '削除';
      const removeLocked = (aiModelDraft?.profiles?.length ?? 0) <= 1;
      removeButton.disabled = removeLocked;
      removeButton.addEventListener('click', () => {
        const nextProfiles = (aiModelDraft?.profiles ?? []).filter((item) => item.id !== profile.id);
        updateDraft({ ...aiModelDraft, profiles: nextProfiles }, { refreshFeatures: true, refreshProfiles: true });
      });
      cardHeader.append(cardTitle, removeButton);

      const nameRow = document.createElement('div');
      nameRow.className = 'formatting-row';
      const nameLabel = document.createElement('div');
      nameLabel.className = 'formatting-label';
      nameLabel.textContent = '表示名';
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'formatting-input';
      nameInput.value = profile.label ?? '';
      nameInput.dataset.profileId = profile.id;
      nameInput.addEventListener('input', (event) => {
        const nextLabel = event.target.value;
        const providerLabel = getProviderLabel(normalizeProvider(providerSelect?.value));
        cardTitle.textContent = nextLabel.trim() || providerLabel;
        updateDraft({
          ...aiModelDraft,
          profiles: (aiModelDraft?.profiles ?? []).map((item) => (
            item.id === profile.id ? { ...item, label: nextLabel } : item
          )),
        });
      });
      nameRow.append(nameLabel, nameInput);

      const providerRow = document.createElement('div');
      providerRow.className = 'formatting-row';
      const providerLabel = document.createElement('div');
      providerLabel.className = 'formatting-label';
      providerLabel.textContent = 'プロバイダ';
      const providerSelect = document.createElement('select');
      providerSelect.className = 'formatting-select';
      PROVIDER_OPTIONS.forEach((option) => {
        const opt = document.createElement('option');
        opt.value = option.value;
        opt.textContent = option.label;
        providerSelect.append(opt);
      });
      providerSelect.value = profile.provider ?? 'openrouter';
      providerSelect.addEventListener('change', (event) => {
        const nextProvider = normalizeProvider(event.target.value);
        const currentProfile = (aiModelDraft?.profiles ?? []).find((item) => item.id === profile.id) ?? profile;
        const nextModel = currentProfile.model?.trim() || DEFAULT_MODEL_BY_PROVIDER[nextProvider];
        updateDraft({
          ...aiModelDraft,
          profiles: (aiModelDraft?.profiles ?? []).map((item) => (
            item.id === profile.id
              ? {
                ...item,
                provider: nextProvider,
                model: nextModel,
                endpoint: item.endpoint?.trim() || DEFAULT_LM_STUDIO_ENDPOINT,
              }
              : item
          )),
        }, { refreshFeatures: true });
        updateAiSettingsWindowState();
      });
      providerRow.append(providerLabel, providerSelect);

      const modelRow = document.createElement('div');
      modelRow.className = 'formatting-row';
      const modelLabel = document.createElement('div');
      modelLabel.className = 'formatting-label';
      modelLabel.textContent = 'モデル名';
      const modelInput = document.createElement('input');
      modelInput.type = 'text';
      modelInput.className = 'formatting-input';
      modelInput.value = profile.model ?? '';
      modelInput.addEventListener('input', (event) => {
        updateDraft({
          ...aiModelDraft,
          profiles: (aiModelDraft?.profiles ?? []).map((item) => (
            item.id === profile.id ? { ...item, model: event.target.value } : item
          )),
        });
      });
      modelRow.append(modelLabel, modelInput);

      const apiKeyRow = document.createElement('div');
      apiKeyRow.className = 'formatting-row';
      const apiKeyLabel = document.createElement('div');
      apiKeyLabel.className = 'formatting-label';
      apiKeyLabel.textContent = 'APIキー';
      const apiKeyInput = document.createElement('input');
      apiKeyInput.type = 'password';
      apiKeyInput.className = 'formatting-input';
      apiKeyInput.placeholder = 'sk-...';
      apiKeyInput.value = profile.apiKey ?? '';
      apiKeyInput.addEventListener('input', (event) => {
        updateDraft({
          ...aiModelDraft,
          profiles: (aiModelDraft?.profiles ?? []).map((item) => (
            item.id === profile.id ? { ...item, apiKey: event.target.value } : item
          )),
        });
      });
      apiKeyRow.append(apiKeyLabel, apiKeyInput);

      const endpointRow = document.createElement('div');
      endpointRow.className = 'formatting-row';
      const endpointLabel = document.createElement('div');
      endpointLabel.className = 'formatting-label';
      endpointLabel.textContent = 'エンドポイント';
      const endpointInput = document.createElement('input');
      endpointInput.type = 'text';
      endpointInput.className = 'formatting-input';
      endpointInput.placeholder = DEFAULT_LM_STUDIO_ENDPOINT;
      endpointInput.value = profile.endpoint ?? DEFAULT_LM_STUDIO_ENDPOINT;
      endpointInput.addEventListener('input', (event) => {
        updateDraft({
          ...aiModelDraft,
          profiles: (aiModelDraft?.profiles ?? []).map((item) => (
            item.id === profile.id ? { ...item, endpoint: event.target.value } : item
          )),
        });
      });
      endpointRow.append(endpointLabel, endpointInput);

      const usage = document.createElement('div');
      usage.className = 'ai-model-usage';
      usage.textContent = buildUsageLabel(profile.id, aiModelDraft?.featureMap ?? {});

      card.append(cardHeader, nameRow, providerRow, modelRow, apiKeyRow, endpointRow, usage);
      profileList.append(card);

      rows.push({
        profileId: profile.id,
        providerSelect,
        modelInput,
        nameInput,
        apiKeyRow,
        apiKeyInput,
        endpointRow,
        endpointInput,
        removeButton,
        removeLocked,
        usage,
      });
    });

    aiSettingsWindow.profileRows = rows;
  };

  const updateAiSettingsWindowState = () => {
    if (!aiSettingsWindow) return;
    const { saveButton, errorText } = aiSettingsWindow;
    if (saveButton) {
      saveButton.disabled = !aiModelDirty || isSaving;
      saveButton.textContent = isSaving ? '保存中…' : '保存';
    }
    if (errorText) {
      errorText.hidden = !errorText.textContent;
    }
    aiSettingsWindow.featureRows?.forEach(({ select }) => {
      if (select) {
        select.disabled = isSaving || select.dataset.locked === 'true';
      }
    });
    aiSettingsWindow.profileRows?.forEach((row) => {
      const provider = normalizeProvider(row.providerSelect?.value);
      if (row.providerSelect) row.providerSelect.disabled = isSaving;
      if (row.modelInput) row.modelInput.disabled = isSaving;
      if (row.nameInput) row.nameInput.disabled = isSaving;
      if (row.apiKeyInput) row.apiKeyInput.disabled = isSaving;
      if (row.endpointInput) row.endpointInput.disabled = isSaving;
      if (row.removeButton) {
        row.removeButton.disabled = isSaving || row.removeLocked;
      }
      if (row.apiKeyRow) {
        row.apiKeyRow.hidden = provider === 'lmstudio';
      }
      if (row.endpointRow) {
        row.endpointRow.hidden = provider !== 'lmstudio';
      }
      if (row.usage) {
        row.usage.textContent = buildUsageLabel(row.profileId, aiModelDraft?.featureMap ?? {});
      }
    });
  };

  const submitAiModelSettings = async () => {
    if (!window.desktopBridge?.saveAiModelSettings) {
      if (aiSettingsWindow?.errorText) {
        aiSettingsWindow.errorText.textContent = 'AIモデル設定の保存ブリッジが見つかりません';
      }
      updateAiSettingsWindowState();
      return;
    }
    if (isSaving) {
      return;
    }
    isSaving = true;
    if (aiSettingsWindow?.errorText) {
      aiSettingsWindow.errorText.textContent = '';
    }
    updateAiSettingsWindowState();
    try {
      const saved = await window.desktopBridge.saveAiModelSettings(aiModelDraft);
      aiModelSettings = saved ?? aiModelDraft;
      aiModelDraft = normalizeDraft(cloneSettings(aiModelSettings));
      aiModelDirty = false;
      renderFeatureList();
      renderProfileList();
      if (typeof onSettingsSaved === 'function') {
        onSettingsSaved(aiModelSettings);
      }
    } catch (error) {
      console.error('Failed to save ai model settings', error);
      if (aiSettingsWindow?.errorText) {
        aiSettingsWindow.errorText.textContent = 'AIモデル設定の保存に失敗しました';
      }
    } finally {
      isSaving = false;
      updateAiSettingsWindowState();
    }
  };

  const openAiModelSettings = async () => {
    await hydrateSettings();
    aiModelDraft = normalizeDraft(cloneSettings(aiModelSettings));
    aiModelDirty = false;

    const { body, close } = createWindowShell('ai-model-settings', 'AIモデル設定', () => {
      aiSettingsWindow = null;
    });

    const description = document.createElement('p');
    description.textContent = '機能ごとに利用するAIモデルを切り替え、プロバイダ設定を管理できます。';
    body.append(description);

    const featureSection = document.createElement('section');
    featureSection.className = 'ai-settings-section';
    const featureHeader = document.createElement('div');
    featureHeader.className = 'ai-settings-header';
    const featureTitle = document.createElement('h3');
    featureTitle.textContent = '機能ごとのモデル';
    featureHeader.append(featureTitle);
    const featureList = document.createElement('div');
    featureList.className = 'ai-feature-list';
    featureSection.append(featureHeader, featureList);

    const profilesSection = document.createElement('section');
    profilesSection.className = 'ai-settings-section';
    const profilesHeader = document.createElement('div');
    profilesHeader.className = 'ai-settings-header';
    const profilesTitle = document.createElement('h3');
    profilesTitle.textContent = 'モデルプロファイル';
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'ghost';
    addButton.textContent = 'モデルを追加';
    addButton.addEventListener('click', () => {
      const nextProfiles = [...(aiModelDraft?.profiles ?? []), normalizeProfile({})];
      updateDraft({ ...aiModelDraft, profiles: nextProfiles }, { refreshFeatures: true, refreshProfiles: true });
    });
    profilesHeader.append(profilesTitle, addButton);
    const profileList = document.createElement('div');
    profileList.className = 'ai-model-list';
    profilesSection.append(profilesHeader, profileList);

    const actions = document.createElement('div');
    actions.className = 'ai-settings-actions';
    const errorText = document.createElement('div');
    errorText.className = 'form-error';
    errorText.hidden = true;
    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'primary';
    saveButton.textContent = '保存';
    saveButton.addEventListener('click', () => { void submitAiModelSettings(); });
    actions.append(errorText, saveButton);

    body.append(featureSection, profilesSection, actions);

    aiSettingsWindow = {
      featureList,
      profileList,
      saveButton,
      errorText,
      addButton,
      close,
      featureRows: [],
      profileRows: [],
    };

    renderFeatureList();
    renderProfileList();
    updateAiSettingsWindowState();
  };

  return {
    openPanel: openAiModelSettings,
  };
};
