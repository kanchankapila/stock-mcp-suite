# Contributing and Branching

- Default branch: `main` (production-ready). Deploy from tags/releases on `main`.
- Development branch: `develop`. Open feature PRs into `develop`.
- Release flow:
  - Create a release PR from `develop` -> `main`.
  - Merge via squash or merge commit after approvals and checks.
  - Tag the merge commit (e.g., `v1.0.0`) and publish release.
- Hotfixes: branch off `main`, then cherry-pick back into `develop`.

Recommended branch protections (set in GitHub):
- Require PR reviews and status checks on `main` and `develop`.
- Require linear history on `main`.
- Restrict force-pushes and direct pushes.

