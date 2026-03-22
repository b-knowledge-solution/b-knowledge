"""Google Maps / Places API tool for agent workflows.

Searches for places, retrieves place details, and performs geocoding
using the Google Maps Platform APIs. Requires a Google Maps API key
provided via credentials.
"""

from typing import Any

import httpx
from loguru import logger

from .base_tool import BaseTool


class GoogleMapsTool(BaseTool):
    """Place search and geocoding tool via Google Maps API.

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "google_maps"
    description = "Place search, details, and geocoding via Google Maps API"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Execute a Google Maps API operation.

        Args:
            input_data: Must contain 'query' with a place name or address.
            config: Optional 'action' ('search' | 'geocode', default 'search'),
                'max_results' (default 5), 'language' (default 'en').
            credentials: Must contain 'api_key' for Google Maps Platform.

        Returns:
            Dict with 'result' containing place search results or geocoding data.
        """
        # Validate API key
        api_key = credentials.get("api_key") if credentials else None
        if not api_key:
            logger.warning("Google Maps tool called without API key")
            return {"error": "Google Maps API key not configured"}

        query = input_data.get("query", input_data.get("output", ""))
        if not query:
            return {"error": "No query/address provided"}

        action = config.get("action", "search")
        language = config.get("language", "en")

        try:
            if action == "geocode":
                return self._geocode(query, api_key, language)
            else:
                return self._text_search(query, api_key, language, config.get("max_results", 5))
        except httpx.HTTPStatusError as e:
            logger.error(f"Google Maps API error: status={e.response.status_code}")
            return {"error": f"Google Maps API error: {e.response.status_code}"}
        except httpx.RequestError as e:
            logger.error(f"Google Maps request failed: {e}")
            return {"error": f"Google Maps request failed: {str(e)}"}

    def _text_search(
        self, query: str, api_key: str, language: str, max_results: int,
    ) -> dict[str, Any]:
        """Search for places using Google Maps Text Search API.

        Args:
            query: Place name or search keywords.
            api_key: Google Maps API key.
            language: Response language code.
            max_results: Maximum number of results to return.

        Returns:
            Dict with 'result' containing place search results.
        """
        response = httpx.get(
            "https://maps.googleapis.com/maps/api/place/textsearch/json",
            params={
                "query": query,
                "key": api_key,
                "language": language,
            },
            timeout=15.0,
        )
        response.raise_for_status()
        data = response.json()

        if data.get("status") not in ("OK", "ZERO_RESULTS"):
            return {"error": f"Google Maps API error: {data.get('status')} - {data.get('error_message', '')}"}

        raw_results = data.get("results", [])[:max_results]
        results = [
            {
                "name": place.get("name", ""),
                "address": place.get("formatted_address", ""),
                "rating": place.get("rating"),
                "location": place.get("geometry", {}).get("location", {}),
                "types": place.get("types", []),
                "place_id": place.get("place_id", ""),
            }
            for place in raw_results
        ]

        logger.info(f"Google Maps found {len(results)} places for query: {query[:50]}")
        return {"result": results}

    def _geocode(self, address: str, api_key: str, language: str) -> dict[str, Any]:
        """Geocode an address to latitude/longitude coordinates.

        Args:
            address: Street address or location name.
            api_key: Google Maps API key.
            language: Response language code.

        Returns:
            Dict with 'result' containing geocoded location data.
        """
        response = httpx.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={
                "address": address,
                "key": api_key,
                "language": language,
            },
            timeout=15.0,
        )
        response.raise_for_status()
        data = response.json()

        if data.get("status") not in ("OK", "ZERO_RESULTS"):
            return {"error": f"Geocoding error: {data.get('status')} - {data.get('error_message', '')}"}

        results = [
            {
                "formatted_address": r.get("formatted_address", ""),
                "location": r.get("geometry", {}).get("location", {}),
                "place_id": r.get("place_id", ""),
                "types": r.get("types", []),
            }
            for r in data.get("results", [])
        ]

        logger.info(f"Geocoded address: {address[:50]} -> {len(results)} result(s)")
        return {"result": results}
