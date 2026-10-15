import { authorizedRequest } from '@/src/api/authorized';
import { ApiError } from '@/src/api/http';
import { completeOnboarding, type OnboardingAnswers } from '@/src/api/onboarding';
import { fetchTargets } from '@/src/api/targets';
import { fetchProfile } from '@/src/api/users';

jest.mock('@/src/api/authorized', () => ({ authorizedRequest: jest.fn() }));

const authorizedRequestMock = jest.mocked(authorizedRequest);

const PROFILE_JSON = {
  id: 'user-1',
  name: null,
  email: null,
  timezone: 'America/Chicago',
  unit_preference: 'kg',
  onboarded_at: '2026-10-14T15:00:00Z',
  created_at: '2026-10-01T15:00:00Z',
};
const ANSWERS: OnboardingAnswers = {
  unitPreference: 'kg',
  timezone: 'America/Chicago',
  trainingStyle: 'powerlifting',
  phase: 'cut',
  targets: { calories: 2400, proteinG: 180, carbsG: 250, fatG: 70 },
  bodyweightKg: 82.5536,
};

beforeEach(() => {
  authorizedRequestMock.mockReset();
});

describe('completeOnboarding', () => {
  it('sends the answers in the shape the backend expects', async () => {
    // Arrange
    authorizedRequestMock.mockResolvedValue(PROFILE_JSON);

    // Act
    await completeOnboarding(ANSWERS);

    // Assert
    const [path, init] = authorizedRequestMock.mock.calls[0];
    expect(path).toBe('/onboarding');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      unit_preference: 'kg',
      timezone: 'America/Chicago',
      training_style: 'powerlifting',
      phase: 'cut',
      targets: { calories: 2400, protein_g: 180, carbs_g: 250, fat_g: 70 },
      bodyweight_kg: 82.5536,
    });
  });

  it('returns the updated profile', async () => {
    // Arrange
    authorizedRequestMock.mockResolvedValue(PROFILE_JSON);

    // Act
    const profile = await completeOnboarding(ANSWERS);

    // Assert
    expect(profile).toEqual({
      id: 'user-1',
      name: null,
      email: null,
      timezone: 'America/Chicago',
      unitPreference: 'kg',
      onboardedAt: '2026-10-14T15:00:00Z',
    });
  });
});

describe('fetchProfile', () => {
  it('reads a profile that has not been onboarded', async () => {
    // Arrange
    authorizedRequestMock.mockResolvedValue({ ...PROFILE_JSON, onboarded_at: null });

    // Act
    const profile = await fetchProfile();

    // Assert
    expect(profile.onboardedAt).toBeNull();
  });

  it('rejects a profile without the onboarding time', async () => {
    // Arrange
    const { onboarded_at: _leftOut, ...withoutOnboardedAt } = PROFILE_JSON;
    authorizedRequestMock.mockResolvedValue(withoutOnboardedAt);

    // Act
    const request = fetchProfile();

    // Assert
    await expect(request).rejects.toBeInstanceOf(ApiError);
  });
});

describe('fetchTargets', () => {
  it('asks for the targets on a day and reads them', async () => {
    // Arrange
    authorizedRequestMock.mockResolvedValue({
      calories: 2400,
      protein_g: 180,
      carbs_g: 250,
      fat_g: 70,
      effective_date: '2026-10-14',
    });

    // Act
    const targets = await fetchTargets('2026-10-20');

    // Assert
    expect(authorizedRequestMock).toHaveBeenCalledWith('/targets?on_date=2026-10-20');
    expect(targets).toEqual({
      calories: 2400,
      proteinG: 180,
      carbsG: 250,
      fatG: 70,
      effectiveDate: '2026-10-14',
    });
  });

  it('returns null for a day before any targets were set', async () => {
    // Arrange
    authorizedRequestMock.mockResolvedValue(null);

    // Act
    const targets = await fetchTargets('2026-10-01');

    // Assert
    expect(targets).toBeNull();
  });

  it('rejects targets without a date', async () => {
    // Arrange
    authorizedRequestMock.mockResolvedValue({ calories: 2400 });

    // Act
    const request = fetchTargets('2026-10-14');

    // Assert
    await expect(request).rejects.toBeInstanceOf(ApiError);
  });
});
