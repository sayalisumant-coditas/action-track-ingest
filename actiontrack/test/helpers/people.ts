import { buildDirectory } from '../../src/core/people/directory.js';
import { meeting } from './factory.js';

/** A directory with both Priyas and both Rahuls, like the sample folder. */
export const sampleDirectory = () =>
  buildDirectory([
    meeting({
      attendees: [
        'Priya Nair',
        'Priya Shah',
        'Rahul Mehta',
        'Rahul Verma',
        'Karan Joshi',
        'Sam Okafor',
      ],
    }),
  ]);
