# VPS Deployment Notes

Target: Ubuntu 22.04 VPS with PostgreSQL, Nginx, Certbot, and PM2 installed directly on the server.

## Environment

Copy `.env.example` to `.env` and fill every production secret:

```bash
cp .env.example .env
```

Important values:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ADMIN_IDS`
- `TELEGRAM_GROUP_ID`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `WHATSAPP_API_URL`
- `WHATSAPP_API_KEY`
- `WHATSAPP_DEFAULT_COUNTRY_CODE`
- `NEXT_PUBLIC_APP_URL`

## Database

```bash
npm install
npm run prisma:generate
npm run prisma:deploy
npm run seed
```

## Build

```bash
npm run build
```

## Email

Dish2Door sends transactional email with Nodemailer and Gmail SMTP app password.

- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=465`
- `SMTP_SECURE=true`
- `SMTP_USER` is the Gmail address.
- `SMTP_PASS` is the Gmail app password, not the normal Gmail login password.
- `SMTP_FROM` should be formatted like `Dish2Door <your_gmail@gmail.com>`.

## PM2

```bash
pm2 start npm --name campus-food-web -- start
pm2 start npm --name campus-food-telegram -- run telegram:start
pm2 save
pm2 startup
```

## WhatsApp Sender API

Dish2Door calls the existing secured WAHA sender wrapper, not WAHA directly.

- `WHATSAPP_API_URL` should point to the sender endpoint, for example `http://<vps-ip>:3002/send-text`.
- `WHATSAPP_API_KEY` is sent as the `x-service-key` header.
- Request body is `{ "phone": "<international digits>", "text": "<message>" }`.
- For local Indian 10-digit numbers, set `WHATSAPP_DEFAULT_COUNTRY_CODE=91`.

## Nginx

Reverse proxy the domain to Next.js on port `3000`:

```nginx
server {
  server_name your-domain.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
```

Then enable SSL:

```bash
sudo certbot --nginx -d your-domain.com
```

## Seeded Local Users

- Admin: `admin@campus.local` / `admin123`
- Delivery: `delivery@campus.local` / `delivery123`

Change these immediately for production.
