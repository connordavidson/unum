# ============================================
# Auth Backend - Lambda + API Gateway
# ============================================
# Handles session management with refresh tokens
# so users don't need to re-authenticate frequently

# ============ Lambda Function ============

resource "aws_lambda_function" "auth" {
  filename         = data.archive_file.auth_lambda.output_path
  function_name    = "${local.name_prefix}-auth"
  role             = aws_iam_role.auth_lambda.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.auth_lambda.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      DYNAMO_TABLE              = var.dynamo_table_name
      COGNITO_IDENTITY_POOL_ID  = var.cognito_identity_pool_id
      AWS_REGION_NAME           = var.aws_region
      APPLE_BUNDLE_ID           = var.apple_service_id
      SESSION_TTL_DAYS          = "30"
      AUTHENTICATED_ROLE_ARN    = aws_iam_role.cognito_authenticated.arn
    }
  }

  tags = local.common_tags
}

# Lambda source code archive
data "archive_file" "auth_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/auth"
  output_path = "${path.module}/lambda/auth.zip"
}

# ============ IAM Role for Lambda ============

resource "aws_iam_role" "auth_lambda" {
  name = "${local.name_prefix}-auth-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })

  tags = local.common_tags
}

# Lambda basic execution (CloudWatch Logs)
resource "aws_iam_role_policy_attachment" "auth_lambda_basic" {
  role       = aws_iam_role.auth_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Lambda policy for DynamoDB and Cognito
resource "aws_iam_role_policy" "auth_lambda" {
  name = "${local.name_prefix}-auth-lambda-policy"
  role = aws_iam_role.auth_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${var.dynamo_table_name}",
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${var.dynamo_table_name}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "cognito-identity:GetId",
          "cognito-identity:GetCredentialsForIdentity"
        ]
        Resource = "*"
      },
      {
        Sid    = "STSAssumeAuthenticatedRole"
        Effect = "Allow"
        Action = "sts:AssumeRole"
        Resource = aws_iam_role.cognito_authenticated.arn
      }
    ]
  })
}

# ============ API Gateway ============

resource "aws_apigatewayv2_api" "auth" {
  name          = "${local.name_prefix}-auth-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["POST", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
    max_age       = 3600
  }

  tags = local.common_tags
}

resource "aws_apigatewayv2_stage" "auth" {
  api_id      = aws_apigatewayv2_api.auth.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      responseLength = "$context.responseLength"
    })
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/api-gateway/${local.name_prefix}-auth"
  retention_in_days = 14

  tags = local.common_tags
}

# Lambda integration
resource "aws_apigatewayv2_integration" "auth" {
  api_id                 = aws_apigatewayv2_api.auth.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.auth.invoke_arn
  payload_format_version = "2.0"
}

# Routes
resource "aws_apigatewayv2_route" "auth_apple" {
  api_id    = aws_apigatewayv2_api.auth.id
  route_key = "POST /auth/apple"
  target    = "integrations/${aws_apigatewayv2_integration.auth.id}"
}

resource "aws_apigatewayv2_route" "auth_refresh" {
  api_id    = aws_apigatewayv2_api.auth.id
  route_key = "POST /auth/refresh"
  target    = "integrations/${aws_apigatewayv2_integration.auth.id}"
}

resource "aws_apigatewayv2_route" "auth_logout" {
  api_id    = aws_apigatewayv2_api.auth.id
  route_key = "POST /auth/logout"
  target    = "integrations/${aws_apigatewayv2_integration.auth.id}"
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auth.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.auth.execution_arn}/*/*"
}

# ============ Outputs ============

output "auth_api_url" {
  description = "Auth API endpoint URL"
  value       = aws_apigatewayv2_api.auth.api_endpoint
}

output "auth_lambda_name" {
  description = "Auth Lambda function name"
  value       = aws_lambda_function.auth.function_name
}
