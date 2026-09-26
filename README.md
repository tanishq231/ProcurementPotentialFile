# Parts Planner

A role aware parts planning workspace built with Next.js, TypeScript and PostgreSQL. It uses a spreadsheet style grid based on the supplied planner screenshot, supports CSV export, shows an activity feed with the name and field changes for each edit, and provides an Admin screen for account and role management and part deletion. Notification badges can be enabled or disabled per account.

## Project structure

- `frontend/` contains the planner interface and its global styles.
- `backend/` contains API handler implementations and server-side services for authentication, PostgreSQL access, activity tracking, and demo mode.
- `database/` contains the PostgreSQL schema and the database setup script.
- `src/app/` contains the small Next.js entry files. Page/layout files load the frontend; `src/app/api/` contains thin route adapters because Next.js requires HTTP route files to live under `app/`.
- `public/` contains static files served by Next.js, including the Stellantis logo.

## Run locally

1. Install Node.js 20 or later.
2. Copy `.env.example` to `.env.local` and set `DATABASE_URL` and a unique `SESSION_SECRET` (at least 32 random characters).
3. To create the first administrator, also set `ADMIN_EMAIL`, `ADMIN_PASSWORD` (10 or more characters), and optionally `ADMIN_NAME`.
4. Run `npm install`, then `npm run db:setup`, then `npm run dev`.
5. Visit `http://localhost:3000` and sign in with the administrator credentials. Admins add accounts and assign roles from **People & access**.

`db:setup` creates the PostgreSQL schema and inserts the first Admin account only when the configured email does not already exist. It leaves the parts table empty. Keep database credentials and the session secret in deployment environment variables, never in source control.

## Deploy

- **Web app:** Deploy this repository to Vercel. Configure `DATABASE_URL` and `SESSION_SECRET` in the Vercel project settings. Add the first Admin environment variables for the initial setup, and run `npm run db:setup` once against the production database.
- **Database:** Create a PostgreSQL database on Render and use its external connection URL as `DATABASE_URL`. Enable SSL for the deployed connection. Back up the database using Render's backup options.
- **Files:** The current planner stores structured rows in PostgreSQL and exports them as CSV; it does not upload files, so a separate Drive integration is not needed yet. If part attachments are added later, use Google Drive or object storage and save only the file URL and metadata in PostgreSQL.

## Role access

| Field | Admin | Sales | Planner | Purchase | Technical |
| --- | --- | --- | --- | --- | --- |
| Part no., description, supplier | Edit | Edit | Edit | Edit | Edit |
| Stock | Edit | View | Edit | View | View |
| AMC (average of the latest three monthly usage values) | Edit | View | Edit | View | View |
| Actual stock | Calculated for all roles | Calculated for all roles | Calculated for all roles | Calculated for all roles | Calculated for all roles |
| Coverage (days; Critical below 45 days) | Calculated for all roles | Calculated for all roles | Calculated for all roles | Calculated for all roles | Calculated for all roles |
| Back order | Edit | Edit | View | View | View |
| ETA | Edit | View | Edit | Edit | Edit |
| Sign to, remark, comments | Edit | Edit | Edit | Edit | Edit |
| Manage accounts and roles | Yes | No | No | No | No |

For AMC, Admins and Planners enter usage for the latest three months in the AMC cell; the displayed value averages the entered months and ignores blank months. Actual stock is calculated as Stock − Back order. Coverage (days) is calculated as Actual stock ÷ AMC × 30; it is read-only, and values below 45 are marked Critical. Coverage is blank when AMC is empty or zero.

Authentication uses password hashes and signed HTTP-only session cookies. Database APIs enforce the role permissions server-side as well as the interface.
