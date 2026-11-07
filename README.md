# Campusly web

Next.js (App Router) + Tailwind 4 web app for Campusly: the marketing site, sign-up and
onboarding, each institution's own website and sign-in on its sub-domain, the staff app, the
parent and student portal, and the platform admin.

## Run locally

```bash
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8200/api/v1" > .env.local
npx next dev --webpack -p 3200
```

Open http://localhost:3200 for the main site and http://campusly-demo.localhost:3200 for the
demo institution (see the API README for demo logins).

## Layout

- `src/app/` routes (`dashboard/` staff app and portal under `dashboard/my/`, `admin/`
  platform admin, `site/` institution website, `register`, `login`, `onboarding`).
- `src/components/ui-kit/` shared UI components (showcase at `/dashboard/ui-kit`).
- `src/lib/hr-nav.ts` navigation for staff and the portal; `src/lib/institution.tsx` the
  institution profile (words used on screen, modules switched on).
