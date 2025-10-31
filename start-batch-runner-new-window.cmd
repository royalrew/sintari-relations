@echo off
echo Launching batch runner in new window...
echo.
echo This will run batch tests for pyramid routing.
echo.
start "Sintari Batch Runner" cmd /k "cd /d %~dp0 && echo Starting batch runner... && echo. && node scripts/batch_run_sample.mjs --n=200 --shadow --mix=live --trivial=datasets/trivial_pool.jsonl --golden=tests/golden/relations/seed.jsonl"
echo.
echo Batch runner window opened!
echo Check the new window for progress.
timeout /t 3 >nul

