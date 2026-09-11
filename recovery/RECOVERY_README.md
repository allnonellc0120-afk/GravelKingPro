# GravelKing Pro Production Master

Sanitized migration package: source tree, deployment automation, schema blueprint, and Android release artifact.

Excluded intentionally: `.env` files, credentials, OAuth tokens, private/signing keys, node_modules, Git internals, caches, generated dist trees, attached upload staging, and prior backup archives.

1. Copy `.env.example` to `.env` and fill the required values securely.
2. Set `DATABASE_URL`.
3. Run `chmod +x deploy.sh && ./deploy.sh` from the package root.
4. Review the target before importing the schema into production.
