import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

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
          <Text style={styles.icon}>!</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            The app encountered an unexpected error. Your data is safe.
          </Text>
          {__DEV__ && this.state.error && (
            <Text style={styles.errorDetail}>
              {this.state.error.message}
            </Text>
          )}
          <TouchableOpacity style={styles.button} onPress={this.handleRestart}>
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
    flex: 1, backgroundColor: '#0f0f23', justifyContent: 'center', alignItems: 'center',
    padding: 32,
  },
  icon: {
    fontSize: 48, fontWeight: '700', color: '#FF5722', marginBottom: 16,
    width: 72, height: 72, lineHeight: 72, textAlign: 'center',
    borderRadius: 36, borderWidth: 3, borderColor: '#FF5722',
  },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 12 },
  message: { color: '#888', fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 20 },
  errorDetail: {
    color: '#FF5722', fontSize: 12, fontFamily: 'monospace',
    backgroundColor: '#1a1a2e', padding: 12, borderRadius: 8,
    marginBottom: 20, maxWidth: '100%',
  },
  button: {
    backgroundColor: '#4CAF50', borderRadius: 12, paddingVertical: 16, paddingHorizontal: 40,
  },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
