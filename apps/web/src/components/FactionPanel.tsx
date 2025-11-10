import React, { useMemo, useState } from 'react'
import type { FactionSummary, ObjectiveNode, Alert } from '../../../../packages/schema/ts/types'
import { useReactiveQuery } from '../hooks/useReactiveQuery'
import { queries } from '../sdk'

const AlertIcon: React.FC<{ severity: 'low'|'med'|'high' }> = ({ severity }) => {
  const color = severity === 'high' ? 'bg-red-500' : severity === 'med' ? 'bg-yellow-500' : 'bg-blue-500'
  return <span className={`w-3 h-3 rounded-full ${color} mr-2 inline-block`} />
}

const ObjectiveTree: React.FC<{ nodes: ObjectiveNode[] }> = ({ nodes }) => (
  <ul className="list-disc ml-5 text-sm">
    {nodes.map((node) => (
      <li key={node.id} className={node.status === 'done' ? 'text-green-500 line-through' : ''}>
        {node.title} ({node.status})
        {node.children && node.children.length > 0 && <ObjectiveTree nodes={node.children} />}
      </li>
    ))}
  </ul>
)

export interface FactionPanelProps {
  faction: FactionSummary
  onSuggestStrategy: (id: string, text: string) => void
  onToggleLLM: (id: string, enabled: boolean) => void
}

const FactionPanel: React.FC<FactionPanelProps> = ({ faction, onSuggestStrategy, onToggleLLM }) => {
  const [strategyText, setStrategyText] = useState('')
  const [isExpanded, setIsExpanded] = useState(true)

  const { id, name, treasury, stability, militaryStrength, llmStatus, alerts = [], objectives } = faction
  const activeConflicts = useReactiveQuery(async () => {
    return await queries.getConflicts({ stateId: id, status: 'ACTIVE', limit: 10 })
  }, [id])
  const activeWarText = useMemo(() => {
    const list = (activeConflicts.data ?? []) as any[]
    if (list.length === 0) return null
    const first = list[0]
    const opponent = first.aggressorStateId === id ? first.defenderStateId : first.aggressorStateId
    return `En Guerra con ${opponent} (desde Tick ${first.startTick})`
  }, [activeConflicts.data, id])
  const stabilityColor = stability > 70 ? 'text-green-500' : stability < 40 ? 'text-red-500' : 'text-yellow-500'

  return (
    <div className="bg-gray-800 p-4 rounded-lg shadow-xl text-gray-100">
      <h3
        className="text-xl font-bold border-b border-gray-700 pb-2 mb-3 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {name} ({id}) {alerts.length > 0 && <span className="text-red-400 text-sm ml-2">({alerts.length} Alertas)</span>}
      </h3>

      {isExpanded && (
        <>
          <div className="grid grid-cols-3 gap-4 text-sm mb-4">
            <div><span className="font-semibold">Tesoro:</span> ${treasury.toLocaleString()}</div>
            <div><span className="font-semibold">Estabilidad:</span> <span className={stabilityColor}>{stability.toFixed(1)}%</span></div>
            <div><span className="font-semibold">Fuerza Militar:</span> {militaryStrength.toLocaleString()}</div>
          </div>

          {activeWarText && (
            <div className="bg-yellow-900/40 border border-yellow-700 rounded p-2 mb-3 text-sm text-yellow-200">
              {activeWarText}
            </div>
          )}

          {alerts.length > 0 && (
            <div className="bg-red-900/50 p-2 rounded mb-4">
              <h4 className="font-semibold mb-1 text-red-300">Alertas Activas:</h4>
              {alerts.map((alert, i) => (
                <div key={i} className="flex items-center text-xs">
                  <AlertIcon severity={alert.severity} /> {alert.message}
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-gray-700 pt-3 mb-4">
            <h4 className="font-semibold mb-2">Control de Autonomía (LLM)</h4>
            <div className="flex justify-between items-center text-sm mb-2">
              <span>LLM Activo:</span>
              <button
                onClick={() => onToggleLLM(id, !llmStatus.enabled)}
                className={`px-3 py-1 rounded text-xs transition ${llmStatus.enabled ? 'bg-green-600' : 'bg-red-600'}`}
              >
                {llmStatus.enabled ? `ON (Quota: ${llmStatus.remainingQuota})` : 'OFF'}
              </button>
            </div>

            <div className="mt-3">
              <textarea
                className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-sm resize-none"
                placeholder="Sugerir estrategia narrativa (ej. 'Diplomacia con el Oeste...')"
                value={strategyText}
                onChange={(e) => setStrategyText(e.target.value)}
                rows={3}
              />
              <button
                onClick={() => onSuggestStrategy(id, strategyText)}
                disabled={!strategyText.trim()}
                className="mt-2 w-full py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm disabled:opacity-50 transition"
              >
                Sugerir (Costo Narrativo)
              </button>
            </div>
          </div>

          <div className="border-t border-gray-700 pt-3">
            <h4 className="font-semibold mb-2">Objetivos (IA)</h4>
            <ObjectiveTree nodes={objectives} />
          </div>
        </>
      )}
    </div>
  )
}

export default FactionPanel
