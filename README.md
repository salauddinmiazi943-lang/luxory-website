# eshop. multi-vendor storefront

A bilingual (English/Bangla) electronics storefront built with Next.js App Router, TypeScript, Tailwind CSS, MongoDB/Mongoose, JWT cookies and Cloudinary. Next.js route handlers provide the API.

## Requirements

- Node.js 20.9 or newer and npm
- MongoDB Atlas database
- Cloudinary account
- Optional LibreTranslate-compatible translation endpoint

## Local setup

1. Install packages: `npm install`
2. Copy `.env.example` to `.env.local` and fill in the values. Keep `.env.local` private; it is ignored by git.
3. Configure the database, image uploader and (optionally) translation service described below.
4. Create the first admin and sample catalog: `npm run seed`
5. Start the app: `npm run dev`, then open `http://localhost:3000`

### Environment variables

| Variable | Purpose |
| --- | --- |
| `MONGO_USER` | MongoDB Atlas database username |
| `MONGO_PASS` | MongoDB Atlas database user's password |
| `JWT_SECRET` | Random signing key of at least 32 characters |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret; server only |
| `TRANSLATE_API_URL` | Optional LibreTranslate-compatible `/translate` endpoint |
| `SUPER_ADMIN_NAME` | Name for the initial super-admin |
| `SUPER_ADMIN_EMAIL` | Email for the initial super-admin |
| `SUPER_ADMIN_PASSWORD` | Initial super-admin password (12+ characters) |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL used for metadata |
| `VENDOR_PRODUCTS_REQUIRE_APPROVAL` | Set to `false` to publish vendor product edits immediately; defaults to approval required |

Configure Atlas network access for the app host and use a database user with only the permissions the app needs. The connection uses the current `cluster0.gk9hloq.mongodb.net` shard hosts directly to avoid SRV DNS lookups; if you replace the Atlas cluster, update its shard hosts and replica-set name in `src/lib/db.ts`. The seed command uses values from `.env.local` and creates the initial admin only when the email is not already present; it does not overwrite existing credentials.

### Cloudinary uploads

All category, banner, product, and vendor-document uploads use signed Cloudinary uploads. The server signs short-lived upload parameters; browser code sends the actual file directly to Cloudinary. Images are limited to JPEG, PNG and WebP, and vendor files also accept PDF. Configure Cloudinary credentials only in `.env.local`; never expose the API secret to the browser.

### Translation

When `TRANSLATE_API_URL` is set, the app sends English text to a LibreTranslate-compatible endpoint with `{ "q": "...", "source": "en", "target": "bn", "format": "text" }`. The endpoint must return a `translatedText` string. If it is unset, unavailable, times out, or returns an unusable response, the English text is saved as the Bangla fallback. Admins can update the stored English and Bangla fields independently.

## Features

- Responsive landing page, product search/listing, category pages and product detail
- Local-storage cart with authenticated customer cart synchronization
- COD checkout, stock validation/reservation, customer order history, and status flow
- Customer signup/login and role-specific admin/vendor dashboards
- Permission-checked category, banner, product, featured-product, booking, vendor-application and contact-message APIs
- Vendor applications, Cloudinary document uploads, approval and account activation/creation
- English/Bangla dictionaries for interface text and stored bilingual catalog fields
- Zod request validation, password hashing with bcrypt, signed HTTP-only session cookies, API rate limits and permission enforcement on the server

## API route groups

- `/api/auth/*`: register, login, logout and current session
- `/api/products`, `/api/categories`, `/api/banners`: public catalog reads and permission-protected management
- `/api/cart`, `/api/orders`: customer cart sync and COD orders; vendors see orders containing their items
- `/api/vendor-applications`, `/api/contact`: public forms with protected admin views/decisions
- `/api/admin/*`: summary and super-admin-only sub-admin management
- `/api/upload/signature`: restricted Cloudinary upload signatures

## Verification

Run `npm run lint` and `npm run build`.

## Deploying to Vercel

Import the repository into Vercel, configure all required environment variables in project settings (including the super-admin seed credentials), and deploy. Configure Atlas Network Access and Cloudinary upload settings for the deployed domain. Run `npm run seed` from a trusted environment connected to the production database before enabling the storefront. Do not copy `.env.local` into the repository.
