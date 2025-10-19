import axios from "axios";
import { ApiError } from "./errors.js";

const BREVO_EMAIL_URL = "https://api.brevo.com/v3/smtp/email";

export async function sendEmailOtp(to, code, purpose = "verify") {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new ApiError("Missing BREVO_API_KEY", 500);

  const sender = {
    email: process.env.BREVO_EMAIL_SENDER || "contract-one@k53tech.com",
    name: process.env.BREVO_EMAIL_SENDER_NAME || "RichBengali",
  };

  const subject = `Your ${purpose} code: ${code}`;
  const htmlContent = `
    <div style="font-family:Arial,sans-serif;font-size:16px;color:#111">
      <p>Your verification code is:</p>
      <p style="font-size:28px;letter-spacing:4px;font-weight:700">${code}</p>
      <p>This code expires in <b>10 minutes</b>.</p>
    </div>
  `;

  try {
    const emailResp = await axios.post(
      BREVO_EMAIL_URL,
      { sender, to: [{ email: to }], subject, htmlContent },
      { headers: { "api-key": apiKey, "content-type": "application/json" } },
    );
    console.log("emailResp:", emailResp.data);
  } catch (err) {
    const status = err?.response?.status || 500;
    const detail = err?.response?.data;
    if (status === 402) {
      throw new ApiError("Brevo: payment required or insufficient credits (402).", 402, detail);
    }
    throw new ApiError("Failed to send email via Brevo.", status, detail);
  }
}

export async function sendPasswordResetEmail(to, resetLink) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new ApiError("Missing BREVO_API_KEY", 500);

  const sender = {
    email: process.env.BREVO_EMAIL_SENDER || "contract-one@k53tech.com",
    name: process.env.BREVO_EMAIL_SENDER_NAME || "RichBengali",
  };

  const subject = "Reset your password";
  const htmlContent = `
    <div style="font-family:Arial,sans-serif;font-size:16px;color:#111">
      <p>You requested to reset your password.</p>
      <p><a href="${resetLink}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">Set a new password</a></p>
      <p>If the button doesn’t work, copy and paste this link into your browser:</p>
      <p style="word-break:break-all">${resetLink}</p>
      <p>This link expires in 30 minutes.</p>
    </div>
  `;

  try {
    const resp = await axios.post(
      BREVO_EMAIL_URL,
      { sender, to: [{ email: to }], subject, htmlContent },
      { headers: { "api-key": apiKey, "content-type": "application/json" } },
    );
    return resp?.data;
  } catch (err) {
    const status = err?.response?.status || 500;
    const detail = err?.response?.data;
    throw new ApiError(detail?.message || "Failed to send reset email", status, detail);
  }
}
