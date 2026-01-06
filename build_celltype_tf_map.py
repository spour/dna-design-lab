#!/usr/bin/env python3
"""
Build cell-type–specific TF library for BuildAPromoter.net

Inputs:
  - proteinatlas.tsv (HPA big TSV with "Protein class", etc.)
  - rna_tissue_consensus.tsv (Gene / Tissue / nTPM)

Output:
  - celltype_tf_library.json

Usage:
  python build_tf_library.py \
    --hpa proteinatlas.tsv \
    --rna rna_tissue_consensus.tsv \
    --out celltype_tf_library.json \
    --top-n 40
"""

import argparse
import math
import json
import time
from typing import Dict, List

import pandas as pd
import numpy as np
import requests

# ----------------- CONFIG -----------------

# Map your UI cell types to HPA "Tissue" strings from rna_tissue_consensus.tsv
# (for 'ubiquitous' we handle specially below)
CELLTYPE_TISSUES = {
    "neuron": [
        "cerebral cortex",
        "hippocampal formation",
        "amygdala",
        "cerebellum",
        "midbrain",
        "hypothalamus",
        "basal ganglia",
        "spinal cord",
        "retina",
        "choroid plexus",
    ],
    "liver": [
        "liver",
    ],
    "muscle": [
        "skeletal muscle",
        "heart muscle",
        "smooth muscle",
    ],
    "tcell": [
        "lymph node",
        "spleen",
        "thymus",
        "tonsil",
        "appendix",
    ],
    # "Stem" is approximate: pick TFs that are broadly expressed / germline-ish
    "stem": [
        "testis",
        "placenta",
        "bone marrow",
    ],
    # NEW: “broad / ubiquitous” expression across many tissues
    "ubiquitous": [],  # handled specially
}

# Pseudocount for enrichment / fold range
PSEUDO = 0.1

# JASPAR search endpoint
JASPAR_SEARCH_URL = "https://jaspar.elixir.no/api/v1/matrix/"


# ----------------- HELPERS -----------------


def norm_col_name(c: str) -> str:
    """Normalize column header for lookup."""
    return c.strip().strip('"').strip().lower().replace("  ", " ")


def find_col(df: pd.DataFrame, wanted: str) -> str:
    """
    Find a column in df whose normalized name matches 'wanted'.
    Raises KeyError if not found.
    """
    wanted_norm = wanted.lower()
    mapping = {norm_col_name(c): c for c in df.columns}
    if wanted_norm in mapping:
        return mapping[wanted_norm]

    variants = [
        wanted_norm.replace("_", " "),
        wanted_norm.replace(" ", "_"),
    ]
    for v in variants:
        if v in mapping:
            return mapping[v]

    raise KeyError(f"Could not find column '{wanted}' in columns: {list(df.columns)[:10]}...")


def score_celltype(
    expr_wide: pd.DataFrame,
    target_tissues: List[str],
    min_target_expr: float = 1.0,
) -> pd.DataFrame:
    """
    Compute enrichment score for each gene for a given cell type.

    expr_wide: index=Gene, columns=Tissue, values=nTPM
    score = log2( (mean expr in target tissues + PSEUDO) /
                  (mean expr in all other tissues + PSEUDO) )
    Returns DataFrame with columns ['score', 'target_expr', 'other_expr'].
    """
    # Keep only tissues that actually exist in columns
    targets_present = [t for t in target_tissues if t in expr_wide.columns]
    if not targets_present:
        raise ValueError(f"None of target tissues found in expression table: {target_tissues}")

    target_expr = expr_wide[targets_present].mean(axis=1)

    other_cols = [c for c in expr_wide.columns if c not in targets_present]
    if other_cols:
        other_expr = expr_wide[other_cols].mean(axis=1)
    else:
        other_expr = pd.Series(PSEUDO, index=expr_wide.index)

    score = np.log2((target_expr + PSEUDO) / (other_expr + PSEUDO))
    df = pd.DataFrame(
        {
            "score": score,
            "target_expr": target_expr,
            "other_expr": other_expr,
        },
        index=expr_wide.index,
    )

    # Filter out very low expression in target
    df = df[df["target_expr"] >= min_target_expr]

    # Sort by enrichment
    df = df.sort_values("score", ascending=False)
    return df


