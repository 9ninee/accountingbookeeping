import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Colors } from '../theme/colors';

interface LocationPermissionSheetProps {
  onAllow: () => void;
  onDeny: () => void;
}

export default function LocationPermissionSheet({ onAllow, onDeny }: LocationPermissionSheetProps) {
  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        {/* Hero Visual */}
        <View style={styles.heroVisual}>
          <View style={styles.pulseRingOuter} />
          <View style={styles.pulseRingInner} />
          <View style={styles.locationIconWrap}>
            <Text style={styles.locationIcon}>L</Text>
          </View>
        </View>

        {/* Content */}
        <Text style={styles.title}>Activate Telemetry</Text>
        <Text style={styles.description}>
          Enable location to transform your drive into a high-performance financial machine.
          {Platform.OS === 'ios'
            ? ' Background access records trips even when you switch apps.'
            : ' Select "Allow all the time" for background tracking.'}
        </Text>

        {/* Benefits */}
        <View style={styles.benefitsList}>
          <BenefitRow icon="S" text="Automatic mileage" />
          <BenefitRow icon="$" text="IRS tracking" />
          <BenefitRow icon="H" text="Trip history" />
        </View>

        {/* Actions */}
        <TouchableOpacity style={styles.allowBtn} onPress={onAllow} activeOpacity={0.85}>
          <Text style={styles.allowBtnText}>Enable Location Access</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.denyBtn} onPress={onDeny}>
          <Text style={styles.denyBtnText}>Not Now</Text>
        </TouchableOpacity>

        {/* Security */}
        <View style={styles.securityBadge}>
          <Text style={styles.securityIcon}>L</Text>
          <Text style={styles.securityText}>END-TO-END ENCRYPTED</Text>
        </View>
      </View>
    </View>
  );
}

function BenefitRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.benefitRow}>
      <View style={styles.benefitLeft}>
        <View style={styles.benefitIconWrap}>
          <Text style={styles.benefitIcon}>{icon}</Text>
        </View>
        <Text style={styles.benefitText}>{text}</Text>
      </View>
      <Text style={styles.benefitCheck}>OK</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 32, paddingTop: 32, paddingBottom: 40,
    alignItems: 'center',
  },

  // Hero
  heroVisual: {
    width: 120, height: 120, justifyContent: 'center', alignItems: 'center',
    marginBottom: 24,
  },
  pulseRingOuter: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    borderWidth: 1, borderColor: Colors.primary + '33',
  },
  pulseRingInner: {
    position: 'absolute', width: 90, height: 90, borderRadius: 45,
    borderWidth: 1, borderColor: Colors.primary + '1A',
  },
  locationIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.surfaceContainerHigh,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 40,
    elevation: 8,
  },
  locationIcon: { fontSize: 32, fontWeight: '700', color: Colors.primary },

  // Content
  title: {
    fontSize: 28, fontWeight: '800', color: Colors.onSurface,
    marginBottom: 12, textAlign: 'center',
  },
  description: {
    color: Colors.onSurfaceVariant, fontSize: 14, lineHeight: 22,
    textAlign: 'center', marginBottom: 24, maxWidth: 280,
  },

  // Benefits
  benefitsList: {
    width: '100%',
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 16, overflow: 'hidden', marginBottom: 32,
  },
  benefitRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, backgroundColor: Colors.surfaceContainer,
    marginBottom: 1,
  },
  benefitLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  benefitIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: Colors.primary + '1A',
    justifyContent: 'center', alignItems: 'center',
  },
  benefitIcon: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  benefitText: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  benefitCheck: { fontSize: 14, fontWeight: '700', color: Colors.primary },

  // Buttons
  allowBtn: {
    width: '100%', backgroundColor: Colors.primary, borderRadius: 16,
    paddingVertical: 18, alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
    marginBottom: 12,
  },
  allowBtnText: { color: Colors.onPrimary, fontSize: 17, fontWeight: '700' },
  denyBtn: { paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  denyBtnText: { color: Colors.onSurfaceVariant, fontSize: 15, fontWeight: '600' },

  // Security
  securityBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: Colors.surfaceContainerHighest + '4D',
    borderWidth: 1, borderColor: Colors.outlineVariant + '1A',
  },
  securityIcon: { fontSize: 12, color: Colors.onSurfaceVariant },
  securityText: {
    fontSize: 10, fontWeight: '500', color: Colors.onSurfaceVariant,
    letterSpacing: 1.5,
  },
});
