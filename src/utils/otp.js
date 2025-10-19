import bcrypt from "bcryptjs";

export function generateOtpCode() {
  const n = Math.floor(Math.random() * 1000000);
  return n.toString().padStart(6, "0"); // always 6 digits
}

export async function hashOtp(code) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(code, salt);
}

export async function verifyOtp(code, hash) {
  return bcrypt.compare(code, hash);
}
