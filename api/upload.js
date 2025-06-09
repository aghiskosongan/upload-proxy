import formidable from 'formidable';
import fs from 'fs';
import https from 'https';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
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
    const buffer = fs.readFileSync(file.filepath);

    const boundary = '----WebKitFormBoundary' + Math.random().toString(16).slice(2);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.originalFilename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    try {
      const uploadRes = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'file.io',
          path: '/?expires=1d',
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length,
          }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              resolve(json);
            } catch (e) {
              console.error("❌ Failed to parse response from file.io:", data);
              reject(new Error("Invalid JSON from file.io"));
            }
          });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
      });

      if (!uploadRes.success || !uploadRes.link) {
        return res.status(500).json({ error: 'Upload to file.io failed', response: uploadRes });
      }

      return res.status(200).json({
        filename: file.originalFilename,
        url: uploadRes.link
      });

    } catch (e) {
      console.error("❌ Upload failed:", e);
      return res.status(500).json({ error: 'Upload failed', detail: e.message });
    }
  });
}
