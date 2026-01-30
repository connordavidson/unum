# AWS Infrastructure Setup Plan

Reference guide for recreating the Unum AWS infrastructure.

## Current Resources

### Dev Environment
| Resource | Value |
|----------|-------|
| Cognito Identity Pool | `us-east-1:97c8dfa9-8660-4879-9520-f0793d3e3c79` |
| API Gateway | `https://qj9x18vc59.execute-api.us-east-1.amazonaws.com` |
| DynamoDB | `unum-dev` |
| S3 Bucket | `unum-media-dev-7x4k2` |
| Lambda | `unum-backend-dev` |

### Production Environment
| Resource | Value |
|----------|-------|
| Cognito Identity Pool | `us-east-1:341a0a8b-5440-4faf-aa81-49da5ebbc1e4` |
| API Gateway | `https://xsxqd5icsg.execute-api.us-east-1.amazonaws.com` |
| DynamoDB | `unum-prod-data` |
| S3 Bucket | `unum-media-prod` |
| Lambda | `unum-backend-prod` |

---

## Infrastructure Components

### Via Terraform (infrastructure/terraform/)
- ✅ DynamoDB table
- ✅ S3 bucket
- ✅ Cognito Identity Pool
- ✅ IAM roles for authenticated and unauthenticated users
- ✅ Lambda function (auth backend)
- ✅ API Gateway (HTTP API)

### App Code (src/)
- ✅ `services/aws-credentials.service.ts` - Cognito credential management + deduplication
- ✅ `services/auth-backend.service.ts` - Lambda API client
- ✅ `api/clients/dynamodb.client.ts` - Read-only client for unauthenticated access
- ✅ `api/clients/s3.client.ts` - Read-only client for presigned URLs
- ✅ `hooks/useUploadData.ts` - Request versioning for race conditions

---

## How to Recreate Infrastructure

### Via Terraform (infrastructure/terraform/)
- ✅ DynamoDB table: `unum-dev`
- ✅ S3 bucket: `unum-media-dev-7x4k2`
- ✅ Cognito Identity Pool: `us-east-1:97c8dfa9-8660-4879-9520-f0793d3e3c79`
- ✅ IAM role for authenticated users

### Manually in AWS Console (due to IAM permission issues)
- ✅ Lambda: `unum-backend-dev` (Node.js 20.x)
- ✅ API Gateway: `unum-backend-api-dev` (https://qj9x18vc59.execute-api.us-east-1.amazonaws.com)
- ✅ Enabled unauthenticated identities in Cognito (Terraform had it disabled)
- ✅ IAM role: `unum-dev-guest-role` for unauthenticated read access

### App Code Changes
- ✅ `aws-credentials.service.ts` - Cognito credential management + deduplication
- ✅ `auth-backend.service.ts` - Lambda API client
- ✅ `dynamodb.client.ts` - Read-only client for unauthenticated access
- ✅ `s3.client.ts` - Read-only client for presigned URLs
- ✅ `useUploadData.ts` - Request versioning for race conditions
- ✅ `.env.development` - Complete with all dev values
- ✅ `.env.production` - Template with placeholders

---

### Step 1: Create Cognito Identity Pool

**In AWS Console → Cognito → Identity Pools:**

1. Create new identity pool: `unum-prod-identity-pool`
2. **Enable** "Allow unauthenticated identities" (critical for guest read access!)
3. Add Apple Sign-In as identity provider:
   - Provider: `appleid.apple.com`
   - App ID: `com.unum.app`
4. Create two IAM roles:

**Authenticated Role (`unum-prod-authenticated-role`):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
        "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:BatchWriteItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:*:table/unum-prod-data",
        "arn:aws:dynamodb:us-east-1:*:table/unum-prod-data/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::unum-prod-media-*/*"
    }
  ]
}
```

**Unauthenticated Role (`unum-prod-guest-role`):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:Scan"],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:*:table/unum-prod-data",
        "arn:aws:dynamodb:us-east-1:*:table/unum-prod-data/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::unum-prod-media-*/*"
    }
  ]
}
```

