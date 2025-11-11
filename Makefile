.PHONY: brain-sync worldclass-live gate-live emotion-calibrate emotion-tests

brain-sync:
	python scripts/brain_sync.py

worldclass-live:
	python backend/metrics/worldclass_live.py && cat reports/worldclass_live.json

gate-live:
	pytest -q tests/metrics/test_worldclass_live_json.py

emotion-check:
	python scripts/check_emotion_golden.py

emotion-calibrate:
	node scripts/emotion_grid_calibrate.mjs

emotion-tests:
	pytest -q tests/worldclass/test_emotion_suite.py

