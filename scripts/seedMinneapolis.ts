/**
 * Seed Script: Minneapolis test uploads for App Store screenshots
 *
 * Creates realistic uploads around Minneapolis with clusters downtown
 * and scattered around the metro for good zoom-out visuals.
 *
 * Usage: npx ts-node scripts/seedMinneapolis.ts
 */

import 'dotenv/config';
import {
  DynamoDBClient,
  DynamoDBClientConfig,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import ngeohash from 'ngeohash';

const config = {
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  tableName: process.env.DYNAMO_TABLE || 'unum-dev',
  geohashPrecision: 6,
};

const clientConfig: DynamoDBClientConfig = {
  region: config.region,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  },
};

const baseClient = new DynamoDBClient(clientConfig);
const docClient = DynamoDBDocumentClient.from(baseClient, {
  marshallOptions: { removeUndefinedValues: true },
});

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

interface SeedUpload {
  id: string;
  caption: string;
  coordinates: [number, number];
  hoursOld: number;
  initialVotes: number;
  type: 'photo' | 'video';
  mediaUrl: string;
}

// Real Minneapolis / Twin Cities photos from Unsplash (free license)
const u = (id: string) => `https://images.unsplash.com/${id}?w=800&h=600&fit=crop`;

const PHOTO_URLS = [
  u('photo-1619829492173-ae3f5455a75f'), // 0  Stone Arch Bridge cyclist
  u('photo-1568951017706-e62a2eabd70d'), // 1  Stone Arch Bridge golden hour
  u('photo-1585168121124-bc4c43c0251b'), // 2  Downtown from St Anthony Main
  u('photo-1592860071323-6d8632626f14'), // 3  Aerial Stone Arch + Mississippi
  u('photo-1535082049017-5a7b43f3bcef'), // 4  Aerial downtown near water
  u('photo-1643653186431-1e7b4c6ef7b5'), // 5  Minneapolis skyline at night
  u('photo-1572285647768-94c8dd6ee0dc'), // 6  Stone Arch Bridge skyline view
  u('photo-1610590112835-790f262916fd'), // 7  Pedestrians downtown
  u('photo-1588617679352-bb6db50aa257'), // 8  Gold Medal Flour building
  u('photo-1564234458771-ed5235be9384'), // 9  Skyline reflected in river
  u('photo-1610905532525-2fc7e3729f3b'), // 10 Downtown Christmas night
  u('photo-1621536816050-addc84ccbfa3'), // 11 Guthrie Theater Amber Room
  u('photo-1681330840425-c8221aa4f07b'), // 12 Grain Belt neon sign
  u('photo-1610590115106-48d1525b7241'), // 13 Stone Arch Bridge concrete
  u('photo-1549853633-20b66f6abf6a'), // 14 Building lit signage
  u('photo-1568951019131-5cf511ff7a02'), // 15 Skyline silhouette night
  u('photo-1575341606544-71df52f9bdf2'), // 16 Night snowstorm Minneapolis
  u('photo-1593808032444-8defe454525d'), // 17 UNITE mural Hennepin
  u('photo-1561506843-db2da7e29c1e'), // 18 Joggers Minneapolis skyline
  u('photo-1593100909746-9dc395a4faad'), // 19 Lake Harriet tree branch
  u('photo-1597501239611-58bb0681971a'), // 20 Lake Harriet sunset
  u('photo-1706485899122-e41d721976bb'), // 21 Winter Kite Fest Lake Harriet
  u('photo-1576181296166-53fc5c457fb4'), // 22 Summit Beer glasses
  u('photo-1611286272020-b6877a1a8705'), // 23 Red/white building + trees
  u('photo-1693883109748-1033904e668b'), // 24 Gold Medal Flour neon
  u('photo-1570589302072-6ded332c44e0'), // 25 Fall foliage St Paul
  u('photo-1578582568905-c21f451d2298'), // 26 Snowy street night St Paul
  u('photo-1630803522336-4038253b4ecb'), // 27 Minnehaha Falls
  u('photo-1670593017239-b8468855aa92'), // 28 Winter waterfall ice
  u('photo-1592523197307-d3a1327e72e5'), // 29 Minneapolis mural
  u('photo-1707581456026-95d794e2e273'), // 30 Clownfish aquarium
  u('photo-1628127524991-5a3ee41f6bc7'), // 31 St Paul lamppost building
  u('photo-1564234458771-ed5235be9384'), // 32 Skyline river reflection (dup)
  u('photo-1585168121124-bc4c43c0251b'), // 33 Downtown summer (dup)
  u('photo-1572285647768-94c8dd6ee0dc'), // 34 Bridge skyline (dup)
  u('photo-1610590112835-790f262916fd'), // 35 Pedestrians (dup)
];

