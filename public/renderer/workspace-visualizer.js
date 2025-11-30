const getWorkspaceNodeColor = (node) => {
  if (node?.type === 'directory') return '#a9b8d6';
  const ext = (node?.ext ?? '').toLowerCase();
  if (['js', 'mjs', 'cjs'].includes(ext)) return '#facc15';
  if (ext === 'json') return '#d946ef';
  if (['md', 'mdx'].includes(ext)) return '#38bdf8';
  if (ext === 'txt') return '#e5e7eb';
  if (['css', 'scss'].includes(ext)) return '#34d399';
  return '#8ba0c2';
};

const buildWorkspaceLabelSprite = (text, color, scale = 1) => {
  if (typeof THREE === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontSize = 64;
  ctx.font = `800 ${fontSize}px 'Space Grotesk', 'Inter', sans-serif`;
  const paddingX = 110;
  const paddingY = 70;
  const measured = Math.max(260, Math.ceil(ctx.measureText(text).width + paddingX));
  const width = Math.min(1200, measured);
  const height = Math.max(200, fontSize + paddingY);
  canvas.width = width;
  canvas.height = height;
  ctx.font = `800 ${fontSize}px 'Space Grotesk', 'Inter', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.shadowColor = `${color}80`;
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = color;
  ctx.lineWidth = 7;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = `${color}c0`;
  ctx.strokeText(text, width / 2, height / 2 + 4);
  ctx.fillText(text, width / 2, height / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    opacity: 0.82,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  const spriteScale = 5.6 * scale;
  sprite.scale.set((width / height) * spriteScale, spriteScale, 1);
  sprite.userData.baseOpacity = material.opacity;
  sprite.userData.dispose = () => texture.dispose();
  return sprite;
};

const buildNodeGlowSprite = (color, radius = 3, intensity = 1) => {
  if (typeof THREE === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, `rgba(255, 255, 255, ${0.22 * intensity})`);
  gradient.addColorStop(0.25, `rgba(255, 255, 255, ${0.14 * intensity})`);
  gradient.addColorStop(0.45, `${color}33`);
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
    opacity: 0.9,
  });
  const sprite = new THREE.Sprite(material);
  const spriteScale = radius * 4;
  sprite.scale.set(spriteScale, spriteScale, 1);
  sprite.userData.dispose = () => texture.dispose();
  return sprite;
};

let threeLoadPromise = null;

const loadThreeModule = async () => {
  if (typeof THREE !== 'undefined') return THREE;
  if (threeLoadPromise) return threeLoadPromise;
  if (typeof window === 'undefined') return null;
  const moduleUrl = window.desktopBridge?.getThreeModuleUrl?.();
  if (!moduleUrl) {
    console.error('three.js module URL is unavailable');
    return null;
  }
  threeLoadPromise = import(moduleUrl)
    .then((mod) => {
      if (typeof THREE === 'undefined' && mod) {
        window.THREE = mod;
      }
      return window.THREE ?? mod ?? null;
    })
    .catch((error) => {
      console.error('Failed to load three.js module', error);
      threeLoadPromise = null;
      return null;
    });
  return threeLoadPromise;
};

const buildWorkspaceTree = (graph) => {
  const nodeMap = new Map();
  (graph?.nodes ?? []).forEach((node) => {
    nodeMap.set(node.id, { ...node, children: [] });
  });

  (graph?.links ?? []).forEach((link) => {
    const parent = nodeMap.get(link.source);
    const child = nodeMap.get(link.target);
    if (parent && child) {
      parent.children.push(child);
    }
  });

  const root = nodeMap.get('.') ?? (nodeMap.size ? nodeMap.values().next().value : null);

  const sortChildren = (node) => {
    if (!node?.children?.length) return;
    node.children.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortChildren);
  };
  sortChildren(root);

  return { root, nodeMap };
};

const hashToUnit = (text) => {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
};

const jitterFromHash = (key, magnitude) => (hashToUnit(key) - 0.5) * 2 * magnitude;

const addVec = (a, b) => ({ x: (a?.x ?? 0) + (b?.x ?? 0), y: (a?.y ?? 0) + (b?.y ?? 0), z: (a?.z ?? 0) + (b?.z ?? 0) });
const scaleVec = (v, s) => ({ x: (v?.x ?? 0) * s, y: (v?.y ?? 0) * s, z: (v?.z ?? 0) * s });
const crossVec = (a, b) => ({
  x: (a?.y ?? 0) * (b?.z ?? 0) - (a?.z ?? 0) * (b?.y ?? 0),
  y: (a?.z ?? 0) * (b?.x ?? 0) - (a?.x ?? 0) * (b?.z ?? 0),
  z: (a?.x ?? 0) * (b?.y ?? 0) - (a?.y ?? 0) * (b?.x ?? 0),
});
const normalizeVec = (v) => {
  const len = Math.hypot(v?.x ?? 0, v?.y ?? 0, v?.z ?? 0);
  if (!len) return { x: 0, y: 1, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
};

const buildBranchBasis = (dir) => {
  const up = Math.abs(dir?.y ?? 0) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const u = normalizeVec(crossVec(dir, up));
  const v = normalizeVec(crossVec(dir, u));
  return { u, v };
};

const buildSeedDirections = (count) => {
  const directions = [];
  if (count <= 0) return directions;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    const y = 1 - 2 * t;
    const radius = Math.sqrt(1 - y * y);
    const phi = i * goldenAngle;
    directions.push({ x: Math.cos(phi) * radius, y, z: Math.sin(phi) * radius });
  }
  return directions;
};

const computeWorkspaceLayout = (graph) => {
  const positions = new Map();
  const { root } = buildWorkspaceTree(graph);
  if (!root) {
    return { positions, radius: 12, maxDepth: 0 };
  }

  const directions = new Map();
  const distances = new Map();
  positions.set(root.id, { x: 0, y: 0, z: 0 });
  directions.set(root.id, { x: 0, y: 1, z: 0 });
  distances.set(root.id, 0);

  const seedDirections = buildSeedDirections(root.children?.length ?? 0);
  let maxDepth = 0;
  let radius = 12;

  const placeChildren = (parent) => {
    const children = parent.children ?? [];
    children.forEach((child, index) => {
      const key = `${child.id}:${index}`;
      const baseDir = parent.depth === 0 && seedDirections.length
        ? seedDirections[index % seedDirections.length]
        : directions.get(parent.id) ?? { x: 0, y: 1, z: 0 };
      const dirNoise = {
        x: jitterFromHash(`${key}:dx`, 0.38),
        y: jitterFromHash(`${key}:dy`, 0.38),
        z: jitterFromHash(`${key}:dz`, 0.38),
      };
      const dir = normalizeVec(addVec(baseDir, dirNoise));

      const parentDistance = distances.get(parent.id) ?? 0;
      const depth = child.depth ?? (parent.depth ?? 0) + 1;
      const step = 4.1 + depth * 0.6;
      const length = parentDistance + step * (child.type === 'directory' ? 1.22 : 1.05);
      const { u, v } = buildBranchBasis(dir);
      const spread = Math.max(0.65, 0.9 + (children.length - 1) * 0.14);
      const phase = children.length > 1
        ? ((index / Math.max(1, children.length - 1)) - 0.5) * Math.PI * 0.82
        : 0;
      const lateral = children.length > 1
        ? addVec(
          scaleVec(u, Math.sin(phase) * spread * (1 + depth * 0.06)),
          scaleVec(v, Math.cos(phase) * spread * 0.55),
        )
        : { x: 0, y: 0, z: 0 };
      const jitter = {
        x: jitterFromHash(`${key}:jx`, 0.9 + depth * 0.08),
        y: jitterFromHash(`${key}:jy`, 0.7 + depth * 0.08),
        z: jitterFromHash(`${key}:jz`, 0.9 + depth * 0.08),
      };

      const radial = scaleVec(dir, length);
      const pos = addVec(addVec(radial, lateral), jitter);
      positions.set(child.id, pos);
      const dist = Math.hypot(pos.x, pos.y, pos.z);
      distances.set(child.id, dist);
      directions.set(child.id, normalizeVec(addVec(dir, scaleVec(lateral, 0.12))));
      maxDepth = Math.max(maxDepth, depth);
      radius = Math.max(radius, dist * 1.35);

      if (child.children?.length) {
        placeChildren(child);
      }
    });
  };

  placeChildren(root);

  return { positions, radius: Math.max(radius, 12), maxDepth };
};

const createOrbitControlsState = (camera, focusPoint, layoutRadius) => {
  if (typeof THREE === 'undefined' || !camera || !focusPoint) return null;
  const offset = new THREE.Vector3().subVectors(camera.position, focusPoint);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  const target = spherical.clone();
  const scratch = new THREE.Vector3();
  const limits = {
    minRadius: Math.max(6, layoutRadius * 0.55),
    maxRadius: Math.max(layoutRadius * 1.6, layoutRadius * 4),
    minPhi: 0.18,
    maxPhi: Math.PI - 0.14,
  };
  return {
    spherical,
    target,
    focusPoint: focusPoint.clone(),
    limits,
    lastPointer: { x: 0, y: 0 },
    isDragging: false,
    scratch,
  };
};

const applyOrbitControlsToCamera = (controls, camera) => {
  if (!controls || !camera || typeof THREE === 'undefined') return;
  const { spherical, target, limits, scratch, focusPoint } = controls;
  const easing = controls.isDragging ? 0.22 : 0.12;

  spherical.theta += (target.theta - spherical.theta) * easing;
  spherical.phi += (target.phi - spherical.phi) * easing;
  spherical.radius += (target.radius - spherical.radius) * 0.18;

  spherical.phi = THREE.MathUtils.clamp(spherical.phi, limits.minPhi, limits.maxPhi);
  target.phi = THREE.MathUtils.clamp(target.phi, limits.minPhi, limits.maxPhi);

  spherical.radius = THREE.MathUtils.clamp(spherical.radius, limits.minRadius, limits.maxRadius);
  target.radius = THREE.MathUtils.clamp(target.radius, limits.minRadius, limits.maxRadius);

  scratch.setFromSpherical(spherical).add(focusPoint);
  camera.position.copy(scratch);
  camera.lookAt(focusPoint);
};

export const createWorkspaceVisualizer = (workspaceVisualizer) => {
  let isWorkspaceVisualizerActive = false;
  let workspaceVisualizerLoading = false;
  let workspaceVisualizerStatusEl = null;
  let workspaceGraphCache = null;
  let workspaceScene = null;
  let workspaceSceneAnimationId = null;
  let hasWorkspaceInteractionHandlers = false;

  const getWorkspaceVisualizerStatusEl = () => {
    if (!workspaceVisualizer) return null;
    if (workspaceVisualizerStatusEl?.parentElement === workspaceVisualizer) {
      return workspaceVisualizerStatusEl;
    }
    const status = document.createElement('div');
    status.className = 'workspace-visualizer-status';
    workspaceVisualizer.append(status);
    workspaceVisualizerStatusEl = status;
    return status;
  };

  const setWorkspaceVisualizerMessage = (message) => {
    const target = getWorkspaceVisualizerStatusEl();
    if (!target) return;
    const text = message ?? '';
    target.textContent = text;
    target.hidden = text.length === 0;
  };

  const getOrbitControls = () => workspaceScene?.controls ?? null;

  const stopOrbitDrag = () => {
    const controls = getOrbitControls();
    if (controls) {
      controls.isDragging = false;
    }
    workspaceVisualizer?.classList?.remove?.('is-dragging');
  };

  const setWorkspaceVisualizerActive = (active) => {
    isWorkspaceVisualizerActive = Boolean(active);
    if (!workspaceVisualizer) return;
    workspaceVisualizer.classList.toggle('is-active', isWorkspaceVisualizerActive);
    workspaceVisualizer.setAttribute('aria-hidden', isWorkspaceVisualizerActive ? 'false' : 'true');
    if (!isWorkspaceVisualizerActive) {
      stopOrbitDrag();
    }
  };

  const handleWorkspacePointerDown = (event) => {
    if (!isWorkspaceVisualizerActive || workspaceVisualizerLoading) return;
    if (event.button !== undefined && event.button !== 0) return;
    const controls = getOrbitControls();
    if (!controls || typeof THREE === 'undefined') return;
    controls.isDragging = true;
    controls.lastPointer = { x: event.clientX, y: event.clientY };
    workspaceVisualizer?.classList?.add?.('is-dragging');
    event.preventDefault();
  };

  const handleWorkspacePointerMove = (event) => {
    const controls = getOrbitControls();
    if (!isWorkspaceVisualizerActive || !controls?.isDragging || typeof THREE === 'undefined') return;
    const dx = event.clientX - (controls.lastPointer?.x ?? 0);
    const dy = event.clientY - (controls.lastPointer?.y ?? 0);
    controls.lastPointer = { x: event.clientX, y: event.clientY };
    const rotateSpeed = 0.0062;
    const tiltSpeed = 0.0044;
    controls.target.theta -= dx * rotateSpeed;
    controls.target.phi = THREE.MathUtils.clamp(
      controls.target.phi + dy * tiltSpeed,
      controls.limits.minPhi,
      controls.limits.maxPhi,
    );
    event.preventDefault();
  };

  const handleWorkspacePointerUp = () => {
    stopOrbitDrag();
  };

  const handleWorkspaceWheel = (event) => {
    if (!isWorkspaceVisualizerActive || typeof THREE === 'undefined') return;
    const controls = getOrbitControls();
    if (!controls) return;
    const zoomFactor = Math.exp(event.deltaY * 0.0012);
    controls.target.radius = THREE.MathUtils.clamp(
      controls.target.radius * zoomFactor,
      controls.limits.minRadius,
      controls.limits.maxRadius,
    );
    event.preventDefault();
  };

  const ensureWorkspaceInteractionHandlers = () => {
    if (hasWorkspaceInteractionHandlers || !workspaceVisualizer) return;
    workspaceVisualizer.addEventListener('pointerdown', handleWorkspacePointerDown);
    window.addEventListener('pointermove', handleWorkspacePointerMove);
    window.addEventListener('pointerup', handleWorkspacePointerUp);
    workspaceVisualizer.addEventListener('wheel', handleWorkspaceWheel, { passive: false });
    hasWorkspaceInteractionHandlers = true;
  };

  const disposeWorkspaceScene = () => {
    if (workspaceSceneAnimationId) {
      cancelAnimationFrame(workspaceSceneAnimationId);
      workspaceSceneAnimationId = null;
    }
    if (!workspaceScene) return;
    stopOrbitDrag();
    const { renderer, groups, lines, scatter } = workspaceScene;
    const disposeChild = (child) => {
      child.userData?.dispose?.();
      if (child.material?.map) {
        child.material.map.dispose?.();
      }
      if (child.material?.dispose) {
        child.material.dispose();
      }
      child.geometry?.dispose?.();
    };
    groups?.nodes?.traverse?.(disposeChild);
    groups?.labels?.traverse?.(disposeChild);
    if (Array.isArray(lines)) {
      lines.forEach((line) => {
        line.geometry?.dispose?.();
        line.material?.dispose?.();
      });
    } else if (lines) {
      lines.geometry?.dispose?.();
      lines.material?.dispose?.();
    }
    if (scatter) {
      scatter.geometry?.dispose?.();
      scatter.material?.dispose?.();
    }
    if (renderer) {
      renderer.forceContextLoss?.();
      renderer.dispose?.();
      renderer.domElement?.remove();
    }
    workspaceScene = null;
  };

  const loadWorkspaceGraph = async () => {
    if (!window.desktopBridge?.getWorkspaceGraph) return null;
    try {
      const graph = await window.desktopBridge.getWorkspaceGraph();
      if (graph?.nodes?.length) {
        workspaceGraphCache = graph;
        return graph;
      }
    } catch (error) {
      console.error('Failed to load workspace graph', error);
    }
    return workspaceGraphCache;
  };

  const createWorkspaceScene = (graph) => {
    if (!workspaceVisualizer || typeof THREE === 'undefined') return false;
    const rect = workspaceVisualizer.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      console.warn('workspace visualizer has no measurable size', rect);
      return false;
    }

    disposeWorkspaceScene();

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(rect.width, rect.height);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMappingExposure = 1.08;
    renderer.domElement.classList.add('workspace-visualizer-canvas');

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050915, 0.012);
    const camera = new THREE.PerspectiveCamera(55, rect.width / rect.height, 0.1, 2000);
    const layout = computeWorkspaceLayout(graph);
    const focusPoint = new THREE.Vector3(0, -layout.radius * 0.08, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    const keyLight = new THREE.PointLight(0x7dd3fc, 1.45, layout.radius * 6.5);
    keyLight.position.set(layout.radius * 0.42, layout.radius * 0.65, layout.radius * 1.6);
    const rimLight = new THREE.PointLight(0xc4b5fd, 1.2, layout.radius * 5.6);
    rimLight.position.set(-layout.radius * 0.55, layout.radius * 0.35, -layout.radius * 0.6);
    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.55);
    fillLight.position.set(0, layout.radius * 0.9, layout.radius * 1.8);
    const backLight = new THREE.PointLight(0x60a5fa, 0.7, layout.radius * 4.4);
    backLight.position.set(-layout.radius * 0.2, -layout.radius * 0.15, layout.radius * 1.2);
    const coreLight = new THREE.PointLight(0xffffff, 0.4, layout.radius * 2.2);
    scene.add(ambient, keyLight, rimLight, fillLight, backLight, coreLight);

    const groups = { nodes: new THREE.Group(), labels: new THREE.Group() };
    const nodeMeta = [];

    (graph.nodes ?? []).forEach((node) => {
      const pos = layout.positions.get(node.id);
      if (!pos) return;
      const colorHex = getWorkspaceNodeColor(node);
      const color = new THREE.Color(colorHex);
      const level = node.depth ?? 0;
      const isDirectory = node.type === 'directory';
      const radius = isDirectory
        ? Math.max(0.9, 1.35 - level * 0.065)
        : Math.max(0.52, 1 - level * 0.05);
      const geometry = new THREE.SphereGeometry(radius, 28, 28);
      const material = new THREE.MeshPhysicalMaterial({
        color,
        emissive: color,
        emissiveIntensity: isDirectory ? 1.34 : 1.08,
        roughness: 0.16,
        metalness: 0.52,
        clearcoat: 0.42,
        clearcoatRoughness: 0.2,
        transmission: 0.16,
        transparent: true,
        opacity: isDirectory ? 0.98 : 0.9,
      });
      const core = new THREE.Mesh(geometry, material);
      core.castShadow = false;
      core.receiveShadow = false;

      const nodeGroup = new THREE.Group();
      nodeGroup.position.set(pos.x, pos.y, pos.z);

      const glow = buildNodeGlowSprite(colorHex, radius * 3.9, isDirectory ? 1.25 : 1.05);
      if (glow) {
        nodeGroup.add(glow);
      }

      nodeGroup.add(core);
      groups.nodes.add(nodeGroup);

      const label = buildWorkspaceLabelSprite(node.name, colorHex, isDirectory ? 1.06 : 0.98);
      const labelOffset = radius * 2.9;
      if (label) {
        label.position.set(pos.x, pos.y + labelOffset, pos.z);
        label.userData.offsetY = labelOffset;
        label.userData.baseOpacity = label.userData.baseOpacity ?? label.material?.opacity ?? 0.82;
        groups.labels.add(label);
      }

      nodeMeta.push({
        mesh: nodeGroup,
        label,
        labelOffset,
        basePosition: pos,
        wobbleSpeed: 0.32 + Math.random() * 0.18,
        wobbleAmp: 0.12 + Math.random() * 0.14,
        wobblePhase: Math.random() * Math.PI * 2,
      });
    });

    const linePositions = [];
    const positionMap = layout.positions;
    (graph.links ?? []).forEach((link) => {
      const from = positionMap.get(link.source);
      const to = positionMap.get(link.target);
      if (!from || !to) return;
      linePositions.push(from.x, from.y, from.z, to.x, to.y, to.z);
    });

    const lineMeshes = [];
    if (linePositions.length) {
      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x9ad2ff,
        transparent: true,
        opacity: 0.74,
        linewidth: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const baseLines = new THREE.LineSegments(lineGeometry, lineMaterial);
      baseLines.renderOrder = -2;
      lineMeshes.push(baseLines);
      scene.add(baseLines);

      const glowGeometry = lineGeometry.clone();
      const glowMaterial = new THREE.LineBasicMaterial({
        color: 0xcde8ff,
        transparent: true,
        opacity: 0.3,
        linewidth: 2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glowLines = new THREE.LineSegments(glowGeometry, glowMaterial);
      glowLines.renderOrder = -3;
      glowLines.scale.set(1.008, 1.008, 1.008);
      lineMeshes.push(glowLines);
      scene.add(glowLines);
    }

    const scatterCount = Math.min(720, Math.max(160, (graph.nodes?.length ?? 20) * 5));
    const scatterPositions = new Float32Array(scatterCount * 3);
    for (let i = 0; i < scatterCount; i += 1) {
      scatterPositions[i * 3] = (Math.random() - 0.5) * layout.radius * 4;
      scatterPositions[i * 3 + 1] = (Math.random() - 0.5) * layout.radius * 3;
      scatterPositions[i * 3 + 2] = (Math.random() - 0.5) * layout.radius * 4;
    }
    const scatterGeometry = new THREE.BufferGeometry();
    scatterGeometry.setAttribute('position', new THREE.BufferAttribute(scatterPositions, 3));
    const scatterMaterial = new THREE.PointsMaterial({
      color: 0xbcd7ff,
      size: 0.4,
      transparent: true,
      opacity: 0.22,
      sizeAttenuation: true,
      depthWrite: false,
    });
    const scatter = new THREE.Points(scatterGeometry, scatterMaterial);
    scene.add(scatter);

    camera.position.set(layout.radius * 0.42, layout.radius * 0.2, layout.radius * 2.2);
    camera.lookAt(focusPoint);
    const orbitControls = createOrbitControlsState(camera, focusPoint, layout.radius);

    scene.add(groups.nodes);
    scene.add(groups.labels);

    workspaceVisualizer.append(renderer.domElement);

    workspaceScene = {
      renderer,
      scene,
      camera,
      groups,
      lines: lineMeshes,
      scatter,
      nodeMeta,
      radius: layout.radius,
      controls: orbitControls,
      labelFadeScratch: {
        cameraDir: new THREE.Vector3(),
        toLabel: new THREE.Vector3(),
      },
    };
    ensureWorkspaceInteractionHandlers();
    return true;
  };

  const resizeWorkspaceScene = () => {
    if (!workspaceScene || !workspaceVisualizer) return;
    const rect = workspaceVisualizer.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    workspaceScene.renderer.setSize(rect.width, rect.height);
    workspaceScene.camera.aspect = rect.width / rect.height;
    workspaceScene.camera.updateProjectionMatrix();
  };

  const animateWorkspaceScene = (timestamp) => {
    if (!workspaceScene || !isWorkspaceVisualizerActive) {
      return;
    }
    const t = (timestamp ?? performance.now()) * 0.001;
    const labelScratch = workspaceScene.labelFadeScratch;
    if (labelScratch?.cameraDir) {
      workspaceScene.camera.getWorldDirection(labelScratch.cameraDir);
    }
    const fadeNear = workspaceScene.radius * 0.38;
    const fadeFar = workspaceScene.radius * 1.5;

    (workspaceScene.nodeMeta ?? []).forEach((meta) => {
      if (!meta?.mesh || !meta.basePosition) return;
      const wobble = Math.sin(t * meta.wobbleSpeed + meta.wobblePhase) * meta.wobbleAmp;
      meta.mesh.position.set(
        meta.basePosition.x,
        meta.basePosition.y + wobble,
        meta.basePosition.z,
      );
      if (meta.label) {
        const offsetY = meta.labelOffset ?? meta.label.userData?.offsetY ?? 0;
        meta.label.position.set(
          meta.basePosition.x,
          meta.basePosition.y + offsetY + wobble,
          meta.basePosition.z,
        );
        if (labelScratch?.cameraDir && labelScratch?.toLabel && meta.label.material) {
          labelScratch.toLabel
            .subVectors(meta.label.position, workspaceScene.camera.position)
            .normalize();
          const facing = Math.max(0, labelScratch.cameraDir.dot(labelScratch.toLabel));
          const facingFade = 0.35 + facing * 0.65;
          const distance = workspaceScene.camera.position.distanceTo(meta.label.position);
          const distanceFade = 1 - THREE.MathUtils.smoothstep(distance, fadeNear, fadeFar);
          const baseOpacity = meta.label.userData?.baseOpacity ?? meta.label.material.opacity ?? 0.8;
          meta.label.material.opacity = baseOpacity
            * THREE.MathUtils.clamp(distanceFade * facingFade, 0.18, 1);
        }
      }
    });

    const lineMeshes = Array.isArray(workspaceScene.lines)
      ? workspaceScene.lines
      : [workspaceScene.lines].filter(Boolean);
    const linePulse = 0.45 + Math.sin(t * 0.6) * 0.08;
    lineMeshes.forEach((line, index) => {
      if (!line?.material) return;
      const damp = index === 0 ? 1 : 0.7;
      line.material.opacity = linePulse * damp;
    });

    applyOrbitControlsToCamera(workspaceScene.controls, workspaceScene.camera);
    const wobbleDamp = workspaceScene.controls?.isDragging ? 0.4 : 1;
    workspaceScene.scene.rotation.y = Math.sin(t * 0.07) * 0.06 * wobbleDamp;
    workspaceScene.scene.rotation.x = -0.04 + Math.cos(t * 0.05) * 0.015 * wobbleDamp;
    workspaceScene.renderer.render(workspaceScene.scene, workspaceScene.camera);
    workspaceSceneAnimationId = requestAnimationFrame(animateWorkspaceScene);
  };

  const stopWorkspaceVisualizer = () => {
    workspaceVisualizerLoading = false;
    disposeWorkspaceScene();
    setWorkspaceVisualizerMessage('');
    setWorkspaceVisualizerActive(false);
  };

  const startWorkspaceVisualizer = async () => {
    if (workspaceVisualizerLoading) return;
    workspaceVisualizerLoading = true;
    setWorkspaceVisualizerActive(true);
    setWorkspaceVisualizerMessage('workspaceを読み込み中…');
    ensureWorkspaceInteractionHandlers();
    try {
      const three = await loadThreeModule();
      if (!three) {
        setWorkspaceVisualizerMessage('three.jsを読み込めませんでした。依存関係を再インストールしてください');
        setTimeout(() => stopWorkspaceVisualizer(), 1400);
        return;
      }
      const graph = await loadWorkspaceGraph();
      if (!isWorkspaceVisualizerActive) {
        return;
      }
      if (!graph?.nodes?.length) {
        setWorkspaceVisualizerMessage('表示できるファイルが見つかりません');
        return;
      }
      const sceneReady = createWorkspaceScene(graph);
      if (!sceneReady) {
        const message = typeof THREE === 'undefined'
          ? 'three.jsを読み込めませんでした。依存関係を再インストールしてください'
          : 'three.jsを初期化できませんでした';
        console.error('Failed to create workspace visualizer scene', { hasThree: typeof THREE !== 'undefined' });
        setWorkspaceVisualizerMessage(message);
        setTimeout(() => stopWorkspaceVisualizer(), 1400);
        return;
      }
      setWorkspaceVisualizerMessage('');
      resizeWorkspaceScene();
      workspaceSceneAnimationId = requestAnimationFrame(animateWorkspaceScene);
    } catch (error) {
      console.error('Failed to start workspace visualizer', error);
      setWorkspaceVisualizerMessage('背景生成に失敗しました');
      setTimeout(() => stopWorkspaceVisualizer(), 1600);
    } finally {
      workspaceVisualizerLoading = false;
    }
  };

  const toggleWorkspaceVisualizer = () => {
    if (isWorkspaceVisualizerActive) {
      stopWorkspaceVisualizer();
      return;
    }
    if (workspaceVisualizerLoading) {
      return;
    }
    void startWorkspaceVisualizer();
  };

  const resetWorkspaceGraphCache = () => {
    workspaceGraphCache = null;
  };

  const isActive = () => isWorkspaceVisualizerActive;

  return {
    start: startWorkspaceVisualizer,
    stop: stopWorkspaceVisualizer,
    toggle: toggleWorkspaceVisualizer,
    resize: resizeWorkspaceScene,
    resetGraphCache: resetWorkspaceGraphCache,
    setActiveState: setWorkspaceVisualizerActive,
    isActive,
  };
};
