#!/bin/bash

#
# AWS Infrastructure Setup Script for Unum
#
# This script creates all required AWS resources for the BFF layer:
# - DynamoDB table with GSI
# - S3 bucket with CORS
# - IAM user with appropriate permissions
#
# Prerequisites:
# - AWS CLI installed and configured
# - Appropriate AWS permissions to create resources
#
# Usage:
#   ./setup-aws.sh [environment]
#
#   environment: dev (default), staging, prod
#

set -e

# ============ Configuration ============

ENV="${1:-dev}"
REGION="${AWS_REGION:-us-east-1}"
PROJECT_NAME="unum"

# Resource names
DYNAMODB_TABLE="${PROJECT_NAME}-data-${ENV}"
S3_BUCKET="${PROJECT_NAME}-media-${ENV}-$(aws sts get-caller-identity --query Account --output text)"
IAM_USER="${PROJECT_NAME}-app-${ENV}"
IAM_POLICY="${PROJECT_NAME}-policy-${ENV}"

echo "================================================"
echo "  Unum AWS Infrastructure Setup"
echo "================================================"
echo ""
echo "Environment: ${ENV}"
echo "Region: ${REGION}"
echo "DynamoDB Table: ${DYNAMODB_TABLE}"
echo "S3 Bucket: ${S3_BUCKET}"
echo "IAM User: ${IAM_USER}"
echo ""

# ============ Helper Functions ============

check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        echo "Error: AWS CLI is not installed"
        echo "Install it from: https://aws.amazon.com/cli/"
        exit 1
    fi

    if ! aws sts get-caller-identity &> /dev/null; then
        echo "Error: AWS CLI is not configured"
        echo "Run: aws configure"
        exit 1
    fi

    echo "✓ AWS CLI configured"
}

# ============ DynamoDB Setup ============

create_dynamodb_table() {
    echo ""
    echo "Creating DynamoDB table: ${DYNAMODB_TABLE}"

    # Check if table exists
    if aws dynamodb describe-table --table-name "${DYNAMODB_TABLE}" --region "${REGION}" &> /dev/null; then
        echo "  Table already exists, skipping..."
        return 0
    fi

    aws dynamodb create-table \
        --table-name "${DYNAMODB_TABLE}" \
        --region "${REGION}" \
        --attribute-definitions \
            AttributeName=PK,AttributeType=S \
            AttributeName=SK,AttributeType=S \
            AttributeName=GSI1PK,AttributeType=S \
            AttributeName=GSI1SK,AttributeType=S \
        --key-schema \
            AttributeName=PK,KeyType=HASH \
            AttributeName=SK,KeyType=RANGE \
        --global-secondary-indexes '[
            {
                "IndexName": "GSI1",
                "KeySchema": [
                    {"AttributeName": "GSI1PK", "KeyType": "HASH"},
                    {"AttributeName": "GSI1SK", "KeyType": "RANGE"}
                ],
                "Projection": {"ProjectionType": "ALL"}
            }
        ]' \
        --billing-mode PAY_PER_REQUEST \
        --tags Key=Project,Value="${PROJECT_NAME}" Key=Environment,Value="${ENV}" \
        > /dev/null

    echo "  Waiting for table to be active..."
    aws dynamodb wait table-exists --table-name "${DYNAMODB_TABLE}" --region "${REGION}"

    echo "✓ DynamoDB table created"
}

# ============ S3 Setup ============

create_s3_bucket() {
    echo ""
    echo "Creating S3 bucket: ${S3_BUCKET}"

    # Check if bucket exists
    if aws s3api head-bucket --bucket "${S3_BUCKET}" 2>/dev/null; then
        echo "  Bucket already exists, skipping creation..."
    else
        # Create bucket (different command for us-east-1)
        if [ "${REGION}" = "us-east-1" ]; then
            aws s3api create-bucket \
                --bucket "${S3_BUCKET}" \
                --region "${REGION}" \
                > /dev/null
        else
            aws s3api create-bucket \
                --bucket "${S3_BUCKET}" \
                --region "${REGION}" \
                --create-bucket-configuration LocationConstraint="${REGION}" \
                > /dev/null
        fi
        echo "  Bucket created"
    fi

    # Block public access
    echo "  Configuring public access block..."
    aws s3api put-public-access-block \
        --bucket "${S3_BUCKET}" \
        --public-access-block-configuration \
        "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
        > /dev/null

    # Enable CORS for presigned URLs
    echo "  Configuring CORS..."
    aws s3api put-bucket-cors \
        --bucket "${S3_BUCKET}" \
        --cors-configuration '{
            "CORSRules": [
                {
                    "AllowedOrigins": ["*"],
                    "AllowedMethods": ["GET", "PUT", "HEAD"],
                    "AllowedHeaders": ["*"],
                    "ExposeHeaders": ["ETag"],
                    "MaxAgeSeconds": 3600
                }
            ]
        }' \
        > /dev/null

    # Add lifecycle rule for temp files
    echo "  Configuring lifecycle rules..."
    aws s3api put-bucket-lifecycle-configuration \
        --bucket "${S3_BUCKET}" \
        --lifecycle-configuration '{
            "Rules": [
                {
                    "ID": "DeleteTempFiles",
                    "Status": "Enabled",
                    "Filter": {"Prefix": "temp/"},
                    "Expiration": {"Days": 1}
                }
            ]
        }' \
        > /dev/null

    # Add tags
    aws s3api put-bucket-tagging \
        --bucket "${S3_BUCKET}" \
        --tagging "TagSet=[{Key=Project,Value=${PROJECT_NAME}},{Key=Environment,Value=${ENV}}]" \
        > /dev/null

    echo "✓ S3 bucket configured"
}

