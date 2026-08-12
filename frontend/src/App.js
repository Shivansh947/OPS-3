import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Bike, Car, Navigation, Shield, CloudRain, Sun, DollarSign, Clock,
  CheckCircle, AlertTriangle, Star, LogOut, MapPin, Search,
  Phone, ShieldCheck, Menu, X, ArrowRight, Zap, CheckCircle2, Crosshair, Loader2,
  Bell, CreditCard, Wind, ChevronDown, Sparkles
} from 'lucide-react';
import MapView from './components/MapView';

const API_BASE = process.env.REACT_APP_BACKEND_URL.replace(/\/+$/, '');
const API = `${API_BASE}/api`;

export default function App() {
  const [token, setToken] = useState('');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('ops_user') || 'null'));
  const [activeTab, setActiveTab] = useState(() =>
    typeof window !== 'undefined' && window.location.pathname === '/login' ? 'login' : 'home'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Booking & Ride State
  const [pickup, setPickup] = useState('Connaught Place, New Delhi');
  const [destination, setDestination] = useState('Cyber City, Gurugram');
  const [pickupCoords, setPickupCoords] = useState({ lat: 28.6315, lng: 77.2167, label: 'Connaught Place, New Delhi' });
  const [destCoords, setDestCoords] = useState({ lat: 28.4949, lng: 77.0898, label: 'Cyber City, Gurugram' });
  const [routeCoords, setRouteCoords] = useState([]);
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [destSuggestions, setDestSuggestions] = useState([]);
  const [showPickupSuggest, setShowPickupSuggest] = useState(false);
  const [showDestSuggest, setShowDestSuggest] = useState(false);
  const [geocodingWhich, setGeocodingWhich] = useState('');
  const [routeDurationMin, setRouteDurationMin] = useState(0);
  const pickupTimer = useRef(null);
  const destTimer = useRef(null);
  const bookingRef = useRef(null);
  const [vehicleType, setVehicleType] = useState('Bike');
  const [distanceKm, setDistanceKm] = useState(15.5);
  const [estimatedFare, setEstimatedFare] = useState(129);
  const [fareOptions, setFareOptions] = useState({ Bike: 216, Auto: 339, Car: 536 });
  const [dispatchDrivers, setDispatchDrivers] = useState([]);
  const [cancellationModalOpen, setCancellationModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('weather');
  const [cancelNote, setCancelNote] = useState('');
  const [currentRide, setCurrentRide] = useState(null);
  const [myRides, setMyRides] = useState([]);

  // Weather
  const [weather, setWeather] = useState({
    condition: 'Clear', description: 'clear sky', temp: 28.5, wind_speed: 3.2,
    weather_code: 0, rain_mm: 0, is_hazardous: false, advisory: 'Fare protected at booking.'
  });

  // Rentals & Admin
  const [rentals, setRentals] = useState([]);
  const [adminStats, setAdminStats] = useState(null);

  // Deliveries
  const [deliveries, setDeliveries] = useState([]);
  const [currentDelivery, setCurrentDelivery] = useState(null);
  const [dlvPickup, setDlvPickup] = useState('Connaught Place, New Delhi');
  const [dlvDrop, setDlvDrop] = useState('Karol Bagh, New Delhi');
  const [dlvPickupCoords, setDlvPickupCoords] = useState({ lat: 28.6315, lng: 77.2167, label: 'Connaught Place, New Delhi' });
  const [dlvDropCoords, setDlvDropCoords] = useState({ lat: 28.6519, lng: 77.1909, label: 'Karol Bagh, New Delhi' });
  const [dlvRouteCoords, setDlvRouteCoords] = useState([]);
  const [dlvDistanceKm, setDlvDistanceKm] = useState(7);
  const [dlvVehicle, setDlvVehicle] = useState('Bike');
  const [dlvParcelType, setDlvParcelType] = useState('Documents');
  const [dlvParcelNotes, setDlvParcelNotes] = useState('');
  const [dlvReceiverName, setDlvReceiverName] = useState('');
  const [dlvReceiverPhone, setDlvReceiverPhone] = useState('');
  const [dlvSuggestPickup, setDlvSuggestPickup] = useState([]);
  const [dlvSuggestDrop, setDlvSuggestDrop] = useState([]);
  const [dlvShowPickupSg, setDlvShowPickupSg] = useState(false);
  const [dlvShowDropSg, setDlvShowDropSg] = useState(false);
  const dlvPickupTimer = useRef(null);
  const dlvDropTimer = useRef(null);
  const [captainSpeed, setCaptainSpeed] = useState(0);
  const [gpsActive, setGpsActive] = useState(false);
  const gpsWatchIdRef = useRef(null);
  const gpsLastRef = useRef(null);

  // Live vehicle animation (client-side interpolation of vehicle along route)
  const [animatedVehiclePos, setAnimatedVehiclePos] = useState(null);
  const animTargetRef = useRef(null);

  // Delivery proof upload
  const [proofPreview, setProofPreview] = useState('');
  const [uploadingProof, setUploadingProof] = useState(false);

  // Feedback
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackRideId, setFeedbackRideId] = useState(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [issueReport, setIssueReport] = useState('');

  // Auth form
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authRole, setAuthRole] = useState('user');
  const [authPhone, setAuthPhone] = useState('');
  const authConfig = () => ({ withCredentials: true, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) });

  // Normalize FastAPI/axios errors — sometimes `detail` is a string, sometimes
  // an array of Pydantic validation objects. Render-safe string always.
  const errMsg = (err, fallback) => {
    const d = err?.response?.data?.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) return d.map(x => (x?.msg || JSON.stringify(x))).join(', ') || fallback;
    if (d && typeof d === 'object') return d.msg || JSON.stringify(d);
    return err?.message || fallback;
  };

  useEffect(() => { fetchMe(); fetchWeather(); }, [token]);

  useEffect(() => {
    if (user) {
      fetchRides();
      fetchRentals();
      fetchDeliveries();
      if (user.role === 'admin') fetchAdminStats();
    }
  }, [user]);

  // Dynamic fare recalc + nearest captain dispatch preview
  useEffect(() => {
    axios.post(`${API}/fares/estimate`, {
      distance_km: Math.max(distanceKm, 0.1),
      duration_min: routeDurationMin || Math.max(distanceKm * 2.1, 10),
      weather_code: weather.weather_code || 0,
      rain_mm: weather.rain_mm || 0
    }).then((res) => {
      setFareOptions(res.data.fares || {});
      setEstimatedFare(res.data.fares?.[vehicleType] || estimatedFare);
    }).catch(() => {});
  }, [vehicleType, distanceKm, routeDurationMin, weather.weather_code, weather.rain_mm]);

  useEffect(() => {
    axios.get(`${API}/drivers/nearby`, { params: { vehicle_type: vehicleType } })
      .then((res) => setDispatchDrivers(res.data.drivers || []))
      .catch(() => setDispatchDrivers([]));
  }, [vehicleType]);

  // Geocode pickup
  useEffect(() => {
    if (pickupTimer.current) clearTimeout(pickupTimer.current);
    if (!pickup || pickup.length < 3) { setPickupSuggestions([]); return; }
    if (pickupCoords && pickup === pickupCoords.label) return;
    pickupTimer.current = setTimeout(async () => {
      try { setGeocodingWhich('pickup');
        const res = await axios.get(`${API}/geocode`, { params: { q: pickup } });
        setPickupSuggestions(res.data || []);
      } catch (e) { console.error(e); } finally { setGeocodingWhich(''); }
    }, 500);
  }, [pickup]);

  // Geocode destination
  useEffect(() => {
    if (destTimer.current) clearTimeout(destTimer.current);
    if (!destination || destination.length < 3) { setDestSuggestions([]); return; }
    if (destCoords && destination === destCoords.label) return;
    destTimer.current = setTimeout(async () => {
      try { setGeocodingWhich('dest');
        const res = await axios.get(`${API}/geocode`, { params: { q: destination } });
        setDestSuggestions(res.data || []);
      } catch (e) { console.error(e); } finally { setGeocodingWhich(''); }
    }, 500);
  }, [destination]);

  // Route calc
  useEffect(() => {
    const compute = async () => {
      if (!pickupCoords?.lat || !destCoords?.lat) return;
      try {
        const res = await axios.get(`${API}/route`, {
          params: {
            from_lat: pickupCoords.lat, from_lng: pickupCoords.lng,
            to_lat: destCoords.lat, to_lng: destCoords.lng
          }
        });
        setRouteCoords(res.data.coordinates || []);
        setDistanceKm(res.data.distance_km || 0);
        setRouteDurationMin(res.data.duration_min || 0);
      } catch (e) { console.error(e); }
    };
    compute();
  }, [pickupCoords, destCoords]);

  const selectPickupSuggestion = (s) => {
    setPickup(s.display_name);
    setPickupCoords({ lat: s.lat, lng: s.lng, label: s.display_name });
    setShowPickupSuggest(false); setPickupSuggestions([]);
  };
  const selectDestSuggestion = (s) => {
    setDestination(s.display_name);
    setDestCoords({ lat: s.lat, lng: s.lng, label: s.display_name });
    setShowDestSuggest(false); setDestSuggestions([]);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) { setError('Geolocation not supported.'); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        const r = await axios.get(`${API}/reverse-geocode`, { params: { lat: latitude, lon: longitude } });
        const label = r.data.display_name;
        setPickup(label);
        setPickupCoords({ lat: latitude, lng: longitude, label });
        setSuccessMsg('Live location detected.');
      } catch { setPickupCoords({ lat: latitude, lng: longitude, label: 'Current Location' }); }
    }, (err) => setError('Location error: ' + err.message), { enableHighAccuracy: true, timeout: 10000 });
  };

  const fetchMe = async () => {
    try {
      const res = await axios.get(`${API}/auth/me`, authConfig());
      setUser(res.data);
      localStorage.setItem('ops_user', JSON.stringify(res.data));
    } catch {
      // Only force logout if there was a token/user; avoid resetting activeTab on initial anonymous load
      if (token || user) { logout(); }
    }
  };
  const fetchWeather = async () => {
    try {
      const params = pickupCoords ? { lat: pickupCoords.lat, lon: pickupCoords.lng } : {};
      const res = await axios.get(`${API}/weather`, { params });
      setWeather(res.data);
    } catch (e) { console.error(e); }
  };
  const fetchRides = async () => {
    try {
      const res = await axios.get(`${API}/rides`, authConfig());
      setMyRides(res.data);
      const active = res.data.find(r => ['Requested', 'Accepted', 'Driver Arriving', 'Ride Started'].includes(r.status));
      setCurrentRide(active || null);
    } catch (e) { console.error(e); }
  };
  const fetchRentals = async () => {
    try {
      const res = await axios.get(`${API}/rentals`, authConfig());
      setRentals(res.data);
    } catch (e) { console.error(e); }
  };
  const fetchDeliveries = async () => {
    try {
      const res = await axios.get(`${API}/deliveries`, authConfig());
      setDeliveries(res.data);
      const activeStates = ['Requested', 'Accepted', 'Picking Up', 'In Transit'];
      const own = user?.role === 'user'
        ? res.data.find(d => activeStates.includes(d.status) && d.user_id === user.id)
        : res.data.find(d => activeStates.includes(d.status) && d.driver_id === user?.id);
      setCurrentDelivery(own || null);
    } catch (e) { console.error(e); }
  };
  const fetchAdminStats = async () => {
    try {
      const res = await axios.get(`${API}/admin/stats`, authConfig());
      setAdminStats(res.data);
    } catch (e) { console.error(e); }
  };

  const handleLogin = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const res = await axios.post(`${API}/auth/login`, { email: authEmail, password: authPassword }, { withCredentials: true });
      setToken(res.data.token); setUser(res.data.user);
      localStorage.setItem('ops_user', JSON.stringify(res.data.user));
      setSuccessMsg(`Welcome back, ${res.data.user.name}!`);
      setActiveTab(res.data.user.role === 'driver' ? 'driver_dashboard' : res.data.user.role === 'admin' ? 'admin_panel' : 'home');
    } catch (err) { setError(errMsg(err, 'Login failed')); }
    finally { setLoading(false); }
  };
  const handleSignup = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const res = await axios.post(`${API}/auth/signup`, {
        name: authName, email: authEmail, password: authPassword, role: authRole,
        phone: authPhone,
        vehicle_type: authRole === 'driver' ? vehicleType : undefined,
        vehicle_number: authRole === 'driver' ? 'DL 01 AB 7890' : undefined
      }, { withCredentials: true });
      setToken(res.data.token); setUser(res.data.user);
      localStorage.setItem('ops_user', JSON.stringify(res.data.user));
      setSuccessMsg('Account created!');
      setActiveTab(authRole === 'driver' ? 'driver_dashboard' : authRole === 'admin' ? 'admin_panel' : 'home');
    } catch (err) { setError(errMsg(err, 'Signup failed')); }
    finally { setLoading(false); }
  };
  const quickLogin = async (role) => {
    const creds = {
      user: { email: 'user@ops.com', password: 'user123' },
      driver: { email: 'driver@ops.com', password: 'driver123' },
      admin: { email: 'admin@ops.com', password: 'admin123' }
    }[role];
    if (!creds) return;
    setLoading(true); setError('');
    try {
      const res = await axios.post(`${API}/auth/login`, creds, { withCredentials: true });
      setToken(res.data.token); setUser(res.data.user);
      localStorage.setItem('ops_user', JSON.stringify(res.data.user));
      setSuccessMsg(`Welcome back, ${res.data.user.name}!`);
      setActiveTab(res.data.user.role === 'driver' ? 'driver_dashboard' : res.data.user.role === 'admin' ? 'admin_panel' : 'home');
    } catch (err) { setError(errMsg(err, 'Login failed')); }
    finally { setLoading(false); }
  };

  const logout = () => {
    setToken(''); setUser(null); setCurrentRide(null);
    localStorage.removeItem('ops_user');
    setActiveTab('home');
  };

  const bookRide = async () => {
    if (!user) { setActiveTab('login'); setError('Please login to book a ride.'); return; }
    setLoading(true); setError('');
    try {
      const res = await axios.post(`${API}/rides`, {
        pickup_location: pickup, destination_location: destination,
        pickup_coords: pickupCoords ? { lat: pickupCoords.lat, lng: pickupCoords.lng } : undefined,
        destination_coords: destCoords ? { lat: destCoords.lat, lng: destCoords.lng } : undefined,
        vehicle_type: vehicleType, distance_km: distanceKm
      }, authConfig());
      setCurrentRide(res.data);
      if (res.data.fare_options) {
        setFareOptions(res.data.fare_options);
        setEstimatedFare(res.data.fare_options[vehicleType] || res.data.fare);
      }
      setSuccessMsg('Ride requested. Finding a nearby captain...');
      fetchRides();
    } catch (err) { setError(errMsg(err, 'Failed to book ride')); }
    finally { setLoading(false); }
  };
  const updateRideStatus = async (rideId, newStatus) => {
    try {
      const res = await axios.put(`${API}/rides/${rideId}/status`, { status: newStatus },
        authConfig());
      setCurrentRide(res.data);
      fetchRides();
      setSuccessMsg(`Ride status: ${newStatus}`);
    } catch (err) { setError(errMsg(err, 'Failed to update status')); }
  };
  const cancelRide = async () => {
    if (!currentRide) return;
    setLoading(true); setError('');
    try {
      const res = await axios.post(`${API}/rides/${currentRide.id}/cancel`, {
        reason: cancelReason, note: cancelNote, travelled_km: 6.8, elapsed_min: 11
      }, authConfig());
      setCurrentRide(res.data.ride);
      setCancellationModalOpen(false);
      setSuccessMsg(`Fair fare recalculated: ₹${res.data.revised_fare} for distance travelled.`);
      fetchRides();
    } catch (err) { setError(errMsg(err, 'Cancellation failed')); }
    finally { setLoading(false); }
  };
  const bookRental = async (pkg) => {
    if (!user) { setActiveTab('login'); setError('Please login to book a rental.'); return; }
    setLoading(true);
    try {
      await axios.post(`${API}/rentals`, {
        vehicle_type: pkg.vehicleType, package_name: pkg.name,
        amount: pkg.price, pickup_location: pickup,
        pickup_coords: pickupCoords ? { lat: pickupCoords.lat, lng: pickupCoords.lng } : undefined
      }, authConfig());
      setSuccessMsg(`Booked ${pkg.name} (${pkg.vehicleType}). ₹${pkg.price} cash on handover.`);
      fetchRentals(); setActiveTab('my_rides');
    } catch (err) { setError(errMsg(err, 'Rental booking failed')); }
    finally { setLoading(false); }
  };
  const updateRentalStatus = async (rentalId, newStatus) => {
    try {
      await axios.put(`${API}/rentals/${rentalId}/status`, { status: newStatus }, authConfig());
      fetchRentals();
      setSuccessMsg(`Rental: ${newStatus}`);
    } catch (err) { setError(errMsg(err, 'Failed to update rental')); }
  };
  const submitFeedback = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/rides/${feedbackRideId}/feedback`,
        { rating, comment, issue_report: issueReport },
        authConfig());
      setFeedbackModalOpen(false); setSuccessMsg('Thanks for the feedback!'); fetchRides();
    } catch (err) { setError(errMsg(err, 'Feedback failed')); }
  };

  // Delivery geocode pickup
  useEffect(() => {
    if (dlvPickupTimer.current) clearTimeout(dlvPickupTimer.current);
    if (!dlvPickup || dlvPickup.length < 3) { setDlvSuggestPickup([]); return; }
    if (dlvPickupCoords && dlvPickup === dlvPickupCoords.label) return;
    dlvPickupTimer.current = setTimeout(async () => {
      try {
        const res = await axios.get(`${API}/geocode`, { params: { q: dlvPickup } });
        setDlvSuggestPickup(res.data || []);
      } catch (e) { console.error(e); }
    }, 500);
  }, [dlvPickup]);

  // Delivery geocode drop
  useEffect(() => {
    if (dlvDropTimer.current) clearTimeout(dlvDropTimer.current);
    if (!dlvDrop || dlvDrop.length < 3) { setDlvSuggestDrop([]); return; }
    if (dlvDropCoords && dlvDrop === dlvDropCoords.label) return;
    dlvDropTimer.current = setTimeout(async () => {
      try {
        const res = await axios.get(`${API}/geocode`, { params: { q: dlvDrop } });
        setDlvSuggestDrop(res.data || []);
      } catch (e) { console.error(e); }
    }, 500);
  }, [dlvDrop]);

  // Delivery route calc
  useEffect(() => {
    const compute = async () => {
      if (!dlvPickupCoords?.lat || !dlvDropCoords?.lat) return;
      try {
        const res = await axios.get(`${API}/route`, {
          params: {
            from_lat: dlvPickupCoords.lat, from_lng: dlvPickupCoords.lng,
            to_lat: dlvDropCoords.lat, to_lng: dlvDropCoords.lng
          }
        });
        setDlvRouteCoords(res.data.coordinates || []);
        setDlvDistanceKm(res.data.distance_km || 0);
      } catch (e) { console.error(e); }
    };
    compute();
  }, [dlvPickupCoords, dlvDropCoords]);

  const dlvEstimateFare = (() => {
    const base = { Bike: 15, Auto: 25, Car: 40 };
    const perKm = { Bike: 5, Auto: 7, Car: 10 };
    return Math.round(base[dlvVehicle] + dlvDistanceKm * perKm[dlvVehicle]);
  })();

  const selectDlvPickup = (s) => {
    setDlvPickup(s.display_name);
    setDlvPickupCoords({ lat: s.lat, lng: s.lng, label: s.display_name });
    setDlvShowPickupSg(false); setDlvSuggestPickup([]);
  };
  const selectDlvDrop = (s) => {
    setDlvDrop(s.display_name);
    setDlvDropCoords({ lat: s.lat, lng: s.lng, label: s.display_name });
    setDlvShowDropSg(false); setDlvSuggestDrop([]);
  };

  const bookDelivery = async () => {
    if (!user) { setActiveTab('login'); setError('Please login to book a delivery.'); return; }
    if (!dlvReceiverName || !dlvReceiverPhone) { setError('Please enter receiver name and phone.'); return; }
    setLoading(true); setError('');
    try {
      const res = await axios.post(`${API}/deliveries`, {
        pickup_location: dlvPickup,
        drop_location: dlvDrop,
        pickup_coords: dlvPickupCoords ? { lat: dlvPickupCoords.lat, lng: dlvPickupCoords.lng } : undefined,
        drop_coords: dlvDropCoords ? { lat: dlvDropCoords.lat, lng: dlvDropCoords.lng } : undefined,
        receiver_name: dlvReceiverName,
        receiver_phone: dlvReceiverPhone,
        parcel_type: dlvParcelType,
        parcel_notes: dlvParcelNotes,
        vehicle_type: dlvVehicle,
        distance_km: dlvDistanceKm
      }, authConfig());
      setCurrentDelivery(res.data);
      setSuccessMsg('Delivery requested. Finding a nearby OPS captain...');
      fetchDeliveries();
    } catch (err) { setError(errMsg(err, 'Failed to book delivery')); }
    finally { setLoading(false); }
  };

  const updateDeliveryStatus = async (id, newStatus) => {
    try {
      const res = await axios.put(`${API}/deliveries/${id}/status`, { status: newStatus }, authConfig());
      setCurrentDelivery(res.data);
      fetchDeliveries();
      setSuccessMsg(`Delivery: ${newStatus}`);
    } catch (err) { setError(errMsg(err, 'Failed to update delivery')); }
  };

  const pushCaptainTracking = async (rideId, lat, lng, speed) => {
    try {
      await axios.put(`${API}/rides/${rideId}/tracking`, { lat, lng, speed_kmh: speed }, authConfig());
    } catch (e) { /* silent */ }
  };
  const pushDeliveryTracking = async (deliveryId, lat, lng, speed) => {
    try {
      await axios.put(`${API}/deliveries/${deliveryId}/tracking`, { lat, lng, speed_kmh: speed }, authConfig());
    } catch (e) { /* silent */ }
  };

  const toggleGps = () => {
    if (gpsActive) {
      if (gpsWatchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      }
      gpsWatchIdRef.current = null;
      gpsLastRef.current = null;
      setGpsActive(false);
      return;
    }
    if (!navigator.geolocation) { setError('Geolocation not supported on this device.'); return; }
    const id = navigator.geolocation.watchPosition((pos) => {
      const { latitude, longitude, speed } = pos.coords;
      let kmh = 0;
      if (typeof speed === 'number' && !isNaN(speed) && speed >= 0) {
        kmh = speed * 3.6;
      } else if (gpsLastRef.current) {
        const { lat: pLat, lng: pLng, t: pT } = gpsLastRef.current;
        const R = 6371;
        const toRad = (v) => (v * Math.PI) / 180;
        const dLat = toRad(latitude - pLat), dLng = toRad(longitude - pLng);
        const a = Math.sin(dLat/2)**2 + Math.cos(toRad(pLat)) * Math.cos(toRad(latitude)) * Math.sin(dLng/2)**2;
        const distKm = 2 * R * Math.asin(Math.sqrt(a));
        const dt = (Date.now() - pT) / 1000;
        if (dt > 0.5) kmh = (distKm / dt) * 3600;
      }
      gpsLastRef.current = { lat: latitude, lng: longitude, t: Date.now() };
      setCaptainSpeed(Math.min(150, Math.max(0, Math.round(kmh))));
    }, (err) => {
      setError('GPS error: ' + err.message);
      setGpsActive(false);
    }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
    gpsWatchIdRef.current = id;
    setGpsActive(true);
  };

  const raiseSos = async () => {
    if (!currentRide) return;
    try {
      const pos = gpsLastRef.current;
      await axios.post(`${API}/rides/${currentRide.id}/sos`, {
        lat: pos?.lat, lng: pos?.lng, note: 'Emergency raised from app'
      }, authConfig());
      setSuccessMsg('SOS sent. Our team has been notified. Stay safe.');
    } catch (err) { setError(errMsg(err, 'SOS failed')); }
  };

  // Upload delivery photo proof (captain side)
  const uploadDeliveryProof = async (deliveryId, file) => {
    if (!file) return;
    if (file.size > 2_000_000) { setError('Photo too large (max 2 MB).'); return; }
    setUploadingProof(true); setError('');
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result;
        setProofPreview(dataUrl);
        try {
          await axios.post(`${API}/deliveries/${deliveryId}/proof`, {
            image_base64: dataUrl, note: 'Handover photo'
          }, authConfig());
          setSuccessMsg('Drop-off photo uploaded.');
          fetchDeliveries();
        } catch (err) { setError(errMsg(err, 'Proof upload failed')); }
        finally { setUploadingProof(false); }
      };
      reader.readAsDataURL(file);
    } catch (err) { setError('Could not read photo'); setUploadingProof(false); }
  };

  // Copy referral link
  const copyReferral = async () => {
    if (!user?.referral_code) return;
    const link = `${window.location.origin}/?ref=${user.referral_code}`;
    try {
      await navigator.clipboard.writeText(link);
      setSuccessMsg('Referral link copied. Share and earn 50 OPS coins each!');
    } catch { setError('Could not copy link. Long-press to copy manually.'); }
  };

  // Capture referral code from URL on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && !localStorage.getItem('ops_ref')) {
      localStorage.setItem('ops_ref', ref);
    }
  }, []);

  // Force browser tab title to always show OPS (override any external overlay)
  useEffect(() => {
    const forceTitle = () => { document.title = 'OPS – On Time Providing Services'; };
    forceTitle();
    const iv = setInterval(forceTitle, 1500);
    return () => clearInterval(iv);
  }, []);

  // Vehicle animation: interpolate between latest known captain_location and next segment on route
  useEffect(() => {
    if (!currentRide?.captain_location) { setAnimatedVehiclePos(null); return; }
    const target = currentRide.captain_location;
    const start = animTargetRef.current || target;
    animTargetRef.current = target;
    let raf;
    const startT = performance.now();
    const dur = 3500;
    const tick = (now) => {
      const t = Math.min(1, (now - startT) / dur);
      const lat = start.lat + (target.lat - start.lat) * t;
      const lng = start.lng + (target.lng - start.lng) * t;
      setAnimatedVehiclePos({ lat, lng });
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [currentRide?.captain_location?.lat, currentRide?.captain_location?.lng]);

  // Captain-side auto-broadcast simulated speed & poll rider view
  useEffect(() => {
    if (!user || user.role !== 'driver' || !currentRide) return;
    if (!['Accepted', 'Driver Arriving', 'Ride Started'].includes(currentRide.status)) return;
    const iv = setInterval(() => {
      const pc = currentRide.pickup_coords || pickupCoords;
      const dc = currentRide.destination_coords || destCoords;
      if (!pc || !dc) return;
      const t = Math.random();
      const lat = pc.lat + (dc.lat - pc.lat) * t;
      const lng = pc.lng + (dc.lng - pc.lng) * t;
      pushCaptainTracking(currentRide.id, lat, lng, captainSpeed);
    }, 4000);
    return () => clearInterval(iv);
  }, [user, currentRide, captainSpeed]);

  // Rider-side poll current ride to receive captain's speed + status changes
  useEffect(() => {
    if (!user || user.role !== 'user' || !currentRide) return;
    if (!['Requested', 'Accepted', 'Driver Arriving', 'Ride Started'].includes(currentRide.status)) return;
    const iv = setInterval(async () => {
      try {
        const res = await axios.get(`${API}/rides/${currentRide.id}`, authConfig());
        setCurrentRide(res.data);
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(iv);
  }, [user, currentRide?.id, currentRide?.status]);

  // Driver-side poll incoming requests every 3s so new Requested rides appear
  useEffect(() => {
    if (!user || user.role !== 'driver') return;
    const iv = setInterval(() => { fetchRides(); }, 3000);
    return () => clearInterval(iv);
    // eslint-disable-next-line
  }, [user?.id, user?.role]);

  // /login route sync
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    if (activeTab === 'login' && window.location.pathname !== '/login') {
      window.history.pushState({}, '', '/login');
    } else if (activeTab !== 'login' && window.location.pathname === '/login') {
      window.history.pushState({}, '', '/');
    }
  }, [activeTab]);

  useEffect(() => {
    const onPop = () => {
      if (window.location.pathname === '/login') setActiveTab('login');
      else if (activeTab === 'login') setActiveTab('home');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line
  }, []);

  const scrollToBooking = () => {
    setActiveTab('home');
    setTimeout(() => bookingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const ridePresets = [
    { type: 'Bike', icon: Bike, tagline: 'Fastest through traffic', base: 15, perKm: 4.5, tint: 'from-blue-500 to-blue-700' },
    { type: 'Auto', icon: Navigation, tagline: 'Roomy short-hops', base: 25, perKm: 6.5, tint: 'from-sky-500 to-blue-600' },
    { type: 'Car', icon: Car, tagline: 'Full AC comfort', base: 45, perKm: 9.5, tint: 'from-indigo-500 to-blue-700' }
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased selection:bg-blue-600 selection:text-white">
      {/* --- HEADER --- */}
      <header className="sticky top-0 z-[1000] bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <button onClick={() => setActiveTab('home')} data-testid="ops-logo-btn" className="flex items-center space-x-2.5">
              <div className="relative h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/30">
                <Navigation className="h-5 w-5 text-white" />
                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-emerald-500 rounded-full ring-2 ring-white" />
              </div>
              <div className="text-left">
                <p className="text-lg font-black tracking-tight text-slate-900 leading-none">OPS</p>
                <p className="text-[9px] text-blue-600 font-bold uppercase tracking-widest leading-none mt-0.5">On Time Providing Services</p>
              </div>
            </button>

            <nav className="hidden md:flex items-center space-x-6 text-sm font-semibold text-slate-700">
              <button onClick={() => setActiveTab('home')} data-testid="nav-home-btn"
                className={`transition hover:text-blue-600 ${activeTab === 'home' ? 'text-blue-600' : ''}`}>Ride</button>
              <button onClick={() => setActiveTab('rentals')} data-testid="nav-rentals-btn"
                className={`transition hover:text-blue-600 ${activeTab === 'rentals' ? 'text-blue-600' : ''}`}>Rentals</button>
              <button onClick={() => setActiveTab('delivery')} data-testid="nav-delivery-btn"
                className={`transition hover:text-blue-600 ${activeTab === 'delivery' ? 'text-blue-600' : ''}`}>Delivery</button>
              <button onClick={() => setActiveTab('safety')} data-testid="nav-safety-btn"
                className={`transition hover:text-blue-600 ${activeTab === 'safety' ? 'text-blue-600' : ''}`}>Safety</button>
              <button onClick={() => setActiveTab('how')} data-testid="nav-how-btn"
                className={`transition hover:text-blue-600 ${activeTab === 'how' ? 'text-blue-600' : ''}`}>How it works</button>
              {user && (
                <button onClick={() => setActiveTab('my_rides')} data-testid="nav-my-rides-btn"
                  className={`transition hover:text-blue-600 ${activeTab === 'my_rides' ? 'text-blue-600' : ''}`}>My Rides</button>
              )}
              {user?.role === 'driver' && (
                <button onClick={() => setActiveTab('driver_dashboard')} data-testid="nav-driver-dashboard-btn"
                  className={`transition hover:text-blue-600 ${activeTab === 'driver_dashboard' ? 'text-blue-600' : ''}`}>Captain</button>
              )}
              {user?.role === 'admin' && (
                <button onClick={() => setActiveTab('admin_panel')} data-testid="nav-admin-panel-btn"
                  className={`transition hover:text-blue-600 ${activeTab === 'admin_panel' ? 'text-blue-600' : ''}`}>Admin</button>
              )}
            </nav>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3">
            {currentRide && (
              <button onClick={() => setActiveTab('home')} data-testid="live-tracker-btn"
                className="hidden sm:flex items-center space-x-2 bg-emerald-50 text-emerald-700 border border-emerald-200 pl-2 pr-3 py-1.5 rounded-full text-xs font-bold">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                </span>
                <span>LIVE • {currentRide.status}</span>
              </button>
            )}
            <button className="hidden sm:flex p-2 text-slate-600 hover:text-blue-600 transition" data-testid="notification-btn" title="Notifications">
              <Bell className="h-5 w-5" />
            </button>
            {user ? (
              <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 pl-1 pr-3 py-1 rounded-full">
                <div className="h-8 w-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm">
                  {user.name.charAt(0)}
                </div>
                <div className="hidden sm:block text-left leading-tight">
                  <p className="text-xs font-bold text-slate-900">{user.name.split(' ')[0]}</p>
                  <p className="text-[10px] text-blue-600 capitalize font-semibold">{user.role}</p>
                </div>
                <button onClick={logout} data-testid="logout-btn" className="p-1.5 text-slate-500 hover:text-red-500 ml-1" title="Logout">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <button onClick={() => { setAuthMode('login'); setActiveTab('login'); }} data-testid="login-nav-btn"
                  className="hidden sm:block text-sm font-semibold text-slate-700 hover:text-blue-600 px-3 py-2">
                  Log In
                </button>
                <button onClick={() => { setAuthMode('signup'); setActiveTab('login'); }} data-testid="signup-nav-btn"
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 sm:px-5 py-2.5 rounded-full shadow-md shadow-blue-500/30 transition">
                  Sign Up
                </button>
              </>
            )}
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 text-slate-700" data-testid="mobile-menu-btn">
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1">
            {[
              { k: 'home', l: 'Ride' }, { k: 'rentals', l: 'Rentals' }, { k: 'delivery', l: 'Delivery' }, { k: 'safety', l: 'Safety' }, { k: 'how', l: 'How it works' },
              ...(user ? [{ k: 'my_rides', l: 'My Rides' }] : []),
              ...(user?.role === 'driver' ? [{ k: 'driver_dashboard', l: 'Captain' }] : []),
              ...(user?.role === 'admin' ? [{ k: 'admin_panel', l: 'Admin' }] : [])
            ].map(item => (
              <button key={item.k} data-testid={`mobile-nav-${item.k.replace('_', '-')}-btn`} onClick={() => { setActiveTab(item.k); setMobileMenuOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold ${activeTab === item.k ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}>
                {item.l}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Global notifications */}
      {successMsg && (
        <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-800 px-4 py-2.5 text-center text-sm flex items-center justify-center space-x-2" data-testid="success-banner">
          <CheckCircle className="h-4 w-4" /><span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="ml-3 text-xs underline">Dismiss</button>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 px-4 py-2.5 text-center text-sm flex items-center justify-center space-x-2" data-testid="error-banner">
          <AlertTriangle className="h-4 w-4" /><span>{error}</span>
          <button onClick={() => setError('')} className="ml-3 text-xs underline">Dismiss</button>
        </div>
      )}
      {weather.is_hazardous && user && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 px-4 py-2.5 text-center text-sm flex items-center justify-center space-x-2" data-testid="weather-alert-banner">
          <CloudRain className="h-4 w-4" />
          <span><b>Safety alert:</b> {weather.advisory}</span>
        </div>
      )}

      {/* --- HOME --- */}
      {activeTab === 'home' && (
        <main>
          {/* HERO */}
          <section className="relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 right-0 h-96 w-96 bg-blue-100 rounded-full blur-3xl opacity-60 -translate-y-1/3 translate-x-1/4"></div>
              <div className="absolute bottom-0 left-0 h-72 w-72 bg-sky-100 rounded-full blur-3xl opacity-70 translate-y-1/3"></div>
            </div>
            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20 grid lg:grid-cols-2 gap-10 items-center">
              <div className="space-y-6">
                <div className="inline-flex items-center space-x-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">On Time Providing Services</span>
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 leading-[1.05]">
                  Book rides. <br />
                  <span className="text-blue-600">Fare locked.</span><br />
                  Weather-safe.
                </h1>
                <p className="text-slate-600 text-base sm:text-lg max-w-xl leading-relaxed">
                  OPS delivers reliable Bike, Auto & Car rides at fixed cash fares. Rain, storm or shine — the price you see is the price you pay.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button onClick={scrollToBooking} data-testid="hero-book-ride-btn"
                    className="group inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3.5 rounded-full shadow-lg shadow-blue-500/30 transition">
                    <span>Book a ride</span>
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                  <button onClick={() => { setAuthMode('signup'); setAuthRole('driver'); setActiveTab('login'); }} data-testid="hero-drive-btn"
                    className="inline-flex items-center space-x-2 bg-white border-2 border-slate-900 hover:bg-slate-900 hover:text-white text-slate-900 font-bold px-6 py-3.5 rounded-full transition">
                    <span>Drive with OPS</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-xs font-semibold text-slate-600">
                  <div className="flex items-center space-x-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span>No surge pricing</span></div>
                  <div className="flex items-center space-x-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span>Verified captains</span></div>
                  <div className="flex items-center space-x-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span>Cash on arrival</span></div>
                </div>
              </div>

              {/* Right-side visual: Ride hero image with overlay cards */}
              <div className="relative">
                <div className="relative rounded-[2rem] overflow-hidden shadow-2xl shadow-blue-500/30 aspect-[4/3] bg-gradient-to-br from-blue-600 to-indigo-700">
                  {/* Hero ride photo */}
                  <img
                    src="/ops-hero.jpg"
                    alt="OPS ride captain on the road"
                    data-testid="hero-ride-image"
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-blue-900/70 via-blue-900/20 to-transparent"></div>

                  {/* Floating captain card */}
                  <div className="absolute top-6 left-6 right-6 bg-white/95 backdrop-blur rounded-2xl p-4 shadow-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="h-10 w-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-black">R</div>
                        <div className="leading-tight">
                          <p className="text-sm font-bold text-slate-900">Ramesh · Bike Captain</p>
                          <div className="flex items-center space-x-1 mt-0.5">
                            <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                            <span className="text-[11px] font-bold text-slate-600">4.9</span>
                            <span className="text-[10px] text-slate-500">· DL 01 AB 1234</span>
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">3 mins away</span>
                    </div>
                  </div>

                  {/* Ride-type chips */}
                  <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 flex justify-center gap-3">
                    {[
                      { type: 'Bike', icon: Bike, speed: '45 km/h' },
                      { type: 'Auto', icon: Navigation, speed: '35 km/h' },
                      { type: 'Car', icon: Car, speed: '55 km/h' }
                    ].map((v) => {
                      const Icon = v.icon;
                      return (
                        <div key={v.type} data-testid={`hero-ride-chip-${v.type.toLowerCase()}`}
                          className="bg-white/95 backdrop-blur rounded-2xl px-3 py-2 flex items-center space-x-2 shadow-lg">
                          <div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                            <Icon className="h-4 w-4" />
                          </div>
                          <span className="text-xs font-black text-slate-900">{v.type} · {v.speed}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Fare-lock chip */}
                  <div className="absolute bottom-6 left-6 right-6 bg-white/95 backdrop-blur rounded-2xl p-4 flex items-center justify-between shadow-xl">
                    <div className="flex items-center space-x-3">
                      <div className="h-10 w-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div className="leading-tight">
                        <p className="text-[11px] font-bold text-slate-500 uppercase">Fare locked</p>
                        <p className="text-lg font-black text-slate-900">₹{estimatedFare} · {distanceKm} km</p>
                      </div>
                    </div>
                    <div className="text-right leading-tight">
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Weather</p>
                      <p className="text-sm font-black text-blue-600 flex items-center justify-end space-x-1">
                        {weather.condition === 'Rain' ? <CloudRain className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                        <span>{Math.round(weather.temp)}°C</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* BOOKING SECTION */}
          <section ref={bookingRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid lg:grid-cols-5 gap-8">
            <div className="lg:col-span-3 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/60">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">PICK YOUR RIDE</p>
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">Three ways to move.</h2>
                </div>
                {currentRide && (
                  <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full uppercase">Active Ride</span>
                )}
              </div>

              <div className="space-y-4">
                {/* Pickup */}
                <div className="relative">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pickup</label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-3.5 h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-emerald-100"></span>
                    <input type="text" value={pickup}
                      onChange={(e) => { setPickup(e.target.value); setShowPickupSuggest(true); }}
                      onFocus={() => setShowPickupSuggest(true)}
                      onBlur={() => setTimeout(() => setShowPickupSuggest(false), 200)}
                      data-testid="pickup-input"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-9 pr-28 py-3.5 text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition"
                      placeholder="Enter pickup" />
                    <button type="button" onClick={useMyLocation} data-testid="locate-me-btn"
                      className="absolute right-2 top-2 flex items-center space-x-1 text-[10px] font-black bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2.5 py-2 rounded-xl transition">
                      <Crosshair className="h-3 w-3" /><span>LOCATE</span>
                    </button>
                    {geocodingWhich === 'pickup' && <Loader2 className="absolute right-24 top-4 h-4 w-4 text-blue-600 animate-spin" />}
                  </div>
                  {showPickupSuggest && pickupSuggestions.length > 0 && (
                    <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto" data-testid="pickup-suggestions">
                      {pickupSuggestions.map((s, i) => (
                        <button key={i} type="button" onMouseDown={() => selectPickupSuggestion(s)} data-testid={`pickup-suggestion-${i}`}
                          className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs text-slate-700 border-b border-slate-100 last:border-b-0 flex items-start space-x-2">
                          <MapPin className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{s.display_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Destination */}
                <div className="relative">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Destination</label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-3.5 h-3 w-3 rounded-sm bg-red-500 ring-4 ring-red-100"></span>
                    <input type="text" value={destination}
                      onChange={(e) => { setDestination(e.target.value); setShowDestSuggest(true); }}
                      onFocus={() => setShowDestSuggest(true)}
                      onBlur={() => setTimeout(() => setShowDestSuggest(false), 200)}
                      data-testid="destination-input"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-9 pr-4 py-3.5 text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition"
                      placeholder="Where to?" />
                    {geocodingWhich === 'dest' && <Loader2 className="absolute right-4 top-4 h-4 w-4 text-blue-600 animate-spin" />}
                  </div>
                  {showDestSuggest && destSuggestions.length > 0 && (
                    <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto" data-testid="dest-suggestions">
                      {destSuggestions.map((s, i) => (
                        <button key={i} type="button" onMouseDown={() => selectDestSuggestion(s)} data-testid={`dest-suggestion-${i}`}
                          className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs text-slate-700 border-b border-slate-100 last:border-b-0 flex items-start space-x-2">
                          <MapPin className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{s.display_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Vehicle cards */}
                <div className="pt-3">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Select category</p>
                  <div className="grid grid-cols-3 gap-3">
                    {ridePresets.map((v) => {
                      const Icon = v.icon; const isSelected = vehicleType === v.type;
                          const fare = fareOptions[v.type] || Math.round(v.base + distanceKm * v.perKm);
                      return (
                        <button key={v.type} type="button" onClick={() => setVehicleType(v.type)}
                          data-testid={`vehicle-option-${v.type.toLowerCase()}`}
                          className={`text-left p-4 rounded-2xl border-2 transition-all ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/30 -translate-y-0.5'
                              : 'bg-white border-slate-200 text-slate-900 hover:border-blue-300 hover:bg-blue-50/40'
                          }`}>
                          <div className={`h-9 w-9 rounded-xl flex items-center justify-center mb-2 ${isSelected ? 'bg-white/20' : `bg-gradient-to-br ${v.tint} text-white`}`}>
                            <Icon className={`h-5 w-5 ${isSelected ? 'text-white' : 'text-white'}`} />
                          </div>
                          <p className={`text-sm font-black ${isSelected ? 'text-white' : 'text-slate-900'}`}>{v.type}</p>
                          <p className={`text-[10px] font-semibold ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>{v.tagline}</p>
                          <p className={`text-base font-black mt-2 ${isSelected ? 'text-white' : 'text-blue-600'}`}>₹{fare}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Fare card */}
                <div className="bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-200 rounded-2xl p-4 space-y-2 mt-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 font-semibold">Distance</span>
                    <span className="font-black text-slate-900">{distanceKm} km {routeDurationMin > 0 && <span className="text-xs text-slate-500 font-semibold">· {routeDurationMin} min</span>}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-semibold">Total (Cash)</span>
                    <span className="text-2xl font-black text-blue-700" data-testid="total-fare-value">₹{fareOptions[vehicleType] || estimatedFare}</span>
                  </div>
                  <div className="flex items-start space-x-2 pt-1 border-t border-blue-200/70">
                    <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-slate-700 font-semibold">
                      <b className="text-blue-700">Fare Locked</b> – Weather will not affect your price.
                    </p>
                  </div>
                </div>

                <button onClick={bookRide} disabled={loading} data-testid="book-ride-submit-btn"
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-500/30 transition flex items-center justify-center space-x-2 text-base">
                  <span>{loading ? 'Booking...' : `Book ${vehicleType} · ₹${fareOptions[vehicleType] || estimatedFare}`}</span>
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* RIGHT: MAP OR ACTIVE RIDE */}
            <div className="lg:col-span-2 space-y-6">
              {currentRide ? (
                <div className="bg-white border border-blue-200 rounded-3xl p-6 shadow-xl shadow-blue-100">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">LIVE RIDE</p>
                      <h3 className="text-xl font-black text-slate-900 mt-0.5">{currentRide.status}</h3>
                    </div>
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                  </div>

                  {/* Progress */}
                  <div className="grid grid-cols-4 gap-1 mb-4">
                    {['Requested', 'Accepted', 'Driver Arriving', 'Ride Started'].map((step) => {
                      const statuses = ['Requested', 'Accepted', 'Driver Arriving', 'Ride Started', 'Ride Completed'];
                      const isDone = statuses.indexOf(currentRide.status) >= statuses.indexOf(step);
                      return (
                        <div key={step} className="text-center">
                          <div className={`h-1.5 rounded-full mb-1 ${isDone ? 'bg-blue-600' : 'bg-slate-200'}`} />
                          <span className={`text-[9px] font-bold ${isDone ? 'text-blue-700' : 'text-slate-400'}`}>{step}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Map */}
                  <div className="h-56 rounded-2xl overflow-hidden border border-slate-200 mb-4" data-testid="active-ride-map">
                    <MapView
                      pickup={currentRide.pickup_coords ? { lat: currentRide.pickup_coords.lat, lng: currentRide.pickup_coords.lng, label: currentRide.pickup_location } : pickupCoords}
                      destination={currentRide.destination_coords ? { lat: currentRide.destination_coords.lat, lng: currentRide.destination_coords.lng, label: currentRide.destination_location } : destCoords}
                      routeCoords={routeCoords}
                      vehiclePos={animatedVehiclePos || (currentRide.captain_location ? { lat: currentRide.captain_location.lat, lng: currentRide.captain_location.lng } : null)} />
                  </div>

                  {/* Captain live speed on map */}
                  {['Accepted', 'Driver Arriving', 'Ride Started'].includes(currentRide.status) && (
                    <div className="bg-slate-900 text-white rounded-2xl p-3 flex items-center justify-between mb-4" data-testid="captain-speed-panel">
                      <div className="flex items-center space-x-2">
                        <Zap className="h-4 w-4 text-emerald-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Captain Speed</span>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black text-emerald-400 leading-none" data-testid="captain-speed-value">
                          {currentRide.captain_speed_kmh ?? 0}
                          <span className="text-xs text-slate-400 font-bold ml-1">km/h</span>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Driver info */}
                  {currentRide.driver_name ? (
                    <div className="bg-slate-50 rounded-2xl p-3 flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="h-11 w-11 rounded-full bg-blue-600 text-white flex items-center justify-center font-black">
                          {currentRide.driver_name.charAt(0)}
                        </div>
                        <div className="leading-tight">
                          <p className="text-sm font-bold text-slate-900" data-testid="assigned-driver-name">{currentRide.driver_name}</p>
                          <p className="text-[11px] text-slate-500" data-testid="assigned-vehicle-number">{currentRide.vehicle_type} · {currentRide.vehicle_number}</p>
                          <p className="text-[11px] font-bold text-amber-600 flex items-center space-x-1 mt-0.5" data-testid="live-driver-rating">
                            <Star className="h-3 w-3 fill-amber-500 text-amber-500" /><span>{currentRide.driver_rating || 4.9}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <a href={`tel:${currentRide.driver_phone}`} data-testid="call-driver-btn"
                          className="bg-emerald-500 hover:bg-emerald-600 text-white p-2.5 rounded-xl shadow-md">
                          <Phone className="h-4 w-4" />
                        </a>
                        <button onClick={raiseSos} data-testid="sos-btn"
                          className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-xl shadow-md text-xs font-black tracking-widest">
                          SOS
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50 rounded-2xl p-4 text-center text-sm text-slate-500 animate-pulse mb-4">
                      Finding nearby OPS captain…
                    </div>
                  )}

                  {currentRide.dispatch_count > 0 && (
                    <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3 mb-4" data-testid="multi-driver-dispatch-panel">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black text-sky-700 uppercase tracking-widest">Multi-driver dispatch</p>
                        <span className="text-[10px] font-bold text-sky-700">{currentRide.dispatch_count} captains notified</span>
                      </div>
                      <p className="text-xs text-slate-700 mt-1">{currentRide.driver_name || 'Nearest captain'} accepted first — {currentRide.vehicle_number || 'vehicle details coming shortly'}.</p>
                    </div>
                  )}

                  {/* Fare summary */}
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 mb-4">
                    <div>
                      <p className="text-[10px] font-black text-blue-700 uppercase">Cash</p>
                      <p className="text-xl font-black text-slate-900">₹{currentRide.fare}</p>
                    </div>
                    <p className="text-[11px] text-blue-700 font-bold text-right">Fare Locked ✓</p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    {user?.role === 'driver' && currentRide.status === 'Requested' && (
                      <button onClick={() => updateRideStatus(currentRide.id, 'Accepted')} data-testid="driver-accept-ride-btn"
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-2xl">Accept Ride</button>
                    )}
                    {user?.role === 'driver' && currentRide.status === 'Accepted' && (
                      <button onClick={() => updateRideStatus(currentRide.id, 'Driver Arriving')} data-testid="driver-arriving-btn"
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-2xl">On the way</button>
                    )}
                    {user?.role === 'driver' && currentRide.status === 'Driver Arriving' && (
                      <button onClick={() => updateRideStatus(currentRide.id, 'Ride Started')} data-testid="driver-start-ride-btn"
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl">Start Ride</button>
                    )}
                    {user?.role === 'driver' && currentRide.status === 'Ride Started' && (
                      <button onClick={() => updateRideStatus(currentRide.id, 'Ride Completed')} data-testid="driver-complete-ride-btn"
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-2xl">Complete & Collect Cash</button>
                    )}
                    {currentRide.status === 'Ride Completed' && !currentRide.feedback && (
                      <button onClick={() => { setFeedbackRideId(currentRide.id); setFeedbackModalOpen(true); }} data-testid="open-feedback-modal-btn"
                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-2xl flex items-center justify-center space-x-2">
                        <Star className="h-4 w-4" /><span>Rate ride</span>
                      </button>
                    )}
                    {user?.role === 'user' && ['Requested', 'Accepted', 'Driver Arriving', 'Ride Started'].includes(currentRide.status) && (
                      <button onClick={() => setCancellationModalOpen(true)} data-testid="cancel-ride-btn"
                        className="w-full border border-red-200 text-red-600 hover:bg-red-50 font-bold py-2.5 rounded-2xl text-sm">Cancel ride & recalculate fair fare</button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xl shadow-slate-200/60 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">LIVE ROUTE</p>
                      <h3 className="text-lg font-black text-slate-900">Preview</h3>
                    </div>
                    {routeDurationMin > 0 && (
                      <span className="text-xs font-black text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">{routeDurationMin} min · {distanceKm} km</span>
                    )}
                  </div>
                  <div className="h-64 rounded-2xl overflow-hidden border border-slate-200" data-testid="home-map-panel">
                    <MapView pickup={pickupCoords} destination={destCoords} routeCoords={routeCoords} />
                  </div>
                  <div className="bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-200 rounded-2xl p-3 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {weather.condition === 'Rain' ? <CloudRain className="h-5 w-5 text-cyan-600" /> : <Sun className="h-5 w-5 text-amber-500" />}
                      <div className="leading-tight">
                        <p className="text-xs font-black text-slate-900">{weather.condition} · {Math.round(weather.temp)}°C</p>
                        <p className="text-[10px] text-slate-600">Wind {weather.wind_speed} m/s</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-black bg-white text-blue-700 border border-blue-200 px-2 py-1 rounded-full">Live Weather</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* SAFETY SECTION */}
          <section className="bg-slate-50 border-y border-slate-200 py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center max-w-2xl mx-auto mb-12">
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">SAFETY FIRST</p>
                <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mt-2">Weather alerts, not price hikes.</h2>
                <p className="text-slate-600 mt-3">Storm, drizzle or heatwave — you get advisories, never surcharges.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {[
                  { icon: ShieldCheck, title: 'Fare Locked', text: 'Fixed at booking, immutable through the trip.', color: 'bg-blue-600' },
                  { icon: CloudRain, title: 'Weather Alerts', text: 'Rain, storm & wind advisories to captain & rider.', color: 'bg-sky-500' },
                  { icon: CreditCard, title: 'Cash Payment', text: 'No wallets. Pay driver after safe arrival.', color: 'bg-indigo-600' },
                  { icon: Wind, title: 'Live Weather', text: 'Real OpenWeatherMap data along your route.', color: 'bg-cyan-500' }
                ].map((f, i) => {
                  const Icon = f.icon;
                  return (
                    <div key={i} className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-xl hover:-translate-y-1 transition-all" data-testid={`safety-card-${i}`}>
                      <div className={`h-11 w-11 rounded-xl ${f.color} text-white flex items-center justify-center mb-4`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <h4 className="font-black text-slate-900">{f.title}</h4>
                      <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{f.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* CTA SECTION */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <div className="relative bg-blue-600 rounded-[2rem] p-10 sm:p-14 overflow-hidden text-white">
              <div className="absolute -top-24 -right-24 h-72 w-72 bg-blue-500 rounded-full opacity-40"></div>
              <div className="absolute -bottom-32 -left-16 h-96 w-96 bg-indigo-600 rounded-full opacity-30"></div>
              <div className="relative grid lg:grid-cols-2 gap-8 items-center">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-blue-100">Ready when you are.</p>
                  <h2 className="text-3xl sm:text-4xl font-black mt-2 leading-tight">Join thousands who move on-time with OPS.</h2>
                  <p className="text-blue-100 mt-3 max-w-lg">Sign up in 30 seconds. Book a ride or start earning as an OPS Captain.</p>
                </div>
                <div className="flex flex-wrap gap-3 lg:justify-end">
                  <button onClick={() => { setAuthMode('signup'); setAuthRole('user'); setActiveTab('login'); }} data-testid="cta-signup-rider-btn"
                    className="bg-white text-blue-700 font-black px-6 py-3.5 rounded-full shadow-xl hover:bg-slate-100 transition">
                    Sign up as rider
                  </button>
                  <button onClick={() => { setAuthMode('signup'); setAuthRole('driver'); setActiveTab('login'); }} data-testid="cta-signup-driver-btn"
                    className="bg-slate-900 hover:bg-black text-white font-black px-6 py-3.5 rounded-full shadow-xl transition">
                    Become a driver
                  </button>
                </div>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* --- RENTALS --- */}
      {activeTab === 'rentals' && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">HOURLY RENTALS</p>
            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 mt-2">Rent a Bike, Auto or Car by the hour.</h1>
            <p className="text-slate-600 mt-3">Multiple stops? Errands? Book verified OPS captains at flat cash rates.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { type: 'Bike', icon: Bike, gradient: 'from-blue-500 to-blue-700',
                packages: [{ name: '2 Hours / 20 KM', price: 99 }, { name: '4 Hours / 40 KM', price: 189 }, { name: '8 Hours / 80 KM', price: 349 }] },
              { type: 'Auto', icon: Navigation, gradient: 'from-sky-500 to-blue-600',
                packages: [{ name: '2 Hours / 20 KM', price: 149 }, { name: '4 Hours / 40 KM', price: 289 }, { name: '8 Hours / 80 KM', price: 549 }] },
              { type: 'Car', icon: Car, gradient: 'from-indigo-500 to-blue-700',
                packages: [{ name: '2 Hours / 20 KM', price: 249 }, { name: '4 Hours / 40 KM', price: 479 }, { name: '8 Hours / 80 KM', price: 899 }] }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.type} className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-lg shadow-slate-200/60 hover:-translate-y-1 hover:shadow-2xl transition-all">
                  <div className={`bg-gradient-to-br ${item.gradient} p-6 text-white flex items-center justify-between`}>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/80">Rental</p>
                      <h3 className="text-2xl font-black">{item.type}</h3>
                    </div>
                    <Icon className="h-10 w-10" />
                  </div>
                  <div className="p-5 space-y-3">
                    {item.packages.map((pkg) => (
                      <div key={pkg.name} className="border border-slate-200 hover:border-blue-300 rounded-2xl p-4 flex items-center justify-between transition-colors">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{pkg.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">Cash on completion</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-blue-700">₹{pkg.price}</p>
                          <button onClick={() => bookRental({ vehicleType: item.type, ...pkg })}
                            data-testid={`book-rental-${item.type.toLowerCase()}-${pkg.price}`}
                            className="mt-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-1.5 rounded-full transition">
                            Book
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      )}

      {/* --- DELIVERY --- */}
      {activeTab === 'delivery' && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-8">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">SEND PARCELS</p>
            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 mt-2">On-time OPS Delivery.</h1>
            <p className="text-slate-600 mt-3">Documents, food or small packages — flat cash fare, live tracking, verified captains.</p>
          </div>

          <div className="grid lg:grid-cols-5 gap-8">
            <div className="lg:col-span-3 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/60 space-y-4">
              <h2 className="text-xl font-black text-slate-900">Book a delivery</h2>

              {/* Pickup */}
              <div className="relative">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pickup</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-3.5 h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-emerald-100"></span>
                  <input type="text" value={dlvPickup}
                    onChange={(e) => { setDlvPickup(e.target.value); setDlvShowPickupSg(true); }}
                    onFocus={() => setDlvShowPickupSg(true)}
                    onBlur={() => setTimeout(() => setDlvShowPickupSg(false), 200)}
                    data-testid="delivery-pickup-input"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-9 pr-4 py-3.5 text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                </div>
                {dlvShowPickupSg && dlvSuggestPickup.length > 0 && (
                  <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
                    {dlvSuggestPickup.map((s, i) => (
                      <button key={i} type="button" onMouseDown={() => selectDlvPickup(s)}
                        data-testid={`delivery-pickup-suggestion-${i}`}
                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs text-slate-700 border-b border-slate-100 last:border-b-0 flex items-start space-x-2">
                        <MapPin className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{s.display_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Drop */}
              <div className="relative">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Drop</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-3.5 h-3 w-3 rounded-sm bg-red-500 ring-4 ring-red-100"></span>
                  <input type="text" value={dlvDrop}
                    onChange={(e) => { setDlvDrop(e.target.value); setDlvShowDropSg(true); }}
                    onFocus={() => setDlvShowDropSg(true)}
                    onBlur={() => setTimeout(() => setDlvShowDropSg(false), 200)}
                    data-testid="delivery-drop-input"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-9 pr-4 py-3.5 text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                </div>
                {dlvShowDropSg && dlvSuggestDrop.length > 0 && (
                  <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
                    {dlvSuggestDrop.map((s, i) => (
                      <button key={i} type="button" onMouseDown={() => selectDlvDrop(s)}
                        data-testid={`delivery-drop-suggestion-${i}`}
                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-xs text-slate-700 border-b border-slate-100 last:border-b-0 flex items-start space-x-2">
                        <MapPin className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                        <span>{s.display_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Parcel + vehicle */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Parcel type</label>
                  <select value={dlvParcelType} onChange={(e) => setDlvParcelType(e.target.value)}
                    data-testid="delivery-parcel-select"
                    className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500">
                    <option>Documents</option>
                    <option>Food</option>
                    <option>Small</option>
                    <option>Medium</option>
                    <option>Large</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Vehicle</label>
                  <select value={dlvVehicle} onChange={(e) => setDlvVehicle(e.target.value)}
                    data-testid="delivery-vehicle-select"
                    className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500">
                    <option>Bike</option>
                    <option>Auto</option>
                    <option>Car</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Receiver name</label>
                  <input type="text" value={dlvReceiverName} onChange={(e) => setDlvReceiverName(e.target.value)}
                    data-testid="delivery-receiver-name"
                    className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Receiver phone</label>
                  <input type="text" value={dlvReceiverPhone} onChange={(e) => setDlvReceiverPhone(e.target.value)}
                    data-testid="delivery-receiver-phone"
                    className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Notes (optional)</label>
                <input type="text" value={dlvParcelNotes} onChange={(e) => setDlvParcelNotes(e.target.value)}
                  data-testid="delivery-notes"
                  placeholder="Handle with care…"
                  className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500" />
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-200 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-xs font-semibold">Distance {dlvDistanceKm} km</p>
                  <p className="text-[10px] text-slate-500">{dlvVehicle} delivery · cash on drop</p>
                </div>
                <p className="text-2xl font-black text-blue-700" data-testid="delivery-fare-estimate">₹{dlvEstimateFare}</p>
              </div>

              <button onClick={bookDelivery} disabled={loading} data-testid="book-delivery-btn"
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-500/30 transition flex items-center justify-center space-x-2">
                <span>{loading ? 'Booking...' : `Book delivery · ₹${dlvEstimateFare}`}</span>
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>

            {/* Live delivery panel or map preview */}
            <div className="lg:col-span-2 space-y-6">
              {currentDelivery ? (
                <div className="bg-white border border-blue-200 rounded-3xl p-6 shadow-xl shadow-blue-100" data-testid="active-delivery-panel">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">LIVE DELIVERY</p>
                      <h3 className="text-xl font-black text-slate-900 mt-0.5">{currentDelivery.status}</h3>
                    </div>
                    <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full uppercase">{currentDelivery.vehicle_type}</span>
                  </div>

                  <div className="h-48 rounded-2xl overflow-hidden border border-slate-200 mb-3">
                    <MapView
                      pickup={currentDelivery.pickup_coords ? { lat: currentDelivery.pickup_coords.lat, lng: currentDelivery.pickup_coords.lng, label: currentDelivery.pickup_location } : dlvPickupCoords}
                      destination={currentDelivery.drop_coords ? { lat: currentDelivery.drop_coords.lat, lng: currentDelivery.drop_coords.lng, label: currentDelivery.drop_location } : dlvDropCoords}
                      routeCoords={dlvRouteCoords}
                      vehiclePos={currentDelivery.captain_location ? { lat: currentDelivery.captain_location.lat, lng: currentDelivery.captain_location.lng } : null} />
                  </div>

                  {['Accepted', 'Picking Up', 'In Transit'].includes(currentDelivery.status) && (
                    <div className="bg-slate-900 text-white rounded-2xl p-3 flex items-center justify-between mb-3" data-testid="delivery-speed-panel">
                      <div className="flex items-center space-x-2">
                        <Zap className="h-4 w-4 text-emerald-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Captain Speed</span>
                      </div>
                      <p className="text-2xl font-black text-emerald-400 leading-none" data-testid="delivery-speed-value">
                        {currentDelivery.captain_speed_kmh ?? 0}<span className="text-xs text-slate-400 font-bold ml-1">km/h</span>
                      </p>
                    </div>
                  )}

                  <div className="bg-slate-50 rounded-2xl p-3 space-y-1 text-sm">
                    <p className="text-xs text-slate-600">To: <b>{currentDelivery.receiver_name}</b> · {currentDelivery.receiver_phone}</p>
                    <p className="text-xs text-slate-600">Parcel: {currentDelivery.parcel_type}{currentDelivery.parcel_notes ? ` · ${currentDelivery.parcel_notes}` : ''}</p>
                    <p className="text-xs text-slate-600">Fare: <b className="text-blue-700">₹{currentDelivery.fare}</b> · Cash on drop</p>
                  </div>

                  {user?.role === 'driver' && (
                    <div className="flex gap-2 flex-wrap mt-3">
                      {currentDelivery.status === 'Requested' && (
                        <button onClick={() => updateDeliveryStatus(currentDelivery.id, 'Accepted')}
                          data-testid="captain-accept-delivery-btn"
                          className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-2xl">Accept</button>
                      )}
                      {currentDelivery.status === 'Accepted' && (
                        <button onClick={() => updateDeliveryStatus(currentDelivery.id, 'Picking Up')}
                          data-testid="captain-picking-delivery-btn"
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-2xl">Picking up</button>
                      )}
                      {currentDelivery.status === 'Picking Up' && (
                        <button onClick={() => updateDeliveryStatus(currentDelivery.id, 'In Transit')}
                          data-testid="captain-transit-delivery-btn"
                          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl">In transit</button>
                      )}
                      {currentDelivery.status === 'In Transit' && (
                        <button onClick={() => updateDeliveryStatus(currentDelivery.id, 'Delivered')}
                          data-testid="captain-delivered-btn"
                          className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-2xl">Mark Delivered · Collect ₹{currentDelivery.fare}</button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xl shadow-slate-200/60 space-y-4">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">DELIVERY PREVIEW</p>
                  <div className="h-56 rounded-2xl overflow-hidden border border-slate-200" data-testid="delivery-preview-map">
                    <MapView pickup={dlvPickupCoords} destination={dlvDropCoords} routeCoords={dlvRouteCoords} />
                  </div>
                  <p className="text-xs text-slate-500">Fill in receiver details and hit book. Cash is collected on drop-off.</p>
                </div>
              )}
            </div>
          </div>

          {/* Delivery history */}
          {deliveries.length > 0 && (
            <div>
              <h2 className="text-sm font-black text-blue-600 uppercase tracking-widest mb-3">Your deliveries</h2>
              <div className="space-y-3">
                {deliveries.map(d => (
                  <div key={d.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between" data-testid={`delivery-history-${d.id}`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-2 py-1 rounded-full uppercase">{d.vehicle_type}</span>
                        <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase ${d.status === 'Delivered' ? 'bg-emerald-100 text-emerald-700' : d.status === 'Cancelled' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{d.status}</span>
                      </div>
                      <p className="text-sm font-bold text-slate-900 mt-1">📦 {d.pickup_location} → {d.drop_location}</p>
                      <p className="text-xs text-slate-500">{d.parcel_type} · {d.distance_km} km · To {d.receiver_name}</p>
                    </div>
                    <p className="text-xl font-black text-blue-700">₹{d.fare}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      )}

      {/* --- SAFETY EXPLAINER --- */}
      {activeTab === 'safety' && (
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-8">
          <div className="text-center">
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">OPS SAFETY</p>
            <h1 className="text-4xl font-black text-slate-900 mt-2">Weather alerts, not price hikes.</h1>
            <p className="text-slate-600 mt-3 max-w-2xl mx-auto">Every OPS ride is protected by a fare-lock guarantee and real-time weather advisories from OpenWeatherMap. Storms don't cost you extra — they only make our captains drive more carefully.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { icon: ShieldCheck, title: 'Immutable fare', text: 'Once you tap Book, that fare is written in stone. Rain, traffic, or wind cannot push it up.' },
              { icon: CloudRain, title: 'Live route weather', text: 'We poll OpenWeatherMap along your route and warn both you and your captain of hazardous conditions.' },
              { icon: Phone, title: 'One-tap captain call', text: 'Coordinate pickup instantly by calling your captain from inside the app.' },
              { icon: Star, title: 'Verified captains', text: 'Every OPS captain is background-checked and rated after every trip.' }
            ].map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={i} className="bg-white border border-slate-200 rounded-2xl p-6 flex items-start space-x-4">
                  <div className="h-11 w-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900">{f.title}</h4>
                    <p className="text-sm text-slate-600 mt-1.5">{f.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      )}

      {/* --- HOW IT WORKS --- */}
      {activeTab === 'how' && (
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-8">
          <div className="text-center">
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">HOW IT WORKS</p>
            <h1 className="text-4xl font-black text-slate-900 mt-2">Three taps. Fare locked. You move.</h1>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { n: '01', title: 'Enter your pickup & drop', text: 'Autocomplete finds any Indian address via OpenStreetMap.' },
              { n: '02', title: 'Pick a ride & lock the fare', text: 'Choose Bike, Auto or Car. Fare is fixed the moment you book.' },
              { n: '03', title: 'Meet your captain & pay cash', text: 'Track the driver live. Pay the fixed fare in cash on arrival.' }
            ].map((s, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-2xl p-6">
                <p className="text-4xl font-black text-blue-100">{s.n}</p>
                <h4 className="font-black text-slate-900 mt-2">{s.title}</h4>
                <p className="text-sm text-slate-600 mt-2">{s.text}</p>
              </div>
            ))}
          </div>
        </main>
      )}

      {/* --- MY RIDES --- */}
      {activeTab === 'my_rides' && (
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
          <h1 className="text-3xl font-black text-slate-900">My Rides & Rentals</h1>

          <div className="space-y-4">
            <h2 className="text-sm font-black text-blue-600 uppercase tracking-widest">Ride history</h2>
            {myRides.length === 0 ? (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center text-slate-500">No rides yet.</div>
            ) : (
              myRides.map((ride) => (
                <div key={ride.id} className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full uppercase">{ride.vehicle_type}</span>
                      <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase ${
                        ride.status === 'Ride Completed' ? 'bg-emerald-100 text-emerald-700' :
                        ride.status === 'Cancelled' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      }`}>{ride.status}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-900 mt-1">📍 {ride.pickup_location} → {ride.destination_location}</p>
                    <p className="text-xs text-slate-500">{ride.distance_km} km · {new Date(ride.created_at).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black text-blue-700">₹{ride.fare}</p>
                    <p className="text-[10px] text-slate-500">Cash</p>
                    {ride.status === 'Ride Completed' && !ride.feedback && (
                      <button onClick={() => { setFeedbackRideId(ride.id); setFeedbackModalOpen(true); }}
                        data-testid={`rate-ride-${ride.id}`}
                        className="mt-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black px-3 py-1.5 rounded-full">Rate</button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-black text-blue-600 uppercase tracking-widest">Rental bookings</h2>
            {rentals.length === 0 ? (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center text-slate-500">No rentals booked.</div>
            ) : (
              rentals.map((r) => (
                <div key={r.id} className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full uppercase">{r.vehicle_type} rental</span>
                    <p className="text-sm font-bold text-slate-900 mt-1.5">{r.package_name}</p>
                    <p className="text-xs text-slate-500">Pickup: {r.pickup_location}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black text-blue-700">₹{r.amount}</p>
                    <p className="text-[10px] text-slate-500">Cash</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </main>
      )}

      {/* --- DRIVER DASHBOARD --- */}
      {activeTab === 'driver_dashboard' && (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-3xl p-6 sm:p-8 flex items-center justify-between shadow-xl">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-100">Captain Dashboard</p>
              <h1 className="text-3xl font-black mt-1">Welcome, {user?.name?.split(' ')[0]}!</h1>
              <p className="text-blue-100 mt-1 text-sm">Accept rides. Earn cash. On time, every time.</p>
            </div>
            <span className="hidden sm:inline-flex items-center space-x-2 bg-emerald-500 text-white text-xs font-black px-3 py-1.5 rounded-full">
              <span className="h-2 w-2 rounded-full bg-white"></span><span>ONLINE</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Today's Earnings</p>
              <p className="text-3xl font-black text-blue-700 mt-1">₹{myRides.filter(r => r.status === 'Ride Completed').reduce((s, r) => s + (r.fare || 0), 0) || 1840}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Rating</p>
              <p className="text-3xl font-black text-amber-500 mt-1 flex items-center space-x-1"><Star className="h-6 w-6 fill-amber-500" /><span>{user?.rating || 4.9}</span></p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Completed Today</p>
              <p className="text-3xl font-black text-emerald-600 mt-1">{myRides.filter(r => r.status === 'Ride Completed').length || 7}</p>
            </div>
          </div>

          {/* Captain speedometer control */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5" data-testid="captain-speed-broadcast">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Broadcast Live Speed {gpsActive && <span className="text-emerald-600">· GPS ON</span>}</p>
                <p className="text-xs text-slate-500 mt-0.5">Riders see this in real-time on the map.</p>
              </div>
              <p className="text-3xl font-black text-blue-700" data-testid="captain-current-speed">{captainSpeed}<span className="text-sm text-slate-500 font-bold ml-1">km/h</span></p>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <button onClick={toggleGps} data-testid="captain-gps-toggle-btn"
                className={`text-[10px] font-black px-3 py-1.5 rounded-full border ${gpsActive ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'}`}>
                {gpsActive ? 'Stop GPS' : 'Use my GPS'}
              </button>
              <span className="text-[10px] text-slate-500">or slide manually</span>
            </div>
            <input type="range" min="0" max="80" step="1" value={captainSpeed}
              onChange={(e) => setCaptainSpeed(parseInt(e.target.value, 10))}
              disabled={gpsActive}
              data-testid="captain-speed-slider"
              className="w-full accent-blue-600 disabled:opacity-50" />
            <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-1">
              <span>0</span><span>Bike 45</span><span>Auto 35</span><span>Car 55</span><span>80</span>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-black text-slate-900">Incoming & Active</h2>
            {myRides.length === 0 ? (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center text-slate-500">No ride requests right now.</div>
            ) : (
              myRides.map((ride) => (
                <div key={ride.id} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3" data-testid={`captain-ride-${ride.id}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-900" data-testid={`ride-passenger-${ride.id}`}>Passenger: {ride.user_name}</p>
                      <p className="text-xs text-slate-500">{ride.distance_km} km · <b className="text-slate-700">{ride.vehicle_type}</b>{ride.vehicle_number ? ` · ${ride.vehicle_number}` : ''}</p>
                      {ride.driver_name && (
                        <p className="text-[11px] font-bold text-emerald-700 mt-0.5">Assigned: {ride.driver_name}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-black text-blue-700">₹{ride.fare}</p>
                      <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-2 py-1 rounded-full uppercase">{ride.status}</span>
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-700 space-y-1">
                    <p><MapPin className="h-3.5 w-3.5 inline text-emerald-500" /> <b>Pickup:</b> {ride.pickup_location}</p>
                    <p><MapPin className="h-3.5 w-3.5 inline text-red-500" /> <b>Drop:</b> {ride.destination_location}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {ride.status === 'Requested' && (
                      <button onClick={() => updateRideStatus(ride.id, 'Accepted')} data-testid={`accept-ride-${ride.id}`}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-2xl">Accept Ride</button>
                    )}
                    {ride.status === 'Accepted' && (
                      <button onClick={() => updateRideStatus(ride.id, 'Driver Arriving')} data-testid={`arriving-${ride.id}`}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-2xl">On the way</button>
                    )}
                    {ride.status === 'Driver Arriving' && (
                      <button onClick={() => updateRideStatus(ride.id, 'Ride Started')} data-testid={`start-${ride.id}`}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl">Start Ride</button>
                    )}
                    {ride.status === 'Ride Started' && (
                      <button onClick={() => updateRideStatus(ride.id, 'Ride Completed')} data-testid={`complete-${ride.id}`}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-2xl">Complete · Collect ₹{ride.fare}</button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Rentals for captains */}
          <div className="space-y-4">
            <h2 className="text-lg font-black text-slate-900">Rentals · Incoming & Active</h2>
            {rentals.length === 0 ? (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center text-sm text-slate-500">No rentals waiting.</div>
            ) : (
              rentals.map((r) => (
                <div key={r.id} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3" data-testid={`captain-rental-${r.id}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-900">Customer: {r.user_name}</p>
                      <p className="text-xs text-slate-500">{r.vehicle_type} · {r.package_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-black text-blue-700">₹{r.amount}</p>
                      <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-1 rounded-full uppercase">{r.status}</span>
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-700">
                    <p>📍 <b>Pickup:</b> {r.pickup_location}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {r.status === 'Requested' && (
                      <button onClick={() => updateRentalStatus(r.id, 'Assigned')} data-testid={`rental-assign-${r.id}`}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-2xl">Assign to me</button>
                    )}
                    {r.status === 'Assigned' && (
                      <button onClick={() => updateRentalStatus(r.id, 'In Use')} data-testid={`rental-inuse-${r.id}`}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-2xl">Handover · In Use</button>
                    )}
                    {r.status === 'In Use' && (
                      <button onClick={() => updateRentalStatus(r.id, 'Completed')} data-testid={`rental-complete-${r.id}`}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-2xl">Complete · Collect ₹{r.amount}</button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </main>
      )}

      {/* --- ADMIN PANEL --- */}
      {activeTab === 'admin_panel' && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
          <div>
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Admin Control</p>
            <h1 className="text-3xl font-black text-slate-900 mt-1">OPS Command Center</h1>
          </div>
          {adminStats && (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              {[
                { l: 'Users', v: adminStats.users_count, c: 'text-blue-700' },
                { l: 'Captains', v: adminStats.drivers_count, c: 'text-indigo-700' },
                { l: 'Rides', v: adminStats.rides_count, c: 'text-emerald-600' },
                { l: 'Rentals', v: adminStats.rentals_count, c: 'text-amber-600' },
                { l: 'Deliveries', v: adminStats.deliveries_count || 0, c: 'text-sky-600' },
                { l: 'Revenue', v: `₹${adminStats.total_revenue}`, c: 'text-emerald-700' }
              ].map((s, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{s.l}</p>
                  <p className={`text-2xl font-black ${s.c} mt-1`}>{s.v}</p>
                </div>
              ))}
            </div>
          )}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
            <h2 className="text-lg font-black text-slate-900 mb-4">Users & Captains</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase text-slate-500 border-b border-slate-200">
                  <tr><th className="text-left py-2">Name</th><th className="text-left py-2">Email</th><th className="text-left py-2">Role</th><th className="text-left py-2">Phone</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {adminStats?.users?.map((u) => (
                    <tr key={u.id}>
                      <td className="py-3 font-bold text-slate-900">{u.name}</td>
                      <td className="py-3 text-slate-600">{u.email}</td>
                      <td className="py-3">
                        <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase ${
                          u.role === 'admin' ? 'bg-red-100 text-red-700' :
                          u.role === 'driver' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
                        }`}>{u.role}</span>
                      </td>
                      <td className="py-3 text-slate-600">{u.phone || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}

      {/* --- AUTH --- */}
      {activeTab === 'login' && (
        <main className="max-w-md mx-auto px-4 py-14">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-xl shadow-slate-200/60 space-y-6">
            <div className="text-center">
              <div className="h-12 w-12 rounded-2xl bg-blue-600 mx-auto flex items-center justify-center shadow-md shadow-blue-500/30">
                <Navigation className="h-6 w-6 text-white" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 mt-3">{authMode === 'login' ? 'Welcome back' : 'Create your OPS account'}</h2>
              <p className="text-sm text-slate-500 mt-1">On-time rides, always fare-locked.</p>
            </div>

            {authMode === 'login' && (
              <div className="grid grid-cols-3 gap-2" data-testid="quick-access-panel">
                <button type="button" onClick={() => quickLogin('user')} disabled={loading} data-testid="quick-login-rider-btn"
                  className="bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-black text-xs py-3 rounded-2xl transition disabled:opacity-60 flex flex-col items-center space-y-1">
                  <Navigation className="h-4 w-4" />
                  <span>Rider</span>
                </button>
                <button type="button" onClick={() => quickLogin('driver')} disabled={loading} data-testid="quick-login-captain-btn"
                  className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-black text-xs py-3 rounded-2xl transition disabled:opacity-60 flex flex-col items-center space-y-1">
                  <Bike className="h-4 w-4" />
                  <span>Captain</span>
                </button>
                <button type="button" onClick={() => quickLogin('admin')} disabled={loading} data-testid="quick-login-admin-btn"
                  className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-black text-xs py-3 rounded-2xl transition disabled:opacity-60 flex flex-col items-center space-y-1">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Admin</span>
                </button>
              </div>
            )}

            {authMode === 'login' && (
              <div className="flex items-center space-x-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <span className="flex-1 h-px bg-slate-200"></span>
                <span>or continue with email</span>
                <span className="flex-1 h-px bg-slate-200"></span>
              </div>
            )}

            <form onSubmit={authMode === 'login' ? handleLogin : handleSignup} className="space-y-3">
              {authMode === 'signup' && (
                <>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Full name</label>
                    <input type="text" required value={authName} onChange={(e) => setAuthName(e.target.value)}
                      data-testid="auth-name-input"
                      className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Role</label>
                    <select value={authRole} onChange={(e) => setAuthRole(e.target.value)} data-testid="auth-role-select"
                      className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500">
                      <option value="user">Rider</option>
                      <option value="driver">Captain / Driver</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Phone</label>
                    <input type="text" value={authPhone} onChange={(e) => setAuthPhone(e.target.value)}
                      data-testid="auth-phone-input"
                      className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="+91…" />
                  </div>
                </>
              )}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Email</label>
                <input type="email" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)}
                  data-testid="auth-email-input"
                  className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Password</label>
                <input type="password" required value={authPassword} onChange={(e) => setAuthPassword(e.target.value)}
                  data-testid="auth-password-input"
                  className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              </div>
              <button type="submit" disabled={loading} data-testid="auth-submit-btn"
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-black py-3.5 rounded-2xl shadow-lg shadow-blue-500/30 transition">
                {loading ? 'Please wait…' : authMode === 'login' ? 'Log in' : 'Create account'}
              </button>
            </form>

            <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} data-testid="toggle-auth-mode-btn"
              className="w-full text-xs font-bold text-blue-600 hover:underline">
              {authMode === 'login' ? "New here? Create an account" : "Have an account? Log in"}
            </button>
          </div>
        </main>
      )}

      {/* --- FOOTER --- */}
      <footer className="bg-slate-900 text-slate-300 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2">
            <div className="flex items-center space-x-2.5">
              <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center">
                <Navigation className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-white font-black">OPS</p>
                <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">On-Time Providing Services</p>
              </div>
            </div>
            <p className="text-sm mt-4 max-w-md text-slate-400">Fare-locked rides. Weather-safe alerts. Cash payment. Every trip, on time.</p>
          </div>
          <div>
            <p className="text-[10px] font-black text-white uppercase tracking-widest mb-3">Company</p>
            <ul className="space-y-1.5 text-sm text-slate-400">
              <li><button onClick={() => setActiveTab('safety')} className="hover:text-blue-400">Safety</button></li>
              <li><button onClick={() => setActiveTab('how')} className="hover:text-blue-400">How it works</button></li>
              <li><button onClick={() => setActiveTab('rentals')} className="hover:text-blue-400">Rentals</button></li>
            </ul>
          </div>
          <div>
            <p className="text-[10px] font-black text-white uppercase tracking-widest mb-3">Join OPS</p>
            <ul className="space-y-1.5 text-sm text-slate-400">
              <li><button onClick={() => { setAuthMode('signup'); setAuthRole('user'); setActiveTab('login'); }} className="hover:text-blue-400">Sign up as rider</button></li>
              <li><button onClick={() => { setAuthMode('signup'); setAuthRole('driver'); setActiveTab('login'); }} className="hover:text-blue-400">Drive with OPS</button></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-800 py-4 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} OPS · On-Time Providing Services · All rights reserved.
        </div>
      </footer>

      {/* --- SMART CANCELLATION MODAL --- */}
      {cancellationModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4" data-testid="cancel-ride-modal">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">SMART CANCELLATION</p>
                <h3 className="text-xl font-black text-slate-900 mt-1">Why are you cancelling?</h3>
              </div>
              <button onClick={() => setCancellationModalOpen(false)} data-testid="close-cancel-modal-btn" className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">We will verify live weather and charge only for travelled distance.</p>
            <div className="space-y-2">
              {[
                ['weather', 'Heavy rain / storm', '🌧️'],
                ['breakdown', 'Vehicle damage / breakdown', '🏍️'],
                ['behaviour', 'Inappropriate behaviour', '⚠️'],
                ['safety', 'Safety issue', '🚫'],
                ['route', 'Wrong pickup / destination', '📍'],
                ['other', 'Other reason', '✍️']
              ].map(([value, label, icon]) => (
                <label key={value} className={`flex items-center gap-3 border rounded-2xl px-3 py-2.5 text-sm cursor-pointer ${cancelReason === value ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-700'}`}>
                  <input type="radio" name="cancelReason" value={value} checked={cancelReason === value} onChange={() => setCancelReason(value)} data-testid={`cancel-reason-${value}`} />
                  <span>{icon}</span><span className="font-semibold">{label}</span>
                </label>
              ))}
            </div>
            {cancelReason === 'other' && <textarea rows="2" value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} data-testid="cancel-note-input" className="mt-3 w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-sm text-slate-900" placeholder="Tell us what happened" />}
            <div className="flex gap-2 mt-5">
              <button onClick={() => setCancellationModalOpen(false)} data-testid="keep-ride-btn" className="flex-1 border border-slate-200 text-slate-700 font-bold py-3 rounded-2xl">Keep ride</button>
              <button onClick={cancelRide} disabled={loading} data-testid="confirm-cancel-btn" className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold py-3 rounded-2xl">{loading ? 'Checking weather…' : 'Cancel & recalculate'}</button>
            </div>
          </div>
        </div>
      )}

      {/* --- FEEDBACK MODAL --- */}
      {feedbackModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-black text-slate-900">Rate your ride</h3>
              <button onClick={() => setFeedbackModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitFeedback} className="space-y-4">
              <div className="flex justify-center gap-2">
                {[1,2,3,4,5].map((n) => (
                  <button key={n} type="button" onClick={() => setRating(n)} data-testid={`rating-star-${n}`} className="p-1">
                    <Star className={`h-9 w-9 ${rating >= n ? 'text-amber-500 fill-amber-500' : 'text-slate-300'}`} />
                  </button>
                ))}
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Comment</label>
                <textarea rows="3" value={comment} onChange={(e) => setComment(e.target.value)} data-testid="feedback-comment-input"
                  className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  placeholder="Great ride, super on-time!" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Report issue (optional)</label>
                <input type="text" value={issueReport} onChange={(e) => setIssueReport(e.target.value)} data-testid="feedback-issue-input"
                  className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  placeholder="Anything unsafe?" />
              </div>
              <button type="submit" data-testid="submit-feedback-btn"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-2xl">Submit feedback</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
