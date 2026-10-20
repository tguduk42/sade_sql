@echo off
setlocal
if not exist "%~dp0dist\release-1.0.4\Sade-SQL-1.0.4-Windows.exe" (
  echo Windows uygulama dosyasi bulunamadi.
  echo dist\release-1.0.4 klasorundeki Sade-SQL-1.0.4-Windows.exe dosyasini kontrol edin.
  pause
  exit /b 1
)
start "" "%~dp0dist\release-1.0.4\Sade-SQL-1.0.4-Windows.exe"
