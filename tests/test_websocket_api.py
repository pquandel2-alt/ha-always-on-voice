"""Tests for the ha_always_on_voice/run websocket schema."""

import pytest
import voluptuous as vol

from custom_components.ha_always_on_voice.const import WS_TYPE_RUN
from custom_components.ha_always_on_voice.websocket_api import websocket_run


def _validate(sample_rate: int) -> None:
    websocket_run._ws_schema({"id": 1, "type": WS_TYPE_RUN, "sample_rate": sample_rate})


def test_sample_rate_rejected() -> None:
    """0 Hz and 1 Hz must never reach audioop.ratecv.

    Upsampling is unbounded work: a 4 KB chunk sent at 1 Hz expands
    16000x to ~65 MB inside an unbounded asyncio.Queue -- an OOM from an
    authenticated client with nothing logged anywhere.
    """
    with pytest.raises(vol.Invalid):
        _validate(0)
    with pytest.raises(vol.Invalid):
        _validate(1)


def test_sample_rate_accepted() -> None:
    """A realistic browser sample rate passes validation untouched."""
    _validate(48000)
