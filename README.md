# The Mantra App

Inventory and sales management app built with Next.js + Convex.

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Run both the Next.js dev server and Convex backend concurrently:

```bash
npm run dev
npx convex dev
```

3. Open [http://localhost:3000](http://localhost:3000).

## Seeding an Admin User (Dev Only)

After resetting the database, you need to create an admin user. This only works when `IS_DEV=true` is set on your Convex deployment.

1. Set the environment variable:

```bash
npx convex env set IS_DEV true
```

2. Create an admin user:

```bash
npx convex run seed:createAdmin '{"email":"admin@example.com","password":"password123","name":"Admin"}'
```

3. Log in at [http://localhost:3000/login](http://localhost:3000/login) with those credentials.

If the user already exists and you just need to promote them:

```bash
npx convex run seed:promoteAdmin '{"email":"user@example.com"}'
```
