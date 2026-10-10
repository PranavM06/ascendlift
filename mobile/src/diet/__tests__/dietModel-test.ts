import type { FoodLogEntry } from '@/src/api/foodLog';
import type { Food } from '@/src/api/foods';
import {
  amountTextFor,
  describeAmount,
  describeDay,
  describeFood,
  describeMacros,
  formatCalories,
  formatGrams,
  groupEntriesByMeal,
  isDateKey,
  parseServings,
  scaleMacros,
  servingsTextFor,
  shiftDateKey,
  toDateKey,
  toServingsText,
} from '@/src/diet/dietModel';

const CHICKEN: Food = {
  id: 'chicken',
  name: 'Chicken breast, grilled',
  brand: null,
  servingSize: 100,
  servingUnit: 'g',
  calories: 165,
  proteinG: 31.02,
  carbsG: 0,
  fatG: 3.57,
};
const YOGURT: Food = {
  id: 'yogurt',
  name: 'Greek Yogurt',
  brand: 'Chobani',
  servingSize: 150,
  servingUnit: 'g',
  calories: 120,
  proteinG: 13.01,
  carbsG: 16.05,
  fatG: 0,
};
const TRAIL_MIX: Food = { ...YOGURT, id: 'trail-mix', servingSize: 28, calories: 140 };

function makeEntry(overrides: Partial<FoodLogEntry> = {}): FoodLogEntry {
  return {
    id: 'entry-1',
    food: CHICKEN,
    servings: 1,
    meal: 'lunch',
    entryDate: '2026-10-10',
    calories: 165,
    proteinG: 31.02,
    carbsG: 0,
    fatG: 3.57,
    ...overrides,
  };
}

describe('dates', () => {
  test('a moment becomes the calendar day it falls on locally', () => {
    expect(toDateKey(new Date(2026, 9, 10, 23, 59))).toBe('2026-10-10');
    expect(toDateKey(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05');
  });

  test('shifting a day crosses months and years', () => {
    expect(shiftDateKey('2026-10-10', -1)).toBe('2026-10-09');
    expect(shiftDateKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDateKey('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDateKey('2028-02-28', 1)).toBe('2028-02-29');
  });

  test('a day is named relative to today, or by its date', () => {
    expect(describeDay('2026-10-10', '2026-10-10', 'en-US')).toBe('Today');
    expect(describeDay('2026-10-09', '2026-10-10', 'en-US')).toBe('Yesterday');
    expect(describeDay('2026-10-08', '2026-10-10', 'en-US')).toBe('Thu, Oct 8');
  });

  test.each([
    ['2026-10-10', true],
    ['10/10/2026', false],
    ['2026-10-10T00:00:00', false],
    [undefined, false],
    [20261010, false],
  ])('isDateKey(%p) is %p', (value, expected) => {
    expect(isDateKey(value)).toBe(expected);
  });
});

describe('groupEntriesByMeal', () => {
  test('lists every meal in eating order with its entries and calories', () => {
    // Arrange
    const entries = [
      makeEntry({ id: 'a', meal: 'dinner', calories: 300 }),
      makeEntry({ id: 'b', meal: 'breakfast', calories: 120 }),
      makeEntry({ id: 'c', meal: 'dinner', calories: 82.5 }),
    ];

    // Act
    const groups = groupEntriesByMeal(entries);

    // Assert
    expect(groups.map((group) => group.meal)).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
    expect(groups.map((group) => group.entries.map((entry) => entry.id))).toEqual([
      ['b'],
      [],
      ['a', 'c'],
      [],
    ]);
    expect(groups.map((group) => group.calories)).toEqual([120, 0, 382.5, 0]);
  });
});

describe('describing food', () => {
  test('macros scale with the servings', () => {
    expect(scaleMacros(YOGURT, 2)).toEqual({
      calories: 240,
      proteinG: 26.02,
      carbsG: 32.1,
      fatG: 0,
    });
  });

  test('calories and grams are shown as whole numbers', () => {
    expect(formatCalories(1850.4, 'en-US')).toBe('1,850 kcal');
    expect(formatCalories(0, 'en-US')).toBe('0 kcal');
    expect(formatGrams(46.53)).toBe('47 g');
    expect(describeMacros({ calories: 165, proteinG: 31.02, carbsG: 0, fatG: 3.57 })).toBe(
      'P 31 g · C 0 g · F 4 g'
    );
  });

  test('an amount is the serving size times the servings', () => {
    expect(describeAmount(CHICKEN, 1.5)).toBe('150 g');
    expect(describeAmount(TRAIL_MIX, 1.43)).toBe('40 g');
    expect(describeAmount({ ...CHICKEN, servingSize: 355, servingUnit: 'ml' }, 0.5)).toBe(
      '177.5 ml'
    );
  });

  test('a food is summed up by its brand, serving and calories', () => {
    expect(describeFood(YOGURT, 'en-US')).toBe('Chobani · 150 g · 120 kcal');
    expect(describeFood(CHICKEN, 'en-US')).toBe('100 g · 165 kcal');
  });
});

describe('parseServings', () => {
  test.each([
    ['1', 1],
    ['1.5', 1.5],
    ['1,5', 1.5],
    [' 2 ', 2],
    ['0.333', 0.33],
    ['100', 100],
  ])('reads %p as %p servings', (text, servings) => {
    expect(parseServings(text)).toEqual({ ok: true, servings });
  });

  test.each(['', 'two', '-1', '1.5.2'])('asks for a number when given %p', (text) => {
    expect(parseServings(text)).toEqual({
      ok: false,
      message: 'Enter how many servings, such as 1.5.',
    });
  });

  test.each(['0', '0.001', '100.5'])('says the range when given %p', (text) => {
    expect(parseServings(text)).toEqual({ ok: false, message: 'Servings go from 0.01 to 100.' });
  });
});

describe('the linked servings and amount fields', () => {
  test('typing servings fills in the amount', () => {
    expect(amountTextFor(YOGURT, '2')).toBe('300');
    expect(amountTextFor(CHICKEN, '1,1')).toBe('110');
    expect(amountTextFor(YOGURT, '')).toBe('');
  });

  test('typing an amount fills in the servings to two decimal places', () => {
    expect(servingsTextFor(CHICKEN, '150')).toBe('1.5');
    expect(servingsTextFor(TRAIL_MIX, '40')).toBe('1.43');
    expect(servingsTextFor(CHICKEN, 'abc')).toBe('');
  });

  test('stored servings are shown without trailing zeros', () => {
    expect(toServingsText(1)).toBe('1');
    expect(toServingsText(1.5)).toBe('1.5');
  });
});
