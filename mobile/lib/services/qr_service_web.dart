// Web implementation using JS interop
// ignore: deprecated_member_use
import 'dart:js' as js;

void startQrScan(void Function(String) onResult) {
  try {
    js.context.callMethod('_qrStart', [
      (dynamic qrData) {
        onResult(qrData?.toString() ?? '__cancelled__');
      }
    ]);
  } catch (e) {
    onResult('__error__:$e');
  }
}

void stopQrScan() {
  try {
    js.context.callMethod('_qrStop', []);
  } catch (_) {}
}
