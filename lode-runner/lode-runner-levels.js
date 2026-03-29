'use strict';
// ── Level Data ────────────────────────────────────────────────
// ' '=empty, 'b'=brick(diggable), '#'=solid, 'h'=ladder,
// '-'=rope, 'g'=gold, 'p'=player, 'e'=enemy, 't'=trapdoor
// Each row is padded/truncated to 28 cols at parse time.

const LEVELS = [
  // ── Level 1 ── Tutorial: 1 guard, 5 gold
  [
    '                            ',  // 0  (exit appears rows 0-3 col 13)
    '                            ',  // 1
    '                            ',  // 2
    '    g        h    g         ',  // 3  gold + central ladder starts
    '  bbhbb  bbbbhbb  hbbbb     ',  // 4
    '    h        h    h         ',  // 5
    '    h   g  e h g  h         ',  // 6  gold
    '  bbbhbbbbbbbhbbbbbhbbb     ',  // 7
    '    h        h    h         ',  // 8
    '    h--------h----h         ',  // 9  rope
    '    h        h    h         ',  // 10
    '  bbhbbbbbbbbhbbbbhbbb      ',  // 11
    '    h   e    h    h         ',  // 12  guard
    '    h        h    h         ',  // 13
    '   ph        h              ',  // 14  player
    '############################',  // 15
  ],
  // ── Level 2 ── Ropes: 2 guards, 7 gold
  [
    '                            ',  // 0
    '                            ',  // 1
    '                            ',  // 2
    '  g    g     h   g    g     ',  // 3  gold
    ' bbbbbbhbb   hbbbbbbbbb     ',  // 4
    '       h     h     h        ',  // 5
    ' ------h-----h-----h------  ',  // 6  rope
    '       h  e  h     h        ',  // 7
    ' bbbbbbhbbb  hbbbbbbhbbb    ',  // 8
    '       h eg  h  g  h        ',  // 9  gold
    '       hbbbbbhbbbbb h       ',  // 10
    '       h     h      h       ',  // 11
    '       h     h    e h       ',  // 12  guards
    '  bbbbbhbbbbbhbbbbbbhbbb    ',  // 13
    '  p    h                    ',  // 14
    '############################',  // 15
  ],
  // ── Level 3 ── Multi-floor: 3 guards, 8 gold
  [
    '                            ',  // 0
    '  g   g           g         ',  // 1
    ' bbbhbbb   bbh bbbhb        ',  // 2
    '    h    bbb h    h         ',  // 3
    '    h    g g hb   h         ',  // 4  (h at col 13 is EXIT ladder here)
    ' bbbhbbbbbbbbhbbbbhbbb      ',  // 5
    '    h        h    h         ',  // 6
    ' ---h--------h----h---      ',  // 7  rope
    '   eh      e h    h         ',  // 8
    ' bbbhbbbb bbbhbbbb hbbb     ',  // 9
    '    h  g  g  h    h         ',  // 10  gold
    '    hbbbbbbbbh    h         ',  // 11
    '    h   e    h  e h         ',  // 12  guards
    ' bbbhbbbbbbbbbbbbbhbbbb     ',  // 13
    '  p h             h         ',  // 14
    '############################',  // 15
  ],
  // ── Level 4 ── Three Towers: 3 guards, 9 gold
  // Ladders at cols 4, 12, 20. Exit at col 21 (adjacent to ladder 20).
  [
    '                            ',  // 0
    '                            ',  // 1
    '  g       g       g         ',  // 2  gold at 2, 10, 18
    ' bbbh     bbhbb   bbhbb  bb ',  // 3  platform
    '    h-------h       h       ',  // 4
    '    h  g    h  g    h  g    ',  // 5  gold at 7, 15, 23
    ' bbbhbbb    hbbbbbbbhbbbbbb ',  // 6  platform
    '    h       h       h       ',  // 7
    ' ---h       h-------h-----  ',  // 8  rope
    '    h   e   h  e    h    p  ',  // 9
    ' bbbhbbbbbbbh---    hbbhbbb ',  // 10 platform
    '    h       h       h  g    ',  // 11 gold at 7, 15, 23
    '    h  g    h  g    h  e    ',  // 12 guards at 7, 15, 23
    ' bbbhbbbbbbbbbbbbbbbhbbbbbb ',  // 13 platform
    '    h              h        ',  // 14 player at 3
    '############################',  // 15
  ],
  // ── Level 5 ── Double Rope: 4 guards, 11 gold
  // Two rope levels. Exit at col 21.
  [
    '                            ',  // 0
    '  g     --- g       g       ',  // 1  gold at 2, 10, 18
    ' bbbhbbh  bbhbbh  bbhbbbbbb ',  // 2  platform
    '    h  g    h  g    h       ',  // 3  gold at 7, 15
    ' ---h-- ----h-------h-----  ',  // 4  rope (upper)
    '    h       hbb     h       ',  // 5
    '    h  g e  h  g    h  g    ',  // 6  gold at 7, 15, 23
    ' bbbh  bbbbbhbbbbbbbhbbbbbb ',  // 7  platform
    '    h       h       hg      ',  // 8
    ' ---h-------h-------h-----  ',  // 9  rope (lower)
    '    h               h       ',  // 10 gold at 7, 15, 23
    '    h       h  e  g h  e  e ',  // 11 guards at 7, 15, 23, 26
    ' bbbhbb   bbhbbbbbbbhbbbbbb ',  // 12 platform
    '    h       h       h       ',  // 13
    '   ph       h       h       ',  // 14 player at 3
    '############################',  // 15
  ],
  // ── Level 6 ── Gauntlet: 5 guards, 12 gold
  // Dense gold, guards on two floors. Exit at col 21.
  [
    '                            ',  // 0
    '  ge g    g   e   g   g     ',  // 1  gold at 2, 5, 10, 18, 22
    ' bbbhb    bbhbbbbbbbhbb     ',  // 2  platform
    '    h       h       h       ',  // 3
    '    h  g    h  g    h  g    ',  // 4  gold at 7, 15, 23
    ' bbbhbbbbbbbhbbb    bhbbbbbb',  // 5  platform
    '    h       h       h       ',  // 6
    ' ---h-------h-------h---    ',  // 7  rope
    '    h       h e     h   g   ',  // 8
    ' bbbhb    bbhbbb    hb----- ',  // 9  platform
    '    h--g    h--g    h--g    ',  // 10 gold at 7, 15, 23
    '  p h       h       h       ',  // 11 gold at 23
    ' bbbhbb bbbbhbb bbbbhbbbbbb ',  // 12 platform
    '    h       h       h       ',  // 13 guards at 7, 15, 23, 26
    '    h  e    h       h  e    ',  // 14 player at 3, guard at 7
    '############################',  // 15
  ],
];
