import type { StationHost, StationInstance } from '../../types';
import { placeholderStation } from '../../ui/placeholder';

// PLACEHOLDER: replaced by the real station.
export function mount(host: StationHost): StationInstance {
  return placeholderStation(host, "Sources", "Sources");
}
