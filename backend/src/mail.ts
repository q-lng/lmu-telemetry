import nodemailer from 'nodemailer';
import type { PublicUser } from './users.js';

let cachedTransporter: nodemailer.Transporter | null = null;
let warnedMissingConfig = false;

/** Built lazily from env vars only — never hardcoded. Returns null (and logs a
 * one-time warning) when MAIL_* isn't fully configured, so callers can no-op
 * instead of crashing the request that triggered the email. */
function getTransporter(): nodemailer.Transporter | null {
  if (cachedTransporter) return cachedTransporter;
  const { MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASSWORD } = process.env;
  if (!MAIL_HOST || !MAIL_PORT || !MAIL_USER || !MAIL_PASSWORD) {
    if (!warnedMissingConfig) {
      console.warn('[mail] MAIL_HOST/MAIL_PORT/MAIL_USER/MAIL_PASSWORD not fully set — emails will be skipped.');
      warnedMissingConfig = true;
    }
    return null;
  }
  cachedTransporter = nodemailer.createTransport({
    host: MAIL_HOST,
    port: Number(MAIL_PORT),
    secure: process.env.MAIL_SECURE === 'true',
    auth: { user: MAIL_USER, pass: MAIL_PASSWORD },
  });
  return cachedTransporter;
}

interface MailContent {
  subject: string;
  html: string;
  text: string;
}

async function sendMail(to: string, content: MailContent): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(`[mail] Skipped "${content.subject}" to ${to} (no SMTP config).`);
    return;
  }
  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
  } catch (err) {
    // A mail delivery failure must never fail the request that triggered it
    // (signup, forgot-password) — log and move on.
    console.error(`[mail] Failed to send "${content.subject}" to ${to}:`, err);
  }
}

export async function sendWelcomeEmail(user: PublicUser): Promise<void> {
  await sendMail(user.email, {
    subject: 'Bienvenue sur LMU Telemetry',
    html: `<p>Salut ${user.prenom},</p><p>Ton compte <strong>${user.pseudo}</strong> vient d'être créé sur LMU Telemetry.</p>`,
    text: `Salut ${user.prenom}, ton compte ${user.pseudo} vient d'être créé sur LMU Telemetry.`,
  });
}

export async function sendPasswordResetEmail(user: PublicUser, resetUrl: string): Promise<void> {
  await sendMail(user.email, {
    subject: 'Réinitialisation de ton mot de passe — LMU Telemetry',
    html: `<p>Salut ${user.prenom},</p><p>Clique sur ce lien pour choisir un nouveau mot de passe (valable 1 heure) :</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Si tu n'es pas à l'origine de cette demande, ignore simplement ce mail.</p>`,
    text: `Salut ${user.prenom}, voici le lien pour réinitialiser ton mot de passe (valable 1 heure) : ${resetUrl}\n\nSi tu n'es pas à l'origine de cette demande, ignore simplement ce mail.`,
  });
}
