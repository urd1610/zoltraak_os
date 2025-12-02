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

export const computeWorkspaceLayout = (graph) => {
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
  const spacingScale = 1.32;
  const lateralScale = 1.14;

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
      const stepBase = 4.1 + depth * 0.6;
      const step = stepBase * spacingScale;
      const length = parentDistance + step * (child.type === 'directory' ? 1.22 : 1.05);
      const { u, v } = buildBranchBasis(dir);
      const spreadBase = Math.max(0.65, 0.9 + (children.length - 1) * 0.14);
      const spread = spreadBase * lateralScale;
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
        x: jitterFromHash(`${key}:jx`, (0.9 + depth * 0.08) * spacingScale * 0.85),
        y: jitterFromHash(`${key}:jy`, (0.7 + depth * 0.08) * spacingScale * 0.85),
        z: jitterFromHash(`${key}:jz`, (0.9 + depth * 0.08) * spacingScale * 0.85),
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
