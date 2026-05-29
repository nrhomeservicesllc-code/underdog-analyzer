# Underdog. — Mobile App

React Native / Expo app for iOS (App Store) and Android (Google Play).

## Prerequisites

1. Install Node.js 18+
2. Install Expo CLI: `npm install -g expo-cli eas-cli`
3. Create an Expo account at expo.dev
4. For iOS: Mac with Xcode + Apple Developer account ($99/year)
5. For Android: Google Play Console account ($25 one-time)

## Quick Start (test on your phone)

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app (free on App Store / Play Store).

## Point at Your Live API

Create `mobile/.env`:
```
EXPO_PUBLIC_API_URL=https://your-vercel-url.vercel.app
```

## Build for App Store / Google Play

### 1. Set up EAS Build

```bash
eas login
eas build:configure   # links to your Expo account
```

### 2. Update app.json

Change these values in `app.json`:
- `ios.bundleIdentifier`: e.g. `com.yourname.underdoganalyzer`
- `android.package`: e.g. `com.yourname.underdoganalyzer`
- `extra.eas.projectId`: your EAS project ID (from `eas build:configure`)

### 3. Update eas.json

Fill in your Apple credentials:
- `appleId`: your Apple ID email
- `ascAppId`: App Store Connect app ID
- `appleTeamId`: your Apple Developer team ID

### 4. Build production binaries

```bash
# iOS (.ipa for App Store)
npm run build:ios

# Android (.aab for Google Play)
npm run build:android
```

EAS builds in the cloud — no local Xcode/Android Studio needed.

### 5. Submit to stores

```bash
npm run submit:ios      # uploads to App Store Connect
npm run submit:android  # uploads to Google Play
```

## App Store Requirements Checklist

Before submitting:
- [ ] Replace `assets/icon.png` with a 1024×1024 PNG (no alpha, no rounded corners)
- [ ] Replace `assets/splash.png` with a 1284×2778 PNG splash screen
- [ ] Add `assets/adaptive-icon.png` (1024×1024 for Android adaptive icon)
- [ ] Write App Store description emphasizing "for informational purposes only"
- [ ] Include gambling/sports betting disclaimer in app store notes
- [ ] Set age rating: 17+ (gambling references)
- [ ] Privacy policy URL required by both stores

## File Structure

```
mobile/
├── app.json          ← App config (bundle ID, version, icons)
├── eas.json          ← Build & submit config
├── package.json      ← Dependencies
├── app/
│   ├── _layout.tsx   ← Tab navigation
│   ├── index.tsx     ← Main picks screen
│   └── tracker.tsx   ← Win/loss tracker screen
├── components/
│   └── UnderdogCard.tsx
├── lib/
│   ├── api.ts        ← Calls your Vercel API
│   └── tracker.ts    ← AsyncStorage bet tracker
└── types/
    └── betting.ts    ← Shared types
```
