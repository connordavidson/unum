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
13. [Content Moderation](#13-content-moderation-apple-guideline-12)
14. [Account Deletion](#14-account-deletion-apple-guideline-511v)
15. [Legal Pages](#15-legal-pages)
16. [App Store Submission Configuration](#16-app-store-submission-configuration)
17. [Geospatial Clustering](#17-geospatial-clustering)
18. [Feed Data Refresh Architecture](#18-feed-data-refresh-architecture)

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
│   │   ├── ReportModal.tsx        # Report reason picker modal
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
│   │   ├── SignInScreen.tsx      # Apple Sign-In modal
│   │   ├── PrivacyPolicyScreen.tsx # Privacy Policy page
│   │   └── TermsOfServiceScreen.tsx # Terms of Service / EULA page
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
│   │   ├── exif.service.ts             # EXIF metadata read/write
│   │   ├── moderation.service.ts       # AWS Rekognition content moderation
│   │   ├── block.service.ts            # User blocking CRUD
│   │   └── account.service.ts          # Account deletion
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

**STS fallback (critical for 15+ minute background scenarios):** Apple identity tokens expire in ~10 minutes. After that, Cognito can't issue authenticated credentials directly. The Lambda works around this by:

1. First trying Cognito with the stored Apple token (works if <10 min since sign-in)
2. If that fails, using STS AssumeRole on the Cognito authenticated IAM role

The STS fallback is authorized because the Lambda has already verified the user via their valid refresh token. This is why the IAM trust policy configuration (see "Manual IAM Configuration" section below) is critical—without it, the STS call fails and users get `REAUTH_REQUIRED` errors.

**Lambda environment variables:**

| Variable | Value | Purpose |
|----------|-------|---------|
| `DYNAMO_TABLE` | `unum-{env}-data` | DynamoDB table for sessions |
| `COGNITO_IDENTITY_POOL_ID` | `us-east-1:...` | Cognito pool for direct auth |
| `AUTHENTICATED_ROLE_ARN` | `arn:aws:iam::...` | Role to assume via STS |
| `APPLE_BUNDLE_ID` | `com.unum.app` | For Apple token validation |
| `SESSION_TTL_DAYS` | `30` | Refresh token lifetime |

**IAM permissions:** The Lambda role needs:
- DynamoDB read/write (session storage)
- Cognito Identity operations (GetId, GetCredentialsForIdentity)
- `sts:AssumeRole` on the Cognito authenticated role (for STS fallback)

### Terraform Files

| File | Resources |
|------|-----------|
| `main.tf` | DynamoDB table, S3 bucket, IAM user (legacy) |
| `cognito.tf` | Identity Pool, authenticated + unauthenticated IAM roles |
| `auth-backend.tf` | Lambda function, API Gateway, Lambda IAM role |
| `variables.tf` | Configurable inputs (environment, region, billing mode) |
| `outputs.tf` | Resource ARNs, names, and auto-generated `.env` content |

### Manual IAM Configuration (Required)

Terraform manages the base infrastructure, but some IAM configurations must be manually verified/added in the AWS Console. This is because the Lambda and Cognito roles may be created separately or have different naming conventions.

#### Why Manual Setup is Needed

The credential refresh flow requires:
1. **Lambda** calls `sts:AssumeRole` on the Cognito authenticated role
2. **Cognito authenticated role** must trust the Lambda role

If these aren't configured, users will get `REAUTH_REQUIRED` errors after ~15 minutes when the Apple identity token expires and the STS fallback fails.

#### Step 1: Find Your Role ARNs

```bash
# Get Lambda role ARN
aws lambda get-function-configuration --function-name unum-backend-{env} --query "Role" --output text

# Example output: arn:aws:iam::123456789:role/service-role/unum-backend-prod-role-abc123
```

The Cognito authenticated role is typically named `unum-{env}-authenticated-role` or `Cognito_{poolname}Auth_Role`.

#### Step 2: Update Cognito Authenticated Role Trust Policy

1. **IAM** → **Roles** → find your Cognito authenticated role
2. Click **Trust relationships** tab
3. Click **Edit trust policy**
4. Add this statement to the `Statement` array:

```json
{
  "Effect": "Allow",
  "Principal": {
    "AWS": "<Lambda role ARN from Step 1>"
  },
  "Action": "sts:AssumeRole"
}
```

This allows the Lambda to assume the Cognito role and issue credentials on behalf of authenticated users.

#### Step 3: Update Lambda Role Permissions Policy

1. **IAM** → **Roles** → find your Lambda role (from Step 1)
2. Click on the **permissions policy** (not trust policy)
3. Click **Edit** → **JSON**
4. Add these statements to the `Statement` array:

```json
{
  "Sid": "STSAssumeAuthenticatedRole",
  "Effect": "Allow",
  "Action": "sts:AssumeRole",
  "Resource": "<Cognito authenticated role ARN>"
},
{
  "Sid": "RekognitionAccess",
  "Effect": "Allow",
  "Action": "rekognition:DetectModerationLabels",
  "Resource": "*"
}
```

#### Step 4: Add Rekognition to Cognito Authenticated Role

The Cognito authenticated role also needs Rekognition permission for content moderation:

1. **IAM** → **Roles** → find your Cognito authenticated role
2. Click on the **permissions policy**
3. Click **Edit** → **JSON**
4. Add this statement:

```json
{
  "Sid": "RekognitionAccess",
  "Effect": "Allow",
  "Action": "rekognition:DetectModerationLabels",
  "Resource": "*"
}
```

#### Complete IAM Setup Checklist

| Role | Permission | Purpose |
|------|------------|---------|
| Lambda role | `sts:AssumeRole` on Cognito auth role | Issue credentials when Apple token expires |
| Lambda role | `rekognition:DetectModerationLabels` | Content moderation (optional, for Lambda-side moderation) |
| Cognito auth role | Trust Lambda role | Allow Lambda to assume role |
| Cognito auth role | `rekognition:DetectModerationLabels` | Content moderation from app |
| Cognito auth role | DynamoDB read/write | App data operations |
| Cognito auth role | S3 read/write | Media upload/download |

#### Verifying the Setup

After configuration, test the full auth flow:

1. Sign in with Apple
2. Upload a photo (should succeed)
3. Background the app for 15+ minutes
4. Open the app and upload again

If uploads fail with "session expired" after backgrounding, check CloudWatch logs for the Lambda to see which step is failing.

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
2. If `authenticated` but expired, refresh via auth backend refresh token (deduped)
3. If `not_initialized`, attempt full restoration (auth backend → legacy Cognito → guest)
4. Fall back to unauthenticated (guest) credentials

**Write enforcement:** `getAuthenticatedCredentials()` throws `AuthenticationRequiredError` if only guest credentials are available. All DynamoDB write operations use `getWriteDocClient()` which calls this method. All S3 write operations (upload, delete) use `getWriteS3Client()` which also calls this method. If credentials are `authenticated` but expired, it first attempts to refresh via the auth backend before throwing.

**Pre-upload credential validation:** Before attempting S3 uploads, `media.service.ts` calls `waitForAuthenticated()` to ensure credentials are valid. This method waits for any ongoing restoration, attempts refresh if needed, and returns `false` if the user must re-authenticate. This prevents wasted upload attempts with expired credentials.

**Proactive foreground refresh:** `useAuth` listens for AppState `active` transitions. When the app comes to foreground, if the user has authenticated credentials that have expired, it proactively calls `getCredentials()` to refresh them in the background. This ensures credentials are ready before the user attempts a write operation.

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
| voteCount | number? | Cached vote count (persisted by castVote/removeVote after computing from vote items) |
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
| `useMapState` | `hooks/useMapState.ts` | Clusters all uploads once, derives zoom-based marker visibility |
| `useMapSearch` | `hooks/useMapSearch.ts` | Geocodes search text, animates map to result, accepts `onSearchSuccess` callback |
| `useSavedCities` | `hooks/useSavedCities.ts` | Recent searches (max 10) + favorite city (AsyncStorage) |

**Camera:**

| Hook | File | Purpose |
|------|------|---------|
| `useCamera` | `hooks/useCamera.ts` | Camera permissions, capture photo/video, zoom, recording lock |
| `useGestureCapture` | `hooks/useGestureCapture.ts` | Discriminates tap (photo) vs hold (video) |

**Infrastructure:**

| Hook | File | Purpose |
|------|------|---------|
| `useBFFInit` | `hooks/useBFFInit.ts` | Bootstraps services, runs migrations |
| `useNetworkStatus` | `hooks/useNetworkStatus.ts` | Polls connectivity every 5 seconds |
| `useAppLock` | `hooks/useAppLock.ts` | Biometric lock state on app startup |
| `useDownload` | `hooks/useDownload.ts` | Download media to photo library with EXIF |
| `useEulaAcceptance` | `hooks/useEulaAcceptance.ts` | EULA acceptance tracking (AsyncStorage) |

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
  ├─ useSavedCities()        ──▶ recent searches + favorite city (AsyncStorage)
  ├─ useMapState(uploads)    ──▶ clustering + zoom-based visibility flags
  └─ useMapSearch()          ──▶ geocoding search + navigateToCity
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
  ├── Map             ──  initial route (always mounted)
  ├── Camera          ──  fullScreenModal, slide_from_bottom
  ├── SignIn          ──  modal, slide_from_bottom
  ├── PrivacyPolicy   ──  modal, slide_from_bottom
  └── TermsOfService  ──  modal, slide_from_bottom
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
- Search modal with recent searches and favorite city starring
- Camera button (requires auth, navigates to Camera)
- Marker callouts with voting + download
- Initial position: favorite city (if set) → GPS → default center

**CameraScreen** (`src/screens/CameraScreen.tsx`) - Modal:
- Live camera view (front/back toggle)
- Tap to capture photo, hold to record video
- Slide up while recording to zoom
- Slide right while recording to lock (recording continues after lifting finger)
- When locked, slide anywhere on screen to zoom, tap capture button to stop
- Lock icon indicator shown to the right of capture button during recording
- Video preview plays full video on loop (via `replaceAsync` + `play`)
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

### Switching Between Dev and Prod Locally

To test with production AWS resources on your local machine:

```bash
# Run with production environment
APP_ENV=production npx expo start

# Run with development environment (default)
APP_ENV=development npx expo start
# or just:
npx expo start
```

**Important:** Before switching environments:
1. Delete the app from simulator/device to clear cached credentials
2. Or sign out first to avoid mixing dev/prod auth state

**What changes between environments:**

| Resource | Dev | Prod |
|----------|-----|------|
| Cognito Pool | `us-east-1:97c8dfa9-...` | `us-east-1:341a0a8b-...` |
| DynamoDB | `unum-dev` | `unum-prod` |
| S3 Bucket | `unum-media-dev-7x4k2` | `unum-media-prod` |
| Auth API | `qj9x18vc59.execute-api...` | `xsxqd5icsg.execute-api...` |
| Lambda | `unum-backend-dev` | `unum-backend-prod` |

---

## 13. Content Moderation (Apple Guideline 1.2)

Apple requires all apps with user-generated content to provide content filtering, reporting, and user blocking.

### Automated Moderation (AWS Rekognition)

**Service:** `src/services/moderation.service.ts`

All uploads are automatically screened before being stored. The moderation pipeline:

1. User captures media in CameraScreen
2. Before S3 upload, `getModerationService().moderate(localPath, mediaType)` is called
3. For photos: reads file as base64, sends to `DetectModerationLabels`
4. For videos: extracts a thumbnail at 1 second via `expo-video-thumbnails`, then moderates the thumbnail
5. If any blocked category is detected at ≥75% confidence, the upload is rejected with an error message
6. If Rekognition is unavailable (service error), the upload is allowed through (graceful degradation)

**Blocked Categories:**
- Explicit Nudity, Non-Explicit Nudity of Intimate parts and Kissing on the Lips
- Suggestive
- Violence, Visually Disturbing
- Drugs, Tobacco, Alcohol
- Gambling, Hate Symbols

**Infrastructure:** Cognito authenticated IAM role has `rekognition:DetectModerationLabels` permission (added in `cognito.tf`).

**Dependencies:** `@aws-sdk/client-rekognition`, `expo-video-thumbnails`

### Reporting System

**DynamoDB Schema:**

| Entity | PK | SK |
|--------|----|----|
| Report | `UPLOAD#<uploadId>` | `REPORT#<userId>` |

Upload items now include `reportCount` (number) and `hidden` (boolean) fields.

**Operations** (`src/api/clients/dynamodb.client.ts`):
- `createReport(uploadId, reporterId, reason, details?)` — Creates report item, increments `reportCount` on the upload. Auto-sets `hidden: true` when `reportCount >= 3`.
- `hasUserReported(uploadId, userId)` — Checks if user already reported a post (prevents duplicate reports).

**UI:** `src/components/ReportModal.tsx` — Modal with reason picker (Inappropriate, Spam, Harassment, Other), optional details text input, and Block User option. Report flag icon added to `FeedCard.tsx` and `MarkerCallout.tsx`.

**Feed Filtering:** `UploadDataProvider.fetchFromAWS()` filters out uploads where `hidden === true`.

### User Blocking

**DynamoDB Schema:**

| Entity | PK | SK |
|--------|----|----|
| Block | `USER#<userId>` | `BLOCK#<blockedUserId>` |

**Service:** `src/services/block.service.ts` — Cached blocked user IDs with `blockUser()`, `unblockUser()`, `getBlockedUserIds()`, `isBlocked()`.

**DynamoDB Operations** (`src/api/clients/dynamodb.client.ts`):
- `blockUser(userId, blockedUserId)` — PutItem
- `unblockUser(userId, blockedUserId)` — DeleteItem
- `getBlockedUserIds(userId)` — Query `PK = USER#<id>`, `SK begins_with BLOCK#`, returns `Set<string>`

**Feed Integration:** `UploadDataProvider.fetchFromAWS()` fetches blocked user IDs in parallel with uploads and votes, then filters out blocked users' content.

---

## 14. Account Deletion (Apple Guideline 5.1.1(v))

Apple requires apps that support account creation to also support account deletion.

**Service:** `src/services/account.service.ts`

`deleteAccount(userId)` performs a complete data wipe in this order:

1. **Find user uploads** — Scans all uploads, filters by `userId`
2. **Delete each upload's data** — S3 media files, associated vote items, upload record
3. **Delete user's votes** — Fetches user's vote map via GSI, batch deletes all vote items
4. **Delete user profile** — Deletes `USER#<userId>/PROFILE` record
5. **Clear AsyncStorage** — All local cached data
6. **Clear SecureStore** — Auth tokens (`unum_refresh_token`, `unum_cognito_identity_id`, `unum_apple_user_id`, `unum_biometric_enabled`)
7. **Clear media cache** — Local media files
8. **Clear AWS credentials** — Cached credential state

**UI:** Delete Account button in `ProfileDrawer.tsx` footer with two-step confirmation Alert. Shows loading state during deletion. Calls `onSignOut()` on completion.

---

## 15. Legal Pages

### Privacy Policy
**Screen:** `src/screens/PrivacyPolicyScreen.tsx`

Covers: data collected (Apple ID, location, photos/videos), storage (AWS), content moderation (Rekognition), third-party services (Apple Sign-In, AWS, Google Maps, Firebase), data sharing policy, data retention and deletion, children's privacy (17+), user rights, contact info.

### Terms of Service / EULA
**Screen:** `src/screens/TermsOfServiceScreen.tsx`

Covers: acceptable use, prohibited content (explicit, violent, harassment, spam), account and authentication, content ownership and license, content moderation, user conduct, account termination, EULA (references Apple Standard EULA), privacy, limitation of liability, contact info.

### EULA Acceptance Gate
**Hook:** `src/hooks/useEulaAcceptance.ts`

Stores acceptance flag in AsyncStorage (`unum_eula_accepted_v1`). The EULA gate is checked in `CameraScreen.tsx` before both immediate and delayed uploads. If not accepted, shows an Alert with options to view terms or accept directly.

### Navigation
Both legal screens are registered as modal screens in `RootNavigator.tsx` with `slide_from_bottom` animation. Navigation type definitions updated in `src/navigation/types.ts`.

### Integration Points
- **ProfileDrawer** — Privacy Policy and Terms of Service links in menu
- **SignInScreen** — "By signing in, you agree to our Terms of Service and Privacy Policy" text with tappable links
- **CameraScreen** — EULA acceptance gate before upload

---

## 16. App Store Submission Configuration

### Privacy Manifest

**File:** `app.json` > `expo.ios.privacyManifests`

Apple requires a privacy manifest (`PrivacyInfo.xcprivacy`) declaring what data the app collects and which system APIs it accesses. Since the `/ios` directory is gitignored and regenerated by `expo prebuild`, the privacy manifest is configured through `app.json` using the `ios.privacyManifests` key.

**Required Reason APIs declared:**
- `NSPrivacyAccessedAPICategoryUserDefaults` — AsyncStorage, SecureStore, user preferences
- `NSPrivacyAccessedAPICategoryFileTimestamp` — File system operations for media caching
- `NSPrivacyAccessedAPICategoryDiskSpace` — Storage availability checks
- `NSPrivacyAccessedAPICategorySystemBootTime` — React Native internals

**Collected Data Types declared:**

| Data Type | Linked to User | Purpose |
|-----------|---------------|---------|
| User ID (Apple Sign-In) | Yes | App Functionality |
| Email Address (optional) | Yes | App Functionality |
| Name (optional) | Yes | App Functionality |
| Precise Location | Yes | App Functionality |
| Photos or Videos | Yes | App Functionality |
| Crash Data (Firebase Crashlytics) | No | Analytics |
| Performance Data (Firebase) | No | Analytics |
| Product Interaction (Firebase Analytics) | No | Analytics |

`NSPrivacyTracking` is set to `false` — the app does not track users across apps or websites for advertising.

### Permission Descriptions

All iOS permission strings are set in `app.json` > `expo.ios.infoPlist`:

| Permission | Key | Description |
|-----------|-----|-------------|
| Camera | `NSCameraUsageDescription` | Capture photos and videos for sharing |
| Microphone | `NSMicrophoneUsageDescription` | Record video with audio |
| Location (When In Use) | `NSLocationWhenInUseUsageDescription` | Show nearby content and tag uploads |
| Photo Library | `NSPhotoLibraryUsageDescription` | Save captured media |
| Face ID | `NSFaceIDUsageDescription` | Biometric app lock |

The `expo-location` plugin uses `locationWhenInUsePermission` (foreground only). The app does not request "Always" location access.

### EAS Build & Submit

**File:** `eas.json`

Build profiles:
- `development` — Simulator, internal distribution, development env
- `preview` — Internal distribution, development env
- `preview-prod` — Internal distribution, production env
- `production` — App Store distribution, production env, auto-increment versions

Submit configuration requires:
- `appleId` — Apple ID email for App Store Connect
- `ascAppId` — Numeric app ID from App Store Connect
- `appleTeamId` — Already configured (`T4LY8DN565`)

### App Store Connect Requirements

- **Age rating:** 17+ (user-generated content with automated moderation)
- **Category:** Social Networking or Photo & Video
- **Privacy policy URL:** Must be publicly accessible (not just in-app)
- **Privacy nutrition labels:** Must match `NSPrivacyCollectedDataTypes` in privacy manifest
- **Review notes:** Document Apple Sign-In auth, Rekognition moderation, reporting/blocking, account deletion

---

## 17. Geospatial Clustering

**File:** `src/shared/utils/clustering.ts`

The clustering algorithm groups nearby map uploads into visual clusters (circles for large groups, numbered markers for small groups, individual pins for isolated uploads).

### Algorithm Overview

Uses grid-based spatial indexing with BFS (breadth-first search) expansion for transitive clustering:

1. **Build spatial grid** — Divide the map into grid cells sized to `THRESHOLD_METERS` (2000m). Each upload is placed into its cell. O(n) to build.
2. **BFS expansion** — For each unvisited upload, start a BFS queue. Find all unvisited neighbors within 2000m (checking only adjacent grid cells for efficiency). Enqueue each neighbor and continue until the queue is empty. All transitively connected uploads form one cluster.
3. **Categorize** — Clusters with >= `MIN_FOR_CIRCLE` (4) uploads become large clusters (rendered as red circles). Clusters with 2-3 uploads become small clusters (numbered markers). Single uploads remain unclustered (individual pins).
4. **Post-merge overlapping circles** — After clustering, large clusters whose rendered circles overlap are merged using union-find with path compression. This handles the edge case where two clusters have no 2000m path between them but their visual circles still overlap on the map.

### Key Functions

| Function | Purpose |
|----------|---------|
| `clusterUploads(uploads)` | Main entry point. Returns `{ largeClusters, smallClusters, unclustered }` |
| `generateClusterId(uploads)` | Deterministic cluster ID from sorted member upload IDs (FNV-1a hash) |
| `getDistanceMeters(coord1, coord2)` | Haversine distance between two coordinates in meters |
| `calculateCenter(uploads)` | Arithmetic mean of upload coordinates |
| `calculateRadius(uploads, center)` | Max distance from center to any upload + padding |
| `mergeOverlappingClusters(clusters)` | Union-find merge of clusters with overlapping circles |
| `buildSpatialIndex(uploads, cellSize)` | Grid-based spatial index for O(1) neighbor cell lookup |
| `findNearbyUploads(upload, grid, ...)` | Finds unvisited uploads within threshold in adjacent grid cells |

### Configuration

Constants in `src/shared/constants/index.ts` under `CLUSTER_CONFIG`:

| Constant | Value | Purpose |
|----------|-------|---------|
| `THRESHOLD_METERS` | 2000 | Max distance between neighbors for BFS expansion |
| `MIN_FOR_CIRCLE` | 4 | Minimum uploads to render as a circle |
| `RADIUS_PADDING` | 200 | Extra meters added to cluster circle radius |

### Performance

- Spatial grid build: O(n)
- BFS expansion: O(n) total across all clusters (each upload visited once)
- Neighbor lookup: O(k) per upload where k = uploads in adjacent cells (typically small)
- Overlap merge: O(m^2) where m = number of large clusters (typically < 20)

### Cluster Identity

Each cluster gets a deterministic `id` derived from its sorted member upload IDs using FNV-1a hashing (`generateClusterId()`). This ensures:
- Same uploads always produce the same cluster ID
- Order-independent (sorted before hashing)
- Stable React keys for `Circle` and `Marker` components

### Visual Rendering

The clustering results are consumed by `useMapState` hook which passes them to `MapScreen`. Marker visibility is controlled by zoom level:

| Zoom Level | What Renders |
|-----------|--------------|
| < 8 | Large cluster circles only |
| 8–10 | Large cluster circles + small cluster markers + unclustered markers |
| ≥ 11 | All individual pin markers + large cluster circles |

| Result Type | Map Rendering | Zoom Condition |
|-------------|---------------|----------------|
| `largeClusters` | Red semi-transparent circle (`zIndex: 1`) | Always rendered |
| `smallClusters` | Marker at cluster center | `!showIndividualMarkers && showUnclusteredMarkers` |
| `unclustered` | Individual pin markers | `!showIndividualMarkers && showUnclusteredMarkers` |

**Circle key strategy:** Circle components use `key={cluster.id}-z${zoomLevel}` to force native MKCircle overlay re-creation on zoom changes. This prevents an iOS rendering bug where Circle overlays get stuck invisible after zoom animations.

**Zoom thresholds** (in `MAP_CONFIG`):
- `ZOOM_THRESHOLD: 11` — individual pins appear (~20km view)
- `UNCLUSTERED_MIN_ZOOM: 8` — unclustered/small cluster markers appear (~140km view)

## 18. Feed Data Refresh Architecture

### Data Flow

Upload data flows through a layered pipeline:

1. **`UploadDataProvider`** (`src/providers/UploadDataProvider.ts`) — Singleton that fetches from DynamoDB, resolves media URLs, applies ranking, and caches results (60s TTL). `getAll()` returns all uploads.
2. **`useUploadData`** (`src/hooks/useUploadData.ts`) — React hook wrapping the provider. Exposes `refreshUploads()` (no bbox parameter) which calls `provider.getAll()` and sets `uploads` state. Also exposes `invalidateCache()` to force the next `refreshUploads()` to bypass cache. Uses request versioning to prevent stale responses from overwriting fresh data.
3. **`useMapState`** (`src/hooks/useMapState.ts`) — Clusters ALL `uploads` once (stable across zoom/pan). Clusters are passed to the map unfiltered — `MapView` clips markers outside the viewport natively. Derives `visibleUploads` by filtering `uploads` to the current `region` (used by the feed panel only). Computes `zoomLevel` and marker visibility flags (`showIndividualMarkers`, `showUnclusteredMarkers`).
4. **`MapScreen`** (`src/screens/MapScreen.tsx`) — Passes `visibleUploads` to `FeedPanel`. Circle keys include `zoomLevel` to force native overlay re-creation on zoom. Uses both `onRegionChangeComplete` and `onRegionChange` (throttled to zoom-level changes) for reliable region tracking on iOS.

### When Data Refreshes

| Trigger | Mechanism | Effect |
|---------|-----------|--------|
| Screen gains focus | `useFocusEffect` → `refreshUploads()` | Cache hit: same ref, React no-op. Cache miss: fresh fetch. |
| Map pan/zoom | `onRegionChangeComplete` + `onRegionChange` (zoom-throttled) → `handleRegionChange` | Region updates only. No data fetch. Feed re-filters `visibleUploads`; Circle keys update for native re-creation. |
| Pull-to-refresh | `invalidateCache()` → `refreshUploads()` | Forces fresh fetch from DynamoDB. |
| After blocking a user | `invalidateCache()` → `refreshUploads()` | Forces fresh fetch, blocked user's uploads excluded. |
| After creating an upload | `provider.invalidate()` | Cache expires, next `refreshUploads()` re-fetches. |

### Key Design Decisions

- **Map pan/zoom does NOT trigger data fetches.** `handleMapRegionChange` only updates the region state. `visibleUploads` (for the feed panel) re-filters, but cluster data is unaffected. This prevents cluster circles from moving or duplicating on zoom.
- **`getAll()` returns the same array reference on cache hit.** `setUploads(sameRef)` is a React no-op (`Object.is` check), so no re-render and no reclustering occurs. Clusters remain stable until the underlying data actually changes.
- **Clusters are NOT filtered by viewport.** `useMapState` clusters ALL `uploads` in a single `useMemo` and passes the full result to `MapScreen`. The `MapView` natively clips Circle and Marker components outside the visible area.
- **Circle keys include `zoomLevel` for native overlay re-creation.** On iOS, `Circle` (MKCircle) overlays can get stuck invisible after zoom animations. Including `zoomLevel` in the React key (`key={cluster.id}-z${zoomLevel}`) forces the native overlay to be destroyed and recreated on each zoom level change, preventing this rendering bug.
- **Dual region tracking for reliable zoom state.** `onRegionChangeComplete` is the primary region tracker, but it can be unreliable on iOS (may not fire after certain gestures). `onRegionChange` serves as a fallback, throttled to only update state when the integer zoom level changes. This keeps `showIndividualMarkers` and Circle keys accurate.
- **Cluster IDs are deterministic.** Each cluster gets an `id` derived from its member upload IDs using FNV-1a hashing. This ensures stable identity across re-renders when the underlying data hasn't changed.
- **`useFocusEffect` does NOT depend on GPS position.** GPS polling (60s) updates the blue dot on the map but does not trigger data refreshes.
- **`refreshUploads` callback is stable across auth state changes.** It reads `userIdRef.current` (a ref) instead of depending on `userId` state. This prevents auth initialization (`undefined` → `deviceId` → `appleUserId`) from triggering `useFocusEffect`.
- **Failed AWS fetches return stale cache, not empty arrays.** `UploadDataProvider.getAll()` only caches successful fetches. On failure, it returns the previous cached data as a fallback.
- **Media URL failures fall back to `mediaKey`.** If `getDisplayUrl()` throws or returns empty, the raw S3 key is used instead of filtering out the upload.
- **Favorite city overrides GPS for initial map position.** `MapScreen` computes `initialPosition` as: favorite city (if set) → GPS position → default center. `savedCitiesLoading` is checked first so favorite city can take priority over GPS. If a favorite city is set, the loading screen is skipped once saved cities load (no need to wait for GPS).

---

## 19. Saved City Feature

### Overview

Users can star a previously searched city as their "favorite." When a favorite is set, the map auto-centers on that city when the app opens, instead of using GPS.

### Storage

| Key | Type | Contents |
|-----|------|----------|
| `unum_recent_searches` | `SavedCity[]` | Up to 10 recent search locations (newest first) |
| `unum_favorite_city` | `SavedCity \| null` | The single starred city, or absent if none |

```typescript
interface SavedCity {
  name: string;
  latitude: number;
  longitude: number;
}
```

### Hook: `useSavedCities` (`src/hooks/useSavedCities.ts`)

Returns `{ recentSearches, favoriteCity, loading, addRecentSearch, toggleFavorite, removeRecent }`.

- **`addRecentSearch(city)`** — Prepends to recent list, deduplicates by name (case-insensitive), caps at 10.
- **`toggleFavorite(city)`** — If city matches current favorite, clears it. Otherwise sets it as the new favorite.
- **`removeRecent(name)`** — Removes from recents. Also clears favorite if the removed city was the favorite.

### Search Modal UI

When the search input is empty, recent searches appear as a list below the input:
- Each row has a star icon (left) and city name (right, tappable to navigate)
- Yellow filled star = current favorite. Gray outline star = not favorited.
- Tapping the star toggles favorite. Tapping the name navigates the map and closes the modal.
- Successful new searches are automatically added to the recent list via the `onSearchSuccess` callback.

### Map Initialization Priority

```
useSavedCities() → favoriteCity?
  ├─ Yes → use favorite coords as initialPosition (skip GPS wait)
  └─ No  → useLocation() → GPS position (or cached/default)
           → pass to useMapState(uploads, initialPosition)
```
