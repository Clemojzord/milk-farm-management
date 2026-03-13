# Backend API

This backend provides authenticated REST APIs for the Milk Farm app.

## Run

From the project root:

```bash
npm run api
```

Default URL: `http://localhost:4000`

Optional environment variables:

- `API_PORT` (default `4000`)
- `API_HOST` (default `0.0.0.0`)
- `CORS_ORIGIN` (default `*`)
- `SESSION_TTL_MS` (default `43200000`, 12 hours)

## Authentication

The API uses bearer tokens from `POST /api/auth/login`.

Default users (created when `backend/data/auth.json` does not exist):

- `admin / admin123`
- `accountant / accountant123`
- `viewer / viewer123`

Auth endpoints:

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/auth/users` (admin only)

## Role Access Matrix

- `admin`: full access
- `accountant`: read all + write expenses and revenue
- `viewer`: read-only access

## Domain Endpoints

- `GET /api/health`
- `GET /api/state` (all authenticated users)
- `PUT /api/state` (admin)
- `GET /api/dashboard/summary` (all authenticated users)

### Farmers

- `GET /api/farmers` (all)
- `POST /api/farmers` (admin)
- `GET /api/farmers/:id` (all)
- `PATCH /api/farmers/:id` (admin)
- `DELETE /api/farmers/:id` (admin)
- `POST /api/farmers/:id/deliveries` (admin)
- `POST /api/farmers/:id/mark-paid` (admin)

### Expenses

- `GET /api/expenses` (all)
- `POST /api/expenses` (admin/accountant)
- `DELETE /api/expenses/:id` (admin/accountant)

### Revenue

- `GET /api/revenue` (all)
- `POST /api/revenue` (admin/accountant)
- `DELETE /api/revenue/:id` (admin/accountant)