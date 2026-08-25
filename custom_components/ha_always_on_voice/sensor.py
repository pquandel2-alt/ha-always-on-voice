"""Diagnostic sensors for HA Always-On Voice."""

from __future__ import annotations

from homeassistant.components.assist_pipeline import async_get_pipeline
from homeassistant.components.assist_pipeline.select import get_chosen_pipeline
from homeassistant.components.sensor import SensorEntity, SensorEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, PANEL_TITLE


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up diagnostic sensors."""
    async_add_entities([AlwaysOnVoiceTtsProviderSensor(hass, entry)], True)


class AlwaysOnVoiceTtsProviderSensor(SensorEntity):
    """Show which TTS engine is supplied by the selected Assist pipeline."""

    entity_description = SensorEntityDescription(
        key="tts_provider",
        translation_key="tts_provider",
        entity_category=EntityCategory.DIAGNOSTIC,
        icon="mdi:account-voice",
    )
    _attr_has_entity_name = True

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Initialize the TTS provider sensor."""
        self.hass = hass
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}-tts_provider"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=PANEL_TITLE,
            manufacturer="ha-always-on-voice",
            model="Browser PWA Satellite",
        )

    async def async_update(self) -> None:
        """Resolve the TTS engine from the selected Assist pipeline."""
        try:
            pipeline_id = get_chosen_pipeline(
                self.hass, DOMAIN, self._entry.entry_id
            )
            pipeline = async_get_pipeline(self.hass, pipeline_id)
            self._attr_native_value = pipeline.tts_engine or "not_configured"
        except (HomeAssistantError, KeyError, RuntimeError, ValueError):
            self._attr_native_value = "not_configured"
