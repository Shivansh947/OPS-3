from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import bcrypt
import jwt
import httpx
from math import radians, sin, cos, sqrt, atan2

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
ALGORITHM = "HS256"
OPENWEATHER_API_KEY = os.environ.get('OPENWEATHER_API_KEY', '')

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="OPS Ride Booking API", version="1.0.0")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Password Hashing & JWT Helpers ---
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_access_token(data: dict) -> str:
    return jwt.encode(data, JWT_SECRET, algorithm=ALGORITHM)

async def get_current_user(request: Request, credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials if credentials else request.cookies.get("access_token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

# --- Startup Seed ---
@app.on_event("startup")
async def startup_db():
    try:
        await db.users.create_index("email", unique=True)
        # Backfill referral_code for any existing user missing it
        async for u in db.users.find({"$or": [{"referral_code": {"$exists": False}}, {"referral_code": None}]}, {"id": 1, "name": 1}):
            import re, secrets
            prefix = re.sub(r'[^A-Z]', '', (u.get('name') or 'OPS').upper())[:3] or 'OPS'
            code = f"{prefix}{secrets.token_hex(3).upper()}"
            await db.users.update_one({"id": u["id"]}, {"$set": {"referral_code": code, "reward_credits": 0}})
        # Seed users if none exist
        count = await db.users.count_documents({})
        if count == 0:
            seed_users = [
                {
                    "id": str(uuid.uuid4()),
                    "name": "Admin OPS",
                    "email": "admin@ops.com",
                    "password": hash_password("admin123"),
                    "role": "admin",
                    "phone": "+919876543210",
                    "created_at": datetime.now(timezone.utc).isoformat()
                },
                {
                    "id": str(uuid.uuid4()),
                    "name": "Driver Ramesh",
                    "email": "driver@ops.com",
                    "password": hash_password("driver123"),
                    "role": "driver",
                    "phone": "+919876543211",
                    "vehicle_type": "Bike",
                    "vehicle_number": "DL 01 AB 1234",
                    "rating": 4.8,
                    "is_online": True,
                    "created_at": datetime.now(timezone.utc).isoformat()
                },
                {
                    "id": str(uuid.uuid4()),
                    "name": "Rahul Sharma",
                    "email": "user@ops.com",
                    "password": hash_password("user123"),
                    "role": "user",
                    "phone": "+919876543212",
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
            ]
            await db.users.insert_many(seed_users)
            logger.info("Database seeded successfully with default accounts.")
    except Exception as e:
        logger.error(f"Startup DB seeding error: {e}")

@app.on_event("shutdown")
async def shutdown_db():
    client.close()

# --- Models ---
class UserSignup(BaseModel):
    name: str
    email: str
    password: str
    role: str = "user" # user or driver
    phone: Optional[str] = ""
    vehicle_type: Optional[str] = "Bike" # Bike, Auto, Car
    vehicle_number: Optional[str] = ""
    referred_by_code: Optional[str] = ""

    @field_validator("role")
    @classmethod
    def validate_role(cls, value):
        if value not in ("user", "driver", "admin"):
            raise ValueError("Role must be user, driver or admin")
        return value

class DeliveryProof(BaseModel):
    image_base64: str  # data URL or base64
    note: Optional[str] = ""

class UserLogin(BaseModel):
    email: str
    password: str

class RideCreate(BaseModel):
    pickup_location: str
    destination_location: str
    pickup_coords: Optional[dict] = {"lat": 28.6139, "lng": 77.2090} # Default Delhi
    destination_coords: Optional[dict] = {"lat": 28.5355, "lng": 77.3910}
    vehicle_type: str # Bike, Auto, Car
    distance_km: float = Field(gt=0, le=500)

    @field_validator("vehicle_type")
    @classmethod
    def validate_vehicle(cls, value):
        if value not in ("Bike", "Auto", "Car"):
            raise ValueError("Vehicle type must be Bike, Auto, or Car")
        return value

class RideStatusUpdate(BaseModel):
    status: str # Accepted, Driver Arriving, Ride Started, Ride Completed, Cancelled
    driver_id: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    vehicle_number: Optional[str] = None

class RideFeedback(BaseModel):
    rating: int = Field(ge=1, le=5) # 1 to 5
    comment: Optional[str] = ""
    issue_report: Optional[str] = ""

class RideCancellation(BaseModel):
    reason: str
    note: Optional[str] = ""
    travelled_km: float = Field(default=6.8, ge=0)
    elapsed_min: float = Field(default=11, ge=0)

class RentalBookingCreate(BaseModel):
    vehicle_type: str # Bike, Auto, Car
    package_name: str # e.g. "2 Hours / 20 KM", "4 Hours / 40 KM", "8 Hours / 80 KM"
    amount: float
    pickup_location: str
    pickup_coords: Optional[dict] = {"lat": 28.6139, "lng": 77.2090}

class RentalStatusUpdate(BaseModel):
    status: str  # Assigned, In Use, Completed, Cancelled

class SOSAlert(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None
    note: Optional[str] = ""

class DeliveryCreate(BaseModel):
    pickup_location: str
    drop_location: str
    pickup_coords: Optional[dict] = {"lat": 28.6139, "lng": 77.2090}
    drop_coords: Optional[dict] = {"lat": 28.5355, "lng": 77.3910}
    receiver_name: str
    receiver_phone: str
    parcel_type: str  # Documents, Food, Small, Medium, Large
    parcel_notes: Optional[str] = ""
    vehicle_type: str  # Bike, Auto, Car
    distance_km: float = Field(gt=0, le=200)

    @field_validator("vehicle_type")
    @classmethod
    def validate_vehicle(cls, value):
        if value not in ("Bike", "Auto", "Car"):
            raise ValueError("Vehicle type must be Bike, Auto, or Car")
        return value

    @field_validator("parcel_type")
    @classmethod
    def validate_parcel(cls, value):
        if value not in ("Documents", "Food", "Small", "Medium", "Large"):
            raise ValueError("Invalid parcel type")
        return value

class DeliveryStatusUpdate(BaseModel):
    status: str  # Accepted, Picking Up, In Transit, Delivered, Cancelled

class TrackingUpdate(BaseModel):
    lat: float
    lng: float
    speed_kmh: float = Field(ge=0, le=200)

class FareEstimateRequest(BaseModel):
    distance_km: float = Field(gt=0, le=500)
    duration_min: float = Field(default=28, gt=0, le=600)
    weather_code: int = 0
    rain_mm: float = 0
    demand: str = "normal"

def calculate_fare_options(distance_km: float, duration_min: float = 28, weather_code: int = 0, rain_mm: float = 0):
    # Rapido-style low fares
    bases = {"Bike": 15, "Auto": 25, "Car": 45}
    per_km = {"Bike": 4.5, "Auto": 6.5, "Car": 9.5}
    per_min = {"Bike": 0.2, "Auto": 0.25, "Car": 0.3}
    weather_factor = 1.05 if rain_mm > 2 or weather_code >= 51 else 1.0
    if weather_code >= 95:
        weather_factor = 1.1
    return {
        vehicle: max(round((bases[vehicle] + distance_km * per_km[vehicle] + duration_min * per_min[vehicle]) * weather_factor), bases[vehicle])
        for vehicle in ("Bike", "Auto", "Car")
    }

DEMO_NEARBY_DRIVERS = [
    # Bike drivers
    {"id": "nearby-rahul", "name": "Rahul Mehta", "phone": "+919812340001", "vehicle_type": "Bike", "vehicle_number": "DL 3S CE 4821", "distance_km": 0.8, "eta_min": 3, "rating": 4.9, "lat_offset": 0.005, "lng_offset": 0.004},
    {"id": "nearby-neha", "name": "Neha Kapoor", "phone": "+919812340002", "vehicle_type": "Bike", "vehicle_number": "DL 1Z AB 9137", "distance_km": 1.4, "eta_min": 5, "rating": 4.8, "lat_offset": -0.008, "lng_offset": 0.006},
    {"id": "nearby-vikas", "name": "Vikas Yadav", "phone": "+919812340003", "vehicle_type": "Bike", "vehicle_number": "DL 5G HK 7712", "distance_km": 2.1, "eta_min": 7, "rating": 4.7, "lat_offset": 0.012, "lng_offset": -0.010},
    {"id": "nearby-arjun", "name": "Arjun Verma", "phone": "+919812340004", "vehicle_type": "Bike", "vehicle_number": "DL 9P MN 3388", "distance_km": 2.9, "eta_min": 9, "rating": 4.6, "lat_offset": -0.015, "lng_offset": -0.011},
    {"id": "nearby-suresh", "name": "Suresh Iyer", "phone": "+919812340005", "vehicle_type": "Bike", "vehicle_number": "DL 6L QR 2205", "distance_km": 3.5, "eta_min": 12, "rating": 4.5, "lat_offset": 0.018, "lng_offset": 0.020},
    # Auto drivers
    {"id": "nearby-imran", "name": "Imran Khan", "phone": "+919812340006", "vehicle_type": "Auto", "vehicle_number": "DL 1R T 2846", "distance_km": 0.9, "eta_min": 4, "rating": 4.7, "lat_offset": 0.007, "lng_offset": 0.005},
    {"id": "nearby-mukesh", "name": "Mukesh Sharma", "phone": "+919812340007", "vehicle_type": "Auto", "vehicle_number": "DL 2X TR 5590", "distance_km": 1.6, "eta_min": 6, "rating": 4.6, "lat_offset": -0.011, "lng_offset": 0.009},
    {"id": "nearby-deepak", "name": "Deepak Rao", "phone": "+919812340008", "vehicle_type": "Auto", "vehicle_number": "DL 4C TR 8823", "distance_km": 2.4, "eta_min": 8, "rating": 4.5, "lat_offset": 0.014, "lng_offset": -0.013},
    {"id": "nearby-kabir", "name": "Kabir Singh", "phone": "+919812340009", "vehicle_type": "Auto", "vehicle_number": "DL 7B TR 1104", "distance_km": 3.1, "eta_min": 11, "rating": 4.4, "lat_offset": -0.016, "lng_offset": 0.017},
    {"id": "nearby-farhan", "name": "Farhan Ali", "phone": "+919812340010", "vehicle_type": "Auto", "vehicle_number": "DL 8D TR 6672", "distance_km": 3.8, "eta_min": 13, "rating": 4.3, "lat_offset": 0.020, "lng_offset": -0.019},
    # Car drivers
    {"id": "nearby-simran", "name": "Simran Arora", "phone": "+919812340011", "vehicle_type": "Car", "vehicle_number": "DL 8C AQ 6021", "distance_km": 1.2, "eta_min": 5, "rating": 4.9, "lat_offset": -0.009, "lng_offset": 0.007},
    {"id": "nearby-rohan", "name": "Rohan Malhotra", "phone": "+919812340012", "vehicle_type": "Car", "vehicle_number": "DL 3H CR 4429", "distance_km": 1.8, "eta_min": 6, "rating": 4.8, "lat_offset": 0.010, "lng_offset": -0.008},
    {"id": "nearby-priya", "name": "Priya Nair", "phone": "+919812340013", "vehicle_type": "Car", "vehicle_number": "DL 5J CR 7761", "distance_km": 2.5, "eta_min": 8, "rating": 4.7, "lat_offset": -0.013, "lng_offset": -0.012},
    {"id": "nearby-amit", "name": "Amit Bansal", "phone": "+919812340014", "vehicle_type": "Car", "vehicle_number": "DL 7K CR 3390", "distance_km": 3.2, "eta_min": 11, "rating": 4.6, "lat_offset": 0.017, "lng_offset": 0.015},
    {"id": "nearby-tanvi", "name": "Tanvi Desai", "phone": "+919812340015", "vehicle_type": "Car", "vehicle_number": "DL 9A CR 8814", "distance_km": 4.1, "eta_min": 14, "rating": 4.5, "lat_offset": -0.021, "lng_offset": 0.022},
]

DISPATCH_RADIUS_KM = 5.0
DISPATCH_MAX_DRIVERS = 5

# --- Auth Endpoints ---
def gen_referral_code(name: str) -> str:
    import re, secrets
    prefix = re.sub(r'[^A-Z]', '', name.upper())[:3] or "OPS"
    suffix = secrets.token_hex(3).upper()  # 6 hex chars
    return f"{prefix}{suffix}"

@api_router.post("/auth/signup")
async def signup(data: UserSignup, response: Response):
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    # Public signup cannot create admin accounts
    if data.role == "admin":
        raise HTTPException(status_code=403, detail="Admin accounts cannot be created via public signup")
    if data.role not in ("user", "driver"):
        raise HTTPException(status_code=400, detail="Invalid role")

    # Handle referral code: credit both sides with 50 OPS coins
    referred_by_id = None
    reward_credits = 0
    if data.referred_by_code:
        referrer = await db.users.find_one({"referral_code": data.referred_by_code.strip().upper()})
        if referrer:
            referred_by_id = referrer["id"]
            reward_credits = 50
            await db.users.update_one({"id": referrer["id"]}, {"$inc": {"reward_credits": 50}})

    # Ensure unique referral code
    while True:
        code = gen_referral_code(data.name)
        if not await db.users.find_one({"referral_code": code}):
            break

    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "name": data.name,
        "email": data.email,
        "password": hash_password(data.password),
        "role": data.role,
        "phone": data.phone,
        "vehicle_type": data.vehicle_type if data.role == "driver" else None,
        "vehicle_number": data.vehicle_number if data.role == "driver" else None,
        "rating": 5.0 if data.role == "driver" else None,
        "is_online": True if data.role == "driver" else False,
        "referral_code": code,
        "referred_by_id": referred_by_id,
        "reward_credits": reward_credits,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    token = create_access_token({"sub": user_id, "role": data.role})
    response.set_cookie("access_token", token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    return {"token": token, "user": {k: v for k, v in user_doc.items() if k not in ("password", "_id")}}

@api_router.post("/auth/login")
async def login(data: UserLogin, response: Response):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=400, detail="Invalid email or password")
    
    token = create_access_token({"sub": user["id"], "role": user["role"]})
    user_data = {k: v for k, v in user.items() if k != "password"}
    response.set_cookie("access_token", token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    return {"token": token, "user": user_data}

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {k: v for k, v in current_user.items() if k != "password"}

# --- Geocoding & Routing (OpenStreetMap Nominatim + OSRM) ---
@api_router.get("/geocode")
async def geocode(q: str):
    """Convert address to lat/lng using Photon (OpenStreetMap-based, no key required)."""
    headers = {"User-Agent": "OPS-Ride-Booking/1.0 (Mozilla/5.0 compatible)", "Accept": "application/json"}
    try:
        url = "https://photon.komoot.io/api/"
        params = {"q": q, "limit": 6}
        async with httpx.AsyncClient(timeout=8.0) as _c:
            resp = await _c.get(url, params=params, headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            results = []
            for feat in data.get("features", []):
                props = feat.get("properties", {})
                coords = feat.get("geometry", {}).get("coordinates", [])
                if len(coords) != 2:
                    continue
                parts = [props.get("name"), props.get("street"), props.get("city") or props.get("locality"), props.get("state"), props.get("country")]
                display = ", ".join([p for p in parts if p])
                results.append({
                    "display_name": display or props.get("name", "Unknown"),
                    "lat": float(coords[1]),
                    "lng": float(coords[0]),
                    "type": props.get("osm_value", "")
                })
            return results
        logger.warning("Photon geocode returned HTTP %s", resp.status_code)
    except Exception as e:
        logger.warning(f"Photon geocode error: {e}")
    # Fallback: Nominatim (may be rate-limited)
    try:
        url = "https://nominatim.openstreetmap.org/search"
        params = {"q": q, "format": "json", "limit": 5}
        headers = {"User-Agent": "OPS-Ride-Booking/1.0"}
        async with httpx.AsyncClient(timeout=8.0) as _c:
            resp = await _c.get(url, params=params, headers=headers)
        if resp.status_code == 200:
            return [
                {
                    "display_name": item.get("display_name"),
                    "lat": float(item["lat"]),
                    "lng": float(item["lon"]),
                    "type": item.get("type", "")
                }
                for item in resp.json()
            ]
        logger.warning("Nominatim geocode returned HTTP %s", resp.status_code)
    except Exception as e:
        logger.warning(f"Nominatim geocode error: {e}")
    return []

@api_router.get("/reverse-geocode")
async def reverse_geocode(lat: float, lon: float):
    """Reverse geocode using Photon."""
    try:
        url = "https://photon.komoot.io/reverse"
        async with httpx.AsyncClient(timeout=8.0) as _c:
            resp = await _c.get(url, params={"lat": lat, "lon": lon})
        if resp.status_code == 200:
            data = resp.json()
            if data.get("features"):
                props = data["features"][0].get("properties", {})
                parts = [props.get("name"), props.get("street"), props.get("city") or props.get("locality"), props.get("state"), props.get("country")]
                display = ", ".join([p for p in parts if p])
                return {"display_name": display or f"{lat:.4f}, {lon:.4f}"}
    except Exception as e:
        logger.warning(f"Photon reverse error: {e}")
    return {"display_name": f"{lat:.4f}, {lon:.4f}"}

@api_router.get("/route")
async def route(from_lat: float, from_lng: float, to_lat: float, to_lng: float):
    """Get driving route + distance between two coords using OSRM public server."""
    try:
        url = f"https://router.project-osrm.org/route/v1/driving/{from_lng},{from_lat};{to_lng},{to_lat}"
        params = {"overview": "full", "geometries": "geojson"}
        async with httpx.AsyncClient(timeout=10.0) as _c:
            resp = await _c.get(url, params=params)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("routes"):
                r = data["routes"][0]
                # coordinates come back as [lng, lat]; convert to [lat, lng] for Leaflet
                coords = [[c[1], c[0]] for c in r["geometry"]["coordinates"]]
                return {
                    "distance_km": round(r["distance"] / 1000, 2),
                    "duration_min": round(r["duration"] / 60, 1),
                    "coordinates": coords
                }
    except Exception as e:
        logger.warning(f"OSRM routing error: {e}")
    # Haversine fallback
    R = 6371.0
    dlat = radians(to_lat - from_lat)
    dlng = radians(to_lng - from_lng)
    a = sin(dlat/2)**2 + cos(radians(from_lat)) * cos(radians(to_lat)) * sin(dlng/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    distance = round(R * c, 2)
    return {
        "distance_km": distance,
        "duration_min": round(distance * 2.5, 1),
        "coordinates": [[from_lat, from_lng], [to_lat, to_lng]]
    }

# --- Weather API Integration ---
@api_router.get("/weather")
async def get_weather(lat: float = 28.6139, lon: float = 77.2090):
    # Open-Meteo is a real, keyless weather provider used as the primary source.
    try:
        async with httpx.AsyncClient(timeout=8.0) as _c:
            resp = await _c.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "current": "temperature_2m,rain,precipitation,weather_code,wind_speed_10m",
                    "timezone": "auto"
                },
            )
        if resp.status_code == 200:
            current = resp.json().get("current", {})
            code = int(current.get("weather_code", 0))
            rain = float(current.get("rain", current.get("precipitation", 0)) or 0)
            condition = "Clear"
            if code >= 95:
                condition = "Storm"
            elif code >= 51:
                condition = "Rain"
            elif code in (1, 2, 3):
                condition = "Clouds"
            wind = round(float(current.get("wind_speed_10m", 0)) / 3.6, 1)
            hazardous = code >= 51 or wind > 12
            return {
                "condition": condition,
                "description": "live conditions from Open-Meteo",
                "temp": float(current.get("temperature_2m", 0)),
                "wind_speed": wind,
                "weather_code": code,
                "rain_mm": rain,
                "is_hazardous": hazardous,
                "advisory": "Weather alert: please ride carefully. Fare will be fairly recalculated if you cancel." if hazardous else "Live weather checked. Fare is protected at booking."
            }
    except Exception as e:
        logger.warning(f"Open-Meteo weather error: {e}")
    if OPENWEATHER_API_KEY:
        try:
            url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={OPENWEATHER_API_KEY}&units=metric"
            async with httpx.AsyncClient(timeout=5.0) as _c:
                resp = await _c.get(url)
            if resp.status_code == 200:
                data = resp.json()
                weather_main = data["weather"][0]["main"] # Clear, Rain, Thunderstorm, Clouds, etc.
                temp = data["main"]["temp"]
                wind_speed = data["wind"]["speed"]
                
                is_hazardous = weather_main in ["Rain", "Thunderstorm", "Squall", "Tornado"] or wind_speed > 12
                advisory = "Safe driving conditions."
                if is_hazardous:
                    advisory = f"Weather Alert: {weather_main} detected! Drive carefully, maintain low speed and use rain gear. Fare remains fixed as locked."

                return {
                    "condition": weather_main,
                    "description": data["weather"][0]["description"],
                    "temp": temp,
                    "wind_speed": wind_speed,
                    "is_hazardous": is_hazardous,
                    "advisory": advisory
                }
        except Exception as e:
            logger.warning(f"OpenWeather API error: {e}")
    
    # Fallback simulated weather with occasional safety simulation
    return {
        "condition": "Clear",
        "description": "clear sky",
        "temp": 28.5,
        "wind_speed": 3.2,
        "is_hazardous": False,
        "advisory": "Fare Locked – Weather will not affect your price. Enjoy your smooth ride with OPS!"
    }

@api_router.post("/fares/estimate")
async def estimate_fares(data: FareEstimateRequest):
    return {
        "fares": calculate_fare_options(data.distance_km, data.duration_min, data.weather_code, data.rain_mm),
        "model": "OPS Dynamic Fare v1",
        "distance_km": data.distance_km,
        "duration_min": data.duration_min,
        "weather_aware": True
    }

@api_router.get("/drivers/nearby")
async def nearby_drivers(vehicle_type: str = "Bike"):
    # Return top-5 nearest drivers within DISPATCH_RADIUS_KM (5 km)
    matched = sorted(
        [d.copy() for d in DEMO_NEARBY_DRIVERS
         if d["vehicle_type"] == vehicle_type and d["distance_km"] <= DISPATCH_RADIUS_KM],
        key=lambda d: d["distance_km"]
    )[:DISPATCH_MAX_DRIVERS]
    return {
        "drivers": matched,
        "dispatch_count": len(matched),
        "dispatch_radius_km": DISPATCH_RADIUS_KM,
        "dispatch_strategy": "top-5-within-5km-nearest-wins"
    }

# --- Rides Endpoints ---
@api_router.post("/rides")
async def create_ride(data: RideCreate, current_user: dict = Depends(get_current_user)):
    if data.distance_km <= 0 or data.distance_km > 500:
        raise HTTPException(status_code=400, detail="Invalid distance (must be > 0 and <= 500 km)")
    if data.vehicle_type not in ("Bike", "Auto", "Car"):
        raise HTTPException(status_code=400, detail="Invalid vehicle type")
    v_type = data.vehicle_type
    live_weather = await get_weather(
        lat=float((data.pickup_coords or {}).get("lat", 28.6139)),
        lon=float((data.pickup_coords or {}).get("lng", 77.2090))
    )
    fare_options = calculate_fare_options(
        data.distance_km,
        max(10, data.distance_km * 2.1),
        int(live_weather.get("weather_code", 0)),
        float(live_weather.get("rain_mm", 0))
    )
    fare = fare_options[v_type]
    # Multi-driver dispatch: notify top 5 nearest drivers within 5 km radius (for display only)
    dispatched = sorted(
        [driver.copy() for driver in DEMO_NEARBY_DRIVERS
         if driver["vehicle_type"] == v_type and driver["distance_km"] <= DISPATCH_RADIUS_KM],
        key=lambda driver: driver["distance_km"]
    )[:DISPATCH_MAX_DRIVERS]
    # Do NOT auto-assign. Real logged-in drivers will accept from their Captain dashboard.
    # The nearest dispatched driver is only shown as "notified" for UX.
    nearest = dispatched[0] if dispatched else None
    
    ride_id = str(uuid.uuid4())
    ride_doc = {
        "id": ride_id,
        "user_id": current_user["id"],
        "user_name": current_user["name"],
        "user_phone": current_user.get("phone", ""),
        "pickup_location": data.pickup_location,
        "destination_location": data.destination_location,
        "pickup_coords": data.pickup_coords,
        "destination_coords": data.destination_coords,
        "vehicle_type": v_type,
        "distance_km": data.distance_km,
        "fare": fare,
        "fare_options": fare_options,
        "fare_locked": True,
        "fare_lock_message": "Fare protected at booking; weather is included in the dynamic estimate.",
        "weather_snapshot": live_weather,
        "dispatch_count": len(dispatched),
        "dispatch_radius_km": DISPATCH_RADIUS_KM,
        "requested_driver_ids": [driver["id"] for driver in dispatched],
        "dispatched_drivers": [{
            "id": d["id"], "name": d["name"], "vehicle_number": d["vehicle_number"],
            "distance_km": d["distance_km"], "eta_min": d["eta_min"], "rating": d["rating"]
        } for d in dispatched],
        "nearest_hint": {
            "name": nearest["name"], "vehicle_number": nearest["vehicle_number"],
            "distance_km": nearest["distance_km"], "eta_min": nearest["eta_min"]
        } if nearest else None,
        "status": "Requested",
        "driver_id": None,
        "driver_name": None,
        "driver_phone": None,
        "driver_distance_km": None,
        "driver_eta_min": None,
        "vehicle_number": None,
        "driver_rating": None,
        "captain_location": None,
        "captain_speed_kmh": 0,
        "payment_method": "Cash",
        "payment_status": "Pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "feedback": None
    }
    await db.rides.insert_one(ride_doc)
    return {k: v for k, v in ride_doc.items() if k != "_id"}

@api_router.get("/rides")
async def get_rides(current_user: dict = Depends(get_current_user)):
    role = current_user["role"]
    if role == "admin":
        rides = await db.rides.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    elif role == "driver":
        # Drivers see requested rides or rides assigned to them
        rides = await db.rides.find({
            "$or": [
                {"status": "Requested"},
                {"driver_id": current_user["id"]}
            ]
        }, {"_id": 0}).sort("created_at", -1).to_list(200)
    else:
        rides = await db.rides.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return rides

@api_router.get("/rides/{ride_id}")
async def get_ride_by_id(ride_id: str, current_user: dict = Depends(get_current_user)):
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    return ride

@api_router.put("/rides/{ride_id}/status")
async def update_ride_status(ride_id: str, data: RideStatusUpdate, current_user: dict = Depends(get_current_user)):
    ride = await db.rides.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    allowed = {"Accepted", "Driver Arriving", "Ride Started", "Ride Completed", "Cancelled"}
    if data.status not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid status. Allowed: {sorted(allowed)}")
    if current_user["role"] not in ("driver", "admin"):
        raise HTTPException(status_code=403, detail="Only drivers can update ride status")
    if data.status == "Accepted":
        if current_user["role"] != "driver" or ride.get("user_id") == current_user["id"]:
            raise HTTPException(status_code=403, detail="Only another driver can accept this ride")
        if ride.get("status") != "Requested":
            raise HTTPException(status_code=409, detail="Only requested rides can be accepted")
    elif current_user["role"] != "admin" and ride.get("driver_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the assigned driver can update this ride")

    transitions = {
        "Requested": {"Accepted", "Cancelled"},
        "Accepted": {"Driver Arriving", "Cancelled"},
        "Driver Arriving": {"Ride Started", "Cancelled"},
        "Ride Started": {"Ride Completed", "Cancelled"},
        "Ride Completed": set(),
        "Cancelled": set(),
    }
    if data.status not in transitions.get(ride.get("status"), set()):
        raise HTTPException(status_code=409, detail="Invalid ride status transition")

    update_data = {"status": data.status}
    if data.status == "Accepted":
        update_data["driver_id"] = current_user["id"]
        update_data["driver_name"] = current_user["name"]
        update_data["driver_phone"] = current_user.get("phone", "")
        update_data["vehicle_number"] = current_user.get("vehicle_number", "DL 01 XX 9999")
        update_data["driver_rating"] = current_user.get("rating", 5.0)
    elif data.status == "Ride Completed":
        update_data["payment_status"] = "Paid (Cash)"
    
    await db.rides.update_one({"id": ride_id}, {"$set": update_data})
    updated = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    return updated

@api_router.post("/rides/{ride_id}/cancel")
async def cancel_ride(ride_id: str, data: RideCancellation, current_user: dict = Depends(get_current_user)):
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if current_user["id"] not in (ride.get("user_id"), ride.get("driver_id")):
        raise HTTPException(status_code=403, detail="Only the rider or assigned captain can cancel this ride")
    if ride.get("status") in ("Ride Completed", "Cancelled"):
        raise HTTPException(status_code=409, detail="This ride is already closed")
    weather = ride.get("weather_snapshot", {})
    if data.reason == "weather":
        weather = await get_weather(
            lat=float((ride.get("pickup_coords") or {}).get("lat", 28.6139)),
            lon=float((ride.get("pickup_coords") or {}).get("lng", 77.2090))
        )
    options = calculate_fare_options(
        max(data.travelled_km, 0.1),
        max(data.elapsed_min, 1),
        int(weather.get("weather_code", 0)),
        float(weather.get("rain_mm", 0))
    )
    revised_fare = options[ride.get("vehicle_type", "Bike")]
    await db.rides.update_one({"id": ride_id}, {"$set": {
        "status": "Cancelled",
        "cancellation_reason": data.reason,
        "cancellation_note": data.note or "",
        "travelled_km": data.travelled_km,
        "elapsed_min": data.elapsed_min,
        "weather_snapshot": weather,
        "fare": revised_fare,
        "revised_fare": revised_fare,
        "payment_status": "Pending"
    }})
    updated = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    return {"ride": updated, "revised_fare": revised_fare, "message": "Fair fare recalculated from actual distance travelled"}

@api_router.post("/rides/{ride_id}/feedback")
async def submit_feedback(ride_id: str, data: RideFeedback, current_user: dict = Depends(get_current_user)):
    ride = await db.rides.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the rider can submit feedback")
    if ride.get("status") != "Ride Completed":
        raise HTTPException(status_code=409, detail="Feedback is available after ride completion")
    if ride.get("feedback"):
        raise HTTPException(status_code=409, detail="Feedback has already been submitted")
    
    feedback_doc = {
        "rating": data.rating,
        "comment": data.comment,
        "issue_report": data.issue_report,
        "submitted_at": datetime.now(timezone.utc).isoformat()
    }
    await db.rides.update_one({"id": ride_id}, {"$set": {"feedback": feedback_doc}})
    
    # If driver assigned, update driver rating
    if ride.get("driver_id"):
        driver = await db.users.find_one({"id": ride["driver_id"]})
        if driver:
            old_rating = driver.get("rating", 5.0)
            new_rating = round((old_rating + data.rating) / 2, 1)
            await db.users.update_one({"id": ride["driver_id"]}, {"$set": {"rating": new_rating}})
            
    return {"message": "Feedback submitted successfully", "feedback": feedback_doc}

@api_router.put("/rides/{ride_id}/tracking")
async def update_ride_tracking(ride_id: str, data: TrackingUpdate, current_user: dict = Depends(get_current_user)):
    ride = await db.rides.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if current_user["role"] != "driver" or ride.get("driver_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only assigned captain can update tracking")
    if ride.get("status") not in ("Accepted", "Driver Arriving", "Ride Started"):
        raise HTTPException(status_code=409, detail="Tracking updates only allowed for active rides")
    await db.rides.update_one({"id": ride_id}, {"$set": {
        "captain_location": {"lat": data.lat, "lng": data.lng},
        "captain_speed_kmh": round(data.speed_kmh, 1),
        "captain_updated_at": datetime.now(timezone.utc).isoformat()
    }})
    updated = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    return updated

# --- Deliveries Endpoints ---
@api_router.post("/deliveries")
async def create_delivery(data: DeliveryCreate, current_user: dict = Depends(get_current_user)):
    # Delivery fare (slightly higher than ride to cover handoff, but still affordable)
    base_fees = {"Bike": 25, "Auto": 40, "Car": 60}
    per_km_rates = {"Bike": 8, "Auto": 11, "Car": 14}
    v_type = data.vehicle_type
    fare = base_fees[v_type] + (data.distance_km * per_km_rates[v_type])
    fare = round(fare, 2)

    delivery_id = str(uuid.uuid4())
    delivery_doc = {
        "id": delivery_id,
        "user_id": current_user["id"],
        "user_name": current_user["name"],
        "user_phone": current_user.get("phone", ""),
        "pickup_location": data.pickup_location,
        "drop_location": data.drop_location,
        "pickup_coords": data.pickup_coords,
        "drop_coords": data.drop_coords,
        "receiver_name": data.receiver_name,
        "receiver_phone": data.receiver_phone,
        "parcel_type": data.parcel_type,
        "parcel_notes": data.parcel_notes,
        "vehicle_type": v_type,
        "distance_km": data.distance_km,
        "fare": fare,
        "status": "Requested",  # Requested, Accepted, Picking Up, In Transit, Delivered, Cancelled
        "driver_id": None,
        "driver_name": None,
        "driver_phone": None,
        "vehicle_number": None,
        "captain_location": None,
        "captain_speed_kmh": 0,
        "payment_method": "Cash",
        "payment_status": "Pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.deliveries.insert_one(delivery_doc)
    return {k: v for k, v in delivery_doc.items() if k != "_id"}

@api_router.get("/deliveries")
async def get_deliveries(current_user: dict = Depends(get_current_user)):
    role = current_user["role"]
    if role == "admin":
        rows = await db.deliveries.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    elif role == "driver":
        rows = await db.deliveries.find({
            "$or": [
                {"status": "Requested"},
                {"driver_id": current_user["id"]}
            ]
        }, {"_id": 0}).sort("created_at", -1).to_list(200)
    else:
        rows = await db.deliveries.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return rows

@api_router.put("/deliveries/{delivery_id}/status")
async def update_delivery_status(delivery_id: str, data: DeliveryStatusUpdate, current_user: dict = Depends(get_current_user)):
    delivery = await db.deliveries.find_one({"id": delivery_id})
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")
    allowed = {"Accepted", "Picking Up", "In Transit", "Delivered", "Cancelled"}
    if data.status not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid status. Allowed: {sorted(allowed)}")
    if current_user["role"] not in ("driver", "admin"):
        raise HTTPException(status_code=403, detail="Only captains can update delivery status")
    if data.status == "Accepted":
        if current_user["role"] != "driver" or delivery.get("user_id") == current_user["id"]:
            raise HTTPException(status_code=403, detail="Only another captain can accept this delivery")
        if delivery.get("status") != "Requested":
            raise HTTPException(status_code=409, detail="Only requested deliveries can be accepted")
    elif current_user["role"] != "admin" and delivery.get("driver_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the assigned captain can update this delivery")

    transitions = {
        "Requested": {"Accepted", "Cancelled"},
        "Accepted": {"Picking Up", "Cancelled"},
        "Picking Up": {"In Transit", "Cancelled"},
        "In Transit": {"Delivered", "Cancelled"},
        "Delivered": set(),
        "Cancelled": set(),
    }
    if data.status not in transitions.get(delivery.get("status"), set()):
        raise HTTPException(status_code=409, detail="Invalid delivery status transition")

    update_data = {"status": data.status}
    if data.status == "Accepted":
        update_data["driver_id"] = current_user["id"]
        update_data["driver_name"] = current_user["name"]
        update_data["driver_phone"] = current_user.get("phone", "")
        update_data["vehicle_number"] = current_user.get("vehicle_number", "DL 01 XX 9999")
    elif data.status == "Delivered":
        update_data["payment_status"] = "Paid (Cash)"

    await db.deliveries.update_one({"id": delivery_id}, {"$set": update_data})
    updated = await db.deliveries.find_one({"id": delivery_id}, {"_id": 0})
    return updated

@api_router.put("/deliveries/{delivery_id}/tracking")
async def update_delivery_tracking(delivery_id: str, data: TrackingUpdate, current_user: dict = Depends(get_current_user)):
    delivery = await db.deliveries.find_one({"id": delivery_id})
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")
    if current_user["role"] != "driver" or delivery.get("driver_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only assigned captain can update tracking")
    if delivery.get("status") not in ("Accepted", "Picking Up", "In Transit"):
        raise HTTPException(status_code=409, detail="Tracking updates only allowed for active deliveries")
    await db.deliveries.update_one({"id": delivery_id}, {"$set": {
        "captain_location": {"lat": data.lat, "lng": data.lng},
        "captain_speed_kmh": round(data.speed_kmh, 1),
        "captain_updated_at": datetime.now(timezone.utc).isoformat()
    }})
    updated = await db.deliveries.find_one({"id": delivery_id}, {"_id": 0})
    return updated

@api_router.post("/deliveries/{delivery_id}/proof")
async def upload_delivery_proof(delivery_id: str, data: DeliveryProof, current_user: dict = Depends(get_current_user)):
    delivery = await db.deliveries.find_one({"id": delivery_id})
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")
    if current_user["role"] != "driver" or delivery.get("driver_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only assigned captain can upload proof")
    if delivery.get("status") not in ("In Transit", "Delivered"):
        raise HTTPException(status_code=409, detail="Proof can be added while In Transit or after Delivered")
    # Basic size guard: prevent absurdly large payloads (~2 MB after base64)
    if len(data.image_base64) > 3_000_000:
        raise HTTPException(status_code=413, detail="Image too large (max ~2 MB)")
    proof = {
        "image_base64": data.image_base64,
        "note": data.note or "",
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    await db.deliveries.update_one({"id": delivery_id}, {"$set": {"proof": proof}})
    updated = await db.deliveries.find_one({"id": delivery_id}, {"_id": 0})
    return updated

# --- Rentals Endpoints ---
@api_router.post("/rentals")
async def create_rental(data: RentalBookingCreate, current_user: dict = Depends(get_current_user)):
    rental_id = str(uuid.uuid4())
    rental_doc = {
        "id": rental_id,
        "user_id": current_user["id"],
        "user_name": current_user["name"],
        "user_phone": current_user.get("phone", ""),
        "vehicle_type": data.vehicle_type,
        "package_name": data.package_name,
        "amount": data.amount,
        "pickup_location": data.pickup_location,
        "pickup_coords": data.pickup_coords,
        "status": "Requested",  # Requested, Assigned, In Use, Completed, Cancelled
        "driver_id": None,
        "driver_name": None,
        "driver_phone": None,
        "vehicle_number": None,
        "captain_location": None,
        "captain_speed_kmh": 0,
        "payment_method": "Cash",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.rentals.insert_one(rental_doc)
    return {k: v for k, v in rental_doc.items() if k != "_id"}

@api_router.get("/rentals")
async def get_rentals(current_user: dict = Depends(get_current_user)):
    role = current_user["role"]
    if role == "admin":
        rentals = await db.rentals.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    elif role == "driver":
        rentals = await db.rentals.find({
            "$or": [
                {"status": "Requested"},
                {"driver_id": current_user["id"]}
            ]
        }, {"_id": 0}).sort("created_at", -1).to_list(200)
    else:
        rentals = await db.rentals.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return rentals

@api_router.put("/rentals/{rental_id}/status")
async def update_rental_status(rental_id: str, data: RentalStatusUpdate, current_user: dict = Depends(get_current_user)):
    rental = await db.rentals.find_one({"id": rental_id})
    if not rental:
        raise HTTPException(status_code=404, detail="Rental not found")
    allowed = {"Assigned", "In Use", "Completed", "Cancelled"}
    if data.status not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid status. Allowed: {sorted(allowed)}")
    if current_user["role"] not in ("driver", "admin"):
        raise HTTPException(status_code=403, detail="Only captains can update rental status")
    if data.status == "Assigned":
        if current_user["role"] != "driver" or rental.get("user_id") == current_user["id"]:
            raise HTTPException(status_code=403, detail="Only another captain can accept this rental")
        if rental.get("status") != "Requested":
            raise HTTPException(status_code=409, detail="Only requested rentals can be assigned")
    elif current_user["role"] != "admin" and rental.get("driver_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the assigned captain can update this rental")

    transitions = {
        "Requested": {"Assigned", "Cancelled"},
        "Assigned": {"In Use", "Cancelled"},
        "In Use": {"Completed", "Cancelled"},
        "Completed": set(),
        "Cancelled": set(),
    }
    if data.status not in transitions.get(rental.get("status"), set()):
        raise HTTPException(status_code=409, detail="Invalid rental status transition")

    update_data = {"status": data.status}
    if data.status == "Assigned":
        update_data["driver_id"] = current_user["id"]
        update_data["driver_name"] = current_user["name"]
        update_data["driver_phone"] = current_user.get("phone", "")
        update_data["vehicle_number"] = current_user.get("vehicle_number", "DL 01 XX 9999")

    await db.rentals.update_one({"id": rental_id}, {"$set": update_data})
    updated = await db.rentals.find_one({"id": rental_id}, {"_id": 0})
    return updated

@api_router.put("/rentals/{rental_id}/tracking")
async def update_rental_tracking(rental_id: str, data: TrackingUpdate, current_user: dict = Depends(get_current_user)):
    rental = await db.rentals.find_one({"id": rental_id})
    if not rental:
        raise HTTPException(status_code=404, detail="Rental not found")
    if current_user["role"] != "driver" or rental.get("driver_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only assigned captain can update tracking")
    if rental.get("status") not in ("Assigned", "In Use"):
        raise HTTPException(status_code=409, detail="Tracking updates only allowed for active rentals")
    await db.rentals.update_one({"id": rental_id}, {"$set": {
        "captain_location": {"lat": data.lat, "lng": data.lng},
        "captain_speed_kmh": round(data.speed_kmh, 1),
        "captain_updated_at": datetime.now(timezone.utc).isoformat()
    }})
    updated = await db.rentals.find_one({"id": rental_id}, {"_id": 0})
    return updated

# --- SOS Endpoints ---
@api_router.post("/rides/{ride_id}/sos")
async def ride_sos(ride_id: str, data: SOSAlert, current_user: dict = Depends(get_current_user)):
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if current_user["id"] not in (ride.get("user_id"), ride.get("driver_id")):
        raise HTTPException(status_code=403, detail="Not authorised for this ride")
    alert = {
        "id": str(uuid.uuid4()),
        "type": "ride",
        "ref_id": ride_id,
        "raised_by_id": current_user["id"],
        "raised_by_name": current_user["name"],
        "raised_by_role": current_user["role"],
        "lat": data.lat,
        "lng": data.lng,
        "note": data.note or "",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.sos_alerts.insert_one(alert)
    return {k: v for k, v in alert.items() if k != "_id"}

@api_router.post("/deliveries/{delivery_id}/sos")
async def delivery_sos(delivery_id: str, data: SOSAlert, current_user: dict = Depends(get_current_user)):
    delivery = await db.deliveries.find_one({"id": delivery_id}, {"_id": 0})
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")
    if current_user["id"] not in (delivery.get("user_id"), delivery.get("driver_id")):
        raise HTTPException(status_code=403, detail="Not authorised for this delivery")
    alert = {
        "id": str(uuid.uuid4()),
        "type": "delivery",
        "ref_id": delivery_id,
        "raised_by_id": current_user["id"],
        "raised_by_name": current_user["name"],
        "raised_by_role": current_user["role"],
        "lat": data.lat,
        "lng": data.lng,
        "note": data.note or "",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.sos_alerts.insert_one(alert)
    return {k: v for k, v in alert.items() if k != "_id"}

@api_router.get("/sos")
async def list_sos(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    alerts = await db.sos_alerts.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return alerts

# --- Admin Analytics ---
@api_router.get("/admin/stats")
async def get_admin_stats(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users_count = await db.users.count_documents({"role": "user"})
    drivers_count = await db.users.count_documents({"role": "driver"})
    rides_count = await db.rides.count_documents({})
    rentals_count = await db.rentals.count_documents({})
    deliveries_count = await db.deliveries.count_documents({})
    
    completed_rides = await db.rides.find({"status": "Ride Completed"}, {"fare": 1}).to_list(1000)
    ride_revenue = sum([r.get("fare", 0) for r in completed_rides])
    
    completed_rentals = await db.rentals.find({"status": {"$in": ["Requested", "Assigned", "In Use", "Completed"]}}, {"amount": 1}).to_list(1000)
    rental_revenue = sum([r.get("amount", 0) for r in completed_rentals])

    completed_deliveries = await db.deliveries.find({"status": "Delivered"}, {"fare": 1}).to_list(1000)
    delivery_revenue = sum([r.get("fare", 0) for r in completed_deliveries])

    total_revenue = ride_revenue + rental_revenue + delivery_revenue
    
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(200)
    drivers = [u for u in users if u["role"] == "driver"]
    
    return {
        "users_count": users_count,
        "drivers_count": drivers_count,
        "rides_count": rides_count,
        "rentals_count": rentals_count,
        "deliveries_count": deliveries_count,
        "total_revenue": total_revenue,
        "users": users,
        "drivers": drivers
    }

app.include_router(api_router)

_cors_origins = os.environ.get('CORS_ORIGINS', '*').split(',')
app.add_middleware(
    CORSMiddleware,
    allow_credentials='*' not in _cors_origins,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
