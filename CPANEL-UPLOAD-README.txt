================================================================================
  COMPANY E-SIGN — A2 HOSTING / cPanel UPLOAD GUIDE
  (Upload karo, settings set karo, chal jayega — server par build mat karo)
================================================================================

IMPORTANT
---------
- Ye package pehle se BUILD ho chuka hai (.next folder included).
- cPanel par "Run JS script" ya "npm run build" MAT chalao.
- Server par EK BAAR npm install zaroor chalao (Terminal commands neeche).


STEP 1 — UPLOAD
---------------
1. cPanel > File Manager kholo.
2. Home directory mein jao (public_html ke BAHAR).
3. "company-esign-cpanel.zip" upload karo.
4. ZIP par right-click > Extract.
5. Extracted folder ka naam "company-esign" rakho (ya jo bhi path use karna ho).


STEP 2 — INSTALL + PERMISSIONS (Terminal) — REQUIRED
----------------------------------------------------
cPanel > Terminal:

    cd ~/company-esign
    npm ci --omit=dev
    chmod 700 data storage storage/offices

Agar npm fail ho to: Setup Node.js App > Run NPM Install > Restart


STEP 3 — NODE.JS APP (cPanel > Setup Node.js App)
-------------------------------------------------
Create application with these exact settings:

    Node.js version:     20.x or 22.x
    Application mode:    Production
    Application root:  company-esign
    Application URL:   contracts.valliani.app
    Startup file:      server.js

Environment variables (Add Variable — copy from CPANEL-ENV.txt):

    APP_URL=https://contracts.valliani.app
    NODE_ENV=production
    ADMIN_NAME=Valliani Network Administrator
    ADMIN_EMAIL=admin@vallianiuniversity.com
    ADMIN_PASSWORD=your-strong-password-here
    SESSION_SECRET=long-random-secret-here
    OTP_SECRET=another-long-random-secret-here
    REQUIRE_EMAIL_OTP=true

    SMTP_HOST=mail.contracts.valliani.app
    SMTP_PORT=465
    SMTP_SECURE=true
    SMTP_USER=noreply@contracts.valliani.app
    SMTP_PASS=your-email-password
    EMAIL_FROM=Valliani Contracts <noreply@contracts.valliani.app>

DO NOT click:
    - Run JS script (build)
    - Any custom build command

DO NOT click Run JS script (build).

Then click SAVE and RESTART.

503 error fix (Terminal):
    cd ~/company-esign
    bash scripts/cpanel-check.sh


STEP 4 — SSL
------------
cPanel > SSL/TLS Status > AutoSSL run karo.
APP_URL must start with https://


STEP 5 — TEST
-------------
1. Open https://contracts.valliani.app
2. Login with ADMIN_EMAIL and ADMIN_PASSWORD
3. Create an office and send a test envelope


TROUBLESHOOTING
---------------
Error: "Out of memory" / WebAssembly
  -> You tried to build on server. Use this pre-built package instead.

App shows 503 or does not start
  -> Check Startup file is server.js (not next start)
  -> Check Application root path is correct
  -> Restart the Node.js app

Emails not sending
  -> Verify SMTP variables in cPanel environment variables
  -> Use port 465 with SMTP_SECURE=true

Need to update the app later?
  -> On your PC run:  npm run prepare-cpanel
  -> Upload the NEW company-esign-cpanel.zip

FORCE UPDATE (if old UI / old certificate still shows)
------------------------------------------------------
Restart alone is NOT enough if .next was not replaced.

1. cPanel > Setup Node.js App > STOP the app
2. File Manager > open the SAME folder as Application root (example: ~/company-esign)
3. DELETE these folders INSIDE that app folder (keep data/ and storage/):
      .next
      src
      server.js
      package.json
      BUILD_STAMP.txt   (if present)
4. Upload the NEW zip into that SAME folder and Extract HERE
   - Make sure files land as: company-esign/.next , company-esign/server.js
   - NOT: company-esign/company-esign/.next  (nested folder = wrong)
5. Terminal:
      cd ~/company-esign
      npm ci --omit=dev
6. Setup Node.js App > START / RESTART
7. Open this URL to confirm new code is live:
      https://contracts.valliani.app/api/version
   You MUST see:
      "certificateLayoutVersion": 2
      "signerLocalTimeOnCertificate": true
      "buildStamp": "2026-..." (today's stamp)

8. IMPORTANT about certificates:
   Old completed PDFs never change. After update, create a NEW agreement
   and sign it again. Only the NEW PDF gets local time + new certificate layout.
   Look for footer text: "Certificate layout v2"


================================================================================
