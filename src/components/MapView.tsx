import { useMemo, useEffect } from 'react'
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import type { PathOptions } from 'leaflet'
import type { Feature } from 'geojson'
import type {
  Address,
  TransportWeights,
  IsochroneDataMap,
  IsochroneLoadingMap,
  ViewMode,
  TransportMode,
  TimeThreshold,
} from '../types'
import { TIME_THRESHOLDS, COMBINED_COLORS } from '../types'
import { computeCombinedIsochrones } from '../utils/geo'

const HELSINKI_CENTER: [number, number] = [60.1699, 24.9384]

const MODE_ORDER: TransportMode[] = ['transit', 'car', 'cycling', 'walking']

function getContourTime(feature: Feature): number {
  return (feature.properties?.contour as number) ?? 0
}

function getIndividualOpacity(timeMinutes: number, weight: number): number {
  // Inner rings stacked → cumulative opacity creates heatmap naturally
  // Base opacity per layer; higher weights make them more visible
  const baseOpacity = weight / 100
  const timeScale = timeMinutes === 15 ? 1 : timeMinutes === 30 ? 0.85 : timeMinutes === 45 ? 0.7 : 0.55
  return baseOpacity * timeScale * 0.22
}

// Flyto Helsinki when first address is added
function MapController({ addresses }: { addresses: Address[] }) {
  const map = useMap()
  const firstAddr = addresses[0]

  useEffect(() => {
    if (firstAddr) {
      map.flyTo([firstAddr.lat, firstAddr.lng], 12, { duration: 1.2 })
    }
  }, [firstAddr, map])

  return null
}

interface IndividualLayersProps {
  addresses: Address[]
  isochroneData: IsochroneDataMap
  weights: TransportWeights
  loadingMap: IsochroneLoadingMap
}

function IndividualLayers({ addresses, isochroneData, weights }: IndividualLayersProps) {
  return (
    <>
      {addresses.flatMap((address) => {
        const addrData = isochroneData[address.id]
        if (!addrData) return []

        return MODE_ORDER.flatMap((mode) => {
          const weight = weights[mode]
          if (weight === 0) return []
          const fc = addrData[mode]
          if (!fc || fc.features.length === 0) return []

          // Sort descending by time so large rings render first (below small rings)
          const sorted = [...fc.features].sort(
            (a, b) => getContourTime(b) - getContourTime(a),
          )

          return sorted.map((feature) => {
            const t = getContourTime(feature)
            const opacity = getIndividualOpacity(t, weight)
            if (opacity < 0.01) return null

            const styleOptions: PathOptions = {
              fillColor: address.color,
              fillOpacity: opacity,
              color: address.color,
              weight: t === 15 ? 1.5 : 0.5,
              opacity: t === 15 ? 0.6 : 0.25,
            }

            return (
              <GeoJSON
                key={`${address.id}-${mode}-${t}`}
                data={feature}
                style={() => styleOptions}
              />
            )
          })
        }).filter(Boolean)
      })}
    </>
  )
}

interface CombinedLayerProps {
  addresses: Address[]
  isochroneData: IsochroneDataMap
  weights: TransportWeights
}

function CombinedLayer({ addresses, isochroneData, weights }: CombinedLayerProps) {
  const combined = useMemo(
    () => computeCombinedIsochrones(addresses, isochroneData, weights),
    [addresses, isochroneData, weights],
  )

  // Render from outermost (60 min, red) to innermost (15 min, green)
  const sortedThresholds = [...TIME_THRESHOLDS].sort((a, b) => b - a) as TimeThreshold[]

  return (
    <>
      {sortedThresholds.map((T) => {
        const feature = combined[T]
        if (!feature) return null

        const color = COMBINED_COLORS[T]
        return (
          <GeoJSON
            key={`combined-${T}`}
            data={feature}
            style={() => ({
              fillColor: color,
              fillOpacity: 0.55,
              color: color,
              weight: 1.5,
              opacity: 0.8,
            })}
          />
        )
      })}
    </>
  )
}

interface Props {
  addresses: Address[]
  isochroneData: IsochroneDataMap
  weights: TransportWeights
  viewMode: ViewMode
  loadingMap: IsochroneLoadingMap
}

export default function MapView({
  addresses,
  isochroneData,
  weights,
  viewMode,
  loadingMap,
}: Props) {
  const isLoading = addresses.some((a) =>
    Object.values(loadingMap[a.id] ?? {}).some(Boolean),
  )

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={HELSINKI_CENTER}
        zoom={11}
        className="h-full w-full"
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          maxZoom={19}
        />

        <MapController addresses={addresses} />

        {/* Isochrone layers */}
        {viewMode === 'individual' && (
          <IndividualLayers
            addresses={addresses}
            isochroneData={isochroneData}
            weights={weights}
            loadingMap={loadingMap}
          />
        )}

        {viewMode === 'combined' && addresses.length >= 2 && (
          <CombinedLayer
            addresses={addresses}
            isochroneData={isochroneData}
            weights={weights}
          />
        )}

        {/* Address markers */}
        {addresses.map((a) => (
          <CircleMarker
            key={a.id}
            center={[a.lat, a.lng]}
            radius={8}
            pathOptions={{
              fillColor: a.color,
              fillOpacity: 1,
              color: '#ffffff',
              weight: 2,
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -10]}>
              {a.label.split(',')[0]}
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm shadow-lg rounded-full px-4 py-2 flex items-center gap-2 z-[1000] text-sm text-gray-600 pointer-events-none">
          <span className="animate-spin">⟳</span>
          Fetching isochrones…
        </div>
      )}

      {/* Combined view legend */}
      {viewMode === 'combined' && addresses.length >= 2 && (
        <div className="absolute bottom-8 right-4 bg-white/95 backdrop-blur-sm shadow-lg rounded-xl p-3 z-[1000] text-xs space-y-1.5">
          <p className="font-semibold text-gray-700 mb-2">Travel time to all locations</p>
          {[
            { t: 15, label: '≤ 15 min', color: COMBINED_COLORS[15] },
            { t: 30, label: '≤ 30 min', color: COMBINED_COLORS[30] },
            { t: 45, label: '≤ 45 min', color: COMBINED_COLORS[45] },
            { t: 60, label: '≤ 60 min', color: COMBINED_COLORS[60] },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-2">
              <div className="w-4 h-3 rounded" style={{ backgroundColor: color, opacity: 0.8 }} />
              <span className="text-gray-600">{label}</span>
            </div>
          ))}
          <p className="text-gray-400 pt-1 border-t border-gray-100">
            Best transport mode used
          </p>
        </div>
      )}

      {/* Individual mode legend */}
      {viewMode === 'individual' && addresses.length > 0 && (
        <div className="absolute bottom-8 right-4 bg-white/95 backdrop-blur-sm shadow-lg rounded-xl p-3 z-[1000] text-xs space-y-1.5">
          <p className="font-semibold text-gray-700 mb-2">Locations</p>
          {addresses.map((a) => (
            <div key={a.id} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: a.color }} />
              <span className="text-gray-600 truncate max-w-32">
                {a.label.split(',')[0]}
              </span>
            </div>
          ))}
          <p className="text-gray-400 pt-1 border-t border-gray-100">
            Darker = closer (15 min)
          </p>
        </div>
      )}

      {/* Empty state */}
      {addresses.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 text-center max-w-xs">
            <div className="text-4xl mb-3">📍</div>
            <h2 className="text-base font-semibold text-gray-800 mb-1">
              Add your locations
            </h2>
            <p className="text-sm text-gray-500">
              Search for work, school, or any address to see where in Helsinki you should live.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
