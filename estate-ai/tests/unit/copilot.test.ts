import { describe, expect, it } from 'vitest';
import { ask, buildDescription } from '../../src/core/copilot';
import { createProperty, createRoom, createSampleProperty } from '../../src/core/model';

describe('copilot (local)', () => {
  const p = createSampleProperty();
  it('room size uses the stored area', () => {
    const a = ask(p, 'How large is the living room?');
    expect(a.intent).toBe('room-size');
    expect(a.text).toContain('21.32 m²'); // 5.2 × 4.1
    expect(a.text).toContain('calculated from measurements');
  });
  it('total area says it is not fully measured', () => {
    const a = ask(p, 'What is the total measured floor area?');
    expect(a.intent).toBe('total-area');
    expect(a.text).toMatch(/Only \d+ of \d+ counted rooms are fully measured/);
    expect(a.text).toContain('Balcony');
  });
  it('king bed fit test', () => {
    const a = ask(p, 'Will a king-size bed fit in the main bedroom?');
    expect(a.intent).toBe('fit');
    expect(a.text).toContain('Main bedroom');
    expect(a.text).toMatch(/fits/);
  });
  it('flooring and paint', () => {
    expect(ask(p, 'How much flooring would I need for the kitchen?').text).toContain('12.30 m²');
    const paint = ask(p, 'How much wall surface needs painting?');
    expect(paint.intent).toBe('paint');
    expect(paint.text).toMatch(/L of paint/);
  });
  it('renovation opportunities are observations, labelled as such', () => {
    const a = ask(p, 'What renovation opportunities are visible?');
    expect(a.text).toContain('not a professional inspection');
    expect(a.text).toContain('walk-in shower');
  });
  it('description never invents a bedroom count', () => {
    const d = buildDescription(p);
    expect(d).toContain('2-bedroom');
    expect(d).toContain('approximately');
  });
  it('empty property: refuses to guess', () => {
    const e = createProperty('Empty');
    e.rooms.push(createRoom(e.floors[0].id, 'Living', 'living'));
    expect(ask(e, 'How large is the living room?').text).toMatch(/no recorded shape/);
    expect(ask(e, 'What renovation opportunities are there?').text).toMatch(/No inspection notes/);
    expect(ask(e, 'what is the weather').intent).toBe('help');
  });
});
