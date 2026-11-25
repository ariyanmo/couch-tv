import { describe, expect, it } from 'vitest';
import { fmtArea, fmtLen, parseLength, worst, lenToInput } from '../../src/core/units';

describe('parseLength', () => {
  it('metric forms', () => {
    expect(parseLength('3.45', 'metric')).toBeCloseTo(3450);
    expect(parseLength('3450', 'metric')).toBe(3450);
    expect(parseLength('345cm', 'metric')).toBe(3450);
    expect(parseLength('3,45 m', 'metric')).toBeCloseTo(3450);
    expect(parseLength('820 mm', 'imperial')).toBe(820);
  });
  it('imperial forms', () => {
    expect(parseLength(`12' 6"`, 'imperial')).toBeCloseTo(3810);
    expect(parseLength(`12'6`, 'imperial')).toBeCloseTo(3810);
    expect(parseLength('12 ft 6 in', 'imperial')).toBeCloseTo(3810);
    expect(parseLength('150"', 'imperial')).toBeCloseTo(3810);
    expect(parseLength('12-6', 'imperial')).toBeCloseTo(3810);
    expect(parseLength('12', 'imperial')).toBeCloseTo(3657.6);
    expect(parseLength('30 1/2"', 'imperial')).toBeCloseTo(774.7);
    expect(parseLength('abc', 'imperial')).toBeNull();
  });
});

describe('formatting', () => {
  it('lengths', () => {
    expect(fmtLen(3450, 'metric')).toBe('3.45 m');
    expect(fmtLen(820, 'metric')).toBe('820 mm');
    expect(fmtLen(3810, 'imperial')).toBe('12′ 6″');
    expect(fmtLen(null, 'metric')).toBe('—');
  });
  it('areas', () => {
    expect(fmtArea(12_000_000, 'metric')).toBe('12.0 m²');
    expect(fmtArea(92_903.04 * 150, 'imperial')).toBe('150 sq ft');
  });
  it('round-trips through input text', () => {
    expect(parseLength(lenToInput(3810, 'imperial'), 'imperial')).toBeCloseTo(3810);
    expect(parseLength(lenToInput(3456, 'metric'), 'metric')).toBeCloseTo(3456);
  });
  it('worst provenance wins', () => {
    expect(worst('measured', 'drawn')).toBe('drawn');
    expect(worst('measured', 'estimated', 'drawn')).toBe('estimated');
    expect(worst('measured', 'unknown')).toBe('unknown');
    expect(worst()).toBe('measured');
  });
});
