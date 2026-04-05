const http = require('node:http');
const { randomUUID, randomBytes, pbkdf2Sync, timingSafeEqual } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  shouldUsePostgres,
  ensureAuthRow,
  ensureLocalJsonFile,
  ensureStateRow,
  getLocalDataDir,
  readAuthPostgres,
  readStatePostgres,
  writeStatePostgres,
} = require('./persistence');
const { createSessionStore } = require('./session-store');

const HOST = process.env.API_HOST || '0.0.0.0';
const PORT = Number(process.env.API_PORT || 4000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 1000 * 60 * 60 * 12);
const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEYLEN = 64;
const PASSWORD_DIGEST = 'sha512';

const ROLE_ADMIN = 'admin';
const ROLE_ACCOUNTANT = 'accountant';
const ROLE_VIEWER = 'viewer';

const ROLES = [ROLE_ADMIN, ROLE_ACCOUNTANT, ROLE_VIEWER];
const READ_ROLES = [ROLE_ADMIN, ROLE_ACCOUNTANT, ROLE_VIEWER];
const FINANCE_WRITE_ROLES = [ROLE_ADMIN, ROLE_ACCOUNTANT];
const ADMIN_ROLES = [ROLE_ADMIN];

const DATA_DIR = getLocalDataDir();
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

const DEFAULT_USERS = [
  {
    username: (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase(),
    password: process.env.ADMIN_PASSWORD || 'admin123',
    displayName: process.env.ADMIN_DISPLAY_NAME || 'System Admin',
    role: ROLE_ADMIN,
  },
  {
    username: (process.env.ACCOUNTANT_USERNAME || 'accountant').trim().toLowerCase(),
    password: process.env.ACCOUNTANT_PASSWORD || 'accountant123',
    displayName: process.env.ACCOUNTANT_DISPLAY_NAME || 'Farm Accountant',
    role: ROLE_ACCOUNTANT,
  },
  {
    username: (process.env.VIEWER_USERNAME || 'viewer').trim().toLowerCase(),
    password: process.env.VIEWER_PASSWORD || 'viewer123',
    displayName: process.env.VIEWER_DISPLAY_NAME || 'Read Only Viewer',
    role: ROLE_VIEWER,
  },
];

const sessionStore = createSessionStore();

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function asNonNegativeNumber(value, fieldName, defaultValue = 0) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw createHttpError(400, `${fieldName} must be a valid number`);
  }
  if (parsed < 0) {
    throw createHttpError(400, `${fieldName} must be a non-negative number`);
  }
  return parsed;
}

function asString(value, defaultValue = '') {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  return String(value);
}

function normalizeDate(value) {
  const text = asString(value).trim();
  if (!text) return todayISO();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return todayISO();
  }

  return date.toISOString().slice(0, 10);
}

function normalizeRole(value) {
  const role = asString(value).trim().toLowerCase();
  if (!ROLES.includes(role)) {
    return ROLE_VIEWER;
  }
  return role;
}

function ensureRole(authContext, allowedRoles) {
  if (!authContext || !authContext.user) {
    throw createHttpError(401, 'Authentication required');
  }

  if (!allowedRoles.includes(authContext.user.role)) {
    throw createHttpError(403, 'You do not have permission to perform this action');
  }
}

