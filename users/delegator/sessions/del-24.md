---
id: del-24
user: delegator
at: 2026-09-29T21:55:00+01:00
surface: claude.ai
title: Monthly money summary
kind: planning
---

## User

Okay so it's nearly 10pm and I've been staring at my money stuff and I want to think out loud for a bit, if that's alright. I'm not trying to build anything tonight, I just want to get the idea straight in my head before I touch the script.

So here's where things are. I've got a script that takes the CSV from my bank and sorts every transaction into a category, and then it adds up the totals per category. Those totals go into a Google Sheet I called Money. That part works and I'm happy with it. The categories are Food, Home, Fun, Travel, Biscuit and Other. Biscuit is the dog, so vet, food for him, the weird chew toys he destroys in a day. Other is where everything lands when I can't be bothered to work out what it is.

The problem is that the totals are just... totals. A column of six numbers. I look at it and I think "huh, okay" and I close the sheet. It doesn't tell me anything. I don't know if Food is high this month or if it's always like that. I don't know what actually changed.

So what I want is a monthly summary on top of the totals. Something that says here's what mattered this month. I keep going round in circles on what that means though. Part of me wants a big dashboard thing with charts, but I know I'd build it, look at it twice and never open it again. So the opposite instinct is to keep it tiny. Like, three lines. Almost like a text message from a friend who's looked at my spending and tells me the headline.

The first bit I'm fairly sure about is that it should show the top 3 categories. Just the three I spent the most on, not all six. Six is what I already have and it's noise. I don't want to scroll for it.

I'm not sure what else though. I keep wanting to add things and then talking myself out of them. Can you ask me whatever you need to ask me so I stop spiralling? And tell me if the top 3 thing sounds sensible or if I'm missing something obvious.

## Assistant

Sounds sensible, and the "text message from a friend" framing is a good test for everything else you add. If a line wouldn't survive being read out in a text, it probably doesn't belong.

Top 3 makes sense for another reason. With six categories, the bottom two or three are usually small, so they mostly add noise. The top 3 is where most of the money went, so it's where a change is worth noticing.

Here are the questions, in roughly the order they matter. Answer however loosely you like.

1. **What counts as "top"?** I'm assuming the three categories with the biggest total spend for the month. Is that right? Or would you rather see the ones that jumped the most compared to normal? Those can be very different lists. Food might always be number one and never surprise you, while Fun might sneak in at number three because of one night out.

2. **Does Other get to be in the top 3?** If it's your dumping ground, it could easily land there. I'm only flagging it because you described it as "can't be bothered to work out what it is", and that's different from a real category.

3. **What should each of the three lines show?** Just the category name and the amount? Or something that tells you how it compares to before? You said the main complaint is that the totals don't tell you anything. A number only means something next to another number.

4. **How long should it be?** You said three lines. Is that a rule, or just where your head is tonight?

5. **Where do you want to see it?** In the Money sheet next to the totals, somewhere separate, or sent to you some other way? Don't decide yet if you don't know, we can come back to it.

6. **When does the script run, and when does your data actually arrive?** That decides when a monthly summary can be right. A summary run before the month's CSV is in will be wrong.

You don't need to answer all of them in one go. Number 1 and number 3 are the ones I'd settle first, because they define what the summary is. The rest are about plumbing.

## User

Okay, good questions, some of them I hadn't thought about at all.

Number 1, I'd say the top 3 by how much I spent. Biggest totals. I thought about the "jumped the most" version and honestly it sounds clever but I think it would be annoying, because then I'd get a list of whatever was weird that month and not the stuff that's actually eating my money. I want to know where the money went first. The weird stuff I can get from the arrow, which brings me to number 3.

For number 3, this is the bit I got a bit excited about while I was making tea. Each category in the summary should show its change from last month as an up or down arrow. That's all. I don't want percentages or a little sparkline or a second number in brackets. Just an up or down arrow sitting next to the category. If Food is higher than last month it gets an up arrow, if it's lower it gets a down arrow. I can read that in half a second, and if I want the detail I can go look at the totals, which are already there.

