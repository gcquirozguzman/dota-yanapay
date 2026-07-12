"""Captura solo el minimapa y publica posiciones aproximadas de los jugadores."""

from __future__ import annotations

import json
import os
import signal
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

import cv2
import mss
import numpy as np


COMPONENT = Path(__file__).resolve().parents[1]
CONFIG_PATH = Path(os.getenv("MINIMAP_CONFIG", COMPONENT / "config" / "minimap.json"))
SERVER_URL = os.getenv("VISION_SERVER_URL", "http://127.0.0.1:3000/vision")
INTERVAL_SECONDS = float(os.getenv("VISION_INTERVAL_MS", "250")) / 1000
DEBUG = os.getenv("VISION_DEBUG", "false").lower() == "true"
RUNNING = True


def stop(_signum, _frame):
    global RUNNING
    RUNNING = False


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def capture_region(monitor: dict, config: dict) -> dict:
    size = round(monitor["height"] * config["sizeFractionOfScreenHeight"])
    left = monitor["left"] if config.get("side", "left") == "left" else monitor["left"] + monitor["width"] - size
    return {
        "left": left,
        "top": monitor["top"] + monitor["height"] - size,
        "width": size,
        "height": size,
    }


def find_color_blob(image_bgr: np.ndarray, rgb: list[int], config: dict):
    target = np.array(rgb[::-1], dtype=np.int16)
    difference = image_bgr.astype(np.int32) - target.astype(np.int32)
    distance_squared = np.sum(difference * difference, axis=2)
    mask = (distance_squared <= config["colorTolerance"] ** 2).astype(np.uint8)

    count, _labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
    candidates = []
    for index in range(1, count):
        pixels = int(stats[index, cv2.CC_STAT_AREA])
        if config["minimumBlobPixels"] <= pixels <= config["maximumBlobPixels"]:
            candidates.append((pixels, centroids[index]))
    return max(candidates, default=None, key=lambda candidate: candidate[0])


def pixel_to_world(x: float, y: float, size: int, padding: int, bounds: dict) -> dict:
    usable = max(1, size - (padding * 2))
    normalized_x = min(1.0, max(0.0, (x - padding) / usable))
    normalized_y = min(1.0, max(0.0, (y - padding) / usable))
    minimum = bounds["minimum"]
    maximum = bounds["maximum"]
    span = maximum - minimum
    return {
        "x": round(minimum + normalized_x * span),
        "y": round(maximum - normalized_y * span),
    }


def detect_players(image_bgr: np.ndarray, config: dict) -> list[dict]:
    players = []
    size = image_bgr.shape[0]
    for slot in config["slots"]:
        blob = find_color_blob(image_bgr, slot["rgb"], config)
        if not blob:
            continue
        pixels, centroid = blob
        x, y = float(centroid[0]), float(centroid[1])
        players.append({
            "slot": slot["slot"],
            "team": slot["team"],
            "color": slot["name"],
            "confidencePixels": pixels,
            "pixel": {"x": round(x, 1), "y": round(y, 1)},
            "world": pixel_to_world(
                x, y, size, config["paddingPixels"], config["worldBounds"]
            ),
        })
    return players


def publish(payload: dict):
    request = Request(
        SERVER_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=1) as response:
        response.read()


def main():
    config = load_config()
    last_server_warning = 0.0
    with mss.mss() as screen_capture:
        monitor_index = config.get("monitor", 1)
        if monitor_index >= len(screen_capture.monitors):
            raise RuntimeError(f"El monitor {monitor_index} no existe")
        region = capture_region(screen_capture.monitors[monitor_index], config)
        print(f"Vision capturando solo minimapa: {region}", flush=True)

        while RUNNING:
            started = time.perf_counter()
            frame = np.asarray(screen_capture.grab(region))[:, :, :3]
            players = detect_players(frame, config)
            payload = {
                "players": players,
                "capture": {"width": region["width"], "height": region["height"]},
                "capturedAtUnixMs": round(time.time() * 1000),
            }

            if DEBUG:
                debug_path = COMPONENT / "debug-minimap.png"
                cv2.imwrite(str(debug_path), frame)

            try:
                publish(payload)
            except (URLError, TimeoutError, ConnectionError) as error:
                if time.time() - last_server_warning > 10:
                    print(f"Vision esperando servidor: {error}", file=sys.stderr, flush=True)
                    last_server_warning = time.time()

            elapsed = time.perf_counter() - started
            time.sleep(max(0.0, INTERVAL_SECONDS - elapsed))


if __name__ == "__main__":
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    main()
