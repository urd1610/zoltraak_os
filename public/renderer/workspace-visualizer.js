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
  ctx.font = `700 ${fontSize}px 'Space Grotesk', 'Inter', sans-serif`;
  const padding = 80;
  const measured = Math.max(240, Math.ceil(ctx.measureText(text).width + padding));
  const width = Math.min(1024, measured);
  const height = 160;
  canvas.width = width;
  canvas.height = height;
  ctx.font = `700 ${fontSize}px 'Space Grotesk', 'Inter', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(8, 13, 22, 0.82)';
  ctx.fillRect(0, height / 2 - fontSize, width, fontSize * 1.9);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillText(text, width / 2, height / 2 + 6);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    opacity: 0.9,
  });
  const sprite = new THREE.Sprite(material);
  const spriteScale = 6 * scale;
  sprite.scale.set((width / height) * spriteScale, spriteScale, 1);
  sprite.userData.dispose = () => texture.dispose();
  return sprite;
};

const computeWorkspaceLayout = (graph) => {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const total = nodes.length || 1;
  const baseRadius = Math.max(18, total * 0.35);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const positions = new Map();
  nodes.forEach((node, index) => {
    const theta = index * golden;
    const layer = Math.max(1, (node?.depth ?? 1));
    const radial = baseRadius * (0.7 + layer * 0.15);
    const y = ((index / total) - 0.5) * baseRadius * 0.35;
    positions.set(node.id, {
      x: Math.cos(theta) * radial + (Math.random() - 0.5) * 2,
      y: y + (Math.random() - 0.5) * 1.4,
      z: Math.sin(theta) * radial + (Math.random() - 0.5) * 2,
    });
  });
  return { positions, radius: baseRadius };
};

export const createWorkspaceVisualizer = (workspaceVisualizer) => {
  let isWorkspaceVisualizerActive = false;
  let workspaceVisualizerLoading = false;
  let workspaceVisualizerStatusEl = null;
  let workspaceGraphCache = null;
  let workspaceScene = null;
  let workspaceSceneAnimationId = null;

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

  const setWorkspaceVisualizerActive = (active) => {
    isWorkspaceVisualizerActive = Boolean(active);
    if (!workspaceVisualizer) return;
    workspaceVisualizer.classList.toggle('is-active', isWorkspaceVisualizerActive);
    workspaceVisualizer.setAttribute('aria-hidden', isWorkspaceVisualizerActive ? 'false' : 'true');
  };

  const disposeWorkspaceScene = () => {
    if (workspaceSceneAnimationId) {
      cancelAnimationFrame(workspaceSceneAnimationId);
      workspaceSceneAnimationId = null;
    }
    if (!workspaceScene) return;
    const { renderer, groups, lines, scatter } = workspaceScene;
    groups?.nodes?.children?.forEach((child) => {
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    });
    groups?.labels?.children?.forEach((child) => {
      child.material?.map?.dispose?.();
      child.material?.dispose?.();
    });
    if (lines) {
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
    renderer.domElement.classList.add('workspace-visualizer-canvas');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, rect.width / rect.height, 0.1, 2000);
    const layout = computeWorkspaceLayout(graph);

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    const keyLight = new THREE.PointLight(0x6ee7ff, 1.2, layout.radius * 6);
    keyLight.position.set(layout.radius * 0.5, layout.radius * 0.8, layout.radius * 1.2);
    const rimLight = new THREE.PointLight(0xa78bfa, 0.9, layout.radius * 5);
    rimLight.position.set(-layout.radius * 0.7, layout.radius * 0.4, -layout.radius);
    scene.add(ambient, keyLight, rimLight);

    const groups = { nodes: new THREE.Group(), labels: new THREE.Group() };
    const nodeMeta = [];

    (graph.nodes ?? []).forEach((node) => {
      const pos = layout.positions.get(node.id);
      if (!pos) return;
      const colorHex = getWorkspaceNodeColor(node);
      const color = new THREE.Color(colorHex);
      const radius = Math.max(0.4, 1.05 - (node.depth ?? 0) * 0.08);
      const geometry = new THREE.SphereGeometry(radius, 20, 20);
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.55,
        roughness: 0.25,
        metalness: 0.3,
        transparent: true,
        opacity: node.depth === 0 ? 1 : 0.9,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(pos.x, pos.y, pos.z);
      groups.nodes.add(mesh);

      const label = buildWorkspaceLabelSprite(node.name, colorHex, node.depth === 0 ? 1.25 : 1);
      if (label) {
        label.position.set(pos.x, pos.y + radius * 3.2, pos.z);
        groups.labels.add(label);
      }

      nodeMeta.push({
        mesh,
        label,
        basePosition: pos,
        wobbleSpeed: 0.35 + Math.random() * 0.35 + (node.depth ?? 0) * 0.05,
        wobbleAmp: 0.25 + Math.random() * 0.65,
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

    let lines = null;
    if (linePositions.length) {
      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x5ac8fa,
        transparent: true,
        opacity: 0.32,
        linewidth: 1,
      });
      lines = new THREE.LineSegments(lineGeometry, lineMaterial);
      scene.add(lines);
    }

    const scatterCount = Math.min(800, Math.max(220, (graph.nodes?.length ?? 20) * 6));
    const scatterPositions = new Float32Array(scatterCount * 3);
    for (let i = 0; i < scatterCount; i += 1) {
      scatterPositions[i * 3] = (Math.random() - 0.5) * layout.radius * 4;
      scatterPositions[i * 3 + 1] = (Math.random() - 0.5) * layout.radius * 3;
      scatterPositions[i * 3 + 2] = (Math.random() - 0.5) * layout.radius * 4;
    }
    const scatterGeometry = new THREE.BufferGeometry();
    scatterGeometry.setAttribute('position', new THREE.BufferAttribute(scatterPositions, 3));
    const scatterMaterial = new THREE.PointsMaterial({
      color: 0x99c3ff,
      size: 0.5,
      transparent: true,
      opacity: 0.32,
      sizeAttenuation: true,
      depthWrite: false,
    });
    const scatter = new THREE.Points(scatterGeometry, scatterMaterial);
    scene.add(scatter);

    camera.position.set(0, layout.radius * 0.35, layout.radius * 2.1);
    camera.lookAt(new THREE.Vector3(0, 0, 0));

    scene.add(groups.nodes);
    scene.add(groups.labels);

    workspaceVisualizer.append(renderer.domElement);

    workspaceScene = {
      renderer,
      scene,
      camera,
      groups,
      lines,
      scatter,
      nodeMeta,
      radius: layout.radius,
    };
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
    workspaceScene.nodeMeta.forEach((node) => {
      const { basePosition, wobbleAmp, wobbleSpeed, wobblePhase, mesh, label } = node;
      const bob = Math.sin(t * wobbleSpeed + wobblePhase) * wobbleAmp;
      const sway = Math.cos(t * (wobbleSpeed * 0.8) + wobblePhase) * wobbleAmp * 0.4;
      mesh.position.set(
        basePosition.x + sway * 0.4,
        basePosition.y + bob,
        basePosition.z + Math.sin(t * 0.35 + wobblePhase) * wobbleAmp * 0.35,
      );
      if (label) {
        const offsetY = (mesh.geometry?.parameters?.radius ?? 1) * 2.6;
        label.position.set(mesh.position.x, mesh.position.y + offsetY, mesh.position.z);
      }
    });

    if (workspaceScene.lines?.material) {
      workspaceScene.lines.material.opacity = 0.28 + Math.sin(t * 0.6) * 0.06;
    }

    workspaceScene.scene.rotation.y = Math.sin(t * 0.05) * 0.05;
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
    try {
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
