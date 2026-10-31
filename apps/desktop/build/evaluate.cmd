@echo off
setlocal
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0JaxOS.exe" "%~dp0resources\app.asar\dist-electron\eval.cjs" %*
exit /b %errorlevel%
