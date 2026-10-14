import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Flag, type FlagCode } from '../ui/Flag';

/*
 * Kept dependency-free on purpose (no @react-three/drei): drei added ~700 KB to the bundle
 * for the three small helpers this scene needs (a line, sparkles, HTML labels).
 */

const R = 1.6;
const BAKU = { lat: 40.4093, lng: 49.8671 };
const BERLIN = { lat: 52.52, lng: 13.405 };

/** Matches three.js SphereGeometry UV mapping, so points land on the right spot of the texture. */
const toVec3 = (lat: number, lng: number, r = R) => {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lng + 180);
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
};

const atmosphereShader = {
  vertexShader: /* glsl */ `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    varying vec3 vNormal;
    void main() {
      float intensity = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.6);
      gl_FragColor = vec4(0.25, 0.55, 1.0, 1.0) * intensity;
    }`,
};

type LabelRefs = { baku: RefObject<HTMLDivElement | null>; berlin: RefObject<HTMLDivElement | null> };

const Marker = ({ position, color, delay = 0 }: { position: THREE.Vector3; color: string; delay?: number }) => {
  const ring = useRef<THREE.Mesh>(null);
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), position.clone().normalize()), [position]);

  useFrame(({ clock }) => {
    if (!ring.current) return;
    const t = ((clock.elapsedTime + delay) % 2) / 2;
    ring.current.scale.setScalar(1 + t * 3);
    (ring.current.material as THREE.MeshBasicMaterial).opacity = 1 - t;
  });

  return (
    <group position={position} quaternion={quaternion}>
      <mesh>
        <circleGeometry args={[0.028, 20]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh ref={ring}>
        <ringGeometry args={[0.03, 0.04, 28]} />
        <meshBasicMaterial color={color} transparent side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
};

const FlightArc = ({ labels }: { labels: LabelRefs }) => {
  const start = useMemo(() => toVec3(BAKU.lat, BAKU.lng), []);
  const end = useMemo(() => toVec3(BERLIN.lat, BERLIN.lng), []);
  const curve = useMemo(() => {
    const mid = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(R * 1.32);
    return new THREE.QuadraticBezierCurve3(start, mid, end);
  }, [start, end]);

  const lines = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(80));
    const glow = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#5c9bff', transparent: true, opacity: 0.4 }));
    const dashed = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: '#ffce00', dashSize: 0.06, gapSize: 0.05 }));
    dashed.computeLineDistances();
    return { glow, dashed };
  }, [curve]);
  useEffect(
    () => () => {
      lines.glow.geometry.dispose();
      (lines.glow.material as THREE.Material).dispose();
      (lines.dashed.material as THREE.Material).dispose();
    },
    [lines],
  );

  const plane = useRef<THREE.Mesh>(null);
  const trail = useRef<THREE.Mesh>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const { camera, size } = useThree();

  useFrame(({ clock }) => {
    const t = (clock.elapsedTime * 0.22) % 1;
    plane.current?.position.copy(curve.getPoint(t));
    trail.current?.position.copy(curve.getPoint(Math.max(0, t - 0.03)));

    // Project the city markers to screen space and move the HTML labels directly (no React re-render).
    const parent = plane.current?.parent;
    if (!parent) return;
    for (const [pos, ref] of [
      [start, labels.baku],
      [end, labels.berlin],
    ] as const) {
      const el = ref.current;
      if (!el) continue;
      tmp.copy(pos).applyMatrix4(parent.matrixWorld);
      const facing = tmp.clone().normalize().dot(camera.position.clone().normalize()) > 0.15;
      tmp.project(camera);
      el.style.transform = `translate(-50%, -150%) translate(${((tmp.x + 1) / 2) * size.width}px, ${((1 - tmp.y) / 2) * size.height}px)`;
      el.style.opacity = facing ? '1' : '0';
    }
  });

  return (
    <group>
      <primitive object={lines.glow} />
      <primitive object={lines.dashed} />
      <mesh ref={plane}>
        <sphereGeometry args={[0.035, 12, 12]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh ref={trail}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshBasicMaterial color="#5c9bff" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <Marker position={start} color="#00b5e2" />
      <Marker position={end} color="#ffce00" delay={1} />
    </group>
  );
};

