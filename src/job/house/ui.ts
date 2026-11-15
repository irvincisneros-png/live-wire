// Small DOM helpers shared by Jobs 1 and 2: camera buttons over the view, the reading format and the stop card.
import { h } from '../../ui/dom';
import type { CameraPreset } from '../house3d';

const CAM_LABEL: Record<CameraPreset, string> = { overview: 'Whole house', switchboard: 'Switchboard', lighting: 'Lights', outletWall: 'Outlet wall' };

/** a row of camera preset buttons in the top-right corner of the view */
export function cameraBar(view: HTMLElement, go: (p: CameraPreset) => void, list: CameraPreset[]): HTMLElement {
  const bar = h('div', { class: 'j12-cams', role: 'toolbar', 'aria-label': 'Camera views' },
    list.map((p) => h('button', { class: 'j12-cam', type: 'button', onclick: () => go(p) }, CAM_LABEL[p])));
  view.append(bar);
  return bar;
}

/** a meter reading for the LCD-style table: "12.0", "0.00" */
export function fmtV(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const t = a >= 9.995 ? a.toFixed(1) : a.toFixed(2);
  return (v < 0 && Number(t) !== 0 ? '−' : '') + t;
}

/** a calm full-view card that stops the job until the student acknowledges it */
export function stopCard(view: HTMLElement, title: string, body: string, onClose: () => void): HTMLElement {
  const btn = h('button', { class: 'lw-btn', type: 'button' }, 'I understand');
  const card = h('div', { class: 'j12-stop', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'j12-stop-h' },
    h('div', { class: 'j12-stop-card' },
      h('div', { class: 'j12-stop-icon', 'aria-hidden': 'true' }, '✋'),
      h('h2', { id: 'j12-stop-h' }, title),
      h('p', null, body),
      btn));
  btn.addEventListener('click', () => { card.remove(); onClose(); });
  view.append(card);
  btn.focus();
  return card;
}
