# Flash Meter — Godox iT30Pro / Nikon FE

An offline-first manual-flash calculator and Sekonic L-308X calibration log, optimised for iPhone. No libraries, accounts, trackers, or servers.

## Deploy with GitHub Pages

1. Upload **all root files and the `icons` folder** to the default `main` branch of `mejtoogood/godox-it30pro-manualmode-helper`.
2. In GitHub repo **Settings → Pages → Build and deployment**, select **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Open `https://mejtoogood.github.io/godox-it30pro-manualmode-helper/` in iPhone Safari, wait for the first online visit to finish caching, then choose **Share → Add to Home Screen**.
4. Afterwards the installed app runs offline. After deploying new versions, open it once online to refresh its cached assets.

## Initial model and calibration

The default baseline is Godox's **approximate GN15 (ISO 100, metres, full power)**, treated as **N (normal) beam**. Godox does not publish a fixed W/N loss; **W defaults to an assumed 1 EV loss**, adjustable under Settings. The resulting W guide number is approximately 10.6.

The formula for required fractional manual power is:

```text
required_fraction = (aperture × distance / (GN100 × sqrt(ISO/100)))² × 2^(desired flash EV)
```

Manual power is rounded to the nearest 1/3 EV supported step, between full power and 1/128. `1/2 +0.7` means two-thirds of a stop above 1/2 power.

To calibrate, use a Sekonic L-308X in **cordless flash mode**, the incident dome towards the flash, and keep ambient exposure negligible. For each measurement record beam N/W, ISO, head-to-subject distance, selected flash power, and the Sekonic f-number including its tenths-of-a-stop readout. The app normalises measurements to ISO 100 and full power, then takes the median in log (stop) space for each mode. It does **not** attempt to fit nonlinearity in distance, power or illumination coverage.

The FE's conventional flash sync speed is **1/125 s or slower**, with no TTL communication from this app.

## Data and privacy

Settings and calibration entries are stored in this origin's browser `localStorage`. Browser storage can be cleared by iOS, so export JSON backup after measuring. Import restores an exported backup, replacing the on-device settings and data. There are no outgoing requests except for the initial retrieval of this app's same-origin static assets.

## Development

Open with any local HTTP server (service workers do not operate on `file://`):

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/`. Core calculations are in `core.mjs` and may be independently tested with Node. Source is unminified for easy modification.

Run the calculation tests with:

```bash
node --test test-core.mjs
```

**Updating the app:** increment `CACHE` in `sw.js` after changing any assets so browsers replace the old offline bundle.

### Power reference table

Table view shares ISO, N/W beam, fill compensation and Sekonic calibration with Power. Full-stop aperture columns plus the current selected aperture; distance rows extend to the full-power guide-number range at the widest aperture, include the exact current distance, and highlight its aperture/distance intersection. Tap a cell to transfer its aperture and distance to the Power calculator.