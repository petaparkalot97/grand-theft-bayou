import os
import aiohttp
import json
import asyncio
import time
import re

# Cache model lists for 1 hour to avoid extra API latency
_MODEL_CACHE = {
    "openrouter": [],
    "groq": [],
    "last_fetched": 0
}

REFUSAL_PATTERNS = [
    r"i'?m sorry,?\s*but i (can'?t|cannot)",
    r"i am sorry,?\s*but i (can'?t|cannot)",
    r"as an ai language model",
    r"as an ai,",
    r"as an ai\b",
    r"i am an ai\b",
    r"i'?m an ai\b",
    r"how (can|may) i (help|assist) you",
    r"is there anything else i can (help|assist)",
    r"i cannot fulfill this request",
    r"i cannot generate (explicit|harmful|illegal|sexual|sexually)",
    r"i cannot assist with that",
    r"i am unable to help with that",
    r"i'm unable to fulfill this request",
]
REFUSAL_RE = re.compile("|".join(REFUSAL_PATTERNS), re.IGNORECASE)

def _is_canned_refusal(text: str) -> bool:
    """Detects standard LLM corporate refusal boilerplate."""
    if not text:
        return True
    return bool(REFUSAL_RE.search(text.strip()))

def _clean_reasoning_tags(text: str) -> str:
    """Removes <think>...</think> and unclosed <think> reasoning blocks from model outputs."""
    if not text or not isinstance(text, str):
        return ""
    # Remove closed <think>...</think> blocks first
    cleaned = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL | re.IGNORECASE)
    # Remove unclosed <think>... blocks if max_tokens cut off the closing tag
    cleaned = re.sub(r'<think>.*$', '', cleaned, flags=re.DOTALL | re.IGNORECASE)
    return cleaned.strip()

async def _refresh_model_cache(session: aiohttp.ClientSession):
    now = time.time()
    if now - _MODEL_CACHE["last_fetched"] < 3600 and (_MODEL_CACHE["openrouter"] or _MODEL_CACHE["groq"]):
        return

    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    groq_key = os.getenv("GROQ_API_KEY")

    # 1. Fetch OpenRouter free models
    if openrouter_key and not openrouter_key.startswith("<"):
        try:
            async with session.get("https://openrouter.ai/api/v1/models", timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    models = [m["id"] for m in data.get("data", []) if isinstance(m, dict) and m.get("id", "").endswith(":free")]
                    if models:
                        _MODEL_CACHE["openrouter"] = models
        except Exception as e:
            print(f"[AI Cache] OpenRouter model list fetch failed: {e}")

    # 2. Fetch Groq models
    if groq_key and not groq_key.startswith("<"):
        try:
            headers = {"Authorization": f"Bearer {groq_key}"}
            async with session.get("https://api.groq.com/openai/v1/models", headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    valid_keywords = ["gpt-oss", "qwen3.8", "qwen3.6", "compound", "llama"]
                    exclude_keywords = ["guard", "whisper", "orpheus", "allam", "embedding"]
                    models = []
                    for item in data.get("data", []):
                        if isinstance(item, dict):
                            mid = item.get("id", "")
                            mid_lower = mid.lower()
                            if any(k in mid_lower for k in valid_keywords) and not any(x in mid_lower for x in exclude_keywords):
                                models.append(mid)
                    if models:
                        _MODEL_CACHE["groq"] = models
        except Exception as e:
            print(f"[AI Cache] Groq model list fetch failed: {e}")

    _MODEL_CACHE["last_fetched"] = now

async def get_ai_response(messages: list, max_tokens: int = 1500, temperature: float = 0.95) -> str:
    """
    Resilient multi-provider AI text generation:
    Automatically fetches live active free models from OpenRouter and Groq,
    and falls back through the available model chain, rejecting canned refusals.
    """
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    groq_key = os.getenv("GROQ_API_KEY")

    async with aiohttp.ClientSession() as session:
        await _refresh_model_cache(session)

        # 1. Try OpenRouter Models
        if openrouter_key and not openrouter_key.startswith("<"):
            models = _MODEL_CACHE["openrouter"] or [
                "nex-agi/nex-n2.5-mini:free",
                "meta-llama/llama-3.3-70b-instruct:free",
                "google/gemini-2.5-flash:free",
                "qwen/qwen-2.5-72b-instruct:free"
            ]
            headers = {
                "Authorization": f"Bearer {openrouter_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/LisaBot",
                "X-Title": "Lisa Discord Bot"
            }
            for model_id in models[:5]:
                try:
                    payload = {
                        "model": model_id,
                        "messages": messages,
                        "max_tokens": max_tokens,
                        "temperature": temperature
                    }
                    async with session.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        json=payload,
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=20)
                    ) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            choices = data.get("choices")
                            if choices and len(choices) > 0:
                                msg = choices[0].get("message", {})
                                content = msg.get("content")
                                if content and isinstance(content, str):
                                    cleaned = _clean_reasoning_tags(content)
                                    if cleaned and not _is_canned_refusal(cleaned):
                                        return cleaned
                                    elif cleaned:
                                        print(f"[AI Fallback] OpenRouter model {model_id} returned a canned refusal: {cleaned[:60]}...")
                        else:
                            print(f"[AI Fallback] OpenRouter model {model_id} returned status {resp.status}")
                except Exception as e:
                    print(f"[AI Fallback] OpenRouter model {model_id} error: {e}")

        # 2. Try Groq API as resilient backup
        if groq_key and not groq_key.startswith("<"):
            models = _MODEL_CACHE["groq"] or [
                "openai/gpt-oss-120b",
                "qwen/qwen3.8-27b",
                "openai/gpt-oss-20b",
                "groq/compound"
            ]
            headers = {
                "Authorization": f"Bearer {groq_key}",
                "Content-Type": "application/json"
            }
            for model_id in models[:5]:
                try:
                    payload = {
                        "model": model_id,
                        "messages": messages,
                        "max_tokens": max_tokens,
                        "temperature": temperature
                    }
                    async with session.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        json=payload,
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=15)
                    ) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            choices = data.get("choices")
                            if choices and len(choices) > 0:
                                msg = choices[0].get("message", {})
                                content = msg.get("content")
                                if content and isinstance(content, str):
                                    cleaned = _clean_reasoning_tags(content)
                                    if cleaned and not _is_canned_refusal(cleaned):
                                        return cleaned
                                    elif cleaned:
                                        print(f"[AI Fallback] Groq model {model_id} returned a canned refusal: {cleaned[:60]}...")
                        else:
                            print(f"[AI Fallback] Groq model {model_id} returned status {resp.status}")
                except Exception as e:
                    print(f"[AI Fallback] Groq model {model_id} error: {e}")

    return "Nice try, stooge, but my safety filters just had a mini panic attack. Try asking that in a way that doesn't trigger the corporate nanny bots. 😉"
