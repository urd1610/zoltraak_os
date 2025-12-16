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
const MAX_SUGGESTION_ITEMS = 50;
const BOM_CODE_SUGGESTION_LIMIT = MAX_SUGGESTION_ITEMS;
const DEFAULT_BOM_FORMAT_KEY = '汎用';
const BOM_FORMAT_STORAGE_KEY = 'sw-menu:bom-formats';
const DEFAULT_BOM_FORMAT = ['メイン', 'サブ', 'アクセサリ', '補助'];
const MAX_BOM_SLOTS = 12;
let bomSlotIdCounter = 0;
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
const buildDefaultBomMatrixState = () => ({
  locationKey: '',
  swComponents: [],
  total: 0,
  limit: null,
  isLoadingSwComponents: false,
  lastError: null,
});
const normalizeSlotLabel = (value) => (value ?? '').toString().trim();
const normalizeBomFormatLabels = (labels = []) => {
  const normalized = (Array.isArray(labels) ? labels : [])
    .map((label) => normalizeSlotLabel(label))
    .filter(Boolean)
    .slice(0, MAX_BOM_SLOTS);
  return normalized;
};
const normalizeBomFormats = (formats) => {
  const source = formats && typeof formats === 'object' ? formats : {};
  const result = Object.entries(source).reduce((acc, [location, labels]) => {
    const key = normalizeSlotLabel(location) || DEFAULT_BOM_FORMAT_KEY;
    const normalizedLabels = normalizeBomFormatLabels(labels);
    if (normalizedLabels.length) {
      acc[key] = normalizedLabels;
    }
    return acc;
  }, {});
  if (!result[DEFAULT_BOM_FORMAT_KEY]) {
    result[DEFAULT_BOM_FORMAT_KEY] = DEFAULT_BOM_FORMAT;
  }
  return result;
};
const loadBomFormatsFromStorage = () => {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = localStorage.getItem(BOM_FORMAT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn('BOMフォーマットの読み込みに失敗しました', error);
    return null;
  }
};
const persistBomFormatsToStorage = (formats) => {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(BOM_FORMAT_STORAGE_KEY, JSON.stringify(formats));
  } catch (error) {
    console.warn('BOMフォーマットの保存に失敗しました', error);
  }
};
const createBomSlot = (label, base = {}) => ({
  id: base.id || `slot-${Date.now().toString(36)}-${bomSlotIdCounter++}`,
  label,
  childCode: base.childCode ?? '',
  quantity: base.quantity ?? '1',
  note: base.note ?? '',
});
const buildBomSlotsFromLabels = (labels, currentSlots = []) => {
  const normalizedLabels = normalizeBomFormatLabels(labels);
  const slotQueues = new Map();

  (currentSlots || []).forEach((slot) => {
    const normalizedLabel = normalizeSlotLabel(slot.label);
    if (!normalizedLabel) return;
    const preparedSlot = createBomSlot(normalizedLabel, slot);
    const queue = slotQueues.get(normalizedLabel) || [];
    queue.push(preparedSlot);
    slotQueues.set(normalizedLabel, queue);
  });

  return normalizedLabels.map((label) => {
    const normalizedLabel = normalizeSlotLabel(label);
    const queue = slotQueues.get(normalizedLabel);
    const existing = queue?.shift();
    if (queue && !queue.length) {
      slotQueues.delete(normalizedLabel);
    }
    return existing ? { ...existing, label: normalizedLabel } : createBomSlot(normalizedLabel);
  });
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

const buildList = (title, items, renderItem, emptyText = 'データがありません', options = {}) => {
  const section = document.createElement('div');
  section.className = 'sw-section';
  const { headerContent = null, beforeList = null, scroll = false } = options || {};
  section.classList.toggle('sw-section--scroll', Boolean(scroll));

  const header = document.createElement('div');
  header.className = 'sw-section-header';
  const heading = document.createElement('div');
  heading.className = 'forward-label';
  heading.textContent = title;
  header.append(heading);
  if (headerContent) {
    header.append(headerContent);
  }

  const body = document.createElement('div');
  body.className = 'sw-section-body';

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
  body.append(...beforeItems, list);
  section.append(header, body);
  return section;
};

const buildSection = (title, content, options = {}) => {
  const section = document.createElement('div');
  section.className = 'sw-section';
  const { scroll = false } = options || {};
  section.classList.toggle('sw-section--scroll', Boolean(scroll));
  const header = document.createElement('div');
  header.className = 'sw-section-header';
  const heading = document.createElement('div');
  heading.className = 'forward-label';
  heading.textContent = title;
  header.append(heading);
  const body = document.createElement('div');
  body.className = 'sw-section-body';
  if (content) {
    body.append(content);
  }
  section.append(header, body);
  return section;
};

const buildSuggestionChips = (label, items, onSelect, options = {}) => {
  if (!items?.length || typeof onSelect !== 'function') {
    return null;
  }
  const { maxItems = 20, showLabel = true } = options || {};
  const unique = Array.from(new Set(items)).filter(Boolean);
  if (!unique.length) {
    return null;
  }
  const wrapper = document.createElement('div');
  wrapper.className = 'sw-suggestions';
  if (showLabel && label) {
    const title = document.createElement('div');
    title.className = 'sw-suggestions__label';
    title.textContent = label;
    wrapper.append(title);
  }
  const list = document.createElement('div');
  list.className = 'sw-suggestions__chips';
  const renderItems = typeof maxItems === 'number' ? unique.slice(0, maxItems) : unique;
  renderItems.forEach((text) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sw-suggestion-chip';
    button.textContent = text;
    button.addEventListener('click', () => onSelect(text));
    list.append(button);
  });
  wrapper.append(list);
  return wrapper;
};

