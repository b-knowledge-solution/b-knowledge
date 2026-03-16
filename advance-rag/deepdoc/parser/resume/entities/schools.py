"""School/university lookup and ranking module for resume parsing.

Loads school data from CSV files (names, aliases, types, rankings) and provides
functions to look up schools by name (Chinese or English), check if a school
is in the 'good schools' list, and split mixed Chinese/English text tokens.
School rankings are loaded from a separate CSV and merged into the main table.
"""
#
#  Copyright 2025 The InfiniFlow Authors. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#

import os
import json
import re
import copy
import pandas as pd

current_file_path = os.path.dirname(os.path.abspath(__file__))
TBL = pd.read_csv(
    os.path.join(current_file_path, "res/schools.csv"), sep="\t", header=0
).fillna("")
TBL["name_en"] = TBL["name_en"].map(lambda x: x.lower().strip())
GOOD_SCH = json.load(open(os.path.join(current_file_path, "res/good_sch.json"), "r",encoding="utf-8"))
GOOD_SCH = set([re.sub(r"[,. &（）()]+", "", c) for c in GOOD_SCH])


def loadRank(fnm):
    """Load school rankings from a CSV file and merge into the global TBL.

    Args:
        fnm: Path to the CSV file with 'name,rank' rows.
    """
    global TBL
    TBL["rank"] = 1000000
    with open(fnm, "r", encoding="utf-8") as f:
        while True:
            line = f.readline()
            if not line:
                break
            line = line.strip("\n").split(",")
            try:
                nm, rk = line[0].strip(), int(line[1])
                # assert len(TBL[((TBL.name_cn == nm) | (TBL.name_en == nm))]),f"<{nm}>"
                TBL.loc[((TBL.name_cn == nm) | (TBL.name_en == nm)), "rank"] = rk
            except Exception:
                pass


loadRank(os.path.join(current_file_path, "res/school.rank.csv"))


def split(txt):
    """Split text into tokens, merging consecutive English words.

    Args:
        txt: Input text string.

    Returns:
        List of token strings with adjacent English tokens joined by spaces.
    """
    tks = []
    for t in re.sub(r"[ \t]+", " ", txt).split():
        if (
            tks
            and re.match(r".*[a-zA-Z]$", tks[-1])
            and re.match(r"[a-zA-Z]", t)
            and tks
        ):
            tks[-1] = tks[-1] + " " + t
        else:
            tks.append(t)
    return tks


def select(nm):
    """Look up a school by name (Chinese, English, or alias).

    Normalizes the input by removing parenthetical content, common prefixes,
    and punctuation before matching against the school database.

    Args:
        nm: School name string or list (first element used).

    Returns:
        A dict with school attributes (type, is_abroad, rank, etc.), or None.
    """
    global TBL
    if not nm:
        return
    if isinstance(nm, list):
        nm = str(nm[0])
    nm = split(nm)[0]
    nm = str(nm).lower().strip()
    nm = re.sub(r"[(（][^()（）]+[)）]", "", nm.lower())
    nm = re.sub(r"(^the |[,.&（）();；·]+|^(英国|美国|瑞士))", "", nm)
    nm = re.sub(r"大学.*学院", "大学", nm)
    tbl = copy.deepcopy(TBL)
    tbl["hit_alias"] = tbl["alias"].map(lambda x: nm in set(x.split("+")))
    res = tbl[((tbl.name_cn == nm) | (tbl.name_en == nm) | tbl.hit_alias)]
    if res.empty:
        return

    return json.loads(res.to_json(orient="records"))[0]


def is_good(nm):
    """Check if a school name is in the 'good schools' list.

    Args:
        nm: School name string.

    Returns:
        True if the school is considered a 'good school', False otherwise.
    """
    global GOOD_SCH
    nm = re.sub(r"[(（][^()（）]+[)）]", "", nm.lower())
    nm = re.sub(r"[''`‘’“”,. &（）();；]+", "", nm)
    return nm in GOOD_SCH
