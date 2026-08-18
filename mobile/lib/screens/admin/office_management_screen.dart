// ignore_for_file: use_build_context_synchronously
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import '../../services/api_service.dart';
import '../../utils/app_theme.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Office Management Screen
// Allows admins to:
//   • View all office locations with real-time distance from their current GPS
//   • Add / edit / deactivate offices
//   • Use their current location to pin-point the office coordinates
// ─────────────────────────────────────────────────────────────────────────────

class OfficeManagementScreen extends StatefulWidget {
  const OfficeManagementScreen({super.key});

  @override
  State<OfficeManagementScreen> createState() => _OfficeManagementScreenState();
}

class _OfficeManagementScreenState extends State<OfficeManagementScreen> {
  List<Map<String, dynamic>> _offices = [];
  bool _loading = true;
  String? _error;

  // Admin's current GPS (for live distance badges)
  Position? _adminPos;
  bool _loadingGps = false;

  @override
  void initState() {
    super.initState();
    _load();
    _fetchAdminLocation();
  }

  // ── Data ────────────────────────────────────────────────────────────────────

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final res = await ApiService.instance.get('/offices');
      if (res['success'] == true) {
        final list = (res['data'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .toList();
        setState(() { _offices = list; _loading = false; });
      } else {
        setState(() { _error = res['error'] ?? 'Failed to load offices'; _loading = false; });
      }
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  // ── GPS ─────────────────────────────────────────────────────────────────────

  Future<void> _fetchAdminLocation() async {
    if (_loadingGps) return;
    setState(() => _loadingGps = true);
    try {
      final svcOk = await Geolocator.isLocationServiceEnabled();
      if (!svcOk) { setState(() => _loadingGps = false); return; }
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        setState(() => _loadingGps = false);
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 15),
      );
      if (mounted) setState(() { _adminPos = pos; _loadingGps = false; });
    } catch (_) {
      if (mounted) setState(() => _loadingGps = false);
    }
  }

  /// Returns distance in metres from admin to an office, or null if no GPS yet.
  double? _distanceTo(Map<String, dynamic> office) {
    if (_adminPos == null) return null;
    final lat = double.tryParse(office['latitude']?.toString() ?? '') ?? 0.0;
    final lng = double.tryParse(office['longitude']?.toString() ?? '') ?? 0.0;
    return _haversineM(_adminPos!.latitude, _adminPos!.longitude, lat, lng);
  }

  static double _haversineM(double lat1, double lon1, double lat2, double lon2) {
    const r = 6371000.0;
    final dLat = (lat2 - lat1) * math.pi / 180;
    final dLon = (lon2 - lon1) * math.pi / 180;
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(lat1 * math.pi / 180) *
            math.cos(lat2 * math.pi / 180) *
            math.sin(dLon / 2) *
            math.sin(dLon / 2);
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  }

  // ── Dialogs / Navigation ────────────────────────────────────────────────────

