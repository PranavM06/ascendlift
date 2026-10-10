import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput } from 'react-native';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Text, useThemeColor, View } from '@/components/Themed';
import { MEALS, type Meal } from '@/src/api/foodLog';
import { userMessage } from '@/src/api/http';
import {
  amountTextFor,
  describeFood,
  describeMacros,
  formatCalories,
  MEAL_LABEL,
  parseServings,
  scaleMacros,
  servingsTextFor,
  toServingsText,
} from '@/src/diet/dietModel';
import { useEntryDraft, type EntryDraft } from '@/src/diet/entryDraft';
import { useDeleteFoodLogEntry, useLogFood, useUpdateFoodLogEntry } from '@/src/diet/useDiet';

const PLACEHOLDER_COLOR = '#888';
const DEFAULT_SERVINGS = 1;

/** Closes the entry screen, and the food search under it, back to the Diet tab. */
function returnToDiet() {
  router.dismissAll();
}

function EntryForm({ draft }: { draft: EntryDraft }) {
  const textColor = useThemeColor({}, 'text');
  const { food, entry } = draft;
  const firstServingsText = toServingsText(entry?.servings ?? DEFAULT_SERVINGS);
  const [servingsText, setServingsText] = useState(firstServingsText);
  const [amountText, setAmountText] = useState(() => amountTextFor(food, firstServingsText));
  const [meal, setMeal] = useState<Meal>(draft.meal);
  const [formError, setFormError] = useState<string | null>(null);
  const log = useLogFood();
  const update = useUpdateFoodLogEntry();
  const remove = useDeleteFoodLogEntry();

  const parsed = parseServings(servingsText);
  const preview = parsed.ok ? scaleMacros(food, parsed.servings) : null;
  const isBusy = log.isPending || update.isPending || remove.isPending;
  const requestError = log.error ?? update.error ?? remove.error;
  const errorMessage =
    formError ?? (requestError ? userMessage(requestError, "Couldn't save. Try again.") : null);
  const inputStyle = [styles.input, { color: textColor }];

  // The two fields say the same thing two ways, so typing in one rewrites the other.
  function handleChangeServings(text: string) {
    setServingsText(text);
    setAmountText(amountTextFor(food, text));
  }

  function handleChangeAmount(text: string) {
    setAmountText(text);
    setServingsText(servingsTextFor(food, text));
  }

  function handleSave() {
    if (!parsed.ok) {
      setFormError(parsed.message);
      return;
    }
    setFormError(null);
    const { servings } = parsed;
    if (entry === null) {
      log.mutate(
        { foodId: food.id, servings, meal, entryDate: draft.entryDate },
        { onSuccess: returnToDiet }
      );
    } else {
      update.mutate(
        { entryId: entry.id, changes: { servings, meal } },
        { onSuccess: returnToDiet }
      );
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.name}>{food.name}</Text>
      <Text style={styles.detail}>Per serving: {describeFood(food)}</Text>

      <View style={styles.fields}>
        <View style={styles.field}>
          <Text style={styles.heading}>Servings</Text>
          <TextInput
            style={inputStyle}
            value={servingsText}
            onChangeText={handleChangeServings}
            keyboardType="decimal-pad"
            placeholder="1"
            placeholderTextColor={PLACEHOLDER_COLOR}
            selectTextOnFocus
            accessibilityLabel="Servings"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.heading}>Amount ({food.servingUnit})</Text>
          <TextInput
            style={inputStyle}
            value={amountText}
            onChangeText={handleChangeAmount}
            keyboardType="decimal-pad"
            placeholder={food.servingUnit}
            placeholderTextColor={PLACEHOLDER_COLOR}
            selectTextOnFocus
            accessibilityLabel={`Amount in ${food.servingUnit}`}
          />
        </View>
      </View>

      <Text style={styles.heading}>Meal</Text>
      <View style={styles.chips}>
        {MEALS.map((option) => (
          <Chip
            key={option}
            label={MEAL_LABEL[option]}
            isSelected={meal === option}
            onPress={() => setMeal(option)}
          />
        ))}
      </View>

      {preview ? (
        <View style={styles.preview}>
          <Text style={styles.calories}>{formatCalories(preview.calories)}</Text>
          <Text style={styles.detail}>{describeMacros(preview)}</Text>
        </View>
      ) : null}

      {errorMessage ? (
        <Text style={styles.error} accessibilityRole="alert">
          {errorMessage}
        </Text>
      ) : null}
      <Button
        label={entry === null ? 'Log food' : 'Save changes'}
        variant="primary"
        onPress={handleSave}
        disabled={isBusy}
      />
      {entry !== null ? (
        <Button
          label="Delete entry"
          variant="danger"
          onPress={() => remove.mutate(entry.id, { onSuccess: returnToDiet })}
          disabled={isBusy}
        />
      ) : null}
    </ScrollView>
  );
}

export default function FoodEntryScreen() {
  const draft = useEntryDraft((state) => state.draft);

  if (draft === null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.detail}>Choose a food from the Diet tab to log it.</Text>
      </View>
    );
  }
  // Keyed so opening another food or entry starts the form afresh.
  return <EntryForm key={`${draft.food.id}:${draft.entry?.id ?? 'new'}`} draft={draft} />;
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  name: {
    fontSize: 22,
    fontWeight: '600',
  },
  detail: {
    fontSize: 15,
    opacity: 0.7,
  },
  fields: {
    flexDirection: 'row',
    gap: 12,
  },
  field: {
    flex: 1,
    gap: 6,
  },
  heading: {
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    fontSize: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  preview: {
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    alignItems: 'center',
    gap: 4,
  },
  calories: {
    fontSize: 22,
    fontWeight: '700',
  },
  error: {
    fontSize: 15,
    color: '#c0392b',
  },
});
