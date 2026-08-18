import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle, Building2, CheckCircle, Crosshair, Edit2, MapPin,
  Plus, Trash2, Users, X, Radar, Search, Loader2,
} from "lucide-react";
import { useGeolocation } from "../../hooks/useGeolocation";
import { LocationAccuracyIndicator } from "../../components/location/LocationAccuracyIndicator";
import {
  MapContainer, TileLayer, Marker, Circle,
  useMap, useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import apiClient from "../../api/client";
import { ConfirmModal, useConfirm } from "../../components/common";

// Fix Leaflet default marker icons broken by Vite bundling
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// -- Types ---------------------------------------------------------------------
interface Office {
  id: number;
  name: string;
  latitude: string | number;
  longitude: string | number;
  radius_meters: number;
  is_active: boolean;
  employee_count: number | string;
}

interface OfficeForm {
  name: string;
  latitude: string;
  longitude: string;
  radius_meters: number;
  gps_accuracy_warn_m: number;
  gps_accuracy_max_m: number;
}

const FORM_EMPTY: OfficeForm = { name: "", latitude: "", longitude: "", radius_meters: 200, gps_accuracy_warn_m: 50, gps_accuracy_max_m: 100 };
// Default center: Addis Ababa, Ethiopia
const DEFAULT_CENTER: [number, number] = [9.005, 38.763];

const inputCls =
  `w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition
   focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10
   dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100`;

// -- Map helpers ---------------------------------------------------------------
function MapController({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const prev = useRef({ lat, lng });
  useEffect(() => {
    if (lat !== prev.current.lat || lng !== prev.current.lng) {
      prev.current = { lat, lng };
      if (lat !== 0 || lng !== 0) {
        map.setView([lat, lng], 16, { animate: true });
      }
    }
  }, [lat, lng, map]);
  // Invalidate size so map fills the container correctly after dialog opens
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100);
  }, [map]);
  return null;
}

function MapClickHandler({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPick(+e.latlng.lat.toFixed(7), +e.latlng.lng.toFixed(7));
    },
  });
  return null;
}

