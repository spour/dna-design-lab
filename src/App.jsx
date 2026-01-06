import React, { useState, useEffect, useCallback } from 'react';
import {
  Dna,
  Beaker,
  Download,
  RefreshCw,
  Settings,
  Info,
  Zap,
  Activity,
  ExternalLink,
  Microscope,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  FlaskConical,
  Sparkles,
  TrendingUp,
  ChevronRight,
  FileDiff,
  Database,
  Wifi,
  Search,
  Plus,
  X,
  Loader2,
} from 'lucide-react';

import tfLibrary from './data/celltype_tf_library.json';
import EvolutionVisualizer from './utils/EvolutionVisualizer';
// import { runSimulatedAnnealing } from './utils/simulatedAnnealing';
import AnnealerPanel from './utils/AnnealerPanel.jsx';


const BuildAPromoter = () => {
  // --- STATE ---
  // const [mode, setMode] = useState('generator'); // 'generator' | 'optimizer' | 'evolver'
  const [mode, setMode] = useState('generator'); // generator | optimizer | evolver | annealer
  const [cellType, setCellType] = useState('neuron');
  const [length, setLength] = useState(150);

  // Sequence State
  const [sequence, setSequence] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [optimizedSequence, setOptimizedSequence] = useState('');

  const [features, setFeatures] = useState([]);
  const [stats, setStats] = useState({
    gc: 0,
    strength: 0,
    motifsFound: 0,
    occupancy: 0,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingMotifs, setIsLoadingMotifs] = useState(false);

  const [tataBox, setTataBox] = useState(true);
  const [optimizerEdits, setOptimizerEdits] = useState(5);
  const [editLog, setEditLog] = useState([]);

  // JASPAR Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [activeFactors, setActiveFactors] = useState([]);

  // Store fetched JASPAR models here
  const [motifLibrary, setMotifLibrary] = useState({});

  // const JASPAR_BASE = '/api/jaspar/api/v1';
  const JASPAR_BASE = 'https://jaspar.elixir.no/api/v1';


  // --- BIOLOGICAL CONFIG ---
  const CELL_DATA = {
    neuron: {
      name: 'Neuron (Brain)',
      color: 'text-purple-400',
      bg: 'bg-purple-900/20',
      border: 'border-purple-500/50',
    },
    liver: {
      name: 'Hepatocyte (Liver)',
      color: 'text-amber-400',
      bg: 'bg-amber-900/20',
      border: 'border-amber-500/50',
    },
    muscle: {
      name: 'Myoblast (Muscle)',
      color: 'text-red-400',
      bg: 'bg-red-900/20',
      border: 'border-red-500/50',
    },
    tcell: {
      name: 'T-Cell (Immune)',
      color: 'text-blue-400',
      bg: 'bg-blue-900/20',
      border: 'border-blue-500/50',
    },
    stem: {
      name: 'Embryonic Stem Cell',
      color: 'text-emerald-400',
      bg: 'bg-emerald-900/20',
      border: 'border-emerald-500/50',
    },
    ubiquitous: {
      name: 'Ubiquitous',
      color: 'text-slate-400',
      bg: 'bg-slate-900/20',
      border: 'border-slate-500/50',
    },
  };

  const BASES = ['A', 'C', 'G', 'T'];

  // ---------------- BIO HELPERS ----------------

  const getReverseComplement = (seq) => {
    const complement = { A: 'T', T: 'A', C: 'G', G: 'C', N: 'N' };
    return seq
      .split('')
      .reverse()
      .map((b) => complement[b] || 'N')
      .join('');
  };

  // 1. Process Raw PFM from JASPAR
  const processJasparData = (pfm) => {
    const pwm = [];
    const consensus = [];
    const length = pfm['A'].length;
    const pseudocount = 0.8;

    for (let i = 0; i < length; i++) {
      let colSum = 0;
      BASES.forEach((b) => (colSum += pfm[b][i]));

      const colWeights = {};
      let maxScore = -Infinity;
      let bestBase = 'N';

      BASES.forEach((base) => {
        const count = pfm[base][i];
        const freq = (count + pseudocount) / (colSum + 4 * pseudocount);
        const background = 0.25;
        const weight = Math.log2(freq / background);
        colWeights[base] = weight;

        if (weight > maxScore) {
          maxScore = weight;
          bestBase = base;
        }
      });

      pwm.push(colWeights);
      consensus.push(bestBase);
    }

    return { pwm, consensus: consensus.join(''), length };
  };

  // 2. Fetcher (Single or Batch)
  const fetchJasparMotifs = async (factorsToFetch) => {
    if (!factorsToFetch || factorsToFetch.length === 0) return motifLibrary;

    setIsLoadingMotifs(true);
    const newLibrary = { ...motifLibrary };

    const promises = factorsToFetch.map(async (factor) => {
      if (!factor.jaspar || newLibrary[factor.jaspar]) return;

      try {
        const response = await fetch(`${JASPAR_BASE}/matrix/${factor.jaspar}/?format=json`);
        if (!response.ok) throw new Error('JASPAR API Error');
        const data = await response.json();

        if (data.pfm) {
          const processed = processJasparData(data.pfm);
          newLibrary[factor.jaspar] = {
            id: factor.jaspar,
            name: data.name,
            pwm: processed.pwm,
            consensus: processed.consensus,
            length: processed.length,
          };
        }
      } catch (error) {
        console.warn(`Failed to fetch ${factor.name} from JASPAR`, error);
      }
    });

    await Promise.all(promises);
    setMotifLibrary(newLibrary);
    setIsLoadingMotifs(false);
    return newLibrary;
  };

  // 3. Search JASPAR
  const handleJasparSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery) return;

    setIsSearching(true);
    setSearchResults([]);
    setSearchError(null);

    try {
      const response = await fetch(
        `${JASPAR_BASE}/matrix/?search=${encodeURIComponent(searchQuery)}&format=json`,
      );

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();

      if (data.results && data.results.length > 0) {
        setSearchResults(data.results);
      } else {
        setSearchError('No motifs found.');
      }
    } catch (err) {
      console.error('JASPAR search error:', err);
      setSearchError(
        'Failed to contact JASPAR (network or API error). Check console for details.',
      );
    } finally {
      setIsSearching(false);
    }
  };

  // 4. Add Factor from Search
  const addFactor = async (result) => {
    const newFactor = {
      name: result.name,
      jaspar: result.matrix_id,
      weight: 0.8,
    };

    if (activeFactors.find((f) => f.jaspar === newFactor.jaspar)) return;

    const updatedFactors = [...activeFactors, newFactor];
    setActiveFactors(updatedFactors);

    setSearchResults([]);
    setSearchQuery('');

    await fetchJasparMotifs([newFactor]);

    if (sequence) {
      setTimeout(() => {
        updateStats(sequence);
      }, 200);
    }
  };

  const removeFactor = (jasparId) => {
    const updated = activeFactors.filter((f) => f.jaspar !== jasparId);
    setActiveFactors(updated);
  };

  // Init factors from HPA+JASPAR JSON
  useEffect(() => {
    const cellTypeEntry = tfLibrary.cell_types?.[cellType] || [];

    const factorsFromJson = cellTypeEntry.map((e) => ({
      name: e.gene,
      jaspar: e.jaspar,
      weight: e.weight ?? 0.8,
    }));

    setActiveFactors(factorsFromJson);

    if (factorsFromJson.length > 0) {
      fetchJasparMotifs(factorsFromJson);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellType]);

  // ------------- SCORING ENGINE -------------

  const getLogOddsScore = (seq, pwm) => {
    let score = 0;
    if (seq.length !== pwm.length) return -Infinity;

    for (let i = 0; i < seq.length; i++) {
      const base = seq[i];
      const col = pwm[i];
      if (col && col[base] !== undefined) {
        score += col[base];
      } else {
        score += -2;
      }
    }
    return score;
  };

  const getMaxPossibleScore = (pwm) =>
    pwm.reduce((acc, col) => {
      const maxVal = Math.max(...Object.values(col));
      return acc + maxVal;
    }, 0);

  // --- CORE LOGIC ---

  const scanSequenceForMotifs = useCallback(
    (seq) => {
      if (!seq) return [];
      const found = [];

      activeFactors.forEach((factor) => {
        const model = motifLibrary[factor.jaspar];
        if (!model) return;

        const pwm = model.pwm;
        const maxScore = getMaxPossibleScore(pwm);
        const motifLen = model.length;

        const directions = ['forward', 'reverse'];

        directions.forEach((dir) => {
          const scanSeq = dir === 'reverse' ? getReverseComplement(seq) : seq;

          for (let i = 0; i <= scanSeq.length - motifLen; i++) {
            const subSeq = scanSeq.substring(i, i + motifLen);

            const score = getLogOddsScore(subSeq, pwm);
            const relativeScore = score / maxScore;

            if (relativeScore > 0.8) {
              let start, end;
              if (dir === 'forward') {
                start = i;
                end = i + motifLen;
              } else {
                start = seq.length - (i + motifLen);
                end = seq.length - i;
              }

              const existing = found.find(
                (f) => f.start === start && f.name === factor.name,
              );
              if (!existing) {
                found.push({
                  name: factor.name,
                  start,
                  end,
                  seq: dir === 'forward' ? subSeq : getReverseComplement(subSeq),
                  weight: factor.weight,
                  quality: relativeScore,
                  bitScore: score.toFixed(2),
                  jaspar: factor.jaspar,
                  direction: dir,
                });
              }
            }
          }
        });
      });

      if (tataBox) {
        const tataRegex = /TATA[AT]A[AT]/g;
        let match;
        while ((match = tataRegex.exec(seq)) !== null) {
          found.push({
            name: 'TATA',
            start: match.index,
            end: match.index + match[0].length,
            seq: match[0],
            weight: 2.5,
            quality: 1.0,
            bitScore: '14.2',
            jaspar: 'CORE',
            direction: 'forward',
          });
        }
      }

      return found.sort((a, b) => a.start - b.start);
    },
    [tataBox, motifLibrary, activeFactors],
  );

  const calculateExpression = useCallback((foundFeatures, seq) => {
    if (!seq) return 0;
    let freeEnergy = 0;
    const seqLength = seq.length || 1;

    foundFeatures.forEach((f) => {
      freeEnergy += parseFloat(f.bitScore) * 0.8;
    });

    // Cooperativity
    for (let i = 0; i < foundFeatures.length - 1; i++) {
      const current = foundFeatures[i];
      const next = foundFeatures[i + 1];
      const distance = next.start - current.end;

      if (distance > 0 && distance < 100) {
        const remainder = distance % 10.5;
        if (remainder < 2 || remainder > 8.5) {
          freeEnergy += 4;
        }
        if (distance < 50) {
          freeEnergy += 3;
        }
      }
    }

    const gcCount = (seq.match(/[GC]/g) || []).length;
    const gcPercent = gcCount / seqLength;
    if (gcPercent < 0.3) freeEnergy -= 10;
    if (gcPercent > 0.75) freeEnergy -= 5;

    const sigmoid = (x) => 100 / (1 + Math.exp(-0.06 * (x - 50)));
    return sigmoid(freeEnergy);
  }, []);

  const updateStats = useCallback(
    (seq) => {
      if (!seq) return;
      const found = scanSequenceForMotifs(seq);
      const gcCount = (seq.match(/[GC]/g) || []).length;
      const gcContent = ((gcCount / seq.length) * 100).toFixed(1);
      const rawScore = calculateExpression(found, seq);

      setFeatures(found);
      setStats({
        gc: gcContent,
        strength: rawScore.toFixed(1),
        motifsFound: found.length,
        occupancy: (rawScore / 100).toFixed(2),
      });
    },
    [scanSequenceForMotifs, calculateExpression],
  );

  useEffect(() => {
    if (sequence) {
      updateStats(sequence);
    }
  }, [sequence, motifLibrary, activeFactors, updateStats]);

  // ------------- GENERATOR -------------

  const generatePromoter = async () => {
    let lib = motifLibrary;
    if (Object.keys(lib).length === 0) {
      lib = await fetchJasparMotifs(activeFactors);
    }

    setIsProcessing(true);
    setMode('generator');
    setEditLog([]);

    setTimeout(() => {
      const seqArray = [];
      for (let i = 0; i < length; i++) {
        const rand = Math.random();
        if (rand < 0.25) seqArray.push('G');
        else if (rand < 0.5) seqArray.push('C');
        else if (rand < 0.77) seqArray.push('A');
        else seqArray.push('T');
      }

      const motifsToInject = Math.floor(length / 30) + 1;

      for (let i = 0; i < motifsToInject; i++) {
        if (!activeFactors.length) break;
        const factor =
          activeFactors[Math.floor(Math.random() * activeFactors.length)];
        const model = lib[factor.jaspar];

        if (model) {
          let cleanMotif = model.consensus;

          if (Math.random() < 0.1) {
            const mutPos = Math.floor(Math.random() * cleanMotif.length);
            const chars = cleanMotif.split('');
            chars[mutPos] = BASES[Math.floor(Math.random() * 4)];
            cleanMotif = chars.join('');
          }

          if (Math.random() > 0.5) cleanMotif = getReverseComplement(cleanMotif);

          const pos = Math.floor(Math.random() * (length - cleanMotif.length));
          if (pos >= 0) {
            for (let j = 0; j < cleanMotif.length; j++) {
              seqArray[pos + j] = cleanMotif[j];
            }
          }
        }
      }

      if (tataBox) {
        const tataPos = length - 35 + Math.floor(Math.random() * 6 - 3);
        if (tataPos > 0 && tataPos < length - 8) {
          const tataSeq = 'TATAAAA';
          for (let k = 0; k < tataSeq.length; k++) {
            seqArray[tataPos + k] = tataSeq[k];
          }
        }
      }

      const finalSeq = seqArray.join('');
      setSequence(finalSeq);
      setManualInput('');
      setOptimizedSequence('');

      updateStats(finalSeq);
      setIsProcessing(false);
    }, 400);
  };

  // ------------- OPTIMIZER -------------

  const runOptimizer = async () => {
    if (!manualInput) return;

    let lib = motifLibrary;
    if (Object.keys(lib).length === 0) {
      lib = await fetchJasparMotifs(activeFactors);
    }

    setIsProcessing(true);
    setMode('optimizer');
    setEditLog([]);

    await new Promise((r) => setTimeout(r, 600));

    let currentSeqStr = manualInput;
    let budget = optimizerEdits;
    const newEdits = [];

    while (budget > 0) {
      let bestCandidate = null;
      let bestCandidateScore = -1;

      for (let i = 0; i < currentSeqStr.length; i++) {
        activeFactors.forEach((factor) => {
          const model = lib[factor.jaspar];
          if (!model) return;

          const pwm = model.pwm;
          const consensus = model.consensus;
          const maxScore = getMaxPossibleScore(pwm);
          const motifLen = model.length;

          if (i + motifLen > currentSeqStr.length) return;

          const subSeq = currentSeqStr.substring(i, i + motifLen);
          const currentScore = getLogOddsScore(subSeq, pwm);

          if (currentScore / maxScore > 0.85) return;

          const potentialEdits = [];
          for (let k = 0; k < motifLen; k++) {
            const consensusBase = consensus[k];
            if (consensusBase !== 'N' && subSeq[k] !== consensusBase) {
              potentialEdits.push({
                index: i + k,
                oldChar: subSeq[k],
                newChar: consensusBase,
              });
            }
          }

          if (
            potentialEdits.length > 0 &&
            potentialEdits.length <= budget &&
            potentialEdits.length <= 4
          ) {
            const value =
              (Math.pow(factor.weight, 2) * 10) / potentialEdits.length;
            if (value > bestCandidateScore) {
              bestCandidateScore = value;
              bestCandidate = {
                edits: potentialEdits,
                name: factor.name,
                cost: potentialEdits.length,
              };
            }
          }
        });
      }

      if (bestCandidate) {
        const seqArray = currentSeqStr.split('');
        bestCandidate.edits.forEach((edit) => {
          seqArray[edit.index] = edit.newChar;
          newEdits.push({
            pos: edit.index,
            old: edit.oldChar,
            new: edit.newChar,
            factor: bestCandidate.name,
          });
        });
        currentSeqStr = seqArray.join('');
        budget -= bestCandidate.cost;
      } else {
        break;
      }
    }

    setOptimizedSequence(currentSeqStr);
    setSequence(currentSeqStr);
    setEditLog(newEdits.sort((a, b) => a.pos - b.pos));

    updateStats(currentSeqStr);
    setIsProcessing(false);
  };

  const handleManualEdit = (e) => {
    const val = e.target.value.toUpperCase().replace(/[^ACGT]/g, '');
    setManualInput(val);
    setSequence(val);
    setOptimizedSequence('');
    setEditLog([]);

    if (val && !isLoadingMotifs) {
      updateStats(val);
    }
  };

const fitnessWrapper = (seq) => {
    if (!seq) return 0;
    const feats = scanSequenceForMotifs(seq);
    return calculateExpression(feats, seq);
};

  // --- UI HELPERS ---

  const downloadFasta = () => {
    if (!sequence) return;
    const element = document.createElement('a');
    const file = new Blob(
      [`>synthetic_promoter_${cellType}_${stats.strength}exp\n${sequence}`],
      { type: 'text/plain' },
    );
    element.href = URL.createObjectURL(file);
    element.download = `promoter_${cellType}_${Date.now()}.fasta`;
    document.body.appendChild(element);
    element.click();
  };

  const getBaseColor = (base, index) => {
    const isMutated =
      mode === 'optimizer' &&
      optimizedSequence &&
      manualInput[index] &&
      manualInput[index] !== base;
    if (isMutated)
      return 'text-amber-300 font-bold bg-amber-900/80 animate-pulse rounded px-0.5 border border-amber-500/50';

    switch (base) {
      case 'A':
        return 'text-green-500 group-hover:text-green-400';
      case 'T':
        return 'text-red-500 group-hover:text-red-400';
      case 'C':
        return 'text-blue-500 group-hover:text-blue-400';
      case 'G':
        return 'text-amber-500 group-hover:text-amber-400';
      default:
        return 'text-gray-500';
    }
  };

  // ------------------ RENDER ------------------

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-mono p-4 md:p-8 flex flex-col items-center">
      {/* HEADER */}
      <header className="w-full max-w-6xl mb-8 border-b border-slate-800 pb-6 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-emerald-400 flex items-center gap-3 tracking-tighter">
            <Dna size={32} className="animate-pulse" />
            BuildAPromoter.net
          </h1>
          <p className="text-slate-500 mt-2 text-sm flex items-center gap-2">
            Synthetic Regulatory Element Designer
            <span className="bg-emerald-900/40 text-emerald-500 text-[10px] px-2 py-0.5 rounded border border-emerald-500/30">
              v8.3-EVOLVE
            </span>
          </p>
        </div>
        <div className="text-right hidden sm:block">
          <div className="flex items-center gap-2 text-xs text-emerald-600 mb-1 justify-end">
            <Activity size={14} />
            <span>SYSTEM ONLINE</span>
          </div>
          <div className="text-[10px] text-slate-600 font-bold uppercase tracking-widest flex items-center justify-end gap-2">
            {isLoadingMotifs ? (
              <span className="text-amber-500 flex items-center gap-1 animate-pulse">
                <Wifi size={10} /> FETCHING JASPAR MODELS...
              </span>
            ) : (
              <span className="text-emerald-500 flex items-center gap-1">
                <Database size={10} /> {Object.keys(motifLibrary).length} MODELS
                CACHED
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* CONTROLS */}
        <section className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-800 shadow-xl backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-6 text-emerald-500 uppercase tracking-widest text-xs font-bold border-b border-slate-800 pb-2">
              <Settings size={14} />
              <span>Target Configuration</span>
            </div>

            {/* Cell Type */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                Cell Lineage (Load Preset)
              </label>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(CELL_DATA).map(([key, data]) => (
                  <button
                    key={key}
                    onClick={() => setCellType(key)}
                    className={`text-left px-4 py-3 rounded text-sm font-bold transition-all border flex justify-between ${
                      cellType === key
                        ? `${data.bg} ${data.color} ${data.border}`
                        : 'bg-slate-800 border-transparent text-slate-400 hover:bg-slate-800/80'
                    }`}
                  >
                    <span>{data.name}</span>
                    {cellType === key && <Microscope size={16} />}
                  </button>
                ))}
              </div>
            </div>

            {/* ACTIVE FACTORS & SEARCH */}
            <div className="mb-6 bg-slate-950 p-3 rounded border border-slate-800">
              <label className="text-xs font-bold text-slate-400 uppercase mb-2 flex justify-between">
                <span>Factor Library</span>
                <span className="text-emerald-500">
                  {activeFactors.length} Active
                </span>
              </label>

              <div className="flex flex-wrap gap-2 mb-4">
                {activeFactors.map((f) => (
                  <div
                    key={f.jaspar}
                    className="bg-slate-800 text-[10px] text-slate-300 px-2 py-1 rounded border border-slate-700 flex items-center gap-2 group"
                  >
                    <span>{f.name}</span>
                    <button
                      onClick={() => removeFactor(f.jaspar)}
                      className="text-slate-600 hover:text-red-400"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>

              <form onSubmit={handleJasparSearch} className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search JASPAR (e.g. 'SOX')"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 pl-8 text-xs text-slate-300 focus:border-emerald-500 outline-none"
                />
                {isSearching ? (
                  <Loader2
                    size={12}
                    className="absolute left-2.5 top-2.5 text-emerald-500 animate-spin"
                  />
                ) : (
                  <Search
                    size={12}
                    className="absolute left-2.5 top-2.5 text-slate-500"
                  />
                )}
              </form>

              {searchError && (
                <div className="mt-2 p-2 bg-red-900/20 text-red-400 text-[10px] border border-red-900/50 rounded flex items-center gap-2">
                  <AlertTriangle size={12} />
                  {searchError}
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto border border-slate-700 rounded bg-slate-900 animate-in fade-in slide-in-from-top-1">
                  {searchResults.map((res) => (
                    <div
                      key={res.matrix_id}
                      className="flex justify-between items-center p-2 text-xs border-b border-slate-800 hover:bg-slate-800/50"
                    >
                      <div>
                        <div className="font-bold text-emerald-400">
                          {res.name}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {res.matrix_id}
                        </div>
                      </div>
                      <button
                        onClick={() => addFactor(res)}
                        className="bg-emerald-900/50 hover:bg-emerald-500 hover:text-white text-emerald-500 p-1 rounded transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* MODE SWITCHER TABS */}
            <div className="mb-4 bg-slate-950 p-1 rounded-lg flex border border-slate-800">
              <button
                onClick={() => {
                  setMode('generator');
                  setSequence(optimizedSequence || sequence);
                }}
                className={`flex-1 py-2 text-xs font-bold rounded flex items-center justify-center gap-2 ${
                  mode === 'generator'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <RefreshCw size={12} /> Generator
              </button>
              <button
                onClick={() => {
                  setMode('optimizer');
                  if (!manualInput) setManualInput('');
                }}
                className={`flex-1 py-2 text-xs font-bold rounded flex items-center justify-center gap-2 ${
                  mode === 'optimizer'
                    ? 'bg-amber-900/20 text-amber-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <FlaskConical size={12} /> Optimizer
              </button>
              <button
                onClick={() => {
                  setMode('evolver');
                  if (!sequence)
                    setSequence('ATGCATGCATGCATGCATGCATGCATGCATGC');
                }}
                className={`flex-1 py-2 text-xs font-bold rounded flex items-center justify-center gap-2 ${
                  mode === 'evolver'
                    ? 'bg-pink-900/20 text-pink-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Dna size={12} /> Evolver
              </button>
              <button 
                onClick={() => {
                    setMode('annealer');
                    if (!sequence) setSequence("ATGCAGCGATCGAGCATCGAGCTCTAGCA");
                }}
                className={`flex-1 py-2 text-xs font-bold rounded flex items-center justify-center gap-2 
                    ${mode === 'annealer' ? 'bg-cyan-900/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
                <Zap size={12} /> Annealer
            </button>

            </div>

            {mode === 'generator' && (
              <>
                <div className="mb-6">
                  <div className="flex justify-between mb-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">
                      Length
                    </label>
                    <span className="text-xs font-mono text-emerald-400">
                      {length} bp
                    </span>
                  </div>s
                  <input
                    type="range"
                    min="50"
                    max="250"
                    step="10"
                    value={length}
                    onChange={(e) => setLength(Number(e.target.value))}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>

                <div className="mb-6">
                  <button
                    onClick={() => setTataBox(!tataBox)}
                    className={`w-full flex items-center justify-between p-3 rounded border text-xs font-bold transition-all ${
                      tataBox
                        ? 'bg-indigo-900/20 border-indigo-500 text-indigo-400'
                        : 'bg-slate-800 border-slate-700 text-slate-500'
                    }`}
                  >
                    <span>INCLUDE TATA-BOX</span>
                    <div
                      className={`w-3 h-3 rounded-full ${
                        tataBox ? 'bg-indigo-500' : 'bg-slate-600'
                      }`}
                    ></div>
                  </button>
                </div>

                <button
                  onClick={generatePromoter}
                  disabled={isProcessing || isLoadingMotifs}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-bold py-3 rounded transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
                >
                  <RefreshCw
                    size={18}
                    className={
                      isProcessing || isLoadingMotifs ? 'animate-spin' : ''
                    }
                  />
                  {isLoadingMotifs
                    ? 'LOADING DATA...'
                    : isProcessing
                    ? 'SYNTHESIZING...'
                    : 'GENERATE RANDOM'}
                </button>
              </>
            )}

            {mode === 'optimizer' && (
              <>
                <div className="mb-4">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex justify-between">
                    <span>Manual Input Sequence (ACGT)</span>
                    <span className="text-slate-600">
                      {manualInput.length} bp
                    </span>
                  </label>
                  <textarea
                    value={manualInput}
                    onChange={handleManualEdit}
                    className="w-full h-24 bg-slate-950 border border-slate-700 rounded p-2 text-xs font-mono text-slate-300 focus:border-amber-500 outline-none resize-none"
                    placeholder="Paste DNA sequence here..."
                  />
                </div>

                {optimizedSequence && (
                  <div className="mb-4 animate-in fade-in slide-in-from-top-2">
                    <label className="block text-xs font-bold text-amber-500 uppercase mb-2 flex items-center gap-2">
                      <Sparkles size={12} /> Optimized Result
                    </label>
                    <div className="w-full h-24 bg-amber-950/20 border border-amber-900/50 rounded p-2 text-xs font-mono text-amber-200/80 overflow-y-auto break-all select-all">
                      {optimizedSequence}
                    </div>
                  </div>
                )}

                <div className="mb-6">
                  <div className="flex justify-between mb-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">
                      Mutation Budget
                    </label>
                    <span className="text-xs font-mono text-amber-400">
                      {optimizerEdits} Edits
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    step="1"
                    value={optimizerEdits}
                    onChange={(e) =>
                      setOptimizerEdits(Number(e.target.value))
                    }
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-2">
                    Algorithm searches for sequences with low Hamming distance
                    to known motifs and edits them if within budget.
                  </p>
                </div>

                <button
                  onClick={runOptimizer}
                  disabled={isProcessing || !manualInput || isLoadingMotifs}
                  className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-bold py-3 rounded transition-colors flex items-center justify-center gap-2 shadow-lg shadow-amber-900/20"
                >
                  <FlaskConical
                    size={18}
                    className={
                      isProcessing || isLoadingMotifs ? 'animate-spin' : ''
                    }
                  />
                  {isLoadingMotifs
                    ? 'LOADING MODELS...'
                    : isProcessing
                    ? 'EVOLVING...'
                    : 'OPTIMIZE SEQUENCE'}
                </button>
              </>
            )}

            {mode === 'evolver' && (
              <div className="p-4 bg-pink-900/10 border border-pink-500/20 rounded text-xs text-pink-200/60 leading-relaxed mb-6">
                <Info
                  size={14}
                  className="inline mr-2 mb-1 text-pink-500"
                />
                <strong>In-Silico Evolution:</strong> This engine uses a genetic
                algorithm to breed a population of DNA sequences. It simulates
                natural selection by scoring candidates against your target cell
                type ({cellType}) and mutating the best performers over
                multiple generations.
              </div>
            )}
          </div>

          {editLog.length > 0 && mode === 'optimizer' && (
            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800 shadow-xl max-h-60 overflow-y-auto">
              <div className="flex items-center gap-2 mb-3 text-amber-500 uppercase tracking-widest text-xs font-bold border-b border-slate-800 pb-2">
                <FileDiff size={14} />
                <span>Mutation Log</span>
              </div>
              <div className="space-y-2">
                {editLog.map((edit, idx) => (
                  <div
                    key={idx}
                    className="text-xs font-mono flex items-center gap-2 text-slate-400 bg-slate-950/50 p-1.5 rounded border border-slate-800"
                  >
                    <span className="text-slate-500 w-12">
                      Pos {edit.pos}:
                    </span>
                    <span className="text-red-400 line-through">
                      {edit.old}
                    </span>
                    <ChevronRight size={10} className="text-slate-600" />
                    <span className="text-amber-400 font-bold">
                      {edit.new}
                    </span>
                    <span className="ml-auto text-[10px] text-amber-600 bg-amber-950/30 px-1.5 rounded border border-amber-900/50">
                      {edit.factor}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* VISUALIZER */}
        <section className="lg:col-span-8 flex flex-col gap-6">
          {mode === 'evolver' ? (
                <EvolutionVisualizer 
                    startSequence={sequence || manualInput || "ATGCATGC"}
                    fitnessFn={(seq) => calculateExpression(scanSequenceForMotifs(seq), seq)}
                />
            ) : mode === 'annealer' ? (
                <AnnealerPanel
                startSequence={sequence || manualInput || 'ATGCATGC'}
                fitnessFn={(seq) =>
                  calculateExpression(scanSequenceForMotifs(seq), seq)
                }
                onFinish={(bestSeq) => {
                  setSequence(bestSeq);
                  updateStats(bestSeq);
                }}
                />


            ) : (

            <>
              {/* Stats Bar */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-900 p-4 rounded border border-slate-800 flex flex-col items-center justify-center">
                  <div className="text-xl md:text-2xl font-bold text-slate-200">
                    {stats.gc}%
                  </div>
                  <div className="text-[9px] md:text-[10px] text-slate-500 uppercase font-bold">
                    GC Content
                  </div>
                </div>
                <div className="bg-slate-900 p-4 rounded border border-slate-800 flex flex-col items-center justify-center">
                  <div className="flex items-center gap-2">
                    <div className="text-xl md:text-2xl font-bold text-slate-200">
                      {stats.occupancy}
                    </div>
                  </div>
                  <div className="text-[9px] md:text-[10px] text-slate-500 uppercase font-bold">
                    P(Occupancy)
                  </div>
                </div>
                <div className="bg-slate-900 p-4 rounded border border-slate-800 flex flex-col items-center justify-center">
                  <div className="text-xl md:text-2xl font-bold text-slate-200">
                    {stats.motifsFound}
                  </div>
                  <div className="text-[9px] md:text-[10px] text-slate-500 uppercase font-bold">
                    Binding Events
                  </div>
                </div>
                <div className="bg-slate-900 p-4 rounded border border-slate-800 flex flex-col items-center justify-center relative overflow-hidden group">
                  <div
                    className={`absolute inset-0 opacity-20 transition-opacity duration-700 ${
                      CELL_DATA[cellType].bg
                    } ${
                      Number(stats.strength) > 80
                        ? 'opacity-40 animate-pulse'
                        : ''
                    }`}
                  ></div>
                  <div
                    className={`text-xl md:text-2xl font-bold ${
                      CELL_DATA[cellType].color
                    } flex items-center gap-2`}
                  >
                    <Zap size={20} fill="currentColor" />
                    {stats.strength}
                  </div>
                  <div className="text-[9px] md:text-[10px] text-slate-500 uppercase font-bold relative z-10 flex items-center gap-1">
                    Expression Score
                  </div>
                </div>
              </div>

              {/* Sequence Display */}
              <div className="bg-black/40 rounded-lg border border-slate-800 shadow-2xl relative min-h-[400px] flex flex-col">
                <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900/50 rounded-t-lg">
                  <div className="flex items-center gap-4">
                    <div className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                      <Beaker size={14} /> Sequence Map
                    </div>
                    {mode === 'optimizer' && optimizedSequence && (
                      <div className="text-[10px] text-amber-400 bg-amber-900/30 px-2 py-1 rounded border border-amber-600/30 flex items-center gap-1 animate-pulse">
                        <TrendingUp size={12} />
                        OPTIMIZED VIEW
                      </div>
                    )}
                  </div>
                  <button
                    onClick={downloadFasta}
                    className="text-xs flex items-center gap-1 text-emerald-500 hover:text-emerald-400"
                  >
                    <Download size={12} /> FASTA
                  </button>
                </div>

                <div className="p-6 font-mono text-sm break-all leading-loose relative flex-grow overflow-hidden select-none">
                  {isProcessing ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 z-20">
                      <div className="flex flex-col items-center gap-4">
                        <div
                          className={`w-16 h-16 border-4 border-t-transparent rounded-full animate-spin ${
                            mode === 'optimizer'
                              ? 'border-amber-500'
                              : 'border-emerald-500'
                          }`}
                        ></div>
                        <div
                          className={`text-xs font-bold animate-pulse ${
                            mode === 'optimizer'
                              ? 'text-amber-500'
                              : 'text-emerald-500'
                          }`}
                        >
                          {mode === 'optimizer'
                            ? 'COST-BENEFIT ANALYSIS...'
                            : 'ASSEMBLING NUCLEOTIDES...'}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="relative z-10">
                      {sequence.split('').map((char, idx) => {
                        const activeFeature = features.find(
                          (f) => idx >= f.start && idx < f.end,
                        );
                        const isStart =
                          activeFeature && idx === activeFeature.start;

                        return (
                          <span
                            key={idx}
                            className="relative inline-block mx-[1px] group cursor-pointer"
                          >
                            {isStart && (
                              <div className="absolute -top-8 left-0 z-20 flex flex-col items-start pointer-events-none transform -translate-x-2">
                                <span
                                  className={`text-[9px] font-bold px-1 rounded whitespace-nowrap ${
                                    activeFeature.name === 'TATA'
                                      ? 'text-indigo-200 bg-indigo-900'
                                      : `${CELL_DATA[cellType].color} bg-slate-900`
                                  } border border-slate-700 shadow-lg mb-0.5`}
                                >
                                  {activeFeature.name}
                                </span>
                                <span className="text-[8px] bg-black/80 px-1 rounded text-slate-400 flex items-center gap-1">
                                  {activeFeature.direction === 'forward' ? (
                                    <ArrowRight size={8} />
                                  ) : (
                                    <ArrowLeft size={8} />
                                  )}
                                  {activeFeature.bitScore} bits
                                </span>
                              </div>
                            )}

                            <span
                              className={`
                                ${getBaseColor(char, idx)} 
                                ${
                                  activeFeature
                                    ? `font-bold ${
                                        activeFeature.name === 'TATA'
                                          ? 'bg-indigo-500/20'
                                          : 'bg-white/10'
                                      } rounded-sm`
                                    : 'opacity-60'
                                }
                                hover:bg-white/20 hover:scale-110 hover:opacity-100 transition-all inline-block
                              `}
                            >
                              {char}
                            </span>

                            {activeFeature && (
                              <span
                                className={`absolute -bottom-1 left-0 right-0 h-[2px] ${
                                  activeFeature.name === 'TATA'
                                    ? 'bg-indigo-500'
                                    : CELL_DATA[cellType].bg.replace('/20', '')
                                } opacity-100 pointer-events-none`}
                              ></span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="bg-slate-950 p-2 border-t border-slate-800 text-[10px] text-slate-600 font-mono flex justify-between">
                  <span>Ln 1, Col {sequence.length}</span>
                  <span className="hidden sm:inline">
                    ALGO: PWM Log-Odds / Greedy Search
                  </span>
                  <span>{cellType.toUpperCase()}::ENHANCER</span>
                </div>
              </div>
            </>
          )}

          {/* Legend / JASPAR Links */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-900/50 border border-slate-800 rounded">
              <div className="text-[10px] text-slate-500 uppercase font-bold mb-3 flex items-center gap-2">
                Factors <span className="text-slate-600">(JASPAR ID)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {activeFactors.map((f) => (
                  <a
                    key={f.jaspar}
                    href={`https://jaspar.elixir.no/matrix/${f.jaspar}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs flex items-center gap-2 bg-slate-950 border border-slate-800 hover:border-emerald-500 px-2 py-1.5 rounded transition-all group"
                  >
                    <span className="text-slate-300 font-bold group-hover:text-emerald-400">
                      {f.name}
                    </span>
                    <ExternalLink
                      size={10}
                      className="text-slate-600 group-hover:text-emerald-600"
                    />
                  </a>
                ))}
              </div>
            </div>

            <div className="p-4 bg-emerald-900/10 border border-emerald-500/20 rounded text-xs text-emerald-200/60 leading-relaxed">
              <Info
                size={14}
                className="inline mr-2 mb-1 text-emerald-500"
              />
              <strong>PWM Engine:</strong> Motifs are scored using Position
              Weight Matrices derived from JASPAR PFMs, computing log-odds
              “bit scores” for each binding site. This lets you see both strong
              and weak-but-functional sites in context.
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};


export default BuildAPromoter;
