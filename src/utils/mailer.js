import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendEmailOtp(to, code, purpose = "verify") {
  const subject = `Your ${purpose} code: ${code}`;
  const text = `Your verification code is ${code}. It expires in 10 minutes.`;
  await transporter.sendMail({
    from: process.env.MAIL_FROM || "no-reply@example.com",
    to,
    subject,
    text,
  });
}
