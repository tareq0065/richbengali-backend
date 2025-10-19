import axios from "axios";
import { ApiError } from "./errors.js";

const BREVO_SMS_URL = "https://api.brevo.com/v3/transactionalSMS/sms";

export async function sendSmsOtp(to, code, purpose = "verify") {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new ApiError("Missing BREVO_API_KEY", 500);

  const sender = process.env.BREVO_SMS_SENDER || "Verify";
  const content = `Code: ${code} (expires in 10m)`;

  try {
    await axios.post(
      BREVO_SMS_URL,
      { sender, recipient: to, content, type: "transactional", tag: purpose },
      { headers: { "api-key": apiKey, "content-type": "application/json" } },
    );
  } catch (err) {
    const status = err?.response?.status || 500;
    const detail = err?.response?.data;
    if (status === 402) {
      throw new ApiError("Brevo: payment required or insufficient credits (402).", 402, detail);
    }
    throw new ApiError("Failed to send SMS via Brevo.", status, detail);
  }
}
