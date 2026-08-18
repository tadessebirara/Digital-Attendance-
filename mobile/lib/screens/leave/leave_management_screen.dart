import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:file_picker/file_picker.dart';
import 'package:intl/intl.dart';
import '../../providers/leave_provider.dart';
import '../../services/api_service.dart';
import '../../utils/app_strings.dart';
import '../../utils/app_theme.dart';
import '../../utils/ethiopian_calendar.dart';
import '../../widgets/app_widgets.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Leave Management Screen
// ─────────────────────────────────────────────────────────────────────────────

class LeaveManagementScreen extends StatefulWidget {
  const LeaveManagementScreen({super.key});

  @override
  State<LeaveManagementScreen> createState() => _LeaveManagementScreenState();
}

class _LeaveManagementScreenState extends State<LeaveManagementScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tab;
  final _formKey    = GlobalKey<FormState>();
  final _reasonCtrl = TextEditingController();

  String? _leaveType;
  DateTime? _startDate;
  DateTime? _endDate;
  String _documentUrl = '';
  bool _uploading = false;
  String? _uploadedFileName;

  static const List<String> _leaveTypes = [
    'SICK', 'VACATION', 'PERSONAL', 'EMERGENCY', 'MATERNITY', 'PATERNITY',
  ];

  static const Map<String, String> _leaveTypeLabels = {
    'SICK':       'Sick Leave',
    'VACATION':   'Vacation',
    'PERSONAL':   'Personal Leave',
    'EMERGENCY':  'Emergency Leave',
    'MATERNITY':  'Maternity Leave',
    'PATERNITY':  'Paternity Leave',
  };

  static const Map<String, IconData> _leaveTypeIcons = {
    'SICK':       Icons.local_hospital_rounded,
    'VACATION':   Icons.beach_access_rounded,
    'PERSONAL':   Icons.person_rounded,
    'EMERGENCY':  Icons.warning_amber_rounded,
    'MATERNITY':  Icons.child_care_rounded,
    'PATERNITY':  Icons.family_restroom_rounded,
  };

  static const Map<String, Color> _leaveTypeColors = {
    'SICK':       Color(0xFFEF4444),
    'VACATION':   Color(0xFF10B981),
    'PERSONAL':   Color(0xFF3B82F6),
    'EMERGENCY':  Color(0xFFF59E0B),
    'MATERNITY':  Color(0xFFEC4899),
    'PATERNITY':  Color(0xFF8B5CF6),
  };

  bool get _isSick => _leaveType == 'SICK';

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 2, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Provider.of<LeaveProvider>(context, listen: false).getMyLeaves();
    });
  }

  @override
  void dispose() {
    _tab.dispose();
    _reasonCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDate({required bool isStart}) async {
    final now = DateTime.now();
    final initial = isStart ? (_startDate ?? now) : (_endDate ?? (_startDate ?? now));
    final first   = isStart ? now : (_startDate ?? now);

    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: first,
      lastDate: DateTime(now.year + 2),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(
            primary: AppTheme.accent,
            onPrimary: Colors.white,
          ),
        ),
        child: child!,
      ),
    );
    if (picked == null) return;
    setState(() {
      if (isStart) {
        _startDate = picked;
        if (_endDate != null && _endDate!.isBefore(picked)) _endDate = picked;
      } else {
        _endDate = picked;
      }
    });
  }

  Future<void> _pickDocument() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    final file = result.files.first;
    if (file.bytes == null) return;

    setState(() => _uploading = true);
    try {
      final res = await ApiService.instance.uploadFile(
        '/uploads/leave-document',
        fileBytes: file.bytes!,
        fileName: file.name,
        fieldName: 'document',
      );
      if (res['success'] == true) {
        final url =
            (res['data'] as Map<String, dynamic>?)?['url'] as String? ?? '';
        setState(() {
          _documentUrl      = url;
          _uploadedFileName = file.name;
        });
      } else {
        _showSnack('Upload failed. Please try again.', isError: true);
      }
    } catch (_) {
      _showSnack('Upload failed. Please try again.', isError: true);
    } finally {
      setState(() => _uploading = false);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_startDate == null || _endDate == null) {
      _showSnack('Please select start and end dates.', isError: true);
      return;
    }
    if (_isSick && _documentUrl.isEmpty) {
      _showSnack('Medical certificate is required for Sick Leave.', isError: true);
      return;
    }

    final provider = Provider.of<LeaveProvider>(context, listen: false);
    final result = await provider.applyLeave(
      leaveType:   _leaveType!,
      startDate:   _startDate!,
      endDate:     _endDate!,
      reason:      _reasonCtrl.text.trim(),
      documentUrl: _documentUrl,
    );

    if (!mounted) return;
    _showSnack(result.message, isError: !result.ok);
    if (result.ok) {
      _formKey.currentState!.reset();
      setState(() {
        _leaveType        = null;
        _startDate        = null;
        _endDate          = null;
        _documentUrl      = '';
        _uploadedFileName = null;
      });
      _reasonCtrl.clear();
      _tab.animateTo(1); // Switch to History tab
    }
  }

  void _showSnack(String msg, {bool isError = false}) =>
      showAppSnack(context, msg, isError: isError);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final s      = AppStrings.of(context);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: PageHeader(eyebrow: s.leaveEyebrow, title: s.leaveTitle),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 18),
              child: AppSegmentedBar(
                labels: [s.newRequest, s.myHistory],
                selected: _tab.index,
                onChanged: (i) { _tab.animateTo(i); setState(() {}); },
              ),
            ),
            const SizedBox(height: 12),

            // ── Content ─────────────────────────────────────────────────
            Expanded(
              child: TabBarView(
                controller: _tab,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  _RequestForm(
                    formKey:          _formKey,
                    reasonCtrl:       _reasonCtrl,
                    leaveType:        _leaveType,
                    leaveTypes:       _leaveTypes,
                    leaveTypeLabels:  _leaveTypeLabels,
                    leaveTypeIcons:   _leaveTypeIcons,
                    leaveTypeColors:  _leaveTypeColors,
                    startDate:        _startDate,
                    endDate:          _endDate,
                    documentUrl:      _documentUrl,
                    uploadedFileName: _uploadedFileName,
                    uploading:        _uploading,
                    isDark:           isDark,
                    strings:          s,
                    onTypeChanged:    (v) => setState(() => _leaveType = v),
                    onPickStart:      () => _pickDate(isStart: true),
                    onPickEnd:        () => _pickDate(isStart: false),
                    onPickDoc:        _pickDocument,
                    onRemoveDoc: () => setState(() {
                      _documentUrl = '';
                      _uploadedFileName = null;
                    }),
                    onSubmit:         _submit,
                  ),
                  _HistoryTab(isDark: isDark, strings: s),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// New Request Form Tab
// ─────────────────────────────────────────────────────────────────────────────

class _RequestForm extends StatelessWidget {
  final GlobalKey<FormState> formKey;
  final TextEditingController reasonCtrl;
  final String? leaveType;
  final List<String> leaveTypes;
  final Map<String, String> leaveTypeLabels;
  final Map<String, IconData> leaveTypeIcons;
  final Map<String, Color> leaveTypeColors;
  final DateTime? startDate;
  final DateTime? endDate;
  final String documentUrl;
  final String? uploadedFileName;
  final bool uploading;
  final bool isDark;
  final AppStrings strings;
  final ValueChanged<String?> onTypeChanged;
  final VoidCallback onPickStart;
  final VoidCallback onPickEnd;
  final VoidCallback onPickDoc;
  final VoidCallback onRemoveDoc;
  final VoidCallback onSubmit;

  const _RequestForm({
    required this.formKey,
    required this.reasonCtrl,
    required this.leaveType,
    required this.leaveTypes,
    required this.leaveTypeLabels,
    required this.leaveTypeIcons,
    required this.leaveTypeColors,
    required this.startDate,
    required this.endDate,
    required this.documentUrl,
    required this.uploadedFileName,
    required this.uploading,
    required this.isDark,
    required this.strings,
    required this.onTypeChanged,
    required this.onPickStart,
    required this.onPickEnd,
    required this.onPickDoc,
    required this.onRemoveDoc,
    required this.onSubmit,
  });

  @override
  Widget build(BuildContext context) {
    final s   = strings;
    final fmt = DateFormat('dd MMM yyyy');

    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(18, 8, 18, 32),
      child: Form(
        key: formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Leave Balance strip ──────────────────────────────────────
            Consumer<LeaveProvider>(
              builder: (_, prov, __) {
                final balanceList = prov.leaveBalance;
                if (balanceList.isEmpty) return const SizedBox.shrink();
                // Balance can be a list of {leaveType, balance, used} or a single map
                // Try to find annual, sick, used from the list
                int annual = 0, sick = 0, used = 0;
                for (final b in balanceList) {
                  if (b is Map) {
                    final t = (b['leaveType'] as String? ?? '').toUpperCase();
                    final bal = (b['balance'] ?? b['remaining'] ?? 0) as num;
                    final u   = (b['used'] ?? 0) as num;
                    if (t == 'VACATION' || t == 'ANNUAL') annual = bal.toInt();
                    if (t == 'SICK') sick = bal.toInt();
                    used += u.toInt();
                  }
                }
                if (annual == 0 && sick == 0 && used == 0) return const SizedBox.shrink();
                return Container(
                  margin: const EdgeInsets.only(bottom: 16),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: AppTheme.accent.withValues(alpha: isDark ? 0.15 : 0.08),
                    borderRadius: AppTheme.radiusM,
                    border: Border.all(color: AppTheme.accent.withValues(alpha: 0.25)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _BalanceChip(label: 'Annual',  value: annual, color: AppTheme.accent),
                      _BalanceChip(label: 'Sick',    value: sick,   color: AppTheme.info),
                      _BalanceChip(label: 'Used',    value: used,   color: AppTheme.warning),
                    ],
                  ),
                );
              },
            ),

            // ── Leave type chips ─────────────────────────────────────────
            _FormLabel(s.leaveType),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: leaveTypes.map((t) {
                final selected = leaveType == t;
                final color = leaveTypeColors[t] ?? AppTheme.accent;
                final icon  = leaveTypeIcons[t]  ?? Icons.event_note_rounded;
                return GestureDetector(
                  onTap: () => onTypeChanged(t),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                    decoration: BoxDecoration(
                      color: selected ? color : color.withValues(alpha: isDark ? 0.12 : 0.08),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: selected ? color : color.withValues(alpha: 0.3),
                        width: selected ? 0 : 1,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(icon,
                            size: 14,
                            color: selected ? Colors.white : color),
                        const SizedBox(width: 6),
                        Text(
                          leaveTypeLabels[t] ?? t,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: selected ? Colors.white : color,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
            if (leaveType == null) ...[
              const SizedBox(height: 6),
              const Text(
                'Please select a leave type',
                style: TextStyle(fontSize: 11, color: AppTheme.danger),
              ),
            ],
            const SizedBox(height: 20),

            // ── Date range ───────────────────────────────────────────────
            _FormLabel(s.duration),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _DateChip(
                    label: s.startDate,
                    date: startDate,
                    fmt: fmt,
                    isDark: isDark,
                    onTap: onPickStart,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: Icon(Icons.arrow_forward_rounded,
                      size: 16,
                      color: isDark ? AppTheme.gray500 : AppTheme.gray400),
                ),
                Expanded(
                  child: _DateChip(
                    label: s.endDate,
                    date: endDate,
                    fmt: fmt,
                    isDark: isDark,
                    onTap: onPickEnd,
                  ),
                ),
              ],
            ),
            if (startDate != null && endDate != null) ...[
              const SizedBox(height: 6),
              Text(
                s.daysCount(endDate!.difference(startDate!).inDays + 1),
                style: const TextStyle(fontSize: 12, color: AppTheme.accent, fontWeight: FontWeight.w700),
              ),
            ],
            const SizedBox(height: 20),

            // ── Reason ───────────────────────────────────────────────────
            _FormLabel(s.reason),
            const SizedBox(height: 8),
            TextFormField(
              controller: reasonCtrl,
              maxLines: 3,
              style: TextStyle(fontSize: 14, color: isDark ? Colors.white : AppTheme.primary),
              decoration: InputDecoration(
                hintText: s.reasonForLeave,
                filled: true,
                fillColor: isDark ? const Color(0xFF223042) : AppTheme.gray100,
                border: OutlineInputBorder(
                  borderRadius: AppTheme.radiusM,
                  borderSide: BorderSide.none,
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: AppTheme.radiusM,
                  borderSide:
                      const BorderSide(color: AppTheme.accent, width: 1.5),
                ),
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Please provide a reason' : null,
            ),
            const SizedBox(height: 20),

            // ── Document ─────────────────────────────────────────────────
            Row(children: [
              _FormLabel(s.document),
              if (leaveType == 'SICK') ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppTheme.danger.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text(
                    'REQUIRED',
                    style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w900,
                        color: AppTheme.danger,
                        letterSpacing: 0.5),
                  ),
                ),
              ],
            ]),
            const SizedBox(height: 8),
            _UploadSection(
              uploading:        uploading,
              uploadedFileName: uploadedFileName,
              isDark:           isDark,
              onPickDoc:        onPickDoc,
              onRemove:         onRemoveDoc,
            ),
            const SizedBox(height: 28),

            // ── Submit ───────────────────────────────────────────────────
            Consumer<LeaveProvider>(
              builder: (_, prov, __) => SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton(
                  onPressed: prov.isLoading ? null : onSubmit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.accent,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: AppTheme.radiusM),
                  ),
                  child: prov.isLoading
                      ? const SizedBox(width: 22, height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                      : Text(s.submitRequest,
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// History Tab
// ─────────────────────────────────────────────────────────────────────────────

class _HistoryTab extends StatelessWidget {
  final bool isDark;
  final AppStrings strings;
  const _HistoryTab({required this.isDark, required this.strings});

  @override
  Widget build(BuildContext context) {
    return Consumer<LeaveProvider>(
      builder: (_, prov, __) {
        final leaves = prov.myLeaves;

        if (prov.isLoading && leaves.isEmpty) return const LeaveListSkeleton();

        if (leaves.isEmpty) {
          return ListView(children: [
            const SizedBox(height: 60),
            AppEmptyState(
              icon: Icons.event_busy_rounded,
              title: strings.noLeaveYet,
              subtitle: strings.noLeaveSubtitle,
            ),
          ]);
        }

        return ListView.builder(
          padding: const EdgeInsets.fromLTRB(0, 8, 0, 32),
          itemCount: leaves.length,
          itemBuilder: (ctx, i) => _LeaveListItem(
            leave:       leaves[i],
            showDivider: false,
            isDark:      isDark,
            onTap: () => _openDetail(ctx, leaves[i]),
          ),
        );
      },
    );
  }

  void _openDetail(BuildContext context, dynamic leave) {
    final status = ((leave['status'] as String?) ?? '').toUpperCase();
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => status == 'PENDING'
            ? _LeaveStatusTrackerScreen(leave: leave)
            : _LeaveDetailScreen(leave: leave),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Leave List Item
// ─────────────────────────────────────────────────────────────────────────────

class _LeaveListItem extends StatelessWidget {
  final dynamic leave;
  final bool showDivider;
  final bool isDark;
  final VoidCallback onTap;

  const _LeaveListItem({
    required this.leave,
    required this.showDivider,
    required this.isDark,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final status    = ((leave['status'] as String?) ?? '').toUpperCase();
    final leaveType = (leave['leaveType'] as String?) ?? 'Leave';
    final startDate = _parseDate(leave['startDate']);
    final endDate   = _parseDate(leave['endDate']);
    final fmt = DateFormat('dd MMM');
    final dateRange = (startDate != null && endDate != null)
        ? '${fmt.format(startDate)} – ${fmt.format(endDate)}'
        : '—';

    final isApproved = status == 'APPROVED';
    final isPending  = status == 'PENDING';

    final Color statusColor = isApproved
        ? AppTheme.success
        : isPending
            ? AppTheme.warning
            : AppTheme.danger;

    final IconData iconData = isApproved
        ? Icons.check_circle_rounded
        : isPending
            ? Icons.hourglass_top_rounded
            : Icons.cancel_rounded;

    final surface = isDark ? const Color(0xFF18212F) : AppTheme.surface;

    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 0, 18, 12),
      child: PressableScale(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: surface,
            borderRadius: AppTheme.radiusM,
            boxShadow: [AppTheme.cardShadow],
            border: Border.all(
              color: isDark ? Colors.white10 : AppTheme.border,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: Icon(iconData, color: statusColor, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      leaveType,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: isDark ? Colors.white : AppTheme.primary,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Row(children: [
                      Text(
                        dateRange,
                        style: TextStyle(
                          fontSize: 12,
                          color: isDark ? AppTheme.gray400 : AppTheme.gray500,
                        ),
                      ),
                      if (isPending) ...[
                        const SizedBox(width: 8),
                        Container(
                          width: 5, height: 5,
                          decoration: const BoxDecoration(
                              color: AppTheme.warning, shape: BoxShape.circle),
                        ),
                        const SizedBox(width: 4),
                        Builder(builder: (ctx) {
                          final s = AppStrings.of(ctx);
                          return Text(s.inReview,
                              style: const TextStyle(
                                  fontSize: 11,
                                  color: AppTheme.warning,
                                  fontWeight: FontWeight.w600));
                        }),
                      ],
                    ]),
                  ],
                ),
              ),
              StatusBadge(label: status, color: statusColor),
              const SizedBox(width: 6),
              Icon(Icons.chevron_right_rounded,
                  size: 18,
                  color: isDark ? AppTheme.gray500 : AppTheme.gray400),
            ],
          ),
        ),
      ),
    );
  }

  DateTime? _parseDate(dynamic val) {
    if (val == null) return null;
    try {
      return DateTime.parse(val.toString());
    } catch (_) {
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Leave Status Tracker Screen (Pending)
// ─────────────────────────────────────────────────────────────────────────────

class _LeaveStatusTrackerScreen extends StatelessWidget {
  final dynamic leave;
  const _LeaveStatusTrackerScreen({required this.leave});

  @override
  Widget build(BuildContext context) {
    final isDark    = Theme.of(context).brightness == Brightness.dark;
    final s         = AppStrings.of(context);
    final leaveType = (leave['leaveType'] as String?) ?? 'Leave';
    final startDate = _parseDate(leave['startDate']);
    final endDate   = _parseDate(leave['endDate']);
    final fmt = DateFormat('dd MMM yyyy');
    final dateRange = (startDate != null && endDate != null)
        ? '${fmt.format(startDate)} – ${fmt.format(endDate)}'
        : '—';

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF111827) : AppTheme.bg,
      appBar: _buildAppBar(context, s.pendingApproval, isDark),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            const SizedBox(height: 12),
            _PulsingIcon(icon: Icons.hourglass_top_rounded, color: AppTheme.accent, size: 88),
            const SizedBox(height: 20),
            Text(
              s.pendingApproval,
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800,
                  color: isDark ? Colors.white : AppTheme.primary),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text('$leaveType  •  $dateRange',
                style: const TextStyle(fontSize: 13, color: AppTheme.gray500),
                textAlign: TextAlign.center),
            const SizedBox(height: 28),

            // Timeline
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF18212F) : AppTheme.surface,
                borderRadius: AppTheme.radiusL,
                boxShadow: [AppTheme.cardShadow],
                border: Border.all(color: isDark ? Colors.white10 : AppTheme.border),
              ),
              child: Column(children: [
                _TimelineStep(
                  icon: Icons.check_circle_rounded, iconColor: AppTheme.success,
                  title: _am(context) ? 'ጥያቄ ቀረበ'       : 'Request Submitted',
                  subtitle: _am(context) ? 'ጥያቄዎ ተቀብሏል።' : 'Your leave request has been received.',
                  isCompleted: true, showLine: true, isDark: isDark,
                ),
                _TimelineStep(
                  icon: Icons.sync_rounded, iconColor: AppTheme.warning,
                  title: _am(context) ? 'በሰው ሃብት ግምገማ ላይ' : 'HR Review',
                  subtitle: _am(context) ? 'በሰው ሃብት ክፍል እየተገመገመ ነው።' : 'Being reviewed by the HR department.',
                  isInProgress: true, showLine: true, isDark: isDark,
                ),
                _TimelineStep(
                  icon: Icons.lock_rounded, iconColor: AppTheme.gray400,
                  title: _am(context) ? 'የመጨረሻ ውሳኔ' : 'Final Decision',
                  subtitle: _am(context) ? 'ሁለተኛ ፀደቅ ወይም ውድቅ ይጠበቃል።' : 'Awaiting final approval or rejection.',
                  showLine: false, isDark: isDark,
                ),
              ]),
            ),
            const SizedBox(height: 24),

            // Info box
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppTheme.info.withValues(alpha: 0.07),
                border: Border.all(color: AppTheme.info.withValues(alpha: 0.2)),
                borderRadius: AppTheme.radiusM,
              ),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Icon(Icons.info_outline_rounded, color: AppTheme.info, size: 18),
                const SizedBox(width: 10),
                Expanded(child: Text(
                  _am(context)
                      ? 'ጥያቄዎች በ1–2 የሥራ ቀናት ውስጥ ይገምገማሉ። ውሳኔ ሲሰጥ ይሳወቁዎታል።'
                      : 'Requests are typically reviewed within 1–2 business days. You will be notified once a decision has been made.',
                  style: const TextStyle(fontSize: 12, color: AppTheme.gray500, height: 1.5),
                )),
              ]),
            ),
          ],
        ),
      ),
    );
  }

  DateTime? _parseDate(dynamic val) {
    if (val == null) return null;
    try {
      return DateTime.parse(val.toString());
    } catch (_) {
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Leave Detail Screen (Approved / Rejected)
// ─────────────────────────────────────────────────────────────────────────────

class _LeaveDetailScreen extends StatelessWidget {
  final dynamic leave;
  const _LeaveDetailScreen({required this.leave});

  @override
  Widget build(BuildContext context) {
    final isDark    = Theme.of(context).brightness == Brightness.dark;
    final s         = AppStrings.of(context);
    final status    = ((leave['status'] as String?) ?? '').toUpperCase();
    final leaveType = (leave['leaveType'] as String?) ?? 'Leave';
    final reason    = (leave['reason'] as String?) ?? '—';
    final startDate = _parseDate(leave['startDate']);
    final endDate   = _parseDate(leave['endDate']);
    final fmt = DateFormat('dd MMM yyyy');
    final isApproved = status == 'APPROVED';
    final statusColor = isApproved ? AppTheme.success : AppTheme.danger;
    final surface = isDark ? const Color(0xFF18212F) : AppTheme.surface;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF111827) : AppTheme.bg,
      appBar: _buildAppBar(context, 'Leave Details', isDark),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(18),
        child: Container(
          decoration: BoxDecoration(
            color: surface,
            borderRadius: AppTheme.radiusL,
            boxShadow: [AppTheme.cardShadow],
            border: Border.all(
                color: isDark ? Colors.white10 : AppTheme.border),
          ),
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Container(
                  width: 48, height: 48,
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    isApproved
                        ? Icons.check_circle_rounded
                        : Icons.cancel_rounded,
                    color: statusColor,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(leaveType,
                          style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: isDark ? Colors.white : AppTheme.primary)),
                      const SizedBox(height: 4),
                      StatusBadge(label: status, color: statusColor),
                    ],
                  ),
                ),
              ]),
              const SizedBox(height: 20),
              Divider(color: isDark ? Colors.white10 : AppTheme.gray100),
              const SizedBox(height: 16),
              InfoTile(icon: Icons.calendar_today_rounded, label: s.startDate,
                  value: startDate != null ? fmt.format(startDate) : '—'),
              InfoTile(icon: Icons.calendar_month_rounded, label: s.endDate,
                  value: endDate != null ? fmt.format(endDate) : '—'),
              InfoTile(icon: Icons.notes_rounded, label: _am(context) ? 'ምክንያት' : 'Reason', value: reason),
              if (isApproved) ...[
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppTheme.success.withValues(alpha: 0.07),
                    borderRadius: AppTheme.radiusS,
                    border: Border.all(color: AppTheme.success.withValues(alpha: 0.25)),
                  ),
                  child: Row(children: [
                    const Icon(Icons.verified_rounded, color: AppTheme.success, size: 16),
                    const SizedBox(width: 8),
                    Text(s.approvedByHR,
                        style: const TextStyle(fontSize: 13, color: AppTheme.success, fontWeight: FontWeight.w600)),
                  ]),
                ),
              ] else ...[
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppTheme.danger.withValues(alpha: 0.07),
                    borderRadius: AppTheme.radiusS,
                    border: Border.all(color: AppTheme.danger.withValues(alpha: 0.25)),
                  ),
                  child: Row(children: [
                    const Icon(Icons.cancel_rounded, color: AppTheme.danger, size: 16),
                    const SizedBox(width: 8),
                    Text(s.notApproved,
                        style: const TextStyle(fontSize: 13, color: AppTheme.danger, fontWeight: FontWeight.w600)),
                  ]),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  DateTime? _parseDate(dynamic val) {
    if (val == null) return null;
    try {
      return DateTime.parse(val.toString());
    } catch (_) {
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Small reusable widgets (leave-specific)
// ─────────────────────────────────────────────────────────────────────────────

class _FormLabel extends StatelessWidget {
  final String text;
  const _FormLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w700,
        color: AppTheme.gray500,
        letterSpacing: 0.3,
      ),
    );
  }
}

