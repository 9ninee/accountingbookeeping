import React, { useEffect, useState, useCallback } from 'react';
import { StatusBar, View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import * as SplashScreen from 'expo-splash-screen';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import { getDatabase } from './src/services/database';
import { archiveOldTrips } from './src/services/storageManager';
import { isSupabaseConfigured } from './src/services/supabaseClient';
import { onAuthStateChange, getCurrentSession } from './src/services/authService';
import { autoSyncIfDue } from './src/services/cloudBankService';
import AuthScreen from './src/screens/AuthScreen';
import { Colors } from './src/theme/colors';
import { Session } from '@supabase/supabase-js';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [skipAuth, setSkipAuth] = useState(false);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  useEffect(() => {
    getDatabase().catch((err) =>
      console.error('Database initialization failed:', err)
    );

    archiveOldTrips().catch((err) =>
      console.error('Storage archival failed:', err)
    );

    if (isSupabaseConfigured()) {
      getCurrentSession().then((s) => {
        setSession(s);
        setIsReady(true);
        // Throttled background bank sync (max once / 24h, never blocks startup)
        if (s?.user) autoSyncIfDue().catch(() => {});
      }).catch(() => setIsReady(true));

      const sub = onAuthStateChange((s) => setSession(s));
      return () => sub.unsubscribe();
    } else {
      setSkipAuth(true);
      setIsReady(true);
    }
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded && isReady) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isReady]);

  if (!fontsLoaded || !isReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const needsAuth = isSupabaseConfigured() && !session && !skipAuth;

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
          <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
          {needsAuth ? (
            <AuthScreen onSkip={() => setSkipAuth(true)} />
          ) : (
            <AppNavigator />
          )}
        </View>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
});
