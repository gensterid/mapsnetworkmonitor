---
description: How to update the Proxmox deployment from GitHub with minimal errors
---

# Proxmox Update Workflow

Follow these steps to update your monitoring application on Proxmox (LXC/VM) while minimizing downtime and build errors.

## Steps

1. **Access the Server**
   - Connect via SSH or open the Proxmox console for your monitoring CT/VM.

2. **Navigate to the Project Directory**
   ```bash
   cd /path/to/project
   ```

// turbo
3. **Run the Automated Update Script**
   ```bash
   chmod +x scripts/update-server.sh
   ./scripts/update-server.sh
   ```

4. **Verify Deployment**
   - Check if the application is running: `pm2 status`
   - View live logs for errors: `pm2 logs`
   - Open the web interface in your browser.

## Troubleshooting

- **Memory Errors**: If the build fails with "JavaScript heap out of memory", the script already tries to use `NODE_OPTIONS="--max-old-space-size=2048"`. Increase this value if your server has more than 4GB of RAM.
- **Git Conflicts**: The script uses `git reset --hard origin/main` which overrides local changes. This is the surest way to avoid "merging" errors on the server.
