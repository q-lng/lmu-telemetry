import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cookiePlugin from '@fastify/cookie';
import { hashPassword, verifyPassword } from './passwords.js';
import { createUser, findUserByEmail, findUserByPseudo, findUserById, toPublicUser } from './users.js';
import { SESSION_COOKIE_NAME, createSession, destroySession, findUserIdBySessionToken } from './authSessions.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: number | null;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PSEUDO_RE = /^[a-zA-Z0-9_-]{3,32}$/;

function cookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.COOKIE_SECURE === 'true',
    signed: true,
  };
}

async function setSessionCookie(reply: FastifyReply, userId: number, meta: { userAgent?: string; ip?: string }) {
  const { token, expiresAt } = await createSession(userId, meta);
  reply.setCookie(SESSION_COOKIE_NAME, token, { ...cookieOptions(), expires: expiresAt });
}

function validateSignupInput(body: unknown): { email: string; pseudo: string; nom: string; prenom: string; password: string } | string {
  if (typeof body !== 'object' || body === null) return 'Requête invalide';
  const { email, pseudo, nom, prenom, password } = body as Record<string, unknown>;
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) return 'Email invalide';
  if (typeof pseudo !== 'string' || !PSEUDO_RE.test(pseudo.trim())) {
    return 'Pseudo invalide (3 à 32 caractères, lettres/chiffres/_/-)';
  }
  if (typeof nom !== 'string' || nom.trim().length === 0 || nom.length > 100) return 'Nom invalide';
  if (typeof prenom !== 'string' || prenom.trim().length === 0 || prenom.length > 100) return 'Prénom invalide';
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    return 'Mot de passe invalide (8 à 72 caractères)';
  }
  return { email: email.trim().toLowerCase(), pseudo: pseudo.trim(), nom: nom.trim(), prenom: prenom.trim(), password };
}

function validateLoginInput(body: unknown): { email: string; password: string } | string {
  if (typeof body !== 'object' || body === null) return 'Requête invalide';
  const { email, password } = body as Record<string, unknown>;
  if (typeof email !== 'string' || email.trim().length === 0) return 'Email invalide';
  if (typeof password !== 'string' || password.length === 0) return 'Mot de passe invalide';
  return { email: email.trim().toLowerCase(), password };
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  await app.register(cookiePlugin, { secret: process.env.COOKIE_SECRET, hook: 'onRequest' });

  app.decorateRequest('userId', null);

  app.addHook('onRequest', async (req: FastifyRequest) => {
    const raw = req.cookies[SESSION_COOKIE_NAME];
    if (!raw) return;
    const unsigned = req.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return;
    req.userId = await findUserIdBySessionToken(unsigned.value);
  });

  app.post('/api/auth/signup', async (req, reply) => {
    const parsed = validateSignupInput(req.body);
    if (typeof parsed === 'string') {
      reply.code(400).send({ error: parsed });
      return;
    }
    if (await findUserByEmail(parsed.email)) {
      reply.code(409).send({ error: 'Cet email est déjà utilisé' });
      return;
    }
    if (await findUserByPseudo(parsed.pseudo)) {
      reply.code(409).send({ error: 'Ce pseudo est déjà pris' });
      return;
    }
    const passwordHash = await hashPassword(parsed.password);
    const user = await createUser({
      email: parsed.email,
      pseudo: parsed.pseudo,
      nom: parsed.nom,
      prenom: parsed.prenom,
      passwordHash,
    });
    await setSessionCookie(reply, user.id, { userAgent: req.headers['user-agent'], ip: req.ip });
    reply.code(201).send({ user: toPublicUser(user) });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const parsed = validateLoginInput(req.body);
    if (typeof parsed === 'string') {
      reply.code(400).send({ error: parsed });
      return;
    }
    const user = await findUserByEmail(parsed.email);
    if (!user || !(await verifyPassword(parsed.password, user.passwordHash))) {
      reply.code(401).send({ error: 'Email ou mot de passe incorrect' });
      return;
    }
    await setSessionCookie(reply, user.id, { userAgent: req.headers['user-agent'], ip: req.ip });
    reply.send({ user: toPublicUser(user) });
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const raw = req.cookies[SESSION_COOKIE_NAME];
    if (raw) {
      const unsigned = req.unsignCookie(raw);
      if (unsigned.valid && unsigned.value) await destroySession(unsigned.value);
    }
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    reply.code(204).send();
  });

  app.get('/api/auth/me', async (req, reply) => {
    if (!req.userId) {
      reply.code(401).send({ error: 'Not authenticated' });
      return;
    }
    const user = await findUserById(req.userId);
    if (!user) {
      reply.code(401).send({ error: 'Not authenticated' });
      return;
    }
    reply.send({ user: toPublicUser(user) });
  });
}

/** Preauthorization guard for future protected routes (unused in this branch). */
export function requireAuth(req: FastifyRequest, reply: FastifyReply, done: () => void): void {
  if (!req.userId) {
    reply.code(401).send({ error: 'Not authenticated' });
    return;
  }
  done();
}