I think the reason I like it is that it's the thing I do in my head anyway. I look at a number and what I really want to know is "is that more or less than usual". Well, not usual, I mean than last month. Last month is easier to hold in my head than an average.

For number 2, yeah, Other can be in the top 3 if it earns it. Actually, if Other ever shows up in the top 3 that's probably a sign I should go and sort my categories out, so maybe that's a feature. I don't want to special-case it though. Let it be treated the same as the rest.

Number 4, three lines is just where my head is tonight. If the top 3 each get a line, then it's three lines anyway. That falls out naturally, I think. I don't want to add a header and a footer and a "generated at" timestamp and all that. Maybe a title so I know which month it is, but I'll worry about that when I see it.

Number 5 I don't know yet, honestly. And number 6, I do have an answer, it's a bit messy though. I'll get to that in the next message because I want to think about it properly. Can you just say back to me what you've got so far so I know we're on the same page?

## Assistant

Here's what I have so far, in your words as closely as I can keep them:

- The monthly summary shows the **top 3 categories**, ranked by how much you spent that month. Biggest totals first.
- **Each category shows its change from last month as an up or down arrow.** Up if it's higher than last month, down if it's lower. No percentages, no second number, no sparkline.
- Other is treated like any other category. If it earns a place in the top 3, it's there. It doesn't get special handling.
- It sits on top of the totals you already get. It doesn't replace them. The totals stay as the place you go for detail.
- It's short. Three category lines, plus probably a title so you know which month you're looking at. No timestamp, no header and footer.

One thing I'd gently point out, because it's the kind of detail that's easy to lose later. Ranking by amount and showing the arrow by comparison to last month are two separate jobs. A category can be second biggest and still have a down arrow, and that's fine. It's actually the interesting case: Food is still near the top, but it's heading the right way. The two pieces of information don't fight each other. I'd leave it like that.

The other thing: to draw an arrow, the summary needs last month's number for each category as well as this month's. You said the totals are already in the sheet, so that data exists. I'll assume the arrow is working from those same totals, so you wouldn't need to keep any extra numbers around. If that's wrong, tell me when we get to the plumbing.

Now, your answer to number 6 sounds like it's a bit messy, and I'm curious about it, because that's the question that decides when a monthly summary can be right. Tell me how it actually goes. When does the bank CSV show up, when do you run the script, and does anything about that change from month to month? Ramble if you like, the messy version is often the true one.

## User

Right, the messy version. So the bank doesn't send me anything, it's more that it shows up. There's a statement export that appears in my banking thing and the CSV for the whole of the previous month is there on the 1st. Usually. Properly early, like I think it's in there by morning on the 1st. It's been the 1st every month I can remember, and I only know that because I always get a little annoyed when I forget to grab it and then it's the 15th and the whole month's gone.

Then what I do is I download it whenever I get round to it, drop it where the script can find it, and run the script by hand. Sometimes that's the 1st, sometimes the 3rd, one time it was the 9th, which is a story I'm not going to tell you.

So what I was thinking is, when the summary runs, it should just run when the CSV's there. But I'm not sure if that means the 1st, because I'm slightly nervous about the 1st. What if it lands at some point on the 1st and I run it at 8am before it's there? Or the end of the month, like the 30th or 31st? That feels more natural because the month's over. But no, the month isn't actually over from the bank's point of view, there'll be stuff that hasn't cleared. Pending stuff. That's another reason the end of the month is bad. Supermarket payments from the 29th sometimes don't show up until the 1st or 2nd.

I really don't know what's best here. This is the sort of thing where I could circle for an hour and then pick something at random. And you know what, I just want you to pick. I don't want a list of options with pros and cons, I'll just freeze. Say "do it on this day, because of this" and I'll tell you if it sounds mad.

Oh, and also, since you asked about where it goes, my brain is also saying "just put it in the Money sheet", because that's where everything else lives. But I don't know if that means pasting it above the totals, or a new section, or what. So pick that too if you've got a view. Sorry, this is a long one.

## Assistant

No apology needed, this is the useful kind of long. You gave me the key fact in the middle of it: the CSV for the previous month is in your banking page by the morning of the 1st.

