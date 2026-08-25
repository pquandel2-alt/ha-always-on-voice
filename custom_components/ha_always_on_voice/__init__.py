"""HA Always-On Voice Integration."""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from .const import (
    DOMAIN,
    FRONTEND_URL,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL_PATH,
)
from .websocket_api import async_register_websocket_api

_LOGGER = logging.getLogger(__name__)
_FRONTEND_VERSION = "0.3.0"

PLATFORMS: list[Platform] = [Platform.ASSIST_SATELLITE, Platform.SELECT]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up the integration from a config entry."""
    store = hass.data.setdefault(DOMAIN, {})
    await _async_register_frontend(hass)
    if not store.get("websocket_api_registered"):
        async_register_websocket_api(hass)
        store["websocket_api_registered"] = True
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload the integration."""
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    store = hass.data.get(DOMAIN, {})
    store.pop("satellite", None)
    if store.get("panel_registered"):
        frontend.async_remove_panel(hass, PANEL_URL_PATH)
        store["panel_registered"] = False
    return unloaded


async def _async_register_frontend(hass: HomeAssistant) -> None:
    """Register the Voice Assist panel and static assets."""
    store = hass.data[DOMAIN]

    www = Path(__file__).parent / "www"

    if not store.get("frontend_registered"):
        await hass.http.async_register_static_paths(
            [
                StaticPathConfig(
                    f"/static/{DOMAIN}",
                    str(www),
                    False,
                ),
                StaticPathConfig(
                    "/ha_voice_app",
                    str(www / "app"),
                    False,
                ),
            ]
        )
        store["frontend_registered"] = True

    if store.get("panel_registered"):
        frontend.async_remove_panel(hass, PANEL_URL_PATH)

    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name="ha-voice-panel",
        module_url=f"{FRONTEND_URL}?v={_FRONTEND_VERSION}",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        require_admin=False,
        config={},
        embed_iframe=False,
    )
    store["panel_registered"] = True
