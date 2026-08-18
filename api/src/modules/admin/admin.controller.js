const { query } = require("../../config/database");
const logger = require("../../utils/logger");
const { auditLog } = require("../../services/audit.service");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const QRCode = require("qrcode");

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Load all settings as a plain object. */
async function loadSettings() {
  const { rows } = await query(
    "SELECT setting_key, setting_value FROM system_settings",
  );
  return rows.reduce((acc, r) => {
    acc[r.setting_key] = r.setting_value;
    return acc;
  }, {});
}

/** Upsert a single key. */
async function saveSetting(key, value, userId) {
  await query(
    `INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (setting_key)
     DO UPDATE SET setting_value = $2, updated_by = $3, updated_at = NOW()`,
    [key, String(value), userId],
  );
}

async function loadSettingMap(keys) {
  const { rows } = await query(
    `SELECT setting_key, setting_value
     FROM system_settings
     WHERE setting_key = ANY($1::text[])`,
    [keys],
  );
  return rows.reduce((acc, row) => {
    acc[row.setting_key] = row.setting_value;
    return acc;
  }, {});
}

function getQrSecret(config) {
  return config.qr_secret && config.qr_secret.length > 0
    ? config.qr_secret
    : process.env.QR_SECRET || process.env.DEVICE_SECRET;
}

