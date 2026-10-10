import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactElement } from 'react';

import DietScreen from '@/app/(tabs)/diet';
import FoodEntryScreen from '@/app/food-entry';
import FoodSearchScreen from '@/app/food-search';
import {
  deleteFoodLogEntry,
  fetchDay,
  logFood,
  updateFoodLogEntry,
  type DayLog,
  type FoodLogEntry,
} from '@/src/api/foodLog';
import { fetchRecentFoods, searchFoods, type Food } from '@/src/api/foods';
import { shiftDateKey, toDateKey } from '@/src/diet/dietModel';
import { startEditingEntry, startNewEntry, useEntryDraft } from '@/src/diet/entryDraft';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), dismissAll: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@/src/api/foods');
// Only the requests are mocked; MEALS is an array, which automocking would empty.
jest.mock('@/src/api/foodLog', () => ({
  ...jest.requireActual('@/src/api/foodLog'),
  fetchDay: jest.fn(),
  logFood: jest.fn(),
  updateFoodLogEntry: jest.fn(),
  deleteFoodLogEntry: jest.fn(),
}));

const fetchDayMock = jest.mocked(fetchDay);
const logFoodMock = jest.mocked(logFood);
const updateFoodLogEntryMock = jest.mocked(updateFoodLogEntry);
const deleteFoodLogEntryMock = jest.mocked(deleteFoodLogEntry);
const searchFoodsMock = jest.mocked(searchFoods);
const fetchRecentFoodsMock = jest.mocked(fetchRecentFoods);
const useLocalSearchParamsMock = jest.mocked(useLocalSearchParams);
const routerPushMock = jest.mocked(router.push);
const routerDismissAllMock = jest.mocked(router.dismissAll);

// Longer than the search screen waits after the last keystroke.
const PAST_DEBOUNCE_MS = 500;
const TODAY = toDateKey(new Date());
const YESTERDAY = shiftDateKey(TODAY, -1);

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
const YOGURT_ENTRY: FoodLogEntry = {
  id: 'entry-1',
  food: YOGURT,
  servings: 2,
  meal: 'breakfast',
  entryDate: TODAY,
  calories: 240,
  proteinG: 26.02,
  carbsG: 32.1,
  fatG: 0,
};
const CHICKEN_ENTRY: FoodLogEntry = {
  id: 'entry-2',
  food: CHICKEN,
  servings: 1.5,
  meal: 'dinner',
  entryDate: TODAY,
  calories: 247.5,
  proteinG: 46.53,
  carbsG: 0,
  fatG: 5.36,
};
const DAY: DayLog = {
  entryDate: TODAY,
  totals: { calories: 487.5, proteinG: 72.55, carbsG: 32.1, fatG: 5.36 },
  entries: [YOGURT_ENTRY, CHICKEN_ENTRY],
};
const EMPTY_DAY: DayLog = {
  entryDate: YESTERDAY,
  totals: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  entries: [],
};

async function renderScreen(screenElement: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  await render(<QueryClientProvider client={queryClient}>{screenElement}</QueryClientProvider>);
  // Let the screen's first requests finish, so each test acts on a settled screen.
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
}

beforeEach(() => {
  for (const mock of [
    fetchDayMock,
    logFoodMock,
    updateFoodLogEntryMock,
    deleteFoodLogEntryMock,
    searchFoodsMock,
    fetchRecentFoodsMock,
    routerPushMock,
    routerDismissAllMock,
  ]) {
    mock.mockReset();
  }
  useEntryDraft.setState({ draft: null });
  useLocalSearchParamsMock.mockReturnValue({ meal: 'lunch', date: YESTERDAY });
  fetchDayMock.mockResolvedValue(DAY);
  fetchRecentFoodsMock.mockResolvedValue([YOGURT]);
});

