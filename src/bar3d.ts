import type * as THREE_NS from 'three';
import { FLAVOURS, SHEET_URL, clamp, hexToRgba, mixHex } from './data';

export interface BarPose {
  x: number;
  y: number;
  h: number;
  rz: number;
  ry: number;
  rx: number;
  z: number;
  op: number;
  sx: number;
  sy: number;
  shadow: number;
}

export const BH = (849 + 8) / (403 + 8);
const CR = 0.062;
const DEG = Math.PI / 180;

interface BarInstance {
  group: THREE_NS.Group;
  frontMesh: THREE_NS.Mesh;
  backMesh: THREE_NS.Mesh;
  shadowMesh: THREE_NS.Mesh;
  frontMat: THREE_NS.MeshPhysicalMaterial;
  backMat: THREE_NS.MeshPhysicalMaterial;
  shadowMat: THREE_NS.MeshBasicMaterial;
  flavour: number;
  slotOffset: number;
  visible: boolean;
}

export interface BarStage {
  readonly ready: boolean;
  readonly isSoftwareGl: boolean;
  resize: (vw: number, vh: number) => void;
  setPoolBar: (slotIdx: number, flavourIdx: number, slotOffset: number, pose: BarPose) => void;
  hidePoolFrom: (countUsed: number) => void;
  setTraveller: (flavourIdx: number, slotOffset: number, pose: BarPose) => void;
  raycastHero: (clientX: number, clientY: number) => number | null;
  render: () => void;
  dispose: () => void;
}

