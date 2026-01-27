/**
 * EXIF Service
 *
 * Handles reading and writing EXIF metadata to JPEG images.
 * Uses expo-image-manipulator to ensure JPEG format,
 * then piexifjs for EXIF manipulation.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
// @ts-expect-error - piexifjs has no type declarations
import piexif from 'piexifjs';
import type { Coordinates } from '../shared/types';

// ============ Types ============

export interface ExifMetadata {
  coordinates?: Coordinates;
  timestamp?: string;
  userId?: string;
  uploaderId?: string;
  downloaderId?: string;
}

// ============ Helper Functions ============

/**
 * Convert decimal degrees to degrees/minutes/seconds format for EXIF GPS
 */
function decimalToDMS(decimal: number): [[number, number], [number, number], [number, number]] {
  const absolute = Math.abs(decimal);
  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.round((minutesFloat - minutes) * 60 * 100); // Store as hundredths

  return [
    [degrees, 1],
    [minutes, 1],
    [seconds, 100],
  ];
}

/**
 * Format date for EXIF (YYYY:MM:DD HH:MM:SS)
 */
function formatExifDate(isoString: string): string {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  const secs = String(date.getSeconds()).padStart(2, '0');
  return `${year}:${month}:${day} ${hours}:${mins}:${secs}`;
}

/**
 * Build GPS EXIF data from coordinates
 */
function buildGpsExif(coordinates: Coordinates): Record<string, unknown> {
  const [latitude, longitude] = coordinates;

  console.log('[ExifService] Building GPS EXIF for:', { latitude, longitude });

  return {
    [piexif.GPSIFD.GPSLatitudeRef]: latitude >= 0 ? 'N' : 'S',
    [piexif.GPSIFD.GPSLatitude]: decimalToDMS(latitude),
    [piexif.GPSIFD.GPSLongitudeRef]: longitude >= 0 ? 'E' : 'W',
    [piexif.GPSIFD.GPSLongitude]: decimalToDMS(longitude),
    [piexif.GPSIFD.GPSVersionID]: [2, 3, 0, 0],
  };
}

/**
 * Convert any image to JPEG format using ImageManipulator
 * Returns a new file path to a guaranteed JPEG file
 */
