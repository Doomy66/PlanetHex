import * as THREE from "three";
import type { Shader } from "./colour";
import { ANGLE, EXAGGERATION, BASE_DROP, type Pt2 } from "./iso";

/**
 * The local patch as lit ground. Spec 4.5.9.
 *
 * The flat view of 4.5 draws a hex map: one colour a hex, and the ground known a
 * hex at a time. This draws the ground that map stands for. The surface runs
 * through the same heights, smoothly rather than in steps, because a hillside is
 * not made of hexagons and a picture of one should not be either. Spec 4.5.9.2.
 *
 * What makes it read as ground rather than as a coloured sheet is the light: one
 * sun low over the shoulder, sky and bounce filling in behind it, and the slopes
 * facing away going into shadow. That is the whole of it. The colours are the same
 * ramp the map uses, so the two views cannot disagree about where the coast is.
 *
 * It is drawn with three.js, as the globe is, and into its own canvas under the
 * panel's SVG. The overlays that have to line up with it are drawn in that SVG
 * through the projection of iso.ts, which is this camera written out as arithmetic.
 */

/** The patch, as the flat view sampled it. */
export interface ReliefCell {
  readonly dp: number;
  readonly dq: number;
  /** Where the hex sits on the flat ground, in the drawing's own units. */
  readonly x: number;
  readonly y: number;
  readonly height: number;
  readonly iced: boolean;
  /** Where the hex sits between the equator and a pole. Spec 5.7.3. */
  readonly sinLat: number;
}

/** What the camera is to show, in the projected units the panel's viewBox uses. */
export interface ReliefFrame {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ReliefInput {
  readonly cells: readonly ReliefCell[];
  /** The lowest height in view, which the block is cut off under. */
  readonly low: number;
  readonly seaLevel: number;
  /** How the view of 5.7 colours a place on this world. */
  readonly shade: Shader;
  /** How far the patch reaches, in hexes, so its footprint can be closed. */
  readonly reach: number;
  /** The two lattice steps, for placing the footprint's corners. */
  readonly basis: readonly [Pt2, Pt2];
  readonly frame: ReliefFrame;
}

export interface ReliefView {
  readonly element: HTMLElement;
  render(input: ReliefInput): void;
}

/** Cut earth: the same for every world, since it is under the ground rather than on it. */
const EARTH = 0x5c4b3c;

/**
 * The sun, and the light that keeps what it misses from going black. The sky fills
 * from above and the ground bounces from below, and a flat wash over both of them
 * carries the sides of the block, which face neither.
 */
const SUN = { colour: 0xfff4e2, strength: 2.2, from: [-0.55, 0.62, 0.56] } as const;
const SKY = { above: 0x9dbde0, below: 0x4a4035, strength: 1.0 } as const;
const FILL = 0.55;

/** Water, as a sheet over the ground rather than a colour on it. Spec 4.5.9.3. */
const WATER = { colour: 0x2f6ea8, opacity: 0.66, roughness: 0.08 } as const;

export function createReliefView(): ReliefView {
  const element = document.createElement("div");
  element.className = "relief";

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  element.append(renderer.domElement);

  const scene = new THREE.Scene();

  // Orthographic, because the projection the overlays are drawn with is
  // orthographic: a perspective camera would put the hexes of the SVG out of step
  // with the ground under them by however far they are from the middle.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 4000);
  // Seen from ANGLE above the ground, looking level along the drawing. The camera
  // sits far enough back that everything is in front of it whatever the relief.
  const back = 1000;
  camera.position.set(0, Math.sin(ANGLE) * back, Math.cos(ANGLE) * back);
  camera.up.set(0, Math.cos(ANGLE), -Math.sin(ANGLE));
  camera.lookAt(0, 0, 0);

  const sun = new THREE.DirectionalLight(SUN.colour, SUN.strength);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(SKY.above, SKY.below, SKY.strength));
  scene.add(new THREE.AmbientLight(0xffffff, FILL));

  const ground = new THREE.Group();
  scene.add(ground);

  /** Everything built for the patch on screen, so the next one can replace it. */
  let built: THREE.Object3D[] = [];

