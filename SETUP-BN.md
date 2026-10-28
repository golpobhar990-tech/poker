# সর্বশেষ multi-game setup-এর জন্য UPDATE-BN.md পড়ুন।

# বাংলায় সেটআপ

এটি virtual chips-এর multiplayer poker app। Chips কেনাবেচা, USDT, deposit বা withdraw নেই। কোনো fake player বা demo account বানানো হয় না।

## ১. যা লাগবে

- Node.js 24 বা নতুন সংস্করণ।
- Aiven-এ PostgreSQL service। MySQL service এই প্রজেক্টে কাজ করবে না।
- Cloudinary account-এর Cloud name, API key ও API secret।
- Node.js process চালাতে পারে এমন hosting; শুধু HTML/static hosting যথেষ্ট নয়।

## ২. Dependency install

ZIP extract করে `poker` folder-এর terminal-এ চালাও:

```bash
npm ci
```

## ৩. Aiven database

Aiven console থেকে PostgreSQL service-এর connection URI নিয়ে `.env`-এর `DATABASE_URL`-এ বসাও। Password-এ বিশেষ character থাকলে URL-encode করতে হবে। Service hostname, port, database name ও password তোমার নিজের account-এর তথ্য হবে।

Aiven-এর CA certificate download করে `certs/ca.pem` নামে রাখো। `.env`-এ থাকবে:

```dotenv
DATABASE_URL=postgres://YOUR_USER:YOUR_URL_ENCODED_PASSWORD@YOUR_HOST:YOUR_PORT/YOUR_DATABASE
AIVEN_CA_PATH=./certs/ca.pem
```

উপরের URI শুধু format দেখায়; সরাসরি কপি করে চালালে connect হবে না। নিজের URI বসাতে হবে। TLS certificate verification বন্ধ করা হয়নি।

```bash
npm run db:check
```

এটি SQL schema ও ছয়টি খালি table configuration তৈরি করে এবং connection পরীক্ষা করে। কোনো player বা fake hand তৈরি করে না। আগের SQLite database এই ZIP-এ দেওয়া হয়নি এবং তা স্বয়ংক্রিয়ভাবে Aiven-এ import হবে না।

## ৪. Cloudinary

`.env`-এ তোমার তথ্য বসাও:

```dotenv
CLOUDINARY_CLOUD_NAME=YOUR_CLOUD_NAME
CLOUDINARY_API_KEY=YOUR_API_KEY
CLOUDINARY_API_SECRET=YOUR_API_SECRET
```

Profile photo server হয়ে Cloudinary-তে upload হবে। SQL-এ URL থাকবে। Secret কখনো `public/` folder-এ দেবে না। Credentials না থাকলে upload error দেখাবে; fake success দেখাবে না।

## ৫. Admin account

প্রথমবার `.env`-এ নিচের চারটি value বসাও:

```dotenv
ADMIN_EMAIL=YOUR_ADMIN_EMAIL
ADMIN_USERNAME=YOUR_ADMIN_USERNAME
ADMIN_NAME=Club administrator
ADMIN_PASSWORD=YOUR_LONG_UNIQUE_PASSWORD
```

Username ৩–২৫টি lowercase letter/digit/underscore; প্রথমটি letter। Password ১০–১২৮ character। এরপর:

```bash
npm run admin:create
```

সফল হলে `.env` থেকে `ADMIN_PASSWORD` মুছে দাও। একই email/username-এর account আগে থাকলে command সেটিকে admin করে দেবে না; নতুন admin credentials বেছে নিতে হবে। Default admin password দেওয়া নেই।

## ৬. চালানো

```bash
npm start
```

Browser-এ `http://localhost:5000` খোলো। Admin account দিয়ে সরাসরি `/admin`-এ login করো। Player ও admin login আলাদা।

Windows-এ `.env` পূরণ করার পরে `START-WINDOWS.bat` চালাতে পারো। প্রথম admin তৈরির command আলাদাভাবে একবার চালাতে হবে।

## ৭. কী কাজ করবে

- User signup/login, profile photo, settings ও hand history।
- দুইজন player seat নিলে দশ সেকেন্ড পরে hand auto-start। পরের hand-ও countdown শেষে শুরু হবে।
- No-limit all-in, side pots, split pot, unmatched chips refund ও winner animation।
- Refresh/reconnect-এর পরে persisted hand ফিরে পাওয়া; অন্যের hole cards গোপন রাখা।
- Admin থেকে user ban/unban, virtual-chip adjustment, খালি table-এর configuration, hand/ledger/audit দেখা।
- নতুন account-এ ০ chips; admin panel থেকে chips দিতে হবে। Chips-এর cash value নেই।

Admin screen-এ latest ৫০০ user, ১০০ hand, ২০০ ledger entry ও ১০০ audit entry দেখা যায়। Filter ওই loaded records-এর ওপর কাজ করে; পুরোনো records SQL-এ থাকে।

## ৮. Hosting configuration

Production-এ HTTPS ব্যবহার করে সেট করো:

```dotenv
NODE_ENV=production
COOKIE_SECURE=1
PORT=5000
```

Host যে port চায় সেটি দেবে। Aiven host/port ও Cloudinary-তে outbound connection থাকতে হবে। একই database-এ সব app instance connect করবে। Backup ও process restart configure করো।

## ৯. পরীক্ষা ও সীমাবদ্ধতা

৪২টি automated check পাস করেছে। Test source code development verification-এর জন্য; app-এ bot বা fake activity যোগ করে না।

তোমার credentials ছাড়া live Aiven/Cloudinary connection পরীক্ষা করা হয়নি। PostgreSQL compatibility check emulator-এ হয়েছে। এই update-এ ৬৪টি browser layout check পাস করেছে। Release-এর আগে নিজের database-এ `npm run db:check`, real profile photo upload এবং দুইটি আলাদা browser session দিয়ে gameplay পরীক্ষা করবে। বিস্তারিত architecture ও সীমাবদ্ধতা `README.md`-এ আছে।

এই package-এ email password reset, email verification, tournaments ও spectators যোগ করা হয়নি।
