# ===========================================
# Unum Infrastructure - Variables
# ===========================================

# ============ General ============

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "unum"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

# ============ DynamoDB ============

variable "dynamodb_billing_mode" {
  description = "DynamoDB billing mode (PAY_PER_REQUEST or PROVISIONED)"
  type        = string
  default     = "PAY_PER_REQUEST"

  validation {
    condition     = contains(["PAY_PER_REQUEST", "PROVISIONED"], var.dynamodb_billing_mode)
    error_message = "Billing mode must be PAY_PER_REQUEST or PROVISIONED."
  }
}

variable "dynamodb_read_capacity" {
  description = "DynamoDB read capacity units (only used if billing_mode is PROVISIONED)"
  type        = number
  default     = 5
}

variable "dynamodb_write_capacity" {
  description = "DynamoDB write capacity units (only used if billing_mode is PROVISIONED)"
  type        = number
  default     = 5
}

# ============ S3 ============

variable "cors_allowed_origins" {
  description = "Allowed origins for S3 CORS"
  type        = list(string)
  default     = ["*"]
}

# ============ Cognito ============

variable "apple_service_id" {
  description = "Apple Services ID for Sign in with Apple (typically the app bundle identifier)"
  type        = string
  default     = "com.unum.app"
}

# ============ Existing Resources ============
# Use these to reference existing resources instead of creating new ones

variable "dynamo_table_name" {
  description = "Name of existing DynamoDB table to use"
  type        = string
  default     = "unum-dev"
}

variable "cognito_identity_pool_id" {
  description = "ID of existing Cognito Identity Pool"
  type        = string
  default     = ""
}

variable "s3_bucket_name" {
  description = "Name of existing S3 bucket to use"
  type        = string
  default     = ""
}
