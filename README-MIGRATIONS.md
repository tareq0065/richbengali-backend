# Migrations (Umzug + Sequelize)

Run migrations:
- Up: `npm run migrate:up`
- Down (all): `npm run migrate:down`
- Status: `npm run migrate:status`

Add a new migration:
1. Duplicate `src/migrations/0001-initial.js` as `src/migrations/0002-something.js`
2. Edit `up` to apply changes, and `down` to revert.

> Why not rely on `sequelize.sync()`?
> - `sync()` is great for local dev but **not versioned**, risky for prod (may drop or alter columns silently).
> - Migrations give you an **audit trail**, rollbacks, and safe deploys across environments.
