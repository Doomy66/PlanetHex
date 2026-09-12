import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Grid } from "../grid/grid";
import type { Vec3 } from "../grid/vec3";
import type { Shader } from "./colour";
import { isIced, type IceCaps } from "../gen/ice";
import type { PoiKind } from "../poi";

/**
 * The planet as a sphere. Spec.md section 4.4.
 *
 * The mesh is built from the cell outlines of whatever grid it is handed, each one
 * filled with the flat colour its height maps to, so the globe and the flat map
 * are two views of one set of numbers rather than two drawings that happen to
 * agree. The grid it is handed is the finest of them, under 4.4.9, and not the one
 * the map is drawing.
 *
 * So the panel knows nothing about display hexes. What is marked on it - the
 * selection of 4.4.4 and the rings of 4.4.8 - arrives as the corners of a hex
 * rather than as a hex of some grid, and a click leaves as the point of the sphere
 * it landed on. Both are directions, which mean the same thing at every level, and
 * it is the caller that knows which level it is asking about. Spec 4.4.9.2.
 */

/**
 * How fast the world turns, in radians a second. Matches the rate the camera used
 * to orbit at, so nothing about the pace of the panel changes.
 */
const SPIN_RAD_PER_SEC = (0.35 * Math.PI * 2) / 60;
/**
 * The display radius of the largest world there can be, size digit A, and of the
 * smallest. Spec 4.4.5: the sphere is drawn at a radius the diameter of 6.12
 * sets, so a small world looks small rather than every planet filling the panel.
 * The floor keeps a size 0 world a planet on screen rather than a dot.
 */
const MAX_RADIUS = 1;
const MIN_RADIUS = 0.25;
/** Diameter of a size A world, the top of the table in 6.12.2. */
const LARGEST_KM = 16000;

/** Where the camera sits before the user has touched it. */
const HOME_CAMERA = [0, 0.8, 3] as const;
/** How long after the user lets go before the planet resumes turning. */
const RESUME_SPIN_MS = 2500;
const SELECT_LIFT = 1.004;
/** POI rings sit a shade further out than the selection, so the two never z-fight. */
const POI_LIFT = 1.006;
/** Fallbacks, should the stylesheet not have been read yet. */
const POI_FALLBACK: Record<PoiKind, string> = { starport: "#ff4d47", comment: "#d7dde6" };
const SELECT_FALLBACK = "#e0b341";
/**
 * How far the axis line stands out past the surface, as a multiple of the radius.
 * North is the longer end, so which pole is which can be told at a glance.
 */
const AXIS_NORTH = 1.22;
const AXIS_SOUTH = 1.12;
const DRAG_SLOP_PX = 4;

/** A hex to ring on the sphere, named by its own corners. Spec 4.4.9.2. */
export interface GlobeMark {
  readonly corners: readonly Vec3[];
  readonly kind: PoiKind;
}

export interface Globe {
  readonly element: HTMLElement;
  render(
    grid: Grid,
    heights: Float64Array,
    diameterKm: number | null,
    caps: IceCaps | null,
    /** How the view of 5.7 colours a place on this world. */
    shade: Shader,
    axialTiltDeg: number,
  ): void;
  /** The hex to mark, by its corners, or null for none. Spec 4.4.4. */
  setSelected(corners: readonly Vec3[] | null): void;
  /** The hexes carrying a POI, ringed in the colour of their kind. Spec 4.4.8. */
  setPois(marks: readonly GlobeMark[]): void;
  /** Where on the sphere a click landed, as a direction from its centre. */
  onSelect(handler: (at: Vec3) => void): void;
  /** Back to the starting viewpoint, so a new planet's size can be read. Spec 4.4.5.2. */
  resetView(): void;
}

/**
 * The radius to draw a world of this diameter at. Straight-line from the floor at
 * nothing to MAX_RADIUS at the largest world, so the detail value within a digit
 * moves it as well as the digit itself. An unreadable UWP has no diameter, and
 * gets the full radius rather than an arbitrary smaller one.
 */
/**
 * How far the axis leans from upright on screen, in radians. Spec 4.4.7: the tilt
 * of 6.12.3 is shown rather than left to the panel below, so the shape of the
 * world's seasons can be seen before any number is read.
 *
 * The whole 0 to 180 of the obliquity, not the seasonal tilt the ice reads. Past
 * 90 the north pole goes below the plane of the orbit and the world turns
 * backwards, and leaning it that far is what draws both facts at once.
 */
export function globeTiltRadians(axialTiltDeg: number): number {
  const clamped = Math.min(180, Math.max(0, axialTiltDeg));
  return (clamped * Math.PI) / 180;
}

