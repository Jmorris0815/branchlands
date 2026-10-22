# Working on Branchlands together

This file is the rulebook for two people (a parent and a kid, or any pair) working on the same repo.
The rules exist so the kid learns the real workflow most engineers never get taught: branches, pull
requests, reviews, and merge conflicts, with nobody able to break `main`.

## One-time setup

**Accounts.** GitHub requires users to be 13 or older and has no parental-consent path for younger kids.
Under 13: the kid works on the parent's machine or a second machine using the parent's GitHub account, with
their own name in `git config user.name` so commits are credited to them in the log. 13 and up: the kid gets
their own account and is added as a collaborator on the repo.

**Repo settings (on GitHub → Settings → Branches → Add rule for `main`).**
Required pull-request reviews are free only on **public** repos, so keep this repo public.
- Require a pull request before merging
- Require approvals: 1
- Dismiss stale approvals when new commits are pushed
- Do not allow bypassing the above settings (otherwise admins skip it)

With that, nobody can push straight to `main`. Not even the parent. That is the point.

**Each person's machine.** Install Git and VS Code. Open a terminal (Git Bash or PowerShell) and:

```
git clone https://github.com/<you>/branchlands.git
cd branchlands
git config user.name "Your Name"
git config user.email "you@example.com"
```

## The loop (every change, every time)

```
git switch main
git pull                         # start from the newest main
git switch -c <name>/<what>      # e.g.  sonny/level-2-4   or  dad/fix-stairs-hint
# ...edit files...
python -m http.server 8000       # play-test it
git add .
git commit -m "Add level 2-4: the long orchard"
git push -u origin <name>/<what>
```

Then on GitHub: **Compare & pull request** → fill in the template → **Create pull request**.
The *other* person reviews. They can:
- **Comment**: a question or idea, no decision
- **Request changes**: something must change before merge (say what and where)
- **Approve**: good to go

Only the author merges, only after approval. Then both people `git switch main && git pull`.

## Review rules

1. Pull the branch and actually play the level before approving.
2. Say something specific. "Looks good" is not a review. "Line 40: the hint says move(4) but the wall is at 3" is.
3. One request for changes is normal. Three is a conversation; go talk instead of typing.
4. The reviewer never fixes it themselves. They describe; the author fixes. (Otherwise the author learns nothing.)

## Merge conflicts (they will happen, on purpose the first time)

Both of you edit the same line of `js/levels.js` on separate branches. The second PR shows a conflict.
Fix it on the branch:

```
git switch main && git pull
git switch <your-branch>
git merge main            # conflict appears
# open the file, look for <<<<<<< ======= >>>>>>>, keep what's right, delete the markers
git add js/levels.js
git commit                # the merge commit
git push
```

Do this once deliberately in week one, so it's boring by the time it happens for real.

## What to work on first (good first PRs)

- A new level in an existing zone (`js/levels.js` only)
- A better hint for a level that was confusing
- A new `robot.sees()` target (edit `js/sim.js` and the hints)
- A new tile type (e.g. a locked door and a key)

## Commit messages

One line, present tense, says what changed: `Add level 3-3: two bridges`, `Fix jump over goal tile`.

## Who reviews whom

- **Justin** (`Jmorris0815`) owns the repo and reviews Bentley's pull requests.
- **Bentley** (`bloxyarmy2015-gif`) has write access: he branches, opens pull requests, and reviews Justin's. Neither of us merges our own PR without the other's approval; that is what the branch protection on `main` enforces.
- First task for Bentley: accept the invite at https://github.com/Jmorris0815/branchlands/invitations, then review pull request #1 and press **Approve** if the game plays.
