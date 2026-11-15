// Hash routing. Pure, no DOM.
import type { Phase } from '../types';

export type Route =
  | { name: 'home' }
  | { name: 'station'; id: string; phase: Phase }
  | { name: 'board' }
  | { name: 'job'; id: string }
  | { name: 'jobsheet' }
  | { name: 'about' }
  | { name: 'lab' };

export const STATION_IDS = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7'];
export const JOB_IDS = ['j1', 'j2', 'j3', 'j4', 'j5'];

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const head = parts[0] ?? 'home';
  if (STATION_IDS.includes(head)) {
    const p = parts[1];
    return { name: 'station', id: head, phase: p === 'free' ? 'free' : p === 'checks' ? 'checks' : 'guided' };
  }
  if (head === 'job') return parts[1] && JOB_IDS.includes(parts[1]) ? { name: 'job', id: parts[1] } : { name: 'board' };
  if (head === 'jobsheet') return { name: 'jobsheet' };
  if (head === 'about') return { name: 'about' };
  if (head === 'lab') return { name: 'lab' };
  return { name: 'home' };
}

export function routeHash(r: Route): string {
  switch (r.name) {
    case 'home': return '#home';
    case 'station': return r.phase === 'guided' ? `#${r.id}` : `#${r.id}/${r.phase}`;
    case 'board': return '#job';
    case 'job': return `#job/${r.id}`;
    case 'jobsheet': return '#jobsheet';
    case 'about': return '#about';
    case 'lab': return '#lab';
  }
}

/** Two routes with the same key mount the same thing (a phase change is not a remount). */
export function routeKey(r: Route): string {
  return r.name === 'station' ? `station:${r.id}` : r.name === 'job' ? `job:${r.id}` : r.name;
}
