"""Tests for Rental KYC booking flow (POST/GET /api/rentals)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://instant-transport-18.preview.emergentagent.com").rstrip("/")


def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def user_token():
    return _login("user@ops.com", "user123")


@pytest.fixture(scope="module")
def driver_token():
    return _login("driver@ops.com", "driver123")


def test_create_rental_with_kyc_fields(user_token):
    payload = {
        "vehicle_type": "Bike",
        "package_name": "2 Hours / 20 KM",
        "amount": 99,
        "pickup_location": "TEST_Sector 5, Delhi",
        "pickup_coords": {"lat": 28.6139, "lng": 77.2090},
        "kyc_type": "Aadhar",
        "kyc_number": "1234-5678-9012",
        "renter_age": 25,
        "vehicle_color": "Red",
        "vehicle_number": "DL 05 AB 1234",
        "vehicle_km_driven": 12500,
        "address": "TEST_Sector 5, Delhi",
    }
    r = requests.post(f"{BASE_URL}/api/rentals", json=payload, headers={"Authorization": f"Bearer {user_token}"}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "Booked"
    assert data["kyc_type"] == "Aadhar"
    assert data["kyc_number"] == "1234-5678-9012"
    assert data["renter_age"] == 25
    assert data["vehicle_color"] == "Red"
    assert data["vehicle_number"] == "DL 05 AB 1234"
    assert data["vehicle_km_driven"] == 12500
    assert data["address"] == "TEST_Sector 5, Delhi"
    assert data["amount"] == 99
    assert "_id" not in data
    pytest.rental_id = data["id"]


def test_get_rentals_as_user_returns_kyc(user_token):
    r = requests.get(f"{BASE_URL}/api/rentals", headers={"Authorization": f"Bearer {user_token}"}, timeout=20)
    assert r.status_code == 200
    rentals = r.json()
    match = [x for x in rentals if x.get("id") == getattr(pytest, "rental_id", None)]
    assert match, "created rental not returned"
    m = match[0]
    assert m["kyc_number"] == "1234-5678-9012"
    assert m["vehicle_number"] == "DL 05 AB 1234"
    assert m["status"] == "Booked"


def test_get_rentals_as_driver_sees_booked(driver_token):
    r = requests.get(f"{BASE_URL}/api/rentals", headers={"Authorization": f"Bearer {driver_token}"}, timeout=20)
    assert r.status_code == 200
    rentals = r.json()
    ids = [x.get("id") for x in rentals]
    assert getattr(pytest, "rental_id", None) in ids, "driver should see Booked rentals"


@pytest.mark.parametrize("vt,pkg,amt", [
    ("Bike", "4 Hours / 40 KM", 189),
    ("Bike", "8 Hours / 80 KM", 349),
    ("Auto", "2 Hours / 20 KM", 149),
    ("Car", "2 Hours / 20 KM", 249),
])
def test_price_variants(user_token, vt, pkg, amt):
    payload = {
        "vehicle_type": vt, "package_name": pkg, "amount": amt,
        "pickup_location": "TEST_pickup",
        "kyc_type": "Driving Licence", "kyc_number": "DL12345",
        "renter_age": 30, "vehicle_color": "Blue",
        "vehicle_number": "DL 01 ZZ 0001", "vehicle_km_driven": 100,
        "address": "TEST_addr",
    }
    r = requests.post(f"{BASE_URL}/api/rentals", json=payload, headers={"Authorization": f"Bearer {user_token}"}, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["amount"] == amt
    assert d["vehicle_type"] == vt
    assert d["package_name"] == pkg
    assert d["status"] == "Booked"
    assert d["kyc_type"] == "Driving Licence"
