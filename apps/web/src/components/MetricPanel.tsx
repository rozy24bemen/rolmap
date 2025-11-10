import React, { useMemo, useState } from 'react'
import { useReactiveQuery } from '../hooks/useReactiveQuery'
import { queries } from '../sdk'
import Sparkline from './Sparkline'

interface MetricPanelProps {
  stateId?: string | null
}

const MetricPanel: React.FC<MetricPanelProps> = ({ stateId }) => {
  const [fromTick, setFromTick] = useState<number | undefined>(undefined)
  const [toTick, setToTick] = useState<number | undefined>(undefined)
  const treasury = useReactiveQuery(async () => {
    if (!stateId) return [] as any[]
    return await queries.getTickMetrics({ stateId, metricKey: 'treasury_change', fromTick, toTick, limit: 20 })
  }, [stateId, fromTick, toTick])

  const drift = useReactiveQuery(async () => {
    if (!stateId) return [] as any[]
    return await queries.getTickMetrics({ stateId, metricKey: 'attitude_drift_abs', fromTick, toTick, limit: 20 })
  }, [stateId, fromTick, toTick])

  const stability = useReactiveQuery(async () => {
    if (!stateId) return [] as any[]
    return await queries.getTickMetrics({ stateId, metricKey: 'stability_change', fromTick, toTick, limit: 20 })
  }, [stateId, fromTick, toTick])

  const aiTreasury = useReactiveQuery(async () => {
    if (!stateId) return [] as any[]
    return await queries.getTickMetrics({ stateId, metricKey: 'ai_decision_treasury_delta', fromTick, toTick, limit: 20 })
  }, [stateId, fromTick, toTick])
  const aiTreasuryVals = useMemo(() => (aiTreasury.data ?? []).slice().reverse().map((m: any) => m.value), [aiTreasury.data])

  const aiMilitary = useReactiveQuery(async () => {
    if (!stateId) return [] as any[]
    return await queries.getTickMetrics({ stateId, metricKey: 'ai_decision_military_delta', fromTick, toTick, limit: 20 })
  }, [stateId, fromTick, toTick])
  const aiMilitaryVals = useMemo(() => (aiMilitary.data ?? []).slice().reverse().map((m: any) => m.value), [aiMilitary.data])

  const eqGap = useReactiveQuery(async () => {
    if (!stateId) return [] as any[]
    return await queries.getTickMetrics({ stateId, metricKey: 'political_equilibrium_gap', fromTick, toTick, limit: 20 })
  }, [stateId, fromTick, toTick])
  const eqGapVals = useMemo(() => (eqGap.data ?? []).slice().reverse().map((m: any) => m.value), [eqGap.data])

  // War metrics
  const warCasualties = useReactiveQuery(async () => {
    if (!stateId) return [] as any[]
    return await queries.getTickMetrics({ stateId, metricKey: 'war_casualties', fromTick, toTick, limit: 20 })
  }, [stateId, fromTick, toTick])
  const warCasualtyVals = useMemo(() => (warCasualties.data ?? []).slice().reverse().map((m: any) => m.value), [warCasualties.data])

  const warCost = useReactiveQuery(async () => {
    if (!stateId) return [] as any[]
    return await queries.getTickMetrics({ stateId, metricKey: 'war_treasury_cost', fromTick, toTick, limit: 20 })
  }, [stateId, fromTick, toTick])
  const warCostVals = useMemo(() => (warCost.data ?? []).slice().reverse().map((m: any) => m.value), [warCost.data])

  const treasuryVals = useMemo(() => (treasury.data ?? []).slice().reverse().map((m: any) => m.value), [treasury.data])
  const driftVals = useMemo(() => (drift.data ?? []).slice().reverse().map((m: any) => m.value), [drift.data])
  const tickInfo = useReactiveQuery(async () => await queries.getTickInfo(), [])

  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <h2 className="font-semibold mb-2">Métricas</h2>
      <div className="flex gap-2 items-center text-xs text-gray-300 mb-2 flex-wrap">
        <label className="flex items-center gap-1">Desde
          <input className="w-20 bg-gray-700 border border-gray-600 rounded px-2 py-1" type="number" value={fromTick ?? ''} onChange={(e) => setFromTick(e.target.value === '' ? undefined : Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-1">Hasta
          <input className="w-20 bg-gray-700 border border-gray-600 rounded px-2 py-1" type="number" value={toTick ?? ''} onChange={(e) => setToTick(e.target.value === '' ? undefined : Number(e.target.value))} />
        </label>
        <button className="px-2 py-1 bg-gray-700 rounded" onClick={() => { setFromTick(undefined); setToTick(undefined) }}>Limpiar</button>
        <div className="ml-auto flex gap-1">
          <button className="px-2 py-1 bg-gray-700 rounded" onClick={() => {
            const t = (tickInfo.data as any)?.tick
            if (typeof t === 'number') { setFromTick(Math.max(0, t - 9)); setToTick(t) }
          }}>Últimos 10</button>
          <button className="px-2 py-1 bg-gray-700 rounded" onClick={() => {
            const t = (tickInfo.data as any)?.tick
            if (typeof t === 'number') { setFromTick(Math.max(0, t - 19)); setToTick(t) }
          }}>Últimos 20</button>
          <button className="px-2 py-1 bg-gray-700 rounded" onClick={() => { setFromTick(undefined); setToTick(undefined) }}>Todo</button>
        </div>
      </div>
      {!stateId && <div className="text-sm text-gray-400">Selecciona un Estado para ver métricas.</div>}
      {stateId && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <h3 className="text-sm font-semibold mb-1 flex items-center justify-between">Tesorería (Δ)
              <span className="inline-block align-middle"><Sparkline values={treasuryVals} width={120} height={28} stroke="#34d399" zeroBaseline /></span>
            </h3>
            <div className="bg-gray-900/60 rounded p-2 text-xs max-h-40 overflow-auto">
              {treasury.loading && <div className="text-gray-500">Cargando…</div>}
              {treasury.error && <div className="text-red-400">{treasury.error}</div>}
              {!treasury.loading && !treasury.error && (
                <ul className="space-y-1">
                  {(treasury.data ?? []).map((m: any) => (
                    <li key={m.id} className={m.value >= 0 ? 'text-green-300' : 'text-red-300'}>
                      Tick {m.tick}: {m.value.toFixed(2)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="md:col-span-2">
            <h3 className="text-sm font-semibold mb-1 flex items-center justify-between">Política: Gap hacia equilibrio
              <span className="inline-block align-middle"><Sparkline values={eqGapVals} width={120} height={28} stroke="#22d3ee" /></span>
            </h3>
            <div className="bg-gray-900/60 rounded p-2 text-xs max-h-40 overflow-auto">
              {eqGap.loading && <div className="text-gray-500">Cargando…</div>}
              {eqGap.error && <div className="text-red-400">{eqGap.error}</div>}
              {!eqGap.loading && !eqGap.error && (
                <ul className="space-y-1">
                  {(eqGap.data ?? []).map((m: any) => (
                    <li key={m.id} className="text-gray-300">
                      Tick {m.tick}: {m.value.toFixed(2)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-1 flex items-center justify-between">Actitud (|Δ|)
              <span className="inline-block align-middle"><Sparkline values={driftVals} width={120} height={28} stroke="#60a5fa" /></span>
            </h3>
            <div className="bg-gray-900/60 rounded p-2 text-xs max-h-40 overflow-auto">
              {drift.loading && <div className="text-gray-500">Cargando…</div>}
              {drift.error && <div className="text-red-400">{drift.error}</div>}
              {!drift.loading && !drift.error && (
                <ul className="space-y-1">
                  {(drift.data ?? []).map((m: any) => (
                    <li key={m.id} className="text-gray-300">
                      Tick {m.tick}: {m.value.toFixed(0)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="md:col-span-2">
            <h3 className="text-sm font-semibold mb-1">Estabilidad (Δ)</h3>
            <div className="bg-gray-900/60 rounded p-2 text-xs max-h-40 overflow-auto">
              {stability.loading && <div className="text-gray-500">Cargando…</div>}
              {stability.error && <div className="text-red-400">{stability.error}</div>}
              {!stability.loading && !stability.error && (
                <ul className="space-y-1">
                  {(stability.data ?? []).map((m: any) => (
                    <li key={m.id} className={m.value >= 0 ? 'text-green-300' : 'text-red-300'}>
                      Tick {m.tick}: {m.value.toFixed(2)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="md:col-span-2">
            <h3 className="text-sm font-semibold mb-1 flex items-center justify-between">IA: Tesorería (Δ)
              <span className="inline-block align-middle"><Sparkline values={aiTreasuryVals} width={120} height={28} stroke="#f59e0b" zeroBaseline /></span>
            </h3>
            <div className="bg-gray-900/60 rounded p-2 text-xs max-h-40 overflow-auto">
              {aiTreasury.loading && <div className="text-gray-500">Cargando…</div>}
              {aiTreasury.error && <div className="text-red-400">{aiTreasury.error}</div>}
              {!aiTreasury.loading && !aiTreasury.error && (
                <ul className="space-y-1">
                  {(aiTreasury.data ?? []).map((m: any) => (
                    <li key={m.id} className={m.value >= 0 ? 'text-green-300' : 'text-red-300'}>
                      Tick {m.tick}: {m.value.toFixed(2)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="md:col-span-2">
            <h3 className="text-sm font-semibold mb-1 flex items-center justify-between">IA: Fuerza Militar (Δ)
              <span className="inline-block align-middle"><Sparkline values={aiMilitaryVals} width={120} height={28} stroke="#a78bfa" /></span>
            </h3>
            <div className="bg-gray-900/60 rounded p-2 text-xs max-h-40 overflow-auto">
              {aiMilitary.loading && <div className="text-gray-500">Cargando…</div>}
              {aiMilitary.error && <div className="text-red-400">{aiMilitary.error}</div>}
              {!aiMilitary.loading && !aiMilitary.error && (
                <ul className="space-y-1">
                  {(aiMilitary.data ?? []).map((m: any) => (
                    <li key={m.id} className={m.value >= 0 ? 'text-green-300' : 'text-red-300'}>
                      Tick {m.tick}: {m.value.toFixed(2)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-1 flex items-center justify-between">Guerra: Bajas
              <span className="inline-block align-middle"><Sparkline values={warCasualtyVals} width={120} height={28} stroke="#ef4444" /></span>
            </h3>
            <div className="bg-gray-900/60 rounded p-2 text-xs max-h-40 overflow-auto">
              {warCasualties.loading && <div className="text-gray-500">Cargando…</div>}
              {warCasualties.error && <div className="text-red-400">{warCasualties.error}</div>}
              {!warCasualties.loading && !warCasualties.error && (
                <ul className="space-y-1">
                  {(warCasualties.data ?? []).map((m: any) => (
                    <li key={m.id} className="text-red-300">
                      Tick {m.tick}: {m.value.toFixed(0)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-1 flex items-center justify-between">Gasto de Guerra ($)
              <span className="inline-block align-middle"><Sparkline values={warCostVals} width={120} height={28} stroke="#f97316" /></span>
            </h3>
            <div className="bg-gray-900/60 rounded p-2 text-xs max-h-40 overflow-auto">
              {warCost.loading && <div className="text-gray-500">Cargando…</div>}
              {warCost.error && <div className="text-red-400">{warCost.error}</div>}
              {!warCost.loading && !warCost.error && (
                <ul className="space-y-1">
                  {(warCost.data ?? []).map((m: any) => (
                    <li key={m.id} className="text-orange-300">
                      Tick {m.tick}: {m.value.toFixed(0)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MetricPanel
