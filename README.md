# DocuChat API

AI-powered document Q&A backend. Express, TypeScript, Prisma 7 and SQLite, with a routes, services, database layered structure.

## Setup

Requires Node.js 24.

```bash
git clone <repo-url>
cd docu_CHAT
npm install

# Environment: copy the template, then fill in the two JWT secrets
cp .env.example .env
# Generate each secret with:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values.

# Create the database
npx prisma migrate dev

# Run the server (http://localhost:3000)
npm run dev
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start with auto-reload |
| `npm start` | Start the server |
| `npm test` | Run unit and integration tests |
| `npm run test:coverage` | Run tests with a coverage report |

## Tests

Tests use a separate database (`test.db`) so development data is never touched. The test setup refuses to run against any other database.

```bash
# 1. Create .env.test (throwaway values, safe to share)
cat > .env.test << 'EOT'
DATABASE_URL="file:./test.db"
JWT_ACCESS_SECRET=test-access-secret-at-least-thirty-two-characters-long
JWT_REFRESH_SECRET=test-refresh-secret-at-least-thirty-two-characters-long
NODE_ENV=test
EOT

# 2. Create the test database
DATABASE_URL=file:./test.db npx prisma migrate deploy

# 3. Run the tests
npm test
```

## API

- Health check: `GET /health`
- Interactive docs (Swagger UI): `/api-docs`
- Raw OpenAPI spec: `/api-docs.json`

All endpoints are under `/api/v1`. Every endpoint except `/auth/*` requires `Authorization: Bearer <accessToken>`.

| Method | Path | Description |
| --- | --- | --- |
| POST | `/auth/register` | Create an account |
| POST | `/auth/login` | Get access and refresh tokens |
| POST | `/auth/refresh` | Rotate the refresh token |
| POST | `/auth/logout` | Revoke a refresh token |
| GET | `/documents` | List your documents (`page`, `limit`, `status`) |
| POST | `/documents` | Create a document |
| GET | `/documents/:id` | Get a document |
| DELETE | `/documents/:id` | Delete a document (soft delete) |
| GET | `/conversations` | List your conversations |
| POST | `/conversations` | Start a conversation |
| GET | `/conversations/:id/messages` | Get messages |
| POST | `/conversations/:id/messages` | Send a message |

Responses use `{ success, data }` for success and `{ success: false, error: { code, message } }` for errors. The auth token endpoints return tokens at the top level.

## Notes

- `.env`, `.env.test` and the `*.db` files are never committed.
- IDs are `cuid()` by default. Endpoints also accept legacy UUIDs.
