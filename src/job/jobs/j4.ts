import type { JobHost, JobInstance } from '../../types';
import { placeholderJob } from '../../ui/placeholder';

// PLACEHOLDER: replaced by the real job.
export function mount(host: JobHost): JobInstance {
  return placeholderJob(host, "Energy audit");
}