const VIDEO_URL = 'https://www.w3schools.com/html/mov_bbb.mp4';

const SEED_UPLOADS: SeedUpload[] = [
  // === DOWNTOWN MINNEAPOLIS (dense cluster) ===
  {
    id: 'mpls-downtown-1',
    caption: 'Sunset over the Stone Arch Bridge',
    coordinates: [44.9806, -93.2566],
    hoursOld: 1,
    initialVotes: 89,
    type: 'photo',
    mediaUrl: PHOTO_URLS[0],
  },
  {
    id: 'mpls-downtown-2',
    caption: 'Nicollet Mall looking busy today',
    coordinates: [44.9748, -93.2713],
    hoursOld: 2,
    initialVotes: 42,
    type: 'photo',
    mediaUrl: PHOTO_URLS[1],
  },
  {
    id: 'mpls-downtown-3',
    caption: 'Target Center pregame energy',
    coordinates: [44.9795, -93.2760],
    hoursOld: 3,
    initialVotes: 67,
    type: 'photo',
    mediaUrl: PHOTO_URLS[2],
  },
  {
    id: 'mpls-downtown-4',
    caption: 'Mill City Museum vibes',
    coordinates: [44.9787, -93.2574],
    hoursOld: 0.5,
    initialVotes: 15,
    type: 'photo',
    mediaUrl: PHOTO_URLS[3],
  },
  {
    id: 'mpls-downtown-5',
    caption: 'Gold Medal Park in the snow',
    coordinates: [44.9771, -93.2538],
    hoursOld: 5,
    initialVotes: 34,
    type: 'photo',
    mediaUrl: PHOTO_URLS[4],
  },
  {
    id: 'mpls-downtown-6',
    caption: 'IDS Tower from street level',
    coordinates: [44.9762, -93.2720],
    hoursOld: 8,
    initialVotes: 23,
    type: 'photo',
    mediaUrl: PHOTO_URLS[5],
  },
  {
    id: 'mpls-downtown-7',
    caption: 'Foshay Tower observation deck view',
    coordinates: [44.9743, -93.2721],
    hoursOld: 4,
    initialVotes: 112,
    type: 'photo',
    mediaUrl: PHOTO_URLS[6],
  },
  {
    id: 'mpls-downtown-8',
    caption: 'First Ave marquee tonight',
    coordinates: [44.9793, -93.2762],
    hoursOld: 6,
    initialVotes: 156,
    type: 'photo',
    mediaUrl: PHOTO_URLS[7],
  },
  {
    id: 'mpls-downtown-9',
    caption: 'Skyway views on a cold day',
    coordinates: [44.9755, -93.2690],
    hoursOld: 10,
    initialVotes: 19,
    type: 'photo',
    mediaUrl: PHOTO_URLS[8],
  },
  {
    id: 'mpls-downtown-10',
    caption: 'Mississippi River frozen over',
    coordinates: [44.9820, -93.2520],
    hoursOld: 7,
    initialVotes: 203,
    type: 'photo',
    mediaUrl: PHOTO_URLS[9],
  },
  {
    id: 'mpls-downtown-11',
    caption: 'US Bank Stadium light show',
    coordinates: [44.9736, -93.2574],
    hoursOld: 12,
    initialVotes: 78,
    type: 'video',
    mediaUrl: VIDEO_URL,
  },
  {
    id: 'mpls-downtown-12',
    caption: 'Guthrie Theater blue wall',
    coordinates: [44.9783, -93.2554],
    hoursOld: 9,
    initialVotes: 45,
    type: 'photo',
    mediaUrl: PHOTO_URLS[10],
  },

  // === NORTH LOOP / WAREHOUSE DISTRICT ===
  {
    id: 'mpls-northloop-1',
    caption: 'Brunch spot line out the door',
    coordinates: [44.9852, -93.2730],
    hoursOld: 3,
    initialVotes: 31,
    type: 'photo',
    mediaUrl: PHOTO_URLS[11],
  },
  {
    id: 'mpls-northloop-2',
    caption: 'Target Field in winter',
    coordinates: [44.9817, -93.2777],
    hoursOld: 14,
    initialVotes: 52,
    type: 'photo',
    mediaUrl: PHOTO_URLS[12],
  },
  {
    id: 'mpls-northloop-3',
    caption: 'Farmers market haul',
    coordinates: [44.9838, -93.2698],
    hoursOld: 6,
    initialVotes: 28,
    type: 'photo',
    mediaUrl: PHOTO_URLS[13],
  },

  // === NORTHEAST MINNEAPOLIS ===
  {
    id: 'mpls-northeast-1',
    caption: 'Brewery tour in NE',
    coordinates: [44.9985, -93.2474],
    hoursOld: 5,
    initialVotes: 47,
    type: 'photo',
    mediaUrl: PHOTO_URLS[14],
  },
  {
    id: 'mpls-northeast-2',
    caption: 'Street art on Central Ave',
    coordinates: [44.9942, -93.2472],
    hoursOld: 18,
    initialVotes: 63,
    type: 'photo',
    mediaUrl: PHOTO_URLS[15],
  },
  {
    id: 'mpls-northeast-3',
    caption: 'Surdyk\'s cheese selection',
    coordinates: [44.9905, -93.2520],
    hoursOld: 24,
    initialVotes: 22,
    type: 'photo',
    mediaUrl: PHOTO_URLS[16],
  },
  {
    id: 'mpls-northeast-4',
    caption: 'Indeed Brewing patio',
    coordinates: [44.9960, -93.2510],
    hoursOld: 8,
    initialVotes: 35,
    type: 'photo',
    mediaUrl: PHOTO_URLS[17],
  },

  // === UPTOWN / LAKES ===
  {
    id: 'mpls-uptown-1',
    caption: 'Bde Maka Ska frozen but beautiful',
    coordinates: [44.9486, -93.3113],
    hoursOld: 2,
    initialVotes: 134,
    type: 'photo',
    mediaUrl: PHOTO_URLS[18],
  },
  {
    id: 'mpls-uptown-2',
    caption: 'Lake Harriet bandshell',
    coordinates: [44.9250, -93.3090],
    hoursOld: 20,
    initialVotes: 76,
    type: 'photo',
    mediaUrl: PHOTO_URLS[19],
  },
  {
    id: 'mpls-uptown-3',
    caption: 'Uptown mural on Hennepin',
    coordinates: [44.9488, -93.2984],
    hoursOld: 11,
    initialVotes: 41,
    type: 'photo',
    mediaUrl: PHOTO_URLS[20],
  },
  {
    id: 'mpls-uptown-4',
    caption: 'Chain of Lakes path runners',
    coordinates: [44.9380, -93.3100],
    hoursOld: 4,
    initialVotes: 58,
    type: 'photo',
    mediaUrl: PHOTO_URLS[21],
  },
  {
    id: 'mpls-uptown-5',
    caption: 'Lake of the Isles at dusk',
    coordinates: [44.9570, -93.3050],
    hoursOld: 15,
    initialVotes: 91,
    type: 'photo',
    mediaUrl: PHOTO_URLS[22],
  },

  // === UNIVERSITY OF MINNESOTA ===
  {
    id: 'mpls-uofm-1',
    caption: 'Northrop Mall study break',
    coordinates: [44.9720, -93.2350],
    hoursOld: 3,
    initialVotes: 25,
    type: 'photo',
    mediaUrl: PHOTO_URLS[23],
  },
  {
    id: 'mpls-uofm-2',
    caption: 'Washington Avenue Bridge walk',
    coordinates: [44.9740, -93.2420],
    hoursOld: 7,
    initialVotes: 18,
    type: 'photo',
    mediaUrl: PHOTO_URLS[24],
  },
  {
    id: 'mpls-uofm-3',
    caption: 'Huntington Bank Stadium tailgate',
    coordinates: [44.9762, -93.2248],
    hoursOld: 16,
    initialVotes: 87,
    type: 'video',
    mediaUrl: VIDEO_URL,
  },

  // === ST. PAUL ===
  {
    id: 'mpls-stpaul-1',
    caption: 'Cathedral of Saint Paul at night',
    coordinates: [44.9462, -93.1089],
    hoursOld: 10,
    initialVotes: 95,
    type: 'photo',
    mediaUrl: PHOTO_URLS[25],
  },
  {
    id: 'mpls-stpaul-2',
    caption: 'Summit Ave mansions',
    coordinates: [44.9400, -93.1350],
    hoursOld: 22,
    initialVotes: 44,
    type: 'photo',
    mediaUrl: PHOTO_URLS[26],
  },
  {
    id: 'mpls-stpaul-3',
    caption: 'Rice Park ice sculptures',
    coordinates: [44.9445, -93.0970],
    hoursOld: 6,
    initialVotes: 68,
    type: 'photo',
    mediaUrl: PHOTO_URLS[27],
  },
  {
    id: 'mpls-stpaul-4',
    caption: 'Como Zoo penguins',
    coordinates: [44.9822, -93.1506],
    hoursOld: 13,
    initialVotes: 53,
    type: 'photo',
    mediaUrl: PHOTO_URLS[28],
  },

  // === SCATTERED SUBURBS (big circles when zoomed out) ===
  {
    id: 'mpls-moa-1',
    caption: 'Mall of America from the parking lot',
    coordinates: [44.8549, -93.2422],
    hoursOld: 8,
    initialVotes: 120,
    type: 'photo',
    mediaUrl: PHOTO_URLS[29],
  },
  {
    id: 'mpls-edina-1',
    caption: 'Centennial Lakes ice skating',
    coordinates: [44.8690, -93.3440],
    hoursOld: 12,
    initialVotes: 38,
    type: 'photo',
    mediaUrl: PHOTO_URLS[30],
  },
  {
    id: 'mpls-stlouis-1',
    caption: 'Minnehaha Falls frozen solid',
    coordinates: [44.9153, -93.2110],
    hoursOld: 1,
    initialVotes: 245,
    type: 'photo',
    mediaUrl: PHOTO_URLS[31],
  },
  {
    id: 'mpls-fortsnelling-1',
    caption: 'Fort Snelling State Park trails',
    coordinates: [44.8920, -93.1810],
    hoursOld: 30,
    initialVotes: 62,
    type: 'photo',
    mediaUrl: PHOTO_URLS[32],
  },
  {
    id: 'mpls-airport-1',
    caption: 'MSP Terminal 1 departures',
    coordinates: [44.8848, -93.2223],
    hoursOld: 5,
    initialVotes: 14,
    type: 'photo',
    mediaUrl: PHOTO_URLS[33],
  },
  {
    id: 'mpls-roseville-1',
    caption: 'Rosedale Center weekend crowd',
    coordinates: [44.9730, -93.1710],
    hoursOld: 20,
    initialVotes: 29,
    type: 'photo',
    mediaUrl: PHOTO_URLS[34],
  },
  {
    id: 'mpls-golden-valley-1',
    caption: 'Theodore Wirth Park skiing',
    coordinates: [44.9920, -93.3280],
    hoursOld: 3,
    initialVotes: 71,
    type: 'photo',
    mediaUrl: PHOTO_URLS[35],
  },
];

