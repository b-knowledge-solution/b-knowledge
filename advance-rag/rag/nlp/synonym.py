#
#  Copyright 2024 The InfiniFlow Authors. All Rights Reserved.
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
"""Synonym expansion dealer for query enrichment.

Manages a synonym dictionary loaded from a JSON file and optionally
refreshed from Redis. Used during query construction to expand search
terms with synonyms, improving recall. Falls back to WordNet for
English words when no custom synonyms are found.
"""

import logging
import json
import os
import time
import re
from nltk.corpus import wordnet
from common.file_utils import get_project_base_directory


class Dealer:
    """Synonym dictionary manager with Redis-backed hot-reloading.

    Loads synonyms from a local JSON file on initialization and
    periodically refreshes from Redis (if connected). Provides
    synonym lookup for both Chinese and English terms.

    Attributes:
        lookup_num: Counter of lookups since last Redis reload.
        load_tm: Timestamp of last Redis reload.
        dictionary: Dict mapping terms to lists of synonyms.
        redis: Optional Redis connection for real-time synonym updates.
    """

    def __init__(self, redis=None):
        """Initialize the synonym dealer.

        Args:
            redis: Optional Redis connection. If None, real-time
                synonym updates from Redis are disabled.
        """
        self.lookup_num = 100000000
        self.load_tm = time.time() - 1000000
        self.dictionary = None
        path = os.path.join(get_project_base_directory(), "rag/res", "synonym.json")
        try:
            self.dictionary = json.load(open(path, 'r'))
            self.dictionary = { (k.lower() if isinstance(k, str) else k): v for k, v in self.dictionary.items() }
        except Exception:
            logging.warning("Missing synonym.json")
            self.dictionary = {}

        if not redis:
            logging.warning(
                "Realtime synonym is disabled, since no redis connection.")
        if not len(self.dictionary.keys()):
            logging.warning("Fail to load synonym")

        self.redis = redis
        self.load()

    def load(self):
        """Reload synonym dictionary from Redis if conditions are met.

        Reloads only when: (1) Redis is connected, (2) at least 100
        lookups have occurred since last reload, and (3) at least 1 hour
        has passed since last reload. This throttling prevents excessive
        Redis reads while keeping synonyms reasonably fresh.
        """
        if not self.redis:
            return

        # Throttle: skip if fewer than 100 lookups since last reload
        if self.lookup_num < 100:
            return
        tm = time.time()
        # Throttle: skip if less than 1 hour since last reload
        if tm - self.load_tm < 3600:
            return

        self.load_tm = time.time()
        self.lookup_num = 0
        # Fetch the full synonym dictionary from Redis
        d = self.redis.get("kevin_synonyms")
        if not d:
            return
        try:
            d = json.loads(d)
            self.dictionary = d
        except Exception as e:
            logging.error("Fail to load synonym!" + str(e))


    def lookup(self, tk, topn=8):
        """Look up synonyms for a given token.

        Checks the custom dictionary first, then falls back to WordNet
        for purely alphabetic English tokens. Triggers a Redis reload
        check on each call.

        Args:
            tk: Token string to find synonyms for.
            topn: Maximum number of synonyms to return (default 8).

        Returns:
            List of synonym strings, up to topn entries.
        """
        if not tk or not isinstance(tk, str):
            return []

        # 1) Check the custom dictionary first (both keys and tk are already lowercase)
        self.lookup_num += 1
        self.load()
        key = re.sub(r"[ \t]+", " ", tk.strip())
        res = self.dictionary.get(key, [])
        if isinstance(res, str):
            res = [res]
        if res:  # Found in dictionary → return directly
            return res[:topn]

        # 2) If not found and tk is purely alphabetical → fallback to WordNet
        if re.fullmatch(r"[a-z]+", tk):
            wn_set = {
                re.sub("_", " ", syn.name().split(".")[0])
                for syn in wordnet.synsets(tk)
            }
            wn_set.discard(tk)  # Remove the original token itself
            wn_res = [t for t in wn_set if t]
            return wn_res[:topn]

        # 3) Nothing found in either source
        return []
    

if __name__ == '__main__':
    dl = Dealer()
    print(dl.dictionary)