  Future<void> _openOfficeForm({Map<String, dynamic>? existing}) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => _OfficeFormScreen(
          existing: existing,
          adminPos: _adminPos,
        ),
        fullscreenDialog: true,
      ),
    );
    if (saved == true) {
      _load();
      _fetchAdminLocation();
    }
  }

  Future<void> _deactivate(Map<String, dynamic> office) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Deactivate Office',
            style: TextStyle(fontWeight: FontWeight.w800)),
        content: Text(
          'Deactivate "${office['name']}"?\nEmployees assigned to it will be unlinked.',
          style: const TextStyle(height: 1.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Deactivate',
                style: TextStyle(color: AppTheme.danger)),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await ApiService.instance.delete('/offices/${office['id']}');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${office['name']} deactivated'),
            backgroundColor: AppTheme.gray700,
          ),
        );
      }
      _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: AppTheme.danger),
        );
      }
    }
  }

  // ── Build ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bg,
      appBar: _buildAppBar(),
      floatingActionButton: _buildFab(),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _ErrorView(message: _error!, onRetry: _load)
              : _offices.isEmpty
                  ? _EmptyView(onAdd: () => _openOfficeForm())
                  : _buildBody(),
    );
  }

  AppBar _buildAppBar() => AppBar(
    backgroundColor: AppTheme.primary,
    foregroundColor: Colors.white,
    elevation: 0,
    title: const Text('Office & Geofence',
        style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
    actions: [
      if (_loadingGps)
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: Center(
            child: SizedBox(
              width: 18, height: 18,
              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white54),
            ),
          ),
        )
      else
        IconButton(
          icon: const Icon(Icons.my_location_rounded),
          tooltip: 'Refresh my location',
          onPressed: _fetchAdminLocation,
        ),
      IconButton(
        icon: const Icon(Icons.refresh_rounded),
        tooltip: 'Refresh offices',
        onPressed: _load,
      ),
    ],
  );

  Widget _buildFab() => FloatingActionButton.extended(
    onPressed: () => _openOfficeForm(),
    backgroundColor: AppTheme.accent,
    icon: const Icon(Icons.add_location_alt_rounded),
    label: const Text('Add Office', style: TextStyle(fontWeight: FontWeight.w700)),
  );

  Widget _buildBody() {
    return RefreshIndicator(
      onRefresh: () async { await Future.wait([_load(), _fetchAdminLocation()]); },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 100),
        children: [
          _SummaryHeader(
            officeCount: _offices.length,
            adminPos: _adminPos,
            loadingGps: _loadingGps,
          ),
          const SizedBox(height: 20),
          for (int i = 0; i < _offices.length; i++) ...[
            if (i > 0) const SizedBox(height: 12),
            _OfficeCard(
              office: _offices[i],
              distanceM: _distanceTo(_offices[i]),
              adminPosReady: _adminPos != null,
              onEdit: () => _openOfficeForm(existing: _offices[i]),
              onDelete: () => _deactivate(_offices[i]),
            ),
          ],
        ],
      ),
    );
  }
}

// ── Summary Header ────────────────────────────────────────────────────────────

class _SummaryHeader extends StatelessWidget {
  final int officeCount;
  final Position? adminPos;
  final bool loadingGps;

  const _SummaryHeader({
    required this.officeCount,
    required this.adminPos,
    required this.loadingGps,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: AppTheme.accentGradient,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [AppTheme.cardShadow],
      ),
      child: Row(children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(14),
          ),
          child: const Icon(Icons.location_city_rounded, color: Colors.white, size: 28),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
              '$officeCount Active Office${officeCount == 1 ? '' : 's'}',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),
            if (loadingGps)
              const Text('Getting your location…',
                  style: TextStyle(color: Colors.white70, fontSize: 12))
            else if (adminPos != null)
              Text(
                'Your GPS: ${adminPos!.latitude.toStringAsFixed(5)}, '
                '${adminPos!.longitude.toStringAsFixed(5)}  '
                '±${adminPos!.accuracy.toStringAsFixed(0)} m',
                style: const TextStyle(color: Colors.white70, fontSize: 11),
              )
            else
              const Text('GPS not available — tap  to refresh',
                  style: TextStyle(color: Colors.white60, fontSize: 12)),
          ]),
        ),
      ]),
    );
  }
}

// ── Office Card ───────────────────────────────────────────────────────────────

