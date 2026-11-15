import type { StationDef } from '../types';

export const STATIONS: StationDef[] = [
  {
    id: 's0', num: 0, title: 'What is electricity?', ticket: 'Charge', dotPoints: [],
    blurb: 'See charge, current, voltage and energy up close, and learn what the picture can and cannot show.',
    load: () => import('./s0/index'),
  },
  {
    id: 's1', num: 1, title: 'Complete circuits', ticket: 'Circuits', dotPoints: ['1.3.1'],
    blurb: 'Light a globe, find out why a circuit is dead, and meet a short circuit safely.',
    load: () => import('./s1/index'),
  },
  {
    id: 's2', num: 2, title: 'Build and draw', ticket: 'Diagrams', dotPoints: ['1.3.2'],
    blurb: 'Watch a diagram draw itself, then build from a diagram and draw what you build.',
    load: () => import('./s2/index'),
  },
  {
    id: 's3', num: 3, title: 'Series and parallel', ticket: 'Meters', dotPoints: ['1.3.3'],
    blurb: 'Measure current and voltage with meters and compare series with parallel.',
    load: () => import('./s3/index'),
  },
  {
    id: 's4', num: 4, title: 'Ohm\'s law', ticket: 'Ohm', dotPoints: ['1.3.4'],
    blurb: 'Change voltage and resistance, plot the graph and find a mystery resistor.',
    load: () => import('./s4/index'),
  },
  {
    id: 's5', num: 5, title: 'Power and energy', ticket: 'Power', dotPoints: ['1.3.5', '1.3.6'],
    blurb: 'Run appliances, compare joules and kilowatt-hours, and read an Energy Rating label.',
    load: () => import('./s5/index'),
  },
  {
    id: 's6', num: 6, title: 'Efficiency', ticket: 'Efficiency', dotPoints: ['1.1.1', '1.1.2', '1.1.3'],
    blurb: 'Compare three lamps, trace useful and wasted energy, and choose the best improvement.',
    load: () => import('./s6/index'),
  },
  {
    id: 's7', num: 7, title: 'Sources', ticket: 'Sources', dotPoints: ['1.2.1', '1.2.2', '1.2.3'],
    blurb: 'Follow the energy in coal, gas, hydro, wind and solar power, and find the one part most of them share.',
    load: () => import('./s7/index'),
  },
];

export function stationById(id: string): StationDef | undefined {
  return STATIONS.find((s) => s.id === id);
}

/** the station that awards a ticket (for ticket links on the job board) */
export function stationForTicket(ticket: string): StationDef | undefined {
  return STATIONS.find((s) => s.ticket === ticket);
}
