"""Analisis popularitas & sinyal 'client-attracting' dari shots.json."""
import argparse, json
import numpy as np
import pandas as pd


def load(path):
    df = pd.DataFrame(json.load(open(path)))
    df = df.drop_duplicates("shot_id")
    # skor popularitas: likes & saves lebih berat dari views, di-log agar outlier tidak mendominasi
    df["engagement"] = df.likes + 2 * df.saves
    df["eng_rate"] = df.engagement / df.views.replace(0, np.nan)
    return df


def by_tag(df, min_n=5):
    ex = df.explode("tags").dropna(subset=["tags"])
    g = ex.groupby("tags").agg(
        shots=("shot_id", "count"),
        median_likes=("likes", "median"),
        median_views=("views", "median"),
        median_eng_rate=("eng_rate", "median"),
        pct_available=("available_for_work", "mean"),
    )
    return g[g.shots >= min_n].sort_values("median_eng_rate", ascending=False)


def by_designer(df, min_n=2):
    g = df.groupby("designer").agg(
        shots=("shot_id", "count"), total_likes=("likes", "sum"),
        avg_views=("views", "mean"), is_pro=("is_pro", "max"),
        available=("available_for_work", "max"),
    )
    return g[g.shots >= min_n].sort_values("total_likes", ascending=False)


def client_signals(df):
    """Proksi (BUKAN data klien asli, yang tidak publik): apakah desainer pro/available
    dan tag apa yang sering muncul di antara mereka vs yang lain."""
    ex = df.explode("tags").dropna(subset=["tags"])
    cmp = ex.groupby("tags").agg(
        n=("shot_id", "count"), pro_share=("is_pro", "mean"),
        available_share=("available_for_work", "mean"))
    base = df[["is_pro", "available_for_work"]].mean()
    cmp["pro_lift"] = cmp.pro_share / base.is_pro if base.is_pro else np.nan
    cmp["available_lift"] = cmp.available_share / base.available_for_work if base.available_for_work else np.nan
    return cmp[cmp.n >= 5].sort_values("pro_lift", ascending=False)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="shots.json")
    ap.add_argument("--top", type=int, default=20)
    a = ap.parse_args()
    df = load(a.inp)
    print(f"{len(df)} shot unik\n")
    print("== Top tag (median engagement rate) ==\n", by_tag(df).head(a.top), "\n")
    print("== Top desainer ==\n", by_designer(df).head(a.top), "\n")
    print("== Tag yang over-represented di desainer Pro (proksi sinyal klien) ==\n",
          client_signals(df).head(a.top))
    df.to_csv("shots.csv", index=False)
