import React, { useEffect, useState } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import { getDatabase } from './src/services/database';
import { archiveOldTrips } from './src/services/storageManager';
import { isSupabaseConfigured } from './src/services/supabaseClient';
import { onAuthStateChange, getCurrentSession } from './src/services/authService';
import AuthScreen from './src/screens/AuthScreen';
import { Session } from '@supabase/supabase-js';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [skipAuth, setSkipAuth] = useState(false);

  useEffect(() => {
    // Initialize database with migration checks on startup
    getDatabase().catch((err) =>
      console.error('Database initialization failed:', err)
    );

    // Run storage archival in background (non-blocking)
    archiveOldTrips().catch((err) =>
      console.error('Storage archival failed:', err)
    );

    // Check auth state if Supabase is configured
    if (isSupabaseConfigured()) {
      getCurrentSession().then((s) => {
        setSession(s);
        setIsReady(true);
      }).catch(() => setIsReady(true));

      const sub = onAuthStateChange((s) => setSession(s));
      return () => sub.unsubscribe();
    } else {
      // No Supabase — go straight to app (offline mode)
      setSkipAuth(true);
      setIsReady(true);
    }
  }, []);

  if (!isReady) return null;

  // Show auth screen only when Supabase is configured but user isn't signed in
  const needsAuth = isSupabaseConfigured() && !session && !skipAuth;

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
        {needsAuth ? (
          <AuthScreen onSkip={() => setSkipAuth(true)} />
        ) : (
          <AppNavigator />
        )}
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
