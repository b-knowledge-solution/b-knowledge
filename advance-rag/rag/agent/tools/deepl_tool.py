"""DeepL translation tool for agent workflows.

Translates text between languages using the DeepL API. Requires a DeepL
API authentication key provided via credentials.
"""

from typing import Any

import httpx
from loguru import logger

from .base_tool import BaseTool


class DeepLTool(BaseTool):
    """Text translation tool powered by the DeepL API.

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "deepl"
    description = "Translate text using the DeepL API"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Translate text via the DeepL REST API.

        Args:
            input_data: Must contain 'text' or 'query' or 'output' with the text to translate.
            config: Optional 'source_lang' (e.g. 'ZH'), 'target_lang' (e.g. 'EN-GB', default 'EN-GB').
            credentials: Must contain 'api_key' for DeepL API authentication.

        Returns:
            Dict with 'result' containing translated text, detected source
            language, and target language.
        """
        # Validate API key exists in credentials
        api_key = credentials.get("api_key") if credentials else None
        if not api_key:
            logger.warning("DeepL tool called without API key")
            return {"error": "DeepL API key not configured"}

        # Extract text and language configuration
        text = input_data.get("text", input_data.get("query", input_data.get("output", "")))
        if not text:
            return {"error": "No text provided for translation"}

        source_lang = config.get("source_lang")
        target_lang = config.get("target_lang", "EN-GB")

        # Determine API base URL based on key type (free keys end with :fx)
        base_url = "https://api-free.deepl.com" if api_key.endswith(":fx") else "https://api.deepl.com"

        try:
            # Call the DeepL v2 translate endpoint
            payload: dict[str, Any] = {
                "text": [text],
                "target_lang": target_lang,
            }
            # Source language is optional -- DeepL auto-detects if omitted
            if source_lang:
                payload["source_lang"] = source_lang

            response = httpx.post(
                f"{base_url}/v2/translate",
                headers={"Authorization": f"DeepL-Auth-Key {api_key}"},
                json=payload,
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()

            translations = data.get("translations", [])
            if not translations:
                return {"error": "DeepL returned no translations"}

            translated_text = translations[0].get("text", "")
            detected_lang = translations[0].get("detected_source_language", "")

            logger.info(f"DeepL translated {len(text)} chars ({detected_lang} -> {target_lang})")

            return {
                "result": {
                    "translated_text": translated_text,
                    "detected_source_language": detected_lang,
                    "target_language": target_lang,
                }
            }
        except httpx.HTTPStatusError as e:
            logger.error(f"DeepL API error: status={e.response.status_code}")
            return {"error": f"DeepL API error: {e.response.status_code}"}
        except httpx.RequestError as e:
            logger.error(f"DeepL request failed: {e}")
            return {"error": f"DeepL request failed: {str(e)}"}
