// Three.js preview of the enclosure. Units are millimetres.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ACCESSORIES, COLORS, LED_COLORS, faceSize, footprint } from '/shared/catalog.js';

const VISUAL_THICKNESS = 2;
const DOOR_OPEN_ANGLE = (105 * Math.PI) / 180;
const MAX_STRIP_LIGHTS = 6;

// Position/rotation of each face group. Local +z is the outward normal,
// local x/y map to the u/v coordinates used by the catalog.
function faceTransforms(W, H, D) {
  return {
    back: { pos: [0, 0, -D / 2], rot: [0, Math.PI, 0] },
    right: { pos: [W / 2, 0, 0], rot: [0, Math.PI / 2, 0] },
    left: { pos: [-W / 2, 0, 0], rot: [0, -Math.PI / 2, 0] },
    top: { pos: [0, H / 2, 0], rot: [-Math.PI / 2, 0, 0] },
    bottom: { pos: [0, -H / 2, 0], rot: [Math.PI / 2, 0, 0] },
  };
}

export function createScene(canvas, handlers) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.92;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 0.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.18 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  let model = null;
  let config = null;
  let selectedId = null;
  let placingType = null;
  let doorOpen = false;
  let doorAngle = 0;
  let hinge = null;
  let faceGroups = {};
  let panelMeshes = [];
  let accessoryRoots = [];
  let rotors = [];
  let drag = null;
  let down = null;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  // ---------- model construction ----------

  function disposeModel() {
    if (!model) return;
    model.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) [].concat(o.material).forEach((m) => m.dispose());
    });
    scene.remove(model);
  }

  function mesh(geometry, material, { shadow = true } = {}) {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  }

  function build() {
    disposeModel();
    const { width: W, height: H, depth: D } = config;
    const t = VISUAL_THICKNESS;
    const color = COLORS[config.color];
    const bare = config.color === 'bare';
    const body = new THREE.MeshStandardMaterial({
      color: color.hex,
      metalness: bare ? 0.85 : 0.15,
      roughness: bare ? 0.35 : config.color === 'black' ? 0.8 : 0.55,
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.4, roughness: 0.6 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd0d4da, metalness: 1, roughness: 0.25 });

    model = new THREE.Group();
    model.position.y = H / 2;
    faceGroups = {};
    panelMeshes = [];
    accessoryRoots = [];
    rotors = [];

    const addPanel = (group, face, w, h) => {
      const panel = mesh(new THREE.BoxGeometry(w, h, t), body);
      panel.position.z = -t / 2;
      panel.userData.face = face;
      group.add(panel);
      panelMeshes.push(panel);
      return panel;
    };

    for (const [face, tr] of Object.entries(faceTransforms(W, H, D))) {
      const g = new THREE.Group();
      g.position.set(...tr.pos);
      g.rotation.set(...tr.rot);
      const size = faceSize(config, face);
      g.userData = { face, ...size };
      addPanel(g, face, size.w, size.h);
      faceGroups[face] = g;
      model.add(g);
    }

    // Front: door / cover hangs off a hinge on the left edge.
    hinge = new THREE.Group();
    hinge.position.set(-W / 2, 0, D / 2);
    const front = new THREE.Group();
    front.position.x = W / 2;
    front.userData = { face: 'front', w: W, h: H };
    addPanel(front, 'front', W, H);
    faceGroups.front = front;
    hinge.add(front);
    model.add(hinge);
    hinge.rotation.y = -doorAngle;

    if (config.style === 'hinged') {
      const hingeCount = H > 500 ? 3 : 2;
      for (let i = 0; i < hingeCount; i++) {
        const k = mesh(new THREE.CylinderGeometry(4, 4, Math.min(40, H / 6), 16), chrome);
        k.position.set(-W / 2 - 1, (i / (hingeCount - 1) - 0.5) * (H - 80), 2);
        front.add(k);
      }
      if (config.options.lock) {
        const lock = mesh(new THREE.CylinderGeometry(10, 10, 6, 32), chrome);
        lock.rotation.x = Math.PI / 2;
        lock.position.set(W / 2 - 28, 0, 3);
        const slot = mesh(new THREE.BoxGeometry(2, 10, 1), dark, { shadow: false });
        slot.position.set(W / 2 - 28, 0, 6.2);
        front.add(lock, slot);
      } else {
        const latch = mesh(new THREE.BoxGeometry(8, Math.min(60, H / 5), 6), dark);
        latch.position.set(W / 2 - 20, 0, 3);
        front.add(latch);
      }
    } else {
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          const s = mesh(new THREE.CylinderGeometry(4, 4, 2, 20), chrome);
          s.rotation.x = Math.PI / 2;
          s.position.set(sx * (W / 2 - 14), sy * (H / 2 - 14), 1);
          front.add(s);
        }
      }
    }

    if (config.style === 'louvered') {
      const slotW = 50;
      const cols = Math.max(1, Math.min(4, Math.floor((W - 40) / (slotW + 16))));
      const rows = Math.max(1, Math.min(6, Math.floor((H * 0.3) / 14)));
      const louverGeo = new THREE.BoxGeometry(slotW, 7, 4);
      const band = (yStart) => {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const l = mesh(louverGeo, body);
            l.rotation.x = -0.6;
            l.position.set((c - (cols - 1) / 2) * (slotW + 16), yStart - r * 14, 2.5);
            const gap = mesh(new THREE.PlaneGeometry(slotW - 2, 4), dark, { shadow: false });
            gap.position.set(l.position.x, l.position.y - 2, 0.3);
            front.add(l, gap);
          }
        }
      };
      band(H / 2 - 40);
      if (H >= 250) band(-H / 2 + 40 + (rows - 1) * 14);
    }

    if (config.options.gasket) {
      const g = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
      const bars = [
        [W - 8, 5, 0, H / 2 - 6],
        [W - 8, 5, 0, -H / 2 + 6],
        [5, H - 8, W / 2 - 6, 0],
        [5, H - 8, -W / 2 + 6, 0],
      ];
      for (const [w, h, x, y] of bars) {
        const b = mesh(new THREE.BoxGeometry(w, h, 3), g, { shadow: false });
        b.position.set(x, y, -t - 1.5);
        front.add(b);
      }
    }

    if (config.options.mountingPlate) {
      const plateMat = new THREE.MeshStandardMaterial({ color: 0xc9a86a, metalness: 0.6, roughness: 0.45 });
      const plate = mesh(new THREE.BoxGeometry(Math.max(20, W - 50), Math.max(20, H - 50), 2.5), plateMat);
      plate.position.z = -t - 12;
      faceGroups.back.add(plate);
    }

    if (config.options.wallTabs) {
      for (const sy of [-1, 1]) {
        const tab = mesh(new THREE.BoxGeometry(50, 30, t), body);
        tab.position.set(0, sy * (H / 2 + 15), -t / 2);
        const hole = mesh(new THREE.CircleGeometry(5, 20), dark, { shadow: false });
        hole.position.set(0, sy * (H / 2 + 17), 0.1);
        faceGroups.back.add(tab, hole);
      }
    }

    // Knockouts: split between bottom and top, laid out in a row.
    const koGeo = new THREE.RingGeometry(9, 11, 28);
    const koFill = new THREE.CircleGeometry(9, 28);
    const bottomCount = Math.ceil(config.knockouts / 2);
    const placeKnockouts = (face, count) => {
      const g = faceGroups[face];
      for (let i = 0; i < count; i++) {
        const x = (i - (count - 1) / 2) * Math.min(40, (W - 40) / Math.max(1, count));
        const ring = mesh(koGeo, dark, { shadow: false });
        const fill = mesh(koFill, body, { shadow: false });
        ring.position.set(x, 0, 0.2);
        fill.position.set(x, 0, 0.15);
        g.add(ring, fill);
      }
    };
    placeKnockouts('bottom', bottomCount);
    placeKnockouts('top', config.knockouts - bottomCount);

    let stripLights = 0;
    for (const acc of config.accessories) {
      const root = buildAccessory(acc, { dark, chrome, stripLight: stripLights < MAX_STRIP_LIGHTS });
      if (ACCESSORIES[acc.type].kind === 'strip') stripLights++;
      const size = faceSize(config, acc.face);
      root.position.set(acc.u * size.w, acc.v * size.h, acc.side === 'inside' ? -t : 0);
      if (acc.side === 'inside') root.rotation.y = Math.PI;
      root.userData.accId = acc.id;
      faceGroups[acc.face].add(root);
      accessoryRoots.push(root);
    }

    scene.add(model);
    updateLighting();
  }

  function buildAccessory(acc, { dark, chrome, stripLight }) {
    const def = ACCESSORIES[acc.type];
    const root = new THREE.Group();
    const inner = new THREE.Group();
    root.add(inner);
    if (acc.rotation === 90) inner.rotation.z = Math.PI / 2;

    if (def.kind === 'fan') {
      const s = def.w;
      const depth = 25;
      const bar = s * 0.1;
      // Hollow square frame going through the panel.
      for (const [w, h, x, y] of [
        [s, bar, 0, (s - bar) / 2],
        [s, bar, 0, -(s - bar) / 2],
        [bar, s, (s - bar) / 2, 0],
        [bar, s, -(s - bar) / 2, 0],
      ]) {
        const b = mesh(new THREE.BoxGeometry(w, h, depth), dark);
        b.position.set(x, y, -VISUAL_THICKNESS / 2);
        inner.add(b);
      }
      const rotor = new THREE.Group();
      const hub = mesh(new THREE.CylinderGeometry(s * 0.17, s * 0.17, 12, 24), dark);
      hub.rotation.x = Math.PI / 2;
      rotor.add(hub);
      const bladeMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, side: THREE.DoubleSide });
      for (let i = 0; i < 7; i++) {
        const blade = mesh(new THREE.BoxGeometry(s * 0.3, s * 0.13, 1.5), bladeMat);
        const a = (i / 7) * Math.PI * 2;
        blade.position.set(Math.cos(a) * s * 0.26, Math.sin(a) * s * 0.26, 0);
        blade.rotation.set(0.5, 0, a);
        rotor.add(blade);
      }
      rotor.position.z = -VISUAL_THICKNESS / 2;
      rotors.push(rotor);
      inner.add(rotor);
      // Finger guard on the outside.
      for (const r of [0.2, 0.33, 0.45]) {
        const ring = mesh(new THREE.TorusGeometry(s * r, 1, 6, 40), chrome, { shadow: false });
        ring.position.z = depth / 2;
        inner.add(ring);
      }
      addHitBox(inner, s, s, depth, -VISUAL_THICKNESS / 2);
    } else if (def.kind === 'strip') {
      const glow = LED_COLORS[acc.color] || LED_COLORS.white;
      const base = mesh(new THREE.BoxGeometry(def.w, def.h, 5), chrome);
      base.position.z = 2.5;
      const diffuser = mesh(
        new THREE.BoxGeometry(def.w - 4, def.h - 4, 2),
        new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 2.2 }),
        { shadow: false },
      );
      diffuser.position.z = 6;
      inner.add(base, diffuser);
      if (stripLight) {
        const light = new THREE.PointLight(glow, 3, 450, 1);
        light.position.z = 30;
        inner.add(light);
      }
      addHitBox(inner, def.w, def.h, 10, 4);
    } else {
      const glow = LED_COLORS[acc.color] || LED_COLORS.white;
      const bezel = mesh(new THREE.CylinderGeometry(8, 8, 4, 28), chrome);
      bezel.rotation.x = Math.PI / 2;
      bezel.position.z = 2;
      const dome = mesh(
        new THREE.SphereGeometry(5.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 2.5 }),
        { shadow: false },
      );
      dome.rotation.x = Math.PI / 2;
      dome.position.z = 4;
      inner.add(bezel, dome);
      addHitBox(inner, def.w, def.h, 12, 5);
    }

    if (acc.id === selectedId) {
      const fp = footprint(acc);
      const pad = 6;
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(fp.w + pad, fp.h + pad, 2)),
        new THREE.LineBasicMaterial({ color: 0x2f7bff, depthTest: false }),
      );
      outline.renderOrder = 10;
      outline.position.z = 1;
      root.add(outline);
    }
    return root;
  }

  // Invisible box that makes small accessories easy to grab.
  function addHitBox(parent, w, h, d, z) {
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(w + 6, h + 6, d),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.z = z;
    hit.userData.hit = true;
    parent.add(hit);
  }

  function updateLighting() {
    const { width: W, height: H, depth: D } = config;
    const span = Math.max(W, H, D);
    sun.position.set(span * 1.2, span * 2, span * 1.6);
    sun.target.position.set(0, H / 2, 0);
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -span * 1.5;
    cam.right = cam.top = span * 1.5;
    cam.near = 1;
    cam.far = span * 6;
    cam.updateProjectionMatrix();
    ground.scale.set(span * 6, span * 6, 1);
  }

  function fit() {
    const { width: W, height: H, depth: D } = config;
    const radius = Math.sqrt(W * W + H * H + D * D) / 2;
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
    const dir = new THREE.Vector3(0.75, 0.45, 1).normalize();
    controls.target.set(0, H / 2, 0);
    camera.position.copy(dir.multiplyScalar(dist)).add(controls.target);
    controls.minDistance = radius * 0.6;
    controls.maxDistance = dist * 4;
    controls.update();
  }

  // ---------- picking & dragging ----------

  function setPointer(e) {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
  }

  function pickFace() {
    const hit = raycaster.intersectObjects(panelMeshes, false)[0];
    if (!hit) return null;
    const group = faceGroups[hit.object.userData.face];
    const local = group.worldToLocal(hit.point.clone());
    return {
      face: group.userData.face,
      u: local.x / group.userData.w,
      v: local.y / group.userData.h,
      side: local.z < -VISUAL_THICKNESS / 2 ? 'inside' : 'outside',
    };
  }

  function pickAccessory() {
    const hits = raycaster.intersectObjects(accessoryRoots, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.accId) o = o.parent;
      if (o) return o.userData.accId;
    }
    return null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !config) return;
    setPointer(e);
    down = { x: e.clientX, y: e.clientY };
    if (placingType) return;
    const id = pickAccessory();
    if (id) {
      // Grabbing an accessory: keep OrbitControls from starting a rotation.
      e.stopImmediatePropagation();
      drag = { id, pointerId: e.pointerId };
      controls.enabled = false;
      canvas.setPointerCapture(e.pointerId);
      handlers.onSelect(id);
    }
  }, { capture: true });

  canvas.addEventListener('pointermove', (e) => {
    if (!config) return;
    setPointer(e);
    if (drag) {
      const hit = pickFace();
      if (hit) handlers.onMove(drag.id, hit);
      return;
    }
    if (placingType) {
      canvas.style.cursor = pickFace() ? 'crosshair' : 'not-allowed';
    } else {
      canvas.style.cursor = pickAccessory() ? 'grab' : '';
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!config) return;
    const moved = down ? Math.hypot(e.clientX - down.x, e.clientY - down.y) : 0;
    down = null;
    if (drag) {
      canvas.releasePointerCapture(drag.pointerId);
      drag = null;
      controls.enabled = true;
      return;
    }
    if (moved > 5) return; // it was an orbit, not a click
    setPointer(e);
    if (placingType) {
      const hit = pickFace();
      if (hit) handlers.onPlace(placingType, hit);
      return;
    }
    if (!pickAccessory()) handlers.onSelect(null);
  });

  // ---------- render loop ----------

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    resize();
    const target = doorOpen && config && config.style === 'hinged' ? DOOR_OPEN_ANGLE : 0;
    if (hinge && Math.abs(doorAngle - target) > 1e-3) {
      doorAngle += (target - doorAngle) * Math.min(1, dt * 6);
      hinge.rotation.y = -doorAngle;
    }
    for (const r of rotors) r.rotation.z -= dt * 12;
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    update(nextConfig, nextSelected) {
      const first = !config;
      config = nextConfig;
      selectedId = nextSelected;
      build();
      if (first) fit();
    },
    fit,
    setPlacing(type) {
      placingType = type;
      canvas.style.cursor = type ? 'crosshair' : '';
    },
    setDoorOpen(open) {
      doorOpen = open;
    },
  };
}
