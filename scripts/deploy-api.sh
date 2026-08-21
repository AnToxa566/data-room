#!/usr/bin/env bash
# Builds apps/api's Dockerfile via Cloud Build and deploys the result to Cloud Run.
# Invoked as `npm run deploy:api`. See README.md "Deployment".
#
# Reads its config from .env (set once, then every future `npm run deploy:api` just
# works — no need to re-export or pass flags). Required, no defaults (a wrong
# project/region is not something to guess):
#   GCS_PROJECT_ID     GCP project id to deploy into. Reuses the same var the API
#                       reads for its GCS bucket (env.schema.ts) rather than adding a
#                       second "which GCP project" var — in this repo it's one project.
#   CLOUD_RUN_REGION    Cloud Run region, e.g. europe-west1
#   CLOUD_RUN_SERVICE   Cloud Run service name, e.g. dataroom-api
#
# Optional:
#   ARTIFACT_REPO       Artifact Registry Docker repo to push the image to
#                       (default: cloud-run-source-deploy). Created automatically on
#                       first run if it doesn't exist yet — see below.
#
# Anything already exported in the calling shell (e.g. CI secrets) takes precedence
# over .env — see the `source .env` guard below.
#
# Runtime env vars for the service itself (DATABASE_URL, JWT_SECRET, ...) are NOT set
# here — they're managed on the Cloud Run service directly (`gcloud run services update
# --set-env-vars` / --update-secrets, or the Console), same as any other deploy target.
# This script only builds the image and points the service at the new revision.
#
# Migrations are never run as part of this — see README.md "Deployment" → Migrations.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Load .env so the vars below only have to be set once, in that file — no need to
# export them or repeat them on the command line for every deploy. A var already
# exported in the calling shell (e.g. `VAR=x npm run deploy:api`, or CI secrets) wins
# over .env — captured before sourcing and restored after, since `source` would
# otherwise unconditionally overwrite it.
for _v in GCS_PROJECT_ID CLOUD_RUN_REGION CLOUD_RUN_SERVICE ARTIFACT_REPO; do
  eval "_preset_${_v}=\${${_v}-}"
done

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

for _v in GCS_PROJECT_ID CLOUD_RUN_REGION CLOUD_RUN_SERVICE ARTIFACT_REPO; do
  eval "if [ -n \"\${_preset_${_v}}\" ]; then ${_v}=\${_preset_${_v}}; fi"
done

: "${GCS_PROJECT_ID:?Set GCS_PROJECT_ID in .env (GCP project id to deploy into)}"
: "${CLOUD_RUN_REGION:?Set CLOUD_RUN_REGION in .env (Cloud Run region, e.g. europe-west1)}"
: "${CLOUD_RUN_SERVICE:?Set CLOUD_RUN_SERVICE in .env (Cloud Run service name, e.g. dataroom-api)}"

ARTIFACT_REPO="${ARTIFACT_REPO:-cloud-run-source-deploy}"
IMAGE="${CLOUD_RUN_REGION}-docker.pkg.dev/${GCS_PROJECT_ID}/${ARTIFACT_REPO}/${CLOUD_RUN_SERVICE}:$(git rev-parse --short HEAD)"

# Create the Artifact Registry repo on first run so this is genuinely a one-command
# deploy — `builds submit` fails with an opaque "name unknown: Repository ... not
# found" push error otherwise, and describe/create are idempotent to race safely.
if ! gcloud artifacts repositories describe "${ARTIFACT_REPO}" \
    --project="${GCS_PROJECT_ID}" --location="${CLOUD_RUN_REGION}" >/dev/null 2>&1; then
  echo "==> Artifact Registry repo ${ARTIFACT_REPO} not found in ${CLOUD_RUN_REGION} — creating it"
  gcloud artifacts repositories create "${ARTIFACT_REPO}" \
    --project="${GCS_PROJECT_ID}" \
    --repository-format=docker \
    --location="${CLOUD_RUN_REGION}" \
    --description="Images for npm run deploy:api"
fi

echo "==> Building ${IMAGE} via Cloud Build (apps/api/cloudbuild.yaml)"
gcloud builds submit . \
  --project="${GCS_PROJECT_ID}" \
  --config=apps/api/cloudbuild.yaml \
  --substitutions="_IMAGE=${IMAGE}"

echo "==> Deploying ${IMAGE} to Cloud Run service ${CLOUD_RUN_SERVICE} (${CLOUD_RUN_REGION})"
gcloud run deploy "${CLOUD_RUN_SERVICE}" \
  --project="${GCS_PROJECT_ID}" \
  --region="${CLOUD_RUN_REGION}" \
  --image="${IMAGE}" \
  --platform=managed
