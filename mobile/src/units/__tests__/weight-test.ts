import { formatWeight, parseWeight, toDisplayWeight, toKg } from '@/src/units/weight';

describe('toKg', () => {
  test('converts pounds to kilograms at four decimal places', () => {
    expect(toKg(225, 'lbs')).toBe(102.0583);
    expect(toKg(45, 'lbs')).toBe(20.4117);
  });

  test('leaves kilograms unchanged', () => {
    expect(toKg(102.5, 'kg')).toBe(102.5);
  });
});

describe('toDisplayWeight', () => {
  test('shows a weight entered in pounds as the same number of pounds', () => {
    expect(toDisplayWeight(toKg(225, 'lbs'), 'lbs')).toBe(225);
    expect(toDisplayWeight(toKg(132.5, 'lbs'), 'lbs')).toBe(132.5);
  });

  test('rounds a converted weight to the nearest 2.5 lb', () => {
    // 100 kg is 220.46 lb.
    expect(toDisplayWeight(100, 'lbs')).toBe(220);
  });

  test('rounds a converted weight to the nearest 1.25 kg', () => {
    // 225 lb is 102.06 kg.
    expect(toDisplayWeight(102.0583, 'kg')).toBe(102.5);
    expect(toDisplayWeight(101.25, 'kg')).toBe(101.25);
  });
});

describe('formatWeight', () => {
  test('adds the unit and drops needless decimals', () => {
    expect(formatWeight(102.0583, 'lbs')).toBe('225 lb');
    expect(formatWeight(101.25, 'kg')).toBe('101.25 kg');
    expect(formatWeight(0, 'lbs')).toBe('0 lb');
  });
});

describe('parseWeight', () => {
  test.each([
    ['225', 225],
    [' 102.5 ', 102.5],
    ['102,5', 102.5],
    ['0', 0],
  ])('reads %p as %p', (text, expected) => {
    expect(parseWeight(text)).toBe(expected);
  });

  test.each(['', '   ', 'abc', '-5', '1e3', '12.5.1', '.5'])('rejects %p', (text) => {
    expect(parseWeight(text)).toBeNull();
  });
});
