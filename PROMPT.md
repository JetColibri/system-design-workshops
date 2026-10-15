# Prompt: build a new workshop topic

One prompt for every topic. Only the three lines in brackets under “Input” change. If a topic needs something special, add a few lines at the end. When you catch a new kind of mistake, add it to the consistency check so every next topic avoids it.

Copy everything below the line into a chat with an LLM that can write and run code. Attach the source article and this repository (or at least `shared/`, `topics/networking-essentials/` and `README.md` as the reference implementation). Fill in the brackets.

---

Build a new interactive workshop topic for my repository `system-design-workshops`.

## Input

- Source article: [attach the file or paste the link]
- Topic: [e.g. Caching]
- Topic folder: `topics/[topic-slug]/`
- Audience: senior engineers who have read the article. One shared screen, one facilitator, about 60 minutes.

## Idea

Instead of slides, the group builds one real product step by step (the reference topic builds a ride-hailing service). Each step is one decision from the article. People pick one of three options, watch a simulation, read a comparison table, then open a takeaway with a real-world story and links. The topic ends with an incident in a Kubernetes-like console that brings everything together.

## Process

1. First, without code, send me for approval:
   - the product we build;
   - 8–11 steps, each as: step title → article section → three options;
   - the incident plot: the trigger, and what keeps the system broken even after the trigger is rolled back;
   - which parts of the article stay uncovered.
2. After I approve, build the topic in the repository structure (below), reusing `shared/` and following `topics/networking-essentials/` as the reference.
3. Test every step and the whole incident in a headless browser, on desktop and at phone width (390 px), with no console errors.
4. Add the topic to `topics.json` and to the topics table in `README.md`.

## Files to produce

```
topics/[topic-slug]/
├── index.html     # markup; loads ../../shared/engine.js, incident.js, workshop.js, ../../shared/content.js
├── content.md     # all theory, in the same format as topics/networking-essentials/content.md
├── workshop.js    # steps, simulations, architecture diagram
└── incident.js    # the incident simulator and its scenario
```

Reuse the helpers in `shared/engine.js` (`$b`, `css`, `optsInit`, `segInit`, `sizeCanvas`, `fmtN`, `fitFont`, `cmpTable`, `lbl`) and the styles in `shared/workshop.css` and `shared/incident.css`. If you need a new generic helper, add it to `shared/` instead of copying it into the topic.

## Every step

- A scenario with concrete numbers (users, requests per second, limits), in plain English.
- A question and exactly three options. Prefer the textbook example where the options really differ.
- A simulation: a slow animation or a chart, with a label above every message, plus stat tiles. Every option must produce visibly different numbers, so nobody thinks the tab didn’t switch.
- A comparison table with the same rows for all three options (load, what the user sees, pros, cons, complexity). Colors follow one rule: green = good, amber = moderate problem, red = serious problem.
- A “Show takeaway” button: 3–5 short paragraphs plus one or more “How it’s done in practice: Company” blocks with a real story and a link.
- An architecture diagram at the top that grows with each choice; every service has an “i” badge that explains what it does.

## The incident

A Kubernetes-like console: pods, metrics, logs, events, database, client config. It starts with a bad default config. There is a trigger (for example, a migration) and a mechanism that keeps the system broken even after the trigger is rolled back. The participant finds the trigger, rolls it back and fixes the config. Include a Hint button (5–6 hints in order), traps (actions that make things worse), a report after the incident closes, and a “Re-apply” button that shows the fixed config survives the same bad deploy.

## Don’t

- No facilitator notes on the page, no “twists”, no timer, no start screen: open straight on step 1.
- Don’t invent facts or links. Open every link and check it says what we claim.

## Consistency check (required before you hand it over)

- Numbers in the table, stat tiles, chart and takeaway text match, because they come from one model.
- Units are honest: “per second” means per 1 s; axis titles sit under the axis, not in the legend.
- The text describes what the chart shows (say “gradual” only if the chart is gradual; a queue or a spike mentioned in the text must be visible).
- Steps don’t contradict each other (the same data flow doesn’t take two different paths in two steps).
- No ambiguous wording that could read as approval of a bad option.
- Cells computed by the simulation are marked `auto` in `content.md`.
- In JavaScript strings use ’ for apostrophes, never the ASCII ' inside single-quoted strings.