# ============ IAM Setup ============

create_iam_resources() {
    echo ""
    echo "Creating IAM resources..."

    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

    # Create policy document
    POLICY_DOC=$(cat <<EOF
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
                "dynamodb:BatchWriteItem",
                "dynamodb:BatchGetItem"
            ],
            "Resource": [
                "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/${DYNAMODB_TABLE}",
                "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/${DYNAMODB_TABLE}/index/*"
            ]
        },
        {
            "Sid": "S3Access",
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "s3:HeadObject"
            ],
            "Resource": "arn:aws:s3:::${S3_BUCKET}/*"
        },
        {
            "Sid": "S3BucketAccess",
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket",
                "s3:GetBucketLocation"
            ],
            "Resource": "arn:aws:s3:::${S3_BUCKET}"
        }
    ]
}
EOF
)

    # Check if policy exists
    POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/${IAM_POLICY}"
    if aws iam get-policy --policy-arn "${POLICY_ARN}" &> /dev/null; then
        echo "  Policy exists, creating new version..."
        # Delete oldest version if at limit (5 versions max)
        VERSIONS=$(aws iam list-policy-versions --policy-arn "${POLICY_ARN}" --query 'Versions[?IsDefaultVersion==`false`].VersionId' --output text)
        VERSION_COUNT=$(echo "${VERSIONS}" | wc -w)
        if [ "${VERSION_COUNT}" -ge 4 ]; then
            OLDEST=$(echo "${VERSIONS}" | awk '{print $NF}')
            aws iam delete-policy-version --policy-arn "${POLICY_ARN}" --version-id "${OLDEST}" > /dev/null
        fi
        aws iam create-policy-version \
            --policy-arn "${POLICY_ARN}" \
            --policy-document "${POLICY_DOC}" \
            --set-as-default \
            > /dev/null
    else
        echo "  Creating IAM policy..."
        aws iam create-policy \
            --policy-name "${IAM_POLICY}" \
            --policy-document "${POLICY_DOC}" \
            --tags Key=Project,Value="${PROJECT_NAME}" Key=Environment,Value="${ENV}" \
            > /dev/null
    fi

    # Check if user exists
    if aws iam get-user --user-name "${IAM_USER}" &> /dev/null; then
        echo "  IAM user already exists"
    else
        echo "  Creating IAM user..."
        aws iam create-user \
            --user-name "${IAM_USER}" \
            --tags Key=Project,Value="${PROJECT_NAME}" Key=Environment,Value="${ENV}" \
            > /dev/null
    fi

    # Attach policy to user
    echo "  Attaching policy to user..."
    aws iam attach-user-policy \
        --user-name "${IAM_USER}" \
        --policy-arn "${POLICY_ARN}" \
        2>/dev/null || true

    # Create access key
    echo ""
    echo "  Creating access key..."
    ACCESS_KEY=$(aws iam create-access-key --user-name "${IAM_USER}" 2>/dev/null || echo "")

    if [ -n "${ACCESS_KEY}" ]; then
        ACCESS_KEY_ID=$(echo "${ACCESS_KEY}" | jq -r '.AccessKey.AccessKeyId')
        SECRET_ACCESS_KEY=$(echo "${ACCESS_KEY}" | jq -r '.AccessKey.SecretAccessKey')

        echo ""
        echo "================================================"
        echo "  NEW ACCESS KEY CREATED"
        echo "================================================"
        echo ""
        echo "  Access Key ID: ${ACCESS_KEY_ID}"
        echo "  Secret Access Key: ${SECRET_ACCESS_KEY}"
        echo ""
        echo "  ⚠️  Save these credentials securely!"
        echo "  ⚠️  The secret key will not be shown again."
        echo ""

        # Generate .env content
        echo "  Generating .env file..."
        cat > "../../.env.${ENV}" <<ENVEOF
# AWS Configuration for Unum (${ENV})
# Generated on $(date)

AWS_REGION=${REGION}
AWS_ACCESS_KEY_ID=${ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${SECRET_ACCESS_KEY}

# Resource Names
DYNAMO_TABLE=${DYNAMODB_TABLE}
S3_BUCKET=${S3_BUCKET}

# Feature Flags
USE_AWS_BACKEND=true
ENABLE_OFFLINE_SYNC=true
ENABLE_BACKGROUND_SYNC=true
ENVEOF
        echo "  ✓ Created .env.${ENV} file"
    else
        echo "  Note: Access key already exists or couldn't be created."
        echo "  You may need to create one manually or delete existing keys."
    fi

    echo "✓ IAM resources configured"
}

# ============ Summary ============

print_summary() {
    echo ""
    echo "================================================"
    echo "  Setup Complete!"
    echo "================================================"
    echo ""
    echo "Resources created:"
    echo "  • DynamoDB Table: ${DYNAMODB_TABLE}"
    echo "  • S3 Bucket: ${S3_BUCKET}"
    echo "  • IAM User: ${IAM_USER}"
    echo "  • IAM Policy: ${IAM_POLICY}"
    echo ""
    echo "Next steps:"
    echo "  1. Copy .env.${ENV} to .env in project root"
    echo "  2. Set USE_AWS_BACKEND=true in constants"
    echo "  3. Upgrade to Node.js v20+"
    echo "  4. Run: npx expo prebuild --clean"
    echo "  5. Run: npx expo run:ios"
    echo ""
}

# ============ Main ============

main() {
    check_aws_cli
    create_dynamodb_table
    create_s3_bucket
    create_iam_resources
    print_summary
}

main
