# Production Environment Variables

environment       = "prod"
dynamo_table_name = "unum-prod"
s3_bucket_name    = "unum-media-prod"

# Preserve existing resource names to minimize changes
lambda_function_name             = "unum-backend-prod"
lambda_role_name                 = "unum-backend-prod-role-t8nntc4c"
cognito_authenticated_role_name  = "unum-prod-authenticated-role"
cognito_unauthenticated_role_name = "unum-prod-guest-role"
lambda_memory_size                = 512
