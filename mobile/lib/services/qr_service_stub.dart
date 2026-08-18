// Stub for non-web platforms — QR camera scanning not available
void startQrScan(void Function(String) onResult) {
  onResult('__not_supported__');
}

void stopQrScan() {}
