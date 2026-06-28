import { useState, useRef, useEffect, useCallback } from 'react'
import type {
  Address,
  TransportWeights,
  ViewMode,
  TransportMode,
  IsochroneLoadingMap,
  IsochroneErrorMap,
  GeocodeSuggestion,
} from '../types'
import { TRANSPORT_MODES, TRANSPORT_LABELS, TRANSPORT_ICONS } from '../types'
import { geocodeAddress } from '../utils/api'

interface Props {
  addresses: Address[]
  weights: TransportWeights
  viewMode: ViewMode
  loadingMap: IsochroneLoadingMap
  errorMap: IsochroneErrorMap
  digitransitKey: string
  isAnyLoading: boolean
  onAddAddress: (inputText: string, displayName: string, lat: number, lng: number) => void
  onRemoveAddress: (id: string) => void
  onUpdateLabel: (id: string, label: string) => void
  onRetryAddress: (address: Address) => void
  onSetWeight: (mode: TransportMode, value: number) => void
  onSetViewMode: (mode: ViewMode) => void
  onSaveDigitransitKey: (key: string) => void
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function AddressSearch({
  onAdd,
}: {
  onAdd: (inputText: string, displayName: string, lat: number, lng: number) => void
}) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debouncedQuery = useDebounce(query, 400)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (debouncedQuery.length < 3) {
      setSuggestions([])
      setOpen(false)
      return
    }
    setLoading(true)
    geocodeAddress(debouncedQuery)
      .then((results) => {
        setSuggestions(results)
        setOpen(results.length > 0)
      })
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false))
  }, [debouncedQuery])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = useCallback(
    (s: GeocodeSuggestion) => {
      onAdd(query, s.displayName, s.lat, s.lng)
      setQuery('')
      setSuggestions([])
      setOpen(false)
    },
    [onAdd, query],
  )

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
        <span className="text-gray-400">🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search address in Helsinki..."
          className="flex-1 text-sm text-gray-800 outline-none bg-transparent placeholder-gray-400"
          onFocus={() => suggestions.length > 0 && setOpen(true)}
        />
        {loading && <span className="text-gray-400 text-xs animate-pulse">…</span>}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
          {suggestions.map((s) => (
            <button
              key={s.id}
              className="w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-800 border-b border-gray-100 last:border-0 transition-colors"
              onClick={() => handleSelect(s)}
            >
              <div className="font-medium truncate">{s.displayName.split(',')[0]}</div>
              <div className="text-xs text-gray-400 truncate mt-0.5">
                {s.displayName.split(',').slice(1).join(',').trim()}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AddressItem({
  address,
  loading,
  errors,
  onRemove,
  onUpdateLabel,
  onRetry,
}: {
  address: Address
  loading: Record<TransportMode, boolean | undefined>
  errors: Record<TransportMode, string | undefined>
  onRemove: () => void
  onUpdateLabel: (label: string) => void
  onRetry: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [labelInput, setLabelInput] = useState(address.label)
  const inputRef = useRef<HTMLInputElement>(null)
  const isLoading = Object.values(loading).some(Boolean)
  const hasErrors = Object.values(errors).some(Boolean)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commitLabel = () => {
    if (labelInput.trim()) onUpdateLabel(labelInput.trim())
    else setLabelInput(address.label)
    setEditing(false)
  }

  return (
    <div className="flex items-start gap-2 p-3 bg-white border border-gray-200 rounded-lg group hover:shadow-sm transition-shadow">
      <div
        className="w-3 h-3 rounded-full mt-0.5 flex-shrink-0 shadow-sm"
        style={{ backgroundColor: address.color }}
      />
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitLabel()
              if (e.key === 'Escape') { setLabelInput(address.label); setEditing(false) }
            }}
            className="w-full text-sm font-medium text-gray-800 border-b border-blue-500 outline-none bg-transparent"
          />
        ) : (
          <div
            className="text-sm font-medium text-gray-800 cursor-pointer hover:text-blue-600 truncate"
            onClick={() => setEditing(true)}
            title="Click to rename"
          >
            {address.label}
          </div>
        )}
        <div className="text-xs text-gray-400 truncate mt-0.5">{address.inputText}</div>
        {isLoading && (
          <div className="text-xs text-blue-500 mt-1 flex items-center gap-1">
            <span className="animate-pulse">●</span> Loading…
          </div>
        )}
        {!isLoading && hasErrors && (
          <div className="flex items-center gap-1 mt-1">
            <span className="text-xs text-orange-500">Some modes failed</span>
            <button onClick={onRetry} className="text-xs text-blue-500 underline hover:no-underline">retry</button>
          </div>
        )}
      </div>
      <button
        onClick={onRemove}
        className="text-gray-300 hover:text-red-500 transition-colors text-sm font-bold flex-shrink-0 opacity-0 group-hover:opacity-100"
        title="Remove"
      >
        ×
      </button>
    </div>
  )
}