class _OfficeCard extends StatelessWidget {
  final Map<String, dynamic> office;
  final double? distanceM;       // null = GPS not yet ready
  final bool adminPosReady;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const _OfficeCard({
    required this.office,
    required this.distanceM,
    required this.adminPosReady,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final count  = office['employee_count'] ?? 0;
    final lat    = double.tryParse(office['latitude']?.toString()  ?? '') ?? 0.0;
    final lng    = double.tryParse(office['longitude']?.toString() ?? '') ?? 0.0;
    final radius = (office['radius_meters'] as num?)?.toInt() ?? 200;

    // Geofence status chip
    final bool? inside = distanceM == null ? null : distanceM! <= radius;

    return Container(
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: inside == true
              ? AppTheme.success.withValues(alpha: 0.4)
              : inside == false
                  ? AppTheme.border
                  : AppTheme.border,
          width: inside == true ? 1.5 : 1,
        ),
        boxShadow: [AppTheme.cardShadow],
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // ── Header row ────────────────────────────────────────────────────
          Row(children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppTheme.tealSoft,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.location_city_rounded,
                  color: AppTheme.accent, size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(
                  office['name'] ?? '',
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    color: AppTheme.gray900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '$count employee${count == 1 ? '' : 's'} assigned',
                  style: const TextStyle(fontSize: 12, color: AppTheme.gray600),
                ),
              ]),
            ),
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert_rounded, color: AppTheme.gray600),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              onSelected: (v) { if (v == 'edit') onEdit(); else onDelete(); },
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'edit', child: Row(children: [
                  Icon(Icons.edit_rounded, size: 18, color: AppTheme.accent),
                  SizedBox(width: 10), Text('Edit'),
                ])),
                const PopupMenuItem(value: 'delete', child: Row(children: [
                  Icon(Icons.delete_outline_rounded, size: 18, color: AppTheme.danger),
                  SizedBox(width: 10),
                  Text('Deactivate', style: TextStyle(color: AppTheme.danger)),
                ])),
              ],
            ),
          ]),
          const SizedBox(height: 14),

          // ── Details grid ─────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppTheme.gray100,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(children: [
              _InfoRow(Icons.my_location_rounded, 'Coordinates',
                  '${lat.toStringAsFixed(6)}, ${lng.toStringAsFixed(6)}'),
              const SizedBox(height: 8),
              _InfoRow(Icons.radar_rounded, 'Allowed radius', '$radius m'),
            ]),
          ),
          const SizedBox(height: 10),

          // ── Distance / geofence badge ─────────────────────────────────────
          _GeofenceBadge(
            distanceM: distanceM,
            radiusM: radius.toDouble(),
            adminPosReady: adminPosReady,
          ),
        ]),
      ),
    );
  }
}

// ── Geofence Badge ────────────────────────────────────────────────────────────
// Shows live distance + inside/outside status for this office card.

class _GeofenceBadge extends StatelessWidget {
  final double? distanceM;
  final double radiusM;
  final bool adminPosReady;

  const _GeofenceBadge({
    required this.distanceM,
    required this.radiusM,
    required this.adminPosReady,
  });

  @override
  Widget build(BuildContext context) {
    if (!adminPosReady) {
      return _chip(
        icon: Icons.location_searching_rounded,
        label: 'Getting your location…',
        bg: AppTheme.gray100,
        fg: AppTheme.gray600,
      );
    }
    if (distanceM == null) {
      return _chip(
        icon: Icons.location_off_rounded,
        label: 'Location unavailable',
        bg: AppTheme.gray100,
        fg: AppTheme.gray500,
      );
    }

    final dist   = distanceM!;
    final inside = dist <= radiusM;
    final close  = !inside && dist <= radiusM * 1.4;

    if (inside) {
      return _chip(
        icon: Icons.check_circle_rounded,
        label: 'You are inside this zone  (${dist.toStringAsFixed(0)} m away)',
        bg: AppTheme.mintSoft,
        fg: AppTheme.success,
      );
    } else if (close) {
      return _chip(
        icon: Icons.location_on_rounded,
        label: '${dist.toStringAsFixed(0)} m away — close to boundary',
        bg: AppTheme.amberSoft,
        fg: AppTheme.warning,
      );
    } else {
      return _chip(
        icon: Icons.location_off_rounded,
        label: '${dist.toStringAsFixed(0)} m away — outside zone',
        bg: AppTheme.redSoft,
        fg: AppTheme.danger,
      );
    }
  }

  Widget _chip({
    required IconData icon,
    required String label,
    required Color bg,
    required Color fg,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 14, color: fg),
        const SizedBox(width: 6),
        Flexible(
          child: Text(label,
              style: TextStyle(
                  fontSize: 11, fontWeight: FontWeight.w700, color: fg)),
        ),
      ]),
    );
  }
}

