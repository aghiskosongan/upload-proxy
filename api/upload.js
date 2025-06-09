import formidable from 'formidable';
import fs from 'fs';
import https from 'https';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err || !files.file || !files.file[0]) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = files.file[0];
    let buffer;
    try {
      buffer = fs.readFileSync(file.filepath);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to read file' });
    }

    // Dapatkan server Gofile aktif
    let server;
    try {
      const serverRes = await fetch("https://api.gofile.io/v1/getServer");
      const serverJson = await serverRes.json();
      server = serverJson.data.server;
    } catch (e) {
      return res.status(500).json({ error: 'Failed to get Gofile server' });
    }

    const boundary = '----FormBoundary' + Math.random().toString(16).slice(2);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.originalFilename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    try {
      const response = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: `${server}.gofile.io`,
          path: '/uploadFile',
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length,
          },
        }, res => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.write(body);
        req.end();
      });

      const result = JSON.parse(response);
      const url = result?.data?.downloadPage;

      if (!url) {
        return res.status(500).json({ error: 'Upload failed', raw: result });
      }

      return res.status(200).json({
        filename: file.originalFilename,
        url: url
      });

    } catch (e) {
      console.error("❌ Upload failed:", e);
      return res.status(500).json({ error: 'Upload failed', detail: e.message });
    }
  });
}
