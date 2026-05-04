# Self-Hosting on Railway

This fork is prepared to run Kan as one Railway web service backed by Railway Postgres.

## Services

- `kan-web`: Next.js web app, API routes, auth, and tRPC.
- `Postgres`: Railway-managed PostgreSQL database.

## Required Variables

Set these on the Railway web service:

```env
NEXT_PUBLIC_BASE_URL=https://your-kan-app.up.railway.app
BETTER_AUTH_SECRET=replace-with-a-random-32-character-string
POSTGRES_URL=${{Postgres.DATABASE_URL}}
NEXT_PUBLIC_ALLOW_CREDENTIALS=true
NEXT_PUBLIC_DISABLE_SIGN_UP=false
BETTER_AUTH_TRUSTED_ORIGINS=https://your-kan-app.up.railway.app
NEXT_PUBLIC_WHITE_LABEL_HIDE_POWERED_BY=true
NEXT_PUBLIC_DISABLE_EMAIL=true
LOG_LEVEL=info
```

Generate a secret locally with:

```sh
openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32
```

## Deployment Config

`railway.json` tells Railway to:

- Build with Railpack using `pnpm railway:build`.
- Start the app with `pnpm railway:start`.

## Migrations

Run migrations manually after changing schema:

```sh
POSTGRES_URL="$(railway variable list --service Postgres --json | jq -r .DATABASE_PUBLIC_URL)" pnpm railway:migrate
```

## After Adding a Custom Domain

Update both values to the final HTTPS origin:

```env
NEXT_PUBLIC_BASE_URL=https://your-domain.com
BETTER_AUTH_TRUSTED_ORIGINS=https://your-domain.com
```
