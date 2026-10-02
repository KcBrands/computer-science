# CoupleApplication

A mobile-first web app version of the viral "Girlfriend Application Form - 2026".

1. **You** open the site, type your name and email, and pick the position (girlfriend, boyfriend or partner).
2. You get a short link like `https://<your-site>/couple-application/#/a/dGVzdEBleGFtcGxl...` to copy or share.
3. **Applicants** open the link on their phone, answer all 12 sections plus the final interview, and sign.
4. Their answers are **emailed to you**, along with their self-rated "duties" score and a list of red flags they ticked.

No server and no database: your email address is packed into the link itself, and answers are delivered by
[FormSubmit](https://formsubmit.co), a free form-to-email service.

## One-time email activation

The first time FormSubmit sends anything to your address, it emails you an **Activate Form** button instead.
Use **Send activation email** on the create page and click that button *before* you share your link,
so the first application isn't lost. Check your spam folder if it doesn't arrive.

If sending fails for an applicant, they get buttons to email or copy their answers to you manually, so nothing is lost.

## Hosting it

The app is plain static files (`index.html`, `app.js`, `questions.js`, `styles.css`), so any static host works:

- **GitHub Pages:** repo Settings → Pages → Deploy from branch → pick the branch, root folder.
  The app is then at `https://<user>.github.io/<repo>/couple-application/`.
- **Netlify / Vercel / Cloudflare Pages:** drag and drop this folder.

It must be served over http(s). Opening `index.html` straight from disk won't send email.
For a shorter link, host it on its own domain or put the link through a URL shortener.

## Editing the questions

All questions live in `questions.js`. Words in `{braces}` such as `{me}`, `{him}` and `{role}` are filled in
from the requester's choices, so "your boyfriend" becomes "your girlfriend" when that fits.

## Privacy note

The link encodes your email in base64. That hides it from a casual glance but isn't encryption,
so anyone with your link can decode it.
