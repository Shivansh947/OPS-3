"""OPS backend API tests: auth, drivers/nearby, weather, rides multi-dispatch."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://instant-transport-18.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def user_token(session):
    r = session.post(f"{API}/auth/login", json={"email": "user@ops.com", "password": "user123"}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


# --- Auth ---
class TestAuth:
    @pytest.mark.parametrize("email,password,role", [
        ("user@ops.com", "user123", "user"),
        ("driver@ops.com", "driver123", "driver"),
        ("admin@ops.com", "admin123", "admin"),
    ])
    def test_login_seeded(self, session, email, password, role):
        r = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 10
        assert data["user"]["email"] == email
        assert data["user"]["role"] == role

    def test_login_bad_password(self, session):
        r = session.post(f"{API}/auth/login", json={"email": "user@ops.com", "password": "wrong"}, timeout=20)
        assert r.status_code in (400, 401, 403)

    def test_signup_new_user(self, session):
        email = f"test_{uuid.uuid4().hex[:8]}@ops.com"
        r = session.post(f"{API}/auth/signup", json={
            "email": email, "password": "pass1234", "name": "Test User", "role": "user"
        }, timeout=20)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert "token" in data
        assert data["user"]["email"] == email
        assert data["user"]["role"] == "user"

    def test_signup_admin_blocked(self, session):
        email = f"test_admin_{uuid.uuid4().hex[:6]}@ops.com"
        r = session.post(f"{API}/auth/signup", json={
            "email": email, "password": "pass1234", "name": "X", "role": "admin"
        }, timeout=20)
        assert r.status_code in (400, 403, 422)


# --- Drivers nearby ---
class TestDriversNearby:
    @pytest.mark.parametrize("vt", ["Bike", "Auto", "Car"])
    def test_nearby_returns_up_to_5(self, session, vt):
        r = session.get(f"{API}/drivers/nearby", params={"vehicle_type": vt, "lat": 28.6139, "lon": 77.2090}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        drivers = data if isinstance(data, list) else data.get("drivers", [])
        assert isinstance(drivers, list)
        assert len(drivers) <= 5
        # If drivers present, expect fields
        if drivers:
            assert any(k in drivers[0] for k in ("name", "driver_name"))


# --- Weather ---
class TestWeather:
    def test_weather_delhi(self, session):
        r = session.get(f"{API}/weather", params={"lat": 28.6139, "lon": 77.2090}, timeout=25)
        assert r.status_code == 200, r.text
        data = r.json()
        # Open-Meteo returns current or current_weather
        assert isinstance(data, dict)
        # Just ensure some temperature-ish key exists
        s = str(data).lower()
        assert "temp" in s or "current" in s or "weather" in s


# --- Ride creation with multi-driver dispatch ---
class TestRideDispatch:
    def test_create_ride_dispatch_5(self, session, user_token):
        headers = {"Authorization": f"Bearer {user_token}"}
        payload = {
            "pickup_location": "Connaught Place, Delhi",
            "destination_location": "Sector 18, Noida",
            "pickup_coords": {"lat": 28.6139, "lng": 77.2090},
            "destination_coords": {"lat": 28.5355, "lng": 77.3910},
            "vehicle_type": "Bike",
            "distance_km": 20.5,
        }
        r = session.post(f"{API}/rides", json=payload, headers=headers, timeout=30)
        assert r.status_code in (200, 201), r.text
        ride = r.json()
        # dispatch fields
        assert "dispatch_count" in ride, f"missing dispatch_count in {ride.keys()}"
        assert ride["dispatch_count"] >= 1
        assert ride["dispatch_count"] <= 5
        assert "dispatched_drivers" in ride
        assert isinstance(ride["dispatched_drivers"], list)
        assert len(ride["dispatched_drivers"]) == ride["dispatch_count"]
        # nearest assigned
        for k in ("driver_name", "driver_phone", "vehicle_number", "driver_distance_km"):
            assert k in ride and ride[k] is not None, f"missing {k}"
