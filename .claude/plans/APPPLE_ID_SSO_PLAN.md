# Apple ID Single Sign-On Integration Plan

## Overview

Integrate Apple Sign-In so that **posting requires authentication** while **browsing remains anonymous**. iOS users authenticate via Apple ID; Android/Web users can browse but cannot post.

## Requirements Summary

- **Browsing**: Anonymous (no sign-in required)
- **Posting**: Requires Apple Sign-In (iOS) — Android/Web cannot post
- **Auth verification**: Client-side only (no backend token verification)
- **Platform handling**: iOS = Apple Sign-In, Android/Web = view-only mode

---

## Critical Architecture Considerations

### Issue 1: Singleton Service Problem
The `UploadService` is a singleton initialized with `deviceId`. When auth state changes, the service retains the old identity.

**Solution**: Modify `createUpload` in `useUploadData` to pass `userId` directly to the service method, rather than relying on the singleton's config. Alternatively, reset services when auth changes.

### Issue 2: useUploadData Bypasses Context
`useUploadData.ts:36` directly calls `useDeviceIdentity()`. This won't automatically pick up Apple userId.

**Solution**: Create `useUserIdentity` hook that returns Apple userId when authenticated, falls back to deviceId. Replace `useDeviceIdentity` usage.

### Issue 3: getUploadService Ignores Config Updates
The singleton pattern in `getUploadService()` ignores new config if instance exists.

**Solution**: When calling `createUpload`, pass userId as a parameter to the service method. Update the service to accept userId per-operation.

### Issue 4: App Startup Sequence
Auth state must load before determining user identity for services.

**Solution**: `AuthProvider` loads first, determines identity, then downstream hooks use the resolved identity.

### Issue 5: Credential Revocation
If user revokes Apple credentials externally, app must handle gracefully.

**Solution**: Register `AppleAuthentication.addCredentialRevokedListener` in auth hook.

---

## Implementation Steps

### Step 1: Install Dependencies

```bash
npx expo install expo-apple-authentication expo-secure-store
```

### Step 2: Configure app.json

**File**: `app.json`

```json
{
  "expo": {
    "ios": {
      "usesAppleSignIn": true
    },
    "plugins": [
      "expo-apple-authentication",
      // ... existing plugins
    ]
  }
}
```

### Step 3: Apple Developer Portal

1. Log into Apple Developer Portal
2. Enable "Sign in with Apple" for bundle ID `com.unum.app`
3. Configure as primary App ID

### Step 4: Create Auth Types

**New file**: `src/shared/types/auth.ts`

```typescript
export type AuthProvider = 'apple' | 'anonymous';

export interface AuthUser {
  id: string;                    // Apple user ID
  email: string | null;
  displayName: string | null;
  authProvider: AuthProvider;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
}
```

### Step 5: Add Auth Storage Keys

**File**: `src/shared/constants/index.ts`

Add to existing file:

```typescript
export const AUTH_STORAGE_KEYS = {
  AUTH_STATE: 'unum_auth_state',
  APPLE_USER_ID: 'unum_apple_user_id',
  USER_PROFILE: 'unum_user_profile',
};
```

### Step 6: Create Auth Service

**New file**: `src/services/auth.service.ts`

Key responsibilities:
- `signInWithApple()` - Initiates Apple Sign-In, stores credentials in SecureStore
- `signOut()` - Clears stored credentials
- `loadStoredAuth()` - Retrieves persisted auth state on app start
- `checkCredentialState(userId)` - Verifies Apple credentials are still valid
- `addCredentialRevokedListener()` - Listens for external revocation

Implementation notes:
- Use `expo-secure-store` for sensitive data (Apple user ID)
- Use `AsyncStorage` for non-sensitive profile data
- Handle the case where Apple only provides email/name on first sign-in

### Step 7: Create useAuth Hook

**New file**: `src/hooks/useAuth.ts`

```typescript
interface UseAuthResult {
  // State
  isAuthenticated: boolean;
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;

  // Platform info
  isAppleSignInAvailable: boolean;
  canPost: boolean;

  // Actions
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
}
```

Key implementation details:
- Check `AppleAuthentication.isAvailableAsync()` on mount
- Register credential revoked listener with cleanup
- Load stored auth state on mount
- Expose `canPost = isAuthenticated && isAppleSignInAvailable`

### Step 8: Create AuthContext

**New file**: `src/contexts/AuthContext.tsx`

```typescript
interface AuthContextValue {
  auth: UseAuthResult;
  userId: string | null;  // Resolved: Apple ID if authenticated, null otherwise
}
```

Provider wraps the app and exposes auth state to all children.

### Step 9: Create useUserIdentity Hook (Critical)