// ── Branded QR generator ──────────────────────────────────────────────────────
// Generates a QR code as an SVG data URL with the admin's company branding
// baked into the centre. Uses company_name, company_logo_url, and primary_color
// from system_settings so the QR reflects the admin's branding choices.
//
// If logoUrl is a valid https:// URL the image is embedded via <image xlink:href>.
// If only a name is set, the first letter + full name are shown as text.
// Falls back to "ALYAH / TECHNOLOGIES" if no settings are configured.
async function buildBrandedQrDataUrl(token, branding = {}) {
  const {
    companyName  = 'ALYAH',
    logoUrl      = '',
    primaryColor = '#1B3A6B',
    officeName   = '',
  } = branding;

  // Derive a readable secondary color (lighter shade of primary)
  const primary   = primaryColor.startsWith('#') ? primaryColor : '#1B3A6B';
  // Simple lightening: parse hex, blend toward white at 50%
  let accent = '#29ABE2';
  try {
    const r = parseInt(primary.slice(1, 3), 16);
    const g = parseInt(primary.slice(3, 5), 16);
    const b = parseInt(primary.slice(5, 7), 16);
    // Lighten by mixing with a sky-blue tint
    const lr = Math.min(255, Math.round(r * 0.4 + 41 * 0.6));
    const lg = Math.min(255, Math.round(g * 0.4 + 171 * 0.6));
    const lb = Math.min(255, Math.round(b * 0.4 + 226 * 0.6));
    accent = `#${lr.toString(16).padStart(2,'0')}${lg.toString(16).padStart(2,'0')}${lb.toString(16).padStart(2,'0')}`;
  } catch (_) {}

  // Sanitize company name — strip anything that could break SVG text
  const safeName = (companyName || 'ALYAH')
    .replace(/[<>"&]/g, '')
    .toUpperCase()
    .trim()
    .slice(0, 20); // cap length so it fits

  // Split into two lines if longer than 8 chars: "ALYAH" / "TECHNOLOGIES"
  const nameParts = safeName.split(/\s+/);
  const line1 = nameParts[0] || 'ALYAH';
  const line2 = nameParts.slice(1).join(' ') || '';

  // 1. Get the raw SVG string from the qrcode library
  const rawSvg = await QRCode.toString(token, {
    type: 'svg',
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 400,
    color: { dark: '#000000', light: '#ffffff' },
  });

  // 2. Parse the actual viewBox to get true dimensions
  const vbMatch = rawSvg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  const vbW = vbMatch ? parseFloat(vbMatch[1]) : 29;
  const vbH = vbMatch ? parseFloat(vbMatch[2]) : 29;
  const cx = vbW / 2;
  const cy = vbH / 2;

  // 3. Size the white card in the centre
  const rW = vbW * 0.50;
  const rH = vbH * (logoUrl && logoUrl.startsWith('https://') ? (officeName ? 0.44 : 0.38) : (officeName ? 0.34 : 0.30));
  const rX = cx - rW / 2;
  const rY = cy - rH / 2;

  let overlayContent = '';

  if (logoUrl && logoUrl.startsWith('https://')) {
    // ── Logo image path ────────────────────────────────────────────────────
    // Embed a square logo image in the upper portion, company name below
    const imgSize = rW * 0.52;
    const imgX    = cx - imgSize / 2;
    const imgY    = rY + rH * 0.06;
    const textY   = imgY + imgSize + rH * 0.10;
    const text2Y  = textY + rH * 0.14;
    const text3Y  = text2Y + rH * 0.14;

    const safeOffice = (officeName || '').replace(/[<>"&]/g, '').slice(0, 24).toUpperCase();

    overlayContent = `
  <defs>
    <clipPath id="logoClip">
      <rect x="${imgX}" y="${imgY}" width="${imgSize}" height="${imgSize}" rx="${imgSize * 0.14}"/>
    </clipPath>
  </defs>
  <rect x="${rX}" y="${rY}" width="${rW}" height="${rH}" rx="${rH * 0.08}" fill="white"
        stroke="${primary}" stroke-width="${vbW * 0.008}"/>
  <image href="${logoUrl}" x="${imgX}" y="${imgY}" width="${imgSize}" height="${imgSize}"
         clip-path="url(#logoClip)" preserveAspectRatio="xMidYMid meet"/>
  <text x="${cx}" y="${textY}"
        font-family="Arial Black, Arial, sans-serif"
        font-size="${vbW * 0.072}" font-weight="900" fill="${primary}"
        text-anchor="middle" dominant-baseline="middle">${line1}</text>
  ${line2 ? `<text x="${cx}" y="${text2Y}"
        font-family="Arial, sans-serif"
        font-size="${vbW * 0.038}" font-weight="700" fill="${accent}"
        text-anchor="middle" dominant-baseline="middle">${line2}</text>` : ''}
  ${safeOffice ? `<text x="${cx}" y="${text3Y}"
        font-family="Arial, sans-serif"
        font-size="${vbW * 0.034}" font-weight="600" fill="${primary}99"
        text-anchor="middle" dominant-baseline="middle">📍 ${safeOffice}</text>` : ''}
`;
  } else {
    // ── Text-only / initial letter path ───────────────────────────────────
    // Show a coloured initial badge + company name text
    const badgeR  = rW * 0.18;
    const badgeX  = cx;
    const badgeY  = rY + rH * 0.30;
    const initial = line1.charAt(0);
    const textY   = rY + rH * 0.68;
    const text2Y  = rY + rH * 0.83;
    const text3Y  = rY + rH * 0.96;

    // Sanitize office name
    const safeOffice = (officeName || '').replace(/[<>"&]/g, '').slice(0, 24).toUpperCase();

    overlayContent = `
  <defs>
    <linearGradient id="bGrad" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="${primary}"/>
    </linearGradient>
  </defs>
  <rect x="${rX}" y="${rY}" width="${rW}" height="${rH}" rx="${rH * 0.08}" fill="white"
        stroke="${primary}18" stroke-width="${vbW * 0.006}"/>
  <circle cx="${badgeX}" cy="${badgeY}" r="${badgeR}" fill="url(#bGrad)"/>
  <text x="${badgeX}" y="${badgeY}"
        font-family="Arial Black, Arial, sans-serif"
        font-size="${badgeR * 1.0}" font-weight="900" fill="white"
        text-anchor="middle" dominant-baseline="central">${initial}</text>
  <text x="${cx}" y="${textY}"
        font-family="Arial Black, Arial, sans-serif"
        font-size="${vbW * 0.072}" font-weight="900" fill="${primary}"
        text-anchor="middle" dominant-baseline="auto">${line1}</text>
  ${line2 ? `<text x="${cx}" y="${text2Y}"
        font-family="Arial, sans-serif"
        font-size="${vbW * 0.038}" font-weight="700" fill="${accent}"
        text-anchor="middle" dominant-baseline="auto">${line2}</text>` : ''}
  ${safeOffice ? `<text x="${cx}" y="${text3Y}"
        font-family="Arial, sans-serif"
        font-size="${vbW * 0.034}" font-weight="600" fill="${primary}99"
        text-anchor="middle" dominant-baseline="auto">📍 ${safeOffice}</text>` : ''}
`;
  }

  const overlay = `
  <!-- Branding overlay — generated from admin system settings -->
  ${overlayContent}
`;

  const brandedSvg = rawSvg.replace('</svg>', overlay + '</svg>');
  const b64 = Buffer.from(brandedSvg, 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${b64}`;
}

// ── Static QR helpers ─────────────────────────────────────────────────────────
// A static QR encodes a fixed HMAC token derived from the current qr_secret.
// It never expires on its own — it becomes invalid only when the admin rotates
// the secret (changes the password). This makes it safe to print and post.
//
// Token format (JSON string encoded in the QR):
//   { type: "static-attendance", officeId: string, sig: hex }
// where sig = HMAC-SHA256(qr_secret, "static:attendance:{officeId}")
//
// On scan the backend re-derives the expected sig from the current secret.
// If the secret has been rotated the sig won't match → QR is invalid.

function buildStaticQrToken(qrSecret, officeId = "default") {
  // Each office gets a UNIQUE derived secret = HMAC(masterSecret, "office:{officeId}")
  // This ensures Office A's QR cannot be used to check in at Office B.
  const officeSecret = crypto
    .createHmac("sha256", qrSecret)
    .update(`office:${officeId}`)
    .digest("hex");

  const payload = `static:attendance:${officeId}`;
  const sig = crypto.createHmac("sha256", officeSecret).update(payload).digest("hex");
  return JSON.stringify({ type: "static-attendance", officeId, sig });
}

async function buildQrPayload({
  officeId = "default",
  expirySeconds,
  qrSecret,
}) {
  const nonce = crypto.randomBytes(32).toString("hex");
  const timestamp = Date.now();
  const payloadObj = { nonce, timestamp, officeId, type: "attendance" };
  const payloadStr = JSON.stringify(payloadObj, Object.keys(payloadObj).sort());
  const signature = crypto
    .createHmac("sha256", qrSecret)
    .update(payloadStr)
    .digest("hex");
  const qrToken = JSON.stringify({ ...payloadObj, sig: signature });

  await query(
    `INSERT INTO qr_codes (code, expires_at, is_active, created_at)
     VALUES ($1, NOW() + ($2 || ' seconds')::interval, true, NOW())`,
    [nonce, expirySeconds],
  );

  const qrImage = await QRCode.toDataURL(qrToken);
  return {
    qrCode: qrImage,
    qrToken,
    officeId,
    expiresIn: expirySeconds,
    generatedAt: timestamp,
  };
}

// ── Public config (no auth) ───────────────────────────────────────────────────
// Returns only safe, non-secret fields consumed by the mobile app on startup.
const getPublicConfig = async (req, res) => {
  try {
    const s = await loadSettings();

    // Load all active offices for geofencing
    const { rows: offices } = await query(
      `SELECT id, name, latitude, longitude, radius_meters
       FROM offices
       WHERE is_active = TRUE
       ORDER BY name`
    );

    res.json({
      success: true,
      data: {
        companyName: s.company_name || "Alyah Smart Attendance",
        logoUrl: s.company_logo_url || "",
        primaryColor: s.primary_color || "#0F172A",
        qrEnabled: s.qr_enabled !== "false",
        // Tell the mobile app whether employees must enter a password when scanning
        qrAttendancePasswordRequired: !!(
          s.qr_attendance_password_hash &&
          s.qr_attendance_password_hash.trim().length > 10
        ),
        qrExpirySeconds: parseInt(s.qr_expiry_seconds || "60", 10),
        gpsAccuracyWarnM: parseInt(s.gps_accuracy_warn_m || "50", 10),
        gpsAccuracyMaxM: parseInt(s.gps_accuracy_max_m || "100", 10),
        // Legacy global geofence (fallback)
        geofence: {
          lat: parseFloat(s.geofence_lat || "0"),
          lng: parseFloat(s.geofence_lng || "0"),
          radiusM: parseInt(s.geofence_radius_m || "100", 10),
        },
        // Multi-office geofencing
        // Filter out placeholder offices with 0,0 coordinates (not yet configured)
        offices: offices
          .filter(o => !(parseFloat(o.latitude) === 0 && parseFloat(o.longitude) === 0))
          .map(o => ({
            id: o.id,
            name: o.name,
            lat: parseFloat(o.latitude),
            lng: parseFloat(o.longitude),
            radiusM: parseInt(o.radius_meters, 10) || 200,
          })),
      },
    });
  } catch (error) {
    logger.error("getPublicConfig error:", error);
    res.status(500).json({ success: false, error: "Failed to load config" });
  }
};

// ── Admin: get all settings ───────────────────────────────────────────────────
const getSystemSettings = async (req, res) => {
  try {
    const s = await loadSettings();
    // Never expose the raw QR secret — return a masked indicator instead
    const hasQrSecret = !!(s.qr_secret && s.qr_secret.length > 0);
    res.json({
      success: true,
      data: {
        companyName: s.company_name || "",
        logoUrl: s.company_logo_url || "",
        primaryColor: s.primary_color || "#0F172A",
        qrEnabled: s.qr_enabled !== "false",
        qrExpirySeconds: parseInt(s.qr_expiry_seconds || "60", 10),
        qrSecretSet: hasQrSecret,
        qrGenerationPasswordSet: !!(
          s.qr_generation_password_hash &&
          s.qr_generation_password_hash.length > 0
        ),
        qrAttendancePasswordSet: !!(
          s.qr_attendance_password_hash &&
          s.qr_attendance_password_hash.length > 0
        ),
        autoAbsentAfterMinutes: parseInt(s.auto_absent_after_minutes || "30", 10),
        missedCheckoutAfterMinutes: parseInt(s.missed_checkout_after_minutes || "60", 10),
        autoCheckoutEnabled: s.auto_checkout_enabled === "true",
        autoCheckoutGraceMinutes: parseInt(s.auto_checkout_grace_minutes || "30", 10),
        halfDayAfterMinutes: parseInt(s.half_day_after_minutes || "120", 10),
        gpsAccuracyWarnM: parseInt(s.gps_accuracy_warn_m || "50", 10),
        gpsAccuracyMaxM: parseInt(s.gps_accuracy_max_m || "100", 10),
        geofence: {
          lat: parseFloat(s.geofence_lat || "0"),
          lng: parseFloat(s.geofence_lng || "0"),
          radiusM: parseInt(s.geofence_radius_m || "100", 10),
        },
      },
    });
  } catch (error) {
    logger.error("getSystemSettings error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch settings" });
  }
};

// ── Admin: update settings ────────────────────────────────────────────────────
const updateSystemSettings = async (req, res) => {
  try {
    const {
      companyName,
      logoUrl,
      primaryColor,
      qrEnabled,
      qrExpirySeconds,
      qrGenerationPassword,
      qrAttendancePassword,
      gpsAccuracyWarnM,
      gpsAccuracyMaxM,
      geofenceLat,
      geofenceLng,
      geofenceRadiusM,
      autoAbsentAfterMinutes,
      missedCheckoutAfterMinutes,
      autoCheckoutEnabled,
      autoCheckoutGraceMinutes,
      halfDayAfterMinutes,
    } = req.body;

    const userId = req.user.id;
    const old = await loadSettings();

    const updates = [
      ["company_name", companyName],
      ["company_logo_url", logoUrl],
      ["primary_color", primaryColor],
      ["qr_enabled", qrEnabled != null ? String(qrEnabled) : null],
      ["qr_expiry_seconds", qrExpirySeconds],
      ["gps_accuracy_warn_m", gpsAccuracyWarnM],
      ["gps_accuracy_max_m", gpsAccuracyMaxM],
      ["geofence_lat", geofenceLat],
      ["geofence_lng", geofenceLng],
      ["geofence_radius_m", geofenceRadiusM],
      ["auto_absent_after_minutes", autoAbsentAfterMinutes],
      ["missed_checkout_after_minutes", missedCheckoutAfterMinutes],
      ["auto_checkout_enabled", autoCheckoutEnabled != null ? String(autoCheckoutEnabled) : null],
      ["auto_checkout_grace_minutes", autoCheckoutGraceMinutes],
      ["half_day_after_minutes", halfDayAfterMinutes],
    ].filter(([, v]) => v != null);

    for (const [key, value] of updates) {
      await saveSetting(key, value, userId);
    }

    if (
      typeof qrGenerationPassword === "string" &&
      qrGenerationPassword.trim().length > 0
    ) {
      const hashedPassword = await bcrypt.hash(qrGenerationPassword.trim(), 12);
      await saveSetting("qr_generation_password_hash", hashedPassword, userId);
      updates.push(["qr_generation_password_hash", "[UPDATED]"]);
    }

    if (
      typeof qrAttendancePassword === "string" &&
      qrAttendancePassword.trim().length > 0
    ) {
      const hashed = await bcrypt.hash(qrAttendancePassword.trim(), 12);
      await saveSetting("qr_attendance_password_hash", hashed, userId);
      const { rows: verRows } = await query(
        `SELECT setting_value FROM system_settings WHERE setting_key = 'qr_password_version'`
      );
      const nextVer = String(parseInt(verRows[0]?.setting_value || '1', 10) + 1);
      await saveSetting("qr_password_version", nextVer, userId);
      updates.push(["qr_attendance_password_hash", "[UPDATED]"]);
    }

    await auditLog(
      userId,
      "SYSTEM_SETTINGS_UPDATED",
      "system_settings",
      null,
      {
        changed: updates.map(([k]) => k),
        old: Object.fromEntries(updates.map(([k]) => [k, old[k]])),
      },
      req,
    );

    // Notify all connected clients to refresh their config
    const io = req.app.get("io");
    if (io) io.emit("config:update");

    // If branding fields changed and a QR secret exists, regenerate the QR
    // so the centre image immediately reflects the new logo/color/name.
    const brandingChanged = updates.some(([k]) =>
      ['company_name', 'company_logo_url', 'primary_color'].includes(k)
    );
    if (brandingChanged) {
      try {
        const qrSettings = await loadSettingMap(['qr_secret', 'qr_attendance_password_plain', 'company_name', 'company_logo_url', 'primary_color']);
        if (qrSettings.qr_secret && qrSettings.qr_attendance_password_plain) {
          const derivedSecret = crypto
            .createHmac("sha256", "alyah-qr-salt-v1")
            .update(qrSettings.qr_attendance_password_plain)
            .digest("hex");
          // Only regenerate if the stored secret still matches (password unchanged)
          if (derivedSecret === qrSettings.qr_secret) {
            // no-op: secret still valid, branding embedded on next QR view/preview
            // The previewQrForPassword endpoint always reads fresh branding, so
            // the SystemSettings page will show the updated QR on next tab switch.
          }
        }
      } catch (_) { /* non-critical — QR still works, just has old branding until regenerated */ }
    }

    res.json({ success: true, message: "Settings saved" });
  } catch (error) {
    logger.error("updateSystemSettings error:", error);
    res.status(500).json({ success: false, error: "Failed to save settings" });
  }
};

const generateProtectedQrCode = async (req, res) => {
  try {
    const { password, officeId } = req.body || {};
    const settings = await loadSettingMap([
      "qr_secret",
      "qr_expiry_seconds",
      "qr_enabled",
      "qr_generation_password_hash",
    ]);

    if (settings.qr_enabled === "false") {
      return res
        .status(403)
        .json({ success: false, error: "QR check-in is currently disabled" });
    }

    let qrSecret = getQrSecret(settings);
    // Auto-generate and persist a qr_secret if none exists yet
    if (!qrSecret) {
      qrSecret = crypto.randomBytes(32).toString("hex");
      await saveSetting("qr_secret", qrSecret, req.user.id);
      logger.info("[Admin] Auto-generated initial QR secret on first QR generation");
    }

    const savedHash = settings.qr_generation_password_hash;
    if (savedHash && savedHash.length > 0) {
      if (typeof password !== "string" || password.trim().length === 0) {
        return res
          .status(400)
          .json({
            success: false,
            error: "QR generation password is required",
          });
      }
      const ok = await bcrypt.compare(password.trim(), savedHash);
      if (!ok) {
        return res
          .status(403)
          .json({ success: false, error: "Invalid QR generation password" });
      }
    }

    const expirySeconds = parseInt(settings.qr_expiry_seconds || "60", 10);
    const data = await buildQrPayload({
      officeId:
        typeof officeId === "string" && officeId.trim()
          ? officeId.trim()
          : "default",
      expirySeconds,
      qrSecret,
    });

    await auditLog(
      req.user.id,
      "QR_CODE_GENERATED",
      "system_settings",
      null,
      {
        officeId: data.officeId,
        expiresIn: data.expiresIn,
        passwordProtected: !!savedHash,
      },
      req,
    );

    res.json({ success: true, data });
  } catch (error) {
    logger.error("generateProtectedQrCode error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to generate QR code" });
  }
};

// ── Admin: get static QR code ─────────────────────────────────────────────────
// Returns the current static QR image (derived from the current qr_secret).
// The QR is safe to print — it stays valid until the admin rotates the secret.
const getStaticQRCode = async (req, res) => {
  try {
    const settings = await loadSettingMap([
      "qr_secret",
      "qr_enabled",
      "qr_generation_password_hash",
    ]);

    if (settings.qr_enabled === "false") {
      return res
        .status(403)
        .json({ success: false, error: "QR check-in is currently disabled" });
    }

    let qrSecret = getQrSecret(settings);
    // Auto-generate and persist a qr_secret if none exists yet.
    // This ensures the QR always works on first use without manual setup.
    if (!qrSecret) {
      qrSecret = crypto.randomBytes(32).toString("hex");
      await saveSetting("qr_secret", qrSecret, req.user.id);
      logger.info("[Admin] Auto-generated initial QR secret on first QR view");
    }

    // Optional: password-protect viewing the static QR
    const { password, officeId } = req.query;
    const savedHash = settings.qr_generation_password_hash;
    if (savedHash && savedHash.length > 0) {
      if (!password || typeof password !== "string") {
        return res.status(400).json({
          success: false,
          error: "QR generation password required",
          code: "PASSWORD_REQUIRED",
        });
      }
      const ok = await bcrypt.compare(password.trim(), savedHash);
      if (!ok) {
        return res
          .status(403)
          .json({ success: false, error: "Invalid QR generation password" });
      }
    }

    const resolvedOfficeId =
      typeof officeId === "string" && officeId.trim() ? officeId.trim() : "default";

    const token = buildStaticQrToken(qrSecret, resolvedOfficeId);
    const qrImage = await QRCode.toDataURL(token, {
      errorCorrectionLevel: "H", // high — survives printing damage
      margin: 2,
      width: 400,
    });

    await auditLog(
      req.user.id,
      "STATIC_QR_VIEWED",
      "system_settings",
      null,
      { officeId: resolvedOfficeId, passwordProtected: !!savedHash },
      req,
    );

    res.json({
      success: true,
      data: {
        qrCode: qrImage,   // base64 PNG — display or print
        officeId: resolvedOfficeId,
        note: "This QR code is permanent until you rotate the QR secret.",
      },
    });
  } catch (error) {
    logger.error("getStaticQRCode error:", error);
    res.status(500).json({ success: false, error: "Failed to generate static QR code" });
  }
};

// ── Admin: set QR password and regenerate secret from it ─────────────────────
// The qr_secret is derived from the admin's password using HMAC.
// This means the password IS the secret — change password = new QR.
// GET with ?password= returns a preview PNG without saving anything.
// POST saves the password hash + derived secret permanently.
const setQrPassword = async (req, res) => {
  try {
    const { password } = req.body || {};
    if (typeof password !== "string" || password.trim().length === 0) {
      return res.status(400).json({ success: false, error: "Password is required" });
    }
    const pw = password.trim();

    // Derive the QR secret deterministically from the password
    // so the same password always produces the same QR
    const derivedSecret = crypto
      .createHmac("sha256", "alyah-qr-salt-v1")
      .update(pw)
      .digest("hex");

    // Save derived secret (used to sign/verify QR tokens)
    await saveSetting("qr_secret", derivedSecret, req.user.id);

    // Also save bcrypt hash of the attendance password (employees must enter when scanning)
    const hashed = await bcrypt.hash(pw, 12);
    await saveSetting("qr_attendance_password_hash", hashed, req.user.id);

    // Store plain-text password so admin can view it in the UI
    await saveSetting("qr_attendance_password_plain", pw, req.user.id);

    // Bump password version so mobile app knows to refresh
    const { rows: verRows } = await query(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'qr_password_version'`
    );
    const nextVer = String(parseInt(verRows[0]?.setting_value || "1", 10) + 1);
    await saveSetting("qr_password_version", nextVer, req.user.id);

    // Invalidate old dynamic QR nonces
    await query(`UPDATE qr_codes SET is_active = false WHERE is_active = true`);

    // Load branding so the QR centre reflects admin settings
    const brandingSettings = await loadSettingMap(['company_name', 'company_logo_url', 'primary_color']);
    const branding = {
      companyName:  brandingSettings.company_name  || 'ALYAH',
      logoUrl:      brandingSettings.company_logo_url || '',
      primaryColor: brandingSettings.primary_color || '#1B3A6B',
      officeName:   '',
    };

    // Build and return the new QR image immediately
    const token = buildStaticQrToken(derivedSecret, "default");
    const qrImage = await buildBrandedQrDataUrl(token, branding);

    await auditLog(req.user.id, "QR_PASSWORD_SET", "system_settings", null, {
      note: "QR secret derived from new password",
    }, req);

    // Notify connected clients to refresh config
    const io = req.app.get("io");
    if (io) io.emit("config:update");

    res.json({ success: true, data: { qrCode: qrImage } });
  } catch (error) {
    logger.error("setQrPassword error:", error);
    res.status(500).json({ success: false, error: "Failed to set QR password" });
  }
};

// ── Admin: get QR attendance password (plain text) ───────────────────────────
const getQrPassword = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'qr_attendance_password_plain'`
    );
    const password = rows[0]?.setting_value || null;
    if (!password) {
      return res.status(404).json({ success: false, error: "No password set" });
    }
    res.json({ success: true, data: { password } });
  } catch (error) {
    logger.error("getQrPassword error:", error);
    res.status(500).json({ success: false, error: "Failed to retrieve password" });
  }
};

// ── Admin: preview QR for a given password (no save) ─────────────────────────
const previewQrForPassword = async (req, res) => {
  try {
    const { password, officeId } = req.query;
    if (typeof password !== "string" || password.trim().length === 0) {
      return res.status(400).json({ success: false, error: "Password is required" });
    }
    const derivedSecret = crypto
      .createHmac("sha256", "alyah-qr-salt-v1")
      .update(password.trim())
      .digest("hex");

    // Resolve officeId — default if not provided
    const resolvedOfficeId =
      typeof officeId === "string" && officeId.trim() ? officeId.trim() : "default";

    // Load current branding so the preview matches what will be printed
    const brandingSettings = await loadSettingMap(['company_name', 'company_logo_url', 'primary_color']);

    // If a specific office is requested, fetch its name to include in the QR label
    let officeName = '';
    if (resolvedOfficeId !== "default") {
      try {
        const { rows } = await query(
          `SELECT name FROM offices WHERE id = $1 AND is_active = TRUE LIMIT 1`,
          [resolvedOfficeId]
        );
        officeName = rows[0]?.name || '';
      } catch (_) { /* non-critical */ }
    }

    const branding = {
      companyName:  brandingSettings.company_name  || 'ALYAH',
      logoUrl:      brandingSettings.company_logo_url || '',
      primaryColor: brandingSettings.primary_color || '#1B3A6B',
      officeName,   // passed to overlay so it appears below company name
    };

    const token = buildStaticQrToken(derivedSecret, resolvedOfficeId);
    const qrImage = await buildBrandedQrDataUrl(token, branding);

    res.json({ success: true, data: { qrCode: qrImage, officeId: resolvedOfficeId } });
  } catch (error) {
    logger.error("previewQrForPassword error:", error);
    res.status(500).json({ success: false, error: "Failed to generate preview" });
  }
};
// Generates a new cryptographically random HMAC secret.
// All previously issued QR codes (static and dynamic) become invalid immediately.
// After rotating, admin must reprint the static QR from the QR tab.
const rotateQrSecret = async (req, res) => {
  try {
    const newSecret = crypto.randomBytes(32).toString("hex");
    await saveSetting("qr_secret", newSecret, req.user.id);

    // Also invalidate any lingering dynamic nonces in qr_codes table
    await query(`UPDATE qr_codes SET is_active = false WHERE is_active = true`);

    await auditLog(
      req.user.id,
      "QR_SECRET_ROTATED",
      "system_settings",
      null,
      { reason: "manual rotation — reprint static QR required" },
      req,
    );
    logger.info(`[Admin] QR secret rotated by user ${req.user.id}`);
    res.json({
      success: true,
      message: "QR secret rotated. All existing QR codes are now invalid. Reprint the static QR from the QR tab.",
    });
  } catch (error) {
    logger.error("rotateQrSecret error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to rotate QR secret" });
  }
};

// ── Admin: invalidate all active QR codes ────────────────────────────────────
const invalidateAllQrCodes = async (req, res) => {
  try {
    const { rowCount } = await query(
      `UPDATE qr_codes SET is_active = false WHERE is_active = true`
    );
    // Also delete expired ones to keep the table clean
    const { rowCount: deleted } = await query(
      `DELETE FROM qr_codes WHERE expires_at < NOW()`
    );
    await auditLog(req.user.id, 'QR_CODES_INVALIDATED', 'system_settings', null, {
      invalidated: rowCount,
      deleted,
    }, req);
    logger.info(`[Admin] ${rowCount} QR codes invalidated, ${deleted} expired deleted by user ${req.user.id}`);
    res.json({
      success: true,
      message: `${rowCount} active QR code(s) invalidated. ${deleted} expired record(s) cleaned up.`,
      data: { invalidated: rowCount, deleted }
    });
  } catch (error) {
    logger.error('invalidateAllQrCodes error:', error);
    res.status(500).json({ success: false, error: 'Failed to invalidate QR codes' });
  }
};

// ── Admin: get active QR code count ──────────────────────────────────────────
const getQrCodeStats = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT
         COUNT(*) FILTER (WHERE is_active = true AND expires_at > NOW()) AS active,
         COUNT(*) FILTER (WHERE is_active = false OR expires_at <= NOW()) AS expired,
         COUNT(*) AS total
       FROM qr_codes`
    );
    res.json({
      success: true,
      data: {
        active: Number(rows[0].active),
        expired: Number(rows[0].expired),
        total: Number(rows[0].total),
      }
    });
  } catch (error) {
    logger.error('getQrCodeStats error:', error);
    res.status(500).json({ success: false, error: 'Failed to get QR stats' });
  }
};

// Get audit logs
const getAuditLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      userId,
      action,
      startDate,
      endDate,
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (userId) {
      whereConditions.push(`al.user_id = $${paramIndex++}`);
      params.push(parseInt(userId));
    }
    if (action) {
      whereConditions.push(`al.action ILIKE $${paramIndex++}`);
      params.push(`%${action}%`);
    }
    if (startDate) {
      whereConditions.push(`al.created_at >= $${paramIndex++}`);
      params.push(startDate);
    }
    if (endDate) {
      whereConditions.push(`al.created_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause =
      whereConditions.length > 0
        ? "WHERE " + whereConditions.join(" AND ")
        : "";

    const { rows: countRows } = await query(
      `SELECT COUNT(*) FROM audit_logs al ${whereClause}`,
      params,
    );
    const total = parseInt(countRows[0].count);

    const { rows: logs } = await query(
      `SELECT al.*, u.first_name, u.last_name
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, parseInt(limit), offset],
    );

    res.json({
      success: true,
      data: logs.map((l) => ({
        id: l.id,
        userId: l.user_id,
        user: l.first_name
          ? { firstName: l.first_name, lastName: l.last_name }
          : null,
        action: l.action,
        entity: l.entity,
        entityId: l.entity_id,
        details: l.details,
        ipAddress: l.ip_address,
        createdAt: l.created_at,
      })),
      meta: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error("Get audit logs error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch audit logs" });
  }
};

// Get security alerts
const getSecurityAlerts = async (req, res) => {
  try {
    const { rows: alerts } = await query(
      `SELECT sa.*, u.first_name, u.last_name
       FROM suspicious_activities sa
       LEFT JOIN users u ON sa.user_id = u.id
       WHERE sa.is_resolved = false
       ORDER BY sa.created_at DESC`,
    );

    res.json({
      success: true,
      data: alerts.map((a) => ({
        id: a.id,
        userId: a.user_id,
        user: a.first_name
          ? { firstName: a.first_name, lastName: a.last_name }
          : null,
        activityType: a.activity_type,
        details: a.details,
        severity: a.severity,
        ipAddress: a.ip_address,
        createdAt: a.created_at,
      })),
    });
  } catch (error) {
    logger.error("Get security alerts error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch alerts" });
  }
};

