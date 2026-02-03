/**
 * Seed Script: Add uploads near isolated red dots to form circles
 *
 * Usage: npx ts-node scripts/seedMinneapolisExtra.ts
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
const EXTRA_PHOTOS = [
  u('photo-1597501239611-58bb0681971a'), // 0  Lake Harriet sunset
  u('photo-1593100909746-9dc395a4faad'), // 1  Lake Harriet tree branch
  u('photo-1706485899122-e41d721976bb'), // 2  Winter Kite Fest Lake Harriet
  u('photo-1707581456026-95d794e2e273'), // 3  Clownfish aquarium (Como)
  u('photo-1670593017239-b8468855aa92'), // 4  Winter waterfall ice
  u('photo-1630803522336-4038253b4ecb'), // 5  Minnehaha Falls
  u('photo-1592860071323-6d8632626f14'), // 6  Aerial Stone Arch + Mississippi
  u('photo-1585168121124-bc4c43c0251b'), // 7  Downtown from St Anthony Main
  u('photo-1535082049017-5a7b43f3bcef'), // 8  Aerial downtown near water
  u('photo-1610590112835-790f262916fd'), // 9  Pedestrians downtown
  u('photo-1576181296166-53fc5c457fb4'), // 10 Summit Beer glasses
  u('photo-1570589302072-6ded332c44e0'), // 11 Fall foliage St Paul
  u('photo-1611286272020-b6877a1a8705'), // 12 Red/white building + trees
  u('photo-1568951017706-e62a2eabd70d'), // 13 Stone Arch Bridge golden hour
  u('photo-1561506843-db2da7e29c1e'), // 14 Joggers Minneapolis skyline
  u('photo-1575341606544-71df52f9bdf2'), // 15 Night snowstorm Minneapolis
  u('photo-1578582568905-c21f451d2298'), // 16 Snowy street night St Paul
  u('photo-1572285647768-94c8dd6ee0dc'), // 17 Stone Arch Bridge skyline
  u('photo-1643653186431-1e7b4c6ef7b5'), // 18 Minneapolis skyline at night
  u('photo-1610905532525-2fc7e3729f3b'), // 19 Downtown Christmas night
  u('photo-1593808032444-8defe454525d'), // 20 UNITE mural Hennepin
  u('photo-1564234458771-ed5235be9384'), // 21 Skyline reflected in river
  u('photo-1681330840425-c8221aa4f07b'), // 22 Grain Belt neon sign
  u('photo-1588617679352-bb6db50aa257'), // 23 Gold Medal Flour building
  u('photo-1619829492173-ae3f5455a75f'), // 24 Cyclist Stone Arch Bridge
  u('photo-1549853633-20b66f6abf6a'), // 25 Building lit signage
  u('photo-1628127524991-5a3ee41f6bc7'), // 26 St Paul lamppost building
  u('photo-1610590115106-48d1525b7241'), // 27 Stone Arch Bridge concrete
  u('photo-1693883109748-1033904e668b'), // 28 Gold Medal Flour neon
  u('photo-1621536816050-addc84ccbfa3'), // 29 Guthrie Theater Amber Room
  u('photo-1592523197307-d3a1327e72e5'), // 30 Minneapolis mural
  u('photo-1568951019131-5cf511ff7a02'), // 31 Skyline silhouette night
  u('photo-1564234458771-ed5235be9384'), // 32 Skyline river (dup)
  u('photo-1610590112835-790f262916fd'), // 33 Pedestrians (dup)
];
const p = (i: number) => EXTRA_PHOTOS[(i - 1) % EXTRA_PHOTOS.length];

// Add 3 uploads near each isolated location to form circles (need 4 total)
const SEED_UPLOADS: SeedUpload[] = [
  // === LAKE HARRIET (existing: 44.9250, -93.3090) ===
  {
    id: 'mpls-harriet-2',
    caption: 'Lake Harriet winter walk',
    coordinates: [44.9240, -93.3075],
    hoursOld: 2,
    initialVotes: 44,
    type: 'photo',
    mediaUrl: p(1),
  },
  {
    id: 'mpls-harriet-3',
    caption: 'Linden Hills coffee run',
    coordinates: [44.9262, -93.3105],
    hoursOld: 6,
    initialVotes: 32,
    type: 'photo',
    mediaUrl: p(2),
  },
  {
    id: 'mpls-harriet-4',
    caption: 'Geese on Lake Harriet',
    coordinates: [44.9235, -93.3070],
    hoursOld: 9,
    initialVotes: 55,
    type: 'photo',
    mediaUrl: p(3),
  },

  // === COMO ZOO (existing: 44.9822, -93.1506) ===
  {
    id: 'mpls-como-2',
    caption: 'Como Conservatory orchids',
    coordinates: [44.9810, -93.1490],
    hoursOld: 4,
    initialVotes: 61,
    type: 'photo',
    mediaUrl: p(4),
  },
  {
    id: 'mpls-como-3',
    caption: 'Como Lake frozen path',
    coordinates: [44.9835, -93.1520],
    hoursOld: 8,
    initialVotes: 37,
    type: 'photo',
    mediaUrl: p(5),
  },
  {
    id: 'mpls-como-4',
    caption: 'Gorillas at Como Zoo',
    coordinates: [44.9818, -93.1475],
    hoursOld: 1,
    initialVotes: 82,
    type: 'photo',
    mediaUrl: p(6),
  },

  // === MALL OF AMERICA (existing: 44.8549, -93.2422) ===
  {
    id: 'mpls-moa-2',
    caption: 'Nickelodeon Universe ride',
    coordinates: [44.8555, -93.2435],
    hoursOld: 3,
    initialVotes: 93,
    type: 'photo',
    mediaUrl: p(7),
  },
  {
    id: 'mpls-moa-3',
    caption: 'SEA LIFE aquarium sharks',
    coordinates: [44.8542, -93.2410],
    hoursOld: 7,
    initialVotes: 48,
    type: 'photo',
    mediaUrl: p(8),
  },
  {
    id: 'mpls-moa-4',
    caption: 'MOA rotunda from above',
    coordinates: [44.8560, -93.2418],
    hoursOld: 5,
    initialVotes: 67,
    type: 'photo',
    mediaUrl: p(9),
  },

  // === EDINA (existing: 44.8690, -93.3440) ===
  {
    id: 'mpls-edina-2',
    caption: 'Galleria Edina shopping',
    coordinates: [44.8700, -93.3425],
    hoursOld: 5,
    initialVotes: 22,
    type: 'photo',
    mediaUrl: p(10),
  },
  {
    id: 'mpls-edina-3',
    caption: 'Edina Grill pancakes',
    coordinates: [44.8680, -93.3455],
    hoursOld: 10,
    initialVotes: 35,
    type: 'photo',
    mediaUrl: p(11),
  },
  {
    id: 'mpls-edina-4',
    caption: 'Centennial Lakes park bench',
    coordinates: [44.8695, -93.3430],
    hoursOld: 14,
    initialVotes: 19,
    type: 'photo',
    mediaUrl: p(12),
  },

  // === MINNEHAHA FALLS (existing: 44.9153, -93.2110) ===
  {
    id: 'mpls-minnehaha-2',
    caption: 'Minnehaha Creek trail',
    coordinates: [44.9145, -93.2125],
    hoursOld: 3,
    initialVotes: 78,
    type: 'photo',
    mediaUrl: p(13),
  },
  {
    id: 'mpls-minnehaha-3',
    caption: 'Sea Salt Eatery line',
    coordinates: [44.9160, -93.2095],
    hoursOld: 8,
    initialVotes: 52,
    type: 'photo',
    mediaUrl: p(14),
  },
  {
    id: 'mpls-minnehaha-4',
    caption: 'Ice caves behind the falls',
    coordinates: [44.9148, -93.2100],
    hoursOld: 2,
    initialVotes: 189,
    type: 'photo',
    mediaUrl: p(15),
  },

  // === FORT SNELLING (existing: 44.8920, -93.1810) ===
  {
    id: 'mpls-fortsnelling-2',
    caption: 'River confluence overlook',
    coordinates: [44.8930, -93.1825],
    hoursOld: 11,
    initialVotes: 41,
    type: 'photo',
    mediaUrl: p(16),
  },
  {
    id: 'mpls-fortsnelling-3',
    caption: 'Pike Island trail head',
    coordinates: [44.8910, -93.1795],
    hoursOld: 18,
    initialVotes: 33,
    type: 'photo',
    mediaUrl: p(17),
  },
  {
    id: 'mpls-fortsnelling-4',
    caption: 'Historic Fort Snelling walls',
    coordinates: [44.8925, -93.1820],
    hoursOld: 6,
    initialVotes: 57,
    type: 'photo',
    mediaUrl: p(18),
  },

  // === MSP AIRPORT (existing: 44.8848, -93.2223) ===
  {
    id: 'mpls-airport-2',
    caption: 'Plane spotting at MSP',
    coordinates: [44.8855, -93.2240],
    hoursOld: 2,
    initialVotes: 26,
    type: 'photo',
    mediaUrl: p(19),
  },
  {
    id: 'mpls-airport-3',
    caption: 'Terminal 2 light rail',
    coordinates: [44.8840, -93.2210],
    hoursOld: 9,
    initialVotes: 18,
    type: 'photo',
    mediaUrl: p(20),
  },
  {
    id: 'mpls-airport-4',
    caption: 'Sunrise from the tarmac',
    coordinates: [44.8852, -93.2230],
    hoursOld: 4,
    initialVotes: 43,
    type: 'photo',
    mediaUrl: p(21),
  },

  // === ROSEVILLE (existing: 44.9730, -93.1710) ===
  {
    id: 'mpls-roseville-2',
    caption: 'Har Mar Mall throwback',
    coordinates: [44.9720, -93.1725],
    hoursOld: 7,
    initialVotes: 31,
    type: 'photo',
    mediaUrl: p(22),
  },
  {
    id: 'mpls-roseville-3',
    caption: 'Central Park ice rink',
    coordinates: [44.9740, -93.1695],
    hoursOld: 12,
    initialVotes: 24,
    type: 'photo',
    mediaUrl: p(23),
  },
  {
    id: 'mpls-roseville-4',
    caption: 'Roseville library study session',
    coordinates: [44.9735, -93.1718],
    hoursOld: 3,
    initialVotes: 16,
    type: 'photo',
    mediaUrl: p(24),
  },

  // === GOLDEN VALLEY (existing: 44.9920, -93.3280) ===
  {
    id: 'mpls-goldenvalley-2',
    caption: 'Wirth Park ski jump',
    coordinates: [44.9930, -93.3265],
    hoursOld: 5,
    initialVotes: 56,
    type: 'photo',
    mediaUrl: p(25),
  },
  {
    id: 'mpls-goldenvalley-3',
    caption: 'Wirth Lake winter fishing',
    coordinates: [44.9910, -93.3290],
    hoursOld: 10,
    initialVotes: 39,
    type: 'photo',
    mediaUrl: p(26),
  },
  {
    id: 'mpls-goldenvalley-4',
    caption: 'Trailhead coffee and donuts',
    coordinates: [44.9925, -93.3275],
    hoursOld: 2,
    initialVotes: 28,
    type: 'photo',
    mediaUrl: p(27),
  },

  // === U OF M (existing: 3 uploads, need 1 more for circle) ===
  {
    id: 'mpls-uofm-4',
    caption: 'Coffman Union student lounge',
    coordinates: [44.9730, -93.2355],
    hoursOld: 4,
    initialVotes: 21,
    type: 'photo',
    mediaUrl: p(28),
  },

  // === ST. PAUL (bulk up — Cathedral + Rice Park are close, but Summit + Como are far) ===
  {
    id: 'mpls-stpaul-5',
    caption: 'Xcel Energy Center game night',
    coordinates: [44.9448, -93.1010],
    hoursOld: 3,
    initialVotes: 74,
    type: 'photo',
    mediaUrl: p(29),
  },
  {
    id: 'mpls-stpaul-6',
    caption: 'Landmark Center architecture',
    coordinates: [44.9450, -93.0955],
    hoursOld: 11,
    initialVotes: 36,
    type: 'photo',
    mediaUrl: p(30),
  },
  {
    id: 'mpls-stpaul-7',
    caption: 'Science Museum of Minnesota',
    coordinates: [44.9430, -93.0990],
    hoursOld: 7,
    initialVotes: 58,
    type: 'photo',
    mediaUrl: p(31),
  },
  {
    id: 'mpls-stpaul-8',
    caption: 'Summit Ave running club',
    coordinates: [44.9405, -93.1365],
    hoursOld: 5,
    initialVotes: 27,
    type: 'photo',
    mediaUrl: p(32),
  },
  {
    id: 'mpls-stpaul-9',
    caption: 'Grand Avenue bookshop',
    coordinates: [44.9390, -93.1330],
    hoursOld: 15,
    initialVotes: 42,
    type: 'photo',
    mediaUrl: p(33),
  },
  {
    id: 'mpls-stpaul-10',
    caption: 'Mississippi River Boulevard jog',
    coordinates: [44.9415, -93.1380],
    hoursOld: 2,
    initialVotes: 33,
    type: 'photo',
    mediaUrl: p(34),
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

  console.log(`  ✓ ${upload.id} — ${upload.caption}`);
}

async function seedAll(): Promise<void> {
  console.log('\n🌱 Seeding extra uploads near isolated pins...\n');
  console.log(`Table: ${config.tableName}`);
  console.log(`Uploads: ${SEED_UPLOADS.length}\n`);

  if (!config.accessKeyId || !config.secretAccessKey) {
    console.error('❌ AWS credentials not found.');
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
