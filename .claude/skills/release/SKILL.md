---
name: release
description: Bump version, commit, push, and watch GitHub Actions workflow complete (project)
user-invocable: true
allowed-tools: Read, Edit, Bash, WebFetch
---

# Release Skill

This skill automates the release process for cc-chat:

1. **Bump version** in `package.json`
2. **Commit** the changes with a proper message
3. **Push** to remote
4. **Watch** GitHub Actions workflow until completion

## Usage

When invoked, ask the user for:
- Version bump type: patch (1.0.0 -> 1.0.1), minor (1.0.0 -> 1.1.0), or major (1.0.0 -> 2.0.0)
- Or let user specify exact version

## Steps

### 1. Read current version
```bash
# Read package.json to get current version
```

### 2. Bump version
Edit `package.json` to update the version field.

### 3. Commit and push
```bash
git add package.json
git commit -m "chore: bump version to X.Y.Z"
git push origin master
```

### 4. Watch GitHub Actions
Use `gh run list` to find the latest workflow run, then poll `gh run view` until it completes:

```bash
# Get the latest run ID
gh run list --limit 1 --json databaseId --jq '.[0].databaseId'

# Watch the run (poll every 10 seconds)
gh run watch <run_id>
```

Report the final status to the user (success/failure).

## Notes

- If there are uncommitted changes besides package.json, warn the user
- If the workflow fails, show the error logs
- The workflow builds binaries for win/mac/linux and creates a GitHub release
