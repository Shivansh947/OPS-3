# OPS authentication and ride testing notes

Use the credentials in `/app/memory/test_credentials.md`.

1. Login with `POST /api/auth/login` and retain the returned bearer token.
2. Confirm `GET /api/auth/me` returns the matching user without a password.
3. Confirm public signup accepts only `user` or `driver`, never `admin`.
4. Confirm rider booking rejects non-positive or over-limit distance.
5. Confirm only a captain can accept a requested ride and only the assigned captain can progress it through valid states.
6. Confirm only the owning rider can submit one rating from 1 to 5 after completion.
