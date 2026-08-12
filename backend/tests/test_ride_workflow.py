"""Backend tests for OPS ride booking workflow bug fix."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # Fallback to frontend/.env
    from pathlib import Path
    envp = Path('/app/frontend/.env')
    if envp.exists():
        for line in envp.read_text().splitlines():
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')

API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    return data["token"], data["user"]


@pytest.fixture(scope="module")
def user_auth():
    token, user = _login("user@ops.com", "user123")
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def driver_auth():
    token, user = _login("driver@ops.com", "driver123")
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def admin_auth():
    token, user = _login("admin@ops.com", "admin123")
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}


# ---- Login flow ----
def test_login_all_three_accounts():
    for email, pw, role in [("user@ops.com", "user123", "user"),
                             ("driver@ops.com", "driver123", "driver"),
                             ("admin@ops.com", "admin123", "admin")]:
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
        assert r.status_code == 200, f"{email} login failed"
        assert r.json()["user"]["role"] == role


# ---- Nearby drivers ----
@pytest.mark.parametrize("vtype", ["Bike", "Auto", "Car"])
def test_nearby_drivers_returns_5(vtype):
    r = requests.get(f"{API}/drivers/nearby", params={"vehicle_type": vtype}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["dispatch_radius_km"] == 5.0
    assert len(data["drivers"]) == 5
    for d in data["drivers"]:
        assert d["vehicle_type"] == vtype
        assert d["distance_km"] <= 5.0


# ---- Ride booking - no auto-assign ----
@pytest.fixture(scope="module")
def new_ride(user_auth):
    payload = {
        "pickup_location": "CP Delhi",
        "destination_location": "Cyber City",
        "pickup_coords": {"lat": 28.6315, "lng": 77.2167},
        "destination_coords": {"lat": 28.4959, "lng": 77.0890},
        "vehicle_type": "Bike",
        "distance_km": 20.5,
    }
    r = requests.post(f"{API}/rides", json=payload, headers=user_auth["headers"], timeout=30)
    assert r.status_code == 200, f"Ride create failed: {r.status_code} {r.text}"
    ride = r.json()
    return ride


def test_ride_created_in_requested_state_without_auto_assign(new_ride):
    assert new_ride["status"] == "Requested", f"Expected Requested, got {new_ride['status']}"
    assert new_ride["driver_id"] is None
    assert new_ride["driver_name"] is None
    assert new_ride["vehicle_number"] is None
    assert new_ride["dispatch_count"] >= 1
    assert new_ride["nearest_hint"] is not None


def test_driver_sees_requested_ride_in_list(driver_auth, new_ride):
    r = requests.get(f"{API}/rides", headers=driver_auth["headers"], timeout=15)
    assert r.status_code == 200
    rides = r.json()
    ride_ids = [x["id"] for x in rides]
    assert new_ride["id"] in ride_ids, "Driver should see Requested ride in list"


# ---- Ride workflow: Accept -> Arriving -> Started -> Completed ----
def test_driver_accepts_ride(driver_auth, new_ride):
    r = requests.put(f"{API}/rides/{new_ride['id']}/status",
                     json={"status": "Accepted"}, headers=driver_auth["headers"], timeout=15)
    assert r.status_code == 200, f"Accept failed: {r.status_code} {r.text}"
    ride = r.json()
    assert ride["status"] == "Accepted"
    assert ride["driver_id"] == driver_auth["user"]["id"]
    assert ride["driver_name"] == "Driver Ramesh"
    assert ride["vehicle_number"] == "DL 01 AB 1234"
    assert ride["driver_phone"]


def test_user_sees_driver_info_after_accept(user_auth, new_ride):
    r = requests.get(f"{API}/rides/{new_ride['id']}", headers=user_auth["headers"], timeout=15)
    assert r.status_code == 200
    ride = r.json()
    assert ride["driver_name"] == "Driver Ramesh"
    assert ride["vehicle_number"] == "DL 01 AB 1234"
    assert ride["driver_phone"]
    assert ride["driver_rating"] is not None


@pytest.mark.parametrize("next_status", ["Driver Arriving", "Ride Started", "Ride Completed"])
def test_driver_progresses_ride(driver_auth, new_ride, next_status):
    r = requests.put(f"{API}/rides/{new_ride['id']}/status",
                     json={"status": next_status}, headers=driver_auth["headers"], timeout=15)
    assert r.status_code == 200, f"Transition to {next_status} failed: {r.text}"
    assert r.json()["status"] == next_status


# ---- Rentals ----
def test_rentals_list_authenticated(user_auth):
    r = requests.get(f"{API}/rentals", headers=user_auth["headers"], timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_rental_new_bike_pricing(user_auth):
    payload = {
        "vehicle_type": "Bike",
        "package_name": "2 Hours / 20 KM",
        "amount": 149,
        "pickup_location": "CP Delhi",
        "pickup_coords": {"lat": 28.6315, "lng": 77.2167},
    }
    r = requests.post(f"{API}/rentals", json=payload, headers=user_auth["headers"], timeout=15)
    assert r.status_code == 200, r.text
    rental = r.json()
    assert rental["amount"] == 149
    assert rental["status"] == "Booked"
    assert rental["driver_id"] is None
