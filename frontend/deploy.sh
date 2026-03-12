#!/bin/bash
# deploy.sh - Build and deploy frontend to S3 + invalidate CloudFront
#
# Usage:
#   ./deploy.sh <s3-bucket-name> [cloudfront-distribution-id]
#
# Example:
#   ./deploy.sh quiz-app-frontend-bucket E1234567890ABC

set -e

BUCKET=$1
DIST_ID=$2

if [ -z "$BUCKET" ]; then
  echo "Usage: ./deploy.sh <s3-bucket-name> [cloudfront-distribution-id]"
  exit 1
fi

echo "🔨 Building..."
npm run build

echo "📤 Uploading to s3://$BUCKET ..."
aws s3 sync dist/ "s3://$BUCKET" --delete

# Cache HTML with short TTL, assets with long TTL
aws s3 cp "s3://$BUCKET/index.html" "s3://$BUCKET/index.html" \
  --cache-control "max-age=60" \
  --content-type "text/html" \
  --metadata-directive REPLACE

if [ -n "$DIST_ID" ]; then
  echo "🔄 Invalidating CloudFront cache..."
  aws cloudfront create-invalidation \
    --distribution-id "$DIST_ID" \
    --paths "/*" \
    --output text
fi

echo "✅ Deploy complete!"
