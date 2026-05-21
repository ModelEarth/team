# NISAR Subsidence Data Pipeline

Pulls and processes ground-deformation observations and writes
`team/projects/map/nisar_subsidence.csv`, which feeds
`team/projects/map/nisar.html`.

## What it does

1. Writes a curated CSV of ~20 published subsidence hotspots
   (NASA JPL, USGS, ESA, peer-reviewed InSAR studies) with rates, units, and
   source links.
2. Queries NASA's EarthData [CMR](https://cmr.earthdata.nasa.gov/search/)
   for current granule counts of NISAR L2 GUNW / GOFF and OPERA DISP-S1 /
   DISP-NI displacement products, and writes the result to
   `cmr_catalog.json` so the map can show when new data is available.
3. Runs `extract_h5_metadata.py` against the bundled `NISAR_L2.h5` sample
   granule to produce `../nisar_l2_metadata.json` — consumed by
   `nisar-line.html` because the bundled jsfive build cannot traverse this
   file's group structure in the browser.

NISAR was launched July 2024 and is in its commissioning phase, so its
operational L2 GUNW catalog is still small. OPERA DISP-S1 (Sentinel-1
displacement) is already producing public granules and is the closest
analog currently available.

## Run it

```bash
cd team/projects/map/pipeline
python3 fetch_nisar_data.py             # CSV + CMR catalog + H5 metadata sidecar
python3 fetch_nisar_data.py --no-cmr    # offline — only rewrites the CSV / sidecar
python3 fetch_nisar_data.py --no-h5-metadata  # skip the H5 sidecar regeneration
python3 extract_h5_metadata.py          # standalone H5 -> JSON extractor
```

`fetch_nisar_data.py` uses only the standard library.
`extract_h5_metadata.py` requires `h5py` (already a common scientific
Python dep): `pip install h5py`.

## Adding a new data point

Append to `CURATED_HOTSPOTS` in `fetch_nisar_data.py`. Required fields:
`record_id`, `location_name`, `country`, `admin_level_1`, `area_type`
(`county` or `postal_or_district`), `area_name`, `postal_code`, `latitude`,
`longitude`, `subsidence_value`, `subsidence_unit` (`cm/year` or `in/year`),
`source_label`, `source_url`, `observation_notes`.

Re-run `python3 fetch_nisar_data.py` to regenerate the CSV.

## Wiring in live granules

When NISAR L2 GUNW granules go public, extend `fetch_cmr_granule_counts`
to follow each granule's `polygons` field, geocode the centroid, and emit
a row with the granule ID as `record_id`. The CMR JSON response already
includes everything needed — see `cmr_catalog.json` after a run for the
shape of the response.