async function createUploadItem(upload: SeedUpload): Promise<void> {
  const [latitude, longitude] = upload.coordinates;
  const geohash = ngeohash.encode(latitude, longitude, config.geohashPrecision);
  const timestamp = hoursAgo(upload.hoursOld);
  const now = new Date().toISOString();

  const item = {
    PK: `UPLOAD#${upload.id}`,
    SK: 'METADATA',
    GSI1PK: `GEOHASH#${geohash}`,
    GSI1SK: timestamp,
    id: upload.id,
    type: upload.type,
    mediaKey: upload.mediaUrl,
    latitude,
    longitude,
    geohash,
    timestamp,
    caption: upload.caption,
    voteCount: upload.initialVotes,
    userId: 'seed-user-mpls',
    deviceId: 'seed-device-mpls',
    createdAt: timestamp,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: config.tableName,
      Item: item,
    })
  );

  console.log(`  ✓ ${upload.id} (${upload.hoursOld}h old, +${upload.initialVotes} votes) — ${upload.caption}`);
}

async function seedAll(): Promise<void> {
  console.log('\n🌱 Seeding Minneapolis test uploads...\n');
  console.log(`Table: ${config.tableName}`);
  console.log(`Region: ${config.region}`);
  console.log(`Uploads: ${SEED_UPLOADS.length}\n`);

  if (!config.accessKeyId || !config.secretAccessKey) {
    console.error('❌ AWS credentials not found. Check .env file.');
    process.exit(1);
  }

  let created = 0;
  let failed = 0;

  for (const upload of SEED_UPLOADS) {
    try {
      await createUploadItem(upload);
      created++;
    } catch (err) {
      console.error(`  ✗ Failed: ${upload.id}`, err);
      failed++;
    }
  }

  console.log(`\n✅ Done: ${created} created, ${failed} failed\n`);
}

seedAll().catch(console.error);
