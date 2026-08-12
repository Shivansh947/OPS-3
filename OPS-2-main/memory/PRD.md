# OPS – On Time Providing Services (PRD)

## Original Problem Statement
User wanted a working clone of the uploaded OPS ride-booking website. In the latest iteration (Feb 2026) they asked in Hindi/Hinglish for:
1. Captain live speed on the ride map
2. Remove the homepage flowchart
3. Add a Rapido-style Delivery feature
4. Lower Bike/Auto/Car fares to affordable Rapido-like pricing
5. Working rider / captain / admin login flows
6. Browser title = "OPS", tagline "ON TIME PROVIDING SERVICES"
7. Remove "India's on-time promise" copy
8. Remove instant demo-login buttons (keep real login form)
9. Support a /login URL route

## Architecture
- Frontend: React (CRACO), Tailwind, Leaflet + react-leaflet, Axios, Lucide, single-page `App.js`
- Backend: FastAPI + Motor (MongoDB), JWT, bcrypt, cookie + Bearer auth
- Persistence collections: `users`, `rides`, `rentals`, `deliveries`

## User Personas
- Rider (role=`user`): books rides / rentals / deliveries, tracks captain, pays cash on arrival
- Captain (role=`driver`): accepts and progresses rides / deliveries, broadcasts live speed
- Admin (role=`admin`): views platform stats (users, captains, rides, rentals, deliveries, revenue)

## Core Requirements (static)
- Fare-locked pricing with transparent formulas
- Bike / Auto / Car support for both rides and deliveries
- Live captain speed shown to rider during active ride
- Homepage responsive with hero, booking, safety, CTA sections
- Test IDs on every interactive / critical element

## Implemented (updated 2026-02-10)
- Full auth (login/signup/me) with 3 seed accounts + admin-signup blocked with 403
- Ride booking + lifecycle (Requested to Accepted to Driver Arriving to Ride Started to Ride Completed)
- Ride tracking endpoint (captain broadcasts lat/lng + speed)
- Rentals booking (Bike/Auto/Car hourly packages)
- Delivery feature: create, list, status transitions (Requested to Accepted to Picking Up to In Transit to Delivered), tracking
- Live captain speed slider on driver dashboard; live speed panel on rider's active ride view + delivery view
- New affordable fares — Ride: Bike 20+7/km, Auto 30+10/km, Car 50+13/km; Delivery: Bike 25+8/km, Auto 40+11/km, Car 60+14/km
- Homepage flowchart REMOVED, "India's on-time promise" REMOVED, instant demo login buttons REMOVED
- Tagline "On Time Providing Services" across header + hero pill + footer + title
- `/login` URL sync via history.pushState
- Admin stats includes deliveries_count and delivery revenue

## Fare Formulas (locked)
- Ride: fare = base + distance_km * per_km
  - Bike: 20 + 7/km, Auto: 30 + 10/km, Car: 50 + 13/km
- Delivery:
  - Bike: 25 + 8/km, Auto: 40 + 11/km, Car: 60 + 14/km

## Seed / Test Accounts
See `/app/memory/test_credentials.md`

## Key API Endpoints
- POST /api/auth/{signup,login}; GET /api/auth/me
- POST/GET /api/rides, GET /api/rides/{id}, PUT /api/rides/{id}/status, PUT /api/rides/{id}/tracking, POST /api/rides/{id}/feedback
- POST/GET /api/rentals
- POST/GET /api/deliveries, PUT /api/deliveries/{id}/status, PUT /api/deliveries/{id}/tracking
- GET /api/admin/stats
- GET /api/geocode, /api/reverse-geocode, /api/route, /api/weather

## Backlog (P1/P2)
- P1: Modularize `App.js` (~1728 lines) into components (BookingView, DeliveryView, DriverDashboard, LoginModal, LiveRideCard)
- P1: Persist captain broadcast throttling on backend (throttle + validate speed range per vehicle)
- P2: Real driver GPS via navigator.geolocation.watchPosition on driver dashboard instead of simulated
- P2: Push notifications / websocket for live status updates instead of 4s polling
- P2: Payment integration (Stripe) for optional prepaid
- P2: Split backend server.py into routes/models modules

## Test Coverage
- Backend pytest: 9/9 pass (`/app/backend/tests/test_ops_api.py`)
- Reports: `/app/test_reports/iteration_1.json`, `iteration_2.json`, `iteration_3.json`
