# Remaining Jobs

## New Backend Server

- Configure a public backend domain or subdomain for the new VPS `187.124.92.119`
- Add DNS record after boss confirms domain target
- Add Nginx reverse proxy from domain -> FastAPI on `127.0.0.1:8000`
- Install SSL certificate after DNS propagates
- Point web app backend base URL to the new FastAPI server after domain is live

## FastAPI Backend

- Remove or lock old Mac-specific routes and logic if not needed for web
- Add proper admin auth protection before exposing admin endpoints publicly
- Add Stripe billing endpoints and webhook handling
- Add user sync / bootstrap flow for Firebase-authenticated web users
- Add admin-facing data endpoints for:
  - users
  - subscriptions
  - reports
  - metadata / sessions
  - market data
  - purchase history
  - API key pool
  - analytics
- Implement promo area later
- Implement system settings editor later

## Web Admin Dashboard

- Connect `/brokeoctopus` tables to live FastAPI data
- Add row actions for each admin section
- Add loading, empty, and error states
- Add admin-only access guard

## Deployment

- Create persistent deployment process documentation for the new server
- Add Docker compose or systemd-managed startup if we want cleaner infra management later
- Add backup/restore procedure for the new Postgres database
