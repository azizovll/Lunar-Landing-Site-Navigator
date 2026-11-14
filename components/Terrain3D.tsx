"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { frameVectors, type Vec3 } from "@/lib/astro";
import { SITES, fmtLatLon, resolvePreset } from "@/lib/sites";
import { DAY, alignTime, sampleAt, sampleSeries, windowMetrics } from "@/lib/metrics";
import { NEIGHBORS } from "@/lib/neighbors";

/**
 * 3D terrain of the lunar south pole (home page hero).
 *
 * - Relief: NASA LOLA polar DEMs (pipeline/build_terrain3d.py), 513×513 grid at ~1.3 km, ±330 km
 *   around the pole, placed on the true 1737.4 km sphere so the far terrain drops below the
 *   horizon naturally. Relief ×2 for visibility.
 * - Light: the real Sun direction at `timeMs` (lib/astro.ts, validated against JPL Horizons), with
 *   shadows, plus faint Earthshine from Earth's real direction.
 * - Earth in the sky at its real direction (shown 2.5× larger than true size), phase from the same Sun.
 * - Pins for every south-polar preset; clicking one flies the camera to it.
 *
 * Scene units are km. Local frame at the pole: X = body x, Y = −body z − R (up, 0 at the datum
 * pole), Z = body y.
 */

const R_KM = 1737.4;
const EXAG = 2;
const D2R = Math.PI / 180;
const OVERVIEW = { radius: 300, phi: 1.24 };
/** lander model height scale (km per model unit): ~1.2 km tall, i.e. ~300x a real lander */
const LANDER_KM = 1.15;
const ZOOM = { radius: 55, phi: 1.2 };
const dir = (v: Vec3): [number, number, number] => {
  const n = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / n, -v[2] / n, v[1] / n];
};
function surface(latDeg: number, lonDeg: number, hM: number): [number, number, number] {
  const la = latDeg * D2R;
  const lo = lonDeg * D2R;
  const r = R_KM + (EXAG * hM) / 1000;
  return [r * Math.cos(la) * Math.cos(lo), -r * Math.sin(la) - R_KM, r * Math.cos(la) * Math.sin(lo)];
}

interface Props {
  selectedId: string | null;
  timeMs: number;
  onSelect: (id: string) => void;
  fallback: React.ReactNode;
}

const SOUTH_SITES = SITES.filter((s) => s.lat <= -80);
/** Hardware already on the surface inside the 3D area (Odysseus is shown as a station already). */
const HARDWARE = NEIGHBORS.filter((n) => n.kind !== "planned" && (n.lat ?? 0) <= -80 && n.id !== "im1-odysseus-hw");