class _BalanceChip extends StatelessWidget {
  final String label;
  final int value;
  final Color color;
  const _BalanceChip({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('$value',
            style: TextStyle(
                fontSize: 22, fontWeight: FontWeight.w900, color: color)),
        Text(label,
            style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: color.withValues(alpha: 0.7))),
      ],
    );
  }
}

class _DateChip extends StatelessWidget {
  final String label;
  final DateTime? date;
  final DateFormat fmt;
  final bool isDark;
  final VoidCallback onTap;

  const _DateChip({
    required this.label,
    required this.date,
    required this.fmt,
    required this.isDark,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final hasDate = date != null;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: isDark
              ? const Color(0xFF223042)
              : (hasDate
                  ? AppTheme.accent.withValues(alpha: 0.07)
                  : AppTheme.gray100),
          borderRadius: AppTheme.radiusM,
          border: Border.all(
            color: hasDate
                ? AppTheme.accent.withValues(alpha: 0.4)
                : (isDark ? Colors.white12 : AppTheme.gray200),
          ),
        ),
        child: Row(
          children: [
            Icon(
              Icons.calendar_today_rounded,
              size: 14,
              color: hasDate ? AppTheme.accent : AppTheme.gray400,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                hasDate ? fmt.format(date!) : label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: hasDate ? FontWeight.w700 : FontWeight.w500,
                  color: hasDate
                      ? (isDark ? Colors.white : AppTheme.primary)
                      : AppTheme.gray400,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _UploadSection extends StatelessWidget {
  final bool uploading;
  final String? uploadedFileName;
  final bool isDark;
  final VoidCallback onPickDoc;
  final VoidCallback onRemove;

  const _UploadSection({
    required this.uploading,
    required this.uploadedFileName,
    required this.isDark,
    required this.onPickDoc,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    if (uploading) {
      return Container(
        height: 72,
        decoration: BoxDecoration(
          border: Border.all(color: AppTheme.gray200),
          borderRadius: AppTheme.radiusM,
        ),
        child: const Center(
            child: CircularProgressIndicator(
                color: AppTheme.accent, strokeWidth: 2.5)),
      );
    }

    if (uploadedFileName != null) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: AppTheme.success.withValues(alpha: 0.07),
          border: Border.all(color: AppTheme.success.withValues(alpha: 0.3)),
          borderRadius: AppTheme.radiusM,
        ),
        child: Row(children: [
          const Icon(Icons.check_circle_rounded,
              color: AppTheme.success, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              uploadedFileName!,
              style: const TextStyle(
                  fontSize: 13,
                  color: AppTheme.success,
                  fontWeight: FontWeight.w600),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          GestureDetector(
            onTap: onRemove,
            child: const Icon(Icons.close_rounded,
                size: 16, color: AppTheme.gray400),
          ),
        ]),
      );
    }

    return GestureDetector(
      onTap: onPickDoc,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 20),
        decoration: BoxDecoration(
          border: Border.all(
              color: isDark ? Colors.white12 : AppTheme.gray200),
          borderRadius: AppTheme.radiusM,
          color: isDark
              ? const Color(0xFF18212F)
              : AppTheme.gray100,
        ),
        child: Column(children: [
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Container(
              padding: const EdgeInsets.all(9),
              decoration: BoxDecoration(
                color: AppTheme.accent.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.camera_alt_rounded,
                  color: AppTheme.accent, size: 18),
            ),
            const SizedBox(width: 12),
            Container(
              padding: const EdgeInsets.all(9),
              decoration: BoxDecoration(
                color: AppTheme.info.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.attach_file_rounded,
                  color: AppTheme.info, size: 18),
            ),
          ]),
          const SizedBox(height: 10),
          const Text('Tap to upload document',
              style: TextStyle(
                  fontSize: 13,
                  color: AppTheme.gray500,
                  fontWeight: FontWeight.w600)),
          const SizedBox(height: 3),
          const Text('PDF, JPG, PNG supported',
              style: TextStyle(fontSize: 11, color: AppTheme.gray400)),
        ]),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline Step widget
// ─────────────────────────────────────────────────────────────────────────────

class _TimelineStep extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final String subtitle;
  final bool isCompleted;
  final bool isInProgress;
  final bool showLine;
  final bool isDark;

  const _TimelineStep({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    this.isCompleted = false,
    this.isInProgress = false,
    required this.showLine,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
              color: iconColor.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: isInProgress
                ? Padding(
                    padding: const EdgeInsets.all(10),
                    child: CircularProgressIndicator(
                        strokeWidth: 2.5, color: iconColor),
                  )
                : Icon(icon, color: iconColor, size: 20),
          ),
          if (showLine)
            Container(
              width: 2, height: 36,
              color: isDark ? Colors.white10 : AppTheme.gray200,
            ),
        ]),
        const SizedBox(width: 14),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(top: 8, bottom: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: isCompleted || isInProgress
                        ? (isDark ? Colors.white : AppTheme.primary)
                        : AppTheme.gray400,
                  ),
                ),
                const SizedBox(height: 2),
                Text(subtitle,
                    style: const TextStyle(
                        fontSize: 12, color: AppTheme.gray500)),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pulsing icon animation
// ─────────────────────────────────────────────────────────────────────────────

class _PulsingIcon extends StatefulWidget {
  final IconData icon;
  final Color color;
  final double size;
  const _PulsingIcon({required this.icon, required this.color, required this.size});

  @override
  State<_PulsingIcon> createState() => _PulsingIconState();
}

class _PulsingIconState extends State<_PulsingIcon>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 1200))
      ..repeat(reverse: true);
    _scale = Tween<double>(begin: 0.95, end: 1.05).animate(
        CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: _scale,
      child: Container(
        width: widget.size,
        height: widget.size,
        decoration: BoxDecoration(
          color: widget.color.withValues(alpha: 0.12),
          shape: BoxShape.circle,
        ),
        child: Icon(widget.icon, color: widget.color, size: widget.size * 0.5),
      ),
    );
  }
}

// ── Helper: is Amharic language active ────────────────────────────────────────
bool _am(BuildContext context) => AppStrings.of(context).isAmharic;

// ─────────────────────────────────────────────────────────────────────────────
// Shared AppBar builder
// ─────────────────────────────────────────────────────────────────────────────

PreferredSizeWidget _buildAppBar(
    BuildContext context, String title, bool isDark) {
  return AppBar(
    leading: IconButton(
      icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
      onPressed: () => Navigator.pop(context),
    ),
    title: Text(title),
    backgroundColor: isDark ? const Color(0xFF18212F) : AppTheme.surface,
    foregroundColor: isDark ? Colors.white : AppTheme.primary,
    elevation: 0,
    bottom: PreferredSize(
      preferredSize: const Size.fromHeight(1),
      child: Divider(
          height: 1,
          color: isDark ? Colors.white10 : AppTheme.border),
    ),
  );
}
