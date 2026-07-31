import type { FastifyInstance } from 'fastify';
import { requireAuth } from './auth.js';
import { findUserByPseudo, searchUsersByPseudo, toPublicUser, type PublicUser } from './users.js';
import {
  areFriends,
  findPendingRequest,
  sendFriendRequest,
  acceptFriendRequest,
  deleteFriendRequest,
  listIncomingRequests,
  listOutgoingRequests,
  listFriends,
  removeFriendship,
} from './friends.js';
import { follow, unfollow, isFollowing, listFollowing, listFollowers } from './follows.js';

interface ProfileSummary extends PublicUser {
  isFriend: boolean;
  isFollowing: boolean;
  requestState: 'none' | 'sent' | 'received';
  friendRequestId?: number;
}

async function toProfileSummary(target: PublicUser, viewerId: number): Promise<ProfileSummary> {
  const [friend, following, pending] = await Promise.all([
    areFriends(viewerId, target.id),
    isFollowing(viewerId, target.id),
    findPendingRequest(viewerId, target.id),
  ]);
  let requestState: ProfileSummary['requestState'] = 'none';
  let friendRequestId: number | undefined;
  if (pending) {
    requestState = pending.requesterId === viewerId ? 'sent' : 'received';
    friendRequestId = pending.id;
  }
  return { ...target, isFriend: friend, isFollowing: following, requestState, friendRequestId };
}

export async function registerSocial(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { q?: string } }>(
    '/api/users/search',
    { preHandler: requireAuth },
    async (req, reply) => {
      const q = (req.query.q ?? '').trim();
      if (q.length === 0) {
        reply.send({ users: [] });
        return;
      }
      const users = await searchUsersByPseudo(q, req.userId!);
      const profiles = await Promise.all(users.map((u) => toProfileSummary(toPublicUser(u), req.userId!)));
      reply.send({ users: profiles });
    },
  );

  app.get<{ Params: { pseudo: string } }>(
    '/api/users/:pseudo',
    { preHandler: requireAuth },
    async (req, reply) => {
      const target = await findUserByPseudo(req.params.pseudo);
      if (!target) {
        reply.code(404).send({ error: 'Utilisateur introuvable' });
        return;
      }
      const profile = await toProfileSummary(toPublicUser(target), req.userId!);
      reply.send({ profile });
    },
  );

  app.post<{ Body: { pseudo?: string } }>(
    '/api/friends/requests',
    { preHandler: requireAuth },
    async (req, reply) => {
      const pseudo = (req.body?.pseudo ?? '').trim();
      const target = await findUserByPseudo(pseudo);
      if (!target) {
        reply.code(404).send({ error: 'Utilisateur introuvable' });
        return;
      }
      if (target.id === req.userId) {
        reply.code(400).send({ error: 'Impossible de s’ajouter soi-même' });
        return;
      }
      const status = await sendFriendRequest(req.userId!, target.id);
      reply.send({ status });
    },
  );

  app.get('/api/friends/requests', { preHandler: requireAuth }, async (req, reply) => {
    const [incoming, outgoing] = await Promise.all([
      listIncomingRequests(req.userId!),
      listOutgoingRequests(req.userId!),
    ]);
    reply.send({ incoming, outgoing });
  });

  app.post<{ Params: { id: string } }>(
    '/api/friends/requests/:id/accept',
    { preHandler: requireAuth },
    async (req, reply) => {
      const ok = await acceptFriendRequest(Number(req.params.id), req.userId!);
      if (!ok) {
        reply.code(404).send({ error: 'Demande introuvable' });
        return;
      }
      reply.code(204).send();
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/friends/requests/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      const ok = await deleteFriendRequest(Number(req.params.id), req.userId!);
      if (!ok) {
        reply.code(404).send({ error: 'Demande introuvable' });
        return;
      }
      reply.code(204).send();
    },
  );

  app.get('/api/friends', { preHandler: requireAuth }, async (req, reply) => {
    reply.send({ friends: await listFriends(req.userId!) });
  });

  app.delete<{ Params: { userId: string } }>(
    '/api/friends/:userId',
    { preHandler: requireAuth },
    async (req, reply) => {
      await removeFriendship(req.userId!, Number(req.params.userId));
      reply.code(204).send();
    },
  );

  app.post<{ Params: { pseudo: string } }>(
    '/api/follows/:pseudo',
    { preHandler: requireAuth },
    async (req, reply) => {
      const target = await findUserByPseudo(req.params.pseudo);
      if (!target) {
        reply.code(404).send({ error: 'Utilisateur introuvable' });
        return;
      }
      if (target.id === req.userId) {
        reply.code(400).send({ error: 'Impossible de se suivre soi-même' });
        return;
      }
      await follow(req.userId!, target.id);
      reply.code(204).send();
    },
  );

  app.delete<{ Params: { pseudo: string } }>(
    '/api/follows/:pseudo',
    { preHandler: requireAuth },
    async (req, reply) => {
      const target = await findUserByPseudo(req.params.pseudo);
      if (!target) {
        reply.code(404).send({ error: 'Utilisateur introuvable' });
        return;
      }
      await unfollow(req.userId!, target.id);
      reply.code(204).send();
    },
  );

  app.get('/api/follows/following', { preHandler: requireAuth }, async (req, reply) => {
    reply.send({ users: await listFollowing(req.userId!) });
  });

  app.get('/api/follows/followers', { preHandler: requireAuth }, async (req, reply) => {
    reply.send({ users: await listFollowers(req.userId!) });
  });
}
