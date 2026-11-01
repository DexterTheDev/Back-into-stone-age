---
name: game-purpose-check
description: Work out what a game is really for, interview its creator, and judge whether the project is on the right path, using its design docs and project files as evidence. Use this whenever someone wants a direction review, vision audit, or gut check on a game in development, including questions like "am I making the right game", "has this drifted from the GDD", "does my build match the pitch", "is this scope creep", "my game feels unfocused", or "should we pivot". Also use before a milestone or greenlight decision, even if the user never says "purpose" or "path". Not for bug fixing, code review, or building features.
---

# Game Purpose Check

Find out what a game is for, test whether that purpose holds up, check whether the work serves it, and give an honest verdict.

Creators are too close to their own game to do this alone. They remember what they meant to build, while the project shows what they actually built. Your value is putting those two side by side and asking the questions the gap raises.

Work in this order, because each step feeds the next:

1. Survey the design docs and project files
2. Draft the purpose and test it
3. Compare the purpose with what is built
4. Interview the creator
5. Give the verdict

Stay read-only throughout. This is a review, so leave docs, code, and assets as they are unless the creator asks for a change.

## 1. Survey

Read what you can before asking anything. A question the files could have answered wastes the creator's time, and a question built on evidence gets a more honest answer than a general one.

**Design material.** Look for GDDs, pitch docs, READMEs, roadmaps, devlogs, changelogs, playtest notes, and loose notes. Note dates where you can, because a stale doc and a current one carry different weight.

**The build.** Identify the engine and find where scripts, scenes, and assets live. Read the code for the feature the game depends on most, and judge whether it is real or a placeholder. Then trace the main loop: could a player get through it today from start to finish?

**The effort map.** Group the project by game system rather than by folder, then measure each system: source lines, scenes, assets, TODOs and placeholders, and activity in commits or devlogs. Weight recent activity most, since it shows where the project is heading rather than where it has been.

Treat these numbers as leads, not proof. One hard system can deserve more code than ten easy ones, and binary files such as Blueprints or art only give you names and counts.

**If material is missing:**

- No docs: infer the purpose from the project, label it as a guess, and make confirming it your first question.
- No project files: judge the purpose and the plan, and say in the verdict that the build was not checked.
- Neither: ask where they are before going further.

## 2. Draft the purpose and test it

Fill in these five fields from the evidence, marking anything you inferred:

| Field | What it answers |
|---|---|
| Player | Who is this for, specifically? |
| Experience | What should the player do and feel, in one sentence? |
| Reason | Why is this creator making it: income, portfolio, learning, art, teaching, a client, friends? |
| Success | What observable result would show it worked? |
| Limits | What people, time, money, and skills are available? |

Reason deserves extra care, because "the right path" depends on it. A learning project cannot fail in the market, while a commercial one can. The reason written in a doc is often not the real one, and clues may sit in loose notes or commit messages, so ask directly.

Then test the purpose itself:

- **Specific:** could you point to a real person or community? "Everyone" is not a player.
- **Focused:** can the experience be said in one sentence? A pitch made of several other games joined by "meets" has not chosen yet.
- **Observable:** could someone tell whether it succeeded? "Be fun" and "be huge" cannot be checked.
- **Feasible:** does the scope fit the limits?
- **Consistent:** does the plan actually serve the reason?

A weak purpose is a finding in its own right, and it outranks any drift. Nobody can be on the path to a target that has not been set.

## 3. Compare the purpose with the build

For each promise the purpose makes, including pillars, must-haves, and "never" rules, find what exists. Then look for these kinds of drift:

| Drift | What it looks like |
|---|---|
| Core neglect | The thing the game is about is still a placeholder while other work advances |
| Contradiction | Something built breaks a stated rule |
| Scope creep | A system with no link to the purpose |
| Audience drift | Difficulty, complexity, or platform suits a different player |
| Order drift | Polish or meta-systems come before the core is proven |
| Limit drift | The remaining work no longer fits the limits |
| Silent pivot | The build moved on and the docs did not, which may even be an improvement |

Not every gap is drift. Work scheduled for later is normal, and a large system the purpose requires is not scope creep just because it sits outside the core loop. Check for a justification in the docs before flagging anything. A false alarm costs trust and can knock a healthy project off course, so if things line up, say so.

When work did move, look for why. Devlogs and commit history often show the moment: a bad playtest, a fun tangent, fear of the hard part. The cause matters because the fix differs. Running from an unsolved core calls for facing it, while a real discovery may call for updating the purpose.

## 4. Interview

Ask one to three questions per round, then stop and wait for the answers. Keep your conclusions out of that message, because the answers can overturn them and a creator who has seen the verdict will start defending against it.

Open the first round with your draft purpose and two to four neutral observations, so the creator can correct you early:

```
**What I think this game is for**
[The five fields, briefly. Mark guesses.]

**What stood out**
[Two to four facts from the files, without judgment.]

**Questions**
1. ...
```

Start with purpose, because drift measured against the wrong target means nothing. Then ask whether the biggest drift was deliberate. Then ask what real players actually did.

Keep a question only if some answer to it would change the verdict. Good questions:

- **Cite specifics.** Name the file, doc line, or number that prompted it.
- **Cannot be answered with "yes".** Ask for a past event, a choice, or evidence.
- **Force a trade-off** when the creator is avoiding a decision.
- **Stay neutral,** so the wording does not give away your opinion.

| Weak | Strong |
|---|---|
| Is the core loop fun? | Who last played the wheel section without your help, and what did they do when it ended? |
| Is combat part of your vision? | The GDD says "no fail states", but `game_over.gd` ends the run at zero health. Which is the game now? |
| Who is your audience? | Name one real person who would buy this. What are they playing today? |
| Are you worried about scope? | If you had to ship in half the time, what is the one thing you would keep? |

If an answer changes the purpose, judge your findings again against the new purpose. The creator's considered answer beats the doc, even when that makes the doc the thing that drifted.

Stop once more answers would not change the verdict. That usually takes two or three rounds, and a healthy project may need only one. If the creator asks to skip ahead, give the verdict and list what went unconfirmed.

## 5. Verdict

Pick one verdict using these meanings:

- **On path:** the core exists or is the next thing being built, recent work serves the purpose, and the gaps are ordinary remaining work.
- **Drifting:** the purpose is still reachable, but real effort is going elsewhere or a rule is being broken. Reprioritizing can fix it.
- **Off path:** finishing the current plan would not deliver the purpose, or no workable purpose exists yet. Fixing it means deciding again what the game is.

Be direct. Softening a hard verdict spends the creator's time, and that is the one thing they cannot get back. Be fair too: name what is working, and do not reach for problems that are not there.

Use this structure, keep it to about a page, and drop any section with nothing to say:

```markdown
## Verdict: [On path | Drifting | Off path]
[Two or three sentences with the main reason.]
Based on: [what you reviewed, and anything you could not check]

## The purpose
[The five fields as confirmed. Note any change from the docs.]

## Does the purpose hold up?
[What is solid and what is weak.]

## What the evidence shows
| Promise | Built | Status |
|---|---|---|

## Biggest problems
1. **[Name] ([drift type]):** [evidence, then why it matters to this purpose]

## Next moves
- **Keep:** [what is working]
- **Cut or pause:** [specific work]
- **Do first:** [the single most important step]
- **Test:** [a cheap test with real players that could prove this verdict wrong]
```

Make the next moves specific enough to start this week, and sized to the creator's actual limits.
