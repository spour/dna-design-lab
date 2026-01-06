import { runSimulatedAnnealing } from '../utils/simulatedAnnealing.js';

self.onmessage = (event) => {
    const { seq, motifs, factors, opts } = event.data;

    const fitnessFn = (sequence) => {
        const found = scanSequence(sequence, motifs, factors);
        return calculateExpression(found, sequence);
    };

    const result = runSimulatedAnnealing(seq, fitnessFn, opts);

    self.postMessage(result);
};


// ---- Worker copy of your motif scanner ----

function scanSequence(seq, motifLibrary, activeFactors) {
    const BASES = ["A","C","G","T"];
    const found = [];

    const revComp = (s) => s.split("").reverse().map(b =>
        ({A:"T",T:"A",C:"G",G:"C"}[b] || "N")
    ).join("");

    const getLogOdds = (sub, pwm) => {
        let score = 0;
        for (let i = 0; i < pwm.length; i++) {
            score += pwm[i][sub[i]] ?? -2;
        }
        return score;
    };

    const getMaxScore = (pwm) =>
        pwm.reduce((acc, col) => acc + Math.max(...Object.values(col)), 0);

    for (const factor of activeFactors) {
        const model = motifLibrary[factor.jaspar];
        if (!model) continue;

        const pwm = model.pwm;
        const motifLen = pwm.length;
        const maxScore = getMaxScore(pwm);

        const sequences = [
            { seq, dir: "forward" },
            { seq: revComp(seq), dir: "reverse" }
        ];

        for (const { seq: s, dir } of sequences) {
            for (let i = 0; i <= s.length - motifLen; i++) {
                const sub = s.slice(i, i + motifLen);
                const score = getLogOdds(sub, pwm);
                const rel = score / maxScore;

                if (rel > 0.8) {
                    let start = dir === "forward" ? i : seq.length - (i + motifLen);
                    let end   = dir === "forward" ? i + motifLen : seq.length - i;

                    found.push({
                        name: factor.name,
                        start,
                        end,
                        bitScore: score,
                        weight: factor.weight
                    });
                }
            }
        }
    }

    return found;
}


// ---- Worker copy of expression function ----

function calculateExpression(found, seq) {
    let freeEnergy = 0;

    for (const f of found) {
        freeEnergy += f.bitScore * 0.8;
    }

    // Cooperativity
    found.sort((a,b) => a.start - b.start);
    for (let i = 0; i < found.length - 1; i++) {
        const d = found[i+1].start - found[i].end;

        if (d > 0 && d < 100) {
            if (d % 10.5 < 2 || d % 10.5 > 8.5) freeEnergy += 4;
            if (d < 50) freeEnergy += 3;
        }
    }

    // GC constraints
    const gc = (seq.match(/[GC]/g) || []).length / seq.length;
    if (gc < 0.3) freeEnergy -= 10;
    if (gc > 0.75) freeEnergy -= 5;

    return 100 / (1 + Math.exp(-0.06 * (freeEnergy - 50)));
}
