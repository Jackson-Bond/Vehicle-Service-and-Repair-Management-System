import nodemailer from 'nodemailer';

const live = () => process.env.MESSAGING_DRIVER === 'live';

let mailer;

export async function sendEmail({ to, subject, text }) {
  if (!live()) return console.log(`[email -> ${to}] ${subject}\n${text}`);

  mailer ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await mailer.sendMail({ from: process.env.EMAIL_FROM, to, subject, text });
}