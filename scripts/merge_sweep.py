"""Merge a fresh caption sweep (/tmp/capiro_subs/*.json) into site/data/phrase_ranks.json.

Every count added here comes from a real regex hit in a real YouTube caption file.
Auto-captions have no speaker labels, so (as with the original corpus) hits can
include the opponent / commentator speaking.
"""
import glob
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RANKS = ROOT / "site" / "data" / "phrase_ranks.json"
SUBS = sorted(glob.glob(sys.argv[1] + "/*.json" if len(sys.argv) > 1 else "/tmp/capiro_subs/*.json"))

BRIAN_CHANNEL = "Pushing The Limits"
KEWL_CHANNEL = "Kewl Vic Live"

# Strict, label-anchored patterns for existing clusters.
EXISTING = {
    "c001": r"\bhold on,? let me finish\b|\blet me finish\b",
    "c002": r"\bjanuary (?:6|6th|sixth)\b|\bjan(?:uary)? 6\b|\bj6\b",
    "c003": r"\bliable sexual abuser\b|\bliable for sexual abuse\b|\bsexual abuser\b",
    "c004": r"\bepstein files?\b",
    "c005": r"\bi'?m glad you asked\b|\bglad you asked\b",
    "c006": r"\belection was stolen\b|\bstolen election\b|\bstole the election\b",
    "c007": r"\banswer the question\b",
    "c008": r"\bconvicted felon\b|\b34[- ]count felon\b|\b34 felon(?:y|ies)\b",
    "c009": r"\bthat'?s a fair question\b",
    "c011": r"\bi'?ll answer that\b",
    "c013": r"\badolf hitler\b|\bpraising hitler\b",
    "c014": r"\bstormy daniels\b",
    "c015": r"\binsurrection\w*\b",
    "c016": r"\bfascis[tm]s?\b",
    "c017": r"\bgrifters?\b",
    "c019": r"\bbrainwashed\b",
    "c020": r"\be\.? ?jean carroll\b",
    "c022": r"\bdon'?t interrupt\b",
    "c024": r"\bhush money\b",
    "c025": r"\bwhataboutism\b",
    "c026": r"\bmushroom gobbler\w*\b",
}

NEW = [
    {
        "cluster_id": "c027", "canonical_label": "Get off my show", "category": "floor_control",
        "topic_bucket": "caller_ejection", "tactic": "eject the caller instead of answering",
        "pattern": r"\bget (?:the hell )?off my show\b|\boff my show\b|\bhang up on\b|\bmute (?:him|her|you)\b",
        "about": ["Callers", "MAGA", "DragonFistTV"],
    },
    {
        "cluster_id": "c028", "canonical_label": "Name one policy", "category": "fake_smart",
        "topic_bucket": "debate_procedure", "tactic": "demand a single example, then move the goalposts",
        "pattern": r"\bname (?:one|a single) (?:policy|thing|metric|verse|case|lie)\b|\bcan'?t name one\b|\bby what metric\b",
        "about": ["Trump policy", "Talarico", "Inflation"],
    },
    {
        "cluster_id": "c029", "canonical_label": "Riddle me this", "category": "fake_smart",
        "topic_bucket": "debate_procedure", "tactic": "rhetorical gotcha opener",
        "pattern": r"\briddle me this\b|\bmake it make sense\b",
        "about": ["Andrew Wilson", "Kewl Vic parody"],
    },
    {
        "cluster_id": "c030", "canonical_label": "Fake Christian", "category": "strawman",
        "topic_bucket": "religion_attack", "tactic": "question the opponent's faith",
        "pattern": r"\bfake christians?\b|\bbible[- ]thump\w*\b|\bchristian nationalis\w*\b",
        "about": ["Andrew Wilson", "Christian callers", "Trump"],
    },
    {
        "cluster_id": "c031", "canonical_label": "Complete imbecile", "category": "strawman",
        "topic_bucket": "insult", "tactic": "insult in place of rebuttal",
        "pattern": r"\b(?:complete |fucking |total )?imbeciles?\b|\bbuffoons?\b|\bdipshits?\b|\bscumbags?\b|\bright[- ]wing buffoon\b",
        "about": ["Callers", "Dave Rubin", "MAGA"],
    },
]