function detectSoftwareGl(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function createShadowTexture(THREE: typeof THREE_NS): THREE_NS.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 256, 16, 128, 256, 128);
  g.addColorStop(0, 'rgba(30,18,40,0.55)');
  g.addColorStop(0.55, 'rgba(30,18,40,0.22)');
  g.addColorStop(1, 'rgba(30,18,40,0)');
  ctx.save();
  ctx.translate(128, 256);
  ctx.scale(1, 2);
  ctx.translate(-128, -256);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 512);
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createWrapperGeometries(THREE: typeof THREE_NS): {
  frontGeo: THREE_NS.PlaneGeometry;
  backGeo: THREE_NS.PlaneGeometry;
} {
  const frontGeo = new THREE.PlaneGeometry(1, BH, 30, 64);
  const backGeo = new THREE.PlaneGeometry(1, BH, 30, 64);

  const displace = (geo: THREE_NS.PlaneGeometry, sign: 1 | -1) => {
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      const ex = Math.abs(2 * u - 1);
      const ev = Math.min(v, 1 - v);
      let z: number;
      if (ev < CR) {
        z = 0.006 + 0.006 * Math.abs(Math.sin(u * Math.PI * 34));
      } else {
        const across = Math.pow(Math.max(0, 1 - Math.pow(ex, 2.6)), 0.62);
        const along = Math.pow(clamp((ev - CR) / 0.11, 0, 1), 0.7);
        z = 0.012 + 0.118 * across * along + 0.004 * Math.sin(23 * u + 31 * v) * across;
      }
      pos.setZ(i, sign * z);
      if (sign === -1) {
        uv.setX(i, 1 - u);
      }
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
  };

  displace(frontGeo, 1);
  frontGeo.computeVertexNormals();

  displace(backGeo, -1);
  const idx = backGeo.index;
  if (idx) {
    const arr = idx.array as Uint16Array | Uint32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const tmp = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = tmp;
    }
    idx.needsUpdate = true;
  }
  backGeo.computeVertexNormals();

  return { frontGeo, backGeo };
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function buildFlavourTextures(
  THREE: typeof THREE_NS,
  img: HTMLImageElement,
  maxAnisotropy: number,
): { front: THREE_NS.CanvasTexture[]; back: THREE_NS.CanvasTexture[] } {
  const scale = img.naturalWidth / 2688;
  const anisotropy = Math.min(8, maxAnisotropy || 8);
  const front: THREE_NS.CanvasTexture[] = [];
  const back: THREE_NS.CanvasTexture[] = [];

  const rows: Array<[string, string, boolean]> = [
    ['Calories', '210', true],
    ['Protein', '12 g', true],
    ['Total fat', '9 g', false],
    ['Carbohydrate', '22 g', false],
    ['Fibre', '6 g', false],
    ['Sugars', '8 g', false],
    ['Salt', '0.2 g', false],
  ];

  FLAVOURS.forEach((flav, idx) => {
    const [bx, by, bw, bh] = flav.box;
    const W = Math.round((bw + 8) * 1.5 * 0.75);
    const H = Math.round(W * BH);
    const sx = (bx - 4) * scale;
    const sy = (by - 4) * scale;
    const sw = (bw + 8) * scale;
    const sh = (bh + 8) * scale;

    // Front texture
    const fc = document.createElement('canvas');
    fc.width = W;
    fc.height = H;
    const fctx = fc.getContext('2d')!;
    fctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    const ftex = new THREE.CanvasTexture(fc);
    ftex.colorSpace = THREE.SRGBColorSpace;
    ftex.anisotropy = anisotropy;
    front.push(ftex);

    // Back texture
    const bc = document.createElement('canvas');
    bc.width = W;
    bc.height = H;
    const bctx = bc.getContext('2d')!;

    // 1. Mirrored silhouette & crimp shading
    bctx.save();
    bctx.translate(W, 0);
    bctx.scale(-1, 1);
    bctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    bctx.restore();

    // 2. Colour fill inside silhouette (body 0.9, seals 0.35)
    const sealH = H * 0.075;
    bctx.globalCompositeOperation = 'source-atop';
    bctx.fillStyle = hexToRgba(flav.color, 0.9);
    bctx.fillRect(0, sealH, W, H - 2 * sealH);
    bctx.fillStyle = hexToRgba(flav.color, 0.35);
    bctx.fillRect(0, 0, W, sealH);
    bctx.fillRect(0, H - sealH, W, sealH);

    // 3. Horizontal sheen gradient over body
    const sheen = bctx.createLinearGradient(0, 0, W, 0);
    sheen.addColorStop(0, 'rgba(0,0,0,.10)');
    sheen.addColorStop(0.28, 'rgba(255,255,255,.14)');
    sheen.addColorStop(0.5, 'rgba(0,0,0,0)');
    sheen.addColorStop(0.8, 'rgba(0,0,0,.04)');
    sheen.addColorStop(1, 'rgba(0,0,0,.14)');
    bctx.fillStyle = sheen;
    bctx.fillRect(0, sealH, W, H - 2 * sealH);

    // 4. Typography & nutrition panel
    bctx.globalCompositeOperation = 'source-over';
    const ink = mixHex(flav.color, '#1c1a1f', 0.78);

    bctx.fillStyle = ink;
    bctx.textAlign = 'center';
    bctx.textBaseline = 'middle';
    bctx.font = `400 ${0.085 * W}px "Archivo Black", sans-serif`;
    bctx.fillText('STRIDE', W * 0.5, H * 0.15);

    bctx.font = `500 ${0.042 * W}px "DM Mono", monospace`;
    bctx.fillText(`${flav.name.toUpperCase()} · 50 G`, W * 0.5, H * 0.185);

    // Nutrition panel
    const panX = W * 0.15;
    const panY = H * 0.215;
    const panW = W * 0.7;
    const panH = H * 0.36;
    roundRectPath(bctx, panX, panY, panW, panH, 0.03 * W);
    bctx.fillStyle = 'rgba(255,255,255,0.92)';
    bctx.fill();

    const padL = W * 0.19;
    const padR = W * 0.81;
    bctx.fillStyle = '#1c1a1f';
    bctx.textAlign = 'left';
    bctx.font = `400 ${0.058 * W}px "Archivo Black", sans-serif`;
    bctx.fillText('NUTRITION', padL, H * 0.252);

    bctx.font = `400 ${0.032 * W}px "DM Mono", monospace`;
    bctx.fillStyle = 'rgba(28,26,31,0.75)';
    bctx.fillText('Serving size 1 bar (50 g)', padL, H * 0.287);

    // Solid rule
    bctx.fillStyle = '#1c1a1f';
    bctx.fillRect(padL, H * 0.308, padR - padL, Math.max(1.5, 0.004 * W));

    // Seven rows
    rows.forEach(([label, val, bold], rIdx) => {
      const ry = H * (0.34 + rIdx * 0.034);
      bctx.font = `${bold ? 500 : 400} ${0.032 * W}px "DM Mono", monospace`;
      bctx.fillStyle = '#1c1a1f';
      bctx.textAlign = 'left';
      bctx.fillText(label, padL, ry);
      bctx.textAlign = 'right';
      bctx.fillText(val, padR, ry);

      bctx.fillStyle = 'rgba(28,26,31,0.16)';
      bctx.fillRect(padL, ry + H * 0.016, padR - padL, Math.max(1, 0.002 * W));
    });

    // Ingredients
    bctx.fillStyle = ink;
    bctx.textAlign = 'center';
    bctx.font = `500 ${0.034 * W}px "DM Mono", monospace`;
    bctx.fillText('INGREDIENTS', W * 0.5, H * 0.62);

    bctx.font = `400 ${0.034 * W}px "DM Mono", monospace`;
    const ingLines = wrapText(bctx, flav.ingredients, W * 0.7);
    const lineStep = 0.034 * W + H * 0.022;
    ingLines.forEach((ln, li) => {
      bctx.fillText(ln, W * 0.5, H * 0.652 + li * lineStep);
    });

    // Barcode white rounded card at 73.5% height
    const bcX = W * 0.2;
    const bcY = H * 0.735;
    const bcW = W * 0.6;
    const bcH = H * 0.11;
    roundRectPath(bctx, bcX, bcY, bcW, bcH, 0.024 * W);
    bctx.fillStyle = 'rgba(255,255,255,0.92)';
    bctx.fill();

    // Seeded random barcode bars
    let seed = 1337 + idx * 97;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const barStart = bcX + bcW * 0.1;
    const barEnd = bcX + bcW * 0.9;
    const barTop = bcY + bcH * 0.16;
    const barH = bcH * 0.56;
    let cursorX = barStart;
    bctx.fillStyle = '#1c1a1f';
    while (cursorX < barEnd) {
      const bwPx = Math.max(1, (0.004 + rand() * 0.011) * W);
      if (cursorX + bwPx > barEnd) break;
      bctx.fillRect(cursorX, barTop, bwPx, barH);
      cursorX += bwPx + Math.max(1, (0.004 + rand() * 0.009) * W);
    }

    bctx.font = `400 ${0.026 * W}px "DM Mono", monospace`;
    bctx.textAlign = 'center';
    bctx.fillText(flav.barcode, W * 0.5, bcY + bcH * 0.85);

    // Pressed, not baked
    bctx.fillStyle = ink;
    bctx.font = `500 ${0.034 * W}px "DM Mono", monospace`;
    bctx.fillText('PRESSED, NOT BAKED', W * 0.5, H * 0.885);

    const btex = new THREE.CanvasTexture(bc);
    btex.colorSpace = THREE.SRGBColorSpace;
    btex.anisotropy = anisotropy;
    back.push(btex);
  });

  return { front, back };
}

