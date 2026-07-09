# USDT ⇄ ILS Exchange

Compliance-first USDT↔ILS exchange website for Israeli users (default language: **Hebrew / RTL**), plus a Windows desktop ops app.

## Project layout

| Path | Role |
|------|------|
| `frontend/` | React (CRA + CRACO), i18n `en` / `he` / `ar` |
| `backend/server.py` | FastAPI + MongoDB (Vercel serverless) |
| Desktop app | `C:\Users\Administrator\Desktop\源码\程序\后台.py` |

## Environment variables

Set these in Vercel (Production / Preview) or `backend/.env` locally:

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGO_URL` | Yes | MongoDB Atlas connection string (`MONGODB_URI` also accepted) |
| `JWT_SECRET` | Yes | Long random secret for admin JWT. **Do not** derive from `MONGO_URL` |
| `ADMIN_PATH` | Recommended | Fallback admin URL path if not set in MongoDB config |
| `TG_BOT` / `TG_CHAT_ID` | Optional | Telegram ops alerts (Chinese text OK — ops only) |
| `VERCEL_ENV` | Auto | Set by Vercel (`production` / `preview`) |

See `backend/.env.example`. `backend/.env` is gitignored and must never be committed.

## Admin entry

1. Set `adminPath` in MongoDB `config` (or `ADMIN_PATH` env).
2. Open `https://your-domain{adminPath}` (hidden path, not linked publicly).
3. Log in with the admin access key stored as a **bcrypt hash** in MongoDB.
4. Production refuses the built-in development default password.

## Default language

- Default: Hebrew (`he`), `dir=rtl`
- Switcher: English / Hebrew / Arabic
- API errors are English codes; the frontend maps them via `apiErrors.js` + `translations.js`

## Deploy (Vercel)

1. Connect the repo; root is the project folder containing `vercel.json`.
2. Configure env vars above.
3. Atlas Network Access: allow Vercel egress (or `0.0.0.0/0` if needed).
4. Frontend build uses **npm** + `frontend/package-lock.json` (`npm install` / `npm run build` in `vercel.json`).
5. Preview CORS allows `https://*.vercel.app` when `VERCEL_ENV=preview`.

> Note: This project uses the legacy `builds` + `routes` style in `vercel.json` (Python API + CRA frontend in one repo). Do **not** mix a top-level `functions` block with `builds` — Vercel will fail the deployment.

Python Lambda size limit is set via `maxLambdaSize` on the Python build. For `maxDuration` / memory, set them in the Vercel project **Settings → Functions** if needed.

## Local development

```bash
# Backend
cd backend
pip install -r requirements.txt
# copy .env.example → .env and fill values
uvicorn server:app --reload --port 8000

# Frontend
cd frontend
npm ci
npm start
```

Proxy: `frontend/src/setupProxy.js` forwards `/api` → `localhost:8000`.

## Security notes

- Admin password is hashed (bcrypt); `GET /api/admin/config` never returns the plaintext password.
- Visitor chat reads require `session_id` + `visitor_phone` (header/query).
- Chat images use short-lived signed URLs.
- Login and chat write endpoints are IP rate-limited in MongoDB.
- Chat data retention: **72 hours** (TTL + cleanup job, including GridFS).

## Desktop ops app

- Source: `后台.py`; build via `build.bat` / `打包.bat` → `python build.py`
- Spec: `ExchangeAdmin.spec` (`console=False`, `UPX=False`)
- Requires `logo.ico` next to the spec
- Config/session: Windows `%LOCALAPPDATA%\ExchangeAdmin\` (encrypted), not hardcoded secrets
- Ops UI language: Chinese; chat bubbles keep Hebrew/RTL habits; times use `Asia/Jerusalem` 24h

## Legal pages

- `/terms`, `/privacy` — real routes (Footer Contact opens WhatsApp)
