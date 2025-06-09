import formidable from 'formidable';
import fs from 'fs';
import https from 'https';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // ✅ CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  // ✅ CORS global
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

    try {
      // 🔄 Ambil server dari Gofile
      const serverRes = await fetch('https://api.gofile.io/v1/server');
      const serverJson = await serverRes.json();
      const server = serverJson.data?.server;

      if (!server) {
        return res.status(500).json({ error: 'Failed to get Gofile server' });
      }

      const boundary = '----WebKitFormBoundary' + Math.random().toString(16).slice(2);
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.originalFilename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
        buffer,
        Buffer.from(`\r\n--${boundary}--\r\n`)
      ]);

      const uploadRes = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: `${server}.gofile.io`,
          path: '/uploadFile',
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length
          }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              resolve(json);
            } catch (e) {
              reject(new Error('Failed to parse upload response'));
            }
          });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
      });

      const url = uploadRes?.data?.downloadPage;
      if (!url) {
        return res.status(500).json({ error: 'No URL returned from Gofile' });
      }

      return res.status(200).json({
        filename: file.originalFilename,
        url: url
      });

    } catch (e) {
      console.error('❌ Upload failed:', e);
      return res.status(500).json({ error: 'Upload failed' });
    }
  });
}
