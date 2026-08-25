"""Pipeline and VAD sensitivity selectors for the HA Voice Control device.

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
from homeassistant.components.select import SelectEntity, SelectEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

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
            AlwaysOnVoiceAnimationStyleSelect(entry),
            AlwaysOnVoiceTtsPlaybackSelect(entry),
        ]
    )


def _device_info(entry: ConfigEntry) -> DeviceInfo:
    return DeviceInfo(
        identifiers={(DOMAIN, entry.entry_id)},
        name=PANEL_TITLE,
        manufacturer="HA Voice Control",
        model="Browser Voice Satellite",
    )


class AlwaysOnVoicePipelineSelect(AssistPipelineSelect):
    """Pipeline selector for the HA Voice Control device."""

    _attr_has_entity_name = True

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Initialize the pipeline selector."""
        super().__init__(hass, DOMAIN, entry.entry_id)
        self._attr_device_info = _device_info(entry)


class AlwaysOnVoiceVadSensitivitySelect(VadSensitivitySelect):
    """VAD sensitivity selector for the HA Voice Control device."""

    _attr_has_entity_name = True

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Initialize the VAD sensitivity selector."""
        super().__init__(hass, entry.entry_id)
        self._attr_device_info = _device_info(entry)


class _RestoredConfigSelect(SelectEntity, RestoreEntity):
    """Base class for locally stored HA Voice Control configuration."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    async def async_added_to_hass(self) -> None:
        """Restore the previously selected option."""
        await super().async_added_to_hass()
        state = await self.async_get_last_state()
        if state is not None and state.state in self.options:
            self._attr_current_option = state.state

    async def async_select_option(self, option: str) -> None:
        """Select an option."""
        if option not in self.options:
            raise ValueError(f"Unsupported option: {option}")
        self._attr_current_option = option
        self.async_write_ha_state()


class AlwaysOnVoiceAnimationStyleSelect(_RestoredConfigSelect):
    """Choose the animation rendered by the browser UI."""

    entity_description = SelectEntityDescription(
        key="animation_style",
        translation_key="animation_style",
        entity_category=EntityCategory.CONFIG,
    )
    _attr_options = [
        "orb",
        "liquid_equalizer",
        "spectrum",
        "aurora",
        "pulse",
        "constellation",
        "minimal",
    ]
    _attr_current_option = "orb"

    def __init__(self, entry: ConfigEntry) -> None:
        """Initialize the animation selector."""
        self._attr_unique_id = f"{entry.entry_id}-animation_style"
        self._attr_device_info = _device_info(entry)


class AlwaysOnVoiceTtsPlaybackSelect(_RestoredConfigSelect):
    """Enable or mute TTS playback in the browser."""

    entity_description = SelectEntityDescription(
        key="tts_playback",
        translation_key="tts_playback",
        entity_category=EntityCategory.CONFIG,
    )
    _attr_options = ["pipeline", "browser", "muted"]
    _attr_current_option = "pipeline"

    def __init__(self, entry: ConfigEntry) -> None:
        """Initialize the TTS playback selector."""
        self._attr_unique_id = f"{entry.entry_id}-tts_playback"
        self._attr_device_info = _device_info(entry)
