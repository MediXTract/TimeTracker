$repoUrl = "https://github.com/MediXTract/TimeTracker"
$zipUrl = "$repoUrl/archive/refs/heads/main.zip"
$currentDir = Get-Location
$tempDir = Join-Path $env:TEMP "TimeTrackerUpdate_$(Get-Date -Format 'yyyyMMddHHmmss')"
$zipFile = Join-Path $env:TEMP "time_tracker_update.zip"

Write-Host "--- MediXtract TimeTracker Updater ---" -ForegroundColor Cyan

# 1. Check for Git
if (Test-Path (Join-Path $currentDir ".git")) {
    Write-Host "[GIT MODE] Git repository detected. Checking for updates..." -ForegroundColor Green
    
    # Check if git is in path
    if (Get-Command git -ErrorAction SilentlyContinue) {
        Write-Host "Stashing local changes..."
        git stash
        
        Write-Host "Pulling latest version..."
        $pullOutput = git pull
        Write-Host $pullOutput
        
        Write-Host "Restoring local changes..."
        # Quietly pop the stash. We use --quiet if available or just pipe to null.
        git stash pop 2>$null
        
        # Ensure that any core files missing from the disk are restored
        $deletedFiles = git ls-files --deleted
        if ($deletedFiles) {
            Write-Host "Restoring missing program files..." -ForegroundColor Yellow
            git checkout -- $deletedFiles
        }
        
        Write-Host "`nUpdate complete via Git!" -ForegroundColor Green
        return
    } else {
        Write-Host "[WARNING] .git folder found but 'git' command is not available." -ForegroundColor Yellow
        Write-Host "Proceeding with manual ZIP update..."
    }
}

# 2. Manual ZIP Update (for non-git users)
Write-Host "[ZIP MODE] Downloading latest version from GitHub..." -ForegroundColor Green

try {
    # Download
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile
    
    # Extract
    if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
    New-Item -ItemType Directory -Path $tempDir | Out-Null
    
    Write-Host "Extracting files..."
    Expand-Archive -Path $zipFile -DestinationPath $tempDir -Force
    
    # The zip usually contains a folder named "TimeTracker-main"
    $extractedFolder = Get-ChildItem -Path $tempDir -Directory | Select-Object -First 1
    if ($null -eq $extractedFolder) {
        throw "Failed to find extracted folder in $tempDir"
    }
    
    Write-Host "Syncing files (preserving 'projects' folder)..."
    
    # Get all items in the new version
    $newItems = Get-ChildItem -Path $extractedFolder.FullName
    
    foreach ($item in $newItems) {
        $targetPath = Join-Path $currentDir $item.Name
        
        # SKIP the projects folder
        if ($item.Name -eq "projects") {
            Write-Host "Skipping '$($item.Name)' folder (protected)..." -ForegroundColor Gray
            continue
        }
        
        # For everything else, overwrite
        if (Test-Path $targetPath) {
            Write-Host "Updating '$($item.Name)'..."
            if ($item.PSIsContainer) {
                Copy-Item -Path $item.FullName -Destination $currentDir -Recurse -Force
            } else {
                Copy-Item -Path $item.FullName -Destination $currentDir -Force
            }
        } else {
            Write-Host "Adding new item '$($item.Name)'..."
            if ($item.PSIsContainer) {
                Copy-Item -Path $item.FullName -Destination $currentDir -Recurse
            } else {
                Copy-Item -Path $item.FullName -Destination $currentDir
            }
        }
    }
    
    Write-Host "`nManual update complete!" -ForegroundColor Green
    
} catch {
    Write-Host "`n[ERROR] Update failed: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    # Cleanup
    if (Test-Path $zipFile) { Remove-Item $zipFile -Force }
    if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
}
