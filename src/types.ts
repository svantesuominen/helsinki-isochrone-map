import type { FeatureCollection } from 'geojson'

export type TransportMode = 'walking' | 'cycling' | 'car' | 'transit'

export interface Address {
  id: string
  label: string
  inputText: string
  lat: number
  lng: number
  color: string
}

export interface GeocodeSuggestion {
  id: string
  displayName: string
  lat: number
  lng: number
}

export interface TransportWeights {
  walking: number
  cycling: number
  car: number
  transit: number
}

export type IsochroneDataMap = Record<string, Record<TransportMode, FeatureCollection | null>>

export interface IsochroneLoadingMap {
  [addressId: string]: {
    [mode in TransportMode]?: boolean
  }
}

export interface IsochroneErrorMap {
  [addressId: string]: {
    [mode in TransportMode]?: string
  }
}

export type ViewMode = 'individual' | 'combined'

export const TIME_THRESHOLDS = [15, 30, 45, 60] as const
export type TimeThreshold = (typeof TIME_THRESHOLDS)[number]

export const TRANSPORT_MODES: TransportMode[] = ['walking', 'cycling', 'car', 'transit']

export const TRANSPORT_LABELS: Record<TransportMode, string> = {
  walking: 'Walking',
  cycling: 'Cycling',
  car: 'Car',
  transit: 'Public Transit',
}

export const TRANSPORT_ICONS: Record<TransportMode, string> = {
  walking: '🚶',
  cycling: '🚲',
  car: '🚗',
  transit: '🚌',
}

export const COMBINED_COLORS: Record<TimeThreshold, string> = {
  15: '#16a34a',
  30: '#84cc16',
  45: '#f59e0b',
  60: '#ef4444',
}
