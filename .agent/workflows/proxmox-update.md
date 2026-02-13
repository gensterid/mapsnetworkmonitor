---
description: How to update the Proxmox deployment from GitHub with minimal errors
---

To update the Proxmox deployment safely, follow these steps on the server:

1. **Access the Server**: SSH into your Proxmox/Linux server where the monitoring app is hosted.
2. **Navigate to the Project Root**:
   ```bash
   cd /path/to/your/project
   ```
3. **Run the Automated Update Script**:
   // turbo
   ```bash
   bash scripts/update-server.sh
   ```
   *Note: This script handles git-pull, npm-install, database-sync, and app-rebuild automatically.*

4. **Verify Process Status**:
   ```bash
   pm2 list
   ```
   Ensure both `api` and `web` (or equivalent names) are in `online` status.

5. **Check for Runtime Errors**:
   ```bash
   pm2 logs
   ```
   Keep an eye on the logs for a few minutes to ensure no startup crashes occur.

6. **Clear Browser Cache**: If UI changes don't appear, try a hard refresh (Ctrl+F5) in your browser.
