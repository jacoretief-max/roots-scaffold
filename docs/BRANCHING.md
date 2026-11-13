# Branches and releases

| Branch / tag | What it is | Deploys |
|---|---|---|
| `main` | Exactly what's live in the App Store + the live server | **Railway deploys `main`** |
| `develop` | Next version (1.1) work | Nothing — not deployed |
| `feature/<name>` | One feature at a time, branched from `develop` | Nothing |
| `hotfix/<version>` | Urgent fix for the live app, branched from `main` | Via `main` when merged |
| tags `vX.Y.Z` | Exact code of each App Store release | — |

`v1.0.0` = iOS build 26, submitted to App Review on 2026-11-12.

## Everyday
```bash
git switch develop                 # work on 1.1
git switch -c feature/spanish      # start a feature
git switch develop && git merge feature/spanish   # finish it
git switch main                    # look at the live version
```

## Releasing 1.1
1. Finish and test on `develop` (dev build / TestFlight from `develop`).
2. `git switch main && git merge develop`
3. Tag: `git tag -a v1.1.0 -m "Rooted In 1.1.0"` and `git push origin main v1.1.0`
4. EAS production build from `main`, submit.

## Hotfix for the live app
```bash
git switch main && git switch -c hotfix/1.0.1
# fix, test, then:
git switch main && git merge hotfix/1.0.1 && git tag -a v1.0.1 -m "Rooted In 1.0.1"
git switch develop && git merge main     # keep 1.1 up to date
git push origin main develop v1.0.1
```

## The server is shared
There is one Railway server and one database, used by the live app.
- Never deploy `develop` to the live server.
- Server changes for a new version must keep working for users still on the old app
  (add fields/endpoints; don't remove or rename existing ones).
- For bigger server work, create a Railway staging environment (own server + test
  database) and point the dev build at it.
- Pushing to `main` redeploys the server — avoid it while a version is in App Review.
