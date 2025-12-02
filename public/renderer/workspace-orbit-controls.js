export const createOrbitControlsState = (camera, focusPoint, layoutRadius) => {
  if (typeof THREE === 'undefined' || !camera || !focusPoint) return null;
  const offset = new THREE.Vector3().subVectors(camera.position, focusPoint);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  const target = spherical.clone();
  const scratch = new THREE.Vector3();
  const focusTarget = focusPoint.clone();
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
    focusTarget,
    focusLerp: 0.14,
    limits,
    lastPointer: { x: 0, y: 0 },
    isDragging: false,
    autoSpin: false,
    autoSpinSpeed: 0.0062,
    scratch,
  };
};

export const applyOrbitControlsToCamera = (controls, camera) => {
  if (!controls || !camera || typeof THREE === 'undefined') return;
  const {
    spherical,
    target,
    limits,
    scratch,
    focusPoint,
    focusTarget,
    autoSpin,
    autoSpinSpeed,
    focusLerp,
  } = controls;
  const easing = controls.isDragging ? 0.22 : 0.12;

  if (autoSpin && !controls.isDragging) {
    target.theta += autoSpinSpeed ?? 0.005;
  }

  if (focusPoint && focusTarget) {
    focusPoint.lerp(focusTarget, focusLerp ?? 0.12);
  }

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
