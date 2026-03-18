import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import { getDatabase } from './src/services/database';
import { archiveOldTrips } from './src/services/storageManager';

export default function App() {
  useEffect(() => {
    // Initialize database with migration checks on startup
    getDatabase().catch((err) =>
      console.error('Database initialization failed:', err)
    );

    // Run storage archival in background (non-blocking)
    archiveOldTrips().catch((err) =>
      console.error('Storage archival failed:', err)
    );
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
        <AppNavigator />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
