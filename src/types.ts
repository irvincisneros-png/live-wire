// Live Wire shared contracts. Owned by the orchestrator: builders must not change the meaning of
// anything here. You may ADD optional fields/methods if you need them; list every addition in your report.
import type * as THREE from 'three';

// ───────────────────────────── sim (pure, no DOM / three) ─────────────────────────────

export type PartKind = 'battery' | 'wire' | 'switch' | 'globe' | 'resistor' | 'ammeter' | 'voltmeter';

/** One two-terminal part joining node `a` to node `b`. On the bench, node ids are post ids. */
export interface Part {
  id: string;
  kind: PartKind;
  a: number;
  /** For a battery: `a` is the NEGATIVE terminal and `b` is the POSITIVE terminal. */
  b: number;
  /** battery: EMF in volts */
  emf?: number;
  /** battery: internal resistance in ohms (default 0.2) */
  rInt?: number;
  /** resistor: ohms */
  resistance?: number;
  /** globe: rated volts and watts; resistance = ratedV² / ratedW */
  ratedV?: number;
  ratedW?: number;
  /** switch: true = closed (conducting). default false */
  closed?: boolean;
  /** globe: filament broken → open circuit */
  blown?: boolean;
  /** resistor: value hidden from the student (mystery resistor) */
  mystery?: boolean;
  /** cannot be removed or edited by the student */
  locked?: boolean;
  /** short text shown on the part (e.g. "R1") */
  label?: string;
}

export interface Circuit {
  parts: Part[];
}

export interface PartResult {
  /** Conventional current in amps flowing through the part from node `a` to node `b` (signed).
   *  Electrons (the dots) move the opposite way. A battery that is delivering energy has current > 0. */
  current: number;
  /** V(a) − V(b) in volts (signed). For a delivering battery this is negative (b is the + terminal). */
  drop: number;
  /** Watts. Resistive parts: energy dissipated per second (≥ 0). Battery: energy delivered to the circuit (emf × current). */
  power: number;
}

export interface Solution {
  /** 'invalid' = the solve failed (NaN); show no readouts and pass no checks */
  status: 'ok' | 'invalid';
  /** potential of every node that appears in the circuit, volts. Each connected island's lowest node is 0. */
  node: Record<number, number>;
  parts: Record<string, PartResult>;
  /** ids of batteries whose current exceeds SHORT_LIMIT_A */
  shorted: string[];
  /** ids of globes whose power exceeds BLOW_FACTOR × rated (the caller decides when to mark them blown) */
  overloaded: string[];
  /** true if any part carries more than 1 µA */
  live: boolean;
}

// ───────────────────────────── fixed quantity colours ─────────────────────────────

export const Q = {
  current: { symbol: 'I', unit: 'A', name: 'Current', colour: '#56B4E9' },
  voltage: { symbol: 'V', unit: 'V', name: 'Voltage', colour: '#F0E442' },
  resistance: { symbol: 'R', unit: 'Ω', name: 'Resistance', colour: '#CC79A7' },
  energy: { symbol: 'E', unit: 'J', name: 'Energy', colour: '#D55E00' },
  power: { symbol: 'P', unit: 'W', name: 'Power', colour: '#009E73' },
} as const;
export type Quantity = keyof typeof Q;

// ───────────────────────────── kit: stage ─────────────────────────────

export type QualityTier = 'low' | 'medium' | 'high';

export interface StageOptions {
  /** initial orbit */
  target?: [number, number, number];
  distance?: number;
  yaw?: number;
  pitch?: number;
  minDistance?: number;
  maxDistance?: number;
  /** background mood */
  mood?: 'workshop' | 'kitchen' | 'dark' | 'outdoor' | 'house';
  /** disable user orbit (fixed camera scenes) */
  lockCamera?: boolean;
}

export interface Stage {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly quality: QualityTier;
  /** per-frame callback; dt in seconds (clamped to 0.1), t = seconds since stage start. Returns unsubscribe. */
  onFrame(cb: (dt: number, t: number) => void): () => void;
  /** smoothly move the orbit camera */
  flyTo(o: { target?: [number, number, number]; distance?: number; yaw?: number; pitch?: number }, seconds?: number): void;
  resetView(): void;
  /** ray from a pointer event's client coords against objects (recursive) */
  pick(clientX: number, clientY: number, objects: THREE.Object3D[]): THREE.Intersection[];
  /** point on the plane y = planeY under the pointer, or null */
  pointOnPlane(clientX: number, clientY: number, planeY: number): THREE.Vector3 | null;
  /** true while the user is dragging the camera (so scene taps can be ignored) */
  readonly orbiting: boolean;
  setCameraLocked(locked: boolean): void;
  dispose(): void;
}

// ───────────────────────────── bench ─────────────────────────────

export interface TrayItem {
  /** unique within the tray */
  key: string;
  label: string;
  /** template for the placed part (id, a, b are filled in on placement) */
  part: Omit<Part, 'id' | 'a' | 'b'>;
  /** how many may be placed; undefined = unlimited */
  max?: number;
}

export interface BenchOptions {
  cols?: number; // default 5
  rows?: number; // default 4
  tray: TrayItem[];
  initial?: Part[];
  /** show the supply voltage knob for batteries flagged adjustable (Station 4) */
  adjustableSupply?: { partId: string; min: number; max: number; step: number };
  /** student cannot add/remove parts (measure-only scenes) */
  readOnly?: boolean;
  /** start with x-ray dots on */
  xray?: boolean;
}

