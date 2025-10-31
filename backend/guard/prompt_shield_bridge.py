"""
Prompt Shield Bridge - TypeScript-compatible interface
"""

from backend.guard.prompt_shield import shield


def shield_check_bridge(text: str) -> dict:
    """
    Bridge function for TypeScript orchestrator.
    
    Returns:
        {
            "action": "block" | "sanitize" | "allow",
            "reason": str,
            "text": str (sanitized if action == "sanitize")
        }
    """
    result = shield(text)
    
    # If sanitize, remove PII (simple version)
    sanitized_text = text
    if result["action"] == "sanitize":
        import re
        # Remove email
        sanitized_text = re.sub(r'\b[\w\.-]+@[\w\.-]+\.\w+\b', '[EMAIL]', sanitized_text)
        # Remove phone numbers
        sanitized_text = re.sub(r'\b\d{10,11}\b', '[PHONE]', sanitized_text)
        # Remove personal numbers
        sanitized_text = re.sub(r'\b\d{8}-\d{4}\b', '[PERSONNR]', sanitized_text)
    
    return {
        "action": result["action"],
        "reason": result["reason"],
        "text": sanitized_text,
    }


if __name__ == "__main__":
    import json
    import sys
    
    raw = sys.stdin.read()
    payload = json.loads(raw or "{}")
    text = payload.get("text", "")
    
    result = shield_check_bridge(text)
    print(json.dumps(result, ensure_ascii=False))

