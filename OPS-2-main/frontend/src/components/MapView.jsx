import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon paths (webpack strips them out)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom pickup icon (emerald)
const pickupIcon = L.divIcon({
  className: 'ops-pickup-marker',
  html: `<div style="background:#10b981;width:22px;height:22px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 3px rgba(16,185,129,0.35),0 2px 6px rgba(0,0,0,0.4);"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

// Custom destination icon (red/pink)
const destIcon = L.divIcon({
  className: 'ops-dest-marker',
  html: `<div style="background:#ef4444;width:22px;height:22px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 3px rgba(239,68,68,0.35),0 2px 6px rgba(0,0,0,0.4);"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

// Vehicle-in-motion icon (subtle, no halo)
const vehicleIcon = L.divIcon({
  className: 'ops-vehicle-marker',
  html: `<div style="background:#2563eb;width:20px;height:20px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    const valid = points.filter(p => p && typeof p.lat === 'number' && typeof p.lng === 'number');
    if (valid.length === 0) return;
    try {
      if (!map || !map._container?.isConnected) return;
      if (valid.length === 1) map.setView([valid[0].lat, valid[0].lng], 14, { animate: false });
      else map.fitBounds(L.latLngBounds(valid.map(p => [p.lat, p.lng])), { padding: [40, 40], animate: false });
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') console.warn('Map update skipped during teardown', error);
    }
  }, [points, map]);
  return null;
}

export default function MapView({ pickup, destination, routeCoords = [], vehiclePos = null, height = '100%' }) {
  const center = pickup && pickup.lat ? [pickup.lat, pickup.lng] : [28.6139, 77.2090];

  return (
    <div style={{ height, width: '100%', borderRadius: '1rem', overflow: 'hidden', position: 'relative' }} data-testid="leaflet-map-container">
      <MapContainer
        center={center}
        zoom={12}
        scrollWheelZoom={true}
        zoomControl={true}
        style={{ height: '100%', width: '100%', background: '#0f172a' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {pickup && pickup.lat && (
          <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon}>
            <Popup>Pickup: {pickup.label || 'Start'}</Popup>
          </Marker>
        )}
        {destination && destination.lat && (
          <Marker position={[destination.lat, destination.lng]} icon={destIcon}>
            <Popup>Destination: {destination.label || 'End'}</Popup>
          </Marker>
        )}
        {vehiclePos && vehiclePos.lat && (
          <Marker position={[vehiclePos.lat, vehiclePos.lng]} icon={vehicleIcon}>
            <Popup>OPS Captain en route</Popup>
          </Marker>
        )}
        {routeCoords && routeCoords.length > 1 && (
          <Polyline
            positions={routeCoords}
            pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.85 }}
          />
        )}
        <FitBounds points={[pickup, destination, vehiclePos].filter(Boolean)} />
      </MapContainer>
      <div
        data-testid="openstreetmap-attribution"
        style={{ position: 'absolute', zIndex: 500, right: 4, bottom: 2, background: 'rgba(255,255,255,.88)', color: '#334155', padding: '2px 5px', fontSize: 10, lineHeight: '14px', borderRadius: 2, pointerEvents: 'none' }}
      >
        © OpenStreetMap contributors
      </div>
    </div>
  );
}
