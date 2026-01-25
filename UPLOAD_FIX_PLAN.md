# Upload Fix Plan

## Problem Statement
Uploads are not reaching AWS (S3 + DynamoDB) despite the code existing. This plan identifies and fixes the bugs preventing uploads from working.

---

## Bug #1: mediaKey Not Passed Through Chain (CRITICAL)

### Root Cause
When uploading media, the S3 key is generated but never passed to DynamoDB. Instead, the full S3 URL is stored in the `mediaKey` field.

### Data Flow (Current - Broken)
```
MediaService.upload()
  → Returns { key: "photos/2024/01/25/uuid.jpg", url: "https://s3...?signature=..." }

useUploadData.createUpload()
  → Calls uploadSvc.createUpload({ mediaUrl: mediaResult.url })  // ❌ key is lost here!

UploadService.createUpload()
  → Calls remoteRepo.create({ mediaUrl: "https://s3...?signature=..." })

RemoteUploadRepository.create()
  → Sets mediaKey: input.mediaUrl  // ❌ Stores URL instead of key!
```

### Fix Required
Pass `mediaKey` separately through the entire chain.

### Files to Modify

**1. `src/repositories/interfaces/upload.repository.ts`**
```typescript
// Add mediaKey to CreateUploadInput (line ~40-46)
export interface CreateUploadInput {
  type: MediaType;
  mediaUrl: string;
  mediaKey?: string;  // ADD THIS
  coordinates: Coordinates;
  caption?: string;
  deviceId: string;
}
```

**2. `src/services/upload.service.ts`**
```typescript
// Add mediaKey to CreateUploadParams (line ~32-37)
export interface CreateUploadParams {
  type: MediaType;
  mediaUrl: string;
  mediaKey?: string;  // ADD THIS
  coordinates: Coordinates;
  caption?: string;
}

// Pass mediaKey to input (line ~79-85)
const input: CreateUploadInput = {
  type: params.type,
  mediaUrl: params.mediaUrl,
  mediaKey: params.mediaKey,  // ADD THIS
  coordinates: params.coordinates,
  caption: params.caption,
  deviceId: this.config.deviceId,
};
```

**3. `src/hooks/useUploadData.ts`**
```typescript
// Pass both url and key from media result (line ~182-187)
const bffUpload = await uploadSvc.createUpload({
  type: uploadData.type,
  mediaUrl: mediaResult.url,
  mediaKey: mediaResult.key,  // ADD THIS
  coordinates: uploadData.coordinates,
  caption: uploadData.caption,
});
```

**4. `src/repositories/remote/upload.remote.ts`**
```typescript
// Use mediaKey if provided, fallback to mediaUrl (line ~146)
const dynamoItem = toDynamoItem(upload, input.mediaKey || input.mediaUrl);

// Also fix line 134
mediaKey: input.mediaKey || input.mediaUrl,
```

---

## Bug #2: DeviceId Race Condition (MEDIUM)

### Root Cause
`deviceId` is loaded async in a `useEffect`, but `createUpload` checks `if (FEATURE_FLAGS.USE_AWS_BACKEND && deviceId)`. If the user uploads before deviceId loads, it silently falls back to local-only mode.

### Current Code (useUploadData.ts ~47-60)
```typescript
useEffect(() => {
  const initDeviceId = async () => {
    if (FEATURE_FLAGS.USE_AWS_BACKEND) {
      let id = await getStoredJSON<string>(BFF_STORAGE_KEYS.DEVICE_ID);
      if (!id) {
        id = uuidv4();
        await setStoredJSON(BFF_STORAGE_KEYS.DEVICE_ID, id);
      }
      setDeviceId(id);  // This happens async!
    }
  };
  initDeviceId();
}, []);
```

### Fix Required
Add a loading state and wait for deviceId before proceeding with AWS upload.