// ── Info Row ──────────────────────────────────────────────────────────────────

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoRow(this.icon, this.label, this.value);

  @override
  Widget build(BuildContext context) => Row(children: [
    Icon(icon, size: 15, color: AppTheme.gray600),
    const SizedBox(width: 8),
    Text('$label: ',
        style: const TextStyle(
            fontSize: 12, color: AppTheme.gray600, fontWeight: FontWeight.w600)),
    Expanded(
      child: Text(value,
          style: const TextStyle(
              fontSize: 12, color: AppTheme.gray900, fontWeight: FontWeight.w700),
          overflow: TextOverflow.ellipsis),
    ),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// _OfficeFormScreen — full-page add / edit form
// ─────────────────────────────────────────────────────────────────────────────

class _OfficeFormScreen extends StatefulWidget {
  final Map<String, dynamic>? existing;
  final Position? adminPos;

  const _OfficeFormScreen({this.existing, this.adminPos});

  @override
  State<_OfficeFormScreen> createState() => _OfficeFormScreenState();
}

class _OfficeFormScreenState extends State<_OfficeFormScreen> {
  final _formKey   = GlobalKey<FormState>();
  final _nameCtrl  = TextEditingController();
  final _latCtrl   = TextEditingController();
  final _lngCtrl   = TextEditingController();
  final _radCtrl   = TextEditingController();

  bool _saving     = false;
  bool _gettingGps = false;
  String? _gpsError;
  Position? _livePos;  // position fetched by "Use my location"

  bool get _isEdit => widget.existing != null;

  @override
  void initState() {
    super.initState();
    if (_isEdit) {
      final o = widget.existing!;
      _nameCtrl.text = o['name'] ?? '';
      _latCtrl.text  = (o['latitude']  ?? '').toString();
      _lngCtrl.text  = (o['longitude'] ?? '').toString();
      _radCtrl.text  = (o['radius_meters'] ?? 200).toString();
    } else {
      _radCtrl.text = '200';
      // Pre-fill from admin GPS if available
      if (widget.adminPos != null) {
        _latCtrl.text = widget.adminPos!.latitude.toStringAsFixed(7);
        _lngCtrl.text = widget.adminPos!.longitude.toStringAsFixed(7);
        _livePos = widget.adminPos;
      }
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _latCtrl.dispose();
    _lngCtrl.dispose();
    _radCtrl.dispose();
    super.dispose();
  }

  // ── GPS ────────────────────────────────────────────────────────────────────

  Future<void> _useCurrentLocation() async {
    if (_gettingGps) return;
    setState(() { _gettingGps = true; _gpsError = null; });
    try {
      final svcOk = await Geolocator.isLocationServiceEnabled();
      if (!svcOk) {
        setState(() {
          _gpsError = 'Location services are disabled.\nEnable GPS in device settings.';
          _gettingGps = false;
        });
        return;
      }
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.deniedForever) {
        setState(() {
          _gpsError = 'Location permission permanently denied.\nGo to app settings to enable it.';
          _gettingGps = false;
        });
        return;
      }
      if (perm == LocationPermission.denied) {
        setState(() {
          _gpsError = 'Location permission denied.';
          _gettingGps = false;
        });
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.best,
        timeLimit: const Duration(seconds: 20),
      );
      setState(() {
        _latCtrl.text = pos.latitude.toStringAsFixed(7);
        _lngCtrl.text = pos.longitude.toStringAsFixed(7);
        _livePos      = pos;
        _gettingGps   = false;
      });
      HapticFeedback.lightImpact();
    } catch (e) {
      setState(() {
        _gpsError   = 'Could not get GPS fix. Move to an open area and try again.';
        _gettingGps = false;
      });
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _saving = true; });

    final body = {
      'name':          _nameCtrl.text.trim(),
      'latitude':      double.parse(_latCtrl.text.trim()),
      'longitude':     double.parse(_lngCtrl.text.trim()),
      'radius_meters': int.parse(_radCtrl.text.trim()),
    };

    try {
      if (_isEdit) {
        await ApiService.instance.put('/offices/${widget.existing!['id']}', body: body);
      } else {
        await ApiService.instance.post('/offices', body: body);
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Save failed: $e'),
            backgroundColor: AppTheme.danger,
          ),
        );
        setState(() => _saving = false);
      }
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    // Compute preview distance if we have a live GPS fix and valid coords
    double? previewDist;
    final lat = double.tryParse(_latCtrl.text);
    final lng = double.tryParse(_lngCtrl.text);
    final rad = int.tryParse(_radCtrl.text) ?? 200;
    if (_livePos != null && lat != null && lng != null) {
      const r = 6371000.0;
      final dLat = (lat - _livePos!.latitude)  * math.pi / 180;
      final dLon = (lng - _livePos!.longitude) * math.pi / 180;
      final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
          math.cos(_livePos!.latitude  * math.pi / 180) *
          math.cos(lat * math.pi / 180) *
          math.sin(dLon / 2) * math.sin(dLon / 2);
      previewDist = r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    }

    return Scaffold(
      backgroundColor: AppTheme.bg,
      appBar: AppBar(
        backgroundColor: AppTheme.primary,
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text(
          _isEdit ? 'Edit Office' : 'New Office',
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        actions: [
          if (_saving)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: Center(
                child: SizedBox(
                  width: 18, height: 18,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white),
                ),
              ),
            )
          else
            TextButton(
              onPressed: _save,
              child: const Text('Save',
                  style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      fontSize: 15)),
            ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 40),
          children: [
            // ── Office Name ──────────────────────────────────────────────
            _buildSectionLabel('Office Details'),
            const SizedBox(height: 10),
            _buildField(
              controller: _nameCtrl,
              label: 'Office Name',
              hint: 'e.g. Main Branch, Addis Ababa HQ',
              icon: Icons.business_rounded,
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Name is required' : null,
            ),
            const SizedBox(height: 28),

            // ── Location ─────────────────────────────────────────────────
            _buildSectionLabel('Location Coordinates'),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(
                child: _buildField(
                  controller: _latCtrl,
                  label: 'Latitude',
                  hint: '9.0054',
                  icon: Icons.explore_rounded,
                  keyboardType: const TextInputType.numberWithOptions(
                      decimal: true, signed: true),
                  onChanged: (_) => setState(() {}),
                  validator: (v) {
                    if (v == null || v.trim().isEmpty) return 'Required';
                    final d = double.tryParse(v.trim());
                    if (d == null || d < -90 || d > 90) return 'Invalid';
                    return null;
                  },
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildField(
                  controller: _lngCtrl,
                  label: 'Longitude',
                  hint: '38.7578',
                  icon: Icons.explore_rounded,
                  keyboardType: const TextInputType.numberWithOptions(
                      decimal: true, signed: true),
                  onChanged: (_) => setState(() {}),
                  validator: (v) {
                    if (v == null || v.trim().isEmpty) return 'Required';
                    final d = double.tryParse(v.trim());
                    if (d == null || d < -180 || d > 180) return 'Invalid';
                    return null;
                  },
                ),
              ),
            ]),
            const SizedBox(height: 12),

            // ── Use My Location button ────────────────────────────────────
            _UseLocationButton(
              loading: _gettingGps,
              onTap: _useCurrentLocation,
              livePos: _livePos,
            ),

            if (_gpsError != null) ...[
              const SizedBox(height: 10),
              _ErrorBanner(message: _gpsError!),
            ],

            // ── Preview distance ─────────────────────────────────────────
            if (previewDist != null) ...[
              const SizedBox(height: 10),
              _PreviewDistance(distanceM: previewDist, radiusM: rad.toDouble()),
            ],
            const SizedBox(height: 28),

            // ── Geofence Radius ──────────────────────────────────────────
            _buildSectionLabel('Geofence Radius'),
            const SizedBox(height: 10),
            _buildField(
              controller: _radCtrl,
              label: 'Allowed Radius (meters)',
              hint: '200',
              icon: Icons.radar_rounded,
              keyboardType: TextInputType.number,
              onChanged: (_) => setState(() {}),
              validator: (v) {
                if (v == null || v.trim().isEmpty) return 'Required';
                final n = int.tryParse(v.trim());
                if (n == null || n < 10 || n > 50000) return '10 – 50 000 m';
                return null;
              },
            ),
            const SizedBox(height: 6),
            _buildHint(
              'Employees must be within $rad m of the office '
              'coordinates to check in or out.',
            ),
            const SizedBox(height: 36),

            // ── Save Button ───────────────────────────────────────────────
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: _saving ? null : _save,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.accent,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16)),
                  elevation: 0,
                ),
                child: _saving
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2.5, color: Colors.white),
                      )
                    : Text(
                        _isEdit ? 'Save Changes' : 'Add Office',
                        style: const TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w800),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  Widget _buildSectionLabel(String text) => Text(
    text.toUpperCase(),
    style: const TextStyle(
      fontSize: 11,
      fontWeight: FontWeight.w800,
      color: AppTheme.gray500,
      letterSpacing: 0.8,
    ),
  );

  Widget _buildHint(String text) => Text(
    text,
    style: const TextStyle(fontSize: 12, color: AppTheme.gray500, height: 1.4),
  );

  Widget _buildField({
    required TextEditingController controller,
    required String label,
    required String hint,
    required IconData icon,
    TextInputType? keyboardType,
    ValueChanged<String>? onChanged,
    String? Function(String?)? validator,
  }) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      onChanged: onChanged,
      validator: validator,
      style: const TextStyle(
          fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.gray900),
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: Icon(icon, size: 18, color: AppTheme.accent),
        labelStyle: const TextStyle(fontSize: 13, color: AppTheme.gray600),
        hintStyle: const TextStyle(fontSize: 13, color: AppTheme.gray400),
        filled: true,
        fillColor: AppTheme.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppTheme.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppTheme.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppTheme.accent, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppTheme.danger),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppTheme.danger, width: 2),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
    );
  }
}

