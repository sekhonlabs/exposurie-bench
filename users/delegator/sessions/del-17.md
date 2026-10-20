---
id: del-17
user: delegator
at: 2026-08-30T21:20:00+01:00
surface: desktop
project: small-hours
kind: distractor
---

## User

sign up button runs off my phone screen

## Assistant

I'll look at how the sign-up form is built before changing anything.

Found it. The cause is in two files: `/Users/user/Documents/small-hours/index.html` and `/Users/user/Documents/small-hours/styles.css`.

The sign-up form puts the email box and the button side by side in one row, and that row isn't allowed to wrap. Three things add up to more width than an iPhone has:

- The email box is set to a minimum width of 320 pixels.
- The button, which says "Get the Sunday email", is set to never break its text onto two lines.
- The row is set to keep everything on one line, so when there isn't enough room the button just gets pushed past the right edge.

On a laptop there's plenty of space, so you'd never see it there. On a phone the button gets cut off.

I've made the row stack on small screens, with the email box on top and the button underneath. On wider screens it stays exactly as it was, side by side. I also removed the fixed minimum width on the email box, so it shrinks to fit instead of pushing the page wider. The colours are untouched: the button is still the dark green `#2F6B4F` with text in the warm off-white `#FAF7F2`.

I haven't changed any wording, and the form itself, including where it sends sign-ups, is exactly as it was.

## User

show me what changed

## Assistant

It's one small block in `styles.css`. Here is the new part:

```
.signup-row {
  display: flex;
  gap: 0.75rem;
}

@media (max-width: 600px) {
  .signup-row {
    flex-direction: column;
  }
}
```

In plain words:

- The first part is the same side-by-side layout as before.
- The second part only applies when the screen is 600 pixels wide or narrower, which covers every iPhone held upright. There, the row turns into a column, so the box and the button sit one above the other.

I also took `min-width: 320px` off the email box and replaced it with `width: 100%`, so it fills whatever space the phone gives it. The button keeps its no-wrap setting, which is fine now because "Get the Sunday email" fits comfortably on one line once it has a full row to itself.

Nothing else in the project was touched.

## User

how do I check on my phone

## Assistant

The site is published through Netlify, so your phone will only show the fix once Netlify has published this change. Here are the steps.

1. On your Mac, open the Netlify site in your browser and click your Small Hours site.
2. Click **Deploys** in the top menu.
3. Look at the top entry in the list. Wait until it says **Published** next to it. If it still says "Building", give it a minute and refresh the page.
4. On your iPhone, open the Small Hours site in your browser.
5. Pull the page down from the top and let go, to refresh it. If it still looks cut off, close the tab and open the site again in a fresh one.
6. Scroll to the sign-up form. The email box should be on top and the "Get the Sunday email" button underneath, with the whole button on screen.
7. Turn the phone sideways. In that position the box and the button should sit side by side again, and both should still fit.

If the button is still cut off after a fresh tab, tell me and I'll look again. It would most likely mean the phone is showing an older copy of the page.

## User

button is full width now. looks bad

## Assistant

Understood. On the stacked layout the button was stretching across the whole screen, because a column makes its children as wide as the column by default. I've fixed that in `styles.css`: on small screens the button now keeps its natural width, just wide enough for "Get the Sunday email" with the usual padding, and sits at the left edge, lined up with the email box above it.

The email box still fills the width, so the form reads as a wide box with a smaller button underneath. Nothing else changed, and on bigger screens the row looks the same as before.

Once Netlify shows the new entry as **Published** under Deploys, refresh the page on your iPhone the same way as before and check the form again.

## User

good. thanks

## Assistant

Good. To sum up what changed tonight, all of it in `styles.css`:

- The sign-up row now stacks on screens 600 pixels wide or narrower, and stays side by side on larger ones.
- The email box no longer has a fixed minimum width, so it fits any phone.
- The button keeps its natural width when stacked, instead of stretching across the screen.

The button text, the colours, the footer and the form's behaviour are all as they were.
