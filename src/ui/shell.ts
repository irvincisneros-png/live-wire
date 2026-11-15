// Hash router + page lifecycle. Always disposes the current page before leaving it.
import { mountLabPage } from './labPage';
import { jobById } from '../job/index';
import { stationById } from '../stations/index';
import { Q } from '../types';
import type { QualityTier } from '../types';
import type { Ctx, PageHandle } from './context';
import { h } from './dom';
import { renderHome } from './home';
import { mountJobPage } from './jobPage';
import { renderAbout, renderBoard, renderJobSheet } from './pages';
import { browserStorage, ProgressStore } from './progress';
import { resolveQuality } from './quality';
import type { QualityPref } from './quality';
import { parseRoute, routeKey } from './route';
import type { Route } from './route';
import { mountStationPage } from './stationPage';
import { APP_VERSION } from './version';

export interface LiveWireDebug {
  go(route: string): void;
  progress: ProgressStore;
  setQuality(tier: QualityPref): void;
  version: string;
  [k: string]: unknown;
}

declare global {
  interface Window { __livewire?: LiveWireDebug }
}

function errorCard(root: HTMLElement, title: string, detail: string): PageHandle {
  root.replaceChildren(
    h('div', { class: 'lw-page lw-page--center' },
      h('div', { class: 'lw-errorcard', role: 'alert' },
        h('h1', null, title),
        h('p', null, detail),
        h('a', { class: 'lw-btn', href: '#home' }, 'Back to home'))));
  return { dispose() { root.replaceChildren(); } };
}

export function startShell(root: HTMLElement): void {
  // single source for the quantity colours
  for (const [k, v] of Object.entries(Q)) document.documentElement.style.setProperty(`--q-${k}`, v.colour);

  const progress = new ProgressStore(browserStorage());
  let qualityNow: QualityTier = resolveQuality(progress.getQuality());
  const ctx: Ctx = {
    progress,
    version: APP_VERSION,
    go: (r) => { location.hash = r.startsWith('#') ? r : `#${r}`; },
    quality: () => qualityNow,
    qualityPref: () => progress.getQuality(),
    setQuality(pref) {
      progress.setQuality(pref);
      qualityNow = resolveQuality(pref);
    },
  };

  let current: PageHandle | null = null;
  let currentRoute: Route | null = null;

  function render(): void {
    const route = parseRoute(location.hash);
    // same station, different phase: switch phase, do not remount
    if (current && currentRoute && route.name === 'station' && currentRoute.name === 'station' && routeKey(route) === routeKey(currentRoute)) {
      currentRoute = route;
      current.setPhase?.(route.phase);
      return;
    }
    try { current?.dispose(); } catch (e) { console.error(e); }
    current = null;
    currentRoute = route;
    root.replaceChildren();
    root.dataset.route = route.name;
    document.body.classList.toggle('lw-fixed', route.name === 'station' || route.name === 'job' || route.name === 'lab');
    try {
      switch (route.name) {
        case 'home': current = renderHome(root, ctx); document.title = 'Live Wire: Year 9 electricity simulator'; break;
        case 'board': current = renderBoard(root, ctx); document.title = 'The Job | Live Wire'; break;
        case 'jobsheet': current = renderJobSheet(root, ctx); document.title = 'Job sheet | Live Wire'; break;
        case 'about': current = renderAbout(root, ctx); document.title = 'About | Live Wire'; break;
        case 'lab': current = mountLabPage(root, ctx); document.title = 'Circuit lab | Live Wire'; break;
        case 'station': {
          const def = stationById(route.id);
          if (!def) { current = errorCard(root, 'Station not found', 'That station does not exist.'); break; }
          current = mountStationPage(root, def, route.phase, ctx);
          document.title = `Station ${def.num}: ${def.title} | Live Wire`;
          break;
        }
        case 'job': {
          const def = jobById(route.id);
          if (!def) { current = errorCard(root, 'Job not found', 'That job does not exist.'); break; }
          current = mountJobPage(root, def, ctx);
          document.title = `Job ${def.num}: ${def.title} | Live Wire`;
          break;
        }
      }
    } catch (e) {
      console.error(e);
      current = errorCard(root, 'Something went wrong', 'This page could not open. Your progress is safe.');
    }
  }

  window.addEventListener('hashchange', render);
  window.__livewire = {
    go: ctx.go,
    progress,
    setQuality: (t) => ctx.setQuality(t),
    version: APP_VERSION,
  };
  render();
}