def fmt_ts(sec):
    sec = int(sec)
    h, m, s = sec // 3600, (sec % 3600) // 60, sec % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def bucket_for(meta):
    if meta["channel"] == BRIAN_CHANNEL:
        return "ptl"
    if meta["channel"] == KEWL_CHANNEL:
        return "kewl"
    return "ext"


def tag_for(b):
    return {"ptl": "pushing_the_limits", "kewl": "kewl_vic_live", "ext": "external_debate"}[b]


def scan(pattern, docs):
    rx = re.compile(pattern, re.I)
    res = {"ptl": 0, "kewl": 0, "ext": 0, "vids": {"ptl": set(), "kewl": set(), "ext": set()},
           "wilson": set(), "examples": []}
    for meta, segs in docs:
        b = bucket_for(meta)
        for i, s in enumerate(segs):
            txt = s["text"].replace("\n", " ")
            m = rx.search(txt)
            if not m:
                continue
            res[b] += 1
            res["vids"][b].add(meta["id"])
            if meta.get("wilson"):
                res["wilson"].add(meta["id"])
            # one example per video, max 8
            if len(res["examples"]) < 8 and meta["id"] not in {e["video_id"] for e in res["examples"]}:
                quote = " ".join(x["text"].replace("\n", " ").strip() for x in segs[max(0, i - 1): i + 3])
                st = round(float(s["start"]), 2)
                res["examples"].append({
                    "quote": quote[:280], "span": m.group(0), "video_id": meta["id"], "title": meta["title"],
                    "url": f"https://www.youtube.com/watch?v={meta['id']}&t={int(st)}s",
                    "timestamp": fmt_ts(st), "start_sec": st, "source_tag": tag_for(b),
                    "channel": meta["channel"], "sweep": "2026-10",
                })
    return res


