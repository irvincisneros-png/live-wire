import type { JobDef, JobHost, JobInstance, JobResult } from '../types';
import { SAFETY_MESSAGE } from './content';
import type { Ctx, PageHandle } from './context';
import { h, starsEl } from './dom';
import { createWorkspace, hideOverlay, showError, showLoading } from './workspace';

export function newSeed(): number {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % 2147483647;
  } catch {
    return Math.floor(Math.random() * 2147483647);
  }
}

export function mountJobPage(root: HTMLElement, def: JobDef, ctx: Ctx): PageHandle {
  const banner = def.id === 'j2'
    ? h('div', { class: 'lw-banner', role: 'note' },
      h('span', { class: 'lw-banner-icon', 'aria-hidden': 'true' }, '⚠'),
      h('span', { class: 'lw-banner-text' }, h('b', null, 'Safety. '), SAFETY_MESSAGE),
      h('button', { class: 'lw-coach-x', type: 'button', 'aria-label': 'Hide safety note', onclick: (e: Event) => ((e.currentTarget as HTMLElement).parentElement as HTMLElement).remove() }, '×'))
    : undefined;
  const ws = createWorkspace({
    kind: 'job', kicker: `Job ${def.num}`, title: def.title,
    backHref: '#job', backLabel: 'Jobs', sideClass: 'lw-panel', sideLabel: 'job panel', banner,
  });
  root.replaceChildren(ws.el);
  ws.heading.focus({ preventScroll: true });

  let instance: JobInstance | null = null;
  let disposed = false;
  let attempt = 0;
  let modal: HTMLElement | null = null;

  function closeModal(): void {
    modal?.remove();
    modal = null;
  }

  function teardown(): void {
    try { instance?.dispose(); } catch (e) { console.error(e); }
    instance = null;
    ws.view.replaceChildren();
    ws.side.replaceChildren();
    ws.dash.show(null);
  }

  function showResult(result: JobResult, seed: number, newBest: boolean): void {
    closeModal();
    const again = h('button', { class: 'lw-btn', type: 'button', onclick: () => { void start(); } }, 'Try again');
    const card = h('div', { class: 'lw-resultcard', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'lw-result-h', tabindex: '-1' },
      h('p', { class: 'lw-kicker' }, `Job ${def.num} result`),
      h('h2', { id: 'lw-result-h' }, def.title),
      h('div', { class: 'lw-result-stars' }, starsEl(result.stars, 'lw-stars--big')),
      h('p', { class: 'lw-result-score' }, h('b', null, String(Math.round(result.score))), ' / 100'),
      newBest ? h('p', { class: 'lw-chip-note' }, 'New best for this job') : null,
      h('ul', { class: 'lw-result-lines' }, result.lines.map((l) => h('li', null, l))),
      h('p', { class: 'lw-muted lw-small' }, `Attempt seed ${seed}. Saved on this device and on your job sheet.`),
      h('div', { class: 'lw-row' },
        again,
        h('a', { class: 'lw-btn lw-btn--ghost', href: '#job' }, 'Back to jobs'),
        h('a', { class: 'lw-link', href: '#jobsheet' }, 'See job sheet')));
    modal = h('div', { class: 'lw-modal' }, card);
    ws.el.append(modal);
    card.focus();
  }

  async function start(): Promise<void> {
    closeModal();
    teardown();
    const my = ++attempt;
    const seed = newSeed();
    let finished = false;
    showLoading(ws, 'Loading job…');
    try {
      const mod = await def.load();
      if (disposed || my !== attempt) return;
      const host: JobHost = {
        view: ws.view, panel: ws.side, dashboard: ws.dash, quality: ctx.quality(), seed,
        finish(result) {
          if (finished || disposed || my !== attempt) return;
          finished = true;
          const { newBest } = ctx.progress.recordJob(def.id, result, seed, ctx.version);
          showResult(result, seed, newBest);
        },
      };
      const inst = await mod.mount(host);
      if (disposed || my !== attempt) { try { inst.dispose(); } catch { /* ignore */ } return; }
      instance = inst;
      hideOverlay(ws);
      // jobs are worked from the panel, so on phones start with the sheet open
      try { if (matchMedia('(max-width: 899px)').matches) ws.setSheetOpen(true); } catch { /* ignore */ }
    } catch (e) {
      console.error(e);
      if (disposed) return;
      ws.view.replaceChildren();
      showError(ws, 'This job did not start', 'Something went wrong while loading it. Your progress is safe. You can go back and try again.', '#home', () => { void start(); });
    }
  }
  void start();

  return {
    dispose() {
      disposed = true;
      attempt++;
      closeModal();
      teardown();
      ws.dispose();
      root.replaceChildren();
    },
  };
}
