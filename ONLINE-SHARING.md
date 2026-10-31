# Share a workshop over the internet (Windows)

## Each host's first setup

1. Install Node.js 20 or newer from https://nodejs.org.
2. Extract the whole project into a folder you can write to.
3. Double-click **Start Plague Tale GO.cmd**. Your browser opens the welcome page automatically. Choose **Online session**. The first online setup downloads Cloudflare's official `cloudflared` executable from its GitHub releases into `tools/`; progress appears on the welcome page. Internet access to GitHub and Cloudflare is required. No Cloudflare account, domain, router configuration, or administrator service installation is needed. The old **start-online.cmd** and **start-workshop.cmd** also open this welcome page.

The launcher supports 64-bit Intel/AMD and ARM Windows. The downloaded executable is machine-specific: omit `tools/` when distributing the project so each student downloads the right version. To update it, stop the online launcher, delete `tools/cloudflared.exe`, and launch again.

## Host a session

1. Double-click **Start Plague Tale GO.cmd** and choose **Online session** on the welcome page. Wait for **Your online session is ready**. Setup errors appear here with a **Try again** button.
2. Choose a **Session name**, such as `class-a`. The same name reopens that saved room. Click **Start session** to open the workshop in another tab. The host stays local and does not need to enter a password.
3. On the welcome page, click **Copy invitation** to copy the room link, username **workshop**, and session password together. Share privately. Participants open the invitation link and enter those credentials. They only need a browser; they do not need Node.js or Cloudflare installed to join.
4. Keep the welcome page for session controls. **Stop online sharing** disconnects online participants while leaving the local workshop running. You can start online sharing again without reopening your project. **Share workshop** inside the editor also copies the current room's online link. Everyone with this session password can access and edit any room; room names are organizational, not access permissions.
5. Keep the launcher window open, your PC awake, and your internet connected. Press **Ctrl+C** in that window to stop the launcher and workshop. Double-clicking the launcher again reopens its welcome page instead of starting a duplicate process.

Each new online connection gets a new URL and password. Old public URLs stop working when their tunnel stops. Saved projects remain in `data/` on the host PC and can be reopened under the same room name next session. Export important projects using **Project → Export** and back up `data/`. No online cloud storage is created.

The launcher listens only on this PC's loopback interface. Local and online sessions use the same server and project state, so you can enable or stop sharing while continuing to work locally. The welcome page, credentials, backup folder management, and repository card editing remain host-only. If another application occupies port 3000, the launcher chooses another available port automatically. Close any older server started with `node server.mjs` before opening the same room through the new launcher.

## Give the project to students

Distribute the source folder including **Start Plague Tale GO.cmd**, **launcher.mjs**, **tunnel.mjs**, the complete **launcher/** and **public/** folders, and the other server modules, card inventories, package file, and documentation. Omit `.git/`, `tools/`, your private `data/`, and **Saved Projects/** folders. Students hosting their own copies follow the same steps and get independent URLs, passwords, and saved rooms. Share a JSON export when they need a copy of an existing project.

## Connection details and troubleshooting

Cloudflare Quick Tunnels do not support Server-Sent Events, so online mode checks for collaborator changes every 1.5 seconds. Your own edits appear immediately; collaborators see them on the next successful check. Wait for **All changes saved** before closing a browser tab.

The welcome card asks each participant for a nickname, silhouette avatar, and color. Connected avatars appear in the top strip. Live cursor updates use a separate long-poll connection and are not delayed by the 1.5-second project check. The header shows the actual participant count. Use **Hide cursors** to hide other people's pointers on your own screen; click your avatar to change your profile. Profiles and cursors are scoped to the room and are not written into saved projects.

Quick Tunnels are temporary and have no uptime guarantee. They support up to 200 concurrent requests; this is intended for modest classroom sessions. School network policies may block tunnels. If the launcher cannot connect, the welcome page shows a setup error; check network access and retry, or ask school IT. Do not disable your firewall.

If `tools/cloudflared.exe` exists but cannot start, remove it and rerun the launcher to download the correct architecture. If a `.cloudflared/config.yaml` from an existing Cloudflare setup interferes with Quick Tunnels, follow Cloudflare's documentation before changing that personal configuration.

Session credentials protect the entire online workshop. Anyone given them can edit, replace, or clear projects. The password is generated in memory on each launch and is not stored in the project. Do not distribute screenshots or logs containing it.

Official reference: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
