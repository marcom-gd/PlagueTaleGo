# Working between PCs

Git stores the project's files and history. The private GitHub repository transfers committed changes between your computers. Each PC keeps its own local folder; changes transfer when you push and pull.

Repository: https://github.com/marcom-gd/PlagueTaleGo (private).

## Set up the other PC once

1. Install Git and Node.js 20 or newer. Sign in to the same GitHub account when Git asks.
2. Make sure the destination folder `PlagueTaleGo` does not already exist in your chosen parent folder.
3. In PowerShell, open the parent folder where you want the project, then run:

   ```powershell
   git clone https://github.com/marcom-gd/PlagueTaleGo.git PlagueTaleGo
   cd PlagueTaleGo
   git config pull.ff only
   ```

4. Open that cloned folder as your project in Codex. Double-click **Start Plague Tale GO.cmd**, then choose Local or Online on the welcome page. There are no package dependencies to install.

Use `git clone` for the second PC rather than copying the folder or running `git init` again. Keep each checkout outside folders managed by OneDrive, Dropbox, or similar file-sync tools.

## Before you start work

From the project folder:

```powershell
git pull --ff-only
```

## Before leaving a PC

Save your files, then run:

```powershell
git status
git add .
git commit -m "Describe what you changed"
git push
```

Review `git status` before committing. If Git says there is nothing to commit, just run `git push` to send any earlier commits. Check that the push succeeds before switching PCs. On the next PC, pull before editing.

You can also ask Codex: **"Pull the latest changes before we start"** or **"Commit and push my changes so I can switch PCs."**

If pull or push is rejected, keep your work and ask Codex to help reconcile the two copies. Avoid force-pushing. The fast-forward-only pull setting stops Git from creating an unexpected merge when the PCs have different changes.

## Workshop saves

`data/` contains local room saves and is excluded from Git, along with `node_modules/`, local `.env` files, and logs. Code and assets sync; live workshop room saves do not.

To carry a workshop between PCs, use **Project > Export** in the workshop, transfer the exported JSON, and use **Project > Import** on the other PC. To keep a deliberate snapshot in Git, place the exported JSON in a new `examples/` folder and commit it. Never place credentials in a committed file.
