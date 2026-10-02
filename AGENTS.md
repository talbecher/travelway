<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- My Maps import writes source + recs + links via the `import_my_map` RPC (one transaction) and makes no Google Places calls (no photo/rating enrichment). Why: no orphan imported recs, and imports must not burn SearchText quota.
- Read-only AI API (`/api/public/trip-context`) authorizes every request via the server-only `api_resolve_token` RPC (hash, scope, live owner/shared check) and then reads with the admin client filtered by the resolved trip id; `api_tokens` has no client grants. Why: PATs are not Supabase sessions, so RLS cannot see them and the guard must live in one place.
- Name lookups on `recommendations` filter by the generated `name_norm` column (= lower(btrim(name))), not the expression. Why: RLS runs as a security barrier, so only leakproof index quals skip per-row `can_access_trip`; an expression filter caused My Maps import timeouts.
