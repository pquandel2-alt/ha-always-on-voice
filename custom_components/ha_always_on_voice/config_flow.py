"""Config flow for HA Always-On Voice integration."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import HomeAssistant

from .const import DOMAIN

_SCHEMA = vol.Schema(
    {
        vol.Required("name", default="Voice Assist"): str,
    }
)


class HA_ALWAYS_ON_VOICE_ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Config flow for HA Always-On Voice."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        """Handle the initial step."""
        if user_input is not None:
            await self.async_set_unique_id(DOMAIN)
            self._abort_if_unique_id_configured()
            return self.async_create_entry(
                title=user_input["name"],
                data={},
            )

        return self.async_show_form(step_id="user", data_schema=_SCHEMA)
