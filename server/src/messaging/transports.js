import nodemailer from 'nodemailer';

const live = () => process.env.MESSAGING_DRIVER === 'live';

let mailer;

// returns 'sent' when the mail went to the SMTP server, 'logged' when MESSAGING_DRIVER is not "live"
export async function sendEmail({ to, subject, text, html, attachments }) {
  if (!live()) {
    console.log(`[email -> ${to}] ${subject}\n${text}`);
    return 'logged';
  }

  mailer ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await mailer.sendMail({ from: process.env.EMAIL_FROM, to, subject, text, html, attachments });
  return 'sent';
}
