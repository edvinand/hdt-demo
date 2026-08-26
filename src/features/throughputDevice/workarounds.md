# Temporary Workarounds

## Serial prefix `0010526` → skip firmware setup (PCA10230 / nRF55FM20A DK)

**File:** `throughputDeviceEffects.ts`, inside `setupDeviceAndOpen`

**Why it exists:**  
nrfutil does not yet recognize part number `0x00000032` (nRF55FM20A). Because device-info
fails, `device.devkit?.boardVersion` is never populated, so the normal firmware verification
and programming flow cannot run. The workaround detects these boards by their serial number
prefix and opens the serial port directly, skipping all firmware setup.

**How to remove it:**  
Once a version of nrfutil ships that correctly identifies part number `0x32` as `nRF55FM20A`
and reports `boardVersion = 'PCA10230'`, do the following:

1. Delete the `if ((device.serialNumber ?? '').startsWith('0010526'))` block in
   `setupDeviceAndOpen` (and this file).
2. Add a dedicated firmware entry for `PCA10230` in `jprogFirmware` pointing at the
   real nRF55FM20A hex file once it is available.
3. Add `'PCA10230'` to the `isNrf54Board` check so it goes through the normal nRF54-family
   programming flow.
