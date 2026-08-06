export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

export async function uploadToCloudinary(
  file: File,
  cloudName: string,
  uploadPreset: string,
  publicId?: string
): Promise<CloudinaryUploadResult> {
  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary cloud name and upload preset are required. Configure them in Admin → Image Settings.');
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error(`"${file.name}" isn't a supported image type. Use JPEG, PNG, WebP, GIF, or AVIF.`);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)}MB — max is 10MB.`);
  }

  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', uploadPreset);
  // Append a timestamp so re-uploads always succeed — unsigned presets don't allow overwriting the same public_id
  if (publicId) form.append('public_id', `${publicId}_${Date.now()}`);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Upload failed (${res.status})`);
  }

  return res.json();
}
