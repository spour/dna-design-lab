/**
 * Runs a Genetic Algorithm to evolve a DNA sequence towards a higher fitness score.
 *
 * @param {string} startingSeq - The initial DNA sequence.
 * @param {function} fitnessFn - Function that takes a sequence and returns a score (0–100 or raw).
 * @param {number} generations - Number of iterations to evolve.
 * @param {number} popSize - Number of candidates in each generation.
 * @param {number} mutationRate - Probability of a single base mutating (0.0–1.0).
 * @returns {Array} - History of evolution [{ gen, bestScore, bestSeq, avgScore }, ...].
 */
export const runEvolution = (
  startingSeq,
  fitnessFn,
  generations = 50,
  popSize = 50,
  mutationRate = 0.05,
) => {
  const BASES = ['A', 'C', 'G', 'T'];

  if (!startingSeq || startingSeq.length === 0) {
    throw new Error('runEvolution: startingSeq must be a non-empty string');
  }

  // 1. Initialize Population
  let population = Array(popSize)
    .fill(null)
    .map(() => mutate(startingSeq, 0.1, BASES));

  const history = [];

  for (let gen = 0; gen < generations; gen++) {
    // 2. Evaluate Fitness
    const scoredPop = population
      .map((seq) => ({
        seq,
        score: fitnessFn(seq),
      }))
      .sort((a, b) => b.score - a.score);

    const best = scoredPop[0];

    history.push({
      gen,
      bestScore: best.score,
      bestSeq: best.seq,
      avgScore:
        scoredPop.reduce((acc, x) => acc + x.score, 0) / scoredPop.length,
    });

    // 3. Elitism
    const newPop = [scoredPop[0].seq, scoredPop[1].seq];

    // 4. Reproduction
    while (newPop.length < popSize) {
      const p1 = tournament(scoredPop);
      const p2 = tournament(scoredPop);

      let child = crossover(p1.seq, p2.seq);
      child = mutate(child, mutationRate, BASES);
      newPop.push(child);
    }

    population = newPop;
  }

  return history;
};

// Mutate random bases
const mutate = (seq, rate, bases) =>
  seq
    .split('')
    .map((char) => {
      if (Math.random() < rate) {
        const alternatives = bases.filter((b) => b !== char);
        return alternatives[Math.floor(Math.random() * alternatives.length)];
      }
      return char;
    })
    .join('');

// Single point crossover (assumes equal length)
const crossover = (p1, p2) => {
  if (p1.length !== p2.length) {
    throw new Error('crossover: parents must have same length');
  }
  const cut = Math.floor(Math.random() * p1.length);
  return p1.substring(0, cut) + p2.substring(cut);
};

// Tournament selection
const tournament = (pop) => {
  const k = 4;
  let best = null;
  for (let i = 0; i < k; i++) {
    const cand = pop[Math.floor(Math.random() * pop.length)];
    if (!best || cand.score > best.score) best = cand;
  }
  return best;
};
