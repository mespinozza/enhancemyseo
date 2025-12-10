# GitHub SSH Setup Guide

## 🚀 Quick Setup (One-Time)

**⚠️ IMPORTANT: Close your current terminal and open a fresh PowerShell window first!**

### Step 1: Run the SSH Setup Script

In a **fresh** PowerShell window (Run as Administrator if possible):

```powershell
cd "C:\Users\manny\Documents\enhancemyseo"
.\setup-github-ssh.ps1
```

This script will:
1. ✅ Generate an SSH key pair for you
2. ✅ Start the SSH agent service
3. ✅ Add your key to the agent
4. ✅ Copy your public key to clipboard
5. ✅ Guide you through adding it to GitHub
6. ✅ Update your git remote to use SSH
7. ✅ Test the connection

### Step 2: Add Key to GitHub

The script will pause and open your browser. Follow these steps:

1. Go to: https://github.com/settings/keys
2. Click the green **"New SSH key"** button
3. Title: `My Windows PC` (or any name you prefer)
4. Key: **Paste from clipboard** (already copied by script)
5. Click **"Add SSH key"**
6. Enter your GitHub password if prompted
7. Go back to PowerShell and press any key to continue

### Step 3: Complete Setup

The script will test your connection and update your repository settings.

---

## 🔄 Daily Use: Quick Sync

After SSH is set up, whenever you want to grab the latest from GitHub:

### Option 1: Double-Click the Script
Simply double-click `quick-sync.ps1` in File Explorer

### Option 2: Run from Terminal
```powershell
.\quick-sync.ps1
```

This will:
- ✅ Fetch all latest changes from GitHub
- ✅ Reset your local code to match the remote development branch
- ✅ Clean up any local files
- ✅ Show you the latest commits

**⚠️ Warning:** This will override any local changes you haven't committed!

---

## 📋 Troubleshooting

### If the terminal is stuck (showing "HELP" or "less" commands):
1. Press `q` to quit the pager
2. If that doesn't work, close the terminal completely
3. Open a fresh PowerShell window
4. Navigate back to the project directory

### If SSH key generation fails:
Make sure you have Git installed with SSH support:
```powershell
ssh -V
```

If ssh command is not found, you may need to install OpenSSH:
```powershell
# Run as Administrator
Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0
```

### If git commands still ask for password:
Verify the remote URL is using SSH:
```powershell
git remote -v
```

Should show: `git@github.com:mespinozza/enhancemyseo.git`

---

## ✨ Benefits of SSH Authentication

- 🚀 **Faster**: No password prompts
- 🔒 **Secure**: Uses cryptographic keys
- 💯 **Convenient**: Set up once, use forever
- ⚡ **Efficient**: Quick pulls and pushes

---

## 🎯 Next Steps

After setup, you can simply run `quick-sync.ps1` anytime you want the latest code from the development branch!

