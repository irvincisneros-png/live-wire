import type { Phase, StationDef, StationHost, StationInstance } from '../types';
import { CoachUI } from './coach';
import { mountChecks } from './checks';
import type { Ctx, PageHandle } from './context';
import { h } from './dom';
import { STATIONS } from '../stations/index';
import { createWorkspace, hideOverlay, showError, showLoading } from './workspace';

const PHASES: { id: Phase; label: string }[] = [
  { id: 'guided', label: 'Guided' },
  { id: 'free', label: 'Free play' },
  { id: 'checks', label: 'Checks' },
];

const FREE_PROMPT = 'Free play. Build, change and test anything you like. Move around with <b>W A S D</b> or the arrow keys, turn with <b>Q</b> and <b>E</b>, zoom with <b>R</b> and <b>F</b>. When you are ready, open <b>Checks</b> to earn your ticket.';

function phaseHash(id: string, p: Phase): string {
  return p === 'guided' ? `#${id}` : `#${id}/${p}`;
}

export function mountStationPage(root: HTMLElement, def: StationDef, phase0: Phase, ctx: Ctx): PageHandle {
  const tabs = h('div', { class: 'lw-tabs', role: 'tablist', 'aria-label': 'Station phase' });
  const tabEls = new Map<Phase, HTMLButtonElement>();
  for (const p of PHASES) {
    const b = h('button', { class: 'lw-tab', type: 'button', role: 'tab', 'aria-selected': 'false', onclick: () => setPhase(p.id, true) }, p.label);
    tabEls.set(p.id, b);
    tabs.append(b);
  }
  const ws = createWorkspace({
    kind: 'station', kicker: `Station ${def.num}`, title: def.title,
    backHref: '#home', backLabel: 'Home', sideClass: 'lw-side', sideLabel: 'panel', tabs,
  });
  root.replaceChildren(ws.el);
  ws.heading.focus({ preventScroll: true });
  const coach = new CoachUI(ws.coachEl);
  showLoading(ws, 'Loading station…');

  let instance: StationInstance | null = null;
  let phase: Phase | null = null;
  let token = 0;
  let disposed = false;
  let checks: { dispose(): void } | null = null;

  function setPhase(p: Phase, writeHash: boolean): void {
    if (disposed) return;
    if (writeHash) {
      try { history.replaceState(null, '', phaseHash(def.id, p)); } catch { /* ignore */ }
    }
    if (p === phase) return;
    phase = p;
    phase0 = p;
    const my = ++token;
    for (const [id, b] of tabEls) {
      b.setAttribute('aria-selected', String(id === p));
      b.classList.toggle('is-active', id === p);
      b.tabIndex = id === p ? 0 : -1;
    }
    coach.cancel();
    checks?.dispose();
    checks = null;
    ws.checksEl.hidden = true;
    ws.refreshSide();
    if (!instance) return;
    try { instance.onPhase?.(p); } catch (e) { console.error(e); }
    if (p === 'guided') {
      if (instance.steps.length === 0) { setPhase('free', true); return; }
      void coach.run(instance.steps).then(() => {
        if (token === my && !disposed) setPhase('free', true);
      });
    } else if (p === 'free') {
      coach.say(FREE_PROMPT);
    } else {
      ws.checksEl.hidden = false;
      const next = STATIONS.find((s) => s.num === def.num + 1);
      checks = mountChecks({
        el: ws.checksEl, stationId: def.id, stationNum: def.num, ticket: def.ticket, tasks: instance.tasks,
        progress: ctx.progress, next: next ? { id: next.id, title: next.title } : null, go: ctx.go,
      });
      ws.refreshSide();
      ws.setSheetOpen(true);
    }
  }

  async function load(): Promise<void> {
    try {
      showLoading(ws, 'Loading station…');
      const mod = await def.load();
      if (disposed) return;
      const host: StationHost = {
        view: ws.view, side: ws.side, coach, dashboard: ws.dash, progress: ctx.progress, quality: ctx.quality(),
      };
      const inst = await mod.mount(host);
      if (disposed) { try { inst.dispose(); } catch { /* ignore */ } return; }
      instance = inst;
      hideOverlay(ws);
      const p = phase0;
      phase = null;
      setPhase(p, false);
    } catch (e) {
      console.error(e);
      if (disposed) return;
      ws.view.replaceChildren();
      showError(ws, 'This station did not start', 'Something went wrong while loading it. Your progress is safe. You can go back and try again.', '#home', () => { instance = null; void load(); });
    }
  }
  void load();

  return {
    setPhase: (p) => setPhase(p, false),
    dispose() {
      disposed = true;
      token++;
      coach.dispose();
      checks?.dispose();
      checks = null;
      try { instance?.dispose(); } catch (e) { console.error(e); }
      instance = null;
      ws.dispose();
      ws.dash.show(null);
      root.replaceChildren();
    },
  };
}
