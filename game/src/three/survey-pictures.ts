import * as THREE from 'three';
import { SURVEY_PICTURE } from '../data/survey-pictures';
import { PHYSICS } from '../data/physics';
import { TIME } from '../data/time';
import { PAL } from '../render/palette';
import { mapObstacles } from '../sim/mapgen';
import { surveySites, type SurveySite } from '../sim/survey';
import { surveyPictureCenter, surveyPictureKey } from '../sim/survey-picture';
import { heightAt } from '../sim/terrain';
import type { Obstacle } from '../sim/types';
import type { Vec } from '../sim/vec';
import { TEST_MAP } from '../test/map';
import { CAMERA_DIR } from './render/camera';
import { daylightAt, enableSunShadows, lightScene, sunLight } from './render/daylight';
import { loadModels, outlineProps, paintSurfaceMasks } from './render/models';
import { buildProp } from './render/obstacles';
import { chunkGeometry, groundMaterial } from './render/terrain';
import { world } from './shot';

const S = PHYSICS.metersPerTile;
const [ASPECT_W, ASPECT_H] = SURVEY_PICTURE.aspect;
const WIDTH = SURVEY_PICTURE.cssWidth * SURVEY_PICTURE.pixelRatio;
const HEIGHT = (WIDTH * ASPECT_H) / ASPECT_W;
const CAMERA_DISTANCE = 300;
const CAMERA_ELEVATION = Math.asin(CAMERA_DIR.y);
const CIRCLE_SAMPLES = 24;
const SHEET = { cols: 4, label: 32, pad: 8, font: '18px sans-serif', page: '#1b1c1d', text: '#e0d8ca' };

export type SurveyPictures = {
  files: Record<string, string>;
  manifest: { mapHash: string; sites: Record<string, string> };
  sheet: string;
};

declare global {
  interface Window {
    __SURVEY_PICTURES__?: SurveyPictures;
    __SURVEY_PICTURES_ERROR__?: string;
  }
}

export function runSurveyPictures(): void {
  drawAll().then(
    (result) => {
      window.__SURVEY_PICTURES__ = result;
    },
    (e: unknown) => {
      window.__SURVEY_PICTURES_ERROR__ = e instanceof Error ? (e.stack ?? e.message) : String(e);
    },
  );
}

function turnAtHour(hour: number): number {
  return Math.ceil(1 + ((24 + hour - TIME.startHour) % 24) * (TIME.turnsPerDay / 24));
}

async function drawAll(): Promise<SurveyPictures> {
  await loadModels();
  await paintSurfaceMasks();
  const sites = surveySites(TEST_MAP);
  if (sites.length === 0) throw new Error('The map has no survey sites');
  const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true, preserveDrawingBuffer: true });
  enableSunShadows(renderer);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setPixelRatio(1);
  renderer.setSize(WIDTH, HEIGHT, false);
  const baked = new Map(mapObstacles(TEST_MAP).map((o) => [o.id, o]));
  const files: Record<string, string> = {};
  const manifest: SurveyPictures['manifest'] = { mapHash: TEST_MAP.hash, sites: {} };
  const canvases: { id: string; canvas: HTMLCanvasElement }[] = [];
  for (const site of sites) {
    drawSite(renderer, site, baked);
    const copy = document.createElement('canvas');
    copy.width = WIDTH;
    copy.height = HEIGHT;
    const ctx = copy.getContext('2d');
    if (!ctx) throw new Error('No 2D canvas context');
    ctx.drawImage(renderer.domElement, 0, 0);
    developPhoto(ctx);
    files[site.id] = copy.toDataURL('image/webp', SURVEY_PICTURE.quality);
    manifest.sites[site.id] = surveyPictureKey(site);
    canvases.push({ id: site.id, canvas: copy });
  }
  renderer.dispose();
  return { files, manifest, sheet: contactSheet(canvases) };
}

function developPhoto(ctx: CanvasRenderingContext2D): void {
  const { soften } = SURVEY_PICTURE.photo;
  ctx.filter = `blur(${soften}px)`;
  ctx.drawImage(ctx.canvas, 0, 0);
  ctx.filter = 'none';
  const image = ctx.getImageData(0, 0, WIDTH, HEIGHT);
  gradePixels(image.data);
  ctx.putImageData(image, 0, 0);
}

function gradePixels(data: Uint8ClampedArray): void {
  const { saturation, contrast, warmth, fade, vignette, grain } = SURVEY_PICTURE.photo;
  for (let i = 0; i < data.length; i += 4) {
    const px = (i / 4) % WIDTH;
    const py = Math.floor(i / 4 / WIDTH);
    const dx = (px / WIDTH - 0.5) * 2;
    const dy = (py / HEIGHT - 0.5) * 2;
    const edge = 1 - vignette * Math.min(1, (dx * dx + dy * dy) / 2);
    const noise = (grainAt(px, py) - 0.5) * 2 * grain;
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    for (let c = 0; c < 3; c++) {
      let v = luma + (data[i + c] - luma) * saturation;
      v = (v - 128) * contrast + 128;
      v = v * warmth[c] * edge + noise;
      data[i + c] = fade * 255 + v * (1 - fade);
    }
  }
}

