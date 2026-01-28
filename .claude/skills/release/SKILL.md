---
name: release
description: Bump version, commit, push, and watch GitHub Actions workflow complete (project)
user-invocable: true
allowed-tools: Read, Edit, Bash
---

# Release Skill

Automates the release process: bump version, commit, push, and watch GitHub Actions.

## Version Bump Rules (Auto-detect)

Analyze commits since last version tag to determine bump type:

- **major** (X.0.0): Commits with `BREAKING CHANGE` or `!:` (e.g., `feat!:`)
- **minor** (x.Y.0): Commits starting with `feat:`
- **patch** (x.y.Z): All other commits (`fix:`, `chore:`, `refactor:`, etc.)

## Steps

### 1. Analyze commits and determine version

```bash
# Get current version from package.json
cat package.json | grep '"version"'

# Get commits since last tag (or recent commits if no tag)
git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~10)..HEAD
```

Determine bump type from commit prefixes.

### 2. Bump version in package.json

Edit `package.json` to update the version field.

### 3. Commit and push

```bash
git add package.json
git commit -m "chore: release vX.Y.Z"
git push origin master
```

### 4. Watch GitHub Actions

```bash
# Wait a moment for the workflow to start
sleep 3

# Get the latest run ID and watch it
gh run watch $(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')
```

Report the final status (success/failure) to the user.
