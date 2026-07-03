@echo off
title Poop Stick Sanitizer HUD - Port 8080
echo ============================================
echo  Poop Stick Kingdom Link Sanitizer v1.5
echo  HUD Server starting on http://localhost:8080
echo ============================================
echo.
echo Press Ctrl+C to stop the server.
echo.
python -m http.server 8080
