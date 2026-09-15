#!/usr/bin/env python3
import os
import sys
import json
import time
import argparse
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path

# Try to load python-dotenv if available
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # Basic fallback to parse .env manually if python-dotenv is not installed
    env_path = Path('.env')
    if env_path.exists():
        for line in env_path.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())

API_URL = "https://api.fish.audio/v1/tts"
AUDIO_DIR = Path("assets/audio/voice")
MANIFEST_PATH = AUDIO_DIR / "manifest.json"

def get_api_key():
    for key in ["FISH_AUDIO_API", "FISH_AUDIO_API_KEY", "FISH_API_KEY"]:
        val = os.environ.get(key)
        if val:
            return val
    return None

def generate_tts(text, model, reference_id, api_key):
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "model": model
    }
    
    payload = {
        "text": text,
        "format": "mp3",
        "latency": "normal"
    }
    
    if reference_id and reference_id.lower() not in ("none", "off", "default"):
        payload["reference_id"] = reference_id
        
    req = urllib.request.Request(API_URL, data=json.dumps(payload).encode('utf-8'), headers=headers, method='POST')
    
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            if response.status == 200:
                audio_bytes = response.read()
                if not audio_bytes or len(audio_bytes) < 1000:
                    return None, "Response too small or empty"
                return audio_bytes, None
            else:
                return None, f"HTTP {response.status}"
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        return None, f"HTTP {e.code}: {error_body}"
    except Exception as e:
        return None, str(e)

def main():
    parser = argparse.ArgumentParser(description="Generate Game Voices using Fish Audio API")
    parser.add_argument("--character", type=str, help="Generate only for this character prefix")
    parser.add_argument("--id", type=str, help="Generate only a specific dialogue ID")
    parser.add_argument("--force", action="store_true", help="Regenerate existing files")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be generated without calling the API")
    parser.add_argument("--concurrency", type=int, default=1, help="Number of concurrent requests (default: 1)")
    
    args = parser.parse_args()
    
    api_key = get_api_key()
    if not api_key and not args.dry_run:
        print("ERROR: API key not found. Please set FISH_AUDIO_API in your environment or .env file.")
        sys.exit(1)
        
    try:
        with open("data/game-dialogue.json", "r", encoding="utf-8") as f:
            dialogue_data = json.load(f)
        with open("data/game-voices.json", "r", encoding="utf-8") as f:
            voices_data = json.load(f)
    except FileNotFoundError as e:
        print(f"ERROR: Configuration file missing: {e}")
        sys.exit(1)
        
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    
    lines = dialogue_data.get("lines", [])
    characters_config = voices_data.get("characters", {})
    
    # Update manifest to integrate into the game without JS changes
    manifest = {}
    if MANIFEST_PATH.exists():
        try:
            with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
                manifest = json.load(f)
        except Exception:
            pass
            
    stats = {"SUCCESS": 0, "SKIPPED": 0, "FAILED": 0, "TOTAL": 0}
    failures = []
    
    for line in lines:
        did = line["id"]
        who = line["character"]
        text = line["text"]
        
        char_key = who.replace("(V.O.)", "").strip().upper()
        prefix = ''.join(c if c.isalnum() else '_' for c in char_key.lower()) or 'npc'
        
        if args.character and prefix != args.character.lower():
            continue
        if args.id and did != args.id:
            continue
            
        stats["TOTAL"] += 1
        
        voice_cfg = characters_config.get(prefix)
        if not voice_cfg:
            print(f"[FAILED] {did} - No voice configuration found for character '{prefix}'")
            stats["FAILED"] += 1
            failures.append((did, "No voice configuration"))
            continue
            
        model = voice_cfg.get("model", "s2.1-pro-free")
        ref_id = voice_cfg.get("voice_id")
        
        out_file = AUDIO_DIR / f"{did}.mp3"
        manifest[f"{who}::{text}"] = f"{did}.mp3"
        
        if out_file.exists() and not args.force:
            print(f"[SKIP] {did}.mp3 already exists")
            stats["SKIPPED"] += 1
            continue
            
        if args.dry_run:
            print(f"[DRY-RUN] Would generate {did}.mp3 using model {model} (ref: {ref_id})")
            stats["SUCCESS"] += 1
            continue
            
        print(f"[GEN]  {did}.mp3 ({who}) -> {text[:40]}...")
        
        # Retries
        success = False
        for attempt in range(1, 4):
            audio_bytes, err = generate_tts(text, model, ref_id, api_key)
            if audio_bytes:
                with open(out_file, "wb") as f:
                    f.write(audio_bytes)
                stats["SUCCESS"] += 1
                success = True
                break
            else:
                print(f"       Attempt {attempt} failed: {err}")
                if attempt < 3:
                    time.sleep(2 ** attempt)  # 2s, 4s backoff
                    
        if not success:
            stats["FAILED"] += 1
            failures.append((did, err))
            
        # Rate limit friendliness
        if success:
            time.sleep(0.5)
            
    # Save manifest
    if not args.dry_run:
        with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)
            
    print("\n====================================")
    print("VOICE GENERATION COMPLETE")
    print("====================================")
    print(f"Generated: {stats['SUCCESS']}")
    print(f"Skipped:   {stats['SKIPPED']}")
    print(f"Failed:    {stats['FAILED']}")
    print(f"Total:     {stats['TOTAL']}")
    
    if failures:
        print("\nFailures:")
        for did, err in failures:
            print(f" - {did}: {err}")
            
    if stats['FAILED'] > 0:
        sys.exit(1)

if __name__ == "__main__":
    main()
