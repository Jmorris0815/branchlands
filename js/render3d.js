// The game's renderer (Three.js): init, load, play, cancel, draw for the coding levels, and roam for Harbor Town.
// Loaded as an ES module from a CDN, so the first visit needs a network connection.
//
// Picture: every level is a small island in an ocean, under a physically-based sky. The sun casts real
// shadows, the water is a wave shader, each zone has its own weather (fog, sun height, colour), the
// robot "Bolt" has a headlight, and glowing things (gems, crystals, teleporters) bloom.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/+esm";
import { EffectComposer } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js/+esm";
import { RenderPass } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPass.js/+esm";
import { UnrealBloomPass } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js/+esm";
import { OutputPass } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/OutputPass.js/+esm";
import { ShaderPass } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/ShaderPass.js/+esm";
import { Sky } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/objects/Sky.js/+esm";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm";
import { clone as cloneSkinned } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js/+esm";

const Render3D = (() => {
  const phone = document.documentElement.dataset.device === "phone";
  let W = phone ? 640 : 800, H = phone ? 640 : 500; // level frame: square on phones (more board, less sky); the town uses a wider one
  const LEVEL_W = W, LEVEL_H = H;
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  let fx, fctx, canvas2d, canvas, renderer, scene, camera, composer, bloom, sky, sun, hemi, pmrem, world, ocean;
  let state, theme = "sand", th, ok = false, active = false, quality = "realistic", cancelFlag = false, bubble = null;
  let clock = 0, lastNow = 0, loopStarted = false;
  let robot, headlight, crabs = {}, items = {}, switches = {}, doors = {}, gates = {}, pads = [], trail, moveN = 0, propsList = [], paint = new THREE.Color(0x3b55c8);
  function setPaint(c) { paint = new THREE.Color(c); }
  let look = { hat: "none", eyes: "#5de0ff", trail: null };
  function setLook(l) { if (l.paint) setPaint(l.paint); look = Object.assign(look, l); }
  const cam = { center: new THREE.Vector3(), dist: 10, el: 0.82, az: 0.35, azV: 0, introK: 0, look: new THREE.Vector3(), follow: new THREE.Vector3() };
  let particles, OCEAN_LEVEL;
  const texCache = {};

  // ---------- generated glTF models (optional) ----------
  // Real models made from concept art (FLUX) and image-to-3D (Hunyuan3D) on the family's DGX Spark: see tools/assets3d/.
  // Each entry says which file in assets/models/ to use, how big it should be in tiles (fit "h" = height, "w" = footprint),
  // how far to lift it off the ground, which way its front faces, and whether Bolt's paint colour tints it.
  // If a file is missing or still loading, the built-in shape below is drawn instead, so the game never waits on a download.
  const ASSETS = {
    bolt:     { fit: "h", size: 0.95, rotY: Math.PI / 2, tint: true },
    house:    { fit: "w", size: 0.92, rotY: Math.PI },
    tree:     { fit: "h", size: 1.15 }, rock: { fit: "w", size: 0.92 }, crate: { fit: "w", size: 0.84 }, pillar: { fit: "h", size: 0.95 }, crystal: { fit: "w", size: 0.95 }, ice: { fit: "w", size: 0.86 },
    crab:     { fit: "w", size: 0.62 },
    apple:    { fit: "h", size: 0.34, lift: 0.08 }, key: { fit: "w", size: 0.42, lift: 0.18 }, lens: { fit: "w", size: 0.45, lift: 0.12 },
    villager: { fit: "h", size: 1.1 }, villager2: { fit: "h", size: 1.08 }, villager3: { fit: "h", size: 1.1 }, villager4: { fit: "h", size: 1.02 }, villager5: { fit: "h", size: 1.15 }, villager6: { fit: "h", size: 0.82 },
    villager_rig: { fit: "h", size: 1.1 }, villager2_rig: { fit: "h", size: 1.08 }, villager3_rig: { fit: "h", size: 1.1 }, villager4_rig: { fit: "h", size: 1.02 }, villager5_rig: { fit: "h", size: 1.15 }, villager6_rig: { fit: "h", size: 0.82 }, // rigged in Mixamo, with idle / walk / wave / talk clips
    stall: { fit: "w", size: 1.05 },
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
      g.userData.top = sz.y * s + (a.lift || 0); g.userData.clips = gltf.animations;
      assetTpl[name] = g; (assetWaiters[name] || []).forEach(fn => fn()); delete assetWaiters[name];
    }, undefined, () => console.info("no model file for " + name + ", drawing the built-in shape"));
  }
  // fill group g with the model (now, or as soon as it arrives); until then, or if there is no file, draw the built-in shape
  function useAsset(g, name, fallback) {
    if (!name || !ASSETS[name]) { fallback(); return g; }
    loadAsset(name);
    const place = () => {
      const t = assetTpl[name]; if (!t) return false;
      g.clear(); const inst = t.userData.clips.length ? cloneSkinned(t) : t.clone(true); if (ASSETS[name].tint) tintModel(inst, paint); g.add(inst);
      if (t.userData.clips.length) { inst.userData.clips = t.userData.clips; inst.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.userData.shared = false; } }); }
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
      const vis = new THREE.Group(); g.add(vis); g.add(label(name, 0, 0, 0.5, 1.35)); g.userData.vis = vis;
      const model = personModel(p.model && ASSETS[p.model] ? p.model : (name.length % 2 ? "villager" : "villager2")); vis.userData.modelName = model;
      useAsset(vis, model, () => {
        const c = new THREE.Color(p.color);
        vis.add(mesh(new THREE.CapsuleGeometry(0.2, 0.35, 6, 12), phys({ color: c, roughness: 0.4, clearcoat: 0.6 }), 0, 0.45, 0));
        vis.add(mesh(new THREE.SphereGeometry(0.17, 16, 12), std({ color: 0xf1dcc4, roughness: 0.6 }), 0, 0.86, 0));
        vis.add(mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.08, 16), std({ color: c.clone().multiplyScalar(0.6) }), 0, 0.99, 0));
      });
    } else if (p.kind === "door" || p.kind === "exit") {
      const wood = std({ color: 0x4a3324, roughness: 0.85 }), slab = std({ color: 0xffffff, map: texture("planks", 0x7a4a2a), roughness: 0.85 });
      for (const sx of [-0.62, 0.62]) g.add(mesh(new THREE.BoxGeometry(0.16, 2.1, 0.2), wood, sx, 1.05, 0));
      g.add(mesh(new THREE.BoxGeometry(1.44, 0.18, 0.22), wood, 0, 2.15, 0));
      const d = mesh(new THREE.BoxGeometry(1.08, 2.0, 0.08), slab, -0.54, 1.0, 0); d.geometry.translate(0.54, 0, 0); d.rotation.y = -1.1; g.add(d);
      g.add(mesh(new THREE.PlaneGeometry(1.08, 2.0), std({ color: 0x8a6a48, emissive: 0xffa050, emissiveIntensity: p.kind === "door" ? 0.55 : 0.25, side: THREE.DoubleSide }), 0, 1.0, -0.02));
      const bulb = std({ color: 0xffe2a8, emissive: 0xffb347, emissiveIntensity: 2.4 }); g.add(mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), bulb, 0.82, 1.9, 0.12));
      g.add(label(name, 0, 0, 0.5, 2.6));
    } else if (p.kind === "moor") {
      const wood = std({ color: 0x5a4330, roughness: 0.9 }); g.add(mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.0, 10), wood, 0, 0.5, 0));
      const rope = mesh(new THREE.TorusGeometry(0.13, 0.035, 6, 16), std({ color: 0xc9b48a, roughness: 1 }), 0, 0.72, 0); rope.rotation.x = Math.PI / 2; g.add(rope);
      g.add(label(name, 0, 0, 0.5, 1.45));
    } else if (p.kind === "chest") {
      const wood = std({ color: 0xffffff, map: texture("planks", 0x7a4a2a), roughness: 0.8 }), gold = std({ color: 0xe6b422, metalness: 0.9, roughness: 0.3 });
      g.add(mesh(new THREE.BoxGeometry(0.7, 0.4, 0.46), wood, 0, 0.2, 0)); for (const x of [-0.28, 0.28]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.42, 0.48), gold, x, 0.2, 0));
      const lid = new THREE.Group(); lid.position.set(0, 0.4, -0.23); const top = mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.7, 14, 1, false, 0, Math.PI), wood, 0, 0, 0.23); top.rotation.z = Math.PI / 2; lid.add(top);
      for (const x of [-0.28, 0.28]) { const band = mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.05, 14, 1, false, 0, Math.PI), gold, x, 0, 0.23); band.rotation.z = Math.PI / 2; lid.add(band); }
      lid.add(mesh(new THREE.BoxGeometry(0.1, 0.12, 0.04), gold, 0, -0.02, 0.47)); g.add(lid); g.userData.lid = lid; lid.rotation.x = p.open ? -1.9 : 0; g.userData.lidTo = lid.rotation.x;
      g.add(label(name, 0, 0, 0.5, 1.05));
    } else if (p.kind === "race") {
      const pole = std({ color: 0xd8dde4, metalness: 0.8, roughness: 0.3 }); g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.9, 10), pole, 0, 0.95, 0));
      const ck = document.createElement("canvas"); ck.width = 64; ck.height = 40; const cg = ck.getContext("2d"); for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) { cg.fillStyle = (x + y) % 2 ? "#151515" : "#fafafa"; cg.fillRect(x * 8, y * 8, 8, 8); }
      const ft = new THREE.CanvasTexture(ck); ft.colorSpace = THREE.SRGBColorSpace; ft.magFilter = THREE.NearestFilter;
      const fg = new THREE.PlaneGeometry(0.8, 0.5, 8, 1); const flag = mesh(fg, std({ map: ft, side: THREE.DoubleSide, roughness: 0.8 }), 0.42, 1.62, 0); g.add(flag); g.userData.flag = flag;
      g.add(mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.08, 20), std({ color: 0x3a3f47, metalness: 0.4 }), 0, 0.04, 0));
      g.add(label(name, 0, 0, 0.5, 2.2));
    } else if (p.kind === "spot") {
      const c = new THREE.Color(p.color || 0xf0b24a); const ring = mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 36), std({ color: c, emissive: c, emissiveIntensity: 1.6 })); ring.rotation.x = Math.PI / 2; ring.castShadow = false; const spin = new THREE.Group(); spin.position.y = 0.03; spin.add(ring); for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2, d = mesh(new THREE.SphereGeometry(0.05, 8, 6), std({ color: c, emissive: c, emissiveIntensity: 2.2 }), Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42); spin.add(d); } g.add(spin); g.userData.spin = spin;
      g.add(label(name, 0, 0, 0.5, 1.5));
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
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { samples: 4, type: THREE.HalfFloatType })); composer.addPass(new RenderPass(scene, camera)); // 4x MSAA: the post chain would otherwise lose anti-aliasing
    bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.45, 0.5, 0.82); composer.addPass(bloom); composer.addPass(new OutputPass()); composer.addPass(new ShaderPass(GradeShader));
    setQuality(quality);
    // orbit with the mouse / finger, zoom with the wheel
    let drag = null;
    canvas.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, az: cam.az, el: cam.el }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", e => { if (drag) { cam.az = drag.az + (e.clientX - drag.x) * 0.008; cam.el = Math.min(roam ? 1.1 : 1.3, Math.max(roam ? 0.12 : 0.4, drag.el + (e.clientY - drag.y) * 0.006)); cam.azV = 0; if (roam) roam.lastDrag = clock; } });
    canvas.addEventListener("pointerup", e => { if (drag && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) { if (roam) roamClick(e);  } drag = null; }); canvas.addEventListener("pointercancel", () => drag = null);
    canvas.addEventListener("wheel", e => { e.preventDefault(); cam.dist = Math.max(roam ? 2.5 : 4, Math.min(roam ? 11 : 40, cam.dist * (e.deltaY > 0 ? 1.08 : 0.93))); }, { passive: false });
    ok = true; preloadAssets();
    if (!loopStarted) { loopStarted = true; requestAnimationFrame(frame); }
  }

  function setSize(w, h) {
    if (!renderer || (W === w && H === h)) return;
    W = w; H = h; renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); composer.setSize(W, H); bloom.setSize(W, H); fx.width = W; fx.height = H;
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
    const geo = OCEAN_LEVEL = new THREE.PlaneGeometry(90, 90, 110, 110); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uHOff: { value: new THREE.Vector2() }, uHT: { value: null }, uHas: { value: 0 }, uHHalf: { value: 1 }, uHSize: { value: 1 }, uTime: { value: 0 }, uDeep: { value: new THREE.Color(0x1b5f9e) }, uShallow: { value: new THREE.Color(0x62c3e8) }, uSky: { value: new THREE.Color(0xd9e6f2) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uFogColor: { value: new THREE.Color(0xd9e6f2) }, uFogDensity: { value: 0.012 } },
      vertexShader: `
        uniform float uTime; varying vec3 vWorld; varying vec3 vN;
        float h(vec2 p){ return sin(p.x*1.6+uTime*1.1)*0.035 + sin(p.y*2.1-uTime*1.5)*0.03 + sin((p.x+p.y)*0.8+uTime*0.7)*0.045 + sin(p.x*4.0-p.y*3.0+uTime*2.2)*0.012; }
        void main(){ vec4 wp = modelMatrix * vec4(position,1.0); float y = h(wp.xz); wp.y += y;
          float e = 0.06; float hx = h(wp.xz+vec2(e,0.0)) - y; float hz = h(wp.xz+vec2(0.0,e)) - y;
          vN = normalize(vec3(-hx/e, 1.0, -hz/e)); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uDeep, uShallow, uSky, uSunDir, uFogColor; uniform float uFogDensity; uniform sampler2D uHT; uniform float uHas, uHHalf, uHSize; uniform vec2 uHOff; varying vec3 vWorld; varying vec3 vN;
        void main(){ vec3 V = normalize(cameraPosition - vWorld); vec3 N = normalize(vN);
          float depth = 9.0; if (uHas > 0.5) { float ground = texture2D(uHT, (vWorld.xz - uHOff + uHHalf) / uHSize).r; if (ground > -0.07) discard; depth = -0.1 - ground; } // dry land: wave crests must not poke through
          float fres = pow(1.0 - max(dot(N,V),0.0), 2.5);
          vec3 col = mix(uDeep, uShallow, 0.25 + 0.5*max(dot(N,uSunDir),0.0));
          col = mix(col, uSky, fres*0.7);
          vec3 R = reflect(-uSunDir, N); float spec = pow(max(dot(R,V),0.0), 320.0); col += vec3(1.0,0.95,0.85)*spec*0.7;
          float sp = sin(vWorld.x*18.0+uTime*1.3)*sin(vWorld.z*17.0-uTime*1.1); col += vec3(0.25)*smoothstep(0.975,1.0,sp);
          float shallow = smoothstep(2.2, 0.0, depth); col = mix(col, vec3(0.32, 0.78, 0.76), shallow * 0.55);
          float wave = sin(depth * 14.0 - uTime * 2.2 + sin(vWorld.x * 0.7 + vWorld.z * 0.4) * 2.0) * 0.5 + 0.5; float foam = smoothstep(0.45, 0.0, depth) * (0.55 + 0.45 * wave) + smoothstep(0.12, 0.0, depth) * 0.6; col = mix(col, vec3(0.97, 0.98, 1.0), clamp(foam, 0.0, 0.9));
          float alpha = mix(0.93, 0.62, shallow) + foam * 0.2;
          vec3 dv = vWorld - cameraPosition; float f = 1.0 - exp(-uFogDensity*uFogDensity*dot(dv,dv)); col = mix(col, uFogColor, clamp(f,0.0,1.0));
          gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0)); }`,
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
  function burst(x, y, hex, n = 18, speed = 2.2, h = 0.35) {
    const c = new THREE.Color(hex);
    for (let k = 0; k < n; k++) {
      const i = particles.next; particles.next = (particles.next + 1) % particles.N;
      const a = Math.random() * Math.PI * 2, b = rnd(0.2, 1.2), v = speed * rnd(0.4, 1) * 0.9;
      particles.pos.set([x + rnd(-0.1, 0.1), h + rnd(0, 0.2), y + rnd(-0.1, 0.1)], i * 3);
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
  const ITEM_MODEL = { A: "apple", K: "key", L: "lens" }; // gems stay built-in: the glowing octahedron blooms nicely
  function item(kind) {
    const g = new THREE.Group(); g.userData.kind = kind; g.userData.spin = kind === "A" ? 0.4 : 1.2;
    return useAsset(g, ITEM_MODEL[kind], () => itemShape(g, kind));
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
  // sun, sky, environment light, fog, water colours and the shadow box (±shadowR around center) for one weather
  function applyWeather(t, center, shadowR) {
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - t.sun.el), THREE.MathUtils.degToRad(t.sun.az));
    const u = sky.material.uniforms; u.turbidity.value = t.turb; u.rayleigh.value = t.ray; u.mieCoefficient.value = 0.005; u.mieDirectionalG.value = 0.8; u.sunPosition.value.copy(sunDir);
    const envScene = new THREE.Scene(); envScene.add(sky); const rt = pmrem.fromScene(envScene); if (scene.environment) scene.environment.dispose(); scene.environment = rt.texture; scene.add(sky);
    const lightDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - Math.max(t.sun.el, 18)), THREE.MathUtils.degToRad(t.sun.az));
    sun.position.copy(center).addScaledVector(lightDir, 28); sun.target.position.copy(center); sun.color.set(t.sunColor); sun.intensity = t.sun.el < 12 ? 1.5 : 2.4;
    Object.assign(sun.shadow.camera, { left: -shadowR, right: shadowR, top: shadowR, bottom: -shadowR, near: 5, far: 60 }); sun.shadow.camera.updateProjectionMatrix();
    hemi.color.set(t.hemi[0]); hemi.groundColor.set(t.hemi[1]); hemi.intensity = t.hemi[2];
    scene.fog = new THREE.FogExp2(t.fog[0], t.fog[1]); renderer.toneMappingExposure = t.exposure;
    const wu = ocean.material.uniforms; wu.uDeep.value.set(t.water[0]); wu.uShallow.value.set(t.water[1]); wu.uSky.value.set(t.fog[0]); wu.uSunDir.value.copy(sunDir); wu.uFogColor.value.set(t.fog[0]); wu.uFogDensity.value = t.fog[1];
    return lightDir;
  }
  function load(snapshot, themeName) {
    state = snapshot; theme = THEMES[themeName] ? themeName : "sand"; th = THEMES[theme]; bubble = null; cancelFlag = false;
    if (!ok) return;
    stopRoam(); setSize(LEVEL_W, LEVEL_H); clearWorld();
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
    edgeLabels = [];
    for (let x = 0; x < w; x++) { const l = label(String(x), x, -0.95, 0.56); edgeLabels.push(l); world.add(l); }
    for (let y = 0; y < h; y++) { const l = label(String(y), -0.95, y, 0.56); edgeLabels.push(l); world.add(l); }
    trail = new THREE.Group(); world.add(trail); moveN = 0;
    for (const k in state.items) { const [x, y] = k.split(",").map(Number); const m = item(state.items[k]); m.position.set(x, 0, y); m.userData.phase = Math.random() * 6; world.add(m); items[k] = m; }
    for (const c of state.crabs || []) { const m = crabMesh(); m.position.set(c.x, 0, c.y); world.add(m); crabs[c.id] = m; }
    for (const p of state.props || []) { const m = propMesh(p); m.position.set(p.x, 0, p.y); world.add(m); propsList.push(m); }
    robot = robotMesh(); robot.position.set(state.robot.x, 0, state.robot.y); robot.rotation.y = -state.robot.dir * Math.PI / 2; world.add(robot);
    if (!state.hub) buildLevelLand(w, h); else { ocean.material.uniforms.uHas.value = 0; levelLand = null; }
    // weather
    const center = new THREE.Vector3(w / 2 - 0.5, 0, h / 2 - 0.5);
    applyWeather(th, center, Math.max(w, h) * 0.75 + 1.5);
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
  function frame(now) { requestAnimationFrame(frame); tick(now); }
  function tick(now) {
    if (!active || !(state || roam) || !canvas || canvas.offsetParent === null) { lastNow = now; return; }
    const dt = Math.min(0.05, (now - lastNow) / 1000 || 0.016); lastNow = now; clock += dt;
    ocean.material.uniforms.uTime.value = clock;
    if (roam) { roamFrame(dt); stepParticles(dt); if (quality === "realistic") composer.render(); else renderer.render(scene, camera); drawBubble(); drawPrompt(); drawHud(); return; }
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
    const lookP = new THREE.Vector3(cam.look.x, 0.2, cam.look.z);
    if (levelLand) { for (const t of levelLand.trees) { const c = t.userData.crown; c.rotation.z = Math.sin(clock * 1.1 + t.userData.phase) * 0.025; } if (levelLand.grass) { levelLand.grass.uni.uTime.value = clock; if (robot) levelLand.grass.uni.uBolt.value.copy(robot.position); } }
    // ride along: behind Bolt while the code runs, back to the planning view afterwards
    ride.k += ((ride.on && ride.playing ? 1 : 0) - ride.k) * Math.min(1, dt * 2.5);
    for (const l of edgeLabels) l.visible = ride.k < 0.3; // the coordinates are for planning; they would fill the screen up close
    if (robot && ride.k > 0.002) {
      const ry = robot.rotation.y, fx2 = Math.cos(ry), fz2 = -Math.sin(ry), want = Math.atan2(-fx2, -fz2);
      let d = want - ride.az; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; ride.az += d * Math.min(1, dt * 3);
      const rd = phone ? 5.2 : 4.4, re = 0.45, fp = new THREE.Vector3(robot.position.x + Math.sin(ride.az) * Math.cos(re) * rd, robot.position.y + 0.4 + Math.sin(re) * rd, robot.position.z + Math.cos(ride.az) * Math.cos(re) * rd);
      const e = ride.k * ride.k * (3 - 2 * ride.k); camera.position.lerp(fp, e); lookP.lerp(new THREE.Vector3(robot.position.x, robot.position.y + 0.5, robot.position.z), e);
    } else if (robot) { const ry = robot.rotation.y; ride.az = Math.atan2(-Math.cos(ry), Math.sin(ry)); }
    camera.lookAt(lookP);
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

  // ---------- free-roam Harbor Town ----------
  // The hub is not a grid. It is one island you drive around with the camera behind Bolt, like the lobby of a big
  // game: hub.js says where the fountain, shops, townsfolk, houses and portals stand (TOWN), this builds the island
  // around them, moves Bolt with real speed and turning, runs the chase camera, and tells hub.js who is close
  // enough to talk to. One unit here is one tile of a level, so Bolt is the same size in both.
  let roam = null;
  const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const HARBOR = { sun: { el: 21, az: 222 }, turb: 3, ray: 2.2, fog: [0xe8dcc6, 0.0055], hemi: [0xcfe3ff, 0xb59a6a, 0.55], water: [0x17567f, 0x5fc0dc], exposure: 0.66, sunColor: 0xffd9a8 };
  const PAD = { house: 2.3, tower: 2.0, lighthouse: 2.4, fountain: 3, stall: 1.7, portal: 1.9, npc: 1.1, sign: 1.0 }; // flat ground under things that must stand level
  // the island's shape: a wobbly coast, rolling ground, a few hills, a bay for the harbour, flat pads under buildings
  function makeHeight(town, flats) {
    const base = (x, z) => {
      const r = Math.hypot(x, z), a = Math.atan2(z, x), ph = town.seed || 0; // seed: a different coast and roll for each island
      const edge = town.radius + Math.sin(a * 3 + 1 + ph) * 1.6 + Math.sin(a * 5 + 2.2 + ph * 1.7) * 0.9;
      let y = 1 + 0.45 * Math.sin(x * 0.23 + 1.3 + ph) * Math.sin(z * 0.19 - 0.4 + ph * 0.6) + 0.2 * Math.sin(x * 0.61 - z * 0.37 + 0.5 + ph * 2.1);
      for (const h of town.hills) { const d = Math.hypot(x - h.x, z - h.z) / h.r; y += h.h * Math.exp(-d * d * 2); }
      const shore = smoothstep(edge - 6, edge + 3, r); y = y * (1 - shore) - 1.8 * shore;
      const b = Math.hypot(x - town.bay.x, z - town.bay.z) / town.bay.r; y -= 3.2 * Math.exp(-b * b * 1.2);
      return y;
    };
    const fl = flats.map(f => ({ ...f, y: f.y !== undefined ? f.y : base(f.x, f.z) }));
    return (x, z) => { let y = base(x, z); for (const f of fl) { const d = Math.hypot(x - f.x, z - f.z); if (d < f.r) y += (f.y - y) * (1 - smoothstep(f.r * 0.55, f.r, d)); } return y; };
  }
  function terrainMesh(town, height) {
    const S = town.size, seg = phone ? 100 : 140;
    const geo = new THREE.PlaneGeometry(S, S, seg, seg); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, n = pos.count, col = new Float32Array(n * 3), c = new THREE.Color();
    for (let i = 0; i < n; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals(); const nor = geo.attributes.normal;
    const spl = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), up = nor.getY(i);
      const sand = 1 - smoothstep(0.22, 0.6, y), rock = smoothstep(0.8, 0.62, up), meadow = smoothstep(0.2, 0.8, Math.sin(x * 0.21 + 1.7) * Math.sin(z * 0.17 - 0.6) + (y - 1.2) * 0.25) * (1 - sand);
      spl.set([sand * (1 - rock), (1 - sand) * (1 - meadow) * (1 - rock), meadow * (1 - rock), rock + 0.001], i * 4);
      const wet = y < 0.05 ? 0.72 + 0.28 * smoothstep(-0.6, 0.05, y) : 1; // sand under and at the waterline is darker
      const v = rnd(0.93, 1.04) * wet; col.set([v, v, v], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3)); geo.setAttribute("aSplat", new THREE.BufferAttribute(spl, 4));
    const m = new THREE.Mesh(geo, splatMaterial()); m.receiveShadow = true; return m;
  }
  // ---------- ground, grass, clouds: the look of the town ----------
  // Tileable ground textures are painted once in code (fractal noise plus a few strokes), then the terrain shader
  // blends sand, grass, meadow and rock by height and slope, sampled in world space so nothing stretches on hills.
  function fbmTex(size, paint) {
    const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d"), img = g.createImageData(size, size), d = img.data;
    const P = 32, grid = Array.from({ length: 4 }, () => Float32Array.from({ length: P * P }, () => Math.random()));
    // octave o has 4·2^o lattice cells across the texture and wraps at exactly that many, so the texture tiles
    const vn = (o, x, y) => { const per = 4 << o, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, q = grid[o], m = (a, b) => (((a % per) + per) % per) + (((b % per) + per) % per) * P;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), a = q[m(xi, yi)], b = q[m(xi + 1, yi)], cc = q[m(xi, yi + 1)], e = q[m(xi + 1, yi + 1)]; return a + (b - a) * sx + (cc - a) * sy + (a - b - cc + e) * sx * sy; };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let n = 0, amp = 0.5; for (let o = 0; o < 4; o++) { const per = 4 << o; n += vn(o, x / size * per, y / size * per) * amp; amp *= 0.5; }
      n = n / 0.9375;
      const [r, gg, b] = paint(n, x / size, y / size); const i = (y * size + x) * 4; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0); return { c, g };
  }
  let groundTex = null;
  function groundTextures() {
    if (groundTex) return groundTex; const S = phone ? 256 : 512, mk = (c) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
    const grass = fbmTex(S, n => [70 + n * 70, 120 + n * 80, 40 + n * 35]);
    for (let i = 0; i < S * 6; i++) { const x = Math.random() * S, y = Math.random() * S, l = 3 + Math.random() * 7, a = -Math.PI / 2 + (Math.random() - 0.5) * 0.9; grass.g.strokeStyle = Math.random() < 0.5 ? `rgba(40,80,20,${0.25 + Math.random() * 0.3})` : `rgba(190,220,120,${0.15 + Math.random() * 0.25})`; grass.g.lineWidth = 1; grass.g.beginPath(); grass.g.moveTo(x, y); grass.g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); grass.g.stroke(); }
    const sand = fbmTex(S, (n, u, v) => { const rip = 0.5 + 0.5 * Math.sin((v * 22 + n * 3.5) * Math.PI * 2); const k = 200 + n * 50 + rip * 14; return [k + 20, k + 6, k - 40]; });
    for (let i = 0; i < S * 2; i++) { sand.g.fillStyle = `rgba(${Math.random() < 0.5 ? "90,70,50" : "255,250,235"},${0.15 + Math.random() * 0.25})`; sand.g.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5); }
    const rock = fbmTex(S, n => { const k = 95 + n * 110; return [k + 6, k, k - 8]; });
    for (let i = 0; i < 40; i++) { rock.g.strokeStyle = `rgba(30,25,20,${0.2 + Math.random() * 0.3})`; rock.g.lineWidth = 1 + Math.random(); rock.g.beginPath(); let x = Math.random() * S, y = Math.random() * S; rock.g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; rock.g.lineTo(x, y); } rock.g.stroke(); }
    const meadow = fbmTex(S, n => [95 + n * 70, 125 + n * 60, 45 + n * 30]);
    for (let i = 0; i < S / 2; i++) { meadow.g.fillStyle = ["#f4f0e0", "#f2d24a", "#e88aa8", "#b39ddb"][i % 4]; meadow.g.beginPath(); meadow.g.arc(Math.random() * S, Math.random() * S, 1 + Math.random() * 1.6, 0, 7); meadow.g.fill(); }
    return groundTex = { grass: mk(grass.c), sand: mk(sand.c), rock: mk(rock.c), meadow: mk(meadow.c) };
  }
  function splatMaterial() {
    const T = groundTextures();
    const m = std({ color: 0xffffff, vertexColors: true, roughness: 0.93, map: T.grass });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { tSand: { value: T.sand }, tRock: { value: T.rock }, tMeadow: { value: T.meadow }, tGrass: { value: T.grass } });
      sh.vertexShader = "attribute vec4 aSplat; varying vec4 vSplat; varying vec3 vWp;\n" + sh.vertexShader.replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\n vSplat = aSplat; vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = "uniform sampler2D tSand, tRock, tMeadow, tGrass; varying vec4 vSplat; varying vec3 vWp;\n" + sh.fragmentShader.replace("#include <map_fragment>", `
        vec2 wuv = vWp.xz * 0.28;
        vec2 wuv2 = vWp.xz * 0.061 + 0.37; // a second, larger scale breaks up the tiling
        vec3 g = mix(texture2D(tGrass, wuv).rgb, texture2D(tGrass, wuv2).rgb, 0.35);
        vec3 s = mix(texture2D(tSand, wuv * 1.3).rgb, texture2D(tSand, wuv2).rgb, 0.3);
        vec3 r = mix(texture2D(tRock, wuv * 0.7).rgb, texture2D(tRock, wuv2).rgb, 0.3);
        vec3 md = texture2D(tMeadow, wuv).rgb;
        vec4 w = vSplat / max(0.001, vSplat.x + vSplat.y + vSplat.z + vSplat.w);
        vec3 ground = s * w.x + g * w.y + md * w.z + r * w.w;
        diffuseColor.rgb *= ground;
      `);
    };
    m.customProgramCacheKey = () => "splat";
    return m;
  }

  // grass: thousands of instanced blades that sway in the wind and bend away from Bolt
  function grassField(town, height, colliders, flats) {
    const N = phone ? 9000 : 32000, blade = new THREE.PlaneGeometry(0.045, 0.22, 1, 3); blade.translate(0, 0.11, 0);
    const pos = blade.attributes.position; for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); pos.setX(i, pos.getX(i) * (1 - y / 0.235)); } // taper to a point
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide, envMapIntensity: 0.3 });
    const uni = { uTime: { value: 0 }, uBolt: { value: new THREE.Vector3(0, -99, 0) } };
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = "uniform float uTime; uniform vec3 uBolt; varying float vH;\n" + sh.vertexShader
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          vH = position.y / 0.22;
          vec4 root = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float wind = sin(uTime * 1.6 + root.x * 0.35 + root.z * 0.22) * 0.5 + sin(uTime * 2.9 + root.x * 1.3) * 0.2;
          transformed.x += wind * 0.09 * vH * vH;
          transformed.z += wind * 0.04 * vH * vH;`)
        .replace("#include <project_vertex>", `
          vec4 mvPosition = vec4(transformed, 1.0);
          mvPosition = instanceMatrix * mvPosition;
          vec3 wpos = (modelMatrix * mvPosition).xyz; vec2 away = wpos.xz - uBolt.xz; float dB = length(away);
          float push = smoothstep(0.75, 0.15, dB) * vH; wpos.xz += normalize(away + 1e-4) * push * 0.22; wpos.y -= push * 0.18;
          mvPosition = viewMatrix * vec4(wpos, 1.0);
          gl_Position = projectionMatrix * mvPosition;`);
      sh.fragmentShader = "varying float vH;\n" + sh.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\n diffuseColor.rgb *= mix(vec3(0.26, 0.38, 0.13), vec3(0.6, 0.74, 0.34), vH);");
    };
    mat.customProgramCacheKey = () => "grass";
    const m = new THREE.InstancedMesh(blade, mat, N); m.receiveShadow = true; m.castShadow = false; m.frustumCulled = false;
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    let k = 0, tries = 0; const R = town.radius + 2, ox = town.cx || 0, oz = town.cz || 0;
    while (k < N && tries < N * 6) {
      tries++; const x = ox + (Math.random() * 2 - 1) * R, z = oz + (Math.random() * 2 - 1) * R, y = height(x, z);
      if (y < 0.45) continue; // no grass on sand
      if (Math.hypot(x - town.plaza.x, z - town.plaza.z) < town.plaza.r + 0.3) continue;
      if (flats.some(f => f.r < 3 && Math.hypot(x - f.x, z - f.z) < f.r * 0.6)) continue; // keep paving and doorsteps clear
      if (colliders.some(c => Math.hypot(x - c.x, z - c.z) < c.r * 0.8)) continue;
      const e = 0.3, sl = Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e); if (sl > 0.7) continue;
      // clumps: denser where a slow noise is high
      const clump = 0.5 + 0.5 * Math.sin(x * 0.7 + Math.sin(z * 0.5) * 2) * Math.sin(z * 0.6 + 1.3); if (Math.random() > 0.55 + clump * 0.45) continue;
      q.setFromAxisAngle(up, Math.random() * Math.PI); const s = 0.55 + Math.random() * 0.7 + clump * 0.35; sc.set(1 + Math.random() * 0.6, s, 1); p.set(x, y - 0.02, z);
      M.compose(p, q, sc); m.setMatrixAt(k, M); col.setHSL(0.22 + Math.random() * 0.06, 0.5 + Math.random() * 0.2, 0.45 + Math.random() * 0.2); m.setColorAt(k, col); k++;
    }
    m.count = k; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    return { mesh: m, uni };
  }
  // a height texture of the island, so the water knows how deep it is (shallow turquoise, foam on the shore)
  function heightTexture(town, height) {
    const n = 192, data = new Float32Array(n * n), S = town.size * 1.6, half = S / 2;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) data[j * n + i] = height(-half + (i + 0.5) / n * S, -half + (j + 0.5) / n * S);
    const t = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.FloatType); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
    return { tex: t, half, size: S };
  }
  // soft clouds drifting on a high sky plane
  function cloudLayer() {
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uCover: { value: 0 } },
      vertexShader: "varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
      fragmentShader: `uniform float uTime, uNight, uCover; varying vec2 vUv; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += n(p) * a; p *= 2.03; a *= 0.5; } return v; }
        void main(){ vec2 p = vW.xz * 0.012 + vec2(uTime * 0.004, uTime * 0.0015); float c = smoothstep(0.52 - uCover * 0.42, 0.78 - uCover * 0.3, fbm(p));
          float edge = 1.0 - smoothstep(0.25, 0.5, length(vUv - 0.5)); vec3 col = mix(vec3(0.82, 0.85, 0.9), vec3(1.0, 0.98, 0.94), fbm(p * 2.0 + 3.0));
          col = mix(col, vec3(0.42, 0.45, 0.5), uCover * 0.7); col = mix(col, vec3(0.12, 0.15, 0.24), uNight * 0.85); gl_FragColor = vec4(col, c * edge * 0.85); }` });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), mat); m.rotation.x = Math.PI / 2; m.position.y = 70; m.renderOrder = -1; return m;
  }
  // final look: a touch of contrast and warmth, and a soft vignette
  const GradeShader = { uniforms: { tDiffuse: { value: null }, uVig: { value: 0.32 }, uSat: { value: 1.08 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig, uSat; varying vec2 vUv;
      void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.299, 0.587, 0.114)); c.rgb = mix(vec3(l), c.rgb, uSat);
        c.rgb = (c.rgb - 0.5) * 1.05 + 0.5; c.rgb *= vec3(1.02, 1.0, 0.97);
        float v = smoothstep(0.85, 0.2, length(vUv - 0.5) * 1.1); c.rgb *= mix(1.0 - uVig, 1.0, v); gl_FragColor = c; }` };

  // cut-stone paving for the plaza: offset rows of rounded stones, each a slightly different grey, with mortar
  let pavingTex = null;
  function paving() {
    if (pavingTex) return pavingTex; const S = 512, c = document.createElement("canvas"); c.width = c.height = S; const g = c.getContext("2d");
    g.fillStyle = "#6b655c"; g.fillRect(0, 0, S, S);
    const rows = 14, rh = S / rows;
    for (let r = 0; r < rows; r++) {
      let x = -Math.random() * 40; const y = r * rh;
      while (x < S) {
        const w = 28 + Math.random() * 34, k = 150 + Math.random() * 50, t = Math.random() * 14 - 7;
        for (const ox of [0, -S, S]) { // wrap left/right so the texture tiles
          g.fillStyle = `rgb(${k + t},${k + t * 0.6},${k - 8})`; g.beginPath(); g.roundRect(x + ox + 2, y + 2, w - 4, rh - 4, 6); g.fill();
          g.fillStyle = "rgba(255,255,255,0.10)"; g.beginPath(); g.roundRect(x + ox + 3, y + 3, w - 8, 4, 3); g.fill();
          g.fillStyle = "rgba(0,0,0,0.12)"; g.beginPath(); g.roundRect(x + ox + 4, y + rh - 8, w - 8, 4, 3); g.fill();
        }
        x += w;
      }
    }
    const img = g.getImageData(0, 0, S, S), d = img.data; for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 18; d[i] += n; d[i + 1] += n; d[i + 2] += n; } g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return pavingTex = t;
  }
  // leafy trees: a tapered trunk with branches and a crown of leaf cards (alpha-cut pictures of leaves)
  const leafTexCache = {};
  function leafTex(apples) {
    const key = apples ? "a" : "l"; if (leafTexCache[key]) return leafTexCache[key];
    const S = 256, c = document.createElement("canvas"); c.width = c.height = S; const g = c.getContext("2d");
    for (let i = 0; i < 170; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * S * 0.44, x = S / 2 + Math.cos(a) * rr, y = S / 2 + Math.sin(a) * rr, l = 10 + Math.random() * 12;
      const h = 85 + Math.random() * 35, li = 22 + Math.random() * 26; g.fillStyle = `hsl(${h},${45 + Math.random() * 20}%,${li}%)`;
      g.save(); g.translate(x, y); g.rotate(Math.random() * Math.PI * 2); g.beginPath(); g.ellipse(0, 0, l, l * 0.42, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = `hsla(${h},40%,${li + 14}%,0.6)`; g.lineWidth = 1; g.beginPath(); g.moveTo(-l, 0); g.lineTo(l, 0); g.stroke(); g.restore();
    }
    if (apples) for (let i = 0; i < 14; i++) { const x = S * 0.15 + Math.random() * S * 0.7, y = S * 0.15 + Math.random() * S * 0.7; const gr = g.createRadialGradient(x - 2, y - 2, 1, x, y, 8); gr.addColorStop(0, "#ff8a7a"); gr.addColorStop(0.5, "#d42a20"); gr.addColorStop(1, "#7a120c"); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return leafTexCache[key] = t;
  }
  let barkTex = null;
  function bark() { if (!barkTex) { const b = fbmTex(128, (n, u) => { const k = 70 + n * 60 + Math.sin(u * 40 + n * 6) * 12; return [k, k * 0.78, k * 0.6]; }); barkTex = new THREE.CanvasTexture(b.c); barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping; barkTex.colorSpace = THREE.SRGBColorSpace; } return barkTex; }
  function leafyTree(size, apples) {
    const g = new THREE.Group(), barkM = std({ color: 0xffffff, map: bark(), roughness: 0.95 });
    const leafM = new THREE.MeshStandardMaterial({ map: leafTex(apples), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, envMapIntensity: 0.3 });
    const h = size * 0.55;
    const trunk = mesh(new THREE.CylinderGeometry(0.05 * size, 0.09 * size, h, 8), barkM, 0, h / 2, 0); trunk.rotation.z = rnd(-0.06, 0.06); g.add(trunk);
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + rnd(-0.4, 0.4), br = mesh(new THREE.CylinderGeometry(0.02 * size, 0.04 * size, size * 0.35, 6), barkM, Math.cos(a) * 0.1 * size, h * 0.85, Math.sin(a) * 0.1 * size); br.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8); g.add(br); }
    const crown = new THREE.Group(); crown.position.y = h + size * 0.22; g.add(crown); g.userData.crown = crown;
    const cards = phone ? 22 : 38, card = new THREE.PlaneGeometry(size * 0.55, size * 0.55);
    for (let i = 0; i < cards; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, rr = Math.cbrt(Math.random()) * size * 0.42, s = Math.sqrt(1 - u * u);
      const m = mesh(card, leafM, Math.cos(th) * s * rr, u * rr * 0.75, Math.sin(th) * s * rr); m.rotation.set(rnd(0, 3.14), rnd(0, 3.14), rnd(0, 3.14)); crown.add(m);
    }
    g.userData.phase = Math.random() * 6; return g;
  }
  // ---------- levels as places: an island around every board, and a camera that rides along ----------
  // The board keeps its countable tiles, but it now sits in a real landscape in the zone's colours: rolling ground,
  // grass, trees and rocks, a beach and surf. While the code runs the camera follows Bolt from behind; when the
  // run ends it eases back to the overhead planning view.
  const LAND = {
    sand:    { tint: 0xe6dccb, sandTo: 0.55, trees: 10, rocks: 8, apples: false },
    grass:   { tint: 0xffffff, sandTo: 0.3,  trees: 22, rocks: 4, apples: true },
    stone:   { tint: 0xc4c8cc, sandTo: 0.25, trees: 6,  rocks: 16, apples: false },
    wood:    { tint: 0xffe0b8, sandTo: 0.35, trees: 14, rocks: 6, apples: false },
    crystal: { tint: 0xa8d8d4, sandTo: 0.3,  trees: 8,  rocks: 10, apples: false, crystals: 10 },
    ice:     { tint: 0xeef6ff, sandTo: 0.3,  trees: 8,  rocks: 8, apples: false, snow: true },
  };
  let levelLand = null, edgeLabels = [];
  function buildLevelLand(w, h) {
    const L = LAND[theme] || LAND.sand, cx = w / 2 - 0.5, cz = h / 2 - 0.5, R = Math.max(w, h) * 0.6 + 7;
    const inBoard = (x, z, m) => x > -0.5 - m && x < w - 0.5 + m && z > -0.5 - m && z < h - 0.5 + m;
    const seed = w * 13 + h * 7 + theme.length; let sd = seed; const rand = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    const hills = Array.from({ length: 5 }, () => { const a = rand() * 6.28, d = R * (0.55 + rand() * 0.3); return { x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, r: 2.5 + rand() * 3, h: 0.6 + rand() * 1.4 }; });
    const height = (x, z) => {
      const dx = x - cx, dz = z - cz, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx), edge = R + Math.sin(a * 3 + seed) * 1.4 + Math.sin(a * 5 + 1) * 0.8;
      let y = 0.55 + 0.3 * Math.sin(x * 0.4 + 1) * Math.sin(z * 0.33 - 0.5);
      for (const hl of hills) { const d = Math.hypot(x - hl.x, z - hl.z) / hl.r; y += hl.h * Math.exp(-d * d * 2); }
      const shore = smoothstep(edge - 4, edge + 2, r); y = y * (1 - shore) - 1.6 * shore;
      // the board sits on a flat shelf just under its tiles
      const bx = Math.max(-0.5 - x, 0, x - (w - 0.5)), bz = Math.max(-0.5 - z, 0, z - (h - 0.5)), bd = Math.hypot(bx, bz);
      const k = smoothstep(0.9, 3.2, bd); return -0.05 * (1 - k) + y * k;
    };
    const town = { size: R * 2 + 12 };
    const terr = terrainMesh(town, (x, z) => height(x + cx, z + cz)); terr.position.set(cx, 0, cz);
    // zone colouring on top of the painted ground
    const col = terr.geometry.attributes.color, tint = new THREE.Color(L.tint), spl = terr.geometry.attributes.aSplat, P = terr.geometry.attributes.position;
    for (let i = 0; i < col.count; i++) {
      col.setXYZ(i, col.getX(i) * tint.r, col.getY(i) * tint.g, col.getZ(i) * tint.b);
      const y = P.getY(i), sand = 1 - smoothstep(L.sandTo - 0.3, L.sandTo + 0.1, y);
      if (L.snow) spl.setXYZW(i, 0.2 + sand, 0.02, 0.02, spl.getW(i)); // pale, sandy-white ground for the winter island
      else if (y < L.sandTo + 0.2) spl.setXYZW(i, Math.max(spl.getX(i), sand), spl.getY(i) * (1 - sand), spl.getZ(i) * (1 - sand), spl.getW(i));
    }
    if (L.snow) for (let i = 0; i < col.count; i++) col.setXYZ(i, 1.35, 1.38, 1.45);
    col.needsUpdate = true; spl.needsUpdate = true;
    world.add(terr);
    const colliders = [], flats = [], put = (m, x, z) => { m.position.set(x, height(x, z) - 0.05, z); world.add(m); return m; };
    const spot = (margin) => { for (let t = 0; t < 60; t++) { const a = rand() * 6.28, d = rand() * (R - 2), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; const front = z > h - 1 && Math.abs(x - cx) < w * 0.5 + 7; // the camera looks from the south: keep that side open
        if (!front && !inBoard(x, z, margin) && height(x, z) > 0.35 && !colliders.some(c => Math.hypot(c.x - x, c.z - z) < c.r + 0.8)) return { x, z }; } return null; };
    const trees = [];
    for (let i = 0; i < (phone ? Math.ceil(L.trees / 2) : L.trees); i++) { const s = spot(2.2); if (!s) continue; const t = leafyTree(2.2 + rand() * 1.4, L.apples && rand() < 0.6); t.rotation.y = rand() * 6; if (L.snow) t.userData.crown.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(0xd8ecf0); } }); put(t, s.x, s.z); trees.push(t); colliders.push({ x: s.x, z: s.z, r: 0.4 }); }
    for (let i = 0; i < L.rocks; i++) { const s = spot(1.6); if (!s) continue; const m = wall("rock", 0x8f7a5e); m.scale.setScalar(1.2 + rand() * 1.4); m.rotation.y = rand() * 6; put(m, s.x, s.z); colliders.push({ x: s.x, z: s.z, r: 0.6 }); }
    for (let i = 0; i < (L.crystals || 0); i++) { const s = spot(1.6); if (!s) continue; const m = wall("crystal", 0x8ff0f4); m.scale.setScalar(1.2 + rand()); put(m, s.x, s.z); colliders.push({ x: s.x, z: s.z, r: 0.5 }); }
    let grass = null;
    if (!L.snow && theme !== "stone") {
      grass = grassField({ radius: R, cx, cz, plaza: { x: 1e6, z: 1e6, r: 0 } }, (x, z) => (inBoard(x, z, 1.2) ? -9 : height(x, z)), colliders, flats);
      grass.mesh.position.set(0, 0, 0); world.add(grass.mesh);
    }
    const ht = heightTexture(town, (x, z) => height(x + cx, z + cz));
    const u = ocean.material.uniforms; u.uHT.value = ht.tex; u.uHas.value = 1; u.uHHalf.value = ht.half; u.uHSize.value = ht.size; u.uHOff.value.set(cx, cz);
    if (levelLand && levelLand.ht) levelLand.ht.tex.dispose();
    levelLand = { trees, grass, ht };
  }
  // follow camera during a run
  const ride = { on: true, k: 0, playing: false, az: 0, el: 0.5, dist: 5 };
  function setFollow(on) { ride.on = !!on; }
  // ---------- day and night in Harbor Town ----------
  // A town day lasts DAY_SECONDS. The sun rises in the east, sets in gold, the lamps and windows come on, the moon
  // takes over with cool blue light, stars come out, and the morning comes round again. Levels keep their own
  // fixed weather so puzzles always read clearly. ⚙️ Settings → Time of day can pin the clock.
  const DAY_SECONDS = 600;
  let townTime = 0.36; // 0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset; carries over between visits
  let timeMode = "cycle"; // "cycle" | "day" | "sunset" | "night"
  function setTimeMode(m) { timeMode = m || "cycle"; if (timeMode === "day") townTime = 0.42; if (timeMode === "sunset") townTime = 0.73; if (timeMode === "night") townTime = 0.02; if (roam) roam.todT = 99; }
  function makeStars() {
    const N = 1800, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const u = Math.random(), th = Math.random() * Math.PI * 2, y = 0.08 + u * 0.92, s = Math.sqrt(1 - y * y); pos.set([Math.cos(th) * s * 300, y * 300, Math.sin(th) * s * 300], i * 3); const b = 0.5 + Math.random() * 0.5, t = Math.random(); col.set([b * (0.85 + t * 0.15), b * 0.9, b], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const m = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    m.frustumCulled = false; m.renderOrder = -2; return m;
  }
  function moonMesh() { const m = new THREE.Mesh(new THREE.SphereGeometry(6, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf2f0e6, fog: false, transparent: true })); m.renderOrder = -1; return m; }
  const C = (h) => new THREE.Color(h), mixC = (a, b, k) => a.clone().lerp(b, Math.min(1, Math.max(0, k)));
  const TOD = { noonSun: C(0xfff2dc), lowSun: C(0xffa860), moon: C(0x9db4ff), dayFog: C(0xe8dcc6), duskFog: C(0xeab28a), nightFog: C(0x0f1828), daySky: C(0xcfe3ff), nightSky: C(0x2a3a66), dayGround: C(0xb59a6a), nightGround: C(0x15141c) };
  function applyTimeOfDay(r, full) {
    const t = townTime, el = 68 * Math.sin((t - 0.25) * Math.PI * 2), az = 90 + t * 360; // east at sunrise, west at sunset
    const day = smoothstep(-6, 10, el), low = 1 - smoothstep(4, 28, el), night = 1 - smoothstep(-10, -1, el);
    // the sky shader follows the real sun; under the horizon it darkens to night by itself
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - el), THREE.MathUtils.degToRad(az));
    const u = sky.material.uniforms; u.sunPosition.value.copy(sunDir); u.turbidity.value = 3 + low * 5; u.rayleigh.value = 2.2 + low * 1.2;
    // the light that casts shadows: the sun by day, the moon (opposite side, never too low) by night
    const moonEl = THREE.MathUtils.clamp(-el, 25, 60);
    const lightDir = day > 0.02 ? new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - Math.max(el, 8)), THREE.MathUtils.degToRad(az)) : new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - moonEl), THREE.MathUtils.degToRad(az + 180));
    r.lightDir = lightDir;
    const wet = rainNow; u.turbidity.value += wet * 8;
    sun.color.copy(day > 0.02 ? mixC(TOD.noonSun, TOD.lowSun, low) : TOD.moon); sun.intensity = (day > 0.02 ? 2.5 * day : 0.8 * night) * (1 - 0.72 * wet);
    hemi.color.copy(mixC(TOD.daySky, TOD.nightSky, 1 - day)); hemi.groundColor.copy(mixC(TOD.dayGround, TOD.nightGround, 1 - day)); hemi.intensity = (0.38 + 0.17 * day) * (1 - 0.35 * rainNow);
    const fog = mixC(mixC(mixC(TOD.dayFog, TOD.duskFog, low * day), C(0x9aa3ad), wet * 0.75), TOD.nightFog, 1 - day); scene.fog.color.copy(fog); if (r.fogBase === undefined) r.fogBase = scene.fog.density; scene.fog.density = r.fogBase * (1 + 2.4 * wet);
    r.baseExposure = 0.66 + 0.3 * (1 - day) - 0.15 * wet * day; renderer.toneMappingExposure = r.baseExposure;
    const wu = ocean.material.uniforms; wu.uSky.value.copy(fog); wu.uFogColor.value.copy(fog); wu.uSunDir.value.copy(day > 0.02 ? sunDir : lightDir);
    wu.uDeep.value.copy(mixC(C(0x17567f), C(0x061a2c), 1 - day)); wu.uShallow.value.copy(mixC(C(0x5fc0dc), C(0x1a4a5c), 1 - day));
    r.stars.material.opacity = night; r.moon.material.opacity = night; r.moonDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - moonEl), THREE.MathUtils.degToRad(az + 180));
    r.clouds.material.uniforms.uNight.value = 1 - day; r.clouds.material.uniforms.uCover.value = wet;
    // lamps and cottage windows: on from dusk to dawn
    const lit = 1 - smoothstep(-2, 8, el);
    for (const l of r.lamps) { l.light.intensity = 0.2 + lit * 3.2; l.bulb.emissiveIntensity = 0.6 + lit * 2.6; }
    for (const h of r.houseLights) h.intensity = 0.4 + lit * 3;
    for (const w of r.windows) w.material.emissiveIntensity = lit * 2.2;
    if (full) { const envScene = new THREE.Scene(); envScene.add(sky); const rt = pmrem.fromScene(envScene); if (scene.environment) scene.environment.dispose(); scene.environment = rt.texture; scene.add(sky); }
  }
  function tickTime(r, dt) {
    if (timeMode === "cycle" && !r.photo) townTime = (townTime + dt / DAY_SECONDS) % 1; // the clock stops while you take a photo
    r.todT = (r.todT || 0) + dt; r.envT = (r.envT || 0) + dt;
    if (r.todT > 0.25) { const full = r.envT > 4; r.todT = 0; if (full) r.envT = 0; applyTimeOfDay(r, full); }
    r.stars.position.copy(camera.position); r.moon.position.copy(camera.position).addScaledVector(r.moonDir, 250);
  }
  // ---------- interiors: rooms you can drive into ----------
  // A building's door in town is a prop of kind "door"; driving through it swaps the town for a furnished room
  // built here from a small description in hub.js (INTERIORS): size, style, where the people and the things you
  // can use stand. The wall between the camera and Bolt fades out so you can always see him.
  function plasterTex(hex) { const key = "plaster" + hex; if (texCache[key]) return texCache[key]; const b = fbmTex(256, n => { const c = new THREE.Color(hex); const k = 0.88 + n * 0.2; return [c.r * 255 * k, c.g * 255 * k, c.b * 255 * k]; }); const t = new THREE.CanvasTexture(b.c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return texCache[key] = t; }
  function gearMesh(r, teeth, color) {
    const g = new THREE.Group(), m = std({ color, metalness: 0.85, roughness: 0.35 });
    const ring = mesh(new THREE.CylinderGeometry(r, r, 0.12, 40), m); ring.rotation.x = Math.PI / 2; g.add(ring);
    const hub = mesh(new THREE.CylinderGeometry(r * 0.25, r * 0.25, 0.2, 20), std({ color: 0x3a3226, metalness: 0.6, roughness: 0.5 })); hub.rotation.x = Math.PI / 2; g.add(hub);
    for (let i = 0; i < teeth; i++) { const a = i / teeth * Math.PI * 2, t = mesh(new THREE.BoxGeometry(r * 0.16, r * 0.22, 0.12), m, Math.cos(a) * (r + r * 0.08), Math.sin(a) * (r + r * 0.08), 0); t.rotation.z = a + Math.PI / 2; g.add(t); }
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, s = mesh(new THREE.BoxGeometry(r * 0.75, r * 0.07, 0.08), m, Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, 0); s.rotation.z = a; g.add(s); }
    return g;
  }
  function bannerTex(lines, bg) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 512; const g = c.getContext("2d"); g.fillStyle = bg; g.fillRect(0, 0, 256, 512);
    g.strokeStyle = "#e6c36a"; g.lineWidth = 6; g.strokeRect(10, 10, 236, 492); g.fillStyle = "#f4e6c0"; g.font = "700 26px monospace"; g.textAlign = "center";
    lines.forEach((l, i) => { g.beginPath(); g.arc(128, 70 + i * 80, 12, 0, 7); g.fill(); if (i < lines.length - 1) g.fillRect(126, 82 + i * 80, 4, 56); g.fillText(l, 128, 112 + i * 80); });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function furniture(kind) {
    const g = new THREE.Group(), wood = std({ color: 0xffffff, map: texture("planks", 0x8a5a3a), roughness: 0.85 }), dark = std({ color: 0x3b2a1f, roughness: 0.8 }), iron = std({ color: 0x3a3f47, metalness: 0.7, roughness: 0.45 });
    if (kind === "bench") {
      g.add(mesh(new THREE.BoxGeometry(2.4, 0.12, 1.0), wood, 0, 0.9, 0)); for (const x of [-1.1, 1.1]) for (const z of [-0.4, 0.4]) g.add(mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), dark, x, 0.45, z));
      g.add(mesh(new THREE.BoxGeometry(0.5, 0.25, 0.3), iron, -0.7, 1.08, 0)); { const o = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), iron, 0.3, 1.0, 0.1); o.rotation.z = 1.2; g.add(o); }
      g.add(mesh(new THREE.BoxGeometry(0.3, 0.06, 0.2), std({ color: 0xc8553d }), 0.75, 0.99, -0.2));
    } else if (kind === "toolwall") {
      g.add(mesh(new THREE.BoxGeometry(3, 1.6, 0.06), std({ color: 0xc9a77a, roughness: 0.9 }), 0, 1.7, 0));
      for (let i = 0; i < 9; i++) { const x = -1.2 + (i % 5) * 0.6, y = 1.2 + Math.floor(i / 5) * 0.8; g.add(mesh(new THREE.BoxGeometry(0.06, 0.4, 0.04), iron, x, y, 0.06)); g.add(mesh(new THREE.BoxGeometry(0.2, 0.08, 0.06), i % 2 ? std({ color: 0xb03a26 }) : iron, x, y + 0.22, 0.06)); }
    } else if (kind === "anvil") {
      g.add(mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.5, 10), dark, 0, 0.25, 0)); g.add(mesh(new THREE.BoxGeometry(0.8, 0.22, 0.32), iron, 0, 0.6, 0)); { const o = mesh(new THREE.ConeGeometry(0.16, 0.36, 8), iron, 0.52, 0.62, 0); o.rotation.z = -Math.PI / 2; g.add(o); }
    } else if (kind === "barrel") {
      const b = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.9, 16), wood, 0, 0.45, 0); g.add(b); for (const y of [0.15, 0.75]) { const o = mesh(new THREE.TorusGeometry(0.345, 0.02, 6, 20), iron, 0, y, 0); o.rotation.x = Math.PI / 2; g.add(o); }
    } else if (kind === "shelf") {
      for (const y of [0.4, 1.1, 1.8]) g.add(mesh(new THREE.BoxGeometry(2, 0.06, 0.45), wood, 0, y, 0)); for (const x of [-0.97, 0.97]) g.add(mesh(new THREE.BoxGeometry(0.06, 2.2, 0.45), dark, x, 1.1, 0));
      for (let i = 0; i < 14; i++) { const y = [0.4, 1.1, 1.8][i % 3] + 0.15, x = -0.8 + (i * 0.37) % 1.6; g.add(mesh(new THREE.BoxGeometry(0.12 + Math.random() * 0.1, 0.24 + Math.random() * 0.1, 0.3), std({ color: new THREE.Color().setHSL(Math.random(), 0.45, 0.4) }), x, y, 0)); }
    } else if (kind === "fireplace") {
      const st = std({ color: 0xffffff, map: texture("cobble", 0x8d8578), roughness: 0.95 });
      g.add(mesh(new THREE.BoxGeometry(1.8, 1.4, 0.6), st, 0, 0.7, 0)); g.add(mesh(new THREE.BoxGeometry(1.0, 0.8, 0.62), std({ color: 0x120c08 }), 0, 0.45, 0.01));
      const fire = mesh(new THREE.ConeGeometry(0.25, 0.5, 8), std({ color: 0xffa040, emissive: 0xff6a10, emissiveIntensity: 3, transparent: true, opacity: 0.9 }), 0, 0.35, 0.15); g.add(fire); g.userData.fire = fire;
      const l = new THREE.PointLight(0xff8a3a, 3, 8, 2); l.position.set(0, 0.6, 0.6); g.add(l); g.userData.light = l;
    } else if (kind === "lift") {
      g.add(mesh(new THREE.BoxGeometry(1.4, 0.12, 1.0), iron, 0, 0.5, 0)); for (const x of [-0.6, 0.6]) g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), iron, x, 0.25, 0));
      const bot = new THREE.Group(); useAsset(bot, "bolt", () => robotShape(bot)); bot.position.set(0, 0.56, 0); bot.rotation.y = 0.6; g.add(bot);
    } else if (kind === "pendulum") {
      const p = new THREE.Group(); p.position.y = 3.2; g.add(p); p.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 6), std({ color: 0xc9a227, metalness: 0.9, roughness: 0.3 }), 0, -1.1, 0)); p.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 24), std({ color: 0xe6b422, metalness: 0.9, roughness: 0.25 }), 0, -2.25, 0)).rotation.x = Math.PI / 2; g.userData.swing = p;
    } else if (kind === "desk") {
      g.add(mesh(new THREE.BoxGeometry(1.6, 0.08, 0.8), wood, 0, 0.78, 0)); for (const x of [-0.72, 0.72]) g.add(mesh(new THREE.BoxGeometry(0.1, 0.78, 0.7), dark, x, 0.39, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.25, 10), std({ color: 0xe6b422, metalness: 0.8, roughness: 0.3 }), 0.5, 0.95, 0)); g.add(mesh(new THREE.BoxGeometry(0.5, 0.04, 0.35), std({ color: 0xf2e8d0 }), -0.2, 0.84, 0));
    } else if (kind === "rug") {
      const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d"); x.fillStyle = "#7a2e2a"; x.fillRect(0, 0, 128, 128); x.strokeStyle = "#e6c36a"; x.lineWidth = 6; x.strokeRect(10, 10, 108, 108); x.strokeStyle = "#2e4a6a"; x.lineWidth = 4; x.strokeRect(24, 24, 80, 80);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const r = mesh(new THREE.PlaneGeometry(3, 2), std({ map: t, roughness: 1 }), 0, 0.012, 0); r.rotation.x = -Math.PI / 2; r.castShadow = false; g.add(r);
    } else if (kind === "counter") { // shop counter with brass scales and a jar of coins
      g.add(mesh(new THREE.BoxGeometry(3.2, 0.95, 0.7), wood, 0, 0.475, 0)); g.add(mesh(new THREE.BoxGeometry(3.4, 0.08, 0.85), dark, 0, 0.99, 0));
      const brass = std({ color: 0xc9a227, metalness: 0.9, roughness: 0.3 }); g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), brass, -0.9, 1.28, 0)); g.add(mesh(new THREE.BoxGeometry(0.62, 0.03, 0.03), brass, -0.9, 1.52, 0));
      for (const x of [-1.18, -0.62]) g.add(mesh(new THREE.CylinderGeometry(0.13, 0.08, 0.04, 14), brass, x, 1.34, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 14), std({ color: 0xbfe6ff, transparent: true, opacity: 0.4, roughness: 0.05 }), 0.9, 1.18, 0));
      for (let i = 0; i < 9; i++) g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 10), brass, 0.9 + rnd(-0.05, 0.05), 1.05 + i * 0.02, rnd(-0.05, 0.05)));
      g.add(mesh(new THREE.BoxGeometry(0.42, 0.03, 0.3), std({ color: 0xf2e8d0 }), 0.15, 1.04, 0.05));
    } else if (kind === "sacks") {
      const burlap = std({ color: 0xb89a6a, roughness: 1 }); for (const [x, z, k] of [[0, 0, 1], [0.52, 0.15, 0.9], [0.22, -0.45, 0.85]]) { const m = mesh(new THREE.SphereGeometry(0.32 * k, 12, 10), burlap, x, 0.3 * k, z); m.scale.set(1, 1.25, 1); g.add(m); g.add(mesh(new THREE.CylinderGeometry(0.07 * k, 0.11 * k, 0.12 * k, 8), burlap, x, 0.68 * k, z)); }
    } else if (kind === "crates") {
      const cm = std({ color: 0xffffff, map: texture("planks", 0xa8784f), roughness: 0.85 }); g.add(mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), cm, 0, 0.35, 0)); g.add(mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), cm, 0.75, 0.35, 0.05)); { const o = mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), cm, 0.35, 1.0, 0); o.rotation.y = 0.4; g.add(o); }
    } else if (kind === "fruit") { // a table heaped with apples and gems
      g.add(mesh(new THREE.BoxGeometry(1.6, 0.08, 0.8), wood, 0, 0.8, 0)); for (const x of [-0.7, 0.7]) for (const z of [-0.32, 0.32]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), dark, x, 0.4, z));
      const red = std({ color: 0xc8302a, roughness: 0.5 }), gem = std({ color: 0x8ff0f4, emissive: 0x2aa0b0, emissiveIntensity: 0.6, roughness: 0.15 });
      for (let i = 0; i < 18; i++) g.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), red, -0.65 + (i % 6) * 0.1, 0.9 + Math.floor(i / 6) * 0.05, -0.2 + Math.floor(i / 6) * 0.12));
      for (let i = 0; i < 6; i++) g.add(mesh(new THREE.OctahedronGeometry(0.07), gem, 0.3 + (i % 3) * 0.14, 0.92, -0.1 + Math.floor(i / 3) * 0.16));
    } else if (kind === "lantern") {
      g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.8, 4), iron, 0, 3.0, 0)); const bulb = std({ color: 0xffe2a8, emissive: 0xffb347, emissiveIntensity: 2.6 });
      g.add(mesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), bulb, 0, 2.5, 0)); const l = new THREE.PointLight(0xffc27a, 4, 9, 2); l.position.set(0, 2.4, 0); g.add(l);
    }
    return g;
  }
  function startInterior(room, hooks, pose) {
    stopRoam(); if (!ok) return;
    clearWorld(); state = null; bubble = null; cancelFlag = false;
    setSize(phone ? 600 : 960, phone ? 760 : 540); canvas.classList.add("roam");
    const Wd = room.w, Dp = room.d, RH = 3.2, half = { x: Wd / 2, z: Dp / 2 };
    const height = (x, z) => (Math.abs(x) < half.x - 0.05 && Math.abs(z) < half.z - 0.05 ? 0.01 : -1); // outside the walls counts as "water": Bolt cannot go there
    const r = roam = { town: { size: Math.max(Wd, Dp) + 4, spots: [] }, hooks, height, indoor: true, colliders: [], platforms: [], props: [], floats: [], beams: [], hands: [], fountains: [], trees: [], walls: [], gears: [], swings: [], fires: [],
      input: { x: 0, y: 0 }, vel: new THREE.Vector3(), yaw: pose ? pose.yaw : Math.PI / 2, lean: 0, near: null, latch: null, target: null, lastDrag: -9, dustT: 0, sprayT: 0 };
    // floor, walls with windows and beams
    const floorTex = (room.floor === "stone" ? paving() : texture("planks", 0x9a6a42)).clone(); floorTex.repeat.set(Wd / 1.5, Dp / 1.5); floorTex.needsUpdate = true;
    const floor = mesh(new THREE.PlaneGeometry(Wd, Dp), std({ color: 0xffffff, map: floorTex, roughness: 0.85 })); floor.rotation.x = -Math.PI / 2; floor.castShadow = false; world.add(floor); r.terrain = floor;
    const wallTex = plasterTex(room.wall || 0xe8dcc4).clone(); wallTex.repeat.set(3, 1); wallTex.needsUpdate = true;
    const day = smoothstep(-6, 10, 68 * Math.sin((townTime - 0.25) * Math.PI * 2));
    const glass = std({ color: 0xffffff, emissive: new THREE.Color(0xbfdcff).lerp(new THREE.Color(0x14203a), 1 - day), emissiveIntensity: 1.2, roughness: 0.2 });
    for (const [x, z, len, n] of [[0, -half.z, Wd, [0, 1]], [0, half.z, Wd, [0, -1]], [-half.x, 0, Dp, [1, 0]], [half.x, 0, Dp, [-1, 0]]]) {
      const g = new THREE.Group(), along = n[1] !== 0, mat = std({ color: 0xffffff, map: wallTex, roughness: 0.95, transparent: true });
      const wall = mesh(new THREE.BoxGeometry(along ? len : 0.2, RH, along ? 0.2 : len), mat, 0, RH / 2, 0); g.add(wall);
      const beamM = std({ color: 0x4a3324, roughness: 0.85, transparent: true }); g.add(mesh(new THREE.BoxGeometry(along ? len : 0.26, 0.2, along ? 0.26 : len), beamM, 0, RH - 0.1, 0)); g.add(mesh(new THREE.BoxGeometry(along ? len : 0.24, 0.14, along ? 0.24 : len), beamM, 0, 0.07, 0));
      for (let k = -1; k <= 1; k += 2) if (len > 7) { const wnd = mesh(new THREE.PlaneGeometry(1.0, 1.1), glass.clone(), along ? k * len * 0.28 : n[0] * 0.11, 1.8, along ? n[1] * 0.11 : k * len * 0.28); wnd.rotation.y = along ? (n[1] > 0 ? 0 : Math.PI) : (n[0] > 0 ? Math.PI / 2 : -Math.PI / 2); wnd.material.transparent = true; g.add(wnd); }
      g.position.set(x, 0, z); world.add(g); r.walls.push({ g, n: new THREE.Vector2(n[0], n[1]), p: new THREE.Vector2(x, z), mats: [] }); g.traverse(o => { if (o.isMesh) r.walls[r.walls.length - 1].mats.push(o.material); });
    }
    // furniture
    for (const f of room.things || []) {
      const m = furniture(f.kind); m.position.set(f.x, 0, f.z); m.rotation.y = f.ry || 0; if (f.s) m.scale.setScalar(f.s); world.add(m);
      if (f.r) r.colliders.push({ x: f.x, z: f.z, r: f.r });
      if (m.userData.swing) r.swings.push(m.userData.swing); if (m.userData.fire) r.fires.push(m.userData);
    }
    for (const gr of room.gears || []) { const gm = gearMesh(gr.r, gr.teeth, gr.color || 0xb08d3a); gm.position.set(gr.x, gr.y, gr.z); world.add(gm); r.gears.push({ m: gm, speed: gr.speed }); }
    for (const b of room.banners || []) { const m = mesh(new THREE.PlaneGeometry(0.9, 1.8), std({ map: bannerTex(b.lines, b.bg || "#2c3550"), roughness: 0.9 })); m.position.set(b.x, 1.9, b.z); m.rotation.y = b.ry || 0; m.castShadow = false; world.add(m); }
    // people and the things you can use
    const SCALE = { stall: 1.0, npc: 1.0, spot: 1, exit: 1 }, REACH = { stall: 0.9, npc: 0.45, spot: 0.7, exit: 0.6 };
    for (const p of room.props) {
      const m = propMesh(p), s = SCALE[p.kind] || 1; m.position.set(p.x, 0, p.z); m.rotation.y = p.ry !== undefined ? p.ry : Math.atan2(-p.x, half.z - 1 - p.z); m.scale.setScalar(s); world.add(m);
      m.userData.baseY = 0; m.userData.home = m.rotation.y; r.props.push({ p, m, r: REACH[p.kind] || 0.5, s, vis: m.userData.vis, phase: Math.random() * 6 });
      if (p.kind === "npc" || p.kind === "stall") r.colliders.push({ x: p.x, z: p.z, r: REACH[p.kind] });
    }
    for (const q of r.props) q.m.traverse(o => { if (o.isSprite) { o.material = o.material.clone(); o.material.sizeAttenuation = false; const asp = o.scale.x / o.scale.y; o.scale.set(0.055 * asp * H / W / q.s, 0.055 / q.s, 1); } });
    const south = r.walls.find(w => w.n.y < 0); for (const q of r.props) if (q.p.kind === "exit") { q.m.position.z = half.z - 0.14; q.m.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; south.mats.push(o.material); } else if (o.isSprite) o.visible = false; }); }
    robot = robotMesh(); const sx = pose ? pose.x : room.start.x, sz = pose ? pose.z : room.start.z; robot.position.set(sx, 0.01, sz); robot.rotation.y = r.yaw; world.add(robot); r.bolt = robot;
    buildWalkGrid(r); initPlay(r); for (const q of r.props) if ((q.p.kind === "exit") && Math.hypot(q.p.x - sx, q.p.z - sz) < 1.6) r.latch = q;
    r.movers = []; r.walkers = []; r.bots = []; r.gulls = []; r.crabs = []; r.tracks = makeTracks(); world.add(r.tracks.mesh); r.prevFwd = 0; r.pitch = 0;
    for (const q of r.props) if (q.p.kind === "npc" && q.vis) bindPerson(q.vis, q.vis.userData.modelName);
    // indoor light: warm lamps, a soft window light, no sky or sea
    sky.visible = false; ocean.visible = false; scene.background = new THREE.Color(0x15110d); scene.fog = new THREE.FogExp2(0x15110d, 0.02);
    sun.color.set(0xfff0d8); sun.intensity = 0.4 + day * 0.9; r.lightDir = new THREE.Vector3(0.5, 1, 0.35).normalize();
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 60 }); sun.shadow.camera.updateProjectionMatrix();
    hemi.color.set(0xffe6c8); hemi.groundColor.set(0x3a2a1e); hemi.intensity = 0.45; renderer.toneMappingExposure = 0.85;
    cam.az = Math.atan2(-Math.cos(r.yaw), Math.sin(r.yaw)); cam.el = 0.42; cam.dist = phone ? 5.2 : 4.6; cam.introK = 0.6; cam.look.set(sx, 0.9, sz);
  }
  function restoreOutdoor() { if (sky) sky.visible = true; if (ocean) ocean.visible = true; if (scene) scene.background = null; }
  function interiorFrame(r, dt) {
    // fade any wall the camera is behind, so Bolt is never hidden
    for (const w of r.walls) { const out = (camera.position.x - w.p.x) * w.n.x + (camera.position.z - w.p.y) * w.n.y < 0.3; const target = out ? 0.12 : 1; for (const m of w.mats) { m.opacity += (target - m.opacity) * Math.min(1, dt * 8); m.depthWrite = m.opacity > 0.9; } }
    for (const g of r.gears) g.m.rotation.z += g.speed * dt;
    for (const s of r.swings) s.rotation.z = Math.sin(clock * 1.6) * 0.35;
    for (const f of r.fires) { const k = 0.8 + Math.sin(clock * 13) * 0.1 + Math.sin(clock * 7.3) * 0.1; f.fire.scale.set(1, k, 1); f.light.intensity = 2.4 * k + 0.6; }
  }
  // town furniture that is not a level piece
  function lampMesh(withLight) {
    const g = new THREE.Group(), iron = std({ color: 0x2b2f36, metalness: 0.6, roughness: 0.5 });
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.08, 2.4, 8), iron, 0, 1.2, 0)); g.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.08, 8), iron, 0, 0.04, 0));
    const bulb = std({ color: 0xffe2a8, emissive: 0xffb347, emissiveIntensity: 2.4 }); g.add(mesh(new THREE.BoxGeometry(0.26, 0.3, 0.26), bulb, 0, 2.55, 0)); g.userData.bulb = bulb;
    g.add(mesh(new THREE.ConeGeometry(0.24, 0.16, 4), iron, 0, 2.78, 0));
    if (withLight) { const l = new THREE.PointLight(0xffb86b, 1.8, 7, 2); l.position.set(0, 2.5, 0); g.add(l); g.userData.light = l; }
    return g;
  }
  function dockMesh(len) {
    const g = new THREE.Group(), wood = std({ color: 0x8a6a48, roughness: 0.9, map: texture("planks", 0x8a6a48) });
    g.add(mesh(new THREE.BoxGeometry(2.6, 0.18, len), wood, 0, 0.3, len / 2));
    for (let z = 0.6; z < len; z += 2) for (const s of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.09, 0.1, 1.8, 8), std({ color: 0x5a4330 }), s * 1.2, -0.5, z));
    for (let z = 1; z < len; z += 2.5) g.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.5, 10), std({ color: 0x3b3f47, metalness: 0.5 }), 1.1, 0.64, z));
    return g;
  }
  function boatMesh(big) {
    const g = new THREE.Group(), hullC = big ? 0x3b2a1f : 0x6b4b32, hullM = std({ color: hullC, roughness: 0.8, map: texture("planks", hullC) });
    const hull = mesh(new THREE.CapsuleGeometry(0.5, 1.6, 6, 14), hullM, 0, 0.12, 0); hull.rotation.z = Math.PI / 2; hull.scale.set(0.6, 1, 0.8); g.add(hull);
    g.add(mesh(new THREE.BoxGeometry(2.2, 0.08, 0.76), std({ color: 0xa88a62, roughness: 0.9 }), 0, 0.4, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.6, 8), std({ color: 0x5a4330 }), 0.2, 1.6, 0));
    const sail = mesh(new THREE.PlaneGeometry(1.1, 1.6), std({ color: big ? 0x22232b : 0xf4ecd8, side: THREE.DoubleSide, roughness: 0.9 }), 0.78, 1.8, 0); sail.rotation.y = 0.25; g.add(sail);
    if (big) { g.add(mesh(new THREE.PlaneGeometry(0.55, 0.32), std({ color: 0x111111, side: THREE.DoubleSide }), 0.45, 2.95, 0)); g.add(mesh(new THREE.PlaneGeometry(0.2, 0.2), std({ color: 0xffffff, side: THREE.DoubleSide }), 0.45, 2.95, 0.005)); g.add(mesh(new THREE.SphereGeometry(0.12, 8, 6), std({ color: 0xffd866, emissive: 0xffb347, emissiveIntensity: 2 }), -0.9, 0.7, 0)); }
    g.scale.setScalar(big ? 2.2 : 1.1); return g;
  }
  // Bolt's own sailboat: a pointed V hull, a planked deck, a mainsail and jib angled so you see them from behind
  function sailboatMesh() {
    const g = new THREE.Group(), out = [[-1.5, -0.55], [0.5, -0.64], [1.25, -0.38], [1.7, 0], [1.25, 0.38], [0.5, 0.64], [-1.5, 0.55]];
    const shape = new THREE.Shape(out.map(([x, z]) => new THREE.Vector2(x, z)));
    const hg = new THREE.ExtrudeGeometry(shape, { depth: 0.56, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, steps: 3 }); hg.rotateX(-Math.PI / 2);
    const hp = hg.attributes.position; for (let i = 0; i < hp.count; i++) { const y = hp.getY(i), k = 0.45 + 0.55 * smoothstep(-0.05, 0.5, y); hp.setZ(i, hp.getZ(i) * k); if (hp.getX(i) > 1.2 && y < 0.3) hp.setX(i, hp.getX(i) - (0.3 - y) * 0.6); } hg.computeVertexNormals();
    const hull = mesh(hg, std({ color: 0xffffff, map: texture("planks", 0x2f5a7a), roughness: 0.7 }), 0, -0.1, 0); g.add(hull);
    const stripe = mesh(hg, std({ color: 0xf4ecd8, roughness: 0.6 })); stripe.scale.set(1.004, 0.12, 1.012); stripe.position.y = 0.36; g.add(stripe);
    const dg = new THREE.ShapeGeometry(shape); dg.rotateX(-Math.PI / 2); const deck = mesh(dg, std({ color: 0xffffff, map: texture("planks", 0xc9a46e), roughness: 0.85 }), 0, 0.5, 0); deck.scale.set(0.95, 1, 0.9); deck.castShadow = false; g.add(deck);
    const wood = std({ color: 0x5a4330, roughness: 0.8 }), cloth = std({ color: 0xf6efe0, side: THREE.DoubleSide, roughness: 0.9 });
    g.add(mesh(new THREE.CylinderGeometry(0.045, 0.06, 3.3, 10), wood, 0.55, 2.1, 0));
    const rig = new THREE.Group(); rig.position.set(0.55, 0, 0); rig.rotation.y = 0.5; g.add(rig);
    const boom = mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 8), wood, -0.95, 1.0, 0); boom.rotation.z = Math.PI / 2; rig.add(boom);
    const sailGeo = (pts) => { const sg = new THREE.BufferGeometry(), v = [], n = 6; for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) { const a = i / n, b = j / n, c = 1 - a - b; const x = pts[0][0] * c + pts[1][0] * a + pts[2][0] * b, y = pts[0][1] * c + pts[1][1] * a + pts[2][1] * b; v.push(x, y, Math.sin(Math.PI * (1 - c)) * Math.sin(Math.PI * Math.min(1, a + b)) * 0.12 * c * 4); } const idx = [], row = (i) => i * (n + 1) - (i * (i - 1)) / 2; for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) { const p0 = row(i) + j, p1 = row(i + 1) + j, p2 = p0 + 1; idx.push(p0, p1, p2); if (j < n - i - 1) idx.push(p2, p1, p1 + 1); } sg.setAttribute("position", new THREE.Float32BufferAttribute(v, 3)); sg.setIndex(idx); sg.computeVertexNormals(); return sg; };
    const main = mesh(sailGeo([[0, 1.05], [0, 3.6], [-1.85, 1.05]]), cloth); rig.add(main);
    const jib = mesh(sailGeo([[0.08, 0.75], [0.08, 3.2], [1.05, 0.75]]), cloth); jib.rotation.y = -0.35; g.add(jib); jib.position.x = 0.55;
    const flag = mesh(new THREE.PlaneGeometry(0.42, 0.2), std({ color: 0xc8553d, side: THREE.DoubleSide }), 0.76, 3.6, 0); g.add(flag); g.userData.flag2 = flag;
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.5, 0.28), wood, -1.55, 0.05, 0));
    return g;
  }
  function lighthouseMesh() {
    const g = new THREE.Group(), white = std({ color: 0xf3efe6, roughness: 0.8 }), red = std({ color: 0xc8402f, roughness: 0.8 });
    g.add(mesh(new THREE.CylinderGeometry(1.0, 1.4, 1.2, 20), std({ color: 0x8d8578, roughness: 1, map: texture("cobble", 0x8d8578) }), 0, 0.5, 0));
    for (let i = 0; i < 4; i++) g.add(mesh(new THREE.CylinderGeometry(0.62 - i * 0.05, 0.7 - i * 0.05, 1.3, 20), i % 2 ? red : white, 0, 1.75 + i * 1.3, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.16, 20), std({ color: 0x2b2f36 }), 0, 6.65, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.9, 16), std({ color: 0xfff1c8, emissive: 0xffd27a, emissiveIntensity: 3, transparent: true, opacity: 0.9 }), 0, 7.2, 0));
    g.add(mesh(new THREE.ConeGeometry(0.72, 0.6, 20), red, 0, 7.95, 0));
    const beam = new THREE.SpotLight(0xfff1c8, 60, 45, 0.22, 0.6, 1); beam.position.set(0, 7.2, 0); const t = new THREE.Object3D(); t.position.set(12, 6, 0); g.add(t); beam.target = t; g.add(beam); g.userData.beam = t;
    return g;
  }
  function towerMesh() {
    const g = new THREE.Group(), stone = std({ color: 0x9aa3ad, roughness: 0.9, map: texture("cobble", 0x9aa3ad) });
    g.add(mesh(new THREE.BoxGeometry(1.8, 5, 1.8), stone, 0, 2.5, 0));
    const roof = mesh(new THREE.ConeGeometry(1.5, 1.4, 4), std({ color: 0x5a6b8c, roughness: 0.7 }), 0, 5.7, 0); roof.rotation.y = Math.PI / 4; g.add(roof);
    g.add(mesh(new THREE.CircleGeometry(0.55, 24), std({ color: 0xfff3d6, emissive: 0xffe0a0, emissiveIntensity: 0.6 }), 0, 4.0, 0.91));
    const hand = mesh(new THREE.BoxGeometry(0.05, 0.42, 0.02), std({ color: 0x222222 }), 0, 4.0, 0.93); hand.geometry.translate(0, 0.2, 0); g.add(hand); g.userData.hand = hand;
    return g;
  }
  function fountainMesh() {
    const g = new THREE.Group(), stone = std({ color: 0xb9b1a3, roughness: 0.9, map: texture("cobble", 0xb9b1a3) });
    g.add(mesh(new THREE.CylinderGeometry(2.2, 2.3, 0.5, 28), stone, 0, 0.25, 0));
    g.add(mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.1, 28), phys({ color: 0x4fb0d8, roughness: 0.05, transparent: true, opacity: 0.75 }), 0, 0.5, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.25, 0.4, 1.3, 12), stone, 0, 1.0, 0)); g.add(mesh(new THREE.CylinderGeometry(0.7, 0.5, 0.15, 20), stone, 0, 1.65, 0));
    return g;
  }
  function archMesh(color) { // the stone gate around a zone portal
    const g = new THREE.Group(), stone = std({ color: 0x8d8578, roughness: 0.95, map: texture("cobble", 0x8d8578) });
    for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.28, 1.5, 0.28), stone, s * 0.68, 0.75, 0));
    g.add(mesh(new THREE.BoxGeometry(1.7, 0.26, 0.34), stone, 0, 1.6, 0));
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), std({ color, emissive: color, emissiveIntensity: 0.8 }), 0, 1.83, 0));
    return g;
  }
  // autopilot: a coarse map of where Bolt can drive, a breadth-first search over it, then straighten the route
  function buildWalkGrid(r) {
    const S = r.town.size, res = 0.5, n = Math.round(S / res), g = new Uint8Array(n * n), half = S / 2;
    const plat = (x, z) => r.platforms.find(p => x > p.x1 && x < p.x2 && z > p.z1 && z < p.z2);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -half + (i + 0.5) * res, z = -half + (j + 0.5) * res;
      let free = plat(x, z) ? true : r.height(x, z) > 0;
      if (free) for (const c of r.colliders) if (Math.hypot(x - c.x, z - c.z) < c.r + 0.5) { free = false; break; }
      g[j * n + i] = free ? 1 : 0;
    }
    r.walk = { g, n, res, half };
  }
  function findPath(r, from, to) {
    const { g, n, res, half } = r.walk, ci = v => Math.max(0, Math.min(n - 1, Math.floor((v + half) / res)));
    const sx = ci(from.x), sz = ci(from.z); let tx = ci(to.x), tz = ci(to.z);
    if (!g[tz * n + tx]) { let best = null, bd = 1e9; for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) { const x = tx + dx, z = tz + dz; if (x >= 0 && z >= 0 && x < n && z < n && g[z * n + x] && dx * dx + dz * dz < bd) { bd = dx * dx + dz * dz; best = [x, z]; } } if (!best) return null; [tx, tz] = best; }
    const start = sz * n + sx, goal = tz * n + tx, prev = new Int32Array(n * n).fill(-1), q = [start]; prev[start] = start; let head = 0, found = -1;
    while (head < q.length) {
      const c = q[head++]; if (c === goal) { found = c; break; } const cx = c % n, cz = (c / n) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue; const x = cx + dx, z = cz + dz; if (x < 0 || z < 0 || x >= n || z >= n) continue; const k = z * n + x;
        if (prev[k] !== -1 || !g[k] || (dx && dz && (!g[cz * n + x] || !g[z * n + cx]))) continue; prev[k] = c; q.push(k);
      }
    }
    if (found < 0) return null;
    const pts = []; for (let c = found; c !== start; c = prev[c]) pts.unshift({ x: -half + (c % n + 0.5) * res, z: -half + (((c / n) | 0) + 0.5) * res });
    const clear = (a, b) => { const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (res * 0.5)); for (let i = 1; i < steps; i++) { const x = a.x + (b.x - a.x) * i / steps, z = a.z + (b.z - a.z) * i / steps; if (!g[ci(z) * n + ci(x)]) return false; } return true; };
    const out = []; let cur = from, i = 0;
    while (i < pts.length) { let j = pts.length - 1; while (j > i && !clear(cur, pts[j])) j--; out.push(pts[j]); cur = pts[j]; i = j + 1; }
    return out;
  }
  function setTarget(r, x, z, prop) {
    const path = findPath(r, { x: r.bolt.position.x, z: r.bolt.position.z }, { x, z });
    r.path = path ? path.slice(0, -1) : []; const last = path ? path[path.length - 1] : { x, z };
    r.target = { x: last.x, z: last.z, prop: prop || null }; r.stuck = 0;
  }
  // ---------- life in town: rigged townsfolk, strollers, helper robots, gulls, crabs, fish, track marks ----------
  // The generated people are single sculpted meshes with no skeleton, so they are "rigged" in the vertex shader:
  // below the hips the two legs swing about a sideways axis (left and right opposite), the arms swing the other
  // way, the head turns about the neck, and the chest breathes. The cut-off points are fractions of the model's
  // height, which works for any standing person the Spark makes.
  const ARM_DOWN = { villager3: 0.12, villager5: 0.12 }; // how far to bring each model's arms in to its sides (radians)
  const A_POSE = { has: n => n in ARM_DOWN };
  function rigHuman(inst, armDown = 0) {
    const sets = [];
    inst.traverse(o => {
      if (!o.isMesh || o.userData.rigged) return; o.userData.rigged = true;
      const g = o.geometry; g.computeBoundingBox(); const b = g.boundingBox, h = b.max.y - b.min.y, hw = (b.max.x - b.min.x) / 2;
      const u = { uArmDown: { value: armDown }, uGesture: { value: 0 }, uPhase: { value: 0 }, uAmp: { value: 0 }, uHead: { value: 0 }, uNod: { value: 0 }, uBreath: { value: 0 }, uHip: { value: b.min.y + h * 0.47 }, uNeck: { value: b.min.y + h * 0.83 }, uShoulder: { value: b.min.y + h * 0.78 }, uC: { value: new THREE.Vector2((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2) }, uH: { value: h }, uHW: { value: hw } };
      o.material = o.material.clone(); // geometry stays shared with the template
      o.material.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = "uniform float uPhase, uAmp, uHead, uNod, uBreath, uHip, uNeck, uShoulder, uH, uHW, uArmDown, uGesture; uniform vec2 uC;\n" +
          "vec2 rot2(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c*v.x - s*v.y, s*v.x + c*v.y); }\n" +
          sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
          {
            vec3 p = transformed; float dx = p.x - uC.x;
            // legs: a smooth left/right split so the crotch does not tear
            float side = clamp(dx / (uHW * 0.18), -1.0, 1.0);
            float legK = smoothstep(uHip, uHip - uH * 0.10, p.y);
            float la = sin(uPhase) * uAmp * side * legK;
            vec2 yz = rot2(vec2(p.y - uHip, p.z - uC.y), la); p.y = uHip + yz.x; p.z = uC.y + yz.y;
            // knees: lift the lower leg on the forward swing
            float knee = smoothstep(uHip - uH * 0.22, uHip - uH * 0.30, transformed.y) * max(0.0, sin(uPhase) * side) * uAmp * 0.12 * uH;
            p.z += knee;
            // arms: outer parts between the hips and the shoulders swing opposite the legs
            float armK = smoothstep(uHW * 0.42, uHW * 0.62, abs(dx)) * smoothstep(uShoulder + uH * 0.04, uShoulder - uH * 0.02, p.y) * smoothstep(uHip - uH * 0.18, uHip, p.y);
            float aa = -sin(uPhase) * uAmp * 0.7 * sign(dx) * armK;
            vec2 ayz = rot2(vec2(p.y - uShoulder, p.z - uC.y), aa); p.y = mix(p.y, uShoulder + ayz.x, armK); p.z = mix(p.z, uC.y + ayz.y, armK);
            // arms held out (A-pose) come down to the sides, about the shoulder
            float sx = uC.x + sign(dx) * uHW * 0.4; vec2 xy = rot2(vec2(p.x - sx, p.y - uShoulder), -sign(dx) * uArmDown * armK); p.x = sx + xy.x; p.y = uShoulder + xy.y;
            // talking: the right hand comes up and forward
            float gk = armK * step(0.0, dx) * uGesture; vec2 gyz = rot2(vec2(p.y - uShoulder, p.z - uC.y), -1.1 * gk); p.y = uShoulder + gyz.x; p.z = uC.y + gyz.y;
            // chest breathing
            float chest = smoothstep(uHip, uHip + uH * 0.1, p.y) * smoothstep(uNeck, uNeck - uH * 0.06, p.y);
            p.x = uC.x + (p.x - uC.x) * (1.0 + uBreath * 0.012 * chest); p.z = uC.y + (p.z - uC.y) * (1.0 + uBreath * 0.02 * chest);
            // head: turn and nod about the neck
            float headK = smoothstep(uNeck - uH * 0.02, uNeck + uH * 0.03, p.y);
            vec2 hz = rot2(vec2(p.x - uC.x, p.z - uC.y), -uHead * headK); p.x = uC.x + hz.x; p.z = uC.y + hz.y;
            vec2 ny = rot2(vec2(p.y - uNeck, p.z - uC.y), uNod * headK); p.y = uNeck + ny.x; p.z = uC.y + ny.y;
            // a little up-and-down with each step
            p.y += abs(sin(uPhase)) * uAmp * 0.04 * uH * (1.0 - legK);
            transformed = p;
          }`);
      };
      o.material.customProgramCacheKey = () => "rigHuman";
      sets.push(u);
    });
    return sets;
  }
  function rigSet(sets, k, v) { if (sets) for (const u of sets) u[k].value = v; }
  // a person with a real skeleton: one mixer per person, cross-fading between the Mixamo clips
  const RIGGED = { villager: "villager_rig", villager2: "villager2_rig", villager3: "villager3_rig", villager4: "villager4_rig", villager5: "villager5_rig", villager6: "villager6_rig" };
  const personModel = m => RIGGED[m] && ASSETS[RIGGED[m]] ? RIGGED[m] : m;
  function makeAnim(inst) {
    const mixer = new THREE.AnimationMixer(inst), acts = {};
    for (const c of inst.userData.clips) { const a = mixer.clipAction(c); if (c.name === "wave") { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; } acts[c.name] = a; }
    const anim = { mixer, acts, cur: null, head: inst.getObjectByName("mixamorigHead"), neck: inst.getObjectByName("mixamorigNeck") };
    mixer.addEventListener("finished", () => { anim.cur = null; anim.busy = false; });
    animPlay(anim, Math.random() < 0.5 ? "idle" : "idle2", 0); mixer.update(Math.random() * 8);
    return anim;
  }
  function animPlay(anim, name, fade = 0.35) {
    const a = anim.acts[name]; if (!a || anim.cur === name) return;
    const prev = anim.cur && anim.acts[anim.cur]; a.reset().setEffectiveWeight(1).play();
    if (prev && fade > 0) a.crossFadeFrom(prev, fade, true); else if (prev) prev.stop();
    anim.cur = name; anim.busy = name === "wave";
  }
  // advance the clips, then turn the head on top of whatever the clip is doing
  function animStep(anim, dt, head) {
    anim.mixer.update(dt);
    if (head && anim.neck) anim.neck.rotateY(head * 0.35);
    if (head && anim.head) anim.head.rotateY(head * 0.55);
  }
  function bindPerson(v, model) {
    const ad = ARM_DOWN[model] || 0;
    const bind = inst => { if (inst.userData.clips && inst.userData.clips.length) { v.userData.anim = makeAnim(inst); v.userData.rig = null; } else v.userData.rig = rigHuman(inst, ad); };
    v.userData.onModel = bind; if (v.userData.model && !v.userData.rig && !v.userData.anim) bind(v.userData.model);
  }
  // fill group vis with a person model and rig it as soon as the model is there
  function person(vis, model, fallbackColor) {
    model = personModel(model); bindPerson(vis, model);
    useAsset(vis, model, () => {
      const c = new THREE.Color(fallbackColor);
      vis.add(mesh(new THREE.CapsuleGeometry(0.2, 0.35, 6, 12), phys({ color: c, roughness: 0.4 }), 0, 0.45, 0));
      vis.add(mesh(new THREE.SphereGeometry(0.17, 16, 12), std({ color: 0xf1dcc4, roughness: 0.6 }), 0, 0.86, 0));
    });
    bindPerson(vis, model);
    return vis;
  }
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

  function gullMesh() {
    const g = new THREE.Group(), white = std({ color: 0xf4f4f0, roughness: 0.7 }), grey = std({ color: 0x9aa3ad, roughness: 0.7, side: THREE.DoubleSide });
    const body = mesh(new THREE.CapsuleGeometry(0.06, 0.24, 4, 8), white); body.rotation.z = Math.PI / 2; g.add(body);
    g.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), white, 0.17, 0.03, 0));
    const beak = mesh(new THREE.ConeGeometry(0.018, 0.07, 6), std({ color: 0xf0b030 }), 0.24, 0.02, 0); beak.rotation.z = -Math.PI / 2; g.add(beak);
    const tail = mesh(new THREE.BoxGeometry(0.1, 0.01, 0.08), grey, -0.19, 0, 0); g.add(tail);
    const wings = [];
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(0.02, 0.03, s * 0.04); g.add(piv);
      const w = mesh(new THREE.PlaneGeometry(0.16, 0.42), grey); w.rotation.x = -Math.PI / 2; w.position.z = s * 0.21; piv.add(w);
      const tip = mesh(new THREE.PlaneGeometry(0.1, 0.12), std({ color: 0x2b2f36, side: THREE.DoubleSide })); tip.rotation.x = -Math.PI / 2; tip.position.set(-0.02, 0.001, s * 0.37); piv.add(tip);
      piv.userData.s = s; wings.push(piv);
    }
    g.userData.wings = wings; g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g;
  }
  function fishMesh() {
    const g = new THREE.Group(); const b = mesh(new THREE.SphereGeometry(0.1, 12, 8), std({ color: 0xc8d4dc, metalness: 0.8, roughness: 0.25 })); b.scale.set(2.2, 0.8, 0.6); g.add(b);
    const t = mesh(new THREE.ConeGeometry(0.08, 0.12, 4), std({ color: 0x8fa0ac, metalness: 0.6, roughness: 0.3 }), -0.26, 0, 0); t.rotation.z = Math.PI / 2; g.add(t); return g;
  }
  // track marks: a ring buffer of flat dark strips laid behind Bolt's two tracks
  function makeTracks() {
    const N = 700, geo = new THREE.PlaneGeometry(0.14, 0.24); geo.rotateX(-Math.PI / 2);
    const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x2e2618, transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), N);
    m.frustumCulled = false; m.renderOrder = 2; const M = new THREE.Matrix4().makeTranslation(0, -100, 0); for (let i = 0; i < N; i++) m.setMatrixAt(i, M);
    return { mesh: m, N, next: 0, dist: 0 };
  }
  function dropTrack(r, x, z, yaw, onSand) {
    const t = r.tracks, cy = Math.cos(yaw), sy = -Math.sin(yaw), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + Math.PI / 2), M = new THREE.Matrix4(), s = new THREE.Vector3(1, 1, onSand ? 1 : 0.7);
    for (const side of [-1, 1]) {
      const px = x - sy * side * 0.17, pz = z + cy * side * 0.17;
      M.compose(new THREE.Vector3(px, r.height(px, pz) + 0.025, pz), q, s); t.mesh.setMatrixAt(t.next, M); t.next = (t.next + 1) % t.N;
    }
    t.mesh.instanceMatrix.needsUpdate = true;
  }

  function addLife(r) {
    const town = r.town, height = r.height;
    r.movers = []; r.walkers = []; r.bots = []; r.gulls = []; r.crabs = [];
    // the talking townsfolk: rig them so heads turn and chests breathe
    for (const q of r.props) if (q.p.kind === "npc" && q.m.userData.vis) { const v = q.m.userData.vis; q.vis = v; bindPerson(v, v.userData.modelName); q.phase = Math.random() * 6; }
    // strollers wander between spots around town
    const SPOTS = town.spots || [];
    const TINTS = [0xffffff, 0xd8e4ff, 0xffe2c8, 0xe2ffd8];
    (town.strollers || []).forEach((st, i) => {
      const g = new THREE.Group(), vis = new THREE.Group(); g.add(vis); person(vis, st.model || "villager", st.color || 0x6a8c3a);
      if (st.tint) vis.userData.tint = st.tint; else vis.userData.tint = TINTS[i % TINTS.length];
      const s0 = SPOTS[st.from % SPOTS.length]; g.position.set(s0.x, height(s0.x, s0.z), s0.z); world.add(g);
      const w = { g, vis, spot: st.from % SPOTS.length, path: [], wait: 1 + Math.random() * 3, phase: 0, amp: 0, yaw: Math.random() * 6, head: 0, look: 0, speed: 0.85 + Math.random() * 0.25, r: 0.32 };
      r.walkers.push(w); r.movers.push(w);
    });
    // helper robots: Bolt's cousins in other paint jobs, pottering between jobs
    (town.bots || []).forEach((bt, i) => {
      const g = new THREE.Group(), vis = new THREE.Group(); g.add(vis); const col = new THREE.Color(bt.color);
      vis.userData.onModel = inst => tintModel(inst, col); useAsset(vis, "bolt", () => robotShape(vis)); if (vis.userData.model) tintModel(vis.userData.model, col);
      g.scale.setScalar(bt.s || 0.8); const s0 = SPOTS[bt.from % SPOTS.length]; g.position.set(s0.x, height(s0.x, s0.z), s0.z); world.add(g);
      const b = { g, vis, spot: bt.from % SPOTS.length, path: [], wait: Math.random() * 2, yaw: 0, speed: 1.8 + Math.random() * 0.5, r: 0.36, bot: true, beep: 0 };
      r.bots.push(b); r.movers.push(b);
    });
    // gulls circle the harbour
    for (let i = 0; i < (phone ? 4 : 7); i++) { const g = gullMesh(); world.add(g); r.gulls.push({ g, cx: rnd(-8, 8) + (i % 2 ? 6 : -4), cz: rnd(6, 22), rad: rnd(5, 11), hgt: rnd(4.5, 8.5), w: rnd(0.25, 0.45) * (i % 2 ? 1 : -1), a: Math.random() * 6, flap: Math.random() * 6 }); }
    // crabs on the beach: find sand just above the waterline
    for (let i = 0, tries = 0; i < 6 && tries < 400; tries++) {
      const a = Math.random() * Math.PI * 2; let x = 0, z = 0, ok = false;
      for (let rr = town.radius - 8; rr < town.radius + 5; rr += 0.25) { x = Math.cos(a) * rr; z = Math.sin(a) * rr; const y = height(x, z); if (y > 0.04 && y < 0.22) { ok = true; break; } }
      if (!ok || r.colliders.some(c => Math.hypot(x - c.x, z - c.z) < c.r + 1)) continue;
      const g = new THREE.Group(); useAsset(g, "crab", () => crabShape(g)); g.scale.setScalar(0.9); g.position.set(x, height(x, z), z); g.rotation.y = a + Math.PI / 2; world.add(g);
      r.crabs.push({ g, home: { x, z }, a, t: 0, dir: 1, wait: Math.random() * 3, flee: 0 }); i++;
    }
    r.fish = { g: fishMesh(), t: -2 - Math.random() * 3 }; r.fish.g.visible = false; world.add(r.fish.g);
    r.tracks = makeTracks(); world.add(r.tracks.mesh);
    r.prevFwd = 0; r.pitch = 0;
  }

  function lifeFrame(r, dt, bx, bz) {
    if (r.talking && modalHidden()) r.talking = null; // conversation closed some other way
    const SPOTS = r.town.spots || [];
    // talking townsfolk: breathe, shift weight, and look at Bolt with the head first, then the body
    for (const q of r.props) {
      if (q.p.kind !== "npc") continue; const m = q.m, v = q.vis, rig = v && v.userData.rig;
      const ex = bx - m.position.x, ez = bz - m.position.z, d = Math.hypot(ex, ez), want = d < 6 ? Math.atan2(ex, ez) : m.userData.home;
      const anim = v && v.userData.anim, rel = angDiff(want, m.rotation.y), lim = rig || anim ? 1.0 : 0;
      if (Math.abs(rel) > lim) m.rotation.y += Math.sign(rel) * Math.min(Math.abs(rel) - lim, dt * 2.2);
      q.head = (q.head || 0) + (Math.max(-lim, Math.min(lim, angDiff(want, m.rotation.y))) - (q.head || 0)) * Math.min(1, dt * 4);
      m.position.y = m.userData.baseY;
      if (anim && !r.photo) {
        const talk = r.talking === q.p.id;
        if (d > 6) q.waved = false;
        if (talk) animPlay(anim, "talk");
        else if (!q.waved && d < 3.4 && !r.race) { q.waved = true; animPlay(anim, "wave", 0.25); }
        else if (!anim.busy && (!anim.cur || anim.cur === "talk")) animPlay(anim, q.phase > 3 ? "idle2" : "idle", 0.5);
        animStep(anim, dt, q.head);
      } else if (anim) animStep(anim, 0, q.head);
      if (rig) { const talk = r.talking === q.p.id; rigSet(rig, "uGesture", talk ? 0.35 + 0.35 * Math.sin(clock * 2.6 + q.phase) : 0); rigSet(rig, "uHead", q.head); rigSet(rig, "uBreath", Math.sin(clock * 1.7 + q.phase)); rigSet(rig, "uNod", talk ? Math.sin(clock * 4.2) * 0.07 : d < 2.2 ? Math.sin(clock * 3 + q.phase) * 0.06 : 0); rigSet(rig, "uPhase", Math.sin(clock * 0.4 + q.phase) * 0.5); rigSet(rig, "uAmp", 0.05); }
    }
    // strollers and robots: walk a found path to a new spot, stop, look around, pick another
    const walk = (w, isBot) => {
      const p = w.g.position;
      if (!w.path.length) {
        w.wait -= dt; w.moving = false;
        if (w.wait <= 0 && SPOTS.length && r.walk) {
          let to = w.spot; while (to === w.spot) to = Math.floor(Math.random() * SPOTS.length);
          const path = findPath(r, { x: p.x, z: p.z }, SPOTS[to]); if (path && path.length) { w.path = path; w.spot = to; } w.wait = isBot ? rnd(1, 3) : rnd(2.5, 7);
        }
      } else {
        const wp = w.path[0], dx = wp.x - p.x, dz = wp.z - p.z, d = Math.hypot(dx, dz);
        const toBolt = Math.hypot(bx - p.x, bz - p.z), ahead = (bx - p.x) * dx + (bz - p.z) * dz > 0;
        const blocked = toBolt < 1.3 && ahead; // give way to Bolt
        if (d < 0.3) w.path.shift();
        else if (!blocked) { const st = Math.min(d, w.speed * dt); p.x += dx / d * st; p.z += dz / d * st; w.moving = true; w.dist = (w.dist || 0) + st; const ty = isBot ? Math.atan2(-dz, dx) : Math.atan2(dx, dz); w.yaw += angDiff(ty, w.yaw) * Math.min(1, dt * 6); }
        else w.moving = false;
      }
      // other movers: a gentle push apart
      for (const o of r.movers) if (o !== w) { const ex = p.x - o.g.position.x, ez = p.z - o.g.position.z, dd = Math.hypot(ex, ez), mn = w.r + o.r; if (dd < mn && dd > 1e-4) { p.x += ex / dd * (mn - dd) * 0.5; p.z += ez / dd * (mn - dd) * 0.5; } }
      p.y += (r.height(p.x, p.z) - p.y) * Math.min(1, dt * 10); w.g.rotation.y = w.yaw;
    };
    for (const w of r.walkers) {
      walk(w, false); const rig = w.vis.userData.rig;
      w.amp += ((w.moving ? 0.42 : 0) - w.amp) * Math.min(1, dt * 5); w.phase = (w.dist || 0) * 4.6;
      if (w.vis.userData.tint && w.vis.userData.model && !w.tinted) { w.tinted = true; w.vis.userData.model.traverse(o => { if (o.isMesh && o.material) o.material.color.multiply(new THREE.Color(w.vis.userData.tint)); }); }
      const toB = Math.hypot(bx - w.g.position.x, bz - w.g.position.z);
      const lookAt = toB < 4 ? Math.max(-1, Math.min(1, angDiff(Math.atan2(bx - w.g.position.x, bz - w.g.position.z), w.yaw))) : (w.moving ? 0 : Math.sin(clock * 0.5 + w.speed * 9) * 0.7);
      w.head += (lookAt - w.head) * Math.min(1, dt * 3);
      const anim = w.vis.userData.anim;
      if (anim) { if (w.moving) { animPlay(anim, "walk", 0.25); anim.acts.walk.timeScale = w.speed / 0.72; } else if (anim.cur === "walk" || !anim.cur) animPlay(anim, "idle", 0.4); animStep(anim, r.photo ? 0 : dt, w.head); }
      if (rig) { rigSet(rig, "uPhase", w.phase); rigSet(rig, "uAmp", w.amp); rigSet(rig, "uHead", w.head); rigSet(rig, "uBreath", Math.sin(clock * 1.9 + w.speed * 7)); }
    }
    for (const b of r.bots) { walk(b, true); b.vis.position.y = b.moving ? Math.abs(Math.sin(clock * 18 + b.speed)) * 0.012 : 0; b.vis.rotation.z += ((b.moving ? 0.05 : 0) - b.vis.rotation.z) * Math.min(1, dt * 4); }
    // gulls: circle, flap, glide, bank into the turn
    for (const s of r.gulls) {
      s.a += s.w * dt; const x = s.cx + Math.cos(s.a) * s.rad, z = s.cz + Math.sin(s.a) * s.rad, y = s.hgt + Math.sin(s.a * 2) * 0.6;
      s.g.position.set(x, y, z); const vx = -Math.sin(s.a) * s.w, vz = Math.cos(s.a) * s.w; s.g.rotation.set(0, Math.atan2(-vz, vx), 0); s.g.rotateX(Math.sign(s.w) * 0.35);
      const gl = Math.sin(clock * 0.3 + s.flap) > 0.2; const f = gl ? 0.08 : Math.sin(clock * 10 + s.flap) * 0.7;
      for (const wg of s.g.userData.wings) wg.rotation.x = -wg.userData.s * f;
    }
    // crabs: scuttle sideways along the beach, bolt when Bolt comes close
    for (const c of r.crabs) {
      const p = c.g.position, toB = Math.hypot(bx - p.x, bz - p.z);
      if (toB < 2.2 && c.flee <= 0) { c.flee = 1.4; c.dir = Math.sign((p.x - bx) * Math.sin(c.a) - (p.z - bz) * Math.cos(c.a)) || 1; }
      const speed = c.flee > 0 ? 2.2 : 0.5; c.flee -= dt;
      if (c.wait > 0 && c.flee <= 0) c.wait -= dt;
      else { c.t += c.dir * speed * dt; if (Math.abs(c.t) > 1.6) { c.dir = -Math.sign(c.t); c.t = Math.sign(c.t) * 1.6; c.wait = rnd(1, 4); } }
      const tx = -Math.sin(c.a), tz = Math.cos(c.a), x = c.home.x + tx * c.t, z = c.home.z + tz * c.t; p.set(x, r.height(x, z) + Math.abs(Math.sin(clock * 30)) * 0.01 * (c.wait > 0 && c.flee <= 0 ? 0 : 1), z);
    }
    // a fish jumps in the bay now and then
    const f = r.fish; if (!f) return; f.t += dt;
    if (f.t > 0 && !f.g.visible) { const a = rnd(-1.2, 1.2), d = rnd(6, 14); f.x = r.town.bay.x + Math.sin(a) * d * 0.6; f.z = r.town.bay.z + Math.cos(a) * d * 0.3 - 2; f.dir = Math.random() * 6; if (r.height(f.x, f.z) < -0.6) { f.g.visible = true; f.t = 0; burst(f.x, f.z, 0xdff4ff, 10, 1.2, -0.05); } else f.t = -0.5; }
    if (f.g.visible) { const k = f.t / 0.9; if (k >= 1) { f.g.visible = false; f.t = -rnd(3, 7); burst(f.x + Math.cos(f.dir) * 0.9, f.z - Math.sin(f.dir) * 0.9, 0xdff4ff, 12, 1.4, -0.05); } else { f.g.position.set(f.x + Math.cos(f.dir) * 0.9 * k, -0.1 + Math.sin(k * Math.PI) * 0.9, f.z - Math.sin(f.dir) * 0.9 * k); f.g.rotation.set(0, f.dir, Math.cos(k * Math.PI) * 1.1); } }
  }
  let OCEAN_BIG = null;
  // ---------- play in town: golden gears, jump and boost, the Harbor Rally, the minimap, rain ----------
  // Twenty golden gears are hidden around the island (a few float high: jump for those). Space jumps, Shift
  // boosts while the blue bar lasts. The rally is a ring of checkpoints from the plaza to the end of the pier,
  // timed to the hundredth. The minimap in the corner shows who has a quest for you (!) or a reward waiting (?).
  let GOLD_GEO = null, GOLD_MAT = null, RING_GEO = null;
  function goldGear() {
    if (!GOLD_GEO) {
      const s = new THREE.Shape(), T = 10, R0 = 0.34, R1 = 0.26;
      for (let i = 0; i < T * 4; i++) { const a = i / (T * 4) * Math.PI * 2, rad = i % 4 < 2 ? R0 : R1; if (i) s.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); else s.moveTo(Math.cos(a) * rad, Math.sin(a) * rad); }
      const hole = new THREE.Path(); hole.absarc(0, 0, 0.09, 0, Math.PI * 2, true); s.holes.push(hole);
      GOLD_GEO = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 10 }); GOLD_GEO.center();
      GOLD_MAT = std({ color: 0xffc83a, metalness: 1, roughness: 0.22, emissive: 0x9a6400, emissiveIntensity: 0.7 });
    }
    const m = new THREE.Mesh(GOLD_GEO, GOLD_MAT); m.castShadow = true; return m;
  }
  function initPlay(r) { Object.assign(r, { air: 0, vy: 0, energy: 1, boostOn: false, boosting: false, jumpReq: false, landK: 0, boostT: 0, gold: r.gold || [], race: null, markT: 9, marks: {}, sparkT: 0 }); r.gyS = r.height(r.bolt.position.x, r.bolt.position.z); }
  function placeGold(r, town) {
    const gp = (x, z) => { const p = r.platforms.find(p => x > p.x1 && x < p.x2 && z > p.z1 && z < p.z2); return p ? p.y : r.height(x, z); };
    for (const gd of town.gears || []) {
      if (r.hooks.gearTaken && r.hooks.gearTaken(gd.id)) continue;
      const m = goldGear(), y = gp(gd.x, gd.z) + (gd.lift || 0.75); m.position.set(gd.x, y, gd.z); world.add(m);
      r.gold.push({ id: gd.id, m, y, phase: Math.random() * 6 });
    }
  }
  function goldFrame(r, dt, b) {
    r.sparkT -= dt; const spark = r.sparkT <= 0; if (spark) r.sparkT = 0.25;
    for (let i = r.gold.length - 1; i >= 0; i--) {
      const g = r.gold[i], m = g.m; m.rotation.y += dt * 2.2; m.position.y = g.y + Math.sin(clock * 2.4 + g.phase) * 0.08;
      const d = Math.hypot(m.position.x - b.position.x, m.position.z - b.position.z);
      if (spark && d < 14 && Math.random() < 0.5) burst(m.position.x, m.position.z, 0xffe08a, 1, 0.35, m.position.y);
      if (d < 0.75 && Math.abs(m.position.y - (b.position.y + 0.45)) < 0.8) {
        world.remove(m); r.gold.splice(i, 1);
        for (let k = 0; k < 3; k++) burst(m.position.x, m.position.z, [0xffd24a, 0xfff2b0, 0xffb020][k], 10, 1.8, m.position.y);
        if (window.Audio_) Audio_.play("gear"); if (r.hooks.onGear) r.hooks.onGear(g.id, r.gold.length);
      }
    }
  }
  // the rally: rings standing across the course, the next one gold, an arrow over Bolt pointing at it
  function startRace(course, done) {
    const r = roam; if (!r || r.indoor) return false; stopRace();
    if (!RING_GEO) RING_GEO = new THREE.TorusGeometry(1.25, 0.09, 12, 48);
    const gp = (x, z) => { const p = r.platforms.find(p => x > p.x1 && x < p.x2 && z > p.z1 && z < p.z2); return p ? p.y : r.height(x, z); };
    const pts = course.rings, rings = pts.map((p, i) => {
      const a = i ? pts[i - 1] : course.start, c = pts[i + 1] || p, dx = c.x - a.x, dz = c.z - a.z, last = i === pts.length - 1;
      const col = new THREE.Color(last ? 0x5fe08a : 0x9fdcff), mat = std({ color: col, emissive: col, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.2, transparent: true, opacity: 0.85 });
      const m = new THREE.Mesh(RING_GEO, mat); m.position.set(p.x, gp(p.x, p.z) + 1.3, p.z); m.rotation.y = Math.atan2(dx, dz); world.add(m);
      return { x: p.x, z: p.z, m, mat, col, last };
    });
    const as = new THREE.Shape([[0, 0.42], [0.3, 0.02], [0.12, 0.02], [0.12, -0.3], [-0.12, -0.3], [-0.12, 0.02], [-0.3, 0.02]].map(([x, y]) => new THREE.Vector2(x, y))); // a flat arrow, read from above
    const arrowGeo = new THREE.ExtrudeGeometry(as, { depth: 0.06, bevelEnabled: false }); arrowGeo.rotateX(Math.PI / 2); // tip along +z, which lookAt turns toward the ring
    const arrow = new THREE.Mesh(arrowGeo, std({ color: 0xffd24a, emissive: 0xffa800, emissiveIntensity: 1.2 })); world.add(arrow);
    const b = r.bolt, s = course.start; b.position.set(s.x, r.height(s.x, s.z), s.z); r.gyS = b.position.y; r.air = 0; r.vy = 0; r.yaw = s.yaw; b.rotation.y = s.yaw; r.vel.set(0, 0, 0); r.target = null; r.path = null; r.energy = 1;
    cam.az = Math.atan2(-Math.cos(r.yaw), Math.sin(r.yaw)); cam.look.set(s.x, b.position.y + 0.9, s.z); r.lastDrag = -9;
    r.race = { rings, i: 0, t: -3.2, arrow, done, beat: 4, best: course.best || null }; r.frozen = true;
    return true;
  }
  function stopRace() { const r = roam; if (!r || !r.race) return; for (const g of r.race.rings) world.remove(g.m); world.remove(r.race.arrow); r.race = null; r.frozen = false; }
  function raceFrame(r, dt, b) {
    const R = r.race; R.t += dt;
    if (R.t < 0) { const beat = Math.ceil(-R.t); if (beat < R.beat && beat <= 3) { R.beat = beat; if (window.Audio_) Audio_.play("beep"); } }
    else if (r.frozen) { r.frozen = false; if (window.Audio_) Audio_.play("go"); }
    R.rings.forEach((g, i) => { const cur = i === R.i; if (g.done) return; g.mat.emissiveIntensity = cur ? 1.4 + Math.sin(clock * 6) * 0.5 : 0.35; g.mat.color.copy(cur && !g.last ? new THREE.Color(0xffd24a) : g.col); g.mat.emissive.copy(g.mat.color); g.mat.opacity = cur ? 0.95 : i < R.i + 3 ? 0.6 : 0.25; });
    const next = R.rings[R.i];
    R.arrow.position.set(b.position.x, b.position.y + 1.25 + Math.sin(clock * 4) * 0.05, b.position.z); R.arrow.lookAt(next.m.position.x, b.position.y + 1.25, next.m.position.z);
    if (R.t > 0 && Math.hypot(b.position.x - next.x, b.position.z - next.z) < 1.35) {
      next.done = true; world.remove(next.m); for (let k = 0; k < 2; k++) burst(next.x, next.z, next.last ? 0x5fe08a : 0xffd24a, 14, 2, next.m.position.y);
      R.i++; if (window.Audio_) Audio_.play(R.i === R.rings.length ? "win" : "ring");
      if (R.i === R.rings.length) { const t = R.t, done = R.done; stopRace(); if (done) done(t); }
    }
  }
  // quest marks over heads: ! a quest for you, ? a reward waiting
  const markTex = {};
  function markSprite(ch) {
    if (!markTex[ch]) { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); g.fillStyle = ch === "?" ? "#3fbf6a" : "#f4b400"; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill(); g.lineWidth = 4; g.strokeStyle = "#fff"; g.stroke(); g.fillStyle = "#fff"; g.font = "900 40px Nunito, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(ch, 32, 35); markTex[ch] = new THREE.CanvasTexture(c); markTex[ch].colorSpace = THREE.SRGBColorSpace; }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex[ch], depthTest: false, sizeAttenuation: false })); s.renderOrder = 5; return s;
  }
  function marksFrame(r, dt) {
    r.markT += dt; if (r.markT > 1 && r.hooks.marks) { r.markT = 0; r.marks = r.hooks.marks() || {}; for (const q of r.props) if (q.p.kind === "npc") { const ch = r.marks[q.p.id] || null; if (ch !== q.mark) { if (q.markS) q.m.remove(q.markS); q.markS = null; q.mark = ch; if (ch) { q.markS = markSprite(ch); const k = 0.07; q.markS.scale.set(k * H / W / q.s, k / q.s, 1); q.m.add(q.markS); } } } }
    for (const q of r.props) if (q.markS) q.markS.position.y = 1.85 + Math.sin(clock * 3 + q.p.x) * 0.06;
  }
  // rain: streaks that fall around the camera, darker light, thicker fog, splashes and the sound of it
  let rainNow = 0, rainTarget = 0, rainT = 40, weatherMode = "auto";
  function setWeatherMode(m) { weatherMode = m || "auto"; if (weatherMode === "clear") rainTarget = 0; if (weatherMode === "rain") rainTarget = 1; rainT = 120; if (roam) roam.todT = 99; }
  function makeRain() {
    const N = phone ? 900 : 2400, pos = new Float32Array(N * 6), g = new THREE.BufferGeometry();
    for (let i = 0; i < N; i++) { const x = rnd(-13, 13), y = rnd(-3, 11), z = rnd(-13, 13); pos.set([x, y, z, x - 0.04, y + 0.42, z - 0.02], i * 6); }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc4d8ea, transparent: true, opacity: 0, depthWrite: false })); m.frustumCulled = false; return m;
  }
  function rainFrame(r, dt) {
    if (weatherMode === "auto") { rainT -= dt; if (rainT <= 0) { rainTarget = Math.random() < 0.3 ? 0.6 + Math.random() * 0.4 : 0; rainT = rainTarget ? rnd(70, 140) : rnd(110, 260); } }
    rainNow += (rainTarget - rainNow) * Math.min(1, dt * 0.12); if (Math.abs(rainTarget - rainNow) < 0.002) rainNow = rainTarget;
    const m = r.rain; m.visible = rainNow > 0.01; m.material.opacity = rainNow * 0.55;
    if (m.visible) {
      m.position.set(camera.position.x, camera.position.y - 4, camera.position.z);
      const a = m.geometry.attributes.position.array, fall = 15 * dt;
      for (let i = 0; i < a.length; i += 6) { a[i + 1] -= fall; a[i + 4] -= fall; if (a[i + 1] < -3) { a[i + 1] += 14; a[i + 4] += 14; } }
      m.geometry.attributes.position.needsUpdate = true;
      r.splashT = (r.splashT || 0) - dt; if (r.splashT <= 0) { r.splashT = 0.06 / rainNow; const x = r.bolt.position.x + rnd(-6, 6), z = r.bolt.position.z + rnd(-6, 6), y = r.height(x, z); if (y > -0.04) burst(x, z, 0xe6f2ff, 1, 0.4, y + 0.02); }
      if (rainNow > 0.8 && townTime > 0.0 && Math.random() < dt * 0.025) { r.flash = 1; if (window.Audio_) setTimeout(() => Audio_.play("thunder"), 400 + Math.random() * 1500); }
    }
    r.flash = Math.max(0, (r.flash || 0) - dt * 4); renderer.toneMappingExposure = (r.baseExposure || 0.7) + r.flash * 1.4;
    if (window.Audio_ && Audio_.rain) Audio_.rain(rainNow);
  }
  // the minimap: a picture of the island painted once from the height map, with live marks over it
  function buildMinimap(r) {
    const N = 200, c = document.createElement("canvas"); c.width = c.height = N; const g = c.getContext("2d"), img = g.createImageData(N, N), S = r.town.size, half = S / 2;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / N * S - half, z = (j + 0.5) / N * S - half, h = r.height(x, z); let col;
      if (h < -0.04) { const d = Math.min(1, -h / 1.2); col = [96 - d * 50, 178 - d * 70, 205 - d * 45]; }
      else if (h < 0.32) col = [232, 214, 160];
      else { const k = Math.min(1, (h - 0.3) / 2.6); col = [118 - k * 40, 164 - k * 30, 92 - k * 30]; }
      img.data.set([col[0], col[1], col[2], 255], (j * N + i) * 4);
    }
    g.putImageData(img, 0, 0);
    const P = (x) => (x + half) / S * N, k = N / S, t = r.town;
    g.fillStyle = "#c9c2b4"; g.beginPath(); g.arc(P(t.plaza.x), P(t.plaza.z), t.plaza.r * k, 0, Math.PI * 2); g.fill();
    for (const d of t.decor) {
      const s = d.s || 1;
      if (d.kind === "house") { g.fillStyle = "#9a5b3c"; g.fillRect(P(d.x) - 1.1 * s * k / 2.6 * 1.6, P(d.z) - 1.1 * s * k / 2.6 * 1.6, 2.2 * s * k / 2.6 * 1.6, 2.2 * s * k / 2.6 * 1.6); }
      else if (d.kind === "tree") { g.fillStyle = "#3f6b34"; g.beginPath(); g.arc(P(d.x), P(d.z), 0.55 * s * k / 2.2 * 1.5, 0, Math.PI * 2); g.fill(); }
      else if (d.kind === "dock") { g.fillStyle = "#7a5636"; g.fillRect(P(d.x - 1.3), P(d.z), 2.6 * k, d.len * k); }
      else if (d.kind === "fountain") { g.fillStyle = "#6fc6e6"; g.beginPath(); g.arc(P(d.x), P(d.z), 1.8 * k, 0, Math.PI * 2); g.fill(); }
      else if (d.kind === "tower" || d.kind === "lighthouse") { g.fillStyle = d.kind === "tower" ? "#8a8296" : "#e8e2d6"; g.beginPath(); g.arc(P(d.x), P(d.z), 1.3 * k, 0, Math.PI * 2); g.fill(); }
    }
    r.mini = { c, N, S };
  }
  function drawHud() {
    const r = roam; if (!r || r.photo || !modalHidden()) return;
    const ph = phone, b = r.bolt.position;
    if (!r.indoor && r.mini) {
      const Rm = ph ? 58 : 66, cx = fx.width - Rm - 12, cy = Rm + 12, view = 21, k = Rm / view, px = r.mini.N / r.mini.S;
      fctx.save(); fctx.beginPath(); fctx.arc(cx, cy, Rm, 0, Math.PI * 2); fctx.fillStyle = "#2c6f94"; fctx.fill(); fctx.clip();
      fctx.imageSmoothingEnabled = true; fctx.drawImage(r.mini.c, (b.x + r.mini.S / 2 - view) * px, (b.z + r.mini.S / 2 - view) * px, view * 2 * px, view * 2 * px, cx - Rm, cy - Rm, Rm * 2, Rm * 2);
      const at = (x, z) => [cx + (x - b.x) * k, cy + (z - b.z) * k];
      const inside = (sx, sy, pad = 5) => Math.hypot(sx - cx, sy - cy) < Rm - pad;
      for (const q of r.props) {
        const p = q.p, [sx, sy] = at(p.x, p.z); if (!inside(sx, sy, 3)) continue;
        if (p.kind === "portal") { fctx.fillStyle = p.locked ? "#6b7280" : p.color; fctx.beginPath(); fctx.arc(sx, sy, 4.5, 0, Math.PI * 2); fctx.fill(); fctx.strokeStyle = "#fff"; fctx.lineWidth = 1.5; fctx.stroke(); }
        else if (p.kind === "npc") { fctx.fillStyle = p.color || "#fff"; fctx.beginPath(); fctx.arc(sx, sy, 3.2, 0, Math.PI * 2); fctx.fill(); fctx.strokeStyle = "#fff"; fctx.lineWidth = 1; fctx.stroke(); }
        else if (p.kind === "door") { fctx.fillStyle = "#ffb347"; fctx.fillRect(sx - 3, sy - 3, 6, 6); }
        else if (p.kind === "race") { fctx.fillStyle = "#fff"; fctx.fillRect(sx - 3.5, sy - 3.5, 7, 7); fctx.fillStyle = "#222"; fctx.fillRect(sx - 3.5, sy - 3.5, 3.5, 3.5); fctx.fillRect(sx, sy, 3.5, 3.5); }
        else { fctx.fillStyle = "#e8d6a8"; fctx.fillRect(sx - 2.5, sy - 2.5, 5, 5); }
      }
      if (r.race) { const R = r.race; for (let i = R.rings.length - 1; i >= R.i; i--) { const g = R.rings[i]; let [sx, sy] = at(g.x, g.z); const cur = i === R.i; if (!inside(sx, sy, 6)) { if (!cur) continue; const a = Math.atan2(sy - cy, sx - cx); sx = cx + Math.cos(a) * (Rm - 7); sy = cy + Math.sin(a) * (Rm - 7); } fctx.fillStyle = cur ? "#ffd24a" : g.last ? "#5fe08a" : "rgba(200,235,255,0.8)"; fctx.beginPath(); fctx.arc(sx, sy, cur ? 5 : 3, 0, Math.PI * 2); fctx.fill(); if (cur) { fctx.strokeStyle = "#7a5200"; fctx.lineWidth = 1.5; fctx.stroke(); } } }
      for (const q of r.props) if (q.mark) { const [sx, sy] = at(q.p.x, q.p.z); if (!inside(sx, sy, 6)) continue; fctx.fillStyle = q.mark === "?" ? "#3fbf6a" : "#f4b400"; fctx.beginPath(); fctx.arc(sx, sy - 8, 6, 0, Math.PI * 2); fctx.fill(); fctx.fillStyle = "#fff"; fctx.font = "900 10px Nunito, sans-serif"; fctx.textAlign = "center"; fctx.textBaseline = "middle"; fctx.fillText(q.mark, sx, sy - 7.5); }
      fctx.save(); fctx.translate(cx, cy); fctx.rotate(-r.yaw); fctx.fillStyle = "#fff"; fctx.strokeStyle = "#16202c"; fctx.lineWidth = 2; fctx.beginPath(); fctx.moveTo(8, 0); fctx.lineTo(-5, 5.5); fctx.lineTo(-2.5, 0); fctx.lineTo(-5, -5.5); fctx.closePath(); fctx.stroke(); fctx.fill(); fctx.restore();
      fctx.restore();
      fctx.strokeStyle = "rgba(255,255,255,0.9)"; fctx.lineWidth = 3; fctx.beginPath(); fctx.arc(cx, cy, Rm, 0, Math.PI * 2); fctx.stroke();
      fctx.fillStyle = "#16202c"; fctx.beginPath(); fctx.arc(cx, cy - Rm, 9, 0, Math.PI * 2); fctx.fill(); fctx.fillStyle = "#fff"; fctx.font = "800 11px Nunito, sans-serif"; fctx.textAlign = "center"; fctx.textBaseline = "middle"; fctx.fillText("N", cx, cy - Rm + 0.5);
      // under the map: gears found and the boost bar
      const total = (r.town.gears || []).length;
      if (total) { const found = total - r.gold.length, txt = "⚙ " + found + "/" + total; fctx.font = "800 13px Nunito, sans-serif"; const w = fctx.measureText(txt).width + 16; fctx.fillStyle = "rgba(22,30,44,0.78)"; fctx.beginPath(); fctx.roundRect(cx - w / 2, cy + Rm + 8, w, 22, 11); fctx.fill(); fctx.fillStyle = found === total ? "#ffd24a" : "#fff"; fctx.fillText(txt, cx, cy + Rm + 19.5); }
      if (r.energy < 0.999 || r.boosting) { const bw = Rm * 1.3, bx = cx - bw / 2, by = cy + Rm + 36; fctx.fillStyle = "rgba(22,30,44,0.78)"; fctx.beginPath(); fctx.roundRect(bx - 3, by - 3, bw + 6, 12, 6); fctx.fill(); fctx.fillStyle = r.energy < 0.2 && !r.boosting ? "#8a96a8" : "#5fd0ff"; fctx.beginPath(); fctx.roundRect(bx, by, Math.max(2, bw * r.energy), 6, 3); fctx.fill(); }
    }
    if (r.race) {
      const R = r.race, t = Math.max(0, R.t), txt = fmtTime(t);
      fctx.textAlign = "center"; fctx.textBaseline = "middle";
      fctx.fillStyle = "rgba(22,30,44,0.8)"; fctx.beginPath(); fctx.roundRect(fx.width / 2 - 92, 10, 184, 52, 14); fctx.fill();
      fctx.fillStyle = "#fff"; fctx.font = "900 26px Nunito, sans-serif"; fctx.fillText(txt, fx.width / 2, 31);
      fctx.font = "700 12px Nunito, sans-serif"; fctx.fillStyle = "#cfe3ff"; fctx.fillText("ring " + Math.min(R.i + 1, R.rings.length) + " of " + R.rings.length + (R.best ? "  ·  best " + fmtTime(R.best) : ""), fx.width / 2, 52);
      if (R.t < 0.8) { const n = R.t < 0 ? String(Math.ceil(-R.t)) : "GO!", big = R.t < 0 ? 1 + (Math.ceil(-R.t) + R.t) * 0.4 : 1.2; fctx.font = "900 " + Math.round(84 * big) + "px Nunito, sans-serif"; fctx.lineWidth = 8; fctx.strokeStyle = "rgba(22,30,44,0.85)"; fctx.strokeText(n, fx.width / 2, fx.height * 0.42); fctx.fillStyle = R.t < 0 ? "#fff" : "#ffd24a"; fctx.fillText(n, fx.width / 2, fx.height * 0.42); }
    }
  }
  const fmtTime = (t) => Math.floor(t / 60) + ":" + (t % 60).toFixed(2).padStart(5, "0");
  function bigOceanGeo() { if (!OCEAN_BIG) { OCEAN_BIG = new THREE.PlaneGeometry(260, 260, phone ? 120 : 180, phone ? 120 : 180); OCEAN_BIG.rotateX(-Math.PI / 2); } return OCEAN_BIG; }

  function startRoam(town, hooks, pose) {
    stopRoam(); if (!ok) return;
    clearWorld(); state = null; bubble = null; cancelFlag = false; th = HARBOR;
    setSize(phone ? 600 : 960, phone ? 760 : 540); canvas.classList.add("roam");
    const flats = town.flats.concat(town.decor.filter(d => PAD[d.kind]).map(d => ({ x: d.x, z: d.z, r: PAD[d.kind] * (d.s ? d.s / 2.4 : 1) })), town.props.map(p => ({ x: p.x, z: p.z, r: PAD[p.kind] || 1 })));
    const pl = town.flats[0]; for (const f of flats) if (f !== pl && Math.hypot(f.x - town.plaza.x, f.z - town.plaza.z) < town.plaza.r + 1) f.y = pl.y; // anything standing on the plaza stands at plaza height
    const height = makeHeight(town, flats);
    const r = roam = { town, hooks, height, colliders: [], platforms: [], trees: [], lamps: [], houseLights: [], windows: [], props: [], floats: [], beams: [], hands: [], fountains: [], input: { x: 0, y: 0 }, vel: new THREE.Vector3(), yaw: pose ? pose.yaw : Math.PI / 2, lean: 0, near: null, latch: null, target: null, lastDrag: -9, lights: 0, dustT: 0, sprayT: 0 };
    r.terrain = terrainMesh(town, height); world.add(r.terrain);
    const cobbles = paving().clone(); cobbles.repeat.set(town.plaza.r * 0.9, town.plaza.r * 0.9); cobbles.needsUpdate = true;
    const disc = mesh(new THREE.CircleGeometry(town.plaza.r, 48), std({ color: 0xffffff, roughness: 0.95, map: cobbles }), town.plaza.x, height(town.plaza.x, town.plaza.z) + 0.015, town.plaza.z); disc.rotation.x = -Math.PI / 2; disc.castShadow = false; world.add(disc);
    const put = (m, x, z, ry, s, lift) => { m.position.set(x, height(x, z) + (lift || 0), z); m.rotation.y = ry || 0; if (s) m.scale.setScalar(s); world.add(m); return m; };
    const faceCentre = (x, z) => Math.atan2(-x, -z); // models face +z, so this turns them toward the fountain
    for (const d of town.decor) {
      const s = d.s || 1, ry = d.ry !== undefined ? d.ry : faceCentre(d.x, d.z);
      switch (d.kind) {
        case "house": { const hm = put(house(), d.x, d.z, ry, s); hm.traverse(o => { if (o.isPointLight) r.houseLights.push(o); }); r.colliders.push({ x: d.x, z: d.z, r: 0.55 * s }); break; }
        case "tree": { const t = put(leafyTree(s * 1.25, d.x < -12 && d.z < -9 || Math.random() < 0.25), d.x, d.z, ry, 1, -0.04); r.trees.push(t); r.colliders.push({ x: d.x, z: d.z, r: 0.22 * s }); break; }
        case "rock": put(wall("rock", 0x8f7a5e), d.x, d.z, ry, s, -0.1); r.colliders.push({ x: d.x, z: d.z, r: 0.42 * s, low: s < 1.8 }); break;
        case "crate": put(wall("crate", 0xa8784f), d.x, d.z, ry, s); r.colliders.push({ x: d.x, z: d.z, r: 0.5 * s, low: true }); break;
        case "crystal": put(wall("crystal", 0x8ff0f4), d.x, d.z, ry, s); r.colliders.push({ x: d.x, z: d.z, r: 0.4 * s }); break;
        case "pillar": put(wall("pillar", 0x5f6d7c), d.x, d.z, ry, s); r.colliders.push({ x: d.x, z: d.z, r: 0.45 * s }); break;
        case "lamp": { const lm = put(lampMesh(r.lights++ < 8), d.x, d.z, 0, s); r.lamps.push({ light: lm.userData.light || { intensity: 0 }, bulb: lm.userData.bulb }); r.colliders.push({ x: d.x, z: d.z, r: 0.2 }); break; }
        case "fountain": put(fountainMesh(), d.x, d.z, 0, s); r.colliders.push({ x: d.x, z: d.z, r: 2.3 * s }); r.fountains.push({ x: d.x, z: d.z, y: height(d.x, d.z) + 1.7 * s }); break;
        case "tower": { const m = put(towerMesh(), d.x, d.z, ry, s); r.colliders.push({ x: d.x, z: d.z, r: 1.3 * s }); r.hands.push(m.userData.hand); break; }
        case "lighthouse": { const m = put(lighthouseMesh(), d.x, d.z, 0, s); r.colliders.push({ x: d.x, z: d.z, r: 1.4 * s }); r.beams.push(m.userData.beam); break; }
        case "dock": { const y = height(d.x, d.z); const m = dockMesh(d.len); m.position.set(d.x, y, d.z); world.add(m); r.platforms.push({ x1: d.x - 1.3, x2: d.x + 1.3, z1: d.z - 0.2, z2: d.z + d.len, y: y + 0.39 }); break; }
        case "stone": { const g = new THREE.Group(), geo = new THREE.CylinderGeometry(0.34, 0.52, 2.5, 7, 3); const pa = geo.attributes.position; for (let i = 0; i < pa.count; i++) { const k = 1 + Math.sin(i * 12.9898 + d.x) * 0.09; pa.setX(i, pa.getX(i) * k); pa.setZ(i, pa.getZ(i) * (2 - k)); } geo.computeVertexNormals();
          g.add(mesh(geo, std({ color: 0xffffff, map: texture("cobble", 0x9a9184), roughness: 0.95 }), 0, 1.15, 0)); g.rotation.z = Math.sin(d.x * 3.1) * 0.06; put(g, d.x, d.z, ry, s, -0.05); r.colliders.push({ x: d.x, z: d.z, r: 0.5 * s }); break; } // a standing stone
        case "wreck": { const m = boatMesh(true); m.position.set(d.x, height(d.x, d.z) - 0.45, d.z); m.rotation.set(0.1, ry, 0.34); world.add(m); r.colliders.push({ x: d.x, z: d.z, r: 2.3 }); break; }
        case "boat": case "ship": { const m = boatMesh(d.kind === "ship"); m.position.set(d.x, -0.1, d.z); m.rotation.y = ry; world.add(m); m.userData.phase = Math.random() * 6; r.floats.push(m); r.colliders.push({ x: d.x, z: d.z, r: d.kind === "ship" ? 2.6 : 1.3 }); break; }
      }
    }
    const SCALE = { portal: 2.0, stall: 1.35, sign: 1.3, npc: 1.0, race: 1.15, chest: 1.25 }, REACH = { portal: 0.6, stall: 0.9, sign: 0.5, npc: 0.45, race: 0.45, moor: 2.6, chest: 0.5 };
    for (const p of town.props) {
      const m = propMesh(p), s = SCALE[p.kind] || 1;
      if (p.kind === "portal") m.add(archMesh(p.locked ? 0x555a66 : p.color));
      put(m, p.x, p.z, p.ry !== undefined ? p.ry : faceCentre(p.x, p.z), s);
      m.userData.baseY = m.position.y; m.userData.home = m.rotation.y;
      r.props.push({ p, m, r: REACH[p.kind] || 0.5, s });
      if (p.kind === "moor") { const pl = r.platforms.find(f => p.x > f.x1 && p.x < f.x2 && p.z > f.z1 && p.z < f.z2); if (pl) m.position.y = pl.y; m.userData.baseY = m.position.y; // the post stands on the pier
        const bm = sailboatMesh(); bm.position.set(p.boat.x, -0.1, p.boat.z); bm.rotation.y = p.boat.ry || 0; bm.userData.phase = 1.3; world.add(bm); r.floats.push(bm); r.moor = { p, boat: bm }; continue; }
      if (p.kind !== "portal" && p.kind !== "door") r.colliders.push({ x: p.x, z: p.z, r: REACH[p.kind] || 0.5 });
      else if (p.kind === "portal") for (const side of [-1, 1]) r.colliders.push({ x: p.x + side * 1.36 * Math.cos(m.rotation.y), z: p.z - side * 1.36 * Math.sin(m.rotation.y), r: 0.22 }); // the gate's two pillars
    }
    // name tags keep one size on screen however close Bolt gets
    for (const q of r.props) q.m.traverse(o => { if (o.isSprite) { o.material = o.material.clone(); o.material.sizeAttenuation = false; const asp = o.scale.x / o.scale.y; o.scale.set(0.055 * asp * H / W / q.s, 0.055 / q.s, 1); } });
    robot = robotMesh(); const sx = pose ? pose.x : town.start.x, sz = pose ? pose.z : town.start.z;
    robot.position.set(sx, height(sx, sz), sz); robot.rotation.y = r.yaw; world.add(robot); r.bolt = robot;
    buildWalkGrid(r); addLife(r); initPlay(r); placeGold(r, town); buildMinimap(r); r.rain = makeRain(); world.add(r.rain);
    r.grass = grassField(town, height, r.colliders, flats); world.add(r.grass.mesh);
    r.clouds = cloudLayer(); world.add(r.clouds);
    const ht = heightTexture(town, height); r.ht = ht; Object.assign(ocean.material.uniforms, {}); ocean.material.uniforms.uHT.value = ht.tex; ocean.material.uniforms.uHas.value = 1; ocean.material.uniforms.uHOff.value.set(0, 0); ocean.material.uniforms.uHHalf.value = ht.half; ocean.material.uniforms.uHSize.value = ht.size;
    for (const q of r.props) if (q.p.kind === "portal" && Math.hypot(q.p.x - sx, q.p.z - sz) - q.r < 0.6) r.latch = q; // back from a level: do not reopen the gate you are standing in
    ocean.geometry = bigOceanGeo(); ocean.position.set(0, -0.1, 0);
    r.lightDir = applyWeather(HARBOR, new THREE.Vector3(sx, 0, sz), 17);
    r.stars = makeStars(); world.add(r.stars); r.moon = moonMesh(); world.add(r.moon); applyTimeOfDay(r, true);
    if (pose && pose.sail && r.moor) roamApi.sail(true, pose);
    cam.az = Math.atan2(-Math.cos(r.yaw), Math.sin(r.yaw)); cam.el = 0.3; cam.dist = phone ? 6.2 : 5.4; cam.introK = 0; cam.look.set(sx, height(sx, sz) + 0.9, sz);
  }
  function stopRoam() { restoreOutdoor(); if (camera && camera.fov !== 38) { camera.fov = 38; camera.updateProjectionMatrix(); } if (!roam) return; stopRace(); if (window.Audio_) { Audio_.engine(null); if (Audio_.rain) Audio_.rain(0); } if (roam.ht) roam.ht.tex.dispose(); ocean.material.uniforms.uHas.value = 0; roam = null; canvas.classList.remove("roam"); ocean.geometry = OCEAN_LEVEL; }

  function roamFrame(dt) {
    const r = roam, b = r.bolt, BASE = 4.4;
    r.boosting = r.boostOn && r.energy > (r.boosting ? 0.01 : 0.2) && !r.indoor; const MAX = (r.boosting ? 7.6 : BASE) * (r.sail ? 1.35 : 1); // Shift: faster while the blue bar lasts; the boat is quicker still
    // where does the player want to go? keys and the joystick are relative to the camera; a click or tap sets a target
    let dx = 0, dz = 0;
    if (r.target) {
      const wp = r.path && r.path.length ? r.path[0] : r.target; // next corner of the route, then the target itself
      dx = wp.x - b.position.x; dz = wp.z - b.position.z; const d = Math.hypot(dx, dz) || 1e-6;
      if (wp !== r.target) { if (d < 0.6) r.path.shift(); dx /= d; dz /= d; }
      else if (d < 0.35) { const tp = r.target.prop; r.target = null; dx = dz = 0; if (tp && r.hooks.onInteract) r.hooks.onInteract(tp); }
      else { dx /= d; dz /= d; if (d < 1.5) { dx *= 0.6; dz *= 0.6; } }
      r.stuck = Math.hypot(r.vel.x, r.vel.z) < 0.3 && clock > 1 ? r.stuck + dt : 0; if (r.stuck > 1.5) { r.target = null; r.path = null; } // boxed in: give up quietly
    } else if (r.input.x || r.input.y) {
      const a = cam.az, fwx = -Math.sin(a), fwz = -Math.cos(a), rx = Math.cos(a), rz = -Math.sin(a);
      dx = fwx * r.input.y + rx * r.input.x; dz = fwz * r.input.y + rz * r.input.x; const l = Math.hypot(dx, dz); if (l > 1) { dx /= l; dz /= l; }
    }
    if (r.frozen || r.photo) { dx = dz = 0; } // the rally countdown, or posing for a photo
    const want = r.target || r.input.x || r.input.y, k = Math.min(1, dt * (want ? 6 : 9)) * (r.air > 0 ? 0.35 : 1); // less grip in the air
    r.vel.x += (dx * MAX - r.vel.x) * k; r.vel.z += (dz * MAX - r.vel.z) * k;
    const sp = Math.hypot(r.vel.x, r.vel.z);
    r.energy = r.boosting && sp > 1 ? Math.max(0, r.energy - dt * 0.32) : Math.min(1, r.energy + dt * 0.16);
    // move, then get pushed out of things and away from the water (the pier is the one place you can drive over it)
    let nx = b.position.x + r.vel.x * dt, nz = b.position.z + r.vel.z * dt;
    for (const c of r.colliders) { if (c.low && r.air > 0.4) continue; const ex = nx - c.x, ez = nz - c.z, d = Math.hypot(ex, ez), min = c.r + 0.42; if (d < min && d > 1e-4) { nx = c.x + ex / d * min; nz = c.z + ez / d * min; } }
    for (const o of r.movers) { const ex = nx - o.g.position.x, ez = nz - o.g.position.z, d = Math.hypot(ex, ez), min = o.r + 0.4; if (d < min && d > 1e-4) { nx = o.g.position.x + ex / d * min; nz = o.g.position.z + ez / d * min; } }
    const plat = (x, z) => r.platforms.find(p => x > p.x1 && x < p.x2 && z > p.z1 && z < p.z2);
    const gy = (x, z) => { const p = plat(x, z); return p ? p.y : r.height(x, z); };
    const bad = (x, z) => r.sail ? gy(x, z) > -0.5 : gy(x, z) < -0.04; // on foot the sea stops you; in the boat the shore does
    if (bad(nx, nz)) { if (!bad(nx, b.position.z)) nz = b.position.z; else if (!bad(b.position.x, nz)) nx = b.position.x; else { nx = b.position.x; nz = b.position.z; } r.vel.multiplyScalar(0.5); r.target = null; }
    b.position.x = nx; b.position.z = nz; const bob = Math.sin(clock * 1.3) * 0.06, y = r.sail ? -0.12 + bob + 0.5 : gy(nx, nz);
    if (r.sail) { const bt = r.moor.boat; bt.position.set(nx + Math.cos(r.yaw) * 0.45, -0.12 + bob, nz - Math.sin(r.yaw) * 0.45); // Bolt rides behind the mast bt.rotation.set(Math.sin(clock * 1.1) * 0.04 - r.lean * 1.5, r.yaw, Math.cos(clock * 0.9) * 0.03); r.jumpReq = false;
      r.wakeT = (r.wakeT || 0) - dt; if (sp > 1 && r.wakeT <= 0) { r.wakeT = 0.04; const c0 = Math.cos(r.yaw), s0 = -Math.sin(r.yaw); burst(nx - c0 * 1.7, nz - s0 * 1.7, 0xf4fbff, 3, 0.7, -0.05); burst(nx + c0 * 1.75, nz + s0 * 1.75, 0xe6f4ff, 1, 0.6, -0.02);
      if (bt.userData.flag2) bt.userData.flag2.rotation.y = Math.sin(clock * 7) * 0.3; }
      if (!r.sailOut && Math.hypot(nx, nz) > r.town.radius + 15 && r.hooks.onSail) { r.sailOut = true; r.vel.set(0, 0, 0); r.hooks.onSail(); } }
    // Space: jump. Up with a puff of dust, down with a thump and a little squash
    if (r.jumpReq && r.air <= 0 && !r.frozen) { r.vy = 5.2; r.air = 0.001; if (window.Audio_) Audio_.play("jump"); burst(nx, nz, y < 0.35 ? 0xe0cfa2 : 0xb8c99a, 6, 0.8, y + 0.05); }
    r.jumpReq = false;
    if (r.air > 0) { r.vy -= 14 * dt; r.air += r.vy * dt; if (r.air <= 0) { r.air = 0; r.vy = 0; r.landK = 1; burst(nx, nz, y < 0.35 ? 0xe0cfa2 : 0xb8c99a, 10, 1.2, y + 0.05); if (window.Audio_) Audio_.play("land"); } }
    r.gyS += (y - r.gyS) * Math.min(1, dt * 12); b.position.y = r.gyS + r.air;
    r.landK = Math.max(0, r.landK - dt * 5); b.scale.set(1 + r.landK * 0.08, 1 - r.landK * 0.14 + (r.air > 0 ? Math.min(0.06, r.vy * 0.012) : 0), 1 + r.landK * 0.08);
    // face the way we go, lean into turns, rock with the ground, bob, kick up dust
    if (sp > 0.3) {
      const ty = Math.atan2(-r.vel.z, r.vel.x); let d = ty - r.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const step = Math.sign(d) * Math.min(Math.abs(d), dt * 8); r.yaw += step; r.lean += (step / Math.max(dt, 1e-3) * 0.045 * Math.min(1, sp / MAX) - r.lean) * Math.min(1, dt * 8);
    } else r.lean *= 1 - Math.min(1, dt * 8);
    b.rotation.y = r.yaw;
    const e = 0.35, hx = r.sail ? 0 : (gy(nx + e, nz) - gy(nx - e, nz)) / (2 * e), hz = r.sail ? 0 : (gy(nx, nz + e) - gy(nx, nz - e)) / (2 * e);
    const cy = Math.cos(r.yaw), sy = -Math.sin(r.yaw), along = hx * cy + hz * sy, across = -hx * sy + hz * cy;
    const body = b.userData.body, kb = Math.min(1, dt * 8);
    const fwd = r.vel.x * cy + r.vel.z * sy, acc = (fwd - r.prevFwd) / Math.max(dt, 1e-3); r.prevFwd = fwd; r.pitch += (Math.max(-0.14, Math.min(0.14, acc * 0.012)) - r.pitch) * Math.min(1, dt * 6); // nose lifts when he pulls away, dips when he brakes
    body.rotation.z += (Math.atan(along) * 0.9 + r.pitch - body.rotation.z) * kb; body.rotation.x += (-Math.atan(across) * 0.9 - r.lean - body.rotation.x) * kb;
    body.position.y = b.userData.bodyY + Math.sin(clock * 16) * 0.006 * (sp / MAX);
    r.tracks.dist += sp * dt; if (r.tracks.dist > 0.2 && !plat(nx, nz) && !r.air && !r.sail) { r.tracks.dist = 0; dropTrack(r, nx, nz, r.yaw, y < 0.35); }
    if (r.boosting && sp > 2) { r.boostT -= dt; if (r.boostT <= 0) { r.boostT = 0.03; burst(nx - cy * 0.5, nz - sy * 0.5, 0x7fd8ff, 2, 0.5, b.position.y + 0.35); } }
    r.dustT -= dt; if (sp > 1.2 && r.dustT <= 0 && !plat(nx, nz) && !r.air && !r.sail) { r.dustT = 0.07; burst(nx - cy * 0.45, nz - sy * 0.45, y < 0.35 ? 0xe0cfa2 : 0xb8c99a, 2, 0.45, y + 0.08); }
    // townsfolk turn to face Bolt when he drives up; portals spin; boats bob; the lighthouse sweeps; the fountain sprays
    for (const q of r.props) {
      const m = q.m; if (m.userData.spin) m.userData.spin.rotation.y += dt * 0.8;
      if (m.userData.lid) m.userData.lid.rotation.x += (m.userData.lidTo - m.userData.lid.rotation.x) * Math.min(1, dt * 5);
      if (m.userData.flag) { const pa = m.userData.flag.geometry.attributes.position; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i) + 0.4; pa.setZ(i, Math.sin(clock * 6 - x * 6) * 0.06 * x); } pa.needsUpdate = true; }
    }
    lifeFrame(r, dt, nx, nz); goldFrame(r, dt, b); marksFrame(r, dt); if (r.race) raceFrame(r, dt, b); if (r.rain) rainFrame(r, dt);
    if (window.Audio_) Audio_.engine(Math.min(1.5, sp / BASE));
    for (const t of r.trees) { const c = t.userData.crown; c.rotation.z = Math.sin(clock * 1.1 + t.userData.phase) * 0.025; c.rotation.x = Math.sin(clock * 0.8 + t.userData.phase * 1.7) * 0.02; }
    if (!r.indoor) { r.grass.uni.uTime.value = clock; r.grass.uni.uBolt.value.set(nx, b.position.y, nz); r.clouds.material.uniforms.uTime.value = clock; }
    for (const f of r.floats) { f.position.y = -0.08 + Math.sin(clock * 1.1 + f.userData.phase) * 0.06; f.rotation.z = Math.sin(clock * 0.9 + f.userData.phase) * 0.03; f.rotation.x = Math.cos(clock * 0.7 + f.userData.phase) * 0.025; }
    for (const t of r.beams) t.position.set(Math.cos(clock * 0.5) * 14, 5.5, Math.sin(clock * 0.5) * 14);
    for (const h of r.hands) h.rotation.z = -clock * 0.3;
    r.sprayT -= dt; if (r.sprayT <= 0) { r.sprayT = 0.05; for (const f of r.fountains) burst(f.x, f.z, 0xbfe9ff, 2, 1.6, f.y); }
    // the sun (and its shadow box) travels with Bolt so shadows stay sharp wherever he is
    if (!r.indoor) tickTime(r, dt); else interiorFrame(r, dt);
    sun.position.copy(b.position).addScaledVector(r.lightDir, 30); sun.target.position.copy(b.position);
    // who is close enough to talk to? driving into a portal ring opens it
    let best = null, bd = 1e9;
    for (const q of r.props) { const d = Math.hypot(q.p.x - nx, q.p.z - nz) - q.r; if (d < 1.7 && d < bd) { bd = d; best = q; } }
    if (best !== r.near) { r.near = best; if (r.hooks.onNear) r.hooks.onNear(best ? best.p : null); }
    if (best && !r.race && (best.p.kind === "portal" || best.p.kind === "door" || best.p.kind === "exit") && bd < 0.3) { if (r.latch !== best) { r.latch = best; r.vel.set(0, 0, 0); r.target = null; if (r.hooks.onEnter) r.hooks.onEnter(best.p); } }
    else if (!best || best !== r.latch) r.latch = null;
    // chase camera: swings in behind Bolt while he drives, unless the player just dragged it
    cam.introK = Math.min(1, cam.introK + dt / 1.4); const ik = 1 - Math.pow(1 - cam.introK, 3);
    if (sp > 0.5 && clock - r.lastDrag > 1.5 && !r.photo) { const behind = Math.atan2(-Math.cos(r.yaw), Math.sin(r.yaw)); let d = behind - cam.az; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; const fwd = Math.max(0, (-Math.sin(cam.az) * r.vel.x - Math.cos(cam.az) * r.vel.z) / sp); cam.az += d * Math.min(1, dt * (0.4 + 1.4 * fwd)); } // swing round faster the more Bolt drives away from the camera, barely when he strafes
    cam.look.lerp(new THREE.Vector3(nx, r.gyS + r.air * 0.45 + 0.9, nz), Math.min(1, dt * 7));
    const fovT = r.boosting && sp > 3 ? 46 : 38; if (Math.abs(camera.fov - fovT) > 0.02) { camera.fov += (fovT - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); } // speed rush
    const dist = cam.dist * (1 + (1 - ik) * 1.4) * (r.sail ? 1.5 : 1), el = cam.el + (1 - ik) * 0.5;
    camera.position.set(cam.look.x + Math.sin(cam.az) * Math.cos(el) * dist, cam.look.y + Math.sin(el) * dist, cam.look.z + Math.cos(cam.az) * Math.cos(el) * dist);
    const floorY = Math.max(r.height(camera.position.x, camera.position.z), -0.05) + 0.5; if (camera.position.y < floorY) camera.position.y = floorY;
    camera.lookAt(cam.look);
  }
  function roamClick(e) {
    const r = roam, rc = canvas.getBoundingClientRect(); ndc.set((e.clientX - rc.left) / rc.width * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(r.props.map(q => q.m), true);
    if (hits.length) {
      let o = hits[0].object, q = null; while (o && !q) { q = r.props.find(q => q.m === o); o = o.parent; }
      if (q) { if (q === r.near) { if (r.hooks.onInteract) r.hooks.onInteract(q.p); } else { const ex = r.bolt.position.x - q.p.x, ez = r.bolt.position.z - q.p.z, d = Math.hypot(ex, ez) || 1, back = q.r + 0.9; setTarget(r, q.p.x + ex / d * back, q.p.z + ez / d * back, q.p); } return; }
    }
    const g = ray.intersectObject(r.terrain); if (g.length && r.height(g[0].point.x, g[0].point.z) > -0.04) setTarget(r, g[0].point.x, g[0].point.z);
  }
  function drawPrompt() {
    const r = roam; if (!r || !r.near || r.race || r.photo || !modalHidden()) return;
    const q = r.near, p = q.p, name = p.label.replace(/^\S+\s/, "");
    const text = (phone ? "Tap Talk" : "E") + "  ·  " + (p.kind === "portal" ? (p.locked ? "sealed: " : "enter ") + name : p.kind === "npc" ? "talk to " + name : p.kind === "door" ? "go into " + name : p.kind === "exit" ? "back to town" : p.kind === "spot" ? name.split(":")[0] : p.kind === "moor" ? (r.sail ? "tie up and go ashore" : "board your boat") : p.kind === "chest" ? (p.open ? "an empty chest" : "open the chest") : "open the " + name);
    const v = new THREE.Vector3(q.m.position.x, q.m.position.y + 1.55 * q.s, q.m.position.z).project(camera);
    if (v.z > 1) return;
    const sx = (v.x + 1) / 2 * fx.width, sy = (1 - v.y) / 2 * fx.height;
    fctx.font = "700 15px Nunito, sans-serif"; const w = fctx.measureText(text).width + 22;
    const bx = Math.min(Math.max(sx - w / 2, 4), fx.width - w - 4), by = Math.max(sy - 16, 4);
    fctx.fillStyle = "rgba(22,30,44,0.82)"; fctx.beginPath(); fctx.roundRect(bx, by, w, 30, 15); fctx.fill();
    fctx.fillStyle = "#fff"; fctx.textAlign = "left"; fctx.textBaseline = "middle"; fctx.fillText(text, bx + 11, by + 15);
  }
  const modalHidden = () => { const m = document.getElementById("modal"); return !m || m.hidden; };
  const roamApi = {
    start: startRoam, stop: stopRoam, enter: startInterior, get indoor() { return !!(roam && roam.indoor); },
    input(x, y) { if (roam) { roam.input.x = x; roam.input.y = y; if (x || y) { roam.target = null; roam.path = null; } } },
    near() { return roam && roam.near ? roam.near.p : null; },
    goto(x, z, prop) { if (roam) setTarget(roam, x, z, prop); }, // drive there on autopilot (a click on the ground does this)
    talking(id) { if (roam) roam.talking = id || null; },
    sail(on, at) { const r = roam; if (!r || !r.moor || r.indoor) return false; const bt = r.moor.boat, b = r.bolt, mp = r.moor.p;
      if (on) { const x = at ? at.x : mp.boat.x, z = at ? at.z : mp.boat.z; r.sail = true; r.sailOut = false; r.floats = r.floats.filter(f => f !== bt); b.position.set(x, 0.5, z); r.yaw = at ? at.yaw : (mp.boat.ry || 0); b.rotation.y = r.yaw; r.gyS = 0.5; r.air = 0; r.vy = 0; r.vel.set(0, 0, 0); r.target = null; r.path = null; cam.az = Math.atan2(-Math.cos(r.yaw), Math.sin(r.yaw)); r.lastDrag = -9; }
      else { r.sail = false; bt.position.set(mp.boat.x, -0.1, mp.boat.z); bt.rotation.set(0, mp.boat.ry || 0, 0); r.floats.push(bt); const y = r.platforms.find(f => mp.land.x > f.x1 && mp.land.x < f.x2 && mp.land.z > f.z1 && mp.land.z < f.z2); b.position.set(mp.land.x, y ? y.y : r.height(mp.land.x, mp.land.z), mp.land.z); r.gyS = b.position.y; r.vel.set(0, 0, 0); r.yaw = mp.land.yaw || 0; b.rotation.y = r.yaw; cam.az = Math.atan2(-Math.cos(r.yaw), Math.sin(r.yaw)); }
      return true; },
    get sailing() { return !!(roam && roam.sail); },
    openChest(id) { const q = roam && roam.props.find(q => q.p.kind === "chest" && q.p.id === id); if (!q) return; q.p.open = true; q.m.userData.lidTo = -1.9; for (let k = 0; k < 3; k++) burst(q.p.x, q.p.z, [0xffd24a, 0xfff2b0, 0xffb020][k], 12, 1.6, q.m.position.y + 0.5); },
    photo(on) { const r = roam; if (!r) return; r.photo = !!on; r.input.x = r.input.y = 0; r.target = null; r.boostOn = false; for (const q of r.props) q.m.traverse(o => { if (o.isSprite) { if (on) { o.userData.was = o.visible; o.visible = false; } else if (o.userData.was !== undefined) o.visible = o.userData.was; } }); },
    snapshot() { if (!roam) return null; if (quality === "realistic") composer.render(); else renderer.render(scene, camera); return canvas.toDataURL("image/jpeg", 0.92); },
    jump() { if (roam) roam.jumpReq = true; }, boost(on) { if (roam) roam.boostOn = !!on; },
    race: { start: (course, done) => startRace(course, done), stop: () => stopRace(), get on() { return !!(roam && roam.race); } }, // the townsperson in conversation nods and gestures
    pose() { return roam ? { x: roam.bolt.position.x, z: roam.bolt.position.z, yaw: roam.yaw, sail: !!roam.sail } : null; },
    // for tests: advance the town by dt seconds and draw it, without waiting for the animation loop
    step(dt = 1 / 60) { if (roam) { clock += dt; roamFrame(dt); stepParticles(dt); } },
    render() { if (roam) { if (quality === "realistic") composer.render(); else renderer.render(scene, camera); drawBubble(); drawPrompt(); drawHud(); } },
    get active() { return !!roam; },
    get debug() { return roam; }, // for tests in the console
  };

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
    cancelFlag = false; ride.playing = events.length > 2;
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
    ride.playing = false;
    sync();
  }
  function cancel() { cancelFlag = true; }
  function celebrate() { if (!ok || !state || !state.goal) return; for (let i = 0; i < 4; i++) setTimeout(() => burst(state.goal.x, state.goal.y, [0x5fcf8f, 0xf0b24a, 0x7fb3ff, 0xff7b72][i], 30, 3), i * 180); }

  return { init, load, draw, play, cancel, celebrate, setActive, setQuality, setPaint, setLook, pickTile, setFollow, setTimeMode, setWeatherMode, get rain() { return rainNow; }, set rain(v) { rainNow = rainTarget = v; if (roam) roam.todT = 99; }, get townTime() { return townTime; }, set townTime(v) { townTime = v; if (roam) roam.todT = 99; }, get scene() { return scene; }, get ride() { return ride; }, tick: (ms) => { lastNow = performance.now() - ms; tick(performance.now()); }, roam: roamApi, get ok() { return ok; } };
})();
window.Render3D = Render3D;
window.dispatchEvent(new Event("render3d-ready"));
