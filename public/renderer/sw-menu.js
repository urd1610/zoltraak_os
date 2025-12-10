const DEFAULT_STATUS = {
  ready: false,
  database: 'zoltraak',
  host: '192.168.0.156',
  port: 3306,
  user: 'alluser',
  lastInitializedAt: null,
  lastError: null,
};

const buildStatusRow = (label, value, type) => {
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

const buildList = (title, items, renderItem, emptyText = 'データがありません') => {
  const section = document.createElement('div');
  section.className = 'sw-section';

  const header = document.createElement('div');
  header.className = 'sw-section-header';
  const heading = document.createElement('div');
  heading.className = 'forward-label';
  heading.textContent = title;
  header.append(heading);

  const list = document.createElement('div');
  list.className = 'sw-list';

  if (items?.length) {
    items.forEach((item) => {
      const row = renderItem(item);
      list.append(row);
    });
  } else {
    const empty = document.createElement('div');
    empty.className = 'sw-empty';
    empty.textContent = emptyText;
    list.append(empty);
  }

  section.append(header, list);
  return section;
};

const buildSection = (title, content) => {
  const section = document.createElement('div');
  section.className = 'sw-section';
  const header = document.createElement('div');
  header.className = 'sw-section-header';
  const heading = document.createElement('div');
  heading.className = 'forward-label';
  heading.textContent = title;
  header.append(heading);
  section.append(header, content);
  return section;
};

export const createSwMenuFeature = ({ createWindowShell, setActionActive, isActionActive, renderUi }) => {
  const state = {
    status: { ...DEFAULT_STATUS },
    overview: {
      components: [],
      boms: [],
      flows: [],
    },
    drafts: {
      component: { code: '', name: '', version: '', description: '' },
      bom: { parentCode: '', childCode: '', quantity: '1', note: '' },
      flow: { componentCode: '', quantity: '', status: 'in-stock', updatedBy: 'operator' },
    },
    flags: {
      isInitializing: false,
      isRefreshing: false,
      isSavingComponent: false,
      isSavingBom: false,
      isSavingFlow: false,
    },
  };

  const render = () => {
    if (typeof renderUi === 'function') {
      renderUi();
    }
  };

  const applyStatus = (payload = {}) => {
    state.status = {
      ...DEFAULT_STATUS,
      ...state.status,
      ...payload,
    };
  };

  const ensureBridge = (method) => {
    if (!window.desktopBridge || typeof window.desktopBridge[method] !== 'function') {
      applyStatus({ lastError: `SWメニューのブリッジ(${method})が見つかりません` });
      render();
      return false;
    }
    return true;
  };

  const ensureSetup = async () => {
    if (!ensureBridge('ensureSwMenuSetup')) return null;
    state.flags.isInitializing = true;
    applyStatus({ lastError: null });
    render();
    try {
      const result = await window.desktopBridge.ensureSwMenuSetup();
      if (result?.ok) {
        applyStatus({ ...result, ready: result.ready !== false, lastError: null });
      } else {
        applyStatus({ lastError: result?.error || 'SWメニューの初期化に失敗しました' });
      }
      return result;
    } catch (error) {
      applyStatus({ lastError: error?.message || 'SWメニュー初期化中にエラーが発生しました' });
      return null;
    } finally {
      state.flags.isInitializing = false;
      render();
    }
  };

  const hydrateStatus = async () => {
    if (!ensureBridge('getSwMenuStatus')) return null;
    applyStatus({ lastError: null });
    try {
      const status = await window.desktopBridge.getSwMenuStatus();
      if (status) {
        applyStatus({ ...status, ready: status.ready !== false });
      }
      return status;
    } catch (error) {
      applyStatus({ lastError: error?.message || 'SWメニュー状態の取得に失敗しました' });
      return null;
    }
  };

  const hydrateOverview = async () => {
    if (!ensureBridge('getSwMenuOverview')) return;
    state.flags.isRefreshing = true;
    render();
    try {
      const overview = await window.desktopBridge.getSwMenuOverview();
      if (overview?.ok) {
        state.overview = {
          components: overview.components ?? [],
          boms: overview.boms ?? [],
          flows: overview.flows ?? [],
        };
        applyStatus({ lastError: null, ready: overview.ready !== false });
      } else if (overview?.error) {
        applyStatus({ lastError: overview.error });
      }
    } catch (error) {
      applyStatus({ lastError: error?.message || 'SWメニュー概要の取得に失敗しました' });
    } finally {
      state.flags.isRefreshing = false;
      render();
    }
  };

  const hydrate = async () => {
    await ensureSetup();
    await hydrateStatus();
    await hydrateOverview();
  };

  const submitComponent = async (event) => {
    event?.preventDefault();
    if (!ensureBridge('upsertSwComponent')) return;
    state.flags.isSavingComponent = true;
    render();
    try {
      const payload = { ...state.drafts.component };
      const result = await window.desktopBridge.upsertSwComponent(payload);
      if (!result?.ok) {
        throw new Error(result?.error || '登録に失敗しました');
      }
      state.drafts.component = { code: '', name: '', version: '', description: '' };
      await hydrateOverview();
    } catch (error) {
      applyStatus({ lastError: error?.message || '部品登録に失敗しました' });
    } finally {
      state.flags.isSavingComponent = false;
      render();
    }
  };

  const submitBom = async (event) => {
    event?.preventDefault();
    if (!ensureBridge('upsertSwBom')) return;
    state.flags.isSavingBom = true;
    render();
    try {
      const payload = { ...state.drafts.bom, quantity: Number(state.drafts.bom.quantity) };
      const result = await window.desktopBridge.upsertSwBom(payload);
      if (!result?.ok) {
        throw new Error(result?.error || 'BOM登録に失敗しました');
      }
      state.drafts.bom = { parentCode: '', childCode: '', quantity: '1', note: '' };
      await hydrateOverview();
    } catch (error) {
      applyStatus({ lastError: error?.message || 'BOM登録に失敗しました' });
    } finally {
      state.flags.isSavingBom = false;
      render();
    }
  };

  const submitFlow = async (event) => {
    event?.preventDefault();
    if (!ensureBridge('recordSwFlow')) return;
    state.flags.isSavingFlow = true;
    render();
    try {
      const payload = {
        ...state.drafts.flow,
        quantity: Number(state.drafts.flow.quantity),
      };
      const result = await window.desktopBridge.recordSwFlow(payload);
      if (!result?.ok) {
        throw new Error(result?.error || '流動数の登録に失敗しました');
      }
      state.drafts.flow = { componentCode: '', quantity: '', status: 'in-stock', updatedBy: 'operator' };
      await hydrateOverview();
    } catch (error) {
      applyStatus({ lastError: error?.message || '流動数登録に失敗しました' });
    } finally {
      state.flags.isSavingFlow = false;
      render();
    }
  };

  const closePanel = () => {
    if (typeof setActionActive === 'function') {
      setActionActive('sw-menu', false);
    }
    render();
  };

  const buildStatusGrid = () => {
    const grid = document.createElement('div');
    grid.className = 'status-grid';
    const statusChip = document.createElement('span');
    statusChip.className = 'chip tiny';
    const ready = state.status.ready && !state.status.lastError;
    statusChip.textContent = ready ? 'READY' : 'NEEDS SETUP';
    statusChip.classList.toggle('muted', !ready);

    const stateRow = document.createElement('div');
    stateRow.className = 'status-row';
    const stateLabel = document.createElement('span');
    stateLabel.className = 'status-label';
    stateLabel.textContent = '状態';
    stateRow.append(stateLabel, statusChip);

    grid.append(
      stateRow,
      buildStatusRow('データベース', state.status.database || DEFAULT_STATUS.database),
      buildStatusRow('ホスト', `${state.status.host ?? DEFAULT_STATUS.host}:${state.status.port ?? DEFAULT_STATUS.port}`),
      buildStatusRow('ユーザー', state.status.user || DEFAULT_STATUS.user),
      buildStatusRow('最終初期化', state.status.lastInitializedAt || '未実行'),
    );

    if (state.status.lastError) {
      grid.append(buildStatusRow('エラー', state.status.lastError, 'error'));
    }
    return grid;
  };

  const buildBomForm = () => {
    const form = document.createElement('form');
    form.className = 'sw-form';
    form.addEventListener('submit', submitBom);

    const fields = [
      { key: 'parentCode', label: '親部品コード', placeholder: 'SW-001', required: true },
      { key: 'childCode', label: '子部品コード', placeholder: 'SW-002', required: true },
      { key: 'quantity', label: '数量', placeholder: '1', type: 'number', step: '0.001', required: true },
    ];

    fields.forEach((field) => {
      const row = document.createElement('label');
      row.className = 'sw-field';
      const name = document.createElement('span');
      name.textContent = field.label;
      const input = document.createElement('input');
      input.type = field.type || 'text';
      input.required = Boolean(field.required);
      if (field.step) {
        input.step = field.step;
      }
      input.placeholder = field.placeholder || '';
      input.value = state.drafts.bom[field.key] ?? '';
      input.addEventListener('input', (event) => {
        state.drafts.bom[field.key] = event.target.value;
      });
      row.append(name, input);
      form.append(row);
    });

    const noteRow = document.createElement('label');
    noteRow.className = 'sw-field';
    const noteLabel = document.createElement('span');
    noteLabel.textContent = '備考';
    const noteInput = document.createElement('textarea');
    noteInput.rows = 2;
    noteInput.placeholder = '差し替え条件や補足メモ';
    noteInput.value = state.drafts.bom.note ?? '';
    noteInput.addEventListener('input', (event) => {
      state.drafts.bom.note = event.target.value;
    });
    noteRow.append(noteLabel, noteInput);
    form.append(noteRow);

    const actions = document.createElement('div');
    actions.className = 'feature-actions';
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'primary';
    submitButton.disabled = state.flags.isSavingBom;
    submitButton.textContent = state.flags.isSavingBom ? '登録中…' : 'BOMを登録';
    actions.append(submitButton);
    form.append(actions);

    return form;
  };

  const buildComponentForm = () => {
    const form = document.createElement('form');
    form.className = 'sw-form';
    form.addEventListener('submit', submitComponent);

    const fields = [
      { key: 'code', label: '部品コード', placeholder: 'SW-001', required: true },
      { key: 'name', label: '名称', placeholder: 'メインモジュール', required: true },
      { key: 'version', label: '版数', placeholder: 'v1.0.0' },
    ];

    fields.forEach((field) => {
      const row = document.createElement('label');
      row.className = 'sw-field';
      const name = document.createElement('span');
      name.textContent = field.label;
      const input = document.createElement('input');
      input.type = 'text';
      input.required = Boolean(field.required);
      input.placeholder = field.placeholder || '';
      input.value = state.drafts.component[field.key] ?? '';
      input.addEventListener('input', (event) => {
        state.drafts.component[field.key] = event.target.value;
      });
      row.append(name, input);
      form.append(row);
    });

    const descRow = document.createElement('label');
    descRow.className = 'sw-field';
    const descLabel = document.createElement('span');
    descLabel.textContent = '説明';
    const descInput = document.createElement('textarea');
    descInput.rows = 3;
    descInput.placeholder = '構成の概要やリリースメモなど';
    descInput.value = state.drafts.component.description ?? '';
    descInput.addEventListener('input', (event) => {
      state.drafts.component.description = event.target.value;
    });
    descRow.append(descLabel, descInput);
    form.append(descRow);

    const actions = document.createElement('div');
    actions.className = 'feature-actions';
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'primary';
    submitButton.disabled = state.flags.isSavingComponent;
    submitButton.textContent = state.flags.isSavingComponent ? '保存中…' : '品番を登録';
    actions.append(submitButton);
    form.append(actions);

    return form;
  };

  const buildFlowForm = () => {
    const form = document.createElement('form');
    form.className = 'sw-form';
    form.addEventListener('submit', submitFlow);

    const fields = [
      { key: 'componentCode', label: '部品コード', placeholder: 'SW-001', required: true },
      { key: 'quantity', label: '数量', placeholder: '0', type: 'number', step: '0.001', required: true },
      { key: 'updatedBy', label: '更新者', placeholder: 'operator' },
    ];

    fields.forEach((field) => {
      const row = document.createElement('label');
      row.className = 'sw-field';
      const name = document.createElement('span');
      name.textContent = field.label;
      const input = document.createElement('input');
      input.type = field.type || 'text';
      input.required = Boolean(field.required);
      if (field.step) {
        input.step = field.step;
      }
      input.placeholder = field.placeholder || '';
      input.value = state.drafts.flow[field.key] ?? '';
      input.addEventListener('input', (event) => {
        state.drafts.flow[field.key] = event.target.value;
      });
      row.append(name, input);
      form.append(row);
    });

    const statusRow = document.createElement('label');
    statusRow.className = 'sw-field';
    const statusLabel = document.createElement('span');
    statusLabel.textContent = '状態';
    const statusSelect = document.createElement('select');
    ['in-stock', 'wip', 'backlog'].forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value === 'in-stock' ? '在庫' : value === 'wip' ? '仕掛' : '未着手';
      statusSelect.append(option);
    });
    statusSelect.value = state.drafts.flow.status;
    statusSelect.addEventListener('change', (event) => {
      state.drafts.flow.status = event.target.value;
    });
    statusRow.append(statusLabel, statusSelect);
    form.append(statusRow);

    const actions = document.createElement('div');
    actions.className = 'feature-actions';
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'primary';
    submitButton.disabled = state.flags.isSavingFlow;
    submitButton.textContent = state.flags.isSavingFlow ? '登録中…' : '流動数を登録';
    actions.append(submitButton);
    form.append(actions);

    return form;
  };

  const buildControlActions = (variant = 'card') => {
    const actions = document.createElement('div');
    actions.className = 'feature-actions';
    if (variant === 'surface') {
      actions.classList.add('sw-menu-surface__actions');
    }
    const initButton = document.createElement('button');
    initButton.type = 'button';
    initButton.className = 'ghost';
    initButton.disabled = state.flags.isInitializing;
    initButton.textContent = state.flags.isInitializing ? '初期化中…' : '初期化/再作成';
    initButton.addEventListener('click', () => { void ensureSetup(); });

    const refreshButton = document.createElement('button');
    refreshButton.type = 'button';
    refreshButton.className = 'ghost';
    refreshButton.disabled = state.flags.isRefreshing;
    refreshButton.textContent = state.flags.isRefreshing ? '更新中…' : '最新情報を取得';
    refreshButton.addEventListener('click', () => { void hydrateOverview(); });

    actions.append(initButton, refreshButton);
    return actions;
  };

  const buildSwMenuGrid = () => {
    const layout = document.createElement('div');
    layout.className = 'sw-grid';

    const leftColumn = document.createElement('div');
    leftColumn.className = 'sw-column';
    leftColumn.append(
      buildStatusGrid(),
      buildList(
        '構成表（最新）',
        state.overview.components,
        (item) => {
          const row = document.createElement('div');
          row.className = 'sw-list-item';
          const titleEl = document.createElement('div');
          titleEl.className = 'sw-list-title';
          titleEl.textContent = `${item.code} / ${item.name}`;
          const meta = document.createElement('div');
          meta.className = 'sw-list-meta';
          meta.textContent = `版: ${item.version || '-'} / 更新: ${item.updated_at || '-'}`;
          if (item.description) {
            const desc = document.createElement('div');
            desc.className = 'sw-list-desc';
            desc.textContent = item.description;
            row.append(titleEl, meta, desc);
          } else {
            row.append(titleEl, meta);
          }
          return row;
        },
        'まだ構成が登録されていません',
      ),
      buildList(
        'BOMリンク（最新）',
        state.overview.boms,
        (item) => {
          const row = document.createElement('div');
          row.className = 'sw-list-item';
          const titleEl = document.createElement('div');
          titleEl.className = 'sw-list-title';
          titleEl.textContent = `${item.parent_code} → ${item.child_code}`;
          const meta = document.createElement('div');
          meta.className = 'sw-list-meta';
          meta.textContent = `数量: ${item.quantity} / 更新: ${item.updated_at || '-'}`;
          row.append(titleEl, meta);
          if (item.note) {
            const note = document.createElement('div');
            note.className = 'sw-list-desc';
            note.textContent = item.note;
            row.append(note);
          }
          return row;
        },
        'BOMリンクはまだ登録されていません',
      ),
      buildSection('BOMを登録', buildBomForm()),
    );

    const rightColumn = document.createElement('div');
    rightColumn.className = 'sw-column';
    rightColumn.append(
      buildList(
        '流動数（最新）',
        state.overview.flows,
        (item) => {
          const row = document.createElement('div');
          row.className = 'sw-list-item';
          const titleEl = document.createElement('div');
          titleEl.className = 'sw-list-title';
          titleEl.textContent = `${item.component_code}`;
          const meta = document.createElement('div');
          meta.className = 'sw-list-meta';
          const updatedBy = item.updated_by || item.updatedBy || '-';
          meta.textContent = `数量: ${item.quantity} / 状態: ${item.status} / 更新: ${item.updated_at || '-'} / 入力: ${updatedBy}`;
          row.append(titleEl, meta);
          return row;
        },
        '流動数はまだ登録されていません',
      ),
      buildSection('品番を登録', buildComponentForm()),
      buildSection('流動数を登録', buildFlowForm()),
    );

    layout.append(leftColumn, rightColumn);
    return layout;
  };

  const buildCard = () => {
    const card = document.createElement('div');
    card.className = 'feature-card';

    const header = document.createElement('div');
    header.className = 'feature-header';
    const title = document.createElement('div');
    title.className = 'feature-title';
    title.innerHTML = '<strong>SWメニュー</strong><span class="feature-desc">部品構成と流動数を管理</span>';
    const headerControls = document.createElement('div');
    headerControls.className = 'feature-header-controls';
    const statusChip = document.createElement('span');
    statusChip.className = 'chip tiny';
    const ready = state.status.ready && !state.status.lastError;
    statusChip.textContent = ready ? 'READY' : 'SETUP REQUIRED';
    statusChip.classList.toggle('muted', !ready);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'panel-close';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'SWメニューを閉じる');
    closeBtn.addEventListener('click', closePanel);
    headerControls.append(statusChip, closeBtn);
    header.append(title, headerControls);

    const actions = buildControlActions();
    const layout = buildSwMenuGrid();

    card.append(header, actions, layout);
    return card;
  };

  const buildSurface = () => {
    const ready = state.status.ready && !state.status.lastError;
    const surface = document.createElement('div');
    surface.className = 'sw-menu-surface__inner';

    const header = document.createElement('div');
    header.className = 'sw-menu-surface__header';

    const lead = document.createElement('div');
    lead.className = 'sw-menu-surface__lead';

    const eyebrow = document.createElement('p');
    eyebrow.className = 'sw-menu-surface__eyebrow';
    eyebrow.textContent = 'SW MENU';

    const title = document.createElement('div');
    title.className = 'sw-menu-surface__title';
    const titleText = document.createElement('span');
    titleText.textContent = 'SWメニュー';
    const statusChip = document.createElement('span');
    statusChip.className = 'chip tiny';
    statusChip.textContent = ready ? 'READY' : 'SETUP REQUIRED';
    statusChip.classList.toggle('muted', !ready);
    title.append(titleText, statusChip);

    const subtitle = document.createElement('p');
    subtitle.className = 'sw-menu-surface__subtitle';
    subtitle.textContent = 'three.jsの背景を止めて構成/流動の管理ビューを全面表示します。';

    const meta = document.createElement('div');
    meta.className = 'sw-menu-surface__meta';
    const hostChip = document.createElement('span');
    hostChip.className = 'chip tiny';
    hostChip.textContent = `Host: ${state.status.host ?? DEFAULT_STATUS.host}:${state.status.port ?? DEFAULT_STATUS.port}`;
    const dbChip = document.createElement('span');
    dbChip.className = 'chip tiny';
    dbChip.textContent = `DB: ${state.status.database || DEFAULT_STATUS.database}`;
    const userChip = document.createElement('span');
    userChip.className = 'chip tiny';
    userChip.textContent = `User: ${state.status.user || DEFAULT_STATUS.user}`;
    meta.append(hostChip, dbChip, userChip);

    lead.append(eyebrow, title, subtitle, meta);

    const headerControls = document.createElement('div');
    headerControls.className = 'sw-menu-surface__actions';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'panel-close';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'SWメニューを閉じる');
    closeBtn.addEventListener('click', closePanel);
    headerControls.append(closeBtn);

    header.append(lead, headerControls);

    const actions = buildControlActions('surface');
    const grid = document.createElement('div');
    grid.className = 'sw-menu-surface__grid';
    grid.append(buildSwMenuGrid());

    surface.append(header, actions, grid);
    return surface;
  };

  const isWarning = (actionActive) => actionActive && (!state.status.ready || Boolean(state.status.lastError));

  return {
    buildCard,
    buildSurface,
    hydrate,
    isWarning,
    closePanel,
    setActionActive,
  };
};
