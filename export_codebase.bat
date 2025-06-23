@echo off
setlocal enabledelayedexpansion

REM MeetingMind Codebase Export Script (Windows Batch Version)
REM Exports all code files, structure, and content to a comprehensive text file

echo 🚀 Starting MeetingMind codebase export...

set "ROOT_DIR=%~dp0"
set "OUTPUT_FILE=%ROOT_DIR%complete_codebase_export.txt"

echo 📁 Root directory: %ROOT_DIR%
echo 📄 Output file: %OUTPUT_FILE%

REM Initialize counters
set /a TOTAL_FILES=0
set /a TOTAL_LINES=0
set /a EXPORTED_COUNT=0
set /a SKIPPED_COUNT=0

echo 📊 Calculating codebase statistics...

REM Create header
echo # MeetingMind Complete Codebase Export > "%OUTPUT_FILE%"
echo Generated: %date% %time% >> "%OUTPUT_FILE%"
echo Root Path: %ROOT_DIR% >> "%OUTPUT_FILE%"
echo. >> "%OUTPUT_FILE%"

echo ## Directory Structure >> "%OUTPUT_FILE%"
echo ``` >> "%OUTPUT_FILE%"
tree /F /A "%ROOT_DIR%" >> "%OUTPUT_FILE%" 2>nul
echo ``` >> "%OUTPUT_FILE%"
echo. >> "%OUTPUT_FILE%"

echo ## Complete File Contents >> "%OUTPUT_FILE%"
echo. >> "%OUTPUT_FILE%"

echo 📄 Exporting file contents...

REM Process each file
for /r "%ROOT_DIR%" %%F in (*) do (
    call :ProcessFile "%%F"
)

REM Footer
echo. >> "%OUTPUT_FILE%"
echo ================================================================================ >> "%OUTPUT_FILE%"
echo # Export Summary >> "%OUTPUT_FILE%"
echo - Files exported: !EXPORTED_COUNT! >> "%OUTPUT_FILE%"
echo - Files skipped: !SKIPPED_COUNT! >> "%OUTPUT_FILE%"
echo - Export completed: %date% %time% >> "%OUTPUT_FILE%"
echo ================================================================================ >> "%OUTPUT_FILE%"

echo.
echo ✅ Export completed successfully!
echo 📊 Statistics:
echo    - Files exported: !EXPORTED_COUNT!
echo    - Files skipped: !SKIPPED_COUNT!
echo 📄 Output file: %OUTPUT_FILE%
echo 🎉 Codebase export complete!

pause
goto :eof

:ProcessFile
set "FILE=%~1"
set "FILENAME=%~nx1"
set "EXT=%~x1"

REM Skip if in excluded directories
echo "%FILE%" | findstr /i "node_modules __pycache__ \.git \.vscode \.idea dist build coverage target venv env virtualenv tmp temp logs .cache" >nul
if not errorlevel 1 (
    set /a SKIPPED_COUNT+=1
    goto :eof
)

REM Skip binary files
if /i "%EXT%"==".exe" goto :skip
if /i "%EXT%"==".dll" goto :skip
if /i "%EXT%"==".png" goto :skip
if /i "%EXT%"==".jpg" goto :skip
if /i "%EXT%"==".jpeg" goto :skip
if /i "%EXT%"==".gif" goto :skip
if /i "%EXT%"==".mp3" goto :skip
if /i "%EXT%"==".mp4" goto :skip
if /i "%EXT%"==".zip" goto :skip
if /i "%EXT%"==".pdf" goto :skip

REM Include text files
if /i "%EXT%"==".ts" goto :include
if /i "%EXT%"==".tsx" goto :include
if /i "%EXT%"==".js" goto :include
if /i "%EXT%"==".jsx" goto :include
if /i "%EXT%"==".json" goto :include
if /i "%EXT%"==".yaml" goto :include
if /i "%EXT%"==".yml" goto :include
if /i "%EXT%"==".py" goto :include
if /i "%EXT%"==".md" goto :include
if /i "%EXT%"==".txt" goto :include
if /i "%EXT%"==".html" goto :include
if /i "%EXT%"==".css" goto :include
if /i "%EXT%"==".scss" goto :include
if /i "%EXT%"==".sh" goto :include
if /i "%EXT%"==".bat" goto :include
if /i "%EXT%"==".sql" goto :include
if /i "%EXT%"==".xml" goto :include
if /i "%EXT%"==".config" goto :include
if /i "%EXT%"==".conf" goto :include

REM Include specific filenames
if /i "%FILENAME%"=="package.json" goto :include
if /i "%FILENAME%"=="tsconfig.json" goto :include
if /i "%FILENAME%"=="vite.config.ts" goto :include
if /i "%FILENAME%"=="tailwind.config.js" goto :include
if /i "%FILENAME%"=="dockerfile" goto :include
if /i "%FILENAME%"==".gitignore" goto :include
if /i "%FILENAME%"==".eslintrc.js" goto :include

goto :skip

:include
echo 📝 Exporting: %FILE%

REM Calculate relative path
set "RELATIVE_PATH=!FILE:%ROOT_DIR%=!"

REM Write file header
echo. >> "%OUTPUT_FILE%"
echo ================================================================================ >> "%OUTPUT_FILE%"
echo FILE: !RELATIVE_PATH! >> "%OUTPUT_FILE%"
for %%A in ("%FILE%") do echo SIZE: %%~zA bytes >> "%OUTPUT_FILE%"
for %%A in ("%FILE%") do echo MODIFIED: %%~tA >> "%OUTPUT_FILE%"
echo ================================================================================ >> "%OUTPUT_FILE%"
echo. >> "%OUTPUT_FILE%"

REM Write file content
type "%FILE%" >> "%OUTPUT_FILE%" 2>nul

echo. >> "%OUTPUT_FILE%"
echo. >> "%OUTPUT_FILE%"

set /a EXPORTED_COUNT+=1
goto :eof

:skip
set /a SKIPPED_COUNT+=1
goto :eof