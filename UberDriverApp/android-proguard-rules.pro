# React Native
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-dontwarn com.facebook.react.**

# Expo modules
-keep class expo.modules.** { *; }
-dontwarn expo.modules.**

# expo-sqlite
-keep class org.sqlite.** { *; }
-dontwarn org.sqlite.**

# expo-location
-keep class com.google.android.gms.location.** { *; }
-dontwarn com.google.android.gms.location.**

# Keep native module registrations
-keep class * extends com.facebook.react.bridge.ReactContextBaseJavaModule { *; }
-keep class * extends expo.modules.core.interfaces.Package { *; }

# General
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
