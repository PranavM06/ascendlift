import { authorizedRequest } from '@/src/api/authorized';
import { fetchRecentFoods, searchFoods } from '@/src/api/foods';

jest.mock('@/src/api/authorized', () => ({ authorizedRequest: jest.fn() }));

const authorizedRequestMock = jest.mocked(authorizedRequest);

const YOGURT_JSON = {
  id: 'food-1',
  name: 'Greek Yogurt',
  brand: 'Chobani',
  serving_size: '150.00',
  serving_unit: 'g',
  calories: '120.00',
  protein_g: '13.01',
  carbs_g: '16.05',
  fat_g: '0.00',
};
const YOGURT = {
  id: 'food-1',
  name: 'Greek Yogurt',
  brand: 'Chobani',
  servingSize: 150,
  servingUnit: 'g',
  calories: 120,
  proteinG: 13.01,
  carbsG: 16.05,
  fatG: 0,
};

beforeEach(() => {
  jest.resetAllMocks();
});

test('searches foods with the trimmed, encoded term', async () => {
  // Arrange
  authorizedRequestMock.mockResolvedValueOnce([YOGURT_JSON]);

  // Act
  const foods = await searchFoods('  greek yogurt & honey ');

  // Assert
  expect(foods).toEqual([YOGURT]);
  expect(authorizedRequestMock).toHaveBeenCalledWith('/foods?search=greek%20yogurt%20%26%20honey');
});

test('lists recent foods, with a null brand for generic ones', async () => {
  // Arrange
  authorizedRequestMock.mockResolvedValueOnce([{ ...YOGURT_JSON, brand: null }]);

  // Act
  const foods = await fetchRecentFoods();

  // Assert
  expect(foods).toEqual([{ ...YOGURT, brand: null }]);
  expect(authorizedRequestMock).toHaveBeenCalledWith('/foods/recent');
});

test.each([
  ['a list that is not a list', { items: [] }],
  ['a food without a name', [{ ...YOGURT_JSON, name: undefined }]],
  ['a food without a brand field', [{ ...YOGURT_JSON, brand: undefined }]],
  ['calories that are not a number', [{ ...YOGURT_JSON, calories: 'lots' }]],
])('rejects %s', async (_label, body) => {
  authorizedRequestMock.mockResolvedValueOnce(body);

  await expect(searchFoods('yogurt')).rejects.toThrow('The server sent an unexpected response.');
});
