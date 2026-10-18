// Realistic 3D renderer (Three.js). Same interface as render.js: init, load, play, cancel, draw.
// Loaded as an ES module. If it cannot load (offline, old browser) the game keeps using the 2D renderer.
//
// Picture: every level is a small island in an ocean, under a physically-based sky. The sun casts real
// shadows, the water is a wave shader, each zone has its own weather (fog, sun height, colour), the
// robot "Bolt" has a headlight, and glowing things (gems, crystals, teleporters) bloom.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/+esm";
import { EffectComposer } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js/+esm";
import { RenderPass } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPass.js/+esm";
import { UnrealBloomPass } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js/+esm";
import { OutputPass } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/OutputPass.js/+esm";
import { Sky } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/objects/Sky.js/+esm";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm";

const Render3D = (() => {
  const phone = document.documentElement.dataset.device === "phone";
  const W = phone ? 640 : 800, H = phone ? 640 : 500; // a square frame on phones: more board, less sky
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  let fx, fctx, canvas2d, canvas, renderer, scene, camera, composer, bloom, sky, sun, hemi, pmrem, world, ocean;
  let state, theme = "sand", th, ok = false, active = false, quality = "realistic", cancelFlag = false, bubble = null;
  let clock = 0, lastNow = 0, loopStarted = false;
  let robot, headlight, crabs = {}, items = {}, switches = {}, doors = {}, gates = {}, pads = [], trail, moveN = 0, propsList = [], paint = new THREE.Color(0x3b55c8);
  function setPaint(c) { paint = new THREE.Color(c); }
  let look = { hat: "none", eyes: "#5de0ff", trail: null };
  function setLook(l) { if (l.paint) setPaint(l.paint); look = Object.assign(look, l); }
  const cam = { center: new THREE.Vector3(), dist: 10, el: 0.82, az: 0.35, azV: 0, introK: 0, look: new THREE.Vector3(), follow: new THREE.Vector3() };
  let particles;
  const texCache = {};

  // ---------- generated glTF models (optional) ----------
  // Real models made from concept art (FLUX) and image-to-3D (Hunyuan3D) on the family's DGX Spark: see tools/assets3d/.
  // Each entry says which file in assets/models/ to use, how big it should be in tiles (fit "h" = height, "w" = footprint),
  // how far to lift it off the ground, which way its front faces, and whether Bolt's paint colour tints it.
  // If a file is missing or still loading, the built-in shape below is drawn instead, so the game never waits on a download.
  const ASSETS = {
    bolt:     { fit: "h", size: 0.95, rotY: Math.PI / 2, tint: true },
    house:    { fit: "w", size: 0.92, rotY: Math.PI },
    tree:     { fit: "h", size: 1.35 }, rock: { fit: "w", size: 0.9 }, crate: { fit: "w", size: 0.84 }, pillar: { fit: "h", size: 0.95 }, crystal: { fit: "h", size: 1.15 }, ice: { fit: "w", size: 0.86 },
    crab:     { fit: "w", size: 0.62, rotY: Math.PI },
    apple:    { fit: "h", size: 0.34, lift: 0.08 }, gem: { fit: "h", size: 0.42, lift: 0.15 }, key: { fit: "w", size: 0.4, lift: 0.18 }, lens: { fit: "h", size: 0.4, lift: 0.12 },
    villager: { fit: "h", size: 1.1 }, villager2: { fit: "h", size: 1.1 }, stall: { fit: "w", size: 1.05 },
  };
  const MODEL_BASE = "assets/models/", assetTpl = {}, assetWaiters = {}, gltfLoader = new GLTFLoader();
  function loadAsset(name) {
    if (assetTpl[name] !== undefined || !ASSETS[name]) return;
    assetTpl[name] = null; const a = ASSETS[name];
    gltfLoader.load(MODEL_BASE + name + ".glb", gltf => {
      const root = gltf.scene; root.rotation.y = a.rotY || 0; root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root), sz = new THREE.Vector3(), c = new THREE.Vector3(); box.getSize(sz); box.getCenter(c);
      const s = (a.size / (a.fit === "h" ? sz.y : Math.max(sz.x, sz.z))) || 1;
      const g = new THREE.Group(); g.add(root); root.scale.setScalar(s); root.position.set(-c.x * s, -box.min.y * s + (a.lift || 0), -c.z * s);
      root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.shared = true; const m = o.material; if (m) { m.envMapIntensity = 0.35; if (m.map) m.map.anisotropy = 4; } } });
      g.userData.top = sz.y * s + (a.lift || 0);
      assetTpl[name] = g; (assetWaiters[name] || []).forEach(fn => fn()); delete assetWaiters[name];
    }, undefined, () => console.info("no model file for " + name + ", drawing the built-in shape"));
  }
  // fill group g with the model (now, or as soon as it arrives); until then, or if there is no file, draw the built-in shape
  function useAsset(g, name, fallback) {
    loadAsset(name);
    const place = () => {
      const t = assetTpl[name]; if (!t) return false;
      g.clear(); const inst = t.clone(true); if (ASSETS[name].tint) tintModel(inst, paint); g.add(inst);
      g.userData.model = inst; g.userData.top = t.userData.top; if (g.userData.onModel) g.userData.onModel(inst); return true;
    };
    if (!place()) { fallback(); if (assetTpl[name] === null) (assetWaiters[name] = assetWaiters[name] || []).push(() => { if (g.parent) place(); }); }
    return g;
  }
  function tintModel(inst, color) { inst.traverse(o => { if (o.isMesh && o.material) { o.material = o.material.clone(); o.material.color.copy(color); o.userData.shared = false; } }); }
  function preloadAssets() { for (const n in ASSETS) loadAsset(n); }

  // ---------- zone weather ----------
  const THEMES = {
    sand:    { floor: 0xe8d7a9, floor2: 0xdcc893, cliff: 0x9c8257, wall: "rock",    wallColor: 0x8f7a5e, sun: { el: 48, az: 150 }, turb: 3,  ray: 1.5, fog: [0xd9e6f2, 0.008], hemi: [0xbfe0ff, 0xcbb07a, 0.6], water: [0x1b5f9e, 0x62c3e8], tex: "grain",  exposure: 0.62, sunColor: 0xfff4de },
    grass:   { floor: 0x9fcf7f, floor2: 0x90c270, cliff: 0x7a6a45, wall: "tree",    wallColor: 0x3f8a3a, sun: { el: 40, az: 200 }, turb: 4,  ray: 2,   fog: [0xd4e5cf, 0.007], hemi: [0xbfe0ff, 0x6a8c55, 0.55], water: [0x1e6a92, 0x63bfd6], tex: "grain",  exposure: 0.55, sunColor: 0xfff1d0 },
    stone:   { floor: 0xa9b7c3, floor2: 0x9cabb8, cliff: 0x5b6672, wall: "pillar",  wallColor: 0x5f6d7c, sun: { el: 9,  az: 210 }, turb: 12, ray: 0.6, fog: [0xb4c0cc, 0.030], hemi: [0xb9c4cf, 0x5a6570, 0.5], water: [0x274e6b, 0x6f98b5], tex: "cobble", exposure: 0.55,  sunColor: 0xffd6b0 },
    wood:    { floor: 0xc99f6b, floor2: 0xbd9260, cliff: 0x6e4e34, wall: "crate",   wallColor: 0xa8784f, sun: { el: 22, az: 250 }, turb: 6,  ray: 3,   fog: [0xe9cfae, 0.008], hemi: [0xffd9b0, 0x8a6a4a, 0.8], water: [0x2a5f7a, 0x7fb8c9], tex: "planks", exposure: 0.72,  sunColor: 0xffc48a },
    crystal: { floor: 0x89c6c0, floor2: 0x7bb9b3, cliff: 0x3b5a66, wall: "crystal", wallColor: 0x8ff0f4, sun: { el: 4,  az: 300 }, turb: 8,  ray: 4,   fog: [0x6d82b5, 0.014], hemi: [0x8ea8ff, 0x2b4a55, 0.4], water: [0x16325e, 0x4f8ad0], tex: "grain",  exposure: 0.55, sunColor: 0xffb0a0 },
    ice:     { floor: 0xd6e7f2, floor2: 0xc8dcea, cliff: 0x7f9bb0, wall: "ice",     wallColor: 0xa8d5f0, sun: { el: 24, az: 120 }, turb: 2,  ray: 1,   fog: [0xe4eff8, 0.007], hemi: [0xdfefff, 0x9fbdd0, 0.6], water: [0x1f5a8a, 0x7fc7ea], tex: "grain",  exposure: 0.65,  sunColor: 0xfff8ee },
  };

  // ---------- procedural textures (no asset files; a kid can read how they are made) ----------
  function texture(kind, hex) {
    const key = kind + hex; if (texCache[key]) return texCache[key];
    const size = 128, c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d");
    g.fillStyle = "#" + hex.toString(16).padStart(6, "0"); g.fillRect(0, 0, size, size);
    const img = g.getImageData(0, 0, size, size), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * (kind === "cobble" ? 26 : 16); d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(img, 0, 0);
    if (kind === "planks") { g.fillStyle = "rgba(60,30,10,0.35)"; for (let i = 0; i < 4; i++) g.fillRect(0, i * 32, size, 2); g.fillStyle = "rgba(255,230,200,0.08)"; for (let i = 0; i < 40; i++) g.fillRect(0, Math.random() * size, size, 1); }
    if (kind === "cobble") { for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.12})`; g.beginPath(); g.ellipse(Math.random() * size, Math.random() * size, 8 + Math.random() * 10, 6 + Math.random() * 8, Math.random() * 3, 0, 7); g.fill(); } }
    if (kind === "grain") { for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.06})`; g.fillRect(Math.random() * size, Math.random() * size, 2 + Math.random() * 4, 1 + Math.random() * 2); } }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return texCache[key] = t;
  }

  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.75, metalness: 0, envMapIntensity: 0.3 }, o));
  const phys = (o) => new THREE.MeshPhysicalMaterial(Object.assign({ roughness: 0.3, metalness: 0, envMapIntensity: 0.4 }, o));
  const gold = () => std({ color: 0xe6b422, metalness: 0.9, roughness: 0.3 });
  function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
  const rnd = (a, b) => a + Math.random() * (b - a);
  function jitter(hex, amt = 0.08) { const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + (Math.random() - 0.5) * amt))); return c; }

  // text on a small canvas, used for edge coordinates (sprites) and footprints (flat discs)
  const labelCache = {};
  function labelTex(text, bg) {
    const key = text + bg; if (labelCache[key]) return labelCache[key];
    const long = text.length > 2, c = document.createElement("canvas"); c.width = long ? 256 : 64; c.height = 64; const g = c.getContext("2d");
    g.font = `700 ${long ? 28 : 36}px Nunito, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    const tw = long ? Math.min(248, g.measureText(text).width + 30) : 60;
    g.fillStyle = bg; g.beginPath(); g.roundRect((c.width - tw) / 2, 2, tw, 60, 30); g.fill();
    g.fillStyle = "#fff"; g.fillText(text, c.width / 2, 34, 236);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return labelCache[key] = t;
  }
  function label(text, x, z, size, y = 0.28) { const tex = labelTex(text, "rgba(22,30,44,0.8)"); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); s.position.set(x, y, z); s.scale.set(size * tex.image.width / 64, size, 1); return s; }
  // hub props: zone portals, townsfolk, market stalls, the map signpost
  function propMesh(p) {
    const g = new THREE.Group(), name = p.label.replace(/^\S+\s/, "");
    if (p.kind === "portal") {
      const c = new THREE.Color(p.locked ? 0x555a66 : p.color);
      const ring = mesh(new THREE.TorusGeometry(0.42, 0.06, 12, 40), std({ color: c, emissive: c, emissiveIntensity: p.locked ? 0.05 : 1.4, roughness: 0.3 }), 0, 0.62, 0); g.add(ring); g.userData.spin = ring;
      g.add(mesh(new THREE.CircleGeometry(0.36, 32), std({ color: c, emissive: c, emissiveIntensity: p.locked ? 0 : 0.8, transparent: true, opacity: p.locked ? 0.25 : 0.55, side: THREE.DoubleSide }), 0, 0.62, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.1, 24), std({ color: 0x3a3f47, metalness: 0.4 }), 0, 0.05, 0));
      g.add(label((p.locked ? "🔒 " : "") + name, 0, 0, 0.5, 1.3));
      if (!p.locked) { const l = new THREE.PointLight(c, 1.5, 3, 2); l.position.set(0, 0.7, 0); g.add(l); }
    } else if (p.kind === "npc") {
      const vis = new THREE.Group(); g.add(vis); g.add(label(name, 0, 0, 0.5, 1.35)); g.userData.bob = true;
      useAsset(vis, name.length % 2 ? "villager" : "villager2", () => {
        const c = new THREE.Color(p.color);
        vis.add(mesh(new THREE.CapsuleGeometry(0.2, 0.35, 6, 12), phys({ color: c, roughness: 0.4, clearcoat: 0.6 }), 0, 0.45, 0));
        vis.add(mesh(new THREE.SphereGeometry(0.17, 16, 12), std({ color: 0xf1dcc4, roughness: 0.6 }), 0, 0.86, 0));
        vis.add(mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.08, 16), std({ color: c.clone().multiplyScalar(0.6) }), 0, 0.99, 0));
      });
    } else {
      const vis = new THREE.Group(); g.add(vis); g.add(label(name, 0, 0, 0.5, 1.3));
      const build = () => {
        const m = std({ color: 0x8a5a3a, roughness: 0.85, map: texture("planks", 0x8a5a3a) });
        vis.add(mesh(new THREE.BoxGeometry(0.8, 0.5, 0.6), m, 0, 0.25, 0));
        vis.add(mesh(new THREE.BoxGeometry(1.0, 0.06, 0.9), std({ color: p.kind === "sign" ? 0x4a6b86 : 0xc8553d, roughness: 0.8 }), 0, 0.95, 0));
        for (const s of [-1, 1]) vis.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.95, 6), std({ color: 0x5a3a1a }), s * 0.42, 0.47, -0.35));
      };
      if (p.kind === "sign") build(); else useAsset(vis, "stall", build);
    }
    return g;
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  function pickTile(e) { const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); if (!ray.ray.intersectPlane(floorPlane, hit)) return null; return { x: Math.round(hit.x), y: Math.round(hit.z) }; }
  function footprint(n, x, z) {
    if (state && state.hub) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ map: labelTex(String(n), "rgba(240,178,74,0.92)"), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.012 + trail.children.length * 0.0004, z); m.renderOrder = 2; trail.add(m);
  }

  // ---------- init ----------
  function init(c2d, overlay) {
    canvas2d = c2d; fx = overlay; fctx = overlay.getContext("2d");
    canvas = document.createElement("canvas"); canvas.id = "world3d"; canvas.hidden = true;
    c2d.parentNode.insertBefore(canvas, c2d);
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    } catch (e) { console.warn("3D disabled:", e); return; }
    renderer.setSize(W, H, false); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 400);
    pmrem = new THREE.PMREMGenerator(renderer);
    sky = new Sky(); sky.scale.setScalar(1000);
    sun = new THREE.DirectionalLight(0xffffff, 3); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
    hemi = new THREE.HemisphereLight(0xbfe0ff, 0xcbb07a, 0.6);
    scene.add(sky, sun, sun.target, hemi);
    world = new THREE.Group(); scene.add(world);
    ocean = makeOcean(); scene.add(ocean);
    particles = makeParticles(); scene.add(particles.mesh);
    composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.45, 0.5, 0.82); composer.addPass(bloom); composer.addPass(new OutputPass());
    setQuality(quality);
    // orbit with the mouse / finger, zoom with the wheel
    let drag = null;
    canvas.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, az: cam.az, el: cam.el }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", e => { if (drag) { cam.az = drag.az + (e.clientX - drag.x) * 0.008; cam.el = Math.min(1.3, Math.max(0.4, drag.el + (e.clientY - drag.y) * 0.006)); cam.azV = 0; } });
    canvas.addEventListener("pointerup", e => { if (drag && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) canvas.dispatchEvent(new CustomEvent("tileclick", { bubbles: true, detail: pickTile(e) })); drag = null; }); canvas.addEventListener("pointercancel", () => drag = null);
    canvas.addEventListener("wheel", e => { e.preventDefault(); cam.dist = Math.max(4, Math.min(40, cam.dist * (e.deltaY > 0 ? 1.08 : 0.93))); }, { passive: false });
    ok = true; preloadAssets();
    if (!loopStarted) { loopStarted = true; requestAnimationFrame(frame); }
  }

  function setQuality(q) {
    quality = q; if (!renderer) return;
    const ultra = q === "realistic";
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ultra ? 1.5 : 1));
    renderer.shadowMap.enabled = ultra; if (sun) sun.castShadow = ultra;
    if (bloom) bloom.enabled = ultra;
    if (composer) composer.setSize(W, H);
    if (scene) scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }
  function setActive(on) {
    active = on && ok;
    if (!canvas) return;
    canvas.hidden = !active; canvas2d.hidden = active;
    if (active) { fx.width = W; fx.height = H; }
  }

  // ---------- ocean / water shader ----------
  function makeOcean() {
    const geo = new THREE.PlaneGeometry(90, 90, 110, 110); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uDeep: { value: new THREE.Color(0x1b5f9e) }, uShallow: { value: new THREE.Color(0x62c3e8) }, uSky: { value: new THREE.Color(0xd9e6f2) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uFogColor: { value: new THREE.Color(0xd9e6f2) }, uFogDensity: { value: 0.012 } },
      vertexShader: `
        uniform float uTime; varying vec3 vWorld; varying vec3 vN;
        float h(vec2 p){ return sin(p.x*1.6+uTime*1.1)*0.035 + sin(p.y*2.1-uTime*1.5)*0.03 + sin((p.x+p.y)*0.8+uTime*0.7)*0.045 + sin(p.x*4.0-p.y*3.0+uTime*2.2)*0.012; }
        void main(){ vec4 wp = modelMatrix * vec4(position,1.0); float y = h(wp.xz); wp.y += y;
          float e = 0.06; float hx = h(wp.xz+vec2(e,0.0)) - y; float hz = h(wp.xz+vec2(0.0,e)) - y;
          vN = normalize(vec3(-hx/e, 1.0, -hz/e)); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uDeep, uShallow, uSky, uSunDir, uFogColor; uniform float uFogDensity; varying vec3 vWorld; varying vec3 vN;
        void main(){ vec3 V = normalize(cameraPosition - vWorld); vec3 N = normalize(vN);
          float fres = pow(1.0 - max(dot(N,V),0.0), 2.5);
          vec3 col = mix(uDeep, uShallow, 0.25 + 0.5*max(dot(N,uSunDir),0.0));
          col = mix(col, uSky, fres*0.7);
          vec3 R = reflect(-uSunDir, N); float spec = pow(max(dot(R,V),0.0), 320.0); col += vec3(1.0,0.95,0.85)*spec*0.7;
          float sp = sin(vWorld.x*18.0+uTime*1.3)*sin(vWorld.z*17.0-uTime*1.1); col += vec3(0.25)*smoothstep(0.975,1.0,sp);
          vec3 dv = vWorld - cameraPosition; float f = 1.0 - exp(-uFogDensity*uFogDensity*dot(dv,dv)); col = mix(col, uFogColor, clamp(f,0.0,1.0));
          gl_FragColor = vec4(col, 0.93); }`,
    });
    const m = new THREE.Mesh(geo, mat); m.position.y = -0.1; m.renderOrder = 1; return m;
  }

  // ---------- particles ----------
  function makeParticles() {
    const N = 500, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const m = new THREE.Points(geo, mat); m.frustumCulled = false;
    const vel = new Float32Array(N * 3), life = new Float32Array(N), base = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) pos[i * 3 + 1] = -100;
    return { mesh: m, pos, col, vel, life, base, N, next: 0 };
  }
  function burst(x, y, hex, n = 18, speed = 2.2) {
    const c = new THREE.Color(hex);
    for (let k = 0; k < n; k++) {
      const i = particles.next; particles.next = (particles.next + 1) % particles.N;
      const a = Math.random() * Math.PI * 2, b = rnd(0.2, 1.2), v = speed * rnd(0.4, 1) * 0.9;
      particles.pos.set([x + rnd(-0.1, 0.1), 0.35 + rnd(0, 0.2), y + rnd(-0.1, 0.1)], i * 3);
      particles.vel.set([Math.cos(a) * v, b * speed, Math.sin(a) * v], i * 3);
      particles.base.set([c.r, c.g, c.b], i * 3); particles.life[i] = 1;
    }
  }
  function stepParticles(dt) {
    const p = particles; let any = false;
    for (let i = 0; i < p.N; i++) {
      if (p.life[i] <= 0) continue; any = true;
      p.life[i] -= dt * 1.4; p.vel[i * 3 + 1] -= 6 * dt;
      p.pos[i * 3] += p.vel[i * 3] * dt; p.pos[i * 3 + 1] += p.vel[i * 3 + 1] * dt; p.pos[i * 3 + 2] += p.vel[i * 3 + 2] * dt;
      const l = Math.max(0, p.life[i]); p.col[i * 3] = p.base[i * 3] * l; p.col[i * 3 + 1] = p.base[i * 3 + 1] * l; p.col[i * 3 + 2] = p.base[i * 3 + 2] * l;
      if (p.life[i] <= 0) p.pos[i * 3 + 1] = -100;
    }
    if (any) { p.mesh.geometry.attributes.position.needsUpdate = true; p.mesh.geometry.attributes.color.needsUpdate = true; }
  }

  // ---------- builders ----------
  function wall(kind, color) {
    const g = new THREE.Group();
    if (kind === "rock" || kind === "tree" || kind === "crystal") { g.rotation.y = rnd(0, 6.28); g.scale.setScalar(rnd(0.92, 1.08)); }
    return useAsset(g, kind, () => wallShape(g, kind, color));
  }
  function wallShape(g, kind, color) {
    if (kind === "rock") { const n = 1 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) { const r = rnd(0.3, 0.5); const m = mesh(new THREE.DodecahedronGeometry(r, 0), std({ color: jitter(color, 0.12), roughness: 0.95 }), rnd(-0.2, 0.2), r * 0.75, rnd(-0.2, 0.2)); m.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3)); m.scale.y = rnd(0.7, 1.1); g.add(m); } }
    else if (kind === "tree") { const trunk = mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.55, 7), std({ color: 0x6b4a2f, roughness: 0.9 }), 0, 0.27, 0); g.add(trunk); const leaf = std({ color: jitter(color, 0.14), roughness: 0.85 }); g.add(mesh(new THREE.IcosahedronGeometry(0.4, 1), leaf, 0, 0.78, 0)); g.add(mesh(new THREE.IcosahedronGeometry(0.3, 1), leaf, rnd(-0.22, 0.22), 1.0, rnd(-0.22, 0.22))); g.add(mesh(new THREE.IcosahedronGeometry(0.24, 1), leaf, rnd(-0.25, 0.25), 0.6, rnd(-0.25, 0.25))); g.rotation.y = rnd(0, 6); }
    else if (kind === "pillar") { const m = std({ color: jitter(color, 0.1), roughness: 0.9, map: texture("cobble", color) }); const h = rnd(0.8, 1.05); g.add(mesh(new THREE.BoxGeometry(0.82, h, 0.82), m, 0, h / 2, 0)); g.add(mesh(new THREE.BoxGeometry(0.92, 0.12, 0.92), std({ color: 0x5c7a55, roughness: 1 }), 0, h + 0.05, 0)); }
    else if (kind === "crate") { const m = std({ color: jitter(color, 0.1), roughness: 0.85, map: texture("planks", color) }); g.add(mesh(new THREE.BoxGeometry(0.84, 0.84, 0.84), m, 0, 0.42, 0)); if (Math.random() < 0.4) { const s = mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), m, rnd(-0.12, 0.12), 1.09, rnd(-0.12, 0.12)); s.rotation.y = rnd(0, 1); g.add(s); } }
    else if (kind === "crystal") { const n = 2 + Math.floor(Math.random() * 2); for (let i = 0; i < n; i++) { const h = rnd(0.5, 1.2); const m = mesh(new THREE.OctahedronGeometry(0.22, 0), std({ color: 0x9ff3f6, emissive: 0x2fd6e0, emissiveIntensity: 0.9, roughness: 0.15, transparent: true, opacity: 0.88 }), rnd(-0.25, 0.25), h * 0.5, rnd(-0.25, 0.25)); m.scale.set(1, h * 2.2, 1); m.rotation.set(rnd(-0.3, 0.3), rnd(0, 3), rnd(-0.3, 0.3)); g.add(m); } }
    else if (kind === "ice") { g.add(mesh(new THREE.BoxGeometry(0.86, 0.9, 0.86), phys({ color: 0xbfe6ff, roughness: 0.08, transparent: true, opacity: 0.78, clearcoat: 1 }), 0, 0.45, 0)); g.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), std({ color: 0x7fb6dc, roughness: 0.5 }), 0, 0.42, 0)); }
    return g;
  }
  function house() {
    const g = new THREE.Group(), vis = new THREE.Group(); g.add(vis); useAsset(vis, "house", () => houseShape(vis));
    const light = new THREE.PointLight(0xffb86b, 2.5, 3.5, 2); light.position.set(0.6, 0.45, -0.1); g.add(light);
    return g;
  }
  function houseShape(g) {
    g.add(mesh(new THREE.BoxGeometry(0.66, 0.5, 0.6), std({ color: 0xf4ead6, roughness: 0.9 }), 0, 0.25, 0));
    const roof = mesh(new THREE.ConeGeometry(0.6, 0.42, 4), std({ color: 0xb8553d, roughness: 0.8 }), 0, 0.7, 0); roof.rotation.y = Math.PI / 4; g.add(roof);
    g.add(mesh(new THREE.BoxGeometry(0.02, 0.26, 0.16), std({ color: 0x6b4a2f }), 0.34, 0.14, 0.1));
    g.add(mesh(new THREE.BoxGeometry(0.02, 0.14, 0.14), std({ color: 0xffe9a8, emissive: 0xffb347, emissiveIntensity: 2.2 }), 0.34, 0.3, -0.15));
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 6), std({ color: 0x8a7b70 }), -0.18, 0.85, -0.15));
  }
  const ITEM_MODEL = { A: "apple", "*": "gem", K: "key", L: "lens" };
  function item(kind) {
    const g = new THREE.Group(); g.userData.kind = kind; g.userData.spin = kind === "A" ? 0.4 : 1.2;
    return useAsset(g, ITEM_MODEL[kind] || "gem", () => itemShape(g, kind));
  }
  function itemShape(g, kind) {
    if (kind === "A") { g.add(mesh(new THREE.SphereGeometry(0.19, 20, 16), phys({ color: 0xd8322a, roughness: 0.35, clearcoat: 0.8 }), 0, 0.2, 0)); g.add(mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.12, 5), std({ color: 0x5a3a1a }), 0, 0.42, 0)); g.add(mesh(new THREE.BoxGeometry(0.12, 0.02, 0.06), std({ color: 0x4e9a3a }), 0.06, 0.44, 0)); }
    if (kind === "L") { g.add(mesh(new THREE.TorusGeometry(0.19, 0.045, 10, 28), gold(), 0, 0.3, 0)); g.add(mesh(new THREE.CircleGeometry(0.17, 24), phys({ color: 0xcfe9ff, roughness: 0, transparent: true, opacity: 0.4, side: THREE.DoubleSide }), 0, 0.3, 0)); const h = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 8), gold(), 0.22, 0.1, 0); h.rotation.z = 0.8; g.add(h); }
    if (kind === "*") { const m = mesh(new THREE.OctahedronGeometry(0.2, 0), std({ color: 0x9df0ff, emissive: 0x2bb8ff, emissiveIntensity: 1.3, roughness: 0.1 }), 0, 0.35, 0); m.scale.y = 1.5; g.add(m); }
    if (kind === "K") { g.add(mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 20), gold(), -0.12, 0.3, 0)); g.add(mesh(new THREE.BoxGeometry(0.3, 0.05, 0.05), gold(), 0.1, 0.3, 0)); g.add(mesh(new THREE.BoxGeometry(0.05, 0.1, 0.05), gold(), 0.2, 0.24, 0)); g.add(mesh(new THREE.BoxGeometry(0.05, 0.08, 0.05), gold(), 0.11, 0.25, 0)); }
  }
  function switchMesh() { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.08, 20), std({ color: 0x3a3f47, metalness: 0.5, roughness: 0.6 }), 0, 0.04, 0)); const top = mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.1, 20), std({ color: 0xc0392b, emissive: 0xc0392b, emissiveIntensity: 0.25 }), 0, 0.12, 0); g.userData.top = top; g.add(top); return g; }
  function doorMesh(across) { const g = new THREE.Group(); const m = std({ color: 0x7a4a2a, roughness: 0.85, map: texture("planks", 0x7a4a2a) }); const slab = mesh(new THREE.BoxGeometry(across ? 0.96 : 0.26, 1.05, across ? 0.26 : 0.96), m, 0, 0.52, 0); g.add(slab); g.add(mesh(new THREE.SphereGeometry(0.04, 8, 8), gold(), across ? 0.3 : 0.16, 0.5, across ? 0.16 : 0.3)); g.userData.target = 0; return g; }
  function gateMesh(across) { const g = new THREE.Group(); const m = std({ color: 0x6c7680, metalness: 0.9, roughness: 0.35 }); for (let i = 0; i < 4; i++) { const o = -0.33 + i * 0.22; g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 8), m, across ? o : 0, 0.5, across ? 0 : o)); } g.add(mesh(new THREE.BoxGeometry(across ? 0.9 : 0.08, 0.06, across ? 0.08 : 0.9), m, 0, 0.5, 0)); g.add(mesh(new THREE.BoxGeometry(across ? 0.9 : 0.08, 0.06, across ? 0.08 : 0.9), m, 0, 0.95, 0)); g.userData.target = 0; return g; }
  function padMesh(d) { const cols = { 1: 0x9b59ff, 2: 0xff6fb5, 3: 0x4fd1ff, 4: 0xffb347 }; const c = cols[d] || 0x9b59ff; const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.05, 24), std({ color: 0x2b2440, roughness: 0.6 }), 0, 0.025, 0)); const ring = mesh(new THREE.TorusGeometry(0.28, 0.035, 10, 32), std({ color: c, emissive: c, emissiveIntensity: 1.6 }), 0, 0.09, 0); ring.rotation.x = Math.PI / 2; g.add(ring); const halo = mesh(new THREE.TorusGeometry(0.2, 0.02, 8, 24), std({ color: c, emissive: c, emissiveIntensity: 2.5 }), 0, 0.4, 0); g.userData.halo = halo; g.add(halo); return g; }
  function crabMesh() { const g = new THREE.Group(); return useAsset(g, "crab", () => crabShape(g)); }
  function crabShape(g) {
    const red = std({ color: 0xe0523a, roughness: 0.5 }), dark = std({ color: 0xb03a26, roughness: 0.6 });
    const body = mesh(new THREE.SphereGeometry(0.3, 18, 12), red, 0, 0.17, 0); body.scale.set(1, 0.55, 0.75); g.add(body);
    for (const s of [-1, 1]) { g.add(mesh(new THREE.SphereGeometry(0.1, 10, 8), dark, s * 0.34, 0.14, -0.1)); for (let i = 0; i < 3; i++) { const leg = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 5), dark, s * 0.3, 0.08, -0.05 + i * 0.1); leg.rotation.z = s * 1.1; g.add(leg); } }
    for (const s of [-1, 1]) { g.add(mesh(new THREE.SphereGeometry(0.04, 8, 8), std({ color: 0xffffff }), s * 0.09, 0.32, -0.18)); g.add(mesh(new THREE.SphereGeometry(0.02, 6, 6), std({ color: 0x111111 }), s * 0.09, 0.32, -0.215)); }
    return g;
  }
  function hatMesh(id) {
    const g = new THREE.Group(); g.position.y = 0.64;
    const m = (geo, mat, x = 0, y = 0, z = 0) => { const o = mesh(geo, mat, x, y, z); g.add(o); return o; };
    const goldm = () => std({ color: 0xe6b422, metalness: 0.9, roughness: 0.3 });
    switch (id) {
      case "cap": m(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 16), std({ color: 0xc8553d }), 0, 0.06, 0); m(new THREE.BoxGeometry(0.2, 0.03, 0.26), std({ color: 0xa33e2c }), 0.26, 0.02, 0); break;
      case "straw": m(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 20), std({ color: 0xd9b86a }), 0, 0.015, 0); m(new THREE.CylinderGeometry(0.17, 0.2, 0.14, 16), std({ color: 0xcfae5c }), 0, 0.09, 0); break;
      case "hardhat": m(new THREE.SphereGeometry(0.24, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: 0xf2c230, roughness: 0.4 })); m(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16), std({ color: 0xf2c230 }), 0, 0.01, 0); break;
      case "crown": m(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 8, 1, true), std({ color: 0xe6b422, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide }), 0, 0.07, 0); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; m(new THREE.ConeGeometry(0.04, 0.1, 6), goldm(), Math.cos(a) * 0.19, 0.18, Math.sin(a) * 0.19); } m(new THREE.SphereGeometry(0.04, 8, 8), std({ color: 0xff3b5c, emissive: 0xff3b5c, emissiveIntensity: 0.6 }), 0.19, 0.1, 0); break;
      case "pirate": m(new THREE.CylinderGeometry(0.2, 0.22, 0.14, 16), std({ color: 0x1b1b24 }), 0, 0.07, 0); { const b = m(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 3), std({ color: 0x1b1b24 }), 0, 0.02, 0); b.rotation.y = Math.PI / 6; } m(new THREE.SphereGeometry(0.035, 8, 8), std({ color: 0xffffff }), 0.19, 0.08, 0); break;
      case "wizard": m(new THREE.ConeGeometry(0.2, 0.5, 16), std({ color: 0x5a3fa0 }), 0, 0.27, 0); m(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 16), std({ color: 0x4a3390 }), 0, 0.015, 0); m(new THREE.SphereGeometry(0.03, 8, 8), std({ color: 0xffd866, emissive: 0xffd866, emissiveIntensity: 1.5 }), 0.08, 0.3, 0.12); break;
      case "lantern": m(new THREE.BoxGeometry(0.12, 0.16, 0.12), std({ color: 0xffe9a8, emissive: 0xffb347, emissiveIntensity: 2.5, transparent: true, opacity: 0.9 }), 0, 0.3, 0); m(new THREE.CylinderGeometry(0.01, 0.01, 0.24, 6), std({ color: 0x2b2f3a }), 0, 0.12, 0); { const l = new THREE.PointLight(0xffb347, 2, 3, 2); l.position.set(0, 0.32, 0); g.add(l); } break;
      case "antlers": for (const s of [-1, 1]) { const a = m(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 6), std({ color: 0x7a5436 }), 0, 0.14, s * 0.16); a.rotation.x = s * 0.5; const t = m(new THREE.CylinderGeometry(0.015, 0.02, 0.16, 6), std({ color: 0x7a5436 }), 0.05, 0.22, s * 0.22); t.rotation.z = -0.9; } break;
      case "propeller": m(new THREE.CylinderGeometry(0.2, 0.22, 0.1, 16), std({ color: 0x3b8ad8 }), 0, 0.05, 0); m(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 6), std({ color: 0x2b2f3a }), 0, 0.14, 0); { const p = new THREE.Group(); p.position.y = 0.2; p.add(mesh(new THREE.BoxGeometry(0.36, 0.02, 0.06), std({ color: 0xff5e5e }))); p.add(mesh(new THREE.BoxGeometry(0.06, 0.02, 0.36), std({ color: 0xffd866 }))); g.add(p); g.userData.spin = p; } break;
      case "halo": { const h = m(new THREE.TorusGeometry(0.2, 0.025, 8, 32), std({ color: 0xffe08a, emissive: 0xffd24a, emissiveIntensity: 2.5 }), 0, 0.36, 0); h.rotation.x = Math.PI / 2; g.userData.bob = h; break; }
      default: return null;
    }
    return g;
  }
  function robotMesh() {
    const g = new THREE.Group(), vis = new THREE.Group(); g.add(vis); g.userData.body = vis; g.userData.bodyY = 0;
    useAsset(vis, "bolt", () => robotShape(vis));
    const hat = hatMesh(look.hat); if (hat) { g.add(hat); g.userData.hat = hat; }
    vis.userData.onModel = () => { if (hat) hat.position.y = (vis.userData.top || 0.7) - 0.06; }; if (vis.userData.model) vis.userData.onModel();
    headlight = new THREE.SpotLight(0xfff1cc, 6, 5.5, 0.5, 0.6, 1.2); headlight.position.set(0.2, 0.5, 0); const tgt = new THREE.Object3D(); tgt.position.set(3, -0.4, 0); g.add(tgt); headlight.target = tgt; g.add(headlight);
    return g;
  }
  function robotShape(g) {
    const dark = std({ color: 0x2b2f3a, roughness: 0.6, metalness: 0.4 }), blue = phys({ color: paint, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.2 });
    for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.62, 0.18, 0.17), dark, 0, 0.09, s * 0.22));
    const body = mesh(new THREE.BoxGeometry(0.5, 0.44, 0.48), blue, 0, 0.42, 0); g.add(body);
    g.add(mesh(new THREE.BoxGeometry(0.02, 0.26, 0.38), std({ color: 0x0d1222, roughness: 0.15, metalness: 0.3 }), 0.26, 0.48, 0));
    const eye = std({ color: new THREE.Color(look.eyes), emissive: new THREE.Color(look.eyes), emissiveIntensity: 2.5 });
    g.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), eye, 0.28, 0.52, -0.1)); g.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), eye, 0.28, 0.52, 0.1));
    g.add(mesh(new THREE.BoxGeometry(0.02, 0.05, 0.22), std({ color: 0xffcc00, emissive: 0xffaa00, emissiveIntensity: 1.5 }), 0.26, 0.3, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 6), dark, 0, 0.74, 0)); g.add(mesh(new THREE.SphereGeometry(0.04, 10, 8), std({ color: 0xff5e5e, emissive: 0xff2d2d, emissiveIntensity: 2 }), 0, 0.86, 0));
    for (const s of [-1, 1]) { const a = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), dark, 0.05, 0.4, s * 0.3); a.rotation.x = s * 0.4; g.add(a); }
  }

  // ---------- build a level ----------
  function clearWorld() {
    world.traverse(o => { if (o.userData.shared) return; if (o.geometry) o.geometry.dispose(); if (o.material && !o.material.map) o.material.dispose(); });
    world.clear(); crabs = {}; items = {}; switches = {}; doors = {}; gates = {}; pads = []; propsList = [];
  }
  function neighborsWall(x, y) { const g = state.grid; const at = (xx, yy) => (g[yy] && g[yy][xx]) === "#"; return at(x - 1, y) && at(x + 1, y); }
  function load(snapshot, themeName) {
    state = snapshot; theme = THEMES[themeName] ? themeName : "sand"; th = THEMES[theme]; bubble = null; cancelFlag = false;
    if (!ok) return;
    clearWorld();
    const w = state.w, h = state.h;
    // island slab and cliffs
    const cliffTex = texture("cobble", th.cliff).clone(); cliffTex.repeat.set(w / 2, h / 2); cliffTex.needsUpdate = true;
    world.add(mesh(new THREE.BoxGeometry(w + 0.4, 1.4, h + 0.4), std({ color: 0xffffff, roughness: 1, map: cliffTex }), w / 2 - 0.5, -0.95, h / 2 - 0.5));
    // floor tiles (instanced, colour jitter per tile)
    let floorCount = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (state.grid[y][x] !== "~") floorCount++;
    const floor = new THREE.InstancedMesh(new THREE.BoxGeometry(0.94, 0.3, 0.94), std({ color: 0xffffff, roughness: 0.9, map: texture(th.tex, th.floor) }), Math.max(1, floorCount));
    floor.receiveShadow = true; floor.castShadow = false;
    const M = new THREE.Matrix4(); let i = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (state.grid[y][x] === "~") continue;
      M.makeTranslation(x, -0.15 - Math.random() * 0.02, y); floor.setMatrixAt(i, M);
      floor.setColorAt(i, new THREE.Color(0xffffff).multiplyScalar(((x + y) % 2 ? 0.84 : 1) * rnd(0.97, 1.02))); i++;
    }
    floor.instanceMatrix.needsUpdate = true; if (floor.instanceColor) floor.instanceColor.needsUpdate = true; world.add(floor);
    // tiles
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = state.grid[y][x], k = x + "," + y;
      if (c === "#") { const m = wall(th.wall, th.wallColor); m.position.set(x, 0, y); world.add(m); }
      else if (c === "G") { const m = house(); m.position.set(x, 0, y); m.rotation.y = Math.PI; world.add(m); }
      else if (c === "S") { const m = switchMesh(); m.position.set(x, 0, y); world.add(m); switches[k] = m; }
      else if (c === "D") { const m = doorMesh(neighborsWall(x, y)); m.position.set(x, 0, y); world.add(m); doors[k] = m; }
      else if (c === "X") { const m = gateMesh(neighborsWall(x, y)); m.position.set(x, 0, y); world.add(m); gates[k] = m; }
      else if ("1234".includes(c)) { const m = padMesh(c); m.position.set(x, 0, y); world.add(m); pads.push(m); }
    }
    // numbers along two edges: the x of each column (top) and the y of each row (left), same as robot.x() / robot.y()
    for (let x = 0; x < w; x++) world.add(label(String(x), x, -0.95, 0.56));
    for (let y = 0; y < h; y++) world.add(label(String(y), -0.95, y, 0.56));
    trail = new THREE.Group(); world.add(trail); moveN = 0;
    for (const k in state.items) { const [x, y] = k.split(",").map(Number); const m = item(state.items[k]); m.position.set(x, 0, y); m.userData.phase = Math.random() * 6; world.add(m); items[k] = m; }
    for (const c of state.crabs || []) { const m = crabMesh(); m.position.set(c.x, 0, c.y); world.add(m); crabs[c.id] = m; }
    for (const p of state.props || []) { const m = propMesh(p); m.position.set(p.x, 0, p.y); world.add(m); propsList.push(m); }
    robot = robotMesh(); robot.position.set(state.robot.x, 0, state.robot.y); robot.rotation.y = -state.robot.dir * Math.PI / 2; world.add(robot);
    // weather
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - th.sun.el), THREE.MathUtils.degToRad(th.sun.az));
    const u = sky.material.uniforms; u.turbidity.value = th.turb; u.rayleigh.value = th.ray; u.mieCoefficient.value = 0.005; u.mieDirectionalG.value = 0.8; u.sunPosition.value.copy(sunDir);
    const envScene = new THREE.Scene(); envScene.add(sky); const rt = pmrem.fromScene(envScene); if (scene.environment) scene.environment.dispose(); scene.environment = rt.texture; scene.add(sky);
    const lightDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - Math.max(th.sun.el, 18)), THREE.MathUtils.degToRad(th.sun.az));
    const center = new THREE.Vector3(w / 2 - 0.5, 0, h / 2 - 0.5);
    sun.position.copy(center).addScaledVector(lightDir, 28); sun.target.position.copy(center); sun.color.set(th.sunColor); sun.intensity = th.sun.el < 12 ? 1.5 : 2.4;
    const r = Math.max(w, h) * 0.75 + 1.5; Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 5, far: 60 }); sun.shadow.camera.updateProjectionMatrix();
    hemi.color.set(th.hemi[0]); hemi.groundColor.set(th.hemi[1]); hemi.intensity = th.hemi[2];
    scene.fog = new THREE.FogExp2(th.fog[0], th.fog[1]); renderer.toneMappingExposure = th.exposure;
    const wu = ocean.material.uniforms; wu.uDeep.value.set(th.water[0]); wu.uShallow.value.set(th.water[1]); wu.uSky.value.set(th.fog[0]); wu.uSunDir.value.copy(sunDir); wu.uFogColor.value.set(th.fog[0]); wu.uFogDensity.value = th.fog[1];
    ocean.position.set(center.x, -0.1, center.z);
    // camera
    cam.center.copy(center); cam.dist = (Math.max(w * 0.95, h * 1.45) + 2.5) * (phone ? 0.62 : 1); cam.el = phone ? 0.95 : 0.82; cam.az = 0.35; cam.azV = 0; cam.introK = document.hidden ? 1 : 0; cam.look.copy(center); cam.follow.copy(center);
    sync();
  }

  // ---------- state -> scene ----------
  function sync() {
    if (!ok || !state) return;
    for (const k in items) items[k].visible = !!state.items[k];
    for (const k in switches) { const on = !!state.switches[k]; const top = switches[k].userData.top; top.material.color.set(on ? 0x3fcf7f : 0xc0392b); top.material.emissive.set(on ? 0x3fcf7f : 0xc0392b); top.position.y = on ? 0.07 : 0.12; }
    for (const k in doors) doors[k].userData.target = state.doors[k] ? -1.15 : 0;
    for (const k in gates) gates[k].userData.target = state.gates[k] ? -1.1 : 0;
    if (robot) { robot.position.x = state.robot.x; robot.position.z = state.robot.y; robot.position.y = 0; robot.rotation.y = -state.robot.dir * Math.PI / 2; robot.rotation.z = 0; robot.scale.setScalar(1); }
    for (const id in crabs) { const c = (state.crabs || []).find(c => c.id == id); if (c && !crabs[id].userData.moving) { crabs[id].position.x = c.x; crabs[id].position.z = c.y; } }
  }
  const draw = sync;

  // ---------- frame loop ----------
  function frame(now) {
    requestAnimationFrame(frame);
    if (!active || !state || !canvas || canvas.offsetParent === null) { lastNow = now; return; }
    const dt = Math.min(0.05, (now - lastNow) / 1000 || 0.016); lastNow = now; clock += dt;
    ocean.material.uniforms.uTime.value = clock;
    for (const k in items) { const m = items[k]; m.position.y = 0.05 + Math.sin(clock * 2 + m.userData.phase) * 0.05; m.rotation.y += dt * m.userData.spin; }
    for (const p of pads) { p.userData.halo.rotation.y += dt * 2; p.userData.halo.position.y = 0.35 + Math.sin(clock * 3) * 0.08; }
    for (const k in doors) { const d = doors[k]; d.position.y += (d.userData.target - d.position.y) * Math.min(1, dt * 5); }
    for (const k in gates) { const d = gates[k]; d.position.y += (d.userData.target - d.position.y) * Math.min(1, dt * 5); }
    for (const id in crabs) { const c = crabs[id]; c.position.y = Math.abs(Math.sin(clock * 9 + Number(id))) * 0.02; }
    for (const p of propsList) { if (p.userData.spin) p.userData.spin.rotation.y += dt * 0.8; if (p.userData.bob) p.position.y = Math.sin(clock * 2 + p.position.x) * 0.02; }
    if (robot) { robot.userData.body.position.y = robot.userData.bodyY + Math.sin(clock * 3) * 0.008; const h = robot.userData.hat; if (h) { if (h.userData.spin) h.userData.spin.rotation.y += dt * 14; if (h.userData.bob) h.userData.bob.position.y = 0.36 + Math.sin(clock * 2) * 0.03; } }
    stepParticles(dt);
    // camera: intro sweep, gentle sway, soft follow, user orbit
    cam.introK = Math.min(1, cam.introK + dt / 1.1); const ik = 1 - Math.pow(1 - cam.introK, 3);
    cam.az += cam.azV * dt; cam.azV *= 0.9;
    const sway = Math.sin(clock * 0.25) * 0.03;
    if (robot) cam.follow.lerp(new THREE.Vector3(robot.position.x, 0, robot.position.z), dt * 1.5);
    cam.look.copy(cam.center).lerp(cam.follow, phone ? 0.85 : 0.25); // on a phone the camera follows Bolt closely
    const dist = cam.dist * (1 + (1 - ik) * 0.9), el = cam.el + (1 - ik) * 0.35, az = cam.az + sway - (1 - ik) * 0.6;
    camera.position.set(cam.look.x + Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist + 0.3, cam.look.z + Math.cos(az) * Math.cos(el) * dist);
    camera.lookAt(cam.look.x, 0.2, cam.look.z);
    if (quality === "realistic") composer.render(); else renderer.render(scene, camera);
    drawBubble();
  }
  function drawBubble() {
    fctx.clearRect(0, 0, fx.width, fx.height);
    if (!bubble || !robot) return;
    const v = new THREE.Vector3(robot.position.x, 1.15, robot.position.z).project(camera);
    const sx = (v.x + 1) / 2 * fx.width, sy = (1 - v.y) / 2 * fx.height;
    fctx.font = "600 16px Nunito, sans-serif"; const w = fctx.measureText(bubble).width + 18;
    const bx = Math.min(Math.max(sx - w / 2, 4), fx.width - w - 4), by = Math.max(sy - 34, 4);
    fctx.fillStyle = "rgba(255,255,255,0.95)"; fctx.strokeStyle = "#333"; fctx.lineWidth = 1.5; fctx.beginPath(); fctx.roundRect(bx, by, w, 28, 8); fctx.fill(); fctx.stroke();
    fctx.beginPath(); fctx.moveTo(sx - 6, by + 28); fctx.lineTo(sx + 6, by + 28); fctx.lineTo(sx, by + 36); fctx.closePath(); fctx.fill();
    fctx.fillStyle = "#222"; fctx.textAlign = "left"; fctx.textBaseline = "middle"; fctx.fillText(bubble, bx + 9, by + 14);
  }

  // ---------- playback ----------
  const sleep = ms => ms <= 0 ? Promise.resolve() : new Promise(r => setTimeout(r, ms));
  function tween(ms, fn) {
    if (ms <= 0) { fn(1); return Promise.resolve(); }
    return new Promise(res => { const t0 = performance.now(); (function step() { if (cancelFlag) { fn(1); return res(); } const k = Math.min(1, (performance.now() - t0) / ms); fn(k); k < 1 ? setTimeout(step, 16) : res(); })(); });
  }
  const ease = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  function moveRobot(from, to, ms, arc) {
    return tween(ms, k => { const e = ease(k); robot.position.x = from.x + (to.x - from.x) * e; robot.position.z = from.y + (to.y - from.y) * e; robot.position.y = arc ? Math.sin(k * Math.PI) * 0.7 : Math.abs(Math.sin(k * Math.PI * 2)) * 0.03; });
  }
  function turnRobot(dir, ms) {
    const from = robot.rotation.y; const to = -dir * Math.PI / 2; let d = to - from; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    return tween(ms, k => { robot.rotation.y = from + d * ease(k); });
  }
  function moveCrab(id, from, to, ms) {
    const c = crabs[id]; if (!c) return; c.userData.moving = true;
    tween(ms, k => { c.position.x = from.x + (to.x - from.x) * k; c.position.z = from.y + (to.y - from.y) * k; }).then(() => c.userData.moving = false);
  }
  async function play(events, speed, onEvent) {
    cancelFlag = false;
    const instant = document.hidden || !ok;
    const base = instant ? 0 : speed === "fast" ? 55 : speed === "slow" ? 320 : 160;
    for (const ev of events) {
      if (cancelFlag) break;
      if (onEvent) onEvent(ev);
      if (!ok) continue;
      switch (ev.type) {
        case "move": if (look.trail) burst(ev.from.x, ev.from.y, look.trail, 6, 0.8); await moveRobot(ev.from, ev.to, base); state.robot.x = ev.to.x; state.robot.y = ev.to.y; footprint(++moveN, ev.to.x, ev.to.y); break;
        case "jump": await moveRobot(ev.from, ev.to, base * 1.6, true); if (ev.over && state.grid[ev.over.y] && state.grid[ev.over.y][ev.over.x] === "~") burst(ev.over.x, ev.over.y, th.water[1], 14, 1.6); state.robot.x = ev.to.x; state.robot.y = ev.to.y; footprint(++moveN, ev.to.x, ev.to.y); break;
        case "teleport": burst(ev.from.x, ev.from.y, 0xc9a7ff, 24); await tween(base * 0.6, k => robot.scale.setScalar(1 - k * 0.98)); robot.position.x = ev.to.x; robot.position.z = ev.to.y; state.robot.x = ev.to.x; state.robot.y = ev.to.y; burst(ev.to.x, ev.to.y, 0xc9a7ff, 24); await tween(base * 0.6, k => robot.scale.setScalar(0.02 + k * 0.98)); robot.scale.setScalar(1); await sleep(base * 0.5); moveN = 0; break;
        case "turn": await turnRobot(ev.dir, base * 0.6); state.robot.dir = ev.dir; moveN = 0; break;
        case "wait": bubble = "..."; await sleep(base); bubble = null; break;
        case "pick": delete state.items[ev.x + "," + ev.y]; if (items[ev.x + "," + ev.y]) items[ev.x + "," + ev.y].visible = false; bubble = ev.item === "*" ? "gem!" : ev.item === "K" ? "a key!" : "got it!"; burst(ev.x, ev.y, ev.item === "*" ? 0x7fd3ff : 0xffd866, 16); await sleep(base); bubble = null; break;
        case "press": state.switches[ev.x + "," + ev.y] = true; sync(); burst(ev.x, ev.y, 0x5fcf8f, 10, 1.4); await sleep(base); break;
        case "doors": for (const d in state.doors) state.doors[d] = true; sync(); bubble = "doors open!"; await sleep(base * 2); bubble = null; break;
        case "unlock": state.gates[ev.x + "," + ev.y] = true; sync(); burst(ev.x, ev.y, 0xffd866, 16); await sleep(base); break;
        case "nothing": bubble = "nothing here"; await sleep(base * 0.8); bubble = null; break;
        case "bump": { bubble = ev.what === "door" ? "locked door" : ev.what === "gate" ? "need a key" : "bonk"; const [dx, dy] = DIRS[ev.dir || 0]; const ox = robot.position.x, oz = robot.position.z; await tween(base * 0.8, k => { const s = Math.sin(k * Math.PI) * 0.18; robot.position.x = ox + dx * s; robot.position.z = oz + dy * s; }); bubble = null; break; }
        case "say": bubble = ev.text; await sleep(base * 4); bubble = null; break;
        case "crab": moveCrab(ev.id, ev.from, ev.to, base * 0.9); break;
        case "shield": if (crabs[ev.id]) crabs[ev.id].visible = false; bubble = "shield!"; burst(ev.x, ev.y, 0x7fb3ff, 20); await sleep(base * 1.5); bubble = null; break;
        case "pinch": bubble = "ouch!"; burst(ev.x, ev.y, 0xe0523a, 20); await tween(base * 2, k => { robot.rotation.z = Math.sin(k * Math.PI * 6) * 0.15 * (1 - k); }); robot.rotation.z = 0; await sleep(base); break;
      }
    }
    sync();
  }
  function cancel() { cancelFlag = true; }
  function celebrate() { if (!ok || !state || !state.goal) return; for (let i = 0; i < 4; i++) setTimeout(() => burst(state.goal.x, state.goal.y, [0x5fcf8f, 0xf0b24a, 0x7fb3ff, 0xff7b72][i], 30, 3), i * 180); }

  return { init, load, draw, play, cancel, celebrate, setActive, setQuality, setPaint, setLook, pickTile, get ok() { return ok; } };
})();
window.Render3D = Render3D;
window.dispatchEvent(new Event("render3d-ready"));
