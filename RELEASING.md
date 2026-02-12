# Release Workflow

This project follows [Semantic Versioning](https://semver.org/) (Major.Minor.Patch).

## Current Version: 1.0.0

### How to Release a New Version (e.g., v1.1)

#### 1. Update Version Numbers
Update the `"version"` field in the following files:
*   `./package.json` (Root)
*   `./apps/api/package.json`
*   `./apps/web/package.json`

#### 2. Create the Tag
You can use the automated script:
```powershell
./create_release.ps1
```

**OR manually:**
```bash
git add .
git commit -m "chore: bump version to 1.1.0"
git push origin main
git tag -a v1.1.0 -m "Release v1.1.0"
git push origin v1.1.0
```

#### 3. GitHub Release Notes
1. Go to [Releases](https://github.com/gensterid/mapsnetworkmonitor/releases).
2. Click **Draft a new release**.
3. Select the tag you just pushed.
4. Click **Generate release notes**.
5. Publish!

## Version History
*   **v1.0.0**: Initial stable release with full network monitoring, Mikrotik integration, and interactive map.
