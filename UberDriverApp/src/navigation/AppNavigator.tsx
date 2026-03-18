import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import { ImportReviewResult } from '../models/types';

import DashboardScreen from '../screens/DashboardScreen';
import MileageScreen from '../screens/MileageScreen';
import TransactionsScreen from '../screens/TransactionsScreen';
import ImportScreen from '../screens/ImportScreen';
import ImportReviewScreen from '../screens/ImportReviewScreen';
import AddTransactionScreen from '../screens/AddTransactionScreen';
import TransactionDetailScreen from '../screens/TransactionDetailScreen';
import TripDetailScreen from '../screens/TripDetailScreen';

export type RootTabParamList = {
  DashboardTab: undefined;
  MileageTab: undefined;
  TransactionsTab: undefined;
  ImportTab: undefined;
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

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Dashboard: 'D',
    Mileage: 'M',
    Transactions: 'T',
    Import: 'I',
  };
  return (
    <Text style={{
      fontSize: 20,
      fontWeight: focused ? '700' : '400',
      color: focused ? '#4CAF50' : '#888',
    }}>
      {icons[label] || label[0]}
    </Text>
  );
}

function TransactionsNavigator() {
  return (
    <TransactionsStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#1a1a2e' },
        headerTintColor: '#fff',
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
        headerStyle: { backgroundColor: '#1a1a2e' },
        headerTintColor: '#fff',
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
        headerStyle: { backgroundColor: '#1a1a2e' },
        headerTintColor: '#fff',
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
          headerStyle: { backgroundColor: '#1a1a2e' },
          headerTintColor: '#fff',
          tabBarStyle: { backgroundColor: '#1a1a2e', borderTopColor: '#333' },
          tabBarActiveTintColor: '#4CAF50',
          tabBarInactiveTintColor: '#888',
          tabBarIcon: ({ focused }) => (
            <TabIcon label={route.name.replace('Tab', '')} focused={focused} />
          ),
        })}
      >
        <Tab.Screen
          name="DashboardTab"
          component={DashboardScreen}
          options={{ title: 'Dashboard' }}
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
      </Tab.Navigator>
    </NavigationContainer>
  );
}