**When: run it on the 2nd of each month.**

The reason is your own CSV. It arrives on the 1st, so the 1st is the earliest day the data exists, and running on the 1st is exactly the risk you described: the script could fire before the file is there, or before it's finished showing the last day's payments. The 2nd gives it a full day of margin. It also deals with your pending-payments worry. The supermarket payment from the 29th that doesn't clear until the 1st or 2nd has the best chance of being in by then. The end of the month is worse for the reason you already spotted: the month isn't finished from the bank's point of view.

It's also easy to remember. The 2nd of every month, and you're always summarising the month that just ended. So on the 2nd of October, you'd be summarising September.

**Where: a new tab in your Money sheet, one per month, named `Summary YYYY-MM`.**

So the September one would be called `Summary 2026-09`, and October's would be `Summary 2026-10`. Year first, then month, with the month always two digits. That matters more than it looks: written that way, the tabs sort themselves into the right order, so you never end up with October sitting in front of September.

Why a new tab and not pasting above the totals: pasting above would push your totals down every month, and you'd lose the old summaries, so you could never look back and see that Food was worse in the summer. With one tab per month, last month's summary is still there, untouched, and your existing totals tab stays exactly where it is.

Does that sound mad, or does it sound okay? Specifically: is the 2nd fine for you, even if you're not at your desk? And is a new tab per month what you pictured, or were you imagining the summary living somewhere you'd see it more often?

## User

No, that doesn't sound mad at all, it sounds good. The 2nd of each month, I'm happy with that. I think the thing I was missing was that I was treating the 1st as the obvious choice, when it's actually the day I'm most likely to get it wrong. One day of room is exactly the sort of margin I never leave myself. And I like that it's the same date every time, because then if I'm ever thinking "has the summary happened yet" I know the answer is "it's after the 2nd". And you're right that I don't need to be at my desk. I can look at it whenever, it just needs to exist by then.

And the new tab thing, yes. I do want that, actually. I hadn't thought about the old ones sticking around but I'd love that. Looking back at past months is something I'd absolutely do on a sofa on a Sunday with nothing to do. So each summary goes into a new tab named Summary YYYY-MM in the Money sheet, that's decided. I'm glad it's year first because I once named a load of files with the day first and it was a disaster, I couldn't find anything for about a year.

Okay, so now that those are settled, let me think about the actual summary and what's in it, because I want to be sure I'm not forgetting something. I'm going to type out my thought process, forgive me.

So the tab has the title, which says what month it is. Then below it, the top 3. For each of the three there's the name of the category, so like Food or Home, and the amount I spent in it that month, and then the up or down arrow to say whether it's more or less than last month. And that's the entire tab. I keep wanting to put the other three categories underneath in smaller type, greyed out, and I keep stopping myself because that's exactly the six numbers I already have. If I want those I'll go to the totals. So no.

Actually hang on, is the amount even something I want? I said three lines, and I said the arrow is the thing. But then I think about it and an arrow with no number next to it is a bit odd. Like "Food ▲". Up by how much? I told you I didn't want a second number in brackets. But I think the one number, the total for the month, is fine. That's not a second number, that's just the number. The arrow is the change. Is that consistent with what I told you before? I think so. Tell me if I'm contradicting myself.

## Assistant

You're not contradicting yourself. Earlier you ruled out percentages, a second number in brackets, and a sparkline. That was about how the *change* is shown, and the change is only the arrow. The month's total is a different piece of information: it says how much, and the arrow says which way it moved. Name, total, arrow is a perfectly clean line.

Let me show you what that would look like with some made-up numbers, just so you can see the shape. These aren't your real figures.

```
Summary 2026-09

Food      £412   ▲
Home      £265   ▼
Biscuit   £138   ▲
```

I'll go through what's happening in that sketch.

- The tab name is `Summary 2026-09`, and the title at the top says the same thing, so there's no doubt which month you're looking at.
- Three lines, biggest first.
- Each line is category, amount, arrow. Food is the most, and it's up on August. Home is second, and it's down on August. Biscuit is third, and it's up.
- Nothing else. The other three categories (Fun, Travel and Other) simply don't appear, because they didn't make the top 3 that month.

