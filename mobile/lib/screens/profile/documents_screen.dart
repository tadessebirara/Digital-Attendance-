import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../utils/app_theme.dart';
import '../../widgets/app_widgets.dart';
import 'package:provider/provider.dart';

/// Displays documents that HR/Admin have uploaded for the current employee.
/// Read-only — employees can view and open documents but cannot upload or delete.
class EmployeeDocumentsScreen extends StatefulWidget {
  const EmployeeDocumentsScreen({super.key});

  @override
  State<EmployeeDocumentsScreen> createState() => _EmployeeDocumentsScreenState();
}

class _EmployeeDocumentsScreenState extends State<EmployeeDocumentsScreen> {
  bool _loading = true;
  List<Map<String, dynamic>> _docs = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final auth = context.read<AuthProvider>();
      final userId = auth.user?['id'];
      if (userId == null) {
        setState(() { _error = 'Could not identify user.'; _loading = false; });
        return;
      }
      final res = await ApiService.instance.get('/uploads/employee-documents/$userId');
      if (res['success'] == true) {
        final data = res['data'];
        setState(() {
          _docs = List<Map<String, dynamic>>.from(
            (data as List? ?? []).map((e) => Map<String, dynamic>.from(e as Map)),
          );
          _loading = false;
        });
      } else {
        setState(() { _error = res['error']?.toString() ?? 'Failed to load documents'; _loading = false; });
      }
    } catch (e) {
      setState(() { _error = 'Network error. Please try again.'; _loading = false; });
    }
  }

  Future<void> _openDocument(String url) async {
    try {
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        if (mounted) showAppSnack(context, 'Cannot open this file', isError: true);
      }
    } catch (_) {
      if (mounted) showAppSnack(context, 'Failed to open document', isError: true);
    }
  }

  IconData _iconFor(String? docType) {
    switch (docType) {
      case 'CV_RESUME':            return Icons.description_rounded;
      case 'EMPLOYMENT_CONTRACT':  return Icons.assignment_rounded;
      case 'NATIONAL_ID':          return Icons.badge_rounded;
      case 'CERTIFICATE':          return Icons.workspace_premium_rounded;
      default:                     return Icons.insert_drive_file_rounded;
    }
  }

  Color _colorFor(String? docType) {
    switch (docType) {
      case 'CV_RESUME':            return const Color(0xFF3B82F6);
      case 'EMPLOYMENT_CONTRACT':  return const Color(0xFF059669);
      case 'NATIONAL_ID':          return const Color(0xFFF59E0B);
      case 'CERTIFICATE':          return const Color(0xFF7C3AED);
      default:                     return AppTheme.gray500;
    }
  }

  String _labelFor(String? docType) {
    switch (docType) {
      case 'CV_RESUME':            return 'CV / Resume';
      case 'EMPLOYMENT_CONTRACT':  return 'Employment Contract';
      case 'NATIONAL_ID':          return 'National ID';
      case 'CERTIFICATE':          return 'Certificate';
      default:                     return 'Document';
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : AppTheme.bg,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, size: 18,
              color: isDark ? Colors.white : AppTheme.primary),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          'My Documents',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: isDark ? Colors.white : AppTheme.primary,
          ),
        ),
        actions: [
          IconButton(
            icon: Icon(Icons.refresh_rounded, size: 20,
                color: isDark ? AppTheme.gray400 : AppTheme.gray600),
            onPressed: _load,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.error_outline_rounded, size: 48, color: AppTheme.danger),
                        const SizedBox(height: 16),
                        Text(_error!, textAlign: TextAlign.center,
                            style: const TextStyle(color: AppTheme.gray500)),
                        const SizedBox(height: 24),
                        ElevatedButton(onPressed: _load, child: const Text('Retry')),
                      ],
                    ),
                  ),
                )
              : _docs.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.folder_open_rounded, size: 64,
                                color: isDark ? AppTheme.gray600 : AppTheme.gray300),
                            const SizedBox(height: 16),
                            Text(
                              'No documents yet',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                                color: isDark ? AppTheme.gray400 : AppTheme.gray600,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'HR will upload your documents here.\nCheck back later.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 14,
                                color: isDark ? AppTheme.gray500 : AppTheme.gray400,
                                height: 1.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      color: AppTheme.accent,
                      child: ListView.separated(
                        padding: const EdgeInsets.all(20),
                        itemCount: _docs.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 12),
                        itemBuilder: (context, i) {
                          final doc = _docs[i];
                          final docType  = doc['doc_type'] as String?;
                          final label    = doc['label'] as String? ?? _labelFor(docType);
                          final fileName = doc['file_name'] as String? ?? '';
                          final fileUrl  = doc['file_url'] as String? ?? '';
                          final uploadedBy = doc['uploaded_by_name'] as String? ?? 'HR';
                          final createdAt  = doc['created_at'] as String?;

                          final date = createdAt != null
                              ? _formatDate(createdAt)
                              : '';

                          final color = _colorFor(docType);
                          final icon  = _iconFor(docType);

                          return AppCard(
                            padding: EdgeInsets.zero,
                            color: isDark ? const Color(0xFF18212F) : AppTheme.surface,
                            child: InkWell(
                              onTap: fileUrl.isNotEmpty ? () => _openDocument(fileUrl) : null,
                              borderRadius: AppTheme.radiusL,
                              child: Padding(
                                padding: const EdgeInsets.all(16),
                                child: Row(
                                  children: [
                                    Container(
                                      width: 48,
                                      height: 48,
                                      decoration: BoxDecoration(
                                        color: color.withValues(alpha: 0.12),
                                        borderRadius: AppTheme.radiusM,
                                      ),
                                      child: Icon(icon, color: color, size: 24),
                                    ),
                                    const SizedBox(width: 14),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            label,
                                            style: TextStyle(
                                              fontSize: 15,
                                              fontWeight: FontWeight.w700,
                                              color: isDark ? Colors.white : AppTheme.gray900,
                                            ),
                                          ),
                                          const SizedBox(height: 3),
                                          Text(
                                            fileName,
                                            style: TextStyle(
                                              fontSize: 12,
                                              color: isDark ? AppTheme.gray400 : AppTheme.gray500,
                                            ),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                          const SizedBox(height: 4),
                                          Row(
                                            children: [
                                              Icon(Icons.person_outline_rounded, size: 11,
                                                  color: isDark ? AppTheme.gray500 : AppTheme.gray400),
                                              const SizedBox(width: 4),
                                              Text(
                                                uploadedBy,
                                                style: TextStyle(fontSize: 11,
                                                    color: isDark ? AppTheme.gray500 : AppTheme.gray400),
                                              ),
                                              if (date.isNotEmpty) ...[
                                                const SizedBox(width: 8),
                                                Icon(Icons.calendar_today_rounded, size: 11,
                                                    color: isDark ? AppTheme.gray500 : AppTheme.gray400),
                                                const SizedBox(width: 4),
                                                Text(
                                                  date,
                                                  style: TextStyle(fontSize: 11,
                                                      color: isDark ? AppTheme.gray500 : AppTheme.gray400),
                                                ),
                                              ],
                                            ],
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Icon(Icons.open_in_new_rounded, size: 18,
                                        color: isDark ? AppTheme.gray500 : AppTheme.gray400),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
    );
  }

  String _formatDate(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      return '${dt.day}/${dt.month}/${dt.year}';
    } catch (_) {
      return '';
    }
  }
}
