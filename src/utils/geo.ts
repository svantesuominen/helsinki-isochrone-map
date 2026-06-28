import * as turf from '@turf/turf'
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson'
import type { TransportMode, TransportWeights, IsochroneDataMap, TimeThreshold } from '../types'
import { TIME_THRESHOLDS } from '../types'

type PolyFeature = Feature<Polygon | MultiPolygon>

function extractFeatureAtTime(
  fc: FeatureCollection,
  timeMinutes: number,
): PolyFeature | null {
  const f = fc.features.find(
    (feat) =>
      feat.properties?.contour === timeMinutes || feat.properties?.time === timeMinutes * 60,
  )
  if (!f) return null
  // Validate geometry type
  if (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon') return null
  return f as PolyFeature
}

function safeUnion(features: PolyFeature[]): PolyFeature | null {
  if (features.length === 0) return null
  if (features.length === 1) return features[0]
  try {
    let result: PolyFeature | null = features[0]
    for (let i = 1; i < features.length; i++) {
      if (!result) break
      const next = features[i]
      const u = turf.union(result, next)
      result = u as PolyFeature | null
    }
    return result
  } catch {
    return features[0]
  }
}

function safeIntersect(a: PolyFeature, b: PolyFeature): PolyFeature | null {
  try {
    return turf.intersect(a, b) as PolyFeature | null
  } catch {
    return null
  }
}

/**
 * Computes the combined isochrone per time threshold:
 * For each time T: intersection over all addresses of (union of enabled modes at T)
 */
export function computeCombinedIsochrones(
  addresses: Array<{ id: string }>,
  isochroneData: IsochroneDataMap,
  weights: TransportWeights,
): Partial<Record<TimeThreshold, PolyFeature | null>> {
  const result: Partial<Record<TimeThreshold, PolyFeature | null>> = {}

  for (const T of TIME_THRESHOLDS) {
    // Build per-address union polygon (across enabled modes)
    const addressPolygons: (PolyFeature | null)[] = addresses.map(({ id }) => {
      const addrData = isochroneData[id]
      if (!addrData) return null

      const enabledModeFeatures: PolyFeature[] = (
        ['walking', 'cycling', 'car', 'transit'] as TransportMode[]
      )
        .filter((m) => weights[m] > 0 && addrData[m] != null)
        .map((m) => extractFeatureAtTime(addrData[m]!, T))
        .filter((f): f is PolyFeature => f !== null)

      return safeUnion(enabledModeFeatures)
    })

    const valid = addressPolygons.filter((p): p is PolyFeature => p !== null)

    if (valid.length === 0) {
      result[T] = null
      continue
    }

    if (valid.length === 1) {
      result[T] = valid[0]
      continue
    }

    // Intersect across all addresses
    let intersection: PolyFeature | null = valid[0]
    for (let i = 1; i < valid.length; i++) {
      if (!intersection) break
      intersection = safeIntersect(intersection, valid[i])
    }

    result[T] = intersection
  }

  return result
}
