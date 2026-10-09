export function apiUrl(path: string): string {
  // Expo only inlines EXPO_PUBLIC_ variables that are read exactly like this.
  const baseUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!baseUrl) {
    throw new Error(
      'EXPO_PUBLIC_API_URL is not set. Copy mobile/.env.example to mobile/.env and point it at the backend.'
    );
  }
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}