def score_ubiquitous(
    expr_wide: pd.DataFrame,
    min_expr_for_presence: float = 1.0,
) -> pd.DataFrame:
    """
    Score “ubiquitous / broad” TFs.

    Idea:
      - High fraction of tissues with expression >= min_expr_for_presence
      - Limited fold variation between max and min tissues

    score = frac_present - alpha * log2(fold_range)

    where:
      frac_present = (# tissues with expr >= min_expr_for_presence) / total_tissues
      fold_range   = (max_expr + PSEUDO) / (min_expr + PSEUDO)

    Returns DataFrame with columns:
      ['score', 'frac_present', 'fold_range', 'mean_expr'].
    """
    all_tissues = expr_wide.columns.tolist()
    n_tissues = len(all_tissues)

    # In how many tissues is the gene “on”?
    frac_present = (expr_wide >= min_expr_for_presence).sum(axis=1) / float(n_tissues)

    max_expr = expr_wide.max(axis=1)
    # Avoid zeros in denominator – replace 0 with NaN then fill
    min_expr = expr_wide.replace(0, np.nan).min(axis=1).fillna(0.0)
    mean_expr = expr_wide.mean(axis=1)

    fold_range = (max_expr + PSEUDO) / (min_expr + PSEUDO)  # >= 1
    spread_penalty = np.log2(fold_range)  # 0 if perfectly flat

    # Trade-off: want high coverage but penalize huge spread
    alpha = 0.05  # tweak if you want flatter genes
    score = frac_present - alpha * spread_penalty

    df = pd.DataFrame(
        {
            "score": score,
            "frac_present": frac_present,
            "fold_range": fold_range,
            "mean_expr": mean_expr,
        },
        index=expr_wide.index,
    )

    # Require some overall expression
    df = df[df["mean_expr"] >= min_expr_for_presence]

    # Prefer genes that are “on” in at least half the tissues
    df = df[df["frac_present"] >= 0.5]

    df = df.sort_values("score", ascending=False)
    return df


def jaspar_search_tf(gene: str, session: requests.Session, cache: Dict[str, str]) -> str:
    """
    Find JASPAR matrix_id for a TF by gene symbol.
    Very simple heuristic: search by gene name and pick first matching name / prefix.
    Returns matrix_id or None.
    """
    if gene in cache:
        return cache[gene]

    params = {
        "search": gene,
        "format": "json",
        "tax_group": "vertebrates",
        "page_size": 5,
    }

    try:
        r = session.get(JASPAR_SEARCH_URL, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"[JASPAR] ERROR for {gene}: {e}")
        cache[gene] = None
        return None

    results = data.get("results", [])
    if not results:
        cache[gene] = None
        return None

    # Prefer exact / prefix match on name
    gene_upper = gene.upper()
    best = None
    for hit in results:
        name = (hit.get("name") or "").upper()
        if name == gene_upper or name.startswith(gene_upper):
            best = hit
            break

    if best is None:
        best = results[0]

    matrix_id = best.get("matrix_id")
    cache[gene] = matrix_id
    return matrix_id


def normalize_weight(score: float) -> float:
    """
    Convert enrichment/broadness score -> weight in [0.5, 1.0] for UI.
    This is arbitrary but monotonic.
    """
    # Softish linear squash:
    #   score ~0   -> ~0.6
    #   score ~3   -> ~0.9
    #   score >=5  -> 1.0
    w = 0.6 + 0.1 * score
    return float(max(0.5, min(1.0, w)))


