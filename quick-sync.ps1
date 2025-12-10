# Quick Sync with GitHub Development Branch
# Run this anytime you want to grab the latest from the remote repository

Write-Host "=== Syncing with GitHub Development Branch ===" -ForegroundColor Cyan
Set-Location "C:\Users\manny\Documents\enhancemyseo"

Write-Host "`nFetching latest changes..." -ForegroundColor Yellow
git fetch origin

Write-Host "`nResetting to origin/development..." -ForegroundColor Yellow
git reset --hard origin/development

Write-Host "`nCleaning up..." -ForegroundColor Yellow
git clean -fd

Write-Host "`nCurrent status:" -ForegroundColor Cyan
git status

Write-Host "`nLatest commits:" -ForegroundColor Cyan
git log -5 --oneline --decorate

Write-Host "`n=== Sync Complete! ===" -ForegroundColor Green
Write-Host "Your local repository is now up to date with the remote development branch." -ForegroundColor Green