export interface Bench {
  /** current parts (treat as read-only; use setParts / editPart to change) */
  getParts(): Part[];
  setParts(parts: Part[]): void;
  editPart(id: string, patch: Partial<Part>): void;
  removePart(id: string): void;
  /** latest solved circuit; always in step with getParts() */
  readonly solution: Solution;
  /** fires after every change (student or programmatic) with the fresh solution. Returns unsubscribe. */
  onChange(cb: (bench: Bench) => void): () => void;
  /** fires when a globe blows or the breaker trips */
  onEvent(cb: (e: { type: 'blown' | 'tripped' | 'reset'; partId?: string }) => void): () => void;
  readonly selectedId: string | null;
  select(id: string | null): void;
  onSelect(cb: (id: string | null) => void): () => void;
  setXray(on: boolean): void;
  readonly xray: boolean;
  setTray(items: TrayItem[]): void;
  setReadOnly(readOnly: boolean): void;
  /** pulse a ring on parts / posts to direct attention (coach). Empty arrays clear. */
  highlight(partIds: string[], postIds?: number[]): void;
  /** the breaker has tripped because of a short; cleared by resetBreaker() or by removing the short */
  readonly tripped: boolean;
  resetBreaker(): void;
  /** joules dissipated by a part since the last resetEnergy() (sim time) */
  energyOf(partId: string): number;
  resetEnergy(): void;
  /** SVG circuit diagram that stays in step with the bench; append it wherever you like */
  readonly diagram: SVGSVGElement;
  /** post id for (col,row) and its world position */
  postId(col: number, row: number): number;
  postPosition(postId: number): THREE.Vector3;
  /** world position of the middle of a part (for labels / zoom targets) */
  partPosition(partId: string): THREE.Vector3 | null;
  dispose(): void;
}

// ───────────────────────────── ui: coach, checks, dashboard, progress ─────────────────────────────

export interface CoachStep {
  /** short instruction; may contain <b>, <i>, <span class="q-current"> etc. */
  text: string;
  /** polled on every frame-ish tick; the step auto-advances when it returns true. If absent, a Next button is shown. */
  done?: () => boolean;
  onEnter?: () => void;
  onLeave?: () => void;
}

export interface Coach {
  /** start a guided sequence; resolves when the last step completes or it is skipped */
  run(steps: CoachStep[]): Promise<void>;
  /** one-off message (free play, feedback) */
  say(html: string): void;
  clear(): void;
}

export type CheckTask =
  | { id: string; kind: 'do'; prompt: string; test: () => boolean; explain?: string; onStart?: () => void }
  | { id: string; kind: 'number'; prompt: string; answer: number; tolerance: number; unit: string; explain: string; onStart?: () => void }
  | { id: string; kind: 'choice'; prompt: string; options: string[]; correct: number; explain: string; onStart?: () => void };

export interface Reading {
  label: string;
  V?: number;
  I?: number;
  R?: number;
  P?: number;
  E?: number;
}

export interface Dashboard {
  /** show live values for the selected thing; null hides the strip */
  show(reading: Reading | null): void;
}

export type Phase = 'guided' | 'free' | 'checks';

export interface Progress {
  hasTicket(ticket: string): boolean;
  checkPassed(stationId: string, taskId: string): boolean;
  jobResult(jobId: string): JobResult | null;
}

// ───────────────────────────── stations ─────────────────────────────

export interface StationHost {
  /** container for the 3D canvas; fills the main area. Create your Stage in here. */
  view: HTMLElement;
  /** side panel for diagram / graph / cards. Beside the view on wide screens, a pull-up sheet on narrow ones. */
  side: HTMLElement;
  coach: Coach;
  dashboard: Dashboard;
  progress: Progress;
  quality: QualityTier;
}

export interface StationInstance {
  steps: CoachStep[];
  tasks: CheckTask[];
  /** called when the student switches phase; reset or unlock the scene as needed */
  onPhase?(phase: Phase): void;
  dispose(): void;
}

export interface StationDef {
  id: string; // 's0' … 's7'
  num: number;
  title: string;
  /** name of the ticket this station awards */
  ticket: string;
  blurb: string;
  dotPoints: string[];
  /** lazy-loaded so each station is its own chunk */
  load(): Promise<{ mount(host: StationHost): StationInstance | Promise<StationInstance> }>;
}

// ───────────────────────────── the job ─────────────────────────────

export interface JobAnswer {
  q: string;
  a: string;
  ok?: boolean;
}

export interface JobResult {
  stars: 0 | 1 | 2 | 3;
  /** 0–100 */
  score: number;
  /** 2–4 short lines: what was strong, what to revisit */
  lines: string[];
  answers: JobAnswer[];
}

export interface JobHost {
  view: HTMLElement;
  /** the job's own controls and questions */
  panel: HTMLElement;
  dashboard: Dashboard;
  quality: QualityTier;
  /** deterministic seed for this attempt */
  seed: number;
  /** call once when the job is complete; the shell shows the result and stores it */
  finish(result: JobResult): void;
}

export interface JobInstance {
  dispose(): void;
}

export interface JobDef {
  id: string; // 'j1' … 'j5'
  num: number;
  title: string;
  brief: string;
  tickets: string[];
  dotPoints: string[];
  load(): Promise<{ mount(host: JobHost): JobInstance | Promise<JobInstance> }>;
}