function createEmptyState() {
  return {
    farmers: [],
    expenses: [],
    revenue: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeFarmer(raw) {
  const deliveries = Array.isArray(raw?.deliveries)
    ? raw.deliveries.map((delivery) => ({
        id: asString(delivery?.id, randomUUID()),
        date: normalizeDate(delivery?.date),
        liters: asNonNegativeNumber(delivery?.liters, 'liters', 0),
      }))
    : [];

  return {
    id: asString(raw?.id, randomUUID()),
    name: asString(raw?.name).trim(),
    phone: asString(raw?.phone),
    location: asString(raw?.location),
    price: asNonNegativeNumber(raw?.price, 'price', 0),
    balance: asNonNegativeNumber(raw?.balance, 'balance', 0),
    deliveries,
    createdAt: asString(raw?.createdAt, new Date().toISOString()),
    updatedAt: asString(raw?.updatedAt, new Date().toISOString()),
  };
}

function normalizeExpense(raw) {
  return {
    id: asString(raw?.id, randomUUID()),
    date: normalizeDate(raw?.date),
    category: asString(raw?.category, 'Other'),
    description: asString(raw?.description),
    amount: asNonNegativeNumber(raw?.amount, 'amount', 0),
    createdAt: asString(raw?.createdAt, new Date().toISOString()),
  };
}

function normalizeRevenue(raw) {
  const quantity = asNonNegativeNumber(raw?.quantity, 'quantity', 0);
  const unitPrice = asNonNegativeNumber(raw?.unitPrice, 'unitPrice', 0);

  return {
    id: asString(raw?.id, randomUUID()),
    date: normalizeDate(raw?.date),
    product: asString(raw?.product, 'Milk'),
    quantity,
    unitPrice,
    total: asNonNegativeNumber(raw?.total, 'total', quantity * unitPrice),
    createdAt: asString(raw?.createdAt, new Date().toISOString()),
  };
}

function normalizeState(raw) {
  const base = createEmptyState();

  if (!raw || typeof raw !== 'object') {
    return base;
  }

  base.farmers = Array.isArray(raw.farmers) ? raw.farmers.map(normalizeFarmer) : [];
  base.expenses = Array.isArray(raw.expenses) ? raw.expenses.map(normalizeExpense) : [];
  base.revenue = Array.isArray(raw.revenue) ? raw.revenue.map(normalizeRevenue) : [];
  base.updatedAt = asString(raw.updatedAt, new Date().toISOString());

  return base;
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const secret = asString(password);
  const hash = pbkdf2Sync(secret, salt, PASSWORD_ITERATIONS, PASSWORD_KEYLEN, PASSWORD_DIGEST).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  if (!password || !salt || !expectedHash) return false;

  try {
    const computed = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEYLEN, PASSWORD_DIGEST);
    const expected = Buffer.from(expectedHash, 'hex');

    if (computed.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(computed, expected);
  } catch {
    return false;
  }
}

function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function normalizeAuthUser(raw) {
  const username = asString(raw?.username).trim().toLowerCase();
  if (!username) {
    throw createHttpError(500, 'Invalid auth user: username is required');
  }

  const passwordHash = asString(raw?.passwordHash);
  const salt = asString(raw?.salt);

  if (!passwordHash || !salt) {
    throw createHttpError(500, `Invalid auth user for ${username}: password hash is missing`);
  }

  return {
    id: asString(raw?.id, randomUUID()),
    username,
    displayName: asString(raw?.displayName, username),
    role: normalizeRole(raw?.role),
    passwordHash,
    salt,
    createdAt: asString(raw?.createdAt, new Date().toISOString()),
    updatedAt: asString(raw?.updatedAt, new Date().toISOString()),
  };
}

function createDefaultAuthStore() {
  const now = new Date().toISOString();
  const seen = new Set();
  const users = [];

  for (const item of DEFAULT_USERS) {
    if (!item.username || seen.has(item.username)) {
      continue;
    }

    seen.add(item.username);
    const { salt, hash } = hashPassword(item.password);

    users.push({
      id: randomUUID(),
      username: item.username,
      displayName: item.displayName,
      role: item.role,
      passwordHash: hash,
      salt,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { users, updatedAt: now };
}

function normalizeAuthStore(raw) {
  const fallback = createDefaultAuthStore();

  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const users = Array.isArray(raw.users) ? raw.users.map(normalizeAuthUser) : [];

  return {
    users,
    updatedAt: asString(raw.updatedAt, new Date().toISOString()),
  };
}

async function ensureStateFile() {
  if (shouldUsePostgres()) {
    await ensureStateRow({ createEmptyState });
    return;
  }

  await ensureLocalJsonFile(STATE_FILE, createEmptyState());
}

async function ensureAuthFile() {
  if (shouldUsePostgres()) {
    return ensureAuthRow({ createDefaultAuthStore });
  }

  try {
    await fs.access(AUTH_FILE);
    return { created: false };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }

    await fs.mkdir(DATA_DIR, { recursive: true });
    const initial = createDefaultAuthStore();
    await fs.writeFile(AUTH_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return { created: true, users: initial.users.map(toPublicUser) };
  }
}

async function readState() {
  if (shouldUsePostgres()) {
    return readStatePostgres({ normalizeState, createEmptyState });
  }

  await ensureStateFile();

  const raw = await fs.readFile(STATE_FILE, 'utf8');
  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    throw createHttpError(500, 'State file is corrupted JSON');
  }
}

async function writeState(state) {
  if (shouldUsePostgres()) {
    return writeStatePostgres({ normalizeState }, state);
  }

  const next = normalizeState(state);
  next.updatedAt = new Date().toISOString();

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(next, null, 2), 'utf8');

  return next;
}

async function readAuthStore() {
  if (shouldUsePostgres()) {
    return readAuthPostgres({ normalizeAuthStore, createDefaultAuthStore });
  }

  await ensureAuthFile();

  const raw = await fs.readFile(AUTH_FILE, 'utf8');
  try {
    return normalizeAuthStore(JSON.parse(raw));
  } catch {
    throw createHttpError(500, 'Auth file is corrupted JSON');
  }
}

async function createSession(userId) {
  const { token } = await sessionStore.create(userId, SESSION_TTL_MS);
  return token;
}

function parseBearerToken(req) {
  const header = asString(req.headers.authorization).trim();
  if (!header) return null;

  const [scheme, token] = header.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return token.trim();
}

async function requireAuth(req) {
  const token = parseBearerToken(req);
  if (!token) {
    throw createHttpError(401, 'Missing bearer token');
  }

  const session = await sessionStore.get(token);
  if (!session) {
    throw createHttpError(401, 'Invalid or expired session');
  }

  const authStore = await readAuthStore();
  const user = authStore.users.find((entry) => String(entry.id) === String(session.userId));

  if (!user) {
    await sessionStore.destroy(token);
    throw createHttpError(401, 'Session user not found');
  }

  return {
    token,
    session,
    user: toPublicUser(user),
    userInternal: user,
  };
}

function findById(items, id) {
  return items.find((item) => String(item.id) === String(id));
}

function findIndexById(items, id) {
  return items.findIndex((item) => String(item.id) === String(id));
}

function computeSummary(state) {
  const totalMilk = state.farmers.reduce((sum, farmer) => {
    const farmerMilk = (farmer.deliveries || []).reduce(
      (inner, delivery) => inner + asNonNegativeNumber(delivery.liters, 'liters', 0),
      0,
    );
    return sum + farmerMilk;
  }, 0);

  const totalExpenses = state.expenses.reduce(
    (sum, item) => sum + asNonNegativeNumber(item.amount, 'amount', 0),
    0,
  );

  const totalRevenue = state.revenue.reduce(
    (sum, item) => sum + asNonNegativeNumber(item.total, 'total', 0),
    0,
  );

  const outstandingFarmerBalance = state.farmers.reduce(
    (sum, farmer) => sum + asNonNegativeNumber(farmer.balance, 'balance', 0),
    0,
  );

  return {
    totals: {
      milkLiters: totalMilk,
      expenses: totalExpenses,
      revenue: totalRevenue,
      net: totalRevenue - totalExpenses,
      farmerOutstanding: outstandingFarmerBalance,
    },
    counts: {
      farmers: state.farmers.length,
      expenses: state.expenses.length,
      revenue: state.revenue.length,
    },
    updatedAt: state.updatedAt,
  };
}

function baseHeaders(extraHeaders = {}) {
  return {
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...extraHeaders,
  };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, baseHeaders({ 'Content-Type': 'application/json; charset=utf-8' }));
  res.end(body);
}

function sendNoContent(res) {
  res.writeHead(204, baseHeaders());
  res.end();
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const body = Buffer.concat(chunks).toString('utf8');
  if (!body.trim()) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    throw createHttpError(400, 'Request body must be valid JSON');
  }
}

function decodePathParam(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function handleAuth(req, res, pathname, authContext) {
  if (pathname === '/api/auth/login') {
    if (req.method !== 'POST') {
      throw createHttpError(405, 'Method not allowed');
    }

    const body = await readJsonBody(req);
    const username = asString(body.username).trim().toLowerCase();
    const password = asString(body.password);

    if (!username || !password) {
      throw createHttpError(400, 'username and password are required');
    }

    const store = await readAuthStore();
    const user = store.users.find((entry) => entry.username === username);

    if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
      throw createHttpError(401, 'Invalid username or password');
    }

    const token = await createSession(user.id);

    return sendJson(res, 200, {
      data: {
        token,
        expiresInMs: SESSION_TTL_MS,
        user: toPublicUser(user),
      },
    });
  }

  if (pathname === '/api/auth/me') {
    if (req.method !== 'GET') {
      throw createHttpError(405, 'Method not allowed');
    }

    if (!authContext) {
      throw createHttpError(401, 'Authentication required');
    }

    return sendJson(res, 200, { data: { user: authContext.user } });
  }

  if (pathname === '/api/auth/logout') {
    if (req.method !== 'POST') {
      throw createHttpError(405, 'Method not allowed');
    }

    if (!authContext) {
      throw createHttpError(401, 'Authentication required');
    }

    await sessionStore.destroy(authContext.token);
    return sendNoContent(res);
  }

  if (pathname === '/api/auth/users') {
    if (req.method !== 'GET') {
      throw createHttpError(405, 'Method not allowed');
    }

    ensureRole(authContext, ADMIN_ROLES);
    const store = await readAuthStore();
    return sendJson(res, 200, { data: store.users.map(toPublicUser) });
  }

  return false;
}

async function handleFarmers(req, res, pathname, authContext) {
  if (pathname === '/api/farmers') {
    if (req.method === 'GET') {
      ensureRole(authContext, READ_ROLES);
      const state = await readState();
      return sendJson(res, 200, { data: state.farmers });
    }

    if (req.method === 'POST') {
      ensureRole(authContext, ADMIN_ROLES);

      const body = await readJsonBody(req);
      const name = asString(body.name).trim();

      if (!name) {
        throw createHttpError(400, 'name is required');
      }

      const state = await readState();
      const now = new Date().toISOString();

      const farmer = {
        id: randomUUID(),
        name,
        phone: asString(body.phone),
        location: asString(body.location),
        price: asNonNegativeNumber(body.price, 'price', 0),
        balance: 0,
        deliveries: [],
        createdAt: now,
        updatedAt: now,
      };

      const next = await writeState({ ...state, farmers: [...state.farmers, farmer] });
      const created = findById(next.farmers, farmer.id);
      return sendJson(res, 201, { data: created });
    }

    throw createHttpError(405, 'Method not allowed');
  }

  const deliveryMatch = pathname.match(/^\/api\/farmers\/([^/]+)\/deliveries$/);
  if (deliveryMatch) {
    if (req.method !== 'POST') {
      throw createHttpError(405, 'Method not allowed');
    }

    ensureRole(authContext, ADMIN_ROLES);

    const farmerId = decodePathParam(deliveryMatch[1]);
    const body = await readJsonBody(req);

    const liters = asNonNegativeNumber(body.liters, 'liters');
    if (liters <= 0) {
      throw createHttpError(400, 'liters must be greater than zero');
    }

    const delivery = {
      id: randomUUID(),
      date: normalizeDate(body.date),
      liters,
    };

    const state = await readState();
    const farmerIndex = findIndexById(state.farmers, farmerId);

    if (farmerIndex < 0) {
      throw createHttpError(404, 'Farmer not found');
    }

    const farmer = state.farmers[farmerIndex];
    const price = asNonNegativeNumber(farmer.price, 'price', 0);

    const nextFarmer = {
      ...farmer,
      deliveries: [...(farmer.deliveries || []), delivery],
      balance: asNonNegativeNumber(farmer.balance, 'balance', 0) + liters * price,
      updatedAt: new Date().toISOString(),
    };

    const nextFarmers = [...state.farmers];
    nextFarmers[farmerIndex] = nextFarmer;

    const next = await writeState({ ...state, farmers: nextFarmers });
    return sendJson(res, 201, { data: findById(next.farmers, farmerId) });
  }

  const markPaidMatch = pathname.match(/^\/api\/farmers\/([^/]+)\/mark-paid$/);
  if (markPaidMatch) {
    if (req.method !== 'POST') {
      throw createHttpError(405, 'Method not allowed');
    }

    ensureRole(authContext, ADMIN_ROLES);

    const farmerId = decodePathParam(markPaidMatch[1]);
    const state = await readState();
    const farmerIndex = findIndexById(state.farmers, farmerId);

    if (farmerIndex < 0) {
      throw createHttpError(404, 'Farmer not found');
    }

    const farmer = state.farmers[farmerIndex];
    const nextFarmers = [...state.farmers];

    nextFarmers[farmerIndex] = {
      ...farmer,
      balance: 0,
      updatedAt: new Date().toISOString(),
    };

    const next = await writeState({ ...state, farmers: nextFarmers });
    return sendJson(res, 200, { data: findById(next.farmers, farmerId) });
  }

  const farmerMatch = pathname.match(/^\/api\/farmers\/([^/]+)$/);
  if (!farmerMatch) {
    return false;
  }

  const farmerId = decodePathParam(farmerMatch[1]);
  const state = await readState();
  const farmerIndex = findIndexById(state.farmers, farmerId);

  if (farmerIndex < 0) {
    throw createHttpError(404, 'Farmer not found');
  }

  if (req.method === 'GET') {
    ensureRole(authContext, READ_ROLES);
    return sendJson(res, 200, { data: state.farmers[farmerIndex] });
  }

  if (req.method === 'PATCH') {
    ensureRole(authContext, ADMIN_ROLES);

    const body = await readJsonBody(req);
    const current = state.farmers[farmerIndex];

    const nextFarmer = {
      ...current,
      updatedAt: new Date().toISOString(),
    };

    if (body.name !== undefined) {
      const name = asString(body.name).trim();
      if (!name) {
        throw createHttpError(400, 'name cannot be empty');
      }
      nextFarmer.name = name;
    }

    if (body.phone !== undefined) nextFarmer.phone = asString(body.phone);
    if (body.location !== undefined) nextFarmer.location = asString(body.location);
    if (body.price !== undefined) nextFarmer.price = asNonNegativeNumber(body.price, 'price', 0);

    const nextFarmers = [...state.farmers];
    nextFarmers[farmerIndex] = nextFarmer;

    const written = await writeState({ ...state, farmers: nextFarmers });
    return sendJson(res, 200, { data: findById(written.farmers, farmerId) });
  }

  if (req.method === 'DELETE') {
    ensureRole(authContext, ADMIN_ROLES);

    const nextFarmers = state.farmers.filter((farmer) => String(farmer.id) !== String(farmerId));
    await writeState({ ...state, farmers: nextFarmers });
    return sendNoContent(res);
  }

  throw createHttpError(405, 'Method not allowed');
}

async function handleExpenses(req, res, pathname, authContext) {
  if (pathname === '/api/expenses') {
    if (req.method === 'GET') {
      ensureRole(authContext, READ_ROLES);
      const state = await readState();
      return sendJson(res, 200, { data: state.expenses });
    }

    if (req.method === 'POST') {
      ensureRole(authContext, FINANCE_WRITE_ROLES);

      const body = await readJsonBody(req);
      const amount = asNonNegativeNumber(body.amount, 'amount');

      const expense = {
        id: randomUUID(),
        date: normalizeDate(body.date),
        category: asString(body.category, 'Other'),
        description: asString(body.description),
        amount,
        createdAt: new Date().toISOString(),
      };

      const state = await readState();
      const next = await writeState({ ...state, expenses: [...state.expenses, expense] });
      return sendJson(res, 201, { data: findById(next.expenses, expense.id) });
    }

    throw createHttpError(405, 'Method not allowed');
  }

  const match = pathname.match(/^\/api\/expenses\/([^/]+)$/);
  if (!match) {
    return false;
  }

  if (req.method !== 'DELETE') {
    throw createHttpError(405, 'Method not allowed');
  }

  ensureRole(authContext, FINANCE_WRITE_ROLES);

  const expenseId = decodePathParam(match[1]);
  const state = await readState();
  const exists = findById(state.expenses, expenseId);

  if (!exists) {
    throw createHttpError(404, 'Expense not found');
  }

  const nextExpenses = state.expenses.filter((item) => String(item.id) !== String(expenseId));
  await writeState({ ...state, expenses: nextExpenses });
  return sendNoContent(res);
}

async function handleRevenue(req, res, pathname, authContext) {
  if (pathname === '/api/revenue') {
    if (req.method === 'GET') {
      ensureRole(authContext, READ_ROLES);
      const state = await readState();
      return sendJson(res, 200, { data: state.revenue });
    }

    if (req.method === 'POST') {
      ensureRole(authContext, FINANCE_WRITE_ROLES);

      const body = await readJsonBody(req);
      const quantity = asNonNegativeNumber(body.quantity, 'quantity');
      const unitPrice = asNonNegativeNumber(body.unitPrice, 'unitPrice');

      const revenue = {
        id: randomUUID(),
        date: normalizeDate(body.date),
        product: asString(body.product, 'Milk'),
        quantity,
        unitPrice,
        total: quantity * unitPrice,
        createdAt: new Date().toISOString(),
      };

      const state = await readState();
      const next = await writeState({ ...state, revenue: [...state.revenue, revenue] });
      return sendJson(res, 201, { data: findById(next.revenue, revenue.id) });
    }

    throw createHttpError(405, 'Method not allowed');
  }

  const match = pathname.match(/^\/api\/revenue\/([^/]+)$/);
  if (!match) {
    return false;
  }

  if (req.method !== 'DELETE') {
    throw createHttpError(405, 'Method not allowed');
  }

  ensureRole(authContext, FINANCE_WRITE_ROLES);

  const revenueId = decodePathParam(match[1]);
  const state = await readState();
  const exists = findById(state.revenue, revenueId);

  if (!exists) {
    throw createHttpError(404, 'Revenue record not found');
  }

  const nextRevenue = state.revenue.filter((item) => String(item.id) !== String(revenueId));
  await writeState({ ...state, revenue: nextRevenue });
  return sendNoContent(res);
}

async function requestRouter(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') {
    return sendNoContent(res);
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'milk-farm-api',
      time: new Date().toISOString(),
    });
  }

  if (pathname.startsWith('/api/auth')) {
    if (pathname === '/api/auth/login') {
      return handleAuth(req, res, pathname, null);
    }

    const authContext = await requireAuth(req);
    const handled = await handleAuth(req, res, pathname, authContext);
    if (handled !== false) return;

    throw createHttpError(404, 'Route not found');
  }

  let authContext = null;
  if (pathname.startsWith('/api/')) {
    authContext = await requireAuth(req);
  }

  if (req.method === 'GET' && pathname === '/api/dashboard/summary') {
    ensureRole(authContext, READ_ROLES);
    const state = await readState();
    return sendJson(res, 200, { data: computeSummary(state) });
  }

  if (pathname === '/api/state') {
    if (req.method === 'GET') {
      ensureRole(authContext, READ_ROLES);
      const state = await readState();
      return sendJson(res, 200, { data: state });
    }

    if (req.method === 'PUT') {
      ensureRole(authContext, ADMIN_ROLES);

      const body = await readJsonBody(req);
      if (!body || typeof body !== 'object') {
        throw createHttpError(400, 'body must be a JSON object');
      }

      const next = await writeState(body);
      return sendJson(res, 200, { data: next });
    }

    throw createHttpError(405, 'Method not allowed');
  }

  if (pathname.startsWith('/api/farmers')) {
    const handled = await handleFarmers(req, res, pathname, authContext);
    if (handled !== false) return;
  }

  if (pathname.startsWith('/api/expenses')) {
    const handled = await handleExpenses(req, res, pathname, authContext);
    if (handled !== false) return;
  }

  if (pathname.startsWith('/api/revenue')) {
    const handled = await handleRevenue(req, res, pathname, authContext);
    if (handled !== false) return;
  }

  throw createHttpError(404, 'Route not found');
}

