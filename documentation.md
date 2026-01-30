# Unum - Technical Documentation

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Directory Structure](#3-directory-structure)
4. [AWS Infrastructure](#4-aws-infrastructure)
5. [Authentication System](#5-authentication-system)
6. [Data Model](#6-data-model)
7. [Services Layer](#7-services-layer)
8. [Hooks & State Management](#8-hooks--state-management)
9. [Screens & Navigation](#9-screens--navigation)
10. [Configuration & Environment](#10-configuration--environment)
11. [Testing](#11-testing)
12. [Development Setup](#12-development-setup)

---

## 1. Overview

Unum is a location-based photo and video sharing app for iOS. Users capture photos or videos, pin them to their current location on a map, and vote on content posted by others. Anonymous users can browse; authenticated users (via Apple Sign-In) can post and vote.

### Core User Flows

1. **Browse** - Open the app, see a map with markers for nearby uploads. Pull up the bottom sheet to scroll a feed.
2. **Capture** - Tap the camera button, take a photo (tap) or record a video (hold), add a caption, post.
3. **Vote** - Upvote or downvote posts from the feed or map marker callouts.
4. **Download** - Save any post's media to the device photo library with embedded EXIF metadata.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native 0.81 + Expo SDK 54 |
| Language | TypeScript 5.9 |
| Navigation | React Navigation 7 (native stack) |
| Maps | react-native-maps 1.20 |
| Auth | Apple Sign-In (expo-apple-authentication) |
| Cloud | AWS (Cognito, DynamoDB, S3, Lambda, API Gateway) |
| Infrastructure | Terraform ~5.0 |
| Analytics | Firebase Analytics + Crashlytics |
| Testing | Jest 30, Testing Library |
| Build | EAS (Expo Application Services) |

---

## 2. Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     iOS App (Expo)                          │
│                                                             │
│  Screens ─── Hooks/Contexts ─── Services ─── API Clients   │
└────────────────────────┬────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
   ┌────────────┐ ┌───────────┐ ┌────────────┐
   │  Cognito   │ │  Lambda   │ │  DynamoDB   │
   │  Identity  │ │  (Auth)   │ │  + S3       │
   │  Pool      │ │           │ │             │
   └─────┬──────┘ └─────┬─────┘ └────────────┘
         │               │
         │    ┌──────────┘
         ▼    ▼
   ┌──────────────┐
   │ Temporary    │
   │ AWS Creds    │
   │ (1hr TTL)    │
   └──────────────┘
```

### Layered Architecture

```
┌─────────────────────────────────────────────────┐
│  Screens        MapScreen, CameraScreen,        │
│                 SignInScreen                     │
├─────────────────────────────────────────────────┤
│  Hooks          useUploadData, useVoting,        │
│  & Contexts     useAuth, useLocation, useCamera  │
├─────────────────────────────────────────────────┤
│  Services       auth, aws-credentials, upload,   │
│                 vote, media, sync, logging       │
├─────────────────────────────────────────────────┤
│  Repositories   local (AsyncStorage) +           │
│                 remote (DynamoDB/S3)             │
├─────────────────────────────────────────────────┤
│  API Clients    dynamodb.client, s3.client       │
│                 + retry logic                    │
├─────────────────────────────────────────────────┤
│  AWS            Cognito, DynamoDB, S3, Lambda    │
└─────────────────────────────────────────────────┘
```

### Key Architectural Decisions

**Offline-first dual-write.** All writes go to local storage first, then to AWS. If the remote write fails, items enter a sync queue and retry later. This ensures the app works without connectivity.

**Singleton services with factory getters.** Each service is instantiated lazily via `getXService()` functions (e.g., `getUploadService()`). This avoids circular imports and enables easy test resets via `resetXService()`.

**Repository pattern.** Data access is split into `local/` (AsyncStorage/filesystem) and `remote/` (DynamoDB/S3) implementations behind shared interfaces. Services compose both.

**Credential tiering.** AWS credentials come in two tiers: authenticated (full CRUD from Apple Sign-In) and guest (read-only for anonymous browsing). The `aws-credentials.service` manages this lifecycle and exposes `getCredentials()` (auto-fallback), `getAuthenticatedCredentials()` (strict), and `getReadOnlyCredentials()` (guest).

---

## 3. Directory Structure

```
unum/
├── App.tsx                        # Root component - providers + navigation
├── index.ts                       # Entry point
├── app.config.ts                  # Expo config (env-aware)
├── app.json                       # Expo manifest
├── package.json                   # Dependencies and scripts
├── tsconfig.json                  # TypeScript configuration
├── jest.config.js                 # Test configuration
├── eas.json                       # EAS build profiles
├── .env.development               # Dev environment variables
├── .env.production                # Prod environment variables
│
├── src/
│   ├── api/                       # AWS SDK clients and configuration
│   │   ├── clients/               # DynamoDB, S3, and retry logic
│   │   ├── config/                # AWS config loaded from expo-constants
│   │   └── types/                 # DynamoDB item types, API DTOs
│   │
│   ├── components/                # Reusable UI components
│   │   ├── FeedPanel.tsx          # Bottom sheet upload feed
│   │   ├── FeedCard.tsx           # Individual upload card
│   │   ├── VoteButtons.tsx        # Up/down vote controls
│   │   ├── MediaDisplay.tsx       # Photo/video renderer
│   │   ├── MarkerCallout.tsx      # Map marker popup
│   │   ├── ProfileDrawer.tsx      # Profile side drawer
│   │   ├── LockScreen.tsx         # Biometric lock overlay
│   │   ├── AppleSignInButton.tsx  # Apple auth button
│   │   └── ErrorBoundary.tsx      # Error boundary
│   │
│   ├── contexts/                  # React context providers
│   │   ├── AuthContext.tsx        # Auth state (wraps useAuth hook)
│   │   └── BFFContext.tsx         # BFF initialization + network + sync
│   │
│   ├── hooks/                     # Custom React hooks (business logic)
│   │   ├── useAuth.ts            # Apple Sign-In state management
│   │   ├── useUploadData.ts      # Upload fetching, creation, caching
│   │   ├── useVoting.ts          # Vote casting with auth enforcement
│   │   ├── useLocation.ts        # GPS with caching and permissions
│   │   ├── useCamera.ts          # Camera capture (photo/video)
│   │   ├── useMapState.ts        # Clustering and region filtering
│   │   ├── useMapSearch.ts       # Geocoding search
│   │   ├── useSync.ts            # Offline sync queue management
│   │   ├── useDownload.ts        # Media download with EXIF embedding
│   │   ├── useUserIdentity.ts    # Apple ID or device ID resolution
│   │   ├── useDeviceIdentity.ts  # Stable device UUID generation
│   │   ├── useBFFInit.ts         # Service bootstrapping
│   │   ├── useNetworkStatus.ts   # Connectivity monitoring
│   │   ├── useGestureCapture.ts  # Tap vs hold gesture detection
│   │   ├── useAppLock.ts         # Biometric lock state
│   │   ├── useLogger.ts          # Module-scoped logging
│   │   └── useAnalytics.ts       # Firebase event tracking
│   │
│   ├── navigation/                # React Navigation setup
│   │   ├── RootNavigator.tsx     # Stack navigator (Map, Camera, SignIn)
│   │   └── types.ts              # Navigation param types
│   │
│   ├── providers/                 # Data providers
│   │   └── UploadDataProvider.ts # Singleton upload cache + fetcher
│   │
│   ├── repositories/              # Data access layer
│   │   ├── interfaces/           # Repository contracts
│   │   ├── local/                # AsyncStorage + filesystem
│   │   └── remote/               # DynamoDB + S3
│   │
│   ├── screens/                   # Full-screen views
│   │   ├── MapScreen.tsx         # Map + feed (main screen)
│   │   ├── CameraScreen.tsx      # Capture photo/video
│   │   └── SignInScreen.tsx      # Apple Sign-In modal
│   │
│   ├── services/                  # Business logic services
│   │   ├── auth.service.ts               # Apple Sign-In orchestration
│   │   ├── auth-backend.service.ts       # Lambda session API client
│   │   ├── aws-credentials.service.ts    # Cognito credential lifecycle
│   │   ├── upload.service.ts             # Upload CRUD (local + remote)
│   │   ├── vote.service.ts              # Vote operations
│   │   ├── media.service.ts             # S3 upload/download + caching
│   │   ├── sync.service.ts             # Offline sync orchestrator
│   │   ├── logging.service.ts          # Crashlytics logging
│   │   ├── analytics.service.ts        # Firebase analytics
│   │   ├── biometric.service.ts        # Face ID / Touch ID
│   │   └── exif.service.ts             # EXIF metadata read/write
│   │
│   ├── shared/                    # Shared code
│   │   ├── constants/            # App-wide constants and feature flags
│   │   ├── types/                # Domain types (Upload, Vote, Auth)
│   │   └── utils/                # Utility functions
│   │       ├── clustering.ts     # Geospatial marker clustering
│   │       ├── coordinates.ts    # Lat/lon calculations
│   │       ├── dedup.ts          # Promise deduplication utility
│   │       ├── ranking.ts        # Time-decay content ranking
│   │       ├── storage.ts        # AsyncStorage/SecureStore helpers
│   │       └── votes.ts          # Vote aggregation helpers
│   │
│   └── __tests__/                 # Test utilities
│       ├── mocks/                # Shared test mocks
│       └── utils/                # Test helpers and factories
│
├── infrastructure/
│   ├── terraform/                # Infrastructure as Code
│   │   ├── main.tf              # DynamoDB table, S3 bucket, IAM
│   │   ├── cognito.tf           # Identity Pool + IAM roles
│   │   ├── auth-backend.tf      # Lambda + API Gateway
│   │   ├── variables.tf         # Terraform variables
│   │   ├── outputs.tf           # Terraform outputs
│   │   └── lambda/auth/         # Auth Lambda source code
│   └── scripts/                  # Seeding and data scripts
│
├── __mocks__/                     # Jest mock modules
│   ├── @aws-sdk/                 # AWS SDK mocks
│   ├── @react-native-firebase/  # Firebase mocks
│   ├── expo-*.js                # Expo module mocks
│   └── async-storage.js         # AsyncStorage mock
│
└── scripts/                       # Development scripts
    ├── seedUploads.ts            # Seed test data
    ├── simulateUpvotes.ts        # Simulate upvotes
    ├── simulateDownvotes.ts      # Simulate downvotes
    └── cleanupSeeds.ts           # Clean test data
```

---

## 4. AWS Infrastructure

All infrastructure is managed with Terraform in `infrastructure/terraform/`.

### Resource Inventory

| Resource | Name Pattern | File | Purpose |
|----------|-------------|------|---------|
| DynamoDB Table | `unum-{env}-data` | `main.tf` | All app data (uploads, votes, users, sessions) |
| S3 Bucket | `unum-{env}-media-{account}` | `main.tf` | Photo/video storage |
| Cognito Identity Pool | `unum-{env}-identity-pool` | `cognito.tf` | Temporary AWS credentials via Apple Sign-In |
| IAM Role (auth) | `unum-{env}-cognito-authenticated` | `cognito.tf` | Full DynamoDB + S3 access |
| IAM Role (guest) | `unum-{env}-cognito-unauthenticated` | `cognito.tf` | Read-only DynamoDB + S3 |
| Lambda | `unum-{env}-auth` | `auth-backend.tf` | Session management (Node.js 20) |
| API Gateway v2 | `unum-{env}-auth-api` | `auth-backend.tf` | HTTP API for auth endpoints |
| CloudWatch Logs | `/aws/api-gateway/...` | `auth-backend.tf` | API Gateway access logs (14-day retention) |

### DynamoDB Single-Table Design

One table stores all entities using composite primary keys:

| Entity | PK | SK | GSI1PK | GSI1SK |
|--------|----|----|--------|--------|
| Upload | `UPLOAD#<id>` | `METADATA` | `GEOHASH#<geohash6>` | `<timestamp>` |
| Vote | `UPLOAD#<uploadId>` | `VOTE#<userId>` | `USER#<userId>` | `VOTE#<uploadId>#<ts>` |
| User | `USER#<appleUserId>` | `PROFILE` | - | - |
| Session | `SESSION#<sessionId>` | `USER#<userId>` | `USER#<userId>` | `SESSION#<sessionId>` |
| Refresh Lookup | `REFRESH#<token>` | `REFRESH#<token>` | - | - |

**Indexes:**
- **Primary (PK + SK):** Point lookups for any entity
- **GSI1 (GSI1PK + GSI1SK):** Geohash range queries for uploads, user vote history, user sessions

**Table Features:**
- TTL enabled on `ttl` attribute (auto-expires sessions)
- Point-in-time recovery enabled in production
- PAY_PER_REQUEST billing (serverless)

### S3 Bucket

**Key Format:**
- Photos: `photos/YYYY/MM/DD/<uploadId>.jpg`
- Thumbnails: `thumbnails/YYYY/MM/DD/<uploadId>.jpg`
- Temp files: `temp/...` (auto-deleted after 1 day)

**Security:** All public access blocked. Access only via presigned URLs (1hr upload, 24hr download) or IAM credentials.

**Lifecycle:**
- Temp files deleted after 1 day
- Production: old versions archived to Glacier after 30 days, expired after 365 days
- Server-side encryption (AES256)
- Versioning enabled in production only

### Cognito Identity Pool

The identity pool provides temporary AWS credentials to the app:

- **Provider:** Apple Sign-In (`appleid.apple.com`)
- **Guest access:** Enabled (allows read-only browsing without sign-in)
- **Classic flow:** Disabled (enhanced auth flow only)
- **Authenticated role:** Full DynamoDB + S3 CRUD
- **Unauthenticated role:** Read-only DynamoDB + read-only S3

### Lambda Auth Backend

A Node.js 20 Lambda behind API Gateway v2 handles session management:

| Endpoint | Purpose |
|----------|---------|
| `POST /auth/apple` | Exchange Apple identity token for session + credentials |
| `POST /auth/refresh` | Refresh credentials using 30-day refresh token |
| `POST /auth/logout` | Invalidate session and delete tokens |

**Session model:** On initial auth, the Lambda creates a session item and a refresh token lookup item in DynamoDB. The refresh token has a 30-day TTL. When credentials expire (1 hour), the app calls `/auth/refresh` with the stored refresh token.

**STS fallback:** Apple identity tokens expire in ~10 minutes. After that, Cognito can't issue authenticated credentials. The Lambda works around this by using STS AssumeRole on the Cognito authenticated IAM role, since it has already verified the user via their refresh token.

**IAM permissions:** The Lambda role can read/write DynamoDB, call Cognito Identity operations, and assume the authenticated Cognito role via STS.

### Terraform Files

| File | Resources |
|------|-----------|
| `main.tf` | DynamoDB table, S3 bucket, IAM user (legacy) |
| `cognito.tf` | Identity Pool, authenticated + unauthenticated IAM roles |
| `auth-backend.tf` | Lambda function, API Gateway, Lambda IAM role |
| `variables.tf` | Configurable inputs (environment, region, billing mode) |
| `outputs.tf` | Resource ARNs, names, and auto-generated `.env` content |

---

## 5. Authentication System

### Auth Flow Diagram

```
User taps "Sign in with Apple"
         │
         ▼
┌─────────────────────┐
│ Apple Sign-In SDK   │── returns identityToken + user info
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ auth.service.ts     │── stores Apple user ID in SecureStore
│ signInWithApple()   │── stores identity token in SecureStore
└─────────┬───────────┘
          │
          ▼
┌──────────────────────────┐
│ aws-credentials.service  │
│ initializeWithAppleToken │
└─────────┬────────────────┘
          │
          ▼
┌──────────────────────────┐     ┌─────────────────────┐
│ auth-backend.service     │────▶│ Lambda /auth/apple   │
│ authenticateWithApple()  │     │                     │
└──────────────────────────┘     │ 1. Parse Apple JWT  │
                                 │ 2. Exchange w/Cognito│
                                 │ 3. Create session    │
                                 │ 4. Return creds +    │
                                 │    refresh token     │
                                 └─────────────────────┘
          │
          ▼
App stores refresh token (SecureStore)
App uses AWS credentials for DynamoDB/S3
```

### Session Lifecycle

```
Initial Auth          Credential Expiry (1hr)      Refresh Token Expiry (30d)
     │                        │                            │
     ▼                        ▼                            ▼
 Apple Sign-In ──▶ POST /auth/refresh ──▶ ... ──▶ POST /auth/refresh
                   (with refresh token)            returns REAUTH_REQUIRED
                         │                               │
                         ├─ Try Cognito w/ Apple token    ▼
                         │  (works if <10 min)        User must sign
                         │                            in with Apple
                         └─ STS AssumeRole fallback      again
                            (works until 30-day expiry)
```

### Credential Access Levels

The `aws-credentials.service` tracks credential state as a discriminated access level:

| State | Meaning | Capabilities |
|-------|---------|-------------|
| `not_initialized` | App just launched, no restoration attempted | None |
| `authenticated` | Valid credentials from Apple Sign-In or session refresh | Full read/write |
| `guest` | Unauthenticated Cognito credentials | Read-only |
| `expired` | All restoration paths failed | None (triggers re-auth) |

**Credential resolution strategy** (in `getCredentials()`):
1. Return cached credentials if valid (not within 5-minute expiration buffer)
2. Try auth backend refresh token (primary path, 30-day validity)
3. Try legacy stored Cognito identity ID
4. Fall back to unauthenticated (guest) credentials

**Write enforcement:** `getAuthenticatedCredentials()` throws `AuthenticationRequiredError` if only guest credentials are available. All DynamoDB write operations use `getWriteDocClient()` which calls this method.

### Storage Split

| Store | Data | Why |
|-------|------|-----|
| SecureStore (encrypted) | Apple user ID, Apple identity token, refresh token, session ID, Cognito identity ID | Sensitive auth tokens |
| AsyncStorage | User profile (name, email) | Non-sensitive, fast access |

---

## 6. Data Model

### DynamoDB Item Schemas

**Upload Item** (`src/api/types/index.ts` - `DynamoUploadItem`):

| Field | Type | Description |
|-------|------|------------|
| PK | `UPLOAD#<id>` | Partition key |
| SK | `METADATA` | Sort key |
| GSI1PK | `GEOHASH#<geohash6>` | For location queries (~1.2km cells) |
| GSI1SK | `<timestamp>` | For time-range queries |
| id | string | Upload UUID |
| type | `photo` \| `video` | Media type |
| mediaKey | string | S3 object key |
| latitude, longitude | number | GPS coordinates |
| geohash | string | Geohash for spatial indexing |
| timestamp | string | ISO creation time |
| caption | string? | Optional caption |
| voteCount | number? | Cached vote count |
| userId | string | Apple user ID |
| deviceId | string | Device identifier |

**Vote Item** (`DynamoVoteItem`):

| Field | Type | Description |
|-------|------|------------|
| PK | `UPLOAD#<uploadId>` | Groups votes with their upload |
| SK | `VOTE#<userId>` | One vote per user per upload |
| GSI1PK | `USER#<userId>` | Query all votes by a user |
| GSI1SK | `VOTE#<uploadId>#<ts>` | User's vote history |
| voteType | `up` \| `down` | Vote direction |

**User Item** (`DynamoUserItem`):

| Field | Type | Description |
|-------|------|------------|
| PK | `USER#<appleUserId>` | Apple user ID |
| SK | `PROFILE` | Fixed sort key |
| email | string? | May be Apple relay address |
| displayName | string? | From Apple profile |
| authProvider | `apple` | Always `apple` |

**Session Item** (Lambda-managed):

| Field | Type | Description |
|-------|------|------------|
| PK | `SESSION#<sessionId>` | Session identifier |
| SK | `USER#<userId>` | Owner |
| refreshToken | string | 30-day refresh token |
| cognitoIdentityId | string | Cognito identity for credential refresh |
| ttl | number | Unix timestamp for DynamoDB TTL |

### Access Patterns

| Pattern | Key Condition | Index |
|---------|--------------|-------|
| Get upload by ID | `PK = UPLOAD#<id>, SK = METADATA` | Primary |
| Get votes for upload | `PK = UPLOAD#<id>, SK begins_with VOTE#` | Primary |
| Get user's vote on upload | `PK = UPLOAD#<id>, SK = VOTE#<userId>` | Primary |
| Get uploads near location | `GSI1PK = GEOHASH#<prefix>` | GSI1 |
| Get all votes by user | `GSI1PK = USER#<userId>, GSI1SK begins_with VOTE#` | GSI1 |
| Get user profile | `PK = USER#<id>, SK = PROFILE` | Primary |
| Get session by refresh token | `PK = REFRESH#<token>` | Primary |

### S3 Object Structure

```
{bucket}/
├── photos/
│   └── YYYY/MM/DD/
│       └── <uploadId>.jpg
├── thumbnails/
│   └── YYYY/MM/DD/
│       └── <uploadId>.jpg
└── temp/
    └── ... (auto-deleted after 1 day)
```

### Offline Sync

Data operations follow an offline-first pattern:

1. **Write locally** (AsyncStorage) - always succeeds
2. **Write remotely** (DynamoDB/S3) - if `USE_AWS_BACKEND` enabled
3. **Queue on failure** - failed remote writes enter sync queue
4. **Retry later** - `sync.service` processes queue in batches of 10, every 30 seconds, with exponential backoff (max 3 retries)

---

## 7. Services Layer

### Service Inventory

| Service | File | Pattern | Responsibility |
|---------|------|---------|---------------|
| Auth | `auth.service.ts` | Functions | Apple Sign-In flow, profile storage |
| Auth Backend | `auth-backend.service.ts` | Singleton class | Lambda API client for refresh tokens |
| AWS Credentials | `aws-credentials.service.ts` | Singleton class | Cognito credential lifecycle management |
| Upload | `upload.service.ts` | Class factory | Upload CRUD with offline-first dual-write |
| Vote | `vote.service.ts` | Class factory | Vote operations with delta calculation |
| Media | `media.service.ts` | Class factory | S3 upload/download + local caching |
| Sync | `sync.service.ts` | Class factory | Offline queue processing |
| Logging | `logging.service.ts` | Singleton class | Firebase Crashlytics integration |
| Analytics | `analytics.service.ts` | Functions | Firebase Analytics events |
| Biometric | `biometric.service.ts` | Functions | Face ID / Touch ID |
| EXIF | `exif.service.ts` | Functions | Photo metadata read/write |

### Dependency Graph

```
auth.service ─────────────────┐
  │                           │
  ▼                           ▼
aws-credentials.service    dynamodb.client (upsertUser)
  │
  ├──▶ auth-backend.service ──▶ Lambda /auth/*
  │
  └──▶ Cognito SDK (GetId, GetCredentialsForIdentity)

upload.service ──▶ LocalUploadRepo + RemoteUploadRepo ──▶ dynamodb.client
vote.service   ──▶ LocalVoteRepo   + RemoteVoteRepo   ──▶ dynamodb.client
media.service  ──▶ LocalMediaRepo  + S3MediaRepo       ──▶ s3.client
                                                             │
sync.service ──▶ upload.service.syncPending()                │
             ──▶ vote.service.syncPending()                  │
                                                             ▼
                                              aws-credentials.service
                                              (provides credentials to all clients)
```

### Key Patterns

**Singleton factory:**
```typescript
let instance: AWSCredentialsService | null = null;
export function getAWSCredentialsService(): AWSCredentialsService {
  if (!instance) instance = new AWSCredentialsService();
  return instance;
}
export function resetAWSCredentialsService() { instance = null; }
```

**Promise deduplication** (`src/shared/utils/dedup.ts`):
Prevents concurrent identical async operations. Used for credential refresh, session refresh, and unauthenticated credential fetching. If a call is already in-flight, subsequent callers receive the same promise.

**Credential-tiered clients** (`src/api/clients/dynamodb.client.ts`):
Three cached DynamoDB clients for different access levels:
- `getDocClient()` - auto-refreshing credentials (for general reads)
- `getReadOnlyDocClient()` - unauthenticated credentials (for guest reads)
- `getWriteDocClient()` - strictly authenticated credentials (for writes)

**Retry with exponential backoff** (`src/api/clients/retry.ts`):
All AWS operations are wrapped with `withRetry()`. Retries on throttling and transient errors. Does not retry auth or validation errors. 3 attempts, 1-10 second backoff with jitter.

### Auth Services Chain

The three auth-related services form a chain:

1. **`auth.service.ts`** - Entry point. Calls Apple Sign-In SDK, stores user info, triggers AWS credential initialization.
2. **`aws-credentials.service.ts`** - Manages the full credential lifecycle. Calls auth-backend for refresh, Cognito for direct exchange, or falls back to guest.
3. **`auth-backend.service.ts`** - HTTP client for the Lambda. Handles `/auth/apple`, `/auth/refresh`, `/auth/logout`. Stores refresh token and session ID in SecureStore.

### Data Services Chain

1. **`upload.service.ts` / `vote.service.ts`** - Business logic with dual-write. Writes to local repository first, then remote if enabled.
2. **Repositories** - `local/` uses AsyncStorage, `remote/` uses DynamoDB/S3 clients.
3. **API Clients** - `dynamodb.client.ts` and `s3.client.ts` call AWS SDKs with retry logic.

---

## 8. Hooks & State Management

### Hook Inventory

**Authentication:**

| Hook | File | Purpose |
|------|------|---------|
| `useAuth` | `hooks/useAuth.ts` | Apple Sign-In state, credential revocation listener |
| `useUserIdentity` | `hooks/useUserIdentity.ts` | Resolves Apple ID (auth) or device ID (anon) |
| `useDeviceIdentity` | `hooks/useDeviceIdentity.ts` | Generates/persists stable device UUID |

**Data:**

| Hook | File | Purpose |
|------|------|---------|
| `useUploadData` | `hooks/useUploadData.ts` | Upload fetch/create/vote, composes identity + voting |
| `useVoting` | `hooks/useVoting.ts` | Vote casting with `AuthenticationRequiredError` handling |
| `useSync` | `hooks/useSync.ts` | Sync queue UI (progress, manual trigger, background control) |

**Map:**

| Hook | File | Purpose |
|------|------|---------|
| `useLocation` | `hooks/useLocation.ts` | GPS with caching, permission handling, periodic updates |
| `useMapState` | `hooks/useMapState.ts` | Clusters uploads by zoom level, filters by visible region |
| `useMapSearch` | `hooks/useMapSearch.ts` | Geocodes search text, animates map to result |

**Camera:**

| Hook | File | Purpose |
|------|------|---------|
| `useCamera` | `hooks/useCamera.ts` | Camera permissions, capture photo/video, zoom |
| `useGestureCapture` | `hooks/useGestureCapture.ts` | Discriminates tap (photo) vs hold (video) |

**Infrastructure:**

| Hook | File | Purpose |
|------|------|---------|
| `useBFFInit` | `hooks/useBFFInit.ts` | Bootstraps services, runs migrations |
| `useNetworkStatus` | `hooks/useNetworkStatus.ts` | Polls connectivity every 5 seconds |
| `useAppLock` | `hooks/useAppLock.ts` | Biometric lock state on app startup |
| `useDownload` | `hooks/useDownload.ts` | Download media to photo library with EXIF |

**Observability:**

| Hook | File | Purpose |
|------|------|---------|
| `useLogger` | `hooks/useLogger.ts` | Module-scoped Crashlytics logger |
| `useAnalytics` | `hooks/useAnalytics.ts` | Firebase event tracking, screen views |

### Data Flow

```
MapScreen
  │
  ├─ useUploadData()
  │    ├─ useUserIdentity()  ──▶ Apple ID or device ID
  │    ├─ useVoting()        ──▶ castVote/removeVote via DynamoDB
  │    └─ UploadDataProvider ──▶ fetch all uploads + S3 URLs + vote map
  │                               └─ rank by time-decay algorithm
  │
  ├─ useLocation()           ──▶ GPS coordinates + caching
  ├─ useMapState(uploads)    ──▶ clustering + region filtering
  └─ useMapSearch()          ──▶ geocoding search
```

### Context Providers

**AuthContext** (`src/contexts/AuthContext.tsx`):
Wraps the entire app. Provides `useAuthContext()`, `useIsAuthenticated()`, `useAuthUserId()`, and `useCanPost()` convenience hooks.

**BFFContext** (`src/contexts/BFFContext.tsx`):
Defined but not currently mounted in App.tsx. Intended to provide initialization state, network status, sync utilities, and feature flags globally.

### Key Patterns

**Request versioning** (`useUploadData.ts`): A `requestVersionRef` counter increments on each fetch. When a response arrives, it's only applied if its version matches the current counter. This prevents stale data from slow requests overwriting fresh data.

**Ref-based async safety**: Hooks like `useUserIdentity` expose both state values and refs (e.g., `userId` and `userIdRef`). Refs are used in async callbacks to avoid stale closures.

**Hook composition**: `useUploadData` composes `useUserIdentity` and `useVoting` internally, providing a single unified API to screens.

---

## 9. Screens & Navigation

### Navigation Stack

```
RootNavigator (native stack, headerless)
  ├── Map        ──  initial route (always mounted)
  ├── Camera     ──  fullScreenModal, slide_from_bottom
  └── SignIn     ──  modal, slide_from_bottom
```

Defined in `src/navigation/RootNavigator.tsx`.

### Provider Wrapper Order (App.tsx)

```
GestureHandlerRootView
  └── ErrorBoundary
      └── SafeAreaProvider
          └── AuthProvider
              └── NavigationContainer
                  └── RootNavigator
              └── LockScreen (overlay)
```

### Screens

**MapScreen** (`src/screens/MapScreen.tsx`) - Main screen:
- Interactive map with markers (individual pins at high zoom, clustered circles at low zoom)
- Bottom sheet feed panel with pull-to-refresh
- Profile drawer (left slide, authenticated only)
- Search modal (geocoding)
- Camera button (requires auth, navigates to Camera)
- Marker callouts with voting + download

**CameraScreen** (`src/screens/CameraScreen.tsx`) - Modal:
- Live camera view (front/back toggle)
- Tap to capture photo, hold to record video
- Slide while recording to zoom
- Preview state: retake, download, add caption, post
- Returns to map after posting

**SignInScreen** (`src/screens/SignInScreen.tsx`) - Modal:
- Apple Sign-In button
- Privacy note about email handling
- Cancel button
- Shown when auth is required for a write action

### User Flow

```
App Launch
  │
  ├─ Biometric lock? ──▶ LockScreen (Face ID / Touch ID)
  │
  ▼
MapScreen (browse map + feed)
  │
  ├─ Tap camera ──▶ Authenticated? ──No──▶ SignInScreen ──▶ CameraScreen
  │                       │
  │                      Yes
  │                       │
  │                       ▼
  │               CameraScreen ──▶ capture ──▶ preview ──▶ post ──▶ back to Map
  │
  ├─ Tap marker ──▶ MarkerCallout (vote, navigate, download)
  │
  ├─ Pull up feed ──▶ FeedPanel (vote, download)
  │
  └─ Tap profile ──▶ ProfileDrawer (biometric toggle, sign out)
```

---

## 10. Configuration & Environment

### Environment Files

| File | Committed | Purpose |
|------|-----------|---------|
| `.env.development` | Yes | Dev resource identifiers (no secrets) |
| `.env.production` | Generated by Terraform | Prod resource identifiers |
| `.env.example` | Yes | Template with all available options |
| `.env` | Fallback | Default values |

No secrets are stored in `.env` files. AWS credentials are obtained at runtime via Cognito.

### Configuration Pipeline

```
.env.{development|production}
         │
         ▼
    app.config.ts          (loads via dotenv, exposes as extra)
         │
         ▼
    expo-constants         (available at runtime)
         │
         ▼
    src/api/config/index.ts  (typed config objects)
    src/shared/constants/    (feature flags, UI constants)
```

### Feature Flags

| Flag | Default | Description |
|------|---------|------------|
| `USE_AWS_BACKEND` | `false` | Enable DynamoDB/S3 remote operations |
| `ENABLE_OFFLINE_SYNC` | `true` | Queue failed remote writes for retry |
| `ENABLE_BACKGROUND_SYNC` | `false` | Periodic background sync (30s interval) |
| `USE_TEST_DATA` | `true` (dev) | Include hardcoded test uploads in feed |
| `DEBUG` | `true` (dev) | Enable debug logging |

### Data Modes

Derived from feature flags in `src/shared/constants/index.ts`:

| Mode | When | Behavior |
|------|------|----------|
| `local-only` | `USE_AWS_BACKEND = false` | All data in AsyncStorage, no network |
| `dual-write` | Backend enabled + offline sync | Write local first, then remote; queue on failure |
| `remote-first` | Backend enabled, no offline sync | Prefer remote, cache locally |

### App Config Values

| Category | Key Values |
|----------|-----------|
| AWS | `region: us-east-1`, `cognitoIdentityPoolId`, `dynamoTable`, `s3Bucket` |
| Auth | `authApiUrl` (Lambda endpoint) |
| S3 | Upload URL expiry: 1hr, Download: 24hr, Max photo: 10MB, Max video: 100MB |
| DynamoDB | GSI1 for geohash queries, geohash precision 6 (~1.2km) |
| Retry | 3 max retries, 1-10s exponential backoff with jitter |
| Sync | 30s interval, 5s retry delay, batch size 10 |
| Credentials | 5-minute expiration buffer |

---

## 11. Testing

### Infrastructure

| Config | Purpose |
|--------|---------|
| `jest.config.js` | Jest 30 with node environment, custom transforms |
| `jest.setup.js` | Global test setup |
| `babel.config.test.js` | Separate Babel config (avoids reanimated plugin issues) |

### Test Locations

Tests live in `__tests__/` subdirectories next to their source:

```
src/services/__tests__/           # Service unit tests
src/hooks/__tests__/              # Hook tests
src/providers/__tests__/          # Provider tests
src/repositories/__tests__/       # Repository tests
src/shared/utils/__tests__/       # Utility function tests
src/__tests__/utils/              # Test helpers and factories
```

### Mock Strategy

All native modules and AWS SDKs are mocked at `__mocks__/`:

| Mock | Module |
|------|--------|
| `expo-constants.js` | Expo config values |
| `expo-secure-store.js` | Encrypted storage |
| `expo-apple-authentication.js` | Apple Sign-In |
| `expo-camera.js` | Camera API |
| `expo-location.js` | Geolocation |
| `expo-crypto.js` | Crypto |
| `async-storage.js` | AsyncStorage |
| `react-native-reanimated.js` | Animations |
| `@aws-sdk/client-cognito-identity.js` | Cognito SDK |
| `@react-native-firebase/crashlytics.js` | Crashlytics |
| `@react-native-firebase/analytics.js` | Analytics |

Module mappings are configured in `jest.config.js` `moduleNameMapper`.

### Test Helpers

`src/__tests__/utils/testUtils.ts` provides factory functions:
- `mockAWSCredentials()` / `mockExpiredAWSCredentials()` / `mockSoonExpiringAWSCredentials()`
- `mockAuthUser()` / `mockAppleCredential()`
- `mockCognitoCredentialsResponse()` / `mockAuthBackendSession()`

### Commands

```bash
npm test              # Run all tests once
npm run test:watch    # Run in watch mode
npm run test:coverage # Generate coverage report
npx jest --no-coverage  # Fast run without coverage
```

---

## 12. Development Setup

### Prerequisites

- Node.js (check `.nvmrc` if present, or use latest LTS)
- Expo CLI: `npm install -g expo-cli` (or use `npx expo`)
- iOS Simulator (via Xcode) for local development
- AWS CLI configured (for infrastructure/seeding scripts)
- Terraform >= 1.0 (for infrastructure changes)

### Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env.development
   # Edit .env.development with your Cognito pool ID, table name, etc.
   # Or use existing checked-in .env.development
   ```

3. **Start the development server:**
   ```bash
   npx expo start
   ```

4. **Run on iOS simulator:**
   ```bash
   npx expo run:ios
   ```

### Running Tests

```bash
npm test                    # All tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage report
npx jest path/to/test.ts   # Single file
```

### Seeding Data

```bash
npm run seed                # Create test uploads in DynamoDB
npm run seed:upvotes        # Simulate upvotes
npm run seed:downvotes      # Simulate downvotes
npm run seed:cleanup        # Remove seed data
```

### Infrastructure

```bash
cd infrastructure/terraform

# Initialize
terraform init

# Plan changes
terraform plan -var="environment=dev"

# Apply changes
terraform apply -var="environment=dev"

# After apply, update .env with outputs:
terraform output -json
```

### Key Environment Variables

| Variable | Example | Description |
|----------|---------|------------|
| `APP_ENV` | `development` | Environment name |
| `AWS_REGION` | `us-east-1` | AWS region |
| `COGNITO_IDENTITY_POOL_ID` | `us-east-1:abc...` | Cognito pool ID (from Terraform output) |
| `DYNAMO_TABLE` | `unum-dev-data` | DynamoDB table name |
| `S3_BUCKET` | `unum-dev-media-123` | S3 bucket name |
| `AUTH_API_URL` | `https://xxx.execute-api...` | Lambda auth endpoint |
| `USE_AWS_BACKEND` | `true` | Enable remote operations |
