// utils/AnnealerPanel.jsx
import React, { useState } from 'react';
import { runSimulatedAnnealing } from './simulatedAnnealing';
import { Flame, TrendingUp } from 'lucide-react';

const AnnealerPanel = ({ startSequence, fitnessFn, onFinish }) => {
  const [history, setHistory] = useState([]);
  const [bestSeq, setBestSeq] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const runAnnealing = () => {
    if (!startSequence || !startSequence.length) {
      setError('No starting sequence available.');
      return;
    }

    // Clear previous state and show "Cooling..."
    setRunning(true);
    setError(null);
    setHistory([]);
    setBestSeq('');

    // Yield to the browser so React can paint the "Cooling..." state,
    // then run the heavy loop in the next tick.
    setTimeout(() => {
      try {
        console.log('[Annealer] Starting annealing from:', startSequence);

        const result = runSimulatedAnnealing(startSequence, fitnessFn, {
          iterations: 2000,
          startTemp: 8.0,
          endTemp: 0.05,
          mutationRate: 0.03,
          maxMutPerStep: 3,
        });

        console.log('[Annealer] Done. Best score:', result.bestScore);

        setHistory(result.history || []);
        setBestSeq(result.bestSeq || startSequence);

        if (onFinish && result.bestSeq) {
          onFinish(result.bestSeq);
        }
      } catch (e) {
        console.error('Annealing error:', e);
        setError(e.message || 'Annealing failed.');
      } finally {
        setRunning(false);
      }
    }, 0);
  };

  const bestScore =
    bestSeq && typeof fitnessFn === 'function'
      ? fitnessFn(bestSeq).toFixed(1)
      : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 shadow-xl">
      <h2 className="text-sm font-bold text-cyan-400 flex items-center gap-2 mb-4">
        <Flame size={16} /> Simulated Annealing
      </h2>

      <button
        onClick={runAnnealing}
        disabled={running}
        className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-black font-bold px-4 py-2 rounded mb-4"
      >
        {running ? 'Cooling...' : 'Run Annealing'}
      </button>

      {error && (
        <div className="mb-3 text-xs text-red-400 bg-red-900/20 border border-red-900/50 rounded p-2">
          {error}
        </div>
      )}

      {history.length > 0 && (
        <div className="text-xs text-slate-400 mb-3">
          <p>Steps: {history.length}</p>
          {bestScore !== null && (
            <p className="flex items-center gap-1">
              Best Score:{' '}
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <TrendingUp size={12} /> {bestScore}
              </span>
            </p>
          )}
        </div>
      )}

      {bestSeq && (
        <pre className="mt-2 text-xs bg-black/40 p-3 rounded border border-slate-700 overflow-auto text-slate-200 max-h-48">
          {bestSeq}
        </pre>
      )}
    </div>
  );
};

export default AnnealerPanel;
