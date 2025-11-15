// Put this file at /api/checkBins.js in your Vercel project
import sgMail from "@sendgrid/mail";

const SENDGRID_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL;      // Verified sender in SendGrid
const TO_EMAIL = process.env.TO_EMAIL;          // Recipient
const DB_BASE_URL = process.env.DB_BASE_URL;    // e.g. https://smartdustbin-e4945-default-rtdb.firebaseio.com
const THRESHOLD = Number(process.env.THRESHOLD || "85");

if (!SENDGRID_KEY) {
  console.warn("Warning: SENDGRID_API_KEY not set.");
} else {
  sgMail.setApiKey(SENDGRID_KEY);
}

export default async function handler(req, res) {
  try {
    if (!DB_BASE_URL) {
      return res.status(400).json({ ok: false, error: "DB_BASE_URL env var not set" });
    }
    // Read /dustbin via REST API - this returns JSON of bins
    const url = `${DB_BASE_URL.replace(/\/$/, "")}/dustbin.json`; // ensure no trailing slash
    const r = await fetch(url);
    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ ok: false, error: "Failed to fetch DB", status: r.status, body: text });
    }
    const data = await r.json(); // expected { bin1: { fillLevel: 23 }, bin2: { fillLevel: 88 } }

    const alerts = [];
    if (data && typeof data === "object") {
      for (const [binId, info] of Object.entries(data)) {
        if (!info) continue;
        const fill = Number(info.fillLevel);
        if (!Number.isNaN(fill) && fill >= THRESHOLD) {
          alerts.push({ binId, fill });
        }
      }
    }

    if (alerts.length === 0) {
      return res.status(200).json({ ok: true, alertsFound: 0, message: `No bins >= ${THRESHOLD}%` });
    }

    // Compose email
    const subject = `Dustbin Alert — ${alerts.length} bin(s) >= ${THRESHOLD}%`;
    const lines = alerts.map(a => `• ${a.binId}: ${a.fill}%`).join("\n");
    const text = `Alert: The following dustbin(s) have reached or exceeded ${THRESHOLD}%:\n\n${lines}\n\nPlease empty them.`;
    const html = `<p>Alert: The following dustbin(s) have reached or exceeded <strong>${THRESHOLD}%</strong>:</p><ul>${alerts.map(a => `<li>${a.binId}: ${a.fill}%</li>`).join("")}</ul><p>Please empty them.</p>`;

    if (!SENDGRID_KEY || !FROM_EMAIL || !TO_EMAIL) {
      // Return the email content for debugging instead of sending
      return res.status(200).json({ ok: true, wouldSendEmail: true, subject, text, html, alerts });
    }

    const msg = {
      to: TO_EMAIL,
      from: FROM_EMAIL,
      subject,
      text,
      html
    };

    await sgMail.send(msg);
    return res.status(200).json({ ok: true, alertsFound: alerts.length, emailSent: true });
  } catch (err) {
    console.error("Error in checkBins:", err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
