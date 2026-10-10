import { authorizedRequest } from '@/src/api/authorized';
import {
  deleteFoodLogEntry,
  fetchDay,
  logFood,
  updateFoodLogEntry,
} from '@/src/api/foodLog';

jest.mock('@/src/api/authorized', () => ({ authorizedRequest: jest.fn() }));

const authorizedRequestMock = jest.mocked(authorizedRequest);

const CHICKEN_JSON = {
  id: 'food-1',
  name: 'Chicken breast, grilled',
  brand: null,
  serving_size: '100.00',
  serving_unit: 'g',
  calories: '165.00',
  protein_g: '31.02',
  carbs_g: '0.00',
  fat_g: '3.57',
};
const ENTRY_JSON = {
  id: 'entry-1',
  food: CHICKEN_JSON,
  servings: '1.50',
  meal: 'dinner',
  entry_date: '2026-10-10',
  calories: '247.50',
  protein_g: '46.53',
  carbs_g: '0.00',
  fat_g: '5.36',
};
const ENTRY = {
  id: 'entry-1',
  food: {
    id: 'food-1',
    name: 'Chicken breast, grilled',
    brand: null,
    servingSize: 100,
    servingUnit: 'g',
    calories: 165,
    proteinG: 31.02,
    carbsG: 0,
    fatG: 3.57,
  },
  servings: 1.5,
  meal: 'dinner',
  entryDate: '2026-10-10',
  calories: 247.5,
  proteinG: 46.53,
  carbsG: 0,
  fatG: 5.36,
};
const TOTALS_JSON = { calories: '247.50', protein_g: '46.53', carbs_g: '0.00', fat_g: '5.36' };
const DAY_JSON = { entry_date: '2026-10-10', totals: TOTALS_JSON, entries: [ENTRY_JSON] };
const JSON_HEADERS = { 'Content-Type': 'application/json' };

beforeEach(() => {
  jest.resetAllMocks();
});

test('reads a day with its totals and entries', async () => {
  // Arrange
  authorizedRequestMock.mockResolvedValueOnce(DAY_JSON);

  // Act
  const day = await fetchDay('2026-10-10');

  // Assert
  expect(day).toEqual({
    entryDate: '2026-10-10',
    totals: { calories: 247.5, proteinG: 46.53, carbsG: 0, fatG: 5.36 },
    entries: [ENTRY],
  });
  expect(authorizedRequestMock).toHaveBeenCalledWith('/food-log?entry_date=2026-10-10');
});

test('reads the zero totals of a day with nothing logged', async () => {
  // Arrange
  const zeros = { calories: '0', protein_g: '0', carbs_g: '0', fat_g: '0' };
  authorizedRequestMock.mockResolvedValueOnce({ ...DAY_JSON, totals: zeros, entries: [] });

  // Act
  const day = await fetchDay('2026-10-10');

  // Assert
  expect(day.totals).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  expect(day.entries).toEqual([]);
});

test('logs a food with a POST request', async () => {
  // Arrange
  authorizedRequestMock.mockResolvedValueOnce(ENTRY_JSON);

  // Act
  const logged = await logFood({
    foodId: 'food-1',
    servings: 1.5,
    meal: 'dinner',
    entryDate: '2026-10-10',
  });

  // Assert
  expect(logged).toEqual(ENTRY);
  expect(authorizedRequestMock).toHaveBeenCalledWith('/food-log', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      food_id: 'food-1',
      servings: 1.5,
      meal: 'dinner',
      entry_date: '2026-10-10',
    }),
  });
});

test('edits an entry with a PATCH request', async () => {
  // Arrange
  authorizedRequestMock.mockResolvedValueOnce({ ...ENTRY_JSON, servings: '2.00', meal: 'lunch' });

  // Act
  const edited = await updateFoodLogEntry('entry-1', { servings: 2, meal: 'lunch' });

  // Assert
  expect(edited).toMatchObject({ servings: 2, meal: 'lunch' });
  expect(authorizedRequestMock).toHaveBeenCalledWith('/food-log/entry-1', {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ servings: 2, meal: 'lunch' }),
  });
});

test('deletes an entry with a DELETE request', async () => {
  // Arrange
  authorizedRequestMock.mockResolvedValueOnce(null);

  // Act
  await deleteFoodLogEntry('entry-1');

  // Assert
  expect(authorizedRequestMock).toHaveBeenCalledWith('/food-log/entry-1', { method: 'DELETE' });
});

test.each([
  ['a day without totals', { ...DAY_JSON, totals: undefined }],
  ['a day whose entries are not a list', { ...DAY_JSON, entries: {} }],
  ['an entry with an unknown meal', { ...DAY_JSON, entries: [{ ...ENTRY_JSON, meal: 'brunch' }] }],
  ['an entry without a food', { ...DAY_JSON, entries: [{ ...ENTRY_JSON, food: null }] }],
])('rejects %s', async (_label, body) => {
  authorizedRequestMock.mockResolvedValueOnce(body);

  await expect(fetchDay('2026-10-10')).rejects.toThrow('The server sent an unexpected response.');
});
