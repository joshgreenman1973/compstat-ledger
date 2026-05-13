import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, ScatterChart, Scatter } from 'recharts';
import { geoPath, geoMercator } from 'd3-geo';
import precinctGeoJSON from './data/nyc_precincts.json';
import crimeHistory from './data/crime_history.json';

/* ------------------------------------------------------------------ */
/* 1. HISTORICAL DATASETS & CONFIG                                    */
/* ------------------------------------------------------------------ */
const CW = [
  {y:1993,BU:100936,FA:41121,GA:111622,GL:85737,MU:1927,RA:3225,RO:85892},
  {y:1994,BU:90383,FA:39773,GA:94523,GL:75459,MU:1582,RA:3196,RO:72550},
  {y:1995,BU:75649,FA:35528,GA:71798,GL:65425,MU:1181,RA:3018,RO:59733},
  {y:1996,BU:61986,FA:30615,GA:59465,GL:58690,MU:984,RA:2888,RO:49324},
  {y:1997,BU:54866,FA:30259,GA:51312,GL:55686,MU:767,RA:2783,RO:44335},
  {y:1998,BU:47181,FA:28848,GA:43315,GL:51461,MU:629,RA:2476,RO:39003},
  {y:1999,BU:41348,FA:25962,GA:38976,GL:50139,MU:667,RA:2089,RO:35654},
  {y:2000,BU:36858,FA:25881,GA:35596,GL:49398,MU:671,RA:2067,RO:31892},
  {y:2001,BU:31773,FA:23020,GA:29607,GL:46291,MU:649,RA:1930,RO:27827},
  {y:2002,BU:31150,FA:20717,GA:26344,GL:45810,MU:586,RA:1966,RO:25858},
  {y:2003,BU:28614,FA:18722,GA:23147,GL:46502,MU:596,RA:1946,RO:22769},
  {y:2004,BU:25428,FA:18124,GA:20294,GL:47952,MU:570,RA:1758,RO:21100},
  {y:2005,BU:22119,FA:17282,GA:17875,GL:47451,MU:540,RA:1650,RO:19759},
  {y:2006,BU:20398,FA:17010,GA:15770,GL:46254,MU:593,RA:1504,RO:18431},
  {y:2007,BU:18841,FA:17228,GA:13256,GL:44863,MU:496,RA:1305,RO:17705},
  {y:2008,BU:18364,FA:16002,GA:12493,GL:43920,MU:523,RA:1281,RO:16631},
  {y:2009,BU:16624,FA:16631,GA:10681,GL:39272,MU:471,RA:1206,RO:16055},
  {y:2010,BU:16225,FA:16950,GA:10334,GL:37838,MU:536,RA:1373,RO:16182},
  {y:2011,BU:15506,FA:18482,GA:9315,GL:38504,MU:515,RA:1420,RO:16968},
  {y:2012,BU:17235,FA:19381,GA:8093,GL:42497,MU:419,RA:1445,RO:17858},
  {y:2013,BU:16979,FA:20297,GA:7400,GL:45368,MU:335,RA:1378,RO:17872},
  {y:2014,BU:15208,FA:20207,GA:7664,GL:43862,MU:333,RA:1352,RO:16638},
  {y:2015,BU:13071,FA:20271,GA:7332,GL:44007,MU:352,RA:1438,RO:16804},
  {y:2016,BU:11808,FA:20847,GA:6327,GL:44279,MU:335,RA:1438,RO:15654},
  {y:2017,BU:10627,FA:20051,GA:5676,GL:43148,MU:292,RA:1449,RO:14419},
  {y:2018,BU:9768,FA:20208,GA:5428,GL:43558,MU:295,RA:1794,RO:13787},
  {y:2019,BU:10778,FA:20695,GA:5430,GL:43247,MU:319,RA:1755,RO:13369},
  {y:2020,BU:15478,FA:20569,GA:9037,GL:35502,MU:468,RA:1427,RO:13108},
  {y:2021,BU:12811,FA:22835,GA:10415,GL:40870,MU:488,RA:1491,RO:12571},
  {y:2022,BU:15745,FA:26061,GA:13750,GL:51566,MU:438,RA:1617,RO:17411},
  {y:2023,BU:13773,FA:27876,GA:15795,GL:50586,MU:391,RA:1455,RO:16910},
  {y:2024,BU:13067,FA:29452,GA:14193,GL:48445,MU:382,RA:1749,RO:16574},
  {y:2025,BU:12826,FA:29841,GA:13532,GL:48107,MU:309,RA:2049,RO:15092},
];

const MA_CW = {2000:57304,2001:57753,2002:52469,2003:51298,2004:52158,2005:52408,2006:52169,2007:51429,2008:50310,2009:50216,2010:52716,2011:50972,2012:54495,2013:53738,2014:53847,2015:42654,2016:42422,2017:41665,2018:43126,2019:42529,2020:33400,2021:36553,2022:41161,2023:44151,2024:47738};

// Multiplied by 10 to shift from /10k to /100k
const BP = [ // eslint-disable-line no-unused-vars
  {y:1993,Bx:5385,Bk:5413,Mn:7688,Qn:5168,SI:3160},
  {y:1997,Bx:3010,Bk:2877,Mn:4193,Qn:2799,SI:1670},
  {y:2001,Bx:2019,Bk:2014,Mn:2837,Qn:1702,SI:907},
  {y:2005,Bx:1715,Bk:1665,Mn:2362,Qn:1300,SI:767},
  {y:2009,Bx:1444,Bk:1308,Mn:1799,Qn:1042,SI:645},
  {y:2013,Bx:1474,Bk:1398,Mn:1735,Qn:1056,SI:726},
  {y:2017,Bx:1410,Bk:1093,Mn:1622,Qn:839,SI:588},
  {y:2019,Bx:1365,Bk:1062,Mn:1694,Qn:829,SI:510},
  {y:2021,Bx:1611,Bk:1063,Mn:1718,Qn:916,SI:524},
  {y:2023,Bx:2057,Bk:1206,Mn:2051,Qn:1161,SI:763},
  {y:2025,Bx:2104,Bk:1157,Mn:1872,Qn:1111,SI:703},
];

// Multiplied by 10 to shift from /10k to /100k
const PC = [
  {n:'100th',pov:13.9,fa:193,ma:467,ta:660,fs:29.3,sh:9,ha:1012,pl:821,gl:245},
  {n:'101st',pov:20.7,fa:493,ma:725,ta:1218,fs:40.5,sh:15,ha:1560,pl:1171,gl:244},
  {n:'102nd',pov:11.1,fa:208,ma:400,ta:608,fs:34.2,sh:2,ha:703,pl:820,gl:224},
  {n:'103rd',pov:13.8,fa:656,ma:881,ta:1537,fs:42.7,sh:8,ha:1559,pl:1749,gl:521},
  {n:'104th',pov:10.4,fa:160,ma:340,ta:500,fs:32.0,sh:2,ha:613,pl:731,gl:380},
  {n:'105th',pov:7.9,fa:114,ma:202,ta:316,fs:36.1,sh:0,ha:471,pl:348,gl:206},
  {n:'106th',pov:9.4,fa:261,ma:475,ta:736,fs:35.5,sh:4,ha:730,pl:903,gl:404},
  {n:'107th',pov:12.4,fa:157,ma:342,ta:499,fs:31.4,sh:2,ha:591,pl:639,gl:368},
  {n:'108th',pov:9.3,fa:235,ma:440,ta:675,fs:34.8,sh:1,ha:822,pl:1245,gl:638},
  {n:'109th',pov:14.2,fa:157,ma:378,ta:535,fs:29.4,sh:3,ha:600,pl:1046,gl:419},
  {n:'10th',pov:11.6,fa:287,ma:584,ta:871,fs:33.0,sh:4,ha:1073,pl:1585,gl:1155},
  {n:'110th',pov:13.9,fa:349,ma:623,ta:972,fs:35.9,sh:5,ha:669,pl:1349,gl:435},
  {n:'111th',pov:7.7,fa:100,ma:186,ta:286,fs:35.0,sh:2,ha:497,pl:432,gl:426},
  {n:'112th',pov:8.6,fa:137,ma:262,ta:399,fs:34.4,sh:1,ha:627,pl:1607,gl:348},
  {n:'113th',pov:10.7,fa:282,ma:537,ta:819,fs:34.4,sh:8,ha:915,pl:806,gl:326},
  {n:'114th',pov:12.3,fa:286,ma:493,ta:779,fs:36.7,sh:6,ha:1029,pl:1287,gl:509},
  {n:'115th',pov:14.5,fa:328,ma:662,ta:990,fs:33.1,sh:1,ha:578,pl:854,gl:449},
  {n:'120th',pov:14.6,fa:365,ma:726,ta:1091,fs:33.4,sh:8,ha:1392,pl:1000,gl:297},
  {n:'121st',pov:12.6,fa:193,ma:478,ta:671,fs:28.8,sh:1,ha:1061,pl:1032,gl:331},
  {n:'122nd',pov:8.3,fa:179,ma:263,ta:442,fs:40.4,sh:1,ha:761,pl:703,gl:290},
  {n:'123rd',pov:5.8,fa:94,ma:222,ta:316,fs:29.8,sh:0,ha:605,pl:402,gl:280},
  {n:'13th',pov:10.3,fa:305,ma:656,ta:961,fs:31.7,sh:1,ha:911,pl:3119,gl:1337},
  {n:'14th',pov:14.3,fa:2131,ma:4525,ta:6656,fs:32.0,sh:12,ha:4071,pl:16233,gl:6815},
  {n:'17th',pov:6.7,fa:127,ma:266,ta:393,fs:32.3,sh:0,ha:643,pl:1286,gl:756},
  {n:'18th',pov:11.3,fa:507,ma:1141,ta:1648,fs:30.8,sh:7,ha:1592,pl:3782,gl:2665},
  {n:'19th',pov:7.0,fa:104,ma:194,ta:298,fs:35.0,sh:0,ha:488,pl:1400,gl:802},
  {n:'1st',pov:5.5,fa:204,ma:598,ta:802,fs:25.4,sh:0,ha:874,pl:4515,gl:1589},
  {n:'20th',pov:8.6,fa:92,ma:254,ta:346,fs:26.6,sh:1,ha:636,pl:1353,gl:686},
  {n:'23rd',pov:30.6,fa:597,ma:875,ta:1472,fs:40.6,sh:17,ha:1749,pl:1297,gl:626},
  {n:'24th',pov:12.4,fa:175,ma:330,ta:505,fs:34.7,sh:3,ha:654,pl:1611,gl:489},
  {n:'25th',pov:34.1,fa:700,ma:1288,ta:1988,fs:35.2,sh:13,ha:2201,pl:1573,gl:771},
  {n:'26th',pov:25.5,fa:326,ma:511,ta:837,fs:39.0,sh:10,ha:1069,pl:890,gl:757},
  {n:'28th',pov:20.5,fa:473,ma:879,ta:1352,fs:35.0,sh:17,ha:1450,pl:2766,gl:792},
  {n:'30th',pov:22.4,fa:259,ma:595,ta:854,fs:30.3,sh:3,ha:1229,pl:1127,gl:547},
  {n:'32nd',pov:25.5,fa:566,ma:879,ta:1445,fs:39.2,sh:21,ha:1852,pl:1183,gl:482},
  {n:'33rd',pov:21.0,fa:315,ma:466,ta:781,fs:40.3,sh:5,ha:780,pl:1007,gl:445},
  {n:'34th',pov:15.1,fa:265,ma:526,ta:791,fs:33.5,sh:7,ha:622,pl:1161,gl:484},
  {n:'40th',pov:39.0,fa:1024,ma:1312,ta:2336,fs:43.8,sh:28,ha:2219,pl:1947,gl:950},
  {n:'41st',pov:31.4,fa:997,ma:1243,ta:2240,fs:44.5,sh:21,ha:1977,pl:1485,gl:653},
  {n:'42nd',pov:36.1,fa:907,ma:1124,ta:2031,fs:44.7,sh:34,ha:2376,pl:1351,gl:667},
  {n:'43rd',pov:26.0,fa:456,ma:672,ta:1128,fs:40.4,sh:18,ha:1118,pl:1165,gl:613},
  {n:'44th',pov:33.1,fa:665,ma:908,ta:1573,fs:42.3,sh:17,ha:1388,pl:1162,gl:500},
  {n:'45th',pov:14.4,fa:292,ma:473,ta:765,fs:38.2,sh:9,ha:960,pl:1037,gl:626},
  {n:'46th',pov:33.8,fa:671,ma:873,ta:1544,fs:43.4,sh:17,ha:1180,pl:727,gl:498},
  {n:'47th',pov:19.4,fa:620,ma:804,ta:1424,fs:43.5,sh:19,ha:1244,pl:905,gl:609},
  {n:'48th',pov:38.9,fa:844,ma:1277,ta:2121,fs:39.8,sh:32,ha:2074,pl:1545,gl:702},
  {n:'49th',pov:17.5,fa:460,ma:590,ta:1050,fs:43.8,sh:7,ha:1161,pl:1527,gl:687},
  {n:'50th',pov:16.8,fa:216,ma:392,ta:608,fs:35.5,sh:7,ha:923,pl:1077,gl:533},
  {n:'52nd',pov:26.3,fa:664,ma:714,ta:1378,fs:48.2,sh:10,ha:1169,pl:1228,gl:637},
  {n:'5th',pov:23.3,fa:645,ma:946,ta:1591,fs:40.5,sh:2,ha:1346,pl:2694,gl:1542},
  {n:'60th',pov:25.3,fa:414,ma:797,ta:1211,fs:34.2,sh:10,ha:1038,pl:991,gl:406},
  {n:'61st',pov:15.3,fa:181,ma:336,ta:517,fs:34.9,sh:3,ha:539,pl:681,gl:348},
  {n:'62nd',pov:18.4,fa:129,ma:377,ta:506,fs:25.5,sh:1,ha:538,pl:784,gl:309},
  {n:'63rd',pov:10.0,fa:145,ma:321,ta:466,fs:31.1,sh:5,ha:878,pl:1182,gl:461},
  {n:'66th',pov:25.0,fa:118,ma:227,ta:345,fs:34.2,sh:0,ha:388,pl:503,gl:244},
  {n:'67th',pov:14.8,fa:483,ma:638,ta:1121,fs:43.1,sh:19,ha:1694,pl:766,gl:448},
  {n:'68th',pov:14.1,fa:114,ma:333,ta:447,fs:25.6,sh:0,ha:496,pl:753,gl:292},
  {n:'69th',pov:13.1,fa:271,ma:413,ta:684,fs:39.6,sh:12,ha:1018,pl:642,gl:337},
  {n:'6th',pov:6.8,fa:259,ma:628,ta:887,fs:29.2,sh:5,ha:652,pl:2578,gl:1841},
  {n:'70th',pov:15.3,fa:268,ma:426,ta:694,fs:38.7,sh:7,ha:693,pl:891,gl:286},
  {n:'71st',pov:18.2,fa:425,ma:555,ta:980,fs:43.3,sh:11,ha:1070,pl:930,gl:330},
  {n:'72nd',pov:17.0,fa:236,ma:470,ta:706,fs:33.4,sh:3,ha:458,pl:596,gl:293},
  {n:'73rd',pov:33.1,fa:884,ma:1195,ta:2079,fs:42.5,sh:36,ha:2036,pl:1371,gl:520},
  {n:'75th',pov:23.2,fa:526,ma:784,ta:1310,fs:40.1,sh:18,ha:1530,pl:1284,gl:452},
  {n:'76th',pov:13.4,fa:232,ma:421,ta:653,fs:35.5,sh:6,ha:830,pl:913,gl:403},
  {n:'77th',pov:18.1,fa:455,ma:481,ta:936,fs:48.6,sh:14,ha:1161,pl:845,gl:447},
  {n:'78th',pov:5.8,fa:208,ma:342,ta:550,fs:37.8,sh:7,ha:620,pl:1612,gl:537},
  {n:'79th',pov:27.8,fa:443,ma:573,ta:1016,fs:43.6,sh:15,ha:1274,pl:1346,gl:418},
  {n:'7th',pov:28.1,fa:385,ma:794,ta:1179,fs:32.7,sh:9,ha:1337,pl:2405,gl:814},
  {n:'81st',pov:22.0,fa:318,ma:636,ta:954,fs:33.3,sh:17,ha:1064,pl:963,gl:388},
  {n:'83rd',pov:22.2,fa:340,ma:728,ta:1068,fs:31.8,sh:11,ha:868,pl:927,gl:616},
  {n:'84th',pov:11.6,fa:595,ma:617,ta:1212,fs:49.1,sh:6,ha:1403,pl:2564,gl:1062},
  {n:'88th',pov:14.3,fa:317,ma:655,ta:972,fs:32.6,sh:13,ha:1533,pl:1120,gl:592},
  {n:'90th',pov:31.9,fa:226,ma:361,ta:587,fs:38.5,sh:4,ha:794,pl:975,gl:606},
  {n:'94th',pov:9.8,fa:204,ma:405,ta:609,fs:33.5,sh:6,ha:915,pl:1297,gl:830},
  {n:'9th',pov:23.2,fa:246,ma:652,ta:898,fs:27.4,sh:3,ha:930,pl:2163,gl:1099},
];
const K7 = ['BU','FA','GA','GL','MU','RA','RO'];
const CC = {BU:'#394882',FA:'#e7466d',GA:'#9b9fbc',GL:'#ff7c53',MU:'#050507',RA:'#cea9be',RO:'#217ebe'};
const CL = {BU:'Burglary',FA:'Fel. Assault',GA:'Grand Larceny Auto',GL:'Grand Larceny',MU:'Murder',RA:'Rape',RO:'Robbery'};
const BC = {Bx:'#e7466d',Bk:'#394882',Mn:'#ff7c53',Qn:'#707175',SI:'#9b9fbc'}; // eslint-disable-line no-unused-vars
const BL = {Bx:'Bronx',Bk:'Brooklyn',Mn:'Manhattan',Qn:'Queens',SI:'Staten Island'}; // eslint-disable-line no-unused-vars

