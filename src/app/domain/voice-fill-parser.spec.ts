import { describe, expect, it } from 'vitest';
import { hasVoiceFill, parseVoiceFill } from './voice-fill-parser';

describe('voice-fill-parser', () => {
  it('reads English liters and distance', () => {
    const v = parseVoiceFill('40 liters and 500 kilometers');
    expect(v.liters).toBe(40);
    expect(v.distanceKm).toBe(500);
    expect(hasVoiceFill(v)).toBe(true);
  });

  it('reads decimals, km, and a petrol grade', () => {
    const v = parseVoiceFill('put in 35.5 litres, drove 420 km, petrol 95');
    expect(v.liters).toBe(35.5);
    expect(v.distanceKm).toBe(420);
    expect(v.fuelGrade).toBe('gasoline95');
  });

  it('reads Arabic-Indic digits with Arabic units and grade', () => {
    const v = parseVoiceFill('٤٠ لتر و ٥٠٠ كيلومتر بنزين ٩٥');
    expect(v.liters).toBe(40);
    expect(v.distanceKm).toBe(500);
    expect(v.fuelGrade).toBe('gasoline95');
  });

  it('reads Arabic short km and diesel', () => {
    const v = parseVoiceFill('٣٥ لتر، ٤٢٠ كم، سولار');
    expect(v.liters).toBe(35);
    expect(v.distanceKm).toBe(420);
    expect(v.fuelGrade).toBe('diesel');
  });

  it('reads a grade-only utterance', () => {
    expect(parseVoiceFill('بنزين ٩٢').fuelGrade).toBe('gasoline92');
    expect(parseVoiceFill('diesel').fuelGrade).toBe('diesel');
    expect(parseVoiceFill('95 octane').fuelGrade).toBe('gasoline95');
  });

  it('accepts a decimal comma', () => {
    expect(parseVoiceFill('35,5 liters').liters).toBe(35.5);
  });

  it('reads the unit before the number too', () => {
    const v = parseVoiceFill('لتر ٤٠ وكيلومتر ٥٠٠');
    expect(v.liters).toBe(40);
    expect(v.distanceKm).toBe(500);
  });

  it('ignores numbers without a unit', () => {
    const v = parseVoiceFill('I drove 500 today');
    expect(v.distanceKm).toBeUndefined();
    expect(hasVoiceFill(v)).toBe(false);
  });

  it('drops implausible volumes and distances', () => {
    expect(parseVoiceFill('1000 liters').liters).toBeUndefined();
    expect(parseVoiceFill('0 liters').liters).toBeUndefined();
    expect(parseVoiceFill('999999 km').distanceKm).toBeUndefined();
  });

  it('returns empty for silence or unrelated speech', () => {
    expect(hasVoiceFill(parseVoiceFill(''))).toBe(false);
    expect(hasVoiceFill(parseVoiceFill('hello how are you'))).toBe(false);
  });
});