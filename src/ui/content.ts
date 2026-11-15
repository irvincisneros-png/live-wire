// Shared text. Australian English, short sentences, no em dashes in student-facing copy.
export const HUB_URL = 'https://irvincisneros-png.github.io/';

export const SAFETY_MESSAGE =
  'Real house wiring is 230 V and can kill. In Australia it must only be done by a licensed electrician. That is why apprentices train on a 12 V board first.';

export const MODEL_LIMITS =
  'Real charges drift along a wire at well under a millimetre per second. The energy actually travels through the electric and magnetic fields around the wire. Dots carrying packets of energy is a teaching model. Mains power is AC, where charges jiggle back and forth 50 times a second. Live Wire treats it as steady flow.';

export const APPRENTICE_FRAME =
  'You are a first-year apprentice at Illawarra Spark Electrical (a made-up company). It is assessment day at the trade school. Your jobs are on the school\'s 12 V training house, a cutaway house frame where every wire runs on a safe low voltage.';

export interface DotPoint {
  code: string;
  text: string;
}

/** NSW Science 7-10 (2023), Stage 5 Energy, the dot points Live Wire covers. */
export const DOT_POINTS: DotPoint[] = [
  { code: '1.1.1', text: 'Conservation of energy, with calculations, in a closed system' },
  { code: '1.1.2', text: 'Explain energy efficiency' },
  { code: '1.1.3', text: 'Ways to improve efficiency' },
  { code: '1.2.1', text: 'Identify types of energy sources' },
  { code: '1.2.2', text: 'How electrical energy is produced from different sources' },
  { code: '1.2.3', text: 'Evaluate renewable and non-renewable sources (efficiency, economic, technological)' },
  { code: '1.3.1', text: 'Elements of a complete circuit' },
  { code: '1.3.2', text: 'Construct circuits and draw circuit diagrams' },
  { code: '1.3.3', text: 'Measure and compare voltage and current in series and parallel circuits' },
  { code: '1.3.4', text: 'Investigate voltage, current and resistance (Ohm\'s law)' },
  { code: '1.3.5', text: 'Compare energy transformed over time in circuits and appliances' },
  { code: '1.3.6', text: 'Energy star ratings and their criteria' },
  { code: '1.4.1', text: 'Evaluate ways to optimise current energy use' },
];

export const NOT_COVERED: DotPoint[] = [
  { code: '1.4.2', text: 'Trends in energy use' },
  { code: '1.4.3', text: 'Alternative energy sources' },
  { code: '1.6.1', text: 'Research' },
];
