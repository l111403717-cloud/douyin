import json
import re
import urllib.error
import urllib.request


def clean_api_key(key):
    if not key or not isinstance(key, str):
        return ""
    key = key.strip()
    # 自动识别并纠正不小心粘贴重复的 sk- 密钥
    if key.count("sk-") > 1:
        parts = [p for p in key.split("sk-") if p]
        if parts:
            return "sk-" + parts[0]
    return key


def get_hermes_settings(settings=None):
    settings = settings or {}
    hermes = settings.get("hermes") if isinstance(settings.get("hermes"), dict) else {}
    return {
        "gatewayUrl": str(hermes.get("gatewayUrl") or "http://127.0.0.1:8642").rstrip("/"),
        "apiKey": clean_api_key(str(hermes.get("apiKey") or "")),
        "timeout": max(10, min(int(hermes.get("timeout") or 300), 1800)),
    }


def public_hermes_settings(settings=None):
    hermes = get_hermes_settings(settings)
    return {
        "gatewayUrl": hermes["gatewayUrl"],
        "apiKeyConfigured": bool(hermes["apiKey"]),
        "timeout": hermes["timeout"],
    }


def hermes_request(path, method="GET", payload=None, timeout=None, settings=None):
    hermes = get_hermes_settings(settings)
    base_url = hermes['gatewayUrl']
    clean_path = path.lstrip('/')
    
    # 避免 https://xxx/v1 和 /v1/models 拼接导致重复的 /v1/v1/
    if base_url.endswith("/v1") and clean_path.startswith("v1/"):
        clean_path = clean_path[3:]

    url = f"{base_url}/{clean_path}"
    headers = {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    if hermes["apiKey"]:
        headers["Authorization"] = f"Bearer {hermes['apiKey']}"
    body = None
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout or hermes["timeout"]) as response:
            raw = response.read().decode("utf-8", errors="replace")
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[-1000:]
        if exc.code == 401 or exc.code == 403:
            raise RuntimeError(f"API 鉴权失败（HTTP {exc.code}），请检查 API Key 是否有效：{detail}") from exc
        raise RuntimeError(f"API 请求失败（HTTP {exc.code}）：{detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"无法连接 API 地址：{exc.reason}") from exc
