"""WebSocket bridge from the browser's PCM audio stream to the Assist satellite.

Mirrors assist_pipeline's own `assist_pipeline/run` binary-audio handling,
but routes the run through our AssistSatelliteEntity instead of calling
async_pipeline_from_audio_stream directly, so the satellite's state,
selected pipeline and VAD sensitivity (see select.py) are used.
"""

from __future__ import annotations

import asyncio
import audioop  # pylint: disable=deprecated-module
from collections.abc import AsyncGenerator
import logging

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.assist_pipeline import PipelineEvent, PipelineEventType
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN, WS_TYPE_RUN, WS_TYPE_TTS_FINISHED

_LOGGER = logging.getLogger(__name__)

_SAMPLE_RATE = 16000
_SAMPLE_WIDTH = 2
_SAMPLE_CHANNELS = 1


@callback
def async_register_websocket_api(hass: HomeAssistant) -> None:
    """Register the ha_always_on_voice/run websocket command."""
    websocket_api.async_register_command(hass, websocket_run)
    websocket_api.async_register_command(hass, websocket_tts_finished)


@websocket_api.websocket_command({vol.Required("type"): WS_TYPE_TTS_FINISHED})
@websocket_api.async_response
async def websocket_tts_finished(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Mark browser TTS playback as finished on the satellite entity."""
    satellite = hass.data.get(DOMAIN, {}).get("satellite")
    if satellite is None:
        connection.send_error(
            msg["id"], "satellite_not_ready", "Voice Assist satellite not set up yet"
        )
        return
    satellite.tts_response_finished()
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_TYPE_RUN,
        vol.Required("sample_rate"): int,
    }
)
@websocket_api.async_response
async def websocket_run(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Stream browser audio into the Assist satellite and forward events back."""
    satellite = hass.data.get(DOMAIN, {}).get("satellite")
    if satellite is None:
        connection.send_error(
            msg["id"], "satellite_not_ready", "Voice Assist satellite not set up yet"
        )
        return

    incoming_sample_rate = msg["sample_rate"]
    audio_queue: asyncio.Queue[bytes] = asyncio.Queue()

    async def stt_stream() -> AsyncGenerator[bytes]:
        state = None
        while chunk := await audio_queue.get():
            if incoming_sample_rate != _SAMPLE_RATE:
                chunk, state = audioop.ratecv(
                    chunk,
                    _SAMPLE_WIDTH,
                    _SAMPLE_CHANNELS,
                    incoming_sample_rate,
                    _SAMPLE_RATE,
                    state,
                )
            yield chunk

    def handle_binary(
        _hass: HomeAssistant,
        _connection: websocket_api.ActiveConnection,
        data: bytes,
    ) -> None:
        audio_queue.put_nowait(data)

    handler_id, unregister_handler = connection.async_register_binary_handler(
        handle_binary
    )

    def forward_event(event: PipelineEvent) -> None:
        connection.send_event(msg["id"], event)

    connection.send_result(
        msg["id"],
        {
            "stt_binary_handler_id": handler_id,
            "animation_style": satellite.animation_style,
            "tts_playback": satellite.tts_playback,
            "tts_engine": satellite.tts_engine,
        },
    )

    run_task = hass.async_create_task(
        satellite.async_run_from_browser(stt_stream(), forward_event)
    )

    def cancel_run() -> None:
        audio_queue.put_nowait(b"")
        if not run_task.done():
            run_task.cancel()

    connection.subscriptions[msg["id"]] = cancel_run

    try:
        await run_task
    except Exception as err:  # noqa: BLE001
        _LOGGER.exception("Error running pipeline from browser")
        connection.send_event(
            msg["id"],
            PipelineEvent(
                PipelineEventType.ERROR,
                {"code": "unknown", "message": str(err)},
            ),
        )
    finally:
        if connection.subscriptions.get(msg["id"]) is cancel_run:
            connection.subscriptions.pop(msg["id"], None)
        unregister_handler()
