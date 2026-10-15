import {
  caloriesFromMacros,
  describeMacroCalories,
  deviceTimezone,
  parseBodyweight,
  parseTargets,
  type TargetTexts,
} from '@/src/onboarding/onboardingModel';

const TEXTS: TargetTexts = { calories: '2400', proteinG: '180', carbsG: '250', fatG: '70' };

describe('parseTargets', () => {
  it('reads whole numbers', () => {
    // Act
    const parsed = parseTargets(TEXTS);

    // Assert
    expect(parsed).toEqual({
      ok: true,
      value: { calories: 2400, proteinG: 180, carbsG: 250, fatG: 70 },
    });
  });

  it('accepts thousands separators and spaces', () => {
    // Act
    const parsed = parseTargets({ ...TEXTS, calories: ' 2,400 ' });

    // Assert
    expect(parsed.ok && parsed.value.calories).toBe(2400);
  });

  it.each([
    ['empty', ''],
    ['too low', '499'],
    ['too high', '10001'],
    ['a decimal', '2400.5'],
    ['not a number', 'lots'],
  ])('rejects calories that are %s', (_case, calories) => {
    // Act
    const parsed = parseTargets({ ...TEXTS, calories });

    // Assert
    expect(parsed).toEqual({ ok: false, message: 'Enter daily calories from 500 to 10,000.' });
  });

  it('accepts zero grams of a macro', () => {
    // Act
    const parsed = parseTargets({ ...TEXTS, carbsG: '0' });

    // Assert
    expect(parsed.ok && parsed.value.carbsG).toBe(0);
  });

  it.each([
    ['proteinG', 'protein'],
    ['carbsG', 'carbs'],
    ['fatG', 'fat'],
  ] as const)('names the macro that is wrong: %s', (field, name) => {
    // Act
    const parsed = parseTargets({ ...TEXTS, [field]: '1001' });

    // Assert
    expect(parsed).toEqual({
      ok: false,
      message: `Enter ${name} in whole grams, up to 1,000.`,
    });
  });
});

describe('caloriesFromMacros', () => {
  it('counts 4 kcal per gram of protein and carbs and 9 per gram of fat', () => {
    // Act
    const calories = caloriesFromMacros({ proteinG: 180, carbsG: 250, fatG: 70 });

    // Assert
    expect(calories).toBe(180 * 4 + 250 * 4 + 70 * 9);
  });
});

describe('describeMacroCalories', () => {
  it('says what the macros add up to', () => {
    // Act
    const hint = describeMacroCalories(TEXTS, 'en-US');

    // Assert
    expect(hint).toBe('Your macros add up to 2,350 kcal.');
  });

  it('says nothing until every macro is filled in', () => {
    // Act
    const hint = describeMacroCalories({ ...TEXTS, fatG: '' }, 'en-US');

    // Assert
    expect(hint).toBeNull();
  });
});

describe('parseBodyweight', () => {
  it('converts pounds to kilograms', () => {
    // Act
    const parsed = parseBodyweight('182', 'lbs');

    // Assert
    expect(parsed).toEqual({ ok: true, value: 82.5538 });
  });

  it('keeps kilograms as typed, with a comma for the decimal point', () => {
    // Act
    const parsed = parseBodyweight('82,5', 'kg');

    // Assert
    expect(parsed).toEqual({ ok: true, value: 82.5 });
  });

  it('asks for a number in the chosen unit', () => {
    // Act
    const parsed = parseBodyweight('', 'lbs');

    // Assert
    expect(parsed).toEqual({ ok: false, message: 'Enter your weight in lb, such as 180.' });
  });

  it.each([
    ['lbs', '40', 'Enter a weight from 44.1 to 881.8 lb.'],
    ['lbs', '900', 'Enter a weight from 44.1 to 881.8 lb.'],
    ['kg', '19.9', 'Enter a weight from 20 to 400 kg.'],
  ] as const)('rejects a weight out of range in %s: %s', (unit, text, message) => {
    // Act
    const parsed = parseBodyweight(text, unit);

    // Assert
    expect(parsed).toEqual({ ok: false, message });
  });

  it('accepts the ends of the range it states', () => {
    // Act
    const results = [parseBodyweight('44.1', 'lbs'), parseBodyweight('881.8', 'lbs')];

    // Assert
    expect(results.every((parsed) => parsed.ok)).toBe(true);
  });
});

describe('deviceTimezone', () => {
  it('returns the device time zone', () => {
    // Act
    const timezone = deviceTimezone();

    // Assert
    expect(timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('falls back to UTC when the device does not say', () => {
    // Arrange
    const spy = jest
      .spyOn(Intl, 'DateTimeFormat')
      .mockImplementation(
        () => ({ resolvedOptions: () => ({ timeZone: undefined }) }) as unknown as Intl.DateTimeFormat
      );

    // Act
    const timezone = deviceTimezone();

    // Assert
    expect(timezone).toBe('UTC');
    spy.mockRestore();
  });
});
