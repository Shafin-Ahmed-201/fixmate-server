# FixMate API

Express + MongoDB REST API for **FixMate** — an on-demand device & home appliance repair
service platform. Pairs with the Next.js client in `fixmate-client`.

- **Auth:** BetterAuth (hosted by the Next.js app) → JWT bridge verified here
- **Database:** MongoDB (`fixmateDB`) shared with BetterAuth's `user` / `session` / `account` collections
- **Payments:** Stripe Checkout (test mode) + webhook

---

## Quick start

```bash
npm install
cp .env.example .env    # then fill in the values
npm run seed            # demo data (admin, technicians, customers, 14 services, bookings)
npm run dev             # http://localhost:5000  (auto-restarts on change)
```

Production: `npm start`.

### Environment (`.env`)

| Variable | Description |
| --- | --- |
| `PORT` | API port (default `5000`) |
| `CLIENT_URL` | Allowed CORS origin, e.g. `http://localhost:3000` |
| `MONGODB_URI` | MongoDB connection string (same DB the client uses) |
| `DB_NAME` | Database name (default `fixmateDB`) |
| `BETTER_AUTH_SECRET` | Must match the client's `BETTER_AUTH_SECRET` (HS256 token fallback) |
| `AUTH_BASE_URL` | BetterAuth base URL (the Next.js origin) |
| `AUTH_JWKS_URL` | JWKS endpoint (defaults to `<AUTH_BASE_URL>/api/auth/jwks`) |
| `STRIPE_SECRET_KEY` | Stripe test secret key |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret — empty = signature check skipped (dev only) |

### Seeded credentials

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@fixmate.com` | `Admin@1234` |
| Technician | `arif.hassan@fixmate.com` | `Technician@123` |
| Technician | `sumaiya.khan@fixmate.com` | `Technician@123` |
| Customer | `rahim.customer@fixmate.com` | `Customer@123` |
| Customer | `jasmin.customer@fixmate.com` | `Customer@123` |

---

## Authentication

1. The Next.js app hosts BetterAuth; clients obtain a JWT from it
   (`GET /api/auth/token`, or the `set-auth-jwt` response header on `get-session`).
2. Send it as `Authorization: Bearer <token>`.
3. This API verifies it:
   - **EdDSA/RS256…** (BetterAuth default) → signature checked against the published JWKS
     at `GET /api/auth/jwks` (fetched & cached, `kid` matched).
   - **HS256** → checked against `BETTER_AUTH_SECRET`.
4. The user is then re-loaded from the database, so role changes take effect immediately.

Middlewares: `verifyToken` (401), `verifyCustomer` / `verifyTechnician` / `verifyAdmin` (403).
Ownership is always checked (`req.user.email === resource.email`).

---

## Job status state machine (strictly enforced)

```
requested ──▶ accepted ──▶ in-progress ──▶ completed ──▶ paid   (Stripe only)
   │              │
   ├─▶ rejected   (technician, final)
   └─▶ cancelled  (customer, final)
```

- One-way, one step at a time — anything else returns **400**.
- `completed` requires `finalAmount > 0`.
- `completed → paid` happens only through the Stripe webhook / `payments/verify`, once per booking.

---

## API reference

### Public
| Method | Route | Notes |
| --- | --- | --- |
| GET | `/api/services` | `search`, `category`, `serviceMode`, `sort` (`price_asc`\|`price_desc`\|`newest`), `page`, `limit` — approved & available only |
| GET | `/api/services/:id` | Single approved & available service |
| GET | `/api` | Health/info |

### Authenticated (`verifyToken`)
| Method | Route | Notes |
| --- | --- | --- |
| PATCH | `/api/users/profile` | Update `name`, `phone`, `area`, `bio`, `image` (never `role`/`email`) |

### Customer (`verifyToken`, `verifyCustomer`)
| Method | Route | Notes |
| --- | --- | --- |
| POST | `/api/bookings` | Create booking (≥20 char problem, future date, no duplicates) |
| GET | `/api/bookings/my` | Own bookings |
| PATCH | `/api/bookings/:id/cancel` | Only from `requested` |
| GET | `/api/payments/my` | Payment history |
| POST | `/api/payments/create-checkout-session` | Amount read from DB (`finalAmount`) |
| GET | `/api/payments/verify?session_id=…` | Verify + record idempotently |

### Technician (`verifyToken`, `verifyTechnician`)
| Method | Route | Notes |
| --- | --- | --- |
| GET | `/api/services/my` | Own services |
| POST | `/api/services` | Created as `pending` |
| PATCH | `/api/services/:id` | Content edits reset `approvalStatus` → `pending`; `isAvailable` toggle does not |
| DELETE | `/api/services/:id` | Own services only |
| GET | `/api/bookings/technician` | Assigned bookings (`?status=` filter) |
| PATCH | `/api/bookings/:id/status` | State machine + `finalAmount` on completion |

### Admin (`verifyToken`, `verifyAdmin`)
| Method | Route | Notes |
| --- | --- | --- |
| GET | `/api/admin/stats` | Counts, revenue, recent bookings |
| GET | `/api/admin/users` | All users |
| PATCH | `/api/admin/users/:id/role` | Admins cannot change their own role |
| GET | `/api/admin/services` | `?approvalStatus=` filter |
| PATCH | `/api/admin/services/:id/approval` | `approved` / `rejected` |
| GET | `/api/admin/bookings` | `?status=` filter |
| GET | `/api/admin/payments` | All payments |

### Webhook
| Method | Route | Notes |
| --- | --- | --- |
| POST | `/api/webhook/stripe` | Handles `checkout.session.completed`; raw body + signature verification; idempotent |

```bash
# local webhook testing
stripe listen --forward-to localhost:5000/api/webhook/stripe
```

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run with `node --watch` |
| `npm start` | Run once |
| `npm run seed` | Idempotent demo data (users, 14 approved services, bookings, 1 payment) |

## Project structure

```
index.js                  # boot: env → DB → app → listen (+ graceful shutdown)
src/
  app.js                  # Express factory: CORS, parsers, routers, error handling
  config/db.js            # Mongo connection, indexes, collection helpers
  config/stripe.js        # Lazy Stripe client
  middleware/auth.js      # verifyToken / verifyCustomer / verifyTechnician / verifyAdmin
  middleware/error.js     # 404 + centralized error responder
  middleware/logger.js    # request access log
  routes/*.routes.js      # services, users, bookings, payments, admin, webhook
  services/payment.service.js  # single idempotent payment recorder (webhook + verify)
  seed/seed.js            # npm run seed
  utils/                  # ApiError/asyncHandler, JWT verification, state machine, constants
```

## Packages

`express`, `mongodb`, `cors`, `dotenv`, `stripe`, `jsonwebtoken` (HS256 tokens),
`jose` (JWKS / EdDSA verification), `@better-auth/utils` (seed password hashing —
identical scrypt parameters to BetterAuth).
