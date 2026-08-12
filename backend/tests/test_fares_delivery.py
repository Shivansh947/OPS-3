"""Backend tests for Rapido-style low fares + delivery estimates."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    from pathlib import Path
    envp = Path('/app/frontend/.env')
    if envp.exists():
        for line in envp.read_text().splitlines():
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
API = f"{BASE_URL}/api"


# ---- Fare estimate: Rapido low pricing ----
@pytest.mark.parametrize("dist,dur,expected", [
    (15.5, 28, {"Bike": 90, "Auto": 133, "Car": 201}),
    (5.0, 15, {"Bike": 40, "Auto": 61, "Car": 97}),
])
def test_fare_estimate_rapido_pricing(dist, dur, expected):
    r = requests.post(f"{API}/fares/estimate",
                      json={"distance_km": dist, "duration_min": dur}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["fares"] == expected, f"Got {body['fares']}, want {expected}"


def test_fare_response_structure():
    r = requests.post(f"{API}/fares/estimate",
                      json={"distance_km": 10, "duration_min": 20}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    for k in ("fares", "model", "distance_km", "duration_min", "weather_aware"):
        assert k in body
    for v in ("Bike", "Auto", "Car"):
        assert isinstance(body["fares"][v], int)
    # ordering: Bike < Auto < Car
    assert body["fares"]["Bike"] < body["fares"]["Auto"] < body["fares"]["Car"]
