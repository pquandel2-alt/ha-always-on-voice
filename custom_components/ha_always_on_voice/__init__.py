"""HA Voice Control integration."""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_CORE_CONFIG_UPDATE, Platform
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.network import NoURLAvailableError, get_url

from .const import (
    DOMAIN,
    FRONTEND_URL,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL_PATH,
)
from .websocket_api import async_register_websocket_api

_LOGGER = logging.getLogger(__name__)
_FRONTEND_VERSION = "1.2.2"
_ISSUE_NO_HTTPS = "no_https_url"

PLATFORMS: list[Platform] = [
    Platform.ASSIST_SATELLITE,
    Platform.SELECT,
    Platform.SENSOR,
]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up the integration from a config entry."""
    if entry.title in {"Voice Assist", "HA Always-On Voice"}:
        hass.config_entries.async_update_entry(entry, title=PANEL_TITLE)
    store = hass.data.setdefault(DOMAIN, {})
    await _async_register_frontend(hass)
    if not store.get("websocket_api_registered"):
        async_register_websocket_api(hass)
        store["websocket_api_registered"] = True
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    _async_check_secure_url(hass)
    entry.async_on_unload(
        hass.bus.async_listen(
            EVENT_CORE_CONFIG_UPDATE, lambda _event: _async_check_secure_url(hass)
        )
    )
    return True


@callback
def _async_check_secure_url(hass: HomeAssistant) -> None:
    """Warn if Home Assistant has no HTTPS URL the panel can use for the microphone.

    Browsers only expose navigator.mediaDevices on secure origins, so an
    http:// address can never record audio no matter how the app is set up.
    A repairs issue (rather than blocking the config flow) reflects that the
    answer can change later in either direction and clears itself.
    """
    try:
        get_url(hass, require_ssl=True, prefer_external=True)
    except NoURLAvailableError:
        ir.async_create_issue(
            hass,
            DOMAIN,
            _ISSUE_NO_HTTPS,
            is_fixable=False,
            severity=ir.IssueSeverity.WARNING,
            translation_key=_ISSUE_NO_HTTPS,
            learn_more_url="https://github.com/pquandel2-alt/ha-always-on-voice#requirements",
        )
    else:
        ir.async_delete_issue(hass, DOMAIN, _ISSUE_NO_HTTPS)


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
    """Register the HA Voice Control panel and static assets."""
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