And here's what I'd say about the greyed-out smaller version of the other three that you keep stopping yourself from adding: your instinct to stop is right. The moment it shows all six, it's the totals tab again with extra steps.

One small thing to be aware of, and it's only a thing to be aware of, not something to decide now. Since the arrow depends on last month's numbers, the very first summary has nothing to compare against. You'll hit that when you add this to the script, and you'll see it straight away, so I'd leave it until then.

When you do add it to the script, the thing to do on your side is minimal: the new tab gets created on the 2nd, named for the month just finished, with these three lines in it. Do you want to carry on refining what's in the tab, or does that sketch feel close enough?

## User

That sketch is close, yeah. It's weirdly satisfying to see it, it looks like the thing I had in my head, which almost never happens. The arrows are doing exactly what I wanted. I can look at that and in about a second I know Food's up, Home's down, and the dog is costing me more again.

I want to say something about Home though, because it's making me think about whether the arrow is actually useful or whether I'm kidding myself. Back in July the boiler in my flat broke. I rent, so it was ultimately the landlord's problem, but I ended up paying for a few things up front, an emergency call-out and a heater I bought because it was getting cold in the evenings and nobody had been round yet. So Home in July was massive. It was way bigger than a normal month, and then August it dropped back to normal. In that case the arrow in August would have said "down", which is technically true, but it's not that Home got cheaper, it's that July was a freak.

So is that a flaw? Does that mean the arrow is a bit stupid? Or is it fine because I'd know the reason?

And then another thought, since I'm in a spiral anyway. I have a trip coming up, I'm going to Valencia from 23 to 27 October, and I'm learning Spanish for it, badly, but I'm trying. So Travel is going to be big in October because of flights and the place I'm staying and whatever, and then it'll be zero or nothing in November. So Travel will flash up as an arrow up in the October summary, and then down in November. Which is fine and true, but it's the same thing. The arrow reports what happened, not why.

I think I'm half arguing myself into the idea that this is okay. The arrow isn't meant to explain. It's meant to nudge me to go and look. But I want a second opinion. You're allowed to tell me it's a bad idea. I'll only be a little bit sad.

## Assistant

It isn't a bad idea. It's doing what you asked it to do, and you've already worked out why.

The arrow answers one question: did this go up or down compared with last month? It was never meant to answer "is this a normal amount". Your boiler month is a good example of the difference. In August the arrow on Home would say down, and that's correct: Home really was lower than July. What it can't tell you is that July was the odd one out. But you can. You know why July was big, and the arrow gets you to ask the question. If the arrow only ever showed things that were already obvious to you, it wouldn't be worth having.

There's also a practical reason not to try to make it cleverer. To fix the boiler case, the summary would have to decide what "normal" means. That's an average over several months, or a rule for ignoring one-off payments. Every version of that needs a choice you'd then have to maintain, and it would start to make the "three lines, a glance" idea heavier. You told me earlier that last month is easier to hold in your head than an average. The simple arrow matches how you actually think.

The same goes for Valencia. In the October summary, Travel will probably be near the top with an up arrow, and in November it'll be down. Both are true, and both will make complete sense to you, because you'll remember the trip. A week of Spanish practice and a flight will explain the arrow better than any rule could.

So I'd keep it exactly as you've described it. If after a few months you find yourself repeatedly thinking "the arrow is misleading me", that's the moment to revisit it, with real examples to look at. Right now you'd be solving a problem you've only imagined.

One more thing in your favour: because every month keeps its own `Summary YYYY-MM` tab, the odd months stay visible later. You can flick back to the July tab and see Home sitting at the top of the list, and it'll be obvious why, without any extra explanation built into the tool.

## User

Yeah. Okay. That's what I needed. The arrow tells me to go and look, it doesn't have to explain itself. I like that, I might even write that on a sticky note and put it on my monitor, "the arrow isn't the answer, it's the question". That's a bit dramatic for a spreadsheet but it's late and I'm allowed.

