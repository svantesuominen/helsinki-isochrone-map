import { useState, useCallback, useEffect, useRef } from 'react'
import type {
  Address,
  TransportWeights,
  IsochroneDataMap,
  IsochroneLoadingMap,
  IsochroneErrorMap,
  ViewMode,
  TransportMode,
} from './types'
import { TRANSPORT_MODES } from './types'
import { getAddressColor } from './utils/colors'
import { fetchValhallaIsochrone, fetchDigitransitIsochrone } from './utils/api'
import Sidebar from './components/Sidebar'
import MapView from './components/MapView'

const DIGITRANSIT_KEY = 'eb6662774de44edb82ceaa643a50d79f'

const DEFAULT_WEIGHTS: TransportWeights = {
  walking: 40,
  cycling: 70,
  car: 0,
  transit: 80,
}

const SEED_ADDRESSES: Address[] = [
  {
    id: 'seed-0',
    label: 'Pakilantie 122',
    inputText: 'pakilantie 122',
    lat: 60.2534,
    lng: 24.9513,
    color: getAddressColor(0),
  },
  {
    id: 'seed-1',
    label: 'Ståhlberginkuja 1',
    inputText: 'Ståhlberginkuja 1',
    lat: 60.1917,
    lng: 25.0340,
    color: getAddressColor(1),
  },
  {
    id: 'seed-2',
    label: 'Tulistimenkatu 2',
    inputText: 'Tulistimenkatu 2',
    lat: 60.2066,
    lng: 24.9329,
    color: getAddressColor(2),
  },
]

function generateId() {
  return Math.random().toString(36).slice(2, 9)
}

export default function App() {
  const [addresses, setAddresses] = useState<Address[]>(SEED_ADDRESSES)
  const [weights, setWeights] = useState<TransportWeights>(DEFAULT_WEIGHTS)
  const [viewMode, setViewMode] = useState<ViewMode>('combined')
  const [isochroneData, setIsochroneData] = useState<IsochroneDataMap>({})
  const [loadingMap, setLoadingMap] = useState<IsochroneLoadingMap>({})
  const [errorMap, setErrorMap] = useState<IsochroneErrorMap>({})

  const fetchIsochronesForAddress = useCallback(
    async (address: Address) => {
      const modes: TransportMode[] = ['walking', 'cycling', 'car', 'transit']

      setLoadingMap((prev) => ({
        ...prev,
        [address.id]: Object.fromEntries(modes.map((m) => [m, true])),
      }))
      setErrorMap((prev) => ({ ...prev, [address.id]: {} }))

      const results: Partial<Record<TransportMode, unknown>> = {}
      const errors: Partial<Record<TransportMode, string>> = {}

      await Promise.all(
        modes.map(async (mode) => {
          try {
            if (mode === 'transit') {
              results[mode] = await fetchDigitransitIsochrone(
                address.lat,
                address.lng,
                DIGITRANSIT_KEY,
              )
            } else {
              results[mode] = await fetchValhallaIsochrone(address.lat, address.lng, mode)
            }
          } catch (err) {
            errors[mode] = err instanceof Error ? err.message : 'Failed to load'
            results[mode] = null
          }

          setLoadingMap((prev) => ({
            ...prev,
            [address.id]: { ...prev[address.id], [mode]: false },
          }))
        }),
      )

      setIsochroneData((prev) => ({
        ...prev,
        [address.id]: results as Record<TransportMode, null>,
      }))

      if (Object.keys(errors).length > 0) {
        setErrorMap((prev) => ({
          ...prev,
          [address.id]: errors as Record<TransportMode, string>,
        }))
      }
    },
    [],
  )

  // Fetch isochrones for seed addresses exactly once on mount
  const seedFetched = useRef(false)
  useEffect(() => {
    if (seedFetched.current) return
    seedFetched.current = true
    SEED_ADDRESSES.forEach((addr) => fetchIsochronesForAddress(addr))
  }, [fetchIsochronesForAddress])

  const addAddress = useCallback(
    (inputText: string, displayName: string, lat: number, lng: number) => {
      const id = generateId()
      const color = getAddressColor(addresses.length)
      const address: Address = { id, label: displayName, inputText, lat, lng, color }
      setAddresses((prev) => [...prev, address])
      fetchIsochronesForAddress(address)
    },
    [addresses.length, fetchIsochronesForAddress],
  )

  const updateAddressLabel = useCallback((id: string, label: string) => {
    setAddresses((prev) => prev.map((a) => (a.id === id ? { ...a, label } : a)))
  }, [])

  const removeAddress = useCallback((id: string) => {
    setAddresses((prev) => prev.filter((a) => a.id !== id))
    setIsochroneData((prev) => { const n = { ...prev }; delete n[id]; return n })
    setLoadingMap((prev) => { const n = { ...prev }; delete n[id]; return n })
    setErrorMap((prev) => { const n = { ...prev }; delete n[id]; return n })
  }, [])

  const retryAddress = useCallback(
    (address: Address) => fetchIsochronesForAddress(address),
    [fetchIsochronesForAddress],
  )

  const setWeight = useCallback((mode: TransportMode, value: number) => {
    setWeights((prev) => ({ ...prev, [mode]: value }))
  }, [])

  const isAnyLoading = addresses.some((a) =>
    TRANSPORT_MODES.some((m) => loadingMap[a.id]?.[m]),
  )

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar
        addresses={addresses}
        weights={weights}
        viewMode={viewMode}
        loadingMap={loadingMap}
        errorMap={errorMap}
        isAnyLoading={isAnyLoading}
        onAddAddress={addAddress}
        onRemoveAddress={removeAddress}
        onUpdateLabel={updateAddressLabel}
        onRetryAddress={retryAddress}
        onSetWeight={setWeight}
        onSetViewMode={setViewMode}
      />
      <div className="flex-1 relative">
        <MapView
          addresses={addresses}
          isochroneData={isochroneData}
          weights={weights}
          viewMode={viewMode}
          loadingMap={loadingMap}
        />
      </div>
    </div>
  )
}
