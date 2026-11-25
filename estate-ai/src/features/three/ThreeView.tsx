import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Property } from '../../core/types';
import { buildScene, type BuiltScene, type SceneOptions } from './build3d';

export interface ThreeViewHandle {
  snapshot: (w?: number, h?: number) => string | null;
  resetCamera: () => void;
  focusRoom: (id: string) => void;
  topView: () => void;
}

interface Props {
  property: Property;
  options: SceneOptions;
  onBuilt?: (b: BuiltScene) => void;
  height?: number | string;
  testId?: string;
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export const ThreeView = forwardRef<ThreeViewHandle, Props>(function ThreeView({ property, options, onBuilt, height = '100%', testId }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const ctx = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; built?: BuiltScene; raf: number } | null>(null);
  const firstFrame = useRef(true);

  useEffect(() => {
    const el = host.current!;
    if (!webglAvailable()) {
      el.innerHTML = '<div class="empty">3D needs WebGL, which this browser has turned off.</div>';
      return;
    }
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    renderer.domElement.dataset.testid = testId ?? 'three-canvas';
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#141416');
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
    camera.position.set(10, 12, 14);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.495;
    scene.add(new THREE.HemisphereLight('#f4efe6', '#3a3630', 0.9));
    const sun = new THREE.DirectionalLight('#fff4e0', 1.6);
    sun.position.set(12, 20, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -25;
    sun.shadow.camera.right = sun.shadow.camera.top = 25;
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#18181a', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(200, 200, '#2a2a2e', '#1f1f22');
    grid.position.y = -0.005;
    scene.add(grid);

    const resize = () => {
      const w = el.clientWidth || 600;
      const h = el.clientHeight || 400;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      if (ctx.current) ctx.current.raf = requestAnimationFrame(loop);
    };
    ctx.current = { renderer, scene, camera, controls, raf: 0 };
    ctx.current.raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(ctx.current?.raf ?? 0);
      ro.disconnect();
      ctx.current?.built?.dispose();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      ctx.current = null;
    };
  }, [testId]);

  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    if (c.built) {
      c.scene.remove(c.built.group);
      c.built.dispose();
    }
    const built = buildScene(property, options);
    c.scene.add(built.group);
    c.built = built;
    onBuilt?.(built);
    if (firstFrame.current) {
      firstFrame.current = false;
      frame(c, built);
    }
  }, [property, options]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    snapshot: (w, h) => {
      const c = ctx.current;
      if (!c) return null;
      if (w && h) {
        const old = new THREE.Vector2();
        c.renderer.getSize(old);
        c.renderer.setSize(w, h, false);
        c.camera.aspect = w / h;
        c.camera.updateProjectionMatrix();
        c.renderer.render(c.scene, c.camera);
        const url = c.renderer.domElement.toDataURL('image/png');
        c.renderer.setSize(old.x, old.y, false);
        c.camera.aspect = old.x / old.y;
        c.camera.updateProjectionMatrix();
        return url;
      }
      c.renderer.render(c.scene, c.camera);
      return c.renderer.domElement.toDataURL('image/png');
    },
    resetCamera: () => ctx.current?.built && frame(ctx.current, ctx.current.built),
    topView: () => {
      const c = ctx.current;
      if (!c?.built) return;
      const b = c.built;
      c.controls.target.copy(b.center);
      c.camera.position.set(b.center.x, b.center.y + b.radius * 2.4, b.center.z + 0.01);
    },
    focusRoom: (id) => {
      const c = ctx.current;
      const t = c?.built?.roomCenters[id];
      if (!c || !t) return;
      c.controls.target.copy(t);
      const dir = c.camera.position.clone().sub(t).normalize();
      c.camera.position.copy(t.clone().add(dir.multiplyScalar(6)));
    },
  }));

  return <div ref={host} className="viewer" style={{ height }} />;
});

function frame(c: { camera: THREE.PerspectiveCamera; controls: OrbitControls }, b: BuiltScene) {
  const r = Math.max(4, b.radius);
  c.controls.target.copy(b.center);
  c.camera.position.set(b.center.x + r * 1.1, b.center.y + r * 1.3, b.center.z + r * 1.5);
  c.camera.near = 0.05;
  c.camera.far = r * 30;
  c.camera.updateProjectionMatrix();
}