// Resolve security alert
const resolveSecurityAlert = async (req, res) => {
  try {
    const { id } = req.params;

    await query(
      `UPDATE suspicious_activities 
       SET is_resolved = true, resolved_by = $1, resolved_at = NOW()
       WHERE id = $2`,
      [req.user.id, id],
    );

    res.json({ success: true, message: "Alert resolved" });
  } catch (error) {
    logger.error("Resolve security alert error:", error);
    res.status(500).json({ success: false, error: "Failed to resolve alert" });
  }
};

// Get attendance report
const getAttendanceReport = async (req, res) => {
  try {
    const { startDate, endDate, department } = req.query;

    let whereClause = "WHERE DATE(ar.clock_in_time) BETWEEN $1 AND $2";
    let params = [startDate, endDate];

    if (department) {
      whereClause += " AND u.department = $3";
      params.push(department);
    }

    const { rows: report } = await query(
      `SELECT 
        u.id, u.first_name, u.last_name, u.employee_id, u.department,
        COUNT(ar.id) as total_days,
        COUNT(ar.id) FILTER (WHERE ar.status = 'PRESENT') as present_days,
        COUNT(ar.id) FILTER (WHERE ar.status = 'LATE') as late_days,
        COUNT(ar.id) FILTER (WHERE ar.status = 'ABSENT') as absent_days,
        COALESCE(SUM(ar.hours_worked), 0) as total_hours
       FROM users u
       LEFT JOIN attendance_records ar ON u.id = ar.user_id ${whereClause.replace("WHERE", "AND")}
       WHERE u.role = 'EMPLOYEE' AND u.status = 'ACTIVE'
       GROUP BY u.id, u.first_name, u.last_name, u.employee_id, u.department
       ORDER BY u.department, u.first_name`,
      params,
    );

    res.json({
      success: true,
      data: report.map((r) => ({
        userId: r.id,
        name: `${r.first_name} ${r.last_name}`,
        employeeId: r.employee_id,
        department: r.department,
        totalDays: parseInt(r.total_days),
        presentDays: parseInt(r.present_days),
        lateDays: parseInt(r.late_days),
        absentDays: parseInt(r.absent_days),
        totalHours: parseFloat(r.total_hours),
      })),
    });
  } catch (error) {
    logger.error("Get attendance report error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to generate report" });
  }
};

