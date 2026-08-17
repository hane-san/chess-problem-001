export const problems = [
  {
    id: 'cp-0001',
    composer: 'D. J. Shire',
    publication: 'The Problemist Supplement',
    year: 1997,
    stipulation: '#2',
    label: '待ち問題',
    difficulty: 2,
    fen: '8/5p2/5B2/1R6/P1k5/2pr1N2/bnQ3K1/8 w - - 0 1',
    source: 'https://www.theproblemist.org/beginner.pl?type=b_m2',
    guidance: {
      key: [
        '白を動かす前に、黒が先に1手動いたと仮定します。黒の各手に、すでに白の1手Mateが用意されていないか見てみましょう。',
        'この問題はWaiting型。新しい脅しを作るより、いま盤上にあるMateの仕組みを壊さず、黒に先に動かせる「待ち手」を探します。',
        'Keyは王手とは限りません。作図問題では静かな初手も典型的です。白王の小さな一歩も、普通に候補に入れてみましょう。'
      ],
      defenses: [
        'Keyが本物かは、黒のすべてのDefenceに白のMateが残るかで決まります。ここからは変化を1本ずつ検証します。'
      ],
      mate: [
        '黒駒が動いたことで「何が変わったか」を見ます。線が開いた・塞がった、守りが消えた、駒が元のマスを空けた――のどれでしょう。',
        '着地点だけでなく、黒駒が元いたマスにも注目します。黒の防御そのものが、別の白駒の道を開くことがあります。',
        '最後は1手Mateです。王手候補ごとに、黒王の逃げ・王手駒の捕獲・王手を遮る手が全部ないか確認します。'
      ]
    },
    key: {
      uci: 'g2h2',
      san: 'Kh2!',
      note: '王手ではなく、黒に先に動かせる「待ち」の一手です。黒がどの防御を選んでも、白に次の詰みが残ります。'
    },
    tries: [
      { uci: 'g2g3', san: 'Kg3?', refutation: '...Re3!' },
      { uci: 'g2h3', san: 'Kh3?', refutation: '...Re3!' }
    ],
    defenses: [
      {
        id: 'rd2', label: '...Rd2+', black: 'd3d2', blackSan: '...Rd2+', mate: 'f3d2', mateSan: 'Nd2#',
        note: '黒のルークが王手してきますが、白はナイトをd2へ。黒王の逃げ道をふさいで詰みです。'
      },
      {
        id: 'rxf3', label: '...Rxf3', black: 'd3f3', blackSan: '...Rxf3', mate: 'c2e4', mateSan: 'Qe4#',
        note: '黒のルークがナイトを取ると、逆にクイーンがe4へ入る道が開きます。Qe4#で詰みです。'
      },
      {
        id: 'rd4', label: '...Rd4', black: 'd3d4', blackSan: '...Rd4', mate: 'f3e5', mateSan: 'Ne5#',
        note: 'ルークがd4へ動いたことで、ナイトのNe5#が成立します。'
      },
      {
        id: 're3', label: '...Re3', black: 'd3e3', blackSan: '...Re3', mate: 'f3d2', mateSan: 'Nd2#',
        note: 'このRe3は、自然に見えるKg3?やKh3?を破る防御でもあります。正解の初手ならNd2#で返せます。'
      },
      {
        id: 'relse', label: '...Rd5', black: 'd3d5', blackSan: '...Rd5', mate: 'c2c3', mateSan: 'Qxc3#',
        note: 'ルークが動いたことで、クイーンがc3のポーンを取りながら詰ませられます。Qxc3#。'
      },
      {
        id: 'nxa4', label: '...Nxa4', black: 'b2a4', blackSan: '...Nxa4', mate: 'c2a4', mateSan: 'Qxa4#',
        note: '黒のナイトがa4へ出ると、白のクイーンがそのナイトを取りながらQxa4#で詰ませます。'
      },
      {
        id: 'nelse', label: '...Nd1', black: 'b2d1', blackSan: '...Nd1', mate: 'c2a2', mateSan: 'Qxa2#',
        note: 'ナイトがb2を離れるとa2への道が開きます。白はQxa2#でビショップを取りながら詰みです。'
      },
      {
        id: 'bany', label: '...Bb3', black: 'a2b3', blackSan: '...Bb3', mate: 'c2b3', mateSan: 'Qxb3#',
        note: 'ビショップがb3へ動いたら、白はQxb3#。そのビショップを取りながら詰ませます。'
      }
    ]
  }
];