export function Terrain3D({ selectedId, timeMs, onSelect, fallback }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const pins = useRef<Record<string, HTMLButtonElement | null>>({});
  const hwEls = useRef<Record<string, HTMLSpanElement | null>>({});
  const thumb = useRef<HTMLDivElement>(null);
  const caret = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef<string | null>(null);
  const api = useRef<{ setTime: (t: number) => void; flyTo: (id: string | null) => void; standAt: (id: string) => void } | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  // timelapse / stand-on-surface / guided tour
  const [playing, setPlaying] = useState(false);
  const [speedH, setSpeedH] = useState(24); // simulated hours per real second
  const [sceneT, setSceneT] = useState(timeMs);
  const sceneTRef = useRef(timeMs);
  /** page time at which the timelapse/tour took over the scene clock (null = follow the page) */
  const [playBase, setPlayBase] = useState<number | null>(null);
  const runningRef = useRef(false);
  const [standing, setStanding] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const [touring, setTouring] = useState(false);
  const tourId = useRef(0);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
      const el = mount.current;
      if (disposed || !el) return;
      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        setFailed(true);
        return;
      }
      const small = el.clientWidth < 640;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      el.appendChild(renderer.domElement);
      renderer.domElement.style.touchAction = "pan-y";

      const loader = new THREE.TextureLoader();
      const [meta, buf, earthTex, normalTex, regolithTex] = await Promise.all([
        fetch("/data/terrain/south.json").then((r) => r.json()),
        fetch("/data/terrain/south.bin").then((r) => r.arrayBuffer()),
        loader.loadAsync("/data/terrain/earth.jpg"),
        loader.loadAsync("/data/terrain/normal.jpg"),
        loader.loadAsync("/data/terrain/regolith.jpg"),
      ]);
      if (disposed) {
        renderer.dispose();
        return;
      }
      const heights = new Int16Array(buf);
      const N: number = meta.n;
      const scale: number = meta.scaleM;
      const off = (N - 1) / 2;
      const heightAt = (lat: number, lon: number) => {
        const rho = 2 * R_KM * 1000 * Math.tan(Math.PI / 4 + (lat * D2R) / 2);
        const line = Math.round(off - (rho * Math.cos(lon * D2R)) / scale);
        const samp = Math.round(off + (rho * Math.sin(lon * D2R)) / scale);
        return heights[Math.min(N - 1, Math.max(0, line)) * N + Math.min(N - 1, Math.max(0, samp))];
      };

      // ---- terrain mesh (stride 2 on small screens)
      const stride = small ? 2 : 1;
      const M = Math.floor((N - 1) / stride) + 1;
      const pos = new Float32Array(M * M * 3);
      const uv = new Float32Array(M * M * 2);
      // vertex colours fade the terrain to black towards its outer edge, so the square mesh border never shows
      const col = new Float32Array(M * M * 3);
      const half: number = meta.halfM;
      for (let a = 0; a < M; a++)
        for (let b = 0; b < M; b++) {
          const i = a * stride;
          const j = b * stride;
          const x = (j - off) * scale;
          const y = (off - i) * scale;
          const rho = Math.hypot(x, y);
          const lat = (2 * Math.atan(rho / (2 * R_KM * 1000))) / D2R - 90;
          const lon = Math.atan2(x, y) / D2R;
          const p = surface(lat, lon, heights[i * N + j]);
          pos.set(p, (a * M + b) * 3);
          uv[(a * M + b) * 2] = j / (N - 1);
          uv[(a * M + b) * 2 + 1] = 1 - i / (N - 1);
          const f = Math.min(1, Math.max(0, (1 - rho / half) / 0.22));
          const ff = f * f * (3 - 2 * f);
          col[(a * M + b) * 3] = col[(a * M + b) * 3 + 1] = col[(a * M + b) * 3 + 2] = ff;
        }
      const idx = new Uint32Array((M - 1) * (M - 1) * 6);
      let k = 0;
      for (let a = 0; a < M - 1; a++)
        for (let b = 0; b < M - 1; b++) {
          const i0 = a * M + b;
          const i1 = i0 + M;
          // counter-clockwise seen from above (normals point up, away from the Moon's centre)
          idx[k++] = i0;
          idx[k++] = i1;
          idx[k++] = i0 + 1;
          idx[k++] = i0 + 1;
          idx[k++] = i1;
          idx[k++] = i1 + 1;
        }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeVertexNormals();
      // Fine relief: object-space normal map (~430 m/px, from LOLA) lit by the real Sun; regolith grain tiles on top.
      normalTex.anisotropy = 8;
      regolithTex.wrapS = regolithTex.wrapT = THREE.RepeatWrapping;
      regolithTex.repeat.set(72, 72);
      regolithTex.colorSpace = THREE.SRGBColorSpace;
      regolithTex.anisotropy = 8;
      const mat = new THREE.MeshStandardMaterial({
        color: 0xd2d2d6,
        map: regolithTex,
        normalMap: normalTex,
        normalMapType: THREE.ObjectSpaceNormalMap,
        vertexColors: true,
        roughness: 1,
        metalness: 0,
      });
      const ground = new THREE.Mesh(geo, mat);
      ground.receiveShadow = true;
      ground.castShadow = true;

      const scene = new THREE.Scene();
      scene.add(ground);
      scene.fog = new THREE.Fog(0x000000, 300, 800);

      // ---- lights
      const sun = new THREE.DirectionalLight(0xffffff, 3.4);
      sun.castShadow = true;
      sun.shadow.mapSize.set(small ? 2048 : 4096, small ? 2048 : 4096);
      const sc = sun.shadow.camera;
      sc.left = -380;
      sc.right = 380;
      sc.top = 380;
      sc.bottom = -380;
      sc.near = 1;
      sc.far = 2400;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.8;
      scene.add(sun, sun.target);
      const earthshine = new THREE.DirectionalLight(0xc9dcff, 0.45);
      scene.add(earthshine);
      // Readability fill: a soft sky/ground light so slopes in shadow still show their shape.
      // The direct light and its long shadows stay physically placed.
      scene.add(new THREE.HemisphereLight(0x9a9aa2, 0x050506, 0.6));

      // ---- Earth (2.5× true angular size) and Sun glow, far away, unaffected by fog
      const SKY = 1600;
      const earthR = SKY * Math.tan(2.5 * 0.95 * D2R);
      earthTex.colorSpace = THREE.SRGBColorSpace;
      const earth = new THREE.Mesh(new THREE.SphereGeometry(earthR, 48, 32), new THREE.MeshStandardMaterial({ map: earthTex, roughness: 0.9, fog: false }));
      scene.add(earth);
      const glowCanvas = document.createElement("canvas");
      glowCanvas.width = glowCanvas.height = 128;
      const g = glowCanvas.getContext("2d")!;
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, "rgba(255,250,235,1)");
      grad.addColorStop(0.12, "rgba(255,240,210,0.9)");
      grad.addColorStop(0.35, "rgba(255,220,170,0.18)");
      grad.addColorStop(1, "rgba(255,220,170,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
      const glowTex = new THREE.CanvasTexture(glowCanvas);
      const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
      sunSprite.scale.set(160, 160, 1);
      scene.add(sunSprite);

      // Faint star field (decorative): random directions on a far sphere, a few brighter stars.
      const STARS = 1600;
      const starPos = new Float32Array(STARS * 3);
      const starCol = new Float32Array(STARS * 3);
      let seed = 12345;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let q = 0; q < STARS; q++) {
        const u = rnd() * 2 - 1;
        const th = rnd() * Math.PI * 2;
        const r = Math.sqrt(1 - u * u);
        starPos.set([r * Math.cos(th) * 2600, u * 2600, r * Math.sin(th) * 2600], q * 3);
        const b = 0.25 + Math.pow(rnd(), 6) * 0.75;
        starCol.set([b, b, b * (0.92 + rnd() * 0.08)], q * 3);
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
      starGeo.setAttribute("color", new THREE.BufferAttribute(starCol, 3));
      const starMat = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, opacity: 0.85, depthWrite: false });
      scene.add(new THREE.Points(starGeo, starMat));

      const setTime = (t: number) => {
        const fv = frameVectors(new Date(t));
        const s = dir(fv.sun);
        const e = dir(fv.earth);
        sun.position.set(s[0] * 1200, s[1] * 1200, s[2] * 1200);
        sun.target.position.set(0, 0, 0);
        earthshine.position.set(e[0] * 10, e[1] * 10, e[2] * 10);
        earth.position.set(e[0] * SKY, e[1] * SKY, e[2] * SKY);
        sunSprite.position.set(s[0] * SKY, s[1] * SKY, s[2] * SKY);
        return { s, e };
      };
      const { e: earthDir } = setTime(timeMs);

      // ---- camera + controls: overview from the far side of the pole, Earth beyond the terrain
      const camera = new THREE.PerspectiveCamera(38, 1, 1, 6000);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.enableZoom = false;
      controls.rotateSpeed = 0.5;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      controls.autoRotate = !reduceMotion;
      controls.autoRotateSpeed = 0.25;
      const TILT = 0.22;
      let phi0 = OVERVIEW.phi;
      const setTiltRange = () => {
        controls.minPolarAngle = phi0 - TILT;
        controls.maxPolarAngle = phi0 + TILT * 0.7;
      };
      setTiltRange();
      let dragging = false;
      controls.addEventListener("start", () => {
        dragging = true;
        controls.autoRotate = false;
      });
      controls.addEventListener("end", () => {
        dragging = false;
        if (!reduceMotion) setTimeout(() => !dragging && !flight && (controls.autoRotate = true), 5000);
      });
      const theta0 = Math.atan2(earthDir[0], earthDir[2]) + Math.PI; // stand opposite Earth, look across the pole
      const sph = new THREE.Spherical(OVERVIEW.radius, OVERVIEW.phi, theta0);
      camera.position.setFromSpherical(sph);
      controls.target.set(0, 0, 0);
      controls.update();

      // ---- pin anchors (world positions slightly above the ground)
      const radial = (lat: number, lon: number) => {
        const la = lat * D2R;
        const lo = lon * D2R;
        return new THREE.Vector3(Math.cos(la) * Math.cos(lo), -Math.sin(la), Math.cos(la) * Math.sin(lo));
      };
      const anchors = SOUTH_SITES.map((s) => {
        const p = surface(s.lat, s.lon, heightAt(s.lat, s.lon));
        const up = radial(s.lat, s.lon);
        const ground = new THREE.Vector3(p[0], p[1], p[2]);
        return { id: s.id, ground, up, pos: ground.clone().addScaledVector(up, LANDER_KM * 1.9) };
      });

      // ---- lander models: built from primitives (no model files to download), shared geometry and
      // materials, enlarged ~300x so they are visible from orbit. The solar panel turns to the real Sun
      // and the dish points at the real Earth.
      const metal = new THREE.MeshStandardMaterial({ color: 0xd8d8dc, roughness: 0.45, metalness: 0.6 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.6, metalness: 0.3 });
      const cell = new THREE.MeshStandardMaterial({ color: 0x1d2a44, roughness: 0.35, metalness: 0.5, emissive: 0x0a1222 });
      const gBody = new THREE.CylinderGeometry(0.34, 0.42, 0.5, 8);
      const gTop = new THREE.CylinderGeometry(0.2, 0.34, 0.18, 8);
      const gLeg = new THREE.CylinderGeometry(0.025, 0.025, 0.62, 6);
      const gPad = new THREE.CylinderGeometry(0.09, 0.09, 0.03, 10);
      const gMast = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6);
      const gPanel = new THREE.BoxGeometry(0.9, 0.42, 0.02);
      const gDish = new THREE.CylinderGeometry(0.2, 0.03, 0.1, 16, 1, true).rotateX(Math.PI / 2);
      const landers = anchors.map((a) => {
        const g = new THREE.Group();
        const add = (geo: import("three").BufferGeometry, m: import("three").Material, x: number, y: number, z: number) => {
          const mesh = new THREE.Mesh(geo, m);
          mesh.position.set(x, y, z);
          mesh.castShadow = true;
          g.add(mesh);
          return mesh;
        };
        add(gBody, metal, 0, 0.55, 0);
        add(gTop, dark, 0, 0.89, 0);
        for (let q = 0; q < 4; q++) {
          const ang = (q * Math.PI) / 2 + Math.PI / 4;
          const leg = add(gLeg, metal, Math.cos(ang) * 0.42, 0.28, Math.sin(ang) * 0.42);
          leg.rotation.set(Math.sin(ang) * 0.45, 0, -Math.cos(ang) * 0.45);
          add(gPad, dark, Math.cos(ang) * 0.56, 0.015, Math.sin(ang) * 0.56);
        }
        const panelPivot = new THREE.Group();
        panelPivot.position.set(0, 0.98, 0);
        g.add(panelPivot);
        const mast = new THREE.Mesh(gMast, metal);
        mast.position.set(0, 0.25, 0);
        panelPivot.add(mast);
        const panel = new THREE.Mesh(gPanel, cell);
        panel.position.set(0, 0.62, 0);
        panel.castShadow = true;
        panelPivot.add(panel);
        const dish = add(gDish, metal, 0.3, 1.02, 0);
        g.scale.setScalar(LANDER_KM);
        g.position.copy(a.ground);
        g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.up);
        scene.add(g);
        return { g, panelPivot, dish };
      });
      const tmpQ = new THREE.Quaternion();
      const tmpV = new THREE.Vector3();
      const aimLanders = (sunDir: [number, number, number], earthDir: [number, number, number]) => {
        for (const l of landers) {
          // panel: rotate about the local vertical to face the Sun's azimuth (panels stand vertical at the pole)
          tmpQ.copy(l.g.quaternion).invert();
          tmpV.set(sunDir[0], sunDir[1], sunDir[2]).applyQuaternion(tmpQ);
          l.panelPivot.rotation.y = Math.atan2(tmpV.x, tmpV.z);
          // dish: point at Earth (lookAt works in world space)
          l.g.updateMatrixWorld();
          l.dish.getWorldPosition(tmpV);
          l.dish.lookAt(tmpV.x + earthDir[0] * 100, tmpV.y + earthDir[1] * 100, tmpV.z + earthDir[2] * 100);
        }
      };
      let lastEarth: [number, number, number] = earthDir;
      aimLanders(setTime(timeMs).s, earthDir);

      const hwAnchors = HARDWARE.map((n) => {
        const p = surface(n.lat!, n.lon!, heightAt(n.lat!, n.lon!));
        return { id: n.id, pos: new THREE.Vector3(p[0], p[1], p[2]).addScaledVector(radial(n.lat!, n.lon!), 0.6) };
      });

      // ---- line of sight over the heightfield: is the straight line from `eye` to `pt` cut by terrain?
      // Used to lift the camera until a deep crater floor is in view, and to fade pins hidden behind hills.
      const blocked = (eye: import("three").Vector3, pt: import("three").Vector3) => {
        const STEPS = 48;
        for (let i = 1; i < STEPS; i++) {
          const f = (i / STEPS) * 0.97; // stop just short of the point so its own slope does not count
          const x = eye.x + (pt.x - eye.x) * f;
          const y = eye.y + (pt.y - eye.y) * f + R_KM;
          const z = eye.z + (pt.z - eye.z) * f;
          const r = Math.hypot(x, y, z);
          const lat = -Math.asin(y / r) / D2R;
          if (lat > -78) continue; // outside the DEM
          const lon = Math.atan2(z, x) / D2R;
          if (r < R_KM + (EXAG * heightAt(lat, lon)) / 1000) return true;
        }
        return false;
      };
      const sightPt = new THREE.Vector3();
      const groundSight = (a: { ground: import("three").Vector3; up: import("three").Vector3 }) => sightPt.copy(a.ground).addScaledVector(a.up, 0.3);
      const camTry = new THREE.Vector3();
      const sphTry = new THREE.Spherical();

      // ---- fly-to
      let flight: {
        t0: number;
        dur: number;
        fromT: import("three").Vector3;
        toT: import("three").Vector3;
        fromR: number;
        toR: number;
        fromPhi: number;
        toPhi: number;
        fromTheta: number;
        toTheta: number;
      } | null = null;
      const landerGroup = landers.map((l) => l.g);
      const setLandersVisible = (v: boolean) => landerGroup.forEach((g) => (g.visible = v));
      const off3 = new THREE.Vector3();
      const cur = new THREE.Spherical();
      const flyTo = (id: string | null) => {
        const a = id ? anchors.find((x) => x.id === id) : null;
        off3.copy(camera.position).sub(controls.target);
        cur.setFromVector3(off3);
        // Look down steeply enough to actually see the site (a crater floor is hidden from a low angle).
        let toPhi = a ? ZOOM.phi : OVERVIEW.phi;
        if (a) {
          const g = groundSight(a);
          while (toPhi > 0.3) {
            camTry.setFromSpherical(sphTry.set(ZOOM.radius, toPhi, cur.theta)).add(a.pos);
            if (!blocked(camTry, g)) break;
            toPhi -= 0.06;
          }
        }
        flight = {
          t0: performance.now(),
          dur: 1400,
          fromT: controls.target.clone(),
          toT: a ? a.pos.clone() : new THREE.Vector3(0, 0, 0),
          fromR: cur.radius,
          toR: a ? ZOOM.radius : OVERVIEW.radius,
          fromPhi: cur.phi,
          toPhi,
          fromTheta: cur.theta,
          toTheta: cur.theta,
        };
        setLandersVisible(true);
        controls.enableRotate = true;
        phi0 = flight.toPhi;
        setTiltRange();
        controls.autoRotate = false;
        controls.enabled = false;
      };

      // ---- stand on the surface: eye ~0.5 km above the (2x exaggerated) ground, looking toward Earth
      const standAt = (id: string) => {
        const a = anchors.find((x) => x.id === id);
        if (!a) return;
        const e = new THREE.Vector3(...lastEarth);
        const fwd = e.clone().addScaledVector(a.up, -e.dot(a.up)).normalize(); // Earth's azimuth on the local horizon
        const eye = a.ground.clone().addScaledVector(a.up, 0.5);
        const target = eye.clone().addScaledVector(fwd, 6).addScaledVector(a.up, 0.25);
        const offset = eye.clone().sub(target);
        const goal = new THREE.Spherical().setFromVector3(offset);
        off3.copy(camera.position).sub(controls.target);
        cur.setFromVector3(off3);
        let dTheta = goal.theta - cur.theta;
        dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta)); // shortest turn
        flight = {
          t0: performance.now(),
          dur: 2200,
          fromT: controls.target.clone(),
          toT: target,
          fromR: cur.radius,
          toR: goal.radius,
          fromPhi: cur.phi,
          toPhi: goal.phi,
          fromTheta: cur.theta,
          toTheta: cur.theta + dTheta,
        };
        phi0 = goal.phi;
        setTiltRange();
        setLandersVisible(false); // the enlarged models would block the view at ground level
        controls.enableRotate = false; // fixed eye: orbiting a point 6 km away could dip below the hills
        controls.autoRotate = false;
        controls.enabled = false;
      };

      // ---- size / visibility
      const resize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        camera.aspect = w / h;
        camera.fov = w / h < 1 ? 50 : 38;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      let visible = true;
      const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting));
      io.observe(el);

      let raf = 0;
      const tmp = new THREE.Vector3();
      const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (!visible) return;
        if (flight) {
          const u = Math.min(1, (performance.now() - flight.t0) / flight.dur);
          const e = ease(u);
          controls.target.lerpVectors(flight.fromT, flight.toT, e);
          off3.copy(camera.position).sub(controls.target);
          cur.setFromVector3(off3);
          cur.radius = flight.fromR + (flight.toR - flight.fromR) * e;
          cur.phi = flight.fromPhi + (flight.toPhi - flight.fromPhi) * e;
          cur.theta = flight.fromTheta + (flight.toTheta - flight.fromTheta) * e;
          camera.position.copy(controls.target).add(off3.setFromSpherical(cur));
          camera.lookAt(controls.target);
          if (u >= 1) {
            flight = null;
            controls.enabled = true;
          }
        } else {
          controls.update();
          if (!dragging) {
            off3.copy(camera.position).sub(controls.target);
            cur.setFromVector3(off3);
            if (Math.abs(cur.phi - phi0) > 1e-4) {
              cur.phi += (phi0 - cur.phi) * 0.06;
              camera.position.copy(controls.target).add(off3.setFromSpherical(cur));
              camera.lookAt(controls.target);
            }
          }
        }
        // fog follows the camera distance so the far edge always fades out
        const dist = camera.position.distanceTo(controls.target);
        (scene.fog as import("three").Fog).near = dist * 0.9;
        (scene.fog as import("three").Fog).far = dist * 2.6 + 150;
        const near = Math.min(1, Math.max(0.01, dist * 0.004));
        if (Math.abs(near - camera.near) / camera.near > 0.2) {
          camera.near = near;
          camera.updateProjectionMatrix();
        }
        renderer.render(scene, camera);
        // pins
        const w = el.clientWidth;
        const h = el.clientHeight;
        for (const a of hwAnchors) {
          const el = hwEls.current[a.id];
          if (!el) continue;
          tmp.copy(a.pos).project(camera);
          const on = tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05;
          el.style.opacity = on ? (blocked(camera.position, a.pos) ? "0.3" : "1") : "0";
          el.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px)`;
        }
        for (const a of anchors) {
          const pin = pins.current[a.id];
          if (!pin) continue;
          tmp.copy(a.pos).project(camera);
          const onScreen = tmp.z < 1 && tmp.x > -1.05 && tmp.x < 1.05 && tmp.y > -1.05 && tmp.y < 1.05;
          // behind a hill or a crater wall: fade the pin so it does not seem to stand on the near slope
          const hidden = onScreen && blocked(camera.position, groundSight(a));
          pin.style.opacity = onScreen ? (hidden ? "0.35" : "1") : "0";
          pin.style.pointerEvents = onScreen ? "auto" : "none";
          pin.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px)`;
          if (a.id === hoveredRef.current && thumb.current) {
            const px = ((tmp.x + 1) / 2) * w;
            const py = ((1 - tmp.y) / 2) * h;
            const tw = thumb.current.offsetWidth;
            const th = thumb.current.offsetHeight;
            // above the pin when there is room, otherwise below; kept inside the scene horizontally
            const x = Math.min(w - tw - 8, Math.max(8, px - tw / 2));
            const above = py - 44 - th > 8;
            const y = above ? py - 44 - th : py + 16;
            thumb.current.style.transform = `translate(${x}px, ${y}px)`;
            if (caret.current) {
              caret.current.style.left = `${Math.min(tw - 14, Math.max(4, px - x - 5))}px`;
              caret.current.style.top = above ? `${th - 6}px` : "-6px";
              caret.current.style.borderWidth = above ? "0 1px 1px 0" : "1px 0 0 1px";
            }
            thumb.current.style.opacity = onScreen ? "1" : "0";
          }
        }
      };
      loop();

      api.current = {
        setTime: (t) => {
          const { s: sd, e: ed } = setTime(t);
          lastEarth = ed;
          aimLanders(sd, ed);
        },
        flyTo,
        standAt,
      };
      setReady(true);

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        controls.dispose();
        geo.dispose();
        mat.dispose();
        earth.geometry.dispose();
        (earth.material as import("three").Material).dispose();
        earthTex.dispose();
        starGeo.dispose();
        starMat.dispose();
        normalTex.dispose();
        regolithTex.dispose();
        [metal, dark, cell].forEach((m) => m.dispose());
        [gBody, gTop, gLeg, gPad, gMast, gPanel, gDish].forEach((x) => x.dispose());
        glowTex.dispose();
        sun.shadow.map?.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        api.current = null;
      };
    })().catch(() => setFailed(true));
    return () => {
      disposed = true;
      cleanup();
    };
    // the scene is built once; time is pushed through `api`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    runningRef.current = playing || touring;
  }, [playing, touring]);
  useEffect(() => {
    if (runningRef.current || playBase === timeMs) return; // the timelapse owns the clock
    sceneTRef.current = timeMs;
    api.current?.setTime(timeMs);
  }, [timeMs, ready, playBase]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    const step = (now: number) => {
      sceneTRef.current += ((now - last) / 1000) * speedH * 3_600_000;
      last = now;
      api.current?.setTime(sceneTRef.current);
      if (now - lastUi > 120) {
        setSceneT(sceneTRef.current);
        lastUi = now;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speedH]);

  const focused = SOUTH_SITES.find((s) => s.id === focus);
  const hover = (id: string | null) => {
    hoveredRef.current = id;
    setHovered(id);
  };
  const startClock = () => {
    sceneTRef.current = playBase === timeMs ? sceneTRef.current : timeMs;
    setSceneT(sceneTRef.current);
    setPlayBase(timeMs);
  };
  const shownT = playBase === timeMs ? sceneT : timeMs;
  const goTo = (id: string) => {
    onSelect(id);
    setFocus(id);
    setStanding(false);
    api.current?.flyTo(id);
  };
  const overview = () => {
    setFocus(null);
    setStanding(false);
    api.current?.flyTo(null);
  };
  const stand = (id: string) => {
    onSelect(id);
    setFocus(id);
    setStanding(true);
    hover(null);
    api.current?.standAt(id);
  };

  // ---- 30-second guided tour (also handy for recording the demo video)
  const stopTour = () => {
    tourId.current++;
    setTouring(false);
    setCaption(null);
    setPlaying(false);
  };
  const runTour = async () => {
    const id = ++tourId.current;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const alive = () => tourId.current === id;
    setTouring(true);
    setPhoto(null);
    setPlaying(false);
    overview();
    setCaption("The lunar south pole, built from NASA LOLA laser-altimeter data and lit by the real Sun.");
    await wait(4000);
    if (!alive()) return;
    goTo("shackleton-rim");
    hover("shackleton-rim");
    setCaption("Shackleton rim: a ridge that sees the Sun most of the year, next to a crater floor that never does.");
    await wait(4500);
    if (!alive()) return;
    hover(null);
    overview();
    setSpeedH(48);
    startClock();
    setPlaying(true);
    setCaption("A lunar day in seconds: the Sun circles just above the horizon and shadows sweep across the craters.");
    await wait(7000);
    if (!alive()) return;
    setPlaying(false);
    setSpeedH(24);
    // stand where Earth is highest above the real terrain horizon right now
    const best = SOUTH_SITES.map((s) => ({ s, c: sampleAt(resolvePreset(s), sceneTRef.current).earthClear })).sort((a, b) => b.c - a.c)[0];
    stand(best.s.id);
    setCaption(
      best.c > 0
        ? `Standing on ${best.s.name}: Earth hangs just above the hills, so a radio link home works.`
        : `Standing on ${best.s.name}: even here Earth is behind the hills right now, so the lander would need a relay.`,
    );
    await wait(6000);
    if (!alive()) return;
    setCaption("Launch slipped? Mission rescue finds the best new site and date in one click.");
    await wait(4500);
    if (!alive()) return;
    overview();
    setTouring(false);
    setCaption(null);
  };
  // the hero "Watch the tour" button starts it through a window event
  useEffect(() => {
    const onTour = () => runTour();
    window.addEventListener("lsn-tour", onTour);
    return () => window.removeEventListener("lsn-tour", onTour);
  });
  // Clicking a pin flies to the station; the photo appears as a hover thumbnail (tap on touch screens).
  const pick = (id: string) => goTo(id);
  const hoveredSite = SOUTH_SITES.find((s) => s.id === hovered);
  // Soft edges on all four sides (intersection of two linear fades).
  if (failed) return <>{fallback}</>;
  const fade =
    "linear-gradient(to right, transparent 0%, #000 13%, #000 87%, transparent 100%), linear-gradient(to bottom, transparent 0%, #000 14%, #000 80%, transparent 100%)";

  return (
    <figure className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-[220px_1fr] lg:items-center">
      <nav aria-label="Landing sites in the 3D view" className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-0 lg:overflow-visible lg:border-l lg:border-line lg:pb-0">
        <div className="eyebrow mb-2 hidden !text-[0.58rem] !tracking-[0.3em] text-muted lg:block lg:pl-4">Stations</div>
        {SOUTH_SITES.map((s) => {
          const on = s.id === (focus ?? selectedId);
          const hot = s.id === hovered;
          return (
            <button
              key={s.id}
              onClick={() => pick(s.id)}
              onPointerEnter={(e) => e.pointerType === "mouse" && hover(s.id)}
              onPointerLeave={(e) => e.pointerType === "mouse" && hover(null)}
              onFocus={() => hover(s.id)}
              onBlur={() => hover(null)}
              aria-current={on}
              className={`shrink-0 whitespace-nowrap border px-3 py-1.5 text-left text-xs transition-colors lg:-ml-px lg:border-0 lg:border-l-2 lg:px-4 lg:py-2 lg:text-sm ${
                hot
                  ? "border-sun text-sun lg:border-l-sun lg:bg-white/[0.04]"
                  : on
                    ? "border-foreground text-foreground lg:border-l-foreground lg:bg-white/[0.03]"
                    : "border-line text-muted hover:text-foreground lg:border-l-transparent"
              }`}
            >
              {s.name}
              <span className="ml-2 hidden text-xs text-faint lg:inline">{Math.abs(s.lat).toFixed(1)}°S</span>
            </button>
          );
        })}
        {focus && (
          <button
            onClick={overview}
            className="shrink-0 border border-line px-3 py-1.5 text-xs text-muted hover:text-foreground lg:mt-3 lg:ml-4 lg:w-fit"
          >
            ← Overview
          </button>
        )}
      </nav>
      <div ref={wrap} className="relative aspect-[4/5] w-full sm:aspect-[16/8]">
        <div className="absolute inset-0 overflow-hidden" style={{ maskImage: fade, WebkitMaskImage: fade, maskComposite: "intersect", WebkitMaskComposite: "source-in" }}>
          {!ready && <div className="absolute inset-0 animate-pulse bg-[radial-gradient(ellipse_at_50%_70%,#1c1c20,#000_70%)]" aria-hidden />}
          <div
            ref={mount}
            onPointerDown={() => hover(null)}
            className="absolute inset-0 cursor-grab active:cursor-grabbing"
            role="img"
            aria-label="3D terrain of the lunar south pole from NASA LOLA data, lit by the Sun at the selected time, with Earth in the sky and landing sites pinned. Drag to rotate; hover a pin for a photo, click it to fly to the site."
          />
          {HARDWARE.map((n) => (
            <span
              key={n.id}
              ref={(el) => {
                hwEls.current[n.id] = el;
              }}
              className="group absolute left-0 top-0 opacity-0 transition-opacity"
              style={{ willChange: "transform" }}
              title={`${n.name} · ${n.kind === "impact" ? "impact site" : "lander"} · ${n.date}`}
            >
              <span
                className="absolute -translate-x-1/2 -translate-y-1/2 rotate-45 border border-black"
                style={{ width: 9, height: 9, background: n.kind === "impact" ? "var(--poor)" : "#a8a8ae" }}
                aria-hidden
              />
              <span className="pointer-events-none absolute left-2 top-[-8px] hidden whitespace-nowrap border border-line bg-black/85 px-1.5 py-0.5 text-[11px] text-muted group-hover:block">
                {n.name} · {n.date.slice(0, 4)}
              </span>
            </span>
          ))}
          {SOUTH_SITES.map((s) => {
            const sel = s.id === selectedId;
            const hot = s.id === hovered;
            return (
              <button
                key={s.id}
                ref={(n) => {
                  pins.current[s.id] = n;
                }}
                onClick={() => pick(s.id)}
                onPointerEnter={(e) => e.pointerType === "mouse" && hover(s.id)}
                onPointerLeave={(e) => e.pointerType === "mouse" && hover(null)}
                onPointerDown={(e) => e.pointerType !== "mouse" && hover(s.id)}
                onFocus={() => hover(s.id)}
                onBlur={() => hover(null)}
                className="group absolute left-0 top-0 opacity-0 transition-opacity"
                style={{ willChange: "transform", zIndex: hot ? 5 : sel ? 2 : 1 }}
                aria-label={`Fly to ${s.name}`}
              >
                <span className="absolute bottom-0 left-0 flex -translate-x-1/2 flex-col items-center">
                  <span
                    className={`whitespace-nowrap border px-1.5 py-0.5 text-[11px] uppercase tracking-[0.15em] backdrop-blur ${
                      sel && hovered !== s.id ? "border-foreground bg-black/80 text-foreground" : "hidden"
                    }`}
                    style={{ fontFamily: "var(--font-orbitron)" }}
                  >
                    {s.name}
                  </span>
                  <svg
                    width={sel ? 22 : 16}
                    height={sel ? 30 : 22}
                    viewBox="0 0 22 30"
                    aria-hidden
                    className={`origin-bottom transition-transform duration-200 ${hot ? "scale-[1.55] drop-shadow-[0_0_10px_rgba(226,189,106,0.9)]" : "drop-shadow-[0_0_6px_rgba(255,255,255,0.45)] group-hover:scale-110"}`}
                  >
                    <path
                      d="M11 29 C11 29 2 17 2 10.5 A9 9 0 0 1 20 10.5 C20 17 11 29 11 29 Z"
                      fill={hot ? "#e2bd6a" : sel ? "#ffffff" : "#cfcfd4"}
                      stroke="#000"
                      strokeWidth="1.2"
                      style={{ transition: "fill 0.2s" }}
                    />
                    <circle cx="11" cy="10.5" r="3.4" fill="#000" />
                  </svg>
                </span>
              </button>
            );
          })}
        </div>

        {/* overlays sit outside the fade mask so they stay crisp */}
        {hoveredSite && (
          <div
            ref={thumb}
            className="pointer-events-none absolute left-0 top-0 z-10 w-56 border border-sun/60 bg-black/90 opacity-0 shadow-[0_8px_30px_rgba(0,0,0,0.6)] backdrop-blur transition-opacity"
            role="tooltip"
          >
            <div ref={caret} className="absolute h-3 w-3 rotate-45 border-sun/60 bg-black" style={{ borderStyle: "solid" }} aria-hidden />
            {hoveredSite.photo?.thumb && (
              // eslint-disable-next-line @next/next/no-img-element -- 10-25 KB local thumbnail
              <img src={hoveredSite.photo.thumb} alt="" className="block aspect-video w-full object-cover" />
            )}
            <div className="flex flex-col gap-1 p-2.5">
              <div className="display text-xs tracking-[0.15em] text-sun">{hoveredSite.name}</div>
              <div className="text-xs text-muted">{fmtLatLon(hoveredSite.lat, hoveredSite.lon)}</div>
              {hoveredSite.description && <p className="text-xs leading-snug text-muted">{hoveredSite.description.split(". ")[0]}.</p>}
              {hoveredSite.photo && <div className="text-[11px] text-faint">Image: {hoveredSite.photo.credit}</div>}
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute left-4 top-3 flex flex-col gap-1 sm:left-[6%] sm:top-[6%]">
          <span className="eyebrow !text-[0.6rem] !tracking-[0.35em] text-muted">South pole · 3D terrain</span>
          {focused && (
            <span className="text-sm text-foreground">
              {focused.name} <span className="text-muted">· {fmtLatLon(focused.lat, focused.lon)}</span>
            </span>
          )}
        </div>
        {focused && !photo && !touring && (
          <div className="absolute bottom-3 right-4 flex flex-wrap justify-end gap-2 sm:bottom-[6%] sm:right-[6%]">
            {standing ? (
              <button className="btn btn-solid !py-1.5 text-xs" onClick={() => goTo(focused.id)}>
                ↑ Fly up
              </button>
            ) : (
              <button className="btn btn-solid !py-1.5 text-xs" onClick={() => stand(focused.id)} title="Put the camera on the ground, facing Earth">
                Stand on the surface
              </button>
            )}
            <button className="btn !py-1.5 text-xs" onClick={() => setPhoto(focused.id)}>
              Photo &amp; details
            </button>
            <a href="#sky" className="btn !py-1.5 text-xs">
              Sky view ↓
            </a>
            <button className="btn !py-1.5 text-xs" onClick={overview}>
              ← Overview
            </button>
          </div>
        )}
        <div className="absolute bottom-3 left-4 flex items-center gap-2 sm:bottom-[6%] sm:left-[6%]">
          <button
            className={`btn !py-1.5 text-xs ${playing ? "btn-solid" : ""}`}
            onClick={() => {
              if (touring) return stopTour();
              if (!playing) startClock();
              setPlaying((p) => !p);
            }}
            aria-label={playing ? "Pause the lunar day timelapse" : "Play a lunar day timelapse"}
          >
            {playing ? "❚❚ Pause" : "▶ Lunar day"}
          </button>
          <span className="hidden text-xs text-muted sm:inline">
            {new Date(shownT).toISOString().slice(0, 16).replace("T", " ")} UTC{playing ? ` · ×${speedH} h/s` : ""}
          </span>
        </div>
        {!touring && !focused && (
          <button className="btn absolute right-4 top-3 !py-1.5 text-xs sm:right-[6%] sm:top-[6%]" onClick={runTour}>
            ▶ 30-second tour
          </button>
        )}
        {touring && (
          <button className="btn absolute right-4 top-3 !py-1.5 text-xs sm:right-[6%] sm:top-[6%]" onClick={stopTour}>
            Skip tour ✕
          </button>
        )}
        {caption && (
          <div className="pointer-events-none absolute inset-x-4 bottom-14 flex justify-center sm:bottom-[16%]" aria-live="polite">
            <p className="max-w-2xl border border-line bg-black/80 px-4 py-2.5 text-center text-sm leading-relaxed text-foreground backdrop-blur sm:text-base">{caption}</p>
          </div>
        )}
        {photo && (
          <StationCard
            id={photo}
            onPick={(id) => {
              setPhoto(id);
              goTo(id);
            }}
            onClose={() => setPhoto(null)}
          />
        )}
      </div>
      </div>
      <figcaption className="text-center text-xs text-muted">
        NASA LOLA relief (×2) on the true lunar curvature, lit by the real Sun at the selected time. Lander models are ~300× real size: panels face the real Sun, dishes point at the real
        Earth (shown 2.5× larger). Drag to rotate; hover a pin or a name for a photo, click to fly in; “Stand on the surface” puts you on the ground facing Earth; ▶ Lunar day plays the Sun and shadows. ◆ Hardware already on the surface (red: impact sites).
      </figcaption>
    </figure>
  );
}

/** Photo + plain-language card for a station, with previous/next and a list of all stations. */
function StationCard({ id, onPick, onClose }: { id: string; onPick: (id: string) => void; onClose: () => void }) {
  const idx = SOUTH_SITES.findIndex((s) => s.id === id);
  const site = SOUTH_SITES[idx];
  const prev = SOUTH_SITES[(idx - 1 + SOUTH_SITES.length) % SOUTH_SITES.length];
  const next = SOUTH_SITES[(idx + 1) % SOUTH_SITES.length];
  const [from] = useState(() => alignTime(Date.now(), DAY));
  const [small] = useState(() => window.matchMedia("(max-width: 639px)").matches);
  const m = useMemo(() => {
    const to = from + 14 * DAY;
    return windowMetrics(sampleSeries(resolvePreset(site), from, to, 30 * 60_000), from, to);
  }, [site, from]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onPick(next.id);
      if (e.key === "ArrowLeft") onPick(prev.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPick, next.id, prev.id]);

  if (!site) return null;
  const card = (
    <div
      className={
        small
          ? "fixed inset-0 z-[60] flex items-stretch justify-center bg-black/90 p-3 backdrop-blur-sm"
          : "absolute inset-0 z-20 flex items-stretch justify-center bg-black/70 p-6 backdrop-blur-sm"
      }
      role="dialog" aria-modal="true" aria-label={`${site.name}: photo and details`}>
      <div className={`card flex max-h-full w-full max-w-5xl overflow-x-hidden ${small ? "flex-col overflow-y-auto" : "flex-row overflow-hidden"}`}>
        <div className={`relative shrink-0 bg-black ${small ? "h-64" : "flex-1"}`}>
          {site.photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- local, pre-sized WebP; loaded only when the card opens
            <img key={site.photo.src} src={site.photo.src} alt={site.photo.caption} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted">No photo available</div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3 text-xs leading-snug text-muted">
            {site.photo?.caption}{" "}
            {site.photo && (
              <a href={site.photo.link} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
                {site.photo.credit}
              </a>
            )}
          </div>
        </div>
        <div className={`flex min-w-0 flex-col gap-4 p-5 ${small ? "w-full" : "w-[380px] shrink-0 overflow-y-auto"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="eyebrow !text-[0.58rem] !tracking-[0.3em] text-muted">
                Station {idx + 1} / {SOUTH_SITES.length}
              </div>
              <h3 className="display mt-2 text-xl">{site.name}</h3>
              <div className="mt-1 text-xs text-muted">{fmtLatLon(site.lat, site.lon)}</div>
            </div>
            <button className="btn !px-2.5 !py-1 text-xs" onClick={onClose} aria-label="Close and return to 3D">
              ✕
            </button>
          </div>
          {site.description && <p className="text-sm leading-relaxed text-muted">{site.description}</p>}
          <div className="grid grid-cols-2 gap-2">
            <div className="frame p-3">
              <div className="text-xs text-muted">☀ Sunlight, next 14 days</div>
              <div className="num mt-1 text-lg">{Math.round(m.illuminationPct)}%</div>
            </div>
            <div className="frame p-3">
              <div className="text-xs text-muted">⊕ Earth in view</div>
              <div className="num mt-1 text-lg">{Math.round(m.commsPct)}%</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn flex-1 !py-1.5 text-xs" onClick={() => onPick(prev.id)} title={prev.name}>
              ← Previous
            </button>
            <button className="btn btn-solid flex-1 !py-1.5 text-xs" onClick={() => onPick(next.id)} title={next.name}>
              Next →
            </button>
          </div>
          <div>
            <div className="mb-2 text-xs text-muted">All stations</div>
            <div className="flex flex-wrap gap-1.5">
              {SOUTH_SITES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onPick(s.id)}
                  className={`border px-2 py-1 text-xs transition-colors ${s.id === id ? "border-foreground text-foreground" : "border-line text-muted hover:border-muted hover:text-foreground"}`}
                  aria-current={s.id === id}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-auto flex gap-2 pt-2">
            <a href="#sky" onClick={onClose} className="btn flex-1 !py-1.5 text-xs">
              Open sky view ↓
            </a>
            <button className="btn flex-1 !py-1.5 text-xs" onClick={onClose}>
              Back to 3D
            </button>
          </div>
        </div>
      </div>
    </div>
  );
  // On phones the card covers the whole screen (portal to <body>, above the sticky header).
  return small ? createPortal(card, document.body) : card;
}

