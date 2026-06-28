import { useState, useCallback, useEffect } from 'react'
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

const DEFAULT_WEIGHTS: TransportWeights = {
  walking: 40,
  cycling: 70,
  car: 50,
  transit: 80,
}

function generateId() {
  return Math.random().toString(36).slice(2, 9)
}

export default function App() {
  const [addresses, setAddresses] = useState<Address[]>([])
  const [weights, setWeights] = useState<TransportWeights>(DEFAULT_WEIGHTS)
  const [viewMode, setViewMode] = useState<ViewMode>('individual')
  const [isochroneData, setIsochroneData] = useState<IsochroneDataMap>({})
  const [loadingMap, setLoadingMap] = useState<IsochroneLoadingMap>({})
  const [errorMap, setErrorMap] = useState<IsochroneErrorMap>({})
  const [digitransitKey, setDigitransitKey] = useState<string>('')

  // Load digitransit key from localStorage; fall back to the bundled key
  useEffect(() => {
    const saved = localStorage.getItem('digitransit_key')
    setDigitransitKey(saved || 'eb6662774de44edb82ceaa643a50d79f')
  }, [])

  const saveDigitransitKey = useCallback((key: string) => {
    setDigitransitKey(key)
    localStorage.setItem('digitransit_key', key)
  }, [])

  const fetchIsochronesForAddress = useCallback(
    async (address: Address) => {
      const modes: TransportMode[] = ['walking', 'cycling', 'car', 'transit']

      // Set loading state for all modes
      setLoadingMap((prev) => ({
        ...prev,
        [address.id]: Object.fromEntries(modes.map((m) => [m, true])),
      }))
      setErrorMap((prev) => ({
        ...prev,
        [address.id]: {},
      }))

      const results: Partial<Record<TransportMode, unknown>> = {}
      const errors: Partial<Record<TransportMode, string>> = {}

      await Promise.all(
        modes.map(async (mode) => {
          try {
            if (mode === 'transit') {
              if (!digitransitKey) {
                errors[mode] = 'No Digitransit API key — add one in Settings'
                results[mode] = null
              } else {
                const data = await fetchDigitransitIsochrone(
                  address.lat,
                  address.lng,
                  digitransitKey,
                )
                results[mode] = data
              }
            } else {
              const data = await fetchValhallaIsochrone(address.lat, address.lng, mode)
              results[mode] = data
            }
          } catch (err) {
            errors[mode] = err instanceof Error ? err.message : 'Failed to load'
            results[mode] = null
          }

          // Clear loading for this mode
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
    [digitransitKey],
  )

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
    setIsochroneData((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setLoadingMap((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setErrorMap((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const retryAddress = useCallback(
    (address: Address) => {
      fetchIsochronesForAddress(address)
    },
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
        digitransitKey={digitransitKey}
        isAnyLoading={isAnyLoading}
        onAddAddress={addAddress}
        onRemoveAddress={removeAddress}
        onUpdateLabel={updateAddressLabel}
        onRetryAddress={retryAddress}
        onSetWeight={setWeight}
        onSetViewMode={setViewMode}
        onSaveDigitransitKey={saveDigitransitKey}
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
