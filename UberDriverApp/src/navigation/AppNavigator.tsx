import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, StyleSheet } from 'react-native';
import { ImportReviewResult } from '../models/types';
import { Colors } from '../theme/colors';
import { Fonts } from '../theme/typography';

import DashboardScreen from '../screens/DashboardScreen';
import MileageScreen from '../screens/MileageScreen';
import TransactionsScreen from '../screens/TransactionsScreen';
import ImportScreen from '../screens/ImportScreen';
import ImportReviewScreen from '../screens/ImportReviewScreen';
import AddTransactionScreen from '../screens/AddTransactionScreen';
import TransactionDetailScreen from '../screens/TransactionDetailScreen';
import TripDetailScreen from '../screens/TripDetailScreen';
import SettingsScreen from '../screens/SettingsScreen';

export type RootTabParamList = {
  DashboardTab: undefined;
  MileageTab: undefined;
  TransactionsTab: undefined;
  ImportTab: undefined;
  SettingsTab: undefined;
};

export type TransactionsStackParamList = {
  TransactionsList: undefined;
  AddTransaction: undefined;
  TransactionDetail: { transactionId: string };
};

export type MileageStackParamList = {
  MileageHome: undefined;
  TripDetail: { tripId: string };
};

export type ImportStackParamList = {
  ImportHome: undefined;
  ImportReview: { reviewResult: ImportReviewResult };
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const TransactionsStack = createNativeStackNavigator<TransactionsStackParamList>();
const MileageStack = createNativeStackNavigator<MileageStackParamList>();
const ImportStack = createNativeStackNavigator<ImportStackParamList>();

const TAB_ICONS: Record<string, string> = {
  Dashboard: 'dashboard',
  Mileage: 'speed',
  Transactions: 'receipt_long',
  Import: 'cloud_upload',
};

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View style={[styles.tabIconWrap, focused && styles.tabIconWrapActive]}>
      <Text style={[styles.tabIconText, focused && styles.tabIconTextActive]}>
        {label[0]}
      </Text>
    </View>
  );
}

function TransactionsNavigator() {
  return (
    <TransactionsStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.primary,
        headerTitleStyle: { fontFamily: Fonts.bold, fontSize: 18 },
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <TransactionsStack.Screen
        name="TransactionsList"
        component={TransactionsScreen}
        options={{ title: 'Transactions' }}
      />
      <TransactionsStack.Screen
        name="AddTransaction"
        component={AddTransactionScreen}
        options={{ title: 'Add Transaction' }}
      />
      <TransactionsStack.Screen
        name="TransactionDetail"
        component={TransactionDetailScreen}
        options={{ title: 'Transaction Detail' }}
      />
    </TransactionsStack.Navigator>
  );
}

function MileageNavigator() {
  return (
    <MileageStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.primary,
        headerTitleStyle: { fontFamily: Fonts.bold, fontSize: 18 },
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <MileageStack.Screen
        name="MileageHome"
        component={MileageScreen}
        options={{ title: 'Mileage Tracker' }}
      />
      <MileageStack.Screen
        name="TripDetail"
        component={TripDetailScreen}
        options={{ title: 'Trip Detail' }}
      />
    </MileageStack.Navigator>
  );
}

function ImportNavigator() {
  return (
    <ImportStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.primary,
        headerTitleStyle: { fontFamily: Fonts.bold, fontSize: 18 },
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <ImportStack.Screen
        name="ImportHome"
        component={ImportScreen}
        options={{ title: 'Import' }}
      />
      <ImportStack.Screen
        name="ImportReview"
        component={ImportReviewScreen}
        options={{ title: 'Review Import' }}
      />
    </ImportStack.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.primary,
          headerTitleStyle: { fontFamily: Fonts.bold, fontSize: 20 },
          tabBarStyle: {
            backgroundColor: Colors.surfaceContainerLow + 'D9', // 85% opacity
            borderTopWidth: 0,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            paddingTop: 8,
            paddingBottom: 8,
            height: 70,
            position: 'absolute',
            elevation: 24,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.4,
            shadowRadius: 24,
          },
          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.onSurfaceVariant + '99',
          tabBarLabelStyle: {
            fontSize: 10,
            fontFamily: Fonts.semiBold,
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginTop: 2,
          },
          tabBarIcon: ({ focused }) => (
            <TabIcon label={route.name.replace('Tab', '')} focused={focused} />
          ),
        })}
      >
        <Tab.Screen
          name="DashboardTab"
          component={DashboardScreen}
          options={{ title: 'Dashboard', headerTitle: 'Financial Cockpit' }}
        />
        <Tab.Screen
          name="MileageTab"
          component={MileageNavigator}
          options={{ title: 'Mileage', headerShown: false }}
        />
        <Tab.Screen
          name="TransactionsTab"
          component={TransactionsNavigator}
          options={{ title: 'Transactions', headerShown: false }}
        />
        <Tab.Screen
          name="ImportTab"
          component={ImportNavigator}
          options={{ title: 'Import', headerShown: false }}
        />
        <Tab.Screen
          name="SettingsTab"
          component={SettingsScreen}
          options={{ title: 'Settings', headerTitle: 'Settings & Sync' }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabIconWrap: {
    width: 36,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabIconWrapActive: {
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 12,
    paddingHorizontal: 8,
  },
  tabIconText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: Colors.onSurfaceVariant + '99',
  },
  tabIconTextActive: {
    color: Colors.primary,
    fontFamily: Fonts.bold,
  },
});