  function clear(): void {
    for (const object of built) {
      ground.remove(object);
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const material = object.material as THREE.Material | THREE.Material[];
        for (const one of Array.isArray(material) ? material : [material]) one.dispose();
      }
    }
    built = [];
  }

  function render(input: ReliefInput): void {
    clear();
    const { clientWidth: w, clientHeight: h } = element;
    if (w === 0 || h === 0 || input.cells.length === 0) return;
    renderer.setSize(w, h, false);

    // The frustum is the panel's own viewBox, read in the camera's plane. The SVG
    // measures down from its top and the camera measures up from its middle, so
    // the two vertical edges swap and change sign.
    camera.left = input.frame.left;
    camera.right = input.frame.left + input.frame.width;
    camera.top = -input.frame.top;
    camera.bottom = -(input.frame.top + input.frame.height);
    camera.updateProjectionMatrix();

    // Height is measured up from the floor of the patch rather than from the floor
    // of the height field, because that is where iso.ts measures the overlays
    // from. Two origins would stand the ground and the marks on it apart by
    // however high the patch happens to sit on the world. Spec 4.5.9.
    const stand = (h: number) => (h - input.low) * EXAGGERATION;
    const floor = -BASE_DROP;
    const [e1, e2] = input.basis;
    const at = (dp: number, dq: number): Pt2 => [
      dp * e1[0] + dq * e2[0],
      dp * e1[1] + dq * e2[1],
    ];

    const byKey = new Map<string, ReliefCell>();
    for (const cell of input.cells) byKey.set(`${cell.dp},${cell.dq}`, cell);
    /** The height at a footprint corner, or the floor where the patch has none. */
    const heightAt = (cell: Pt2) => byKey.get(`${cell[0]},${cell[1]}`)?.height ?? input.low;

    // The surface: one vertex a hex, and the lattice's own triangles between them.
    // Smooth normals over those is what turns a field of samples into a hillside.
    const index = new Map<string, number>();
    const positions: number[] = [];
    const colours = new Float32Array(input.cells.length * 3);
    const colour = new THREE.Color();
    for (const cell of input.cells) {
      const i = index.size;
      index.set(`${cell.dp},${cell.dq}`, i);
      positions.push(cell.x, stand(cell.height), cell.y);
      colour.setStyle(input.shade(cell.height, cell.sinLat, cell.iced));
      colour.convertSRGBToLinear();
      colours.set([colour.r, colour.g, colour.b], i * 3);
    }

    // Which way round a triangle is wound decides which way its normal faces, and
    // the lattice's two steps can be handed either way about depending on the face
    // the patch was taken from.
    const det = e1[0] * e2[1] - e1[1] * e2[0];
    const faces: number[] = [];
    const wind = (a: number, b: number, c: number) =>
      det > 0 ? faces.push(a, c, b) : faces.push(a, b, c);
    for (const cell of input.cells) {
      const here = index.get(`${cell.dp},${cell.dq}`)!;
      const east = index.get(`${cell.dp + 1},${cell.dq}`);
      const north = index.get(`${cell.dp},${cell.dq + 1}`);
      const far = index.get(`${cell.dp + 1},${cell.dq + 1}`);
      if (east !== undefined && north !== undefined) wind(here, east, north);
      if (east !== undefined && north !== undefined && far !== undefined) wind(east, far, north);
    }

    const surface = new THREE.BufferGeometry();
    surface.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    surface.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
    surface.setIndex(faces);
    surface.computeVertexNormals();

    // A vertex takes its normal from the triangles round it, and a vertex on the
    // rim of the patch has only some of them: the ones that would have been
    // outside it are missing, so the normal leans out over the edge and the
    // outermost strip of ground comes out as a row of dark teeth. Each rim vertex
    // is given the normal of the vertex one step inside it instead, which is the
    // ground it is the edge of. Spec 4.5.9.2.
    const rim = footprint(input.reach);
    const normals = surface.getAttribute("normal") as THREE.BufferAttribute;
    for (const cell of rim) {
      const edge = index.get(`${cell[0]},${cell[1]}`);
      const inward = index.get(`${inwardOf(cell)[0]},${inwardOf(cell)[1]}`);
      if (edge === undefined || inward === undefined) continue;
      normals.setXYZ(
        edge,
        normals.getX(inward),
        normals.getY(inward),
        normals.getZ(inward),
      );
    }
    normals.needsUpdate = true;
    const land = new THREE.Mesh(
      surface,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }),
    );
    land.castShadow = true;
    land.receiveShadow = true;
    ground.add(land);
    built.push(land);

    // The block the ground stands on: the patch's own hexagonal footprint, walled
    // down to a floor under the lowest hex. Without it the ground would be a sheet
    // hanging in the panel with nothing under it. Spec 4.5.9.3.
    const wall: number[] = [];
    for (let k = 0; k < rim.length; k++) {
      const a = rim[k]!;
      const b = rim[(k + 1) % rim.length]!;
      const ha = heightAt(a);
      const hb = heightAt(b);
      const pa = at(a[0], a[1]);
      const pb = at(b[0], b[1]);
      const top = [
        [pa[0], stand(ha), pa[1]],
        [pb[0], stand(hb), pb[1]],
      ];
      const foot = [
        [pb[0], floor, pb[1]],
        [pa[0], floor, pa[1]],
      ];
      // Anticlockwise seen from outside, which is the way round the rim is walked.
      wall.push(...top[0]!, ...top[1]!, ...foot[0]!);
      wall.push(...top[0]!, ...foot[0]!, ...foot[1]!);
    }
    const sides = new THREE.BufferGeometry();
    sides.setAttribute("position", new THREE.Float32BufferAttribute(wall, 3));
    sides.computeVertexNormals();
    const block = new THREE.Mesh(
      sides,
      new THREE.MeshStandardMaterial({
        color: EARTH,
        roughness: 0.98,
        metalness: 0,
        // The rim is walked one way round and the floor closes it the other, so
        // both sides of the block are drawn rather than only whichever happened to
        // face out.
        side: THREE.DoubleSide,
      }),
    );
    block.receiveShadow = true;
    ground.add(block);
    built.push(block);

    // The sea: a sheet at sea level rather than a colour painted on the ground,
    // and the sides of the water standing on the ground under it. The block is a
    // piece cut out of the world, so where the sea is deep at the edge of it the
    // cut goes through water as well as through earth, and a sheet with nothing
    // under it at the rim would hang over the walls instead of being held by them.
    if (input.seaLevel > input.low) {
      const pool = new THREE.BufferGeometry();
      const surfaceY = stand(input.seaLevel);
      const fan: number[] = [];
      for (let k = 1; k + 1 < rim.length; k++) {
        for (const corner of [rim[0]!, rim[k]!, rim[k + 1]!]) {
          const p = at(corner[0], corner[1]);
          fan.push(p[0], surfaceY, p[1]);
        }
      }
      for (let k = 0; k < rim.length; k++) {
        const a = rim[k]!;
        const b = rim[(k + 1) % rim.length]!;
        const ha = Math.min(heightAt(a), input.seaLevel);
        const hb = Math.min(heightAt(b), input.seaLevel);
        // Dry all along this stretch of the rim: no water to show the side of.
        if (ha >= input.seaLevel && hb >= input.seaLevel) continue;
        const pa = at(a[0], a[1]);
        const pb = at(b[0], b[1]);
        const bed = [
          [pa[0], stand(ha), pa[1]],
          [pb[0], stand(hb), pb[1]],
        ];
        const top = [
          [pb[0], surfaceY, pb[1]],
          [pa[0], surfaceY, pa[1]],
        ];
        fan.push(...bed[0]!, ...bed[1]!, ...top[0]!);
        fan.push(...bed[0]!, ...top[0]!, ...top[1]!);
      }
      pool.setAttribute("position", new THREE.Float32BufferAttribute(fan, 3));
      pool.computeVertexNormals();
      const water = new THREE.Mesh(
        pool,
        new THREE.MeshStandardMaterial({
          color: WATER.colour,
          transparent: true,
          opacity: WATER.opacity,
          roughness: WATER.roughness,
          metalness: 0.1,
          side: THREE.DoubleSide,
        }),
      );
      water.receiveShadow = true;
      ground.add(water);
      built.push(water);
    }

    // The sun is put where it lights the patch from over the near shoulder, and its
    // shadow camera is sized to the patch rather than to the world: a shadow map
    // spread over anything larger would be too coarse to show a hillside.
    const across = Math.max(input.frame.width, input.frame.height);
    sun.position.set(
      SUN.from[0] * across,
      SUN.from[1] * across,
      SUN.from[2] * across,
    );
    sun.target.position.set(0, 0, 0);
    sun.target.updateMatrixWorld();
    const reach = across * 0.75;
    sun.shadow.camera.left = -reach;
    sun.shadow.camera.right = reach;
    sun.shadow.camera.top = reach;
    sun.shadow.camera.bottom = -reach;
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = across * 4;
    sun.shadow.bias = -0.0008;
    sun.shadow.camera.updateProjectionMatrix();

    renderer.render(scene, camera);
  }

  return { element, render };
}

