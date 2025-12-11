const DEFAULT_STATUS = {
  ready: false,
  database: 'zoltraak',
  host: '192.168.0.156',
  port: 3306,
  user: 'alluser',
  lastInitializedAt: null,
  lastError: null,
};

const VIEW_DEFINITIONS = [
  { id: 'dashboard', label: 'ダッシュボード' },
  { id: 'components', label: '品番データ' },
  { id: 'bom', label: 'BOMリンク' },
  { id: 'flows', label: '流動数' },
];

const DEFAULT_VIEW = VIEW_DEFINITIONS[0].id;
const buildDefaultComponentDraft = () => ({
  code: '',
  name: '',
  version: '',
  location: '',
  description: '',
});
const buildDefaultComponentSearch = () => ({
  keyword: '',
  code: '',
  name: '',
  location: '',
});

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

const buildList = (title, items, renderItem, emptyText = 'データがありません', options = {}) => {
  const section = document.createElement('div');
  section.className = 'sw-section';
  const { headerContent = null, beforeList = null } = options || {};

  const header = document.createElement('div');
  header.className = 'sw-section-header';
  const heading = document.createElement('div');
  heading.className = 'forward-label';
  heading.textContent = title;
  header.append(heading);
  if (headerContent) {
    header.append(headerContent);
  }

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

  const beforeItems = Array.isArray(beforeList) ? beforeList.filter(Boolean) : beforeList ? [beforeList] : [];
  section.append(header, ...beforeItems, list);
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

const buildSuggestionChips = (label, items, onSelect) => {
  if (!items?.length || typeof onSelect !== 'function') {
    return null;
  }
  const unique = Array.from(new Set(items)).filter(Boolean);
  if (!unique.length) {
    return null;
  }
  const wrapper = document.createElement('div');
  wrapper.className = 'sw-suggestions';
  const title = document.createElement('div');
  title.className = 'sw-suggestions__label';
  title.textContent = label;
  const list = document.createElement('div');
  list.className = 'sw-suggestions__chips';
  unique.slice(0, 8).forEach((text) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sw-suggestion-chip';
    button.textContent = text;
    button.addEventListener('click', () => onSelect(text));
    list.append(button);
  });
  wrapper.append(title, list);
  return wrapper;
};

