import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Colors } from '../theme/colors';
import { signInWithEmail, signUpWithEmail, resetPassword } from '../services/authService';

type Mode = 'signin' | 'signup' | 'reset';

interface AuthScreenProps {
  onSkip?: () => void;
}

export default function AuthScreen({ onSkip }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const handleSubmit = async () => {
    if (!email.trim()) {
      setMessage({ text: 'Please enter your email', isError: true });
      return;
    }
    if (mode !== 'reset' && password.length < 6) {
      setMessage({ text: 'Password must be at least 6 characters', isError: true });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      if (mode === 'signin') {
        const { error } = await signInWithEmail(email.trim(), password);
        if (error) setMessage({ text: error.message, isError: true });
      } else if (mode === 'signup') {
        const { error } = await signUpWithEmail(email.trim(), password);
        if (error) {
          setMessage({ text: error.message, isError: true });
        } else {
          setMessage({ text: 'Check your email to confirm your account!', isError: false });
        }
      } else {
        const { error } = await resetPassword(email.trim());
        if (error) {
          setMessage({ text: error.message, isError: true });
        } else {
          setMessage({ text: 'Password reset email sent!', isError: false });
        }
      }
    } catch (e: any) {
      setMessage({ text: e.message || 'Something went wrong', isError: true });
    } finally {
      setLoading(false);
    }
  };

  const titles: Record<Mode, string> = {
    signin: 'Welcome Back',
    signup: 'Create Account',
    reset: 'Reset Password',
  };

  const buttonLabels: Record<Mode, string> = {
    signin: 'Sign In',
    signup: 'Create Account',
    reset: 'Send Reset Link',
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.appName}>Uber Driver Tracker</Text>
          <Text style={styles.tagline}>Track expenses. Maximize deductions.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{titles[mode]}</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="driver@example.com"
              placeholderTextColor={Colors.onSurfaceVariant + '66'}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {mode !== 'reset' && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Min 6 characters"
                placeholderTextColor={Colors.onSurfaceVariant + '66'}
                secureTextEntry
              />
            </View>
          )}

          {message && (
            <View style={[styles.msgBox, message.isError ? styles.msgError : styles.msgSuccess]}>
              <Text style={[styles.msgText, message.isError ? styles.msgTextError : styles.msgTextSuccess]}>
                {message.text}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>{buttonLabels[mode]}</Text>
            )}
          </TouchableOpacity>

          <View style={styles.links}>
            {mode === 'signin' && (
              <>
                <TouchableOpacity onPress={() => { setMode('signup'); setMessage(null); }}>
                  <Text style={styles.linkText}>Don't have an account? <Text style={styles.linkBold}>Sign Up</Text></Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setMode('reset'); setMessage(null); }}>
                  <Text style={styles.linkText}>Forgot password?</Text>
                </TouchableOpacity>
              </>
            )}
            {mode === 'signup' && (
              <TouchableOpacity onPress={() => { setMode('signin'); setMessage(null); }}>
                <Text style={styles.linkText}>Already have an account? <Text style={styles.linkBold}>Sign In</Text></Text>
              </TouchableOpacity>
            )}
            {mode === 'reset' && (
              <TouchableOpacity onPress={() => { setMode('signin'); setMessage(null); }}>
                <Text style={styles.linkText}>Back to <Text style={styles.linkBold}>Sign In</Text></Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {onSkip && (
          <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
            <Text style={styles.skipText}>Continue without account (offline only)</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    color: Colors.onSurfaceVariant,
    marginTop: 4,
  },
  card: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.outlineVariant + '33',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.onSurface,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: Colors.onSurface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant + '44',
  },
  msgBox: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  msgError: {
    backgroundColor: Colors.error + '1A',
  },
  msgSuccess: {
    backgroundColor: Colors.tertiary + '1A',
  },
  msgText: {
    fontSize: 13,
    textAlign: 'center',
  },
  msgTextError: {
    color: Colors.error,
  },
  msgTextSuccess: {
    color: Colors.tertiary,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  links: {
    marginTop: 16,
    alignItems: 'center',
    gap: 10,
  },
  linkText: {
    color: Colors.onSurfaceVariant,
    fontSize: 14,
  },
  linkBold: {
    color: Colors.primary,
    fontWeight: '700',
  },
  skipButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  skipText: {
    color: Colors.onSurfaceVariant + '88',
    fontSize: 13,
  },
});
