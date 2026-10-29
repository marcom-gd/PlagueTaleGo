# Share a workshop over the internet (Windows)

## Each host's first setup

1. Install Node.js 20 or newer from https://nodejs.org.
2. Extract the whole project into a folder you can write to.
3. Double-click **start-online.cmd**. The first run downloads Cloudflare's official `cloudflared` executable from its GitHub releases into `tools/`. Internet access to GitHub and Cloudflare is required. No Cloudflare account, domain, router configuration, or administrator service installation is needed.

The launcher supports 64-bit Intel/AMD and ARM Windows. The downloaded executable is machine-specific: omit `tools/` when distributing the project so each student downloads the right version. To update it, stop the online launcher, delete `tools/cloudflared.exe`, and launch again.

## Host a session

1. Double-click **start-online.cmd** and wait for **Open and share** and an `https://…trycloudflare.com/?room=class-a` address.
2. Open that address. The browser asks for username **workshop** and the session password printed in the launcher window.
3. Give participants the room link and password privately. They only need a browser; they do not need Node.js or Cloudflare installed to join.
4. Use **Share workshop** to copy the current room's online link. Use `?room=group-b` for another group. Everyone with this session password can access and edit any room; room names are organizational, not access permissions.
5. Keep the launcher open, your PC awake, and your internet connected. Press **Ctrl+C** to stop the session. Both the server and tunnel stop. Closing the window also ends hosting.

Each launch gets a new URL and password. Old public URLs stop working when their tunnel stops. Saved projects remain in `data/` on the host PC and can be reopened under the same room name next session. Export important projects using **Project → Export** and back up `data/`. No online cloud storage is created.

The online server uses a separate automatic local port and listens only on this PC's loopback interface. A local-only workshop can continue running separately, but do not open the same saved room through two server processes at once. Close the local workshop before hosting that room online.

## Give the project to students

Distribute the source folder including **start-online.cmd**, **online.mjs**, **server.mjs**, **package.json**, and the complete **public/** folder. Include the documentation. Omit `.git/`, `tools/`, and your private `data/` folder. Students hosting their own copies follow the same steps and get independent URLs, passwords, and saved rooms. Share a JSON export when they need a copy of an existing project.

## Connection details and troubleshooting

Cloudflare Quick Tunnels do not support Server-Sent Events, so online mode checks for collaborator changes every 1.5 seconds. Your own edits appear immediately; collaborators see them on the next successful check. Wait for **All changes saved** before closing a browser tab.

The welcome card asks each participant for a nickname, silhouette avatar, and color. Connected avatars appear in the top strip. Live cursor updates use a separate long-poll connection and are not delayed by the 1.5-second project check. The header shows the actual participant count. Use **Hide cursors** to hide other people's pointers on your own screen; click your avatar to change your profile. Profiles and cursors are scoped to the room and are not written into saved projects.

Quick Tunnels are temporary and have no uptime guarantee. They support up to 200 concurrent requests; this is intended for modest classroom sessions. School network policies may block tunnels. If the launcher cannot connect, its window shows Cloudflare's error; check network access or ask school IT. Do not disable your firewall.

If `tools/cloudflared.exe` exists but cannot start, remove it and rerun the launcher to download the correct architecture. If a `.cloudflared/config.yaml` from an existing Cloudflare setup interferes with Quick Tunnels, follow Cloudflare's documentation before changing that personal configuration.

Session credentials protect the entire online workshop. Anyone given them can edit, replace, or clear projects. The password is generated in memory on each launch and is not stored in the project. Do not distribute screenshots or logs containing it.

Official reference: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
