@echo off
echo === Building EnglishReader.exe ===
pyinstaller EnglishReader.spec --distpath dist --workpath build --clean
echo.
echo === Done ===
echo EXE at: dist\EnglishReader\EnglishReader.exe
pause
