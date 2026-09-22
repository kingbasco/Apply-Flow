# ApplyFlow Development Supervisor

The supervisor automates the development verification loop.

It checks GitHub access, the production build, Vercel deployment status and logs, and the deployed site. When a check fails it asks the configured coding model to diagnose the evidence and return a small git patch. The patch is validated, committed, pushed, and the deployment is checked again.

## Required GitHub Actions secrets

- GEMINI_API_KEY
- VERCEL_TOKEN
- VERCEL_PROJECT_ID
- VERCEL_TEAM_ID

Optional:
- SUPERVISOR_MODEL (defaults to gemini-3.8-flash)
- SUPERVISOR_MAX_ATTEMPTS

Do not commit tokens.

## Run locally

npm run agent

## Loop

Build -> Vercel -> logs -> browser smoke test -> diagnosis -> patch -> commit -> push -> redeploy -> verify.

The supervisor has a hard five-attempt limit by default. It will stop instead of endlessly changing the code.

It does not disable authentication, RLS, deployment protection, domains, or environment variables to make a check pass.

Production remains controlled by the repository's normal Vercel Git deployment.

## Phase state

agent/state.json records the active development phase and the last verification result. agent/config.json defines the phase requirements.
