import { Platform } from 'react-native';

export const Fonts = {
  regular: Platform.select({
    ios: 'Inter_400Regular',
    android: 'Inter_400Regular',
    default: 'Inter_400Regular',
  })!,
  medium: Platform.select({
    ios: 'Inter_500Medium',
    android: 'Inter_500Medium',
    default: 'Inter_500Medium',
  })!,
  semiBold: Platform.select({
    ios: 'Inter_600SemiBold',
    android: 'Inter_600SemiBold',
    default: 'Inter_600SemiBold',
  })!,
  bold: Platform.select({
    ios: 'Inter_700Bold',
    android: 'Inter_700Bold',
    default: 'Inter_700Bold',
  })!,
  extraBold: Platform.select({
    ios: 'Inter_800ExtraBold',
    android: 'Inter_800ExtraBold',
    default: 'Inter_800ExtraBold',
  })!,
  mono: Platform.select({
    ios: 'JetBrainsMono_400Regular',
    android: 'JetBrainsMono_400Regular',
    default: 'JetBrainsMono_400Regular',
  })!,
  monoMedium: Platform.select({
    ios: 'JetBrainsMono_500Medium',
    android: 'JetBrainsMono_500Medium',
    default: 'JetBrainsMono_500Medium',
  })!,
  monoBold: Platform.select({
    ios: 'JetBrainsMono_700Bold',
    android: 'JetBrainsMono_700Bold',
    default: 'JetBrainsMono_700Bold',
  })!,
};

export const Typography = {
  displayLarge: {
    fontFamily: Fonts.extraBold,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  displayMedium: {
    fontFamily: Fonts.bold,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  headlineLarge: {
    fontFamily: Fonts.bold,
    fontSize: 24,
    lineHeight: 32,
  },
  headlineMedium: {
    fontFamily: Fonts.bold,
    fontSize: 20,
    lineHeight: 28,
  },
  headlineSmall: {
    fontFamily: Fonts.semiBold,
    fontSize: 18,
    lineHeight: 24,
  },
  titleLarge: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    lineHeight: 22,
  },
  titleMedium: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  bodyLarge: {
    fontFamily: Fonts.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  bodyMedium: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  bodySmall: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  labelLarge: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  labelMedium: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
  },
  labelSmall: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  // Financial/numeric data
  numeric: {
    fontFamily: Fonts.monoBold,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.5,
  },
  numericLarge: {
    fontFamily: Fonts.monoBold,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -1,
  },
  numericSmall: {
    fontFamily: Fonts.monoMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  numericCaption: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 16,
  },
};
