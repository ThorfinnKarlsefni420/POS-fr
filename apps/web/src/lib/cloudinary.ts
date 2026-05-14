export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
}

export async function uploadToCloudinary(
  file: File,
  cloudName: string,
  uploadPreset: string,
  publicId?: string
): Promise<CloudinaryUploadResult> {
  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary cloud name and upload preset are required. Configure them in Admin → Image Settings.');
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