describe('Diet tab', () => {
  test('shows today’s totals and each entry under its meal', async () => {
    // Act
    await renderScreen(<DietScreen />);

    // Assert
    expect(await screen.findByText('488 kcal')).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('73 g')).toBeTruthy();
    expect(screen.getByText('Greek Yogurt')).toBeTruthy();
    expect(screen.getByText('Chobani · 300 g')).toBeTruthy();
    expect(screen.getByText('Chicken breast, grilled')).toBeTruthy();
    expect(screen.getByText('150 g')).toBeTruthy();
    for (const meal of ['Breakfast', 'Lunch', 'Dinner', 'Snacks']) {
      expect(screen.getByText(meal)).toBeTruthy();
    }
    expect(fetchDayMock).toHaveBeenCalledWith(TODAY);
  });

  test('steps back to past days and returns to today', async () => {
    // Arrange
    await renderScreen(<DietScreen />);
    await screen.findByText('488 kcal');
    fetchDayMock.mockResolvedValue(EMPTY_DAY);

    // Act
    await fireEvent.press(screen.getByLabelText('Previous day'));

    // Assert
    expect(await screen.findByText('Yesterday')).toBeTruthy();
    expect(await screen.findByText('0 kcal')).toBeTruthy();
    expect(fetchDayMock).toHaveBeenLastCalledWith(YESTERDAY);

    // Act
    await fireEvent.press(screen.getByText('Back to today'));

    // Assert
    expect(await screen.findByText('Today')).toBeTruthy();
    expect(screen.queryByText('Back to today')).toBeNull();
  });

  test('opens the food search for the meal and day being added to', async () => {
    // Arrange
    await renderScreen(<DietScreen />);

    // Act
    await fireEvent.press(await screen.findByLabelText('Add food to Lunch'));

    // Assert
    expect(routerPushMock).toHaveBeenCalledWith({
      pathname: '/food-search',
      params: { meal: 'lunch', date: TODAY },
    });
  });

  test('opens a logged entry for editing when it is tapped', async () => {
    // Arrange
    await renderScreen(<DietScreen />);

    // Act
    await fireEvent.press(await screen.findByLabelText('Edit Greek Yogurt'));

    // Assert
    expect(useEntryDraft.getState().draft).toEqual({
      food: YOGURT,
      meal: 'breakfast',
      entryDate: TODAY,
      entry: { id: 'entry-1', servings: 2 },
    });
    expect(routerPushMock).toHaveBeenCalledWith('/food-entry');
  });

  test('offers a retry when the day cannot be loaded', async () => {
    // Arrange
    fetchDayMock.mockRejectedValue(new Error('offline'));

    // Act
    await renderScreen(<DietScreen />);

    // Assert
    expect(await screen.findByText("Couldn't load this day.")).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });
});

describe('Food search', () => {
  test('offers recent foods and starts logging the one picked', async () => {
    // Arrange
    await renderScreen(<FoodSearchScreen />);

    // Act
    await fireEvent.press(await screen.findByLabelText('Log Greek Yogurt'));

    // Assert
    expect(screen.getByText('Recent')).toBeTruthy();
    expect(screen.getByText('Chobani · 150 g · 120 kcal')).toBeTruthy();
    expect(searchFoodsMock).not.toHaveBeenCalled();
    expect(useEntryDraft.getState().draft).toEqual({
      food: YOGURT,
      meal: 'lunch',
      entryDate: YESTERDAY,
      entry: null,
    });
    expect(routerPushMock).toHaveBeenCalledWith('/food-entry');
  });

  test('searches once typing pauses and lists the matches', async () => {
    // Arrange
    searchFoodsMock.mockResolvedValue([CHICKEN]);
    await renderScreen(<FoodSearchScreen />);

    // Act
    await fireEvent.changeText(screen.getByLabelText('Search foods'), ' chicken ');

    // Assert
    expect(await screen.findByText('Chicken breast, grilled')).toBeTruthy();
    expect(screen.queryByText('Recent')).toBeNull();
    expect(searchFoodsMock).toHaveBeenCalledTimes(1);
    expect(searchFoodsMock).toHaveBeenCalledWith('chicken');
  });

  test('does not search for a single letter', async () => {
    // Arrange
    await renderScreen(<FoodSearchScreen />);
    await screen.findByText('Recent');

    // Act
    await fireEvent.changeText(screen.getByLabelText('Search foods'), 'c');

    await act(() => new Promise((resolve) => setTimeout(resolve, PAST_DEBOUNCE_MS)));

    // Assert: the recent foods stay up.
    expect(screen.getByText('Recent')).toBeTruthy();
    expect(searchFoodsMock).not.toHaveBeenCalled();
  });

  test('says so when nothing matches', async () => {
    // Arrange
    searchFoodsMock.mockResolvedValue([]);
    await renderScreen(<FoodSearchScreen />);

    // Act
    await fireEvent.changeText(screen.getByLabelText('Search foods'), 'zzzz');

    // Assert
    expect(await screen.findByText('No foods match “zzzz”.')).toBeTruthy();
  });

  test('explains how to start when nothing has been logged yet', async () => {
    // Arrange
    fetchRecentFoodsMock.mockResolvedValue([]);

    // Act
    await renderScreen(<FoodSearchScreen />);

    // Assert
    expect(
      await screen.findByText('Search for a food to log it. Foods you log will show up here.')
    ).toBeTruthy();
  });

  test('shows an error when the search fails', async () => {
    // Arrange
    searchFoodsMock.mockRejectedValue(new Error('offline'));
    await renderScreen(<FoodSearchScreen />);

    // Act
    await fireEvent.changeText(screen.getByLabelText('Search foods'), 'chicken');

    // Assert
    expect(await screen.findByText("Couldn't load foods.")).toBeTruthy();
  });
});