function grainAt(x: number, y: number): number {
  const h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
  const m = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((m ^ (m >>> 16)) >>> 0) / 4294967296;
}

function propsOf(site: SurveySite, baked: Map<string, Obstacle>): THREE.Object3D[] {
  const w = world();
  return site.props.map((p) => {
    const obstacle = baked.get(p.id);
    if (!obstacle) throw new Error(`Survey site ${site.id} names prop ${p.id}, which the baked map lacks`);
    const built = buildProp(w.terrain, obstacle);
    outlineProps(built);
    return built;
  });
}

function drawSite(renderer: THREE.WebGLRenderer, site: SurveySite, baked: Map<string, Obstacle>): void {
  const w = world();
  const center = surveyPictureCenter(site);
  const target = new THREE.Vector3(center.x * S, heightAt(w.terrain, center.x, center.y) * S, center.y * S);
  const props = propsOf(site, baked);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAL.bg);
  scene.add(...props);
  const sun = sunLight();
  const sky = new THREE.HemisphereLight();
  scene.add(sun, sun.target, sky);
  lightScene(sun, sky, target, daylightAt(turnAtHour(SURVEY_PICTURE.hour)));
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);
  camera.position.copy(target).addScaledVector(CAMERA_DIR, CAMERA_DISTANCE);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  const reach = reachPoints(site);
  const half = framedHalf(camera, [...props, reach]);
  scene.add(groundPatch(center, Math.SQRT2 * (half.h / Math.sin(CAMERA_ELEVATION) + half.w) / S));
  Object.assign(camera, { left: -half.w, right: half.w, top: half.h, bottom: -half.h });
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  scene.remove(...props);
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.ground) o.geometry.dispose();
  });
}

function groundPatch(center: Vec, reachTiles: number): THREE.Mesh {
  const w = world();
  const x0 = Math.max(0, Math.floor(center.x - reachTiles));
  const y0 = Math.max(0, Math.floor(center.y - reachTiles));
  const x1 = Math.min(w.size, Math.ceil(center.x + reachTiles));
  const y1 = Math.min(w.size, Math.ceil(center.y + reachTiles));
  const mesh = new THREE.Mesh(chunkGeometry(w.terrain, x0, y0, x1 - x0, y1 - y0), groundMaterial(w));
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.userData.ground = true;
  return mesh;
}

function reachPoints(site: SurveySite): THREE.Object3D {
  const w = world();
  const points = new THREE.Group();
  for (const prop of site.props)
    for (let k = 0; k < CIRCLE_SAMPLES; k++) {
      const angle = (k / CIRCLE_SAMPLES) * 2 * Math.PI;
      const x = prop.pos.x + Math.cos(angle) * prop.reach;
      const y = prop.pos.y + Math.sin(angle) * prop.reach;
      const marker = new THREE.Object3D();
      marker.position.set(x * S, heightAt(w.terrain, x, y) * S, y * S);
      points.add(marker);
    }
  return points;
}

function framedHalf(camera: THREE.OrthographicCamera, roots: THREE.Object3D[]): { w: number; h: number } {
  const view = camera.matrixWorldInverse;
  const p = new THREE.Vector3();
  let reachX = 0;
  let reachY = 0;
  const take = (v: THREE.Vector3) => {
    reachX = Math.max(reachX, Math.abs(v.x));
    reachY = Math.max(reachY, Math.abs(v.y));
  };
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (o instanceof THREE.Mesh && !o.userData.outline) {
        const pos = o.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i++) take(p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(view));
      } else if (!(o instanceof THREE.Mesh) && o.children.length === 0) take(p.setFromMatrixPosition(o.matrixWorld).applyMatrix4(view));
    });
  }
  const w = Math.max(reachX * (1 + SURVEY_PICTURE.margin), SURVEY_PICTURE.minHalfTiles * S, ((reachY * (1 + SURVEY_PICTURE.margin)) * ASPECT_W) / ASPECT_H);
  return { w, h: (w * ASPECT_H) / ASPECT_W };
}

function contactSheet(items: { id: string; canvas: HTMLCanvasElement }[]): string {
  const { cols, label, pad } = SHEET;
  const rows = Math.ceil(items.length / cols);
  const out = document.createElement('canvas');
  out.width = pad + cols * (WIDTH + pad);
  out.height = pad + rows * (HEIGHT + label + pad);
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas context');
  ctx.fillStyle = SHEET.page;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.font = SHEET.font;
  ctx.fillStyle = SHEET.text;
  ctx.textBaseline = 'middle';
  items.forEach(({ id, canvas }, i) => {
    const x = pad + (i % cols) * (WIDTH + pad);
    const y = pad + Math.floor(i / cols) * (HEIGHT + label + pad);
    ctx.drawImage(canvas, x, y);
    ctx.fillText(id, x, y + HEIGHT + label / 2);
  });
  return out.toDataURL('image/png');
}