/** How far a lattice offset is from the middle, counted in hexes. */
const away = (cell: Pt2): number =>
  Math.max(Math.abs(cell[0]), Math.abs(cell[1]), Math.abs(cell[0] + cell[1]));

/** The neighbour of a cell that stands one step nearer the middle of the patch. */
export function inwardOf(cell: Pt2): Pt2 {
  const SIX: readonly Pt2[] = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  let best = cell;
  for (const [dp, dq] of SIX) {
    const next: Pt2 = [cell[0] + dp, cell[1] + dq];
    if (away(next) < away(best)) best = next;
  }
  return best;
}

/**
 * The patch's own boundary, walked round in order. The window is the hexagon of
 * lattice offsets within `reach` of the middle, so its edge is the ring at exactly
 * that distance: six corners, and `reach` steps along each side between them.
 */
export function footprint(reach: number): Pt2[] {
  const CORNERS: readonly Pt2[] = [
    [reach, 0],
    [0, reach],
    [-reach, reach],
    [-reach, 0],
    [0, -reach],
    [reach, -reach],
  ];
  if (reach < 1) return [[0, 0]];
  const ring: Pt2[] = [];
  for (let k = 0; k < CORNERS.length; k++) {
    const from = CORNERS[k]!;
    const to = CORNERS[(k + 1) % CORNERS.length]!;
    for (let step = 0; step < reach; step++) {
      const t = step / reach;
      ring.push([
        Math.round(from[0] + (to[0] - from[0]) * t),
        Math.round(from[1] + (to[1] - from[1]) * t),
      ]);
    }
  }
  return ring;
}