// ── Use My Location Button ────────────────────────────────────────────────────

class _UseLocationButton extends StatelessWidget {
  final bool loading;
  final VoidCallback onTap;
  final Position? livePos;

  const _UseLocationButton({
    required this.loading,
    required this.onTap,
    required this.livePos,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: loading ? null : onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
          decoration: BoxDecoration(
            color: livePos != null ? AppTheme.mintSoft : AppTheme.tealSoft,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: livePos != null
                  ? AppTheme.success.withValues(alpha: 0.4)
                  : AppTheme.accent.withValues(alpha: 0.3),
            ),
          ),
          child: Row(children: [
            if (loading)
              const SizedBox(
                width: 20, height: 20,
                child: CircularProgressIndicator(
                    strokeWidth: 2.5, color: AppTheme.accent),
              )
            else
              Icon(
                livePos != null
                    ? Icons.check_circle_rounded
                    : Icons.my_location_rounded,
                color: livePos != null ? AppTheme.success : AppTheme.accent,
                size: 20,
              ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(
                  loading
                      ? 'Getting your location…'
                      : livePos != null
                          ? 'Location captured!'
                          : 'Use my current location',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: livePos != null ? AppTheme.success : AppTheme.accent,
                  ),
                ),
                if (livePos != null && !loading) ...[
                  const SizedBox(height: 2),
                  Text(
                    '${livePos!.latitude.toStringAsFixed(6)}, '
                    '${livePos!.longitude.toStringAsFixed(6)}  '
                    '±${livePos!.accuracy.toStringAsFixed(0)} m',
                    style: const TextStyle(
                        fontSize: 11, color: AppTheme.gray600),
                  ),
                ] else if (!loading) ...[
                  const SizedBox(height: 2),
                  const Text(
                    'Tap to fill coordinates from your GPS',
                    style: TextStyle(fontSize: 11, color: AppTheme.gray600),
                  ),
                ],
              ]),
            ),
            if (!loading)
              Icon(
                Icons.chevron_right_rounded,
                color: livePos != null ? AppTheme.success : AppTheme.accent,
                size: 20,
              ),
          ]),
        ),
      ),
    );
  }
}

