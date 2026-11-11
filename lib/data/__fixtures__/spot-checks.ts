// Hand-verified spot checks of real BTS T-100 data. Nothing here comes from our code.
//
// Source: .cache/raw/2026/T_T100_SEGMENT_ALL_CARRIER.csv (the 2026 file from transtats.bts.gov,
// downloaded 2026-11-11), rows filtered with grep for origin, destination, YEAR=2026, MONTH=7, CLASS=F.
// Each raw row is listed as [departures, seats, passengers] and summed by hand, then
// cross-checked with a second pass in the shell (awk). Both agree.

export type SpotCheck = {
  origin: string;
  dest: string;
  month: string;
  miles: number;
  rawRows: [number, number, number][];
  expected: { deps: number; seats: number; pax: number };
};

export const SPOT_CHECKS: SpotCheck[] = [
  {
    origin: "SFO",
    dest: "JFK",
    month: "2026-07",
    miles: 2586,
    rawRows: [
      [3, 481, 463], [4, 640, 583], [22, 3542, 3389], [26, 4628, 4310], [36, 6408, 6139],
      [63, 10580, 9301], [113, 24133, 21302], [130, 13260, 12241], [160, 25563, 24096],
    ],
    expected: {
      // 3+4+22+26+36+63+113+130+160 = 557
      deps: 557,
      // 481+640+3542+4628+6408+10580+24133+13260+25563 = 89,235
      seats: 89235,
      // 463+583+3389+4310+6139+9301+21302+12241+24096 = 81,824
      pax: 81824,
    },
  },
  {
    origin: "ANC",
    dest: "SEA",
    month: "2026-07",
    miles: 1448,
    rawRows: [
      [31, 4958, 4483], [31, 5579, 5177], [43, 6909, 5237], [78, 9672, 8891],
      [93, 12086, 10517], [109, 17549, 14745], [153, 27234, 23463], [180, 32040, 27361],
    ],
    expected: {
      // 31+31+43+78+93+109+153+180 = 718
      deps: 718,
      // 4958+5579+6909+9672+12086+17549+27234+32040 = 116,027
      seats: 116027,
      // 4483+5177+5237+8891+10517+14745+23463+27361 = 99,874
      pax: 99874,
    },
  },
  {
    origin: "SNA",
    dest: "DEN",
    month: "2026-07",
    miles: 846,
    rawRows: [
      [1, 126, 118], [1, 186, 175], [3, 525, 357], [4, 726, 684], [9, 1494, 1157], [13, 2418, 2178],
      [35, 7000, 5686], [59, 8083, 7079], [64, 10624, 8482], [68, 10200, 8258], [76, 13300, 9563],
    ],
    expected: {
      // 1+1+3+4+9+13+35+59+64+68+76 = 333
      deps: 333,
      // 126+186+525+726+1494+2418+7000+8083+10624+10200+13300 = 54,682
      seats: 54682,
      // 118+175+357+684+1157+2178+5686+7079+8482+8258+9563 = 43,737
      pax: 43737,
    },
  },
];
