set -euo pipefail

CFID="E1Y1BNEBY8H2O0"
API_DOMAIN="vq8dq5s5g6.execute-api.us-east-1.amazonaws.com"
TOKEN="7613ce234198c72b2c1bca89dc17ea4770d949d33f40ff7be5886f936ad29986"

# 0) Várjuk meg, hogy a disztribúció Deployed állapotban legyen (ha előző update még terjed)
while true; do
  STATUS=$(aws cloudfront get-distribution --id "$CFID" --query 'Distribution.Status' --output text)
  echo "CloudFront status: $STATUS"
  [ "$STATUS" = "Deployed" ] && break
  sleep 5
done

# 1) Húzd le a LEGFRISSEBB configot + ETag-et
aws cloudfront get-distribution-config --id "$CFID" --output json > cf-full.json
ETAG=$(jq -r '.ETag' cf-full.json)
jq '.DistributionConfig' cf-full.json > dist.json

# 2) Az API origin ID kinyerése a domain alapján
API_ORIGIN_ID=$(jq -r \
  --arg D "$API_DOMAIN" \
  '.Origins.Items[] | select(.DomainName==$D) | .Id' dist.json)

if [ -z "$API_ORIGIN_ID" ] || [ "$API_ORIGIN_ID" = "null" ]; then
  echo "❌ Nem találtam API origin ID-t a $API_DOMAIN domainhez. Listázás:"
  jq -r '.Origins.Items[] | "\(.Id) \(.DomainName)"' dist.json
  exit 1
fi
echo "API_ORIGIN_ID = $API_ORIGIN_ID"

# 3) x-internal-token upsert az API origin CustomHeaders-hez
jq --arg OID "$API_ORIGIN_ID" --arg T "$TOKEN" '
  .Origins.Items |= map(
    if .Id == $OID then
      (.CustomHeaders.Items // []) as $items
      | (
          $items
          | map(select((.HeaderName|ascii_downcase) != "x-internal-token"))
          + [{HeaderName:"x-internal-token", HeaderValue:$T}]
        ) as $new
      | .CustomHeaders = { Quantity: ($new|length), Items: $new }
    else . end
  )
' dist.json > dist.patched.json

# 4) Update – FRISS ETag-gel
aws cloudfront update-distribution \
  --id "$CFID" \
  --if-match "$ETAG" \
  --distribution-config file://dist.patched.json

echo "✅ update-distribution elküldve. Várakozás a Deploy-ra…"

# 5) Várakozás, míg a módosítás Deployed lesz
while true; do
  STATUS=$(aws cloudfront get-distribution --id "$CFID" --query 'Distribution.Status' --output text)
  echo "CloudFront status: $STATUS"
  [ "$STATUS" = "Deployed" ] && break
  sleep 5
done

# 6) Gyors ping CF-en át – token NEM kell kliens felől
curl -i https://news.tonynagy.io/api/news/search \
  -H "Content-Type: application/json" \
  -d '{"q":"ping","lang":"en","maxItems":1}'
