// Mock for src/api/clients/dynamodb.client.ts

// Key generators
const createUploadPK = jest.fn((uploadId) => `UPLOAD#${uploadId}`);
const createUploadSK = jest.fn(() => 'METADATA');
const createVoteSK = jest.fn((deviceId) => `VOTE#${deviceId}`);
const createGeohashGSI1PK = jest.fn((geohash) => `GEOHASH#${geohash}`);
const createDeviceGSI1PK = jest.fn((deviceId) => `DEVICE#${deviceId}`);
const createUserGSI1PK = jest.fn((userId) => `USER#${userId}`);
const createUserPK = jest.fn((userId) => `USER#${userId}`);
const createUserSK = jest.fn(() => 'PROFILE');

// Upload operations
const createUpload = jest.fn(() => Promise.resolve());
const getUploadById = jest.fn(() => Promise.resolve(null));
const updateUpload = jest.fn(() => Promise.resolve(null));
const updateVoteCount = jest.fn(() => Promise.resolve(0));
const deleteUpload = jest.fn(() => Promise.resolve());
const getAllUploads = jest.fn(() => Promise.resolve([]));
const queryUploadsByGeohash = jest.fn(() => Promise.resolve({ items: [], lastEvaluatedKey: undefined }));
const queryUploadsByDevice = jest.fn(() => Promise.resolve({ items: [], lastEvaluatedKey: undefined }));

// Vote operations
const castVote = jest.fn(() => Promise.resolve({ voteCount: 0, userVote: null }));
const removeVote = jest.fn(() => Promise.resolve({ voteCount: 0, userVote: null }));
const getUserVote = jest.fn(() => Promise.resolve(null));
const getUserVotesMap = jest.fn(() => Promise.resolve({}));
const getVoteCountForUpload = jest.fn(() => Promise.resolve(0));
const getVoteCountsForUploads = jest.fn(() => Promise.resolve({}));
const upsertVote = jest.fn(() => Promise.resolve());
const getVote = jest.fn(() => Promise.resolve(null));
const deleteVote = jest.fn(() => Promise.resolve());
const getVotesForUpload = jest.fn(() => Promise.resolve([]));
const getVotesByDevice = jest.fn(() => Promise.resolve([]));

// User operations
const createUser = jest.fn(() => Promise.resolve());
const getUserById = jest.fn(() => Promise.resolve(null));
const updateUser = jest.fn(() => Promise.resolve(null));
const upsertUser = jest.fn(() => Promise.resolve());

// Utility operations
const batchDelete = jest.fn(() => Promise.resolve());
const executeQuery = jest.fn(() => Promise.resolve({ Items: [] }));

module.exports = {
  createUploadPK,
  createUploadSK,
  createVoteSK,
  createGeohashGSI1PK,
  createDeviceGSI1PK,
  createUserGSI1PK,
  createUserPK,
  createUserSK,
  createUpload,
  getUploadById,
  updateUpload,
  updateVoteCount,
  deleteUpload,
  getAllUploads,
  queryUploadsByGeohash,
  queryUploadsByDevice,
  castVote,
  removeVote,
  getUserVote,
  getUserVotesMap,
  getVoteCountForUpload,
  getVoteCountsForUploads,
  upsertVote,
  getVote,
  deleteVote,
  getVotesForUpload,
  getVotesByDevice,
  createUser,
  getUserById,
  updateUser,
  upsertUser,
  batchDelete,
  executeQuery,
};
