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


# ---- Delivery fare persistence: verify new low pricing (Bike 15+5/km, Auto 25+7/km, Car 40+10/km) ----
@pytest.fixture(scope="module")
def user_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "user@ops.com", "password": "user123"}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.mark.parametrize("v_type,dist,expected", [
    ("Bike", 17.04, 100),
    ("Auto", 17.04, 144),
    ("Car",  17.04, 210),
    ("Bike", 10.0, 65),
    ("Auto", 10.0, 95),
    ("Car",  10.0, 140),
])
def test_delivery_fare_matches_frontend(user_token, v_type, dist, expected):
    payload = {
        "pickup_location": "A", "drop_location": "B",
        "pickup_coords": {"lat": 28.6, "lng": 77.2},
        "drop_coords":   {"lat": 28.7, "lng": 77.3},
        "receiver_name": "R", "receiver_phone": "9999999999",
        "parcel_type": "Documents", "parcel_notes": "",
        "vehicle_type": v_type, "distance_km": dist,
    }
    r = requests.post(f"{API}/deliveries", json=payload,
                      headers={"Authorization": f"Bearer {user_token}"}, timeout=20)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    assert body["fare"] == expected, f"{v_type} {dist}km: got {body['fare']}, want {expected}"
    assert isinstance(body["fare"], int)


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