export const createSwMenuFeature = ({ createWindowShell, setActionActive, isActionActive, renderUi }) => {
  const initialBomFormats = normalizeBomFormats(loadBomFormatsFromStorage() || {});
  const initialBomLabels = initialBomFormats[DEFAULT_BOM_FORMAT_KEY] ?? DEFAULT_BOM_FORMAT;
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
      namesByLocation: {},
    },
    view: DEFAULT_VIEW,
    drafts: {
      component: buildDefaultComponentDraft(),
      bom: {
        parentCode: '',
        parentLocation: '',
        parentName: '',
        formatLocation: DEFAULT_BOM_FORMAT_KEY,
        slots: buildBomSlotsFromLabels(initialBomLabels),
        matrixCells: {},
        sharedNote: '',
        newSlotLabel: '',
      },
      flow: { componentCode: '', quantity: '', status: 'in-stock', updatedBy: 'operator' },
    },
    bomMatrix: buildDefaultBomMatrixState(),
    bomFormats: initialBomFormats,
    editing: {
      componentCode: null,
    },
    search: {
      component: buildDefaultComponentSearch(),
      componentResults: null,
      isSearching: false,
    },
    importResult: null,
    flags: {
      isInitializing: false,
      isRefreshing: false,
      isSavingComponent: false,
      isSavingBom: false,
      isSavingFlow: false,
      isDeletingComponent: false,
      isNameHintsOpen: false,
      isImportingComponents: false,
      isSearchingComponents: false,
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

  const resetImportResult = () => {
    state.importResult = null;
  };

  const persistBomFormats = () => {
    state.bomFormats = normalizeBomFormats(state.bomFormats);
    persistBomFormatsToStorage(state.bomFormats);
  };

  const getBomFormatLabels = (location) => {
    const key = normalizeSlotLabel(location) || DEFAULT_BOM_FORMAT_KEY;
    const labels = state.bomFormats[key] ?? state.bomFormats[DEFAULT_BOM_FORMAT_KEY] ?? DEFAULT_BOM_FORMAT;
    return normalizeBomFormatLabels(labels);
  };

  const ensureBomFormatExists = (location) => {
    const key = normalizeSlotLabel(location) || DEFAULT_BOM_FORMAT_KEY;
    if (state.bomFormats[key]) {
      return key;
    }
    state.bomFormats = { ...state.bomFormats, [key]: getBomFormatLabels(DEFAULT_BOM_FORMAT_KEY) };
    persistBomFormats();
    return key;
  };

  const setBomFormatLocation = (formatKey, fallbackKey = DEFAULT_BOM_FORMAT_KEY) => {
    const primaryKey = normalizeSlotLabel(formatKey);
    const fallback = normalizeSlotLabel(fallbackKey) || DEFAULT_BOM_FORMAT_KEY;
    const targetKey = primaryKey || fallback;
    if (primaryKey && !state.bomFormats[primaryKey] && state.bomFormats[fallback]) {
      state.bomFormats = { ...state.bomFormats, [primaryKey]: getBomFormatLabels(fallback) };
      persistBomFormats();
    }
    const key = ensureBomFormatExists(targetKey);
    state.drafts.bom.formatLocation = key;
    state.drafts.bom.slots = buildBomSlotsFromLabels(getBomFormatLabels(key), state.drafts.bom.slots);
  };

  const resetBomDraft = ({ keepParent = false } = {}) => {
    const formatKey = state.drafts.bom.formatLocation || DEFAULT_BOM_FORMAT_KEY;
    const labels = getBomFormatLabels(formatKey);
    state.drafts.bom = {
      parentCode: keepParent ? state.drafts.bom.parentCode : '',
      parentLocation: keepParent ? state.drafts.bom.parentLocation : '',
      parentName: keepParent ? state.drafts.bom.parentName : '',
      formatLocation: formatKey,
      slots: buildBomSlotsFromLabels(labels),
      matrixCells: {},
      sharedNote: '',
      newSlotLabel: '',
    };
    state.bomMatrix = buildDefaultBomMatrixState();
  };

  const addBomSlotLabel = (label) => {
    const normalized = normalizeSlotLabel(label);
    if (!normalized) {
      return;
    }
    const key = state.drafts.bom.formatLocation || DEFAULT_BOM_FORMAT_KEY;
    const labels = getBomFormatLabels(key);
    if (labels.length >= MAX_BOM_SLOTS) {
      return;
    }
    const nextLabels = normalizeBomFormatLabels([...labels, normalized]);
    state.bomFormats = { ...state.bomFormats, [key]: nextLabels };
    persistBomFormats();
    state.drafts.bom.newSlotLabel = '';
    state.drafts.bom.slots = buildBomSlotsFromLabels(nextLabels, state.drafts.bom.slots);
  };

  const removeBomSlot = (slotId) => {
    const key = state.drafts.bom.formatLocation || DEFAULT_BOM_FORMAT_KEY;
    const labels = getBomFormatLabels(key);
    if (labels.length <= 1) {
      return;
    }
    const index = state.drafts.bom.slots.findIndex((slot) => slot.id === slotId);
    if (index < 0) {
      return;
    }
    const nextLabels = labels.filter((_, idx) => idx !== index);
    state.bomFormats = { ...state.bomFormats, [key]: nextLabels };
    persistBomFormats();
    state.drafts.bom.slots = buildBomSlotsFromLabels(
      nextLabels,
      state.drafts.bom.slots.filter((slot) => slot.id !== slotId),
    );
  };

  const updateBomSlotField = (slotId, field, value) => {
    const slots = state.drafts.bom.slots.map((slot) => {
      if (slot.id !== slotId) {
        return slot;
      }
      return { ...slot, [field]: value };
    });
    state.drafts.bom.slots = slots;
  };

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

  const normalizeSuggestionList = (values) => {
    const source = Array.isArray(values) ? values : [];
    const trimmed = source
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean);
    return Array.from(new Set(trimmed)).slice(0, MAX_SUGGESTION_ITEMS);
  };

  const normalizeNamesByLocation = (map) => {
    if (!map || typeof map !== 'object') {
      return {};
    }
    return Object.entries(map).reduce((acc, [location, names]) => {
      const key = typeof location === 'string' ? location.trim() : '';
      if (!key) {
        return acc;
      }
      const normalizedNames = normalizeSuggestionList(names);
      if (normalizedNames.length) {
        acc[key] = normalizedNames;
      }
      return acc;
    }, {});
  };

  const applySuggestions = (payload = {}) => {
    state.suggestions = {
      names: normalizeSuggestionList(payload.names),
      locations: normalizeSuggestionList(payload.locations),
      namesByLocation: normalizeNamesByLocation(payload.namesByLocation),
    };
  };

  const normalizeTextQuery = (value) => (value ?? '').toString().trim().toLowerCase();
  const normalizeCodeQuery = (value) => (value ?? '').toString().trim().toLowerCase().replace(/-/g, '');

  const getBomCodeSuggestions = (keyword = '') => {
    const codes = new Map();
    const addCode = (code, name) => {
      const trimmed = (code ?? '').toString().trim();
      if (!trimmed) return;
      if (codes.has(trimmed)) return;
      codes.set(trimmed, (name ?? '').toString().trim());
    };

    (state.overview.components ?? []).forEach((item) => addCode(item.code, item.name));
    (state.overview.boms ?? []).forEach((bom) => {
      addCode(bom.parent_code);
      addCode(bom.child_code);
    });

    const query = normalizeCodeQuery(keyword);
    const filtered = Array.from(codes.entries())
      .map(([code, name]) => ({ code, name }))
      .filter(({ code }) => {
        if (!query) return true;
        return normalizeCodeQuery(code).includes(query);
      });

    return filtered.slice(0, BOM_CODE_SUGGESTION_LIMIT);
  };

  const resolveComponentCode = (value, locationHint) => {
    const raw = (value ?? '').toString().trim();
    if (!raw) return '';
    const normalizedLocation = normalizeTextQuery(locationHint);
    const normalizedCode = normalizeCodeQuery(raw);
    const components = Array.isArray(state.overview.components) ? state.overview.components : [];
    const matchedByCode = components.find((item) => normalizeCodeQuery(item.code) === normalizedCode);
    if (matchedByCode) {
      return matchedByCode.code;
    }
    const matchedByName = components.find((item) => {
      if (normalizeTextQuery(item.name) !== normalizeTextQuery(raw)) {
        return false;
      }
      if (!normalizedLocation) return true;
      return normalizeTextQuery(item.location) === normalizedLocation;
    });
    return matchedByName?.code || raw;
  };

  const findComponentByCode = (code) => {
    const normalized = normalizeCodeQuery(code);
    return (state.overview.components ?? []).find(
      (component) => normalizeCodeQuery(component.code) === normalized,
    ) || null;
  };

  const setBomParentCode = (value) => {
    state.drafts.bom.parentCode = value;
    const normalizedCode = normalizeSlotLabel(value);
    if (!normalizedCode) {
      state.drafts.bom.parentLocation = '';
      state.drafts.bom.parentName = '';
      setBomFormatLocation(DEFAULT_BOM_FORMAT_KEY);
      return;
    }
    const component = findComponentByCode(value);
    if (component) {
      state.drafts.bom.parentLocation = component.location ?? '';
      state.drafts.bom.parentName = component.name ?? '';
      setBomFormatLocation(component.name, component.location);
    }
  };

  const setBomLocation = (value) => {
    state.drafts.bom.parentLocation = normalizeSlotLabel(value);
  };

  const getBomMatrixColumnLabels = () => {
    const rawLabels = getBomSlotNameSuggestions();
    const filtered = rawLabels.filter(
      (label) => normalizeTextQuery(label) !== 'sw',
    );
    if (filtered.length) {
      return filtered;
    }
    return getBomFormatLabels(state.drafts.bom.parentLocation);
  };

  const syncBomMatrixSlots = () => {
    const labels = getBomMatrixColumnLabels();
    state.drafts.bom.slots = buildBomSlotsFromLabels(labels, state.drafts.bom.slots);
  };

  const getBomMatrixCellValue = (parentCode, slotLabel) => {
    const parentKey = normalizeSlotLabel(parentCode);
    const labelKey = normalizeSlotLabel(slotLabel);
    if (!parentKey || !labelKey) {
      return '';
    }
    return state.drafts.bom.matrixCells?.[parentKey]?.[labelKey] ?? '';
  };

  const setBomMatrixCellValue = (parentCode, slotLabel, value) => {
    const parentKey = normalizeSlotLabel(parentCode);
    const labelKey = normalizeSlotLabel(slotLabel);
    if (!parentKey || !labelKey) {
      return;
    }
    if (!state.drafts.bom.matrixCells || typeof state.drafts.bom.matrixCells !== 'object') {
      state.drafts.bom.matrixCells = {};
    }
    if (!state.drafts.bom.matrixCells[parentKey] || typeof state.drafts.bom.matrixCells[parentKey] !== 'object') {
      state.drafts.bom.matrixCells[parentKey] = {};
    }
    state.drafts.bom.matrixCells[parentKey][labelKey] = (value ?? '').toString();
  };

  const buildBomMatrixPayloads = () => {
    if (!normalizeSlotLabel(state.drafts.bom.parentLocation)) {
      throw new Error('場所/ラインを選択してください');
    }

    const swComponents = getSwComponentsForSelectedLocation();
    if (!swComponents.length) {
      throw new Error('選択した場所/ラインに名称SWの親品番がありません');
    }

    syncBomMatrixSlots();
    const labels = getBomMatrixColumnLabels();
    const sharedNote = normalizeSlotLabel(state.drafts.bom.sharedNote);

    const payloads = [];
    swComponents.forEach((swComponent) => {
      const parentCode = (swComponent?.code ?? '').toString().trim();
      if (!parentCode) {
        return;
      }
      labels.forEach((labelText) => {
        const slotLabel = normalizeSlotLabel(labelText);
        if (!slotLabel) {
          return;
        }
        const rawChild = getBomMatrixCellValue(parentCode, slotLabel);
        const childCode = resolveComponentCode(rawChild, state.drafts.bom.parentLocation);
        if (!childCode) {
          return;
        }
        const noteParts = [slotLabel, sharedNote].filter(Boolean);
        payloads.push({
          parentCode,
          childCode,
          quantity: 1,
          note: noteParts.join(' / ') || slotLabel,
        });
      });
    });

    return payloads;
  };

  const resetBomMatrixValues = () => {
    const swComponents = getSwComponentsForSelectedLocation();
    const matrixCells = state.drafts.bom.matrixCells;
    if (matrixCells && typeof matrixCells === 'object') {
      swComponents.forEach((swComponent) => {
        const parentKey = normalizeSlotLabel(swComponent?.code);
        if (!parentKey) {
          return;
        }
        delete matrixCells[parentKey];
      });
    }
    state.drafts.bom.sharedNote = '';
    state.drafts.bom.newSlotLabel = '';
  };

  const setBomMatrixLocation = (value) => {
    setBomLocation(value);
    state.drafts.bom.parentCode = 'SW';
    state.drafts.bom.parentName = 'SW';
    syncBomMatrixSlots();
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
          totalComponents: overview.totalComponents ?? 0,
          componentLimit: overview.componentLimit ?? 1000,
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

  let bomMatrixSwComponentsRequestId = 0;
  let bomMatrixSwComponentsDebounceTimer = null;

  const hydrateBomMatrixSwComponents = async (location, requestId) => {
    const locationKey = normalizeTextQuery(location);
    if (!locationKey) {
      return;
    }
    if (!ensureBridge('getSwMenuBomMatrixSwComponents')) {
      if (requestId !== bomMatrixSwComponentsRequestId) return;
      state.bomMatrix = {
        ...buildDefaultBomMatrixState(),
        locationKey,
        isLoadingSwComponents: false,
        lastError: 'SW品番の取得ブリッジが利用できません',
      };
      render();
      return;
    }

    try {
      const result = await window.desktopBridge.getSwMenuBomMatrixSwComponents({ location });
      if (requestId !== bomMatrixSwComponentsRequestId) return;
      if (result?.ok) {
        state.bomMatrix = {
          ...buildDefaultBomMatrixState(),
          locationKey,
          swComponents: result.components ?? [],
          total: result.total ?? 0,
          limit: result.limit ?? null,
          isLoadingSwComponents: false,
          lastError: null,
        };
        return;
      }
      state.bomMatrix = {
        ...buildDefaultBomMatrixState(),
        locationKey,
        isLoadingSwComponents: false,
        lastError: result?.error || 'SW品番の取得に失敗しました',
      };
    } catch (error) {
      if (requestId !== bomMatrixSwComponentsRequestId) return;
      state.bomMatrix = {
        ...buildDefaultBomMatrixState(),
        locationKey,
        isLoadingSwComponents: false,
        lastError: error?.message || 'SW品番の取得中にエラーが発生しました',
      };
    } finally {
      if (requestId === bomMatrixSwComponentsRequestId) {
        render();
      }
    }
  };

  const scheduleBomMatrixSwComponentsHydration = (location) => {
    if (bomMatrixSwComponentsDebounceTimer) {
      clearTimeout(bomMatrixSwComponentsDebounceTimer);
      bomMatrixSwComponentsDebounceTimer = null;
    }

    const locationKey = normalizeTextQuery(location);
    const requestId = ++bomMatrixSwComponentsRequestId;

    if (!locationKey) {
      state.bomMatrix = buildDefaultBomMatrixState();
      return;
    }

    state.bomMatrix = {
      ...buildDefaultBomMatrixState(),
      locationKey,
      isLoadingSwComponents: true,
      lastError: null,
    };

    bomMatrixSwComponentsDebounceTimer = setTimeout(() => {
      bomMatrixSwComponentsDebounceTimer = null;
      void hydrateBomMatrixSwComponents(location, requestId);
    }, 250);
  };

  const hydrate = async () => {
    state.view = DEFAULT_VIEW;
    resetComponentDraft({ keepRender: true });
    resetBomDraft({ keepParent: false });
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

  const importComponentsFromCsvFile = async (file) => {
    if (!file) {
      return;
    }
    if (!ensureBridge('importSwComponentsFromCsv')) return;
    state.flags.isImportingComponents = true;
    state.importResult = null;
    render();
    try {
      const csvText = await file.text();
      const result = await window.desktopBridge.importSwComponentsFromCsv(csvText);
      const ok = result?.ok !== false;
      const duplicateCodes = Array.isArray(result?.duplicateCodes) ? result.duplicateCodes : [];
      const rowErrors = Array.isArray(result?.rowErrors) ? result.rowErrors : [];
      state.importResult = {
        ok,
        fileName: file.name,
        imported: result?.imported ?? 0,
        totalRows: result?.totalRows ?? null,
        duplicateCodes,
        rowErrors,
        error: ok ? null : result?.error || 'CSVの取り込みに失敗しました',
      };
      if (!ok) {
        applyStatus({ lastError: state.importResult.error });
        return;
      }
      applyStatus({ lastError: null });
      await hydrateOverview();
      await hydrateComponentSuggestions();
    } catch (error) {
      const message = error?.message || 'CSVの取り込みに失敗しました';
      state.importResult = { ok: false, error: message, fileName: file?.name };
      applyStatus({ lastError: message });
    } finally {
      state.flags.isImportingComponents = false;
      render();
    }
  };

  const submitBom = async (event) => {
    event?.preventDefault();
    if (!ensureBridge('upsertSwBomBatch')) return;
    state.flags.isSavingBom = true;
    render();
    try {
      const payloads = buildBomMatrixPayloads();
      if (!payloads.length) {
        throw new Error('装備する子品番を1つ以上選択してください');
      }
      const result = await window.desktopBridge.upsertSwBomBatch(payloads);
      if (!result?.ok) {
        throw new Error(result?.error || 'BOM登録に失敗しました');
      }
      resetBomMatrixValues();
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

  const getBomLocationOptions = () => {
    const locations = new Set();
    const addLocation = (value) => {
      const normalized = normalizeSlotLabel(value);
      if (normalized) {
        locations.add(normalized);
      }
    };
    (state.suggestions.locations ?? []).forEach(addLocation);
    (state.overview.components ?? []).forEach((component) => addLocation(component?.location));
    addLocation(state.drafts.bom.parentLocation);
    return Array.from(locations);
  };

  const getSwComponentsForSelectedLocation = () => {
    const normalizedLocation = normalizeTextQuery(state.drafts.bom.parentLocation);
    if (!normalizedLocation) {
      return [];
    }
    const bomMatrixActive = state.bomMatrix.locationKey === normalizedLocation;
    if (bomMatrixActive && !state.bomMatrix.isLoadingSwComponents && !state.bomMatrix.lastError) {
      const components = Array.isArray(state.bomMatrix.swComponents) ? state.bomMatrix.swComponents : [];
      return [...components]
        .sort((a, b) => (a?.code ?? '').localeCompare(b?.code ?? '', 'ja', { numeric: true, sensitivity: 'base' }));
    }
    const components = Array.isArray(state.overview.components) ? state.overview.components : [];
    return components
      .filter((component) => (
        normalizeTextQuery(component?.location) === normalizedLocation
        && normalizeTextQuery(component?.name) === 'sw'
      ))
      .sort((a, b) => (a?.code ?? '').localeCompare(b?.code ?? '', 'ja', { numeric: true, sensitivity: 'base' }));
  };

  const getBomSlotNameSuggestions = () => {
    const names = new Set();
    const normalizedLocation = normalizeTextQuery(state.drafts.bom.parentLocation);
    const namesByLocation = state.suggestions.namesByLocation || {};

    if (normalizedLocation) {
      const matchedEntry = Object.entries(namesByLocation).find(
        ([key]) => normalizeTextQuery(key) === normalizedLocation,
      );
      matchedEntry?.[1]?.forEach((name) => {
        const normalizedName = normalizeSlotLabel(name);
        if (normalizedName) {
          names.add(normalizedName);
        }
      });

      (state.overview.components ?? []).forEach((component) => {
        if (normalizeTextQuery(component.location) === normalizedLocation) {
          const normalizedName = normalizeSlotLabel(component.name);
          if (normalizedName) {
            names.add(normalizedName);
          }
        }
      });
    }

    if (!names.size) {
      (state.suggestions.names ?? []).forEach((name) => {
        const normalizedName = normalizeSlotLabel(name);
        if (normalizedName) {
          names.add(normalizedName);
        }
      });
    }

    return Array.from(names).slice(0, MAX_SUGGESTION_ITEMS);
  };

  const getSlotComponentCandidates = (slotLabel) => {
    const normalizedLocation = normalizeTextQuery(state.drafts.bom.parentLocation);
    const normalizedLabel = normalizeTextQuery(slotLabel);
    const components = Array.isArray(state.overview.components) ? state.overview.components : [];
    return components
      .filter((component) => {
        const matchesLocation =
          !normalizedLocation || normalizeTextQuery(component.location) === normalizedLocation;
        if (!matchesLocation) return false;
        if (!normalizedLabel) return true;
        return normalizeTextQuery(component.name).includes(normalizedLabel);
      })
      .slice(0, 6);
  };

  const buildBomSlotCard = (slot) => {
    const card = document.createElement('div');
    card.className = 'sw-bom-slot';

    const header = document.createElement('div');
    header.className = 'sw-bom-slot__header';
    const label = document.createElement('div');
    label.className = 'sw-bom-slot__label';
    label.textContent = slot.label;
    header.append(label);

    if (state.drafts.bom.slots.length > 1) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'sw-bom-slot__remove';
      removeBtn.textContent = '×';
      removeBtn.title = 'この枠を削除';
      removeBtn.addEventListener('click', () => {
        removeBomSlot(slot.id);
        render();
      });
      header.append(removeBtn);
    }

    const body = document.createElement('div');
    body.className = 'sw-bom-slot__body';

    const equipField = document.createElement('label');
    equipField.className = 'sw-field sw-bom-slot__field';
    const equipLabel = document.createElement('span');
    equipLabel.textContent = '装備する品番';
    const equipInput = document.createElement('input');
    equipInput.type = 'text';
    equipInput.placeholder = `${slot.label}の品番を選択`;
    equipInput.value = slot.childCode ?? '';
    const datalist = document.createElement('datalist');
    const listId = `sw-bom-slot-${slot.id}-codes`;
    datalist.id = listId;

    const renderSuggestions = (keyword) => {
      const suggestions = getBomCodeSuggestions(keyword);
      datalist.replaceChildren();
      suggestions.forEach((item) => {
        const option = document.createElement('option');
        option.value = item.code;
        option.label = item.name || item.code;
        datalist.append(option);
      });
    };

    renderSuggestions(slot.childCode || slot.label);
    equipInput.setAttribute('list', listId);
    equipInput.addEventListener('input', (event) => {
      updateBomSlotField(slot.id, 'childCode', event.target.value);
      renderSuggestions(event.target.value || slot.label);
    });
    equipField.append(equipLabel, equipInput, datalist);
    body.append(equipField);

    const candidateComponents = getSlotComponentCandidates(slot.label);
    if (candidateComponents.length) {
      const candidateRow = document.createElement('div');
      candidateRow.className = 'sw-bom-slot__candidates';
      const candidateLabel = document.createElement('span');
      candidateLabel.className = 'sw-bom-slot__candidates-label';
      candidateLabel.textContent = '候補';
      candidateRow.append(candidateLabel);
      candidateComponents.forEach((component) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'sw-suggestion-chip';
        chip.textContent = `${component.code} / ${component.name}`;
        chip.addEventListener('click', () => {
          updateBomSlotField(slot.id, 'childCode', component.code);
          render();
        });
        candidateRow.append(chip);
      });
      body.append(candidateRow);
    }

    const metaRow = document.createElement('div');
    metaRow.className = 'sw-bom-slot__meta';

    const quantityField = document.createElement('label');
    quantityField.className = 'sw-field sw-field--compact';
    const quantityLabel = document.createElement('span');
    quantityLabel.textContent = '数量';
    const quantityInput = document.createElement('input');
    quantityInput.type = 'number';
    quantityInput.min = '0';
    quantityInput.step = '0.001';
    quantityInput.value = slot.quantity ?? '1';
    quantityInput.addEventListener('input', (event) => {
      updateBomSlotField(slot.id, 'quantity', event.target.value);
    });
    quantityField.append(quantityLabel, quantityInput);

    const noteField = document.createElement('label');
    noteField.className = 'sw-field sw-field--compact';
    const noteLabel = document.createElement('span');
    noteLabel.textContent = '枠メモ';
    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.placeholder = '例: 予備/ロットなど';
    noteInput.value = slot.note ?? '';
    noteInput.addEventListener('input', (event) => {
      updateBomSlotField(slot.id, 'note', event.target.value);
    });
    noteField.append(noteLabel, noteInput);

    metaRow.append(quantityField, noteField);
    body.append(metaRow);

    card.append(header, body);
    return card;
  };

  const buildBomForm = () => {
    const form = document.createElement('form');
    form.className = 'sw-form sw-form--bom-matrix';
    form.addEventListener('submit', submitBom);

    const lead = document.createElement('p');
    lead.className = 'sw-bom-lead';
    lead.textContent = '場所/ラインを選択すると、SW×名称のBOM表を編集できます。';
    form.append(lead);

    const locationRow = document.createElement('div');
    locationRow.className = 'sw-bom-row sw-bom-row--matrix';

    const locationField = document.createElement('label');
    locationField.className = 'sw-field sw-field--stacked';
    const locationLabel = document.createElement('span');
    locationLabel.textContent = '場所/ライン';
    const locationInput = document.createElement('input');
    locationInput.type = 'text';
    locationInput.placeholder = '例: L1 / 東京セル';
    locationInput.value = state.drafts.bom.parentLocation || '';
    const locationList = document.createElement('datalist');
    locationList.id = 'sw-bom-location-suggestions';
    const locationOptions = getBomLocationOptions();
    locationOptions.forEach((location) => {
      const option = document.createElement('option');
      option.value = location;
      locationList.append(option);
    });
    locationInput.setAttribute('list', locationList.id);
    locationInput.addEventListener('input', (event) => {
      setBomMatrixLocation(event.target.value);
      scheduleBomMatrixSwComponentsHydration(event.target.value);
      render();
    });
    locationField.append(locationLabel, locationInput, locationList);
    const locationChips = buildSuggestionChips('場所/ライン候補', locationOptions, (value) => {
      setBomMatrixLocation(value);
      scheduleBomMatrixSwComponentsHydration(value);
      render();
    });
    if (locationChips) {
      locationField.append(locationChips);
    }

    locationRow.append(locationField);
    form.append(locationRow);

    if (!normalizeSlotLabel(state.drafts.bom.parentLocation)) {
      const empty = document.createElement('div');
      empty.className = 'sw-empty';
      empty.textContent = '場所/ラインを選択してください';
      form.append(empty);
      return form;
    }

    syncBomMatrixSlots();
    const labels = getBomMatrixColumnLabels();
    const activeLocationKey = normalizeTextQuery(state.drafts.bom.parentLocation);
    const bomMatrixActive = activeLocationKey && state.bomMatrix.locationKey === activeLocationKey;
    const swComponents = getSwComponentsForSelectedLocation();

    if (!swComponents.length) {
      const empty = document.createElement('div');
      empty.className = 'sw-empty';
      if (bomMatrixActive && state.bomMatrix.lastError) {
        empty.textContent = state.bomMatrix.lastError;
      } else if (bomMatrixActive && state.bomMatrix.isLoadingSwComponents) {
        empty.textContent = 'SW品番を読み込み中...';
      } else {
        empty.textContent = '選択した場所/ラインに名称SWの品番がありません';
      }
      form.append(empty);
      return form;
    }

    if (bomMatrixActive && !state.bomMatrix.isLoadingSwComponents) {
      const limit = Number(state.bomMatrix.limit ?? 0);
      const total = Number(state.bomMatrix.total ?? 0);
      if (limit > 0 && total > limit) {
        const notice = document.createElement('p');
        notice.className = 'sw-bom-lead';
        notice.textContent = `SW品番: ${swComponents.length}件表示 / ${total}件 (上限${limit}件)`;
        form.append(notice);
      }
    }

    const matrix = document.createElement('div');
    matrix.className = 'sw-bom-matrix';

    const table = document.createElement('table');
    table.className = 'sw-bom-matrix__table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'sw-bom-matrix__corner';
    corner.textContent = 'SW';
    headRow.append(corner);
    labels.forEach((labelText) => {
      const th = document.createElement('th');
      th.textContent = labelText;
      headRow.append(th);
    });
    thead.append(headRow);
    table.append(thead);

    const tbody = document.createElement('tbody');

    swComponents.forEach((swComponent) => {
      const parentCode = (swComponent?.code ?? '').toString().trim();
      if (!parentCode) {
        return;
      }

      const bodyRow = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.className = 'sw-bom-matrix__row-header';
      const version = normalizeSlotLabel(swComponent?.version);
      rowHeader.textContent = version ? `${parentCode} (${version})` : parentCode;
      bodyRow.append(rowHeader);

      labels.forEach((labelText) => {
        const key = normalizeSlotLabel(labelText);
        const parentKey = normalizeSlotLabel(parentCode);
        const cell = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = `${labelText}の品番`;
        input.value = getBomMatrixCellValue(parentCode, labelText);

        const datalist = document.createElement('datalist');
        const listId = `sw-bom-matrix-${parentKey || 'sw'}-${key}-codes`;
        datalist.id = listId;

        const renderSuggestions = (keyword) => {
          const suggestions = getBomCodeSuggestions(keyword);
          datalist.replaceChildren();
          suggestions.forEach((item) => {
            const option = document.createElement('option');
            option.value = item.code;
            option.label = item.name || item.code;
            datalist.append(option);
          });
        };

        renderSuggestions(input.value || labelText);
        input.setAttribute('list', listId);
        input.addEventListener('input', (event) => {
          setBomMatrixCellValue(parentCode, labelText, event.target.value);
          renderSuggestions(event.target.value || labelText);
        });

        cell.append(input, datalist);
        bodyRow.append(cell);
      });

      tbody.append(bodyRow);
    });

    table.append(tbody);
    matrix.append(table);
    form.append(matrix);

    const actions = document.createElement('div');
    actions.className = 'feature-actions';
    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'ghost';
    resetButton.textContent = '表をクリア';
    resetButton.addEventListener('click', () => {
      resetBomMatrixValues();
      render();
    });
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'primary';
    submitButton.disabled = state.flags.isSavingBom;
    submitButton.textContent = state.flags.isSavingBom ? '登録中…' : 'BOMを登録';
    actions.append(resetButton, submitButton);
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

  const getDraftLocation = () => (state.drafts.component.location ?? '').trim();

  const resolveNameSuggestionsForLocation = () => {
    const location = getDraftLocation();
    const namesByLocation = state.suggestions.namesByLocation || {};
    if (location) {
      const matchedEntry = Object.entries(namesByLocation).find(
        ([key]) => (key ?? '').trim().toLowerCase() === location.toLowerCase(),
      );
      if (matchedEntry?.[1]?.length) {
        return { list: matchedEntry[1], label: `${matchedEntry[0]} の名称候補` };
      }
    }
    return { list: state.suggestions.names, label: '最近使った名称' };
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
      { key: 'location', label: '場所/ライン', placeholder: 'Aライン' },
      { key: 'code', label: '部品コード', placeholder: 'SW-001', required: true },
      { key: 'name', label: '名称', placeholder: 'メインモジュール', required: true },
      { key: 'version', label: '版数', placeholder: 'v1.0.0' },
    ];

    fields.forEach((field) => {
      const row = document.createElement('label');
      row.className = 'sw-field';
      const name = document.createElement('span');
      name.textContent = editing && field.key === 'code' ? `${field.label}（変更不可）` : field.label;
      const input = document.createElement('input');
      input.id = `sw-component-${field.key}`;
      input.type = 'text';
      input.required = Boolean(field.required);
      input.placeholder = field.placeholder || '';
      input.value = state.drafts.component[field.key] ?? '';
      let suggestionList = null;
      let suggestionLabel = '';
      if (field.key === 'name') {
        const nameSuggestions = resolveNameSuggestionsForLocation();
        suggestionList = nameSuggestions.list;
        suggestionLabel = nameSuggestions.label;
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
        const nextValue = event.target.value;
        const prevValue = state.drafts.component[field.key];
        state.drafts.component[field.key] = nextValue;
        if (field.key === 'location' && prevValue !== nextValue) {
          render();
        }
      });
      row.append(name, input);
      if (datalist) {
        row.append(datalist);
        const chips = buildSuggestionChips(suggestionLabel, suggestionList, (value) => {
          state.drafts.component[field.key] = value;
          input.value = value;
          input.focus();
          if (field.key === 'location') {
            render();
          }
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
    } else {
      const clearButton = document.createElement('button');
      clearButton.type = 'button';
      clearButton.className = 'ghost';
      clearButton.disabled = state.flags.isSavingComponent;
      clearButton.textContent = 'クリア';
      clearButton.addEventListener('click', () => resetComponentDraft());
      actions.append(clearButton);
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

  const buildImportResult = () => {
    if (!state.importResult) {
      return null;
    }
    const box = document.createElement('div');
    box.className = 'sw-import-result';
    box.classList.toggle('is-error', state.importResult.ok === false);

    const title = document.createElement('div');
    title.className = 'sw-import-result__title';
    const fileName = state.importResult.fileName || 'CSV';
    title.textContent = state.importResult.ok === false
      ? `${fileName} の取り込みに失敗しました`
      : `${fileName} を取り込みました`;
    box.append(title);

    const meta = document.createElement('div');
    meta.className = 'sw-import-result__meta';
    if (state.importResult.ok === false) {
      meta.textContent = state.importResult.error || 'CSVの取り込みに失敗しました';
    } else {
      const totalRows = state.importResult.totalRows;
      const totalText = Number.isFinite(totalRows) ? `全${totalRows}行中 ` : '';
      meta.textContent = `${totalText}${state.importResult.imported ?? 0}件を登録しました`;
    }
    box.append(meta);

    const duplicates = Array.isArray(state.importResult.duplicateCodes) ? state.importResult.duplicateCodes : [];
    if (duplicates.length) {
      const dup = document.createElement('div');
      dup.className = 'sw-import-result__note';
      const preview = duplicates.slice(0, 5).join(', ');
      const moreCount = duplicates.length - 5;
      dup.textContent = moreCount > 0
        ? `重複で上書きした品番: ${preview} 他${moreCount}件`
        : `重複で上書きした品番: ${preview}`;
      box.append(dup);
    }

    if (state.importResult.rowErrors?.length) {
      const errorLabel = document.createElement('div');
      errorLabel.className = 'sw-import-result__note';
      errorLabel.textContent = 'スキップした行';
      const list = document.createElement('ul');
      list.className = 'sw-import-result__list';
      state.importResult.rowErrors.slice(0, 5).forEach((err) => {
        const item = document.createElement('li');
        const rowLabel = Number.isFinite(err?.row) ? `${err.row}行目` : '行不明';
        item.textContent = `${rowLabel}: ${err?.error || '不明なエラー'}`;
        list.append(item);
      });
      if (state.importResult.rowErrors.length > 5) {
        const more = document.createElement('li');
        more.textContent = `...他 ${state.importResult.rowErrors.length - 5}件`;
        list.append(more);
      }
      box.append(errorLabel, list);
    }

    const actions = document.createElement('div');
    actions.className = 'feature-actions sw-import-result__actions';
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'ghost';
    clearButton.disabled = state.flags.isImportingComponents;
    clearButton.textContent = '結果をクリア';
    clearButton.addEventListener('click', () => {
      resetImportResult();
      render();
    });
    actions.append(clearButton);
    box.append(actions);

    return box;
  };

  const buildComponentImportPanel = () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'sw-import-panel';

    const intro = document.createElement('p');
    intro.className = 'sw-import-guidance';
    intro.textContent = '部品コードと名称を含むヘッダー付きCSVから、品番データをまとめて登録します。';
    const format = document.createElement('pre');
    format.className = 'sw-import-code';
    format.textContent = '部品コード,名称,版数,場所,説明\nSW-001,電源基板,v1.0,L1,初期ロット';
    const tip = document.createElement('p');
    tip.className = 'sw-import-guidance';
    tip.textContent = '必須: 部品コード/名称。重複コードは上書き、空行は無視されます。UTF-8のヘッダー付きCSVを選択してください。';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,text/csv';
    fileInput.id = 'sw-component-import-file';
    fileInput.hidden = true;
    fileInput.addEventListener('change', (event) => {
      const selected = event.target.files?.[0];
      if (selected) {
        void importComponentsFromCsvFile(selected);
      }
      event.target.value = '';
    });

    const actions = document.createElement('div');
    actions.className = 'feature-actions';
    const pickButton = document.createElement('button');
    pickButton.type = 'button';
    pickButton.className = 'primary';
    pickButton.disabled = state.flags.isImportingComponents;
    pickButton.textContent = state.flags.isImportingComponents ? '取り込み中…' : 'CSVを選択';
    pickButton.addEventListener('click', () => fileInput.click());

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'ghost';
    clearButton.disabled = state.flags.isImportingComponents || !state.importResult;
    clearButton.textContent = '結果クリア';
    clearButton.addEventListener('click', () => {
      resetImportResult();
      render();
    });

    actions.append(pickButton, clearButton);

    wrapper.append(intro, format, tip, fileInput, actions);

    const result = buildImportResult();
    if (result) {
      wrapper.append(result);
    }

    return wrapper;
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

  const sortComponentsByCodeAsc = (items = []) => [...items].sort((a, b) => {
    const codeA = a?.code ?? '';
    const codeB = b?.code ?? '';
    return codeA.localeCompare(codeB, 'ja', { numeric: true, sensitivity: 'base' });
  });

  const hasComponentQuery = () => {
    const search = getComponentSearch();
    return ['keyword', 'code', 'name', 'location'].some((key) => Boolean(normalizeQuery(search[key])));
  };

  const resetComponentSearch = () => {
    state.search.component = buildDefaultComponentSearch();
    state.search.componentResults = null;
  };

  let searchDebounceTimer = null;

  const applyComponentSearchField = (key, value) => {
    state.search.component = { ...getComponentSearch(), [key]: value };
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }
    searchDebounceTimer = setTimeout(() => {
      searchDebounceTimer = null;
      searchComponentsFromServer();
    }, 300);
  };

  const searchComponentsFromServer = async () => {
    if (!hasComponentQuery()) {
      state.search.componentResults = null;
      render();
      return;
    }
    if (!ensureBridge('searchSwComponents')) return;
    state.flags.isSearchingComponents = true;
    render();
    try {
      const search = getComponentSearch();
      const result = await window.desktopBridge.searchSwComponents({
        keyword: search.keyword,
        code: search.code,
        name: search.name,
        location: search.location,
      });
      if (result?.ok) {
        state.search.componentResults = {
          components: result.components ?? [],
          total: result.total ?? 0,
          limit: result.limit ?? 500,
        };
      } else {
        state.search.componentResults = null;
        applyStatus({ lastError: result?.error || '品番検索に失敗しました' });
      }
    } catch (error) {
      state.search.componentResults = null;
      applyStatus({ lastError: error?.message || '品番検索中にエラーが発生しました' });
    } finally {
      state.flags.isSearchingComponents = false;
      render();
    }
  };

  const getFilteredComponents = () => {
    if (hasComponentQuery() && state.search.componentResults) {
      return state.search.componentResults.components;
    }
    const allComponents = Array.isArray(state.overview.components) ? state.overview.components : [];
    return sortComponentsByCodeAsc(allComponents);
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
    if (state.flags.isSearchingComponents) {
      meta.textContent = '検索中...';
    } else if (hasComponentQuery() && state.search.componentResults) {
      const serverTotal = state.search.componentResults.total ?? 0;
      const limit = state.search.componentResults.limit ?? 500;
      if (serverTotal > limit) {
        meta.textContent = `${filteredCount}件表示 / ${serverTotal}件ヒット (上限${limit}件)`;
      } else {
        meta.textContent = `${filteredCount} / ${serverTotal} 件`;
      }
    } else {
      const dbTotal = state.overview.totalComponents ?? totalCount;
      const limit = state.overview.componentLimit ?? 1000;
      if (dbTotal > limit) {
        meta.textContent = `${filteredCount}件表示 / ${dbTotal}件 (上限${limit}件)`;
      } else {
        meta.textContent = `${totalCount}件`;
      }
    }

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

  const buildNameSuggestionHints = () => {
    const nameSuggestions = Array.isArray(state.suggestions.names) ? state.suggestions.names : [];
    if (!nameSuggestions.length) {
      return null;
    }

    const panel = document.createElement('div');
    panel.className = 'sw-search-hint-panel';

    const header = document.createElement('div');
    header.className = 'sw-search-hint-panel__header';

    const label = document.createElement('span');
    label.className = 'sw-search-hint-panel__title';
    label.textContent = `名称で絞り込み (${nameSuggestions.length}件)`;

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'ghost sw-search-hint-panel__toggle';
    toggleButton.textContent = state.flags.isNameHintsOpen ? '閉じる' : '全て表示';
    toggleButton.setAttribute('aria-expanded', state.flags.isNameHintsOpen ? 'true' : 'false');
    toggleButton.addEventListener('click', () => {
      state.flags.isNameHintsOpen = !state.flags.isNameHintsOpen;
      render();
    });

    header.append(label, toggleButton);
    panel.append(header);

    const body = document.createElement('div');
    body.className = 'sw-search-hint-panel__body';
    body.hidden = !state.flags.isNameHintsOpen;

    const chips = buildSuggestionChips('名称で絞り込み', nameSuggestions, (value) => {
      applyComponentSearchField('name', value);
      render();
    }, { maxItems: null, showLabel: false });

    if (chips) {
      body.append(chips);
      panel.append(body);
    }

    return panel;
  };

  const buildComponentSearchHints = () => {
    const hints = [];
    const namePanel = buildNameSuggestionHints();
    const locations = buildSuggestionChips('場所/ラインで絞り込み', state.suggestions.locations, (value) => {
      applyComponentSearchField('location', value);
      render();
    });
    if (namePanel) hints.push(namePanel);
    if (locations) hints.push(locations);
    if (!hints.length) {
      return null;
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'sw-search-hints';
    hints.forEach((hint) => wrapper.append(hint));
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
    rightColumn.append(
      buildSection(
        isEditingComponent() ? '品番を編集' : '品番を登録',
        buildComponentForm(),
      ),
      buildSection('CSVで一括登録', buildComponentImportPanel()),
    );

    layout.append(leftColumn, rightColumn);
    return layout;
  };

  const buildBomView = () => {
    const layout = document.createElement('div');
    layout.className = 'sw-column';
    layout.append(
      buildSection('接続ステータス', buildStatusGrid()),
      buildSection('SW BOM表を編集', buildBomForm()),
    );
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

    lead.append(eyebrow, title, subtitle);

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
