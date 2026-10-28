# Poker Four Club v5 — সম্পূর্ণ code ও সেটআপ

## কী যোগ হয়েছে

মূল Hold’em সহ ৫টি multiplayer game, মোট ১০টি table। কোনো bot নেই। Chips কেনা, USDT, deposit, cash-out/withdraw বা টাকা পাওয়ার ব্যবস্থা নেই। Game-এর Return stack & leave শুধু table stack-কে virtual wallet-এ ফেরত আনে।

১. Hold’em: আগের ৬টি table অক্ষত।
২. Omaha: ৪টি private card; ঠিক ২টি private ও ৩টি community card দিয়ে hand; no-limit betting।
৩. Teen Patti — seen showdown club variant: ৩টি private card; সবাই সমান ante; এক round betting তারপর showdown। Blind/seen mode switching বা sideshow নেই। Trail > Pure sequence > Sequence > Colour > Pair > High card; AKQ > A23 > KQJ।
৪. Five-card Draw: ৫টি private card; প্রথম betting, একবার ০–৩টি card বদল, শেষ betting। Timeout হলে card রাখবে।
৫. Blackjack — shared-pot tournament: player বনাম player; house dealer নেই। সবার সমান entry pooled হয়। Hit/Stand; bust না হয়ে ২১-এর কাছে যে, সে জেতে। Natural দুই-card ২১ drawn ২১-এর চেয়ে বড়। Tie split; সবাই bust হলে entry ফেরত। Split/double/insurance/3:2 payout নেই।

সব game-এর table-এ বিস্তারিত rules আছে। কমপক্ষে ২জনের positive table stack থাকলে hand শেষে ১০ সেকেন্ড পরে আবার শুরু। ০ stack player sit out; wallet-এ admin-assigned chips নিয়ে leave/rejoin করতে হবে।

## Chips এবং ৫% fee

নতুন account-এ ০ chips। Welcome/daily free claim বন্ধ। Admin → Users → Adjust chips: 1000 দিলে যোগ, -1000 দিলে কমবে। Reason বাধ্যতামূলক। পুরোনো balances অপরিবর্তিত।

বিজয়ীর নিট লাভের ৫% পূর্ণ chips-এ নিচে round হয়: শুরু ১০০০, জিতে fee-এর আগে ১৩০০ হলে লাভ ৩০০, fee ১৫, final stack ১২৮৫। ১৯-এর কম লাভে fee ০। নিজের ফেরত bet বা refund-এ fee নেই। Club fee balance ও Fees tab-এ হিসাব থাকবে। এটি shared virtual treasury, admin-এর personal wallet নয়। Historical hand-এ নতুন করে fee কাটে না। Ledger-এর commission row হলো hand_result-এর মধ্যে আগে থেকেই অন্তর্ভুক্ত fee-এর বিবরণ; দুইটিকে আলাদা loss হিসেবে যোগ করবেন না।

## GitHub এবং Render

ZIP-এর `poker` folder খুলে সব source file ও `public`, `scripts`, `test`, `certs/README.txt` একসঙ্গে upload করুন। `.env`, `node_modules`, secret/certificate GitHub-এ দেবেন না। package.json repository root-এ থাকলে Root Directory ফাঁকা। যদি repository-এর ভিতরে poker folder-এ package.json থাকে, Root Directory হবে poker।

Build Command: `npm ci`
Start Command: `npm start`

Render Environment:
- NODE_VERSION: 24
- NODE_ENV: production
- COOKIE_SECURE: 1
- DATABASE_URL: Aiven PostgreSQL-এর সম্পূর্ণ Service URI
- AIVEN_CA_CERT: BEGIN CERTIFICATE থেকে END CERTIFICATE পর্যন্ত সম্পূর্ণ PEM text
- CLOUDINARY_CLOUD_NAME: নিজের Cloud name
- CLOUDINARY_API_KEY: নিজের API key
- CLOUDINARY_API_SECRET: নিজের secret

PORT Render নিজে দেয়। AIVEN_CA_CERT দিলে AIVEN_CA_PATH দেবেন না। একই database ব্যবহার করলে existing accounts/balances থাকবে; আগে backup নিন। Startup নতুন ৪টি table যোগ করবে।

## প্রথম admin account

Operator environment বা নিজের local .env-এ ADMIN_EMAIL, ADMIN_USERNAME, ADMIN_NAME, ADMIN_PASSWORD দিন। Node 24+ দিয়ে project folder-এ `npm ci` এবং `npm run admin:create` চালান। একই Aiven credentials ব্যবহার করলে তৈরি admin Render-এও থাকবে। Render Shell থাকলে সেখানেও চালাতে পারবেন। Default admin password নেই। একই email/username account আগে থাকলে নতুন email/username দিন; existing user-কে silently admin করে না। সফল হলে ADMIN_PASSWORD সরিয়ে দিন।

Admin address: https://YOUR_DOMAIN/admin

## Admin panel

Overview: ৫টি game, seated players, total wallets, fee balance।
Users: chips যোগ/কমানো, ban/unban, name/photo moderation, session revoke, idle seat removal।
Tables: pause/resume; table খালি থাকলে name/blinds/buy-in edit। Pause active hand থামায় না; নতুন hand এবং seat নেওয়া বন্ধ করে।
Fees, Hands, Ledger, Audit: fee collection, completed results, wallet ও admin action history।

শুধু server-operator-created admin login করতে পারে। Player cookie দিয়ে admin API চলে না। আলাদা HttpOnly admin session ২ ঘণ্টায় শেষ হয়; normal player session আলাদা। Server-side role checks, CSRF, login rate limit এবং প্রতিটি write-এ permission recheck আছে। Admin login প্রতি IP-তে ১৫ মিনিটে সর্বোচ্চ ৮ attempts। Panel password/private live cards দেখায় না; winner rig করার option নেই।

## পরীক্ষা

৪২টি automated test পাস: game ranks, ৩৬০টি randomized variant hand, ৫% fee, duplicate request protection, persisted variants, ৪টি নতুন multiplayer HTTP flow, zero-chip account, admin session/authorization এবং table pause।

৩২০, ৩৯০, ৭৬৮ ও ১৪৪০ px-এ ৬৪টি browser layout check পাস; page overflow বা JavaScript error নেই। Mobile game ও mobile/desktop admin screenshots দেখে layout যাচাই করা হয়েছে। Local fixtures/SQLite এবং pg-mem ব্যবহার হয়েছে; আপনার live Aiven/Cloudinary credentials পরীক্ষা করা হয়নি। Deployment-এর পরে অন্তত দুইটি আলাদা browser session দিয়ে প্রতিটি game, fee history এবং একটি real profile-photo upload পরীক্ষা করুন।