I also like that the old tabs stick around, because that's a weird extra benefit I didn't plan. Like if I'm ever confused in the winter about why I was so skint in the summer, I can scroll along the bottom and the tabs are right there in order, and July says Home at the top with an up arrow, and I go "oh yeah, the boiler".

Right, now I think I want to pin this down in writing, because I know what's going to happen. I'm going to go to bed, and in about three weeks I'll be sitting down to add this to the script, and I'll have forgotten half of what we said. I'll remember "something about arrows" and I won't remember what I decided about the date. And I won't want to go back through this whole chat to dig it out.

So could you write it up as a short spec, like a list, of what the monthly summary is? Just what we decided, nothing new. I don't want you to sneak in a thing we didn't talk about. If something's undecided, I'd rather it said undecided, or just left out. And please keep it short, I do not want an essay. Something I can copy into a note and read in thirty seconds.

Also, when I do add it to the script, I probably won't be thinking very clearly, I never do at that time of night. So where there are things to click, just tell me what to click. I don't need the explanation of how it works, I really don't, I'd rather skip the explaining. Keep that in mind for when we do this for real. Not now, I'm not touching it tonight.

## Assistant

Here's the spec, with only what we decided.

**Monthly money summary**

- **What it shows:** the top 3 categories for the month, ranked by how much you spent. Biggest first.
- **Each line:** category name, the month's total, and its change from last month as an up or down arrow. Up if higher than last month, down if lower. No percentages, no second number.
- **Categories it draws from:** Food, Home, Fun, Travel, Biscuit and Other. Other is treated like any other category, with no special handling.
- **What it doesn't show:** the other three categories. Those stay in the totals you already get, which this sits on top of.
- **Title:** says which month the summary is for. No timestamp, no header or footer.
- **When it runs:** the 2nd of each month, because the bank's CSV arrives on the 1st and the 2nd leaves a day of margin. It summarises the month that just ended.
- **Where it goes:** a new tab in the Money sheet for every summary, named `Summary YYYY-MM`. For example, `Summary 2026-09`. Year first, month as two digits, so the tabs sort in order. Old tabs stay put.
- **Not decided yet:** how the very first summary behaves when there's no previous month to compare with. You'll see it the first time it comes up.

I left out the boiler and Valencia examples on purpose. They explain why the arrow is fine as it is, but they're not part of what the summary does.

On the clicking: noted. When we do this for real, I'll give you plain steps, such as which tab to open and what to press, and I won't explain how it works underneath unless you ask. If you paste your current script into a chat then, I can tell you exactly where the new part goes. Tonight you don't have to touch anything.

For a sanity check before you copy it: does that list say everything you remember agreeing, and nothing you don't?

## User

Yes, that's all of it, and nothing I don't recognise. I like that you left the "not decided" thing in there, because I'd have forgotten that there was even a problem with the first month, and I'd have sat there confused when the arrow had nothing to point at.

One last thing and then I'll let you go, I promise. I keep wondering if I'm making this too small. You know when you plan something and then you look at it and it's so little that you think it must be missing something? Three lines, once a month, a tab per month. It feels almost too easy, which makes me suspicious.

But then I think about how many things I've started and abandoned because they were too big, and I think, no, the small version is the one I'll actually look at. I'd rather open a tab on the 2nd, see three lines, and know in a second what my month looked like, than build something with six charts that I resent.

So I think I'm done. I'm going to copy the list into a note on my phone before I forget. I'll come back when I'm adding it to the script, probably in a few weeks, and I'll paste the list in and we can do it properly with the clicking. I might also have Valencia stuff to sort by then, so no promises on the timing.

Thanks for being patient with the rambling, I know it's not the most organised way to plan something. It's just the only way I seem to be able to do it. Goodnight.

## Assistant

It's not too small. You've got something you'll open, and for a tool like this, being opened is the whole test. Three lines on the 2nd, with an up or down arrow beside each, answers the question you started the evening with: what actually mattered this month. The six charts would never have done that.

When you come back, paste the list in along with your current script, and we'll go through it step by step with the clicking. The one open item, the first month with nothing to compare against, will be easy to settle once you can see it on screen.

Enjoy the Spanish practice, and good luck with Valencia. Goodnight.
