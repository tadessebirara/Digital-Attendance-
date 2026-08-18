/**
 * LiveEmployeeMap
 * Shows real-time employee locations on a Leaflet map.
 * - Loads initial snapshot from GET /admin/live-locations
 * - Updates in real-time via socket.io location:update events
 * - Green dot = inside office radius, Red dot = outside
 * - Office geofence circles shown as teal rings
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Circle, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Wifi, WifiOff, Users } from 'lucide-react';
import apiClient from '../api/client';
import { useSocket } from '../hooks/useSocket';

// Fix Leaflet default icon broken by Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Colored dot icon factory
function dotIcon(color: string, size = 14) {
  return L.divIcon({
    className: '',
    iconSize:  [size, size],
    iconAnchor:[size / 2, size / 2],
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:2.5px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,.35);
    "></div>`,
  });
}

interface OfficeConfig {
  id: number;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
}

interface LiveEmployee {
  userId:    number;
  name:      string | null;
  latitude:  number;
  longitude: number;
  accuracy:  number | null;
  timestamp: string;
  online:    boolean;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isInsideAnyOffice(emp: LiveEmployee, offices: OfficeConfig[]) {
  if (!offices.length) return true; // no geofence configured → assume ok
  return offices.some(o => {
    const d = haversine(emp.latitude, emp.longitude, o.lat, o.lng);
    const comp = Math.min(emp.accuracy ?? 0, o.radiusM / 2);
    return Math.max(0, d - comp) <= o.radiusM;
  });
}

// Auto-fit map to show all markers
function FitBounds({ employees, offices }: { employees: LiveEmployee[]; offices: OfficeConfig[] }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current) return;
    const pts: [number, number][] = [
      ...employees.map(e => [e.latitude, e.longitude] as [number, number]),
      ...offices.map(o => [o.lat, o.lng] as [number, number]),
    ];
    if (pts.length === 0) return;
    try {
      map.fitBounds(L.latLngBounds(pts).pad(0.3));
      fitted.current = true;
    } catch { /* ignore */ }
  }, [employees, offices, map]);

  return null;
}

interface Props {
  offices: OfficeConfig[];
}

export function LiveEmployeeMap({ offices }: Props) {
  const [employees, setEmployees] = useState<Map<number, LiveEmployee>>(new Map());
  const [connected, setConnected] = useState(false);
  const { on, off, socket } = useSocket();

  // Load initial snapshot
  useEffect(() => {
    apiClient.get('/admin/live-locations')
      .then(res => {
        const list: LiveEmployee[] = (res.data as any)?.data ?? [];
        setEmployees(new Map(list.map(e => [e.userId, e])));
      })
      .catch(() => {/* silent — socket will fill in */});
  }, []);

  // Socket connection status
  useEffect(() => {
    if (!socket) return;
    const onConn = () => setConnected(true);
    const onDisc = () => setConnected(false);
    setConnected(socket.connected);
    socket.on('connect',    onConn);
    socket.on('disconnect', onDisc);
    return () => { socket.off('connect', onConn); socket.off('disconnect', onDisc); };
  }, [socket]);

  // Live location updates
  const handleUpdate = useCallback((payload: unknown) => {
    const data = (payload as any)?.data as LiveEmployee | undefined;
    if (!data?.userId) return;
    setEmployees(prev => {
      const next = new Map(prev);
      if (data.online === false) {
        next.delete(data.userId);
      } else {
        next.set(data.userId, data);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    on('location:update', handleUpdate);
    return () => off('location:update', handleUpdate);
  }, [on, off, handleUpdate]);

  const empList = Array.from(employees.values());
  const insideCount  = empList.filter(e => isInsideAnyOffice(e, offices)).length;
  const outsideCount = empList.length - insideCount;

  // Default center: Addis Ababa
  const center: [number, number] = offices.length > 0
    ? [offices[0].lat, offices[0].lng]
    : [9.005, 38.763];

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5 font-semibold text-gray-700 dark:text-gray-300">
            <Users size={14} /> {empList.length} online
          </span>
          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            {insideCount} inside
          </span>
          {outsideCount > 0 && (
            <span className="flex items-center gap-1.5 text-red-500 dark:text-red-400 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
              {outsideCount} outside
            </span>
          )}
        </div>
        <span className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full ${
          connected
            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
        }`}>
          {connected ? <Wifi size={11} /> : <WifiOff size={11} />}
          {connected ? 'Live' : 'Connecting…'}
        </span>
      </div>

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700" style={{ height: 420 }}>
        <MapContainer center={center} zoom={15} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          {/* Office geofence rings */}
          {offices.map(o => (
            <Circle key={o.id} center={[o.lat, o.lng]} radius={o.radiusM}
              pathOptions={{ color: '#0d9488', fillColor: '#0d9488', fillOpacity: 0.08, weight: 2 }}>
              <Popup><strong>{o.name}</strong><br />Radius: {o.radiusM}m</Popup>
            </Circle>
          ))}

          {/* Employee dots */}
          {empList.map(emp => {
            const inside = isInsideAnyOffice(emp, offices);
            const color  = inside ? '#22c55e' : '#ef4444';
            const age    = Math.round((Date.now() - new Date(emp.timestamp).getTime()) / 1000);
            return (
              <Marker key={emp.userId} position={[emp.latitude, emp.longitude]} icon={dotIcon(color)}>
                <Popup>
                  <div style={{ minWidth: 140 }}>
                    <p style={{ fontWeight: 700, marginBottom: 4 }}>
                      {emp.name ?? `Employee #${emp.userId}`}
                    </p>
                    <p style={{ fontSize: 12, color: inside ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                      {inside ? '✓ Inside office' : '✗ Outside office'}
                    </p>
                    {emp.accuracy != null && (
                      <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                        GPS ±{Math.round(emp.accuracy)}m
                      </p>
                    )}
                    <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                      Updated {age < 60 ? `${age}s ago` : `${Math.round(age/60)}m ago`}
                    </p>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          <FitBounds employees={empList} offices={offices} />
        </MapContainer>
      </div>

      {/* Empty state */}
      {empList.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-gray-400 dark:text-gray-500">
          <MapPin size={32} className="mb-2 opacity-40" />
          <p className="text-sm font-medium">No employees online yet</p>
          <p className="text-xs mt-1">Locations appear here as employees use the app</p>
        </div>
      )}
    </div>
  );
}