### Changes to useUploadData.ts
```typescript
// Add isInitialized state
const [isInitialized, setIsInitialized] = useState(!FEATURE_FLAGS.USE_AWS_BACKEND);

// Update useEffect
useEffect(() => {
  const initDeviceId = async () => {
    if (FEATURE_FLAGS.USE_AWS_BACKEND) {
      let id = await getStoredJSON<string>(BFF_STORAGE_KEYS.DEVICE_ID);
      if (!id) {
        id = uuidv4();
        await setStoredJSON(BFF_STORAGE_KEYS.DEVICE_ID, id);
      }
      setDeviceId(id);
      setIsInitialized(true);  // Mark as ready
    }
  };
  initDeviceId();
}, []);

// Update createUpload to check initialization
const createUpload = useCallback(async (uploadData: CreateUploadData) => {
  try {
    if (FEATURE_FLAGS.USE_AWS_BACKEND && !isInitialized) {
      throw new Error('AWS services not yet initialized. Please wait and try again.');
    }
    // ... rest of function
  }
}, [uploads, saveUploads, deviceId, isInitialized, getUploadSvc, getMediaSvc]);
```

---

## Bug #3: Debug Logging Missing (HELPFUL)

### Problem
No way to verify AWS is being used or debug failures.

### Fix: Add Logging
Add console logs at key points:

**In useUploadData.ts createUpload:**
```typescript
console.log('[Upload] Starting upload with AWS:', FEATURE_FLAGS.USE_AWS_BACKEND);
console.log('[Upload] DeviceId:', deviceId);
console.log('[Upload] Media path:', uploadData.data);
```

**In MediaService.upload:**
```typescript
console.log('[MediaService] useRemote:', this.useRemote);
console.log('[MediaService] Uploading to S3...');
```

**In UploadService.createUpload:**
```typescript
console.log('[UploadService] useRemote:', this.useRemote);
console.log('[UploadService] Creating in DynamoDB...');
```

---

## Bug #4: Silent Failures (MEDIUM)

### Problem
If S3 or DynamoDB fail, errors are caught and logged but the function still "succeeds" with local data. User doesn't know their upload didn't reach AWS.

### Current Code (UploadService ~91-100)
```typescript
if (this.useRemote) {
  try {
    await this.remoteRepo.create(input);
  } catch (error) {
    console.error('Failed to sync upload to remote:', error);
    // Continues silently!
  }
}
```

### Fix Option A: Throw on Remote Failure
```typescript
if (this.useRemote) {
  await this.remoteRepo.create(input);  // Let error propagate
}
```

### Fix Option B: Return Status
```typescript
return {
  ...localUpload,
  syncStatus: remoteSuccess ? 'synced' : 'pending',
};
```

**Recommendation:** For now, let errors propagate so we can see them during debugging.

---

## Implementation Order

1. **Bug #1 (Critical)** - Fix mediaKey chain - this is why DynamoDB data is wrong
2. **Bug #3 (Helpful)** - Add logging - helps verify fixes work
3. **Bug #2 (Medium)** - Fix race condition - prevents edge case failures
4. **Bug #4 (Medium)** - Surface errors - helps during testing

---

## Verification Steps

After implementing fixes:

1. **Rebuild app:**
   ```bash
   npx expo prebuild --clean && npx expo run:ios
   ```

2. **Check console logs for:**
   - `[Upload] Starting upload with AWS: true`
   - `[Upload] DeviceId: <uuid>`
   - `[MediaService] useRemote: true`
   - `[MediaService] Uploading to S3...`
   - `Upload progress: X%`
   - `[UploadService] Creating in DynamoDB...`

3. **Check S3 bucket:**
   - Look for new file in `photos/YYYY/MM/DD/` folder

4. **Check DynamoDB:**
   - Look for item with `PK: UPLOAD#<uuid>`
   - Verify `mediaKey` contains S3 key path (not full URL)

---

## Files Summary

| File | Changes |
|------|---------|
| `src/repositories/interfaces/upload.repository.ts` | Add `mediaKey` to `CreateUploadInput` |
| `src/services/upload.service.ts` | Add `mediaKey` to params, pass through |
| `src/hooks/useUploadData.ts` | Pass `mediaKey`, add logging, fix race condition |
| `src/repositories/remote/upload.remote.ts` | Use `input.mediaKey` |
| `src/services/media.service.ts` | Add logging |
