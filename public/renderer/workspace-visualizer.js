import { computeWorkspaceLayout } from './workspace-layout.js';
import {
  buildNodeGlowSprite,
  buildWorkspaceLabelSprite,
  ensureWorkspaceLabelFontReady,
  getWorkspaceNodeColor,
  LABEL_TARGET_PIXEL_HEIGHT,
} from './workspace-visualizer-graphics.js';
import { applyOrbitControlsToCamera, createOrbitControlsState } from './workspace-orbit-controls.js';

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



export const createWorkspaceVisualizer = (workspaceVisualizer) => {
  let isWorkspaceVisualizerActive = false;
  let workspaceVisualizerLoading = false;
  let workspaceVisualizerStatusEl = null;
  let workspaceContextMenuEl = null;
  let workspaceContextMenuMeta = null;
  let workspaceGraphCache = null;
  let workspaceScene = null;
  let workspaceSceneAnimationId = null;
  let hasWorkspaceInteractionHandlers = false;
  let pendingWorkspaceGraphRefresh = false;
  let unsubscribeWorkspaceGraphUpdates = null;
  const pointerState = {
    isDown: false,
    start: { x: 0, y: 0 },
    moved: false,
  };
  const CLICK_MOVE_THRESHOLD = 6;

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

  const flashWorkspaceVisualizerMessage = (message, durationMs = 2000) => {
    const text = message ?? '';
    if (!text) {
      setWorkspaceVisualizerMessage('');
      return;
    }
    setWorkspaceVisualizerMessage(text);
    if (durationMs > 0) {
      setTimeout(() => {
        if (workspaceVisualizerStatusEl?.textContent === text) {
          setWorkspaceVisualizerMessage('');
        }
      }, durationMs);
    }
  };

  const hideWorkspaceContextMenu = () => {
    if (workspaceContextMenuEl) {
      workspaceContextMenuEl.classList.remove('is-visible');
      workspaceContextMenuEl.style.left = '-9999px';
      workspaceContextMenuEl.style.top = '-9999px';
      workspaceContextMenuEl.style.visibility = 'hidden';
    }
    workspaceContextMenuMeta = null;
  };

  const ensureWorkspaceContextMenu = () => {
    if (workspaceContextMenuEl) return workspaceContextMenuEl;
    const menu = document.createElement('div');
    menu.className = 'workspace-context-menu';
    const title = document.createElement('div');
    title.className = 'workspace-context-menu__title';
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'workspace-context-menu__item';
    openButton.textContent = '開く';
    openButton.addEventListener('click', () => {
      if (workspaceContextMenuMeta) {
        void openWorkspaceNode(workspaceContextMenuMeta);
      }
      hideWorkspaceContextMenu();
    });
    const openDirectoryButton = document.createElement('button');
    openDirectoryButton.type = 'button';
    openDirectoryButton.className = 'workspace-context-menu__item';
    openDirectoryButton.dataset.role = 'workspace-open-directory';
    openDirectoryButton.textContent = 'ディレクトリを開く';
    openDirectoryButton.addEventListener('click', () => {
      if (workspaceContextMenuMeta) {
        void openWorkspaceNodeDirectory(workspaceContextMenuMeta);
      }
      hideWorkspaceContextMenu();
    });
    menu.append(title, openButton, openDirectoryButton);
    document.body.append(menu);
    workspaceContextMenuEl = menu;
    return menu;
  };

  const positionWorkspaceContextMenu = (menu, x, y) => {
    if (!menu) return;
    menu.style.visibility = 'hidden';
    menu.classList.add('is-visible');
    const rect = menu.getBoundingClientRect();
    const margin = 8;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const nextX = Math.min(Math.max(x, margin), Math.max(margin, viewportWidth - rect.width - margin));
    const nextY = Math.min(Math.max(y, margin), Math.max(margin, viewportHeight - rect.height - margin));
    menu.style.left = `${nextX}px`;
    menu.style.top = `${nextY}px`;
    menu.style.visibility = 'visible';
  };

  const showWorkspaceContextMenu = (meta, event) => {
    if (!meta) return;
    const menu = ensureWorkspaceContextMenu();
    workspaceContextMenuMeta = meta;
    setWorkspaceFocusedMeta(meta);
    const title = menu.querySelector('.workspace-context-menu__title');
    if (title) {
      const label = meta?.data?.name || meta?.data?.id || 'node';
      const typeLabel = meta?.data?.type === 'directory' ? 'ディレクトリ' : 'ファイル';
      title.textContent = `${label} を開く (${typeLabel})`;
    }
    const openDirectoryButton = menu.querySelector('[data-role="workspace-open-directory"]');
    if (openDirectoryButton) {
      const isFile = meta?.data?.type === 'file';
      openDirectoryButton.hidden = !isFile;
      openDirectoryButton.disabled = !isFile;
    }
    const { clientX, clientY } = event ?? { clientX: 0, clientY: 0 };
    positionWorkspaceContextMenu(menu, clientX, clientY);
  };

  const openWorkspaceNode = async (meta) => {
    if (!meta?.data?.id) return;
    if (!window.desktopBridge?.openWorkspaceEntry) {
      flashWorkspaceVisualizerMessage('パスを開けませんでした');
      return;
    }
    try {
      await window.desktopBridge.openWorkspaceEntry(meta.data.id);
    } catch (error) {
      console.error('Failed to open workspace entry', error);
      flashWorkspaceVisualizerMessage('ノードを開けませんでした');
    }
  };

  const openWorkspaceNodeDirectory = async (meta) => {
    if (!meta?.data?.id) return;
    if (!window.desktopBridge?.openWorkspaceEntryDirectory) {
      flashWorkspaceVisualizerMessage('ディレクトリを開けませんでした');
      return;
    }
    try {
      await window.desktopBridge.openWorkspaceEntryDirectory(meta.data.id);
    } catch (error) {
      console.error('Failed to open workspace entry directory', error);
      flashWorkspaceVisualizerMessage('ディレクトリを開けませんでした');
    }
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
    hideWorkspaceContextMenu();
    if (event.button !== undefined && event.button !== 0) return;
    const controls = getOrbitControls();
    if (!controls || typeof THREE === 'undefined') return;
    pointerState.isDown = true;
    pointerState.moved = false;
    pointerState.start = { x: event.clientX, y: event.clientY };
    controls.isDragging = true;
    controls.lastPointer = { x: event.clientX, y: event.clientY };
    workspaceVisualizer?.classList?.add?.('is-dragging');
    event.preventDefault();
  };

  const handleWorkspacePointerMove = (event) => {
    const controls = getOrbitControls();
    if (!isWorkspaceVisualizerActive || !controls?.isDragging || typeof THREE === 'undefined') return;
    const start = pointerState.start ?? { x: event.clientX, y: event.clientY };
    const totalDelta = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (totalDelta > CLICK_MOVE_THRESHOLD) {
      pointerState.moved = true;
    }
    const dx = event.clientX - (controls.lastPointer?.x ?? 0);
    const dy = event.clientY - (controls.lastPointer?.y ?? 0);
    controls.lastPointer = { x: event.clientX, y: event.clientY };
    const rotateSpeed = 0.0062;
    const tiltSpeed = 0.0044;
    controls.target.theta -= dx * rotateSpeed;
    controls.target.phi = THREE.MathUtils.clamp(
      controls.target.phi - dy * tiltSpeed,
      controls.limits.minPhi,
      controls.limits.maxPhi,
    );
    event.preventDefault();
  };

  const pickWorkspaceNodeMeta = (event) => {
    if (!workspaceScene || !workspaceVisualizer || typeof THREE === 'undefined') return null;
    const rect = workspaceVisualizer.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      return null;
    }
    if (!workspaceScene.raycaster) {
      workspaceScene.raycaster = new THREE.Raycaster();
    }
    if (!workspaceScene.pointerNdc) {
      workspaceScene.pointerNdc = new THREE.Vector2();
    }
    const pointerNdc = workspaceScene.pointerNdc;
    pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    workspaceScene.raycaster.setFromCamera(pointerNdc, workspaceScene.camera);
    const targets = workspaceScene.interactiveNodes ?? [];
    const intersections = workspaceScene.raycaster.intersectObjects(targets, true);
    if (!intersections?.length) return null;
    const hit = intersections.find((item) => {
      const obj = item?.object;
      if (!obj) return false;
      if (obj.userData?.ignoreHit || obj.parent?.userData?.ignoreHit) {
        return false;
      }
      return obj.userData?.nodeMeta || obj.parent?.userData?.nodeMeta;
    });
    if (!hit?.object) return null;
    return hit.object.userData?.nodeMeta
      ?? hit.object.parent?.userData?.nodeMeta
      ?? null;
  };

  const setWorkspaceFocusedMeta = (meta) => {
    if (!workspaceScene) return;
    workspaceScene.focusedMeta = meta ?? null;
  };

  const focusOrbitOnNode = (meta) => {
    if (!meta || !workspaceScene?.controls || typeof THREE === 'undefined') return;
    setWorkspaceFocusedMeta(meta);
    workspaceScene.orbitAnchor = meta;
    const controls = workspaceScene.controls;
    const focus = meta.mesh?.position
      ? meta.mesh.position.clone()
      : new THREE.Vector3(
        meta.basePosition?.x ?? 0,
        meta.basePosition?.y ?? 0,
        meta.basePosition?.z ?? 0,
      );
    if (meta.labelOffset) {
      focus.y += meta.labelOffset * 0.08;
    }
    if (controls.focusTarget) {
      controls.focusTarget.copy(focus);
    }
    if (controls.focusPoint) {
      controls.focusPoint.copy(focus);
    }
    const preferredRadius = THREE.MathUtils.clamp(
      workspaceScene.radius * 0.9,
      controls.limits.minRadius,
      controls.limits.maxRadius * 0.82,
    );
    controls.target.radius = THREE.MathUtils.lerp(
      controls.target.radius ?? preferredRadius,
      preferredRadius,
      0.7,
    );
    controls.autoSpin = false;
  };

  const handleWorkspaceDoubleClick = (event) => {
    if (!isWorkspaceVisualizerActive || workspaceVisualizerLoading) return;
    if (workspaceScene?.controls?.isDragging) return;
    const hitMeta = pickWorkspaceNodeMeta(event);
    if (!hitMeta) return;
    event.preventDefault();
    hideWorkspaceContextMenu();
    void openWorkspaceNode(hitMeta);
  };

  const handleWorkspaceContextMenu = (event) => {
    if (!isWorkspaceVisualizerActive || workspaceVisualizerLoading) return;
    const hitMeta = pickWorkspaceNodeMeta(event);
    if (!hitMeta) {
      hideWorkspaceContextMenu();
      return;
    }
    event.preventDefault();
    showWorkspaceContextMenu(hitMeta, event);
  };

  const handleWorkspaceContextDismiss = (event) => {
    if (!workspaceContextMenuEl?.classList?.contains?.('is-visible')) return;
    if (workspaceContextMenuEl.contains(event.target)) return;
    hideWorkspaceContextMenu();
  };

  const handleWorkspaceKeyDown = (event) => {
    if (event.key === 'Escape') {
      hideWorkspaceContextMenu();
    }
  };

  const handleWorkspaceTap = (event) => {
    const hitMeta = pickWorkspaceNodeMeta(event);
    if (hitMeta) {
      focusOrbitOnNode(hitMeta);
    }
  };

  const handleWorkspacePointerUp = (event) => {
    if (pointerState.isDown && !pointerState.moved && event) {
      handleWorkspaceTap(event);
    }
    pointerState.isDown = false;
    stopOrbitDrag();
  };

  const handleWorkspaceWheel = (event) => {
    if (!isWorkspaceVisualizerActive || typeof THREE === 'undefined') return;
    hideWorkspaceContextMenu();
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
    workspaceVisualizer.addEventListener('dblclick', handleWorkspaceDoubleClick);
    workspaceVisualizer.addEventListener('contextmenu', handleWorkspaceContextMenu);
    window.addEventListener('pointermove', handleWorkspacePointerMove);
    window.addEventListener('pointerup', handleWorkspacePointerUp);
    window.addEventListener('pointerdown', handleWorkspaceContextDismiss);
    window.addEventListener('keydown', handleWorkspaceKeyDown);
    workspaceVisualizer.addEventListener('wheel', handleWorkspaceWheel, { passive: false });
    hasWorkspaceInteractionHandlers = true;
  };

  const disposeWorkspaceScene = () => {
    if (workspaceSceneAnimationId) {
      cancelAnimationFrame(workspaceSceneAnimationId);
      workspaceSceneAnimationId = null;
    }
    hideWorkspaceContextMenu();
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
    pointerState.isDown = false;
    pointerState.moved = false;
    pointerState.start = { x: 0, y: 0 };
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
    const interactiveNodes = [];

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
        glow.userData.ignoreHit = true;
        nodeGroup.add(glow);
      }

      nodeGroup.add(core);
      groups.nodes.add(nodeGroup);
      nodeGroup.userData.nodeMeta = null;
      core.userData.nodeMeta = null;

      const label = buildWorkspaceLabelSprite(node.name, colorHex, isDirectory ? 1.06 : 0.98);
      const labelOffset = radius * 2.9;
      if (label) {
        label.position.set(pos.x, pos.y + labelOffset, pos.z);
        label.userData.offsetY = labelOffset;
        label.userData.baseOpacity = label.userData.baseOpacity ?? label.material?.opacity ?? 0.82;
        groups.labels.add(label);
      }

      const meta = {
        mesh: nodeGroup,
        label,
        labelOffset,
        basePosition: pos,
        wobbleSpeed: 0.32 + Math.random() * 0.18,
        wobbleAmp: 0.12 + Math.random() * 0.14,
        wobblePhase: Math.random() * Math.PI * 2,
        core,
        glow,
        data: node,
        baseScale: nodeGroup.scale.x,
        baseEmissive: material.emissiveIntensity,
        baseOpacity: material.opacity,
      };
      nodeGroup.userData.nodeMeta = meta;
      core.userData.nodeMeta = meta;
      interactiveNodes.push(core);
      nodeMeta.push(meta);
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
      interactiveNodes,
      raycaster: new THREE.Raycaster(),
      pointerNdc: new THREE.Vector2(),
      orbitAnchor: null,
      focusedMeta: null,
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
        const distanceToLabel = workspaceScene.camera.position.distanceTo(meta.label.position);
        if (labelScratch?.cameraDir && labelScratch?.toLabel && meta.label.material) {
          labelScratch.toLabel
            .subVectors(meta.label.position, workspaceScene.camera.position)
            .normalize();
          const facing = Math.max(0, labelScratch.cameraDir.dot(labelScratch.toLabel));
          const facingFade = 0.35 + facing * 0.65;
          const distanceFade = 1 - THREE.MathUtils.smoothstep(distanceToLabel, fadeNear, fadeFar);
          const baseOpacity = meta.label.userData?.baseOpacity ?? meta.label.material.opacity ?? 0.8;
          meta.label.material.opacity = baseOpacity
            * THREE.MathUtils.clamp(distanceFade * facingFade, 0.18, 1);
        }
        const viewportHeight = workspaceScene.renderer?.domElement?.height ?? 0;
        if (viewportHeight && Number.isFinite(distanceToLabel)) {
          const aspect = meta.label.userData?.aspect
            ?? (meta.label.scale.y !== 0 ? meta.label.scale.x / meta.label.scale.y : 1);
          const baseScaleY = meta.label.userData?.baseScaleY ?? meta.label.scale.y;
          const worldHeight = 2 * Math.tan(THREE.MathUtils.degToRad(workspaceScene.camera.fov) * 0.5)
            * distanceToLabel;
          const worldPerPixel = worldHeight / viewportHeight;
          const desiredHeight = worldPerPixel * LABEL_TARGET_PIXEL_HEIGHT;
          const scaleY = THREE.MathUtils.clamp(desiredHeight, baseScaleY * 0.9, baseScaleY * 2.4);
          meta.label.scale.set(scaleY * aspect, scaleY, 1);
        }
      }

      const isAnchor = workspaceScene.orbitAnchor === meta;
      if (isAnchor && workspaceScene.controls?.focusTarget && meta.mesh?.position) {
        workspaceScene.controls.focusTarget.lerp(meta.mesh.position, 0.2);
      }
      const baseScale = meta.baseScale ?? 1;
      const targetScale = isAnchor ? baseScale * 1.16 : baseScale;
      const nextScale = THREE.MathUtils.lerp(meta.mesh.scale.x, targetScale, 0.14);
      meta.mesh.scale.setScalar(nextScale);

      if (meta.core?.material) {
        const baseEmissive = meta.baseEmissive ?? meta.core.material.emissiveIntensity ?? 1;
        const targetEmissive = isAnchor ? baseEmissive * 1.35 : baseEmissive;
        meta.core.material.emissiveIntensity = THREE.MathUtils.lerp(
          meta.core.material.emissiveIntensity,
          targetEmissive,
          0.16,
        );
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

  const startWorkspaceVisualizer = async (message = 'workspaceを読み込み中…') => {
    if (workspaceVisualizerLoading) return;
    workspaceVisualizerLoading = true;
    setWorkspaceVisualizerActive(true);
    setWorkspaceVisualizerMessage(message);
    ensureWorkspaceInteractionHandlers();
    try {
      await ensureWorkspaceLabelFontReady();
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
      if (pendingWorkspaceGraphRefresh && isWorkspaceVisualizerActive) {
        pendingWorkspaceGraphRefresh = false;
        resetWorkspaceGraphCache();
        setTimeout(() => { void startWorkspaceVisualizer('workspaceを更新中…'); }, 0);
      } else {
        pendingWorkspaceGraphRefresh = false;
      }
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

  const handleWorkspaceGraphUpdated = (payload) => {
    resetWorkspaceGraphCache();
    if (workspaceVisualizerLoading) {
      pendingWorkspaceGraphRefresh = true;
      return;
    }
    if (!isWorkspaceVisualizerActive) {
      return;
    }
    const reason = payload?.reason ?? 'fs-change';
    const message = reason === 'workspace-changed'
      ? 'workspaceを更新中…'
      : 'workspaceを更新中…';
    void startWorkspaceVisualizer(message);
  };

  const subscribeWorkspaceGraphUpdates = () => {
    if (unsubscribeWorkspaceGraphUpdates || !window.desktopBridge?.onWorkspaceGraphUpdated) {
      return;
    }
    unsubscribeWorkspaceGraphUpdates = window.desktopBridge.onWorkspaceGraphUpdated((payload) => {
      handleWorkspaceGraphUpdated(payload);
    });
  };

  const resetWorkspaceGraphCache = () => {
    workspaceGraphCache = null;
  };

  const isActive = () => isWorkspaceVisualizerActive;

  subscribeWorkspaceGraphUpdates();

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
