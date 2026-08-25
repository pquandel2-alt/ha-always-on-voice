"""Pipeline and VAD sensitivity selectors for the Voice Assist device.

These reuse assist_pipeline's base select entities (the same pattern used
by wyoming/esphome satellites) so the pipeline and "finished speaking"
sensitivity show up as configurable dropdowns on the device page under
Settings -> Voice assistants -> Devices.
"""

from __future__ import annotations

from homeassistant.components.assist_pipeline.select import (
    AssistPipelineSelect,
    VadSensitivitySelect,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, PANEL_TITLE


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the pipeline and VAD sensitivity selects."""
    async_add_entities(
        [
            AlwaysOnVoicePipelineSelect(hass, entry),
            AlwaysOnVoiceVadSensitivitySelect(hass, entry),
        ]
    )


def _device_info(entry: ConfigEntry) -> DeviceInfo:
    return DeviceInfo(
        identifiers={(DOMAIN, entry.entry_id)},
        name=PANEL_TITLE,
        manufacturer="ha-always-on-voice",
        model="Browser PWA Satellite",
    )


class AlwaysOnVoicePipelineSelect(AssistPipelineSelect):
    """Pipeline selector for the Voice Assist device."""

    _attr_has_entity_name = True

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Initialize the pipeline selector."""
        super().__init__(hass, DOMAIN, entry.entry_id)
        self._attr_device_info = _device_info(entry)


class AlwaysOnVoiceVadSensitivitySelect(VadSensitivitySelect):
    """VAD sensitivity selector for the Voice Assist device."""

    _attr_has_entity_name = True

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Initialize the VAD sensitivity selector."""
        super().__init__(hass, entry.entry_id)
        self._attr_device_info = _device_info(entry)
