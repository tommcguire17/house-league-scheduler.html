import { describe, it, expect } from 'vitest';
import { weekdayOf, weekKey, bandOf, daysBetween } from '@league/core';

describe('calendar maths', () => {
  it('reads weekdays without timezone drift', () => {
    expect(weekdayOf('2026-12-05')).toBe('saturday');
    expect(weekdayOf('2026-12-06')).toBe('sunday');
    expect(weekdayOf('2027-03-21')).toBe('sunday');
  });

  it('groups a weekend together for a Monday-start league', () => {
    // Sat 12/05 and Sun 12/06 are the SAME week when weeks start Monday.
    expect(weekKey('2026-12-05', 'monday')).toBe(weekKey('2026-12-06', 'monday'));
  });

  it('splits that same weekend for a Sunday-start league', () => {
    // and DIFFERENT weeks when weeks start Sunday. This single difference is
    // why House and Adult need separate manifests.
    expect(weekKey('2026-12-05', 'sunday')).not.toBe(weekKey('2026-12-06', 'sunday'));
  });

  it('bands times at the boundaries', () => {
    const b = { morningBefore: '12:00', eveningFrom: '17:00' };
    expect(bandOf('11:59', b)).toBe('morning');
    expect(bandOf('12:00', b)).toBe('midday');
    expect(bandOf('16:59', b)).toBe('midday');
    expect(bandOf('17:00', b)).toBe('evening');
  });

  it('counts days across a month and a year boundary', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-12-05', '2027-03-21')).toBe(106);
  });
});
