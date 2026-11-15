import { JOBS } from '../job/index';
import { STATIONS } from '../stations/index';
import { HUB_URL } from './content';
import type { Ctx, PageHandle } from './context';
import { h, s, starsEl } from './dom';
import type { QualityPref } from './quality';

/** Decorative circuit-trace background: dots flow along the traces from − to +. SVG + CSS only. */
function background(): SVGSVGElement {
  // each trace is drawn from its − end (start) to its + end (finish); the dots flow start → finish
  const traces = [
    'M80 120 H260 V230 H520 V150 H760 V300 H1020 V210 H1120',
    'M80 420 H180 V340 H420 V470 H700 V400 H900 V560 H1120',
    'M80 700 H340 V610 H640 V720 H940 V640 H1120',
  ];
  const svg = s('svg', { class: 'lw-bg-svg', viewBox: '0 0 1200 800', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true', focusable: 'false' });
  const starts: [number, number][] = [[80, 120], [80, 420], [80, 700]];
  const ends: [number, number][] = [[1120, 210], [1120, 560], [1120, 640]];
  traces.forEach((d, i) => {
    svg.append(
      s('path', { d, class: 'lw-trace' }),
      s('path', { d, class: 'lw-trace-dots', style: `animation-delay:${-i * 2.2}s` }),
      s('text', { x: starts[i][0] - 16, y: starts[i][1] + 5, class: 'lw-pole lw-pole--neg' }, '−'),
      s('text', { x: ends[i][0] + 4, y: ends[i][1] + 5, class: 'lw-pole lw-pole--pos' }, '+'));
  });
  return svg;
}

function logo(): SVGSVGElement {
  return s('svg', { class: 'lw-logo', viewBox: '0 0 64 64', 'aria-hidden': 'true', focusable: 'false' },
    s('circle', { cx: 32, cy: 32, r: 29, fill: 'none', stroke: 'currentColor', 'stroke-width': 3 }),
    s('path', { d: 'M35 8 L17 36 H29 L26 56 L47 26 H34 Z', fill: 'currentColor' }));
}

export function renderHome(root: HTMLElement, ctx: Ctx): PageHandle {
  const total = ctx.progress.totalStars(JOBS.map((j) => j.id));
  const resolved = ctx.quality();
  const select = h('select', {
    class: 'lw-select', id: 'lw-quality', 'aria-label': 'Graphics quality',
    onchange: (e: Event) => ctx.setQuality((e.target as HTMLSelectElement).value as QualityPref),
  },
    h('option', { value: 'auto' }, `Auto (${resolved})`),
    h('option', { value: 'low' }, 'Low'),
    h('option', { value: 'medium' }, 'Medium'),
    h('option', { value: 'high' }, 'High'));
  select.value = ctx.qualityPref();

  const earned = STATIONS.filter((st) => ctx.progress.hasTicket(st.ticket)).length;
  const title = h('h1', { class: 'lw-hero-title', tabindex: '-1' }, 'Live Wire');

  const stationCards = STATIONS.map((st) => {
    const got = ctx.progress.hasTicket(st.ticket);
    return h('a', { class: `lw-card lw-scard${got ? ' is-earned' : ''}`, href: `#${st.id}`, 'aria-label': `Station ${st.num}: ${st.title}. Ticket: ${st.ticket}${got ? ', earned' : ''}` },
      h('span', { class: 'lw-num', 'aria-hidden': 'true' }, String(st.num)),
      h('h3', null, st.title),
      h('p', null, st.blurb),
      h('div', { class: 'lw-scard-foot' },
        h('span', { class: `lw-ticketbadge${got ? ' is-earned' : ''}` }, got ? h('span', { 'aria-hidden': 'true' }, '✓ ') : h('span', { 'aria-hidden': 'true' }, '◇ '), `Ticket: ${st.ticket}`),
        st.dotPoints.length ? h('span', { class: 'lw-dp' }, st.dotPoints.join(' · ')) : null));
  });

  const jobChips = JOBS.map((j) =>
    h('a', { class: 'lw-jobchip', href: `#job/${j.id}`, title: j.title },
      h('span', { class: 'lw-jobchip-n' }, `Job ${j.num}`),
      starsEl(ctx.progress.jobStars(j.id))));

  const el = h('div', { class: 'lw-page lw-home' },
    h('div', { class: 'lw-bg', 'aria-hidden': 'true' }, background()),
    h('header', { class: 'lw-topbar' },
      h('a', { class: 'lw-back', href: HUB_URL }, h('span', { 'aria-hidden': 'true' }, '←'), ' Learning Hub'),
      h('nav', { class: 'lw-topnav', 'aria-label': 'Site' },
        h('a', { href: '#about', class: 'lw-hide-narrow' }, 'About'),
        h('a', { href: 'teacher.html', class: 'lw-hide-narrow' }, 'For teachers'),
        h('label', { class: 'lw-qlabel', for: 'lw-quality' }, h('span', null, 'Graphics'), select))),
    h('main', { class: 'lw-wrap' },
      h('section', { class: 'lw-hero' },
        logo(),
        title,
        h('p', { class: 'lw-pitch' }, 'See electricity happen in 3D. Build circuits, measure them, then prove it on assessment day.'),
        h('div', { class: 'lw-row lw-row--center' },
          h('a', { class: 'lw-btn lw-btn--lg', href: '#s0' }, 'Start learning'),
          h('a', { class: 'lw-btn lw-btn--lg lw-btn--ghost', href: '#lab' }, 'Circuit lab'),
          h('a', { class: 'lw-btn lw-btn--lg lw-btn--ghost', href: '#job' }, 'Go to The Job'))),
      h('section', { class: 'lw-section', 'aria-labelledby': 'lw-learn' },
        h('div', { class: 'lw-sechead' },
          h('div', null,
            h('p', { class: 'lw-kicker' }, 'Part 1'),
            h('h2', { id: 'lw-learn' }, 'Learn: trade school')),
          h('p', { class: 'lw-muted' }, `${earned} of ${STATIONS.length} tickets earned. Each station has a guided tour, free play and short checks.`)),
        h('div', { class: 'lw-cards' }, stationCards)),
      h('section', { class: 'lw-section', 'aria-labelledby': 'lw-lab' },
        h('a', { class: 'lw-labcard', href: '#lab' },
          h('div', null,
            h('p', { class: 'lw-kicker' }, 'Open bench'),
            h('h2', { id: 'lw-lab' }, 'Circuit lab'),
            h('p', null, 'Build any circuit you like with every part: batteries, globes, switches, resistors and meters. Watch the electrons move on the board and on the circuit diagram.')),
          h('span', { class: 'lw-btn lw-btn--lg' }, 'Open the lab'))),
      h('section', { class: 'lw-section', 'aria-labelledby': 'lw-job' },
        h('div', { class: 'lw-sechead' },
          h('div', null,
            h('p', { class: 'lw-kicker' }, 'Part 2'),
            h('h2', { id: 'lw-job' }, 'The Job: assessment day'))),
        h('div', { class: 'lw-jobhero' },
          h('div', { class: 'lw-jobhero-text' },
            h('h3', null, 'Illawarra Spark Electrical'),
            h('p', null, 'Five jobs on the trade school\'s 12 V training house: a fault call-out, a new power point, a tripping power board, an energy audit and a solar plan. Open from the start. Learn first for your best chance, or jump straight in.'),
            h('div', { class: 'lw-row' },
              h('a', { class: 'lw-btn lw-btn--lg', href: '#job' }, 'Open the job board'),
              h('a', { class: 'lw-link', href: '#jobsheet' }, 'My job sheet'))),
          h('div', { class: 'lw-jobhero-score' },
            h('div', { class: 'lw-bigstars' }, h('span', { class: 'lw-stars lw-stars--big', 'aria-hidden': 'true' }, '★'), h('b', null, String(total)), h('span', null, ' / 15')),
            h('p', { class: 'lw-muted' }, 'stars earned'),
            h('div', { class: 'lw-jobchips' }, jobChips))))),
    h('footer', { class: 'lw-footer' },
      h('span', null, `Live Wire v${ctx.version}`),
      h('span', null, h('a', { href: '#about' }, 'About'), ' · ', h('a', { href: 'teacher.html' }, 'For teachers')),
      h('span', null, 'No accounts, no tracking. Your progress stays in this browser.'),
      h('span', null, 'Year 9 Science · NSW Energy')));
  root.replaceChildren(el);
  title.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  return { dispose() { root.replaceChildren(); } };
}
