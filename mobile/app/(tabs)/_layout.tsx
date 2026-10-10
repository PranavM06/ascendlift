import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

const TAB_ICON_SIZE = 28;

function tabIcon(name: SymbolViewProps['name']) {
  return function TabIcon({ color }: { color: ColorValue }) {
    return <SymbolView name={name} tintColor={color} size={TAB_ICON_SIZE} />;
  };
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: Colors[colorScheme].tint }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: tabIcon({ ios: 'house.fill', android: 'home', web: 'home' }),
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: 'Training',
          tabBarIcon: tabIcon({
            ios: 'dumbbell.fill',
            android: 'fitness_center',
            web: 'fitness_center',
          }),
        }}
      />
      <Tabs.Screen
        name="diet"
        options={{
          title: 'Diet',
          tabBarIcon: tabIcon({ ios: 'fork.knife', android: 'restaurant', web: 'restaurant' }),
        }}
      />
    </Tabs>
  );
}