def main():
    d = json.loads(RANKS.read_text())
    # Idempotent: never count a video twice (original corpus or a previous sweep).
    seen = set()
    for c in d["clusters"]:
        seen.update(c.get("ptl_video_ids", []), c.get("kewl_video_ids", []), c.get("external_video_ids", []))
    for s in d.get("sweeps", []):
        seen.update(s.get("video_ids", []))
    docs = []
    for p in SUBS:
        j = json.loads(Path(p).read_text())
        if j["meta"]["id"] in seen:
            print("  skip (already counted):", j["meta"]["id"])
            continue
        docs.append((j["meta"], j["segments"]))
    print(f"Merging {len(docs)} new transcripts")

    words = {"ptl": 0, "kewl": 0, "ext": 0}
    count = {"ptl": 0, "kewl": 0, "ext": 0}
    for meta, segs in docs:
        b = bucket_for(meta)
        count[b] += 1
        words[b] += sum(len(s["text"].split()) for s in segs)

    by_id = {c["cluster_id"]: c for c in d["clusters"]}
    for cid, pat in EXISTING.items():
        c = by_id.get(cid)
        if not c:
            continue
        r = scan(pat, docs)
        c["hit_count_ptl"] += r["ptl"]
        c["hit_count_kewl_vic_live"] += r["kewl"]
        c["hit_count_external"] = c.get("hit_count_external", 0) + r["ext"]
        c["hit_count"] = c["hit_count_ptl"] + c["hit_count_kewl_vic_live"] + c["hit_count_external"]
        new_ptl = r["vids"]["ptl"] - set(c.get("ptl_video_ids", []))
        new_kewl = r["vids"]["kewl"] - set(c.get("kewl_video_ids", []))
        c.setdefault("ptl_video_ids", []).extend(sorted(new_ptl))
        c.setdefault("kewl_video_ids", []).extend(sorted(new_kewl))
        c["external_video_ids"] = sorted(set(c.get("external_video_ids", [])) | r["vids"]["ext"])
        c["videos_hit_ptl"] = len(c["ptl_video_ids"])
        c["videos_hit_kewl"] = len(c["kewl_video_ids"])
        c["videos_hit"] = c["videos_hit_ptl"] + c["videos_hit_kewl"] + len(c["external_video_ids"])
        c.setdefault("examples", []).extend(r["examples"][:4])
        if r["wilson"]:
            c["wilson_video_ids"] = sorted(set(c.get("wilson_video_ids", [])) | r["wilson"])
            c["wilson_videos_hit"] = len(c["wilson_video_ids"])
        print(f"  {cid} {c['canonical_label'][:28]:28s} +ptl {r['ptl']:3d} +kewl {r['kewl']:3d} +ext {r['ext']:3d}")

    total_ptl_words = d["corpus"]["ptl_words"] + words["ptl"]
    for spec in NEW:
        if spec["cluster_id"] in by_id:
            continue
        r = scan(spec["pattern"], docs)
        ptl_ids, kewl_ids, ext_ids = (sorted(r["vids"][k]) for k in ("ptl", "kewl", "ext"))
        c = {
            "cluster_id": spec["cluster_id"], "topic_bucket": spec["topic_bucket"],
            "canonical_label": spec["canonical_label"], "category": spec["category"],
            "hit_count": r["ptl"] + r["kewl"] + r["ext"], "hit_count_ptl": r["ptl"],
            "hit_count_kewl_vic_live": r["kewl"], "hit_count_external": r["ext"],
            "videos_hit": len(ptl_ids) + len(kewl_ids) + len(ext_ids),
            "videos_hit_ptl": len(ptl_ids), "videos_hit_kewl": len(kewl_ids),
            "rate_per_1k_ptl": round(1000 * r["ptl"] / max(words["ptl"], 1), 3),
            "ptl_video_ids": ptl_ids, "kewl_video_ids": kewl_ids, "external_video_ids": ext_ids,
            "variants": [], "examples": r["examples"], "kewl_only": r["ptl"] == 0,
            "merged_from": [], "merged_count": 0,
            "wilson_video_ids": sorted(r["wilson"]), "wilson_videos_hit": len(r["wilson"]),
            "about": spec["about"], "tactic": spec["tactic"], "display_title": spec["canonical_label"],
            "key_phrase": spec["canonical_label"], "is_key_phrase_group": True,
            "member_lines": [{"text": spec["canonical_label"], "hit_count_ptl": r["ptl"],
                              "source": "cluster", "cluster_id": spec["cluster_id"]}],
            "new_in_sweep": "2026-10", "sample_scope": "2026-10 sweep only (not full archive)",
        }
        if spec["category"] == "floor_control":
            c["board_role"] = "filler_floor_control"
            c["include_in_floor_control_board"] = True
        d["clusters"].append(c)
        d["ranked_phrases"].append({
            "phrase": c["canonical_label"], "cluster_id": c["cluster_id"], "category": c["category"],
            "count": c["hit_count"], "count_ptl": c["hit_count_ptl"],
            "count_kewl_vic_live": c["hit_count_kewl_vic_live"], "videos_hit": c["videos_hit"],
            "videos_hit_ptl": c["videos_hit_ptl"], "key_phrase": c["key_phrase"], "member_line_count": 1,
        })
        print(f"  NEW {spec['cluster_id']} {spec['canonical_label']:20s} total {c['hit_count']} in {c['videos_hit']} videos")

    # Refresh ranked_phrases counts for existing clusters
    for rp in d["ranked_phrases"]:
        c = by_id.get(rp["cluster_id"])
        if c:
            rp.update(count=c["hit_count"], count_ptl=c["hit_count_ptl"],
                      count_kewl_vic_live=c["hit_count_kewl_vic_live"], videos_hit=c["videos_hit"],
                      videos_hit_ptl=c["videos_hit_ptl"])
    d["ranked_phrases"].sort(key=lambda r: -r["count"])

    # Wilson debates
    known = {w["id"] for w in d["wilson_debates"]}
    for meta, _ in docs:
        if meta.get("wilson") and meta["id"] not in known:
            d["wilson_debates"].append({
                "id": meta["id"], "title": meta["title"],
                "url": f"https://www.youtube.com/watch?v={meta['id']}", "channel": meta["channel"],
                "source_tag": tag_for(bucket_for(meta)), "priority": "andrew_wilson", "sweep": "2026-10",
            })

    # Polite-dodge windows (opener -> explicit pivot marker within 90s)
    opener = re.compile(r"\bi'?m glad you asked\b|\bthat'?s a fair question\b|\bi'?ll answer that\b", re.I)
    markers = ["let me ask you", "but what about", "but let's talk about", "the point is", "anyway",
               "that being said", "in a second", "regardless", "but first", "answer my question"]
    added = 0
    for meta, segs in docs:
        b = bucket_for(meta)
        for i, s in enumerate(segs):
            if not opener.search(s["text"]):
                continue
            st = float(s["start"])
            pivot = None
            for j in range(i + 1, len(segs)):
                if segs[j]["start"] > st + 90:
                    break
                low = segs[j]["text"].lower()
                pm = next((m for m in markers if m in low), None)
                if pm:
                    pivot = (pm, j)
                    break
            win = {
                "video_id": meta["id"], "title": meta["title"], "source_tag": tag_for(b),
                "url_start": f"https://www.youtube.com/watch?v={meta['id']}&t={int(st)}s",
                "opener_start": round(st, 2), "window_end": round(st + 90, 2),
                "opener_timestamp": fmt_ts(st),
                "opener_span": " ".join(x["text"].replace("\n", " ") for x in segs[max(0, i - 1): i + 2])[:140],
                "sweep": "2026-10",
            }
            if pivot:
                pm, j = pivot
                win.update(pivot_timestamp=fmt_ts(segs[j]["start"]), pivot_marker=pm,
                           pivot_span=" ".join(x["text"].replace("\n", " ") for x in segs[max(0, j - 1): j + 2])[:140],
                           evidence_type="pivot_marker")
            else:
                win.update(pivot_timestamp=fmt_ts(st + 45), pivot_marker=None, pivot_span=None,
                           evidence_type="no_topic_return_heuristic")
            d["polite_dodge_windows"].append(win)
            added += 1
    print(f"  +{added} polite-dodge windows")

    corp = d["corpus"]
    corp["ptl_videos"] += count["ptl"]
    corp["kewl_vic_live_videos"] += count["kewl"]
    corp["external_debate_videos"] = corp.get("external_debate_videos", 0) + count["ext"]
    corp["ptl_words"] = total_ptl_words
    corp["kewl_words"] += words["kewl"]
    corp["external_words"] = corp.get("external_words", 0) + words["ext"]
    corp["included_debates"] += len(docs)
    corp["transcripts_in_ranking"] += len(docs)
    corp["clusters_kept"] = len(d["clusters"])
    corp["key_phrase_groups"] = len(d["clusters"])
    corp["polite_dodge_windows"] = len(d["polite_dodge_windows"])
    corp["wilson_debates"] = len(d["wilson_debates"])
    d.setdefault("sweeps", []).append({
        "id": "2026-10", "at": datetime.now(timezone.utc).isoformat(),
        "videos": len(docs), "by_bucket": count, "words": words,
        "video_ids": [m["id"] for m, _ in docs],
    })
    d["generated_at"] = datetime.now(timezone.utc).isoformat()
    d.setdefault("notes", []).append(
        "2026-10 sweep: +%d transcripts (%d PTL, %d Kewl, %d external channels). Clusters c027-c031 are "
        "counted on the sweep sample only." % (len(docs), count["ptl"], count["kewl"], count["ext"]))
    RANKS.write_text(json.dumps(d, ensure_ascii=False, indent=1))
    print("Wrote", RANKS)


if __name__ == "__main__":
    main()
