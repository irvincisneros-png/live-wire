// Shared layout for station and job pages.
//
//  .lw-ws
//    header.lw-bar              back button, title, (phase tabs)
//    div.lw-dash                dashboard strip (hidden until a Reading is shown)
//    div.lw-banner?             optional note (Job 2 safety message)
//    div.lw-main
//      div.lw-viewwrap          position: relative; fills the space
//        div.lw-view            <- StationHost.view / JobHost.view (position:absolute; inset:0)
//        div.lw-coach           coach card (top left, over the view)
//        div.lw-loading         loading / error overlay
//      aside.lw-sidewrap        beside the view >= 900 px, pull-up sheet below that
//        button.lw-handle       (narrow only)
//        div.lw-sidebody
//          div.lw-checks        checks panel (stations only)
//          div.lw-side|lw-panel <- StationHost.side / JobHost.panel
import { createDashboard } from './dashboard';
import type { DashboardUI } from './dashboard';
import { h } from './dom';

export interface WorkspaceOptions {
  kind: 'station' | 'job';
  kicker: string;
  title: string;
  backHref: string;
  backLabel: string;
  /** class of the element handed to the station/job: 'lw-side' or 'lw-panel' */
  sideClass: 'lw-side' | 'lw-panel';
  sideLabel: string;
  tabs?: HTMLElement;
  banner?: HTMLElement;
}

export interface Workspace {
  el: HTMLElement;
  heading: HTMLElement;
  viewwrap: HTMLElement;
  view: HTMLElement;
  coachEl: HTMLElement;
  overlay: HTMLElement;
  checksEl: HTMLElement;
  side: HTMLElement;
  dash: DashboardUI;
  setSheetOpen(open: boolean): void;
  /** call after content changes in side/checks; hides the column when it is empty */
  refreshSide(): void;
  dispose(): void;
}

export function createWorkspace(o: WorkspaceOptions): Workspace {
  const heading = h('h1', { class: 'lw-bar-title', tabindex: '-1' },
    h('span', { class: 'lw-bar-kicker' }, o.kicker), ' ', h('span', { class: 'lw-bar-name' }, o.title));
  const bar = h('header', { class: 'lw-bar' },
    h('a', { class: 'lw-back', href: o.backHref }, h('span', { 'aria-hidden': 'true' }, '←'), ' ', o.backLabel),
    heading,
    o.tabs ?? null);
  const dashEl = h('div');
  const dash = createDashboard(dashEl);
  const view = h('div', { class: 'lw-view' });
  const coachEl = h('div');
  const overlay = h('div', { class: 'lw-loading', hidden: true });
  const viewwrap = h('div', { class: 'lw-viewwrap' }, view, coachEl, overlay);
  const checksEl = h('div', { class: 'lw-checks', hidden: true });
  const side = h('div', { class: o.sideClass });
  const bodyId = `lw-sidebody-${Math.random().toString(36).slice(2, 7)}`;
  const body = h('div', { class: 'lw-sidebody', id: bodyId }, checksEl, side);
  let open = false;
  const handle = h('button', { class: 'lw-handle', type: 'button', 'aria-expanded': 'false', 'aria-controls': bodyId, onclick: () => setSheetOpen(!open) },
    h('span', { class: 'lw-grab', 'aria-hidden': 'true' }),
    h('span', { class: 'lw-handle-text' }, `Show ${o.sideLabel}`));
  const sidewrap = h('aside', { class: 'lw-sidewrap', 'aria-label': o.sideLabel }, handle, body);
  const main = h('div', { class: 'lw-main' }, viewwrap, sidewrap);
  const el = h('div', { class: `lw-ws lw-ws--${o.kind}` }, bar, dashEl, o.banner ?? null, main);

  function setSheetOpen(v: boolean): void {
    open = v;
    main.classList.toggle('lw-sheet-open', v);
    handle.setAttribute('aria-expanded', String(v));
    const t = handle.querySelector('.lw-handle-text');
    if (t) t.textContent = `${v ? 'Hide' : 'Show'} ${o.sideLabel}`;
  }

  function refreshSide(): void {
    const has = side.childElementCount > 0 || !checksEl.hidden;
    main.classList.toggle('lw-noside', !has);
  }

  const mo = new MutationObserver(refreshSide);
  mo.observe(side, { childList: true });
  refreshSide();

  return {
    el, heading, viewwrap, view, coachEl, overlay, checksEl, side, dash,
    setSheetOpen, refreshSide,
    dispose() { mo.disconnect(); },
  };
}

export function showLoading(ws: Workspace, text: string): void {
  ws.overlay.hidden = false;
  ws.overlay.className = 'lw-loading';
  ws.overlay.replaceChildren(h('div', { class: 'lw-spinner', 'aria-hidden': 'true' }), h('p', { role: 'status' }, text));
}

export function hideOverlay(ws: Workspace): void {
  ws.overlay.hidden = true;
  ws.overlay.replaceChildren();
}

export function showError(ws: Workspace, title: string, detail: string, backHref: string, retry?: () => void): void {
  ws.overlay.hidden = false;
  ws.overlay.className = 'lw-loading lw-loading--error';
  ws.overlay.replaceChildren(
    h('div', { class: 'lw-errorcard', role: 'alert' },
      h('h2', null, title),
      h('p', null, detail),
      h('div', { class: 'lw-row' },
        h('a', { class: 'lw-btn', href: backHref }, 'Back to home'),
        retry ? h('button', { class: 'lw-btn lw-btn--ghost', type: 'button', onclick: retry }, 'Try again') : null)));
}
