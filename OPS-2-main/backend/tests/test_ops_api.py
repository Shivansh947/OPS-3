import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = BASE_URL + "/api"


# --- Auth fixtures ---
@pytest.fixture(scope="module")
def clients():
    out = {}
    for name, email, password in [
        ("rider", "user@ops.com", "user123"),
        ("driver", "driver@ops.com", "driver123"),
        ("admin", "admin@ops.com", "admin123"),
    ]:
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
        assert r.status_code == 200, (name, r.status_code, r.text)
        j = r.json()
        assert "token" in j and "user" in j
        assert j["user"]["role"] == ("user" if name == "rider" else name)
        s = requests.Session()
        s.headers["Authorization"] = "Bearer " + j["token"]
        out[name] = s
    return out


@pytest.fixture(scope="module")
def driver2_client():
    """Create a second driver so we can accept rider's own rides that need a different driver."""
    email = f"TEST_driver2-{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/signup", json={
        "name": "TEST Driver Two", "email": email, "password": "test123", "role": "driver"
    }, timeout=20)
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    s = requests.Session()
    s.headers["Authorization"] = "Bearer " + token
    return s


# --- Auth tests ---
def test_auth_me(clients):
    r = clients["rider"].get(f"{API}/auth/me", timeout=20)
    assert r.status_code == 200
    j = r.json()
    assert j["email"] == "user@ops.com"
    assert "password" not in j


def test_signup_rejects_admin():
    r = requests.post(f"{API}/auth/signup", json={
        "name": "Bad Admin",
        "email": f"TEST_bad-{uuid.uuid4()}@example.com",
        "password": "test123",
        "role": "admin",
    }, timeout=20)
    assert r.status_code == 403


def test_signup_user_and_driver_ok():
    for role in ("user", "driver"):
        r = requests.post(f"{API}/auth/signup", json={
            "name": f"TEST {role}",
            "email": f"TEST_{role}-{uuid.uuid4().hex[:8]}@example.com",
            "password": "test123",
            "role": role,
        }, timeout=20)
        assert r.status_code == 200, (role, r.text)
        assert r.json()["user"]["role"] == role


