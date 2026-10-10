import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput } from 'react-native';

import { Text, useThemeColor, View } from '@/components/Themed';
import { isMeal, type Meal } from '@/src/api/foodLog';
import {
  MAX_FOOD_SEARCH_LENGTH,
  MIN_FOOD_SEARCH_LENGTH,
  type Food,
} from '@/src/api/foods';
import { userMessage } from '@/src/api/http';
import { describeFood, isDateKey, toDateKey } from '@/src/diet/dietModel';
import { startNewEntry } from '@/src/diet/entryDraft';
import { useFoodSearch, useRecentFoods } from '@/src/diet/useDiet';
import { useDebounced } from '@/src/useDebounced';

// Longer than the exercise search's: each new food search can reach USDA.
const SEARCH_DEBOUNCE_MS = 400;
const PLACEHOLDER_COLOR = '#888';
// Where a food goes when the screen is opened without saying which meal.
const DEFAULT_MEAL: Meal = 'snack';

export default function FoodSearchScreen() {
  const textColor = useThemeColor({}, 'text');
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const meal = isMeal(params.meal) ? params.meal : DEFAULT_MEAL;
  const entryDate = isDateKey(params.date) ? params.date : toDateKey(new Date());

  const [searchText, setSearchText] = useState('');
  const search = useDebounced(searchText.trim(), SEARCH_DEBOUNCE_MS);
  const isSearching = search.length >= MIN_FOOD_SEARCH_LENGTH;
  const results = useFoodSearch(search);
  const recent = useRecentFoods();

  // Until there is something to search for, offer what was logged lately.
  const shown = isSearching ? results : recent;
  const foods = shown.data ?? [];
  // While a new search loads, the list still holds the previous one's foods.
  const isLoadingNext = isSearching && results.isPlaceholderData;
  const isSettled = shown.isSuccess && !isLoadingNext;

  function handlePick(food: Food) {
    startNewEntry(food, meal, entryDate);
    router.push('/food-entry');
  }

  return (
    <View style={styles.screen}>
      <TextInput
        style={[styles.search, { color: textColor }]}
        value={searchText}
        onChangeText={setSearchText}
        maxLength={MAX_FOOD_SEARCH_LENGTH}
        placeholder="Search foods"
        placeholderTextColor={PLACEHOLDER_COLOR}
        autoCorrect={false}
        autoFocus
        clearButtonMode="while-editing"
        accessibilityLabel="Search foods"
      />

      {shown.isPending || isLoadingNext ? <ActivityIndicator style={styles.status} /> : null}
      {shown.isError ? (
        <Text style={[styles.status, styles.error]} accessibilityRole="alert">
          {userMessage(shown.error, "Couldn't load foods.")}
        </Text>
      ) : null}
      {isSettled && foods.length === 0 ? (
        <Text style={styles.status}>
          {isSearching
            ? `No foods match “${search}”.`
            : 'Search for a food to log it. Foods you log will show up here.'}
        </Text>
      ) : null}

      <FlatList
        data={foods}
        keyExtractor={(food) => food.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          !isSearching && foods.length > 0 ? <Text style={styles.heading}>Recent</Text> : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => handlePick(item)}
            accessibilityRole="button"
            accessibilityLabel={`Log ${item.name}`}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.details}>{describeFood(item)}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  search: {
    margin: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    fontSize: 16,
  },
  status: {
    padding: 16,
    fontSize: 15,
    textAlign: 'center',
    opacity: 0.7,
  },
  error: {
    color: '#c0392b',
    opacity: 1,
  },
  heading: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.6,
  },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: '500',
  },
  details: {
    fontSize: 14,
    opacity: 0.6,
  },
});
