import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import OnboardingScreen from '@/app/onboarding';
import { ApiError } from '@/src/api/http';
import { completeOnboarding } from '@/src/api/onboarding';
import { fetchProfile, PROFILE_QUERY_KEY, type UserProfile } from '@/src/api/users';
import { deviceTimezone } from '@/src/onboarding/onboardingModel';

// Only the requests are mocked; the choice lists are arrays, which automocking would empty.
jest.mock('@/src/api/onboarding', () => ({
  ...jest.requireActual('@/src/api/onboarding'),
  completeOnboarding: jest.fn(),
}));
jest.mock('@/src/api/users', () => ({
  ...jest.requireActual('@/src/api/users'),
  fetchProfile: jest.fn(),
}));

const completeOnboardingMock = jest.mocked(completeOnboarding);
const fetchProfileMock = jest.mocked(fetchProfile);

const NEW_PROFILE: UserProfile = {
  id: 'user-1',
  name: null,
  email: null,
  timezone: 'UTC',
  unitPreference: 'lbs',
  onboardedAt: null,
};
const ONBOARDED_PROFILE: UserProfile = {
  ...NEW_PROFILE,
  unitPreference: 'kg',
  onboardedAt: '2026-10-14T15:00:00Z',
};

async function renderScreen(): Promise<QueryClient> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  await render(
    <QueryClientProvider client={queryClient}>
      <OnboardingScreen />
    </QueryClientProvider>
  );
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  return queryClient;
}

async function press(text: string) {
  await fireEvent.press(screen.getByText(text));
}

async function chooseGoal() {
  await press('Powerlifting');
  await press('Cut');
  await press('Continue');
}

async function fillTargets() {
  await fireEvent.changeText(screen.getByLabelText('Calories in kcal'), '2400');
  await fireEvent.changeText(screen.getByLabelText('Protein in g'), '180');
  await fireEvent.changeText(screen.getByLabelText('Carbs in g'), '250');
  await fireEvent.changeText(screen.getByLabelText('Fat in g'), '70');
}

/** Answers the first three steps, choosing kilograms, and lands on bodyweight. */
async function reachBodyweightStep() {
  await press('Kilograms (kg)');
  await press('Continue');
  await chooseGoal();
  await fillTargets();
  await press('Continue');
}

beforeEach(() => {
  completeOnboardingMock.mockReset();
  fetchProfileMock.mockReset();
  fetchProfileMock.mockResolvedValue(NEW_PROFILE);
});

describe('Onboarding', () => {
  test('starts on units with the profile’s unit chosen', async () => {
    // Act
    await renderScreen();

    // Assert
    expect(screen.getByText('Step 1 of 4')).toBeTruthy();
    expect(screen.getByText('Pick your units')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Pounds (lb)' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Kilograms (kg)' })).not.toBeChecked();
  });

  test('needs a training style and a phase before moving on', async () => {
    // Arrange
    await renderScreen();
    await press('Continue');

    // Act
    await press('Powerlifting');

    // Assert
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    // Act
    await press('Cut');

    // Assert
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  test('explains targets it cannot use and stays on that step', async () => {
    // Arrange
    await renderScreen();
    await press('Continue');
    await chooseGoal();
    await fireEvent.changeText(screen.getByLabelText('Calories in kcal'), '90');

    // Act
    await press('Continue');

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter daily calories from 500 to 10,000.'
    );
    expect(screen.getByText('Daily targets')).toBeTruthy();
  });

  test('adds up the macros as they are typed', async () => {
    // Arrange
    await renderScreen();
    await press('Continue');
    await chooseGoal();

    // Act
    await fillTargets();

    // Assert
    expect(screen.getByText(/Your macros add up to 2.350 kcal\./)).toBeTruthy();
  });

  test('saves every answer, with the bodyweight in kg, and stores the new profile', async () => {
    // Arrange
    completeOnboardingMock.mockResolvedValue(ONBOARDED_PROFILE);
    const queryClient = await renderScreen();
    await reachBodyweightStep();
    await fireEvent.changeText(screen.getByLabelText('Bodyweight in kg'), '82.5');

    // Act
    await press('Finish');

    // Assert
    await waitFor(() => expect(completeOnboardingMock).toHaveBeenCalledTimes(1));
    expect(completeOnboardingMock.mock.calls[0][0]).toEqual({
      unitPreference: 'kg',
      timezone: deviceTimezone(),
      trainingStyle: 'powerlifting',
      phase: 'cut',
      targets: { calories: 2400, proteinG: 180, carbsG: 250, fatG: 70 },
      bodyweightKg: 82.5,
    });
    await waitFor(() =>
      expect(queryClient.getQueryData(PROFILE_QUERY_KEY)).toEqual(ONBOARDED_PROFILE)
    );
  });

  test('asks for a bodyweight in range before saving', async () => {
    // Arrange
    await renderScreen();
    await reachBodyweightStep();
    await fireEvent.changeText(screen.getByLabelText('Bodyweight in kg'), '5');

    // Act
    await press('Finish');

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a weight from 20 to 400 kg.');
    expect(completeOnboardingMock).not.toHaveBeenCalled();
  });

  test('shows why saving failed and lets the user go back with answers kept', async () => {
    // Arrange
    completeOnboardingMock.mockRejectedValue(new ApiError(503, 'Service unavailable'));
    await renderScreen();
    await reachBodyweightStep();
    await fireEvent.changeText(screen.getByLabelText('Bodyweight in kg'), '82.5');

    // Act
    await press('Finish');

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
    expect(screen.getByRole('button', { name: 'Finish' })).toBeEnabled();

    // Act
    await press('Back');

    // Assert
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Calories in kcal')).toHaveDisplayValue('2400');
  });
});
