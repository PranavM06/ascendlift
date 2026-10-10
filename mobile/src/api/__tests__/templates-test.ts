import { authorizedRequest } from '@/src/api/authorized';
import {
  createTemplate,
  deleteTemplate,
  fetchTemplate,
  fetchTemplates,
  replaceTemplate,
} from '@/src/api/templates';

jest.mock('@/src/api/authorized', () => ({ authorizedRequest: jest.fn() }));

const authorizedRequestMock = jest.mocked(authorizedRequest);

const TEMPLATE_JSON = {
  id: 'template-1',
  name: 'Leg Day',
  notes: null,
  exercises: [
    {
      id: 'item-1',
      exercise: { id: 'squat', name: 'Barbell Squat' },
      position: 1,
      target_sets: 3,
      rep_min: 5,
      rep_max: 8,
      target_weight_kg: '100.0000',
      target_rpe: '8.0',
    },
  ],
};
const TEMPLATE = {
  id: 'template-1',
  name: 'Leg Day',
  notes: null,
  exercises: [
    {
      id: 'item-1',
      exercise: { id: 'squat', name: 'Barbell Squat' },
      position: 1,
      targetSets: 3,
      repMin: 5,
      repMax: 8,
      targetWeightKg: 100,
      targetRpe: 8,
    },
  ],
};
const CONTENT = {
  name: 'Leg Day',
  notes: 'Belt on.',
  exercises: [
    {
      exerciseId: 'squat',
      targetSets: 3,
      repMin: 5,
      repMax: 8,
      targetWeightKg: null,
      targetRpe: null,
    },
  ],
};
const CONTENT_JSON = JSON.stringify({
  name: 'Leg Day',
  notes: 'Belt on.',
  exercises: [
    {
      exercise_id: 'squat',
      target_sets: 3,
      rep_min: 5,
      rep_max: 8,
      target_weight_kg: null,
      target_rpe: null,
    },
  ],
});
const JSON_HEADERS = { 'Content-Type': 'application/json' };

beforeEach(() => {
  jest.resetAllMocks();
});

test('lists the user’s templates', async () => {
  // Arrange
  authorizedRequestMock.mockResolvedValueOnce([TEMPLATE_JSON]);

  // Act
  const templates = await fetchTemplates();

  // Assert
  expect(templates).toEqual([TEMPLATE]);
  expect(authorizedRequestMock).toHaveBeenCalledWith('/templates');
});

test('reads one template, with nulls for targets that are not set', async () => {
  // Arrange
  const untargeted = { ...TEMPLATE_JSON.exercises[0], target_weight_kg: null, target_rpe: null };
  authorizedRequestMock.mockResolvedValueOnce({ ...TEMPLATE_JSON, exercises: [untargeted] });

  // Act
  const template = await fetchTemplate('template-1');

  // Assert
  expect(template.exercises[0]).toMatchObject({ targetWeightKg: null, targetRpe: null });
  expect(authorizedRequestMock).toHaveBeenCalledWith('/templates/template-1');
});

test('creates a template with a POST request', async () => {
  // Arrange
  authorizedRequestMock.mockResolvedValueOnce(TEMPLATE_JSON);

  // Act
  const created = await createTemplate(CONTENT);

  // Assert
  expect(created).toEqual(TEMPLATE);
  expect(authorizedRequestMock).toHaveBeenCalledWith('/templates', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: CONTENT_JSON,
  });
});

test('replaces a template with a PUT request', async () => {
  // Arrange
  authorizedRequestMock.mockResolvedValueOnce(TEMPLATE_JSON);

  // Act
  await replaceTemplate('template-1', CONTENT);

  // Assert
  expect(authorizedRequestMock).toHaveBeenCalledWith('/templates/template-1', {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: CONTENT_JSON,
  });
});

test('deletes a template with a DELETE request', async () => {
  // Arrange
  authorizedRequestMock.mockResolvedValueOnce(null);

  // Act
  await deleteTemplate('template-1');

  // Assert
  expect(authorizedRequestMock).toHaveBeenCalledWith('/templates/template-1', {
    method: 'DELETE',
  });
});

test.each([
  ['a list that is not a list', { templates: [] }],
  ['a template without a name', [{ ...TEMPLATE_JSON, name: undefined }]],
  ['an exercise without a rep range', [{ ...TEMPLATE_JSON, exercises: [{ id: 'item-1' }] }]],
])('rejects %s', async (_label, body) => {
  authorizedRequestMock.mockResolvedValueOnce(body);

  await expect(fetchTemplates()).rejects.toThrow('The server sent an unexpected response.');
});
