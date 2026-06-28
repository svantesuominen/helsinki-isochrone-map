import type { FeatureCollection, Feature } from 'geojson'
import type { GeocodeSuggestion } from '../types'

const VALHALLA_BASE = 'https://valhalla1.openstreetmap.de'

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
  // Helsinki area bounding box: minLon, maxLat, maxLon, minLat
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

  const data: FeatureCollection = await res.json()

  // Ensure contour property exists from Valhalla's response
  // Valhalla returns features with properties.contour in minutes
  return data
}

export async function fetchDigitransitIsochrone(
  lat: number,
  lng: number,
  subscriptionKey: string,
  times = [15, 30, 45, 60],
): Promise<FeatureCollection> {
  const now = new Date()
  // Use next weekday at 8am for realistic transit times
  const date = getNextWeekday(now)
  const time = '08:00:00'

  const params = new URLSearchParams({
    fromPlace: `${lat},${lng}`,
    mode: 'TRANSIT,WALK',
    date,
    time,
    walkReluctance: '2',
    walkBoardCost: '600',
    minTransferTime: '180',
    maxWalkDistance: '1500',
    precisionMeters: '250',
    offRoadDistanceMeters: '500',
  })

  times.forEach((t) => params.append('cutoffSec', String(t * 60)))

  const res = await fetch(
    `https://api.digitransit.fi/routing/v1/routers/hsl/isochrone?${params}`,
    {
      headers: { 'digitransit-subscription-key': subscriptionKey },
    },
  )

  if (!res.ok) throw new Error(`Digitransit error: ${res.status} ${res.statusText}`)

  const data = await res.json()

  // OTP v1 returns features with properties.time in seconds — normalise to minutes
  const features = (data as FeatureCollection).features.map((f: Feature) => ({
    ...f,
    properties: {
      ...f.properties,
      contour: Math.round(((f.properties?.time as number) || 0) / 60),
    },
  }))

  // Sort descending (60-min first) to match Valhalla's order
  features.sort(
    (a: Feature, b: Feature) =>
      ((b.properties?.contour as number) || 0) - ((a.properties?.contour as number) || 0),
  )

  return { ...data, features }
}

function getNextWeekday(from: Date): string {
  const d = new Date(from)
  // If weekend, advance to Monday
  if (d.getDay() === 0) d.setDate(d.getDate() + 1)
  if (d.getDay() === 6) d.setDate(d.getDate() + 2)
  return d.toISOString().split('T')[0]
}