const GITHUB_USER = "joshgreenman1973";
const REPO_NAME = "nypd-compstat-scraper";
const CITYWIDE_POPULATION = 8804190; // 2020 Census
const VOLATILITY_THRESHOLD = 30;

const VC = {
  black: "#050507", white: "#fff", cloud: "#ddd", orange: "#ff7c53",
  periwinkle: "#9b9fbc", magenta: "#e7466d", charcoal: "#707175",
  indigo: "#394882", cerulean: "#217ebe", green: "#57aa4a"
};

const VIOLENT_CRIMES = ["Murder", "Rape", "Robbery", "Fel. Assault", "Misd. Assault", "Shooting Inc.", "Shooting Vic.", "Hate Crimes"];
const PROPERTY_CRIMES = ["Burglary", "Gr. Larceny", "G.L.A.", "Petit Larceny", "Retail Theft"];
const TOURIST_PRECINCTS = ["14th Precinct", "18th Precinct", "22nd Precinct"];

const FALLBACK_DATA = {
  "citywide": {
    "source": "Citywide",
    "report_period": { "week_start": "3/2/2026", "week_end": "3/8/2026" },
    "seven_major_felonies": {
      "Murder": { "year_to_date": { "current_year": 36, "prior_year": 61, "pct_change": -41.0 }, "historical": { "31_yr_pct": -89.9 } },
      "Rape": { "year_to_date": { "current_year": 384, "prior_year": 354, "pct_change": 8.5 }, "historical": { "31_yr_pct": -30.1 } },
      "Robbery": { "year_to_date": { "current_year": 2158, "prior_year": 2329, "pct_change": -7.3 }, "historical": { "31_yr_pct": -86.2 } },
      "Fel. Assault": { "year_to_date": { "current_year": 4349, "prior_year": 4455, "pct_change": -2.4 }, "historical": { "31_yr_pct": -32.4 } },
      "Burglary": { "year_to_date": { "current_year": 1898, "prior_year": 2421, "pct_change": -21.6 }, "historical": { "31_yr_pct": -89.5 } },
      "Gr. Larceny": { "year_to_date": { "current_year": 6715, "prior_year": 7120, "pct_change": -5.7 }, "historical": { "31_yr_pct": -55.7 } },
      "G.L.A.": { "year_to_date": { "current_year": 1845, "prior_year": 1977, "pct_change": -6.7 }, "historical": { "31_yr_pct": -83.5 } }
    },
    "additional_stats": {}
  }
};

// 2020 Census populations via John Keefe's census-by-precincts crosswalk
// (github.com/jkeefe/census-by-precincts). Patrol borough totals = sum of constituent precincts.
const GEO_POPULATIONS = {
  "1st Precinct": 84799, "5th Precinct": 50598, "6th Precinct": 64643, "7th Precinct": 57985, "9th Precinct": 75951,
  "10th Precinct": 65570, "13th Precinct": 100050, "14th Precinct": 28050, "17th Precinct": 89367, "18th Precinct": 67528,
  "19th Precinct": 220261, "20th Precinct": 114575, "22nd Precinct": 129,
  "23rd Precinct": 74769, "24th Precinct": 107489, "25th Precinct": 50996, "26th Precinct": 50002, "28th Precinct": 49200,
  "30th Precinct": 60456, "32nd Precinct": 81240, "33rd Precinct": 71598, "34th Precinct": 108608,
  "40th Precinct": 100929, "41st Precinct": 54454, "42nd Precinct": 93755, "43rd Precinct": 188015, "44th Precinct": 150436,
  "45th Precinct": 130799, "46th Precinct": 132584, "47th Precinct": 163539, "48th Precinct": 89216, "49th Precinct": 119881,
  "50th Precinct": 106976, "52nd Precinct": 146888,
  "60th Precinct": 109024, "61st Precinct": 169513, "62nd Precinct": 198870, "63rd Precinct": 112652, "66th Precinct": 205377,
  "67th Precinct": 162446, "68th Precinct": 136071, "69th Precinct": 90763, "70th Precinct": 164568, "71st Precinct": 102000,
  "72nd Precinct": 133230, "73rd Precinct": 98506, "75th Precinct": 200994, "76th Precinct": 47789, "77th Precinct": 101267,
  "78th Precinct": 73203, "79th Precinct": 106039, "81st Precinct": 68921, "83rd Precinct": 120747, "84th Precinct": 65597,
  "88th Precinct": 64372, "90th Precinct": 131377, "94th Precinct": 72748,
  "100th Precinct": 50809, "101st Precinct": 73376,
  "102nd Precinct": 153297, "103rd Precinct": 121059, "104th Precinct": 178948, "105th Precinct": 199218, "106th Precinct": 129391,
  "107th Precinct": 161402, "108th Precinct": 137962, "109th Precinct": 269581, "110th Precinct": 181051, "111th Precinct": 122211,
  "112th Precinct": 119739, "113th Precinct": 135221, "114th Precinct": 208525, "115th Precinct": 179134,
  "120th Precinct": 122308, "121st Precinct": 128149, "122nd Precinct": 144552, "123rd Precinct": 100738,
  "Bronx": 1477472, "Brooklyn South": 1705506, "Brooklyn North": 1030568, "Manhattan South": 684541, "Manhattan North": 989323, "Queens South": 1023773, "Queens North": 1397151, "Staten Island": 495747
};

// 2010 Census populations mapped to 2020 precinct boundaries (John Keefe's crosswalk).
// Used for precinct-level rate calculations on data from 2010–2019.
const GEO_POPULATIONS_2010 = { // eslint-disable-line no-unused-vars
  "1st Precinct": 66679, "5th Precinct": 52568, "6th Precinct": 62226, "7th Precinct": 56355, "9th Precinct": 76443,
  "10th Precinct": 50180, "13th Precinct": 93640, "14th Precinct": 20651, "17th Precinct": 79126, "18th Precinct": 54066,
  "19th Precinct": 208259, "20th Precinct": 102624, "22nd Precinct": 25,
  "23rd Precinct": 73106, "24th Precinct": 106460, "25th Precinct": 47405, "26th Precinct": 49508, "28th Precinct": 44781,
  "30th Precinct": 60685, "32nd Precinct": 70942, "33rd Precinct": 76958, "34th Precinct": 113062,
  "40th Precinct": 91497, "41st Precinct": 52246, "42nd Precinct": 79762, "43rd Precinct": 172122, "44th Precinct": 146441,
  "45th Precinct": 120833, "46th Precinct": 128200, "47th Precinct": 152374, "48th Precinct": 83266, "49th Precinct": 114712,
  "50th Precinct": 101720, "52nd Precinct": 139307,
  "60th Precinct": 104278, "61st Precinct": 159645, "62nd Precinct": 181981, "63rd Precinct": 108646, "66th Precinct": 191382,
  "67th Precinct": 155252, "68th Precinct": 124491, "69th Precinct": 84480, "70th Precinct": 160664, "71st Precinct": 98429,
  "72nd Precinct": 126230, "73rd Precinct": 86468, "75th Precinct": 183328, "76th Precinct": 43694, "77th Precinct": 90744,
  "78th Precinct": 66664, "79th Precinct": 90263, "81st Precinct": 62722, "83rd Precinct": 112634, "84th Precinct": 48196,
  "88th Precinct": 51421, "90th Precinct": 116836, "94th Precinct": 56247,
  "100th Precinct": 47913, "101st Precinct": 67065,
  "102nd Precinct": 144215, "103rd Precinct": 105803, "104th Precinct": 170190, "105th Precinct": 188582, "106th Precinct": 122441,
  "107th Precinct": 151107, "108th Precinct": 113200, "109th Precinct": 247354, "110th Precinct": 172634, "111th Precinct": 116431,
  "112th Precinct": 112070, "113th Precinct": 120132, "114th Precinct": 202766, "115th Precinct": 171576,
  "120th Precinct": 113008, "121st Precinct": 118708, "122nd Precinct": 138982, "123rd Precinct": 98032,
  "Bronx": 1382480, "Brooklyn South": 2056639, "Brooklyn North": 448056, "Manhattan South": 611934, "Manhattan North": 953815, "Queens South": 796151, "Queens North": 1457328, "Staten Island": 468730
};

const PRECINCT_NEIGHBORHOODS = {
  "1st Precinct": "Tribeca, Wall St", "5th Precinct": "Chinatown, Little Italy", "6th Precinct": "Greenwich Village",
  "7th Precinct": "Lower East Side", "9th Precinct": "East Village", "10th Precinct": "Chelsea",
  "13th Precinct": "Gramercy, Stuy Town", "14th Precinct": "Midtown South", "17th Precinct": "Midtown East",
  "18th Precinct": "Midtown North", "19th Precinct": "Upper East Side", "20th Precinct": "Upper West Side",
  "22nd Precinct": "Central Park", "23rd Precinct": "East Harlem South", "24th Precinct": "Morningside Heights",
  "25th Precinct": "East Harlem North", "26th Precinct": "Manhattanville", "28th Precinct": "Central Harlem",
  "30th Precinct": "Hamilton Heights", "32nd Precinct": "Central Harlem North", "33rd Precinct": "Washington Heights",
  "34th Precinct": "Inwood, Wash. Heights", "40th Precinct": "Mott Haven", "41st Precinct": "Hunts Point",
  "42nd Precinct": "Morrisania", "43rd Precinct": "Soundview", "44th Precinct": "Highbridge",
  "45th Precinct": "Co-op City", "46th Precinct": "Fordham", "47th Precinct": "Wakefield",
  "48th Precinct": "East Tremont", "49th Precinct": "Pelham Parkway", "50th Precinct": "Riverdale",
  "52nd Precinct": "Bedford Park", "60th Precinct": "Coney Island", "61st Precinct": "Sheepshead Bay",
  "62nd Precinct": "Bensonhurst", "63rd Precinct": "Flatlands", "66th Precinct": "Borough Park",
  "67th Precinct": "East Flatbush", "68th Precinct": "Bay Ridge", "69th Precinct": "Canarsie",
  "70th Precinct": "Flatbush", "71st Precinct": "Crown Heights South", "72nd Precinct": "Sunset Park",
  "73rd Precinct": "Brownsville", "75th Precinct": "East New York", "76th Precinct": "Red Hook",
  "77th Precinct": "Crown Heights North", "78th Precinct": "Park Slope", "79th Precinct": "Bed-Stuy West",
  "81st Precinct": "Bed-Stuy East", "83rd Precinct": "Bushwick", "84th Precinct": "Brooklyn Heights, DUMBO",
  "88th Precinct": "Fort Greene", "90th Precinct": "Williamsburg", "94th Precinct": "Greenpoint",
  "100th Precinct": "Rockaways", "101st Precinct": "Far Rockaway", "102nd Precinct": "Richmond Hill",
  "103rd Precinct": "Jamaica", "104th Precinct": "Ridgewood, Maspeth", "105th Precinct": "Queens Village",
  "106th Precinct": "Ozone Park", "107th Precinct": "Fresh Meadows", "108th Precinct": "Long Island City",
  "109th Precinct": "Flushing", "110th Precinct": "Elmhurst", "111th Precinct": "Bayside",
  "112th Precinct": "Forest Hills", "113th Precinct": "South Jamaica", "114th Precinct": "Astoria",
  "115th Precinct": "Jackson Heights", "120th Precinct": "St. George", "121st Precinct": "Bulls Head",
  "122nd Precinct": "New Dorp", "123rd Precinct": "Tottenville"
};

/* ------------------------------------------------------------------ */
/* HELPERS & MINI-COMPONENTS                                          */
/* ------------------------------------------------------------------ */
const safeNum = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const calcPct = (current, prior) => {
  const c = safeNum(current); const p = safeNum(prior);
  if (!p) return c === 0 ? 0 : null;
  return ((c - p) / p) * 100;
};
const formatPct = (v) => (typeof v !== 'number' || Number.isNaN(v)) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
const formatPop = (n) => {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  return Math.round(n / 1000) + 'k';
};
const formatGeoName = (geo) => {
  if (PRECINCT_NEIGHBORHOODS[geo]) return `${geo} (${PRECINCT_NEIGHBORHOODS[geo]})`;
  return geo;
};
const toOrdinalPrecinct = (n) => {
  const num = parseInt(n, 10);
  if ([11, 12, 13].includes(num % 100)) return num + "th Precinct";
  const last = num % 10;
  if (last === 1) return num + "st Precinct";
  if (last === 2) return num + "nd Precinct";
  if (last === 3) return num + "rd Precinct";
  return num + "th Precinct";
};

const renderMarkdown = (node) => {
  if (typeof node === 'string') {
    const parts = node.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="text-black">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  }
  if (React.isValidElement(node)) {
    const { children, ...rest } = node.props;
    if (children) {
      const processed = React.Children.map(children, child => renderMarkdown(child));
      return React.cloneElement(node, rest, processed);
    }
  }
  return node;
};

