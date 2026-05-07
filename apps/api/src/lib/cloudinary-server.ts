import crypto from 'node:crypto';

export async function uploadUrlToCloudinary(
  imageUrl: string,
  publicId?: string
): Promise<string | null> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    console.error('Cloudinary server credentials not fully configured');
    return null;
  }

  const timestamp = Math.round(new Date().getTime() / 1000).toString();
  
  // Parameters to sign
  const params: Record<string, string> = {
    timestamp,
  };
  if (publicId) params.public_id = publicId;

  // Create signature
  const paramString = Object.keys(params)
    .sort()
    .map(key => \`\${key}=\${params[key]}\`)
    .join('&') + apiSecret;
  
  const signature = crypto.createHash('sha1').update(paramString).digest('hex');

  const formData = new FormData();
  formData.append('file', imageUrl);
  formData.append('api_key', apiKey);
  formData.append('timestamp', timestamp);
  formData.append('signature', signature);
  if (publicId) formData.append('public_id', publicId);

  try {
    const response = await fetch(\`https://api.cloudinary.com/v1_1/\${cloudName}/image/upload\`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(\`Cloudinary error: \${errorData.error?.message || response.statusText}\`);
    }

    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error(\`Error uploading to Cloudinary from URL "\${imageUrl}":\`, error);
    return null;
  }
}
