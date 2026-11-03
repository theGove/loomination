# Loomination draft library

Weaving drafts from books and manuscripts published in 1930 or earlier, and so
in the public domain in the United States. Each draft is a standard WIF 1.1
file that opens in any weaving program.

## Sources

Every draft records its source book, year, and figure in the WIF itself
(`[TEXT] Title`, `[NOTES]`, and `[PRIVATE LOOMINATION META]`), and every book
is listed in `books.json` with its publication date.

The drawdowns were digitized from scans of these books by
[Handweaving.net](https://www.handweaving.net), whose draft numbers appear in
our file names (`hw-12995` is Handweaving.net draft #12995). Loomination
re-derived each draft (threading, tie-up, treadling, colors) from the public
drawdown image and checked that it weaves back to exactly the same cloth.
Shaft and treadle numbering may therefore differ from the original
publication and from Handweaving.net's version.

Handweaving.net has far more than this: modern collections, tools, and
documents. It is funded by subscriptions and donations; please support it.

## Layout

```
books.json                 one entry per source book
index/summary.json         field list, flag bits, counts per shard
index/shafts-NN.json       one row per draft that needs NN shafts
drafts/NN/hw-<number>.wif  NN = last two digits of the number
```

Index shards are `{ "fields": [...], "rows": [[...], ...] }`, with fields:

| field | meaning |
|---|---|
| id | draft id, also the WIF file name |
| book | `books.json` id |
| title | title in the source (often a figure number) |
| names | common names, if any |
| shafts, treadles | as derived here |
| ends, picks | size of the drawdown |
| unitEnds, unitPicks | size of one pattern repeat |
| warpFloat, weftFloat | longest float on the face |
| colors | colors in the drawdown |
| flags | bits: 1 straight threading, 2 straight treadling, 4 point threading, 8 point treadling, 16 block draft |
