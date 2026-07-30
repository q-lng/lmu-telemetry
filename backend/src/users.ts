import { pgQuery } from './pg.js';

export interface User {
  id: number;
  email: string;
  pseudo: string;
  nom: string;
  prenom: string;
  passwordHash: string;
  createdAt: string;
}

export interface PublicUser {
  id: number;
  email: string;
  pseudo: string;
  nom: string;
  prenom: string;
}

interface UserRow {
  id: number;
  email: string;
  pseudo: string;
  nom: string;
  prenom: string;
  password_hash: string;
  created_at: string;
}

function fromRow(r: UserRow): User {
  return {
    id: r.id,
    email: r.email,
    pseudo: r.pseudo,
    nom: r.nom,
    prenom: r.prenom,
    passwordHash: r.password_hash,
    createdAt: r.created_at,
  };
}

export function toPublicUser(u: User): PublicUser {
  return { id: u.id, email: u.email, pseudo: u.pseudo, nom: u.nom, prenom: u.prenom };
}

export async function createUser(input: {
  email: string;
  pseudo: string;
  nom: string;
  prenom: string;
  passwordHash: string;
}): Promise<User> {
  const rows = await pgQuery<UserRow>(
    `INSERT INTO users (email, pseudo, nom, prenom, password_hash)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, pseudo, nom, prenom, password_hash, created_at`,
    [input.email, input.pseudo, input.nom, input.prenom, input.passwordHash],
  );
  return fromRow(rows[0]);
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const rows = await pgQuery<UserRow>(`SELECT * FROM users WHERE email = $1`, [email]);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function findUserByPseudo(pseudo: string): Promise<User | null> {
  const rows = await pgQuery<UserRow>(`SELECT * FROM users WHERE pseudo = $1`, [pseudo]);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function findUserById(id: number): Promise<User | null> {
  const rows = await pgQuery<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] ? fromRow(rows[0]) : null;
}
