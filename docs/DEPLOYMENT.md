# Deployment

1. Complete [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
2. Deploy the Next.js app to any Node host (Vercel, Netlify, Fly, a container). Required env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.
3. Schedule the purge job (hourly).
4. **Upload size**: `/api/media` receives files through the Next.js server. Serverless hosts cap request bodies (e.g. 4.5 MB on Vercel), which limits photos/videos there. For large video on serverless, switch to Supabase signed upload URLs (the sniffing/validation then moves to a post-upload check) or self-host the Node server.
5. Rate limiting in `src/lib/rate-limit.ts` is per instance; use an edge/KV limiter when running multiple instances. DB-level limits (messages, space creation) are global.
6. Monitoring: watch Supabase logs/advisors, add an error reporter (e.g. Sentry) around server actions and route handlers.

## Current production

- **URL:** https://skyberry.vercel.app (Vercel project `skyberry`, team "qaessafty-arch's projects", free plan, region iad1).
- **Linked repository:** `qaessafty-arch/Skyberry-`; production branch `main`. Pushes to `main` deploy production; other branches get preview URLs.
- **Environment variables set:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable), `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_UPLOAD_LIMIT_MB=4`.
- **Still to add by the owner (Vercel → Project → Settings → Environment Variables, type *Sensitive*, Production):** `SUPABASE_SERVICE_ROLE_KEY` (Supabase secret key) and `CRON_SECRET` (any random 32+ characters). Without them, *Delete account* and the daily Moment purge return an error; everything else works. Redeploy after adding.
- **Cron:** `vercel.json` runs `/api/cron/purge` daily at 03:17 UTC (Hobby plans allow daily jobs). Expired Moments are hidden by the database immediately; the job only removes their files.
- **Uploads:** photos are resized in the browser to ≤2048 px before upload, clips are recorded at ~0.9 Mbps; the upload cap is 4 MB to stay under Vercel's request limit.
- **Supabase Auth:** Site URL `https://skyberry.vercel.app`; redirect allow-list includes it plus localhost.
- **Verified on production:** two-user phone flow 26/26, 0 console errors; security headers present; cron endpoint rejects unauthenticated calls.
