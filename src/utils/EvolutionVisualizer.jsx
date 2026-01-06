import React, { useState, useEffect } from 'react';
import { Play, RotateCcw, TrendingUp, Dna, Trophy } from 'lucide-react';
import { runEvolution } from './geneticOptimizer';

const EvolutionVisualizer = ({ startSequence, fitnessFn }) => {
  const [history, setHistory] = useState([]);
  const [currentGen, setCurrentGen] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bestCandidate, setBestCandidate] = useState(null);

  // Simulation settings
  const GENERATIONS = 50;
  const POP_SIZE = 100;
  const MUTATION_RATE = 0.05;

  const handleRunSimulation = () => {
    if (!startSequence) return;
    setIsPlaying(true);
    setCurrentGen(0);

    const evoHistory = runEvolution(
      startSequence,
      fitnessFn,
      GENERATIONS,
      POP_SIZE,
      MUTATION_RATE,
    );

    setHistory(evoHistory);
  };

  // Animation Loop
  useEffect(() => {
    let interval;
    if (isPlaying && history.length > 0) {
      interval = setInterval(() => {
        setCurrentGen((prev) => {
          if (prev >= history.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, history]);

  // Update display when generation changes
  useEffect(() => {
    if (history[currentGen]) {
      setBestCandidate(history[currentGen]);
    }
  }, [currentGen, history]);

  if (!startSequence) return null;

  const totalGens = history.length || GENERATIONS;

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-2xl mt-8">
      {/* Header */}
      <div className="bg-slate-950 p-4 border-b border-slate-800 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Dna className="text-pink-500" size={20} />
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
            In-Silico Evolution Engine
          </h3>
        </div>
        <div className="flex gap-2">
          {!history.length || currentGen === history.length - 1 ? (
            <button
              onClick={handleRunSimulation}
              className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold rounded transition-colors"
            >
              {history.length ? <RotateCcw size={14} /> : <Play size={14} />}
              {history.length ? 'RE-EVOLVE' : 'START EVOLUTION'}
            </button>
          ) : (
            <div className="px-4 py-2 bg-slate-800 text-slate-400 text-xs font-bold rounded animate-pulse">
              EVOLVING...
            </div>
          )}
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Stats Panel */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-slate-950 p-4 rounded border border-slate-800">
            <div className="text-xs text-slate-500 uppercase font-bold mb-1">
              Generation
            </div>
            <div className="text-3xl font-mono text-pink-400">
              {currentGen}{' '}
              <span className="text-sm text-slate-600">/ {totalGens}</span>
            </div>
          </div>

          <div className="bg-slate-950 p-4 rounded border border-slate-800">
            <div className="text-xs text-slate-500 uppercase font-bold mb-1">
              Max Fitness Score
            </div>
            <div className="text-3xl font-mono text-emerald-400 flex items-center gap-2">
              {bestCandidate ? bestCandidate.bestScore.toFixed(1) : '0.0'}
              <TrendingUp
                size={16}
                className={isPlaying ? 'animate-bounce' : ''}
              />
            </div>
          </div>

          <div className="bg-slate-950 p-4 rounded border border-slate-800">
            <div className="text-xs text-slate-500 uppercase font-bold mb-1">
              Population Size
            </div>
            <div className="text-xl font-mono text-slate-300">
              {POP_SIZE} Candidates
            </div>
          </div>
        </div>

        {/* Right: Visualization Area */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Bar Chart */}
          <div className="h-32 bg-slate-950 rounded border border-slate-800 relative flex items-end px-2 pb-2 gap-[2px]">
            {history.map((genData, idx) => {
              const score = Math.max(0, Math.min(100, genData.bestScore || 0));
              const height = `${Math.max(5, score)}%`;
              const isCurrent = idx === currentGen;
              return (
                <div
                  key={idx}
                  className={`flex-1 rounded-t-sm transition-all duration-300 ${
                    isCurrent
                      ? 'bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.5)]'
                      : 'bg-slate-800'
                  }`}
                  style={{ height }}
                />
              );
            })}
            {!history.length && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-600">
                WAITING FOR SIMULATION DATA...
              </div>
            )}
          </div>

          {/* Sequence Viewer */}
          <div className="bg-black/40 p-4 rounded border border-slate-800 font-mono text-xs break-all">
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-500 uppercase font-bold text-[10px]">
                Current Best Allele
              </span>
              {bestCandidate && bestCandidate.bestScore > 90 && (
                <span className="flex items-center gap-1 text-amber-400 text-[10px] font-bold">
                  <Trophy size={12} /> ELITE
                </span>
              )}
            </div>
            {bestCandidate ? (
              <span className="text-slate-300 leading-relaxed tracking-wide">
                {bestCandidate.bestSeq.split('').map((char, i) => (
                  <span
                    key={i}
                    className={
                      char === 'A'
                        ? 'text-green-500'
                        : char === 'T'
                        ? 'text-red-500'
                        : char === 'C'
                        ? 'text-blue-500'
                        : 'text-amber-500'
                    }
                  >
                    {char}
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-slate-600 italic">
                No data generated yet.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvolutionVisualizer;
