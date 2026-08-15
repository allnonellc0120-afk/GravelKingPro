# GravelKing ACRCloud Fingerprint Gateway

This service is designed for Google Cloud Run. It does not depend on Replit
runtime services. ACRCloud secrets remain inside this service and are never
sent to the browser or the Node API.

## Required Secret Manager secrets

- `acrcloud-host` — the ACRCloud project host, such as the host shown in the
  ACRCloud console
- `acrcloud-access-key`
- `acrcloud-access-secret`
- `fingerprint-service-api-key` — a separate random key used only between the
  Node API and this service

Create secret containers and add their values using your normal secured GCP
operator workflow. Do not place secret values in source code, build arguments,
shell history, or deployment manifests.

## Deploy to Cloud Run

Run from the repository root in your own Google Cloud environment:

```sh
gcloud run deploy gkp-fingerprint \
  --source cloud-run/fingerprint-api \
  --region us-central1 \
  --no-allow-unauthenticated \
  --set-secrets ACRCLOUD_HOST=acrcloud-host:latest,ACRCLOUD_ACCESS_KEY=acrcloud-access-key:latest,ACRCLOUD_ACCESS_SECRET=acrcloud-access-secret:latest,FINGERPRINT_SERVICE_API_KEY=fingerprint-service-api-key:latest \
  --memory 512Mi \
  --timeout 30
```

Grant the Node Cloud Run service account `roles/run.invoker` on this service.
Configure the Node service with:

- `FINGERPRINT_SERVICE_URL` — the deployed Cloud Run URL
- `FINGERPRINT_SERVICE_API_KEY` — bind the same Secret Manager secret
- `FINGERPRINT_SCAN_TIMEOUT_MS` — optional; defaults to 20 seconds

If Cloud Run IAM authentication is enforced, the Node service must also attach
a Google-signed ID token for the target service URL. The application-level API
key is defense in depth and does not replace Cloud Run IAM.

## Failure contract

Provider timeouts, network failures, malformed responses, HTTP 401/402, and
provider status errors return:

```json
{
  "status": "unavailable",
  "code": "SCAN_TEMPORARILY_UNAVAILABLE",
  "message": "Scan temporarily unavailable"
}
```

The Node API blocks only the protected stamping/ingest request. Health checks,
plain mastering, playback, authentication, and all unrelated routes remain
online.