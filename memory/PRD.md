# OPS – On Time Providing Services (Ride Booking Platform)

## Problem Statement
Multi-service transport platform (rides, rentals, delivery) with multi-user login (Customer/Driver/Admin), ML-inspired dynamic fare, multi-driver dispatch (nearest-wins), weather-aware fare protection & mid-ride cancellation, OpenStreetMap integration, ratings & feedback.

## Tech Stack
- Frontend: React 19 + Tailwind + react-leaflet 5.0.0 + OpenStreetMap
- Backend: FastAPI + Motor (async MongoDB) + httpx (async external APIs) + JWT + bcrypt
- Weather: Open-Meteo (keyless, async httpx)
- Geocoding/Routing: Photon + Nominatim + OSRM

## Implemented (Feb 12, 2026)
- Auth (signup/login/me) for user, driver, admin roles
- Multi-driver dispatch: top 5 nearest within 5km radius, geographically nearest auto-accepts
- Ride creation → dispatched_drivers array + assigned driver (name, phone, vehicle_number, distance, ETA)
- Dynamic fare (Bike/Auto/Car) with weather awareness; prices sync across category card + Total (Cash) + Book button
- Live OpenStreetMap route preview with Leaflet (no runtime errors)
- Mid-ride cancellation with fair-fare recalc (weather-aware)
- Ride rating & feedback (1-5 star) → updates driver rating
- Rentals & Delivery flows
- SOS emergency alerts
- Admin analytics endpoint

## Backlog (P1)
- Split server.py into routers (auth, rides, drivers, rentals, delivery)
- Gate anonymous fetchMe/fetchWeather behind auth to reduce 401 console noise
- Real ML fare model (currently rule-based with weather multipliers)
- Real-time driver socket updates instead of polling

## Test Credentials
See /app/memory/test_credentials.md
