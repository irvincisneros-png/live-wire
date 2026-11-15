// Scroll pages: job board, job sheet, about. Home is in home.ts.
import { JOBS } from '../job/index';
import { stationForTicket } from '../stations/index';
import { APPRENTICE_FRAME, HUB_URL, MODEL_LIMITS, SAFETY_MESSAGE } from './content';
import type { Ctx, PageHandle } from './context';
import { h, starsEl, starsText } from './dom';

function topbar(back: { href: string; label: string }, ...right: (Node | null)[]): HTMLElement {
  return h('header', { class: 'lw-topbar no-print' },
    h('a', { class: 'lw-back', href: back.href }, h('span', { 'aria-hidden': 'true' }, '←'), ' ', back.label),
    h('nav', { class: 'lw-topnav', 'aria-label': 'Page links' }, right));
}

function page(root: HTMLElement, el: HTMLElement, titleEl: HTMLElement): PageHandle {
  root.replaceChildren(el);
  titleEl.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  return { dispose() { root.replaceChildren(); } };
}

export function safetyNote(): HTMLElement {
  return h('div', { class: 'lw-banner lw-banner--block', role: 'note' },
    h('span', { class: 'lw-banner-icon', 'aria-hidden': 'true' }, '⚠'),
    h('p', null, h('b', null, 'Safety first. '), SAFETY_MESSAGE));
}

// ───────────────────────────── job board ─────────────────────────────

export function renderBoard(root: HTMLElement, ctx: Ctx): PageHandle {
  const total = ctx.progress.totalStars(JOBS.map((j) => j.id));
  const title = h('h1', { tabindex: '-1' }, 'The Job: assessment day');
  const cards = JOBS.map((j) => {
    const rec = ctx.progress.jobRecord(j.id);
    return h('article', { class: 'lw-jobcard' },
      h('div', { class: 'lw-jobcard-top' },
        h('span', { class: 'lw-num' }, String(j.num)),
        h('div', null,
          h('h3', null, h('a', { href: `#job/${j.id}`, class: 'lw-cardlink' }, j.title)),
          h('p', null, j.brief))),
      h('div', { class: 'lw-jobcard-tickets' },
        h('span', { class: 'lw-label' }, 'Draws on'),
        j.tickets.map((t) => {
          const st = stationForTicket(t);
          const earned = ctx.progress.hasTicket(t);
          return h('a', { class: `lw-tchip${earned ? ' is-earned' : ''}`, href: st ? `#${st.id}` : '#home', title: st ? `Open Station ${st.num}: ${st.title}` : t },
            earned ? h('span', { 'aria-hidden': 'true' }, '✓ ') : null, t, earned ? h('span', { class: 'lw-sr' }, ' (earned)') : null);
        })),
      h('div', { class: 'lw-jobcard-foot' },
        h('div', { class: 'lw-best' },
          rec ? [starsEl(rec.best.result.stars), h('span', null, ` Best ${Math.round(rec.best.result.score)} / 100`)] : h('span', { class: 'lw-muted' }, 'Not attempted yet')),
        h('a', { class: 'lw-btn', href: `#job/${j.id}` }, rec ? 'Try again' : 'Start job')));
  });
  const el = h('div', { class: 'lw-page lw-page--board' },
    topbar({ href: '#home', label: 'Home' }, h('a', { href: '#jobsheet' }, 'Job sheet'), h('a', { href: '#about' }, 'About')),
    h('main', { class: 'lw-wrap' },
      h('header', { class: 'lw-pagehead lw-pagehead--split' },
        h('div', null,
          h('p', { class: 'lw-kicker' }, 'Illawarra Spark Electrical'),
          title,
          h('p', { class: 'lw-lead' }, APPRENTICE_FRAME)),
        h('div', { class: 'lw-totalbox' },
          h('span', { class: 'lw-stars', 'aria-hidden': 'true' }, '★'),
          h('div', null, h('span', null, `${total} / 15`), h('small', null, 'stars earned')))),
      safetyNote(),
      h('p', { class: 'lw-muted' }, 'All five jobs are open. Do them in any order. There are no hints on the job, so the tickets from Learn are your toolkit. Each job is scored out of 100 and gives up to three stars.'),
      h('div', { class: 'lw-jobgrid' }, cards),
      h('p', { class: 'lw-row' },
        h('a', { class: 'lw-btn lw-btn--ghost', href: '#jobsheet' }, 'Open my job sheet'))));
  return page(root, el, title);
}

// ───────────────────────────── job sheet ─────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return 'date not recorded';
  try {
    return d.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return d.toISOString();
  }
}

