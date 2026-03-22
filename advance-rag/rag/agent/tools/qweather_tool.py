"""QWeather API tool for agent workflows.

Retrieves weather data, life indices, and air quality information from the
QWeather API. Requires an API key provided via credentials.
"""

from typing import Any

import httpx
from loguru import logger

from .base_tool import BaseTool


class QWeatherTool(BaseTool):
    """Weather data retrieval tool via QWeather API.

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "qweather"
    description = "Weather, air quality, and life indices via QWeather API"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Fetch weather data from QWeather API.

        The tool first resolves a city/location name to a QWeather location ID,
        then fetches the requested data type.

        Args:
            input_data: Must contain 'query' or 'output' with a city/location name.
            config: Optional 'type' ('weather' | 'indices' | 'airquality', default 'weather'),
                'time_period' ('now' | '3d' | '7d', default 'now'),
                'language' (default 'en'),
                'user_type' ('free' | 'paid', default 'free').
            credentials: Must contain 'api_key' for QWeather API.

        Returns:
            Dict with 'result' containing weather/indices/air quality data.
        """
        # Validate API key
        api_key = credentials.get("api_key") if credentials else None
        if not api_key:
            return {"error": "QWeather API key not configured"}

        # Extract location name from input
        location = input_data.get("query", input_data.get("output", ""))
        if not location or not location.strip():
            return {"error": "No location/city name provided"}

        language = config.get("language", "en")
        data_type = config.get("type", "weather")
        time_period = config.get("time_period", "now")
        user_type = config.get("user_type", "free")

        try:
            # Step 1: Resolve location name to QWeather location ID
            geo_response = httpx.get(
                "https://geoapi.qweather.com/v2/city/lookup",
                params={"location": location.strip(), "key": api_key, "lang": language},
                timeout=10.0,
            )
            geo_response.raise_for_status()
            geo_data = geo_response.json()

            if geo_data.get("code") != "200" or not geo_data.get("location"):
                return {"error": f"Location '{location}' not found (code: {geo_data.get('code')})"}

            location_id = geo_data["location"][0]["id"]
            location_name = geo_data["location"][0].get("name", location)

            # Choose API base URL based on subscription type
            base_url = (
                "https://api.qweather.com/v7"
                if user_type == "paid"
                else "https://devapi.qweather.com/v7"
            )

            # Step 2: Fetch the requested data type
            if data_type == "weather":
                return self._fetch_weather(base_url, location_id, location_name, api_key, language, time_period)
            elif data_type == "indices":
                return self._fetch_indices(base_url, location_id, location_name, api_key, language)
            elif data_type == "airquality":
                return self._fetch_air_quality(base_url, location_id, location_name, api_key, language)
            else:
                return {"error": f"Unknown data type: {data_type}"}

        except httpx.HTTPStatusError as e:
            logger.error(f"QWeather API error: status={e.response.status_code}")
            return {"error": f"QWeather API error: {e.response.status_code}"}
        except Exception as e:
            logger.error(f"QWeather request failed: {e}")
            return {"error": f"QWeather request failed: {str(e)}"}

    def _fetch_weather(
        self, base_url: str, location_id: str, location_name: str,
        api_key: str, language: str, time_period: str,
    ) -> dict[str, Any]:
        """Fetch current or forecast weather data.

        Args:
            base_url: QWeather API base URL.
            location_id: Resolved QWeather location ID.
            location_name: Human-readable location name.
            api_key: QWeather API key.
            language: Response language code.
            time_period: Time period ('now', '3d', '7d').

        Returns:
            Dict with 'result' containing weather data.
        """
        response = httpx.get(
            f"{base_url}/weather/{time_period}",
            params={"location": location_id, "key": api_key, "lang": language},
            timeout=10.0,
        )
        response.raise_for_status()
        data = response.json()

        if data.get("code") != "200":
            return {"error": f"QWeather error code: {data.get('code')}"}

        if time_period == "now":
            result = {"location": location_name, "current": data.get("now", {})}
        else:
            result = {"location": location_name, "daily": data.get("daily", [])}

        logger.info(f"QWeather returned weather data for {location_name}")
        return {"result": result}

    def _fetch_indices(
        self, base_url: str, location_id: str, location_name: str,
        api_key: str, language: str,
    ) -> dict[str, Any]:
        """Fetch daily life indices (UV, comfort, dressing, etc.).

        Args:
            base_url: QWeather API base URL.
            location_id: Resolved QWeather location ID.
            location_name: Human-readable location name.
            api_key: QWeather API key.
            language: Response language code.

        Returns:
            Dict with 'result' containing life indices.
        """
        response = httpx.get(
            f"{base_url}/indices/1d",
            params={"location": location_id, "key": api_key, "lang": language, "type": "0"},
            timeout=10.0,
        )
        response.raise_for_status()
        data = response.json()

        if data.get("code") != "200":
            return {"error": f"QWeather error code: {data.get('code')}"}

        logger.info(f"QWeather returned indices for {location_name}")
        return {"result": {"location": location_name, "indices": data.get("daily", [])}}

    def _fetch_air_quality(
        self, base_url: str, location_id: str, location_name: str,
        api_key: str, language: str,
    ) -> dict[str, Any]:
        """Fetch current air quality data.

        Args:
            base_url: QWeather API base URL.
            location_id: Resolved QWeather location ID.
            location_name: Human-readable location name.
            api_key: QWeather API key.
            language: Response language code.

        Returns:
            Dict with 'result' containing air quality data.
        """
        response = httpx.get(
            f"{base_url}/air/now",
            params={"location": location_id, "key": api_key, "lang": language},
            timeout=10.0,
        )
        response.raise_for_status()
        data = response.json()

        if data.get("code") != "200":
            return {"error": f"QWeather error code: {data.get('code')}"}

        logger.info(f"QWeather returned air quality for {location_name}")
        return {"result": {"location": location_name, "air_quality": data.get("now", {})}}
