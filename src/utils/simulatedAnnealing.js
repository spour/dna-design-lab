// utils/simulatedAnnealing.js

const BASES = ['A', 'C', 'G', 'T'];

export function runSimulatedAnnealing(
  startSeq,
  fitnessFn,
  {
    iterations = 3000,
    startTemp = 10.0,
    endTemp = 0.1,
    mutationRate = 0.05,
    maxMutPerStep = 3,
  } = {},
) {
  if (!startSeq || !startSeq.length) {
    throw new Error('startSeq must be a non-empty DNA string');
  }
  if (typeof fitnessFn !== 'function') {
    throw new Error('fitnessFn must be a function');
  }

  const tempAt = (step) => {
    const frac = step / Math.max(1, iterations - 1);
    return startTemp * Math.pow(endTemp / startTemp, frac);
  };

  const proposeNeighbour = (seq) => {
    const chars = seq.split('');
    const L = chars.length;

    const nMut = Math.max(
      1,
      Math.min(maxMutPerStep, Math.round(L * mutationRate) || 1),
    );

    const used = new Set();
    for (let k = 0; k < nMut; k++) {
      let idx;
      do {
        idx = Math.floor(Math.random() * L);
      } while (used.has(idx));
      used.add(idx);

      const current = chars[idx];
      const alternatives = BASES.filter((b) => b !== current);
      chars[idx] = alternatives[Math.floor(Math.random() * alternatives.length)];
    }

    return chars.join('');
  };

  let currentSeq = startSeq;
  let currentScore = fitnessFn(currentSeq);

  let bestSeq = currentSeq;
  let bestScore = currentScore;

  const history = [
    {
      step: 0,
      temp: tempAt(0),
      score: currentScore,
      seq: currentSeq,
    },
  ];

  for (let step = 1; step < iterations; step++) {
    const T = tempAt(step);

    const neighbourSeq = proposeNeighbour(currentSeq);
    const neighbourScore = fitnessFn(neighbourSeq);

    const delta = neighbourScore - currentScore;
    let accept = false;

    if (delta >= 0) {
      accept = true;
    } else {
      const prob = Math.exp(delta / Math.max(T, 1e-6));
      if (Math.random() < prob) accept = true;
    }

    if (accept) {
      currentSeq = neighbourSeq;
      currentScore = neighbourScore;

      if (currentScore > bestScore) {
        bestScore = currentScore;
        bestSeq = currentSeq;
      }
    }

    history.push({
      step,
      temp: T,
      score: currentScore,
      seq: currentSeq,
    });
  }

  return { bestSeq, bestScore, history };
}
