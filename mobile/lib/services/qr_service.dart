// Conditional import: web uses JS interop, native uses stub
export 'qr_service_stub.dart'
    if (dart.library.js) 'qr_service_web.dart';