let initPromise = null;

async function init() {
  await ensureStateFile();
  const authSetup = await ensureAuthFile();

  if (authSetup.created && !process.env.VERCEL) {
    console.log('[milk-farm-api] auth store created with default users:');
    console.log(`- admin: ${DEFAULT_USERS[0].username} / ${DEFAULT_USERS[0].password}`);
    console.log(`- accountant: ${DEFAULT_USERS[1].username} / ${DEFAULT_USERS[1].password}`);
    console.log(`- viewer: ${DEFAULT_USERS[2].username} / ${DEFAULT_USERS[2].password}`);
    console.log('[milk-farm-api] change these credentials in backend/data/auth.json for production usage.');
  }
}

async function handle(req, res) {
  if (!initPromise) {
    initPromise = init();
  }

  await initPromise;

  return requestRouter(req, res).catch((error) => {
    const statusCode = Number(error.statusCode) || 500;
    const message = statusCode >= 500 ? 'Internal server error' : error.message;

    if (statusCode >= 500) {
      console.error('Unhandled API error:', error);
    }

    return sendJson(res, statusCode, { error: message });
  });
}

function startServer() {
  const server = http.createServer((req, res) => {
    handle(req, res);
  });

  server.listen(PORT, HOST, () => {
    console.log(`[milk-farm-api] listening on http://${HOST}:${PORT}`);
    console.log(`[milk-farm-api] CORS origin: ${CORS_ORIGIN}`);
    console.log(`[milk-farm-api] session ttl ms: ${SESSION_TTL_MS}`);
    console.log(`[milk-farm-api] state file: ${STATE_FILE}`);
    console.log(`[milk-farm-api] auth file: ${AUTH_FILE}`);
  });
}

module.exports = { handle, startServer };

if (require.main === module && !process.env.VERCEL) {
  Promise.resolve()
    .then(() => startServer())
    .catch((error) => {
      console.error('[milk-farm-api] failed to start', error);
      process.exit(1);
    });
}
