# Contributing to Salon Suite

Thank you for considering a contribution! Please follow these guidelines.

## Development Setup

```bash
git clone https://github.com/your-username/salon-suite.git
cd salon-suite
npm install
npm run dev
```

The server runs at http://localhost:4321 with `--watch` for live reload.

## Project Structure

```
server/          # Backend (Express 5, ESM)
  routes/        # public.js, admin.js
public/          # Frontend (vanilla ES modules, no build)
  js/            # site.js, admin.js, api.js
  css/           # site.css, admin.css
docs/            # Feature specs, architecture, API reference
scripts/         # seed, reset, backup
```

## Code Style

- **ES Modules** throughout (`import`/`export`)
- **No build step** — vanilla JS/CSS only
- **Integer pence** for all money (no floats)
- **UTC ISO strings** for timestamps, rendered in salon timezone
- **Prepared statements only** — no string concatenation in SQL
- **Scrypt + HMAC** for auth, roles enforced server-side

## Making Changes

1. Create a branch: `git checkout -b feature/your-feature`
2. Make changes, test with `npm run dev`
3. Run lint/check: `node --check server/*.js public/js/*.js`
4. Commit with clear messages
5. Push and open a Pull Request

## Testing

- Manual QA: run `npm run dev`, test flows in browser
- Mobile: test at 380px, 640px, 900px breakpoints
- Reset DB: `npm run reset` for clean seed data
- Health check: `curl http://localhost:4321/health`

## Documentation

Update relevant files in `docs/` when adding features:
- Architecture: `docs/02-architecture.md`
- Data model: `docs/03-data-model.md`
- API: `docs/04-api.md`
- Feature specs: `docs/01-features.md`

## Security

- Never commit `.env` or database files
- Report vulnerabilities privately
- All user input validated server-side
- CSP, rate limiting, CSRF protection enabled

## Questions?

Open an issue for bugs, features, or design questions.