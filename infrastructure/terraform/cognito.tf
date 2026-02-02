# ===========================================
# Unum Infrastructure - Cognito Identity Pool
# ===========================================
#
# Provides temporary AWS credentials to the app
# via Apple Sign-In authentication.
#
# Security Model:
# 1. User signs in with Apple
# 2. Apple ID token is sent to Cognito
# 3. Cognito validates token and returns temporary AWS credentials
# 4. App uses temporary credentials for DynamoDB/S3 access
# 5. Credentials expire after 1 hour and are auto-refreshed
#

# ============ Cognito Identity Pool ============

resource "aws_cognito_identity_pool" "main" {
  identity_pool_name               = "${local.name_prefix}-identity-pool"
  allow_unauthenticated_identities = true
  allow_classic_flow               = false

  # Apple Sign-In as identity provider
  # The value is your Apple Services ID (typically the app bundle identifier)
  supported_login_providers = {
    "appleid.apple.com" = var.apple_service_id
  }

  tags = local.common_tags
}

# ============ IAM Role for Authenticated Users ============

resource "aws_iam_role" "cognito_authenticated" {
  name = "${local.name_prefix}-cognito-authenticated"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = aws_cognito_identity_pool.main.id
          }
          "ForAnyValue:StringLike" = {
            "cognito-identity.amazonaws.com:amr" = "authenticated"
          }
        }
      },
      {
        # Allow the auth Lambda to assume this role via STS for session refresh.
        # When a user's Apple identity token expires (~10 min), the Lambda can't
        # get authenticated Cognito credentials. STS AssumeRole lets the Lambda
        # issue authenticated credentials using the session refresh token as proof.
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.auth_lambda.arn
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

# ============ IAM Policy for Authenticated Users ============

resource "aws_iam_role_policy" "cognito_authenticated" {
  name = "${local.name_prefix}-cognito-authenticated-policy"
  role = aws_iam_role.cognito_authenticated.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchWriteItem",
          "dynamodb:BatchGetItem"
        ]
        Resource = [
          aws_dynamodb_table.main.arn,
          "${aws_dynamodb_table.main.arn}/index/*"
        ]
      },
      {
        Sid    = "S3ObjectAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${aws_s3_bucket.media.arn}/*"
      },
      {
        Sid    = "S3BucketAccess"
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketLocation"
        ]
        Resource = aws_s3_bucket.media.arn
      },
      {
        Sid    = "RekognitionAccess"
        Effect = "Allow"
        Action = [
          "rekognition:DetectModerationLabels"
        ]
        Resource = "*"
      }
    ]
  })
}

# ============ IAM Role for Unauthenticated (Guest) Users ============

resource "aws_iam_role" "cognito_unauthenticated" {
  name = "${local.name_prefix}-cognito-unauthenticated"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = aws_cognito_identity_pool.main.id
          }
          "ForAnyValue:StringLike" = {
            "cognito-identity.amazonaws.com:amr" = "unauthenticated"
          }
        }
      }
    ]
  })

  tags = local.common_tags
}

# ============ IAM Policy for Unauthenticated Users (Read-Only) ============

resource "aws_iam_role_policy" "cognito_unauthenticated" {
  name = "${local.name_prefix}-cognito-unauthenticated-policy"
  role = aws_iam_role.cognito_unauthenticated.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBReadAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem"
        ]
        Resource = [
          aws_dynamodb_table.main.arn,
          "${aws_dynamodb_table.main.arn}/index/*"
        ]
      },
      {
        Sid    = "S3ReadAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject"
        ]
        Resource = "${aws_s3_bucket.media.arn}/*"
      }
    ]
  })
}

# ============ Attach Roles to Identity Pool ============

resource "aws_cognito_identity_pool_roles_attachment" "main" {
  identity_pool_id = aws_cognito_identity_pool.main.id

  roles = {
    "authenticated"   = aws_iam_role.cognito_authenticated.arn
    "unauthenticated" = aws_iam_role.cognito_unauthenticated.arn
  }
}
