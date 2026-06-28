import * as turf from '@turf/turf'
import type { FeatureCollection, Feature, Polygon, MultiPolygon, Point } from 'geojson'
import type { GeocodeSuggestion } from '../types'

const VALHALLA_BASE = 'https://valhalla1.openstreetmap.de'
const DIGITRANSIT_V2 = 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1'

const VALHALLA_COSTING: Record<string, string> = {
  walking: 'pedestrian',
  cycling: 'bicycle',
  car: 'auto',
}

export async function geocodeAddress(query: string): Promise<GeocodeSuggestion[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('countrycodes', 'fi')
  url.searchParams.set('viewbox', '24.3,60.6,25.5,59.8')
  url.searchParams.set('bounded', '1')
  url.searchParams.set('limit', '6')
  url.searchParams.set('addressdetails', '1')

  const res = await fetch(url.toString(), {
    headers: { 'Accept-Language': 'fi,en' },
  })
  if (!res.ok) throw new Error('Geocoding failed')

  const data = await res.json()
  return (data as Record<string, string>[]).map((item) => ({
    id: item.place_id,
    displayName: formatDisplayName(item),
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
  }))
}

function formatDisplayName(item: Record<string, unknown>): string {
  const addr = item.address as Record<string, string> | undefined
  if (!addr) return item.display_name as string
  const parts: string[] = []
  if (addr.road) parts.push(addr.road + (addr.house_number ? ' ' + addr.house_number : ''))
  else if (addr.amenity) parts.push(addr.amenity)
  else if (addr.building) parts.push(addr.building)
  if (addr.suburb || addr.neighbourhood) parts.push((addr.suburb || addr.neighbourhood) as string)
  if (addr.city || addr.town || addr.municipality)
    parts.push((addr.city || addr.town || addr.municipality) as string)
  return parts.length > 0 ? parts.join(', ') : (item.display_name as string)
}

export async function fetchValhallaIsochrone(
  lat: number,
  lng: number,
  mode: 'walking' | 'cycling' | 'car',
  times = [15, 30, 45, 60],
): Promise<FeatureCollection> {
  const params = {
    locations: [{ lat, lon: lng }],
    costing: VALHALLA_COSTING[mode],
    contours: times.map((t) => ({ time: t })),
    polygons: true,
    denoise: 0.2,
    generalize: 150,
  }

  const url = `${VALHALLA_BASE}/isochrone?json=${encodeURIComponent(JSON.stringify(params))}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Valhalla error: ${res.status} ${res.statusText}`)
  return res.json()
}

/**
 * Transit isochrones via Digitransit v2 GraphQL.
 *
 * Strategy: build a regular point grid around the destination, batch all
 * routing queries into one GraphQL request (one alias per grid point), then
 * use turf.isobands() to turn the travel-time surface into isochrone polygons.
 */
export async function fetchDigitransitIsochrone(
  destLat: number,
  destLng: number,
  subscriptionKey: string,
  times = [15, 30, 45, 60],
): Promise<FeatureCollection> {
  const date = getNextWeekday(new Date())
  const queryTime = '08:00:00'

  // Grid covering ~44 × 56 km around the destination, one point every 7 km → ~63 pts
  const bbox: [number, number, number, number] = [
    destLng - 0.4,
    destLat - 0.27,
    destLng + 0.4,
    destLat + 0.27,
  ]
  const grid = turf.pointGrid(bbox, 7, { units: 'kilometers' })

  // Always include the destination itself (travel time = 0)
  grid.features.push(turf.point([destLng, destLat], { travelTime: 0 }))

  const gridPts = grid.features.map((f: { geometry: Point }) => {
    const [lon, lat] = f.geometry.coordinates
    return { lat, lon }
  })

  // One GraphQL alias per grid point; skip the last (destination) from the query
  const aliases = gridPts.slice(0, -1).map(
    (p: { lat: number; lon: number }, i: number) => `
      p${i}: plan(
        from: {lat: ${p.lat.toFixed(6)}, lon: ${p.lon.toFixed(6)}}
        to:   {lat: ${destLat.toFixed(6)}, lon: ${destLng.toFixed(6)}}
        numItineraries: 1
        date: "${date}"
        time: "${queryTime}"
        transportModes: [{mode: TRANSIT}, {mode: WALK}]
        walkReluctance: 2.0
        maxWalkDistance: 1500
      ) { itineraries { duration } }`,
  )

  const query = `{ ${aliases.join('\n')} }`

  const res = await fetch(DIGITRANSIT_V2, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'digitransit-subscription-key': subscriptionKey,
    },
    body: JSON.stringify({ query }),
  })

  if (!res.ok) throw new Error(`Digitransit v2 error: ${res.status} ${res.statusText}`)

  const result = await res.json()
  if (result.errors?.length) {
    throw new Error(`Digitransit v2 GraphQL: ${result.errors[0].message}`)
  }

  const data = (result.data ?? {}) as Record<
    string,
    { itineraries: Array<{ duration: number }> } | null
  >

  // Annotate grid points with travel time in minutes
  const maxTime = times[times.length - 1]
  const annotated = grid.features.map((f: Feature, i: number) => {
    // Last feature is the destination (travelTime already set to 0)
    if (i === grid.features.length - 1) return f
    const plan = data[`p${i}`]
    const durationMin = (plan?.itineraries?.[0]?.duration ?? (maxTime + 30) * 60) / 60
    return { ...f, properties: { travelTime: Math.min(durationMin, maxTime + 30) } }
  })

  const annotatedGrid = turf.featureCollection(annotated)

  // turf.isobands with breaks [0, 15, 30, 45, 60] creates 4 band features:
  // properties[zProperty] = "0-15", "15-30", "30-45", "45-60"
  const breaks = [0, ...times]
  const bands = turf.isobands(annotatedGrid, breaks, { zProperty: 'travelTime' })

  // Build nested "within T min" polygons by unioning the bands up to T
  const resultFeatures: Feature[] = []
  for (const T of [...times].sort((a, b) => b - a)) {
    const relevant = bands.features.filter((f: Feature) => {
      const band = f.properties?.travelTime as string | undefined
      if (!band) return false
      const upper = parseFloat(band.split('-')[1])
      return !isNaN(upper) && upper <= T
    })

    if (relevant.length === 0) continue

    let merged: Feature<Polygon | MultiPolygon> | null =
      relevant[0] as Feature<Polygon | MultiPolygon>
    for (let i = 1; i < relevant.length; i++) {
      if (!merged) break
      try {
        merged = turf.union(
          merged,
          relevant[i] as Feature<Polygon | MultiPolygon>,
        ) as Feature<Polygon | MultiPolygon> | null
      } catch {
        // ignore topology errors on individual union steps
      }
    }

    if (merged) {
      resultFeatures.push({ ...merged, properties: { contour: T } })
    }
  }

  // Sort descending (60-min first) so small rings render on top
  resultFeatures.sort(
    (a, b) => ((b.properties?.contour as number) || 0) - ((a.properties?.contour as number) || 0),
  )

  return turf.featureCollection(resultFeatures)
}

function getNextWeekday(from: Date): string {
  const d = new Date(from)
  if (d.getDay() === 0) d.setDate(d.getDate() + 1)
  if (d.getDay() === 6) d.setDate(d.getDate() + 2)
  return d.toISOString().split('T')[0]
}