const Sparkles = ({ count = 90 }: { count?: number }) => {
  const ref = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * 9;
      p[i * 3 + 1] = (Math.random() - 0.5) * 6;
      p[i * 3 + 2] = (Math.random() - 0.5) * 4;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return g;
  }, [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.02;
  });
  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial color="#9cc2ff" size={0.025} sizeAttenuation transparent opacity={0.7} depthWrite={false} />
    </points>
  );
};

const Earth = ({ pointer, labels }: { pointer: RefObject<{ x: number; y: number }>; labels: LabelRefs }) => {
  const texture = useLoader(THREE.TextureLoader, '/textures/earth-night.jpg');
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const group = useRef<THREE.Group>(null);

  // Face the Azerbaijan–Germany corridor towards the camera.
  const base = useMemo(() => {
    const focus = toVec3((BAKU.lat + BERLIN.lat) / 2, (BAKU.lng + BERLIN.lng) / 2);
    return { y: -Math.atan2(focus.x, focus.z), x: THREE.MathUtils.degToRad(40) };
  }, []);

  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    const targetY = base.y + Math.sin(t * 0.15) * 0.25 + pointer.current.x * 0.35;
    const targetX = base.x + pointer.current.y * 0.15;
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, targetY, 2, delta);
    group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, targetX, 2, delta);
  });

  return (
    <group ref={group} rotation={[base.x, base.y, 0]}>
      <mesh>
        <sphereGeometry args={[R, 64, 64]} />
        <meshStandardMaterial map={texture} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={1.1} color="#2a4f9a" roughness={0.9} metalness={0.1} />
      </mesh>
      <mesh>
        <sphereGeometry args={[R * 1.004, 36, 18]} />
        <meshBasicMaterial color="#5c9bff" wireframe transparent opacity={0.06} depthWrite={false} />
      </mesh>
      <FlightArc labels={labels} />
    </group>
  );
};

const Atmosphere = () => (
  <mesh scale={1.18}>
    <sphereGeometry args={[R, 48, 48]} />
    <shaderMaterial {...atmosphereShader} blending={THREE.AdditiveBlending} side={THREE.BackSide} transparent depthWrite={false} />
  </mesh>
);

const CityLabel = ({ innerRef, code, label }: { innerRef: RefObject<HTMLDivElement | null>; code: FlagCode; label: string }) => (
  <div
    ref={innerRef}
    className="pointer-events-none absolute top-0 left-0 hidden items-center gap-1.5 rounded-full border border-white/20 bg-navy-950/80 px-2.5 py-1 text-[11px] font-bold whitespace-nowrap text-white opacity-0 shadow-lg transition-opacity duration-300 will-change-transform lg:flex"
  >
    <Flag code={code} className="w-4" />
    {label}
  </div>
);

export default function HeroGlobe() {
  const wrap = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const baku = useRef<HTMLDivElement>(null);
  const berlin = useRef<HTMLDivElement>(null);
  const labels = useMemo(() => ({ baku, berlin }), []);
  const [visible, setVisible] = useState(true);
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting && !document.hidden));
    io.observe(el);
    const onVis = () => setVisible(!document.hidden && el.getBoundingClientRect().bottom > 0);
    document.addEventListener('visibilitychange', onVis);
    let raf = 0;
    const move = (e: PointerEvent) => {
      // Coalesce pointer events to one update per frame.
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        pointer.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 };
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', move);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={wrap} className="relative size-full">
      <Canvas
        camera={{ position: [0, 0, 5.2], fov: 42 }}
        dpr={[1, 1.5]}
        // The hero moves with scroll; don't re-measure the canvas on every scroll event.
        resize={{ scroll: false, debounce: { scroll: 0, resize: 150 } }}
        frameloop={reduced ? 'demand' : visible ? 'always' : 'never'}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <ambientLight intensity={0.35} />
        <directionalLight position={[-4, 2, 5]} intensity={1.6} color="#9cc2ff" />
        <pointLight position={[4, -2, 3]} intensity={6} color="#1565e8" />
        <Earth pointer={pointer} labels={labels} />
        <Atmosphere />
        <Sparkles />
      </Canvas>
      <CityLabel innerRef={baku} code="az" label="Bakı" />
      <CityLabel innerRef={berlin} code="de" label="Berlin" />
    </div>
  );
}
