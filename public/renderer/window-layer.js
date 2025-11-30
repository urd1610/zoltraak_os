let highestWindowZIndex = 0;
let activeWindowDrag = null;

const windowLayer = (() => {
  const layer = document.createElement('div');
  layer.className = 'window-layer';
  document.body.append(layer);
  return layer;
})();

const getLayerRect = () => windowLayer.getBoundingClientRect();

const clampWindowPosition = (left, top, width, height, layerRect = getLayerRect()) => {
  const maxLeft = Math.max(0, layerRect.width - width);
  const maxTop = Math.max(0, layerRect.height - height);
  return {
    left: Math.min(Math.max(0, left), maxLeft),
    top: Math.min(Math.max(0, top), maxTop),
  };
};

const removeWindowById = (id) => {
  if (!id) return;
  const existing = windowLayer.querySelector(`[data-window-id="${id}"]`);
  if (existing) {
    existing.remove();
  }
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

export const createWindowShell = (id, titleText, onClose) => {
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
