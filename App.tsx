import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { UploadQueueProvider } from './src/contexts/UploadQueueContext';
import { RootNavigator } from './src/navigation';
import { LockScreen } from './src/components/LockScreen';
import { UploadToast } from './src/components/UploadToast';
import { useAppLock } from './src/hooks/useAppLock';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { getLoggingService } from './src/services/logging.service';

function AppContent() {
  const { isLocked, unlock } = useAppLock();

  return (
    <UploadQueueProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <RootNavigator />
        <UploadToast />
      </NavigationContainer>
      <LockScreen visible={isLocked} onUnlock={unlock} />
    </UploadQueueProvider>
  );
}

export default function App() {
  // Initialize logging service on app start
  useEffect(() => {
    getLoggingService().initialize();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