// ── Preview Distance ──────────────────────────────────────────────────────────
// Shows admin how far the entered coordinates are from their current location.

class _PreviewDistance extends StatelessWidget {
  final double distanceM;
  final double radiusM;

  const _PreviewDistance({required this.distanceM, required this.radiusM});

  @override
  Widget build(BuildContext context) {
    final inside = distanceM <= radiusM;
    final close  = !inside && distanceM <= radiusM * 1.4;
    final Color bg, fg;
    final IconData icon;
    final String label;

    if (inside) {
      bg = AppTheme.mintSoft; fg = AppTheme.success;
      icon  = Icons.check_circle_rounded;
      label = 'You are inside this zone (${distanceM.toStringAsFixed(0)} m from pin)';
    } else if (close) {
      bg = AppTheme.amberSoft; fg = AppTheme.warning;
      icon  = Icons.location_on_rounded;
      label = '${distanceM.toStringAsFixed(0)} m from pin — near boundary';
    } else {
      bg = AppTheme.redSoft; fg = AppTheme.danger;
      icon  = Icons.location_off_rounded;
      label = '${distanceM.toStringAsFixed(0)} m from pin — outside radius';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: fg.withValues(alpha: 0.25)),
      ),
      child: Row(children: [
        Icon(icon, size: 16, color: fg),
        const SizedBox(width: 8),
        Expanded(
          child: Text(label,
              style: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w700, color: fg)),
        ),
      ]),
    );
  }
}