export const createSwMenuFeature = ({ createWindowShell, setActionActive, isActionActive, renderUi }) => {
  const state = {
    status: { ...DEFAULT_STATUS },
    overview: {
      components: [],
      boms: [],
      flows: [],
    },
    suggestions: {
      names: [],
      locations: [],
    },
    view: DEFAULT_VIEW,
    drafts: {
      component: buildDefaultComponentDraft(),
      bom: { parentCode: '', childCode: '', quantity: '1', note: '' },
      flow: { componentCode: '', quantity: '', status: 'in-stock', updatedBy: 'operator' },
    },
    editing: {
      componentCode: null,
    },
    search: {
      component: buildDefaultComponentSearch(),
    },
    flags: {
      isInitializing: false,
      isRefreshing: false,
      isSavingComponent: false,
      isSavingBom: false,
      isSavingFlow: false,
      isDeletingComponent: false,
    },
  };

  const captureFocusSnapshot = () => {
    const activeElement = document.activeElement;
    if (!activeElement) {
      return null;
    }
    const surface = document.getElementById('sw-menu-surface');
    if (!surface || !surface.contains(activeElement)) {
      return null;
    }
    const activeId = activeElement.id;
    if (!activeId) {
      return null;
    }
    const selection =
      typeof activeElement.selectionStart === 'number' && typeof activeElement.selectionEnd === 'number'
        ? { start: activeElement.selectionStart, end: activeElement.selectionEnd }
        : null;
    return () => {
      const next = document.getElementById(activeId);
      if (!next) return;
      try {
        next.focus({ preventScroll: true });
      } catch (error) {
        next.focus();
      }
      if (selection && typeof next.setSelectionRange === 'function') {
        next.setSelectionRange(selection.start, selection.end);
      }
    };
  };

  const render = () => {
    const restoreFocus = captureFocusSnapshot();
    if (typeof renderUi === 'function') {
      renderUi();
    }
    if (typeof restoreFocus === 'function') {
      restoreFocus();
    }
  };

  const isEditingComponent = () => Boolean(state.editing.componentCode);

  const resetComponentDraft = ({ keepRender } = {}) => {
    state.drafts.component = buildDefaultComponentDraft();
    state.editing.componentCode = null;
    if (!keepRender) {
      render();
    }
  };

  const startComponentEdit = (component) => {
    if (!component?.code) {
      return;
    }
    state.view = 'components';
    state.editing.componentCode = component.code;
    state.drafts.component = {
      code: component.code ?? '',
      name: component.name ?? '',
      version: component.version ?? '',
      location: component.location ?? '',
      description: component.description ?? '',
    };
    render();
  };

  const cancelComponentEdit = () => resetComponentDraft();

  const setView = (viewId) => {
    const found = VIEW_DEFINITIONS.some((view) => view.id === viewId);
    if (!found) {
      return;
    }
    if (state.view === viewId) {
      return;
    }
    state.view = viewId;
    render();
  };

  const applyStatus = (payload = {}) => {
    state.status = {
      ...DEFAULT_STATUS,
      ...state.status,
      ...payload,
    };
  };

  const applySuggestions = (payload = {}) => {
    state.suggestions = {
      names: Array.isArray(payload.names) ? payload.names : [],
      locations: Array.isArray(payload.locations) ? payload.locations : [],
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

  const hydrateComponentSuggestions = async () => {
    if (!ensureBridge('getSwMenuComponentSuggestions')) return;
    try {
      const result = await window.desktopBridge.getSwMenuComponentSuggestions();
      if (result?.ok) {
        applySuggestions(result.suggestions ?? {});
        applyStatus({ lastError: null });
      } else if (result?.error) {
        applyStatus({ lastError: result.error });
      }
    } catch (error) {
      applyStatus({ lastError: error?.message || '候補の取得に失敗しました' });
    } finally {
      render();
    }
  };

  const hydrate = async () => {
    state.view = DEFAULT_VIEW;
    resetComponentDraft({ keepRender: true });
    render();
    await ensureSetup();
    await hydrateStatus();
    await hydrateOverview();
    await hydrateComponentSuggestions();
  };

  const submitComponent = async (event) => {
    event?.preventDefault();
    if (!ensureBridge('upsertSwComponent')) return;
    state.flags.isSavingComponent = true;
    render();
    try {
      const payload = { ...state.drafts.component };
      if (state.editing.componentCode) {
        payload.code = state.editing.componentCode;
      }
      const result = await window.desktopBridge.upsertSwComponent(payload);
      if (!result?.ok) {
        throw new Error(result?.error || '登録に失敗しました');
      }
      resetComponentDraft({ keepRender: true });
      await hydrateOverview();
      await hydrateComponentSuggestions();
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

  const deleteComponent = async (component) => {
    if (!component?.code) {
      return;
    }
    
    const confirmed = confirm(`品番 ${component.code} を削除しますか？\nこの操作は取り消せません。`);
    if (!confirmed) {
      return;
    }
    
    if (!ensureBridge('deleteSwComponent')) return;
    state.flags.isDeletingComponent = true;
    render();
    
    try {
      const result = await window.desktopBridge.deleteSwComponent({ code: component.code });
      if (!result?.ok) {
        throw new Error(result?.error || '削除に失敗しました');
      }
      
      if (state.editing.componentCode === component.code) {
        resetComponentDraft({ keepRender: true });
      }
      
      await hydrateOverview();
    } catch (error) {
      applyStatus({ lastError: error?.message || '品番削除に失敗しました' });
    } finally {
      state.flags.isDeletingComponent = false;
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

  const buildComponentRow = (item, options = {}) => {
    const row = document.createElement('div');
    row.className = 'sw-list-item';
    const { onEdit, onDelete, activeCode } = options;
    const isActive = activeCode && item.code === activeCode;
    if (isActive) {
      row.classList.add('is-editing');
    }

    const content = document.createElement('div');
    content.className = 'sw-list-content';
    const titleEl = document.createElement('div');
    titleEl.className = 'sw-list-title';
    titleEl.textContent = `${item.code} / ${item.name}`;
    const meta = document.createElement('div');
    meta.className = 'sw-list-meta';
    meta.textContent = `版: ${item.version || '-'} / 場所: ${item.location || '-'} / 更新: ${item.updated_at || '-'}`;
    content.append(titleEl, meta);
    if (item.description) {
      const desc = document.createElement('div');
      desc.className = 'sw-list-desc';
      desc.textContent = item.description;
      content.append(desc);
    }
    row.append(content);

    if (typeof onEdit === 'function' || typeof onDelete === 'function') {
      const actions = document.createElement('div');
      actions.className = 'sw-list-actions';
      
      if (typeof onEdit === 'function') {
        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'sw-list-action-button';
        if (isActive) {
          editButton.classList.add('is-active');
          editButton.textContent = '編集中';
        } else {
          editButton.textContent = '編集';
        }
        editButton.addEventListener('click', () => onEdit(item));
        row.addEventListener('dblclick', () => onEdit(item));
        actions.append(editButton);
      }
      
      if (typeof onDelete === 'function') {
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'sw-list-action-button sw-list-action-button--danger';
        deleteButton.textContent = state.flags.isDeletingComponent ? '削除中...' : '削除';
        deleteButton.disabled = state.flags.isDeletingComponent;
        deleteButton.addEventListener('click', () => onDelete(item));
        actions.append(deleteButton);
      }
      
      row.append(actions);
    }

    return row;
  };

  const buildBomRow = (item) => {
    const row = document.createElement('div');
    row.className = 'sw-list-item';
    const content = document.createElement('div');
    content.className = 'sw-list-content';
    const titleEl = document.createElement('div');
    titleEl.className = 'sw-list-title';
    titleEl.textContent = `${item.parent_code} → ${item.child_code}`;
    const meta = document.createElement('div');
    meta.className = 'sw-list-meta';
    meta.textContent = `数量: ${item.quantity} / 更新: ${item.updated_at || '-'}`;
    content.append(titleEl, meta);
    if (item.note) {
      const note = document.createElement('div');
      note.className = 'sw-list-desc';
      note.textContent = item.note;
      content.append(note);
    }
    row.append(content);
    return row;
  };

  const buildFlowRow = (item) => {
    const row = document.createElement('div');
    row.className = 'sw-list-item';
    const content = document.createElement('div');
    content.className = 'sw-list-content';
    const titleEl = document.createElement('div');
    titleEl.className = 'sw-list-title';
    titleEl.textContent = `${item.component_code}`;
    const meta = document.createElement('div');
    meta.className = 'sw-list-meta';
    const updatedBy = item.updated_by || item.updatedBy || '-';
    meta.textContent = `数量: ${item.quantity} / 状態: ${item.status} / 更新: ${item.updated_at || '-'} / 入力: ${updatedBy}`;
    content.append(titleEl, meta);
    row.append(content);
    return row;
  };

  const buildComponentForm = () => {
    const form = document.createElement('form');
    form.className = 'sw-form';
    form.addEventListener('submit', submitComponent);
    const editing = isEditingComponent();

    if (editing) {
      const editingNotice = document.createElement('div');
      editingNotice.className = 'sw-editing-notice';
      const label = document.createElement('div');
      label.className = 'sw-editing-notice__label';
      label.textContent = `${state.editing.componentCode} を編集中`;
      const resetButton = document.createElement('button');
      resetButton.type = 'button';
      resetButton.className = 'ghost sw-editing-notice__reset';
      resetButton.textContent = 'キャンセル';
      resetButton.disabled = state.flags.isSavingComponent;
      resetButton.addEventListener('click', cancelComponentEdit);
      editingNotice.append(label, resetButton);
      form.append(editingNotice);
    }

    const fields = [
      { key: 'code', label: '部品コード', placeholder: 'SW-001', required: true },
      { key: 'name', label: '名称', placeholder: 'メインモジュール', required: true },
      { key: 'version', label: '版数', placeholder: 'v1.0.0' },
      { key: 'location', label: '場所/ライン', placeholder: 'Aライン' },
    ];

    fields.forEach((field) => {
      const row = document.createElement('label');
      row.className = 'sw-field';
      const name = document.createElement('span');
      name.textContent = editing && field.key === 'code' ? `${field.label}（変更不可）` : field.label;
      const input = document.createElement('input');
      input.type = 'text';
      input.required = Boolean(field.required);
      input.placeholder = field.placeholder || '';
      input.value = state.drafts.component[field.key] ?? '';
      let suggestionList = null;
      let suggestionLabel = '';
      if (field.key === 'name') {
        suggestionList = state.suggestions.names;
        suggestionLabel = '最近使った名称';
      } else if (field.key === 'location') {
        suggestionList = state.suggestions.locations;
        suggestionLabel = '最近使った場所/ライン';
      }
      let datalist = null;
      if (suggestionList?.length) {
        datalist = document.createElement('datalist');
        datalist.id = `sw-${field.key}-suggestions`;
        suggestionList.forEach((value) => {
          const option = document.createElement('option');
          option.value = value;
          datalist.append(option);
        });
        input.setAttribute('list', datalist.id);
      }
      if (editing && field.key === 'code') {
        row.classList.add('sw-field--locked');
        input.readOnly = true;
        input.title = '登録済みの品番コードは変更できません';
      }
      input.addEventListener('input', (event) => {
        state.drafts.component[field.key] = event.target.value;
      });
      row.append(name, input);
      if (datalist) {
        row.append(datalist);
        const chips = buildSuggestionChips(suggestionLabel, suggestionList, (value) => {
          state.drafts.component[field.key] = value;
          input.value = value;
          input.focus();
        });
        if (chips) {
          row.append(chips);
        }
      }
      if (editing && field.key === 'code') {
        const hint = document.createElement('div');
        hint.className = 'sw-field-hint';
        hint.textContent = 'コードを除き、内容を更新して保存してください';
        row.append(hint);
      }
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
    if (editing) {
      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'ghost';
      cancelButton.disabled = state.flags.isSavingComponent;
      cancelButton.textContent = 'キャンセル';
      cancelButton.addEventListener('click', cancelComponentEdit);
      actions.append(cancelButton);
    }
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'primary';
    submitButton.disabled = state.flags.isSavingComponent;
    const submitLabel = editing ? '変更を保存' : '品番を登録';
    submitButton.textContent = state.flags.isSavingComponent ? '保存中…' : submitLabel;
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
    refreshButton.addEventListener('click', () => {
      void Promise.all([hydrateOverview(), hydrateComponentSuggestions()]);
    });

    actions.append(initButton, refreshButton);
    return actions;
  };

  const buildViewSwitcher = () => {
    const nav = document.createElement('div');
    nav.className = 'sw-view-nav';
    VIEW_DEFINITIONS.forEach((view) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip chip-action tiny sw-view-nav__button';
      const active = state.view === view.id;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.textContent = view.label;
      button.addEventListener('click', () => setView(view.id));
      nav.append(button);
    });
    return nav;
  };

  const buildStatCard = ({ title, value, meta, view }) => {
    const card = document.createElement('div');
    card.className = 'sw-stat-card';

    const label = document.createElement('div');
    label.className = 'sw-stat-card__label';
    label.textContent = title;

    const val = document.createElement('div');
    val.className = 'sw-stat-card__value';
    val.textContent = value;

    const metaEl = document.createElement('div');
    metaEl.className = 'sw-stat-card__meta';
    metaEl.textContent = meta;

    card.append(label, val, metaEl);

    if (view) {
      const actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.className = 'ghost sw-stat-card__action';
      actionButton.textContent = '詳細を見る';
      actionButton.addEventListener('click', () => setView(view));
      card.append(actionButton);
    }

    return card;
  };

  const buildDashboardView = (variant = 'surface') => {
    const surfaceLimit = variant === 'card' ? 2 : 3;
    const container = document.createElement('div');
    container.className = 'sw-dashboard';

    const statusSection = buildSection('接続ステータス', buildStatusGrid());
    statusSection.classList.add('sw-dashboard__section');

    const latestComponent = state.overview.components?.[0];
    const latestBom = state.overview.boms?.[0];
    const latestFlow = state.overview.flows?.[0];

    const statsRow = document.createElement('div');
    statsRow.className = 'sw-dashboard__stats';
    statsRow.append(
      buildStatCard({
        title: '品番データ',
        value: `${state.overview.components.length}`,
        meta: latestComponent ? `最新: ${latestComponent.code} (${latestComponent.updated_at || '-'})` : 'まだ登録がありません',
        view: 'components',
      }),
      buildStatCard({
        title: 'BOMリンク',
        value: `${state.overview.boms.length}`,
        meta: latestBom ? `最新: ${latestBom.parent_code} → ${latestBom.child_code}` : 'まだ登録がありません',
        view: 'bom',
      }),
      buildStatCard({
        title: '流動数',
        value: `${state.overview.flows.length}`,
        meta: latestFlow ? `最新: ${latestFlow.component_code} / ${latestFlow.status}` : 'まだ登録がありません',
        view: 'flows',
      }),
    );

    const peekGrid = document.createElement('div');
    peekGrid.className = 'sw-dashboard__peek-grid';
    peekGrid.append(
      buildList(
        '最新の構成',
        (state.overview.components ?? []).slice(0, surfaceLimit),
        (item) => buildComponentRow(item, {
          onEdit: startComponentEdit,
          onDelete: deleteComponent,
          activeCode: state.editing.componentCode,
        }),
        '構成がありません',
      ),
      buildList(
        '最新のBOMリンク',
        (state.overview.boms ?? []).slice(0, surfaceLimit),
        buildBomRow,
        'BOMリンクがありません',
      ),
      buildList(
        '最新の流動数',
        (state.overview.flows ?? []).slice(0, surfaceLimit),
        buildFlowRow,
        '流動数がありません',
      ),
    );

    container.append(statusSection, statsRow, peekGrid);
    return container;
  };

  const getComponentSearch = () => state.search.component ?? buildDefaultComponentSearch();

  const normalizeQuery = (value) => (value ?? '').toString().trim().toLowerCase();

  const hasComponentQuery = () => {
    const search = getComponentSearch();
    return ['keyword', 'code', 'name', 'location'].some((key) => Boolean(normalizeQuery(search[key])));
  };

  const resetComponentSearch = () => {
    state.search.component = buildDefaultComponentSearch();
  };

  const applyComponentSearchField = (key, value) => {
    state.search.component = { ...getComponentSearch(), [key]: value };
  };

  const getFilteredComponents = () => {
    const allComponents = Array.isArray(state.overview.components) ? state.overview.components : [];
    const search = getComponentSearch();
    const keyword = normalizeQuery(search.keyword);
    const code = normalizeQuery(search.code);
    const name = normalizeQuery(search.name);
    const location = normalizeQuery(search.location);

    if (!keyword && !code && !name && !location) {
      return allComponents;
    }

    const includesQuery = (value, query) => !query || normalizeQuery(value).includes(query);

    return allComponents.filter((item) => {
      if (keyword) {
        const matchesKeyword = [item.code, item.name, item.version, item.location, item.description].some(
          (value) => normalizeQuery(value).includes(keyword),
        );
        if (!matchesKeyword) {
          return false;
        }
      }
      if (!includesQuery(item.code, code)) return false;
      if (!includesQuery(item.name, name)) return false;
      if (!includesQuery(item.location, location)) return false;
      return true;
    });
  };

  const buildComponentSearch = (filteredCount, totalCount) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'sw-search sw-search--stacked';

    const search = getComponentSearch();

    const buildField = (key, label, placeholder) => {
      const field = document.createElement('label');
      field.className = 'sw-search__field';
      const caption = document.createElement('span');
      caption.className = 'sw-search__label';
      caption.textContent = label;
      const input = document.createElement('input');
      input.id = `sw-component-search-${key}`;
      input.type = 'search';
      input.className = 'sw-search__input';
      input.placeholder = placeholder;
      input.value = search[key] ?? '';
      input.addEventListener('input', (event) => {
        applyComponentSearchField(key, event.target.value);
        render();
      });
      field.append(caption, input);
      return field;
    };

    const keywordRow = document.createElement('div');
    keywordRow.className = 'sw-search__row';
    keywordRow.append(buildField('keyword', 'キーワード', '品番コード・名称・場所・説明を横断検索'));

    const fieldRow = document.createElement('div');
    fieldRow.className = 'sw-search__row sw-search__row--multi';
    fieldRow.append(
      buildField('code', '品番', 'SW-001'),
      buildField('name', '名称', '例: インバータ'),
      buildField('location', '場所/ライン', '例: L1'),
    );

    const metaRow = document.createElement('div');
    metaRow.className = 'sw-search__meta-row';
    const meta = document.createElement('span');
    meta.className = 'sw-search__meta';
    meta.textContent = hasComponentQuery() ? `${filteredCount} / ${totalCount} 件` : `${totalCount}件`;

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'ghost sw-search__clear';
    clear.textContent = 'クリア';
    clear.disabled = !hasComponentQuery();
    clear.addEventListener('click', () => {
      if (!hasComponentQuery()) return;
      resetComponentSearch();
      render();
    });

    metaRow.append(meta, clear);
    wrapper.append(keywordRow, fieldRow, metaRow);
    return wrapper;
  };

  const buildComponentSearchHints = () => {
    const chips = [];
    const names = buildSuggestionChips('名称で絞り込み', state.suggestions.names, (value) => {
      applyComponentSearchField('name', value);
      render();
    });
    const locations = buildSuggestionChips('場所/ラインで絞り込み', state.suggestions.locations, (value) => {
      applyComponentSearchField('location', value);
      render();
    });
    if (names) chips.push(names);
    if (locations) chips.push(locations);
    if (!chips.length) {
      return null;
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'sw-search-hints';
    chips.forEach((chip) => wrapper.append(chip));
    return wrapper;
  };

  const buildComponentsView = () => {
    const layout = document.createElement('div');
    layout.className = 'sw-grid';

    const allComponents = Array.isArray(state.overview.components) ? state.overview.components : [];
    const filteredComponents = getFilteredComponents();
    const emptyText = hasComponentQuery() ? '条件に一致する品番が見つかりません' : 'まだ構成が登録されていません';
    const searchHints = buildComponentSearchHints();

    const leftColumn = document.createElement('div');
    leftColumn.className = 'sw-column';
    leftColumn.append(
      buildSection('接続ステータス', buildStatusGrid()),
      buildList(
        '品番一覧',
        filteredComponents,
        (item) => buildComponentRow(item, {
          onEdit: startComponentEdit,
          onDelete: deleteComponent,
          activeCode: state.editing.componentCode,
        }),
        emptyText,
        {
          headerContent: buildComponentSearch(filteredComponents.length, allComponents.length),
          beforeList: searchHints,
        },
      ),
    );

    const rightColumn = document.createElement('div');
    rightColumn.className = 'sw-column';
    rightColumn.append(buildSection(
      isEditingComponent() ? '品番を編集' : '品番を登録',
      buildComponentForm(),
    ));

    layout.append(leftColumn, rightColumn);
    return layout;
  };

  const buildBomView = () => {
    const layout = document.createElement('div');
    layout.className = 'sw-grid';

    const leftColumn = document.createElement('div');
    leftColumn.className = 'sw-column';
    leftColumn.append(
      buildSection('接続ステータス', buildStatusGrid()),
      buildList('BOMリンク（最新）', state.overview.boms, buildBomRow, 'BOMリンクはまだ登録されていません'),
    );

    const rightColumn = document.createElement('div');
    rightColumn.className = 'sw-column';
    rightColumn.append(
      buildSection('BOMを登録', buildBomForm()),
      buildList(
        '参照用: 構成（最新）',
        (state.overview.components ?? []).slice(0, 5),
        (item) => buildComponentRow(item, {
          onEdit: startComponentEdit,
          onDelete: deleteComponent,
          activeCode: state.editing.componentCode,
        }),
        '品番データが必要です',
      ),
    );

    layout.append(leftColumn, rightColumn);
    return layout;
  };

  const buildFlowsView = () => {
    const layout = document.createElement('div');
    layout.className = 'sw-grid';

    const leftColumn = document.createElement('div');
    leftColumn.className = 'sw-column';
    leftColumn.append(
      buildSection('接続ステータス', buildStatusGrid()),
      buildList('流動数（最新）', state.overview.flows, buildFlowRow, '流動数はまだ登録されていません'),
    );

    const rightColumn = document.createElement('div');
    rightColumn.className = 'sw-column';
    rightColumn.append(
      buildSection('流動数を登録', buildFlowForm()),
      buildList(
        '参照用: 構成（最新）',
        (state.overview.components ?? []).slice(0, 5),
        (item) => buildComponentRow(item, {
          onEdit: startComponentEdit,
          onDelete: deleteComponent,
          activeCode: state.editing.componentCode,
        }),
        '品番データが必要です',
      ),
    );

    layout.append(leftColumn, rightColumn);
    return layout;
  };

  const buildViewContent = (variant = 'surface') => {
    switch (state.view) {
      case 'components':
        return buildComponentsView();
      case 'bom':
        return buildBomView();
      case 'flows':
        return buildFlowsView();
      case 'dashboard':
      default:
        return buildDashboardView(variant);
    }
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
    const nav = buildViewSwitcher();
    const layout = buildViewContent('card');

    card.append(header, actions, nav, layout);
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
    grid.append(buildViewSwitcher(), buildViewContent());

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
