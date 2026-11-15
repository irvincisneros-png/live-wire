// The open Circuit lab: a free-build bench with every part. No guide, no checks.
import type { Ctx, PageHandle } from './context';
import { createWorkspace, hideOverlay, showError, showLoading } from './workspace';

export function mountLabPage(root: HTMLElement, ctx: Ctx): PageHandle {
  const ws = createWorkspace({ kind: 'station', kicker: 'Open bench', title: 'Circuit lab', backHref: '#home', backLabel: 'Home', sideClass: 'lw-side', sideLabel: 'diagram' });
  root.replaceChildren(ws.el);
  ws.heading.focus({ preventScroll: true });
  let inst: { dispose(): void } | null = null;
  let disposed = false;
  async function load(): Promise<void> {
    try {
      showLoading(ws, 'Setting up the bench…');
      const mod = await import('../lab/index');
      if (disposed) return;
      inst = mod.mount({ view: ws.view, side: ws.side, dashboard: ws.dash, quality: ctx.quality() });
      hideOverlay(ws);
    } catch (e) {
      console.error(e);
      if (disposed) return;
      ws.view.replaceChildren();
      showError(ws, 'The lab did not start', 'Something went wrong while loading it. You can go back and try again.', '#home', () => { inst = null; void load(); });
    }
  }
  void load();
  return {
    dispose() {
      disposed = true;
      try { inst?.dispose(); } catch (e) { console.error(e); }
      inst = null;
      ws.dispose();
      ws.dash.show(null);
      root.replaceChildren();
    },
  };
}