**New file**: `src/hooks/useUserIdentity.ts`

This hook unifies Apple ID and device ID:

```typescript
interface UseUserIdentityResult {
  userId: string | null;           // Apple ID if authenticated, else deviceId
  userIdRef: MutableRefObject<string | null>;
  isReady: boolean;
  isLoading: boolean;
  authProvider: 'apple' | 'device' | null;
}
```

Logic:
1. Get auth state from AuthContext
2. If authenticated → return Apple userId
3. If not authenticated → fall back to deviceId from useDeviceIdentity
4. Expose `userIdRef` for async callbacks (same pattern as useDeviceIdentity)

### Step 10: Create Sign-In Screen

**New file**: `src/screens/SignInScreen.tsx`

Modal screen shown when unauthenticated user tries to post:
- App branding/logo
- "Sign in with Apple" button (native component)
- Brief explanation text
- "Cancel" button to return to browsing
- Handle platform check (hide Apple button on Android)

### Step 11: Create AppleSignInButton Component

**New file**: `src/components/AppleSignInButton.tsx`

Wrapper around native Apple button with:
- Consistent styling
- Loading state
- Error handling

### Step 12: Update App.tsx

**File**: `App.tsx`

Wrap with AuthProvider at the top level:

```typescript
<GestureHandlerRootView>
  <SafeAreaProvider>
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  </SafeAreaProvider>
</GestureHandlerRootView>
```

### Step 13: Update RootNavigator

**File**: `src/navigation/RootNavigator.tsx`

Add SignIn screen:

```typescript
export type RootStackParamList = {
  Map: undefined;
  Camera: undefined;
  SignIn: undefined;
};

// In navigator
<Stack.Screen
  name="SignIn"
  component={SignInScreen}
  options={{
    presentation: 'modal',
    animation: 'slide_from_bottom',
  }}
/>
```

### Step 14: Update navigation/types.ts

Add `SignIn` to `RootStackParamList`.

### Step 15: Gate Camera Access in MapScreen (Critical)

**File**: `src/screens/MapScreen.tsx`

Update `handleCameraPress`:

```typescript
const { isAuthenticated, isAppleSignInAvailable } = useAuth();

const handleCameraPress = useCallback(() => {
  if (!isAuthenticated) {
    if (isAppleSignInAvailable) {
      navigation.navigate('SignIn');
    } else {
      Alert.alert(
        'Sign In Required',
        'Posting content requires an iOS device with Apple Sign-In.'
      );
    }
    return;
  }
  navigation.navigate('Camera');
}, [navigation, isAuthenticated, isAppleSignInAvailable]);
```

### Step 16: Update useUploadData (Critical)

**File**: `src/hooks/useUploadData.ts`

Replace `useDeviceIdentity` with `useUserIdentity`:

```typescript
// Before
const { deviceId, deviceIdRef } = useDeviceIdentity();

// After
const { userId, userIdRef, authProvider } = useUserIdentity();
```

Update `createUpload` to use `userId`:
- Change variable names from `deviceId` → `userId`
- Pass `userId` to `getUploadService`

### Step 17: Update UploadService (Critical)

**File**: `src/services/upload.service.ts`

Option A (simpler): Rename `deviceId` to `userId` in config and types.

Option B (more robust): Modify `createUpload` to accept `userId` as a parameter rather than relying on service config:

```typescript
async createUpload(params: CreateUploadParams & { userId: string }): Promise<BFFUpload> {
  const input: CreateUploadInput = {
    // ...
    deviceId: params.userId,  // Use passed userId instead of config
  };
  // ...
}
```

For now, Option A is sufficient since we're gating camera access.

### Step 18: Handle Sign-Out

In auth service and hook:
1. Clear SecureStore credentials
2. Clear user profile from AsyncStorage
3. Optionally: reset service singletons via `resetUploadService()`, etc.
4. Navigate away from camera if currently there

---

## Files Summary

### New Files (7)
| File | Purpose |
|------|---------|
| `src/services/auth.service.ts` | Apple Sign-In logic, credential management |
| `src/hooks/useAuth.ts` | Auth state and actions hook |
| `src/hooks/useUserIdentity.ts` | Unified identity (Apple/device) |
| `src/contexts/AuthContext.tsx` | App-wide auth provider |
| `src/screens/SignInScreen.tsx` | Sign-in modal UI |
| `src/components/AppleSignInButton.tsx` | Native Apple button wrapper |
| `src/shared/types/auth.ts` | Auth type definitions |

