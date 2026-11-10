import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import {
  BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, DataTexture, DirectionalLight, EdgesGeometry, GridHelper,
  Group, HemisphereLight, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, NearestFilter,
  PerspectiveCamera, Raycaster, Scene, ShaderMaterial, SRGBColorSpace, Sprite, SpriteMaterial, Texture, Vector2, Vector3,
  WebGLRenderer, type Object3D,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { FaceMesh } from '../core/voxelMesh';
import { raycastVolume, type VoxelHit } from '../core/voxelRay';
import type { Volume } from '../core/volume';

export interface ModelPreviewHandle {
  /** PNG of the current view. */
  snapshot(): Promise<Blob | null>;
  fit(): void;
}

export type PreviewView = 'blocks' | 'source';

interface Props {
  faces: FaceMesh | null;
  volume: Volume | null;
  /** The original model and the transform that puts it in voxel space. */
  source: { object: Object3D; matrix: Matrix4 } | null;
  view: PreviewView;
  atlas: HTMLImageElement | null;
  tileSize: number;
  atlasColumns: number;
  /** The camera re-frames the model whenever this changes. */
  fitKey: string;
  handleRef: Ref<ModelPreviewHandle>;
  onHover: (hit: VoxelHit | null) => void;
}

interface Three {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  blocks: Mesh<BufferGeometry, ShaderMaterial>;
  sourceGroup: Group;
  ground: Group;
  highlight: LineSegments;
  render: () => void;
}

/**
 * Block faces: texture from the atlas tile given per vertex, sampled with the UV clamped inside that tile, so
 * antialiasing samples just past a face's edge never pick up the neighbouring tile. Brightness is baked per face.
 */
function blockMaterial(): ShaderMaterial {
  const white = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  white.needsUpdate = true;
  return new ShaderMaterial({
    uniforms: { atlas: { value: white }, tileScale: { value: new Vector2(1, 1) } },
    vertexShader: `
      attribute vec2 tile;
      attribute float shade;
      varying vec2 vUv;
      varying vec2 vTile;
      varying float vShade;
      void main() {
        vUv = uv;
        vTile = tile;
        vShade = shade;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D atlas;
      uniform vec2 tileScale;
      varying vec2 vUv;
      varying vec2 vTile;
      varying float vShade;
      void main() {
        vec2 local = clamp(vUv, 0.001, 0.999);
        vec4 c = texture2D(atlas, (vTile + local) * tileScale);
        gl_FragColor = vec4(c.rgb * vShade, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

function label(text: string): Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.strokeText(text, 32, 34);
  ctx.fillStyle = text === 'N' ? '#ff6b5e' : '#ffffff';
  ctx.fillText(text, 32, 34);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return new Sprite(new SpriteMaterial({ map: tex, depthWrite: false }));
}

function disposeGroup(g: Object3D) {
  g.traverse((o) => {
    const m = o as Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      (mat as MeshBasicMaterial).map?.dispose();
      mat.dispose();
    }
  });
}

export function ModelPreview({ faces, volume, source, view, atlas, tileSize, atlasColumns, fitKey, handleRef, onHover }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const three = useRef<Three | null>(null);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const viewRef = useRef(view);
  viewRef.current = view;
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;
  /** Key of the hovered voxel, so moving within one block doesn't re-render. */
  const lastHit = useRef<string | null>(null);

  // ---- set up once ----
  useEffect(() => {
    const el = host.current!;
    const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(40, 1, 0.1, 10000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.screenSpacePanning = true;
    scene.add(new HemisphereLight(0xffffff, 0x606060, 2.2));
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(0.6, 1, 0.8);
    scene.add(sun);

    const blocks = new Mesh(new BufferGeometry(), blockMaterial());
    scene.add(blocks);
    const sourceGroup = new Group();
    sourceGroup.matrixAutoUpdate = false;
    scene.add(sourceGroup);
    const ground = new Group();
    scene.add(ground);
    const highlight = new LineSegments(new EdgesGeometry(new BoxGeometry(1.04, 1.04, 1.04)), new LineBasicMaterial({ color: 0xffffff, depthTest: false }));
    highlight.renderOrder = 10;
    highlight.visible = false;
    scene.add(highlight);

    const render = () => renderer.render(scene, camera);
    controls.addEventListener('change', render);
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // Hover: step through the voxel grid along the mouse ray (exact, and cheap even for huge models).
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    let frame = 0;
    const setHit = (hit: VoxelHit | null) => {
      const k = hit ? `${hit.x},${hit.y},${hit.z}:${hit.block}` : null;
      if (k === lastHit.current) return;
      lastHit.current = k;
      highlight.visible = !!hit;
      if (hit) highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      render();
      hoverRef.current(hit);
    };
    const move = (e: PointerEvent) => {
      if (e.buttons) return; // dragging the view
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const vol = volumeRef.current;
        if (!vol || viewRef.current !== 'blocks') return setHit(null);
        raycaster.setFromCamera(ndc, camera);
        const { origin: o, direction: d } = raycaster.ray;
        setHit(raycastVolume(vol, [o.x, o.y, o.z], [d.x, d.y, d.z]));
      });
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      setHit(null);
    };
    renderer.domElement.addEventListener('pointermove', move);
    renderer.domElement.addEventListener('pointerleave', leave);

    three.current = { renderer, scene, camera, controls, blocks, sourceGroup, ground, highlight, render };
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointermove', move);
      renderer.domElement.removeEventListener('pointerleave', leave);
      controls.dispose();
      sourceGroup.clear(); // the model belongs to the caller
      (blocks.material.uniforms.atlas.value as Texture).dispose();
      disposeGroup(blocks);
      disposeGroup(ground);
      disposeGroup(highlight);
      renderer.dispose();
      renderer.domElement.remove();
      three.current = null;
    };
  }, []);

  // ---- atlas texture ----
  useEffect(() => {
    const t = three.current;
    if (!t || !atlas) return;
    const tex = new Texture(atlas);
    tex.magFilter = NearestFilter;
    tex.minFilter = NearestFilter;
    tex.generateMipmaps = false;
    tex.flipY = false;
    tex.colorSpace = SRGBColorSpace;
    tex.needsUpdate = true;
    const u = t.blocks.material.uniforms;
    const before = u.atlas.value as Texture;
    u.atlas.value = tex;
    // Tile coordinates -> atlas UVs.
    (u.tileScale.value as Vector2).set(1 / atlasColumns, tileSize / atlas.naturalHeight);
    t.render();
    return () => {
      u.atlas.value = before;
      tex.dispose();
    };
  }, [atlas, tileSize, atlasColumns]);

  // ---- block geometry ----
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    const g = new BufferGeometry();
    if (faces && faces.quads > 0) {
      g.setAttribute('position', new BufferAttribute(faces.positions, 3));
      g.setAttribute('uv', new BufferAttribute(faces.uvs, 2));
      g.setAttribute('tile', new BufferAttribute(faces.tiles, 2));
      g.setAttribute('shade', new BufferAttribute(faces.shade, 1));
      g.setIndex(new BufferAttribute(faces.indices, 1));
    }
    t.blocks.geometry.dispose();
    t.blocks.geometry = g;
    // The block under the mouse may have changed or gone: hover again to see it.
    lastHit.current = null;
    t.highlight.visible = false;
    hoverRef.current(null);
    t.render();
  }, [faces]);

  // ---- ground grid and compass, sized to the footprint ----
  const W = volume?.width ?? 0, H = volume?.height ?? 0, L = volume?.length ?? 0;
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    disposeGroup(t.ground);
    t.ground.clear();
    if (!W || !L) return t.render();
    const n = Math.ceil((Math.max(W, L) + 8) / 2) * 2;
    const grid = new GridHelper(n, n > 160 ? n / 4 : n, 0x8a8f99, 0x8a8f99);
    const gm = grid.material as LineBasicMaterial;
    gm.transparent = true;
    gm.opacity = 0.28;
    gm.depthWrite = false;
    grid.position.set(W / 2, 0, L / 2);
    t.ground.add(grid);
    const s = Math.max(2, n / 14);
    const pad = s;
    for (const [text, x, z] of [['N', W / 2, -pad], ['S', W / 2, L + pad], ['W', -pad, L / 2], ['E', W + pad, L / 2]] as const) {
      const sp = label(text);
      sp.scale.set(s, s, 1);
      sp.position.set(x, s / 2, z);
      t.ground.add(sp);
    }
    t.render();
  }, [W, L]);

  // ---- original model ----
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    t.sourceGroup.clear();
    if (source) {
      t.sourceGroup.matrix.copy(source.matrix);
      t.sourceGroup.matrixWorldNeedsUpdate = true;
      t.sourceGroup.add(source.object);
    }
    t.render();
    return () => {
      t.sourceGroup.clear();
    };
  }, [source]);

  useEffect(() => {
    const t = three.current;
    if (!t) return;
    t.blocks.visible = view === 'blocks';
    t.sourceGroup.visible = view === 'source';
    if (view !== 'blocks') t.highlight.visible = false;
    t.render();
  }, [view]);

  // ---- camera ----
  const dims = useRef({ W, H, L });
  dims.current = { W, H, L };
  const fit = () => {
    const t = three.current;
    const { W: w, H: h, L: l } = dims.current;
    if (!t || !w) return;
    const centre = new Vector3(w / 2, h / 2, l / 2);
    const radius = 0.5 * Math.hypot(w, h, l);
    const dist = (radius / Math.sin(((t.camera.fov / 2) * Math.PI) / 180)) * 1.05;
    // From the south-east, a little above: the model's front faces south.
    const dir = new Vector3(0.55, 0.45, 1).normalize();
    t.camera.position.copy(centre).addScaledVector(dir, dist);
    t.camera.near = Math.max(0.05, dist / 200);
    t.camera.far = dist * 20;
    t.camera.updateProjectionMatrix();
    t.controls.target.copy(centre);
    t.controls.update();
    t.render();
  };
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (!W || fitted.current === fitKey) return;
    fitted.current = fitKey;
    fitRef.current();
  }, [fitKey, W]);

  useImperativeHandle(handleRef, () => ({
    fit: () => fitRef.current(),
    snapshot: () =>
      new Promise<Blob | null>((resolve) => {
        const t = three.current;
        if (!t) return resolve(null);
        const hl = t.highlight.visible;
        t.highlight.visible = false;
        t.render();
        t.renderer.domElement.toBlob((b) => {
          t.highlight.visible = hl;
          t.render();
          resolve(b);
        }, 'image/png');
      }),
  }));

  return <div ref={host} className="preview3d" />;
}
