// Station 0 pure logic: check validators, answers and the words card. No DOM, no three.
import { solveLens, type LensInput, type LensReadings } from '../../lens/model';

/** the "do" check: switch closed and the current within 0.01 A of 0.50 A */
export const HALF_AMP = 0.5;
export const HALF_AMP_TOL = 0.01;
export function halfAmpOk(r: Pick<LensReadings, 'I' | 'closed'>): boolean {
  return r.closed && Math.abs(r.I - HALF_AMP) <= HALF_AMP_TOL;
}

/** the "number" check: joules piled up in `seconds` at the power shown now (E = P × t) */
export const PILE_SECONDS = 10;
export function pileAnswer(r: Pick<LensReadings, 'P'>, seconds = PILE_SECONDS): number {
  return r.P * seconds;
}
/** the scene loaded for the number check */
export const NUMBER_SETUP: LensInput = { volts: 9, ohms: 18, closed: true };
export const NUMBER_SETUP_ANSWER = pileAnswer(solveLens(NUMBER_SETUP));

export const VOLTAGE_OPTIONS = [
  'How fast the dots move through it',
  'The drop in glow (energy carried by each dot) from point A to point B',
  'How many dots are inside it',
  'How many atoms are packed into it',
];
export const VOLTAGE_CORRECT = 1;

export const SWITCH_OPTIONS = [
  'They drain out of the wire',
  'They stop drifting around the loop but stay in the wire. They still jiggle on the spot.',
  'The resistor uses them up',
  'They all rush back into the battery',
];
export const SWITCH_CORRECT = 1;

/** guided step thresholds */
export const STEP_VOLTS = 9;
export const STEP_OHMS = 24;
export const STEP_JOULES = 10;

export interface Word { q: 'charge' | 'current' | 'voltage' | 'resistance' | 'energy' | 'power'; name: string; sym: string; unit: string; line: string }
export const WORDS: Word[] = [
  { q: 'charge', name: 'Charge', sym: '', unit: '', line: 'The dots. They already fill every wire. They are never made and never used up. Each dot stands for a huge amount of charge.' },
  { q: 'current', name: 'Current', sym: 'I', unit: 'amps (A)', line: 'How many dots pass the counter gate each second.' },
  { q: 'voltage', name: 'Voltage', sym: 'V', unit: 'volts (V)', line: 'Always between two points: the change in glow (energy carried by each dot) from one point to the other.' },
  { q: 'resistance', name: 'Resistance', sym: 'R', unit: 'ohms (Ω)', line: 'How hard it is for dots to get through: collisions with vibrating atoms. For the same material and temperature, a longer or thinner wire has more resistance. Different materials also have different resistance.' },
  { q: 'energy', name: 'Energy', sym: 'E', unit: 'joules (J)', line: 'The packets the resistor gives out as light and heat. They pile up.' },
  { q: 'power', name: 'Power', sym: 'P', unit: 'watts (W)', line: 'How fast the pile grows: joules each second.' },
];

export const LIMITS = [
  'Real charges drift very slowly, well under a millimetre each second. The dots here are sped up so you can see them.',
  'The energy really travels through the electric and magnetic fields around the wire. Dots carrying glow is a teaching model.',
  'The glow is an energy picture, not "the voltage of a dot". A voltage is always measured between two points.',
  'The push travels around the circuit extremely fast, but not instantly.',
  'Mains power is AC: the charges jiggle back and forth 50 times a second. Live Wire treats every circuit as a steady flow.',
];

export const ARROW_NOTE = [
  'Long before anyone knew about electrons, scientists agreed to draw current flowing from the + terminal to the − terminal. This is called conventional current.',
  'Later they found that in metal wires the moving charges are electrons, and they drift the other way: from − to +. Many diagrams still use the old arrow. Both describe the same circuit.',
  'In Live Wire the dots always show electrons, moving from − to +.',
];