// -- Main page -----------------------------------------------------------------
export const OfficeManagement = () => {
  const [offices, setOffices]     = useState<Office[]>([]);
  const [loading, setLoading]     = useState(true);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);
  const [dialogOffice, setDialog] = useState<Office | null | "new">(null);
  const [deleting, setDeleting]   = useState<number | null>(null);
  const { confirmProps, confirm } = useConfirm();

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/offices");
      if (res.data.success) setOffices(res.data.data as Office[]);
    } catch {
      showToast("Failed to load offices", false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number) => {
    const ok = await confirm({ title: 'Deactivate Office', message: 'Employees assigned to this office will be unlinked. This action cannot be undone.', confirmLabel: 'Deactivate', variant: 'warning' });
    if (!ok) return;
    setDeleting(id);
    try {
      await apiClient.delete(`/offices/${id}`);
      showToast("Office deactivated", true);
      load();
    } catch {
      showToast("Failed to deactivate office", false);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <ConfirmModal {...confirmProps} />
      {/* Header */}
      <div className="rounded-[28px] border border-stone-200 bg-gradient-to-br from-stone-50 via-white to-blue-50 p-6 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-stone-500 dark:bg-slate-900 dark:text-slate-400">
              <MapPin size={12} />
              Geofencing
            </div>
            <h1 className="text-3xl font-black tracking-tight text-stone-900 dark:text-white">
              Office Locations
            </h1>
            <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
              Add branches and set GPS radius. Employees must be inside a location to check in or out.
            </p>
          </div>
          <button
            onClick={() => setDialog("new")}
            className="inline-flex items-center gap-2 rounded-2xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 dark:bg-blue-700 dark:hover:bg-blue-600"
          >
            <Plus size={16} />
            Add Office
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium ${
          toast.ok
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
            : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
        }`}>
          {toast.ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Office cards */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      ) : offices.length === 0 ? (
        <EmptyState onAdd={() => setDialog("new")} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {offices.map((o) => (
            <OfficeCard
              key={o.id}
              office={o}
              onEdit={() => setDialog(o)}
              onDelete={() => handleDelete(o.id)}
              deleting={deleting === o.id}
            />
          ))}
        </div>
      )}

      {/* Map overview — shows all offices */}
      {offices.length > 0 && (
        <div className="rounded-[28px] border border-stone-200 bg-white overflow-hidden shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="px-6 py-4 border-b border-stone-100 dark:border-slate-800">
            <h2 className="font-bold text-stone-900 dark:text-white text-base">All Locations Map</h2>
            <p className="text-xs text-stone-500 mt-0.5">Green circles show allowed check-in zones</p>
          </div>
          <div className="h-96">
            <OverviewMap offices={offices} />
          </div>
        </div>
      )}

      {/* Add / Edit dialog */}
      {dialogOffice !== null && (
        <OfficeDialog
          initial={dialogOffice === "new" ? null : dialogOffice}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); load(); showToast(dialogOffice === "new" ? "Office added" : "Office updated", true); }}
          onError={(msg) => showToast(msg, false)}
        />
      )}
    </div>
  );
};

// -- Overview map --------------------------------------------------------------
function OverviewMap({ offices }: { offices: Office[] }) {
  const valid = offices.filter(o => parseFloat(String(o.latitude)) !== 0 || parseFloat(String(o.longitude)) !== 0);
  const first = valid[0];
  const center: [number, number] = first
    ? [parseFloat(String(first.latitude)), parseFloat(String(first.longitude))]
    : DEFAULT_CENTER;

  return (
    <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      {valid.map((o) => {
        const lat = parseFloat(String(o.latitude));
        const lng = parseFloat(String(o.longitude));
        return (
          <div key={o.id}>
            <Marker position={[lat, lng]} />
            <Circle
              center={[lat, lng]}
              radius={o.radius_meters}
              pathOptions={{ color: "#0d9488", fillColor: "#0d9488", fillOpacity: 0.12, weight: 2 }}
            />
          </div>
        );
      })}
    </MapContainer>
  );
}

// -- Office card ---------------------------------------------------------------
function OfficeCard({
  office, onEdit, onDelete, deleting,
}: {
  office: Office;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const lat = parseFloat(String(office.latitude));
  const lng = parseFloat(String(office.longitude));

  return (
    <div className="rounded-[20px] border border-stone-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-950">
      {/* Name + actions */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-900/30">
            <Building2 size={18} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="font-bold text-stone-900 dark:text-white text-sm leading-tight">{office.name}</p>
            <p className="text-xs text-stone-500 dark:text-slate-400 mt-0.5">
              <Users size={11} className="inline mr-1" />
              {office.employee_count ?? 0} employee{Number(office.employee_count) === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="p-2 rounded-xl text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
            title="Edit"
          >
            <Edit2 size={15} />
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="p-2 rounded-xl text-stone-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400 transition disabled:opacity-40"
            title="Deactivate"
          >
            {deleting
              ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rose-500 border-t-transparent" />
              : <Trash2 size={15} />
            }
          </button>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-2 text-stone-600 dark:text-slate-400">
          <MapPin size={12} className="text-blue-500 shrink-0" />
          <span className="font-mono">{lat.toFixed(6)}, {lng.toFixed(6)}</span>
        </div>
        <div className="flex items-center gap-2 text-stone-600 dark:text-slate-400">
          <Radar size={12} className="text-blue-500 shrink-0" />
          <span>{office.radius_meters} m radius</span>
        </div>
      </div>

      {/* Mini map */}
      {(lat !== 0 || lng !== 0) && (
        <div className="mt-4 h-28 rounded-xl overflow-hidden border border-stone-100 dark:border-slate-800" style={{ isolation: "isolate" }}>
          <MapContainer
            center={[lat, lng]}
            zoom={15}
            zoomControl={false}
            scrollWheelZoom={false}
            dragging={false}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={[lat, lng]} />
            <Circle
              center={[lat, lng]}
              radius={office.radius_meters}
              pathOptions={{ color: "#0d9488", fillColor: "#0d9488", fillOpacity: 0.15, weight: 2 }}
            />
          </MapContainer>
        </div>
      )}
    </div>
  );
}

// -- Add / Edit dialog ---------------------------------------------------------
function OfficeDialog({
  initial, onClose, onSaved, onError,
}: {
  initial: Office | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [form, setForm] = useState<OfficeForm>(() =>
    initial
      ? {
          name: initial.name,
          latitude: String(initial.latitude),
          longitude: String(initial.longitude),
          radius_meters: initial.radius_meters,
          gps_accuracy_warn_m: (initial as any).gps_accuracy_warn_m ?? 50,
          gps_accuracy_max_m:  (initial as any).gps_accuracy_max_m  ?? 100,
        }
      : { ...FORM_EMPTY }
  );
  const [saving, setSaving]             = useState(false);
  const [searching, setSearching]       = useState(false);
  const [searchQuery, setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState<{ display_name: string; lat: string; lon: string }[]>([]);
  const [searchError, setSearchError]   = useState<string | null>(null);
  const searchDebounce                  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [errors, setErrors]             = useState<Partial<OfficeForm>>({});

  // -- Enterprise geolocation hook -------------------------------------------
  const geo = useGeolocation();

  // Whenever the hook delivers an improved bestFix, update the form coordinates
  // and smoothly pan the map (MapController watches lat/lng).
  useEffect(() => {
    if (geo.bestFix) {
      setForm(f => ({
        ...f,
        latitude:  geo.bestFix!.latitude.toFixed(7),
        longitude: geo.bestFix!.longitude.toFixed(7),
      }));
    }
  }, [geo.bestFix]);

  useEffect(() => () => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    // geo hook cleans itself up via its own useEffect
  }, []);

  const lat = parseFloat(form.latitude) || 0;
  const lng = parseFloat(form.longitude) || 0;
  const hasCoords = lat !== 0 || lng !== 0;
  const center: [number, number] = hasCoords ? [lat, lng] : DEFAULT_CENTER;

  const validate = (): boolean => {
    const e: Partial<OfficeForm> = {};
    if (!form.name.trim()) e.name = "Name is required";
    const la = parseFloat(form.latitude);
    if (isNaN(la) || la < -90 || la > 90) e.latitude = "Invalid latitude (-90 to 90)";
    const lo = parseFloat(form.longitude);
    if (isNaN(lo) || lo < -180 || lo > 180) e.longitude = "Invalid longitude (-180 to 180)";
    if (form.radius_meters < 1 || form.radius_meters > 50000) e.radius_meters = 1 as never;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // -- Place search via Nominatim (OpenStreetMap — free, no API key) ----------
  const handleSearch = (q: string) => {
    setSearchQuery(q);
    setSearchError(null);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchDebounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=0`,
          { headers: { "Accept-Language": "en", "User-Agent": "AlyahSmartAttendance/1.0" } }
        );
        const data = await res.json() as { display_name: string; lat: string; lon: string }[];
        setSearchResults(data);
        if (data.length === 0) setSearchError("No places found. Try a different name.");
      } catch {
        setSearchError("Search failed. Check your internet connection.");
      } finally {
        setSearching(false);
      }
    }, 500);
  };

  const pickResult = (r: { display_name: string; lat: string; lon: string }) => {
    setForm(f => ({ ...f, latitude: (+r.lat).toFixed(7), longitude: (+r.lon).toFixed(7) }));
    setSearchQuery("");
    setSearchResults([]);
  };

  // -- Use my location — delegates to the enterprise hook --------------------
  const handleGetGps = () => geo.start();

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const body = {
        name:                form.name.trim(),
        latitude:            parseFloat(form.latitude),
        longitude:           parseFloat(form.longitude),
        radius_meters:       form.radius_meters,
        gps_accuracy_warn_m: form.gps_accuracy_warn_m,
        gps_accuracy_max_m:  form.gps_accuracy_max_m,
      };
      if (initial) {
        await apiClient.put(`/offices/${initial.id}`, body);
      } else {
        await apiClient.post("/offices", body);
      }
      onSaved();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Save failed";
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      style={{ zIndex: 9999 }}
      onClick={handleBackdrop}
    >
      <div
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-[28px] border border-stone-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950"
        style={{ zIndex: 10000, position: "relative" }}
      >
        {/* Dialog header */}
        <div className="flex items-center justify-between p-6 border-b border-stone-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-900/30">
              <Building2 size={18} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="font-black text-stone-900 dark:text-white text-lg">
                {initial ? "Edit Office" : "Add New Office"}
              </h2>
              <p className="text-xs text-stone-500 dark:text-slate-400">Click the map to pin the location, or type coordinates</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-slate-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Office name */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-slate-400">
              Office Name *
            </label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Main Branch, Addis Ababa HQ"
              className={`${inputCls} ${errors.name ? "border-rose-400" : ""}`}
            />
            {errors.name && <p className="mt-1 text-xs text-rose-500">{errors.name}</p>}
          </div>

          {/* Interactive map */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-slate-400">
              Map — click to drop pin
            </label>
            <div className="h-56 rounded-2xl overflow-hidden border border-stone-200 dark:border-slate-700">
              <MapContainer
                center={center}
                zoom={hasCoords ? 15 : 6}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                <MapController lat={lat} lng={lng} />
                <MapClickHandler
                  onPick={(la, lo) => setForm(f => ({ ...f, latitude: String(la), longitude: String(lo) }))}
                />
                {hasCoords && (
                  <>
                    <Marker position={[lat, lng]} />
                    <Circle
                      center={[lat, lng]}
                      radius={form.radius_meters}
                      pathOptions={{ color: "#0d9488", fillColor: "#0d9488", fillOpacity: 0.15, weight: 2 }}
                    />
                  </>
                )}
              </MapContainer>
            </div>
          </div>

          {/* -- Place search -- */}
          <div className="relative">
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-slate-400">
                Search for a place
              </label>
              <button
                type="button"
                onClick={handleGetGps}
                disabled={geo.phase === "locating" || geo.phase === "improving"}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60 disabled:cursor-not-allowed transition dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-400"
              >
                {(geo.phase === "locating" || geo.phase === "improving")
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Crosshair size={12} />}
                {geo.phase === "locating"
                  ? "Locating…"
                  : geo.phase === "improving"
                    ? `±${Math.round(geo.bestFix?.accuracy ?? 0)} m — improving…`
                    : "Use my location"}
              </button>
            </div>
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
              <input
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Type a place name, e.g. Bahir Dar, Addis Ababa…"
                className={`${inputCls} pl-9 pr-10`}
              />
              {searching && (
                <Loader2 size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-blue-500" />
              )}
            </div>
            <p className="mt-1 text-xs text-stone-400">Search moves the map pin to the exact location. You can also click directly on the map.</p>

            {/* GPS live status — enterprise indicator */}
            {geo.phase !== "idle" && (
              <LocationAccuracyIndicator {...geo} onCancel={geo.cancel} />
            )}

            {/* Results dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-2xl border border-stone-200 bg-white shadow-xl overflow-hidden dark:border-slate-700 dark:bg-slate-900">
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pickResult(r)}
                    className="flex w-full items-start gap-2.5 px-4 py-3 text-left text-xs hover:bg-blue-50 dark:hover:bg-blue-950/30 transition border-b last:border-0 border-stone-100 dark:border-slate-800"
                  >
                    <MapPin size={12} className="mt-0.5 shrink-0 text-blue-500" />
                    <span className="text-stone-700 dark:text-slate-300 leading-snug">{r.display_name}</span>
                  </button>
                ))}
              </div>
            )}
            {searchError && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertCircle size={12} /> {searchError}
              </p>
            )}
          </div>

          {/* Lat / Lng */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-slate-400">
                Latitude *
              </label>
              <input
                type="number" step="0.0000001"
                value={form.latitude}
                onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))}
                placeholder="e.g. 9.005401"
                className={`${inputCls} ${errors.latitude ? "border-rose-400" : ""}`}
              />
              {errors.latitude && <p className="mt-1 text-xs text-rose-500">{errors.latitude}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-slate-400">
                Longitude *
              </label>
              <input
                type="number" step="0.0000001"
                value={form.longitude}
                onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))}
                placeholder="e.g. 38.763611"
                className={`${inputCls} ${errors.longitude ? "border-rose-400" : ""}`}
              />
              {errors.longitude && <p className="mt-1 text-xs text-rose-500">{errors.longitude}</p>}
            </div>
          </div>

          {/* Radius */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-slate-400">
              Allowed radius: {form.radius_meters} meters
            </label>
            <input
              type="range" min={1} max={2000} step={1}
              value={form.radius_meters}
              onChange={e => setForm(f => ({ ...f, radius_meters: +e.target.value }))}
              className="w-full accent-blue-600"
            />
            <div className="mt-1.5 flex justify-between text-xs text-stone-400 dark:text-slate-500">
              <span>1 m</span><span>500 m</span><span>2000 m (large campus)</span>
            </div>
            <p className="mt-1 text-xs text-stone-400 dark:text-slate-500">
              Employees must be within this distance from the pin to check in or out.
            </p>
          </div>

          {/* GPS accuracy thresholds */}
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 space-y-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-slate-400">GPS Accuracy Rules for this office</p>

            <div>
              <label className="mb-1.5 block text-xs text-stone-500 dark:text-slate-400">
                Warn threshold · <span className="font-bold text-amber-600">{form.gps_accuracy_warn_m} m</span>
              </label>
              <input type="range" min={10} max={200} step={5}
                value={form.gps_accuracy_warn_m}
                onChange={e => setForm(f => ({ ...f, gps_accuracy_warn_m: +e.target.value }))}
                className="w-full accent-amber-500" />
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-stone-500 dark:text-slate-400">
                Hard reject threshold · <span className="font-bold text-rose-600">{form.gps_accuracy_max_m} m</span>
              </label>
              <input type="range" min={50} max={500} step={10}
                value={form.gps_accuracy_max_m}
                onChange={e => setForm(f => ({ ...f, gps_accuracy_max_m: +e.target.value }))}
                className="w-full accent-rose-500" />
            </div>

            <div className="flex gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium">0–{form.gps_accuracy_warn_m}m accept</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">{form.gps_accuracy_warn_m}–{form.gps_accuracy_max_m}m warn</span>
              <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 font-medium">&gt;{form.gps_accuracy_max_m}m reject</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 p-6 pt-0">
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl border border-stone-200 bg-white px-5 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-60 dark:bg-blue-700 dark:hover:bg-blue-600"
          >
            {saving && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            {saving ? "Saving…" : initial ? "Save Changes" : "Add Office"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// -- Empty state ---------------------------------------------------------------
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-stone-300 bg-stone-50 py-16 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
        <MapPin size={28} className="text-blue-600 dark:text-blue-400" />
      </div>
      <h3 className="text-lg font-black text-stone-900 dark:text-white mb-1">No offices yet</h3>
      <p className="text-sm text-stone-500 dark:text-slate-400 text-center max-w-sm mb-6">
        Add office locations to enable geofencing. Employees must be inside a location's radius to check in or out.
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 rounded-2xl bg-stone-900 px-6 py-3 text-sm font-semibold text-white hover:bg-stone-800 transition dark:bg-blue-700 dark:hover:bg-blue-600"
      >
        <Plus size={16} />
        Add First Office
      </button>
    </div>
  );
}