// Get user report
const getUserReport = async (req, res) => {
  try {
    const { rows: report } = await query(
      `SELECT 
        role,
        status,
        COUNT(*) as count
       FROM users
       GROUP BY role, status
       ORDER BY role, status`,
    );

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error("Get user report error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to generate report" });
  }
};

// Create backup — streams a real pg_dump to the client as a .sql.gz download.
// Requires pg_dump to be installed (ships with PostgreSQL).
const { spawn } = require('child_process');
const zlib      = require('zlib');

const createBackup = async (req, res) => {
  try {
    // Build connection params from env (same values the app uses)
    const dbUrl  = process.env.DATABASE_URL;
    const dbHost = process.env.DB_HOST     || 'localhost';
    const dbPort = process.env.DB_PORT     || '5432';
    const dbName = process.env.DB_NAME     || 'alyah_smart_attendance';
    const dbUser = process.env.DB_USER     || 'postgres';
    const dbPass = process.env.DB_PASSWORD || '';

    const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `attendance-backup-${ts}.sql.gz`;

    // Build pg_dump args
    const args = ['--no-password', '--format=plain', '--encoding=UTF8'];
    const env  = { ...process.env };

    if (dbUrl) {
      args.push(dbUrl);
    } else {
      args.push(`--host=${dbHost}`, `--port=${dbPort}`, `--username=${dbUser}`, `--dbname=${dbName}`);
      if (dbPass) env.PGPASSWORD = dbPass;
    }

    const dump = spawn('pg_dump', args, { env });

    let pgError = '';
    dump.stderr.on('data', d => { pgError += d.toString(); });

    dump.on('error', err => {
      if (!res.headersSent) {
        if (err.code === 'ENOENT') {
          res.status(500).json({
            success: false,
            error: 'pg_dump not found. Install PostgreSQL client tools on the server to enable backups.',
          });
        } else {
          res.status(500).json({ success: false, error: err.message });
        }
      }
    });

    dump.on('close', code => {
      if (code !== 0 && !res.headersSent) {
        res.status(500).json({
          success: false,
          error: `pg_dump exited with code ${code}. ${pgError.trim()}`,
        });
      }
    });

    // Stream compressed SQL to the browser as a download
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const gzip = zlib.createGzip({ level: 9 });
    dump.stdout.pipe(gzip).pipe(res);

    await auditLog(req.user.id, 'DATABASE_BACKUP_CREATED', 'system', null, { filename }, req);
  } catch (error) {
    logger.error('createBackup error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to create backup' });
    }
  }
};

module.exports = {
  getPublicConfig,
  getSystemSettings,
  updateSystemSettings,
  rotateQrSecret,
  getStaticQRCode,
  generateProtectedQrCode,
  setQrPassword,
  getQrPassword,
  previewQrForPassword,
  invalidateAllQrCodes,
  getQrCodeStats,
  getAuditLogs,
  getSecurityAlerts,
  resolveSecurityAlert,
  getAttendanceReport,
  getUserReport,
  createBackup,
};
