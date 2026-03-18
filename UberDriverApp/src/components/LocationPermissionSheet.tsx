import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';

interface LocationPermissionSheetProps {
  onAllow: () => void;
  onDeny: () => void;
}

/**
 * Pre-permission explanation sheet shown before the system location prompt.
 * Apple and Google both recommend explaining location usage before the OS prompt.
 */
export default function LocationPermissionSheet({ onAllow, onDeny }: LocationPermissionSheetProps) {
  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <Text style={styles.icon}>📍</Text>
        <Text style={styles.title}>Enable Location Tracking</Text>
        <Text style={styles.description}>
          To accurately track your mileage for tax deductions, this app needs access to your location
          {Platform.OS === 'ios'
            ? ' — including background access so trips are recorded even when you switch apps.'
            : '. You\'ll need to select "Allow all the time" for background mileage tracking during trips.'}
        </Text>

        <View style={styles.benefitsList}>
          <BenefitRow text="Automatic mileage calculation while driving" />
          <BenefitRow text="Accurate IRS standard deduction tracking" />
          <BenefitRow text="Trip history with route data for records" />
        </View>

        <Text style={styles.privacy}>
          Your location data is stored locally on your device and never shared with third parties.
        </Text>

        <TouchableOpacity style={styles.allowBtn} onPress={onAllow}>
          <Text style={styles.allowBtnText}>Enable Location Access</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.denyBtn} onPress={onDeny}>
          <Text style={styles.denyBtnText}>Not Now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function BenefitRow({ text }: { text: string }) {
  return (
    <View style={styles.benefitRow}>
      <Text style={styles.benefitCheck}>✓</Text>
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1a1a2e', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  icon: { fontSize: 40, textAlign: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 12 },
  description: { color: '#aaa', fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 20 },
  benefitsList: { marginBottom: 16 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  benefitCheck: { color: '#4CAF50', fontSize: 16, marginRight: 10, fontWeight: '700' },
  benefitText: { color: '#ccc', fontSize: 14 },
  privacy: {
    color: '#666', fontSize: 12, textAlign: 'center', marginBottom: 20,
    fontStyle: 'italic',
  },
  allowBtn: {
    backgroundColor: '#4CAF50', borderRadius: 12, paddingVertical: 16, alignItems: 'center',
    marginBottom: 10,
  },
  allowBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  denyBtn: { paddingVertical: 12, alignItems: 'center' },
  denyBtnText: { color: '#888', fontSize: 15 },
});
