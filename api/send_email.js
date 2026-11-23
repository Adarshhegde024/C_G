import nodemailer from "nodemailer";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    let payload = req.body;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        payload = {};
      }
    }

    const { to, subject, html, text } = payload || {};
    if (!to) {
      return res.status(400).json({ error: "Missing 'to' recipient parameter" });
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: "adarshhegde024@gmail.com",
        pass: "zgaofhgyrittrdrs",
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    const info = await transporter.sendMail({
      from: '"CloudGuard Security" <adarshhegde024@gmail.com>',
      to,
      subject: subject || "CloudGuard Security Notification",
      text: text || subject,
      html: html || undefined,
    });

    return res.status(200).json({
      success: true,
      messageId: info.messageId,
      to,
      method: "gmail_smtp_relay_node",
    });
  } catch (err) {
    console.error("Vercel email relay error:", err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