function TransportSlider({
  mode,
  value,
  onChange,
}: {
  mode: TransportMode
  value: number
  onChange: (v: number) => void
}) {
  const color =
    mode === 'walking' ? '#22c55e'
    : mode === 'cycling' ? '#3b82f6'
    : mode === 'car' ? '#f59e0b'
    : '#a855f7'

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 w-28 flex-shrink-0">
        <span className="text-base">{TRANSPORT_ICONS[mode]}</span>
        <span className="text-sm text-gray-700 font-medium">{TRANSPORT_LABELS[mode]}</span>
      </div>
      <div className="flex-1 flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1"
          style={{ color, background: `linear-gradient(to right, ${color} ${value}%, #e5e7eb ${value}%)` }}
        />
        <span className="text-xs font-semibold w-8 text-right" style={{ color: value > 0 ? color : '#9ca3af' }}>
          {value}%
        </span>
      </div>
    </div>
  )
}

function ApiKeyInput({ value, onSave }: { value: string; onSave: (key: string) => void }) {
  const [draft, setDraft] = useState(value)
  const [saved, setSaved] = useState(false)

  useEffect(() => { setDraft(value) }, [value])

  const handleSave = () => {
    onSave(draft.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs text-gray-500 block">Digitransit HSL API key</label>
      <div className="flex gap-1.5">
        <input
          type="password"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setSaved(false) }}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          className="flex-1 text-xs bg-white border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono"
          placeholder="Paste API key…"
        />
        <button
          onClick={handleSave}
          className={`text-xs px-2.5 py-1.5 rounded-md flex-shrink-0 transition-colors ${
            saved
              ? 'bg-green-500 text-white'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {saved ? '✓' : 'Save'}
        </button>
      </div>
    </div>
  )
}

export default function Sidebar({
  addresses,
  weights,
  viewMode,
  loadingMap,
  errorMap,
  digitransitKey,
  onAddAddress,
  onRemoveAddress,
  onUpdateLabel,
  onRetryAddress,
  onSetWeight,
  onSetViewMode,
  onSaveDigitransitKey,
}: Props) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <>
      <button
        className="md:hidden fixed top-3 left-3 z-50 bg-white shadow-lg rounded-lg p-2 text-gray-600"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? '☰' : '✕'}
      </button>

      <aside
        className={`
          ${collapsed ? '-translate-x-full md:translate-x-0' : 'translate-x-0'}
          transition-transform duration-300
          flex flex-col h-full w-80 bg-gray-50 border-r border-gray-200
          z-40 absolute md:relative
        `}
      >
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-200 bg-white flex-shrink-0">
          <h1 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <span>🗺️</span>
            <span>Helsinki Isochrone Map</span>
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Find your optimal home location</p>
        </div>

        <div className="flex-1 overflow-y-auto sidebar-scroll px-4 py-4 space-y-5">
          {/* Addresses */}
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              📍 Locations
            </h2>
            <AddressSearch onAdd={onAddAddress} />

            {addresses.length > 0 ? (
              <div className="mt-3 space-y-2">
                {addresses.map((a) => (
                  <AddressItem
                    key={a.id}
                    address={a}
                    loading={(loadingMap[a.id] ?? {}) as Record<TransportMode, boolean | undefined>}
                    errors={(errorMap[a.id] ?? {}) as Record<TransportMode, string | undefined>}
                    onRemove={() => onRemoveAddress(a.id)}
                    onUpdateLabel={(label) => onUpdateLabel(a.id, label)}
                    onRetry={() => onRetryAddress(a)}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-3 text-xs text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-lg">
                Add 1–8 locations to get started
              </div>
            )}
          </section>

          {/* Transport */}
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              ⚖️ Transport Priority
            </h2>
            <div className="space-y-3">
              {TRANSPORT_MODES.map((mode) => (
                <TransportSlider
                  key={mode}
                  mode={mode}
                  value={weights[mode]}
                  onChange={(v) => onSetWeight(mode, v)}
                />
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">0 = hide · higher = more weight</p>
          </section>

          {/* View */}
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              👁 View
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => onSetViewMode('individual')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  viewMode === 'individual'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
              >
                Per Location
              </button>
              <button
                onClick={() => onSetViewMode('combined')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  viewMode === 'combined'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
                disabled={addresses.length < 2}
                title={addresses.length < 2 ? 'Add at least 2 locations' : ''}
              >
                Combined
              </button>
            </div>
            {viewMode === 'combined' && (
              <p className="text-xs text-gray-400 mt-2">Green = close to all · Red = far</p>
            )}
          </section>

          {/* Settings */}
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              ⚙️ Settings
            </h2>
            <ApiKeyInput value={digitransitKey} onSave={onSaveDigitransitKey} />
          </section>
        </div>
      </aside>
    </>
  )
}
