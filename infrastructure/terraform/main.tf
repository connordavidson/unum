# ===========================================
# Unum Infrastructure - Main Configuration
# ===========================================
#
# This Terraform configuration creates all AWS
# resources needed for the Unum BFF layer.
#
# Usage:
#   cd infrastructure/terraform
#   terraform init
#   terraform plan -var="environment=dev"
#   terraform apply -var="environment=dev"
#

terraform {
  required_version = ">= 1.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment to use remote state (recommended for teams)
  # backend "s3" {
  #   bucket         = "unum-terraform-state"
  #   key            = "unum/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "unum-terraform-locks"
  # }
}

# ============ Provider ============

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# ============ Data Sources ============

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ============ Local Values ============

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name

  # Resource naming
  name_prefix = "${var.project_name}-${var.environment}"

  # Common tags
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# ============ DynamoDB Table ============

resource "aws_dynamodb_table" "main" {
  name         = "${local.name_prefix}-data"
  billing_mode = var.dynamodb_billing_mode

  # Only set these if using PROVISIONED billing
  read_capacity  = var.dynamodb_billing_mode == "PROVISIONED" ? var.dynamodb_read_capacity : null
  write_capacity = var.dynamodb_billing_mode == "PROVISIONED" ? var.dynamodb_write_capacity : null

  # Primary key
  hash_key  = "PK"
  range_key = "SK"

  # Attribute definitions
  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  # GSI for geohash and device queries
  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"

    # Only set these if using PROVISIONED billing
    read_capacity  = var.dynamodb_billing_mode == "PROVISIONED" ? var.dynamodb_read_capacity : null
    write_capacity = var.dynamodb_billing_mode == "PROVISIONED" ? var.dynamodb_write_capacity : null
  }

  # Enable point-in-time recovery for production
  point_in_time_recovery {
    enabled = var.environment == "prod"
  }

  # Enable TTL if needed
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = local.common_tags
}

# ============ S3 Bucket ============

resource "aws_s3_bucket" "media" {
  bucket = "${local.name_prefix}-media-${local.account_id}"

  tags = local.common_tags
}

# Block public access
resource "aws_s3_bucket_public_access_block" "media" {
  bucket = aws_s3_bucket.media.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable versioning for production
resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id

  versioning_configuration {
    status = var.environment == "prod" ? "Enabled" : "Suspended"
  }
}

# Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# CORS configuration for presigned URLs
resource "aws_s3_bucket_cors_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "HEAD"]
    allowed_origins = var.cors_allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

# Lifecycle rules
resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  # Delete temp files after 1 day
  rule {
    id     = "delete-temp-files"
    status = "Enabled"

    filter {
      prefix = "temp/"
    }

    expiration {
      days = 1
    }
  }

  # Move old versions to Glacier for production
  dynamic "rule" {
    for_each = var.environment == "prod" ? [1] : []
    content {
      id     = "archive-old-versions"
      status = "Enabled"

      filter {
        prefix = ""
      }

      noncurrent_version_transition {
        noncurrent_days = 30
        storage_class   = "GLACIER"
      }

      noncurrent_version_expiration {
        noncurrent_days = 365
      }
    }
  }
}

# ============ IAM User ============

resource "aws_iam_user" "app" {
  name = "${local.name_prefix}-app"
  path = "/apps/"

  tags = local.common_tags
}

# IAM Policy
resource "aws_iam_policy" "app" {
  name        = "${local.name_prefix}-policy"
  description = "Policy for Unum app to access DynamoDB and S3"

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
          "s3:DeleteObject",
          "s3:HeadObject"
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
      }
    ]
  })

  tags = local.common_tags
}

# Attach policy to user
resource "aws_iam_user_policy_attachment" "app" {
  user       = aws_iam_user.app.name
  policy_arn = aws_iam_policy.app.arn
}

# Access key (handle with care!)
resource "aws_iam_access_key" "app" {
  user = aws_iam_user.app.name
}
