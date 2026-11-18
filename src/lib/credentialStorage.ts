import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Native credentials use the OS keystore. Web uses browser storage and should run only on trusted devices. */
export const credentialStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return AsyncStorage.getItem(key);
    const saved = await SecureStore.getItemAsync(key);
    if (saved !== null) return saved;
    // Upgrade existing installs without signing users out; delete plaintext only after a successful write.
    const legacy = await AsyncStorage.getItem(key);
    if (legacy !== null) {
      await SecureStore.setItemAsync(key, legacy);
      await AsyncStorage.removeItem(key);
    }
    return legacy;
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === 'web') return AsyncStorage.setItem(key, value);
    await SecureStore.setItemAsync(key, value);
    await AsyncStorage.removeItem(key);
  },
  async removeItem(key: string) {
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(key);
    await AsyncStorage.removeItem(key);
  },
};
