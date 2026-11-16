STUDY DESK — SIMPLE CLOUD SETUP
================================

This is the simpler version. It does NOT use a custom Node server, Render,
a PostgreSQL connection string, DATABASE_URL, SESSION_SECRET, Resend, or email
verification codes.

HOW IT WORKS
------------
- Supabase handles email + password sign-up and sign-in.
- Supabase stores assignments and study sessions online.
- Row Level Security ensures each account can only access its own records.
- Students can sign in to the same Study Desk website from another browser/device
  with the same email and password.
- The website is static HTML/CSS/JavaScript and can be hosted by Netlify.
- A custom domain can be connected to the Netlify site if you own/register one.

PART A — SUPABASE (DO THIS ONCE)
--------------------------------
1. Open your Supabase project.
2. Open SQL Editor -> New query.
3. Open schema.sql from this folder, copy all of it into the query, and click Run.
4. Open Project Settings -> API (or API Keys).
5. Copy the Project URL and the publishable key. If the dashboard shows a legacy
   anon key instead, that can also be used.
6. Open public/config.js and replace:
      https://YOUR_PROJECT_REF.supabase.co
   with your Project URL, and replace:
      YOUR_PUBLISHABLE_OR_ANON_KEY
   with the publishable/anon key.
7. NEVER use a secret key or service_role key in config.js. Never expose those.
8. To skip the email confirmation step, open Authentication -> Sign In / Providers
   -> Email and turn OFF Confirm email. This means users can sign up immediately
   without proving they own the email address. Use a real email address anyway.

PART B — GITHUB
---------------
1. In your existing GitHub study-desk repository, replace the old project files
   with the contents of this folder.
2. Upload the public folder and schema.sql. The public folder must contain:
      index.html, style.css, app.js, config.js
3. Remove old backend files from the repository if they are still there:
      server.js, package.json, .env.example, .gitignore (optional)
   The static version does not use them. Do not upload .env files or secrets.
4. Commit the changes.

PART C — NETLIFY HOSTING
------------------------
1. Open https://app.netlify.com/ using an adult-managed account if required.
2. Choose Add new project -> Import an existing project -> GitHub.
3. Select the study-desk repository.
4. Set Build command to blank / no build command.
5. Set Publish directory to: public
6. Deploy. Netlify will give you a free address ending in netlify.app.
7. To use your own domain, open Domain management -> Production domains -> Add a
   domain. Add a domain you or your parent/guardian owns and follow Netlify's DNS
   instructions. You do not need a domain just to test the website.

PART D — CHECK THE SITE
-----------------------
1. Open the Netlify URL.
2. Create an account with name, email, and password.
3. Add an assignment and a study session.
4. Open the same website URL in another browser or device.
5. Sign in with the same email and password. Your saved work should appear.

IMPORTANT
---------
- The Supabase publishable/anon key is expected to be visible in a browser app;
  the RLS policies in schema.sql protect user data.
- Never put a Supabase secret/service_role key into config.js or GitHub.
- Do not share passwords or keys in chat.
- Supabase password sign-up normally asks for email confirmation on hosted
  projects. Turn it off as described above only because this project was asked
  to use password-only sign-up. Without confirmation, email ownership is not
  verified and account recovery may be harder.
- This version does not include a password-reset screen yet.
- If the project already has data in the old PostgreSQL tables, it is not
  automatically moved into this new Supabase Auth setup.