describe('Food entry', () => {
  test('logs the amount typed, converted to servings', async () => {
    // Arrange
    logFoodMock.mockResolvedValue(CHICKEN_ENTRY);
    startNewEntry(CHICKEN, 'dinner', TODAY);
    await renderScreen(<FoodEntryScreen />);

    // Act
    await fireEvent.changeText(screen.getByLabelText('Amount in g'), '150');

    // Assert: the servings follow the amount, and the preview follows both.
    expect(screen.getByLabelText('Servings').props.value).toBe('1.5');
    expect(screen.getByText('248 kcal')).toBeTruthy();
    expect(screen.getByText('P 47 g · C 0 g · F 5 g')).toBeTruthy();

    // Act
    await fireEvent.press(screen.getByText('Log food'));

    // Assert
    await waitFor(() => expect(routerDismissAllMock).toHaveBeenCalledTimes(1));
    expect(logFoodMock.mock.calls[0][0]).toEqual({
      foodId: 'chicken',
      servings: 1.5,
      meal: 'dinner',
      entryDate: TODAY,
    });
  });

  test('starts at one serving and fills in its amount', async () => {
    // Arrange
    startNewEntry(YOGURT, 'breakfast', TODAY);

    // Act
    await renderScreen(<FoodEntryScreen />);

    // Assert
    expect(screen.getByLabelText('Servings').props.value).toBe('1');
    expect(screen.getByLabelText('Amount in g').props.value).toBe('150');
    expect(screen.getByText('Per serving: Chobani · 150 g · 120 kcal')).toBeTruthy();
    expect(screen.queryByText('Delete entry')).toBeNull();
  });

  test('explains servings it cannot log instead of sending them', async () => {
    // Arrange
    startNewEntry(CHICKEN, 'dinner', TODAY);
    await renderScreen(<FoodEntryScreen />);

    // Act
    await fireEvent.changeText(screen.getByLabelText('Servings'), '0');
    await fireEvent.press(screen.getByText('Log food'));

    // Assert
    expect(screen.getByText('Servings go from 0.01 to 100.')).toBeTruthy();
    expect(logFoodMock).not.toHaveBeenCalled();
    expect(routerDismissAllMock).not.toHaveBeenCalled();
  });

  test('logs once even when the button is tapped again as the screen closes', async () => {
    // Arrange
    logFoodMock.mockResolvedValue(CHICKEN_ENTRY);
    startNewEntry(CHICKEN, 'dinner', TODAY);
    await renderScreen(<FoodEntryScreen />);

    // Act
    await fireEvent.press(screen.getByText('Log food'));
    await waitFor(() => expect(routerDismissAllMock).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByText('Log food'));

    // Assert
    expect(logFoodMock).toHaveBeenCalledTimes(1);
  });

  test('drops the servings message once the field is corrected', async () => {
    // Arrange
    startNewEntry(CHICKEN, 'dinner', TODAY);
    await renderScreen(<FoodEntryScreen />);
    await fireEvent.changeText(screen.getByLabelText('Servings'), '0');
    await fireEvent.press(screen.getByText('Log food'));

    // Act: "1." is not a number yet, so the amount keeps its last value.
    await fireEvent.changeText(screen.getByLabelText('Servings'), '1.');

    // Assert
    expect(screen.queryByText('Servings go from 0.01 to 100.')).toBeNull();
    expect(screen.getByLabelText('Amount in g').props.value).toBe('0');
  });

  test('saves changed servings and meal of an entry being edited', async () => {
    // Arrange
    updateFoodLogEntryMock.mockResolvedValue(YOGURT_ENTRY);
    startEditingEntry(YOGURT_ENTRY);
    await renderScreen(<FoodEntryScreen />);

    // Act
    await fireEvent.changeText(screen.getByLabelText('Servings'), '1');
    await fireEvent.press(screen.getByText('Snacks'));
    await fireEvent.press(screen.getByText('Save changes'));

    // Assert
    await waitFor(() => expect(routerDismissAllMock).toHaveBeenCalledTimes(1));
    expect(updateFoodLogEntryMock).toHaveBeenCalledWith('entry-1', { servings: 1, meal: 'snack' });
    expect(logFoodMock).not.toHaveBeenCalled();
  });

  test('deletes the entry being edited', async () => {
    // Arrange
    deleteFoodLogEntryMock.mockResolvedValue(undefined);
    startEditingEntry(YOGURT_ENTRY);
    await renderScreen(<FoodEntryScreen />);

    // Act
    await fireEvent.press(screen.getByText('Delete entry'));

    // Assert
    await waitFor(() => expect(routerDismissAllMock).toHaveBeenCalledTimes(1));
    expect(deleteFoodLogEntryMock.mock.calls[0][0]).toBe('entry-1');
  });

  test('stays open and says so when saving fails', async () => {
    // Arrange
    logFoodMock.mockRejectedValue(new Error('offline'));
    startNewEntry(CHICKEN, 'dinner', TODAY);
    await renderScreen(<FoodEntryScreen />);

    // Act
    await fireEvent.press(screen.getByText('Log food'));

    // Assert
    expect(await screen.findByText("Couldn't save. Try again.")).toBeTruthy();
    expect(routerDismissAllMock).not.toHaveBeenCalled();
  });

  test('explains when it is opened without a food', async () => {
    // Act
    await renderScreen(<FoodEntryScreen />);

    // Assert
    expect(screen.getByText('Choose a food from the Diet tab to log it.')).toBeTruthy();
  });
});
