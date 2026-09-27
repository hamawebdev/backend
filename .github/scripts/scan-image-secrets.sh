#!/usr/bin/env bash
# Fails if a built image carries secret material in any layer, its env or its
# build history. The image is published publicly, so secrets must only ever be
# injected at runtime.
#
# usage: scan-image-secrets.sh <image> [app-dir]
set -euo pipefail

image="$1"
app_dir="${2:-/app}"
app_rel="${app_dir#/}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failed=0

error() { echo "::error::$*"; failed=1; }

secret_names='(SECRET|PASSWORD|PASSWD|TOKEN|PRIVATE|CREDENTIAL|API_KEY|DATABASE_URL)'
secret_content='-----BEGIN [A-Z ]*PRIVATE KEY-----|postgres(ql)?://[^:/@[:space:]]+:[^@/[:space:]]+@|GOCSPX-[A-Za-z0-9_-]{10,}|(test|live)_sk_[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}'

# 1. Environment baked into the image config
docker image inspect "$image" --format '{{range .Config.Env}}{{println .}}{{end}}' > "$work/env"
if grep -Ei "^[^=]*${secret_names}[^=]*=" "$work/env"; then
  error "secret-like variable is baked into the image env"
fi

# 2. Build history (RUN/ENV/ARG commands)
docker history --no-trunc --format '{{.CreatedBy}}' "$image" > "$work/history"
if grep -Ei "${secret_names}[A-Z_]*=[^[:space:]]+" "$work/history" | grep -v 'GIT_SHA='; then
  error "secret-like value appears in the image build history"
fi
if grep -Ei -- "$secret_content" "$work/history"; then
  error "credential pattern appears in the image build history"
fi

# 3. Every layer on its own, so files deleted in a later layer are still caught
docker save "$image" -o "$work/image.tar"
mkdir "$work/image"
tar -xf "$work/image.tar" -C "$work/image"
layers=$(jq -r '.[0].Layers[]' "$work/image/manifest.json")
n=0
for layer in $layers; do
  n=$((n + 1))
  tar -tf "$work/image/$layer" > "$work/files.$n"

  # Secret files anywhere outside node_modules
  if grep -E '(^|/)\.env(\.[^/]*)?$' "$work/files.$n" | grep -vE '/node_modules/|\.(example|sample|template)$'; then
    error "layer $n contains .env files"
  fi
  if grep -E '(\.pem|\.key|\.p12|\.pfx|(^|/)id_(rsa|ed25519|ecdsa))$' "$work/files.$n" | grep -vE '/node_modules/|^(etc|usr)/'; then
    error "layer $n contains key files"
  fi

  # Credential patterns in the application's own files
  mkdir -p "$work/layer.$n"
  tar -xf "$work/image/$layer" -C "$work/layer.$n" --wildcards "$app_rel/*" --exclude="$app_rel/node_modules" 2>/dev/null || true
  if [ -d "$work/layer.$n/$app_rel" ] && grep -rIlE -- "$secret_content" "$work/layer.$n/$app_rel"; then
    error "layer $n has credential patterns in application files"
  fi
  rm -rf "$work/layer.$n"
done

echo "Scanned $n layers of $image"
if [ "$failed" -ne 0 ]; then
  exit 1
fi
echo "No secrets found"
