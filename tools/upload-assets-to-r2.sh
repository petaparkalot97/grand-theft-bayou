#!/bin/bash
# Bulk-uploads the extracted asset library (Z:\GITHUB\_ASSETS\_extracted) to the
# bayou-assets R2 bucket, and builds a manifest.json describing every model
# file found (for the map editor's paginated asset library).
# Scope: Buildings-Shops, Props-Furniture, Roads-Infrastructure, Vehicles,
# Dungeons-Interiors — the categories that make sense as placeable static
# world objects. Characters-Animations and Weapons-Tech are deliberately
# excluded from this pass (rigged character/weapon assets need a different
# integration path than "place a building"); see AGENT_LOG.md.

set -u
ROOT="/z/GITHUB/_ASSETS/_extracted"
BUCKET="bayou-assets"
CATEGORIES=("Buildings-Shops" "Props-Furniture" "Roads-Infrastructure" "Vehicles" "Dungeons-Interiors")
MANIFEST="/z/github/bayou/tools/r2-manifest.json"
LOG="/z/github/bayou/tools/upload-log.txt"

content_type_for() {
  case "${1,,}" in
    *.fbx) echo "application/octet-stream" ;;
    *.glb) echo "model/gltf-binary" ;;
    *.gltf) echo "model/gltf+json" ;;
    *.obj) echo "text/plain" ;;
    *.mtl) echo "text/plain" ;;
    *.jpg|*.jpeg) echo "image/jpeg" ;;
    *.png) echo "image/png" ;;
    *.tga) echo "application/octet-stream" ;;
    *.bmp) echo "image/bmp" ;;
    *) echo "application/octet-stream" ;;
  esac
}

> "$LOG"
echo "[" > "$MANIFEST"
first=1
total=0
ok=0
fail=0

for cat in "${CATEGORIES[@]}"; do
  [ -d "$ROOT/$cat" ] || continue
  while IFS= read -r -d '' f; do
    total=$((total+1))
    rel="${f#$ROOT/}"
    key="models/$rel"
    ct=$(content_type_for "$f")
    # retry once on failure (flaky network)
    if npx --yes wrangler r2 object put "$BUCKET/$key" --file="$f" --content-type="$ct" --remote -y >>"$LOG" 2>&1; then
      ok=$((ok+1))
    else
      sleep 1
      if npx --yes wrangler r2 object put "$BUCKET/$key" --file="$f" --content-type="$ct" --remote -y >>"$LOG" 2>&1; then
        ok=$((ok+1))
      else
        fail=$((fail+1))
        echo "FAILED: $key" >> "$LOG"
      fi
    fi

    # manifest entry for actual model files only (not textures)
    case "${f,,}" in
      *.fbx|*.glb|*.gltf|*.obj)
        pack=$(echo "$rel" | cut -d/ -f2)
        name=$(basename "$f")
        [ $first -eq 0 ] && echo "," >> "$MANIFEST"
        first=0
        printf '{"category":"%s","pack":"%s","file":"%s","url":"https://pub-9df998682dee433b87b722d575bee3d5.r2.dev/%s"}' \
          "$cat" "$pack" "$name" "$key" >> "$MANIFEST"
        ;;
    esac

    if [ $((total % 25)) -eq 0 ]; then
      echo "progress: $total done ($ok ok, $fail failed)" | tee -a "$LOG"
    fi
  done < <(find "$ROOT/$cat" -type f -print0)
done

echo "]" >> "$MANIFEST"
echo "UPLOAD COMPLETE: $total total, $ok ok, $fail failed" | tee -a "$LOG"
