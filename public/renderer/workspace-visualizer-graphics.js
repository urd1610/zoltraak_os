export const getWorkspaceNodeColor = (node) => {
  if (node?.type === 'directory') return '#a9b8d6';
  const ext = (node?.ext ?? '').toLowerCase();
  if (['js', 'mjs', 'cjs'].includes(ext)) return '#facc15';
  if (ext === 'json') return '#d946ef';
  if (['md', 'mdx'].includes(ext)) return '#38bdf8';
  if (ext === 'txt') return '#e5e7eb';
  if (['css', 'scss'].includes(ext)) return '#34d399';
  return '#8ba0c2';
};

const LABEL_FONT_FAMILY = `'Atkinson Hyperlegible', 'Space Grotesk', 'Segoe UI', 'Noto Sans JP', sans-serif`;
const LABEL_FONT_WEIGHT = 500;
const LABEL_FONT_SIZE = 64;
const LABEL_CANVAS_MAX_DPR = 3.2;
export const LABEL_TARGET_PIXEL_HEIGHT = 54;

let labelFontReadyPromise = null;
export const ensureWorkspaceLabelFontReady = () => {
  if (labelFontReadyPromise) return labelFontReadyPromise;
  if (typeof document === 'undefined' || !document.fonts?.load) {
    labelFontReadyPromise = Promise.resolve();
    return labelFontReadyPromise;
  }
  const fontSpec = `${LABEL_FONT_WEIGHT} ${LABEL_FONT_SIZE}px ${LABEL_FONT_FAMILY}`;
  labelFontReadyPromise = Promise.all([document.fonts.ready, document.fonts.load(fontSpec)]).catch(() => {});
  return labelFontReadyPromise;
};

export const buildWorkspaceLabelSprite = (text, color, scale = 1) => {
  if (typeof THREE === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const devicePixelRatio = window.devicePixelRatio || 1;
  const oversample = 1.3 + Math.max(0, scale - 1) * 0.5;
  const dpr = Math.min(devicePixelRatio * oversample, LABEL_CANVAS_MAX_DPR);
  const fontSize = LABEL_FONT_SIZE;
  const fontWeight = LABEL_FONT_WEIGHT;
  const fontFamily = LABEL_FONT_FAMILY;
  const font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.font = font;
  const paddingX = 140;
  const paddingY = 90;
  const measured = Math.max(320, Math.ceil(ctx.measureText(text).width + paddingX));
  const displayWidth = Math.min(1400, measured);
  const displayHeight = Math.max(230, fontSize + paddingY);
  canvas.width = displayWidth * dpr;
  canvas.height = displayHeight * dpr;
  ctx.scale(dpr, dpr);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const centerX = displayWidth / 2;
  const centerY = displayHeight / 2 + 2;
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(10, 16, 26, 0.78)';
  ctx.shadowBlur = 24;
  ctx.strokeStyle = '#0b1222f0';
  ctx.lineWidth = 10;
  ctx.strokeText(text, centerX, centerY);
  ctx.shadowColor = `${color}66`;
  ctx.shadowBlur = 14;
  ctx.strokeStyle = `${color}d8`;
  ctx.lineWidth = 6;
  ctx.strokeText(text, centerX, centerY);
  ctx.shadowColor = 'rgba(12, 18, 28, 0.55)';
  ctx.shadowBlur = 14;
  ctx.fillStyle = `${color}f2`;
  ctx.fillText(text, centerX, centerY);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 12;
  texture.generateMipmaps = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    opacity: 0.95,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  const spriteScale = 5.6 * scale;
  const aspect = displayWidth / displayHeight;
  sprite.scale.set(aspect * spriteScale, spriteScale, 1);
  sprite.userData.aspect = aspect;
  sprite.userData.baseScaleY = spriteScale;
  sprite.userData.baseOpacity = material.opacity;
  sprite.userData.dispose = () => texture.dispose();
  return sprite;
};

export const buildNodeGlowSprite = (color, radius = 3, intensity = 1) => {
  if (typeof THREE === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, `${color}45`);
  gradient.addColorStop(0.35, `${color}26`);
  gradient.addColorStop(1, `${color}00`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const material = new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.5 * intensity,
  });
  const sprite = new THREE.Sprite(material);
  const spriteScale = radius * 4;
  sprite.scale.set(spriteScale, spriteScale, 1);
  sprite.userData.dispose = () => texture.dispose();
  return sprite;
};
