#!/usr/bin/env bash
# Frontend deploy: S3 sync + CloudFront invalidation
# Usage:
#   export S3_BUCKET=news-ai-agent-frontend-prod   # REQUIRED
#   export CF_DISTRIBUTION_ID=E1Y1BNEBY8H2O0        # REQUIRED
#   export BUILD_DIR=./out                          # default ./out (Next.js export)
#   export AWS_REGION=us-east-1                     # region of the bucket (for completeness)
#   ./deploy_frontend.sh
#
# Notes:
# - Uses a 3-step sync to get correct Cache-Control without complex metadata rewrites.
# - Step 1: Upload immutable assets with long cache (js/css/fonts/img)
# - Step 2: Upload HTML/JSON/manifest/sitemaps with no-cache
# - Step 3: Final sync with --delete to remove stale files without touching metadata
# - Step 4: CloudFront invalidation (/* by default; keep it infrequent)

set -euo pipefail

: "${S3_BUCKET:?S3_BUCKET is required}"
: "${CF_DISTRIBUTION_ID:?CF_DISTRIBUTION_ID is required}"
BUILD_DIR="${BUILD_DIR:-./out}"
AWS_REGION="${AWS_REGION:-us-east-1}"

if [[ ! -d "$BUILD_DIR" ]]; then
  echo "❌ BUILD_DIR not found: $BUILD_DIR"
  exit 1
fi

echo "Deploying from ${BUILD_DIR} -> s3://${S3_BUCKET} (region: ${AWS_REGION})"
echo "CloudFront distribution: ${CF_DISTRIBUTION_ID}"

# 1) Immutable/static assets (long cache)
echo "→ Sync immutable assets (js, css, fonts, images) with long cache..."
aws s3 sync "${BUILD_DIR}" "s3://${S3_BUCKET}" \
  --exclude "*" \
  --include "*.js" --include "*.mjs" --include "*.css" \
  --include "*.png" --include "*.jpg" --include "*.jpeg" --include "*.gif" --include "*.webp" --include "*.avif" \
  --include "*.svg" --include "*.ico" \
  --include "*.woff" --include "*.woff2" --include "*.ttf" \
  --include "_next/*" --include "static/*" \
  --cache-control "public,max-age=31536000,immutable"

# 2) HTML + JSON + text (no-cache, must-revalidate)
echo "→ Sync HTML/JSON with no-cache..."
aws s3 sync "${BUILD_DIR}" "s3://${S3_BUCKET}" \
  --exclude "*" \
  --include "*.html" --include "*.json" \
  --include "index.html" \
  --include "sitemap.xml" --include "sitemap-*.xml" --include "robots.txt" \
  --cache-control "no-cache, no-store, must-revalidate"

# 3) Final delete pass (removes files not present locally; does not alter metadata)
echo "→ Final cleanup sync (delete removed files)..."
aws s3 sync "${BUILD_DIR}" "s3://${S3_BUCKET}" --delete --size-only

# 4) CloudFront invalidation (HTML-first approach; safe default /*)
echo "→ Creating CloudFront invalidation (/*)..."
aws cloudfront create-invalidation \
  --distribution-id "${CF_DISTRIBUTION_ID}" \
  --paths "/*" >/dev/null

echo "✅ Frontend deploy complete."