// ── Error Banner ──────────────────────────────────────────────────────────────

class _ErrorBanner extends StatelessWidget {
  final String message;
  const _ErrorBanner({required this.message});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: AppTheme.redSoft,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: AppTheme.danger.withValues(alpha: 0.3)),
    ),
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Icon(Icons.error_outline_rounded, color: AppTheme.danger, size: 16),
      const SizedBox(width: 8),
      Expanded(
        child: Text(message,
            style: const TextStyle(
                color: AppTheme.danger,
                fontSize: 12,
                fontWeight: FontWeight.w600,
                height: 1.4)),
      ),
    ]),
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

class _EmptyView extends StatelessWidget {
  final VoidCallback onAdd;
  const _EmptyView({required this.onAdd});

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(40),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          padding: const EdgeInsets.all(28),
          decoration: const BoxDecoration(
              color: AppTheme.tealSoft, shape: BoxShape.circle),
          child: const Icon(Icons.add_location_alt_rounded,
              color: AppTheme.accent, size: 52),
        ),
        const SizedBox(height: 24),
        const Text('No offices yet',
            style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: AppTheme.gray900)),
        const SizedBox(height: 10),
        const Text(
          'Add office locations to enable geofencing.\n'
          'Employees must be within the allowed radius\n'
          'to check in or out.',
          textAlign: TextAlign.center,
          style: TextStyle(
              fontSize: 13, color: AppTheme.gray600, height: 1.6),
        ),
        const SizedBox(height: 28),
        ElevatedButton.icon(
          onPressed: onAdd,
          icon: const Icon(Icons.add_location_alt_rounded),
          label: const Text('Add First Office',
              style: TextStyle(fontWeight: FontWeight.w800)),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppTheme.accent,
            foregroundColor: Colors.white,
            padding:
                const EdgeInsets.symmetric(horizontal: 28, vertical: 14),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16)),
            elevation: 0,
          ),
        ),
      ]),
    ),
  );
}

// ── Error State ───────────────────────────────────────────────────────────────

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.cloud_off_rounded, color: AppTheme.danger, size: 52),
        const SizedBox(height: 16),
        Text(message,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 13, color: AppTheme.gray600)),
        const SizedBox(height: 20),
        ElevatedButton.icon(
          onPressed: onRetry,
          icon: const Icon(Icons.refresh_rounded),
          label: const Text('Retry'),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppTheme.accent,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14)),
            elevation: 0,
          ),
        ),
      ]),
    ),
  );
}
