# PSX Insight Deployment

## Supabase

1. Create a Supabase project.
2. Open the Supabase SQL Editor.
3. Run `supabase-schema.sql`.
4. Copy these values from Project Settings > API:
   - Project URL
   - `service_role` key

## Vercel

1. Import the GitHub repository in Vercel.
2. Set the root directory to `psx-insight` if this app is inside a parent repo.
3. Add environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET`
4. Deploy.

The Vercel cron in `vercel.json` calls `/api/news/refresh` every 30 minutes. The dashboard news endpoints read from Supabase and refresh stale data when needed.

## Manual News Refresh

After deployment, open:

```text
https://your-vercel-domain.vercel.app/api/news/refresh
```

If `CRON_SECRET` is set, call it with:

```text
Authorization: Bearer your-cron-secret
```
