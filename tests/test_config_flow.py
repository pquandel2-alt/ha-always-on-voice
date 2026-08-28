"""Tests for the HA Voice Control config flow."""

from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType

from custom_components.ha_always_on_voice.const import DOMAIN


async def test_user_flow(hass: HomeAssistant) -> None:
    """The single form step creates an entry titled HA Voice Control."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"name": "HA Voice Control"}
    )
    await hass.async_block_till_done()

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "HA Voice Control"


async def test_single_instance(hass: HomeAssistant) -> None:
    """A second flow aborts once an entry already exists.

    manifest.json sets single_config_entry: true, which makes the flow
    manager reject the second async_init before async_step_user ever runs
    -- the config flow's own _abort_if_unique_id_configured() is
    unreachable and this is the check that actually fires.
    """
    first = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    await hass.config_entries.flow.async_configure(
        first["flow_id"], {"name": "HA Voice Control"}
    )
    await hass.async_block_till_done()

    second = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )

    assert second["type"] is FlowResultType.ABORT
    assert second["reason"] == "single_instance_allowed"