### Modified Files (8)
| File | Changes |
|------|---------|
| `app.json` | Add `usesAppleSignIn`, `expo-apple-authentication` plugin |
| `App.tsx` | Wrap with AuthProvider |
| `src/navigation/RootNavigator.tsx` | Add SignIn screen |
| `src/navigation/types.ts` | Add SignIn to RootStackParamList |
| `src/shared/constants/index.ts` | Add AUTH_STORAGE_KEYS |
| `src/screens/MapScreen.tsx` | Gate camera button behind auth |
| `src/hooks/useUploadData.ts` | Use useUserIdentity instead of useDeviceIdentity |
| `src/services/upload.service.ts` | Rename deviceId → userId in types |

---

## Data Flow

### App Startup
```
App.tsx
  └── AuthProvider (loads stored auth from SecureStore)
        └── useAuth initializes:
              ├── Check isAppleSignInAvailable
              ├── Load stored credentials
              ├── Verify credential state with Apple
              └── Set isAuthenticated

Then downstream:
  └── MapScreen
        └── useUploadData
              └── useUserIdentity
                    ├── If authenticated → Apple userId
                    └── Else → deviceId fallback (for voting/viewing)
```

### Sign-In Flow
```
1. User taps Camera button
2. MapScreen checks isAuthenticated (false)
3. Navigate to SignIn modal
4. User taps "Sign in with Apple"
5. Native Apple sheet appears
6. User authenticates
7. Apple returns credentials (user, email, fullName, identityToken)
8. AuthService stores in SecureStore
9. AuthContext updates (isAuthenticated = true)
10. Modal dismisses
11. User can now access Camera
```

### Posting Flow (Authenticated)
```
1. User opens Camera (auth already verified)
2. Captures media
3. Taps Upload
4. useUploadData.createUpload() called
5. useUserIdentity returns Apple userId
6. UploadService.createUpload() uses userId
7. Upload stored with userId as owner
```

---

## User Flows

### iOS User - First Time
1. Browse map and feed (anonymous)
2. Tap camera → SignIn modal appears
3. Sign in with Apple
4. Camera opens
5. Post content

### iOS User - Returning
1. App loads → auth state restored from SecureStore
2. Browse or post immediately (already authenticated)

### Android/Web User
1. Browse map and feed
2. Tap camera → Alert: "Requires iOS with Apple Sign-In"
3. Continue browsing

### Sign Out
1. User accesses settings (future feature) or we add sign-out option
2. Credentials cleared
3. Returns to anonymous browsing mode

---

## Edge Cases

### Credential Revocation
- User revokes app access from Apple ID settings
- `credentialRevokedListener` fires
- Auth state cleared, user signed out
- Next camera tap shows SignIn modal

### Network Failure During Sign-In
- Apple Sign-In is device-level, works offline for returning users
- First-time sign-in requires network
- Show appropriate error if network unavailable

### User Hides Email
- Apple allows hiding real email
- `credential.email` may be a relay address or null
- Store whatever Apple provides, don't require email

### Multiple Devices
- Same Apple ID on multiple devices = same userId
- User's posts appear consistently across devices

---

## Verification Plan

### Manual Testing Checklist

1. **Fresh Install (iOS)**
   - [ ] App loads, map displays
   - [ ] Can browse feed without sign-in
   - [ ] Tap camera → SignIn modal appears
   - [ ] Cancel returns to map

2. **Sign-In Flow**
   - [ ] Tap "Sign in with Apple"
   - [ ] Native Apple sheet appears
   - [ ] Complete authentication
   - [ ] Modal dismisses, camera opens

3. **Post After Sign-In**
   - [ ] Capture photo/video
   - [ ] Add caption
   - [ ] Upload succeeds
   - [ ] Returns to map, new post visible

4. **Session Persistence**
   - [ ] Close and reopen app
   - [ ] Tap camera → Camera opens directly (no sign-in prompt)

5. **Sign Out (when implemented)**
   - [ ] Sign out clears credentials
   - [ ] Camera button shows sign-in modal again

6. **Android**
   - [ ] App loads, can browse
   - [ ] Tap camera → Alert about iOS requirement
   - [ ] No crash, graceful handling

### Edge Case Testing
- [ ] Cancel Apple Sign-In mid-flow
- [ ] Network offline during sign-in attempt
- [ ] Rapid camera button taps

---

## Future Considerations

- **Profile/My Posts**: Show user's own posts in a dedicated view
- **Settings Screen**: Add sign-out option, account info display
- **Google Sign-In**: Add for Android parity
- **Backend Verification**: Add AWS Lambda for token verification if needed
- **Account Deletion**: Required for App Store compliance

---

## Notes

- Apple Sign-In requires physical iOS device (iOS 13+) for testing
- iOS Simulator can test UI but not actual sign-in flow
- Keep device-based identity system intact for voting (anonymous users can still vote)
- `expo-apple-authentication` handles native configuration via Expo prebuild
