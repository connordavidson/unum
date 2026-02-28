# ============================================================
# Website — Lambda + API Gateway + CloudFront + ACM
# Serves /privacy, /terms, /support for useunum.xyz
# ============================================================

locals {
  domain_name = "useunum.xyz"
}

# ---- Lambda source archive ----

data "archive_file" "website_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/website"
  output_path = "${path.module}/lambda/website.zip"
}

# ---- IAM role ----

resource "aws_iam_role" "website_lambda" {
  name = "${local.name_prefix}-website-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "website_lambda_basic" {
  role       = aws_iam_role.website_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ---- Lambda function ----

resource "aws_lambda_function" "website" {
  filename         = data.archive_file.website_lambda.output_path
  function_name    = "${local.name_prefix}-website"
  role             = aws_iam_role.website_lambda.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.website_lambda.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 10
  memory_size      = 128

  tags = local.common_tags
}

# ---- API Gateway HTTP API ----

resource "aws_apigatewayv2_api" "website" {
  name          = "${local.name_prefix}-website"
  protocol_type = "HTTP"

  tags = local.common_tags
}

resource "aws_apigatewayv2_integration" "website" {
  api_id                 = aws_apigatewayv2_api.website.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.website.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "website_root" {
  api_id    = aws_apigatewayv2_api.website.id
  route_key = "GET /"
  target    = "integrations/${aws_apigatewayv2_integration.website.id}"
}

resource "aws_apigatewayv2_route" "website_proxy" {
  api_id    = aws_apigatewayv2_api.website.id
  route_key = "GET /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.website.id}"
}

resource "aws_apigatewayv2_stage" "website" {
  api_id      = aws_apigatewayv2_api.website.id
  name        = "$default"
  auto_deploy = true

  tags = local.common_tags
}

resource "aws_lambda_permission" "website_api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.website.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.website.execution_arn}/*/*"
}

# ---- ACM Certificate (must be in us-east-1 for CloudFront) ----

resource "aws_acm_certificate" "website" {
  domain_name               = local.domain_name
  subject_alternative_names = ["www.${local.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.common_tags
}

# ---- CloudFront distribution ----

resource "aws_cloudfront_distribution" "website" {
  enabled             = true
  aliases             = [local.domain_name, "www.${local.domain_name}"]
  default_root_object = ""
  comment             = "useunum.xyz website"

  origin {
    # API Gateway execute-api hostname
    domain_name = replace(aws_apigatewayv2_api.website.api_endpoint, "https://", "")
    origin_id   = "website-apigw"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "website-apigw"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 3600  # 1 hour cache — legal pages change infrequently
    max_ttl     = 86400
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.website.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  depends_on = [aws_acm_certificate.website]

  tags = local.common_tags
}

# ---- Outputs ----

output "cloudfront_domain" {
  description = "Add this as ALIAS (@) and CNAME (www) in Porkbun DNS"
  value       = aws_cloudfront_distribution.website.domain_name
}

output "acm_validation_records" {
  description = "Add these CNAME records to Porkbun to validate the SSL certificate before running full apply"
  value = {
    for dvo in aws_acm_certificate.website.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }
}

output "website_url" {
  description = "Public URL of the website"
  value       = "https://${local.domain_name}"
}
