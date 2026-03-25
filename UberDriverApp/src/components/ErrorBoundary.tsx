import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo.componentStack);
  }

  handleRestart = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.iconWrap}>
            <Text style={styles.icon}>!</Text>
          </View>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            The app encountered an unexpected error. Your data is safe.
          </Text>
          {__DEV__ && this.state.error && (
            <Text style={styles.errorDetail}>
              {this.state.error.message}
            </Text>
          )}
          <TouchableOpacity style={styles.button} onPress={this.handleRestart} activeOpacity={0.85}>
            <Text style={styles.buttonText}>Restart App</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center',
    padding: 32,
  },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 3, borderColor: Colors.error,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 20,
  },
  icon: { fontSize: 36, fontWeight: '700', color: Colors.error },
  title: { fontSize: 24, fontWeight: '700', color: Colors.onSurface, marginBottom: 12 },
  message: {
    color: Colors.onSurfaceVariant, fontSize: 16, textAlign: 'center',
    lineHeight: 24, marginBottom: 20,
  },
  errorDetail: {
    color: Colors.error, fontSize: 12, fontFamily: 'monospace',
    backgroundColor: Colors.surfaceContainer, padding: 12, borderRadius: 12,
    marginBottom: 20, maxWidth: '100%',
  },
  button: {
    backgroundColor: Colors.primary, borderRadius: 16,
    paddingVertical: 16, paddingHorizontal: 40,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
  buttonText: { color: Colors.onPrimary, fontSize: 17, fontWeight: '700' },
});
