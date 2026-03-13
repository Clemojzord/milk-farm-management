# Milk Farm Management

React + Vite frontend with a Node.js backend API for milk farm operations.

## Project Structure

- `milk-farm-management-master/` -> frontend (Vite + React)
- `backend/` -> authenticated REST API with role-based access

## Run

From the workspace root:

```bash
npm run api
```

In another terminal:

```bash
npm run dev
```

Or run both from Windows:

```bash
start-app.bat
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

## Authentication Roles

- `admin` -> full access
- `accountant` -> read all, write expenses/revenue
- `viewer` -> read-only access

Default dev accounts:

- `admin / admin123`
- `accountant / accountant123`
- `viewer / viewer123`

## Config

Frontend API base URL can be changed with:

- `VITE_API_URL` (optional override)
- Default behavior: local dev uses `http://localhost:4000`, production uses same-origin `/api`

Backend options and endpoint docs are in `backend/README.md`.

## Deploy To Firebase

This repo is wired for:

- Firebase Hosting (frontend)
- Cloud Run (backend API), with Hosting rewrite `/api/** -> milk-farm-api`

### 1. Set your Firebase project

Update project id in `.firebaserc`:

```json
{
  "projects": {
    "default": "YOUR_FIREBASE_PROJECT_ID"
  }
}
```

### 2. Deploy backend API to Cloud Run

From workspace root:

```bash
npm run deploy:api
```

This deploys service `milk-farm-api` in `us-central1` (same values used by `firebase.json` rewrite).

### 3. Deploy frontend to Firebase Hosting

From workspace root:

```bash
npm run deploy:web
```

Hosting will serve the Vite build and proxy `/api/**` to Cloud Run.

### Optional: use a direct API URL

If you do not want Hosting rewrite routing, set frontend production env manually before deploy:

1. Copy `milk-farm-management-master/.env.production.example` to `.env.production`
2. Set `VITE_API_URL=https://YOUR_API_URL`

### Important data note

Backend data currently lives in local JSON files under `backend/data/`. On Cloud Run this storage is ephemeral and can reset on new instances/deploys. For persistent production data, move state/auth storage to Firestore or another managed database.