async function ensureJpegFormat(imagePath: string): Promise<string> {
  console.log('[ExifService] Converting to JPEG:', imagePath);

  const result = await ImageManipulator.manipulateAsync(
    imagePath,
    [], // No transformations, just convert format
    {
      compress: 0.95,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  console.log('[ExifService] Converted to JPEG:', result.uri);
  return result.uri;
}

// ============ Main Functions ============

/**
 * Write EXIF metadata to an image
 * Converts to JPEG if needed, then embeds EXIF data
 * Returns the path to a NEW file with EXIF embedded
 */
export async function writeExifToImage(
  imagePath: string,
  metadata: ExifMetadata
): Promise<string> {
  console.log('[ExifService] ========== writeExifToImage START ==========');
  console.log('[ExifService] Input path:', imagePath);
  console.log('[ExifService] Metadata:', JSON.stringify(metadata, null, 2));

  try {
    // Step 1: Convert to guaranteed JPEG format
    const jpegPath = await ensureJpegFormat(imagePath);
    console.log('[ExifService] JPEG path:', jpegPath);

    // Step 2: Read the JPEG as base64
    const base64 = await FileSystem.readAsStringAsync(jpegPath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    console.log('[ExifService] Read JPEG, base64 length:', base64.length);

    // Verify it's actually JPEG by checking magic bytes
    const magicBytes = atob(base64.substring(0, 4));
    const isJpeg = magicBytes.charCodeAt(0) === 0xFF && magicBytes.charCodeAt(1) === 0xD8;
    console.log('[ExifService] Is valid JPEG:', isJpeg);

    if (!isJpeg) {
      console.error('[ExifService] File is not a valid JPEG after conversion!');
      return imagePath;
    }

    // Step 3: Create data URI and build EXIF
    const dataUri = `data:image/jpeg;base64,${base64}`;

    // Try to load existing EXIF, or create new
    let exifObj: Record<string, Record<string, unknown>>;
    try {
      exifObj = piexif.load(dataUri);
      console.log('[ExifService] Loaded existing EXIF');
    } catch {
      console.log('[ExifService] No existing EXIF, creating new');
      exifObj = {
        '0th': {},
        Exif: {},
        GPS: {},
        '1st': {},
      };
    }

    // Ensure all required sections exist
    exifObj['0th'] = exifObj['0th'] || {};
    exifObj['Exif'] = exifObj['Exif'] || {};
    exifObj['GPS'] = exifObj['GPS'] || {};

    // Step 4: Add GPS coordinates
    if (metadata.coordinates) {
      console.log('[ExifService] Adding GPS coordinates:', metadata.coordinates);
      const gpsData = buildGpsExif(metadata.coordinates);
      console.log('[ExifService] GPS EXIF data keys:', Object.keys(gpsData));
      Object.assign(exifObj['GPS'], gpsData);
    } else {
      console.log('[ExifService] WARNING: No coordinates provided!');
    }

    // Step 5: Add timestamp
    if (metadata.timestamp) {
      const exifDate = formatExifDate(metadata.timestamp);
      console.log('[ExifService] Adding timestamp:', exifDate);
      exifObj['Exif'][piexif.ExifIFD.DateTimeOriginal] = exifDate;
      exifObj['Exif'][piexif.ExifIFD.DateTimeDigitized] = exifDate;
      exifObj['0th'][piexif.ImageIFD.DateTime] = exifDate;
    }

    // Step 6: Add user IDs to multiple EXIF fields for visibility
    if (metadata.uploaderId) {
      // Try multiple fields to ensure visibility
      exifObj['0th'][piexif.ImageIFD.Artist] = metadata.uploaderId;
      exifObj['0th'][piexif.ImageIFD.ImageDescription] = metadata.uploaderId;
      exifObj['0th'][piexif.ImageIFD.Copyright] = `Uploaded by ${metadata.uploaderId}`;
      console.log('[ExifService] Added uploader to Artist/ImageDescription/Copyright');
    }

    if (metadata.downloaderId) {
      // Append downloader to copyright if uploader exists
      const existingCopyright = exifObj['0th'][piexif.ImageIFD.Copyright] || '';
      exifObj['0th'][piexif.ImageIFD.Copyright] = existingCopyright
        ? `${existingCopyright} | Downloaded by ${metadata.downloaderId}`
        : `Downloaded by ${metadata.downloaderId}`;
      console.log('[ExifService] Added downloader to Copyright');
    }

    // Build user comment with all metadata (backup storage)
    const userCommentParts: string[] = [];
    if (metadata.uploaderId) {
      userCommentParts.push(`uploader:${metadata.uploaderId}`);
    }
    if (metadata.downloaderId) {
      userCommentParts.push(`downloader:${metadata.downloaderId}`);
    }
    if (metadata.userId) {
      userCommentParts.push(`user:${metadata.userId}`);
    }

    if (userCommentParts.length > 0) {
      const comment = userCommentParts.join(';');
      exifObj['Exif'][piexif.ExifIFD.UserComment] = `ASCII\0\0\0${comment}`;
      console.log('[ExifService] Added user comment:', comment);
    }

    // Step 7: Insert EXIF back into image
    console.log('[ExifService] Dumping EXIF bytes...');
    const exifBytes = piexif.dump(exifObj);
    console.log('[ExifService] Inserting EXIF into image...');
    const newDataUri = piexif.insert(exifBytes, dataUri);

    // Step 8: Extract base64 and write to new file
    const newBase64 = newDataUri.replace(/^data:image\/jpeg;base64,/, '');

    // Create a new file path for the EXIF-embedded image
    const outputPath = `${FileSystem.cacheDirectory}exif_${Date.now()}.jpg`;
    console.log('[ExifService] Writing to:', outputPath);

    await FileSystem.writeAsStringAsync(outputPath, newBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Verify the output file exists
    const fileInfo = await FileSystem.getInfoAsync(outputPath);
    console.log('[ExifService] Output file info:', fileInfo);

    // Verify EXIF was written by reading it back
    try {
      const verifyBase64 = await FileSystem.readAsStringAsync(outputPath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const verifyDataUri = `data:image/jpeg;base64,${verifyBase64}`;
      const verifyExif = piexif.load(verifyDataUri);
      console.log('[ExifService] VERIFY - GPS data:', JSON.stringify(verifyExif['GPS']));
      console.log('[ExifService] VERIFY - Has GPS lat:', !!verifyExif['GPS']?.[piexif.GPSIFD.GPSLatitude]);
      console.log('[ExifService] VERIFY - Has GPS lon:', !!verifyExif['GPS']?.[piexif.GPSIFD.GPSLongitude]);
    } catch (verifyError) {
      console.error('[ExifService] VERIFY failed:', verifyError);
    }

    console.log('[ExifService] ========== writeExifToImage SUCCESS ==========');
    return outputPath;
  } catch (error) {
    console.error('[ExifService] ========== writeExifToImage FAILED ==========');
    console.error('[ExifService] Error:', error);
    // Return original path on error - don't fail the upload/download
    return imagePath;
  }
}

/**
 * Write EXIF metadata for upload (coordinates, timestamp, uploader)
 */
export async function writeUploadExif(
  imagePath: string,
  coordinates: Coordinates,
  timestamp: string,
  uploaderId: string
): Promise<string> {
  console.log('[ExifService] writeUploadExif called');
  console.log('[ExifService] coordinates:', coordinates);
  console.log('[ExifService] timestamp:', timestamp);
  console.log('[ExifService] uploaderId:', uploaderId);

  return writeExifToImage(imagePath, {
    coordinates,
    timestamp,
    uploaderId,
  });
}

/**
 * Add downloader ID to existing image EXIF
 */
export async function addDownloaderExif(
  imagePath: string,
  downloaderId: string
): Promise<string> {
  return writeExifToImage(imagePath, {
    downloaderId,
  });
}

/**
 * Read EXIF metadata from a JPEG file
 */
export async function readExifFromImage(
  imagePath: string
): Promise<ExifMetadata | null> {
  try {
    // Read the image as base64
    const base64 = await FileSystem.readAsStringAsync(imagePath, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Create data URI
    const dataUri = `data:image/jpeg;base64,${base64}`;

    // Load EXIF
    const exifObj = piexif.load(dataUri);

    const metadata: ExifMetadata = {};

    // Extract GPS coordinates
    if (exifObj['GPS']) {
      const gps = exifObj['GPS'];
      const latRef = gps[piexif.GPSIFD.GPSLatitudeRef];
      const lat = gps[piexif.GPSIFD.GPSLatitude];
      const lonRef = gps[piexif.GPSIFD.GPSLongitudeRef];
      const lon = gps[piexif.GPSIFD.GPSLongitude];

      if (lat && lon) {
        // Convert DMS to decimal
        const latDecimal =
          (lat[0][0] / lat[0][1] +
            lat[1][0] / lat[1][1] / 60 +
            lat[2][0] / lat[2][1] / 3600) *
          (latRef === 'S' ? -1 : 1);
        const lonDecimal =
          (lon[0][0] / lon[0][1] +
            lon[1][0] / lon[1][1] / 60 +
            lon[2][0] / lon[2][1] / 3600) *
          (lonRef === 'W' ? -1 : 1);

        metadata.coordinates = [latDecimal, lonDecimal];
      }
    }

    // Extract timestamp
    if (exifObj['Exif']) {
      const dateTimeOriginal = exifObj['Exif'][piexif.ExifIFD.DateTimeOriginal];
      if (dateTimeOriginal) {
        // Convert EXIF date format to ISO
        const [datePart, timePart] = dateTimeOriginal.split(' ');
        const isoDate = datePart.replace(/:/g, '-') + 'T' + timePart;
        metadata.timestamp = isoDate;
      }

      // Extract user comment
      const userComment = exifObj['Exif'][piexif.ExifIFD.UserComment];
      if (userComment && typeof userComment === 'string') {
        // Remove ASCII prefix if present
        const comment = userComment.replace(/^ASCII\0\0\0/, '');
        const parts = comment.split(';');
        for (const part of parts) {
          const [key, value] = part.split(':');
          if (key === 'uploader') metadata.uploaderId = value;
          if (key === 'downloader') metadata.downloaderId = value;
          if (key === 'user') metadata.userId = value;
        }
      }
    }

    return metadata;
  } catch (error) {
    console.error('[ExifService] Failed to read EXIF:', error);
    return null;
  }
}
