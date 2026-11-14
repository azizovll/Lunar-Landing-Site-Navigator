"use client";

import { useEffect, useRef, useState } from "react";
import { frameVectors, type Vec3 } from "@/lib/astro";
import { SITES } from "@/lib/sites";

/**
 * Interactive 3D Moon for the home page.
 *
 * - Albedo: NASA SVS CGI Moon Kit (LROC mosaic with polar fill), equirectangular.
 * - South-polar cap (79.5–90°S): object-space normal map built from NASA LOLA DEMs
 *   (pipeline/build_moon.py, relief ×3) so craters near the pole are lit by the real Sun.
 * - Light: the true Sun direction in the Moon body-fixed frame at `timeMs` (lib/astro.ts,
 *   validated against JPL Horizons), so the terminator and polar shadows are physically placed.
 * - Frame mapping body → three.js: X = x (lon 0), Y = z (north), Z = −y.
 */

const CAP_LAT = -79.5;
const toThree = (v: Vec3): [number, number, number] => [v[0], v[2], -v[1]];
const D2R = Math.PI / 180;

function bodyUnit(latDeg: number, lonDeg: number): Vec3 {
  const la = latDeg * D2R;
  const lo = lonDeg * D2R;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

interface Props {
  selectedId: string | null;
  timeMs: number;
  onSelect: (id: string) => void;
  /** rendered instead when WebGL is unavailable */
  fallback: React.ReactNode;
}

export function Moon3D({ selectedId, timeMs, onSelect, fallback }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const api = useRef<{ setSun: (t: number) => void; setSelected: (id: string | null) => void } | null>(null);
  const onSelectRef = useRef(onSelect);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

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
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.appendChild(renderer.domElement);
      renderer.domElement.style.touchAction = "none";

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.enableZoom = false; // keeps the page scrollable over the globe
      controls.rotateSpeed = 0.55;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      controls.autoRotate = !reduceMotion;
      controls.autoRotateSpeed = 0.3;
      // View of the south-polar side: the camera orbits around the Moon's spin axis (three.js Y),
      // looking up at the pole from below at a fixed tilt. Users can spin freely around the pole,
      // tilt a little, and the tilt springs back when they let go.
      const PHI0 = 2.88; // polar angle from +Y (north): ~165°, i.e. looking up at the pole from 15° off the axis
      const TILT = 0.24; // allowed tilt either way (~14°)
      controls.minPolarAngle = PHI0 - TILT;
      controls.maxPolarAngle = PHI0 + TILT;
      let dragging = false;
      controls.addEventListener("start", () => {
        dragging = true;
        controls.autoRotate = false;
      });
      controls.addEventListener("end", () => {
        dragging = false;
        if (!reduceMotion) setTimeout(() => !dragging && (controls.autoRotate = true), 4000);
      });

      // ---- geometry: lat/lon grid with equirectangular uv (+ polar-stereographic uv1 for the cap)
      const grid = (latMin: number, latMax: number, nLat: number, nLon: number, radius: number, stereo: boolean) => {
        const pos: number[] = [];
        const uv: number[] = [];
        const uv1: number[] = [];
        const idx: number[] = [];
        const rhoMax = Math.tan(Math.PI / 4 + (CAP_LAT * D2R) / 2);
        for (let a = 0; a <= nLat; a++) {
          const lat = latMin + ((latMax - latMin) * a) / nLat;
          for (let b = 0; b <= nLon; b++) {
            const lon = -180 + (360 * b) / nLon;
            const p = toThree(bodyUnit(lat, lon));
            pos.push(p[0] * radius, p[1] * radius, p[2] * radius);
            uv.push((lon + 180) / 360, (lat + 90) / 180);
            if (stereo) {
              const rho = Math.tan(Math.PI / 4 + (lat * D2R) / 2) / rhoMax; // 0 at pole, 1 at cap edge
              const samp = 0.5 + 0.5 * rho * Math.sin(lon * D2R);
              const line = 0.5 - 0.5 * rho * Math.cos(lon * D2R);
              uv1.push(samp, 1 - line);
            }
          }
        }
        for (let a = 0; a < nLat; a++)
          for (let b = 0; b < nLon; b++) {
            const i0 = a * (nLon + 1) + b;
            const i1 = i0 + nLon + 1;
            idx.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1);
          }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        if (stereo) g.setAttribute("uv1", new THREE.Float32BufferAttribute(uv1, 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        return g;
      };

      const loader = new THREE.TextureLoader();
      const [albedo, normal] = await Promise.all([loader.loadAsync("/data/moon/moon_2k.jpg"), loader.loadAsync("/data/moon/south_normal.jpg")]);
      if (disposed) {
        renderer.dispose();
        return;
      }
      albedo.colorSpace = THREE.SRGBColorSpace;
      albedo.anisotropy = 8;
      normal.channel = 1;

      const moon = new THREE.Group();
      scene.add(moon);
      const baseGeo = grid(-90, 90, 128, 256, 1, false);
      const baseMat = new THREE.MeshStandardMaterial({ map: albedo, roughness: 1, metalness: 0 });
      moon.add(new THREE.Mesh(baseGeo, baseMat));
      const capGeo = grid(-90, CAP_LAT, 64, 256, 1.0006, true);
      const capMat = new THREE.MeshStandardMaterial({ map: albedo, normalMap: normal, normalMapType: THREE.ObjectSpaceNormalMap, roughness: 1, metalness: 0 });
      moon.add(new THREE.Mesh(capGeo, capMat));

      // ---- light: real Sun direction; faint fill so the night side is not pure black (Earthshine-like)
      const sun = new THREE.DirectionalLight(0xffffff, 3.2);
      scene.add(sun);
      // Earthshine: sunlight reflected by Earth lights the lunar night side from Earth's real direction.
      const earthshine = new THREE.DirectionalLight(0xc9dcff, 0.55);
      scene.add(earthshine);
      scene.add(new THREE.AmbientLight(0xffffff, 0.06));
      const setSun = (t: number) => {
        const s = frameVectors(new Date(t)).sun;
        const n = Math.hypot(s[0], s[1], s[2]);
        const v = toThree([s[0] / n, s[1] / n, s[2] / n]);
        sun.position.set(v[0] * 10, v[1] * 10, v[2] * 10);
        const e = frameVectors(new Date(t)).earth;
        const en = Math.hypot(e[0], e[1], e[2]);
        const ev = toThree([e[0] / en, e[1] / en, e[2] / en]);
        earthshine.position.set(ev[0] * 10, ev[1] * 10, ev[2] * 10);
        return v;
      };

      // ---- site markers
      const markers: { id: string; mesh: import("three").Mesh; normal: import("three").Vector3 }[] = [];
      const markGeo = new THREE.SphereGeometry(0.0055, 12, 8);
      for (const s of SITES.filter((x) => x.lat <= -80)) {
        const p = toThree(bodyUnit(s.lat, s.lon));
        const mat = new THREE.MeshBasicMaterial({ color: 0xd8d8dc });
        const mesh = new THREE.Mesh(markGeo, mat);
        mesh.position.set(p[0] * 1.004, p[1] * 1.004, p[2] * 1.004);
        mesh.userData.id = s.id;
        moon.add(mesh);
        markers.push({ id: s.id, mesh, normal: new THREE.Vector3(...p) });
      }
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.013, 0.016, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
      moon.add(ring);
      let selected: string | null = null;
      const setSelected = (id: string | null) => {
        selected = id;
        for (const m of markers) {
          const on = m.id === id;
          (m.mesh.material as import("three").MeshBasicMaterial).color.set(on ? 0xffffff : 0xe2e2e6);
          m.mesh.scale.setScalar(on ? 1.4 : 1);
          if (on) {
            ring.position.copy(m.mesh.position);
            ring.lookAt(m.normal.clone().multiplyScalar(2));
          }
        }
        ring.visible = markers.some((m) => m.id === id);
      };

      // ---- camera: look at the south pole from the sunlit side
      const sunV = setSun(timeMs);
      const sunLon = Math.atan2(-sunV[2], sunV[0]) / D2R;
      const target = new THREE.Vector3(0, 0, 0); // whole south-facing hemisphere in view
      const horiz = toThree(bodyUnit(0, sunLon - 35));
      const sph = new THREE.Spherical(4.7, PHI0, Math.atan2(horiz[0], horiz[2]));
      camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(sph));
      controls.target.copy(target);
      camera.up.set(0, 1, 0);
      controls.update();
      const offset = new THREE.Vector3();
      const cur = new THREE.Spherical();

      // ---- picking (click without drag)
      const ray = new THREE.Raycaster();
      let down: { x: number; y: number } | null = null;
      const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
      const onUp = (e: PointerEvent) => {
        if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
        const r = renderer.domElement.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
        // generous hit radius: test markers by screen distance
        let best: { id: string; d: number } | null = null;
        for (const m of markers) {
          const wp = m.mesh.getWorldPosition(new THREE.Vector3());
          if (wp.clone().sub(camera.position).dot(m.normal) > 0) continue; // far side
          const sp = wp.project(camera);
          const d = Math.hypot(((sp.x + 1) / 2) * r.width - (e.clientX - r.left), ((1 - sp.y) / 2) * r.height - (e.clientY - r.top));
          if (d < 18 && (!best || d < best.d)) best = { id: m.id, d };
        }
        if (best) onSelectRef.current(best.id);
      };
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointerup", onUp);

      // ---- size + render loop (paused when off-screen)
      const resize = () => {
        const w = el.clientWidth;
        renderer.setSize(w, w, false);
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        camera.aspect = 1;
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
      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (!visible) return;
        controls.update();
        if (!dragging) {
          offset.copy(camera.position).sub(controls.target);
          cur.setFromVector3(offset);
          if (Math.abs(cur.phi - PHI0) > 1e-4) {
            cur.phi += (PHI0 - cur.phi) * 0.06;
            offset.setFromSpherical(cur);
            camera.position.copy(controls.target).add(offset);
            camera.lookAt(controls.target);
          }
        }
        renderer.render(scene, camera);
        const lab = label.current;
        const m = markers.find((x) => x.id === selected);
        if (lab && m) {
          m.mesh.getWorldPosition(tmp);
          const facing = tmp.clone().sub(camera.position).dot(m.normal) < 0;
          tmp.project(camera);
          lab.style.opacity = facing ? "1" : "0";
          const px = ((tmp.x + 1) / 2) * el.clientWidth;
          const py = ((1 - tmp.y) / 2) * el.clientHeight;
          // put the label on the left of the marker when it would overflow the right edge
          const lx = px + 16 + lab.offsetWidth > el.clientWidth ? px - 16 - lab.offsetWidth : px + 16;
          lab.style.transform = `translate(${Math.max(0, lx)}px, ${py - 10}px)`;
        } else if (lab) lab.style.opacity = "0";
      };
      loop();

      api.current = { setSun: (t) => void setSun(t), setSelected };
      setReady(true);

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        renderer.domElement.removeEventListener("pointerdown", onDown);
        renderer.domElement.removeEventListener("pointerup", onUp);
        controls.dispose();
        baseGeo.dispose();
        capGeo.dispose();
        markGeo.dispose();
        baseMat.dispose();
        capMat.dispose();
        albedo.dispose();
        normal.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        api.current = null;
      };
    })().catch(() => setFailed(true));
    return () => {
      disposed = true;
      cleanup();
    };
    // the scene is built once; time and selection are pushed through `api`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.current?.setSun(timeMs);
  }, [timeMs, ready]);
  useEffect(() => {
    api.current?.setSelected(selectedId);
  }, [selectedId, ready]);

  if (failed) return <>{fallback}</>;
  const sel = SITES.find((s) => s.id === selectedId);
  return (
    <figure className="flex flex-col items-center gap-4">
      <div className="relative aspect-square w-full">
        <div className="pointer-events-none absolute inset-[9%] rounded-full shadow-[0_0_90px_14px_rgba(255,255,255,0.06),0_0_0_1px_rgba(255,255,255,0.05)]" aria-hidden />
        {!ready && <div className="absolute inset-[9%] animate-pulse rounded-full bg-[radial-gradient(circle_at_40%_35%,#3a3a3e,#0b0b0c_70%)]" aria-hidden />}
        <div ref={mount} className="absolute inset-0 cursor-grab active:cursor-grabbing" role="img" aria-label="3D view of the Moon's south-pole side, lit by the Sun at the selected time, with landing sites marked. Drag to spin around the pole; click a marker to select a site." />
        <div ref={label} className="pointer-events-none absolute left-0 top-0 whitespace-nowrap border border-line bg-black/80 px-2 py-1 text-[11px] uppercase tracking-[0.2em] opacity-0 transition-opacity" style={{ fontFamily: "var(--font-orbitron)" }}>
          {sel?.name}
        </div>
      </div>
      <figcaption className="max-w-md text-center text-xs text-muted">
        South-pole side, lit by the real Sun at the selected time; the night side glows with Earthshine from Earth’s real direction. NASA LROC mosaic, relief from LOLA (×3). Drag to spin around the pole, click a marker to pick a site.
      </figcaption>
    </figure>
  );
}
