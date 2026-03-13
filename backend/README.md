# NestJS Ecommerce — Auth Backend

NestJS port of the Spring Boot `ecommerce` authentication backend.

## Features

- Email/password registration with email verification
- JWT access tokens (15 min) + refresh tokens (7 days)
- Max **3 concurrent sessions** — oldest session is evicted automatically
- **MFA / 2FA** — TOTP via Google Authenticator (setup, enable, disable)
- Login history — paginated audit log
- OAuth2 login — Google & GitHub
- Password reset via email
- Soft-delete account
- Rate limiting via `@nestjs/throttler`
- Global exception filter with structured JSON errors
- Swagger/OpenAPI docs at `/api/docs`
- Redis for access-token blacklisting & MFA temp tokens

## Quick start

```bash
cp .env.example .env
# Edit .env with your DB / Redis / email credentials

npm install
npm run start:dev
```

API runs on **http://localhost:4000**  
Swagger docs: **http://localhost:4000/api/docs**

## Environment variables

See `.env.example` for full list.

## Key endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/register` | — | Register |
| GET | `/api/v1/auth/verify-email/:token` | — | Verify email |
| POST | `/api/v1/auth/login` | — | Login |
| POST | `/api/v1/auth/mfa/validate` | — | Complete MFA login |
| POST | `/api/v1/auth/refresh` | — | Refresh tokens |
| POST | `/api/v1/auth/logout` | JWT | Logout |
| POST | `/api/v1/auth/logout-all` | JWT | Logout all sessions |
| POST | `/api/v1/auth/forgot-password` | — | Forgot password |
| POST | `/api/v1/auth/reset-password` | — | Reset password |
| POST | `/api/v1/auth/change-password` | JWT | Change password |
| POST | `/api/v1/auth/mfa/setup` | JWT | Start MFA setup |
| POST | `/api/v1/auth/mfa/verify` | JWT | Enable MFA |
| POST | `/api/v1/auth/mfa/disable` | JWT | Disable MFA |
| GET | `/api/v1/auth/oauth2/google` | — | Google OAuth2 |
| GET | `/api/v1/auth/oauth2/github` | — | GitHub OAuth2 |
| GET | `/api/v1/users/me` | JWT | Get profile |
| DELETE | `/api/v1/users/me` | JWT | Delete account |
| GET | `/api/v1/users/me/sessions` | JWT | List sessions |
| DELETE | `/api/v1/users/me/sessions/:id` | JWT | Logout session |
| GET | `/api/v1/users/me/login-history` | JWT | Login history |