# ----------------- MAIN -----------------


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hpa", required=True, help="proteinatlas.tsv")
    ap.add_argument("--rna", required=True, help="rna_tissue_consensus.tsv")
    ap.add_argument("--out", required=True, help="Output JSON")
    ap.add_argument("--top-n", type=int, default=40, help="Top TFs per cell type")
    ap.add_argument("--min-nTPM", type=float, default=1.0, help="Min target/broad nTPM")
    args = ap.parse_args()

    print(f"[LOAD] HPA metadata from {args.hpa}")
    df_meta = pd.read_csv(args.hpa, sep="\t")

    print(f"[LOAD] RNA tissue expression from {args.rna}")
    df_rna = pd.read_csv(args.rna, sep="\t")

    # Resolve columns robustly
    gene_col_meta = find_col(df_meta, "Gene")
    protein_class_col = find_col(df_meta, "Protein class")

    gene_col_rna = find_col(df_rna, "Gene name")
    tissue_col = find_col(df_rna, "Tissue")
    ntpm_col = find_col(df_rna, "nTPM")

    # 1) Filter transcription factors
    print("[FILTER] Selecting transcription factors from HPA 'Protein class'")
    tf_mask = df_meta[protein_class_col].astype(str).str.contains(
        "Transcription factor", case=False, na=False
    )
    df_tf_meta = df_meta[tf_mask].copy()

    print(f"[INFO] Found {len(df_tf_meta)} TF-like entries in HPA")

    tf_genes = sorted(df_tf_meta[gene_col_meta].dropna().unique())
    print(f"[INFO] Unique TF genes: {len(tf_genes)}")

    # 2) Restrict RNA table to TF genes and pivot to wide format Gene x Tissue
    df_rna_tf = df_rna[df_rna[gene_col_rna].isin(tf_genes)].copy()

    print(f"[INFO] RNA entries for TFs: {len(df_rna_tf)}")

    expr_wide = (
        df_rna_tf
        .groupby([gene_col_rna, tissue_col])[ntpm_col]
        .mean()
        .unstack(tissue_col)
        .fillna(0.0)
    )

    expr_wide.index.name = "Gene"

    print(f"[INFO] Expression matrix shape (genes x tissues): {expr_wide.shape}")

    # 3) Score TFs per cell type
    celltype_results = {}

    for celltype, tissues in CELLTYPE_TISSUES.items():
        print(f"\n[SCORING] Cell type: {celltype}")

        if celltype == "ubiquitous":
            # special mode: broad / low-specificity genes
            scores_df = score_ubiquitous(
                expr_wide, min_expr_for_presence=args.min_nTPM
            )
            print(
                f"  [INFO] Ubiquitous-mode genes passing filters: {scores_df.shape[0]}"
            )
        else:
            print(f"  Targets: {tissues}")
            try:
                scores_df = score_celltype(
                    expr_wide, tissues, min_target_expr=args.min_nTPM
                )
            except ValueError as e:
                print(f"  [WARN] Skipping {celltype}: {e}")
                continue

            print(f"  [INFO] Genes passing min nTPM: {scores_df.shape[0]}")

        # Keep top N
        top_df = scores_df.head(args.top_n).copy()
        celltype_results[celltype] = top_df

    # 4) Query JASPAR for each TF (once)
    print("\n[JASPAR] Mapping TFs to JASPAR PWMs")
    jaspar_cache: Dict[str, str] = {}
    session = requests.Session()

    all_genes_to_annotate = sorted(
        set(g for ct_df in celltype_results.values() for g in ct_df.index)
    )

    print(f"[INFO] Total unique TFs across all cell types: {len(all_genes_to_annotate)}")

    for i, gene in enumerate(all_genes_to_annotate, start=1):
        matrix_id = jaspar_search_tf(gene, session, jaspar_cache)
        if i % 20 == 0 or matrix_id is None:
            print(f"  [{i}/{len(all_genes_to_annotate)}] {gene} → {matrix_id}")
        time.sleep(0.15)  # be nice to JASPAR

    # 5) Assemble final JSON structure
    out = {
        "metadata": {
            "source": "Human Protein Atlas v25.0 + JASPAR",
            "hpa_files": {
                "meta": args.hpa,
                "rna_tissue": args.rna,
            },
            "celltypes": list(celltype_results.keys()),
            "generated_by": "build_tf_library.py",
        },
        "cell_types": {},
    }

    for celltype, df in celltype_results.items():
        entries = []
        for gene, row in df.iterrows():
            jaspar_id = jaspar_cache.get(gene)
            if jaspar_id is None:
                # skip genes with no PWM in JASPAR
                continue

            score = float(row["score"])
            # For non-ubiquitous, we stored target_expr; for ubiquitous, we stored mean_expr
            target_expr = float(
                row["target_expr"] if "target_expr" in row.index else row["mean_expr"]
            )
            weight = normalize_weight(score)

            entries.append(
                {
                    "gene": gene,
                    "jaspar": jaspar_id,
                    "score": score,
                    "target_nTPM": target_expr,
                    "weight": weight,
                }
            )

        out["cell_types"][celltype] = entries
        print(
            f"[OUT] {celltype}: {len(entries)} TFs with JASPAR IDs "
            f"(from top {len(df)})"
        )

    # 6) Write JSON
    with open(args.out, "w") as f:
        json.dump(out, f, indent=2)

    print(f"\n[DONE] Wrote {args.out}")
    print("You can now load this JSON in your React app instead of hardcoding TF lists.")


if __name__ == "__main__":
    main()
