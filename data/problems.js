export const problems = [
  {
    id: 'cp-0001',
    composer: 'D. J. Shire',
    publication: 'The Problemist Supplement',
    year: 1997,
    stipulation: '#2',
    label: 'Waiting problem',
    difficulty: 2,
    fen: '8/5p2/5B2/1R6/P1k5/2pr1N2/bnQ3K1/8 w - - 0 1',
    source: 'https://www.theproblemist.org/beginner.pl?type=b_m2',
    key: { uci: 'g2h2', san: 'Kh2!', note: 'A quiet waiting key. Black must commit first.' },
    tries: [
      { uci: 'g2g3', san: 'Kg3?', refutation: '...Re3!' },
      { uci: 'g2h3', san: 'Kh3?', refutation: '...Re3!' }
    ],
    defenses: [
      { id: 'rd2', label: '...Rd2+', black: 'd3d2', blackSan: '...Rd2+', mate: 'f3d2', mateSan: 'Nd2#', note: 'The rook checks; the knight closes the position immediately.' },
      { id: 'rxf3', label: '...Rxf3', black: 'd3f3', blackSan: '...Rxf3', mate: 'c2e4', mateSan: 'Qe4#', note: 'The rook removes the knight, but opens the queen’s mating route.' },
      { id: 'rd4', label: '...Rd4', black: 'd3d4', blackSan: '...Rd4', mate: 'f3e5', mateSan: 'Ne5#', note: 'A rook defence changes which knight square becomes decisive.' },
      { id: 're3', label: '...Re3', black: 'd3e3', blackSan: '...Re3', mate: 'f3d2', mateSan: 'Nd2#', note: 'This is also the move that refutes the natural king tries.' },
      { id: 'relse', label: '...Rd5', black: 'd3d5', blackSan: '...Rd5', mate: 'c2c3', mateSan: 'Qxc3#', note: 'Representative “rook elsewhere” defence: the c3 pawn becomes the mating target.' },
      { id: 'nxa4', label: '...Nxa4', black: 'b2a4', blackSan: '...Nxa4', mate: 'c2a4', mateSan: 'Qxa4#', note: 'The knight takes a4 and is immediately used as the queen’s mating destination.' },
      { id: 'nelse', label: '...Nd1', black: 'b2d1', blackSan: '...Nd1', mate: 'c2a2', mateSan: 'Qxa2#', note: 'Representative knight move: once b2 is vacated, the bishop on a2 falls with mate.' },
      { id: 'bany', label: '...Bb3', black: 'a2b3', blackSan: '...Bb3', mate: 'c2b3', mateSan: 'Qxb3#', note: 'Representative bishop move: the queen captures on b3 with mate.' }
    ]
  }
];