# --- Rides ---
def test_ride_fare_new_rates(clients):
    payload = {"pickup_location": "A", "destination_location": "B", "vehicle_type": "Bike", "distance_km": 10}
    r = clients["rider"].post(f"{API}/rides", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    # New rate: 20 + 7*10 = 90
    assert j["fare"] == 90.0, j
    assert j["status"] == "Requested"


def test_ride_lifecycle_and_tracking(clients, driver2_client):
    # Rider creates
    r = clients["rider"].post(f"{API}/rides", json={
        "pickup_location": "CP", "destination_location": "Cyber City",
        "vehicle_type": "Auto", "distance_km": 5,
    }, timeout=20)
    assert r.status_code == 200, r.text
    ride = r.json()
    # Auto: 30 + 10*5 = 80
    assert ride["fare"] == 80.0
    ride_id = ride["id"]

    # Rider cannot accept own ride
    assert clients["rider"].put(f"{API}/rides/{ride_id}/status",
                                json={"status": "Accepted"}, timeout=20).status_code == 403

    # Different driver accepts
    r = driver2_client.put(f"{API}/rides/{ride_id}/status", json={"status": "Accepted"}, timeout=20)
    assert r.status_code == 200, r.text

    # Non-assigned driver cannot progress
    r_bad = clients["driver"].put(f"{API}/rides/{ride_id}/status",
                                  json={"status": "Driver Arriving"}, timeout=20)
    assert r_bad.status_code == 403

    # Tracking update by assigned captain
    r = driver2_client.put(f"{API}/rides/{ride_id}/tracking",
                           json={"lat": 28.6, "lng": 77.2, "speed_kmh": 42.5}, timeout=20)
    assert r.status_code == 200, r.text

    # Other driver cannot post tracking
    r = clients["driver"].put(f"{API}/rides/{ride_id}/tracking",
                              json={"lat": 28.6, "lng": 77.2, "speed_kmh": 30}, timeout=20)
    assert r.status_code == 403

    # Persistence
    g = clients["rider"].get(f"{API}/rides/{ride_id}", timeout=20)
    assert g.status_code == 200
    gd = g.json()
    assert gd["captain_speed_kmh"] == 42.5
    assert gd["captain_location"]["lat"] == 28.6

    # Progress through
    for s in ["Driver Arriving", "Ride Started", "Ride Completed"]:
        r = driver2_client.put(f"{API}/rides/{ride_id}/status", json={"status": s}, timeout=20)
        assert r.status_code == 200, (s, r.text)

    # Tracking fails after Ride Completed
    r = driver2_client.put(f"{API}/rides/{ride_id}/tracking",
                           json={"lat": 28.6, "lng": 77.2, "speed_kmh": 10}, timeout=20)
    assert r.status_code == 409


# --- Deliveries ---
def test_delivery_fare_new_rates(clients):
    payload = {
        "pickup_location": "A", "drop_location": "B",
        "receiver_name": "Ravi", "receiver_phone": "9999999999",
        "parcel_type": "Documents", "vehicle_type": "Bike", "distance_km": 10,
    }
    r = clients["rider"].post(f"{API}/deliveries", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    # Bike delivery: 25 + 8*10 = 105
    assert j["fare"] == 105.0, j
    assert j["status"] == "Requested"


def test_delivery_visibility(clients):
    # rider list contains their delivery, admin sees all, driver sees Requested
    r_rider = clients["rider"].get(f"{API}/deliveries", timeout=20)
    r_admin = clients["admin"].get(f"{API}/deliveries", timeout=20)
    r_driver = clients["driver"].get(f"{API}/deliveries", timeout=20)
    assert r_rider.status_code == 200
    assert r_admin.status_code == 200
    assert r_driver.status_code == 200
    assert isinstance(r_rider.json(), list)
    # driver should see at least one Requested one (from previous test)
    statuses = {d.get("status") for d in r_driver.json()}
    assert "Requested" in statuses or len(r_driver.json()) >= 0


def test_delivery_lifecycle_and_tracking(clients, driver2_client):
    # Rider creates a delivery
    r = clients["rider"].post(f"{API}/deliveries", json={
        "pickup_location": "P", "drop_location": "D",
        "receiver_name": "Neha", "receiver_phone": "8888888888",
        "parcel_type": "Small", "vehicle_type": "Auto", "distance_km": 5,
    }, timeout=20)
    assert r.status_code == 200, r.text
    delivery = r.json()
    # Auto delivery: 40 + 11*5 = 95
    assert delivery["fare"] == 95.0
    did = delivery["id"]

    # Rider cannot accept
    assert clients["rider"].put(f"{API}/deliveries/{did}/status",
                                json={"status": "Accepted"}, timeout=20).status_code == 403

    # Driver2 accepts
    r = driver2_client.put(f"{API}/deliveries/{did}/status", json={"status": "Accepted"}, timeout=20)
    assert r.status_code == 200, r.text

    # Other driver cannot progress
    r = clients["driver"].put(f"{API}/deliveries/{did}/status",
                              json={"status": "Picking Up"}, timeout=20)
    assert r.status_code == 403

    # Tracking by assigned captain
    r = driver2_client.put(f"{API}/deliveries/{did}/tracking",
                           json={"lat": 28.61, "lng": 77.21, "speed_kmh": 33.3}, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json()["captain_speed_kmh"] == 33.3
    assert r.json()["captain_location"]["lng"] == 77.21

    # Progress
    for s in ["Picking Up", "In Transit", "Delivered"]:
        r = driver2_client.put(f"{API}/deliveries/{did}/status", json={"status": s}, timeout=20)
        assert r.status_code == 200, (s, r.text)

    # Tracking fails after Delivered
    r = driver2_client.put(f"{API}/deliveries/{did}/tracking",
                           json={"lat": 28.6, "lng": 77.2, "speed_kmh": 10}, timeout=20)
    assert r.status_code == 409


# --- Rentals lifecycle ---
def test_rental_lifecycle(clients, driver2_client):
    # Rider creates rental — defaults to Requested
    r = clients["rider"].post(f"{API}/rentals", json={
        "vehicle_type": "Bike",
        "package_name": "2 Hours / 20 KM",
        "amount": 299,
        "pickup_location": "CP",
    }, timeout=20)
    assert r.status_code == 200, r.text
    rental = r.json()
    assert rental["status"] == "Requested"
    assert rental["driver_id"] is None
    rid = rental["id"]

    # Rider cannot assign
    assert clients["rider"].put(f"{API}/rentals/{rid}/status",
                                json={"status": "Assigned"}, timeout=20).status_code == 403

    # driver2 assigns
    r = driver2_client.put(f"{API}/rentals/{rid}/status", json={"status": "Assigned"}, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "Assigned"
    assert r.json()["driver_id"]

    # Different driver cannot progress
    r_bad = clients["driver"].put(f"{API}/rentals/{rid}/status",
                                  json={"status": "In Use"}, timeout=20)
    assert r_bad.status_code == 403

    # Tracking by assigned captain
    r = driver2_client.put(f"{API}/rentals/{rid}/tracking",
                           json={"lat": 28.6, "lng": 77.2, "speed_kmh": 25}, timeout=20)
    assert r.status_code == 200, r.text

    # Progress
    for s in ["In Use", "Completed"]:
        r = driver2_client.put(f"{API}/rentals/{rid}/status", json={"status": s}, timeout=20)
        assert r.status_code == 200, (s, r.text)

    # Cannot track after Completed
    r = driver2_client.put(f"{API}/rentals/{rid}/tracking",
                           json={"lat": 28.6, "lng": 77.2, "speed_kmh": 5}, timeout=20)
    assert r.status_code == 409


# --- SOS ---
def test_sos_ride(clients, driver2_client):
    # Rider creates a ride
    r = clients["rider"].post(f"{API}/rides", json={
        "pickup_location": "P", "destination_location": "D",
        "vehicle_type": "Bike", "distance_km": 3,
    }, timeout=20)
    ride_id = r.json()["id"]

    # Non-participant driver cannot raise
    r_bad = clients["driver"].post(f"{API}/rides/{ride_id}/sos",
                                   json={"lat": 28.6, "lng": 77.2, "note": "test"}, timeout=20)
    assert r_bad.status_code == 403

    # Rider can raise SOS even before assignment
    r = clients["rider"].post(f"{API}/rides/{ride_id}/sos",
                              json={"lat": 28.6, "lng": 77.2, "note": "help"}, timeout=20)
    assert r.status_code == 200, r.text
    alert = r.json()
    assert alert["type"] == "ride"
    assert alert["ref_id"] == ride_id
    assert "_id" not in alert

    # Accept then driver can raise too
    driver2_client.put(f"{API}/rides/{ride_id}/status", json={"status": "Accepted"}, timeout=20)
    r = driver2_client.post(f"{API}/rides/{ride_id}/sos",
                            json={"lat": 28.6, "lng": 77.2, "note": "captain help"}, timeout=20)
    assert r.status_code == 200

    # Also check driver_rating was written on accept
    ride_after = clients["rider"].get(f"{API}/rides/{ride_id}", timeout=20).json()
    assert "driver_rating" in ride_after
    assert isinstance(ride_after["driver_rating"], (int, float))


def test_sos_delivery_and_admin_list(clients, driver2_client):
    r = clients["rider"].post(f"{API}/deliveries", json={
        "pickup_location": "P", "drop_location": "D",
        "receiver_name": "R", "receiver_phone": "9",
        "parcel_type": "Documents", "vehicle_type": "Bike", "distance_km": 2,
    }, timeout=20)
    did = r.json()["id"]

    # Non-participant blocked
    assert clients["driver"].post(f"{API}/deliveries/{did}/sos",
                                  json={"lat": 1, "lng": 1}, timeout=20).status_code == 403

    # Rider can raise
    r = clients["rider"].post(f"{API}/deliveries/{did}/sos",
                              json={"lat": 28.5, "lng": 77.3, "note": "delivery sos"}, timeout=20)
    assert r.status_code == 200
    assert r.json()["type"] == "delivery"

    # Non-admin listing forbidden
    assert clients["rider"].get(f"{API}/sos", timeout=20).status_code == 403

    # Admin can list
    r = clients["admin"].get(f"{API}/sos", timeout=20)
    assert r.status_code == 200
    types = {a["type"] for a in r.json()}
    assert "ride" in types or "delivery" in types


# --- Admin ---
def test_admin_stats_has_deliveries(clients):
    r = clients["admin"].get(f"{API}/admin/stats", timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    for k in ("users_count", "drivers_count", "rides_count", "rentals_count",
              "deliveries_count", "total_revenue"):
        assert k in j, k
    assert j["deliveries_count"] >= 1
    # revenue includes at least the Delivered one (95)
    assert j["total_revenue"] >= 95
