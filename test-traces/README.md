# Test traces for zigzag (imaging) detection

Trace JSON files and rendered SVGs for regression testing. When changing the zigzag algorithm, run detection on these and confirm expected outcomes.

## Expected results (fixed 40 min window, stride 5 or bot stride 1 + 10s interval)

| Trace | Expected | Notes |
|-------|----------|--------|
| `trace_full_a65095.json` | **Pass** (imaging) | True imaging/survey pattern |
| `trace_full_a6e257_imaging.json` | **Pass** (imaging) | True imaging/survey pattern |
| `trace_full_a199ef_not_imaging.json` | Fail | Not imaging |
| `trace_full_ab7d21_not_aerial.json` | Fail | Not aerial pattern |
| `trace_full_a0e5f2_not.json` | Fail | Not surveying |
| `trace_full_a123d7_not.json` | Fail | Not surveying (balance/parallel) |
| `trace_full_a3ff29_not.json` | Fail | Not imaging (false positive to avoid) |
| `trace_full_a49804_not.json` | Fail | Not imaging |
| `trace_full_abc6bd_not.json` | Fail | Not imaging (transit + short wiggles) |

## Run zigzag on all traces

```bash
# Default 10s interval, stride 5, 40 min window (matches bot data rate)
for f in test-traces/trace_full_*.json; do
  echo "=== $(basename "$f") ==="
  npx ts-node scripts/run-zigzag-on-trace.ts "$f" 10 5 40
  echo
done
```

## Regenerate SVGs

From repo root:

```bash
# stride 5 for most; abc6bd uses stride 1 (matches bot, shows pre-fix false positive if you temporarily revert extended leg check)
for f in test-traces/trace_full_*.json; do
  name=$(basename "$f" .json)
  hex=${name#trace_full_}
  hex=${hex%%_*}
  stride=5
  [ "$hex" = "abc6bd" ] && stride=1
  echo "=== $name -> flight_path_${hex}.svg (stride $stride) ==="
  npx ts-node scripts/render-trace-to-svg.ts "$f" "test-traces/flight_path_${hex}.svg" "$stride" 40
done
```
