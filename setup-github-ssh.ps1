# GitHub SSH Setup Script
# Run this in a fresh PowerShell window

Write-Host "=== GitHub SSH Key Setup ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create .ssh directory if it doesn't exist
$sshDir = "$env:USERPROFILE\.ssh"
if (-not (Test-Path $sshDir)) {
    Write-Host "Creating .ssh directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $sshDir | Out-Null
}

# Step 2: Generate SSH key
$keyPath = "$sshDir\id_ed25519"
if (Test-Path "$keyPath.pub") {
    Write-Host "SSH key already exists at: $keyPath" -ForegroundColor Green
} else {
    Write-Host "Generating new SSH key..." -ForegroundColor Yellow
    Write-Host "Please enter your GitHub email when prompted:" -ForegroundColor Cyan
    $email = Read-Host "GitHub email"
    
    ssh-keygen -t ed25519 -C "$email" -f $keyPath
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`nSSH key generated successfully!" -ForegroundColor Green
    } else {
        Write-Host "`nError generating SSH key. Please try again." -ForegroundColor Red
        exit 1
    }
}

# Step 3: Start SSH agent
Write-Host "`nStarting SSH agent..." -ForegroundColor Yellow
Start-Service ssh-agent
Set-Service -Name ssh-agent -StartupType Automatic

# Step 4: Add key to SSH agent
Write-Host "Adding SSH key to agent..." -ForegroundColor Yellow
ssh-add $keyPath

# Step 5: Display public key
Write-Host "`n=== YOUR PUBLIC SSH KEY ===" -ForegroundColor Cyan
Write-Host "Copy the key below and add it to your GitHub account:" -ForegroundColor Yellow
Write-Host ""
Get-Content "$keyPath.pub"
Write-Host ""

# Step 6: Copy to clipboard
Write-Host "Attempting to copy key to clipboard..." -ForegroundColor Yellow
Get-Content "$keyPath.pub" | Set-Clipboard
Write-Host "Key copied to clipboard!" -ForegroundColor Green

# Step 7: Instructions
Write-Host "`n=== NEXT STEPS ===" -ForegroundColor Cyan
Write-Host "1. Go to: https://github.com/settings/keys" -ForegroundColor White
Write-Host "2. Click 'New SSH key'" -ForegroundColor White
Write-Host "3. Give it a title (e.g., 'My Windows PC')" -ForegroundColor White
Write-Host "4. Paste the key from your clipboard" -ForegroundColor White
Write-Host "5. Click 'Add SSH key'" -ForegroundColor White
Write-Host ""
Write-Host "Press any key when you've added the key to GitHub..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Step 8: Test connection
Write-Host "`nTesting GitHub connection..." -ForegroundColor Yellow
ssh -T git@github.com 2>&1

# Step 9: Update git remote
Write-Host "`nUpdating git remote to use SSH..." -ForegroundColor Yellow
Set-Location "C:\Users\manny\Documents\enhancemyseo"
git remote set-url origin git@github.com:mespinozza/enhancemyseo.git
Write-Host "Remote updated!" -ForegroundColor Green

# Step 10: Test fetch
Write-Host "`nTesting fetch from GitHub..." -ForegroundColor Yellow
git fetch origin

Write-Host "`n=== SETUP COMPLETE! ===" -ForegroundColor Green
Write-Host "You can now use git commands without entering passwords." -ForegroundColor Green
Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

