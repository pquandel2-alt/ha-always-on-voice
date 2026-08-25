"""Assist satellite entity for HA Always-On Voice.

Represents the browser/PWA as an Assist satellite device so it shows up
under Settings -> Voice assistants -> Devices, with pipeline and VAD
sensitivity configurable there (via the select entities in select.py).

Unlike a physical satellite there is no on-device wake word: the browser
streams audio continuously and the STT stage starts as soon as the
websocket bridge (see websocket_api.py) accepts a connection.
"""

from __future__ import annotations

from collections.abc import AsyncIterable, Callable
import logging

from homeassistant.components.assist_pipeline import PipelineEvent, async_get_pipeline
from homeassistant.components.assist_satellite import (
    AssistSatelliteConfiguration,
    AssistSatelliteEntity,
    AssistSatelliteEntityDescription,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, PANEL_TITLE

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the Assist satellite entity."""
    entity = AlwaysOnVoiceSatellite(entry)
    hass.data[DOMAIN]["satellite"] = entity
    async_add_entities([entity])


class AlwaysOnVoiceSatellite(AssistSatelliteEntity):
    """Browser-based Assist satellite with no on-device wake word."""

    entity_description = AssistSatelliteEntityDescription(key="assist_satellite")
    _attr_has_entity_name = True
    _attr_name = None

    def __init__(self, entry: ConfigEntry) -> None:
        """Initialize the satellite entity."""
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}-satellite"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=PANEL_TITLE,
            manufacturer="ha-always-on-voice",
            model="Browser PWA Satellite",
        )
        self._event_callback: Callable[[PipelineEvent], None] | None = None

    @property
    def pipeline_entity_id(self) -> str | None:
        """Entity ID of the pipeline select entity for this device."""
        return er.async_get(self.hass).async_get_entity_id(
            "select", DOMAIN, f"{self._entry.entry_id}-pipeline"
        )

    @property
    def vad_sensitivity_entity_id(self) -> str | None:
        """Entity ID of the VAD sensitivity select entity for this device."""
        return er.async_get(self.hass).async_get_entity_id(
            "select", DOMAIN, f"{self._entry.entry_id}-vad_sensitivity"
        )

    @property
    def animation_style(self) -> str:
        """Return the animation selected for the browser UI."""
        return self._config_select_value("animation_style", "orb")

    @property
    def tts_playback(self) -> str:
        """Return whether browser TTS playback is enabled."""
        return self._config_select_value("tts_playback", "pipeline")

    @property
    def tts_engine(self) -> str | None:
        """Return the TTS engine supplied by the selected Assist pipeline."""
        try:
            return async_get_pipeline(self.hass, self._resolve_pipeline()).tts_engine
        except (HomeAssistantError, KeyError, RuntimeError, ValueError):
            return None

    def _config_select_value(self, key: str, default: str) -> str:
        """Read a local configuration select value."""
        entity_id = er.async_get(self.hass).async_get_entity_id(
            "select", DOMAIN, f"{self._entry.entry_id}-{key}"
        )
        if entity_id is None or (state := self.hass.states.get(entity_id)) is None:
            return default
        return state.state

    @callback
    def async_get_configuration(self) -> AssistSatelliteConfiguration:
        """Report no on-device wake words; the browser streams continuously."""
        return AssistSatelliteConfiguration(
            available_wake_words=[],
            active_wake_words=[],
            max_active_wake_words=0,
        )

    async def async_set_configuration(
        self, config: AssistSatelliteConfiguration
    ) -> None:
        """No configurable wake words on this satellite."""
        return None

    @callback
    def on_pipeline_event(self, event: PipelineEvent) -> None:
        """Forward pipeline events to whoever is currently running a pipeline."""
        if self._event_callback is not None:
            self._event_callback(event)

    async def async_run_from_browser(
        self,
        audio_stream: AsyncIterable[bytes],
        event_callback: Callable[[PipelineEvent], None],
    ) -> None:
        """Run a pipeline for audio streamed from the browser."""
        self._event_callback = event_callback
        try:
            await self.async_accept_pipeline_from_satellite(audio_stream)
        finally:
            # A scheduled long-listening refresh may replace this callback
            # before the cancelled run unwinds. Do not clear the newer run's
            # callback from the older run's finally block.
            if self._event_callback is event_callback:
                self._event_callback = None