// Icons
const Icon = ({ children, size = 16, className = "" }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>{children}</svg>
);
const RefreshCw = (p) => <Icon {...p}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></Icon>;
const TrendingUp = (p) => <Icon {...p}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></Icon>;
const TrendingDown = (p) => <Icon {...p}><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></Icon>;
const Target = (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></Icon>;
const Activity = (p) => <Icon {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></Icon>;
const AlertCircle = (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></Icon>;
const MapPin = (p) => <Icon {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></Icon>;
const Info = (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></Icon>;
const Users = (p) => <Icon {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></Icon>;
const SearchIcon = (p) => <Icon {...p}><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/></Icon>;
const Navigation = (p) => <Icon {...p}><polygon points="3 11 22 2 13 21 11 13 3 11"/></Icon>;
const AlertTriangle = (p) => <Icon {...p}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></Icon>;
const ShieldCheck = (p) => <Icon {...p}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></Icon>;
const Sparkles = (p) => <Icon {...p}><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></Icon>;
const Send = (p) => <Icon {...p}><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></Icon>;
const X = (p) => <Icon {...p}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></Icon>;
const ArrowLeft = (p) => <Icon {...p}><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></Icon>;

/* ------------------------------------------------------------------ */
/* CITY COMPARISON — Real-Time Crime Index (AH Datalytics)             */
/* Fetched live from GitHub: AH-Datalytics/rtci scorecard.csv          */
/* Source: realtimecrimeindex.com                                      */
/* ------------------------------------------------------------------ */
const RTCI_CSV_URL = 'https://raw.githubusercontent.com/AH-Datalytics/rtci/main/docs/app_data/scorecard.csv';
const rtciRate = (count, pop) => +((count / pop) * 100000).toFixed(1);

// Fallback data in case fetch fails
const RTCI_FALLBACK = [
  { city: 'New York City', pop: 8184044, murder: 305, violent: 47211, property: 74331, isNYC: true },
  { city: 'Los Angeles',   pop: 3786018, murder: 225, violent: 25854, property: 86495 },
  { city: 'Chicago',       pop: 2628298, murder: 424, violent: 21595, property: 72438 },
  { city: 'Houston',       pop: 2304406, murder: 270, violent: 21219, property: 91409 },
  { city: 'Philadelphia',  pop: 1550843, murder: 221, violent: 12772, property: 67170 },
];
const RTCI_FALLBACK_PERIOD = 'Dec 2025';
const RTCI_FALLBACK_UPDATED = '2026-02-17';

// Comparison groups — cities must match agency_name in RTCI CSV
const RTCI_GROUPS = [
  { key: 'largest5', label: '5 Largest', cities: ['New York City', 'Los Angeles', 'Chicago', 'Houston', 'Philadelphia'] },
  { key: 'largest10', label: '10 Largest', cities: ['New York City', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'Jacksonville'] },
  { key: 'northeast', label: 'Northeast', cities: ['New York City', 'Philadelphia', 'Baltimore', 'Boston', 'Pittsburgh', 'Washington', 'Buffalo'] },
];

function parseRTCIcsv(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return null;
  const parseRow = (line) => {
    const vals = []; let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { vals.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    vals.push(cur.trim());
    return vals;
  };
  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);
  const nameI = headers.indexOf('agency_name');
  const typeI = headers.indexOf('crime_type');
  const curI = headers.indexOf('current_year_ytd');
  const popI = headers.indexOf('population');
  const updI = headers.indexOf('last_updated');
  const rangeI = headers.indexOf('ytd_month_range');
  if (nameI < 0 || typeI < 0 || curI < 0 || popI < 0) return null;

  const cityMap = {};
  let period = '', updated = '';
  rows.forEach(r => {
    const name = r[nameI], type = r[typeI];
    const count = parseInt(r[curI], 10) || 0;
    const pop = parseInt(r[popI], 10) || 0;
    if (!period && r[rangeI]) period = r[rangeI].replace(/^.*?- /, '').replace('Jan - ', '').trim();
    if (!updated && r[updI]) updated = r[updI];
    if (!cityMap[name]) cityMap[name] = { city: name, pop, murder: 0, violent: 0, property: 0, isNYC: name === 'New York City' };
    if (type === 'murder') cityMap[name].murder = count;
    else if (type === 'violent_crime') cityMap[name].violent = count;
    else if (type === 'property_crime') cityMap[name].property = count;
    if (pop > 0) cityMap[name].pop = pop;
  });
  return { cities: cityMap, period, updated };
}

// Sequential color scale for choropleth: light neutral → orange → magenta
const CHOROPLETH_STOPS = [
  [0.0, [240, 240, 240]],
  [0.25, [255, 213, 189]],
  [0.5, [255, 124, 83]],
  [0.75, [231, 70, 109]],
  [1.0, [57, 72, 130]],
];
const crimeColor = (rate, min, max) => {
  if (rate == null) return '#e5e5e5';
  const t = Math.min(1, Math.max(0, (rate - min) / (max - min || 1)));
  let lo = CHOROPLETH_STOPS[0], hi = CHOROPLETH_STOPS[CHOROPLETH_STOPS.length - 1];
  for (let i = 0; i < CHOROPLETH_STOPS.length - 1; i++) {
    if (t >= CHOROPLETH_STOPS[i][0] && t <= CHOROPLETH_STOPS[i + 1][0]) { lo = CHOROPLETH_STOPS[i]; hi = CHOROPLETH_STOPS[i + 1]; break; }
  }
  const s = (t - lo[0]) / (hi[0] - lo[0] || 1);
  const r = Math.round(lo[1][0] + s * (hi[1][0] - lo[1][0]));
  const g = Math.round(lo[1][1] + s * (hi[1][1] - lo[1][1]));
  const b = Math.round(lo[1][2] + s * (hi[1][2] - lo[1][2]));
  return `rgb(${r},${g},${b})`;
};

// Diverging color scale for YoY change: green (decrease) → neutral → red (increase)
const changeColor = (pctChange, maxAbs) => {
  if (pctChange == null) return '#e5e5e5';
  const capped = Math.min(maxAbs, Math.max(-maxAbs, pctChange));
  const t = capped / (maxAbs || 1); // -1 to +1
  if (t < 0) {
    const s = Math.abs(t);
    return `rgb(${Math.round(240 - s * 195)},${Math.round(240 - s * 80)},${Math.round(240 - s * 185)})`;
  }
  const s = t;
  return `rgb(${Math.round(240 - s * 50)},${Math.round(240 - s * 170)},${Math.round(240 - s * 175)})`;
};

/* ------------------------------------------------------------------ */
/* MINI SPARKLINE                                                      */
/* ------------------------------------------------------------------ */
const MiniSparkline = ({ points, width = 48, height = 16, minY }) => {
  if (!points || points.length < 2) return null;
  const min = minY !== undefined ? minY : Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const pad = 2;
  const coords = points.map((v, i) => {
    const x = pad + (i / (points.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const trending = points[points.length - 1] > points[0];
  return (
    <svg width={width} height={height} className="inline-block align-middle">
      <polyline points={coords} fill="none" stroke={trending ? VC.orange : VC.green} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={parseFloat(coords.split(' ').pop().split(',')[0])} cy={parseFloat(coords.split(' ').pop().split(',')[1])} r="2" fill={trending ? VC.orange : VC.green} />
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/* HISTORICAL CONTEXT HELPERS                                          */
/* ------------------------------------------------------------------ */
// Map of CompStat row names to crime_history.json keys (for citywide annual history).
// Names not in this map will fall back to a 2-point sparkline.
const HISTORICAL_KEY = {
  'Burglary': 'Burglary',
  'Fel. Assault': 'Fel. Assault',
  'G.L.A.': 'G.L.A.',
  'Gr. Larceny': 'Gr. Larceny',
  'Murder': 'Murder',
  'Rape': 'Rape',
  'Robbery': 'Robbery',
  'Misd. Assault': 'Misd. Assault',
  'Petit Larceny': 'Petit Larceny',
  'Shooting Inc.': 'Shooting Inc.',
};

// Returns historical-context info for a given offense row.
// Logic:
//   - Annualize the current YTD count using the prior-year YTD/prior-year-full-year ratio,
//     so we can compare to historical full-year values.
//   - Build a series of {y, val} for the last ~12 years.
//   - Compute pre-pandemic baseline (2017-2019 mean / range).
//   - Emit a primary "vs pre-pandemic" badge and an "outlier vs 5-yr norm" badge.
function getHistoricalContext(history, item, currentYear) {
  const key = HISTORICAL_KEY[item.name];
  if (!key || !history || !history.length) return null;
  const series = history.filter(d => typeof d[key] === 'number').map(d => ({ y: d.y, val: d[key] }));
  if (series.length < 5) return null;

  const priorYearRow = series.find(d => d.y === currentYear - 1);
  const priorFull = priorYearRow?.val;
  // YTD fraction: how much of last full year happened in YTD-equivalent period.
  const ytdFrac = (priorFull && item.prior > 0 && priorFull > 0) ? (item.prior / priorFull) : null;
  const annualized = (ytdFrac && ytdFrac > 0.05) ? item.current / ytdFrac : item.current;

  // Pre-pandemic baseline: 2017-2019.
  const pre = series.filter(d => d.y >= 2017 && d.y <= 2019).map(d => d.val);
  let pandemicBadge = null;
  if (pre.length >= 2) {
    const preLow = Math.min(...pre);
    const preHigh = Math.max(...pre);
    const preMean = pre.reduce((a, b) => a + b, 0) / pre.length;
    if (annualized < preLow) {
      pandemicBadge = { kind: 'below', label: 'Below pre-pandemic low', tone: 'green' };
    } else if (annualized < preMean * 0.97) {
      pandemicBadge = { kind: 'belowAvg', label: 'Below pre-pandemic avg', tone: 'green' };
    } else if (annualized > preHigh * 1.03) {
      pandemicBadge = { kind: 'aboveHigh', label: 'Above pre-pandemic high', tone: 'orange' };
    } else if (annualized > preMean * 1.03) {
      pandemicBadge = { kind: 'above', label: 'Above pre-pandemic avg', tone: 'orange' };
    } else {
      pandemicBadge = { kind: 'at', label: 'Back at pre-pandemic level', tone: 'gray' };
    }
  }

  // 5-year recent z-score outlier (excluding current).
  const recent = series.filter(d => d.y >= currentYear - 6 && d.y < currentYear).map(d => d.val);
  let outlierBadge = null;
  if (recent.length >= 4) {
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    const variance = recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length;
    const std = Math.sqrt(variance);
    if (std > 0) {
      const z = (annualized - mean) / std;
      if (z >= 2) outlierBadge = { kind: 'spike', label: '5-yr high outlier', tone: 'orange' };
      else if (z <= -2) outlierBadge = { kind: 'plunge', label: '5-yr low outlier', tone: 'green' };
    }
  }

  // Find the year-since superlative (e.g., "Lowest since 2014").
  const sinceSuperlative = (() => {
    if (annualized <= 0) return null;
    // Lowest since: find the most recent year (excluding current) where val <= annualized.
    let lowSince = null;
    for (let i = series.length - 1; i >= 0; i--) {
      if (series[i].y >= currentYear) continue;
      if (series[i].val < annualized) { lowSince = series[i].y + 1; break; }
    }
    if (lowSince && lowSince <= currentYear - 3) return { kind: 'low', label: `Lowest since ${lowSince}`, tone: 'green' };
    let highSince = null;
    for (let i = series.length - 1; i >= 0; i--) {
      if (series[i].y >= currentYear) continue;
      if (series[i].val > annualized) { highSince = series[i].y + 1; break; }
    }
    if (highSince && highSince <= currentYear - 3) return { kind: 'high', label: `Highest since ${highSince}`, tone: 'orange' };
    return null;
  })();

  return { series, annualized, ytdFrac, pandemicBadge, outlierBadge, sinceSuperlative, preLow: pre.length ? Math.min(...pre) : null, preHigh: pre.length ? Math.max(...pre) : null };
}

// Sparkline that renders a multi-year series with a pre-pandemic reference band and a "current" projection dot.
const ContextSparkline = ({ series, annualized, preLow, preHigh, width = 80, height = 22 }) => {
  if (!series || series.length < 3) return null;
  const allVals = series.map(d => d.val).concat([annualized]);
  if (preLow != null) allVals.push(preLow);
  if (preHigh != null) allVals.push(preHigh);
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;
  const pad = 2;
  const xFor = (i, n) => pad + (i / Math.max(1, n - 1)) * (width - pad * 2);
  const yFor = (v) => pad + (1 - (v - min) / range) * (height - pad * 2);

  // History points (excludes current year — current is rendered separately as the "annualized" dot)
  const histPoints = series.map((d, i) => `${xFor(i, series.length).toFixed(1)},${yFor(d.val).toFixed(1)}`).join(' ');
  const cx = xFor(series.length - 1, series.length) + (width - pad * 2) * 0.06; // current sits slightly right of last historical point
  const cy = yFor(annualized);
  const trending = annualized > series[series.length - 1].val;

  return (
    <svg width={width} height={height} className="inline-block align-middle">
      {preLow != null && preHigh != null && (
        <rect x={pad} y={yFor(preHigh)} width={width - pad * 2} height={Math.max(1, yFor(preLow) - yFor(preHigh))} fill="#dbeafe" fillOpacity="0.55" />
      )}
      <polyline points={histPoints} fill="none" stroke="#9ca3af" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={cx} cy={cy} r="2.5" fill={trending ? VC.orange : VC.green} />
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/* CITY COMPARISON WIDGET                                              */
/* ------------------------------------------------------------------ */
const CityComparisonWidget = ({ rtciData }) => {
  const metrics = [
    { key: 'murder', label: 'Murder', unit: 'per 100k' },
    { key: 'violent', label: 'Violent Crime', unit: 'per 100k' },
    { key: 'property', label: 'Property Crime', unit: 'per 100k' },
  ];
  const [activeMetric, setActiveMetric] = useState('murder');
  const [activeGroup, setActiveGroup] = useState('largest5');
  const metric = metrics.find(m => m.key === activeMetric);
  const group = RTCI_GROUPS.find(g => g.key === activeGroup) || RTCI_GROUPS[0];

  const allCities = rtciData?.cities || {};
  const period = rtciData?.period || RTCI_FALLBACK_PERIOD;
  const updated = rtciData?.updated || RTCI_FALLBACK_UPDATED;

  const citiesForGroup = group.cities.map(name => {
    if (allCities[name]) return allCities[name];
    const fb = RTCI_FALLBACK.find(c => c.city === name);
    return fb || null;
  }).filter(Boolean);

  if (!citiesForGroup.find(c => c.isNYC)) {
    const nyc = allCities['New York City'] || RTCI_FALLBACK.find(c => c.isNYC);
    if (nyc) citiesForGroup.unshift(nyc);
  }

  const ranked = citiesForGroup.map(c => ({ ...c, rate: rtciRate(c[activeMetric], c.pop) }))
    .sort((a, b) => a.rate - b.rate);
  const maxRate = ranked.length > 0 ? ranked[ranked.length - 1].rate : 1;

  return (
    <section className="mb-10 p-6 bg-gray-50 rounded-sm border border-gray-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-400">How NYC Compares</h3>
          <p className="text-[13px] font-serif text-gray-600 mt-0.5">12-month rolling {metric.label.toLowerCase()} rate {metric.unit}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex bg-white p-1 rounded border border-gray-200">
            {metrics.map(m => (
              <button key={m.key} onClick={() => setActiveMetric(m.key)}
                className={`px-3 py-1 text-[10px] font-black uppercase tracking-wide ${activeMetric === m.key ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex bg-white p-0.5 rounded border border-gray-200">
            {RTCI_GROUPS.map(g => (
              <button key={g.key} onClick={() => setActiveGroup(g.key)}
                className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded-sm ${activeGroup === g.key ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}>
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-2.5">
        {ranked.map(c => {
          const barW = maxRate > 0 ? (c.rate / maxRate) * 100 : 0;
          const isNYC = c.isNYC;
          return (
            <div key={c.city} className="flex items-center gap-3">
              <span className={`w-28 text-right text-[12px] ${isNYC ? 'font-black text-gray-900' : 'font-medium text-gray-500'}`}>
                {c.city === 'New York City' ? 'New York' : c.city}
              </span>
              <div className="flex-1 h-5 bg-gray-200 rounded-sm overflow-hidden relative">
                <div className={`h-full rounded-sm ${isNYC ? 'bg-gray-900' : 'bg-gray-400'}`}
                  style={{ width: `${barW}%` }} />
              </div>
              <span className={`w-16 text-[12px] tabular-nums ${isNYC ? 'font-black text-gray-900' : 'font-medium text-gray-500'}`}>
                {c.rate.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
        <p className="text-[10px] text-gray-400">
          Data through {period} · Updated {updated} · UCR Part I offenses · FBI population estimates
        </p>
        <a href="https://realtimecrimeindex.com/" target="_blank" rel="noopener noreferrer"
          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline whitespace-nowrap">
          Source: Real-Time Crime Index by AH Datalytics ↗
        </a>
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* TRANSIT CRIME BOX                                                   */
/* ------------------------------------------------------------------ */
const TRANSIT_OFFENSE_LABELS = {
  'GRAND LARCENY': 'Grand Larceny',
  'DANGEROUS WEAPONS': 'Dangerous Weapons',
  'CRIMINAL MISCHIEF & RELATED OF': 'Criminal Mischief',
  'FELONY ASSAULT': 'Felony Assault',
  'FORGERY': 'Forgery',
  'MISCELLANEOUS PENAL LAW': 'Misc. Penal Law',
  'DANGEROUS DRUGS': 'Dangerous Drugs',
  'ROBBERY': 'Robbery',
  'SEX CRIMES': 'Sex Crimes',
  'THEFT-FRAUD': 'Theft/Fraud',
  'POSSESSION OF STOLEN PROPERTY': 'Stolen Property',
  'BURGLARY': 'Burglary',
  'RAPE': 'Rape',
  'KIDNAPPING & RELATED OFFENSES': 'Kidnapping',
  'ARSON': 'Arson',
  'MURDER & NON-NEGL. MANSLAUGHTER': 'Murder',
};

const TransitCrimeBox = ({ rawData }) => {
  const cw = rawData?.citywide;
  const transit = cw?.additional_stats?.Transit;

  const [breakdown, setBreakdown] = useState(null); // { year, priorYear, rows: [{name, cur, prior, pct}] }
  const [breakdownLoading, setBreakdownLoading] = useState(true);
  const [breakdownErr, setBreakdownErr] = useState(false);

  useEffect(() => {
    const fetchOne = (url) => fetch(url).then(r => r.ok ? r.json() : Promise.reject(r.status));
    // Use the latest available date in the current dataset to define the YTD window,
    // then query the SAME calendar window in the prior year so comparisons are apples-to-apples.
    // Current dataset (5uac-w243) holds the active year; historic (qgea-i56i) holds 2006-2024 (or whichever years are now closed).
    const maxUrl = "https://data.cityofnewyork.us/resource/5uac-w243.json?$select=max(rpt_dt) AS max,min(rpt_dt) AS min";
    fetchOne(maxUrl).then(meta => {
      const maxDate = meta?.[0]?.max ? new Date(meta[0].max) : new Date();
      const minDate = meta?.[0]?.min ? new Date(meta[0].min) : new Date(maxDate.getFullYear(), 0, 1);
      let year = maxDate.getFullYear();
      let monthsCovered = (maxDate.getMonth() - minDate.getMonth() + 1);

      // If the current year only has a thin slice (<3 months), fall back one year so we compare two more-complete YTD windows.
      if (monthsCovered < 3 && minDate.getFullYear() === year) {
        year = year - 1;
      }

      const priorYear = year - 1;
      // YTD cutoff date — use maxDate's month/day if it falls in `year`, else Dec 31
      const cutoffMonth = (maxDate.getFullYear() === year) ? maxDate.getMonth() : 11;
      const cutoffDay = (maxDate.getFullYear() === year) ? maxDate.getDate() : 31;
      const monthStr = String(cutoffMonth + 1).padStart(2, '0');
      const dayStr = String(cutoffDay).padStart(2, '0');
      const periodLabel = monthsCovered >= 11 || maxDate.getFullYear() !== year ? 'Full year' : `Jan 1 – ${maxDate.toLocaleString('en-US', { month: 'short', day: 'numeric' })}`;

      // Pick the right dataset for each year. 5uac-w243 may contain both years; qgea-i56i has older years.
      const buildQuery = (dataset, fromY, toY, m, d) => `https://data.cityofnewyork.us/resource/${dataset}.json?` +
        `$select=ofns_desc,count(*) AS n&$where=transit_district IS NOT NULL AND law_cat_cd='FELONY' ` +
        `AND rpt_dt>='${fromY}-01-01T00:00:00' AND rpt_dt<='${toY}-${m}-${d}T23:59:59'` +
        `&$group=ofns_desc&$order=n DESC&$limit=50`;

      // Try current year from 5uac-w243; prior year YTD from whichever dataset has it (try 5uac first, fall back to qgea)
      const curUrl = buildQuery('5uac-w243', year, year, monthStr, dayStr);
      const priorUrlA = buildQuery('5uac-w243', priorYear, priorYear, monthStr, dayStr);
      const priorUrlB = buildQuery('qgea-i56i', priorYear, priorYear, monthStr, dayStr);

      Promise.all([
        fetchOne(curUrl),
        fetchOne(priorUrlA).then(rows => rows.length > 0 ? rows : fetchOne(priorUrlB)).catch(() => fetchOne(priorUrlB)),
      ]).then(([rows, prior]) => {
        const curMap = {};
        rows.forEach(r => { curMap[r.ofns_desc] = parseInt(r.n, 10) || 0; });
        const priMap = {};
        prior.forEach(r => { priMap[r.ofns_desc] = parseInt(r.n, 10) || 0; });
        const names = new Set([...Object.keys(curMap), ...Object.keys(priMap)]);
        const combined = [];
        names.forEach(n => {
          const cur = curMap[n] || 0;
          const pri = priMap[n] || 0;
          const pct = pri > 0 ? ((cur - pri) / pri) * 100 : (cur > 0 ? 100 : 0);
          combined.push({ name: n, label: TRANSIT_OFFENSE_LABELS[n] || n, cur, prior: pri, pct, diff: cur - pri });
        });
        combined.sort((a, b) => b.cur - a.cur);
        const totalCur = combined.reduce((s, r) => s + r.cur, 0);
        const totalPri = combined.reduce((s, r) => s + r.prior, 0);
        setBreakdown({ year, priorYear, rows: combined, totalCur, totalPri, periodLabel });
        setBreakdownLoading(false);
      }).catch(() => { setBreakdownErr(true); setBreakdownLoading(false); });
    }).catch(() => { setBreakdownErr(true); setBreakdownLoading(false); });
  }, []);

  const [sortBy, setSortBy] = useState('volume'); // volume | change | delta | name

  if (!transit) return null;

  const period = cw?.report_period || {};
  const fmtPct = (v) => {
    if (v == null || !isFinite(v)) return '—';
    const sign = v > 0 ? '+' : '';
    return `${sign}${v.toFixed(1)}%`;
  };
  const pctColor = (v) => v == null ? '#6b7280' : v > 0 ? '#c0392b' : v < 0 ? '#1f7a3a' : '#6b7280';

  const ytd = transit.year_to_date || {};
  const wtd = transit.week_to_date || {};
  const m28 = transit.twenty_eight_day || {};
  const hist = transit.historical || {};

  // Sort the offense rows
  const rowsAll = (breakdown?.rows || []).filter(r => r.cur > 0 || r.prior > 0);
  const sorted = [...rowsAll].sort((a, b) => {
    if (sortBy === 'volume') return b.cur - a.cur;
    if (sortBy === 'change') return (b.pct || 0) - (a.pct || 0);
    if (sortBy === 'delta') return b.diff - a.diff;
    if (sortBy === 'name') return a.label.localeCompare(b.label);
    return 0;
  });
  const maxVal = sorted.reduce((m, r) => Math.max(m, r.cur, r.prior), 1);

  const SortHeader = ({ field, children, align = 'right' }) => {
    const active = sortBy === field;
    return (
      <button
        onClick={() => setSortBy(field)}
        title={`Sort by ${field}`}
        className={`group inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest cursor-pointer transition-colors ${active ? 'text-black' : 'text-gray-500 hover:text-black'} ${align === 'right' ? 'justify-end' : 'justify-start'}`}
      >
        <span className="underline decoration-dotted decoration-gray-300 underline-offset-[3px] group-hover:decoration-black">{children}</span>
        <span className={`inline-block text-[10px] leading-none transition-opacity ${active ? 'opacity-100 text-black' : 'opacity-40 group-hover:opacity-80'}`}>{active ? '▼' : '↕'}</span>
      </button>
    );
  };

  const Kpi = ({ label, value, prior, pct, size = 'sm' }) => (
    <div className="flex flex-col">
      <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">{label}</span>
      <div className="flex items-baseline gap-2 mt-1">
        <span className={`tabular-nums font-black text-black ${size === 'lg' ? 'text-[28px] leading-none' : 'text-[18px] leading-none'}`}>{value?.toLocaleString() ?? '—'}</span>
        {pct != null && (
          <span className="tabular-nums font-bold text-[12px]" style={{ color: pctColor(pct) }}>{fmtPct(pct)}</span>
        )}
      </div>
      {prior != null && (
        <span className="text-[10px] text-gray-400 mt-0.5 tabular-nums">vs {prior.toLocaleString()} prior yr</span>
      )}
    </div>
  );

  return (
    <section className="mb-10 p-5 bg-white rounded-sm border-l-4 border-gray-900 border-t border-r border-b border-gray-200">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-400">Transit System · Major Felony Index</h3>
          <p className="text-[13px] font-serif text-gray-600 mt-0.5">
            Offenses recorded on the NYC subway and bus system. Live weekly CompStat feed from the NYPD Transit Bureau.
          </p>
        </div>
        <span className="text-[10px] text-gray-400 whitespace-nowrap">Week ending {period.week_end || '?'}</span>
      </div>

      {/* Current trend KPI grid */}
      <div className="pb-4 mb-5 border-b border-gray-100">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-4 items-end">
          <div className="col-span-2 md:col-span-2">
            <Kpi label="Year to date" value={ytd.current_year} prior={ytd.prior_year} pct={ytd.pct_change} size="lg" />
          </div>
          <Kpi label="Last 28 days" value={m28.current_year} pct={m28.pct_change} />
          <Kpi label="This week" value={wtd.current_year} pct={wtd.pct_change} />
          <div className="flex flex-col gap-1 text-[11px]">
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Long view</span>
            {hist['2_yr_pct'] != null && (
              <span className="text-gray-600">vs 2 yrs ago <strong className="tabular-nums ml-1" style={{ color: pctColor(hist['2_yr_pct']) }}>{fmtPct(hist['2_yr_pct'])}</strong></span>
            )}
            {hist['14_yr_pct'] != null && (
              <span className="text-gray-600">vs 14 yrs ago <strong className="tabular-nums ml-1" style={{ color: pctColor(hist['14_yr_pct']) }}>{fmtPct(hist['14_yr_pct'])}</strong></span>
            )}
          </div>
        </div>
      </div>

      {/* Unified offense-type table */}
      <div className="max-w-3xl">
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500">By offense type{breakdown ? ` · ${breakdown.year} vs ${breakdown.priorYear}${breakdown.periodLabel && breakdown.periodLabel !== 'Full year' ? ` (${breakdown.periodLabel})` : ''}` : ''}</h4>
            <p className="text-[11px] text-gray-500 italic mt-0.5">{breakdown?.periodLabel === 'Full year' ? 'Full-year totals' : 'Year-to-date totals through the same calendar day in each year'} from NYPD complaint-level data (NYC Open Data, transit-district filter). Different counting rules from CompStat above, so totals won't match exactly.</p>
          </div>
          {breakdown && (
            <div className="text-right">
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">{breakdown.periodLabel === 'Full year' ? 'Annual total' : 'Period total'}</div>
              <div className="text-[14px] font-black tabular-nums text-black">{breakdown.totalCur.toLocaleString()}</div>
              <div className="text-[10px] tabular-nums" style={{ color: pctColor(((breakdown.totalCur - breakdown.totalPri) / (breakdown.totalPri || 1)) * 100) }}>
                {fmtPct(((breakdown.totalCur - breakdown.totalPri) / (breakdown.totalPri || 1)) * 100)} vs {breakdown.totalPri.toLocaleString()}
              </div>
            </div>
          )}
        </div>

        {breakdownLoading && <div className="text-[11px] text-gray-400 italic py-4">Fetching per-offense breakdown from NYC Open Data…</div>}
        {breakdownErr && <div className="text-[11px] text-gray-400 italic py-4">Per-offense breakdown unavailable — NYC Open Data could not be reached.</div>}
        {breakdown && (
          <div>
            {/* Sort hint + sortable header row */}
            <div className="flex items-center gap-2 mb-2 text-[10px] text-gray-500">
              <span className="font-bold uppercase tracking-widest text-[9px] text-gray-400">Sort by:</span>
              <button onClick={() => setSortBy('volume')} className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wide transition-colors ${sortBy === 'volume' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Volume</button>
              <button onClick={() => setSortBy('delta')} className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wide transition-colors ${sortBy === 'delta' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Δ Volume</button>
              <button onClick={() => setSortBy('change')} className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wide transition-colors ${sortBy === 'change' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Δ %</button>
              <button onClick={() => setSortBy('name')} className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wide transition-colors ${sortBy === 'name' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>A–Z</button>
              <span className="text-[10px] text-gray-400 italic ml-1">(column headers are also clickable)</span>
            </div>
            <div className="flex items-center gap-3 pb-2 mb-1 border-b border-gray-200 bg-gray-50 -mx-1 px-1 rounded-sm">
              <SortHeader field="name" align="left"><span className="w-32 inline-block text-left">Offense</span></SortHeader>
              <div className="flex-1 min-w-[120px] flex items-center gap-3 text-[9px] font-bold uppercase tracking-widest text-gray-400">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-[4px] bg-gray-900 rounded-sm" /> {breakdown.year}</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-[4px] bg-gray-300 rounded-sm" /> {breakdown.priorYear}</span>
              </div>
              <span className="w-14 text-right"><SortHeader field="volume">{breakdown.year}</SortHeader></span>
              <span className="w-14 text-right text-[9px] font-black uppercase tracking-widest text-gray-400">{breakdown.priorYear}</span>
              <span className="w-16 text-right"><SortHeader field="delta">Δ vol</SortHeader></span>
              <span className="w-14 text-right"><SortHeader field="change">Δ %</SortHeader></span>
            </div>
            {sorted.map(r => {
              const curW = (r.cur / maxVal) * 100;
              const priW = (r.prior / maxVal) * 100;
              const deltaStr = `${r.diff > 0 ? '+' : ''}${r.diff.toLocaleString()}`;
              return (
                <div key={r.name} className="flex items-center gap-3 py-1 text-[11px]">
                  <span className="w-32 flex-shrink-0 font-bold text-gray-800 truncate" title={r.label}>{r.label}</span>
                  <div className="flex-1 min-w-[120px]">
                    <div className="relative h-[10px]">
                      <div className="absolute top-0 left-0 h-[4px] rounded-sm bg-gray-900" style={{ width: `${curW}%` }} />
                      <div className="absolute top-[6px] left-0 h-[4px] rounded-sm bg-gray-300" style={{ width: `${priW}%` }} />
                    </div>
                  </div>
                  <span className="w-14 text-right tabular-nums font-bold text-black">{r.cur.toLocaleString()}</span>
                  <span className="w-14 text-right tabular-nums text-gray-400">{r.prior.toLocaleString()}</span>
                  <span className="w-16 text-right tabular-nums font-bold" style={{ color: pctColor(r.diff) }}>{deltaStr}</span>
                  <span className="w-14 text-right tabular-nums font-bold" style={{ color: pctColor(r.pct) }}>{fmtPct(r.pct)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-[10px] text-gray-400 mt-4 italic leading-snug">
        CompStat live = weekly NYPD CompStat feed for Transit Bureau (all major felonies combined, through week ending {period.week_end || '?'}).
        By-offense totals = NYC Open Data complaint-level extract filtered to records with a transit-district code, most recent complete calendar year vs prior. The two sources use different counting rules, so the aggregates will not match exactly.
      </p>
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* PRECINCT CHOROPLETH MAP                                             */
/* ------------------------------------------------------------------ */
const PrecinctMap = ({ precinctRates, onSelect, activeGeo, mapMode = 'rate', width = 520, height = 520 }) => {
  const [hovered, setHovered] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const svgRef = useRef(null);

  const { pathFn, rateMap, minRate, maxRate, maxAbsChange, maxAbsDelta } = useMemo(() => {
    const projection = geoMercator().fitSize([width, height], precinctGeoJSON);
    const pathFn = geoPath().projection(projection);
    const rateMap = {};
    let minR = Infinity, maxR = 0, maxAbs = 0, maxDelta = 0;
    precinctRates.forEach(p => {
      p.countDelta = (p.count != null && p.priorCount != null) ? (p.count - p.priorCount) : null;
      rateMap[p.precinctNum] = p;
      if (!p.isTourist) {
        if (p.rate != null) {
          if (p.rate < minR) minR = p.rate;
          if (p.rate > maxR) maxR = p.rate;
        }
        if (p.pctChange != null) maxAbs = Math.max(maxAbs, Math.abs(p.pctChange));
        if (p.countDelta != null) maxDelta = Math.max(maxDelta, Math.abs(p.countDelta));
      }
    });
    if (minR === Infinity) minR = 0;
    if (maxAbs > 100) maxAbs = 100;
    return { pathFn, rateMap, minRate: minR, maxRate: maxR, maxAbsChange: maxAbs, maxAbsDelta: maxDelta };
  }, [precinctRates, width, height]);

  const handleMouse = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const hoveredData = hovered ? rateMap[hovered] : null;

  // Compute rank among non-tourist precincts (by rate, highest = rank 1)
  const rateRanks = useMemo(() => {
    const rankable = precinctRates.filter(p => !p.isTourist && p.rate != null).sort((a, b) => b.rate - a.rate);
    const map = {};
    rankable.forEach((p, i) => { map[p.precinctNum] = { rank: i + 1, total: rankable.length }; });
    return map;
  }, [precinctRates]);

  return (
    <div className="relative">
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" onMouseMove={handleMouse}>
        <defs>
          <pattern id="tourist-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#999" strokeWidth="1.5" />
          </pattern>
        </defs>
        {precinctGeoJSON.features.map(feature => {
          const pNum = feature.properties.precinct;
          const pData = rateMap[pNum];
          const fill = pData?.isTourist ? '#e5e5e5'
            : mapMode === 'change' ? changeColor(pData?.pctChange, maxAbsChange)
            : mapMode === 'volume' ? changeColor(pData?.countDelta, maxAbsDelta)
            : crimeColor(pData?.rate, minRate, maxRate);
          return (
            <g key={pNum}>
              <path
                d={pathFn(feature)}
                fill={fill}
                stroke="#fff"
                strokeWidth={hovered === pNum ? 2 : 0.5}
                style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
                onMouseEnter={() => setHovered(pNum)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => pData && onSelect(pData.precinct)}
              />
              {pData?.isTourist && (
                <path d={pathFn(feature)} fill="url(#tourist-hatch)" stroke="none" pointerEvents="none" />
              )}
            </g>
          );
        })}
      </svg>
      {hoveredData && (() => {
        const pop = GEO_POPULATIONS[hoveredData.precinct];
        const rankInfo = rateRanks[hoveredData.precinctNum];
        return (
          <div
            className="absolute pointer-events-none bg-white border border-gray-200 shadow-xl rounded p-3 z-50 text-[11px]"
            style={{ left: Math.min(mousePos.x + 12, width - 220), top: mousePos.y - 10, minWidth: 200 }}
          >
            <div className="font-black text-black text-[12px] mb-0.5">{hoveredData.precinct}</div>
            {PRECINCT_NEIGHBORHOODS[hoveredData.precinct] && <div className="text-gray-500 mb-2">{PRECINCT_NEIGHBORHOODS[hoveredData.precinct]}</div>}
            {hoveredData.isTourist ? (
              <div className="text-gray-500 italic">Tourist/commercial hub — rates not comparable</div>
            ) : (
              <>
                <div className="font-bold text-black">{hoveredData.count.toLocaleString()} incidents</div>
                {hoveredData.rate != null && <div className="text-gray-600">{hoveredData.rate.toFixed(1)} per 100k{rankInfo ? ` · Rank ${rankInfo.rank} of ${rankInfo.total}` : ''}</div>}
                {hoveredData.countDelta != null && (
                  <div className="font-medium mt-1" style={{ color: hoveredData.countDelta > 0 ? '#c0392b' : hoveredData.countDelta < 0 ? '#27ae60' : '#333' }}>
                    {hoveredData.countDelta > 0 ? '+' : ''}{hoveredData.countDelta.toLocaleString()} incidents vs last year
                    {hoveredData.pctChange != null && <span className="text-gray-500 font-normal"> ({hoveredData.pctChange > 0 ? '+' : ''}{hoveredData.pctChange.toFixed(1)}%)</span>}
                  </div>
                )}
                {hoveredData.priorCount != null && <div className="text-gray-400 text-[10px]">{hoveredData.priorCount.toLocaleString()} prior year</div>}
                {pop && <div className="text-gray-400 mt-1">Pop. {pop.toLocaleString()}</div>}
              </>
            )}
          </div>
        );
      })()}
      {/* Legend */}
      <div className="flex items-center gap-2 mt-3 text-[10px] text-gray-500">
        {mapMode === 'change' || mapMode === 'volume' ? (
          <>
            <span>{mapMode === 'volume' ? 'Fewer incidents' : 'Decrease'}</span>
            <div className="flex-1 h-2 rounded" style={{ background: `linear-gradient(to right, rgb(45,160,55), rgb(140,210,140), rgb(240,240,240), rgb(210,140,135), rgb(190,70,65))` }} />
            <span>{mapMode === 'volume' ? 'More incidents' : 'Increase'}</span>
          </>
        ) : (
          <>
            <span>Low</span>
            <div className="flex-1 h-2 rounded" style={{ background: `linear-gradient(to right, rgb(240,240,240), rgb(255,213,189), rgb(255,124,83), rgb(231,70,109), rgb(57,72,130))` }} />
            <span>High</span>
          </>
        )}
        <span className="ml-3 pl-3 border-l border-gray-300 flex items-center gap-1">
          <span className="inline-block w-3 h-3 bg-gray-200" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, #999 2px, #999 3px)' }} />
          Tourist
        </span>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* PRECINCT RANKING BARS                                               */
/* ------------------------------------------------------------------ */
const PrecinctRankingBars = ({ precinctRates, onSelect, mapMode = 'rate' }) => {
  const { top5, bottom5 } = useMemo(() => {
    if (mapMode === 'change') {
      const valid = precinctRates.filter(p => p.pctChange != null && !p.isTourist && p.priorCount > 5).sort((a, b) => b.pctChange - a.pctChange);
      return { top5: valid.slice(0, 5), bottom5: valid.slice(-5).reverse() };
    }
    if (mapMode === 'volume') {
      const valid = precinctRates.filter(p => p.count != null && p.priorCount != null && !p.isTourist)
        .map(p => ({ ...p, countDelta: p.count - p.priorCount }))
        .sort((a, b) => b.countDelta - a.countDelta);
      return { top5: valid.slice(0, 5), bottom5: valid.slice(-5).reverse() };
    }
    const valid = precinctRates.filter(p => p.rate != null && !p.isTourist).sort((a, b) => b.rate - a.rate);
    return { top5: valid.slice(0, 5), bottom5: valid.slice(-5).reverse() };
  }, [precinctRates, mapMode]);

  const renderBar = (item, color, maxW, maxVal) => {
    const val = mapMode === 'change' ? Math.abs(item.pctChange)
      : mapMode === 'volume' ? Math.abs(item.countDelta)
      : item.rate;
    const barW = Math.max(4, (val / (maxVal || 1)) * maxW);
    const hood = PRECINCT_NEIGHBORHOODS[item.precinct];
    const label = hood ? `${item.precinct.replace(' Precinct', '')} (${hood.split(',')[0]})` : item.precinct.replace(' Precinct', '');
    const displayVal = mapMode === 'change' ? `${item.pctChange > 0 ? '+' : ''}${item.pctChange.toFixed(1)}%`
      : mapMode === 'volume' ? `${item.countDelta > 0 ? '+' : ''}${item.countDelta.toLocaleString()}`
      : item.rate.toFixed(0);
    return (
      <div key={item.precinct} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded transition-colors" onClick={() => onSelect(item.precinct)}>
        <span className="text-[11px] font-bold text-gray-800 w-28 truncate flex-shrink-0" title={item.precinct}>{label}</span>
        <div className="flex-1 flex items-center gap-2">
          <div className="h-4 rounded-sm" style={{ width: `${(barW / maxW) * 100}%`, minWidth: 4, background: color }} />
          <span className="text-[11px] font-bold tabular-nums" style={{ color }}>{displayVal}</span>
        </div>
      </div>
    );
  };

  const topMax = mapMode === 'change' ? Math.abs(top5[0]?.pctChange || 1)
    : mapMode === 'volume' ? Math.abs(top5[0]?.countDelta || 1)
    : (top5[0]?.rate || 1);
  const botMax = mapMode === 'change' ? Math.abs(bottom5[0]?.pctChange || 1)
    : mapMode === 'volume' ? Math.abs(bottom5[0]?.countDelta || 1)
    : (top5[0]?.rate || 1);

  return (
    <div className="flex flex-col justify-between h-full">
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-1" style={{ color: VC.magenta }}>
          <TrendingUp size={12} /> {mapMode === 'change' ? 'Biggest % increases' : mapMode === 'volume' ? 'Biggest volume gains' : 'Highest rate (per 100k)'}
        </div>
        {top5.map(item => renderBar(item, VC.magenta, 200, topMax))}
      </div>
      <div className="mt-6 pt-4 border-t border-gray-100">
        <div className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-1" style={{ color: VC.green }}>
          <TrendingDown size={12} /> {mapMode === 'change' ? 'Biggest % decreases' : mapMode === 'volume' ? 'Biggest volume drops' : 'Lowest rate (per 100k)'}
        </div>
        {bottom5.map(item => renderBar(item, VC.green, 200, botMax))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* COMPSTAT LIVE CHARTS                                               */
/* ------------------------------------------------------------------ */
const DivergingBarChart = ({ data }) => {
  if (!data || data.length === 0) return null;
  const validData = data.filter(d => typeof d.pct === 'number' && d.pct !== null && (d.prior > 5 || d.current > 5));
  if (validData.length === 0) return null;
  const maxAbsPct = Math.max(...validData.map(d => Math.abs(d.pct)));
  const scaleMax = Math.max(10, maxAbsPct);
  const rowHeight = 34;
  const totalHeight = validData.length * rowHeight + 16;
  const NAME_COL = 140;
  const BAR_AREA = 180;
  const CENTER_X = NAME_COL + BAR_AREA;
  const VIEWBOX_WIDTH = CENTER_X + BAR_AREA + 60;
  const MAX_BAR_WIDTH = BAR_AREA - 10;
  return (
    <div className="w-full font-sans">
      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest border-b pb-2 mb-3 text-gray-400">
        <span>Trajectory (% Change vs Prior Yr)</span>
      </div>
      <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${totalHeight}`} className="w-full h-auto">
        <rect x={CENTER_X} y="0" width={BAR_AREA + 60} height={totalHeight} fill="#fff7ed" fillOpacity="0.35" />
        <rect x={NAME_COL} y="0" width={BAR_AREA} height={totalHeight} fill="#f0fdf4" fillOpacity="0.4" />
        <line x1={CENTER_X} y1="0" x2={CENTER_X} y2={totalHeight} stroke="#d1d5db" strokeWidth="1" />
        {validData.map((row, i) => {
          const y = i * rowHeight + 16;
          const isIncrease = row.pct > 0;
          const isSmallN = row.prior < VOLATILITY_THRESHOLD;
          const barWidth = (Math.abs(row.pct) / scaleMax) * MAX_BAR_WIDTH;
          const textColor = isIncrease ? VC.orange : VC.green;
          const labelOutside = barWidth < 36;
          const labelX = isIncrease
            ? (labelOutside ? CENTER_X + barWidth + 6 : CENTER_X + barWidth - 6)
            : (labelOutside ? CENTER_X - barWidth - 6 : CENTER_X - barWidth + 6);
          const labelAnchor = isIncrease
            ? (labelOutside ? "start" : "end")
            : (labelOutside ? "end" : "start");
          const labelFill = labelOutside ? textColor : '#ffffff';
          return (
            <g key={row.name}>
              <text x={NAME_COL - 8} y={y + 5} textAnchor="end" fontSize="13" fontWeight="bold" fill={VC.black} opacity={isSmallN ? 0.5 : 1}>{row.name}{isSmallN ? '*' : ''}</text>
              <rect x={isIncrease ? CENTER_X : CENTER_X - barWidth} y={y - 9} width={barWidth} height="20" fill={textColor} fillOpacity={isSmallN ? 0.3 : 1} rx="3" />
              <text x={labelX} y={y + 5} textAnchor={labelAnchor} fontSize="12" fontWeight="bold" fill={labelFill} opacity={isSmallN ? 0.5 : 1}>{formatPct(row.pct)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const UnifiedMagnitudeChart = ({ data, isTourist, citywideRates, activeGeo }) => {
  if (!data || data.length === 0) return null;
  const maxVal = Math.max(1, ...data.map(d => d.current || 0));
  const rowHeight = 34;
  const totalHeight = data.length * rowHeight + 16;
  const VIEWBOX_WIDTH = 680;
  const START_X = 130;
  const MAX_BAR_WIDTH = 280;
  return (
    <div className="w-full font-sans">
      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest border-b pb-2 mb-3 text-gray-400">
        <span>Incident Volume</span>
        <div className="hidden sm:flex items-center gap-3">
          <span className="flex items-center gap-1 text-[9px] font-bold" style={{color: VC.magenta}}><span className="w-1.5 h-1.5 rounded-full inline-block" style={{background: VC.magenta}}></span>Person</span>
          <span className="flex items-center gap-1 text-[9px] font-bold" style={{color: VC.indigo}}><span className="w-1.5 h-1.5 rounded-full inline-block" style={{background: VC.indigo}}></span>Property</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${totalHeight}`} className="w-full h-auto">
        {data.map((row, i) => {
          const y = i * rowHeight + 16;
          const barWidth = Math.max((row.current / maxVal) * MAX_BAR_WIDTH, 4);
          const color = VIOLENT_CRIMES.includes(row.name) ? VC.magenta : PROPERTY_CRIMES.includes(row.name) ? VC.indigo : VC.periwinkle;
          return (
            <g key={row.name}>
              <text x={START_X - 14} y={y + 5} textAnchor="end" fontSize="13" fontWeight="bold" fill={VC.black}>{row.name}</text>
              <rect x={START_X} y={y - 10} width={barWidth} height="22" fill={color} rx="3" />
              <text x={START_X + barWidth + 8} y={y + 5} fontSize="13" fontWeight="bold" fill={VC.black}>
                {row.current.toLocaleString()}
                {row.currentRate !== null && !isTourist && (
                  <tspan fontSize="11" fill={VC.charcoal} fontWeight="normal">{' '}({row.currentRate.toFixed(1)}/100k{activeGeo !== 'citywide' && citywideRates[row.name] !== undefined ? ` vs ${citywideRates[row.name].toFixed(1)} CW` : ''})</tspan>
                )}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* AI QUERY BOX                                                       */
/* ------------------------------------------------------------------ */
const CITYWIDE_QUESTIONS = [
  "How does this compare to the 1993 peak?",
  "What is the 30-year trend for murder?",
  "Which crimes correlate most strongly?",
  "Is the 78th Precinct safer than average?",
];

const LOCAL_QUESTIONS = [
  "Is this area safer or more dangerous than average?",
  "What's the biggest story here?",
  "Which crimes are rising fastest in this precinct?",
  "How does this compare to citywide trends?",
];

const QueryBox = ({ parsedData, activeGeo, activeTab, period, rawData }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);

  const suggestedQuestions = activeGeo === 'citywide' ? CITYWIDE_QUESTIONS : LOCAL_QUESTIONS;

  useEffect(() => {
    setQuery('');
    setError('');
    setHistory([]);
  }, [activeGeo, activeTab]);

  const buildContext = () => {
    const { totals, all, driver, localAnomaly, localBrightSpot } = parsedData;
    const periodStr = `${period?.week_start || ''} – ${period?.week_end || ''}`;
    const timeLabel = activeTab === 'ytd' ? 'year-to-date' : 'week-to-date';
    const geoLabel = activeGeo === 'citywide' ? 'Citywide (all of NYC)' : formatGeoName(activeGeo);

    const offenseLines = all.map(o =>
      `  ${o.name}: ${o.current.toLocaleString()} incidents (${formatPct(o.pct)} vs prior year${o.currentRate !== null ? `, ${o.currentRate.toFixed(1)}/100k residents` : ''})`
    ).join('\n');

    let precinctTable = '';
    if (activeGeo === 'citywide' && rawData) {
      const pctKeys = Object.keys(rawData).filter(k => k.includes('Precinct'));
      if (pctKeys.length > 0) {
        const lines = pctKeys.sort((a, b) => parseInt(a) - parseInt(b)).map(pct => {
          const d = rawData[pct];
          const pop = GEO_POPULATIONS[pct] || 0;
          const hood = PRECINCT_NEIGHBORHOODS[pct] || '';
          const felonies = d.seven_major_felonies || {};
          const addl = d.additional_stats || {};
          const crimes = { ...felonies, ...addl };
          let totalCur = 0, totalPri = 0;
          const crimeNums = Object.entries(crimes).map(([name, stats]) => {
            const periodData = activeTab === 'ytd' ? stats?.year_to_date : stats?.week_to_date;
            const cur = safeNum(periodData?.current_year);
            const pri = safeNum(periodData?.prior_year);
            const pctChg = periodData?.pct_change;
            if (felonies[name]) { totalCur += cur; totalPri += pri; }
            const chgStr = pctChg != null ? ` (${pctChg > 0 ? '+' : ''}${pctChg}%)` : '';
            return `${name}:${cur} vs ${pri}${chgStr}`;
          });
          const totalChg = totalPri > 0 ? (((totalCur - totalPri) / totalPri) * 100).toFixed(1) : '?';
          const rate = pop > 0 ? ((totalCur / pop) * 100000).toFixed(1) : '?';
          return `  ${pct} (${hood}): ${crimeNums.join(', ')} | Total 7 major: ${totalCur} vs ${totalPri} (${totalChg}%) | ${rate}/100k | Pop ~${formatPop(pop)}`;
        });
        precinctTable = `\n\nPRECINCT-LEVEL DATA (${timeLabel}):\n${lines.join('\n')}`;
      }
    }

    return `=== LIVE NYPD COMPSTAT DATA ===
Geography: ${geoLabel}
Timeframe: ${timeLabel} through ${periodStr}

SUMMARY TOTALS:
  Major index felonies: ${totals.mCur.toLocaleString()} (${formatPct(totals.mPct)} vs prior year's ${totals.mPri.toLocaleString()})
  Violent share: ${((totals.vCur / (totals.mCur || 1)) * 100).toFixed(0)}%
  Property share: ${((totals.pCur / (totals.mCur || 1)) * 100).toFixed(0)}%
  Murders: ${totals.murder}

ALL TRACKED OFFENSES:
${offenseLines}

${driver ? `PRIMARY DRIVER OF CHANGE: ${driver.name} accounts for ${driver.share.toFixed(0)}% of the overall shift` : ''}
${localAnomaly ? `LOCAL ANOMALY: ${localAnomaly.name} rate (${localAnomaly.localRate.toFixed(1)}/100k) is ${localAnomaly.ratio.toFixed(1)}x the citywide average` : ''}
${localBrightSpot ? `LOCAL BRIGHT SPOT: ${localBrightSpot.name} rate (${localBrightSpot.localRate.toFixed(1)}/100k) is ${((1 - localBrightSpot.ratio) * 100).toFixed(0)}% below citywide average` : ''}${precinctTable}

=== HISTORICAL DATASETS FOR CONTEXT (1993-2025) ===
If the user asks about historical context, refer to these reference arrays:
CITYWIDE: ${JSON.stringify(CW)}
PRECINCT: ${JSON.stringify(PC)}
`;
  };

  const handleQuery = async (q) => {
    const questionText = q || query;
    if (!questionText.trim()) return;
    
    setQuery('');
    setLoading(true);
    setError('');

    const dataContext = buildContext();
    const systemPrompt = `You are a concise, plain-language crime data analyst. You have access to BOTH current weekly/YTD CompStat data AND 30-year historical datasets (1993-2025). Answer directly and precisely — 2 to 4 sentences maximum. Cite specific numbers. When comparing precincts, use per-capita rates (per 100k residents). Never use bullet points or headers.

CRITICAL DATA RULES — violating these produces dangerous misinformation:
1. Each offense line shows: "Crime: X incidents (Y% vs prior year)". A NEGATIVE percentage means that crime is DOWN. A POSITIVE percentage means it is UP. Always check the sign before stating direction.
2. The first number (e.g. "52 incidents") is the TOTAL COUNT for the period, NOT the change. Never describe a count as an increase. The change is the percentage in parentheses.
3. When asked "what is going up" or "what is rising", list ONLY offenses with a POSITIVE percentage. When asked "what is going down" or "falling", list ONLY offenses with a NEGATIVE percentage.
4. Murder is frequently misread. Always double-check: if murder shows a negative percentage, murder is DOWN, period. State the count AND the direction clearly.
5. Never editorialize about which trends are "concerning" or "positive." Present the data and let the reader draw conclusions.`;

    const messages = [];
    history.forEach(h => {
      messages.push({ role: 'user', content: h.q });
      messages.push({ role: 'assistant', content: h.a });
    });
    messages.push({
      role: 'user',
      content: messages.length === 0
        ? `DATA:\n${dataContext}\n\nQUESTION: ${questionText}`
        : questionText
    });

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_tokens: 1000,
          system: systemPrompt,
          messages
        })
      });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();
      const text = data?.content?.[0]?.text || '';
      if (!text) throw new Error('Empty response');
      setHistory(prev => [...prev, { q: questionText, a: text }]);
    } catch (e) {
      console.error(e);
      setError('Unable to get a response. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleQuery(); }
  };

  return (
    <section className="mb-10 pt-8 border-t border-gray-200">
      <div className="flex items-center gap-2 mb-5">
        <Sparkles size={14} className="text-gray-400" />
        <span className="text-[11px] font-black uppercase tracking-[0.15em] text-gray-400">Ask About This Data</span>
      </div>

      {history.length > 0 && (
        <div className="mb-4 space-y-4">
          {history.map((h, i) => (
            <div key={i} className="border border-gray-100 rounded bg-gray-50 px-5 py-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-2">{h.q}</p>
              <p className="font-serif text-[15px] leading-relaxed text-gray-700">{h.a}</p>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="border border-gray-200 rounded bg-gray-50 px-5 py-5 mb-4">
          <p className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-3">{query}</p>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block animate-bounce" style={{animationDelay: `${i * 0.15}s`}} />
              ))}
            </div>
            <span className="text-[12px] text-gray-400 font-medium">Reading the data…</span>
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="border border-gray-200 rounded bg-gray-50 px-5 py-5 mb-4">
          <p className="font-serif text-[15px] text-red-600">{error}</p>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={history.length > 0
            ? "Ask a follow-up…"
            : `Ask anything about ${activeGeo === 'citywide' ? 'citywide crime' : formatGeoName(activeGeo)} data…`
          }
          className="flex-1 text-[13px] font-medium py-3 px-4 rounded border border-gray-300 bg-white focus:outline-none focus:border-black transition-colors placeholder-gray-400"
          disabled={loading}
        />
        <button onClick={() => handleQuery()} disabled={loading || !query.trim()} className="flex items-center gap-2 px-5 py-3 bg-black text-white text-[11px] font-black uppercase tracking-widest rounded disabled:opacity-30 hover:bg-gray-800 transition-colors">
          <Send size={13} /> Ask
        </button>
        {history.length > 0 && (
          <button onClick={() => { setQuery(''); setError(''); setHistory([]); }} className="flex items-center justify-center px-3 border border-gray-300 rounded bg-white hover:bg-gray-50 text-gray-500 hover:text-black transition-colors" title="Start over">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {suggestedQuestions.filter(q => !history.some(h => h.q === q)).slice(0, history.length > 0 ? 2 : 4).map(q => (
            <button key={q} onClick={() => { handleQuery(q); }} disabled={loading} className="text-[11px] font-medium text-gray-600 border border-gray-200 rounded-full px-3 py-1.5 hover:border-black hover:text-black transition-colors bg-white disabled:opacity-40">
              {q}
            </button>
          ))}
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* MAIN APP WITH VIEW ROUTING                                         */
/* ------------------------------------------------------------------ */
export default function App() {
  const [appView, setAppView] = useState('live');
  const [activeTab, setActiveTab] = useState('ytd');
  const [activeGeo, setActiveGeo] = useState('citywide');
  const [rawData, setRawData] = useState(FALLBACK_DATA);
  const [loading, setLoading] = useState(false);
  const [trendFilter, setTrendFilter] = useState('all');
  const [isLocating, setIsLocating] = useState(false);
  const [locateMsg, setLocateMsg] = useState("");
  const [geoFocused, setGeoFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [rtciData, setRtciData] = useState(null);

  // Map & AI summary state
  const [mapCrime, setMapCrime] = useState('all');
  const [mapMode, setMapMode] = useState('rate');
  const [weeklySummary, setWeeklySummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const summaryDataRef = useRef(null);

  // Scatter plot state for Historic view
  const [xM, setXM] = useState('pov');
  const [yM, setYM] = useState('ta');

  const loadReport = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    const RAW_URL = `https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/main/data/latest_compstat.json`;
    try {
      const resp = await fetch(`${RAW_URL}?t=${Date.now()}`);
      const json = await resp.json();
      if (json && json.citywide) { setRawData(json); return; }
    } catch (e1) {
      setFetchError(true);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadReport(); }, [loadReport]);

  // Fetch RTCI city comparison data
  useEffect(() => {
    fetch(RTCI_CSV_URL)
      .then(r => r.ok ? r.text() : Promise.reject('fetch failed'))
      .then(csv => {
        const parsed = parseRTCIcsv(csv);
        if (parsed) setRtciData(parsed);
      })
      .catch(() => {
        const fallbackMap = {};
        RTCI_FALLBACK.forEach(c => { fallbackMap[c.city] = c; });
        setRtciData({ cities: fallbackMap, period: RTCI_FALLBACK_PERIOD, updated: RTCI_FALLBACK_UPDATED });
      });
  }, []);

  const handleLocateUser = () => {
    if (!navigator.geolocation) { setLocateMsg("Location not supported"); return; }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const { latitude, longitude } = position.coords;
        const res = await fetch(`https://data.cityofnewyork.us/resource/78dh-3ptz.json?$where=intersects(the_geom, 'POINT(${longitude} ${latitude})')`);
        const data = await res.json();
        if (data && data.length > 0) {
          const pName = toOrdinalPrecinct(data[0].precinct);
          if (rawData[pName]) setActiveGeo(pName);
        }
      } catch (err) {}
      finally { setIsLocating(false); }
    });
  };

  const boroughs = useMemo(() => {
    return Object.keys(rawData).filter(k => k !== 'citywide' && !k.includes('Precinct')).sort();
  }, [rawData]);

  const geoSearchResults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const matchedBoroughs = boroughs.filter(b => !q || b.toLowerCase().includes(q));
    const matchedPrecincts = Object.entries(PRECINCT_NEIGHBORHOODS)
      .filter(([pct, hoods]) => !q || pct.toLowerCase().includes(q) || hoods.toLowerCase().includes(q))
      .map(([pct, hoods]) => ({ pct, hoods }));
    return { boroughs: matchedBoroughs, precincts: matchedPrecincts, showCitywide: !q || 'citywide'.includes(q) };
  }, [searchQuery, boroughs]);

  const parsedData = useMemo(() => {
    const geoData = rawData[activeGeo] || rawData['citywide'];
    const citywideData = rawData['citywide'];
    const pop = activeGeo === 'citywide' ? CITYWIDE_POPULATION : (GEO_POPULATIONS[activeGeo] || null);
    const extract = (obj) => Object.entries(obj || {}).map(([name, stats]) => {
      const current = activeTab === 'ytd' ? stats?.year_to_date?.current_year : stats?.week_to_date?.current_year;
      const prior = activeTab === 'ytd' ? stats?.year_to_date?.prior_year : stats?.week_to_date?.prior_year;
      const pct = activeTab === 'ytd' ? stats?.year_to_date?.pct_change : stats?.week_to_date?.pct_change;
      const c = safeNum(current); const p = safeNum(prior);
      return { name, current: c, prior: p, pct, diff: c - p, hist: stats?.historical || {}, currentRate: pop ? (c / pop) * 100000 : null };
    });
    const felonies = extract(geoData.seven_major_felonies).sort((a, b) => b.current - a.current);
    const minors = extract(geoData.additional_stats).sort((a, b) => b.current - a.current);
    const all = [...felonies, ...minors].sort((a, b) => b.current - a.current);
    
    let mCur = 0, mPri = 0, pCur = 0, vCur = 0, murder = 0, shootingVic = 0;
    felonies.forEach(f => {
      mCur += f.current; mPri += f.prior;
      if (f.name === 'Murder') murder = f.current;
      if (PROPERTY_CRIMES.includes(f.name)) pCur += f.current;
      if (VIOLENT_CRIMES.includes(f.name)) vCur += f.current;
    });
    minors.forEach(m => { if (m.name === 'Shooting Vic.') shootingVic = m.current; });

    const citywideRates = {};
    let cwMCur = 0;
    if (citywideData) {
      const cwFelonies = citywideData.seven_major_felonies || {};
      const cwAddl = citywideData.additional_stats || {};
      const cwAll = { ...cwFelonies, ...cwAddl };
      
      Object.entries(cwAll).forEach(([n, s]) => {
        const c = activeTab === 'ytd' ? s?.year_to_date?.current_year : s?.week_to_date?.current_year;
        citywideRates[n] = (safeNum(c) / CITYWIDE_POPULATION) * 100000;
      });

      Object.values(cwFelonies).forEach(stats => {
        const c = activeTab === 'ytd' ? stats?.year_to_date?.current_year : stats?.week_to_date?.current_year;
        cwMCur += safeNum(c);
      });
    }

    const mDiff = mCur - mPri;
    let driverObj = null;
    if (mDiff !== 0 && felonies.length > 0) {
      const d = felonies.reduce((p, c) => (Math.abs(c.diff) > Math.abs(p.diff) && Math.sign(c.diff) === Math.sign(mDiff)) ? c : p, {diff: 0});
      if (d && d.name) driverObj = { name: d.name, diff: d.diff, share: Math.abs((d.diff / mDiff) * 100) };
    }

    let topSurge = null, topDrop = null;
    felonies.forEach(f => {
      if (f.prior >= VOLATILITY_THRESHOLD) {
        if (f.pct > 0 && (!topSurge || f.pct > topSurge.pct)) topSurge = f;
        if (f.pct < 0 && (!topDrop || f.pct < topDrop.pct)) topDrop = f;
      }
    });

    let localAnomaly = null, localBrightSpot = null;
    if (activeGeo !== 'citywide' && pop && citywideData) {
      let maxRatio = 0, minRatio = Infinity;
      all.forEach(item => {
        if (item.currentRate !== null && citywideRates[item.name] && item.current >= 5) {
          const ratio = item.currentRate / citywideRates[item.name];
          if (ratio > maxRatio && ratio > 1.25) { maxRatio = ratio; localAnomaly = { name: item.name, localRate: item.currentRate, cityRate: citywideRates[item.name], ratio }; }
        }
      });
      felonies.forEach(item => {
        if (item.currentRate !== null && citywideRates[item.name] && item.prior >= 5) {
          const ratio = item.currentRate / citywideRates[item.name];
          if (ratio < minRatio && ratio < 0.75) { minRatio = ratio; localBrightSpot = { name: item.name, localRate: item.currentRate, cityRate: citywideRates[item.name], ratio }; }
        }
      });
    }
    
    return { 
      period: geoData.report_period || {}, 
      felonies, minors, all, driver: driverObj, citywideRates, localAnomaly, localBrightSpot, topSurge, topDrop,
      totals: { 
        mCur, mPri, pCur, vCur, 
        mPct: calcPct(mCur, mPri) ?? 0, 
        diff: mDiff, 
        murder, 
        shootingVic,
        citywideRate: (cwMCur / CITYWIDE_POPULATION) * 100000,
        lethalityRatio: murder > 0 ? (shootingVic / murder) : 0 
      } 
    };
  }, [rawData, activeTab, activeGeo]);

  const hotspots = useMemo(() => {
    const keys = Object.keys(rawData).filter(k => k !== 'citywide' && k.includes('Precinct'));
    let volumes = [], allPrecinctCrimes = [];
    keys.forEach(pct => {
      const data = rawData[pct]; let vSum = 0;
      Object.entries(data.seven_major_felonies || {}).forEach(([crime, stats]) => {
        const c = safeNum(activeTab === 'ytd' ? stats?.year_to_date?.current_year : stats?.week_to_date?.current_year);
        const p = safeNum(activeTab === 'ytd' ? stats?.year_to_date?.prior_year : stats?.week_to_date?.prior_year);
        if (VIOLENT_CRIMES.includes(crime)) vSum += c;
        if (p >= VOLATILITY_THRESHOLD) allPrecinctCrimes.push({ precinct: pct, crime, pct: ((c - p) / p) * 100, current: c, prior: p });
      });
      volumes.push({ precinct: pct, violent: vSum });
    });
    const sortedV = [...volumes].filter(v => v.violent > 0).sort((a,b) => b.violent - a.violent);
    let inequality = null;
    if (sortedV.length > 10) {
      const top5 = sortedV.slice(0, 5); const top5Sum = top5.reduce((s, p) => s + p.violent, 0); const top5Pop = top5.reduce((s, p) => s + (GEO_POPULATIONS[p.precinct] || 0), 0);
      let bottomSum = 0, bottomCount = 0, bottomPop = 0;
      for (let i = sortedV.length - 1; i >= 0 && bottomSum < top5Sum; i--) { bottomSum += sortedV[i].violent; bottomCount++; bottomPop += (GEO_POPULATIONS[sortedV[i].precinct] || 0); }
      inequality = { topCount: 5, topSum: top5Sum, topPop: top5Pop, bottomCount, bottomPop };
    }
    allPrecinctCrimes.sort((a, b) => b.pct - a.pct);
    return { inequality, topPctSpike: allPrecinctCrimes[0], topPctDrop: allPrecinctCrimes[allPrecinctCrimes.length - 1] };
  }, [rawData, activeTab]);

  const isTouristPrecinct = TOURIST_PRECINCTS.includes(activeGeo);
  const activePop = GEO_POPULATIONS[activeGeo] || (activeGeo === 'citywide' ? CITYWIDE_POPULATION : null);
  const formattedMPct = typeof parsedData.totals.mPct === 'number' ? Number(Math.abs(parsedData.totals.mPct)).toFixed(1) : '0.0';

  // Compute per-100k rates for all precincts (for map + ranking bars)
  const precinctRates = useMemo(() => {
    const precinctKeys = Object.keys(rawData).filter(k => k.includes('Precinct'));
    return precinctKeys.map(pct => {
      const pop = GEO_POPULATIONS[pct];
      const d = rawData[pct];
      const felonies = d.seven_major_felonies || {};
      const addl = d.additional_stats || {};
      let count = 0, priorCount = 0;
      const getCurrent = (stats) => safeNum(activeTab === 'ytd' ? stats?.year_to_date?.current_year : stats?.week_to_date?.current_year);
      const getPrior = (stats) => safeNum(activeTab === 'ytd' ? stats?.year_to_date?.prior_year : stats?.week_to_date?.prior_year);
      if (mapCrime === 'all') {
        Object.values(felonies).forEach(s => { count += getCurrent(s); priorCount += getPrior(s); });
      } else if (mapCrime === 'violent') {
        ['Murder', 'Rape', 'Robbery', 'Fel. Assault'].forEach(c => { if (felonies[c]) { count += getCurrent(felonies[c]); priorCount += getPrior(felonies[c]); } });
      } else if (mapCrime === 'property') {
        ['Burglary', 'Gr. Larceny', 'G.L.A.'].forEach(c => { if (felonies[c]) { count += getCurrent(felonies[c]); priorCount += getPrior(felonies[c]); } });
      } else {
        const all = { ...felonies, ...addl };
        if (all[mapCrime]) { count = getCurrent(all[mapCrime]); priorCount = getPrior(all[mapCrime]); }
      }
      const precinctNum = pct.replace(/\D+/g, '').replace(/^0+/, '');
      const pctChange = priorCount > 0 ? ((count - priorCount) / priorCount) * 100 : null;
      return { precinct: pct, precinctNum, rate: pop ? (count / pop) * 100000 : null, count, priorCount, pctChange, isTourist: TOURIST_PRECINCTS.includes(pct) };
    });
  }, [rawData, activeTab, mapCrime]);

  // Story of the Week: auto-generate AI summary on data load (citywide only)
  useEffect(() => {
    if (activeGeo !== 'citywide') return;
    const dataKey = JSON.stringify(parsedData.totals);
    if (summaryDataRef.current === dataKey) return;
    summaryDataRef.current = dataKey;
    const run = async () => {
      setSummaryLoading(true);
      try {
        const isYTD = activeTab === 'ytd';
        const timeframe = isYTD
          ? `YEAR-TO-DATE through ${parsedData.period?.week_end || 'latest reporting week'}, compared to the same period last year`
          : `WEEK of ${parsedData.period?.week_start || '?'} to ${parsedData.period?.week_end || '?'}, compared to the same week last year`;
        const ctx = [
          `TIMEFRAME: ${timeframe}`,
          `All numbers below refer to this exact timeframe unless otherwise noted.`,
          ``,
          `Total major index: ${parsedData.totals.mCur.toLocaleString()} (${parsedData.totals.mPct > 0 ? '+' : ''}${parsedData.totals.mPct.toFixed(1)}% vs same period prior year)`,
          `Violent: ${parsedData.totals.vCur.toLocaleString()}, Property: ${parsedData.totals.pCur.toLocaleString()}`,
          parsedData.driver ? `Primary driver: ${parsedData.driver.name} (${parsedData.driver.share.toFixed(0)}% of overall shift)` : '',
          `Murder: ${parsedData.totals.murder}, Shooting victims: ${parsedData.totals.shootingVic}`,
          hotspots?.topPctSpike ? `Biggest precinct spike: ${hotspots.topPctSpike.crime} in ${hotspots.topPctSpike.precinct} (+${hotspots.topPctSpike.pct.toFixed(1)}%)` : '',
          hotspots?.topPctDrop ? `Biggest precinct drop: ${hotspots.topPctDrop.crime} in ${hotspots.topPctDrop.precinct} (${hotspots.topPctDrop.pct.toFixed(1)}%)` : '',
          hotspots?.inequality ? `Top 5 violent precincts (${formatPop(hotspots.inequality.topPop)} residents) match crime total of ${hotspots.inequality.bottomCount} safest precincts (${formatPop(hotspots.inequality.bottomPop)} residents)` : '',
          'Key offenses: ' + parsedData.felonies.map(f => `${f.name}: ${f.current.toLocaleString()} (${f.pct > 0 ? '+' : ''}${(f.pct || 0).toFixed(1)}%)`).join(', '),
        ].filter(Boolean).join('\n');
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            max_tokens: 250,
            system: `You are a concise NYC crime data analyst writing for a data-literate audience. Write exactly 2 sentences.

SENTENCE 1: State the single most newsworthy pattern for the timeframe, and explicitly name the timeframe at the start or end of the sentence (e.g. "Year-to-date through [date]…" or "For the week of [date]…"). Never say "this week" if the timeframe is year-to-date, and never say "year-to-date" if the timeframe is a single week.

SENTENCE 2: Add essential context or a striking contrast.

Rules: Cite only numbers that appear in the provided data. Never invent or paraphrase numbers. Do not reference a timeframe other than the one specified. No bullet points, no headers, no hedging.`,
            messages: [{ role: 'user', content: `CompStat summary data:\n${ctx}\n\nWrite the 2-sentence headline summary, explicitly naming the timeframe in sentence 1.` }]
          })
        });
        if (res.ok) {
          const data = await res.json();
          setWeeklySummary(data?.content?.[0]?.text || '');
        }
      } catch (e) { /* silent fail — summary is supplemental */ }
      finally { setSummaryLoading(false); }
    };
    run();
  }, [parsedData, hotspots, activeGeo]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildTrendCards = () => {
    const cards = [];
    const { driver, localAnomaly, localBrightSpot, topSurge, topDrop, totals } = parsedData;
    if (activeGeo === 'citywide') {
      if (driver) {
        const driverShareText = driver.diff > 0
          ? `The overall surge was largely driven by **${driver.name}** index offenses, which account for **${driver.share.toFixed(0)}%** of the total citywide upward shift.`
          : `Nearly **${driver.share.toFixed(0)}%** of the total citywide drop in major index offenses can be attributed to **${driver.name}**, which saw **${Math.abs(driver.diff).toLocaleString()} fewer cases** than last year.`;
        const shareW = Math.min(100, driver.share);
        cards.push({ id: 'driver', icon: Target, title: 'Primary Driver', content: driverShareText,
          dataViz: (
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gray-900" style={{ width: `${shareW}%` }} />
              </div>
              <span className="text-[10px] font-black text-gray-900 tabular-nums">{driver.share.toFixed(0)}%</span>
            </div>
          )
        });
      }



      if (hotspots?.topPctSpike || hotspots?.topPctDrop) {
        const flashContent = (
          <ul className="space-y-3 mt-1 text-[14px]">
            {hotspots.topPctSpike && <li>{`In **${formatGeoName(hotspots.topPctSpike.precinct)}**, **${hotspots.topPctSpike.crime}** offenses have spiked by **${hotspots.topPctSpike.pct.toFixed(1)}%**.`}</li>}
            {hotspots.topPctDrop && <li className="pt-2 border-t border-gray-100">{`In **${formatGeoName(hotspots.topPctDrop.precinct)}**, **${hotspots.topPctDrop.crime}** offenses have fallen by **${Math.abs(hotspots.topPctDrop.pct).toFixed(1)}%**.`}</li>}
          </ul>
        );
        cards.push({ id: 'flashpoints', icon: MapPin, title: 'Significant Local Shifts', content: flashContent });
      }
      const lethalDots = Math.round(totals.lethalityRatio);
      cards.push({ id: 'lethality', icon: AlertCircle, title: 'The Lethality Gap', content: `For every **1 homicide**, there were **${totals.lethalityRatio.toFixed(1)} shooting victims**. (A widening gap often points to improved trauma care rather than fewer street shootings).`,
        dataViz: (
          <div className="mt-3 flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-gray-900 flex-shrink-0" title="1 homicide" />
            <span className="text-[10px] font-bold text-gray-400 mx-0.5">:</span>
            {Array.from({ length: lethalDots }).map((_, i) => (
              <div key={i} className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: VC.orange, opacity: 0.7 + (i / lethalDots) * 0.3 }} title="shooting victim" />
            ))}
            {totals.lethalityRatio % 1 > 0.3 && <div className="w-3 h-3 rounded-full flex-shrink-0 opacity-40" style={{ background: VC.orange }} />}
          </div>
        )
      });
    } else {
      if (driver && driver.share >= 25) cards.push({ id: 'local_driver', icon: Target, title: 'Local Driver', content: `The change in **${driver.name}** volume accounts for **${driver.share.toFixed(0)}%** of this area's trajectory.` });
      if (localAnomaly && !isTouristPrecinct) cards.push({ id: 'anomaly', icon: AlertTriangle, title: 'Elevated Local Risk', content: `The rate for **${localAnomaly.name}** here is **${localAnomaly.localRate.toFixed(1)} per 100k residents**, which is **${localAnomaly.ratio.toFixed(1)}x** higher than the citywide average (${localAnomaly.cityRate.toFixed(1)}).` });
      else if (topSurge && topSurge.pct > 0) cards.push({ id: 'surge', icon: TrendingUp, title: 'Local Trajectory', content: `**${topSurge.name}** index offenses have increased by **${topSurge.pct.toFixed(1)}%** compared to last year.` });
      if (localBrightSpot && !isTouristPrecinct) cards.push({ id: 'brightspot', icon: ShieldCheck, title: 'Local Bright Spot', content: `The rate of **${localBrightSpot.name}** offenses here sits **${((1 - localBrightSpot.ratio)*100).toFixed(0)}% below** the citywide average.` });
      else if (topDrop && topDrop.pct < 0) cards.push({ id: 'drop', icon: TrendingDown, title: 'Local Trajectory', content: `**${topDrop.name}** index offenses have fallen by **${Math.abs(topDrop.pct).toFixed(1)}%** here compared to last year.` });
    }
    return cards;
  };

  const trendCards = buildTrendCards();
  const risingOffenses = useMemo(() => parsedData.all.filter(o => o.pct > 0).sort((a, b) => b.pct - a.pct) || [], [parsedData.all]);
  const fallingOffenses = useMemo(() => parsedData.all.filter(o => o.pct < 0).sort((a, b) => a.pct - b.pct) || [], [parsedData.all]);

  // Historic View Memos
  const vp = useMemo(()=>{const vC=['FA','MU','RA','RO'],pC=['BU','GA','GL'];return CW.map(d=>({y:d.y,violent:vC.reduce((s,c)=>s+d[c],0),property:pC.reduce((s,c)=>s+d[c],0)}));},[]);
  const idx = useMemo(()=>{const b=CW[0];return CW.map(d=>{const o={y:d.y};K7.forEach(c=>{o[c]=d[c]/b[c]*100;});return o;});},[]);
  const assaultD = useMemo(()=>CW.filter(d=>d.y>=2000&&d.y<=2024).map(d=>{const ma=MA_CW[d.y]||0;return{y:d.y,fa:d.FA,ma,total:d.FA+ma,faPct:d.FA/(d.FA+ma)*100};}),[]);
  const sd = useMemo(()=>PC.filter(p=>p.n!=='14th').map(p=>({...p,x:p[xM],y:p[yM]})), [xM, yM]);
  const ms = [{k:'pov',l:'Poverty %'},{k:'ta',l:'Total assault'},{k:'fa',l:'Felony assault'},{k:'ma',l:'Misd. assault'},{k:'sh',l:'Shootings'},{k:'ha',l:'Harassment'},{k:'pl',l:'Petit larceny'},{k:'gl',l:'Grand larceny'},{k:'fs',l:'Felony share %'}];

  // ==========================================
  // HISTORIC VIEW RENDER
  // ==========================================
  if (appView === 'historic') {
    return (
      <div className="min-h-screen bg-white text-black font-sans pb-20">
        
        {/* Header */}
        <div className="bg-[#050507] text-white pt-12 pb-16 px-5 sm:px-8">
           <div className="max-w-[1100px] mx-auto">
              <button onClick={() => setAppView('live')} className="text-gray-400 hover:text-white uppercase tracking-widest text-[11px] font-bold flex items-center gap-2 mb-8 transition-colors"><ArrowLeft size={14}/> Back to Live Dashboard</button>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 leading-tight font-serif">The 30-Year Transformation of NYC Crime</h1>
              <p className="text-lg text-gray-400 font-serif max-w-3xl leading-relaxed">Beyond the weekly CompStat fluctuations lies a deeper story. Over three decades, the volume, composition, and geographic distribution of crime in New York City has fundamentally rewritten itself.</p>
           </div>
        </div>

        <div className="max-w-[1100px] mx-auto px-5 sm:px-8 pt-12 space-y-24">

          {/* Section 1: The Macro Trend */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-center">
            <div className="lg:col-span-1 space-y-4">
               <div className="text-[#ff7c53] text-[10px] font-black uppercase tracking-widest">Macro Volume</div>
               <h2 className="text-2xl font-black leading-snug">The Great Decline & The Modern Rebound</h2>
               <p className="text-gray-600 font-serif text-[15px] leading-relaxed">From 1993 to 2019, major index crime collapsed. But the decline wasn't uniform. Violent crime leveled off around 2010, while property crime continued to fall. A post-2019 surge pushed violent crime upward through 2024, but murder has fallen every year since its 2021 spike and the broader violent index has begun declining.</p>
            </div>
            <div className="lg:col-span-2 h-[350px]">
               <ResponsiveContainer width="100%" height="100%">
                <LineChart data={vp.filter(d=>d.y>=2000)} margin={{top:5,right:5,left:10,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false}/>
                  <XAxis dataKey="y" tick={{fontSize:10}} stroke="#999" axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:10}} stroke="#999" tickFormatter={v=>`${(v/1000).toFixed(0)}K`} axisLine={false} tickLine={false}/>
                  <Tooltip content={({active,payload,label})=>{if(!active||!payload?.length)return null;return <div className="bg-white border border-gray-200 p-3 text-[11px] shadow-lg"><div className="font-bold mb-1">{label}</div>{payload.map((p,i)=><div key={i} style={{color:p.color}}>{p.name}: <strong className="text-black">{p.value.toLocaleString()}</strong></div>)}</div>;}}/>
                  <Line type="monotone" dataKey="violent" name="Violent Index" stroke="#e7466d" strokeWidth={3} dot={false}/>
                  <Line type="monotone" dataKey="property" name="Property Index" stroke="#394882" strokeWidth={3} dot={false}/>
                  <Legend wrapperStyle={{fontSize:11}} iconType="circle"/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Section 2: Crime DNA (100% Stacked) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-center border-t border-gray-100 pt-16">
            <div className="lg:col-span-2 h-[350px] order-2 lg:order-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={CW} stackOffset="expand" margin={{top:5,right:0,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false}/>
                  <XAxis dataKey="y" tick={{fontSize:10}} stroke="#999" axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:10}} stroke="#999" tickFormatter={v=>`${(v*100).toFixed(0)}%`} axisLine={false} tickLine={false}/>
                  <Tooltip content={({active,payload,label})=>{if(!active||!payload?.length)return null;return <div className="bg-white border border-gray-200 p-3 text-[11px] shadow-lg"><div className="font-bold mb-2">{label} Profile</div>{[...payload].reverse().map((p,i)=><div key={i} className="flex justify-between gap-4"><span style={{color:p.color}}>{CL[p.dataKey]}</span><span className="font-bold text-black">{(p.value*100).toFixed(1)}%</span></div>)}</div>;}}/>
                  {K7.map(c=><Area key={c} type="monotone" dataKey={c} stackId="1" fill={CC[c]} stroke={CC[c]} fillOpacity={0.9}/>)}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="lg:col-span-1 space-y-4 order-1 lg:order-2">
               <div className="text-[#e7466d] text-[10px] font-black uppercase tracking-widest">Composition</div>
               <h2 className="text-2xl font-black leading-snug">The DNA of Crime Has Mutated</h2>
               <p className="text-gray-600 font-serif text-[15px] leading-relaxed">In 1993, Burglary and Auto Theft made up half of all major crime. Today, they account for barely a fifth. Meanwhile, Grand Larceny and Felony Assault have consumed the chart, now making up 64% of the entire index.</p>
               <div className="flex flex-wrap gap-x-3 gap-y-2 mt-4">
                 {K7.map(c=><div key={c} className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-wider"><div className="w-2 h-2 rounded-sm" style={{background:CC[c]}}/>{CL[c]}</div>)}
               </div>
            </div>
          </div>

          {/* Section 3: Divergence */}
          <div className="border-t border-gray-100 pt-16 space-y-6">
             <div className="max-w-3xl">
               <div className="text-[#394882] text-[10px] font-black uppercase tracking-widest">Divergence</div>
               <h2 className="text-2xl font-black leading-snug mb-3">Seven Crimes, Seven Trajectories</h2>
               <p className="text-gray-600 font-serif text-[15px] leading-relaxed">If we index all crimes to their 1993 levels (where 1993 = 100), the divergence is stark. Property crimes like auto theft collapsed by nearly 90%. Murder fell 84%. But felony assault dropped only 27% at its lowest point and has since climbed back to become the statistical outlier, plateauing near its pre-decline levels.</p>
             </div>
             <div className="h-[450px] w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={idx} margin={{top:5,right:5,left:-10,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false}/>
                    <XAxis dataKey="y" tick={{fontSize:10}} stroke="#999" axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:10}} stroke="#999" domain={[0,160]} axisLine={false} tickLine={false}/>
                    <ReferenceLine y={100} stroke="#050507" strokeDasharray="4 4" strokeOpacity={0.3}/>
                    <Tooltip content={({active,payload,label})=>{if(!active||!payload?.length)return null;const s=[...payload].sort((a,b)=>b.value-a.value);return <div className="bg-white border border-gray-200 p-3 text-[11px] shadow-lg"><div className="font-bold mb-2">{label} (vs 1993)</div>{s.map((p,i)=><div key={i} className="flex justify-between gap-4"><span style={{color:p.color}}>{CL[p.dataKey]}</span><span className="font-bold text-black">{Number(p.value).toFixed(0)}</span></div>)}</div>;}}/>
                    {K7.map(c=><Line key={c} type="monotone" dataKey={c} stroke={CC[c]} strokeWidth={c==='FA'?4:1.5} strokeOpacity={c==='FA'?1:0.3} dot={false}/>)}
                  </LineChart>
                </ResponsiveContainer>
             </div>
          </div>

          {/* Section 4: The Assault Anomaly */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 border-t-[3px] border-black pt-16">
            <div className="space-y-4">
               <div className="text-[#050507] text-[10px] font-black uppercase tracking-widest">Classification Shift</div>
               <h2 className="text-2xl font-black leading-snug">The Assault Anomaly</h2>
               <p className="text-gray-600 font-serif text-[15px] leading-relaxed mb-4">While felony assault dominates headlines, misdemeanor assault outnumbers it 1.6 to 1. In 2015, misdemeanor assaults dropped 21% overnight while felonies didn't budge—a clear indicator of classification changes rather than behavioral shifts.</p>
               <p className="text-gray-600 font-serif text-[15px] leading-relaxed">From 2020 to 2024, both categories rose in lockstep for the first time in the dataset, suggesting a genuine increase in violent contact rather than just administrative drift. That parallel rise has since leveled off, with misdemeanor assaults declining in 2025.</p>
            </div>
            <div className="h-[350px]">
               <ResponsiveContainer width="100%" height="100%">
                <BarChart data={assaultD} margin={{top:5,right:5,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false}/>
                  <XAxis dataKey="y" tick={{fontSize:10}} stroke="#999" axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:10}} stroke="#999" tickFormatter={v=>`${(v/1000).toFixed(0)}K`} axisLine={false} tickLine={false}/>
                  <Tooltip content={({active,payload})=>{if(!active||!payload?.length)return null;const d=payload[0]?.payload;return <div className="bg-white border border-gray-200 p-3 text-[11px] shadow-lg"><div className="font-bold mb-2">{d.y} Assaults</div><div className="text-[#ff7c53]">Misdemeanor: {d.ma.toLocaleString()}</div><div className="text-[#e7466d]">Felony: {d.fa.toLocaleString()}</div><div className="font-bold text-black mt-2 pt-2 border-t border-gray-100">Total: {d.total.toLocaleString()}</div></div>;}}/>
                  <Bar dataKey="ma" stackId="a" fill="#ff7c53" fillOpacity={0.6} name="Misdemeanor" />
                  <Bar dataKey="fa" stackId="a" fill="#e7466d" fillOpacity={0.9} name="Felony" />
                  <Legend wrapperStyle={{fontSize:11}} iconType="circle"/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Section 5: Precinct Scatter */}
          <div className="border-t border-gray-200 pt-16 space-y-8">
             <div className="flex flex-col md:flex-row justify-between md:items-end gap-6">
               <div className="max-w-2xl space-y-4">
                 <div className="text-[#9b9fbc] text-[10px] font-black uppercase tracking-widest">Geographic Reality</div>
                 <h2 className="text-2xl font-black leading-snug">The Complex Geography of Crime</h2>
                 <p className="text-gray-600 font-serif text-[15px] leading-relaxed">Mapping the 76 standard precincts reveals distinct statistical clusters. In this specific dataset, poverty rates correlate strongly with violence (shootings, murder, felony assault). Conversely, theft (grand and petit larceny) shows virtually zero correlation with poverty, mapping closer to commercial density and foot traffic.</p>
               </div>
               
               {/* Controls */}
               <div className="flex flex-wrap gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200 self-start md:self-end">
                 <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1.5">X-Axis</label>
                   <select value={xM} onChange={e=>setXM(e.target.value)} className="bg-white border border-gray-300 text-xs py-1.5 px-2 rounded focus:outline-none focus:border-black">
                     {ms.map(m=><option key={m.k} value={m.k}>{m.l}</option>)}
                   </select>
                 </div>
                 <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1.5">Y-Axis</label>
                   <select value={yM} onChange={e=>setYM(e.target.value)} className="bg-white border border-gray-300 text-xs py-1.5 px-2 rounded focus:outline-none focus:border-black">
                     {ms.map(m=><option key={m.k} value={m.k}>{m.l}</option>)}
                   </select>
                 </div>
               </div>
             </div>
             
             <div className="h-[500px] w-full bg-white">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{top:10,right:10,left:10,bottom:10}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                    <XAxis dataKey="x" type="number" tick={{fontSize:10}} stroke="#999" name={ms.find(m=>m.k===xM)?.l} label={{value:ms.find(m=>m.k===xM)?.l,position:'bottom',fontSize:11,fill:'#555',offset:-5, fontWeight:'bold'}}/>
                    <YAxis dataKey="y" type="number" tick={{fontSize:10}} stroke="#999" name={ms.find(m=>m.k===yM)?.l} label={{value:ms.find(m=>m.k===yM)?.l,angle:-90,position:'insideLeft',fontSize:11,fill:'#555', fontWeight:'bold'}}/>
                    <Tooltip content={({active,payload})=>{if(!active||!payload?.length)return null;const d=payload[0].payload;return <div className="bg-white border border-gray-200 p-3 text-[11px] shadow-lg"><div className="font-bold text-black mb-2 pb-2 border-b border-gray-100">{d.n} Precinct</div><div className="text-gray-600 mb-1">{ms.find(m=>m.k===xM)?.l}: <span className="font-bold text-black">{d.x}</span></div><div className="text-gray-600">{ms.find(m=>m.k===yM)?.l}: <span className="font-bold text-black">{d.y}</span></div></div>;}}/>
                    <Scatter data={sd} fill="#e7466d" fillOpacity={0.6} stroke="#e7466d" strokeOpacity={0.3}/>
                  </ScatterChart>
                </ResponsiveContainer>
             </div>
          </div>

          <div className="mt-8 overflow-x-auto">
            <table className="border-collapse text-[11px] w-full min-w-[680px]">
              <thead>
                <tr>
                  <th className="text-left p-2 border-b-2 border-[#050507] text-[10px]">Quartile</th>
                  <th className="text-center p-2 border-b-2 border-[#050507] text-[10px]">Poverty</th>
                  <th className="text-center p-2 border-b-2 border-[#050507] text-[10px] text-[#e7466d]">Fel. Aslt (per 100k)</th>
                  <th className="text-center p-2 border-b-2 border-[#050507] text-[10px] text-[#217ebe]">Grand Larc (per 100k)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {q:'Q1: Lowest',pov:'8.4%',fa:180,gl:651},
                  {q:'Q2: Low-mid',pov:'13.3%',fa:400,gl:948},
                  {q:'Q3: Mid-high',pov:'19.0%',fa:353,gl:492},
                  {q:'Q4: Highest',pov:'30.3%',fa:607,gl:653},
                ].map((q,i)=>(
                  <tr key={i} className={`border-b border-gray-100 ${i===3 ? 'bg-red-50/50' : ''}`}>
                    <td className="p-2 font-semibold">{q.q}</td>
                    <td className="text-center p-2 font-bold">{q.pov}</td>
                    <td className="text-center p-2 font-bold text-[#e7466d]">{q.fa}</td>
                    <td className="text-center p-2 font-bold text-[#217ebe]">{q.gl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Unified AI Query Box */}
          <div className="pt-12 mt-20 border-t border-gray-200">
             <QueryBox parsedData={parsedData} activeGeo={activeGeo} activeTab={activeTab} period={parsedData.period} rawData={rawData} />
          </div>

        </div>
      </div>
    );
  }

  // ==========================================
  // LIVE COMPSTAT DASHBOARD RENDER
  // ==========================================
  return (
    <div className="min-h-screen pb-12 font-sans bg-white text-black text-[15px]">
      <div className="max-w-[1100px] mx-auto px-5 sm:px-8">

        <header className="pt-6 pb-3 mb-6 border-b border-gray-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-black uppercase tracking-widest text-black">NYPD CompStat Ledger</span>
            <span className="text-gray-300">•</span>
            <span className="text-[12px] font-medium text-gray-500 tabular-nums">{parsedData.period?.week_start || 'N/A'} – {parsedData.period?.week_end || 'N/A'}</span>
            <button onClick={loadReport} className="ml-2 text-gray-400 hover:text-black transition-colors"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></button>
            {fetchError && <span className="text-[10px] font-medium text-gray-400 uppercase tracking-widest">Using embedded data</span>}
            <div className="relative ml-1">
              <button onClick={() => setShowHelp(!showHelp)} className={`text-gray-400 hover:text-black transition-colors ${showHelp ? 'text-black' : ''}`}><Info size={14} /></button>
              {showHelp && <div className="absolute top-full left-0 mt-3 w-72 bg-white border border-gray-200 shadow-2xl rounded p-4 z-50">
                <div className="flex justify-between mb-3"><h4 className="font-black text-black uppercase tracking-widest text-[10px]">How to use this tool</h4><button onClick={() => setShowHelp(false)} className="text-gray-400 hover:text-black font-bold px-2">&times;</button></div>
                <ul className="space-y-3 text-[13px] text-gray-600 font-serif">
                  <li>Use dropdown or search to zoom to a precinct.</li>
                  <li>View per-capita rates next to volume for context.</li>
                  <li>Faded rows indicate sample sizes under 30 (high volatility).</li>
                  <li>Use the query box to ask plain-language questions about whatever data is in view.</li>
                </ul>
              </div>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto relative z-20">
            <div className="flex flex-1 md:w-72 relative min-w-[200px]">
              <div className="flex gap-2 w-full">
                <div className="relative flex-1">
                  <SearchIcon size={14} className="absolute left-3 top-[11px] pointer-events-none text-gray-400" />
                  <input
                    type="text"
                    placeholder={geoFocused ? "Search neighborhood or precinct..." : ""}
                    value={geoFocused ? searchQuery : (activeGeo === 'citywide' ? 'Citywide' : formatGeoName(activeGeo))}
                    onChange={e => setSearchQuery(e.target.value)}
                    onFocus={e => { setGeoFocused(true); setSearchQuery(''); e.target.value = ''; }}
                    onBlur={() => setTimeout(() => { setGeoFocused(false); setSearchQuery(''); }, 200)}
                    className={`w-full text-[11px] font-black uppercase tracking-wider py-2.5 pl-9 pr-4 rounded border bg-white focus:outline-none ${geoFocused ? 'border-indigo-400' : 'border-gray-300'}`}
                  />
                  {geoFocused && (
                    <div className="absolute top-full left-0 w-full mt-1 bg-white border border-gray-200 shadow-xl rounded z-50 max-h-72 overflow-y-auto">
                      {geoSearchResults.showCitywide && (
                        <button onMouseDown={() => { setActiveGeo('citywide'); setGeoFocused(false); setSearchQuery(''); }} className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-100 ${activeGeo === 'citywide' ? 'bg-gray-50 font-black' : ''}`}>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-black">Citywide</div>
                        </button>
                      )}
                      {geoSearchResults.boroughs.length > 0 && (
                        <>
                          <div className="px-3 pt-2 pb-1 text-[9px] font-black uppercase tracking-widest text-gray-400">Boroughs</div>
                          {geoSearchResults.boroughs.map(b => (
                            <button key={b} onMouseDown={() => { setActiveGeo(b); setGeoFocused(false); setSearchQuery(''); }} className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${activeGeo === b ? 'bg-gray-50 font-black' : ''}`}>
                              <div className="text-[11px] font-bold uppercase tracking-wider text-black">{b}</div>
                            </button>
                          ))}
                        </>
                      )}
                      {geoSearchResults.precincts.length > 0 && (
                        <>
                          <div className="px-3 pt-2 pb-1 text-[9px] font-black uppercase tracking-widest text-gray-400 border-t border-gray-100">Precincts</div>
                          {geoSearchResults.precincts.map(r => (
                            <button key={r.pct} onMouseDown={() => { setActiveGeo(r.pct); setGeoFocused(false); setSearchQuery(''); }} className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${activeGeo === r.pct ? 'bg-gray-50' : ''}`}>
                              <div className="text-[12px] font-bold text-black">{r.pct}</div>
                              <div className="text-[10px] text-gray-500">{r.hoods}</div>
                            </button>
                          ))}
                        </>
                      )}
                      {!geoSearchResults.showCitywide && geoSearchResults.boroughs.length === 0 && geoSearchResults.precincts.length === 0 && (
                        <div className="px-3 py-3 text-sm text-gray-500">No matches found.</div>
                      )}
                    </div>
                  )}
                </div>
                <button onClick={handleLocateUser} disabled={isLocating} title="Find my precinct" className="flex items-center justify-center px-3 border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50">{isLocating ? <RefreshCw size={14} className="animate-spin" /> : <Navigation size={14} />}</button>
              </div>
              {locateMsg && <span className="absolute -bottom-5 left-0 text-[10px] font-bold uppercase tracking-widest text-indigo-600">{locateMsg}</span>}
            </div>
            <div className="flex border border-black rounded overflow-hidden shrink-0">
              <button onClick={() => setActiveTab('wtd')} className={`px-6 py-2 text-[10px] font-black uppercase tracking-widest ${activeTab === 'wtd' ? 'bg-black text-white' : 'bg-white'}`}>Weekly</button>
              <button onClick={() => setActiveTab('ytd')} className={`px-6 py-2 text-[10px] font-black uppercase tracking-widest ${activeTab === 'ytd' ? 'bg-black text-white' : 'bg-white'}`}>Year to Date</button>
            </div>
          </div>
        </header>

        <section className="mb-10">
          {isTouristPrecinct && <div className="mb-6 p-4 bg-gray-50 border-l-4 border-gray-400 text-sm font-serif italic text-gray-700"><strong>Context Note:</strong> {formatGeoName(activeGeo)} is a high-traffic hub with few residents; crime rates primarily reflect commercial/visitor density.</div>}
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black leading-[1.08] tracking-tight mb-3 text-black max-w-4xl">
            Major index offenses are {parsedData.totals.diff > 0 ? 'up' : 'down'} {formattedMPct}% {activeTab === 'ytd' ? 'year-to-date' : 'this week'} vs. prior year.
          </h1>
          <p className="text-base md:text-lg font-serif text-gray-600 mb-6 max-w-3xl leading-snug">
            Violent index offenses account for <strong className="text-black">{Number((parsedData.totals.vCur / (parsedData.totals.mCur || 1)) * 100).toFixed(0)}%</strong> of the {parsedData.totals.mCur.toLocaleString()} major felonies reported {activeGeo === 'citywide' ? 'citywide' : `in the ${activeGeo}`}, while the remaining <strong className="text-black">{Number((parsedData.totals.pCur / (parsedData.totals.mCur || 1)) * 100).toFixed(0)}%</strong> are property-related.
          </p>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <div className="flex items-end gap-3 relative">
              {activeGeo === 'citywide' && (() => {
                const totals = CW.map(d => d.BU + d.FA + d.GA + d.GL + d.MU + d.RA + d.RO);
                const maxT = Math.max(...totals);
                const w = 200; const h = 48;
                const pts = totals.map((v, i) => `${(i / (totals.length - 1)) * w},${h - (v / maxT) * h}`).join(' ');
                const area = pts + ` ${w},${h} 0,${h}`;
                return (
                  <svg width={w} height={h} className="absolute bottom-0 left-0 opacity-[0.08] pointer-events-none" preserveAspectRatio="none">
                    <polygon points={area} fill={VC.black} />
                  </svg>
                );
              })()}
              <span className="text-5xl md:text-6xl font-black tabular-nums tracking-tighter leading-none relative">{parsedData.totals.mCur.toLocaleString()}</span>
              <div className="pb-1.5 flex flex-col">
                <span className="text-sm font-medium text-gray-500 uppercase tracking-widest mb-1">Index Total</span>
                <span className={`text-base font-bold tabular-nums ${parsedData.totals.mPct > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {parsedData.totals.mPct > 0 ? '+' : (parsedData.totals.mPct < 0 ? '-' : '')}{formattedMPct}% vs {parsedData.totals.mPri.toLocaleString()} last yr
                </span>
              </div>
            </div>
            {activePop && activeGeo !== 'citywide' && !isTouristPrecinct && (
              <div className="pb-1.5 flex flex-col pl-6 border-l border-gray-200">
                <span className="text-sm font-medium text-indigo-500 uppercase tracking-widest mb-1 flex items-center gap-1"><Users size={14} /> Per 100k Residents</span>
                <span className="text-lg font-bold text-black tabular-nums">{((parsedData.totals.mCur / activePop) * 100000).toFixed(1)} incidents</span>
                <span className="text-xs font-medium text-gray-500 mt-1">Citywide: {(parsedData.totals.citywideRate || 0).toFixed(1)} per 100k</span>
              </div>
            )}
          </div>
        </section>

        {/* Story of the Week — AI-generated summary (citywide only) */}
        {activeGeo === 'citywide' && (weeklySummary || summaryLoading) && (
          <section className="mb-10 p-5 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} className="text-[#ff7c53]" />
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                {activeTab === 'ytd' ? 'Year-to-date summary' : 'Story of the week'}
              </span>
              <span className="text-[10px] font-medium text-gray-500 tabular-nums">
                {activeTab === 'ytd'
                  ? `Through ${parsedData.period?.week_end || '—'}`
                  : `${parsedData.period?.week_start || '—'} – ${parsedData.period?.week_end || '—'}`}
              </span>
              <span className="text-[9px] font-medium text-gray-400 ml-auto uppercase tracking-wider">AI-generated</span>
            </div>
            {summaryLoading ? (
              <div className="h-12 bg-gray-200 rounded animate-pulse" />
            ) : (
              <p className="font-serif text-[16px] leading-relaxed text-gray-800">{renderMarkdown(weeklySummary)}</p>
            )}
          </section>
        )}

        <div className="mb-6 flex items-center gap-2">
          <button onClick={() => setAppView('historic')} className="text-[11px] font-black uppercase tracking-widest text-gray-400 hover:text-black transition-colors flex items-center gap-1.5">
            <Activity size={12} /> Explore the 30-Year View →
          </button>
        </div>

        <QueryBox
          parsedData={parsedData}
          activeGeo={activeGeo}
          activeTab={activeTab}
          period={parsedData.period}
          rawData={rawData}
        />

        <section className="mb-8 pt-8 border-t border-gray-200">
          <h2 className="text-[11px] font-black uppercase tracking-[0.15em] text-gray-400 mb-5">Trends to Watch</h2>
          <div className={`grid grid-cols-1 md:grid-cols-2 ${trendCards.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-8`}>
            {trendCards.map(card => {
              const IconComp = card.icon;
              return (
                <div key={card.id} className="p-6 bg-gray-50 rounded-sm">
                  <div className="flex items-center gap-2 mb-3"><IconComp size={16} className="text-black" /><h3 className="text-[10px] font-black uppercase tracking-widest text-black">{card.title}</h3></div>
                  <div className="font-serif text-[15px] leading-relaxed text-gray-700">{renderMarkdown(card.content)}</div>
                  {card.dataViz && card.dataViz}
                </div>
              );
            })}
          </div>
        </section>

        <section className="mb-12 pt-8 border-t-[3px] border-black">
          <div className="flex flex-col md:flex-row justify-between items-baseline mb-5">
            <h2 className="text-2xl font-black font-serif">All Tracked Offenses</h2>
            <span className="text-[11px] font-black uppercase tracking-widest text-gray-400 mt-2 md:mt-0">Ranked by Incident Volume</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-6">
            <div className="max-w-lg"><UnifiedMagnitudeChart data={parsedData.all} isTourist={isTouristPrecinct} citywideRates={parsedData.citywideRates} activeGeo={activeGeo} /></div>
            <div className="max-w-lg"><DivergingBarChart data={parsedData.all} /></div>
          </div>

          {/* Precinct Choropleth Map + Ranking Bars (citywide only) */}
          {activeGeo === 'citywide' && (
            <section className="mb-10 pt-8 border-t border-gray-200">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-5 gap-4">
                <div>
                  <h2 className="text-[11px] font-black uppercase tracking-[0.15em] text-gray-400 mb-1">Geographic View</h2>
                  <p className="text-sm text-gray-500 font-serif">{mapMode === 'change' ? 'Year-over-year percent change by precinct.' : mapMode === 'volume' ? 'Absolute change in incident count vs prior year — where the raw numbers are growing or shrinking the most.' : 'Crime rates per 100k residents by precinct.'} Click any precinct to drill down.
                    {hotspots?.inequality && <span className="ml-1 text-gray-400">The {hotspots.inequality.topCount} highest-crime precincts ({formatPop(hotspots.inequality.topPop)} residents) match the violent crime total of the {hotspots.inequality.bottomCount} safest ({formatPop(hotspots.inequality.bottomPop)} residents).</span>}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex gap-1 bg-gray-100 p-1 rounded border border-gray-200">
                    {[['rate', 'Rate'], ['change', '% Change'], ['volume', 'Volume Δ']].map(([val, label]) => (
                      <button key={val} onClick={() => setMapMode(val)} className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-sm transition-colors ${mapMode === val ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-black'}`}>{label}</button>
                    ))}
                  </div>
                  <div className="flex gap-1 bg-gray-100 p-1 rounded border border-gray-200">
                    {[['all', 'All Major'], ['violent', 'Violent'], ['property', 'Property']].map(([val, label]) => (
                      <button key={val} onClick={() => setMapCrime(val)} className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-sm transition-colors ${mapCrime === val ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-black'}`}>{label}</button>
                    ))}
                    <select value={['all', 'violent', 'property'].includes(mapCrime) ? '' : mapCrime} onChange={e => e.target.value && setMapCrime(e.target.value)} className="text-[10px] font-black uppercase tracking-widest bg-transparent border-none focus:outline-none text-gray-500 cursor-pointer pl-2">
                      <option value="">Crime...</option>
                      {['Murder', 'Rape', 'Robbery', 'Fel. Assault', 'Burglary', 'Gr. Larceny', 'G.L.A.', 'Petit Larceny', 'Misd. Assault'].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                <div className="lg:col-span-3">
                  <PrecinctMap precinctRates={precinctRates} onSelect={setActiveGeo} activeGeo={activeGeo} mapMode={mapMode} />
                </div>
                <div className="lg:col-span-2">
                  <PrecinctRankingBars precinctRates={precinctRates} onSelect={setActiveGeo} mapMode={mapMode} />
                </div>
              </div>
            </section>
          )}

          {activeGeo === 'citywide' && <CityComparisonWidget rtciData={rtciData} />}

          {activeGeo === 'citywide' && <TransitCrimeBox rawData={rawData} />}

          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 border-b-2 border-black pb-4 gap-4">
            <h3 className="text-[14px] font-black uppercase tracking-[0.15em] text-black">{trendFilter === 'all' ? 'Detailed Data Ledger' : trendFilter === 'up' ? 'Rising Offenses' : 'Falling Offenses'}</h3>
            <div className="flex bg-gray-100 p-1 rounded border border-gray-200 w-full md:w-auto">
              <button onClick={() => setTrendFilter('all')} className={`flex-1 md:flex-none px-4 py-1.5 text-[10px] font-black uppercase ${trendFilter === 'all' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>All</button>
              <button onClick={() => setTrendFilter('up')} className={`flex-1 md:flex-none px-4 py-1.5 text-[10px] font-black uppercase ${trendFilter === 'up' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500'}`}>Rising</button>
              <button onClick={() => setTrendFilter('down')} className={`flex-1 md:flex-none px-4 py-1.5 text-[10px] font-black uppercase ${trendFilter === 'down' ? 'bg-white shadow-sm text-green-600' : 'text-gray-500'}`}>Falling</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[750px]">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-200">
                  <th className="py-3">Crime Category</th>
                  <th className="py-3 text-center hidden md:table-cell" title="Multi-year trajectory with pre-pandemic (2017–19) reference band shaded blue. Dot = current annualized projection.">{activeGeo === 'citywide' ? <span>Trajectory <span className="text-gray-300">·</span> Pre-pandemic context</span> : 'YoY'}</th>
                  <th className="py-3 text-right">Prior Year</th>
                  <th className="py-3 text-right">Current</th>
                  <th className="py-3 text-right">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(() => {
                  const rows = trendFilter === 'all' ? parsedData.all : (trendFilter === 'up' ? risingOffenses : fallingOffenses);
                  const maxAbsChange = Math.max(1, ...rows.map(r => Math.abs(r.pct || 0)));
                  const currentYear = parsedData.period?.week_end ? new Date(parsedData.period.week_end).getFullYear() : new Date().getFullYear();
                  const toneClass = (tone) => tone === 'green' ? 'bg-green-50 text-green-700 border-green-200'
                    : tone === 'orange' ? 'bg-orange-50 text-orange-700 border-orange-200'
                    : 'bg-gray-50 text-gray-600 border-gray-200';
                  return rows.map(item => {
                    const isVolatile = item.prior < VOLATILITY_THRESHOLD;
                    const changeBarW = Math.abs(item.pct || 0) / maxAbsChange * 48;
                    const ctx = activeGeo === 'citywide' ? getHistoricalContext(crimeHistory.citywide, item, currentYear) : null;
                    // Pick the most-noteworthy single badge to display inline (don't crowd the row).
                    const primaryBadge = ctx?.sinceSuperlative || ctx?.outlierBadge || ctx?.pandemicBadge;
                    return (
                      <tr key={item.name} className="hover:bg-gray-50 transition-colors group">
                        <td className="py-2.5 font-bold text-sm text-black">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{item.name}{isVolatile && <span className="ml-1 text-gray-400">*</span>}</span>
                            {primaryBadge && (
                              <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${toneClass(primaryBadge.tone)}`} title={ctx?.pandemicBadge?.label && ctx.pandemicBadge !== primaryBadge ? `${primaryBadge.label} · ${ctx.pandemicBadge.label}` : primaryBadge.label}>
                                {primaryBadge.label}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 text-center hidden md:table-cell">
                          {ctx ? (
                            <ContextSparkline series={ctx.series} annualized={ctx.annualized} preLow={ctx.preLow} preHigh={ctx.preHigh} />
                          ) : (
                            <MiniSparkline points={[item.prior, item.current]} minY={0} />
                          )}
                        </td>
                        <td className={`py-2.5 text-right tabular-nums text-gray-500 ${isVolatile ? 'opacity-50' : ''}`}>
                          <div className="text-sm">{item.prior.toLocaleString()}</div>
                        </td>
                        <td className={`py-2.5 text-right tabular-nums text-black ${isVolatile ? 'opacity-50' : ''}`}>
                          <div className="text-sm font-black">{item.current.toLocaleString()}</div>
                          {item.currentRate !== null && !isTouristPrecinct && <div className="text-[10px] font-normal text-gray-500">{item.currentRate.toFixed(1)}/100k (CW: {parsedData.citywideRates[item.name]?.toFixed(1)})</div>}
                          {ctx && ctx.ytdFrac && ctx.ytdFrac < 0.95 && (
                            <div className="text-[10px] font-normal text-gray-400" title={`Annualized to full-year using YTD fraction ${(ctx.ytdFrac * 100).toFixed(0)}%`}>~{Math.round(ctx.annualized).toLocaleString()} proj.</div>
                          )}
                        </td>
                        <td className={`py-2.5 text-right text-xs font-bold tabular-nums ${item.pct > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="w-12 h-[3px] bg-gray-100 rounded-full overflow-hidden flex" style={{ justifyContent: item.pct > 0 ? 'flex-start' : 'flex-end' }}>
                              <div className="h-full rounded-full" style={{ width: `${changeBarW}px`, background: item.pct > 0 ? VC.orange : VC.green }} />
                            </div>
                            <span>{formatPct(item.pct)}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
          <div className="mt-6 text-[11px] font-serif italic text-gray-500 border-t border-gray-100 pt-4 space-y-1">
            <div>* Indicates a base sample size under 30 (statistically volatile).</div>
            <div>Trajectory shows the offense's annual citywide count back to the early 2010s. The blue band marks the 2017–2019 pre-pandemic range — values inside the band have returned to pre-pandemic norms; values below are below pre-pandemic lows. Dot = current year, projected to a full-year equivalent from year-to-date data. Badges call out where each offense sits relative to that historical context (e.g., "Lowest since 2014," "Above pre-pandemic high," "5-yr high outlier"). Pandemic-context badges only appear for the 10 major offenses tracked in our 30-year history.</div>
          </div>
        </section>
      </div>
    </div>
  );
}