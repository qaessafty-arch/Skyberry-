# Deployment

1. Complete [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
2. Deploy the Next.js app to any Node host (Vercel, Netlify, Fly, a container). Required env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.
3. Schedule the purge job (hourly).
4. **Upload size**: `/api/media` receives files through the Next.js server. Serverless hosts cap request bodies (e.g. 4.5 MB on Vercel), which limits photos/videos there. For large video on serverless, switch to Supabase signed upload URLs (the sniffing/validation then moves to a post-upload check) or self-host the Node server.
5. Rate limiting in `src/lib/rate-limit.ts` is per instance; use an edge/KV limiter when running multiple instances. DB-level limits (messages, space creation) are global.
6. Monitoring: watch Supabase logs/advisors, add an error reporter (e.g. Sentry) around server actions and route handlers.

This repo has not been deployed anywhere; no paid infrastructure was provisioned.
