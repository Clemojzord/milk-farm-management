const { randomBytes } = require('node:crypto');

function hasVercelKvEnv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function createMemoryStore() {
  const sessions = new Map();

  return {
    async create(userId, ttlMs) {
      const token = randomBytes(48).toString('hex');
      const now = Date.now();
      sessions.set(token, { userId, issuedAt: now, expiresAt: now + ttlMs });
      return { token, session: sessions.get(token) };
    },
    async get(token) {
      const session = sessions.get(token);
      if (!session) return null;
      if (session.expiresAt <= Date.now()) {
        sessions.delete(token);
        return null;
      }
      return session;
    },
    async destroy(token) {
      sessions.delete(token);
    },
    async cleanup() {},
  };
}

function createKvStore() {
  // eslint-disable-next-line global-require
  const { kv } = require('@vercel/kv');

  return {
    async create(userId, ttlMs) {
      const token = randomBytes(48).toString('hex');
      const now = Date.now();
      const session = { userId, issuedAt: now, expiresAt: now + ttlMs };
      const ttlSeconds = Math.max(1, Math.floor(ttlMs / 1000));
      await kv.set(`session:${token}`, session, { ex: ttlSeconds });
      return { token, session };
    },
    async get(token) {
      if (!token) return null;
      const session = await kv.get(`session:${token}`);
      if (!session) return null;
      if (session.expiresAt <= Date.now()) {
        await kv.del(`session:${token}`);
        return null;
      }
      return session;
    },
    async destroy(token) {
      if (!token) return;
      await kv.del(`session:${token}`);
    },
    async cleanup() {},
  };
}

function createSessionStore() {
  if (process.env.VERCEL && hasVercelKvEnv()) {
    return createKvStore();
  }
  if (hasVercelKvEnv()) {
    return createKvStore();
  }
  return createMemoryStore();
}

module.exports = { createSessionStore };