export function renderJobSheet(root: HTMLElement, ctx: Ctx): PageHandle {
  const title = h('h1', { tabindex: '-1' }, 'Job sheet');
  const nameInput = h('input', {
    class: 'lw-input lw-input--line', type: 'text', id: 'lw-name', maxlength: '80', autocomplete: 'off', placeholder: 'Type your name',
    value: ctx.progress.getName(),
    oninput: (e: Event) => ctx.progress.setName((e.target as HTMLInputElement).value),
  });
  const total = ctx.progress.totalStars(JOBS.map((j) => j.id));
  const sections = JOBS.map((j) => {
    const rec = ctx.progress.jobRecord(j.id);
    if (!rec) {
      return h('section', { class: 'lw-sheet-job' },
        h('h2', null, `Job ${j.num}: ${j.title}`),
        h('p', { class: 'lw-muted' }, 'Not attempted yet.'));
    }
    const b = rec.best;
    const differs = rec.latest.date !== b.date;
    return h('section', { class: 'lw-sheet-job' },
      h('h2', null, `Job ${j.num}: ${j.title}`),
      h('dl', { class: 'lw-meta' },
        h('div', null, h('dt', null, 'Stars'), h('dd', { 'aria-label': `${b.result.stars} of 3 stars` }, starsText(b.result.stars))),
        h('div', null, h('dt', null, 'Score'), h('dd', null, `${Math.round(b.result.score)} / 100`)),
        h('div', null, h('dt', null, 'Attempt'), h('dd', null, fmtDate(b.date))),
        h('div', null, h('dt', null, 'Seed'), h('dd', null, String(b.seed))),
        h('div', null, h('dt', null, 'App version'), h('dd', null, b.version || 'not recorded'))),
      differs ? h('p', { class: 'lw-small lw-muted' }, `Latest attempt: ${Math.round(rec.latest.result.score)} / 100 on ${fmtDate(rec.latest.date)}. The sheet shows the best attempt.`) : null,
      h('ul', { class: 'lw-answers' }, b.result.answers.map((a) =>
        h('li', null,
          h('span', { class: `lw-mark ${a.ok === true ? 'is-ok' : a.ok === false ? 'is-bad' : ''}`, 'aria-label': a.ok === true ? 'correct' : a.ok === false ? 'not correct' : 'not marked' }, a.ok === true ? '✓' : a.ok === false ? '✗' : '–'),
          h('span', null, h('b', null, a.q), h('br'), a.a)))),
      b.result.lines.length ? h('ul', { class: 'lw-result-lines lw-small' }, b.result.lines.map((l) => h('li', null, l))) : null);
  });
  const tickets = ['Charge', 'Circuits', 'Diagrams', 'Meters', 'Ohm', 'Power', 'Efficiency', 'Sources'];
  const clearBtn = h('button', {
    class: 'lw-btn lw-btn--danger no-print', type: 'button',
    onclick: () => {
      if (window.confirm('Clear all your results, tickets and job scores from this device? This cannot be undone.')) {
        ctx.progress.clearResults();
        renderJobSheet(root, ctx);
      }
    },
  }, 'Clear my results');
  const el = h('div', { class: 'lw-page lw-page--sheet' },
    topbar({ href: '#job', label: 'Job board' }, h('button', { class: 'lw-btn lw-btn--sm', type: 'button', onclick: () => window.print() }, 'Print')),
    h('main', { class: 'lw-wrap' },
      h('article', { class: 'lw-paper' },
        h('header', { class: 'lw-paper-head' },
          h('p', { class: 'lw-kicker' }, 'Live Wire · Year 9 Science · Energy'),
          title,
          h('p', { class: 'lw-small' }, `Illawarra Spark Electrical assessment day. App version ${ctx.version}. Printed ${fmtDate(new Date().toISOString())}.`)),
        h('div', { class: 'lw-namerow' }, h('label', { for: 'lw-name' }, 'Name'), nameInput),
        h('p', { class: 'lw-total' }, `Total ${total} / 15 stars`),
        h('p', { class: 'lw-small' }, h('b', null, 'Tickets earned: '), tickets.filter((t) => ctx.progress.hasTicket(t)).join(', ') || 'none yet'),
        h('p', { class: 'lw-evidence lw-small' }, 'This sheet is evidence for the teacher to review. It is not an automatic grade. Your name and results are stored only in this browser on this device. Nothing is sent anywhere.'),
        sections),
      h('div', { class: 'lw-row no-print' }, clearBtn, h('span', { class: 'lw-muted lw-small' }, ctx.progress.persistent ? 'Saved in this browser.' : 'Saving is switched off in this browser, so results last only until you close the tab.'))));
  return page(root, el, title);
}

// ───────────────────────────── about ─────────────────────────────

export function renderAbout(root: HTMLElement, ctx: Ctx): PageHandle {
  const title = h('h1', { tabindex: '-1' }, 'About Live Wire');
  const el = h('div', { class: 'lw-page lw-page--about' },
    topbar({ href: '#home', label: 'Home' }, h('a', { href: 'teacher.html' }, 'For teachers')),
    h('main', { class: 'lw-wrap lw-prose' },
      h('header', { class: 'lw-pagehead' }, h('p', { class: 'lw-kicker' }, 'Year 9 Science · Energy'), title),
      h('p', { class: 'lw-lead' }, 'Live Wire is a 3D electricity simulator in two parts. Learn has eight stations that each teach one idea. The Job is an assessment day where you play a first-year apprentice electrician.'),
      h('h2', null, 'One picture, used everywhere'),
      h('ul', null,
        h('li', null, h('span', { class: 'q-current' }, 'I'), ' current (amps): dots passing a counter gate each second.'),
        h('li', null, h('span', { class: 'q-voltage' }, 'V'), ' voltage (volts): always between two points. It is the difference in glow from one point to another.'),
        h('li', null, h('span', { class: 'q-resistance' }, 'R'), ' resistance (ohms): how hard a part makes it for dots to get through.'),
        h('li', null, h('span', { class: 'q-energy' }, 'E'), ' energy (joules): packets dropped at a component, a growing pile.'),
        h('li', null, h('span', { class: 'q-power' }, 'P'), ' power (watts): how fast the pile grows.')),
      h('p', null, 'Electrons (the dots) always move from the negative terminal to the positive terminal.'),
      h('h2', null, 'Limits of this model'),
      h('p', null, MODEL_LIMITS),
      safetyNote(),
      h('h2', null, 'Your data'),
      h('p', null, 'Live Wire makes no network calls. Tickets, check results, job scores and your name are stored only in this browser. Clear them any time from the job sheet.'),
      h('p', null, `Version ${ctx.version}. `, h('a', { href: HUB_URL }, 'Back to the Learning Hub'), '.')));
  return page(root, el, title);
}