export function globeRadius(diameterKm: number | null): number {
  if (diameterKm === null) return MAX_RADIUS;
  const part = Math.min(1, Math.max(0, diameterKm / LARGEST_KM));
  return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * part;
}

/** The line through the poles. Spec 4.4.7.4. */
function poleLine(): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -AXIS_SOUTH, 0),
    new THREE.Vector3(0, AXIS_NORTH, 0),
  ]);
  return new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color: 0xe8eef7, transparent: true, opacity: 0.85 }),
  );
}

/**
 * A colour off the stylesheet, so the globe and the map cannot drift apart on
 * what red, yellow, and the selection are. Spec 5.5.1.
 */
function cssColour(name: string, fallback: string): THREE.Color {
  const styled = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(styled === "" ? fallback : styled).convertSRGBToLinear();
}

function poiColour(kind: PoiKind): THREE.Color {
  return cssColour(`--poi-${kind}`, POI_FALLBACK[kind]);
}

export function createGlobe(): Globe {
  const element = document.createElement("div");
  element.className = "globe";

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  element.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
  camera.position.set(...HOME_CAMERA);

  scene.add(new THREE.AmbientLight(0xffffff, 2.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(2, 2.5, 3);
  scene.add(sun);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // Set against the radius in render, so zooming in on a small world gets as
  // close to its surface as zooming in on a large one. Spec 4.4.5.1.
  controls.minDistance = 1.25;
  controls.maxDistance = 6;
  // The spin of 4.4.2 turns the world about its own axis rather than walking the
  // camera around it. With an axis that leans, the two are not the same: orbiting
  // the camera would swing the pole from one side of the sphere to the other and
  // read as a wobble, where a tilted world in fact holds its axis still and turns
  // under it.
  controls.autoRotate = false;
  let spinning = true;

  // Spec 4.4.3: a drag takes over from the spin. It picks up again once the user
  // has been still for a moment, so the panel does not sit frozen afterwards.
  let resumeTimer = 0;
  controls.addEventListener("start", () => {
    spinning = false;
    window.clearTimeout(resumeTimer);
  });
  controls.addEventListener("end", () => {
    resumeTimer = window.setTimeout(() => {
      spinning = true;
    }, RESUME_SPIN_MS);
  });

  // Three nested frames: the outer one carries the world's size, the middle one
  // the lean of its axis, and the inner one the rotation about that axis. Keeping
  // them apart is what lets the world turn without the axis moving with it.
  const planet = new THREE.Group();
  const axis = new THREE.Group();
  const spin = new THREE.Group();
  planet.add(axis);
  axis.add(spin);
  scene.add(planet);

  // The axis line of 4.4.7.4. It hangs on the axis group rather than the spinning
  // one, so it holds still while the world turns under it, and it is depth tested
  // so only the two ends that stand clear of the surface are drawn.
  axis.add(poleLine());

  let surface: THREE.Mesh | null = null;
  let highlight: THREE.Mesh | null = null;
  // On the spinning group, so a mark turns with the ground it is drawn on.
  const poiLayer = new THREE.Group();
  spin.add(poiLayer);
  let poiMarks: readonly GlobeMark[] = [];
  let handlers: ((at: Vec3) => void)[] = [];

  function render(
    grid: Grid,
    heights: Float64Array,
    diameterKm: number | null,
    caps: IceCaps | null,
    shade: Shader,
    axialTiltDeg: number,
  ): void {
    disposeSurface();

    // Leaning about Z puts the pole over towards one side of the panel, where the
    // camera of 4.4 can see it. About X it would lean towards the viewer and a
    // 23 degree world would look upright.
    axis.rotation.z = globeTiltRadians(axialTiltDeg);

    // The mesh is always a unit sphere and the group carries the size, which
    // leaves the camera where the user left it: the world changes size in view
    // rather than the view changing to hide that it did. Spec 4.4.5.
    const radius = globeRadius(diameterKm);
    planet.scale.setScalar(radius);
    controls.minDistance = 1.25 * radius;

    let triangles = 0;
    for (const cell of grid.cells) triangles += cell.corners.length;

    const positions = new Float32Array(triangles * 9);
    const colours = new Float32Array(triangles * 9);

    const colour = new THREE.Color();
    let t = 0;
    for (const cell of grid.cells) {
      const sinLat = cell.centre[1];
      colour.setStyle(shade(heights[cell.id]!, sinLat, isIced(caps, sinLat)));
      colour.convertSRGBToLinear();
      const corners = cell.corners;
      const [ax, ay, az] = cell.centre;
      // Fan from the cell centre, which keeps pentagons and hexagons the same code.
      for (let k = 0; k < corners.length; k++) {
        const b = corners[k]!;
        const c = corners[(k + 1) % corners.length]!;
        const o = t * 9;
        positions.set([ax, ay, az, b[0], b[1], b[2], c[0], c[1], c[2]], o);
        for (let v = 0; v < 3; v++) colours.set([colour.r, colour.g, colour.b], o + v * 3);
        t++;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    geometry.computeVertexNormals();
    surface = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    );
    spin.add(surface);
    // The corners the marks are drawn from have just been rebuilt, so the marks
    // are drawn again from the new ones.
    drawPois();
  }

  /**
   * A ring around each hex carrying a POI. Spec 4.4.8: a ring rather than the
   * filled patch the selection uses, so the two read as different things on a
   * hex that is both, and so the ground inside is still the ground.
   *
   * Depth tested, unlike the selection, which is what hides a mark on the far
   * side of the world instead of drawing it through the planet.
   */
  function drawPois(): void {
    for (const child of [...poiLayer.children]) {
      poiLayer.remove(child);
      (child as THREE.Line).geometry.dispose();
      ((child as THREE.Line).material as THREE.Material).dispose();
    }
    for (const { corners, kind } of poiMarks) {
      if (corners.length === 0) continue;
      const geometry = new THREE.BufferGeometry().setFromPoints(
        corners.map((c) => new THREE.Vector3(c[0], c[1], c[2]).setLength(POI_LIFT)),
      );
      poiLayer.add(
        new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color: poiColour(kind) })),
      );
    }
  }

  function setPois(marks: readonly GlobeMark[]): void {
    poiMarks = marks;
    drawPois();
  }

  function setSelected(hex: readonly Vec3[] | null): void {
    if (highlight) {
      spin.remove(highlight);
      highlight.geometry.dispose();
      (highlight.material as THREE.Material).dispose();
      highlight = null;
    }
    if (hex === null || hex.length === 0) return;
    const corners = hex.map((c) => new THREE.Vector3(c[0], c[1], c[2]));

    const centre = new THREE.Vector3();
    for (const c of corners) centre.add(c);
    centre.divideScalar(corners.length).setLength(SELECT_LIFT);

    const positions = new Float32Array(corners.length * 9);
    for (let k = 0; k < corners.length; k++) {
      const b = corners[k]!.clone().setLength(SELECT_LIFT);
      const c = corners[(k + 1) % corners.length]!.clone().setLength(SELECT_LIFT);
      positions.set([centre.x, centre.y, centre.z, b.x, b.y, b.z, c.x, c.y, c.z], k * 9);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    highlight = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: cssColour("--select", SELECT_FALLBACK),
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    );
    highlight.renderOrder = 1;
    spin.add(highlight);
  }

  function disposeSurface(): void {
    if (!surface) return;
    spin.remove(surface);
    surface.geometry.dispose();
    (surface.material as THREE.Material).dispose();
    surface = null;
  }

  /* Picking. Spec 4.4.4: selecting on the globe is the reverse of the map. */

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt: { x: number; y: number } | null = null;

  renderer.domElement.addEventListener("pointerdown", (event) => {
    downAt = { x: event.clientX, y: event.clientY };
  });
  renderer.domElement.addEventListener("pointerup", (event) => {
    const start = downAt;
    downAt = null;
    if (!start || !surface) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG_SLOP_PX) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(surface, false)[0];
    if (!hit) return;
    // Back out of the spin and the lean into the world's own frame, so the point
    // is where the click landed on the ground rather than where that ground
    // happened to be pointing at the time. Spec 4.4.9.2.
    const at = spin.worldToLocal(hit.point.clone()).normalize();
    if (!Number.isFinite(at.x) || !Number.isFinite(at.y) || !Number.isFinite(at.z)) return;
    for (const h of handlers) h([at.x, at.y, at.z]);
  });

  /* Sizing and the frame loop. */

  function resize(): void {
    const { clientWidth: w, clientHeight: h } = element;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(element);

  let lastFrameMs: number | null = null;
  renderer.setAnimationLoop((nowMs) => {
    const elapsed = lastFrameMs === null ? 0 : (nowMs - lastFrameMs) / 1000;
    lastFrameMs = nowMs;
    // Capped, so a tab left in the background does not come back to a world that
    // has spun through however many minutes it was away in a single frame.
    if (spinning) spin.rotation.y += SPIN_RAD_PER_SEC * Math.min(elapsed, 0.1);
    controls.update();
    renderer.render(scene, camera);
  });

  function resetView(): void {
    camera.position.set(...HOME_CAMERA);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  return {
    element,
    render,
    setSelected,
    setPois,
    resetView,
    onSelect(handler) {
      handlers = [...handlers, handler];
    },
  };
}
