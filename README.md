# System Design Workshops

Interactive workshops on system design topics. Each workshop builds one real product step by step. At every step you pick one of three options, watch a simulation, compare the trade-offs in a table, and read a takeaway with a real-world story and links. Each workshop ends with an incident in a Kubernetes-like console: pods, metrics, logs, events, database and config.

## About these materials

These materials reflect my own understanding of topics I’ve studied, worked through with an LLM. They are not official material from the authors of the original articles, and they may contain simplifications or mistakes. The numbers in the simulations come from simple models built to show the trade-offs; they are not benchmarks. Each topic links to its source article and to the engineering blogs it cites, so check those for the full picture.

## Topics

| Topic | Product we build | Source |
| --- | --- | --- |
| [Networking Essentials](topics/networking-essentials/) | Ride-hailing service | [Hello Interview: Networking Essentials](https://www.hellointerview.com/learn/system-design/core-concepts/networking-essentials) |

## Project structure

```
system-design-workshops/
├── index.html                 # home page: list of topics (reads topics.json)
├── topics.json                # topic list: title, product, description, source article
├── shared/                    # used by every topic
│   ├── engine.js              # helpers: option buttons, comparison tables, canvas sizing, labels
│   ├── content.js             # loads content.md and replaces the built-in texts
│   ├── workshop.css           # styles of the workshop steps
│   └── incident.css           # styles of the incident console
├── topics/
│   └── networking-essentials/
│       ├── index.html         # page markup
│       ├── content.md         # all the theory: scenarios, questions, options, tables, takeaways, stories
│       ├── workshop.js        # steps, simulations, architecture diagram
│       └── incident.js        # the incident simulator and its scenario
└── PROMPT.md                  # prompt for an LLM to build the next topic
```

The incident simulator currently lives inside the topic folder, because its scenario and its code are still tied together. When a second topic gets an incident, the generic part (pods, metrics, logs, events, config, report) should move to `shared/incident.js`, and each topic should keep only its scenario.

## Editing the theory

All texts that explain the topic live in `content.md` of each topic. Open it on GitHub, click the pencil, edit, and commit. GitHub Pages updates the site in a minute or two. The format rules are in the comment at the top of the file. The main ones:

- Each step starts with `## Step N. Title`. Do not change the step numbers.
- Options are lines `- **Name** — caption`. Keep their number and order.
- In tables the first emoji sets the cell color: 🟢 good, 🟡 so-so, 🔴 bad.
- A cell `auto` is computed by the simulation. Do not delete or reorder rows that contain `auto`.

Numbers in stat tiles, chart captions and the incident come from the simulations and live in the JavaScript files.

## Running locally

Browsers block a page opened from disk from reading `content.md` and `topics.json`. Start a local server in the repository folder:

```
python3 -m http.server
```

Then open http://localhost:8000.

## Publishing on GitHub Pages

1. Push the repository to GitHub (it must be public on a free account).
2. Open Settings → Pages. Under Source pick “Deploy from a branch”, branch `main`, folder `/ (root)`, and save.
3. The site appears at `https://<your-login>.github.io/system-design-workshops/` in a minute or two.

## Adding a topic

1. Pick an article and give it, together with [`PROMPT.md`](PROMPT.md) and this repository, to an LLM.
2. Put the result in `topics/<topic-slug>/`.
3. Add the topic to `topics.json` and to the table above.
4. Check every step locally, then commit.
