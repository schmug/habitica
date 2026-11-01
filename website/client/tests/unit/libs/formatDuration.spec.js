import { describe, expect, it } from 'vitest';
import formatDuration from '@/libs/formatDuration';

const $t = (key, vars) => ({
  minutesShort: `${vars.minutes}m`,
  hoursShort: `${vars.hours}h`,
  hoursMinutesShort: `${vars.hours}h ${vars.minutes}m`,
})[key];

describe('formatDuration', () => {
  it('formats minutes, hours and both', () => {
    expect(formatDuration(25, $t)).toBe('25m');
    expect(formatDuration(120, $t)).toBe('2h');
    expect(formatDuration(90, $t)).toBe('1h 30m');
  });

  it('returns an empty string for missing or invalid values', () => {
    expect(formatDuration(undefined, $t)).toBe('');
    expect(formatDuration(0, $t)).toBe('');
    expect(formatDuration('abc', $t)).toBe('');
  });
});
