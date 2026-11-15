import type { JobDef } from '../types';

export const JOBS: JobDef[] = [
  {
    id: 'j1', num: 1, title: 'Fault call-out',
    brief: 'The training house\'s lighting circuit has stopped working. Measure, find the fault and fix it.',
    tickets: ['Circuits', 'Meters'], dotPoints: ['1.3.3'],
    load: () => import('./jobs/j1'),
  },
  {
    id: 'j2', num: 2, title: 'Install a new power point',
    brief: 'Add a second outlet to the training house wall safely, then check that the supply can cope.',
    tickets: ['Diagrams', 'Meters', 'Ohm'], dotPoints: ['1.3.2', '1.3.4'],
    load: () => import('./jobs/j2'),
  },
  {
    id: 'j3', num: 3, title: 'The tripping power board',
    brief: 'A power board keeps tripping. Work out why, then plan two circuits that hold.',
    tickets: ['Ohm', 'Power'], dotPoints: ['1.3.4', '1.3.5'],
    load: () => import('./jobs/j3'),
  },
  {
    id: 'j4', num: 4, title: 'Energy audit',
    brief: 'Find the biggest energy users in a household and cut the yearly bill within a budget.',
    tickets: ['Power', 'Efficiency'], dotPoints: ['1.1.2', '1.1.3', '1.3.6', '1.4.1'],
    load: () => import('./jobs/j4'),
  },
  {
    id: 'j5', num: 5, title: 'Solar and battery',
    brief: 'Size the solar panels and battery so the house runs through the evening on little grid power.',
    tickets: ['Efficiency', 'Sources'], dotPoints: ['1.1.1', '1.2.2', '1.2.3'],
    load: () => import('./jobs/j5'),
  },
];

export function jobById(id: string): JobDef | undefined {
  return JOBS.find((j) => j.id === id);
}