export async function createBarStage(
  canvas: HTMLCanvasElement,
  onReady?: () => void,
): Promise<BarStage> {
  const threeSpec = 'three';
  const envSpec = 'three/addons/environments/RoomEnvironment.js';
  const THREE = (await import(/* @vite-ignore */ threeSpec)) as typeof THREE_NS;
  const { RoomEnvironment } = await import(/* @vite-ignore */ envSpec);

  const isSoftwareGl = detectSoftwareGl();
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !isSoftwareGl,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 10, 8000);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  pmrem.dispose();

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  keyLight.position.set(-0.6, 0.9, 1.4);
  scene.add(keyLight);

  const { frontGeo, backGeo } = createWrapperGeometries(THREE);
  const shadowGeo = new THREE.PlaneGeometry(1.25, 1.04 * BH);
  const shadowTex = createShadowTexture(THREE);

  let textures: { front: THREE_NS.CanvasTexture[]; back: THREE_NS.CanvasTexture[] } | null = null;
  let ready = false;
  let disposed = false;

  let curVw = window.innerWidth;
  let curVh = window.innerHeight;

  const createBar = (): BarInstance => {
    const frontMat = new THREE.MeshPhysicalMaterial({
      transparent: true,
      alphaTest: 0.5,
      roughness: 0.45,
      metalness: 0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.32,
      envMapIntensity: 0.42,
    });
    const backMat = new THREE.MeshPhysicalMaterial({
      transparent: true,
      alphaTest: 0.5,
      roughness: 0.45,
      metalness: 0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.32,
      envMapIntensity: 0.42,
    });
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });

    const frontMesh = new THREE.Mesh(frontGeo, frontMat);
    const backMesh = new THREE.Mesh(backGeo, backMat);
    const group = new THREE.Group();
    group.rotation.order = 'ZYX';
    group.add(frontMesh, backMesh);
    group.visible = false;

    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.renderOrder = -1;
    shadowMesh.visible = false;

    scene.add(shadowMesh, group);

    return {
      group,
      frontMesh,
      backMesh,
      shadowMesh,
      frontMat,
      backMat,
      shadowMat,
      flavour: -1,
      slotOffset: 0,
      visible: false,
    };
  };

  const pool: BarInstance[] = Array.from({ length: 11 }, createBar);
  const traveller: BarInstance = createBar();

  const applyPose = (bar: BarInstance, flavourIdx: number, slotOffset: number, p: BarPose) => {
    bar.slotOffset = slotOffset;
    if (!ready || !textures || p.op <= 0.01) {
      bar.group.visible = false;
      bar.shadowMesh.visible = false;
      bar.visible = false;
      return;
    }

    if (bar.flavour !== flavourIdx) {
      bar.flavour = flavourIdx;
      bar.frontMat.map = textures.front[flavourIdx];
      bar.backMat.map = textures.back[flavourIdx];
      bar.frontMat.needsUpdate = true;
      bar.backMat.needsUpdate = true;
    }

    bar.visible = true;
    bar.group.visible = true;
    bar.group.position.set(p.x - curVw / 2, curVh / 2 - p.y, p.z);
    const s = p.h / BH;
    bar.group.scale.set(s * p.sx, s * p.sy, s);
    bar.group.rotation.order = 'ZYX';
    bar.group.rotation.set(p.rx * DEG, p.ry * DEG, -p.rz * DEG);

    bar.frontMat.opacity = p.op;
    bar.backMat.opacity = p.op;

    const shOp = 0.5 * p.op * p.shadow;
    if (shOp <= 0.005) {
      bar.shadowMesh.visible = false;
    } else {
      bar.shadowMesh.visible = true;
      bar.shadowMesh.position.set(
        p.x - curVw / 2,
        curVh / 2 - (p.y + 0.05 * p.h),
        p.z - 0.32 * p.h,
      );
      bar.shadowMesh.scale.set(
        s * p.sx * Math.max(0.3, Math.abs(Math.cos(p.ry * DEG))),
        s * p.sy,
        1,
      );
      bar.shadowMesh.rotation.set(0, 0, -p.rz * DEG);
      bar.shadowMat.opacity = shOp;
    }
  };

  const resize = (vw: number, vh: number) => {
    curVw = Math.max(1, vw);
    curVh = Math.max(1, vh);
    const maxPR = isSoftwareGl ? 1 : curVw < 820 ? 1.75 : 2;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPR));
    renderer.setSize(curVw, curVh, false);
    canvas.style.height = `${curVh}px`;

    const D = clamp(1500 * Math.min(curVw / 1440, curVh / 900), 1000, 2200);
    camera.fov = (2 * Math.atan(curVh / 2 / D) * 180) / Math.PI;
    camera.aspect = curVw / curVh;
    camera.near = 10;
    camera.far = 4 * D;
    camera.position.set(0, 0, D);
    camera.updateProjectionMatrix();
  };

  resize(window.innerWidth, window.innerHeight);

  // Load fonts & sheet image before building textures
  const imgPromise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = SHEET_URL;
  });

  const fontsPromise = Promise.all([
    document.fonts.load('400 100px "Archivo Black"'),
    document.fonts.load('400 100px "DM Mono"'),
    document.fonts.load('500 100px "DM Mono"'),
    document.fonts.load('700 100px "Inter"'),
  ]).catch(() => undefined);

  Promise.all([imgPromise, fontsPromise])
    .then(([img]) => {
      if (disposed) return;
      textures = buildFlavourTextures(THREE, img, renderer.capabilities.getMaxAnisotropy());
      ready = true;
      document.documentElement.classList.add('gl');
      onReady?.();
    })
    .catch(() => {
      // Fallback: keep flat CSS sprites visible if texture fetch fails
    });

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const rayMeshes: THREE_NS.Object3D[] = [];

  const raycastHero = (clientX: number, clientY: number): number | null => {
    if (!ready) return null;
    ndc.x = (clientX / curVw) * 2 - 1;
    ndc.y = -(clientY / curVh) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    rayMeshes.length = 0;

    const allBars = [...pool, traveller];
    for (const b of allBars) {
      if (b.visible) {
        b.frontMesh.userData.slotOffset = b.slotOffset;
        b.backMesh.userData.slotOffset = b.slotOffset;
        rayMeshes.push(b.frontMesh, b.backMesh);
      }
    }
    const hits = raycaster.intersectObjects(rayMeshes, false);
    if (hits.length > 0) {
      return Number(hits[0].object.userData.slotOffset ?? 0);
    }
    return null;
  };

  return {
    get ready() {
      return ready;
    },
    get isSoftwareGl() {
      return isSoftwareGl;
    },
    resize,
    setPoolBar: (slotIdx: number, flavourIdx: number, slotOffset: number, pose: BarPose) => {
      const bar = pool[slotIdx];
      if (bar) applyPose(bar, flavourIdx, slotOffset, pose);
    },
    hidePoolFrom: (countUsed: number) => {
      for (let i = countUsed; i < pool.length; i++) {
        pool[i].group.visible = false;
        pool[i].shadowMesh.visible = false;
        pool[i].visible = false;
      }
    },
    setTraveller: (flavourIdx: number, slotOffset: number, pose: BarPose) => {
      applyPose(traveller, flavourIdx, slotOffset, pose);
    },
    raycastHero,
    render: () => {
      renderer.render(scene, camera);
    },
    dispose: () => {
      disposed = true;
      frontGeo.dispose();
      backGeo.dispose();
      shadowGeo.dispose();
      shadowTex.dispose();
      envRT.dispose();
      if (textures) {
        textures.front.forEach((t) => t.dispose());
        textures.back.forEach((t) => t.dispose());
      }
      for (const b of [...pool, traveller]) {
        b.frontMat.dispose();
        b.backMat.dispose();
        b.shadowMat.dispose();
      }
      renderer.dispose();
    },
  };
}
