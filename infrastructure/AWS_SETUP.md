# AWS Setup Documentation

> **Last Updated:** January 2025

## Current Setup (Development Only)

This document describes the AWS setup for the Unum app. The current configuration is for **development/testing only** and is NOT production-ready.

---

## Architecture Overview

```
┌─────────────────┐      ┌─────────────────┐
│   Unum App      │      │      AWS        │
│                 │      │                 │
│  expo-constants ├─────►│  DynamoDB       │
│  (credentials)  │      │  S3 Bucket      │
└─────────────────┘      └─────────────────┘
```

The app connects directly to AWS using embedded IAM credentials. This is a security risk for production (see "Production Migration" below).

---

## AWS Resources Created

### 1. IAM User
- **Name:** `unum-app-dev`
- **Purpose:** Programmatic access to DynamoDB and S3
- **Policy:** Inline policy with scoped permissions

### 2. IAM Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DynamoDBAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchGetItem",
        "dynamodb:BatchWriteItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:ACCOUNT_ID:table/unum-data-dev",
        "arn:aws:dynamodb:us-east-1:ACCOUNT_ID:table/unum-data-dev/index/*"
      ]
    },
    {
      "Sid": "S3Access",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::unum-media-dev",
        "arn:aws:s3:::unum-media-dev/*"
      ]
    }
  ]
}
```

### 3. DynamoDB Table
- **Table Name:** `unum-data-dev`
- **Partition Key:** `PK` (String)
- **Sort Key:** `SK` (String)
- **Billing Mode:** PAY_PER_REQUEST (on-demand)

**Global Secondary Indexes:**

| Index | Partition Key | Sort Key | Purpose |
|-------|---------------|----------|---------|
| GSI1 | `GSI1PK` (String) | `GSI1SK` (String) | Geohash queries (location-based) |
| GSI2 | `GSI2PK` (String) | `GSI2SK` (String) | Device ID queries |

### 4. S3 Bucket
- **Bucket Name:** `unum-media-dev` (or with random suffix if taken)
- **Region:** `us-east-1`
- **Public Access:** Unblocked (required for presigned URLs)

---

## Setup Steps Performed

### Step 1: Create IAM User
1. AWS Console → IAM → Users → Create user
2. Named: `unum-app-dev`
3. No console access (programmatic only)

### Step 2: Attach Policy
1. User → Permissions → Add permissions → Create inline policy
2. JSON editor → Paste policy above (replace ACCOUNT_ID)
3. Policy name: `unum-app-dev-policy`

### Step 3: Create Access Keys
1. User → Security credentials → Create access key
2. Selected "Application running outside AWS"
3. Saved Access Key ID and Secret Access Key

### Step 4: Create DynamoDB Table
1. DynamoDB → Create table
2. Table name: `unum-data-dev`
3. Partition key: `PK` (String), Sort key: `SK` (String)
4. After creation: Added GSI1 and GSI2 indexes

### Step 5: Create S3 Bucket
1. S3 → Create bucket
2. Bucket name: `unum-media-dev`
3. Region: `us-east-1`
4. Unchecked "Block all public access"

### Step 6: Configure App
1. Created `.env` file from `.env.example`
2. Added credentials and resource names
3. Set `USE_AWS_BACKEND=true`

---

## Environment Variables

The app reads these from `.env` via `app.config.ts` → `expo-constants`:

```bash
# AWS Credentials
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# Resource Names
DYNAMO_TABLE=unum-data-dev
S3_BUCKET=unum-media-dev

# Feature Flags
USE_AWS_BACKEND=true
ENABLE_OFFLINE_SYNC=true
ENABLE_BACKGROUND_SYNC=false
```

---

## How Credentials Flow

```
.env file
    ↓
app.config.ts (loads via dotenv)
    ↓
expo-constants (extra field)
    ↓
src/api/config/index.ts (reads from Constants.expoConfig.extra)
    ↓
AWS SDK clients (DynamoDB, S3)
```

---

## Security Limitations (IMPORTANT)

### Current Risks

| Risk | Severity | Description |
|------|----------|-------------|
| Embedded credentials | **CRITICAL** | Access keys are bundled in the app. Anyone can decompile and extract them. |
| No user auth | HIGH | Only device IDs, no verification. Can't ban users. |
| No server validation | HIGH | Clients write directly to DB. Malicious data possible. |
| Shared credentials | MEDIUM | All app instances use same keys. Can't revoke per-device. |
| No rate limiting | MEDIUM | No protection against abuse/spam. |

### What This Means

- **OK for:** Personal use, development, testing, demo
- **NOT OK for:** Public App Store release, handling user data, production

---

## Production Migration Path

When ready for production, implement one of these:

### Option A: AWS Cognito (Recommended)

```
App → Cognito User Pool (auth) → Cognito Identity Pool → Temp AWS Credentials
```

Benefits:
- No permanent credentials in app
- Per-user, time-limited access
- Built-in user management
- Works offline with credential caching

Implementation:
1. Create Cognito User Pool
2. Create Cognito Identity Pool linked to User Pool
3. Update IAM roles for authenticated/unauthenticated users
4. Install `@aws-amplify/auth` or use AWS SDK directly
5. Remove hardcoded credentials from app

### Option B: API Gateway + Lambda

```
App → API Gateway → Lambda → DynamoDB/S3
```

Benefits:
- Complete server-side control
- Request validation
- Rate limiting
- Audit logging
- Can add business logic

Implementation:
1. Create Lambda functions for each operation
2. Create API Gateway REST API
3. Update app to call API endpoints instead of AWS directly
4. Remove AWS SDK from app (use fetch/axios)

### Additional Production Requirements

- [ ] Enable DynamoDB Point-in-Time Recovery
- [ ] Enable S3 versioning
- [ ] Configure S3 server-side encryption (SSE-S3 or SSE-KMS)
- [ ] Set specific CORS origins (not wildcard)
- [ ] Set up CloudWatch alarms
- [ ] Enable CloudTrail logging
- [ ] Configure S3 access logging
- [ ] Implement proper error handling and retry logic
- [ ] Add request signing/verification

---

## Useful Commands

```bash
# Get AWS Account ID
aws sts get-caller-identity --query Account --output text

# Test DynamoDB access
aws dynamodb describe-table --table-name unum-data-dev

# Test S3 access
aws s3 ls s3://unum-media-dev

# Rotate access keys (if compromised)
aws iam create-access-key --user-name unum-app-dev
aws iam delete-access-key --user-name unum-app-dev --access-key-id OLD_KEY_ID
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `.env` | Credentials (gitignored) |
| `.env.example` | Template for .env |
| `app.config.ts` | Loads .env into expo-constants |
| `src/api/config/index.ts` | Reads from expo-constants |
| `infrastructure/terraform/` | IaC for automated setup |
| `infrastructure/scripts/setup-aws.sh` | Bash script for setup |