5. **Record the Identity Pool ID** (e.g., `us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

---

### Step 2: Create Lambda Function

**In AWS Console → Lambda:**

1. Create function: `unum-backend-{env}`
2. Runtime: Node.js 20.x
3. Create new execution role with:
   - CloudWatch Logs permissions
   - DynamoDB access to `unum-prod-data`
   - Cognito Identity access

4. Upload the code from `infrastructure/terraform/lambda/auth/index.js`

5. Set environment variables:
   | Variable | Value |
   |----------|-------|
   | `DYNAMO_TABLE` | `unum-prod-data` |
   | `COGNITO_IDENTITY_POOL_ID` | (from Step 1) |
   | `APPLE_BUNDLE_ID` | `com.unum.app` |
   | `SESSION_TTL_DAYS` | `30` |

6. Configure: 256 MB memory, 30s timeout

---

### Step 3: Create API Gateway

**In AWS Console → API Gateway:**

1. Create HTTP API: `unum-backend-api-{env}`
2. Add routes:
   - `POST /auth/apple` → Lambda `unum-backend-prod`
   - `POST /auth/refresh` → Lambda `unum-backend-prod`
   - `POST /auth/logout` → Lambda `unum-backend-prod`
3. Deploy to `$default` stage
4. **Record the Invoke URL** (e.g., `https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com`)

---

### Step 4: Verify DynamoDB & S3

**DynamoDB:**
- Table `unum-prod-data` should already exist (check via Terraform or console)
- If not, run: `terraform apply -var="environment=prod"`

**S3:**
- Bucket `unum-prod-media-[ACCOUNT_ID]` should already exist
- Get your AWS account ID: `aws sts get-caller-identity --query Account --output text`

---

### Step 5: Update .env.production

Replace placeholders with actual values:

```bash
# Production Environment
APP_ENV=production
AWS_REGION=us-east-1
COGNITO_IDENTITY_POOL_ID=us-east-1:XXXXX  # From Step 1
DYNAMO_TABLE=unum-prod-data
S3_BUCKET=unum-prod-media-XXXXX  # With your account ID
AUTH_API_URL=https://XXXXX.execute-api.us-east-1.amazonaws.com  # From Step 3

# Feature Flags
USE_AWS_BACKEND=true
ENABLE_OFFLINE_SYNC=true
ENABLE_BACKGROUND_SYNC=true
USE_TEST_DATA=false
DEBUG=false
```

---

### Step 6: Terraform Configuration

The Terraform config in `infrastructure/terraform/` now includes:
- `cognito.tf`: Both authenticated and unauthenticated IAM roles
- `auth-backend.tf`: Lambda + API Gateway for session management
- `main.tf`: DynamoDB and S3 resources

Key setting in `cognito.tf`:
```hcl
allow_unauthenticated_identities = true  # Required for guest read access
```

---

## Verification Checklist

After setting up infrastructure:

1. ☑ Update `.env.{environment}` with all values
2. ☐ Build with EAS: `eas build --profile {environment} --platform ios`
3. ☐ Test on device:
   - ☐ Pins load immediately (unauthenticated read)
   - ☐ Sign in with Apple works
   - ☐ Voting works (authenticated write)
   - ☐ Photo upload works (authenticated write)
   - ☐ Session persists across app restarts (refresh token)
4. ☐ Check CloudWatch logs for the Lambda
5. ☐ Verify test data behavior matches `USE_TEST_DATA` setting

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                     AWS Infrastructure                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐      ┌──────────────────┐                      │
│  │   App       │      │ Cognito Identity │                      │
│  │ (iOS/Android)│────▶│      Pool        │                      │
│  └─────────────┘      └──────────────────┘                      │
│         │                     │                                  │
│         │              ┌──────┴──────┐                          │
│         │              │             │                          │
│         ▼              ▼             ▼                          │
│  ┌─────────────┐ ┌──────────┐ ┌──────────┐                     │
│  │ API Gateway │ │Unauth    │ │Auth      │                     │
│  │ + Lambda    │ │Role      │ │Role      │                     │
│  │(refresh tok)│ │(read)    │ │(read+    │                     │
│  └─────────────┘ └──────────┘ │write)    │                     │
│         │              │      └──────────┘                     │
│         │              │             │                          │
│         ▼              ▼             ▼                          │
│  ┌─────────────────────────────────────────┐                   │
│  │              DynamoDB Table              │                   │
│  └─────────────────────────────────────────┘                   │
│  ┌─────────────────────────────────────────┐                   │
│  │              S3 Media Bucket             │                   │
│  └─────────────────────────────────────────┘                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```
